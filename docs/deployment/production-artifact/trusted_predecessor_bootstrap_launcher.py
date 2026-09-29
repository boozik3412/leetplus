"""Separately admitted predecessor launcher, outside the candidate bundle.

This file must itself be installed and byte-attested by the existing trusted
production-control path under a distinct plan/GO. It imports no candidate code
until the deployment-root enrollment chain and every bundle leaf pass.
"""
import argparse
import base64
import contextlib
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time

CAPTURED_LOADER = """import base64,json,os,sys
fd=int(sys.argv[1]);entry=sys.argv[2]
with os.fdopen(fd,'rb') as stream: raw=stream.read(48*1024*1024+1)
if not 0<len(raw)<=48*1024*1024: raise ValueError('Captured closure bound differs')
captured={k:base64.b64decode(v,validate=True) for k,v in json.loads(raw).items()}
sys.argv=[entry]+sys.argv[3:]
scope={'__name__':'__main__','__file__':entry,'__leetplus_captured_sources__':captured}
exec(compile(captured['deploy/transition-bootstrap/rpc_host.py'],entry,'exec'),scope)
"""

ROOT = Path('/usr/local/libexec/leetplus-transition-bootstrap')
APPROVAL_ROOT = Path('/etc/leetplus-compose/approval-root.pem')
MACHINE_ID = Path('/etc/machine-id')
SOURCE_INBOX = Path('/srv/leetplus/inbox')
COMPOSE_STATE = Path('/var/lib/leetplus-compose')
RUNTIME_STATE = Path('/var/lib/leetplus-transition-bootstrap')
RUNTIME_REQUESTS = RUNTIME_STATE / 'requests'
RUNTIME_OPERATIONS = RUNTIME_STATE / 'operations'
RUNTIME_ATTEMPTS = RUNTIME_STATE / 'attempts'
TRANSITION_LOCK = RUNTIME_STATE / 'transition.lock'
RUNTIME_PROVISION_PLAN = 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RUNTIME_PROVISION_V1_PLAN'
RUNTIME_PROVISION_APPROVAL = 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RUNTIME_PROVISION_V1_APPROVAL'
RUNTIME_PROVISION_INTENT = 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RUNTIME_PROVISION_V1_INTENT'
RUNTIME_PROVISION_RECEIPT = 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RUNTIME_PROVISION_V1_RECEIPT'
RUNTIME_NODE = Path('/usr/bin/node')
RUNTIME_PROVISION_EFFECTS = {'runtimeDirectoriesOnly': True, 'requestPlacementOnly': True,
    'controllerPointerMutation': False, 'applicationRestart': False,
    'systemdUnitMutation': False, 'dataMutation': False,
    'grantMutation': False, 'timerMutation': False, 'providerEffect': False}
RUNTIME_PROVISION_VERIFY = """import crypto from 'node:crypto';import fs from 'node:fs';
const v=JSON.parse(fs.readFileSync(0,'utf8'));const k=crypto.createPublicKey(v.publicKey);
if(k.asymmetricKeyType!=='ed25519'||v.publicKey.includes('PRIVATE')||
!crypto.verify(null,Buffer.from(v.message,'base64'),k,Buffer.from(v.signature,'base64')))process.exit(1);
process.stdout.write('PASS');"""
HASH = re.compile(r'[a-f0-9]{64}\Z')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z')
REQUIRED = {
    'deploy/transition-bootstrap/rpc_host.py',
    'deploy/transition-bootstrap/protocol.mjs',
    'deploy/transition-bootstrap/cli.mjs',
    'deploy/transition-bootstrap/hard_deadline.py',
    'deploy/transition-bootstrap/native_boundary.py',
    'deploy/transition-bootstrap/inventory.py',
    'deploy/transition-bootstrap/authority.py',
    'deploy/transition-bootstrap/enrollment.py',
    'deploy/transition-bootstrap/host_observer.py',
    'deploy/transition-bootstrap/canonical_lineage.py',
    'deploy/transition-bootstrap/canonical_lineage_native.py',
    'deploy/leetplus-compose/a-bridge-bootstrap-authority.mjs',
    'deploy/leetplus-compose/bridge-external-successor-authority.mjs',
    'deploy/leetplus-compose/control-handoff-authority.mjs',
}
EFFECTS = {'bootstrapBundleOnly': True, 'publicRootsOnly': True,
           'requestPlacement': True,
           'controllerPointerMutation': False, 'applicationRestart': False,
           'dataMutation': False, 'workerGrantMutation': False,
           'timerMutation': False, 'providerEffect': False}
