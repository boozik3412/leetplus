#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  PARALLEL_BACKUP_RESTORED_COPY_BOUND,
  PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_CONTRACT,
  PARALLEL_BACKUP_RESTORED_COPY_PREPARED,
  bindParallelBackupRestoredCopyEvidence,
  prepareParallelBackupRestoredCopyEvidence,
  verifyParallelBackupRestoredCopyEffectBinding,
} from "./parallel-backup-restored-copy-evidence.mjs";

const MAX_JSON_BYTES = 2 * 1024 * 1024;

function usage() {
  return `Usage:
  node parallel-backup-restored-copy-evidence.cli.mjs \\
    --mode prepare --manifest <absolute-json> --candidate-receipt <absolute-json> \\
    --output <new-absolute-json>

  node parallel-backup-restored-copy-evidence.cli.mjs \\
    --mode bind --preparation <absolute-json> --admission-receipt <absolute-json> \\
    --live-evidence <absolute-json> --output <new-absolute-json>

  node parallel-backup-restored-copy-evidence.cli.mjs \\
    --mode verify --preparation <absolute-json> --admission-receipt <absolute-json> \\
    --live-evidence <absolute-json> --binding <absolute-json>

prepare may run while exact-SHA Full Admission is still executing. bind/verify
are read-only and nonauthorizing: an effect controller must still place the
short-lived effectBindingDigest inside its separately approved signed plan.`;
}

function absolutePath(value) {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 4096 ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  ) {
    throw new Error("ABSOLUTE_PATH_REQUIRED");
  }
  return path.resolve(value);
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) return { help: true };
  if (argv.length === 0 || argv.length % 2 !== 0) throw new Error("ARGUMENTS_INVALID");
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
  const expected = {
    prepare: ["--candidate-receipt", "--manifest", "--mode", "--output"],
    bind: ["--admission-receipt", "--live-evidence", "--mode", "--output", "--preparation"],
    verify: ["--admission-receipt", "--binding", "--live-evidence", "--mode", "--preparation"],
  }[mode];
  if (
    !expected ||
    values.size !== expected.length ||
    [...values.keys()].some((key) => !expected.includes(key))
  ) {
    throw new Error("ARGUMENTS_INVALID");
  }
  const result = { help: false, mode };
  for (const [argument, key] of [
    ["--admission-receipt", "admissionReceiptPath"],
    ["--binding", "bindingPath"],
    ["--candidate-receipt", "candidateReceiptPath"],
    ["--live-evidence", "liveEvidencePath"],
    ["--manifest", "manifestPath"],
    ["--output", "outputPath"],
    ["--preparation", "preparationPath"],
  ]) {
    if (values.has(argument)) result[key] = absolutePath(values.get(argument));
  }
  return result;
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs]
    .map((part) => part.toString())
    .join(":");
}

async function readCanonicalJson(filePath) {
  const pathStat = await lstat(filePath, { bigint: true }).catch(() => null);
  if (!pathStat?.isFile() || pathStat.isSymbolicLink() || pathStat.nlink !== 1n) {
    throw new Error("INPUT_FILE_INVALID");
  }
  const canonicalPath = await realpath(filePath);
  const handle = await open(canonicalPath, fsConstants.O_RDONLY);
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      fileIdentity(before) !== fileIdentity(pathStat) ||
      before.size < 3n ||
      before.size > BigInt(MAX_JSON_BYTES)
    ) {
      throw new Error("INPUT_FILE_INVALID");
    }
    const bytes = Buffer.alloc(Number(before.size));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat({ bigint: true });
    if (bytesRead !== bytes.length || fileIdentity(before) !== fileIdentity(after)) {
      throw new Error("INPUT_FILE_CHANGED");
    }
    const raw = bytes.toString("utf8");
    if (raw.includes("\0") || raw.includes("\r")) throw new Error("JSON_FILE_INVALID");
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("JSON_FILE_INVALID");
    }
    if (raw !== `${JSON.stringify(value, null, 2)}\n`) throw new Error("JSON_FILE_NOT_CANONICAL");
    return {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      value,
    };
  } finally {
    await handle.close();
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

function blocked(error) {
  return {
    contractVersion: PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_CONTRACT,
    decision: "BLOCKED_MANUAL",
    reasonCode:
      error?.safeContractError === true
        ? error.reasonCode
        : typeof error?.message === "string" && /^[A-Z][A-Z0-9_]{2,100}$/u.test(error.message)
          ? error.message
          : "PARALLEL_PREPARATION_UNEXPECTED_FAILURE",
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
  try {
    if (args.mode === "prepare") {
      const [manifest, candidate] = await Promise.all([
        readCanonicalJson(args.manifestPath),
        readCanonicalJson(args.candidateReceiptPath),
      ]);
      if (manifest.value.candidateReceiptSha256 !== candidate.sha256) {
        throw new Error("PARALLEL_PREPARATION_CANDIDATE_DIGEST_MISMATCH");
      }
      const receipt = prepareParallelBackupRestoredCopyEvidence({
        candidateReceipt: candidate.value,
        manifest: manifest.value,
      });
      await writeExclusiveJson(args.outputPath, receipt);
      process.stdout.write(
        `${JSON.stringify({ decision: PARALLEL_BACKUP_RESTORED_COPY_PREPARED, preparationDigest: receipt.preparationDigest })}\n`,
      );
      return 0;
    }
    const [preparation, admission, live] = await Promise.all([
      readCanonicalJson(args.preparationPath),
      readCanonicalJson(args.admissionReceiptPath),
      readCanonicalJson(args.liveEvidencePath),
    ]);
    if (args.mode === "bind") {
      const binding = bindParallelBackupRestoredCopyEvidence({
        admissionReceipt: admission.value,
        admissionReceiptSha256: admission.sha256,
        liveEvidence: live.value,
        preparationReceipt: preparation.value,
      });
      await writeExclusiveJson(args.outputPath, binding);
      process.stdout.write(
        `${JSON.stringify({ decision: PARALLEL_BACKUP_RESTORED_COPY_BOUND, effectBindingDigest: binding.effectBindingDigest })}\n`,
      );
      return 0;
    }
    const binding = await readCanonicalJson(args.bindingPath);
    const verified = verifyParallelBackupRestoredCopyEffectBinding({
      admissionReceipt: admission.value,
      admissionReceiptSha256: admission.sha256,
      binding: binding.value,
      liveEvidence: live.value,
      preparationReceipt: preparation.value,
    });
    process.stdout.write(
      `${JSON.stringify({ decision: "PRE_EFFECT_EVIDENCE_VERIFIED", effectBindingDigest: verified.effectBindingDigest })}\n`,
    );
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(blocked(error))}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
