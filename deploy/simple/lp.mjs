#!/usr/bin/env node
// LeetPlus simple blue/green deploy. Runs as root on the production host (1337).
//
//   lp status                     current slots, health, workers, recent deploys
//   lp build <sha>                build API/Web images from GitHub source on this host
//   lp stage <sha> [--force]      put <sha> into the idle slot and wait until it is healthy
//   lp switch                     route traffic to the other (healthy) slot; `lp rollback` is the same
//   lp deploy <sha> [--force]     build + stage + switch
//   lp worker <name>              one worker tick on the active release (called by lp-worker@.service)
//   lp boot                       start both slots after host boot (called by lp-runtime.service)
//   lp adopt --yes                take over worker/cleanup timers and boot from the legacy controller
//   lp cleanup [--dry-run]        retention for backups, pre-migration dumps, images and logs
//   lp schema [<sha>]             migrations a release would apply (default: serving release)
//   lp dump                       on-demand database dump into /srv/leetplus/backups/pre-migrate
//
// The layout (compose.json, ports, networks, secrets, nginx active.conf) is the one
// created by the legacy leetplus-compose controller; this tool only edits image
// identities of the API/Web slots and workers. See deploy/simple/README.md.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = '/srv/leetplus';
const COMPOSE = `${ROOT}/compose.json`;
const PROJECT = 'leetplus';
const NGINX_DIR = '/etc/nginx/leetplus-compose';
const STATE = '/var/lib/leetplus-deploy';
const HISTORY = `${STATE}/history.jsonl`;
const SRC = '/srv/leetplus-src';
const BUILD_ROOT = '/srv/leetplus-build';
const REPO = 'https://github.com/boozik3412/leetplus.git';
const GITHUB_API = 'https://api.github.com/repos/boozik3412/leetplus';
const PG_CONTAINER = process.env.LP_PG_CONTAINER ?? 'leetplus-postgres';
const PG_BIN = process.env.LP_PG_BIN ?? '/usr/lib/postgresql/16/bin';
const MIGRATIONS_DIR = '/app/packages/database/prisma/migrations';
const BACKUPS = `${ROOT}/backups/export`;
const PRE_MIGRATE_DUMPS = `${ROOT}/backups/pre-migrate`;
const SLOTS = ['blue', 'green'];
const PORTS = { blue: { web: 13100, api: 14100 }, green: { web: 13200, api: 14200 } };
const WORKERS = { 'bonus-ledger-worker': 16 * 60, 'langame-daily-worker': 45 * 60 };
// Same checks that branch protection requires for main.
const REQUIRED_CHECKS = [
  'Release impact classification',
  'Fast authority root trust',
  'Fast application checks',
  'Release critical pilot HTTP and fresh store scope',
  'Release critical PostgreSQL assortment isolation',
];
const LEGACY_UNITS = { timers: ['leetplus-compose-bonus.timer', 'leetplus-compose-daily.timer'], boot: 'leetplus-compose-runtime.service' };
const LP_UNITS = { timers: ['lp-bonus.timer', 'lp-daily.timer', 'lp-cleanup.timer'], boot: 'lp-runtime.service' };
const WORKER_TIMERS = ['lp-bonus.timer', 'lp-daily.timer'];
const MUTATING = new Set(['build', 'stage', 'switch', 'rollback', 'deploy', 'adopt', 'cleanup']);

