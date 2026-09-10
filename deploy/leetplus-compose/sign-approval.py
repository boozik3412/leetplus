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
parser.add_argument('command', choices=['keygen', 'sign-plan', 'sign-worker'])
parser.add_argument('--private', required=True)
parser.add_argument('--public')
parser.add_argument('--input')
parser.add_argument('--output')
parser.add_argument('--confirm')
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
    identity = value.get('operationId') if args.command == 'sign-plan' else value.get('id')
    if args.confirm != f'GO {identity} {fingerprint}':
        raise SystemExit('Exact operation/id and digest confirmation required after production GO')
    key = serialization.load_pem_private_key(dpapi(Path(args.private).read_bytes(), decrypt=True), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise SystemExit('Expected dedicated Ed25519 deployment key')
    if args.command == 'sign-plan':
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
