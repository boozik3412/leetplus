#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  GATE_1MT_OPERATIONAL_PREFLIGHT_BLOCKED,
  GATE_1MT_OPERATIONAL_PREFLIGHT_CONTRACT,
  loadGate1mtOperationalManifest,
  runGate1mtOperationalPreflight,
} from "./gate-1mt-operational-preflight.mjs";

const RELEASE_SHA = /^[0-9a-f]{40}$/u;

function usage() {
  return `Usage:
  node gate-1mt-operational-preflight.cli.mjs \\
    --manifest <absolute-json-path> \\
    --expected-manifest-sha256 <64-lowercase-hex> \\
    --expected-release-sha <40-lowercase-hex>

This fail-closed command is read-only. It verifies immutable, digest-bound,
PII-free evidence for the exact release and emits a compact admission receipt.
It never deploys, mutates a database, opens a browser, sends provider traffic,
or changes a production kill switch.

Phases:
  CONTROLLED_CANARY       Provider evidence is forbidden; outbound stays off.
  PRODUCTION_GO_REVIEW    One successful explicitly approved canary per
                          required provider must already exist as evidence.`;
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true };
  }
  if (
    argv.length !== 6 ||
    argv[0] !== "--manifest" ||
    argv[2] !== "--expected-manifest-sha256" ||
    !/^[0-9a-f]{64}$/u.test(argv[3]) ||
    argv[4] !== "--expected-release-sha" ||
    !RELEASE_SHA.test(argv[5])
  ) {
    throw new Error("GATE_1MT_PREFLIGHT_ARGUMENTS_INVALID");
  }
  return {
    expectedManifestSha256: argv[3],
    expectedReleaseSha: argv[5],
    help: false,
    manifestPath: argv[1],
  };
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch {
    process.stderr.write(`${usage()}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  let result;
  try {
    const manifest = await loadGate1mtOperationalManifest(
      args.manifestPath,
      args.expectedManifestSha256,
    );
    result = await runGate1mtOperationalPreflight({
      expectedReleaseSha: args.expectedReleaseSha,
      manifest,
    });
  } catch (error) {
    result = {
      contractVersion: GATE_1MT_OPERATIONAL_PREFLIGHT_CONTRACT,
      decision: GATE_1MT_OPERATIONAL_PREFLIGHT_BLOCKED,
      reasonCode:
        error?.safeContractError === true
          ? error.reasonCode
          : "GATE_1MT_OPERATIONAL_PREFLIGHT_UNEXPECTED_FAILURE",
    };
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.decision === GATE_1MT_OPERATIONAL_PREFLIGHT_BLOCKED ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
