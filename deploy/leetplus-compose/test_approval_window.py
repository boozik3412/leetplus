from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from approval_window import plan_expiration


class ApprovalWindowTests(unittest.TestCase):
    def test_caps_approval_to_original_evidence_expiry(self):
        now = datetime(2026, 9, 22, tzinfo=timezone.utc)
        plan = {'preparationGuard': {'contract': 'LEETPLUS_PREPARATION_GUARD_V1'}, 'preparationEvidenceExpiresAt': '2026-09-22T01:00:00.000Z'}
        self.assertEqual(plan_expiration(plan, now), now + timedelta(hours=1))
        self.assertEqual(plan_expiration({}, now), now + timedelta(hours=4))
        with self.assertRaisesRegex(ValueError, 'expired'):
            plan_expiration(plan, now + timedelta(hours=2))
        with self.assertRaisesRegex(ValueError, 'UTC expiry'):
            plan_expiration({'preparationGuard': plan['preparationGuard']}, now)
        with self.assertRaisesRegex(ValueError, 'bound guard'):
            plan_expiration({'preparationGuard': None}, now)

    def test_expired_plan_is_rejected_before_private_key_access(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = {'contract': 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_PLAN', 'operationId': '11111111-1111-4111-8111-111111111111', 'action': 'ROLLOUT', 'preparationGuard': {'contract': 'LEETPLUS_PREPARATION_GUARD_V1'}, 'preparationEvidenceExpiresAt': '2020-01-01T00:00:00.000Z'}
            raw = (json.dumps(plan, indent=2) + '\n').encode()
            source = root / 'plan.json'
            source.write_bytes(raw)
            result = subprocess.run([sys.executable, str(Path(__file__).with_name('sign-approval.py')), 'sign-plan', '--input', str(source), '--private', str(root / 'missing-private-key'), '--output', str(root / 'approval.json'), '--confirm', 'GO ' + plan['operationId'] + ' ' + hashlib.sha256(raw).hexdigest()], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('evidence expired', result.stderr)
            self.assertNotIn('missing-private-key', result.stderr)


if __name__ == '__main__':
    unittest.main()
