"""Source candidate: fixed one-shot diagnostic capture, never isolation PASS.

Passed hashes are Windows-runner provenance. This helper does not authenticate
chat GO, and its source existence grants no permission to execute it.
"""
from __future__ import annotations
import argparse
import base64
import datetime as dt
import hashlib
import json
import os
import re
import selectors
import signal
import stat
import subprocess
import sys
import time
import types
from pathlib import Path
try:
    import fcntl
except ImportError:
    fcntl = None

UUID = "c0a90d53-5f55-4825-89e3-16343a861a85"
STAGE_SHA = "828cc35c78df40d061c6f2330ed9143d9a6e09b9fc900f2c161029e7177c8e0a"
D_SHA = "73801b0d24b5896eaf327a64be5f79c6d04f3fb16fca3310d40ccd9942dcc919"
P_SHA = "b158a288a3b8df29212c6d0f86888d8b2874004d38a50b3f359a472cd933381a"
CHILD_COMMAND_SHA = "a1bedb0b7fa9858516800978b548e922e334390d49776ccb7d997e3bbed90272"
BOOT = "4bbc3488-6a9b-49b1-becf-db0d784464f0"
HOST = "de72d444d9266e6c4f1ac7e76f0d4e4e0866ca1da4aa0a7f2808835fa3bd3423"
ACTIVE = "681838ce8eaad625fa08231d722532e82e595a1c0207b931f12e3fb0406e52bd"
CONTROLLER = "/usr/local/lib/leetplus-compose/b0cbf3a4f302b299762fa055f3bffe0376a91182/control.sh"
CODE_ROOT = Path("/run/leetplus-browser-netlink-code-" + UUID)
OP_ROOT = Path("/run/leetplus-browser-netlink-diagnostic-" + UUID)
OLD_ROOT = Path("/run/leetplus-browser-ns-probe")
OLD_OP = OLD_ROOT / "9afc7218-4757-4f44-87e1-6096706bad44"
OLD_CODE_SHA = "7e03e03f1b13037e45dfb06a817e45a8d9ceca417108282b5c8f17fd8d3909d7"
OLD_INTENT_SHA = "883876cbe4f35eeca33afe45519e6668c40bc2469f2547f6b3f232f93dbb6b47"
LOCK = Path("/var/lib/leetplus-compose/control.lock")
HASH = re.compile(r"[a-f0-9]{64}\Z")
KEYS = {"schemaVersion", "operationId", "stageSourceSha256", "stageReceiptSha256",
        "captureSourceSha256", "planSha256", "goReceiptSha256", "codeRootInode",
        "dInode", "pInode", "fullBaselineReceiptSha256", "fullBaselineCapturedAt"}
PATHS = {"codeRoot": str(CODE_ROOT), "operationRoot": str(OP_ROOT),
         "intent": str(OP_ROOT / "intent.json"), "terminal": str(OP_ROOT / "terminal.json")}
ENVELOPE_KEYS = {"schemaVersion", "contract", "decision", "operationId", "paths",
                 "startedAt", "completedAt", "lineage", "preflight", "lock",
                 "childTrace", "derivedDiagnostic", "launchResult", "errorCategory",
                 "isolationPassClaimed", "leetplusApplicationWrites",
                 "externalNetworkConnectionsAttempted", "localAfNetlinkQueryObserved"}


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def utc(value):
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{6})?Z", value), "canonical UTC Z required")
    parsed = dt.datetime.fromisoformat(value[:-1] + "+00:00")
    require(parsed.isoformat().replace("+00:00", "Z") == value, "noncanonical UTC")
    return parsed


def parse_binding(encoded):
    require(isinstance(encoded, str) and len(encoded) <= 11000, "binding bound")
    raw = base64.b64decode(encoded, validate=True)
    require(len(raw) <= 8192 and base64.b64encode(raw).decode() == encoded, "canonical base64 required")
    value = json.loads(raw)
    require(isinstance(value, dict) and set(value) == KEYS and raw == canonical(value), "canonical exact binding keys required")
    require(type(value["schemaVersion"]) is int and value["schemaVersion"] == 1 and value["operationId"] == UUID and value["stageSourceSha256"] == STAGE_SHA, "fixed binding differs")
    for key in KEYS - {"schemaVersion", "operationId", "codeRootInode", "dInode", "pInode", "fullBaselineCapturedAt"}:
        require(isinstance(value[key], str) and HASH.fullmatch(value[key]), "full lowercase SHA required")
    for key in ("codeRootInode", "dInode", "pInode"):
        require(type(value[key]) is int and value[key] > 0, "positive inode required")
    utc(value["fullBaselineCapturedAt"])
    return value, raw


