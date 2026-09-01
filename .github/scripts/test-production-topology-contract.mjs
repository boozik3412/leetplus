#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VERIFIER = path.join(
  REPOSITORY_ROOT,
  "docs/deployment/production-artifact/verify-production-topology-contract.mjs",
);
const CONTRACT = path.join(
  REPOSITORY_ROOT,
  "docs/deployment/production-artifact/production-topology-contract.json",
);

function run(contractPath) {
  return spawnSync(process.execPath, [VERIFIER, "--root", REPOSITORY_ROOT, "--contract", contractPath], {
    encoding: "utf8",
  });
}

function writeFixture(directory, name, mutate) {
  const contract = JSON.parse(fs.readFileSync(CONTRACT, "utf8"));
  mutate(contract);
  const fixture = path.join(directory, name);
  fs.writeFileSync(fixture, `${JSON.stringify(contract, null, 2)}\n`, { mode: 0o600 });
  return fixture;
}

const accepted = run(CONTRACT);
assert.equal(accepted.status, 0, accepted.stderr);
assert.match(accepted.stdout, /PRODUCTION_TOPOLOGY_CONTRACT=PASS/);

const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "leetplus-production-topology-"));
try {
  const sharedMembership = writeFixture(fixtureDirectory, "shared-membership.json", (contract) => {
    contract.runtimeIdentity.groups["leetplus-runtime"].explicitMembers.push("leetplus-rehearsal");
  });
  const rejectedMembership = run(sharedMembership);
  assert.notEqual(rejectedMembership.status, 0);
  assert.match(rejectedMembership.stderr, /leetplus-runtime\.explicitMembers/);

  const missingUserCallOverlay = writeFixture(fixtureDirectory, "missing-user-call-overlay.json", (contract) => {
    contract.systemdTemplates.api.environmentFiles.pop();
  });
  const rejectedOverlay = run(missingUserCallOverlay);
  assert.notEqual(rejectedOverlay.status, 0);
  assert.match(rejectedOverlay.stderr, /EnvironmentFile list/);

  const sharedReceipt = writeFixture(fixtureDirectory, "shared-slot-receipt.json", (contract) => {
    contract.releaseBinding.perDestinationSlotLinkReceiptRequired = false;
  });
  const rejectedReceipt = run(sharedReceipt);
  assert.notEqual(rejectedReceipt.status, 0);
  assert.match(rejectedReceipt.stderr, /perDestinationSlotLinkReceiptRequired/);
} finally {
  fs.rmSync(fixtureDirectory, { force: true, recursive: true });
}

process.stdout.write("PRODUCTION_TOPOLOGY_CONTRACT_TEST=PASS\n");
