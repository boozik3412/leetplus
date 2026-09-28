// Independently packaged source candidate. No production host adapter is wired
// here: a separately admitted predecessor-side bundle must supply every host
// callback, lock and public root before this protocol can perform an effect.
import crypto from 'node:crypto';
import {
  ACTION as A_ACTION,
  PERMIT_CONTRACT as A_PERMIT_CONTRACT,
  PREDECESSOR_RELEASE as A_PREDECESSOR,
  validateABridgeBootstrapPermit,
} from '../leetplus-compose/a-bridge-bootstrap-authority.mjs';
import {
  ACTION as SUCCESSOR_ACTION,
  CONTRACT as SUCCESSOR_PERMIT_CONTRACT,
  PREDECESSOR as BRIDGE_PREDECESSOR,
  validateBridgeExternalSuccessorPermit,
} from '../leetplus-compose/bridge-external-successor-authority.mjs';

export const PLAN_CONTRACT = 'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_PLAN';
export const EXECUTION_CONTRACT = 'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_EXECUTION';
export const ROLLBACK_CONTRACT = 'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_ROLLBACK';
export const NO_EFFECT_CONTRACT = 'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_NO_EFFECT';
export const MODES = Object.freeze({ A_TO_BRIDGE: 'A_TO_BRIDGE', BRIDGE_TO_EXTERNAL: 'BRIDGE_TO_EXTERNAL' });
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const MAX_VALIDITY_MS = 30 * 60_000;

export const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
export const digest = value => crypto.createHash('sha256').update(
  typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value),
).digest('hex');
const demand = (condition, message) => { if (!condition) throw new Error(message); };

function exactKeys(value, keys, label) {
  demand(value && typeof value === 'object' && !Array.isArray(value) &&
    canonical(Object.keys(value).sort()) === canonical([...keys].sort()), `Invalid ${label} fields`);
}

function instant(value, label) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  demand(Number.isFinite(parsed) && new Date(parsed).toISOString() === value, `Invalid ${label}`);
  return parsed;
}

function verifySignedCommand(envelope, publicKey, contract, keys, now) {
  exactKeys(envelope, ['command', 'signature'], 'signed command envelope');
  exactKeys(envelope.command, keys, 'signed command');
  const command = envelope.command;
  demand(command.contract === contract && UUID.test(command.operationId ?? '') &&
    HASH.test(command.planSha256 ?? '') && HASH.test(command.forwardReceiptSha256 ?? '0'.repeat(64)),
  'Invalid transition execution identity');
  const issued = instant(command.issuedAt, 'command issue time');
  const expiry = instant(command.expiresAt, 'command expiry time');
  demand(issued <= now + 30_000 && expiry > now && expiry > issued && expiry - issued <= MAX_VALIDITY_MS,
    'Transition command is expired or unbounded');
  demand(typeof envelope.signature === 'string' && SIGNATURE.test(envelope.signature), 'Invalid command signature encoding');
  const key = crypto.createPublicKey(publicKey);
  demand(key.asymmetricKeyType === 'ed25519' &&
    crypto.verify(null, Buffer.from(canonical(command)), key, Buffer.from(envelope.signature, 'base64')),
  'Invalid transition execution signature');
  return command;
}

function pointerFor(release) {
  demand(/^[a-f0-9]{40}$/.test(release ?? ''), 'Invalid controller release');
  return `/usr/local/lib/leetplus-compose/${release}/control.sh`;
}

function validatePermit(mode, envelope, publicRoot, expected, now) {
  if (mode === MODES.A_TO_BRIDGE) {
    return validateABridgeBootstrapPermit(envelope, publicRoot, expected, { now });
  }
  demand(mode === MODES.BRIDGE_TO_EXTERNAL, 'Unknown transition mode');
  return validateBridgeExternalSuccessorPermit(envelope, publicRoot, expected, { now });
}

function expectedActiveDigest(mode, expected) {
  return mode === MODES.A_TO_BRIDGE ? expected.activeSha256 : expected.host.activeSha256;
}

