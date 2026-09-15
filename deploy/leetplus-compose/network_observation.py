"""Small, read-only observation record for the Compose provider-set refresh.

This module deliberately has no command-line entry point and never changes
iptables, ipset, DNS, services, or network state.  It only reads the two
already-managed ipsets and, when called by the root control plane, persists a
bounded aggregate record without provider addresses.
"""

import json
import os
import re
import secrets
import stat
from pathlib import Path


OBSERVATION_PATH = Path("/var/lib/leetplus-compose/network-refresh.json")
ROOT_UID = 0
MAX_RECORD_BYTES = 8192
SET_NAMES = ("lp_leetplus_https", "lp_leetplus_smtp")
MEMBER_TTL = re.compile(
    r"^\s*(?:[0-9]{1,3}\.){3}[0-9]{1,3}\s+timeout\s+([0-9]{1,10})\s*$"
)
TIME_VALUE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]{1,40}Z$")
REASON_CODE = re.compile(r"^[A-Z0-9_]{1,64}$")
RESULTS = frozenset(("UNAVAILABLE", "AT_RISK", "DEGRADED", "HEALTHY"))


def capture_provider_sets(call):
    """Return bounded TTL/count aggregates from the managed provider ipsets.

    ``call`` has the same shape as ``subprocess.run`` and must return a
    CompletedProcess-like object.  Command errors and malformed output are
    represented as an unavailable set rather than raised.
    """

    captured = []
    for name in SET_NAMES:
        try:
            result = call(["/usr/sbin/ipset", "list", name], check=False)
            output = result.stdout if getattr(result, "returncode", 1) == 0 else ""
            if not isinstance(output, str):
                output = ""
        except Exception:
            output = ""

        ttls = []
        members = False
        for line in output.splitlines():
            if line.strip() == "Members:":
                members = True
                continue
            if not members:
                continue
            matched = MEMBER_TTL.fullmatch(line)
            if matched is not None:
                ttl = int(matched.group(1))
                if ttl <= 3600:
                    ttls.append(ttl)
        captured.append(
            {
                "name": name,
                "count": len(ttls),
                "minTtlSeconds": min(ttls) if ttls else None,
            }
        )
    return captured


def classify_freshness(sets, last_result=None):
    """Classify aggregate provider-set health without consuming raw addresses."""

    if not isinstance(sets, list) or len(sets) != len(SET_NAMES):
        return "UNAVAILABLE"
    expected = set(SET_NAMES)
    observed = set()
    minimums = []
    for item in sets:
        if not isinstance(item, dict) or set(item) != {"name", "count", "minTtlSeconds"}:
            return "UNAVAILABLE"
        name = item["name"]
        count = item["count"]
        ttl = item["minTtlSeconds"]
        if name not in expected or name in observed or type(count) is not int or count <= 0:
            return "UNAVAILABLE"
        if type(ttl) is not int or ttl < 0 or ttl > 3600:
            return "UNAVAILABLE"
        observed.add(name)
        minimums.append(ttl)
    if observed != expected:
        return "UNAVAILABLE"
    if min(minimums) <= 900:
        return "AT_RISK"
    if last_result == "FAILED":
        return "DEGRADED"
    return "HEALTHY"


def _effective_uid():
    getter = getattr(os, "geteuid", None)
    return getter() if getter is not None else None


def _require_root():
    if _effective_uid() != ROOT_UID:
        raise PermissionError("Root control plane required")


def _assert_secure_ancestors(path):
    parent = path.parent
    while True:
        info = os.lstat(parent)
        if (
            stat.S_ISLNK(info.st_mode)
            or not stat.S_ISDIR(info.st_mode)
            or info.st_uid != ROOT_UID
            or info.st_mode & 0o022
        ):
            raise ValueError("Unsafe observation ancestor")
        if parent == parent.parent:
            return
        parent = parent.parent


def _assert_secure_file(path):
    info = os.lstat(path)
    if (
        stat.S_ISLNK(info.st_mode)
        or not stat.S_ISREG(info.st_mode)
        or info.st_uid != ROOT_UID
        or info.st_nlink != 1
        or stat.S_IMODE(info.st_mode) != 0o600
        or info.st_size > MAX_RECORD_BYTES
    ):
        raise ValueError("Unsafe observation file")
    return info


def _validate_record(value):
    if not isinstance(value, dict) or set(value) != {"time", "result", "reasonCode", "sets"}:
        raise ValueError("Observation record has unexpected fields")
    if not isinstance(value["time"], str) or not TIME_VALUE.fullmatch(value["time"]):
        raise ValueError("Observation time is invalid")
    if value["result"] not in RESULTS:
        raise ValueError("Observation result is invalid")
    if not isinstance(value["reasonCode"], str) or not REASON_CODE.fullmatch(value["reasonCode"]):
        raise ValueError("Observation reason code is invalid")
    sets = value["sets"]
    if not isinstance(sets, list) or len(sets) != 2 or {item.get("name") for item in sets if isinstance(item, dict)} != set(SET_NAMES):
        raise ValueError("Observation provider counters are invalid")
    for item in sets:
        if not isinstance(item, dict) or set(item) != {"name", "count", "minTtlSeconds"} or type(item["count"]) is not int or not 0 <= item["count"] <= 512:
            raise ValueError("Observation provider counters are invalid")
        ttl = item["minTtlSeconds"]
        if (item["count"] == 0 and ttl is not None) or (item["count"] > 0 and (type(ttl) is not int or not 0 <= ttl <= 3600)):
            raise ValueError("Observation provider counters are invalid")
    return value


def _canonical_bytes(value):
    _validate_record(value)
    encoded = (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    if len(encoded) > MAX_RECORD_BYTES:
        raise ValueError("Observation record exceeds the byte bound")
    return encoded


def write_observation(value):
    """Atomically replace the fixed root-only aggregate observation record."""

    _require_root()
    path = OBSERVATION_PATH
    _assert_secure_ancestors(path)
    if path.exists() or path.is_symlink():
        _assert_secure_file(path)
    payload = _canonical_bytes(value)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{secrets.token_hex(12)}.tmp")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    descriptor = None
    directory_descriptor = None
    try:
        descriptor = os.open(temporary, flags, 0o600)
        with os.fdopen(descriptor, "wb", closefd=False) as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.fchmod(descriptor, 0o600)
        os.close(descriptor)
        descriptor = None
        os.replace(temporary, path)
        _assert_secure_file(path)
        # Directory fsync is the Linux durability barrier for the rename.  The
        # control plane is Linux-only; Windows cannot open a directory this way
        # and is supported only for the pure parser/unit-test surface.
        if os.name != "nt":
            directory_descriptor = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
            os.fsync(directory_descriptor)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if directory_descriptor is not None:
            os.close(directory_descriptor)
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
    return value


def read_observation():
    """Read the fixed aggregate record, returning None only when it is absent."""

    _require_root()
    path = OBSERVATION_PATH
    _assert_secure_ancestors(path)
    try:
        _assert_secure_file(path)
    except FileNotFoundError:
        return None
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as handle:
        raw = handle.read(MAX_RECORD_BYTES + 1)
    if len(raw) > MAX_RECORD_BYTES:
        raise ValueError("Observation record exceeds the byte bound")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("Observation record is malformed") from error
    _validate_record(value)
    if _canonical_bytes(value) != raw:
        raise ValueError("Observation record is not canonical")
    return value
