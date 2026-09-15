import { CONTRACT, canonical, demand, digest } from './contract.mjs';
import { PHASES, validateApproval, validateChain, validatePlan } from './orchestrator.mjs';

function exactKeys(value, expected, message) {
  demand(value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()), message);
}

function completePhase(record, phase, message) {
  exactKeys(record, ['intent', 'evidence', 'receipt'], message);
  demand(record.intent.phase === phase && record.evidence.phase === phase && record.receipt.phase === phase, message);
}

function acceptedForward(plan, history) {
  for (const phase of PHASES) completePhase(history.records[phase], phase, 'Completed operation has an incomplete phase chain');
  const lastReceiptSha256 = digest(history.records.POSTCHECK.receipt);
  const final = history.final;
  demand(final?.contract === `${CONTRACT}_COMPLETED` && final.operationId === plan.operationId &&
    final.planSha256 === digest(plan) && final.lastReceiptSha256 === lastReceiptSha256,
  'Completed operation terminal receipt mismatch');
  return {
    operationId: plan.operationId,
    generation: plan.generation + 1,
    activeSlot: plan.targetSlot,
    blue: plan.blue,
    green: plan.green,
    dataRelease: plan.dataRelease,
    dataAdmissionSha256: plan.dataAdmissionSha256,
    planSha256: digest(plan),
  };
}

function acceptedRollback(plan, history) {
  demand(plan.previous, 'Bootstrap operation cannot be terminally rolled back');
  for (const phase of PHASES.slice(0, -1)) completePhase(history.records[phase], phase, 'Rolled-back operation has an incomplete accepted prefix');
  const postcheck = history.records.POSTCHECK;
  exactKeys(postcheck, postcheck?.evidence ? ['intent', 'evidence'] : ['intent'], 'Rolled-back operation must stop before the postcheck receipt');
  const expected = {
    operationId: plan.operationId,
    generation: plan.generation + 2,
    activeSlot: plan.previous.activeSlot,
    blue: plan.blue,
    green: plan.green,
    dataRelease: plan.dataRelease,
    dataAdmissionSha256: plan.dataAdmissionSha256,
    planSha256: digest(plan),
    outcome: 'ROLLED_BACK',
  };
  const rollback = history.rolledBack;
  demand(rollback?.contract === `${CONTRACT}_ROLLED_BACK` && rollback.planSha256 === digest(plan) &&
    typeof rollback.reason === 'string' && canonical(rollback.active) === canonical(expected),
  'Rollback terminal receipt mismatch');
  return expected;
}

/**
 * Validates immutable application rollout histories before a controller-only
 * handoff. It deliberately has no filesystem, process, or network effects.
 */
export function validateAcceptedApplicationSnapshot({ histories, active, publicKey } = {}) {
  demand(Array.isArray(histories) && histories.length > 0, 'Accepted application histories are required');
  demand(active && typeof active === 'object' && !Array.isArray(active), 'Accepted active state is required');

  const seen = new Set();
  let activePlan;
  for (const history of histories) {
    exactKeys(history, ['plan', 'approval', 'records', 'final', 'rolledBack'], 'Invalid application history record');
    validatePlan(history.plan);
    demand(!seen.has(history.plan.operationId), 'Duplicate application operation history');
    seen.add(history.plan.operationId);
    validateApproval(history.plan, history.approval, publicKey, { allowExpired: true });
    validateChain(history.plan, history.records);

    const hasFinal = history.final !== null;
    const hasRollback = history.rolledBack !== null;
    demand(hasFinal !== hasRollback, 'Application operation must have exactly one terminal record');
    const expected = hasFinal ? acceptedForward(history.plan, history) : acceptedRollback(history.plan, history);
    if (history.plan.operationId === active.operationId) {
      demand(canonical(active) === canonical(expected), 'Active state does not match its accepted terminal operation');
      activePlan = history.plan;
    }
  }
  demand(activePlan, 'Active operation is absent from application history');
  return { controlSha256: activePlan.controlSha256 };
}
