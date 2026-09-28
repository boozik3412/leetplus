import crypto from 'node:crypto';

export const CONTRACT = 'LEETPLUS_BRIDGE_EXTERNAL_SUCCESSOR_PERMIT_V1';
export const ACTION = 'PREPARE_BRIDGE_EXTERNAL_SUCCESSOR';
export const PREDECESSOR = Object.freeze({
  releaseSha: 'bebeb41354da0dd04b218495cbbf5d75ba9f0a85',
  manifestSha256: '39a4941dfccc7b6695d4d5b0923ccaf933490bccb6a10e40168e043577738d48',
  verifierSha256: '2923d34c5632eff74b5fafd4982073dba6bb4cd25ed5248592ddfe6eac071d88',
  filesSha256: 'ff7912faefcf7ccceb8586bde94872b0a9b7db3232150660a97779bf4feaf579',
  fileCount: 101,
});
export const EFFECT_SCOPE = Object.freeze({
  applicationRestartAllowed: false,
  dataMutationAllowed: false,
  timerMutationAllowed: false,
  workerGrantMutationAllowed: false,
  providerEffectAllowed: false,
  effect: 'CONTROLLER_POINTER_ONLY',
});
export const CRITICAL_LEAVES = Object.freeze([
  'control.sh',
  'control.mjs',
  'orchestrator.mjs',
  'contract.mjs',
  'runtime-entry.cjs',
  'worker-authority.mjs',
  'worker-continuation.mjs',
  'worker-continuation-runtime.mjs',
  'external-worker-contract.mjs',
  'external-worker-runtime.mjs',
  'external-worker-cleanup.mjs',
  'external-worker-enrollment.mjs',
  'external-worker-enrollment-runtime.mjs',
  'worker-set-v3.mjs',
  'external-worker-image-capability.mjs',
  'external-network-policy.mjs',
  'external-tenant-public-root.mjs',
  'sign-external-worker.py',
  'sign-external-tenant.py',
  'test-external-worker-image.sh',
  'control-locks.mjs',
  'network-fence.py',
  'external-network-fence.py',
  'control_handoff.py',
  'control-handoff-authority.mjs',
  'exact-target-handoff-authority.mjs',
  'install-control.py',
  'preparation-runner.mjs',
  'release-observer.mjs',
  'leetplus-compose-worker@.service',
  'leetplus-compose-external-daily.service',
  'leetplus-compose-external-daily.timer',
]);

const HASH = /^[a-f0-9]{64}$/;
const RELEASE = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const MAX_VALIDITY_MS = 30 * 60_000;

export function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function digest(value) {
  return crypto.createHash('sha256').update(
    typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value),
  ).digest('hex');
}

function demand(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys, label) {
  demand(value && typeof value === 'object' && !Array.isArray(value) &&
    canonical(Object.keys(value).sort()) === canonical([...keys].sort()),
  `Invalid ${label} fields`);
}

function hashMap(value, label) {
  demand(value && typeof value === 'object' && !Array.isArray(value), `Invalid ${label}`);
  const names = Object.keys(value);
  demand(names.length > 0 && names.length <= 512 && names.every(name =>
    /^[A-Za-z0-9_.@-]+$/.test(name) && !['.', '..'].includes(name) && HASH.test(value[name])),
  `Invalid ${label}`);
  return value;
}

function exactPredecessor(value) {
  exactKeys(value, ['releaseSha', 'manifestSha256', 'verifierSha256', 'filesSha256', 'fileCount'], 'bridge predecessor');
  demand(canonical(value) === canonical(PREDECESSOR), 'Bridge predecessor differs from reviewed installed source');
  return value;
}

function exactTarget(value) {
  exactKeys(value, ['releaseSha', 'manifestSha256', 'admissionSha256', 'controlArchiveSha256',
    'filesSha256', 'fileCount', 'criticalFilesSha256', 'files', 'criticalFiles'], 'external successor target');
  const files = hashMap(value.files, 'target full file map');
  const critical = hashMap(value.criticalFiles, 'target critical file map');
  demand(RELEASE.test(value.releaseSha ?? '') && value.releaseSha !== PREDECESSOR.releaseSha &&
    [value.manifestSha256, value.admissionSha256, value.controlArchiveSha256,
      value.filesSha256, value.criticalFilesSha256].every(item => HASH.test(item ?? '')) &&
    Number.isSafeInteger(value.fileCount) && value.fileCount === Object.keys(files).length &&
    value.filesSha256 === digest(files) && value.criticalFilesSha256 === digest(critical) &&
    canonical(Object.keys(critical).sort()) === canonical([...CRITICAL_LEAVES].sort()) &&
    CRITICAL_LEAVES.every(leaf => critical[leaf] === files[leaf]),
  'External successor target identity or critical inventory is invalid');
  return value;
}

