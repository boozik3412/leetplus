"""Derive restored-copy inputs from an already authenticated off-host capsule.

Uses no network, database, provider or production process. The existing native
off-host decrypt/verifier owns authentication and private-directory ACL proof.
This adapter checks its pinned bytes and source identities, fixes the explicit
sourceReleaseSha contract, and emits an import receipt for the Linux runner.
"""
import argparse
import datetime as dt
import hashlib
import io
import json
import os
import re
import shlex
import shutil
import tarfile
import uuid
from pathlib import Path, PurePosixPath

SERVER_INPUT = '/srv/leetplus-migration/rehearsal/input'
STATE = 'system/var/lib/leetplus-compose/'
SECRETS = 'system/srv/leetplus/secrets/'


def require(value, message):
    if not value:
        raise ValueError(message)


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def sha(file):
    require(file.is_file() and not file.is_symlink() and file.stat().st_nlink == 1, 'Unsafe input file')
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def publish(file, data):
    if file.exists():
        require(file.read_bytes() == data, 'Existing derived record differs')
        return
    temporary = file.with_name(file.name + '.' + uuid.uuid4().hex + '.tmp')
    with temporary.open('xb') as out:
        os.chmod(temporary, 0o600)
        out.write(data)
        out.flush()
        os.fsync(out.fileno())
    try:
        os.link(temporary, file)
    finally:
        temporary.unlink()


def env_bytes(raw):
    values = json.loads(raw)
    require(isinstance(values, dict) and all(re.fullmatch(r'[A-Z_][A-Z_0-9]*', k) and isinstance(v, str) and not any(c in v for c in '\r\n\0') for k, v in values.items()), 'Unsafe source environment')
    return ('\n'.join(k + '=' + shlex.quote(v) for k, v in sorted(values.items())) + '\n').encode()


