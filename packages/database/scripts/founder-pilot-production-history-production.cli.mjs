#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open, realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
  applyFounderPilotProductionHistoryProductionPlan,
  buildFounderPilotProductionHistoryProductionPlan,
  createFounderPilotProductionHistoryProductionPgAdapter,
  inspectFounderPilotProductionHistoryProductionInventory,
  loadFounderPilotProductionHistoryPrivateKey,
  loadFounderPilotProductionHistoryProductionApproval,
  loadFounderPilotProductionHistoryProductionManifest,
  loadFounderPilotProductionHistoryProductionPlan,
  signFounderPilotProductionHistoryProductionPlan,
  verifyFounderPilotProductionHistoryProductionFinal,
} from "./founder-pilot-production-history-production.mjs";

const DATABASE_URL_ENV =
  "FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_DATABASE_URL";
const PRODUCTION_CONFIRMATION_ENV =
  "FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRM";
const APPROVAL_KEY_PIN_ENV =
  "FOUNDER_PILOT_PRODUCTION_HISTORY_APPROVAL_KEY_SPKI_SHA256";
const MAX_CHILD_OUTPUT_BYTES = 1024 * 1024;

function usage() {
  return `Usage:
  node founder-pilot-production-history-production.cli.mjs \\
    --mode inventory --target production --manifest <absolute-json-path>

  node founder-pilot-production-history-production.cli.mjs \\
    --mode plan --target production --manifest <absolute-json-path> \\
    --source-prisma-root <absolute-path> --output-plan <absolute-json-path>

  node founder-pilot-production-history-production.cli.mjs \\
    --mode approve --manifest <absolute-json-path> --plan <absolute-json-path> \\
    --private-key <absolute-pkcs8-pem-path> --output-approval <absolute-json-path>

  node founder-pilot-production-history-production.cli.mjs \\
    --mode apply --target production --manifest <absolute-json-path> \\
    --source-prisma-root <absolute-path> --lane-root <absolute-path> \\
    --plan <absolute-json-path> --approval <absolute-json-path> \\
    --confirm-plan-digest <sha256> --prisma-cli <absolute-js-path> \\
    --receipt <absolute-json-path>

  node founder-pilot-production-history-production.cli.mjs \\
    --mode check --target production --manifest <absolute-json-path> \\
    --lane-root <absolute-path>

Production environment (inventory/plan/apply/check only):
  ${DATABASE_URL_ENV}=postgresql://<dedicated-migration-role>:<secret>@127.0.0.1:<port>/<production-db>?options=-c%20role%3D<object-owner-role>
  ${PRODUCTION_CONFIRMATION_ENV}=${FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION}
  ${APPROVAL_KEY_PIN_ENV}=<independently-pinned-Ed25519-SPKI-sha256>

inventory and plan are database read-only. inventory only acquires the strict
four-row digest and is never authorization. approve never connects to a
database. apply requires the exact digest, detached Ed25519 approval, live
identity/role fence, durable phase receipt, advisory lock and bounded Prisma
watchdog. No mode accepts a restored/rehearsal database name or an
application-runtime superuser.`;
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
  if (argv.length === 0 || argv.length % 2 !== 0) {
    throw new Error("ARGUMENTS_INVALID");
  }
  const accepted = new Set([
    "--approval",
    "--confirm-plan-digest",
    "--lane-root",
    "--manifest",
    "--mode",
    "--output-approval",
    "--output-plan",
    "--plan",
    "--prisma-cli",
    "--private-key",
    "--receipt",
    "--source-prisma-root",
    "--target",
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!accepted.has(key) || values.has(key)) {
      throw new Error("ARGUMENTS_INVALID");
    }
    values.set(key, argv[index + 1]);
  }
  const mode = values.get("--mode");
  if (!["apply", "approve", "check", "inventory", "plan"].includes(mode)) {
    throw new Error("ARGUMENTS_INVALID");
  }
  const manifestPath = absolutePath(values.get("--manifest"));
  const exactKeysByMode = {
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
    check: ["--lane-root", "--manifest", "--mode", "--target"],
    inventory: ["--manifest", "--mode", "--target"],
    plan: [
      "--manifest",
      "--mode",
      "--output-plan",
      "--source-prisma-root",
      "--target",
    ],
  };
  const actualKeys = [...values.keys()].sort();
  const expectedKeys = exactKeysByMode[mode].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    (mode !== "approve" && values.get("--target") !== "production")
  ) {
    throw new Error("ARGUMENTS_INVALID");
  }
  const result = { help: false, manifestPath, mode };
  for (const [key, property] of [
    ["--approval", "approvalPath"],
    ["--lane-root", "laneRoot"],
    ["--output-approval", "outputApprovalPath"],
    ["--output-plan", "outputPlanPath"],
    ["--plan", "planPath"],
    ["--prisma-cli", "prismaCliPath"],
    ["--private-key", "privateKeyPath"],
    ["--receipt", "receiptPath"],
    ["--source-prisma-root", "sourcePrismaRoot"],
  ]) {
    if (values.has(key)) result[property] = absolutePath(values.get(key));
  }
  if (values.has("--confirm-plan-digest")) {
    const digest = values.get("--confirm-plan-digest");
    if (!/^[0-9a-f]{64}$/u.test(digest)) {
      throw new Error("ARGUMENTS_INVALID");
    }
    result.confirmPlanDigest = digest;
  }
  return result;
}

