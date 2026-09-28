"""Offline deployment-root signer for public-only external-worker root enrollment.

The CLI cannot establish that confirmation came directly from the dispatcher;
the dispatcher must retain its own direct-GO receipt. No key generation,
network access, server mutation, or external private-key handling exists here.
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


CONTRACT = 'LEETPLUS_EXTERNAL_WORKER_PUBLIC_ROOT_V1_APPROVAL'
ACTION = 'ENROLL_PUBLIC_ONLY'
RECOVERY_CONTRACT = 'LEETPLUS_EXTERNAL_WORKER_PUBLIC_ROOT_V1_RECOVERY_APPROVAL'
PUBLIC_PATH = '/etc/leetplus-compose/external-worker-root.pem'
FIELDS = (
    'contract', 'operationId', 'action', 'hostIdentitySha256',
    'publicDerSha256', 'publicPath', 'issuedAt', 'expiresAt',
)
RECOVERY_FIELDS = (
    'contract', 'operationId', 'action', 'hostIdentitySha256',
    'originalOperationId', 'originalEnvelopeSha256', 'intentSha256',
    'publicDerSha256', 'publicPath', 'installedPostimageSha256',
    'issuedAt', 'expiresAt',
)
HASH = re.compile(r'[a-f0-9]{64}\Z')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z')
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
    item = path.stat(follow_symlinks=False)
    if path.is_symlink() or _is_reparse(item) or not stat.S_ISREG(item.st_mode) or item.st_nlink != 1 or item.st_size > maximum:
        raise ValueError('Input must be a one-link regular non-reparse file')
    flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    descriptor = os.open(path, flags)
    with os.fdopen(descriptor, 'rb') as stream:
        before = os.fstat(stream.fileno())
        raw = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
    current = path.stat(follow_symlinks=False)
    identity = lambda value: (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns)
    if len(raw) > maximum or len(raw) != before.st_size or before.st_nlink != 1 or identity(before) != identity(after) or identity(after) != identity(current):
        raise ValueError('Input changed during read')
    return raw


def output_path_checked(path):
    path = canonical_path(path, False)
    parent = path.parent
    item = parent.stat(follow_symlinks=False)
    if parent.resolve(strict=True) != parent or parent.is_symlink() or _is_reparse(item) or not stat.S_ISDIR(item.st_mode):
        raise ValueError('Output parent is unsafe')
    if path.exists() or path.is_symlink():
        raise FileExistsError('Root approval output already exists')
    return path


def write_exclusive(path, value):
    path = output_path_checked(path)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    descriptor = os.open(path, flags, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())
    item = path.stat(follow_symlinks=False)
    if path.is_symlink() or _is_reparse(item) or not stat.S_ISREG(item.st_mode) or item.st_nlink != 1:
        raise ValueError('Root approval output identity is unsafe')


def utc(value, label):
    if not isinstance(value, str) or not UTC.fullmatch(value):
        raise ValueError(f'Invalid {label}')
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.utcoffset() != timedelta(0):
        raise ValueError(f'Invalid {label}')
    return result


def public_key(public_bytes, label):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    try:
        text = public_bytes.decode('ascii')
    except UnicodeDecodeError as error:
        raise ValueError(f'{label} must be public-only PEM') from error
    if not text.startswith('-----BEGIN PUBLIC KEY-----\n') or not text.endswith('-----END PUBLIC KEY-----\n') or 'PRIVATE KEY' in text:
        raise ValueError(f'{label} must be public-only PEM')
    key = serialization.load_pem_public_key(public_bytes)
    if not isinstance(key, Ed25519PublicKey):
        raise ValueError(f'{label} must be Ed25519')
    der = key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    if len(der) != 44:
        raise ValueError(f'{label} DER SPKI length drift')
    return key, der


def validate_statement(raw, external_der_sha256, confirm, now, kind='enrollment'):
    try:
        value = json.loads(raw)
    except (ValueError, TypeError, UnicodeDecodeError) as error:
        raise ValueError('Root statement is not JSON') from error
    fields = RECOVERY_FIELDS if kind == 'recovery' else FIELDS
    if raw != canonical(value) or not isinstance(value, dict) or tuple(value) != fields:
        raise ValueError('Root statement must use exact fields, order, indent-2 JSON and LF')
    if not UUID.fullmatch(value['operationId'] or '') or not HASH.fullmatch(value['hostIdentitySha256'] or '') or \
            value['publicPath'] != PUBLIC_PATH or value['publicDerSha256'] != external_der_sha256:
        raise ValueError('Root statement scope/host/public identity is invalid')
    if kind == 'recovery':
        if value['contract'] != RECOVERY_CONTRACT or value['action'] not in ('RECOVER_INSTALLED', 'RETIRE_ABSENT') or \
                not UUID.fullmatch(value['originalOperationId'] or '') or \
                not HASH.fullmatch(value['originalEnvelopeSha256'] or '') or not HASH.fullmatch(value['intentSha256'] or '') or \
                (value['action'] == 'RECOVER_INSTALLED' and not HASH.fullmatch(value['installedPostimageSha256'] or '')) or \
                (value['action'] == 'RETIRE_ABSENT' and value['installedPostimageSha256'] is not None):
            raise ValueError('Root recovery statement scope or postimage is invalid')
    elif kind == 'enrollment':
        if value['contract'] != CONTRACT or value['action'] != ACTION:
            raise ValueError('Root statement scope/host/public identity is invalid')
    else:
        raise ValueError('Root signer kind must be enrollment or recovery')
    issued, expires = utc(value['issuedAt'], 'root issuedAt'), utc(value['expiresAt'], 'root expiresAt')
    if issued > now + timedelta(seconds=30) or expires <= now or expires <= issued or expires - issued > timedelta(minutes=30):
        raise ValueError('Root statement is expired, future-issued, or unbounded')
    statement_sha256 = digest(raw)
    go_prefix = 'GO EXTERNAL-WORKER-ROOT-RECOVERY' if kind == 'recovery' else 'GO EXTERNAL-WORKER-ROOT'
    if confirm != f"{go_prefix} {value['operationId']} {statement_sha256}":
        raise ValueError('Exact dispatcher GO text is required')
    return value, statement_sha256


def default_private_loader(path):
    from backup_crypto import dpapi
    from cryptography.hazmat.primitives import serialization
    return serialization.load_pem_private_key(dpapi(read_checked(path, 64 * 1024), decrypt=True), password=None)


def sign_external_worker_root(*, input_path, external_public_path, expected_external_public_sha256,
                              deployment_public_path, expected_deployment_public_sha256,
                              deployment_private_path, output_path, confirm, now=None,
                              private_loader=None, kind='enrollment'):
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None or current.utcoffset() != timedelta(0):
        raise ValueError('Signer clock must be timezone-aware UTC')
    raw_statement = read_checked(input_path)
    external_key, external_der = public_key(read_checked(external_public_path, 64 * 1024), 'External worker root')
    if not HASH.fullmatch(expected_external_public_sha256 or '') or digest(external_der) != expected_external_public_sha256:
        raise ValueError('External worker public DER provenance differs')
    deployment_key, deployment_der = public_key(read_checked(deployment_public_path, 64 * 1024), 'Deployment root')
    if not HASH.fullmatch(expected_deployment_public_sha256 or '') or digest(deployment_der) != expected_deployment_public_sha256:
        raise ValueError('Deployment public DER provenance differs')
    if external_der == deployment_der:
        raise ValueError('External worker root must differ from deployment root')
    statement, statement_sha256 = validate_statement(raw_statement, digest(external_der), confirm, current, kind)
    output_path = output_path_checked(output_path)

    loader = private_loader or default_private_loader
    private_key = loader(deployment_private_path)
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    if not isinstance(private_key, Ed25519PrivateKey):
        raise ValueError('Deployment private key must be Ed25519')
    derived = private_key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    if derived != deployment_der:
        raise ValueError('Deployment private key does not match explicit deployment root')
    result = {'statement': statement, 'signature': base64.b64encode(private_key.sign(raw_statement)).decode()}
    if not SIGNATURE.fullmatch(result['signature']):
        raise ValueError('Root approval signature encoding failed')
    output = canonical(result)
    write_exclusive(output_path, output)
    return {
        'operationId': statement['operationId'],
        'statementSha256': statement_sha256,
        'approvalSha256': digest(output),
        'externalPublicDerSha256': digest(external_der),
        'deploymentPublicDerSha256': digest(deployment_der),
        'dispatcherDirectGoReceiptRequired': True,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description='Sign public-only external-worker root enrollment')
    parser.add_argument('--input', required=True)
    parser.add_argument('--external-public', required=True)
    parser.add_argument('--expected-external-public-sha256', required=True)
    parser.add_argument('--deployment-public', required=True)
    parser.add_argument('--expected-deployment-public-sha256', required=True)
    parser.add_argument('--deployment-private', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--confirm', required=True)
    parser.add_argument('--kind', choices=['enrollment', 'recovery'], default='enrollment')
    args = parser.parse_args(argv)
    result = sign_external_worker_root(
        input_path=Path(args.input), external_public_path=Path(args.external_public),
        expected_external_public_sha256=args.expected_external_public_sha256,
        deployment_public_path=Path(args.deployment_public),
        expected_deployment_public_sha256=args.expected_deployment_public_sha256,
        deployment_private_path=Path(args.deployment_private), output_path=Path(args.output),
        confirm=args.confirm, kind=args.kind,
    )
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
