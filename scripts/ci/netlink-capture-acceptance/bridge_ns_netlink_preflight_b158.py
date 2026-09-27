"""Read-only Branch-2 netlink diagnostic preflight P.

P is deliberately not a launcher.  It cannot create an operation root, run a
command, or accept a GO.  A separately reviewed dispatcher D may later pin P
and D receipts; P only pins D's full source SHA once that source is admitted.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path

CONTRACT = "LEETPLUS_BRIDGE_NS_NETLINK_PREFLIGHT_V1"
DECISION = "OBSERVED_NOT_AUTHORIZATION"
OLD_OPERATION = "9afc7218-4757-4f44-87e1-6096706bad44"
OLD_ROOT = "/run/leetplus-browser-ns-probe"
OLD_INTENT = f"{OLD_ROOT}/{OLD_OPERATION}/intent.json"
NEW_ROOT_PREFIX = "/run/leetplus-browser-netlink-diagnostic-"
HASH = re.compile(r"[a-f0-9]{64}\Z")
UUID = re.compile(r"[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z")
TRUSTED_DIAGNOSTIC_DISPATCHER_SOURCE_SHA256 = "73801b0d24b5896eaf327a64be5f79c6d04f3fb16fca3310d40ccd9942dcc919"
EXPECTED_MACHINE_ID_SHA256 = "de72d444d9266e6c4f1ac7e76f0d4e4e0866ca1da4aa0a7f2808835fa3bd3423"
EXPECTED_PYTHON_SHA256 = "52e0a13e60a981d8c4b6478be2ba5176f69da07948a056bf49cf6f077e30cb41"
EXPECTED_UNSHARE_SHA256 = "41c65e55107cbbb1a1f6994784a938dd7dbbe255d1fea6b7a58ec96eabe382ef"
EXPECTED_BOOT_ID = "4bbc3488-6a9b-49b1-becf-db0d784464f0"
EXPECTED_PYTHON_LINK_TARGET = "python3.14"
OLD_INTENT_SHA256 = "883876cbe4f35eeca33afe45519e6668c40bc2469f2547f6b3f232f93dbb6b47"


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def demand(condition, message):
    if not condition:
        raise ValueError(message)


def protected_metadata(path, maximum=32 * 1024 * 1024):
    path = Path(path); before = os.lstat(path)
    parent = path.parent
    while True:
        info = parent.lstat(); demand(info.st_uid == 0 and not info.st_mode & 0o022 and not stat.S_ISLNK(info.st_mode), "protected ancestor differs")
        if parent == parent.parent: break
        parent = parent.parent
    demand(stat.S_ISREG(before.st_mode) and not stat.S_ISLNK(before.st_mode) and before.st_nlink == 1 and before.st_uid == 0 and not before.st_mode & 0o022 and 0 < before.st_size <= maximum, "protected tool/source differs")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(descriptor); raw = os.read(descriptor, opened.st_size + 1); after = os.fstat(descriptor); current = os.lstat(path)
        ident = lambda info: (info.st_dev, info.st_ino, info.st_uid, info.st_mode, info.st_nlink, info.st_size, info.st_mtime_ns)
        demand(stat.S_ISREG(opened.st_mode) and opened.st_uid == 0 and opened.st_nlink == 1 and not opened.st_mode & 0o022 and len(raw) == opened.st_size and ident(before) == ident(opened) == ident(after) == ident(current), "protected tool changed during read")
        return {"device": opened.st_dev, "inode": opened.st_ino, "uid": opened.st_uid, "mode": opened.st_mode & 0o777, "nlink": opened.st_nlink, "size": opened.st_size, "mtimeNs": opened.st_mtime_ns, "sha256": digest(raw)}
    finally:
        os.close(descriptor)


def protected_hash(path, maximum=32 * 1024 * 1024):
    return protected_metadata(path, maximum)["sha256"]


def protected_python_hash(path="/usr/bin/python3", *, expected_target=EXPECTED_PYTHON_LINK_TARGET):
    demand(expected_target is not None and isinstance(expected_target, str) and expected_target, "HOLD: Python symlink target is not pinned")
    parent = Path(path).parent.lstat(); link_before = os.lstat(path); link = os.readlink(path)
    demand(parent.st_uid == 0 and not parent.st_mode & 0o022 and not stat.S_ISLNK(parent.st_mode) and link_before.st_uid == 0 and link_before.st_nlink == 1 and link == expected_target and stat.S_ISLNK(link_before.st_mode), "Python symlink target differs")
    target = Path(link) if Path(link).is_absolute() else Path(path).parent / link
    demand(not target.is_symlink(), "Python target must be one regular hop")
    parent = target.parent.lstat()
    demand(parent.st_uid == 0 and not parent.st_mode & 0o022, "Python target parent is unsafe")
    result = protected_hash(target)
    link_after = os.lstat(path)
    identity = lambda info: (info.st_dev, info.st_ino, info.st_uid, info.st_mode, info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
    demand(link_after.st_nlink == 1 and identity(link_before) == identity(link_after) and os.readlink(path) == link, "Python symlink changed during target hash")
    return result


def file_state(path):
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        return {"exists": False}
    value = {"exists": True, "kind": "directory" if stat.S_ISDIR(info.st_mode) else "file" if stat.S_ISREG(info.st_mode) else "other", "device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid, "mode": info.st_mode & 0o777, "nlink": info.st_nlink, "symlink": stat.S_ISLNK(info.st_mode)}
    if stat.S_ISREG(info.st_mode): value.update(protected_metadata(path))
    return value


def live_facts(new_root, *, state=file_state, hash_file=protected_hash, read_file=None):
    read_file = read_file or (lambda value: Path(value).read_bytes())
    run = state("/run")
    demand(run.get("exists") and run.get("kind") == "directory" and run.get("uid") == 0 and run.get("mode") == 0o755 and not run.get("symlink") and isinstance(run.get("device"), int) and isinstance(run.get("inode"), int), "/run identity differs")
    machine = read_file("/etc/machine-id").strip()
    boot = read_file("/proc/sys/kernel/random/boot_id").decode().strip()
    return {"platform": sys.platform, "euid": os.geteuid(), "machineIdSha256": digest(machine), "bootId": boot, "pythonSha256": protected_python_hash(), "unshareSha256": hash_file("/usr/bin/unshare"), "run": run, "newRoot": state(new_root), "oldRoot": state(OLD_ROOT), "oldIntent": state(OLD_INTENT)}


def build_preflight(operation_id, dispatcher_source_sha256, facts, captured_at):
    demand(TRUSTED_DIAGNOSTIC_DISPATCHER_SOURCE_SHA256 is not None and HASH.fullmatch(TRUSTED_DIAGNOSTIC_DISPATCHER_SOURCE_SHA256), "HOLD: reviewed diagnostic dispatcher D source SHA is not pinned")
    demand(UUID.fullmatch(operation_id) and operation_id != OLD_OPERATION, "new operation UUID distinct from UUID9afc required")
    demand(dispatcher_source_sha256 == TRUSTED_DIAGNOSTIC_DISPATCHER_SOURCE_SHA256, "diagnostic dispatcher D source SHA differs from reviewed pin")
    new_root = f"{NEW_ROOT_PREFIX}{operation_id}"
    demand(facts.get("platform") == "linux" and facts.get("euid") == 0 and facts.get("machineIdSha256") == EXPECTED_MACHINE_ID_SHA256 and facts.get("bootId") == EXPECTED_BOOT_ID, "host or boot identity differs")
    demand(facts.get("pythonSha256") == EXPECTED_PYTHON_SHA256 and facts.get("unshareSha256") == EXPECTED_UNSHARE_SHA256, "exact host tool hash differs")
    run = facts.get("run", {})
    demand(run.get("exists") and run.get("kind") == "directory" and run.get("uid") == 0 and run.get("mode") == 0o755 and not run.get("symlink") and isinstance(run.get("device"), int) and isinstance(run.get("inode"), int), "/run boundary differs")
    demand(facts.get("newRoot") == {"exists": False}, "new exact operation root is not absent")
    old_root, old_intent = facts.get("oldRoot", {}), facts.get("oldIntent", {})
    demand(old_root.get("exists") and old_root.get("kind") == "directory" and old_root.get("uid") == 0 and old_root.get("mode") == 0o700 and not old_root.get("symlink") and old_intent.get("exists") and old_intent.get("kind") == "file" and old_intent.get("uid") == 0 and old_intent.get("mode") == 0o400 and old_intent.get("nlink") == 1 and old_intent.get("sha256") == OLD_INTENT_SHA256 and not old_intent.get("symlink"), "historical UUID9afc root/intent must remain untouched")
    demand(isinstance(captured_at, str) and captured_at.endswith("Z") and dt.datetime.fromisoformat(captured_at.replace("Z", "+00:00")).utcoffset() == dt.timedelta(0), "capturedAt must be UTC")
    return {"schemaVersion": 1, "contract": CONTRACT, "decision": DECISION, "capturedAt": captured_at, "operationId": operation_id, "diagnosticDispatcherSourceSha256": dispatcher_source_sha256, "host": {key: facts[key] for key in ("machineIdSha256", "bootId", "pythonSha256", "unshareSha256")}, "run": run, "newRoot": new_root, "historical": {"operationId": OLD_OPERATION, "root": OLD_ROOT, "intent": OLD_INTENT, "rootIdentity": old_root, "intentIdentity": old_intent}, "nativeLockCheckedBy": "SEPARATE_LAUNCHER_OR_FULL_BASELINE", "effectsPerformed": False}


def collect_preflight(operation_id, dispatcher_source_path):
    """Production read-only collection; no source/hash/facts override is accepted."""
    demand(TRUSTED_DIAGNOSTIC_DISPATCHER_SOURCE_SHA256 is not None, "HOLD: reviewed diagnostic dispatcher D source SHA is not pinned")
    dispatcher_source_sha256 = protected_hash(dispatcher_source_path)
    new_root = f"{NEW_ROOT_PREFIX}{operation_id}"
    return build_preflight(operation_id, dispatcher_source_sha256, live_facts(new_root), dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"))


def validate_fresh_for_launcher(receipt, now, boot_id):
    demand(receipt.get("contract") == CONTRACT and receipt.get("decision") == DECISION and receipt.get("host", {}).get("bootId") == boot_id, "preflight receipt boot/contract differs")
    captured = dt.datetime.fromisoformat(receipt.get("capturedAt", "").replace("Z", "+00:00")); demand(captured.tzinfo and captured <= now and now - captured <= dt.timedelta(seconds=5), "preflight receipt is future or stale")
    return receipt


def main():
    raise SystemExit("HOLD_DIRECT_CLI_DISABLED: preflight P is imported by a separately reviewed dispatcher only")


if __name__ == "__main__":
    main()
