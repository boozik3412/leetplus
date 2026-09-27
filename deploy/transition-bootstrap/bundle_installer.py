"""Separately admitted, public-only bootstrap bundle installation source.

No CLI entry point is intentionally provided. Its caller must execute the
reviewed installed installer bytes from an existing trusted control root and
retain a direct dispatcher GO bound to the exact plan/approval. This source
cannot establish its own installed authority.
"""
import contextlib
import ctypes
import datetime
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tarfile
import time

from authority import node_public_check
from enrollment import (ENROLLMENT, INSTALL_EFFECTS, INSTALL_PLAN, INSTALL_RECEIPT,
                        validate_install_approval, validate_install_plan,
                        validate_installer_receipt, validate_enrollment_chain)
from host_observer import A_RELEASE, A_MANIFEST, A_EXECUTOR, BRIDGE_RELEASE, BRIDGE_MANIFEST, BRIDGE_EXECUTOR
from inventory import admitted_control, digest
from native_boundary import canonical, require, secure_read, secure_directory, sync_directory, verify_bundle_inventory

ROOT_NAMES = ('permit', 'execution', 'rollback', 'noEffect')
MAX_ARCHIVE = 16 * 1024 * 1024
MAX_LEAF = 2 * 1024 * 1024
CLEAN = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC'}


def _write_new(path, raw, mode=0o400):
    require(not path.exists() and not path.is_symlink() and len(raw) <= MAX_ARCHIVE,
            'Installer cannot overwrite an existing leaf')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    require(secure_read(path, MAX_ARCHIVE) == raw, 'Installer file postimage changed')


def _publish_new(directory, name, raw, mode=0o400):
    directory = secure_directory(directory)
    target = directory / name
    temporary = directory / ('.' + name + '.pending')
    require(not target.exists() and not target.is_symlink() and
            not temporary.exists() and not temporary.is_symlink(),
            'Installer record or pending temporary already exists')
    _write_new(temporary, raw, mode)
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(temporary), -100, os.fsencode(target), 1) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), str(target))
    sync_directory(directory)
    require(secure_read(target, MAX_ARCHIVE) == raw, 'Installer record publication changed')


def _bundle_members(raw, expected):
    members = {}
    directories = set()
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        for item in archive:
            name = item.name.rstrip('/')
            require(isinstance(name, str) and not name.startswith('/') and '\\' not in name and
                    all(re.fullmatch(r'[A-Za-z0-9_.@-]+', part) and part not in ('.', '..')
                        for part in name.split('/')),
                    'Unsafe standalone bundle member')
            if item.isdir():
                directories.add(name)
                continue
            require(item.isfile() and name in expected and name not in members and
                    item.size <= MAX_LEAF and not item.pax_headers,
                    'Bundle contains an unreviewed leaf or metadata')
            member = archive.extractfile(item)
            require(member is not None, 'Bundle member has no bytes')
            value = member.read(MAX_LEAF + 1)
            require(len(value) == item.size and digest(value) == expected[name],
                    'Bundle member differs from signed full map')
            members[name] = value
    require(set(members) == set(expected), 'Bundle archive omits an admitted leaf')
    needed = {parent.as_posix() for name in members for parent in Path(name).parents if str(parent) != '.'}
    require(directories <= needed, 'Bundle archive has an unexpected directory')
    return members, needed


def _stage_tree(path, members, directories, roots, lineage):
    path.mkdir(mode=0o700)
    secure_directory(path)
    bundle = path / 'bundle'
    enrollment = path / 'enrollment'
    bundle.mkdir(mode=0o700)
    enrollment.mkdir(mode=0o700)
    for relative in sorted(directories, key=lambda item: (item.count('/'), item)):
        (bundle / relative).mkdir(mode=0o700)
    for relative, raw in members.items():
        _write_new(bundle / relative, raw)
    for name, raw in roots.items():
        _write_new(enrollment / (name + '-root.pem'), raw)
    for name, value in lineage.items():
        _write_new(enrollment / name, canonical(value))
    for directory in sorted((p for p in path.rglob('*') if p.is_dir()),
                            key=lambda item: len(item.parts), reverse=True):
        sync_directory(directory)
    sync_directory(path)


@contextlib.contextmanager
def _install_locks(install_path, control_path, timeout=120):
    import fcntl
    require(os.name == 'posix' and os.getuid() == 0 and 0 < timeout <= 120,
            'Bounded POSIX root installer required')
    fds = []
    deadline = time.monotonic() + timeout
    try:
        for path in (install_path, control_path):
            secure_read(path, 65536)
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            fds.append(fd)
            info = os.fstat(fd)
            require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and
                    not info.st_mode & 0o077, 'Untrusted existing installer lock')
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    require(time.monotonic() < deadline, 'Installer lock wait timed out')
                    time.sleep(0.01)
            require((path.lstat().st_dev, path.lstat().st_ino) == (info.st_dev, info.st_ino),
                    'Installer lock origin changed')
        yield
    finally:
        for fd in reversed(fds):
            os.close(fd)


