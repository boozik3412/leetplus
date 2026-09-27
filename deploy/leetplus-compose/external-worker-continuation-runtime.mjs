import { canonical, demand, digest } from './contract.mjs';
import { validateExternalWorkerGrant } from './external-worker-contract.mjs';
import { validateWorkerSetV3 } from './worker-set-v3.mjs';

export const EXTERNAL_WORKER_CONTINUATION_CONTRACT = 'LEETPLUS_EXTERNAL_WORKER_CONTINUATION_RUNTIME_V1';
const UNIT = 'leetplus-compose-external-daily.timer';
const equal = (a, b) => canonical(a) === canonical(b);
const stopped = timer => ({ ...timer, active: false, subState: 'dead' });
const off = timer => ({ ...stopped(timer), enabled: false });

function frozen(args) {
  const { plan, context } = args, policy = validateWorkerSetV3(plan.workerSetV3, plan), e = policy.external;
  demand(equal(policy.legacy, plan.workerContinuation), 'V3 legacy worker continuation differs from executable V2');
  const original = e.originalGrantEnvelope;
  const forward = context.forwardEnvelope ?? null, rollback = context.rollbackEnvelope ?? null;
  for (const [stage, envelope] of [['forward', forward], ['rollback', rollback]]) {
    demand(e[stage].state === 'ACTIVE' ? Boolean(envelope) && equal(envelope.grant, e[stage].grant) : envelope === null,
      `External ${stage} signed envelope differs from policy`);
  }
  return { policy, record: { contract: `${EXTERNAL_WORKER_CONTINUATION_CONTRACT}_INTENT`, operationId: plan.operationId,
    planSha256: digest(plan), policySha256: digest(policy), sourceGrant: original, timer: e.originalTimer,
    forwardEnvelope: forward, rollbackEnvelope: rollback, forwardState: e.forward.state, rollbackState: e.rollback.state } };
}
function activeFor(args, mode) {
  const { plan } = args, policy = plan.workerSetV3.legacy;
  const generation = mode === 'CURRENT' ? plan.generation : policy[mode.toLowerCase()].generation;
  const releaseSha = mode === 'CURRENT' ? policy.rollback.releaseSha : policy[mode.toLowerCase()].releaseSha;
  const activeSlot = mode === 'FORWARD' ? plan.targetSlot : plan.previous.activeSlot;
  return { activeSlot, generation, [activeSlot]: { releaseSha } };
}
function assertActive(args, mode) {
  const expected = activeFor(args, mode), actual = args.context.current;
  demand(actual?.activeSlot === expected.activeSlot && actual.generation === expected.generation &&
    actual[actual.activeSlot]?.releaseSha === expected[expected.activeSlot].releaseSha,
  `External ${mode} active generation/release drift`);
}
function signatures(args, record, { allowExpired = false } = {}) {
  for (const [mode, envelope] of [['CURRENT', record.sourceGrant], ['FORWARD', record.forwardEnvelope], ['ROLLBACK', record.rollbackEnvelope]]) {
    if (envelope) validateExternalWorkerGrant(envelope, args.context.publicKey, activeFor(args, mode),
      args.context.hostIdentitySha256, args.context.externalProfile, args.context.now ?? Date.now(), { allowExpired });
  }
}
function requireAdapters(a) {
  for (const method of ['assertExclusiveLock', 'readExternalGrant', 'readExternalTimer', 'publish', 'readLifecycle',
    'writeExternalGrantCAS', 'removeExternalGrantCAS', 'systemctl']) demand(typeof a?.[method] === 'function', `Missing external continuation adapter: ${method}`);
}
async function observed(a) {
  const timer = await a.readExternalTimer();
  demand(timer?.unit === UNIT && ['loaded', 'not-found'].includes(timer.loadState) &&
    typeof timer.enabled === 'boolean' && typeof timer.active === 'boolean' &&
    (timer.active ? timer.subState === 'waiting' : timer.subState === 'dead') &&
    (timer.loadState === 'loaded' || !timer.enabled && !timer.active), 'External timer observation invalid');
  return { grant: await a.readExternalGrant(), timer };
}
async function intent(args, { allowExpired = false } = {}) {
  const expected = frozen(args).record, value = await args.adapters.readLifecycle('external-worker-intent.json');
  demand(equal(value, expected), 'External immutable continuation intent drift');
  signatures(args, value, { allowExpired }); return value;
}
async function publish(a, name, value) {
  const existing = await a.readLifecycle(name);
  if (existing) demand(equal(existing, value), 'Conflicting immutable external continuation publication');
  else await a.publish(name, value);
  return value;
}
async function setTimer(a, expected) {
  const { timer } = await observed(a);
  demand(timer.loadState === expected.loadState, 'External timer unit presence drift');
  if (timer.loadState === 'not-found') { demand(equal(timer, expected), 'Absent timer drift'); return timer; }
  if (timer.active && !expected.active) await a.systemctl('stop', UNIT);
  if (timer.enabled !== expected.enabled) await a.systemctl(expected.enabled ? 'enable' : 'disable', UNIT);
  const afterEnable = (await observed(a)).timer;
  if (afterEnable.active !== expected.active) await a.systemctl(expected.active ? 'start' : 'stop', UNIT);
  const after = (await observed(a)).timer;
  demand(equal(after, expected), 'External timer did not reach exact postimage'); return after;
}
function stage(record, mode) {
  if (mode === 'ABORT') return { state: record.sourceGrant ? 'ACTIVE' : 'DORMANT', grant: record.sourceGrant, timer: record.timer };
  const prefix = mode.toLowerCase(), state = record[`${prefix}State`];
  return { state, grant: record[`${prefix}Envelope`], timer: state === 'ACTIVE' ? record.timer : off(record.timer) };
}
function terminal(args, record, mode, state) {
  const desired = stage(record, mode), identity = mode === 'ABORT' ? activeFor(args, 'CURRENT') : activeFor(args, mode);
  demand(equal(state.grant, desired.grant) && equal(state.timer, desired.timer), 'External continuation terminal postimage drift');
  return { contract: `${EXTERNAL_WORKER_CONTINUATION_CONTRACT}_RECEIPT`, decision: 'PASS', mode,
    operationId: args.plan.operationId, planSha256: digest(args.plan), policySha256: record.policySha256,
    intentSha256: digest(record), state: desired.state, grantEnvelopeSha256: desired.grant ? digest(desired.grant) : null,
    timerPostimage: desired.timer, generation: identity.generation, releaseSha: identity[identity.activeSlot].releaseSha };
}
export async function preflightExternalWorkerContinuation(args) {
  requireAdapters(args.adapters); const record = frozen(args).record; signatures(args, record);
  const state = await observed(args.adapters);
  demand(equal(state.grant, record.sourceGrant) && equal(state.timer, record.timer), 'External continuation preimage drift'); return record;
}
export async function beginExternalWorkerContinuation(args) {
  requireAdapters(args.adapters); await args.adapters.assertExclusiveLock();
  assertActive(args, 'CURRENT');
  const prior = await args.adapters.readLifecycle('external-worker-intent.json');
  const record = prior ? await intent(args) : await preflightExternalWorkerContinuation(args);
  for (const name of ['external-worker-complete.json', 'external-worker-abort.json', 'external-worker-rollback.json']) demand(!await args.adapters.readLifecycle(name), 'External continuation is already terminal');
  const state = await observed(args.adapters);
  demand(equal(state.grant, record.sourceGrant) && (equal(state.timer, record.timer) || equal(state.timer, stopped(record.timer))), 'Interrupted external begin preimage drift');
  await publish(args.adapters, 'external-worker-intent.json', record);
  await setTimer(args.adapters, stopped(record.timer)); return record;
}
async function bind(args, mode) {
  await args.adapters.assertExclusiveLock(); assertActive(args, mode === 'ABORT' ? 'CURRENT' : mode);
  const record = await intent(args), state = await observed(args.adapters), desired = stage(record, mode);
  if (mode === 'ROLLBACK') {
    const prior = await args.adapters.readLifecycle('external-worker-forward.json');
    demand(prior?.planSha256 === digest(args.plan) && prior.intentSha256 === digest(record), 'External rollback lacks forward binding');
  }
  const allowed = mode === 'FORWARD' ? [record.sourceGrant, desired.grant] : [record.sourceGrant, record.forwardEnvelope, desired.grant];
  demand(allowed.some(grant => equal(state.grant, grant)) &&
    [record.timer, stopped(record.timer), off(record.timer)].some(timer => equal(state.timer, timer)), 'Foreign external continuation state');
  await setTimer(args.adapters, stopped(state.timer));
  if (!equal(state.grant, desired.grant)) {
    if (desired.grant) await args.adapters.writeExternalGrantCAS(state.grant, desired.grant);
    else await args.adapters.removeExternalGrantCAS(state.grant);
  }
  demand(equal((await observed(args.adapters)).grant, desired.grant), 'External continuation grant CAS did not persist');
  if (mode === 'FORWARD') return publish(args.adapters, 'external-worker-forward.json', {
    contract: `${EXTERNAL_WORKER_CONTINUATION_CONTRACT}_BOUND`, mode, planSha256: digest(args.plan), intentSha256: digest(record),
    state: desired.state, grantEnvelopeSha256: desired.grant ? digest(desired.grant) : null });
  await setTimer(args.adapters, desired.timer);
  return publish(args.adapters, `external-worker-${mode === 'ABORT' ? 'abort' : 'rollback'}.json`, terminal(args, record, mode, await observed(args.adapters)));
}
export const bindForwardExternalWorkerContinuation = args => bind(args, 'FORWARD');
export async function completeExternalWorkerContinuation(args) {
  await args.adapters.assertExclusiveLock(); assertActive(args, 'FORWARD'); const record = await intent(args);
  demand(!await args.adapters.readLifecycle('external-worker-abort.json') && !await args.adapters.readLifecycle('external-worker-rollback.json'), 'Conflicting external terminal history');
  const bound = await args.adapters.readLifecycle('external-worker-forward.json');
  demand(bound?.planSha256 === digest(args.plan) && bound.intentSha256 === digest(record) && bound.state === record.forwardState &&
    bound.grantEnvelopeSha256 === (record.forwardEnvelope ? digest(record.forwardEnvelope) : null), 'External forward binding receipt drift');
  const state = await observed(args.adapters), desired = stage(record, 'FORWARD');
  demand(equal(state.grant, desired.grant), 'External forward grant drift before POSTCHECK');
  await setTimer(args.adapters, desired.timer);
  return publish(args.adapters, 'external-worker-complete.json', terminal(args, record, 'FORWARD', await observed(args.adapters)));
}
export async function abortExternalWorkerContinuation(args) {
  demand(!await args.adapters.readLifecycle('external-worker-complete.json') && !await args.adapters.readLifecycle('external-worker-rollback.json'), 'Accepted external continuation cannot abort');
  return bind(args, 'ABORT');
}
export const rollbackExternalWorkerContinuation = args => bind(args, 'ROLLBACK');
export function validateExternalWorkerContinuationReceipt({ plan, receipt, context, postimage }) {
  const args = { plan, context }, record = frozen(args).record;
  demand(['FORWARD', 'ROLLBACK', 'ABORT'].includes(receipt?.mode), 'Unknown external continuation receipt mode');
  signatures(args, record, { allowExpired: context.allowExpired === true });
  demand(equal(context.intent, record) && equal(receipt, terminal(args, record, receipt.mode, postimage)), 'External continuation receipt is not bound to exact intent and live postimage');
  const expected = activeFor(args, receipt.mode === 'ABORT' ? 'CURRENT' : receipt.mode);
  demand(context.current?.generation === expected.generation && context.current?.[context.current.activeSlot]?.releaseSha === expected[expected.activeSlot].releaseSha,
    'External continuation receipt active generation drift'); return receipt;
}
