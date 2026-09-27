import { canonical, demand, digest } from './contract.mjs';
import { ENROLLMENT_CONTRACT, validateExternalEnrollmentApproval,
  validateExternalEnrollmentPlan, validateExternalEnrollmentReceipt } from './external-worker-enrollment.mjs';

const equal = (a, b) => canonical(a) === canonical(b);
const allowed = (actual, original, desired) => actual === original || actual === desired;
const timerOff = { unit: 'leetplus-compose-external-daily.timer', loadState: 'loaded', enabled: false, active: false, subState: 'dead' };
const timerOn = { ...timerOff, enabled: true, active: true, subState: 'waiting' };
const timerEnabledStopped = { ...timerOff, enabled: true };

function requireAdapters(adapters) {
  for (const method of ['assertExclusiveLock', 'readState', 'readOp', 'publishOp', 'installLockCAS', 'installUnitsCAS',
    'installNetwork', 'writeSecretCAS', 'writeGrantCAS', 'setTimer', 'publishPointer']) {
    demand(typeof adapters?.[method] === 'function', `Missing external enrollment adapter: ${method}`);
  }
}
function bound(args, { allowExpired = false } = {}) {
  const { plan, approvalEnvelope, context } = args;
  validateExternalEnrollmentPlan(plan, { ...context, allowExpired });
  validateExternalEnrollmentApproval(plan, approvalEnvelope, context.publicKey, context.now, { allowExpired });
  demand(context.preimage && context.preimage.lockPresent === (plan.previousEnrollmentReceiptSha256 !== null),
    'External enrollment previous authority is not exact');
  const pre = context.preimage;
  for (const key of ['serviceUnitSha256', 'timerUnitSha256', 'secretSha256', 'grantEnvelopeSha256'])
    demand(pre[key] === null || /^[a-f0-9]{64}$/.test(pre[key]), `Invalid external enrollment ${key} preimage`);
  demand(pre.networkState === (plan.previousEnrollmentReceiptSha256 === null ? 'ABSENT' : 'ACTIVE'),
    'External enrollment network predecessor drift');
  demand(pre.timer?.unit === timerOff.unit && (plan.previousEnrollmentReceiptSha256 === null ?
    pre.timer.loadState === 'not-found' && !pre.timer.enabled && !pre.timer.active :
    equal(pre.timer, timerOff)), 'External enrollment timer predecessor drift');
  return { contract: `${ENROLLMENT_CONTRACT}_INTENT`, operationId: plan.operationId, planSha256: digest(plan),
    approvalEnvelopeSha256: digest(approvalEnvelope), activeSha256: digest(context.current), preimage: pre,
    serviceUnitSha256: plan.serviceUnitSha256, timerUnitSha256: plan.timerUnitSha256,
    secretSha256: plan.secretSha256, grantEnvelopeSha256: plan.grantEnvelopeSha256,
    networkPolicySha256: plan.networkPolicySha256, targetMode: plan.mode };
}
function validateIntermediate(state, intent) {
  const pre = intent.preimage;
  demand(state && typeof state.lockPresent === 'boolean' && (state.lockPresent || !pre.lockPresent) &&
    allowed(state.serviceUnitSha256, pre.serviceUnitSha256, intent.serviceUnitSha256) &&
    allowed(state.timerUnitSha256, pre.timerUnitSha256, intent.timerUnitSha256) &&
    allowed(state.secretSha256, pre.secretSha256, intent.secretSha256) &&
    allowed(state.grantEnvelopeSha256, pre.grantEnvelopeSha256, intent.grantEnvelopeSha256) &&
    ['ABSENT', 'INSTALLING', 'ACTIVE'].includes(state.networkState) &&
    (state.networkState === pre.networkState || pre.networkState === 'ABSENT' && state.networkState === 'INSTALLING' || state.networkState === 'ACTIVE'),
  'External enrollment state escaped exact CAS pre/postimages');
  demand(state.timer && (equal(state.timer, pre.timer) || equal(state.timer, timerOff) ||
    intent.targetMode === 'TIMER' && (equal(state.timer, timerOn) || equal(state.timer, timerEnabledStopped))),
  'External enrollment timer escaped exact states');
  if (state.timer.active) demand(state.networkState === 'ACTIVE' && state.serviceUnitSha256 === intent.serviceUnitSha256 &&
    state.timerUnitSha256 === intent.timerUnitSha256 && state.secretSha256 === intent.secretSha256 &&
    state.grantEnvelopeSha256 === intent.grantEnvelopeSha256, 'External timer activated before exact authority');
  return state;
}
async function effect(args, intent, method, ...params) {
  validateExternalEnrollmentApproval(args.plan, args.approvalEnvelope, args.context.publicKey, args.adapters.now?.() ?? Date.now());
  await args.adapters[method](...params);
  return validateIntermediate(await args.adapters.readState(), intent);
}

/** One bounded, source-only native state machine. The host adapter must attest
 * accepted application/controller ancestry and the independent direct GO
 * before invoking this function. All writes use exact CAS preimages.
 */
