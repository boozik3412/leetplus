import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SOURCE = Path(__file__).with_name('rehearsal_memory_guard.py')
SPEC = importlib.util.spec_from_file_location('rehearsal_memory_guard', SOURCE)
memory_guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(memory_guard)


class FakeDocker:
    def __init__(self):
        self.available = 44 * memory_guard.GIB
        self.calls = []
        self.stops = []
        self.kills = []
        self.roles = {role: {'id': (str(index + 1) * 64), 'running': role in memory_guard.DATA_ROLES, 'pid': 100 + index,
                             'restart': 0, 'memory': 0, 'peak': 0, 'events': {'oom': 0, 'oom_kill': 0}}
                      for index, role in enumerate(memory_guard.ROLES)}
        for role in memory_guard.APP_ROLES:
            self.roles[role]['pid'] = 0

    def start_apps(self):
        for role in memory_guard.APP_ROLES:
            self.roles[role]['running'] = True
            self.roles[role]['pid'] = 100 + memory_guard.ROLES.index(role)

    def role_for(self, target):
        for role, value in self.roles.items():
            if target in (f'{memory_guard.PROJECT}-{role}', value['id']):
                return role
        raise AssertionError(f'Unexpected container target: {target}')

    def inspect(self, role, service):
        value = self.roles[role]
        memory, swap = memory_guard.EXPECTED_RESOURCES[role]
        return {
            'Id': value['id'], 'Name': f'/{memory_guard.PROJECT}-{role}', 'Image': service['image'], 'RestartCount': value['restart'],
            'Config': {'Labels': {'com.docker.compose.project': memory_guard.PROJECT, 'ru.leetplus.contract': memory_guard.CONTRACT, 'ru.leetplus.role': role}},
            'HostConfig': {'Memory': memory_guard.bytes_limit(memory), 'MemorySwap': memory_guard.bytes_limit(swap) if swap else 0,
                           'NanoCpus': int(float(service['cpus']) * 1_000_000_000)},
            'State': {'Running': value['running'], 'Pid': value['pid'], 'OOMKilled': False, 'StartedAt': f'2026-09-16T00:00:{memory_guard.ROLES.index(role):02d}Z'},
        }

    def __call__(self, args, timeout):
        self.calls.append((args, timeout))
        command = args[3]
        if command == 'inspect':
            roles = [self.role_for(target) for target in args[4:]]
            return json.dumps([self.inspect(role, self.document['services'][role]) for role in roles])
        if command == 'stop':
            role = self.role_for(args[-1])
            self.stops.append(args[-1])
            self.roles[role]['running'] = False
            self.roles[role]['pid'] = 0
            return ''
        if command == 'kill':
            role = self.role_for(args[-1])
            self.kills.append(args[-1])
            self.roles[role]['running'] = False
            self.roles[role]['pid'] = 0
            return ''
        if command == 'start':
            role = self.role_for(args[-1])
            self.roles[role]['running'] = True
            self.roles[role]['pid'] = 100 + memory_guard.ROLES.index(role)
            return ''
        raise AssertionError(f'Unexpected Docker command: {args}')

    def read(self, path):
        path = Path(path)
        portable = str(path).replace('\\', '/')
        if path == self.compose:
            return self.compose.read_text()
        if portable == '/proc/meminfo':
            return f'MemAvailable: {self.available // 1024} kB\n'
        match = __import__('re').fullmatch(r'/proc/(\d+)/cgroup', portable)
        if match:
            role = next(role for role, value in self.roles.items() if value['pid'] == int(match.group(1)))
            return f'0::/test/{role}\n'
        match = __import__('re').fullmatch(r'/sys/fs/cgroup/test/([^/]+)/(memory\.current|memory\.peak|memory\.swap\.current|memory\.events)', portable)
        if match:
            role, leaf = match.groups()
            value = self.roles[role]
            if leaf == 'memory.current':
                return str(value['memory'])
            if leaf == 'memory.peak':
                return str(value['peak'])
            if leaf == 'memory.swap.current':
                return '0'
            if leaf == 'memory.events':
                return '\n'.join(f'{key} {count}' for key, count in value['events'].items()) + '\n'
        raise AssertionError(f'Unexpected read: {path}')