def derive(verification_path, capsule, preparation_input, output):
    verification_path, capsule, preparation_input, output = map(Path, [verification_path, capsule, preparation_input, output])
    verification = json.loads(verification_path.read_bytes())
    request = json.loads(preparation_input.read_bytes())
    guard = request['nativeRequest']['preparationGuard']
    require(verification.get('decision') == 'AUTHENTICATED_APPLICATION_BACKUP_PASS' and verification.get('privateAclVerified') is True, 'Authenticated off-host verifier/ACL proof required')
    private_name = Path(verification['privateDirectory'])
    private = private_name.resolve()
    require(private_name.is_absolute() and private_name.absolute() == private and not private_name.is_symlink(), 'Verified private directory path changed')
    require(capsule.resolve().parent == private and output.resolve().parent == private and not private.is_symlink(), 'Derivation must stay inside verified private directory')
    require(sha(capsule) == verification['plaintextSha256'], 'Authenticated capsule digest mismatch')
    identity = {'verificationSha256': sha(verification_path), 'capsuleSha256': sha(capsule), 'preparationInputSha256': hashlib.sha256(canonical(request)).hexdigest()}
    output.mkdir(mode=0o700, exist_ok=True)
    require(not output.is_symlink(), 'Derived output must not be a symlink')
    require(os.name == 'nt' or (output.stat().st_uid == os.getuid() and not output.stat().st_mode & 0o077), 'Derived output must be private')
    intent = output / 'derive-input.json'
    publish(intent, canonical(identity))
    result_path = output / 'restore-import.json'
    if result_path.exists():
        result = json.loads(result_path.read_bytes())
        require(result.get('contract') == 'LEETPLUS_PREPARATION_RESTORE_IMPORT_V1' and result.get('decision') == 'PASS' and result.get('backupSha256') == verification['backupSha256'] and result.get('plaintextSha256') == verification['plaintextSha256'], 'Derived receipt identity drift')
        require(result['derivationInputSha256'] == hashlib.sha256(canonical(identity)).hexdigest(), 'Derivation input drift')
        for name, key in [('leetplus.dump', 'dumpSha256'), ('globals.sql', 'globalsSha256'), ('restore-manifest.json', 'manifestSha256'), ('rehearsal-source-capsule.tar', 'sourceCapsuleSha256')]:
            require(sha(output / name) == result[key], 'Existing derived input changed')
            require(result[key.removesuffix('Sha256') + 'Path'] == SERVER_INPUT + '/' + name, 'Derived import path changed')
        require(sha(output / 'backup-verification.json') == result['backupVerificationSha256'], 'Normalized verification changed')
        return result
    with tarfile.open(capsule, 'r:') as source:
        members = {}
        for item in source:
            p = PurePosixPath(item.name)
            require(item.name and not p.is_absolute() and '..' not in p.parts and '\\' not in item.name, 'Unsafe backup member name')
            if item.isdir():
                continue
            require(item.isfile() and item.name not in members, 'Non-regular or duplicate backup member')
            members[item.name] = item

        def read(name):
            require(name in members and members[name].size <= 16 * 1024 * 1024, 'Missing or oversized metadata member')
            return source.extractfile(members[name]).read()

        active_raw = read(STATE + 'active.json')
        active = json.loads(active_raw)
        active_hash = hashlib.sha256(canonical(active)).hexdigest()
        require(active_hash == guard['activeSha256'] and active['generation'] == guard['generation'] and active['activeSlot'] == guard['activeSlot'], 'Backup active baseline drift')
        app_sha = active[active['activeSlot']]['releaseSha']
        require(verification['sourceAppSha'] == app_sha and verification['generation'] == active['generation'], 'Authenticated source release/generation drift')
        op = active['operationId']
        require(re.fullmatch(r'[a-f0-9-]{36}', op), 'Invalid source operation')
        plan_raw = read(STATE + 'operations/' + op + '/plan.json')
        plan = json.loads(plan_raw)
        require(hashlib.sha256(plan_raw).hexdigest() == active['planSha256'] and plan['operationId'] == op and plan['hostIdentitySha256'] == guard['hostIdentitySha256'], 'Source native plan/host drift')
        operation_prefix = STATE + 'operations/' + op + '/'
        rolled_back = active.get('outcome') == 'ROLLED_BACK'
        terminal_leaf = 'rolled-back.json' if rolled_back else 'final.json'
        require(operation_prefix + ('final.json' if rolled_back else 'rolled-back.json') not in members, 'Conflicting source terminal receipts')
        terminal_raw = read(operation_prefix + terminal_leaf)
        terminal = json.loads(terminal_raw)
        expected_terminal = verification.get('sourceApplicationTerminalSha256') or verification.get('sourceApplicationRollbackSha256' if rolled_back else 'sourceApplicationFinalSha256')
        require(hashlib.sha256(terminal_raw).hexdigest() == expected_terminal and terminal['planSha256'] == active['planSha256'], 'Authenticated source terminal receipt drift')
        if rolled_back:
            expected_active = {k: plan[k] for k in ['operationId', 'blue', 'green', 'dataRelease', 'dataAdmissionSha256']}
            expected_active.update(generation=plan['generation'] + 2, activeSlot=plan['previous']['activeSlot'], planSha256=active['planSha256'], outcome='ROLLED_BACK')
            require(terminal.get('contract') == 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ROLLED_BACK' and isinstance(terminal.get('reason'), str) and terminal.get('active') == active == expected_active, 'Invalid canonical source rollback')
            previous = None
            for index, phase in enumerate(['HYDRATE', 'BIND', 'SMOKE', 'CUTOVER'], 1):
                records = {kind: json.loads(read(operation_prefix + f'{index}-{phase}.{kind}.json')) for kind in ['intent', 'evidence', 'receipt']}
                intent, evidence, receipt = (records[k] for k in ['intent', 'evidence', 'receipt'])
                require(all(r.get('phase') == phase and r.get('planSha256') == active['planSha256'] for r in records.values()) and intent.get('previousReceiptSha256') == previous and receipt.get('previousReceiptSha256') == previous and receipt.get('intentSha256') == hashlib.sha256(canonical(intent)).hexdigest() and receipt.get('evidenceSha256') == hashlib.sha256(canonical(evidence)).hexdigest(), 'Invalid accepted rollback prefix')
                previous = hashlib.sha256(canonical(receipt)).hexdigest()
            postcheck = json.loads(read(operation_prefix + '5-POSTCHECK.intent.json'))
            require(postcheck.get('phase') == 'POSTCHECK' and postcheck.get('planSha256') == active['planSha256'] and postcheck.get('previousReceiptSha256') == previous and operation_prefix + '5-POSTCHECK.receipt.json' not in members, 'Invalid rollback POSTCHECK boundary')
        else:
            require(terminal['operationId'] == op, 'Authenticated source terminal operation drift')
        control_digest = plan['controlSha256']
        if control_digest != guard['controllerManifestSha256']:
            pointer = json.loads(read(STATE + 'control-handoffs/active.json'))
            require(re.fullmatch(r'[a-f0-9-]{36}', pointer['operationId']), 'Invalid source control handoff')
            prefix = STATE + 'control-handoffs/' + pointer['operationId'] + '/'
            control_receipt = read(prefix + 'receipt.json')
            require(hashlib.sha256(control_receipt).hexdigest() == pointer['receiptSha256'] == verification['controllerReceiptSha256'], 'Authenticated control receipt drift')
            handoff = json.loads(read(prefix + 'plan.json'))
            control_digest = hashlib.sha256(read(prefix + 'new-install-manifest.json')).hexdigest()
            require(handoff['newControlSha256'] == control_digest, 'Control manifest is not bound to handoff')
        require(control_digest == guard['controllerManifestSha256'], 'Backup controller differs from preparation guard')
        workers = {'bonus-ledger-worker', 'langame-daily-worker'}
        require(set(verification['workerEnvelopeHashes']) == workers and {'api-' + active['activeSlot'] + '.json', *(w + '.json' for w in workers)} <= set(verification['profileHashes']), 'Incomplete authenticated worker/profile bindings')
        policy = request['nativeRequest']['workerContinuation']
        require(policy.get('contract') == 'LEETPLUS_WORKER_CONTINUATION_V2' and
                isinstance(policy.get('originalGrantEnvelopes'), list) and
                {x['grant']['worker']: hashlib.sha256(canonical(x)).hexdigest() for x in policy['originalGrantEnvelopes']} == verification['workerEnvelopeHashes'],
                'Worker grants differ from frozen V2 policy')
        require({x['worker']: x['profileSha256'] for x in policy['profileBindings']} == {w: verification['profileHashes'][w + '.json'] for w in workers}, 'Worker profiles differ from frozen policy')
        for leaf, expected in verification['profileHashes'].items():
            require(re.fullmatch(r'[A-Za-z0-9_.-]+', leaf) and hashlib.sha256(read(SECRETS + leaf)).hexdigest() == expected, 'Authenticated profile drift')
        for worker, expected in verification['workerEnvelopeHashes'].items():
            require(worker in ['bonus-ledger-worker', 'langame-daily-worker'] and hashlib.sha256(read(STATE + 'worker-grants/' + worker + '.json')).hexdigest() == expected, 'Authenticated worker envelope drift')
        manifest = json.loads(read('manifest.json'))
        require(manifest['contract'] == 'LEETPLUS_DAILY_BACKUP_V1' and manifest['dataSource']['inRecovery'] is False, 'Expected primary daily backup manifest')
        manifest['sourceReleaseSha'] = app_sha
        for name in ['leetplus.dump', 'globals.sql']:
            require(name in members and members[name].size == manifest['files'][name]['bytes'], 'Dump member size mismatch')
            destination = output / name
            if not destination.exists():
                temporary = output / (name + '.partial')
                require(not temporary.exists(), 'Unresolved partial extraction; inspect before recovery')
                with source.extractfile(members[name]) as src, temporary.open('xb') as out:
                    os.chmod(temporary, 0o600)
                    shutil.copyfileobj(src, out, 1024 * 1024)
                    out.flush()
                    os.fsync(out.fileno())
                require(sha(temporary) == manifest['files'][name]['sha256'], 'Extracted dump checksum mismatch')
                os.link(temporary, destination)
                temporary.unlink()
            require(sha(destination) == manifest['files'][name]['sha256'], 'Derived dump digest mismatch')
        publish(output / 'restore-manifest.json', canonical(manifest))
        capsule_members = {}
        total_config_bytes = 0
        def add_config(name, data):
            nonlocal total_config_bytes
            require(total_config_bytes + len(data) <= 64 * 1024 * 1024, 'Source configuration capsule exceeds bounded memory limit')
            total_config_bytes += len(data)
            capsule_members[name] = data
        mapping = {'runtime.env': 'api-' + active['activeSlot'] + '.json', 'bonus-ledger-worker.env': 'bonus-ledger-worker.json', 'langame-daily-worker.env': 'langame-daily-worker.json'}
        for dest, src in mapping.items():
            add_config('system/etc/leetplus/' + dest, env_bytes(read(SECRETS + src)))
        for dest in ['slots/green.env', 'canary-safe.env', 'guest-user-call-live.env']:
            add_config('system/etc/leetplus/' + dest, b'')
        prefix = 'system/srv/leetplus/data/langame-sync/'
        for name in sorted(members):
            if name.startswith(prefix):
                suffix = name[len(prefix):]
                require(re.fullmatch(r'[a-f0-9-]{36}/[A-Za-z0-9_.-]{1,200}\.json', suffix), 'Unsafe discrepancy member')
                require(total_config_bytes + members[name].size <= 64 * 1024 * 1024, 'Source configuration capsule exceeds bounded memory limit')
                data = read(name)
                json.loads(data)
                add_config('system/var/lib/leetplus/langame-sync/' + suffix, data)
        # This capsule contains only bounded config/JSON, never the database dump.
        require(sum(map(len, capsule_members.values())) <= 64 * 1024 * 1024, 'Source configuration capsule exceeds bounded memory limit')
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w') as target:
            for name, data in sorted(capsule_members.items()):
                item = tarfile.TarInfo(name)
                item.size, item.mode, item.mtime = len(data), 0o400, 0
                target.addfile(item, io.BytesIO(data))
        publish(output / 'rehearsal-source-capsule.tar', buffer.getvalue())
    normalized = {**verification, 'sourceHostIdentitySha256': plan['hostIdentitySha256'], 'sourceControllerManifestSha256': control_digest, 'sourceActiveSha256': active_hash, 'sourceAppSha': app_sha, 'sourceApplicationTerminalSha256': expected_terminal, 'sourceVerificationSha256': identity['verificationSha256']}
    publish(output / 'backup-verification.json', canonical(normalized))
    result = {'contract': 'LEETPLUS_PREPARATION_RESTORE_IMPORT_V1', 'decision': 'PASS', 'backupSha256': verification['backupSha256'], 'plaintextSha256': verification['plaintextSha256'], 'completedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'derivationIdentity': identity, 'derivationInputSha256': hashlib.sha256(canonical(identity)).hexdigest(), 'backupVerificationSha256': sha(output / 'backup-verification.json')}
    for name, prefix in [('restore-manifest.json', 'manifest'), ('leetplus.dump', 'dump'), ('globals.sql', 'globals'), ('rehearsal-source-capsule.tar', 'sourceCapsule')]:
        result[prefix + 'Path'] = SERVER_INPUT + '/' + name
        result[prefix + 'Sha256'] = sha(output / name)
    publish(result_path, canonical(result))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['verification', 'capsule', 'preparation-input', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(derive(args.verification, args.capsule, args.preparation_input, args.output)))
