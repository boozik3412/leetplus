import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { canonical, digest, EXTERNAL_WORKER_CAPABILITY } from './contract.mjs';
import { EXTERNAL_WORKER_IDENTITY } from './external-worker-contract.mjs';
import { deriveWorkerContinuation } from './worker-continuation.mjs';
import { deriveWorkerSetV3 } from './worker-set-v3.mjs';
import { beginExternalWorkerContinuation, bindForwardExternalWorkerContinuation,
  completeExternalWorkerContinuation, abortExternalWorkerContinuation,
  rollbackExternalWorkerContinuation, validateExternalWorkerContinuationReceipt } from './external-worker-continuation-runtime.mjs';

const keys = crypto.generateKeyPairSync('ed25519'), publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
const host = 'a'.repeat(64), oldSha = 'b'.repeat(40), nextSha = 'c'.repeat(40);
const workers = ['bonus-ledger-worker', 'langame-daily-worker'];
const sign = grant => ({ grant, signature: crypto.sign(null, Buffer.from(canonical(grant)), keys.privateKey).toString('base64') });

function externalProfile() {
  const i = EXTERNAL_WORKER_IDENTITY;
  return Buffer.from(canonical({ DATABASE_URL: 'postgresql://leetplus_runtime:x@postgres/leetplus?schema=public&connection_limit=1&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict',
    INTEGRATION_ENCRYPTION_KEY: 'i', APP_ENCRYPTION_KEY: 'a', LANGAME_EXTERNAL_WORKER_ENABLED: 'true', LANGAME_EXTERNAL_WORKER_LIVE: 'true',
    LANGAME_EXTERNAL_WORKER_MODE: 'TIMER', LANGAME_EXTERNAL_WORKER_TENANT_ID: i.tenantId, LANGAME_EXTERNAL_WORKER_TENANT_SLUG: i.tenantSlug,
    LANGAME_EXTERNAL_WORKER_SOURCE_ID: i.sourceId, LANGAME_EXTERNAL_WORKER_STORE_ID: i.storeId, LANGAME_EXTERNAL_WORKER_DOMAIN: i.domain,
    LANGAME_EXTERNAL_WORKER_CLUB_ID: i.clubId, LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE: i.customerStage,
    LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION: '1', LANGAME_EXTERNAL_WORKER_PROFILE_REVISION: '1', LANGAME_EXTERNAL_WORKER_STORE_REVISION: '0',
    LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false', LANGAME_SCHEDULED_HTTP_ENABLED: 'false', GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false' }));
}
function fixture({ present = true, rollbackCapable = false } = {}) {
  const profiles = Object.fromEntries(workers.map((worker, index) => {
    const prefix = index ? 'LANGAME_DAILY_WORKER' : 'GUEST_BONUS_LEDGER_WORKER';
    return [worker, Buffer.from(canonical({ DATABASE_URL: 'postgresql://leetplus_runtime:x@postgres/leetplus?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict', [`${prefix}_TENANT_SLUG`]: 'tenant', [`${prefix}_CANARY`]: 'false' }))];
  }));
  const legacy = deriveWorkerContinuation({
    originalTimers: workers.map((worker, index) => ({ worker, unit: index ? 'leetplus-compose-daily.timer' : 'leetplus-compose-bonus.timer', enabled: true, active: true })),
    originalGrantEnvelopes: workers.map(worker => sign({ contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_WORKER_GRANT', worker, mode: 'TIMER',
      id: crypto.randomUUID(), hostIdentitySha256: host, releaseSha: oldSha, generation: 8, tenantSlug: 'tenant', secretSha256: digest(profiles[worker]),
      issuedAt: '2026-09-26T00:00:00Z', expiresAt: '2026-10-01T00:00:00Z' })),
    profileBindings: workers.map(worker => ({ worker, profileSha256: digest(profiles[worker]) })),
    targetReleaseSha: nextSha, currentGeneration: 8, previousReleaseSha: oldSha,
    forwardGrantIds: ['12345678-1234-4123-8123-123456789abc', '22345678-1234-4123-8123-123456789abc'],
    rollbackGrantIds: ['32345678-1234-4123-8123-123456789abc', '42345678-1234-4123-8123-123456789abc'],
  });
  const bytes = externalProfile();
  const original = present ? sign({ contract: 'LEETPLUS_LANGAME_EXTERNAL_WORKER_GRANT_V1', id: '52345678-1234-4123-8123-123456789abc',
    ...EXTERNAL_WORKER_IDENTITY, mode: 'TIMER', hostIdentitySha256: host, releaseSha: oldSha, generation: 8,
    executionRevision: 1, profileRevision: 1, storeRevision: 0, secretSha256: digest(bytes),
    issuedAt: '2026-09-26T00:00:00Z', expiresAt: '2026-10-01T00:00:00Z', businessDate: null }) : null;
  const initialTimer = { unit: 'leetplus-compose-external-daily.timer', loadState: present ? 'loaded' : 'not-found',
    enabled: present, active: present, subState: present ? 'waiting' : 'dead' };
  const external = { worker: EXTERNAL_WORKER_IDENTITY.worker, preimage: present ? 'PRESENT' : 'ABSENT_AUTHORITY',
    originalGrantEnvelope: original, profileSha256: present ? digest(bytes) : null,
    enrollmentReceiptSha256: present ? 'd'.repeat(64) : null, originalTimer: initialTimer,
    forward: { state: 'DORMANT', grant: null }, rollback: { state: 'ABSENT_UNSUPPORTED', grant: null } };
  const forward = { releaseSha: nextSha, externalWorkerCapability: EXTERNAL_WORKER_CAPABILITY };
  const rollback = { releaseSha: oldSha, ...(rollbackCapable ? { externalWorkerCapability: EXTERNAL_WORKER_CAPABILITY } : {}) };
  const policy = deriveWorkerSetV3({ legacy, external, forwardRelease: forward, rollbackRelease: rollback,
    forwardGrantId: present ? '62345678-1234-4123-8123-123456789abc' : null,
    rollbackGrantId: present && rollbackCapable ? '72345678-1234-4123-8123-123456789abc' : null });
  const plan = { operationId: crypto.randomUUID(), workerContinuation: legacy, workerSetV3: policy,
    targetSlot: 'green', green: forward, previous: { activeSlot: 'blue', blue: rollback }, generation: 8 };
  let grant = original, timer = structuredClone(initialTimer);
  const calls = [], records = new Map();
  const adapters = {
    assertExclusiveLock: async () => calls.push('lock'), readExternalGrant: async () => grant,
    readExternalTimer: async () => structuredClone(timer),
    readLifecycle: async name => records.get(name) ?? null,
    publish: async (name, value) => { assert.equal(records.has(name), false); records.set(name, value); calls.push(`publish:${name}`); },
    writeExternalGrantCAS: async (expected, value) => { assert.deepEqual(grant, expected); grant = value; calls.push('write'); },
    removeExternalGrantCAS: async expected => { assert.deepEqual(grant, expected); grant = null; calls.push('remove'); },
    systemctl: async (action, unit) => { assert.equal(unit, initialTimer.unit); calls.push(action); if (action === 'stop') timer.active = false;
      else if (action === 'start') timer.active = true; else if (action === 'enable') timer.enabled = true; else if (action === 'disable') timer.enabled = false;
      timer.subState = timer.active ? 'waiting' : 'dead'; },
  };
  const context = { publicKey, hostIdentitySha256: host, externalProfile: bytes, now: Date.parse('2026-09-26T01:00:00Z'),
    current: { activeSlot: 'blue', generation: 8, blue: { releaseSha: oldSha } },
    forwardEnvelope: policy.external.forward.grant ? sign(policy.external.forward.grant) : null,
    rollbackEnvelope: policy.external.rollback.grant ? sign(policy.external.rollback.grant) : null };
  const args = { plan, context, adapters };
  return { args, calls, records, context, plan, get grant() { return grant; }, set grant(value) { grant = value; }, get timer() { return timer; } };
}

