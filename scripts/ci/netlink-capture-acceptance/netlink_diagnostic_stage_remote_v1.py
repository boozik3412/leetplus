"""Pinned remote stage helper. Generated copy embeds exact reviewed D/P bytes.

Source only until a reviewed plan and direct GO authorize the local dispatcher
runner. Remote mode/plan/GO arguments are provenance, not GO authentication.
"""
import base64
import datetime as dt
import fcntl
import hashlib
import json
import os
import signal
import stat
import sys
import time
import types
import zlib
from pathlib import Path

UUID = "c0a90d53-5f55-4825-89e3-16343a861a85"
OLD_UUID = "9afc7218-4757-4f44-87e1-6096706bad44"
BOOT = "4bbc3488-6a9b-49b1-becf-db0d784464f0"
HOST = "de72d444d9266e6c4f1ac7e76f0d4e4e0866ca1da4aa0a7f2808835fa3bd3423"
ACTIVE = "681838ce8eaad625fa08231d722532e82e595a1c0207b931f12e3fb0406e52bd"
D_SHA = "73801b0d24b5896eaf327a64be5f79c6d04f3fb16fca3310d40ccd9942dcc919"
P_SHA = "b158a288a3b8df29212c6d0f86888d8b2874004d38a50b3f359a472cd933381a"
OLD_CODE_SHA = "7e03e03f1b13037e45dfb06a817e45a8d9ceca417108282b5c8f17fd8d3909d7"
OLD_INTENT_SHA = "883876cbe4f35eeca33afe45519e6668c40bc2469f2547f6b3f232f93dbb6b47"
PYTHON_SHA = "52e0a13e60a981d8c4b6478be2ba5176f69da07948a056bf49cf6f077e30cb41"
UNSHARE_SHA = "41c65e55107cbbb1a1f6994784a938dd7dbbe255d1fea6b7a58ec96eabe382ef"
CODE_ROOT = Path("/run/leetplus-browser-netlink-code-" + UUID)
OP_ROOT = Path("/run/leetplus-browser-netlink-diagnostic-" + UUID)
OLD_ROOT = Path("/run/leetplus-browser-ns-probe")
OLD_OPERATION = OLD_ROOT / OLD_UUID
LOCK = Path("/var/lib/leetplus-compose/control.lock")
SOURCE_BYTES = {"D": "eNrNWm1z2kgS/s6vUObLSmuBsUOcRDnlimCyoRaDD3Cyu5hSCWkUtNYLNyMwPh///bpH70LYzm1d1aUqtjTT3dMz3f1098iEkOsNoxK3VtQ3uWQGtuSYViQ5m8CK3DDgkhMyKVpR6RMzA2vVPJcCGsGw7Zrfg5BHriXJl0qLENJwWOhLhuFsIhBpGJLrr0MWgcwgjEwhrJEM2WZEI9enEixpR6q0MvnKc5eq9CcPA1VitNHofRkML43eeDSbdHsznQz7/dn18GZqfJoMLn/pG6OpMerPhoPRr0ZM+hnIpsbXM9IYdm9GvS/GpD+9Gc5eJqLMgkJm/cnVYNQdvoz/ctD9ZTSezgY9I2MsSbns9wbTwXikkwJpr3s9u5n0L43ReGYMpuNhdwYkxnV3OiWNm5vBpc5oywr9tetRmZG52XTazfeLx3f7Zvbcgeez5rtFNvAaBt69N5flkfT57Hx/+wdRGl+60y9HpF90BMkH6ar7mzhV49Pvs/5UP39z8fNZ+7zTGMNpj6/7E6GtTt6bjvX2/Oxds/P2zdtmx+l0mu/e0rPmRfv9xdv2xdK0Ox3YzqxXXu/WRt1v7Vtb/JjhDy37If9du20BycVe+fsfQuPJGA7petL/PPhNJ6dsE5x6lEZrb8ObSxbec8qa4JmeG9w1c99skkbDpo5kmUEYuJbpyVtFA/8CDw0kGb2tZW/8NZe3Kg04uq3JLdfVP5sep6ob2DSI9HPlhNwGRGnRwAptKitCpO1+pzySmXmfS0z8uMVXJpyWmGut6C4hjfnoDuLLuKMPuCj+Uj1zST1Fa0jwz3UkiBbJ5W7AIwg4CkS2a0WKBGHIaQT6v9LxN3LiwqbLqfTV9Da0z1jIZIc8Cnl7CSlAS8ehjMRL84iBKGMTWfIWOY6vibMqkItlcRLM13I2nuebkbVKuQ8WJ2Jz+Wkjm/SHhKEOkv01nNM/Ny6jNiiEK0fsQZPWJuPU1u2olcJCC5HE5SFAD6wXrzbXmmeLE3LSbmvtdsJOdxZdRwUFEE8oPvwl1SQBZEJOej6xji04udBx8PjBCqAwctvUi0y5LU4qIctVV1qMrj0TjjTVXCXgzK90sae/foCJ38XrChsvww14rW1EdBfJgelTFbxQ9c2d6298vRzSR+2PLMuHiHKxK48GwpU/JlJwbElu20RyA3DA+3ovxLX3cTIRooS1qB0ryMv6g5CWTQvB5QNR5AZOaPAHbkAQsoc40gSXgyL0+SJ5AQ3dgKIypc2TTAhRRSTyteciQFAuJ4IEv45D8aSsZMNwKLhvR/mon7XjvDjvLHSAHtCIiAHSFCfg5LLwH9edFgLHToZ5QFGhbMtcr2lgy48ENCEarqjG+g1sorlBJDvz9kJRCViSFgfPcNA3/wzZlRuEjGjO/HyhEhaGET6/XiRirkOgx5EOjIRrkW3x9Q28OgC4oHRE/dnDmuIoPzlLGafhhlnJ4PlirzSKm0fVwVnPaiwce6r3IIVw9Hgmuc0kYa8jripkwl5jWA49jwIioZdw+WcVANxAv+FrCBlVCCy8ww4pA1LK1TULLQOpbbrNX1i4iWj+6q63F8kYepHlmZzjhJppmvkTuBCCprpDg8oyASpS1kZRE4ciVb2UgjMVwH2nPhLQzoXDVQnYzqZkr+bonLGTks9hIJqeJxeCcTe/W+DeFeF0+PaxLVS+Q2V3TyeBbBnJxVzmRg8Q58AH+OOmljmM/8JJey6PMhTIx5WPFx0cNYMHucK8U2VkUqPN2oPDSXl34EjnaTopba+dbA/m8OVveruWDFy2mJFwQByDsFlBszpndR1hLxGXApOg1GX02XMou03pKEpTT55GSWl8IKcCN3a59mVhdRvACDsVJKdAcnQLSZA9krig/0oZByQg2plKrBCiEtiIVi6tVfBSy43JSFxEF+pSA2rR/gQLPfBiWHmUua2GZYlciZE4RKpE1YDBeEjNRbT5IxF2AciDJYCIaMFenI2rBmXbAmhhdI9odEm3RCvDfWGmhA9KxjRBLDjCFs9VsCRnHQCWPMWez9fhD8gB+/XQfECL+A/lYNnoguJKZATMWFpdBsxxC06Qh55oqq5BAkjGSoRoom7dp93TdHwz6fV19tNPPyWNl+ivQq7y0LqjUdyxrc0Ii9a0XbuGVwHOTF6rvn5+cX7W6SDE2XrIWyGkMRiHp7ExuRyPhr//WzyPxp/Hw+H4m/Ih1DHdm4yZD5hOscQD17xfQRKSZgyKHnTUJcpi1LRlW7148+b1hXDfJACX2hKm7hp5IgqVE/y1hBKkpmZKDBLXGnGVwaEk8N0ojoqwBZbC7LvE1yRERE0CghuS4waAuA8aaGR5IaeynVTLflpymKLWEFkiKXmyauWgqIByolBL/GgVUSkezGrd8H9bNCQbNUW18BeLhcRCJlYJgY7+CPiHUXXKqeecBgICoR0DhIVT/uDXkvhBgURAj87Bvakt71r4moNvwl0CWGB1AXRsl8mK0kg2J6Qg1NdsMApDyQf4L4AVbGWrP43EP3Cr8V/DdFaFaAEchyiYknIkHoDn/SFu51x+lcvPuZ6B8V0K43GSE5jTKqZiWakgOkvNCHs4hUXBDmmkVVG8RCpQto64gNslhhybS1wllBb2ruIyokLJ1/IuQ3kOltcM4/PHbh2AwtYJUQDDszuxq6vu6FKfk9MNZ6dLNzjdBHwFGAC2bzZF6Qq/71zPa1oAu7b+62A4FGNgjTt4yPjWD9EqDF7j3AB/fMIfFlGL6WMR36CIFtMQ8gqd2HOtI07CSKmLLPegSTPJnmgmiVg1qXniXvKw8tnq4ly90LS5WCfVD55f6ZX7nydXQNmod8aT1VbLjetFerlpKRVA+rb1nUZyOQKVasOQUlViTik0OPocYEoQxTGlqMmrCCwoqjP02qZkWSSq8wWEVbECShcsVkikcJ9VqXoq5ElZU8+Qx1GFq1AQlThLVU/KUww7JW/PdDmfz0NQfdwr8TDmRJReuZ7LTL99pSdGQy9LT6ouQhXsitDoIgRf6iGFe8YwgOwGiAmhm7V0SR7bivgRvmpG1PDMTWCtDEb5xsPrPK1RaRy3ajVpFFIG5mnKhP6Q7wHmPDOYittGzBCZPnGCzibiNSk7MnzNqOO531dRNrMCKaOiE6MKPvRzkEC7qIU4jv7OjXqYE5L3aWSDxTMhhbFPGLWFIcrYARmMlch6oQ8Z1c7o0LEo57+At60nlLv2BhdOL4G7ayi6LHEw35gbi8mCoh9s/OTUrihAHp6cF0Jod51RfGc8hP8FqmvKoHyEzR4Q/mND2cN4ySnbilkIxKVrg9l7YRBQ8c3ks+m7nkt5FwT461gIVqAM6kyQcg8gnBOXqIJ49moTfy+ZQFFEeSLAcYCBg2J4tSiGzI3tRslm96k1pdix8pZ2O6940wJKNBEP89ytYKz+q0l2/3szuCxeAM9LfrhQEoGlQV0vfSkoNsj4+aEk7m6h5Hca8v/KrZ/y0gOXLPufotRcSuARVp08v8yonU1uN9K5LITAAu0KUxYQ9XOJYjCZfF9YAhQWycobyOnyZFgqKJSUuS7QFiWATAiPx14t+RPhCMqRmvqQpAu9LFazVbHPrGUtR2+tli8KaNB3vkgYXhLatSsdjfbFs9moFOspdfLtwKNmUPw8mwA3hn4MCsXPQPMSri+Ug2Q0P8wFi7qbTUEWfxvOsafmPqxWYHbDGR9MLQEGTgEhKgoodV+jcpWeuP3ErlgvfFw8qcJYciRrMCq1jQSHofruTfrdWd9IWAdf8SUDO1Ds22QAI4Orq5tZ99MQnkaz/mgGE9Pr7reR8Wl8M7rE5q0/g65PRGINU/oBuarGvYgzaC/jpv6R4C0O9DjwBiXCfUDZDexQa2Nnh00bab9tt0nSsgUVjhNyGg+3sIYmRwR0YgERhhu4+4GIdOJ5IftCbjrIaxBa1cNO3KKY74pU8Vlox6KEMimRcyokSDF98mk0+dgnQieg0Kmkppe4Bc91pRxWlHj9F29XLhV0qkBeI++QPP1I5Vd6Uz5YerHDyqVk32PmNdmrgOkZg+i16jLPKx1bsIJ+z8GKHdIYWKBVtFN0EWUwF3J/5M754M8pivcZB38lUa5yNa8SkaWyF2cLr4typYqzJYQ7Wk4g5ZGpxZFSA1lqJxbHi5AiT3UuY5sIA6QcB2nbw5uGmhSvPZfgawp71KcG4WPxn7HdIZpVfK2ulfnTk5cfTxXqKcUT9YFWWx28uIjXsCB4upJPlXhR+tfmi5eV9KnUo6k+JTiAQbTLITaWi36kKYHivtxqZhC1VZ8GqbhXfimuHeJGodpI2RN45UV8XeOfmkHp6m7NQjlSwlbfdAM5XWIq7p+xRJbJF+gltERCvhqklY1HP0gboGZQEdB7akvX4l6dUwBUOAXoy80NOBFz/wVzQyKucw3hRYah68QwcE3DIFq8duM/kBdWIw==", "P": "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"}
SOURCE_LENGTHS = {"D": 10004, "P": 9818}


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def embedded():
    out = {}
    for name, pin in (("D", D_SHA), ("P", P_SHA)):
        decoder = zlib.decompressobj()
        raw = decoder.decompress(base64.b64decode(SOURCE_BYTES[name]), 1024 * 1024 + 1)
        require(decoder.eof and not decoder.unconsumed_tail and not decoder.unused_data,
                "embedded diagnostic source compression differs")
        require(len(raw) == SOURCE_LENGTHS[name] and digest(raw) == pin,
                "embedded diagnostic source bytes differ")
        out[name] = raw
    return out


