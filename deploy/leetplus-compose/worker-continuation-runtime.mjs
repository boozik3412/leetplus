import { canonical, demand, digest } from './contract.mjs';
import {
  TIMER_UNITS,
  WORKERS,
  validateCurrentWorkerContinuation,
  validateForwardWorkerContinuation,
  validateRollbackWorkerContinuation,
  validateWorkerContinuationPolicy,
} from './worker-continuation.mjs';

export const RUNTIME_CONTRACT = 'LEETPLUS_WORKER_CONTINUATION_RUNTIME_V1';
const INTENT_CONTRACT = `${RUNTIME_CONTRACT}_INTENT`;
const RECEIPT_CONTRACT = `${RUNTIME_CONTRACT}_RECEIPT`;
const MODES = ['FORWARD', 'ROLLBACK', 'ABORT_UNCOMMITTED'];

const envelopeDigests = envelopes => WORKERS.map((worker, index) => ({ worker, sha256: digest(envelopes[index]) }));
const timerBindings = policy => policy.originalTimers.map(timer => ({ ...timer }));

function requireAdapters(adapters) {
  for (const name of ['readGrant', 'writeGrantAtomic', 'readTimer', 'systemctl', 'readLifecycle', 'publish', 'assertExclusiveLock']) {
    demand(typeof adapters?.[name] === 'function', `Missing worker continuation adapter: ${name}`);
  }
  return adapters;
}

function activeIdentity(current) {
  demand(current && ['blue', 'green'].includes(current.activeSlot) && Number.isSafeInteger(current.generation), 'Invalid active worker continuation state');
  const releaseSha = current[current.activeSlot]?.releaseSha;
  demand(/^[a-f0-9]{40}$/.test(releaseSha ?? ''), 'Active release identity is missing');
  return { generation: current.generation, activeSlot: current.activeSlot, releaseSha };
}

function validatePlanPolicy(plan) {
  demand(plan?.action === 'ROLLOUT' && plan.previous && ['blue', 'green'].includes(plan.targetSlot) &&
    /^[a-f0-9-]{36}$/.test(plan.operationId ?? '') && Number.isSafeInteger(plan.generation),
  'Worker continuation requires an exact rollout plan');
  const policy = validateWorkerContinuationPolicy(plan.workerContinuation);
  const previousSlot = plan.previous.activeSlot;
  demand(policy.forward.generation === plan.generation + 1 && policy.forward.releaseSha === plan[plan.targetSlot].releaseSha &&
    policy.rollback.generation === plan.generation + 2 && policy.rollback.releaseSha === plan[previousSlot].releaseSha,
  'Worker continuation generations/releases do not bind the plan');
  return policy;
}

function stageCurrent(plan, stage) {
  const policy = plan.workerContinuation;
  const activeSlot = stage === 'forward' ? plan.targetSlot : plan.previous.activeSlot;
  return { activeSlot, generation: policy[stage].generation, [activeSlot]: { releaseSha: policy[stage].releaseSha } };
}

function validateContext(context) {
  demand(context?.publicKey && /^[a-f0-9]{64}$/.test(context.hostIdentitySha256 ?? '') && context.profiles &&
    WORKERS.every(worker => Buffer.isBuffer(context.profiles[worker])),
  'Worker continuation signature/profile context is incomplete');
  return context;
}

function validateStaged(plan, forwardEnvelopes, rollbackEnvelopes, context) {
  const policy = validatePlanPolicy(plan);
  validateContext(context);
  const common = { publicKey: context.publicKey, hostIdentitySha256: context.hostIdentitySha256,
    profiles: context.profiles, now: context.now ?? Date.now() };
  validateForwardWorkerContinuation(policy, forwardEnvelopes, { ...common, current: stageCurrent(plan, 'forward') });
  validateRollbackWorkerContinuation(policy, rollbackEnvelopes, { ...common, current: stageCurrent(plan, 'rollback') });
  return policy;
}

