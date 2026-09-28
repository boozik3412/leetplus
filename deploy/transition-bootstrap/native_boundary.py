"""Source-only POSIX primitives for an independently admitted host adapter.

No CLI, installer, target import or production activation is provided. A real
adapter must independently prove complete host observations before using these
primitives. Paths are constructor-bound by the admitted adapter, not a plan.
"""
import contextlib
import ctypes
import hashlib
import json
import os
import re
import stat
import time
from pathlib import Path


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def secure_read(path, limit=16 * 1024 * 1024):
    """No symlink ancestors; compare fd/path inode before and after bounded read."""
    path = Path(path)
    require(path.is_absolute(), 'Absolute admitted path required')
    for parent in reversed(path.parents):
        info = parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                'Untrusted native ancestor')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and
                not info.st_mode & 0o022 and info.st_size <= limit, 'Untrusted native file')
        require((path.lstat().st_dev, path.lstat().st_ino) == (info.st_dev, info.st_ino),
                'Native file origin changed')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            value = stream.read(limit + 1)
        after = os.fstat(fd)
        require(len(value) <= limit and len(value) == info.st_size and
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) ==
                (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns) and
                (path.lstat().st_dev, path.lstat().st_ino) == (info.st_dev, info.st_ino),
                'Native file changed while reading')
        return value
    finally:
        os.close(fd)


def secure_directory(path):
    path = Path(path)
    for entry in [*reversed(path.parents), path]:
        info = entry.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                'Untrusted native directory')
    return path


