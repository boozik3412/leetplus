import assert from 'node:assert/strict';
import test from 'node:test';

import { BASELINE_CONTRACT, validateCertifiedBaseline } from './app-only-baseline.mjs';
import {
  LIVE_OBSERVATION_CONTRACT,
  MIGRATION_OBSERVATION_CONTRACT,
  PRISMA_MIGRATIONS_READ_ONLY_SQL,
  createDataBaselineCertificationCandidate,
  inspectActiveApiSource,
  parsePrismaMigrationProbe,
} from './app-only-live-certification.mjs';
import { CONTRACT, SCHEMA, canonical, digest } from './contract.mjs';

const hash = character => character.repeat(64);
const image = character => `sha256:${hash(character)}`;
const baseSha = 'b'.repeat(40);
const releaseSha = 'c'.repeat(40);
const now = Date.parse('2026-09-24T02:00:00Z');

function migrations() {
  const values = Array.from({ length: SCHEMA.migrationCount - 1 }, (_, index) => ({
    migration_name: `20260101${String(index).padStart(6, '0')}_fixture`,
    migrationSqlBytes: Buffer.from(`-- fixture ${index}\nSELECT ${index};\n`),
  }));
  values.push({ migration_name: SCHEMA.migration, migrationSqlBytes: Buffer.from('-- current 191\nSELECT 191;\n') });
  return values;
}

