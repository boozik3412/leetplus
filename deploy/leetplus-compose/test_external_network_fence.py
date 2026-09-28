import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SOURCE = Path(__file__).with_name('external-network-fence.py')
SPEC = importlib.util.spec_from_file_location('external_network_fence', SOURCE)
fence = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fence)


class Result:
    def __init__(self, code=0, output=''):
        self.returncode = code
        self.stdout = output


class Kernel:
    def __init__(self):
        self.parent = [list(fence.PROJECT_HOOK), ['-j', 'RETURN']]
        self.chains = {}
        self.sets = {}
        self.calls = []
        self.fail_after = None

    @staticmethod
    def line(chain, rule):
        return '-A ' + chain + ' ' + ' '.join(rule)

    def call(self, argv, check=True):
        self.calls.append(list(argv))
        if self.fail_after is not None and len(self.calls) == self.fail_after:
            raise subprocess.CalledProcessError(1, argv)
        if argv[0].endswith('iptables'):
            args = argv[3:]
            op, chain = args[0], args[1]
            if op == '-S':
                if chain == fence.PARENT:
                    return Result(output='\n'.join(self.line(chain, rule) for rule in self.parent) + '\n')
                if chain not in self.chains:
                    return Result(code=1)
                return Result(output=f'-N {chain}\n' + '\n'.join(self.line(chain, rule) for rule in self.chains[chain]) + '\n')
            if op == '-N': self.chains[chain] = []
            elif op == '-A': self.chains[chain].append(args[2:])
            elif op == '-I': self.parent.insert(int(args[2]) - 1, args[3:])
            elif op == '-D': self.parent.remove(args[2:])
            elif op == '-F': self.chains[chain] = []
            elif op == '-X': del self.chains[chain]
            return Result()
        args = argv[1:]
        op, name = args[0], args[1]
        if op == 'list':
            if name not in self.sets: return Result(code=1)
            members = '\n'.join(self.sets[name])
            return Result(output=f'Name: {name}\nType: hash:ip\nHeader: family inet hashsize 1024 maxelem 64 timeout 3600\nMembers:\n{members}\n')
        if op == 'create':
            if name in self.sets and '-exist' not in args: raise subprocess.CalledProcessError(1, argv)
            self.sets.setdefault(name, [])
        elif op == 'add': self.sets[name].append(args[2])
        elif op == 'swap': self.sets[name], self.sets[args[2]] = self.sets[args[2]], self.sets[name]
        elif op == 'destroy': del self.sets[name]
        else: raise AssertionError(argv)
        return Result()


class ExternalNetworkFenceTest(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        kernel = Kernel()
        controller = fence.ExternalNetworkFence(call=kernel.call, resolve=lambda host: ['93.184.216.34'],
                                                state_path=Path(temporary.name) / 'state.json', secure_state=False)
        return kernel, controller

    def test_install_verify_refresh_and_exact_scope(self):
        kernel, controller = self.fixture()
        result = controller.install()
        self.assertEqual(result['decision'], 'PASS')
        self.assertEqual(kernel.parent[:3], fence.HOOKS + [fence.PROJECT_HOOK])
        self.assertEqual(kernel.chains[fence.CHAIN], fence.RULES)
        self.assertEqual(kernel.sets[fence.IPSET], ['93.184.216.34'])
        flattened = json.dumps(fence.RULES)
        self.assertIn('5432', flattened); self.assertIn('443', flattened)
        self.assertNotIn('6379', flattened); self.assertNotIn('465', flattened); self.assertNotIn('587', flattened)
        controller.resolve = lambda host: ['1.1.1.1']
        self.assertEqual(controller.refresh()['addresses'], ['1.1.1.1'])
        self.assertFalse(any(call[0].endswith('iptables') and '-F' in call for call in kernel.calls))

    def test_non_public_dns_and_parent_drift_fail_before_hook(self):
        kernel, controller = self.fixture()
        controller.resolve = lambda host: (_ for _ in ()).throw(ValueError('non-public'))
        with self.assertRaisesRegex(ValueError, 'non-public'):
            controller.install()
        self.assertEqual(kernel.parent[0], fence.PROJECT_HOOK)
        kernel, controller = self.fixture()
        kernel.parent.insert(0, ['-j', 'ACCEPT'])
        with self.assertRaisesRegex(ValueError, 'project hook must be first'):
            controller.install()

    def test_interrupted_install_resumes_exact_prefix_without_duplicate_effect(self):
        kernel, controller = self.fixture()
        kernel.fail_after = 9
        with self.assertRaises(subprocess.CalledProcessError):
            controller.install()
        kernel.fail_after = None
        controller.install()
        self.assertEqual(kernel.parent, fence.HOOKS + [fence.PROJECT_HOOK, ['-j', 'RETURN']])
        self.assertEqual(kernel.chains[fence.CHAIN], fence.RULES)
        controller.install()
        self.assertEqual(kernel.parent.count(fence.HOOKS[0]), 1)
        self.assertEqual(kernel.parent.count(fence.HOOKS[1]), 1)

    def test_ambiguous_partial_chain_fails_closed(self):
        kernel, controller = self.fixture()
        origin = controller._origin()
        controller._write_state(controller._state('INSTALLING', origin))
        kernel.chains[fence.CHAIN] = [['-j', 'ACCEPT']]
        kernel.sets[fence.IPSET] = ['93.184.216.34']
        with self.assertRaisesRegex(ValueError, 'ambiguous rules'):
            controller.install()
        self.assertEqual(kernel.parent[0], fence.PROJECT_HOOK)

    def test_rollback_restores_exact_origin_without_global_flush(self):
        kernel, controller = self.fixture()
        origin = [list(rule) for rule in kernel.parent]
        controller.install()
        result = controller.rollback()
        self.assertEqual(result['decision'], 'ROLLED_BACK')
        self.assertEqual(kernel.parent, origin)
        self.assertNotIn(fence.CHAIN, kernel.chains)
        self.assertNotIn(fence.IPSET, kernel.sets)
        flushes = [call for call in kernel.calls if call[0].endswith('iptables') and '-F' in call]
        self.assertEqual(len(flushes), 1)
        self.assertEqual(flushes[0][-1], fence.CHAIN)
        self.assertEqual(controller.rollback(), result)

    def test_rollback_origin_or_owned_chain_drift_is_rejected(self):
        kernel, controller = self.fixture()
        controller.install()
        kernel.parent.append(['-j', 'ACCEPT'])
        with self.assertRaisesRegex(ValueError, 'preimage differs'):
            controller.rollback()
        kernel, controller = self.fixture()
        controller.install()
        kernel.chains[fence.CHAIN].append(['-j', 'ACCEPT'])
        with self.assertRaisesRegex(ValueError, 'preimage differs'):
            controller.rollback()


if __name__ == '__main__':
    unittest.main()
