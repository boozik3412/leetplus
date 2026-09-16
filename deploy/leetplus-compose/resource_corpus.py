"""Fixed clone-only acceptance corpus, called inside the native resource guard.

No CLI, arbitrary URL/command executor or standalone PASS publication. Credentials
and HTTP/SQL bodies stay in memory. The caller owns the independent watchdog and
publishes the combined receipt only after guard cleanup succeeds.
"""
import concurrent.futures
import datetime as dt
import hashlib
import http.client
import json
import math
import os
import re
import secrets
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path('/srv/leetplus-migration/rehearsal')
PROJECT = 'leetplus-rehearsal'
DOCKER = ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock',
          '--config', '/etc/leetplus-compose/docker-cli']
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8',
       'LC_ALL': 'C.UTF-8', 'TZ': 'UTC'}
SLOTS = [('blue', 24100, 23100), ('green', 24200, 23200)]
KINDS = ['TASKS_OVERDUE', 'CHECKLISTS_OVERDUE', 'CHECKLISTS_REVIEW',
         'TRAINING_INCOMPLETE', 'REGULATIONS_UNACKNOWLEDGED']
METRICS = ['revenue', 'serviceRevenue', 'productRevenue', 'topups', 'visits',
           'revenuePerVisit', 'load', 'productRevenueShare', 'averageProductCheck']
API_PATHS = {'/auth/login', '/health/ready', '/dashboard/executive-summary',
             '/dashboard/executive-operations', '/dashboard/summary',
             '/staff/operations-dashboard/priorities',
             '/staff/operations-dashboard/priorities/items'}
WEB_PATHS = {'/dashboard', '/dashboard/executive-details', '/dashboard/priorities'}
MAX_RESPONSE_BYTES = 16 * 1024 * 1024
COUNTS = ('SELECT json_build_object('
          "'events',(SELECT count(*) FROM \"GuestGameEvent\"),"
          "'rewards',(SELECT count(*) FROM \"GuestGameReward\"),"
          "'ledger',(SELECT count(*) FROM \"GuestBonusLedgerEntry\"),"
          "'tasks',(SELECT count(*) FROM \"StaffTask\"),"
          "'runs',(SELECT count(*) FROM \"StaffChecklistRun\"),"
          "'progress',(SELECT count(*) FROM \"StaffTrainingProgress\"));")


def demand(condition, message):
    if not condition:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                    ensure_ascii=False).encode()).hexdigest()


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def metrics_valid(metrics):
    demand(isinstance(metrics, dict) and set(METRICS) <= set(metrics), 'Executive metrics missing')
    for key in METRICS:
        metric = metrics[key]
        demand(metric['key'] == key and metric['state'] in
               ['AVAILABLE', 'PARTIAL', 'MISSING', 'STALE', 'FAILED'], 'Invalid metric state')
        demand({'value', 'reason', 'coverage', 'factAsOf', 'lastCalculatedAt',
                'comparison', 'ratio'} <= set(metric), 'Metric evidence missing')
        value = metric['value']
        demand(value is None or number(value), 'Nonfinite metric value')
        if value is None:
            demand(bool(metric['reason']), 'Missing metric has no explanation')
        if metric['state'] in ['MISSING', 'FAILED']:
            demand(value is None, 'Unavailable metric must not become zero')
        if key in ['averageProductCheck', 'revenuePerVisit'] and metric['comparison'] is not None:
            comparison = metric['comparison']
            demand(metric['state'] == 'AVAILABLE' and number(value) and
                   number(comparison['previousValue']) and number(comparison['absoluteDelta']),
                   'Unproven financial comparison')
            demand(abs(value - comparison['previousValue'] - comparison['absoluteDelta']) <= 0.011,
                   'Financial comparison arithmetic differs')
    receipt = metrics['averageProductCheck'].get('receiptEvidence')
    demand(isinstance(receipt, dict) and {'receiptCount', 'operations', 'revenue',
                                        'ambiguousIdentityCount'} <= set(receipt), 'Receipt evidence missing')
    demand(0 <= receipt['operations']['covered'] <= receipt['operations']['total'], 'Invalid receipt coverage')


