"""Signed inert initial introduction, never a controller/worker activation.

The separately reviewed operator first-execution fence MUST authenticate this
exact captured program before invoking it. This file has only stdlib imports;
it never imports the source archive's bootstrap modules or runs its installers.
Transport and the direct dispatcher GO are separate prerequisites.
"""
import argparse
import base64
import contextlib
import ctypes
import datetime
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tarfile
import time

PLAN = 'LEETPLUS_STANDALONE_INITIAL_INTRO_V1_PLAN'
APPROVAL = 'LEETPLUS_STANDALONE_INITIAL_INTRO_V1_APPROVAL'
INTENT = 'LEETPLUS_STANDALONE_INITIAL_INTRO_V1_INTENT'
GENERATION = 'LEETPLUS_STANDALONE_INERT_GENERATION_V1_RECEIPT'
RECEIPT = 'LEETPLUS_STANDALONE_INITIAL_INTRO_V1_RECEIPT'
SOURCE_RECEIPT = 'LEETPLUS_STANDALONE_INITIAL_SOURCE_V1'
TRANSPORT = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V1_RECEIPT'
TRANSPORT_PLAN = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V1_PLAN'
TRANSPORT_APPROVAL = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V1_APPROVAL'
TRANSPORT_INTENT = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V1_INTENT'
REPO = 'boozik3412/leetplus'
STATE = '/var/lib/leetplus-compose'
AUDITS = STATE + '/standalone-introductions'
TRANSPORTS = STATE + '/standalone-intro-transports'
GENERATIONS = '/srv/leetplus/production-control-generations'
REQUESTS = '/srv/leetplus/production-control-inbox/bootstrap-intro-'
CONTROL_LOCK = STATE + '/control.lock'
CORE = '/usr/local/sbin/leetplus-compose'
ACTIVE = STATE + '/active.json'
HANDOFF = STATE + '/control-handoffs/active.json'
PENDING = STATE + '/control-handoff.pending.json'
ROOT_PEM = '/etc/leetplus-compose/approval-root.pem'
VERIFIER = '/usr/local/libexec/leetplus/verify-installed-standalone-intro.mjs'
WRAPPER = '/usr/local/sbin/leetplus-install-predecessor-bootstrap'
LAUNCHER = '/usr/local/sbin/leetplus-trusted-predecessor-bootstrap'
LAYOUT = '/usr/local/libexec/leetplus-transition-bootstrap/bootstrap-install-layout.json'
INSTALL_LOCK = STATE + '/standalone-install.lock'
NODE = '/usr/bin/node'
CLEAN = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC'}
HASH = re.compile(r'[a-f0-9]{64}\Z')
RELEASE = re.compile(r'[a-f0-9]{40}\Z')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z')
MAX_LEAF = 2 * 1024 * 1024
MAX_ARCHIVE = 16 * 1024 * 1024
MAX_EXPANDED = 64 * 1024 * 1024
B0_RELEASE = 'b0cbf3a4f302b299762fa055f3bffe0376a91182'
B0_MANIFEST = 'f9bd049e7cc4c03f206c99c2bad92ae54b34deb28b4b6980abb1bc44432dfb75'
B0_EXECUTOR = '48aa00c4f6d3148ee210901cd572c6b5a3b3600ad4d20e3551e326ee18fcda18'
B0_INSTALLER = 'c41144f91a1cfdba3dc184a0afda5c6917fa512a9873b143b8c271edb433b9b4'
SOURCE_FILES = (
    'deploy/leetplus-compose/a-bridge-bootstrap-authority.mjs',
    'deploy/leetplus-compose/bridge-external-successor-authority.mjs',
    'deploy/leetplus-compose/control-handoff-authority.mjs',
    'deploy/transition-bootstrap/authority.py',
    'deploy/transition-bootstrap/bundle_installer.py',
    'deploy/transition-bootstrap/canonical_lineage.py',
    'deploy/transition-bootstrap/canonical_lineage_native.py',
    'deploy/transition-bootstrap/cli.mjs',
    'deploy/transition-bootstrap/enrollment.py',
    'deploy/transition-bootstrap/hard_deadline.py',
    'deploy/transition-bootstrap/host_observer.py',
    'deploy/transition-bootstrap/inventory.py',
    'deploy/transition-bootstrap/native_boundary.py',
    'deploy/transition-bootstrap/protocol.mjs',
    'deploy/transition-bootstrap/rpc_host.py',
    'docs/deployment/production-artifact/bootstrap-install-layout.json',
    'docs/deployment/production-artifact/install_predecessor_bootstrap.py',
    'docs/deployment/production-artifact/trusted_predecessor_bootstrap_launcher.py',
    'docs/deployment/production-control-authority/verify-installed-standalone-intro.mjs',
)
DEST_SOURCES = {
    VERIFIER: 'docs/deployment/production-control-authority/verify-installed-standalone-intro.mjs',
    WRAPPER: 'docs/deployment/production-artifact/install_predecessor_bootstrap.py',
    LAUNCHER: 'docs/deployment/production-artifact/trusted_predecessor_bootstrap_launcher.py',
    LAYOUT: 'docs/deployment/production-artifact/bootstrap-install-layout.json',
    INSTALL_LOCK: None,
}
MODES = {VERIFIER: 0o555, WRAPPER: 0o500, LAUNCHER: 0o500, LAYOUT: 0o400, INSTALL_LOCK: 0o600}
PARENT_MODES = {
    GENERATIONS: 0o700,
    AUDITS: 0o700,
    '/usr/local/libexec': 0o755,
    '/usr/local/libexec/leetplus': 0o755,
    '/usr/local/libexec/leetplus-transition-bootstrap': 0o755,
}
ANCHOR_DIRS = (
    '/usr/local', '/usr/local/sbin', '/usr/local/lib/leetplus-compose',
    '/srv/leetplus', '/srv/leetplus/production-control-inbox',
    STATE, '/etc/leetplus-compose',
)
EFFECTS = {
    'inertGenerationOnly': True, 'dormantEntryPointsOnly': True,
    'controllerPointerMutation': False, 'applicationRestart': False,
    'systemdUnitMutation': False, 'daemonReload': False, 'dataMutation': False,
    'workerGrantMutation': False, 'timerMutation': False, 'providerEffect': False,
    'privateKeyTransport': False,
}
PLAN_FIELDS = {
    'contract', 'operationId', 'action', 'hostIdentitySha256', 'bootId',
    'predecessorReleaseSha', 'predecessorManifestSha256', 'predecessorExecutorSha256',
    'predecessorInstallerSha256', 'oldCorePointer', 'oldActiveRecordSha256',
    'oldHandoffPointerSha256', 'pendingHandoffAbsent', 'sourceRelease', 'sourceTreeSha',
    'fullRunId', 'fullRunAttempt', 'impactReceiptSha256', 'finalAdmissionSha256',
    'composeAdmissionSha256', 'sourceArtifactId', 'sourceProducerRunId',
    'sourceProducerRunAttempt', 'sourceTransportSha256', 'sourceReceiptSha256',
    'sourceArchiveSha256', 'sourceRootManifestSha256', 'productionControlArtifactId',
    'productionControlTransportSha256', 'productionControlArchiveSha256',
    'composeArtifactId', 'composeTransportSha256', 'composeControlArchiveSha256',
    'introTransportOperationId', 'introTransportReceiptSha256',
    'introEntrySha256', 'introProgramSha256',
    'generationRootManifestSha256', 'generationSourceMapSha256',
    'generationDestination', 'dormantDestinations', 'destinationPreimages',
    'directoryPreimages', 'anchorDirectories',
    'nativeControlLockIdentity', 'effects',
}
VERIFY_SIGNATURE = """import crypto from 'node:crypto';import fs from 'node:fs';
const v=JSON.parse(fs.readFileSync(0,'utf8'));const k=crypto.createPublicKey(v.publicKey);
if(k.asymmetricKeyType!=='ed25519'||v.publicKey.includes('PRIVATE')||!crypto.verify(null,
Buffer.from(v.message,'base64'),k,Buffer.from(v.signature,'base64')))process.exit(1);
process.stdout.write('PASS');"""
TRANSPORT_LINK_FIELDS = (
    'hostIdentitySha256', 'sourceRelease', 'sourceArtifactId', 'sourceProducerRunId',
    'sourceProducerRunAttempt', 'sourceTransportSha256', 'sourceReceiptSha256',
    'sourceArchiveSha256', 'sourceRootManifestSha256', 'composeArtifactId',
    'composeTransportSha256', 'composeControlArchiveSha256', 'composeAdmissionSha256',
    'introEntrySha256', 'introProgramSha256',
)
TRANSPORT_RECEIPT_FIELDS = {'contract', 'decision', 'operationId', 'planSha256',
    'approvalSha256', 'intentSha256', *TRANSPORT_LINK_FIELDS, 'snapshotPath',
    'snapshotDevice', 'snapshotInode', 'snapshotSize', 'snapshotMode',
    'snapshotUid', 'snapshotGid', 'entrySnapshotPath', 'entrySnapshotDevice',
    'entrySnapshotInode', 'entrySnapshotSize', 'entrySnapshotMode',
    'entrySnapshotUid', 'entrySnapshotGid', 'acceptedAt'}
