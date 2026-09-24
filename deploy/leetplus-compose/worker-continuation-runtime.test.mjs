import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { canonical, digest } from './contract.mjs';
import { deriveWorkerContinuation } from './worker-continuation.mjs';
import {
  abortUncommittedWorkerContinuation,
  beginWorkerContinuation,
  bindForwardWorkerContinuation,
  completeWorkerContinuation,
  rollbackWorkerContinuation,
  validateWorkerContinuationReceipt,
} from './worker-continuation-runtime.mjs';

const workers = ['bonus-ledger-worker', 'langame-daily-worker'];
const timers = ['leetplus-compose-bonus.timer', 'leetplus-compose-daily.timer'];
const key = crypto.generateKeyPairSync('ed25519');
const publicKey = key.publicKey.export({ type: 'spki', format: 'pem' });
const host = 'a'.repeat(64), previousSha = 'b'.repeat(40), targetSha = 'c'.repeat(40);
const now = Date.parse('2026-09-24T00:10:00Z');
const sign = grant => ({ grant, signature: crypto.sign(null, Buffer.from(canonical(grant)), key.privateKey).toString('base64') });

function fixture() {
  const profiles = Object.fromEntries(workers.map(worker => {
    const prefix = worker === workers[0] ? 'GUEST_BONUS_LEDGER_WORKER' : 'LANGAME_DAILY_WORKER';
    const value = { DATABASE_URL: 'postgresql://leetplus_runtime:fixture@postgres/leetplus?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict', [`${prefix}_TENANT_SLUG`]: 'tenant', [`${prefix}_CANARY`]: 'false' };
    return [worker, Buffer.from(canonical(value))];
  }));
  const originals = workers.map(worker => sign({ contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_WORKER_GRANT', worker, mode: 'TIMER', id: crypto.randomUUID(), hostIdentitySha256: host, releaseSha: previousSha, generation: 8, tenantSlug: 'tenant', secretSha256: digest(profiles[worker]), issuedAt: '2026-09-24T00:00:00Z', expiresAt: '2026-10-01T00:00:00Z' }));
  const policy = deriveWorkerContinuation({
    originalTimers: workers.map((worker, index) => ({ worker, unit: timers[index], enabled: true, active: true })),
    originalGrantEnvelopes: originals,
    profileBindings: workers.map(worker => ({ worker, profileSha256: digest(profiles[worker]) })),
    targetReleaseSha: targetSha,
    currentGeneration: 8,
    previousReleaseSha: previousSha,
    forwardGrantIds: ['42345678-1234-4123-8123-123456789abc', '52345678-1234-4123-8123-123456789abc'],
    rollbackGrantIds: ['62345678-1234-4123-8123-123456789abc', '72345678-1234-4123-8123-123456789abc'],
  });
  const plan = { contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_PLAN', operationId: '82345678-1234-4123-8123-123456789abc', action: 'ROLLOUT', generation: 8, targetSlot: 'green', blue: { releaseSha: previousSha }, green: { releaseSha: targetSha }, previous: { activeSlot: 'blue', generation: 8, blue: { releaseSha: previousSha }, green: { releaseSha: previousSha } }, workerContinuation: policy };
  const forwardEnvelopes = policy.forward.grants.map(sign), rollbackEnvelopes = policy.rollback.grants.map(sign);
  const state = {
    grants: Object.fromEntries(workers.map((worker, index) => [worker, structuredClone(originals[index])])),
    timers: Object.fromEntries(timers.map(unit => [unit, { unit, loadState: 'loaded', enabled: true, active: true, subState: 'waiting' }])),
    lifecycle: {}, effects: [], lock: true, failures: {},
  };
  const adapters = {
    assertExclusiveLock: async () => assert.equal(state.lock, true),
    readGrant: async worker => structuredClone(state.grants[worker]),
    writeGrantAtomic: async (worker, envelope) => {
      state.effects.push(`grant:${worker}`); state.grants[worker] = structuredClone(envelope);
      if (state.failures[`grant:${worker}`]) { delete state.failures[`grant:${worker}`]; throw new Error('lost grant response'); }
    },
    readTimer: async unit => structuredClone(state.timers[unit]),
    systemctl: async (action, unit) => {
      state.effects.push(`${action}:${unit}`);
      const timer = state.timers[unit];
      if (action === 'stop') { timer.active = false; timer.subState = 'dead'; }
      if (action === 'start') { timer.active = true; timer.subState = 'waiting'; }
      if (action === 'enable') timer.enabled = true;
      if (action === 'disable') timer.enabled = false;
      if (state.failures[`${action}:${unit}`]) { delete state.failures[`${action}:${unit}`]; throw new Error('lost timer response'); }
    },
    readLifecycle: async () => structuredClone(state.lifecycle),
    publish: async (type, value) => {
      if (state.lifecycle[type]) assert.equal(canonical(state.lifecycle[type]), canonical(value));
      else state.lifecycle[type] = structuredClone(value);
    },
  };
  const contexts = {
    original: { publicKey, hostIdentitySha256: host, profiles, now, current: plan.previous },
    forward: { publicKey, hostIdentitySha256: host, profiles, now, current: { activeSlot: 'green', generation: 9, green: { releaseSha: targetSha } } },
    rollback: { publicKey, hostIdentitySha256: host, profiles, now, current: { activeSlot: 'blue', generation: 10, blue: { releaseSha: previousSha } } },
  };
  return { plan, policy, forwardEnvelopes, rollbackEnvelopes, state, adapters, contexts };
}

const args = (f, context) => ({ plan: f.plan, forwardEnvelopes: f.forwardEnvelopes, rollbackEnvelopes: f.rollbackEnvelopes, context, adapters: f.adapters });

test('forward lifecycle stops two timers, binds N+1 grants, restores timers and deduplicates completion', async () => {
  const f = fixture();
  await beginWorkerContinuation(args(f, f.contexts.original));
  assert.deepEqual(timers.map(unit => f.state.timers[unit].active), [false, false]);
  await bindForwardWorkerContinuation(args(f, f.contexts.forward));
  assert.deepEqual(workers.map(worker => f.state.grants[worker].grant.generation), [9, 9]);
  const receipt = await completeWorkerContinuation(args(f, f.contexts.forward));
  assert.equal(receipt.mode, 'FORWARD');
  assert.deepEqual(timers.map(unit => f.state.timers[unit].active), [true, true]);
  const effectCount = f.state.effects.length;
  assert.deepEqual(await completeWorkerContinuation(args(f, f.contexts.forward)), receipt);
  assert.deepEqual(await beginWorkerContinuation(args(f, f.contexts.forward)), receipt);
  assert.equal(f.state.effects.length, effectCount);
  validateWorkerContinuationReceipt({ plan: f.plan, receipt, postimage: { current: f.contexts.forward.current,
    grantEnvelopes: workers.map(worker => f.state.grants[worker]), timers: timers.map((unit, index) => ({ worker: workers[index], ...f.state.timers[unit] })) },
  context: { ...f.contexts.forward, intent: f.state.lifecycle.intent, forwardEnvelopes: f.forwardEnvelopes, rollbackEnvelopes: f.rollbackEnvelopes } });
  assert.throws(() => validateWorkerContinuationReceipt({ plan: f.plan, receipt, postimage: { current: f.contexts.forward.current,
    grantEnvelopes: workers.map(worker => f.state.grants[worker]), timers: timers.map((unit, index) => ({ worker: workers[index], ...f.state.timers[unit] })) },
  context: { ...f.contexts.forward, intent: { ...f.state.lifecycle.intent, extra: true }, forwardEnvelopes: f.forwardEnvelopes, rollbackEnvelopes: f.rollbackEnvelopes } }), /Invalid FORWARD worker continuation intent/);
});

test('accepted rollback installs only N+2 grants and restores original timers', async () => {
  const f = fixture();
  await beginWorkerContinuation(args(f, f.contexts.original));
  await bindForwardWorkerContinuation(args(f, f.contexts.forward));
  const receipt = await rollbackWorkerContinuation(args(f, f.contexts.rollback));
  assert.equal(receipt.mode, 'ROLLBACK');
  assert.deepEqual(workers.map(worker => f.state.grants[worker].grant.generation), [10, 10]);
  assert.deepEqual(timers.map(unit => f.state.timers[unit].active), [true, true]);
  const effectCount = f.state.effects.length;
  assert.deepEqual(await rollbackWorkerContinuation(args(f, f.contexts.rollback)), receipt);
  assert.deepEqual(await beginWorkerContinuation(args(f, f.contexts.rollback)), receipt);
  assert.equal(f.state.effects.length, effectCount);
});

test('rollback reconciles mixed original/forward/rollback grant postimages without replay', async () => {
  const f = fixture();
  await beginWorkerContinuation(args(f, f.contexts.original));
  f.state.grants[workers[0]] = structuredClone(f.rollbackEnvelopes[0]);
  f.state.grants[workers[1]] = structuredClone(f.policy.originalGrantEnvelopes[1]);
  const receipt = await rollbackWorkerContinuation(args(f, f.contexts.rollback));
  assert.equal(receipt.mode, 'ROLLBACK');
  assert.deepEqual(workers.map(worker => f.state.grants[worker].grant.generation), [10, 10]);
  assert.equal(f.state.effects.filter(value => value === `grant:${workers[0]}`).length, 0);
  assert.equal(f.state.effects.filter(value => value === `grant:${workers[1]}`).length, 1);
});

test('crash after a partial timer/grant effect resumes without replaying accepted effects', async () => {
  const f = fixture();
  f.state.failures[`stop:${timers[0]}`] = true;
  await assert.rejects(beginWorkerContinuation(args(f, f.contexts.original)), /lost timer response/);
  await beginWorkerContinuation(args(f, f.contexts.original));
  assert.equal(f.state.effects.filter(value => value === `stop:${timers[0]}`).length, 1);
  f.state.failures[`grant:${workers[0]}`] = true;
  await assert.rejects(bindForwardWorkerContinuation(args(f, f.contexts.forward)), /lost grant response/);
  await bindForwardWorkerContinuation(args(f, f.contexts.forward));
  assert.equal(f.state.effects.filter(value => value === `grant:${workers[0]}`).length, 1);
  f.state.grants[workers[1]] = { grant: { drift: true }, signature: 'bad' };
  await assert.rejects(bindForwardWorkerContinuation(args(f, f.contexts.forward)), /Ambiguous forward grant state/);
});

test('wrong signature, tenant, profile, expiry and timer state fail before intent/effect', async () => {
  for (const mutate of [
    f => { f.forwardEnvelopes[0].signature = 'A'.repeat(88); },
    f => { f.forwardEnvelopes[0] = sign({ ...f.forwardEnvelopes[0].grant, tenantSlug: 'other' }); },
    f => { f.contexts.original.profiles[workers[0]] = Buffer.from('{}'); },
    f => { f.contexts.original.now = Date.parse('2026-10-02T00:00:00Z'); },
    f => { f.state.timers[timers[0]].unit = 'wrong.timer'; },
  ]) {
    const f = fixture(); mutate(f);
    await assert.rejects(beginWorkerContinuation(args(f, f.contexts.original)));
    assert.deepEqual(f.state.lifecycle, {});
    assert.deepEqual(f.state.effects, []);
  }
});

test('uncommitted abort restores N timers and never installs rollback grants', async () => {
  const f = fixture();
  await beginWorkerContinuation(args(f, f.contexts.original));
  const receipt = await abortUncommittedWorkerContinuation(args(f, f.contexts.original));
  assert.equal(receipt.mode, 'ABORT_UNCOMMITTED');
  assert.deepEqual(workers.map(worker => f.state.grants[worker].grant.generation), [8, 8]);
  assert.deepEqual(timers.map(unit => f.state.timers[unit].active), [true, true]);
  assert.equal(f.state.effects.some(value => value.startsWith('grant:')), false);
});
