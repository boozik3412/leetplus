// Runtime-only B baseline contract. The certificate must be produced and read
// by the installed controller from its immutable root-owned operation state.
// This module validates its contents; it does not turn caller JSON into trust.
import { API_RESOURCE_PROFILE, CONTRACT as V1, SCHEMA, canonical, demand, digest, imageId, release } from './contract.mjs';
import { validatePlan as validateV1Plan } from './orchestrator.mjs';
import { validateAppAdmission, validateAppBundle } from './app-only-artifact.mjs';

export const BASELINE_CONTRACT = 'LEETPLUS_COMPOSE_DATA_BASELINE_CERTIFICATION_V1';
export const PLAN_CONTRACT = 'LEETPLUS_COMPOSE_BLUE_GREEN_V2_PLAN';
const APP_BUNDLE = 'LEETPLUS_COMPOSE_APP_BUNDLE_V2';
const APP_ADMISSION = 'LEETPLUS_COMPOSE_APP_ADMISSION_V2';
const HASH = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const utc = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
function exactKeys(value, keys, name) {
  demand(value && typeof value === 'object' && !Array.isArray(value) &&
    canonical(Object.keys(value).sort()) === canonical([...keys].sort()), `${name} has unexpected fields`);
}
function hash(value, name) { demand(HASH.test(value ?? ''), `${name} must be SHA-256`); }
export function migrationInventoryDigest(rows) {
  demand(Array.isArray(rows) && rows.length === SCHEMA.migrationCount, 'Live migration count mismatch');
  const ordered = [...rows].sort((a, b) => a.migration_name.localeCompare(b.migration_name, 'en'));
  demand(new Set(ordered.map(row => row.migration_name)).size === SCHEMA.migrationCount &&
    ordered.at(-1)?.migration_name === SCHEMA.migration, 'Live migration names/head mismatch');
  for (const row of ordered) {
    exactKeys(row, ['migration_name', 'checksum', 'finished_at', 'rolled_back_at'], 'migration row');
    demand(/^\d{14}_[a-z0-9_]+$/.test(row.migration_name) && HASH.test(row.checksum) &&
      utc(row.finished_at) && row.rolled_back_at === null, 'Live migration row is incomplete or rolled back');
  }
  return digest(ordered.map(row => ({ migration_name: row.migration_name, checksum: row.checksum })));
}
function validateBundle(bundle) {
  validateAppBundle(bundle);
  exactKeys(bundle, ['schemaVersion', 'contract', 'releaseLane', 'releaseSha', 'builtAt', 'apiResourceProfile',
    'sourceImpact', 'appImages', 'schemaRequirement', 'compatibilityRequirements', 'runtimeEvidence'], 'AppBundle');
  demand(bundle.schemaVersion === 2 && bundle.contract === APP_BUNDLE && bundle.releaseLane === 'L1_APP_ONLY' &&
    SHA.test(bundle.releaseSha ?? '') && utc(bundle.builtAt) && bundle.apiResourceProfile === API_RESOURCE_PROFILE,
  'Invalid app bundle identity');
  exactKeys(bundle.sourceImpact, ['baseSha', 'headSha', 'classifierId', 'rulesSha256', 'impactReceiptSha256'], 'source impact');
  demand(SHA.test(bundle.sourceImpact.baseSha ?? '') && bundle.sourceImpact.headSha === bundle.releaseSha &&
    bundle.sourceImpact.classifierId === 'LEETPLUS_RELEASE_IMPACT_V1', 'Invalid source-impact range');
  hash(bundle.sourceImpact.rulesSha256, 'impact rules'); hash(bundle.sourceImpact.impactReceiptSha256, 'impact receipt');
  exactKeys(bundle.appImages, ['api', 'web'], 'AppBundle images');
  imageId(bundle.appImages.api); imageId(bundle.appImages.web);
  exactKeys(bundle.schemaRequirement, ['migrationCount', 'migration', 'prismaSchemaSha256', 'migrationsInventorySha256'], 'schema requirement');
  demand(bundle.schemaRequirement.migrationCount === SCHEMA.migrationCount && bundle.schemaRequirement.migration === SCHEMA.migration,
    'Candidate is not CURRENT191 compatible');
  hash(bundle.schemaRequirement.prismaSchemaSha256, 'Prisma schema');
  hash(bundle.schemaRequirement.migrationsInventorySha256, 'migration inventory');
  exactKeys(bundle.compatibilityRequirements, ['policySha256', 'composeRuntimeContractSha256', 'controllerCapability', 'dataContract'], 'compatibility requirements');
  hash(bundle.compatibilityRequirements.policySha256, 'B policy');
  hash(bundle.compatibilityRequirements.composeRuntimeContractSha256, 'Compose contract');
  demand(bundle.compatibilityRequirements.controllerCapability === 'APP_ONLY_V2_BASELINE_CERTIFICATION' &&
    bundle.compatibilityRequirements.dataContract === V1, 'Unsupported controller/data contract');
  exactKeys(bundle.runtimeEvidence, ['transportValidationSha256', 'archiveRoundtripSha256',
    'networkValidationSha256', 'runtimeValidationSha256'], 'runtime evidence');
  for (const [name, value] of Object.entries(bundle.runtimeEvidence)) hash(value, name);
  return bundle;
}
export function synthesizeRelease(bundle, certifiedDataRelease) {
  validateBundle(bundle);
  release(certifiedDataRelease);
  demand(certifiedDataRelease.migrationCount === bundle.schemaRequirement.migrationCount &&
    certifiedDataRelease.migration === bundle.schemaRequirement.migration, 'Data schema is incompatible with candidate');
  return release({ contract: V1, releaseSha: bundle.releaseSha, builtAt: bundle.builtAt,
    migrationCount: bundle.schemaRequirement.migrationCount, migration: bundle.schemaRequirement.migration,
    apiResourceProfile: bundle.apiResourceProfile,
    images: { api: bundle.appImages.api, web: bundle.appImages.web,
      postgres: certifiedDataRelease.images.postgres, redis: certifiedDataRelease.images.redis } });
}
export function validateCertifiedBaseline(cert, { bundle, admission, previous, hostIdentitySha256,
  controllerManifestSha256, databaseIdentitySha256, readinessReceiptSha256, now = Date.now() }) {
  validateBundle(bundle);
  validateAppAdmission(admission);
  exactKeys(admission, ['schemaVersion', 'contract', 'decision', 'releaseLane', 'releaseSha', 'repository', 'ref', 'event',
    'runId', 'runAttempt', 'workflowRef', 'workflowSha', 'parentCandidateReceiptSha256', 'parentImpactReceiptSha256',
    'requiredGateReceiptSha256', 'gateReceiptSha256', 'appArtifact', 'bundleManifestSha256', 'appArchiveSha256',
    'transportValidationSha256', 'archiveRoundtripSha256', 'networkValidationSha256', 'runtimeValidationSha256',
    'appImages', 'schemaRequirementSha256', 'compatibilityRequirementsSha256'], 'app admission');
  demand(admission.schemaVersion === 2 && admission.contract === APP_ADMISSION && admission.decision === 'PASS' &&
    admission.releaseLane === 'L1_APP_ONLY' && admission.releaseSha === bundle.releaseSha &&
    admission.repository === 'boozik3412/leetplus' && admission.ref === 'refs/heads/main' && admission.event === 'push' &&
    admission.workflowSha === bundle.releaseSha && admission.workflowRef === 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main' &&
    admission.bundleManifestSha256 === digest(bundle) &&
    admission.parentImpactReceiptSha256 === bundle.sourceImpact.impactReceiptSha256 &&
    canonical(admission.appImages) === canonical(bundle.appImages) &&
    admission.schemaRequirementSha256 === digest(bundle.schemaRequirement) &&
    admission.compatibilityRequirementsSha256 === digest(bundle.compatibilityRequirements) &&
    admission.transportValidationSha256 === bundle.runtimeEvidence.transportValidationSha256 &&
    admission.archiveRoundtripSha256 === bundle.runtimeEvidence.archiveRoundtripSha256 &&
    admission.networkValidationSha256 === bundle.runtimeEvidence.networkValidationSha256 &&
    admission.runtimeValidationSha256 === bundle.runtimeEvidence.runtimeValidationSha256,
  'App admission and bundle do not match');
  hash(hostIdentitySha256, 'host'); hash(controllerManifestSha256, 'installed controller');
  hash(databaseIdentitySha256, 'database identity'); hash(readinessReceiptSha256, 'readiness');
  demand(previous && ['blue', 'green'].includes(previous.activeSlot) && Number.isSafeInteger(previous.generation) &&
    previous.generation >= 0, 'Missing active production state');
  release(previous.dataRelease);
  demand(previous[previous.activeSlot]?.releaseSha === bundle.sourceImpact.baseSha,
    'App-only requires an exact source successor of the active application');
  hash(previous.dataAdmissionSha256, 'previous data admission');
  exactKeys(cert, ['contract', 'decision', 'appAdmissionSha256', 'releaseSha', 'releaseLane', 'hostIdentitySha256',
    'controllerManifestSha256', 'activeStateSha256', 'generation', 'activeSlot', 'dataRelease',
    'dataAdmissionSha256', 'databaseIdentitySha256', 'observedSchema', 'compatibilityRequirementsSha256',
    'dataConfigurationSha256', 'readinessReceiptSha256', 'capturedAt', 'expiresAt'], 'data certification');
  demand(cert.contract === BASELINE_CONTRACT && cert.decision === 'CERTIFIED' &&
    cert.appAdmissionSha256 === digest(admission) && cert.releaseSha === bundle.releaseSha &&
    cert.releaseLane === 'L1_APP_ONLY' && cert.hostIdentitySha256 === hostIdentitySha256 &&
    cert.controllerManifestSha256 === controllerManifestSha256 && cert.activeStateSha256 === digest(previous) &&
    cert.generation === previous.generation && cert.activeSlot === previous.activeSlot &&
    canonical(cert.dataRelease) === canonical(previous.dataRelease) &&
    cert.dataAdmissionSha256 === previous.dataAdmissionSha256 && cert.databaseIdentitySha256 === databaseIdentitySha256 &&
    cert.compatibilityRequirementsSha256 === digest(bundle.compatibilityRequirements) &&
    cert.readinessReceiptSha256 === readinessReceiptSha256,
  'Baseline is not bound to the active data/controller/host');
  hash(cert.dataConfigurationSha256, 'data configuration');
  exactKeys(cert.observedSchema, ['migrationCount', 'migration', 'prismaSchemaSha256', 'migrationsInventorySha256', 'aclSha256'], 'observed schema');
  demand(cert.observedSchema.migrationCount === bundle.schemaRequirement.migrationCount &&
    cert.observedSchema.migration === bundle.schemaRequirement.migration &&
    cert.observedSchema.prismaSchemaSha256 === bundle.schemaRequirement.prismaSchemaSha256 &&
    cert.observedSchema.migrationsInventorySha256 === bundle.schemaRequirement.migrationsInventorySha256,
  'Live schema or migration inputs differ from candidate');
  hash(cert.observedSchema.aclSha256, 'database ACL');
  demand(utc(cert.capturedAt) && utc(cert.expiresAt) && Date.parse(cert.capturedAt) <= now + 30_000 &&
    Date.parse(cert.expiresAt) > now && Date.parse(cert.expiresAt) > Date.parse(cert.capturedAt) &&
    Date.parse(cert.expiresAt) - Date.parse(cert.capturedAt) <= 4 * 3_600_000,
  'Baseline certification is stale or outside the existing four-hour preparation window');
  return cert;
}
export function validateAppOnlyPlan(plan, { bundle, admission, certification, readinessReceiptSha256, now = Date.now() }) {
  demand(plan?.contract === PLAN_CONTRACT && plan.releaseLane === 'L1_APP_ONLY' && plan.action === 'ROLLOUT' && plan.previous,
    'V2 app-only plan must roll out over an existing active state');
  const cert = validateCertifiedBaseline(certification, { bundle, admission, previous: plan.previous,
    hostIdentitySha256: plan.hostIdentitySha256, controllerManifestSha256: plan.controlSha256,
    databaseIdentitySha256: plan.databaseIdentitySha256, readinessReceiptSha256, now });
  hash(plan.appAdmissionSha256, 'plan app admission'); hash(plan.appArchiveSha256, 'plan app archive');
  hash(plan.dataBaselineCertificationSha256, 'plan baseline');
  demand(plan.appAdmissionSha256 === digest(admission) && plan.admissionSha256 === plan.appAdmissionSha256 &&
    plan.appArchiveSha256 === admission.appArchiveSha256 && plan.archiveSha256 === plan.appArchiveSha256 &&
    plan.dataBaselineCertificationSha256 === digest(cert) && plan.dataBaselineExpiresAt === cert.expiresAt &&
    plan.preparationEvidenceExpiresAt && Date.parse(plan.preparationEvidenceExpiresAt) <= Date.parse(cert.expiresAt),
  'V2 plan does not bind immutable app/data evidence');
  const target = synthesizeRelease(bundle, cert.dataRelease);
  demand(canonical(plan[plan.targetSlot]) === canonical(target) &&
    canonical(plan.dataRelease) === canonical(cert.dataRelease) && plan.dataAdmissionSha256 === cert.dataAdmissionSha256,
  'V2 plan must use the certified app/data composition');
  const legacyPlan = { ...plan, contract: `${V1}_PLAN` };
  for (const field of ['releaseLane', 'appAdmissionSha256', 'appArchiveSha256', 'dataBaselineCertificationSha256', 'dataBaselineExpiresAt']) delete legacyPlan[field];
  validateV1Plan(legacyPlan);
  return plan;
}