TRANSPORT_PLAN_FIELDS = {'contract', 'operationId', 'action', *TRANSPORT_LINK_FIELDS,
    'snapshotPath', 'snapshotSize', 'snapshotMode', 'entrySnapshotPath',
    'entrySnapshotSize', 'entrySnapshotMode', 'effects'}
TRANSPORT_EFFECTS = {'sourceSnapshotOnly': True, 'targetExecution': False,
                    'controllerPointerMutation': False, 'applicationRestart': False,
                    'systemdUnitMutation': False, 'daemonReload': False,
                    'timerMutation': False, 'workerGrantMutation': False,
                    'providerEffect': False, 'privateKeyTransport': False}


def require(test, message):
    if not test:
        raise ValueError(message)


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode('utf8')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON key')
        result[key] = value
    return result


def exact_json(raw, maximum=65536):
    require(isinstance(raw, bytes) and 0 < len(raw) <= maximum, 'Canonical JSON size differs')
    value = json.loads(raw.decode('utf8'), object_pairs_hook=_pairs,
                       parse_constant=lambda value: require(False, 'Nonfinite JSON number'))
    require(raw == canonical(value), 'Noncanonical JSON record')
    return value


def instant(value):
    require(isinstance(value, str) and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z', value),
            'Canonical millisecond UTC required')
    result = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(result.isoformat(timespec='milliseconds').replace('+00:00', 'Z') == value,
            'Invalid UTC instant')
    return result


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def safe_relative(value):
    require(isinstance(value, str) and len(value) <= 4096 and
            re.fullmatch(r'[A-Za-z0-9_.@+/-]+', value) and
            all(part not in ('', '.', '..') for part in value.split('/')),
            'Unsafe source path')
    return value


def parse_manifest(raw):
    text = raw.decode('utf8')
    require(text.endswith('\n') and not text.endswith('\n\n'), 'Noncanonical source manifest ending')
    entries = {}
    prior = None
    for line in text[:-1].split('\n'):
        match = re.fullmatch(r'([a-f0-9]{64})  \./(.+)', line)
        require(match is not None, 'Noncanonical source manifest row')
        name = safe_relative(match.group(2))
        require(name != 'SHA256SUMS' and name not in entries and
                (prior is None or prior.encode() < name.encode()), 'Unsorted/duplicate source manifest')
        entries[name] = match.group(1)
        prior = name
    require(set(entries) == set(SOURCE_FILES), 'Closed 19-leaf source manifest required')
    return entries


def source_archive(raw):
    require(0 < len(raw) <= MAX_ARCHIVE, 'Source archive exceeds bound')
    members = {}
    expanded = 0
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        for info in archive:
            require(info.isfile() and not info.islnk() and not info.issym() and
                    info.name not in members and not info.pax_headers and
                    info.mode == 0o400 and info.uid == info.gid == info.mtime == 0 and
                    info.uname == info.gname == '' and 0 < info.size <= MAX_LEAF,
                    'Noncanonical source tar member')
            safe_relative(info.name)
            reader = archive.extractfile(info)
            require(reader is not None, 'Unreadable source tar member')
            value = reader.read(MAX_LEAF + 1)
            require(len(value) == info.size, 'Short source tar member')
            members[info.name] = value
            expanded += len(value)
            require(len(members) <= 20 and expanded <= MAX_EXPANDED,
                    'Source tar cumulative bound exceeded')
    require(set(members) == set(SOURCE_FILES) | {'SHA256SUMS'}, 'Unexpected source tar closure')
    files = parse_manifest(members['SHA256SUMS'])
    require(all(sha(members[name]) == expected for name, expected in files.items()),
            'Source tar manifest hash mismatch')
    return members, files


