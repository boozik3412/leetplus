import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// This verifier is an independently admitted, read-only initial trust boundary.
// It has no local imports so the V2 wrapper can execute captured verified bytes.
const CONTRACT = 'LEETPLUS_STANDALONE_INITIAL_INTRO_VERIFICATION_V1';
const PLAN = 'LEETPLUS_STANDALONE_INITIAL_INTRO_V2_PLAN';
const APPROVAL = 'LEETPLUS_STANDALONE_INITIAL_INTRO_V2_APPROVAL';
const INTENT = 'LEETPLUS_STANDALONE_INITIAL_INTRO_V2_INTENT';
const GENERATION = 'LEETPLUS_STANDALONE_INERT_GENERATION_V1_RECEIPT';
const RECEIPT = 'LEETPLUS_STANDALONE_INITIAL_INTRO_V2_RECEIPT';
const TRANSPORT = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_RECEIPT';
const TRANSPORT_PLAN = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_PLAN';
const TRANSPORT_APPROVAL = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_APPROVAL';
const TRANSPORT_INTENT = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_INTENT';
const VERIFIER = '/usr/local/libexec/leetplus/verify-installed-standalone-intro.mjs';
const DEPLOYMENT_ROOT = '/etc/leetplus-compose/approval-root.pem';
const GENERATIONS = '/srv/leetplus/production-control-generations';
const AUDITS = '/var/lib/leetplus-compose/standalone-introductions';
const TRANSPORT_AUDITS = '/var/lib/leetplus-compose/standalone-intro-transports';
const LAYOUT = '/usr/local/libexec/leetplus-transition-bootstrap/bootstrap-install-layout.json';
const WRAPPER = '/usr/local/sbin/leetplus-install-predecessor-bootstrap';
const LAUNCHER = '/usr/local/sbin/leetplus-trusted-predecessor-bootstrap';
const INSTALL_LOCK = '/var/lib/leetplus-compose/standalone-install.lock';
const SHA = /^[a-f0-9]{64}$/u;
const RELEASE = /^[a-f0-9]{40}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SAFE = /^[A-Za-z0-9_.@+/-]+$/u;
const MAX_LEAF = 2 * 1024 * 1024;
const MAX_TREE = 256;
let totalRead = 0;
const SOURCE_FILES = Object.freeze([
  'deploy/leetplus-compose/a-bridge-bootstrap-authority.mjs',
  'deploy/leetplus-compose/bridge-external-successor-authority.mjs',
  'deploy/leetplus-compose/control-handoff-authority.mjs',
  'deploy/transition-bootstrap/authority.py',
  'deploy/transition-bootstrap/bundle_installer.py',
  'deploy/transition-bootstrap/canonical_lineage.py',
  'deploy/transition-bootstrap/canonical_lineage_native.py',
  'deploy/transition-bootstrap/cli.mjs',
  'deploy/transition-bootstrap/enrollment.py',
  'deploy/transition-bootstrap/hard_deadline.py',
  'deploy/transition-bootstrap/host_observer.py',
  'deploy/transition-bootstrap/inventory.py',
  'deploy/transition-bootstrap/native_boundary.py',
  'deploy/transition-bootstrap/protocol.mjs',
  'deploy/transition-bootstrap/rpc_host.py',
  'docs/deployment/production-artifact/bootstrap-install-layout.json',
  'docs/deployment/production-artifact/install_predecessor_bootstrap.py',
  'docs/deployment/production-artifact/trusted_predecessor_bootstrap_launcher.py',
  'docs/deployment/production-control-authority/verify-installed-standalone-intro.mjs',
]);
const EFFECTS = Object.freeze({
  inertGenerationOnly: true,
  dormantEntryPointsOnly: true,
  controllerPointerMutation: false,
  applicationRestart: false,
  systemdUnitMutation: false,
  daemonReload: false,
  dataMutation: false,
  workerGrantMutation: false,
  timerMutation: false,
  providerEffect: false,
  privateKeyTransport: false,
});
const PLAN_KEYS = Object.freeze([
  'contract', 'operationId', 'action', 'hostIdentitySha256', 'bootId',
  'predecessorReleaseSha', 'predecessorManifestSha256',
  'predecessorExecutorSha256', 'predecessorInstallerSha256',
  'oldCorePointer', 'oldActiveRecordSha256', 'oldHandoffPointerSha256',
  'pendingHandoffAbsent', 'sourceRelease', 'sourceTreeSha',
  'fullRunId', 'fullRunAttempt', 'impactReceiptSha256',
  'finalAdmissionSha256', 'composeAdmissionSha256',
  'sourceArtifactId', 'sourceProducerRunId', 'sourceProducerRunAttempt',
  'sourceTransportSha256', 'sourceReceiptSha256', 'sourceArchiveSha256',
  'sourceRootManifestSha256', 'productionControlArtifactId',
  'productionControlTransportSha256', 'productionControlArchiveSha256',
  'composeArtifactId', 'composeTransportSha256', 'composeControlArchiveSha256',
  'introTransportOperationId', 'introTransportReceiptSha256',
  'introEntrySha256', 'introProgramSha256', 'generationRootManifestSha256',
  'generationSourceMapSha256', 'generationDestination',
  'dormantDestinations', 'destinationPreimages', 'directoryPreimages',
  'anchorDirectories',
  'nativeControlLockIdentity', 'effects',
]);
const EXPECTED_DESTINATIONS = Object.freeze([VERIFIER, WRAPPER, LAUNCHER, LAYOUT, INSTALL_LOCK]);
const TRANSPORT_LINK_FIELDS = Object.freeze([
  'hostIdentitySha256', 'sourceRelease', 'sourceArtifactId', 'sourceProducerRunId',
  'sourceProducerRunAttempt', 'sourceTransportSha256', 'sourceReceiptSha256',
  'sourceArchiveSha256', 'sourceRootManifestSha256', 'composeArtifactId',
  'composeTransportSha256', 'composeControlArchiveSha256', 'composeAdmissionSha256',
  'introEntrySha256', 'introProgramSha256',
]);
const TRANSPORT_EFFECTS = Object.freeze({
  sourceSnapshotOnly: true, targetExecution: false, controllerPointerMutation: false,
  applicationRestart: false, systemdUnitMutation: false, daemonReload: false,
  dataMutation: false,
  timerMutation: false, workerGrantMutation: false, providerEffect: false,
  privateKeyTransport: false,
});
const TRANSPORT_PLAN_KEYS = Object.freeze([
  'contract', 'operationId', 'action', ...TRANSPORT_LINK_FIELDS,
  'snapshotPath', 'snapshotSize', 'snapshotMode',
  'entrySnapshotPath', 'entrySnapshotSize', 'entrySnapshotMode', 'effects', 'execution',
]);
const TRANSPORT_RECEIPT_KEYS = Object.freeze([
  'contract', 'decision', 'operationId', 'planSha256', 'approvalSha256',
  'intentSha256', ...TRANSPORT_LINK_FIELDS, 'snapshotPath',
  'snapshotDevice', 'snapshotInode', 'snapshotSize', 'snapshotMode',
  'snapshotUid', 'snapshotGid', 'entrySnapshotPath',
  'entrySnapshotDevice', 'entrySnapshotInode', 'entrySnapshotSize',
  'entrySnapshotMode', 'entrySnapshotUid', 'entrySnapshotGid',
  'executionSha256', 'flatIntentSha256', 'fullPostimageSha256',
  'parentPostimageSha256', 'predecessorPostimageSha256', 'acceptedAt',
]);
const DESTINATION_MODES = Object.freeze({
  [VERIFIER]: 0o555,
  [WRAPPER]: 0o500,
  [LAUNCHER]: 0o500,
  [LAYOUT]: 0o400,
  [INSTALL_LOCK]: 0o600,
});
const PARENT_MODES = Object.freeze({
  '/srv/leetplus/production-control-generations': 0o700,
  '/var/lib/leetplus-compose/standalone-introductions': 0o700,
  '/usr/local/libexec': 0o755,
  '/usr/local/libexec/leetplus': 0o755,
  '/usr/local/libexec/leetplus-transition-bootstrap': 0o755,
});
const ANCHOR_DIRS = Object.freeze([
  '/usr/local', '/usr/local/sbin', '/usr/local/lib/leetplus-compose',
  '/srv/leetplus', '/srv/leetplus/production-control-inbox',
  '/var/lib/leetplus-compose', '/etc/leetplus-compose',
]);
const PREDECESSOR = Object.freeze({
  releaseSha: 'b0cbf3a4f302b299762fa055f3bffe0376a91182',
  manifestSha256: 'f9bd049e7cc4c03f206c99c2bad92ae54b34deb28b4b6980abb1bc44432dfb75',
  executorSha256: '48aa00c4f6d3148ee210901cd572c6b5a3b3600ad4d20e3551e326ee18fcda18',
  installerSha256: 'c41144f91a1cfdba3dc184a0afda5c6917fa512a9873b143b8c271edb433b9b4',
});
const compareBytes = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

