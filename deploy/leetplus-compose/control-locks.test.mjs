import assert from 'node:assert/strict';
import test from 'node:test';
import { controlLockPolicy, verifyKernelControlLocks } from './control-locks.mjs';

function lock(ino, { file = true, symbolic = false, uid = 0, nlink = 1, mode = 0o600 } = {}) {
  return { ino, uid, nlink, mode, isFile: () => file, isSymbolicLink: () => symbolic };
}
function flock(mode, pid, ino) { return `1: FLOCK ADVISORY ${mode} ${pid} 00:01:${ino} 0 EOF`; }

test('grants shared control lock only to exact non-mutating commands', () => {
  for (const [command, options, expected] of [
    ['status', {}, { mode: 'READ', singleton: null }],
    ['boot', {}, { mode: 'READ', singleton: null }],
    ['backup', {}, { mode: 'READ', singleton: 'backup' }],
    ['worker-run', { name: 'bonus-ledger-worker' }, { mode: 'READ', singleton: 'bonus-ledger-worker' }],
    ['worker-run', { name: 'langame-daily-worker' }, { mode: 'READ', singleton: 'langame-daily-worker' }],
    ['network', { operation: 'refresh' }, { mode: 'READ', singleton: 'network-refresh' }],
    ['network', { operation: 'status' }, { mode: 'READ', singleton: null }],
  ]) {
    assert.deepEqual(controlLockPolicy(command, options), expected, `${command} ${JSON.stringify(options)}`);
  }
});

test('uses an exclusive control lock for mutations, unrecognized inputs, and mixed options', () => {
  for (const [command, options] of [
    ['network', { operation: 'install' }],
    ['network', { operation: 'verify' }],
    ['network', { operation: 'install-rehearsal' }],
    ['network', { operation: 'verify-rehearsal' }],
    ['network', { operation: 'unknown' }],
    ['network', { operation: 'refresh', name: 'bonus-ledger-worker' }],
    ['network', { operation: 'refresh', dryRun: true }],
    ['worker-run', {}],
    ['worker-run', { name: 'bonus-ledger-worker', operation: 'refresh' }],
    ['worker-run', { name: 'unknown-worker' }],
    ['backup', { operation: 'refresh' }],
    ['status', { operation: 'refresh' }],
    ['boot', { name: 'bonus-ledger-worker' }],
    ['apply', {}],
    ['resume', { operation: 'refresh' }],
    ['unknown-command', {}],
  ]) {
    assert.deepEqual(controlLockPolicy(command, options), { mode: 'WRITE', singleton: null }, `${command} ${JSON.stringify(options)}`);
  }
});

test('verifies the exact inherited global and singleton kernel flocks', () => {
  const globalLock = lock(101), singletonLock = lock(102);
  assert.equal(verifyKernelControlLocks(controlLockPolicy('worker-run', { name: 'bonus-ledger-worker' }), {
    globalLock, singletonLock, locks: [flock('READ', 200, 101), flock('WRITE', 100, 102)], parentPid: 200, outerPid: 100,
  }).singleton, 'bonus-ledger-worker');
  assert.equal(verifyKernelControlLocks(controlLockPolicy('network', { operation: 'refresh' }), {
    globalLock, singletonLock, locks: [flock('READ', 200, 101), flock('WRITE', 100, 102)], parentPid: 200, outerPid: 100,
  }).singleton, 'network-refresh');
});

test('rejects missing, wrong-mode, and unsafe inherited lock state', () => {
  const policy = controlLockPolicy('network', { operation: 'refresh' });
  const valid = () => ({ globalLock: lock(101), singletonLock: lock(102), locks: [flock('READ', 200, 101), flock('WRITE', 100, 102)], parentPid: 200, outerPid: 100 });
  for (const mutate of [
    value => value.locks = [flock('WRITE', 200, 101), flock('WRITE', 100, 102)],
    value => value.locks = [flock('READ', 200, 101), flock('READ', 100, 102)],
    value => value.globalLock = lock(101, { symbolic: true }),
    value => value.singletonLock = lock(102, { symbolic: true }),
    value => value.singletonLock = lock(102, { nlink: 2 }),
  ]) {
    const value = valid();
    mutate(value);
    assert.throws(() => verifyKernelControlLocks(policy, value));
  }
});
