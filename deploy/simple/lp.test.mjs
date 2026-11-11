import assert from 'node:assert/strict';
import test from 'node:test';
import { addressLockArgs, addressPeerAction, backupsToPrune, ciVerdict, migrationScript, planSchema } from './lp.mjs';

const sum = char => char.repeat(64);
const db = (entries, unfinished = []) => ({ applied: new Map(entries), unfinished });

test('planSchema finds pending migrations after the applied ones', () => {
  const plan = planSchema(new Map([['20260101000000_a', sum('a')], ['20260201000000_b', sum('b')]]), db([['20260101000000_a', sum('a')]]));
  assert.deepEqual(plan, { pending: ['20260201000000_b'], ahead: [], mismatched: [], unfinished: [] });
});

test('planSchema reports a database ahead of the release', () => {
  const plan = planSchema(new Map([['20260101000000_a', sum('a')]]), db([['20260101000000_a', sum('a')], ['20260201000000_b', sum('b')]]));
  assert.deepEqual(plan.ahead, ['20260201000000_b']);
  assert.deepEqual(plan.pending, []);
});

test('planSchema reports checksum drift and unfinished rows', () => {
  const plan = planSchema(new Map([['20260101000000_a', sum('c')]]), db([['20260101000000_a', sum('a')]], ['20260301000000_x']));
  assert.deepEqual(plan.mismatched, ['20260101000000_a']);
  assert.deepEqual(plan.unfinished, ['20260301000000_x']);
});

test('migrationScript wraps SQL, records the checksum and checks runtime grants', () => {
  const script = migrationScript('20261001090000_add_thing', sum('d'), 'CREATE TABLE "Thing" ("id" TEXT PRIMARY KEY);\n-- lp:no-runtime-access "AuditOnly"\n');
  assert.match(script, /^BEGIN;/);
  assert.match(script, /COMMIT;\n$/);
  assert.match(script, /CREATE TABLE "Thing"/);
  assert.match(script, new RegExp(`'${sum('d')}', '20261001090000_add_thing', now\\(\\), now\\(\\), 1`));
  assert.match(script, /has_table_privilege\('leetplus_runtime'/);
  assert.match(script, /ARRAY\['AuditOnly'\]::text\[\]/);
});

test('migrationScript accepts PL/pgSQL blocks but rejects transaction control and CONCURRENTLY', () => {
  const fn = 'CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$\nBEGIN\n  PERFORM 1;\nEND;\n$$;\n';
  assert.doesNotThrow(() => migrationScript('20261001090000_fn', sum('e'), fn));
  assert.throws(() => migrationScript('20261001090000_tx', sum('e'), 'BEGIN;\nSELECT 1;\nCOMMIT;\n'), /own transactions/);
  assert.throws(() => migrationScript('20261001090000_idx', sum('e'), 'CREATE INDEX CONCURRENTLY i ON t (c);'), /CONCURRENTLY/);
  assert.throws(() => migrationScript("20261001090000_x'; DROP", sum('e'), 'SELECT 1;'), /Invalid migration identity/);
});

test('backupsToPrune keeps 7 days, nightly runs for 14 days and the 3 newest', () => {
  const now = Date.UTC(2026, 8, 29, 12);
  const names = [
    'backup-20260929T010000Z.lpbackup', // today
    'backup-20260928T010000Z.lpbackup',
    'backup-20260927T010000Z.lpbackup',
    'backup-20260925T153000Z.lpbackup', // 4 days, daytime: keep
    'backup-20260920T010000Z.lpbackup', // 9 days, nightly: keep
    'backup-20260920T153000Z.lpbackup', // 9 days, daytime: prune
    'backup-20260910T010000Z.lpbackup', // 19 days: prune
    'latest.json',
  ];
  assert.deepEqual(backupsToPrune(names, now).sort(), ['backup-20260910T010000Z.lpbackup', 'backup-20260920T153000Z.lpbackup']);
  // A stalled job: only old backups exist, the 3 newest survive.
  const old = ['backup-20260801T010000Z.lpbackup', 'backup-20260802T010000Z.lpbackup', 'backup-20260803T010000Z.lpbackup', 'backup-20260804T010000Z.lpbackup'];
  assert.deepEqual(backupsToPrune(old, now), ['backup-20260801T010000Z.lpbackup']);
});

test('workers sharing a fence address never run together', () => {
  assert.equal(addressPeerAction('daily-report-worker', true), 'skip');
  assert.equal(addressPeerAction('daily-report-worker', false), 'run');
  assert.equal(addressPeerAction('langame-daily-worker', true), 'wait');
  assert.equal(addressPeerAction('langame-daily-worker', false), 'run');
  assert.equal(addressPeerAction('bonus-ledger-worker', true), 'run');
});

test('fence address peers start their container under one shared lock', () => {
  const report = addressLockArgs('daily-report-worker');
  const daily = addressLockArgs('langame-daily-worker');
  assert.equal(report.at(-1), daily.at(-1));
  assert.ok(report.includes('--nonblock'));
  assert.deepEqual(daily.slice(1, 3), ['--timeout', '300']);
  assert.equal(report[report.indexOf('--conflict-exit-code') + 1], daily[daily.indexOf('--conflict-exit-code') + 1]);
  assert.deepEqual(addressLockArgs('bonus-ledger-worker'), []);
});

const REQUIRED = ['Release impact classification', 'Fast authority root trust', 'Fast application checks', 'Release critical pilot HTTP and fresh store scope', 'Release critical PostgreSQL assortment isolation'];
const ok = name => ({ name, status: 'completed', conclusion: 'success' });

test('ciVerdict passes when every required check succeeded', () => {
  assert.deepEqual(ciVerdict([...REQUIRED.map(ok), { name: 'Compose app-only immutable image candidate', status: 'completed', conclusion: 'skipped' }]), { failed: [], warnings: [], pending: [], missing: [] });
});

test('ciVerdict turns a failed legacy image build into a warning', () => {
  const verdict = ciVerdict([...REQUIRED.map(ok), { name: 'Compose immutable image candidate', status: 'completed', conclusion: 'failure' }, { name: 'B app-only Docker image shadow', status: 'completed', conclusion: 'failure' }]);
  assert.deepEqual(verdict.failed, []);
  assert.deepEqual(verdict.warnings, ['Compose immutable image candidate', 'B app-only Docker image shadow']);
});

test('ciVerdict still blocks any other failed check', () => {
  const verdict = ciVerdict([...REQUIRED.map(ok), { name: 'PostgreSQL migration smoke', status: 'completed', conclusion: 'failure' }, { name: 'Application checks', status: 'completed', conclusion: 'cancelled' }]);
  assert.deepEqual(verdict.failed, ['PostgreSQL migration smoke', 'Application checks']);
});

test('ciVerdict reports a required check that failed, is still running or is missing', () => {
  const runs = [ok(REQUIRED[0]), { name: REQUIRED[1], status: 'completed', conclusion: 'failure' }, { name: REQUIRED[2], status: 'in_progress', conclusion: null }, ok(REQUIRED[3])];
  const verdict = ciVerdict(runs);
  assert.deepEqual(verdict.failed, [REQUIRED[1]]);
  assert.deepEqual(verdict.pending, [REQUIRED[2]]);
  assert.deepEqual(verdict.missing, [REQUIRED[1], REQUIRED[2], REQUIRED[4]]);
});
