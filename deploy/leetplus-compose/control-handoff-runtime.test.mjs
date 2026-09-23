import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { CONTRACT, SCHEMA, canonical, digest, renderCompose } from './contract.mjs';
import { PHASES } from './orchestrator.mjs';
import { validateAcceptedApplicationSnapshot, validatePendingNetworkBootAuthority } from './control-handoff-runtime.mjs';

const key = crypto.generateKeyPairSync('ed25519');
const publicKey = key.publicKey.export({ type: 'spki', format: 'pem' });
const release = (sha, seed) => ({
  contract: CONTRACT, ...SCHEMA, releaseSha: sha.repeat(40), builtAt: '2026-09-10T12:00:00Z',
  images: Object.fromEntries(['api', 'web', 'postgres', 'redis'].map((role, index) => [role, `sha256:${String(seed + index).repeat(64)}`])),
});

function plan({ rollback = false } = {}) {
  const blue = release('a', 1);
  const green = release('b', 5);
  const value = {
    contract: `${CONTRACT}_PLAN`, operationId: crypto.randomUUID(), action: rollback ? 'ROLLOUT' : 'BOOTSTRAP',
    hostIdentitySha256: 'c'.repeat(64), controlSha256: 'd'.repeat(64), admissionSha256: 'e'.repeat(64), archiveSha256: 'f'.repeat(64),
    backupReceiptSha256: '1'.repeat(64), rehearsalReceiptSha256: '2'.repeat(64), migrationReceiptSha256: '3'.repeat(64),
    targetSlot: rollback ? 'green' : 'blue', generation: rollback ? 1 : 0, blue, green, dataRelease: blue, dataAdmissionSha256: 'e'.repeat(64),
    previous: rollback ? { activeSlot: 'blue', generation: 1, blue, green: blue, dataRelease: blue, dataAdmissionSha256: 'e'.repeat(64) } : null,
    secretDigests: Object.fromEntries(['acceptance.json', 'api-blue.json', 'api-green.json', 'db-ca.pem'].map(name => [name, '4'.repeat(64)])),
    networkPolicySha256: '5'.repeat(64), databaseIdentitySha256: '6'.repeat(64),
  };
  value.composeSha256 = digest(renderCompose({ blue, green, dataRelease: blue, activeSlot: value.targetSlot }));
  return value;
}

function approval(value) {
  const signed = {
    contract: `${CONTRACT}_APPROVAL`, operationId: value.operationId, action: value.action, hostIdentitySha256: value.hostIdentitySha256,
    planSha256: digest(value), issuedAt: '2026-09-15T09:00:00.000Z', expiresAt: '2026-09-15T10:00:00.000Z',
  };
  return { approval: signed, signature: crypto.sign(null, Buffer.from(canonical(signed)), key.privateKey).toString('base64') };
}

function records(value) {
  let previousReceiptSha256 = null;
  return Object.fromEntries(PHASES.map(phase => {
    const intent = { phase, planSha256: digest(value), previousReceiptSha256 };
    const evidence = { phase, planSha256: digest(value) };
    const receipt = { phase, planSha256: digest(value), intentSha256: digest(intent), evidenceSha256: digest(evidence), previousReceiptSha256 };
    previousReceiptSha256 = digest(receipt);
    return [phase, { intent, evidence, receipt }];
  }));
}

function forwardHistory() {
  const value = plan(), chain = records(value);
  const final = { contract: `${CONTRACT}_COMPLETED`, operationId: value.operationId, planSha256: digest(value), lastReceiptSha256: digest(chain.POSTCHECK.receipt) };
  const active = { operationId: value.operationId, generation: value.generation + 1, activeSlot: value.targetSlot, blue: value.blue, green: value.green, dataRelease: value.dataRelease, dataAdmissionSha256: value.dataAdmissionSha256, planSha256: digest(value) };
  return { history: { plan: value, approval: approval(value), records: chain, final, rolledBack: null }, active };
}

function rollbackHistory() {
  const value = plan({ rollback: true }), chain = records(value);
  chain.POSTCHECK = { intent: chain.POSTCHECK.intent };
  const active = { operationId: value.operationId, generation: value.generation + 2, activeSlot: value.previous.activeSlot, blue: value.blue, green: value.green, dataRelease: value.dataRelease, dataAdmissionSha256: value.dataAdmissionSha256, planSha256: digest(value), outcome: 'ROLLED_BACK' };
  const rolledBack = { contract: `${CONTRACT}_ROLLED_BACK`, planSha256: digest(value), reason: 'POSTCHECK_FAILED', active };
  return { history: { plan: value, approval: approval(value), records: chain, final: null, rolledBack }, active };
}

function validate(history, active) {
  return validateAcceptedApplicationSnapshot({ histories: [history], active, publicKey });
}

