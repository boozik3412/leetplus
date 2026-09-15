// This policy is mirrored by the minimal privileged shell bootstrap. Only the
// exact address refresh is a shared-control writer; it owns its own singleton.
import { demand } from './contract.mjs';

export function controlLockPolicy(command, options = {}) {
  const keys = Object.keys(options);
  if (command === 'network' && keys.length === 1 && keys[0] === 'operation' && options.operation === 'status') return { mode: 'READ', singleton: null };
  if (keys.length === 0 && ['status', 'boot'].includes(command)) return { mode: 'READ', singleton: null };
  if (keys.length === 0 && command === 'backup') return { mode: 'READ', singleton: 'backup' };
  if (command === 'worker-run' && keys.length === 1 && keys[0] === 'name' && ['bonus-ledger-worker', 'langame-daily-worker'].includes(options.name)) {
    return { mode: 'READ', singleton: options.name };
  }
  if (command === 'network' && keys.length === 1 && keys[0] === 'operation' && options.operation === 'refresh') {
    return { mode: 'READ', singleton: 'network-refresh' };
  }
  return { mode: 'WRITE', singleton: null };
}

export function verifyKernelControlLocks(policy, { globalLock, singletonLock, locks, parentPid, outerPid } = {}) {
  demand(globalLock?.isFile?.() && !globalLock.isSymbolicLink?.() && globalLock.uid === 0 && globalLock.nlink === 1 && !(globalLock.mode & 0o077), 'Untrusted control lock');
  const lockLines = Array.isArray(locks) ? locks : String(locks ?? '').split('\n');
  demand(lockLines.some(line => { const fields = line.trim().split(/\s+/); return fields[1] === 'FLOCK' && fields[3] === policy.mode && fields[4] === String(parentPid) && fields[5]?.split(':').at(-1) === String(globalLock.ino); }), 'Parent does not hold the kernel control lock');
  if (policy.singleton) {
    const name = policy.singleton;
    demand(['backup', 'bonus-ledger-worker', 'langame-daily-worker', 'network-refresh'].includes(name), 'Unknown singleton lock');
    demand(singletonLock?.isFile?.() && !singletonLock.isSymbolicLink?.() && singletonLock.uid === 0 && singletonLock.nlink === 1 && !(singletonLock.mode & 0o077), 'Invalid singleton lock file');
    demand(lockLines.some(line => { const fields = line.trim().split(/\s+/); return fields[1] === 'FLOCK' && fields[3] === 'WRITE' && fields[4] === String(outerPid) && fields[5]?.split(':').at(-1) === String(singletonLock.ino); }), 'Singleton kernel lock is not held');
  }
  return policy;
}