def summary_valid(summary, stores, start, end):
    demand(sorted(summary['scope']['storeIds']) == sorted(stores), 'Executive scope differs')
    demand(summary['scope']['period']['from'] == start and summary['scope']['period']['to'] == end,
           'Executive period differs')
    demand(sorted(row['storeId'] for row in summary['clubs']) == sorted(stores), 'Executive club rows differ')
    metrics_valid(summary['metrics'])
    for row in summary['clubs'] + summary['days']:
        metrics_valid(row['metrics'])


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward a clone login cookie/token to a redirect destination.
        return None


class CorpusRequestFailure(RuntimeError):
    def __init__(self, code, phase, label):
        self.code, self.phase, self.label = code, phase, label
        super().__init__(f'Clone corpus HTTP failure: {code} at {phase}: {label}')


def request_failure_code(error):
    cause = error.reason if isinstance(error, urllib.error.URLError) else error
    if isinstance(cause, (TimeoutError, socket.timeout)):
        return 'TIMEOUT'
    if isinstance(cause, (http.client.RemoteDisconnected, ConnectionResetError, BrokenPipeError)):
        return 'CONNECTION_CLOSED'
    if isinstance(cause, UnicodeDecodeError):
        return 'INVALID_ENCODING'
    if isinstance(cause, json.JSONDecodeError):
        return 'INVALID_JSON'
    if isinstance(cause, (ConnectionError, urllib.error.URLError, OSError)) or isinstance(error, urllib.error.URLError):
        return 'CONNECTION_FAILED'
    return 'UNCLASSIFIED_REQUEST_FAILURE'


