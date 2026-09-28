"""Disposable Linux root fixture for all-or-nothing public bundle enrollment."""
import io
import importlib.util
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import shutil
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import bundle_installer
from bundle_installer import StandaloneBundleInstaller
from enrollment import INSTALL_EFFECTS, INSTALL_PLAN, INSTALL_APPROVAL, REQUIRED_BUNDLE_FILES, validate_enrollment_chain
from inventory import digest
from native_boundary import canonical, secure_read
from test_canonical_lineage import generate_key, sign, iso, TEST_NODE


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'getuid') and os.getuid() == 0,
                     'Public-only native install requires Linux root')
class BundleInstallerTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='leetplus-bundle-install-', dir='/run'))
        self.now = datetime.now(timezone.utc)
        self.root.chmod(0o700)
        self.controls = self.root / 'controls'
        self.inbox = self.root / 'inbox'
        self.source_root = self.root / 'source-inbox'
        self.source_sha = 'd' * 40
        self.source = self.source_root / self.source_sha
        self.installed = self.root / 'installed'
        self.state = self.root / 'state'
        for directory in (self.controls, self.inbox, self.source_root, self.source,
                          self.installed, self.state):
            directory.mkdir(mode=0o700)
        self.machine = self.root / 'machine-id'
        self.machine.write_bytes(b'fixture-host-id\n')
        self.core = self.root / 'core'
        self.core.symlink_to('/usr/local/lib/leetplus-compose/' + bundle_installer.A_RELEASE + '/control.sh')
        self.deployment = generate_key()
        self.deployment_path = self.root / 'deployment-root.pem'
        self.deployment_path.write_bytes(self.deployment['publicKey'].encode())
        self.installer_source = self.root / 'installer-source.py'
        self.installer_source.write_bytes(b'fixture exact reviewed installer\n')
        self.locks = []
        for name in ('install.lock', 'control.lock'):
            path = self.root / name
            path.touch(mode=0o600)
            self.locks.append(path)
        self.keys = {name: generate_key() for name in bundle_installer.ROOT_NAMES}
        self.roots = {name: key['publicKey'].encode() for name, key in self.keys.items()}
        self.members = {name: ('fixture ' + name + '\n').encode()
                        for name in sorted(REQUIRED_BUNDLE_FILES)}
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as tar:
            for name, raw in self.members.items():
                item = tarfile.TarInfo(name)
                item.size = len(raw)
                item.mode = 0o400
                tar.addfile(item, io.BytesIO(raw))
        self.archive = stream.getvalue()
        source_admission = {'contract': 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION',
            'decision': 'PASS', 'releaseSha': self.source_sha,
            'repository': 'boozik3412/leetplus', 'event': 'push', 'ref': 'refs/heads/main'}
        (self.source / 'docker-admission.json').write_bytes(canonical(source_admission))
        self.plan = {'contract': INSTALL_PLAN,
            'operationId': '12345678-1234-4123-8123-123456789abc',
            'action': 'INSTALL_INDEPENDENT_PUBLIC_ONLY_ADAPTER',
            'hostIdentitySha256': digest(b'fixture-host-id'),
            'predecessorReleaseSha': bundle_installer.A_RELEASE,
            'predecessorManifestSha256': bundle_installer.A_MANIFEST,
            'oldCorePointer': os.readlink(self.core), 'sourceRelease': self.source_sha,
            'sourceAdmissionSha256': digest(canonical(source_admission)),
            'installerSourceSha256': digest(self.installer_source.read_bytes()),
            'bundleFiles': {name: digest(raw) for name, raw in self.members.items()},
            'bundleSha256': digest(canonical({name: digest(raw) for name, raw in self.members.items()})),
            'bundleArchiveSha256': digest(self.archive),
            'publicRoots': {name: digest(raw) for name, raw in self.roots.items()},
            'effects': INSTALL_EFFECTS.copy()}
        approval = {'contract': INSTALL_APPROVAL, 'operationId': self.plan['operationId'],
            'hostIdentitySha256': self.plan['hostIdentitySha256'],
            'planSha256': digest(canonical(self.plan)), 'action': self.plan['action'],
            'issuedAt': iso(self.now - timedelta(seconds=10)),
            'expiresAt': iso(self.now + timedelta(minutes=20))}
        self.approval = {'approval': approval, 'signature': sign(approval, self.deployment)}
        self.installer = StandaloneBundleInstaller(controls_root=self.controls, inbox_root=self.inbox,
            source_inbox=self.source, installed_parent=self.installed, state_root=self.state,
            machine_id=self.machine, core_pointer=self.core, deployment_root=self.deployment_path,
            install_lock=self.locks[0], control_lock=self.locks[1],
            installer_source_path=self.installer_source)
        self.fake_old = {'releaseSha': bundle_installer.A_RELEASE,
            'manifestSha256': bundle_installer.A_MANIFEST,
            'files': {'control_handoff.py': bundle_installer.A_EXECUTOR}}

    def tearDown(self):
        shutil.rmtree(self.root)

    def test_public_only_bundle_is_single_atomic_install_and_receipted(self):
        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old):
            self.assertEqual(self.installer.prepare(self.plan, self.approval, self.roots,
                                                     self.archive)['decision'], 'PREPARED_NOT_AUTHORIZATION')
            self.assertEqual(list(self.installed.iterdir()), [])
            result = self.installer.apply(self.plan, self.approval, self.roots, self.archive)
            self.assertEqual(result['decision'], 'INSTALLED_PUBLIC_ONLY_NOT_ACTIVE')
            self.assertEqual(self.installer.reconcile(self.plan, self.approval)['decision'],
                             'ALREADY_INSTALLED_PUBLIC_ONLY')
            final = self.installed / self.plan['bundleSha256']
            self.assertTrue((final / 'enrollment' / 'enrollment.json').is_file())
            self.assertTrue((final / 'bundle' / 'deploy' / 'transition-bootstrap' / 'protocol.mjs').is_file())
            self.assertEqual({item.name for item in final.iterdir()}, {'bundle', 'enrollment'})

    def test_mutated_archive_foreign_host_and_private_root_fail_before_intent(self):
        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old):
            with self.assertRaisesRegex(ValueError, 'archive'):
                self.installer.prepare(self.plan, self.approval, self.roots, self.archive + b'changed')
            self.machine.write_bytes(b'foreign-host\n')
            with self.assertRaisesRegex(ValueError, 'host identity'):
                self.installer.prepare(self.plan, self.approval, self.roots, self.archive)
            self.machine.write_bytes(b'fixture-host-id\n')
            roots = dict(self.roots)
            roots['permit'] = b'-----BEGIN PRIVATE KEY-----\nfoo\n-----END PRIVATE KEY-----\n'
            with self.assertRaisesRegex(ValueError, 'Public root'):
                self.installer.prepare(self.plan, self.approval, roots, self.archive)
            self.assertEqual(list(self.state.iterdir()), [])
            self.assertEqual(list(self.installed.iterdir()), [])

    def test_lost_response_after_directory_rename_reconciles_without_reinstall(self):
        original = bundle_installer._publish_new
        def fail_receipt(directory, name, raw, mode=0o400):
            if name == 'receipt.json':
                raise RuntimeError('fixture lost installer response')
            return original(directory, name, raw, mode)
        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old):
            with patch.object(bundle_installer, '_publish_new', side_effect=fail_receipt):
                with self.assertRaisesRegex(RuntimeError, 'lost installer response'):
                    self.installer.apply(self.plan, self.approval, self.roots, self.archive)
            final = self.installed / self.plan['bundleSha256']
            self.assertTrue(final.is_dir())
            self.assertEqual(self.installer.reconcile(self.plan, self.approval)['decision'],
                             'RECONCILED_INSTALLED_PUBLIC_ONLY')
            self.assertEqual({item.name for item in self.installed.iterdir()},
                             {self.plan['bundleSha256']})

    def test_historical_enrollment_rejects_same_key_with_alternate_pem_and_deployment_root(self):
        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old):
            self.installer.apply(self.plan, self.approval, self.roots, self.archive)
        enrollment_root = self.installed / self.plan['bundleSha256'] / 'enrollment'

        def rewrite_lineage(changed_root, name):
            plan = json.loads(secure_read(enrollment_root / 'installer-plan.json'))
            plan['publicRoots'][name] = digest(changed_root)
            approval = dict(self.approval['approval'])
            approval['planSha256'] = digest(canonical(plan))
            envelope = {'approval': approval, 'signature': sign(approval, self.deployment)}
            intent = json.loads(secure_read(enrollment_root / 'installer-intent.json'))
            intent['planSha256'] = digest(canonical(plan))
            intent['approvalSha256'] = digest(canonical(envelope))
            receipt = json.loads(secure_read(enrollment_root / 'installer-receipt.json'))
            receipt['planSha256'] = digest(canonical(plan))
            receipt['approvalSha256'] = digest(canonical(envelope))
            receipt['intentSha256'] = digest(canonical(intent))
            receipt['publicRoots'] = plan['publicRoots']
            enrollment = json.loads(secure_read(enrollment_root / 'enrollment.json'))
            enrollment['publicRoots'] = plan['publicRoots']
            enrollment['installerReceiptSha256'] = digest(canonical(receipt))
            for leaf, value in [('installer-plan.json', plan), ('installer-approval.json', envelope),
                                ('installer-intent.json', intent), ('installer-receipt.json', receipt),
                                ('enrollment.json', enrollment)]:
                (enrollment_root / leaf).write_bytes(canonical(value))
            (enrollment_root / (name + '-root.pem')).write_bytes(changed_root)
            return enrollment

        permit = self.roots['permit'].decode('ascii')
        data = ''.join(line for line in permit.splitlines() if not line.startswith('-----'))
        alternate = ('-----BEGIN PUBLIC KEY-----\n' + '\n'.join(data[index:index + 32]
                     for index in range(0, len(data), 32)) + '\n-----END PUBLIC KEY-----\n').encode()
        self.assertNotEqual(alternate, self.roots['permit'])
        enrollment = rewrite_lineage(alternate, 'execution')
        with self.assertRaisesRegex(ValueError, 'key domains collapse'):
            validate_enrollment_chain(enrollment_root, enrollment, self.deployment['publicKey'])

    def test_separately_sourced_launcher_validates_full_chain_before_candidate_import(self):
        launcher_path = Path(__file__).resolve().parents[2] / 'docs' / 'deployment' / 'production-artifact' / \
            'trusted_predecessor_bootstrap_launcher.py'
        spec = importlib.util.spec_from_file_location('trusted_predecessor_launcher_fixture', launcher_path)
        launcher = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(launcher)
        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old):
            self.installer.apply(self.plan, self.approval, self.roots, self.archive)
        final = self.installed / self.plan['bundleSha256']
        result = launcher.verify_installed_bundle(final,
            deployment_root=self.deployment_path, machine_id=self.machine,
            source_inbox=self.source_root, node=TEST_NODE)
        self.assertEqual(result['bundleSha256'], self.plan['bundleSha256'])
        target = final / 'bundle' / 'deploy' / 'transition-bootstrap' / 'rpc_host.py'
        target.write_bytes(b'foreign code\n')
        with self.assertRaisesRegex(ValueError, 'module byte changed'):
            launcher.verify_installed_bundle(final,
                deployment_root=self.deployment_path, machine_id=self.machine,
                source_inbox=self.source_root, node=TEST_NODE)

        enrollment = rewrite_lineage(self.deployment['publicKey'].encode(), 'execution')
        with self.assertRaisesRegex(ValueError, 'key domains collapse'):
            validate_enrollment_chain(enrollment_root, enrollment, self.deployment['publicKey'])


if __name__ == '__main__':
    unittest.main()
