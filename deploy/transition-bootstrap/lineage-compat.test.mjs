import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  validatePlanScope,
  validateControlHandoffAuthority,
  validatePendingControlHandoffAuthority,
  validateControlRollbackApproval,
} from '../leetplus-compose/control-handoff-authority.mjs';
import { canonical, digest } from './protocol.mjs';

const NOW = Date.parse('2026-09-27T12:00:00.000Z');
const hash = char => char.repeat(64);
const UUID = '12345678-1234-4123-8123-123456789abc';
const OLD = 'b0cbf3a4f302b299762fa055f3bffe0376a91182';
const NEW = 'bebeb41354da0dd04b218495cbbf5d75ba9f0a85';
const oldPointer = `/usr/local/lib/leetplus-compose/${OLD}/control.sh`;
const newPointer = `/usr/local/lib/leetplus-compose/${NEW}/control.sh`;

function fixture() {
  const pair = crypto.generateKeyPairSync('ed25519');
  const publicKey = pair.publicKey.export({ format: 'pem', type: 'spki' });
  const oldActive = { operationId: UUID, generation: 10 };
  const plan = {
    contract: 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_PLAN', operationId: UUID,
    action: 'CONTROL_HANDOFF', hostIdentitySha256: hash('1'),
    oldReleaseSha: OLD, newReleaseSha: NEW,
    oldControlSha256: hash('2'), newControlSha256: hash('3'),
    oldMainTarget: oldPointer, newMainTarget: newPointer,
    snapshot: { activeSha256: digest(oldActive) },
    timers: { 'leetplus-compose-bonus.timer': {}, 'leetplus-compose-daily.timer': {} },
    oldUnitSha256: hash('4'), oldUnitMode: 0o644, newUnitSha256: hash('4'),
    previousPointer: Buffer.from(canonical({ operationId: UUID, receiptSha256: hash('5') })).toString('base64'),
    evidenceSha256: hash('6'), refreshScope: { operation: 'refresh', setNames: [
      'lp_leetplus_https', 'lp_leetplus_smtp'], ttlSeconds: 3600, publicAddressesOnly: true,
      policySha256: hash('7') },
    applicationRestartAllowed: false, timersMayBeStopped: false,
    rollbackAllowed: true, maxLockWaitSeconds: 120,
    standaloneTransition: { contract: 'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_LINK',
      planSha256: hash('8') },
  };
  const approval = {
    contract: 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_APPROVAL', operationId: UUID,
    action: 'CONTROL_HANDOFF', hostIdentitySha256: plan.hostIdentitySha256,
    planSha256: digest(plan), issuedAt: new Date(NOW - 60_000).toISOString(),
    expiresAt: new Date(NOW + 10 * 60_000).toISOString(),
  };
  const envelope = { approval, signature: crypto.sign(null, Buffer.from(canonical(approval)),
    pair.privateKey).toString('base64') };
  const intent = { operationId: UUID, planSha256: digest(plan),
    approvalSha256: digest(envelope), authorizedAt: new Date(NOW).toISOString() };
  const receipt = { contract: 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_RECEIPT',
    decision: 'PASS', operationId: UUID, planSha256: digest(plan),
    approvalSha256: digest(envelope), acceptedAt: new Date(NOW).toISOString() };
  const pointer = { operationId: UUID, receiptSha256: digest(receipt) };
  const context = { controlSha256: plan.newControlSha256,
    hostIdentitySha256: plan.hostIdentitySha256, activeSha256: plan.snapshot.activeSha256,
    mainTarget: newPointer, unitSha256: plan.newUnitSha256 };
  return { pair, publicKey, plan, envelope, intent, receipt, pointer, context };
}

test('negative: frozen controller rejects standalone plan as serving lineage', () => {
  const value = fixture();
  const standalone = { ...value.plan, contract: 'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_PLAN' };
  assert.throws(() => validatePlanScope(standalone), /Invalid control handoff plan/);
});

test('positive: frozen V1 authority accepts pending and final lineage with cross-linked plan', () => {
  const value = fixture();
  assert.doesNotThrow(() => validatePlanScope(value.plan));
  assert.equal(validatePendingControlHandoffAuthority({ plan: value.plan,
    approvalEnvelope: value.envelope, intent: value.intent,
    pending: { operationId: UUID } }, value.publicKey, value.context, NOW), value.plan);
  assert.equal(validateControlHandoffAuthority({ plan: value.plan,
    approvalEnvelope: value.envelope, receipt: value.receipt, pointer: value.pointer },
  value.publicKey, value.context, NOW), value.plan);
  const rollbackApproval = { contract: 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_ROLLBACK_APPROVAL',
    action: 'CONTROL_ROLLBACK', operationId: UUID,
    hostIdentitySha256: value.plan.hostIdentitySha256,
    planSha256: digest(value.plan), receiptSha256: digest(value.receipt),
    issuedAt: new Date(NOW - 60_000).toISOString(),
    expiresAt: new Date(NOW + 10 * 60_000).toISOString() };
  const rollbackEnvelope = { approval: rollbackApproval,
    signature: crypto.sign(null, Buffer.from(canonical(rollbackApproval)),
      value.pair.privateKey).toString('base64') };
  assert.equal(validateControlRollbackApproval({ plan: value.plan, receipt: value.receipt,
    approvalEnvelope: rollbackEnvelope }, value.publicKey, value.context, NOW), value.plan);
});

test('negative: plan mutation, foreign host and missing pending record reject V1 authority', () => {
  const value = fixture();
  const changed = structuredClone(value.plan);
  changed.standaloneTransition.planSha256 = hash('0');
  assert.throws(() => validateControlHandoffAuthority({ plan: changed,
    approvalEnvelope: value.envelope, receipt: value.receipt, pointer: value.pointer },
  value.publicKey, value.context, NOW));
  assert.throws(() => validatePendingControlHandoffAuthority({ plan: value.plan,
    approvalEnvelope: value.envelope, intent: value.intent,
    pending: { operationId: UUID } }, value.publicKey,
  { ...value.context, hostIdentitySha256: hash('0') }, NOW));
  assert.throws(() => validatePendingControlHandoffAuthority({ plan: value.plan,
    approvalEnvelope: value.envelope, intent: null,
    pending: { operationId: UUID } }, value.publicKey, value.context, NOW));
});