class Corpus:
    def __init__(self, guard, native):
        self.guard, self.native = guard, native
        self.requests = []
        self.lock = threading.Lock()
        self.database_id = None
        self.context_validated = False

    def command(self, args, data=None):
        self.guard.check()
        result = subprocess.run(args, input=data, capture_output=True, timeout=60, env=ENV)
        self.guard.check()
        demand(result.returncode == 0, 'Clone corpus command failed')
        return result.stdout

    def sql(self, query):
        demand(bool(self.database_id), 'Clone database identity not bound')
        return self.command(DOCKER + ['exec', '-i', self.database_id,
                            '/usr/lib/postgresql/16/bin/psql', '-XqAt', '-v', 'ON_ERROR_STOP=1',
                            '-h', '/tmp', '-U', 'postgres', '-d', 'leetplus'], query.encode()).decode().strip()

    def validate_context(self):
        self.guard.check()
        native = self.native
        demand(callable(getattr(self.guard, 'mark', None)) and
               native.get('decision') == 'PASS' and
               re.fullmatch(r'[a-f0-9]{40}', native.get('releaseSha', '')) and
               re.fullmatch(r'[a-f0-9]{64}', native.get('sourceDumpSha256', '')),
               'Exact native acceptance required')
        demand(native.get('providerEgress') == 'DENIED' and native.get('liveWorkers') == 'NOT_STARTED',
               'Isolated native acceptance required')
        demand(sorted(row['slot'] for row in native['slots']) == ['blue', 'green'] and
               all(row['releaseSha'] == native['releaseSha'] for row in native['slots']), 'Native slots differ')
        demand(os.getuid() == 0 and ROOT.resolve() == ROOT, 'Native clone root required')
        preparation = json.loads((ROOT / 'preparation.json').read_bytes())
        restore = json.loads((ROOT / 'evidence/restore.json').read_bytes())
        demand(preparation.get('rehearsal') is True and preparation.get('releaseSha') == native['releaseSha'],
               'Clone preparation differs')
        demand(restore.get('decision') == 'DATABASE_RESTORE_PASS' and
               restore.get('releaseSha') == native['releaseSha'] and
               restore.get('sourceDumpSha256') == native['sourceDumpSha256'], 'Native restore binding differs')
        compose = json.loads((ROOT / 'compose.json').read_bytes())
        demand(compose['name'] == PROJECT, 'Wrong Compose project')
        names = [PROJECT + '-postgres'] + [PROJECT + '-api-' + slot for slot, _, _ in SLOTS]
        inspected = json.loads(self.command(DOCKER + ['inspect', *names]))
        demand({row['Name'] for row in inspected} == {'/' + name for name in names}, 'Clone containers differ')
        for row in inspected:
            role = row['Name'].removeprefix('/' + PROJECT + '-')
            labels = row['Config'].get('Labels', {})
            demand(labels.get('com.docker.compose.project') == PROJECT and row['State']['Running'] and
                   row['Image'] == compose['services'][role]['image'], 'Clone image/project differs')
            if role == 'postgres':
                demand(any(mount['Type'] == 'bind' and mount['Source'] == str(ROOT / 'data/postgres')
                           for mount in row['Mounts']), 'Clone database mount differs')
                self.database_id = row['Id']
            else:
                limits = row['HostConfig']
                demand(limits['Memory'] == 6 * 1024 ** 3 and limits['MemorySwap'] == 8 * 1024 ** 3 and
                       limits['NanoCpus'] == 2_000_000_000 and limits['PidsLimit'] == 256,
                       'API6GiB resource profile differs')
        self.context_validated = True

    def publish_failure(self, error):
        demand(self.context_validated, 'Only a validated clone may publish failure evidence')
        directory = ROOT / 'evidence'
        info = directory.lstat()
        demand(directory.resolve() == directory and directory.is_dir() and info.st_uid == 0 and
               not info.st_mode & 0o022, 'Untrusted clone evidence directory')
        # Never serialize exception text, URLs, headers, SQL or response bodies.
        evidence = {'decision': 'FAIL', 'contract': 'LEETPLUS_RESOURCE_CORPUS_FAILURE_V1',
                    'releaseSha': self.native['releaseSha'], 'sourceDumpSha256': self.native['sourceDumpSha256'],
                    'failureCode': error.code if isinstance(error, CorpusRequestFailure) else 'CORPUS_OR_GUARD_FAILED',
                    'requestFailure': {'code': error.code, 'phase': error.phase, 'label': error.label}
                    if isinstance(error, CorpusRequestFailure) else None,
                    'requests': self.requests, 'requestCount': len(self.requests)}
        path = directory / ('corpus-failure-' + uuid.uuid4().hex + '.json')
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
        with os.fdopen(fd, 'wb') as stream:
            stream.write((json.dumps(evidence, indent=2) + '\n').encode())
            stream.flush()
            os.fsync(stream.fileno())

    def request(self, port, route, label, token=None, body=None, web=False):
        self.guard.check()
        parsed = urllib.parse.urlsplit(route)
        demand(not parsed.scheme and not parsed.netloc and not parsed.fragment and
               parsed.path in (WEB_PATHS if web else API_PATHS), 'Corpus route is not allowed')
        demand(port in ([23100, 23200] if web else [24100, 24200]), 'Corpus port is not allowed')
        demand(body is None or not web and parsed.path == '/auth/login', 'Only clone login may POST')
        demand(re.fullmatch(r'[a-z0-9_-]{1,80}', label), 'Corpus label is not safe')
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Cookie' if web else 'Authorization'] = ('leetplus_access_token=' if web else 'Bearer ') + token
        req = urllib.request.Request(f'http://127.0.0.1:{port}{route}', headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
        started = time.monotonic()
        status, size = None, 0
        phase, failure_code = 'OPEN_HEADERS', None
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            with opener.open(req, timeout=20) as response:
                status = response.status
                phase = 'READ_BODY'
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                size = len(raw)
                phase = 'CHECK_SIZE'
                if size > MAX_RESPONSE_BYTES:
                    raise CorpusRequestFailure('RESPONSE_TOO_LARGE', phase, label)
                phase = 'DECODE_TEXT' if web else 'DECODE_JSON'
                value = raw.decode('utf-8') if web else json.loads(raw)
                phase = 'COMPLETE'
                return status, value
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            return status, None
        except CorpusRequestFailure as error:
            failure_code = error.code
            raise
        except Exception as error:
            failure_code = request_failure_code(error)
            raise CorpusRequestFailure(failure_code, phase, label) from None
        finally:
            with self.lock:
                self.requests.append({'label': label, 'port': port, 'status': status,
                                      'responseBytes': size, 'durationMs': round((time.monotonic() - started) * 1000),
                                      'phase': phase, 'failureCode': failure_code, 'socketTimeoutSeconds': 20})
            self.guard.check()

    def ok(self, port, route, label, token=None, web=False):
        status, value = self.request(port, route, label, token, web=web)
        if status != 200:
            raise CorpusRequestFailure('UNEXPECTED_HTTP_STATUS', 'STATUS', label)
        return value

    def readiness(self, port, label):
        ready = self.ok(port, '/health/ready', label)
        demand(ready.get('ok') is True and ready['release']['sha'] == self.native['releaseSha'],
               'Post-load release readiness differs')

    def read_set(self, port, token, stores, start, end, cutoff, label):
        query = encoded_query(stores, start, end, cutoff)
        summary = self.ok(port, '/dashboard/executive-summary?' + query, label + '-summary', token)
        summary_valid(summary, stores, start, end)
        operations = self.ok(port, '/dashboard/executive-operations?' + query, label + '-operations', token)
        demand(operations['scope'] == summary['scope'] and isinstance(operations.get('assortment'), dict),
               'Operations scope differs')
        assortment = self.ok(port, '/dashboard/summary?' + query + '&noSalesDays=21&skuGrouping=network',
                             label + '-assortment', token)
        demand(sorted(assortment['selectedStoreIds']) == sorted(stores) and
               assortment['periodFrom'] == start and assortment['periodTo'] == end, 'Assortment scope differs')
        health = assortment.get('assortmentHealth')
        demand(isinstance(health, dict) and {'outOfStock', 'lowStock', 'noSales'} <= set(health),
               'Assortment health metrics missing')
        for metric in [health['outOfStock'], health['lowStock'], health['noSales']['21']]:
            demand({'value', 'state', 'reason', 'coverage', 'asOf'} <= set(metric), 'Assortment evidence missing')
            demand(metric['value'] is None or number(metric['value']), 'Invalid assortment metric')
            if metric['value'] is None:
                demand(bool(metric['reason']), 'Unknown assortment metric has no reason')
        return summary

    def staff(self, port, token, stores, label, details):
        query = urllib.parse.urlencode([('storeIds', store) for store in stores])
        result = self.ok(port, '/staff/operations-dashboard/priorities?' + query, label, token)
        demand(sorted(result['scope']['storeIds']) == sorted(stores) and set(result['metrics']) == set(KINDS),
               'Staff scope/kinds differ')
        for kind in KINDS:
            metric = result['metrics'][kind]
            demand(metric['state'] in ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE', 'FAILED'], 'Invalid staff state')
            if metric['state'] in ['UNAVAILABLE', 'FAILED']:
                demand(metric['value'] is None and metric['reason'], 'Staff unavailability became zero')
            if details:
                detail = self.ok(port, '/staff/operations-dashboard/priorities/items?' + query + '&kind=' + kind,
                                 label + '-detail-' + kind.lower(), token)
                demand(detail['scope'] == result['scope'] and detail['kind'] == kind and
                       len(detail['items']) <= 20, 'Staff detail scope/size differs')
                if metric['state'] == 'AVAILABLE' and metric['value'] == 0:
                    demand(not detail['items'], 'Known empty staff queue has items')
        return {key: result['metrics'][key]['state'] for key in KINDS}


def encoded_query(stores, start, end, cutoff):
    return urllib.parse.urlencode([('period', 'custom'), ('dateFrom', start), ('dateTo', end),
                                  ('asOf', cutoff), ('comparison', 'true')] + [('storeIds', store) for store in stores])


def run_corpus(guard, native_result):
    corpus = Corpus(guard, native_result)
    corpus.validate_context()
    try:
        return _run_corpus(guard, native_result, corpus)
    except Exception as error:
        corpus.publish_failure(error)
        raise


def _run_corpus(guard, native_result, corpus):
    guard.mark('executive-fixture')
    before = json.loads(corpus.sql(COUNTS))
    actor = json.loads(corpus.sql('SELECT row_to_json(x) FROM (SELECT u.id,u.email,u."tenantId" '
        'FROM "User" u JOIN "Tenant" t ON t.id=u."tenantId" WHERE t.slug=\'demo\' AND u."isActive" '
        'AND NOT u."isPlatformAdmin" AND u."accessScope"=\'NETWORK\' AND u."customRoleId" IS NULL '
        'AND u.role IN (\'OWNER\',\'ADMIN\',\'MANAGER\') ORDER BY CASE WHEN u.role=\'OWNER\' THEN 0 ELSE 1 END,u.id LIMIT 1) x;'))
    demand(isinstance(actor, dict), 'No suitable clone actor')
    for key in ['id', 'tenantId']:
        demand(str(uuid.UUID(actor[key])) == actor[key], 'Noncanonical clone actor identity')
    stores = json.loads(corpus.sql(f'SELECT json_agg(id ORDER BY id) FROM "Store" WHERE "tenantId"=\'{actor["tenantId"]}\' AND "isActive";'))
    demand(isinstance(stores, list) and stores and all(str(uuid.UUID(store)) == store for store in stores), 'No clone stores')
    selected = stores[:2]
    foreign = corpus.sql(f'SELECT id FROM "Store" WHERE "tenantId"<>\'{actor["tenantId"]}\' AND "isActive" ORDER BY id LIMIT 1;')
    demand(str(uuid.UUID(foreign)) == foreign, 'Foreign-store denial fixture missing')
    end = corpus.sql(f'SELECT to_char(max("businessDate"),\'YYYY-MM-DD\') FROM "DailyDataCoverage" WHERE "tenantId"=\'{actor["tenantId"]}\' AND scope=\'BUSINESS_FACTS\' AND status=\'SUCCESS\';')
    demand(re.fullmatch(r'\d{4}-\d{2}-\d{2}', end), 'Proven clone period missing')
    start7 = (dt.date.fromisoformat(end) - dt.timedelta(days=6)).isoformat()
    start30 = (dt.date.fromisoformat(end) - dt.timedelta(days=29)).isoformat()
    cutoff = dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    password, salt = 'Rehearsal1!' + secrets.token_urlsafe(24), secrets.token_hex(16)
    password_hash = 'scrypt$' + salt + '$' + hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
    # The only direct SQL mutation, bound to the inspected disposable PG ID.
    corpus.sql(f'UPDATE "User" SET "passwordHash"=\'{password_hash}\' WHERE id=\'{actor["id"]}\';')
    tokens, outcomes = {}, []
    guard.mark('executive-functional')
    for slot, api, web in SLOTS:
        status, login = corpus.request(api, '/auth/login', slot + '-login', body={'email': actor['email'], 'password': password})
        demand(status == 201 and isinstance(login, dict) and isinstance(login.get('accessToken'), str), 'Clone login failed')
        token = login['accessToken']
        tokens[slot] = token
        summary = corpus.read_set(api, token, selected, start7, end, cutoff, slot + '-seven-day')
        query = encoded_query(selected, start7, end, cutoff)
        no_compare = corpus.ok(api, '/dashboard/executive-summary?' + query.replace('comparison=true', 'comparison=false'), slot + '-no-comparison', token)
        demand(no_compare['metrics']['averageProductCheck']['value'] == summary['metrics']['averageProductCheck']['value'] and
               no_compare['metrics']['averageProductCheck']['comparison'] is None, 'Receipt eligibility changed with comparison toggle')
        staff_states = corpus.staff(api, token, selected, slot + '-staff', True)
        for path, name in [('/dashboard/executive-summary', 'executive'), ('/staff/operations-dashboard/priorities', 'staff')]:
            demand(corpus.request(api, path, slot + '-unsigned-' + name)[0] == 401, 'Unsigned request allowed')
            demand(corpus.request(api, path + '?storeIds=' + foreign, slot + '-foreign-' + name, token)[0] == 403, 'Foreign tenant scope allowed')
        staff_query = urllib.parse.urlencode([('storeIds', store) for store in selected])
        for path, name, expected in [('/dashboard?' + query, 'dashboard', 'Сводка сети'),
                ('/dashboard/executive-details?metric=averageProductCheck&' + query, 'receipt-detail', 'Чеков с однозначным идентификатором'),
                ('/dashboard/priorities?kind=TASKS_OVERDUE&' + staff_query, 'staff-page', 'Закрыть просроченные задачи')]:
            page = corpus.ok(web, path, slot + '-' + name, token, web=True)
            demand(expected in page, 'Executive Web content missing')
        outcomes.append({'slot': slot, 'scopeSha256': digest(summary['scope']),
                         'metricStates': {key: summary['metrics'][key]['state'] for key in METRICS},
                         'staffStates': staff_states, 'apiWeb': 'PASS', 'crossTenantDenial': 'PASS'})
    guard.mark('heavy-serial')
    for slot, api, _ in SLOTS:
        for iteration in range(3):
            corpus.read_set(api, tokens[slot], stores, start30, end, cutoff, f'{slot}-heavy-{iteration}')
    guard.mark('heavy-parallel-two')
    # Each read_set issues one request at a time; two workers mean at most two
    # in-flight requests across both slots, with no unbounded queued workload.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(corpus.read_set, api, tokens[slot], stores, start30, end,
                                   cutoff, slot + '-parallel') for slot, api, _ in SLOTS]
        for future in concurrent.futures.as_completed(futures):
            future.result()
    guard.mark('cooldown-60s')
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        guard.check()
        time.sleep(min(1, max(0, deadline - time.monotonic())))
    guard.mark('post-cooldown')
    for slot, api, _ in SLOTS:
        corpus.readiness(api, slot + '-post-ready')
        corpus.read_set(api, tokens[slot], selected, start7, end, cutoff, slot + '-post-read')
    demand(before == json.loads(corpus.sql(COUNTS)), 'Clone business counts changed')
    guard.check()
    return {'decision': 'PASS', 'contract': 'LEETPLUS_EXECUTIVE_RESOURCE_CORPUS_V1', 'releaseSha': native_result['releaseSha'],
            'sourceDumpSha256': native_result['sourceDumpSha256'], 'apiResourceProfile': 'API_6G_V1',
            'windowsDays': [7, 30], 'serialPassesPerSlot': 3, 'maxConcurrentRequests': 2,
            'cooldownSeconds': 60, 'businessCountsUnchanged': True, 'slots': outcomes,
            'requests': corpus.requests, 'requestCount': len(corpus.requests),
            'scope': 'BOUNDED_CLONE_ACCEPTANCE_NOT_THROUGHPUT_SLA_OR_OOM_CAUSE_PROOF',
            'fixtureEffect': 'ONE_CLONE_ACTOR_PASSWORD_AND_NORMAL_CLONE_LOGIN_AUDIT'}
