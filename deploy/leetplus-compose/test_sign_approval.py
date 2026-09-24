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


def variant_a_plan():
    value = {
        'contract': 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_PLAN',
        'operationId': '11111111-1111-4111-8111-111111111111',
        'action': 'CONTROL_HANDOFF', 'applicationRestartAllowed': False,
        'timersMayBeStopped': False, 'rollbackAllowed': True, 'maxLockWaitSeconds': 120,
        'oldReleaseSha': '02acca249783cf47c0a24897203d51a206e1c5b2',
        'newReleaseSha': 'f' * 40,
        'oldControlSha256': '5ee7133885692b4c6e86ab680b4040770c985cee4c3381fb372302041232fcad',
        'newControlSha256': 'b' * 64,
    }
    value['orchestratorTransition'] = {
        'contract': 'LEETPLUS_VARIANT_A_ORCHESTRATOR_HANDOFF_V1',
        'oldReleaseSha': value['oldReleaseSha'], 'newReleaseSha': value['newReleaseSha'],
        'oldControlSha256': value['oldControlSha256'], 'newControlSha256': value['newControlSha256'],
        'oldOrchestratorSha256': 'c6fd054d39175266ac0603759423f4fe039294c2a42b03f0b8bd12a8f280aa58',
        'newOrchestratorSha256': 'c4d13a76d1f97f41dc575d37c5da588b9ba3634b1a053f6b194a86623e8861c4',
        'newControlEntrySha256': '4e39b9e8a75ede6bc474fe0ef8b0b5fea60b46edd7c1ed8172744288625ea49f',
        'newPreparationRunnerSha256': '9b02c697d6995b0ff9d4cc085d1249d6e83d96d0cb2848a1e6a139acf3f1eb29',
    }
    return value


