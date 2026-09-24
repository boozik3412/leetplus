import crypto from 'node:crypto';
import { canonical, demand, digest } from './contract.mjs';

export const PERMIT_CONTRACT = 'LEETPLUS_COMPOSE_EXACT_TARGET_CONTROL_HANDOFF_V1_PERMIT';
export const EXACT_TARGET_ACTION = 'CONTROL_HANDOFF_EXACT_TARGET';
export const ROLLBACK_PERMIT_CONTRACT = 'LEETPLUS_COMPOSE_EXACT_TARGET_CONTROL_HANDOFF_V1_ROLLBACK_PERMIT';
export const EXACT_TARGET_ROLLBACK_ACTION = 'CONTROL_HANDOFF_EXACT_TARGET_ROLLBACK';
const HASH = /^[a-f0-9]{64}$/;
const RELEASE = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;

function exactKeys(value, keys, label) {
  demand(value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()),
  `Invalid ${label} fields`);
}

function time(value, label) {
  demand(typeof value === 'string' && UTC.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === new Date(Date.parse(value)).toISOString(), `Invalid ${label}`);
  return Date.parse(value);
}

/**
 * Verify an independent, domain-separated permit against already observed
 * predecessor/target bytes. `expected` is built by the serving bridge from
 * its own root and the staged target's admitted archive, never by target code.
 * Historical continuity may allow an expired permit after the accepted
 * receipt; a new forward effect may not.
 */
export function validateExactTargetPermit(envelope, publicKey, expected, {
  now = Date.now(), allowExpired = false,
} = {}) {
  exactKeys(envelope, ['permit', 'signature'], 'exact-target permit envelope');
  const { permit, signature } = envelope;
  exactKeys(permit, ['contract', 'operationId', 'action', 'hostIdentitySha256',
    'planSha256', 'activeSha256', 'predecessor', 'target', 'issuedAt', 'expiresAt'], 'exact-target permit');
  exactKeys(permit.predecessor, ['releaseSha', 'manifestSha256', 'verifierSha256'], 'permit predecessor');
  exactKeys(permit.target, ['releaseSha', 'manifestSha256', 'admissionSha256',
    'controlArchiveSha256', 'filesSha256', 'criticalFilesSha256'], 'permit target');
  demand(permit.contract === PERMIT_CONTRACT && permit.action === EXACT_TARGET_ACTION &&
    UUID.test(permit.operationId) && HASH.test(permit.hostIdentitySha256) &&
    HASH.test(permit.planSha256) && HASH.test(permit.activeSha256) &&
    RELEASE.test(permit.predecessor.releaseSha) && RELEASE.test(permit.target.releaseSha) &&
    permit.predecessor.releaseSha !== permit.target.releaseSha &&
    Object.entries(permit.predecessor).filter(([name]) => name !== 'releaseSha').every(([, value]) => HASH.test(value)) &&
    Object.entries(permit.target).filter(([name]) => name !== 'releaseSha').every(([, value]) => HASH.test(value)),
  'Invalid exact-target permit identity');
  const issuedAt = time(permit.issuedAt, 'permit issue time');
  const expiresAt = time(permit.expiresAt, 'permit expiry time');
  demand(expiresAt > issuedAt && expiresAt - issuedAt <= 4 * 3600_000 &&
    issuedAt <= now + 30_000 && (allowExpired || expiresAt > now),
  'Exact-target permit is outside its bounded validity window');
  exactKeys(expected, ['operationId', 'action', 'hostIdentitySha256', 'planSha256',
    'activeSha256', 'predecessor', 'target'], 'expected exact-target authority');
  const bound = Object.fromEntries(Object.entries(permit).filter(([name]) =>
    !['contract', 'issuedAt', 'expiresAt'].includes(name)));
  demand(canonical(bound) === canonical(expected), 'Exact-target permit differs from observed plan or installed bytes');
  demand(typeof signature === 'string' && SIGNATURE.test(signature), 'Invalid exact-target permit signature encoding');
  const trustedKey = crypto.createPublicKey(publicKey);
  demand(trustedKey.asymmetricKeyType === 'ed25519' &&
    crypto.verify(null, Buffer.from(canonical(permit)), trustedKey, Buffer.from(signature, 'base64')),
  'Exact-target permit signature verification failed');
  return { permit, permitSha256: digest(permit), envelopeSha256: digest(envelope) };
}

