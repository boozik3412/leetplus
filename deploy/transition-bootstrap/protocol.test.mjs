import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  ACTION as A_ACTION, PERMIT_CONTRACT as A_CONTRACT,
  PREDECESSOR_RELEASE as A_PREDECESSOR, PREDECESSOR_MANIFEST_SHA256,
  PREDECESSOR_VERIFIER_SHA256, TARGET_RELEASE, TARGET_MANIFEST_SHA256,
  TARGET_ADMISSION_SHA256, TARGET_ARCHIVE_SHA256, TARGET_FILES_SHA256,
} from '../leetplus-compose/a-bridge-bootstrap-authority.mjs';
import {
  ACTION as B_ACTION, CONTRACT as B_CONTRACT, CRITICAL_LEAVES,
  EFFECT_SCOPE, PREDECESSOR as BRIDGE_PREDECESSOR,
} from '../leetplus-compose/bridge-external-successor-authority.mjs';
import {
  MODES, EXECUTION_CONTRACT, ROLLBACK_CONTRACT, NO_EFFECT_CONTRACT, canonical, digest,
  prepare, apply, reconcile, rollback, reconcileRollback, terminalizeNoEffect,
} from './protocol.mjs';

const NOW = Date.parse('2026-09-27T12:00:00.000Z');
const hash = letter => letter.repeat(64);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pointer = release => `/usr/local/lib/leetplus-compose/${release}/control.sh`;
const keyPair = () => {
  const keys = crypto.generateKeyPairSync('ed25519');
  return { privateKey: keys.privateKey, publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) };
};
const sign = (command, key) => ({ command, signature: crypto.sign(null, Buffer.from(canonical(command)), key.privateKey).toString('base64') });

function aFiles() {
  const root = 'deploy/leetplus-compose';
  const names = execFileSync('git', ['-C', repo, 'ls-tree', '--name-only', `${TARGET_RELEASE}:${root}`],
    { encoding: 'utf8' }).trim().split(/\r?\n/u).filter(Boolean);
  return Object.fromEntries(names.map(name => [name, digest(execFileSync('git',
    ['-C', repo, 'show', `${TARGET_RELEASE}:${root}/${name}`]))]));
}
const A_FILES = aFiles();
assert.equal(digest(A_FILES), TARGET_FILES_SHA256);

