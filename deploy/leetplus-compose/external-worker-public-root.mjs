import crypto from 'node:crypto';
import { canonical, demand, digest } from './contract.mjs';

export const EXTERNAL_WORKER_PUBLIC_ROOT_PATH = '/etc/leetplus-compose/external-worker-root.pem';
export const EXTERNAL_WORKER_ROOT_CONTRACT = 'LEETPLUS_EXTERNAL_WORKER_PUBLIC_ROOT_V1';
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const keys = (value, expected) => demand(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...expected].sort().join(','), 'External worker root fields are not exact');

export function externalWorkerRootDer(publicPem) {
  const pem = Buffer.isBuffer(publicPem) ? publicPem.toString('utf8') : publicPem;
  demand(typeof pem === 'string' && pem.startsWith('-----BEGIN PUBLIC KEY-----\n') &&
    pem.endsWith('-----END PUBLIC KEY-----\n') && !pem.includes('PRIVATE KEY'),
  'External worker root input must contain public bytes only');
  const key = crypto.createPublicKey(publicPem);
  demand(key.asymmetricKeyType === 'ed25519', 'External worker root must be Ed25519 public-only');
  const der = key.export({ type: 'spki', format: 'der' });
  demand(der.length === 44, 'External worker public DER SPKI length drift'); return der;
}
function exactTime(value, label) {
  const parsed = Date.parse(value);
  demand(typeof value === 'string' && UTC.test(value) && Number.isFinite(parsed) &&
    (new Date(parsed).toISOString() === value || new Date(parsed).toISOString().replace('.000Z', 'Z') === value),
  `Invalid external worker ${label}`);
  return parsed;
}

export function validateExternalWorkerRootStatement({ envelope, publicPem, deploymentPublicPem, hostIdentitySha256 }) {
  keys(envelope, ['statement', 'signature']);
  const s = envelope.statement;
  keys(s, ['contract', 'operationId', 'action', 'hostIdentitySha256', 'publicDerSha256', 'publicPath', 'issuedAt', 'expiresAt']);
  demand(s.contract === `${EXTERNAL_WORKER_ROOT_CONTRACT}_APPROVAL` && s.action === 'ENROLL_PUBLIC_ONLY' &&
    UUID.test(s.operationId ?? '') && HASH.test(hostIdentitySha256 ?? '') && s.hostIdentitySha256 === hostIdentitySha256 &&
    s.publicPath === EXTERNAL_WORKER_PUBLIC_ROOT_PATH && s.publicDerSha256 === digest(externalWorkerRootDer(publicPem)),
  'External worker root authority differs from host/public bytes');
  demand(digest(externalWorkerRootDer(publicPem)) !== digest(externalWorkerRootDer(deploymentPublicPem)),
    'External worker root must be separate from deployment root');
  const issued = exactTime(s.issuedAt, 'root issue time'), expiry = exactTime(s.expiresAt, 'root expiry time');
  demand(expiry > issued && expiry - issued <= 30 * 60000 &&
    /^[A-Za-z0-9+/]{86}==$/.test(envelope.signature ?? '') &&
    crypto.verify(null, Buffer.from(canonical(s)), deploymentPublicPem, Buffer.from(envelope.signature, 'base64')),
  'External worker public-root approval signature or window invalid');
  return { statement: s, issued, expiry };
}

export function validateExternalWorkerRootEnrollment(input, { now = Date.now() } = {}) {
  const result = validateExternalWorkerRootStatement(input);
  demand(result.issued <= now + 30_000 && result.expiry > now,
    'External worker public-root enrollment approval is not currently valid');
  return result;
}