test('absent first rollout records intent before effects and keeps third worker without grant or timer', async () => {
  const f = fixture({ present: false });
  await beginExternalWorkerContinuation(f.args);
  f.context.current = { activeSlot: 'green', generation: 9, green: { releaseSha: nextSha } };
  await bindForwardExternalWorkerContinuation(f.args);
  const receipt = await completeExternalWorkerContinuation(f.args);
  assert.equal(f.grant, null); assert.equal(f.timer.loadState, 'not-found');
  assert.equal(f.calls.includes('write'), false); assert.equal(f.calls.includes('start'), false);
  assert.equal(receipt.state, 'DORMANT');
  const intentIndex = f.calls.findIndex(value => value.startsWith('publish:external-worker-intent'));
  assert.ok(intentIndex >= 0);
});
test('present forward installs signed grant once, stops timer before CAS and restores after POSTCHECK', async () => {
  const f = fixture();
  await beginExternalWorkerContinuation(f.args);
  assert.equal(f.timer.active, false);
  f.context.current = { activeSlot: 'green', generation: 9, green: { releaseSha: nextSha } };
  await bindForwardExternalWorkerContinuation(f.args);
  assert.equal(f.calls.filter(value => value === 'write').length, 1);
  await bindForwardExternalWorkerContinuation(f.args);
  assert.equal(f.calls.filter(value => value === 'write').length, 1);
  const receipt = await completeExternalWorkerContinuation(f.args);
  assert.equal(f.timer.active, true);
  assert.equal(receipt.grantEnvelopeSha256, digest(f.context.forwardEnvelope));
});
test('unsupported rollback removes only frozen grant and leaves timer OFF', async () => {
  const f = fixture(); await beginExternalWorkerContinuation(f.args);
  f.context.current = { activeSlot: 'green', generation: 9, green: { releaseSha: nextSha } };
  await bindForwardExternalWorkerContinuation(f.args);
  f.context.current = { activeSlot: 'blue', generation: 10, blue: { releaseSha: oldSha } };
  const receipt = await rollbackExternalWorkerContinuation(f.args);
  assert.equal(f.grant, null); assert.equal(f.timer.enabled, false); assert.equal(f.timer.active, false);
  assert.equal(receipt.state, 'ABSENT_UNSUPPORTED');
});
test('foreign grant and forged signed envelope block before any continuation effect', async () => {
  const f = fixture(); await beginExternalWorkerContinuation(f.args);
  f.context.current = { activeSlot: 'green', generation: 9, green: { releaseSha: nextSha } };
  f.grant = { grant: { ...f.args.plan.workerSetV3.external.originalGrantEnvelope.grant, id: crypto.randomUUID() }, signature: 'x' };
  const count = f.calls.filter(value => value !== 'lock').length;
  await assert.rejects(bindForwardExternalWorkerContinuation(f.args), /Foreign external continuation state/);
  assert.equal(f.calls.filter(value => value !== 'lock').length, count);
  const forged = fixture(); forged.context.forwardEnvelope.signature = 'A'.repeat(86) + '==';
  await assert.rejects(beginExternalWorkerContinuation(forged.args), /signature/);
  assert.equal(forged.calls.some(value => value.startsWith('publish:')), false);
});
test('abort restores original exact authority and timer, terminal receipt checks live postimage', async () => {
  const f = fixture(); await beginExternalWorkerContinuation(f.args);
  const receipt = await abortExternalWorkerContinuation(f.args);
  assert.deepEqual(f.grant, f.plan.workerSetV3.external.originalGrantEnvelope);
  assert.equal(f.timer.active, true);
  const postimage = { grant: f.grant, timer: f.timer };
  assert.equal(validateExternalWorkerContinuationReceipt({ plan: f.plan, receipt,
    context: { ...f.context, intent: f.records.get('external-worker-intent.json'),
      current: { activeSlot: 'blue', generation: 8, blue: { releaseSha: oldSha } } }, postimage }), receipt);
  await assert.rejects(completeExternalWorkerContinuation(f.args), /active generation|Conflicting external terminal history/);
});
test('interrupted begin and forward reconcile exact stopped timer and grant without duplicate CAS', async () => {
  const f = fixture();
  await beginExternalWorkerContinuation(f.args);
  await beginExternalWorkerContinuation(f.args);
  assert.equal(f.calls.filter(value => value === 'stop').length, 1);
  f.context.current = { activeSlot: 'green', generation: 9, green: { releaseSha: nextSha } };
  await bindForwardExternalWorkerContinuation(f.args);
  await bindForwardExternalWorkerContinuation(f.args);
  assert.equal(f.calls.filter(value => value === 'write').length, 1);
  const receipt = await completeExternalWorkerContinuation(f.args);
  assert.deepEqual(await completeExternalWorkerContinuation(f.args), receipt);
  assert.equal(f.calls.filter(value => value === 'start').length, 1);
});
test('future capable rollback rebinds signed grant to N+2 and restores original timer', async () => {
  const f = fixture({ rollbackCapable: true });
  await beginExternalWorkerContinuation(f.args);
  f.context.current = { activeSlot: 'green', generation: 9, green: { releaseSha: nextSha } };
  await bindForwardExternalWorkerContinuation(f.args);
  await completeExternalWorkerContinuation(f.args);
  f.context.current = { activeSlot: 'blue', generation: 10, blue: { releaseSha: oldSha } };
  const receipt = await rollbackExternalWorkerContinuation(f.args);
  assert.equal(receipt.state, 'ACTIVE'); assert.equal(f.grant.grant.generation, 10);
  assert.equal(f.grant.grant.releaseSha, oldSha); assert.equal(f.timer.active, true);
});