function fixture(mode = MODES.BRIDGE_TO_EXTERNAL) {
  const permitKey = keyPair(), executionKey = keyPair(), rollbackKey = keyPair();
  const protectedState = { activeSha256: hash('a'), applicationSha256: hash('a'), dataSha256: hash('a'),
    nginxSha256: hash('a'), workerGrantsSha256: hash('a'), timersSha256: hash('b'),
    providerPolicySha256: hash('a'), containersSha256: hash('c'),
    networkRefreshUnitSha256: hash('a'), firewallSha256: hash('d') };
  const activeSha256 = protectedState.activeSha256;
  let expected;
  if (mode === MODES.A_TO_BRIDGE) {
    expected = {
      operationId: '12345678-1234-4123-8123-123456789abc', action: A_ACTION,
      hostIdentitySha256: hash('1'), activeSha256,
      predecessor: {
        releaseSha: A_PREDECESSOR, manifestSha256: PREDECESSOR_MANIFEST_SHA256,
        verifierSha256: PREDECESSOR_VERIFIER_SHA256,
        servingCore: {
          'control.sh': '0587c842147ebb959ca08f9ac23de95b0f377bdfb49036353013f6ee69c18ade',
          'control.mjs': '1496d809e6401cc0f9b9fba983a135ba0ca6cd445ada7ce337f5f94be2714a97',
          'orchestrator.mjs': 'f3c9d239e4fbe5572fdd258bb20e2be0c3ab935105d25308d325babbcba32e45',
          'contract.mjs': 'dda0b3bf018b26a03ed7cc714489f6f049045fb7ff78a0701dfd22ec51405e93',
          'control_handoff.py': PREDECESSOR_VERIFIER_SHA256,
          'control-handoff-authority.mjs': '47258b2c78c730ede5dd453f12d33580b7f4e784b415d6ef227ed993f2a0a8d5',
        },
      },
      target: {
        releaseSha: TARGET_RELEASE, manifestSha256: TARGET_MANIFEST_SHA256,
        admissionSha256: TARGET_ADMISSION_SHA256, controlArchiveSha256: TARGET_ARCHIVE_SHA256,
        filesSha256: TARGET_FILES_SHA256, files: structuredClone(A_FILES),
      },
      bootstrap: { verifierSourceSha256: hash('2'), publicRootSha256: digest(permitKey.publicKey) },
    };
  } else {
    const files = Object.fromEntries(CRITICAL_LEAVES.map((name, index) => [name, digest(`${name}:${index}`)]));
    files.Dockerfile = hash('e');
    const criticalFiles = Object.fromEntries(CRITICAL_LEAVES.map(name => [name, files[name]]));
    expected = {
      operationId: '12345678-1234-4123-8123-123456789abc', action: B_ACTION,
      predecessor: structuredClone(BRIDGE_PREDECESSOR),
      target: {
        releaseSha: 'f'.repeat(40), manifestSha256: hash('3'), admissionSha256: hash('4'),
        controlArchiveSha256: hash('5'), filesSha256: digest(files), fileCount: Object.keys(files).length,
        criticalFilesSha256: digest(criticalFiles), files, criticalFiles,
      },
      host: { hostIdentitySha256: hash('1'), activeSha256, approvalRootSha256: hash('6'),
        servingCoreTarget: pointer(BRIDGE_PREDECESSOR.releaseSha) },
      verifier: { sourceSha256: hash('2'), publicRootSha256: digest(permitKey.publicKey) },
      effects: structuredClone(EFFECT_SCOPE),
    };
  }
  const permit = {
    contract: mode === MODES.A_TO_BRIDGE ? A_CONTRACT : B_CONTRACT,
    ...structuredClone(expected), issuedAt: new Date(NOW - 60_000).toISOString(),
    expiresAt: new Date(NOW + 10 * 60_000).toISOString(),
  };
  const permitEnvelope = { permit, signature: crypto.sign(null, Buffer.from(canonical(permit)),
    permitKey.privateKey).toString('base64') };
  const state = { observed: { expected, protectedState,
    pointer: pointer(mode === MODES.A_TO_BRIDGE ? A_PREDECESSOR : BRIDGE_PREDECESSOR.releaseSha) },
    records: {}, locks: [], calls: [], failCas: null };
  const host = {
    withLocks: async (modeName, action) => { state.locks.push(modeName); return action(); },
    observe: async () => structuredClone(state.observed),
    readPointer: async () => state.observed.pointer,
    readProtectedState: async () => structuredClone(state.observed.protectedState),
    readOperation: async () => structuredClone(state.records),
    publishExclusive: async (_id, name, value) => {
      assert.equal(state.records[name], undefined);
      state.calls.push(`publish:${name}`); state.records[name] = structuredClone(value);
    },
    compareAndSwapPointer: async (oldValue, newValue) => {
      state.calls.push('CAS'); assert.equal(state.observed.pointer, oldValue);
      if (state.failCas === 'before') throw new Error('lost response before CAS');
      state.observed.pointer = newValue;
      if (state.failCas === 'after') throw new Error('lost response after CAS');
    },
    recoverPointerTemporary: async (expectedPointer, _expectedTemporary) => {
      assert.equal(state.observed.pointer, expectedPointer);
      state.calls.push('recover-pointer-temp');
    },
    prepareCanonicalForward: async () => state.calls.push('canonical:prepare-forward'),
    finalizeCanonicalForward: async () => state.calls.push('canonical:finalize-forward'),
    reconcileCanonicalForward: async () => state.calls.push('canonical:reconcile-forward'),
    prepareCanonicalRollback: async () => state.calls.push('canonical:prepare-rollback'),
    finalizeCanonicalRollback: async () => state.calls.push('canonical:finalize-rollback'),
    reconcileCanonicalRollback: async () => state.calls.push('canonical:reconcile-rollback'),
    closeCanonicalNoEffect: async () => state.calls.push('canonical:close-no-effect'),
  };
  const evidence = { backupReceiptSha256: hash('7'), restoredCopyReceiptSha256: hash('8'),
    hostBaselineSha256: hash('9') };
  return { mode, permitKey, executionKey, rollbackKey, expected, permitEnvelope, state, host, evidence };
}

