import { constants as fsConstants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CONTRACT,
  prepareLangameRuntimeTrustBootstrapLifecycleCurrent200,
} from "./langame-runtime-trust-bootstrap-lifecycle-current200.mjs";
import { PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198 } from "./langame-runtime-trust-bootstrap-registry-current198.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CLI_CONFIRMATION =
  "prepare-current200-public-bootstrap-registry-transition";

const MAX_PUBLIC_KEY_BYTES = 4_096;
const EXPECTED_ARGUMENTS = Object.freeze({
  ENROLL: Object.freeze([
    "--approved-at",
    "--confirm",
    "--effective-at",
    "--key-id",
    "--operation",
    "--operation-id",
    "--public-key",
    "--reason-digest",
    "--valid-until",
  ]),
  REVOKE: Object.freeze([
    "--approved-at",
    "--confirm",
    "--effective-at",
    "--key-id",
    "--operation",
    "--operation-id",
    "--reason-digest",
  ]),
  ROTATE: Object.freeze([
    "--approved-at",
    "--confirm",
    "--effective-at",
    "--key-id",
    "--operation",
    "--operation-id",
    "--public-key",
    "--reason-digest",
    "--valid-until",
  ]),
});

class Current200CliError extends Error {
  constructor(code, exitCode = 2) {
    super("CURRENT200 public bootstrap lifecycle CLI rejected the request.");
    this.name = "Current200CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.safeContractError = true;
  }
}

function fail(code, exitCode) {
  throw new Current200CliError(code, exitCode);
}

function parseArgs(args) {
  if (!Array.isArray(args) || args.length < 1 || args.length % 2 !== 0) {
    fail("CURRENT200_BOOTSTRAP_CLI_ARGUMENTS_INVALID");
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
      fail("CURRENT200_BOOTSTRAP_CLI_ARGUMENTS_INVALID");
    }
    values[key] = value;
  }
  const operation = String(values["--operation"] ?? "").toUpperCase();
  const expected = EXPECTED_ARGUMENTS[operation];
  const keys = Object.keys(values).sort();
  if (
    !expected ||
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index]) ||
    values["--confirm"] !==
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CLI_CONFIRMATION
  ) {
    fail("CURRENT200_BOOTSTRAP_CLI_ARGUMENTS_INVALID");
  }
  return Object.freeze({ operation, values: Object.freeze(values) });
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function readPublicKeyFile(filePath) {
  if (
    typeof filePath !== "string" ||
    filePath.length > 1_024 ||
    path.extname(filePath).toLowerCase() !== ".pem"
  ) {
    fail("CURRENT200_BOOTSTRAP_CLI_PUBLIC_KEY_INVALID");
  }
  let handle;
  try {
    const resolved = path.resolve(filePath);
    const pathIdentity = await lstat(resolved, { bigint: true });
    if (!pathIdentity.isFile() || pathIdentity.isSymbolicLink()) {
      fail("CURRENT200_BOOTSTRAP_CLI_PUBLIC_KEY_INVALID");
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
      before.size > BigInt(MAX_PUBLIC_KEY_BYTES)
    ) {
      fail("CURRENT200_BOOTSTRAP_CLI_PUBLIC_KEY_INVALID");
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
        fail("CURRENT200_BOOTSTRAP_CLI_PUBLIC_KEY_INVALID");
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
      fail("CURRENT200_BOOTSTRAP_CLI_PUBLIC_KEY_CHANGED");
    }
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes) || text.includes("\0")) {
      fail("CURRENT200_BOOTSTRAP_CLI_PUBLIC_KEY_INVALID");
    }
    return text;
  } catch (error) {
    if (error?.safeContractError) throw error;
    fail("CURRENT200_BOOTSTRAP_CLI_PUBLIC_KEY_UNAVAILABLE", 1);
  } finally {
    await handle?.close().catch(() => {});
  }
}

function command(parsed, publicKeyPem) {
  const values = parsed.values;
  return Object.freeze({
    approvedAt: values["--approved-at"],
    effectiveAt: values["--effective-at"],
    keyId: values["--key-id"],
    nextPublicKeyPem: publicKeyPem,
    nextValidUntil: values["--valid-until"] ?? null,
    operation: parsed.operation,
    operationId: values["--operation-id"],
    reasonDigest: values["--reason-digest"],
  });
}

export async function prepareLangameRuntimeTrustBootstrapLifecycleCurrent200Cli(
  args,
  options = {},
) {
  const parsed = parseArgs(args);
  const clock = options.clock ?? (() => new Date());
  const registry =
    options.registry ??
    PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198;
  const publicKeyPem =
    parsed.operation === "REVOKE"
      ? null
      : await (options.readPublicKey ?? readPublicKeyFile)(
          parsed.values["--public-key"],
        );
  const observedAt = clock();
  if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) {
    fail("CURRENT200_BOOTSTRAP_CLI_CLOCK_INVALID");
  }
  return prepareLangameRuntimeTrustBootstrapLifecycleCurrent200(
    { command: command(parsed, publicKeyPem), currentRegistry: registry },
    observedAt.toISOString(),
  );
}

function usage() {
  return [
    "CURRENT200 public bootstrap lifecycle planner",
    "",
    "Required pairs:",
    "  --operation enroll|rotate|revoke",
    "  --operation-id <uuid>",
    "  --key-id <key-id>",
    "  --approved-at <canonical-iso>",
    "  --effective-at <canonical-iso>",
    "  --reason-digest <sha256>",
    "  --public-key <public-ed25519-spki.pem>   (enroll/rotate)",
    "  --valid-until <canonical-iso>           (enroll/rotate)",
    `  --confirm ${LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CLI_CONFIRMATION}`,
    "",
    "The command prints a deny-only public candidate and never writes the registry.",
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const prepared =
    await prepareLangameRuntimeTrustBootstrapLifecycleCurrent200Cli(args);
  process.stdout.write(`${canonicalStringify(prepared)}\n`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${canonicalStringify({
        code: String(error?.code ?? "CURRENT200_BOOTSTRAP_CLI_REJECTED"),
        contract: LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CONTRACT,
        status: "REJECTED",
      })}\n`,
    );
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
