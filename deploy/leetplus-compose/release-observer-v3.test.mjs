import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { CONTRACT, SCHEMA, EXTERNAL_WORKER_CAPABILITY, canonical, digest, renderCompose } from './contract.mjs';
import { EXTERNAL_WORKER_CONTINUATION_CONTRACT } from './external-worker-continuation-runtime.mjs';
import { EXTERNAL_WORKER_IDENTITY } from './external-worker-contract.mjs';
import { PHASES } from './orchestrator.mjs';
import { inspectNative } from './release-observer.mjs';
import { deriveWorkerContinuation, TIMER_UNITS, WORKERS } from './worker-continuation.mjs';
import { deriveWorkerSetV3 } from './worker-set-v3.mjs';

const deploymentKeys = crypto.generateKeyPairSync('ed25519');
const externalKeys = crypto.generateKeyPairSync('ed25519');
const publicKey = deploymentKeys.publicKey.export({ type: 'spki', format: 'pem' });
const externalWorkerPublicKey = externalKeys.publicKey.export({ type: 'spki', format: 'pem' });
const sign = (grant, key = deploymentKeys.privateKey) => ({
  grant,
  signature: crypto.sign(null, Buffer.from(canonical(grant)), key).toString('base64'),
});
const envelopeDigests = envelopes => WORKERS.map((worker, index) => ({ worker, sha256: digest(envelopes[index]) }));

function release(sha, imageDigit, capable = false) {
  return {
    contract: CONTRACT,
    ...SCHEMA,
    releaseSha: sha,
    builtAt: '2026-09-27T00:00:00Z',
    apiResourceProfile: 'API_6G_V1',
    ...(capable ? { externalWorkerCapability: EXTERNAL_WORKER_CAPABILITY } : {}),
    images: Object.fromEntries(['api', 'web', 'postgres', 'redis']
      .map((name, index) => [name, `sha256:${String((imageDigit + index) % 9 + 1).repeat(64)}`])),
  };
}

function legacyProfile(worker) {
  const prefix = worker === WORKERS[0] ? 'GUEST_BONUS_LEDGER_WORKER' : 'LANGAME_DAILY_WORKER';
  return Buffer.from(canonical({
    DATABASE_URL: 'postgresql://leetplus_runtime:x@postgres/leetplus?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict',
    [`${prefix}_TENANT_SLUG`]: 'tenant',
    [`${prefix}_CANARY`]: 'false',
  }));
}

function externalProfile() {
  return Buffer.from(canonical({
    DATABASE_URL: 'postgresql://leetplus_runtime:x@postgres/leetplus?schema=public&connection_limit=1&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict',
    INTEGRATION_ENCRYPTION_KEY: 'integration', APP_ENCRYPTION_KEY: 'application',
    LANGAME_EXTERNAL_WORKER_ENABLED: 'true', LANGAME_EXTERNAL_WORKER_LIVE: 'true',
    LANGAME_EXTERNAL_WORKER_MODE: 'TIMER', LANGAME_EXTERNAL_WORKER_TENANT_ID: EXTERNAL_WORKER_IDENTITY.tenantId,
    LANGAME_EXTERNAL_WORKER_TENANT_SLUG: EXTERNAL_WORKER_IDENTITY.tenantSlug,
    LANGAME_EXTERNAL_WORKER_SOURCE_ID: EXTERNAL_WORKER_IDENTITY.sourceId,
    LANGAME_EXTERNAL_WORKER_STORE_ID: EXTERNAL_WORKER_IDENTITY.storeId,
    LANGAME_EXTERNAL_WORKER_DOMAIN: EXTERNAL_WORKER_IDENTITY.domain,
    LANGAME_EXTERNAL_WORKER_CLUB_ID: EXTERNAL_WORKER_IDENTITY.clubId,
    LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION: '1', LANGAME_EXTERNAL_WORKER_PROFILE_REVISION: '1',
    LANGAME_EXTERNAL_WORKER_STORE_REVISION: '0', LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE: 'LIVE',
    LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false', LANGAME_SCHEDULED_HTTP_ENABLED: 'false',
    GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false',
  }));
}

