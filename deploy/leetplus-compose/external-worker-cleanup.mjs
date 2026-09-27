import { canonical, demand, digest } from './contract.mjs';

export const EXTERNAL_CLEANUP_CONTRACT = 'LEETPLUS_LANGAME_EXTERNAL_WORKER_CLEANUP_V1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const exactKeys = (v, fields) => demand(v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).sort().join(',') === [...fields].sort().join(','), 'External cleanup identity fields are not exact');

/** systemd ExecStopPost owns only the exact worker singleton after ExecStart
 * dies. It stops only the frozen ID and can run beside a global writer; every
 * global writer must reject an orphan before effects.
 */
export async function cleanupExternalWorker(adapters) {
  for (const method of ['assertWorkerLocks', 'readPointer', 'readIntent', 'readCompose', 'readContainerRecord',
    'inspectById', 'verifyOwned', 'stopById', 'readCleanupReceipt', 'publishCleanupReceipt'])
    demand(typeof adapters?.[method] === 'function', `Missing external cleanup adapter: ${method}`);
  await adapters.assertWorkerLocks();
  const pointer = await adapters.readPointer();
  if (pointer === null) return { contract: EXTERNAL_CLEANUP_CONTRACT, decision: 'NO_FROZEN_CONTAINER' };
  exactKeys(pointer, ['contract', 'identity', 'containerRecordSha256']);
  demand(pointer.contract === `${EXTERNAL_CLEANUP_CONTRACT}_POINTER` && UUID.test(pointer.identity ?? '') &&
    SHA.test(pointer.containerRecordSha256 ?? ''), 'External cleanup pointer drift');
  const intent = await adapters.readIntent(pointer.identity), spec = await adapters.readCompose(pointer.identity),
    record = await adapters.readContainerRecord(pointer.identity);
  exactKeys(record, ['contract', 'identity', 'intentSha256', 'composeSha256', 'containerId', 'image', 'name']);
  demand(record.contract === `${EXTERNAL_CLEANUP_CONTRACT}_CONTAINER` && record.identity === pointer.identity &&
    record.intentSha256 === digest(intent) && record.composeSha256 === digest(spec) &&
    record.name === 'leetplus-langame-external-daily-worker' && /^sha256:[a-f0-9]{64}$/.test(record.image ?? '') &&
    SHA.test(record.containerId ?? '') && pointer.containerRecordSha256 === digest(record) &&
    spec?.services?.['langame-external-daily-worker']?.image === record.image &&
    spec.services['langame-external-daily-worker'].container_name === record.name &&
    intent?.identity === pointer.identity,
  'External cleanup record is not bound to exact immutable run/container');
  const prior = await adapters.inspectById(record.containerId);
  await adapters.verifyOwned(prior, record, spec);
  if (prior.running) await adapters.stopById(record.containerId);
  const after = await adapters.inspectById(record.containerId);
  await adapters.verifyOwned(after, record, spec);
  demand(after.running === false && after.pid === 0, 'External worker container remains active after cleanup');
  const receipt = { contract: `${EXTERNAL_CLEANUP_CONTRACT}_RECEIPT`, decision: prior.running ? 'STOPPED_EXACT_ID' : 'ALREADY_STOPPED',
    identity: pointer.identity, containerId: record.containerId, containerRecordSha256: digest(record),
    intentSha256: digest(intent), composeSha256: digest(spec), postimage: { running: false, pid: 0 } };
  const existing = await adapters.readCleanupReceipt(pointer.identity);
  if (existing) {
    demand(canonical(existing) === canonical(receipt) || existing.decision === 'STOPPED_EXACT_ID' &&
      receipt.decision === 'ALREADY_STOPPED' && existing.identity === receipt.identity &&
      existing.containerRecordSha256 === receipt.containerRecordSha256 && existing.containerId === receipt.containerId,
    'External cleanup terminal receipt changed');
    return existing;
  }
  await adapters.publishCleanupReceipt(pointer.identity, receipt);
  return receipt;
}
