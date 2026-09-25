#!/usr/bin/env node
/** Read-only receipt observer. It cannot apply/resume, renew a grant, or turn a
 * terminal native POSTCHECK into independent user/worker acceptance. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONTRACT, demand, digest, canonical } from './contract.mjs';
import { PHASES, validatePlan, validateApproval, validateChain } from './orchestrator.mjs';
import { validateAcceptedApplicationSnapshot } from './control-handoff-runtime.mjs';
import { validateWorkerContinuationReceipt } from './worker-continuation-runtime.mjs';
import { WORKERS, TIMER_UNITS } from './worker-continuation.mjs';
import { PLAN_CONTRACT as APP_ONLY_PLAN, validateAppOnlyPlan } from './app-only-baseline.mjs';

function verifyContinuation(plan, mode, snapshot, publicKey) {
  const receipt = mode === 'FORWARD' ? snapshot.workerContinuationReceipt : snapshot.workerContinuationRollbackReceipt;
  const intent = snapshot.workerContinuationIntent;
  const rollbackIntent = snapshot.workerContinuationRollbackIntent;
  demand(receipt && intent, 'Native terminal lacks worker continuation records');
  const staged = mode === 'FORWARD' ? snapshot.forwardWorkerEnvelopes : snapshot.rollbackWorkerEnvelopes;
  demand(Array.isArray(staged) && staged.length === WORKERS.length &&
    Array.isArray(snapshot.forwardWorkerEnvelopes) && snapshot.forwardWorkerEnvelopes.length === WORKERS.length &&
    Array.isArray(snapshot.rollbackWorkerEnvelopes) && snapshot.rollbackWorkerEnvelopes.length === WORKERS.length,
  'Native continuation lacks staged signed grants');
  const activeSlot = mode === 'FORWARD' ? plan.targetSlot : plan.previous.activeSlot;
  const generation = mode === 'FORWARD' ? plan.generation + 1 : plan.generation + 2;
  const current = { activeSlot, generation, [activeSlot]: { releaseSha: plan[activeSlot].releaseSha } };
  const profiles = Object.fromEntries(WORKERS.map(worker => [worker, snapshot.workerProfiles?.[worker]]));
  demand(WORKERS.every(worker => Buffer.isBuffer(profiles[worker]) &&
    digest(profiles[worker]) === plan.workerContinuation.profileBindings.find(binding => binding.worker === worker)?.profileSha256),
  'Native continuation lacks exact immutable worker profiles');
  const postimage = { current, grantEnvelopes: staged,
    timers: plan.workerContinuation.originalTimers.map(binding => ({ worker: binding.worker, unit: TIMER_UNITS[binding.worker],
      enabled: binding.enabled, active: binding.active })) };
  validateWorkerContinuationReceipt({ plan, receipt, postimage,
    context: { publicKey, hostIdentitySha256: plan.hostIdentitySha256, profiles, allowExpired: true,
      intent, rollbackIntent, forwardEnvelopes: snapshot.forwardWorkerEnvelopes,
      rollbackEnvelopes: snapshot.rollbackWorkerEnvelopes } });
  return receipt;
}

export function inspectNative(snapshot, now = Date.now()) {
  const { plan, records, final, rolledBack, approval, publicKey, packet } = snapshot;
  validatePlan(plan);
  if (plan.contract === APP_ONLY_PLAN) {
    demand(snapshot.appBundle && snapshot.appAdmission && snapshot.dataBaselineCertification,
      'V2 native operation lacks immutable app/data evidence');
    validateAppOnlyPlan(plan, { bundle: snapshot.appBundle, admission: snapshot.appAdmission,
      certification: snapshot.dataBaselineCertification,
      readinessReceiptSha256: snapshot.dataBaselineCertification.readinessReceiptSha256,
      now, allowExpired: true });
  }
  const packetContract = plan.contract === APP_ONLY_PLAN
    ? 'LEETPLUS_RELEASE_PREPARATION_V2_GO_PACKET'
    : 'LEETPLUS_RELEASE_PREPARATION_V1_GO_PACKET';
  demand(packet?.contract === packetContract && packet.decision === 'PREPARED_NOT_AUTHORIZATION' && packet.nativePlanSha256 === digest(plan) && packet.nativeOperationId === plan.operationId, 'GO packet does not bind native plan');
  demand(plan.workerContinuation && canonical(packet.workerContinuation) === canonical(plan.workerContinuation), 'Worker continuation policy is not bound by native plan');
  validateChain(plan, records);
  const completedPhases = PHASES.filter(phase => records[phase]?.receipt);
  let status = 'PREPARED', waitReason = 'EXACT_GO_REQUIRED';
  if (approval) {
    validateApproval(plan, approval, publicKey, { now, allowExpired: Boolean(final || rolledBack) });
    status = 'GO'; waitReason = 'NATIVE_RECEIPT_PENDING';
  }
  if (completedPhases.length) demand(approval, 'Native effects without approval evidence');
  if (final || rolledBack) {
    const accepted = rolledBack?.active ?? {
      operationId: plan.operationId, generation: plan.generation + 1,
      activeSlot: plan.targetSlot, blue: plan.blue, green: plan.green,
      dataRelease: plan.dataRelease, dataAdmissionSha256: plan.dataAdmissionSha256,
      planSha256: digest(plan),
    };
    validateAcceptedApplicationSnapshot({ histories: [{ plan, approval, records, final: final ?? null, rolledBack: rolledBack ?? null }], active: accepted, publicKey });
  }
  if (final) {
    demand(approval && completedPhases.length === PHASES.length && final.contract === `${CONTRACT}_COMPLETED` && final.planSha256 === digest(plan) && final.operationId === plan.operationId && final.lastReceiptSha256 === digest(records.POSTCHECK.receipt), 'Invalid native terminal receipt');
    if (plan.workerContinuation?.contract === 'LEETPLUS_WORKER_CONTINUATION_V2') {
      const receipt = verifyContinuation(plan, 'FORWARD', snapshot, publicKey);
      demand(records.POSTCHECK.evidence.workerContinuationReceiptSha256 === digest(receipt),
        'Native final lacks plan-bound worker continuation receipt');
    }
    status = 'APPLIED'; waitReason = 'INDEPENDENT_BROWSER_API_WORKER_ACCEPTANCE_PENDING';
  }
  if (rolledBack) {
    demand(approval && rolledBack.contract === `${CONTRACT}_ROLLED_BACK` && rolledBack.planSha256 === digest(plan) && plan.previous && rolledBack.active?.generation === plan.generation + 2 && rolledBack.active?.activeSlot === plan.previous.activeSlot, 'Invalid native rollback receipt');
    if (plan.workerContinuation?.contract === 'LEETPLUS_WORKER_CONTINUATION_V2') {
      const receipt = verifyContinuation(plan, 'ROLLBACK', snapshot, publicKey);
      demand(rolledBack.workerContinuationReceiptSha256 === digest(receipt),
        'Native rollback lacks plan-bound worker continuation receipt');
    }
    status = 'ROLLED_BACK'; waitReason = 'ROLLBACK_ACCEPTANCE_PENDING';
  }
  return { status, waitReason, operationId: plan.operationId, planSha256: digest(plan), completedPhases };
}

function trustedBytes(file, { optional = false, immutable = true } = {}) {
  demand(process.platform === 'linux' && path.isAbsolute(file) && path.normalize(file) === file, 'Native observation requires canonical Linux paths');
  for (let parent = path.dirname(file); ; parent = path.dirname(parent)) {
    const stat = fs.lstatSync(parent);
    demand(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0 && !(stat.mode & 0o022), 'Untrusted observation ancestor');
    if (parent === '/') break;
  }
  let fd;
  try { fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  try {
    const stat = fs.fstatSync(fd);
    demand(stat.isFile() && stat.uid === 0 && stat.nlink === 1 && !(stat.mode & 0o022) && stat.size <= 16 * 1024 * 1024 && (!immutable || (stat.mode & 0o777) === 0o400), 'Untrusted native observation file');
    return { bytes: fs.readFileSync(fd), mtime: stat.mtime.toISOString() };
  } finally { fs.closeSync(fd); }
}
function read(file, optional = false) { const item = trustedBytes(file, { optional }); return item && { value: JSON.parse(item.bytes), mtime: item.mtime }; }

export function readNative(directory, packetPath, publicKeyPath) {
  demand(/^\/var\/lib\/leetplus-compose\/operations\/[a-f0-9-]{36}$/.test(directory), 'Canonical native operation directory required');
  const plan = read(path.join(directory, 'plan.json')).value;
  demand(path.basename(directory) === plan.operationId, 'Native plan does not match operation directory');
  // Read terminal records first and each phase in reverse publication order.
  // Native publication is monotonic: observing a receipt then its prerequisites
  // cannot pair a newly published receipt with an earlier missing evidence read.
  const final = read(path.join(directory, 'final.json'), true), rollback = read(path.join(directory, 'rolled-back.json'), true);
  const appEvidence = plan.contract === APP_ONLY_PLAN
    ? Object.fromEntries([['appBundle', 'app-bundle.json'], ['appAdmission', 'app-admission.json'],
      ['dataBaselineCertification', 'data-baseline-certification.json']].map(([key, leaf]) => {
        const item = trustedBytes(path.join(directory, leaf));
        const value = JSON.parse(item.bytes);
        demand(item.bytes.equals(Buffer.from(canonical(value))), `Noncanonical V2 operation evidence: ${leaf}`);
        return [key, value];
      })) : {};
  const records = {};
  const phasePublicationTimes = {};
  for (const [index, phase] of [...PHASES.entries()].reverse()) {
    const record = {};
    for (const type of ['receipt', 'evidence', 'intent']) {
      const item = read(path.join(directory, `${index + 1}-${phase}.${type}.json`), true);
      if (item) { record[type] = item.value; if (type === 'receipt') phasePublicationTimes[phase] = item.mtime; }
    }
    if (Object.keys(record).length) records[phase] = record;
  }
  return {
    plan, records, ...appEvidence,
    final: final?.value, rolledBack: rollback?.value,
    approval: read(path.join(directory, 'approval.json'), true)?.value,
    workerContinuationReceipt: read(path.join(directory, 'worker-continuation.receipt.json'), true)?.value,
    workerContinuationRollbackReceipt: read(path.join(directory, 'worker-continuation-rollback.receipt.json'), true)?.value,
    workerContinuationIntent: read(path.join(directory, 'worker-continuation.intent.json'), true)?.value,
    workerContinuationRollbackIntent: read(path.join(directory, 'worker-continuation-rollback.intent.json'), true)?.value,
    forwardWorkerEnvelopes: WORKERS.map(worker => read(path.join(directory, `worker-forward-${worker}.json`), true)?.value),
    rollbackWorkerEnvelopes: WORKERS.map(worker => read(path.join(directory, `worker-rollback-${worker}.json`), true)?.value),
    workerProfiles: plan.workerContinuation?.contract === 'LEETPLUS_WORKER_CONTINUATION_V2'
      ? Object.fromEntries(WORKERS.map(worker => [worker,
        trustedBytes(path.join(directory, `worker-profile-${worker}.json`)).bytes])) : null,
    publicKey: trustedBytes(publicKeyPath, { immutable: false }).bytes, packet: read(packetPath).value,
    phasePublicationTimes,
    nativeCompletionPublishedAt: final?.mtime ?? rollback?.mtime ?? null,
    rollbackCompletionPublishedAt: rollback?.mtime ?? null,
    completionTimeBasis: 'FILESYSTEM_MTIME_PUBLICATION_PROXY',
  };
}

export async function observe(readSnapshot, emit, { intervalMs = 5000, deadlineMs = 60000, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  demand(Number.isInteger(intervalMs) && intervalMs >= 5000 && intervalMs <= 10000, 'Observation interval must be 5–10 seconds');
  demand(Number.isInteger(deadlineMs) && deadlineMs > 0 && deadlineMs <= 4 * 3600000, 'Bounded deadline required');
  const started = now();
  let prior;
  while (true) {
    const snapshot = await readSnapshot();
    const state = inspectNative(snapshot, now());
    const observed = { ...state, detectedAt: new Date(now()).toISOString(), nativeCompletionPublishedAt: snapshot.nativeCompletionPublishedAt ?? null, completionTimeBasis: snapshot.completionTimeBasis ?? null, phasePublicationTimes: snapshot.phasePublicationTimes ?? {} };
    const identity = digest({ ...state, nativeCompletionPublishedAt: observed.nativeCompletionPublishedAt, phasePublicationTimes: observed.phasePublicationTimes });
    if (identity !== prior) { await emit(observed); prior = identity; }
    if (['APPLIED', 'ROLLED_BACK'].includes(state.status)) return observed;
    if (now() - started >= deadlineMs) { const timeout = { ...observed, observation: 'DEADLINE', waitReason: state.waitReason }; await emit(timeout); return timeout; }
    await sleep(Math.min(intervalMs, deadlineMs - (now() - started)));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [directory, packet, publicKey, deadline = '60000'] = process.argv.slice(2);
  demand(directory && packet && publicKey, 'Usage: node release-observer.mjs operation-directory go-packet.json approval-root.pem [deadline-ms]');
  await observe(() => readNative(directory, packet, publicKey), event => console.log(JSON.stringify(event)), { deadlineMs: Number(deadline) });
}
