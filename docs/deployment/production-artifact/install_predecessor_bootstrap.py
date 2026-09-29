"""Independent public-only bundle installer entrypoint.

Invoke installed bytes with python3 -I -B. No candidate module is imported
before installed production-control generation and the complete source map
are verified. A separate exact dispatcher GO is required for apply/reconcile.
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
import stat
import subprocess
import sys
import time
import types

RELEASE = re.compile(r'[a-f0-9]{40}\Z')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z')
HASH = re.compile(r'[a-f0-9]{64}\Z')
SOURCE_PATH = 'docs/deployment/production-artifact/install_predecessor_bootstrap.py'
LAYOUT_PATH = 'docs/deployment/production-artifact/bootstrap-install-layout.json'
LAUNCHER_SOURCE_PATH = 'docs/deployment/production-artifact/trusted_predecessor_bootstrap_launcher.py'
ENTRY = Path('/usr/local/sbin/leetplus-install-predecessor-bootstrap')
VERIFIER = Path('/usr/local/libexec/leetplus/verify-installed-standalone-intro.mjs')
VERIFIER_SOURCE_PATH = 'docs/deployment/production-control-authority/verify-installed-standalone-intro.mjs'
GENERATION = Path('/srv/leetplus/production-control-generations')
INTRO_AUDIT = Path('/var/lib/leetplus-compose/standalone-introductions')
REQUEST_PREFIX = '/srv/leetplus/production-control-inbox/bootstrap-install-'
REQUEST_PARENT = Path('/srv/leetplus/production-control-inbox')
REQUEST_LEAVES = {'plan.json', 'approval.json', 'bundle.tar.gz', 'permit-root.pem',
                  'execution-root.pem', 'rollback-root.pem', 'noEffect-root.pem'}
LAYOUT = {'contract': 'LEETPLUS_BOOTSTRAP_INSTALL_LAYOUT_V1',
          'installedParent': '/usr/local/libexec/leetplus-transition-bootstrap',
          'operationStateRoot': '/var/lib/leetplus-compose',
          'pendingStateRoot': '/var/lib/leetplus-compose',
          'requestPrefix': REQUEST_PREFIX, 'controllerPointerMutation': False,
          'privateKeysOnHost': False}
BUNDLE_PATHS = (
    'deploy/leetplus-compose/a-bridge-bootstrap-authority.mjs',
    'deploy/leetplus-compose/bridge-external-successor-authority.mjs',
    'deploy/leetplus-compose/control-handoff-authority.mjs',
    'deploy/transition-bootstrap/authority.py',
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
)
HELPER_PATH = 'deploy/transition-bootstrap/bundle_installer.py'
IMPORT_ORDER = ('native_boundary', 'inventory', 'authority', 'enrollment', 'host_observer', 'bundle_installer')
AUTHORITY_FIELDS = {'helperSourceSha256', 'verifierSourceSha256',
                    'introPlanSha256', 'introReceiptSha256',
                    'generationRootManifestSha256', 'generationReceiptSha256'}
APPROVAL_ROOT = Path('/etc/leetplus-compose/approval-root.pem')
INSTALL_EFFECTS = {'bootstrapBundleOnly': True, 'publicRootsOnly': True,
                  'requestPlacement': True,
                  'controllerPointerMutation': False, 'applicationRestart': False,
                  'dataMutation': False, 'workerGrantMutation': False,
                  'timerMutation': False, 'providerEffect': False}
SIGNATURE_SCRIPT = """import crypto from 'node:crypto';import fs from 'node:fs';
const v=JSON.parse(fs.readFileSync(0,'utf8'));const k=crypto.createPublicKey(v.publicKey);
if(k.asymmetricKeyType!=='ed25519'||!crypto.verify(null,Buffer.from(v.message,'base64'),k,Buffer.from(v.signature,'base64')))process.exit(1);
process.stdout.write('INSTALL_V2_SIGNATURE_PASS');"""
CLEAN = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8',
         'LC_ALL': 'C.UTF-8', 'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1'}


def require(ok, message):
    if not ok:
        raise ValueError(message)


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def secure_read(path, maximum=2 * 1024 * 1024):
    path = Path(path)
    require(path.is_absolute(), 'Absolute trusted path required')
    for parent in (*reversed(path.parent.parents), path.parent):
        info = parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                'Trusted ancestor changed')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and before.st_nlink == 1 and
                not before.st_mode & 0o022 and 0 < before.st_size <= maximum, 'Trusted leaf metadata differs')
        raw = bytearray()
        while len(raw) <= maximum:
            chunk = os.read(fd, min(65536, maximum + 1 - len(raw)))
            if not chunk:
                break
            raw.extend(chunk)
        identity = lambda i: (i.st_dev, i.st_ino, i.st_mode, i.st_uid, i.st_nlink,
                              i.st_size, i.st_mtime_ns, i.st_ctime_ns)
        require(len(raw) == before.st_size and identity(before) == identity(os.fstat(fd)) == identity(path.lstat()),
                'Trusted bytes changed during read')
        return bytes(raw)
    finally:
        os.close(fd)


def exact_json(path, maximum=65536):
    raw = secure_read(path, maximum)
    value = json.loads(raw)
    require(raw == canonical(value), 'Canonical JSON required')
    return value, raw


@contextlib.contextmanager
def observation_locks():
    """Stdlib-only recovery observation before any candidate import."""
    import fcntl
    paths = (Path('/var/lib/leetplus-compose/standalone-install.lock'),
             Path('/var/lib/leetplus-compose/control.lock'))
    descriptors = []
    deadline = time.monotonic() + 120
    try:
        for path in paths:
            # Introduced native locks are intentionally zero-byte files;
            # check their protected metadata without the code-leaf size rule.
            for parent in (*reversed(path.parent.parents), path.parent):
                info = parent.lstat()
                require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                        'Trusted observation lock ancestor changed')
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            descriptors.append(fd)
            before = os.fstat(fd)
            require(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and
                    before.st_nlink == 1 and not before.st_mode & 0o077,
                    'Existing observation lock differs')
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    require(time.monotonic() < deadline, 'Recovery observation lock timed out')
                    time.sleep(0.01)
            after = path.lstat()
            require((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino),
                    'Recovery observation lock origin changed')
        yield
    finally:
        for fd in reversed(descriptors):
            os.close(fd)


def historical_intent_or_classification(path, request=False):
    label = 'REQUEST' if request else 'INSTALL'
    with observation_locks():
        try:
            info = path.lstat()
        except FileNotFoundError:
            return None, {'decision': label + '_INTENT_ABSENT_REQUIRES_SIGNED_RECOVERY'}
        if not stat.S_ISREG(info.st_mode):
            return None, {'decision': 'UNKNOWN_TORN_' + label + '_INTENT_REQUIRES_SIGNED_RECOVERY'}
        try:
            intent, _ = exact_json(path)
        except (OSError, ValueError, UnicodeError):
            return None, {'decision': 'UNKNOWN_TORN_' + label + '_INTENT_REQUIRES_SIGNED_RECOVERY'}
        return intent, None


def parse_manifest(raw):
    require(isinstance(raw, bytes) and len(raw) <= 65536 and raw.endswith(b'\n') and not raw.endswith(b'\n\n'),
            'Bounded canonical generation manifest required')
    entries = {}
    prior = None
    for line in raw.decode('utf-8').splitlines():
        match = re.fullmatch(r'([a-f0-9]{64})  \./([A-Za-z0-9_.@+/-]+)', line)
        require(match is not None, 'Generation manifest row differs')
        sha, path = match.groups()
        require(path not in entries and all(part not in ('', '.', '..') for part in path.split('/')),
                'Unsafe or repeated generation leaf')
        require(prior is None or prior.encode() < path.encode(), 'Generation manifest order differs')
        entries[path] = sha
        prior = path
    require(0 < len(entries) <= 256, 'Generation map bound differs')
    return entries


def validate_approval_fields(plan, envelope, at=None):
    require(isinstance(plan, dict) and plan.get('contract') == 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_PLAN' and
            plan.get('action') == 'INSTALL_INDEPENDENT_PUBLIC_ONLY_ADAPTER' and plan.get('effects') == INSTALL_EFFECTS,
            'Exact public-only install V2 plan required')
    authority = plan.get('installerAuthority')
    require(isinstance(authority, dict) and set(authority) == AUTHORITY_FIELDS and
            all(isinstance(value, str) and HASH.fullmatch(value) for value in authority.values()),
            'Signed installer authority closure required')
    require(isinstance(envelope, dict) and set(envelope) == {'approval', 'signature'}, 'Closed signed envelope required')
    approval = envelope['approval']
    require(isinstance(approval, dict) and set(approval) == {'contract', 'operationId', 'hostIdentitySha256',
            'planSha256', 'action', 'issuedAt', 'expiresAt'} and
            approval['contract'] == 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_APPROVAL' and
            approval['operationId'] == plan.get('operationId') and approval['action'] == plan['action'] and
            approval['hostIdentitySha256'] == plan.get('hostIdentitySha256') and approval['planSha256'] == digest(canonical(plan)),
            'Approval does not bind exact V2 installer plan')
    def instant(value):
        require(isinstance(value, str) and value.endswith('Z'), 'Canonical approval UTC required')
        parsed = datetime.datetime.fromisoformat(value[:-1] + '+00:00')
        require(parsed.isoformat(timespec='milliseconds').replace('+00:00', 'Z') == value,
                'Canonical millisecond approval UTC required')
        return parsed
    start, end = instant(approval['issuedAt']), instant(approval['expiresAt'])
    now = at or datetime.datetime.now(datetime.timezone.utc)
    earliest = now if at is not None else now + datetime.timedelta(seconds=30)
    require(start <= earliest and now < end and
            datetime.timedelta(0) < end - start <= datetime.timedelta(minutes=30), 'V2 approval expired or unbounded')
    signature = envelope['signature']
    require(isinstance(signature, str) and re.fullmatch(r'[A-Za-z0-9+/]{86}==', signature) and
            len(base64.b64decode(signature, validate=True)) == 64, 'Exact Ed25519 signature required')
    return approval, authority


def verify_signed_plan(plan, envelope, at=None):
    approval, authority = validate_approval_fields(plan, envelope, at)
    root = secure_read(APPROVAL_ROOT, 4096)
    require(root.startswith(b'-----BEGIN PUBLIC KEY-----\n') and root.endswith(b'-----END PUBLIC KEY-----\n') and
            b'PRIVATE' not in root, 'Existing deployment public root required')
    # Existing trusted host Node is the public signature verifier, never candidate code.
    secure_read('/usr/bin/node', 128 * 1024 * 1024)
    payload = {'publicKey': root.decode('ascii'), 'message': base64.b64encode(canonical(approval)).decode(),
               'signature': envelope['signature']}
    result = subprocess.run(['/usr/bin/node', '--input-type=module', '-e', SIGNATURE_SCRIPT],
                            input=canonical(payload), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            env=CLEAN, timeout=15, close_fds=True, check=False)
    require(result.returncode == 0 and result.stdout == b'INSTALL_V2_SIGNATURE_PASS' and not result.stderr,
            'Independent V2 install signature rejected before verifier/import')
    require(plan.get('hostIdentitySha256') == digest(secure_read('/etc/machine-id', 65536).strip()),
            'Signed V2 install host differs')
    require(plan.get('installerSourceSha256') == digest(secure_read(ENTRY)), 'Signed installed wrapper differs')
    return authority


def verify_source_map(root, manifest, self_path=ENTRY, read=secure_read):
    required = set(BUNDLE_PATHS) | {HELPER_PATH, SOURCE_PATH, LAYOUT_PATH, VERIFIER_SOURCE_PATH, LAUNCHER_SOURCE_PATH}
    require(required == set(manifest), 'Generation omits or widens bootstrap import/transport closure')
    checked = {}
    for relative in sorted(required):
        raw = read(root / relative)
        require(digest(raw) == manifest[relative], 'Bootstrap source leaf differs from admitted generation')
        checked[relative] = raw
    require(read(self_path) == checked[SOURCE_PATH], 'Installer is not the admitted installed entrypoint')
    require(checked[LAYOUT_PATH] == canonical(LAYOUT), 'Fixed bootstrap layout differs')
    return checked


def verify_generation(source_release, authority):
    require(RELEASE.fullmatch(source_release), 'Exact source release required')
    require(Path(__file__).resolve() == ENTRY, 'Only fixed installed installer may run')
    require(VERIFIER.lstat().st_mode & 0o7777 == 0o555, 'Installed generation verifier mode differs')
    verifier_raw = secure_read(VERIFIER)
    require(digest(verifier_raw) == authority['verifierSourceSha256'], 'Signed installed verifier digest differs')
    secure_read('/usr/bin/node', 128 * 1024 * 1024)
    # Execute captured signed bytes, never reopen the verifier path as code.
    # The fixed argv identity is restored for the verifier's own path attestation.
    argv_prefix = ('process.argv[1] = ' + json.dumps(str(VERIFIER)) + ';\n').encode()
    if verifier_raw.startswith(b'#!'):
        first, separator, rest = verifier_raw.partition(b'\n')
        require(separator, 'Verifier hashbang is incomplete')
        verified_program = first + b'\n' + argv_prefix + rest
    else:
        verified_program = argv_prefix + verifier_raw
    result = subprocess.run(['/usr/bin/node', '--input-type=module', '-', '--source-release', source_release], input=verified_program,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=CLEAN,
                            timeout=60, close_fds=True, check=False)
    require(result.returncode == 0 and not result.stderr and 0 < len(result.stdout) <= 16384,
            'Independent inert-generation verifier rejected')
    response = json.loads(result.stdout)
    expected_response = {'contract': 'LEETPLUS_STANDALONE_INITIAL_INTRO_VERIFICATION_V1',
        'decision': 'PASS', 'sourceRelease': source_release,
        'introPlanSha256': authority['introPlanSha256'],
        'introReceiptSha256': authority['introReceiptSha256'],
        'generationRootManifestSha256': authority['generationRootManifestSha256'],
        'generationReceiptSha256': authority['generationReceiptSha256'],
        'verifierSourceSha256': digest(verifier_raw)}
    require(response == expected_response and result.stdout == canonical(expected_response),
            'Verifier output differs from signed initial-intro lineage')
    root = GENERATION / source_release
    generation_receipt, generation_receipt_raw = exact_json(root / 'receipt.json', 65536)
    require(digest(generation_receipt_raw) == authority['generationReceiptSha256'] and
            generation_receipt.get('contract') == 'LEETPLUS_STANDALONE_INERT_GENERATION_V1_RECEIPT' and
            generation_receipt.get('sourceRelease') == source_release and
            generation_receipt.get('introPlanSha256') == authority['introPlanSha256'],
            'Signed raw inert-generation receipt differs')
    intro_operation = generation_receipt.get('operationId')
    require(isinstance(intro_operation, str) and UUID.fullmatch(intro_operation),
            'Generation receipt lacks exact intro operation')
    intro_receipt, intro_raw = exact_json(INTRO_AUDIT / intro_operation / 'receipt.json', 65536)
    require(digest(intro_raw) == authority['introReceiptSha256'] and
            intro_receipt.get('contract') == 'LEETPLUS_STANDALONE_INITIAL_INTRO_V2_RECEIPT' and
            intro_receipt.get('operationId') == intro_operation and
            intro_receipt.get('planSha256') == authority['introPlanSha256'] and
            intro_receipt.get('generationReceiptSha256') == authority['generationReceiptSha256'],
            'Signed raw initial-intro receipt differs')
    payload = root / 'payload'
    manifest_raw = secure_read(payload / 'SHA256SUMS', 65536)
    manifest = parse_manifest(manifest_raw)
    require(digest(manifest_raw) == authority['generationRootManifestSha256'],
            'Signed inert generation root manifest differs')
    checked = verify_source_map(payload, manifest)
    require(checked[VERIFIER_SOURCE_PATH] == verifier_raw, 'Generation does not bind executed minimal verifier')
    require(digest(checked[HELPER_PATH]) == authority['helperSourceSha256'], 'Signed installer helper digest differs')
    return payload, checked


def load_installer(root, checked):
    # All import bytes were verified before the first compile/exec.
    require(not set(IMPORT_ORDER) & set(sys.modules), 'Bootstrap import name collision')
    for name in IMPORT_ORDER:
        relative = 'deploy/transition-bootstrap/' + name + '.py'
        require(relative in checked, 'Import closure is not admitted')
    for name in IMPORT_ORDER:
        relative = 'deploy/transition-bootstrap/' + name + '.py'
        module = types.ModuleType(name)
        module.__file__ = str(root / relative)
        sys.modules[name] = module
        exec(compile(checked[relative], module.__file__, 'exec'), module.__dict__)
    return sys.modules['bundle_installer']


def read_request(operation_id):
    require(UUID.fullmatch(operation_id), 'Exact operation UUID required')
    root = Path(REQUEST_PREFIX + operation_id)
    info = root.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and info.st_mode & 0o7777 == 0o700,
            'Root-private request directory required')
    names = []
    with os.scandir(root) as entries:
        for entry in entries:
            names.append(entry.name)
            require(len(names) <= 7, 'Foreign installer request leaf')
    require(set(names) == REQUEST_LEAVES, 'Closed installer request required')
    plan, _ = exact_json(root / 'plan.json')
    approval, _ = exact_json(root / 'approval.json')
    archive = secure_read(root / 'bundle.tar.gz', 16 * 1024 * 1024)
    roots = {name: secure_read(root / (name + '-root.pem'), 4096)
             for name in ('permit', 'execution', 'rollback', 'noEffect')}
    require(plan.get('operationId') == operation_id, 'Request operation differs')
    return plan, approval, archive, roots


def read_captured_request():
    # No server request bytes or candidate source file are needed for first placement.
    raw = sys.stdin.buffer.read(23 * 1024 * 1024 + 1)
    require(0 < len(raw) <= 23 * 1024 * 1024, 'Bounded captured request required')
    value = json.loads(raw)
    require(isinstance(value, dict) and set(value) ==
            {'plan', 'approvalEnvelope', 'bundleTarGzBase64', 'publicRoots'} and
            raw == canonical(value), 'Canonical closed captured request required')
    plan, approval = value['plan'], value['approvalEnvelope']
    encoded = value['bundleTarGzBase64']
    require(isinstance(encoded, str) and len(encoded) <= 22 * 1024 * 1024,
            'Bounded captured archive required')
    archive = base64.b64decode(encoded, validate=True)
    require(0 < len(archive) <= 16 * 1024 * 1024 and
            base64.b64encode(archive).decode('ascii') == encoded,
            'Canonical captured archive required')
    public = value['publicRoots']
    require(isinstance(public, dict) and set(public) ==
            {'permit', 'execution', 'rollback', 'noEffect'},
            'Four captured public roots required')
    roots = {}
    for name, pem in public.items():
        require(isinstance(pem, str) and pem.isascii() and 'PRIVATE' not in pem and
                0 < len(pem) <= 4096, 'Captured public root differs')
        roots[name] = pem.encode('ascii')
    return plan, approval, archive, roots


def verify_staged_request(operation_id, plan, approval, archive, roots):
    state = Path(LAYOUT['operationStateRoot'])
    intent, intent_raw = exact_json(state / (operation_id + '.standalone-install-request.intent.json'))
    receipt, _ = exact_json(state / (operation_id + '.standalone-install-request.receipt.json'))
    files = {'plan.json': canonical(plan), 'approval.json': canonical(approval),
             'bundle.tar.gz': archive, **{name + '-root.pem': roots[name] for name in roots}}
    expected_map = {name: digest(raw) for name, raw in sorted(files.items())}
    require(isinstance(intent, dict) and set(intent) ==
            {'contract', 'operationId', 'planSha256', 'approvalSha256', 'authorizedAt', 'requestFiles'} and
            intent['contract'] == 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_REQUEST_INTENT' and
            intent['operationId'] == operation_id and
            intent['planSha256'] == digest(canonical(plan)) and
            intent['approvalSha256'] == digest(canonical(approval)) and
            intent['requestFiles'] == expected_map,
            'Installer request lacks original exact signed placement intent')
    expected_receipt = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_REQUEST_RECEIPT',
        'decision': 'STAGED_ONLY_NOT_INSTALLED', 'operationId': operation_id,
        'planSha256': digest(canonical(plan)), 'approvalSha256': digest(canonical(approval)),
        'intentSha256': digest(intent_raw), 'requestFiles': expected_map}
    require(receipt == expected_receipt, 'Installer request lacks exact placement receipt')
    authorized = datetime.datetime.fromisoformat(intent['authorizedAt'].replace('Z', '+00:00'))
    require(authorized.isoformat(timespec='milliseconds').replace('+00:00', 'Z') == intent['authorizedAt'],
            'Canonical original request authorization time required')
    validate_approval_fields(plan, approval, authorized)


def run(action, source_release, operation_id):
    require(os.name == 'posix' and os.geteuid() == 0 and sys.flags.isolated and sys.dont_write_bytecode,
            'Root isolated Python -I -B required')
    captured = action in ('stage-request', 'reconcile-request')
    plan, approval, archive, roots = (read_captured_request() if captured else read_request(operation_id))
    require(plan.get('sourceRelease') == source_release, 'Signed source release differs from CLI')
    require(plan.get('operationId') == operation_id, 'Signed operation differs from CLI')
    historical_at = None
    if action in ('reconcile', 'reconcile-request'):
        suffix = ('.standalone-install-request.intent.json' if action == 'reconcile-request'
                  else '.standalone-install.intent.json')
        flat_intent = Path(LAYOUT['operationStateRoot']) / (operation_id + suffix)
        intent, classification = historical_intent_or_classification(
            flat_intent, request=action == 'reconcile-request')
        if classification is not None:
            return classification
        expected_fields = {'contract', 'operationId', 'planSha256', 'approvalSha256', 'authorizedAt'}
        if action == 'reconcile-request':
            expected_fields.add('requestFiles')
        expected_contract = ('LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_REQUEST_INTENT'
                             if action == 'reconcile-request' else
                             'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_PLAN_INTENT')
        require(isinstance(intent, dict) and set(intent) == expected_fields and
                intent['contract'] == expected_contract and
                intent['operationId'] == operation_id and intent['planSha256'] == digest(canonical(plan)) and
                intent['approvalSha256'] == digest(canonical(approval)), 'Exact flat historical installer intent required')
        historical_at = datetime.datetime.fromisoformat(intent['authorizedAt'].replace('Z', '+00:00'))
        require(historical_at.isoformat(timespec='milliseconds').replace('+00:00', 'Z') == intent['authorizedAt'],
                'Canonical historical install UTC required')
    authority = verify_signed_plan(plan, approval, historical_at)
    if not captured:
        verify_staged_request(operation_id, plan, approval, archive, roots)
    generation_root, checked = verify_generation(source_release, authority)
    bundle_files = {path: digest(checked[path]) for path in BUNDLE_PATHS}
    require(plan.get('sourceRelease') == source_release and plan.get('bundleFiles') == bundle_files and
            plan.get('installerSourceSha256') == digest(checked[SOURCE_PATH]),
            'Plan is not exact admitted installer and closed source bundle')
    module = load_installer(generation_root, checked)
    installer = module.StandaloneBundleInstaller(
        controls_root='/usr/local/lib/leetplus-compose', inbox_root='/srv/leetplus/inbox',
        source_inbox='/srv/leetplus/inbox/' + source_release,
        installed_parent=LAYOUT['installedParent'], state_root=LAYOUT['operationStateRoot'],
        pending_state_root=LAYOUT['pendingStateRoot'],
        machine_id='/etc/machine-id', core_pointer='/usr/local/sbin/leetplus-compose',
        deployment_root='/etc/leetplus-compose/approval-root.pem',
        install_lock='/var/lib/leetplus-compose/standalone-install.lock',
        control_lock='/var/lib/leetplus-compose/control.lock', installer_source_path=ENTRY,
        request_parent=REQUEST_PARENT)
    if action == 'stage-request':
        return installer.stage_request(plan, approval, roots, archive)
    if action == 'reconcile-request':
        return installer.reconcile_request(plan, approval, roots, archive)
    if action == 'prepare':
        return installer.prepare(plan, approval, roots, archive)
    if action == 'apply':
        return installer.apply(plan, approval, roots, archive)
    require(action == 'reconcile', 'Fixed installer action required')
    return installer.reconcile(plan, approval)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Independently admitted public-only bootstrap install')
    parser.add_argument('action', choices=('stage-request', 'reconcile-request',
                                           'prepare', 'apply', 'reconcile'))
    parser.add_argument('--source-release', required=True)
    parser.add_argument('--operation-id', required=True)
    args = parser.parse_args(argv)
    print(json.dumps(run(args.action, args.source_release, args.operation_id)))


if __name__ == '__main__':
    main()