function validateObservation(mode, observed, envelope, permitRoot, now) {
  exactKeys(observed, ['expected', 'protectedState', 'pointer'], 'independent host observation');
  const { expected, protectedState, pointer } = observed;
  exactKeys(protectedState, ['activeSha256', 'applicationSha256', 'dataSha256', 'nginxSha256',
    'workerGrantsSha256', 'timersSha256', 'providerPolicySha256', 'containersSha256',
    'networkRefreshUnitSha256', 'firewallSha256'], 'protected host state');
  demand(Object.values(protectedState).every(value => HASH.test(value ?? '')) &&
    protectedState.activeSha256 === expectedActiveDigest(mode, expected),
  'Protected active-state identity differs from permit');
  const predecessor = mode === MODES.A_TO_BRIDGE ? A_PREDECESSOR : BRIDGE_PREDECESSOR.releaseSha;
  demand(pointer === pointerFor(predecessor), 'Serving predecessor pointer differs');
  const authority = validatePermit(mode, envelope, permitRoot, expected, now);
  demand(expected.action === (mode === MODES.A_TO_BRIDGE ? A_ACTION : SUCCESSOR_ACTION),
    'Transition action differs');
  demand(envelope.permit.contract === (mode === MODES.A_TO_BRIDGE ? A_PERMIT_CONTRACT : SUCCESSOR_PERMIT_CONTRACT),
    'Transition permit contract differs');
  return authority;
}

function ensureHost(host) {
  exactKeys(host, ['withLocks', 'observe', 'readPointer', 'readProtectedState', 'readOperation',
    'publishExclusive', 'compareAndSwapPointer', 'recoverPointerTemporary',
    'prepareCanonicalForward', 'finalizeCanonicalForward', 'reconcileCanonicalForward',
    'prepareCanonicalRollback', 'finalizeCanonicalRollback', 'reconcileCanonicalRollback',
    'closeCanonicalNoEffect'], 'predecessor host adapter');
  for (const value of Object.values(host)) demand(typeof value === 'function', 'Host adapter callback missing');
}

function planIdentity(plan, mode, envelope, observed) {
  exactKeys(plan, ['contract', 'mode', 'operationId', 'permitEnvelopeSha256', 'expected',
    'protectedStateSha256', 'oldPointer', 'newPointer', 'evidence'], 'bootstrap plan');
  exactKeys(plan.evidence, ['backupReceiptSha256', 'restoredCopyReceiptSha256', 'hostBaselineSha256'],
    'transition evidence');
  demand(Object.values(plan.evidence).every(value => HASH.test(value ?? '')) &&
    plan.contract === PLAN_CONTRACT && plan.mode === mode &&
    plan.operationId === envelope.permit.operationId &&
    plan.permitEnvelopeSha256 === digest(envelope) &&
    canonical(plan.expected) === canonical(observed.expected) &&
    plan.protectedStateSha256 === digest(observed.protectedState) &&
    plan.oldPointer === observed.pointer &&
    plan.newPointer === pointerFor(observed.expected.target.releaseSha),
  'Bootstrap plan differs from independent observation');
  return plan;
}

function historicalAuthority(plan, permitEnvelope, permitRoot, executionEnvelope, executionRoot, authorizedAt) {
  const time = instant(authorizedAt, 'durable authorization time');
  demand(plan.contract === PLAN_CONTRACT && Object.values(MODES).includes(plan.mode) &&
    plan.operationId === permitEnvelope?.permit?.operationId &&
    plan.permitEnvelopeSha256 === digest(permitEnvelope) &&
    HASH.test(plan.protectedStateSha256 ?? '') &&
    plan.oldPointer === pointerFor(plan.mode === MODES.A_TO_BRIDGE ? A_PREDECESSOR : BRIDGE_PREDECESSOR.releaseSha) &&
    plan.newPointer === pointerFor(plan.expected.target.releaseSha),
  'Historical transition plan differs from signed authority');
  validatePermit(plan.mode, permitEnvelope, permitRoot, plan.expected, time);
  validateExecution(executionEnvelope, executionRoot, plan, time);
}

