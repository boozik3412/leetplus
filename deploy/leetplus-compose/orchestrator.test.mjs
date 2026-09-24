import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { CONTRACT, SCHEMA, digest, canonical, renderCompose } from './contract.mjs';
import { execute, PHASES, validateApproval, validateChain, validatePlan } from './orchestrator.mjs';
import { deriveWorkerContinuation } from './worker-continuation.mjs';

const key = crypto.generateKeyPairSync('ed25519');
const pub = key.publicKey.export({ type: 'spki', format: 'pem' });
const r = { contract: CONTRACT, ...SCHEMA, releaseSha: 'a'.repeat(40), builtAt: '2026-09-10T12:00:00Z', images: Object.fromEntries(['api', 'web', 'postgres', 'redis'].map((x, i) => [x, `sha256:${String(i + 1).repeat(64)}`])) };
const plan = { contract: `${CONTRACT}_PLAN`, operationId: crypto.randomUUID(), action: 'BOOTSTRAP', hostIdentitySha256: 'c'.repeat(64), controlSha256: 'd'.repeat(64), admissionSha256: 'e'.repeat(64), archiveSha256: 'f'.repeat(64), backupReceiptSha256: '1'.repeat(64), rehearsalReceiptSha256: '2'.repeat(64), migrationReceiptSha256: '3'.repeat(64), targetSlot: 'blue', generation: 0, previous: null, blue: r, green: r };
plan.composeSha256 = digest(renderCompose({ blue: r, green: r }));
plan.secretDigests = Object.fromEntries(['acceptance.json', 'api-blue.json', 'api-green.json', 'db-ca.pem'].map(name => [name, '4'.repeat(64)]));
plan.networkPolicySha256 = '5'.repeat(64);
plan.databaseIdentitySha256 = '6'.repeat(64);
plan.dataRelease = r;
plan.dataAdmissionSha256 = plan.admissionSha256;
function envelope(p = plan) {
  const approval = { contract: `${CONTRACT}_APPROVAL`, operationId: p.operationId, action: p.action, hostIdentitySha256: p.hostIdentitySha256, planSha256: digest(p), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() };
  return { approval, signature: crypto.sign(null, Buffer.from(canonical(approval)), key.privateKey).toString('base64') };
}
function memoryStore() {
  const data = { records: {}, final: null };
  return { data, read: async () => structuredClone(data), publish: async (phase, type, value) => {
    data.records[phase] ??= {};
    if (data.records[phase][type]) assert.equal(canonical(data.records[phase][type]), canonical(value));
    else data.records[phase][type] = structuredClone(value);
  }, finalize: async value => { data.final = value; } };
}
test('signed approval cannot be replayed against another host, release or action', () => {
  const e = envelope(); validateApproval(plan, e, pub);
  for (const field of ['hostIdentitySha256', 'archiveSha256', 'controlSha256']) {
    assert.throws(() => validateApproval({ ...plan, [field]: '9'.repeat(64) }, e, pub));
  }
  const bad = structuredClone(e); bad.approval.expiresAt = '2099-01-01T00:00:00Z';
  assert.throws(() => validateApproval(plan, bad, pub));
  assert.throws(() => validateApproval(plan, e, crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' })));
});
for (const interrupted of PHASES) test(`lost response at ${interrupted} reconciles once and preserves receipts`, async () => {
  const store = memoryStore(), effects = [], reconciled = [];
  let fail = true;
  const driver = { preflight: async () => {}, run: async phase => {
    effects.push(phase);
    if (phase === interrupted && fail) { fail = false; throw new Error('lost response'); }
    return { phase, planSha256: digest(plan), observed: phase };
  }, reconcile: async phase => { reconciled.push(phase); return { phase, planSha256: digest(plan), observed: phase }; } };
  await assert.rejects(execute(plan, envelope(), pub, store, driver), /lost response/);
  await execute(plan, envelope(), pub, store, driver);
  assert.deepEqual(effects, PHASES);
  assert.deepEqual(reconciled, [interrupted]);
  assert.equal(store.data.final.lastReceiptSha256, validateChain(plan, store.data.records));
  await execute(plan, envelope(), pub, store, driver);
  assert.deepEqual(effects, PHASES);
});
test('expired approval permits read-only reconciliation but no new native phase', async t => {
  const store = memoryStore(), e = envelope(), effects = [], reconciled = [];
  let time = Date.now(); t.mock.method(Date, 'now', () => time);
  const driver = { preflight: async () => {},
    run: async phase => { effects.push(phase); throw new Error('lost effect response'); },
    reconcile: async phase => { reconciled.push(phase); return { phase, planSha256: digest(plan) }; } };
  await assert.rejects(execute(plan, e, pub, store, driver), /lost effect response/);
  time = Date.parse(e.approval.expiresAt) + 1;
  await assert.rejects(execute(plan, e, pub, store, driver), /validity window/);
  assert.deepEqual(effects, ['HYDRATE']);
  assert.deepEqual(reconciled, ['HYDRATE']);
  assert.ok(store.data.records.HYDRATE.receipt);
  assert.equal(store.data.records.BIND, undefined);
});
for (const interrupted of PHASES) test(`lost receipt after ${interrupted} evidence never repeats the phase effect`, async () => {
  const store = memoryStore(), effects = [], reconciled = [];
  const publish = store.publish;
  let loseReceipt = true;
  store.publish = async (phase, type, value) => {
    if (phase === interrupted && type === 'receipt' && loseReceipt) {
      loseReceipt = false;
      throw new Error('lost before receipt publication');
    }
    await publish(phase, type, value);
  };
  const driver = {
    preflight: async () => {},
    run: async phase => {
      effects.push(phase);
      return { phase, planSha256: digest(plan), observed: phase };
    },
    reconcile: async phase => {
      reconciled.push(phase);
      return structuredClone(store.data.records[phase].evidence);
    },
  };
  await assert.rejects(execute(plan, envelope(), pub, store, driver), /lost before receipt publication/);
  await execute(plan, envelope(), pub, store, driver);
  assert.deepEqual(effects, PHASES);
  assert.deepEqual(reconciled, [interrupted]);
  assert.equal(store.data.final.lastReceiptSha256, validateChain(plan, store.data.records));
});
test('tampered receipt or skipped phase stops before any effect', async () => {
  const store = memoryStore(); store.data.records.SMOKE = { intent: { planSha256: digest(plan), phase: 'SMOKE', previousReceiptSha256: null } };
  await assert.rejects(execute(plan, envelope(), pub, store, { preflight: () => assert.fail('must not execute') }), /gap/);
});

function preparedPlan() {
  const p = { ...structuredClone(plan), action: 'ROLLOUT', generation: 1, targetSlot: 'green', previous: { activeSlot: 'blue', generation: 1, blue: r, green: r, dataRelease: r, dataAdmissionSha256: plan.dataAdmissionSha256 } };
  p.composeSha256 = digest(renderCompose({ ...p, activeSlot: 'green' }));
  p.preparationGuard = { contract: 'LEETPLUS_PREPARATION_GUARD_V1', hostIdentitySha256: p.hostIdentitySha256, controllerManifestSha256: p.controlSha256, generation: 1, activeSlot: 'blue', activeSha256: digest(p.previous) };
  p.preparationEvidenceExpiresAt = new Date(Date.now() + 60000).toISOString();
  return p;
}
function preparedWorkerPolicy(p) {
  const workers = ['bonus-ledger-worker', 'langame-daily-worker'];
  const originals = workers.map((worker, index) => ({
    grant: { contract: `${CONTRACT}_WORKER_GRANT`, worker, mode: 'TIMER',
      id: `${index + 1}2345678-1234-4123-8123-123456789abc`, hostIdentitySha256: p.hostIdentitySha256,
      releaseSha: p.previous[p.previous.activeSlot].releaseSha, generation: p.generation,
      tenantSlug: 'tenant', secretSha256: '7'.repeat(64), issuedAt: '2026-09-24T00:00:00Z',
      expiresAt: new Date(Date.now() + 86400000).toISOString() }, signature: `${'A'.repeat(86)}==` }));
  return deriveWorkerContinuation({
    originalTimers: workers.map((worker, index) => ({ worker, unit: index === 0 ? 'leetplus-compose-bonus.timer' : 'leetplus-compose-daily.timer', enabled: true, active: true })),
    originalGrantEnvelopes: originals,
    profileBindings: workers.map(worker => ({ worker, profileSha256: '7'.repeat(64) })),
    targetReleaseSha: p[p.targetSlot].releaseSha, currentGeneration: p.generation,
    previousReleaseSha: p.previous[p.previous.activeSlot].releaseSha,
    forwardGrantIds: ['42345678-1234-4123-8123-123456789abc', '52345678-1234-4123-8123-123456789abc'],
    rollbackGrantIds: ['62345678-1234-4123-8123-123456789abc', '72345678-1234-4123-8123-123456789abc'],
  });
}
test('new approvals cannot extend the original prepared evidence validity', () => {
  const p = preparedPlan(); validatePlan(p);
  assert.throws(() => validateApproval(p, envelope(p), pub), /cannot extend/);
  const e = envelope(p); e.approval.expiresAt = p.preparationEvidenceExpiresAt;
  e.signature = crypto.sign(null, Buffer.from(canonical(e.approval)), key.privateKey).toString('base64');
  validateApproval(p, e, pub);
  assert.throws(() => validateApproval(p, e, pub, { now: Date.parse(p.preparationEvidenceExpiresAt) + 1 }));
  validateApproval(p, e, pub, { now: Date.parse(p.preparationEvidenceExpiresAt) + 1, allowExpired: true });
  const missing = { ...p }; delete missing.preparationEvidenceExpiresAt;
  assert.throws(() => validatePlan(missing), /immutable UTC expiry/);
});
test('an unfinished application rollout cannot execute with inert V1 worker policy', async () => {
  const p = preparedPlan(), e = envelope(p), store = memoryStore();
  p.workerContinuation = { contract: 'LEETPLUS_WORKER_CONTINUATION_V1' };
  e.approval.planSha256 = digest(p);
  e.approval.expiresAt = p.preparationEvidenceExpiresAt;
  e.signature = crypto.sign(null, Buffer.from(canonical(e.approval)), key.privateKey).toString('base64');
  await assert.rejects(execute(p, e, pub, store, {
    preflight: () => assert.fail('V1 plan must stop before native preflight or effect'),
  }), /requires executable V2 worker continuation/);
});
test('approval is rechecked after a long preflight before any next native effect', async t => {
  const p = preparedPlan(), store = memoryStore();
  p.workerContinuation = preparedWorkerPolicy(p);
  const e = envelope(p);
  e.approval.expiresAt = p.preparationEvidenceExpiresAt;
  e.signature = crypto.sign(null, Buffer.from(canonical(e.approval)), key.privateKey).toString('base64');
  let time = Date.now(); t.mock.method(Date, 'now', () => time);
  await assert.rejects(execute(p, e, pub, store, {
    preflight: async (_plan, phase) => { if (phase) time = Date.parse(p.preparationEvidenceExpiresAt) + 1; },
    run: async () => assert.fail('expired evidence cannot authorize an effect'),
    reconcile: async () => assert.fail('expired evidence cannot authorize a reconcile effect'),
  }), /validity window/);
  assert.deepEqual(store.data.records, {}, 'a failed preflight must not create an ambiguous effect intent');
});

test('application successors retain separately admitted data images in either slot', () => {
  const successor={...r,releaseSha:'b'.repeat(40),images:{...r.images,api:`sha256:${'7'.repeat(64)}`,postgres:`sha256:${'8'.repeat(64)}`,redis:`sha256:${'9'.repeat(64)}`}};
  const previous={activeSlot:'blue',generation:1,blue:r,green:r,dataRelease:r,dataAdmissionSha256:plan.dataAdmissionSha256};
  const next={...structuredClone(plan),action:'ROLLOUT',previous,generation:1,targetSlot:'green',green:successor};
  next.composeSha256=digest(renderCompose({...next,activeSlot:'green'}));
  validatePlan(next);
  const rendered=renderCompose({...next,activeSlot:'green'});
  assert.equal(rendered.services.postgres.image,r.images.postgres);
  assert.equal(rendered.services.redis.image,r.images.redis);
  assert.equal(rendered.services['api-green'].image,successor.images.api);
  const third={...successor,releaseSha:'c'.repeat(40),images:{...successor.images,api:`sha256:${'b'.repeat(64)}`}};
  const second={...next,targetSlot:'blue',blue:third,green:successor,generation:2,previous:{...previous,activeSlot:'green',generation:2,green:successor}};
  second.composeSha256=digest(renderCompose({...second,activeSlot:'blue'}));
  validatePlan(second);
  assert.equal(renderCompose({...second,activeSlot:'blue'}).services.postgres.image,r.images.postgres);
  const bad={...next,dataRelease:successor};
  bad.composeSha256=digest(renderCompose({...bad,activeSlot:'green'}));
  assert.throws(()=>validatePlan(bad),/cannot replace data/);
});
