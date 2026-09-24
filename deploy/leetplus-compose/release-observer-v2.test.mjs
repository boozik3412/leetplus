import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { CONTRACT, SCHEMA, canonical, digest, renderCompose } from './contract.mjs';
import { PHASES } from './orchestrator.mjs';
import { inspectNative } from './release-observer.mjs';
import { deriveWorkerContinuation, WORKERS, TIMER_UNITS } from './worker-continuation.mjs';

const key = crypto.generateKeyPairSync('ed25519');
const publicKey = key.publicKey.export({ type: 'spki', format: 'pem' });
const sign = grant => ({ grant, signature: crypto.sign(null, Buffer.from(canonical(grant)), key.privateKey).toString('base64') });
const envelopeHashes = values => WORKERS.map((worker, index) => ({ worker, sha256: digest(values[index]) }));

function completedHistory(snapshot) {
  let previousReceiptSha256 = null;
  snapshot.records = {};
  for (const phase of PHASES) {
    const intent = { phase, planSha256: digest(snapshot.plan), previousReceiptSha256 };
    const evidence = { phase, planSha256: digest(snapshot.plan),
      ...(phase === 'POSTCHECK' ? { workerContinuationReceiptSha256: digest(snapshot.workerContinuationReceipt) } : {}) };
    const receipt = { phase, planSha256: digest(snapshot.plan), intentSha256: digest(intent),
      evidenceSha256: digest(evidence), previousReceiptSha256 };
    snapshot.records[phase] = { intent, evidence, receipt };
    previousReceiptSha256 = digest(receipt);
  }
  snapshot.final = { contract: `${CONTRACT}_COMPLETED`, planSha256: digest(snapshot.plan),
    operationId: snapshot.plan.operationId, lastReceiptSha256: previousReceiptSha256 };
}

