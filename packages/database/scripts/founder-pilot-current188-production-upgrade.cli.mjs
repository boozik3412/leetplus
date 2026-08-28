#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION,
  applyFounderPilotCurrent188ProductionUpgradePlan,
  buildFounderPilotCurrent188ProductionUpgradePlan,
  createFounderPilotCurrent188ProductionUpgradePgAdapter,
  inspectFounderPilotCurrent188ProductionUpgradeInventory,
  normalizeFounderPilotCurrent188ProductionUpgradeManifest,
  signFounderPilotCurrent188ProductionUpgradePlan,
  verifyFounderPilotCurrent188ProductionUpgradeFinal,
} from "./founder-pilot-current188-production-upgrade.mjs";
import {
  createFounderPilotProductionHistoryPhaseJournal,
  runBoundedFounderPilotProductionHistoryPrismaDeploy,
} from "./founder-pilot-production-history-production.cli.mjs";

const DATABASE_URL_ENV =
  "FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_DATABASE_URL";
const CONFIRMATION_ENV = "FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRM";
const APPROVAL_PIN_ENV =
  "FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_APPROVAL_KEY_SPKI_SHA256";
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_PRIVATE_KEY_BYTES = 16 * 1024;

function usage() {
  return `Usage:
  node founder-pilot-current188-production-upgrade.cli.mjs \\
    --mode inventory --target production --manifest <absolute-json-path> \\
    --source-prisma-root <absolute-path> --lane-root <absolute-path>

  node founder-pilot-current188-production-upgrade.cli.mjs \\
    --mode plan --target production --manifest <absolute-json-path> \\
    --source-prisma-root <absolute-path> --lane-root <absolute-path> \\
    --output-plan <absolute-json-path>

  node founder-pilot-current188-production-upgrade.cli.mjs \\
    --mode approve --manifest <absolute-json-path> --plan <absolute-json-path> \\
    --private-key <absolute-pkcs8-pem-path> --output-approval <absolute-json-path>

  node founder-pilot-current188-production-upgrade.cli.mjs \\
    --mode apply --target production --manifest <absolute-json-path> \\
    --source-prisma-root <absolute-path> --lane-root <absolute-path> \\
    --plan <absolute-json-path> --approval <absolute-json-path> \\
    --confirm-plan-digest <sha256> --prisma-cli <absolute-js-path> \\
    --receipt <absolute-jsonl-path>

  node founder-pilot-current188-production-upgrade.cli.mjs \\
    --mode check --target production --manifest <absolute-json-path> \\
    --source-prisma-root <absolute-path> --lane-root <absolute-path>

Production environment (all modes except approve):
  ${DATABASE_URL_ENV}=postgresql://<migration-role>:<secret>@127.0.0.1:<port>/<db>?options=-c%20role%3D<object-owner-role>
  ${CONFIRMATION_ENV}=${FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION}
  ${APPROVAL_PIN_ENV}=<independently-pinned-Ed25519-SPKI-sha256>

inventory and plan are database read-only. apply accepts only exact 187 applied
plus the four checksum-pinned historical rolled-back rows,
the one checksum-pinned CURRENT_188 migration, a live short-lived signed plan,
and a durable phase journal. Partial or unknown migration state blocks without
changing systemd, slots, nginx, feature flags, or outbound configuration.`;
}

function absolutePath(value) {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  ) {
    throw new Error("ABSOLUTE_PATH_REQUIRED");
  }
  return path.resolve(value);
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  if (argv.length === 0 || argv.length % 2 !== 0)
    throw new Error("ARGUMENTS_INVALID");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || values.has(key) || value === undefined) {
      throw new Error("ARGUMENTS_INVALID");
    }
    values.set(key, value);
  }
  const mode = values.get("--mode");
  if (!["apply", "approve", "check", "inventory", "plan"].includes(mode)) {
    throw new Error("MODE_INVALID");
  }
  const allowed = {
    apply: [
      "--approval",
      "--confirm-plan-digest",
      "--lane-root",
      "--manifest",
      "--mode",
      "--plan",
      "--prisma-cli",
      "--receipt",
      "--source-prisma-root",
      "--target",
    ],
    approve: [
      "--manifest",
      "--mode",
      "--output-approval",
      "--plan",
      "--private-key",
    ],
    check: [
      "--lane-root",
      "--manifest",
      "--mode",
      "--source-prisma-root",
      "--target",
    ],
    inventory: [
      "--lane-root",
      "--manifest",
      "--mode",
      "--source-prisma-root",
      "--target",
    ],
    plan: [
      "--lane-root",
      "--manifest",
      "--mode",
      "--output-plan",
      "--source-prisma-root",
      "--target",
    ],
  }[mode];
  if (
    values.size !== allowed.length ||
    [...values.keys()].some((key) => !allowed.includes(key)) ||
    (mode !== "approve" && values.get("--target") !== "production")
  ) {
    throw new Error("ARGUMENTS_INVALID");
  }
  const result = { help: false, mode };
  for (const [argument, key] of [
    ["--approval", "approvalPath"],
    ["--lane-root", "laneRoot"],
    ["--manifest", "manifestPath"],
    ["--output-approval", "outputApprovalPath"],
    ["--output-plan", "outputPlanPath"],
    ["--plan", "planPath"],
    ["--prisma-cli", "prismaCliPath"],
    ["--private-key", "privateKeyPath"],
    ["--receipt", "receiptPath"],
    ["--source-prisma-root", "sourcePrismaRoot"],
  ]) {
    if (values.has(argument)) result[key] = absolutePath(values.get(argument));
  }
  if (values.has("--confirm-plan-digest")) {
    const candidate = values.get("--confirm-plan-digest");
    if (!/^[0-9a-f]{64}$/u.test(candidate))
      throw new Error("PLAN_DIGEST_INVALID");
    result.confirmPlanDigest = candidate;
  }
  return result;
}