function blocked(error) {
  return {
    contractVersion: "FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_V1",
    decision: "BLOCKED_MANUAL",
    reasonCode:
      error?.safeContractError === true
        ? error.reasonCode
        : "FOUNDER_PRODUCTION_HISTORY_CLI_FAILURE",
  };
}

async function assertRegularFile(filePath, reasonCode) {
  const stat = await lstat(filePath, { bigint: true }).catch(() => null);
  if (
    stat === null ||
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.size <= 0n
  ) {
    const error = new Error(reasonCode);
    error.reasonCode = reasonCode;
    error.safeContractError = true;
    throw error;
  }
  return realpath(filePath);
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

export async function createFounderPilotProductionHistoryPhaseJournal(
  filePath,
) {
  const handle = await open(
    filePath,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR,
    0o600,
  );
  let sequence = 0;
  let previousRecordDigest = "0".repeat(64);
  let position = 0;
  return {
    close: () => handle.close(),
    record: async (phase) => {
      sequence += 1;
      const record = {
        ...phase,
        previousRecordDigest,
        sequence,
      };
      const recordDigest = createHash("sha256")
        .update(JSON.stringify(record))
        .digest("hex");
      const durable = { ...record, recordDigest };
      const bytes = Buffer.from(`${JSON.stringify(durable)}\n`, "utf8");
      const { bytesWritten } = await handle.write(
        bytes,
        0,
        bytes.length,
        position,
      );
      if (bytesWritten !== bytes.length) throw new Error("PHASE_RECEIPT_TORN");
      await handle.sync();
      position += bytes.length;
      previousRecordDigest = recordDigest;
    },
  };
}

function childEnvironment(databaseUrl) {
  return {
    DATABASE_URL: databaseUrl,
    NODE_ENV: "production",
    NO_COLOR: "1",
    PATH:
      process.platform === "win32"
        ? path.dirname(process.execPath)
        : "/usr/bin:/bin",
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
  };
}

function killChild(child, signal) {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    // The close event is authoritative; the child may already have exited.
  }
}