function validateOriginalCurrent(plan, context) {
  demand(canonical(context.current) === canonical(plan.previous), 'Original active state differs from the immutable plan');
}

function timerState(state, unit) {
  demand(state?.unit === unit && state.loadState === 'loaded' && typeof state.enabled === 'boolean' &&
    typeof state.active === 'boolean' && (state.active ? state.subState === 'waiting' : state.subState === 'dead'),
  `Invalid timer observation: ${unit}`);
  return state;
}

function timerMatches(binding, state) {
  return state.enabled === binding.enabled && state.active === binding.active;
}

async function readTimers(policy, adapters) {
  const result = [];
  for (const binding of policy.originalTimers) {
    demand(binding.unit === TIMER_UNITS[binding.worker], `Unexpected timer binding: ${binding.worker}`);
    result.push({ worker: binding.worker, ...timerState(await adapters.readTimer(binding.unit), binding.unit) });
  }
  return result;
}

async function readGrants(adapters) {
  return Promise.all(WORKERS.map(worker => adapters.readGrant(worker)));
}

function sameEnvelope(left, right) {
  return canonical(left) === canonical(right);
}

function assertIntent(intent, plan, forwardEnvelopes, rollbackEnvelopes, mode = 'FORWARD') {
  const expected = buildIntent(plan, forwardEnvelopes, rollbackEnvelopes, mode);
  demand(canonical(intent) === canonical(expected), `Invalid ${mode} worker continuation intent`);
  return intent;
}

function buildIntent(plan, forwardEnvelopes, rollbackEnvelopes, mode = 'FORWARD') {
  const policy = validatePlanPolicy(plan);
  return {
    contract: INTENT_CONTRACT,
    mode,
    operationId: plan.operationId,
    planSha256: digest(plan),
    policySha256: digest(policy),
    originalTimers: timerBindings(policy),
    originalGrantEnvelopeSha256: envelopeDigests(policy.originalGrantEnvelopes),
    forwardGrantEnvelopeSha256: envelopeDigests(forwardEnvelopes),
    rollbackGrantEnvelopeSha256: envelopeDigests(rollbackEnvelopes),
  };
}

function stageForMode(plan, mode) {
  if (mode === 'FORWARD') return { stage: 'forward', generation: plan.workerContinuation.forward.generation,
    releaseSha: plan.workerContinuation.forward.releaseSha, envelopes: null };
  if (mode === 'ROLLBACK') return { stage: 'rollback', generation: plan.workerContinuation.rollback.generation,
    releaseSha: plan.workerContinuation.rollback.releaseSha, envelopes: null };
  return { stage: 'original', generation: plan.generation, releaseSha: plan.previous[plan.previous.activeSlot].releaseSha,
    envelopes: plan.workerContinuation.originalGrantEnvelopes };
}

function validateActiveForMode(plan, mode, current) {
  const observed = activeIdentity(current), expected = stageForMode(plan, mode);
  const activeSlot = mode === 'FORWARD' ? plan.targetSlot : plan.previous.activeSlot;
  demand(observed.activeSlot === activeSlot && observed.generation === expected.generation && observed.releaseSha === expected.releaseSha,
    `${mode} active state does not bind the worker continuation plan`);
  return observed;
}

function receiptFor({ plan, mode, intent, envelopes, timers }) {
  const identity = stageForMode(plan, mode);
  return {
    contract: RECEIPT_CONTRACT,
    decision: 'PASS',
    mode,
    operationId: plan.operationId,
    planSha256: digest(plan),
    policySha256: digest(plan.workerContinuation),
    intentSha256: digest(intent),
    generation: identity.generation,
    releaseSha: identity.releaseSha,
    grantEnvelopeSha256: envelopeDigests(envelopes),
    timerPostimage: timers.map(timer => ({ worker: timer.worker, unit: timer.unit, enabled: timer.enabled, active: timer.active })),
  };
}

