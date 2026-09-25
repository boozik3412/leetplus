"""Offline Windows approval signing. Prints digests, never private material."""
import argparse
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import base64

CONTROL_HANDOFF_CONTRACT = 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1'
RESOURCE_PROFILE_BOOTSTRAP = 'RESOURCE_PROFILE_BOOTSTRAP'
PREDECESSOR_CONTROL_SHA = '892b25b9fe5ebc8d0c20a7874a77ac312b7a0978'
PREDECESSOR_CONTRACT_SHA256 = 'bba588a506cee3dc6c03a0b93f25291a4dd5f36c1d05fb79d83128bf0276f79d'
VARIANT_A_PREDECESSOR_SHA = '02acca249783cf47c0a24897203d51a206e1c5b2'
VARIANT_A_PREDECESSOR_MANIFEST_SHA256 = '5ee7133885692b4c6e86ab680b4040770c985cee4c3381fb372302041232fcad'
VARIANT_A_OLD_ORCHESTRATOR_SHA256 = 'c6fd054d39175266ac0603759423f4fe039294c2a42b03f0b8bd12a8f280aa58'
VARIANT_A_NEW_ORCHESTRATOR_SHA256 = 'c4d13a76d1f97f41dc575d37c5da588b9ba3634b1a053f6b194a86623e8861c4'
VARIANT_A_NEW_CONTROL_SHA256 = '4e39b9e8a75ede6bc474fe0ef8b0b5fea60b46edd7c1ed8172744288625ea49f'
VARIANT_A_NEW_RUNNER_SHA256 = '9b02c697d6995b0ff9d4cc085d1249d6e83d96d0cb2848a1e6a139acf3f1eb29'
VARIANT_A_REPAIR_PREDECESSOR_SHA = '88010292246249c94ba66ecbab64e4d51ad84d8c'
VARIANT_A_REPAIR_PREDECESSOR_MANIFEST_SHA256 = '237cbcba1fbfcc9e58e78aede7b57f599b206f8c02253c43006dd308c04e9c85'
VARIANT_A_REPAIR_CONTRACT = 'LEETPLUS_VARIANT_A_CONTROLLER_REPAIR_HANDOFF_V2'
VARIANT_A_REPAIR_OLD_FILES = {
    'control.mjs': VARIANT_A_NEW_CONTROL_SHA256,
    'orchestrator.mjs': VARIANT_A_NEW_ORCHESTRATOR_SHA256,
    'preparation-runner.mjs': VARIANT_A_NEW_RUNNER_SHA256,
    'worker-authority.mjs': '4c615c56795a025b2c58662c0b9fea5f4dfa7b55d62dae867a77a86dffe0dcf6',
}
VARIANT_A_REPAIR_NEW_FILES = {
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
}


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def iso(value):
    return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def validate_control_handoff_plan(value):
    if value.get('contract') != CONTROL_HANDOFF_CONTRACT + '_PLAN' or value.get('applicationRestartAllowed') is not False or value.get('timersMayBeStopped') is not False or value.get('rollbackAllowed') is not True:
        raise SystemExit('Unsupported serving-controller-only plan')
    action = value.get('action')
    if action == 'CONTROL_HANDOFF':
        if 'orchestratorTransition' in value:
            transition = value['orchestratorTransition']
            expected_v1 = {'contract': 'LEETPLUS_VARIANT_A_ORCHESTRATOR_HANDOFF_V1',
                           'oldReleaseSha': value.get('oldReleaseSha'), 'newReleaseSha': value.get('newReleaseSha'),
                           'oldControlSha256': value.get('oldControlSha256'), 'newControlSha256': value.get('newControlSha256'),
                           'oldOrchestratorSha256': VARIANT_A_OLD_ORCHESTRATOR_SHA256,
                           'newOrchestratorSha256': VARIANT_A_NEW_ORCHESTRATOR_SHA256,
                           'newControlEntrySha256': VARIANT_A_NEW_CONTROL_SHA256,
                           'newPreparationRunnerSha256': VARIANT_A_NEW_RUNNER_SHA256}
            expected_v2 = {'contract': VARIANT_A_REPAIR_CONTRACT,
                           'oldReleaseSha': value.get('oldReleaseSha'), 'newReleaseSha': value.get('newReleaseSha'),
                           'oldControlSha256': value.get('oldControlSha256'), 'newControlSha256': value.get('newControlSha256'),
                           'oldRuntimeFilesSha256': VARIANT_A_REPAIR_OLD_FILES,
                           'newRuntimeFilesSha256': VARIANT_A_REPAIR_NEW_FILES}
            v1 = (transition == expected_v1 and value.get('oldReleaseSha') == VARIANT_A_PREDECESSOR_SHA and
                  value.get('oldControlSha256') == VARIANT_A_PREDECESSOR_MANIFEST_SHA256)
            v2 = (transition == expected_v2 and value.get('oldReleaseSha') == VARIANT_A_REPAIR_PREDECESSOR_SHA and
                  value.get('oldControlSha256') == VARIANT_A_REPAIR_PREDECESSOR_MANIFEST_SHA256)
            if (not isinstance(transition, dict) or not (v1 or v2) or
                    not isinstance(value.get('newReleaseSha'), str) or not re.fullmatch('[a-f0-9]{40}', value['newReleaseSha']) or
                    value['newReleaseSha'] == value['oldReleaseSha'] or
                    not isinstance(value.get('newControlSha256'), str) or not re.fullmatch('[a-f0-9]{64}', value['newControlSha256']) or
                    value['newControlSha256'] == value['oldControlSha256'] or value.get('maxLockWaitSeconds') != 120 or
                    any(key in value for key in ('predecessorControlSha', 'predecessorContractSha256', 'legacyProfile', 'targetProfile',
                                                'historicalComposeIdentityVerified', 'resourceLimitMutationAllowed'))):
                raise SystemExit('Unsupported Variant A orchestrator transition')
        return action
    if 'orchestratorTransition' in value:
        raise SystemExit('Resource-profile bootstrap cannot include Variant A orchestrator transition')
    new_release = value.get('newReleaseSha')
    if action != RESOURCE_PROFILE_BOOTSTRAP or value.get('oldReleaseSha') != PREDECESSOR_CONTROL_SHA or not isinstance(new_release, str) or not re.fullmatch('[a-f0-9]{40}', new_release) or new_release == PREDECESSOR_CONTROL_SHA or value.get('predecessorControlSha') != PREDECESSOR_CONTROL_SHA or value.get('predecessorContractSha256') != PREDECESSOR_CONTRACT_SHA256 or value.get('legacyProfile') != 'LEGACY_4G' or value.get('targetProfile') != 'API_6G_V1' or value.get('historicalComposeIdentityVerified') is not True or value.get('resourceLimitMutationAllowed') is not False:
        raise SystemExit('Unsupported resource-profile bootstrap plan')
    return action