export function externalWorkerRootIntent(input) {
  const { statement } = validateExternalWorkerRootStatement(input);
  return { contract: `${EXTERNAL_WORKER_ROOT_CONTRACT}_INTENT`, operationId: statement.operationId,
    originalEnvelopeSha256: digest(input.envelope), hostIdentitySha256: statement.hostIdentitySha256,
    publicDerSha256: statement.publicDerSha256, publicPath: EXTERNAL_WORKER_PUBLIC_ROOT_PATH };
}
export function validateExternalWorkerRootRecovery({ originalEnvelope, recoveryEnvelope, intent, publicPem,
  deploymentPublicPem, hostIdentitySha256, installedPublicBytes }, { now = Date.now(), allowExpired = false } = {}) {
  const base = { envelope: originalEnvelope, publicPem, deploymentPublicPem, hostIdentitySha256 };
  const original = validateExternalWorkerRootStatement(base);
  demand(canonical(intent) === canonical(externalWorkerRootIntent(base)), 'External root recovery intent is not exact');
  keys(recoveryEnvelope, ['statement', 'signature']);
  const s = recoveryEnvelope.statement;
  keys(s, ['contract', 'operationId', 'action', 'hostIdentitySha256', 'originalOperationId',
    'originalEnvelopeSha256', 'intentSha256', 'publicDerSha256', 'publicPath', 'installedPostimageSha256', 'issuedAt', 'expiresAt']);
  demand(s.contract === `${EXTERNAL_WORKER_ROOT_CONTRACT}_RECOVERY_APPROVAL` && UUID.test(s.operationId ?? '') &&
    ['RECOVER_INSTALLED', 'RETIRE_ABSENT'].includes(s.action) && s.hostIdentitySha256 === hostIdentitySha256 &&
    s.originalOperationId === original.statement.operationId && s.originalEnvelopeSha256 === digest(originalEnvelope) &&
    s.intentSha256 === digest(intent) && s.publicDerSha256 === original.statement.publicDerSha256 &&
    s.publicPath === EXTERNAL_WORKER_PUBLIC_ROOT_PATH &&
    s.installedPostimageSha256 === (installedPublicBytes ? digest(installedPublicBytes) : null) &&
    (s.action === 'RECOVER_INSTALLED') === Boolean(installedPublicBytes),
  'External root recovery scope/postimage drift');
  const issued = exactTime(s.issuedAt, 'recovery issue time'), expiry = exactTime(s.expiresAt, 'recovery expiry time');
  demand(expiry > issued && expiry - issued <= 30 * 60000 &&
    (allowExpired || issued <= now + 30_000 && expiry > now) &&
    /^[A-Za-z0-9+/]{86}==$/.test(recoveryEnvelope.signature ?? '') &&
    crypto.verify(null, Buffer.from(canonical(s)), deploymentPublicPem, Buffer.from(recoveryEnvelope.signature, 'base64')),
  'External root recovery signature or window invalid');
  return { statement: s, issued, expiry };
}
export function validateExternalWorkerRootAuthority({ envelope, receipt, publicPem, deploymentPublicPem,
  hostIdentitySha256, intent, recoveryEnvelope }, { now = Date.now() } = {}) {
  const { statement: s, issued, expiry } = validateExternalWorkerRootStatement({ envelope, publicPem, deploymentPublicPem, hostIdentitySha256 });
  keys(receipt, ['contract', 'decision', 'operationId', 'envelopeSha256', 'publicDerSha256', 'acceptedAt',
    ...(Object.hasOwn(receipt ?? {}, 'recoveryEnvelopeSha256') ? ['recoveryEnvelopeSha256', 'recoveryOperationId'] : [])]);
  const accepted = exactTime(receipt.acceptedAt, 'root acceptance time');
  demand(receipt.contract === `${EXTERNAL_WORKER_ROOT_CONTRACT}_RECEIPT` && receipt.decision === 'PUBLIC_ONLY_ENROLLED' &&
    receipt.operationId === s.operationId && receipt.envelopeSha256 === digest(envelope) &&
    receipt.publicDerSha256 === s.publicDerSha256 && accepted <= now + 30_000,
  'External worker public-root receipt is not exact timely authority');
  if (Object.hasOwn(receipt, 'recoveryEnvelopeSha256')) {
    demand(recoveryEnvelope && intent && receipt.recoveryEnvelopeSha256 === digest(recoveryEnvelope) &&
      receipt.recoveryOperationId === recoveryEnvelope.statement.operationId,
    'Recovered external root lacks exact recovery permit');
    const recovery = validateExternalWorkerRootRecovery({ originalEnvelope: envelope, recoveryEnvelope, intent,
      publicPem, deploymentPublicPem, hostIdentitySha256, installedPublicBytes: publicPem }, { now, allowExpired: true });
    demand(recovery.statement.action === 'RECOVER_INSTALLED' && accepted >= recovery.issued && accepted <= recovery.expiry,
      'Recovered external root receipt is not within fresh recovery permit');
  } else demand(accepted >= issued && accepted <= expiry, 'Original external root receipt is outside the signed window');
  return publicPem;
}

export function validateExternalWorkerRootRetirement({ envelope, intent, retirement, recoveryEnvelope,
  publicPem, deploymentPublicPem, hostIdentitySha256, installedPublicBytes }) {
  const recovery = validateExternalWorkerRootRecovery({ originalEnvelope: envelope, recoveryEnvelope, intent,
    publicPem, deploymentPublicPem, hostIdentitySha256, installedPublicBytes }, { allowExpired: true });
  keys(retirement, ['contract', 'decision', 'operationId', 'originalOperationId', 'recoveryEnvelopeSha256', 'intentSha256', 'retiredAt']);
  const retiredAt = exactTime(retirement.retiredAt, 'root retirement time');
  demand(!installedPublicBytes && recovery.statement.action === 'RETIRE_ABSENT' &&
    retirement.contract === `${EXTERNAL_WORKER_ROOT_CONTRACT}_RETIREMENT` && retirement.decision === 'RETIRED_ABSENT' &&
    retirement.operationId === recovery.statement.operationId && retirement.originalOperationId === envelope.statement.operationId &&
    retirement.recoveryEnvelopeSha256 === digest(recoveryEnvelope) && retirement.intentSha256 === digest(intent) &&
    retiredAt >= recovery.issued && retiredAt <= recovery.expiry, 'External root retirement terminal/postimage drift');
  return retirement;
}
