import crypto from 'node:crypto';
import { canonical, demand, digest } from './contract.mjs';

const CONTRACT = 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1';
const HASH = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const RESOURCE_PROFILE_BOOTSTRAP = 'RESOURCE_PROFILE_BOOTSTRAP';
const PREDECESSOR_CONTROL_SHA = '892b25b9fe5ebc8d0c20a7874a77ac312b7a0978';
const PREDECESSOR_CONTRACT_SHA256 = 'bba588a506cee3dc6c03a0b93f25291a4dd5f36c1d05fb79d83128bf0276f79d';
const VARIANT_A_PREDECESSOR_SHA = '02acca249783cf47c0a24897203d51a206e1c5b2';
const VARIANT_A_PREDECESSOR_MANIFEST_SHA256 = '5ee7133885692b4c6e86ab680b4040770c985cee4c3381fb372302041232fcad';
const VARIANT_A_OLD_ORCHESTRATOR_SHA256 = 'c6fd054d39175266ac0603759423f4fe039294c2a42b03f0b8bd12a8f280aa58';
const VARIANT_A_NEW_ORCHESTRATOR_SHA256 = 'c4d13a76d1f97f41dc575d37c5da588b9ba3634b1a053f6b194a86623e8861c4';
const VARIANT_A_NEW_CONTROL_SHA256 = '4e39b9e8a75ede6bc474fe0ef8b0b5fea60b46edd7c1ed8172744288625ea49f';
const VARIANT_A_NEW_RUNNER_SHA256 = '9b02c697d6995b0ff9d4cc085d1249d6e83d96d0cb2848a1e6a139acf3f1eb29';

export function validatePlanScope(plan) {
  demand(plan?.contract === `${CONTRACT}_PLAN` && UUID.test(plan.operationId ?? ''), 'Invalid control handoff plan');
  if (plan.action === 'CONTROL_HANDOFF') {
    if (!Object.hasOwn(plan, 'orchestratorTransition')) return;
    const transition = plan.orchestratorTransition;
    const keys = ['contract', 'oldReleaseSha', 'newReleaseSha', 'oldControlSha256', 'newControlSha256',
      'oldOrchestratorSha256', 'newOrchestratorSha256', 'newControlEntrySha256', 'newPreparationRunnerSha256'];
    demand(transition && typeof transition === 'object' && !Array.isArray(transition) &&
      JSON.stringify(Object.keys(transition).sort()) === JSON.stringify(keys.sort()) &&
      transition.contract === 'LEETPLUS_VARIANT_A_ORCHESTRATOR_HANDOFF_V1' &&
      plan.oldReleaseSha === VARIANT_A_PREDECESSOR_SHA && plan.oldControlSha256 === VARIANT_A_PREDECESSOR_MANIFEST_SHA256 &&
      SHA.test(plan.newReleaseSha ?? '') && plan.newReleaseSha !== plan.oldReleaseSha && HASH.test(plan.newControlSha256 ?? '') &&
      plan.newControlSha256 !== plan.oldControlSha256 &&
      plan.applicationRestartAllowed === false && plan.timersMayBeStopped === false &&
      plan.rollbackAllowed === true && plan.maxLockWaitSeconds === 120 &&
      !['predecessorControlSha', 'predecessorContractSha256', 'legacyProfile', 'targetProfile',
        'historicalComposeIdentityVerified', 'resourceLimitMutationAllowed'].some(key => Object.hasOwn(plan, key)) &&
      transition.oldReleaseSha === plan.oldReleaseSha && transition.newReleaseSha === plan.newReleaseSha &&
      transition.oldControlSha256 === plan.oldControlSha256 && transition.newControlSha256 === plan.newControlSha256 &&
      transition.oldOrchestratorSha256 === VARIANT_A_OLD_ORCHESTRATOR_SHA256 &&
      transition.newOrchestratorSha256 === VARIANT_A_NEW_ORCHESTRATOR_SHA256 &&
      transition.newControlEntrySha256 === VARIANT_A_NEW_CONTROL_SHA256 &&
      transition.newPreparationRunnerSha256 === VARIANT_A_NEW_RUNNER_SHA256,
    'Invalid variant A orchestrator transition');
    return;
  }
  demand(!Object.hasOwn(plan, 'orchestratorTransition'), 'Resource bootstrap cannot include variant A orchestrator transition');
  demand(plan.action === RESOURCE_PROFILE_BOOTSTRAP && plan.oldReleaseSha === PREDECESSOR_CONTROL_SHA &&
    SHA.test(plan.newReleaseSha ?? '') && plan.newReleaseSha !== plan.oldReleaseSha &&
    plan.predecessorControlSha === PREDECESSOR_CONTROL_SHA && plan.predecessorContractSha256 === PREDECESSOR_CONTRACT_SHA256 &&
    plan.legacyProfile === 'LEGACY_4G' && plan.targetProfile === 'API_6G_V1' &&
    plan.historicalComposeIdentityVerified === true && plan.resourceLimitMutationAllowed === false &&
    plan.applicationRestartAllowed === false && plan.timersMayBeStopped === false && plan.rollbackAllowed === true,
  'Invalid resource-profile bootstrap scope');
}