def validate_baseline_fresh(binding, now):
    captured = utc(binding["fullBaselineCapturedAt"])
    require(captured <= now and now - captured <= dt.timedelta(seconds=60), "full baseline future or stale")


def info_id(info):
    return (info.st_dev, info.st_ino, info.st_uid, info.st_mode, info.st_nlink, info.st_size, info.st_mtime_ns)


def protected_read(path, maximum):
    before = Path(path).lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and before.st_nlink == 1 and not before.st_mode & 0o022 and 0 < before.st_size <= maximum, "protected metadata differs")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        require(info_id(before) == info_id(opened), "protected opened inode differs")
        raw = bytearray()
        while len(raw) <= maximum:
            block = os.read(fd, min(65536, maximum + 1 - len(raw)))
            if not block:
                break
            raw.extend(block)
        require(len(raw) == opened.st_size and info_id(before) == info_id(os.fstat(fd)) == info_id(Path(path).lstat()), "protected read changed")
        return bytes(raw), {"device": before.st_dev, "inode": before.st_ino, "uid": 0,
                            "mode": oct(before.st_mode & 0o7777), "nlink": 1,
                            "size": before.st_size, "sha256": digest(raw)}
    finally:
        os.close(fd)


def exact_leaf(path, sha, inode, size=None):
    raw, meta = protected_read(path, 1024 * 1024)
    require(meta["mode"] == "0o400" and meta["inode"] == inode and meta["sha256"] == sha and (size is None or meta["size"] == size), "protected leaf pin differs")
    return raw, meta


def entries_capped(path, maximum):
    names = []
    with os.scandir(path) as iterator:
        for entry in iterator:
            names.append(entry.name)
            require(len(names) <= maximum, "directory count bound")
    return sorted(names)


def private_dir(path, inode=None):
    info = Path(path).lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and info.st_mode & 0o7777 == 0o700 and (inode is None or info.st_ino == inode), "private directory differs")
    return {"device": info.st_dev, "inode": info.st_ino, "uid": 0, "mode": "0o700"}


def absent(path):
    try:
        Path(path).lstat()
    except FileNotFoundError:
        return True
    return False


def validate_staged(binding):
    root = private_dir(CODE_ROOT, binding["codeRootInode"])
    require(entries_capped(CODE_ROOT, 3) == ["bridge_ns_netlink_diagnostic.py", "bridge_ns_netlink_preflight.py"], "exact two source leaves required")
    d_raw, d_meta = exact_leaf(CODE_ROOT / "bridge_ns_netlink_diagnostic.py", D_SHA, binding["dInode"], 10004)
    p_raw, p_meta = exact_leaf(CODE_ROOT / "bridge_ns_netlink_preflight.py", P_SHA, binding["pInode"], 9818)
    require(root == private_dir(CODE_ROOT, binding["codeRootInode"]) and entries_capped(CODE_ROOT, 3) == ["bridge_ns_netlink_diagnostic.py", "bridge_ns_netlink_preflight.py"], "source root changed")
    require(d_meta["device"] == p_meta["device"] == root["device"], "source device differs")
    modules = []
    for name, raw in (("D", d_raw), ("P", p_raw)):
        module = types.ModuleType("netlink_capture_verified_" + name)
        module.__file__ = str(CODE_ROOT / ("bridge_ns_netlink_diagnostic.py" if name == "D" else "bridge_ns_netlink_preflight.py"))
        exec(compile(raw, module.__file__, "exec"), module.__dict__)
        modules.append(module)
    require(digest(canonical(modules[0].CHILD_COMMAND)) == CHILD_COMMAND_SHA, "reviewed fixed command differs")
    return modules[0], modules[1], {"root": root, "D": d_meta, "P": p_meta}


def old_audit():
    root = private_dir(OLD_ROOT, 34620478)
    operation = private_dir(OLD_OP)
    require(entries_capped(OLD_ROOT, 3) == [OLD_OP.name, "bridge_ns_unix_probe_7e03.py"] and entries_capped(OLD_OP, 2) == ["intent.json"], "old audit entries differ")
    _, code = exact_leaf(OLD_ROOT / "bridge_ns_unix_probe_7e03.py", OLD_CODE_SHA, 34621704, 11235)
    _, intent = exact_leaf(OLD_OP / "intent.json", OLD_INTENT_SHA, 34622287)
    require(root == private_dir(OLD_ROOT, 34620478) and operation == private_dir(OLD_OP), "old audit root changed")
    return {"root": root, "operation": operation, "code": code, "intent": intent}