def validate_plan(plan):
    require(isinstance(plan, dict) and set(plan) == PLAN_FIELDS and
            plan['contract'] == PLAN and plan['action'] == 'INTRODUCE_INERT_STANDALONE_TRUST' and
            UUID.fullmatch(plan['operationId']) and UUID.fullmatch(plan['bootId']) and
            UUID.fullmatch(plan['introTransportOperationId']) and
            RELEASE.fullmatch(plan['sourceRelease']) and RELEASE.fullmatch(plan['sourceTreeSha']) and
            plan['predecessorReleaseSha'] == B0_RELEASE and
            plan['predecessorManifestSha256'] == B0_MANIFEST and
            plan['predecessorExecutorSha256'] == B0_EXECUTOR and
            plan['predecessorInstallerSha256'] == B0_INSTALLER and
            plan['oldCorePointer'] == f'/usr/local/lib/leetplus-compose/{B0_RELEASE}/control.sh' and
            plan['pendingHandoffAbsent'] is True and plan['effects'] == EFFECTS and
            isinstance(plan['effects'], dict) and all(type(value) is bool for value in plan['effects'].values()) and
            plan['operationId'] != '9afc7218-4757-4f44-87e1-6096706bad44',
            'Initial intro plan identity/effect scope differs')
    for field in PLAN_FIELDS:
        if field.endswith('Sha256'):
            require(isinstance(plan[field], str) and HASH.fullmatch(plan[field]), 'Invalid intro plan digest')
    for field in ('fullRunId', 'fullRunAttempt', 'sourceArtifactId', 'sourceProducerRunId',
                  'sourceProducerRunAttempt', 'productionControlArtifactId', 'composeArtifactId'):
        require(type(plan[field]) is int and 0 < plan[field] <= 9007199254740991,
                'Invalid exact producer identity')
    require(plan['generationDestination'] == GENERATIONS + '/' + plan['sourceRelease'] and
            plan['sourceRootManifestSha256'] == plan['generationRootManifestSha256'] and
            isinstance(plan['dormantDestinations'], dict) and
            set(plan['dormantDestinations']) == set(DEST_SOURCES), 'Intro destination scope differs')
    for name, record in plan['dormantDestinations'].items():
        require(isinstance(record, dict) and set(record) == {'sha256', 'mode', 'uid', 'gid'} and
                HASH.fullmatch(record['sha256']) and type(record['mode']) is int and record['mode'] == MODES[name] and
                type(record['uid']) is int and record['uid'] == 0 and
                type(record['gid']) is int and record['gid'] == 0, 'Dormant destination identity differs')
    require(plan['dormantDestinations'][INSTALL_LOCK]['sha256'] == sha(b''),
            'Initial install lock must be empty')
    expected_absent = set(DEST_SOURCES) | {plan['generationDestination'], AUDITS + '/' + plan['operationId'],
                                          STATE + '/' + plan['operationId'] + '.standalone-intro.intent.json',
                                          GENERATIONS+'/.intro-'+plan['operationId']+'.pending'}
    require(plan['destinationPreimages'] == {name: 'ABSENT' for name in sorted(expected_absent)},
            'First introduction requires exact absent destination preimages')
    require(isinstance(plan['directoryPreimages'], dict) and
            set(plan['directoryPreimages']) == set(PARENT_MODES),
            'Unreviewed initial intro parent directory preimage')
    for name, value in plan['directoryPreimages'].items():
        require(isinstance(value, dict) and
                set(value) == {'state', 'device', 'inode', 'uid', 'gid', 'mode'} and
                value['state'] in ('ABSENT', 'EXACT') and
                type(value['uid']) is int and value['uid'] == 0 and
                type(value['gid']) is int and value['gid'] == 0 and
                type(value['mode']) is int and value['mode'] == PARENT_MODES[name] and
                ((value['state'] == 'ABSENT' and value['device'] is None and value['inode'] is None) or
                 (value['state'] == 'EXACT' and type(value['device']) is int and value['device'] > 0 and
                  type(value['inode']) is int and value['inode'] > 0)),
                'Signed initial intro parent identity differs')
    require(isinstance(plan['anchorDirectories'], dict) and
            set(plan['anchorDirectories']) == set(ANCHOR_DIRS),
            'Intro plan omits an existing trusted anchor directory')
    for name, value in plan['anchorDirectories'].items():
        require(isinstance(value, dict) and
                set(value) == {'device', 'inode', 'uid', 'gid', 'mode'} and
                all(type(value[field]) is int for field in value) and
                value['device'] > 0 and value['inode'] > 0 and value['uid'] == 0 and
                value['gid'] >= 0 and value['mode'] > 0 and not value['mode'] & 0o022,
                'Existing trusted anchor identity differs')
    lock = plan['nativeControlLockIdentity']
    require(isinstance(lock, dict) and set(lock) == {'path', 'device', 'inode', 'uid', 'gid', 'mode', 'ctimeNs'} and
            lock['path'] == CONTROL_LOCK and all(type(lock[key]) is int for key in
                ('device', 'inode', 'uid', 'gid', 'mode')) and lock['inode'] > 0 and
            isinstance(lock['ctimeNs'], str) and re.fullmatch(r'[1-9][0-9]{0,19}', lock['ctimeNs']) and
            lock['uid'] == lock['gid'] == 0 and lock['mode'] == 0o600,
            'Native control lock identity differs')
    return plan


def validate_approval(plan, envelope, pem, *, at=None, node=NODE):
    validate_plan(plan)
    require(isinstance(envelope, dict) and set(envelope) == {'approval', 'signature'},
            'Invalid initial intro approval envelope')
    approval = envelope['approval']
    require(isinstance(approval, dict) and set(approval) == {'contract', 'operationId',
        'hostIdentitySha256', 'planSha256', 'action', 'issuedAt', 'expiresAt'} and
        approval['contract'] == APPROVAL and approval['operationId'] == plan['operationId'] and
        approval['hostIdentitySha256'] == plan['hostIdentitySha256'] and
        approval['planSha256'] == sha(canonical(plan)) and approval['action'] == plan['action'],
        'Initial approval does not bind exact plan')
    now = instant(at or utc_now())
    issued, expires = instant(approval['issuedAt']), instant(approval['expiresAt'])
    require(issued <= now < expires and 0 < (expires-issued).total_seconds() <= 1800,
            'Initial approval expired or unbounded')
    require(isinstance(pem, bytes) and len(pem) <= 4096 and b'PRIVATE' not in pem and
            re.fullmatch(r'[A-Za-z0-9+/]{86}==', envelope['signature']), 'Public root/signature differs')
    value = {'publicKey': pem.decode('ascii'), 'message': base64.b64encode(canonical(approval)).decode(),
             'signature': envelope['signature']}
    check = subprocess.run([node, '--input-type=module', '-e', VERIFY_SIGNATURE],
                           input=canonical(value), stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, env=CLEAN, timeout=15, check=False)
    require(check.returncode == 0 and check.stdout == b'PASS' and not check.stderr,
            'Initial deployment-root signature rejected')
    return approval


