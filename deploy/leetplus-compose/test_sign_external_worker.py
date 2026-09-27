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
SPEC = importlib.util.spec_from_file_location('sign_external_worker', ROOT / 'sign-external-worker.py')
SIGNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SIGNER)
NOW = datetime(2026, 9, 27, 10, 0, 0, tzinfo=timezone.utc)


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def grant(mode='CANARY'):
    return {
        'contract': SIGNER.GRANT_CONTRACT,
        'id': '12345678-1234-4123-8123-123456789abc',
        'worker': SIGNER.IDENTITY['worker'], 'mode': mode,
        'hostIdentitySha256': 'a' * 64, 'releaseSha': 'b' * 40, 'generation': 11,
        'tenantId': SIGNER.IDENTITY['tenantId'], 'tenantSlug': SIGNER.IDENTITY['tenantSlug'],
        'sourceId': SIGNER.IDENTITY['sourceId'], 'storeId': SIGNER.IDENTITY['storeId'],
        'domain': SIGNER.IDENTITY['domain'], 'clubId': SIGNER.IDENTITY['clubId'],
        'customerStage': SIGNER.IDENTITY['customerStage'],
        'executionRevision': 1, 'profileRevision': 2, 'storeRevision': 0,
        'secretSha256': 'c' * 64,
        'issuedAt': '2026-09-27T09:55:00.000Z',
        'expiresAt': '2026-09-27T13:00:00.000Z' if mode == 'CANARY' else '2026-12-01T00:00:00.000Z',
        'businessDate': '2026-09-26' if mode == 'CANARY' else None,
    }


def enrollment(mode='CANARY'):
    return {
        'contract': f'{SIGNER.ENROLLMENT_CONTRACT}_PLAN',
        'operationId': '22345678-1234-4123-8123-123456789abc',
        'action': f'ENROLL_{mode}', 'hostIdentitySha256': 'a' * 64,
        'activeSha256': 'b' * 64, 'controllerManifestSha256': 'c' * 64,
        'releaseSha': 'd' * 40, 'generation': 11,
        'worker': SIGNER.IDENTITY['worker'], 'mode': mode,
        'secretSha256': 'e' * 64, 'grantEnvelopeSha256': 'f' * 64,
        'serviceUnitSha256': '1' * 64, 'timerUnitSha256': '2' * 64,
        'networkPolicySha256': '3' * 64,
        'previousEnrollmentReceiptSha256': None if mode == 'CANARY' else '4' * 64,
        'canaryReceiptSha256': None if mode == 'CANARY' else '5' * 64,
        'issuedAt': '2026-09-27T09:50:00.000Z', 'expiresAt': '2026-09-27T12:00:00.000Z',
    }


class ExternalWorkerSignerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name).resolve()
        self.key = Ed25519PrivateKey.generate()
        self.public = self.key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        self.public_der = self.key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)

    def tearDown(self):
        self.directory.cleanup()

    def invoke(self, kind, value, *, loader=None, confirm=None, suffix='one'):
        source = self.root / f'{kind}-{suffix}.json'
        public = self.root / 'public.pem'
        output = self.root / f'{kind}-{suffix}.signed.json'
        raw = canonical(value)
        source.write_bytes(raw)
        if not public.exists():
            public.write_bytes(self.public)
        identity = value['id'] if kind == 'grant' else value['operationId']
        expected_confirm = f'GO EXTERNAL-WORKER {identity} {hashlib.sha256(raw).hexdigest()}'
        result = SIGNER.sign_external_worker(
            kind=kind, input_path=source, private_path=self.root / 'unused.dpapi', public_path=public,
            expected_public_sha256=hashlib.sha256(self.public_der).hexdigest(), output_path=output,
            confirm=expected_confirm if confirm is None else confirm, now=NOW,
            private_loader=loader or (lambda _: self.key),
        )
        return result, output

    def test_signs_exact_canary_and_timer_grants(self):
        for index, mode in enumerate(('CANARY', 'TIMER')):
            value = grant(mode)
            result, output = self.invoke('grant', value, suffix=str(index))
            envelope = json.loads(output.read_bytes())
            self.assertEqual(tuple(envelope), ('grant', 'signature'))
            self.assertEqual(envelope['grant'], value)
            self.key.public_key().verify(base64.b64decode(envelope['signature'], validate=True), canonical(value))
            self.assertFalse(result['installedAdmissionVerifiedBySigner'])

    def test_signs_enrollment_approval_with_bounded_plan_expiry(self):
        for index, mode in enumerate(('CANARY', 'TIMER')):
            plan = enrollment(mode)
            result, output = self.invoke('enrollment', plan, suffix=str(index))
            envelope = json.loads(output.read_bytes())
            approval = envelope['approval']
            self.assertEqual(tuple(approval), SIGNER.APPROVAL_FIELDS)
            self.assertEqual(approval['contract'], SIGNER.APPROVAL_CONTRACT)
            self.assertEqual(approval['action'], plan['action'])
            self.assertEqual(approval['planSha256'], hashlib.sha256(canonical(plan)).hexdigest())
            self.assertLessEqual(approval['expiresAt'], plan['expiresAt'])
            self.key.public_key().verify(base64.b64decode(envelope['signature'], validate=True), canonical(approval))
            self.assertTrue(result['dispatcherDirectGoReceiptRequired'])

    def reject_before_private(self, kind, value, expected, confirm=None):
        calls = []
        with self.assertRaises(Exception) as caught:
            self.invoke(kind, value, loader=lambda _: calls.append('private'), confirm=confirm, suffix=hashlib.sha256(canonical(value)).hexdigest()[:8])
        self.assertEqual(calls, [])
        self.assertIn(expected, str(caught.exception))

    def test_grant_scope_time_date_and_revision_drift_reject_before_private(self):
        mutations = [
            ('tenantId', '00000000-0000-4000-8000-000000000000', 'tenantId differs'),
            ('sourceId', '00000000-0000-4000-8000-000000000000', 'sourceId differs'),
            ('domain', 'other.example', 'domain differs'),
            ('clubId', '2', 'clubId differs'),
            ('executionRevision', 0, 'revisions'),
            ('profileRevision', 0, 'revisions'),
            ('generation', -1, 'identity'),
            ('expiresAt', '2027-01-01T00:00:00.000Z', 'unbounded'),
        ]
        for field, changed, expected in mutations:
            with self.subTest(field=field):
                value = grant(); value[field] = changed
                self.reject_before_private('grant', value, expected)
        timer = grant('TIMER'); timer['businessDate'] = '2026-09-26'
        self.reject_before_private('grant', timer, 'must be null')
        canary = grant(); canary['businessDate'] = None
        self.reject_before_private('grant', canary, 'business date')

    def test_enrollment_scope_hash_and_expiry_reject_before_private(self):
        cases = []
        wrong = enrollment(); wrong['action'] = 'ENROLL_ALL'; cases.append((wrong, 'scope'))
        wrong = enrollment(); wrong['mode'] = 'TIMER'; cases.append((wrong, 'scope'))
        wrong = enrollment(); wrong['activeSha256'] = 'A' * 64; cases.append((wrong, 'identities'))
        wrong = enrollment(); wrong['expiresAt'] = '2026-09-27T14:00:00.000Z'; cases.append((wrong, 'unbounded'))
        wrong = enrollment(); wrong['unexpected'] = True; cases.append((wrong, 'exact fields'))
        for value, expected in cases:
            self.reject_before_private('enrollment', value, expected)

    def test_confirmation_public_provenance_and_output_preflight_before_private(self):
        self.reject_before_private('grant', grant(), 'dispatcher GO', confirm='forwarded-go')
        value = grant(); calls = []
        source = self.root / 'grant-public.json'; source.write_bytes(canonical(value))
        public = self.root / 'wrong-public.pem'; public.write_bytes(self.public)
        output = self.root / 'grant-public.signed.json'
        confirm = f"GO EXTERNAL-WORKER {value['id']} {hashlib.sha256(canonical(value)).hexdigest()}"
        with self.assertRaisesRegex(ValueError, 'provenance'):
            SIGNER.sign_external_worker(kind='grant', input_path=source, private_path=self.root / 'missing', public_path=public,
                expected_public_sha256='0' * 64, output_path=output, confirm=confirm, now=NOW,
                private_loader=lambda _: calls.append('private'))
        self.assertEqual(calls, [])

    def test_wrong_private_key_and_exclusive_output_fail_closed(self):
        wrong = Ed25519PrivateKey.generate()
        with self.assertRaisesRegex(ValueError, 'does not match'):
            self.invoke('grant', grant(), loader=lambda _: wrong, suffix='wrong-key')
        result, output = self.invoke('grant', grant(), suffix='exclusive')
        before = output.read_bytes()
        with self.assertRaises(FileExistsError):
            self.invoke('grant', grant(), suffix='exclusive')
        self.assertEqual(before, output.read_bytes())
        self.assertEqual(result['outputSha256'], hashlib.sha256(before).hexdigest())


if __name__ == '__main__':
    unittest.main()
