import { canonical, demand, digest, EXTERNAL_WORKER_CAPABILITY } from './contract.mjs';
import { EXTERNAL_WORKER_IDENTITY, validateExternalWorkerGrant } from './external-worker-contract.mjs';
import { validateCurrentWorkerContinuation, validateForwardWorkerContinuation, validateRollbackWorkerContinuation, validateWorkerContinuationPolicy } from './worker-continuation.mjs';

export const WORKER_SET_V3_CONTRACT = 'LEETPLUS_WORKER_SET_V3';
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const RELEASE = /^[a-f0-9]{40}$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const STATES = new Set(['ACTIVE', 'DORMANT', 'ABSENT_UNSUPPORTED']);
const exactKeys = (value, keys, label) => demand(value && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(','), `Invalid ${label} fields`);
const policyOf = value => value?.workerSetV3 ?? value?.workerSet ?? value;
const stageName = stage => ({ CURRENT: 'originalGrantEnvelope', FORWARD: 'forward', ROLLBACK: 'rollback' }[stage]);
const capability = release => release?.externalWorkerCapability === EXTERNAL_WORKER_CAPABILITY;
const expectedState = (preimage, release) => !capability(release) ? 'ABSENT_UNSUPPORTED' : preimage === 'ABSENT_AUTHORITY' ? 'DORMANT' : 'ACTIVE';

function externalBody(grant, label) {
  exactKeys(grant, ['contract', 'id', 'worker', 'mode', 'hostIdentitySha256', 'releaseSha', 'generation', 'tenantId', 'tenantSlug', 'sourceId', 'storeId', 'domain', 'clubId', 'customerStage', 'executionRevision', 'profileRevision', 'storeRevision', 'secretSha256', 'issuedAt', 'expiresAt', 'businessDate'], label);
  demand(grant.contract === 'LEETPLUS_LANGAME_EXTERNAL_WORKER_GRANT_V1' && UUID.test(grant.id ?? '') && grant.mode === 'TIMER' && grant.businessDate === null && RELEASE.test(grant.releaseSha ?? '') && Number.isSafeInteger(grant.generation) && grant.generation >= 0 && SHA.test(grant.hostIdentitySha256 ?? '') && SHA.test(grant.secretSha256 ?? '') && Number.isSafeInteger(grant.executionRevision) && grant.executionRevision > 0 && Number.isSafeInteger(grant.profileRevision) && grant.profileRevision > 0 && Number.isSafeInteger(grant.storeRevision) && grant.storeRevision >= 0, `Invalid ${label}`);
  const issued = Date.parse(grant.issuedAt ?? ''), expires = Date.parse(grant.expiresAt ?? '');
  demand(UTC.test(grant.issuedAt ?? '') && UTC.test(grant.expiresAt ?? '') && Number.isFinite(issued) && Number.isFinite(expires) && expires > issued && expires - issued <= 90 * 86400000, `Invalid ${label} interval`);
  for (const [key, expected] of Object.entries(EXTERNAL_WORKER_IDENTITY)) demand(grant[key] === expected, `External worker identity drift: ${key}`);
}
function externalEnvelope(envelope, label) {
  exactKeys(envelope, ['grant', 'signature'], label); externalBody(envelope.grant, `${label} grant`);
  demand(typeof envelope.signature === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(envelope.signature), `Missing ${label} signature`);
}
function validateExternal(external, plan) {
  exactKeys(external, ['worker', 'preimage', 'originalGrantEnvelope', 'profileSha256', 'enrollmentReceiptSha256', 'originalTimer', 'forward', 'rollback'], 'V3 external worker');
  demand(external.worker === EXTERNAL_WORKER_IDENTITY.worker && ['ABSENT_AUTHORITY', 'PRESENT'].includes(external.preimage), 'Invalid V3 external worker preimage');
  exactKeys(external.originalTimer, ['unit', 'loadState', 'enabled', 'active', 'subState'], 'V3 external original timer');
  demand(external.originalTimer.unit === 'leetplus-compose-external-daily.timer' && ['loaded', 'not-found'].includes(external.originalTimer.loadState) && typeof external.originalTimer.enabled === 'boolean' && typeof external.originalTimer.active === 'boolean' && ['waiting', 'dead'].includes(external.originalTimer.subState) && (external.originalTimer.active ? external.originalTimer.subState === 'waiting' : external.originalTimer.subState === 'dead'), 'Invalid V3 external original timer state');
  for (const stage of ['forward', 'rollback']) { exactKeys(external[stage], ['state', 'grant'], `V3 external ${stage}`); demand(STATES.has(external[stage].state), `Invalid V3 external ${stage} state`); if (external[stage].grant !== null) externalBody(external[stage].grant, `V3 external ${stage} grant`); }
  if (external.preimage === 'ABSENT_AUTHORITY') {
    demand(external.originalGrantEnvelope === null && external.profileSha256 === null && external.enrollmentReceiptSha256 === null && !external.originalTimer.enabled && !external.originalTimer.active && external.forward.grant === null && external.rollback.grant === null && external.forward.state !== 'ACTIVE' && external.rollback.state !== 'ACTIVE', 'Absent external authority may not activate a worker');
    return external;
  }
  externalEnvelope(external.originalGrantEnvelope, 'original external worker grant');
  demand(external.originalTimer.loadState === 'loaded', 'Present external authority requires a loaded timer');
  demand(SHA.test(external.profileSha256 ?? '') && SHA.test(external.enrollmentReceiptSha256 ?? ''), 'Present external authority requires profile and enrollment evidence');
  const original = external.originalGrantEnvelope.grant;
  demand(original.secretSha256 === external.profileSha256, 'External original grant/profile digest drift');
  for (const stage of ['forward', 'rollback']) {
    const value = external[stage];
    if (value.state === 'ACTIVE') {
      demand(value.grant !== null, `ACTIVE external ${stage} requires a grant`);
      const grant = value.grant;
      for (const key of Object.keys(original)) if (!['id', 'releaseSha', 'generation'].includes(key)) demand(grant[key] === original[key], `External ${stage} grant widens or drifts: ${key}`);
      demand(grant.id !== original.id, `External ${stage} ID must differ from original`);
    } else demand(value.grant === null, `Inactive external ${stage} must not carry a grant`);
  }
  return external;
}

