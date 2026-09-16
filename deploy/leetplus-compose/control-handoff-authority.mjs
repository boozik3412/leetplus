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

function validatePlanScope(plan) {
  demand(plan?.contract === `${CONTRACT}_PLAN` && UUID.test(plan.operationId ?? ''), 'Invalid control handoff plan');
  if (plan.action === 'CONTROL_HANDOFF') return;
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