/** Read-only preparation. `evidence` is independently verified by the host adapter. */
export async function prepare({ mode, envelope, permitRoot, evidence, host, now }) {
  ensureHost(host);
  exactKeys(evidence, ['backupReceiptSha256', 'restoredCopyReceiptSha256', 'hostBaselineSha256'],
    'transition evidence');
  demand(Object.values(evidence).every(value => HASH.test(value ?? '')), 'Invalid transition evidence digest');
  return host.withLocks('READ', async () => {
    const observed = await host.observe();
    validateObservation(mode, observed, envelope, permitRoot, now ?? Date.now());
    const repeated = await host.observe();
    demand(canonical(repeated) === canonical(observed), 'Host changed during bootstrap preparation');
    validateObservation(mode, repeated, envelope, permitRoot, now ?? Date.now());
    const plan = {
      contract: PLAN_CONTRACT, mode, operationId: envelope.permit.operationId,
      permitEnvelopeSha256: digest(envelope), expected: observed.expected,
      protectedStateSha256: digest(observed.protectedState), oldPointer: observed.pointer,
      newPointer: pointerFor(observed.expected.target.releaseSha), evidence,
    };
    planIdentity(plan, mode, envelope, observed);
    return Object.freeze({ decision: 'PREPARED_NOT_AUTHORIZATION', plan, planSha256: digest(plan) });
  });
}

function validateExecution(envelope, root, plan, now) {
  const command = verifySignedCommand(envelope, root, EXECUTION_CONTRACT,
    ['contract', 'operationId', 'planSha256', 'permitEnvelopeSha256', 'effect', 'issuedAt', 'expiresAt'], now);
  demand(command.operationId === plan.operationId && command.planSha256 === digest(plan) &&
    command.permitEnvelopeSha256 === plan.permitEnvelopeSha256 && command.effect === 'CONTROLLER_POINTER_ONLY',
  'Execution approval differs from exact bootstrap plan');
  return command;
}

function assertProtected(plan, protectedState) {
  demand(digest(protectedState) === plan.protectedStateSha256, 'Protected host state changed');
}

function recordIdentity(record, contract, plan, permitEnvelope, executionEnvelope) {
  demand(record?.contract === contract && record.operationId === plan.operationId &&
    record.planSha256 === digest(plan) && record.permitEnvelopeSha256 === digest(permitEnvelope) &&
    record.executionEnvelopeSha256 === digest(executionEnvelope) &&
    record.oldPointer === plan.oldPointer && record.newPointer === plan.newPointer,
  'Transition record differs from exact authority');
}

function noPending(record) {
  demand(!record || Object.keys(record).every(key => record[key] == null),
    'Existing transition record requires read-only reconciliation');
}

/** The adapter must fsync an exclusive intent before pointer CAS. */
export async function apply({ plan, permitEnvelope, permitRoot, executionEnvelope, executionRoot, host, now }) {
  ensureHost(host);
  return host.withLocks('WRITE', async () => {
    noPending(await host.readOperation(plan.operationId));
    const observed = await host.observe();
    const authorizedAt = now ?? Date.now();
    validateObservation(plan.mode, observed, permitEnvelope, permitRoot, authorizedAt);
    planIdentity(plan, plan.mode, permitEnvelope, observed);
    validateExecution(executionEnvelope, executionRoot, plan, authorizedAt);
    const intent = {
      contract: `${PLAN_CONTRACT}_INTENT`, operationId: plan.operationId, planSha256: digest(plan),
      permitEnvelopeSha256: digest(permitEnvelope), executionEnvelopeSha256: digest(executionEnvelope),
      oldPointer: plan.oldPointer, newPointer: plan.newPointer, authorizedAt: new Date(authorizedAt).toISOString(),
    };
    await host.publishExclusive(plan.operationId, 'intent', intent);
    await host.prepareCanonicalForward(plan, intent);
    validatePermit(plan.mode, permitEnvelope, permitRoot, plan.expected, now ?? Date.now());
    validateExecution(executionEnvelope, executionRoot, plan, now ?? Date.now());
    assertProtected(plan, await host.readProtectedState());
    // A failed or ambiguous CAS is never retried here; reconcile observes it.
    await host.compareAndSwapPointer(plan.oldPointer, plan.newPointer);
    demand(await host.readPointer() === plan.newPointer, 'Pointer postimage differs');
    assertProtected(plan, await host.readProtectedState());
    await host.finalizeCanonicalForward(plan, intent);
    const receipt = {
      contract: `${PLAN_CONTRACT}_RECEIPT`, ...Object.fromEntries(Object.entries(intent).filter(([key]) => key !== 'contract')),
      intentSha256: digest(intent), acceptedAt: new Date(now ?? Date.now()).toISOString(), decision: 'PASS',
    };
    await host.publishExclusive(plan.operationId, 'receipt', receipt);
    return receipt;
  });
}

