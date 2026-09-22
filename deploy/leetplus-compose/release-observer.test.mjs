import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { CONTRACT, SCHEMA, digest, canonical, renderCompose } from './contract.mjs';
import { PHASES } from './orchestrator.mjs';
import { inspectNative, observe, readNative } from './release-observer.mjs';

const key = crypto.generateKeyPairSync('ed25519');
function fixture() {
  const r = { contract: CONTRACT, ...SCHEMA, releaseSha: 'a'.repeat(40), builtAt: '2026-09-10T12:00:00Z', images: Object.fromEntries(['api', 'web', 'postgres', 'redis'].map((x, i) => [x, `sha256:${String(i + 1).repeat(64)}`])) };
  const plan = { contract: `${CONTRACT}_PLAN`, operationId: crypto.randomUUID(), action: 'BOOTSTRAP', hostIdentitySha256: 'c'.repeat(64), controlSha256: 'd'.repeat(64), admissionSha256: 'e'.repeat(64), archiveSha256: 'f'.repeat(64), backupReceiptSha256: '1'.repeat(64), rehearsalReceiptSha256: '2'.repeat(64), migrationReceiptSha256: '3'.repeat(64), targetSlot: 'blue', generation: 0, previous: null, blue: r, green: r, dataRelease: r, dataAdmissionSha256: 'e'.repeat(64), networkPolicySha256: '5'.repeat(64), databaseIdentitySha256: '6'.repeat(64), workerContinuation: { contract: 'LEETPLUS_WORKER_CONTINUATION_V1', noNewWorker: true } };
  plan.composeSha256 = digest(renderCompose({ blue: r, green: r }));
  plan.secretDigests = Object.fromEntries(['acceptance.json', 'api-blue.json', 'api-green.json', 'db-ca.pem'].map(name => [name, '4'.repeat(64)]));
  return { plan, records: {}, packet: { contract: 'LEETPLUS_RELEASE_PREPARATION_V1_GO_PACKET', decision: 'PREPARED_NOT_AUTHORIZATION', nativePlanSha256: digest(plan), nativeOperationId: plan.operationId, workerContinuation: plan.workerContinuation }, publicKey: key.publicKey.export({ type: 'spki', format: 'pem' }) };
}
function approve(s, clock) {
  const p = s.plan, approval = { contract: `${CONTRACT}_APPROVAL`, operationId: p.operationId, action: p.action, hostIdentitySha256: p.hostIdentitySha256, planSha256: digest(p), issuedAt: new Date(clock - 1000).toISOString(), expiresAt: new Date(clock + 1000).toISOString() };
  s.approval = { approval, signature: crypto.sign(null, Buffer.from(canonical(approval)), key.privateKey).toString('base64') };
}
function complete(s) {
  let previousReceiptSha256 = null;
  for (const phase of PHASES) {
    const intent = { phase, planSha256: digest(s.plan), previousReceiptSha256 };
    const evidence = { phase, planSha256: digest(s.plan) };
    const receipt = { phase, planSha256: digest(s.plan), intentSha256: digest(intent), evidenceSha256: digest(evidence), previousReceiptSha256 };
    s.records[phase] = { intent, evidence, receipt }; previousReceiptSha256 = digest(receipt);
  }
  s.final = { contract: `${CONTRACT}_COMPLETED`, planSha256: digest(s.plan), operationId: s.plan.operationId, lastReceiptSha256: previousReceiptSha256 };
}
test('PREPARED does not imply GO, completed native chain does not imply VERIFIED', () => {
  const s = fixture(), clock = Date.now();
  assert.equal(inspectNative(s, clock).status, 'PREPARED');
  approve(s, clock); assert.equal(inspectNative(s, clock).status, 'GO');
  complete(s); assert.equal(inspectNative(s, clock).status, 'APPLIED');
  assert.match(inspectNative(s, clock).waitReason, /INDEPENDENT/);
});
test('expired unfinished authorization rejected, signed terminal history remains observable', () => {
  const s = fixture(), clock = Date.now(); approve(s, clock);
  assert.throws(() => inspectNative(s, clock + 2000), /validity/);
  complete(s); assert.equal(inspectNative(s, clock + 2000).status, 'APPLIED');
});
test('wrong packet policy, missing phase and forged final fail closed', () => {
  const s = fixture(), clock = Date.now(); approve(s, clock); complete(s);
  const badPolicy = structuredClone(s); badPolicy.packet.workerContinuation.noNewWorker = false;
  assert.throws(() => inspectNative(badPolicy, clock));
  const gap = structuredClone(s); delete gap.records.BIND; assert.throws(() => inspectNative(gap, clock));
  s.final.lastReceiptSha256 = '0'.repeat(64); assert.throws(() => inspectNative(s, clock));
});
test('bounded wait publishes transition with separate receipt publication and detection times', async () => {
  const s = fixture(); let time = Date.now(); approve(s, time);
  // Use a fresh valid approval long enough for a simulated 5s wait.
  s.approval.approval.expiresAt = new Date(time + 60000).toISOString();
  s.approval.signature = crypto.sign(null, Buffer.from(canonical(s.approval.approval)), key.privateKey).toString('base64');
  const events = [], waits = [];
  const result = await observe(() => s, e => events.push(e), { now: () => time, deadlineMs: 20000, sleep: async ms => { waits.push(ms); time += ms; complete(s); s.nativeCompletionPublishedAt = new Date(time - 125).toISOString(); } });
  assert.deepEqual(waits, [5000]); assert.deepEqual(events.map(e => e.status), ['GO', 'APPLIED']);
  assert.equal(Date.parse(result.detectedAt) - Date.parse(result.nativeCompletionPublishedAt), 125);
});
test('deadline does not spin or invent failure/success', async () => {
  let time = Date.now(); const events = [], s = fixture();
  const result = await observe(() => s, e => events.push(e), { now: () => time, deadlineMs: 11000, sleep: async ms => { time += ms; } });
  assert.equal(result.observation, 'DEADLINE'); assert.equal(result.status, 'PREPARED'); assert.equal(events.length, 2);
});
test('minimal fabricated rollback, conflicting terminal records and local copied history are rejected', () => {
  const s = fixture(), clock = Date.now();
  s.plan.action = 'ROLLOUT'; s.plan.generation = 7;
  s.plan.previous = { activeSlot: 'green', generation: 7, blue: s.plan.blue, green: s.plan.green, dataRelease: s.plan.dataRelease, dataAdmissionSha256: s.plan.dataAdmissionSha256 };
  s.packet.nativePlanSha256 = digest(s.plan); approve(s, clock);
  s.rolledBack = { contract: `${CONTRACT}_ROLLED_BACK`, planSha256: digest(s.plan), active: { activeSlot: 'green', generation: 9 } };
  assert.throws(() => inspectNative(s, clock), /incomplete accepted prefix/);
  complete(s); assert.throws(() => inspectNative(s, clock), /exactly one terminal/);
  delete s.final; delete s.records.POSTCHECK.receipt; delete s.records.POSTCHECK.evidence;
  s.rolledBack.reason = 'POSTCHECK_FAILED';
  s.rolledBack.active = { operationId: s.plan.operationId, generation: 9, activeSlot: 'green', blue: s.plan.blue, green: s.plan.green, dataRelease: s.plan.dataRelease, dataAdmissionSha256: s.plan.dataAdmissionSha256, planSha256: digest(s.plan), outcome: 'ROLLED_BACK' };
  assert.equal(inspectNative(s, clock).status, 'ROLLED_BACK');
  assert.throws(() => readNative('/tmp/copied-history', '/tmp/packet', '/tmp/key'), /Canonical native/);
});