def quick_live(lock_fd=None, before=None):
    require(sys.platform == "linux" and os.geteuid() == 0 and os.uname().nodename == "1337s", "fixed Linux host required")
    require(digest(Path("/etc/machine-id").read_bytes().strip()) == HOST and Path("/proc/sys/kernel/random/boot_id").read_text().strip() == BOOT, "host/boot differs")
    run = Path("/run").lstat()
    require(stat.S_ISDIR(run.st_mode) and run.st_uid == 0 and run.st_mode & 0o7777 == 0o755, "/run differs")
    require(str(Path("/usr/local/sbin/leetplus-compose").resolve(strict=True)) == CONTROLLER, "serving controller differs")
    active, _ = protected_read("/var/lib/leetplus-compose/active.json", 1024 * 1024)
    require(digest(active) == ACTIVE and absent("/var/lib/leetplus-compose/control-handoff.pending.json"), "active/pending differs")
    audit = old_audit()
    require(absent(OP_ROOT), "operation root already present; no replay")
    value = {"bootId": BOOT, "runDevice": run.st_dev, "runInode": run.st_ino, "oldAudit": audit}
    if before is not None:
        require(value == before, "prewrite live continuity differs")
    if lock_fd is not None:
        info = LOCK.lstat()
        require(info_id(info) == info_id(os.fstat(lock_fd)), "native lock pathname changed")
    return value


def before_lock(p, binding):
    validate_baseline_fresh(binding, dt.datetime.now(dt.timezone.utc))
    facts = quick_live()
    require(p.protected_python_hash() == p.EXPECTED_PYTHON_SHA256 and p.protected_hash("/usr/bin/unshare") == p.EXPECTED_UNSHARE_SHA256, "pinned tools differ")
    require(os.path.realpath(sys.executable) == "/usr/bin/python3.14", "capture interpreter differs")
    capacity = os.statvfs("/")
    require(capacity.f_bavail * capacity.f_frsize >= 40 * 1024**3, "capacity below 40GiB")
    validate_baseline_fresh(binding, dt.datetime.now(dt.timezone.utc))
    return facts


