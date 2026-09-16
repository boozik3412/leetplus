import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SIGNER = ROOT / 'sign-approval.py'
PREDECESSOR_CONTROL_SHA = '892b25b9fe5ebc8d0c20a7874a77ac312b7a0978'
PREDECESSOR_CONTRACT_SHA256 = 'bba588a506cee3dc6c03a0b93f25291a4dd5f36c1d05fb79d83128bf0276f79d'


def canonical(value):
    return json.dumps(value, indent=2, ensure_ascii=False) + '\n'


def plan():
    return {
        'contract': 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_PLAN', 'operationId': '11111111-1111-4111-8111-111111111111',
        'action': 'RESOURCE_PROFILE_BOOTSTRAP', 'hostIdentitySha256': 'a' * 64,
        'oldReleaseSha': PREDECESSOR_CONTROL_SHA, 'newReleaseSha': 'b' * 40,
        'predecessorControlSha': PREDECESSOR_CONTROL_SHA, 'predecessorContractSha256': PREDECESSOR_CONTRACT_SHA256,
        'legacyProfile': 'LEGACY_4G', 'targetProfile': 'API_6G_V1', 'historicalComposeIdentityVerified': True,
        'resourceLimitMutationAllowed': False, 'applicationRestartAllowed': False, 'timersMayBeStopped': False,
        'rollbackAllowed': True,
    }


class SignApprovalTest(unittest.TestCase):
    def reject_before_private_key_load(self, mutate, expected):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            value = plan()
            mutate(value)
            source = root / 'plan.json'
            source.write_text(canonical(value), encoding='utf-8', newline='\n')
            fingerprint = hashlib.sha256(source.read_bytes()).hexdigest()
            result = subprocess.run([
                sys.executable, str(SIGNER), 'sign-control-handoff', '--private', str(root / 'missing-private-key'),
                '--input', str(source), '--output', str(root / 'approval.json'),
                '--confirm', f"GO {value['operationId']} {fingerprint}",
            ], cwd=ROOT, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(expected, result.stderr)
            self.assertNotIn('missing-private-key', result.stderr)

    def test_rejects_unknown_action_before_private_key_decryption(self):
        self.reject_before_private_key_load(lambda value: value.update(action='UNSCOPED_CONTROL_CHANGE'), 'Unsupported resource-profile bootstrap plan')

    def test_rejects_profile_scope_drift_before_private_key_decryption(self):
        self.reject_before_private_key_load(lambda value: value.update(targetProfile='API_12G_V1'), 'Unsupported resource-profile bootstrap plan')


if __name__ == '__main__':
    unittest.main()
