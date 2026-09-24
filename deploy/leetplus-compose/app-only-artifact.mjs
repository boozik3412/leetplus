import crypto from 'node:crypto';
import fs from 'node:fs';

import { API_RESOURCE_PROFILE, SCHEMA } from './contract.mjs';

export const APP_BUNDLE_CONTRACT = 'LEETPLUS_COMPOSE_APP_BUNDLE_V2';
export const APP_ADMISSION_CONTRACT = 'LEETPLUS_COMPOSE_APP_ADMISSION_V2';
export const APP_ONLY_IMPACT_CONTRACT = 'LEETPLUS_APP_ONLY_IMPACT_V2';
export const REQUIRED_GATES_CONTRACT = 'LEETPLUS_APP_ONLY_REQUIRED_GATES_V2';
export const RELEASE_LANE = 'L1_APP_ONLY';
export const DATA_CONTRACT = 'LEETPLUS_COMPOSE_BLUE_GREEN_V1';
export const CONTROLLER_CAPABILITY = 'APP_ONLY_V2_BASELINE_CERTIFICATION';
export const REQUIRED_GATES = Object.freeze([
  'AUTHORITY_ROOT_TRUST',
  'RELEASE_CRITICAL_APPLICATION',
  'RELEASE_CRITICAL_POSTGRESQL_ASSORTMENT',
  'MIGRATION_SMOKE',
  'COMPOSE_APP_RUNTIME',
]);

const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const IMAGE = /^sha256:[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;

export function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function digest(value) {
  return crypto.createHash('sha256').update(
    typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value),
  ).digest('hex');
}

export function demand(condition, message) {
  if (!condition) throw new Error(message);
}

export function exactKeys(value, keys, label) {
  demand(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  demand(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()),
    `${label} keys are not exact`,
  );
}

export function readCanonicalJson(file, label = 'JSON receipt') {
  const stat = fs.lstatSync(file);
  demand(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, `${label} must be a one-link regular file`);
  demand(stat.size > 0 && stat.size <= 4 * 1024 * 1024, `${label} size is outside the accepted bound`);
  const raw = fs.readFileSync(file, 'utf8');
  demand(!raw.includes('\r'), `${label} must use LF line endings`);
  const value = JSON.parse(raw);
  demand(raw === canonical(value), `${label} must be canonical JSON`);
  return { raw, value };
}

export function fileDigest(file) {
  return digest(fs.readFileSync(file));
}

export function validateAppOnlyReceipt(value) {
  exactKeys(value, [
    'contract', 'decision', 'releaseLane', 'releaseSha', 'diffBaseSha',
    'impactReceiptSha256', 'candidateReceiptSha256', 'allowlistSha256', 'changedPaths',
  ], 'app-only receipt');
  demand(value.contract === APP_ONLY_IMPACT_CONTRACT && value.decision === 'PASS', 'App-only decision is not PASS');
  demand(value.releaseLane === RELEASE_LANE, 'App-only release lane mismatch');
  demand(SHA.test(value.releaseSha ?? '') && SHA.test(value.diffBaseSha ?? ''), 'Invalid app-only source identity');
  for (const key of ['impactReceiptSha256', 'candidateReceiptSha256', 'allowlistSha256']) {
    demand(HASH.test(value[key] ?? ''), `Invalid app-only ${key}`);
  }
  demand(Array.isArray(value.changedPaths) && value.changedPaths.length > 0, 'App-only changedPaths must be nonempty');
  demand(new Set(value.changedPaths).size === value.changedPaths.length, 'App-only changedPaths contain duplicates');
  demand(value.changedPaths.every(item => typeof item === 'string' && item.length > 0), 'Invalid app-only changed path');
  return value;
}

