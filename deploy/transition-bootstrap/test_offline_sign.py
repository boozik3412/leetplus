"""Offline ephemeral-key signer fixture; never reads production private keys."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import shutil
import tempfile
import unittest

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
        install_plan = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V1_PLAN',
            'operationId': '11111111-1111-4111-8111-111111111111',
            'action': 'INSTALL_INDEPENDENT_PUBLIC_ONLY_ADAPTER',
            'hostIdentitySha256': '1' * 64, 'predecessorReleaseSha': 'a' * 40,
            'predecessorManifestSha256': '2' * 64,
            'oldCorePointer': '/usr/local/lib/leetplus-compose/' + 'a' * 40 + '/control.sh',
            'sourceRelease': 'b' * 40, 'sourceAdmissionSha256': '3' * 64,
            'installerSourceSha256': '4' * 64, 'bundleFiles': bundle_files,
            'bundleSha256': digest(canonical(bundle_files)), 'bundleArchiveSha256': '5' * 64,
            'publicRoots': {name: digest(value.encode('ascii')) for name, value in public_roots.items()},
            'effects': INSTALL_EFFECTS.copy()}
        install_approval = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V1_APPROVAL',
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
        install_receipt = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V1_RECEIPT',
            'decision': 'PASS', 'operationId': install_plan['operationId'],
            'planSha256': digest(canonical(install_plan)),
            'approvalSha256': digest(canonical(approval_envelope)),
            'intentSha256': digest(canonical(install_intent)),
            'bundleSha256': install_plan['bundleSha256'],
            'publicRoots': install_plan['publicRoots'],
            'hostIdentitySha256': install_plan['hostIdentitySha256'],
            'acceptedAt': install_intent['authorizedAt']}
        install_record = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_ENROLLMENT_V1',
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


if __name__ == '__main__':
    unittest.main()
