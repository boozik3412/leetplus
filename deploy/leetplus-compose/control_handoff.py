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
CLEAN = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC'}


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


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
    require(digest(release_raw) == admission['releaseManifestSha256'] and json.loads(release_raw)['releaseSha'] == sha, 'Release manifest is not bound to admission')
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
    return {'root': root, 'manifest': manifest, 'digest': digest(raw), 'admission': admission, 'admissionRaw': admission_raw, 'archive': archive}


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


def assert_compatible(old, new):
    for leaf in COMPATIBLE:
        require(old['manifest']['files'][leaf] == new['manifest']['files'][leaf], 'Runtime/worker contract change is not a controller-only handoff: ' + leaf)
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


def prepare(old_sha, new_sha, admission_sha, evidence_path):
    old, new = installed(old_sha), installed(new_sha, executor=True)
    require(old_sha != new_sha and new['manifest']['admissionSha256'] == admission_sha, 'Wrong target admission')
    evidence_raw = secure(evidence_path)
    evidence = json.loads(evidence_raw)
    require(evidence_raw == canonical(evidence), 'Evidence must be canonical LF JSON')
    require(evidence.get('decision') == 'PASS' and evidence.get('releaseSha') == new_sha and re.fullmatch('[a-f0-9]{64}', evidence.get('backupSha256', '')) and re.fullmatch('[a-f0-9]{64}', evidence.get('rehearsalSha256', '')), 'Exact backup/rehearsal evidence required')
    with control_lock(False, 20):
        assert_compatible(old, new)
        require(main_target() == str(old['root'] / 'control.sh'), 'Predecessor is not serving')
        require(not PENDING.exists(), 'Another handoff is pending')
        current = snapshot(new['root'])
        verify_current_controller_authority(current, old, new['root'])
        require(digest(secure(UNIT)) == old['manifest']['files'][UNIT.name], 'Original refresh unit drift')
        timers = {unit: systemd(unit) for unit in TIMERS}
        require(all(v['ActiveState'] in ('active', 'inactive') and v['UnitFileState'] in ('enabled', 'disabled') for v in timers.values()), 'Ambiguous timer state')
        private_dir(HANDOFFS)
        identity = str(uuid.uuid4())
        directory = operation_path(identity)
        private_dir(directory)
        plan = {'contract': CONTRACT + '_PLAN', 'operationId': identity, 'action': 'CONTROL_HANDOFF', 'hostIdentitySha256': digest(secure(Path('/etc/machine-id')).strip()),
                'oldReleaseSha': old_sha, 'newReleaseSha': new_sha, 'oldControlSha256': old['digest'], 'newControlSha256': new['digest'],
                'oldMainTarget': str(old['root'] / 'control.sh'), 'newMainTarget': str(new['root'] / 'control.sh'), 'snapshot': current, 'timers': timers,
                'oldUnitSha256': digest(secure(UNIT)), 'oldUnitMode': stat.S_IMODE(UNIT.stat().st_mode), 'newUnitSha256': new['manifest']['files'][UNIT.name],
                'previousPointer': base64.b64encode(secure(POINTER)).decode() if POINTER.exists() else None, 'evidenceSha256': digest(evidence_raw),
                'refreshScope': {'operation': 'refresh', 'setNames': ['lp_leetplus_https', 'lp_leetplus_smtp'], 'ttlSeconds': 3600, 'publicAddressesOnly': True, 'policySha256': current['files']['/etc/leetplus-compose/providers.json']},
                'applicationRestartAllowed': False, 'timersMayBeStopped': False, 'rollbackAllowed': True, 'maxLockWaitSeconds': 120}
        for name, value in [('plan.json', plan), ('evidence.json', evidence)]:
            publish(directory / name, value)
        # Existing encrypted backup includes this state subtree, so recovery of
        # a controller-only release does not depend on deploying its app images.
        for prefix, value in [('old', old), ('new', new)]:
            atomic_bytes(directory / (prefix + '-control.tar.gz'), value['archive'])
            atomic_bytes(directory / (prefix + '-admission.json'), value['admissionRaw'])
            atomic_bytes(directory / (prefix + '-install-manifest.json'), canonical(value['manifest']))
        return {'decision': 'PREPARED_NOT_AUTHORIZATION', 'operationId': identity, 'planSha256': digest(canonical(plan)), 'planPath': str(directory / 'plan.json')}


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
    require(plan['contract'] == CONTRACT + '_PLAN' and plan['action'] == 'CONTROL_HANDOFF' and plan['applicationRestartAllowed'] is False and plan['timersMayBeStopped'] is False and plan['rollbackAllowed'] is True and plan['maxLockWaitSeconds'] == 120, 'Invalid handoff scope')
    require(old['digest'] == plan['oldControlSha256'] and new['digest'] == plan['newControlSha256'], 'Controller manifest drift')
    require(plan['oldMainTarget'] == str(old['root'] / 'control.sh') and plan['newMainTarget'] == str(new['root'] / 'control.sh'), 'Unexpected main-pointer target')
    require(plan['oldUnitSha256'] == old['manifest']['files'][UNIT.name] and plan['newUnitSha256'] == new['manifest']['files'][UNIT.name] and plan['oldUnitMode'] in (0o400, 0o600, 0o644), 'Unexpected unit effect')
    expected_scope = {'operation': 'refresh', 'setNames': ['lp_leetplus_https', 'lp_leetplus_smtp'], 'ttlSeconds': 3600, 'publicAddressesOnly': True, 'policySha256': plan['snapshot']['files']['/etc/leetplus-compose/providers.json']}
    require(plan['refreshScope'] == expected_scope, 'Unexpected provider refresh scope')
    assert_compatible(old, new)


