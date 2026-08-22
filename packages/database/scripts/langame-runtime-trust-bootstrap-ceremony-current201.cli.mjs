import { constants as fsConstants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  prepareLangameRuntimeTrustBootstrapCeremonyCurrent201,
  verifyLangameRuntimeTrustBootstrapCeremonyCurrent201,
} from "./langame-runtime-trust-bootstrap-ceremony-current201.mjs";
import {
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CLI_CONFIRMATION,
  prepareLangameRuntimeTrustBootstrapLifecycleCurrent200Cli,
} from "./langame-runtime-trust-bootstrap-lifecycle-current200.cli.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CLI_CONFIRMATION =
  "prepare-current201-two-person-public-bootstrap-ceremony";

const COMMON_ARGUMENTS = Object.freeze([
  "--approved-at",
  "--ceremony-created-at",
  "--ceremony-expires-at",
  "--ceremony-id",
  "--confirm",
  "--effective-at",
  "--key-id",
  "--mode",
  "--operation",
  "--operation-id",
  "--operator-id",
  "--operator-public-key",
  "--reason-digest",
  "--reviewer-id",
  "--reviewer-public-key",
]);
const ROOT_ARGUMENTS = Object.freeze(["--public-key", "--valid-until"]);
const SIGNATURE_ARGUMENTS = Object.freeze([
  "--operator-signature",
  "--reviewer-signature",
]);
const MAX_PUBLIC_KEY_BYTES = 4_096;
const MAX_SIGNATURE_BYTES = 128;

class Current201CliError extends Error {
  constructor(code, exitCode = 2) {
    super("CURRENT201 public bootstrap ceremony CLI rejected the request.");
    this.name = "Current201CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.safeContractError = true;
  }
}

function fail(code, exitCode) {
  throw new Current201CliError(code, exitCode);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseArgs(args) {
  if (!Array.isArray(args) || args.length < 2 || args.length % 2 !== 0) {
    fail("CURRENT201_CEREMONY_CLI_ARGUMENTS_INVALID");
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
      fail("CURRENT201_CEREMONY_CLI_ARGUMENTS_INVALID");
    }
    values[key] = value;
  }
  const mode = String(values["--mode"] ?? "").toUpperCase();
  const operation = String(values["--operation"] ?? "").toUpperCase();
  if (!new Set(["PREPARE", "VERIFY"]).has(mode)) {
    fail("CURRENT201_CEREMONY_CLI_ARGUMENTS_INVALID");
  }
  if (!new Set(["ENROLL", "ROTATE", "REVOKE"]).has(operation)) {
    fail("CURRENT201_CEREMONY_CLI_ARGUMENTS_INVALID");
  }
  const expected = [
    ...COMMON_ARGUMENTS,
    ...(operation === "REVOKE" ? [] : ROOT_ARGUMENTS),
    ...(mode === "VERIFY" ? SIGNATURE_ARGUMENTS : []),
  ].sort(compareStrings);
  const keys = Object.keys(values).sort(compareStrings);
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index]) ||
    values["--confirm"] !==
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CLI_CONFIRMATION
  ) {
    fail("CURRENT201_CEREMONY_CLI_ARGUMENTS_INVALID");
  }
  return Object.freeze({ mode, operation, values: Object.freeze(values) });
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
    fail("CURRENT201_CEREMONY_CLI_FILE_INVALID");
  }
  let handle;
  try {
    const resolved = path.resolve(filePath);
    const pathIdentity = await lstat(resolved, { bigint: true });
    if (!pathIdentity.isFile() || pathIdentity.isSymbolicLink()) {
      fail("CURRENT201_CEREMONY_CLI_FILE_INVALID");
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
      fail("CURRENT201_CEREMONY_CLI_FILE_INVALID");
    }
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (result.bytesRead < 1) {
        fail("CURRENT201_CEREMONY_CLI_FILE_INVALID");
      }
      offset += result.bytesRead;
    }
    const overflow = Buffer.alloc(1);
    const overflowRead = await handle.read(overflow, 0, 1, offset);
    const after = await handle.stat({ bigint: true });
    if (
      overflowRead.bytesRead !== 0 ||
      !sameIdentity(before, after) ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      fail("CURRENT201_CEREMONY_CLI_FILE_CHANGED");
    }
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes) || text.includes("\0")) {
      fail("CURRENT201_CEREMONY_CLI_FILE_INVALID");
    }
    return text;
  } catch (error) {
    if (error?.safeContractError) throw error;
    fail("CURRENT201_CEREMONY_CLI_FILE_UNAVAILABLE", 1);
  } finally {
    await handle?.close().catch(() => {});
  }
}