async function postimage(adapters, current) {
  return { current, grantEnvelopes: await readGrants(adapters), timers: await readTimers({ originalTimers: WORKERS.map(worker => ({ worker, unit: TIMER_UNITS[worker] })) }, adapters) };
}

function validatorForMode(mode) {
  if (mode === 'FORWARD') return validateForwardWorkerContinuation;
  if (mode === 'ROLLBACK') return validateRollbackWorkerContinuation;
  return validateCurrentWorkerContinuation;
}

export function validateWorkerContinuationReceipt({ plan, receipt, postimage: observed, context }) {
  const policy = validatePlanPolicy(plan), mode = receipt?.mode;
  demand(MODES.includes(mode), 'Invalid worker continuation receipt mode');
  const intentMode = mode === 'ROLLBACK' ? 'ROLLBACK' : 'FORWARD';
  const intent = assertIntent(mode === 'ROLLBACK' ? context.rollbackIntent : context.intent,
    plan, context.forwardEnvelopes, context.rollbackEnvelopes, intentMode);
  const expectedEnvelopes = mode === 'FORWARD' ? context.forwardEnvelopes
    : mode === 'ROLLBACK' ? context.rollbackEnvelopes : policy.originalGrantEnvelopes;
  const expected = receiptFor({ plan, mode, intent, envelopes: expectedEnvelopes, timers: policy.originalTimers.map(timer => ({ ...timer })) });
  demand(canonical(receipt) === canonical(expected), 'Worker continuation receipt does not bind the exact plan/postimage');
  validateActiveForMode(plan, mode, observed.current);
  const common = validateContext(context);
  validatorForMode(mode)(policy, observed.grantEnvelopes, { publicKey: common.publicKey, current: observed.current,
    hostIdentitySha256: common.hostIdentitySha256, profiles: common.profiles, now: common.now ?? Date.now(),
    allowExpired: context.allowExpired === true });
  demand(canonical(envelopeDigests(observed.grantEnvelopes)) === canonical(receipt.grantEnvelopeSha256), 'Worker grant postimage differs from receipt');
  const timers = observed.timers.map(timer => ({ worker: timer.worker, unit: timer.unit, enabled: timer.enabled, active: timer.active }));
  demand(canonical(timers) === canonical(receipt.timerPostimage) && canonical(timers) === canonical(timerBindings(policy)), 'Worker timer postimage differs from receipt');
  return receipt;
}

export async function preflightWorkerContinuation({ plan, forwardEnvelopes, rollbackEnvelopes, context, adapters }) {
  requireAdapters(adapters);
  const policy = validateStaged(plan, forwardEnvelopes, rollbackEnvelopes, context);
  validateOriginalCurrent(plan, context);
  const originalEnvelopes = await readGrants(adapters);
  validateCurrentWorkerContinuation(policy, originalEnvelopes, context);
  demand(canonical(envelopeDigests(originalEnvelopes)) === canonical(envelopeDigests(policy.originalGrantEnvelopes)), 'Original worker grant bytes drift');
  const timers = await readTimers(policy, adapters);
  for (let index = 0; index < policy.originalTimers.length; index++) {
    demand(timerMatches(policy.originalTimers[index], timers[index]), `Original timer drift: ${policy.originalTimers[index].worker}`);
  }
  return { plan, policy, forwardEnvelopes, rollbackEnvelopes, context, originalEnvelopes };
}

export async function stopOriginalWorkerTimers(preflight, adapters) {
  requireAdapters(adapters);
  await adapters.assertExclusiveLock();
  for (const binding of preflight.policy.originalTimers) {
    let state = timerState(await adapters.readTimer(binding.unit), binding.unit);
    demand(state.enabled === binding.enabled, `Timer enable state drift before stop: ${binding.worker}`);
    if (binding.active && state.active) await adapters.systemctl('stop', binding.unit);
    else if (!binding.active) demand(!state.active, `Originally inactive timer became active: ${binding.worker}`);
    state = timerState(await adapters.readTimer(binding.unit), binding.unit);
    demand(!state.active && state.enabled === binding.enabled, `Timer did not reach the stopped postimage: ${binding.worker}`);
  }
  return readTimers(preflight.policy, adapters);
}

