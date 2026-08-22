#!/usr/bin/python3

"""Safely extract one CI runtime release archive into a fresh private root."""

from __future__ import annotations

import argparse
import os
import stat
import sys
import tarfile
import unicodedata


MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024
MAX_MEMBER_BYTES = 2 * 1024 * 1024 * 1024
MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024
MAX_MEMBERS = 250_000
MAX_PATH_BYTES = 4096
COPY_CHUNK_BYTES = 1024 * 1024


class ExtractionError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise ExtractionError(f"extract-runtime-release-artifact: {message}")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--archive")
    parser.add_argument("--archive-owner-uid")
    parser.add_argument("--destination")
    parser.add_argument("--help", action="store_true")
    arguments, unknown = parser.parse_known_args()
    if arguments.help:
        print(
            "Usage: extract-runtime-release-artifact.py "
            "--archive <absolute-tar.gz> [--archive-owner-uid 0] "
            "--destination <fresh-absolute-directory>"
        )
        raise SystemExit(0)
    if unknown:
        fail(f"unknown argument: {unknown[0]}")
    if not arguments.archive or not arguments.destination:
        fail("--archive and --destination are required")
    return arguments


def canonical_absolute(path_value: str, label: str) -> str:
    if not os.path.isabs(path_value):
        fail(f"{label} must be absolute")
    resolved = os.path.realpath(path_value)
    normalized = os.path.abspath(path_value)
    if resolved != normalized:
        fail(f"{label} and every ancestor must be canonical and symlink-free")
    return resolved


def identity(record: os.stat_result) -> tuple[int, ...]:
    return (
        record.st_dev,
        record.st_ino,
        record.st_size,
        record.st_mtime_ns,
        record.st_ctime_ns,
        record.st_mode,
        record.st_uid,
        record.st_gid,
        record.st_nlink,
    )


def expected_archive_owner(owner_uid: str | None) -> int:
    if owner_uid is None:
        return os.geteuid()
    if owner_uid != "0":
        fail("--archive-owner-uid only accepts the exact root UID 0")
    return 0


def assert_archive(
    path_value: str, expected_owner_uid: int
) -> tuple[str, int, tuple[int, ...]]:
    archive = canonical_absolute(path_value, "archive")
    record = os.lstat(archive)
    if (
        not stat.S_ISREG(record.st_mode)
        or record.st_nlink != 1
        or record.st_uid != expected_owner_uid
        or record.st_mode & 0o7022
        or record.st_size <= 0
        or record.st_size > MAX_ARCHIVE_BYTES
    ):
        fail("archive violates the exact regular-file authority envelope")
    return archive, record.st_dev, identity(record)


def assert_destination(path_value: str) -> tuple[str, int]:
    destination = canonical_absolute(path_value, "destination")
    record = os.lstat(destination)
    if (
        not stat.S_ISDIR(record.st_mode)
        or record.st_uid != os.geteuid()
        or stat.S_IMODE(record.st_mode) != 0o700
    ):
        fail("destination must be an exact private directory owned by the caller")
    if os.listdir(destination):
        fail("destination must be empty")
    return destination, record.st_dev


def safe_components(member_name: str) -> list[str]:
    if (
        not member_name
        or (member_name != "." and not member_name.startswith("./"))
        or member_name != unicodedata.normalize("NFC", member_name)
        or "\\" in member_name
        or any(ord(character) < 0x20 or ord(character) == 0x7F for character in member_name)
        or len(member_name.encode("utf-8")) > MAX_PATH_BYTES
        or member_name.startswith("/")
    ):
        fail(f"archive member path is not canonical: {member_name!r}")
    if member_name == ".":
        return []
    normalized_name = member_name[2:] if member_name.startswith("./") else member_name
    components = normalized_name.rstrip("/").split("/")
    if not components or any(
        not component
        or component in {".", ".."}
        or len(component.encode("utf-8")) > 255
        for component in components
    ):
        fail(f"archive member path has an unsafe component: {member_name!r}")
    return components


def assert_directory(path_value: str, root_device: int) -> None:
    record = os.lstat(path_value)
    if (
        not stat.S_ISDIR(record.st_mode)
        or record.st_dev != root_device
        or record.st_uid != os.geteuid()
        or stat.S_IMODE(record.st_mode) != 0o700
    ):
        fail(f"extraction directory authority changed: {path_value}")


def ensure_directory(
    destination: str, components: list[str], root_device: int
) -> str:
    current = destination
    for component in components:
        current = os.path.join(current, component)
        try:
            os.mkdir(current, 0o700)
        except FileExistsError:
            pass
        assert_directory(current, root_device)
        os.chmod(current, 0o700, follow_symlinks=False)
    return current


