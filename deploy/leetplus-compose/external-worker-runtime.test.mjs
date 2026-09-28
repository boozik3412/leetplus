import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { canonical, CONTRACT, digest, EXTERNAL_WORKER_CAPABILITY, SCHEMA } from './contract.mjs';
import { EXTERNAL_WORKER_GRANT_CONTRACT, EXTERNAL_WORKER_IDENTITY, EXTERNAL_WORKER_RESULT_CONTRACT } from './external-worker-contract.mjs';
import { previousExternalBusinessDate, runExternalWorker, validateFrozenExternalContainer } from './external-worker-runtime.mjs';

function fixture(mode = 'TIMER') {
  const now = Date.parse('2026-09-27T19:00:00Z'), runId = crypto.randomUUID(), keys = crypto.generateKeyPairSync('ed25519');
  const identity = EXTERNAL_WORKER_IDENTITY, businessDate = '2026-09-27';
  const bytes = Buffer.from(canonical({ DATABASE_URL: 'postgresql://leetplus_runtime:x@postgres/leetplus?schema=public&connection_limit=1&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict', INTEGRATION_ENCRYPTION_KEY: 'i', APP_ENCRYPTION_KEY: 'a',
    LANGAME_EXTERNAL_WORKER_ENABLED: 'true', LANGAME_EXTERNAL_WORKER_LIVE: 'true', LANGAME_EXTERNAL_WORKER_MODE: mode,
    LANGAME_EXTERNAL_WORKER_TENANT_ID: identity.tenantId, LANGAME_EXTERNAL_WORKER_TENANT_SLUG: identity.tenantSlug,
    LANGAME_EXTERNAL_WORKER_SOURCE_ID: identity.sourceId, LANGAME_EXTERNAL_WORKER_STORE_ID: identity.storeId,
    LANGAME_EXTERNAL_WORKER_DOMAIN: identity.domain, LANGAME_EXTERNAL_WORKER_CLUB_ID: identity.clubId,
    LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE: 'LIVE', LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION: '1',
    LANGAME_EXTERNAL_WORKER_PROFILE_REVISION: '1', LANGAME_EXTERNAL_WORKER_STORE_REVISION: '0',
    LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false', LANGAME_SCHEDULED_HTTP_ENABLED: 'false', GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false',
    ...(mode === 'CANARY' ? { LANGAME_EXTERNAL_WORKER_DATE: businessDate } : {}) }));
  const release = { contract: CONTRACT, releaseSha: 'a'.repeat(40), builtAt: '2026-09-27T00:00:00Z',
    migration: SCHEMA.migration, migrationCount: SCHEMA.migrationCount, externalWorkerCapability: EXTERNAL_WORKER_CAPABILITY,
    images: Object.fromEntries(['api', 'web', 'postgres', 'redis'].map((role, index) => [role, `sha256:${String(index + 1).repeat(64)}`])) };
  const current = { blue: release, green: release, activeSlot: 'green', generation: 10, dataRelease: release };
  const grant = { contract: EXTERNAL_WORKER_GRANT_CONTRACT, id: crypto.randomUUID(), ...identity, mode,
    hostIdentitySha256: 'a'.repeat(64), releaseSha: release.releaseSha, generation: 10, executionRevision: 1, profileRevision: 1, storeRevision: 0,
    secretSha256: digest(bytes), issuedAt: '2026-09-27T18:00:00Z', expiresAt: '2026-09-27T21:00:00Z', businessDate: mode === 'CANARY' ? businessDate : null };
  const grantEnvelope = { grant, signature: crypto.sign(null, Buffer.from(canonical(grant)), keys.privateKey).toString('base64') };
  const result = { contract: EXTERNAL_WORKER_RESULT_CONTRACT, worker: identity.worker, runId, mode, businessDate,
    tenantId: identity.tenantId, tenantSlug: identity.tenantSlug, sourceId: identity.sourceId, storeId: identity.storeId,
    profileRevision: 1, executionRevision: 1, storeRevision: 0, decision: 'SUCCESS', partialScopes: [], failedScopes: [], replayed: false, originalRunId: null };
  const wire = value => `${JSON.stringify(value)}\n`;
  const records = {}, calls = [], execution = { exitCode: 0, stdout: wire(result) };
  const authority = { current, publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }), hostIdentitySha256: grant.hostIdentitySha256, secretBytes: bytes, grantEnvelope };
  const adapters = {
    now: () => now, assertLocks: async () => calls.push('locks'), attestAccepted: async () => authority,
    attestEnrollment: async () => calls.push('enrollment'), verifyNetwork: async () => calls.push('network'),
    readPriorRun: async id => records[id]?.intent,
    assertNoAmbiguousDate: async ({ businessDate, identity }) => { assert.equal(businessDate, '2026-09-27');
      assert.equal(typeof identity, 'string'); calls.push('date-check'); },
    publishRun: async (id, type, value) => { records[id] ??= {}; assert.equal(records[id][type], undefined); records[id][type] = value; calls.push(type); },
    createStopped: async (spec, intent) => { calls.push('create'); assert.equal(spec.services[identity.worker].environment.LANGAME_EXTERNAL_WORKER_BUSINESS_DATE, intent.businessDate); },
    verifyStopped: async () => calls.push('verify'), startAttached: async () => { calls.push('start'); return execution; },
    freezeContainer: async () => { calls.push('freeze-container'); return 'b'.repeat(64); },
    inspectStopped: async id => ({ running: false, pid: 0, exitCode: execution.exitCode, containerId: id }),
  };
  return { now, runId, grant, authority, result, execution, records, calls, adapters, wire };
}
test('business date uses the previous completed Yekaterinburg day at midnight and year boundaries', () => {
  assert.equal(previousExternalBusinessDate(Date.parse('2026-09-27T18:59:59Z')), '2026-09-26');
  assert.equal(previousExternalBusinessDate(Date.parse('2026-09-27T19:00:00Z')), '2026-09-27');
  assert.equal(previousExternalBusinessDate(Date.parse('2026-12-31T19:00:00Z')), '2026-12-31');
});
test('replacement after freeze cannot reach provider start under a different container ID', () => {
  const frozenId = 'a'.repeat(64), replacementId = 'b'.repeat(64), intent = { identity: crypto.randomUUID() };
  const record = { identity: intent.identity, intentSha256: digest(intent), containerId: frozenId,
    image: `sha256:${'c'.repeat(64)}`, name: 'leetplus-langame-external-daily-worker' };
  const stopped = { Id: frozenId, Image: record.image, Name: `/${record.name}`, State: { Running: false, Pid: 0 } };
  assert.equal(validateFrozenExternalContainer(record, intent, stopped, frozenId), frozenId);
  assert.throws(() => validateFrozenExternalContainer(record, intent,
    { ...stopped, Id: replacementId }, frozenId), /replaced/);
  assert.throws(() => validateFrozenExternalContainer(record, intent,
    { ...stopped, State: { Running: true, Pid: 777 } }, frozenId), /started/);
});
test('fresh native run freezes date and authority before stopped creation and records exact result', async () => {
  const f = fixture(), receipt = await runExternalWorker(f);
  assert.equal(receipt.decision, 'SUCCESS'); assert.equal(receipt.businessDate, '2026-09-27');
  assert.ok(f.calls.indexOf('intent') < f.calls.indexOf('create'));
  assert.ok(f.calls.indexOf('enrollment') < f.calls.indexOf('start'));
  assert.ok(f.calls.indexOf('freeze-container') < f.calls.indexOf('start'));
});
test('a consumed canary or rejected enrollment never starts a container', async () => {
  const f = fixture('CANARY'); await runExternalWorker(f);
  const starts = f.calls.filter(v => v === 'start').length;
  await assert.rejects(runExternalWorker({ ...f, runId: crypto.randomUUID() }), /already has an intent/);
  assert.equal(f.calls.filter(v => v === 'start').length, starts);
  const bad = fixture(); bad.adapters.attestEnrollment = async () => { throw new Error('Unsigned enrollment'); };
  await assert.rejects(runExternalWorker(bad), /Unsigned/); assert.equal(bad.calls.includes('create'), false);
});
test('intent-only and wrong result/date are HOLD with no receipt and no blind retry', async () => {
  for (const mutate of [f => { f.execution.stdout = ''; f.execution.exitCode = 1; }, f => { f.result.businessDate = '2026-09-26'; f.execution.stdout = f.wire(f.result); }]) {
    const f = fixture(); mutate(f); await assert.rejects(runExternalWorker(f));
    assert.equal(Object.values(f.records).some(v => v.receipt), false);
    assert.equal(f.calls.filter(v => v === 'start').length, 1);
  }
});
test('permission PARTIAL is terminal, replay exit75 records no new effect, mismatch is rejected', async () => {
  const f = fixture(); f.result.decision = 'PARTIAL'; f.result.partialScopes = ['BUSINESS_FACTS']; f.execution.stdout = f.wire(f.result);
  assert.equal((await runExternalWorker(f)).decision, 'PARTIAL');
  const replay = fixture(); replay.result.replayed = true; replay.result.originalRunId = crypto.randomUUID(); replay.result.runId = replay.result.originalRunId;
  replay.execution.exitCode = 75; replay.execution.stdout = replay.wire(replay.result);
  assert.equal((await runExternalWorker(replay)).decision, 'NO_NEW_EFFECT');
  const mismatch = fixture(); mismatch.execution.exitCode = 75;
  await assert.rejects(runExternalWorker(mismatch), /exit-code mismatch/);
});