def restore_pointer(plan):
    current = secure(POINTER) if POINTER.exists() else None
    previous = base64.b64decode(plan['previousPointer'], validate=True) if plan['previousPointer'] is not None else None
    if current is not None and current != previous:
        receipt_path = operation_path(plan['operationId']) / 'receipt.json'
        require(receipt_path.exists() and json.loads(current) == {'operationId': plan['operationId'], 'receiptSha256': digest(secure(receipt_path))}, 'Refuse to replace a foreign control pointer')
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
    if effect_intended:
        require(PENDING.exists() and snapshot(new['root']) == plan['snapshot'], 'Changed live state forbids expiry undo')
        verify_timers(plan)
        if main == plan['newMainTarget']:
            switch_main(plan['newMainTarget'], plan['oldMainTarget'])
        if unit == plan['newUnitSha256']:
            atomic_bytes(UNIT, secure(old['root'] / UNIT.name), plan['oldUnitMode'], plan['newUnitSha256'])
        # Reconcile the loaded unit even if an earlier undo restored its file
        # but crashed before daemon-reload. No service is restarted.
        run(['/usr/bin/systemctl', 'daemon-reload'])
        require(snapshot(new['root']) == plan['snapshot'], 'Live state changed during expiry undo')
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
                require(main_target() == plan['oldMainTarget'] and digest(secure(UNIT)) == plan['oldUnitSha256'] and snapshot(new['root']) == plan['snapshot'], 'Completed rollback state changed before cleanup')
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
        require(snapshot(new['root']) == plan['snapshot'], 'Live app/data/grant state changed')
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
            require(snapshot(new['root']) == plan['snapshot'], 'Application/data/firewall changed during controller switch')
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
    return {'decision': 'ROLLED_BACK' if rollback else 'CONTROL_HANDOFF_ACCEPTED', 'operationId': identity, 'controlReleaseSha': plan['oldReleaseSha'] if rollback else plan['newReleaseSha'], 'applicationRestarted': False, 'timersStopped': False}


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
    for name in ('apply', 'rollback'):
        child = sub.add_parser(name)
        child.add_argument('--operation', required=True)
        child.add_argument('--approval', type=Path, required=True)
    args = parser.parse_args()
    current = Path(__file__).resolve().parent
    require(current.parent == CONTROLS and installed(current.name, executor=True)['root'] == current, 'Run only the staged admitted controller')
    if args.command == 'plan':
        require(current.name == args.new_sha, 'Planner must be the target controller')
        result = prepare(args.old_sha, args.new_sha, args.admission_sha256, args.evidence)
    else:
        require(read_json(operation_path(args.operation) / 'plan.json')['newReleaseSha'] == current.name, 'Executor must be the admitted target controller')
        result = activate(args.operation, args.approval, args.command == 'rollback')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
