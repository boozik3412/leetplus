import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { canonical } from './contract.mjs';
import { EXACT_TARGET_ACTION, EXACT_TARGET_ROLLBACK_ACTION, PERMIT_CONTRACT,
  ROLLBACK_PERMIT_CONTRACT, validateExactTargetPermit, validateExactTargetRollbackPermit,
  validateAcceptedExactTargetHandoff, validatePendingExactTargetHandoff } from './exact-target-handoff-authority.mjs';
import { digest } from './contract.mjs';

const keys = crypto.generateKeyPairSync('ed25519');
const trustedPublicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
const now = Date.parse('2026-09-24T15:00:00.000Z');
const hash = digit => digit.repeat(64);
const release = digit => digit.repeat(40);

function fixture() {
  const expected = {
    operationId: '12345678-1234-4123-8123-123456789abc',
    action: EXACT_TARGET_ACTION,
    hostIdentitySha256: hash('1'), planSha256: hash('2'), activeSha256: hash('3'),
    predecessor: { releaseSha: release('a'), manifestSha256: hash('4'), verifierSha256: hash('5') },
    target: { releaseSha: release('b'), manifestSha256: hash('6'), admissionSha256: hash('7'),
      controlArchiveSha256: hash('8'), filesSha256: hash('9'), criticalFilesSha256: hash('c') },
  };
  const permit = { contract: PERMIT_CONTRACT, ...expected,
    issuedAt: '2026-09-24T14:59:00.000Z', expiresAt: '2026-09-24T16:00:00.000Z' };
  const envelope = { permit, signature: crypto.sign(null, Buffer.from(canonical(permit)), keys.privateKey).toString('base64') };
  return { expected, envelope };
}

test('exact-target permit binds a separate Ed25519 authority over both complete controller identities', () => {
  const { expected, envelope } = fixture();
  const verified = validateExactTargetPermit(envelope, trustedPublicKey, expected, { now });
  assert.equal(verified.permit, envelope.permit);
  assert.match(verified.envelopeSha256, /^[a-f0-9]{64}$/);
  for (const side of ['predecessor', 'target']) {
    for (const leaf of Object.keys(expected[side])) {
      const changed = structuredClone(expected);
      changed[side][leaf] = leaf === 'releaseSha' ? release('e') : hash('e');
      assert.throws(() => validateExactTargetPermit(envelope, trustedPublicKey, changed, { now }),
        /differs from observed plan or installed bytes/, `${side}.${leaf}`);
    }
  }
  for (const leaf of ['operationId', 'hostIdentitySha256', 'planSha256', 'activeSha256']) {
    const changed = structuredClone(expected);
    changed[leaf] = leaf === 'operationId' ? '82345678-1234-4123-8123-123456789abc' : hash('e');
    assert.throws(() => validateExactTargetPermit(envelope, trustedPublicKey, changed, { now }), /differs from observed/);
  }
});

test('invalid signature, authority root, expiry, contract and extra fields fail closed', () => {
  const { expected, envelope } = fixture();
  assert.throws(() => validateExactTargetPermit(envelope, crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }), expected, { now }), /signature verification/);
  assert.throws(() => validateExactTargetPermit(envelope, trustedPublicKey, expected, { now: Date.parse('2026-09-24T16:00:00.000Z') }), /validity window/);
  assert.doesNotThrow(() => validateExactTargetPermit(envelope, trustedPublicKey, expected, {
    now: Date.parse('2026-09-25T00:00:00.000Z'), allowExpired: true }));
  for (const mutate of [
    e => { e.signature = 'A'.repeat(88); },
    e => { e.permit.contract = 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_APPROVAL'; },
    e => { e.permit.target.extra = hash('f'); },
    e => { e.permit.action = 'CONTROL_ROLLBACK'; },
    e => { e.permit.expiresAt = '2026-09-24T19:00:00.000Z'; },
    e => { e.permit.predecessor.releaseSha = e.permit.target.releaseSha; },
  ]) {
    const changed = structuredClone(envelope);
    mutate(changed);
    assert.throws(() => validateExactTargetPermit(changed, trustedPublicKey, expected, { now }));
  }
});

test('rollback needs a distinct permit bound to the accepted forward receipt', () => {
  const { expected, envelope: forward } = fixture();
  const rollbackExpected = { ...expected, action: EXACT_TARGET_ROLLBACK_ACTION,
    receiptSha256: hash('d') };
  const permit = { contract: ROLLBACK_PERMIT_CONTRACT, ...rollbackExpected,
    issuedAt: '2026-09-24T14:59:00.000Z', expiresAt: '2026-09-24T16:00:00.000Z' };
  const envelope = { permit, signature: crypto.sign(null, Buffer.from(canonical(permit)), keys.privateKey).toString('base64') };
  assert.doesNotThrow(() => validateExactTargetRollbackPermit(envelope, trustedPublicKey, rollbackExpected, { now }));
  assert.throws(() => validateExactTargetRollbackPermit(envelope, trustedPublicKey, rollbackExpected,
    { now: Date.parse('2026-09-24T16:00:00.000Z') }), /validity window/);
  assert.doesNotThrow(() => validateExactTargetRollbackPermit(envelope, trustedPublicKey, rollbackExpected,
    { now: Date.parse('2026-09-24T16:00:00.000Z'), allowExpired: true }));
  assert.throws(() => validateExactTargetRollbackPermit(forward, trustedPublicKey, rollbackExpected, { now }), /rollback permit|rollback identity/);
  const wrongReceipt = { ...rollbackExpected, receiptSha256: hash('e') };
  assert.throws(() => validateExactTargetRollbackPermit(envelope, trustedPublicKey, wrongReceipt, { now }), /accepted forward receipt/);
});

