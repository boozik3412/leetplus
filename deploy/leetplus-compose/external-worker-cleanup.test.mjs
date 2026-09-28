import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { digest } from './contract.mjs';
import { cleanupExternalWorker, EXTERNAL_CLEANUP_CONTRACT } from './external-worker-cleanup.mjs';

function fixture() {
  const identity = '12345678-1234-4123-8123-123456789abc', containerId = 'a'.repeat(64),
    name = 'leetplus-langame-external-daily-worker', image = `sha256:${'b'.repeat(64)}`;
  const intent = { identity, businessDate: '2026-09-27' }, spec = { services: { 'langame-external-daily-worker': { image, container_name: name } } };
  const record = { contract: `${EXTERNAL_CLEANUP_CONTRACT}_CONTAINER`, identity, intentSha256: digest(intent),
    composeSha256: digest(spec), containerId, image, name };
  const pointer = { contract: `${EXTERNAL_CLEANUP_CONTRACT}_POINTER`, identity, containerRecordSha256: digest(record) };
  let running = true, owned = true, receipt = null, stops = 0;
  const adapters = {
    assertWorkerLocks: async () => {}, readPointer: async () => pointer,
    readIntent: async () => intent, readCompose: async () => spec, readContainerRecord: async () => record,
    inspectById: async id => { assert.equal(id, containerId); return { id, name, image, running, pid: running ? 777 : 0 }; },
    verifyOwned: async item => { if (!owned || item.id !== containerId || item.name !== name || item.image !== image) throw new Error('foreign exact ID'); },
    stopById: async id => { assert.equal(id, containerId); stops += 1; running = false; },
    readCleanupReceipt: async () => receipt, publishCleanupReceipt: async (_, value) => { receipt = value; },
  };
  return { adapters, record, pointer, get stops() { return stops; }, set owned(value) { owned = value; },
    set running(value) { running = value; }, get receipt() { return receipt; } };
}
test('systemd cleanup stops only frozen owned container ID and is idempotent after receipt loss', async () => {
  const f = fixture(), receipt = await cleanupExternalWorker(f.adapters);
  assert.equal(receipt.decision, 'STOPPED_EXACT_ID'); assert.equal(f.stops, 1);
  assert.deepEqual(await cleanupExternalWorker(f.adapters), receipt); assert.equal(f.stops, 1);
});
test('no frozen record is a no-effect poststart failure; foreign ID and daemon stop failure hold', async () => {
  const absent = fixture(); absent.adapters.readPointer = async () => null;
  assert.equal((await cleanupExternalWorker(absent.adapters)).decision, 'NO_FROZEN_CONTAINER');
  const foreign = fixture(); foreign.owned = false;
  await assert.rejects(cleanupExternalWorker(foreign.adapters), /foreign exact ID/); assert.equal(foreign.stops, 0);
  const broken = fixture(); broken.adapters.stopById = async () => { throw new Error('daemon unavailable'); };
  await assert.rejects(cleanupExternalWorker(broken.adapters), /daemon unavailable/); assert.equal(broken.receipt, null);
});
test('systemd gives cleanup an independent stop window after bounded attached run', () => {
  const unit = fs.readFileSync(new URL('./leetplus-compose-external-daily.service', import.meta.url), 'utf8');
  assert.match(unit, /^ExecStopPost=\/usr\/local\/sbin\/leetplus-compose external-worker-cleanup$/m);
  assert.match(unit, /^TimeoutStartSec=3600$/m);
  assert.match(unit, /^TimeoutStopSec=600$/m);
});
