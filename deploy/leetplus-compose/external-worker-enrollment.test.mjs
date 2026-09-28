import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { canonical, CONTRACT, digest, SCHEMA, EXTERNAL_WORKER_CAPABILITY } from './contract.mjs';
import { EXTERNAL_WORKER_GRANT_CONTRACT, EXTERNAL_WORKER_IDENTITY } from './external-worker-contract.mjs';
import { ENROLLMENT_CONTRACT, validateExternalEnrollmentApproval, validateExternalEnrollmentPlan, validateExternalEnrollmentReceipt } from './external-worker-enrollment.mjs';
import { boundCanaryEvidence } from './external-worker-canary.fixture.mjs';

function fixture(mode = 'CANARY') {
  const now = Date.parse('2026-09-27T10:00:00Z');
  const keys = crypto.generateKeyPairSync('ed25519'), publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const release = { contract: CONTRACT, releaseSha: 'a'.repeat(40), builtAt: '2026-09-27T00:00:00Z',
    migrationCount: SCHEMA.migrationCount, migration: SCHEMA.migration, externalWorkerCapability: EXTERNAL_WORKER_CAPABILITY,
    images: Object.fromEntries(['api', 'web', 'postgres', 'redis'].map((role, index) => [role, `sha256:${String(index + 1).repeat(64)}`])) };
  const current = { activeSlot: 'blue', generation: 10, blue: release, green: release, dataRelease: release };
  const secretBytes = Buffer.from(canonical({ DATABASE_URL: 'postgresql://leetplus_runtime:x@postgres/leetplus?schema=public&connection_limit=1&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict', INTEGRATION_ENCRYPTION_KEY: 'i', APP_ENCRYPTION_KEY: 'a',
    LANGAME_EXTERNAL_WORKER_ENABLED: 'true', LANGAME_EXTERNAL_WORKER_LIVE: 'true', LANGAME_EXTERNAL_WORKER_MODE: mode,
    LANGAME_EXTERNAL_WORKER_TENANT_ID: EXTERNAL_WORKER_IDENTITY.tenantId, LANGAME_EXTERNAL_WORKER_TENANT_SLUG: EXTERNAL_WORKER_IDENTITY.tenantSlug,
    LANGAME_EXTERNAL_WORKER_SOURCE_ID: EXTERNAL_WORKER_IDENTITY.sourceId, LANGAME_EXTERNAL_WORKER_STORE_ID: EXTERNAL_WORKER_IDENTITY.storeId,
    LANGAME_EXTERNAL_WORKER_DOMAIN: EXTERNAL_WORKER_IDENTITY.domain, LANGAME_EXTERNAL_WORKER_CLUB_ID: '1', LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE: 'LIVE',
    LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION: '1', LANGAME_EXTERNAL_WORKER_PROFILE_REVISION: '1', LANGAME_EXTERNAL_WORKER_STORE_REVISION: '0',
    LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false', LANGAME_SCHEDULED_HTTP_ENABLED: 'false', GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false',
    ...(mode === 'CANARY' ? { LANGAME_EXTERNAL_WORKER_DATE: '2026-09-26' } : {}) }));
  const grant = { contract: EXTERNAL_WORKER_GRANT_CONTRACT, id: crypto.randomUUID(), ...EXTERNAL_WORKER_IDENTITY, mode,
    hostIdentitySha256: 'b'.repeat(64), releaseSha: release.releaseSha, generation: current.generation,
    executionRevision: 1, profileRevision: 1, storeRevision: 0, secretSha256: digest(secretBytes),
    issuedAt: '2026-09-27T09:00:00Z', expiresAt: mode === 'CANARY' ? '2026-09-27T12:00:00Z' : '2026-10-02T00:00:00Z', businessDate: mode === 'CANARY' ? '2026-09-26' : null };
  const grantEnvelope = { grant, signature: crypto.sign(null, Buffer.from(canonical(grant)), keys.privateKey).toString('base64') };
  const serviceUnitBytes = Buffer.from('service\n'), timerUnitBytes = Buffer.from('timer\n');
  const context = { current, controllerManifestSha256: 'c'.repeat(64), hostIdentitySha256: grant.hostIdentitySha256,
    secretBytes, grantEnvelope, serviceUnitBytes, timerUnitBytes, networkPolicySha256: 'd'.repeat(64),
    previousEnrollmentReceiptSha256: null, canaryReceiptSha256: null, publicKey, now };
  const plan = { contract: `${ENROLLMENT_CONTRACT}_PLAN`, operationId: crypto.randomUUID(), action: `ENROLL_${mode}`,
    hostIdentitySha256: context.hostIdentitySha256, activeSha256: digest(current), controllerManifestSha256: context.controllerManifestSha256,
    releaseSha: release.releaseSha, generation: current.generation, worker: EXTERNAL_WORKER_IDENTITY.worker, mode,
    secretSha256: digest(secretBytes), grantEnvelopeSha256: digest(grantEnvelope), serviceUnitSha256: digest(serviceUnitBytes),
    timerUnitSha256: digest(timerUnitBytes), networkPolicySha256: context.networkPolicySha256,
    previousEnrollmentReceiptSha256: null, canaryReceiptSha256: null,
    issuedAt: '2026-09-27T09:30:00Z', expiresAt: '2026-09-27T11:00:00Z' };
  if (mode === 'TIMER') {
    const evidence = boundCanaryEvidence({ plan, grantEnvelope, current, timerSecretBytes: secretBytes, privateKey: keys.privateKey });
    context.canaryEvidence = evidence;
    context.previousEnrollmentReceiptSha256 = digest(evidence.enrollmentReceipt);
    context.canaryReceiptSha256 = digest(evidence.runReceipt);
    plan.previousEnrollmentReceiptSha256 = context.previousEnrollmentReceiptSha256;
    plan.canaryReceiptSha256 = context.canaryReceiptSha256;
  }
  const approval = { contract: `${ENROLLMENT_CONTRACT}_APPROVAL`, operationId: plan.operationId, planSha256: digest(plan),
    hostIdentitySha256: plan.hostIdentitySha256, action: plan.action, issuedAt: '2026-09-27T09:45:00Z', expiresAt: '2026-09-27T10:30:00Z' };
  const approvalEnvelope = { approval, signature: crypto.sign(null, Buffer.from(canonical(approval)), keys.privateKey).toString('base64') };
  const timerState = { unit: 'leetplus-compose-external-daily.timer', loadState: 'loaded', enabled: mode === 'TIMER', active: mode === 'TIMER', subState: mode === 'TIMER' ? 'waiting' : 'dead' };
  const receipt = { contract: `${ENROLLMENT_CONTRACT}_RECEIPT`, decision: 'PASS', operationId: plan.operationId, planSha256: digest(plan),
    approvalEnvelopeSha256: digest(approvalEnvelope), activeSha256: digest(current), secretSha256: digest(secretBytes),
    grantEnvelopeSha256: digest(grantEnvelope), serviceUnitSha256: digest(serviceUnitBytes), timerUnitSha256: digest(timerUnitBytes),
    networkReceiptSha256: 'e'.repeat(64), timerState, acceptedAt: '2026-09-27T10:01:00Z' };
  return { context, plan, approvalEnvelope, receipt, keys, now };
}
test('signed canary enrollment binds accepted capable app, exact secret/grant and dormant timer receipt', () => {
  const f = fixture(); assert.equal(validateExternalEnrollmentPlan(f.plan, f.context), f.plan);
  assert.equal(validateExternalEnrollmentApproval(f.plan, f.approvalEnvelope, f.context.publicKey, f.now), f.approvalEnvelope.approval);
  assert.equal(validateExternalEnrollmentReceipt(f.receipt, { ...f.context, plan: f.plan, approvalEnvelope: f.approvalEnvelope,
    networkReceiptSha256: f.receipt.networkReceiptSha256, timerState: f.receipt.timerState }), f.receipt);
});
test('signed timer enrollment requires marker, prior receipt identity and enabled timer postimage', () => {
  const f = fixture('TIMER');
  assert.equal(validateExternalEnrollmentPlan(f.plan, f.context), f.plan);
  assert.equal(validateExternalEnrollmentReceipt({ ...f.receipt, planSha256: digest(f.plan) }, { ...f.context, plan: f.plan, approvalEnvelope: f.approvalEnvelope,
    networkReceiptSha256: f.receipt.networkReceiptSha256, timerState: f.receipt.timerState }).decision, 'PASS');
  f.context.current.blue.externalWorkerCapability = undefined;
  assert.throws(() => validateExternalEnrollmentPlan(f.plan, f.context), /cannot|drift/i);
});
test('TIMER rejects fabricated canary hash, replay and failed scope before any activation', () => {
  const fake = fixture('TIMER'); fake.context.canaryEvidence = null;
  assert.throws(() => validateExternalEnrollmentPlan(fake.plan, fake.context), /canary evidence/i);
  const replay = fixture('TIMER'); replay.context.canaryEvidence.runResult.replayed = true;
  assert.throws(() => validateExternalEnrollmentPlan(replay.plan, replay.context));
  const failed = fixture('TIMER'); failed.context.canaryEvidence.runResult.decision = 'FAILED';
  failed.context.canaryEvidence.runResult.failedScopes = ['GUEST_FOUNDATION'];
  assert.throws(() => validateExternalEnrollmentPlan(failed.plan, failed.context));
});
test('unsigned/widened/stale authority and postimage drift fail closed', () => {
  const f = fixture();
  assert.throws(() => validateExternalEnrollmentApproval(f.plan, { ...f.approvalEnvelope, signature: 'bad' }, f.context.publicKey, f.now));
  assert.throws(() => validateExternalEnrollmentApproval(f.plan, f.approvalEnvelope, f.context.publicKey, Date.parse('2026-09-27T11:01:00Z')));
  assert.throws(() => validateExternalEnrollmentPlan({ ...f.plan, secretSha256: 'f'.repeat(64) }, f.context));
  assert.throws(() => validateExternalEnrollmentReceipt({ ...f.receipt, timerState: { ...f.receipt.timerState, enabled: true } },
    { ...f.context, plan: f.plan, approvalEnvelope: f.approvalEnvelope, networkReceiptSha256: f.receipt.networkReceiptSha256, timerState: f.receipt.timerState }));
});