async function installStageGrants(preflight, stage, allowedSource, adapters) {
  requireAdapters(adapters);
  await adapters.assertExclusiveLock();
  const desired = stage === 'forward' ? preflight.forwardEnvelopes : preflight.rollbackEnvelopes;
  for (let index = 0; index < WORKERS.length; index++) {
    const worker = WORKERS[index], current = await adapters.readGrant(worker);
    if (sameEnvelope(current, desired[index])) continue;
    demand(allowedSource.some(source => sameEnvelope(current, source[index])), `Ambiguous ${stage} grant state: ${worker}`);
    await adapters.writeGrantAtomic(worker, desired[index]);
    demand(sameEnvelope(await adapters.readGrant(worker), desired[index]), `Atomic ${stage} grant install did not persist: ${worker}`);
  }
  return readGrants(adapters);
}

export const installForwardWorkerGrants = (preflight, adapters) =>
  installStageGrants(preflight, 'forward', [preflight.policy.originalGrantEnvelopes], adapters);

export const installRollbackWorkerGrants = (preflight, adapters) =>
  installStageGrants(preflight, 'rollback', [preflight.policy.originalGrantEnvelopes, preflight.forwardEnvelopes], adapters);

export async function restoreOriginalWorkerTimers(preflight, adapters) {
  requireAdapters(adapters);
  await adapters.assertExclusiveLock();
  for (const binding of preflight.policy.originalTimers) {
    let state = timerState(await adapters.readTimer(binding.unit), binding.unit);
    if (state.enabled !== binding.enabled) await adapters.systemctl(binding.enabled ? 'enable' : 'disable', binding.unit);
    state = timerState(await adapters.readTimer(binding.unit), binding.unit);
    if (state.active !== binding.active) await adapters.systemctl(binding.active ? 'start' : 'stop', binding.unit);
    state = timerState(await adapters.readTimer(binding.unit), binding.unit);
    demand(timerMatches(binding, state), `Original timer state was not restored: ${binding.worker}`);
  }
  return readTimers(preflight.policy, adapters);
}

async function validateExistingReceipt({ plan, receipt, intent, rollbackIntent, forwardEnvelopes, rollbackEnvelopes, context, adapters }) {
  const observed = await postimage(adapters, context.current);
  return validateWorkerContinuationReceipt({ plan, receipt, postimage: observed,
    context: { ...context, intent, rollbackIntent, forwardEnvelopes, rollbackEnvelopes } });
}

async function continuationFromIntent({ plan, forwardEnvelopes, rollbackEnvelopes, context, adapters, allowStopped }) {
  const policy = validateStaged(plan, forwardEnvelopes, rollbackEnvelopes, context);
  validateOriginalCurrent(plan, context);
  const originals = await readGrants(adapters);
  validateCurrentWorkerContinuation(policy, originals, context);
  demand(canonical(envelopeDigests(originals)) === canonical(envelopeDigests(policy.originalGrantEnvelopes)), 'Original worker grant bytes drift');
  const timers = await readTimers(policy, adapters);
  for (let index = 0; index < policy.originalTimers.length; index++) {
    const binding = policy.originalTimers[index], observed = timers[index];
    demand(observed.enabled === binding.enabled && (observed.active === binding.active || (allowStopped && !observed.active)),
      `Timer state cannot be reconciled: ${binding.worker}`);
  }
  return { plan, policy, forwardEnvelopes, rollbackEnvelopes, context, originalEnvelopes: originals };
}