class StandaloneBundleInstaller:
    """Native exact-plan source; fixed paths must come from the trusted caller."""

    def __init__(self, *, controls_root, inbox_root, source_inbox, installed_parent,
                 state_root, machine_id, core_pointer, deployment_root,
                 install_lock, control_lock, installer_source_path):
        require(os.name == 'posix' and os.getuid() == 0, 'Root installer boundary required')
        self.controls = secure_directory(controls_root)
        self.inbox = secure_directory(inbox_root)
        self.source_inbox = secure_directory(source_inbox)
        self.installed_parent = secure_directory(installed_parent)
        self.state = secure_directory(state_root)
        self.machine_id = Path(machine_id)
        self.core = Path(core_pointer)
        self.deployment_root = Path(deployment_root)
        self.install_lock = Path(install_lock)
        self.control_lock = Path(control_lock)
        self.installer_source_path = Path(installer_source_path)

    def _preflight(self, plan, approval, roots, archive):
        validate_install_plan(plan)
        deployment_root = secure_read(self.deployment_root, 4096).decode('ascii')
        validate_install_approval(plan, approval, deployment_root)
        require(digest(secure_read(self.machine_id, 65536).strip()) == plan['hostIdentitySha256'] and
                digest(secure_read(self.installer_source_path, MAX_LEAF)) == plan['installerSourceSha256'],
                'Installer source or host identity changed')
        source_admission = secure_read(self.source_inbox / 'docker-admission.json', 65536)
        admission = json.loads(source_admission)
        require(digest(source_admission) == plan['sourceAdmissionSha256'] and
                admission.get('contract') == 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION' and
                admission.get('decision') == 'PASS' and admission.get('releaseSha') == plan['sourceRelease'] and
                admission.get('repository') == 'boozik3412/leetplus' and
                admission.get('event') == 'push' and admission.get('ref') == 'refs/heads/main',
                'Standalone source lacks exact-main admission')
        old = admitted_control(controls_root=self.controls, inbox_root=self.inbox,
                               release_sha=plan['predecessorReleaseSha'])
        require((old['releaseSha'], old['manifestSha256'], old['files'].get('control_handoff.py')) in (
            (A_RELEASE, A_MANIFEST, A_EXECUTOR),
            (BRIDGE_RELEASE, BRIDGE_MANIFEST, BRIDGE_EXECUTOR)),
            'Only accepted A or bridge may enroll this standalone bundle')
        require(old['manifestSha256'] == plan['predecessorManifestSha256'],
                'Signed predecessor manifest differs from installed evidence')
        require(self.core.is_symlink() and self.core.lstat().st_uid == 0 and
                os.readlink(self.core) == plan['oldCorePointer'] and
                not (self.state / 'control-handoff.pending.json').exists(),
                'Serving predecessor or pending handoff differs')
        require(digest(archive) == plan['bundleArchiveSha256'],
                'Standalone archive differs from exact signed plan')
        members, directories = _bundle_members(archive, plan['bundleFiles'])
        require(set(roots) == set(ROOT_NAMES), 'Four public-only roots required')
        der = set()
        deployment_identity = node_public_check(deployment_root)
        for name, raw in roots.items():
            require(digest(raw) == plan['publicRoots'][name] and b'PRIVATE' not in raw,
                    'Public root differs from signed plan')
            identity = node_public_check(raw.decode('ascii'))
            require(identity not in der and identity != deployment_identity,
                    'Transition roots must be distinct from each other and deployment root')
            der.add(identity)
        return deployment_root, members, directories

    def prepare(self, plan, approval, roots, archive):
        with _install_locks(self.install_lock, self.control_lock):
            self._preflight(plan, approval, roots, archive)
            return {'decision': 'PREPARED_NOT_AUTHORIZATION',
                    'operationId': plan['operationId'], 'planSha256': digest(canonical(plan))}

    def apply(self, plan, approval, roots, archive):
        with _install_locks(self.install_lock, self.control_lock):
            deployment_root, members, directories = self._preflight(plan, approval, roots, archive)
            operation = self.state / plan['operationId']
            require(not operation.exists() and not operation.is_symlink(),
                    'Existing installer operation requires read-only reconciliation')
            final = self.installed_parent / plan['bundleSha256']
            temporary = self.installed_parent / ('.' + plan['bundleSha256'] + '.' + plan['operationId'] + '.pending')
            require(not final.exists() and not final.is_symlink() and
                    not temporary.exists() and not temporary.is_symlink(),
                    'Existing bundle or ambiguous installer staging')
            now = datetime.datetime.now(datetime.timezone.utc)
            validate_install_approval(plan, approval, deployment_root, accepted_at=now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'))
            authorized_at = now.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
            intent = {'contract': INSTALL_PLAN + '_INTENT', 'operationId': plan['operationId'],
                'planSha256': digest(canonical(plan)), 'approvalSha256': digest(canonical(approval)),
                'authorizedAt': authorized_at}
            receipt = {'contract': INSTALL_RECEIPT, 'decision': 'PASS',
                'operationId': plan['operationId'], 'planSha256': digest(canonical(plan)),
                'approvalSha256': digest(canonical(approval)), 'intentSha256': digest(canonical(intent)),
                'bundleSha256': plan['bundleSha256'], 'publicRoots': plan['publicRoots'],
                'hostIdentitySha256': plan['hostIdentitySha256'], 'acceptedAt': authorized_at}
            enrollment = {'contract': ENROLLMENT, 'decision': 'ACCEPTED',
                'hostIdentitySha256': plan['hostIdentitySha256'], 'bundleFiles': plan['bundleFiles'],
                'bundleSha256': plan['bundleSha256'], 'publicRoots': plan['publicRoots'],
                'installerReceiptSha256': digest(canonical(receipt))}
            operation.mkdir(mode=0o700)
            sync_directory(self.state)
            _publish_new(operation, 'plan.json', canonical(plan))
            _publish_new(operation, 'approval.json', canonical(approval))
            _publish_new(operation, 'intent.json', canonical(intent))
            _stage_tree(temporary, members, directories, roots, {
                'installer-plan.json': plan, 'installer-approval.json': approval,
                'installer-intent.json': intent, 'installer-receipt.json': receipt,
                'enrollment.json': enrollment})
            require(verify_bundle_inventory(temporary / 'bundle', plan['bundleFiles']),
                    'Staged standalone bundle changed')
            libc = ctypes.CDLL(None, use_errno=True)
            rename = libc.renameat2
            rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
            rename.restype = ctypes.c_int
            if rename(-100, os.fsencode(temporary), -100, os.fsencode(final), 1) != 0:
                error = ctypes.get_errno()
                raise OSError(error, os.strerror(error), str(final))
            sync_directory(self.installed_parent)
            require(verify_bundle_inventory(final / 'bundle', plan['bundleFiles']),
                    'Installed standalone bundle changed after rename')
            validate_installer_receipt(plan, approval, receipt, deployment_root)
            validate_enrollment_chain(final / 'enrollment', enrollment, deployment_root)
            _publish_new(operation, 'receipt.json', canonical(receipt))
            return {'decision': 'INSTALLED_PUBLIC_ONLY_NOT_ACTIVE',
                    'operationId': plan['operationId'], 'bundleSha256': plan['bundleSha256'],
                    'receiptSha256': digest(canonical(receipt))}

    def reconcile(self, plan, approval):
        with _install_locks(self.install_lock, self.control_lock):
            validate_install_plan(plan)
            operation = secure_directory(self.state / plan['operationId'])
            require(secure_read(operation / 'plan.json', 65536) == canonical(plan) and
                    secure_read(operation / 'approval.json', 65536) == canonical(approval),
                    'Installer operation lineage changed')
            intent = json.loads(secure_read(operation / 'intent.json', 65536))
            require(intent['planSha256'] == digest(canonical(plan)) and
                    intent['approvalSha256'] == digest(canonical(approval)),
                    'Installer intent differs from exact plan')
            deployment_root = secure_read(self.deployment_root, 4096).decode('ascii')
            validate_install_approval(plan, approval, deployment_root, accepted_at=intent['authorizedAt'])
            final = self.installed_parent / plan['bundleSha256']
            if not final.exists():
                return {'decision': 'NO_INSTALLED_EFFECT_REQUIRES_SIGNED_RECOVERY'}
            secure_directory(final)
            enrollment_root = secure_directory(final / 'enrollment')
            receipt_raw = secure_read(enrollment_root / 'installer-receipt.json', 65536)
            receipt = json.loads(receipt_raw)
            require(receipt_raw == canonical(receipt) and
                    digest(canonical(intent)) == receipt['intentSha256'],
                    'Installed receipt is not bound to the original timely intent')
            validate_installer_receipt(plan, approval, receipt, deployment_root)
            require(verify_bundle_inventory(final / 'bundle', plan['bundleFiles']),
                    'Installed bundle changed')
            enrollment_raw = secure_read(enrollment_root / 'enrollment.json', 65536)
            enrollment = json.loads(enrollment_raw)
            require(enrollment_raw == canonical(enrollment),
                    'Installed enrollment is not canonical')
            validate_enrollment_chain(enrollment_root, enrollment, deployment_root)
            require({item.name for item in final.iterdir()} == {'bundle', 'enrollment'},
                    'Installed bundle root has a foreign leaf')
            existing = operation / 'receipt.json'
            if existing.exists():
                require(secure_read(existing, 65536) == receipt_raw,
                        'State receipt differs from installed enrollment')
                return {'decision': 'ALREADY_INSTALLED_PUBLIC_ONLY',
                        'receiptSha256': digest(receipt_raw)}
            _publish_new(operation, 'receipt.json', receipt_raw)
            return {'decision': 'RECONCILED_INSTALLED_PUBLIC_ONLY',
                    'receiptSha256': digest(receipt_raw)}
