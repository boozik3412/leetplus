"""Disposable Python/Node bridge fixture; no root, Docker or provider calls."""
import os
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import subprocess
import sys

from rpc_host import HostRPC, _run_child, _node_data_url, captured_node_url
TEST_NODE = os.environ.get('BOOTSTRAP_TEST_NODE') or shutil.which('node')


def captured_cli_fixture():
    root = Path(__file__).resolve().parents[2]
    names = ('deploy/transition-bootstrap/cli.mjs',
             'deploy/transition-bootstrap/protocol.mjs',
             'deploy/leetplus-compose/a-bridge-bootstrap-authority.mjs',
             'deploy/leetplus-compose/bridge-external-successor-authority.mjs')
    return {name: (root / name).read_bytes() for name in names}


@unittest.skipUnless(TEST_NODE, 'Captured Node fixture requires Node')
class CapturedNodeSourceTests(unittest.TestCase):
    def test_data_url_closes_protocol_and_authority_imports(self):
        files = captured_cli_fixture()
        original = captured_node_url(files, 'deploy/transition-bootstrap/protocol.mjs')
        observed = subprocess.run([TEST_NODE, '--input-type=module', '-e',
            'import fs from "node:fs";const m=await import(JSON.parse(fs.readFileSync(0,"utf8")));if(typeof m.validateNativePointerAuthority!=="function")process.exit(1)'],
            input=json.dumps(original).encode(), capture_output=True, timeout=15)
        self.assertEqual(observed.returncode, 0, observed.stderr.decode(errors='replace'))
        files['deploy/transition-bootstrap/protocol.mjs'] = b'throw Error("swapped")\n'
        self.assertNotIn(b'swapped', original.encode())
        again = subprocess.run([TEST_NODE, '--input-type=module', '-e',
            'import fs from "node:fs";const m=await import(JSON.parse(fs.readFileSync(0,"utf8")));if(typeof m.validateNativePointerAuthority!=="function")process.exit(1)'],
            input=json.dumps(original).encode(), capture_output=True, timeout=15)
        self.assertEqual(again.returncode, 0, again.stderr.decode(errors='replace'))

    def test_cli_url_is_bounded_and_uses_captured_dependency(self):
        url = captured_node_url(captured_cli_fixture(), 'deploy/transition-bootstrap/cli.mjs')
        self.assertTrue(url.startswith('data:text/javascript;base64,'))
        self.assertLessEqual(len(url), 120000)
        with tempfile.TemporaryDirectory(prefix='leetplus-captured-cli-url-') as directory:
            captured_url = Path(directory) / 'url.txt'
            captured_url.write_text(url, encoding='utf-8')
            child = subprocess.run([TEST_NODE, '--input-type=module', '-e',
                'import fs from "node:fs";await import(fs.readFileSync(process.argv[1],"utf8"));',
                str(captured_url)], input=b'{}\n', capture_output=True, timeout=15)
        self.assertNotEqual(child.returncode, 0)
        self.assertIn(b'Incomplete trusted native initialization', child.stderr)


@unittest.skipUnless(os.name == 'posix' and TEST_NODE,
                     'Bounded pipe/select bridge requires disposable POSIX Node')