export function validateExactTargetRollbackPermit(envelope, publicKey, expected, {
  now = Date.now(),
} = {}) {
  exactKeys(envelope, ['permit', 'signature'], 'exact-target rollback envelope');
  const { permit, signature } = envelope;
  exactKeys(permit, ['contract', 'operationId', 'action', 'hostIdentitySha256',
    'planSha256', 'receiptSha256', 'activeSha256', 'predecessor', 'target',
    'issuedAt', 'expiresAt'], 'exact-target rollback permit');
  exactKeys(permit.predecessor, ['releaseSha', 'manifestSha256', 'verifierSha256'], 'rollback predecessor');
  exactKeys(permit.target, ['releaseSha', 'manifestSha256', 'admissionSha256',
    'controlArchiveSha256', 'filesSha256', 'criticalFilesSha256'], 'rollback target');
  demand(permit.contract === ROLLBACK_PERMIT_CONTRACT &&
    permit.action === EXACT_TARGET_ROLLBACK_ACTION && UUID.test(permit.operationId) &&
    HASH.test(permit.hostIdentitySha256) && HASH.test(permit.planSha256) &&
    HASH.test(permit.receiptSha256) && HASH.test(permit.activeSha256) &&
    RELEASE.test(permit.predecessor.releaseSha) && RELEASE.test(permit.target.releaseSha) &&
    Object.entries(permit.predecessor).filter(([name]) => name !== 'releaseSha').every(([, value]) => HASH.test(value)) &&
    Object.entries(permit.target).filter(([name]) => name !== 'releaseSha').every(([, value]) => HASH.test(value)),
  'Invalid exact-target rollback identity');
  const issuedAt = time(permit.issuedAt, 'rollback permit issue time');
  const expiresAt = time(permit.expiresAt, 'rollback permit expiry time');
  demand(expiresAt > issuedAt && expiresAt - issuedAt <= 4 * 3600_000 &&
    issuedAt <= now + 30_000 && expiresAt > now,
  'Exact-target rollback permit is outside its bounded validity window');
  exactKeys(expected, ['operationId', 'action', 'hostIdentitySha256', 'planSha256',
    'receiptSha256', 'activeSha256', 'predecessor', 'target'], 'expected rollback authority');
  const bound = Object.fromEntries(Object.entries(permit).filter(([name]) =>
    !['contract', 'issuedAt', 'expiresAt'].includes(name)));
  demand(canonical(bound) === canonical(expected), 'Exact-target rollback permit differs from accepted forward receipt or live bytes');
  demand(typeof signature === 'string' && SIGNATURE.test(signature), 'Invalid exact-target rollback signature encoding');
  const trustedKey = crypto.createPublicKey(publicKey);
  demand(trustedKey.asymmetricKeyType === 'ed25519' &&
    crypto.verify(null, Buffer.from(canonical(permit)), trustedKey, Buffer.from(signature, 'base64')),
  'Exact-target rollback signature verification failed');
  return { permit, envelopeSha256: digest(envelope) };
}

function expectedFromPlan(plan) {
  demand(plan?.contract === 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V2_PLAN' &&
    plan.action === EXACT_TARGET_ACTION && UUID.test(plan.operationId ?? '') &&
    HASH.test(plan.hostIdentitySha256 ?? '') && HASH.test(plan.oldControlSha256 ?? '') &&
    HASH.test(plan.newControlSha256 ?? '') && HASH.test(plan.snapshot?.activeSha256 ?? '') &&
    plan.applicationRestartAllowed === false && plan.timersMayBeStopped === false &&
    plan.rollbackAllowed === true && plan.maxLockWaitSeconds === 120 &&
    plan.predecessor?.releaseSha === plan.oldReleaseSha &&
    plan.predecessor?.manifestSha256 === plan.oldControlSha256 &&
    plan.target?.releaseSha === plan.newReleaseSha &&
    plan.target?.manifestSha256 === plan.newControlSha256 &&
    plan.permitPath === 'permit.json' &&
    plan.oldReleaseSha !== plan.newReleaseSha &&
    plan.oldMainTarget === `/usr/local/lib/leetplus-compose/${plan.oldReleaseSha}/control.sh` &&
    plan.newMainTarget === `/usr/local/lib/leetplus-compose/${plan.newReleaseSha}/control.sh`,
  'Invalid predecessor-owned exact-target handoff plan');
  return {
    operationId: plan.operationId, action: plan.action,
    hostIdentitySha256: plan.hostIdentitySha256, planSha256: digest(plan),
    activeSha256: plan.snapshot.activeSha256,
    predecessor: plan.predecessor, target: plan.target,
  };
}