/** No forward effect is repeated after a lost response or expired permit. */
export async function reconcile({ plan, permitEnvelope, permitRoot, executionEnvelope, executionRoot, host }) {
  ensureHost(host);
  return host.withLocks('WRITE', async () => {
    const record = await host.readOperation(plan.operationId);
    demand(!record?.terminalNoEffect, 'Forward intent already terminalized as zero-effect');
    recordIdentity(record?.intent, `${PLAN_CONTRACT}_INTENT`, plan, permitEnvelope, executionEnvelope);
    historicalAuthority(plan, permitEnvelope, permitRoot, executionEnvelope, executionRoot,
      record.intent.authorizedAt);
    if (record.receipt) {
      recordIdentity(record.receipt, `${PLAN_CONTRACT}_RECEIPT`, plan, permitEnvelope, executionEnvelope);
      demand(record.receipt.intentSha256 === digest(record.intent) && record.receipt.decision === 'PASS',
        'Accepted transition receipt is invalid');
      return { decision: 'ALREADY_ACCEPTED', receipt: record.receipt };
    }
    const pointer = await host.readPointer();
    if (pointer === plan.oldPointer) return { decision: 'NO_EFFECT_RECORDED_NO_RETRY' };
    demand(pointer === plan.newPointer, 'Ambiguous transition pointer requires operator reconciliation');
    assertProtected(plan, await host.readProtectedState());
    await host.reconcileCanonicalForward(plan, record.intent);
    const receipt = {
      contract: `${PLAN_CONTRACT}_RECEIPT`,
      ...Object.fromEntries(Object.entries(record.intent).filter(([key]) => key !== 'contract')),
      intentSha256: digest(record.intent), acceptedAt: new Date().toISOString(), decision: 'PASS',
    };
    await host.publishExclusive(plan.operationId, 'receipt', receipt);
    return { decision: 'RECONCILED_ACCEPTED', receipt };
  });
}

function validateRollback(envelope, root, plan, forwardReceipt, now) {
  const command = verifySignedCommand(envelope, root, ROLLBACK_CONTRACT,
    ['contract', 'operationId', 'planSha256', 'forwardReceiptSha256', 'effect', 'issuedAt', 'expiresAt'], now);
  demand(command.operationId === plan.operationId && command.planSha256 === digest(plan) &&
    command.forwardReceiptSha256 === digest(forwardReceipt) && command.effect === 'CONTROLLER_POINTER_ROLLBACK_ONLY',
  'Rollback approval differs from accepted forward receipt');
}

function validateNoEffect(envelope, root, plan, intent, phase, forwardReceipt, now) {
  const command = verifySignedCommand(envelope, root, NO_EFFECT_CONTRACT,
    ['contract', 'operationId', 'planSha256', 'phase', 'intentSha256', 'forwardReceiptSha256',
      'effect', 'issuedAt', 'expiresAt'], now);
  demand(command.operationId === plan.operationId && command.planSha256 === digest(plan) &&
    command.phase === phase && command.intentSha256 === digest(intent) &&
    command.forwardReceiptSha256 === (phase === 'FORWARD' ? null : digest(forwardReceipt)) &&
    command.effect === 'TERMINAL_RECORD_ONLY',
  'Zero-effect approval differs from exact pending intent and receipt');
  return command;
}

