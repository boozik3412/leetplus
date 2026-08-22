#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY,
  assertFounderPilotRestoredCopyDatabaseUrl,
  inspectFounderPilotRestoredCopyTarget,
  loadFounderPilotRestoredCopyManifest,
  runFounderPilotRestoredCopyPreflight,
} from "./founder-pilot-restored-copy-preflight.mjs";

const DATABASE_URL_ENV = "FOUNDER_PILOT_RESTORED_COPY_DATABASE_URL";

function usage() {
  return `Usage:
  node founder-pilot-restored-copy-preflight.cli.mjs --manifest <absolute-json-path>

Required environment:
  ${DATABASE_URL_ENV}=postgresql://<owner>:<secret>@127.0.0.1:<non-5432>/<leetplus_restored_*>

This command is read-only. It never restores a backup, creates a role, applies a
migration, starts an application process, or contacts production/outbound services.`;
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true };
  }
  if (argv.length !== 2 || argv[0] !== "--manifest") {
    throw new Error("FOUNDER_PILOT_PREFLIGHT_ARGUMENTS_INVALID");
  }
  return { help: false, manifestPath: argv[1] };
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
) {
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
  try {
    const manifest = await loadFounderPilotRestoredCopyManifest(
      args.manifestPath,
    );
    const databaseUrl = environment[DATABASE_URL_ENV];
    assertFounderPilotRestoredCopyDatabaseUrl(databaseUrl, manifest.target);
    const result = await runFounderPilotRestoredCopyPreflight({
      inspectTarget: (expected) =>
        inspectFounderPilotRestoredCopyTarget(databaseUrl, expected),
      manifest,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.decision === FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY
      ? 0
      : 1;
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        contractVersion: "FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_V2",
        decision: "BLOCKED_MANUAL",
        reasonCode:
          error?.safeContractError === true
            ? error.reasonCode
            : "FOUNDER_PILOT_PREFLIGHT_UNEXPECTED_FAILURE",
      })}\n`,
    );
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
