import crypto from 'node:crypto';
import { CONTRACT, canonical, demand, digest, release, renderCompose, SLOTS } from './contract.mjs';

export const PHASES = ['HYDRATE', 'BIND', 'SMOKE', 'CUTOVER', 'POSTCHECK'];
export function validatePlan(plan) {
  demand(plan?.contract === `${CONTRACT}_PLAN`, 'Invalid plan contract');
  demand(/^[a-f0-9-]{36}$/.test(plan.operationId ?? '') && /^[a-f0-9]{64}$/.test(plan.hostIdentitySha256 ?? ''), 'Invalid operation/host');
  demand(SLOTS.includes(plan.targetSlot) && ['BOOTSTRAP', 'ROLLOUT'].includes(plan.action), 'Invalid deployment action');
  demand(Number.isSafeInteger(plan.generation) && plan.generation >= 0, 'Invalid generation');
  demand(/^[a-f0-9]{64}$/.test(plan.controlSha256 ?? '') && /^[a-f0-9]{64}$/.test(plan.admissionSha256 ?? '') && /^[a-f0-9]{64}$/.test(plan.archiveSha256 ?? ''), 'Missing artifact/admission binding');
  demand(/^[a-f0-9]{64}$/.test(plan.backupReceiptSha256 ?? '') && /^[a-f0-9]{64}$/.test(plan.rehearsalReceiptSha256 ?? ''), 'Backup and rehearsal must be bound');
  demand(plan.secretDigests && Object.keys(plan.secretDigests).sort().join(',') === ['acceptance.json', 'api-blue.json', 'api-green.json', 'db-ca.pem'].sort().join(',') && Object.values(plan.secretDigests).every(v => /^[a-f0-9]{64}$/.test(v)), 'Exact runtime secret-file digests are required');
  demand(/^[a-f0-9]{64}$/.test(plan.networkPolicySha256 ?? ''), 'Network policy must be bound');
  demand(/^[a-f0-9]{64}$/.test(plan.databaseIdentitySha256 ?? ''), 'Database system identity must be bound');
  demand(plan.action !== 'BOOTSTRAP' || /^[a-f0-9]{64}$/.test(plan.migrationReceiptSha256 ?? ''), 'Bootstrap needs a source-fenced migration receipt');
  release(plan.blue); release(plan.green); release(plan.dataRelease);
  demand(/^[a-f0-9]{64}$/.test(plan.dataAdmissionSha256 ?? ''), 'Independent data admission must be bound');
  demand(plan.previous === null ? plan.action === 'BOOTSTRAP' && plan.generation === 0 :
    plan.action === 'ROLLOUT' && plan.previous.activeSlot !== plan.targetSlot && SLOTS.includes(plan.previous.activeSlot) && plan.previous.generation === plan.generation,
  'Invalid previous production state');
  if (plan.previous) {
    const active = plan.previous.activeSlot;
    demand(canonical(plan[active]) === canonical(plan.previous[active]), 'Active release cannot be changed by BIND');
    demand(canonical(plan.dataRelease) === canonical(plan.previous.dataRelease) && plan.dataAdmissionSha256 === plan.previous.dataAdmissionSha256, 'Application rollout cannot replace data services');
  } else {
    demand(canonical(plan.dataRelease) === canonical(plan.blue) && plan.dataAdmissionSha256 === plan.admissionSha256, 'Bootstrap must use its admitted data image set');
  }
  const compose = renderCompose({ blue: plan.blue, green: plan.green, dataRelease: plan.dataRelease, activeSlot: plan.targetSlot });
  demand(digest(compose) === plan.composeSha256, 'Compose bytes are not bound to the plan');
  return plan;
}
export function validateApproval(plan, envelope, trustedPublicKey, { now = Date.now(), allowExpired = false } = {}) {
  validatePlan(plan);
  const { approval, signature } = envelope ?? {};
  demand(approval?.contract === `${CONTRACT}_APPROVAL` && approval.planSha256 === digest(plan) &&
    approval.operationId === plan.operationId && approval.hostIdentitySha256 === plan.hostIdentitySha256 &&
    approval.action === plan.action, 'Approval does not bind the exact plan/host/action');
  demand(typeof signature === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(signature), 'Invalid Ed25519 signature encoding');
  demand(crypto.createPublicKey(trustedPublicKey).asymmetricKeyType === 'ed25519', 'Approval root must be Ed25519');
  demand(crypto.verify(null, Buffer.from(canonical(approval)), trustedPublicKey, Buffer.from(signature, 'base64')), 'Approval signature verification failed');
  const start = Date.parse(approval.issuedAt), end = Date.parse(approval.expiresAt);
  demand(Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= 4 * 3600000 && start <= now + 30000 && (allowExpired || end >= now), 'Approval is not in its bounded validity window');
  return approval;
}
export function validateChain(plan, records) {
  let previousReceiptSha256 = null;
  let pending = false;
  for (const phase of PHASES) {
    const record = records[phase];
    if (!record) { pending = true; continue; }
    demand(!pending, 'Phase history contains a gap');
    demand(record.intent?.planSha256 === digest(plan) && record.intent.phase === phase && record.intent.previousReceiptSha256 === previousReceiptSha256, 'Intent chain mismatch');
    if (!record.receipt) {
      if (record.evidence) demand(record.evidence.phase === phase && record.evidence.planSha256 === digest(plan), 'Pending evidence is unbound');
      pending = true; continue;
    }
    demand(record.evidence && record.receipt.planSha256 === digest(plan) && record.receipt.phase === phase &&
      record.receipt.intentSha256 === digest(record.intent) && record.receipt.evidenceSha256 === digest(record.evidence) &&
      record.receipt.previousReceiptSha256 === previousReceiptSha256, 'Receipt/evidence digest mismatch');
    previousReceiptSha256 = digest(record.receipt);
  }
  return previousReceiptSha256;
}

