// Pure B live-baseline certification helpers. This module never reads files,
// invokes Docker/psql, or publishes authority. The installed controller must
// collect every byte and digest below through safeFile()/fixed Docker probes,
// keep the control lock, and publish the returned candidate immutably.
import { TextDecoder } from 'node:util';

import {
  BASELINE_CONTRACT,
  migrationInventoryDigest,
  validateCertifiedBaseline,
} from './app-only-baseline.mjs';
import { CONTRACT, SCHEMA, canonical, demand, digest, imageId, release } from './contract.mjs';

export const LIVE_OBSERVATION_CONTRACT = 'LEETPLUS_COMPOSE_DATA_BASELINE_OBSERVATION_V1';
export const MIGRATION_OBSERVATION_CONTRACT = 'LEETPLUS_PRISMA_MIGRATION_OBSERVATION_V1';
export const MAX_OBSERVATION_AGE_MS = 30_000;
export const MAX_CERTIFICATION_TTL_MS = 4 * 3_600_000;

// One SELECT, one MVCC snapshot, no caller interpolation and no secret value.
// The installed controller is expected to execute this exact string with
// psql -XAt against the already identified local primary.
export const PRISMA_MIGRATIONS_READ_ONLY_SQL = String.raw`SELECT pg_catalog.jsonb_build_object(
  'contract', 'LEETPLUS_PRISMA_MIGRATION_OBSERVATION_V1',
  'rows', COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'migration_name', migration_name,
        'checksum', checksum,
        'finished_at', CASE WHEN finished_at IS NULL THEN NULL ELSE pg_catalog.to_char(finished_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
        'rolled_back_at', CASE WHEN rolled_back_at IS NULL THEN NULL ELSE pg_catalog.to_char(rolled_back_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
        'applied_steps_count', applied_steps_count
      ) ORDER BY migration_name
    ),
    '[]'::jsonb
  )
)::text
FROM public."_prisma_migrations"`;

export const TRUST_ASSUMPTIONS = Object.freeze([
  'activeStateBytes, dataAdmissionBytes, installedControllerManifestBytes and receipt hashes came from root-owned safeFile reads',
  'container image IDs and databaseSystemIdentifier came from fixed Docker/psql observations under the controller lock',
  'activeApiSource bytes came from the observed active API image without caller-selected paths',
  'candidateControlLeafDigests came from the admitted control.tar.gz and installedControlLeafDigests came from safeFile reads',
  'immutable publication and revalidation are performed by the installed controller after this pure helper returns',
]);

const HASH = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const MACHINE_ID = /^[a-f0-9]{32}$/;
const SYSTEM_IDENTIFIER = /^[0-9]{10,24}$/;
const MIGRATION = /^\d{14}_[a-z0-9_]+$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const decoder = new TextDecoder('utf-8', { fatal: true });
const REQUIRED_CONTROL_LEAVES = Object.freeze([
  'app-only-artifact.mjs',
  'app-only-baseline.mjs',
  'app-only-live-certification.mjs',
  'contract.mjs',
  'control.mjs',
  'orchestrator.mjs',
]);

function exactKeys(value, keys, name) {
  demand(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  demand(canonical(Object.keys(value).sort()) === canonical([...keys].sort()), `${name} has unexpected fields`);
}

function hash(value, name) {
  demand(HASH.test(value ?? ''), `${name} must be SHA-256`);
  return value;
}

function bytes(value, name, { max = 16 * 1024 * 1024, empty = false } = {}) {
  demand(Buffer.isBuffer(value) && value.length <= max && (empty || value.length > 0), `${name} must be bounded bytes`);
  return value;
}

function text(value, name, options) {
  return decoder.decode(bytes(value, name, options));
}

function canonicalJson(value, name, options) {
  const raw = text(value, name, options);
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`${name} must be JSON`); }
  demand(raw === canonical(parsed), `${name} must use canonical JSON bytes`);
  return parsed;
}