def sync_directory(path):
    fd = os.open(secure_directory(path), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def verify_flat_inventory(root, expected):
    """Read every admitted leaf before any target code could be imported."""
    root = secure_directory(root)
    require(isinstance(expected, dict) and 0 < len(expected) <= 512 and
            all(re.fullmatch(r'[A-Za-z0-9_.@-]+', leaf) and leaf not in ('.', '..') and
                re.fullmatch(r'[a-f0-9]{64}', value) for leaf, value in expected.items()),
            'Invalid independently admitted inventory')
    require({leaf.name for leaf in root.iterdir()} == set(expected), 'Native leaf inventory differs')
    for leaf, expected_digest in expected.items():
        require(hashlib.sha256(secure_read(root / leaf)).hexdigest() == expected_digest,
                'Privileged native leaf changed')
    return True


class NativeBoundary:
    """Lock and durable-CAS primitives only; no complete observation authority."""

    def __init__(self, *, install_lock, control_lock, transition_lock, state_root,
                 core_pointer, assert_quiescence):
        require(os.name == 'posix' and os.getuid() == 0, 'POSIX root boundary required')
        require(callable(assert_quiescence), 'Independent quiescence observer required')
        self.install_lock = Path(install_lock)
        self.control_lock = Path(control_lock)
        self.transition_lock = Path(transition_lock)
        self.state_root = secure_directory(state_root)
        self.core_pointer = Path(core_pointer)
        secure_directory(self.core_pointer.parent)
        self.assert_quiescence = assert_quiescence
        self._held = None

    @contextlib.contextmanager
    def with_locks(self, mode, timeout=120):
        import fcntl
        require(mode in ('READ', 'WRITE') and 0 < timeout <= 120 and self._held is None,
                'Invalid or nested bootstrap lock window')
        fds = []
        deadline = time.monotonic() + timeout
        try:
            # Global production install -> Compose control -> transition singleton.
            for path, lock_mode in [(self.install_lock, fcntl.LOCK_SH if mode == 'READ' else fcntl.LOCK_EX),
                                    (self.control_lock, fcntl.LOCK_SH if mode == 'READ' else fcntl.LOCK_EX),
                                    (self.transition_lock, fcntl.LOCK_EX)]:
                secure_read(path, 65536)
                fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
                fds.append(fd)
                info = os.fstat(fd)
                require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and
                        not info.st_mode & 0o077, 'Untrusted existing bootstrap lock')
                while True:
                    try:
                        fcntl.flock(fd, lock_mode | fcntl.LOCK_NB)
                        break
                    except BlockingIOError:
                        require(time.monotonic() < deadline, 'Bootstrap lock wait timed out')
                        time.sleep(0.01)
                require((path.lstat().st_dev, path.lstat().st_ino) == (info.st_dev, info.st_ino),
                        'Bootstrap lock inode changed')
            self._held = mode
            self.assert_quiescence()
            yield self
        finally:
            self._held = None
            for fd in reversed(fds):
                os.close(fd)

    def read_pointer(self):
        info = self.core_pointer.lstat()
        require(stat.S_ISLNK(info.st_mode) and info.st_uid == 0, 'Untrusted serving pointer')
        value = os.readlink(self.core_pointer)
        require(re.fullmatch(r'/usr/local/lib/leetplus-compose/[a-f0-9]{40}/control.sh', value),
                'Noncanonical serving pointer')
        return value

    def compare_and_swap_pointer(self, old, new):
        require(self._held == 'WRITE' and old != new and
                re.fullmatch(r'/usr/local/lib/leetplus-compose/[a-f0-9]{40}/control.sh', new),
                'Exclusive bounded pointer effect required')
        require(self.read_pointer() == old, 'Serving pointer CAS mismatch')
        temporary = self.core_pointer.with_name(self.core_pointer.name + '.bootstrap-new')
        require(not temporary.exists() and not temporary.is_symlink(), 'Pending pointer temporary requires reconciliation')
        os.symlink(new, temporary)
        self._fault('after-pointer-symlink')
        # Do not delete ambiguous residue or retry a failed rename. Native
        # exclusive control ownership is required through fsync and postimage.
        require(self.read_pointer() == old, 'Serving pointer changed before rename')
        self._fault('before-pointer-rename')
        os.replace(temporary, self.core_pointer)
        sync_directory(self.core_pointer.parent)
        require(self.read_pointer() == new, 'Serving pointer postimage differs')

    def recover_pointer_temporary(self, expected_pointer, expected_temporary):
        """Only a separately signed zero-effect caller may invoke this primitive."""
        require(self._held == 'WRITE' and self.read_pointer() == expected_pointer and
                expected_pointer != expected_temporary and
                re.fullmatch(r'/usr/local/lib/leetplus-compose/[a-f0-9]{40}/control.sh', expected_temporary),
                'Exact signed pointer residue recovery required')
        temporary = self.core_pointer.with_name(self.core_pointer.name + '.bootstrap-new')
        if not temporary.exists() and not temporary.is_symlink():
            return
        info = temporary.lstat()
        require(stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and
                os.readlink(temporary) == expected_temporary,
                'Foreign pointer temporary cannot be removed')
        require((temporary.lstat().st_dev, temporary.lstat().st_ino) == (info.st_dev, info.st_ino) and
                self.read_pointer() == expected_pointer, 'Pointer residue origin changed')
        temporary.unlink()
        sync_directory(temporary.parent)

    def operation_directory(self, identity, *, create=False):
        require(re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', identity),
                'Exact transition operation required')
        directory = self.state_root / identity
        if not directory.exists():
            if not create:
                return None
            require(self._held == 'WRITE', 'Write lock required to create operation')
            directory.mkdir(mode=0o700)
            sync_directory(self.state_root)
        return secure_directory(directory)

    def publish_exclusive(self, identity, name, value):
        require(self._held == 'WRITE' and name in ('intent', 'receipt', 'rollbackIntent', 'rollbackReceipt',
                                                 'terminalNoEffect', 'rollbackNoEffect'),
                'Exclusive native record publication required')
        directory = self.operation_directory(identity, create=True)
        path = directory / (name + '.json')
        temporary = directory / ('.' + name + '.pending')
        self._recover_unpublished_temporary(directory, name)
        raw = canonical(value)
        require(len(raw) <= 16 * 1024 * 1024 and not path.exists() and not path.is_symlink(),
                'Existing native final record must never be overwritten')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
        with os.fdopen(fd, 'wb') as stream:
            midpoint = max(1, len(raw) // 2)
            stream.write(raw[:midpoint])
            self._fault('after-partial-write')
            stream.write(raw[midpoint:])
            stream.flush()
            os.fsync(stream.fileno())
        self._fault('after-file-fsync')
        require(secure_read(temporary) == raw, 'Native temporary publication changed')
        # Linux renameat2(RENAME_NOREPLACE) gives one complete final inode and
        # no hardlink residue. The final name cannot replace an old receipt.
        libc = ctypes.CDLL(None, use_errno=True)
        rename = libc.renameat2
        rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
        self._fault('before-rename')
        if rename(-100, os.fsencode(temporary), -100, os.fsencode(path), 1) != 0:
            error = ctypes.get_errno()
            raise OSError(error, os.strerror(error), str(path))
        self._fault('after-rename')
        sync_directory(directory)
        require(secure_read(path) == raw, 'Native publication postimage differs')

    def _fault(self, _stage):
        """Test-only crash point. A production adapter does not override it."""

    def _recover_unpublished_temporary(self, directory, name):
        temporary = directory / ('.' + name + '.pending')
        if not temporary.exists() and not temporary.is_symlink():
            return
        info = temporary.lstat()
        require(self._held == 'WRITE' and stat.S_ISREG(info.st_mode) and info.st_uid == 0 and
                info.st_nlink == 1 and not info.st_mode & 0o077 and info.st_size <= 16 * 1024 * 1024,
                'Untrusted unpublished native temporary')
        # This name is never authority. A crash before atomic rename could
        # leave partial bytes; the authoritative final record is separate.
        temporary.unlink()
        sync_directory(directory)

    def read_operation(self, identity):
        require(self._held in ('READ', 'WRITE'), 'Native lock required to read operation')
        directory = self.operation_directory(identity)
        if directory is None:
            return {}
        names = ('intent', 'receipt', 'rollbackIntent', 'rollbackReceipt',
                 'terminalNoEffect', 'rollbackNoEffect')
        if self._held == 'WRITE':
            for name in names:
                self._recover_unpublished_temporary(directory, name)
        allowed = {name + '.json' for name in names}
        require({leaf.name for leaf in directory.iterdir()} <= allowed, 'Unexpected transition state leaf')
        result = {}
        for name in names:
            path = directory / (name + '.json')
            if path.exists() or path.is_symlink():
                raw = secure_read(path)
                value = json.loads(raw)
                require(raw == canonical(value), 'Noncanonical transition record')
                result[name] = value
        return result
