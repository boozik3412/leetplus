import { createHash, generateKeyPairSync } from "node:crypto";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_KEYGEN_CONTRACT =
  "CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_KEYGEN_V1";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const CONFIRMATION =
  "generate-current180-current190-disposable-rehearsal-coordinator";
const PRIVATE_KEY_NAME = "coordinator-private.pk8";
const PUBLIC_KEY_NAME = "coordinator-public.spki";

export class Current180Current190PostgresqlRehearsalCoordinatorKeygenError extends Error {
  constructor(code, findings = []) {
    super(
      "CURRENT180-CURRENT190 rehearsal coordinator key generation failed closed.",
    );
    this.name = "Current180Current190PostgresqlRehearsalCoordinatorKeygenError";
    this.code = code;
    this.findings = Object.freeze([...new Set(findings)].sort());
  }
}

function fail(code, findings) {
  throw new Current180Current190PostgresqlRehearsalCoordinatorKeygenError(
    code,
    findings,
  );
}

function sameNativePath(left, right) {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return platform() === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function sameOrDescendant(candidate, parent) {
  if (sameNativePath(candidate, parent)) return true;
  const fromParent = relative(parent, candidate);
  return (
    fromParent.length > 0 &&
    fromParent !== ".." &&
    !fromParent.startsWith(`..${sep}`) &&
    !isAbsolute(fromParent)
  );
}

function exactInput(input) {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    isProxy(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== 2 ||
    !keys.includes("confirmation") ||
    !keys.includes("outputDirectory") ||
    keys.some(
      (key) =>
        typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"),
    )
  ) {
    return null;
  }
  return {
    confirmation: descriptors.confirmation.value,
    outputDirectory: descriptors.outputDirectory.value,
  };
}

async function inspectCanonicalParent(outputDirectory) {
  if (
    typeof outputDirectory !== "string" ||
    outputDirectory.length === 0 ||
    outputDirectory.includes("\0") ||
    !isAbsolute(outputDirectory) ||
    !sameNativePath(outputDirectory, resolve(outputDirectory))
  ) {
    fail("COORDINATOR_KEYGEN_PATH_INVALID", [
      "EXACT_ABSOLUTE_OUTPUT_DIRECTORY_REQUIRED",
    ]);
  }
  const canonicalOutput = resolve(outputDirectory);
  const parent = dirname(canonicalOutput);
  let canonicalParent;
  let parentStat;
  let canonicalTemp;
  try {
    canonicalParent = resolve(await realpath(parent));
    parentStat = await lstat(parent, { bigint: true });
    canonicalTemp = resolve(await realpath(resolve(tmpdir())));
  } catch {
    fail("COORDINATOR_KEYGEN_PATH_INVALID", [
      "EXISTING_CANONICAL_PARENT_AND_SYSTEM_TEMP_REQUIRED",
    ]);
  }
  if (
    !sameNativePath(parent, canonicalParent) ||
    !parentStat.isDirectory() ||
    parentStat.isSymbolicLink()
  ) {
    fail("COORDINATOR_KEYGEN_PATH_INVALID", [
      "NON_SYMLINK_CANONICAL_PARENT_REQUIRED",
    ]);
  }
  if (
    sameOrDescendant(canonicalOutput, REPOSITORY_ROOT) ||
    sameOrDescendant(canonicalOutput, canonicalTemp)
  ) {
    fail("COORDINATOR_KEYGEN_PATH_INVALID", [
      "COORDINATOR_KEYS_MUST_NOT_BE_IN_TEMP_OR_REPOSITORY",
    ]);
  }
  try {
    await lstat(canonicalOutput);
    fail("COORDINATOR_KEYGEN_OUTPUT_EXISTS", [
      "FRESH_NONEXISTENT_OUTPUT_DIRECTORY_REQUIRED",
    ]);
  } catch (error) {
    if (
      error instanceof
      Current180Current190PostgresqlRehearsalCoordinatorKeygenError
    ) {
      throw error;
    }
    if (error?.code !== "ENOENT") {
      fail("COORDINATOR_KEYGEN_PATH_INVALID", [
        "OUTPUT_DIRECTORY_ABSENCE_NOT_PROVEN",
      ]);
    }
  }
  return { canonicalOutput, canonicalParent };
}

async function writeExclusive(path, bytes, mode) {
  let handle;
  try {
    handle = await open(path, "wx", mode);
    await handle.writeFile(bytes);
    await handle.sync();
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.size !== BigInt(bytes.length)) {
      fail("COORDINATOR_KEYGEN_WRITE_INVALID", [
        "EXACT_DURABLE_KEY_FILE_REQUIRED",
      ]);
    }
  } catch (error) {
    if (
      error instanceof
      Current180Current190PostgresqlRehearsalCoordinatorKeygenError
    ) {
      throw error;
    }
    fail("COORDINATOR_KEYGEN_WRITE_FAILED", [
      "EXCLUSIVE_DURABLE_KEY_WRITE_REQUIRED",
    ]);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function syncDirectory(path) {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (
      platform() === "win32" &&
      ["EACCES", "EINVAL", "EISDIR", "EPERM"].includes(error?.code)
    ) {
      return;
    }
    fail("COORDINATOR_KEYGEN_SYNC_FAILED", ["DIRECTORY_DURABILITY_NOT_PROVEN"]);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function generateCurrent180Current190PostgresqlRehearsalCoordinatorKeyPair(
  input,
) {
  if (arguments.length !== 1) {
    fail("COORDINATOR_KEYGEN_INPUT_INVALID", [
      "EXACT_CONFIRMATION_AND_OUTPUT_DIRECTORY_REQUIRED",
    ]);
  }
  const snapshot = exactInput(input);
  if (
    snapshot === null ||
    snapshot.confirmation !== CONFIRMATION ||
    typeof snapshot.outputDirectory !== "string"
  ) {
    fail("COORDINATOR_KEYGEN_INPUT_INVALID", [
      "EXACT_CONFIRMATION_AND_OUTPUT_DIRECTORY_REQUIRED",
    ]);
  }
  const { canonicalOutput, canonicalParent } = await inspectCanonicalParent(
    snapshot.outputDirectory,
  );
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateBytes = Buffer.from(
    privateKey.export({ format: "der", type: "pkcs8" }),
  );
  const publicBytes = Buffer.from(
    publicKey.export({ format: "der", type: "spki" }),
  );
  const privateKeyPath = join(canonicalOutput, PRIVATE_KEY_NAME);
  const publicKeyPath = join(canonicalOutput, PUBLIC_KEY_NAME);
  try {
    await mkdir(canonicalOutput, { mode: 0o700, recursive: false });
    await writeExclusive(privateKeyPath, privateBytes, 0o600);
    await writeExclusive(publicKeyPath, publicBytes, 0o644);
    await syncDirectory(canonicalOutput);
    await syncDirectory(canonicalParent);
  } finally {
    privateBytes.fill(0);
  }
  const result = {
    contract:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_KEYGEN_CONTRACT,
    expectedPublicKeySha256: createHash("sha256")
      .update(publicBytes)
      .digest("hex"),
    outputDirectory: canonicalOutput,
    privateKeyPath,
    publicKeyPath,
    status: "FRESH_FILE_BACKED_COORDINATOR_KEY_PAIR_CREATED",
  };
  return Object.freeze({
    ...result,
    keygenReceiptDigest: createHash("sha256")
      .update(JSON.stringify(result))
      .digest("hex"),
  });
}

function parseCliArguments(argv) {
  if (!Array.isArray(argv) || argv.length !== 4) return null;
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !["--confirm", "--output-dir"].includes(flag) ||
      typeof value !== "string" ||
      Object.hasOwn(parsed, flag)
    ) {
      return null;
    }
    parsed[flag] = value;
  }
  return Object.keys(parsed).length === 2
    ? {
        confirmation: parsed["--confirm"],
        outputDirectory: parsed["--output-dir"],
      }
    : null;
}

async function main() {
  const input = parseCliArguments(process.argv.slice(2));
  if (input === null) {
    throw new Current180Current190PostgresqlRehearsalCoordinatorKeygenError(
      "COORDINATOR_KEYGEN_CLI_INPUT_INVALID",
      ["EXACT_CONFIRM_AND_OUTPUT_DIR_FLAGS_REQUIRED"],
    );
  }
  const receipt =
    await generateCurrent180Current190PostgresqlRehearsalCoordinatorKeyPair(
      input,
    );
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (
  process.argv[1] &&
  sameNativePath(fileURLToPath(import.meta.url), resolve(process.argv[1]))
) {
  main().catch((error) => {
    const safe = {
      code:
        typeof error?.code === "string"
          ? error.code
          : "COORDINATOR_KEYGEN_UNEXPECTED_FAILURE",
      findings: Array.isArray(error?.findings) ? error.findings : [],
      status: "FAILED_CLOSED",
    };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
