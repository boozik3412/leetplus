import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { digest } from './contract.mjs';
import { bindExternalTenantApiProfile, EXTERNAL_TENANT_ROOT_KEY, validateExternalTenantApiProfile } from './external-tenant-public-root.mjs';

test('API profile binds only canonical Ed25519 DER-SPKI base64 and exact public fingerprint', () => {
  const keys = crypto.generateKeyPairSync('ed25519');
  const pem = keys.publicKey.export({ type: 'spki', format: 'pem' }), der = keys.publicKey.export({ type: 'spki', format: 'der' });
  const bytes = bindExternalTenantApiProfile({ DATABASE_URL: 'fixture' }, pem, digest(der));
  const value = JSON.parse(bytes); assert.equal(value[EXTERNAL_TENANT_ROOT_KEY], der.toString('base64'));
  assert.equal(/[\r\n]/.test(value[EXTERNAL_TENANT_ROOT_KEY]), false);
  assert.equal(validateExternalTenantApiProfile(bytes, pem, digest(der)).decision, 'PUBLIC_ONLY_PROFILE_BOUND');
  assert.throws(() => bindExternalTenantApiProfile(value, pem, digest(der)), /silently replace/);
  assert.throws(() => bindExternalTenantApiProfile({}, pem, '0'.repeat(64)), /provenance/);
});
