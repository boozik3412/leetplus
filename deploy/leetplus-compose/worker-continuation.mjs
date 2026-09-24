import { canonical, digest, demand } from './contract.mjs';
import { validateWorkerGrant } from './worker-authority.mjs';

export const WORKERS = ['bonus-ledger-worker', 'langame-daily-worker'];
export const TIMER_UNITS = { 'bonus-ledger-worker': 'leetplus-compose-bonus.timer', 'langame-daily-worker': 'leetplus-compose-daily.timer' };
export const CONTRACT = 'LEETPLUS_WORKER_CONTINUATION_V2';
const SHA = /^[a-f0-9]{64}$/;
const RELEASE = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const exactKeys = (value, keys, label) => demand(value && Object.keys(value).sort().join(',') === [...keys].sort().join(','), `Invalid ${label} fields`);
const ordered = list => demand(canonical(list.map(value => value.worker)) === canonical(WORKERS), 'Worker bindings must use the fixed native order');

function validateGrantBody(grant, label) {
  exactKeys(grant, ['contract', 'worker', 'mode', 'id', 'hostIdentitySha256', 'releaseSha', 'generation', 'tenantSlug', 'secretSha256', 'issuedAt', 'expiresAt'], label);
  demand(grant.contract === 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_WORKER_GRANT' && WORKERS.includes(grant.worker) && grant.mode === 'TIMER' && UUID.test(grant.id ?? '') && SHA.test(grant.hostIdentitySha256 ?? '') && RELEASE.test(grant.releaseSha ?? '') && Number.isSafeInteger(grant.generation) && grant.generation >= 0 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(grant.tenantSlug ?? '') && SHA.test(grant.secretSha256 ?? '') && Number.isFinite(Date.parse(grant.issuedAt ?? '')) && Number.isFinite(Date.parse(grant.expiresAt ?? '')), `Invalid ${label}`);
  return grant;
}

function validateEnvelope(envelope, label) {
  exactKeys(envelope, ['grant', 'signature'], label);
  validateGrantBody(envelope.grant, `${label} grant`);
  demand(typeof envelope.signature === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(envelope.signature), `Invalid ${label} signature`);
  return envelope;
}

function derived(original, id, releaseSha, generation) {
  demand(UUID.test(id ?? '') && id !== original.id, 'Frozen derived worker grant ID required');
  return { ...original, id, releaseSha, generation };
}

export function validateWorkerContinuationPolicy(policy) {
  exactKeys(policy, ['contract', 'owner', 'originalTimers', 'originalGrantEnvelopes', 'profileBindings', 'forward', 'rollback'], 'worker continuation');
  demand(policy.contract === CONTRACT && policy.owner === 'NATIVE_WORKER_CONTROLLER', 'Worker continuation V2 and native owner are required');
  for (const timer of policy.originalTimers ?? []) exactKeys(timer, ['worker', 'unit', 'enabled', 'active'], 'original timer binding');
  demand(Array.isArray(policy.originalTimers) && policy.originalTimers.length === WORKERS.length && policy.originalTimers.every(timer => WORKERS.includes(timer.worker) && timer.unit === TIMER_UNITS[timer.worker] && typeof timer.enabled === 'boolean' && typeof timer.active === 'boolean'), 'Invalid original timer bindings');
  demand(Array.isArray(policy.originalGrantEnvelopes) && policy.originalGrantEnvelopes.length === WORKERS.length, 'Two original worker grant envelopes are required');
  for (const envelope of policy.originalGrantEnvelopes) validateEnvelope(envelope, 'original worker grant envelope');
  for (const binding of policy.profileBindings ?? []) exactKeys(binding, ['worker', 'profileSha256'], 'profile binding');
  demand(Array.isArray(policy.profileBindings) && policy.profileBindings.length === WORKERS.length && policy.profileBindings.every(binding => WORKERS.includes(binding.worker) && SHA.test(binding.profileSha256 ?? '')), 'Invalid worker profile bindings');
  for (const stage of ['forward', 'rollback']) {
    const value = policy[stage];
    exactKeys(value, ['generation', 'releaseSha', 'grants'], `${stage} continuation`);
    demand(Number.isSafeInteger(value.generation) && value.generation >= 0 && RELEASE.test(value.releaseSha ?? '') && Array.isArray(value.grants) && value.grants.length === WORKERS.length, `Invalid ${stage} continuation`);
    for (const grant of value.grants) validateGrantBody(grant, `${stage} derived grant`);
  }
  for (const list of [policy.originalTimers, policy.originalGrantEnvelopes.map(value => value.grant), policy.profileBindings, policy.forward.grants, policy.rollback.grants]) {
    demand(new Set(list.map(value => value.worker)).size === WORKERS.length, 'Duplicate or missing worker binding'); ordered(list);
  }
  const originals = Object.fromEntries(policy.originalGrantEnvelopes.map(envelope => [envelope.grant.worker, envelope.grant]));
  const profiles = Object.fromEntries(policy.profileBindings.map(binding => [binding.worker, binding]));
  for (const worker of WORKERS) {
    const original = originals[worker];
    demand(original.secretSha256 === profiles[worker].profileSha256, `Original grant/profile digest mismatch: ${worker}`);
    for (const stage of ['forward', 'rollback']) {
      const grant = policy[stage].grants.find(value => value.worker === worker);
      demand(grant.id !== original.id && grant.mode === original.mode && grant.hostIdentitySha256 === original.hostIdentitySha256 && grant.tenantSlug === original.tenantSlug && grant.secretSha256 === original.secretSha256 && grant.expiresAt === original.expiresAt && grant.issuedAt === original.issuedAt && grant.releaseSha === policy[stage].releaseSha && grant.generation === policy[stage].generation, `Derived ${stage} grant widens or drifts: ${worker}`);
    }
    demand(policy.forward.grants.find(value => value.worker === worker).id !== policy.rollback.grants.find(value => value.worker === worker).id, `Forward/rollback grant IDs must differ: ${worker}`);
  }
  return policy;
}

export function deriveWorkerContinuation({ originalTimers, originalGrantEnvelopes, profileBindings, targetReleaseSha, currentGeneration, previousReleaseSha, forwardGrantIds, rollbackGrantIds }) {
  demand(RELEASE.test(targetReleaseSha ?? '') && RELEASE.test(previousReleaseSha ?? '') && Number.isSafeInteger(currentGeneration) && currentGeneration >= 0, 'Invalid worker continuation derivation target');
  const originals = originalGrantEnvelopes.map(envelope => validateEnvelope(envelope, 'original worker grant envelope'));
  demand(Array.isArray(forwardGrantIds) && forwardGrantIds.length === WORKERS.length && Array.isArray(rollbackGrantIds) && rollbackGrantIds.length === WORKERS.length, 'Two frozen forward and rollback worker grant IDs are required');
  const policy = { contract: CONTRACT, owner: 'NATIVE_WORKER_CONTROLLER', originalTimers, originalGrantEnvelopes, profileBindings,
    forward: { generation: currentGeneration + 1, releaseSha: targetReleaseSha, grants: originals.map((envelope, index) => derived(envelope.grant, forwardGrantIds[index], targetReleaseSha, currentGeneration + 1)) },
    rollback: { generation: currentGeneration + 2, releaseSha: previousReleaseSha, grants: originals.map((envelope, index) => derived(envelope.grant, rollbackGrantIds[index], previousReleaseSha, currentGeneration + 2)) } };
  return validateWorkerContinuationPolicy(policy);
}

function validateSignedStage(policy, stage, signedEnvelopes, { publicKey, current, hostIdentitySha256, profiles, now = Date.now(), allowExpired = false }) {
  validateWorkerContinuationPolicy(policy);
  demand(Array.isArray(signedEnvelopes) && signedEnvelopes.length === WORKERS.length, `Two signed ${stage} worker grants are required`);
  const expected = policy[stage].grants;
  for (let index = 0; index < WORKERS.length; index++) {
    const envelope = validateEnvelope(signedEnvelopes[index], `signed ${stage} worker grant`), grant = envelope.grant, worker = WORKERS[index];
    demand(grant.worker === worker && canonical(grant) === canonical(expected[index]), `Signed ${stage} worker grant differs from frozen plan: ${worker}`);
    validateWorkerGrant(envelope, publicKey, current, hostIdentitySha256, profiles[worker], now, { allowExpired });
  }
  return signedEnvelopes;
}

export function validateCurrentWorkerContinuation(policy, signedEnvelopes, context) {
  validateWorkerContinuationPolicy(policy);
  demand(Array.isArray(signedEnvelopes) && signedEnvelopes.length === WORKERS.length, 'Two signed current worker grants are required');
  for (let index = 0; index < WORKERS.length; index++) {
    const envelope = validateEnvelope(signedEnvelopes[index], 'signed current worker grant'), expected = policy.originalGrantEnvelopes[index], worker = WORKERS[index];
    demand(envelope.grant.worker === worker && digest(envelope) === digest(expected), `Signed current worker grant differs from frozen original: ${worker}`);
    validateWorkerGrant(envelope, context.publicKey, context.current, context.hostIdentitySha256, context.profiles[worker], context.now, { allowExpired: context.allowExpired });
  }
  return signedEnvelopes;
}
export const validateForwardWorkerContinuation = (policy, signedEnvelopes, context) => validateSignedStage(policy, 'forward', signedEnvelopes, context);
export const validateRollbackWorkerContinuation = (policy, signedEnvelopes, context) => validateSignedStage(policy, 'rollback', signedEnvelopes, context);
