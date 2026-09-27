import crypto from 'node:crypto';

export const PERMIT_CONTRACT = 'LEETPLUS_A_BRIDGE_BOOTSTRAP_PERMIT_V1';
export const ACTION = 'PREPARE_A_BRIDGE_BOOTSTRAP';
export const PREDECESSOR_RELEASE = 'b0cbf3a4f302b299762fa055f3bffe0376a91182';
export const PREDECESSOR_MANIFEST_SHA256 = 'f9bd049e7cc4c03f206c99c2bad92ae54b34deb28b4b6980abb1bc44432dfb75';
export const PREDECESSOR_VERIFIER_SHA256 = '48aa00c4f6d3148ee210901cd572c6b5a3b3600ad4d20e3551e326ee18fcda18';
export const TARGET_RELEASE = 'bebeb41354da0dd04b218495cbbf5d75ba9f0a85';
export const TARGET_MANIFEST_SHA256 = '39a4941dfccc7b6695d4d5b0923ccaf933490bccb6a10e40168e043577738d48';
export const TARGET_ADMISSION_SHA256 = '55203c0dca36e1485d043ea74c50b64c7f4565a7a43269d854ff06a745310fdc';
export const TARGET_ARCHIVE_SHA256 = '71bbc3d93cd80f1fd440708001ab352cf96da6e40c18def956cb28ec43b96f73';
export const TARGET_FILES_SHA256 = 'ff7912faefcf7ccceb8586bde94872b0a9b7db3232150660a97779bf4feaf579';
export const TARGET_FILE_COUNT = 101;

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

function exactHashMap(value, label) {
  demand(value && typeof value === 'object' && !Array.isArray(value), `Invalid ${label}`);
  const keys = Object.keys(value);
  demand(keys.length > 0 && keys.length <= 512 && keys.every(key =>
    /^[A-Za-z0-9_.@-]+$/.test(key) && !['.', '..'].includes(key) && HASH.test(value[key])),
  `Invalid ${label}`);
  return value;
}

function exactPredecessor(value) {
  exactKeys(value, ['releaseSha', 'manifestSha256', 'verifierSha256', 'servingCore'], 'bootstrap predecessor');
  exactKeys(value.servingCore, ['control.sh', 'control.mjs', 'orchestrator.mjs', 'contract.mjs',
    'control_handoff.py', 'control-handoff-authority.mjs'], 'serving core');
  exactHashMap(value.servingCore, 'serving core');
  demand(value.releaseSha === PREDECESSOR_RELEASE && value.manifestSha256 === PREDECESSOR_MANIFEST_SHA256 &&
    value.verifierSha256 === PREDECESSOR_VERIFIER_SHA256 &&
    value.servingCore['control_handoff.py'] === PREDECESSOR_VERIFIER_SHA256,
  'Bootstrap predecessor differs from reviewed A');
  return value;
}

function exactTarget(value) {
  exactKeys(value, ['releaseSha', 'manifestSha256', 'admissionSha256', 'controlArchiveSha256',
    'filesSha256', 'files'], 'bootstrap target');
  exactHashMap(value.files, 'target file map');
  demand(value.releaseSha === TARGET_RELEASE && value.manifestSha256 === TARGET_MANIFEST_SHA256 &&
    value.admissionSha256 === TARGET_ADMISSION_SHA256 && value.controlArchiveSha256 === TARGET_ARCHIVE_SHA256 &&
    Object.keys(value.files).length === TARGET_FILE_COUNT && value.filesSha256 === TARGET_FILES_SHA256 &&
    digest(value.files) === TARGET_FILES_SHA256 &&
    value.files['control_handoff.py'] === '2923d34c5632eff74b5fafd4982073dba6bb4cd25ed5248592ddfe6eac071d88' &&
    value.files['exact-target-handoff-authority.mjs'] === 'bd5d5360220c73ce7c9c814c3ced714ee193f1c0a02100f4f6ce566749ca5abf' &&
    value.files['exact-target-handoff-authority.test.mjs'] === '6d8833456c1b8a77cdd34e551e1729a0a7799399eb93c59e34593adb578c58dd' &&
    value.files['test_control_handoff.py'] === 'b4eb9f74b9591f84e67a7a20ebd24e930878e4df9404d812554596cc70856ff8',
  'Bootstrap target differs from reviewed bridge');
  return value;
}