function timestamp(value, name) {
  const result = typeof value === 'string' ? Date.parse(value) : NaN;
  demand(Number.isFinite(result), `Invalid ${name}`);
  return result;
}

export function validateControlHandoffAuthority({ plan, approvalEnvelope, receipt, pointer } = {}, publicKey, context, now = Date.now()) {
  validatePlanScope(plan);
  demand(HASH.test(plan.hostIdentitySha256 ?? '') && HASH.test(plan.newControlSha256 ?? '') && HASH.test(plan.snapshot?.activeSha256 ?? ''), 'Control handoff plan is missing exact identities');
  demand(context && plan.newControlSha256 === context.controlSha256 && plan.hostIdentitySha256 === context.hostIdentitySha256 && plan.snapshot.activeSha256 === context.activeSha256, 'Control handoff target or live identity changed');

  const { approval, signature } = approvalEnvelope ?? {};
  demand(approval?.contract === `${CONTRACT}_APPROVAL` && approval.operationId === plan.operationId && approval.action === plan.action &&
    approval.hostIdentitySha256 === plan.hostIdentitySha256 && approval.planSha256 === digest(plan), 'Approval does not bind the exact control handoff plan');
  demand(typeof signature === 'string' && SIGNATURE.test(signature), 'Invalid control handoff signature encoding');
  demand(crypto.createPublicKey(publicKey).asymmetricKeyType === 'ed25519' &&
    crypto.verify(null, Buffer.from(canonical(approval)), publicKey, Buffer.from(signature, 'base64')), 'Control handoff signature verification failed');
  const issuedAt = timestamp(approval.issuedAt, 'approval issue time');
  const expiresAt = timestamp(approval.expiresAt, 'approval expiry time');
  demand(expiresAt > issuedAt && expiresAt - issuedAt <= 4 * 3600000, 'Approval is not in its bounded validity window');

  demand(receipt?.contract === `${CONTRACT}_RECEIPT` && receipt.decision === 'PASS' && receipt.operationId === plan.operationId &&
    receipt.planSha256 === digest(plan) && receipt.approvalSha256 === digest(approvalEnvelope), 'Control handoff receipt does not bind the accepted authority');
  const acceptedAt = timestamp(receipt.acceptedAt, 'receipt acceptance time');
  demand(acceptedAt >= issuedAt && acceptedAt <= expiresAt && acceptedAt <= now + 30000, 'Control handoff acceptance is outside its authority window');

  demand(pointer?.operationId === plan.operationId && pointer.receiptSha256 === digest(receipt), 'Control handoff pointer is not bound to the accepted receipt');
  return plan;
}

export function validateControlRollbackApproval({ plan, receipt, approvalEnvelope } = {}, publicKey, context, now = Date.now()) {
  validatePlanScope(plan);
  demand(HASH.test(plan.hostIdentitySha256 ?? '') && HASH.test(plan.newControlSha256 ?? '') && HASH.test(plan.snapshot?.activeSha256 ?? ''), 'Control handoff plan is missing exact identities');
  demand(context && plan.newControlSha256 === context.controlSha256 && plan.hostIdentitySha256 === context.hostIdentitySha256 && plan.snapshot.activeSha256 === context.activeSha256, 'Control rollback target or live identity changed');
  demand(receipt?.contract === `${CONTRACT}_RECEIPT` && receipt.decision === 'PASS' && receipt.operationId === plan.operationId && receipt.planSha256 === digest(plan), 'Control rollback requires the exact accepted forward receipt');

  const { approval, signature } = approvalEnvelope ?? {};
  demand(approval?.contract === `${CONTRACT}_ROLLBACK_APPROVAL` && approval.action === 'CONTROL_ROLLBACK' &&
    approval.operationId === plan.operationId && approval.hostIdentitySha256 === plan.hostIdentitySha256 &&
    approval.planSha256 === digest(plan) && approval.receiptSha256 === digest(receipt), 'Rollback approval does not bind the exact forward authority');
  demand(typeof signature === 'string' && SIGNATURE.test(signature), 'Invalid control rollback signature encoding');
  demand(crypto.createPublicKey(publicKey).asymmetricKeyType === 'ed25519' &&
    crypto.verify(null, Buffer.from(canonical(approval)), publicKey, Buffer.from(signature, 'base64')), 'Control rollback signature verification failed');
  const issuedAt = timestamp(approval.issuedAt, 'rollback approval issue time');
  const expiresAt = timestamp(approval.expiresAt, 'rollback approval expiry time');
  demand(expiresAt > issuedAt && expiresAt - issuedAt <= 4 * 3600000 && issuedAt <= now + 30000 && expiresAt >= now, 'Rollback approval is not currently valid');
  return plan;
}

