import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { canonical, digest } from './contract.mjs';
import {
  EXTERNAL_WORKER_PUBLIC_ROOT_PATH,
  EXTERNAL_WORKER_ROOT_CONTRACT,
  externalWorkerRootDer,
  externalWorkerRootIntent,
  validateExternalWorkerRootRecovery,
  validateExternalWorkerRootRetirement,
  validateExternalWorkerRootAuthority,
  validateExternalWorkerRootEnrollment,
} from './external-worker-public-root.mjs';

const NOW = Date.parse('2026-09-27T10:00:00.000Z');
const host = 'a'.repeat(64);
const operationId = '12345678-1234-4123-8123-123456789abc';

function fixture() {
  const deployment = crypto.generateKeyPairSync('ed25519');
  const external = crypto.generateKeyPairSync('ed25519');
  const deploymentPublicPem = deployment.publicKey.export({ type: 'spki', format: 'pem' });
  const publicPem = external.publicKey.export({ type: 'spki', format: 'pem' });
  const statement = {
    contract: `${EXTERNAL_WORKER_ROOT_CONTRACT}_APPROVAL`, operationId, action: 'ENROLL_PUBLIC_ONLY',
    hostIdentitySha256: host, publicDerSha256: digest(externalWorkerRootDer(publicPem)),
    publicPath: EXTERNAL_WORKER_PUBLIC_ROOT_PATH,
    issuedAt: new Date(NOW - 60_000).toISOString(), expiresAt: new Date(NOW + 20 * 60_000).toISOString(),
  };
  const envelope = { statement, signature: crypto.sign(null, Buffer.from(canonical(statement)), deployment.privateKey).toString('base64') };
  const receipt = {
    contract: `${EXTERNAL_WORKER_ROOT_CONTRACT}_RECEIPT`, decision: 'PUBLIC_ONLY_ENROLLED', operationId,
    envelopeSha256: digest(envelope), publicDerSha256: statement.publicDerSha256,
    acceptedAt: new Date(NOW).toISOString(),
  };
  return { deployment, external, deploymentPublicPem, publicPem, envelope, receipt };
}

test('fresh enrollment and expired historical receipt have separate gates', () => {
  const f = fixture();
  assert.equal(validateExternalWorkerRootEnrollment({ ...f, hostIdentitySha256: host }, { now: NOW }).statement, f.envelope.statement);
  assert.equal(validateExternalWorkerRootAuthority({ ...f, hostIdentitySha256: host }, { now: NOW + 86400000 }), f.publicPem);
  assert.throws(() => validateExternalWorkerRootEnrollment({ ...f, hostIdentitySha256: host }, { now: NOW + 86400000 }), /not currently valid/);
});
test('expired partial root needs a fresh signed recovery permit, not a file mtime', () => {
  const f = fixture(), intent = externalWorkerRootIntent({ ...f, hostIdentitySha256: host });
  const statement = { contract: `${EXTERNAL_WORKER_ROOT_CONTRACT}_RECOVERY_APPROVAL`,
    operationId: '22345678-1234-4123-8123-123456789abc', action: 'RECOVER_INSTALLED',
    hostIdentitySha256: host, originalOperationId: operationId,
    originalEnvelopeSha256: digest(f.envelope), intentSha256: digest(intent),
    publicDerSha256: f.envelope.statement.publicDerSha256, publicPath: EXTERNAL_WORKER_PUBLIC_ROOT_PATH,
    installedPostimageSha256: digest(f.publicPem), issuedAt: new Date(NOW + 86400000 - 60000).toISOString(),
    expiresAt: new Date(NOW + 86400000 + 600000).toISOString() };
  const recoveryEnvelope = { statement, signature: crypto.sign(null, Buffer.from(canonical(statement)), f.deployment.privateKey).toString('base64') };
  assert.equal(validateExternalWorkerRootRecovery({ originalEnvelope: f.envelope, recoveryEnvelope, intent,
    publicPem: f.publicPem, deploymentPublicPem: f.deploymentPublicPem,
    hostIdentitySha256: host, installedPublicBytes: f.publicPem }, { now: NOW + 86400000 }).statement, statement);
  const receipt = { ...f.receipt, acceptedAt: new Date(NOW + 86400000).toISOString(),
    recoveryEnvelopeSha256: digest(recoveryEnvelope), recoveryOperationId: statement.operationId };
  assert.equal(validateExternalWorkerRootAuthority({ ...f, hostIdentitySha256: host,
    receipt, intent, recoveryEnvelope }, { now: NOW + 86400000 }), f.publicPem);
  assert.throws(() => validateExternalWorkerRootAuthority({ ...f, hostIdentitySha256: host,
    receipt: { ...receipt, recoveryEnvelopeSha256: undefined }, intent, recoveryEnvelope }, { now: NOW + 86400000 }));
  assert.throws(() => validateExternalWorkerRootRecovery({ originalEnvelope: f.envelope, recoveryEnvelope, intent,
    publicPem: f.publicPem, deploymentPublicPem: f.deploymentPublicPem,
    hostIdentitySha256: host, installedPublicBytes: Buffer.from('foreign') }, { now: NOW + 86400000 }), /postimage/);
});

