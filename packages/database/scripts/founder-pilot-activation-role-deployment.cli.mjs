#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createFounderPilotActivationRolePgAdapter,
  normalizeFounderPilotActivationRoleReceipt,
  runFounderPilotActivationRoleDeployment,
} from "./founder-pilot-activation-role-deployment.mjs";
import {
  FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY,
  inspectFounderPilotRestoredCopyTarget,
  loadFounderPilotRestoredCopyManifest,
  runFounderPilotRestoredCopyPreflight,
} from "./founder-pilot-restored-copy-preflight.mjs";

const DATABASE_URL_ENV = "FOUNDER_PILOT_RESTORED_COPY_DATABASE_URL";
const ROLE_SECRET_ENV = "FOUNDER_PILOT_ACTIVATION_ROLE_SECRET";
const MAX_RECEIPT_BYTES = 64 * 1024;

function usage() {
  return `Usage:
  node founder-pilot-activation-role-deployment.cli.mjs \\
    --mode <plan|apply|check|rollback> \\
    --manifest <absolute-json-path> \\
    --operation-id <uuid> \\
    [--receipt <absolute-json-path>] \\
    [--receipt-out <absolute-json-path>]

Environment:
  ${DATABASE_URL_ENV}=postgresql://<owner>:<secret>@127.0.0.1:<non-5432>/<leetplus_restored_*>
  ${ROLE_SECRET_ENV}=<32-128 base64url characters>   # apply only

apply requires --receipt-out; rollback requires --receipt. The receipt is
secret-free. This controller is restricted to a restored-copy loopback target.`;
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
        "--manifest",
        "--mode",
        "--operation-id",
        "--receipt",
        "--receipt-out",
      ].includes(key) ||
      values.has(key)
    ) {
      throw new Error("ARGUMENTS_INVALID");
    }
    values.set(key, argv[index + 1]);
  }
  const mode = values.get("--mode");
  const manifestPath = values.get("--manifest");
  const operationId = values.get("--operation-id");
  const receiptPath = values.get("--receipt") ?? null;
  const receiptOutPath = values.get("--receipt-out") ?? null;
  if (!mode || !manifestPath || !operationId) {
    throw new Error("ARGUMENTS_INVALID");
  }
  if (
    (mode === "apply" && (receiptOutPath === null || receiptPath !== null)) ||
    (mode === "rollback" &&
      (receiptPath === null || receiptOutPath !== null)) ||
    (["plan", "check"].includes(mode) &&
      (receiptPath !== null || receiptOutPath !== null))
  ) {
    throw new Error("ARGUMENTS_INVALID");
  }
  return {
    help: false,
    manifestPath,
    mode,
    operationId,
    receiptOutPath,
    receiptPath,
  };
}

function absolutePath(value) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length > 4096 ||
    !path.isAbsolute(value)
  ) {
    throw new Error("PATH_INVALID");
  }
  return value;
}

function identity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs]
    .map((value) => value.toString())
    .join(":");
}

async function readReceipt(receiptPath) {
  absolutePath(receiptPath);
  const pathStat = await lstat(receiptPath, { bigint: true });
  if (pathStat.isSymbolicLink() || !pathStat.isFile())
    throw new Error("RECEIPT_INVALID");
  const handle = await open(await realpath(receiptPath), fsConstants.O_RDONLY);
  try {
    const stat = await handle.stat({ bigint: true });
    if (
      !stat.isFile() ||
      identity(pathStat) !== identity(stat) ||
      stat.size <= 0n ||
      stat.size > MAX_RECEIPT_BYTES
    ) {
      throw new Error("RECEIPT_INVALID");
    }
    const buffer = Buffer.alloc(Number(stat.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const after = await handle.stat({ bigint: true });
    if (bytesRead !== buffer.length || identity(stat) !== identity(after)) {
      throw new Error("RECEIPT_INVALID");
    }
    return normalizeFounderPilotActivationRoleReceipt(
      JSON.parse(buffer.toString("utf8")),
    );
  } finally {
    await handle.close();
  }
}

async function persistReceipt(receiptOutPath, receipt) {
  absolutePath(receiptOutPath);
  const normalized = normalizeFounderPilotActivationRoleReceipt(receipt);
  const bytes = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  try {
    const existing = await readReceipt(receiptOutPath);
    if (existing.receiptDigest !== normalized.receiptDigest) {
      throw new Error("RECEIPT_OUTPUT_CONFLICT");
    }
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      if (error?.message !== "RECEIPT_INVALID") throw error;
      throw error;
    }
  }
  const parent = await realpath(path.dirname(receiptOutPath));
  const temporaryPath = path.join(
    parent,
    `.${path.basename(receiptOutPath)}.${process.pid}.tmp`,
  );
  const handle = await open(
    temporaryPath,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, receiptOutPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function safeFailure(error) {
  return {
    contractVersion: "FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_V1",
    decision: "BLOCKED_MANUAL",
    reasonCode:
      error?.safeContractError === true
        ? error.reasonCode
        : "FOUNDER_PILOT_ACTIVATION_ROLE_CLI_FAILURE",
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
    const targetEvidence = await inspectFounderPilotRestoredCopyTarget(
      databaseUrl,
      manifest.target,
    );
    let preflightReceipt = null;
    if (
      ["plan", "apply"].includes(args.mode) &&
      targetEvidence.founderActivationRoleCount === 0
    ) {
      preflightReceipt = await runFounderPilotRestoredCopyPreflight({
        inspectTarget: (expected) =>
          inspectFounderPilotRestoredCopyTarget(databaseUrl, expected),
        manifest,
      });
      if (
        preflightReceipt.decision !==
        FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY
      ) {
        process.stdout.write(`${JSON.stringify(preflightReceipt, null, 2)}\n`);
        return 1;
      }
    }
    const receipt =
      args.receiptPath === null ? null : await readReceipt(args.receiptPath);
    adapter = await createFounderPilotActivationRolePgAdapter(
      databaseUrl,
      manifest.target,
    );
    const result = await runFounderPilotActivationRoleDeployment({
      adapter,
      manifest,
      mode: args.mode,
      now: () => new Date(),
      operationId: args.operationId,
      preflightReceipt,
      receipt,
      salt: undefined,
      secret: args.mode === "apply" ? environment[ROLE_SECRET_ENV] : null,
    });
    if (
      args.mode === "apply" &&
      result.reasonCode === null &&
      result.receipt !== undefined
    ) {
      await persistReceipt(args.receiptOutPath, result.receipt);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.reasonCode === null ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(safeFailure(error), null, 2)}\n`);
    return 1;
  } finally {
    await adapter?.close().catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
