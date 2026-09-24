import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { canonical, digest } from './contract.mjs';
import { deriveWorkerContinuation, validateCurrentWorkerContinuation, validateForwardWorkerContinuation, validateRollbackWorkerContinuation } from './worker-continuation.mjs';

const workers = ['bonus-ledger-worker', 'langame-daily-worker'];
const key = crypto.generateKeyPairSync('ed25519');
const host = 'a'.repeat(64), previous = 'b'.repeat(40), target = 'c'.repeat(40);
const profiles = Object.fromEntries(workers.map(worker => {
  const prefix = worker === 'bonus-ledger-worker' ? 'GUEST_BONUS_LEDGER_WORKER' : 'LANGAME_DAILY_WORKER';
  const profile = { DATABASE_URL: 'postgresql://leetplus_runtime:fixture@postgres/leetplus?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict', [`${prefix}_TENANT_SLUG`]: 'tenant', [`${prefix}_CANARY`]: 'false' };
  return [worker, Buffer.from(canonical(profile))];
}));
const sign = grant => ({ grant, signature: crypto.sign(null, Buffer.from(canonical(grant)), key.privateKey).toString('base64') });
function fixture() {
  const originalGrantEnvelopes = workers.map(worker => sign({ contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_WORKER_GRANT', worker, mode: 'TIMER', id: crypto.randomUUID(), hostIdentitySha256: host, releaseSha: previous, generation: 8, tenantSlug: 'tenant', secretSha256: digest(profiles[worker]), issuedAt: '2026-09-24T00:00:00Z', expiresAt: '2026-10-01T00:00:00Z' }));
  return deriveWorkerContinuation({ originalTimers: workers.map(worker => ({ worker, unit: worker === workers[0] ? 'leetplus-compose-bonus.timer' : 'leetplus-compose-daily.timer', enabled: true, active: true })), originalGrantEnvelopes, profileBindings: workers.map(worker => ({ worker, profileSha256: digest(profiles[worker]) })), targetReleaseSha: target, currentGeneration: 8, previousReleaseSha: previous, forwardGrantIds: ['42345678-1234-4123-8123-123456789abc', '52345678-1234-4123-8123-123456789abc'], rollbackGrantIds: ['62345678-1234-4123-8123-123456789abc', '72345678-1234-4123-8123-123456789abc'] });
}
test('derives frozen unsigned forward N+1 and rollback N+2 TIMER grants without wider authority', () => {
  const policy = fixture();
  for (const [index, worker] of workers.entries()) {
    const original = policy.originalGrantEnvelopes[index].grant;
    assert.equal(policy.forward.grants[index].releaseSha, target); assert.equal(policy.forward.grants[index].generation, 9);
    assert.equal(policy.rollback.grants[index].releaseSha, previous); assert.equal(policy.rollback.grants[index].generation, 10);
    for (const grant of [policy.forward.grants[index], policy.rollback.grants[index]]) {
      assert.equal(grant.mode, 'TIMER'); assert.equal(grant.hostIdentitySha256, original.hostIdentitySha256); assert.equal(grant.tenantSlug, original.tenantSlug); assert.equal(grant.secretSha256, original.secretSha256); assert.equal(grant.expiresAt, original.expiresAt); assert.notEqual(grant.id, original.id);
    }
    assert.notEqual(policy.forward.grants[index].id, policy.rollback.grants[index].id); assert.equal(worker, original.worker);
  }
});
test('signed current, forward and rollback envelopes must exactly match frozen grants and state', () => {
  const policy = fixture(), publicKey = key.publicKey.export({ type: 'spki', format: 'pem' });
  const common = { publicKey, hostIdentitySha256: host, profiles, now: Date.parse('2026-09-24T00:10:00Z') };
  validateCurrentWorkerContinuation(policy, policy.originalGrantEnvelopes, { ...common, current: { activeSlot: 'blue', generation: 8, blue: { releaseSha: previous } } });
  validateForwardWorkerContinuation(policy, policy.forward.grants.map(sign), { ...common, current: { activeSlot: 'green', generation: 9, green: { releaseSha: target } } });
  validateRollbackWorkerContinuation(policy, policy.rollback.grants.map(sign), { ...common, current: { activeSlot: 'blue', generation: 10, blue: { releaseSha: previous } } });
  const tampered = policy.forward.grants.map(sign); tampered[0].grant = { ...tampered[0].grant, tenantSlug: 'other' };
  assert.throws(() => validateForwardWorkerContinuation(policy, tampered, { ...common, current: { activeSlot: 'green', generation: 9, green: { releaseSha: target } } }), /frozen plan/);
});
test('V1 and missing preallocated IDs fail closed', () => {
  const policy = fixture();
  assert.throws(() => deriveWorkerContinuation({ originalTimers: policy.originalTimers, originalGrantEnvelopes: policy.originalGrantEnvelopes, profileBindings: policy.profileBindings, targetReleaseSha: target, currentGeneration: 8, previousReleaseSha: previous }), /frozen forward and rollback/);
  assert.throws(() => validateCurrentWorkerContinuation({ ...policy, contract: 'LEETPLUS_WORKER_CONTINUATION_V1' }, policy.originalGrantEnvelopes, {}), /V2/);
});
