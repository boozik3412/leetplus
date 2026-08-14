import { constants as fsConstants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_RISK_ACCEPTANCE,
  prepareLangameRuntimeTrustFounderPilotCurrent202,
  verifyLangameRuntimeTrustFounderPilotCurrent202,
} from "./langame-runtime-trust-founder-pilot-current202.mjs";
import {
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CLI_CONFIRMATION,
  prepareLangameRuntimeTrustBootstrapLifecycleCurrent200Cli,
} from "./langame-runtime-trust-bootstrap-lifecycle-current200.cli.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CLI_CONFIRMATION =
  "prepare-current202-founder-single-control-pilot";

const COMMON_ARGUMENTS = Object.freeze(
  [
    "--approved-at",
    "--confirm",
    "--effective-at",
    "--eligible-at",
    "--exception-id",
    "--expires-at",
    "--founder-id",
    "--founder-public-key",
    "--key-custody-plan-digest",
    "--key-id",
    "--mode",
    "--operation",
    "--operation-id",
    "--prepared-at",
    "--public-key",
    "--reason-digest",
    "--release-owner-id",
    "--restored-copy-plan-digest",
    "--risk-acceptance",
    "--rollback-owner-id",
    "--rollback-plan-digest",
    "--valid-until",
  ].sort(),
);
const MAX_PUBLIC_KEY_BYTES = 4_096;
const MAX_SIGNATURE_BYTES = 128;

class Current202CliError extends Error {
  constructor(code, exitCode = 2) {
    super("CURRENT202 founder pilot CLI rejected the request.");
    this.name = "Current202CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.safeContractError = true;
  }
}

function fail(code, exitCode) {
  throw new Current202CliError(code, exitCode);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseArgs(args) {
  if (!Array.isArray(args) || args.length < 2 || args.length % 2 !== 0) {
    fail("CURRENT202_FOUNDER_CLI_ARGUMENTS_INVALID");
  }
  const values = Object.create(null);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      typeof key !== "string" ||
      !/^--[a-z]+(?:-[a-z]+)*$/u.test(key) ||
      typeof value !== "string" ||
      value.length === 0 ||
      Object.hasOwn(values, key)
    ) {
      fail("CURRENT202_FOUNDER_CLI_ARGUMENTS_INVALID");
    }
    values[key] = value;
  }
  const mode = String(values["--mode"] ?? "").toUpperCase();
  const expected = [
    ...COMMON_ARGUMENTS,
    ...(mode === "VERIFY" ? ["--founder-signature"] : []),
  ].sort(compareStrings);
  const keys = Object.keys(values).sort(compareStrings);
  if (
    !new Set(["PREPARE", "VERIFY"]).has(mode) ||
    String(values["--operation"] ?? "").toUpperCase() !== "ENROLL" ||
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index]) ||
    values["--confirm"] !==
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CLI_CONFIRMATION
  ) {
    fail("CURRENT202_FOUNDER_CLI_ARGUMENTS_INVALID");
  }
  return Object.freeze({ mode, values: Object.freeze(values) });
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function readBoundedFile(filePath, extension, maximumBytes) {
  if (
    typeof filePath !== "string" ||
    filePath.length > 1_024 ||
    path.extname(filePath).toLowerCase() !== extension
  ) {
    fail("CURRENT202_FOUNDER_CLI_FILE_INVALID");
  }
  let handle;
  try {
    const resolved = path.resolve(filePath);
    const pathIdentity = await lstat(resolved, { bigint: true });
    if (!pathIdentity.isFile() || pathIdentity.isSymbolicLink()) {
      fail("CURRENT202_FOUNDER_CLI_FILE_INVALID");
    }
    handle = await open(
      resolved,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      !sameIdentity(pathIdentity, before) ||
      before.nlink !== 1n ||
      before.size < 1n ||
      before.size > BigInt(maximumBytes)
    ) {
      fail("CURRENT202_FOUNDER_CLI_FILE_INVALID");
    }
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (bytesRead < 1) fail("CURRENT202_FOUNDER_CLI_FILE_INVALID");
      offset += bytesRead;
    }
    const overflow = await handle.read(Buffer.alloc(1), 0, 1, offset);
    const after = await handle.stat({ bigint: true });
    if (
      overflow.bytesRead !== 0 ||
      !sameIdentity(before, after) ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      fail("CURRENT202_FOUNDER_CLI_FILE_CHANGED");
    }
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes) || text.includes("\0")) {
      fail("CURRENT202_FOUNDER_CLI_FILE_INVALID");
    }
    return text;
  } catch (error) {
    if (error?.safeContractError) throw error;
    fail("CURRENT202_FOUNDER_CLI_FILE_UNAVAILABLE", 1);
  } finally {
    await handle?.close().catch(() => {});
  }
}