class Stop extends Error {}
const fail = message => { throw new Stop(message); };
const log = message => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function run(cmd, args, { input, timeout = 600_000, allowFail = false, inherit = false, logFile, cwd } = {}) {
  const fd = logFile ? fs.openSync(logFile, 'a', 0o600) : null;
  const stdio = fd !== null ? ['ignore', fd, fd] : inherit ? ['ignore', 'inherit', 'inherit'] : 'pipe';
  const result = spawnSync(cmd, args, { input, timeout, cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio });
  if (fd !== null) fs.closeSync(fd);
  if (result.error) { if (allowFail) return { ok: false, out: '', err: String(result.error) }; throw result.error; }
  const out = (result.stdout ?? '').trim(), err = (result.stderr ?? '').trim();
  if (result.status !== 0 && !allowFail) {
    const detail = logFile ? `last lines of ${logFile}:\n${tail(logFile, 40)}` : (err || out).slice(-4000);
    fail(`${cmd} ${args.slice(0, 4).join(' ')} … exited ${result.status}\n${detail}`.trim());
  }
  return { ok: result.status === 0, out, err, status: result.status };
}
function tail(file, lines) { try { return fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(-lines).join('\n'); } catch { return ''; } }
const docker = (args, options) => run('docker', args, options);
const compose = (args, options) => docker(['compose', '--project-name', PROJECT, '--file', COMPOSE, ...args], options);

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJsonAtomic(file, value) {
  const tmp = `${file}.lp-${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function record(entry) {
  fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
  fs.appendFileSync(HISTORY, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------- slots & health

function activeSlot() {
  const target = fs.readlinkSync(`${NGINX_DIR}/active.conf`);
  const slot = path.basename(target, '.conf');
  if (!SLOTS.includes(slot)) fail(`Unexpected nginx active.conf target: ${target}`);
  return slot;
}
const otherSlot = slot => (slot === 'blue' ? 'green' : 'blue');

function inspect(name) {
  const r = docker(['inspect', name], { allowFail: true });
  return r.ok ? JSON.parse(r.out)[0] : null;
}
function containerInfo(name) {
  const c = inspect(name);
  if (!c) return { exists: false };
  return { exists: true, image: c.Image, release: c.Config.Labels?.['ru.leetplus.release'] ?? null,
    running: c.State.Running, health: c.State.Health?.Status ?? 'none', startedAt: c.State.StartedAt };
}
function slotInfo(slot) {
  return { slot, api: containerInfo(`${PROJECT}-api-${slot}`), web: containerInfo(`${PROJECT}-web-${slot}`) };
}
const slotHealthy = info => info.api.running && info.web.running && info.api.health === 'healthy' && info.web.health === 'healthy';

async function httpJson(url, { resolve } = {}) {
  const args = ['-sS', '--max-time', '10', '-o', '-', '-w', '\n%{http_code}'];
  if (resolve) args.push('--resolve', resolve);
  const r = run('curl', [...args, url], { allowFail: true, timeout: 20_000 });
  if (!r.ok) return { status: 0, body: null };
  const lines = r.out.split('\n'), status = Number(lines.pop());
  let body = null; try { body = JSON.parse(lines.join('\n')); } catch { /* non-JSON */ }
  return { status, body };
}
const shaOf = body => body?.release?.sha ?? body?.sha ?? body?.releaseSha ?? null;

async function waitHealthy(name, timeoutSec) {
  const deadline = Date.now() + timeoutSec * 1000;
  let last = '';
  while (Date.now() < deadline) {
    const info = containerInfo(name);
    if (info.exists && !info.running) fail(`${name} stopped while starting; see: docker logs --tail 100 ${name}`);
    if (info.health === 'healthy') return;
    if (info.health === 'unhealthy') fail(`${name} is unhealthy; see: docker logs --tail 100 ${name}`);
    if (info.health !== last) { log(`${name}: ${info.health}`); last = info.health; }
    await sleep(3000);
  }
  fail(`${name} did not become healthy in ${timeoutSec}s; see: docker logs --tail 100 ${name}`);
}

async function smokeSlot(slot, sha) {
  const api = await httpJson(`http://127.0.0.1:${PORTS[slot].api}/health/ready`);
  if (api.status !== 200 || api.body?.ok !== true || shaOf(api.body) !== sha) fail(`API ${slot} smoke failed: HTTP ${api.status}, sha ${shaOf(api.body)}`);
  const web = await httpJson(`http://127.0.0.1:${PORTS[slot].web}/api/release-identity`);
  if (web.status !== 200 || shaOf(web.body) !== sha) fail(`Web ${slot} smoke failed: HTTP ${web.status}, sha ${shaOf(web.body)}`);
  const page = run('curl', ['-sS', '--max-time', '15', '-o', '/dev/null', '-w', '%{http_code}', `http://127.0.0.1:${PORTS[slot].web}/`], { allowFail: true });
  if (!page.ok || Number(page.out) >= 500 || Number(page.out) === 0) fail(`Web ${slot} home page returned HTTP ${page.out || 'error'}`);
  log(`smoke ${slot}: API ok, Web ok, home HTTP ${page.out}`);
}

async function publicCheck(sha) {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const api = await httpJson('https://api.leetplus.ru/health/ready', { resolve: 'api.leetplus.ru:443:127.0.0.1' });
    const web = await httpJson('https://leetplus.ru/api/release-identity', { resolve: 'leetplus.ru:443:127.0.0.1' });
    if (api.status === 200 && shaOf(api.body) === sha && web.status === 200 && shaOf(web.body) === sha) return true;
    log(`public check ${attempt}/10: api ${api.status}/${shaOf(api.body)?.slice(0, 8)}, web ${web.status}/${shaOf(web.body)?.slice(0, 8)}`);
    await sleep(3000);
  }
  return false;
}

// ---------------------------------------------------------------- source, CI, images

function ensureSource() {
  if (!fs.existsSync(SRC)) run('git', ['clone', '--bare', '--quiet', REPO, SRC], { timeout: 600_000 });
  run('git', ['-C', SRC, 'fetch', '--quiet', '--force', '--prune', REPO, '+refs/heads/*:refs/heads/*'], { timeout: 600_000 });
}
function resolveSha(ref) {
  if (!/^[0-9a-f]{7,40}$/.test(ref ?? '')) fail('Pass a commit SHA (7–40 hex characters)');
  ensureSource();
  const r = run('git', ['-C', SRC, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFail: true });
  if (!r.ok) fail(`Commit ${ref} not found on GitHub (is it pushed?)`);
  return r.out;
}
function onMain(sha) { return run('git', ['-C', SRC, 'merge-base', '--is-ancestor', sha, 'refs/heads/main'], { allowFail: true }).ok; }