function fixture() {
  const clock = Date.parse('2026-09-24T08:00:00Z');
  const release = { contract: CONTRACT, ...SCHEMA, releaseSha: 'a'.repeat(40),
    builtAt: '2026-09-24T00:00:00Z', images: Object.fromEntries(['api', 'web', 'postgres', 'redis']
      .map((name, index) => [name, `sha256:${String(index + 1).repeat(64)}`])) };
  const previous = { activeSlot: 'green', generation: 8, blue: release, green: release,
    dataRelease: release, dataAdmissionSha256: 'e'.repeat(64) };
  const plan = { contract: `${CONTRACT}_PLAN`, operationId: '82345678-1234-4123-8123-123456789abc',
    action: 'ROLLOUT', hostIdentitySha256: 'c'.repeat(64), controlSha256: 'd'.repeat(64),
    admissionSha256: 'e'.repeat(64), archiveSha256: 'f'.repeat(64),
    backupReceiptSha256: '1'.repeat(64), rehearsalReceiptSha256: '2'.repeat(64),
    targetSlot: 'blue', generation: 8, previous, blue: release, green: release,
    dataRelease: release, dataAdmissionSha256: 'e'.repeat(64),
    networkPolicySha256: '5'.repeat(64), databaseIdentitySha256: '6'.repeat(64),
    composeSha256: digest(renderCompose({ blue: release, green: release, dataRelease: release, activeSlot: 'blue' })),
    secretDigests: Object.fromEntries(['acceptance.json', 'api-blue.json', 'api-green.json', 'db-ca.pem']
      .map(name => [name, '4'.repeat(64)])) };
  const workerProfiles = Object.fromEntries(WORKERS.map(worker => {
    const prefix = worker === WORKERS[0] ? 'GUEST_BONUS_LEDGER_WORKER' : 'LANGAME_DAILY_WORKER';
    const profile = { DATABASE_URL: 'postgresql://leetplus_runtime:fixture@postgres/leetplus?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict',
      [`${prefix}_TENANT_SLUG`]: 'tenant', [`${prefix}_CANARY`]: 'false' };
    return [worker, Buffer.from(canonical(profile))];
  }));
  const originals = WORKERS.map((worker, index) => sign({ contract: `${CONTRACT}_WORKER_GRANT`,
    worker, mode: 'TIMER', id: `${index + 1}2345678-1234-4123-8123-123456789abc`,
    hostIdentitySha256: plan.hostIdentitySha256, releaseSha: release.releaseSha, generation: 8,
    tenantSlug: 'tenant', secretSha256: digest(workerProfiles[worker]),
    issuedAt: '2026-09-24T07:00:00Z', expiresAt: '2026-09-24T09:00:00Z' }));
  plan.workerContinuation = deriveWorkerContinuation({
    originalTimers: WORKERS.map(worker => ({ worker, unit: TIMER_UNITS[worker], enabled: true, active: true })),
    originalGrantEnvelopes: originals,
    profileBindings: WORKERS.map(worker => ({ worker, profileSha256: digest(workerProfiles[worker]) })),
    targetReleaseSha: release.releaseSha, currentGeneration: 8, previousReleaseSha: release.releaseSha,
    forwardGrantIds: ['42345678-1234-4123-8123-123456789abc', '52345678-1234-4123-8123-123456789abc'],
    rollbackGrantIds: ['62345678-1234-4123-8123-123456789abc', '72345678-1234-4123-8123-123456789abc'],
  });
  const forwardWorkerEnvelopes = plan.workerContinuation.forward.grants.map(sign);
  const rollbackWorkerEnvelopes = plan.workerContinuation.rollback.grants.map(sign);
  const workerContinuationIntent = { contract: 'LEETPLUS_WORKER_CONTINUATION_RUNTIME_V1_INTENT', mode: 'FORWARD',
    operationId: plan.operationId, planSha256: digest(plan), policySha256: digest(plan.workerContinuation),
    originalTimers: plan.workerContinuation.originalTimers,
    originalGrantEnvelopeSha256: envelopeHashes(originals),
    forwardGrantEnvelopeSha256: envelopeHashes(forwardWorkerEnvelopes),
    rollbackGrantEnvelopeSha256: envelopeHashes(rollbackWorkerEnvelopes) };
  const workerContinuationReceipt = { contract: 'LEETPLUS_WORKER_CONTINUATION_RUNTIME_V1_RECEIPT',
    decision: 'PASS', mode: 'FORWARD', operationId: plan.operationId, planSha256: digest(plan),
    policySha256: digest(plan.workerContinuation), intentSha256: digest(workerContinuationIntent),
    generation: 9, releaseSha: release.releaseSha,
    grantEnvelopeSha256: envelopeHashes(forwardWorkerEnvelopes),
    timerPostimage: plan.workerContinuation.originalTimers };
  const approval = { contract: `${CONTRACT}_APPROVAL`, operationId: plan.operationId,
    action: plan.action, hostIdentitySha256: plan.hostIdentitySha256, planSha256: digest(plan),
    issuedAt: '2026-09-24T07:59:00Z', expiresAt: '2026-09-24T08:59:00Z' };
  const snapshot = { plan, approval: { approval, signature: crypto.sign(null, Buffer.from(canonical(approval)), key.privateKey).toString('base64') },
    publicKey, packet: { contract: 'LEETPLUS_RELEASE_PREPARATION_V1_GO_PACKET',
      decision: 'PREPARED_NOT_AUTHORIZATION', nativePlanSha256: digest(plan), nativeOperationId: plan.operationId,
      workerContinuation: plan.workerContinuation }, workerProfiles, forwardWorkerEnvelopes,
    rollbackWorkerEnvelopes, workerContinuationIntent, workerContinuationReceipt };
  completedHistory(snapshot);
  return { snapshot, clock };
}

test('V2 observer requires full signed continuation and keeps historical APPLIED inspectable', () => {
  const { snapshot, clock } = fixture();
  assert.equal(inspectNative(snapshot, clock).status, 'APPLIED');
  assert.match(inspectNative(snapshot, clock).waitReason, /INDEPENDENT/);
  assert.equal(inspectNative(snapshot, clock + 3 * 3600000).status, 'APPLIED');
  const forged = { ...snapshot, workerContinuationReceipt: { planSha256: digest(snapshot.plan), mode: 'FORWARD' } };
  completedHistory(forged);
  assert.throws(() => inspectNative(forged, clock), /worker continuation receipt|Invalid worker continuation|exact plan\/postimage/);
  const alteredSignature = { ...snapshot, forwardWorkerEnvelopes: snapshot.forwardWorkerEnvelopes.map((envelope, index) =>
    index === 0 ? { ...envelope, signature: `${'A'.repeat(86)}==` } : envelope) };
  assert.throws(() => inspectNative(alteredSignature, clock));
});
