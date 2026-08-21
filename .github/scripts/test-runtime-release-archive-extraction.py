#!/usr/bin/python3

"""Adversarial Linux fixture for the runtime release archive extractor."""

from __future__ import annotations

import io
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile


if os.name != "posix" or not hasattr(os, "geteuid"):
    print("runtime release archive extraction test: SKIP (requires Linux/POSIX)")
    raise SystemExit(0)

REPOSITORY_ROOT = pathlib.Path(__file__).resolve().parents[2]
EXTRACTOR = REPOSITORY_ROOT / ".github/scripts/extract-runtime-release-artifact.py"
PYTHON = pathlib.Path(sys.executable).resolve()
TEST_ROOT = pathlib.Path(tempfile.mkdtemp(prefix="runtime-archive-extraction-"))


def member(name: str, kind: bytes = tarfile.REGTYPE, data: bytes = b"payload\n") -> tuple:
    record = tarfile.TarInfo(name)
    record.type = kind
    record.uid = 0
    record.gid = 0
    record.uname = ""
    record.gname = ""
    record.mtime = 0
    record.mode = 0o550 if kind == tarfile.DIRTYPE else 0o440
    if kind == tarfile.REGTYPE:
        record.size = len(data)
    else:
        record.size = 0
    return record, data


def write_archive(label: str, members: list[tuple]) -> pathlib.Path:
    archive_path = TEST_ROOT / f"{label}.tar.gz"
    with tarfile.open(archive_path, mode="w:gz", format=tarfile.PAX_FORMAT) as archive:
        for record, data in members:
            archive.addfile(record, io.BytesIO(data) if record.isreg() else None)
    archive_path.chmod(0o440)
    return archive_path


def run_case(label: str, archive_path: pathlib.Path, expected: str, accepted: bool) -> None:
    destination = TEST_ROOT / f"extract-{label}"
    destination.mkdir(mode=0o700)
    result = subprocess.run(
        [
            str(PYTHON),
            "-I",
            "-S",
            "-E",
            str(EXTRACTOR),
            "--archive",
            str(archive_path.resolve()),
            "--destination",
            str(destination.resolve()),
        ],
        check=False,
        capture_output=True,
        text=True,
        env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "TZ": "UTC"},
        timeout=20,
    )
    output = result.stdout + result.stderr
    if accepted:
        if result.returncode != 0 or expected not in output:
            raise AssertionError(f"{label} was not accepted as expected: {output}")
    elif result.returncode == 0 or expected not in output:
        raise AssertionError(f"{label} was not rejected for the expected reason: {output}")


try:
    accepted = write_archive(
        "accepted",
        [member(".", tarfile.DIRTYPE), member("./app", tarfile.DIRTYPE), member("./app/main.js")],
    )
    run_case("accepted", accepted, "RUNTIME_RELEASE_ARCHIVE_EXTRACTION=PASS", True)

    traversal = write_archive("traversal", [member("./../escape")])
    run_case("traversal", traversal, "unsafe component", False)

    absolute = write_archive("absolute", [member("/absolute")])
    run_case("absolute", absolute, "path is not canonical", False)

    symlink_record, _ = member("./link", tarfile.SYMTYPE, b"")
    symlink_record.linkname = "app/main.js"
    symlink = write_archive("symlink", [(symlink_record, b"")])
    run_case("symlink", symlink, "not a regular file or directory", False)

    hardlink_record, _ = member("./hardlink", tarfile.LNKTYPE, b"")
    hardlink_record.linkname = "app/main.js"
    hardlink = write_archive("hardlink", [(hardlink_record, b"")])
    run_case("hardlink", hardlink, "not a regular file or directory", False)

    fifo = write_archive("fifo", [member("./fifo", tarfile.FIFOTYPE, b"")])
    run_case("fifo", fifo, "not a regular file or directory", False)

    duplicate = write_archive("duplicate", [member("./same"), member("./same")])
    run_case("duplicate", duplicate, "duplicate member", False)

    nondeterministic_record, data = member("./wrong-owner")
    nondeterministic_record.uid = 1000
    nondeterministic = write_archive("nondeterministic", [(nondeterministic_record, data)])
    run_case("nondeterministic", nondeterministic, "metadata is not deterministic", False)

    unsafe_mode_record, unsafe_mode_data = member("./unsafe-mode")
    unsafe_mode_record.mode = 0o777
    unsafe_mode = write_archive("unsafe-mode", [(unsafe_mode_record, unsafe_mode_data)])
    run_case("unsafe-mode", unsafe_mode, "metadata is not deterministic", False)

    writable_archive = write_archive("writable", [member("./file")])
    writable_archive.chmod(0o660)
    run_case("writable", writable_archive, "authority envelope", False)

    preexisting_archive = write_archive("preexisting", [member("./file")])
    preexisting_destination = TEST_ROOT / "extract-preexisting"
    preexisting_destination.mkdir(mode=0o700)
    (preexisting_destination / "residue").write_text("residue\n", encoding="utf8")
    result = subprocess.run(
        [
            str(PYTHON),
            "-I",
            "-S",
            "-E",
            str(EXTRACTOR),
            "--archive",
            str(preexisting_archive.resolve()),
            "--destination",
            str(preexisting_destination.resolve()),
        ],
        check=False,
        capture_output=True,
        text=True,
        env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "TZ": "UTC"},
        timeout=20,
    )
    if result.returncode == 0 or "destination must be empty" not in result.stderr:
        raise AssertionError("preexisting destination was not rejected")

    print("runtime release archive extraction test: PASS")
finally:
    for path_value in TEST_ROOT.rglob("*"):
        try:
            path_value.chmod(0o700 if path_value.is_dir() else 0o600)
        except OSError:
            pass
    shutil.rmtree(TEST_ROOT, ignore_errors=False)
