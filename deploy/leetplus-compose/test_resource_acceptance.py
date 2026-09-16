"""Mocked native integration; never runs a container or systemd service."""
import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


def load(name, leaf):
    source = Path(__file__).with_name(leaf)
    spec = importlib.util.spec_from_file_location(name, source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


acceptance = load('native_acceptance_test', 'accept-rehearsal.py')
wrapper = load('resource_wrapper_test', 'run-resource-rehearsal.py')


class IntegrationTests(unittest.TestCase):
    def test_guarded_cold_start_waits_for_web_as_well_as_api(self):
        clock = [0]
        guard = types.SimpleNamespace(check=mock.Mock())
        sha = 'a' * 40
        ready = (200, {'ok': True, 'release': {'sha': sha}})
        responses = [ready, ConnectionRefusedError(), ready, (200, {'release': {'sha': sha}})]
        with mock.patch.object(acceptance, 'request', side_effect=responses) as request, \
             mock.patch.object(acceptance.time, 'monotonic', side_effect=lambda: clock[0]), \
             mock.patch.object(acceptance.time, 'sleep', side_effect=lambda seconds: clock.__setitem__(0, clock[0] + seconds)):
            acceptance.wait_slot_ready(24100, 23100, sha, guard)
        self.assertEqual(request.call_count, 4)
        self.assertEqual(clock[0], 1)

    def exercise(self, fail=False, cgroup=None):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'evidence').mkdir()
            (root / 'compose.json').write_text(json.dumps({'services': {'api-blue': {'mem_limit': '6g'}, 'api-green': {'mem_limit': '6g'}}}))
            order = []

            class Guard:
                def __init__(self, *args):
                    self.closed = False
                def __enter__(self):
                    order.append('guard-start')
                    return self
                def __exit__(self, *args):
                    order.append('cleanup')
                    self.closed = True
                def check(self):
                    pass
                def mark(self, label):
                    pass
                def finish_result(self):
                    assert self.closed
                    order.append('finish')
                    return {'decision': 'PASS'}

            def native(guard):
                order.append('native')
                return {'decision': 'PASS', 'releaseSha': 'a' * 40}

            def corpus(guard, result):
                order.append('corpus')
                self.assertFalse((root / 'evidence/runtime-acceptance.json').exists())
                if fail:
                    raise ValueError('corpus failed')
                return {'decision': 'PASS'}

            modules = {'rehearsal_memory_guard': types.SimpleNamespace(RehearsalMemoryGuard=Guard),
                       'resource_corpus': types.SimpleNamespace(run_corpus=corpus),
                       'resource_cooldown': types.SimpleNamespace(evaluate_cooldown=lambda result: {'decision': 'PASS'})}
            fake_cgroup = types.SimpleNamespace(read_text=lambda: cgroup or '0::/system.slice/leetplus-rehearsal-resource-acceptance.service')
            with mock.patch.object(acceptance, 'ROOT', root), mock.patch.object(acceptance, 'Path', return_value=fake_cgroup), \
                 mock.patch.object(acceptance, 'accept', side_effect=native), mock.patch.dict(sys.modules, modules), contextlib.redirect_stdout(io.StringIO()):
                if fail or cgroup:
                    with self.assertRaises(ValueError):
                        acceptance.run()
                    self.assertFalse((root / 'evidence/runtime-acceptance.json').exists())
                else:
                    acceptance.run()
                    receipt = json.loads((root / 'evidence/runtime-acceptance.json').read_text())
                    self.assertEqual(receipt['resourceAcceptance']['guard']['decision'], 'PASS')
                    self.assertEqual(receipt['apiResourceProfile'], 'API_6G_V1')
            return order

    def test_pass_only_after_corpus_and_cleanup(self):
        self.assertEqual(self.exercise(), ['guard-start', 'native', 'corpus', 'cleanup', 'finish'])

    def test_failure_cleans_up_without_publishing_pass(self):
        self.assertEqual(self.exercise(fail=True), ['guard-start', 'native', 'corpus', 'cleanup'])

    def test_direct_six_gib_invocation_is_denied(self):
        self.assertEqual(self.exercise(cgroup='0::/user.slice'), [])

    def test_wrapper_uses_admitted_fixed_unit_with_independent_cleanup(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            control = root / 'control' / ('a' * 40)
            release = {'apiResourceProfile': 'API_6G_V1'}
            target = {'root': control, 'release': release}
            def read(file):
                if file.name == 'preparation.json':
                    return json.dumps({'rehearsal': True, 'releaseSha': control.name}).encode()
                if file.name == 'restore.json':
                    return json.dumps({'decision': 'DATABASE_RESTORE_PASS', 'releaseSha': control.name}).encode()
                return b'{"canonical":true}\n'
            with mock.patch.object(wrapper, 'ROOT', root), mock.patch.object(wrapper, 'CONTROL', control), \
                 mock.patch.object(wrapper.os, 'getuid', return_value=0, create=True), \
                 mock.patch.object(wrapper, 'installed', return_value=target), mock.patch.object(wrapper, 'secure', side_effect=read), \
                 mock.patch.object(wrapper, 'run', side_effect=[b'{"canonical":true}', b'ATTESTED', b'PASS']) as runner, contextlib.redirect_stdout(io.StringIO()):
                wrapper.main()
            args = runner.call_args_list[-1].args[0]
            self.assertIn('--property=RuntimeMaxSec=900s', args)
            self.assertIn('--property=ExecStopPost=/usr/bin/python3 ' + str(control / 'rehearsal_memory_guard.py') + ' cleanup-fixed', args)
            self.assertIn('/usr/bin/flock', args)
            self.assertEqual(args[-1], str(control / 'accept-rehearsal.py'))


if __name__ == '__main__':
    unittest.main()