export async function beginWorkerContinuation({ plan, forwardEnvelopes, rollbackEnvelopes, context, adapters }) {
  requireAdapters(adapters);
  await adapters.assertExclusiveLock();
  const lifecycle = await adapters.readLifecycle();
  demand(!(lifecycle?.abortReceipt && (lifecycle.receipt || lifecycle.rollbackReceipt)), 'Conflicting worker continuation terminal receipts');
  const terminal = lifecycle?.rollbackReceipt ?? lifecycle?.abortReceipt ?? lifecycle?.receipt;
  if (terminal) {
    const intent = assertIntent(lifecycle.intent, plan, forwardEnvelopes, rollbackEnvelopes);
    return validateExistingReceipt({ plan, receipt: terminal, intent, rollbackIntent: lifecycle.rollbackIntent,
      forwardEnvelopes, rollbackEnvelopes, context, adapters });
  }
  let preflight, intent;
  if (lifecycle?.intent) {
    intent = assertIntent(lifecycle.intent, plan, forwardEnvelopes, rollbackEnvelopes);
    preflight = await continuationFromIntent({ plan, forwardEnvelopes, rollbackEnvelopes, context, adapters, allowStopped: true });
  } else {
    preflight = await preflightWorkerContinuation({ plan, forwardEnvelopes, rollbackEnvelopes, context, adapters });
    intent = buildIntent(plan, forwardEnvelopes, rollbackEnvelopes);
    await adapters.publish('intent', intent);
  }
  const stopped = await stopOriginalWorkerTimers(preflight, adapters);
  return { decision: 'WORKER_CONTINUATION_BEGUN', intent, timerPostimage: stopped };
}

export async function bindForwardWorkerContinuation({ plan, forwardEnvelopes, rollbackEnvelopes, context, adapters }) {
  requireAdapters(adapters);
  await adapters.assertExclusiveLock();
  const lifecycle = await adapters.readLifecycle();
  const intent = assertIntent(lifecycle?.intent, plan, forwardEnvelopes, rollbackEnvelopes);
  if (lifecycle.receipt) return validateExistingReceipt({ plan, receipt: lifecycle.receipt, intent, forwardEnvelopes, rollbackEnvelopes, context, adapters });
  demand(!lifecycle.rollbackIntent && !lifecycle.rollbackReceipt && !lifecycle.abortReceipt, 'Forward binding conflicts with terminal worker continuation state');
  const policy = validateStaged(plan, forwardEnvelopes, rollbackEnvelopes, context);
  validateActiveForMode(plan, 'FORWARD', context.current);
  const common = { ...context, current: context.current };
  validateForwardWorkerContinuation(policy, forwardEnvelopes, common);
  const preflight = { plan, policy, forwardEnvelopes, rollbackEnvelopes, context };
  await installForwardWorkerGrants(preflight, adapters);
  validateForwardWorkerContinuation(policy, await readGrants(adapters), common);
  return { decision: 'FORWARD_WORKER_GRANTS_BOUND', intentSha256: digest(intent) };
}

export async function completeWorkerContinuation({ plan, forwardEnvelopes, rollbackEnvelopes, context, adapters }) {
  requireAdapters(adapters);
  await adapters.assertExclusiveLock();
  const lifecycle = await adapters.readLifecycle();
  const intent = assertIntent(lifecycle?.intent, plan, forwardEnvelopes, rollbackEnvelopes);
  if (lifecycle.receipt) return validateExistingReceipt({ plan, receipt: lifecycle.receipt, intent, forwardEnvelopes, rollbackEnvelopes, context, adapters });
  demand(!lifecycle.rollbackIntent && !lifecycle.rollbackReceipt && !lifecycle.abortReceipt, 'Forward completion conflicts with terminal worker continuation state');
  const policy = validateStaged(plan, forwardEnvelopes, rollbackEnvelopes, context);
  validateActiveForMode(plan, 'FORWARD', context.current);
  validateForwardWorkerContinuation(policy, await readGrants(adapters), context);
  const preflight = { plan, policy, forwardEnvelopes, rollbackEnvelopes, context };
  const timers = await restoreOriginalWorkerTimers(preflight, adapters);
  const grants = await readGrants(adapters);
  validateForwardWorkerContinuation(policy, grants, context);
  const receipt = receiptFor({ plan, mode: 'FORWARD', intent, envelopes: grants, timers });
  await adapters.publish('receipt', receipt);
  return receipt;
}