/** Independent Python host calls this pure validator immediately before CAS. */
export function validateNativePointerAuthority(value, { now = Date.now() } = {}) {
  exactKeys(value, ['phase', 'recovery', 'plan', 'permitEnvelope', 'permitRoot',
    'executionEnvelope', 'executionRoot', 'intent', 'forwardReceipt', 'rollbackIntent',
    'rollbackEnvelope', 'rollbackRoot', 'recoveryEnvelope', 'recoveryRoot'],
  'native pointer authority');
  const { phase, recovery, plan, permitEnvelope, permitRoot, executionEnvelope,
    executionRoot, intent, forwardReceipt, rollbackIntent, rollbackEnvelope,
    rollbackRoot, recoveryEnvelope, recoveryRoot } = value;
  demand(phase === 'FORWARD' || phase === 'ROLLBACK', 'Unknown native pointer phase');
  demand(typeof recovery === 'boolean', 'Invalid native pointer recovery flag');
  recordIdentity(intent, `${PLAN_CONTRACT}_INTENT`, plan, permitEnvelope, executionEnvelope);
  historicalAuthority(plan, permitEnvelope, permitRoot, executionEnvelope, executionRoot,
    intent.authorizedAt);
  if (phase === 'FORWARD') {
    demand(forwardReceipt === null && rollbackIntent === null && rollbackEnvelope === null,
      'Forward pointer cannot inherit rollback authority');
    if (!recovery) {
      validatePermit(plan.mode, permitEnvelope, permitRoot, plan.expected, now);
      validateExecution(executionEnvelope, executionRoot, plan, now);
    } else {
      validateNoEffect(recoveryEnvelope, recoveryRoot, plan, intent, phase, null, now);
    }
  } else {
    recordIdentity(forwardReceipt, `${PLAN_CONTRACT}_RECEIPT`, plan, permitEnvelope, executionEnvelope);
    demand(forwardReceipt.intentSha256 === digest(intent) && forwardReceipt.decision === 'PASS',
      'Native rollback lacks accepted standalone forward receipt');
    demand(rollbackIntent?.contract === `${PLAN_CONTRACT}_ROLLBACK_INTENT` &&
      rollbackIntent.operationId === plan.operationId && rollbackIntent.planSha256 === digest(plan) &&
      rollbackIntent.forwardReceiptSha256 === digest(forwardReceipt) &&
      rollbackIntent.rollbackEnvelopeSha256 === digest(rollbackEnvelope) &&
      rollbackIntent.oldPointer === plan.newPointer && rollbackIntent.newPointer === plan.oldPointer,
    'Native rollback intent differs from receipt-bound approval');
    validateRollback(rollbackEnvelope, rollbackRoot, plan, forwardReceipt,
      instant(rollbackIntent.authorizedAt, 'rollback authorization time'));
    if (!recovery) validateRollback(rollbackEnvelope, rollbackRoot, plan, forwardReceipt, now);
    else validateNoEffect(recoveryEnvelope, recoveryRoot, plan, rollbackIntent, phase,
      forwardReceipt, now);
  }
  return true;
}

export async function rollback({ plan, permitEnvelope, executionEnvelope, rollbackEnvelope, rollbackRoot, host, now }) {
  ensureHost(host);
  return host.withLocks('WRITE', async () => {
    const record = await host.readOperation(plan.operationId);
    recordIdentity(record?.intent, `${PLAN_CONTRACT}_INTENT`, plan, permitEnvelope, executionEnvelope);
    recordIdentity(record?.receipt, `${PLAN_CONTRACT}_RECEIPT`, plan, permitEnvelope, executionEnvelope);
    demand(record.receipt.intentSha256 === digest(record.intent) && record.receipt.decision === 'PASS' &&
      !record.rollbackIntent && !record.rollbackReceipt, 'Forward receipt missing or rollback already pending');
    const authorizedAt = now ?? Date.now();
    validateRollback(rollbackEnvelope, rollbackRoot, plan, record.receipt, authorizedAt);
    demand(await host.readPointer() === plan.newPointer, 'Rollback pointer preimage differs');
    assertProtected(plan, await host.readProtectedState());
    const intent = {
      contract: `${PLAN_CONTRACT}_ROLLBACK_INTENT`, operationId: plan.operationId,
      planSha256: digest(plan), forwardReceiptSha256: digest(record.receipt),
      rollbackEnvelopeSha256: digest(rollbackEnvelope), oldPointer: plan.newPointer,
      newPointer: plan.oldPointer, authorizedAt: new Date(authorizedAt).toISOString(),
    };
    await host.publishExclusive(plan.operationId, 'rollbackIntent', intent);
    await host.prepareCanonicalRollback(plan, intent, record.receipt);
    validateRollback(rollbackEnvelope, rollbackRoot, plan, record.receipt, now ?? Date.now());
    assertProtected(plan, await host.readProtectedState());
    await host.compareAndSwapPointer(plan.newPointer, plan.oldPointer);
    demand(await host.readPointer() === plan.oldPointer, 'Rollback pointer postimage differs');
    assertProtected(plan, await host.readProtectedState());
    await host.finalizeCanonicalRollback(plan, intent, record.receipt);
    const receipt = { ...intent, contract: `${PLAN_CONTRACT}_ROLLBACK_RECEIPT`,
      intentSha256: digest(intent), acceptedAt: new Date(now ?? Date.now()).toISOString(), decision: 'PASS' };
    await host.publishExclusive(plan.operationId, 'rollbackReceipt', receipt);
    return receipt;
  });
}

