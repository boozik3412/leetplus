// Root-only child of the independently admitted Python host. Its stdout is
// newline-delimited RPC, never a human-facing plan or signer output.
import readline from 'node:readline';
import {
  prepare, apply, reconcile, rollback, reconcileRollback, terminalizeNoEffect,
} from './protocol.mjs';

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const lines = input[Symbol.asyncIterator]();
let serial = 0;

async function receive() {
  const next = await lines.next();
  if (next.done || next.value.length > 4 * 1024 * 1024) throw new Error('Closed or oversized native RPC input');
  return JSON.parse(next.value);
}

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function rpc(method, args = {}) {
  const id = ++serial;
  send({ type: 'call', id, method, args });
  const response = await receive();
  if (response?.type !== 'reply' || response.id !== id ||
      typeof response.ok !== 'boolean') throw new Error('Native RPC response binding changed');
  if (!response.ok) throw new Error(response.error || 'Native host rejected operation');
  return response.result;
}

const host = {
  withLocks: async (mode, action) => {
    await rpc('lock.acquire', { mode });
    try { return await action(); }
    finally { await rpc('lock.release'); }
  },
  observe: () => rpc('observe'),
  readPointer: () => rpc('pointer.read'),
  readProtectedState: () => rpc('protected.read'),
  readOperation: operationId => rpc('operation.read', { operationId }),
  publishExclusive: (operationId, name, value) => rpc('operation.publish', { operationId, name, value }),
  compareAndSwapPointer: (oldPointer, newPointer) => rpc('pointer.cas', { oldPointer, newPointer }),
  recoverPointerTemporary: (oldPointer, pendingTarget) => rpc('pointer.recover-temporary', { oldPointer, pendingTarget }),
  prepareCanonicalForward: (plan, intent) => rpc('canonical.prepare-forward', { plan, intent }),
  finalizeCanonicalForward: (plan, intent) => rpc('canonical.finalize-forward', { plan, intent }),
  reconcileCanonicalForward: (plan, intent) => rpc('canonical.reconcile-forward', { plan, intent }),
  prepareCanonicalRollback: (plan, intent, receipt) => rpc('canonical.prepare-rollback', { plan, intent, receipt }),
  finalizeCanonicalRollback: (plan, intent, receipt) => rpc('canonical.finalize-rollback', { plan, intent, receipt }),
  reconcileCanonicalRollback: (plan, intent, receipt) => rpc('canonical.reconcile-rollback', { plan, intent, receipt }),
  closeCanonicalNoEffect: (plan, phase, intent) => rpc('canonical.close-no-effect', { plan, phase, intent }),
};

async function main() {
  const init = await receive();
  if (init?.type !== 'init' || typeof init.command !== 'string' ||
      !init.roots || !init.inputs || !init.evidence || !init.mode) {
    throw new Error('Incomplete trusted native initialization');
  }
  const common = {
    plan: init.inputs.plan, permitEnvelope: init.inputs.permitEnvelope,
    permitRoot: init.roots.permit, executionEnvelope: init.inputs.executionEnvelope,
    executionRoot: init.roots.execution, host,
  };
  let result;
  switch (init.command) {
    case 'prepare':
      result = await prepare({ mode: init.mode, envelope: init.inputs.permitEnvelope,
        permitRoot: init.roots.permit, evidence: init.evidence, host });
      break;
    case 'apply': result = await apply(common); break;
    case 'reconcile': result = await reconcile(common); break;
    case 'rollback':
      result = await rollback({ ...common, rollbackEnvelope: init.inputs.rollbackEnvelope,
        rollbackRoot: init.roots.rollback });
      break;
    case 'reconcile-rollback':
      result = await reconcileRollback({ ...common,
        rollbackEnvelope: init.inputs.rollbackEnvelope, rollbackRoot: init.roots.rollback });
      break;
    case 'terminalize-no-effect':
      result = await terminalizeNoEffect({ ...common, phase: init.inputs.phase,
        rollbackEnvelope: init.inputs.rollbackEnvelope, rollbackRoot: init.roots.rollback,
        recoveryEnvelope: init.inputs.recoveryEnvelope, recoveryRoot: init.roots.noEffect });
      break;
    default: throw new Error('Unsupported standalone transition command');
  }
  send({ type: 'result', result });
}

main().catch(error => {
  send({ type: 'error', code: 'SOURCE_AUTHORITY_REJECTED' });
  process.stderr.write(`${String(error?.message ?? 'Unknown authority failure')}\n`);
  process.exitCode = 1;
}).finally(() => input.close());
