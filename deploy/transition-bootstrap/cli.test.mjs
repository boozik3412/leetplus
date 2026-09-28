import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import test from 'node:test';
import { canonical, digest, EXECUTION_CONTRACT } from './protocol.mjs';
import {
  ACTION, PERMIT_CONTRACT, PREDECESSOR_RELEASE, PREDECESSOR_MANIFEST_SHA256,
  PREDECESSOR_VERIFIER_SHA256, TARGET_RELEASE, TARGET_MANIFEST_SHA256,
  TARGET_ADMISSION_SHA256, TARGET_ARCHIVE_SHA256, TARGET_FILES_SHA256,
} from '../leetplus-compose/a-bridge-bootstrap-authority.mjs';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.mjs');
const repo = path.resolve(path.dirname(cli), '../..');

async function run(init, respond) {
  const child = spawn(process.execPath, [cli],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const messages = [];
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  const reader = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  child.stdin.write(`${JSON.stringify(init)}\n`);
  const complete = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => resolve(code));
  });
  for await (const line of reader) {
    const message = JSON.parse(line);
    messages.push(message);
    if (message.type === 'call') {
      const reply = await respond(message);
      child.stdin.write(`${JSON.stringify({ type: 'reply', id: message.id, ...reply })}\n`);
    }
  }
  const code = await complete;
  return { code, messages, stderr };
}

test('invalid initialization has no native lock or target callback', async () => {
  const result = await run({ type: 'init', command: 'apply' }, async () => {
    throw new Error('Native effect reached');
  });
  assert.equal(result.code, 1);
  assert.deepEqual(result.messages.map(item => item.type), ['error']);
});

test('unsupported command cannot reach native callback', async () => {
  const result = await run({ type: 'init', command: 'unknown', mode: 'A_TO_BRIDGE',
    roots: {}, inputs: {}, evidence: {} }, async () => { throw new Error('Native callback reached'); });
  assert.equal(result.code, 1);
  assert.deepEqual(result.messages.map(item => item.type), ['error']);
});

test('malformed signed permit cannot reach pointer CAS or record publication over RPC', async () => {
  const calls = [];
  const result = await run({ type: 'init', command: 'prepare', mode: 'A_TO_BRIDGE',
    roots: { permit: 'invalid' }, inputs: { permitEnvelope: { permit: {}, signature: '' } },
    evidence: { backupReceiptSha256: 'a'.repeat(64), restoredCopyReceiptSha256: 'b'.repeat(64),
      hostBaselineSha256: 'c'.repeat(64) } }, async message => {
    calls.push(message.method);
    if (message.method === 'lock.acquire' || message.method === 'lock.release')
      return { ok: true, result: true };
    if (message.method === 'observe') return { ok: true, result: {
      expected: {}, protectedState: {}, pointer: 'invalid' } };
    throw new Error(`Effect callback reached: ${message.method}`);
  });
  assert.equal(result.code, 1);
  assert.deepEqual(calls, ['lock.acquire', 'observe', 'lock.release']);
  assert.equal(result.messages.at(-1).type, 'error');
});

