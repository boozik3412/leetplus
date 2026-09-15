"""Offline Windows approval signing. Prints digests, never private material."""
import argparse
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from backup_crypto import dpapi, write_exclusive
import base64


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def iso(value):
    return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


parser = argparse.ArgumentParser()
parser.add_argument('command', choices=['keygen', 'sign-plan', 'sign-worker', 'sign-control-handoff', 'sign-control-rollback'])
parser.add_argument('--private', required=True)
parser.add_argument('--public')
parser.add_argument('--input')
parser.add_argument('--output')
parser.add_argument('--confirm')
parser.add_argument('--receipt')
args = parser.parse_args()
if args.command == 'keygen':
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
    if raw != canonical(value):
        raise SystemExit('Only canonical LF JSON may be signed')
    fingerprint = hashlib.sha256(raw).hexdigest()
    identity = value.get('operationId') if args.command in ['sign-plan', 'sign-control-handoff', 'sign-control-rollback'] else value.get('id')
    expected_confirmation = f'GO {identity} {fingerprint}'
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
    key = serialization.load_pem_private_key(dpapi(Path(args.private).read_bytes(), decrypt=True), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise SystemExit('Expected dedicated Ed25519 deployment key')
    if args.command in ['sign-control-handoff', 'sign-control-rollback']:
        base = 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1'
        if value.get('contract') != base + '_PLAN' or value.get('action') != 'CONTROL_HANDOFF' or value.get('applicationRestartAllowed') is not False or value.get('timersMayBeStopped') is not False or value.get('rollbackAllowed') is not True:
            raise SystemExit('Unsupported serving-controller-only plan')
        now = datetime.now(timezone.utc)
        reverse = args.command == 'sign-control-rollback'
        approval = {'contract': base + ('_ROLLBACK_APPROVAL' if reverse else '_APPROVAL'), 'operationId': identity,
                    'action': 'CONTROL_ROLLBACK' if reverse else 'CONTROL_HANDOFF', 'hostIdentitySha256': value['hostIdentitySha256'],
                    'planSha256': fingerprint, 'issuedAt': iso(now), 'expiresAt': iso(now + timedelta(hours=4))}
        if reverse:
            approval['receiptSha256'] = rollback_receipt_sha
        result = {'approval': approval, 'signature': base64.b64encode(key.sign(canonical(approval))).decode()}
    elif args.command == 'sign-plan':
        if value.get('contract') != 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_PLAN' or value.get('action') not in ['BOOTSTRAP', 'ROLLOUT']:
            raise SystemExit('Unsupported plan contract')
        now = datetime.now(timezone.utc)
        approval = {'contract': 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_APPROVAL', 'operationId': identity,
                    'action': value['action'], 'hostIdentitySha256': value['hostIdentitySha256'],
                    'planSha256': fingerprint, 'issuedAt': iso(now), 'expiresAt': iso(now + timedelta(hours=4))}
        result = {'approval': approval, 'signature': base64.b64encode(key.sign(canonical(approval))).decode()}
    else:
        if value.get('contract') != 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_WORKER_GRANT':
            raise SystemExit('Unsupported worker grant')
        result = {'grant': value, 'signature': base64.b64encode(key.sign(raw)).decode()}
    write_exclusive(args.output, canonical(result))
    print(json.dumps({'signedDigest': fingerprint, 'envelopeSha256': hashlib.sha256(canonical(result)).hexdigest()}))
