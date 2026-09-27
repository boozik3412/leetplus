import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  ACTION,
  PERMIT_CONTRACT,
  PREDECESSOR_MANIFEST_SHA256,
  PREDECESSOR_RELEASE,
  PREDECESSOR_VERIFIER_SHA256,
  TARGET_ADMISSION_SHA256,
  TARGET_ARCHIVE_SHA256,
  TARGET_FILE_COUNT,
  TARGET_FILES_SHA256,
  TARGET_MANIFEST_SHA256,
  TARGET_RELEASE,
  canonical,
  digest,
  validateABridgeBootstrapPermit,
  verifyThenPrepare,
} from './a-bridge-bootstrap-authority.mjs';

const NOW = Date.parse('2026-09-27T10:00:00.000Z');
const hash = value => String(value).repeat(64);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function reviewedTargetFiles() {
  const root = 'deploy/leetplus-compose';
  const names = execFileSync('git', ['-C', repository, 'ls-tree', '--name-only', `${TARGET_RELEASE}:${root}`],
    { encoding: 'utf8' }).trim().split(/\r?\n/u).filter(Boolean);
  return Object.fromEntries(names.map(name => {
    const bytes = execFileSync('git', ['-C', repository, 'show', `${TARGET_RELEASE}:${root}/${name}`]);
    return [name, crypto.createHash('sha256').update(bytes).digest('hex')];
  }));
}

const REVIEWED_TARGET_FILES = reviewedTargetFiles();
assert.equal(Object.keys(REVIEWED_TARGET_FILES).length, TARGET_FILE_COUNT);
assert.equal(digest(REVIEWED_TARGET_FILES), TARGET_FILES_SHA256);

function fixture() {
  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const servingCore = {
    'control.sh': '0587c842147ebb959ca08f9ac23de95b0f377bdfb49036353013f6ee69c18ade',
    'control.mjs': '1496d809e6401cc0f9b9fba983a135ba0ca6cd445ada7ce337f5f94be2714a97',
    'orchestrator.mjs': 'f3c9d239e4fbe5572fdd258bb20e2be0c3ab935105d25308d325babbcba32e45',
    'contract.mjs': 'dda0b3bf018b26a03ed7cc714489f6f049045fb7ff78a0701dfd22ec51405e93',
    'control_handoff.py': PREDECESSOR_VERIFIER_SHA256,
    'control-handoff-authority.mjs': '47258b2c78c730ede5dd453f12d33580b7f4e784b415d6ef227ed993f2a0a8d5',
  };
  const files = structuredClone(REVIEWED_TARGET_FILES);
  const expected = {
    operationId: '12345678-1234-4123-8123-123456789abc', action: ACTION,
    hostIdentitySha256: hash('a'), activeSha256: hash('b'),
    predecessor: { releaseSha: PREDECESSOR_RELEASE, manifestSha256: PREDECESSOR_MANIFEST_SHA256,
      verifierSha256: PREDECESSOR_VERIFIER_SHA256, servingCore },
    target: { releaseSha: TARGET_RELEASE, manifestSha256: TARGET_MANIFEST_SHA256,
      admissionSha256: TARGET_ADMISSION_SHA256, controlArchiveSha256: TARGET_ARCHIVE_SHA256,
      filesSha256: TARGET_FILES_SHA256, files },
    bootstrap: { verifierSourceSha256: hash('c'), publicRootSha256: digest(publicKey) },
  };
  const permit = { contract: PERMIT_CONTRACT, ...structuredClone(expected),
    issuedAt: new Date(NOW - 60_000).toISOString(), expiresAt: new Date(NOW + 10 * 60_000).toISOString() };
  const envelope = { permit, signature: crypto.sign(null, Buffer.from(canonical(permit)), keys.privateKey).toString('base64') };
  return { keys, publicKey, expected, envelope };
}

function resign(value) {
  value.envelope.signature = crypto.sign(null, Buffer.from(canonical(value.envelope.permit)), value.keys.privateKey).toString('base64');
  return value;
}

test('accepts only the exact independently observed b0 to bridge permit', () => {
  const value = fixture();
  const authority = validateABridgeBootstrapPermit(value.envelope, value.publicKey, value.expected, { now: NOW });
  assert.equal(authority.permit, value.envelope.permit);
  assert.equal(authority.envelopeSha256, digest(value.envelope));
});

