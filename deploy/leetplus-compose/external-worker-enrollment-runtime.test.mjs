import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { canonical, CONTRACT, digest, EXTERNAL_WORKER_CAPABILITY, SCHEMA } from './contract.mjs';
import { EXTERNAL_WORKER_IDENTITY } from './external-worker-contract.mjs';
import { ENROLLMENT_CONTRACT } from './external-worker-enrollment.mjs';
import { applyExternalEnrollment } from './external-worker-enrollment-runtime.mjs';
import { boundCanaryEvidence } from './external-worker-canary.fixture.mjs';

const initialTimer = { unit: 'leetplus-compose-external-daily.timer', loadState: 'not-found', enabled: false, active: false, subState: 'dead' };
const offTimer = { ...initialTimer, loadState: 'loaded' }, onTimer = { ...offTimer, enabled: true, active: true, subState: 'waiting' };
function fixture(mode = 'CANARY') {
  const keys = crypto.generateKeyPairSync('ed25519'), publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  let now = Date.parse('2026-09-27T10:00:00Z');
  const release = { contract: CONTRACT, releaseSha: 'a'.repeat(40), builtAt: '2026-09-27T00:00:00Z',
    migrationCount: SCHEMA.migrationCount, migration: SCHEMA.migration, externalWorkerCapability: EXTERNAL_WORKER_CAPABILITY,
    images: Object.fromEntries(['api', 'web', 'postgres', 'redis'].map((role, index) => [role, `sha256:${String(index + 1).repeat(64)}`])) };
  const current = { activeSlot: 'blue', generation: 10, blue: release, green: release, dataRelease: release };
  const i = EXTERNAL_WORKER_IDENTITY;
  const secretBytes = Buffer.from(canonical({ DATABASE_URL: 'postgresql://leetplus_runtime:x@postgres/leetplus?schema=public&connection_limit=1&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict',
    INTEGRATION_ENCRYPTION_KEY: 'i', APP_ENCRYPTION_KEY: 'a', LANGAME_EXTERNAL_WORKER_ENABLED: 'true', LANGAME_EXTERNAL_WORKER_LIVE: 'true',
    LANGAME_EXTERNAL_WORKER_MODE: mode, LANGAME_EXTERNAL_WORKER_TENANT_ID: i.tenantId, LANGAME_EXTERNAL_WORKER_TENANT_SLUG: i.tenantSlug,
    LANGAME_EXTERNAL_WORKER_SOURCE_ID: i.sourceId, LANGAME_EXTERNAL_WORKER_STORE_ID: i.storeId, LANGAME_EXTERNAL_WORKER_DOMAIN: i.domain,
    LANGAME_EXTERNAL_WORKER_CLUB_ID: i.clubId, LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE: i.customerStage,
    LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION: '1', LANGAME_EXTERNAL_WORKER_PROFILE_REVISION: '1', LANGAME_EXTERNAL_WORKER_STORE_REVISION: '0',
    LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false', LANGAME_SCHEDULED_HTTP_ENABLED: 'false', GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false',
    ...(mode === 'CANARY' ? { LANGAME_EXTERNAL_WORKER_DATE: '2026-09-26' } : {}) }));
  const grant = { contract: 'LEETPLUS_LANGAME_EXTERNAL_WORKER_GRANT_V1', id: crypto.randomUUID(), ...i, mode,
    hostIdentitySha256: 'b'.repeat(64), releaseSha: release.releaseSha, generation: 10,
    executionRevision: 1, profileRevision: 1, storeRevision: 0, secretSha256: digest(secretBytes),
    issuedAt: '2026-09-27T09:00:00Z', expiresAt: mode === 'CANARY' ? '2026-09-27T12:00:00Z' : '2026-10-02T00:00:00Z',
    businessDate: mode === 'CANARY' ? '2026-09-26' : null };
  const grantEnvelope = { grant, signature: crypto.sign(null, Buffer.from(canonical(grant)), keys.privateKey).toString('base64') };
  const serviceUnitBytes = Buffer.from('service\n'), timerUnitBytes = Buffer.from('timer\n');
  const plan = { contract: `${ENROLLMENT_CONTRACT}_PLAN`, operationId: crypto.randomUUID(), action: `ENROLL_${mode}`,
    hostIdentitySha256: grant.hostIdentitySha256, activeSha256: digest(current), controllerManifestSha256: 'c'.repeat(64),
    releaseSha: release.releaseSha, generation: 10, worker: i.worker, mode,
    secretSha256: digest(secretBytes), grantEnvelopeSha256: digest(grantEnvelope), serviceUnitSha256: digest(serviceUnitBytes),
    timerUnitSha256: digest(timerUnitBytes), networkPolicySha256: 'f'.repeat(64),
    previousEnrollmentReceiptSha256: null, canaryReceiptSha256: null,
    issuedAt: '2026-09-27T09:30:00Z', expiresAt: '2026-09-27T11:00:00Z' };
  let canaryEvidence = null;
  if (mode === 'TIMER') {
    canaryEvidence = boundCanaryEvidence({ plan, grantEnvelope, current, timerSecretBytes: secretBytes, privateKey: keys.privateKey });
    plan.previousEnrollmentReceiptSha256 = digest(canaryEvidence.enrollmentReceipt);
    plan.canaryReceiptSha256 = digest(canaryEvidence.runReceipt);
  }
  const approval = { contract: `${ENROLLMENT_CONTRACT}_APPROVAL`, operationId: plan.operationId, planSha256: digest(plan),
    hostIdentitySha256: plan.hostIdentitySha256, action: plan.action,
    issuedAt: '2026-09-27T09:45:00Z', expiresAt: '2026-09-27T10:30:00Z' };
  const approvalEnvelope = { approval, signature: crypto.sign(null, Buffer.from(canonical(approval)), keys.privateKey).toString('base64') };
  const preimage = mode === 'CANARY' ? { lockPresent: false, serviceUnitSha256: null, timerUnitSha256: null,
    networkState: 'ABSENT', secretSha256: null, grantEnvelopeSha256: null, timer: initialTimer } :
    { lockPresent: true, serviceUnitSha256: plan.serviceUnitSha256, timerUnitSha256: plan.timerUnitSha256,
      networkState: 'ACTIVE', secretSha256: '1'.repeat(64), grantEnvelopeSha256: '2'.repeat(64), timer: offTimer };
  const context = { current, controllerManifestSha256: plan.controllerManifestSha256, hostIdentitySha256: plan.hostIdentitySha256,
    secretBytes, grantEnvelope, serviceUnitBytes, timerUnitBytes, networkPolicySha256: plan.networkPolicySha256,
    previousEnrollmentReceiptSha256: plan.previousEnrollmentReceiptSha256,
    canaryReceiptSha256: plan.canaryReceiptSha256, canaryEvidence, publicKey, now, preimage };
  let state = structuredClone(preimage), pointer = null, failAfter = null;
  const records = new Map(mode === 'TIMER' ? [['network', { contract: 'LEETPLUS_LANGAME_EXTERNAL_NETWORK_V1', decision: 'PASS' }]] : []), calls = [];
  const step = name => { calls.push(name); if (failAfter === name) { failAfter = null; throw new Error(`lost ${name} response`); } };
  const adapters = {
    now: () => now, assertExclusiveLock: async () => step('lock'), readState: async () => structuredClone(state),
    readOp: async name => records.get(name) ?? null,
    publishOp: async (name, value) => { assert.equal(records.has(name), false); records.set(name, value); step(`publish:${name}`); },
    installLockCAS: async (before, after) => { assert.equal(state.lockPresent, before); state.lockPresent = after; step('installLock'); },
    installUnitsCAS: async (before, after) => { assert.equal(state.serviceUnitSha256, before.service); assert.equal(state.timerUnitSha256, before.timer);
      state.serviceUnitSha256 = after.service; state.timerUnitSha256 = after.timer;
      if (state.timer.loadState === 'not-found') state.timer = structuredClone(offTimer); step('installUnits'); },
    installNetwork: async () => { state.networkState = 'ACTIVE'; records.set('network', { contract: 'LEETPLUS_LANGAME_EXTERNAL_NETWORK_V1', decision: 'PASS' }); step('installNetwork'); },
    writeSecretCAS: async (before, value) => { assert.equal(state.secretSha256, before); state.secretSha256 = digest(value); step('writeSecret'); },
    writeGrantCAS: async (before, value) => { assert.equal(state.grantEnvelopeSha256, before); state.grantEnvelopeSha256 = digest(value); step('writeGrant'); },
    setTimer: async (before, after) => { assert.deepEqual(state.timer, before); state.timer = structuredClone(after); step('setTimer'); },
    publishPointer: async (id, sha) => { if (pointer) assert.deepEqual(pointer, { id, sha }); pointer = { id, sha }; step('pointer'); },
  };
  return { plan, approvalEnvelope, context, adapters, records, calls, get state() { return state; },
    set state(value) { state = value; }, set failAfter(value) { failAfter = value; },
    set now(value) { now = value; context.now = value; }, get pointer() { return pointer; } };
}

