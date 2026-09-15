"""Temporary-fixture tests for --stage-only; not a privileged installer acceptance test."""

import gzip
import hashlib
import importlib.util
import io
import tarfile
import tempfile
import unittest
from pathlib import Path, PurePosixPath
from unittest import mock


SOURCE = Path(__file__).with_name("install-control.py")
SPEC = importlib.util.spec_from_file_location("install_control", SOURCE)
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class StageOnlyInstallTests(unittest.TestCase):
    sha = "b" * 40
    inbox = PurePosixPath("/srv/leetplus/inbox/" + sha)

    def control_archive(self):
        payload = {
            "control.sh": b"#!/usr/bin/bash -p\n",
            "control.mjs": b"export {};\n",
            "orchestrator.mjs": b"export {};\n",
            "contract.mjs": b"export {};\n",
            "network-fence.py": b"print('fixture')\n",
            "leetplus-compose-network-refresh.service": b"[Service]\n",
        }
        raw = io.BytesIO()
        with tarfile.open(fileobj=raw, mode="w") as archive:
            for name, content in payload.items():
                item = tarfile.TarInfo("deploy/leetplus-compose/" + name)
                item.size = len(content)
                archive.addfile(item, io.BytesIO(content))
        return gzip.compress(raw.getvalue(), mtime=0), payload

    def sources(self):
        archive, payload = self.control_archive()
        admission = {
            "contract": "LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION",
            "decision": "PASS",
            "releaseSha": self.sha,
            "repository": "boozik3412/leetplus",
            "event": "push",
            "ref": "refs/heads/main",
            "controlArchiveSha256": hashlib.sha256(archive).hexdigest(),
        }
        admission_raw = installer.canonical(admission)
        return {
            str(self.inbox / "docker-admission.json"): admission_raw,
            str(self.inbox / "control.tar.gz"): archive,
        }, hashlib.sha256(admission_raw).hexdigest(), payload

    def test_stage_only_writes_only_its_new_immutable_control_root(self):
        sources, expected, payload = self.sources()
        with tempfile.TemporaryDirectory() as temporary:
            fixture_root = Path(temporary)
            writes = []
            directories = []

            def fake_path(value):
                text = str(value)
                return fixture_root / text.lstrip("/") if text.startswith("/") else Path(value)

            def secure_file(path, limit):
                return sources[str(path)]

            def mkdir(path, mode=0o700):
                path = Path(path)
                directories.append(path)
                path.mkdir(parents=True, exist_ok=True)

            def publish(path, content, mode):
                path = Path(path)
                writes.append((path, content, mode))
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)

            with mock.patch.object(installer, "Path", side_effect=fake_path), \
                 mock.patch.object(installer.os, "getuid", return_value=0, create=True), \
                 mock.patch.object(installer, "secure_file", side_effect=secure_file), \
                 mock.patch.object(installer, "mkdir", side_effect=mkdir), \
                 mock.patch.object(installer, "publish", side_effect=publish), \
                 mock.patch.object(installer.subprocess, "check_output") as check_output:
                installer.install(self.inbox, expected, stage_only=True)

            target = fixture_root / "usr/local/lib/leetplus-compose" / self.sha
            self.assertTrue(target.is_dir())
            self.assertEqual({path.name for path, _, _ in writes}, set(payload) | {"install-manifest.json"})
            self.assertTrue(all(path.is_relative_to(target) for path, _, _ in writes))
            self.assertTrue(all(path.is_relative_to(fixture_root / "usr/local/lib/leetplus-compose") for path in directories))
            self.assertFalse((fixture_root / "etc").exists())
            self.assertFalse((fixture_root / "var").exists())
            self.assertFalse((fixture_root / "usr/local/sbin").exists())
            self.assertFalse(any(path.name.endswith((".service", ".timer")) and not path.is_relative_to(target) for path, _, _ in writes))
            check_output.assert_not_called()

    def test_stage_only_with_predecessor_rejects_before_any_mutation(self):
        sources, expected, _ = self.sources()
        writes = []
        directories = []
        predecessor = "a" * 40
        with mock.patch.object(installer.os, "getuid", return_value=0, create=True), \
             mock.patch.object(installer, "secure_file", side_effect=lambda path, limit: sources[str(path)]), \
             mock.patch.object(installer, "mkdir", side_effect=lambda *args: directories.append(args)), \
             mock.patch.object(installer, "publish", side_effect=lambda *args: writes.append(args)), \
             mock.patch.object(installer, "prepared_predecessor") as prepared:
            with self.assertRaisesRegex(ValueError, "Staging cannot replace"):
                installer.install(self.inbox, expected, previous_sha=predecessor, stage_only=True)
        self.assertEqual(writes, [])
        self.assertEqual(directories, [])
        prepared.assert_not_called()


if __name__ == "__main__":
    unittest.main()