function baseFixture({ present = false, previousCapable = false } = {}) {
  const clock = Date.parse('2026-09-27T08:00:00Z');
  const previousRelease = release('b'.repeat(40), 1, previousCapable);
  const targetRelease = release('c'.repeat(40), 5, true);
  const previous = { activeSlot: 'green', generation: 8, blue: previousRelease, green: previousRelease,
    dataRelease: previousRelease, dataAdmissionSha256: 'e'.repeat(64) };
  const plan = { contract: `${CONTRACT}_PLAN`, operationId: '82345678-1234-4123-8123-123456789abc',
    action: 'ROLLOUT', hostIdentitySha256: 'a'.repeat(64), controlSha256: 'd'.repeat(64),
    admissionSha256: 'e'.repeat(64), archiveSha256: 'f'.repeat(64), backupReceiptSha256: '1'.repeat(64),
    rehearsalReceiptSha256: '2'.repeat(64), targetSlot: 'blue', generation: 8, previous,
    blue: targetRelease, green: previousRelease, dataRelease: previousRelease,
    dataAdmissionSha256: previous.dataAdmissionSha256, networkPolicySha256: '5'.repeat(64),
    databaseIdentitySha256: '6'.repeat(64), secretDigests: Object.fromEntries(
      ['acceptance.json', 'api-blue.json', 'api-green.json', 'db-ca.pem'].map(name => [name, '4'.repeat(64)])),
  };
  plan.composeSha256 = digest(renderCompose({ blue: plan.blue, green: plan.green,
    dataRelease: plan.dataRelease, activeSlot: plan.targetSlot }));

  const workerProfiles = Object.fromEntries(WORKERS.map(worker => [worker, legacyProfile(worker)]));
  const originals = WORKERS.map((worker, index) => sign({ contract: `${CONTRACT}_WORKER_GRANT`, worker,
    mode: 'TIMER', id: `${index + 1}2345678-1234-4123-8123-123456789abc`,
    hostIdentitySha256: plan.hostIdentitySha256, releaseSha: previousRelease.releaseSha, generation: 8,
    tenantSlug: 'tenant', secretSha256: digest(workerProfiles[worker]), issuedAt: '2026-09-27T07:00:00Z',
    expiresAt: '2026-09-28T00:00:00Z' }));
  plan.workerContinuation = deriveWorkerContinuation({
    originalTimers: WORKERS.map(worker => ({ worker, unit: TIMER_UNITS[worker], enabled: true, active: true })),
    originalGrantEnvelopes: originals,
    profileBindings: WORKERS.map(worker => ({ worker, profileSha256: digest(workerProfiles[worker]) })),
    targetReleaseSha: targetRelease.releaseSha, currentGeneration: 8, previousReleaseSha: previousRelease.releaseSha,
    forwardGrantIds: ['42345678-1234-4123-8123-123456789abc', '52345678-1234-4123-8123-123456789abc'],
    rollbackGrantIds: ['62345678-1234-4123-8123-123456789abc', '72345678-1234-4123-8123-123456789abc'],
  });
  const forwardWorkerEnvelopes = plan.workerContinuation.forward.grants.map(value => sign(value));
  const rollbackWorkerEnvelopes = plan.workerContinuation.rollback.grants.map(value => sign(value));

  let profile = null;
  let external;
  if (present) {
    profile = externalProfile();
    const originalGrant = { contract: 'LEETPLUS_LANGAME_EXTERNAL_WORKER_GRANT_V1',
      id: '13345678-1234-4123-8123-123456789abc', worker: EXTERNAL_WORKER_IDENTITY.worker, mode: 'TIMER',
      hostIdentitySha256: plan.hostIdentitySha256, releaseSha: previousRelease.releaseSha, generation: 8,
      ...EXTERNAL_WORKER_IDENTITY, executionRevision: 1, profileRevision: 1, storeRevision: 0,
      secretSha256: digest(profile), issuedAt: '2026-09-27T07:00:00Z', expiresAt: '2026-09-28T00:00:00Z',
      businessDate: null };
    external = { worker: EXTERNAL_WORKER_IDENTITY.worker, preimage: 'PRESENT',
      originalGrantEnvelope: sign(originalGrant, externalKeys.privateKey), profileSha256: digest(profile),
      enrollmentReceiptSha256: '9'.repeat(64), originalTimer: { unit: 'leetplus-compose-external-daily.timer',
        loadState: 'loaded', enabled: true, active: true, subState: 'waiting' },
      forward: { state: 'DORMANT', grant: null }, rollback: { state: 'DORMANT', grant: null } };
  } else {
    external = { worker: EXTERNAL_WORKER_IDENTITY.worker, preimage: 'ABSENT_AUTHORITY',
      originalGrantEnvelope: null, profileSha256: null, enrollmentReceiptSha256: null,
      originalTimer: { unit: 'leetplus-compose-external-daily.timer', loadState: 'not-found',
        enabled: false, active: false, subState: 'dead' },
      forward: { state: 'DORMANT', grant: null }, rollback: { state: 'ABSENT_UNSUPPORTED', grant: null } };
  }
  plan.workerSetV3 = deriveWorkerSetV3({ legacy: plan.workerContinuation, external,
    forwardRelease: targetRelease, rollbackRelease: previousRelease,
    ...(present ? { forwardGrantId: '33345678-1234-4123-8123-123456789abc',
      rollbackGrantId: '43345678-1234-4123-8123-123456789abc' } : {}) });
  const externalForwardEnvelope = plan.workerSetV3.external.forward.state === 'ACTIVE'
    ? sign(plan.workerSetV3.external.forward.grant, externalKeys.privateKey) : null;
  const externalRollbackEnvelope = plan.workerSetV3.external.rollback.state === 'ACTIVE'
    ? sign(plan.workerSetV3.external.rollback.grant, externalKeys.privateKey) : null;

  const workerContinuationIntent = { contract: 'LEETPLUS_WORKER_CONTINUATION_RUNTIME_V1_INTENT', mode: 'FORWARD',
    operationId: plan.operationId, planSha256: digest(plan), policySha256: digest(plan.workerContinuation),
    originalTimers: plan.workerContinuation.originalTimers, originalGrantEnvelopeSha256: envelopeDigests(originals),
    forwardGrantEnvelopeSha256: envelopeDigests(forwardWorkerEnvelopes),
    rollbackGrantEnvelopeSha256: envelopeDigests(rollbackWorkerEnvelopes) };
  const workerContinuationRollbackIntent = { ...workerContinuationIntent, mode: 'ROLLBACK' };
  const legacyReceipt = mode => ({ contract: 'LEETPLUS_WORKER_CONTINUATION_RUNTIME_V1_RECEIPT', decision: 'PASS', mode,
    operationId: plan.operationId, planSha256: digest(plan), policySha256: digest(plan.workerContinuation),
    intentSha256: digest(mode === 'FORWARD' ? workerContinuationIntent : workerContinuationRollbackIntent),
    generation: mode === 'FORWARD' ? 9 : 10,
    releaseSha: mode === 'FORWARD' ? targetRelease.releaseSha : previousRelease.releaseSha,
    grantEnvelopeSha256: envelopeDigests(mode === 'FORWARD' ? forwardWorkerEnvelopes : rollbackWorkerEnvelopes),
    timerPostimage: plan.workerContinuation.originalTimers });

  const externalWorkerContinuationIntent = { contract: `${EXTERNAL_WORKER_CONTINUATION_CONTRACT}_INTENT`,
    operationId: plan.operationId, planSha256: digest(plan), policySha256: digest(plan.workerSetV3),
    sourceGrant: plan.workerSetV3.external.originalGrantEnvelope, timer: plan.workerSetV3.external.originalTimer,
    forwardEnvelope: externalForwardEnvelope, rollbackEnvelope: externalRollbackEnvelope,
    forwardState: plan.workerSetV3.external.forward.state, rollbackState: plan.workerSetV3.external.rollback.state };
  const externalReceipt = mode => {
    const binding = mode === 'FORWARD' ? plan.workerSetV3.external.forward : plan.workerSetV3.external.rollback;
    const envelope = mode === 'FORWARD' ? externalForwardEnvelope : externalRollbackEnvelope;
    const timer = binding.state === 'ACTIVE' ? plan.workerSetV3.external.originalTimer
      : { ...plan.workerSetV3.external.originalTimer, enabled: false, active: false, subState: 'dead' };
    return { contract: `${EXTERNAL_WORKER_CONTINUATION_CONTRACT}_RECEIPT`, decision: 'PASS', mode,
      operationId: plan.operationId, planSha256: digest(plan), policySha256: digest(plan.workerSetV3),
      intentSha256: digest(externalWorkerContinuationIntent), state: binding.state,
      grantEnvelopeSha256: envelope ? digest(envelope) : null, timerPostimage: timer,
      generation: mode === 'FORWARD' ? 9 : 10,
      releaseSha: mode === 'FORWARD' ? targetRelease.releaseSha : previousRelease.releaseSha };
  };

  const approval = { contract: `${CONTRACT}_APPROVAL`, operationId: plan.operationId, action: plan.action,
    hostIdentitySha256: plan.hostIdentitySha256, planSha256: digest(plan),
    issuedAt: '2026-09-27T07:59:00Z', expiresAt: '2026-09-27T08:59:00Z' };
  const snapshot = { plan, approval: { approval,
    signature: crypto.sign(null, Buffer.from(canonical(approval)), deploymentKeys.privateKey).toString('base64') },
    publicKey, externalWorkerPublicKey, packet: { contract: 'LEETPLUS_RELEASE_PREPARATION_V1_GO_PACKET',
      decision: 'PREPARED_NOT_AUTHORIZATION', nativePlanSha256: digest(plan), nativeOperationId: plan.operationId,
      workerContinuation: plan.workerContinuation, workerSetV3: plan.workerSetV3 }, workerProfiles,
    forwardWorkerEnvelopes, rollbackWorkerEnvelopes, workerContinuationIntent,
    workerContinuationRollbackIntent, externalWorkerContinuationIntent,
    externalForwardEnvelope, externalRollbackEnvelope, externalWorkerProfile: profile,
  };
  return { snapshot, clock, legacyReceipt, externalReceipt };
}

