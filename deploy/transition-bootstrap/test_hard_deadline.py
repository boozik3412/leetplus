"""Disposable process-group fixture: hanging lock owner is killed on time."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest


@unittest.skipUnless(os.name == 'posix', 'Kernel flock/process-group deadline requires POSIX')
class HardDeadlineTests(unittest.TestCase):
    def test_blocking_dispatch_releases_kernel_lock_after_hard_bound(self):
        import fcntl
        root = Path(tempfile.mkdtemp(prefix='leetplus-hard-deadline-', dir='/tmp')).resolve()
        lock = root / 'control.lock'
        lock.touch(mode=0o600)
        source = Path(__file__).resolve().parent
        code = '''import fcntl,os,sys,time
from hard_deadline import hard_deadline
root=sys.argv[1];lock=sys.argv[2]
with hard_deadline(0.8,root,python=sys.executable):
    with open(lock,'rb') as stream:
        fcntl.flock(stream,fcntl.LOCK_EX)
        print('LOCKED',flush=True)
        time.sleep(30)
'''
        child = subprocess.Popen([sys.executable, '-B', '-c', code, str(root), str(lock)],
            cwd=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, start_new_session=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), 'LOCKED')
            child.wait(timeout=5)
            self.assertEqual(child.returncode, -9)
            with open(lock, 'rb') as stream:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            receipt = json.loads((root / 'hard-deadline.json').read_bytes())
            self.assertEqual(receipt['decision'], 'ABNORMAL_PARENT_EXIT_OR_HARD_DEADLINE')
            self.assertEqual(receipt['reason'], 'TIMEOUT')
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=5)
            child.stdout.close()
            child.stderr.close()
            trusted = Path('/tmp').resolve()
            if root != trusted and root.is_relative_to(trusted):
                shutil.rmtree(root)

    def test_hanging_node_child_dies_with_host_process_group(self):
        root = Path(tempfile.mkdtemp(prefix='leetplus-deadline-child-', dir='/tmp')).resolve()
        lock = root / 'control.lock'
        lock.touch(mode=0o600)
        source = Path(__file__).resolve().parent
        node = os.environ.get('BOOTSTRAP_TEST_NODE') or shutil.which('node')
        self.assertTrue(node)
        code = '''import fcntl,os,subprocess,sys,time
from hard_deadline import hard_deadline
root,lock,node=sys.argv[1:]
with hard_deadline(0.8,root,python=sys.executable):
    with open(lock,'rb') as stream:
        fcntl.flock(stream,fcntl.LOCK_EX)
        child=subprocess.Popen([node,'-e','setInterval(()=>{},1000)'],start_new_session=False)
        with open(os.path.join(root,'node.pid'),'w') as output:output.write(str(child.pid))
        print('LOCKED',flush=True)
        time.sleep(30)
'''
        child = subprocess.Popen([sys.executable, '-B', '-c', code,
            str(root), str(lock), node], cwd=source, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, start_new_session=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), 'LOCKED')
            node_pid = int((root / 'node.pid').read_text())
            child.wait(timeout=5)
            self.assertEqual(child.returncode, -9)
            with open(lock, 'rb') as stream:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            for _ in range(30):
                state = Path(f'/proc/{node_pid}/stat')
                if not state.exists() or state.read_text().split()[2] == 'Z':
                    break
                time.sleep(0.1)
            else:
                self.fail('Node child survived hard process-group deadline')
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=5)
            child.stdout.close()
            child.stderr.close()
            trusted = Path('/tmp').resolve()
            if root != trusted and root.is_relative_to(trusted):
                shutil.rmtree(root)

    def test_parent_sigkill_closes_watch_pipe_and_kills_hanging_node(self):
        root = Path(tempfile.mkdtemp(prefix='leetplus-deadline-eof-', dir='/tmp')).resolve()
        source = Path(__file__).resolve().parent
        node = os.environ.get('BOOTSTRAP_TEST_NODE') or shutil.which('node')
        self.assertTrue(node)
        code = '''import os,subprocess,sys,time
from hard_deadline import hard_deadline
root,node=sys.argv[1:]
with hard_deadline(4,root,python=sys.executable):
    child=subprocess.Popen([node,'-e','setInterval(()=>{},1000)'],start_new_session=False)
    with open(os.path.join(root,'node.pid'),'w') as output:output.write(str(child.pid))
    print('CHILD_READY',flush=True)
    time.sleep(30)
'''
        child = subprocess.Popen([sys.executable, '-B', '-c', code, str(root), node],
            cwd=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, start_new_session=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), 'CHILD_READY')
            node_pid = int((root / 'node.pid').read_text())
            child.kill()
            child.wait(timeout=5)
            for _ in range(30):
                state = Path(f'/proc/{node_pid}/stat')
                if not state.exists() or state.read_text().split()[2] == 'Z':
                    break
                time.sleep(0.1)
            else:
                self.fail('Node child survived abnormal parent exit')
            receipt = json.loads((root / 'hard-deadline.json').read_bytes())
            self.assertEqual(receipt['reason'], 'PARENT_EOF')
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=5)
            child.stdout.close()
            child.stderr.close()
            trusted = Path('/tmp').resolve()
            if root != trusted and root.is_relative_to(trusted):
                shutil.rmtree(root)

    def test_controlled_authority_rejection_exits_without_false_parent_crash(self):
        root = Path(tempfile.mkdtemp(prefix='leetplus-deadline-reject-', dir='/tmp')).resolve()
        source = Path(__file__).resolve().parent
        code = '''import sys
from hard_deadline import hard_deadline
with hard_deadline(2,sys.argv[1],python=sys.executable):
    raise ValueError('expected source rejection')
'''
        child = subprocess.Popen([sys.executable, '-B', '-c', code, str(root)],
            cwd=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, start_new_session=True)
        try:
            child.communicate(timeout=5)
            self.assertEqual(child.returncode, 1)
            self.assertFalse((root / 'hard-deadline.json').exists())
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=5)
            child.stdout.close()
            child.stderr.close()
            trusted = Path('/tmp').resolve()
            if root != trusted and root.is_relative_to(trusted):
                shutil.rmtree(root)


if __name__ == '__main__':
    unittest.main()