def variant_a_repair_plan():
    value = {
        'contract': 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_PLAN',
        'operationId': '11111111-1111-4111-8111-111111111111',
        'action': 'CONTROL_HANDOFF', 'applicationRestartAllowed': False,
        'timersMayBeStopped': False, 'rollbackAllowed': True, 'maxLockWaitSeconds': 120,
        'oldReleaseSha': '88010292246249c94ba66ecbab64e4d51ad84d8c',
        'newReleaseSha': 'd' * 40,
        'oldControlSha256': '237cbcba1fbfcc9e58e78aede7b57f599b206f8c02253c43006dd308c04e9c85',
        'newControlSha256': 'd' * 64,
    }
    value['orchestratorTransition'] = {
        'contract': 'LEETPLUS_VARIANT_A_CONTROLLER_REPAIR_HANDOFF_V2',
        'oldReleaseSha': value['oldReleaseSha'], 'newReleaseSha': value['newReleaseSha'],
        'oldControlSha256': value['oldControlSha256'], 'newControlSha256': value['newControlSha256'],
        'oldRuntimeFilesSha256': {
            'control.mjs': '4e39b9e8a75ede6bc474fe0ef8b0b5fea60b46edd7c1ed8172744288625ea49f',
            'orchestrator.mjs': 'c4d13a76d1f97f41dc575d37c5da588b9ba3634b1a053f6b194a86623e8861c4',
            'preparation-runner.mjs': '9b02c697d6995b0ff9d4cc085d1249d6e83d96d0cb2848a1e6a139acf3f1eb29',
            'worker-authority.mjs': '4c615c56795a025b2c58662c0b9fea5f4dfa7b55d62dae867a77a86dffe0dcf6',
        },
        'newRuntimeFilesSha256': {
            'control.mjs': '1496d809e6401cc0f9b9fba983a135ba0ca6cd445ada7ce337f5f94be2714a97',
            'orchestrator.mjs': 'f3c9d239e4fbe5572fdd258bb20e2be0c3ab935105d25308d325babbcba32e45',
            'preparation-runner.mjs': 'd183f55cb804f472a92baf315a206a4ace1dcbe4644956d0b7b707023013f341',
            'control-reconcile.mjs': '1005a02279bfd72b8462c3cf9d151cbd51cb364fb7829d9db2722a1e9c436cf9',
            'worker-continuation.mjs': 'b8c3fdbce90c3254ff147dfdf4f7e0fb20b44c17576294c6695bb69a5f91bef3',
            'worker-continuation-runtime.mjs': 'e89df0e9a8ad6e5346fed82f21b4379965bee5935d899aafc65ff68a74212d54',
            'release-observer.mjs': 'b6841a6047f76e3714751b59b3185bb35db5b66545c260ecb4f1f9aa9f53f4ad',
            'control-handoff-runtime.mjs': '7c60d2105f48d0c435f96077c317bd6636cab2d648fdceda8bdc80df3108242a',
            'install-control.py': 'c41144f91a1cfdba3dc184a0afda5c6917fa512a9873b143b8c271edb433b9b4',
            'worker-authority.mjs': '57d19d442e8708cd9215b2e5bbc055e5e3cfcca64417ec5a7e27f5e7e1dd8e71',
            'derive-rehearsal-inputs.py': 'b928a987234c57fe9e319145e090edebe22719518ae804122e417e128eb23acb',
        },
    }
    return value


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

    def variant_signer_result(self, value):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'plan.json'
            source.write_text(canonical(value), encoding='utf-8', newline='\n')
            fingerprint = hashlib.sha256(source.read_bytes()).hexdigest()
            return subprocess.run([
                sys.executable, str(SIGNER), 'sign-control-handoff',
                '--private', str(root / 'missing-private-key'), '--input', str(source),
                '--output', str(root / 'approval.json'),
                '--confirm', f"GO {value['operationId']} {fingerprint}",
            ], cwd=ROOT, text=True, capture_output=True)

    def test_variant_a_signer_rejects_scope_drift_before_private_key_access(self):
        valid = self.variant_signer_result(variant_a_plan())
        self.assertNotEqual(valid.returncode, 0)  # It reaches the intentionally missing key.
        self.assertNotIn('Unsupported Variant A', valid.stderr)
        for field, value in [('oldReleaseSha', '0' * 40), ('oldControlSha256', '0' * 64),
                             ('newReleaseSha', '0' * 40)]:
            with self.subTest(field=field):
                changed = variant_a_plan()
                changed[field] = value
                result = self.variant_signer_result(changed)
                self.assertIn('Unsupported Variant A orchestrator transition', result.stderr)
                self.assertNotIn('missing-private-key', result.stderr)
        for field in ['newOrchestratorSha256', 'newControlEntrySha256', 'newPreparationRunnerSha256']:
            with self.subTest(field=field):
                changed = variant_a_plan()
                changed['orchestratorTransition'][field] = '0' * 64
                result = self.variant_signer_result(changed)
                self.assertIn('Unsupported Variant A orchestrator transition', result.stderr)
                self.assertNotIn('missing-private-key', result.stderr)
        for field, value in [('maxLockWaitSeconds', 121), ('targetProfile', 'API_6G_V1')]:
            with self.subTest(field=field):
                changed = variant_a_plan()
                changed[field] = value
                result = self.variant_signer_result(changed)
                self.assertIn('Unsupported Variant A orchestrator transition', result.stderr)
                self.assertNotIn('missing-private-key', result.stderr)
        changed = variant_a_plan()
        changed['action'] = 'RESOURCE_PROFILE_BOOTSTRAP'
        self.assertIn('cannot include Variant A', self.variant_signer_result(changed).stderr)

    def test_variant_a_repair_signer_binds_every_old_and_new_runtime_leaf(self):
        valid = self.variant_signer_result(variant_a_repair_plan())
        self.assertNotEqual(valid.returncode, 0)
        self.assertNotIn('Unsupported Variant A', valid.stderr)
        for side in ['oldRuntimeFilesSha256', 'newRuntimeFilesSha256']:
            for leaf in variant_a_repair_plan()['orchestratorTransition'][side]:
                with self.subTest(side=side, leaf=leaf):
                    changed = variant_a_repair_plan()
                    changed['orchestratorTransition'][side][leaf] = '0' * 64
                    result = self.variant_signer_result(changed)
                    self.assertIn('Unsupported Variant A orchestrator transition', result.stderr)
                    self.assertNotIn('missing-private-key', result.stderr)
        for mutate in [
            lambda value: value['orchestratorTransition'].update(extra=True),
            lambda value: value['orchestratorTransition']['newRuntimeFilesSha256'].pop('install-control.py'),
            lambda value: value['orchestratorTransition'].update(contract='LEETPLUS_VARIANT_A_ORCHESTRATOR_HANDOFF_V1'),
            lambda value: value.update(oldControlSha256='0' * 64),
        ]:
            changed = variant_a_repair_plan()
            mutate(changed)
            self.assertIn('Unsupported Variant A orchestrator transition', self.variant_signer_result(changed).stderr)


if __name__ == '__main__':
    unittest.main()
