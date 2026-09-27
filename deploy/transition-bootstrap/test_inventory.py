"""Disposable Linux root fixture for exact admission and target byte reads."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import tarfile
import tempfile
import unittest

from inventory import admitted_control, digest
from native_boundary import canonical, verify_bundle_inventory

SHA = 'a' * 40


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'getuid') and os.getuid() == 0,
                     'Exact native inventory requires Linux root')
class InstalledInventoryTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='leetplus-bootstrap-inventory-', dir='/run'))
        self.root.chmod(0o700)
        self.controls = self.root / 'controls'
        self.inbox = self.root / 'inbox'
        for directory in (self.controls, self.inbox, self.controls / SHA, self.inbox / SHA):
            directory.mkdir(mode=0o700)
        self.leaves = {'control.sh': b'#!/bin/sh\n', 'control_handoff.py': b'print("source only")\n'}
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as archive:
            for name, data in self.leaves.items():
                item = tarfile.TarInfo('deploy/leetplus-compose/' + name)
                item.size = len(data)
                item.mode = 0o400
                archive.addfile(item, io.BytesIO(data))
        self.archive = stream.getvalue()
        self.release = {'releaseSha': SHA}
        self.admission = {'contract': 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION',
            'decision': 'PASS', 'releaseSha': SHA, 'repository': 'boozik3412/leetplus',
            'event': 'push', 'ref': 'refs/heads/main',
            'controlArchiveSha256': digest(self.archive),
            'releaseManifestSha256': digest(canonical(self.release))}
        self.files = {name: digest(data) for name, data in self.leaves.items()}
        self.manifest = {'contract': 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL',
                         'releaseSha': SHA, 'admissionSha256': digest(canonical(self.admission)),
                         'files': self.files}
        for name, data in self.leaves.items():
            (self.controls / SHA / name).write_bytes(data)
        (self.controls / SHA / 'install-manifest.json').write_bytes(canonical(self.manifest))
        (self.inbox / SHA / 'docker-admission.json').write_bytes(canonical(self.admission))
        (self.inbox / SHA / 'release.json').write_bytes(canonical(self.release))
        (self.inbox / SHA / 'control.tar.gz').write_bytes(self.archive)

    def tearDown(self):
        shutil.rmtree(self.root)

    def observed(self):
        return admitted_control(controls_root=self.controls, inbox_root=self.inbox, release_sha=SHA)

    def test_reproduces_full_installed_archive_and_exact_main_provenance(self):
        value = self.observed()
        self.assertEqual(value['files'], self.files)
        self.assertEqual(value['controlArchiveSha256'], digest(self.archive))
        self.assertEqual(value['admissionSha256'], digest(canonical(self.admission)))

    def test_rejects_mutated_added_symlink_and_hardlinked_privileged_leaf(self):
        leaf = self.controls / SHA / 'control.sh'
        original = leaf.read_bytes()
        leaf.write_bytes(b'changed\n')
        with self.assertRaisesRegex(ValueError, 'bundle byte|Privileged native leaf'):
            self.observed()
        leaf.write_bytes(original)
        extra = self.controls / SHA / 'root-helper.py'
        extra.write_bytes(b'pass\n')
        with self.assertRaisesRegex(ValueError, 'inventory differs'):
            self.observed()
        extra.unlink()
        leaf.unlink()
        leaf.symlink_to(self.inbox / SHA / 'release.json')
        with self.assertRaises(OSError):
            self.observed()
        leaf.unlink()
        os.link(self.inbox / SHA / 'release.json', leaf)
        with self.assertRaisesRegex(ValueError, 'Untrusted native file'):
            self.observed()

    def test_rejects_wrong_event_ref_archive_and_manifest(self):
        admission = self.inbox / SHA / 'docker-admission.json'
        admission.write_bytes(canonical({**self.admission, 'event': 'workflow_dispatch'}))
        with self.assertRaisesRegex(ValueError, 'exact-main admitted'):
            self.observed()
        admission.write_bytes(canonical(self.admission))
        archive = self.inbox / SHA / 'control.tar.gz'
        archive.write_bytes(self.archive + b'foreign')
        with self.assertRaisesRegex(ValueError, 'archive'):
            self.observed()
        archive.write_bytes(self.archive)
        manifest = self.controls / SHA / 'install-manifest.json'
        manifest.write_bytes(canonical({**self.manifest, 'releaseSha': 'b' * 40}))
        with self.assertRaisesRegex(ValueError, 'manifest'):
            self.observed()

    def test_closed_bundle_inventory_rejects_extra_and_symlink(self):
        root = self.root / 'bundle'
        (root / 'deploy' / 'transition-bootstrap').mkdir(parents=True)
        (root / 'deploy' / 'transition-bootstrap' / 'protocol.mjs').write_bytes(b'protocol\n')
        files = {'deploy/transition-bootstrap/protocol.mjs': digest(b'protocol\n')}
        self.assertTrue(verify_bundle_inventory(root, files))
        foreign = root / 'deploy' / 'transition-bootstrap' / 'secret.pem'
        foreign.write_bytes(b'foreign\n')
        with self.assertRaisesRegex(ValueError, 'unexpected leaf'):
            verify_bundle_inventory(root, files)
        foreign.unlink()
        protocol = root / 'deploy' / 'transition-bootstrap' / 'protocol.mjs'
        protocol.unlink()
        protocol.symlink_to(self.inbox / SHA / 'release.json')
        with self.assertRaises(OSError):
            verify_bundle_inventory(root, files)


if __name__ == '__main__':
    unittest.main()