function forwardHistory(fixture) {
  const { snapshot } = fixture;
  snapshot.workerContinuationReceipt = fixture.legacyReceipt('FORWARD');
  snapshot.externalWorkerContinuationReceipt = fixture.externalReceipt('FORWARD');
  let previousReceiptSha256 = null;
  snapshot.records = {};
  for (const phase of PHASES) {
    const intent = { phase, planSha256: digest(snapshot.plan), previousReceiptSha256 };
    const evidence = { phase, planSha256: digest(snapshot.plan), ...(phase === 'POSTCHECK' ? {
      workerContinuationReceiptSha256: digest(snapshot.workerContinuationReceipt),
      externalWorkerContinuationReceiptSha256: digest(snapshot.externalWorkerContinuationReceipt),
    } : {}) };
    const receipt = { phase, planSha256: digest(snapshot.plan), intentSha256: digest(intent),
      evidenceSha256: digest(evidence), previousReceiptSha256 };
    snapshot.records[phase] = { intent, evidence, receipt };
    previousReceiptSha256 = digest(receipt);
  }
  snapshot.final = { contract: `${CONTRACT}_COMPLETED`, planSha256: digest(snapshot.plan),
    operationId: snapshot.plan.operationId, lastReceiptSha256: previousReceiptSha256 };
  snapshot.rolledBack = null;
  return snapshot;
}

