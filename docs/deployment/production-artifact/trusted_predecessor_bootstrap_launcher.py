"""Separately admitted predecessor launcher, outside the candidate bundle.

This file must itself be installed and byte-attested by the existing trusted
production-control path under a distinct plan/GO. It imports no candidate code
until the deployment-root enrollment chain and every bundle leaf pass.
"""
import argparse
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

ROOT = Path('/usr/local/libexec/leetplus-transition-bootstrap')
APPROVAL_ROOT = Path('/etc/leetplus-compose/approval-root.pem')
MACHINE_ID = Path('/etc/machine-id')
SOURCE_INBOX = Path('/srv/leetplus/inbox')
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
            isinstance(plan.get('bundleFiles'), dict) and REQUIRED <= set(plan['bundleFiles']) and
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
    for name, expected in plan['bundleFiles'].items():
        require(re.fullmatch(r'[A-Za-z0-9_.@/-]+', name) and '..' not in name.split('/') and
                HASH.fullmatch(expected) and digest(secure_read(bundle / name, 2 * 1024 * 1024)) == expected,
                'Admitted bootstrap module byte changed')
    require({item.name for item in enrollment.iterdir()} ==
            {'enrollment.json', 'installer-plan.json', 'installer-approval.json',
             'installer-intent.json', 'installer-receipt.json',
             'permit-root.pem', 'execution-root.pem', 'rollback-root.pem', 'noEffect-root.pem'},
            'Enrollment has an unexpected leaf')
    return {'bundleSha256': final.name, 'installerReceiptSha256': digest(canonical(receipt)),
            'entry': bundle / 'deploy' / 'transition-bootstrap' / 'rpc_host.py'}


def main(argv=None):
    parser = argparse.ArgumentParser(description='Independent predecessor bootstrap launcher')
    parser.add_argument('--bundle-sha256', required=True)
    parser.add_argument('--operation-id', required=True)
    args = parser.parse_args(argv)
    require(os.name == 'posix' and os.getuid() == 0 and HASH.fullmatch(args.bundle_sha256) and
            UUID.fullmatch(args.operation_id), 'Root exact launcher invocation required')
    verified = verify_installed_bundle(ROOT / args.bundle_sha256)
    request = Path('/var/lib/leetplus-transition-bootstrap/requests') / args.operation_id / 'request.json'
    secure_read(request, 2 * 1024 * 1024)
    environment = {**CLEAN,
        'LEETPLUS_BOOTSTRAP_INSTALL_RECEIPT_SHA256': verified['installerReceiptSha256']}
    os.execve('/usr/bin/python3', ['/usr/bin/python3', '-I', '-B', str(verified['entry']),
        '--bundle-sha256', args.bundle_sha256, '--operation-id', args.operation_id], environment)


if __name__ == '__main__':
    raise SystemExit(main())