test('root is public-only, Ed25519, and separate from deployment authority', () => {
  const f = fixture();
  f.envelope.statement.publicDerSha256 = digest(externalWorkerRootDer(f.deploymentPublicPem));
  f.envelope.signature = crypto.sign(null, Buffer.from(canonical(f.envelope.statement)), f.deployment.privateKey).toString('base64');
  assert.throws(() => validateExternalWorkerRootEnrollment({ ...f, publicPem: f.deploymentPublicPem, hostIdentitySha256: host }, { now: NOW }), /separate/);
  const privatePem = f.external.privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.throws(() => externalWorkerRootDer(privatePem), /public bytes only/);
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
  assert.throws(() => externalWorkerRootDer(rsa), /Ed25519/);
});
test('retired terminal can reconcile after response loss and rejects conflicting or installed postimage', () => {
  const f = fixture(), input = { ...f, hostIdentitySha256: host }, intent = externalWorkerRootIntent(input);
  const statement = { contract: `${EXTERNAL_WORKER_ROOT_CONTRACT}_RECOVERY_APPROVAL`,
    operationId: '22345678-1234-4123-8123-123456789abc', action: 'RETIRE_ABSENT', hostIdentitySha256: host,
    originalOperationId: operationId, originalEnvelopeSha256: digest(f.envelope), intentSha256: digest(intent),
    publicDerSha256: f.envelope.statement.publicDerSha256, publicPath: EXTERNAL_WORKER_PUBLIC_ROOT_PATH,
    installedPostimageSha256: null, issuedAt: new Date(NOW - 60000).toISOString(), expiresAt: new Date(NOW + 600000).toISOString() };
  const recoveryEnvelope = { statement, signature: crypto.sign(null, Buffer.from(canonical(statement)), f.deployment.privateKey).toString('base64') };
  const retirement = { contract: `${EXTERNAL_WORKER_ROOT_CONTRACT}_RETIREMENT`, decision: 'RETIRED_ABSENT',
    operationId: statement.operationId, originalOperationId: operationId, recoveryEnvelopeSha256: digest(recoveryEnvelope),
    intentSha256: digest(intent), retiredAt: new Date(NOW).toISOString() };
  const terminal = { ...input, intent, retirement, recoveryEnvelope, installedPublicBytes: null };
  assert.equal(validateExternalWorkerRootRetirement(terminal), retirement);
  assert.equal(validateExternalWorkerRootRetirement(terminal), retirement);
  assert.throws(() => validateExternalWorkerRootRetirement({ ...terminal, retirement: { ...retirement, intentSha256: '0'.repeat(64) } }), /drift/);
  assert.throws(() => validateExternalWorkerRootRetirement({ ...terminal, installedPublicBytes: f.publicPem }), /postimage/);
});

test('signature, public digest, host, path and operation replay are exact', () => {
  const mutations = [
    f => { f.envelope.statement.publicDerSha256 = '0'.repeat(64); },
    f => { f.envelope.statement.hostIdentitySha256 = '0'.repeat(64); },
    f => { f.envelope.statement.publicPath = '/etc/leetplus-compose/approval-root.pem'; },
    f => { f.envelope.statement.operationId = 'not-a-uuid'; },
    f => { f.envelope.signature = crypto.sign(null, Buffer.from(canonical(f.envelope.statement)), crypto.generateKeyPairSync('ed25519').privateKey).toString('base64'); },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    assert.throws(() => validateExternalWorkerRootEnrollment({ ...f, hostIdentitySha256: host }, { now: NOW }));
  }
  const replay = fixture(); replay.receipt.operationId = '22345678-1234-4123-8123-123456789abc';
  assert.throws(() => validateExternalWorkerRootAuthority({ ...replay, hostIdentitySha256: host }, { now: NOW }), /receipt/);
});

test('exact fields and bounded canonical UTC interval reject scope expansion', () => {
  const extra = fixture(); extra.envelope.statement.appPrivateKeyPath = '/secret';
  assert.throws(() => validateExternalWorkerRootEnrollment({ ...extra, hostIdentitySha256: host }, { now: NOW }), /fields/);
  const long = fixture(); long.envelope.statement.expiresAt = new Date(NOW + 31 * 60_000).toISOString();
  assert.throws(() => validateExternalWorkerRootEnrollment({ ...long, hostIdentitySha256: host }, { now: NOW }), /window/);
  const offset = fixture(); offset.envelope.statement.issuedAt = '2026-09-27T15:00:00+05:00';
  assert.throws(() => validateExternalWorkerRootEnrollment({ ...offset, hostIdentitySha256: host }, { now: NOW }), /issue time/);
});