export async function runBoundedFounderPilotProductionHistoryPrismaDeploy({
  databaseUrl,
  laneRoot,
  prismaCliPath,
  spawnProcess = spawn,
  timeoutSeconds,
}) {
  const cli = await assertRegularFile(
    prismaCliPath,
    "FOUNDER_PRODUCTION_HISTORY_PRISMA_CLI_INVALID",
  );
  const schema = await assertRegularFile(
    path.join(laneRoot, "schema.prisma"),
    "FOUNDER_PRODUCTION_HISTORY_SCHEMA_INVALID",
  );
  if (
    !Number.isSafeInteger(timeoutSeconds) ||
    timeoutSeconds < 60 ||
    timeoutSeconds > 900
  ) {
    throw new Error("DEPLOY_TIMEOUT_INVALID");
  }
  return new Promise((resolve) => {
    const stdoutHash = createHash("sha256");
    const stderrHash = createHash("sha256");
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let overflow = false;
    let spawnError = false;
    const child = spawnProcess(
      process.execPath,
      [cli, "migrate", "deploy", "--schema", schema],
      {
        cwd: laneRoot,
        detached: process.platform !== "win32",
        env: childEnvironment(databaseUrl),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    const consume = (hash, kind) => (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(bytes);
      if (kind === "stdout") stdoutBytes += bytes.length;
      else stderrBytes += bytes.length;
      if (stdoutBytes + stderrBytes > MAX_CHILD_OUTPUT_BYTES && !overflow) {
        overflow = true;
        killChild(child, "SIGTERM");
      }
    };
    child.stdout?.on("data", consume(stdoutHash, "stdout"));
    child.stderr?.on("data", consume(stderrHash, "stderr"));
    child.once("error", () => {
      spawnError = true;
    });
    const watchdog = setTimeout(() => {
      timedOut = true;
      killChild(child, "SIGTERM");
      setTimeout(() => killChild(child, "SIGKILL"), 5000).unref();
    }, timeoutSeconds * 1000);
    watchdog.unref();
    child.once("close", (code, signal) => {
      clearTimeout(watchdog);
      const evidence = {
        exitCode: Number.isInteger(code) ? code : null,
        signal: typeof signal === "string" ? signal : null,
        stderrBytes,
        stderrSha256: stderrHash.digest("hex"),
        stdoutBytes,
        stdoutSha256: stdoutHash.digest("hex"),
      };
      if (timedOut || overflow || spawnError || code === null) {
        resolve({ ...evidence, status: "AMBIGUOUS" });
      } else if (code === 0) {
        resolve({ ...evidence, status: "SUCCEEDED" });
      } else {
        resolve({ ...evidence, status: "FAILED" });
      }
    });
  });
}

function assertProductionEnvironment(environment) {
  if (
    environment[PRODUCTION_CONFIRMATION_ENV] !==
      FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION ||
    !/^[0-9a-f]{64}$/u.test(environment[APPROVAL_KEY_PIN_ENV] ?? "") ||
    typeof environment[DATABASE_URL_ENV] !== "string"
  ) {
    const error = new Error("PRODUCTION_ENVIRONMENT_INVALID");
    error.reasonCode =
      "FOUNDER_PRODUCTION_HISTORY_PRODUCTION_ENVIRONMENT_INVALID";
    error.safeContractError = true;
    throw error;
  }
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
    const manifest = await loadFounderPilotProductionHistoryProductionManifest(
      args.manifestPath,
    );
    if (args.mode === "approve") {
      const [plan, privateKeyPem] = await Promise.all([
        loadFounderPilotProductionHistoryProductionPlan(args.planPath),
        loadFounderPilotProductionHistoryPrivateKey(args.privateKeyPath),
      ]);
      const approval = signFounderPilotProductionHistoryProductionPlan({
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
    adapter = await createFounderPilotProductionHistoryProductionPgAdapter(
      environment[DATABASE_URL_ENV],
      manifest,
      {
        productionConfirmation: environment[PRODUCTION_CONFIRMATION_ENV],
      },
    );
    if (args.mode === "plan") {
      const plan = await buildFounderPilotProductionHistoryProductionPlan({
        adapter,
        manifest,
        sourcePrismaRoot: args.sourcePrismaRoot,
      });
      await writeExclusiveJson(args.outputPlanPath, plan);
      process.stdout.write(
        `${JSON.stringify({ decision: plan.decision, planDigest: plan.planDigest }, null, 2)}\n`,
      );
      return 0;
    }
    if (args.mode === "inventory") {
      const inventory =
        await inspectFounderPilotProductionHistoryProductionInventory({
          adapter,
          manifest,
        });
      process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
      return 0;
    }
    if (args.mode === "check") {
      await adapter.acquireLock();
      try {
        const result = await verifyFounderPilotProductionHistoryProductionFinal(
          {
            adapter,
            laneRoot: args.laneRoot,
            manifest,
          },
        );
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } finally {
        await adapter.releaseLock().catch(() => undefined);
      }
      return 0;
    }
    const [plan, approval] = await Promise.all([
      loadFounderPilotProductionHistoryProductionPlan(args.planPath),
      loadFounderPilotProductionHistoryProductionApproval(args.approvalPath),
    ]);
    journal = await createFounderPilotProductionHistoryPhaseJournal(
      args.receiptPath,
    );
    const result = await applyFounderPilotProductionHistoryProductionPlan({
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
      pinnedApprovalKeySpkiSha256: environment[APPROVAL_KEY_PIN_ENV],
      plan,
      productionConfirmation: environment[PRODUCTION_CONFIRMATION_ENV],
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
