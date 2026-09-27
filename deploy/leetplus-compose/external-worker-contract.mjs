import crypto from 'node:crypto';
import { canonical, demand, digest } from './contract.mjs';

export const EXTERNAL_WORKER_GRANT_CONTRACT = 'LEETPLUS_LANGAME_EXTERNAL_WORKER_GRANT_V1';
export const EXTERNAL_WORKER_RESULT_CONTRACT = 'LEETPLUS_LANGAME_EXTERNAL_WORKER_RESULT_V1';
export const EXTERNAL_WORKER_IDENTITY = Object.freeze({
  worker: 'langame-external-daily-worker', tenantId: '8cc79086-ed43-44fa-83d3-20207ec48758', tenantSlug: 'set-1',
  sourceId: '94a3842b-847e-4c4d-89b0-7cb8976a9f17', storeId: 'ecee16ef-f0cb-4307-b079-e2f0303c3a16',
  domain: '1171.langame.ru', clubId: '1', customerStage: 'LIVE',
});
const SHA = /^[a-f0-9]{64}$/;
const RELEASE = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const DATE = /^\d{4}-\d\d-\d\d$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const SCHEDULERS = ['LANGAME_DAILY_SYNC_SCHEDULER_ENABLED', 'LANGAME_SCHEDULED_HTTP_ENABLED', 'GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED'];
const REQUIRED_PROFILE_KEYS = ['DATABASE_URL', 'INTEGRATION_ENCRYPTION_KEY', 'APP_ENCRYPTION_KEY', 'LANGAME_EXTERNAL_WORKER_ENABLED', 'LANGAME_EXTERNAL_WORKER_LIVE', 'LANGAME_EXTERNAL_WORKER_MODE', 'LANGAME_EXTERNAL_WORKER_TENANT_ID', 'LANGAME_EXTERNAL_WORKER_TENANT_SLUG', 'LANGAME_EXTERNAL_WORKER_SOURCE_ID', 'LANGAME_EXTERNAL_WORKER_STORE_ID', 'LANGAME_EXTERNAL_WORKER_DOMAIN', 'LANGAME_EXTERNAL_WORKER_CLUB_ID', 'LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION', 'LANGAME_EXTERNAL_WORKER_PROFILE_REVISION', 'LANGAME_EXTERNAL_WORKER_STORE_REVISION', 'LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE', ...SCHEDULERS];
const PROFILE_KEYS = new Set([...REQUIRED_PROFILE_KEYS, 'LANGAME_DISCREPANCY_LOG_ROOT']);
const exactKeys = (value, keys, label) => demand(value && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(','), `Invalid ${label} fields`);
const positive = (value, label) => demand(Number.isSafeInteger(value) && value > 0, `Invalid ${label}`);
const nonnegative = (value, label) => demand(Number.isSafeInteger(value) && value >= 0, `Invalid ${label}`);
function exactUtc(value, label) { const parsed = Date.parse(value); const normalized = Number.isFinite(parsed) ? new Date(parsed).toISOString() : ''; demand(typeof value === 'string' && UTC.test(value) && (value === normalized || value === normalized.replace('.000Z', 'Z')), `Invalid ${label}`); return parsed; }
function exactDate(value, label) { demand(typeof value === 'string' && DATE.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value), `Invalid ${label}`); return value; }
function exactIdentity(value, label = 'external worker identity') {
  for (const [key, expected] of Object.entries(EXTERNAL_WORKER_IDENTITY)) demand(value[key] === expected, `Unexpected ${label} ${key}`);
}
export function validateExternalWorkerGrantBody(grant) {
  exactKeys(grant, ['contract', 'id', 'worker', 'mode', 'hostIdentitySha256', 'releaseSha', 'generation', 'tenantId', 'tenantSlug', 'sourceId', 'storeId', 'domain', 'clubId', 'customerStage', 'executionRevision', 'profileRevision', 'storeRevision', 'secretSha256', 'issuedAt', 'expiresAt', 'businessDate'], 'external worker grant');
  demand(grant.contract === EXTERNAL_WORKER_GRANT_CONTRACT && UUID.test(grant.id ?? '') && ['CANARY', 'TIMER'].includes(grant.mode) && SHA.test(grant.hostIdentitySha256 ?? '') && RELEASE.test(grant.releaseSha ?? '') && Number.isSafeInteger(grant.generation) && grant.generation >= 0 && SHA.test(grant.secretSha256 ?? ''), 'Invalid external worker grant identity');
  exactIdentity(grant, 'external grant'); positive(grant.executionRevision, 'execution revision'); positive(grant.profileRevision, 'profile revision'); nonnegative(grant.storeRevision, 'store revision');
  const start = exactUtc(grant.issuedAt, 'grant issued timestamp'), end = exactUtc(grant.expiresAt, 'grant expiry timestamp');
  demand(end > start && end - start <= (grant.mode === 'CANARY' ? 4 * 3600000 : 90 * 86400000), 'External worker grant interval exceeds mode limit');
  if (grant.mode === 'CANARY') exactDate(grant.businessDate, 'CANARY business date'); else demand(grant.businessDate === null, 'TIMER grant must not carry a business date');
  return { grant, start, end };
}