export function validateAppBundle(value) {
  exactKeys(value, [
    'schemaVersion', 'contract', 'releaseLane', 'releaseSha', 'builtAt', 'apiResourceProfile',
    'sourceImpact', 'appImages', 'schemaRequirement', 'compatibilityRequirements', 'runtimeEvidence',
  ], 'app bundle');
  demand(value.schemaVersion === 2 && value.contract === APP_BUNDLE_CONTRACT, 'Invalid app bundle contract');
  demand(value.releaseLane === RELEASE_LANE, 'Invalid app bundle release lane');
  demand(SHA.test(value.releaseSha ?? ''), 'Invalid app bundle release SHA');
  demand(UTC.test(value.builtAt ?? '') && Number.isFinite(Date.parse(value.builtAt)), 'Invalid app bundle build time');
  demand(value.apiResourceProfile === API_RESOURCE_PROFILE, 'Invalid app bundle API resource profile');

  exactKeys(value.sourceImpact, ['baseSha', 'headSha', 'classifierId', 'rulesSha256', 'impactReceiptSha256'], 'source impact');
  demand(SHA.test(value.sourceImpact.baseSha ?? '') && value.sourceImpact.headSha === value.releaseSha, 'Source impact identity mismatch');
  demand(value.sourceImpact.classifierId === 'LEETPLUS_RELEASE_IMPACT_V1', 'Unexpected source impact classifier');
  demand(HASH.test(value.sourceImpact.rulesSha256 ?? '') && HASH.test(value.sourceImpact.impactReceiptSha256 ?? ''), 'Invalid source impact hashes');

  exactKeys(value.appImages, ['api', 'web'], 'app images');
  demand(IMAGE.test(value.appImages.api ?? '') && IMAGE.test(value.appImages.web ?? ''), 'App images must be exact immutable IDs');
  demand(value.appImages.api !== value.appImages.web, 'API and Web images must be distinct');

  exactKeys(value.schemaRequirement, ['migrationCount', 'migration', 'prismaSchemaSha256', 'migrationsInventorySha256'], 'schema requirement');
  demand(value.schemaRequirement.migrationCount === SCHEMA.migrationCount && value.schemaRequirement.migration === SCHEMA.migration, 'App bundle schema requirement is not CURRENT191');
  demand(HASH.test(value.schemaRequirement.prismaSchemaSha256 ?? '') && HASH.test(value.schemaRequirement.migrationsInventorySha256 ?? ''), 'Invalid schema requirement hashes');

  exactKeys(value.compatibilityRequirements, ['policySha256', 'composeRuntimeContractSha256', 'controllerCapability', 'dataContract'], 'compatibility requirements');
  demand(HASH.test(value.compatibilityRequirements.policySha256 ?? '') && HASH.test(value.compatibilityRequirements.composeRuntimeContractSha256 ?? ''), 'Invalid compatibility hashes');
  demand(value.compatibilityRequirements.controllerCapability === CONTROLLER_CAPABILITY, 'Unsupported controller capability');
  demand(value.compatibilityRequirements.dataContract === DATA_CONTRACT, 'Unsupported data contract');

  exactKeys(value.runtimeEvidence, [
    'transportValidationSha256', 'archiveRoundtripSha256', 'networkValidationSha256', 'runtimeValidationSha256',
  ], 'runtime evidence');
  for (const hash of Object.values(value.runtimeEvidence)) demand(HASH.test(hash ?? ''), 'Invalid runtime evidence hash');
  return value;
}