def load_p_module(raw):
    require(digest(raw) == P_SHA, "read-only P source differs before import")
    module = types.ModuleType("leetplus_netlink_preflight_exact")
    module.__file__ = str(CODE_ROOT / "bridge_ns_netlink_preflight.py")
    exec(compile(raw, module.__file__, "exec"), module.__dict__)
    return module


def tool_identities(p_module):
    link = Path("/usr/bin/python3")
    before = os.lstat(link)
    require(stat.S_ISLNK(before.st_mode) and before.st_uid == 0 and
            before.st_nlink == 1 and os.readlink(link) == "python3.14",
            "Python link metadata differs")
    python_sha = p_module.protected_python_hash(link)
    target = link.parent / "python3.14"
    target_info = p_module.protected_metadata(target)
    unshare_info = p_module.protected_metadata("/usr/bin/unshare")
    after = os.lstat(link)
    link_identity = lambda value: (value.st_dev, value.st_ino, value.st_uid,
                                   value.st_mode, value.st_nlink, value.st_size,
                                   value.st_mtime_ns, value.st_ctime_ns)
    require(link_identity(before) == link_identity(after) and
            os.readlink(link) == "python3.14" and
            python_sha == target_info["sha256"] == PYTHON_SHA and
            unshare_info["sha256"] == UNSHARE_SHA,
            "host tool inode or SHA differs")
    return {"pythonLink": {"path": str(link), "targetText": "python3.14",
                           "device": before.st_dev, "inode": before.st_ino,
                           "uid": before.st_uid, "mode": oct(before.st_mode & 0o777),
                           "nlink": before.st_nlink},
            "pythonTarget": target_info, "unshare": unshare_info}


