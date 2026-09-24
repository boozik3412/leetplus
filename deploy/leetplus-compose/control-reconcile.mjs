import { canonical, demand, digest } from './contract.mjs';

const PHASES = new Set(['HYDRATE', 'BIND', 'SMOKE', 'CUTOVER', 'POSTCHECK']);

/**
 * Build the resume-only driver path. Observers may inspect durable state and
 * live postimages, but this adapter deliberately has no phase executor
 * callback. An intent-only ambiguous state must be rejected by its observer.
 */
export function createReadOnlyPhaseReconciler({ readState, observers }) {
  demand(typeof readState === 'function' && observers && typeof observers === 'object', 'Read-only reconciliation dependencies required');
  return async (phase, plan) => {
    demand(PHASES.has(phase) && typeof observers[phase] === 'function', 'Unknown reconciliation phase');
    const state = await readState();
    const existing = state?.records?.[phase];
    demand(existing?.intent, 'Reconciliation requires a durable phase intent');
    const evidence = existing.evidence ?? null;
    const observed = await observers[phase](plan, evidence, state);
    demand(observed?.phase === phase && observed.planSha256 === digest(plan), 'Reconciliation returned unbound evidence');
    if (evidence) demand(canonical(observed) === canonical(evidence), 'Reconciliation changed durable evidence');
    return observed;
  };
}
