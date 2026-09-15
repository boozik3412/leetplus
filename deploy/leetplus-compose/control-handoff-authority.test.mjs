import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { canonical, digest } from './contract.mjs';
import { validateControlHandoffAuthority, validateControlRollbackApproval, validatePendingControlHandoffAuthority, validateControlHandoffRecoveryAuthority } from './control-handoff-authority.mjs';

const CONTRACT = 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1';
const NOW = Date.parse('2026-09-15T10:00:00.000Z');
const hash = value => String(value).repeat(64);

function authority({ issuedAt = NOW - 60000, expiresAt = NOW + 60000, acceptedAt = NOW - 1000 } = {}) {
  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const plan = {
    contract: `${CONTRACT}_PLAN`, operationId: crypto.randomUUID(), action: 'CONTROL_HANDOFF',
    hostIdentitySha256: hash('a'), newControlSha256: hash('b'), snapshot: { activeSha256: hash('c') },
    oldMainTarget: '/usr/local/lib/leetplus-compose/old/control.sh', newMainTarget: '/usr/local/lib/leetplus-compose/new/control.sh',
    oldUnitSha256: hash('d'), newUnitSha256: hash('e'), applicationRestartAllowed: false, rollbackAllowed: true,
  };
  const approval = {
    contract: `${CONTRACT}_APPROVAL`, operationId: plan.operationId, action: plan.action,
    hostIdentitySha256: plan.hostIdentitySha256, planSha256: digest(plan),
    issuedAt: new Date(issuedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString(),
  };
  const approvalEnvelope = { approval, signature: crypto.sign(null, Buffer.from(canonical(approval)), keys.privateKey).toString('base64') };
  const receipt = {
    contract: `${CONTRACT}_RECEIPT`, decision: 'PASS', operationId: plan.operationId,
    planSha256: digest(plan), approvalSha256: digest(approvalEnvelope), acceptedAt: new Date(acceptedAt).toISOString(),
  };
  const pointer = { operationId: plan.operationId, receiptSha256: digest(receipt) };
  const context = { controlSha256: plan.newControlSha256, hostIdentitySha256: plan.hostIdentitySha256, activeSha256: plan.snapshot.activeSha256, mainTarget: plan.newMainTarget, unitSha256: plan.newUnitSha256 };
  return { keys, publicKey, plan, approvalEnvelope, receipt, pointer, context };
}

function validate(value, now = NOW) {
  return validateControlHandoffAuthority(value, value.publicKey, value.context, now);
}

function rollbackEnvelope(value, { issuedAt = NOW - 60000, expiresAt = NOW + 60000 } = {}) {
  const approval = {
    contract: `${CONTRACT}_ROLLBACK_APPROVAL`, action: 'CONTROL_ROLLBACK', operationId: value.plan.operationId,
    hostIdentitySha256: value.plan.hostIdentitySha256, planSha256: digest(value.plan), receiptSha256: digest(value.receipt),
    issuedAt: new Date(issuedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString(),
  };
  return { approval, signature: crypto.sign(null, Buffer.from(canonical(approval)), value.keys.privateKey).toString('base64') };
}

function validateRollback(value, approvalEnvelope, now = NOW) {
  return validateControlRollbackApproval({ plan: value.plan, receipt: value.receipt, approvalEnvelope }, value.publicKey, value.context, now);
}

function pendingAuthority(value, authorizedAt = NOW - 1000) {
  return {
    intent: { operationId: value.plan.operationId, planSha256: digest(value.plan), approvalSha256: digest(value.approvalEnvelope), authorizedAt: new Date(authorizedAt).toISOString() },
    pending: { operationId: value.plan.operationId },
  };
}

function validatePending(value, { intent, pending }, now = NOW) {
  return validatePendingControlHandoffAuthority({ plan: value.plan, approvalEnvelope: value.approvalEnvelope, intent, pending }, value.publicKey, value.context, now);
}

function validateRecovery(value, intent, now = NOW) {
  return validateControlHandoffRecoveryAuthority({ plan: value.plan, approvalEnvelope: value.approvalEnvelope, intent }, value.publicKey, value.context, now);
}

test('accepts an exact signed, receipted control handoff and its ongoing authority', () => {
  const current = authority();
  assert.equal(validate(current), current.plan);

  const acceptedBeforeExpiry = authority({ issuedAt: NOW - 5 * 3600000, expiresAt: NOW - 3600000, acceptedAt: NOW - 2 * 3600000 });
  assert.equal(validate(acceptedBeforeExpiry), acceptedBeforeExpiry.plan);
});

test('rejects signature, identity, cross-operation, and receipt binding drift', () => {
  const invalidSignature = authority();
  invalidSignature.approvalEnvelope.signature = crypto.sign(null, Buffer.from(canonical(invalidSignature.approvalEnvelope.approval)), crypto.generateKeyPairSync('ed25519').privateKey).toString('base64');
  assert.throws(() => validate(invalidSignature));

  for (const mutate of [
    value => value.context.controlSha256 = hash('d'),
    value => value.context.hostIdentitySha256 = hash('d'),
    value => value.context.activeSha256 = hash('d'),
    value => value.receipt.operationId = crypto.randomUUID(),
    value => value.pointer.operationId = crypto.randomUUID(),
    value => value.pointer.receiptSha256 = hash('d'),
    value => value.receipt.decision = 'FAIL',
  ]) {
    const value = authority();
    mutate(value);
    assert.throws(() => validate(value));
  }
});

test('rejects tampered receipts and acceptance outside the bounded approval window', () => {
  const tamperedReceipt = authority();
  tamperedReceipt.receipt.acceptedAt = new Date(NOW).toISOString();
  assert.throws(() => validate(tamperedReceipt));

  for (const options of [
    { acceptedAt: NOW - 120000 },
    { acceptedAt: NOW + 30001 },
    { issuedAt: NOW - 5 * 3600000, expiresAt: NOW - 1, acceptedAt: NOW - 5 * 3600000 - 1 },
    { issuedAt: NOW - 5 * 3600000, expiresAt: NOW - 1, acceptedAt: NOW - 1000 },
    { issuedAt: NOW - 60000, expiresAt: NOW + 4 * 3600000 + 1, acceptedAt: NOW },
  ]) {
    const value = authority(options);
    assert.throws(() => validate(value));
  }
});

test('accepts a distinct current rollback approval bound to the accepted forward receipt', () => {
  const value = authority();
  assert.equal(validateRollback(value, rollbackEnvelope(value)), value.plan);
});

test('rejects forward authority, receipt, target, expiry, and signature drift during rollback', () => {
  const value = authority();
  assert.throws(() => validateRollback(value, value.approvalEnvelope));

  const wrongReceipt = authority();
  const receiptApproval = rollbackEnvelope(wrongReceipt);
  wrongReceipt.receipt.operationId = crypto.randomUUID();
  assert.throws(() => validateRollback(wrongReceipt, receiptApproval));

  const wrongTarget = authority();
  wrongTarget.context.controlSha256 = hash('d');
  assert.throws(() => validateRollback(wrongTarget, rollbackEnvelope(wrongTarget)));

  const expired = authority();
  assert.throws(() => validateRollback(expired, rollbackEnvelope(expired, { issuedAt: NOW - 5 * 3600000, expiresAt: NOW - 1 })));

  const invalidSignature = authority();
  const approvalEnvelope = rollbackEnvelope(invalidSignature);
  approvalEnvelope.signature = crypto.sign(null, Buffer.from(canonical(approvalEnvelope.approval)), crypto.generateKeyPairSync('ed25519').privateKey).toString('base64');
  assert.throws(() => validateRollback(invalidSignature, approvalEnvelope));
});

test('accepts a timely provisional handoff authority after its forward approval expires', () => {
  const value = authority({ issuedAt: NOW - 5 * 3600000, expiresAt: NOW - 3600000, acceptedAt: NOW - 2 * 3600000 });
  assert.equal(validatePending(value, pendingAuthority(value, NOW - 2 * 3600000)), value.plan);
});

test('rejects stale postimages, unbound intent, missing pending marker, and future provisional authority', () => {
  const oldPointer = authority();
  oldPointer.context.mainTarget = oldPointer.plan.oldMainTarget;
  assert.throws(() => validatePending(oldPointer, pendingAuthority(oldPointer)));

  const oldUnit = authority();
  oldUnit.context.unitSha256 = oldUnit.plan.oldUnitSha256;
  assert.throws(() => validatePending(oldUnit, pendingAuthority(oldUnit)));

  const wrongIntent = authority();
  const wrongAuthority = pendingAuthority(wrongIntent);
  wrongAuthority.intent.planSha256 = hash('f');
  assert.throws(() => validatePending(wrongIntent, wrongAuthority));

  const noPending = authority();
  assert.throws(() => validatePending(noPending, { ...pendingAuthority(noPending), pending: undefined }));

  const futureDate = authority();
  assert.throws(() => validatePending(futureDate, pendingAuthority(futureDate, NOW + 30001)));
});

test('permits only timely unfinished recovery after the forward approval expires', () => {
  const value = authority({ issuedAt: NOW - 5 * 3600000, expiresAt: NOW - 3600000, acceptedAt: NOW - 2 * 3600000 });
  const { intent } = pendingAuthority(value, NOW - 2 * 3600000);
  assert.deepEqual(validateRecovery(value, intent), { plan: value.plan, expired: true });
});

test('rejects unsigned or foreign recovery authority', () => {
  const badSignature = authority();
  badSignature.approvalEnvelope.signature = crypto.sign(null, Buffer.from(canonical(badSignature.approvalEnvelope.approval)), crypto.generateKeyPairSync('ed25519').privateKey).toString('base64');
  assert.throws(() => validateRecovery(badSignature, pendingAuthority(badSignature).intent));

  const foreign = authority();
  foreign.context.activeSha256 = hash('f');
  assert.throws(() => validateRecovery(foreign, pendingAuthority(foreign).intent));
});

test('rejects untimely recovery intent and handoffs without rollback authority', () => {
  const untimely = authority();
  assert.throws(() => validateRecovery(untimely, pendingAuthority(untimely, NOW + 30001).intent));

  const noRollback = authority();
  noRollback.plan.rollbackAllowed = false;
  assert.throws(() => validateRecovery(noRollback, pendingAuthority(noRollback).intent));
});
