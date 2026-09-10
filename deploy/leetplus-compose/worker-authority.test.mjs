import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { CONTRACT, canonical, digest } from './contract.mjs';
import { validateWorkerGrant } from './worker-authority.mjs';

test('worker grant is bound to host, active generation, exact tenant, secret profile and bounded pool', () => {
  const keys = crypto.generateKeyPairSync('ed25519');
  const pub = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const profile = { DATABASE_URL: 'postgresql://leetplus_runtime:fixture@postgres/leetplus?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5&sslmode=verify-full&sslrootcert=/run/secrets/db-ca.pem', GUEST_BONUS_LEDGER_WORKER_TENANT_SLUG: 'demo', GUEST_BONUS_LEDGER_WORKER_CANARY: 'false' };
  const bytes = Buffer.from(canonical(profile));
  const active = { activeSlot: 'blue', generation: 1, blue: { releaseSha: 'a'.repeat(40) } };
  const host = 'b'.repeat(64);
  const grant = { contract: `${CONTRACT}_WORKER_GRANT`, worker: 'bonus-ledger-worker', mode: 'TIMER', id: crypto.randomUUID(), hostIdentitySha256: host, releaseSha: active.blue.releaseSha, generation: 1, tenantSlug: 'demo', secretSha256: digest(bytes), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
  const sign = value => ({ grant: value, signature: crypto.sign(null, Buffer.from(canonical(value)), keys.privateKey).toString('base64') });
  validateWorkerGrant(sign(grant), pub, active, host, bytes);
  assert.throws(() => validateWorkerGrant(sign(grant), pub, { ...active, generation: 2 }, host, bytes));
  assert.throws(() => validateWorkerGrant(sign(grant), pub, active, 'c'.repeat(64), bytes));
  assert.throws(() => validateWorkerGrant(sign({ ...grant, tenantSlug: 'another' }), pub, active, host, bytes));
  assert.throws(() => validateWorkerGrant(sign({ ...grant, mode: 'CANARY' }), pub, active, host, bytes));
  const bad = Buffer.from(canonical({ ...profile, DATABASE_URL: profile.DATABASE_URL.replace('connection_limit=2', 'connection_limit=20') }));
  assert.throws(() => validateWorkerGrant(sign({ ...grant, secretSha256: digest(bad) }), pub, active, host, bad));
});