class RehearsalMemoryGuardTests(unittest.TestCase):
    def compose_document(self):
        services = {}
        for role, (memory, swap) in memory_guard.EXPECTED_RESOURCES.items():
            services[role] = {'container_name': f'{memory_guard.PROJECT}-{role}', 'image': f'sha256:{role[0] * 64}', 'mem_limit': memory, 'cpus': '2.0' if role.startswith('api') else ('4.0' if role == 'postgres' else ('0.5' if role == 'redis' else '1.0'))}
            if swap is not None:
                services[role]['memswap_limit'] = swap
        return {'name': memory_guard.PROJECT, 'services': services}

    def harness(self, *, available=None, mutate=None):
        directory = tempfile.TemporaryDirectory()
        root = Path(directory.name) / 'rehearsal'
        evidence = root / 'evidence' / 'memory.json'
        root.mkdir(parents=True)
        compose = root / 'compose.json'
        document = self.compose_document()
        if mutate:
            mutate(document)
        compose.write_text(json.dumps(document))
        fake = FakeDocker()
        fake.compose, fake.document = compose, document
        if available is not None:
            fake.available = available
        patch = mock.patch.object(memory_guard, 'ROOT', root)
        return directory, fake, compose, evidence, patch

    def test_entry_rejects_invalid_profile_without_stop(self):
        directory, fake, compose, evidence, patch = self.harness(mutate=lambda value: value['services']['api-blue'].update(mem_limit='4g'))
        with directory, patch:
            with self.assertRaisesRegex(ValueError, 'resource profile'):
                with memory_guard.RehearsalMemoryGuard(compose, evidence, runner=fake, read=fake.read, start_watchdog=False):
                    pass
        self.assertEqual(fake.stops, [])
        self.assertEqual(fake.kills, [])

    def test_initial_capacity_threshold_holds_without_stop(self):
        directory, fake, compose, evidence, patch = self.harness(available=38 * memory_guard.GIB)
        with directory, patch:
            with self.assertRaisesRegex(ValueError, 'capacity'):
                with memory_guard.RehearsalMemoryGuard(compose, evidence, runner=fake, read=fake.read, start_watchdog=False):
                    pass
        self.assertEqual(fake.stops, [])

    def test_runtime_floor_abort_stops_only_pinned_application_clones(self):
        directory, fake, compose, evidence, patch = self.harness()
        with directory, patch:
            guard = memory_guard.RehearsalMemoryGuard(compose, evidence, runner=fake, read=fake.read, start_watchdog=False)
            with self.assertRaises(memory_guard.RehearsalMemoryGuardFailure):
                with guard:
                    fake.start_apps()
                    guard._sample_once()
                    fake.available = memory_guard.RUNTIME_FLOOR - 1
                    guard._sample_once()
                    guard.check()
            expected = {fake.roles[role]['id'] for role in memory_guard.APP_ROLES}
            self.assertEqual(set(fake.stops), expected)
            self.assertEqual(fake.kills, [])
            self.assertNotIn(fake.roles['postgres']['id'], fake.stops)
            self.assertNotIn(fake.roles['redis']['id'], fake.stops)
            self.assertTrue(evidence.exists())
            self.assertEqual(json.loads(evidence.read_text())['decision'], 'HOLD')

    def test_third_party_is_never_inspected_or_stopped(self):
        directory, fake, compose, evidence, patch = self.harness()
        third_party = 'f' * 64
        with directory, patch:
            with memory_guard.RehearsalMemoryGuard(compose, evidence, runner=fake, read=fake.read, start_watchdog=False):
                fake.start_apps()
                pass
        commands = ' '.join(' '.join(args) for args, _ in fake.calls)
        self.assertNotIn(third_party, commands)
        self.assertTrue(all(target != third_party for target in fake.stops + fake.kills))

    def test_early_application_restart_holds_before_all_slots_activate(self):
        directory, fake, compose, evidence, patch = self.harness()
        with directory, patch:
            guard = memory_guard.RehearsalMemoryGuard(compose, evidence, runner=fake, read=fake.read, start_watchdog=False)
            with self.assertRaises(memory_guard.RehearsalMemoryGuardFailure):
                with guard:
                    fake.roles['api-blue']['running'] = True
                    fake.roles['api-blue']['pid'] = 100
                    fake.roles['api-blue']['restart'] = 1
                    guard._sample_once()
                    guard.check()
            self.assertIn(fake.roles['api-blue']['id'], fake.stops)
            self.assertEqual(json.loads(evidence.read_text())['decision'], 'HOLD')

    def test_fixed_cleanup_refuses_identity_drift_without_stopping_a_replacement(self):
        document = self.compose_document()
        pins = {}
        for index, role in enumerate(memory_guard.ROLES):
            memory, swap = memory_guard.EXPECTED_RESOURCES[role]
            pins[role] = {'id': str(index + 1) * 64, 'name': f'{memory_guard.PROJECT}-{role}', 'image': document['services'][role]['image'],
                          'memory': memory, 'memorySwap': swap, 'nanoCpus': int(float(document['services'][role]['cpus']) * 1_000_000_000)}
        receipt = {'contract': 'LEETPLUS_REHEARSAL_MEMORY_GUARD_PINS_V1', 'project': memory_guard.PROJECT, 'targetProfile': 'API_6G_V1', 'stopRoles': list(memory_guard.APP_ROLES), 'pinned': pins}
        running = {role: True for role in memory_guard.APP_ROLES}
        stopped = []

        def inspect(name):
            role = next(role for role, pin in pins.items() if pin['name'] == name)
            pin = pins[role]
            identity = 'f' * 64 if role == 'api-blue' else pin['id']
            return {'Id': identity, 'Name': '/' + name, 'Image': pin['image'],
                    'Config': {'Labels': {'com.docker.compose.project': memory_guard.PROJECT, 'ru.leetplus.contract': memory_guard.CONTRACT, 'ru.leetplus.role': role}},
                    'HostConfig': {'Memory': memory_guard.bytes_limit(pin['memory']), 'MemorySwap': memory_guard.bytes_limit(pin['memorySwap']) if pin['memorySwap'] else 0, 'NanoCpus': pin['nanoCpus']},
                    'State': {'Running': running.get(role, False), 'Pid': 123 if running.get(role, False) else 0}}

        def stop(args, timeout):
            role = next(role for role, pin in pins.items() if pin['id'] == args[-1])
            self.assertEqual(args[3], 'stop')
            running[role] = False
            stopped.append(args[-1])
            return ''

        with mock.patch.object(memory_guard, '_secure_active_receipt', return_value=receipt), \
             mock.patch.object(memory_guard, '_fixed_inspect', side_effect=inspect), \
             mock.patch.object(memory_guard, '_fixed_runner', side_effect=stop):
            result = memory_guard.cleanup_fixed()
        self.assertEqual(result['decision'], 'HOLD')
        self.assertEqual(result['holds'], [{'role': 'api-blue', 'decision': 'HOLD_IDENTITY_DRIFT'}])
        self.assertEqual(set(stopped), {pins[role]['id'] for role in memory_guard.APP_ROLES if role != 'api-blue'})

    def test_normal_exit_cleans_apps_and_reports_no_automatic_cooldown_success(self):
        directory, fake, compose, evidence, patch = self.harness()
        with directory, patch:
            guard = memory_guard.RehearsalMemoryGuard(compose, evidence, runner=fake, read=fake.read, start_watchdog=False)
            with guard:
                with self.assertRaisesRegex(ValueError, 'finish cleanup'):
                    guard.finish_result()
                guard.start_apps()
                guard.mark('beforeHeavy')
                guard.mark('afterHeavy')
                guard.mark('afterCooldown')
            result = guard.finish_result()
            self.assertEqual({item['role'] for item in result['cleanup']}, set(memory_guard.APP_ROLES))
            self.assertTrue(all(not fake.roles[role]['running'] for role in memory_guard.APP_ROLES))
            self.assertTrue(all(fake.roles[role]['running'] for role in memory_guard.DATA_ROLES))
            self.assertEqual(result['decision'], 'PASS')
            self.assertEqual(result['cooldownDecision'], 'NOT_EVALUATED')
            self.assertIn('prestartBaseline', result)
            self.assertTrue(evidence.exists())

    def test_late_start_after_already_stopped_is_freshly_stopped_on_exit(self):
        directory, fake, compose, evidence, patch = self.harness()
        with directory, patch:
            guard = memory_guard.RehearsalMemoryGuard(compose, evidence, runner=fake, read=fake.read, start_watchdog=False)
            with self.assertRaises(memory_guard.RehearsalMemoryGuardFailure):
                with guard:
                    guard._abort('HOLD: synthetic warm race')
                    self.assertEqual({item['decision'] for item in guard._cleanup}, {'ALREADY_STOPPED'})
                    fake.start_apps()
            self.assertTrue(all(not fake.roles[role]['running'] for role in memory_guard.APP_ROLES))
            self.assertEqual({item['decision'] for item in guard.finish_result()['cleanup']}, {'STOPPED'})
            self.assertEqual(json.loads(evidence.read_text())['decision'], 'HOLD')

    def test_corpus_exception_cannot_leave_a_pass_guard_receipt(self):
        directory, fake, compose, evidence, patch = self.harness()
        with directory, patch:
            with self.assertRaisesRegex(ValueError, 'corpus fixture failure'):
                with memory_guard.RehearsalMemoryGuard(compose, evidence, runner=fake, read=fake.read, start_watchdog=False):
                    fake.start_apps()
                    raise ValueError('corpus fixture failure')
            self.assertEqual(json.loads(evidence.read_text())['decision'], 'HOLD')
            self.assertTrue(all(not fake.roles[role]['running'] for role in memory_guard.APP_ROLES))


if __name__ == '__main__':
    unittest.main()