export async function applyExternalEnrollment(args) {
  requireAdapters(args.adapters); await args.adapters.assertExclusiveLock();
  const oldReceipt = await args.adapters.readOp('receipt');
  const prior = await args.adapters.readOp('intent');
  const expired = (args.adapters.now?.() ?? Date.now()) >= Math.min(Date.parse(args.plan.expiresAt), Date.parse(args.approvalEnvelope.approval.expiresAt));
  const intent = bound(args, { allowExpired: Boolean(oldReceipt || expired && prior) });
  if (prior) demand(equal(prior, intent), 'External enrollment intent differs from frozen plan');
  else {
    demand(equal(await args.adapters.readState(), args.context.preimage), 'External enrollment live origin drift');
    await args.adapters.publishOp('intent', intent);
  }
  if (oldReceipt) {
    const state = validateIntermediate(await args.adapters.readState(), intent);
    const network = await args.adapters.readOp('network');
    demand(network && state.networkState === 'ACTIVE', 'External enrollment terminal network drift');
    validateExternalEnrollmentReceipt(oldReceipt, { ...args.context, plan: args.plan, approvalEnvelope: args.approvalEnvelope,
      networkReceiptSha256: digest(network), timerState: state.timer });
    await args.adapters.publishPointer(args.plan.operationId, digest(oldReceipt)); return oldReceipt;
  }
  if (expired) {
    const state = validateIntermediate(await args.adapters.readState(), intent);
    // No acceptance time can be invented after a lost unreceipted effect.
    // This is a read-only terminal classification; the old/missing enrollment
    // pointer makes the dedicated runner fail closed until a new recovery GO.
    return { contract: `${ENROLLMENT_CONTRACT}_RECOVERY`, decision: 'RECOVERY_REQUIRED_EXPIRED_UNRECEIPTED',
      operationId: args.plan.operationId, planSha256: digest(args.plan), intentSha256: digest(intent),
      postimage: state, observedAt: new Date(args.adapters.now?.() ?? Date.now()).toISOString() };
  }
  let state = validateIntermediate(await args.adapters.readState(), intent);
  if (!state.lockPresent) state = await effect(args, intent, 'installLockCAS', false, true);
  if (state.serviceUnitSha256 !== intent.serviceUnitSha256 || state.timerUnitSha256 !== intent.timerUnitSha256)
    state = await effect(args, intent, 'installUnitsCAS', { service: state.serviceUnitSha256, timer: state.timerUnitSha256 },
      { service: intent.serviceUnitSha256, timer: intent.timerUnitSha256 });
  if (state.networkState !== 'ACTIVE' || !await args.adapters.readOp('network'))
    state = await effect(args, intent, 'installNetwork', intent.networkPolicySha256);
  const network = await args.adapters.readOp('network');
  demand(network?.contract === 'LEETPLUS_LANGAME_EXTERNAL_NETWORK_V1' && network.decision === 'PASS' &&
    state.networkState === 'ACTIVE', 'External network receipt is missing before credentials');
  if (state.secretSha256 !== intent.secretSha256)
    state = await effect(args, intent, 'writeSecretCAS', state.secretSha256, args.context.secretBytes);
  if (state.grantEnvelopeSha256 !== intent.grantEnvelopeSha256)
    state = await effect(args, intent, 'writeGrantCAS', state.grantEnvelopeSha256, args.context.grantEnvelope);
  const wantedTimer = args.plan.mode === 'TIMER' ? timerOn : timerOff;
  if (!equal(state.timer, wantedTimer)) state = await effect(args, intent, 'setTimer', state.timer, wantedTimer);
  demand(state.lockPresent && state.serviceUnitSha256 === intent.serviceUnitSha256 &&
    state.timerUnitSha256 === intent.timerUnitSha256 && state.networkState === 'ACTIVE' &&
    state.secretSha256 === intent.secretSha256 && state.grantEnvelopeSha256 === intent.grantEnvelopeSha256 &&
    equal(state.timer, wantedTimer), 'External enrollment postimage is incomplete');
  const receipt = { contract: `${ENROLLMENT_CONTRACT}_RECEIPT`, decision: 'PASS', operationId: args.plan.operationId,
    planSha256: digest(args.plan), approvalEnvelopeSha256: digest(args.approvalEnvelope),
    activeSha256: digest(args.context.current), secretSha256: intent.secretSha256,
    grantEnvelopeSha256: intent.grantEnvelopeSha256, serviceUnitSha256: intent.serviceUnitSha256,
    timerUnitSha256: intent.timerUnitSha256, networkReceiptSha256: digest(network),
    timerState: state.timer, acceptedAt: new Date(args.adapters.now?.() ?? Date.now()).toISOString() };
  validateExternalEnrollmentReceipt(receipt, { ...args.context, plan: args.plan, approvalEnvelope: args.approvalEnvelope,
    networkReceiptSha256: digest(network), timerState: state.timer });
  await args.adapters.publishOp('receipt', receipt);
  await args.adapters.publishPointer(args.plan.operationId, digest(receipt)); return receipt;
}