function rollbackHistory(fixture) {
  const { snapshot } = fixture;
  snapshot.workerContinuationRollbackReceipt = fixture.legacyReceipt('ROLLBACK');
  snapshot.externalWorkerContinuationRollbackReceipt = fixture.externalReceipt('ROLLBACK');
  let previousReceiptSha256 = null;
  snapshot.records = {};
  for (const phase of PHASES) {
    const intent = { phase, planSha256: digest(snapshot.plan), previousReceiptSha256 };
    snapshot.records[phase] = { intent };
    if (phase === 'POSTCHECK') break;
    const evidence = { phase, planSha256: digest(snapshot.plan) };
    const receipt = { phase, planSha256: digest(snapshot.plan), intentSha256: digest(intent),
      evidenceSha256: digest(evidence), previousReceiptSha256 };
    snapshot.records[phase] = { intent, evidence, receipt };
    previousReceiptSha256 = digest(receipt);
  }
  const active = { operationId: snapshot.plan.operationId, generation: 10,
    activeSlot: snapshot.plan.previous.activeSlot, blue: snapshot.plan.blue, green: snapshot.plan.green,
    dataRelease: snapshot.plan.dataRelease, dataAdmissionSha256: snapshot.plan.dataAdmissionSha256,
    planSha256: digest(snapshot.plan), outcome: 'ROLLED_BACK' };
  snapshot.rolledBack = { contract: `${CONTRACT}_ROLLED_BACK`, planSha256: digest(snapshot.plan),
    reason: 'POSTCHECK_FAILED', active,
    workerContinuationReceiptSha256: digest(snapshot.workerContinuationRollbackReceipt),
    externalWorkerContinuationReceiptSha256: digest(snapshot.externalWorkerContinuationRollbackReceipt) };
  snapshot.final = null;
  return snapshot;
}

