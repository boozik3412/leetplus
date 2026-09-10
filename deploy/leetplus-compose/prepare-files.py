"""Prepare non-serving directories, distinct DB TLS and role-specific secrets.

The source capsule must already have passed authenticated off-host verification.
This command never starts services, enables workers or configures public nginx.
Rehearsal authentication/provider transport secrets are replaced; only data
encryption/fingerprint keys needed to read the restored dataset are retained.
"""
import argparse
import datetime
import hashlib
import ipaddress
import json
import os
import re
import secrets
import shlex
import subprocess
import tarfile
import urllib.parse
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

KEEP_DATA_KEYS = {'APP_ENCRYPTION_KEY', 'INTEGRATION_ENCRYPTION_KEY', 'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY',
                  'IDENTITY_MAIL_ENCRYPTION_KEY', 'IDENTITY_EMPLOYEE_INVITE_ENCRYPTION_KEY'}
MODE = 'LEETPLUS_COMPOSE_BLUE_GREEN_V1'


def write(path, value, uid=0, gid=0, mode=0o400):
    data = value if isinstance(value, bytes) else (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as out:
        out.write(data)
        out.flush()
        os.fsync(out.fileno())
    os.chown(path, uid, gid)


def mkdir(path, uid=0, gid=0, mode=0o700):
    path.mkdir(mode=mode, parents=True, exist_ok=True)
    stat = path.lstat()
    if path.is_symlink() or not path.is_dir():
        raise ValueError('Directory is not a regular directory')
    os.chown(path, uid, gid)
    os.chmod(path, mode)


def read_env(tar, name):
    member = tar.getmember('system/etc/leetplus/' + name)
    if not member.isfile() or member.size > 65536:
        raise ValueError('Invalid source environment member')
    result = {}
    for line in tar.extractfile(member).read().decode().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, separator, raw = line.partition('=')
        if not separator:
            raise ValueError('Invalid environment assignment')
        value = shlex.split(raw, comments=False, posix=True)
        result[key.strip()] = ' '.join(value)
    return result


def database_url(source, limit):
    url = urllib.parse.urlsplit(source)
    if url.scheme != 'postgresql' or url.username != 'leetplus_runtime' or not url.password or url.path != '/leetplus':
        raise ValueError('Source URL is not the expected non-owner runtime role')
    query = urllib.parse.urlencode({'schema': 'public', 'connection_limit': str(limit), 'pool_timeout': '5', 'connect_timeout': '5',
                                   'sslmode': 'require', 'sslcert': '/run/secrets/db-ca.pem', 'sslaccept': 'strict'})
    return urllib.parse.urlunsplit(('postgresql', f'{url.username}:{url.password}@postgres:5432', '/leetplus', query, ''))


def tls(root, rehearsal):
    now = datetime.datetime.now(datetime.timezone.utc)
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'LeetPlus rehearsal DB CA' if rehearsal else 'LeetPlus DB CA')])
    ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name).public_key(ca_key.public_key())
          .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(minutes=5)).not_valid_after(now + datetime.timedelta(days=730))
          .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
          .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=False, content_commitment=False, data_encipherment=False,
                                     key_agreement=False, key_cert_sign=True, crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
          .sign(ca_key, hashes.SHA256()))
    server_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'postgres')])
    address = '172.31.52.2' if rehearsal else '172.31.42.2'
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(ca_name).public_key(server_key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(minutes=5)).not_valid_after(now + datetime.timedelta(days=365))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.SubjectAlternativeName([x509.DNSName('postgres'), x509.IPAddress(ipaddress.ip_address(address))]), critical=False)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False).sign(ca_key, hashes.SHA256()))
    write(root / 'secrets/db-ca.pem', ca.public_bytes(serialization.Encoding.PEM), mode=0o444)
    write(root / 'secrets/db-ca-private.pem', ca_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    write(root / 'secrets/postgres/server.crt', cert.public_bytes(serialization.Encoding.PEM), gid=12030, mode=0o440)
    write(root / 'secrets/postgres/server.key', server_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()), gid=12030, mode=0o440)