test('new controller accepts exact guarded terminal history but not approval beyond its evidence expiry', () => {
  const value = plan({ rollback: true });
  value.preparationGuard = {
    contract: 'LEETPLUS_PREPARATION_GUARD_V1',
    hostIdentitySha256: value.hostIdentitySha256,
    controllerManifestSha256: value.controlSha256,
    activeSha256: digest(value.previous),
    generation: value.generation,
    activeSlot: value.previous.activeSlot,
  };
  value.preparationEvidenceExpiresAt = '2026-09-15T10:00:00.000Z';
  const chain = records(value);
  const final = { contract: `${CONTRACT}_COMPLETED`, operationId: value.operationId,
    planSha256: digest(value), lastReceiptSha256: digest(chain.POSTCHECK.receipt) };
  const active = { operationId: value.operationId, generation: value.generation + 1,
    activeSlot: value.targetSlot, blue: value.blue, green: value.green,
    dataRelease: value.dataRelease, dataAdmissionSha256: value.dataAdmissionSha256,
    planSha256: digest(value) };
  const history = { plan: value, approval: approval(value), records: chain, final, rolledBack: null };
  validate(history, active);
  history.approval.approval.expiresAt = '2026-09-15T10:01:00.000Z';
  history.approval.signature = crypto.sign(null, Buffer.from(canonical(history.approval.approval)), key.privateKey).toString('base64');
  assert.throws(() => validate(history, active), /cannot extend expired preparation evidence/);
});

test('accepts a complete forward terminal chain and returns its control digest', () => {
  const { history, active } = forwardHistory();
  assert.deepEqual(validate(history, active), { controlSha256: history.plan.controlSha256 });
});

test('accepts a receipt-bound postcheck rollback and returns its control digest', () => {
  const { history, active } = rollbackHistory();
  assert.deepEqual(validate(history, active), { controlSha256: history.plan.controlSha256 });
});

test('rejects an unbound final receipt and a gapped terminal chain', () => {
  const first = forwardHistory();
  first.history.final.lastReceiptSha256 = '0'.repeat(64);
  assert.throws(() => validate(first.history, first.active), /terminal receipt/i);

  const second = forwardHistory();
  delete second.history.records.BIND;
  assert.throws(() => validate(second.history, second.active), /gap|incomplete/i);
});

test('rejects wrong active slot, data baseline, invalid approval, and rollback mismatch', () => {
  const wrongSlot = forwardHistory();
  wrongSlot.active.activeSlot = 'green';
  assert.throws(() => validate(wrongSlot.history, wrongSlot.active), /Active state/i);

  const wrongData = forwardHistory();
  wrongData.active.dataAdmissionSha256 = '0'.repeat(64);
  assert.throws(() => validate(wrongData.history, wrongData.active), /Active state/i);

  const badApproval = forwardHistory();
  badApproval.history.approval.signature = crypto.sign(null, Buffer.from(canonical(badApproval.history.approval.approval)), crypto.generateKeyPairSync('ed25519').privateKey).toString('base64');
  assert.throws(() => validate(badApproval.history, badApproval.active), /signature/i);

  const badRollback = rollbackHistory();
  badRollback.history.rolledBack.active.generation += 1;
  assert.throws(() => validate(badRollback.history, badRollback.active), /Rollback terminal/i);
});

test('permits pending network boot only from its exact kernel service cgroup', () => {
  const { history, active } = forwardHistory();
  const input = { histories: [history], active, publicKey };
  assert.deepEqual(
    validatePendingNetworkBootAuthority({ ...input, cgroup: '0::/system.slice/leetplus-compose-network.service\n' }),
    { controlSha256: history.plan.controlSha256 },
  );
  assert.deepEqual(
    validatePendingNetworkBootAuthority({ ...input, cgroup: '0::/system.slice/leetplus-compose-network.service' }),
    { controlSha256: history.plan.controlSha256 },
  );
  for (const cgroup of [
    '0::/user.slice/user-1000.slice/session-1.scope\n',
    '0::/system.slice/leetplus-compose-network.service\n0::/system.slice/other.service\n',
    '0::/system.slice/leetplus-compose-network.service \n',
  ]) {
    assert.throws(() => validatePendingNetworkBootAuthority({ ...input, cgroup }), /exact systemd service cgroup/i);
  }
});

test('pending network boot rejects forged application authority and wrong active state', () => {
  const forged = forwardHistory();
  forged.history.approval.signature = crypto.sign(null, Buffer.from(canonical(forged.history.approval.approval)), crypto.generateKeyPairSync('ed25519').privateKey).toString('base64');
  assert.throws(() => validatePendingNetworkBootAuthority({ histories: [forged.history], active: forged.active, publicKey, cgroup: '0::/system.slice/leetplus-compose-network.service\n' }), /signature/i);

  const wrongActive = forwardHistory();
  wrongActive.active.generation += 1;
  assert.throws(() => validatePendingNetworkBootAuthority({ histories: [wrongActive.history], active: wrongActive.active, publicKey, cgroup: '0::/system.slice/leetplus-compose-network.service\n' }), /Active state/i);
});
