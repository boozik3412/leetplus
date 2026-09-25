#!/usr/bin/env node
// Run only in the exact-main Full workflow. CI_GATE_RESULTS must be composed
// from GitHub's `needs.<job>.result`, never from an operator-supplied file.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NAMES = ['AUTHORITY_ROOT_TRUST', 'RELEASE_CRITICAL_APPLICATION',
  'RELEASE_CRITICAL_POSTGRESQL_ASSORTMENT', 'MIGRATION_SMOKE', 'COMPOSE_APP_RUNTIME'];
const SHA = /^[a-f0-9]{40}$/, HASH = /^[a-f0-9]{64}$/;
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function demand(value, message) { if (!value) throw new Error(`app-only gate receipt: ${message}`); }
function read(file) {
  const s = fs.lstatSync(file);
  demand(s.isFile() && !s.isSymbolicLink() && s.nlink === 1 && s.size > 0 && s.size < 1024 * 1024, 'unsafe parent receipt');
  const raw = fs.readFileSync(file, 'utf8'), value = JSON.parse(raw);
  demand(raw === canonical(value), 'noncanonical parent receipt');
  return { raw, value };
}
export function createGateReceipt({ candidate, appOnly, candidateHash, appOnlyHash,
  results, releaseSha, runId, runAttempt }) {
  demand(SHA.test(releaseSha) && HASH.test(candidateHash) && HASH.test(appOnlyHash), 'invalid identity');
  demand(candidate.releaseSha === releaseSha && candidate.deployableCandidate === true &&
    candidate.decision === 'EXACT_MAIN_PUSH_DEPLOYABLE_CANDIDATE' && candidate.ref === 'refs/heads/main' &&
    candidate.eventName === 'push' && appOnly.contract === 'LEETPLUS_APP_ONLY_IMPACT_V2' &&
    appOnly.decision === 'PASS' && appOnly.releaseLane === 'L1_APP_ONLY' && appOnly.releaseSha === releaseSha &&
    appOnly.candidateReceiptSha256 === candidateHash, 'parent decision mismatch');
  demand(/^[1-9][0-9]*$/.test(runId) && /^[1-9][0-9]*$/.test(runAttempt), 'invalid run identity');
  demand(results && typeof results === 'object' && !Array.isArray(results) &&
    JSON.stringify(Object.keys(results).sort()) === JSON.stringify([...NAMES].sort()), 'gate result set drift');
  const gateReceipts = {};
  for (const name of NAMES) {
    demand(results[name] === 'success', `${name} did not succeed in this run`);
    gateReceipts[name] = { result: 'SUCCESS', sha256: digest(canonical({
      contract: 'LEETPLUS_ACTIONS_JOB_RESULT_V2', releaseSha, runId, runAttempt, name, result: 'success',
    })) };
  }
  return { contract: 'LEETPLUS_APP_ONLY_REQUIRED_GATES_V2', decision: 'PASS',
    releaseLane: 'L1_APP_ONLY', releaseSha, repository: 'boozik3412/leetplus',
    ref: 'refs/heads/main', event: 'push', runId, runAttempt,
    workflowRef: 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main', workflowSha: releaseSha,
    candidateReceiptSha256: candidateHash, appOnlyReceiptSha256: appOnlyHash,
    requiredGates: NAMES, gateReceipts };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [candidatePath, appOnlyPath, output] = process.argv.slice(2);
    demand(candidatePath && appOnlyPath && output, 'expected candidate, app-only and output paths');
    demand(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_NAME === 'push' &&
      process.env.GITHUB_REF === 'refs/heads/main' && process.env.GITHUB_REPOSITORY === 'boozik3412/leetplus' &&
      process.env.GITHUB_WORKFLOW_REF === 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main' &&
      process.env.GITHUB_WORKFLOW_SHA === process.env.GITHUB_SHA,
    'requires exact-main Actions workflow');
    const candidate = read(candidatePath), appOnly = read(appOnlyPath);
    const receipt = createGateReceipt({ candidate: candidate.value, appOnly: appOnly.value,
      candidateHash: digest(candidate.raw), appOnlyHash: digest(appOnly.raw),
      results: JSON.parse(process.env.CI_GATE_RESULTS ?? 'null'), releaseSha: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT });
    fs.writeFileSync(output, canonical(receipt), { flag: 'wx', mode: 0o440 });
    process.stdout.write('APP_ONLY_REQUIRED_GATES=PASS\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`); process.exitCode = 1;
  }
}