VERIFY = """import crypto from 'node:crypto';import fs from 'node:fs';
const v=JSON.parse(fs.readFileSync(0,'utf8'));const d=[];
for(const p of v.roots){const k=crypto.createPublicKey(p);if(k.asymmetricKeyType!=='ed25519')process.exit(1);d.push(crypto.createHash('sha256').update(k.export({type:'spki',format:'der'})).digest('hex'));}
const a=crypto.createPublicKey(v.deployment);if(a.asymmetricKeyType!=='ed25519')process.exit(1);
const root=crypto.createHash('sha256').update(a.export({type:'spki',format:'der'})).digest('hex');
const ok=crypto.verify(null,Buffer.from(v.message,'base64'),a,Buffer.from(v.signature,'base64'));
if(!ok||d.includes(root))process.exit(1);process.stdout.write(JSON.stringify(d));"""
CLEAN = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8',
         'LC_ALL': 'C.UTF-8', 'TZ': 'UTC', 'PYTHONNOUSERSITE': '1',
         'PYTHONDONTWRITEBYTECODE': '1'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def secure_directory(path):
    path = Path(path)
    require(path.is_absolute(), 'Absolute installed path required')
    for entry in (*reversed(path.parents), path):
        info = entry.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                'Untrusted launcher ancestor')
    return path


def secure_read(path, limit=65536):
    path = Path(path)
    secure_directory(path.parent)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and
                before.st_nlink == 1 and not before.st_mode & 0o022 and
                before.st_size <= limit, 'Untrusted launcher file')
        value = os.read(fd, limit + 1)
        after = os.fstat(fd)
        latest = path.lstat()
        identity = lambda item: (item.st_dev, item.st_ino, item.st_size,
                                 item.st_mtime_ns, item.st_ctime_ns)
        require(len(value) == before.st_size and identity(before) == identity(after) == identity(latest),
                'Launcher file changed during read')
        return value
    finally:
        os.close(fd)


def read_json(path, limit=65536):
    raw = secure_read(path, limit)
    value = json.loads(raw)
    require(raw == canonical(value), 'Noncanonical trusted launcher record')
    return value, raw


def instant(value):
    require(isinstance(value, str) and value.endswith('Z'), 'Canonical UTC instant required')
    parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.isoformat(timespec='milliseconds').replace('+00:00', 'Z') == value,
            'Noncanonical enrollment instant')
    return parsed


