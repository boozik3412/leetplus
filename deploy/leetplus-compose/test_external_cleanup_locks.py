import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path


COMPOSE = Path(__file__).resolve().parent
CONTROL_SH = COMPOSE / 'control.sh'
LOCKS = COMPOSE / 'control-locks.mjs'
CONTRACT = COMPOSE / 'contract.mjs'


def wait_for(path, process, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            return
        if process.poll() is not None:
            stdout, stderr = process.communicate()
            raise AssertionError(f'{process.args!r} exited {process.returncode}: {stdout}\n{stderr}')
        time.sleep(0.02)
    raise AssertionError(f'timed out waiting for {path.name}')


class ExternalCleanupLocksTest(unittest.TestCase):
    def test_linux_external_cleanup_lock_boundary(self):
        if not sys.platform.startswith('linux'):
            self.skipTest('requires Linux flock and /proc/locks')
        if os.geteuid() != 0:
            if os.environ.get('GITHUB_ACTIONS') == 'true' and shutil.which('sudo'):
                result = subprocess.run(['sudo', '-n', sys.executable, str(Path(__file__).resolve())],
                                        capture_output=True, text=True, timeout=90)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                return
            self.skipTest('root fixture runs only as root or with GitHub Actions sudo')
        self.run_root_fixture()

    def run_root_fixture(self):
        with tempfile.TemporaryDirectory(prefix='leetplus-external-cleanup-lock-') as temporary:
            root = Path(temporary)
            control_root, state = root / 'control', root / 'state'
            control_root.mkdir(mode=0o700); state.mkdir(mode=0o700)
            for name in ['control.lock', 'langame-external-daily-worker.lock', 'bonus-ledger-worker.lock']:
                (state / name).touch(mode=0o600)

            script = CONTROL_SH.read_text(encoding='utf-8').replace('/var/lib/leetplus-compose', str(state))
            script = script.replace('^/usr/local/lib/leetplus-compose/[a-f0-9]{40}$', f'^{re.escape(str(control_root))}$')
            node = shutil.which('node')
            if node and node != '/usr/bin/node':
                script = script.replace('/usr/bin/node "$control_root/control.mjs"', f'{node} "$control_root/control.mjs"')
            bootstrap = control_root / 'control.sh'
            bootstrap.write_text(script, encoding='utf-8'); bootstrap.chmod(0o700)
            os.symlink(LOCKS, control_root / 'control-locks.mjs')
            os.symlink(CONTRACT, control_root / 'contract.mjs')
            stub = """import fs from 'node:fs';
import { controlLockPolicy, verifyKernelControlLocks, verifyExternalCleanupSingletonLock } from './control-locks.mjs';
const STATE=__STATE__; const [command,...args]=process.argv.slice(2); const options={};
for(let i=0;i<args.length;i+=2){if(!/^--[a-z-]+$/.test(args[i])||!args[i+1]||options[args[i].slice(2)])throw new Error('Expected unique named arguments');options[args[i].slice(2)]=args[i+1];}
const allowed=new Set(['prepare','worker-run','external-worker-run','external-worker-cleanup']);if(!allowed.has(command))throw new Error('Unknown fixture command');
const policy=controlLockPolicy(command,options);const locks=fs.readFileSync('/proc/locks','utf8').split('\\n');
if(command==='external-worker-cleanup')verifyExternalCleanupSingletonLock({singletonLock:fs.lstatSync(`${STATE}/langame-external-daily-worker.lock`),locks,parentPid:process.ppid});
else{const parent=policy.singleton?fs.readFileSync(`/proc/${process.ppid}/status`,'utf8'):'';verifyKernelControlLocks(policy,{globalLock:fs.lstatSync(`${STATE}/control.lock`),singletonLock:policy.singleton?fs.lstatSync(`${STATE}/${policy.singleton}.lock`):undefined,locks,parentPid:process.ppid,outerPid:parent.match(/^PPid:\\s+(\\d+)$/m)?.[1]});}
fs.writeFileSync(`${STATE}/ready-${command}`,'PASS');while(!fs.existsSync(`${STATE}/release`))await new Promise(r=>setTimeout(r,20));
""".replace('__STATE__', repr(str(state)))
            (control_root / 'control.mjs').write_text(stub, encoding='utf-8')

            processes = []
            def launch(*args):
                (state / f'ready-{args[0]}').unlink(missing_ok=True)
                process = subprocess.Popen([str(bootstrap), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                processes.append(process); return process
            def finish(process, expected=0):
                stdout, stderr = process.communicate(timeout=10)
                self.assertEqual(process.returncode, expected, stdout + stderr)

            try:
                # Cleanup bypasses a global WRITE holder; an ordinary READ worker cannot.
                writer = launch('prepare'); wait_for(state / 'ready-prepare', writer)
                cleanup = launch('external-worker-cleanup'); wait_for(state / 'ready-external-worker-cleanup', cleanup)
                ordinary = subprocess.run([str(bootstrap), 'worker-run', '--name', 'bonus-ledger-worker'],
                                          capture_output=True, text=True, timeout=5)
                self.assertNotEqual(ordinary.returncode, 0, ordinary.stdout + ordinary.stderr)
                (state / 'release').touch(); finish(writer); finish(cleanup)
                processes.clear(); (state / 'release').unlink()

                # Cleanup waits for the original external singleton holder, then runs.
                holder = launch('external-worker-run'); wait_for(state / 'ready-external-worker-run', holder)
                cleanup = launch('external-worker-cleanup'); time.sleep(0.25)
                self.assertFalse((state / 'ready-external-worker-cleanup').exists())
                (state / 'release').touch(); finish(holder)
                wait_for(state / 'ready-external-worker-cleanup', cleanup); finish(cleanup)
                processes.clear(); (state / 'release').unlink()

                # Missing, non-regular, and symlink/reparse singleton origins fail.
                lock = state / 'langame-external-daily-worker.lock'
                for kind in ['missing', 'directory', 'symlink']:
                    if lock.is_symlink() or lock.is_file(): lock.unlink()
                    elif lock.exists(): lock.rmdir()
                    if kind == 'directory': lock.mkdir(mode=0o700)
                    elif kind == 'symlink':
                        target = state / 'foreign.lock'; target.touch(mode=0o600, exist_ok=True); os.symlink(target, lock)
                    rejected = launch('external-worker-cleanup'); time.sleep(0.3)
                    if rejected.poll() is None:
                        rejected.terminate(); rejected.communicate(timeout=5)
                    self.assertFalse((state / 'ready-external-worker-cleanup').exists(), kind)
                    self.assertNotEqual(rejected.returncode, 0, kind)
                    processes.remove(rejected)

                for args in [('external-worker-cleanup', '--operation', 'stale'),
                             ('external-worker-cleanup', '--name', 'langame-external-daily-worker'),
                             ('external-worker-cleanup', 'unexpected')]:
                    rejected = subprocess.run([str(bootstrap), *args], capture_output=True, text=True, timeout=5)
                    self.assertNotEqual(rejected.returncode, 0, args)
            finally:
                (state / 'release').touch()
                for process in processes:
                    if process.poll() is None:
                        process.terminate(); process.communicate(timeout=5)


if __name__ == '__main__':
    unittest.main()