export async function abortUncommittedWorkerContinuation({ plan, forwardEnvelopes, rollbackEnvelopes, context, adapters }) {
  requireAdapters(adapters);
  await adapters.assertExclusiveLock();
  const lifecycle = await adapters.readLifecycle();
  const intent = assertIntent(lifecycle?.intent, plan, forwardEnvelopes, rollbackEnvelopes);
  if (lifecycle.abortReceipt) return validateExistingReceipt({ plan, receipt: lifecycle.abortReceipt, intent,
    forwardEnvelopes, rollbackEnvelopes, context, adapters });
  demand(!lifecycle.receipt && !lifecycle.rollbackIntent && !lifecycle.rollbackReceipt, 'Uncommitted abort conflicts with accepted worker continuation');
  const preflight = await continuationFromIntent({ plan, forwardEnvelopes, rollbackEnvelopes, context, adapters, allowStopped: true });
  const timers = await restoreOriginalWorkerTimers(preflight, adapters);
  const grants = await readGrants(adapters);
  validateCurrentWorkerContinuation(preflight.policy, grants, context);
  const receipt = receiptFor({ plan, mode: 'ABORT_UNCOMMITTED', intent, envelopes: grants, timers });
  await adapters.publish('abortReceipt', receipt);
  return receipt;
}

export async function rollbackWorkerContinuation({ plan, forwardEnvelopes, rollbackEnvelopes, context, adapters }) {
  requireAdapters(adapters);
  await adapters.assertExclusiveLock();
  let lifecycle = await adapters.readLifecycle();
  const forwardIntent = assertIntent(lifecycle?.intent, plan, forwardEnvelopes, rollbackEnvelopes);
  if (lifecycle.rollbackReceipt) return validateExistingReceipt({ plan, receipt: lifecycle.rollbackReceipt,
    intent: forwardIntent, rollbackIntent: lifecycle.rollbackIntent, forwardEnvelopes, rollbackEnvelopes, context, adapters });
  demand(!lifecycle.abortReceipt, 'Accepted rollback conflicts with uncommitted abort');
  validateStaged(plan, forwardEnvelopes, rollbackEnvelopes, context);
  validateActiveForMode(plan, 'ROLLBACK', context.current);
  let rollbackIntent = lifecycle.rollbackIntent;
  if (rollbackIntent) assertIntent(rollbackIntent, plan, forwardEnvelopes, rollbackEnvelopes, 'ROLLBACK');
  else {
    rollbackIntent = buildIntent(plan, forwardEnvelopes, rollbackEnvelopes, 'ROLLBACK');
    await adapters.publish('rollbackIntent', rollbackIntent);
    lifecycle = await adapters.readLifecycle();
    assertIntent(lifecycle.rollbackIntent, plan, forwardEnvelopes, rollbackEnvelopes, 'ROLLBACK');
  }
  const policy = plan.workerContinuation, preflight = { plan, policy, forwardEnvelopes, rollbackEnvelopes, context };
  await installRollbackWorkerGrants(preflight, adapters);
  validateRollbackWorkerContinuation(policy, await readGrants(adapters), context);
  const timers = await restoreOriginalWorkerTimers(preflight, adapters), grants = await readGrants(adapters);
  const receipt = receiptFor({ plan, mode: 'ROLLBACK', intent: rollbackIntent, envelopes: grants, timers });
  await adapters.publish('rollbackReceipt', receipt);
  return receipt;
}