def verify_installed_bundle(final, deployment_root=APPROVAL_ROOT,
                            machine_id=MACHINE_ID, source_inbox=SOURCE_INBOX,
                            node='/usr/bin/node'):
    final = secure_directory(final)
    require(HASH.fullmatch(final.name) and {item.name for item in final.iterdir()} ==
            {'bundle', 'enrollment'}, 'Unexpected installed bootstrap root')
    bundle, enrollment = secure_directory(final / 'bundle'), secure_directory(final / 'enrollment')
    values = {}
    for leaf in ('installer-plan.json', 'installer-approval.json', 'installer-intent.json',
                 'installer-receipt.json', 'enrollment.json'):
        values[leaf], _ = read_json(enrollment / leaf)
    plan, approval_envelope, intent, receipt, record = (values[leaf] for leaf in
        ('installer-plan.json', 'installer-approval.json', 'installer-intent.json',
         'installer-receipt.json', 'enrollment.json'))
    required_plan = {'contract', 'operationId', 'action', 'hostIdentitySha256',
        'predecessorReleaseSha', 'predecessorManifestSha256', 'oldCorePointer',
        'sourceRelease', 'sourceAdmissionSha256', 'installerSourceSha256', 'installerAuthority',
        'bundleFiles', 'bundleSha256', 'bundleArchiveSha256', 'publicRoots', 'effects'}
    require(isinstance(plan, dict) and set(plan) == required_plan and plan.get('contract') ==
            'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_PLAN' and
            plan.get('action') == 'INSTALL_INDEPENDENT_PUBLIC_ONLY_ADAPTER' and
            UUID.fullmatch(plan.get('operationId', '')) and
            plan.get('effects') == EFFECTS and
            plan.get('hostIdentitySha256') == digest(secure_read(machine_id).strip()) and
            re.fullmatch(r'[a-f0-9]{40}', plan.get('predecessorReleaseSha', '')) and
            re.fullmatch(r'[a-f0-9]{40}', plan.get('sourceRelease', '')) and
            plan.get('oldCorePointer') ==
                f"/usr/local/lib/leetplus-compose/{plan['predecessorReleaseSha']}/control.sh" and
            all(HASH.fullmatch(plan.get(name, '')) for name in
                ('predecessorManifestSha256', 'sourceAdmissionSha256',
                 'installerSourceSha256', 'bundleArchiveSha256')) and
            isinstance(plan.get('installerAuthority'), dict) and
            set(plan['installerAuthority']) == {'helperSourceSha256', 'verifierSourceSha256',
                'introPlanSha256', 'introReceiptSha256',
                'generationRootManifestSha256', 'generationReceiptSha256'} and
            all(isinstance(value, str) and HASH.fullmatch(value) for value in plan['installerAuthority'].values()) and
            plan.get('bundleSha256') == final.name and
            isinstance(plan.get('bundleFiles'), dict) and REQUIRED == set(plan['bundleFiles']) and
            0 < len(plan['bundleFiles']) <= 128 and
            digest(canonical(plan['bundleFiles'])) == final.name and
            isinstance(plan.get('publicRoots'), dict) and
            set(plan['publicRoots']) == {'permit', 'execution', 'rollback', 'noEffect'} and
            all(HASH.fullmatch(value) for value in plan['publicRoots'].values()),
            'Bootstrap installer plan does not independently pin host/source/roots')
    require(isinstance(approval_envelope, dict) and set(approval_envelope) == {'approval', 'signature'},
            'Invalid signed installer approval')
    approval = approval_envelope['approval']
    require(isinstance(approval, dict) and set(approval) ==
            {'contract', 'operationId', 'hostIdentitySha256', 'planSha256',
             'action', 'issuedAt', 'expiresAt'} and
            approval['contract'] == 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_APPROVAL' and
            approval['operationId'] == plan['operationId'] and
            approval['action'] == plan['action'] and
            approval['hostIdentitySha256'] == plan['hostIdentitySha256'] and
            approval['planSha256'] == digest(canonical(plan)),
            'Deployment-root approval differs from exact installer plan')
    require(isinstance(intent, dict) and set(intent) ==
            {'contract', 'operationId', 'planSha256', 'approvalSha256', 'authorizedAt'} and
            intent['contract'] == plan['contract'] + '_INTENT' and
            intent['operationId'] == plan['operationId'] and
            intent['planSha256'] == digest(canonical(plan)) and
            intent['approvalSha256'] == digest(canonical(approval_envelope)),
            'Installer intent differs from signed plan')
    issued, expires, authorized = (instant(value) for value in
        (approval['issuedAt'], approval['expiresAt'], intent['authorizedAt']))
    require(issued <= authorized < expires and expires - issued <= datetime.timedelta(minutes=30),
            'Installer effect was outside signed validity')
    require(isinstance(receipt, dict) and set(receipt) ==
            {'contract', 'decision', 'operationId', 'planSha256', 'approvalSha256',
             'intentSha256', 'bundleSha256', 'publicRoots', 'hostIdentitySha256', 'acceptedAt'} and
            receipt['contract'] == 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_RECEIPT' and
            receipt['decision'] == 'PASS' and receipt['operationId'] == plan['operationId'] and
            receipt['planSha256'] == digest(canonical(plan)) and
            receipt['approvalSha256'] == digest(canonical(approval_envelope)) and
            receipt['intentSha256'] == digest(canonical(intent)) and
            receipt['bundleSha256'] == final.name and
            receipt['publicRoots'] == plan['publicRoots'] and
            receipt['hostIdentitySha256'] == plan['hostIdentitySha256'] and
            instant(receipt['acceptedAt']) == authorized,
            'Installer terminal receipt differs from timely intent')
    require(record == {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_ENROLLMENT_V2',
            'decision': 'ACCEPTED', 'hostIdentitySha256': plan['hostIdentitySha256'],
            'bundleFiles': plan['bundleFiles'], 'bundleSha256': final.name,
            'publicRoots': plan['publicRoots'],
            'installerReceiptSha256': digest(canonical(receipt))},
            'Enrollment descriptor is not bound to admitted installer receipt')
    admission = secure_read(Path(source_inbox) / plan['sourceRelease'] / 'docker-admission.json')
    source = json.loads(admission)
    require(digest(admission) == plan['sourceAdmissionSha256'] and
            source.get('contract') == 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION' and
            source.get('decision') == 'PASS' and source.get('releaseSha') == plan['sourceRelease'] and
            source.get('repository') == 'boozik3412/leetplus' and
            source.get('event') == 'push' and source.get('ref') == 'refs/heads/main',
            'Bootstrap source is not exact-main admitted')
    deployment = secure_read(deployment_root, 4096).decode('ascii')
    roots = []
    for name in ('permit', 'execution', 'rollback', 'noEffect'):
        raw = secure_read(enrollment / (name + '-root.pem'), 4096)
        require(digest(raw) == plan['publicRoots'][name], 'Enrolled public root changed')
        roots.append(raw.decode('ascii'))
    payload = {'deployment': deployment, 'roots': roots,
        'message': base64.b64encode(canonical(approval)).decode(),
        'signature': approval_envelope['signature']}
    checked = subprocess.run([node, '--input-type=module', '-e', VERIFY],
        input=canonical(payload), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=CLEAN, timeout=15, check=False)
    require(checked.returncode == 0 and not checked.stderr,
            'Independent deployment-root signature verification failed')
    identities = json.loads(checked.stdout)
    require(len(identities) == 4 and len(set(identities)) == 4,
            'Transition public roots collapse to one identity')
    # Reproduce the complete closed bundle tree before importing its Python.
    observed_files, observed_dirs = set(), set()
    for current, directories, files in os.walk(bundle, followlinks=False):
        secure_directory(current)
        for name in directories:
            entry = secure_directory(Path(current) / name)
            observed_dirs.add(entry.relative_to(bundle).as_posix())
        for name in files:
            entry = Path(current) / name
            observed_files.add(entry.relative_to(bundle).as_posix())
    expected_dirs = {parent.as_posix() for name in plan['bundleFiles']
                     for parent in Path(name).parents if str(parent) != '.'}
    require(observed_files == set(plan['bundleFiles']) and observed_dirs == expected_dirs,
            'Unadmitted bundle file or directory')
    captured = {}
    for name, expected in plan['bundleFiles'].items():
        raw = secure_read(bundle / name, 2 * 1024 * 1024)
        require(re.fullmatch(r'[A-Za-z0-9_.@/-]+', name) and '..' not in name.split('/') and
                HASH.fullmatch(expected) and digest(raw) == expected,
                'Admitted bootstrap module byte changed')
        captured[name] = raw
    require({item.name for item in enrollment.iterdir()} ==
            {'enrollment.json', 'installer-plan.json', 'installer-approval.json',
             'installer-intent.json', 'installer-receipt.json',
             'permit-root.pem', 'execution-root.pem', 'rollback-root.pem', 'noEffect-root.pem'},
            'Enrollment has an unexpected leaf')
    return {'bundleSha256': final.name, 'installerReceiptSha256': digest(canonical(receipt)),
            'entry': bundle / 'deploy' / 'transition-bootstrap' / 'rpc_host.py',
            'capturedFiles': captured}


