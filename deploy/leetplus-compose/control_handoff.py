"""Signed serving-controller handoff; never restarts application/data containers.

Stage with install-control.py --stage-only first. One atomic core symlink is
the switch: unchanged network/backup launchers delegate through that symlink.
All before/after bytes and authority remain recoverable under the state tree
already included in encrypted backups. A pending handoff is resumable, not a
reason to overwrite immutable history or restart the application.
"""
import argparse
import base64
import contextlib
import datetime
import hashlib
import io
import json
import os
import re
import signal
import stat
import subprocess
import sys
import tarfile
import time
import uuid
from pathlib import Path, PurePosixPath

sys.dont_write_bytecode = True
CONTRACT = 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1'
EXACT_TARGET_PERMIT_CONTRACT = 'LEETPLUS_COMPOSE_EXACT_TARGET_CONTROL_HANDOFF_V1_PERMIT'
EXACT_TARGET_ACTION = 'CONTROL_HANDOFF_EXACT_TARGET'
EXACT_TARGET_ROLLBACK_PERMIT_CONTRACT = 'LEETPLUS_COMPOSE_EXACT_TARGET_CONTROL_HANDOFF_V1_ROLLBACK_PERMIT'
EXACT_TARGET_ROLLBACK_ACTION = 'CONTROL_HANDOFF_EXACT_TARGET_ROLLBACK'
STATE = Path('/var/lib/leetplus-compose')
ROOT = Path('/srv/leetplus')
CONTROLS = Path('/usr/local/lib/leetplus-compose')
CORE = Path('/usr/local/sbin/leetplus-compose')
UNIT = Path('/etc/systemd/system/leetplus-compose-network-refresh.service')
HANDOFFS = STATE / 'control-handoffs'
POINTER = HANDOFFS / 'active.json'
PENDING = STATE / 'control-handoff.pending.json'
TIMERS = ('leetplus-compose-bonus.timer', 'leetplus-compose-daily.timer')
CONTAINERS = ('leetplus-api-blue', 'leetplus-web-blue', 'leetplus-api-green', 'leetplus-web-green', 'leetplus-postgres', 'leetplus-redis')
COMPATIBLE = ('contract.mjs', 'orchestrator.mjs', 'worker-authority.mjs', 'runtime-entry.cjs', 'network.sh', 'backup.sh', 'postgres-entry.sh')
# Variant A adds a bounded preparation-evidence expiry guard to the native
# five-phase engine. This is the only reviewed orchestrator byte transition
# allowed through a controller-only handoff from the serving 02acca release.
# It cannot adopt an arbitrary later engine, runner, or control entrypoint.
VARIANT_A_PREDECESSOR_SHA = '02acca249783cf47c0a24897203d51a206e1c5b2'
VARIANT_A_PREDECESSOR_MANIFEST_SHA256 = '5ee7133885692b4c6e86ab680b4040770c985cee4c3381fb372302041232fcad'
VARIANT_A_OLD_CONTROL_SHA256 = '136d7c01613af7c874c3652534cc1262ff43ed8598c8454c87e78923a8a11512'
VARIANT_A_OLD_ORCHESTRATOR_SHA256 = 'c6fd054d39175266ac0603759423f4fe039294c2a42b03f0b8bd12a8f280aa58'
VARIANT_A_NEW_ORCHESTRATOR_SHA256 = 'c4d13a76d1f97f41dc575d37c5da588b9ba3634b1a053f6b194a86623e8861c4'
VARIANT_A_NEW_CONTROL_SHA256 = '4e39b9e8a75ede6bc474fe0ef8b0b5fea60b46edd7c1ed8172744288625ea49f'
VARIANT_A_NEW_RUNNER_SHA256 = '9b02c697d6995b0ff9d4cc085d1249d6e83d96d0cb2848a1e6a139acf3f1eb29'
VARIANT_A_TRANSITION = {
    'contract': 'LEETPLUS_VARIANT_A_ORCHESTRATOR_HANDOFF_V1',
    'oldOrchestratorSha256': VARIANT_A_OLD_ORCHESTRATOR_SHA256,
    'newOrchestratorSha256': VARIANT_A_NEW_ORCHESTRATOR_SHA256,
    'newControlEntrySha256': VARIANT_A_NEW_CONTROL_SHA256,
    'newPreparationRunnerSha256': VARIANT_A_NEW_RUNNER_SHA256,
}
# Second reviewed transition: serving Variant A controller -> the bounded
# application-pilot repair. The target release/manifest remain plan-bound;
# every changed privileged/runtime leaf is pinned here after independent review.
VARIANT_A_REPAIR_PREDECESSOR_SHA = '88010292246249c94ba66ecbab64e4d51ad84d8c'
VARIANT_A_REPAIR_PREDECESSOR_MANIFEST_SHA256 = '237cbcba1fbfcc9e58e78aede7b57f599b206f8c02253c43006dd308c04e9c85'
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
VARIANT_A_REPAIR_TRANSITION_CONTRACT = 'LEETPLUS_VARIANT_A_CONTROLLER_REPAIR_HANDOFF_V2'
CLEAN = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC'}
RESOURCE_PROFILE_BOOTSTRAP = 'RESOURCE_PROFILE_BOOTSTRAP'
RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_SHA = '892b25b9fe5ebc8d0c20a7874a77ac312b7a0978'
RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_CONTRACT_SHA256 = 'bba588a506cee3dc6c03a0b93f25291a4dd5f36c1d05fb79d83128bf0276f79d'
RESOURCE_PROFILE_BOOTSTRAP_LEGACY = 'LEGACY_4G'
RESOURCE_PROFILE_BOOTSTRAP_TARGET = 'API_6G_V1'
EXACT_TARGET_CRITICAL_LEAVES = ('control.sh', 'control.mjs', 'orchestrator.mjs', 'contract.mjs', 'network-fence.py', 'control_handoff.py', 'control-handoff-authority.mjs', 'exact-target-handoff-authority.mjs', 'install-control.py', 'preparation-runner.mjs', 'release-observer.mjs', 'sign-approval.py')


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def canonical_digest(value):
    return digest(canonical(value))


def exact_target_permit(envelope, plan, old, new, active_sha, now=None, allow_expired=False):
    """Validate the external B permit without importing target controller code."""
    require(isinstance(envelope, dict) and set(envelope) == {'permit', 'signature'}, 'Exact-target permit envelope fields are invalid')
    permit, signature = envelope['permit'], envelope['signature']
    fields = {'contract', 'operationId', 'action', 'hostIdentitySha256', 'planSha256', 'activeSha256', 'predecessor', 'target', 'issuedAt', 'expiresAt'}
    require(isinstance(permit, dict) and set(permit) == fields and isinstance(signature, str) and re.fullmatch(r'[A-Za-z0-9+/]{86}==', signature), 'Exact-target permit is malformed')
    require(permit['contract'] == EXACT_TARGET_PERMIT_CONTRACT and permit['action'] == EXACT_TARGET_ACTION and re.fullmatch('[a-f0-9-]{36}', permit['operationId']), 'Exact-target permit identity is invalid')
    require(permit['hostIdentitySha256'] == digest(secure(Path('/etc/machine-id')).strip()) and permit['activeSha256'] == active_sha and permit['planSha256'] == canonical_digest(plan), 'Exact-target permit host/snapshot/plan binding drift')
    predecessor, target = permit['predecessor'], permit['target']
    require(isinstance(predecessor, dict) and set(predecessor) == {'releaseSha', 'manifestSha256', 'verifierSha256'}, 'Exact-target predecessor binding is invalid')
    require(predecessor == {'releaseSha': old['manifest']['releaseSha'], 'manifestSha256': old['digest'], 'verifierSha256': old['manifest']['files'].get('control_handoff.py')}, 'Exact-target predecessor identity drift')
    require(isinstance(target, dict) and set(target) == {'releaseSha', 'manifestSha256', 'admissionSha256', 'controlArchiveSha256', 'filesSha256', 'criticalFilesSha256'}, 'Exact-target target binding is invalid')
    critical = {leaf: new['manifest']['files'].get(leaf) for leaf in EXACT_TARGET_CRITICAL_LEAVES}
    require(all(re.fullmatch('[a-f0-9]{64}', value or '') for value in critical.values()), 'Exact-target controller lacks a required critical leaf')
    require(target == {'releaseSha': new['manifest']['releaseSha'], 'manifestSha256': new['digest'], 'admissionSha256': new['manifest']['admissionSha256'], 'controlArchiveSha256': digest(new['archive']), 'filesSha256': canonical_digest(new['manifest']['files']), 'criticalFilesSha256': canonical_digest(critical)}, 'Exact-target target identity drift')
    issued, expires = (datetime.datetime.fromisoformat(permit[key].replace('Z', '+00:00')) for key in ('issuedAt', 'expiresAt'))
    current = now or datetime.datetime.now(datetime.timezone.utc)
    require(issued.tzinfo and expires.tzinfo and issued <= current and
            (allow_expired or current <= expires) and
            expires - issued <= datetime.timedelta(hours=4), 'Exact-target permit is expired or unbounded')
    script = "import fs from 'node:fs';import {validateExactTargetPermit} from '" + (old['root'] / 'exact-target-handoff-authority.mjs').as_uri() + "';const v=JSON.parse(fs.readFileSync(0,'utf8'));validateExactTargetPermit(v.envelope,v.publicKey,v.expected,{allowExpired:v.allowExpired});"
    value = {'envelope': envelope, 'publicKey': secure(Path('/etc/leetplus-compose/approval-root.pem')).decode(),
             'expected': {key: permit[key] for key in ('operationId', 'action', 'hostIdentitySha256', 'planSha256', 'activeSha256', 'predecessor', 'target')},
             'allowExpired': allow_expired}
    require(run(['/usr/bin/node', '--input-type=module', '-e', script], canonical(value)) == b'', 'Exact-target permit signature rejected')
    return permit