class NativeFiles:
    """One closed filesystem-only backend. Fixture remapping is not a CLI option."""
    def __init__(self, fixture_prefix=None):
        self.fixture_prefix = Path(fixture_prefix) if fixture_prefix is not None else None

    def p(self, value):
        require(isinstance(value, str) and value.startswith('/') and
                str(Path(value)) == value and '..' not in Path(value).parts,
                'Canonical fixed absolute path required')
        return self.fixture_prefix / value.lstrip('/') if self.fixture_prefix is not None else Path(value)

    def ancestors(self, value):
        path = self.p(value)
        parents = list(reversed(path.parents))
        if self.fixture_prefix is not None:
            parents = [p for p in parents if p == self.fixture_prefix or self.fixture_prefix in p.parents]
        for parent in parents:
            info = parent.lstat()
            require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and
                    not info.st_mode & 0o022, 'Untrusted intro ancestor')

    def read(self, value, limit=MAX_LEAF):
        self.ancestors(value)
        path = self.p(value)
        before = path.lstat()
        require(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0 and
                before.st_nlink == 1 and not before.st_mode & 0o022 and
                0 <= before.st_size <= limit, 'Untrusted intro input')
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            opened = os.fstat(descriptor)
            identity = lambda st: (st.st_dev, st.st_ino, st.st_size, st.st_ctime_ns)
            require(identity(before) == identity(opened), 'Intro input changed before open')
            with os.fdopen(descriptor, 'rb', closefd=False) as stream:
                raw = stream.read(limit+1)
            after = os.fstat(descriptor)
            require(len(raw) == opened.st_size and identity(opened) == identity(after) and
                    identity(after) == identity(path.lstat()), 'Intro input changed during read')
            return raw
        finally:
            os.close(descriptor)

    def absent(self, value):
        try:
            self.p(value).lstat()
        except FileNotFoundError:
            return True
        return False

    def pending_ancestors(self, value):
        """Check absent destinations without creating any ancestor."""
        path = self.p(value)
        parents = list(reversed(path.parents))
        if self.fixture_prefix is not None:
            parents = [p for p in parents if p == self.fixture_prefix or self.fixture_prefix in p.parents]
        missing = False
        for parent in parents:
            try:
                info = parent.lstat()
            except FileNotFoundError:
                missing = True
                continue
            require(not missing and stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and
                    not info.st_mode & 0o022, 'Untrusted nearest intro ancestor')

    def reject_mounts(self, roots):
        content = self.p('/proc/self/mountinfo').read_bytes()
        require(0 < len(content) <= 2*1024*1024 and content.endswith(b'\n'),
                'Incomplete bounded mount inventory')
        for line in content.decode('utf8').splitlines():
            fields = line.split(' ')
            require(len(fields) >= 7 and '-' in fields, 'Malformed mount inventory')
            mount = fields[4]
            for before, after in ((r'\040', ' '), (r'\011', '\t'), (r'\012', '\n'), (r'\134', '\\')):
                mount = mount.replace(before, after)
            require(not any(mount == root or mount.startswith(root+'/') for root in roots),
                    'Exact or nested intro destination mount')

    def sync(self, value):
        descriptor = os.open(self.p(value), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try: os.fsync(descriptor)
        finally: os.close(descriptor)

    def make_directory(self, value, mode=0o700):
        self.ancestors(value)
        require(self.absent(value), 'Existing intro directory is not adopted')
        os.mkdir(self.p(value), mode)
        os.chown(self.p(value), 0, 0)
        os.chmod(self.p(value), mode)
        info = self.p(value).lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0 and
                stat.S_IMODE(info.st_mode) == mode,
                'Published intro directory identity differs')
        self.sync(value)
        self.sync(str(Path(value).parent))

    def ensure_parent(self, value):
        parent = str(Path(value).parent)
        self.ancestors(value)
        st = self.p(parent).lstat()
        require(stat.S_ISDIR(st.st_mode) and st.st_uid == 0 and not st.st_mode & 0o022,
                'Untrusted intro parent')

    def check_directory_preimages(self, plan):
        for name in sorted(PARENT_MODES, key=lambda value: (value.count('/'), value)):
            self.pending_ancestors(name)
            expected = plan['directoryPreimages'][name]
            if expected['state'] == 'ABSENT':
                require(self.absent(name), 'Unexpected preexisting intro-owned parent')
            else:
                info = self.p(name).lstat()
                require(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0 and
                        stat.S_IMODE(info.st_mode) == PARENT_MODES[name] and
                        (info.st_dev, info.st_ino) == (expected['device'], expected['inode']),
                        'Existing intro parent mode/owner differs')

    def create_approved_directories(self, plan):
        for name in sorted(PARENT_MODES, key=lambda value: (value.count('/'), value)):
            if plan['directoryPreimages'][name]['state'] == 'ABSENT':
                self.make_directory(name, PARENT_MODES[name])
            else:
                info = self.p(name).lstat()
                require(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0 and
                        stat.S_IMODE(info.st_mode) == PARENT_MODES[name] and
                        (info.st_dev, info.st_ino) ==
                        (plan['directoryPreimages'][name]['device'],
                         plan['directoryPreimages'][name]['inode']),
                        'Approved existing intro parent changed')

    def installed_parent_map(self):
        observed = {}
        for name in sorted(PARENT_MODES, key=lambda value: value.encode()):
            info = self.p(name).lstat()
            require(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0 and
                    stat.S_IMODE(info.st_mode) == PARENT_MODES[name],
                    'Installed parent directory drift')
            observed[name] = {'device': info.st_dev, 'inode': info.st_ino,
                              'uid': info.st_uid, 'gid': info.st_gid,
                              'mode': stat.S_IMODE(info.st_mode)}
        return observed

    def installed_anchor_map(self, plan):
        observed = {}
        for name in sorted(ANCHOR_DIRS, key=lambda value: value.encode()):
            info = self.p(name).lstat()
            require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and
                    not stat.S_ISLNK(info.st_mode) and not info.st_mode & 0o022,
                    'Existing trusted anchor changed type or writability')
            actual = {'device': info.st_dev, 'inode': info.st_ino,
                      'uid': info.st_uid, 'gid': info.st_gid,
                      'mode': stat.S_IMODE(info.st_mode)}
            require(actual == plan['anchorDirectories'][name],
                    'Existing trusted anchor identity drift')
            observed[name] = actual
        return observed

    def publish(self, value, raw, mode):
        self.ancestors(value)
        require(self.absent(value), 'Intro publication cannot replace an existing entry')
        descriptor = os.open(self.p(value), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
        try:
            os.fchown(descriptor, 0, 0)
            os.fchmod(descriptor, mode)
            offset = 0
            while offset < len(raw):
                count = os.write(descriptor, raw[offset:])
                require(count > 0, 'Short intro write')
                offset += count
            os.fsync(descriptor)
        finally: os.close(descriptor)
        self.sync(str(Path(value).parent))
        require(self.read(value, max(MAX_LEAF, len(raw))) == raw, 'Intro post-write bytes differ')

    def rename_new(self, old, new):
        self.ancestors(old); self.ancestors(new)
        libc = ctypes.CDLL(None, use_errno=True)
        rename = libc.renameat2
        rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
        if rename(-100, os.fsencode(self.p(old)), -100, os.fsencode(self.p(new)), 1) != 0:
            error = ctypes.get_errno()
            raise OSError(error, os.strerror(error), str(self.p(new)))
        self.sync(str(Path(new).parent))


class InitialIntro:
    def __init__(self, *, files=None, node=NODE, expected_plan_sha256=None,
                 expected_approval_sha256=None, captured_plan=None,
                 captured_approval=None):
        require(os.name == 'posix' and os.getuid() == 0, 'Linux root introduction required')
        self.files = files or NativeFiles()
        self.node = node
        self.expected_plan_sha256 = expected_plan_sha256
        self.expected_approval_sha256 = expected_approval_sha256
        require(isinstance(captured_plan, bytes) and isinstance(captured_approval, bytes) and
                0 < len(captured_plan) <= 65536 and 0 < len(captured_approval) <= 65536,
                'Protected same-buffer authorization bytes required')
        require(sha(captured_plan) == expected_plan_sha256 and
                sha(captured_approval) == expected_approval_sha256,
                'Captured operator authorization digest differs')
        exact_json(captured_plan); exact_json(captured_approval)
        self.captured_plan = captured_plan
        self.captured_approval = captured_approval

    @contextlib.contextmanager
    def control_lock(self, plan, shared=False):
        import fcntl
        f = self.files
        f.ancestors(CONTROL_LOCK)
        descriptor = os.open(f.p(CONTROL_LOCK), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            st = os.fstat(descriptor)
            expected = plan['nativeControlLockIdentity']
            require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and
                    (st.st_dev, st.st_ino, st.st_uid, st.st_gid, stat.S_IMODE(st.st_mode)) ==
                    (expected['device'], expected['inode'], 0, 0, 0o600) and
                    str(st.st_ctime_ns) == expected['ctimeNs'],
                    'Native lock preimage differs')
            deadline = time.monotonic()+120
            while True:
                try:
                    fcntl.flock(descriptor, (fcntl.LOCK_SH if shared else fcntl.LOCK_EX) | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    require(time.monotonic() < deadline, 'Native lock wait timed out')
                    time.sleep(0.01)
            latest = f.p(CONTROL_LOCK).lstat()
            require((latest.st_dev, latest.st_ino, latest.st_ctime_ns) ==
                    (st.st_dev, st.st_ino, st.st_ctime_ns),
                    'Native lock origin changed')
            yield
        finally:
            os.close(descriptor)

    def _inputs(self, operation):
        require(UUID.fullmatch(operation), 'Exact intro UUID required')
        root = REQUESTS+operation
        expected = {'source.tar.gz', 'source-receipt.json',
                    'final-admission.json', 'docker-admission.json', 'intro-entry.mjs',
                    'intro-program.py',
                    'transport-receipt.json'}
        require({p.name for p in self.files.p(root).iterdir()} == expected,
                'Intro request input set differs')
        raw = {name: self.files.read(root+'/'+name, MAX_ARCHIVE if name == 'source.tar.gz' else MAX_LEAF)
               for name in expected}
        raw['plan.json'] = self.captured_plan
        raw['approval.json'] = self.captured_approval
        plan = validate_plan(exact_json(raw['plan.json']))
        envelope = exact_json(raw['approval.json'])
        require(sha(raw['plan.json']) == self.expected_plan_sha256 and
                sha(raw['approval.json']) == self.expected_approval_sha256,
                'Intro request changed after protected first-execution gate')
        require(plan['operationId'] == operation and sha(raw['intro-program.py']) == plan['introProgramSha256'],
                'Intro request program/operation differs')
        require(sha(raw['intro-entry.mjs']) == plan['introEntrySha256'],
                'Protected operator entry differs from signed intro plan')
        pem = self.files.read(ROOT_PEM, 4096)
        validate_approval(plan, envelope, pem, node=self.node)
        require(sha(raw['source.tar.gz']) == plan['sourceArchiveSha256'] and
                sha(raw['source-receipt.json']) == plan['sourceReceiptSha256'] and
                sha(raw['final-admission.json']) == plan['finalAdmissionSha256'] and
                sha(raw['docker-admission.json']) == plan['composeAdmissionSha256'] and
                sha(raw['transport-receipt.json']) == plan['introTransportReceiptSha256'],
                'Intro input differs from signed raw artifact/transport identities')
        members, files = source_archive(raw['source.tar.gz'])
        require(sha(members['SHA256SUMS']) == plan['generationRootManifestSha256'] and
                sha(canonical(files)) == plan['generationSourceMapSha256'],
                'Intro source closure differs from signed manifest/map')
        source = exact_json(raw['source-receipt.json'])
        require(source.get('contract') == SOURCE_RECEIPT and
                source.get('decision') == 'SOURCE_BYTES_ONLY_NOT_AUTHORIZATION' and
                source.get('repository') == REPO and source.get('sourceRelease') == plan['sourceRelease'] and
                source.get('sourceTreeSha') == plan['sourceTreeSha'] and
                source.get('workflow') == 'transition-bootstrap-validation.yml' and
                source.get('event') == 'push' and source.get('ref') == 'refs/heads/main' and
                source.get('runId') == str(plan['sourceProducerRunId']) and
                source.get('runAttempt') == plan['sourceProducerRunAttempt'] and
                source.get('sourceArchiveSha256') == plan['sourceArchiveSha256'] and
                source.get('generationRootManifestSha256') == plan['generationRootManifestSha256'] and
                source.get('generationSourceMapSha256') == plan['generationSourceMapSha256'] and
                source.get('fileCount') == 19 and source.get('sourceFiles') == files,
                'Standalone source receipt/producer differs')
        final = exact_json(raw['final-admission.json'])
        compose = exact_json(raw['docker-admission.json'])
        require(final.get('schemaVersion') == 2 and final.get('admission') == 'PASS' and
                final.get('releaseSha') == plan['sourceRelease'] and final.get('repository') == REPO and
                final.get('runId') == str(plan['fullRunId']) and
                final.get('runAttempt') == str(plan['fullRunAttempt']) and
                final.get('workflowSha') == plan['sourceRelease'] and
                final.get('workflowRef') == REPO+'/.github/workflows/ci.yml@refs/heads/main' and
                final.get('effectiveLane') == 'L2_SCHEMA_SECURITY' and
                final.get('impactReceiptSha256') == plan['impactReceiptSha256'] and
                final.get('productionControlArtifactId') == str(plan['productionControlArtifactId']) and
                final.get('productionControlArchiveSha256') == plan['productionControlArchiveSha256'] and
                final.get('productionControlTransportDigest') == plan['productionControlTransportSha256'] and
                compose.get('contract') == 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION' and
                compose.get('decision') == 'PASS' and compose.get('releaseSha') == plan['sourceRelease'] and
                compose.get('repository') == REPO and compose.get('event') == 'push' and
                compose.get('ref') == 'refs/heads/main' and
                compose.get('runId') == str(plan['fullRunId']) and
                compose.get('runAttempt') == str(plan['fullRunAttempt']) and
                compose.get('parentAdmissionSha256') == plan['finalAdmissionSha256'] and
                compose.get('parentRunAttempt') == str(plan['fullRunAttempt']) and
                compose.get('effectiveLane') == 'L2_SCHEMA_SECURITY' and
                compose.get('impactReceiptSha256') == plan['impactReceiptSha256'] and
                compose.get('controlArchiveSha256') == plan['composeControlArchiveSha256'],
                'Final/Compose exact-main admission lineage differs')
        transport = exact_json(raw['transport-receipt.json'])
        require(isinstance(transport, dict) and set(transport) == TRANSPORT_RECEIPT_FIELDS and
                transport.get('contract') == TRANSPORT and transport.get('decision') == 'PASS' and
                transport.get('operationId') == plan['introTransportOperationId'] and
                transport.get('sourceRelease') == plan['sourceRelease'] and
                all(transport[name] == plan[name] for name in TRANSPORT_LINK_FIELDS),
                'Initial protected transport receipt differs')
        self._transport_chain(plan, transport, raw['transport-receipt.json'], pem,
                              raw['intro-program.py'], operation)
        for destination, source_name in DEST_SOURCES.items():
            wanted = sha(members[source_name]) if source_name else sha(b'')
            require(plan['dormantDestinations'][destination]['sha256'] == wanted,
                    'Dormant destination source differs from signed map')
        return plan, envelope, pem, raw, members, files

    def _transport_chain(self, plan, receipt, receipt_raw, pem, program, operation):
        f = self.files
        audit = TRANSPORTS+'/'+plan['introTransportOperationId']
        require({p.name for p in f.p(audit).iterdir()} ==
                {'plan.json', 'approval.json', 'intent.json', 'receipt.json'},
                'Initial transport audit closure differs')
        raw_plan = f.read(audit+'/plan.json', 65536)
        raw_approval = f.read(audit+'/approval.json', 65536)
        raw_intent = f.read(audit+'/intent.json', 65536)
        require(f.read(audit+'/receipt.json', 65536) == receipt_raw,
                'Transport receipt request differs from immutable audit')
        original = exact_json(raw_plan)
        envelope = exact_json(raw_approval)
        intent = exact_json(raw_intent)
        require(isinstance(original, dict) and set(original) == TRANSPORT_PLAN_FIELDS and
                original['contract'] == TRANSPORT_PLAN and
                original['action'] == 'STAGE_SIGNED_INITIAL_INTRO_SOURCE_ONLY' and
                original['operationId'] == plan['introTransportOperationId'] and
                all(original[name] == plan[name] for name in TRANSPORT_LINK_FIELDS) and
                original['effects'] == TRANSPORT_EFFECTS and
                all(type(v) is bool for v in original['effects'].values()),
                'Initial transport plan/effect scope differs')
        require(set(envelope) == {'approval', 'signature'} and isinstance(envelope['approval'], dict),
                'Initial transport approval envelope differs')
        approval = envelope['approval']
        require(set(approval) == {'contract', 'operationId', 'hostIdentitySha256',
                                 'planSha256', 'action', 'issuedAt', 'expiresAt'} and
                approval['contract'] == TRANSPORT_APPROVAL and
                approval['operationId'] == original['operationId'] and
                approval['hostIdentitySha256'] == plan['hostIdentitySha256'] and
                approval['planSha256'] == sha(raw_plan) and approval['action'] == original['action'],
                'Initial transport approval does not bind exact plan')
        require(set(intent) == {'contract', 'operationId', 'planSha256', 'approvalSha256', 'authorizedAt'} and
                intent['contract'] == TRANSPORT_INTENT and intent['operationId'] == original['operationId'] and
                intent['planSha256'] == sha(raw_plan) and intent['approvalSha256'] == sha(raw_approval) and
                receipt['planSha256'] == sha(raw_plan) and receipt['approvalSha256'] == sha(raw_approval) and
                receipt['intentSha256'] == sha(raw_intent), 'Initial transport intent/receipt lineage differs')
        issued, expires = instant(approval['issuedAt']), instant(approval['expiresAt'])
        require(issued <= instant(intent['authorizedAt']) <= instant(receipt['acceptedAt']) < expires and
                0 < (expires-issued).total_seconds() <= 1800,
                'Initial transport acceptance was not timely')
        value = {'publicKey': pem.decode('ascii'),
                 'message': base64.b64encode(canonical(approval)).decode(),
                 'signature': envelope['signature']}
        result = subprocess.run([self.node, '--input-type=module', '-e', VERIFY_SIGNATURE],
                                input=canonical(value), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env=CLEAN, timeout=15, check=False)
        require(result.returncode == 0 and result.stdout == b'PASS' and not result.stderr,
                'Initial transport public signature rejected')
        snapshot = REQUESTS+operation+'/intro-program.py'
        info = f.p(snapshot).lstat()
        entry_snapshot = REQUESTS+operation+'/intro-entry.mjs'
        entry_info = f.p(entry_snapshot).lstat()
        require(receipt['snapshotPath'] == original['snapshotPath'] == snapshot and
                receipt['snapshotSize'] == original['snapshotSize'] == len(program) and
                receipt['snapshotMode'] == original['snapshotMode'] == 0o400 and
                (info.st_dev, info.st_ino, info.st_size, info.st_uid, info.st_gid,
                 stat.S_IMODE(info.st_mode)) ==
                (receipt['snapshotDevice'], receipt['snapshotInode'], receipt['snapshotSize'],
                 0, 0, 0o400) and receipt['snapshotUid'] == receipt['snapshotGid'] == 0 and
                sha(program) == receipt['introProgramSha256'],
                'Initial protected same-snapshot transport identity changed')
        require(receipt['entrySnapshotPath'] == original['entrySnapshotPath'] == entry_snapshot and
                receipt['entrySnapshotSize'] == original['entrySnapshotSize'] ==
                len(f.read(entry_snapshot)) and
                receipt['entrySnapshotMode'] == original['entrySnapshotMode'] == 0o400 and
                (entry_info.st_dev, entry_info.st_ino, entry_info.st_size,
                 entry_info.st_uid, entry_info.st_gid, stat.S_IMODE(entry_info.st_mode)) ==
                (receipt['entrySnapshotDevice'], receipt['entrySnapshotInode'],
                 receipt['entrySnapshotSize'], 0, 0, 0o400) and
                receipt['entrySnapshotUid'] == receipt['entrySnapshotGid'] == 0 and
                sha(f.read(entry_snapshot)) == receipt['introEntrySha256'],
                'Protected Node entry snapshot identity changed')

    def _preimage(self, plan):
        f = self.files
        require(sha(f.read('/etc/machine-id', 65536).strip()) == plan['hostIdentitySha256'],
                'Intro host identity drift')
        boot = f.p('/proc/sys/kernel/random/boot_id').read_text().strip()
        require(boot == plan['bootId'], 'Intro boot identity drift')
        core = f.p(CORE)
        require(core.is_symlink() and core.lstat().st_uid == 0 and
                os.readlink(core) == plan['oldCorePointer'], 'Serving predecessor pointer drift')
        old = f'/usr/local/lib/leetplus-compose/{B0_RELEASE}'
        manifest_raw = f.read(old+'/install-manifest.json', 65536)
        require(sha(manifest_raw) == B0_MANIFEST, 'Accepted b0 manifest drift')
        manifest = exact_json(manifest_raw)
        require(manifest.get('releaseSha') == B0_RELEASE and isinstance(manifest.get('files'), dict),
                'Accepted b0 manifest identity differs')
        for name, expected in manifest['files'].items():
            require(re.fullmatch(r'[A-Za-z0-9_.@-]+', name) and HASH.fullmatch(expected) and
                    sha(f.read(old+'/'+name)) == expected, 'Accepted predecessor full file map drift')
        require(sha(f.read(old+'/control_handoff.py')) == B0_EXECUTOR and
                sha(f.read(old+'/install-control.py')) == B0_INSTALLER and
                sha(f.read(ACTIVE, 65536)) == plan['oldActiveRecordSha256'] and
                sha(f.read(HANDOFF, 65536)) == plan['oldHandoffPointerSha256'] and
                f.absent(PENDING), 'Native predecessor active/pending preimage drift')
        return sha(canonical({'oldCorePointer': plan['oldCorePointer'],
            'predecessorManifestSha256': plan['predecessorManifestSha256'],
            'oldActiveRecordSha256': plan['oldActiveRecordSha256'],
            'oldHandoffPointerSha256': plan['oldHandoffPointerSha256'],
            'pendingHandoffAbsent': True}))

    def prepare(self, operation):
        plan, envelope, pem, raw, members, files = self._inputs(operation)
        with self.control_lock(plan, shared=True):
            self._preimage(plan)
            self.files.installed_anchor_map(plan)
            for destination in plan['destinationPreimages']:
                self.files.pending_ancestors(destination)
            self.files.check_directory_preimages(plan)
            self.files.reject_mounts(set(plan['destinationPreimages']) | set(plan['directoryPreimages']))
            require(all(self.files.absent(p) for p in plan['destinationPreimages']),
                    'Initial intro destination already exists')
        return {'decision': 'PREPARED_NOT_AUTHORIZATION', 'operationId': operation,
                'planSha256': sha(raw['plan.json'])}

    def apply(self, operation):
        plan, envelope, pem, raw, members, files = self._inputs(operation)
        f = self.files
        with self.control_lock(plan):
            preimage = self._preimage(plan)
            f.installed_anchor_map(plan)
            require(all(f.absent(p) for p in plan['destinationPreimages']),
                    'Existing intro entry/intent requires read-only reconciliation')
            for destination in plan['destinationPreimages']:
                f.pending_ancestors(destination)
            f.check_directory_preimages(plan)
            f.reject_mounts(set(plan['destinationPreimages']) | set(plan['directoryPreimages']))
            validate_approval(plan, envelope, pem, node=self.node)
            authorized = utc_now()
            intent = {'contract': INTENT, 'operationId': operation,
                      'planSha256': sha(raw['plan.json']), 'approvalSha256': sha(raw['approval.json']),
                      'authorizedAt': authorized}
            # The native state root already exists; no new parent precedes this intent.
            flat_intent = STATE+'/'+operation+'.standalone-intro.intent.json'
            f.publish(flat_intent, canonical(intent), 0o400)
            f.create_approved_directories(plan)
            audit = AUDITS+'/'+operation
            f.ensure_parent(audit); f.make_directory(audit)
            for name, content in (('plan.json', raw['plan.json']), ('approval.json', raw['approval.json']),
                                  ('intent.json', canonical(intent))):
                f.publish(audit+'/'+name, content, 0o400)
            target = plan['generationDestination']
            staging = GENERATIONS+'/.intro-'+operation+'.pending'
            f.ensure_parent(staging); f.make_directory(staging)
            f.make_directory(staging+'/payload')
            directories = sorted({str(Path(name).parent) for name in members if '/' in name},
                                 key=lambda value: (value.count('/'), value))
            expanded = set()
            for value in directories:
                parts = Path(value).parts
                for length in range(1, len(parts)+1):
                    parent = '/'.join(parts[:length])
                    if parent not in expanded:
                        f.make_directory(staging+'/payload/'+parent)
                        expanded.add(parent)
            for name in sorted(members):
                validate_approval(plan, envelope, pem, node=self.node)
                f.publish(staging+'/payload/'+name, members[name], 0o400)
            installed_at = utc_now()
            generation = {'contract': GENERATION, 'decision': 'PASS', 'operationId': operation,
                'sourceRelease': plan['sourceRelease'], 'sourceTreeSha': plan['sourceTreeSha'],
                'sourceReceiptSha256': plan['sourceReceiptSha256'],
                'introPlanSha256': sha(raw['plan.json']),
                'introApprovalSha256': sha(raw['approval.json']), 'introIntentSha256': sha(canonical(intent)),
                'generationRootManifestSha256': plan['generationRootManifestSha256'],
                'generationSourceMapSha256': plan['generationSourceMapSha256'],
                'finalAdmissionSha256': plan['finalAdmissionSha256'],
                'composeAdmissionSha256': plan['composeAdmissionSha256'], 'installedAt': installed_at}
            f.publish(staging+'/receipt.json', canonical(generation), 0o400)
            f.publish(staging+'/source-receipt.json', raw['source-receipt.json'], 0o400)
            validate_approval(plan, envelope, pem, node=self.node)
            require(self._preimage(plan) == preimage, 'Predecessor drift before generation publication')
            f.rename_new(staging, target)
            for destination, source_name in DEST_SOURCES.items():
                validate_approval(plan, envelope, pem, node=self.node)
                f.ensure_parent(destination)
                f.publish(destination, members[source_name] if source_name else b'', MODES[destination])
            require(self._preimage(plan) == preimage, 'Serving predecessor changed during inert intro')
            validate_approval(plan, envelope, pem, node=self.node)
            accepted_at = utc_now()
            validate_approval(plan, envelope, pem, at=accepted_at, node=self.node)
            parent_map_sha = sha(canonical(f.installed_parent_map()))
            anchor_map_sha = sha(canonical(f.installed_anchor_map(plan)))
            receipt = {'contract': RECEIPT, 'decision': 'PASS', 'operationId': operation,
                'planSha256': sha(raw['plan.json']), 'approvalSha256': sha(raw['approval.json']),
                'intentSha256': sha(canonical(intent)), 'generationReceiptSha256': sha(canonical(generation)),
                'generationRootManifestSha256': plan['generationRootManifestSha256'],
                'installedDestinationsSha256': sha(canonical({name: plan['dormantDestinations'][name]
                    for name in sorted(plan['dormantDestinations'], key=lambda value: value.encode())})),
                'installedParentDirectoriesSha256': parent_map_sha,
                'installedAnchorDirectoriesSha256': anchor_map_sha,
                'predecessorPostimageSha256': preimage, 'acceptedAt': accepted_at}
            f.publish(audit+'/receipt.json', canonical(receipt), 0o400)
        return {'decision': 'INTRODUCED_INERT_ONLY_NOT_ACTIVE', 'operationId': operation,
                'generationReceiptSha256': sha(canonical(generation)),
                'introReceiptSha256': sha(canonical(receipt))}

    def reconcile(self, operation):
        require(UUID.fullmatch(operation), 'Exact existing intro UUID required')
        f = self.files
        audit = AUDITS+'/'+operation
        if f.absent(audit+'/receipt.json'):
            return {'decision': 'RECOVERY_REQUIRED', 'operationId': operation,
                    'reason': 'No terminal introduction receipt; no effect replay permitted'}
        raw = f.read(audit+'/plan.json', 65536)
        plan = validate_plan(exact_json(raw))
        require(sha(raw) == self.expected_plan_sha256 and
                sha(f.read(audit+'/approval.json', 65536)) == self.expected_approval_sha256,
                'Historical intro request changed after protected gate')
        receipt_raw = f.read(audit+'/receipt.json', 65536)
        receipt = exact_json(receipt_raw)
        require(plan['operationId'] == operation and receipt.get('operationId') == operation and
                receipt.get('planSha256') == sha(raw), 'Existing intro lineage differs')
        # No writes and no fresh preimage/approval extension. The narrow verifier
        # validates the original timely intent and complete installed postimage.
        return {'decision': 'EXISTING_RECEIPT_REQUIRES_INDEPENDENT_VERIFIER',
                'operationId': operation, 'sourceRelease': plan['sourceRelease'],
                'introReceiptSha256': sha(receipt_raw)}


def main():
    require(os.name == 'posix' and os.getuid() == 0, 'Fixed Linux root initial intro invocation required')
    require(set(os.environ) <= set(CLEAN), 'Initial intro requires a fixed clean environment')
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=('prepare', 'apply', 'reconcile'), required=True)
    parser.add_argument('--operation-id', required=True)
    parser.add_argument('--expected-plan-sha256', required=True)
    parser.add_argument('--expected-approval-sha256', required=True)
    parser.add_argument('--captured-plan-base64', required=True)
    parser.add_argument('--captured-approval-base64', required=True)
    args = parser.parse_args()
    # A hard parent/runtime timeout is additionally part of the protected
    # operator first-execution transcript; this in-process bound is fail-closed.
    def expired(signum, frame):
        raise TimeoutError('Initial introduction deadline exceeded; reconcile only')
    signal.signal(signal.SIGALRM, expired)
    signal.alarm(180)
    try:
        require(HASH.fullmatch(args.expected_plan_sha256) and
                HASH.fullmatch(args.expected_approval_sha256), 'Expected captured request digest required')
        require(len(args.captured_plan_base64) <= 87384 and
                len(args.captured_approval_base64) <= 87384,
                'Captured operator authorization encoding exceeds bound')
        captured_plan = base64.b64decode(args.captured_plan_base64, validate=True)
        captured_approval = base64.b64decode(args.captured_approval_base64, validate=True)
        result = getattr(InitialIntro(expected_plan_sha256=args.expected_plan_sha256,
                                      expected_approval_sha256=args.expected_approval_sha256,
                                      captured_plan=captured_plan,
                                      captured_approval=captured_approval),
                         args.mode)(args.operation_id)
        sys.stdout.buffer.write(canonical(result))
    finally:
        signal.alarm(0)


if __name__ == '__main__':
    main()