def provision_paths(placement_id):
    require(UUID.fullmatch(placement_id), 'Exact runtime placement UUID required')
    request = RUNTIME_REQUESTS / placement_id
    return {str(path): path for path in (RUNTIME_STATE, RUNTIME_REQUESTS,
        RUNTIME_OPERATIONS, RUNTIME_ATTEMPTS, TRANSITION_LOCK, request,
        request / 'request.json', COMPOSE_STATE / (placement_id + '.transition-provision.intent.json'),
        COMPOSE_STATE / (placement_id + '.transition-provision.receipt.json'))}


def provision_preimage(path):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return {'state': 'ABSENT'}
    directories = {RUNTIME_STATE, RUNTIME_REQUESTS, RUNTIME_OPERATIONS,
                   RUNTIME_ATTEMPTS, path.parent if path.name == 'request.json' else None}
    kind = stat.S_ISDIR if path in directories else stat.S_ISREG
    require(kind(info.st_mode) and info.st_uid == 0 and info.st_gid == 0 and
            (kind is stat.S_ISDIR or info.st_nlink == 1) and
            not info.st_mode & 0o077,
            'Foreign runtime provision path preimage')
    return {'state': 'EXACT', 'device': info.st_dev, 'inode': info.st_ino,
            'uid': info.st_uid, 'gid': info.st_gid,
            'mode': stat.S_IMODE(info.st_mode), 'ctimeNs': info.st_ctime_ns}


