import assert from 'node:assert/strict';
import test from 'node:test';
import { backupsToPrune, migrationScript, planSchema } from './lp.mjs';

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