/** Store uses durable exclusive publication. Driver performs fixed operations,
 * never operator-supplied shell commands. A lost effect response is reconciled
 * against live Docker/nginx identities before any missing receipt is published.
 */
export async function execute(plan, envelope, publicKey, store, driver) {
  validatePlan(plan);
  const initial = await store.read();
  validateChain(plan, initial.records);
  validateApproval(plan, envelope, publicKey, { allowExpired: Boolean(initial.final || initial.rolledBack) });
  if (initial.rolledBack) {
    demand(initial.rolledBack.planSha256 === digest(plan) && initial.rolledBack.contract === `${CONTRACT}_ROLLED_BACK` && plan.previous && initial.rolledBack.active.activeSlot === plan.previous.activeSlot && initial.rolledBack.active.generation === plan.generation + 2, 'Invalid terminal rollback');
    return initial.rolledBack;
  }
  if (initial.final) {
    demand(initial.final.planSha256 === digest(plan) && initial.final.lastReceiptSha256 === digest(initial.records.POSTCHECK?.receipt), 'Final record mismatch');
    return initial.final;
  }
  await driver.preflight(plan);
  let previousReceiptSha256 = null;
  for (const phase of PHASES) {
    const state = await store.read();
    validateChain(plan, state.records);
    const existing = state.records[phase];
    if (existing?.receipt) { previousReceiptSha256 = digest(existing.receipt); continue; }
    validateApproval(plan, envelope, publicKey);
    const intent = { phase, planSha256: digest(plan), previousReceiptSha256 };
    if (!existing) await store.publish(phase, 'intent', intent);
    await driver.preflight(plan, phase);
    const evidence = existing ? await driver.reconcile(phase, plan) : await driver.run(phase, plan);
    demand(evidence && evidence.phase === phase && evidence.planSha256 === digest(plan), 'Driver returned unbound evidence');
    await store.publish(phase, 'evidence', evidence);
    const receipt = { phase, planSha256: digest(plan), intentSha256: digest(intent), evidenceSha256: digest(evidence), previousReceiptSha256 };
    await store.publish(phase, 'receipt', receipt);
    previousReceiptSha256 = digest(receipt);
  }
  const final = { contract: `${CONTRACT}_COMPLETED`, planSha256: digest(plan), operationId: plan.operationId, lastReceiptSha256: previousReceiptSha256 };
  await store.finalize(final);
  return final;
}