test('separate Python-host RPC can prepare and apply exact signed source without target import', async () => {
  const names = execFileSync('git', ['-C', repo, 'ls-tree', '--name-only',
    `${TARGET_RELEASE}:deploy/leetplus-compose`], { encoding: 'utf8' }).trim().split(/\r?\n/u);
  const files = Object.fromEntries(names.map(name => [name,
    digest(execFileSync('git', ['-C', repo, 'show',
      `${TARGET_RELEASE}:deploy/leetplus-compose/${name}`]))]));
  assert.equal(digest(files), TARGET_FILES_SHA256);
  const permitKeys = crypto.generateKeyPairSync('ed25519');
  const executionKeys = crypto.generateKeyPairSync('ed25519');
  const permitRoot = permitKeys.publicKey.export({ type: 'spki', format: 'pem' });
  const executionRoot = executionKeys.publicKey.export({ type: 'spki', format: 'pem' });
  const protectedState = {
    activeSha256: 'a'.repeat(64), applicationSha256: 'b'.repeat(64),
    dataSha256: 'c'.repeat(64), nginxSha256: 'd'.repeat(64),
    workerGrantsSha256: 'e'.repeat(64), timersSha256: 'f'.repeat(64),
    providerPolicySha256: '1'.repeat(64), containersSha256: '2'.repeat(64),
    networkRefreshUnitSha256: '3'.repeat(64), firewallSha256: '4'.repeat(64),
  };
  const oldPointer = `/usr/local/lib/leetplus-compose/${PREDECESSOR_RELEASE}/control.sh`;
  const newPointer = `/usr/local/lib/leetplus-compose/${TARGET_RELEASE}/control.sh`;
  const expected = {
    operationId: '12345678-1234-4123-8123-123456789abc', action: ACTION,
    hostIdentitySha256: '5'.repeat(64), activeSha256: protectedState.activeSha256,
    predecessor: { releaseSha: PREDECESSOR_RELEASE,
      manifestSha256: PREDECESSOR_MANIFEST_SHA256,
      verifierSha256: PREDECESSOR_VERIFIER_SHA256,
      servingCore: {
        'control.sh': '0587c842147ebb959ca08f9ac23de95b0f377bdfb49036353013f6ee69c18ade',
        'control.mjs': '1496d809e6401cc0f9b9fba983a135ba0ca6cd445ada7ce337f5f94be2714a97',
        'orchestrator.mjs': 'f3c9d239e4fbe5572fdd258bb20e2be0c3ab935105d25308d325babbcba32e45',
        'contract.mjs': 'dda0b3bf018b26a03ed7cc714489f6f049045fb7ff78a0701dfd22ec51405e93',
        'control_handoff.py': PREDECESSOR_VERIFIER_SHA256,
        'control-handoff-authority.mjs': '47258b2c78c730ede5dd453f12d33580b7f4e784b415d6ef227ed993f2a0a8d5',
      } },
    target: { releaseSha: TARGET_RELEASE, manifestSha256: TARGET_MANIFEST_SHA256,
      admissionSha256: TARGET_ADMISSION_SHA256,
      controlArchiveSha256: TARGET_ARCHIVE_SHA256,
      filesSha256: TARGET_FILES_SHA256, files },
    bootstrap: { verifierSourceSha256: '6'.repeat(64), publicRootSha256: digest(permitRoot) },
  };
  const now = Date.now();
  const permit = { contract: PERMIT_CONTRACT, ...structuredClone(expected),
    issuedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 10 * 60_000).toISOString() };
  const permitEnvelope = { permit, signature: crypto.sign(null, Buffer.from(canonical(permit)),
    permitKeys.privateKey).toString('base64') };
  const evidence = { backupReceiptSha256: '7'.repeat(64), restoredCopyReceiptSha256: '8'.repeat(64),
    hostBaselineSha256: '9'.repeat(64) };
  const state = { pointer: oldPointer, operation: {}, calls: [] };
  const respond = async message => {
    const { method, args } = message;
    state.calls.push(method);
    const result = (() => {
      if (method === 'lock.acquire' || method === 'lock.release') return true;
      if (method === 'observe') return { expected, protectedState, pointer: state.pointer };
      if (method === 'operation.read') return state.operation;
      if (method === 'operation.publish') { state.operation[args.name] = args.value; return true; }
      if (method === 'pointer.cas') { assert.equal(state.pointer, args.oldPointer);
        state.pointer = args.newPointer; return true; }
      if (method === 'pointer.read') return state.pointer;
      if (method === 'protected.read') return protectedState;
      if (method.startsWith('canonical.')) return true;
      throw new Error(`Unexpected host method ${method}`);
    })();
    return { ok: true, result };
  };
  const roots = { permit: permitRoot, execution: executionRoot };
  const prepared = await run({ type: 'init', command: 'prepare', mode: 'A_TO_BRIDGE',
    roots, inputs: { permitEnvelope }, evidence }, respond);
  assert.equal(prepared.code, 0);
  const plan = prepared.messages.at(-1).result.plan;
  assert.equal(prepared.messages.at(-1).result.decision, 'PREPARED_NOT_AUTHORIZATION');
  assert.equal(state.pointer, oldPointer);
  const command = { contract: EXECUTION_CONTRACT, operationId: expected.operationId,
    planSha256: digest(plan), permitEnvelopeSha256: digest(permitEnvelope),
    effect: 'CONTROLLER_POINTER_ONLY', issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 10 * 60_000).toISOString() };
  const executionEnvelope = { command,
    signature: crypto.sign(null, Buffer.from(canonical(command)),
      executionKeys.privateKey).toString('base64') };
  const applied = await run({ type: 'init', command: 'apply', mode: 'A_TO_BRIDGE',
    roots, inputs: { plan, permitEnvelope, executionEnvelope }, evidence }, respond);
  assert.equal(applied.code, 0);
  assert.equal(applied.messages.at(-1).result.decision, 'PASS');
  assert.equal(state.pointer, newPointer);
  assert.deepEqual(state.calls.filter(item => item === 'pointer.cas'), ['pointer.cas']);
  assert.ok(state.calls.indexOf('canonical.prepare-forward') < state.calls.indexOf('pointer.cas'));
  assert.ok(state.calls.indexOf('pointer.cas') < state.calls.indexOf('canonical.finalize-forward'));
});
