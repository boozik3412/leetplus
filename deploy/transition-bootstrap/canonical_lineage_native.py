"""Native V1 handoff records required by the frozen serving controllers.

No CLI is exposed. The caller must be the independently admitted host adapter,
hold NativeBoundary WRITE locks, and pass the independently observed/signed
bootstrap plan. This class never imports target controller code.
"""
import base64
import ctypes
import json
import os
from pathlib import Path

from authority import instant, verify_bounded_envelope
from canonical_lineage import (V1_APPROVAL, V1_PLAN, V1_RECEIPT, active_pointer,
                               freeze_v1_receipt, validate_v1_approval, validate_v1_plan)
from inventory import digest
from native_boundary import canonical, require, secure_read, secure_directory, sync_directory

ROLLBACK_APPROVAL = 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_ROLLBACK_APPROVAL'
NO_REPLACE = 1
AT_FDCWD = -100


def _atomic_no_replace(directory, name, raw, mode, *, fault=lambda _stage: None):
    directory = secure_directory(directory)
    target = directory / name
    temporary = directory / ('.' + name + '.pending')
    if target.exists() or target.is_symlink():
        require(secure_read(target) == raw, 'Existing canonical handoff record changed')
        return
    if temporary.exists() or temporary.is_symlink():
        info = temporary.lstat()
        require(temporary.is_file() and not temporary.is_symlink() and info.st_uid == 0 and
                info.st_nlink == 1 and not info.st_mode & 0o077,
                'Foreign incomplete canonical handoff temporary')
        temporary.unlink()
        sync_directory(directory)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    fault('before-canonical-rename')
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(AT_FDCWD, os.fsencode(temporary), AT_FDCWD, os.fsencode(target), NO_REPLACE) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), str(target))
    fault('after-canonical-rename')
    sync_directory(directory)
    require(secure_read(target) == raw, 'Canonical handoff publication changed')


def _cas_existing(path, old_raw, new_raw):
    require(isinstance(old_raw, bytes) and isinstance(new_raw, bytes) and old_raw != new_raw and
            len(new_raw) <= 8192 and secure_read(path, 8192) == old_raw,
            'Canonical active-pointer CAS preimage differs')
    temporary = path.with_name('.' + path.name + '.cas-pending')
    if temporary.exists() or temporary.is_symlink():
        require(secure_read(temporary, 8192) == new_raw,
                'Foreign active-pointer temporary requires separate recovery')
        temporary.unlink()
        sync_directory(path.parent)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(new_raw)
        stream.flush()
        os.fsync(stream.fileno())
    require(secure_read(path, 8192) == old_raw, 'Active pointer changed before CAS')
    os.replace(temporary, path)
    sync_directory(path.parent)
    require(secure_read(path, 8192) == new_raw, 'Active-pointer CAS postimage differs')


