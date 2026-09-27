import crypto from 'node:crypto';
import { canonical, demand, digest, EXTERNAL_WORKER_CAPABILITY, renderCompose } from './contract.mjs';
import { EXTERNAL_WORKER_IDENTITY, parseExternalWorkerResult, validateExternalWorkerGrant } from './external-worker-contract.mjs';

export const EXTERNAL_RUN_CONTRACT = 'LEETPLUS_LANGAME_EXTERNAL_NATIVE_RUN_V1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function previousExternalBusinessDate(now = Date.now()) {
  demand(Number.isFinite(now), 'Invalid external worker clock');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yekaterinburg', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)) - 86400000).toISOString().slice(0, 10);
}

/** The native adapters attest installed controller continuity, accepted native
 * app history, exact enrollment authority, own locks and network before this
 * state machine may create a container. No retry after ambiguous provider work.
 */
export async function runExternalWorker({ adapters, now = Date.now(), runId = crypto.randomUUID() }) {
  for (const method of ['assertLocks', 'attestAccepted', 'attestEnrollment', 'verifyNetwork', 'readPriorRun', 'assertNoAmbiguousDate', 'publishRun', 'createStopped', 'verifyStopped', 'startAttached', 'inspectStopped']) {
    demand(typeof adapters?.[method] === 'function', `Missing external worker native adapter: ${method}`);
  }
  demand(UUID.test(runId), 'Native external run ID must be UUID');
  await adapters.assertLocks();
  const authority = await adapters.attestAccepted();
  const { current, publicKey, hostIdentitySha256, secretBytes, grantEnvelope } = authority;
  demand(current?.[current.activeSlot]?.externalWorkerCapability === EXTERNAL_WORKER_CAPABILITY, 'Accepted app cannot execute the external worker');
  const grant = validateExternalWorkerGrant(grantEnvelope, publicKey, current, hostIdentitySha256, secretBytes, now);
  await adapters.attestEnrollment(authority);
  await adapters.verifyNetwork();
  const businessDate = grant.mode === 'CANARY' ? grant.businessDate : previousExternalBusinessDate(now);
  const identity = grant.mode === 'CANARY' ? grant.id : runId;
  const prior = await adapters.readPriorRun(identity);
  // A consumed canary is never run twice; reconciliation is a separate read.
  demand(!prior, 'External run already has an intent; reconcile its existing result');
  await adapters.assertNoAmbiguousDate({ mode: grant.mode, businessDate, identity });
  const spec = renderCompose({ blue: current.blue, green: current.green, dataRelease: current.dataRelease, activeSlot: current.activeSlot });
  const service = spec.services[EXTERNAL_WORKER_IDENTITY.worker];
  demand(service && service.image === current[current.activeSlot].images.api, 'External worker is not bound to accepted image');
  service.environment.LANGAME_EXTERNAL_WORKER_RUN_ID = runId;
  service.environment.LANGAME_EXTERNAL_WORKER_BUSINESS_DATE = businessDate;
  const intent = { contract: `${EXTERNAL_RUN_CONTRACT}_INTENT`, worker: grant.worker, identity, runId, businessDate,
    mode: grant.mode, grantEnvelopeSha256: digest(grantEnvelope), activeSha256: digest(current),
    generation: current.generation, releaseSha: grant.releaseSha, composeSha256: digest(spec), startedAt: new Date(now).toISOString() };
  await adapters.publishRun(identity, 'compose', spec);
  await adapters.publishRun(identity, 'intent', intent);
  await adapters.createStopped(spec, intent);
  await adapters.verifyStopped(spec, intent);
  // Authority may expire while Docker creates the stopped container.
  validateExternalWorkerGrant(grantEnvelope, publicKey, current, hostIdentitySha256, secretBytes, adapters.now?.() ?? Date.now());
  await adapters.verifyNetwork();
  const execution = await adapters.startAttached(service.container_name, intent);
  const stopped = await adapters.inspectStopped(service.container_name);
  demand(stopped?.running === false && stopped.pid === 0 && execution && typeof execution.stdout === 'string', 'External worker outcome is ambiguous; reconcile without provider retry');
  const result = parseExternalWorkerResult(execution.stdout, { runId, grant, businessDate, allowReplayed: execution.exitCode === 75 });
  demand(stopped.exitCode === execution.exitCode && (result.replayed ? execution.exitCode === 75 : result.decision === 'FAILED' ? execution.exitCode === 1 : execution.exitCode === 0), 'External worker result/exit-code mismatch');
  const receipt = { contract: `${EXTERNAL_RUN_CONTRACT}_RECEIPT`, decision: result.replayed ? 'NO_NEW_EFFECT' : result.decision,
    intentSha256: digest(intent), resultSha256: digest(result), outputSha256: digest(execution.stdout),
    worker: grant.worker, identity, runId, originalRunId: result.originalRunId,
    businessDate, releaseSha: grant.releaseSha, generation: current.generation,
    grantEnvelopeSha256: digest(grantEnvelope), containerId: stopped.containerId, exitCode: execution.exitCode };
  demand(typeof stopped.containerId === 'string' && /^[a-f0-9]{64}$/.test(stopped.containerId), 'External container identity missing');
  await adapters.publishRun(identity, 'result', result);
  await adapters.publishRun(identity, 'receipt', receipt);
  return receipt;
}

export function validateExternalRunReceipt(receipt, { intent, result, output, grantEnvelope, current }) {
  demand(receipt?.contract === `${EXTERNAL_RUN_CONTRACT}_RECEIPT` && receipt.intentSha256 === digest(intent) &&
    receipt.resultSha256 === digest(result) && receipt.outputSha256 === digest(output) &&
    receipt.grantEnvelopeSha256 === digest(grantEnvelope) && intent.grantEnvelopeSha256 === digest(grantEnvelope) &&
    intent.activeSha256 === digest(current) && receipt.releaseSha === grantEnvelope.grant.releaseSha &&
    receipt.generation === current.generation && receipt.identity === intent.identity && receipt.runId === intent.runId &&
    receipt.businessDate === intent.businessDate && intent.contract === `${EXTERNAL_RUN_CONTRACT}_INTENT` &&
    intent.worker === grantEnvelope.grant.worker && receipt.worker === intent.worker &&
    receipt.exitCode === (result.replayed ? 75 : result.decision === 'FAILED' ? 1 : 0) &&
    receipt.decision === (result.replayed ? 'NO_NEW_EFFECT' : result.decision),
  'External native receipt does not bind its exact immutable run');
  parseExternalWorkerResult(output, { runId: intent.runId, grant: grantEnvelope.grant,
    businessDate: intent.businessDate, allowReplayed: result.replayed === true });
  demand(`${JSON.stringify(result)}\n` === output, 'External result output bytes drift');
  return receipt;
}