def exact_file(path, expected, mode=0o400, inode=None, maximum=1024 * 1024):
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and not path.is_symlink() and
            before.st_uid == 0 and before.st_nlink == 1 and
            before.st_mode & 0o777 == mode and 0 < before.st_size <= maximum,
            "protected file metadata differs")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        raw = bytearray()
        while len(raw) <= maximum:
            part = os.read(fd, min(65536, maximum + 1 - len(raw)))
            if not part:
                break
            raw.extend(part)
        after = os.fstat(fd)
        current = path.lstat()
        ident = lambda value: (value.st_dev, value.st_ino, value.st_uid,
                               value.st_mode, value.st_nlink, value.st_size,
                               value.st_mtime_ns)
        require(len(raw) == before.st_size and ident(before) == ident(opened) ==
                ident(after) == ident(current) and digest(raw) == expected and
                (inode is None or before.st_ino == inode),
                "protected file content or inode differs")
        return {"inode": before.st_ino, "device": before.st_dev,
                "sha256": expected, "mode": oct(mode), "nlink": before.st_nlink}
    finally:
        os.close(fd)


def private_dir(path, inode=None):
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and not path.is_symlink() and
            info.st_uid == 0 and info.st_mode & 0o777 == 0o700 and
            (inode is None or info.st_ino == inode),
            "private directory identity differs")
    return info