def validate_provision(plan, envelope, request_raw, installed, *, at=None, check_preimages=True):
    require(isinstance(plan, dict) and set(plan) == {'contract', 'placementId',
        'operationId', 'attemptId', 'command', 'hostIdentitySha256', 'bundleSha256',
        'installerReceiptSha256', 'requestSha256', 'preimages', 'nativeLocks', 'effects'} and
        plan['contract'] == RUNTIME_PROVISION_PLAN and UUID.fullmatch(plan['placementId']) and
        UUID.fullmatch(plan['operationId']) and UUID.fullmatch(plan['attemptId']) and
        plan['command'] in ('observe', 'plan-v1', 'prepare', 'apply', 'reconcile',
                            'rollback', 'reconcile-rollback', 'terminalize-no-effect') and
        plan['effects'] == RUNTIME_PROVISION_EFFECTS and
        plan['bundleSha256'] == installed['bundleSha256'] and
        plan['installerReceiptSha256'] == installed['installerReceiptSha256'] and
        plan['hostIdentitySha256'] == digest(secure_read(MACHINE_ID).strip()) and
        plan['requestSha256'] == digest(request_raw),
        'Closed signed runtime provision plan differs')
    paths = provision_paths(plan['placementId'])
    require(isinstance(plan['preimages'], dict) and set(plan['preimages']) == set(paths) and
            (not check_preimages or all(plan['preimages'][name] == provision_preimage(path)
                for name, path in paths.items())) and
            all(plan['preimages'][str(path)] == {'state': 'ABSENT'} for path in
                (RUNTIME_REQUESTS / plan['placementId'],
                 RUNTIME_REQUESTS / plan['placementId'] / 'request.json',
                 COMPOSE_STATE / (plan['placementId'] + '.transition-provision.intent.json'),
                 COMPOSE_STATE / (plan['placementId'] + '.transition-provision.receipt.json'))),
            'Runtime provision exact path preimages differ')
    native = {str(COMPOSE_STATE / 'standalone-install.lock'),
              str(COMPOSE_STATE / 'control.lock')}
    require(isinstance(plan['nativeLocks'], dict) and set(plan['nativeLocks']) == native and
            all(plan['nativeLocks'][name] == provision_preimage(Path(name)) and
                plan['nativeLocks'][name]['state'] == 'EXACT' and
                plan['nativeLocks'][name]['mode'] == 0o600 for name in native),
            'Runtime provision native lock preimages differ')
    request = json.loads(request_raw)
    require(request_raw == canonical(request) and isinstance(request, dict) and
            set(request) == {'contract', 'command', 'operationId', 'attemptId', 'mode',
                             'targetRelease', 'criticalNames', 'evidence', 'inputs'} and
            request['contract'] == 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RPC_V1' and
            request['command'] == plan['command'] and
            request['operationId'] == plan['operationId'] and
            request['attemptId'] == plan['attemptId'],
            'Runtime provision request is not the signed exact RPC input')
    require(isinstance(envelope, dict) and set(envelope) == {'approval', 'signature'},
            'Closed runtime provision approval required')
    approval = envelope['approval']
    require(isinstance(approval, dict) and set(approval) == {'contract', 'placementId',
            'hostIdentitySha256', 'planSha256', 'issuedAt', 'expiresAt'} and
            approval['contract'] == RUNTIME_PROVISION_APPROVAL and
            approval['placementId'] == plan['placementId'] and
            approval['hostIdentitySha256'] == plan['hostIdentitySha256'] and
            approval['planSha256'] == digest(canonical(plan)),
            'Runtime approval does not bind exact plan')
    now = at or datetime.datetime.now(datetime.timezone.utc)
    issued, expires = instant(approval['issuedAt']), instant(approval['expiresAt'])
    require(issued <= now < expires and
            datetime.timedelta(0) < expires - issued <= datetime.timedelta(minutes=30),
            'Runtime provision approval expired or unbounded')
    signature = envelope['signature']
    require(isinstance(signature, str) and re.fullmatch(r'[A-Za-z0-9+/]{86}==', signature) and
            len(base64.b64decode(signature, validate=True)) == 64,
            'Exact runtime provision signature required')
    root = secure_read(APPROVAL_ROOT, 4096)
    payload = {'publicKey': root.decode('ascii'),
               'message': base64.b64encode(canonical(approval)).decode('ascii'),
               'signature': signature}
    result = subprocess.run([str(RUNTIME_NODE), '--input-type=module', '-e', RUNTIME_PROVISION_VERIFY],
        input=canonical(payload), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=CLEAN, timeout=15, check=False)
    require(result.returncode == 0 and result.stdout == b'PASS' and not result.stderr,
            'Runtime provision deployment signature rejected')
    return request


def read_provision_packet():
    raw = sys.stdin.buffer.read(2 * 1024 * 1024 + 1)
    require(0 < len(raw) <= 2 * 1024 * 1024, 'Bounded captured runtime packet required')
    value = json.loads(raw)
    require(isinstance(value, dict) and set(value) == {'plan', 'approvalEnvelope', 'request'} and
            raw == canonical(value), 'Canonical closed runtime provision packet required')
    return value['plan'], value['approvalEnvelope'], canonical(value['request'])