async function prepared(value) {
  const result = await prepare({ mode: value.mode, envelope: value.permitEnvelope,
    permitRoot: value.permitKey.publicKey, evidence: value.evidence, host: value.host, now: NOW });
  assert.equal(result.decision, 'PREPARED_NOT_AUTHORIZATION');
  return result.plan;
}

function execution(value, plan) {
  return sign({ contract: EXECUTION_CONTRACT, operationId: plan.operationId,
    planSha256: digest(plan), permitEnvelopeSha256: digest(value.permitEnvelope),
    effect: 'CONTROLLER_POINTER_ONLY', issuedAt: new Date(NOW - 10_000).toISOString(),
    expiresAt: new Date(NOW + 5 * 60_000).toISOString() }, value.executionKey);
}

test('both independently observed predecessor transitions prepare and apply only after signed authority and durable intent', async () => {
  for (const mode of Object.values(MODES)) {
    const value = fixture(mode), plan = await prepared(value), executionEnvelope = execution(value, plan);
    const receipt = await apply({ plan, permitEnvelope: value.permitEnvelope, permitRoot: value.permitKey.publicKey,
      executionEnvelope, executionRoot: value.executionKey.publicKey, host: value.host, now: NOW });
    assert.equal(receipt.decision, 'PASS');
    assert.deepEqual(value.state.calls, ['publish:intent', 'canonical:prepare-forward', 'CAS',
      'canonical:finalize-forward', 'publish:receipt']);
    assert.deepEqual(value.state.locks, ['READ', 'WRITE']);
    assert.equal(value.state.observed.pointer, plan.newPointer);
  }
});

test('rejects target mutation, foreign host, signature and expiry before intent or target callback', async () => {
  const mutations = [
    v => { v.state.observed.expected.target.files['control.sh'] = hash('0'); },
    v => { v.state.observed.expected.host.hostIdentitySha256 = hash('0'); },
    v => { v.permitEnvelope.signature = 'A'.repeat(86) + '=='; },
    v => { v.permitEnvelope.permit.expiresAt = new Date(NOW - 1).toISOString(); },
  ];
  for (const mutate of mutations) {
    const value = fixture(); mutate(value);
    await assert.rejects(prepared(value));
    assert.deepEqual(value.state.calls, []);
  }
  const value = fixture(), plan = await prepared(value), bad = execution(value, plan);
  bad.command.effect = 'APPLICATION_RESTART';
  await assert.rejects(apply({ plan, permitEnvelope: value.permitEnvelope, permitRoot: value.permitKey.publicKey,
    executionEnvelope: bad, executionRoot: value.executionKey.publicKey, host: value.host, now: NOW }));
  assert.deepEqual(value.state.calls, []);
});

test('lost response after pointer CAS reconciles the same intent without a second effect', async () => {
  const value = fixture(), plan = await prepared(value), executionEnvelope = execution(value, plan);
  value.state.failCas = 'after';
  await assert.rejects(apply({ plan, permitEnvelope: value.permitEnvelope, permitRoot: value.permitKey.publicKey,
    executionEnvelope, executionRoot: value.executionKey.publicKey, host: value.host, now: NOW }), /lost response/);
  const result = await reconcile({ plan, permitEnvelope: value.permitEnvelope,
    permitRoot: value.permitKey.publicKey, executionEnvelope,
    executionRoot: value.executionKey.publicKey, host: value.host });
  assert.equal(result.decision, 'RECONCILED_ACCEPTED');
  assert.deepEqual(value.state.calls, ['publish:intent', 'canonical:prepare-forward', 'CAS',
    'canonical:reconcile-forward', 'publish:receipt']);
});