export function validateRequiredGateReceipt(value) {
  exactKeys(value, [
    'contract', 'decision', 'releaseLane', 'releaseSha', 'repository', 'ref', 'event',
    'runId', 'runAttempt', 'workflowRef', 'workflowSha', 'candidateReceiptSha256',
    'appOnlyReceiptSha256', 'requiredGates', 'gateReceipts',
  ], 'required-gate receipt');
  demand(value.contract === REQUIRED_GATES_CONTRACT && value.decision === 'PASS', 'Required gates did not pass');
  demand(value.releaseLane === RELEASE_LANE && SHA.test(value.releaseSha ?? ''), 'Required-gate release identity mismatch');
  demand(value.repository === 'boozik3412/leetplus' && value.ref === 'refs/heads/main' && value.event === 'push', 'Required gates are not exact main push');
  demand(/^[1-9][0-9]*$/.test(value.runId ?? '') && /^[1-9][0-9]*$/.test(value.runAttempt ?? ''), 'Invalid required-gate run identity');
  demand(value.workflowRef === 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main' && value.workflowSha === value.releaseSha, 'Required-gate workflow identity mismatch');
  demand(HASH.test(value.candidateReceiptSha256 ?? '') && HASH.test(value.appOnlyReceiptSha256 ?? ''), 'Invalid required-gate parent hashes');
  demand(JSON.stringify(value.requiredGates) === JSON.stringify(REQUIRED_GATES), 'Required gate set or order mismatch');
  exactKeys(value.gateReceipts, REQUIRED_GATES, 'gate receipts');
  for (const name of REQUIRED_GATES) {
    exactKeys(value.gateReceipts[name], ['result', 'sha256'], `gate receipt ${name}`);
    demand(value.gateReceipts[name].result === 'SUCCESS' && HASH.test(value.gateReceipts[name].sha256 ?? ''), `Gate ${name} did not produce exact SUCCESS evidence`);
  }
  return value;
}

export function validateAppAdmission(value) {
  exactKeys(value, [
    'schemaVersion', 'contract', 'decision', 'releaseLane', 'releaseSha', 'repository', 'ref', 'event',
    'runId', 'runAttempt', 'workflowRef', 'workflowSha', 'parentCandidateReceiptSha256',
    'parentImpactReceiptSha256', 'requiredGateReceiptSha256', 'gateReceiptSha256', 'appArtifact',
    'bundleManifestSha256', 'appArchiveSha256', 'transportValidationSha256',
    'archiveRoundtripSha256', 'networkValidationSha256', 'runtimeValidationSha256',
    'appImages', 'schemaRequirementSha256', 'compatibilityRequirementsSha256',
  ], 'app admission');
  demand(value.schemaVersion === 2 && value.contract === APP_ADMISSION_CONTRACT && value.decision === 'PASS', 'Invalid app admission contract');
  demand(value.releaseLane === RELEASE_LANE && SHA.test(value.releaseSha ?? ''), 'Invalid app admission release identity');
  demand(value.repository === 'boozik3412/leetplus' && value.ref === 'refs/heads/main' && value.event === 'push', 'App admission is not exact main push');
  demand(/^[1-9][0-9]*$/.test(value.runId ?? '') && /^[1-9][0-9]*$/.test(value.runAttempt ?? ''), 'Invalid app admission run identity');
  demand(value.workflowRef === 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main' && value.workflowSha === value.releaseSha, 'Invalid app admission workflow identity');
  for (const key of [
    'parentCandidateReceiptSha256', 'parentImpactReceiptSha256', 'requiredGateReceiptSha256',
    'bundleManifestSha256', 'appArchiveSha256', 'transportValidationSha256',
    'archiveRoundtripSha256', 'networkValidationSha256', 'runtimeValidationSha256',
    'schemaRequirementSha256', 'compatibilityRequirementsSha256',
  ]) demand(HASH.test(value[key] ?? ''), `Invalid app admission ${key}`);
  exactKeys(value.gateReceiptSha256, ['authorityRootTrust', 'application', 'postgresqlAssortment', 'migrationSmoke', 'appImageRuntime'], 'app admission gate hashes');
  for (const hash of Object.values(value.gateReceiptSha256)) demand(HASH.test(hash ?? ''), 'Invalid app admission gate hash');
  exactKeys(value.appArtifact, ['name', 'id', 'transportDigest'], 'app artifact identity');
  demand(value.appArtifact.name === `leetplus-compose-app-${value.releaseSha}-${value.runId}-${value.runAttempt}`, 'Invalid app artifact name');
  demand(/^[1-9][0-9]*$/.test(value.appArtifact.id ?? '') && HASH.test(value.appArtifact.transportDigest ?? ''), 'Invalid app artifact transport identity');
  exactKeys(value.appImages, ['api', 'web'], 'admitted app images');
  demand(IMAGE.test(value.appImages.api ?? '') && IMAGE.test(value.appImages.web ?? '') && value.appImages.api !== value.appImages.web, 'Invalid admitted app image IDs');
  return value;
}
