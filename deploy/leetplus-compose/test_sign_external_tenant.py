import base64
import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'sign-external-tenant.py'
SPEC = importlib.util.spec_from_file_location('sign_external_tenant', SOURCE)
SIGNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SIGNER)
NOW = datetime(2026, 9, 27, 10, 0, 0, tzinfo=timezone.utc)


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def fixture(action='ACTIVATE_LIVE'):
    reason = 'Activate one reviewed external Langame tenant.'
    statement = {
        'contract': SIGNER.CONTRACT,
        'tenantId': SIGNER.TENANT_ID,
        'action': action,
        'planSha256': 'a' * 64,
        'requestId': '12345678-1234-4123-8123-123456789abc',
        'reasonSha256': hashlib.sha256(canonical(reason)).hexdigest(),
        'issuedAt': (NOW - timedelta(minutes=1)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
        'expiresAt': (NOW + timedelta(minutes=10)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
    }
    raw = canonical(statement)
    confirm = f"GO EXTERNAL-TENANT {statement['requestId']} {hashlib.sha256(raw).hexdigest()}"
    return statement, reason, raw, canonical(reason), confirm


class ExternalTenantSignerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name).resolve()
        self.key = Ed25519PrivateKey.generate()
        self.public = self.key.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        self.public_der = self.key.public_key().public_bytes(
            serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )

    def tearDown(self):
        self.directory.cleanup()

    def paths(self, action='ACTIVATE_LIVE'):
        statement, reason, raw, reason_raw, confirm = fixture(action)
        source = self.root / 'statement.json'
        reason_path = self.root / 'reason.json'
        public = self.root / 'approval-root.pem'
        output = self.root / f'approval-{action.lower()}.json'
        source.write_bytes(raw)
        reason_path.write_bytes(reason_raw)
        public.write_bytes(self.public)
        return statement, reason, source, reason_path, public, output, confirm

    def invoke(self, action='ACTIVATE_LIVE', mutate=None, confirm=None, loader=None):
        statement, reason, source, reason_path, public, output, expected_confirm = self.paths(action)
        if mutate:
            mutate(statement, reason, source, reason_path, public, output)
        return SIGNER.sign_external_tenant(
            input_path=source, reason_path=reason_path, public_path=public,
            expected_public_sha256=hashlib.sha256(self.public_der).hexdigest(),
            private_path=self.root / 'never-read.dpapi', output_path=output,
            confirm=expected_confirm if confirm is None else confirm, now=NOW,
            private_loader=loader or (lambda _: self.key),
        ), output

    def test_signs_exact_flat_wire_statement_for_both_actions(self):
        for action in SIGNER.ACTIONS:
            with self.subTest(action=action):
                result, output = self.invoke(action)
                value = json.loads(output.read_bytes())
                self.assertEqual(tuple(value), SIGNER.OUTPUT_FIELDS)
                self.assertEqual(value['action'], action)
                signature = base64.b64decode(value.pop('signature'), validate=True)
                self.key.public_key().verify(signature, canonical(value))
                self.assertEqual(result['statementSha256'], hashlib.sha256(canonical(value)).hexdigest())

    def assert_rejected_before_private(self, mutate=None, confirm=None, expected=None):
        calls = []
        with self.assertRaises(Exception) as caught:
            self.invoke(mutate=mutate, confirm=confirm, loader=lambda _: calls.append('private'))
        self.assertEqual(calls, [])
        if expected:
            self.assertIn(expected, str(caught.exception))

    def test_rejects_scope_identity_reason_time_and_confirmation_before_private_read(self):
        cases = [
            (lambda s, *_: s.update(contract='OTHER'), 'scope'),
            (lambda s, *_: s.update(tenantId='00000000-0000-4000-8000-000000000000'), 'scope'),
            (lambda s, *_: s.update(action='WRITE_ANYTHING'), 'scope'),
            (lambda s, *_: s.update(planSha256='A' * 64), 'identities'),
            (lambda s, *_: s.update(requestId='not-a-uuid'), 'identities'),
            (lambda s, *_: s.update(reasonSha256='0' * 64), 'Reason digest'),
            (lambda s, *_: s.update(issuedAt=(NOW + timedelta(seconds=31)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')), 'future-issued'),
            (lambda s, *_: s.update(expiresAt=(NOW - timedelta(seconds=1)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')), 'expired'),
            (lambda s, *_: s.update(expiresAt=(NOW + timedelta(minutes=31)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')), 'unbounded'),
        ]
        for mutate, expected in cases:
            with self.subTest(expected=expected):
                def rewrite(statement, reason, source, *_):
                    mutate(statement, reason)
                    source.write_bytes(canonical(statement))
                self.assert_rejected_before_private(rewrite, expected=expected)
        self.assert_rejected_before_private(confirm='forwarded-or-stale-go', expected='dispatcher GO')

    def test_rejects_noncanonical_or_reordered_statement_and_reason_before_private_read(self):
        def compact_statement(statement, reason, source, *_):
            source.write_text(json.dumps(statement), encoding='utf-8')
        self.assert_rejected_before_private(compact_statement, expected='canonical')

        def reordered(statement, reason, source, *_):
            changed = {'tenantId': statement['tenantId'], 'contract': statement['contract'],
                       **{key: value for key, value in statement.items() if key not in ('tenantId', 'contract')}}
            source.write_bytes(canonical(changed))
        self.assert_rejected_before_private(reordered, expected='wire order')

        def reason_object(statement, reason, source, reason_path, *_):
            reason_path.write_bytes(canonical({'reason': reason}))
        self.assert_rejected_before_private(reason_object, expected='Reason must')

    def test_public_provenance_and_key_type_reject_before_private_read(self):
        calls = []
        statement, reason, source, reason_path, public, output, confirm = self.paths()
        with self.assertRaisesRegex(ValueError, 'provenance'):
            SIGNER.sign_external_tenant(
                input_path=source, reason_path=reason_path, public_path=public,
                expected_public_sha256='0' * 64, private_path=self.root / 'missing', output_path=output,
                confirm=confirm, now=NOW, private_loader=lambda _: calls.append('private'))
        self.assertEqual(calls, [])

    def test_private_key_must_match_public_root_and_output_is_exclusive(self):
        wrong = Ed25519PrivateKey.generate()
        with self.assertRaisesRegex(ValueError, 'does not match'):
            self.invoke(loader=lambda _: wrong)
        result, output = self.invoke()
        before = output.read_bytes()
        with self.assertRaises(FileExistsError):
            statement, reason, source, reason_path, public, _, confirm = self.paths()
            SIGNER.sign_external_tenant(
                input_path=source, reason_path=reason_path, public_path=public,
                expected_public_sha256=hashlib.sha256(self.public_der).hexdigest(),
                private_path=self.root / 'missing', output_path=output,
                confirm=confirm, now=NOW, private_loader=lambda _: self.key)
        self.assertEqual(output.read_bytes(), before)
        self.assertEqual(result['approvalSha256'], hashlib.sha256(before).hexdigest())

    def test_rejects_hardlinked_and_symlinked_inputs(self):
        statement, reason, source, reason_path, public, output, confirm = self.paths()
        hardlink = self.root / 'statement-hardlink.json'
        os.link(source, hardlink)
        with self.assertRaisesRegex(ValueError, 'one-link'):
            SIGNER.sign_external_tenant(
                input_path=source, reason_path=reason_path, public_path=public,
                expected_public_sha256=hashlib.sha256(self.public_der).hexdigest(),
                private_path=self.root / 'missing', output_path=output,
                confirm=confirm, now=NOW, private_loader=lambda _: self.key)
        hardlink.unlink()
        link = self.root / 'reason-link.json'
        try:
            link.symlink_to(reason_path)
        except OSError:
            self.skipTest('symlink creation unavailable')
        with self.assertRaisesRegex(ValueError, 'Symlink|reparse'):
            SIGNER.sign_external_tenant(
                input_path=source, reason_path=link, public_path=public,
                expected_public_sha256=hashlib.sha256(self.public_der).hexdigest(),
                private_path=self.root / 'missing', output_path=output,
                confirm=confirm, now=NOW, private_loader=lambda _: self.key)


if __name__ == '__main__':
    unittest.main()