export async function reconcileRollback({ plan, permitEnvelope, permitRoot, executionEnvelope,
  executionRoot, rollbackEnvelope, rollbackRoot, host }) {
  ensureHost(host);
  return host.withLocks('WRITE', async () => {
    const record = await host.readOperation(plan.operationId);
    demand(!record?.rollbackNoEffect, 'Rollback intent already terminalized as zero-effect');
    recordIdentity(record?.intent, `${PLAN_CONTRACT}_INTENT`, plan, permitEnvelope, executionEnvelope);
    recordIdentity(record?.receipt, `${PLAN_CONTRACT}_RECEIPT`, plan, permitEnvelope, executionEnvelope);
    historicalAuthority(plan, permitEnvelope, permitRoot, executionEnvelope, executionRoot,
      record.intent.authorizedAt);
    demand(record.receipt.intentSha256 === digest(record.intent) && record.receipt.decision === 'PASS',
      'Accepted forward receipt is invalid');
    const intent = record.rollbackIntent;
    demand(intent?.contract === `${PLAN_CONTRACT}_ROLLBACK_INTENT` &&
      intent.operationId === plan.operationId && intent.planSha256 === digest(plan) &&
      intent.forwardReceiptSha256 === digest(record.receipt) &&
      intent.rollbackEnvelopeSha256 === digest(rollbackEnvelope) &&
      intent.oldPointer === plan.newPointer && intent.newPointer === plan.oldPointer,
    'Rollback intent differs from accepted forward receipt');
    validateRollback(rollbackEnvelope, rollbackRoot, plan, record.receipt,
      instant(intent.authorizedAt, 'rollback authorization time'));
    if (record.rollbackReceipt) {
      demand(record.rollbackReceipt.contract === `${PLAN_CONTRACT}_ROLLBACK_RECEIPT` &&
        record.rollbackReceipt.intentSha256 === digest(intent) && record.rollbackReceipt.decision === 'PASS',
      'Rollback receipt is invalid');
      return { decision: 'ALREADY_ROLLED_BACK', receipt: record.rollbackReceipt };
    }
    const pointer = await host.readPointer();
    if (pointer === plan.newPointer) return { decision: 'ROLLBACK_NO_EFFECT_NO_RETRY' };
    demand(pointer === plan.oldPointer, 'Ambiguous rollback pointer requires operator reconciliation');
    assertProtected(plan, await host.readProtectedState());
    await host.reconcileCanonicalRollback(plan, intent, record.receipt);
    const receipt = { ...intent, contract: `${PLAN_CONTRACT}_ROLLBACK_RECEIPT`,
      intentSha256: digest(intent), acceptedAt: new Date().toISOString(), decision: 'PASS' };
    await host.publishExclusive(plan.operationId, 'rollbackReceipt', receipt);
    return { decision: 'RECONCILED_ROLLED_BACK', receipt };
  });
}

