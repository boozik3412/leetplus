import crypto from 'node:crypto';
import { canonical, demand, digest, EXTERNAL_WORKER_CAPABILITY } from './contract.mjs';
import { EXTERNAL_WORKER_IDENTITY, validateExternalWorkerGrant } from './external-worker-contract.mjs';
import { validateExternalRunReceipt } from './external-worker-runtime.mjs';

export const ENROLLMENT_CONTRACT = 'LEETPLUS_LANGAME_EXTERNAL_WORKER_ENROLLMENT_V1';
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const exactKeys = (value, keys, name) => demand(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(','), `Invalid ${name} fields`);
function utc(value) { const n = Date.parse(value); demand(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(n) && [new Date(n).toISOString(), new Date(n).toISOString().replace('.000Z', 'Z')].includes(value), 'Invalid enrollment time'); return n; }

export function validateExternalCanaryEvidence(plan, grantEnvelope, evidence, publicKey, hostIdentitySha256, now = Date.now()) {
  exactKeys(evidence, ['enrollmentPlan', 'enrollmentReceipt', 'grantEnvelope', 'secretBytes', 'active',
    'runIntent', 'runResult', 'runReceipt'], 'external canary evidence');
  const oldPlan = evidence.enrollmentPlan, oldReceipt = evidence.enrollmentReceipt;
  demand(oldPlan?.mode === 'CANARY' && oldPlan.action === 'ENROLL_CANARY' &&
    oldPlan.hostIdentitySha256 === plan.hostIdentitySha256 && oldPlan.activeSha256 === plan.activeSha256 &&
    oldPlan.releaseSha === plan.releaseSha && oldPlan.generation === plan.generation &&
    oldReceipt?.contract === `${ENROLLMENT_CONTRACT}_RECEIPT` && oldReceipt.decision === 'PASS' &&
    oldReceipt.planSha256 === digest(oldPlan) && oldReceipt.grantEnvelopeSha256 === digest(evidence.grantEnvelope) &&
    digest(oldReceipt) === plan.previousEnrollmentReceiptSha256 &&
    digest(evidence.runReceipt) === plan.canaryReceiptSha256,
  'External TIMER lacks an exact accepted CANARY predecessor');
  const oldGrant = validateExternalWorkerGrant(evidence.grantEnvelope, publicKey, evidence.active,
    hostIdentitySha256, evidence.secretBytes, now, { allowExpired: true });
  const nextGrant = grantEnvelope.grant;
  for (const field of ['tenantId', 'tenantSlug', 'sourceId', 'storeId', 'domain', 'clubId', 'customerStage',
    'profileRevision', 'executionRevision', 'storeRevision', 'hostIdentitySha256', 'releaseSha', 'generation'])
    demand(oldGrant[field] === nextGrant[field], `External TIMER changed CANARY ${field}`);
  validateExternalRunReceipt(evidence.runReceipt, { intent: evidence.runIntent, result: evidence.runResult,
    output: `${JSON.stringify(evidence.runResult)}\n`, grantEnvelope: evidence.grantEnvelope, current: evidence.active });
  demand(evidence.runResult.mode === 'CANARY' && evidence.runResult.businessDate === oldGrant.businessDate &&
    ['SUCCESS', 'PARTIAL'].includes(evidence.runResult.decision) && evidence.runResult.failedScopes.length === 0 &&
    evidence.runResult.replayed === false && evidence.runResult.originalRunId === null &&
    evidence.runReceipt.decision === evidence.runResult.decision &&
    evidence.runResult.partialScopes.every(scope => ['BUSINESS_FACTS', 'GUEST_FOUNDATION', 'STAFF_SHIFTS', 'BUSINESS_SNAPSHOTS'].includes(scope)),
  'External CANARY did not produce the bounded successful or permission-partial result');
  return evidence;
}

