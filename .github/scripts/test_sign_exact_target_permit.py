import importlib.util
import json
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

SOURCE = Path(__file__).with_name('sign-exact-target-permit.py')
SPEC = importlib.util.spec_from_file_location('exact_target_signer', SOURCE)
SIGNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SIGNER)


def plan():
    return {
        'contract': SIGNER.PLAN_CONTRACT, 'operationId': str(uuid.uuid4()),
        'action': SIGNER.ACTION, 'permitPath': 'permit.json',
        'hostIdentitySha256': '1' * 64, 'snapshot': {'activeSha256': '2' * 64},
        'oldReleaseSha': 'a' * 40, 'newReleaseSha': 'b' * 40,
        'oldControlSha256': '3' * 64, 'newControlSha256': '4' * 64,
        'applicationRestartAllowed': False, 'timersMayBeStopped': False,
        'rollbackAllowed': True, 'maxLockWaitSeconds': 120,
        'predecessor': {'releaseSha': 'a' * 40, 'manifestSha256': '3' * 64,
                        'verifierSha256': '5' * 64},
        'target': {'releaseSha': 'b' * 40, 'manifestSha256': '4' * 64,
                   'admissionSha256': '6' * 64, 'controlArchiveSha256': '7' * 64,
                   'filesSha256': '8' * 64, 'criticalFilesSha256': '9' * 64},
    }


class PermitSignerTest(unittest.TestCase):
    def bounds(self):
        start = datetime.now(timezone.utc)
        end = start + timedelta(hours=1)
        return (start.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                end.isoformat(timespec='milliseconds').replace('+00:00', 'Z'))

    def test_forward_and_receipt_bound_rollback_are_distinct(self):
        value = plan()
        start, end = self.bounds()
        forward = SIGNER.build_permit(value, None, start, end)
        self.assertEqual(forward['contract'], SIGNER.PERMIT_CONTRACT)
        self.assertEqual(forward['planSha256'], SIGNER.digest(SIGNER.canonical(value)))
        receipt = {'contract': SIGNER.PERMIT_CONTRACT + '_RECEIPT', 'decision': 'PASS',
                   'operationId': value['operationId'], 'planSha256': forward['planSha256']}
        rollback = SIGNER.build_permit(value, receipt, start, end)
        self.assertEqual(rollback['contract'], SIGNER.ROLLBACK_CONTRACT)
        self.assertEqual(rollback['action'], SIGNER.ROLLBACK_ACTION)
        self.assertEqual(rollback['receiptSha256'], SIGNER.digest(SIGNER.canonical(receipt)))
        receipt['decision'] = 'FORGED'
        with self.assertRaisesRegex(ValueError, 'accepted forward receipt'):
            SIGNER.build_permit(value, receipt, start, end)

    def test_mismatched_target_and_widened_scope_fail_before_private_key(self):
        start, end = self.bounds()
        for mutate in [
            lambda value: value['target'].update(manifestSha256='0' * 64),
            lambda value: value['predecessor'].update(verifierSha256='bad'),
            lambda value: value.update(newReleaseSha='a' * 40),
            lambda value: value.update(applicationRestartAllowed=True),
            lambda value: value['target'].update(extra='0' * 64),
            lambda value: value.update(permitPath='other.json'),
        ]:
            value = plan(); mutate(value)
            with self.subTest(value=value), self.assertRaises(ValueError):
                SIGNER.build_permit(value, None, start, end)

    def test_expiry_must_be_future_and_within_four_hours(self):
        start, end = self.bounds()
        far = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        for issued, expires in [(start, far), (end, start), ('bad', end)]:
            with self.subTest(issued=issued, expires=expires), self.assertRaises(ValueError):
                SIGNER.build_permit(plan(), None, issued, expires)


if __name__ == '__main__':
    unittest.main()