def check_baseline(p_module):
    require(os.geteuid() == 0 and os.uname().nodename == "1337s", "host differs")
    machine = digest(Path("/etc/machine-id").read_bytes().strip())
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    require(machine == HOST and boot == BOOT, "machine or boot differs")
    run = Path("/run")
    run_info = run.lstat()
    require(stat.S_ISDIR(run_info.st_mode) and not run.is_symlink() and
            run_info.st_uid == 0 and run_info.st_mode & 0o777 == 0o755,
            "/run trust differs")
    require(str(Path("/usr/local/sbin/leetplus-compose").resolve(strict=True)) ==
            "/usr/local/lib/leetplus-compose/b0cbf3a4f302b299762fa055f3bffe0376a91182/control.sh",
            "serving controller differs")
    require(digest(Path("/var/lib/leetplus-compose/active.json").read_bytes()) == ACTIVE,
            "active application differs")
    require(not Path("/var/lib/leetplus-compose/control-handoff.pending.json").exists(),
            "native pending operation exists")
    private_dir(OLD_ROOT, 34620478)
    private_dir(OLD_OPERATION)
    require(sorted(p.name for p in OLD_ROOT.iterdir()) ==
            [OLD_UUID, "bridge_ns_unix_probe_7e03.py"] and
            sorted(p.name for p in OLD_OPERATION.iterdir()) == ["intent.json"],
            "old audit entries differ")
    old_code = exact_file(OLD_ROOT / "bridge_ns_unix_probe_7e03.py",
                          OLD_CODE_SHA, inode=34621704)
    old_intent = exact_file(OLD_OPERATION / "intent.json",
                            OLD_INTENT_SHA, inode=34622287)
    require(not CODE_ROOT.exists() and not CODE_ROOT.is_symlink() and
            not OP_ROOT.exists() and not OP_ROOT.is_symlink(),
            "new diagnostic roots already exist")
    tools = tool_identities(p_module)
    free = os.statvfs("/").f_bavail * os.statvfs("/").f_frsize
    require(free >= 40 * 1024**3, "capacity below 40GiB")
    return {"bootId": boot, "machineIdSha256": machine,
            "runInode": run_info.st_ino, "oldRootInode": OLD_ROOT.lstat().st_ino,
            "oldCode": old_code, "oldIntent": old_intent,
            "tools": tools,
            "newCodeRoot": str(CODE_ROOT), "newOperationRoot": str(OP_ROOT),
            "rootAvailableBytes": free}