function acceptedFixture() {
  const plan = {
    contract: 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V2_PLAN',
    operationId: '12345678-1234-4123-8123-123456789abc', action: EXACT_TARGET_ACTION,
    hostIdentitySha256: hash('1'), oldReleaseSha: release('a'), newReleaseSha: release('b'),
    oldControlSha256: hash('4'), newControlSha256: hash('6'),
    oldMainTarget: `/usr/local/lib/leetplus-compose/${release('a')}/control.sh`,
    newMainTarget: `/usr/local/lib/leetplus-compose/${release('b')}/control.sh`,
    snapshot: { activeSha256: hash('3') }, newUnitSha256: hash('e'),
    permitPath: 'permit.json',
    applicationRestartAllowed: false, timersMayBeStopped: false,
    rollbackAllowed: true, maxLockWaitSeconds: 120,
    predecessor: { releaseSha: release('a'), manifestSha256: hash('4'), verifierSha256: hash('5') },
    target: { releaseSha: release('b'), manifestSha256: hash('6'), admissionSha256: hash('7'),
      controlArchiveSha256: hash('8'), filesSha256: hash('9'), criticalFilesSha256: hash('c') },
  };
  const permit = { contract: PERMIT_CONTRACT, operationId: plan.operationId, action: plan.action,
    hostIdentitySha256: plan.hostIdentitySha256, planSha256: digest(plan),
    activeSha256: plan.snapshot.activeSha256, predecessor: plan.predecessor, target: plan.target,
    issuedAt: '2026-09-24T14:59:00.000Z', expiresAt: '2026-09-24T16:00:00.000Z' };
  const permitEnvelope = { permit,
    signature: crypto.sign(null, Buffer.from(canonical(permit)), keys.privateKey).toString('base64') };
  const context = { controlSha256: plan.newControlSha256,
    hostIdentitySha256: plan.hostIdentitySha256, activeSha256: plan.snapshot.activeSha256,
    mainTarget: plan.newMainTarget, unitSha256: plan.newUnitSha256 };
  const receipt = { contract: `${PERMIT_CONTRACT}_RECEIPT`, decision: 'PASS',
    operationId: plan.operationId, planSha256: digest(plan),
    permitSha256: digest(permitEnvelope), permitPath: 'permit.json',
    authorizedAt: '2026-09-24T14:59:30.000Z', acceptedAt: '2026-09-24T15:00:00.000Z' };
  const pointer = { operationId: plan.operationId, receiptSha256: digest(receipt) };
  const intent = { operationId: plan.operationId, planSha256: digest(plan),
    permitSha256: digest(permitEnvelope), permitPath: 'permit.json', authorizedAt: '2026-09-24T14:59:30.000Z' };
  const pending = { operationId: plan.operationId };
  return { plan, permitEnvelope, receipt, pointer, intent, pending, context };
}

test('B continuity accepts only predecessor-issued receipt and signed pending intent', () => {
  const f = acceptedFixture();
  assert.equal(validateAcceptedExactTargetHandoff(f, trustedPublicKey, f.context, now), f.plan);
  assert.equal(validatePendingExactTargetHandoff(f, trustedPublicKey, f.context, now), f.plan);
  for (const mutate of [
    f => { f.context.controlSha256 = hash('0'); },
    f => { f.receipt.permitSha256 = hash('0'); },
    f => { f.pointer.receiptSha256 = hash('0'); },
    f => { f.plan.newControlSha256 = hash('0'); },
    f => { f.permitEnvelope.permit.target.manifestSha256 = hash('0'); },
  ]) {
    const changed = acceptedFixture(); mutate(changed);
    assert.throws(() => validateAcceptedExactTargetHandoff(changed, trustedPublicKey, changed.context, now));
  }
  for (const mutate of [
    f => { f.intent.permitSha256 = hash('0'); },
    f => { f.intent.authorizedAt = '2026-09-24T17:00:00.000Z'; },
    f => { f.pending.operationId = '82345678-1234-4123-8123-123456789abc'; },
  ]) {
    const changed = acceptedFixture(); mutate(changed);
    assert.throws(() => validatePendingExactTargetHandoff(changed, trustedPublicKey, changed.context, now));
  }
});