function normalizeDigestMap(value, name) {
  demand(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  const entries = Object.entries(value);
  demand(entries.length > 0, `${name} must not be empty`);
  for (const [leaf, valueDigest] of entries) {
    demand(/^[A-Za-z0-9_.@-]+$/.test(leaf) && !['.', '..', 'install-manifest.json'].includes(leaf), `${name} has an unsafe leaf`);
    hash(valueDigest, `${name} ${leaf}`);
  }
  return Object.fromEntries(entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

function canonicalTimestamp(value, name) {
  demand(typeof value === 'string' && UTC.test(value) && Number.isFinite(Date.parse(value)), `${name} must be a UTC timestamp`);
  return value;
}

export function parsePrismaMigrationProbe(output) {
  const raw = Buffer.isBuffer(output) ? text(output, 'migration probe output') : output;
  demand(typeof raw === 'string' && raw.trim() === raw && !raw.includes('\n') && raw.length <= 1024 * 1024,
    'Migration probe output must be one exact JSON row');
  let observation;
  try { observation = JSON.parse(raw); } catch { throw new Error('Migration probe output must be JSON'); }
  exactKeys(observation, ['contract', 'rows'], 'migration observation');
  demand(observation.contract === MIGRATION_OBSERVATION_CONTRACT, 'Migration observation contract mismatch');
  demand(Array.isArray(observation.rows), 'Migration rows are missing');
  const names = new Set();
  for (const row of observation.rows) {
    exactKeys(row, ['migration_name', 'checksum', 'finished_at', 'rolled_back_at', 'applied_steps_count'], 'migration row');
    demand(MIGRATION.test(row.migration_name ?? '') && HASH.test(row.checksum ?? ''), 'Migration row identity is invalid');
    demand(!names.has(row.migration_name), 'Migration observation contains duplicate names');
    names.add(row.migration_name);
    demand(row.finished_at !== null && UTC.test(row.finished_at ?? '') && Number.isFinite(Date.parse(row.finished_at)) &&
      row.rolled_back_at === null && row.applied_steps_count === 1,
    'Migration row is unfinished, rolled back, or partially applied');
  }
  demand(observation.rows.length === SCHEMA.migrationCount, 'Migration observation is missing or has unknown rows');
  return observation.rows;
}

export function inspectActiveApiSource(activeApiSource) {
  exactKeys(activeApiSource, ['imageId', 'prismaSchemaBytes', 'migrations'], 'active API source');
  imageId(activeApiSource.imageId);
  bytes(activeApiSource.prismaSchemaBytes, 'Prisma schema bytes', { max: 4 * 1024 * 1024 });
  demand(Array.isArray(activeApiSource.migrations) && activeApiSource.migrations.length === SCHEMA.migrationCount,
    'Active API migration source count mismatch');
  const inventory = [];
  const names = new Set();
  for (const migration of activeApiSource.migrations) {
    exactKeys(migration, ['migration_name', 'migrationSqlBytes'], 'active API migration source');
    demand(MIGRATION.test(migration.migration_name ?? '') && !names.has(migration.migration_name),
      'Active API migration names are invalid or duplicated');
    names.add(migration.migration_name);
    inventory.push({ migration_name: migration.migration_name,
      checksum: digest(bytes(migration.migrationSqlBytes, `migration bytes ${migration.migration_name}`)) });
  }
  inventory.sort((left, right) => left.migration_name < right.migration_name ? -1 : left.migration_name > right.migration_name ? 1 : 0);
  demand(inventory.at(-1)?.migration_name === SCHEMA.migration, 'Active API migration head mismatch');
  return {
    imageId: activeApiSource.imageId,
    prismaSchemaSha256: digest(activeApiSource.prismaSchemaBytes),
    migrationsInventorySha256: digest(inventory),
    inventory,
  };
}

function validatePrevious(previous, activeStateBytes, dataAdmissionBytes, bundle) {
  demand(previous && ['blue', 'green'].includes(previous.activeSlot) && Number.isSafeInteger(previous.generation) && previous.generation >= 0,
    'Previous active state is missing');
  for (const role of ['blue', 'green', 'dataRelease']) release(previous[role]);
  demand(previous[previous.activeSlot].releaseSha === bundle.sourceImpact.baseSha,
    'App-only candidate is not an exact successor of the active release');
  hash(previous.dataAdmissionSha256, 'previous data admission');
  demand(text(activeStateBytes, 'active state bytes') === canonical(previous), 'Active state bytes differ from the parsed active state');

  const dataAdmission = canonicalJson(dataAdmissionBytes, 'data admission bytes', { max: 1024 * 1024 });
  demand(digest(dataAdmissionBytes) === previous.dataAdmissionSha256, 'Accepted data admission digest changed');
  demand(dataAdmission.contract === `${CONTRACT}_ADMISSION` && dataAdmission.decision === 'PASS' &&
    dataAdmission.repository === 'boozik3412/leetplus' && dataAdmission.ref === 'refs/heads/main' && dataAdmission.event === 'push' &&
    dataAdmission.releaseSha === previous.dataRelease.releaseSha && canonical(dataAdmission.images) === canonical(previous.dataRelease.images),
  'Previous data release is not bound to its accepted V1 admission');
}

function validateControlReuse({ bundle, controllerManifestBytes, installedControlLeafDigests,
  candidateControlLeafDigests, candidateControlArchiveSha256, runtimeValidationBytes }) {
  const manifest = canonicalJson(controllerManifestBytes, 'installed controller manifest', { max: 1024 * 1024 });
  exactKeys(manifest, ['contract', 'releaseSha', 'admissionSha256', 'files'], 'installed controller manifest');
  demand(manifest.contract === `${CONTRACT}_INSTALL` && SHA.test(manifest.releaseSha ?? ''), 'Installed controller manifest identity mismatch');
  hash(manifest.admissionSha256, 'installed controller admission');
  const manifestFiles = normalizeDigestMap(manifest.files, 'installed controller manifest files');
  for (const leaf of REQUIRED_CONTROL_LEAVES) demand(manifestFiles[leaf], `Installed controller lacks B capability leaf ${leaf}`);
  const installed = normalizeDigestMap(installedControlLeafDigests, 'installed controller leaf observations');
  const candidate = normalizeDigestMap(candidateControlLeafDigests, 'candidate control archive leaf observations');
  demand(canonical(installed) === canonical(manifestFiles), 'Installed controller bytes differ from its manifest');
  demand(canonical(candidate) === canonical(manifestFiles), 'Candidate control archive differs from the installed B controller');

  const runtime = canonicalJson(runtimeValidationBytes, 'runtime validation bytes', { max: 1024 * 1024 });
  exactKeys(runtime, ['decision', 'releaseSha', 'dualSlotConstructionVerified', 'apiBlueCreated', 'apiGreenCreated',
    'webBlueReady', 'webGreenReady', 'noDataImages', 'controlArchiveSha256', 'appImages'], 'runtime validation');
  demand(digest(runtimeValidationBytes) === bundle.runtimeEvidence.runtimeValidationSha256 &&
    runtime.decision === 'PASS' && runtime.releaseSha === bundle.releaseSha &&
    runtime.dualSlotConstructionVerified === true && runtime.apiBlueCreated === true && runtime.apiGreenCreated === true &&
    runtime.webBlueReady === true && runtime.webGreenReady === true && runtime.noDataImages === true &&
    canonical(runtime.appImages) === canonical(bundle.appImages),
  'Runtime validation is not the admitted AppBundle evidence');
  hash(candidateControlArchiveSha256, 'candidate control archive');
  demand(runtime.controlArchiveSha256 === candidateControlArchiveSha256,
    'Candidate control leaf observations are not associated with the admitted control archive');
  return digest(controllerManifestBytes);
}

export function createDataBaselineCertificationCandidate({ bundle, admission, previous, observation, ttlMs = MAX_CERTIFICATION_TTL_MS, now = Date.now() }) {
  exactKeys(observation, [
    'contract', 'capturedAt', 'hostIdentityBytes', 'activeStateBytes', 'dataAdmissionBytes',
    'controllerManifestBytes', 'installedControlLeafDigests', 'candidateControlLeafDigests',
    'candidateControlArchiveSha256', 'runtimeValidationBytes', 'activeApiImageId', 'postgresImageId',
    'redisImageId', 'databaseSystemIdentifier', 'dataConfigurationSha256', 'aclSha256',
    'readinessReceiptSha256', 'migrationProbeOutput', 'activeApiSource',
  ], 'live observation');
  demand(observation.contract === LIVE_OBSERVATION_CONTRACT, 'Live observation contract mismatch');
  const capturedAt = canonicalTimestamp(observation.capturedAt, 'observation capturedAt');
  const capturedMs = Date.parse(capturedAt);
  demand(Number.isFinite(now) && capturedMs <= now + MAX_OBSERVATION_AGE_MS && capturedMs >= now - MAX_OBSERVATION_AGE_MS,
    'Live observation is stale or future-dated');
  demand(Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= MAX_CERTIFICATION_TTL_MS, 'Invalid certification TTL');

  validatePrevious(previous, observation.activeStateBytes, observation.dataAdmissionBytes, bundle);
  const controllerManifestSha256 = validateControlReuse({ bundle,
    controllerManifestBytes: observation.controllerManifestBytes,
    installedControlLeafDigests: observation.installedControlLeafDigests,
    candidateControlLeafDigests: observation.candidateControlLeafDigests,
    candidateControlArchiveSha256: observation.candidateControlArchiveSha256,
    runtimeValidationBytes: observation.runtimeValidationBytes,
  });

  const machineId = text(observation.hostIdentityBytes, 'host identity bytes', { max: 256 }).trim();
  demand(MACHINE_ID.test(machineId), 'Host identity is invalid');
  demand(SYSTEM_IDENTIFIER.test(observation.databaseSystemIdentifier ?? ''), 'Database system identifier is invalid');
  const hostIdentitySha256 = digest(machineId);
  const databaseIdentitySha256 = digest(observation.databaseSystemIdentifier);
  const activeSource = inspectActiveApiSource(observation.activeApiSource);
  imageId(observation.activeApiImageId); imageId(observation.postgresImageId); imageId(observation.redisImageId);
  demand(activeSource.imageId === observation.activeApiImageId &&
    observation.activeApiImageId === previous[previous.activeSlot].images.api,
  'Active API image/source identity drift');
  demand(observation.postgresImageId === previous.dataRelease.images.postgres &&
    observation.redisImageId === previous.dataRelease.images.redis,
  'Installed data image identity drift');

  const liveRows = parsePrismaMigrationProbe(observation.migrationProbeOutput);
  const sourceChecksums = new Map(activeSource.inventory.map(row => [row.migration_name, row.checksum]));
  for (const row of liveRows) demand(sourceChecksums.get(row.migration_name) === row.checksum,
    `Live migration checksum differs from active API source: ${row.migration_name}`);
  const liveDigest = migrationInventoryDigest(liveRows.map(({ migration_name, checksum, finished_at, rolled_back_at }) =>
    ({ migration_name, checksum, finished_at, rolled_back_at })));
  demand(activeSource.prismaSchemaSha256 === bundle.schemaRequirement.prismaSchemaSha256 &&
    activeSource.migrationsInventorySha256 === bundle.schemaRequirement.migrationsInventorySha256 &&
    liveDigest === bundle.schemaRequirement.migrationsInventorySha256,
  'Active API/live migration inputs differ from the AppBundle schema requirement');

  hash(observation.dataConfigurationSha256, 'data configuration');
  hash(observation.aclSha256, 'database ACL');
  hash(observation.readinessReceiptSha256, 'readiness receipt');
  const expiresAt = new Date(capturedMs + ttlMs).toISOString();
  const certification = {
    contract: BASELINE_CONTRACT,
    decision: 'CERTIFIED',
    appAdmissionSha256: digest(admission),
    releaseSha: bundle.releaseSha,
    releaseLane: 'L1_APP_ONLY',
    hostIdentitySha256,
    controllerManifestSha256,
    activeStateSha256: digest(observation.activeStateBytes),
    generation: previous.generation,
    activeSlot: previous.activeSlot,
    dataRelease: previous.dataRelease,
    dataAdmissionSha256: previous.dataAdmissionSha256,
    databaseIdentitySha256,
    observedSchema: {
      migrationCount: SCHEMA.migrationCount,
      migration: SCHEMA.migration,
      prismaSchemaSha256: activeSource.prismaSchemaSha256,
      migrationsInventorySha256: liveDigest,
      aclSha256: observation.aclSha256,
    },
    compatibilityRequirementsSha256: digest(bundle.compatibilityRequirements),
    dataConfigurationSha256: observation.dataConfigurationSha256,
    readinessReceiptSha256: observation.readinessReceiptSha256,
    capturedAt,
    expiresAt,
  };
  validateCertifiedBaseline(certification, { bundle, admission, previous, hostIdentitySha256,
    controllerManifestSha256, databaseIdentitySha256, readinessReceiptSha256: observation.readinessReceiptSha256, now });
  return certification;
}
