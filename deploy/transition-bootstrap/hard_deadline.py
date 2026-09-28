"""Independent child watchdog for the entire native lock-owning process."""
import contextlib
import os
from pathlib import Path
import signal
import subprocess

WATCH = r'''import json,os,select,signal,sys
fd=int(sys.argv[1]); pgid=int(sys.argv[2]); seconds=float(sys.argv[3]); directory=sys.argv[4]
ready,_,_=select.select([fd],[],[],seconds)
token=os.read(fd,1) if ready else b''
if token!=b'X':
    try:
        path=os.path.join(directory,'hard-deadline.json')
        raw=(json.dumps({'decision':'ABNORMAL_PARENT_EXIT_OR_HARD_DEADLINE',
            'seconds':seconds,'reason':'PARENT_EOF' if ready else 'TIMEOUT'},sort_keys=True)+'\n').encode()
        out=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
        with os.fdopen(out,'wb') as stream:
            stream.write(raw);stream.flush();os.fsync(stream.fileno())
        parent=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fsync(parent)
        finally:os.close(parent)
    except Exception:
        pass
    try:os.killpg(pgid,signal.SIGKILL)
    except ProcessLookupError:pass
'''
CLEAN = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8',
         'LC_ALL': 'C.UTF-8', 'TZ': 'UTC', 'PYTHONNOUSERSITE': '1'}


@contextlib.contextmanager
def hard_deadline(seconds, audit_directory, *, python='/usr/bin/python3'):
    if os.name != 'posix' or not 0 < seconds <= 300:
        raise ValueError('Bounded POSIX hard deadline required')
    directory = Path(audit_directory)
    if not directory.is_absolute() or not directory.is_dir() or directory.is_symlink():
        raise ValueError('Exact existing hard-deadline audit directory required')
    if os.getpgrp() != os.getpid():
        os.setpgid(0, 0)
    if os.getpgrp() != os.getpid():
        raise ValueError('Native host must own a dedicated process group')
    read_fd, write_fd = os.pipe()
    child = None
    try:
        child = subprocess.Popen([python, '-I', '-B', '-c', WATCH, str(read_fd),
            str(os.getpgrp()), str(seconds), str(directory)],
            pass_fds=(read_fd,), stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env=CLEAN, start_new_session=True)
        os.close(read_fd)
        read_fd = -1
        yield
    finally:
        if read_fd >= 0:
            os.close(read_fd)
        # Normal watchdog completion means Python reached managed cleanup,
        # even when the operation itself rejected authority. SIGKILL cannot
        # execute this finally and is observed as pipe EOF by the watcher.
        os.write(write_fd, b'X')
        os.close(write_fd)
        if child is not None:
            try:
                child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=2)
