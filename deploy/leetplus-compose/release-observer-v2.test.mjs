import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { CONTRACT, SCHEMA, canonical, digest, renderCompose } from './contract.mjs';
import { PHASES } from './orchestrator.mjs';
import { inspectNative } from './release-observer.mjs';
import { deriveWorkerContinuation, WORKERS, TIMER_UNITS } from './worker-continuation.mjs';
import { synthesizeRelease } from './app-only-baseline.mjs';

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

test('actual app-only V2 prepared observation binds operation-owned app/data evidence and packet', () => {
  const { snapshot, clock } = fixture();
  const previous = snapshot.plan.previous;
  const target = { ...previous.green, apiResourceProfile: 'API_6G_V1' };
  const bundle = { schemaVersion: 2, contract: 'LEETPLUS_COMPOSE_APP_BUNDLE_V2', releaseLane: 'L1_APP_ONLY',
    releaseSha: target.releaseSha, builtAt: target.builtAt, apiResourceProfile: 'API_6G_V1',
    sourceImpact: { baseSha: previous.green.releaseSha, headSha: target.releaseSha,
      classifierId: 'LEETPLUS_RELEASE_IMPACT_V1', rulesSha256: 'a'.repeat(64), impactReceiptSha256: 'b'.repeat(64) },
    appImages: { api: target.images.api, web: target.images.web },
    schemaRequirement: { migrationCount: SCHEMA.migrationCount, migration: SCHEMA.migration,
      prismaSchemaSha256: 'c'.repeat(64), migrationsInventorySha256: 'd'.repeat(64) },
    compatibilityRequirements: { policySha256: 'e'.repeat(64), composeRuntimeContractSha256: 'f'.repeat(64),
      controllerCapability: 'APP_ONLY_V2_BASELINE_CERTIFICATION', dataContract: CONTRACT },
    runtimeEvidence: { transportValidationSha256: '1'.repeat(64), apiRuntimeValidationSha256: '2'.repeat(64),
      archiveRoundtripSha256: '3'.repeat(64), networkValidationSha256: '4'.repeat(64), runtimeValidationSha256: '5'.repeat(64) } };
  const admission = { schemaVersion: 2, contract: 'LEETPLUS_COMPOSE_APP_ADMISSION_V2', decision: 'PASS',
    releaseLane: 'L1_APP_ONLY', releaseSha: target.releaseSha, repository: 'boozik3412/leetplus',
    ref: 'refs/heads/main', event: 'push', runId: '1', runAttempt: '1',
    workflowRef: 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main', workflowSha: target.releaseSha,
    parentCandidateReceiptSha256: '6'.repeat(64), parentImpactReceiptSha256: bundle.sourceImpact.impactReceiptSha256,
    requiredGateReceiptSha256: '7'.repeat(64), gateReceiptSha256: {
      authorityRootTrust: '1'.repeat(64), application: '2'.repeat(64), postgresqlAssortment: '3'.repeat(64),
      migrationSmoke: '4'.repeat(64), appImageRuntime: '5'.repeat(64) },
    appArtifact: { name: `leetplus-compose-app-${target.releaseSha}-1-1`, id: '1', transportDigest: '8'.repeat(64) },
    bundleManifestSha256: digest(bundle), appArchiveSha256: '9'.repeat(64),
    ...bundle.runtimeEvidence, appImages: bundle.appImages,
    schemaRequirementSha256: digest(bundle.schemaRequirement),
    compatibilityRequirementsSha256: digest(bundle.compatibilityRequirements) };
  const certification = { contract: 'LEETPLUS_COMPOSE_DATA_BASELINE_CERTIFICATION_V1', decision: 'CERTIFIED',
    appAdmissionSha256: digest(admission), releaseSha: target.releaseSha, releaseLane: 'L1_APP_ONLY',
    hostIdentitySha256: snapshot.plan.hostIdentitySha256, controllerManifestSha256: snapshot.plan.controlSha256,
    activeStateSha256: digest(previous), generation: previous.generation, activeSlot: previous.activeSlot,
    dataRelease: previous.dataRelease, dataAdmissionSha256: previous.dataAdmissionSha256,
    databaseIdentitySha256: snapshot.plan.databaseIdentitySha256,
    observedSchema: { ...bundle.schemaRequirement, aclSha256: 'a'.repeat(64) },
    compatibilityRequirementsSha256: digest(bundle.compatibilityRequirements),
    dataConfigurationSha256: 'b'.repeat(64), readinessReceiptSha256: 'c'.repeat(64),
    capturedAt: '2026-09-24T07:59:00Z', expiresAt: '2026-09-24T09:00:00Z' };
  snapshot.plan.contract = 'LEETPLUS_COMPOSE_BLUE_GREEN_V2_PLAN';
  snapshot.plan.blue = synthesizeRelease(bundle, previous.dataRelease);
  snapshot.plan.composeSha256 = digest(renderCompose({ blue: snapshot.plan.blue, green: snapshot.plan.green,
    dataRelease: snapshot.plan.dataRelease, activeSlot: snapshot.plan.targetSlot }));
  snapshot.plan.releaseLane = 'L1_APP_ONLY';
  snapshot.plan.appAdmissionSha256 = snapshot.plan.admissionSha256 = digest(admission);
  snapshot.plan.appArchiveSha256 = snapshot.plan.archiveSha256 = admission.appArchiveSha256;
  snapshot.plan.dataBaselineCertificationSha256 = digest(certification);
  snapshot.plan.dataBaselineExpiresAt = certification.expiresAt;
  snapshot.plan.preparationGuard = { contract: 'LEETPLUS_PREPARATION_GUARD_V1',
    hostIdentitySha256: snapshot.plan.hostIdentitySha256,
    controllerManifestSha256: snapshot.plan.controlSha256, activeSha256: digest(previous),
    generation: previous.generation, activeSlot: previous.activeSlot };
  snapshot.plan.preparationEvidenceExpiresAt = '2026-09-24T08:45:00Z';
  snapshot.appBundle = bundle; snapshot.appAdmission = admission;
  snapshot.dataBaselineCertification = certification;
  snapshot.records = {}; snapshot.final = null; snapshot.rolledBack = null; snapshot.approval = null;
  snapshot.packet = { contract: 'LEETPLUS_RELEASE_PREPARATION_V2_GO_PACKET',
    decision: 'PREPARED_NOT_AUTHORIZATION', nativePlanSha256: digest(snapshot.plan),
    nativeOperationId: snapshot.plan.operationId, workerContinuation: snapshot.plan.workerContinuation };
  assert.equal(inspectNative(snapshot, clock).status, 'PREPARED');
  assert.throws(() => inspectNative({ ...snapshot, dataBaselineCertification: {
    ...certification, dataAdmissionSha256: 'f'.repeat(64) } }, clock), /Baseline is not bound/);
  assert.throws(() => inspectNative({ ...snapshot, packet: { ...snapshot.packet,
    contract: 'LEETPLUS_RELEASE_PREPARATION_V1_GO_PACKET' } }, clock), /GO packet/);
});
