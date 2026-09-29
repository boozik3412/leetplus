import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(new URL('./runtime-entry.cjs', import.meta.url), 'utf8');
const release = { contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1', releaseSha: 'a'.repeat(40), builtAt: '2026-09-29T00:00:00Z',
  migrationCount: 191, migration: '20260908180000_external_langame_simple_onboarding' };

// Secret key names of the production worker profiles (values are placeholders).
const PROFILES = {
  'bonus-ledger-worker': ['APP_ENCRYPTION_KEY', 'DATABASE_URL', 'GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED',
    'GUEST_BONUS_LEDGER_WORKER_ENABLED', 'GUEST_GAMIFICATION_WORKER_ENABLED', 'INTEGRATION_ENCRYPTION_KEY',
    'LANGAME_BONUS_ACCRUAL_ENABLED', 'LANGAME_BONUS_ACCRUAL_PATH'],
  'langame-daily-worker': ['APP_ENCRYPTION_KEY', 'DATABASE_URL', 'INTEGRATION_ENCRYPTION_KEY',
    'LANGAME_DAILY_WORKER_ENABLED', 'LANGAME_DAILY_WORKER_LIVE', 'LANGAME_DISCREPANCY_LOG_ROOT'],
};

function check(mode, keys) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-entry-'));
  const releaseFile = path.join(dir, 'release.json'), secretFile = path.join(dir, 'runtime.json');
  fs.writeFileSync(releaseFile, JSON.stringify(release));
  fs.writeFileSync(secretFile, JSON.stringify(Object.fromEntries(keys.map(key => [key, 'placeholder']))), { mode: 0o600 });
  const entry = path.join(dir, 'entry.cjs');
  fs.writeFileSync(entry, source.replaceAll('/app/release.json', releaseFile).replaceAll('/run/secrets/runtime.json', secretFile));
  const result = spawnSync(process.execPath, [entry, mode], { encoding: 'utf8', env: {
    PATH: process.env.PATH, LEETPLUS_ENTRY_CHECK: '1', RELEASE_SHA: release.releaseSha, BUILD_TIME: release.builtAt,
    EXPECTED_DATABASE_MIGRATION: release.migration, EXPECTED_DATABASE_MIGRATION_COUNT: String(release.migrationCount) } });
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

const posixNonRoot = process.platform !== 'win32' && process.getuid() !== 0;

for (const [mode, keys] of Object.entries(PROFILES)) {
  test(`${mode} accepts its production secret profile`, { skip: !posixNonRoot }, () => {
    const result = check(mode, keys);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`runtime entry check passed: ${mode}`));
  });
}

test('workers reject secrets outside their profile', { skip: !posixNonRoot }, () => {
  const result = check('bonus-ledger-worker', ['DATABASE_URL', 'SYNC_SERVICE_TOKEN']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside its dedicated profile/);
});