export function validatePendingControlHandoffAuthority({ plan, approvalEnvelope, intent, pending } = {}, publicKey, context, now = Date.now()) {
  validatePlanScope(plan);
  demand(HASH.test(plan.hostIdentitySha256 ?? '') && HASH.test(plan.newControlSha256 ?? '') && HASH.test(plan.snapshot?.activeSha256 ?? ''), 'Control handoff plan is missing exact identities');
  demand(typeof plan.oldMainTarget === 'string' && typeof plan.newMainTarget === 'string' && plan.oldMainTarget !== plan.newMainTarget && HASH.test(plan.newUnitSha256 ?? '') && plan.applicationRestartAllowed === false, 'Pending handoff cannot authorize application deployment');
  demand(context && plan.newControlSha256 === context.controlSha256 && plan.hostIdentitySha256 === context.hostIdentitySha256 && plan.snapshot.activeSha256 === context.activeSha256 &&
    context.mainTarget === plan.newMainTarget && context.unitSha256 === plan.newUnitSha256, 'Pending control handoff postimage or live identity changed');

  const { approval, signature } = approvalEnvelope ?? {};
  demand(approval?.contract === `${CONTRACT}_APPROVAL` && approval.operationId === plan.operationId && approval.action === plan.action &&
    approval.hostIdentitySha256 === plan.hostIdentitySha256 && approval.planSha256 === digest(plan), 'Approval does not bind the exact control handoff plan');
  demand(typeof signature === 'string' && SIGNATURE.test(signature), 'Invalid control handoff signature encoding');
  demand(crypto.createPublicKey(publicKey).asymmetricKeyType === 'ed25519' &&
    crypto.verify(null, Buffer.from(canonical(approval)), publicKey, Buffer.from(signature, 'base64')), 'Control handoff signature verification failed');
  const issuedAt = timestamp(approval.issuedAt, 'approval issue time');
  const expiresAt = timestamp(approval.expiresAt, 'approval expiry time');
  demand(expiresAt > issuedAt && expiresAt - issuedAt <= 4 * 3600000, 'Approval is not in its bounded validity window');

  demand(intent?.operationId === plan.operationId && intent.planSha256 === digest(plan) && intent.approvalSha256 === digest(approvalEnvelope), 'Pending handoff intent does not bind the approved plan');
  const authorizedAt = timestamp(intent.authorizedAt, 'pending handoff authorization time');
  demand(authorizedAt >= issuedAt && authorizedAt <= expiresAt && authorizedAt <= now + 30000, 'Pending handoff authorization is outside its authority window');
  demand(pending?.operationId === plan.operationId, 'Pending handoff marker does not bind the operation');
  return plan;
}

export function validateControlHandoffRecoveryAuthority({ plan, approvalEnvelope, intent } = {}, publicKey, context, now = Date.now()) {
  validatePlanScope(plan);
  demand(plan.rollbackAllowed === true, 'Invalid rollback-authorized control handoff plan');
  demand(HASH.test(plan.hostIdentitySha256 ?? '') && HASH.test(plan.newControlSha256 ?? '') && HASH.test(plan.snapshot?.activeSha256 ?? ''), 'Control handoff plan is missing exact identities');
  demand(context && plan.newControlSha256 === context.controlSha256 && plan.hostIdentitySha256 === context.hostIdentitySha256 && plan.snapshot.activeSha256 === context.activeSha256, 'Control recovery target or live identity changed');

  const { approval, signature } = approvalEnvelope ?? {};
  demand(approval?.contract === `${CONTRACT}_APPROVAL` && approval.operationId === plan.operationId && approval.action === plan.action &&
    approval.hostIdentitySha256 === plan.hostIdentitySha256 && approval.planSha256 === digest(plan), 'Approval does not bind the exact control handoff plan');
  demand(typeof signature === 'string' && SIGNATURE.test(signature), 'Invalid control handoff signature encoding');
  demand(crypto.createPublicKey(publicKey).asymmetricKeyType === 'ed25519' &&
    crypto.verify(null, Buffer.from(canonical(approval)), publicKey, Buffer.from(signature, 'base64')), 'Control handoff signature verification failed');
  const issuedAt = timestamp(approval.issuedAt, 'approval issue time');
  const expiresAt = timestamp(approval.expiresAt, 'approval expiry time');
  demand(expiresAt > issuedAt && expiresAt - issuedAt <= 4 * 3600000, 'Approval is not in its bounded validity window');

  demand(intent?.operationId === plan.operationId && intent.planSha256 === digest(plan) && intent.approvalSha256 === digest(approvalEnvelope), 'Recovery intent does not bind the approved handoff');
  const authorizedAt = timestamp(intent.authorizedAt, 'recovery authorization time');
  demand(authorizedAt >= issuedAt && authorizedAt <= expiresAt && authorizedAt <= now + 30000, 'Recovery authorization is outside its authority window');
  return { plan, expired: now > expiresAt };
}
