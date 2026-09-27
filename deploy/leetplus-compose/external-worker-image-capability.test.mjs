import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExternalImageCapability } from './external-worker-image-capability.mjs';

test('unmarked historical images stay byte-compatible without fabricated external proof', () => {
  const release = { releaseSha: 'a'.repeat(40), images: { api: `sha256:${'b'.repeat(64)}` } };
  assert.equal(validateExternalImageCapability(release, undefined), null);
  assert.throws(() => validateExternalImageCapability(release, {}), /Unmarked/);
});
test('capable image admission requires exact real dispatcher disabled-profile probe', () => {
  const release = { releaseSha: 'a'.repeat(40), externalWorkerCapability: 'LANGAME_EXTERNAL_SET1_V1', images: { api: `sha256:${'b'.repeat(64)}` } };
  const proof = { contract: 'LEETPLUS_EXTERNAL_WORKER_IMAGE_VALIDATION_V1', decision: 'PASS',
    releaseSha: release.releaseSha, apiImage: release.images.api, uid: 12042,
    realRuntimeEntrypoint: true, disabledProfileRejectedBeforeNest: true, stdoutEmpty: true, networkNone: true, noProviderEffect: true };
  assert.equal(validateExternalImageCapability(release, proof), proof);
  for (const bad of [{ ...proof, apiImage: `sha256:${'c'.repeat(64)}` }, { ...proof, uid: 0 },
    { ...proof, realRuntimeEntrypoint: false }, { ...proof, disabledProfileRejectedBeforeNest: false },
    { ...proof, networkNone: false }, { ...proof, stdoutEmpty: false }]) assert.throws(() => validateExternalImageCapability(release, bad));
});
