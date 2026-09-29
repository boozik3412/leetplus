"""Disposable Linux root fixture for all-or-nothing public bundle enrollment."""
import io
import base64
import importlib.util
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
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


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'memfd_create'),
                     'Sealed captured launcher source requires Linux')
class CapturedLauncherTests(unittest.TestCase):
    def test_sealed_source_executes_original_after_path_replacement(self):
        launcher_path = Path(__file__).resolve().parents[2] / 'docs' / 'deployment' / \
            'production-artifact' / 'trusted_predecessor_bootstrap_launcher.py'
        spec = importlib.util.spec_from_file_location('captured_launcher_fixture', launcher_path)
        launcher = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(launcher)
        with tempfile.TemporaryDirectory(prefix='leetplus-sealed-launcher-') as directory:
            entry = Path(directory) / 'rpc_host.py'
            entry.write_bytes(b'raise RuntimeError("foreign path executed")\n')
            trusted = b'print("CAPTURED_LAUNCHER_OK")\n'
            packet = launcher.canonical({'deploy/transition-bootstrap/rpc_host.py':
                                         base64.b64encode(trusted).decode('ascii')})
            fd = os.memfd_create('leetplus-launcher-fixture', os.MFD_ALLOW_SEALING)
            try:
                import fcntl
                os.write(fd, packet)
                os.lseek(fd, 0, os.SEEK_SET)
                fcntl.fcntl(fd, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW |
                            fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
                child = subprocess.run([sys.executable, '-I', '-B', '-c', launcher.CAPTURED_LOADER,
                                        str(fd), str(entry)], pass_fds=(fd,), capture_output=True,
                                       timeout=10)
                self.assertEqual(child.returncode, 0, child.stderr.decode(errors='replace'))
                self.assertEqual(child.stdout, b'CAPTURED_LAUNCHER_OK\n')
            finally:
                os.close(fd)


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'getuid') and os.getuid() == 0,
                     'Signed runtime provision requires disposable Linux root')