parser = argparse.ArgumentParser()
parser.add_argument('command', choices=['keygen', 'sign-plan', 'sign-worker', 'sign-control-handoff', 'sign-control-rollback', 'sign-c61-owner-approval'])
parser.add_argument('--private', required=True)
parser.add_argument('--public')
parser.add_argument('--input')
parser.add_argument('--output')
parser.add_argument('--confirm')
parser.add_argument('--receipt')
args = parser.parse_args()
if args.command == 'keygen':
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from backup_crypto import dpapi, write_exclusive
    if Path(args.private).exists() or Path(args.public).exists():
        raise SystemExit('Existing signing keys must not be overwritten')
    key = Ed25519PrivateKey.generate()
    raw = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    public = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    write_exclusive(args.private, dpapi(raw))
    write_exclusive(args.public, public)
    print(json.dumps({'publicKeySha256': hashlib.sha256(public).hexdigest()}))
else:
    raw = Path(args.input).read_bytes()
    value = json.loads(raw)
    if args.command == 'sign-c61-owner-approval':
        raw = canonical(value)
    if raw != canonical(value):
        raise SystemExit('Only canonical LF JSON may be signed')
    fingerprint = hashlib.sha256(raw).hexdigest()
    control_action = validate_control_handoff_plan(value) if args.command in ['sign-control-handoff', 'sign-control-rollback'] else None
    identity = value.get('operationId') if args.command in ['sign-plan', 'sign-control-handoff', 'sign-control-rollback'] else value.get('id')
    if args.command == 'sign-c61-owner-approval':
        if value.get('ticketNumber') != 'LP-BUG-C61EE785' or value.get('approval') != 'BUDGET_REFILL_ONLY_NO_XP_NO_BONUS' or not isinstance(value.get('blockedDecisionIds'), list) or not value.get('ownerEvidenceDigest'):
            raise SystemExit('Unsupported C61 owner approval envelope')
        identity = value['ticketNumber']
    expected_confirmation = f'APPROVE C61 {identity} {fingerprint}' if args.command == 'sign-c61-owner-approval' else f'GO {identity} {fingerprint}'
    rollback_receipt_sha = None
    if args.command == 'sign-control-rollback':
        if not args.receipt:
            raise SystemExit('Rollback needs the accepted forward receipt')
        receipt_raw = Path(args.receipt).read_bytes()
        receipt = json.loads(receipt_raw)
        if receipt_raw != canonical(receipt) or receipt.get('contract') != 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_RECEIPT' or receipt.get('decision') != 'PASS' or receipt.get('operationId') != identity or receipt.get('planSha256') != fingerprint:
            raise SystemExit('Rollback receipt does not bind the approved plan')
        rollback_receipt_sha = hashlib.sha256(receipt_raw).hexdigest()
        expected_confirmation = f'ROLLBACK {identity} {fingerprint} {rollback_receipt_sha}'
    if args.confirm != expected_confirmation:
        raise SystemExit('Exact operation/id and digest confirmation required after production GO')
    if args.command == 'sign-plan':
        from approval_window import plan_expiration
        try:
            plan_expiration(value, datetime.now(timezone.utc))
        except ValueError as error:
            raise SystemExit(str(error)) from error
        if value.get('contract') == 'LEETPLUS_COMPOSE_BLUE_GREEN_V2_PLAN':
            if (value.get('action') != 'ROLLOUT' or value.get('releaseLane') != 'L1_APP_ONLY' or
                    not isinstance(value.get('workerContinuation'), dict) or
                    value['workerContinuation'].get('contract') != 'LEETPLUS_WORKER_CONTINUATION_V2' or
                    any(not isinstance(value.get(name), str) or not re.fullmatch('[a-f0-9]{64}', value[name]) for name in
                        ['appAdmissionSha256', 'appArchiveSha256', 'dataBaselineCertificationSha256']) or
                    value.get('admissionSha256') != value.get('appAdmissionSha256') or
                    value.get('archiveSha256') != value.get('appArchiveSha256')):
                raise SystemExit('Unsupported V2 app-only plan authority')
    # Scope rejection has no cryptography/runtime dependency and occurs before
    # private-key access; pure CI negatives need neither keys nor DPAPI.
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from backup_crypto import dpapi, write_exclusive
    key = serialization.load_pem_private_key(dpapi(Path(args.private).read_bytes(), decrypt=True), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise SystemExit('Expected dedicated Ed25519 deployment key')
    if args.command in ['sign-control-handoff', 'sign-control-rollback']:
        base = CONTROL_HANDOFF_CONTRACT
        now = datetime.now(timezone.utc)
        reverse = args.command == 'sign-control-rollback'
        approval = {'contract': base + ('_ROLLBACK_APPROVAL' if reverse else '_APPROVAL'), 'operationId': identity,
                    'action': 'CONTROL_ROLLBACK' if reverse else control_action, 'hostIdentitySha256': value['hostIdentitySha256'],
                    'planSha256': fingerprint, 'issuedAt': iso(now), 'expiresAt': iso(now + timedelta(hours=4))}
        if reverse:
            approval['receiptSha256'] = rollback_receipt_sha
        result = {'approval': approval, 'signature': base64.b64encode(key.sign(canonical(approval))).decode()}
    elif args.command == 'sign-c61-owner-approval':
        public = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        if not args.public:
            raise SystemExit('C61 signing requires an explicit public-root output path')
        public_path = Path(args.public)
        if public_path.exists() and public_path.read_bytes() != public:
            raise SystemExit('C61 public root path already has different bytes')
        if not public_path.exists():
            write_exclusive(public_path, public)
        result = {'approval': value, 'signature': base64.b64encode(key.sign(raw)).decode(), 'publicKeySha256': hashlib.sha256(public).hexdigest()}
    elif args.command == 'sign-plan':
        if value.get('contract') not in ['LEETPLUS_COMPOSE_BLUE_GREEN_V1_PLAN', 'LEETPLUS_COMPOSE_BLUE_GREEN_V2_PLAN'] or value.get('action') not in ['BOOTSTRAP', 'ROLLOUT']:
            raise SystemExit('Unsupported plan contract')
        if value['contract'] == 'LEETPLUS_COMPOSE_BLUE_GREEN_V2_PLAN':
            if (value['action'] != 'ROLLOUT' or value.get('releaseLane') != 'L1_APP_ONLY' or
                    value.get('workerContinuation', {}).get('contract') != 'LEETPLUS_WORKER_CONTINUATION_V2' or
                    any(not isinstance(value.get(name), str) or not re.fullmatch('[a-f0-9]{64}', value[name]) for name in
                        ['appAdmissionSha256', 'appArchiveSha256', 'dataBaselineCertificationSha256']) or
                    value.get('admissionSha256') != value.get('appAdmissionSha256') or
                    value.get('archiveSha256') != value.get('appArchiveSha256')):
                raise SystemExit('Unsupported V2 app-only plan authority')
        now = datetime.now(timezone.utc)
        approval = {'contract': 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_APPROVAL', 'operationId': identity,
                    'action': value['action'], 'hostIdentitySha256': value['hostIdentitySha256'],
                    'planSha256': fingerprint, 'issuedAt': iso(now), 'expiresAt': iso(plan_expiration(value, now))}
        result = {'approval': approval, 'signature': base64.b64encode(key.sign(canonical(approval))).decode()}
    else:
        if value.get('contract') != 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_WORKER_GRANT':
            raise SystemExit('Unsupported worker grant')
        result = {'grant': value, 'signature': base64.b64encode(key.sign(raw)).decode()}
    write_exclusive(args.output, canonical(result))
    print(json.dumps({'signedDigest': fingerprint, 'envelopeSha256': hashlib.sha256(canonical(result)).hexdigest()}))
