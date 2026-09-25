"""Guard the off-host backup transport and operation-owned staging cleanup."""
import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('leetplus_pull_backup', Path(__file__).with_name('pull-backup.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BackupPull(unittest.TestCase):
    def test_pinned_public_endpoint(self):
        with patch.object(module.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)) as run:
            module.fetch('/latest.json', Path('latest.json'), {'knownHosts': 'known_hosts', 'key': 'key'})
        args = run.call_args.args[0]
        self.assertIn('HostKeyAlias=188.234.220.76', args)
        self.assertIn('leetplus-backup@188.234.220.76:/latest.json', args)
        self.assertNotIn('leetplus-backup@192.168.1.137:/latest.json', args)

    def test_owned_staging_files_are_removed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            incoming = root / '.incoming' / '12345678-1234-1234-1234-123456789abc'
            incoming.mkdir(parents=True)
            (incoming / 'latest.json').write_text('{}')
            (incoming / 'backup-20260925T010000Z.lpbackup').write_bytes(b'partial')
            module.cleanup_incoming(root, incoming)
            self.assertFalse(incoming.exists())
            self.assertTrue((root / '.incoming').is_dir())

    def test_unexpected_staging_file_is_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            incoming = root / '.incoming' / '12345678-1234-1234-1234-123456789abc'
            incoming.mkdir(parents=True)
            extra = incoming / 'customer-data.bin'
            extra.write_bytes(b'keep')
            with self.assertRaisesRegex(ValueError, 'Unexpected backup staging file'):
                module.cleanup_incoming(root, incoming)
            self.assertEqual(extra.read_bytes(), b'keep')

    def test_cleanup_rejects_foreign_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            foreign = root / 'other' / '12345678-1234-1234-1234-123456789abc'
            foreign.mkdir(parents=True)
            with self.assertRaisesRegex(ValueError, 'Unexpected backup staging path'):
                module.cleanup_incoming(root, foreign)
            self.assertTrue(foreign.is_dir())

    def test_symlink_in_staging_is_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            incoming = root / '.incoming' / '12345678-1234-1234-1234-123456789abc'
            incoming.mkdir(parents=True)
            outside = root / 'outside.txt'
            outside.write_bytes(b'keep')
            try:
                (incoming / 'latest.json').symlink_to(outside)
            except (OSError, NotImplementedError):
                self.skipTest('symlink creation unavailable')
            with self.assertRaisesRegex(ValueError, 'Unexpected backup staging file'):
                module.cleanup_incoming(root, incoming)
            self.assertEqual(outside.read_bytes(), b'keep')


if __name__ == '__main__':
    unittest.main()