export function validateWorkerSetV3(value, plan = value) {
  const policy = policyOf(value);
  exactKeys(policy, ['contract', 'owner', 'legacy', 'external'], 'worker set V3');
  demand(policy.contract === WORKER_SET_V3_CONTRACT && policy.owner === 'NATIVE_WORKER_CONTROLLER', 'Worker set V3 and native owner are required');
  validateWorkerContinuationPolicy(policy.legacy);
  const external = validateExternal(policy.external, plan);
  const releases = { forward: plan?.[plan?.targetSlot], rollback: plan?.previous?.[plan?.previous?.activeSlot] };
  demand((releases.forward || external.forward.state !== 'ACTIVE') && (releases.rollback || external.rollback.state !== 'ACTIVE'), 'Active external worker state requires a plan-bound capability marker');
  if (releases.forward) {
    demand(!Object.hasOwn(releases.forward, 'externalWorkerCapability') || capability(releases.forward), 'Unknown external worker capability marker');
    demand(policy.legacy.forward.releaseSha === releases.forward.releaseSha && policy.legacy.forward.generation === plan.generation + 1, 'Legacy forward release/generation drift');
    demand(external.forward.state === expectedState(external.preimage, releases.forward), 'External forward capability state drift');
    if (external.forward.state === 'ACTIVE') demand(external.forward.grant.releaseSha === policy.legacy.forward.releaseSha && external.forward.grant.generation === policy.legacy.forward.generation, 'External forward release/generation drift');
  }
  if (releases.rollback) {
    demand(!Object.hasOwn(releases.rollback, 'externalWorkerCapability') || capability(releases.rollback), 'Unknown external worker capability marker');
    demand(policy.legacy.rollback.releaseSha === releases.rollback.releaseSha && policy.legacy.rollback.generation === plan.generation + 2, 'Legacy rollback release/generation drift');
    demand(external.rollback.state === expectedState(external.preimage, releases.rollback), 'External rollback capability state drift');
    if (external.rollback.state === 'ACTIVE') demand(external.rollback.grant.releaseSha === policy.legacy.rollback.releaseSha && external.rollback.grant.generation === policy.legacy.rollback.generation, 'External rollback release/generation drift');
  }
  return policy;
}

