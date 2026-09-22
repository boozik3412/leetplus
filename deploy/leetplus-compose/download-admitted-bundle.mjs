#!/usr/bin/env node
/** Local acquisition only. No SSH, install, Docker, backup or serving effects. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { canonical, digest, demand, release } from './contract.mjs';

const REPO = 'boozik3412/leetplus';
export const DOWNLOAD_CONTRACT = 'LEETPLUS_RELEASE_DOWNLOAD_V1';
const FILES = { 'release.json': 'releaseManifestSha256', 'images.tar.gz': 'archiveSha256', 'control.tar.gz': 'controlArchiveSha256', 'transport-validation.json': 'transportValidationSha256', 'archive-roundtrip.json': 'archiveRoundtripSha256', 'network-validation.json': 'networkValidationSha256' };
const sha256 = value => /^[a-f0-9]{64}$/.test(value ?? '');
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function syncDirectory(dir) { if (process.platform === 'win32') return; const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function publish(file, value) {
  const raw = canonical(value), temporary = `${file}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, 'wx', 0o400);
  try { fs.writeFileSync(fd, raw); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  // Hard-link is an atomic exclusive publication, never replacement.
  try { fs.linkSync(temporary, file); syncDirectory(path.dirname(file)); }
  finally { fs.unlinkSync(temporary); }
}
export function hashFile(file, flush = false) {
  const stat = fs.lstatSync(file);
  demand(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, 'Bundle member must be a regular single-link file');
  const fd = fs.openSync(file, (flush ? fs.constants.O_RDWR : fs.constants.O_RDONLY) | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const hash = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024); let length;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, length));
    const after = fs.fstatSync(fd);
    demand(after.size === stat.size && after.mtimeMs === stat.mtimeMs && after.ino === stat.ino, 'Bundle changed while hashing');
    if (flush) fs.fsyncSync(fd);
    return { sha256: hash.digest('hex'), bytes: stat.size };
  } finally { fs.closeSync(fd); }
}
export function validateDownloadInput(input) {
  demand(input?.contract === DOWNLOAD_CONTRACT && /^[a-f0-9]{40}$/.test(input.releaseSha ?? '') && sha256(input.admissionSha256), 'Exact release/admission digest required');
  for (const key of ['runId', 'runAttempt', 'artifactId']) demand(/^[1-9][0-9]*$/.test(String(input[key] ?? '')) && Number.isSafeInteger(Number(input[key])), `Invalid ${key}`);
  return input;
}
export function validateRemote(input, run, artifact) {
  validateDownloadInput(input);
  demand(String(run.id) === String(input.runId) && String(run.run_attempt) === String(input.runAttempt) && run.repository?.full_name === REPO && run.head_repository?.full_name === REPO && run.path === '.github/workflows/ci.yml', 'Unexpected admission workflow identity');
  demand(run.status === 'completed' && run.conclusion === 'success' && run.event === 'push' && run.head_branch === 'main' && run.head_sha === input.releaseSha, 'No successful exact-main Full run');
  const name = `leetplus-compose-admitted-${input.releaseSha}-${input.runId}-${input.runAttempt}`;
  demand(String(artifact.id) === String(input.artifactId) && artifact.name === name && artifact.expired === false && String(artifact.workflow_run?.id) === String(input.runId) && artifact.workflow_run?.head_sha === input.releaseSha && artifact.workflow_run?.head_branch === 'main', 'Artifact is not bound to exact admitted run');
  return name;
}
export function verifyDownloadedBundle(input, directory) {
  validateDownloadInput(input);
  const files = { 'docker-admission.json': hashFile(path.join(directory, 'docker-admission.json'), true) };
  demand(files['docker-admission.json'].sha256 === input.admissionSha256, 'Admission digest mismatch');
  const admission = read(path.join(directory, 'docker-admission.json'));
  demand(admission.contract === 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION' && admission.decision === 'PASS' && admission.repository === REPO && admission.event === 'push' && admission.ref === 'refs/heads/main' && admission.releaseSha === input.releaseSha && String(admission.runId) === String(input.runId) && String(admission.runAttempt) === String(input.runAttempt), 'Admission provenance mismatch');
  for (const [name, field] of Object.entries(FILES)) {
    demand(sha256(admission[field]), `Admission lacks ${field}`);
    files[name] = hashFile(path.join(directory, name), true);
    demand(files[name].sha256 === admission[field], `Bundle digest mismatch: ${name}`);
  }
  const manifest = release(read(path.join(directory, 'release.json')));
  demand(manifest.releaseSha === input.releaseSha && canonical(manifest.images) === canonical(admission.images), 'Manifest image identity mismatch');
  syncDirectory(directory);
  return files;
}

export function acquire(input, directory, { execute = spawnSync, clock = () => new Date().toISOString() } = {}) {
  validateDownloadInput(input); directory = path.resolve(directory);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  demand(!fs.lstatSync(directory).isSymbolicLink(), 'Symlink destination forbidden');
  const inputFile = path.join(directory, 'download-input.json'), intentFile = path.join(directory, 'download-intent.json'), receiptFile = path.join(directory, 'download-receipt.json');
  if (fs.existsSync(inputFile)) demand(canonical(read(inputFile)) === canonical(input), 'Download input drift');
  else { demand(fs.readdirSync(directory).length === 0, 'New download needs an empty directory'); publish(inputFile, input); }
  if (fs.existsSync(receiptFile)) {
    const receipt = read(receiptFile), files = verifyDownloadedBundle(input, directory);
    demand(receipt.contract === DOWNLOAD_CONTRACT && receipt.decision === 'PASS' && receipt.inputSha256 === digest(input) && canonical(receipt.files) === canonical(files), 'Download receipt drift');
    return receipt;
  }
  function command(label, args) {
    const startedAt = clock();
    const result = execute('gh', args, { encoding: 'utf8', timeout: label === 'download' ? 20 * 60 * 1000 : 60000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    fs.writeFileSync(path.join(directory, `${label}.stdout`), result.stdout ?? '', { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(directory, `${label}.stderr`), result.stderr ?? result.error?.message ?? '', { flag: 'wx', mode: 0o600 });
    publish(path.join(directory, `${label}.exit.json`), { startedAt, completedAt: clock(), exitCode: result.status, signal: result.signal ?? null, error: result.error?.code ?? null });
    demand(result.status === 0 && !result.error, `${label} failed; reconcile, do not repeat download`);
    return result.stdout;
  }
  if (!fs.existsSync(intentFile)) {
    // Intent precedes *every* external call. If the process disappears, a
    // successor may validate complete bytes but never starts another transfer.
    publish(intentFile, { inputSha256: digest(input), startedAt: clock() });
    const run = JSON.parse(command('run-metadata', ['api', `repos/${REPO}/actions/runs/${input.runId}/attempts/${input.runAttempt}`]));
    const artifact = JSON.parse(command('artifact-metadata', ['api', `repos/${REPO}/actions/artifacts/${input.artifactId}`]));
    const name = validateRemote(input, run, artifact);
    publish(path.join(directory, 'verified-remote.json'), { inputSha256: digest(input), run, artifact });
    command('download', ['run', 'download', String(input.runId), '--repo', REPO, '--name', name, '--dir', directory]);
  }
  demand(fs.existsSync(path.join(directory, 'verified-remote.json')), 'Unresolved intent: metadata not verified; no automatic retry');
  const remote = read(path.join(directory, 'verified-remote.json'));
  demand(remote.inputSha256 === digest(input), 'Remote receipt input drift'); validateRemote(input, remote.run, remote.artifact);
  const files = verifyDownloadedBundle(input, directory);
  const receipt = { contract: DOWNLOAD_CONTRACT, decision: 'PASS', inputSha256: digest(input), releaseSha: input.releaseSha, runId: String(input.runId), runAttempt: String(input.runAttempt), artifactId: String(input.artifactId), completedAt: clock(), files };
  publish(receiptFile, receipt);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, directory] = process.argv.slice(2);
  demand(input && directory && process.argv.length === 4, 'Usage: node download-admitted-bundle.mjs input.json new-local-directory');
  console.log(canonical(acquire(read(input), directory)));
}