function fixture() {
  const activeApiSource = { imageId: image('1'), prismaSchemaBytes: Buffer.from('generator client {}\n'), migrations: migrations() };
  const source = inspectActiveApiSource(activeApiSource);
  const dataRelease = { contract: CONTRACT, releaseSha: 'd'.repeat(40), builtAt: '2026-09-20T00:00:00Z',
    migrationCount: SCHEMA.migrationCount, migration: SCHEMA.migration,
    images: { api: image('8'), web: image('9'), postgres: image('3'), redis: image('4') } };
  const activeRelease = { ...dataRelease, releaseSha: baseSha, images: { ...dataRelease.images, api: activeApiSource.imageId, web: image('2') } };
  const dataAdmission = { contract: `${CONTRACT}_ADMISSION`, decision: 'PASS', repository: 'boozik3412/leetplus',
    ref: 'refs/heads/main', event: 'push', releaseSha: dataRelease.releaseSha, images: dataRelease.images };
  const dataAdmissionBytes = Buffer.from(canonical(dataAdmission));
  const previous = { operationId: '11111111-1111-4111-8111-111111111111', generation: 10, activeSlot: 'blue',
    blue: activeRelease, green: activeRelease, dataRelease, dataAdmissionSha256: digest(dataAdmissionBytes), planSha256: hash('7') };
  const bundle = { schemaVersion: 2, contract: 'LEETPLUS_COMPOSE_APP_BUNDLE_V2', releaseLane: 'L1_APP_ONLY',
    releaseSha, builtAt: '2026-09-24T01:00:00Z', apiResourceProfile: 'API_6G_V1',
    sourceImpact: { baseSha, headSha: releaseSha, classifierId: 'LEETPLUS_RELEASE_IMPACT_V1',
      rulesSha256: hash('a'), impactReceiptSha256: hash('b') }, appImages: { api: image('5'), web: image('6') },
    schemaRequirement: { migrationCount: SCHEMA.migrationCount, migration: SCHEMA.migration,
      prismaSchemaSha256: source.prismaSchemaSha256, migrationsInventorySha256: source.migrationsInventorySha256 },
    compatibilityRequirements: { policySha256: hash('c'), composeRuntimeContractSha256: hash('d'),
      controllerCapability: 'APP_ONLY_V2_BASELINE_CERTIFICATION', dataContract: CONTRACT },
    runtimeEvidence: { transportValidationSha256: hash('e'), apiRuntimeValidationSha256: hash('a'), archiveRoundtripSha256: hash('f'),
      networkValidationSha256: hash('1'), runtimeValidationSha256: '' } };
  const controlFiles = {
    'app-only-artifact.mjs': hash('1'), 'app-only-baseline.mjs': hash('2'),
    'app-only-live-certification.mjs': hash('3'), 'contract.mjs': hash('4'),
    'control.mjs': hash('5'), 'orchestrator.mjs': hash('6'),
  };
  const controllerManifest = { contract: `${CONTRACT}_INSTALL`, releaseSha: baseSha,
    admissionSha256: hash('8'), files: controlFiles };
  const runtimeValidation = { decision: 'PASS', releaseSha, dualSlotConstructionVerified: true,
    apiBlueCreated: true, apiGreenCreated: true, webBlueReady: true, webGreenReady: true,
    noDataImages: true, controlArchiveSha256: hash('9'), appImages: bundle.appImages };
  const runtimeValidationBytes = Buffer.from(canonical(runtimeValidation));
  bundle.runtimeEvidence.runtimeValidationSha256 = digest(runtimeValidationBytes);
  const admission = { schemaVersion: 2, contract: 'LEETPLUS_COMPOSE_APP_ADMISSION_V2', decision: 'PASS',
    releaseLane: 'L1_APP_ONLY', releaseSha, repository: 'boozik3412/leetplus', ref: 'refs/heads/main', event: 'push',
    runId: '1', runAttempt: '1', workflowRef: 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main', workflowSha: releaseSha,
    parentCandidateReceiptSha256: hash('a'), parentImpactReceiptSha256: bundle.sourceImpact.impactReceiptSha256,
    requiredGateReceiptSha256: hash('b'), gateReceiptSha256: { authorityRootTrust: hash('1'), application: hash('2'),
      postgresqlAssortment: hash('3'), migrationSmoke: hash('4'), appImageRuntime: hash('5') },
    appArtifact: { name: `leetplus-compose-app-${releaseSha}-1-1`, id: '1', transportDigest: hash('6') },
    bundleManifestSha256: digest(bundle), appArchiveSha256: hash('7'),
    transportValidationSha256: bundle.runtimeEvidence.transportValidationSha256,
    apiRuntimeValidationSha256: bundle.runtimeEvidence.apiRuntimeValidationSha256,
    archiveRoundtripSha256: bundle.runtimeEvidence.archiveRoundtripSha256,
    networkValidationSha256: bundle.runtimeEvidence.networkValidationSha256,
    runtimeValidationSha256: bundle.runtimeEvidence.runtimeValidationSha256, appImages: bundle.appImages,
    schemaRequirementSha256: digest(bundle.schemaRequirement), compatibilityRequirementsSha256: digest(bundle.compatibilityRequirements) };
  const rows = source.inventory.map(row => ({ ...row, finished_at: '2026-09-24T00:00:00.000Z',
    rolled_back_at: null, applied_steps_count: 1 }));
  const observation = { contract: LIVE_OBSERVATION_CONTRACT, capturedAt: '2026-09-24T02:00:00.000Z',
    hostIdentityBytes: Buffer.from(`${'a'.repeat(32)}\n`), activeStateBytes: Buffer.from(canonical(previous)),
    dataAdmissionBytes, controllerManifestBytes: Buffer.from(canonical(controllerManifest)),
    installedControlLeafDigests: { ...controlFiles }, candidateControlLeafDigests: { ...controlFiles },
    candidateControlArchiveSha256: runtimeValidation.controlArchiveSha256, runtimeValidationBytes,
    activeApiImageId: activeApiSource.imageId, postgresImageId: dataRelease.images.postgres,
    redisImageId: dataRelease.images.redis, databaseSystemIdentifier: '7541234567890123456',
    dataConfigurationSha256: hash('a'), aclSha256: hash('b'), readinessReceiptSha256: hash('c'),
    migrationProbeOutput: JSON.stringify({ contract: MIGRATION_OBSERVATION_CONTRACT, rows }), activeApiSource };
  return { bundle, admission, previous, observation };
}

function build(value = fixture(), options = {}) {
  return createDataBaselineCertificationCandidate({ ...value, now, ttlMs: 60 * 60 * 1000, ...options });
}