test('first signed CANARY enrollment writes intent before effects, keeps timer OFF, and binds receipt', async () => {
  const f = fixture(); const receipt = await applyExternalEnrollment(f);
  assert.equal(receipt.decision, 'PASS'); assert.deepEqual(f.state.timer, offTimer);
  assert.equal(f.pointer.sha, digest(receipt));
  assert.ok(f.calls.indexOf('publish:intent') < f.calls.indexOf('installLock'));
  assert.ok(f.calls.indexOf('installNetwork') < f.calls.indexOf('writeSecret'));
  assert.ok(f.calls.indexOf('writeGrant') < f.calls.indexOf('pointer'));
});
test('TIMER enrollment requires previous receipt and canary evidence, then enables only after grant/network', async () => {
  const f = fixture('TIMER'); const receipt = await applyExternalEnrollment(f);
  assert.equal(receipt.timerState.enabled, true); assert.deepEqual(f.state.timer, onTimer);
  assert.ok(f.calls.indexOf('writeGrant') < f.calls.indexOf('setTimer'));
});
test('lost response after secret write reconciles exact partial postimage without duplicate write', async () => {
  const f = fixture(); f.failAfter = 'writeSecret';
  await assert.rejects(applyExternalEnrollment(f), /lost writeSecret response/);
  assert.equal(f.records.has('intent'), true); assert.equal(f.state.secretSha256, f.plan.secretSha256);
  const receipt = await applyExternalEnrollment(f);
  assert.equal(receipt.decision, 'PASS'); assert.equal(f.calls.filter(name => name === 'writeSecret').length, 1);
});
test('foreign partial state and expired approval reject before new effect', async () => {
  const foreign = fixture(); foreign.failAfter = 'writeSecret';
  await assert.rejects(applyExternalEnrollment(foreign));
  foreign.state.secretSha256 = '9'.repeat(64);
  const count = foreign.calls.filter(name => name !== 'lock').length;
  await assert.rejects(applyExternalEnrollment(foreign), /exact CAS/);
  assert.equal(foreign.calls.filter(name => name !== 'lock').length, count);
  const stale = fixture(); stale.context.now = Date.parse('2026-09-27T11:01:00Z');
  await assert.rejects(applyExternalEnrollment(stale), /expired|stale|window/);
  assert.equal(stale.records.size, 0);
});
test('expired receipted terminal reconciles pointer without another grant or timer effect', async () => {
  const f = fixture('TIMER'); f.failAfter = 'publish:receipt';
  await assert.rejects(applyExternalEnrollment(f), /lost publish:receipt/);
  assert.equal(f.records.has('receipt'), true); assert.equal(f.pointer, null);
  const effectCount = f.calls.filter(name => !['lock', 'pointer'].includes(name)).length;
  f.now = Date.parse('2026-09-27T11:30:00Z');
  const receipt = await applyExternalEnrollment(f);
  assert.equal(receipt.decision, 'PASS'); assert.equal(f.pointer.sha, digest(receipt));
  assert.equal(f.calls.filter(name => !['lock', 'pointer'].includes(name)).length, effectCount);
});
test('expired unreceipted timer postimage is classified read-only without invented acceptance', async () => {
  const f = fixture('TIMER'); f.failAfter = 'setTimer';
  await assert.rejects(applyExternalEnrollment(f), /lost setTimer/);
  const effects = f.calls.filter(name => name !== 'lock').length;
  f.now = Date.parse('2026-09-27T11:30:00Z');
  const recovery = await applyExternalEnrollment(f);
  assert.equal(recovery.decision, 'RECOVERY_REQUIRED_EXPIRED_UNRECEIPTED');
  assert.equal(f.records.has('receipt'), false); assert.equal(f.pointer, null);
  assert.equal(f.calls.filter(name => name !== 'lock').length, effects);
});