export function validateExternalEnrollmentPlan(plan, { current, controllerManifestSha256, hostIdentitySha256, secretBytes, grantEnvelope, serviceUnitBytes, timerUnitBytes, networkPolicySha256, previousEnrollmentReceiptSha256 = null, canaryReceiptSha256 = null, canaryEvidence = null, publicKey, now = Date.now(), allowExpired = false }) {
  exactKeys(plan, ['contract', 'operationId', 'action', 'hostIdentitySha256', 'activeSha256', 'controllerManifestSha256',
    'releaseSha', 'generation', 'worker', 'mode', 'secretSha256', 'grantEnvelopeSha256', 'serviceUnitSha256',
    'timerUnitSha256', 'networkPolicySha256', 'previousEnrollmentReceiptSha256', 'canaryReceiptSha256', 'issuedAt', 'expiresAt'], 'external enrollment plan');
  demand(plan.contract === `${ENROLLMENT_CONTRACT}_PLAN` && UUID.test(plan.operationId ?? '') &&
    ['ENROLL_CANARY', 'ENROLL_TIMER'].includes(plan.action) && plan.worker === EXTERNAL_WORKER_IDENTITY.worker &&
    plan.mode === plan.action.slice('ENROLL_'.length) && SHA.test(plan.hostIdentitySha256 ?? '') &&
    SHA.test(plan.controllerManifestSha256 ?? '') && SHA.test(plan.networkPolicySha256 ?? '') &&
    (plan.previousEnrollmentReceiptSha256 === null || SHA.test(plan.previousEnrollmentReceiptSha256 ?? '')) &&
    (plan.mode === 'CANARY' ? plan.canaryReceiptSha256 === null : SHA.test(plan.canaryReceiptSha256 ?? '')),
  'Invalid external enrollment scope');
  demand(current?.[current.activeSlot]?.externalWorkerCapability === EXTERNAL_WORKER_CAPABILITY &&
    plan.activeSha256 === digest(current) && plan.releaseSha === current[current.activeSlot].releaseSha &&
    plan.generation === current.generation && plan.hostIdentitySha256 === hostIdentitySha256 &&
    plan.controllerManifestSha256 === controllerManifestSha256 && plan.networkPolicySha256 === networkPolicySha256 &&
    plan.secretSha256 === digest(secretBytes) && plan.grantEnvelopeSha256 === digest(grantEnvelope) &&
    plan.serviceUnitSha256 === digest(serviceUnitBytes) && plan.timerUnitSha256 === digest(timerUnitBytes) &&
    plan.previousEnrollmentReceiptSha256 === previousEnrollmentReceiptSha256 &&
    plan.canaryReceiptSha256 === canaryReceiptSha256,
  'External enrollment source/host/secret/unit binding drift');
  const grant = validateExternalWorkerGrant(grantEnvelope, publicKey, current, hostIdentitySha256, secretBytes, now, { allowExpired });
  demand(grant.mode === plan.mode, 'External enrollment grant mode drift');
  if (plan.mode === 'TIMER') validateExternalCanaryEvidence(plan, grantEnvelope, canaryEvidence, publicKey, hostIdentitySha256, now);
  else demand(canaryEvidence === null, 'CANARY enrollment cannot import a prior run');
  const issued = utc(plan.issuedAt), expiry = utc(plan.expiresAt);
  demand((allowExpired || issued <= now + 30000) && (allowExpired || expiry > now) && expiry > issued && expiry - issued <= 4 * 3600000 &&
    expiry <= Date.parse(grant.expiresAt), 'External enrollment evidence expired or unbounded');
  return plan;
}

export function validateExternalEnrollmentApproval(plan, envelope, publicKey, now = Date.now(), { allowExpired = false } = {}) {
  exactKeys(envelope, ['approval', 'signature'], 'external enrollment approval envelope');
  const { approval, signature } = envelope;
  exactKeys(approval, ['contract', 'operationId', 'planSha256', 'hostIdentitySha256', 'action', 'issuedAt', 'expiresAt'], 'external enrollment approval');
  demand(approval.contract === `${ENROLLMENT_CONTRACT}_APPROVAL` && approval.operationId === plan.operationId &&
    approval.planSha256 === digest(plan) && approval.hostIdentitySha256 === plan.hostIdentitySha256 &&
    approval.action === plan.action && /^[A-Za-z0-9+/]{86}==$/.test(signature ?? ''), 'External enrollment approval identity drift');
  const issued = utc(approval.issuedAt), expiry = utc(approval.expiresAt);
  demand((allowExpired || issued <= now + 30000) && (allowExpired || expiry > now) && expiry > issued && expiry - issued <= 4 * 3600000 &&
    expiry <= Date.parse(plan.expiresAt), 'External enrollment approval is stale or widens plan expiry');
  const key = crypto.createPublicKey(publicKey);
  demand(key.asymmetricKeyType === 'ed25519' && crypto.verify(null, Buffer.from(canonical(approval)), key, Buffer.from(signature, 'base64')), 'External enrollment approval signature invalid');
  return approval;
}

export function validateExternalEnrollmentReceipt(receipt, { plan, approvalEnvelope, current, secretBytes, grantEnvelope, serviceUnitBytes, timerUnitBytes, networkReceiptSha256, timerState }) {
  exactKeys(receipt, ['contract', 'decision', 'operationId', 'planSha256', 'approvalEnvelopeSha256', 'activeSha256',
    'secretSha256', 'grantEnvelopeSha256', 'serviceUnitSha256', 'timerUnitSha256', 'networkReceiptSha256', 'timerState', 'acceptedAt'], 'external enrollment receipt');
  demand(receipt.contract === `${ENROLLMENT_CONTRACT}_RECEIPT` && receipt.decision === 'PASS' &&
    receipt.operationId === plan.operationId && receipt.planSha256 === digest(plan) &&
    receipt.approvalEnvelopeSha256 === digest(approvalEnvelope) && receipt.activeSha256 === digest(current) &&
    receipt.secretSha256 === digest(secretBytes) && receipt.grantEnvelopeSha256 === digest(grantEnvelope) &&
    receipt.serviceUnitSha256 === digest(serviceUnitBytes) && receipt.timerUnitSha256 === digest(timerUnitBytes) &&
    receipt.networkReceiptSha256 === networkReceiptSha256 && SHA.test(networkReceiptSha256 ?? '') &&
    canonical(receipt.timerState) === canonical(timerState), 'External enrollment receipt/postimage drift');
  exactKeys(timerState, ['unit', 'loadState', 'enabled', 'active', 'subState'], 'external enrollment timer');
  demand(timerState.unit === 'leetplus-compose-external-daily.timer' && timerState.loadState === 'loaded' &&
    (plan.mode === 'CANARY' ? !timerState.enabled && !timerState.active : timerState.enabled && timerState.active) &&
    utc(receipt.acceptedAt) >= Date.parse(plan.issuedAt) && Date.parse(receipt.acceptedAt) <= Date.parse(plan.expiresAt) &&
    Date.parse(receipt.acceptedAt) >= Date.parse(approvalEnvelope.approval.issuedAt) &&
    Date.parse(receipt.acceptedAt) <= Date.parse(approvalEnvelope.approval.expiresAt),
  'External enrollment timer/time postimage drift');
  return receipt;
}
