import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

// Independent operator fence. The dispatcher must authenticate this exact
// captured fence source and obtain its own direct GO before running it.
// No candidate Python/JS is imported before deployment-root signature + hash.
const ROOT = '/etc/leetplus-compose/approval-root.pem';
const PREFIX = '/srv/leetplus/production-control-inbox/bootstrap-intro-';
const SHA = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const CLEAN = { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC' };
function require(test, message) { if (!test) throw new Error(`standalone-intro-entry: ${message}`); }
function read(pathname, maximum) {
  require(path.posix.isAbsolute(pathname) && path.posix.normalize(pathname) === pathname,
    'Noncanonical operator input path');
  const pieces = pathname.slice(1).split('/');
  let current = '/';
  for (const piece of pieces.slice(0, -1)) {
    current = path.posix.join(current, piece);
    const st = fs.lstatSync(current, { bigint: true });
    require(st.isDirectory() && !st.isSymbolicLink() && st.uid === 0n &&
      (st.mode & 0o022n) === 0n, 'Untrusted operator input ancestor');
  }
  const before = fs.lstatSync(pathname, { bigint: true });
  require(before.isFile() && !before.isSymbolicLink() && before.uid === 0n && before.gid === 0n &&
    before.nlink === 1n && before.size > 0n && before.size <= BigInt(maximum) &&
    (before.mode & 0o022n) === 0n, 'Untrusted bounded operator input');
  const fd = fs.openSync(pathname, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    require(opened.dev === before.dev && opened.ino === before.ino &&
      opened.size === before.size && opened.ctimeNs === before.ctimeNs,
    'Operator input changed before capture');
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      require(count > 0, 'Short operator input capture'); offset += count;
    }
    const extra = Buffer.alloc(1);
    require(fs.readSync(fd, extra, 0, 1, bytes.length) === 0, 'Operator input grew');
    const after = fs.fstatSync(fd, { bigint: true });
    require(after.dev === opened.dev && after.ino === opened.ino &&
      after.size === opened.size && after.ctimeNs === opened.ctimeNs,
    'Operator input changed during capture');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function record(raw) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  require(Buffer.compare(raw, Buffer.from(canonical(value))) === 0, 'Noncanonical operator JSON');
  return value;
}
require(process.platform === 'linux' && process.getuid() === 0 &&
  process.versions.node.split('.')[0] === '22', 'Linux root Node 22 operator fence required');
require(process.argv.length === 6 && process.argv[2] === '--operation-id' &&
  UUID.test(process.argv[3]) && process.argv[4] === '--mode' &&
  ['prepare', 'apply', 'reconcile'].includes(process.argv[5]),
  'Expected exact operation UUID and closed mode');
require(process.argv[3] !== '9afc7218-4757-4f44-87e1-6096706bad44',
  'Historical operation cannot introduce new trust');
for (const name of Object.keys(process.env)) {
  require(!/^(?:NODE_|LD_|DYLD_|PYTHON)/u.test(name) &&
    !['BASH_ENV', 'ENV', 'OPENSSL_CONF', 'OPENSSL_MODULES'].includes(name),
  'Unsafe inherited operator environment');
}
const operation = process.argv[3];
const mode = process.argv[5];
const input = PREFIX + operation;
const authorizationChunks = [];
let authorizationSize = 0;
while (true) {
  const chunk = Buffer.alloc(16384);
  const count = fs.readSync(0, chunk, 0, chunk.length, null);
  if (!count) break;
  authorizationSize += count;
  require(authorizationSize <= 131072, 'Captured operator authorization exceeds bound');
  authorizationChunks.push(chunk.subarray(0, count));
}
const authorizationRaw = Buffer.concat(authorizationChunks);
const authorization = record(authorizationRaw);
require(authorization && Object.keys(authorization).sort().join(',') === 'approvalEnvelope,plan',
  'Expected one closed in-memory operator authorization');
const plan = authorization.plan;
const envelope = authorization.approvalEnvelope;
const planRaw = Buffer.from(canonical(plan));
const approvalRaw = Buffer.from(canonical(envelope));
require(planRaw.length <= 65536 && approvalRaw.length <= 65536,
  'Captured plan/approval exceeds bound');
require(plan.contract === 'LEETPLUS_STANDALONE_INITIAL_INTRO_V1_PLAN' &&
  plan.operationId === operation && plan.action === 'INTRODUCE_INERT_STANDALONE_TRUST' &&
  SHA.test(plan.introEntrySha256) && SHA.test(plan.introProgramSha256),
  'Wrong initial execution plan');
require(envelope && Object.keys(envelope).sort().join(',') === 'approval,signature' &&
  /^[A-Za-z0-9+/]{86}==$/u.test(envelope.signature), 'Wrong initial approval envelope');
const approval = envelope.approval;
require(approval && Object.keys(approval).sort().join(',') ===
  ['contract', 'operationId', 'hostIdentitySha256', 'planSha256', 'action', 'issuedAt', 'expiresAt'].sort().join(',') &&
  approval.contract === 'LEETPLUS_STANDALONE_INITIAL_INTRO_V1_APPROVAL' &&
  approval.operationId === operation && approval.hostIdentitySha256 === plan.hostIdentitySha256 &&
  approval.planSha256 === digest(planRaw) && approval.action === plan.action,
'Initial approval does not bind exact captured plan');
const issued = Date.parse(approval.issuedAt), expires = Date.parse(approval.expiresAt);
require(Number.isFinite(issued) && Number.isFinite(expires) &&
  new Date(issued).toISOString() === approval.issuedAt &&
  new Date(expires).toISOString() === approval.expiresAt &&
  expires > issued && expires - issued <= 30 * 60 * 1000, 'Unbounded initial approval');
if (mode !== 'reconcile') {
  require(issued <= Date.now() && Date.now() < expires, 'Initial execution approval expired');
} else {
  const audit = `/var/lib/leetplus-compose/standalone-introductions/${operation}`;
  require(Buffer.compare(read(`${audit}/plan.json`, 65536), planRaw) === 0 &&
    Buffer.compare(read(`${audit}/approval.json`, 65536),
      Buffer.from(canonical(envelope))) === 0,
  'Historical initial execution lineage differs');
  const intent = record(read(`${audit}/intent.json`, 65536));
  require(intent.contract === 'LEETPLUS_STANDALONE_INITIAL_INTRO_V1_INTENT' &&
    intent.operationId === operation && intent.planSha256 === digest(planRaw) &&
    intent.approvalSha256 === digest(Buffer.from(canonical(envelope))),
  'Historical initial execution intent differs');
  const authorized = Date.parse(intent.authorizedAt);
  require(Number.isFinite(authorized) && new Date(authorized).toISOString() === intent.authorizedAt &&
    issued <= authorized && authorized < expires,
  'Historical initial execution intent was not timely');
}
const pem = read(ROOT, 4096);
require(!pem.includes(Buffer.from('PRIVATE')), 'Private material in deployment public root');
const key = crypto.createPublicKey(pem);
require(key.asymmetricKeyType === 'ed25519' &&
  crypto.verify(null, Buffer.from(canonical(approval)), key, Buffer.from(envelope.signature, 'base64')),
'Initial operator signature rejected');
const program = read(`${input}/intro-program.py`, 2 * 1024 * 1024);
require(digest(program) === plan.introProgramSha256, 'Initial program differs from signed source');
const entry = read(`${input}/intro-entry.mjs`, 2 * 1024 * 1024);
require(digest(entry) === plan.introEntrySha256,
  'Protected operator entry source differs from signed source');
// Execute the same verified buffer; no hash-one-path/execute-another-path race.
// Python -I denies PYTHONPATH, user-site and CWD imports. Parent transcript
// additionally owns a bounded process-group watchdog and output receipts.
const result = spawnSync('/usr/bin/python3', ['-I', '-B', '-', '--mode', mode, '--operation-id', operation,
  '--expected-plan-sha256', digest(planRaw),
  '--expected-approval-sha256', digest(approvalRaw),
  '--captured-plan-base64', planRaw.toString('base64'),
  '--captured-approval-base64', approvalRaw.toString('base64')], {
  input: program, env: CLEAN, timeout: 185000, maxBuffer: 1024 * 1024,
  encoding: 'buffer', killSignal: 'SIGKILL', windowsHide: true,
});
if (result.stdout?.length) process.stdout.write(result.stdout);
if (result.stderr?.length) process.stderr.write(result.stderr);
require(!result.error && !result.signal && Number.isInteger(result.status),
  'Initial execution outcome is unknown; reconcile without replay');
process.exitCode = result.status;
