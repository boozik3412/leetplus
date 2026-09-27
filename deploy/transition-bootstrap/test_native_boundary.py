"""Disposable root/Linux fixtures; no production paths, services or providers."""
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('transition_native_boundary',
    Path(__file__).with_name('native_boundary.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
OPERATION = '12345678-1234-4123-8123-123456789abc'
OLD = '/usr/local/lib/leetplus-compose/' + 'a' * 40 + '/control.sh'
NEW = '/usr/local/lib/leetplus-compose/' + 'b' * 40 + '/control.sh'


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'getuid') and os.getuid() == 0,
                     'Real native root/flock fixtures require Linux root')
class NativeBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='leetplus-transition-source-', dir='/run'))
        self.root.chmod(0o700)
        self.state = self.root / 'state'
        self.state.mkdir(mode=0o700)
        self.install = self.root / 'install.lock'
        self.control = self.root / 'control.lock'
        self.singleton = self.root / 'transition.lock'
        for path in (self.install, self.control, self.singleton):
            path.touch(mode=0o600)
        self.core = self.root / 'core'
        self.core.symlink_to(OLD)
        self.quiescence_ok = True

        def quiescence():
            native.require(self.quiescence_ok, 'Pending application, orphan or unsafe worker state')

        self.boundary = native.NativeBoundary(install_lock=self.install, control_lock=self.control,
            transition_lock=self.singleton, state_root=self.state, core_pointer=self.core,
            assert_quiescence=quiescence)

    def tearDown(self):
        # Exact test-owned temporary directory under /run; no shared paths.
        shutil.rmtree(self.root)

    def test_pointer_requires_write_lock_and_intent_publication_is_exclusive(self):
        with self.assertRaisesRegex(ValueError, 'Exclusive'):
            self.boundary.compare_and_swap_pointer(OLD, NEW)
        with self.boundary.with_locks('READ'):
            self.assertEqual(self.boundary.read_operation(OPERATION), {})
            self.assertEqual(self.boundary.read_pointer(), OLD)
            with self.assertRaisesRegex(ValueError, 'Exclusive'):
                self.boundary.compare_and_swap_pointer(OLD, NEW)
        self.assertFalse((self.state / OPERATION).exists())
        with self.boundary.with_locks('WRITE'):
            self.boundary.publish_exclusive(OPERATION, 'intent', {'operationId': OPERATION})
            with self.assertRaisesRegex(ValueError, 'Existing native final'):
                self.boundary.publish_exclusive(OPERATION, 'intent', {'operationId': OPERATION})
            self.boundary.compare_and_swap_pointer(OLD, NEW)
            self.assertEqual(self.boundary.read_pointer(), NEW)
            self.assertEqual(self.boundary.read_operation(OPERATION)['intent'], {'operationId': OPERATION})

    def test_rejects_unexpected_target_leaf_mutated_leaf_symlink_and_hardlink(self):
        target = self.root / 'target'
        target.mkdir(mode=0o700)
        leaf = target / 'control.sh'
        leaf.write_bytes(b'exact source\n')
        leaf.chmod(0o400)
        expected = {'control.sh': hashlib.sha256(leaf.read_bytes()).hexdigest()}
        self.assertTrue(native.verify_flat_inventory(target, expected))
        leaf.chmod(0o600)
        leaf.write_bytes(b'mutated source\n')
        with self.assertRaisesRegex(ValueError, 'Privileged native leaf changed'):
            native.verify_flat_inventory(target, expected)
        leaf.unlink()
        leaf.symlink_to(self.install)
        with self.assertRaises(OSError):
            native.verify_flat_inventory(target, expected)
        leaf.unlink()
        os.link(self.install, leaf)
        with self.assertRaisesRegex(ValueError, 'Untrusted native file'):
            native.verify_flat_inventory(target, expected)

    def test_rejects_absent_symlink_directory_and_writable_locks(self):
        self.singleton.unlink()
        for kind in ('absent', 'symlink', 'directory', 'writable'):
            if kind == 'symlink':
                self.singleton.symlink_to(self.control)
            elif kind == 'directory':
                self.singleton.mkdir(mode=0o700)
            elif kind == 'writable':
                self.singleton.touch(mode=0o666)
                self.singleton.chmod(0o666)
            with self.assertRaises((ValueError, OSError)):
                with self.boundary.with_locks('WRITE', timeout=0.1):
                    self.fail('Untrusted origin reached callback')
            if self.singleton.is_symlink() or self.singleton.is_file():
                self.singleton.unlink()
            elif self.singleton.is_dir():
                self.singleton.rmdir()

    def test_real_global_writer_prevents_source_boundary_effect(self):
        code = 'import fcntl,sys,time; f=open(sys.argv[1],"rb"); fcntl.flock(f,fcntl.LOCK_EX); print("LOCKED",flush=True); time.sleep(5)'
        child = subprocess.Popen([sys.executable, '-c', code, str(self.control)],
                                 stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), 'LOCKED')
            with self.assertRaisesRegex(ValueError, 'lock wait timed out'):
                with self.boundary.with_locks('WRITE', timeout=0.05):
                    self.fail('Conflicting global writer reached effect')
            self.assertEqual(os.readlink(self.core), OLD)
            self.assertEqual(list(self.state.iterdir()), [])
        finally:
            child.terminate()
            child.wait(timeout=5)
            child.stdout.close()

    def test_orphan_or_pending_operation_blocks_even_with_native_locks(self):
        self.quiescence_ok = False
        with self.assertRaisesRegex(ValueError, 'Pending application'):
            with self.boundary.with_locks('WRITE'):
                self.fail('Unsafe worker state reached effect')
        self.assertEqual(os.readlink(self.core), OLD)

    def test_pointer_cas_and_foreign_record_are_fail_closed(self):
        with self.boundary.with_locks('WRITE'):
            with self.assertRaisesRegex(ValueError, 'CAS mismatch'):
                self.boundary.compare_and_swap_pointer(NEW, OLD)
            self.boundary.publish_exclusive(OPERATION, 'intent', {'operationId': OPERATION})
            directory = self.state / OPERATION
            (directory / 'foreign.json').write_bytes(b'{}\n')
            with self.assertRaisesRegex(ValueError, 'Unexpected transition state leaf'):
                self.boundary.read_operation(OPERATION)

    def test_crashes_leave_only_recoverable_temporary_or_complete_final_record(self):
        for index, stage in enumerate(('after-partial-write', 'after-file-fsync', 'before-rename', 'after-rename')):
            operation = f'12345678-1234-4123-8123-{index:012x}'
            def crash(observed):
                if observed == stage:
                    raise RuntimeError('source fixture crash')
            self.boundary._fault = crash
            with self.boundary.with_locks('WRITE'):
                with self.assertRaisesRegex(RuntimeError, 'fixture crash'):
                    self.boundary.publish_exclusive(operation, 'intent', {'operationId': operation})
            self.boundary._fault = lambda _stage: None
            with self.boundary.with_locks('WRITE'):
                record = self.boundary.read_operation(operation)
                if stage == 'after-rename':
                    self.assertEqual(record['intent'], {'operationId': operation})
                else:
                    self.assertEqual(record, {})
                    self.boundary.publish_exclusive(operation, 'intent', {'operationId': operation})
                    self.assertEqual(self.boundary.read_operation(operation)['intent'], {'operationId': operation})

    def test_signed_zero_effect_primitive_recovers_only_exact_pointer_temporary(self):
        for old, new in ((OLD, NEW), (NEW, OLD)):
            for stage in ('after-pointer-symlink', 'before-pointer-rename'):
                self.core.unlink()
                self.core.symlink_to(old)
                def crash(observed):
                    if observed == stage:
                        raise RuntimeError('source pointer crash')
                self.boundary._fault = crash
                with self.boundary.with_locks('WRITE'):
                    with self.assertRaisesRegex(RuntimeError, 'pointer crash'):
                        self.boundary.compare_and_swap_pointer(old, new)
                    self.assertEqual(self.boundary.read_pointer(), old)
                    temporary = self.core.with_name('core.bootstrap-new')
                    self.assertTrue(temporary.is_symlink())
                    foreign = '/usr/local/lib/leetplus-compose/' + 'c' * 40 + '/control.sh'
                    with self.assertRaisesRegex(ValueError, 'Foreign pointer temporary'):
                        self.boundary.recover_pointer_temporary(old, foreign)
                    self.boundary.recover_pointer_temporary(old, new)
                    self.assertFalse(temporary.is_symlink())
                    self.boundary._fault = lambda _stage: None
                    self.boundary.compare_and_swap_pointer(old, new)
                    self.assertEqual(self.boundary.read_pointer(), new)


if __name__ == '__main__':
    unittest.main()
