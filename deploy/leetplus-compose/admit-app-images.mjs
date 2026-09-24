#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classify as classifyAppOnly } from '../../.github/scripts/classify-app-only.mjs';

import {
  APP_ADMISSION_CONTRACT,
  APP_BUNDLE_CONTRACT,
  RELEASE_LANE,
  canonical,
  demand,
  digest,
  exactKeys,
  fileDigest,
  readCanonicalJson,
  validateAppAdmission,
  validateAppBundle,
  validateAppOnlyReceipt,
  validateRequiredGateReceipt,
} from './app-only-artifact.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const HASH = /^[a-f0-9]{64}$/;
const FILES = Object.freeze([
  'app-bundle.json',
  'app-images.tar.gz',
  'control.tar.gz',
  'transport-validation.json',
  'archive-roundtrip.json',
  'network-validation.json',
  'runtime-validation.json',
]);

function cleanEnvironment() {
  const result = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined || /^(GIT_|LD_|DYLD_)/i.test(name) || ['NODE_OPTIONS', 'NODE_PATH', 'BASH_ENV', 'ENV'].includes(name)) continue;
    result[name] = value;
  }
  result.GIT_CONFIG_NOSYSTEM = '1';
  result.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : os.devNull;
  result.GIT_OPTIONAL_LOCKS = '0';
  result.LANG = 'C';
  result.LC_ALL = 'C';
  return result;
}

function run(executable, args, label, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: cleanEnvironment(),
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    ...options,
  });
  demand(!result.error && result.signal === null && result.status === 0, `${label} failed: ${(result.stderr ?? result.error?.message ?? '').trim().slice(0, 512)}`);
  return result.stdout.trim();
}

function verifySourceReceipts(impactFile, candidateFile, impact, candidate) {
  const head = run('git', ['-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'], 'Git HEAD');
  demand(head === impact.headSha && head === candidate.releaseSha, 'Checked-out Git source does not match receipt release SHA');
  demand(run('git', ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '--untracked-files=all'], 'Git cleanliness') === '', 'Admission requires an exact clean Git source tree');
  run(process.execPath, [
    path.join(ROOT, '.github/scripts/classify-release-impact.mjs'),
    '--root', ROOT,
    '--base-sha', impact.baseSha,
    '--head-sha', impact.headSha,
    '--minimum-lane', impact.minimumLane,
    '--verify-receipt', impactFile,
  ], 'Trusted impact receipt re-verification');
  run(process.execPath, [
    path.join(ROOT, '.github/scripts/classify-release-candidate.mjs'),
    '--root', ROOT,
    '--release-sha', candidate.releaseSha,
    '--event-name', candidate.eventName,
    '--ref', candidate.ref,
    '--event-before-sha', candidate.eventBeforeSha,
    '--repository', candidate.repository,
    '--workflow-ref', candidate.workflowRef,
    '--workflow-sha', candidate.workflowSha,
    '--impact-receipt', impactFile,
    '--verify-receipt', candidateFile,
  ], 'Exact main-push candidate re-verification');
}

function parseChecksums(root) {
  const sumFile = path.join(root, 'SHA256SUMS');
  const stat = fs.lstatSync(sumFile);
  demand(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size > 0 && stat.size < 64 * 1024, 'Unsafe SHA256SUMS');
  const lines = fs.readFileSync(sumFile, 'utf8').trimEnd().split('\n');
  demand(lines.length === FILES.length, 'SHA256SUMS file set is not exact');
  const sums = new Map();
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})  ([a-z0-9.-]+)$/);
    demand(match && FILES.includes(match[2]) && !sums.has(match[2]), 'Invalid SHA256SUMS record');
    sums.set(match[2], match[1]);
  }
  demand(FILES.every(name => sums.has(name)), 'SHA256SUMS is incomplete');
  return sums;
}

