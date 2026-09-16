"""Pure/mocked acceptance-boundary tests; no server or database commands."""
import copy
import importlib.util
import json
import tempfile
import threading
from types import SimpleNamespace
import unittest
from pathlib import Path
from unittest import mock

SPEC = importlib.util.spec_from_file_location('resource_corpus', Path(__file__).with_name('resource_corpus.py'))
corpus = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(corpus)
SHA, DUMP = 'a' * 40, 'b' * 64
STORE = '11111111-1111-4111-8111-111111111111'


def native():
    return {'decision': 'PASS', 'releaseSha': SHA, 'sourceDumpSha256': DUMP,
            'providerEgress': 'DENIED', 'liveWorkers': 'NOT_STARTED',
            'slots': [{'slot': slot, 'releaseSha': SHA} for slot in ['blue', 'green']]}


class Guard:
    def __init__(self):
        self.marks, self.checks = [], 0

    def check(self):
        self.checks += 1

    def mark(self, value):
        self.marks.append(value)


def metrics():
    result = {key: {'key': key, 'state': 'AVAILABLE', 'value': 10, 'reason': None,
                    'coverage': None, 'factAsOf': None, 'lastCalculatedAt': '2026-09-16T10:00:00Z',
                    'comparison': None, 'ratio': None} for key in corpus.METRICS}
    result['averageProductCheck']['receiptEvidence'] = {
        'receiptCount': 1, 'operations': {'covered': 2, 'total': 2},
        'revenue': {'covered': 10, 'total': 10}, 'ambiguousIdentityCount': 0}
    return result


class Response:
    status = 200

    def __init__(self, payload=b'{"ok":true}'):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self, limit):
        return self.payload[:limit]


