#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  applyFounderPilotProductionHistoryPlan,
  buildFounderPilotProductionHistoryPlan,
  createFounderPilotProductionHistoryPgAdapter,
  verifyFounderPilotProductionHistoryRehearsal,
} from "./founder-pilot-production-history-rehearsal.mjs";
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
  node founder-pilot-production-history-rehearsal.cli.mjs \\
    --mode <plan|apply|check> \\
    --manifest <absolute-json-path> \\
    --source-prisma-root <absolute-path> \\
    --lane-root <absolute-path> \\
    [--confirm-plan-digest <sha256>]

Environment:
  ${DATABASE_URL_ENV}=postgresql://<owner>:<secret>@127.0.0.1:<non-5432>/<leetplus_restored_*>

plan is read-only. apply requires the exact plan digest, creates a disposable
Prisma lane, and reconciles only the exact stale restored-copy digest rows.
It never runs Prisma. Run the exact release Prisma migrate deploy against the
materialized lane, then use check. Production hosts and port 5432 are refused.`;
}

function absolutePath(value) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 3 ||
    value.length > 4096 ||
    !path.isAbsolute(value)
  ) {
    throw new Error("PATH_INVALID");
  }
  return value;
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true };
  }
  if (argv.length % 2 !== 0) throw new Error("ARGUMENTS_INVALID");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (
      ![
        "--confirm-plan-digest",
        "--lane-root",
        "--manifest",
        "--mode",
        "--source-prisma-root",
      ].includes(key) ||
      values.has(key)
    ) {
      throw new Error("ARGUMENTS_INVALID");
    }
    values.set(key, argv[index + 1]);
  }
  const mode = values.get("--mode");
  const manifestPath = values.get("--manifest");
  const sourcePrismaRoot = values.get("--source-prisma-root");
  const laneRoot = values.get("--lane-root");
  const confirmPlanDigest = values.get("--confirm-plan-digest") ?? null;
  if (
    !["apply", "check", "plan"].includes(mode) ||
    manifestPath === undefined ||
    sourcePrismaRoot === undefined ||
    laneRoot === undefined ||
    (mode === "apply" && confirmPlanDigest === null) ||
    (mode !== "apply" && confirmPlanDigest !== null)
  ) {
    throw new Error("ARGUMENTS_INVALID");
  }
  return {
    confirmPlanDigest,
    help: false,
    laneRoot: absolutePath(laneRoot),
    manifestPath: absolutePath(manifestPath),
    mode,
    sourcePrismaRoot: absolutePath(sourcePrismaRoot),
  };
}

function blocked(error) {
  return {
    contractVersion: "FOUNDER_PILOT_PRODUCTION_HISTORY_REHEARSAL_V1",
    decision: "BLOCKED_MANUAL",
    reasonCode:
      error?.safeContractError === true
        ? error.reasonCode
        : "FOUNDER_PILOT_HISTORY_CLI_FAILURE",
  };
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
  let adapter = null;
  try {
    const manifest = await loadFounderPilotRestoredCopyManifest(
      args.manifestPath,
    );
    const databaseUrl = environment[DATABASE_URL_ENV];
    assertFounderPilotRestoredCopyDatabaseUrl(databaseUrl, manifest.target);
    if (args.mode !== "check") {
      const preflight = await runFounderPilotRestoredCopyPreflight({
        inspectTarget: (expected) =>
          inspectFounderPilotRestoredCopyTarget(databaseUrl, expected),
        manifest,
      });
      if (preflight.decision !== FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY) {
        process.stdout.write(`${JSON.stringify(preflight, null, 2)}\n`);
        return 1;
      }
    }
    adapter = await createFounderPilotProductionHistoryPgAdapter(
      databaseUrl,
      manifest.target,
    );
    let result;
    if (args.mode === "check") {
      result = await verifyFounderPilotProductionHistoryRehearsal({
        adapter,
        laneRoot: args.laneRoot,
      });
    } else {
      const plan = await buildFounderPilotProductionHistoryPlan({
        inspectTarget: adapter.inspectTarget,
        manifest,
        sourcePrismaRoot: args.sourcePrismaRoot,
      });
      result =
        args.mode === "plan"
          ? { decision: "PLAN_READY", reasonCode: null, ...plan }
          : await applyFounderPilotProductionHistoryPlan({
              adapter,
              confirmPlanDigest: args.confirmPlanDigest,
              laneRoot: args.laneRoot,
              manifest,
              plan,
              sourcePrismaRoot: args.sourcePrismaRoot,
            });
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(blocked(error), null, 2)}\n`);
    return 1;
  } finally {
    await adapter?.close().catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