function exactBootstrap(value) {
  exactKeys(value, ['verifierSourceSha256', 'publicRootSha256'], 'standalone bootstrap authority');
  demand(HASH.test(value.verifierSourceSha256 ?? '') && HASH.test(value.publicRootSha256 ?? ''),
    'Standalone bootstrap authority identity is invalid');
  return value;
}

function expectedAuthority(value) {
  exactKeys(value, ['operationId', 'action', 'hostIdentitySha256', 'activeSha256',
    'predecessor', 'target', 'bootstrap'], 'expected bootstrap authority');
  demand(UUID.test(value.operationId ?? '') && value.action === ACTION &&
    HASH.test(value.hostIdentitySha256 ?? '') && HASH.test(value.activeSha256 ?? ''),
  'Expected bootstrap identity is invalid');
  exactPredecessor(value.predecessor);
  exactTarget(value.target);
  exactBootstrap(value.bootstrap);
  return value;
}

function timestamp(value, label) {
  demand(typeof value === 'string' && UTC.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(Date.parse(value)).toISOString() === value, `Invalid ${label}`);
  return Date.parse(value);
}

export function validateABridgeBootstrapPermit(envelope, publicKey, expected, { now = Date.now() } = {}) {
  exactKeys(envelope, ['permit', 'signature'], 'bootstrap permit envelope');
  const { permit, signature } = envelope;
  exactKeys(permit, ['contract', 'operationId', 'action', 'hostIdentitySha256', 'activeSha256',
    'predecessor', 'target', 'bootstrap', 'issuedAt', 'expiresAt'], 'bootstrap permit');
  demand(permit.contract === PERMIT_CONTRACT, 'Invalid bootstrap permit contract');
  const expectedValue = expectedAuthority(expected);
  const bound = Object.fromEntries(Object.entries(permit).filter(([key]) =>
    !['contract', 'issuedAt', 'expiresAt'].includes(key)));
  demand(canonical(bound) === canonical(expectedValue), 'Bootstrap permit differs from independently observed bytes');
  const issuedAt = timestamp(permit.issuedAt, 'bootstrap issue time');
  const expiresAt = timestamp(permit.expiresAt, 'bootstrap expiry time');
  demand(expiresAt > issuedAt && expiresAt - issuedAt <= MAX_VALIDITY_MS &&
    issuedAt <= now + 30_000 && expiresAt > now,
  'Bootstrap permit is expired or unbounded');
  demand(typeof signature === 'string' && SIGNATURE.test(signature), 'Invalid bootstrap signature encoding');
  const key = crypto.createPublicKey(publicKey);
  demand(key.asymmetricKeyType === 'ed25519' && digest(publicKey) === permit.bootstrap.publicRootSha256 &&
    crypto.verify(null, Buffer.from(canonical(permit)), key, Buffer.from(signature, 'base64')),
  'Bootstrap signature or public root is invalid');
  return Object.freeze({ permit, permitSha256: digest(permit), envelopeSha256: digest(envelope) });
}

/**
 * The caller supplies a standalone bootstrap adapter. No adapter callback is
 * reachable until the signed permit and independent expected bytes pass.
 * `snapshot` must then reproduce those same host/source/target observations
 * before the adapter may prepare any target execution.
 */
export async function verifyThenPrepare(envelope, publicKey, expected, adapter, options = {}) {
  const authority = validateABridgeBootstrapPermit(envelope, publicKey, expected, options);
  exactKeys(adapter, ['snapshot', 'preTargetExec'], 'bootstrap adapter');
  demand(typeof adapter.snapshot === 'function' && typeof adapter.preTargetExec === 'function',
    'Bootstrap adapter callbacks are required');
  const observed = await adapter.snapshot(authority);
  exactKeys(observed, ['hostIdentitySha256', 'activeSha256', 'predecessor', 'target', 'bootstrap'],
    'bootstrap live observation');
  const reproduced = {
    operationId: expected.operationId,
    action: expected.action,
    hostIdentitySha256: observed.hostIdentitySha256,
    activeSha256: observed.activeSha256,
    predecessor: observed.predecessor,
    target: observed.target,
    bootstrap: observed.bootstrap,
  };
  demand(canonical(reproduced) === canonical(expectedAuthority(expected)),
    'Bootstrap observations changed after permit verification');
  return adapter.preTargetExec(Object.freeze({ authority, observed }));
}