/** Verify the predecessor's accepted receipt before granting ordinary B runtime. */
export function validateAcceptedExactTargetHandoff({ plan, permitEnvelope, receipt, pointer } = {},
  publicKey, context, now = Date.now()) {
  const expected = expectedFromPlan(plan);
  demand(context?.controlSha256 === plan.newControlSha256 &&
    context.hostIdentitySha256 === plan.hostIdentitySha256 &&
    context.activeSha256 === plan.snapshot.activeSha256 &&
    context.mainTarget === plan.newMainTarget && context.unitSha256 === plan.newUnitSha256,
  'Accepted exact-target controller postimage changed');
  const authority = validateExactTargetPermit(permitEnvelope, publicKey, expected,
    { now, allowExpired: true });
  exactKeys(receipt, ['contract', 'decision', 'operationId', 'planSha256',
    'permitSha256', 'permitPath', 'authorizedAt', 'acceptedAt'], 'exact-target handoff receipt');
  demand(receipt.contract === `${PERMIT_CONTRACT}_RECEIPT` && receipt.decision === 'PASS' &&
    receipt.operationId === plan.operationId && receipt.planSha256 === digest(plan) &&
    receipt.permitSha256 === authority.envelopeSha256 && receipt.permitPath === 'permit.json' &&
    time(receipt.authorizedAt, 'handoff authorization time') >= Date.parse(authority.permit.issuedAt) &&
    Date.parse(receipt.authorizedAt) <= Date.parse(authority.permit.expiresAt) &&
    time(receipt.acceptedAt, 'handoff acceptance time') >= Date.parse(authority.permit.issuedAt) &&
    Date.parse(receipt.acceptedAt) <= Date.parse(authority.permit.expiresAt) &&
    Date.parse(receipt.acceptedAt) >= Date.parse(receipt.authorizedAt),
  'Exact-target handoff receipt is not bound to its signed permit');
  exactKeys(pointer, ['operationId', 'receiptSha256'], 'exact-target active pointer');
  demand(pointer.operationId === plan.operationId && pointer.receiptSha256 === digest(receipt),
  'Exact-target active pointer is not bound to the accepted receipt');
  return plan;
}

/** A pending switch can boot from its signed intent, while app effects stay fenced. */
export function validatePendingExactTargetHandoff({ plan, permitEnvelope, intent, pending } = {},
  publicKey, context, now = Date.now()) {
  const expected = expectedFromPlan(plan);
  demand(context?.controlSha256 === plan.newControlSha256 &&
    context.hostIdentitySha256 === plan.hostIdentitySha256 &&
    context.activeSha256 === plan.snapshot.activeSha256 &&
    context.mainTarget === plan.newMainTarget && context.unitSha256 === plan.newUnitSha256,
  'Pending exact-target controller postimage changed');
  const authority = validateExactTargetPermit(permitEnvelope, publicKey, expected,
    { now, allowExpired: true });
  exactKeys(intent, ['operationId', 'planSha256', 'permitSha256', 'permitPath', 'authorizedAt'], 'exact-target intent');
  demand(intent.operationId === plan.operationId && intent.planSha256 === digest(plan) &&
    intent.permitSha256 === authority.envelopeSha256 && intent.permitPath === 'permit.json' &&
    time(intent.authorizedAt, 'handoff authorization time') >= Date.parse(authority.permit.issuedAt) &&
    Date.parse(intent.authorizedAt) <= Date.parse(authority.permit.expiresAt) &&
    Date.parse(intent.authorizedAt) <= now + 30_000,
  'Pending exact-target intent is not bound to timely permit authority');
  exactKeys(pending, ['operationId'], 'exact-target pending marker');
  demand(pending.operationId === plan.operationId, 'Exact-target pending marker is foreign');
  return plan;
}
