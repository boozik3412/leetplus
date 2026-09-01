#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = fs.readFileSync(path.join(REPOSITORY_ROOT, ".github/workflows/ci.yml"), "utf8");
const runtimeCandidate = "leetplus-release-${{ env.CI_RELEASE_SHA }}-candidate-${{ github.run_id }}";
const controlCandidate = "leetplus-production-control-${{ env.CI_RELEASE_SHA }}-candidate-${{ github.run_id }}";

function occurrences(value, needle) {
  return value.split(needle).length - 1;
}

assert.equal(occurrences(workflow, runtimeCandidate), 3, "runtime candidate must bind one upload and two downloads");
assert.equal(occurrences(workflow, controlCandidate), 2, "control candidate must bind one upload and one download");
assert.doesNotMatch(
  workflow,
  /candidate-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u,
  "non-deployable candidates must survive a selective failed-job rerun",
);

const runtimeUpload = workflow.match(
  /name: Upload non-deployable SHA-bound release candidate[\s\S]*?retention-days: 1\n\s+overwrite: true/u,
);
assert.ok(runtimeUpload, "runtime candidate upload must atomically replace the same run-bound non-deployable artifact");
const controlUpload = workflow.match(
  /name: Upload non-deployable production-control candidate[\s\S]*?retention-days: 1\n\s+overwrite: true/u,
);
assert.ok(controlUpload, "control candidate upload must atomically replace the same run-bound non-deployable artifact");

assert.match(
  workflow,
  /name: leetplus-release-\$\{\{ env\.CI_RELEASE_SHA \}\}-handoff-payload-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u,
  "deployable handoff evidence must remain bound to its producing attempt",
);
assert.match(
  workflow,
  /name: leetplus-release-admission-\$\{\{ env\.CI_RELEASE_SHA \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u,
  "final admission evidence must remain bound to its producing attempt",
);

process.stdout.write("RELEASE_ADMISSION_SELECTIVE_RERUN_TEST=PASS\n");
