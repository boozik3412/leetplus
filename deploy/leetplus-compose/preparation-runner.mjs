/**
 * Crash-safe, non-authorizing preparation for the installed Compose control.
 *
 * The runner owns preparation only. It never accepts an approval and never
 * invokes native apply/resume. Network acquisition, Windows off-host
 * authentication/extraction and restored-clone browser work publish receipts for
 * this Linux process to wait for and validate.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile as childExecFile, spawnSync } from 'node:child_process';
import { canonical, digest, release as validateRelease } from './contract.mjs';
import { verifyResourceAcceptance } from './resource-budget.mjs';
import { validateCurrentWorkerContinuation, validateWorkerContinuationPolicy } from './worker-continuation.mjs';

export const CONTRACT = 'LEETPLUS_RELEASE_PREPARATION_V1';
export const GO_PACKET_CONTRACT = `${CONTRACT}_GO_PACKET`;
export const PHASES = ['ADMISSION', 'CONTROL_STAGE', 'IMAGE_STAGE', 'BACKUP', 'OFFHOST_IMPORT', 'PREPARE_FILES', 'RESTORE', 'BROWSER', 'ACCEPT', 'RESOURCE', 'NATIVE_PREPARE'];
const SHA = /^[a-f0-9]{64}$/;
const RELEASE = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const WORKERS = ['bonus-ledger-worker', 'langame-daily-worker'];
const demand = (value, message) => { if (!value) throw new Error(message); return value; };

function jsonBytes(value) { return Buffer.from(canonical(value)); }
function readJson(file, limit = 16 * 1024 * 1024) {
  const expected = safeRegular(file), fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const actual = fs.fstatSync(fd);
    demand(actual.dev === expected.dev && actual.ino === expected.ino && actual.size <= limit, `JSON identity changed while opening: ${file}`);
    return JSON.parse(fs.readFileSync(fd, 'utf8'));
  } finally { fs.closeSync(fd); }
}
function readBytes(file, limit = 16 * 1024 * 1024) {
  const expected = safeRegular(file), fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try { const actual = fs.fstatSync(fd); demand(actual.dev === expected.dev && actual.ino === expected.ino && actual.size <= limit, `File identity changed while opening: ${file}`); return fs.readFileSync(fd); }
  finally { fs.closeSync(fd); }
}
function safeRegular(file, forceTrusted = false) {
  const stat = fs.lstatSync(file);
  demand(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, `Unsafe file: ${file}`);
  if (process.platform === 'linux' && process.getuid?.() === 0 && (forceTrusted || process.env.LEETPLUS_PREPARATION_LOCKED === '1')) {
    demand(stat.uid === 0 && !(stat.mode & 0o022), `Untrusted writable/root ownership: ${file}`);
    for (let parent = path.dirname(file); ; parent = path.dirname(parent)) {
      const ancestor = fs.lstatSync(parent);
      demand(ancestor.isDirectory() && !ancestor.isSymbolicLink() && ancestor.uid === 0 && !(ancestor.mode & 0o022), `Untrusted file ancestor: ${parent}`);
      if (parent === '/') break;
    }
  }
  return stat;
}
function linuxDeviceIdentity(device) {
  const value = BigInt(device), major = ((value >> 8n) & 0xfffn) | ((value >> 32n) & 0xfffff000n), minor = (value & 0xffn) | ((value >> 12n) & 0xffffff00n);
  return `${major.toString(16).padStart(2, '0')}:${minor.toString(16)}`;
}
// Deliberately bounded-memory: image archives and backup material are multi-GB.
export function fileDigest(file) {
  const expected = safeRegular(file);
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  const block = Buffer.allocUnsafe(1024 * 1024);
  try { const actual = fs.fstatSync(fd); demand(actual.dev === expected.dev && actual.ino === expected.ino, `File identity changed while hashing: ${file}`); for (;;) { const length = fs.readSync(fd, block, 0, block.length, null); if (!length) break; hash.update(block.subarray(0, length)); } }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function syncDir(directory) {
  let fd;
  try { fd = fs.openSync(directory, 'r'); fs.fsyncSync(fd); }
  catch (error) { if (!['EINVAL', 'EPERM', 'EISDIR'].includes(error.code)) throw error; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
export function ensurePrivateTree(base, target, { requireRoot = process.platform === 'linux' } = {}) {
  const root = path.resolve(base), destination = path.resolve(target);
  demand(destination === root || destination.startsWith(`${root}${path.sep}`), 'Private state target escapes its fixed root');
  const check = (directory, privateComponent) => {
    const stat = fs.lstatSync(directory);
    demand(stat.isDirectory() && !stat.isSymbolicLink() && (!requireRoot || stat.uid === 0) && !(stat.mode & (privateComponent ? 0o077 : 0o022)), `Untrusted private state directory: ${directory}`);
  };
  check(root, false);
  let current = root;
  for (const component of path.relative(root, destination).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (!fs.existsSync(current)) { fs.mkdirSync(current, { mode: 0o700 }); syncDir(path.dirname(current)); }
    check(current, true);
  }
  return destination;
}
function publishBytes(file, bytes, mode = 0o400) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (fs.existsSync(file)) { demand(fs.readFileSync(file).equals(bytes), `Immutable publication conflict: ${file}`); return; }
  const temporary = `${file}.publishing-${crypto.randomUUID()}`;
  const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), mode);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try {
    fs.linkSync(temporary, file); // atomic no-replace publication
    fs.chmodSync(file, mode);
    syncDir(path.dirname(file));
  } catch (error) {
    if (error.code !== 'EEXIST' || !fs.readFileSync(file).equals(bytes)) throw error;
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function publishJson(file, value, mode = 0o400) { publishBytes(file, jsonBytes(value), mode); }
function exactKeys(value, keys, label) { demand(value && Object.keys(value).sort().join(',') === [...keys].sort().join(','), `Invalid ${label} fields`); }
function parseTime(value, label) { const parsed = Date.parse(value ?? ''); demand(Number.isFinite(parsed), `Invalid ${label} timestamp`); return parsed; }
function expectedFile(receipt, leaf, file) {
  const record = receipt.files?.[leaf];
  demand(SHA.test(record?.sha256 ?? '') && Number.isSafeInteger(record.bytes) && record.bytes >= 0, `Receipt is missing ${leaf}`);
  demand(safeRegular(file).size === record.bytes && fileDigest(file) === record.sha256, `Downloaded ${leaf} bytes differ from receipt`);
}
function executor(command, args, options) {
  return new Promise(resolve => childExecFile(command, args, options, (error, stdout, stderr) => resolve({
    exitCode: error ? (Number.isInteger(error.code) ? error.code : null) : 0,
    signal: error?.signal ?? null,
    errorCode: error && !Number.isInteger(error.code) ? error.code : null,
    stdout: stdout ?? error?.stdout ?? '', stderr: stderr ?? error?.stderr ?? '',
  })));
}

export function validateInput(input) {
  demand(input?.contract === CONTRACT, 'Invalid preparation contract');
  const paths = ['releaseJson', 'admissionJson', 'imagesArchive', 'controlArchive', 'transportValidation', 'archiveRoundtrip', 'networkValidation', 'downloadReceipt', 'offhostReceipt', 'backupVerificationReceipt', 'restoreImportReceipt', 'browserReceipt'];
  for (const key of paths) demand(typeof input[key] === 'string' && path.isAbsolute(input[key]) && path.normalize(input[key]) === input[key], `Missing canonical absolute ${key}`);
  demand(['blue', 'green'].includes(input.targetSlot), 'Invalid target slot');
  demand(SHA.test(input.downloadInputSha256 ?? '') && /^[1-9][0-9]*$/.test(String(input.downloadArtifactId ?? '')), 'Exact downloader input/artifact binding required');
  demand(input.wait?.pollIntervalMs >= 5000 && input.wait.pollIntervalMs <= 10000 && Number.isFinite(Date.parse(input.wait.deadline)), 'Wait polling must be 5-10 seconds with an exact deadline');
  demand(input.nativeRequest && typeof input.nativeRequest === 'object' && !Array.isArray(input.nativeRequest), 'Missing native request');
  for (const forbidden of ['contract', 'operationId', 'hostIdentitySha256', 'controlSha256', 'previous', 'generation', 'action', 'targetSlot', 'admissionSha256', 'archiveSha256', 'backupReceiptSha256', 'rehearsalReceiptSha256', 'preparationEvidenceExpiresAt', 'dataRelease', 'dataAdmissionSha256', 'secretDigests', 'networkPolicySha256', 'databaseIdentitySha256', 'composeSha256', 'resourceBudget']) demand(!Object.hasOwn(input.nativeRequest, forbidden), `Native request must not pre-set ${forbidden}`);
  demand(!Object.hasOwn(input, 'approval') && !Object.hasOwn(input, 'approvalTtlExtension') && !Object.hasOwn(input, 'expiresAt'), 'Preparation accepts no deployment authorization or TTL extension');
  const guard = input.nativeRequest.preparationGuard;
  exactKeys(guard, ['contract', 'hostIdentitySha256', 'controllerManifestSha256', 'activeSha256', 'generation', 'activeSlot'], 'preparation guard');
  demand(guard.contract === 'LEETPLUS_PREPARATION_GUARD_V1' && [guard.hostIdentitySha256, guard.controllerManifestSha256, guard.activeSha256].every(x => SHA.test(x)) && Number.isSafeInteger(guard.generation) && guard.generation >= 0 && ['blue', 'green'].includes(guard.activeSlot), 'Invalid fresh host/generation guard');
  demand(guard.activeSlot !== input.targetSlot, 'Target must be the inactive slot from the guarded generation');
  const policy = input.nativeRequest.workerContinuation;
  validateWorkerContinuationPolicy(policy);
  demand(policy.forward.generation === guard.generation + 1 && policy.forward.releaseSha === input.nativeRequest[input.targetSlot].releaseSha && policy.rollback.generation === guard.generation + 2 && policy.rollback.releaseSha === input.nativeRequest[guard.activeSlot].releaseSha, 'Worker continuation target/rollback generation or release drift');
  return input;
}

export function validateAdmission(input) {
  const download = readJson(input.downloadReceipt);
  demand(download.contract === 'LEETPLUS_RELEASE_DOWNLOAD_V1' && download.decision === 'PASS', 'Download receipt is not PASS');
  demand(SHA.test(download.intentSha256 ?? '') && SHA.test(download.remoteSha256 ?? '') && download.inputSha256 === input.downloadInputSha256 && String(download.artifactId) === String(input.downloadArtifactId), 'Download provenance receipt drift');
  for (const [leaf, file] of [['release.json', input.releaseJson], ['docker-admission.json', input.admissionJson], ['images.tar.gz', input.imagesArchive], ['control.tar.gz', input.controlArchive], ['transport-validation.json', input.transportValidation], ['archive-roundtrip.json', input.archiveRoundtrip], ['network-validation.json', input.networkValidation]]) expectedFile(download, leaf, file);
  const release = readJson(input.releaseJson), admission = readJson(input.admissionJson);
  validateRelease(release);
  validateRelease(input.nativeRequest.blue); validateRelease(input.nativeRequest.green);
  demand(RELEASE.test(release.releaseSha ?? ''), 'Invalid release SHA');
  demand(download.releaseSha === release.releaseSha, 'Download receipt release drift');
  if (process.env.LEETPLUS_PREPARATION_LOCKED === '1') {
    const inbox = `/srv/leetplus/inbox/${release.releaseSha}`;
    for (const file of [input.releaseJson, input.admissionJson, input.imagesArchive, input.controlArchive, input.transportValidation, input.archiveRoundtrip, input.networkValidation]) demand(path.dirname(file) === inbox, 'Downloaded bundle must be transferred into the exact release inbox');
  }
  demand(canonical(input.nativeRequest[input.targetSlot]) === canonical(release), 'Native target release differs from the admitted bundle');
  demand(admission.contract === 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION' && admission.decision === 'PASS' && admission.event === 'push' && admission.ref === 'refs/heads/main' && admission.repository === 'boozik3412/leetplus', 'Admission is not exact-main PASS');
  demand(String(download.runId) === String(admission.runId) && String(download.runAttempt) === String(admission.runAttempt) && digest({ contract: 'LEETPLUS_RELEASE_DOWNLOAD_V1', releaseSha: release.releaseSha, admissionSha256: fileDigest(input.admissionJson), runId: String(admission.runId), runAttempt: String(admission.runAttempt), artifactId: String(input.downloadArtifactId) }) === input.downloadInputSha256, 'Downloader input/run/attempt provenance mismatch');
  demand(admission.releaseSha === release.releaseSha && fileDigest(input.releaseJson) === admission.releaseManifestSha256, 'Admission/release binding drift');
  demand(fileDigest(input.imagesArchive) === admission.archiveSha256 && fileDigest(input.controlArchive) === admission.controlArchiveSha256 && fileDigest(input.transportValidation) === admission.transportValidationSha256 && fileDigest(input.archiveRoundtrip) === admission.archiveRoundtripSha256 && fileDigest(input.networkValidation) === admission.networkValidationSha256 && canonical(admission.images) === canonical(release.images), 'Downloaded admission-bound evidence drift');
  const transport = readJson(input.transportValidation), roundtrip = readJson(input.archiveRoundtrip), network = readJson(input.networkValidation);
  demand(transport.decision === 'PASS' && transport.tlsRequired === true && transport.badCaRejected === true && transport.badHostnameRejected === true && transport.nativeWorkerProfileAccepted === true, 'Transport validation is not PASS');
  demand(roundtrip.decision === 'PASS' && roundtrip.isolatedDaemon === true && canonical(roundtrip.images) === canonical(release.images), 'Archive roundtrip validation is not PASS');
  demand(network.decision === 'PASS' && ['stoppedCreation', 'loopbackHttp', 'webToApi', 'apiToData', 'webDataDenied', 'hostProxyDenied', 'externalDenied'].every(key => network[key] === true), 'Network validation is not PASS');
  return { releaseSha: release.releaseSha, admissionSha256: fileDigest(input.admissionJson), archiveSha256: fileDigest(input.imagesArchive), controlArchiveSha256: fileDigest(input.controlArchive), downloadReceiptSha256: fileDigest(input.downloadReceipt) };
}

function phaseEnvelope(runner, name, intent, result) {
  const completedAt = runner.clock(), detectedAt = result.detectedAt ?? completedAt;
  return { contract: `${CONTRACT}_RECEIPT`, phase: name, decision: 'PASS', inputSha256: runner.inputDigest, intentSha256: fileDigest(intent), previousReceiptSha256: runner.previousReceiptDigest(name), completedAt, detectedAt,
    producerCompletedAt: result.actualCompletedAt ?? null,
    producerPublicationTimeProxy: result.publicationTimeProxy ?? null,
    producerCompletionTimeBasis: result.completionTimeBasis ?? (result.actualCompletedAt ? 'PRODUCER_TIMESTAMP' : 'UNAVAILABLE'), result };
}

export class PreparationRunner {
  constructor(input, stateDir, { execute = executor, clock = () => new Date().toISOString(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), paths = {}, workerBusy = null } = {}) {
    this.input = validateInput(input); this.stateDir = path.resolve(stateDir); this.execute = execute; this.clock = clock; this.sleep = sleep; this.workerBusy = workerBusy;
    this.paths = { rehearsalRoot: '/srv/leetplus-migration/rehearsal', rehearsalInputRoot: '/srv/leetplus-migration/rehearsal/input', preparation: '/srv/leetplus-migration/rehearsal/preparation.json', backup: '/srv/leetplus/backups/export/latest.json', restore: '/srv/leetplus-migration/rehearsal/evidence/restore.json', acceptance: '/srv/leetplus-migration/rehearsal/evidence/runtime-acceptance.json', nativeOperations: '/var/lib/leetplus-compose/operations', machineId: '/etc/machine-id', procLocks: '/proc/locks', controlState: '/var/lib/leetplus-compose', productionRoot: '/srv/leetplus', workerPublicKey: '/etc/leetplus-compose/approval-root.pem', controlCommand: '/usr/local/sbin/leetplus-compose', candidateControlRoot: '/usr/local/lib/leetplus-compose', preparationLock: '/var/lib/leetplus-compose/preparation-runner.lock', servingControlRoot: null, ...paths };
    if (process.env.LEETPLUS_PREPARATION_LOCKED === '1') ensurePrivateTree('/var/lib/leetplus-compose', this.stateDir);
    else fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    const state = fs.lstatSync(this.stateDir);
    demand(state.isDirectory() && !state.isSymbolicLink() && (process.platform !== 'linux' || process.getuid?.() !== 0 || (state.uid === 0 && !(state.mode & 0o077))), 'Root-private preparation state directory required');
    this.inputDigest = digest(input);
    publishJson(path.join(this.stateDir, 'input.json'), input);
    const startPath = path.join(this.stateDir, 'operation-start.json');
    if (!fs.existsSync(startPath)) publishJson(startPath, { contract: `${CONTRACT}_START`, inputSha256: this.inputDigest, startedAt: this.clock(), deadline: this.input.wait.deadline });
    const start = readJson(startPath), startedAt = parseTime(start.startedAt, 'operation start'), deadline = parseTime(start.deadline, 'wait deadline');
    demand(start.contract === `${CONTRACT}_START` && start.inputSha256 === this.inputDigest && start.deadline === this.input.wait.deadline && deadline > startedAt && deadline - startedAt <= 4 * 3600_000, 'Preparation deadline must be one immutable bounded window of at most four hours');
    this.validateDurableChain();
  }
  phasePath(name) { return path.join(this.stateDir, `${String(PHASES.indexOf(name) + 1).padStart(2, '0')}-${name}.receipt.json`); }
  intentPath(name) { return path.join(this.stateDir, `${String(PHASES.indexOf(name) + 1).padStart(2, '0')}-${name}.intent.json`); }
  readPhase(name) { const file = this.phasePath(name); return fs.existsSync(file) ? readJson(file) : null; }
  previousReceiptDigest(name) { const index = PHASES.indexOf(name); return index === 0 ? null : fileDigest(this.phasePath(PHASES[index - 1])); }
  validateDurableChain() {
    let prior = null, gap = false;
    for (const phase of PHASES) {
      const file = this.phasePath(phase);
      if (!fs.existsSync(file)) { gap = true; continue; }
      demand(!gap, `Durable receipt ${phase} has a phase-order gap`);
      const receipt = readJson(file);
      demand(receipt.contract === `${CONTRACT}_RECEIPT` && receipt.phase === phase && receipt.decision === 'PASS' && receipt.inputSha256 === this.inputDigest && receipt.previousReceiptSha256 === prior && SHA.test(receipt.intentSha256 ?? ''), `Invalid immutable receipt chain at ${phase}`);
      demand(fs.existsSync(this.intentPath(phase)) && fileDigest(this.intentPath(phase)) === receipt.intentSha256, `Intent binding drift at ${phase}`);
      prior = fileDigest(file);
    }
  }
  acquireLock() {
    const file = this.paths.preparationLock;
    if (process.platform === 'linux' && process.getuid?.() === 0 && file === '/var/lib/leetplus-compose/preparation-runner.lock') {
      demand(process.env.LEETPLUS_PREPARATION_LOCKED === '1', 'Use the preparation runner CLI kernel-lock bootstrap');
      const lock = safeRegular(file), lines = fs.readFileSync('/proc/locks', 'utf8').split('\n');
      demand(lines.some(line => { const fields = line.trim().split(/\s+/), identity = fields[5]?.split(':'); return fields[1] === 'FLOCK' && fields[3] === 'WRITE' && fields[4] === String(process.pid) && identity?.slice(0, 2).join(':') === linuxDeviceIdentity(lock.dev) && identity?.at(-1) === String(lock.ino); }), 'Runner process does not hold the global preparation kernel lock');
      return () => {};
    }
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const owner = { pid: process.pid, host: os.hostname(), acquiredAt: this.clock(), nonce: crypto.randomUUID() };
    try { const fd = fs.openSync(file, 'wx', 0o600); try { fs.writeFileSync(fd, jsonBytes(owner)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Another preparation client holds the global preparation lock'); throw error; }
    return () => { try { const current = readJson(file); if (current.nonce === owner.nonce) { fs.unlinkSync(file); syncDir(path.dirname(file)); } } catch {} };
  }
  async command(label, command, args, timeout = 600_000) {
    const directory = path.join(this.stateDir, 'commands'); fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const prefix = `${String(fs.readdirSync(directory).filter(x => x.endsWith('.exit.json')).length + 1).padStart(3, '0')}-${label}`;
    let result;
    try { result = await this.execute(command, args, { timeout, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }); }
    catch (error) { result = { exitCode: Number.isInteger(error.code) ? error.code : null, signal: error.signal ?? null, errorCode: Number.isInteger(error.code) ? null : (error.code ?? 'EXECUTOR_ERROR'), stdout: error.stdout ?? '', stderr: error.stderr ?? '' }; }
    const normalized = { exitCode: result.exitCode ?? (result.code ?? 0), signal: result.signal ?? null, errorCode: result.errorCode ?? null };
    publishBytes(path.join(directory, `${prefix}.stdout`), Buffer.from(String(result.stdout ?? '')), 0o400);
    publishBytes(path.join(directory, `${prefix}.stderr`), Buffer.from(String(result.stderr ?? '')), 0o400);
    publishJson(path.join(directory, `${prefix}.exit.json`), { command: path.basename(command), argsSha256: digest(args), completedAt: this.clock(), ...normalized });
    demand(normalized.exitCode === 0 && normalized.signal === null && normalized.errorCode === null, `${label} command failed (${normalized.exitCode ?? normalized.signal ?? normalized.errorCode})`);
    return String(result.stdout ?? '').trim();
  }
  async waitFor(label, probe) {
    const deadline = parseTime(this.input.wait.deadline, 'wait deadline');
    for (;;) {
      const result = await probe();
      if (result) return { ...result, detectedAt: this.clock() };
      demand(Date.parse(this.clock()) < deadline, `${label} is BLOCKED at its fixed deadline; inspect the external/native receipt`);
      await this.sleep(this.input.wait.pollIntervalMs);
    }
  }
  beginIntent(name) {
    const file = this.intentPath(name);
    if (fs.existsSync(file)) {
      const value = readJson(file);
      demand(value.contract === `${CONTRACT}_INTENT` && value.phase === name && value.inputSha256 === this.inputDigest && value.previousReceiptSha256 === this.previousReceiptDigest(name), `Immutable intent drift at ${name}`);
      return file;
    }
    publishJson(file, { contract: `${CONTRACT}_INTENT`, phase: name, inputSha256: this.inputDigest, previousReceiptSha256: this.previousReceiptDigest(name), startedAt: this.clock() });
    return file;
  }
  async phase(name, effect, reconcile) {
    const index = PHASES.indexOf(name);
    for (const predecessor of PHASES.slice(0, index)) demand(this.readPhase(predecessor), `Phase ${name} cannot bypass ${predecessor}`);
    const existing = this.readPhase(name); if (existing) return existing;
    const attempted = path.join(this.stateDir, `.attempted-${name}`);
    if (!fs.existsSync(attempted)) {
      let expires = parseTime(this.input.wait.deadline, 'wait deadline');
      if (fs.existsSync(this.input.backupVerificationReceipt)) expires = Math.min(expires, parseTime(readJson(this.input.backupVerificationReceipt).effectiveExpiresAt, 'authenticated backup expiry'));
      demand(Date.parse(this.clock()) <= expires, `Preparation evidence expired before new ${name} effect`);
    }
    const intent = this.beginIntent(name);
    let result;
    if (fs.existsSync(attempted)) {
      result = await reconcile();
      demand(result, `Phase ${name} has an uncertain prior effect and no accepted receipt; BLOCKED without replay`);
    } else {
      publishJson(attempted, { intentSha256: fileDigest(intent), attemptedAt: this.clock() }, 0o400);
      try { result = await effect(); }
      catch (error) { const accepted = await reconcile(); if (!accepted) throw error; result = accepted; }
    }
    publishJson(this.phasePath(name), phaseEnvelope(this, name, intent, result));
    return this.readPhase(name);
  }
  readAdmission() { const value = this.readPhase('ADMISSION')?.result; demand(value?.releaseSha, 'Missing admitted release receipt'); return value; }
  validatePreparation() {
    if (!fs.existsSync(this.paths.preparation)) return null;
    const value = readJson(this.paths.preparation), admitted = this.readAdmission(), imported = this.readPhase('OFFHOST_IMPORT').result;
    demand(value.contract === 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_PREPARATION' && value.decision === 'PREPARED_NOT_SERVING' && value.rehearsal === true && value.releaseSha === admitted.releaseSha && value.sourceConfigurationSha256 === imported.sourceCapsuleSha256, 'Preparation controller receipt drift');
    return { releaseSha: admitted.releaseSha, preparationSha256: fileDigest(this.paths.preparation), actualCompletedAt: value.createdAt };
  }
  validateBackup(intent) {
    if (!fs.existsSync(this.paths.backup)) return null;
    const value = readJson(this.paths.backup), started = parseTime(readJson(intent).startedAt, 'backup intent');
    demand(value.contract === 'LEETPLUS_BACKUP_EXPORT_V1' && SHA.test(value.sha256 ?? '') && Number.isSafeInteger(value.bytes) && value.bytes > 0 && parseTime(value.capturedAt, 'backup') >= started, 'Backup receipt is not fresh and complete');
    return { releaseSha: this.readAdmission().releaseSha, exportReceipt: value, exportReceiptSha256: fileDigest(this.paths.backup), sourceCapturedAt: value.capturedAt, actualCompletedAt: null, publicationTimeProxy: safeRegular(this.paths.backup).mtime.toISOString(), completionTimeBasis: 'RECEIPT_PUBLICATION_MTIME_PROXY' };
  }
  validateOffhostImport() {
    if (![this.input.offhostReceipt, this.input.backupVerificationReceipt, this.input.restoreImportReceipt].every(fs.existsSync)) return null;
    const backup = this.readPhase('BACKUP').result.exportReceipt;
    const offhost = readJson(this.input.offhostReceipt), verification = readJson(this.input.backupVerificationReceipt), imported = readJson(this.input.restoreImportReceipt);
    demand(offhost.contract === 'LEETPLUS_BACKUP_EXPORT_V1' && offhost.decision === 'OFFHOST_BYTES_VERIFIED' && offhost.sha256 === backup.sha256 && offhost.bytes === backup.bytes && offhost.capturedAt === backup.capturedAt && SHA.test(offhost.plaintextSha256 ?? ''), 'Off-host bytes do not bind the fresh export');
    const guard = this.input.nativeRequest.preparationGuard;
    demand(verification.decision === 'AUTHENTICATED_APPLICATION_BACKUP_PASS' && verification.backupSha256 === backup.sha256 && verification.plaintextSha256 === offhost.plaintextSha256 && verification.generation === guard.generation && verification.sourceHostIdentitySha256 === guard.hostIdentitySha256 && verification.sourceControllerManifestSha256 === guard.controllerManifestSha256 && verification.sourceActiveSha256 === guard.activeSha256 && verification.sourceAppSha === this.input.nativeRequest[guard.activeSlot].releaseSha, 'Authenticated backup source/host/controller/generation binding drift');
    demand(parseTime(verification.effectiveExpiresAt, 'authenticated backup expiry') >= Date.parse(this.clock()), 'Authenticated backup evidence expired; polling deadline cannot extend it');
    demand(imported.contract === 'LEETPLUS_PREPARATION_RESTORE_IMPORT_V1' && imported.decision === 'PASS' && imported.backupSha256 === backup.sha256 && imported.plaintextSha256 === offhost.plaintextSha256, 'Restore import is not bound to authenticated off-host bytes');
    const expectedPaths = { manifestPath: 'restore-manifest.json', dumpPath: 'leetplus.dump', globalsPath: 'globals.sql', sourceCapsulePath: 'rehearsal-source-capsule.tar' };
    for (const [key, leaf] of Object.entries(expectedPaths)) demand(imported[key] === path.join(this.paths.rehearsalInputRoot, leaf), `Restore import has noncanonical ${key}`);
    exactKeys(imported.derivationIdentity, ['verificationSha256', 'capsuleSha256', 'preparationInputSha256'], 'derivation identity');
    demand(imported.derivationIdentity.verificationSha256 === verification.sourceVerificationSha256 && imported.derivationIdentity.capsuleSha256 === offhost.plaintextSha256 && imported.derivationIdentity.preparationInputSha256 === this.inputDigest && digest(imported.derivationIdentity) === imported.derivationInputSha256 && imported.backupVerificationSha256 === fileDigest(this.input.backupVerificationReceipt), 'Restore derivation provenance drift');
    const manifest = readJson(imported.manifestPath);
    demand(['LEETPLUS_DAILY_BACKUP_V1', 'LEETPLUS_MIGRATION_BACKUP_V1'].includes(manifest.contract) && manifest.sourceReleaseSha === verification.sourceAppSha && manifest.sourceReleaseSha === this.input.nativeRequest[guard.activeSlot].releaseSha, 'Restore manifest lacks the authenticated source release binding');
    for (const [leaf, file] of [['leetplus.dump', imported.dumpPath], ['globals.sql', imported.globalsPath]]) expectedFile(manifest, leaf, file);
    demand(fileDigest(imported.manifestPath) === imported.manifestSha256 && fileDigest(imported.dumpPath) === imported.dumpSha256 && fileDigest(imported.globalsPath) === imported.globalsSha256 && fileDigest(imported.sourceCapsulePath) === imported.sourceCapsuleSha256, 'Restore import digest chain drift');
    const completed = parseTime(imported.completedAt, 'restore import completion');
    demand(completed >= parseTime(backup.capturedAt, 'backup capture') && completed <= parseTime(this.input.wait.deadline, 'wait deadline'), 'Restore import completion is outside the preparation window');
    return { releaseSha: this.readAdmission().releaseSha, offhostSha256: fileDigest(this.input.offhostReceipt), verificationSha256: fileDigest(this.input.backupVerificationReceipt), importSha256: fileDigest(this.input.restoreImportReceipt), derivationInputSha256: imported.derivationInputSha256, manifestPath: imported.manifestPath, dumpPath: imported.dumpPath, globalsPath: imported.globalsPath, sourceCapsulePath: imported.sourceCapsulePath, sourceCapsuleSha256: imported.sourceCapsuleSha256, sourceReleaseSha: manifest.sourceReleaseSha, actualCompletedAt: imported.completedAt };
  }
  validateRestore() {
    if (!fs.existsSync(this.paths.restore)) return null;
    const value = readJson(this.paths.restore), imported = this.readPhase('OFFHOST_IMPORT').result;
    demand(value.decision === 'DATABASE_RESTORE_PASS' && value.releaseSha === this.readAdmission().releaseSha && value.sourceReleaseSha === imported.sourceReleaseSha && value.sourceDumpSha256 === fileDigest(imported.dumpPath), 'Restored-copy receipt drift');
    return { releaseSha: value.releaseSha, restoreReceiptSha256: fileDigest(this.paths.restore), sourceReleaseSha: value.sourceReleaseSha, actualCompletedAt: value.completedAt ?? value.restoredAt, publicationTimeProxy: value.completedAt || value.restoredAt ? null : safeRegular(this.paths.restore).mtime.toISOString(), completionTimeBasis: value.completedAt || value.restoredAt ? 'PRODUCER_TIMESTAMP' : 'RECEIPT_PUBLICATION_MTIME_PROXY' };
  }
  validateAcceptance() {
    if (!fs.existsSync(this.paths.acceptance)) return null;
    const value = readJson(this.paths.acceptance), release = readJson(this.input.releaseJson);
    demand(value.decision === 'PASS' && value.releaseSha === release.releaseSha && value.sourceDumpSha256 === readJson(this.paths.restore).sourceDumpSha256, 'API acceptance receipt drift');
    if (release.apiResourceProfile) verifyResourceAcceptance(value, release);
    return { releaseSha: release.releaseSha, acceptanceReceiptSha256: fileDigest(this.paths.acceptance), actualCompletedAt: value.completedAt ?? value.acceptedAt, publicationTimeProxy: value.completedAt || value.acceptedAt ? null : safeRegular(this.paths.acceptance).mtime.toISOString(), completionTimeBasis: value.completedAt || value.acceptedAt ? 'PRODUCER_TIMESTAMP' : 'RECEIPT_PUBLICATION_MTIME_PROXY' };
  }
  validateBrowser() {
    if (!fs.existsSync(this.input.browserReceipt)) return null;
    const value = readJson(this.input.browserReceipt);
    const restore = readJson(this.paths.restore), restoreCompleted = parseTime(restore.completedAt ?? restore.restoredAt ?? safeRegular(this.paths.restore).mtime.toISOString(), 'restore completion');
    for (const key of ['cloneWindowReceiptPath', 'browserResultPath', 'apiResultPath', 'cleanupReceiptPath']) demand(typeof value[key] === 'string' && path.isAbsolute(value[key]), `Browser receipt lacks ${key}`);
    demand(value.contract === 'LEETPLUS_REHEARSAL_BROWSER_API_ACCEPTANCE_V1' && value.decision === 'PASS' && value.releaseSha === this.readAdmission().releaseSha && value.restoreReceiptSha256 === fileDigest(this.paths.restore) && fileDigest(value.cloneWindowReceiptPath) === value.cloneWindowReceiptSha256 && fileDigest(value.browserResultPath) === value.browserResultSha256 && fileDigest(value.apiResultPath) === value.apiResultSha256 && fileDigest(value.cleanupReceiptPath) === value.cleanupReceiptSha256 && parseTime(value.completedAt, 'browser completion') >= restoreCompleted && parseTime(value.completedAt, 'browser completion') <= parseTime(this.input.wait.deadline, 'wait deadline'), 'Browser/API receipt does not bind the restored bounded clone window, actual result bytes and cleanup');
    const releaseSha = this.readAdmission().releaseSha, restoreSha = fileDigest(this.paths.restore), window = readJson(value.cloneWindowReceiptPath), browser = readJson(value.browserResultPath), api = readJson(value.apiResultPath), cleanup = readJson(value.cleanupReceiptPath);
    const endpoints = { blue: { web: 'http://127.0.0.1:23100', api: 'http://127.0.0.1:24100' }, green: { web: 'http://127.0.0.1:23200', api: 'http://127.0.0.1:24200' } }, roles = ['api-blue', 'api-green', 'web-blue', 'web-green'];
    demand(window.contract === 'LEETPLUS_REHEARSAL_BROWSER_WINDOW_V1' && window.decision === 'READY' && window.releaseSha === releaseSha && window.restoreReceiptSha256 === restoreSha && window.project === 'leetplus-rehearsal' && canonical(window.endpoints) === canonical(endpoints) && Array.isArray(window.pins) && canonical(window.pins.map(x => x.role).sort()) === canonical([...roles].sort()) && window.pins.every(x => /^[a-f0-9]{64}$/.test(x.id ?? '')), 'Invalid clone-only browser window identity');
    const started = parseTime(window.startedAt, 'browser window start'), expires = parseTime(window.expiresAt, 'browser window expiry');
    demand(started >= restoreCompleted && expires > started && expires - started <= 30 * 60_000, 'Browser window is outside its bounded restored-copy interval');
    demand(browser.contract === 'LEETPLUS_REHEARSAL_BROWSER_RESULT_V1' && browser.decision === 'PASS' && browser.releaseSha === releaseSha && browser.restoreReceiptSha256 === restoreSha && browser.windowReceiptSha256 === value.cloneWindowReceiptSha256 && browser.productionUrlUsed === false && canonical(browser.viewports) === canonical([390, 1440]) && canonical(browser.slots) === canonical({ blue: 'PASS', green: 'PASS' }), 'Browser result is not exact clone-only PASS');
    demand(api.contract === 'LEETPLUS_REHEARSAL_API_RESULT_V1' && api.decision === 'PASS' && api.releaseSha === releaseSha && api.restoreReceiptSha256 === restoreSha && api.windowReceiptSha256 === value.cloneWindowReceiptSha256 && api.providerEgressDenied === true && api.workerStarted === false && canonical(api.slots) === canonical({ blue: 'PASS', green: 'PASS' }), 'API result is not exact isolated PASS');
    const browserCompleted = parseTime(browser.completedAt, 'browser result'), apiCompleted = parseTime(api.completedAt, 'API result'), cleanupCompleted = parseTime(cleanup.completedAt, 'browser cleanup');
    demand(browserCompleted >= started && browserCompleted <= expires && apiCompleted >= started && apiCompleted <= expires && cleanupCompleted >= Math.max(browserCompleted, apiCompleted), 'Browser/API results are outside the bounded clone window');
    demand(cleanup.contract === 'LEETPLUS_REHEARSAL_BROWSER_CLEANUP_V1' && cleanup.decision === 'PASS' && cleanup.windowReceiptSha256 === value.cloneWindowReceiptSha256 && cleanup.runningCloneCount === 0 && canonical(cleanup.stoppedPins) === canonical(window.pins) && cleanupCompleted <= expires && parseTime(value.completedAt, 'browser completion') >= cleanupCompleted, 'Browser clone cleanup is incomplete or unbound');
    return { releaseSha: value.releaseSha, browserReceiptSha256: fileDigest(this.input.browserReceipt), actualCompletedAt: value.completedAt };
  }
  validateResource() {
    const release = readJson(this.input.releaseJson), acceptance = readJson(this.paths.acceptance);
    if (!release.apiResourceProfile) return { releaseSha: release.releaseSha, skipped: 'NO_RESOURCE_PROFILE', actualCompletedAt: null, observedAt: this.clock(), completionTimeBasis: 'NOT_APPLICABLE' };
    demand(release.apiResourceProfile === 'API_6G_V1', 'Unknown resource profile'); verifyResourceAcceptance(acceptance, release);
    return { releaseSha: release.releaseSha, profile: release.apiResourceProfile, resourceAcceptanceSha256: digest(acceptance.resourceAcceptance), actualCompletedAt: acceptance.resourceAcceptance.completedAt ?? acceptance.completedAt };
  }
  async statusAndGuard(label) {
    const status = JSON.parse(await this.command(label, this.paths.controlCommand, ['status'])), guard = this.input.nativeRequest.preparationGuard;
    demand(status.active && digest(status.active) === guard.activeSha256 && status.active.generation === guard.generation && status.active.activeSlot === guard.activeSlot && canonical(status.active[guard.activeSlot]) === canonical(this.input.nativeRequest[guard.activeSlot]), 'Active generation/release drift');
    demand(status.controller?.manifestSha256 === guard.controllerManifestSha256 && status.controller.isServing === true && status.controller.handoffPending === false && status.controller.preparationEvidenceExpiryEnforced === true, 'Serving controller drift, pending handoff, or missing preparation-expiry enforcement');
    if (fs.existsSync(this.paths.machineId)) demand(digest(fs.readFileSync(this.paths.machineId, 'utf8').trim()) === guard.hostIdentitySha256, 'Host identity drift');
    const busy = this.workerBusy ? await this.workerBusy() : this.nativeWorkersBusy();
    demand(!busy, 'A native worker is busy; preparation plan is BLOCKED');
    await this.verifyWorkerBindings(status.active);
    return status;
  }
  nativeWorkersBusy() {
    if (!fs.existsSync(this.paths.procLocks)) return false;
    const locks = fs.readFileSync(this.paths.procLocks, 'utf8').split('\n');
    return WORKERS.some(worker => {
      const file = path.join(this.paths.controlState, `${worker}.lock`);
      if (!fs.existsSync(file)) return false;
      const inode = String(fs.lstatSync(file).ino);
      return locks.some(line => { const fields = line.trim().split(/\s+/); return fields[1] === 'FLOCK' && fields[3] === 'WRITE' && fields[5]?.split(':').at(-1) === inode; });
    });
  }
  attestCandidateControl() {
    const admitted = this.readAdmission(), root = path.join(this.paths.candidateControlRoot, admitted.releaseSha);
    demand(fs.realpathSync(root) === root, 'Candidate controller root is not canonical');
    const manifestPath = path.join(root, 'install-manifest.json'), manifest = readJson(manifestPath);
    demand(manifest.contract === 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL' && manifest.releaseSha === admitted.releaseSha && manifest.admissionSha256 === admitted.admissionSha256 && manifest.files && typeof manifest.files === 'object', 'Candidate controller install/admission binding drift');
    const required = ['prepare-files.py', 'restore-rehearsal.py', 'accept-rehearsal.py', 'run-resource-rehearsal.py', 'control_handoff.py', 'contract.mjs', 'resource-budget.mjs'];
    demand(required.every(leaf => SHA.test(manifest.files[leaf] ?? '')), 'Candidate controller helpers are not attested');
    for (const [leaf, expected] of Object.entries(manifest.files)) {
      demand(/^[A-Za-z0-9_.@-]+$/.test(leaf) && !['.', '..', 'install-manifest.json'].includes(leaf) && SHA.test(expected) && fileDigest(path.join(root, leaf)) === expected, `Installed candidate controller drift: ${leaf}`);
    }
    demand(fileDigest(this.input.controlArchive) === admitted.controlArchiveSha256, 'Candidate control archive admission drift');
    return { root, installManifestSha256: fileDigest(manifestPath) };
  }
  attestServingInstaller() {
    const root = this.paths.servingControlRoot ?? path.dirname(fs.realpathSync(this.paths.controlCommand));
    demand(path.isAbsolute(root) && fs.realpathSync(root) === root, 'Serving controller root is not canonical');
    const manifestPath = path.join(root, 'install-manifest.json'), manifest = readJson(manifestPath), guard = this.input.nativeRequest.preparationGuard;
    demand(fileDigest(manifestPath) === guard.controllerManifestSha256 && manifest.contract === 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL' && SHA.test(manifest.files?.['install-control.py'] ?? '') && SHA.test(manifest.files?.['control.sh'] ?? ''), 'Serving installer is not bound to the guarded controller');
    for (const leaf of ['install-control.py', 'control.sh']) demand(fileDigest(path.join(root, leaf)) === manifest.files[leaf], `Serving controller drift: ${leaf}`);
    return path.join(root, 'install-control.py');
  }
  stageCandidateControl() { try { return this.attestCandidateControl(); } catch { return null; } }
  async verifyWorkerBindings(active) {
    const policy = this.input.nativeRequest.workerContinuation, guard = this.input.nativeRequest.preparationGuard, publicKey = readBytes(this.paths.workerPublicKey);
    const profiles = Object.fromEntries(policy.profileBindings.map(binding => { const profile = readBytes(path.join(this.paths.productionRoot, 'secrets', `${binding.worker}.json`)); demand(fileDigest(path.join(this.paths.productionRoot, 'secrets', `${binding.worker}.json`)) === binding.profileSha256, `Worker profile drift: ${binding.worker}`); return [binding.worker, profile]; }));
    const envelopes = WORKERS.map(worker => readJson(path.join(this.paths.controlState, 'worker-grants', `${worker}.json`)));
    validateCurrentWorkerContinuation(policy, envelopes, { publicKey, current: active, hostIdentitySha256: guard.hostIdentitySha256, profiles, now: Date.parse(this.clock()) });
    for (const timer of policy.originalTimers) {
      const raw = await this.command(`timer-${timer.worker}`, '/usr/bin/systemctl', ['show', timer.unit, '--property=LoadState,ActiveState,UnitFileState,SubState']);
      const state = Object.fromEntries(raw.split('\n').filter(Boolean).map(line => line.split('=', 2)));
      demand(state.LoadState === 'loaded' && (state.ActiveState === 'active') === timer.active && (state.UnitFileState === 'enabled') === timer.enabled && (timer.active ? state.SubState === 'waiting' : state.SubState === 'dead'), `Original timer drift: ${timer.worker}`);
    }
  }
  async reconcileStage() {
    const release = readJson(this.input.releaseJson);
    for (const image of Object.values(release.images)) {
      let inspected;
      try { inspected = JSON.parse(await this.command('image-inspect', '/usr/bin/docker', ['--host', 'unix:///var/run/docker.sock', '--config', '/etc/leetplus-compose/docker-cli', 'image', 'inspect', image])); }
      catch { return null; }
      if (!Array.isArray(inspected) || inspected.length !== 1 || inspected[0].Id !== image) return null;
    }
    const control = this.attestCandidateControl();
    return { releaseSha: release.releaseSha, archiveSha256: this.readAdmission().archiveSha256, candidateControlSha256: control.installManifestSha256, reconciledFromExactImages: true, actualCompletedAt: null, observedAt: this.clock(), completionTimeBasis: 'EXACT_STATE_OBSERVED_COMPLETION_TIME_UNKNOWN' };
  }
  boundBackupEvidence() {
    const backup = this.readPhase('BACKUP').result, imported = this.readPhase('OFFHOST_IMPORT').result;
    return { decision: 'PASS', releaseSha: this.readAdmission().releaseSha, backupExportSha256: backup.exportReceiptSha256, offhostReceiptSha256: imported.offhostSha256, authenticatedVerificationSha256: imported.verificationSha256, restoreImportSha256: imported.importSha256 };
  }
  boundRehearsalEvidence() {
    const restore = this.readPhase('RESTORE').result, browser = this.readPhase('BROWSER').result, resource = this.readPhase('RESOURCE').result;
    const acceptance = readJson(this.paths.acceptance);
    return { ...acceptance, decision: 'PASS', releaseSha: this.readAdmission().releaseSha, restoreReceiptSha256: restore.restoreReceiptSha256, acceptanceReceiptSha256: fileDigest(this.paths.acceptance), browserReceiptSha256: browser.browserReceiptSha256, resourceAcceptanceSha256: resource.resourceAcceptanceSha256 ?? null, resourceSkipped: resource.skipped ?? null };
  }
  nativeRequest() {
    const admission = this.readAdmission(), backupEvidence = this.boundBackupEvidence(), rehearsalEvidence = this.boundRehearsalEvidence();
    const verification = readJson(this.input.backupVerificationReceipt);
    const preparationEvidenceExpiresAt = new Date(Math.min(parseTime(this.input.wait.deadline, 'wait deadline'), parseTime(verification.effectiveExpiresAt, 'authenticated backup expiry'))).toISOString();
    return { ...this.input.nativeRequest, targetSlot: this.input.targetSlot, admissionSha256: admission.admissionSha256, archiveSha256: admission.archiveSha256, backupReceiptSha256: digest(backupEvidence), rehearsalReceiptSha256: digest(rehearsalEvidence), preparationEvidenceExpiresAt };
  }
  planMatches(plan, request, operationId = plan?.operationId) {
    if (!plan || !UUID.test(operationId ?? '') || plan.operationId !== operationId || plan.contract !== 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_PLAN') return false;
    const guard = request.preparationGuard;
    if (plan.hostIdentitySha256 !== guard.hostIdentitySha256 || plan.controlSha256 !== guard.controllerManifestSha256 || digest(plan.previous) !== guard.activeSha256 || plan.generation !== guard.generation || plan.action !== 'ROLLOUT') return false;
    const dynamic = new Set(['contract', 'operationId', 'hostIdentitySha256', 'controlSha256', 'previous', 'generation', 'action', 'dataRelease', 'dataAdmissionSha256', 'secretDigests', 'networkPolicySha256', 'databaseIdentitySha256', 'composeSha256', 'resourceBudget']);
    const base = Object.fromEntries(Object.entries(plan).filter(([key]) => !dynamic.has(key)));
    return canonical(base) === canonical(request);
  }
  findNativePlan(request) {
    if (!fs.existsSync(this.paths.nativeOperations)) return null;
    const matches = [];
    for (const entry of fs.readdirSync(this.paths.nativeOperations, { withFileTypes: true })) {
      if (!entry.isDirectory() || !UUID.test(entry.name)) continue;
      const planPath = path.join(this.paths.nativeOperations, entry.name, 'plan.json');
      if (!fs.existsSync(planPath)) continue;
      const plan = readJson(planPath);
      if (this.planMatches(plan, request, entry.name)) matches.push({ plan, planPath });
    }
    demand(matches.length <= 1, 'Ambiguous complete native-request reconciliation');
    return matches[0] ?? null;
  }
  publishNativeEvidence(match, request) {
    const directory = path.dirname(match.planPath), backup = this.boundBackupEvidence(), rehearsal = this.boundRehearsalEvidence();
    for (const binding of request.workerContinuation.profileBindings) {
      const profilePath = path.join(directory, `worker-profile-${binding.worker}.json`);
      demand(fileDigest(profilePath) === binding.profileSha256,
        `Native immutable worker profile snapshot is absent or drifted: ${binding.worker}`);
    }
    demand(digest(backup) === request.backupReceiptSha256 && digest(rehearsal) === request.rehearsalReceiptSha256, 'Native evidence digest construction drift');
    publishJson(path.join(directory, 'backup.json'), backup, 0o400);
    publishJson(path.join(directory, 'rehearsal.json'), rehearsal, 0o400);
    demand(fileDigest(path.join(directory, 'backup.json')) === request.backupReceiptSha256 && fileDigest(path.join(directory, 'rehearsal.json')) === request.rehearsalReceiptSha256, 'Native operation evidence publication drift');
    return { decision: 'PREPARED_NOT_AUTHORIZATION', operationId: match.plan.operationId, planSha256: digest(match.plan), planPath: match.planPath, requestSha256: digest(request) };
  }
  async nativePrepare() {
    const request = this.nativeRequest(), requestPath = path.join(this.stateDir, 'native-request.json');
    publishJson(requestPath, request);
    const existing = this.findNativePlan(request); if (existing) return this.publishNativeEvidence(existing, request);
    const output = JSON.parse(await this.command('native-prepare', this.paths.controlCommand, ['prepare', '--request', requestPath]));
    demand(output.decision === 'PREPARED_NOT_AUTHORIZATION' && UUID.test(output.operationId ?? '') && SHA.test(output.planSha256 ?? ''), 'Native prepare output invalid');
    const planPath = path.join(this.paths.nativeOperations, output.operationId, 'plan.json');
    demand(fs.existsSync(planPath), 'Native plan output has no immutable plan');
    const match = { plan: readJson(planPath), planPath };
    demand(this.planMatches(match.plan, request, output.operationId) && digest(match.plan) === output.planSha256, 'Native plan does not exactly match request/host/generation');
    return this.publishNativeEvidence(match, request);
  }
  async validateReady() {
    demand(Date.parse(this.clock()) <= parseTime(this.input.wait.deadline, 'wait deadline'), 'Prepared evidence expired before READY; no TTL extension is allowed');
    const admitted = validateAdmission(this.input);
    demand(admitted.admissionSha256 === this.readAdmission().admissionSha256 && admitted.archiveSha256 === this.readAdmission().archiveSha256, 'Accepted download/admission bytes changed');
    demand(await this.reconcileStage(), 'Exact staged image identities changed');
    this.attestCandidateControl();
    demand(this.validateBackup(this.intentPath('BACKUP'))?.exportReceiptSha256 === this.readPhase('BACKUP').result.exportReceiptSha256, 'Accepted backup bytes changed');
    const imported = this.validateOffhostImport();
    demand(imported && imported.offhostSha256 === this.readPhase('OFFHOST_IMPORT').result.offhostSha256 && imported.verificationSha256 === this.readPhase('OFFHOST_IMPORT').result.verificationSha256 && imported.importSha256 === this.readPhase('OFFHOST_IMPORT').result.importSha256, 'Accepted off-host/import bytes changed');
    demand(this.validatePreparation()?.preparationSha256 === this.readPhase('PREPARE_FILES').result.preparationSha256, 'Accepted preparation bytes changed');
    demand(this.validateRestore()?.restoreReceiptSha256 === this.readPhase('RESTORE').result.restoreReceiptSha256, 'Accepted restore bytes changed');
    demand(this.validateBrowser()?.browserReceiptSha256 === this.readPhase('BROWSER').result.browserReceiptSha256, 'Accepted browser bytes changed');
    demand(this.validateAcceptance()?.acceptanceReceiptSha256 === this.readPhase('ACCEPT').result.acceptanceReceiptSha256, 'Accepted API/resource bytes changed');
    this.validateResource();
    await this.statusAndGuard('ready-preflight');
    const request = this.nativeRequest(), requestPath = path.join(this.stateDir, 'native-request.json');
    demand(fs.existsSync(requestPath) && fileDigest(requestPath) === digest(request), 'Frozen native request changed');
    const match = this.findNativePlan(request);
    demand(match, 'Exact native plan disappeared before READY');
    const native = this.publishNativeEvidence(match, request), accepted = this.readPhase('NATIVE_PREPARE').result;
    demand(native.operationId === accepted.operationId && native.planSha256 === accepted.planSha256 && native.requestSha256 === accepted.requestSha256, 'Native prepare receipt drift before READY');
    return native;
  }
  async run() {
    const releaseLock = this.acquireLock();
    try {
      await this.phase('ADMISSION', async () => this.waitFor('admitted bundle download', async () => fs.existsSync(this.input.downloadReceipt) ? validateAdmission(this.input) : null), async () => fs.existsSync(this.input.downloadReceipt) ? validateAdmission(this.input) : null);
      await this.phase('CONTROL_STAGE', async () => { const installer = this.attestServingInstaller(), admitted = this.readAdmission(); await this.command('control-stage', '/usr/bin/python3', [installer, '--inbox', path.dirname(this.input.releaseJson), '--admission-sha256', admitted.admissionSha256, '--stage-only'], 300_000); return demand(this.stageCandidateControl(), 'Candidate controller staging receipt is incomplete'); }, async () => this.stageCandidateControl());
      await this.phase('IMAGE_STAGE', async () => { await this.command('docker-load', '/usr/bin/docker', ['--host', 'unix:///var/run/docker.sock', '--config', '/etc/leetplus-compose/docker-cli', 'load', '--input', this.input.imagesArchive], 3_600_000); return demand(await this.reconcileStage(), 'Loaded images do not match the admitted release'); }, async () => this.reconcileStage());
      if (!this.readPhase('BACKUP') && !fs.existsSync(path.join(this.stateDir, '.attempted-BACKUP'))) await this.statusAndGuard('backup-preflight');
      await this.phase('BACKUP', async () => { await this.command('backup', this.paths.controlCommand, ['backup'], 3_600_000); return demand(this.validateBackup(this.intentPath('BACKUP')), 'Fresh backup receipt missing'); }, async () => this.validateBackup(this.intentPath('BACKUP')));
      await this.phase('OFFHOST_IMPORT', async () => this.waitFor('off-host authentication/import', async () => this.validateOffhostImport()), async () => this.waitFor('off-host authentication/import', async () => this.validateOffhostImport()));
      await this.phase('PREPARE_FILES', async () => { const imported = this.readPhase('OFFHOST_IMPORT').result, controllerDir = this.attestCandidateControl().root; await this.command('prepare-files', '/usr/bin/python3', [path.join(controllerDir, 'prepare-files.py'), '--release-json', this.input.releaseJson, '--source-capsule', imported.sourceCapsulePath, '--rehearsal'], 600_000); return demand(this.validatePreparation(), 'Preparation receipt missing'); }, async () => this.validatePreparation());
      await this.phase('RESTORE', async () => { const imported = this.readPhase('OFFHOST_IMPORT').result, controllerDir = this.attestCandidateControl().root; await this.command('restore-rehearsal', '/usr/bin/python3', [path.join(controllerDir, 'restore-rehearsal.py'), '--release-json', this.input.releaseJson, '--dump', imported.dumpPath, '--globals', imported.globalsPath, '--manifest', imported.manifestPath], 1_800_000); return demand(this.validateRestore(), 'Restore receipt missing'); }, async () => this.validateRestore());
      await this.phase('BROWSER', async () => this.waitFor('rehearsal browser/API acceptance', async () => this.validateBrowser()), async () => this.waitFor('rehearsal browser/API acceptance', async () => this.validateBrowser()));
      await this.phase('ACCEPT', async () => { const release = readJson(this.input.releaseJson), controllerDir = this.attestCandidateControl().root; const script = release.apiResourceProfile ? 'run-resource-rehearsal.py' : 'accept-rehearsal.py'; await this.command('accept-rehearsal', '/usr/bin/python3', [path.join(controllerDir, script)], release.apiResourceProfile ? 1_100_000 : 1_200_000); return demand(this.validateAcceptance(), 'Acceptance receipt missing'); }, async () => this.validateAcceptance());
      await this.phase('RESOURCE', async () => this.validateResource(), async () => this.validateResource());
      if (!this.readPhase('NATIVE_PREPARE') && !fs.existsSync(path.join(this.stateDir, '.attempted-NATIVE_PREPARE'))) await this.statusAndGuard('native-preflight');
      await this.phase('NATIVE_PREPARE', async () => this.nativePrepare(), async () => { const request = this.nativeRequest(), found = this.findNativePlan(request); return found ? this.publishNativeEvidence(found, request) : null; });
      const native = await this.validateReady(), packet = this.goPacket(native), packetPath = path.join(this.stateDir, 'go-packet.json');
      publishJson(packetPath, packet);
      return readJson(packetPath);
    } finally { releaseLock(); }
  }
  goPacket(native) {
    return { contract: GO_PACKET_CONTRACT, decision: 'PREPARED_NOT_AUTHORIZATION', inputSha256: this.inputDigest, nativePlanSha256: native.planSha256, nativeOperationId: native.operationId, workerContinuation: this.input.nativeRequest.workerContinuation, preparationEvidenceExpiresAt: this.nativeRequest().preparationEvidenceExpiresAt, preparedAt: this.readPhase('NATIVE_PREPARE').completedAt };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inputPath, stateDir] = process.argv.slice(2);
  if (!inputPath || !stateDir) throw new Error('Usage: preparation-runner.mjs <input.json> <private-state-dir>');
  demand(process.platform === 'linux' && process.getuid?.() === 0 && Number(process.versions.node.split('.')[0]) === 22, 'Linux root and Node 22 required');
  const normalizedState = path.resolve(stateDir), stateRoot = '/var/lib/leetplus-compose/preparations';
  demand(normalizedState.startsWith(`${stateRoot}/`) && path.normalize(inputPath) === inputPath && path.isAbsolute(inputPath), 'Canonical private preparation paths required');
  safeRegular(inputPath, true);
  ensurePrivateTree('/var/lib/leetplus-compose', normalizedState);
  const globalLock = '/var/lib/leetplus-compose/preparation-runner.lock';
  if (process.env.LEETPLUS_PREPARATION_LOCKED !== '1') {
    try { const fd = fs.openSync(globalLock, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600); fs.fsyncSync(fd); fs.closeSync(fd); syncDir(path.dirname(globalLock)); }
    catch (error) { if (error.code !== 'EEXIST') throw error; safeRegular(globalLock, true); }
    safeRegular(globalLock, true);
    const result = spawnSync('/usr/bin/flock', ['--exclusive', '--nonblock', '--no-fork', globalLock, '/usr/bin/env', '-i', 'PATH=/usr/sbin:/usr/bin:/sbin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC', 'LEETPLUS_PREPARATION_LOCKED=1', '/usr/bin/node', process.argv[1], inputPath, normalizedState], { stdio: 'inherit' });
    process.exit(result.status ?? 1);
  }
  console.log(canonical(await new PreparationRunner(readJson(inputPath), stateDir).run()));
}
