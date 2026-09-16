"""HTTP and data-bound smoke on the isolated restored copy, never production."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path('/srv/leetplus-migration/rehearsal')
NAME = 'leetplus-rehearsal'
CONTROL = Path(__file__).resolve().parent


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def command(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True, timeout=90,
                            env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'})
    if result.returncode:
        (ROOT / 'evidence/acceptance-command.stderr').write_bytes(result.stderr)
        raise RuntimeError('Acceptance command failed; private log retained')
    return result.stdout


def sql(text):
    return command(['/usr/bin/docker', 'exec', '-i', NAME + '-postgres', '/usr/lib/postgresql/16/bin/psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-h', '/tmp', '-U', 'postgres', '-d', 'leetplus'], text.encode()).decode().strip()


def request(port, route, token=None, data=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    payload = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(f'http://127.0.0.1:{port}{route}', headers=headers, data=payload)
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open(req, timeout=60) as response:
            raw = response.read(8 * 1024 * 1024 + 1)
            if len(raw) > 8 * 1024 * 1024:
                raise ValueError('Oversized acceptance response')
            return response.status, json.loads(raw)
    except urllib.error.HTTPError as error:
        code = error.code
        error.close()
        return code, None


def jwt(payload, key):
    encode = lambda value: base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
    body = encode({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + encode(payload)
    return (body + b'.' + base64.urlsafe_b64encode(hmac.new(key.encode(), body, hashlib.sha256).digest()).rstrip(b'=')).decode()


def wait_slot_ready(api_port, web_port, release_sha, memory_guard=None):
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        if memory_guard:
            memory_guard.check()
        try:
            status, ready = request(api_port, '/health/ready')
            if status == 200 and ready.get('ok') and ready['release']['sha'] == release_sha:
                # The guarded window owns cold start, including Next.js. An
                # already-ready API does not establish Web readiness.
                if memory_guard:
                    web_status, identity = request(web_port, '/api/release-identity')
                    if web_status != 200 or identity['release']['sha'] != release_sha:
                        time.sleep(1)
                        continue
                    memory_guard.check()
                return
        except Exception:
            pass
        time.sleep(1)
    raise ValueError('Rehearsal API/Web did not become ready')


def accept(memory_guard=None):
    if os.getuid() != 0 or not json.loads((ROOT / 'preparation.json').read_text()).get('rehearsal'):
        raise ValueError('Isolated rehearsal preparation required')
    restore = json.loads((ROOT / 'evidence/restore.json').read_text())
    if restore.get('decision') != 'DATABASE_RESTORE_PASS':
        raise ValueError('Verified restore required')
    compose = json.loads((ROOT / 'compose.json').read_text())
    profiled = any(compose['services'][f'api-{slot}']['mem_limit'] == '6g' for slot in ['blue', 'green'])
    if profiled and memory_guard is None:
        raise ValueError('6 GiB acceptance requires the native monitored resource window')
    if memory_guard:
        memory_guard.check()
    command(['/usr/bin/python3', str(CONTROL / 'network-fence.py'), 'verify-rehearsal'])
    original_counts = sql('SELECT json_build_object(\'events\',(SELECT count(*) FROM "GuestGameEvent"),\'rewards\',(SELECT count(*) FROM "GuestGameReward"),\'ledger\',(SELECT count(*) FROM "GuestBonusLedgerEntry"));')
    actor = json.loads(sql('SELECT row_to_json(x) FROM (SELECT u.id,u.email,u."tenantId" FROM "User" u JOIN "Tenant" t ON t.id=u."tenantId" WHERE t.slug=\'demo\' AND u."isActive" AND NOT u."isPlatformAdmin" AND u."accessScope"=\'NETWORK\' AND u.role IN (\'OWNER\',\'ADMIN\',\'MANAGER\') ORDER BY u.id LIMIT 1) x;'))
    # Change exactly one password in the disposable copy only. The clone JWT
    # signing keys also differ, so test credentials/tokens cannot access prod.
    password, salt = 'Rehearsal1!' + secrets.token_urlsafe(24), secrets.token_hex(16)
    derived = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
    password_hash = f'scrypt${salt}${derived}'
    if not actor or not all(isinstance(actor[k], str) for k in ['id', 'email', 'tenantId']):
        raise ValueError('No internal rehearsal actor')
    uuid.UUID(actor['id'])
    uuid.UUID(actor['tenantId'])
    sql(f'UPDATE "User" SET "passwordHash"=\'{password_hash}\' WHERE id=\'{actor["id"]}\';')
    # NETWORK /stores is the tenant management catalog, including inactive rows.
    # Public guest selectors still require an active store independently below.
    expected_stores = json.loads(sql(f'SELECT coalesce(json_agg(id),\'[]\'::json) FROM "Store" WHERE "tenantId"=\'{actor["tenantId"]}\';'))
    if memory_guard:
        memory_guard.check()
        memory_guard.start_apps()
        memory_guard.check()
    else:
        command(['/usr/bin/docker', 'compose', '--project-name', NAME, '--file', str(ROOT / 'compose.json'), 'up', '--detach', '--no-deps', 'api-blue', 'api-green', 'web-blue', 'web-green'])
    evidence = []
    for slot, api_port, web_port in [('blue', 24100, 23100), ('green', 24200, 23200)]:
        if memory_guard:
            memory_guard.check()
        wait_slot_ready(api_port, web_port, restore['releaseSha'], memory_guard)
        status, identity = request(web_port, '/api/release-identity')
        if status != 200 or identity['release']['sha'] != restore['releaseSha']:
            raise ValueError('Rehearsal Web identity mismatch')
        status, login = request(api_port, '/auth/login', data={'email': actor['email'], 'password': password})
        if status != 201 or not login.get('accessToken'):
            raise ValueError('Corporate login failed in rehearsal')
        token = login['accessToken']
        status, me = request(api_port, '/auth/me', token)
        if status != 200:
            raise ValueError('Corporate authenticated identity failed')
        status, stores = request(api_port, '/stores', token)
        if status != 200 or not isinstance(stores, list) or set(item['id'] for item in stores) != set(expected_stores):
            raise ValueError('Store response differs from the tenant-bound database oracle')
        if request(api_port, '/stores')[0] != 401 or request(api_port, '/guest-portal/session', token)[0] != 401:
            raise ValueError('Unauthenticated/corporate-to-guest boundary failed')
        guest = json.loads(sql('SELECT row_to_json(x) FROM (SELECT p.id AS "profileId",p."phoneHash",p."guestId",p."tenantId",s.id AS "storeId" FROM "GuestGameProfile" p JOIN "Guest" g ON g.id=p."guestId" JOIN "Store" s ON s."tenantId"=p."tenantId" AND s."externalDomain"=g."externalDomain" JOIN "Tenant" t ON t.id=p."tenantId" WHERE t.slug=\'demo\' AND p.status=\'ACTIVE\' AND p."phoneHash" IS NOT NULL AND s."isActive" ORDER BY p.id,s.id LIMIT 1) x;'))
        secret = json.loads((ROOT / f'secrets/api-{slot}.json').read_text())['GUEST_PORTAL_JWT_SECRET']
        guest_token = jwt({**guest, 'sub': str(uuid.uuid4()), 'purpose': 'guest_portal', 'iat': int(time.time()), 'exp': int(time.time()) + 600}, secret)
        if request(api_port, '/auth/me', guest_token)[0] != 401:
            raise ValueError('Guest token crossed into corporate authentication')
        status, guest_session = request(api_port, '/guest-portal/session', guest_token)
        if status != 200:
            raise ValueError('Guest session could not read the restored profile')
        evidence.append({'slot': slot, 'releaseSha': restore['releaseSha'], 'corporateLogin': 'PASS', 'storeCount': len(expected_stores), 'guestSession': 'PASS', 'crossContourDenials': 'PASS'})
    final_counts = sql('SELECT json_build_object(\'events\',(SELECT count(*) FROM "GuestGameEvent"),\'rewards\',(SELECT count(*) FROM "GuestGameReward"),\'ledger\',(SELECT count(*) FROM "GuestBonusLedgerEntry"));')
    if json.loads(original_counts) != json.loads(final_counts):
        raise ValueError('Read-only acceptance unexpectedly changed game/ledger row counts')
    return {'decision': 'PASS', 'releaseSha': restore['releaseSha'], 'sourceDumpSha256': restore['sourceDumpSha256'],
              'providerEgress': 'DENIED', 'liveWorkers': 'NOT_STARTED', 'slots': evidence, 'gameLedgerCountsUnchanged': True}


def run():
    destination = ROOT / 'evidence/runtime-acceptance.json'
    if destination.exists():
        raise ValueError('Acceptance is already recorded; do not replay completed effects')
    compose = json.loads((ROOT / 'compose.json').read_text())
    profiled = any(compose['services'][f'api-{slot}']['mem_limit'] == '6g' for slot in ['blue', 'green'])
    if profiled:
        if Path('/proc/self/cgroup').read_text().strip() != '0::/system.slice/leetplus-rehearsal-resource-acceptance.service':
            raise ValueError('6 GiB acceptance requires its independent systemd timeout and cleanup')
        from rehearsal_memory_guard import RehearsalMemoryGuard
        from resource_corpus import run_corpus
        from resource_cooldown import evaluate_cooldown
        evidence_path = ROOT / 'evidence' / ('resource-window-' + str(uuid.uuid4()) + '.json')
        with RehearsalMemoryGuard(ROOT / 'compose.json', evidence_path) as guard:
            result = accept(guard)
            corpus = run_corpus(guard, result)
            guard.mark('post-read-complete')
            guard.check()
        # Neither native nor resource PASS is published before clone cleanup.
        measured = guard.finish_result()
        cooldown = evaluate_cooldown(measured)
        if cooldown['decision'] != 'PASS':
            raise ValueError('Measured resource cooldown requires investigation; no acceptance PASS published')
        result.update({'apiResourceProfile': 'API_6G_V1', 'resourceAcceptance': {
            'decision': 'PASS', 'mode': 'BOUNDED_MONITORED_REHEARSAL',
            'composeSha256': hashlib.sha256((json.dumps(compose, indent=2, ensure_ascii=False) + '\n').encode()).hexdigest(),
            'guard': measured, 'corpus': corpus, 'cooldown': cooldown}})
    else:
        result = accept()
    with open(destination, 'x') as out:
        json.dump(result, out, indent=2)
        out.flush()
        os.fsync(out.fileno())
    print(json.dumps(result))


if __name__ == '__main__':
    run()
