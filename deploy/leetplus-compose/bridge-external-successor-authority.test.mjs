import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  ACTION,
  CONTRACT,
  CRITICAL_LEAVES,
  EFFECT_SCOPE,
  PREDECESSOR,
  canonical,
  digest,
  validateBridgeExternalSuccessorPermit,
  verifyThenPrepareSuccessor,
} from './bridge-external-successor-authority.mjs';

const NOW = Date.parse('2026-09-27T12:00:00.000Z');
const hash = value => String(value).repeat(64);

function fixture() {
  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const files = Object.fromEntries(CRITICAL_LEAVES.map((leaf, index) =>
    [leaf, crypto.createHash('sha256').update(`target:${index}:${leaf}`).digest('hex')]));
  files['Dockerfile'] = hash('d');
  files['test-successor-authority.mjs'] = hash('e');
  const criticalFiles = Object.fromEntries(CRITICAL_LEAVES.map(leaf => [leaf, files[leaf]]));
  const expected = {
    operationId: '12345678-1234-4123-8123-123456789abc', action: ACTION,
    predecessor: structuredClone(PREDECESSOR),
    target: { releaseSha: 'a'.repeat(40), manifestSha256: hash('1'), admissionSha256: hash('2'),
      controlArchiveSha256: hash('3'), filesSha256: digest(files), fileCount: Object.keys(files).length,
      criticalFilesSha256: digest(criticalFiles), files, criticalFiles },
    host: { hostIdentitySha256: hash('4'), activeSha256: hash('5'), approvalRootSha256: hash('6'),
      servingCoreTarget: `/usr/local/lib/leetplus-compose/${PREDECESSOR.releaseSha}/control.sh` },
    verifier: { sourceSha256: hash('7'), publicRootSha256: digest(publicKey) },
    effects: structuredClone(EFFECT_SCOPE),
  };
  const permit = { contract: CONTRACT, ...structuredClone(expected),
    issuedAt: new Date(NOW - 60_000).toISOString(), expiresAt: new Date(NOW + 10 * 60_000).toISOString() };
  const envelope = { permit, signature: crypto.sign(null, Buffer.from(canonical(permit)), keys.privateKey).toString('base64') };
  return { keys, publicKey, expected, envelope };
}

function resign(value) {
  value.envelope.signature = crypto.sign(null, Buffer.from(canonical(value.envelope.permit)), value.keys.privateKey).toString('base64');
}

test('accepts one exact independently observed bridge to successor permit', () => {
  const value = fixture();
  const authority = validateBridgeExternalSuccessorPermit(value.envelope, value.publicKey, value.expected, { now: NOW });
  assert.equal(authority.envelopeSha256, digest(value.envelope));
});

test('rejects compatible-leaf mutation, new-unit mutation, and extra privileged leaf before target code', async () => {
  for (const mutate of [
    value => { value.envelope.permit.target.files['contract.mjs'] = hash('0'); value.envelope.permit.target.criticalFiles['contract.mjs'] = hash('0'); },
    value => { value.envelope.permit.target.files['leetplus-compose-external-daily.timer'] = hash('0'); value.envelope.permit.target.criticalFiles['leetplus-compose-external-daily.timer'] = hash('0'); },
    value => { value.envelope.permit.target.files['unreviewed-root-helper.py'] = hash('0'); },
  ]) {
    const value = fixture(); mutate(value);
    value.envelope.permit.target.filesSha256 = digest(value.envelope.permit.target.files);
    value.envelope.permit.target.fileCount = Object.keys(value.envelope.permit.target.files).length;
    value.envelope.permit.target.criticalFilesSha256 = digest(value.envelope.permit.target.criticalFiles);
    resign(value);
    const calls = [];
    await assert.rejects(verifyThenPrepareSuccessor(value.envelope, value.publicKey, value.expected, {
      snapshot: async () => calls.push('snapshot'), preTargetExec: async () => calls.push('target'),
    }, { now: NOW }), /independent predecessor\/target observations/);
    assert.deepEqual(calls, []);
  }
});

test('rejects signature, expiry, host, predecessor, and effect widening', () => {
  const cases = [
    value => { value.envelope.signature = 'A'.repeat(86) + '=='; },
    value => { value.envelope.permit.expiresAt = new Date(NOW - 1).toISOString(); resign(value); },
    value => { value.envelope.permit.host.activeSha256 = hash('0'); resign(value); },
    value => { value.envelope.permit.predecessor.verifierSha256 = hash('0'); resign(value); },
    value => { value.envelope.permit.effects.timerMutationAllowed = true; resign(value); },
  ];
  for (const mutate of cases) {
    const value = fixture(); mutate(value);
    assert.throws(() => validateBridgeExternalSuccessorPermit(value.envelope, value.publicKey, value.expected, { now: NOW }));
  }
});

test('rejects independently observed target or verifier drift', () => {
  for (const mutate of [
    value => { value.expected.target.manifestSha256 = hash('0'); },
    value => { value.expected.target.files['control.sh'] = hash('0'); value.expected.target.filesSha256 = digest(value.expected.target.files); },
    value => { value.expected.verifier.sourceSha256 = hash('0'); },
    value => { value.expected.host.approvalRootSha256 = hash('0'); },
  ]) {
    const value = fixture(); mutate(value);
    assert.throws(() => validateBridgeExternalSuccessorPermit(value.envelope, value.publicKey, value.expected, { now: NOW }));
  }
});

test('verifies first, reproduces live observations, then reaches standalone preparation', async () => {
  const value = fixture(), calls = [];
  const observed = {
    predecessor: structuredClone(value.expected.predecessor), target: structuredClone(value.expected.target),
    host: structuredClone(value.expected.host), verifier: structuredClone(value.expected.verifier),
    effects: structuredClone(value.expected.effects),
  };
  const result = await verifyThenPrepareSuccessor(value.envelope, value.publicKey, value.expected, {
    snapshot: async authority => { calls.push(`snapshot:${authority.envelopeSha256}`); return observed; },
    preTargetExec: async context => { calls.push(`target:${context.authority.envelopeSha256}`); return 'PREPARED_NOT_AUTHORIZATION'; },
  }, { now: NOW });
  assert.equal(result, 'PREPARED_NOT_AUTHORIZATION');
  assert.deepEqual(calls, [`snapshot:${digest(value.envelope)}`, `target:${digest(value.envelope)}`]);

  const drift = fixture(), driftCalls = [];
  await assert.rejects(verifyThenPrepareSuccessor(drift.envelope, drift.publicKey, drift.expected, {
    snapshot: async () => { driftCalls.push('snapshot'); return { ...observed, host: { ...observed.host, activeSha256: hash('0') } }; },
    preTargetExec: async () => driftCalls.push('target'),
  }, { now: NOW }), /observations changed/);
  assert.deepEqual(driftCalls, ['snapshot']);
});
