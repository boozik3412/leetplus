"""Offline exact-target controller permit signer; no server connection or effect."""
import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

COMPOSE = Path(__file__).resolve().parents[2] / 'deploy' / 'leetplus-compose'
sys.path.insert(0, str(COMPOSE))

PLAN_CONTRACT = 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V2_PLAN'
ACTION = 'CONTROL_HANDOFF_EXACT_TARGET'
PERMIT_CONTRACT = 'LEETPLUS_COMPOSE_EXACT_TARGET_CONTROL_HANDOFF_V1_PERMIT'
ROLLBACK_ACTION = 'CONTROL_HANDOFF_EXACT_TARGET_ROLLBACK'
ROLLBACK_CONTRACT = 'LEETPLUS_COMPOSE_EXACT_TARGET_CONTROL_HANDOFF_V1_ROLLBACK_PERMIT'
HASH = re.compile(r'[a-f0-9]{64}\Z')
SHA = re.compile(r'[a-f0-9]{40}\Z')


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def exact_file(path):
    raw = Path(path).read_bytes()
    value = json.loads(raw)
    if raw != canonical(value):
        raise ValueError('Only canonical LF JSON is signable')
    return value, raw


def parse_utc(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z', value):
        raise ValueError('Exact UTC timestamp required')
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def build_permit(plan, receipt, issued_at, expires_at):
    if not isinstance(plan, dict) or plan.get('contract') != PLAN_CONTRACT or plan.get('action') != ACTION or plan.get('permitPath') != 'permit.json':
        raise ValueError('Unsupported exact-target plan')
    for name in ('operationId', 'hostIdentitySha256', 'snapshot', 'predecessor', 'target'):
        if name not in plan:
            raise ValueError('Incomplete exact-target plan')
    if not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', plan['operationId']) or \
       not HASH.fullmatch(plan['hostIdentitySha256']) or \
       not isinstance(plan['snapshot'], dict) or not HASH.fullmatch(plan['snapshot'].get('activeSha256', '')):
        raise ValueError('Exact-target operation, host or active identity is invalid')
    if not isinstance(plan['predecessor'], dict) or set(plan['predecessor']) != {'releaseSha', 'manifestSha256', 'verifierSha256'} or \
       not isinstance(plan['target'], dict) or set(plan['target']) != {'releaseSha', 'manifestSha256', 'admissionSha256', 'controlArchiveSha256', 'filesSha256', 'criticalFilesSha256'} or \
       not all(HASH.fullmatch(value) for name, value in plan['predecessor'].items() if name != 'releaseSha') or \
       not all(HASH.fullmatch(value) for name, value in plan['target'].items() if name != 'releaseSha'):
        raise ValueError('Exact-target predecessor or target field map is invalid')
    if not SHA.fullmatch(plan.get('oldReleaseSha', '')) or not SHA.fullmatch(plan.get('newReleaseSha', '')) or \
       not HASH.fullmatch(plan.get('oldControlSha256', '')) or not HASH.fullmatch(plan.get('newControlSha256', '')) or \
       plan['predecessor'].get('releaseSha') != plan['oldReleaseSha'] or \
       plan['predecessor'].get('manifestSha256') != plan['oldControlSha256'] or \
       plan['target'].get('releaseSha') != plan['newReleaseSha'] or \
       plan['target'].get('manifestSha256') != plan['newControlSha256'] or \
       plan['oldReleaseSha'] == plan['newReleaseSha']:
        raise ValueError('Target or predecessor identity is not bound to plan')
    if plan.get('applicationRestartAllowed') is not False or plan.get('timersMayBeStopped') is not False or \
       plan.get('rollbackAllowed') is not True or plan.get('maxLockWaitSeconds') != 120:
        raise ValueError('Permit cannot widen controller-only scope')
    begin, end = parse_utc(issued_at), parse_utc(expires_at)
    if end <= begin or (end - begin).total_seconds() > 4 * 3600 or \
       end <= datetime.now(timezone.utc) or (begin - datetime.now(timezone.utc)).total_seconds() > 30:
        raise ValueError('Permit expiry is not a future bounded window')
    common = {
        'operationId': plan['operationId'],
        'hostIdentitySha256': plan['hostIdentitySha256'],
        'planSha256': digest(canonical(plan)),
        'activeSha256': plan['snapshot']['activeSha256'],
        'predecessor': plan['predecessor'],
        'target': plan['target'],
        'issuedAt': issued_at,
        'expiresAt': expires_at,
    }
    if receipt is None:
        return {'contract': PERMIT_CONTRACT, 'operationId': common['operationId'],
                'action': ACTION, **{key: value for key, value in common.items() if key != 'operationId'}}
    if receipt.get('contract') != PERMIT_CONTRACT + '_RECEIPT' or receipt.get('decision') != 'PASS' or \
       receipt.get('operationId') != plan['operationId'] or receipt.get('planSha256') != common['planSha256']:
        raise ValueError('Rollback requires exact accepted forward receipt')
    return {'contract': ROLLBACK_CONTRACT, 'operationId': common['operationId'],
            'action': ROLLBACK_ACTION, 'receiptSha256': digest(canonical(receipt)),
            **{key: value for key, value in common.items() if key != 'operationId'}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['forward', 'rollback'])
    parser.add_argument('--plan', required=True)
    parser.add_argument('--receipt')
    parser.add_argument('--private', required=True)
    parser.add_argument('--public', required=True)
    parser.add_argument('--issued-at', required=True)
    parser.add_argument('--expires-at', required=True)
    parser.add_argument('--confirm', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    plan, _ = exact_file(args.plan)
    receipt = exact_file(args.receipt)[0] if args.receipt else None
    if (args.command == 'forward') != (receipt is None):
        raise SystemExit('Rollback receipt must be supplied only for rollback')
    permit = build_permit(plan, receipt, args.issued_at, args.expires_at)
    plan_sha = digest(canonical(plan))
    exact_confirm = f"PERMIT {args.command.upper()} {plan['operationId']} {plan_sha} {plan['oldControlSha256']} {plan['newControlSha256']} {args.expires_at}"
    if args.confirm != exact_confirm:
        raise SystemExit('Exact operation, both manifests and expiry confirmation required')
    # Private material is opened only after all shape/scope/confirmation checks.
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from backup_crypto import dpapi, write_exclusive
    key = serialization.load_pem_private_key(dpapi(Path(args.private).read_bytes(), decrypt=True), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise SystemExit('Expected dedicated Ed25519 deployment key')
    public = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    if public != Path(args.public).read_bytes():
        raise SystemExit('Selected private key is not the installed approval root')
    envelope = {'permit': permit, 'signature': __import__('base64').b64encode(key.sign(canonical(permit))).decode()}
    write_exclusive(args.output, canonical(envelope))
    print(json.dumps({'contract': permit['contract'], 'operationId': permit['operationId'],
                      'planSha256': plan_sha, 'permitSha256': digest(canonical(envelope)),
                      'expiresAt': permit['expiresAt']}))


if __name__ == '__main__':
    main()