test('lost response before pointer CAS records no effect and forbids blind retry', async () => {
  const value = fixture(), plan = await prepared(value), executionEnvelope = execution(value, plan);
  value.state.failCas = 'before';
  await assert.rejects(apply({ plan, permitEnvelope: value.permitEnvelope, permitRoot: value.permitKey.publicKey,
    executionEnvelope, executionRoot: value.executionKey.publicKey, host: value.host, now: NOW }));
  assert.equal((await reconcile({ plan, permitEnvelope: value.permitEnvelope,
    permitRoot: value.permitKey.publicKey, executionEnvelope,
    executionRoot: value.executionKey.publicKey, host: value.host })).decision, 'NO_EFFECT_RECORDED_NO_RETRY');
  assert.deepEqual(value.state.calls, ['publish:intent', 'canonical:prepare-forward', 'CAS']);
});

test('rollback needs a new receipt-bound signature and unchanged protected state', async () => {
  const value = fixture(), plan = await prepared(value), executionEnvelope = execution(value, plan);
  const forwardReceipt = await apply({ plan, permitEnvelope: value.permitEnvelope, permitRoot: value.permitKey.publicKey,
    executionEnvelope, executionRoot: value.executionKey.publicKey, host: value.host, now: NOW });
  const rollbackEnvelope = sign({ contract: ROLLBACK_CONTRACT, operationId: plan.operationId,
    planSha256: digest(plan), forwardReceiptSha256: digest(forwardReceipt), effect: 'CONTROLLER_POINTER_ROLLBACK_ONLY',
    issuedAt: new Date(NOW - 10_000).toISOString(), expiresAt: new Date(NOW + 5 * 60_000).toISOString() }, value.rollbackKey);
  const wrong = structuredClone(rollbackEnvelope); wrong.command.forwardReceiptSha256 = hash('0');
  await assert.rejects(rollback({ plan, permitEnvelope: value.permitEnvelope, executionEnvelope,
    rollbackEnvelope: wrong, rollbackRoot: value.rollbackKey.publicKey, host: value.host, now: NOW }));
  assert.equal(value.state.observed.pointer, plan.newPointer);
  value.state.observed.protectedState.timersSha256 = hash('0');
  await assert.rejects(rollback({ plan, permitEnvelope: value.permitEnvelope, executionEnvelope,
    rollbackEnvelope, rollbackRoot: value.rollbackKey.publicKey, host: value.host, now: NOW }), /Protected host state changed/);
  value.state.observed.protectedState.timersSha256 = hash('b');
  value.state.failCas = 'after';
  await assert.rejects(rollback({ plan, permitEnvelope: value.permitEnvelope, executionEnvelope,
    rollbackEnvelope, rollbackRoot: value.rollbackKey.publicKey, host: value.host, now: NOW }), /lost response/);
  const result = await reconcileRollback({ plan, permitEnvelope: value.permitEnvelope,
    permitRoot: value.permitKey.publicKey, executionEnvelope,
    executionRoot: value.executionKey.publicKey, rollbackEnvelope,
    rollbackRoot: value.rollbackKey.publicKey, host: value.host });
  assert.equal(result.decision, 'RECONCILED_ROLLED_BACK');
  assert.equal(value.state.observed.pointer, plan.oldPointer);
  assert.equal(value.state.calls.filter(name => name === 'CAS').length, 2);
});

test('fresh signed zero-effect command closes a crashed forward intent without another CAS', async () => {
  const value = fixture(), plan = await prepared(value), executionEnvelope = execution(value, plan);
  value.state.failCas = 'before';
  await assert.rejects(apply({ plan, permitEnvelope: value.permitEnvelope, permitRoot: value.permitKey.publicKey,
    executionEnvelope, executionRoot: value.executionKey.publicKey, host: value.host, now: NOW }));
  const recoveryKey = keyPair();
  const recoveryEnvelope = sign({ contract: NO_EFFECT_CONTRACT, operationId: plan.operationId,
    planSha256: digest(plan), phase: 'FORWARD', intentSha256: digest(value.state.records.intent),
    forwardReceiptSha256: null, effect: 'TERMINAL_RECORD_ONLY',
    issuedAt: new Date(NOW - 10_000).toISOString(), expiresAt: new Date(NOW + 5 * 60_000).toISOString() }, recoveryKey);
  const args = { plan, permitEnvelope: value.permitEnvelope, permitRoot: value.permitKey.publicKey,
    executionEnvelope, executionRoot: value.executionKey.publicKey, phase: 'FORWARD',
    recoveryEnvelope, recoveryRoot: recoveryKey.publicKey, host: value.host, now: NOW };
  const wrong = structuredClone(recoveryEnvelope); wrong.command.intentSha256 = hash('0');
  await assert.rejects(terminalizeNoEffect({ ...args, recoveryEnvelope: wrong }));
  const receipt = await terminalizeNoEffect(args);
  assert.equal(receipt.decision, 'CANCELED_NO_EFFECT');
  assert.deepEqual(value.state.calls, ['publish:intent', 'canonical:prepare-forward', 'CAS',
    'recover-pointer-temp', 'canonical:close-no-effect', 'publish:terminalNoEffect']);
  assert.deepEqual(await terminalizeNoEffect({ ...args, now: NOW + 60 * 60_000 }), receipt);
  assert.equal(value.state.calls.filter(name => name === 'CAS').length, 1);
});

