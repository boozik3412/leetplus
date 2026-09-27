import base64
import hashlib
import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('sign_external_worker_root', ROOT / 'sign-external-worker-root.py')
SIGNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SIGNER)
NOW = datetime(2026, 9, 27, 10, 0, 0, tzinfo=timezone.utc)


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


class ExternalWorkerRootSignerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name).resolve()
        self.deployment = Ed25519PrivateKey.generate()
        self.external = Ed25519PrivateKey.generate()
        self.deployment_pem = self.deployment.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        self.external_pem = self.external.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        self.deployment_der = self.deployment.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
        self.external_der = self.external.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)

    def tearDown(self):
        self.directory.cleanup()

    def statement(self):
        return {
            'contract': SIGNER.CONTRACT,
            'operationId': '12345678-1234-4123-8123-123456789abc',
            'action': SIGNER.ACTION,
            'hostIdentitySha256': 'a' * 64,
            'publicDerSha256': hashlib.sha256(self.external_der).hexdigest(),
            'publicPath': SIGNER.PUBLIC_PATH,
            'issuedAt': '2026-09-27T09:55:00.000Z',
            'expiresAt': '2026-09-27T10:20:00.000Z',
        }

    def invoke(self, statement=None, loader=None, confirm=None, suffix='one', same_root=False, kind='enrollment'):
        value = statement or self.statement()
        source = self.root / f'statement-{suffix}.json'
        external = self.root / f'external-{suffix}.pem'
        deployment = self.root / f'deployment-{suffix}.pem'
        output = self.root / f'approval-{suffix}.json'
        raw = canonical(value)
        source.write_bytes(raw)
        external.write_bytes(self.deployment_pem if same_root else self.external_pem)
        deployment.write_bytes(self.deployment_pem)
        expected_external_der = self.deployment_der if same_root else self.external_der
        prefix = 'GO EXTERNAL-WORKER-ROOT-RECOVERY' if kind == 'recovery' else 'GO EXTERNAL-WORKER-ROOT'
        expected_confirm = f"{prefix} {value['operationId']} {hashlib.sha256(raw).hexdigest()}"
        result = SIGNER.sign_external_worker_root(
            input_path=source, external_public_path=external,
            expected_external_public_sha256=hashlib.sha256(expected_external_der).hexdigest(),
            deployment_public_path=deployment,
            expected_deployment_public_sha256=hashlib.sha256(self.deployment_der).hexdigest(),
            deployment_private_path=self.root / 'unused.dpapi', output_path=output,
            confirm=expected_confirm if confirm is None else confirm, now=NOW,
            private_loader=loader or (lambda _: self.deployment), kind=kind,
        )
        return result, output

    def test_signs_exact_public_only_statement(self):
        statement = self.statement()
        result, output = self.invoke(statement)
        envelope = json.loads(output.read_bytes())
        self.assertEqual(tuple(envelope), ('statement', 'signature'))
        self.assertEqual(envelope['statement'], statement)
        self.deployment.public_key().verify(base64.b64decode(envelope['signature'], validate=True), canonical(statement))
        self.assertEqual(result['externalPublicDerSha256'], statement['publicDerSha256'])
        self.assertTrue(result['dispatcherDirectGoReceiptRequired'])

    def test_signs_only_exact_fresh_public_root_recovery_statement(self):
        value = {
            'contract': SIGNER.RECOVERY_CONTRACT,
            'operationId': '22345678-1234-4123-8123-123456789abc',
            'action': 'RECOVER_INSTALLED',
            'hostIdentitySha256': 'a' * 64,
            'originalOperationId': self.statement()['operationId'],
            'originalEnvelopeSha256': 'b' * 64, 'intentSha256': 'c' * 64,
            'publicDerSha256': hashlib.sha256(self.external_der).hexdigest(),
            'publicPath': SIGNER.PUBLIC_PATH,
            'installedPostimageSha256': 'd' * 64,
            'issuedAt': '2026-09-27T09:55:00.000Z',
            'expiresAt': '2026-09-27T10:20:00.000Z',
        }
        _, output = self.invoke(value, kind='recovery', suffix='recovery')
        signed = json.loads(output.read_bytes())
        self.deployment.public_key().verify(base64.b64decode(signed['signature'], validate=True), canonical(value))
        retired = dict(value, action='RETIRE_ABSENT', installedPostimageSha256=None)
        self.invoke(retired, kind='recovery', suffix='retire')
        widened = dict(value, action='RECOVER_INSTALLED', installedPostimageSha256=None)
        calls = []
        with self.assertRaisesRegex(ValueError, 'postimage'):
            self.invoke(widened, kind='recovery', suffix='widened', loader=lambda _: calls.append('private'))
        self.assertEqual(calls, [])

    def reject_before_private(self, statement, expected, *, confirm=None, same_root=False, suffix='reject'):
        calls = []
        with self.assertRaises(Exception) as caught:
            self.invoke(statement, loader=lambda _: calls.append('private'), confirm=confirm, same_root=same_root, suffix=suffix)
        self.assertEqual(calls, [])
        self.assertIn(expected, str(caught.exception))

    def test_scope_host_path_digest_time_and_confirmation_reject_before_private(self):
        changes = [
            ('contract', 'OTHER', 'scope'),
            ('action', 'ENROLL_PRIVATE', 'scope'),
            ('operationId', 'not-a-uuid', 'scope'),
            ('hostIdentitySha256', 'A' * 64, 'scope'),
            ('publicDerSha256', '0' * 64, 'scope'),
            ('publicPath', '/etc/leetplus-compose/approval-root.pem', 'scope'),
            ('issuedAt', '2026-09-27T10:00:31.000Z', 'future-issued'),
            ('expiresAt', '2026-09-27T10:31:00.000Z', 'unbounded'),
        ]
        for index, (field, changed, expected) in enumerate(changes):
            value = self.statement(); value[field] = changed
            self.reject_before_private(value, expected, suffix=str(index))
        self.reject_before_private(self.statement(), 'dispatcher GO', confirm='relayed-go', suffix='confirm')

    def test_public_provenance_and_root_separation_reject_before_private(self):
        value = self.statement()
        value['publicDerSha256'] = hashlib.sha256(self.deployment_der).hexdigest()
        self.reject_before_private(value, 'must differ', same_root=True, suffix='same')

        calls = []
        source = self.root / 'source.json'; source.write_bytes(canonical(self.statement()))
        external = self.root / 'external.pem'; external.write_bytes(self.external_pem)
        deployment = self.root / 'deployment.pem'; deployment.write_bytes(self.deployment_pem)
        output = self.root / 'output.json'
        confirm = f"GO EXTERNAL-WORKER-ROOT {self.statement()['operationId']} {hashlib.sha256(canonical(self.statement())).hexdigest()}"
        with self.assertRaisesRegex(ValueError, 'provenance'):
            SIGNER.sign_external_worker_root(input_path=source, external_public_path=external,
                expected_external_public_sha256='0' * 64, deployment_public_path=deployment,
                expected_deployment_public_sha256=hashlib.sha256(self.deployment_der).hexdigest(),
                deployment_private_path=self.root / 'missing', output_path=output, confirm=confirm, now=NOW,
                private_loader=lambda _: calls.append('private'))
        self.assertEqual(calls, [])

    def test_wrong_deployment_private_and_exclusive_output_fail_closed(self):
        wrong = Ed25519PrivateKey.generate()
        with self.assertRaisesRegex(ValueError, 'does not match'):
            self.invoke(loader=lambda _: wrong, suffix='wrong')
        result, output = self.invoke(suffix='exclusive')
        before = output.read_bytes()
        with self.assertRaises(FileExistsError):
            self.invoke(suffix='exclusive')
        self.assertEqual(before, output.read_bytes())
        self.assertEqual(result['approvalSha256'], hashlib.sha256(before).hexdigest())

    def test_noncanonical_and_extra_fields_reject_before_private(self):
        value = self.statement(); value['unexpected'] = True
        self.reject_before_private(value, 'exact fields', suffix='extra')


if __name__ == '__main__':
    unittest.main()