export function validateExternalWorkerProfile(secretBytes, grant) {
  const profile = JSON.parse(secretBytes);
  demand(profile && typeof profile === 'object' && !Array.isArray(profile), 'External worker profile must be an object');
  const allowed = new Set(PROFILE_KEYS); if (grant.mode === 'CANARY') allowed.add('LANGAME_EXTERNAL_WORKER_DATE');
  for (const key of Object.keys(profile)) demand(allowed.has(key), `External worker profile has forbidden key: ${key}`);
  for (const key of REQUIRED_PROFILE_KEYS) demand(typeof profile[key] === 'string', `External worker profile is missing ${key}`);
  demand(!Object.hasOwn(profile, 'RUN_ID') && (grant.mode === 'CANARY' ? typeof profile.LANGAME_EXTERNAL_WORKER_DATE === 'string' : !Object.hasOwn(profile, 'LANGAME_EXTERNAL_WORKER_DATE')), 'External worker profile has invalid run/date field');
  for (const flag of SCHEDULERS) demand(profile[flag] === 'false', `External worker scheduler is enabled: ${flag}`);
  demand(profile.LANGAME_EXTERNAL_WORKER_ENABLED === 'true' && profile.LANGAME_EXTERNAL_WORKER_LIVE === 'true' && profile.LANGAME_EXTERNAL_WORKER_MODE === grant.mode && profile.LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION === String(grant.executionRevision) && profile.LANGAME_EXTERNAL_WORKER_PROFILE_REVISION === String(grant.profileRevision) && profile.LANGAME_EXTERNAL_WORKER_STORE_REVISION === String(grant.storeRevision), 'External worker profile revision/mode drift');
  for (const [name, key] of [['tenantId', 'LANGAME_EXTERNAL_WORKER_TENANT_ID'], ['tenantSlug', 'LANGAME_EXTERNAL_WORKER_TENANT_SLUG'], ['sourceId', 'LANGAME_EXTERNAL_WORKER_SOURCE_ID'], ['storeId', 'LANGAME_EXTERNAL_WORKER_STORE_ID'], ['domain', 'LANGAME_EXTERNAL_WORKER_DOMAIN'], ['clubId', 'LANGAME_EXTERNAL_WORKER_CLUB_ID'], ['customerStage', 'LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE']]) demand(profile[key] === grant[name], `External worker profile ${name} drift`);
  demand(!Object.hasOwn(profile, 'LANGAME_DISCREPANCY_LOG_ROOT') || profile.LANGAME_DISCREPANCY_LOG_ROOT === '/var/lib/leetplus/langame-sync', 'External worker discrepancy log root drift');
  demand(profile.INTEGRATION_ENCRYPTION_KEY.length > 0 && profile.APP_ENCRYPTION_KEY.length > 0, 'External worker encryption key is empty');
  if (grant.mode === 'CANARY') demand(profile.LANGAME_EXTERNAL_WORKER_DATE === grant.businessDate, 'External worker CANARY date drift');
  const url = new URL(profile.DATABASE_URL);
  demand(['postgresql:', 'postgres:'].includes(url.protocol) && decodeURIComponent(url.username) === 'leetplus_runtime' && url.hostname === 'postgres' && url.pathname === '/leetplus', 'External worker DB role/scope drift');
  const expected = { schema: 'public', connection_limit: '1', pool_timeout: '5', connect_timeout: '5', sslmode: 'require', sslcert: '/run/secrets/db-ca.pem', sslaccept: 'strict' };
  for (const [key, value] of Object.entries(expected)) demand(url.searchParams.get(key) === value && url.searchParams.getAll(key).length === 1, `External worker DB option drift: ${key}`);
  for (const key of url.searchParams.keys()) demand(Object.hasOwn(expected, key), 'External worker DB option is not allowed');
  return profile;
}