def prepare(root, manifest_path, source, rehearsal):
    if os.getuid() != 0 or root != Path('/srv/leetplus-migration/rehearsal' if rehearsal else '/srv/leetplus'):
        raise ValueError('Exact root-owned target required')
    release = json.loads(manifest_path.read_text())
    admission = json.loads((manifest_path.parent / 'docker-admission.json').read_text())
    if admission.get('decision') != 'PASS' or admission.get('releaseSha') != release.get('releaseSha') or release.get('migrationCount') != 191:
        raise ValueError('Admitted CURRENT191 image set required')
    if hashlib.sha256(manifest_path.read_bytes()).hexdigest() != admission.get('releaseManifestSha256'):
        raise ValueError('Release manifest digest mismatch')
    if (root / 'preparation.json').exists() or (root / 'secrets/api-blue.json').exists():
        raise ValueError('Existing preparation must be inspected, not overwritten')
    for relative in ['', 'secrets', 'secrets/postgres', 'data', 'data/cache-quarantine', 'backups', 'backups/export', 'acme']:
        mkdir(root / relative)
    mkdir(root / 'secrets/postgres', gid=12030, mode=0o750)
    mkdir(root / 'data/postgres', uid=12030, gid=12030)
    mkdir(root / 'data/redis', uid=12031, gid=12031)
    mkdir(root / 'data/langame-sync', gid=12050, mode=0o2770)
    for slot, uid in [('blue', 12020), ('green', 12021)]:
        mkdir(root / f'data/web-cache-{slot}', uid=uid, gid=uid)
    tls(root, rehearsal)
    subnet = '172.31.52.0/24' if rehearsal else '172.31.42.0/24'
    pgconfig = """listen_addresses='0.0.0.0'
port=5432
max_connections=100
shared_buffers='2GB'
ssl=on
ssl_cert_file='/etc/leetplus-postgres/server.crt'
ssl_key_file='/etc/leetplus-postgres/server.key'
password_encryption='scram-sha-256'
unix_socket_directories='/tmp'
ident_file='/etc/leetplus-postgres/pg_ident.conf'
log_statement='none'
log_min_error_statement='panic'
wal_level=replica
max_standby_streaming_delay='180s'
hot_standby_feedback=off
"""
    write(root / 'secrets/postgres/postgresql.conf', pgconfig.encode(), gid=12030, mode=0o440)
    write(root / 'secrets/postgres/pg_ident.conf', b'leetplus_local leetplus-pg postgres\n', gid=12030, mode=0o440)
    hba = f'local all postgres peer map=leetplus_local\nlocal all all reject\nhostssl leetplus leetplus_runtime {subnet} scram-sha-256\nhost all all 0.0.0.0/0 reject\n'
    write(root / 'secrets/postgres/pg_hba.conf', hba.encode(), gid=12030, mode=0o440)
    control = Path(__file__).resolve().parent
    script = "import {SAFE_API} from './contract.mjs';console.log(JSON.stringify(Object.keys(SAFE_API)))"
    bound_keys = set(json.loads(subprocess.check_output(['/usr/bin/node', '--input-type=module', '-e', script], cwd=control, text=True)))
    bound_keys.update(['RELEASE_SHA', 'BUILD_TIME', 'WEB_BUILD_ID', 'EXPECTED_DATABASE_MIGRATION', 'EXPECTED_DATABASE_MIGRATION_COUNT', 'PATH', 'HOME', 'USER', 'LOGNAME', 'NEXT_TELEMETRY_DISABLED'])
    with tarfile.open(source, 'r:') as archive:
        api = {}
        for name in ['runtime.env', 'slots/green.env', 'canary-safe.env', 'guest-user-call-live.env']:
            api.update(read_env(archive, name))
        api = {key: value for key, value in api.items() if key not in bound_keys}
        api['DATABASE_URL'] = database_url(api['DATABASE_URL'], 4)
        if rehearsal:
            for key in list(api):
                if key not in KEEP_DATA_KEYS and any(marker in key for marker in ['SECRET', 'TOKEN', 'API_KEY', 'API_ID']) and not key.endswith(('_ENABLED', '_MODE', '_VERSION', '_TIMEOUT_MS')):
                    api[key] = secrets.token_urlsafe(48)
            api['MAIL_PASS'] = secrets.token_urlsafe(48)
        for slot, gid in [('blue', 12010), ('green', 12011)]:
            write(root / f'secrets/api-{slot}.json', api, gid=gid, mode=0o440)
        for name, gid in [('bonus-ledger-worker', 12040), ('langame-daily-worker', 12041)]:
            profile = read_env(archive, name + '.env')
            profile['DATABASE_URL'] = database_url(profile['DATABASE_URL'], 2)
            if rehearsal:
                profile['LANGAME_BONUS_ACCRUAL_ENABLED'] = 'false'
                profile['GUEST_BONUS_LEDGER_WORKER_DRY_RUN'] = 'true'
                profile['LANGAME_DAILY_WORKER_LIVE'] = 'false'
            write(root / f'secrets/{name}.json', profile, gid=gid, mode=0o440)
        prefix = 'system/var/lib/leetplus/langame-sync/'
        for member in archive.getmembers():
            if not member.name.startswith(prefix) or member.isdir():
                continue
            relative = member.name[len(prefix):]
            if not member.isfile() or not re.fullmatch(r'[a-f0-9-]{36}/[A-Za-z0-9_.-]{1,200}\.json', relative) or member.size > 8 * 1024 * 1024:
                raise ValueError('Unexpected mutable audit file in source capsule')
            parent = root / 'data/langame-sync' / relative.split('/')[0]
            mkdir(parent, gid=12050, mode=0o2770)
            content = archive.extractfile(member).read()
            json.loads(content)
            write(root / 'data/langame-sync' / relative, content, gid=12050, mode=0o660)
    receipt = {'contract': MODE + '_PREPARATION', 'decision': 'PREPARED_NOT_SERVING', 'releaseSha': release['releaseSha'],
               'rehearsal': rehearsal, 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'sourceConfigurationSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
               'secretFiles': {name: hashlib.sha256((root / 'secrets' / name).read_bytes()).hexdigest() for name in ['api-blue.json', 'api-green.json', 'db-ca.pem']}}
    write(root / 'preparation.json', receipt)
    print(json.dumps({key: value for key, value in receipt.items() if key != 'secretFiles'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--release-json', type=Path, required=True)
    parser.add_argument('--source-capsule', type=Path, required=True)
    parser.add_argument('--rehearsal', action='store_true')
    args = parser.parse_args()
    prepare(Path('/srv/leetplus-migration/rehearsal' if args.rehearsal else '/srv/leetplus'), args.release_json, args.source_capsule, args.rehearsal)
