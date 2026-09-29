"""Offline ephemeral-key signer fixture; never reads production private keys."""
from datetime import datetime, timedelta, timezone
import json
import importlib.util
import copy
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from offline_sign import canonical, digest, sign_exact, validate_statement
from enrollment import INSTALL_EFFECTS, REQUIRED_BUNDLE_FILES


def iso(value):
    return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


class OfflineSignerTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='leetplus-bootstrap-sign-',
            dir=tempfile.gettempdir())).resolve()
        self.now = datetime.now(timezone.utc)
        self.plan = {'contract': 'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_PLAN',
            'operationId': '12345678-1234-4123-8123-123456789abc'}
        self.permit = {'permit': {'contract': 'LEETPLUS_A_BRIDGE_BOOTSTRAP_PERMIT_V1'},
                       'signature': 'A' * 86 + '=='}
        self.statement = {'contract': 'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_EXECUTION',
            'operationId': self.plan['operationId'], 'planSha256': digest(canonical(self.plan)),
            'permitEnvelopeSha256': digest(canonical(self.permit)),
            'effect': 'CONTROLLER_POINTER_ONLY',
            'issuedAt': iso(self.now - timedelta(seconds=10)),
            'expiresAt': iso(self.now + timedelta(minutes=10))}
        self.linked = {'plan': self.plan, 'permitEnvelope': self.permit}
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        self.key = Ed25519PrivateKey.generate()
        self.deployment = Ed25519PrivateKey.generate()
        self.roots = {name: Ed25519PrivateKey.generate() for name in
                      ('permit', 'execution', 'rollback', 'noEffect')}
        self.roots['execution'] = self.key
        public_roots = {name: private.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode('ascii')
            for name, private in self.roots.items()}
        deployment_pem = self.deployment.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode('ascii')
        bundle_files = {name: digest(name.encode()) for name in sorted(REQUIRED_BUNDLE_FILES)}
        install_plan = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_PLAN',
            'operationId': '11111111-1111-4111-8111-111111111111',
            'action': 'INSTALL_INDEPENDENT_PUBLIC_ONLY_ADAPTER',
            'hostIdentitySha256': '1' * 64, 'predecessorReleaseSha': 'a' * 40,
            'predecessorManifestSha256': '2' * 64,
            'oldCorePointer': '/usr/local/lib/leetplus-compose/' + 'a' * 40 + '/control.sh',
            'sourceRelease': 'b' * 40, 'sourceAdmissionSha256': '3' * 64,
            'installerSourceSha256': '4' * 64, 'bundleFiles': bundle_files,
            'installerAuthority': {'helperSourceSha256': '1' * 64, 'verifierSourceSha256': '2' * 64,
                'introPlanSha256': '5' * 64, 'introReceiptSha256': '6' * 64,
                'generationRootManifestSha256': '3' * 64, 'generationReceiptSha256': '4' * 64},
            'bundleSha256': digest(canonical(bundle_files)), 'bundleArchiveSha256': '5' * 64,
            'publicRoots': {name: digest(value.encode('ascii')) for name, value in public_roots.items()},
            'effects': INSTALL_EFFECTS.copy()}
        install_approval = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_APPROVAL',
            'operationId': install_plan['operationId'],
            'hostIdentitySha256': install_plan['hostIdentitySha256'],
            'planSha256': digest(canonical(install_plan)), 'action': install_plan['action'],
            'issuedAt': iso(self.now - timedelta(minutes=15)),
            'expiresAt': iso(self.now + timedelta(minutes=10))}
        approval_envelope = {'approval': install_approval,
            'signature': __import__('base64').b64encode(self.deployment.sign(
                canonical(install_approval))).decode()}
        install_intent = {'contract': install_plan['contract'] + '_INTENT',
            'operationId': install_plan['operationId'],
            'planSha256': digest(canonical(install_plan)),
            'approvalSha256': digest(canonical(approval_envelope)),
            'authorizedAt': iso(self.now - timedelta(minutes=10))}
        install_receipt = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_RECEIPT',
            'decision': 'PASS', 'operationId': install_plan['operationId'],
            'planSha256': digest(canonical(install_plan)),
            'approvalSha256': digest(canonical(approval_envelope)),
            'intentSha256': digest(canonical(install_intent)),
            'bundleSha256': install_plan['bundleSha256'],
            'publicRoots': install_plan['publicRoots'],
            'hostIdentitySha256': install_plan['hostIdentitySha256'],
            'acceptedAt': install_intent['authorizedAt']}
        install_record = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_ENROLLMENT_V2',
            'decision': 'ACCEPTED', 'hostIdentitySha256': install_plan['hostIdentitySha256'],
            'bundleFiles': bundle_files, 'bundleSha256': install_plan['bundleSha256'],
            'publicRoots': install_plan['publicRoots'],
            'installerReceiptSha256': digest(canonical(install_receipt))}
        self.linked['enrollmentEvidence'] = {'plan': install_plan,
            'approvalEnvelope': approval_envelope, 'intent': install_intent,
            'receipt': install_receipt, 'record': install_record,
            'deploymentRootPem': deployment_pem, 'publicRoots': public_roots}
        self.public = self.key.public_key().public_bytes(serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        self.der = self.key.public_key().public_bytes(serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        self.statement_path = self.root / 'statement.json'
        self.linked_path = self.root / 'linked.json'
        self.public_path = self.root / 'public.pem'
        self.output = self.root / 'signature.json'
        self.statement_path.write_bytes(canonical(self.statement))
        self.linked_path.write_bytes(canonical(self.linked))
        self.public_path.write_bytes(self.public)
        self.confirm = f'GO BOOTSTRAP-SIGN execution {self.plan["operationId"]} {digest(canonical(self.statement))} {digest(self.der)}'

    def tearDown(self):
        trusted = Path(tempfile.gettempdir()).resolve()
        if not self.root.is_relative_to(trusted) or self.root == trusted:
            raise ValueError('Disposable signer fixture escaped temp root')
        shutil.rmtree(self.root)

    def sign(self, **overrides):
        arguments = {'kind': 'execution', 'statement_path': self.statement_path,
            'linked_path': self.linked_path, 'public_path': self.public_path,
            'expected_public_der_sha256': digest(self.der), 'private_path': self.root / 'unused.dpapi',
            'output_path': self.output, 'confirm': self.confirm,
            'now': self.now, 'private_loader': lambda _path: self.key}
        arguments.update(overrides)
        return sign_exact(**arguments)

    def test_exact_plan_permit_and_public_key_sign_once_without_key_output(self):
        result = self.sign()
        self.assertEqual(result['kind'], 'execution')
        envelope = json.loads(self.output.read_bytes())
        self.assertEqual(envelope['command'], self.statement)
        import base64
        self.key.public_key().verify(base64.b64decode(envelope['signature']),
                                     canonical(self.statement))
        self.assertNotIn('PRIVATE', self.output.read_text())
        with self.assertRaisesRegex(ValueError, 'Exclusive canonical signer output'):
            self.sign()

    def test_invalid_confirmation_or_foreign_plan_stops_before_private_loader(self):
        calls = []
        def loader(_path):
            calls.append('private')
            raise AssertionError('Private key must not be read')
        with self.assertRaisesRegex(ValueError, 'confirmation'):
            self.sign(confirm='forwarded yes', private_loader=loader)
        changed = dict(self.statement)
        changed['planSha256'] = '0' * 64
        self.statement_path.write_bytes(canonical(changed))
        with self.assertRaisesRegex(ValueError, 'exact plan'):
            self.sign(private_loader=loader)
        self.assertEqual(calls, [])

    def test_transport_finalize_signer_has_only_two_frozen_write_destinations(self):
        import subprocess
        from cryptography.hazmat.primitives import serialization
        from offline_sign import INITIAL_VALIDATOR_PINS
        repo = Path(__file__).resolve().parents[2]
        spec = importlib.util.spec_from_file_location('offline_finalize_fixture',
            repo / 'deploy' / 'leetplus-compose' / 'test_standalone_intro_transport.py')
        fixture = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture)
        transport = fixture.transport
        original = fixture.plan_fixture()
        old = original['operationId']
        recovery = '44444444-4444-4444-8444-444444444444'
        public = self.deployment.public_key().public_bytes(serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        der = self.deployment.public_key().public_bytes(serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        code = copy.deepcopy(original['execution']['code'])
        code['finalizeEntrySha256'] = code.pop('transportEntrySha256')
        plan = {'contract': transport.FINALIZE_PLAN, 'operationId': recovery,
            'action': transport.FINALIZE_ACTION, 'hostIdentitySha256': original['hostIdentitySha256'],
            'bootId': original['execution']['host']['bootId'], 'originalOperationId': old,
            'originalPlanSha256': 'a' * 64, 'originalApprovalSha256': 'b' * 64,
            'originalIntentSha256': 'c' * 64, 'requestReceiptSha256': 'd' * 64,
            'effects': copy.deepcopy(transport.FINALIZE_EFFECTS),
            'execution': {'code': code, 'invocation': {'interpreter': '/usr/bin/python3',
                'flags': ['-I', '-B', '-c'], 'mode': 'memory-captured-python-c', 'action': 'finalize-reconcile'},
                'host': original['execution']['host'],
                'nativeControlLockIdentity': original['execution']['nativeControlLockIdentity'],
                'trustRoot': {'path': '/etc/leetplus-compose/approval-root.pem', 'rawSha256': digest(public)},
                'auditDirectoryIdentity': {'device': 1, 'inode': 11, 'uid': 0, 'gid': 0, 'mode': 0o700},
                'requestDirectoryIdentity': {'device': 1, 'inode': 12, 'uid': 0, 'gid': 0, 'mode': 0o700},
                'destinations': {
                    transport.STATE + '/' + old + '.standalone-transport-finalize.intent.json':
                        {'kind': 'FLAT_FINALIZE_INTENT', 'preimage': 'ABSENT', 'uid': 0, 'gid': 0, 'mode': 0o400},
                    transport.AUDITS + '/' + old + '/receipt.json':
                        {'kind': 'ORIGINAL_AUDIT_RECEIPT', 'preimage': 'ABSENT',
                         'sha256': 'd' * 64, 'bytes': 123, 'uid': 0, 'gid': 0, 'mode': 0o400}},
                'limits': copy.deepcopy(transport.FINALIZE_LIMITS),
                'effects': copy.deepcopy(transport.FINALIZE_EFFECTS)}}
        statement = {'contract': transport.FINALIZE_APPROVAL, 'operationId': recovery,
            'hostIdentitySha256': plan['hostIdentitySha256'], 'planSha256': digest(canonical(plan)),
            'action': plan['action'], 'issuedAt': iso(self.now - timedelta(seconds=10)),
            'expiresAt': iso(self.now + timedelta(minutes=10))}
        linked = {'plan': plan, 'deploymentRootPem': public.decode('ascii'),
            'authoritySourceRelease': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo).decode().strip(),
            'authoritySourceSha256': INITIAL_VALIDATOR_PINS['transport-finalize'][1]}
        statement_path = self.root / 'finalize.statement.json'
        linked_path = self.root / 'finalize.linked.json'
        public_path = self.root / 'finalize.public.pem'
        statement_path.write_bytes(canonical(statement))
        linked_path.write_bytes(canonical(linked))
        public_path.write_bytes(public)
        confirm = f'GO BOOTSTRAP-SIGN transport-finalize {recovery} {digest(canonical(statement))} {digest(der)}'
        result = sign_exact(kind='transport-finalize', statement_path=statement_path,
            linked_path=linked_path, public_path=public_path, expected_public_der_sha256=digest(der),
            private_path=self.root / 'unused.dpapi', output_path=self.root / 'finalize.envelope.json',
            confirm=confirm, now=self.now, private_loader=lambda _path: self.deployment)
        self.assertEqual(result['kind'], 'transport-finalize')
        forged = copy.deepcopy(linked)
        forged['plan']['execution']['destinations']['/etc/systemd/system/foreign.service'] = {}
        with self.assertRaises(ValueError):
            validate_statement('transport-finalize', statement, forged, digest(der), confirm, now=self.now)

    def test_widened_effect_and_expired_window_reject(self):
        changed = dict(self.statement)
        changed['effect'] = 'APPLICATION_RESTART'
        with self.assertRaisesRegex(ValueError, 'scope'):
            validate_statement('execution', changed, self.linked, digest(self.der),
                self.confirm, now=self.now)

    def test_wrong_enrolled_domain_key_rejects_before_private_loader(self):
        from cryptography.hazmat.primitives import serialization
        other = self.roots['rollback']
        other_public = other.public_key().public_bytes(serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        other_der = other.public_key().public_bytes(serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        other_path = self.root / 'other-public.pem'
        other_path.write_bytes(other_public)
        calls = []
        def loader(_path):
            calls.append('private')
            return other
        changed_confirm = f'GO BOOTSTRAP-SIGN execution {self.plan["operationId"]} {digest(canonical(self.statement))} {digest(other_der)}'
        with self.assertRaisesRegex(ValueError, 'exact enrolled domain'):
            self.sign(public_path=other_path, expected_public_der_sha256=digest(other_der),
                confirm=changed_confirm, private_loader=loader)
        self.assertEqual(calls, [])
        changed = dict(self.statement)
        changed['expiresAt'] = iso(self.now - timedelta(seconds=1))
        with self.assertRaisesRegex(ValueError, 'expired'):
            validate_statement('execution', changed, self.linked, digest(self.der),
                self.confirm, now=self.now)

    def test_runtime_provision_signs_only_exact_request_and_deployment_root(self):
        from cryptography.hazmat.primitives import serialization
        placement = '22222222-2222-4222-8222-222222222222'
        operation = '33333333-3333-4333-8333-333333333333'
        attempt = '44444444-4444-4444-8444-444444444444'
        request = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RPC_V1',
                   'command': 'observe', 'operationId': operation, 'attemptId': attempt,
                   'mode': 'A_TO_BRIDGE', 'targetRelease': 'a' * 40,
                   'criticalNames': [], 'evidence': {}, 'inputs': {}}
        compose = '/var/lib/leetplus-compose'
        runtime = '/var/lib/leetplus-transition-bootstrap'
        request_dir = runtime + '/requests/' + placement
        path_names = {runtime, runtime + '/requests', runtime + '/operations',
            runtime + '/attempts', runtime + '/transition.lock', request_dir,
            request_dir + '/request.json',
            compose + '/' + placement + '.transition-provision.intent.json',
            compose + '/' + placement + '.transition-provision.receipt.json'}
        plan = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RUNTIME_PROVISION_V1_PLAN',
            'placementId': placement, 'operationId': operation, 'attemptId': attempt,
            'command': 'observe', 'hostIdentitySha256': '1' * 64,
            'bundleSha256': self.linked['enrollmentEvidence']['record']['bundleSha256'],
            'installerReceiptSha256': digest(canonical(self.linked['enrollmentEvidence']['receipt'])),
            'requestSha256': digest(canonical(request)),
            'preimages': {name: {'state': 'ABSENT'} for name in path_names},
            'nativeLocks': {compose + '/' + name: {'state': 'EXACT', 'device': 1,
                'inode': 1, 'uid': 0, 'gid': 0, 'mode': 0o600, 'ctimeNs': 1}
                for name in ('control.lock', 'standalone-install.lock')},
            'effects': {'runtimeDirectoriesOnly': True, 'requestPlacementOnly': True,
                'controllerPointerMutation': False, 'applicationRestart': False,
                'systemdUnitMutation': False, 'dataMutation': False,
                'grantMutation': False, 'timerMutation': False, 'providerEffect': False}}
        approval = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RUNTIME_PROVISION_V1_APPROVAL',
            'placementId': placement, 'hostIdentitySha256': plan['hostIdentitySha256'],
            'planSha256': digest(canonical(plan)),
            'issuedAt': iso(self.now - timedelta(seconds=10)),
            'expiresAt': iso(self.now + timedelta(minutes=10))}
        deployment = self.deployment
        public = deployment.public_key().public_bytes(serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        der = deployment.public_key().public_bytes(serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        statement_path = self.root / 'runtime-statement.json'
        linked_path = self.root / 'runtime-linked.json'
        public_path = self.root / 'runtime-public.pem'
        output = self.root / 'runtime-envelope.json'
        statement_path.write_bytes(canonical(approval))
        linked = {'plan': plan, 'request': request,
                  'enrollmentEvidence': self.linked['enrollmentEvidence'],
                  'deploymentRootPem': public.decode('ascii')}
        linked_path.write_bytes(canonical(linked))
        public_path.write_bytes(public)
        confirmation = (f'GO BOOTSTRAP-SIGN runtime-provision {placement} '
                        f'{digest(canonical(approval))} {digest(der)}')
        result = sign_exact(kind='runtime-provision', statement_path=statement_path,
            linked_path=linked_path, public_path=public_path,
            expected_public_der_sha256=digest(der), private_path=self.root / 'unused.dpapi',
            output_path=output, confirm=confirmation, now=self.now,
            private_loader=lambda _path: deployment)
        self.assertEqual(result['operationId'], placement)
        self.assertEqual(json.loads(output.read_bytes())['approval'], approval)
        changed = dict(plan)
        changed['requestSha256'] = '0' * 64
        linked['plan'] = changed
        with self.assertRaisesRegex(ValueError, 'request'):
            validate_statement('runtime-provision', approval, linked, digest(der),
                               confirmation, now=self.now)

    def test_initial_domains_reject_unbound_validator_before_private_key(self):
        from cryptography.hazmat.primitives import serialization
        public = self.deployment.public_key().public_bytes(serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        der = self.deployment.public_key().public_bytes(serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        public_path = self.root / 'initial-public.pem'
        public_path.write_bytes(public)
        kinds = {
            'transport': 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_APPROVAL',
            'initial-intro': 'LEETPLUS_STANDALONE_INITIAL_INTRO_V1_APPROVAL',
            'transport-finalize': 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_FINALIZE_V1_APPROVAL'}
        calls = []
        for kind, contract in kinds.items():
            statement = {'contract': contract, 'operationId': self.plan['operationId'],
                'hostIdentitySha256': '1' * 64, 'planSha256': '2' * 64, 'action': 'fixture',
                'issuedAt': iso(self.now - timedelta(seconds=10)),
                'expiresAt': iso(self.now + timedelta(minutes=10))}
            linked = {'deploymentRootPem': public.decode('ascii'),
                'authoritySourceRelease': 'a' * 40, 'authoritySourceSha256': '0' * 64,
                'transportAuthoritySourceSha256': '0' * 64,
                'plan': {'execution': {'trustRoot': {'path': '/etc/leetplus-compose/approval-root.pem',
                                                   'rawSha256': digest(public)}}},
                'transportEvidence': {'plan': {}, 'approvalEnvelope': {}, 'intent': {}, 'receipt': {}}}
            statement_path = self.root / (kind + '.statement.json')
            linked_path = self.root / (kind + '.linked.json')
            statement_path.write_bytes(canonical(statement))
            linked_path.write_bytes(canonical(linked))
            confirmation = (f'GO BOOTSTRAP-SIGN {kind} {statement["operationId"]} '
                            f'{digest(canonical(statement))} {digest(der)}')
            with self.subTest(kind=kind), patch('offline_sign.subprocess.run') as git_read:
                with self.assertRaisesRegex(ValueError, 'frozen.*unavailable|differs'):
                    sign_exact(kind=kind, statement_path=statement_path, linked_path=linked_path,
                        public_path=public_path, expected_public_der_sha256=digest(der),
                        private_path=self.root / 'unused.dpapi', output_path=self.root / (kind + '.envelope.json'),
                        confirm=confirmation, now=self.now,
                        private_loader=lambda _path: calls.append('private'))
                git_read.assert_not_called()
        self.assertEqual(calls, [])

    def test_initial_transport_and_intro_sign_only_complete_receipt_lineage(self):
        import base64
        import subprocess
        from cryptography.hazmat.primitives import serialization
        from offline_sign import INITIAL_VALIDATOR_PINS
        repo = Path(__file__).resolve().parents[2]
        source_release = subprocess.check_output(['git', '--no-replace-objects', 'rev-parse', 'HEAD'],
                                                  cwd=repo).decode().strip()
        modules = {}
        for key, name in (('transport', 'test_standalone_intro_transport.py'),
                          ('intro', 'test_standalone_initial_intro.py')):
            spec = importlib.util.spec_from_file_location('offline_' + key + '_fixture',
                repo / 'deploy' / 'leetplus-compose' / name)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            modules[key] = module
        public = self.deployment.public_key().public_bytes(serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        der = self.deployment.public_key().public_bytes(serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        public_path = self.root / 'trusted-initial-public.pem'
        public_path.write_bytes(public)
        transport = modules['transport'].transport
        plan = modules['transport'].plan_fixture()
        plan['execution']['trustRoot']['rawSha256'] = digest(public)
        approval = {'contract': transport.APPROVAL, 'operationId': plan['operationId'],
            'hostIdentitySha256': plan['hostIdentitySha256'], 'planSha256': digest(canonical(plan)),
            'action': plan['action'], 'issuedAt': iso(self.now - timedelta(seconds=10)),
            'expiresAt': iso(self.now + timedelta(minutes=10))}
        linked = {'plan': plan, 'deploymentRootPem': public.decode('ascii'),
            'authoritySourceRelease': source_release,
            'authoritySourceSha256': INITIAL_VALIDATOR_PINS['transport'][1]}

        def sign_initial(kind, statement, values, output_name, private_loader=None):
            statement_path = self.root / (output_name + '.statement.json')
            linked_path = self.root / (output_name + '.linked.json')
            statement_path.write_bytes(canonical(statement))
            linked_path.write_bytes(canonical(values))
            confirmation = (f'GO BOOTSTRAP-SIGN {kind} {statement["operationId"]} '
                            f'{digest(canonical(statement))} {digest(der)}')
            return sign_exact(kind=kind, statement_path=statement_path, linked_path=linked_path,
                public_path=public_path, expected_public_der_sha256=digest(der),
                private_path=self.root / 'unused.dpapi', output_path=self.root / (output_name + '.json'),
                confirm=confirmation, now=self.now,
                private_loader=private_loader or (lambda _path: self.deployment))

        sign_initial('transport', approval, linked, 'transport-signed')
        envelope = json.loads((self.root / 'transport-signed.json').read_bytes())
        self.deployment.public_key().verify(base64.b64decode(envelope['signature']), canonical(approval))
        intent = {'contract': transport.INTENT, 'operationId': plan['operationId'],
            'planSha256': digest(canonical(plan)), 'approvalSha256': digest(canonical(envelope)),
            'authorizedAt': iso(self.now)}
        receipt = {'contract': transport.RECEIPT, 'decision': 'PASS',
            'operationId': plan['operationId'], 'planSha256': digest(canonical(plan)),
            'approvalSha256': digest(canonical(envelope)), 'intentSha256': digest(canonical(intent)),
            **{name: plan[name] for name in transport.LINKS},
            'snapshotPath': plan['snapshotPath'], 'snapshotDevice': 1, 'snapshotInode': 2,
            'snapshotSize': plan['snapshotSize'], 'snapshotMode': 0o400, 'snapshotUid': 0, 'snapshotGid': 0,
            'entrySnapshotPath': plan['entrySnapshotPath'], 'entrySnapshotDevice': 1, 'entrySnapshotInode': 3,
            'entrySnapshotSize': plan['entrySnapshotSize'], 'entrySnapshotMode': 0o400,
            'entrySnapshotUid': 0, 'entrySnapshotGid': 0,
            'executionSha256': digest(canonical(plan['execution'])), 'fullPostimageSha256': 'e' * 64,
            'flatIntentSha256': digest(canonical(intent)), 'parentPostimageSha256': 'f' * 64,
            'predecessorPostimageSha256': '1' * 64, 'acceptedAt': iso(self.now)}
        intro = modules['intro'].intro
        intro_plan = modules['intro'].plan_fixture()
        intro_plan.update({'introTransportOperationId': plan['operationId'],
            'introTransportReceiptSha256': digest(canonical(receipt)),
            'hostIdentitySha256': plan['hostIdentitySha256'], 'sourceRelease': plan['sourceRelease']})
        intro_approval = {'contract': intro.APPROVAL, 'operationId': intro_plan['operationId'],
            'hostIdentitySha256': intro_plan['hostIdentitySha256'],
            'planSha256': digest(canonical(intro_plan)), 'action': intro_plan['action'],
            'issuedAt': iso(self.now - timedelta(seconds=10)),
            'expiresAt': iso(self.now + timedelta(minutes=10))}
        intro_linked = {'plan': intro_plan, 'deploymentRootPem': public.decode('ascii'),
            'authoritySourceRelease': source_release,
            'authoritySourceSha256': INITIAL_VALIDATOR_PINS['initial-intro'][1],
            'transportAuthoritySourceSha256': INITIAL_VALIDATOR_PINS['transport'][1],
            'transportEvidence': {'plan': plan, 'approvalEnvelope': envelope,
                                  'intent': intent, 'receipt': receipt}}
        sign_initial('initial-intro', intro_approval, intro_linked, 'intro-signed')
        calls = []
        for field in ('planSha256', 'approvalSha256', 'flatIntentSha256', 'executionSha256'):
            damaged = copy.deepcopy(intro_linked)
            damaged['transportEvidence']['receipt'][field] = '0' * 64
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'lineage'):
                sign_initial('initial-intro', intro_approval, damaged, 'bad-' + field,
                             private_loader=lambda _path: calls.append('private'))
        self.assertEqual(calls, [])


if __name__ == '__main__':
    unittest.main()