@contextlib.contextmanager
def provision_locks():
    import fcntl
    paths = (COMPOSE_STATE / 'standalone-install.lock', COMPOSE_STATE / 'control.lock')
    descriptors = []
    deadline = time.monotonic() + 120
    try:
        for path in paths:
            secure_read(path, 65536)
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            descriptors.append(fd)
            before = os.fstat(fd)
            require(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and
                    before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600,
                    'Runtime provision lock differs')
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    require(time.monotonic() < deadline, 'Runtime provision lock wait expired')
                    time.sleep(0.01)
            after = path.lstat()
            require((before.st_dev, before.st_ino, before.st_ctime_ns) ==
                    (after.st_dev, after.st_ino, after.st_ctime_ns),
                    'Runtime provision lock inode changed')
        if provision_preimage(TRANSITION_LOCK)['state'] == 'EXACT':
            fd = os.open(TRANSITION_LOCK, os.O_RDONLY | os.O_NOFOLLOW)
            descriptors.append(fd)
            before = os.fstat(fd)
            require(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and
                    before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600,
                    'Existing native transition lock differs')
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    require(time.monotonic() < deadline, 'Runtime transition lock wait expired')
                    time.sleep(0.01)
        yield
    finally:
        for fd in reversed(descriptors):
            os.close(fd)


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_new(path, raw, mode):
    require(isinstance(raw, bytes) and 0 < len(raw) <= 2 * 1024 * 1024,
            'Bounded new runtime leaf required')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    sync_directory(path.parent)
    require(secure_read(path, 2 * 1024 * 1024) == raw, 'Runtime provision leaf changed')


def runtime_postimage(placement_id, request_sha):
    request = RUNTIME_REQUESTS / placement_id
    names = (RUNTIME_STATE, RUNTIME_REQUESTS, RUNTIME_OPERATIONS,
             RUNTIME_ATTEMPTS, TRANSITION_LOCK, request, request / 'request.json')
    result = {}
    for path in names:
        info = path.lstat()
        directory = path in (RUNTIME_STATE, RUNTIME_REQUESTS, RUNTIME_OPERATIONS,
                             RUNTIME_ATTEMPTS, request)
        require((stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)) and
                info.st_uid == info.st_gid == 0 and
                stat.S_IMODE(info.st_mode) == (0o700 if directory else
                                              0o600 if path == TRANSITION_LOCK else 0o400) and
                (directory or info.st_nlink == 1), 'Runtime provision postimage changed')
        result[str(path)] = {'device': info.st_dev, 'inode': info.st_ino,
                             'uid': info.st_uid, 'gid': info.st_gid,
                             'mode': stat.S_IMODE(info.st_mode)}
    require(digest(secure_read(request / 'request.json', 2 * 1024 * 1024)) == request_sha and
            {child.name for child in request.iterdir()} == {'request.json'},
            'Exact runtime request postimage changed')
    return result


def runtime_receipt(plan, envelope, intent, postimage):
    return {'contract': RUNTIME_PROVISION_RECEIPT, 'decision': 'REQUEST_STAGED_RUNTIME_DORMANT',
            'placementId': plan['placementId'], 'plan': plan, 'approvalEnvelope': envelope,
            'intentSha256': digest(canonical(intent)),
            'requestSha256': plan['requestSha256'],
            'postimageSha256': digest(canonical(postimage)), 'postimage': postimage}