test('historical V2 observer remains accepted when no workerSetV3 is present', async () => {
  await import('./release-observer-v2.test.mjs');
});

test('first capable rollout with absent external authority accepts a dormant V3 terminal', () => {
  const fixture = baseFixture();
  const snapshot = forwardHistory(fixture);
  assert.equal(snapshot.plan.workerSetV3.external.forward.state, 'DORMANT');
  assert.equal(inspectNative(snapshot, fixture.clock).status, 'APPLIED');
  assert.match(inspectNative(snapshot, fixture.clock).waitReason, /INDEPENDENT/);
});

test('present external authority accepts signed forward and rollback histories under its separate root', () => {
  const forwardFixture = baseFixture({ present: true, previousCapable: true });
  const forward = forwardHistory(forwardFixture);
  assert.equal(forward.plan.workerSetV3.external.forward.state, 'ACTIVE');
  assert.equal(inspectNative(forward, forwardFixture.clock).status, 'APPLIED');

  const rollbackFixture = baseFixture({ present: true, previousCapable: true });
  const rollback = rollbackHistory(rollbackFixture);
  assert.equal(inspectNative(rollback, rollbackFixture.clock).status, 'ROLLED_BACK');
});

test('V3 observer rejects missing or tampered external evidence, root, signature and packet', () => {
  const fixture = baseFixture({ present: true, previousCapable: true });
  const valid = forwardHistory(fixture);
  assert.equal(inspectNative(valid, fixture.clock).status, 'APPLIED');

  for (const mutate of [
    value => { delete value.externalWorkerContinuationReceipt; },
    value => { value.externalWorkerContinuationReceipt = { ...value.externalWorkerContinuationReceipt,
      policySha256: '0'.repeat(64) }; },
    value => { value.externalWorkerProfile = Buffer.from('{}'); },
    value => { value.externalWorkerPublicKey = value.publicKey; },
    value => { value.externalForwardEnvelope = { ...value.externalForwardEnvelope, signature: `${'A'.repeat(86)}==` }; },
    value => { value.packet = { ...value.packet, workerSetV3: { ...value.packet.workerSetV3,
      owner: 'FOREIGN_CONTROLLER' } }; },
  ]) {
    const value = structuredClone(valid);
    mutate(value);
    assert.throws(() => inspectNative(value, fixture.clock));
  }
});