function current200Args(values) {
  return [
    "--operation",
    "enroll",
    "--operation-id",
    values["--operation-id"],
    "--key-id",
    values["--key-id"],
    "--approved-at",
    values["--approved-at"],
    "--effective-at",
    values["--effective-at"],
    "--reason-digest",
    values["--reason-digest"],
    "--public-key",
    values["--public-key"],
    "--valid-until",
    values["--valid-until"],
    "--confirm",
    LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CLI_CONFIRMATION,
  ];
}

export async function runLangameRuntimeTrustFounderPilotCurrent202Cli(
  args,
  options = {},
) {
  const parsed = parseArgs(args);
  const clock = options.clock ?? (() => new Date());
  const observedAt = clock();
  if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) {
    fail("CURRENT202_FOUNDER_CLI_CLOCK_INVALID");
  }
  const transitionObservedAt = new Date(parsed.values["--prepared-at"]);
  if (!Number.isFinite(transitionObservedAt.getTime())) {
    fail("CURRENT202_FOUNDER_CLI_CLOCK_INVALID");
  }
  const transition =
    await prepareLangameRuntimeTrustBootstrapLifecycleCurrent200Cli(
      current200Args(parsed.values),
      {
        ...(options.current200Options ?? {}),
        clock: () => transitionObservedAt,
      },
    );
  const readPublicKey =
    options.readPublicKey ??
    ((filePath) => readBoundedFile(filePath, ".pem", MAX_PUBLIC_KEY_BYTES));
  const founderPublicKeyPem = await readPublicKey(
    parsed.values["--founder-public-key"],
  );
  const packet = prepareLangameRuntimeTrustFounderPilotCurrent202(
    transition,
    {
      eligibleAt: parsed.values["--eligible-at"],
      exceptionId: parsed.values["--exception-id"],
      expiresAt: parsed.values["--expires-at"],
      founderId: parsed.values["--founder-id"],
      founderPublicKeyPem,
      keyCustodyPlanDigest: parsed.values["--key-custody-plan-digest"],
      preparedAt: parsed.values["--prepared-at"],
      releaseOwnerId: parsed.values["--release-owner-id"],
      restoredCopyPlanDigest: parsed.values["--restored-copy-plan-digest"],
      riskAcceptance: parsed.values["--risk-acceptance"],
      rollbackOwnerId: parsed.values["--rollback-owner-id"],
      rollbackPlanDigest: parsed.values["--rollback-plan-digest"],
    },
    (parsed.mode === "PREPARE"
      ? observedAt
      : transitionObservedAt
    ).toISOString(),
  );
  if (parsed.mode === "PREPARE") return packet;
  const readSignature =
    options.readSignature ??
    ((filePath) => readBoundedFile(filePath, ".sig", MAX_SIGNATURE_BYTES));
  const founderSignature = await readSignature(
    parsed.values["--founder-signature"],
  );
  return verifyLangameRuntimeTrustFounderPilotCurrent202(
    packet,
    { founderSignature: founderSignature.trim() },
    observedAt.toISOString(),
  );
}

function usage() {
  return [
    "CURRENT202 founder single-control pilot evidence",
    "",
    "Modes:",
    "  --mode prepare   Print the exact founder signing payload before cooling-off",
    "  --mode verify    Verify one detached founder Ed25519 signature after cooling-off",
    "",
    "The command composes CURRENT200 ENROLL arguments with founder, owner,",
    "timeline and three SHA-256 plan-digest arguments. It requires exact risk text:",
    `  --risk-acceptance ${LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_RISK_ACCEPTANCE}`,
    `  --confirm ${LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CLI_CONFIRMATION}`,
    "",
    "It reads public keys/signatures only and grants no production or test access.",
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await runLangameRuntimeTrustFounderPilotCurrent202Cli(args);
  process.stdout.write(`${canonicalStringify(result)}\n`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${canonicalStringify({
        code: String(error?.code ?? "CURRENT202_FOUNDER_CLI_REJECTED"),
        status: "REJECTED",
      })}\n`,
    );
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