test('rejects mutated and added target leaves even under a fresh valid signature', () => {
  for (const mutate of [
    value => { value.envelope.permit.target.files['control_handoff.py'] = hash('0'); },
    value => { value.envelope.permit.target.files['unreviewed-root-helper.py'] = hash('0'); },
  ]) {
    const value = fixture(); mutate(value); value.envelope.permit.target.filesSha256 = digest(value.envelope.permit.target.files); resign(value);
    assert.throws(() => validateABridgeBootstrapPermit(value.envelope, value.publicKey, value.expected, { now: NOW }),
      /independently observed|reviewed bridge/);
  }
});

test('rejects changed independently observed bytes and strict map drift', () => {
  for (const mutate of [
    value => { value.expected.activeSha256 = hash('0'); },
    value => { value.expected.predecessor.servingCore['control.mjs'] = hash('0'); },
    value => { value.expected.target.files['another.mjs'] = hash('0'); value.expected.target.filesSha256 = digest(value.expected.target.files); },
    value => { value.expected.bootstrap.verifierSourceSha256 = hash('0'); },
    value => { value.expected.bootstrap.publicRootSha256 = hash('0'); },
    value => { value.expected.extra = true; },
  ]) {
    const value = fixture(); mutate(value);
    assert.throws(() => validateABridgeBootstrapPermit(value.envelope, value.publicKey, value.expected, { now: NOW }));
  }
});

test('rejects missing, corrupt, foreign and expired signature authority', () => {
  const unsigned = fixture(); unsigned.envelope.signature = '';
  assert.throws(() => validateABridgeBootstrapPermit(unsigned.envelope, unsigned.publicKey, unsigned.expected, { now: NOW }));
  const corrupt = fixture(); corrupt.envelope.permit.activeSha256 = hash('0');
  assert.throws(() => validateABridgeBootstrapPermit(corrupt.envelope, corrupt.publicKey, corrupt.expected, { now: NOW }));
  const foreign = fixture();
  const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  assert.throws(() => validateABridgeBootstrapPermit(foreign.envelope, other, foreign.expected, { now: NOW }));
  const expired = fixture(); expired.envelope.permit.expiresAt = new Date(NOW - 1).toISOString(); resign(expired);
  assert.throws(() => validateABridgeBootstrapPermit(expired.envelope, expired.publicKey, expired.expected, { now: NOW }), /expired/);
  const unbounded = fixture(); unbounded.envelope.permit.expiresAt = new Date(NOW + 31 * 60_000).toISOString(); resign(unbounded);
  assert.throws(() => validateABridgeBootstrapPermit(unbounded.envelope, unbounded.publicKey, unbounded.expected, { now: NOW }), /unbounded/);
});

test('never invokes an adversarial adapter before authority passes', async () => {
  const rejected = fixture(); rejected.envelope.signature = 'A'.repeat(86) + '==';
  const calls = [];
  const adapter = {
    snapshot: async () => { calls.push('snapshot'); throw new Error('target called'); },
    preTargetExec: async () => { calls.push('preTargetExec'); throw new Error('target called'); },
  };
  await assert.rejects(verifyThenPrepare(rejected.envelope, rejected.publicKey, rejected.expected, adapter, { now: NOW }));
  assert.deepEqual(calls, []);
});

test('verifies first, reproduces observations, then permits standalone preparation', async () => {
  const value = fixture(), calls = [];
  const adapter = {
    snapshot: async authority => { calls.push(`snapshot:${authority.envelopeSha256}`); return {
      hostIdentitySha256: value.expected.hostIdentitySha256,
      activeSha256: value.expected.activeSha256,
      predecessor: structuredClone(value.expected.predecessor), target: structuredClone(value.expected.target),
      bootstrap: structuredClone(value.expected.bootstrap),
    }; },
    preTargetExec: async context => { calls.push(`preTargetExec:${context.authority.envelopeSha256}`); return 'PREPARED_NOT_AUTHORIZATION'; },
  };
  assert.equal(await verifyThenPrepare(value.envelope, value.publicKey, value.expected, adapter, { now: NOW }), 'PREPARED_NOT_AUTHORIZATION');
  assert.deepEqual(calls, [`snapshot:${digest(value.envelope)}`, `preTargetExec:${digest(value.envelope)}`]);

  const drift = fixture(), driftCalls = [];
  await assert.rejects(verifyThenPrepare(drift.envelope, drift.publicKey, drift.expected, {
    snapshot: async () => { driftCalls.push('snapshot'); return { hostIdentitySha256: hash('0'),
      activeSha256: drift.expected.activeSha256, predecessor: drift.expected.predecessor,
      target: drift.expected.target, bootstrap: drift.expected.bootstrap }; },
    preTargetExec: async () => { driftCalls.push('preTargetExec'); },
  }, { now: NOW }), /observations changed/);
  assert.deepEqual(driftCalls, ['snapshot']);
});