class BoundaryTests(unittest.TestCase):
    def test_guard_failure_prevents_any_http(self):
        guard = Guard()
        guard.check = mock.Mock(side_effect=RuntimeError('pressure abort'))
        runner = corpus.Corpus(guard, native())
        with mock.patch.object(corpus.urllib.request, 'build_opener') as opener:
            with self.assertRaisesRegex(RuntimeError, 'pressure abort'):
                runner.request(24100, '/health/ready', 'ready')
            opener.assert_not_called()

    def test_arbitrary_url_port_and_mutation_are_rejected(self):
        runner = corpus.Corpus(Guard(), native())
        for port, route, body in [(14100, '/health/ready', None),
                                  (24100, 'https://example.invalid/health/ready', None),
                                  (24100, '//example.invalid/health/ready', None),
                                  (24100, '/integrations/sync', {}),
                                  (24100, '/dashboard/summary', {})]:
            with self.subTest(route=route, port=port), mock.patch.object(corpus.urllib.request, 'build_opener') as opener:
                with self.assertRaises(ValueError):
                    runner.request(port, route, 'denied', body=body)
                opener.assert_not_called()
        self.assertIsNone(corpus.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://elsewhere.invalid'))

    def test_http_evidence_contains_neither_credentials_nor_query_body(self):
        runner = corpus.Corpus(Guard(), native())
        opener = mock.Mock()
        opener.open.return_value = Response()
        with mock.patch.object(corpus.urllib.request, 'build_opener', return_value=opener) as factory:
            status, result = runner.request(24100, '/dashboard/summary?storeIds=private-scope', 'summary', 'sensitive-token')
        self.assertEqual((status, result), (200, {'ok': True}))
        evidence = json.dumps(runner.requests)
        self.assertNotIn('sensitive', evidence)
        self.assertNotIn('private-scope', evidence)
        self.assertEqual(factory.call_args.args[0].proxies, {})
        self.assertIsInstance(factory.call_args.args[1], corpus.NoRedirect)
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 20)
        self.assertGreaterEqual(runner.guard.checks, 2)

    def test_oversized_response_fails_and_retains_only_summary(self):
        runner = corpus.Corpus(Guard(), native())
        opener = mock.Mock()
        opener.open.return_value = Response(b'PRIVATE' * 10)
        with mock.patch.object(corpus, 'MAX_RESPONSE_BYTES', 8), mock.patch.object(corpus.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(RuntimeError, 'RESPONSE_TOO_LARGE at CHECK_SIZE: oversized'):
                runner.request(24100, '/health/ready', 'oversized')
        self.assertNotIn('PRIVATE', json.dumps(runner.requests))

    def test_http_failures_keep_safe_phase_and_status_without_exception_text(self):
        cases = [
            ('open', TimeoutError('sensitive-private-value'), 'TIMEOUT', 'OPEN_HEADERS', None),
            ('read', TimeoutError('sensitive-private-value'), 'TIMEOUT', 'READ_BODY', 200),
            ('open', corpus.urllib.error.URLError(TimeoutError('sensitive-private-value')), 'TIMEOUT', 'OPEN_HEADERS', None),
            ('read', ConnectionResetError('sensitive-private-value'), 'CONNECTION_CLOSED', 'READ_BODY', 200),
            ('json', None, 'INVALID_JSON', 'DECODE_JSON', 200),
        ]
        for location, error, code, phase, expected_status in cases:
            runner = corpus.Corpus(Guard(), native())
            opener = mock.Mock()
            response = Response(b'{invalid-sensitive-private-value')
            if location == 'open':
                opener.open.side_effect = error
            else:
                opener.open.return_value = response
                if location == 'read':
                    response.read = mock.Mock(side_effect=error)
            with self.subTest(location=location, code=code), mock.patch.object(corpus.urllib.request, 'build_opener', return_value=opener):
                with self.assertRaises(corpus.CorpusRequestFailure) as caught:
                    runner.request(24100, '/health/ready', 'probe', 'sensitive-private-value')
            self.assertEqual((caught.exception.code, caught.exception.phase), (code, phase))
            self.assertEqual(runner.requests[-1]['status'], expected_status)
            self.assertEqual(runner.requests[-1]['failureCode'], code)
            self.assertEqual(runner.requests[-1]['socketTimeoutSeconds'], 20)
            self.assertNotIn('sensitive-private-value', str(caught.exception) + json.dumps(runner.requests))

    def test_expected_auth_denials_are_not_transport_failures(self):
        for status in [401, 403]:
            runner = corpus.Corpus(Guard(), native())
            opener = mock.Mock()
            opener.open.side_effect = corpus.urllib.error.HTTPError('http://private.invalid', status, 'denied', {}, None)
            with mock.patch.object(corpus.urllib.request, 'build_opener', return_value=opener):
                self.assertEqual(runner.request(24100, '/dashboard/executive-summary', 'denial'), (status, None))
            self.assertIsNone(runner.requests[-1]['failureCode'])
            self.assertNotIn('private.invalid', json.dumps(runner.requests))

    def test_failure_evidence_is_exclusive_private_and_only_for_a_validated_clone(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            evidence = root / 'evidence'
            evidence.mkdir()
            runner = corpus.Corpus(Guard(), native())
            runner.requests = [{'label': 'summary', 'status': 200, 'failureCode': 'TIMEOUT'}]
            original_lstat = Path.lstat
            def trusted_fixture_stat(path, *args, **kwargs):
                return SimpleNamespace(st_uid=0, st_mode=0o40700) if path == evidence else original_lstat(path, *args, **kwargs)
            with mock.patch.object(corpus, 'ROOT', root), mock.patch.object(Path, 'lstat', autospec=True, side_effect=trusted_fixture_stat):
                with self.assertRaisesRegex(ValueError, 'validated clone'):
                    runner.publish_failure(corpus.CorpusRequestFailure('TIMEOUT', 'READ_BODY', 'summary'))
                runner.context_validated = True
                # Windows does not expose O_NOFOLLOW; the actual native caller
                # is Linux. The file-content/no-secret check is portable.
                with mock.patch.object(corpus.os, 'O_NOFOLLOW', getattr(corpus.os, 'O_NOFOLLOW', 0), create=True):
                    runner.publish_failure(corpus.CorpusRequestFailure('TIMEOUT', 'READ_BODY', 'summary'))
            files = list(evidence.glob('corpus-failure-*.json'))
            self.assertEqual(len(files), 1)
            result = json.loads(files[0].read_text())
            self.assertEqual(result['failureCode'], 'TIMEOUT')
            self.assertEqual(result['releaseSha'], SHA)
            self.assertEqual(result['requestCount'], 1)

    def test_null_partial_and_comparison_arithmetic(self):
        valid = metrics()
        valid['serviceRevenue'].update(state='MISSING', value=None, reason='Source unavailable')
        valid['averageProductCheck']['comparison'] = {'previousValue': 12, 'absoluteDelta': -2}
        corpus.metrics_valid(valid)
        for key, change in [('serviceRevenue', {'value': 0}),
                            ('averageProductCheck', {'state': 'PARTIAL'}),
                            ('averageProductCheck', {'comparison': {'previousValue': 12, 'absoluteDelta': -3}}),
                            ('visits', {'value': True}), ('visits', {'value': float('nan')})]:
            invalid = copy.deepcopy(valid)
            invalid[key].update(change)
            with self.subTest(key=key, change=change), self.assertRaises(ValueError):
                corpus.metrics_valid(invalid)

    def test_native_rejection_precedes_clone_access(self):
        for change in [{'decision': 'PENDING'}, {'releaseSha': 'bad'}, {'providerEgress': 'ALLOWED'},
                       {'liveWorkers': 'STARTED'}, {'slots': [{'slot': 'blue', 'releaseSha': SHA}]}]:
            value = native()
            value.update(change)
            runner = corpus.Corpus(Guard(), value)
            with self.subTest(change=change), mock.patch.object(Path, 'read_bytes') as read:
                with self.assertRaises(ValueError):
                    runner.validate_context()
                read.assert_not_called()

    def test_context_pins_restore_mount_image_resources_and_database_id(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'evidence').mkdir()
            (root / 'preparation.json').write_text(json.dumps({'rehearsal': True, 'releaseSha': SHA}))
            restore = {'decision': 'DATABASE_RESTORE_PASS', 'releaseSha': SHA, 'sourceDumpSha256': DUMP}
            (root / 'evidence/restore.json').write_text(json.dumps(restore))
            roles = ['postgres', 'api-blue', 'api-green']
            (root / 'compose.json').write_text(json.dumps({'name': corpus.PROJECT, 'services': {role: {'image': 'sha256:' + '1' * 64} for role in roles}}))
            rows = [{'Id': str(i) * 64, 'Name': '/' + corpus.PROJECT + '-' + role,
                     'Config': {'Labels': {'com.docker.compose.project': corpus.PROJECT}},
                     'State': {'Running': True}, 'Image': 'sha256:' + '1' * 64,
                     'Mounts': [{'Type': 'bind', 'Source': str(root / 'data/postgres')}],
                     'HostConfig': {'Memory': 6 * 1024 ** 3, 'MemorySwap': 8 * 1024 ** 3,
                                    'NanoCpus': 2_000_000_000, 'PidsLimit': 256}}
                    for i, role in enumerate(roles, 1)]
            with mock.patch.object(corpus, 'ROOT', root), mock.patch.object(corpus.os, 'getuid', return_value=0, create=True):
                runner = corpus.Corpus(Guard(), native())
                with mock.patch.object(runner, 'command', return_value=json.dumps(rows).encode()):
                    runner.validate_context()
                self.assertEqual(runner.database_id, '1' * 64)
                for target, field, bad in [(0, 'Mounts', []), (1, 'Image', 'wrong'),
                                           (1, 'HostConfig', {**rows[1]['HostConfig'], 'Memory': 4 * 1024 ** 3})]:
                    changed = copy.deepcopy(rows)
                    changed[target][field] = bad
                    with mock.patch.object(runner, 'command', return_value=json.dumps(changed).encode()), self.assertRaises(ValueError):
                        runner.validate_context()
                restore['releaseSha'] = 'c' * 40
                (root / 'evidence/restore.json').write_text(json.dumps(restore))
                with self.assertRaisesRegex(ValueError, 'restore binding'):
                    runner.validate_context()


class ScheduleTests(unittest.TestCase):
    def test_full_schedule_is_fixed_bounded_and_no_secrets_in_receipt(self):
        guard, clock = Guard(), [0.0]
        state = {'calls': [], 'active': 0, 'peak': 0, 'sql': []}
        barrier, lock = threading.Barrier(2), threading.Lock()

        class FakeCorpus:
            def __init__(self, *args):
                self.requests = []

            def validate_context(self):
                state['validated'] = True

            def sql(self, query):
                state['sql'].append(query)
                if query == corpus.COUNTS:
                    return '{"events":12}'
                if query.startswith('UPDATE'):
                    return ''
                if 'row_to_json' in query:
                    return json.dumps({'id': STORE, 'tenantId': STORE, 'email': 'private@example.invalid'})
                if 'json_agg' in query:
                    return json.dumps([STORE])
                if 'businessDate' in query:
                    return '2026-09-15'
                return '22222222-2222-4222-8222-222222222222'

            def request(self, port, route, label, token=None, body=None, web=False):
                self.requests.append({'label': label})
                if route == '/auth/login':
                    return 201, {'accessToken': 'private-token'}
                return (403 if '?storeIds=' in route else 401), None

            def ok(self, port, route, label, token=None, web=False):
                if web:
                    return 'Сводка сети Чеков с однозначным идентификатором Закрыть просроченные задачи'
                return {'metrics': {'averageProductCheck': {'value': 10, 'comparison': None}}}

            def read_set(self, port, token, stores, start, end, cutoff, label):
                state['calls'].append((label, start, end))
                if label.endswith('-parallel'):
                    with lock:
                        state['active'] += 1
                        state['peak'] = max(state['active'], state['peak'])
                    barrier.wait(timeout=5)
                    with lock:
                        state['active'] -= 1
                return {'scope': {'storeIds': stores}, 'metrics': metrics()}

            def staff(self, *args):
                return dict.fromkeys(corpus.KINDS, 'AVAILABLE')

            def readiness(self, *args):
                state.setdefault('postReady', []).append(args)

        def sleep(seconds):
            clock[0] += seconds

        with mock.patch.object(corpus, 'Corpus', FakeCorpus), mock.patch.object(corpus.time, 'monotonic', side_effect=lambda: clock[0]), mock.patch.object(corpus.time, 'sleep', side_effect=sleep), mock.patch.object(corpus.hashlib, 'scrypt', return_value=b'0' * 64):
            result = corpus.run_corpus(guard, native())
        self.assertEqual(result['decision'], 'PASS')
        self.assertEqual(state['peak'], 2)
        self.assertEqual(clock[0], 60)
        self.assertEqual(len([call for call in state['calls'] if '-heavy-' in call[0]]), 6)
        self.assertEqual(len(state['postReady']), 2)
        self.assertEqual(guard.marks, ['executive-fixture', 'executive-functional', 'heavy-serial', 'heavy-parallel-two', 'cooldown-60s', 'post-cooldown'])
        self.assertEqual(sum(query.startswith('UPDATE') for query in state['sql']), 1)
        self.assertTrue(all(query.startswith('SELECT') or query.startswith('UPDATE "User" SET "passwordHash"=') for query in state['sql']))
        self.assertNotIn('private-token', json.dumps(result))
        self.assertNotIn('private@example.invalid', json.dumps(result))
        self.assertTrue(result['businessCountsUnchanged'])


if __name__ == '__main__':
    unittest.main()