class CanonicalLineageNative:
    def __init__(self, *, boundary, state_root, bootstrap_plan, v1_plan,
                 v1_approval, deployment_root):
        self.boundary = boundary
        self.state = secure_directory(state_root)
        self.handoffs = secure_directory(self.state / 'control-handoffs')
        self.directory = self.handoffs / bootstrap_plan['operationId']
        self.pending = self.state / 'control-handoff.pending.json'
        self.active = self.handoffs / 'active.json'
        self.bootstrap_plan = bootstrap_plan
        self.plan = validate_v1_plan(v1_plan, bootstrap_plan)
        self.approval = v1_approval
        self.deployment_root = deployment_root

    def _write(self, name, value):
        _atomic_no_replace(self.directory, name, canonical(value), 0o400)

    def _read(self, name):
        raw = secure_read(self.directory / name, 65536)
        value = json.loads(raw)
        require(raw == canonical(value), 'Canonical handoff record is not immutable JSON')
        return value

    def _current_pointer_raw(self):
        return secure_read(self.active, 8192) if self.active.exists() or self.active.is_symlink() else None

    def _prior_pointer_raw(self):
        encoded = self.plan['previousPointer']
        if encoded is None:
            return None
        require(isinstance(encoded, str) and encoded, 'Accepted predecessor handoff pointer required')
        raw = base64.b64decode(encoded, validate=True)
        require(len(raw) <= 8192 and canonical(json.loads(raw)) == raw,
                'Prior handoff pointer is not canonical')
        return raw

    def _pending_raw(self):
        return canonical({'operationId': self.plan['operationId']})

    def _ensure_dir(self):
        require(self.boundary._held == 'WRITE', 'Canonical lineage requires exclusive native locks')
        if not self.directory.exists():
            self.directory.mkdir(mode=0o700)
            sync_directory(self.handoffs)
        secure_directory(self.directory)

    def _assert_pending(self):
        require(secure_read(self.pending, 8192) == self._pending_raw(),
                'Global pending marker differs from this operation')

    def _publish_pending(self):
        require(not self.pending.exists() and not self.pending.is_symlink(),
                'Another controller handoff is pending')
        _atomic_no_replace(self.state, self.pending.name, self._pending_raw(), 0o600)

    def _clear_pending(self):
        self._assert_pending()
        self.pending.unlink()
        sync_directory(self.state)

    def prepare_forward(self, standalone_intent, *, now):
        require(standalone_intent['operationId'] == self.plan['operationId'] and
                standalone_intent['planSha256'] == digest(canonical(self.bootstrap_plan)),
                'Standalone intent differs from V1 lineage')
        authorized_at = instant(standalone_intent['authorizedAt'])
        validate_v1_approval(self.plan, self.bootstrap_plan, self.approval,
                             self.deployment_root, at=authorized_at)
        validate_v1_approval(self.plan, self.bootstrap_plan, self.approval,
                             self.deployment_root, at=now)
        require(self.boundary.read_pointer() == self.plan['oldMainTarget'] and
                self._current_pointer_raw() == self._prior_pointer_raw(),
                'Predecessor canonical pointer drift')
        binding = {'operationId': self.plan['operationId'],
                   'planSha256': digest(canonical(self.plan)),
                   'approvalSha256': digest(canonical(self.approval)),
                   'authorizedAt': standalone_intent['authorizedAt']}
        receipt = freeze_v1_receipt(self.plan, self.approval, binding['authorizedAt'])
        self._ensure_dir()
        self._write('plan.json', self.plan)
        self._write('approval.json', self.approval)
        self._write('apply.intent.json', binding)
        self._publish_pending()
        self._write('apply-main.intent.json', binding)
        self._write('receipt.frozen.json', receipt)
        return receipt

    def finalize_forward(self, standalone_intent):
        require(self.boundary._held == 'WRITE' and
                self.boundary.read_pointer() == self.plan['newMainTarget'],
                'Canonical forward postimage requires target pointer')
        pending_exists = self.pending.exists() or self.pending.is_symlink()
        if pending_exists:
            self._assert_pending()
        else:
            require(self._current_pointer_raw() == canonical(active_pointer(self.plan, self._read('receipt.json'))),
                    'Missing pending marker without final accepted V1 pointer')
        require(self._read('plan.json') == self.plan and self._read('approval.json') == self.approval and
                self._read('apply.intent.json') == self._read('apply-main.intent.json'),
                'Canonical forward authority drift')
        binding = self._read('apply-main.intent.json')
        require(binding['authorizedAt'] == standalone_intent['authorizedAt'],
                'Canonical forward intent time changed')
        validate_v1_approval(self.plan, self.bootstrap_plan, self.approval,
                             self.deployment_root, at=instant(binding['authorizedAt']))
        receipt = self._read('receipt.frozen.json')
        require(receipt == freeze_v1_receipt(self.plan, self.approval, binding['authorizedAt']),
                'Frozen pre-effect V1 receipt changed')
        self._write('apply-main.receipt.json', binding)
        self._write('receipt.json', receipt)
        new_pointer = canonical(active_pointer(self.plan, receipt))
        old_pointer = self._prior_pointer_raw()
        current = self._current_pointer_raw()
        require(current in (old_pointer, new_pointer), 'Foreign active handoff pointer')
        if current == old_pointer:
            if old_pointer is None:
                _atomic_no_replace(self.handoffs, self.active.name, new_pointer, 0o600)
            else:
                _cas_existing(self.active, old_pointer, new_pointer)
        if pending_exists:
            self._clear_pending()
        return receipt

    def prepare_rollback(self, standalone_intent, standalone_forward_receipt,
                         v1_rollback_envelope, *, now):
        self._ensure_dir()
        forward = self._read('receipt.json')
        require(forward == self._read('receipt.frozen.json') and
                self._current_pointer_raw() == canonical(active_pointer(self.plan, forward)) and
                self.boundary.read_pointer() == self.plan['newMainTarget'] and
                standalone_intent['forwardReceiptSha256'] == digest(canonical(standalone_forward_receipt)),
                'Canonical rollback lacks accepted forward lineage')
        approval = verify_bounded_envelope(v1_rollback_envelope, self.deployment_root,
            ROLLBACK_APPROVAL, at=instant(standalone_intent['authorizedAt']), maximum_minutes=240)
        verify_bounded_envelope(v1_rollback_envelope, self.deployment_root,
            ROLLBACK_APPROVAL, at=now, maximum_minutes=240)
        require(set(approval) == {'contract', 'action', 'operationId', 'hostIdentitySha256',
                'planSha256', 'receiptSha256', 'issuedAt', 'expiresAt'} and
                approval['action'] == 'CONTROL_ROLLBACK' and
                approval['operationId'] == self.plan['operationId'] and
                approval['hostIdentitySha256'] == self.plan['hostIdentitySha256'] and
                approval['planSha256'] == digest(canonical(self.plan)) and
                approval['receiptSha256'] == digest(canonical(forward)),
                'Deployment-root rollback approval differs from V1 receipt')
        binding = {'operationId': self.plan['operationId'],
                   'planSha256': digest(canonical(self.plan)),
                   'approvalSha256': digest(canonical(v1_rollback_envelope)),
                   'authorizedAt': standalone_intent['authorizedAt']}
        self._write('rollback-approval.json', v1_rollback_envelope)
        self._write('rollback.intent.json', binding)
        self._publish_pending()
        self._write('rollback-main.intent.json', binding)

    def finalize_rollback(self, standalone_intent):
        require(self.boundary._held == 'WRITE' and
                self.boundary.read_pointer() == self.plan['oldMainTarget'],
                'Canonical rollback postimage requires predecessor pointer')
        pending_exists = self.pending.exists() or self.pending.is_symlink()
        if pending_exists:
            self._assert_pending()
        else:
            require(self._read('rolled-back.json')['decision'] == 'ROLLED_BACK' and
                    self._current_pointer_raw() == self._prior_pointer_raw(),
                    'Missing pending marker without terminal rollback lineage')
        binding = self._read('rollback-main.intent.json')
        require(binding == self._read('rollback.intent.json') and
                binding['authorizedAt'] == standalone_intent['authorizedAt'],
                'Canonical rollback intent drift')
        envelope = self._read('rollback-approval.json')
        approval = verify_bounded_envelope(envelope, self.deployment_root,
            ROLLBACK_APPROVAL, at=instant(binding['authorizedAt']), maximum_minutes=240)
        require(approval['receiptSha256'] == digest(canonical(self._read('receipt.json'))),
                'Rollback approval lost receipt binding')
        self._write('rollback-main.receipt.json', binding)
        new_pointer = canonical(active_pointer(self.plan, self._read('receipt.json')))
        old_pointer = self._prior_pointer_raw()
        current = self._current_pointer_raw()
        require(current in (new_pointer, old_pointer), 'Foreign active pointer during rollback')
        if current == new_pointer:
            if old_pointer is None:
                require(secure_read(self.active, 8192) == new_pointer,
                        'Cannot remove a foreign canonical active pointer')
                self.active.unlink()
                sync_directory(self.handoffs)
            else:
                _cas_existing(self.active, new_pointer, old_pointer)
        terminal = {**binding, 'decision': 'ROLLED_BACK',
                    'forwardReceiptSha256': digest(canonical(self._read('receipt.json')))}
        self._write('rolled-back.json', terminal)
        if pending_exists:
            self._clear_pending()
        return terminal

    def close_no_effect(self, phase, standalone_intent):
        require(self.boundary._held == 'WRITE' and phase in ('FORWARD', 'ROLLBACK'),
                'Signed zero-effect scope required')
        pending_exists = self.pending.exists() or self.pending.is_symlink()
        if pending_exists:
            self._assert_pending()
        expected = self.plan['oldMainTarget'] if phase == 'FORWARD' else self.plan['newMainTarget']
        require(self.boundary.read_pointer() == expected,
                'Canonical zero-effect pointer preimage differs')
        self._ensure_dir()
        for name, expected_value in [('plan.json', self.plan), ('approval.json', self.approval)]:
            path = self.directory / name
            if path.exists() or path.is_symlink():
                require(self._read(name) == expected_value, 'Zero-effect canonical authority drift')
        approval_sha = digest(canonical(self.approval))
        expected_binding = {'operationId': self.plan['operationId'],
            'planSha256': digest(canonical(self.plan)),
            'approvalSha256': approval_sha,
            'authorizedAt': standalone_intent['authorizedAt']}
        names = ('apply.intent.json', 'apply-main.intent.json') if phase == 'FORWARD' else (
            'rollback.intent.json', 'rollback-main.intent.json')
        for name in names:
            path = self.directory / name
            if path.exists() or path.is_symlink():
                value = self._read(name)
                if phase == 'FORWARD':
                    require(value == expected_binding, 'Zero-effect canonical intent drift')
                else:
                    rollback_approval = self.directory / 'rollback-approval.json'
                    require(rollback_approval.exists() and value == {
                        **expected_binding,
                        'approvalSha256': digest(canonical(self._read('rollback-approval.json')))},
                        'Zero-effect rollback intent drift')
        if phase == 'FORWARD':
            require(not (self.directory / 'receipt.json').exists() and
                    self._current_pointer_raw() == self._prior_pointer_raw(),
                    'Forward zero-effect contradicted by canonical receipt')
        else:
            require((self.directory / 'receipt.json').exists() and
                    not (self.directory / 'rolled-back.json').exists() and
                    self._current_pointer_raw() == canonical(active_pointer(self.plan, self._read('receipt.json'))),
                    'Rollback zero-effect contradicted by canonical lineage')
        terminal_name = 'rollback-no-effect.json' if phase == 'ROLLBACK' else 'apply-no-effect.json'
        self._write(terminal_name, {'operationId': self.plan['operationId'],
            'planSha256': digest(canonical(self.plan)),
            'standaloneIntentSha256': digest(canonical(standalone_intent)),
            'decision': 'CANCELED_NO_POINTER_EFFECT'})
        if pending_exists:
            self._clear_pending()