def acquire_lock():
    info = LOCK.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and
            info.st_nlink == 1, "native lock file differs")
    fd = os.open(LOCK, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        require((opened.st_dev, opened.st_ino) == (info.st_dev, info.st_ino),
                "native lock inode changed")
        fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        return fd, info.st_ino
    except Exception:
        os.close(fd)
        raise


def write_leaf(path, raw, wrote, label):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    wrote.append(label)
    try:
        os.fchmod(fd, 0o400)
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    return exact_file(path, digest(raw))


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def observe_stage():
    """Read-only exact candidate paths after releasing the native lock."""
    old_handler = signal.getsignal(signal.SIGALRM)
    signal.signal(signal.SIGALRM, lambda _number, _frame: (_ for _ in ()).throw(
        TimeoutError("poststage read-only observation exceeded 2s")))
    signal.setitimer(signal.ITIMER_REAL, 2.0)
    try:
        try:
            info = CODE_ROOT.lstat()
        except FileNotFoundError:
            return {"observationComplete": True, "rootPresent": False,
                    "entries": [], "completeExact": False}
        root_exact = stat.S_ISDIR(info.st_mode) and not CODE_ROOT.is_symlink() and \
            info.st_uid == 0 and info.st_mode & 0o777 == 0o700
        result = {"observationComplete": True, "rootPresent": True,
                  "rootExact": root_exact, "rootInode": info.st_ino,
                  "completeExact": False}
        if not root_exact:
            result["entriesObserved"] = False
            return result
        entries = []
        for child in CODE_ROOT.iterdir():
            entries.append(child.name)
            require(len(entries) <= 4, "foreign staged entry set too large")
        result["entries"] = sorted(entries)
        leaves = {}
        for name, expected in (("bridge_ns_netlink_diagnostic.py", D_SHA),
                               ("bridge_ns_netlink_preflight.py", P_SHA)):
            path = CODE_ROOT / name
            try:
                leaf = path.lstat()
            except FileNotFoundError:
                leaves[name] = {"present": False, "exact": False}
                continue
            leaf_result = {"present": True, "exact": False,
                           "inode": leaf.st_ino, "uid": leaf.st_uid,
                           "mode": oct(leaf.st_mode & 0o777),
                           "nlink": leaf.st_nlink, "size": leaf.st_size}
            try:
                leaf_result.update(exact_file(path, expected))
                leaf_result["exact"] = True
            except TimeoutError:
                raise
            except (OSError, RuntimeError) as error:
                leaf_result["invalidReason"] = type(error).__name__
            leaves[name] = leaf_result
        result["leaves"] = leaves
        after = CODE_ROOT.lstat()
        final_entries = sorted(path.name for path in CODE_ROOT.iterdir())
        result["rootStable"] = (after.st_dev, after.st_ino, after.st_uid,
                                after.st_mode & 0o777) == \
                               (info.st_dev, info.st_ino, info.st_uid,
                                info.st_mode & 0o777)
        result["finalEntries"] = final_entries
        result["completeExact"] = result["rootStable"] and \
            result["entries"] == final_entries == sorted(leaves) and \
            all(leaf["exact"] for leaf in leaves.values())
        return result
    except Exception as error:
        return {"observationComplete": False, "completeExact": False,
                "errorCategory": type(error).__name__}
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0.0)
        signal.signal(signal.SIGALRM, old_handler)


