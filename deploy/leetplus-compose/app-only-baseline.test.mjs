import assert from 'node:assert/strict';
import test from 'node:test';
import { canonical, CONTRACT, digest, renderCompose, SCHEMA } from './contract.mjs';
import { BASELINE_CONTRACT, PLAN_CONTRACT, migrationInventoryDigest, synthesizeRelease, validateAppOnlyPlan, validateCertifiedBaseline } from './app-only-baseline.mjs';

const h = 'a'.repeat(64), other = 'b'.repeat(64), sha = 'c'.repeat(40), dataSha = 'd'.repeat(40);
const image = letter => `sha256:${letter.repeat(64)}`;
function fixtures() {
  const dataRelease = { contract: CONTRACT, releaseSha: dataSha, builtAt: '2026-09-24T00:00:00Z',
    migrationCount: SCHEMA.migrationCount, migration: SCHEMA.migration,
    images: { api: image('1'), web: image('2'), postgres: image('3'), redis: image('4') } };
  const bundle = { schemaVersion: 2, contract: 'LEETPLUS_COMPOSE_APP_BUNDLE_V2', releaseLane: 'L1_APP_ONLY',
    releaseSha: sha, builtAt: '2026-09-24T01:00:00Z', apiResourceProfile: 'API_6G_V1',
    sourceImpact: { baseSha: dataSha, headSha: sha, classifierId: 'LEETPLUS_RELEASE_IMPACT_V1',
      rulesSha256: h, impactReceiptSha256: h }, appImages: { api: image('5'), web: image('6') },
    schemaRequirement: { migrationCount: SCHEMA.migrationCount, migration: SCHEMA.migration,
      prismaSchemaSha256: h, migrationsInventorySha256: other },
    compatibilityRequirements: { policySha256: h, composeRuntimeContractSha256: other,
      controllerCapability: 'APP_ONLY_V2_BASELINE_CERTIFICATION', dataContract: CONTRACT },
    runtimeEvidence: { transportValidationSha256: h, archiveRoundtripSha256: h,
      networkValidationSha256: h, runtimeValidationSha256: h } };
  const admission = { schemaVersion: 2, contract: 'LEETPLUS_COMPOSE_APP_ADMISSION_V2', decision: 'PASS',
    releaseLane: 'L1_APP_ONLY', releaseSha: sha, repository: 'boozik3412/leetplus', ref: 'refs/heads/main', event: 'push',
    runId: '1', runAttempt: '1', workflowRef: 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main', workflowSha: sha,
    parentCandidateReceiptSha256: h, parentImpactReceiptSha256: h, requiredGateReceiptSha256: h,
    gateReceiptSha256: { authorityRootTrust: h, application: h, postgresqlAssortment: h,
      migrationSmoke: h, appImageRuntime: h },
    appArtifact: { name: `leetplus-compose-app-${sha}-1-1`, id: '1', transportDigest: h },
    bundleManifestSha256: digest(bundle), appArchiveSha256: h, transportValidationSha256: h, archiveRoundtripSha256: h,
    networkValidationSha256: h, runtimeValidationSha256: h, appImages: bundle.appImages,
    schemaRequirementSha256: digest(bundle.schemaRequirement), compatibilityRequirementsSha256: digest(bundle.compatibilityRequirements) };
  const previous = { activeSlot: 'blue', generation: 10, dataRelease, dataAdmissionSha256: h, blue: dataRelease, green: dataRelease };
  const now = Date.parse('2026-09-24T02:00:00Z');
  const opts = { bundle, admission, previous, hostIdentitySha256: h, controllerManifestSha256: other,
    databaseIdentitySha256: h, readinessReceiptSha256: other, now };
  const cert = { contract: BASELINE_CONTRACT, decision: 'CERTIFIED', appAdmissionSha256: digest(admission),
    releaseSha: sha, releaseLane: 'L1_APP_ONLY', hostIdentitySha256: h, controllerManifestSha256: other,
    activeStateSha256: digest(previous), generation: 10, activeSlot: 'blue', dataRelease,
    dataAdmissionSha256: h, databaseIdentitySha256: h,
    observedSchema: { ...bundle.schemaRequirement, aclSha256: h },
    compatibilityRequirementsSha256: digest(bundle.compatibilityRequirements), dataConfigurationSha256: h,
    readinessReceiptSha256: other, capturedAt: '2026-09-24T01:59:00Z', expiresAt: '2026-09-24T03:00:00Z' };
  return { bundle, admission, previous, cert, opts };
}
test('app release borrows only certified PostgreSQL/Redis identities', () => {
  const { bundle, cert, opts } = fixtures();
  assert.equal(validateCertifiedBaseline(cert, opts), cert);
  const release = synthesizeRelease(bundle, cert.dataRelease);
  assert.deepEqual(release.images, { api: bundle.appImages.api, web: bundle.appImages.web,
    postgres: cert.dataRelease.images.postgres, redis: cert.dataRelease.images.redis });
  assert.notEqual(canonical(release), canonical(cert.dataRelease));
});
test('drift, stale evidence and incompatible inputs are rejected', () => {
  for (const change of [
    ({ cert }) => { cert.activeStateSha256 = other; },
    ({ cert }) => { cert.dataAdmissionSha256 = other; },
    ({ cert }) => { cert.databaseIdentitySha256 = other; },
    ({ cert }) => { cert.observedSchema.migrationsInventorySha256 = h; },
    ({ cert }) => { cert.observedSchema.aclSha256 = 'bad'; },
    ({ cert }) => { cert.expiresAt = '2026-09-24T01:00:00Z'; },
    ({ cert }) => { cert.expiresAt = '2026-09-25T02:00:00Z'; },
    ({ cert }) => { cert.dataRelease.images.postgres = image('7'); },
    ({ bundle }) => { bundle.sourceImpact.baseSha = 'e'.repeat(40); },
    ({ admission }) => { admission.gateReceiptSha256 = {}; },
    ({ admission }) => { admission.appArtifact.name = 'forged'; },
  ]) {
    const value = fixtures(); change(value);
    assert.throws(() => validateCertifiedBaseline(value.cert, value.opts));
  }
});
test('V2 plan binds certified baseline and exact synthesized target while retaining V1 five-phase invariants', () => {
  const { bundle, admission, cert, previous, opts } = fixtures();
  const target = synthesizeRelease(bundle, cert.dataRelease);
  const plan = { contract: PLAN_CONTRACT, operationId: '11111111-1111-4111-8111-111111111111',
    hostIdentitySha256: opts.hostIdentitySha256, controlSha256: opts.controllerManifestSha256,
    targetSlot: 'green', action: 'ROLLOUT', generation: previous.generation, previous,
    blue: previous.blue, green: target, dataRelease: cert.dataRelease,
    dataAdmissionSha256: cert.dataAdmissionSha256, databaseIdentitySha256: opts.databaseIdentitySha256,
    admissionSha256: digest(admission), archiveSha256: admission.appArchiveSha256,
    appAdmissionSha256: digest(admission), appArchiveSha256: admission.appArchiveSha256,
    dataBaselineCertificationSha256: digest(cert), dataBaselineExpiresAt: cert.expiresAt,
    releaseLane: 'L1_APP_ONLY', backupReceiptSha256: h, rehearsalReceiptSha256: h,
    secretDigests: { 'acceptance.json': h, 'api-blue.json': h, 'api-green.json': h, 'db-ca.pem': h },
    networkPolicySha256: h,
    preparationGuard: { contract: 'LEETPLUS_PREPARATION_GUARD_V1', hostIdentitySha256: opts.hostIdentitySha256,
      controllerManifestSha256: opts.controllerManifestSha256, activeSha256: digest(previous),
      generation: previous.generation, activeSlot: previous.activeSlot },
    preparationEvidenceExpiresAt: '2026-09-24T02:30:00Z' };
  plan.composeSha256 = digest(renderCompose({ blue: plan.blue, green: plan.green,
    dataRelease: plan.dataRelease, activeSlot: plan.targetSlot }));
  assert.equal(validateAppOnlyPlan(plan, { bundle, admission, certification: cert,
    readinessReceiptSha256: opts.readinessReceiptSha256, now: opts.now }), plan);
  plan.dataBaselineCertificationSha256 = other;
  assert.throws(() => validateAppOnlyPlan(plan, { bundle, admission, certification: cert,
    readinessReceiptSha256: opts.readinessReceiptSha256, now: opts.now }), /immutable app\/data evidence/);
});
test('live migration inventory requires all completed exact names and checksums', () => {
  const rows = Array.from({ length: 190 }, (_, i) => ({ migration_name: `2026010100${String(i).padStart(4, '0')}_fixture`,
    checksum: h, finished_at: '2026-09-24T00:00:00Z', rolled_back_at: null }));
  rows.push({ migration_name: SCHEMA.migration, checksum: other,
    finished_at: '2026-09-24T00:00:00Z', rolled_back_at: null });
  assert.match(migrationInventoryDigest(rows), /^[a-f0-9]{64}$/);
  rows[0].finished_at = null;
  assert.throws(() => migrationInventoryDigest(rows), /incomplete/);
  rows[0].finished_at = '2026-09-24T00:00:00Z';
  rows[0].checksum = 'bad';
  assert.throws(() => migrationInventoryDigest(rows), /incomplete/);
});
