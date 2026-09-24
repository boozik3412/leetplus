import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { canonical, digest } from './contract.mjs';
import { validatePlanScope, validateControlHandoffAuthority, validateControlRollbackApproval, validatePendingControlHandoffAuthority, validateControlHandoffRecoveryAuthority } from './control-handoff-authority.mjs';

const CONTRACT = 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1';
const RESOURCE_PROFILE_BOOTSTRAP = 'RESOURCE_PROFILE_BOOTSTRAP';
const PREDECESSOR_CONTROL_SHA = '892b25b9fe5ebc8d0c20a7874a77ac312b7a0978';
const PREDECESSOR_CONTRACT_SHA256 = 'bba588a506cee3dc6c03a0b93f25291a4dd5f36c1d05fb79d83128bf0276f79d';
const NOW = Date.parse('2026-09-15T10:00:00.000Z');
const hash = value => String(value).repeat(64);
const sha = value => String(value).repeat(40);

function authority({ action = 'CONTROL_HANDOFF', issuedAt = NOW - 60000, expiresAt = NOW + 60000, acceptedAt = NOW - 1000 } = {}) {
  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const plan = {
    contract: `${CONTRACT}_PLAN`, operationId: crypto.randomUUID(), action,
    hostIdentitySha256: hash('a'), newControlSha256: hash('b'), snapshot: { activeSha256: hash('c') },
    oldMainTarget: '/usr/local/lib/leetplus-compose/old/control.sh', newMainTarget: '/usr/local/lib/leetplus-compose/new/control.sh',
    oldUnitSha256: hash('d'), newUnitSha256: hash('e'), applicationRestartAllowed: false, rollbackAllowed: true,
  };
  if (action === RESOURCE_PROFILE_BOOTSTRAP) Object.assign(plan, {
    oldReleaseSha: PREDECESSOR_CONTROL_SHA, newReleaseSha: sha('f'), predecessorControlSha: PREDECESSOR_CONTROL_SHA,
    predecessorContractSha256: PREDECESSOR_CONTRACT_SHA256, legacyProfile: 'LEGACY_4G', targetProfile: 'API_6G_V1',
    historicalComposeIdentityVerified: true, resourceLimitMutationAllowed: false, timersMayBeStopped: false,
  });
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

function rebindForward(value) {
  value.approvalEnvelope.approval.action = value.plan.action;
  value.approvalEnvelope.approval.planSha256 = digest(value.plan);
  value.approvalEnvelope.signature = crypto.sign(null, Buffer.from(canonical(value.approvalEnvelope.approval)), value.keys.privateKey).toString('base64');
  value.receipt.planSha256 = digest(value.plan);
  value.receipt.approvalSha256 = digest(value.approvalEnvelope);
  value.pointer.receiptSha256 = digest(value.receipt);
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

function variantA(value) {
  const plan = value.plan;
  plan.timersMayBeStopped = false;
  plan.maxLockWaitSeconds = 120;
  plan.oldReleaseSha = '02acca249783cf47c0a24897203d51a206e1c5b2';
  plan.newReleaseSha = sha('f');
  plan.oldControlSha256 = '5ee7133885692b4c6e86ab680b4040770c985cee4c3381fb372302041232fcad';
  plan.orchestratorTransition = {
    contract: 'LEETPLUS_VARIANT_A_ORCHESTRATOR_HANDOFF_V1',
    oldReleaseSha: plan.oldReleaseSha, newReleaseSha: plan.newReleaseSha,
    oldControlSha256: plan.oldControlSha256, newControlSha256: plan.newControlSha256,
    oldOrchestratorSha256: 'c6fd054d39175266ac0603759423f4fe039294c2a42b03f0b8bd12a8f280aa58',
    newOrchestratorSha256: 'c4d13a76d1f97f41dc575d37c5da588b9ba3634b1a053f6b194a86623e8861c4',
    newControlEntrySha256: '4e39b9e8a75ede6bc474fe0ef8b0b5fea60b46edd7c1ed8172744288625ea49f',
    newPreparationRunnerSha256: '9b02c697d6995b0ff9d4cc085d1249d6e83d96d0cb2848a1e6a139acf3f1eb29',
  };
  rebindForward(value);
  return value;
}

const repairOldFiles = {
  'control.mjs': '4e39b9e8a75ede6bc474fe0ef8b0b5fea60b46edd7c1ed8172744288625ea49f',
  'orchestrator.mjs': 'c4d13a76d1f97f41dc575d37c5da588b9ba3634b1a053f6b194a86623e8861c4',
  'preparation-runner.mjs': '9b02c697d6995b0ff9d4cc085d1249d6e83d96d0cb2848a1e6a139acf3f1eb29',
  'worker-authority.mjs': '4c615c56795a025b2c58662c0b9fea5f4dfa7b55d62dae867a77a86dffe0dcf6',
};
const repairNewFiles = {
  'control.mjs': '1496d809e6401cc0f9b9fba983a135ba0ca6cd445ada7ce337f5f94be2714a97',
  'orchestrator.mjs': 'f3c9d239e4fbe5572fdd258bb20e2be0c3ab935105d25308d325babbcba32e45',
  'preparation-runner.mjs': 'd183f55cb804f472a92baf315a206a4ace1dcbe4644956d0b7b707023013f341',
  'control-reconcile.mjs': '1005a02279bfd72b8462c3cf9d151cbd51cb364fb7829d9db2722a1e9c436cf9',
  'worker-continuation.mjs': 'b8c3fdbce90c3254ff147dfdf4f7e0fb20b44c17576294c6695bb69a5f91bef3',
  'worker-continuation-runtime.mjs': 'e89df0e9a8ad6e5346fed82f21b4379965bee5935d899aafc65ff68a74212d54',
  'release-observer.mjs': 'b6841a6047f76e3714751b59b3185bb35db5b66545c260ecb4f1f9aa9f53f4ad',
  'control-handoff-runtime.mjs': '7c60d2105f48d0c435f96077c317bd6636cab2d648fdceda8bdc80df3108242a',
  'install-control.py': 'c41144f91a1cfdba3dc184a0afda5c6917fa512a9873b143b8c271edb433b9b4',
  'worker-authority.mjs': '57d19d442e8708cd9215b2e5bbc055e5e3cfcca64417ec5a7e27f5e7e1dd8e71',
  'derive-rehearsal-inputs.py': 'b928a987234c57fe9e319145e090edebe22719518ae804122e417e128eb23acb',
};

function variantARepair(value) {
  const plan = value.plan;
  plan.timersMayBeStopped = false;
  plan.maxLockWaitSeconds = 120;
  plan.oldReleaseSha = '88010292246249c94ba66ecbab64e4d51ad84d8c';
  plan.newReleaseSha = sha('d');
  plan.oldControlSha256 = '237cbcba1fbfcc9e58e78aede7b57f599b206f8c02253c43006dd308c04e9c85';
  plan.orchestratorTransition = {
    contract: 'LEETPLUS_VARIANT_A_CONTROLLER_REPAIR_HANDOFF_V2',
    oldReleaseSha: plan.oldReleaseSha, newReleaseSha: plan.newReleaseSha,
    oldControlSha256: plan.oldControlSha256, newControlSha256: plan.newControlSha256,
    oldRuntimeFilesSha256: structuredClone(repairOldFiles),
    newRuntimeFilesSha256: structuredClone(repairNewFiles),
  };
  rebindForward(value);
  return value;
}

test('variant A ordinary handoff binds the exact old/new controller and orchestrator transition', () => {
  const exact = variantA(authority());
  validatePlanScope(exact.plan);
  validate(exact);
  for (const [label, mutate] of [
    ['old release', p => { p.oldReleaseSha = sha('0'); }],
    ['old manifest', p => { p.oldControlSha256 = hash('0'); }],
    ['new release binding', p => { p.orchestratorTransition.newReleaseSha = sha('0'); }],
    ['new manifest binding', p => { p.orchestratorTransition.newControlSha256 = hash('0'); }],
    ['same control manifest', p => { p.newControlSha256 = p.oldControlSha256; p.orchestratorTransition.newControlSha256 = p.oldControlSha256; }],
    ['orchestrator bytes', p => { p.orchestratorTransition.newOrchestratorSha256 = hash('0'); }],
    ['entrypoint bytes', p => { p.orchestratorTransition.newControlEntrySha256 = hash('0'); }],
    ['runner bytes', p => { p.orchestratorTransition.newPreparationRunnerSha256 = hash('0'); }],
    ['unexpected field', p => { p.orchestratorTransition.extra = true; }],
    ['app restart', p => { p.applicationRestartAllowed = true; }],
    ['timer change', p => { p.timersMayBeStopped = true; }],
    ['rollback disabled', p => { p.rollbackAllowed = false; }],
    ['unbounded lock wait', p => { p.maxLockWaitSeconds = 121; }],
    ['resource scope smuggled', p => { p.targetProfile = 'API_6G_V1'; }],
  ]) {
    const changed = variantA(authority());
    mutate(changed.plan);
    rebindForward(changed); // A valid signature cannot bless an invalid scope.
    assert.throws(() => validate(changed), /variant A orchestrator transition/, label);
  }
  const bootstrap = authority({ action: RESOURCE_PROFILE_BOOTSTRAP });
  bootstrap.plan.orchestratorTransition = exact.plan.orchestratorTransition;
  assert.throws(() => validatePlanScope(bootstrap.plan), /cannot include variant A/);
});

test('variant A repair handoff binds both manifests and every reviewed runtime leaf', () => {
  validate(variantARepair(authority()));
  const mutations = [
    ['old release', p => { p.oldReleaseSha = sha('0'); }],
    ['old manifest', p => { p.oldControlSha256 = hash('0'); }],
    ['contract confusion', p => { p.orchestratorTransition.contract = 'LEETPLUS_VARIANT_A_ORCHESTRATOR_HANDOFF_V1'; }],
    ['unknown transition field', p => { p.orchestratorTransition.extra = true; }],
    ['unknown old leaf', p => { p.orchestratorTransition.oldRuntimeFilesSha256['extra.mjs'] = hash('0'); }],
    ['missing new leaf', p => { delete p.orchestratorTransition.newRuntimeFilesSha256['install-control.py']; }],
  ];
  for (const [leaf] of Object.entries(repairOldFiles)) {
    mutations.push([`old leaf ${leaf}`, p => { p.orchestratorTransition.oldRuntimeFilesSha256[leaf] = hash('0'); }]);
  }
  for (const [leaf] of Object.entries(repairNewFiles)) {
    mutations.push([`new leaf ${leaf}`, p => { p.orchestratorTransition.newRuntimeFilesSha256[leaf] = hash('0'); }]);
  }
  for (const [label, mutate] of mutations) {
    const changed = variantARepair(authority());
    mutate(changed.plan);
    rebindForward(changed);
    assert.throws(() => validate(changed), /variant A orchestrator transition/, label);
  }
});

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

test('resource-profile bootstrap requires its immutable source-only scope in every authority path', () => {
  const valid = authority({ action: RESOURCE_PROFILE_BOOTSTRAP });
  const pending = pendingAuthority(valid);
  assert.equal(validate(valid), valid.plan);
  assert.equal(validateRollback(valid, rollbackEnvelope(valid)), valid.plan);
  assert.equal(validatePending(valid, pending), valid.plan);
  assert.deepEqual(validateRecovery(valid, pending.intent), { plan: valid.plan, expired: false });

  for (const mutate of [
    plan => plan.oldReleaseSha = sha('e'),
    plan => plan.newReleaseSha = PREDECESSOR_CONTROL_SHA,
    plan => plan.predecessorControlSha = sha('e'),
    plan => plan.predecessorContractSha256 = hash('e'),
    plan => plan.legacyProfile = 'API_4G_V1',
    plan => plan.targetProfile = 'API_12G_V1',
    plan => plan.historicalComposeIdentityVerified = false,
    plan => plan.resourceLimitMutationAllowed = true,
    plan => plan.applicationRestartAllowed = true,
    plan => plan.timersMayBeStopped = true,
    plan => plan.rollbackAllowed = false,
  ]) {
    const invalid = authority({ action: RESOURCE_PROFILE_BOOTSTRAP });
    mutate(invalid.plan);
    rebindForward(invalid);
    const invalidPending = pendingAuthority(invalid);
    assert.throws(() => validate(invalid));
    assert.throws(() => validateRollback(invalid, rollbackEnvelope(invalid)));
    assert.throws(() => validatePending(invalid, invalidPending));
    assert.throws(() => validateRecovery(invalid, invalidPending.intent));
  }
});