def acquire_lock():
    require(fcntl is not None, "Linux flock required")
    info = LOCK.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and not info.st_mode & 0o022, "native lock differs")
    fd = os.open(LOCK, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        require(info_id(info) == info_id(os.fstat(fd)), "native lock changed")
        fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        return fd, {"device": info.st_dev, "inode": info.st_ino}
    except BaseException:
        os.close(fd)
        raise


def collect_p(p):
    start = time.monotonic()
    facts = p.live_facts(str(OP_ROOT))
    receipt = p.build_preflight(UUID, D_SHA, facts, utc_now())
    require(canonical(receipt) == canonical(p.build_preflight(UUID, D_SHA, facts, receipt["capturedAt"])), "full P fields differ")
    p.validate_fresh_for_launcher(receipt, dt.datetime.now(dt.timezone.utc), BOOT)
    require(time.monotonic() - start <= 5, "P monotonic freshness exceeded")
    return receipt, start


def proc_identity(pid):
    fd = os.open(f"/proc/{pid}/stat", os.O_RDONLY | os.O_NOFOLLOW)
    try:
        raw = os.read(fd, 4097)
    finally:
        os.close(fd)
    require(len(raw) <= 4096, "proc stat bound")
    text = raw.decode()
    end = text.rfind(")")
    fields = text[end + 2:].split()
    require(end > 0 and int(text[:text.find(" ")]) == pid and len(fields) > 19, "proc stat malformed")
    return {"pid": pid, "pgrp": int(fields[2]), "session": int(fields[3]), "starttime": int(fields[19])}


def scan_pgrp(pgrp):
    deadline = time.monotonic() + 2
    members = []
    count = 0
    with os.scandir("/proc") as iterator:
        for entry in iterator:
            require(time.monotonic() <= deadline, "residue scan timeout")
            if not entry.name.isdigit():
                continue
            count += 1
            require(count <= 4096, "residue PID bound")
            try:
                item = proc_identity(int(entry.name))
            except (FileNotFoundError, ProcessLookupError):
                continue
            if item["pgrp"] == pgrp:
                members.append(item)
    return {"complete": True, "members": members}


def empty_trace():
    value = {"spawnAttempted": False, "spawned": False, "pid": None, "processGroupId": None,
             "leaderStartTicks": None, "identityConfirmed": False, "startedAt": None,
             "completedAt": None, "exitCode": None, "signal": None, "timedOut": False,
             "selectorInitialized": False, "killAttempted": False, "waitAttempted": False,
             "waitCompleted": False, "processGroupResidue": "UNKNOWN", "residueScanComplete": False,
             "childBudgetSeconds": 10, "killWaitBudgetSeconds": 5, "childElapsedSeconds": None,
             "killWaitElapsedSeconds": None, "residueScanElapsedSeconds": None,
             "errorCategory": None, "cleanupErrorCategory": None}
    for name in ("stdout", "stderr"):
        value.update({name + "Base64": "", name + "Sha256": digest(b""), name + "Bytes": 0,
                      name + "ObservedBytes": 0, name + "Complete": False, name + "Capped": False})
    return value


def run_bounded_child(command, trace=None):
    require(digest(canonical(command)) == CHILD_COMMAND_SHA, "fixed reviewed child command required")
    # Caller retains this object even if a finalizer is interrupted.
    trace = empty_trace() if trace is None else trace
    trace["spawnAttempted"] = True
    buffers = [bytearray(), bytearray()]
    observed = [0, 0]
    eof = [False, False]
    caps = [262144, 65536]
    capped = [False, False]
    process = selector = leader = None
    started = time.monotonic()
    deadline = started + 10
    previous_mask = None
    try:
        if hasattr(signal, "pthread_sigmask"):
            previous_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGALRM})
        try:
            process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                       stderr=subprocess.PIPE, start_new_session=True, close_fds=True)
            trace.update(spawned=True, pid=process.pid, processGroupId=process.pid, startedAt=utc_now())
            leader = proc_identity(process.pid)
            require(leader["pgrp"] == leader["session"] == process.pid, "spawned group identity differs")
            trace.update(identityConfirmed=True, leaderStartTicks=leader["starttime"])
        finally:
            if previous_mask is not None:
                # Process is already retained. A pending alarm enters the outer cleanup.
                signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
                previous_mask = None
        selector = selectors.DefaultSelector()
        for index, pipe in enumerate((process.stdout, process.stderr)):
            os.set_blocking(pipe.fileno(), False)
            selector.register(pipe, selectors.EVENT_READ, index)
        trace["selectorInitialized"] = True
        while selector.get_map():
            left = deadline - time.monotonic()
            if left <= 0:
                trace["timedOut"] = True
                raise TimeoutError("child deadline")
            for key, _ in selector.select(min(left, 0.1)):
                index = key.data
                try:
                    chunk = os.read(key.fileobj.fileno(), 65536)
                except BlockingIOError:
                    continue
                if not chunk:
                    eof[index] = True
                    selector.unregister(key.fileobj)
                    continue
                observed[index] += len(chunk)
                room = caps[index] - len(buffers[index])
                buffers[index].extend(chunk[:room])
                if len(chunk) > room:
                    capped[index] = True
                    raise OverflowError("child stream cap")
        left = deadline - time.monotonic()
        if left <= 0:
            trace["timedOut"] = True
            raise TimeoutError("child exit deadline")
        trace["waitAttempted"] = True
        trace["exitCode"] = process.wait(timeout=left)
        trace["waitCompleted"] = True
        require(trace["exitCode"] == 0 and not buffers[1], "child nonzero or stderr")
    except BaseException as error:
        trace["errorCategory"] = type(error).__name__
        if isinstance(error, subprocess.TimeoutExpired):
            trace["timedOut"] = True
    finally:
        cleanup_mask = None
        if hasattr(signal, "pthread_sigmask"):
            try:
                cleanup_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGALRM})
            except BaseException as error:
                trace["cleanupErrorCategory"] = type(error).__name__
        trace["childElapsedSeconds"] = time.monotonic() - started
        cleanup_start = time.monotonic()
        cleanup_deadline = cleanup_start + 5
        if process is not None:
            try:
                # poll/wait targets our retained direct child; group signals need live continuity.
                if process.poll() is None:
                    if leader is not None and trace["identityConfirmed"]:
                        current = proc_identity(process.pid)
                        require(current == leader and current["pgrp"] == process.pid, "PID/group continuity unknown")
                        trace["killAttempted"] = True
                        os.killpg(process.pid, signal.SIGKILL)
                    trace["waitAttempted"] = True
                    left = cleanup_deadline - time.monotonic()
                    require(left > 0, "kill/wait deadline")
                    trace["exitCode"] = process.wait(timeout=left)
                    trace["waitCompleted"] = True
                elif not trace["waitCompleted"]:
                    trace["waitAttempted"] = True
                    trace["exitCode"] = process.wait(timeout=max(0, cleanup_deadline - time.monotonic()))
                    trace["waitCompleted"] = True
            except BaseException as error:
                trace["cleanupErrorCategory"] = type(error).__name__
            for obj in (selector, process.stdout, process.stderr):
                if obj is not None:
                    try:
                        obj.close()
                    except BaseException as error:
                        trace["cleanupErrorCategory"] = type(error).__name__
            if trace["waitCompleted"] and trace["identityConfirmed"]:
                scan_start = time.monotonic()
                try:
                    require(time.monotonic() < cleanup_deadline, "no residue scan budget")
                    residue = scan_pgrp(process.pid)
                    require(time.monotonic() <= cleanup_deadline, "residue exceeds cleanup budget")
                    trace["residueScanComplete"] = residue["complete"]
                    trace["processGroupResidue"] = bool(residue["members"]) if residue["complete"] else "UNKNOWN"
                except BaseException as error:
                    trace["cleanupErrorCategory"] = type(error).__name__
                trace["residueScanElapsedSeconds"] = time.monotonic() - scan_start
        if previous_mask is not None:
            try:
                signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
            except BaseException as error:
                trace["cleanupErrorCategory"] = type(error).__name__
        trace["killWaitElapsedSeconds"] = time.monotonic() - cleanup_start
        trace["completedAt"] = utc_now()
        if isinstance(trace["exitCode"], int) and trace["exitCode"] < 0:
            trace["signal"] = -trace["exitCode"]
        for index, name in enumerate(("stdout", "stderr")):
            raw = bytes(buffers[index])
            trace.update({name + "Base64": base64.b64encode(raw).decode(), name + "Sha256": digest(raw),
                          name + "Bytes": len(raw), name + "ObservedBytes": observed[index],
                          name + "Complete": eof[index] and not capped[index], name + "Capped": capped[index]})
        if cleanup_mask is not None:
            try:
                signal.pthread_sigmask(signal.SIG_SETMASK, cleanup_mask)
            except BaseException as error:
                # All observed trace and cleanup facts are already retained.
                trace["cleanupErrorCategory"] = type(error).__name__
    return trace