def provision_runtime(plan, envelope, request_raw, installed):
    validate_provision(plan, envelope, request_raw, installed)
    with provision_locks():
        validate_provision(plan, envelope, request_raw, installed)
        now = datetime.datetime.now(datetime.timezone.utc)
        require(instant(envelope['approval']['issuedAt']) <= now <
                instant(envelope['approval']['expiresAt']),
                'Runtime provision approval expired before first write')
        authorized = now.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        intent = {'contract': RUNTIME_PROVISION_INTENT, 'placementId': plan['placementId'],
                  'planSha256': digest(canonical(plan)),
                  'approvalSha256': digest(canonical(envelope)),
                  'requestSha256': plan['requestSha256'], 'authorizedAt': authorized}
        intent_path = COMPOSE_STATE / (plan['placementId'] + '.transition-provision.intent.json')
        # The flat intent is the first durable write and remains on partial failure.
        write_new(intent_path, canonical(intent), 0o400)
        for directory in (RUNTIME_STATE, RUNTIME_REQUESTS,
                          RUNTIME_OPERATIONS, RUNTIME_ATTEMPTS):
            if provision_preimage(directory)['state'] == 'ABSENT':
                directory.mkdir(mode=0o700)
                sync_directory(directory.parent)
        if provision_preimage(TRANSITION_LOCK)['state'] == 'ABSENT':
            fd = os.open(TRANSITION_LOCK, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            os.close(fd)
            sync_directory(RUNTIME_STATE)
        request_dir = RUNTIME_REQUESTS / plan['placementId']
        request_dir.mkdir(mode=0o700)
        sync_directory(RUNTIME_REQUESTS)
        temporary = request_dir / '.request.json.pending'
        write_new(temporary, request_raw, 0o400)
        import ctypes
        libc = ctypes.CDLL(None, use_errno=True)
        rename = libc.renameat2
        rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
        final = request_dir / 'request.json'
        if rename(-100, os.fsencode(temporary), -100, os.fsencode(final), 1) != 0:
            error = ctypes.get_errno()
            raise OSError(error, os.strerror(error), str(final))
        sync_directory(request_dir)
        postimage = runtime_postimage(plan['placementId'], plan['requestSha256'])
        receipt = runtime_receipt(plan, envelope, intent, postimage)
        receipt_path = COMPOSE_STATE / (plan['placementId'] + '.transition-provision.receipt.json')
        write_new(receipt_path, canonical(receipt), 0o400)
        return {'decision': receipt['decision'], 'placementId': plan['placementId'],
                'receiptSha256': digest(canonical(receipt))}


def runtime_intent(placement_id):
    path = COMPOSE_STATE / (placement_id + '.transition-provision.intent.json')
    try:
        intent, _ = read_json(path)
    except FileNotFoundError:
        return None, {'decision': 'RUNTIME_INTENT_ABSENT_REQUIRES_NEW_PLAN'}
    except (OSError, ValueError, UnicodeError):
        return None, {'decision': 'UNKNOWN_TORN_RUNTIME_INTENT_REQUIRES_SIGNED_RECOVERY'}
    return intent, None


def verify_runtime_intent(plan, envelope, intent):
    require(isinstance(intent, dict) and set(intent) == {'contract', 'placementId',
            'planSha256', 'approvalSha256', 'requestSha256', 'authorizedAt'} and
            intent['contract'] == RUNTIME_PROVISION_INTENT and
            intent['placementId'] == plan['placementId'] and
            intent['planSha256'] == digest(canonical(plan)) and
            intent['approvalSha256'] == digest(canonical(envelope)) and
            intent['requestSha256'] == plan['requestSha256'],
            'Runtime provision intent does not bind signed plan')
    return instant(intent['authorizedAt'])


def reconcile_runtime(plan, envelope, request_raw, installed, *, finalize=False):
    require(isinstance(plan, dict) and UUID.fullmatch(plan.get('placementId', '')),
            'Exact runtime placement required')
    with provision_locks():
        intent, classification = runtime_intent(plan['placementId'])
        if classification:
            return classification
        historical = verify_runtime_intent(plan, envelope, intent)
        validate_provision(plan, envelope, request_raw, installed,
                           at=historical, check_preimages=False)
        request_dir = RUNTIME_REQUESTS / plan['placementId']
        try:
            if (request_dir / '.request.json.pending').lstat():
                return {'decision': 'PARTIAL_RUNTIME_REQUEST_REQUIRES_SIGNED_RECOVERY'}
        except FileNotFoundError:
            pass
        try:
            postimage = runtime_postimage(plan['placementId'], plan['requestSha256'])
        except (OSError, ValueError, UnicodeError):
            return {'decision': 'PARTIAL_RUNTIME_POSTIMAGE_REQUIRES_SIGNED_RECOVERY'}
        receipt = runtime_receipt(plan, envelope, intent, postimage)
        receipt_path = COMPOSE_STATE / (plan['placementId'] + '.transition-provision.receipt.json')
        try:
            actual, raw = read_json(receipt_path, 2 * 1024 * 1024)
        except FileNotFoundError:
            if finalize:
                write_new(receipt_path, canonical(receipt), 0o400)
                return {'decision': 'RECONCILED_EXACT_RUNTIME_RECEIPT',
                        'receiptSha256': digest(canonical(receipt))}
            return {'decision': 'COMPLETE_RUNTIME_POSTIMAGE_MISSING_RECEIPT_REQUIRES_SIGNED_RECOVERY'}
        except (OSError, ValueError, UnicodeError):
            return {'decision': 'PARTIAL_RUNTIME_RECEIPT_REQUIRES_SIGNED_RECOVERY'}
        require(actual == receipt and raw == canonical(receipt),
                'Runtime provision terminal receipt differs from postimage')
        return {'decision': 'ALREADY_STAGED_RUNTIME_REQUEST',
                'receiptSha256': digest(raw)}


def verify_runtime_request(placement_id, operation_id, installed):
    require(UUID.fullmatch(placement_id) and UUID.fullmatch(operation_id),
            'Exact runtime request identity required')
    receipt_path = COMPOSE_STATE / (placement_id + '.transition-provision.receipt.json')
    receipt, receipt_raw = read_json(receipt_path, 2 * 1024 * 1024)
    require(isinstance(receipt, dict) and set(receipt) == {'contract', 'decision',
        'placementId', 'plan', 'approvalEnvelope', 'intentSha256', 'requestSha256',
        'postimageSha256', 'postimage'} and receipt['contract'] == RUNTIME_PROVISION_RECEIPT and
        receipt['decision'] == 'REQUEST_STAGED_RUNTIME_DORMANT' and
        receipt['placementId'] == placement_id,
        'Terminal signed runtime provision receipt required')
    plan, envelope = receipt['plan'], receipt['approvalEnvelope']
    request_path = RUNTIME_REQUESTS / placement_id / 'request.json'
    request_raw = secure_read(request_path, 2 * 1024 * 1024)
    intent, classification = runtime_intent(placement_id)
    require(classification is None, 'Original runtime provision intent is incomplete')
    historical = verify_runtime_intent(plan, envelope, intent)
    validate_provision(plan, envelope, request_raw, installed,
                       at=historical, check_preimages=False)
    require(plan['operationId'] == operation_id and
            receipt['intentSha256'] == digest(canonical(intent)) and
            receipt['requestSha256'] == digest(request_raw),
            'Runtime request is not exact signed operation')
    postimage = runtime_postimage(placement_id, receipt['requestSha256'])
    require(receipt == runtime_receipt(plan, envelope, intent, postimage),
            'Runtime receipt and current postimage differ')
    return request_path, digest(receipt_raw)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Independent predecessor bootstrap launcher')
    parser.add_argument('action', nargs='?', choices=('run', 'provision', 'reconcile-provision',
                                                     'finalize-provision'),
                        default='run')
    parser.add_argument('--bundle-sha256', required=True)
    parser.add_argument('--operation-id', required=True)
    parser.add_argument('--request-id', required=True)
    args = parser.parse_args(argv)
    require(os.name == 'posix' and os.getuid() == 0 and HASH.fullmatch(args.bundle_sha256) and
            UUID.fullmatch(args.operation_id) and UUID.fullmatch(args.request_id),
            'Root exact launcher invocation required')
    verified = verify_installed_bundle(ROOT / args.bundle_sha256)
    if args.action in ('provision', 'reconcile-provision', 'finalize-provision'):
        plan, envelope, request_raw = read_provision_packet()
        require(plan.get('placementId') == args.request_id and
                plan.get('operationId') == args.operation_id,
                'Captured runtime plan differs from CLI identity')
        prior = signal.getsignal(signal.SIGALRM)
        prior_timer = signal.getitimer(signal.ITIMER_REAL)
        signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError('Bounded runtime provision deadline')))
        signal.setitimer(signal.ITIMER_REAL, 180)
        try:
            result = (provision_runtime(plan, envelope, request_raw, verified)
                      if args.action == 'provision' else
                      reconcile_runtime(plan, envelope, request_raw, verified,
                                        finalize=args.action == 'finalize-provision'))
        finally:
            signal.setitimer(signal.ITIMER_REAL, *prior_timer)
            signal.signal(signal.SIGALRM, prior)
        print(json.dumps(result, sort_keys=True))
        return 0
    request, provision_receipt_sha = verify_runtime_request(
        args.request_id, args.operation_id, verified)
    environment = {**CLEAN,
        'LEETPLUS_BOOTSTRAP_INSTALL_RECEIPT_SHA256': verified['installerReceiptSha256'],
        'LEETPLUS_TRANSITION_PROVISION_RECEIPT_SHA256': provision_receipt_sha}
    import fcntl
    packet = canonical({name: base64.b64encode(raw).decode('ascii')
                        for name, raw in verified['capturedFiles'].items()})
    require(len(packet) <= 48 * 1024 * 1024, 'Captured closure packet exceeds bound')
    fd = os.memfd_create('leetplus-bootstrap-captured-source', os.MFD_ALLOW_SEALING)
    try:
        with os.fdopen(os.dup(fd), 'wb') as stream:
            stream.write(packet)
            stream.flush()
        os.lseek(fd, 0, os.SEEK_SET)
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW |
                    fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
        os.set_inheritable(fd, True)
        os.execve('/usr/bin/python3', ['/usr/bin/python3', '-I', '-B', '-c', CAPTURED_LOADER,
        str(fd), str(verified['entry']),
        '--bundle-sha256', args.bundle_sha256, '--operation-id', args.operation_id,
        '--request-id', args.request_id], environment)
    finally:
        os.close(fd)


if __name__ == '__main__':
    raise SystemExit(main())