def exact_target_rollback_permit(envelope, plan, receipt, old, new, active_sha, allow_expired=False):
    require(isinstance(envelope, dict) and set(envelope) == {'permit', 'signature'}, 'Exact-target rollback envelope fields are invalid')
    permit = envelope['permit']
    fields = {'contract', 'operationId', 'action', 'hostIdentitySha256', 'planSha256', 'receiptSha256', 'activeSha256', 'predecessor', 'target', 'issuedAt', 'expiresAt'}
    require(isinstance(permit, dict) and set(permit) == fields and permit['contract'] == EXACT_TARGET_ROLLBACK_PERMIT_CONTRACT and permit['action'] == EXACT_TARGET_ROLLBACK_ACTION, 'Exact-target rollback permit is malformed')
    require(permit['operationId'] == plan['operationId'] and permit['hostIdentitySha256'] == plan['hostIdentitySha256'] and permit['planSha256'] == canonical_digest(plan) and permit['receiptSha256'] == canonical_digest(receipt) and permit['activeSha256'] == active_sha and permit['predecessor'] == plan['predecessor'] and permit['target'] == plan['target'], 'Exact-target rollback permit binding drift')
    issued, expires = (datetime.datetime.fromisoformat(permit[key].replace('Z', '+00:00')) for key in ('issuedAt', 'expiresAt'))
    current = datetime.datetime.now(datetime.timezone.utc)
    require(issued.tzinfo and expires.tzinfo and issued <= current and
            (allow_expired or current <= expires) and
            expires - issued <= datetime.timedelta(hours=4), 'Exact-target rollback permit is expired or unbounded')
    script = "import fs from 'node:fs';import {validateExactTargetRollbackPermit} from '" + (old['root'] / 'exact-target-handoff-authority.mjs').as_uri() + "';const v=JSON.parse(fs.readFileSync(0,'utf8'));validateExactTargetRollbackPermit(v.envelope,v.publicKey,v.expected,{allowExpired:v.allowExpired});"
    value = {'envelope': envelope, 'publicKey': secure(Path('/etc/leetplus-compose/approval-root.pem')).decode(),
             'expected': {key: permit[key] for key in ('operationId', 'action', 'hostIdentitySha256', 'planSha256', 'receiptSha256', 'activeSha256', 'predecessor', 'target')},
             'allowExpired': allow_expired}
    require(run(['/usr/bin/node', '--input-type=module', '-e', script], canonical(value)) == b'', 'Exact-target rollback permit signature rejected')
    return permit


def secure(path, limit=2 * 1024 * 1024):
    path = Path(path)
    require(path.is_absolute(), 'Absolute trusted file required')
    for parent in path.parents:
        info = parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and not parent.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022, 'Untrusted ancestor')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and not info.st_mode & 0o022 and info.st_size <= limit, 'Untrusted file')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            return stream.read(limit + 1)
    finally:
        os.close(fd)


def read_json(path):
    return json.loads(secure(path))


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def private_dir(path):
    if not path.exists():
        path.mkdir(mode=0o700)
        sync_dir(path.parent)
    info = path.lstat()
    require(path.is_dir() and not path.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o077, 'Private state directory required')


def atomic_bytes(path, value, mode=0o400, expected=None):
    exists = path.exists() or path.is_symlink()
    if exists:
        current = secure(path, 16 * 1024 * 1024)
        if current == value:
            return
        require(expected is not None and digest(current) == expected, 'Publication/preimage mismatch')
    else:
        require(expected is None, 'Expected existing file disappeared')
    temporary = path.with_name(path.name + '.next-' + str(uuid.uuid4()))
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        os.fchmod(stream.fileno(), mode)
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    sync_dir(path.parent)


def publish(path, value):
    atomic_bytes(path, canonical(value))


def run(args, data=None, timeout=25):
    child = subprocess.Popen(args, stdin=subprocess.PIPE if data is not None else subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=CLEAN, start_new_session=True)
    try:
        stdout, _ = child.communicate(data, timeout=timeout)
    except subprocess.TimeoutExpired:
        # No late ipset/systemctl descendant may outlive the exclusive window.
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.communicate(timeout=5)
        raise RuntimeError(Path(args[0]).name + ' timed out; the private child process group was terminated') from None
    require(child.returncode == 0, Path(args[0]).name + ' failed; no raw credentials/output are logged')
    return stdout.strip()


