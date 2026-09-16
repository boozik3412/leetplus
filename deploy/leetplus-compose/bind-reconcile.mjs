import { demand, digest } from './contract.mjs';

// After BIND evidence is durable, reconciliation observes its postimage only.
// Never stop/recreate again or replace a timestamped resource-budget record.
export function reconcileBoundEvidence({ plan, spec, evidence, composeSha256, fence, assertStoppedConfiguration }) {
  const planSha256 = digest(plan);
  demand(evidence?.phase === 'BIND' && evidence.planSha256 === planSha256 &&
    evidence.composeSha256 === digest(spec) && evidence.slot === plan.targetSlot,
  'BIND evidence does not bind this plan');
  demand(composeSha256 === evidence.composeSha256 && fence?.planSha256 === planSha256 && fence.slot === plan.targetSlot,
    'BIND postimage drift');
  for (const role of ['api', 'web']) assertStoppedConfiguration(`${role}-${plan.targetSlot}`);
  return evidence;
}