def extract_regular_member(
    archive: tarfile.TarFile,
    member: tarfile.TarInfo,
    destination: str,
    components: list[str],
    root_device: int,
) -> None:
    if not components:
        fail("archive root cannot be a regular file")
    parent = ensure_directory(destination, components[:-1], root_device)
    output_path = os.path.join(parent, components[-1])
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(output_path, flags, 0o600)
    source = archive.extractfile(member)
    if source is None:
        os.close(descriptor)
        fail(f"regular member has no payload: {member.name}")
    copied = 0
    try:
        while True:
            chunk = source.read(COPY_CHUNK_BYTES)
            if not chunk:
                break
            copied += len(chunk)
            if copied > member.size or copied > MAX_MEMBER_BYTES:
                fail(f"archive member exceeded its bounded size: {member.name}")
            view = memoryview(chunk)
            while view:
                written = os.write(descriptor, view)
                if written <= 0:
                    fail(f"short write while extracting: {member.name}")
                view = view[written:]
        if copied != member.size or source.read(1):
            fail(f"archive member payload size differs from its header: {member.name}")
        os.fchmod(descriptor, 0o600)
        os.fsync(descriptor)
        opened = os.fstat(descriptor)
        if (
            not stat.S_ISREG(opened.st_mode)
            or opened.st_nlink != 1
            or opened.st_dev != root_device
            or opened.st_uid != os.geteuid()
            or stat.S_IMODE(opened.st_mode) != 0o600
            or opened.st_size != member.size
        ):
            fail(f"extracted file authority is malformed: {member.name}")
    finally:
        source.close()
        os.close(descriptor)


def run() -> None:
    arguments = parse_arguments()
    if os.geteuid() == 0:
        fail("extractor must run as the unprivileged CI identity")
    archive_owner_uid = expected_archive_owner(arguments.archive_owner_uid)
    archive_path, _, archive_identity = assert_archive(
        arguments.archive, archive_owner_uid
    )
    destination, destination_device = assert_destination(arguments.destination)
    seen_paths: set[str] = set()
    member_count = 0
    total_bytes = 0

    archive_flags = os.O_RDONLY | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0)
    archive_flags |= getattr(os, "O_NONBLOCK", 0)
    archive_descriptor = os.open(archive_path, archive_flags)
    with os.fdopen(archive_descriptor, "rb", closefd=True) as archive_file:
        if identity(os.fstat(archive_file.fileno())) != archive_identity:
            fail("archive identity changed before its stable descriptor was opened")
        with tarfile.open(fileobj=archive_file, mode="r|gz") as archive:
            for member in archive:
                member_count += 1
                if member_count > MAX_MEMBERS:
                    fail("archive member count exceeds the bounded envelope")
                components = safe_components(member.name)
                canonical_member = "/".join(components) if components else "."
                if canonical_member in seen_paths:
                    fail(f"archive contains a duplicate member: {member.name}")
                seen_paths.add(canonical_member)
                if member.type == tarfile.DIRTYPE:
                    expected_mode = 0o550
                elif member.type in {tarfile.REGTYPE, tarfile.AREGTYPE}:
                    expected_mode = 0o440
                else:
                    fail(f"archive member is not a regular file or directory: {member.name}")
                if (
                    member.uid != 0
                    or member.gid != 0
                    or int(member.mtime) != 0
                    or member.mode != expected_mode
                ):
                    fail(f"archive member metadata is not deterministic: {member.name}")
                if member.type == tarfile.DIRTYPE:
                    if member.size != 0:
                        fail(f"archive directory has a payload: {member.name}")
                    ensure_directory(destination, components, destination_device)
                    continue
                if member.size < 0 or member.size > MAX_MEMBER_BYTES:
                    fail(f"archive member size exceeds the bounded envelope: {member.name}")
                total_bytes += member.size
                if total_bytes > MAX_TOTAL_BYTES:
                    fail("archive expanded size exceeds the bounded envelope")
                extract_regular_member(
                    archive, member, destination, components, destination_device
                )
        if identity(os.fstat(archive_file.fileno())) != archive_identity:
            fail("opened archive identity changed during extraction")

    if member_count == 0:
        fail("archive is empty")
    if identity(os.lstat(archive_path)) != archive_identity:
        fail("archive identity changed during extraction")
    assert_directory(destination, destination_device)
    print("RUNTIME_RELEASE_ARCHIVE_EXTRACTION=PASS")
    print(f"RUNTIME_RELEASE_ARCHIVE_MEMBER_COUNT={member_count}")
    print(f"RUNTIME_RELEASE_ARCHIVE_EXPANDED_BYTES={total_bytes}")


if __name__ == "__main__":
    try:
        run()
    except (ExtractionError, OSError, tarfile.TarError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