function exactHost(value) {
  exactKeys(value, ['hostIdentitySha256', 'activeSha256', 'approvalRootSha256', 'servingCoreTarget'], 'bridge host observation');
  demand([value.hostIdentitySha256, value.activeSha256, value.approvalRootSha256].every(item => HASH.test(item ?? '')) &&
    value.servingCoreTarget === `/usr/local/lib/leetplus-compose/${PREDECESSOR.releaseSha}/control.sh`,
  'Bridge host/active/root observation is invalid');
  return value;
}

function exactVerifier(value) {
  exactKeys(value, ['sourceSha256', 'publicRootSha256'], 'standalone transition verifier');
  demand(HASH.test(value.sourceSha256 ?? '') && HASH.test(value.publicRootSha256 ?? ''),
    'Standalone transition verifier identity is invalid');
  return value;
}

function exactEffects(value) {
  exactKeys(value, Object.keys(EFFECT_SCOPE), 'successor transition effects');
  demand(canonical(value) === canonical(EFFECT_SCOPE), 'Successor transition effect scope widened');
  return value;
}

function expectedAuthority(value) {
  exactKeys(value, ['operationId', 'action', 'predecessor', 'target', 'host', 'verifier', 'effects'], 'expected successor authority');
  demand(UUID.test(value.operationId ?? '') && value.action === ACTION, 'Invalid successor operation/action');
  exactPredecessor(value.predecessor);
  exactTarget(value.target);
  exactHost(value.host);
  exactVerifier(value.verifier);
  exactEffects(value.effects);
  return value;
}

function time(value, label) {
  demand(typeof value === 'string' && UTC.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(Date.parse(value)).toISOString() === value, `Invalid ${label}`);
  return Date.parse(value);
}

export function validateBridgeExternalSuccessorPermit(envelope, publicKey, expected, { now = Date.now() } = {}) {
  exactKeys(envelope, ['permit', 'signature'], 'bridge successor permit envelope');
  const { permit, signature } = envelope;
  exactKeys(permit, ['contract', 'operationId', 'action', 'predecessor', 'target', 'host',
    'verifier', 'effects', 'issuedAt', 'expiresAt'], 'bridge successor permit');
  demand(permit.contract === CONTRACT, 'Invalid bridge successor permit contract');
  const expectedValue = expectedAuthority(expected);
  const bound = Object.fromEntries(Object.entries(permit).filter(([name]) =>
    !['contract', 'issuedAt', 'expiresAt'].includes(name)));
  demand(canonical(bound) === canonical(expectedValue),
    'Successor permit differs from independent predecessor/target observations');
  const issuedAt = time(permit.issuedAt, 'permit issue time');
  const expiresAt = time(permit.expiresAt, 'permit expiry time');
  demand(expiresAt > issuedAt && expiresAt - issuedAt <= MAX_VALIDITY_MS &&
    issuedAt <= now + 30_000 && expiresAt > now,
  'Bridge successor permit is expired or unbounded');
  demand(typeof signature === 'string' && SIGNATURE.test(signature), 'Invalid bridge successor signature encoding');
  const key = crypto.createPublicKey(publicKey);
  demand(key.asymmetricKeyType === 'ed25519' && digest(publicKey) === permit.verifier.publicRootSha256 &&
    crypto.verify(null, Buffer.from(canonical(permit)), key, Buffer.from(signature, 'base64')),
  'Bridge successor signature or enrolled root is invalid');
  return Object.freeze({ permit, permitSha256: digest(permit), envelopeSha256: digest(envelope) });
}

/** Verify independent authority before any target callback or target import. */
export async function verifyThenPrepareSuccessor(envelope, publicKey, expected, adapter, options = {}) {
  const authority = validateBridgeExternalSuccessorPermit(envelope, publicKey, expected, options);
  exactKeys(adapter, ['snapshot', 'preTargetExec'], 'successor preparation adapter');
  demand(typeof adapter.snapshot === 'function' && typeof adapter.preTargetExec === 'function',
    'Successor preparation callbacks are required');
  const observed = await adapter.snapshot(authority);
  exactKeys(observed, ['predecessor', 'target', 'host', 'verifier', 'effects'], 'successor live observation');
  const reproduced = {
    operationId: expected.operationId,
    action: expected.action,
    predecessor: observed.predecessor,
    target: observed.target,
    host: observed.host,
    verifier: observed.verifier,
    effects: observed.effects,
  };
  demand(canonical(reproduced) === canonical(expectedAuthority(expected)),
    'Successor observations changed after permit verification');
  return adapter.preTargetExec(Object.freeze({ authority, observed }));
}
