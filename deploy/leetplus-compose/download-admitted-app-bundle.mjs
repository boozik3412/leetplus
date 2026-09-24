#!/usr/bin/env node
/** Local acquisition only. No installation, Docker, serving, or production effects. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { APP_ADMISSION_CONTRACT, APP_BUNDLE_CONTRACT, canonical, demand, digest, readCanonicalJson, validateAppAdmission, validateAppBundle } from './app-only-artifact.mjs';

const REPOSITORY = 'boozik3412/leetplus';
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const INTEGER = /^[1-9][0-9]*$/;
export const DOWNLOAD_CONTRACT = 'LEETPLUS_COMPOSE_APP_DOWNLOAD_V2';
const FILES = Object.freeze({
  'app-bundle.json': 'bundleManifestSha256',
  'app-images.tar.gz': 'appArchiveSha256',
  'control.tar.gz': null,
  'transport-validation.json': 'transportValidationSha256',
  'app-api-runtime-validation.json': 'apiRuntimeValidationSha256',
  'archive-roundtrip.json': 'archiveRoundtripSha256',
  'network-validation.json': 'networkValidationSha256',
  'runtime-validation.json': 'runtimeValidationSha256',
  SHA256SUMS: null,
});

export function assertOwnerMode(stat, { directory = false, platform = process.platform,
  uid = typeof process.getuid === 'function' ? process.getuid() : null } = {}) {
  if (platform !== 'win32') demand(stat.uid === uid && !(stat.mode & (directory ? 0o077 : 0o022)),
    `Untrusted app download ${directory ? 'directory' : 'file'} owner/mode`);
}

function safeJson(file, label) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    demand(stat.isFile() && stat.nlink === 1 && stat.size > 0 && stat.size <= 4 * 1024 * 1024 && !fs.lstatSync(file).isSymbolicLink(), `${label} is unsafe`);
    assertOwnerMode(stat);
    const raw = fs.readFileSync(fd, 'utf8');
    demand(!raw.includes('\r'), `${label} must use LF line endings`);
    const value = JSON.parse(raw);
    demand(raw === canonical(value), `${label} must be canonical JSON`);
    return { raw, value };
  } finally { fs.closeSync(fd); }
}

function syncDirectory(directory) {
  if (process.platform === 'win32') return;
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function publish(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, 'wx', 0o400);
  try { fs.writeFileSync(fd, canonical(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.linkSync(temporary, file); syncDirectory(path.dirname(file)); }
  finally { fs.unlinkSync(temporary); }
}

export function hashFile(file, flush = false) {
  const before = fs.lstatSync(file);
  demand(before.isFile() && !before.isSymbolicLink() && before.nlink === 1, 'Bundle member must be a regular single-link file');
  assertOwnerMode(before);
  const fd = fs.openSync(file, (flush ? fs.constants.O_RDWR : fs.constants.O_RDONLY) | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.alloc(1024 * 1024); let length;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, length));
    const after = fs.fstatSync(fd);
    demand(after.size === before.size && after.mtimeMs === before.mtimeMs && after.ino === before.ino, 'Bundle changed while hashing');
    if (flush) fs.fsyncSync(fd);
    return { sha256: hash.digest('hex'), bytes: before.size };
  } finally { fs.closeSync(fd); }
}

export function validateDownloadInput(input) {
  demand(input?.contract === DOWNLOAD_CONTRACT && SHA.test(input.releaseSha ?? '') && HASH.test(input.admissionSha256 ?? ''), 'Exact app release/admission digest required');
  for (const key of ['runId', 'runAttempt', 'artifactId']) demand(INTEGER.test(String(input[key] ?? '')) && Number.isSafeInteger(Number(input[key])), `Invalid ${key}`);
  return input;
}

export function validateRemote(input, run, artifact, transportDigest) {
  validateDownloadInput(input);
  demand(String(run.id) === String(input.runId) && String(run.run_attempt) === String(input.runAttempt) && run.repository?.full_name === REPOSITORY && run.head_repository?.full_name === REPOSITORY && run.path === '.github/workflows/ci.yml', 'Unexpected app admission workflow identity');
  demand(run.status === 'completed' && run.conclusion === 'success' && run.event === 'push' && run.head_branch === 'main' && run.head_sha === input.releaseSha, 'No successful exact-main app workflow run');
  const name = `leetplus-compose-app-${input.releaseSha}-${input.runId}-${input.runAttempt}`;
  demand(String(artifact.id) === String(input.artifactId) && artifact.name === name && artifact.expired === false && String(artifact.workflow_run?.id) === String(input.runId) && artifact.workflow_run?.head_sha === input.releaseSha && artifact.workflow_run?.head_branch === 'main', 'App artifact is not bound to the exact admitted run');
  if (transportDigest !== undefined) demand(artifact.digest === `sha256:${transportDigest}`, 'App artifact transport digest mismatch');
  return name;
}

function checksumRecords(root) {
  const sums = fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8').trimEnd().split('\n');
  demand(sums.length === Object.keys(FILES).length - 1, 'SHA256SUMS count is not exact');
  const records = new Map();
  for (const line of sums) {
    const match = line.match(/^([a-f0-9]{64})  ([a-z0-9.-]+)$/);
    demand(match && Object.hasOwn(FILES, match[2]) && match[2] !== 'SHA256SUMS' && !records.has(match[2]), 'Invalid SHA256SUMS record');
    records.set(match[2], match[1]);
  }
  demand([...Object.keys(FILES)].filter(name => name !== 'SHA256SUMS').every(name => records.has(name)), 'SHA256SUMS is incomplete');
  return records;
}

export function verifyDownloadedBundle(input, directory, admissionFile) {
  validateDownloadInput(input);
  demand(fs.realpathSync(directory) === path.resolve(directory) && !fs.lstatSync(directory).isSymbolicLink(), 'Untrusted app bundle directory');
  assertOwnerMode(fs.lstatSync(directory), { directory: true });
  const names = fs.readdirSync(directory).sort();
  demand(canonical(names) === canonical(Object.keys(FILES).sort()), 'App bundle file set is not exact');
  const checksums = checksumRecords(directory);
  const files = {};
  for (const name of Object.keys(FILES)) {
    files[name] = hashFile(path.join(directory, name), true);
    if (name !== 'SHA256SUMS') demand(files[name].sha256 === checksums.get(name), `App bundle checksum mismatch: ${name}`);
  }
  const admissionRecord = safeJson(admissionFile, 'app admission');
  demand(hashFile(admissionFile).sha256 === input.admissionSha256, 'App admission digest mismatch');
  const admission = validateAppAdmission(admissionRecord.value);
  demand(admission.contract === APP_ADMISSION_CONTRACT && admission.releaseSha === input.releaseSha && String(admission.runId) === String(input.runId) && String(admission.runAttempt) === String(input.runAttempt) && String(admission.appArtifact.id) === String(input.artifactId), 'App admission provenance mismatch');
  for (const [name, field] of Object.entries(FILES)) if (field) demand(files[name].sha256 === admission[field], `Admission digest mismatch: ${name}`);
  const bundle = validateAppBundle(safeJson(path.join(directory, 'app-bundle.json'), 'app bundle').value);
  demand(bundle.contract === APP_BUNDLE_CONTRACT && bundle.releaseSha === input.releaseSha && canonical(bundle.appImages) === canonical(admission.appImages), 'App bundle image identity mismatch');
  demand(Object.keys(bundle.appImages).length === 2 && !Object.hasOwn(bundle.appImages, 'postgres') && !Object.hasOwn(bundle.appImages, 'redis'), 'App bundle contains data images');
  return { files, checksums };
}

export function acquire(input, directory, { admissionFile, execute = spawnSync, clock = () => new Date().toISOString() } = {}) {
  validateDownloadInput(input); directory = path.resolve(directory);
  demand(admissionFile, 'App download requires the immutable app admission file');
  const admissionRecord = safeJson(path.resolve(admissionFile), 'app admission');
  demand(digest(admissionRecord.raw) === input.admissionSha256, 'App admission digest mismatch');
  const sourceAdmission = validateAppAdmission(admissionRecord.value);
  demand(sourceAdmission.releaseSha === input.releaseSha && String(sourceAdmission.runId) === String(input.runId) && String(sourceAdmission.runAttempt) === String(input.runAttempt) && String(sourceAdmission.appArtifact.id) === String(input.artifactId), 'App admission provenance mismatch');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const directoryStat = fs.lstatSync(directory);
  demand(!directoryStat.isSymbolicLink() && fs.realpathSync(directory) === directory, 'Symlink destination/ancestor forbidden');
  assertOwnerMode(directoryStat, { directory: true });
  const bundle = path.join(directory, 'bundle');
  const inputFile = path.join(directory, 'download-input.json');
  const intentFile = path.join(directory, 'download-intent.json');
  const remoteFile = path.join(directory, 'verified-remote.json');
  const receiptFile = path.join(directory, 'download-receipt.json');
  if (fs.existsSync(inputFile)) demand(canonical(safeJson(inputFile, 'download input').value) === canonical(input), 'Download input drift');
  else {
    demand(fs.readdirSync(directory).length === 0, 'New download needs an empty directory');
    publish(inputFile, input);
  }
  function evidence() {
    demand(fs.existsSync(intentFile) && fs.existsSync(remoteFile), 'Unresolved intent: metadata not verified; no automatic retry');
    const intent = safeJson(intentFile, 'download intent').value;
    const remote = safeJson(remoteFile, 'verified remote').value;
    demand(intent.inputSha256 === digest(input) && Number.isFinite(Date.parse(intent.startedAt)) && remote.inputSha256 === digest(input), 'Remote receipt input drift');
    validateRemote(input, remote.run, remote.artifact, sourceAdmission.appArtifact.transportDigest);
    return { intentSha256: hashFile(intentFile).sha256, remoteSha256: hashFile(remoteFile).sha256 };
  }
  if (fs.existsSync(receiptFile)) {
    const receipt = safeJson(receiptFile, 'download receipt').value;
    const verified = verifyDownloadedBundle(input, bundle, path.resolve(admissionFile)); const proof = evidence();
    demand(receipt.contract === DOWNLOAD_CONTRACT && receipt.decision === 'PASS' && receipt.inputSha256 === digest(input) && receipt.releaseSha === input.releaseSha && receipt.runId === String(input.runId) && receipt.runAttempt === String(input.runAttempt) && receipt.artifactId === String(input.artifactId) && canonical(receipt.files) === canonical(verified.files) && receipt.appAdmissionSha256 === input.admissionSha256 && receipt.intentSha256 === proof.intentSha256 && receipt.remoteSha256 === proof.remoteSha256 && Number.isFinite(Date.parse(receipt.completedAt)), 'Download receipt drift');
    return receipt;
  }
  function command(label, args) {
    const startedAt = clock();
    const result = execute('gh', args, { encoding: 'utf8', timeout: label === 'download' ? 20 * 60 * 1000 : 60_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    fs.writeFileSync(path.join(directory, `${label}.stdout`), result.stdout ?? '', { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(directory, `${label}.stderr`), result.stderr ?? result.error?.message ?? '', { flag: 'wx', mode: 0o600 });
    publish(path.join(directory, `${label}.exit.json`), { startedAt, completedAt: clock(), exitCode: result.status, signal: result.signal ?? null, error: result.error?.code ?? null });
    demand(result.status === 0 && !result.error, `${label} failed; reconcile, do not repeat download`);
    return result.stdout;
  }
  if (!fs.existsSync(intentFile)) {
    publish(intentFile, { inputSha256: digest(input), startedAt: clock() });
    const run = JSON.parse(command('run-metadata', ['api', `repos/${REPOSITORY}/actions/runs/${input.runId}/attempts/${input.runAttempt}`]));
    const artifact = JSON.parse(command('artifact-metadata', ['api', `repos/${REPOSITORY}/actions/artifacts/${input.artifactId}`]));
    const name = validateRemote(input, run, artifact, sourceAdmission.appArtifact.transportDigest);
    publish(remoteFile, { inputSha256: digest(input), run, artifact });
    fs.mkdirSync(bundle, { mode: 0o700 });
    command('download', ['run', 'download', String(input.runId), '--repo', REPOSITORY, '--name', name, '--dir', bundle]);
  }
  const proof = evidence();
  const verified = verifyDownloadedBundle(input, bundle, path.resolve(admissionFile));
  const receipt = { contract: DOWNLOAD_CONTRACT, decision: 'PASS', inputSha256: digest(input), appAdmissionSha256: input.admissionSha256, releaseSha: input.releaseSha, runId: String(input.runId), runAttempt: String(input.runAttempt), artifactId: String(input.artifactId), completedAt: clock(), ...proof, files: verified.files };
  publish(receiptFile, receipt);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, directory, admission] = process.argv.slice(2);
  demand(input && directory && admission && process.argv.length === 5, 'Usage: node download-admitted-app-bundle.mjs input.json new-local-directory app-admission.json');
  console.log(canonical(acquire(safeJson(input, 'download input').value, directory, { admissionFile: path.resolve(admission) })));
}
