#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONFIRMATION,
  applyGuestSupportCurrent189ProductionUpgradePlan,
  buildGuestSupportCurrent189ProductionUpgradePlan,
  createGuestSupportCurrent189ProductionLocalPostgresExecutor,
  createGuestSupportCurrent189ProductionPgAdapter,
  createGuestSupportCurrent189ProductionRuntimeAdapter,
  createGuestSupportCurrent189WorkerSafetyAdapter,
  inspectGuestSupportCurrent189ProductionUpgradeInventory,
  normalizeGuestSupportCurrent189ProductionUpgradeManifest,
  signGuestSupportCurrent189ProductionUpgradePlan,
  verifyGuestSupportCurrent189ProductionUpgradeFinal,
} from "./guest-support-current189-production-upgrade.mjs";
import { createFounderPilotProductionHistoryPhaseJournal } from "./founder-pilot-production-history-production.cli.mjs";

const CONFIRMATION_ENV = "GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONFIRM";
const APPROVAL_PIN_ENV =
  "GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_APPROVAL_KEY_SPKI_SHA256";
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_PRIVATE_KEY_BYTES = 16 * 1024;

function usage() {
  return `Usage:
  node guest-support-current189-production-upgrade.cli.mjs \\
    --mode inventory --target production --manifest <absolute-json-path>

  node guest-support-current189-production-upgrade.cli.mjs \\
    --mode plan --target production --manifest <absolute-json-path> \\
    --output-plan <new-absolute-json-path>

  node guest-support-current189-production-upgrade.cli.mjs \\
    --mode approve --manifest <absolute-json-path> --plan <absolute-json-path> \\
    --private-key <absolute-pkcs8-pem-path> --output-approval <new-absolute-json-path>

  node guest-support-current189-production-upgrade.cli.mjs \\
    --mode apply --target production --manifest <absolute-json-path> \\
    --plan <absolute-json-path> --approval <absolute-json-path> \\
    --confirm-plan-digest <sha256> --receipt <new-absolute-jsonl-path>

  node guest-support-current189-production-upgrade.cli.mjs \\
    --mode check --target production --manifest <absolute-json-path> \\
    --plan <absolute-json-path>

Production environment (all modes except approve):
  ${CONFIRMATION_ENV}=${GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONFIRMATION}
  ${APPROVAL_PIN_ENV}=<independently-pinned-Ed25519-SPKI-sha256>

The controller never accepts DATABASE_URL or a password. It connects only as
the local postgres OS authority through the exact manifest socket, port,
database name and cluster system identifier. plan is read-only and short-lived.
apply holds the protected production-control/cutover locks, quiesces the bonus
ledger timer, executes only the checksum-pinned CURRENT_189 migration in one
transaction, verifies unchanged OIDs/owners/ACL/role memberships, verifies both
runtime slots, restores the timer and writes a durable chained phase journal.`;
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
  if (argv.length === 0 || argv.length % 2 !== 0) {
    throw new Error("ARGUMENTS_INVALID");
  }
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
  const allowed = {
    apply: [
      "--approval",
      "--confirm-plan-digest",
      "--manifest",
      "--mode",
      "--plan",
      "--receipt",
      "--target",
    ],
    approve: [
      "--manifest",
      "--mode",
      "--output-approval",
      "--plan",
      "--private-key",
    ],
    check: ["--manifest", "--mode", "--plan", "--target"],
    inventory: ["--manifest", "--mode", "--target"],
    plan: ["--manifest", "--mode", "--output-plan", "--target"],
  }[mode];
  if (
    !allowed ||
    values.size !== allowed.length ||
    [...values.keys()].some((key) => !allowed.includes(key)) ||
    (mode !== "approve" && values.get("--target") !== "production")
  ) {
    throw new Error("ARGUMENTS_INVALID");
  }
  const result = { help: false, mode };
  for (const [argument, key] of [
    ["--approval", "approvalPath"],
    ["--manifest", "manifestPath"],
    ["--output-approval", "outputApprovalPath"],
    ["--output-plan", "outputPlanPath"],
    ["--plan", "planPath"],
    ["--private-key", "privateKeyPath"],
    ["--receipt", "receiptPath"],
  ]) {
    if (values.has(argument)) result[key] = absolutePath(values.get(argument));
  }
  if (values.has("--confirm-plan-digest")) {
    const candidate = values.get("--confirm-plan-digest");
    if (!/^[0-9a-f]{64}$/u.test(candidate)) {
      throw new Error("PLAN_DIGEST_INVALID");
    }
    result.confirmPlanDigest = candidate;
  }
  return result;
}

