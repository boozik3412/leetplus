import crypto from 'node:crypto';
import { CONTRACT, canonical, demand, digest } from './contract.mjs';

export function validateWorkerGrant(envelope, publicKey, active, hostIdentitySha256, secretBytes, now = Date.now()) {
  const { grant, signature } = envelope ?? {};
  demand(grant?.contract === `${CONTRACT}_WORKER_GRANT`, 'Invalid worker grant');
  demand(['bonus-ledger-worker', 'langame-daily-worker'].includes(grant.worker) && ['CANARY', 'TIMER'].includes(grant.mode), 'Invalid worker/mode');
  demand(active && grant.releaseSha === active[active.activeSlot].releaseSha && grant.generation === active.generation && grant.hostIdentitySha256 === hostIdentitySha256, 'Stale worker release/generation/host grant');
  demand(typeof signature === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(signature) &&
    crypto.verify(null, Buffer.from(canonical(grant)), publicKey, Buffer.from(signature, 'base64')), 'Invalid worker signature');
  const start = Date.parse(grant.issuedAt), end = Date.parse(grant.expiresAt);
  demand(Number.isFinite(start) && Number.isFinite(end) && start <= now + 30000 && end > now && end - start <= 90 * 86400000, 'Worker grant expired or unbounded');
  demand(/^[a-f0-9-]{36}$/.test(grant.id ?? '') && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(grant.tenantSlug ?? ''), 'Missing exact worker identity');
  demand(digest(secretBytes) === grant.secretSha256, 'Worker secret profile changed');
  const profile = JSON.parse(secretBytes);
  const prefix = grant.worker === 'bonus-ledger-worker' ? 'GUEST_BONUS_LEDGER_WORKER' : 'LANGAME_DAILY_WORKER';
  demand(profile[`${prefix}_TENANT_SLUG`] === grant.tenantSlug && profile[`${prefix}_CANARY`] === String(grant.mode === 'CANARY'), 'Worker scope/canary profile mismatch');
  demand(profile.LANGAME_DAILY_SYNC_SCHEDULER_ENABLED !== 'true' && profile.LANGAME_SCHEDULED_HTTP_ENABLED !== 'true' && profile.GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED !== 'true', 'HTTP/API scheduler authority is forbidden');
  const url = new URL(profile.DATABASE_URL);
  demand(['postgresql:', 'postgres:'].includes(url.protocol) && decodeURIComponent(url.username) === 'leetplus_runtime' && url.hostname === 'postgres' && url.pathname === '/leetplus', 'Worker must use the bounded application DB role');
  demand(url.searchParams.get('connection_limit') === '2' && url.searchParams.get('schema') === 'public' && url.searchParams.get('pool_timeout') === '5' && url.searchParams.get('connect_timeout') === '5', 'Worker connection budget mismatch');
  demand(url.searchParams.get('sslmode') === 'require' && url.searchParams.get('sslcert') === '/run/secrets/db-ca.pem' && url.searchParams.get('sslaccept') === 'strict', 'Worker database TLS verification is required');
  const allowed = new Set(['schema', 'connection_limit', 'pool_timeout', 'connect_timeout', 'sslmode', 'sslcert', 'sslaccept']);
  for (const key of url.searchParams.keys()) demand(allowed.has(key) && url.searchParams.getAll(key).length === 1, 'Unknown or duplicate worker DB option');
  return grant;
}