@contextlib.contextmanager
def control_lock(exclusive, seconds=120):
    import fcntl
    fd = os.open(STATE / 'control.lock', os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and not info.st_mode & 0o077, 'Untrusted existing control lock')
        deadline = time.monotonic() + seconds
        while True:
            try:
                fcntl.flock(fd, (fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH) | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                require(time.monotonic() < deadline, 'Existing worker did not drain before the bounded handoff deadline')
                time.sleep(1)
        yield
    finally:
        os.close(fd)


def installed(sha, executor=False):
    require(re.fullmatch('[a-f0-9]{40}', sha), 'Exact controller SHA required')
    root = CONTROLS / sha
    raw = secure(root / 'install-manifest.json')
    manifest = json.loads(raw)
    require(raw == canonical(manifest) and manifest['contract'] == 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL' and manifest['releaseSha'] == sha, 'Installed manifest identity mismatch')
    required = {'control.sh', 'control.mjs', 'orchestrator.mjs', 'contract.mjs', 'network-fence.py'}
    if executor:
        required |= {'control_handoff.py', 'control-handoff.sh', 'control-handoff-authority.mjs', 'control-handoff-runtime.mjs', 'control-locks.mjs', 'network_observation.py'}
    require(isinstance(manifest.get('files'), dict) and required <= set(manifest['files']), 'Required control executor is not attested')
    for leaf, expected in manifest['files'].items():
        require(re.fullmatch('[a-zA-Z0-9_.@-]+', leaf) and leaf not in ('.', '..') and re.fullmatch('[a-f0-9]{64}', expected) and digest(secure(root / leaf)) == expected, 'Installed file drift')
    admission_raw = secure(ROOT / 'inbox' / sha / 'docker-admission.json')
    admission = json.loads(admission_raw)
    require(digest(admission_raw) == manifest['admissionSha256'] and admission['contract'] == 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION' and admission['decision'] == 'PASS' and admission['releaseSha'] == sha and admission['repository'] == 'boozik3412/leetplus' and admission['ref'] == 'refs/heads/main' and admission['event'] == 'push', 'Controller is not exact-main admitted')
    release_raw = secure(ROOT / 'inbox' / sha / 'release.json')
    release = json.loads(release_raw)
    require(digest(release_raw) == admission['releaseManifestSha256'] and release['releaseSha'] == sha, 'Release manifest is not bound to admission')
    archive = secure(ROOT / 'inbox' / sha / 'control.tar.gz', 16 * 1024 * 1024)
    require(digest(archive) == admission['controlArchiveSha256'], 'Controller archive changed')
    archived = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as source:
        for member in source:
            if member.isdir() and member.name.rstrip('/') in ('deploy', 'deploy/leetplus-compose'):
                continue
            prefix = 'deploy/leetplus-compose/'
            require(member.isfile() and member.name.startswith(prefix) and member.size <= 2 * 1024 * 1024, 'Invalid controller archive member')
            leaf = member.name[len(prefix):]
            require(re.fullmatch('[a-zA-Z0-9_.@-]+', leaf) and leaf not in archived and leaf not in ('.', '..', 'install-manifest.json'), 'Invalid controller archive leaf')
            archived[leaf] = digest(source.extractfile(member).read())
    require(archived == manifest['files'], 'Installed manifest is not the admitted archive')
    return {'root': root, 'manifest': manifest, 'digest': digest(raw), 'admission': admission, 'admissionRaw': admission_raw, 'archive': archive, 'release': release}


def main_target():
    require(CORE.is_symlink() and CORE.lstat().st_uid == 0, 'Main command must be an owned symlink')
    target = os.readlink(CORE)
    require(re.fullmatch(r'/usr/local/lib/leetplus-compose/[a-f0-9]{40}/control.sh', target), 'Noncanonical core target')
    return target


def switch_main(expected, target):
    current = main_target()
    if current == target:
        return
    require(current == expected, 'Main pointer CAS mismatch')
    temporary = CORE.with_name(CORE.name + '.handoff-' + str(uuid.uuid4()))
    temporary.symlink_to(target)
    os.replace(temporary, CORE)
    sync_dir(CORE.parent)


def systemd(unit):
    raw = run(['/usr/bin/systemctl', 'show', unit, '--property=LoadState,ActiveState,UnitFileState,FragmentPath,DropInPaths']).decode()
    values = dict(line.split('=', 1) for line in raw.splitlines() if '=' in line)
    require(values.get('LoadState') == 'loaded' and not values.get('DropInPaths'), 'Unit is missing or has unreviewed drop-ins')
    return values


def container_configuration_sha256(item):
    # Docker's Mounts is an unordered collection, unlike Env/Cmd/Binds arrays.
    # Normalize only its order, retaining every mount/config field in the hash.
    mounts = item['Mounts']
    require(isinstance(mounts, list), 'Invalid container mounts')
    destinations = set()
    for mount in mounts:
        require(isinstance(mount, dict), 'Invalid container mount')
        destination = mount.get('Destination')
        require(isinstance(destination, str) and destination.startswith('/') and
                not destination.startswith('//') and '\x00' not in destination and
                '..' not in destination.split('/') and str(PurePosixPath(destination)) == destination,
                'Invalid mount destination')
        require(destination not in destinations, 'Duplicate mount destination')
        destinations.add(destination)
    configuration = {'config': item['Config'], 'host': item['HostConfig'],
                     'mounts': sorted(mounts, key=lambda mount: mount['Destination'])}
    # Do not change canonical() used for existing signed plans and receipts.
    return digest((json.dumps(configuration, indent=2, ensure_ascii=False, sort_keys=True) + '\n').encode())


def snapshot(control):
    active_raw = secure(STATE / 'active.json')
    active = json.loads(active_raw)
    require(re.fullmatch('[a-f0-9-]{36}', active['operationId']), 'Invalid active operation')
    histories = []
    for directory in sorted((STATE / 'operations').iterdir()):
        require(directory.is_dir() and not directory.is_symlink() and re.fullmatch('[a-f0-9-]{36}', directory.name), 'Untrusted operation path')
        require((directory / 'final.json').exists() or (directory / 'rolled-back.json').exists(), 'Pending application operation forbids handoff')
        records = {}
        for index, phase in enumerate(('HYDRATE', 'BIND', 'SMOKE', 'CUTOVER', 'POSTCHECK'), 1):
            record = {kind: read_json(directory / f'{index}-{phase}.{kind}.json') for kind in ('intent', 'evidence', 'receipt') if (directory / f'{index}-{phase}.{kind}.json').exists()}
            if record:
                records[phase] = record
        histories.append({'plan': read_json(directory / 'plan.json'), 'approval': read_json(directory / 'approval.json'), 'records': records,
                          'final': read_json(directory / 'final.json') if (directory / 'final.json').exists() else None,
                          'rolledBack': read_json(directory / 'rolled-back.json') if (directory / 'rolled-back.json').exists() else None})
    script = "import fs from 'node:fs';import {validateAcceptedApplicationSnapshot} from '" + (control / 'control-handoff-runtime.mjs').as_uri() + "';console.log(JSON.stringify(validateAcceptedApplicationSnapshot(JSON.parse(fs.readFileSync(0,'utf8')))));"
    authority = json.loads(run(['/usr/bin/node', '--input-type=module', '-e', script], canonical({'histories': histories, 'active': active, 'publicKey': secure(Path('/etc/leetplus-compose/approval-root.pem')).decode()})))
    protected = [STATE / 'active.json', ROOT / 'compose.json', Path('/etc/leetplus-compose/providers.json'), Path('/etc/leetplus-compose/approval-root.pem'),
                 *(ROOT / 'secrets' / leaf for leaf in ('api-blue.json', 'api-green.json', 'db-ca.pem', 'bonus-ledger-worker.json', 'langame-daily-worker.json')),
                 *(STATE / 'worker-grants' / (name + '.json') for name in ('bonus-ledger-worker', 'langame-daily-worker')),
                 *(STATE / 'operations' / active['operationId'] / leaf for leaf in ('plan.json', 'approval.json', 'rolled-back.json' if active.get('outcome') == 'ROLLED_BACK' else 'final.json'))]
    containers = {}
    for name in CONTAINERS:
        item = json.loads(run(['/usr/bin/docker', 'inspect', name]))[0]
        require(item['State']['Running'] and item['State']['Pid'] > 0, 'Application/data must remain running')
        role = name.removeprefix('leetplus-')
        expected_image = active['dataRelease']['images'][role] if role in ('postgres', 'redis') else active[role.split('-')[1]]['images'][role.split('-')[0]]
        require(item['Image'] == expected_image, 'Running image differs from accepted release')
        containers[name] = {'id': item['Id'], 'image': item['Image'], 'pid': item['State']['Pid'], 'startedAt': item['State']['StartedAt'], 'restartCount': item['RestartCount'], 'configurationSha256': container_configuration_sha256(item)}
    nginx = Path('/etc/nginx/leetplus-compose/active.conf')
    require(nginx.is_symlink() and nginx.lstat().st_uid == 0, 'Untrusted nginx link')
    firewall = {chain: digest(run(['/usr/sbin/iptables', '-w', '5', '-S', chain])) for chain in ('LP_LEETPLUS_EGRESS_V2', 'LP_LEETPLUS_HOST_V2', 'DOCKER-USER', 'INPUT')}
    return {'activeSha256': digest(active_raw), 'active': active, 'activePlanControlSha256': authority['controlSha256'], 'files': {str(p): digest(secure(p)) for p in protected}, 'containers': containers, 'nginxTarget': os.readlink(nginx), 'firewall': firewall}


def assert_resource_profile_bootstrap_identity(old, new):
    require(old['manifest']['releaseSha'] == RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_SHA, 'Resource-profile bootstrap has the wrong predecessor controller')
    require(old['manifest']['files'].get('contract.mjs') == RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_CONTRACT_SHA256, 'Resource-profile bootstrap predecessor contract is not exact')
    require(new['release'].get('apiResourceProfile') == RESOURCE_PROFILE_BOOTSTRAP_TARGET, 'Target admitted release lacks the exact API resource profile')


def assert_legacy_active_releases(snapshot_value):
    active = snapshot_value.get('active') if isinstance(snapshot_value, dict) else None
    require(isinstance(active, dict), 'Accepted application snapshot is missing active releases')
    for name in ('blue', 'green', 'dataRelease'):
        release = active.get(name)
        require(isinstance(release, dict) and 'apiResourceProfile' not in release, 'Resource-profile bootstrap cannot adopt an already profiled active release')


def variant_a_orchestrator_transition(old, new):
    old_files, new_files = old['manifest']['files'], new['manifest']['files']
    if old_files.get('orchestrator.mjs') == new_files.get('orchestrator.mjs'):
        return None
    if (old['manifest']['releaseSha'] == VARIANT_A_PREDECESSOR_SHA and
            old['digest'] == VARIANT_A_PREDECESSOR_MANIFEST_SHA256 and
            old_files.get('control.mjs') == VARIANT_A_OLD_CONTROL_SHA256 and
            old_files.get('orchestrator.mjs') == VARIANT_A_OLD_ORCHESTRATOR_SHA256 and
            new_files.get('orchestrator.mjs') == VARIANT_A_NEW_ORCHESTRATOR_SHA256 and
            new_files.get('control.mjs') == VARIANT_A_NEW_CONTROL_SHA256 and
            new_files.get('preparation-runner.mjs') == VARIANT_A_NEW_RUNNER_SHA256):
        return {**VARIANT_A_TRANSITION,
                'oldReleaseSha': old['manifest']['releaseSha'],
                'newReleaseSha': new['manifest']['releaseSha'],
                'oldControlSha256': old['digest'],
                'newControlSha256': new['digest']}
    if (old['manifest']['releaseSha'] == VARIANT_A_REPAIR_PREDECESSOR_SHA and
            old['digest'] == VARIANT_A_REPAIR_PREDECESSOR_MANIFEST_SHA256 and
            all(old_files.get(leaf) == expected for leaf, expected in VARIANT_A_REPAIR_OLD_FILES.items()) and
            all(new_files.get(leaf) == expected for leaf, expected in VARIANT_A_REPAIR_NEW_FILES.items())):
        return {'contract': VARIANT_A_REPAIR_TRANSITION_CONTRACT,
                'oldReleaseSha': old['manifest']['releaseSha'],
                'newReleaseSha': new['manifest']['releaseSha'],
                'oldControlSha256': old['digest'],
                'newControlSha256': new['digest'],
                'oldRuntimeFilesSha256': dict(VARIANT_A_REPAIR_OLD_FILES),
                'newRuntimeFilesSha256': dict(VARIANT_A_REPAIR_NEW_FILES)}
    require(False, 'Unreviewed orchestrator transition cannot use controller-only handoff')


def assert_runtime_contract_compatible(old, new, resource_profile_bootstrap=False):
    transition = variant_a_orchestrator_transition(old, new)
    require(not (resource_profile_bootstrap and transition), 'Resource-profile bootstrap cannot also change the orchestrator')
    for leaf in COMPATIBLE:
        if resource_profile_bootstrap and leaf == 'contract.mjs':
            continue
        if leaf == 'orchestrator.mjs' and transition:
            continue
        if leaf == 'worker-authority.mjs' and transition and transition.get('contract') == VARIANT_A_REPAIR_TRANSITION_CONTRACT:
            continue
        require(old['manifest']['files'][leaf] == new['manifest']['files'][leaf], 'Runtime/worker contract change is not a controller-only handoff: ' + leaf)
    return transition


def assert_compatible(old, new, resource_profile_bootstrap=False):
    if resource_profile_bootstrap:
        assert_resource_profile_bootstrap_identity(old, new)
    assert_runtime_contract_compatible(old, new, resource_profile_bootstrap)
    for leaf, expected in old['manifest']['files'].items():
        if leaf.startswith('leetplus-compose-') and leaf.endswith(('.service', '.timer')) and leaf != UNIT.name:
            require(new['manifest']['files'].get(leaf) == expected, 'Other unit changes require a separate rollout')
            require(digest(secure(Path('/etc/systemd/system') / leaf)) == expected, 'Installed unit differs from the predecessor')
    for command, leaf in [('leetplus-compose-network', 'network.sh'), ('leetplus-compose-backup', 'backup.sh')]:
        link = CORE.with_name(command)
        require(link.is_symlink() and link.lstat().st_uid == 0, 'Delegating command is not trusted')
        delegate = link.resolve()
        require(re.fullmatch(r'/usr/local/lib/leetplus-compose/[a-f0-9]{40}/' + re.escape(leaf), str(delegate)), 'Delegating command escaped installed roots')
        require(digest(secure(delegate)) == new['manifest']['files'][leaf], 'Delegating command changed')
    retry_lines = {b'StartLimitIntervalSec=10min', b'StartLimitBurst=5', b'TimeoutStartSec=90s', b'Restart=on-failure', b'RestartSec=30s'}
    old_unit, new_unit = secure(old['root'] / UNIT.name), secure(new['root'] / UNIT.name)
    require([line for line in old_unit.splitlines() if line not in retry_lines] == [line for line in new_unit.splitlines() if line not in retry_lines], 'Refresh unit may change only the reviewed retry bounds')


def operation_path(identity):
    require(re.fullmatch('[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', identity), 'Exact operation UUID required')
    return HANDOFFS / identity


def prepare(old_sha, new_sha, admission_sha, evidence_path, resource_profile_bootstrap=False):
    old, new = installed(old_sha), installed(new_sha, executor=True)
    require(old_sha != new_sha and new['manifest']['admissionSha256'] == admission_sha, 'Wrong target admission')
    evidence_raw = secure(evidence_path)
    evidence = json.loads(evidence_raw)
    require(evidence_raw == canonical(evidence), 'Evidence must be canonical LF JSON')
    require(evidence.get('decision') == 'PASS' and evidence.get('releaseSha') == new_sha and re.fullmatch('[a-f0-9]{64}', evidence.get('backupSha256', '')) and re.fullmatch('[a-f0-9]{64}', evidence.get('rehearsalSha256', '')), 'Exact backup/rehearsal evidence required')
    with control_lock(False, 20):
        assert_compatible(old, new, resource_profile_bootstrap)
        require(main_target() == str(old['root'] / 'control.sh'), 'Predecessor is not serving')
        require(not PENDING.exists(), 'Another handoff is pending')
        # snapshot invokes the target renderer's immutable-history validator. A
        # bootstrap therefore proves every historical compose digest still
        # renders as legacy 4 GiB; the plan boolean below is only an audit fact.
        current = snapshot(new['root'])
        if resource_profile_bootstrap:
            assert_legacy_active_releases(current)
        verify_current_controller_authority(current, old, new['root'])
        require(digest(secure(UNIT)) == old['manifest']['files'][UNIT.name], 'Original refresh unit drift')
        timers = {unit: systemd(unit) for unit in TIMERS}
        require(all(v['ActiveState'] in ('active', 'inactive') and v['UnitFileState'] in ('enabled', 'disabled') for v in timers.values()), 'Ambiguous timer state')
        private_dir(HANDOFFS)
        identity = str(uuid.uuid4())
        directory = operation_path(identity)
        private_dir(directory)
        plan = {'contract': CONTRACT + '_PLAN', 'operationId': identity, 'action': RESOURCE_PROFILE_BOOTSTRAP if resource_profile_bootstrap else 'CONTROL_HANDOFF', 'hostIdentitySha256': digest(secure(Path('/etc/machine-id')).strip()),
                'oldReleaseSha': old_sha, 'newReleaseSha': new_sha, 'oldControlSha256': old['digest'], 'newControlSha256': new['digest'],
                'oldMainTarget': str(old['root'] / 'control.sh'), 'newMainTarget': str(new['root'] / 'control.sh'), 'snapshot': current, 'timers': timers,
                'oldUnitSha256': digest(secure(UNIT)), 'oldUnitMode': stat.S_IMODE(UNIT.stat().st_mode), 'newUnitSha256': new['manifest']['files'][UNIT.name],
                'previousPointer': base64.b64encode(secure(POINTER)).decode() if POINTER.exists() else None, 'evidenceSha256': digest(evidence_raw),
                'refreshScope': {'operation': 'refresh', 'setNames': ['lp_leetplus_https', 'lp_leetplus_smtp'], 'ttlSeconds': 3600, 'publicAddressesOnly': True, 'policySha256': current['files']['/etc/leetplus-compose/providers.json']},
                'applicationRestartAllowed': False, 'timersMayBeStopped': False, 'rollbackAllowed': True, 'maxLockWaitSeconds': 120}
        transition = variant_a_orchestrator_transition(old, new)
        if transition:
            plan['orchestratorTransition'] = transition
        if resource_profile_bootstrap:
            plan.update({'predecessorControlSha': RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_SHA,
                         'predecessorContractSha256': RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_CONTRACT_SHA256,
                         'legacyProfile': RESOURCE_PROFILE_BOOTSTRAP_LEGACY,
                         'targetProfile': RESOURCE_PROFILE_BOOTSTRAP_TARGET,
                         'historicalComposeIdentityVerified': True,
                         'resourceLimitMutationAllowed': False})
        for name, value in [('plan.json', plan), ('evidence.json', evidence)]:
            publish(directory / name, value)
        # Existing encrypted backup includes this state subtree, so recovery of
        # a controller-only release does not depend on deploying its app images.
        for prefix, value in [('old', old), ('new', new)]:
            atomic_bytes(directory / (prefix + '-control.tar.gz'), value['archive'])
            atomic_bytes(directory / (prefix + '-admission.json'), value['admissionRaw'])
            atomic_bytes(directory / (prefix + '-install-manifest.json'), canonical(value['manifest']))
        return {'decision': 'PREPARED_NOT_AUTHORIZATION', 'operationId': identity, 'planSha256': digest(canonical(plan)), 'planPath': str(directory / 'plan.json')}


def assert_exact_target_bridge_scope(old, target):
    """Only the separately signed orchestrator successor may cross the bridge."""
    require(old['manifest']['releaseSha'] != target['manifest']['releaseSha'], 'Exact target must differ from predecessor')
    require(re.fullmatch('[a-f0-9]{64}', old['manifest']['files'].get('exact-target-handoff-authority.mjs', '')), 'Bridge predecessor lacks exact-target permit verifier')
    critical = {leaf: target['manifest']['files'].get(leaf) for leaf in EXACT_TARGET_CRITICAL_LEAVES}
    require(all(re.fullmatch('[a-f0-9]{64}', value or '') for value in critical.values()), 'Target lacks an exact critical controller leaf')
    for leaf in COMPATIBLE:
        if leaf != 'orchestrator.mjs':
            require(old['manifest']['files'].get(leaf) == target['manifest']['files'].get(leaf), 'Exact-target bridge rejects runtime/worker contract drift: ' + leaf)
    require(old['manifest']['files'].get('control.sh') == target['manifest']['files'].get('control.sh'), 'Exact-target bridge cannot change the launcher')
    for leaf, expected in old['manifest']['files'].items():
        if leaf.startswith('leetplus-compose-') and leaf.endswith(('.service', '.timer')):
            require(target['manifest']['files'].get(leaf) == expected, 'Exact-target bridge cannot change a systemd unit: ' + leaf)
    return critical


def validate_exact_target_plan_bindings(plan, old, target):
    fields = {'contract', 'operationId', 'action', 'hostIdentitySha256',
              'oldReleaseSha', 'newReleaseSha', 'oldControlSha256', 'newControlSha256',
              'oldMainTarget', 'newMainTarget', 'snapshot', 'timers',
              'oldUnitSha256', 'oldUnitMode', 'newUnitSha256', 'previousPointer',
              'evidenceSha256', 'target', 'predecessor', 'permitPath',
              'applicationRestartAllowed', 'timersMayBeStopped', 'rollbackAllowed',
              'maxLockWaitSeconds'}
    require(isinstance(plan, dict) and set(plan) == fields and
            plan['contract'] == 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V2_PLAN' and
            plan['action'] == EXACT_TARGET_ACTION and plan['permitPath'] == 'permit.json' and
            plan['applicationRestartAllowed'] is False and plan['timersMayBeStopped'] is False and
            plan['rollbackAllowed'] is True and plan['maxLockWaitSeconds'] == 120,
            'Invalid exact-target bridge plan scope')
    critical = assert_exact_target_bridge_scope(old, target)
    require(plan['oldReleaseSha'] == old['manifest']['releaseSha'] and
            plan['newReleaseSha'] == target['manifest']['releaseSha'] and
            plan['oldControlSha256'] == old['digest'] and
            plan['newControlSha256'] == target['digest'] and
            plan['oldMainTarget'] == str(old['root'] / 'control.sh') and
            plan['newMainTarget'] == str(target['root'] / 'control.sh') and
            plan['predecessor'] == {'releaseSha': plan['oldReleaseSha'],
                                    'manifestSha256': old['digest'],
                                    'verifierSha256': old['manifest']['files']['control_handoff.py']} and
            plan['target'] == {'releaseSha': plan['newReleaseSha'],
                                'manifestSha256': target['digest'],
                                'admissionSha256': target['manifest']['admissionSha256'],
                                'controlArchiveSha256': digest(target['archive']),
                                'filesSha256': canonical_digest(target['manifest']['files']),
                                'criticalFilesSha256': canonical_digest(critical)} and
            plan['oldUnitSha256'] == old['manifest']['files'][UNIT.name] and
            plan['newUnitSha256'] == target['manifest']['files'][UNIT.name] and
            plan['oldUnitSha256'] == plan['newUnitSha256'],
            'Exact-target bridge plan differs from admitted controller bytes')
    return plan


def bridge_prepare(old_sha, target_sha, evidence_path):
    """Predecessor-only plan for a B controller. Target bytes are inspected only."""
    old, target = installed(old_sha, executor=True), installed(target_sha)
    critical = assert_exact_target_bridge_scope(old, target)
    evidence_raw = secure(evidence_path); evidence = json.loads(evidence_raw)
    require(evidence_raw == canonical(evidence) and evidence.get('decision') == 'PASS' and evidence.get('releaseSha') == target_sha and re.fullmatch('[a-f0-9]{64}', evidence.get('backupSha256', '')) and re.fullmatch('[a-f0-9]{64}', evidence.get('rehearsalSha256', '')), 'Exact backup/rehearsal evidence required')
    with control_lock(False, 20):
        require(main_target() == str(old['root'] / 'control.sh') and not PENDING.exists(), 'Bridge predecessor is not exclusively serving')
        current = snapshot(old['root'])
        verify_current_controller_authority(current, old, old['root'])
        require(digest(secure(UNIT)) == old['manifest']['files'][UNIT.name], 'Original refresh unit drift')
        timers = {unit: systemd(unit) for unit in TIMERS}
        require(all(v['ActiveState'] in ('active', 'inactive') and v['UnitFileState'] in ('enabled', 'disabled') for v in timers.values()), 'Ambiguous timer state')
        private_dir(HANDOFFS); identity = str(uuid.uuid4()); directory = operation_path(identity); private_dir(directory)
        plan = {'contract': 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V2_PLAN', 'operationId': identity, 'action': EXACT_TARGET_ACTION,
                'hostIdentitySha256': digest(secure(Path('/etc/machine-id')).strip()),
                'oldReleaseSha': old_sha, 'newReleaseSha': target_sha, 'oldControlSha256': old['digest'], 'newControlSha256': target['digest'],
                'oldMainTarget': str(old['root'] / 'control.sh'), 'newMainTarget': str(target['root'] / 'control.sh'), 'snapshot': current, 'timers': timers,
                'oldUnitSha256': digest(secure(UNIT)), 'oldUnitMode': stat.S_IMODE(UNIT.stat().st_mode), 'newUnitSha256': target['manifest']['files'][UNIT.name],
                'previousPointer': base64.b64encode(secure(POINTER)).decode() if POINTER.exists() else None, 'evidenceSha256': digest(evidence_raw),
                'target': {'releaseSha': target_sha, 'manifestSha256': target['digest'], 'admissionSha256': target['manifest']['admissionSha256'], 'controlArchiveSha256': digest(target['archive']), 'filesSha256': canonical_digest(target['manifest']['files']), 'criticalFilesSha256': canonical_digest(critical)},
                'predecessor': {'releaseSha': old_sha, 'manifestSha256': old['digest'], 'verifierSha256': old['manifest']['files']['control_handoff.py']}, 'permitPath': 'permit.json',
                'applicationRestartAllowed': False, 'timersMayBeStopped': False, 'rollbackAllowed': True, 'maxLockWaitSeconds': 120}
        for name, value in [('plan.json', plan), ('evidence.json', evidence)]: publish(directory / name, value)
        for prefix, value in [('old', old), ('new', target)]:
            atomic_bytes(directory / (prefix + '-control.tar.gz'), value['archive'])
            atomic_bytes(directory / (prefix + '-admission.json'), value['admissionRaw'])
            atomic_bytes(directory / (prefix + '-install-manifest.json'), canonical(value['manifest']))
        return {'decision': 'PREPARED_NOT_AUTHORIZATION', 'operationId': identity, 'planSha256': canonical_digest(plan), 'planPath': str(directory / 'plan.json')}


def bridge_activate(identity, permit_path):
    directory = operation_path(identity); plan = read_json(directory / 'plan.json')
    require(plan.get('operationId') == identity and plan.get('contract') == 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V2_PLAN' and plan.get('action') == EXACT_TARGET_ACTION and plan.get('permitPath') == 'permit.json', 'Invalid exact-target bridge operation')
    old, target = installed(plan['oldReleaseSha'], executor=True), installed(plan['newReleaseSha'])
    validate_exact_target_plan_bindings(plan, old, target)
    require(digest(secure(directory / 'evidence.json')) == plan['evidenceSha256'], 'Rehearsal evidence drift')
    receipt_path, intent_path, rollback_path, prepared_path = directory / 'receipt.json', directory / 'bridge-apply.intent.json', directory / 'rolled-back.json', directory / 'bridge-final-prepared.json'
    if rollback_path.exists():
        terminal = read_json(rollback_path)
        require(terminal.get('decision') == 'ROLLED_BACK' and
                terminal.get('operationId') == identity and
                terminal.get('planSha256') == canonical_digest(plan),
                'Exact-target rollback terminal drift')
        if receipt_path.exists():
            require(terminal.get('contract') == EXACT_TARGET_ROLLBACK_PERMIT_CONTRACT + '_RECEIPT' and
                    terminal.get('receiptSha256') == digest(secure(receipt_path)),
                    'Conflicting exact-target forward and rollback terminals')
        else:
            require(terminal.get('reason') in ('EXPIRED_BEFORE_ACCEPTANCE', 'BRIDGE_POSTCHECK_FAILED'),
                    'Unsigned exact-target rollback terminal')
        with control_lock(True, plan['maxLockWaitSeconds']):
            require(snapshot(old['root']) == plan['snapshot'] and
                    main_target() == plan['oldMainTarget'] and
                    digest(secure(UNIT)) == plan['oldUnitSha256'],
                    'Exact-target rollback terminal postimage drift')
            restore_pointer(plan); finish_pending(identity)
        return {'decision': 'ROLLBACK_CLEANUP_RECONCILED', 'operationId': identity,
                'historical': True, 'effectsPerformed': False}
    with control_lock(True, plan['maxLockWaitSeconds']):
        # The staged target is re-opened and re-hashed while the global lock is
        # held. A pre-plan archive observation alone is never effect authority.
        old, target = installed(plan['oldReleaseSha'], executor=True), installed(plan['newReleaseSha'])
        validate_exact_target_plan_bindings(plan, old, target)
        require(old['digest'] == plan['oldControlSha256'] and target['digest'] == plan['newControlSha256'] and
                target['manifest']['admissionSha256'] == plan['target']['admissionSha256'], 'Exact-target staged bytes drift before effect')
        current = snapshot(old['root'])
        require(current == plan['snapshot'], 'Bridge live snapshot drift')
        verify_timers(plan)
        if receipt_path.exists():
            receipt = read_json(receipt_path)
            expected_pointer = {'operationId': identity, 'receiptSha256': canonical_digest(receipt)}
            require(receipt.get('contract') == EXACT_TARGET_PERMIT_CONTRACT + '_RECEIPT' and receipt.get('decision') == 'PASS' and receipt.get('planSha256') == canonical_digest(plan) and main_target() == plan['newMainTarget'] and digest(secure(UNIT)) == plan['newUnitSha256'] and read_json(POINTER) == expected_pointer, 'Exact-target terminal postimage drift')
            finish_pending(identity)
            return {'decision': 'ACCEPTED_HANDOFF_RECONCILED', 'operationId': identity, 'applicationRestarted': False}
        main, unit = main_target(), digest(secure(UNIT))
        require(main in (plan['oldMainTarget'], plan['newMainTarget']) and unit in (plan['oldUnitSha256'], plan['newUnitSha256']), 'Bridge live effect state drift')
        if prepared_path.exists() and POINTER.exists():
            prepared = read_json(prepared_path)
            expected_pointer = {'operationId': identity, 'receiptSha256': canonical_digest(prepared)}
            if read_json(POINTER) == expected_pointer:
                require(main == plan['newMainTarget'] and unit == plan['newUnitSha256'] and intent_path.exists(),
                        'Committed exact-target pointer has an incomplete controller postimage')
                permit_file = directory / plan['permitPath']
                permit_raw = secure(permit_file); immutable_envelope = json.loads(permit_raw)
                require(permit_raw == canonical(immutable_envelope), 'Immutable exact-target permit drift')
                permit = exact_target_permit(immutable_envelope, plan, old, target,
                                             current['activeSha256'], allow_expired=True)
                binding = read_json(intent_path)
                require(prepared.get('contract') == EXACT_TARGET_PERMIT_CONTRACT + '_RECEIPT' and
                        prepared.get('decision') == 'PASS' and
                        prepared.get('operationId') == identity and
                        prepared.get('planSha256') == canonical_digest(plan) and
                        prepared.get('permitSha256') == digest(permit_raw) and
                        prepared.get('permitPath') == plan['permitPath'] and
                        prepared.get('authorizedAt') == binding.get('authorizedAt') and
                        datetime.datetime.fromisoformat(prepared['authorizedAt'].replace('Z', '+00:00')) >=
                        datetime.datetime.fromisoformat(permit['issuedAt'].replace('Z', '+00:00')) and
                        datetime.datetime.fromisoformat(prepared['acceptedAt'].replace('Z', '+00:00')) >=
                        datetime.datetime.fromisoformat(prepared['authorizedAt'].replace('Z', '+00:00')) and
                        datetime.datetime.fromisoformat(prepared['acceptedAt'].replace('Z', '+00:00')) <=
                        datetime.datetime.fromisoformat(permit['expiresAt'].replace('Z', '+00:00')),
                        'Frozen exact-target receipt is not timely signed authority')
                publish(receipt_path, prepared); finish_pending(identity)
                return {'decision': 'ACCEPTED_HANDOFF_RECONCILED', 'operationId': identity,
                        'applicationRestarted': False}
        if intent_path.exists() and (main == plan['newMainTarget'] or
                                     (directory / 'bridge-apply-unit.intent.json').exists() or
                                     (directory / 'bridge-apply-main.intent.json').exists()):
            require(prepared_path.exists(), 'Exact-target effect lacks its frozen terminal receipt')
        require(main == plan['oldMainTarget'] and unit == plan['oldUnitSha256'] or intent_path.exists(), 'Bridge live preimage drift')
        permit_raw = secure(permit_path); permit_envelope = json.loads(permit_raw)
        require(permit_raw == canonical(permit_envelope), 'Exact-target permit must be canonical LF JSON')
        permit_file = directory / plan['permitPath']; atomic_bytes(permit_file, permit_raw, 0o400)
        if intent_path.exists():
            binding = read_json(intent_path)
            require(binding.get('operationId') == identity and binding.get('planSha256') == canonical_digest(plan) and binding.get('permitSha256') == digest(secure(permit_file)) and binding.get('permitPath') == plan['permitPath'] and isinstance(binding.get('authorizedAt'), str), 'Exact-target forward intent drift')
        else:
            exact_target_permit(permit_envelope, plan, old, target, current['activeSha256'])
            binding = {'operationId': identity, 'planSha256': canonical_digest(plan),
                       'permitSha256': digest(permit_raw), 'permitPath': plan['permitPath'],
                       'authorizedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')}
            publish(intent_path, binding)
        immutable_envelope = json.loads(secure(permit_file))
        try:
            exact_target_permit(immutable_envelope, plan, old, target, current['activeSha256'])
        except ValueError:
            expires = datetime.datetime.fromisoformat(immutable_envelope.get('permit', {}).get('expiresAt', '').replace('Z', '+00:00'))
            require(expires.tzinfo and datetime.datetime.now(datetime.timezone.utc) > expires, 'Exact-target immutable permit is invalid before expiry')
            exact_target_permit(immutable_envelope, plan, old, target, current['activeSha256'], allow_expired=True)
            main, unit = main_target(), digest(secure(UNIT))
            require(main in (plan['oldMainTarget'], plan['newMainTarget']) and unit in (plan['oldUnitSha256'], plan['newUnitSha256']), 'Exact-target expiry recovery preimage drift')
            if main == plan['newMainTarget']: switch_main(plan['newMainTarget'], plan['oldMainTarget'])
            if unit == plan['newUnitSha256']: atomic_bytes(UNIT, secure(old['root'] / UNIT.name), plan['oldUnitMode'], plan['newUnitSha256'])
            run(['/usr/bin/systemctl', 'daemon-reload']); restore_pointer(plan)
            require(snapshot(old['root']) == plan['snapshot'] and main_target() == plan['oldMainTarget'] and digest(secure(UNIT)) == plan['oldUnitSha256'], 'Exact-target expiry undo drift')
            publish(rollback_path, {**binding, 'decision': 'ROLLED_BACK', 'reason': 'EXPIRED_BEFORE_ACCEPTANCE'}); finish_pending(identity)
            return {'decision': 'ROLLED_BACK', 'reason': 'EXPIRED_BEFORE_ACCEPTANCE', 'operationId': identity, 'applicationRestarted': False}
        atomic_bytes(PENDING, canonical({'operationId': identity}), 0o600)
        try:
            if prepared_path.exists():
                receipt = read_json(prepared_path)
                require(receipt.get('contract') == EXACT_TARGET_PERMIT_CONTRACT + '_RECEIPT' and receipt.get('planSha256') == canonical_digest(plan) and receipt.get('permitSha256') == binding['permitSha256'], 'Exact-target prepared receipt drift')
            else:
                receipt = {**binding, 'contract': EXACT_TARGET_PERMIT_CONTRACT + '_RECEIPT', 'decision': 'PASS', 'acceptedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')}
                publish(prepared_path, receipt)
            phase_effect(directory, 'bridge-apply-unit', binding, lambda: digest(secure(UNIT)), plan['oldUnitSha256'], plan['newUnitSha256'], lambda: atomic_bytes(UNIT, secure(target['root'] / UNIT.name), plan['oldUnitMode'], plan['oldUnitSha256']))
            phase_effect(directory, 'bridge-apply-main', binding, main_target, plan['oldMainTarget'], plan['newMainTarget'], lambda: switch_main(plan['oldMainTarget'], plan['newMainTarget']))
            run(['/usr/bin/systemctl', 'daemon-reload'])
            require(snapshot(old['root']) == plan['snapshot'], 'Application/data state changed during exact-target bridge')
            verify_timers(plan)
            require(digest(secure(permit_file)) == binding['permitSha256'], 'Exact-target immutable permit drift')
            next_pointer = canonical({'operationId': identity, 'receiptSha256': canonical_digest(receipt)})
            previous_pointer = base64.b64decode(plan['previousPointer'], validate=True) if plan['previousPointer'] is not None else None
            current_pointer = secure(POINTER) if POINTER.exists() else None
            require(current_pointer in (previous_pointer, next_pointer), 'Refuse foreign exact-target active pointer')
            atomic_bytes(POINTER, next_pointer, 0o600, digest(current_pointer) if current_pointer is not None else None)
            publish(directory / 'receipt.json', receipt); finish_pending(identity)
        except Exception:
            if (prepared_path.exists() and POINTER.exists() and
                    read_json(POINTER) == {'operationId': identity,
                                          'receiptSha256': canonical_digest(read_json(prepared_path))}):
                # Pointer publication is the commit boundary. A missing final
                # receipt is reconciled from frozen bytes, never auto-undone.
                raise
            if not receipt_path.exists() and (directory / 'bridge-apply-main.intent.json').exists() and main_target() == plan['newMainTarget']: switch_main(plan['newMainTarget'], plan['oldMainTarget'])
            if not receipt_path.exists() and (directory / 'bridge-apply-unit.intent.json').exists() and digest(secure(UNIT)) == plan['newUnitSha256']: atomic_bytes(UNIT, secure(old['root'] / UNIT.name), plan['oldUnitMode'], plan['newUnitSha256'])
            if not receipt_path.exists() and main_target() == plan['oldMainTarget'] and digest(secure(UNIT)) == plan['oldUnitSha256']:
                run(['/usr/bin/systemctl', 'daemon-reload']); restore_pointer(plan); publish(directory / 'rolled-back.json', {**binding, 'decision': 'ROLLED_BACK', 'reason': 'BRIDGE_POSTCHECK_FAILED'}); finish_pending(identity)
            raise
    return {'decision': 'EXACT_TARGET_CONTROL_HANDOFF_ACCEPTED', 'operationId': identity, 'controlReleaseSha': target['manifest']['releaseSha'], 'applicationRestarted': False, 'timersStopped': False}


def bridge_rollback(identity, permit_path):
    directory = operation_path(identity); plan = read_json(directory / 'plan.json')
    require(plan.get('contract') == 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V2_PLAN' and plan.get('action') == EXACT_TARGET_ACTION and plan.get('rollbackAllowed') is True, 'Exact-target bridge rollback is not allowed')
    old, target = installed(plan['oldReleaseSha'], executor=True), installed(plan['newReleaseSha'])
    validate_exact_target_plan_bindings(plan, old, target)
    receipt = read_json(directory / 'receipt.json')
    require(receipt.get('contract') == EXACT_TARGET_PERMIT_CONTRACT + '_RECEIPT' and receipt.get('decision') == 'PASS' and receipt.get('planSha256') == canonical_digest(plan), 'Exact-target forward receipt drift')
    rollback_receipt, rollback_intent = directory / 'rolled-back.json', directory / 'bridge-rollback.intent.json'
    if rollback_receipt.exists():
        terminal = read_json(rollback_receipt)
        require(terminal.get('decision') == 'ROLLED_BACK' and terminal.get('planSha256') == canonical_digest(plan), 'Exact-target rollback terminal drift')
        with control_lock(True, plan['maxLockWaitSeconds']):
            require(snapshot(old['root']) == plan['snapshot'] and main_target() == plan['oldMainTarget'] and digest(secure(UNIT)) == plan['oldUnitSha256'], 'Exact-target rollback terminal postimage drift')
            restore_pointer(plan); finish_pending(identity)
        return {'decision': 'ROLLBACK_CLEANUP_RECONCILED', 'operationId': identity, 'applicationRestarted': False}
    with control_lock(True, plan['maxLockWaitSeconds']):
        old, target = installed(plan['oldReleaseSha'], executor=True), installed(plan['newReleaseSha'])
        validate_exact_target_plan_bindings(plan, old, target)
        require(old['digest'] == plan['oldControlSha256'] and target['digest'] == plan['newControlSha256'], 'Exact-target staged bytes drift before rollback')
        current = snapshot(old['root'])
        require(current == plan['snapshot'], 'Exact-target rollback snapshot drift')
        main, unit = main_target(), digest(secure(UNIT))
        require(main in (plan['oldMainTarget'], plan['newMainTarget']) and unit in (plan['oldUnitSha256'], plan['newUnitSha256']), 'Exact-target rollback effect state drift')
        require((main == plan['newMainTarget'] and unit == plan['newUnitSha256']) or rollback_intent.exists(), 'Exact-target rollback preimage drift')
        verify_timers(plan)
        permit_file = directory / 'rollback-permit.json'
        if rollback_intent.exists():
            binding = read_json(rollback_intent)
            require(isinstance(binding, dict) and
                    set(binding) == {'operationId', 'planSha256', 'receiptSha256',
                                     'rollbackPermitSha256', 'rollbackPermitPath', 'authorizedAt'} and
                    binding['operationId'] == identity and
                    binding['planSha256'] == canonical_digest(plan) and
                    binding['receiptSha256'] == canonical_digest(receipt) and
                    binding['rollbackPermitPath'] == 'rollback-permit.json',
                    'Exact-target rollback intent drift')
            permit_raw = secure(permit_file)
            require(digest(permit_raw) == binding['rollbackPermitSha256'] and
                    secure(permit_path) == permit_raw,
                    'Rollback retry must use the original immutable permit')
            envelope = json.loads(permit_raw)
            require(permit_raw == canonical(envelope), 'Immutable rollback permit is not canonical')
            permit = exact_target_rollback_permit(envelope, plan, receipt, old, target,
                                                  current['activeSha256'], allow_expired=True)
            authorized_at = datetime.datetime.fromisoformat(binding['authorizedAt'].replace('Z', '+00:00'))
            issued_at = datetime.datetime.fromisoformat(permit['issuedAt'].replace('Z', '+00:00'))
            expires_at = datetime.datetime.fromisoformat(permit['expiresAt'].replace('Z', '+00:00'))
            require(issued_at <= authorized_at <= expires_at,
                    'Rollback intent was not authorized inside its original permit window')
        else:
            permit_raw = secure(permit_path); envelope = json.loads(permit_raw)
            require(permit_raw == canonical(envelope), 'Exact-target rollback permit must be canonical LF JSON')
            exact_target_rollback_permit(envelope, plan, receipt, old, target, current['activeSha256'])
            atomic_bytes(permit_file, permit_raw, 0o400)
            binding = {'operationId': identity, 'planSha256': canonical_digest(plan),
                       'receiptSha256': canonical_digest(receipt),
                       'rollbackPermitSha256': digest(permit_raw),
                       'rollbackPermitPath': 'rollback-permit.json',
                       'authorizedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')}
            publish(rollback_intent, binding)
        atomic_bytes(PENDING, canonical({'operationId': identity}), 0o600)
        try:
            phase_effect(directory, 'bridge-rollback-main', binding, main_target, plan['newMainTarget'], plan['oldMainTarget'], lambda: switch_main(plan['newMainTarget'], plan['oldMainTarget']))
            phase_effect(directory, 'bridge-rollback-unit', binding, lambda: digest(secure(UNIT)), plan['newUnitSha256'], plan['oldUnitSha256'], lambda: atomic_bytes(UNIT, secure(old['root'] / UNIT.name), plan['oldUnitMode'], plan['newUnitSha256']))
            run(['/usr/bin/systemctl', 'daemon-reload'])
            require(snapshot(old['root']) == plan['snapshot'], 'Application/data state changed during exact-target rollback')
            verify_timers(plan); require(digest(secure(permit_file)) == binding['rollbackPermitSha256'], 'Immutable rollback permit drift')
            restore_pointer(plan)
            publish(rollback_receipt, {**binding, 'contract': EXACT_TARGET_ROLLBACK_PERMIT_CONTRACT + '_RECEIPT', 'decision': 'ROLLED_BACK', 'acceptedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')})
            finish_pending(identity)
        except Exception:
            # Do not repeat a partially observed rollback on a later client retry.
            raise
    return {'decision': 'EXACT_TARGET_CONTROL_HANDOFF_ROLLED_BACK', 'operationId': identity, 'controlReleaseSha': old['manifest']['releaseSha'], 'applicationRestarted': False, 'timersStopped': False}


def validate_authority(plan, envelope, control, accepted_at=None, saved_receipt=None, historical=False):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    receipt = saved_receipt or {'contract': CONTRACT + '_RECEIPT', 'decision': 'PASS', 'operationId': plan['operationId'], 'planSha256': digest(canonical(plan)), 'approvalSha256': digest(canonical(envelope)), 'acceptedAt': accepted_at or now}
    pointer = {'operationId': plan['operationId'], 'receiptSha256': digest(canonical(receipt))}
    script = "import fs from 'node:fs';import {validateControlHandoffAuthority} from '" + (control / 'control-handoff-authority.mjs').as_uri() + "';const v=JSON.parse(fs.readFileSync(0,'utf8'));validateControlHandoffAuthority(v.bundle,v.publicKey,v.context);console.log('PASS');"
    value = {'bundle': {'plan': plan, 'approvalEnvelope': envelope, 'receipt': receipt, 'pointer': pointer}, 'publicKey': secure(Path('/etc/leetplus-compose/approval-root.pem')).decode(),
             'context': {'controlSha256': plan['newControlSha256'], 'hostIdentitySha256': digest(secure(Path('/etc/machine-id')).strip()), 'activeSha256': plan['snapshot']['activeSha256'] if historical else digest(secure(STATE / 'active.json'))}}
    require(run(['/usr/bin/node', '--input-type=module', '-e', script], canonical(value)) == b'PASS', 'Signed handoff authority rejected')
    return receipt, pointer


def verify_current_controller_authority(current, control, validator_root):
    if current['activePlanControlSha256'] == control['digest']:
        return
    pointer = read_json(POINTER)
    directory = operation_path(pointer['operationId'])
    plan = read_json(directory / 'plan.json')
    require(not (directory / 'rolled-back.json').exists(), 'Previous controller handoff was rolled back')
    receipt, expected_pointer = validate_authority(plan, read_json(directory / 'approval.json'), validator_root, saved_receipt=read_json(directory / 'receipt.json'))
    require(pointer == expected_pointer and plan['newControlSha256'] == control['digest'], 'Serving controller lacks accepted authority')


def validate_rollback(plan, receipt, envelope, control):
    script = "import fs from 'node:fs';import {validateControlRollbackApproval} from '" + (control / 'control-handoff-authority.mjs').as_uri() + "';const v=JSON.parse(fs.readFileSync(0,'utf8'));validateControlRollbackApproval(v.bundle,v.publicKey,v.context);console.log('PASS');"
    value = {'bundle': {'plan': plan, 'receipt': receipt, 'approvalEnvelope': envelope}, 'publicKey': secure(Path('/etc/leetplus-compose/approval-root.pem')).decode(),
             'context': {'controlSha256': plan['newControlSha256'], 'hostIdentitySha256': digest(secure(Path('/etc/machine-id')).strip()), 'activeSha256': digest(secure(STATE / 'active.json'))}}
    require(run(['/usr/bin/node', '--input-type=module', '-e', script], canonical(value)) == b'PASS', 'Separate receipt-bound rollback approval required')


def validate_recovery(plan, envelope, intent, control):
    # A timely immutable intent may authorize undo after expiry, never forward
    # activation or an invented/backdated accepted receipt.
    script = "import fs from 'node:fs';import {validateControlHandoffRecoveryAuthority} from '" + (control / 'control-handoff-authority.mjs').as_uri() + "';const v=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(validateControlHandoffRecoveryAuthority(v.bundle,v.publicKey,v.context)));"
    value = {'bundle': {'plan': plan, 'approvalEnvelope': envelope, 'intent': intent}, 'publicKey': secure(Path('/etc/leetplus-compose/approval-root.pem')).decode(),
             'context': {'controlSha256': plan['newControlSha256'], 'hostIdentitySha256': digest(secure(Path('/etc/machine-id')).strip()), 'activeSha256': digest(secure(STATE / 'active.json'))}}
    result = json.loads(run(['/usr/bin/node', '--input-type=module', '-e', script], canonical(value)))
    require(result.get('plan') == plan and isinstance(result.get('expired'), bool), 'Signed recovery authority rejected')
    return result


def phase_effect(directory, name, binding, current, before, after, effect):
    intent = directory / (name + '.intent.json')
    existed = intent.exists()
    if existed:
        require(read_json(intent) == binding, 'Effect intent binding drift')
    observed = current()
    require(observed == before or (existed and observed == after), 'Unaudited or foreign effect preimage')
    publish(intent, binding)
    if observed != after:
        effect()
    require(current() == after, 'Effect postcondition failed')
    publish(directory / (name + '.receipt.json'), binding)


def verify_timers(plan):
    require(set(plan['timers']) == set(TIMERS), 'Unexpected timer scope')
    for unit, original in plan['timers'].items():
        now = systemd(unit)
        require(now == original, 'Timer state/configuration changed outside this handoff')


def validate_plan_bindings(plan, old, new):
    action = plan.get('action')
    require(plan['contract'] == CONTRACT + '_PLAN' and action in ('CONTROL_HANDOFF', RESOURCE_PROFILE_BOOTSTRAP) and plan['applicationRestartAllowed'] is False and plan['timersMayBeStopped'] is False and plan['rollbackAllowed'] is True and plan['maxLockWaitSeconds'] == 120, 'Invalid handoff scope')
    resource_profile_bootstrap = action == RESOURCE_PROFILE_BOOTSTRAP
    profile_keys = {'predecessorControlSha', 'predecessorContractSha256', 'legacyProfile', 'targetProfile', 'historicalComposeIdentityVerified', 'resourceLimitMutationAllowed'}
    if resource_profile_bootstrap:
        require(plan['oldReleaseSha'] == RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_SHA and plan['oldReleaseSha'] != plan['newReleaseSha'], 'Resource-profile bootstrap release lineage is not exact')
        require({key: plan.get(key) for key in profile_keys} == {
            'predecessorControlSha': RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_SHA,
            'predecessorContractSha256': RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_CONTRACT_SHA256,
            'legacyProfile': RESOURCE_PROFILE_BOOTSTRAP_LEGACY,
            'targetProfile': RESOURCE_PROFILE_BOOTSTRAP_TARGET,
            'historicalComposeIdentityVerified': True,
            'resourceLimitMutationAllowed': False,
        }, 'Invalid resource-profile bootstrap scope')
    else:
        require(not (profile_keys & set(plan)), 'Ordinary controller handoff cannot carry a resource-profile transition')
    transition = variant_a_orchestrator_transition(old, new)
    require(plan.get('orchestratorTransition') == transition and (transition is not None or 'orchestratorTransition' not in plan),
            'Signed orchestrator transition does not match the installed controller bytes')
    require(old['digest'] == plan['oldControlSha256'] and new['digest'] == plan['newControlSha256'], 'Controller manifest drift')
    require(plan['oldMainTarget'] == str(old['root'] / 'control.sh') and plan['newMainTarget'] == str(new['root'] / 'control.sh'), 'Unexpected main-pointer target')
    require(plan['oldUnitSha256'] == old['manifest']['files'][UNIT.name] and plan['newUnitSha256'] == new['manifest']['files'][UNIT.name] and plan['oldUnitMode'] in (0o400, 0o600, 0o644), 'Unexpected unit effect')
    expected_scope = {'operation': 'refresh', 'setNames': ['lp_leetplus_https', 'lp_leetplus_smtp'], 'ttlSeconds': 3600, 'publicAddressesOnly': True, 'policySha256': plan['snapshot']['files']['/etc/leetplus-compose/providers.json']}
    require(plan['refreshScope'] == expected_scope, 'Unexpected provider refresh scope')
    assert_compatible(old, new, resource_profile_bootstrap)


def validate_live_profile_bootstrap(plan, snapshot_value):
    if plan.get('action') == RESOURCE_PROFILE_BOOTSTRAP:
        # Do not trust historicalComposeIdentityVerified: snapshot has just
        # revalidated all immutable terminal histories under the target renderer.
        assert_legacy_active_releases(snapshot_value)


def restore_pointer(plan):
    current = secure(POINTER) if POINTER.exists() else None
    previous = base64.b64decode(plan['previousPointer'], validate=True) if plan['previousPointer'] is not None else None
    if current is not None and current != previous:
        receipt_path = operation_path(plan['operationId']) / 'receipt.json'
        prepared_path = operation_path(plan['operationId']) / 'bridge-final-prepared.json'
        accepted = (receipt_path.exists() and
                    json.loads(current) == {'operationId': plan['operationId'],
                                            'receiptSha256': digest(secure(receipt_path))})
        prepared = (plan.get('contract') == 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V2_PLAN' and
                    prepared_path.exists() and
                    json.loads(current) == {'operationId': plan['operationId'],
                                            'receiptSha256': digest(secure(prepared_path))})
        require(accepted or prepared, 'Refuse to replace a foreign control pointer')
    if plan['previousPointer'] is not None:
        atomic_bytes(POINTER, previous, 0o600, digest(current) if current is not None else None)
    elif POINTER.exists():
        require(read_json(POINTER).get('operationId') == plan['operationId'], 'Refuse to remove a different control pointer')
        POINTER.unlink()
        sync_dir(POINTER.parent)


def finish_pending(identity):
    if PENDING.exists():
        require(read_json(PENDING).get('operationId') == identity, 'Foreign pending marker')
        PENDING.unlink()
        sync_dir(PENDING.parent)


def recover_expired_apply(directory, plan, envelope, old, new):
    binding = read_json(directory / 'apply.intent.json')
    require(validate_recovery(plan, envelope, binding, new['root'])['expired'], 'Expiry recovery is authority-decreasing only')
    require(not (directory / 'receipt.json').exists(), 'Accepted handoff requires separate rollback authority')
    if PENDING.exists():
        require(read_json(PENDING) == {'operationId': plan['operationId']}, 'Foreign pending marker')
    main, unit = main_target(), digest(secure(UNIT))
    require(main in (plan['oldMainTarget'], plan['newMainTarget']) and unit in (plan['oldUnitSha256'], plan['newUnitSha256']), 'Foreign expiry recovery preimage')
    for name, observed, before in [('main', main, plan['oldMainTarget']), ('unit', unit, plan['oldUnitSha256'])]:
        intent = directory / ('apply-' + name + '.intent.json')
        if intent.exists():
            require(read_json(intent) == binding, 'Expiry recovery effect intent drift')
        else:
            require(observed == before, 'Expiry recovery cannot adopt an unaudited effect')
    # These are exclusively this operation's control effects. A new app or a
    # changed worker/config snapshot must not be adopted as handoff continuity.
    effect_intended = any((directory / ('apply-' + name + '.intent.json')).exists() for name in ('main', 'unit'))
    if plan.get('action') == RESOURCE_PROFILE_BOOTSTRAP:
        current = snapshot(new['root'])
        validate_live_profile_bootstrap(plan, current)
        require(current == plan['snapshot'], 'Changed live state forbids resource-profile bootstrap expiry recovery')
    if effect_intended:
        current = snapshot(new['root'])
        validate_live_profile_bootstrap(plan, current)
        require(PENDING.exists() and current == plan['snapshot'], 'Changed live state forbids expiry undo')
        verify_timers(plan)
        if main == plan['newMainTarget']:
            switch_main(plan['newMainTarget'], plan['oldMainTarget'])
        if unit == plan['newUnitSha256']:
            atomic_bytes(UNIT, secure(old['root'] / UNIT.name), plan['oldUnitMode'], plan['newUnitSha256'])
        # Reconcile the loaded unit even if an earlier undo restored its file
        # but crashed before daemon-reload. No service is restarted.
        run(['/usr/bin/systemctl', 'daemon-reload'])
        current = snapshot(new['root'])
        validate_live_profile_bootstrap(plan, current)
        require(current == plan['snapshot'], 'Live state changed during expiry undo')
        verify_timers(plan)
    restore_pointer(plan)
    publish(directory / 'rolled-back.json', {**binding, 'decision': 'ROLLED_BACK', 'reason': 'EXPIRED_BEFORE_ACCEPTANCE', 'applicationRestartCommandIssued': False})
    finish_pending(plan['operationId'])
    return {'decision': 'ROLLED_BACK', 'reason': 'EXPIRED_BEFORE_ACCEPTANCE', 'operationId': plan['operationId'], 'applicationRestartCommandIssued': False, 'timersStopped': False}


def activate(identity, approval_path, rollback=False):
    directory = operation_path(identity)
    plan = read_json(directory / 'plan.json')
    require(plan['operationId'] == identity, 'Invalid handoff operation')
    old, new = installed(plan['oldReleaseSha']), installed(plan['newReleaseSha'], executor=True)
    validate_plan_bindings(plan, old, new)
    envelope = read_json(approval_path)
    require(digest(secure(directory / 'evidence.json')) == plan['evidenceSha256'], 'Rehearsal evidence drift')
    forward = read_json(directory / 'receipt.json') if (directory / 'receipt.json').exists() else None
    own_pending = PENDING.exists() and read_json(PENDING).get('operationId') == identity
    if forward:
        validate_authority(plan, read_json(directory / 'approval.json'), new['root'], saved_receipt=forward, historical=not own_pending)
    if (directory / 'rolled-back.json').exists():
        terminal = read_json(directory / 'rolled-back.json')
        require(terminal.get('decision') == 'ROLLED_BACK' and terminal.get('operationId') == identity and terminal.get('planSha256') == digest(canonical(plan)), 'Rollback terminal binding mismatch')
        if own_pending:
            with control_lock(True, plan['maxLockWaitSeconds']):
                current = snapshot(new['root'])
                validate_live_profile_bootstrap(plan, current)
                require(main_target() == plan['oldMainTarget'] and digest(secure(UNIT)) == plan['oldUnitSha256'] and current == plan['snapshot'], 'Completed rollback state changed before cleanup')
                finish_pending(identity)
            return {'decision': 'ROLLBACK_CLEANUP_RECONCILED', 'operationId': identity, 'applicationRestarted': False}
        return {'decision': 'ALREADY_ROLLED_BACK', 'operationId': identity, 'historical': True, 'effectsPerformed': False}
    if forward and not rollback and not own_pending:
        return {'decision': 'ALREADY_APPLIED', 'operationId': identity, 'historical': True, 'effectsPerformed': False}
    if rollback:
        require(forward is not None, 'No accepted handoff to roll back')
        validate_rollback(plan, forward, envelope, new['root'])
    elif not forward:
        prior_intent = directory / 'apply.intent.json'
        if prior_intent.exists():
            validate_recovery(plan, envelope, read_json(prior_intent), new['root'])
        else:
            validate_authority(plan, envelope, new['root'])

    # Wait without disabling timers or killing work. Nothing is published until
    # the actual exclusive lock is held. A busy worker/backup is a safe timeout.
    with control_lock(True, plan['maxLockWaitSeconds']):
        if not forward and not rollback and (directory / 'apply.intent.json').exists():
            if validate_recovery(plan, envelope, read_json(directory / 'apply.intent.json'), new['root'])['expired']:
                return recover_expired_apply(directory, plan, envelope, old, new)
        current = snapshot(new['root'])
        validate_live_profile_bootstrap(plan, current)
        require(current == plan['snapshot'], 'Live app/data/grant state changed')
        verify_timers(plan)
        if PENDING.exists():
            require(read_json(PENDING).get('operationId') == identity, 'Another handoff is pending')
        if forward and not rollback:
            require(main_target() == plan['newMainTarget'] and digest(secure(UNIT)) == plan['newUnitSha256'], 'Accepted effect cannot be silently changed')
            _, pointer = validate_authority(plan, read_json(directory / 'approval.json'), new['root'], saved_receipt=forward)
            atomic_bytes(POINTER, canonical(pointer), 0o600, digest(secure(POINTER)) if POINTER.exists() else None)
            finish_pending(identity)
            return {'decision': 'ACCEPTED_HANDOFF_RECONCILED', 'operationId': identity, 'applicationRestarted': False}
        action = 'rollback' if rollback else 'apply'
        intent = directory / (action + '.intent.json')
        binding_base = {'operationId': identity, 'planSha256': digest(canonical(plan)), 'approvalSha256': digest(canonical(envelope))}
        first_attempt = not intent.exists()
        binding = {**binding_base, 'authorizedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')} if first_attempt else read_json(intent)
        require(set(binding) == set(binding_base) | {'authorizedAt'} and all(binding.get(key) == value for key, value in binding_base.items()), 'Effect authority intent drift')
        authorization_time = datetime.datetime.fromisoformat(binding['authorizedAt'].replace('Z', '+00:00'))
        approval_start = datetime.datetime.fromisoformat(envelope['approval']['issuedAt'].replace('Z', '+00:00'))
        approval_end = datetime.datetime.fromisoformat(envelope['approval']['expiresAt'].replace('Z', '+00:00'))
        require(approval_start <= authorization_time <= approval_end and authorization_time <= datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=30), 'Effect intent was not authorized in time')
        before_main, after_main = (plan['newMainTarget'], plan['oldMainTarget']) if rollback else (plan['oldMainTarget'], plan['newMainTarget'])
        before_unit, after_unit = (plan['newUnitSha256'], plan['oldUnitSha256']) if rollback else (plan['oldUnitSha256'], plan['newUnitSha256'])
        if first_attempt:
            require(main_target() == before_main and digest(secure(UNIT)) == before_unit, 'First apply/rollback requires the exact unchanged preimage')
        else:
            require(read_json(intent) == binding, 'Unfinished effect authority drift')
            if not PENDING.exists():
                require(main_target() == before_main and digest(secure(UNIT)) == before_unit and
                        not any((directory / (action + '-' + phase + '.intent.json')).exists() for phase in ('unit', 'main')),
                        'Unfinished effect lacks its exact pending intent')
        if rollback:
            validate_rollback(plan, forward, envelope, new['root'])
        else:
            verify_current_controller_authority(plan['snapshot'], old, new['root'])
            validate_authority(plan, envelope, new['root'])
        publish(directory / ('rollback-approval.json' if rollback else 'approval.json'), envelope)
        publish(intent, binding)
        atomic_bytes(PENDING, canonical({'operationId': identity}), 0o600)
        target = old if rollback else new
        try:
            phase_effect(directory, action + '-unit', binding, lambda: digest(secure(UNIT)), before_unit, after_unit,
                         lambda: atomic_bytes(UNIT, secure(target['root'] / UNIT.name), plan['oldUnitMode'], before_unit))
            phase_effect(directory, action + '-main', binding, main_target, before_main, after_main, lambda: switch_main(before_main, after_main))
            run(['/usr/bin/systemctl', 'daemon-reload'])
            if not rollback:
                run(['/usr/bin/python3', str(new['root'] / 'network-fence.py'), 'refresh'], timeout=90)
            current = snapshot(new['root'])
            validate_live_profile_bootstrap(plan, current)
            require(current == plan['snapshot'], 'Application/data/firewall changed during controller switch')
            verify_timers(plan)
            if rollback:
                restore_pointer(plan)
                publish(directory / 'rolled-back.json', {**binding, 'decision': 'ROLLED_BACK', 'applicationRestarted': False})
            else:
                receipt, pointer = validate_authority(plan, envelope, new['root'])
                publish(directory / 'receipt.json', receipt)
                atomic_bytes(POINTER, canonical(pointer), 0o600, digest(secure(POINTER)) if POINTER.exists() else None)
            finish_pending(identity)
        except Exception:
            # Do not repeat effects after terminal publication. Otherwise undo
            # only exact states with this operation's preceding effect intent.
            if not rollback and not (directory / 'receipt.json').exists():
                if (directory / 'apply-main.intent.json').exists() and main_target() == plan['newMainTarget']:
                    switch_main(plan['newMainTarget'], plan['oldMainTarget'])
                if (directory / 'apply-unit.intent.json').exists() and digest(secure(UNIT)) == plan['newUnitSha256']:
                    atomic_bytes(UNIT, secure(old['root'] / UNIT.name), plan['oldUnitMode'], plan['newUnitSha256'])
                if main_target() == plan['oldMainTarget'] and digest(secure(UNIT)) == plan['oldUnitSha256']:
                    run(['/usr/bin/systemctl', 'daemon-reload'])
                    restore_pointer(plan)
                    publish(directory / 'rolled-back.json', {**binding, 'decision': 'ROLLED_BACK', 'reason': 'HANDOFF_POSTCHECK_FAILED', 'applicationRestartCommandIssued': False, 'applicationContinuityConfirmed': False})
                    finish_pending(identity)
            raise
    return {'decision': 'ROLLED_BACK' if rollback else ('RESOURCE_PROFILE_BOOTSTRAP_ACCEPTED' if plan.get('action') == RESOURCE_PROFILE_BOOTSTRAP else 'CONTROL_HANDOFF_ACCEPTED'), 'operationId': identity, 'controlReleaseSha': plan['oldReleaseSha'] if rollback else plan['newReleaseSha'], 'applicationRestarted': False, 'timersStopped': False}