test('fixed probe is one read-only SELECT and completed rows parse with explicit null semantics', () => {
  assert.match(PRISMA_MIGRATIONS_READ_ONLY_SQL, /^SELECT /);
  assert.match(PRISMA_MIGRATIONS_READ_ONLY_SQL, /FROM public\."_prisma_migrations"$/);
  assert.doesNotMatch(PRISMA_MIGRATIONS_READ_ONLY_SQL, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|COPY|CALL|DO)\b/i);
  const value = fixture();
  assert.equal(parsePrismaMigrationProbe(value.observation.migrationProbeOutput).length, SCHEMA.migrationCount);
  const missing = fixture();
  missing.observation.migrationProbeOutput = JSON.stringify({ contract: MIGRATION_OBSERVATION_CONTRACT, rows: [] });
  assert.throws(() => build(missing), /missing or has unknown rows/);
});

test('matching live database, active image source and accepted V1 data produce only a certification candidate', () => {
  const value = fixture();
  const certification = build(value);
  assert.equal(certification.contract, BASELINE_CONTRACT);
  assert.equal(certification.decision, 'CERTIFIED');
  assert.equal(certification.dataRelease.images.postgres, value.observation.postgresImageId);
  assert.equal(certification.observedSchema.migrationsInventorySha256, value.bundle.schemaRequirement.migrationsInventorySha256);
  assert.equal(certification.expiresAt, '2026-09-24T03:00:00.000Z');
  assert.equal(validateCertifiedBaseline(certification, { bundle: value.bundle, admission: value.admission,
    previous: value.previous, hostIdentitySha256: certification.hostIdentitySha256,
    controllerManifestSha256: certification.controllerManifestSha256,
    databaseIdentitySha256: certification.databaseIdentitySha256,
    readinessReceiptSha256: value.observation.readinessReceiptSha256, now }), certification);
  assert.throws(() => validateCertifiedBaseline(certification, { bundle: value.bundle, admission: value.admission,
    previous: value.previous, hostIdentitySha256: certification.hostIdentitySha256,
    controllerManifestSha256: certification.controllerManifestSha256,
    databaseIdentitySha256: certification.databaseIdentitySha256,
    readinessReceiptSha256: value.observation.readinessReceiptSha256, now: Date.parse(certification.expiresAt) }), /stale/);
});

test('mismatch, unfinished, duplicate and partial migration rows fail closed', () => {
  for (const [change, expected] of [
    [rows => { rows[0].checksum = hash('f'); }, /checksum differs/],
    [rows => { rows[0].finished_at = null; }, /unfinished/],
    [rows => { rows[1].migration_name = rows[0].migration_name; }, /duplicate/],
    [rows => { rows[0].unknown = true; }, /unexpected fields/],
    [rows => { rows[0].applied_steps_count = 0; }, /partially applied/],
  ]) {
    const value = fixture();
    const probe = JSON.parse(value.observation.migrationProbeOutput);
    change(probe.rows);
    value.observation.migrationProbeOutput = JSON.stringify(probe);
    assert.throws(() => build(value), expected);
  }
});

test('stale or changed live data, active source and V1 admission fail closed', () => {
  const stale = fixture();
  stale.observation.capturedAt = '2026-09-24T01:59:00.000Z';
  assert.throws(() => build(stale), /stale/);

  const dataImage = fixture();
  dataImage.observation.postgresImageId = image('f');
  assert.throws(() => build(dataImage), /data image identity drift/);

  const apiImage = fixture();
  apiImage.observation.activeApiImageId = image('f');
  assert.throws(() => build(apiImage), /API image\/source identity drift/);

  const source = fixture();
  source.observation.activeApiSource.migrations[0].migrationSqlBytes = Buffer.from('changed');
  assert.throws(() => build(source), /checksum differs|AppBundle schema requirement/);

  const admission = fixture();
  admission.observation.dataAdmissionBytes = Buffer.from(canonical({ altered: true }));
  assert.throws(() => build(admission), /admission digest changed/);
});

test('candidate control archive must equal every installed B controller leaf', () => {
  const candidate = fixture();
  candidate.observation.candidateControlLeafDigests['control.mjs'] = hash('f');
  assert.throws(() => build(candidate), /Candidate control archive differs/);

  const installed = fixture();
  installed.observation.installedControlLeafDigests['control.mjs'] = hash('f');
  assert.throws(() => build(installed), /Installed controller bytes differ/);

  const archive = fixture();
  archive.observation.candidateControlArchiveSha256 = hash('f');
  assert.throws(() => build(archive), /admitted control archive/);
});