export function deriveWorkerSetV3({ legacy, external, forwardRelease, rollbackRelease, forwardGrantId = null, rollbackGrantId = null }) {
  validateWorkerContinuationPolicy(legacy);
  demand(forwardRelease?.releaseSha === legacy.forward.releaseSha && rollbackRelease?.releaseSha === legacy.rollback.releaseSha, 'V3 release must retain legacy V2 release identity');
  const value = { contract: WORKER_SET_V3_CONTRACT, owner: 'NATIVE_WORKER_CONTROLLER', legacy, external: structuredClone(external) };
  if (value.external.preimage === 'PRESENT') {
    const original = value.external.originalGrantEnvelope?.grant;
    const derive = (release, id, generation) => { demand(UUID.test(id ?? '') && id !== original.id, 'Frozen external worker grant ID required'); return { ...original, id, releaseSha: release.releaseSha, generation }; };
    value.external.forward = capability(forwardRelease) ? { state: 'ACTIVE', grant: derive(forwardRelease, forwardGrantId, legacy.forward.generation) } : { state: 'ABSENT_UNSUPPORTED', grant: null };
    value.external.rollback = capability(rollbackRelease) ? { state: 'ACTIVE', grant: derive(rollbackRelease, rollbackGrantId, legacy.rollback.generation) } : { state: 'ABSENT_UNSUPPORTED', grant: null };
  } else {
    value.external.forward = { state: capability(forwardRelease) ? 'DORMANT' : 'ABSENT_UNSUPPORTED', grant: null };
    value.external.rollback = { state: capability(rollbackRelease) ? 'DORMANT' : 'ABSENT_UNSUPPORTED', grant: null };
  }
  return validateWorkerSetV3(value, { targetSlot: 'forward', forward: forwardRelease, previous: { activeSlot: 'rollback', rollback: rollbackRelease }, generation: legacy.forward.generation - 1 });
}

export function workerSetNames(value) { const policy = validateWorkerSetV3(value); return [...policy.legacy.originalTimers.map(value => value.worker), policy.external.worker]; }

export function validateWorkerSetEnvelopes(value, { plan = value, stage, legacyEnvelopes, externalEnvelope: signedExternal = null,
  publicKey, externalPublicKey, active, hostIdentitySha256, profiles, externalProfile, now, allowExpired = false } = {}) {
  const policy = validateWorkerSetV3(value, plan);
  demand(['CURRENT', 'FORWARD', 'ROLLBACK'].includes(stage), 'Invalid worker set stage');
  const legacyValidator = stage === 'CURRENT' ? validateCurrentWorkerContinuation : stage === 'FORWARD' ? validateForwardWorkerContinuation : validateRollbackWorkerContinuation;
  legacyValidator(policy.legacy, legacyEnvelopes, { publicKey, current: active, hostIdentitySha256, profiles, now, allowExpired });
  const external = policy.external;
  demand(external.preimage !== 'PRESENT' && external.forward.state !== 'ACTIVE' && external.rollback.state !== 'ACTIVE' ||
    externalPublicKey && digest(externalPublicKey) !== digest(publicKey), 'Dedicated external worker public root is required');
  if (stage === 'CURRENT') {
    demand(external.preimage === 'ABSENT_AUTHORITY' ? signedExternal === null : signedExternal !== null, 'External current authority envelope mismatch');
    if (signedExternal) { demand(digest(signedExternal) === digest(external.originalGrantEnvelope), 'External current grant differs from frozen original'); validateExternalWorkerGrant(signedExternal, externalPublicKey, active, hostIdentitySha256, externalProfile, now, { allowExpired }); }
  } else {
    const binding = external[stageName(stage)];
    demand(binding.state === 'ACTIVE' ? signedExternal !== null : signedExternal === null, 'External worker activation envelope mismatch');
    if (signedExternal) { externalEnvelope(signedExternal, `signed external ${stage}`); demand(canonical(signedExternal.grant) === canonical(binding.grant), 'Signed external worker grant differs from frozen plan'); validateExternalWorkerGrant(signedExternal, externalPublicKey, active, hostIdentitySha256, externalProfile, now, { allowExpired }); }
  }
  return policy;
}