/** Separately signed zero-effect cancellation; never repeats a pointer CAS. */
export async function terminalizeNoEffect({ plan, permitEnvelope, permitRoot, executionEnvelope,
  executionRoot, phase, rollbackEnvelope, rollbackRoot, recoveryEnvelope, recoveryRoot,
  host, now = Date.now() }) {
  ensureHost(host);
  demand(['FORWARD', 'ROLLBACK'].includes(phase), 'Unknown zero-effect phase');
  return host.withLocks('WRITE', async () => {
    const record = await host.readOperation(plan.operationId);
    recordIdentity(record?.intent, `${PLAN_CONTRACT}_INTENT`, plan, permitEnvelope, executionEnvelope);
    historicalAuthority(plan, permitEnvelope, permitRoot, executionEnvelope, executionRoot,
      record.intent.authorizedAt);
    const intent = phase === 'FORWARD' ? record.intent : record.rollbackIntent;
    if (phase === 'FORWARD') {
      demand(!record.receipt && !record.rollbackIntent && !record.rollbackReceipt && !record.rollbackNoEffect,
        'Accepted forward effect cannot be terminalized as zero-effect');
    } else {
      recordIdentity(record.receipt, `${PLAN_CONTRACT}_RECEIPT`, plan, permitEnvelope, executionEnvelope);
      demand(record.receipt.intentSha256 === digest(record.intent) && record.receipt.decision === 'PASS' &&
        intent?.contract === `${PLAN_CONTRACT}_ROLLBACK_INTENT` &&
        intent.operationId === plan.operationId && intent.planSha256 === digest(plan) &&
        intent.forwardReceiptSha256 === digest(record.receipt) &&
        intent.rollbackEnvelopeSha256 === digest(rollbackEnvelope) &&
        intent.oldPointer === plan.newPointer && intent.newPointer === plan.oldPointer &&
        !record.rollbackReceipt && !record.terminalNoEffect,
      'Rollback zero-effect requires the exact pending rollback intent');
      validateRollback(rollbackEnvelope, rollbackRoot, plan, record.receipt,
        instant(intent.authorizedAt, 'rollback intent time'));
    }
    const name = phase === 'FORWARD' ? 'terminalNoEffect' : 'rollbackNoEffect';
    const existing = record[name];
    validateNoEffect(recoveryEnvelope, recoveryRoot, plan, intent, phase,
      phase === 'FORWARD' ? null : record.receipt,
      existing ? instant(existing.acceptedAt, 'zero-effect acceptance') : now);
    if (existing) {
      demand(existing.contract === `${PLAN_CONTRACT}_NO_EFFECT_RECEIPT` &&
        existing.operationId === plan.operationId && existing.planSha256 === digest(plan) &&
        existing.phase === phase && existing.intentSha256 === digest(intent) &&
        existing.recoveryEnvelopeSha256 === digest(recoveryEnvelope) &&
        existing.decision === 'CANCELED_NO_EFFECT', 'Existing zero-effect receipt differs');
      return existing;
    }
    const expectedPointer = phase === 'FORWARD' ? plan.oldPointer : plan.newPointer;
    demand(await host.readPointer() === expectedPointer, 'Zero-effect pointer preimage differs');
    assertProtected(plan, await host.readProtectedState());
    // Signed plan and phase bind both residue target and pointer preimage.
    // The native adapter may remove only the unpublished exact root symlink.
    await host.recoverPointerTemporary(expectedPointer,
      phase === 'FORWARD' ? plan.newPointer : plan.oldPointer);
    await host.closeCanonicalNoEffect(plan, phase, intent);
    demand(await host.readPointer() === expectedPointer, 'Zero-effect pointer changed during residue recovery');
    assertProtected(plan, await host.readProtectedState());
    const receipt = {
      contract: `${PLAN_CONTRACT}_NO_EFFECT_RECEIPT`, operationId: plan.operationId,
      planSha256: digest(plan), phase, intentSha256: digest(intent),
      recoveryEnvelopeSha256: digest(recoveryEnvelope), pointer: expectedPointer,
      protectedStateSha256: plan.protectedStateSha256,
      acceptedAt: new Date(now).toISOString(), decision: 'CANCELED_NO_EFFECT',
    };
    await host.publishExclusive(plan.operationId, name, receipt);
    return receipt;
  });
}