test('separate zero-effect rollback command closes only the exact pending rollback intent', async () => {
  const value = fixture(), plan = await prepared(value), executionEnvelope = execution(value, plan);
  const forwardReceipt = await apply({ plan, permitEnvelope: value.permitEnvelope, permitRoot: value.permitKey.publicKey,
    executionEnvelope, executionRoot: value.executionKey.publicKey, host: value.host, now: NOW });
  const rollbackEnvelope = sign({ contract: ROLLBACK_CONTRACT, operationId: plan.operationId,
    planSha256: digest(plan), forwardReceiptSha256: digest(forwardReceipt), effect: 'CONTROLLER_POINTER_ROLLBACK_ONLY',
    issuedAt: new Date(NOW - 10_000).toISOString(), expiresAt: new Date(NOW + 5 * 60_000).toISOString() }, value.rollbackKey);
  value.state.failCas = 'before';
  await assert.rejects(rollback({ plan, permitEnvelope: value.permitEnvelope, executionEnvelope,
    rollbackEnvelope, rollbackRoot: value.rollbackKey.publicKey, host: value.host, now: NOW }));
  const recoveryKey = keyPair();
  const recoveryEnvelope = sign({ contract: NO_EFFECT_CONTRACT, operationId: plan.operationId,
    planSha256: digest(plan), phase: 'ROLLBACK', intentSha256: digest(value.state.records.rollbackIntent),
    forwardReceiptSha256: digest(forwardReceipt), effect: 'TERMINAL_RECORD_ONLY',
    issuedAt: new Date(NOW - 10_000).toISOString(), expiresAt: new Date(NOW + 5 * 60_000).toISOString() }, recoveryKey);
  const receipt = await terminalizeNoEffect({ plan, permitEnvelope: value.permitEnvelope,
    permitRoot: value.permitKey.publicKey, executionEnvelope, executionRoot: value.executionKey.publicKey,
    phase: 'ROLLBACK', rollbackEnvelope, rollbackRoot: value.rollbackKey.publicKey,
    recoveryEnvelope, recoveryRoot: recoveryKey.publicKey, host: value.host, now: NOW });
  assert.equal(receipt.phase, 'ROLLBACK');
  assert.equal(receipt.decision, 'CANCELED_NO_EFFECT');
  assert.equal(value.state.observed.pointer, plan.newPointer);
});

test('historical reconciliation rejects forged intent, signature and foreign roots', async () => {
  const value = fixture(), plan = await prepared(value), executionEnvelope = execution(value, plan);
  value.state.failCas = 'after';
  await assert.rejects(apply({ plan, permitEnvelope: value.permitEnvelope, permitRoot: value.permitKey.publicKey,
    executionEnvelope, executionRoot: value.executionKey.publicKey, host: value.host, now: NOW }));
  const args = { plan, permitEnvelope: value.permitEnvelope, permitRoot: value.permitKey.publicKey,
    executionEnvelope, executionRoot: value.executionKey.publicKey, host: value.host };
  await assert.rejects(reconcile({ ...args, executionRoot: keyPair().publicKey }));
  value.state.records.intent.authorizedAt = new Date(NOW + 3600_000).toISOString();
  await assert.rejects(reconcile(args), /expired/);
  assert.equal(value.state.records.receipt, undefined);
});
