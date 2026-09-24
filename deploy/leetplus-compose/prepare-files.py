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
import stat
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
APP_BUNDLE = 'LEETPLUS_COMPOSE_APP_BUNDLE_V2'
APP_ADMISSION = 'LEETPLUS_COMPOSE_APP_ADMISSION_V2'
APP_DOWNLOAD = 'LEETPLUS_COMPOSE_APP_DOWNLOAD_V2'
APP_LANE = 'L1_APP_ONLY'
CURRENT_MIGRATION = '20260908180000_external_langame_simple_onboarding'
HASH = re.compile(r'^[a-f0-9]{64}$')
SHA = re.compile(r'^[a-f0-9]{40}$')
IMAGE = re.compile(r'^sha256:[a-f0-9]{64}$')
UTC = re.compile(r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$')
APP_DOWNLOAD_FILES = {
    'app-bundle.json', 'app-images.tar.gz', 'control.tar.gz', 'transport-validation.json',
    'app-api-runtime-validation.json', 'archive-roundtrip.json', 'network-validation.json',
    'runtime-validation.json', 'SHA256SUMS',
}
APP_DOWNLOAD_ADMISSION_FIELDS = {
    'app-bundle.json': 'bundleManifestSha256',
    'app-images.tar.gz': 'appArchiveSha256',
    'transport-validation.json': 'transportValidationSha256',
    'app-api-runtime-validation.json': 'apiRuntimeValidationSha256',
    'archive-roundtrip.json': 'archiveRoundtripSha256',
    'network-validation.json': 'networkValidationSha256',
    'runtime-validation.json': 'runtimeValidationSha256',
}


def write(path, value, uid=0, gid=0, mode=0o400):
    data = value if isinstance(value, bytes) else (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as out:
        os.fchmod(out.fileno(), mode)
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


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def file_digest(path):
    path = Path(path)
    before = path.lstat()
    digest = hashlib.sha256()
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        actual = os.fstat(fd)
        if (actual.st_dev, actual.st_ino, actual.st_size) != (before.st_dev, before.st_ino, before.st_size):
            raise ValueError('File identity changed while hashing')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
        after = os.fstat(fd)
        if (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) != (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns):
            raise ValueError('File changed while hashing')
    finally:
        os.close(fd)
    return digest.hexdigest()


def exact_keys(value, keys, label):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError(f'{label} keys are not exact')


def valid_utc(value):
    if not isinstance(value, str) or not UTC.fullmatch(value):
        return False
    try:
        datetime.datetime.fromisoformat(value.removesuffix('Z') + '+00:00')
        return True
    except ValueError:
        return False


def trusted_owner_mode(info, *, immutable=False):
    return info.st_uid == 0 and not info.st_mode & 0o022 and (not immutable or stat.S_IMODE(info.st_mode) == 0o400)


def trusted_stat(path, label, *, immutable=False, require_root=True, limit=4 * 1024 * 1024):
    path = Path(path)
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise ValueError(f'{label} path is not canonical')
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or path.is_symlink() or info.st_nlink != 1 or not 0 < info.st_size <= limit:
        raise ValueError(f'{label} is not a bounded one-link regular file')
    if require_root and os.name == 'posix':
        if not trusted_owner_mode(info, immutable=immutable):
            raise ValueError(f'{label} is not immutable root-owned evidence')
        parent = path.parent
        while True:
            parent_info = parent.lstat()
            if (not stat.S_ISDIR(parent_info.st_mode) or parent.is_symlink() or parent_info.st_uid != 0 or
                    parent_info.st_mode & 0o022):
                raise ValueError(f'{label} has an untrusted ancestor')
            if parent == parent.parent:
                break
            parent = parent.parent
    return info


def trusted_file(path, label, *, immutable=False, require_root=True, limit=4 * 1024 * 1024):
    path = Path(path)
    before = trusted_stat(path, label, immutable=immutable, require_root=require_root, limit=limit)
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        actual = os.fstat(fd)
        if (actual.st_dev, actual.st_ino, actual.st_size) != (before.st_dev, before.st_ino, before.st_size):
            raise ValueError(f'{label} identity changed while opening')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(limit + 1)
        after = os.fstat(fd)
        if (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) != (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns):
            raise ValueError(f'{label} changed while reading')
    finally:
        os.close(fd)
    if len(raw) > limit:
        raise ValueError(f'{label} exceeds its size bound')
    return raw


def trusted_json(path, label, *, immutable=False, require_root=True):
    raw = trusted_file(path, label, immutable=immutable, require_root=require_root)
    if b'\r' in raw:
        raise ValueError(f'{label} must use LF line endings')
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f'{label} must be JSON') from error
    if raw != canonical(value):
        raise ValueError(f'{label} must be canonical JSON')
    return raw, value


def validate_release(value, label):
    required = {'contract', 'releaseSha', 'builtAt', 'migrationCount', 'migration', 'images'}
    if set(value) not in (required, required | {'apiResourceProfile'}):
        raise ValueError(f'{label} keys are not exact')
    if (value.get('contract') != MODE or not SHA.fullmatch(value.get('releaseSha', '')) or
            value.get('migrationCount') != 191 or value.get('migration') != CURRENT_MIGRATION or
            not valid_utc(value.get('builtAt'))):
        raise ValueError(f'{label} is not an exact CURRENT191 release')
    if 'apiResourceProfile' in value and value['apiResourceProfile'] != 'API_6G_V1':
        raise ValueError(f'{label} has an unsupported API resource profile')
    exact_keys(value.get('images'), {'api', 'web', 'postgres', 'redis'}, f'{label} images')
    if not all(IMAGE.fullmatch(image) for image in value['images'].values()):
        raise ValueError(f'{label} has a mutable image reference')
    return value


def validate_v1_authority(manifest_path):
    release = json.loads(manifest_path.read_text())
    admission = json.loads((manifest_path.parent / 'docker-admission.json').read_text())
    if admission.get('decision') != 'PASS' or admission.get('releaseSha') != release.get('releaseSha') or release.get('migrationCount') != 191:
        raise ValueError('Admitted CURRENT191 image set required')
    if hashlib.sha256(manifest_path.read_bytes()).hexdigest() != admission.get('releaseManifestSha256'):
        raise ValueError('Release manifest digest mismatch')
    return release


def validate_source_capsule(path, *, require_root=True):
    path = Path(path)
    before = trusted_stat(path, 'source capsule', require_root=require_root, limit=16 * 1024 * 1024 * 1024)
    required = {f'system/etc/leetplus/{name}' for name in [
        'runtime.env', 'slots/green.env', 'canary-safe.env', 'guest-user-call-live.env',
        'bonus-ledger-worker.env', 'langame-daily-worker.env',
    ]}
    seen = set()
    audit_prefix = 'system/var/lib/leetplus/langame-sync/'
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        actual = os.fstat(fd)
        if (actual.st_dev, actual.st_ino, actual.st_size) != (before.st_dev, before.st_ino, before.st_size):
            raise ValueError('Source capsule identity changed while opening')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            try:
                with tarfile.open(fileobj=stream, mode='r:') as archive:
                    for member in archive.getmembers():
                        if member.name in required:
                            if member.name in seen or not member.isfile() or member.size > 65536:
                                raise ValueError('Invalid source environment member')
                            seen.add(member.name)
                        elif member.name.startswith(audit_prefix) and not member.isdir():
                            relative = member.name[len(audit_prefix):]
                            if (member.name in seen or not member.isfile() or
                                    not re.fullmatch(r'[a-f0-9-]{36}/[A-Za-z0-9_.-]{1,200}\.json', relative) or
                                    member.size > 8 * 1024 * 1024):
                                raise ValueError('Unexpected mutable audit file in source capsule')
                            seen.add(member.name)
                            try:
                                json.loads(archive.extractfile(member).read())
                            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                                raise ValueError('Invalid mutable audit JSON in source capsule') from error
            except (tarfile.TarError, OSError) as error:
                raise ValueError('Invalid source capsule') from error
        after = os.fstat(fd)
        if (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) != (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns):
            raise ValueError('Source capsule changed while reading')
    finally:
        os.close(fd)
    if not required.issubset(seen):
        raise ValueError('Source capsule lacks a required environment member')


def validate_app_only_authority(manifest_path, source, app_bundle_path, app_admission_path,
                                app_download_receipt_path, data_baseline_path, data_admission_path,
                                *, state_root=Path('/var/lib/leetplus-compose'),
                                production_root=Path('/srv/leetplus'), require_root=True):
    manifest_path, source = Path(manifest_path), Path(source)
    app_bundle_path, app_admission_path = Path(app_bundle_path), Path(app_admission_path)
    app_download_receipt_path = Path(app_download_receipt_path)
    data_baseline_path, data_admission_path = Path(data_baseline_path), Path(data_admission_path)
    derived_raw, release = trusted_json(manifest_path, 'derived release', immutable=True, require_root=require_root)
    validate_release(release, 'derived release')
    if (manifest_path.name != 'derived-v1-release.json' or data_baseline_path.name != 'active-data-baseline.json' or
            manifest_path.parent != data_baseline_path.parent or
            not manifest_path.is_relative_to(Path(state_root) / 'preparations')):
        raise ValueError('Derived release/data paths are outside the private preparation operation')

    app_root = Path(state_root) / 'app-downloads' / release['releaseSha']
    if (app_bundle_path != app_root / 'bundle/app-bundle.json' or
            app_admission_path != app_root / 'app-admission.json' or
            app_download_receipt_path != app_root / 'download-receipt.json'):
        raise ValueError('App-only evidence must use the exact installed download paths')
    bundle_raw, bundle = trusted_json(app_bundle_path, 'AppBundle V2', require_root=require_root)
    admission_raw, admission = trusted_json(app_admission_path, 'AppAdmission V2', immutable=True, require_root=require_root)
    receipt_raw, receipt = trusted_json(app_download_receipt_path, 'app download receipt', immutable=True, require_root=require_root)

    exact_keys(bundle, {'schemaVersion', 'contract', 'releaseLane', 'releaseSha', 'builtAt', 'apiResourceProfile',
                        'sourceImpact', 'appImages', 'schemaRequirement', 'compatibilityRequirements', 'runtimeEvidence'}, 'AppBundle V2')
    if (bundle.get('schemaVersion') != 2 or bundle.get('contract') != APP_BUNDLE or bundle.get('releaseLane') != APP_LANE or
            bundle.get('releaseSha') != release['releaseSha'] or bundle.get('apiResourceProfile') != 'API_6G_V1' or
            not valid_utc(bundle.get('builtAt'))):
        raise ValueError('Invalid AppBundle V2 identity')
    exact_keys(bundle['sourceImpact'], {'baseSha', 'headSha', 'classifierId', 'rulesSha256', 'impactReceiptSha256'}, 'source impact')
    if (not SHA.fullmatch(bundle['sourceImpact'].get('baseSha', '')) or bundle['sourceImpact'].get('headSha') != bundle['releaseSha'] or
            bundle['sourceImpact'].get('classifierId') != 'LEETPLUS_RELEASE_IMPACT_V1' or
            not all(HASH.fullmatch(bundle['sourceImpact'].get(key, '')) for key in ['rulesSha256', 'impactReceiptSha256'])):
        raise ValueError('Invalid AppBundle source impact')
    exact_keys(bundle['appImages'], {'api', 'web'}, 'AppBundle images')
    if (not all(IMAGE.fullmatch(image) for image in bundle['appImages'].values()) or
            bundle['appImages']['api'] == bundle['appImages']['web']):
        raise ValueError('Invalid AppBundle API/Web image IDs')
    exact_keys(bundle['schemaRequirement'], {'migrationCount', 'migration', 'prismaSchemaSha256', 'migrationsInventorySha256'}, 'schema requirement')
    if (bundle['schemaRequirement'].get('migrationCount') != 191 or bundle['schemaRequirement'].get('migration') != CURRENT_MIGRATION or
            not all(HASH.fullmatch(bundle['schemaRequirement'].get(key, '')) for key in ['prismaSchemaSha256', 'migrationsInventorySha256'])):
        raise ValueError('AppBundle is not CURRENT191 compatible')
    exact_keys(bundle['compatibilityRequirements'], {'policySha256', 'composeRuntimeContractSha256', 'controllerCapability', 'dataContract'}, 'compatibility requirements')
    if (bundle['compatibilityRequirements'].get('controllerCapability') != 'APP_ONLY_V2_BASELINE_CERTIFICATION' or
            bundle['compatibilityRequirements'].get('dataContract') != MODE or
            not all(HASH.fullmatch(bundle['compatibilityRequirements'].get(key, '')) for key in ['policySha256', 'composeRuntimeContractSha256'])):
        raise ValueError('Unsupported AppBundle data/controller contract')
    runtime_keys = {'transportValidationSha256', 'apiRuntimeValidationSha256', 'archiveRoundtripSha256',
                    'networkValidationSha256', 'runtimeValidationSha256'}
    exact_keys(bundle['runtimeEvidence'], runtime_keys, 'runtime evidence')
    if not all(HASH.fullmatch(value) for value in bundle['runtimeEvidence'].values()):
        raise ValueError('Invalid AppBundle runtime evidence')

    admission_keys = {'schemaVersion', 'contract', 'decision', 'releaseLane', 'releaseSha', 'repository', 'ref', 'event',
                      'runId', 'runAttempt', 'workflowRef', 'workflowSha', 'parentCandidateReceiptSha256',
                      'parentImpactReceiptSha256', 'requiredGateReceiptSha256', 'gateReceiptSha256', 'appArtifact',
                      'bundleManifestSha256', 'appArchiveSha256', 'transportValidationSha256', 'apiRuntimeValidationSha256',
                      'archiveRoundtripSha256', 'networkValidationSha256', 'runtimeValidationSha256', 'appImages',
                      'schemaRequirementSha256', 'compatibilityRequirementsSha256'}
    exact_keys(admission, admission_keys, 'AppAdmission V2')
    if (admission.get('schemaVersion') != 2 or admission.get('contract') != APP_ADMISSION or admission.get('decision') != 'PASS' or
            admission.get('releaseLane') != APP_LANE or admission.get('releaseSha') != bundle['releaseSha'] or
            admission.get('repository') != 'boozik3412/leetplus' or admission.get('ref') != 'refs/heads/main' or
            admission.get('event') != 'push' or admission.get('workflowSha') != bundle['releaseSha'] or
            admission.get('workflowRef') != 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main'):
        raise ValueError('AppAdmission is not exact-main PASS')
    if (admission.get('bundleManifestSha256') != hashlib.sha256(bundle_raw).hexdigest() or
            admission.get('parentImpactReceiptSha256') != bundle['sourceImpact']['impactReceiptSha256'] or
            admission.get('appImages') != bundle['appImages'] or
            admission.get('schemaRequirementSha256') != hashlib.sha256(canonical(bundle['schemaRequirement'])).hexdigest() or
            admission.get('compatibilityRequirementsSha256') != hashlib.sha256(canonical(bundle['compatibilityRequirements'])).hexdigest() or
            any(admission.get(key) != bundle['runtimeEvidence'][key] for key in runtime_keys)):
        raise ValueError('AppAdmission does not bind the exact AppBundle')
    if (not re.fullmatch(r'[1-9][0-9]*', str(admission.get('runId', ''))) or
            not re.fullmatch(r'[1-9][0-9]*', str(admission.get('runAttempt', '')))):
        raise ValueError('Invalid AppAdmission run identity')
    exact_keys(admission['appImages'], {'api', 'web'}, 'admitted app images')
    exact_keys(admission['gateReceiptSha256'], {'authorityRootTrust', 'application', 'postgresqlAssortment',
                                               'migrationSmoke', 'appImageRuntime'}, 'gate receipts')
    exact_keys(admission['appArtifact'], {'name', 'id', 'transportDigest'}, 'app artifact')
    digest_fields = ['parentCandidateReceiptSha256', 'parentImpactReceiptSha256', 'requiredGateReceiptSha256',
                     'bundleManifestSha256', 'appArchiveSha256', 'transportValidationSha256',
                     'apiRuntimeValidationSha256', 'archiveRoundtripSha256', 'networkValidationSha256',
                     'runtimeValidationSha256', 'schemaRequirementSha256', 'compatibilityRequirementsSha256']
    if (not all(HASH.fullmatch(admission.get(key, '')) for key in digest_fields) or
            not all(HASH.fullmatch(value) for value in admission['gateReceiptSha256'].values()) or
            not HASH.fullmatch(admission['appArtifact'].get('transportDigest', '')) or
            admission['appArtifact'].get('name') != f"leetplus-compose-app-{bundle['releaseSha']}-{admission['runId']}-{admission['runAttempt']}" or
            not re.fullmatch(r'[1-9][0-9]*', str(admission['appArtifact'].get('id', '')))):
        raise ValueError('Invalid AppAdmission digest')

    receipt_keys = {'contract', 'decision', 'inputSha256', 'appAdmissionSha256', 'releaseSha', 'runId', 'runAttempt',
                    'artifactId', 'completedAt', 'intentSha256', 'remoteSha256', 'files'}
    exact_keys(receipt, receipt_keys, 'app download receipt')
    if (receipt.get('contract') != APP_DOWNLOAD or receipt.get('decision') != 'PASS' or receipt.get('releaseSha') != bundle['releaseSha'] or
            receipt.get('appAdmissionSha256') != hashlib.sha256(admission_raw).hexdigest() or
            str(receipt.get('runId')) != str(admission['runId']) or str(receipt.get('runAttempt')) != str(admission['runAttempt']) or
            str(receipt.get('artifactId')) != str(admission['appArtifact']['id']) or not valid_utc(receipt.get('completedAt')) or
            not all(HASH.fullmatch(receipt.get(key, '')) for key in ['inputSha256', 'intentSha256', 'remoteSha256'])):
        raise ValueError('App download receipt does not bind AppAdmission')
    if set(receipt.get('files', {})) != APP_DOWNLOAD_FILES:
        raise ValueError('App download receipt file set is not exact')
    for leaf, record in receipt['files'].items():
        exact_keys(record, {'sha256', 'bytes'}, f'download receipt {leaf}')
        if not HASH.fullmatch(record.get('sha256', '')) or not isinstance(record.get('bytes'), int) or record['bytes'] <= 0:
            raise ValueError(f'Invalid download receipt file: {leaf}')
    if any(receipt['files'][leaf]['sha256'] != admission[field]
           for leaf, field in APP_DOWNLOAD_ADMISSION_FIELDS.items()):
        raise ValueError('App download receipt does not bind admitted validation bytes')
    archive_path = app_bundle_path.parent / 'app-images.tar.gz'
    archive_info = trusted_stat(archive_path, 'app image archive', require_root=require_root,
                                limit=16 * 1024 * 1024 * 1024)
    if (receipt['files']['app-bundle.json'] != {'sha256': hashlib.sha256(bundle_raw).hexdigest(), 'bytes': len(bundle_raw)} or
            receipt['files']['app-images.tar.gz'] != {'sha256': file_digest(archive_path), 'bytes': archive_info.st_size} or
            receipt['files']['app-images.tar.gz']['sha256'] != admission['appArchiveSha256']):
        raise ValueError('App download file bytes drifted')

    baseline_raw, baseline = trusted_json(data_baseline_path, 'active data baseline', immutable=True, require_root=require_root)
    exact_keys(baseline, {'contract', 'activeStateSha256', 'dataRelease', 'dataAdmissionSha256'}, 'active data baseline')
    if baseline.get('contract') != 'LEETPLUS_PREPARATION_ACTIVE_DATA_V2' or not HASH.fullmatch(baseline.get('activeStateSha256', '')):
        raise ValueError('Invalid guarded active data baseline')
    data_release = validate_release(baseline.get('dataRelease'), 'active data release')
    if not HASH.fullmatch(baseline.get('dataAdmissionSha256', '')):
        raise ValueError('Controller accepted data admission digest is required')
    if data_admission_path != Path(production_root) / 'inbox' / data_release['releaseSha'] / 'docker-admission.json':
        raise ValueError('Data admission path is not the exact installed V1 inbox')
    # Historical V1 admission is installed root-owned 0440. Its accepted raw
    # digest comes from the guarded active state; requiring 0400 here would
    # reject the real V1 inbox without adding integrity.
    data_admission_raw, data_admission = trusted_json(data_admission_path, 'accepted data admission', require_root=require_root)
    if hashlib.sha256(data_admission_raw).hexdigest() != baseline['dataAdmissionSha256']:
        raise ValueError('Accepted data admission digest mismatch')
    if (data_admission.get('contract') != MODE + '_ADMISSION' or data_admission.get('decision') != 'PASS' or
            data_admission.get('repository') != 'boozik3412/leetplus' or data_admission.get('ref') != 'refs/heads/main' or
            data_admission.get('event') != 'push' or data_admission.get('releaseSha') != data_release['releaseSha'] or
            data_admission.get('images') != data_release['images'] or
            data_admission.get('releaseManifestSha256') != hashlib.sha256(canonical(data_release)).hexdigest()):
        raise ValueError('Active data release is not bound to its accepted V1 admission')

    expected = dict(data_release)
    expected.update({'releaseSha': bundle['releaseSha'], 'builtAt': bundle['builtAt'],
                     'migrationCount': 191, 'migration': CURRENT_MIGRATION,
                     'apiResourceProfile': bundle['apiResourceProfile'],
                     'images': {'api': bundle['appImages']['api'], 'web': bundle['appImages']['web'],
                                'postgres': data_release['images']['postgres'], 'redis': data_release['images']['redis']}})
    if release != expected or derived_raw != canonical(expected):
        raise ValueError('Derived release is not the exact admitted app/data composition')
    validate_source_capsule(source, require_root=require_root)
    return release, {
        'appBundleSha256': hashlib.sha256(bundle_raw).hexdigest(),
        'appAdmissionSha256': hashlib.sha256(admission_raw).hexdigest(),
        'appDownloadReceiptSha256': hashlib.sha256(receipt_raw).hexdigest(),
        'activeDataBaselineSha256': hashlib.sha256(baseline_raw).hexdigest(),
        'dataAdmissionSha256': baseline['dataAdmissionSha256'],
        'derivedReleaseSha256': hashlib.sha256(derived_raw).hexdigest(),
    }


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


def prepare(root, manifest_path, source, rehearsal, app_only=None):
    if os.getuid() != 0 or root != Path('/srv/leetplus-migration/rehearsal' if rehearsal else '/srv/leetplus'):
        raise ValueError('Exact root-owned target required')
    app_evidence = None
    if app_only:
        release, app_evidence = validate_app_only_authority(manifest_path, source, **app_only)
    else:
        release = validate_v1_authority(manifest_path)
    if (root / 'preparation.json').exists() or (root / 'secrets/api-blue.json').exists():
        raise ValueError('Existing preparation must be inspected, not overwritten')
    for relative in ['', 'secrets', 'secrets/postgres', 'data', 'data/cache-quarantine', 'backups', 'backups/export', 'acme']:
        mkdir(root / relative)
    # The SSH backup reader is jailed here; it must be able to traverse its
    # chroot after dropping privileges. Exported payloads stay encrypted.
    mkdir(root / 'backups/export', mode=0o755)
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
timezone='Europe/Moscow'
log_timezone='Europe/Moscow'
lc_messages='en_US.UTF-8'
lc_monetary='en_US.UTF-8'
lc_numeric='en_US.UTF-8'
lc_time='en_US.UTF-8'
default_text_search_config='pg_catalog.english'
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
    if app_evidence:
        receipt['appOnlyEvidence'] = app_evidence
    write(root / 'preparation.json', receipt)
    print(json.dumps({key: value for key, value in receipt.items() if key != 'secretFiles'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--release-json', type=Path, required=True)
    parser.add_argument('--source-capsule', type=Path, required=True)
    parser.add_argument('--rehearsal', action='store_true')
    parser.add_argument('--app-bundle', type=Path)
    parser.add_argument('--app-admission', type=Path)
    parser.add_argument('--app-download-receipt', type=Path)
    parser.add_argument('--data-baseline', type=Path)
    parser.add_argument('--data-admission', type=Path)
    args = parser.parse_args()
    v2 = [args.app_bundle, args.app_admission, args.app_download_receipt, args.data_baseline, args.data_admission]
    if any(v2) and not all(v2):
        parser.error('App-only V2 evidence arguments are all required together')
    app_only = None if not v2[0] else {
        'app_bundle_path': args.app_bundle,
        'app_admission_path': args.app_admission,
        'app_download_receipt_path': args.app_download_receipt,
        'data_baseline_path': args.data_baseline,
        'data_admission_path': args.data_admission,
    }
    prepare(Path('/srv/leetplus-migration/rehearsal' if args.rehearsal else '/srv/leetplus'),
            args.release_json, args.source_capsule, args.rehearsal, app_only)