export function validateExternalWorkerGrant(envelope, publicKey, active, hostIdentitySha256, secretBytes, now = Date.now(), { allowExpired = false } = {}) {
  exactKeys(envelope, ['grant', 'signature'], 'external worker grant envelope');
  const { grant, start, end } = validateExternalWorkerGrantBody(envelope.grant);
  demand(active && grant.releaseSha === active[active.activeSlot]?.releaseSha && grant.generation === active.generation && grant.hostIdentitySha256 === hostIdentitySha256, 'Stale external worker release/generation/host grant');
  demand(typeof envelope.signature === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(envelope.signature) && crypto.verify(null, Buffer.from(canonical(grant)), publicKey, Buffer.from(envelope.signature, 'base64')), 'Invalid external worker signature');
  demand(start <= now + 30000 && (allowExpired || end > now), 'External worker grant expired or starts too far in the future');
  demand(digest(secretBytes) === grant.secretSha256, 'External worker secret profile changed');
  validateExternalWorkerProfile(secretBytes, grant);
  return grant;
}

export function validateExternalWorkerResult(value, { runId, grant, businessDate, allowReplayed = false } = {}) {
  exactKeys(value, ['contract', 'worker', 'runId', 'mode', 'businessDate', 'tenantId', 'tenantSlug', 'sourceId', 'storeId', 'profileRevision', 'executionRevision', 'storeRevision', 'decision', 'partialScopes', 'failedScopes', 'replayed', 'originalRunId'], 'external worker result');
  exactDate(businessDate, 'native result business date');
  const expectedBusinessDate = grant?.mode === 'CANARY' ? grant.businessDate : businessDate;
  demand(value.contract === EXTERNAL_WORKER_RESULT_CONTRACT && UUID.test(value.runId ?? '') && UUID.test(runId ?? '') && value.mode === grant?.mode && value.businessDate === expectedBusinessDate && ['SUCCESS', 'PARTIAL', 'FAILED'].includes(value.decision) && typeof value.replayed === 'boolean', 'Invalid external worker result');
  demand(value.worker === EXTERNAL_WORKER_IDENTITY.worker && value.tenantId === EXTERNAL_WORKER_IDENTITY.tenantId && value.tenantSlug === EXTERNAL_WORKER_IDENTITY.tenantSlug && value.sourceId === EXTERNAL_WORKER_IDENTITY.sourceId && value.storeId === EXTERNAL_WORKER_IDENTITY.storeId, 'Unexpected external result identity');
  demand(value.profileRevision === grant.profileRevision && value.executionRevision === grant.executionRevision && value.storeRevision === grant.storeRevision, 'External worker result revision drift');
  positive(value.profileRevision, 'result profile revision'); positive(value.executionRevision, 'result execution revision'); nonnegative(value.storeRevision, 'result store revision');
  demand(Array.isArray(value.partialScopes) && Array.isArray(value.failedScopes) && value.partialScopes.every(scope => typeof scope === 'string') && value.failedScopes.every(scope => typeof scope === 'string'), 'Invalid external worker result scopes');
  if (value.decision === 'SUCCESS') demand(value.partialScopes.length === 0 && value.failedScopes.length === 0, 'SUCCESS result must have no failed or partial scopes');
  if (value.decision === 'PARTIAL') demand(value.partialScopes.length > 0 && value.failedScopes.length === 0, 'PARTIAL result must have partial scopes only');
  if (value.decision === 'FAILED') demand(value.failedScopes.length > 0, 'FAILED result requires failed scopes');
  const scopes = new Set(['BUSINESS_FACTS', 'GUEST_FOUNDATION', 'STAFF_SHIFTS', 'BUSINESS_SNAPSHOTS']);
  demand(new Set(value.partialScopes).size === value.partialScopes.length && new Set(value.failedScopes).size === value.failedScopes.length &&
    value.partialScopes.every(scope => scopes.has(scope)) &&
    value.failedScopes.every(scope => scopes.has(scope) || scope === 'SCOPE_OR_DATE_MISMATCH'), 'External result scope widened');
  if (value.replayed) { demand(UUID.test(value.originalRunId ?? '') && value.runId === value.originalRunId && value.runId !== runId && allowReplayed, 'Replayed external worker result is not accepted'); }
  else demand(value.runId === runId && value.originalRunId === null, 'Fresh external worker result run binding drift');
  return value;
}

export function parseExternalWorkerResult(stdout, context) {
  demand(typeof stdout === 'string' && stdout.endsWith('\n'), 'External worker stdout must be one exact JSON result');
  let value; try { value = JSON.parse(stdout); } catch { throw new Error('External worker stdout is not JSON'); }
  demand(`${JSON.stringify(value)}\n` === stdout, 'External worker stdout is not one exact JSON line');
  return validateExternalWorkerResult(value, context);
}
