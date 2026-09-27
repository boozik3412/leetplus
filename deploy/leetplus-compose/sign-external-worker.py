"""Offline signer for the external Langame worker grant and enrollment domains.

This source does not verify installed admission. The production dispatcher
must independently verify the admitted host/release/generation and retain the
direct-GO receipt before invoking this CLI. There is no key-generation path,
network access, or production private key in source.
"""

import argparse
import base64
import hashlib
import json
import os
import re
import stat
from datetime import datetime, timedelta, timezone
from pathlib import Path


GRANT_CONTRACT = 'LEETPLUS_LANGAME_EXTERNAL_WORKER_GRANT_V1'
ENROLLMENT_CONTRACT = 'LEETPLUS_LANGAME_EXTERNAL_WORKER_ENROLLMENT_V1'
APPROVAL_CONTRACT = f'{ENROLLMENT_CONTRACT}_APPROVAL'
IDENTITY = {
    'worker': 'langame-external-daily-worker',
    'tenantId': '8cc79086-ed43-44fa-83d3-20207ec48758',
    'tenantSlug': 'set-1',
    'sourceId': '94a3842b-847e-4c4d-89b0-7cb8976a9f17',
    'storeId': 'ecee16ef-f0cb-4307-b079-e2f0303c3a16',
    'domain': '1171.langame.ru',
    'clubId': '1',
    'customerStage': 'LIVE',
}
GRANT_FIELDS = (
    'contract', 'id', 'worker', 'mode', 'hostIdentitySha256', 'releaseSha',
    'generation', 'tenantId', 'tenantSlug', 'sourceId', 'storeId', 'domain',
    'clubId', 'customerStage', 'executionRevision', 'profileRevision',
    'storeRevision', 'secretSha256', 'issuedAt', 'expiresAt', 'businessDate',
)
PLAN_FIELDS = (
    'contract', 'operationId', 'action', 'hostIdentitySha256', 'activeSha256',
    'controllerManifestSha256', 'releaseSha', 'generation', 'worker', 'mode',
    'secretSha256', 'grantEnvelopeSha256', 'serviceUnitSha256',
    'timerUnitSha256', 'networkPolicySha256',
    'previousEnrollmentReceiptSha256', 'canaryReceiptSha256', 'issuedAt', 'expiresAt',
)
APPROVAL_FIELDS = (
    'contract', 'operationId', 'planSha256', 'hostIdentitySha256', 'action',
    'issuedAt', 'expiresAt',
)
HASH = re.compile(r'[a-f0-9]{64}\Z')
RELEASE = re.compile(r'[a-f0-9]{40}\Z')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z')
DATE = re.compile(r'\d{4}-\d\d-\d\d\Z')
UTC = re.compile(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z\Z')
SIGNATURE = re.compile(r'[A-Za-z0-9+/]{86}==\Z')


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def _is_reparse(info):
    return bool(getattr(info, 'st_file_attributes', 0) & 0x400)


def canonical_path(path, must_exist):
    value = Path(path)
    if not value.is_absolute() or '..' in value.parts or value.resolve(strict=must_exist) != value:
        raise ValueError('Absolute canonical non-reparse path required')
    return value


def read_checked(path, maximum=1024 * 1024):
    path = canonical_path(path, True)
    info = path.stat(follow_symlinks=False)
    if path.is_symlink() or _is_reparse(info) or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > maximum:
        raise ValueError('Input must be a one-link regular non-reparse file')
    flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    descriptor = os.open(path, flags)
    with os.fdopen(descriptor, 'rb') as stream:
        before = os.fstat(stream.fileno())
        raw = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
    current = path.stat(follow_symlinks=False)
    identity = lambda item: (item.st_dev, item.st_ino, item.st_size, item.st_mtime_ns)
    if len(raw) > maximum or len(raw) != before.st_size or before.st_nlink != 1 or identity(before) != identity(after) or identity(after) != identity(current):
        raise ValueError('Input changed during read')
    return raw


def output_path_checked(path):
    path = canonical_path(path, False)
    parent = path.parent
    info = parent.stat(follow_symlinks=False)
    if parent.resolve(strict=True) != parent or parent.is_symlink() or _is_reparse(info) or not stat.S_ISDIR(info.st_mode):
        raise ValueError('Output parent is unsafe')
    if path.exists() or path.is_symlink():
        raise FileExistsError('Signature output already exists')
    return path


def write_exclusive(path, value):
    path = output_path_checked(path)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    descriptor = os.open(path, flags, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())
    info = path.stat(follow_symlinks=False)
    if path.is_symlink() or _is_reparse(info) or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError('Signature output identity is unsafe')


def exact_json(raw, fields, label):
    try:
        value = json.loads(raw)
    except (ValueError, TypeError, UnicodeDecodeError) as error:
        raise ValueError(f'{label} is not JSON') from error
    if raw != canonical(value) or not isinstance(value, dict) or tuple(value) != fields:
        raise ValueError(f'{label} must use exact fields, order, indent-2 JSON and LF')
    return value


def utc(value, label):
    if not isinstance(value, str) or not UTC.fullmatch(value):
        raise ValueError(f'Invalid {label}')
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.utcoffset() != timedelta(0):
        raise ValueError(f'Invalid {label}')
    return result


def validate_grant(raw, now):
    grant = exact_json(raw, GRANT_FIELDS, 'External worker grant')
    if grant['contract'] != GRANT_CONTRACT or not UUID.fullmatch(grant['id'] or '') or grant['mode'] not in ('CANARY', 'TIMER'):
        raise ValueError('Unsupported external worker grant scope')
    for key, expected in IDENTITY.items():
        if grant[key] != expected:
            raise ValueError(f'External worker grant {key} differs')
    if not HASH.fullmatch(grant['hostIdentitySha256'] or '') or not RELEASE.fullmatch(grant['releaseSha'] or '') or \
            not isinstance(grant['generation'], int) or isinstance(grant['generation'], bool) or grant['generation'] < 0 or \
            not HASH.fullmatch(grant['secretSha256'] or ''):
        raise ValueError('External worker grant release/host identity is invalid')
    if not isinstance(grant['executionRevision'], int) or isinstance(grant['executionRevision'], bool) or grant['executionRevision'] <= 0 or \
            not isinstance(grant['profileRevision'], int) or isinstance(grant['profileRevision'], bool) or grant['profileRevision'] <= 0 or \
            not isinstance(grant['storeRevision'], int) or isinstance(grant['storeRevision'], bool) or grant['storeRevision'] < 0:
        raise ValueError('External worker grant revisions are invalid')
    issued, expires = utc(grant['issuedAt'], 'grant issuedAt'), utc(grant['expiresAt'], 'grant expiresAt')
    maximum = timedelta(hours=4) if grant['mode'] == 'CANARY' else timedelta(days=90)
    if issued > now + timedelta(seconds=30) or expires <= now or expires <= issued or expires - issued > maximum:
        raise ValueError('External worker grant is expired, future-issued, or unbounded')
    if grant['mode'] == 'CANARY':
        if not isinstance(grant['businessDate'], str) or not DATE.fullmatch(grant['businessDate']) or datetime.fromisoformat(grant['businessDate']).date().isoformat() != grant['businessDate']:
            raise ValueError('CANARY grant requires one exact business date')
    elif grant['businessDate'] is not None:
        raise ValueError('TIMER grant businessDate must be null')
    return grant, expires


def validate_enrollment(raw, now):
    plan = exact_json(raw, PLAN_FIELDS, 'External worker enrollment plan')
    if plan['contract'] != f'{ENROLLMENT_CONTRACT}_PLAN' or not UUID.fullmatch(plan['operationId'] or '') or \
            plan['action'] not in ('ENROLL_CANARY', 'ENROLL_TIMER') or plan['worker'] != IDENTITY['worker'] or \
            plan['mode'] != plan['action'].removeprefix('ENROLL_'):
        raise ValueError('Unsupported external worker enrollment scope')
    hashes = ('hostIdentitySha256', 'activeSha256', 'controllerManifestSha256', 'secretSha256',
              'grantEnvelopeSha256', 'serviceUnitSha256', 'timerUnitSha256', 'networkPolicySha256')
    if any(not HASH.fullmatch(plan[key] or '') for key in hashes) or not RELEASE.fullmatch(plan['releaseSha'] or '') or \
            not isinstance(plan['generation'], int) or isinstance(plan['generation'], bool) or plan['generation'] < 0 or \
            (plan['previousEnrollmentReceiptSha256'] is not None and not HASH.fullmatch(plan['previousEnrollmentReceiptSha256'] or '')) or \
            (plan['mode'] == 'CANARY' and (plan['previousEnrollmentReceiptSha256'] is not None or plan['canaryReceiptSha256'] is not None)) or \
            (plan['mode'] == 'TIMER' and (not HASH.fullmatch(plan['previousEnrollmentReceiptSha256'] or '') or
                                           not HASH.fullmatch(plan['canaryReceiptSha256'] or ''))):
        raise ValueError('External worker enrollment identities are invalid')
    issued, expires = utc(plan['issuedAt'], 'plan issuedAt'), utc(plan['expiresAt'], 'plan expiresAt')
    if issued > now + timedelta(seconds=30) or expires <= now or expires <= issued or expires - issued > timedelta(hours=4):
        raise ValueError('External worker enrollment is expired, future-issued, or unbounded')
    return plan, expires


def validate_public_root(public_bytes, expected_der_sha256):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    key = serialization.load_pem_public_key(public_bytes)
    if not isinstance(key, Ed25519PublicKey):
        raise ValueError('Dedicated Ed25519 external-worker root required')
    der = key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    if not HASH.fullmatch(expected_der_sha256 or '') or digest(der) != expected_der_sha256:
        raise ValueError('External-worker public DER provenance differs')
    return key, der


def private_matches(private_key, public_key):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    if not isinstance(private_key, Ed25519PrivateKey):
        raise ValueError('Dedicated Ed25519 external-worker private key required')
    derived = private_key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    expected = public_key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    if derived != expected:
        raise ValueError('Private key does not match external-worker public root')


def default_private_loader(path):
    from backup_crypto import dpapi
    from cryptography.hazmat.primitives import serialization
    return serialization.load_pem_private_key(dpapi(read_checked(path, 64 * 1024), decrypt=True), password=None)


def sign_external_worker(*, kind, input_path, private_path, public_path, expected_public_sha256,
                         output_path, confirm, now=None, private_loader=None):
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None or current.utcoffset() != timedelta(0):
        raise ValueError('Signer clock must be timezone-aware UTC')
    raw = read_checked(input_path)
    if kind == 'grant':
        value, authority_expiry = validate_grant(raw, current)
        identity = value['id']
    elif kind == 'enrollment':
        value, authority_expiry = validate_enrollment(raw, current)
        identity = value['operationId']
    else:
        raise ValueError('Signer kind must be grant or enrollment')
    input_sha256 = digest(raw)
    if confirm != f'GO EXTERNAL-WORKER {identity} {input_sha256}':
        raise ValueError('Exact dispatcher GO text is required')
    public_key, public_der = validate_public_root(read_checked(public_path, 64 * 1024), expected_public_sha256)
    output_path = output_path_checked(output_path)
    loader = private_loader or default_private_loader
    private_key = loader(private_path)
    private_matches(private_key, public_key)
    if kind == 'grant':
        result = {'grant': value, 'signature': base64.b64encode(private_key.sign(raw)).decode()}
    else:
        approval = {
            'contract': APPROVAL_CONTRACT,
            'operationId': value['operationId'],
            'planSha256': input_sha256,
            'hostIdentitySha256': value['hostIdentitySha256'],
            'action': value['action'],
            'issuedAt': current.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
            'expiresAt': min(authority_expiry, current + timedelta(hours=4)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
        }
        if tuple(approval) != APPROVAL_FIELDS:
            raise ValueError('Enrollment approval wire order failed')
        approval_raw = canonical(approval)
        result = {'approval': approval, 'signature': base64.b64encode(private_key.sign(approval_raw)).decode()}
    if not SIGNATURE.fullmatch(result['signature']):
        raise ValueError('External-worker signature encoding failed')
    output = canonical(result)
    write_exclusive(output_path, output)
    return {
        'kind': kind,
        'identity': identity,
        'inputSha256': input_sha256,
        'outputSha256': digest(output),
        'publicDerSha256': digest(public_der),
        'dispatcherDirectGoReceiptRequired': True,
        'installedAdmissionVerifiedBySigner': False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description='Sign one exact external-worker authority')
    parser.add_argument('--kind', choices=('grant', 'enrollment'), required=True)
    parser.add_argument('--input', required=True)
    parser.add_argument('--private', required=True)
    parser.add_argument('--public', required=True)
    parser.add_argument('--expected-public-sha256', required=True, help='SHA-256 of DER SubjectPublicKeyInfo')
    parser.add_argument('--output', required=True)
    parser.add_argument('--confirm', required=True)
    args = parser.parse_args(argv)
    result = sign_external_worker(
        kind=args.kind, input_path=Path(args.input), private_path=Path(args.private),
        public_path=Path(args.public), expected_public_sha256=args.expected_public_sha256,
        output_path=Path(args.output), confirm=args.confirm,
    )
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
