import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { CONTRACT, SCHEMA, digest, canonical, renderCompose } from './contract.mjs';
import { execute, PHASES, validateApproval, validateChain } from './orchestrator.mjs';

const key = crypto.generateKeyPairSync('ed25519');
const pub = key.publicKey.export({ type: 'spki', format: 'pem' });
const r = { contract: CONTRACT, ...SCHEMA, releaseSha: 'a'.repeat(40), builtAt: '2026-09-10T12:00:00Z', images: Object.fromEntries(['api', 'web', 'postgres', 'redis'].map((x, i) => [x, `sha256:${String(i + 1).repeat(64)}`])) };
const plan = { contract: `${CONTRACT}_PLAN`, operationId: crypto.randomUUID(), action: 'BOOTSTRAP', hostIdentitySha256: 'c'.repeat(64), controlSha256: 'd'.repeat(64), admissionSha256: 'e'.repeat(64), archiveSha256: 'f'.repeat(64), backupReceiptSha256: '1'.repeat(64), rehearsalReceiptSha256: '2'.repeat(64), migrationReceiptSha256: '3'.repeat(64), targetSlot: 'blue', generation: 0, previous: null, blue: r, green: r };
plan.composeSha256 = digest(renderCompose({ blue: r, green: r }));
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
test('tampered receipt or skipped phase stops before any effect', async () => {
  const store = memoryStore(); store.data.records.SMOKE = { intent: { planSha256: digest(plan), phase: 'SMOKE', previousReceiptSha256: null } };
  await assert.rejects(execute(plan, envelope(), pub, store, { preflight: () => assert.fail('must not execute') }), /gap/);
});