def clean_trace(trace):
    return (trace["spawned"] and trace["identityConfirmed"] and trace["waitCompleted"] and
            trace["exitCode"] == 0 and trace["stdoutComplete"] and trace["stderrComplete"] and
            trace["stderrBytes"] == 0 and not trace["stdoutCapped"] and not trace["stderrCapped"] and
            trace["residueScanComplete"] and trace["processGroupResidue"] is False and
            not trace["timedOut"] and trace["errorCategory"] is None and
            trace["cleanupErrorCategory"] is None and trace["childElapsedSeconds"] <= 10 and
            trace["killWaitElapsedSeconds"] <= 5)


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def open_private_root():
    fd = os.open(OP_ROOT, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        meta = private_dir(OP_ROOT)
        require(os.fstat(fd).st_ino == meta["inode"] and os.fstat(fd).st_dev == meta["device"], "operation fd differs")
        return fd, meta
    except BaseException:
        os.close(fd)
        raise


def write_exclusive(root_fd, leaf, raw):
    require(leaf in ("intent.json", "terminal.json"), "exact audit leaf required")
    fd = os.open(leaf, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400, dir_fd=root_fd)
    try:
        # A terminal factory records the observed exclusive-create timestamp.
        if callable(raw):
            raw = raw()
        require(isinstance(raw, bytes) and len(raw) <= 2 * 1024 * 1024, "audit write bound")
        os.fchmod(fd, 0o400)
        view = memoryview(raw)
        while view:
            count = os.write(fd, view)
            require(count > 0, "short audit write")
            view = view[count:]
        os.fsync(fd)
    finally:
        os.close(fd)
    os.fsync(root_fd)
    return exact_leaf(OP_ROOT / leaf, digest(raw), os.stat(leaf, dir_fd=root_fd, follow_symlinks=False).st_ino)


def lineage(binding, source_meta, p_hash=None, intent_hash=None):
    value = {key: binding[key] for key in ("stageSourceSha256", "stageReceiptSha256", "captureSourceSha256", "planSha256", "goReceiptSha256", "fullBaselineReceiptSha256", "fullBaselineCapturedAt")}
    value.update(diagnosticSourceSha256=D_SHA, preflightSourceSha256=P_SHA,
                 codeRoot=source_meta["root"], diagnosticLeaf=source_meta["D"],
                 preflightLeaf=source_meta["P"], preflightReceiptSha256=p_hash, intentSha256=intent_hash)
    return value


def make_envelope(d, binding, source_meta, preflight, intent_hash, lock_info, trace, started, observed_at, error):
    launch = derived = None
    success = error is None and clean_trace(trace) and lock_info["released"] and lock_info["heldElapsedSeconds"] <= 22
    if success:
        raw = base64.b64decode(trace["stdoutBase64"], validate=True)
        launch = {"schemaVersion": 1, "contract": d.LAUNCH_RESULT_CONTRACT, "operationId": UUID,
                  "planSha256": binding["planSha256"], "diagnosticSourceSha256": D_SHA,
                  "launcherSourceSha256": binding["captureSourceSha256"],
                  "launcherPreflightSha256": digest(canonical(preflight)),
                  "hostNetNamespace": lock_info["hostNetNamespace"], "completedAt": observed_at,
                  "childExitCode": 0, "childStdoutSha256": digest(raw), "childStdoutBytes": len(raw),
                  "childStderrSha256": digest(b""), "childStderrBytes": 0,
                  "childCommandSha256": CHILD_COMMAND_SHA, "processGroupResidue": False,
                  "leetplusApplicationWrites": False, "interfaceEnumerationMethod": "socket.if_nameindex",
                  "localAfNetlinkLinkEnumerationPermitted": True, "localAfNetlinkQueryObserved": False,
                  "forbiddenConnectionFamiliesAttempted": [], "externalNetworkConnectionsAttempted": False,
                  "networkMutationRequested": False,
                  "effectsPerformed": ["CREATE_ROOT_PRIVATE_OPERATION", "WRITE_IMMUTABLE_INTENT", "SPAWN_BOUNDED_NETNS_CHILD", "WRITE_IMMUTABLE_TERMINAL"],
                  "auditWrites": {"root": {"path": str(OP_ROOT), "ownerUid": 0, "mode": "0700"},
                                  "intent": {"path": str(OP_ROOT / "intent.json"), "ownerUid": 0, "mode": "0400"},
                                  "terminal": {"path": str(OP_ROOT / "terminal.json"), "ownerUid": 0, "mode": "0400"}}}
        try:
            derived = d.build_terminal(launch, raw)
        except Exception as failure:
            success = False
            error = type(failure).__name__
            launch = derived = None
    value = {"schemaVersion": 1,
             "contract": "LEETPLUS_NETLINK_SUCCESS_ENVELOPE_V1" if success else "LEETPLUS_NETLINK_FAILURE_TERMINAL_V1",
             "decision": "DIAGNOSTIC_CAPTURED_NOT_ISOLATION_PASS" if success else "DIAGNOSTIC_FAILED_NO_RETRY",
             "operationId": UUID, "paths": PATHS, "startedAt": started, "completedAt": observed_at,
             "lineage": lineage(binding, source_meta, digest(canonical(preflight)), intent_hash),
             "preflight": preflight, "lock": lock_info, "childTrace": trace,
             "derivedDiagnostic": derived, "launchResult": launch, "errorCategory": None if success else (error or trace["errorCategory"] or trace["cleanupErrorCategory"] or "ChildTraceNotClean"),
             "isolationPassClaimed": False, "leetplusApplicationWrites": False,
             "externalNetworkConnectionsAttempted": False, "localAfNetlinkQueryObserved": False}
    require(set(value) == ENVELOPE_KEYS, "envelope shape differs")
    return value


def capture_once(encoded_binding):
    binding, _ = parse_binding(encoded_binding)
    started = utc_now()
    result = {"contract": "LEETPLUS_NETLINK_CAPTURE_PHASE_RESULT_V1", "operationId": UUID,
              "decision": "HOLD_BEFORE_CAPTURE", "paths": PATHS, "firstWriteDispatchAttempted": False,
              "effectProgressMarkers": [], "terminalPublished": False, "terminalSha256": None,
              "terminalMetadata": None, "errorCategory": None, "lock": None, "childTrace": empty_trace()}
    lock_fd = root_fd = None
    source_meta = preflight = intent_hash = None
    observed_at = started
    trace = empty_trace()
    old_handler = None
    lock_start = None
    lock_info = None
    error = None
    try:
        d, p, source_meta = validate_staged(binding)
        live = before_lock(p, binding)
        validate_baseline_fresh(binding, dt.datetime.now(dt.timezone.utc))
        lock_fd, lock_meta = acquire_lock()
        lock_start = time.monotonic()
        lock_info = {**lock_meta, "acquiredAt": utc_now(), "releasedAt": None, "released": False,
                     "heldElapsedSeconds": None, "hardHeldCeilingSeconds": 22, "prewriteBudgetSeconds": 3,
                     "prewriteElapsedSeconds": None, "preflightMonotonicAgeSeconds": None,
                     "preflightRecollections": 0, "lockHeldDuringChild": False,
                     "lockHeldDuringTerminalPublication": False, "observationCapturedAt": None,
                     "terminalPublishedAt": None, "publicationTimestampMeaning": "EXCLUSIVE_CREATE_BEFORE_FSYNC_COMPLETION",
                     "releaseErrorCategory": None, "finalChecks": None, "hostNetNamespace": None}
        require(signal.getitimer(signal.ITIMER_REAL) == (0.0, 0.0), "unexpected existing alarm")
        old_handler = signal.getsignal(signal.SIGALRM)
        def deadline(_number, _frame):
            raise TimeoutError("capture native lock ceiling")
        signal.signal(signal.SIGALRM, deadline)
        signal.setitimer(signal.ITIMER_REAL, 22)
        # Staged bytes and their root must still be exact under the native lock.
        d, p, checked_meta = validate_staged(binding)
        require(checked_meta == source_meta, "staged continuity differs")
        preflight, p_start = collect_p(p)
        p.validate_fresh_for_launcher(preflight, dt.datetime.now(dt.timezone.utc), BOOT)
        require(time.monotonic() - p_start <= 5, "P age exceeded")
        _, _, final_sources = validate_staged(binding)
        require(final_sources == source_meta, "staged sources changed after P collection")
        final = quick_live(lock_fd, live)
        lock_info["finalChecks"] = final
        net = Path("/proc/self/ns/net").stat()
        lock_info["hostNetNamespace"] = {"device": net.st_dev, "inode": net.st_ino}
        lock_info["prewriteElapsedSeconds"] = time.monotonic() - lock_start
        lock_info["preflightMonotonicAgeSeconds"] = time.monotonic() - p_start
        require(lock_info["prewriteElapsedSeconds"] <= 3, "prewrite gate exceeded")
        result["firstWriteDispatchAttempted"] = True
        os.mkdir(OP_ROOT, 0o700)
        result["effectProgressMarkers"].append("operation-root")
        os.chmod(OP_ROOT, 0o700, follow_symlinks=False)
        root_fd, root_meta = open_private_root()
        sync_dir("/run")
        intent = {"schemaVersion": 1, "contract": "LEETPLUS_NETLINK_CAPTURE_INTENT_V1", "operationId": UUID,
                  "paths": PATHS, "startedAt": started, "rootIdentity": root_meta,
                  "lineage": lineage(binding, source_meta, digest(canonical(preflight))),
                  "preflight": preflight, "stageBinding": binding, "hostNetNamespace": lock_info["hostNetNamespace"]}
        intent_raw = canonical(intent)
        write_exclusive(root_fd, "intent.json", intent_raw)
        intent_hash = digest(intent_raw)
        result["effectProgressMarkers"].append("intent")
        lock_info["lockHeldDuringChild"] = True
        run_bounded_child(d.CHILD_COMMAND, trace)
        if trace["spawnAttempted"]:
            result["effectProgressMarkers"].append("child-spawn-attempt")
        if not clean_trace(trace):
            error = trace["errorCategory"] or trace["cleanupErrorCategory"] or "ChildTraceNotClean"
        observed_at = utc_now()
        lock_info["observationCapturedAt"] = observed_at
    except BaseException as failure:
        error = type(failure).__name__
        result["errorCategory"] = error
    finally:
        try:
            if old_handler is not None:
                try:
                    signal.setitimer(signal.ITIMER_REAL, 0)
                    signal.signal(signal.SIGALRM, old_handler)
                except BaseException as failure:
                    error = type(failure).__name__
        finally:
            if lock_fd is not None:
                unlock_ok = close_ok = False
                try:
                    fcntl.flock(lock_fd, fcntl.LOCK_UN)
                    unlock_ok = True
                except BaseException as failure:
                    lock_info["releaseErrorCategory"] = type(failure).__name__
                finally:
                    try:
                        os.close(lock_fd)
                        close_ok = True
                    except BaseException as failure:
                        lock_info["releaseErrorCategory"] = type(failure).__name__
                lock_info["released"] = unlock_ok and close_ok
                lock_info["heldElapsedSeconds"] = time.monotonic() - lock_start
                if lock_info["released"]:
                    lock_info["releasedAt"] = utc_now()
                if not lock_info["released"] or lock_info["heldElapsedSeconds"] > 22:
                    error = lock_info["releaseErrorCategory"] or "LockCeilingExceeded"
        result["lock"] = lock_info
        result["childTrace"] = trace
    if result["firstWriteDispatchAttempted"]:
        result["decision"] = "RECOVERY_REQUIRED"
    if root_fd is not None and intent_hash is not None and lock_info and lock_info["released"]:
        publish_start = time.monotonic()
        publish_deadline = min(publish_start + 3, lock_start + 25)
        old_publish_handler = signal.getsignal(signal.SIGALRM)
        try:
            require(time.monotonic() < publish_deadline, "no terminal publication budget")
            signal.signal(signal.SIGALRM, lambda _number, _frame: (_ for _ in ()).throw(TimeoutError("terminal publication deadline")))
            signal.setitimer(signal.ITIMER_REAL, publish_deadline - time.monotonic())
            require(private_dir(OP_ROOT) == intent["rootIdentity"] and entries_capped(OP_ROOT, 3) == ["intent.json"], "operation/intent directory changed")
            exact_leaf(OP_ROOT / "intent.json", intent_hash, os.stat("intent.json", dir_fd=root_fd, follow_symlinks=False).st_ino)
            published = {}
            def terminal_factory():
                lock_info["terminalPublishedAt"] = utc_now()
                envelope = make_envelope(d, binding, source_meta, preflight, intent_hash, lock_info,
                                         trace, started, observed_at, error)
                published["envelope"] = envelope
                return canonical(envelope)
            terminal_raw, terminal_meta = write_exclusive(root_fd, "terminal.json", terminal_factory)
            envelope = published["envelope"]
            require(time.monotonic() <= publish_deadline and entries_capped(OP_ROOT, 3) == ["intent.json", "terminal.json"], "postpublication deadline/entries differ")
            result.update(terminalPublished=True, terminalSha256=digest(terminal_raw), terminalMetadata=terminal_meta,
                          publicationCompletedAt=utc_now(), publicationElapsedSeconds=time.monotonic() - publish_start,
                          totalLockThroughPublicationSeconds=time.monotonic() - lock_start,
                          terminal=envelope, intentSha256=intent_hash)
            result["effectProgressMarkers"].append("terminal")
            if envelope["decision"] == "DIAGNOSTIC_CAPTURED_NOT_ISOLATION_PASS":
                result["decision"] = envelope["decision"]
            else:
                result["decision"] = envelope["decision"]
        except BaseException as failure:
            result["errorCategory"] = type(failure).__name__
            result["decision"] = "RECOVERY_REQUIRED"
        finally:
            try:
                signal.setitimer(signal.ITIMER_REAL, 0)
                signal.signal(signal.SIGALRM, old_publish_handler)
            except BaseException as failure:
                result["errorCategory"] = type(failure).__name__
                result["decision"] = "RECOVERY_REQUIRED"
    if root_fd is not None:
        try:
            os.close(root_fd)
        except BaseException as failure:
            result["errorCategory"] = type(failure).__name__
            result["decision"] = "RECOVERY_REQUIRED"
    result["errorCategory"] = result["errorCategory"] or error
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["capture-once"], required=True)
    parser.add_argument("--binding-base64", required=True)
    args = parser.parse_args()
    result = capture_once(args.binding_base64)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["decision"] == "DIAGNOSTIC_CAPTURED_NOT_ISOLATION_PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