class RpcHostTests(unittest.TestCase):
    @unittest.skipUnless(hasattr(os, 'getuid') and os.getuid() == 0,
                         'Root-only outer attempt finalizer fixture')
    def test_prechild_and_read_only_failures_leave_no_attempt_write(self):
        for phase in ('constructor', 'observation'):
            root = Path(tempfile.mkdtemp(prefix='leetplus-rpc-prechild-', dir='/run')).resolve()
            root.chmod(0o700)
            bundle_sha = 'a' * 64
            operation_id = '12345678-1234-4123-8123-123456789abc'
            attempt_id = '87654321-4321-4321-8321-abcdefabcdef'
            final = root / 'installed' / bundle_sha
            for directory in (root / 'installed', final, final / 'bundle', final / 'enrollment',
                              root / 'requests', root / 'requests' / operation_id, root / 'attempts'):
                directory.mkdir(mode=0o700)
            request = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RPC_V1',
                'command': 'observe', 'operationId': operation_id, 'attemptId': attempt_id,
                'mode': 'A_TO_BRIDGE', 'targetRelease': 'b' * 40,
                'criticalNames': [], 'evidence': {}, 'inputs': {}}
            (root / 'requests' / operation_id / 'request.json').write_text(
                json.dumps(request, indent=2) + '\n')
            code = '''import pathlib,sys
import rpc_host
from unittest.mock import patch
root=pathlib.Path(sys.argv[1]);phase=sys.argv[2]
rpc_host.ROOT=root/'installed';rpc_host.REQUESTS=root/'requests';rpc_host.ATTEMPTS=root/'attempts'
sha='a'*64;op='12345678-1234-4123-8123-123456789abc'
if phase=='constructor':
    with patch.object(rpc_host,'HostRPC',side_effect=RuntimeError('fixture constructor')),patch.object(rpc_host,'verify_runtime_provision_binding',return_value={}):
        rpc_host.main(['--bundle-sha256',sha,'--operation-id',op,'--request-id',op])
else:
    class Fake:
        receipt={'bundleSha256':sha}
    with patch.object(rpc_host,'HostRPC',return_value=Fake()),patch.object(rpc_host,'verify_runtime_provision_binding',return_value={}),patch.object(
        rpc_host,'_read_only_command',side_effect=RuntimeError('fixture observer')):
        rpc_host.main(['--bundle-sha256',sha,'--operation-id',op,'--request-id',op])
'''
            child = subprocess.Popen([sys.executable, '-B', '-c', code, str(root), phase],
                cwd=Path(__file__).resolve().parent, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True, start_new_session=True)
            try:
                child.communicate(timeout=8)
                self.assertFalse((root / 'attempts' / attempt_id).exists())
            finally:
                if child.poll() is None:
                    child.kill()
                    child.wait(timeout=5)
                child.stdout.close()
                child.stderr.close()
                trusted = Path('/run').resolve()
                if root != trusted and root.is_relative_to(trusted):
                    shutil.rmtree(root)

    def test_malicious_child_cannot_choose_foreign_native_pointer_or_command(self):
        calls = []
        class Native:
            def compare_and_swap_pointer(self, *_args):
                calls.append('CAS')
            def recover_pointer_temporary(self, *_args):
                calls.append('RECOVER')
        host = HostRPC.__new__(HostRPC)
        host.lock = object()
        host.native = Native()
        host.mode = 'A_TO_BRIDGE'
        host.target = 'b' * 40
        host.operation_id = '12345678-1234-4123-8123-123456789abc'
        host.request = {'command': 'apply', 'inputs': {'plan': {
            'operationId': host.operation_id, 'mode': host.mode,
            'expected': {'target': {'releaseSha': host.target}},
            'oldPointer': '/usr/local/lib/leetplus-compose/' + 'a' * 40 + '/control.sh',
            'newPointer': '/usr/local/lib/leetplus-compose/' + host.target + '/control.sh'}}}
        with self.assertRaisesRegex(ValueError, 'direction or exact target'):
            host.dispatch('pointer.cas', {'oldPointer': host.request['inputs']['plan']['oldPointer'],
                'newPointer': '/usr/local/lib/leetplus-compose/' + 'c' * 40 + '/control.sh'})
        with self.assertRaisesRegex(ValueError, 'direction or exact target|Unknown pointer effect direction'):
            host.dispatch('pointer.recover-temporary', {'oldPointer': host.request['inputs']['plan']['oldPointer'],
                'pendingTarget': host.request['inputs']['plan']['newPointer']})
        self.assertEqual(calls, [])

    def test_invalid_permit_releases_lock_without_any_native_effect(self):
        class FakeHost:
            request = {'command': 'prepare', 'mode': 'A_TO_BRIDGE',
                       'evidence': {'backupReceiptSha256': 'a' * 64,
                           'restoredCopyReceiptSha256': 'b' * 64,
                           'hostBaselineSha256': 'c' * 64}}
            roots = {'permit': 'invalid'}
            mode = 'A_TO_BRIDGE'
            calls = []
            def dispatch(self, method, args):
                self.calls.append(method)
                if method in ('lock.acquire', 'lock.release'):
                    return True
                if method == 'observe':
                    return {'expected': {}, 'protectedState': {}, 'pointer': 'invalid'}
                raise AssertionError('Target callback or native effect reached')
            def close(self):
                self.calls.append('close')

        fake = FakeHost()
        cli = Path(__file__).with_name('cli.mjs')
        with self.assertRaisesRegex(ValueError, 'Bootstrap child rejected authority'):
            _run_child(fake, captured_node_url(captured_cli_fixture(),
                'deploy/transition-bootstrap/cli.mjs'),
                {'permitEnvelope': {'permit': {}, 'signature': ''}},
                node_binary=TEST_NODE)
        self.assertEqual(fake.calls, ['lock.acquire', 'observe', 'lock.release', 'close'])

    @unittest.skipUnless(hasattr(os, 'getuid') and os.getuid() == 0,
                         'Root-only durable RPC audit fixture')
    def test_successful_child_with_failed_lock_close_records_non_success(self):
        root = Path(tempfile.mkdtemp(prefix='leetplus-rpc-audit-', dir='/run')).resolve()
        root.chmod(0o700)
        cli = root / 'fake.mjs'
        cli.write_text("process.stdin.once('data',()=>process.stdout.write(JSON.stringify({type:'result',result:{decision:'PASS'}})+'\\n',()=>process.exit(0)));\n")
        class FakeHost:
            request = {'command': 'apply', 'evidence': {}}
            mode = 'A_TO_BRIDGE'
            roots = {}
            def close(self):
                raise RuntimeError('test lock close failure')
        try:
            with self.assertRaisesRegex(RuntimeError, 'cleanup, lock release or audit'):
                _run_child(FakeHost(), _node_data_url(cli.read_bytes()), {},
                           node_binary=TEST_NODE, audit_dir=root)
            receipt = json.loads((root / 'rpc.exit.json').read_bytes())
            self.assertEqual(receipt['exitCode'], 0)
            self.assertFalse(receipt['lockReleaseSucceeded'])
            self.assertEqual(receipt['failureClass'], 'RuntimeError')
        finally:
            trusted = Path('/run').resolve()
            if root != trusted and root.is_relative_to(trusted):
                shutil.rmtree(root)

    @unittest.skipUnless(hasattr(os, 'getuid') and os.getuid() == 0,
                         'Root-only child crash stderr fixture')
    def test_crashed_child_retains_stderr_and_terminal_exit(self):
        root = Path(tempfile.mkdtemp(prefix='leetplus-rpc-crash-', dir='/run')).resolve()
        root.chmod(0o700)
        cli = root / 'crash.mjs'
        cli.write_text("process.stdin.once('data',()=>{process.stderr.write('fixture fatal\\n');process.exit(2)});\n")
        class FakeHost:
            request = {'command': 'apply', 'evidence': {}}
            mode = 'A_TO_BRIDGE'
            roots = {}
            def close(self):
                pass
        try:
            with self.assertRaisesRegex(ValueError, 'Closed or oversized'):
                _run_child(FakeHost(), _node_data_url(cli.read_bytes()), {},
                           node_binary=TEST_NODE, audit_dir=root)
            receipt = json.loads((root / 'rpc.exit.json').read_bytes())
            self.assertEqual(receipt['exitCode'], 2)
            self.assertTrue(receipt['lockReleaseSucceeded'])
            self.assertIn(b'fixture fatal', (root / 'rpc.stderr').read_bytes())
        finally:
            trusted = Path('/run').resolve()
            if root != trusted and root.is_relative_to(trusted):
                shutil.rmtree(root)


if __name__ == '__main__':
    unittest.main()