def main():
    require(sys.platform == 'linux' and os.getuid() == 0, 'Linux root control plane required')
    require(dict(os.environ) == CLEAN, 'Use the isolated admitted control-handoff.sh bootstrap')
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    plan = sub.add_parser('plan')
    plan.add_argument('--old-sha', required=True)
    plan.add_argument('--new-sha', required=True)
    plan.add_argument('--admission-sha256', required=True)
    plan.add_argument('--evidence', type=Path, required=True)
    plan.add_argument('--resource-profile-bootstrap', action='store_true')
    bridge_plan = sub.add_parser('bridge-plan')
    bridge_plan.add_argument('--old-sha', required=True)
    bridge_plan.add_argument('--target-sha', required=True)
    bridge_plan.add_argument('--evidence', type=Path, required=True)
    bridge_apply = sub.add_parser('bridge-apply')
    bridge_apply.add_argument('--operation', required=True)
    bridge_apply.add_argument('--permit', type=Path, required=True)
    bridge_rollback_cmd = sub.add_parser('bridge-rollback')
    bridge_rollback_cmd.add_argument('--operation', required=True)
    bridge_rollback_cmd.add_argument('--permit', type=Path, required=True)
    for name in ('apply', 'rollback'):
        child = sub.add_parser(name)
        child.add_argument('--operation', required=True)
        child.add_argument('--approval', type=Path, required=True)
    args = parser.parse_args()
    current = Path(__file__).resolve().parent
    require(current.parent == CONTROLS and installed(current.name, executor=True)['root'] == current, 'Run only the staged admitted controller')
    if args.command == 'plan':
        require(current.name == args.new_sha, 'Planner must be the target controller')
        result = prepare(args.old_sha, args.new_sha, args.admission_sha256, args.evidence, args.resource_profile_bootstrap)
    elif args.command == 'bridge-plan':
        require(current.name == args.old_sha, 'Bridge planner must be the serving predecessor controller')
        result = bridge_prepare(args.old_sha, args.target_sha, args.evidence)
    elif args.command == 'bridge-apply':
        require(read_json(operation_path(args.operation) / 'plan.json')['oldReleaseSha'] == current.name, 'Bridge executor must remain the admitted predecessor controller')
        result = bridge_activate(args.operation, args.permit)
    elif args.command == 'bridge-rollback':
        require(read_json(operation_path(args.operation) / 'plan.json')['oldReleaseSha'] == current.name, 'Bridge rollback executor must remain the admitted predecessor controller')
        result = bridge_rollback(args.operation, args.permit)
    else:
        require(read_json(operation_path(args.operation) / 'plan.json')['newReleaseSha'] == current.name, 'Executor must be the admitted target controller')
        result = activate(args.operation, args.approval, args.command == 'rollback')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