function fail(message) { throw new Error(`verify-installed-standalone-intro: ${message}`); }
function require(test, message) { if (!test) fail(message); }
function sameKeys(value, keys, label) {
  require(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort(compareBytes).join('\0') === [...keys].sort(compareBytes).join('\0'),
  `${label} field set differs`);
}
function exactJson(raw, label) {
  require(raw.length > 0 && raw.length <= 65536, `${label} size differs`);
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { fail(`${label} is not UTF-8 JSON`); }
  require(Buffer.compare(raw, Buffer.from(canonical(value))) === 0,
    `${label} is not canonical JSON`);
  return value;
}
function canonicalTime(value) {
  require(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value),
    'Noncanonical UTC time');
  const milliseconds = Date.parse(value);
  require(Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value,
    'Invalid UTC time');
  return milliseconds;
}
function safeRelative(value) {
  require(typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
    value === value.normalize('NFC') && SAFE.test(value) &&
    value.split('/').every((part) => part && part !== '.' && part !== '..'),
  'Unsafe relative manifest path');
  return value;
}

function assertRootAncestors(absolute) {
  require(path.posix.isAbsolute(absolute) && path.posix.normalize(absolute) === absolute,
    'Noncanonical fixed absolute path');
  let current = '/';
  for (const part of absolute.slice(1).split('/').slice(0, -1)) {
    current = path.posix.join(current, part);
    const st = fs.lstatSync(current, { bigint: true });
    require(st.isDirectory() && !st.isSymbolicLink() && st.uid === 0n &&
      (st.mode & 0o022n) === 0n, 'Untrusted ancestor of installed intro authority');
  }
}
function readRegular(absolute, max = MAX_LEAF, expectedMode = undefined) {
  assertRootAncestors(absolute);
  const before = fs.lstatSync(absolute, { bigint: true });
  require(before.isFile() && !before.isSymbolicLink() && before.uid === 0n &&
    before.gid === 0n && before.nlink === 1n && before.size >= 0n &&
    before.size <= BigInt(max) && (before.mode & 0o022n) === 0n,
  'Untrusted installed intro authority leaf');
  if (expectedMode !== undefined) {
    require((before.mode & 0o7777n) === BigInt(expectedMode), 'Installed intro leaf mode differs');
  }
  totalRead += Number(before.size);
  require(totalRead <= 64 * 1024 * 1024, 'Installed intro aggregate read bound exceeded');
  const descriptor = fs.openSync(absolute,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const opened = fs.fstatSync(descriptor, { bigint: true });
    require(opened.isFile() && opened.dev === before.dev && opened.ino === before.ino &&
      opened.ctimeNs === before.ctimeNs && opened.size === before.size && opened.nlink === 1n,
    'Installed intro leaf changed before read');
    const raw = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < raw.length) {
      const count = fs.readSync(descriptor, raw, offset, raw.length - offset, offset);
      require(count > 0, 'Short installed intro leaf read');
      offset += count;
    }
    const overflow = Buffer.alloc(1);
    require(fs.readSync(descriptor, overflow, 0, 1, raw.length) === 0,
      'Installed intro leaf grew during read');
    const after = fs.fstatSync(descriptor, { bigint: true });
    require(after.dev === opened.dev && after.ino === opened.ino &&
      after.ctimeNs === opened.ctimeNs && after.size === opened.size,
    'Installed intro leaf changed during read');
    return raw;
  } finally { fs.closeSync(descriptor); }
}
function readRecord(absolute, label) {
  const raw = readRegular(absolute, 65536, 0o400);
  return { raw, value: exactJson(raw, label) };
}
function listTree(root) {
  const files = new Map();
  const dirs = new Set();
  let visited = 0;
  const rootDevice = fs.lstatSync(root, { bigint: true }).dev;
  function visit(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      require(++visited <= MAX_TREE, 'Intro generation tree is oversized');
      const relative = safeRelative(prefix ? `${prefix}/${entry.name}` : entry.name);
      const absolute = path.posix.join(root, relative);
      const st = fs.lstatSync(absolute, { bigint: true });
      require(st.uid === 0n && st.gid === 0n && st.dev === rootDevice && !st.isSymbolicLink(),
        'Untrusted intro generation entry');
      if (st.isDirectory()) {
        require((st.mode & 0o7777n) === 0o700n, 'Intro generation directory mode differs');
        dirs.add(relative); visit(absolute, relative);
      } else {
        require(st.isFile() && st.nlink === 1n && (st.mode & 0o7777n) === 0o400n,
          'Intro generation leaf mode differs');
        files.set(relative, { absolute, size: Number(st.size) });
      }
    }
  }
  visit(root);
  return { files, dirs };
}
function parseManifest(raw) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  require(text.endsWith('\n') && !text.endsWith('\n\n'), 'Generation manifest ending differs');
  const map = new Map();
  let prior = undefined;
  for (const line of text.slice(0, -1).split('\n')) {
    const match = /^([a-f0-9]{64})  \.\/(.+)$/u.exec(line);
    require(match, 'Generation manifest row differs');
    const relative = safeRelative(match[2]);
    require(relative !== 'SHA256SUMS' && !map.has(relative) &&
      (prior === undefined || compareBytes(prior, relative) < 0),
    'Generation manifest order/set differs');
    map.set(relative, match[1]); prior = relative;
  }
  return map;
}
function mapObject(map) {
  return Object.fromEntries([...map].sort(([a], [b]) => compareBytes(a, b)));
}
function verifyGeneration(release, plan, introSha, approvalSha, intentSha) {
  const root = `${GENERATIONS}/${release}`;
  const st = fs.lstatSync(root, { bigint: true });
  require(st.isDirectory() && st.uid === 0n && st.gid === 0n &&
    (st.mode & 0o7777n) === 0o700n, 'Inert generation root differs');
  const names = fs.readdirSync(root).sort(compareBytes);
  require(names.join('\0') === ['payload', 'receipt.json', 'source-receipt.json'].join('\0'),
    'Inert generation root has foreign entry');
  const generation = readRecord(`${root}/receipt.json`, 'generation receipt');
  const sourceReceipt = readRecord(`${root}/source-receipt.json`, 'source producer receipt');
  sameKeys(generation.value, ['contract', 'decision', 'operationId', 'sourceRelease',
    'sourceTreeSha', 'sourceReceiptSha256',
    'introPlanSha256', 'introApprovalSha256', 'introIntentSha256',
    'generationRootManifestSha256', 'generationSourceMapSha256',
    'finalAdmissionSha256', 'composeAdmissionSha256', 'installedAt'],
  'generation receipt');
  require(generation.value.contract === GENERATION && generation.value.decision === 'PASS' &&
    generation.value.operationId === plan.operationId && generation.value.sourceRelease === release &&
    generation.value.sourceTreeSha === plan.sourceTreeSha &&
    generation.value.sourceReceiptSha256 === plan.sourceReceiptSha256 &&
    generation.value.introPlanSha256 === introSha &&
    generation.value.introApprovalSha256 === approvalSha &&
    generation.value.introIntentSha256 === intentSha &&
    generation.value.finalAdmissionSha256 === plan.finalAdmissionSha256 &&
    generation.value.composeAdmissionSha256 === plan.composeAdmissionSha256,
  'Generation receipt lineage differs');
  require(digest(sourceReceipt.raw) === plan.sourceReceiptSha256 &&
    sourceReceipt.value.contract === 'LEETPLUS_STANDALONE_INITIAL_SOURCE_V1' &&
    sourceReceipt.value.decision === 'SOURCE_BYTES_ONLY_NOT_AUTHORIZATION' &&
    sourceReceipt.value.repository === 'boozik3412/leetplus' &&
    sourceReceipt.value.sourceRelease === release &&
    sourceReceipt.value.sourceTreeSha === plan.sourceTreeSha &&
    sourceReceipt.value.sourceArchiveSha256 === plan.sourceArchiveSha256 &&
    sourceReceipt.value.generationRootManifestSha256 === plan.sourceRootManifestSha256 &&
    sourceReceipt.value.generationSourceMapSha256 === plan.generationSourceMapSha256 &&
    sourceReceipt.value.runId === String(plan.sourceProducerRunId) &&
    sourceReceipt.value.runAttempt === plan.sourceProducerRunAttempt &&
    sourceReceipt.value.fileCount === SOURCE_FILES.length,
  'Historical source producer receipt differs from signed introduction');
  const payload = `${root}/payload`;
  const payloadStat = fs.lstatSync(payload, { bigint: true });
  require(payloadStat.isDirectory() && payloadStat.uid === 0n && payloadStat.gid === 0n &&
    (payloadStat.mode & 0o7777n) === 0o700n, 'Generation payload root differs');
  const manifestRaw = readRegular(`${payload}/SHA256SUMS`, 65536, 0o400);
  const manifestSha = digest(manifestRaw);
  require(manifestSha === plan.generationRootManifestSha256 &&
    manifestSha === plan.sourceRootManifestSha256 &&
    manifestSha === generation.value.generationRootManifestSha256,
  'Inert generation manifest differs from signed source');
  const map = parseManifest(manifestRaw);
  require(map.size === SOURCE_FILES.length &&
    [...map.keys()].sort(compareBytes).join('\0') === [...SOURCE_FILES].sort(compareBytes).join('\0'),
  'Inert generation source closure differs');
  const { files, dirs } = listTree(payload);
  require(files.size === map.size + 1 && files.has('SHA256SUMS'),
    'Generation has missing/extra regular leaf');
  const expectedDirs = new Set();
  for (const relative of map.keys()) {
    const components = relative.split('/');
    for (let length = 1; length < components.length; length += 1) {
      expectedDirs.add(components.slice(0, length).join('/'));
    }
  }
  require(dirs.size === expectedDirs.size && [...dirs].every((value) => expectedDirs.has(value)),
    'Generation has missing/extra directory');
  for (const [relative, expected] of map) {
    const file = files.get(relative);
    require(file && file.size <= MAX_LEAF &&
      digest(readRegular(file.absolute, MAX_LEAF, 0o400)) === expected,
    'Generation source file differs from signed manifest');
  }
  const sourceMapSha = digest(Buffer.from(canonical(mapObject(map))));
  require(sourceMapSha === plan.generationSourceMapSha256 &&
    sourceMapSha === generation.value.generationSourceMapSha256 &&
    JSON.stringify(sourceReceipt.value.sourceFiles) === JSON.stringify(mapObject(map)),
  'Generation source file map digest differs');
  const verifierSourceSha = map.get('docs/deployment/production-control-authority/verify-installed-standalone-intro.mjs');
  return { root, generation, manifestSha, sourceMapSha, verifierSourceSha };
}
function verifyApproval(planRaw, plan, envelope, authorizedAt, acceptedAt) {
  sameKeys(envelope, ['approval', 'signature'], 'intro approval envelope');
  const approval = envelope.approval;
  sameKeys(approval, ['contract', 'operationId', 'hostIdentitySha256', 'planSha256',
    'action', 'issuedAt', 'expiresAt'], 'intro approval');
  require(approval.contract === APPROVAL && approval.operationId === plan.operationId &&
    approval.hostIdentitySha256 === plan.hostIdentitySha256 &&
    approval.planSha256 === digest(planRaw) && approval.action === plan.action,
  'Signed intro approval does not bind exact plan');
  const issued = canonicalTime(approval.issuedAt);
  const expires = canonicalTime(approval.expiresAt);
  const intentTime = canonicalTime(authorizedAt);
  const receiptTime = canonicalTime(acceptedAt);
  require(issued <= intentTime && intentTime <= receiptTime &&
    receiptTime < expires && expires - issued <= 30 * 60 * 1000,
  'Intro approval was not valid when effect was accepted');
  require(typeof envelope.signature === 'string' &&
    /^[A-Za-z0-9+/]{86}==$/u.test(envelope.signature), 'Intro signature encoding differs');
  const pem = readRegular(DEPLOYMENT_ROOT, 4096);
  require(!pem.includes(Buffer.from('PRIVATE')), 'Private key appeared in public root');
  const key = crypto.createPublicKey(pem);
  require(key.asymmetricKeyType === 'ed25519' &&
    crypto.verify(null, Buffer.from(canonical(approval)), key,
      Buffer.from(envelope.signature, 'base64')),
  'Intro deployment-root signature differs');
}
function verifyTransportFinalize(originalId, original, originalPlanRaw, originalApprovalRaw,
  originalIntentRaw, rawReceipt, request, audit, pem) {
  const flat=`/var/lib/leetplus-compose/${originalId}.standalone-transport-finalize.intent.json`;
  try { fs.lstatSync(flat); } catch(error) { if(error.code==='ENOENT')return;throw error; }
  const body=exactJson(readRegular(flat,131072,0o400),'finalization flat intent');
  sameKeys(body,['contract','operationId','originalOperationId','planSha256','approvalSha256',
    'requestReceiptSha256','authorizedAt','plan','approvalEnvelope'],'finalization intent');
  const p=body.plan,e=p.execution,envelope=body.approvalEnvelope;
  sameKeys(p,['contract','operationId','action','hostIdentitySha256','bootId',
    'originalOperationId','originalPlanSha256','originalApprovalSha256','originalIntentSha256',
    'requestReceiptSha256','execution','effects'],'finalization plan');
  require(body.contract==='LEETPLUS_STANDALONE_INTRO_TRANSPORT_FINALIZE_V1_INTENT'&&
    p.contract==='LEETPLUS_STANDALONE_INTRO_TRANSPORT_FINALIZE_V1_PLAN'&&
    p.action==='FINALIZE_EXACT_INITIAL_TRANSPORT_AUDIT_RECEIPT_ONLY'&&
    UUID.test(p.operationId)&&UUID.test(p.bootId)&&p.operationId===body.operationId&&
    p.operationId!==originalId&&p.operationId!=='9afc7218-4757-4f44-87e1-6096706bad44'&&
    body.originalOperationId===originalId&&p.originalOperationId===originalId&&
    p.hostIdentitySha256===original.hostIdentitySha256&&
    p.originalPlanSha256===digest(originalPlanRaw)&&p.originalApprovalSha256===digest(originalApprovalRaw)&&
    p.originalIntentSha256===digest(originalIntentRaw)&&
    p.requestReceiptSha256===body.requestReceiptSha256&&p.requestReceiptSha256===digest(rawReceipt)&&
    body.planSha256===digest(Buffer.from(canonical(p)))&&
    body.approvalSha256===digest(Buffer.from(canonical(envelope))),
    'Finalization historical/new authority lineage differs');
  sameKeys(e,['code','invocation','host','nativeControlLockIdentity','trustRoot',
    'auditDirectoryIdentity','requestDirectoryIdentity','destinations','limits','effects'],
    'finalization execution');
  const effects={auditReceiptFinalizeOnly:true,sourceSnapshotMutation:false,targetExecution:false,
    controllerPointerMutation:false,applicationRestart:false,systemdUnitMutation:false,
    daemonReload:false,dataMutation:false,timerMutation:false,workerGrantMutation:false,
    providerEffect:false,privateKeyTransport:false};
  for(const value of [p.effects,e.effects]){
    sameKeys(value,Object.keys(effects),'finalization effects');
    require(Object.entries(effects).every(([k,v])=>value[k]===v),'Finalization effect scope differs');
  }
  sameKeys(e.host,['hostIdentitySha256','bootId'],'finalization host');
  sameKeys(e.trustRoot,['path','rawSha256'],'finalization root');
  require(e.host.hostIdentitySha256===p.hostIdentitySha256&&e.host.bootId===p.bootId&&
    JSON.stringify(e.nativeControlLockIdentity)===JSON.stringify(original.execution.nativeControlLockIdentity)&&
    e.trustRoot.path===DEPLOYMENT_ROOT&&e.trustRoot.rawSha256===digest(pem)&&
    JSON.stringify(e.invocation)===JSON.stringify({interpreter:'/usr/bin/python3',flags:['-I','-B','-c'],
      mode:'memory-captured-python-c',action:'finalize-reconcile'})&&
    JSON.stringify(e.limits)===JSON.stringify({archiveBytes:16777216,leafBytes:2097152,
      authorizationBytes:131072,packetBytes:131072,transportProgramBytes:65536,
      lockWaitSeconds:120,totalSeconds:180}), 'Finalization root/invocation/limits differ');
  sameKeys(e.code,['finalizeEntrySha256','transportProgramSha256','pythonLoaderSha256',
    'nodeExecutableSha256','nodeRealpath','pythonExecutableSha256','pythonRealpath'],'finalize code');
  require(['finalizeEntrySha256','transportProgramSha256','pythonLoaderSha256','nodeExecutableSha256',
    'pythonExecutableSha256'].every(k=>SHA.test(e.code[k]??''))&&
    e.code.pythonLoaderSha256==='a44a7637f5d4a89f7ab7084fc1a300c35727fe20b78e44ad4491fbba91191bff'&&
    e.code.nodeRealpath.startsWith('/usr/bin/node')&&e.code.pythonRealpath.startsWith('/usr/bin/python3'),
    'Finalization captured code closure differs');
  const auditReceipt=`${audit}/receipt.json`;
  sameKeys(e.destinations,[flat,auditReceipt],'two finalization destinations');
  require(JSON.stringify(e.destinations[flat])===JSON.stringify({kind:'FLAT_FINALIZE_INTENT',
    preimage:'ABSENT',uid:0,gid:0,mode:0o400})&&
    JSON.stringify(e.destinations[auditReceipt])===JSON.stringify({kind:'ORIGINAL_AUDIT_RECEIPT',
      preimage:'ABSENT',sha256:digest(rawReceipt),bytes:rawReceipt.length,uid:0,gid:0,mode:0o400}),
    'Finalization two-write byte map differs');
  for(const [name,key] of [[audit,'auditDirectoryIdentity'],[request,'requestDirectoryIdentity']]){
    const expected=e[key],st=fs.lstatSync(name,{bigint:true});
    sameKeys(expected,['device','inode','uid','gid','mode'],'finalization directory identity');
    require(st.isDirectory()&&!st.isSymbolicLink()&&expected.uid===0&&expected.gid===0&&
      expected.mode===0o700&&st.dev===BigInt(expected.device)&&st.ino===BigInt(expected.inode)&&
      st.uid===0n&&st.gid===0n&&(st.mode&0o7777n)===0o700n,'Finalization directory identity differs');
  }
  sameKeys(envelope,['approval','signature'],'finalization envelope');
  const a=envelope.approval;
  sameKeys(a,['contract','operationId','hostIdentitySha256','planSha256','action','issuedAt','expiresAt'],
    'finalization approval');
  const issued=canonicalTime(a.issuedAt),expires=canonicalTime(a.expiresAt),authorized=canonicalTime(body.authorizedAt);
  require(a.contract==='LEETPLUS_STANDALONE_INTRO_TRANSPORT_FINALIZE_V1_APPROVAL'&&
    a.operationId===p.operationId&&a.action===p.action&&a.hostIdentitySha256===p.hostIdentitySha256&&
    a.planSha256===body.planSha256&&issued<=authorized&&authorized<expires&&
    expires-issued>0&&expires-issued<=1800000&&
    canonicalTime(exactJson(rawReceipt,'original transport receipt').acceptedAt)<=authorized&&
    /^[A-Za-z0-9+/]{86}==$/u.test(envelope.signature), 'Finalization signed approval/time differs');
  const key=crypto.createPublicKey(pem);
  require(key.asymmetricKeyType==='ed25519'&&crypto.verify(null,Buffer.from(canonical(a)),key,
    Buffer.from(envelope.signature,'base64'))&&
    Buffer.compare(readRegular(auditReceipt,131072,0o400),rawReceipt)===0&&
    Buffer.compare(readRegular(`${request}/transport-receipt.json`,131072,0o400),rawReceipt)===0,
    'Finalization public signature or terminal postimage differs');
}
function verifyTransport(plan, rawReceipt, receipt) {
  sameKeys(receipt, TRANSPORT_RECEIPT_KEYS, 'initial source transport receipt');
  require(receipt.contract === TRANSPORT && receipt.decision === 'PASS' &&
    receipt.operationId === plan.introTransportOperationId &&
    TRANSPORT_LINK_FIELDS.every((name) => receipt[name] === plan[name]) &&
    digest(rawReceipt) === plan.introTransportReceiptSha256,
  'Signed initial source transport receipt differs');
  const audit = `${TRANSPORT_AUDITS}/${plan.introTransportOperationId}`;
  const names = fs.readdirSync(audit).sort(compareBytes);
  require(names.join('\0') === ['approval.json', 'intent.json', 'plan.json', 'receipt.json'].join('\0'),
    'Initial source transport audit closure differs');
  const transportPlan = readRecord(`${audit}/plan.json`, 'initial source transport plan');
  const envelope = readRecord(`${audit}/approval.json`, 'initial source transport approval');
  const intent = readRecord(`${audit}/intent.json`, 'initial source transport intent');
  const auditReceipt = readRecord(`${audit}/receipt.json`, 'initial source transport receipt');
  require(Buffer.compare(rawReceipt, auditReceipt.raw) === 0,
    'Initial source transport receipt changed after intro');
  sameKeys(transportPlan.value, TRANSPORT_PLAN_KEYS, 'initial source transport plan');
  require(transportPlan.value.contract === TRANSPORT_PLAN &&
    transportPlan.value.operationId === plan.introTransportOperationId &&
    transportPlan.value.action === 'STAGE_SIGNED_INITIAL_INTRO_SOURCE_ONLY' &&
    TRANSPORT_LINK_FIELDS.every((name) => transportPlan.value[name] === plan[name]) &&
    Object.keys(transportPlan.value.effects ?? {}).length ===
      Object.keys(TRANSPORT_EFFECTS).length &&
    Object.entries(TRANSPORT_EFFECTS).every(([name, value]) =>
      transportPlan.value.effects?.[name] === value),
  'Initial source transport plan/effects differ');
  const execution = transportPlan.value.execution;
  sameKeys(execution, ['code','invocation','host','predecessor','nativeControlLockIdentity',
    'trustRoot','parentPreimages','leafPreimages','privateDirectories','destinations',
    'generatedDestinations','limits','effects'], 'mandatory V2 transport execution');
  sameKeys(execution.code, ['transportEntrySha256','transportProgramSha256',
    'pythonLoaderSha256','nodeExecutableSha256','nodeRealpath','pythonExecutableSha256','pythonRealpath'],
  'signed transport code closure');
  require(['transportEntrySha256','transportProgramSha256','pythonLoaderSha256','nodeExecutableSha256',
    'pythonExecutableSha256'].every((name)=>SHA.test(execution.code[name]??'')) &&
    execution.code.nodeRealpath.startsWith('/usr/bin/node') &&
    execution.code.pythonLoaderSha256==='a44a7637f5d4a89f7ab7084fc1a300c35727fe20b78e44ad4491fbba91191bff' &&
    execution.code.pythonRealpath.startsWith('/usr/bin/python3') &&
    JSON.stringify(execution.invocation)===JSON.stringify({interpreter:'/usr/bin/python3',
      flags:['-I','-B','-c'],mode:'memory-captured-python-c',action:'stage'}) &&
    execution.host?.hostIdentitySha256===plan.hostIdentitySha256 &&
    execution.host?.bootId===plan.bootId &&
    execution.trustRoot?.path===DEPLOYMENT_ROOT &&
    Object.keys(execution.effects??{}).length===Object.keys(TRANSPORT_EFFECTS).length &&
    Object.entries(TRANSPORT_EFFECTS).every(([name,value])=>execution.effects?.[name]===value) &&
    JSON.stringify(execution.limits)===JSON.stringify({archiveBytes:16777216,
      leafBytes:2097152,authorizationBytes:131072,packetBytes:50331648,
      transportProgramBytes:65536,lockWaitSeconds:120,totalSeconds:180}) &&
    JSON.stringify(execution.nativeControlLockIdentity)===JSON.stringify(plan.nativeControlLockIdentity) &&
    JSON.stringify(execution.predecessor)===JSON.stringify({
      releaseSha:PREDECESSOR.releaseSha,manifestSha256:PREDECESSOR.manifestSha256,
      executorSha256:PREDECESSOR.executorSha256,installerSha256:PREDECESSOR.installerSha256,
      corePointer:plan.oldCorePointer,activeRecordSha256:plan.oldActiveRecordSha256,
      handoffPointerSha256:plan.oldHandoffPointerSha256,pendingAbsent:true}),
  'Signed V2 transport code, host, predecessor or effect scope differs');
  const request=`/srv/leetplus/production-control-inbox/bootstrap-intro-${plan.operationId}`;
  const staging=`/srv/leetplus/production-control-inbox/.transport-${plan.introTransportOperationId}.pending`;
  const flat=`/var/lib/leetplus-compose/${plan.introTransportOperationId}.standalone-transport.intent.json`;
  const parents=['/var/lib/leetplus-compose','/srv/leetplus',
    '/srv/leetplus/production-control-inbox',TRANSPORT_AUDITS];
  sameKeys(execution.parentPreimages,parents,'transport parent preimages');
  require(JSON.stringify(execution.leafPreimages)===JSON.stringify(Object.fromEntries(
    [request,staging,audit,flat].sort(compareBytes).map(name=>[name,'ABSENT']))) &&
    JSON.stringify(execution.privateDirectories)===JSON.stringify(Object.fromEntries(
      [request,staging,audit].sort(compareBytes).map(name=>[name,{mode:0o700,uid:0,gid:0}]))) &&
    Object.keys(execution.destinations??{}).sort(compareBytes).join('\0')===
      ['source.tar.gz','source-receipt.json','final-admission.json',
       'docker-admission.json','intro-entry.mjs','intro-program.py'].sort(compareBytes).join('\0'),
  'V2 transport destination/preimage closure differs');
  const generated={
    [flat]:'FLAT_INTENT',[`${audit}/plan.json`]:'AUDIT_PLAN',
    [`${audit}/approval.json`]:'AUDIT_APPROVAL',[`${audit}/intent.json`]:'AUDIT_INTENT',
    [`${audit}/receipt.json`]:'AUDIT_RECEIPT',[`${request}/transport-receipt.json`]:'REQUEST_RECEIPT',
  };
  const generatedMap=Object.fromEntries(Object.entries(generated).sort(([a],[b])=>compareBytes(a,b))
    .map(([name,kind])=>[name,{kind,mode:0o400,uid:0,gid:0}]));
  require(JSON.stringify(execution.generatedDestinations)===JSON.stringify(generatedMap) &&
    receipt.executionSha256===digest(Buffer.from(canonical(execution))),
  'V2 generated destination or signed execution digest differs');
  sameKeys(envelope.value, ['approval', 'signature'], 'initial source transport approval envelope');
  const approval = envelope.value.approval;
  sameKeys(approval, ['contract', 'operationId', 'hostIdentitySha256',
    'planSha256', 'action', 'issuedAt', 'expiresAt'], 'initial source transport approval');
  require(approval.contract === TRANSPORT_APPROVAL &&
    approval.operationId === plan.introTransportOperationId &&
    approval.hostIdentitySha256 === plan.hostIdentitySha256 &&
    approval.planSha256 === digest(transportPlan.raw) &&
    approval.action === transportPlan.value.action,
  'Initial source transport approval does not bind its exact plan');
  sameKeys(intent.value, ['contract', 'operationId', 'planSha256',
    'approvalSha256', 'authorizedAt'], 'initial source transport intent');
  require(intent.value.contract === TRANSPORT_INTENT &&
    intent.value.operationId === plan.introTransportOperationId &&
    intent.value.planSha256 === digest(transportPlan.raw) &&
    intent.value.approvalSha256 === digest(envelope.raw) &&
    receipt.planSha256 === digest(transportPlan.raw) &&
    receipt.approvalSha256 === digest(envelope.raw) &&
    receipt.intentSha256 === digest(intent.raw),
  'Initial source transport intent/receipt lineage differs');
  require(Buffer.compare(readRegular(flat,65536,0o400),intent.raw)===0 &&
    receipt.flatIntentSha256===digest(intent.raw),
  'Transport pre-effect flat intent differs from historical audit');
  const issued = canonicalTime(approval.issuedAt);
  const expires = canonicalTime(approval.expiresAt);
  const authorized = canonicalTime(intent.value.authorizedAt);
  const accepted = canonicalTime(receipt.acceptedAt);
  require(issued <= authorized && authorized <= accepted && accepted < expires &&
    expires - issued <= 30 * 60 * 1000,
  'Historical source transport approval was not timely');
  require(typeof envelope.value.signature === 'string' &&
    /^[A-Za-z0-9+/]{86}==$/u.test(envelope.value.signature),
  'Initial source transport signature encoding differs');
  const pem = readRegular(DEPLOYMENT_ROOT, 4096);
  require(!pem.includes(Buffer.from('PRIVATE')) &&
    execution.trustRoot.rawSha256===digest(pem),
  'Private or foreign material in deployment root');
  const key = crypto.createPublicKey(pem);
  require(key.asymmetricKeyType === 'ed25519' &&
    crypto.verify(null, Buffer.from(canonical(approval)), key,
      Buffer.from(envelope.value.signature, 'base64')),
  'Initial source transport signature differs');
  const parentMap={};
  for(const directory of parents.sort(compareBytes)) {
    const pre=execution.parentPreimages[directory];
    sameKeys(pre,['state','device','inode','uid','gid','mode'],'transport parent preimage');
    const st=fs.lstatSync(directory,{bigint:true});
    require(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===0n&&
      (st.mode&0o022n)===0n&&['ABSENT','EXACT'].includes(pre.state)&&
      (pre.state!=='EXACT'||(st.dev===BigInt(pre.device)&&st.ino===BigInt(pre.inode))),
    'Signed transport parent changed');
    parentMap[directory]={device:Number(st.dev),inode:Number(st.ino),uid:Number(st.uid),
      gid:Number(st.gid),mode:Number(st.mode&0o7777n)};
  }
  require(receipt.parentPostimageSha256===digest(Buffer.from(canonical(parentMap))) &&
    receipt.predecessorPostimageSha256===digest(Buffer.from(canonical({
      corePointer:plan.oldCorePointer,manifestSha256:plan.predecessorManifestSha256,
      activeRecordSha256:plan.oldActiveRecordSha256,
      handoffPointerSha256:plan.oldHandoffPointerSha256,pendingAbsent:true}))),
  'Signed transport parent/predecessor postimage differs');
  const postimage={};
  for(const name of Object.keys(execution.destinations).sort(compareBytes)) {
    const expected=execution.destinations[name];
    sameKeys(expected,['sha256','bytes','mode','uid','gid'],'transport source destination');
    require(expected.mode===0o400&&expected.uid===0&&expected.gid===0,
      'Transport source destination mode/owner differs');
    const raw=readRegular(`${request}/${name}`,name==='source.tar.gz'?16777216:2097152,0o400);
    require(expected.sha256===digest(raw)&&expected.bytes===raw.length,
      'Transport source destination bytes differ');
    postimage[name]={sha256:digest(raw),bytes:raw.length,mode:0o400,uid:0,gid:0};
  }
  require(receipt.fullPostimageSha256===digest(Buffer.from(canonical(postimage))) &&
    !fs.existsSync(staging), 'Terminal source postimage/staging differs');
  const snapshotPath = `/srv/leetplus/production-control-inbox/bootstrap-intro-${plan.operationId}/intro-program.py`;
  require(receipt.snapshotPath === snapshotPath &&
    transportPlan.value.snapshotPath === snapshotPath &&
    transportPlan.value.snapshotMode === receipt.snapshotMode &&
    receipt.snapshotMode === 0o400 &&
    receipt.snapshotUid === 0 && receipt.snapshotGid === 0,
  'Initial source snapshot destination differs');
  const stat = fs.lstatSync(snapshotPath, { bigint: true });
  require(stat.isFile() && stat.uid === 0n && stat.gid === 0n &&
    stat.nlink === 1n && stat.dev === BigInt(receipt.snapshotDevice) &&
    stat.ino === BigInt(receipt.snapshotInode) &&
    stat.size === BigInt(receipt.snapshotSize) &&
    (stat.mode & 0o7777n) === 0o400n &&
    Number(stat.size) === transportPlan.value.snapshotSize &&
    digest(readRegular(snapshotPath, 2 * 1024 * 1024, 0o400)) === plan.introProgramSha256,
  'Protected initial source snapshot changed');
  const entryPath = `/srv/leetplus/production-control-inbox/bootstrap-intro-${plan.operationId}/intro-entry.mjs`;
  require(receipt.entrySnapshotPath === entryPath &&
    transportPlan.value.entrySnapshotPath === entryPath &&
    transportPlan.value.entrySnapshotMode === receipt.entrySnapshotMode &&
    receipt.entrySnapshotMode === 0o400 && receipt.entrySnapshotUid === 0 && receipt.entrySnapshotGid === 0,
  'Protected operator entry destination differs');
  const entryStat = fs.lstatSync(entryPath, { bigint: true });
  require(entryStat.isFile() && entryStat.uid === 0n && entryStat.gid === 0n &&
    entryStat.nlink === 1n && entryStat.dev === BigInt(receipt.entrySnapshotDevice) &&
    entryStat.ino === BigInt(receipt.entrySnapshotInode) &&
    entryStat.size === BigInt(receipt.entrySnapshotSize) &&
    (entryStat.mode & 0o7777n) === 0o400n &&
    Number(entryStat.size) === transportPlan.value.entrySnapshotSize &&
    digest(readRegular(entryPath, 2 * 1024 * 1024, 0o400)) === plan.introEntrySha256,
  'Protected operator entry snapshot changed');
  verifyTransportFinalize(plan.introTransportOperationId, transportPlan.value,
    transportPlan.raw, envelope.raw, intent.raw, rawReceipt, request, audit, pem);
}
function verifyIntroFinalize(original,originalRaw,approvalRaw,intentRaw,receiptRaw,postimage) {
  const flat=`/var/lib/leetplus-compose/${original.operationId}.standalone-intro-finalize.intent.json`;
  try{fs.lstatSync(flat);}catch(error){if(error.code==='ENOENT')return;throw error;}
  const body=exactJson(readRegular(flat,131072,0o400),'INTRO finalize intent');
  sameKeys(body,['contract','operationId','originalOperationId','planSha256','approvalSha256',
    'markerSha256','authorizedAt','plan','approvalEnvelope'],'INTRO finalize intent');
  const p=body.plan,e=p.execution,envelope=body.approvalEnvelope;
  sameKeys(p,['contract','operationId','originalOperationId','action','hostIdentitySha256','bootId',
    'originalPlanSha256','originalApprovalSha256','originalIntentSha256','markerSha256',
    'postimageSha256','execution','effects'],'INTRO finalize plan');
  require(body.contract==='LEETPLUS_STANDALONE_INITIAL_INTRO_FINALIZE_V1_INTENT'&&
    p.contract==='LEETPLUS_STANDALONE_INITIAL_INTRO_FINALIZE_V1_PLAN'&&
    p.action==='FINALIZE_EXACT_INITIAL_INTRO_AUDIT_RECEIPT_ONLY'&&
    UUID.test(p.operationId)&&UUID.test(p.bootId)&&p.operationId===body.operationId&&
    p.operationId!==original.operationId&&p.operationId!=='9afc7218-4757-4f44-87e1-6096706bad44'&&
    p.originalOperationId===body.originalOperationId&&p.originalOperationId===original.operationId&&
    p.hostIdentitySha256===original.hostIdentitySha256&&
    p.originalPlanSha256===digest(originalRaw)&&p.originalApprovalSha256===digest(approvalRaw)&&
    p.originalIntentSha256===digest(intentRaw)&&p.markerSha256===body.markerSha256&&
    p.markerSha256===digest(receiptRaw)&&p.postimageSha256===digest(Buffer.from(canonical(postimage)))&&
    body.planSha256===digest(Buffer.from(canonical(p)))&&body.approvalSha256===digest(Buffer.from(canonical(envelope))),
    'INTRO finalize original/new/full postimage binding differs');
  sameKeys(e,['code','invocation','host','nativeControlLockIdentity','trustRoot','auditDirectoryIdentity',
    'markerIdentity','destinations','limits','effects'],'INTRO finalize execution');
  const effects={introAuditReceiptFinalizeOnly:true,sourceMutation:false,dormantEntryMutation:false,
    targetExecution:false,controllerPointerMutation:false,applicationRestart:false,systemdUnitMutation:false,
    daemonReload:false,dataMutation:false,workerGrantMutation:false,timerMutation:false,providerEffect:false,
    privateKeyTransport:false};
  for(const value of [p.effects,e.effects]){sameKeys(value,Object.keys(effects),'INTRO finalize effects');
    require(Object.entries(effects).every(([k,v])=>value[k]===v),'INTRO finalize effect differs');}
  const pem=readRegular(DEPLOYMENT_ROOT,4096);
  require(JSON.stringify(e.host)===JSON.stringify({hostIdentitySha256:p.hostIdentitySha256,bootId:p.bootId})&&
    JSON.stringify(e.nativeControlLockIdentity)===JSON.stringify(original.nativeControlLockIdentity)&&
    JSON.stringify(e.trustRoot)===JSON.stringify({path:DEPLOYMENT_ROOT,rawSha256:digest(pem)})&&
    JSON.stringify(e.invocation)===JSON.stringify({interpreter:'/usr/bin/python3',flags:['-I','-B','-c'],
      mode:'captured-code-and-packet-stdin',action:'finalize'})&&
    JSON.stringify(e.limits)===JSON.stringify({programBytes:131072,packetBytes:131072,
      lockWaitSeconds:120,totalSeconds:180}), 'INTRO finalize invocation/root/limits differ');
  sameKeys(e.code,['introFinalizeEntrySha256','introProgramSha256','pythonLoaderSha256','nodeExecutableSha256',
    'nodeRealpath','pythonExecutableSha256','pythonRealpath'],'INTRO finalize code');
  const loader="import ctypes,hashlib,os,signal,sys; parent=int(sys.argv.pop(1)); assert ctypes.CDLL(None,use_errno=True).prctl(1,signal.SIGKILL,0,0,0)==0 and os.getppid()==parent; size=int.from_bytes(sys.stdin.buffer.read(4),'big'); assert 0<size<=131072; source=sys.stdin.buffer.read(size); expected=sys.argv.pop(1); assert len(source)==size and hashlib.sha256(source).hexdigest()==expected; sys.argv[0]='captured-intro-finalize'; exec(compile(source,'captured-intro-finalize','exec'),{'__name__':'__main__'})";
  require(['introFinalizeEntrySha256','introProgramSha256','pythonLoaderSha256','nodeExecutableSha256',
    'pythonExecutableSha256'].every(k=>SHA.test(e.code[k]??''))&&
    e.code.pythonLoaderSha256===digest(Buffer.from(loader))&&e.code.nodeRealpath.startsWith('/usr/bin/node')&&
    e.code.pythonRealpath.startsWith('/usr/bin/python3'),'INTRO finalize captured code closure differs');
  const audit=`${AUDITS}/${original.operationId}`,marker=`${audit}/receipt.pending.json`,receipt=`${audit}/receipt.json`;
  sameKeys(e.destinations,[flat,receipt],'INTRO finalize two-write destinations');
  require(JSON.stringify(e.destinations[flat])===JSON.stringify({kind:'FLAT_FINALIZE_INTENT',preimage:'ABSENT',
    uid:0,gid:0,mode:0o400})&&JSON.stringify(e.destinations[receipt])===JSON.stringify({kind:'EXACT_MARKER_RECEIPT',
      preimage:'ABSENT',sha256:digest(receiptRaw),bytes:receiptRaw.length,uid:0,gid:0,mode:0o400}),
      'INTRO finalize exact two-write map differs');
  const dir=fs.lstatSync(audit,{bigint:true}),ms=fs.lstatSync(marker,{bigint:true});
  require(JSON.stringify(e.auditDirectoryIdentity)===JSON.stringify({device:Number(dir.dev),inode:Number(dir.ino),
    uid:Number(dir.uid),gid:Number(dir.gid),mode:Number(dir.mode&0o7777n)})&&
    JSON.stringify(e.markerIdentity)===JSON.stringify({device:Number(ms.dev),inode:Number(ms.ino),bytes:Number(ms.size),
      uid:Number(ms.uid),gid:Number(ms.gid),mode:Number(ms.mode&0o7777n),ctimeNs:String(ms.ctimeNs)})&&
    Buffer.compare(readRegular(marker,65536,0o400),receiptRaw)===0,
    'INTRO finalize exact retained marker/directory differs');
  sameKeys(envelope,['approval','signature'],'INTRO finalize envelope');
  const a=envelope.approval;
  sameKeys(a,['contract','operationId','hostIdentitySha256','planSha256','action','issuedAt','expiresAt'],
    'INTRO finalize approval');
  const start=canonicalTime(a.issuedAt),end=canonicalTime(a.expiresAt),at=canonicalTime(body.authorizedAt);
  require(a.contract==='LEETPLUS_STANDALONE_INITIAL_INTRO_FINALIZE_V1_APPROVAL'&&a.operationId===p.operationId&&
    a.action===p.action&&a.hostIdentitySha256===p.hostIdentitySha256&&a.planSha256===body.planSha256&&
    start<=at&&at<end&&end-start>0&&end-start<=1800000&&
    canonicalTime(exactJson(receiptRaw,'INTRO marker').acceptedAt)<=at&&
    /^[A-Za-z0-9+/]{86}==$/u.test(envelope.signature), 'INTRO finalize timely approval differs');
  const key=crypto.createPublicKey(pem);
  require(key.asymmetricKeyType==='ed25519'&&crypto.verify(null,Buffer.from(canonical(a)),key,
    Buffer.from(envelope.signature,'base64')),'INTRO finalize public signature differs');
}
function verifyIntro(release) {
  require(RELEASE.test(release), 'Expected one exact source release');
  const generationRoot = `${GENERATIONS}/${release}`;
  const generationPre = readRecord(`${generationRoot}/receipt.json`, 'generation receipt');
  require(generationPre.value.sourceRelease === release &&
    UUID.test(generationPre.value.operationId), 'Generation has no exact intro operation');
  const audit = `${AUDITS}/${generationPre.value.operationId}`;
  const auditStat = fs.lstatSync(audit, { bigint: true });
  require(auditStat.isDirectory() && !auditStat.isSymbolicLink() &&
    auditStat.uid === 0n && auditStat.gid === 0n &&
    (auditStat.mode & 0o7777n) === 0o700n,
  'Intro audit root differs');
  const mountInfo = fs.readFileSync('/proc/self/mountinfo', 'utf8');
  require(mountInfo.length > 0 && Buffer.byteLength(mountInfo) <= 2 * 1024 * 1024 &&
    mountInfo.endsWith('\n'), 'Incomplete bounded installed mount inventory');
  for (const line of mountInfo.slice(0, -1).split('\n')) {
    const fields = line.split(' ');
    require(fields.length >= 7 && fields.includes('-'), 'Malformed installed mount inventory');
    const target = fields[4].replace(/\\(040|011|012|134)/gu, (_, code) =>
      ({ '040': ' ', '011': '\t', '012': '\n', '134': '\\' })[code]);
    require(![generationRoot, audit, ...EXPECTED_DESTINATIONS].some((value) =>
      target === value || target.startsWith(`${value}/`)), 'Nested installed authority mount');
  }
  const auditNames = fs.readdirSync(audit).sort(compareBytes);
  require(auditNames.join('\0') === ['approval.json', 'intent.json', 'plan.json', 'receipt.json','receipt.pending.json'].join('\0'),
    'Intro audit directory has foreign entry');
  const plan = readRecord(`${audit}/plan.json`, 'intro plan');
  const envelope = readRecord(`${audit}/approval.json`, 'intro approval');
  const intent = readRecord(`${audit}/intent.json`, 'intro intent');
  const preEffectIntent = readRecord(
    `/var/lib/leetplus-compose/${generationPre.value.operationId}.standalone-intro.intent.json`,
    'pre-effect intro intent');
  require(Buffer.compare(preEffectIntent.raw, intent.raw) === 0,
    'Pre-effect intro intent differs from audit intent');
  const receipt = readRecord(`${audit}/receipt.json`, 'intro receipt');
  require(Buffer.compare(receipt.raw,readRegular(`${audit}/receipt.pending.json`,65536,0o400))===0,
    'Intro terminal receipt differs from timely durable marker');
  sameKeys(plan.value, PLAN_KEYS, 'intro plan');
  require(plan.value.contract === PLAN && plan.value.action === 'INTRODUCE_INERT_STANDALONE_TRUST' &&
    plan.value.sourceRelease === release && plan.value.operationId === generationPre.value.operationId &&
    plan.value.generationDestination === generationRoot &&
    plan.value.oldCorePointer ===
      `/usr/local/lib/leetplus-compose/${plan.value.predecessorReleaseSha}/control.sh` &&
    RELEASE.test(plan.value.predecessorReleaseSha) &&
    plan.value.pendingHandoffAbsent === true &&
    plan.value.predecessorReleaseSha === PREDECESSOR.releaseSha &&
    plan.value.predecessorManifestSha256 === PREDECESSOR.manifestSha256 &&
    plan.value.predecessorExecutorSha256 === PREDECESSOR.executorSha256 &&
    plan.value.predecessorInstallerSha256 === PREDECESSOR.installerSha256 &&
    plan.value.operationId !== '9afc7218-4757-4f44-87e1-6096706bad44' &&
    Object.keys(plan.value.effects ?? {}).length === Object.keys(EFFECTS).length &&
    Object.entries(EFFECTS).every(([name, value]) => plan.value.effects?.[name] === value),
  'Intro plan identity or effect scope differs');
  for (const name of ['hostIdentitySha256', 'predecessorManifestSha256',
    'predecessorExecutorSha256', 'predecessorInstallerSha256',
    'oldActiveRecordSha256', 'oldHandoffPointerSha256', 'impactReceiptSha256',
    'finalAdmissionSha256', 'composeAdmissionSha256', 'sourceTransportSha256',
    'sourceReceiptSha256', 'sourceArchiveSha256', 'sourceRootManifestSha256',
    'productionControlTransportSha256', 'productionControlArchiveSha256',
    'composeTransportSha256', 'composeControlArchiveSha256',
    'introTransportReceiptSha256', 'introEntrySha256', 'introProgramSha256',
    'generationRootManifestSha256', 'generationSourceMapSha256']) {
    require(SHA.test(plan.value[name] ?? ''), `Intro plan ${name} differs`);
  }
  require(plan.value.sourceRootManifestSha256 === plan.value.generationRootManifestSha256 &&
    RELEASE.test(plan.value.sourceTreeSha) && UUID.test(plan.value.bootId) &&
    UUID.test(plan.value.introTransportOperationId) &&
    [plan.value.fullRunId, plan.value.sourceProducerRunId,
      plan.value.sourceArtifactId, plan.value.productionControlArtifactId,
      plan.value.composeArtifactId].every((value) => Number.isSafeInteger(value) && value > 0) &&
    [plan.value.fullRunAttempt, plan.value.sourceProducerRunAttempt].every((value) =>
      Number.isSafeInteger(value) && value > 0),
  'Intro plan producer/manifest/host identity differs');
  const absent=[...EXPECTED_DESTINATIONS,generationRoot,audit,
    `/var/lib/leetplus-compose/${plan.value.operationId}.standalone-intro.intent.json`,
    `${GENERATIONS}/.intro-${plan.value.operationId}.pending`,`${audit}/receipt.pending.json`];
  sameKeys(plan.value.destinationPreimages,absent,'signed INTRO V2 absent destinations');
  require(absent.every(name=>plan.value.destinationPreimages[name]==='ABSENT'),
    'INTRO V2 marker/effect preimage differs');
  sameKeys(plan.value.directoryPreimages, Object.keys(PARENT_MODES), 'signed parent directory preimages');
  const installedParents = {};
  for (const [directory, mode] of Object.entries(PARENT_MODES)) {
    const preimage = plan.value.directoryPreimages[directory];
    sameKeys(preimage, ['state', 'device', 'inode', 'uid', 'gid', 'mode'],
      'signed parent directory preimage');
    require(['ABSENT', 'EXACT'].includes(preimage.state) &&
      preimage.uid === 0 && preimage.gid === 0 && preimage.mode === mode &&
      ((preimage.state === 'ABSENT' && preimage.device === null && preimage.inode === null) ||
       (preimage.state === 'EXACT' && Number.isSafeInteger(preimage.device) &&
        Number.isSafeInteger(preimage.inode) && preimage.device > 0 && preimage.inode > 0)),
      'Signed parent directory preimage differs');
    const st = fs.lstatSync(directory, { bigint: true });
    require(st.isDirectory() && !st.isSymbolicLink() && st.uid === 0n && st.gid === 0n &&
      (st.mode & 0o7777n) === BigInt(mode), 'Installed parent directory identity differs');
    if (preimage.state === 'EXACT') {
      require(st.dev === BigInt(preimage.device) && st.ino === BigInt(preimage.inode),
        'Existing signed parent directory was replaced');
    }
    installedParents[directory] = {
      device: Number(st.dev), inode: Number(st.ino),
      uid: Number(st.uid), gid: Number(st.gid), mode: Number(st.mode & 0o7777n),
    };
  }
  const parentMap = Object.fromEntries(Object.entries(installedParents).sort(([a], [b]) => compareBytes(a, b)));
  require(digest(Buffer.from(canonical(parentMap))) === receipt.value.installedParentDirectoriesSha256,
    'Installed parent directory postimage differs');
  sameKeys(plan.value.anchorDirectories, ANCHOR_DIRS, 'signed existing anchor directories');
  const installedAnchors = {};
  for (const directory of ANCHOR_DIRS) {
    const expected = plan.value.anchorDirectories[directory];
    sameKeys(expected, ['device', 'inode', 'uid', 'gid', 'mode'],
      'signed existing anchor identity');
    const st = fs.lstatSync(directory, { bigint: true });
    require(st.isDirectory() && !st.isSymbolicLink() && st.uid === 0n &&
      (st.mode & 0o022n) === 0n && st.dev === BigInt(expected.device) &&
      st.ino === BigInt(expected.inode) && st.uid === BigInt(expected.uid) &&
      st.gid === BigInt(expected.gid) && (st.mode & 0o7777n) === BigInt(expected.mode),
    'Existing signed anchor directory was replaced');
    installedAnchors[directory] = {
      device: Number(st.dev), inode: Number(st.ino),
      uid: Number(st.uid), gid: Number(st.gid), mode: Number(st.mode & 0o7777n),
    };
  }
  const anchorMap = Object.fromEntries(Object.entries(installedAnchors).sort(([a], [b]) => compareBytes(a, b)));
  require(digest(Buffer.from(canonical(anchorMap))) === receipt.value.installedAnchorDirectoriesSha256,
    'Installed trusted anchor directory postimage differs');
  require(digest(readRegular('/etc/machine-id', 65536).toString('utf8').trim()) ===
    plan.value.hostIdentitySha256,
  'Installed intro host identity differs from signed plan');
  const transport = readRecord(`${TRANSPORT_AUDITS}/${plan.value.introTransportOperationId}/receipt.json`,
    'intro transport receipt');
  verifyTransport(plan.value, transport.raw, transport.value);
  sameKeys(intent.value, ['contract', 'operationId', 'planSha256',
    'approvalSha256', 'authorizedAt'], 'intro intent');
  require(intent.value.contract === INTENT && intent.value.operationId === plan.value.operationId &&
    intent.value.planSha256 === digest(plan.raw) &&
    intent.value.approvalSha256 === digest(envelope.raw),
  'Intro intent does not bind plan/approval');
  sameKeys(receipt.value, ['contract', 'decision', 'operationId', 'planSha256',
    'approvalSha256', 'intentSha256', 'generationReceiptSha256',
    'generationRootManifestSha256', 'installedDestinationsSha256',
    'installedParentDirectoriesSha256', 'installedAnchorDirectoriesSha256',
    'predecessorPostimageSha256', 'acceptedAt'], 'intro receipt');
  require(receipt.value.contract === RECEIPT && receipt.value.decision === 'PASS' &&
    receipt.value.operationId === plan.value.operationId &&
    receipt.value.planSha256 === digest(plan.raw) &&
    receipt.value.approvalSha256 === digest(envelope.raw) &&
    receipt.value.intentSha256 === digest(intent.raw) &&
    receipt.value.generationRootManifestSha256 === plan.value.generationRootManifestSha256 &&
    receipt.value.predecessorPostimageSha256 === digest(Buffer.from(canonical({
      oldCorePointer: plan.value.oldCorePointer,
      predecessorManifestSha256: plan.value.predecessorManifestSha256,
      oldActiveRecordSha256: plan.value.oldActiveRecordSha256,
      oldHandoffPointerSha256: plan.value.oldHandoffPointerSha256,
      pendingHandoffAbsent: true,
    }))),
  'Intro receipt lineage differs');
  verifyApproval(plan.raw, plan.value, envelope.value,
    intent.value.authorizedAt, receipt.value.acceptedAt);
  const generation = verifyGeneration(release, plan.value,
    digest(plan.raw), digest(envelope.raw), digest(intent.raw));
  require(digest(generation.generation.raw) === receipt.value.generationReceiptSha256 &&
    canonicalTime(generation.generation.value.installedAt) <=
      canonicalTime(receipt.value.acceptedAt),
  'Intro receipt does not bind installed generation');
  sameKeys(plan.value.dormantDestinations,
    EXPECTED_DESTINATIONS, 'signed dormant destination map');
  const installed = {};
  for (const destination of EXPECTED_DESTINATIONS) {
    const expected = plan.value.dormantDestinations[destination];
    sameKeys(expected, ['sha256', 'mode', 'uid', 'gid'], 'dormant destination');
    require(SHA.test(expected.sha256) && expected.uid === 0 && expected.gid === 0 &&
      expected.mode === DESTINATION_MODES[destination],
    'Dormant destination identity differs');
    const raw = readRegular(destination, MAX_LEAF, expected.mode);
    require(digest(raw) === expected.sha256,
      'Dormant installed bytes differ from signed intro plan');
    installed[destination] = expected;
  }
  const sortedInstalled = Object.fromEntries(Object.entries(installed).sort(([a], [b]) => compareBytes(a, b)));
  require(digest(Buffer.from(canonical(sortedInstalled))) === receipt.value.installedDestinationsSha256 &&
    plan.value.dormantDestinations[VERIFIER].sha256 === generation.verifierSourceSha &&
    plan.value.dormantDestinations[WRAPPER].sha256 ===
      digest(readRegular(`${generation.root}/payload/docs/deployment/production-artifact/install_predecessor_bootstrap.py`,
        MAX_LEAF, 0o400)) &&
    plan.value.dormantDestinations[LAUNCHER].sha256 ===
      digest(readRegular(`${generation.root}/payload/docs/deployment/production-artifact/trusted_predecessor_bootstrap_launcher.py`,
        MAX_LEAF, 0o400)) &&
    plan.value.dormantDestinations[LAYOUT].sha256 ===
      digest(readRegular(`${generation.root}/payload/docs/deployment/production-artifact/bootstrap-install-layout.json`,
        MAX_LEAF, 0o400)),
  'Dormant installed entrypoint differs from immutable generation');
  const verifierSourceSha = digest(readRegular(VERIFIER, MAX_LEAF, 0o555));
  require(verifierSourceSha === generation.verifierSourceSha,
    'Running verifier source differs from signed generation');
  const sourceFiles=Object.fromEntries([...SOURCE_FILES,'SHA256SUMS'].sort(compareBytes)
    .map(name=>[name,digest(readRegular(`${generation.root}/payload/${name}`,MAX_LEAF,0o400))]));
  verifyIntroFinalize(plan.value,plan.raw,envelope.raw,intent.raw,receipt.raw,{
    generationReceiptSha256:digest(generation.generation.raw),sourceFiles,
    destinations:sortedInstalled,parents:parentMap,anchors:anchorMap,
    predecessorPostimageSha256:receipt.value.predecessorPostimageSha256,markerSha256:digest(receipt.raw)});
  return {
    contract: CONTRACT, decision: 'PASS', sourceRelease: release,
    introPlanSha256: digest(plan.raw), introReceiptSha256: digest(receipt.raw),
    generationRootManifestSha256: generation.manifestSha,
    generationReceiptSha256: digest(generation.generation.raw), verifierSourceSha256: verifierSourceSha,
  };
}

if (process.argv.length !== 4 || process.argv[2] !== '--source-release') {
  fail('Usage: verifier --source-release <exact40hex>');
}
require(process.platform === 'linux' && typeof process.getuid === 'function' &&
  process.getuid() === 0 && process.versions.node.split('.')[0] === '22',
'Exact Linux root Node 22 verifier required');
require(process.argv[1] === VERIFIER, 'Only the fixed minimal verifier entry is supported');
for (const name of Object.keys(process.env)) {
  require(!/^(?:NODE_|LD_|DYLD_)/u.test(name) &&
    !['BASH_ENV', 'ENV', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy',
      'https_proxy', 'all_proxy', 'OPENSSL_CONF', 'OPENSSL_MODULES'].includes(name),
  'Unsafe inherited verifier environment');
}
if (process.execArgv.length) {
  require(process.execArgv.length === 1 && process.execArgv[0] === '--input-type=module',
  'Unsupported verifier runtime flags');
}
const output = verifyIntro(process.argv[3]);
process.stdout.write(canonical(output));
