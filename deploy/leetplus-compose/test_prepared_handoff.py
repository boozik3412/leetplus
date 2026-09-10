"""Preparation replacement must fail before touching an enrolled control plane."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-control.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class PreparedHandoff(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.sha = '1' * 40
        self.state = self.root / 'var/lib/leetplus-compose'
        (self.state / 'operations').mkdir(parents=True)
        (self.state / 'preparation-only').write_text('')
        self.control = self.root / 'usr/local/lib/leetplus-compose' / self.sha
        self.control.mkdir(parents=True)
        (self.control / 'control.sh').write_bytes(b'controlled')
        manifest = {'contract': 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL', 'releaseSha': self.sha,
                    'files': {'control.sh': hashlib.sha256(b'controlled').hexdigest()}}
        (self.control / 'install-manifest.json').write_text(json.dumps(manifest))
        self.patches = [patch.object(installer, 'Path', side_effect=lambda value: self.root / str(value).lstrip('/')),
                        patch.object(installer, 'secure_file', side_effect=lambda p, limit: p.read_bytes()),
                        patch.object(installer.subprocess, 'check_output', return_value='')]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in reversed(self.patches): p.stop()
        self.temp.cleanup()

    def test_empty_verified_preparation_can_select_predecessor(self):
        self.assertEqual(installer.prepared_predecessor(self.sha), self.control)

    def test_accepted_runtime_blocks(self):
        (self.state / 'active.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'enrolled'):
            installer.prepared_predecessor(self.sha)

    def test_pending_operation_blocks(self):
        (self.state / 'operations/pending').mkdir()
        with self.assertRaisesRegex(ValueError, 'authority'):
            installer.prepared_predecessor(self.sha)

    def test_existing_container_blocks(self):
        with patch.object(installer.subprocess, 'check_output', return_value='container-id\n'):
            with self.assertRaisesRegex(ValueError, 'containers'):
                installer.prepared_predecessor(self.sha)

    def test_changed_predecessor_file_blocks(self):
        (self.control / 'control.sh').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'bytes differ'):
            installer.prepared_predecessor(self.sha)

    def test_worker_grant_blocks(self):
        (self.state / 'worker-grants').mkdir()
        (self.state / 'worker-grants/live.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'authority'):
            installer.prepared_predecessor(self.sha)


if __name__ == '__main__':
    unittest.main()
