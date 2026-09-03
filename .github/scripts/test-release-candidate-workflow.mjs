#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fast = fs.readFileSync(path.join(REPOSITORY_ROOT, ".github/workflows/fast-ci.yml"), "utf8");
const full = fs.readFileSync(path.join(REPOSITORY_ROOT, ".github/workflows/ci.yml"), "utf8");

function jobBlock(workflow, jobId) {
  const match = workflow.match(new RegExp(`(?:^|\\n)  ${jobId}:\\n[\\s\\S]*?(?=\\n  [a-z0-9_-]+:\\n|$)`, "u"));
  assert.ok(match, `missing workflow job ${jobId}`);
  return match[0];
}

assert.match(
  fast,
  /group: fast-ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name \}\}-\$\{\{ github\.event_name == 'pull_request' && github\.ref \|\| github\.sha \}\}/u,
  "Fast CI must cancel superseded PR heads without canceling an exact main SHA",
);
assert.match(
  fast,
  /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/u,
  "Fast CI cancellation must be limited to pull requests",
);
assert.match(
  full,
  /group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name \}\}-\$\{\{ github\.sha \}\}/u,
  "Full admission concurrency must bind an exact event/SHA",
);
assert.match(full, /cancel-in-progress: false/u, "a later main push must not cancel an exact admission candidate");

for (const [label, workflow] of [["Fast", fast], ["Full", full]]) {
  const impact = jobBlock(workflow, "release_impact");
  assert.match(
    impact,
    /node \.github\/scripts\/test-release-candidate-classifier\.mjs/u,
    `${label} CI must run the release candidate negative matrix`,
  );
  assert.match(
    impact,
    /node \.github\/scripts\/test-release-candidate-workflow\.mjs/u,
    `${label} CI must pin the release candidate workflow contract`,
  );
}

const impact = jobBlock(full, "release_impact");
assert.match(
  impact,
  /deployable_candidate: \$\{\{ steps\.classify\.outputs\.deployable_candidate \}\}/u,
  "Full admission must publish the exact deployable-candidate decision",
);
assert.match(
  impact,
  /impact_receipt_sha256: \$\{\{ steps\.classify\.outputs\.impact_receipt_sha256 \}\}/u,
  "Full admission must publish the exact classified-impact digest",
);
assert.match(
  impact,
  /node \.github\/scripts\/classify-release-candidate\.mjs[\s\S]*?--output "\$candidate_receipt"/u,
  "Full admission must materialize the candidate receipt",
);
assert.match(
  impact,
  /node \.github\/scripts\/classify-release-candidate\.mjs[\s\S]*?--verify-receipt "\$candidate_receipt"/u,
  "Full admission must independently re-verify the candidate receipt",
);
assert.match(
  impact,
  /name: leetplus-release-candidate-authority-\$\{\{ env\.CI_RELEASE_SHA \}\}-\$\{\{ github\.run_id \}\}/u,
  "selective reruns need one stable exact-SHA/run candidate authority artifact",
);
assert.doesNotMatch(
  impact,
  /name: leetplus-release-candidate-authority-[^\n]*run_attempt/u,
  "intermediate candidate authority must not depend on run_attempt",
);
assert.match(impact, /overwrite: true/u, "a full rerun must replace the stable intermediate authority atomically");
assert.match(
  impact,
  /if: steps\.classify\.outputs\.deployable_candidate == 'true'/u,
  "manual, scheduled, and docs-only validations must not publish candidate authority",
);

const handoff = jobBlock(full, "release-handoff");
assert.match(handoff, /- release_impact/u, "the final handoff must depend on release-candidate classification");
assert.match(
  handoff,
  /if: needs\.release_impact\.outputs\.deployable_candidate == 'true'/u,
  "only an exact deployable candidate may enter the final handoff",
);
assert.match(
  handoff,
  /id: candidate_authority/u,
  "final handoff must make the reverified lane authority available only to downstream steps",
);
assert.match(
  handoff,
  /RECEIPT_EFFECTIVE_LANE: \$\{\{ steps\.candidate_authority\.outputs\.effective_lane \}\}/u,
  "final admission receipt must bind the reverified effective lane",
);
assert.match(
  handoff,
  /RECEIPT_IMPACT_RECEIPT_SHA256: \$\{\{ steps\.candidate_authority\.outputs\.impact_receipt_sha256 \}\}/u,
  "final admission receipt must bind the reverified impact receipt digest",
);
assert.match(handoff, /schemaVersion: 2,/u, "final admission receipt must use the lane-aware schema");
assert.match(
  handoff,
  /name: Download exact release-candidate authority/u,
  "the final handoff must consume the bounded candidate authority artifact",
);
assert.match(
  handoff,
  /--verify-receipt "\$candidate_receipt"/u,
  "the final handoff must re-verify candidate authority from its fresh checkout",
);
assert.match(handoff, /\[\[ "\$GITHUB_EVENT_NAME" == 'push' \]\]/u, "final receipt creation must require push");
assert.match(
  handoff,
  /\[\[ "\$GITHUB_REF" == 'refs\/heads\/main' \]\]/u,
  "final receipt creation must require refs/heads/main",
);

process.stdout.write("RELEASE_CANDIDATE_WORKFLOW_TEST=PASS\n");
