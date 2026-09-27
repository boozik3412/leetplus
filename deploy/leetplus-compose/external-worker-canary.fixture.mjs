import crypto from 'node:crypto';
import { canonical, digest } from './contract.mjs';

export function boundCanaryEvidence({ plan, grantEnvelope, current, timerSecretBytes, privateKey }) {
  const businessDate = '2026-09-26';
  const profile = JSON.parse(timerSecretBytes);
  profile.LANGAME_EXTERNAL_WORKER_MODE = 'CANARY';
  profile.LANGAME_EXTERNAL_WORKER_DATE = businessDate;
  const secretBytes = Buffer.from(canonical(profile));
  const grant = { ...grantEnvelope.grant, id: crypto.randomUUID(), mode: 'CANARY',
    secretSha256: digest(secretBytes), expiresAt: '2026-09-27T12:00:00Z', businessDate };
  const priorGrant = { grant, signature: crypto.sign(null, Buffer.from(canonical(grant)), privateKey).toString('base64') };
  const enrollmentPlan = { ...plan, operationId: crypto.randomUUID(), action: 'ENROLL_CANARY', mode: 'CANARY',
    secretSha256: digest(secretBytes), grantEnvelopeSha256: digest(priorGrant),
    previousEnrollmentReceiptSha256: null, canaryReceiptSha256: null };
  const enrollmentReceipt = { contract: 'LEETPLUS_LANGAME_EXTERNAL_WORKER_ENROLLMENT_V1_RECEIPT', decision: 'PASS',
    operationId: enrollmentPlan.operationId, planSha256: digest(enrollmentPlan),
    approvalEnvelopeSha256: '1'.repeat(64), activeSha256: digest(current), secretSha256: digest(secretBytes),
    grantEnvelopeSha256: digest(priorGrant), serviceUnitSha256: plan.serviceUnitSha256,
    timerUnitSha256: plan.timerUnitSha256, networkReceiptSha256: '2'.repeat(64),
    timerState: { unit: 'leetplus-compose-external-daily.timer', loadState: 'loaded', enabled: false, active: false, subState: 'dead' },
    acceptedAt: '2026-09-27T09:50:00Z' };
  const runId = crypto.randomUUID();
  const runIntent = { contract: 'LEETPLUS_LANGAME_EXTERNAL_NATIVE_RUN_V1_INTENT', worker: grant.worker,
    identity: grant.id, runId, businessDate, mode: 'CANARY', grantEnvelopeSha256: digest(priorGrant),
    activeSha256: digest(current), generation: current.generation, releaseSha: grant.releaseSha,
    composeSha256: '3'.repeat(64), startedAt: '2026-09-27T09:55:00Z' };
  const runResult = { contract: 'LEETPLUS_LANGAME_EXTERNAL_WORKER_RESULT_V1', worker: grant.worker, runId,
    originalRunId: null, replayed: false, mode: 'CANARY', businessDate, tenantId: grant.tenantId,
    tenantSlug: grant.tenantSlug, sourceId: grant.sourceId, storeId: grant.storeId,
    profileRevision: grant.profileRevision, executionRevision: grant.executionRevision, storeRevision: grant.storeRevision,
    decision: 'PARTIAL', partialScopes: ['BUSINESS_FACTS'], failedScopes: [] };
  const runReceipt = { contract: 'LEETPLUS_LANGAME_EXTERNAL_NATIVE_RUN_V1_RECEIPT', decision: 'PARTIAL',
    intentSha256: digest(runIntent), resultSha256: digest(runResult), outputSha256: digest(`${JSON.stringify(runResult)}\n`),
    worker: grant.worker, identity: grant.id, runId, originalRunId: null, businessDate,
    releaseSha: grant.releaseSha, generation: grant.generation, grantEnvelopeSha256: digest(priorGrant),
    containerId: '4'.repeat(64), exitCode: 0 };
  return { enrollmentPlan, enrollmentReceipt, grantEnvelope: priorGrant, secretBytes,
    active: current, runIntent, runResult, runReceipt };
}
