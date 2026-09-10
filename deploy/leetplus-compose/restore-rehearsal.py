"""Restore the verified dump to the isolated rehearsal project only.

No production path, public nginx, source server, provider or live worker is
reachable from this controller. Each completed stage has a durable marker.
"""
import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

ROOT = Path('/srv/leetplus-migration/rehearsal')
NAME = 'leetplus-rehearsal'
CONTROL = Path(__file__).resolve().parent


def execute(args, *, data=None, stdin_file=None, timeout=1800, label='command'):
    logs = ROOT / 'evidence'
    logs.mkdir(mode=0o700, exist_ok=True)
    with open(logs / (label + '.stdout'), 'wb') as out, open(logs / (label + '.stderr'), 'wb') as err:
        result = subprocess.run(args, input=data, stdin=stdin_file, stdout=out, stderr=err, timeout=timeout,
                                env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC'})
    (logs / (label + '.exit')).write_text(str(result.returncode))
    if result.returncode:
        raise RuntimeError(f'{label} failed: inspect its private durable logs before retry')
    return (logs / (label + '.stdout')).read_bytes()


def docker(args, **kwargs):
    return execute(['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock'] + args, **kwargs)


def sql(statement, database='leetplus', label='sql'):
    return docker(['exec', '-i', NAME + '-postgres', '/usr/lib/postgresql/16/bin/psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-h', '/tmp', '-U', 'postgres', '-d', database], data=statement.encode(), label=label).decode().strip()


def marker(name, value):
    path = ROOT / 'evidence' / (name + '.json')
    with open(path, 'x') as out:
        json.dump(value, out, indent=2)
        out.flush()
        os.fsync(out.fileno())


def restore(release_path, dump, globals_path, manifest_path):
    if os.getuid() != 0 or not (ROOT / 'preparation.json').is_file():
        raise ValueError('Prepared isolated root required')
    release = json.loads(release_path.read_text())
    prepared = json.loads((ROOT / 'preparation.json').read_text())
    manifest = json.loads(manifest_path.read_text())
    if not prepared.get('rehearsal') or prepared['releaseSha'] != release['releaseSha']:
        raise ValueError('Preparation does not bind this rehearsal image')
    if (ROOT / 'evidence/restore.json').exists():
        raise ValueError('Restore is already complete; do not replay it')
    for name, file in [('leetplus.dump', dump), ('globals.sql', globals_path)]:
        expected = manifest['files'][name]
        digest = hashlib.sha256()
        with open(file, 'rb') as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
        if file.stat().st_size != expected['bytes'] or digest.hexdigest() != expected['sha256']:
            raise ValueError('Input dump/global bytes differ from the verified backup')
    script = "import fs from 'node:fs';import {renderCompose,canonical} from './contract.mjs';const r=JSON.parse(fs.readFileSync(process.argv[1]));console.log(canonical(renderCompose({blue:r,green:r,rehearsal:true})).trimEnd())"
    config = subprocess.check_output(['/usr/bin/node', '--input-type=module', '-e', script, str(release_path)], cwd=CONTROL)
    config_path = ROOT / 'compose.json'
    if config_path.exists():
        if config_path.read_bytes() != config:
            raise ValueError('Existing rehearsal Compose bytes differ')
    else:
        config_path.write_bytes(config)
        config_path.chmod(0o600)
    document = json.loads(config)
    if document['name'] != NAME or not all(net['internal'] for net in document['networks'].values()):
        raise ValueError('Rehearsal must have only internal networks')
    if not (ROOT / 'data/postgres/PG_VERSION').exists():
        if any((ROOT / 'data/postgres').iterdir()):
            raise ValueError('Partial initialization requires inspection')
        docker(['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                '--user', '12030:12030', '--tmpfs', '/tmp:rw,nosuid,nodev,mode=1777',
                '--mount', f'type=bind,source={ROOT}/data/postgres,target=/var/lib/postgresql/16/main',
                '--entrypoint', '/usr/lib/postgresql/16/bin/initdb', release['images']['postgres'],
                '-D', '/var/lib/postgresql/16/main', '-U', 'postgres', '--locale=en_US.UTF-8', '--encoding=UTF8', '-A', 'trust'], label='initdb')
    docker(['compose', '--project-name', NAME, '--file', str(config_path), 'up', '--detach', 'postgres', 'redis'], label='data-start')
    for name, spec in document['networks'].items():
        actual = json.loads(docker(['network', 'inspect', spec['name']], label='network-' + name))[0]
        if not actual['Internal'] or actual['EnableIPv6']:
            raise ValueError('Observed rehearsal network has egress')
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        state = json.loads(docker(['inspect', NAME + '-postgres'], label='postgres-state'))[0]
        if state['State'].get('Health', {}).get('Status') == 'healthy':
            break
        time.sleep(1)
    else:
        raise RuntimeError('Rehearsal PostgreSQL did not start')
    if sql("SELECT count(*) FROM pg_database WHERE datname='leetplus';", database='postgres', label='database-existence') != '0':
        raise ValueError('A database already exists; do not restore over it')
    globals_sql = globals_path.read_text()
    if globals_sql.count('CREATE ROLE postgres;') != 1:
        raise ValueError('Unexpected bootstrap role definition')
    globals_sql = globals_sql.replace('CREATE ROLE postgres;', '-- Existing initdb bootstrap postgres role retained.', 1)
    sql(globals_sql, database='postgres', label='restore-globals')
    # Stream under the container's PostgreSQL UID onto its private data disk,
    # not the bounded /tmp tmpfs; credentials never appear in argv.
    destination = '/var/lib/postgresql/16/main/.rehearsal-input.dump'
    with open(dump, 'rb') as stream:
        docker(['exec', '-i', NAME + '-postgres', '/bin/sh', '-c', f'test ! -e {destination} && umask 077 && cat > {destination}'], stdin_file=stream, label='copy-dump')
    docker(['exec', NAME + '-postgres', '/usr/lib/postgresql/16/bin/pg_restore', '--exit-on-error', '--create',
            '--jobs=4', '--host=/tmp', '--username=postgres', '--dbname=postgres', destination], label='restore-database')
    result = sql('SELECT count(*),max(migration_name),count(*) FILTER(WHERE finished_at IS NULL AND rolled_back_at IS NULL) FROM "_prisma_migrations" WHERE rolled_back_at IS NULL;', label='schema')
    if result != '191|20260908180000_external_langame_simple_onboarding|0':
        raise ValueError('Restored schema is not exact CURRENT191')
    owner = sql("SELECT json_object_agg(rolname,n) FROM (SELECT r.rolname,count(*) n FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' GROUP BY r.rolname) t;", label='owner-inventory')
    privilege = sql("SELECT rolsuper,rolcreatedb,rolcreaterole,rolinherit,has_schema_privilege('leetplus_runtime','public','CREATE') FROM pg_roles WHERE rolname='leetplus_runtime';", label='runtime-privilege')
    if privilege != 'f|f|f|f|f':
        raise ValueError('Restored runtime role gained authority')
    receipt = {'decision': 'DATABASE_RESTORE_PASS', 'releaseSha': release['releaseSha'], 'sourceReleaseSha': manifest['sourceReleaseSha'],
               'schema': result, 'owners': json.loads(owner), 'runtimePrivilege': privilege, 'sourceDumpSha256': manifest['files']['leetplus.dump']['sha256'],
               'providerEgress': 'DENIED', 'runtimeAcceptance': 'PENDING'}
    marker('restore', receipt)
    print(json.dumps(receipt))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--release-json', type=Path, required=True)
    parser.add_argument('--dump', type=Path, required=True)
    parser.add_argument('--globals', dest='globals_path', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    args = parser.parse_args()
    restore(args.release_json, args.dump, args.globals_path, args.manifest)
