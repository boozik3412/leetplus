"""Root-only RPC adapter for the independently admitted Node protocol child.

The standalone installer and trusted dispatcher must attest this file before
invocation. No target controller implementation is imported before the narrow
permit; live observations execute only the attested serving predecessor.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import select
import signal
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True


def _early_source_gate():
    """Run before any effect-capable sibling import on a native invocation."""
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--bundle-sha256', required=True)
    parser.add_argument('--operation-id', required=True)
    args = parser.parse_args()
    if os.name != 'posix' or os.getuid() != 0 or sys.flags.isolated != 1 or \
            not re.fullmatch(r'[a-f0-9]{64}', args.bundle_sha256):
        raise ValueError('Exact root installed bundle required before imports')
    root = Path('/usr/local/libexec/leetplus-transition-bootstrap') / args.bundle_sha256
    bundle = root / 'bundle'
    source = bundle / 'deploy' / 'transition-bootstrap'
    expected_script = source / 'rpc_host.py'
    if Path(__file__).resolve(strict=True) != expected_script or Path(__file__).is_symlink():
        raise ValueError('Unadmitted Python bootstrap source path')
    for directory in (*reversed(expected_script.parents), root / 'enrollment'):
        info = directory.lstat()
        if not directory.is_dir() or directory.is_symlink() or info.st_uid != 0 or info.st_mode & 0o022:
            raise ValueError('Untrusted installed bootstrap directory')
    enrollment_path = root / 'enrollment' / 'enrollment.json'
    info = enrollment_path.lstat()
    if not enrollment_path.is_file() or enrollment_path.is_symlink() or info.st_uid != 0 or \
            info.st_nlink != 1 or info.st_mode & 0o022 or info.st_size > 65536:
        raise ValueError('Untrusted pre-import enrollment descriptor')
    enrollment = json.loads(enrollment_path.read_bytes())
    required = ('rpc_host.py', 'hard_deadline.py', 'native_boundary.py', 'inventory.py', 'authority.py',
        'enrollment.py', 'host_observer.py', 'canonical_lineage.py', 'canonical_lineage_native.py')
    expected_files = enrollment.get('bundleFiles')
    if not isinstance(expected_files, dict) or enrollment.get('bundleSha256') != args.bundle_sha256:
        raise ValueError('Pre-import admitted bundle descriptor differs')
    if not re.fullmatch(r'[a-f0-9]{64}', enrollment.get('installerReceiptSha256', '')) or \
            os.environ.get('LEETPLUS_BOOTSTRAP_INSTALL_RECEIPT_SHA256') != enrollment['installerReceiptSha256']:
        raise ValueError('Independent trusted launcher receipt is absent')
    for leaf in required:
        path = source / leaf
        item = path.lstat()
        relative = 'deploy/transition-bootstrap/' + leaf
        if not path.is_file() or path.is_symlink() or item.st_uid != 0 or item.st_nlink != 1 or \
                item.st_mode & 0o022 or item.st_size > 2 * 1024 * 1024 or \
                hashlib.sha256(path.read_bytes()).hexdigest() != expected_files.get(relative):
            raise ValueError('Unadmitted effect-capable Python module')
    current = os.getcwd()
    sys.path = [str(source)] + [entry for entry in sys.path if entry not in ('', current, str(source))]


if __name__ == '__main__':
    _early_source_gate()

from canonical_lineage import build_v1_plan, validate_v1_approval
from canonical_lineage_native import CanonicalLineageNative
from authority import instant, node_public_check, verify_bounded_envelope
from hard_deadline import hard_deadline
from host_observer import EnrolledObserver
from inventory import digest
from native_boundary import NativeBoundary, canonical, require, secure_directory, secure_read, sync_directory

UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z')
HASH = re.compile(r'[a-f0-9]{64}\Z')
RELEASE = re.compile(r'[a-f0-9]{40}\Z')
ROOT = Path('/usr/local/libexec/leetplus-transition-bootstrap')
REQUESTS = Path('/var/lib/leetplus-transition-bootstrap/requests')
OPERATIONS = Path('/var/lib/leetplus-transition-bootstrap/operations')
INSTALL_LOCK = Path('/run/leetplus-production-control/install.lock')
CONTROL_LOCK = Path('/var/lib/leetplus-compose/control.lock')
TRANSITION_LOCK = Path('/var/lib/leetplus-transition-bootstrap/transition.lock')
ATTEMPTS = Path('/var/lib/leetplus-transition-bootstrap/attempts')
CORE = Path('/usr/local/sbin/leetplus-compose')
CLEAN = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8',
         'LC_ALL': 'C.UTF-8', 'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1'}


def read_request(path):
    raw = secure_read(path, 2 * 1024 * 1024)
    value = json.loads(raw)
    require(raw == canonical(value) and isinstance(value, dict) and
            set(value) == {'contract', 'command', 'operationId', 'attemptId', 'mode', 'targetRelease',
                           'criticalNames', 'evidence', 'inputs'} and
            value['contract'] == 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RPC_V1' and
            value['command'] in ('observe', 'plan-v1', 'prepare', 'apply', 'reconcile',
                                 'rollback', 'reconcile-rollback', 'terminalize-no-effect') and
            UUID.fullmatch(value['operationId']) and
            UUID.fullmatch(value['attemptId']) and
            value['mode'] in ('A_TO_BRIDGE', 'BRIDGE_TO_EXTERNAL') and
            RELEASE.fullmatch(value['targetRelease']) and
            isinstance(value['criticalNames'], list) and
            all(isinstance(name, str) and re.fullmatch(r'[A-Za-z0-9_.@-]+', name)
                for name in value['criticalNames']) and
            len(value['criticalNames']) == len(set(value['criticalNames'])) and
            isinstance(value['evidence'], dict) and isinstance(value['inputs'], dict),
            'Invalid exact root bootstrap request')
    return value


class HostRPC:
    def __init__(self, *, request, bundle_root, enrollment_root, operations_root=OPERATIONS,
                 install_lock=INSTALL_LOCK, control_lock=CONTROL_LOCK,
                 transition_lock=TRANSITION_LOCK, core_pointer=CORE,
                 observer=None, native=None, lineage=None):
        self.request = request
        self.mode = request['mode']
        self.operation_id = request['operationId']
        self.target = request['targetRelease']
        self.critical = request['criticalNames']
        self.observer = observer or EnrolledObserver(bundle_root=bundle_root,
                                                     enrollment_root=enrollment_root)
        self.receipt, self.roots = self.observer._enrollment()
        require(digest(canonical(self.receipt['bundleFiles'])) == self.receipt['bundleSha256'],
                'Installed source bundle identity changed')
        self.native = native or NativeBoundary(install_lock=install_lock,
            control_lock=control_lock, transition_lock=transition_lock,
            state_root=operations_root, core_pointer=core_pointer,
            assert_quiescence=self._assert_quiescence)
        self.lineage = lineage
        self.lock = None
        self.deployment_root = secure_read('/etc/leetplus-compose/approval-root.pem', 4096).decode('ascii')

    def _assert_quiescence(self):
        pending = Path('/var/lib/leetplus-compose/control-handoff.pending.json')
        if pending.exists() or pending.is_symlink():
            value = json.loads(secure_read(pending, 8192))
            require(value == {'operationId': self.operation_id},
                    'Foreign pending controller operation forbids bootstrap')
        output = subprocess.run(['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock',
            'ps', '--filter', 'name=^/leetplus-langame-external-daily-worker$',
            '--format', '{{.ID}}'], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=CLEAN, timeout=15, check=False)
        require(output.returncode == 0 and not output.stderr and not output.stdout.strip(),
                'External orphan or Docker observation failure forbids bootstrap')

    def _lineage(self):
        if self.lineage is not None:
            return self.lineage
        inputs = self.request['inputs']
        plan, v1_plan, v1_approval = (inputs.get(name) for name in
            ('plan', 'v1Plan', 'v1Approval'))
        require(isinstance(plan, dict) and isinstance(v1_plan, dict) and
                isinstance(v1_approval, dict), 'Canonical V1 inputs are missing')
        self.lineage = CanonicalLineageNative(boundary=self.native,
            state_root='/var/lib/leetplus-compose', bootstrap_plan=plan,
            v1_plan=v1_plan, v1_approval=v1_approval,
            deployment_root=self.deployment_root)
        return self.lineage

    def _locked(self):
        require(self.lock is not None, 'Native install/control/transition locks are required')

    def _assert_pointer_authority(self, old_pointer, new_pointer, *, recovery=False):
        """Independent Python effect fence; a child cannot choose CAS targets."""
        inputs = self.request['inputs']
        plan = inputs.get('plan')
        require(isinstance(plan, dict) and plan.get('operationId') == self.operation_id and
                plan.get('mode') == self.mode and
                plan.get('expected', {}).get('target', {}).get('releaseSha') == self.target,
                'Pointer RPC lacks exact standalone plan')
        phase = inputs.get('phase') if recovery else (
            'ROLLBACK' if self.request['command'] == 'rollback' else 'FORWARD')
        require(phase in ('FORWARD', 'ROLLBACK'), 'Unknown pointer effect direction')
        expected_old = plan['oldPointer'] if phase == 'FORWARD' else plan['newPointer']
        expected_new = plan['newPointer'] if phase == 'FORWARD' else plan['oldPointer']
        require(old_pointer == expected_old and new_pointer == expected_new and
                (self.request['command'] == ('terminalize-no-effect' if recovery else
                    ('rollback' if phase == 'ROLLBACK' else 'apply'))),
                'Pointer RPC direction or exact target differs')
        permit = inputs.get('permitEnvelope')
        require(isinstance(permit, dict) and set(permit) == {'permit', 'signature'} and
                permit['permit'].get('operationId') == self.operation_id and
                permit['permit'].get('target') == plan['expected']['target'],
                'Pointer RPC permit/target differs')
        node_public_check(self.roots['permit'], permit['permit'], permit['signature'])
        require(permit['permit'].get('contract') ==
                    ('LEETPLUS_A_BRIDGE_BOOTSTRAP_PERMIT_V1' if self.mode == 'A_TO_BRIDGE' else
                     'LEETPLUS_BRIDGE_EXTERNAL_SUCCESSOR_PERMIT_V1') and
                permit['permit'].get('action') ==
                    ('PREPARE_A_BRIDGE_BOOTSTRAP' if self.mode == 'A_TO_BRIDGE' else
                     'PREPARE_BRIDGE_EXTERNAL_SUCCESSOR'),
                'Pointer RPC permit domain differs')
        require(plan['permitEnvelopeSha256'] == digest(canonical(permit)),
                'Pointer RPC plan lacks signed permit')
        execution = inputs.get('executionEnvelope')
        require(isinstance(execution, dict) and set(execution) == {'command', 'signature'} and
                execution['command'].get('operationId') == self.operation_id and
                execution['command'].get('planSha256') == digest(canonical(plan)) and
                execution['command'].get('permitEnvelopeSha256') == digest(canonical(permit)) and
                execution['command'].get('effect') == 'CONTROLLER_POINTER_ONLY',
                'Pointer RPC execution differs')
        node_public_check(self.roots['execution'], execution['command'], execution['signature'])
        record = self.native.read_operation(self.operation_id)
        intent = record.get('intent')
        require(isinstance(intent, dict) and intent.get('planSha256') == digest(canonical(plan)) and
                intent.get('permitEnvelopeSha256') == digest(canonical(permit)) and
                intent.get('executionEnvelopeSha256') == digest(canonical(execution)) and
                intent.get('oldPointer') == plan['oldPointer'] and
                intent.get('newPointer') == plan['newPointer'],
                'Pointer RPC lacks durable exact signed forward intent')
        native = self._lineage()
        authorized_forward = instant(intent['authorizedAt'])
        require(instant(permit['permit']['issuedAt']) <= authorized_forward <
                instant(permit['permit']['expiresAt']),
                'Original pointer intent was outside signed permit')
        validate_v1_approval(native.plan, plan, native.approval,
            self.deployment_root, at=authorized_forward)
        if not recovery and phase == 'FORWARD':
            validate_v1_approval(native.plan, plan, native.approval,
                self.deployment_root, at=datetime.datetime.now(datetime.timezone.utc))
        pending_exists = native.pending.exists() or native.pending.is_symlink()
        if pending_exists:
            native._assert_pending()
        elif not recovery:
            raise ValueError('Pointer effect lacks canonical pending authority')
        elif self.native.core_pointer.with_name(self.native.core_pointer.name + '.bootstrap-new').exists() or \
                self.native.core_pointer.with_name(self.native.core_pointer.name + '.bootstrap-new').is_symlink():
            raise ValueError('Pointer residue without canonical pending requires manual recovery')
        if phase == 'FORWARD':
            if pending_exists:
                require(native._read('apply-main.intent.json')['authorizedAt'] == intent['authorizedAt'] and
                        native._read('plan.json') == native.plan and
                        native._read('approval.json') == native.approval,
                        'Native V1 pending forward lineage differs')
            elif native.directory.exists():
                for leaf, expected in (('plan.json', native.plan),
                                       ('approval.json', native.approval)):
                    path = native.directory / leaf
                    if path.exists() or path.is_symlink():
                        require(native._read(leaf) == expected,
                                'Pre-pending canonical authority changed')
        else:
            rollback = inputs.get('rollbackEnvelope')
            prior = record.get('receipt')
            rollback_intent = record.get('rollbackIntent')
            require(isinstance(prior, dict) and prior.get('decision') == 'PASS' and
                    isinstance(rollback, dict) and set(rollback) == {'command', 'signature'} and
                    rollback['command'].get('planSha256') == digest(canonical(plan)) and
                    rollback['command'].get('forwardReceiptSha256') == digest(canonical(prior)) and
                    rollback['command'].get('effect') == 'CONTROLLER_POINTER_ROLLBACK_ONLY' and
                    isinstance(rollback_intent, dict) and
                    rollback_intent.get('rollbackEnvelopeSha256') == digest(canonical(rollback)) and
                    (not pending_exists or native._read('rollback-main.intent.json')['authorizedAt'] == rollback_intent['authorizedAt']),
                    'Pointer RPC lacks receipt-bound rollback lineage')
            node_public_check(self.roots['rollback'], rollback['command'], rollback['signature'])
            v1_rollback = self.request['inputs'].get('v1RollbackApproval')
            require(isinstance(v1_rollback, dict) and
                    set(v1_rollback) == {'approval', 'signature'} and
                    v1_rollback.get('approval', {}).get('operationId') == self.operation_id and
                    v1_rollback['approval'].get('action') == 'CONTROL_ROLLBACK' and
                    v1_rollback['approval'].get('planSha256') == digest(canonical(native.plan)) and
                    v1_rollback['approval'].get('hostIdentitySha256') == native.plan['hostIdentitySha256'] and
                    v1_rollback.get('approval', {}).get('receiptSha256') ==
                    digest(canonical(native._read('receipt.json'))),
                    'Native rollback approval is not receipt-bound')
            verify_bounded_envelope(v1_rollback, self.deployment_root,
                'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_ROLLBACK_APPROVAL',
                at=instant(rollback_intent['authorizedAt']), maximum_minutes=240)
            if not recovery:
                verify_bounded_envelope(v1_rollback, self.deployment_root,
                    'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_ROLLBACK_APPROVAL',
                    at=datetime.datetime.now(datetime.timezone.utc), maximum_minutes=240)
        if recovery:
            command = inputs.get('recoveryEnvelope')
            pending_intent = intent if phase == 'FORWARD' else record['rollbackIntent']
            require(isinstance(command, dict) and set(command) == {'command', 'signature'} and
                    command['command'].get('contract') ==
                    'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_NO_EFFECT' and
                    command['command'].get('operationId') == self.operation_id and
                    command['command'].get('planSha256') == digest(canonical(plan)) and
                    command['command'].get('phase') == phase and
                    command['command'].get('intentSha256') == digest(canonical(pending_intent)) and
                    command['command'].get('effect') == 'TERMINAL_RECORD_ONLY',
                    'Pointer residue recovery lacks signed zero-effect intent')
            node_public_check(self.roots['noEffect'], command['command'], command['signature'])
        else:
            authorized = instant(intent['authorizedAt'] if phase == 'FORWARD' else
                                 record['rollbackIntent']['authorizedAt'])
            signed = execution['command'] if phase == 'FORWARD' else rollback['command']
            require(instant(signed['issuedAt']) <= authorized < instant(signed['expiresAt']) and
                    instant(signed['issuedAt']) <= datetime.datetime.now(datetime.timezone.utc) <
                    instant(signed['expiresAt']) and
                    (phase != 'FORWARD' or datetime.datetime.now(datetime.timezone.utc) <
                     instant(permit['permit']['expiresAt'])),
                    'Pointer effect signature window expired')
        source = self.observer.bundle_root / 'deploy' / 'transition-bootstrap' / 'protocol.mjs'
        require(digest(secure_read(source, 2 * 1024 * 1024)) ==
                self.receipt['bundleFiles']['deploy/transition-bootstrap/protocol.mjs'],
                'Independent pointer validator source changed')
        validation = {'phase': phase, 'recovery': recovery, 'plan': plan,
            'permitEnvelope': permit, 'permitRoot': self.roots['permit'],
            'executionEnvelope': execution, 'executionRoot': self.roots['execution'],
            'intent': intent, 'forwardReceipt': record.get('receipt') if phase == 'ROLLBACK' else None,
            'rollbackIntent': record.get('rollbackIntent') if phase == 'ROLLBACK' else None,
            'rollbackEnvelope': inputs.get('rollbackEnvelope') if phase == 'ROLLBACK' else None,
            'rollbackRoot': self.roots['rollback'],
            'recoveryEnvelope': inputs.get('recoveryEnvelope') if recovery else None,
            'recoveryRoot': self.roots['noEffect']}
        script = "import fs from 'node:fs';import {validateNativePointerAuthority} from '" + \
            source.as_uri() + "';validateNativePointerAuthority(JSON.parse(fs.readFileSync(0,'utf8')));process.stdout.write('PASS');"
        checked = subprocess.run(['/usr/bin/node', '--input-type=module', '-e', script],
            input=canonical(validation), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=CLEAN, timeout=20, check=False)
        require(checked.returncode == 0 and checked.stdout == b'PASS' and not checked.stderr,
                'Exact independent pointer permit/command schema rejected')
        return plan

    def dispatch(self, method, args):
        require(isinstance(method, str) and isinstance(args, dict), 'Malformed bootstrap RPC')
        if method == 'lock.acquire':
            require(self.lock is None and set(args) == {'mode'} and args['mode'] in ('READ', 'WRITE'),
                    'Invalid native lock request')
            context = self.native.with_locks(args['mode'])
            context.__enter__()
            self.lock = context
            return True
        if method == 'lock.release':
            self._locked()
            self.lock.__exit__(None, None, None)
            self.lock = None
            return True
        self._locked()
        if method == 'observe':
            observed, roots = self.observer.observe(self.mode, self.operation_id,
                self.target, self.critical)
            require(roots == self.roots, 'Enrolled public roots changed')
            return observed
        if method == 'pointer.read': return self.native.read_pointer()
        if method == 'protected.read': return self.observer.protected_state(self.mode)
        if method == 'operation.read':
            require(args == {'operationId': self.operation_id}, 'Foreign operation read')
            return self.native.read_operation(self.operation_id)
        if method == 'operation.publish':
            require(set(args) == {'operationId', 'name', 'value'} and
                    args['operationId'] == self.operation_id, 'Foreign operation publish')
            self.native.publish_exclusive(self.operation_id, args['name'], args['value'])
            return True
        if method == 'pointer.cas':
            require(set(args) == {'oldPointer', 'newPointer'}, 'Unexpected pointer CAS arguments')
            self._assert_pointer_authority(args['oldPointer'], args['newPointer'])
            self.native.compare_and_swap_pointer(args['oldPointer'], args['newPointer'])
            return True
        if method == 'pointer.recover-temporary':
            require(set(args) == {'oldPointer', 'pendingTarget'}, 'Unexpected pointer recovery arguments')
            self._assert_pointer_authority(args['oldPointer'], args['pendingTarget'], recovery=True)
            self.native.recover_pointer_temporary(args['oldPointer'], args['pendingTarget'])
            return True
        if method.startswith('canonical.'):
            require(args.get('plan') == self.request['inputs'].get('plan'),
                    'Native canonical callback differs from signed bootstrap plan')
            lineage = self._lineage()
            if method == 'canonical.prepare-forward':
                require(set(args) == {'plan', 'intent'}, 'Invalid canonical prepare arguments')
                return lineage.prepare_forward(args['intent'], now=datetime.datetime.now(datetime.timezone.utc))
            if method in ('canonical.finalize-forward', 'canonical.reconcile-forward'):
                require(set(args) == {'plan', 'intent'}, 'Invalid canonical final arguments')
                return lineage.finalize_forward(args['intent'])
            if method == 'canonical.prepare-rollback':
                require(set(args) == {'plan', 'intent', 'receipt'}, 'Invalid canonical rollback arguments')
                return lineage.prepare_rollback(args['intent'], args['receipt'],
                    self.request['inputs']['v1RollbackApproval'], now=datetime.datetime.now(datetime.timezone.utc))
            if method in ('canonical.finalize-rollback', 'canonical.reconcile-rollback'):
                require(set(args) == {'plan', 'intent', 'receipt'}, 'Invalid canonical rollback final arguments')
                return lineage.finalize_rollback(args['intent'])
            if method == 'canonical.close-no-effect':
                require(set(args) == {'plan', 'phase', 'intent'}, 'Invalid canonical terminal arguments')
                return lineage.close_no_effect(args['phase'], args['intent'])
        raise ValueError('Unknown native bootstrap RPC method')

    def close(self):
        if self.lock is not None:
            self.lock.__exit__(None, None, None)
            self.lock = None


def _read_only_command(host):
    request = host.request
    with host.native.with_locks('READ'):
        observed, roots = host.observer.observe(host.mode, host.operation_id,
            host.target, host.critical)
        require(roots == host.roots, 'Enrolled roots changed during read-only observation')
        if request['command'] == 'observe':
            return {'decision': 'OBSERVED_NOT_AUTHORIZATION', 'observation': observed}
        plan = request['inputs'].get('plan')
        require(isinstance(plan, dict), 'Standalone plan required for V1 proposal')
        context = host.observer.native_context(host.mode, host.target)
        native = build_v1_plan(bootstrap_plan=plan,
            old=context['old'], target=context['target'], snapshot=context['snapshot'],
            timers=context['timers'], host_sha=context['hostSha'],
            network_unit_sha=context['networkUnitSha'],
            network_unit_mode=context['networkUnitMode'],
            previous_pointer_raw=context['previousPointerRaw'],
            evidence_sha=request['evidence']['nativeEvidenceSha256'])
        return {'decision': 'V1_PREPARED_NOT_AUTHORIZATION',
                'plan': native, 'planSha256': digest(canonical(native))}


def _run_child(host, cli_path, inputs, *, node_binary='/usr/bin/node', audit_dir=None):
    audit = secure_directory(audit_dir) if audit_dir is not None else None
    rpc_fd = None
    rpc_bytes = 0
    if audit is not None:
        rpc_fd = os.open(audit / 'rpc.stdout', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    stderr_file = tempfile.TemporaryFile(mode='w+b')
    def limit_child_stderr():
        import resource
        resource.setrlimit(resource.RLIMIT_FSIZE, (65536, 65536))
    try:
        child = subprocess.Popen([node_binary, str(cli_path)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr_file,
            env=CLEAN, cwd='/', start_new_session=False, text=True, bufsize=1,
            preexec_fn=limit_child_stderr if os.name == 'posix' else None)
    except Exception as error:
        stderr_file.close()
        if rpc_fd is not None:
            os.close(rpc_fd)
            _audit_write(audit, 'rpc.stderr', b'CHILD_START_FAILED\n')
            _audit_write(audit, 'rpc.exit.json', canonical({'exitCode': None,
                'resultSha256': None, 'failureClass': type(error).__name__}))
        raise
    deadline = time.monotonic() + 240
    terminal = None
    failure = None
    try:
        init = {'type': 'init', 'command': host.request['command'], 'mode': host.mode,
                'inputs': inputs, 'roots': host.roots, 'evidence': host.request['evidence']}
        if audit is not None:
            _audit_write(audit, 'init.sha256', hashlib.sha256(canonical(init)).hexdigest().encode() + b'\n')
        child.stdin.write(json.dumps(init, separators=(',', ':')) + '\n')
        child.stdin.flush()
        while True:
            remain = deadline - time.monotonic()
            require(remain > 0, 'Bounded bootstrap child deadline expired')
            ready, _, _ = select.select([child.stdout], [], [], remain)
            require(ready, 'Bootstrap child did not produce bounded RPC output')
            raw = child.stdout.readline()
            require(raw and len(raw) <= 4 * 1024 * 1024, 'Closed or oversized bootstrap child RPC')
            if rpc_fd is not None:
                encoded = raw.encode('utf8')
                rpc_bytes += len(encoded)
                require(rpc_bytes <= 16 * 1024 * 1024, 'Bootstrap RPC audit exceeded bounded size')
                os.write(rpc_fd, encoded)
                os.fsync(rpc_fd)
            value = json.loads(raw)
            if value.get('type') == 'result':
                require(child.wait(timeout=5) == 0, 'Bootstrap child exited after success with failure')
                terminal = value['result']
                return terminal
            if value.get('type') == 'error':
                raise ValueError('Bootstrap child rejected authority; inspect bounded local stderr receipt')
            require(value.get('type') == 'call' and isinstance(value.get('id'), int),
                    'Unknown bootstrap child message')
            try:
                result = host.dispatch(value['method'], value.get('args'))
                reply = {'type': 'reply', 'id': value['id'], 'ok': True, 'result': result}
            except Exception as error:
                reply = {'type': 'reply', 'id': value['id'], 'ok': False,
                         'error': type(error).__name__ + ': native authority rejected'}
            child.stdin.write(json.dumps(reply, separators=(',', ':')) + '\n')
            child.stdin.flush()
    except Exception as error:
        failure = type(error).__name__
        raise
    finally:
        cleanup_error = None
        release_error = None
        audit_error = None
        stderr_raw = b''
        # Stop and drain the child while native flocks are still held. An
        # effect-bearing descendant must not outlive the protected window.
        try:
            if child.poll() is None:
                child.kill()
            unused_stdout, _unused_stderr = child.communicate(timeout=5)
            if unused_stdout:
                cleanup_error = cleanup_error or 'UnexpectedChildStdout'
        except Exception as error:
            cleanup_error = type(error).__name__
            try:
                child.kill()
                child.wait(timeout=5)
            except Exception:
                pass
        try:
            host.close()
        except Exception as error:
            release_error = type(error).__name__
        if rpc_fd is not None:
            try:
                os.close(rpc_fd)
                stderr_file.seek(0)
                stderr_raw = stderr_file.read(65537)
                truncated = len(stderr_raw) >= 65536
                _audit_write(audit, 'rpc.stderr', stderr_raw[:65536])
                _audit_write(audit, 'rpc.exit.json', canonical({'exitCode': child.returncode,
                    'resultSha256': digest(canonical(terminal)) if terminal is not None else None,
                    'failureClass': failure or release_error or cleanup_error,
                    'lockReleaseSucceeded': release_error is None,
                    'childCleanupFailureClass': cleanup_error,
                    'stderrTruncated': truncated}))
            except Exception as error:
                audit_error = type(error).__name__
        stderr_file.close()
        if failure is None and (release_error or cleanup_error or audit_error):
            raise RuntimeError('Bootstrap child cleanup, lock release or audit publication failed')


def _audit_write(directory, name, raw):
    fd = os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    marker = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(marker)
    finally:
        os.close(marker)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Trusted predecessor bootstrap host RPC')
    parser.add_argument('--bundle-sha256', required=True)
    parser.add_argument('--operation-id', required=True)
    args = parser.parse_args(argv)
    require(os.name == 'posix' and os.getuid() == 0 and HASH.fullmatch(args.bundle_sha256) and
            UUID.fullmatch(args.operation_id), 'Exact POSIX root bootstrap invocation required')
    final = secure_directory(ROOT / args.bundle_sha256)
    require({item.name for item in final.iterdir()} == {'bundle', 'enrollment'},
            'Unexpected installed standalone bundle root')
    bundle, enrollment = final / 'bundle', final / 'enrollment'
    request = read_request(REQUESTS / args.operation_id / 'request.json')
    require(request['operationId'] == args.operation_id, 'Request operation differs from exact invocation')
    attempts = secure_directory(ATTEMPTS)
    attempt = attempts / request['attemptId']
    require(not attempt.exists() and not attempt.is_symlink(), 'RPC attempt already exists')
    attempt.mkdir(mode=0o700)
    sync_directory(attempts)
    _audit_write(attempt, 'request.sha256',
        (digest(secure_read(REQUESTS / args.operation_id / 'request.json',
                            2 * 1024 * 1024)) + '\n').encode())
    with hard_deadline(300, attempt):
        phase = 'HOST_CONSTRUCTION'
        result = None
        failure_class = None
        try:
            host = HostRPC(request=request, bundle_root=bundle, enrollment_root=enrollment)
            require(host.receipt['bundleSha256'] == args.bundle_sha256,
                    'Installed bundle SHA differs from admission')
            if request['command'] in ('observe', 'plan-v1'):
                phase = 'READ_ONLY_OBSERVATION'
                result = _read_only_command(host)
                _audit_write(attempt, 'read.stdout.json', canonical(result))
                _audit_write(attempt, 'read.stderr', b'')
                _audit_write(attempt, 'read.exit.json', canonical({'exitCode': 0,
                    'resultSha256': digest(canonical(result))}))
            else:
                phase = 'EFFECT_CHILD'
                inputs = request['inputs']
                cli = bundle / 'deploy' / 'transition-bootstrap' / 'cli.mjs'
                require(digest(secure_read(cli, 2 * 1024 * 1024)) ==
                        host.receipt['bundleFiles']['deploy/transition-bootstrap/cli.mjs'],
                        'Admitted Node protocol CLI byte changed')
                result = _run_child(host, cli, inputs, audit_dir=attempt)
        except Exception as error:
            failure_class = type(error).__name__
            if phase == 'READ_ONLY_OBSERVATION':
                if not (attempt / 'read.stderr').exists():
                    _audit_write(attempt, 'read.stderr',
                                 (failure_class + ': SOURCE_READ_REJECTED\n').encode())
                if not (attempt / 'read.exit.json').exists():
                    _audit_write(attempt, 'read.exit.json', canonical({'exitCode': 1,
                        'resultSha256': None, 'failureClass': failure_class}))
            raise
        finally:
            _audit_write(attempt, 'attempt.exit.json', canonical({'exitCode': 0 if failure_class is None else 1,
                'phase': phase, 'failureClass': failure_class,
                'resultSha256': digest(canonical(result)) if result is not None else None}))
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