class RuntimeProvisionTests(unittest.TestCase):
    def setUp(self):
        launcher_path = Path(__file__).resolve().parents[2] / 'docs' / 'deployment' / \
            'production-artifact' / 'trusted_predecessor_bootstrap_launcher.py'
        spec = importlib.util.spec_from_file_location('runtime_provision_launcher_fixture', launcher_path)
        self.launcher = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.launcher)
        self.root = Path(tempfile.mkdtemp(prefix='leetplus-runtime-provision-', dir='/run'))
        self.root.chmod(0o700)
        self.compose = self.root / 'compose'
        self.compose.mkdir(mode=0o700)
        self.runtime = self.root / 'transition'
        self.patches = [
            patch.object(self.launcher, 'COMPOSE_STATE', self.compose),
            patch.object(self.launcher, 'RUNTIME_STATE', self.runtime),
            patch.object(self.launcher, 'RUNTIME_REQUESTS', self.runtime / 'requests'),
            patch.object(self.launcher, 'RUNTIME_OPERATIONS', self.runtime / 'operations'),
            patch.object(self.launcher, 'RUNTIME_ATTEMPTS', self.runtime / 'attempts'),
            patch.object(self.launcher, 'TRANSITION_LOCK', self.runtime / 'transition.lock'),
            patch.object(self.launcher, 'APPROVAL_ROOT', self.root / 'approval-root.pem'),
            patch.object(self.launcher, 'MACHINE_ID', self.root / 'machine-id'),
        ]
        for item in self.patches:
            item.start()
        self.root.joinpath('machine-id').write_bytes(b'fixture-runtime-host\n')
        self.key = generate_key()
        self.root.joinpath('approval-root.pem').write_bytes(self.key['publicKey'].encode())
        for name in ('standalone-install.lock', 'control.lock'):
            (self.compose / name).touch(mode=0o600)
        self.placement = '12345678-1234-4123-8123-123456789abc'
        self.operation = '87654321-4321-4321-8321-abcdefabcdef'
        self.attempt = '99999999-9999-4999-8999-999999999999'
        self.installed = {'bundleSha256': 'a' * 64, 'installerReceiptSha256': 'b' * 64}
        self.request = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RPC_V1',
                        'command': 'observe', 'operationId': self.operation,
                        'attemptId': self.attempt, 'mode': 'A_TO_BRIDGE',
                        'targetRelease': 'c' * 40, 'criticalNames': [],
                        'evidence': {}, 'inputs': {}}
        self.request_raw = canonical(self.request)
        native = {str(self.compose / name): self.launcher.provision_preimage(self.compose / name)
                  for name in ('standalone-install.lock', 'control.lock')}
        preimages = {name: self.launcher.provision_preimage(path) for name, path in
                     self.launcher.provision_paths(self.placement).items()}
        self.plan = {'contract': self.launcher.RUNTIME_PROVISION_PLAN,
                     'placementId': self.placement, 'operationId': self.operation,
                     'attemptId': self.attempt, 'command': 'observe',
                     'hostIdentitySha256': digest(b'fixture-runtime-host'),
                     'bundleSha256': self.installed['bundleSha256'],
                     'installerReceiptSha256': self.installed['installerReceiptSha256'],
                     'requestSha256': digest(self.request_raw),
                     'preimages': preimages, 'nativeLocks': native,
                     'effects': self.launcher.RUNTIME_PROVISION_EFFECTS}
        now = datetime.now(timezone.utc)
        approval = {'contract': self.launcher.RUNTIME_PROVISION_APPROVAL,
                    'placementId': self.placement,
                    'hostIdentitySha256': self.plan['hostIdentitySha256'],
                    'planSha256': digest(canonical(self.plan)),
                    'issuedAt': iso(now - timedelta(seconds=10)),
                    'expiresAt': iso(now + timedelta(minutes=20))}
        self.envelope = {'approval': approval, 'signature': sign(approval, self.key)}

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        shutil.rmtree(self.root)

    def test_signed_runtime_request_stages_without_controller_effect(self):
        result = self.launcher.provision_runtime(self.plan, self.envelope,
                                                  self.request_raw, self.installed)
        self.assertEqual(result['decision'], 'REQUEST_STAGED_RUNTIME_DORMANT')
        self.assertEqual(self.launcher.reconcile_runtime(self.plan, self.envelope,
            self.request_raw, self.installed)['decision'], 'ALREADY_STAGED_RUNTIME_REQUEST')
        request, receipt_sha = self.launcher.verify_runtime_request(
            self.placement, self.operation, self.installed)
        self.assertEqual(request.read_bytes(), self.request_raw)
        self.assertEqual(receipt_sha, result['receiptSha256'])
        self.assertTrue((self.runtime / 'transition.lock').is_file())
        self.assertEqual(list((self.runtime / 'operations').iterdir()), [])
        self.assertEqual(list((self.runtime / 'attempts').iterdir()), [])

    def test_unsigned_placement_and_lost_receipt_fail_closed(self):
        forged = {'approval': self.envelope['approval'], 'signature': 'A' * 86 + '=='}
        with self.assertRaisesRegex(ValueError, 'signature rejected'):
            self.launcher.provision_runtime(self.plan, forged, self.request_raw, self.installed)
        self.assertFalse((self.compose / (self.placement + '.transition-provision.intent.json')).exists())
        original = self.launcher.write_new

        def lose_receipt(path, raw, mode):
            if path.name.endswith('.transition-provision.receipt.json'):
                raise RuntimeError('fixture lost runtime receipt')
            return original(path, raw, mode)

        with patch.object(self.launcher, 'write_new', side_effect=lose_receipt):
            with self.assertRaisesRegex(RuntimeError, 'lost runtime receipt'):
                self.launcher.provision_runtime(self.plan, self.envelope,
                                                self.request_raw, self.installed)
        self.assertEqual(self.launcher.reconcile_runtime(self.plan, self.envelope,
            self.request_raw, self.installed)['decision'],
            'COMPLETE_RUNTIME_POSTIMAGE_MISSING_RECEIPT_REQUIRES_SIGNED_RECOVERY')
        self.assertEqual(self.launcher.reconcile_runtime(self.plan, self.envelope,
            self.request_raw, self.installed, finalize=True)['decision'],
            'RECONCILED_EXACT_RUNTIME_RECEIPT')


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
        self.requests = self.root / 'requests'
        self.state = self.root / 'state'
        for directory in (self.controls, self.inbox, self.source_root, self.source,
                          self.installed, self.requests, self.state):
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
            'installerAuthority': {'helperSourceSha256': '1' * 64, 'verifierSourceSha256': '2' * 64,
                'introPlanSha256': '5' * 64, 'introReceiptSha256': '6' * 64,
                'generationRootManifestSha256': '3' * 64, 'generationReceiptSha256': '4' * 64},
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
            installer_source_path=self.installer_source, request_parent=self.requests)
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

    def test_separate_native_pending_and_dangling_entry_block_before_write(self):
        native = self.root / 'native-state'
        native.mkdir(mode=0o700)
        self.installer.pending_state = native
        pending = native / 'control-handoff.pending.json'
        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old):
            pending.write_bytes(b'foreign native pending\n')
            for action in (self.installer.prepare, self.installer.apply):
                with self.assertRaisesRegex(ValueError, 'pending handoff'):
                    action(self.plan, self.approval, self.roots, self.archive)
            self.assertEqual(list(self.state.iterdir()), [])
            self.assertEqual(list(self.installed.iterdir()), [])
            pending.unlink()
            pending.symlink_to(native / 'missing-target')
            with self.assertRaisesRegex(ValueError, 'pending handoff'):
                self.installer.apply(self.plan, self.approval, self.roots, self.archive)
            self.assertEqual(list(self.state.iterdir()), [])
            pending.unlink()
            before = sorted(p.name for p in self.root.iterdir())
            result = self.installer.prepare(self.plan, self.approval, self.roots, self.archive)
            self.assertEqual(result['decision'], 'PREPARED_NOT_AUTHORIZATION')
            self.assertEqual(before, sorted(p.name for p in self.root.iterdir()))
            self.assertEqual(list(self.state.iterdir()), [])
            self.assertEqual(list(self.installed.iterdir()), [])

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

    def test_intent_is_durable_before_first_operation_directory_write(self):
        operation = self.state / self.plan['operationId']
        flat = self.state / (self.plan['operationId'] + '.standalone-install.intent.json')
        original = Path.mkdir

        def fail_first_directory(path, *args, **kwargs):
            if path == operation:
                self.assertTrue(flat.is_file())
                raise RuntimeError('fixture lost first directory response')
            return original(path, *args, **kwargs)

        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old), \
             patch.object(Path, 'mkdir', new=fail_first_directory):
            with self.assertRaisesRegex(RuntimeError, 'first directory response'):
                self.installer.apply(self.plan, self.approval, self.roots, self.archive)
        self.assertEqual(self.installer.reconcile(self.plan, self.approval)['decision'],
                         'INTENT_ONLY_REQUIRES_SIGNED_RECOVERY')
        self.assertEqual(list(self.installed.iterdir()), [])

    def test_signed_captured_request_is_staged_before_install(self):
        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old):
            result = self.installer.stage_request(self.plan, self.approval, self.roots, self.archive)
            self.assertEqual(result['decision'], 'REQUEST_STAGED_ONLY_NOT_INSTALLED')
            self.assertEqual(self.installer.reconcile_request(
                self.plan, self.approval, self.roots, self.archive)['decision'],
                'ALREADY_STAGED_REQUEST')
            request = self.requests / ('bootstrap-install-' + self.plan['operationId'])
            self.assertEqual({path.name for path in request.iterdir()},
                             {'plan.json', 'approval.json', 'bundle.tar.gz',
                              'permit-root.pem', 'execution-root.pem',
                              'rollback-root.pem', 'noEffect-root.pem'})
            self.assertEqual(list(self.installed.iterdir()), [])
            with self.assertRaisesRegex(ValueError, 'Existing request'):
                self.installer.stage_request(self.plan, self.approval, self.roots, self.archive)

    def test_partial_request_and_lost_receipt_require_exact_reconciliation(self):
        original = bundle_installer._write_new

        def fail_archive(path, raw, mode=0o400):
            if path.name == 'bundle.tar.gz':
                raise RuntimeError('fixture lost request archive write')
            return original(path, raw, mode)

        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old), \
             patch.object(bundle_installer, '_write_new', side_effect=fail_archive):
            with self.assertRaisesRegex(RuntimeError, 'request archive write'):
                self.installer.stage_request(self.plan, self.approval, self.roots, self.archive)
        self.assertEqual(self.installer.reconcile_request(
            self.plan, self.approval, self.roots, self.archive)['decision'],
            'PARTIAL_REQUEST_REQUIRES_SIGNED_RECOVERY')
        self.assertEqual(list(self.installed.iterdir()), [])

    def test_request_expiry_at_first_write_leaves_no_intent(self):
        original = bundle_installer.validate_install_approval

        def expire_at_intent(plan, approval, root, **kwargs):
            if kwargs.get('accepted_at') is not None:
                raise ValueError('fixture approval expired at first write')
            return original(plan, approval, root, **kwargs)

        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old), \
             patch.object(bundle_installer, 'validate_install_approval', side_effect=expire_at_intent):
            with self.assertRaisesRegex(ValueError, 'expired at first write'):
                self.installer.stage_request(self.plan, self.approval, self.roots, self.archive)
        self.assertEqual(list(self.state.iterdir()), [])
        self.assertEqual(list(self.requests.iterdir()), [])

    def test_torn_request_intent_is_unknown_and_never_replayed(self):
        original = bundle_installer._write_new

        def tear_intent(path, raw, mode=0o400):
            if path.name.endswith('.standalone-install-request.intent.json'):
                path.write_bytes(raw[:8])
                raise RuntimeError('fixture torn request intent')
            return original(path, raw, mode)

        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old), \
             patch.object(bundle_installer, '_write_new', side_effect=tear_intent):
            with self.assertRaisesRegex(RuntimeError, 'torn request intent'):
                self.installer.stage_request(self.plan, self.approval, self.roots, self.archive)
        self.assertEqual(self.installer.reconcile_request(
            self.plan, self.approval, self.roots, self.archive)['decision'],
            'UNKNOWN_TORN_REQUEST_INTENT_REQUIRES_SIGNED_RECOVERY')
        self.assertEqual(list(self.requests.iterdir()), [])

    def test_torn_request_receipt_is_preserved_after_exact_publication(self):
        original = bundle_installer._write_new

        def tear_receipt(path, raw, mode=0o400):
            if path.name.endswith('.standalone-install-request.receipt.json'):
                path.write_bytes(raw[:8])
                raise RuntimeError('fixture torn request receipt')
            return original(path, raw, mode)

        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old), \
             patch.object(bundle_installer, '_write_new', side_effect=tear_receipt):
            with self.assertRaisesRegex(RuntimeError, 'torn request receipt'):
                self.installer.stage_request(self.plan, self.approval, self.roots, self.archive)
        receipt = self.state / (self.plan['operationId'] + '.standalone-install-request.receipt.json')
        before = receipt.read_bytes()
        self.assertEqual(self.installer.reconcile_request(
            self.plan, self.approval, self.roots, self.archive)['decision'],
            'PARTIAL_REQUEST_RECEIPT_REQUIRES_SIGNED_RECOVERY')
        self.assertEqual(receipt.read_bytes(), before)

    def test_torn_install_intent_is_unknown_without_candidate_staging(self):
        original = bundle_installer._write_new

        def tear_intent(path, raw, mode=0o400):
            if path.name.endswith('.standalone-install.intent.json'):
                path.write_bytes(raw[:8])
                raise RuntimeError('fixture torn install intent')
            return original(path, raw, mode)

        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old), \
             patch.object(bundle_installer, '_write_new', side_effect=tear_intent):
            with self.assertRaisesRegex(RuntimeError, 'torn install intent'):
                self.installer.apply(self.plan, self.approval, self.roots, self.archive)
        self.assertEqual(self.installer.reconcile(self.plan, self.approval)['decision'],
                         'UNKNOWN_TORN_INSTALL_INTENT_REQUIRES_SIGNED_RECOVERY')
        self.assertEqual(list(self.installed.iterdir()), [])

    def test_pending_install_receipt_is_classified_without_overwrite(self):
        original = bundle_installer._write_new

        def tear_pending(path, raw, mode=0o400):
            if path.name == '.receipt.json.pending':
                path.write_bytes(raw[:8])
                raise RuntimeError('fixture torn install receipt')
            return original(path, raw, mode)

        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old), \
             patch.object(bundle_installer, '_write_new', side_effect=tear_pending):
            with self.assertRaisesRegex(RuntimeError, 'torn install receipt'):
                self.installer.apply(self.plan, self.approval, self.roots, self.archive)
        pending = self.state / self.plan['operationId'] / '.receipt.json.pending'
        before = pending.read_bytes()
        self.assertEqual(self.installer.reconcile(self.plan, self.approval)['decision'],
                         'PARTIAL_INSTALL_RECEIPT_REQUIRES_SIGNED_RECOVERY')
        self.assertEqual(pending.read_bytes(), before)

    def test_terminal_receipt_with_lost_final_is_not_no_effect(self):
        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old):
            self.installer.apply(self.plan, self.approval, self.roots, self.archive)
        final = self.installed / self.plan['bundleSha256']
        retained = self.installed / 'fixture-retained-postimage'
        final.rename(retained)
        self.assertEqual(self.installer.reconcile(self.plan, self.approval)['decision'],
                         'INCONSISTENT_TERMINAL_RECEIPT_REQUIRES_SIGNED_RECOVERY')
        final.mkdir(mode=0o700)
        self.assertEqual(self.installer.reconcile(self.plan, self.approval)['decision'],
                         'PARTIAL_FINAL_REQUIRES_SIGNED_RECOVERY')
        self.assertTrue(retained.is_dir())

    def test_partial_audit_and_staging_are_not_classified_as_no_effect(self):
        original = bundle_installer._publish_new

        def fail_approval(directory, name, raw, mode=0o400):
            if name == 'approval.json':
                raise RuntimeError('fixture lost approval response')
            return original(directory, name, raw, mode)

        with patch.object(bundle_installer, 'admitted_control', return_value=self.fake_old), \
             patch.object(bundle_installer, '_publish_new', side_effect=fail_approval):
            with self.assertRaisesRegex(RuntimeError, 'approval response'):
                self.installer.apply(self.plan, self.approval, self.roots, self.archive)
        self.assertEqual(self.installer.reconcile(self.plan, self.approval)['decision'],
                         'PARTIAL_AUDIT_REQUIRES_SIGNED_RECOVERY')
        operation = self.state / self.plan['operationId']
        (operation / 'approval.json').write_bytes(canonical(self.approval))
        (operation / 'intent.json').write_bytes(secure_read(self.state /
            (self.plan['operationId'] + '.standalone-install.intent.json')))
        temporary = self.installed / ('.' + self.plan['bundleSha256'] + '.' +
                                      self.plan['operationId'] + '.pending')
        temporary.mkdir(mode=0o700)
        self.assertEqual(self.installer.reconcile(self.plan, self.approval)['decision'],
                         'PARTIAL_STAGING_REQUIRES_SIGNED_RECOVERY')
        temporary.rmdir()
        final = self.installed / self.plan['bundleSha256']
        final.symlink_to(self.installed / 'missing-generation')
        self.assertEqual(self.installer.reconcile(self.plan, self.approval)['decision'],
                         'FOREIGN_FINAL_REQUIRES_SIGNED_RECOVERY')
        final.unlink()
        self.assertEqual(self.installer.reconcile(self.plan, self.approval)['decision'],
                         'NO_INSTALLED_EFFECT_REQUIRES_SIGNED_RECOVERY')

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

        enrollment = rewrite_lineage(self.deployment['publicKey'].encode(), 'execution')
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
        self.assertEqual(result['capturedFiles']['deploy/transition-bootstrap/rpc_host.py'],
                         self.members['deploy/transition-bootstrap/rpc_host.py'])
        target.write_bytes(b'foreign code\n')
        self.assertEqual(result['capturedFiles']['deploy/transition-bootstrap/rpc_host.py'],
                         self.members['deploy/transition-bootstrap/rpc_host.py'])
        with self.assertRaisesRegex(ValueError, 'module byte changed'):
            launcher.verify_installed_bundle(final,
                deployment_root=self.deployment_path, machine_id=self.machine,
                source_inbox=self.source_root, node=TEST_NODE)

if __name__ == '__main__':
    unittest.main()
