#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createFounderPilotActivationRoleNetworkPgAdapter,
  runFounderPilotActivationRoleNetworkAcceptance,
} from "./founder-pilot-activation-role-network-acceptance.mjs";
import { normalizeFounderPilotActivationRoleReceipt } from "./founder-pilot-activation-role-deployment.mjs";
import { loadFounderPilotRestoredCopyManifest } from "./founder-pilot-restored-copy-preflight.mjs";

const OWNER_DATABASE_URL_ENV = "FOUNDER_PILOT_RESTORED_COPY_DATABASE_URL";
const RUNTIME_DATABASE_URL_ENV = "FOUNDER_PILOT_ACTIVATION_ROLE_DATABASE_URL";
const MAX_RECEIPT_BYTES = 64 * 1024;
const MAX_CA_BYTES = 64 * 1024;

function usage() {
  return `Usage:
  node founder-pilot-activation-role-network-acceptance.cli.mjs \\
    --manifest <absolute-json-path> \\
    --operation-id <uuid> \\
    --receipt <absolute-json-path> \\
    --ca <absolute-pem-path> \\
    --ca-sha256 <64-lowercase-hex> \\
    --denied-database <existing-other-database>

Environment:
  ${OWNER_DATABASE_URL_ENV}=postgresql://<owner>:<secret>@127.0.0.1:<non-5432>/<restored-target>
  ${RUNTIME_DATABASE_URL_ENV}=postgresql://leetplus_founder_beta_activation_runtime:<secret>@127.0.0.1:<same-port>/<same-target>

The target HBA must expose one exact hostssl+scram allow, followed by role-scoped
hostssl and hostnossl reject rules. Output never contains URLs, passwords, paths,
certificate bytes, or PostgreSQL error text.`;
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true };
  }
  if (argv.length % 2 !== 0) throw new Error("ARGUMENTS_INVALID");
  const allowed = new Set([
    "--ca",
    "--ca-sha256",
    "--denied-database",
    "--manifest",
    "--operation-id",
    "--receipt",
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!allowed.has(key) || values.has(key)) {
      throw new Error("ARGUMENTS_INVALID");
    }
    values.set(key, argv[index + 1]);
  }
  if ([...allowed].some((key) => !values.has(key))) {
    throw new Error("ARGUMENTS_INVALID");
  }
  return {
    caPath: values.get("--ca"),
    caSha256: values.get("--ca-sha256"),
    deniedDatabaseName: values.get("--denied-database"),
    help: false,
    manifestPath: values.get("--manifest"),
    operationId: values.get("--operation-id"),
    receiptPath: values.get("--receipt"),
  };
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs]
    .map((part) => part.toString())
    .join(":");
}

async function readExactFile(filePath, maximumBytes) {
  if (
    typeof filePath !== "string" ||
    filePath.trim() !== filePath ||
    filePath.length > 4096 ||
    !path.isAbsolute(filePath)
  ) {
    throw new Error("FILE_INVALID");
  }
  const pathStat = await lstat(filePath, { bigint: true });
  if (pathStat.isSymbolicLink() || !pathStat.isFile()) {
    throw new Error("FILE_INVALID");
  }
  const handle = await open(await realpath(filePath), fsConstants.O_RDONLY);
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      fileIdentity(before) !== fileIdentity(pathStat) ||
      before.size <= 0n ||
      before.size > BigInt(maximumBytes)
    ) {
      throw new Error("FILE_INVALID");
    }
    const bytes = Buffer.alloc(Number(before.size));
    const read = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat({ bigint: true });
    if (
      read.bytesRead !== bytes.length ||
      fileIdentity(before) !== fileIdentity(after)
    ) {
      bytes.fill(0);
      throw new Error("FILE_INVALID");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function loadRoleReceipt(receiptPath) {
  const bytes = await readExactFile(receiptPath, MAX_RECEIPT_BYTES);
  try {
    return normalizeFounderPilotActivationRoleReceipt(
      JSON.parse(bytes.toString("utf8")),
    );
  } finally {
    bytes.fill(0);
  }
}

function safeFailure(error) {
  return {
    contractVersion: "FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_ACCEPTANCE_V1",
    decision: "BLOCKED_MANUAL",
    reasonCode:
      error?.safeContractError === true
        ? error.reasonCode
        : "FOUNDER_PILOT_NETWORK_CLI_FAILURE",
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
  let caCertificate = null;
  try {
    const manifest = await loadFounderPilotRestoredCopyManifest(
      args.manifestPath,
    );
    const roleReceipt = await loadRoleReceipt(args.receiptPath);
    caCertificate = await readExactFile(args.caPath, MAX_CA_BYTES);
    adapter = await createFounderPilotActivationRoleNetworkPgAdapter({
      caCertificate,
      caCertificateSha256: args.caSha256,
      manifest,
      operationId: args.operationId,
      ownerDatabaseUrl: environment[OWNER_DATABASE_URL_ENV],
      runtimeDatabaseUrl: environment[RUNTIME_DATABASE_URL_ENV],
    });
    const result = await runFounderPilotActivationRoleNetworkAcceptance({
      adapter,
      caCertificateSha256: args.caSha256,
      deniedDatabaseName: args.deniedDatabaseName,
      manifest,
      now: () => new Date(),
      operationId: args.operationId,
      roleReceipt,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.reasonCode === null ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(safeFailure(error), null, 2)}\n`);
    return 1;
  } finally {
    caCertificate?.fill(0);
    await adapter?.close().catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