def stage(plan_sha, go_sha):
    source = embedded()
    p_module = load_p_module(source["P"])
    before = check_baseline(p_module)
    started = None
    acquired_at = None
    released_at = None
    lock_fd = None
    lock_inode = None
    old_alarm_handler = None
    alarm_armed = False
    wrote = []
    write_dispatch_attempted = False
    error = None
    stage_facts = None
    try:
        lock_fd, lock_inode = acquire_lock()
        started = time.monotonic()
        acquired_at = utc()
        require(signal.getitimer(signal.ITIMER_REAL) == (0.0, 0.0),
                "foreign process timer differs")
        old_alarm_handler = signal.getsignal(signal.SIGALRM)
        def alarm_handler(_number, _frame):
            raise TimeoutError("stage shared-lock hard deadline exceeded")
        signal.signal(signal.SIGALRM, alarm_handler)
        signal.setitimer(signal.ITIMER_REAL, 5.0)
        alarm_armed = True
        require(check_baseline(p_module)["bootId"] == before["bootId"],
                "stage host state changed before write")
        require(time.monotonic() - started < 5,
                "stage lock deadline after prewrite reads")
        write_dispatch_attempted = True
        os.mkdir(CODE_ROOT, 0o700)
        wrote.append("code-root")
        private_dir(CODE_ROOT)
        sync_dir(Path("/run"))
        require(time.monotonic() - started < 5, "stage lock deadline before D write")
        d_file = write_leaf(CODE_ROOT / "bridge_ns_netlink_diagnostic.py", source["D"],
                            wrote, "D-created")
        require(time.monotonic() - started < 5, "stage lock deadline before P write")
        p_file = write_leaf(CODE_ROOT / "bridge_ns_netlink_preflight.py", source["P"],
                            wrote, "P-created")
        require(sorted(p.name for p in CODE_ROOT.iterdir()) ==
                ["bridge_ns_netlink_diagnostic.py", "bridge_ns_netlink_preflight.py"],
                "staged source entry set differs")
        sync_dir(CODE_ROOT)
        sync_dir(Path("/run"))
        require(time.monotonic() - started <= 5, "stage lock deadline after write")
        stage_facts = {"codeRoot": str(CODE_ROOT), "codeRootInode": CODE_ROOT.lstat().st_ino,
                       "D": d_file, "P": p_file}
    except Exception as caught:
        error = caught
    finally:
        try:
            if alarm_armed:
                signal.setitimer(signal.ITIMER_REAL, 0.0)
                signal.signal(signal.SIGALRM, old_alarm_handler)
        finally:
            if lock_fd is not None:
                try:
                    fcntl.flock(lock_fd, fcntl.LOCK_UN)
                finally:
                    os.close(lock_fd)
                    released_at = utc()
    elapsed = None if started is None else time.monotonic() - started
    if error is None and elapsed is not None and elapsed > 5:
        error = TimeoutError("stage shared-lock elapsed exceeded hard deadline")
    observed = observe_stage()
    complete = error is None and elapsed is not None and elapsed <= 5 and \
        observed.get("observationComplete") is True and observed.get("completeExact") is True
    before_write_hold = error is not None and not write_dispatch_attempted and \
        observed.get("observationComplete") is True and observed.get("rootPresent") is False
    decision = "EXACT_TWO_PROTECTED_SOURCES_STAGED" if complete else \
        "HOLD_BEFORE_STAGE" if before_write_hold else "STAGE_UNKNOWN_RECOVERY_REQUIRED"
    result = {"contract": "LEETPLUS_NETLINK_DIAGNOSTIC_STAGE_V1",
              "decision": decision,
              "operationId": UUID, "readOnly": False,
              "effectProgressMarkers": wrote,
              "firstWriteDispatchAttempted": write_dispatch_attempted,
              "effectsObserved": observed,
              "planSha256": plan_sha, "goReceiptSha256": go_sha,
              "diagnosticSourceSha256": D_SHA, "preflightSourceSha256": P_SHA,
              "baseline": before, "staged": stage_facts,
              "lockInode": lock_inode, "lockAcquiredAt": acquired_at,
              "lockReleasedAt": released_at, "lockElapsedSeconds": elapsed,
              "lockBudgetSeconds": 5,
              "errorCategory": None if error is None else type(error).__name__}
    print(json.dumps(result, sort_keys=True))
    raise SystemExit(0 if complete else 2)


def main():
    require(len(sys.argv) == 5 and sys.argv[1] in ("preflight", "stage") and
            sys.argv[2] == UUID and all(len(value) == 64 and
            all(char in "0123456789abcdef" for char in value)
            for value in sys.argv[3:5]),
            "fixed diagnostic phase/operation/plan/GO argument required")
    plan_sha, go_sha = sys.argv[3:5]
    if sys.argv[1] == "preflight":
        source = embedded()
        p_module = load_p_module(source["P"])
        baseline = check_baseline(p_module)
        print(json.dumps({"contract": "LEETPLUS_NETLINK_STAGE_READONLY_PREFLIGHT_V1",
                          "decision": "READY_NOT_AUTHORIZATION", "readOnly": True,
                          "effectsPerformed": False, "operationId": UUID,
                          "planSha256": plan_sha, "goReceiptSha256": go_sha,
                          "baseline": baseline, "Dsha256": digest(source["D"]),
                          "Psha256": digest(source["P"])}, sort_keys=True))
    else:
        stage(plan_sha, go_sha)


if __name__ == "__main__":
    main()