async function checkRuns(sha) {
  const runs = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`${GITHUB_API}/commits/${sha}/check-runs?per_page=100&page=${page}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'leetplus-lp' } });
    if (!res.ok) fail(`GitHub API returned ${res.status} for check runs`);
    const data = await res.json();
    runs.push(...data.check_runs);
    if (data.check_runs.length < 100) break;
  }
  return runs;
}
async function verifyCi(sha) {
  const runs = await checkRuns(sha);
  const bad = runs.filter(r => r.status === 'completed' && !['success', 'skipped', 'neutral'].includes(r.conclusion));
  if (bad.length) fail(`CI failed for ${sha.slice(0, 8)}: ${[...new Set(bad.map(r => r.name))].join(', ')}`);
  const missing = REQUIRED_CHECKS.filter(name => !runs.some(r => r.name === name && r.status === 'completed' && r.conclusion === 'success'));
  if (missing.length) {
    const pending = missing.filter(name => runs.some(r => r.name === name && r.status !== 'completed'));
    fail(pending.length ? `CI still running for ${sha.slice(0, 8)}: ${pending.join(', ')}` : `Required checks missing for ${sha.slice(0, 8)}: ${missing.join(', ')}`);
  }
  log(`CI ok: ${REQUIRED_CHECKS.length} required checks passed`);
}

const imageTag = (role, sha) => `leetplus-${role}:${sha}`;
function imageId(ref) { const r = docker(['image', 'inspect', '--format', '{{.Id}}', ref], { allowFail: true }); return r.ok ? r.out : null; }
function imageRelease(ref) {
  return JSON.parse(docker(['run', '--rm', '--network', 'none', '--entrypoint', 'cat', ref, '/app/release.json']).out);
}

async function build(sha, { force = false } = {}) {
  if (!force && imageId(imageTag('api', sha)) && imageId(imageTag('web', sha))) { log(`images for ${sha.slice(0, 8)} already present`); return; }
  const dir = `${BUILD_ROOT}/${sha}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    const archive = spawnSync('git', ['-C', SRC, 'archive', '--format=tar', sha], { maxBuffer: 2 * 1024 * 1024 * 1024 });
    if (archive.status !== 0) fail(`git archive failed: ${archive.stderr}`);
    run('tar', ['-x', '-C', dir], { input: archive.stdout });
    const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const logFile = `${STATE}/build-${sha.slice(0, 12)}.log`;
    fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
    fs.rmSync(logFile, { force: true });
    log(`build log: ${logFile}`);
    for (const role of ['api', 'web']) {
      const started = Date.now();
      log(`building ${imageTag(role, sha)} …`);
      docker(['build', '--platform', 'linux/amd64', '--file', 'deploy/leetplus-compose/Dockerfile', '--target', role,
        '--build-arg', `RELEASE_SHA=${sha}`, '--build-arg', `BUILD_TIME=${builtAt}`, '--tag', imageTag(role, sha), '.'],
      { cwd: dir, timeout: 45 * 60_000, logFile });
      log(`built ${imageTag(role, sha)} in ${Math.round((Date.now() - started) / 1000)}s`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- database migrations
//
// Prisma records applied migrations in _prisma_migrations with checksum =
// sha256(migration.sql). lp compares the image's migration files with that table:
// pending migrations are applied as postgres over the container's local socket
// (the only superuser path pg_hba allows), one transaction per migration together
// with its _prisma_migrations row, after a pre-migration dump and with workers paused.

const psqlArgs = ['-X', '-v', 'ON_ERROR_STOP=1', '--host=/tmp', '--username=postgres', '--dbname=leetplus'];

function databaseMigrations() {
  const out = docker(['exec', PG_CONTAINER, `${PG_BIN}/psql`, ...psqlArgs, '-At', '-F', '|', '-c',
    'select migration_name, checksum, (finished_at is not null and rolled_back_at is null)::int, '
    + '(finished_at is null and rolled_back_at is null)::int from public."_prisma_migrations" order by migration_name']).out;
  const applied = new Map(), unfinished = [];
  for (const line of out ? out.split('\n') : []) {
    const [name, checksum, done, open] = line.split('|');
    if (done === '1') applied.set(name, checksum);
    if (open === '1') unfinished.push(name);
  }
  return { applied, unfinished };
}

function imageMigrations(image) {
  const script = `const fs=require('fs'),c=require('crypto'),p=require('path');const d=${JSON.stringify(MIGRATIONS_DIR)};`
    + "for(const n of fs.readdirSync(d).filter(n=>/^\\d{14}_/.test(n)).sort()){const f=p.join(d,n,'migration.sql');"
    + "if(fs.existsSync(f))console.log(n+' '+c.createHash('sha256').update(fs.readFileSync(f)).digest('hex'))}";
  const out = docker(['run', '--rm', '--network', 'none', '--entrypoint', 'node', image, '-e', script]).out;
  return new Map(out.split('\n').filter(Boolean).map(line => line.split(' ')));
}

export function planSchema(image, db) {
  const plan = { pending: [], ahead: [], mismatched: [], unfinished: [...db.unfinished] };
  for (const [name, checksum] of db.applied) {
    if (!image.has(name)) plan.ahead.push(name);
    else if (image.get(name) !== checksum) plan.mismatched.push(name);
  }
  for (const name of image.keys()) if (!db.applied.has(name)) plan.pending.push(name);
  plan.pending.sort(); plan.ahead.sort();
  return plan;
}

function supportsDatabaseAhead(image) {
  return docker(['run', '--rm', '--network', 'none', '--entrypoint', 'cat', image, '/opt/leetplus/health.cjs'], { allowFail: true }).out.includes('DATABASE_AHEAD');
}

function schemaGate(plan, image, { allowPending, quiet = false }) {
  const list = names => names.slice(0, 5).join(', ') + (names.length > 5 ? ` … (+${names.length - 5})` : '');
  if (plan.unfinished.length) fail(`Database has unfinished migration(s): ${list(plan.unfinished)}; resolve them first`);
  // Like `prisma migrate deploy`, an applied migration whose file was edited later is
  // not re-run; production has a few such historical edits, so this is a warning.
  if (plan.mismatched.length && !quiet) log(`note: ${plan.mismatched.length} applied migration(s) were edited after they ran: ${list(plan.mismatched)}`);
  if (plan.ahead.length && plan.pending.length) fail(`Release and database diverged: database has ${list(plan.ahead)}, release has ${list(plan.pending)}`);
  if (plan.pending.length && !allowPending) fail(`Release needs migration(s) ${list(plan.pending)}; use lp stage/deploy to apply them`);
  if (plan.ahead.length && !supportsDatabaseAhead(image)) {
    fail(`Database is ahead of this release (${list(plan.ahead)}) and the release predates DATABASE_AHEAD readiness`);
  }
}

// One migration, one transaction: its SQL, its _prisma_migrations row, and a check
// that every table it creates is reachable by the runtime role (or explicitly marked).
export function migrationScript(name, checksum, sql) {
  if (!/^\d{14}_[A-Za-z0-9_]+$/.test(name) || !/^[0-9a-f]{64}$/.test(checksum)) fail(`Invalid migration identity ${name}`);
  if (/^\s*(BEGIN(\s+(WORK|TRANSACTION))?|COMMIT|ROLLBACK|START\s+TRANSACTION)\s*;/im.test(sql)) {
    fail(`${name} manages its own transactions; lp applies each migration in one transaction`);
  }
  if (/\bCONCURRENTLY\b/i.test(sql)) fail(`${name} uses CONCURRENTLY, which cannot run inside a transaction`);
  const exempt = [...sql.matchAll(/^--\s*lp:no-runtime-access\s+"?([A-Za-z0-9_]+)"?\s*$/gm)].map(m => m[1]);
  const literal = value => `'${value.replaceAll("'", "''")}'`;
  return [
    'BEGIN;',
    'CREATE TEMP TABLE lp_tables_before ON COMMIT DROP AS',
    "  SELECT c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');",
    `-- migration ${name}`,
    sql,
    ';',
    'RESET ROLE;',
    'INSERT INTO public."_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)',
    `  VALUES (gen_random_uuid()::text, ${literal(checksum)}, ${literal(name)}, now(), now(), 1);`,
    'DO $lp$',
    'DECLARE missing text;',
    'BEGIN',
    "  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing",
    '  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace',
    "  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')",
    '    AND c.oid NOT IN (SELECT oid FROM lp_tables_before)',
    "    AND NOT pg_catalog.has_table_privilege('leetplus_runtime', c.oid, 'SELECT, INSERT, UPDATE, DELETE')",
    `    AND c.relname <> ALL (ARRAY[${exempt.map(literal).join(', ')}]::text[]);`,
    '  IF missing IS NOT NULL THEN',
    "    RAISE EXCEPTION 'lp: new table(s) without leetplus_runtime privileges: % (add GRANT ... TO leetplus_runtime, or a line \"-- lp:no-runtime-access <Table>\")', missing;",
    '  END IF;',
    'END',
    '$lp$;',
    'COMMIT;',
    '',
  ].join('\n');
}

function preMigrationDump(sha) {
  fs.mkdirSync(PRE_MIGRATE_DUMPS, { recursive: true, mode: 0o700 });
  const file = `${PRE_MIGRATE_DUMPS}/${new Date().toISOString().replace(/[:.]/g, '-')}-${sha.slice(0, 12)}.dump`;
  const fd = fs.openSync(file, 'wx', 0o600);
  const started = Date.now();
  const r = spawnSync('docker', ['exec', PG_CONTAINER, `${PG_BIN}/pg_dump`, '--host=/tmp', '--username=postgres', '--format=custom',
    '--compress=1', '--dbname=leetplus'], { stdio: ['ignore', fd, 'pipe'], timeout: 30 * 60_000, encoding: 'utf8' });
  fs.closeSync(fd);
  const header = Buffer.alloc(5);
  if (r.status === 0) { const h = fs.openSync(file, 'r'); fs.readSync(h, header, 0, 5, 0); fs.closeSync(h); }
  if (r.status !== 0 || header.toString() !== 'PGDMP') {
    fs.rmSync(file, { force: true });
    fail(`Pre-migration dump failed: ${(r.stderr ?? r.error ?? '').toString().slice(-500)}`);
  }
  log(`pre-migration dump: ${file} (${Math.round(fs.statSync(file).size / 1048576)} MB, ${Math.round((Date.now() - started) / 1000)}s)`);
  return file;
}

async function withWorkersPaused(fn) {
  run('systemctl', ['stop', ...WORKER_TIMERS]);
  try {
    const deadline = Date.now() + 15 * 60_000;
    for (;;) {
      const busy = Object.keys(WORKERS).filter(name => ['active', 'activating'].includes(run('systemctl', ['is-active', `lp-worker@${name}.service`], { allowFail: true }).out));
      if (!busy.length) break;
      if (Date.now() > deadline) fail(`Workers still running after 15 min: ${busy.join(', ')}; retry later`);
      log(`waiting for ${busy.join(', ')} to finish before migrating …`);
      await sleep(10_000);
    }
    return await fn();
  } finally {
    run('systemctl', ['start', ...WORKER_TIMERS], { allowFail: true });
  }
}

function applyMigrations(image, migrations, pending) {
  for (const name of pending) {
    const read = spawnSync('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'cat', image, `${MIGRATIONS_DIR}/${name}/migration.sql`], { maxBuffer: 64 * 1024 * 1024 });
    if (read.status !== 0) fail(`Cannot read ${name} from the image`);
    const checksum = crypto.createHash('sha256').update(read.stdout).digest('hex');
    if (checksum !== migrations.get(name)) fail(`${name} changed while reading it from the image`);
    const started = Date.now();
    const r = run('docker', ['exec', '-i', PG_CONTAINER, `${PG_BIN}/psql`, ...psqlArgs, '-q'],
      { input: migrationScript(name, checksum, read.stdout.toString('utf8')), allowFail: true, timeout: 30 * 60_000 });
    if (!r.ok) fail(`Migration ${name} failed and was rolled back:\n${(r.err || r.out).slice(-3000)}`);
    log(`applied ${name} (${Date.now() - started} ms)`);
  }
}

// ---------------------------------------------------------------- compose edits

function metadataEnv(release) {
  return { RELEASE_SHA: release.releaseSha, BUILD_TIME: release.builtAt, WEB_BUILD_ID: release.releaseSha,
    EXPECTED_DATABASE_MIGRATION: release.migration, EXPECTED_DATABASE_MIGRATION_COUNT: String(release.migrationCount) };
}
function pointService(service, image, release) {
  service.image = image;
  service.labels = { ...service.labels, 'ru.leetplus.release': release.releaseSha };
  service.environment = { ...service.environment, ...metadataEnv(release) };
}
function snapshotCompose(reason) {
  fs.mkdirSync(`${STATE}/compose-history`, { recursive: true, mode: 0o700 });
  fs.copyFileSync(COMPOSE, `${STATE}/compose-history/${new Date().toISOString().replace(/[:.]/g, '-')}-${reason}.json`);
}
function pointWorkersAt(spec, slot) {
  const api = spec.services[`api-${slot}`];
  const release = { releaseSha: api.environment.RELEASE_SHA, builtAt: api.environment.BUILD_TIME,
    migration: api.environment.EXPECTED_DATABASE_MIGRATION, migrationCount: Number(api.environment.EXPECTED_DATABASE_MIGRATION_COUNT) };
  for (const name of Object.keys(WORKERS)) if (spec.services[name]) pointService(spec.services[name], api.image, release);
}

// Start each worker's entrypoint on the new image with its real secret profile
// in check mode (LEETPLUS_ENTRY_CHECK=1): it validates and exits without work.
function preflightWorkers(spec, apiImage, release) {
  const entry = docker(['run', '--rm', '--network', 'none', '--entrypoint', 'cat', apiImage, '/opt/leetplus/runtime-entry.cjs']).out;
  if (!entry.includes('LEETPLUS_ENTRY_CHECK')) { log('worker preflight skipped: this image has no entry check mode'); return; }
  for (const name of Object.keys(WORKERS)) {
    const svc = spec.services[name];
    if (!svc) continue;
    const args = ['run', '--rm', '--network', 'none', '--read-only', '--user', svc.user, '--entrypoint', 'node'];
    for (const group of svc.group_add ?? []) args.push('--group-add', String(group));
    for (const v of svc.volumes ?? []) if (v.type === 'bind') args.push('--mount', `type=bind,src=${v.source},dst=${v.target},readonly`);
    for (const [key, value] of Object.entries({ ...svc.environment, ...metadataEnv(release), LEETPLUS_ENTRY_CHECK: '1' })) args.push('--env', `${key}=${value}`);
    const r = docker([...args, apiImage, '/opt/leetplus/runtime-entry.cjs', name], { allowFail: true, timeout: 60_000 });
    if (!r.ok) {
      const reason = `${r.err}\n${r.out}`.split('\n').find(line => line.startsWith('Error')) ?? `${r.err}${r.out}`.slice(-300);
      fail(`${name} would not start on ${release.releaseSha.slice(0, 8)}: ${reason}`);
    }
  }
  log(`worker preflight: ${Object.keys(WORKERS).join(', ')} start on the new image`);
}

// ---------------------------------------------------------------- commands

async function stage(sha, { force }) {
  const started = Date.now();
  if (!force) {
    if (!onMain(sha)) fail(`${sha.slice(0, 8)} is not on main; merge it first (or use --force for an emergency)`);
    await verifyCi(sha);
  }
  await build(sha);
  const active = activeSlot(), target = otherSlot(active);
  const images = { api: imageId(imageTag('api', sha)), web: imageId(imageTag('web', sha)) };
  const releases = { api: imageRelease(images.api), web: imageRelease(images.web) };
  for (const role of ['api', 'web']) if (releases[role].releaseSha !== sha) fail(`${role} image carries release ${releases[role].releaseSha}, expected ${sha}`);
  const migrations = imageMigrations(images.api);
  const plan = planSchema(migrations, databaseMigrations());
  schemaGate(plan, images.api, { allowPending: true });

  const spec = readJson(COMPOSE);
  preflightWorkers(spec, images.api, releases.api);
  if (plan.pending.length) {
    log(`release has ${plan.pending.length} new migration(s): ${plan.pending.join(', ')}`);
    const serving = slotInfo(active).api;
    if (serving.exists && !supportsDatabaseAhead(serving.image)) {
      log(`warning: serving release ${serving.release?.slice(0, 8)} predates DATABASE_AHEAD; its readiness will report a schema mismatch until the switch`);
    }
    const dump = preMigrationDump(sha);
    await withWorkersPaused(() => applyMigrations(images.api, migrations, plan.pending));
    record({ action: 'migrate', sha, migrations: plan.pending, dump });
  }
  snapshotCompose(`stage-${target}-${sha.slice(0, 8)}`);
  for (const role of ['api', 'web']) {
    const svc = spec.services[`${role}-${target}`], ref = spec.services[`${role}-${active}`];
    pointService(svc, images[role], releases[role]);
    // Keep resource bounds in line with the currently serving slot.
    for (const key of ['mem_limit', 'memswap_limit', 'cpus', 'pids_limit']) {
      if (Object.hasOwn(ref, key)) svc[key] = ref[key]; else delete svc[key];
    }
  }
  writeJsonAtomic(COMPOSE, spec);
  log(`staging ${sha.slice(0, 8)} into idle slot ${target} (serving slot ${active} is untouched)`);
  try {
    await startSlot(target, sha);
  } catch (error) {
    error.message += `\nServing slot ${active} was not touched. Standby slot ${target} is NOT a valid rollback target until a stage succeeds.`;
    throw error;
  }
  record({ action: 'stage', sha, slot: target, seconds: Math.round((Date.now() - started) / 1000) });
  log(`staged ${sha.slice(0, 8)} in ${target} in ${Math.round((Date.now() - started) / 1000)}s`);
  return target;
}

async function startSlot(target, sha) {
  compose(['up', '--detach', '--no-deps', '--force-recreate', `api-${target}`], { timeout: 300_000 });
  await waitHealthy(`${PROJECT}-api-${target}`, 300);
  const cache = `${ROOT}/data/web-cache-${target}`;
  compose(['stop', `web-${target}`], { allowFail: true, timeout: 120_000 });
  if (fs.existsSync(cache)) for (const entry of fs.readdirSync(cache)) fs.rmSync(path.join(cache, entry), { recursive: true, force: true });
  compose(['up', '--detach', '--no-deps', '--force-recreate', `web-${target}`], { timeout: 300_000 });
  await waitHealthy(`${PROJECT}-web-${target}`, 300);
  await smokeSlot(target, sha);
}

async function switchTo(target, { reason }) {
  const current = activeSlot();
  if (target === current) fail(`${target} is already serving`);
  const info = slotInfo(target);
  if (!slotHealthy(info)) fail(`Slot ${target} is not healthy (api ${info.api.health}, web ${info.web.health}); not switching`);
  const sha = info.api.release;
  if (info.web.release !== sha) fail(`Slot ${target} runs mixed releases (api ${sha}, web ${info.web.release})`);
  schemaGate(planSchema(imageMigrations(info.api.image), databaseMigrations()), info.api.image, { allowPending: false, quiet: true });
  await smokeSlot(target, sha);

  const flip = slot => {
    const tmp = `${NGINX_DIR}/.active.conf.lp`;
    fs.rmSync(tmp, { force: true });
    fs.symlinkSync(`${slot}.conf`, tmp);
    fs.renameSync(tmp, `${NGINX_DIR}/active.conf`);
    const test = run('nginx', ['-t'], { allowFail: true });
    if (!test.ok) return test.err;
    run('systemctl', ['reload', 'nginx']);
    return null;
  };
  const error = flip(target);
  if (error) { flip(current); fail(`nginx -t failed, stayed on ${current}:\n${error}`); }
  log(`nginx now routes to ${target} (${sha.slice(0, 8)})`);

  if (!(await publicCheck(sha))) {
    flip(current);
    record({ action: reason, sha, slot: target, result: 'REVERTED' });
    fail(`Public check failed after switching to ${target}; traffic returned to ${current}`);
  }
  const spec = readJson(COMPOSE);
  snapshotCompose(`${reason}-${target}-${sha.slice(0, 8)}`);
  pointWorkersAt(spec, target);
  writeJsonAtomic(COMPOSE, spec);
  record({ action: reason, sha, slot: target, previous: { slot: current, sha: slotInfo(current).api.release }, result: 'OK' });
  log(`done: ${target} serves ${sha.slice(0, 8)}; ${current} stays up as instant rollback (lp rollback)`);
}

async function worker(name) {
  const timeoutSec = WORKERS[name];
  if (!timeoutSec) fail(`Unknown worker ${name}`);
  const existing = containerInfo(`${PROJECT}-${name}`);
  if (existing.running) fail(`${name} is still running from a previous tick`);
  compose(['up', '--no-start', '--no-deps', '--force-recreate', name], { timeout: 120_000 });
  const result = docker(['start', '--attach', `${PROJECT}-${name}`], { allowFail: true, timeout: timeoutSec * 1000, inherit: true });
  const state = inspect(`${PROJECT}-${name}`)?.State;
  if (!result.ok || state?.Running || state?.ExitCode !== 0) {
    if (state?.Running) docker(['stop', '--time', '60', `${PROJECT}-${name}`], { allowFail: true });
    fail(`${name} failed (exit ${state?.ExitCode ?? result.status})`);
  }
}

async function boot() {
  const active = activeSlot();
  for (const slot of [active, otherSlot(active)]) {
    for (const role of ['api', 'web']) {
      const name = `${PROJECT}-${role}-${slot}`;
      if (containerInfo(name).exists) docker(['start', name], { allowFail: slot !== active });
    }
  }
  await waitHealthy(`${PROJECT}-api-${active}`, 300);
  await waitHealthy(`${PROJECT}-web-${active}`, 300);
  log(`boot: ${active} is healthy`);
}

// ---------------------------------------------------------------- retention

// Encrypted nightly exports: everything from the last 7 days, the 01:00 UTC run
// from the last 14 days, and never the 3 newest (so a stalled backup job cannot
// age every copy out).
export function backupsToPrune(names, now = Date.now()) {
  const parsed = names.map(name => {
    const m = /^backup-(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z\.lpbackup$/.exec(name);
    return m && { name, hour: m[4], at: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) };
  }).filter(Boolean).sort((a, b) => b.at - a.at);
  return parsed.slice(3).filter(({ at, hour }) => {
    const days = (now - at) / 86_400_000;
    return !(days < 7 || (days < 14 && hour === '01'));
  }).map(b => b.name);
}

function cleanup({ dry }) {
  const act = (what, fn) => { log(`${dry ? 'would remove' : 'removing'} ${what}`); if (!dry) fn(); };
  if (fs.existsSync(BACKUPS)) {
    let latest = null;
    try { latest = readJson(`${BACKUPS}/latest.json`).filename; } catch { /* no pointer yet */ }
    for (const name of backupsToPrune(fs.readdirSync(BACKUPS))) {
      if (name === latest) continue;
      act(`backup ${name}`, () => {
        fs.rmSync(`${BACKUPS}/${name}`, { force: true });
        fs.rmSync(`${BACKUPS}/${name.replace(/\.lpbackup$/, '.json')}`, { force: true });
      });
    }
  }
  const keepNewest = (dir, match, keep, label) => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(match).map(name => ({ name, t: fs.statSync(path.join(dir, name)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const { name } of files.slice(keep)) act(`${label} ${name}`, () => fs.rmSync(path.join(dir, name), { force: true }));
  };
  keepNewest(PRE_MIGRATE_DUMPS, name => name.endsWith('.dump'), 5, 'pre-migration dump');
  keepNewest(`${STATE}/compose-history`, name => name.endsWith('.json'), 100, 'compose snapshot');
  keepNewest(STATE, name => /^build-.*\.log$/.test(name), 20, 'build log');

  // Images: keep everything a container uses, plus the 3 newest other app builds.
  const ids = docker(['ps', '-aq']).out.split('\n').filter(Boolean);
  const inUse = new Set(ids.length ? docker(['inspect', '--format', '{{.Image}}', ...ids]).out.split('\n') : []);
  const images = docker(['images', '--no-trunc', '--format', '{{.Repository}}:{{.Tag}}|{{.ID}}|{{.CreatedAt}}']).out.split('\n')
    .map(line => line.split('|')).filter(([ref]) => /^leetplus-(api|web|postgres|redis):[0-9a-f]{40}$/.test(ref ?? ''))
    .map(([ref, id, created]) => ({ ref, id, role: ref.split(':')[0].slice('leetplus-'.length), sha: ref.split(':')[1], created: Date.parse(created.replace(/ [A-Z]+$/, '')) }));
  const keepShas = new Set([...new Set(images.filter(i => ['api', 'web'].includes(i.role) && !inUse.has(i.id)).sort((a, b) => b.created - a.created).map(i => i.sha))].slice(0, 3));
  for (const image of images) {
    if (inUse.has(image.id)) continue;
    if (['api', 'web'].includes(image.role) && keepShas.has(image.sha)) continue;
    act(`image ${image.ref.slice(0, 24)}`, () => docker(['rmi', image.ref], { allowFail: true }));
  }
  record({ action: 'cleanup', result: dry ? 'DRY' : 'OK' });
}

function systemd(args) { return run('systemctl', args, { allowFail: true }); }
function unitState(unit) { return `${systemd(['is-enabled', unit]).out || '?'}/${systemd(['is-active', unit]).out || '?'}`; }

async function adopt({ yes }) {
  const spec = readJson(COMPOSE);
  for (const [name, svc] of Object.entries(spec.services)) {
    if (Object.hasOwn(WORKERS, name)) continue; // one-shot containers, recreated every tick
    const live = inspect(svc.container_name);
    if (live?.State.Running && live.Image !== svc.image) fail(`compose.json disagrees with running ${svc.container_name}; refusing to adopt`);
  }
  for (const unit of [...LP_UNITS.timers, LP_UNITS.boot, 'lp-worker@.service']) {
    if (!fs.existsSync(`/etc/systemd/system/${unit}`)) fail(`${unit} is not installed; run install.sh first`);
  }
  if (!yes) { console.log(`Would disable legacy worker timers/boot and enable ${[...LP_UNITS.timers, LP_UNITS.boot].join(', ')}. Re-run with --yes.`); return; }
  run('systemctl', ['disable', '--now', ...LEGACY_UNITS.timers]);
  run('systemctl', ['disable', LEGACY_UNITS.boot]);
  run('systemctl', ['enable', '--now', ...LP_UNITS.timers]);
  run('systemctl', ['enable', LP_UNITS.boot]);
  record({ action: 'adopt', disabled: [...LEGACY_UNITS.timers, LEGACY_UNITS.boot], enabled: [...LP_UNITS.timers, LP_UNITS.boot] });
  log('adopted: workers and boot now run through lp; legacy network fence, network refresh and backup timers are unchanged');
}

function status() {
  const active = activeSlot();
  console.log(`serving slot: ${active}`);
  for (const slot of SLOTS) {
    const info = slotInfo(slot);
    const fmt = c => (c.exists ? `${c.release?.slice(0, 8) ?? '?'} ${c.running ? 'up' : 'down'}/${c.health}` : 'absent');
    console.log(`  ${slot.padEnd(5)} ${slot === active ? '(serving)' : '(standby)'}  api ${fmt(info.api)}  web ${fmt(info.web)}`);
  }
  const db = databaseMigrations();
  console.log(`database migrations: ${db.applied.size} (last ${[...db.applied.keys()].pop()})${db.unfinished.length ? `, UNFINISHED ${db.unfinished.join(', ')}` : ''}`);
  const workerImage = readJson(COMPOSE).services['bonus-ledger-worker']?.labels?.['ru.leetplus.release'];
  console.log(`workers run release: ${workerImage?.slice(0, 8) ?? '?'}`);
  for (const unit of [...LP_UNITS.timers, LP_UNITS.boot, ...LEGACY_UNITS.timers, LEGACY_UNITS.boot, 'leetplus-compose-backup.timer', 'leetplus-compose-network-refresh.timer']) {
    console.log(`  ${unit.padEnd(40)} ${unitState(unit)}`);
  }
  const free = run('df', ['-h', '--output=avail', ROOT]).out.split('\n').pop().trim();
  console.log(`disk free: ${free}`);
  if (fs.existsSync(HISTORY)) {
    console.log('recent:');
    for (const line of fs.readFileSync(HISTORY, 'utf8').trim().split('\n').slice(-5)) {
      const e = JSON.parse(line);
      console.log(`  ${e.at.slice(0, 16)} ${e.action.padEnd(8)} ${(e.sha ?? '').slice(0, 8)} ${e.slot ?? ''} ${e.result ?? ''}`);
    }
  }
}

// ---------------------------------------------------------------- main

async function main(argv) {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter(a => a.startsWith('--')));
  const args = rest.filter(a => !a.startsWith('--'));
  if (process.getuid() !== 0) fail('Run as root');
  if (MUTATING.has(command) && process.env.LP_LOCKED !== '1') {
    fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
    const r = spawnSync('flock', ['--nonblock', '--conflict-exit-code', '75', `${STATE}/deploy.lock`, process.execPath, process.argv[1], ...argv],
      { stdio: 'inherit', env: { ...process.env, LP_LOCKED: '1' } });
    if (r.status === 75) fail('Another lp command is running');
    process.exit(r.status ?? 1);
  }
  const force = flags.has('--force');
  switch (command) {
    case 'status': return status();
    case 'build': return build(resolveSha(args[0]), { force });
    case 'stage': return stage(resolveSha(args[0]), { force });
    case 'switch': case 'rollback': return switchTo(otherSlot(activeSlot()), { reason: command });
    case 'deploy': { const sha = resolveSha(args[0]); const target = await stage(sha, { force }); return switchTo(target, { reason: 'deploy' }); }
    case 'worker': return worker(args[0]);
    case 'boot': return boot();
    case 'adopt': return adopt({ yes: flags.has('--yes') });
    case 'cleanup': return cleanup({ dry: flags.has('--dry-run') });
    case 'dump': { const file = preMigrationDump(args[0] ? resolveSha(args[0]) : 'manual000000'); return console.log(file); }
    case 'schema': {
      const image = args[0] ? imageId(imageTag('api', resolveSha(args[0]))) : slotInfo(activeSlot()).api.image;
      if (!image) fail(`No API image for ${args[0]}; run lp build first`);
      const plan = planSchema(imageMigrations(image), databaseMigrations());
      console.log(JSON.stringify(plan, null, 2));
      return schemaGate(plan, image, { allowPending: true });
    }
    default:
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 14).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
      if (command && command !== 'help') process.exitCode = 2;
  }
}

const invokedDirectly = (() => {
  try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();
if (invokedDirectly) {
  main(process.argv.slice(2)).catch(error => {
    const [command, ref] = process.argv.slice(2);
    if (MUTATING.has(command) && process.env.LP_LOCKED === '1') {
      try { record({ action: command, sha: ref, result: 'FAILED', error: String(error.message).split('\n')[0].slice(0, 300) }); } catch { /* best effort */ }
    }
    console.error(error instanceof Stop ? `lp: ${error.message}` : error);
    process.exitCode = 1;
  });
}