async function readBoundedRegularFile(filePath, maximumBytes) {
  const metadata = await lstat(filePath, { bigint: true }).catch(() => null);
  if (!metadata?.isFile() || metadata.isSymbolicLink()) {
    throw new Error("INPUT_FILE_INVALID");
  }
  const canonical = await realpath(filePath);
  if (canonical !== filePath) throw new Error("INPUT_FILE_INVALID");
  const handle = await open(canonical, fsConstants.O_RDONLY);
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
  if (!raw.endsWith("\n") || raw.includes("\0")) {
    throw new Error("JSON_FILE_INVALID");
  }
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
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function assertProductionEnvironment(environment) {
  if (
    environment[CONFIRMATION_ENV] !==
      GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONFIRMATION ||
    !/^[0-9a-f]{64}$/u.test(environment[APPROVAL_PIN_ENV] ?? "")
  ) {
    throw new Error("CURRENT189_UPGRADE_PRODUCTION_ENVIRONMENT_INVALID");
  }
}

function blocked(error) {
  return {
    contractVersion: "GUEST_SUPPORT_PRODUCTION_188_TO_189_V1",
    decision: "BLOCKED_MANUAL",
    reasonCode:
      typeof error?.reasonCode === "string"
        ? error.reasonCode
        : typeof error?.message === "string" &&
            /^[A-Z][A-Z0-9_]{2,100}$/u.test(error.message)
          ? error.message
          : "CURRENT189_UPGRADE_UNEXPECTED_FAILURE",
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
  let journal = null;
  let runtimeAdapter = null;
  try {
    const manifest = normalizeGuestSupportCurrent189ProductionUpgradeManifest(
      await loadJson(args.manifestPath),
    );
    if (args.mode === "approve") {
      const [plan, privateKeyPem] = await Promise.all([
        loadJson(args.planPath),
        readBoundedRegularFile(args.privateKeyPath, MAX_PRIVATE_KEY_BYTES),
      ]);
      const approval = signGuestSupportCurrent189ProductionUpgradePlan({
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
    const adapter = createGuestSupportCurrent189ProductionPgAdapter(manifest);
    if (args.mode === "inventory") {
      const inventory =
        await inspectGuestSupportCurrent189ProductionUpgradeInventory({
          adapter,
          manifest,
        });
      process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
      return 0;
    }
    runtimeAdapter = createGuestSupportCurrent189ProductionRuntimeAdapter({
      releaseSha: manifest.release.releaseSha,
    });
    if (args.mode === "plan") {
      const plan = await buildGuestSupportCurrent189ProductionUpgradePlan({
        adapter,
        manifest,
        runtimeAdapter,
      });
      await writeExclusiveJson(args.outputPlanPath, plan);
      process.stdout.write(
        `${JSON.stringify({ decision: plan.decision, planDigest: plan.planDigest }, null, 2)}\n`,
      );
      return 0;
    }
    const plan = await loadJson(args.planPath);
    if (args.mode === "check") {
      const result = await verifyGuestSupportCurrent189ProductionUpgradeFinal({
        adapter,
        manifest,
        plan,
        runtimeAdapter,
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }
    const approval = await loadJson(args.approvalPath);
    journal = await createFounderPilotProductionHistoryPhaseJournal(
      args.receiptPath,
    );
    const result = await applyGuestSupportCurrent189ProductionUpgradePlan({
      adapter,
      approval,
      confirmPlanDigest: args.confirmPlanDigest,
      executor: createGuestSupportCurrent189ProductionLocalPostgresExecutor(),
      manifest,
      onPhase: journal.record,
      pinnedApprovalKeySpkiSha256: environment[APPROVAL_PIN_ENV],
      plan,
      productionConfirmation: environment[CONFIRMATION_ENV],
      runtimeAdapter,
      workerSafetyAdapter: createGuestSupportCurrent189WorkerSafetyAdapter(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(blocked(error), null, 2)}\n`);
    return 1;
  } finally {
    await journal?.close().catch(() => undefined);
    await runtimeAdapter?.close().catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