async function readBoundedRegularFile(filePath, maximumBytes) {
  const metadata = await lstat(filePath, { bigint: true }).catch(() => null);
  if (!metadata || metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("INPUT_FILE_INVALID");
  }
  const handle = await open(await realpath(filePath), fsConstants.O_RDONLY);
  try {
    const before = await handle.stat({ bigint: true });
    if (before.size < 2n || before.size > BigInt(maximumBytes)) {
      throw new Error("INPUT_FILE_INVALID");
    }
    const bytes = Buffer.alloc(Number(before.size));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat({ bigint: true });
    if (
      bytesRead !== bytes.length ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs
    ) {
      throw new Error("INPUT_FILE_CHANGED");
    }
    return bytes.toString("utf8");
  } finally {
    await handle.close();
  }
}

async function loadJson(filePath) {
  const raw = await readBoundedRegularFile(filePath, MAX_JSON_BYTES);
  if (!raw.endsWith("\n") || raw.includes("\0"))
    throw new Error("JSON_FILE_INVALID");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("JSON_FILE_INVALID");
  }
}

async function writeExclusiveJson(filePath, value) {
  const handle = await open(
    filePath,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function assertProductionEnvironment(environment) {
  if (
    environment[CONFIRMATION_ENV] !==
      FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION ||
    typeof environment[DATABASE_URL_ENV] !== "string" ||
    !/^[0-9a-f]{64}$/u.test(environment[APPROVAL_PIN_ENV] ?? "")
  ) {
    throw new Error("CURRENT188_UPGRADE_PRODUCTION_ENVIRONMENT_INVALID");
  }
}

function blocked(error) {
  return {
    contractVersion: "FOUNDER_PILOT_PRODUCTION_HISTORY_187_TO_188_V1",
    decision: "BLOCKED_MANUAL",
    reasonCode:
      typeof error?.reasonCode === "string"
        ? error.reasonCode
        : typeof error?.message === "string" &&
            /^[A-Z][A-Z0-9_]{2,100}$/u.test(error.message)
          ? error.message
          : "CURRENT188_UPGRADE_UNEXPECTED_FAILURE",
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
  let journal = null;
  try {
    const manifest = normalizeFounderPilotCurrent188ProductionUpgradeManifest(
      await loadJson(args.manifestPath),
    );
    if (args.mode === "approve") {
      const [plan, privateKeyPem] = await Promise.all([
        loadJson(args.planPath),
        readBoundedRegularFile(args.privateKeyPath, MAX_PRIVATE_KEY_BYTES),
      ]);
      const approval = signFounderPilotCurrent188ProductionUpgradePlan({
        manifest,
        plan,
        privateKeyPem,
      });
      await writeExclusiveJson(args.outputApprovalPath, approval);
      process.stdout.write(
        `${JSON.stringify({ decision: "APPROVAL_WRITTEN", planDigest: plan.planDigest }, null, 2)}\n`,
      );
      return 0;
    }
    assertProductionEnvironment(environment);
    adapter = await createFounderPilotCurrent188ProductionUpgradePgAdapter(
      environment[DATABASE_URL_ENV],
      manifest,
      { productionConfirmation: environment[CONFIRMATION_ENV] },
    );
    if (args.mode === "inventory") {
      const inventory =
        await inspectFounderPilotCurrent188ProductionUpgradeInventory({
          adapter,
          laneRoot: args.laneRoot,
          manifest,
          sourcePrismaRoot: args.sourcePrismaRoot,
        });
      process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
      return 0;
    }
    if (args.mode === "plan") {
      const plan = await buildFounderPilotCurrent188ProductionUpgradePlan({
        adapter,
        laneRoot: args.laneRoot,
        manifest,
        sourcePrismaRoot: args.sourcePrismaRoot,
      });
      await writeExclusiveJson(args.outputPlanPath, plan);
      process.stdout.write(
        `${JSON.stringify({ decision: plan.decision, planDigest: plan.planDigest }, null, 2)}\n`,
      );
      return 0;
    }
    if (args.mode === "check") {
      await adapter.acquireLock();
      try {
        const result = await verifyFounderPilotCurrent188ProductionUpgradeFinal(
          {
            adapter,
            laneRoot: args.laneRoot,
            manifest,
            sourcePrismaRoot: args.sourcePrismaRoot,
          },
        );
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } finally {
        await adapter.releaseLock().catch(() => undefined);
      }
      return 0;
    }
    const [plan, approval] = await Promise.all([
      loadJson(args.planPath),
      loadJson(args.approvalPath),
    ]);
    journal = await createFounderPilotProductionHistoryPhaseJournal(
      args.receiptPath,
    );
    const result = await applyFounderPilotCurrent188ProductionUpgradePlan({
      adapter,
      approval,
      confirmPlanDigest: args.confirmPlanDigest,
      deploy: ({ laneRoot, timeoutSeconds }) =>
        runBoundedFounderPilotProductionHistoryPrismaDeploy({
          databaseUrl: environment[DATABASE_URL_ENV],
          laneRoot,
          prismaCliPath: args.prismaCliPath,
          timeoutSeconds,
        }),
      laneRoot: args.laneRoot,
      manifest,
      onPhase: journal.record,
      pinnedApprovalKeySpkiSha256: environment[APPROVAL_PIN_ENV],
      plan,
      productionConfirmation: environment[CONFIRMATION_ENV],
      sourcePrismaRoot: args.sourcePrismaRoot,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(blocked(error), null, 2)}\n`);
    return 1;
  } finally {
    await journal?.close().catch(() => undefined);
    await adapter?.close().catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
