"""Offline signer for one external Langame tenant activation boundary.

The private key remains DPAPI-protected on the Windows operator host. This
module has no key-generation or public-root mutation path. Scope, time,
reason, confirmation, and public-root provenance are checked before private
key bytes are read or DPAPI is called.
"""

import argparse
import base64
import ctypes
import hashlib
import json
import os
import re
import stat
from datetime import datetime, timedelta, timezone
from pathlib import Path


CONTRACT = 'LEETPLUS_EXTERNAL_LANGAME_TENANT_APPROVAL_V1'
TENANT_ID = '8cc79086-ed43-44fa-83d3-20207ec48758'
ACTIONS = ('ACTIVATE_LIVE', 'REVOKE_OUTBOUND')
STATEMENT_FIELDS = (
    'contract', 'tenantId', 'action', 'planSha256', 'requestId',
    'reasonSha256', 'issuedAt', 'expiresAt',
)
OUTPUT_FIELDS = (*STATEMENT_FIELDS, 'signature')
HASH = re.compile(r'[a-f0-9]{64}\Z')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z')
UTC = re.compile(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z\Z')
SIGNATURE = re.compile(r'[A-Za-z0-9+/]{86}==\Z')
MAX_BYTES = 1024 * 1024
MAX_WINDOW = timedelta(minutes=30)


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def _is_reparse(info):
    return bool(getattr(info, 'st_file_attributes', 0) & 0x400)


def _canonical_path(path, *, must_exist):
    value = Path(path)
    if not value.is_absolute() or '..' in value.parts:
        raise ValueError('Absolute canonical path required')
    resolved = value.resolve(strict=must_exist)
    if resolved != value:
        raise ValueError('Symlink or reparse path is forbidden')
    return value


def read_checked(path, maximum=MAX_BYTES):
    path = _canonical_path(path, must_exist=True)
    before_path = path.stat(follow_symlinks=False)
    if path.is_symlink() or _is_reparse(before_path) or not stat.S_ISREG(before_path.st_mode) or \
            before_path.st_nlink != 1 or before_path.st_size > maximum:
        raise ValueError('Input must be a one-link regular non-reparse file')
    flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    descriptor = os.open(path, flags)
    with os.fdopen(descriptor, 'rb') as stream:
        before = os.fstat(stream.fileno())
        raw = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
    current = path.stat(follow_symlinks=False)
    # Windows may expose different creation/change timestamp projections for an
    # open handle and a pathname. File identity, length and content mtime remain
    # stable and the handle itself was opened without following links.
    identity = lambda item: (item.st_dev, item.st_ino, item.st_size, item.st_mtime_ns)
    if len(raw) > maximum or len(raw) != before.st_size or before.st_nlink != 1 or \
            identity(before) != identity(after) or identity(after) != identity(current):
        raise ValueError('Input changed during read')
    return raw


def _safe_output_parent(path):
    path = _canonical_path(path, must_exist=False)
    parent = path.parent
    if not parent.exists() or parent.resolve(strict=True) != parent:
        raise ValueError('Output parent must be an existing canonical directory')
    info = parent.stat(follow_symlinks=False)
    if parent.is_symlink() or _is_reparse(info) or not stat.S_ISDIR(info.st_mode):
        raise ValueError('Output parent cannot be a symlink or reparse point')
    if path.exists() or path.is_symlink():
        raise FileExistsError('Approval output already exists')
    return path


def write_exclusive(path, value):
    path = _safe_output_parent(path)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    descriptor = os.open(path, flags, 0o600)
    created = True
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        info = path.stat(follow_symlinks=False)
        if path.is_symlink() or _is_reparse(info) or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ValueError('Approval output identity is unsafe')
        created = False
    finally:
        if created and path.exists() and not path.is_symlink():
            path.unlink()


def exact_json(raw, label):
    try:
        value = json.loads(raw)
    except (TypeError, ValueError, UnicodeDecodeError) as error:
        raise ValueError(f'{label} is not JSON') from error
    if raw != canonical(value):
        raise ValueError(f'{label} must be canonical indent-2 LF JSON')
    return value


def utc(value, label):
    if not isinstance(value, str) or not UTC.fullmatch(value):
        raise ValueError(f'{label} must be exact UTC')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.utcoffset() != timedelta(0):
        raise ValueError(f'{label} must be UTC')
    return parsed


def validate_statement(raw_statement, raw_reason, confirm, now=None):
    statement = exact_json(raw_statement, 'Statement')
    reason = exact_json(raw_reason, 'Reason')
    if not isinstance(statement, dict) or tuple(statement) != STATEMENT_FIELDS:
        raise ValueError('Statement fields or wire order are invalid')
    if not isinstance(reason, str) or not reason.strip():
        raise ValueError('Reason must be one non-empty JSON string')
    if statement['contract'] != CONTRACT or statement['tenantId'] != TENANT_ID or \
            statement['action'] not in ACTIONS:
        raise ValueError('Statement scope is unsupported')
    if not HASH.fullmatch(statement['planSha256'] or '') or \
            not UUID.fullmatch(statement['requestId'] or '') or \
            not HASH.fullmatch(statement['reasonSha256'] or ''):
        raise ValueError('Statement identities are invalid')
    if statement['reasonSha256'] != digest(raw_reason):
        raise ValueError('Reason digest does not match the canonical reason string')
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None or current.utcoffset() != timedelta(0):
        raise ValueError('Signer clock must be timezone-aware UTC')
    issued_at = utc(statement['issuedAt'], 'issuedAt')
    expires_at = utc(statement['expiresAt'], 'expiresAt')
    if expires_at <= current or issued_at > current + timedelta(seconds=30) or \
            expires_at <= issued_at or expires_at - issued_at > MAX_WINDOW:
        raise ValueError('Statement is expired, future-issued, or unbounded')
    statement_sha256 = digest(raw_statement)
    expected_confirm = f"GO EXTERNAL-TENANT {statement['requestId']} {statement_sha256}"
    if confirm != expected_confirm:
        raise ValueError('Exact dispatcher GO text is required')
    return statement, reason, statement_sha256


def validate_public_root(public_bytes, expected_sha256):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    key = serialization.load_pem_public_key(public_bytes)
    if not isinstance(key, Ed25519PublicKey):
        raise ValueError('Dedicated Ed25519 approval public root required')
    der = key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    if not HASH.fullmatch(expected_sha256 or '') or digest(der) != expected_sha256:
        raise ValueError('Public approval-root DER provenance differs')
    return key


def output_bytes(statement, private_key, public_key):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    if not isinstance(private_key, Ed25519PrivateKey):
        raise ValueError('Dedicated Ed25519 approval private key required')
    derived = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    expected = public_key.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    if derived != expected:
        raise ValueError('Private key does not match the explicit approval root')
    raw = canonical(statement)
    result = {**statement, 'signature': base64.b64encode(private_key.sign(raw)).decode()}
    if tuple(result) != OUTPUT_FIELDS or not SIGNATURE.fullmatch(result['signature']):
        raise ValueError('Approval envelope serialization failed')
    return canonical(result)


def _default_private_loader(private_path):
    # Importing DPAPI custody and touching the private path happen only after
    # statement, reason, time, confirmation, public root, and output checks.
    from backup_crypto import dpapi
    from cryptography.hazmat.primitives import serialization
    raw = read_checked(private_path, 64 * 1024)
    return serialization.load_pem_private_key(dpapi(raw, decrypt=True), password=None)


def sign_external_tenant(*, input_path, reason_path, public_path,
                         expected_public_sha256, private_path, output_path,
                         confirm, now=None, private_loader=None):
    raw_statement = read_checked(input_path)
    raw_reason = read_checked(reason_path)
    statement, _, statement_sha256 = validate_statement(raw_statement, raw_reason, confirm, now)
    public_bytes = read_checked(public_path, 64 * 1024)
    public_key = validate_public_root(public_bytes, expected_public_sha256)
    output_path = _safe_output_parent(output_path)
    loader = private_loader or _default_private_loader
    private_key = loader(private_path)
    result = output_bytes(statement, private_key, public_key)
    write_exclusive(output_path, result)
    return {
        'contract': CONTRACT,
        'requestId': statement['requestId'],
        'statementSha256': statement_sha256,
        'approvalSha256': digest(result),
        'publicKeySha256': expected_public_sha256,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description='Sign one exact external Langame tenant statement')
    parser.add_argument('--input', required=True)
    parser.add_argument('--reason', required=True)
    parser.add_argument('--private', required=True)
    parser.add_argument('--public', required=True)
    parser.add_argument('--expected-public-sha256', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--confirm', required=True)
    args = parser.parse_args(argv)
    result = sign_external_tenant(
        input_path=Path(args.input), reason_path=Path(args.reason),
        public_path=Path(args.public), expected_public_sha256=args.expected_public_sha256,
        private_path=Path(args.private), output_path=Path(args.output),
        confirm=args.confirm,
    )
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
