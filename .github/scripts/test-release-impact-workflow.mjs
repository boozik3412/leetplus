#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflows = new Map([
  ["Fast CI", fs.readFileSync(path.join(REPOSITORY_ROOT, ".github/workflows/fast-ci.yml"), "utf8")],
  ["Full Release Admission", fs.readFileSync(path.join(REPOSITORY_ROOT, ".github/workflows/ci.yml"), "utf8")],
]);

function jobBlock(workflow, jobId) {
  const match = workflow.match(new RegExp(`(?:^|\\n)  ${jobId}:\\n[\\s\\S]*?(?=\\n  [a-z0-9_-]+:\\n|$)`, "u"));
  assert.ok(match, `missing workflow job ${jobId}`);
  return match[0];
}

for (const [label, workflow] of workflows) {
  const impact = jobBlock(workflow, "release_impact");
  assert.match(impact, /name: Release impact classification/u, `${label} must expose the classification gate`);
  assert.match(
    impact,
    /effective_lane: \$\{\{ steps\.classify\.outputs\.effective_lane \}\}/u,
    `${label} must publish the exact effective lane`,
  );
  assert.match(
    impact,
    /runtime_artifact_eligible: \$\{\{ steps\.classify\.outputs\.runtime_artifact_eligible \}\}/u,
    `${label} must publish the artifact decision`,
  );
  for (const command of [
    "node .github/scripts/test-release-impact-classifier.mjs",
    "node .github/scripts/test-release-impact-ci.mjs",
    "node .github/scripts/test-release-impact-workflow.mjs",
    "node .github/scripts/classify-release-impact-ci.mjs",
  ]) {
    assert.match(impact, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"), `${label} omits ${command}`);
  }
  assert.match(
    impact,
    /name: leetplus-release-impact-\$\{\{ env\.CI_RELEASE_SHA \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u,
    `${label} receipt artifact must be exact SHA/run/attempt bound`,
  );
  assert.doesNotMatch(
    impact,
    /ssh|168\.222\.143\.243|signed controller|production host/iu,
    `${label} classifier job must not have production authority`,
  );
}

for (const jobId of ["authority-root-trust", "application"]) {
  const block = jobBlock(workflows.get("Fast CI"), jobId);
  assert.match(block, /needs: release_impact/u, `Fast ${jobId} must wait for classification`);
  assert.match(
    block,
    /if: needs\.release_impact\.outputs\.effective_lane != 'L0_DOCS'/u,
    `Fast ${jobId} may skip only exact L0_DOCS`,
  );
}

for (const jobId of ["authority-root-trust", "application", "migration-smoke"]) {
  const block = jobBlock(workflows.get("Full Release Admission"), jobId);
  assert.match(block, /needs: release_impact/u, `Full ${jobId} must wait for classification`);
  assert.match(
    block,
    /if: needs\.release_impact\.outputs\.effective_lane != 'L0_DOCS'/u,
    `Full ${jobId} may skip only exact L0_DOCS`,
  );
}

const releaseArtifactApi = jobBlock(workflows.get("Full Release Admission"), "release-artifact-api");
assert.match(releaseArtifactApi, /needs: application/u, "runtime candidate must remain downstream of application gates");
const productionControl = jobBlock(workflows.get("Full Release Admission"), "production-control-candidate");
for (const dependency of ["authority-root-trust", "release-artifact-api", "migration-smoke"]) {
  assert.match(productionControl, new RegExp(`- ${dependency}`, "u"), `control candidate must still require ${dependency}`);
}

process.stdout.write("RELEASE_IMPACT_WORKFLOW_TEST=PASS\n");