function archiveManifest(file, bundle) {
  // Docker save's manifest is the archive's complete image inventory. A
  // roundtrip report that mentions only the requested tags is insufficient.
  const list = spawnSync('tar', ['-tzf', file], { encoding: 'utf8', timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  demand(!list.error && list.signal === null && list.status === 0, 'Invalid app image tar/gzip archive');
  const members = list.stdout.trimEnd().split('\n').map(name => name.replace(/\r$/, ''));
  demand(members.includes('manifest.json') && members.every(name => name && !name.startsWith('/') &&
    !name.includes('\\') && !name.split('/').includes('..')), 'Unsafe or missing Docker archive manifest');
  const extracted = spawnSync('tar', ['-xOzf', file, 'manifest.json'], { encoding: 'utf8', timeout: 60_000,
    maxBuffer: 1024 * 1024, windowsHide: true });
  demand(!extracted.error && extracted.signal === null && extracted.status === 0, 'Cannot read Docker archive manifest');
  const manifest = JSON.parse(extracted.stdout);
  demand(Array.isArray(manifest) && manifest.length === 2, 'App archive contains an extra or missing image');
  const tags = new Map(manifest.map(item => {
    demand(item && Array.isArray(item.RepoTags) && item.RepoTags.length === 1 &&
      typeof item.Config === 'string' && Array.isArray(item.Layers) && item.Layers.length > 0,
    'Invalid Docker image manifest entry');
    return [item.RepoTags[0], item.Config];
  }));
  demand(tags.size === 2 && tags.get(`leetplus-api:${bundle.releaseSha}`) === `${bundle.appImages.api.slice(7)}.json` &&
    tags.get(`leetplus-web:${bundle.releaseSha}`) === `${bundle.appImages.web.slice(7)}.json`,
  'Docker archive tags/config IDs differ from admitted API/Web');
}

export function validateArtifactPayload(root) {
  const names = fs.readdirSync(root).sort();
  demand(JSON.stringify(names) === JSON.stringify([...FILES, 'SHA256SUMS'].sort()), 'App artifact file set is not exact');
  const sums = parseChecksums(root);
  for (const name of FILES) {
    const file = path.join(root, name);
    const stat = fs.lstatSync(file);
    demand(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size > 0, `Unsafe or empty app artifact ${name}`);
    demand(fileDigest(file) === sums.get(name), `App artifact checksum mismatch for ${name}`);
  }

  const bundle = validateAppBundle(readCanonicalJson(path.join(root, 'app-bundle.json'), 'app bundle').value);
  archiveManifest(path.join(root, 'app-images.tar.gz'), bundle);
  const transport = readCanonicalJson(path.join(root, 'transport-validation.json'), 'transport validation').value;
  exactKeys(transport, ['decision', 'driver', 'tlsRequired', 'badCaRejected', 'badHostnameRejected', 'nativeWorkerProfileAccepted'], 'transport validation');
  demand(transport.decision === 'PASS' && transport.tlsRequired === true && transport.badCaRejected === true && transport.badHostnameRejected === true && transport.nativeWorkerProfileAccepted === true, 'Real Prisma TLS matrix did not pass');

  const roundtrip = readCanonicalJson(path.join(root, 'archive-roundtrip.json'), 'archive roundtrip').value;
  exactKeys(roundtrip, ['decision', 'engine', 'store', 'isolatedDaemon', 'images', 'loadedImageIds'], 'archive roundtrip');
  demand(roundtrip.decision === 'PASS' && roundtrip.engine === '29.1.3' && roundtrip.store === 'containerd' && roundtrip.isolatedDaemon === true, 'Fresh daemon archive roundtrip did not pass');
  exactKeys(roundtrip.images, ['api', 'web'], 'roundtrip images');
  demand(canonical(roundtrip.images) === canonical(bundle.appImages), 'Archive contains images outside the exact API/Web bundle');
  demand(canonical(roundtrip.loadedImageIds) === canonical(Object.values(bundle.appImages).sort()),
    'Isolated daemon loaded additional image IDs');

  const network = readCanonicalJson(path.join(root, 'network-validation.json'), 'network validation').value;
  exactKeys(network, ['decision', 'stoppedCreation', 'loopbackHttp', 'webToApi', 'apiToData', 'webDataDenied', 'hostProxyDenied', 'externalDenied'], 'network validation');
  for (const key of ['stoppedCreation', 'loopbackHttp', 'webToApi', 'apiToData', 'webDataDenied', 'hostProxyDenied', 'externalDenied']) {
    demand(network[key] === true, `Network evidence omitted ${key}`);
  }
  demand(network.decision === 'PASS', 'Network matrix did not pass');

  const runtime = readCanonicalJson(path.join(root, 'runtime-validation.json'), 'runtime validation').value;
  exactKeys(runtime, [
    'decision', 'releaseSha', 'dualSlotConstructionVerified', 'apiBlueCreated', 'apiGreenCreated',
    'webBlueReady', 'webGreenReady', 'noDataImages', 'controlArchiveSha256', 'appImages',
  ], 'runtime validation');
  demand(runtime.decision === 'PASS' && runtime.releaseSha === bundle.releaseSha && runtime.dualSlotConstructionVerified === true && runtime.apiBlueCreated === true && runtime.apiGreenCreated === true && runtime.webBlueReady === true && runtime.webGreenReady === true && runtime.noDataImages === true, 'Dual-slot app construction evidence did not pass');
  demand(HASH.test(runtime.controlArchiveSha256 ?? '') && runtime.controlArchiveSha256 === sums.get('control.tar.gz'), 'Runtime evidence does not bind the exact Git control archive');
  exactKeys(runtime.appImages, ['api', 'web'], 'runtime app images');
  demand(canonical(runtime.appImages) === canonical(bundle.appImages), 'Runtime evidence image mismatch');

  const evidence = {
    transportValidationSha256: sums.get('transport-validation.json'),
    archiveRoundtripSha256: sums.get('archive-roundtrip.json'),
    networkValidationSha256: sums.get('network-validation.json'),
    runtimeValidationSha256: sums.get('runtime-validation.json'),
  };
  demand(canonical(bundle.runtimeEvidence) === canonical(evidence), 'Bundle runtime evidence hashes drifted');
  return { bundle, sums };
}

function exactControlArchiveDigest(releaseSha) {
  const result = spawnSync('git', [
    '-c', 'core.fsmonitor=false', 'archive', '--format=tar.gz', releaseSha, 'deploy/leetplus-compose',
  ], {
    cwd: ROOT,
    encoding: null,
    env: cleanEnvironment(),
    timeout: 60_000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  demand(!result.error && result.signal === null && result.status === 0 && Buffer.isBuffer(result.stdout), 'Exact Git control archive could not be reproduced');
  return digest(result.stdout);
}

export function validateParentReceipts(impactRecord, candidateRecord, appOnlyRecord, gateRecord) {
  const impact = impactRecord.value;
  const candidate = candidateRecord.value;
  const appOnly = validateAppOnlyReceipt(appOnlyRecord.value);
  const gates = validateRequiredGateReceipt(gateRecord.value);
  demand(impact?.schemaVersion === 1 && impact.receiptType === 'LEETPLUS_RELEASE_IMPACT_RECEIPT_V1' && impact.effectiveLane === 'L1_RUNTIME' && impact.runtimeArtifactEligible === true, 'Trusted impact is not exact L1 runtime');
  demand(candidate?.schemaVersion === 1 && candidate.receiptType === 'LEETPLUS_RELEASE_CANDIDATE_RECEIPT_V1' && candidate.deployableCandidate === true && candidate.decision === 'EXACT_MAIN_PUSH_DEPLOYABLE_CANDIDATE' && candidate.effectiveLane === 'L1_RUNTIME', 'Parent candidate is not exact main-push L1');
  demand(appOnly.releaseSha === impact.headSha && appOnly.diffBaseSha === impact.baseSha, 'App-only receipt source mismatch');
  demand(appOnly.impactReceiptSha256 === digest(impactRecord.raw) && appOnly.candidateReceiptSha256 === digest(candidateRecord.raw), 'App-only receipt parent hash mismatch');
  const recalculated = classifyAppOnly(impact, candidate, {
    impactSha256: digest(impactRecord.raw), candidateSha256: digest(candidateRecord.raw),
  });
  demand(canonical(recalculated) === canonical(appOnly), 'App-only receipt does not match the exact trusted diff/allowlist');
  demand(candidate.impactReceiptSha256 === digest(impactRecord.raw) && candidate.releaseSha === impact.headSha, 'Candidate does not bind trusted impact');
  demand(gates.releaseSha === appOnly.releaseSha && gates.candidateReceiptSha256 === digest(candidateRecord.raw) && gates.appOnlyReceiptSha256 === digest(appOnlyRecord.raw), 'Required gates do not bind exact parents');
  return { impact, candidate, appOnly, gates };
}

export function createAdmission({ artifactRoot, impactFile, candidateFile, appOnlyFile, requiredGatesFile, artifactName, artifactId, transportDigest }) {
  const impactRecord = readCanonicalJson(impactFile, 'impact receipt');
  const candidateRecord = readCanonicalJson(candidateFile, 'candidate receipt');
  const appOnlyRecord = readCanonicalJson(appOnlyFile, 'app-only receipt');
  const gateRecord = readCanonicalJson(requiredGatesFile, 'required-gate receipt');
  const parents = validateParentReceipts(impactRecord, candidateRecord, appOnlyRecord, gateRecord);
  verifySourceReceipts(impactFile, candidateFile, parents.impact, parents.candidate);
  const { bundle, sums } = validateArtifactPayload(artifactRoot);
  demand(bundle.contract === APP_BUNDLE_CONTRACT && bundle.releaseSha === parents.appOnly.releaseSha, 'Bundle source does not match app-only authority');
  demand(bundle.sourceImpact.baseSha === parents.impact.baseSha && bundle.sourceImpact.headSha === parents.impact.headSha && bundle.sourceImpact.classifierId === parents.impact.classifierId && bundle.sourceImpact.rulesSha256 === parents.impact.rulesSha256 && bundle.sourceImpact.impactReceiptSha256 === digest(impactRecord.raw), 'Bundle source impact mismatch');
  demand(bundle.compatibilityRequirements.policySha256 === parents.appOnly.allowlistSha256, 'Bundle policy does not match app-only allowlist');
  demand(sums.get('control.tar.gz') === exactControlArchiveDigest(bundle.releaseSha), 'Control archive is not the exact Git source archive');

  const gates = parents.gates;
  for (const [key, expected] of Object.entries({
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    event: process.env.GITHUB_EVENT_NAME,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    workflowRef: process.env.GITHUB_WORKFLOW_REF,
    workflowSha: process.env.GITHUB_WORKFLOW_SHA,
  })) demand(gates[key] === expected, `Required-gate ${key} does not match live workflow identity`);
  demand(gates.workflowSha === bundle.releaseSha, 'Workflow SHA does not match bundle source');
  demand(artifactName === `leetplus-compose-app-${bundle.releaseSha}-${gates.runId}-${gates.runAttempt}`, 'Unexpected app artifact name');
  demand(/^[1-9][0-9]*$/.test(artifactId ?? '') && HASH.test(transportDigest ?? ''), 'Invalid uploaded artifact identity');

  return validateAppAdmission({
    schemaVersion: 2,
    contract: APP_ADMISSION_CONTRACT,
    decision: 'PASS',
    releaseLane: RELEASE_LANE,
    releaseSha: bundle.releaseSha,
    repository: gates.repository,
    ref: gates.ref,
    event: gates.event,
    runId: gates.runId,
    runAttempt: gates.runAttempt,
    workflowRef: gates.workflowRef,
    workflowSha: gates.workflowSha,
    parentCandidateReceiptSha256: digest(candidateRecord.raw),
    parentImpactReceiptSha256: digest(impactRecord.raw),
    requiredGateReceiptSha256: digest(gateRecord.raw),
    gateReceiptSha256: {
      authorityRootTrust: gates.gateReceipts.AUTHORITY_ROOT_TRUST.sha256,
      application: gates.gateReceipts.RELEASE_CRITICAL_APPLICATION.sha256,
      postgresqlAssortment: gates.gateReceipts.RELEASE_CRITICAL_POSTGRESQL_ASSORTMENT.sha256,
      migrationSmoke: gates.gateReceipts.MIGRATION_SMOKE.sha256,
      appImageRuntime: gates.gateReceipts.COMPOSE_APP_RUNTIME.sha256,
    },
    appArtifact: { name: artifactName, id: artifactId, transportDigest },
    bundleManifestSha256: sums.get('app-bundle.json'),
    appArchiveSha256: sums.get('app-images.tar.gz'),
    transportValidationSha256: sums.get('transport-validation.json'),
    archiveRoundtripSha256: sums.get('archive-roundtrip.json'),
    networkValidationSha256: sums.get('network-validation.json'),
    runtimeValidationSha256: sums.get('runtime-validation.json'),
    appImages: bundle.appImages,
    schemaRequirementSha256: digest(bundle.schemaRequirement),
    compatibilityRequirementsSha256: digest(bundle.compatibilityRequirements),
  });
}

function main() {
  const [artifactRoot, impactFile, candidateFile, appOnlyFile, requiredGatesFile, output, artifactName, artifactId, transportDigest] = process.argv.slice(2);
  demand(artifactRoot && impactFile && candidateFile && appOnlyFile && requiredGatesFile && output && artifactName && artifactId && transportDigest, 'Expected artifact root, four receipts, output and uploaded artifact identity');
  const admission = createAdmission({
    artifactRoot: path.resolve(artifactRoot),
    impactFile: path.resolve(impactFile),
    candidateFile: path.resolve(candidateFile),
    appOnlyFile: path.resolve(appOnlyFile),
    requiredGatesFile: path.resolve(requiredGatesFile),
    artifactName,
    artifactId,
    transportDigest,
  });
  fs.writeFileSync(path.resolve(output), canonical(admission), { flag: 'wx', mode: 0o440 });
  process.stdout.write(`APP_IMAGE_ADMISSION=PASS releaseSha=${admission.releaseSha} releaseLane=${admission.releaseLane}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
