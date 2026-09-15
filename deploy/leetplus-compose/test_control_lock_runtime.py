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
STUB = COMPOSE / 'control-lock-runtime.test.mjs'


def wait_for(path, process, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            return
        if process.poll() is not None:
            stdout, stderr = process.communicate()
            raise AssertionError(f'{process.args!r} exited {process.returncode}: {stdout}\n{stderr}')
        time.sleep(0.02)
    raise AssertionError(f'timed out waiting for {path.name}')


class ControlLockRuntimeTest(unittest.TestCase):
    def test_actual_linux_flock_bootstrap(self):
        if not sys.platform.startswith('linux'):
            self.skipTest('requires Linux /proc locks')
        if os.geteuid() != 0:
            if os.environ.get('GITHUB_ACTIONS') == 'true' and shutil.which('sudo'):
                result = subprocess.run(['sudo', '-n', sys.executable, str(Path(__file__).resolve())], capture_output=True, text=True, timeout=60)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                return
            self.skipTest('root fixture runs only as root or with GitHub Actions sudo')
        self.run_root_fixture()

    def run_root_fixture(self):
        with tempfile.TemporaryDirectory(prefix='leetplus-control-lock-') as temporary:
            root = Path(temporary)
            control_root = root / 'control'
            state = root / 'state'
            control_root.mkdir(mode=0o700)
            state.mkdir(mode=0o700)
            # Validate the new oneshot/retry semantics without installing or
            # starting a unit. The pre-existing dependency/launcher is replaced
            # only in this disposable parser fixture.
            unit = (COMPOSE / 'leetplus-compose-network-refresh.service').read_text()
            unit = unit.replace('Requires=leetplus-compose-network.service\n', '').replace('After=leetplus-compose-network.service\n', '')
            unit = unit.replace('ExecStart=/usr/local/sbin/leetplus-compose-network refresh', 'ExecStart=/usr/bin/true')
            unit_path = root / 'leetplus-ci-refresh.service'
            unit_path.write_text(unit)
            checked = subprocess.run(['systemd-analyze', '--man=no', 'verify', str(unit_path)], capture_output=True, text=True, timeout=15)
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
            for name in ['control.lock', 'backup.lock', 'bonus-ledger-worker.lock', 'langame-daily-worker.lock', 'network-refresh.lock']:
                (state / name).touch(mode=0o600)

            script = CONTROL_SH.read_text(encoding='utf-8').replace('/var/lib/leetplus-compose', str(state))
            script = script.replace('^/usr/local/lib/leetplus-compose/[a-f0-9]{40}$', f'^{re.escape(str(control_root))}$')
            node_binary = shutil.which('node')
            if node_binary and node_binary != '/usr/bin/node':
                script = script.replace('/usr/bin/node "$control_root/control.mjs"', f'{node_binary} "$control_root/control.mjs"')
            bootstrap = control_root / 'control.sh'
            bootstrap.write_text(script, encoding='utf-8')
            bootstrap.chmod(0o700)
            os.symlink(LOCKS, control_root / 'control-locks.mjs')
            os.symlink(CONTRACT, control_root / 'contract.mjs')
            stub = STUB.read_text(encoding='utf-8').replace('__CONTROL_LOCK_RUNTIME_STATE__', str(state))
            (control_root / 'control.mjs').write_text(stub, encoding='utf-8')
            (control_root / 'control.mjs').chmod(0o700)

            processes = []

            def marker(command, value):
                return state / f'ready-{command}-{value}'

            def launch(*args):
                value = args[2] if len(args) == 3 and args[1] in ('--name', '--operation') else 'none'
                marker(args[0], value).unlink(missing_ok=True)
                process = subprocess.Popen([str(bootstrap), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                processes.append(process)
                return process

            def release_and_expect(process, expected=0):
                (state / 'release').touch()
                stdout, stderr = process.communicate(timeout=10)
                self.assertEqual(process.returncode, expected, stdout + stderr)

            try:
                worker = launch('worker-run', '--name', 'bonus-ledger-worker')
                wait_for(marker('worker-run', 'bonus-ledger-worker'), worker)
                refresh = launch('network', '--operation', 'refresh')
                wait_for(marker('network', 'refresh'), refresh)
                self.assertIsNone(worker.poll())
                self.assertIsNone(refresh.poll())
                release_and_expect(worker)
                release_and_expect(refresh)
                processes.clear()
                (state / 'release').unlink()

                first_refresh = launch('network', '--operation', 'refresh')
                wait_for(marker('network', 'refresh'), first_refresh)
                duplicate = subprocess.run([str(bootstrap), 'network', '--operation', 'refresh'], capture_output=True, text=True, timeout=5)
                self.assertEqual(duplicate.returncode, 75, duplicate.stdout + duplicate.stderr)
                release_and_expect(first_refresh)
                processes.clear()
                (state / 'release').unlink()

                controller = launch('prepare')
                wait_for(marker('prepare', 'none'), controller)
                blocked_refresh = launch('network', '--operation', 'refresh')
                time.sleep(0.2)
                self.assertFalse(marker('network', 'refresh').exists())
                self.assertIsNone(blocked_refresh.poll())
                release_and_expect(controller)
                wait_for(marker('network', 'refresh'), blocked_refresh)
                release_and_expect(blocked_refresh)
                processes.clear()
                (state / 'release').unlink()

                reader = launch('worker-run', '--name', 'bonus-ledger-worker')
                wait_for(marker('worker-run', 'bonus-ledger-worker'), reader)
                unknown = subprocess.run([str(bootstrap), 'network', '--operation', 'unknown'], capture_output=True, text=True, timeout=5)
                self.assertNotEqual(unknown.returncode, 0, unknown.stdout + unknown.stderr)
                mixed = subprocess.run([str(bootstrap), 'network', '--operation', 'refresh', '--name', 'bonus-ledger-worker'], capture_output=True, text=True, timeout=5)
                self.assertNotEqual(mixed.returncode, 0, mixed.stdout + mixed.stderr)
                release_and_expect(reader)
                processes.clear()
                (state / 'release').unlink()

                (state / 'network-refresh.lock').unlink()
                target = state / 'not-a-singleton.lock'
                target.touch(mode=0o600)
                os.symlink(target, state / 'network-refresh.lock')
                rejected = subprocess.run([str(bootstrap), 'network', '--operation', 'refresh'], capture_output=True, text=True, timeout=5)
                self.assertNotEqual(rejected.returncode, 0, rejected.stdout + rejected.stderr)
            finally:
                (state / 'release').touch()
                for process in processes:
                    if process.poll() is None:
                        process.communicate(timeout=10)


if __name__ == '__main__':
    unittest.main()