function current200Args(parsed) {
  const values = parsed.values;
  const result = [
    "--operation",
    parsed.operation.toLowerCase(),
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
  ];
  if (parsed.operation !== "REVOKE") {
    result.push(
      "--public-key",
      values["--public-key"],
      "--valid-until",
      values["--valid-until"],
    );
  }
  result.push(
    "--confirm",
    LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CLI_CONFIRMATION,
  );
  return result;
}

export async function runLangameRuntimeTrustBootstrapCeremonyCurrent201Cli(
  args,
  options = {},
) {
  const parsed = parseArgs(args);
  const clock = options.clock ?? (() => new Date());
  const observedAt = clock();
  if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) {
    fail("CURRENT201_CEREMONY_CLI_CLOCK_INVALID");
  }
  const transition =
    await prepareLangameRuntimeTrustBootstrapLifecycleCurrent200Cli(
      current200Args(parsed),
      {
        ...(options.current200Options ?? {}),
        clock: () => observedAt,
      },
    );
  const readPublicKey =
    options.readPublicKey ??
    ((filePath) => readBoundedFile(filePath, ".pem", MAX_PUBLIC_KEY_BYTES));
  const [operatorPublicKeyPem, reviewerPublicKeyPem] = await Promise.all([
    readPublicKey(parsed.values["--operator-public-key"]),
    readPublicKey(parsed.values["--reviewer-public-key"]),
  ]);
  const packet = prepareLangameRuntimeTrustBootstrapCeremonyCurrent201(
    transition,
    {
      ceremonyId: parsed.values["--ceremony-id"],
      createdAt: parsed.values["--ceremony-created-at"],
      expiresAt: parsed.values["--ceremony-expires-at"],
      operatorId: parsed.values["--operator-id"],
      operatorPublicKeyPem,
      reviewerId: parsed.values["--reviewer-id"],
      reviewerPublicKeyPem,
    },
    observedAt.toISOString(),
  );
  if (parsed.mode === "PREPARE") return packet;
  const readSignature =
    options.readSignature ??
    ((filePath) => readBoundedFile(filePath, ".sig", MAX_SIGNATURE_BYTES));
  const [operatorSignature, reviewerSignature] = await Promise.all([
    readSignature(parsed.values["--operator-signature"]),
    readSignature(parsed.values["--reviewer-signature"]),
  ]);
  return verifyLangameRuntimeTrustBootstrapCeremonyCurrent201(
    packet,
    {
      operatorSignature: operatorSignature.trim(),
      reviewerSignature: reviewerSignature.trim(),
    },
    observedAt.toISOString(),
  );
}

function usage() {
  return [
    "CURRENT201 two-person public bootstrap ceremony",
    "",
    "Modes:",
    "  --mode prepare   Print exact operator/reviewer signing payloads",
    "  --mode verify    Verify two detached Ed25519 signatures",
    "",
    "The command composes CURRENT200 arguments with:",
    "  --ceremony-id <uuid>",
    "  --ceremony-created-at <canonical-iso>",
    "  --ceremony-expires-at <canonical-iso, <=24h>",
    "  --operator-id <id>",
    "  --operator-public-key <public-ed25519-spki.pem>",
    "  --reviewer-id <different-id>",
    "  --reviewer-public-key <different-public-ed25519-spki.pem>",
    "  --operator-signature <base64url.sig>   (verify only)",
    "  --reviewer-signature <base64url.sig>   (verify only)",
    `  --confirm ${LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CLI_CONFIRMATION}`,
    "",
    "It never reads private keys and never writes the registry.",
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result =
    await runLangameRuntimeTrustBootstrapCeremonyCurrent201Cli(args);
  process.stdout.write(`${canonicalStringify(result)}\n`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${canonicalStringify({
        code: String(error?.code ?? "CURRENT201_CEREMONY_CLI_REJECTED"),
        status: "REJECTED",
      })}\n`,
    );
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
