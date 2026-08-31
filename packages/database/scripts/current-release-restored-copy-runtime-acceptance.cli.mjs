#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CURRENT_RELEASE_RUNTIME_ACCEPTANCE_CONTRACT,
  CURRENT_RELEASE_RUNTIME_ACCEPTANCE_FAIL,
  CURRENT_RELEASE_RUNTIME_ACCEPTANCE_PASS,
  CURRENT_RELEASE_STARTUP_TIMEOUT_DEFAULT_MS,
  CURRENT_RELEASE_STARTUP_TIMEOUT_MAX_MS,
  CURRENT_RELEASE_STARTUP_TIMEOUT_MIN_MS,
  normalizeCurrentReleaseStartupTimeoutMs,
  runCurrentReleaseRestoredCopyRuntimeAcceptance,
  verifySignedCurrentReleaseReceipt,
} from "./current-release-restored-copy-runtime-acceptance.mjs";

const CONFIRMATION = "run-current-release-restored-copy-runtime-acceptance";
const DATABASE_URL_ENV = "CURRENT_RELEASE_RESTORED_DATABASE_URL";
const LOGIN_EMAIL_ENV = "CURRENT_RELEASE_LOGIN_EMAIL";
const LOGIN_PASSWORD_ENV = "CURRENT_RELEASE_LOGIN_PASSWORD";
const HMAC_KEY_ENV = "CURRENT_RELEASE_EVIDENCE_HMAC_KEY";
const SYSTEMD_CREDENTIAL_NAME = "current-release-runtime.json";
const MAX_CREDENTIAL_BYTES = 32 * 1024;
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const SHA40 = /^[0-9a-f]{40}$/u;
const SAFE_KEY_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/u;

function exactCredentialObject(value) {
  const keys = [
    "databaseUrl",
    "evidenceHmacKey",
    "loginEmail",
    "loginPassword",
  ];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("\0") !== keys.sort().join("\0") ||
    keys.some((key) => typeof value[key] !== "string" || value[key].length < 1)
  ) {
    throw new Error("CREDENTIAL_FILE_INVALID");
  }
  return Object.freeze({
    databaseUrl: value.databaseUrl,
    evidenceHmacKey: value.evidenceHmacKey,
    loginEmail: value.loginEmail,
    loginPassword: value.loginPassword,
  });
}

async function readBoundedFile(
  filePath,
  maximumBytes,
  invalidCode,
  changedCode,
) {
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await open(filePath, flags);
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.size < 2n ||
      before.size > BigInt(maximumBytes)
    ) {
      throw new Error(invalidCode);
    }
    const buffer = Buffer.alloc(maximumBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (
      offset > maximumBytes ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      BigInt(offset) !== before.size
    ) {
      throw new Error(changedCode);
    }
    return buffer.subarray(0, offset).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function assertCanonicalPath(filePath, expectedType, errorCode) {
  if (
    typeof filePath !== "string" ||
    !path.isAbsolute(filePath) ||
    filePath.includes("\0")
  ) {
    throw new Error(errorCode);
  }
  const resolved = path.resolve(filePath);
  const parsed = path.parse(resolved);
  const segments = resolved
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean);
  let cursor = parsed.root;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    const metadata = await lstat(cursor, { bigint: true }).catch(() => null);
    const terminal = index === segments.length - 1;
    if (
      !metadata ||
      metadata.isSymbolicLink() ||
      (!terminal && !metadata.isDirectory()) ||
      (terminal && expectedType === "directory" && !metadata.isDirectory()) ||
      (terminal && expectedType === "file" && !metadata.isFile())
    ) {
      throw new Error(errorCode);
    }
  }
  const canonical = await realpath(resolved);
  const originalMetadata = await lstat(resolved, { bigint: true });
  const canonicalMetadata = await lstat(canonical, { bigint: true });
  if (
    originalMetadata.dev !== canonicalMetadata.dev ||
    originalMetadata.ino !== canonicalMetadata.ino ||
    (process.platform !== "win32" && canonical !== resolved)
  ) {
    throw new Error(errorCode);
  }
  return canonical;
}

export async function loadCurrentReleaseSecrets(environment = process.env) {
  const directValues = [
    environment[DATABASE_URL_ENV],
    environment[HMAC_KEY_ENV],
    environment[LOGIN_EMAIL_ENV],
    environment[LOGIN_PASSWORD_ENV],
  ];
  const directCount = directValues.filter(
    (value) => value !== undefined,
  ).length;
  const credentialDirectory = environment.CREDENTIALS_DIRECTORY;
  if (directCount === 4 && credentialDirectory === undefined) {
    return exactCredentialObject({
      databaseUrl: directValues[0],
      evidenceHmacKey: directValues[1],
      loginEmail: directValues[2],
      loginPassword: directValues[3],
    });
  }
  if (
    directCount !== 0 ||
    typeof credentialDirectory !== "string" ||
    !path.isAbsolute(credentialDirectory) ||
    credentialDirectory.includes("\0")
  ) {
    throw new Error("CREDENTIAL_SOURCE_INVALID");
  }
  const canonicalDirectory = await assertCanonicalPath(
    credentialDirectory,
    "directory",
    "CREDENTIAL_SOURCE_INVALID",
  );
  const credentialPath = path.join(canonicalDirectory, SYSTEMD_CREDENTIAL_NAME);
  await assertCanonicalPath(
    credentialPath,
    "file",
    "CREDENTIAL_SOURCE_INVALID",
  );
  const raw = await readBoundedFile(
    credentialPath,
    MAX_CREDENTIAL_BYTES,
    "CREDENTIAL_FILE_INVALID",
    "CREDENTIAL_FILE_CHANGED",
  );
  if (!raw.endsWith("\n") || raw.includes("\r") || raw.includes("\0")) {
    throw new Error("CREDENTIAL_FILE_INVALID");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("CREDENTIAL_FILE_INVALID");
  }
  return exactCredentialObject(parsed);
}

export async function verifyCurrentReleaseEvidence(
  { evidenceKeyId, evidencePath, releaseSha },
  hmacKey,
) {
  if (
    !path.isAbsolute(evidencePath) ||
    !SHA40.test(releaseSha) ||
    !SAFE_KEY_ID.test(evidenceKeyId)
  ) {
    throw new Error("EVIDENCE_VERIFICATION_ARGUMENT_INVALID");
  }
  const canonicalPath = await assertCanonicalPath(
    evidencePath,
    "file",
    "EVIDENCE_FILE_INVALID",
  );
  const raw = await readBoundedFile(
    canonicalPath,
    MAX_RECEIPT_BYTES,
    "EVIDENCE_FILE_INVALID",
    "EVIDENCE_FILE_CHANGED",
  );
  if (!raw.endsWith("\n") || raw.includes("\0")) {
    throw new Error("EVIDENCE_FILE_INVALID");
  }
  let receipt;
  try {
    receipt = JSON.parse(raw);
  } catch {
    throw new Error("EVIDENCE_FILE_INVALID");
  }
  let signatureValid = false;
  try {
    signatureValid = verifySignedCurrentReleaseReceipt(receipt, hmacKey);
  } catch {
    signatureValid = false;
  }
  let startupTimeoutMs;
  try {
    if (receipt?.evidence?.runtime?.startupTimeoutMs === undefined) {
      throw new Error("missing startup timeout telemetry");
    }
    startupTimeoutMs = normalizeCurrentReleaseStartupTimeoutMs(
      receipt?.evidence?.runtime?.startupTimeoutMs,
    );
  } catch {
    throw new Error("EVIDENCE_VERIFICATION_FAILED");
  }
  if (
    !signatureValid ||
    receipt?.contractVersion !== CURRENT_RELEASE_RUNTIME_ACCEPTANCE_CONTRACT ||
    receipt?.releaseSha !== releaseSha ||
    receipt?.signature?.keyId !== evidenceKeyId ||
    ![
      CURRENT_RELEASE_RUNTIME_ACCEPTANCE_PASS,
      CURRENT_RELEASE_RUNTIME_ACCEPTANCE_FAIL,
    ].includes(receipt?.decision)
  ) {
    throw new Error("EVIDENCE_VERIFICATION_FAILED");
  }
  return Object.freeze({
    contractVersion: receipt.contractVersion,
    decision: receipt.decision,
    evidenceDigest: receipt.evidenceDigest,
    releaseSha: receipt.releaseSha,
    reasonCode: receipt.reasonCode,
    signatureKeyId: receipt.signature.keyId,
    signatureValid: true,
    startupTimeoutMs,
  });
}

export function usage() {
  return `Usage:
  node current-release-restored-copy-runtime-acceptance.cli.mjs \\
    --confirm ${CONFIRMATION} \\
    --artifact-root <absolute-hydrated-exact-artifact-root> \\
    --release-sha <exact-40-character-SHA> \\
    --tenant-slug <existing-active-tenant-slug> \\
    --expected-system-identifier <isolated-cluster-system-id> \\
    --expected-migration-count <exact-applied-count> \\
    --expected-migration-head <exact-head-name> \\
    --api-port <alternate-loopback-port> \\
    --web-port <different-alternate-loopback-port> \\
    [--startup-timeout-ms <${CURRENT_RELEASE_STARTUP_TIMEOUT_MIN_MS}..${CURRENT_RELEASE_STARTUP_TIMEOUT_MAX_MS}>] \\
    --evidence-key-id <non-secret-key-id> \\
    --evidence <new-absolute-receipt-path> \\
    [--with-reversible-write]

Verify a previously published receipt after a lost CLI/systemd response:
  node current-release-restored-copy-runtime-acceptance.cli.mjs \\
    --verify-evidence \\
    --release-sha <exact-40-character-SHA> \\
    --evidence-key-id <non-secret-key-id> \\
    --evidence <existing-absolute-receipt-path>

Required secret environment (values are never printed or persisted):
  ${DATABASE_URL_ENV}=postgresql://<role>:<password>@127.0.0.1:<non-5432>/leetplus_restored_*
  ${LOGIN_EMAIL_ENV}=<active-owner-of-the-expected-tenant>
  ${LOGIN_PASSWORD_ENV}=<password>
  ${HMAC_KEY_ENV}=<independent-random-value-at-least-32-characters>

Production-like Linux wrapper instead supplies the same four values as exact
JSON keys databaseUrl/evidenceHmacKey/loginEmail/loginPassword through the
systemd credential named ${SYSTEMD_CREDENTIAL_NAME}; direct environment and
systemd credential sources may never be mixed.

The command requires a root-sealed artifact with exact SHA256SUMS, a full
HYDRATED_SHA256SUMS, an exact HYDRATED_SYMLINKS.json topology manifest and a
valid no-egress hydration receipt. It must itself run
as a non-root systemd service/scope named
leetplus-current-release-acceptance-<8..32 lowercase alnum>.service|scope with
NoNewPrivileges, no effective capabilities, IPAddressDeny=any and the exact
IPAddressAllow=127.0.0.1/32,::1/128 boundary; a live kernel-denial probe is
mandatory. It starts
the API and Web production builds only on alternate loopback ports. All
schedulers and outbound effects are forced off. It accepts /version,
/health/ready, dynamic Web release
identity, Web BFF login/auth-me, and authenticated beta-module reads. The
optional write creates and deletes one exact checklist-template fixture; any
direct SQL cleanup makes the run FAIL. The receipt contains aggregate hashes,
counts and an HMAC only; it never stores HTTP bodies, logs, PII, credentials or
tokens. The evidence parent directory must already exist, be owned by the
calling user and not be group/other-writable; an existing receipt is never
overwritten. Production, port 5432 and non-restored database names are
rejected.`;
}

export function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true };
  }
  let withReversibleWrite = false;
  let verifyEvidence = false;
  const pairs = [];
  for (const argument of argv) {
    if (argument === "--with-reversible-write") {
      if (withReversibleWrite) throw new Error("ARGUMENTS_INVALID");
      withReversibleWrite = true;
    } else if (argument === "--verify-evidence") {
      if (verifyEvidence) throw new Error("ARGUMENTS_INVALID");
      verifyEvidence = true;
    } else {
      pairs.push(argument);
    }
  }
  if (verifyEvidence) {
    if (withReversibleWrite) throw new Error("ARGUMENTS_INVALID");
    const accepted = new Set([
      "--evidence",
      "--evidence-key-id",
      "--release-sha",
    ]);
    const parsed = {};
    for (let index = 0; index < pairs.length; index += 2) {
      const key = pairs[index];
      const value = pairs[index + 1];
      if (
        !accepted.has(key) ||
        value === undefined ||
        parsed[key] !== undefined
      ) {
        throw new Error("ARGUMENTS_INVALID");
      }
      parsed[key] = value;
    }
    if ([...accepted].some((key) => parsed[key] === undefined)) {
      throw new Error("ARGUMENTS_INVALID");
    }
    return Object.freeze({
      evidenceKeyId: parsed["--evidence-key-id"],
      evidencePath: parsed["--evidence"],
      help: false,
      releaseSha: parsed["--release-sha"],
      verifyEvidence: true,
    });
  }
  const accepted = new Set([
    "--api-port",
    "--artifact-root",
    "--confirm",
    "--evidence",
    "--evidence-key-id",
    "--expected-migration-count",
    "--expected-migration-head",
    "--expected-system-identifier",
    "--release-sha",
    "--startup-timeout-ms",
    "--tenant-slug",
    "--web-port",
  ]);
  const required = new Set(
    [...accepted].filter((key) => key !== "--startup-timeout-ms"),
  );
  const parsed = {};
  for (let index = 0; index < pairs.length; index += 2) {
    const key = pairs[index];
    const value = pairs[index + 1];
    if (
      !accepted.has(key) ||
      value === undefined ||
      parsed[key] !== undefined
    ) {
      throw new Error("ARGUMENTS_INVALID");
    }
    parsed[key] = value;
  }
  if ([...required].some((key) => parsed[key] === undefined)) {
    throw new Error("ARGUMENTS_INVALID");
  }
  if (parsed["--confirm"] !== CONFIRMATION) {
    throw new Error("CONFIRMATION_REQUIRED");
  }
  const startupTimeoutRaw = parsed["--startup-timeout-ms"];
  if (
    startupTimeoutRaw !== undefined &&
    !/^(?:0|[1-9][0-9]{0,8})$/u.test(startupTimeoutRaw)
  ) {
    throw new Error("ARGUMENTS_INVALID");
  }
  let startupTimeoutMs;
  try {
    startupTimeoutMs = normalizeCurrentReleaseStartupTimeoutMs(
      startupTimeoutRaw === undefined
        ? CURRENT_RELEASE_STARTUP_TIMEOUT_DEFAULT_MS
        : Number(startupTimeoutRaw),
    );
  } catch {
    throw new Error("ARGUMENTS_INVALID");
  }
  return Object.freeze({
    apiPort: Number(parsed["--api-port"]),
    artifactRoot: parsed["--artifact-root"],
    evidenceKeyId: parsed["--evidence-key-id"],
    evidencePath: parsed["--evidence"],
    expectedMigrationCount: Number(parsed["--expected-migration-count"]),
    expectedMigrationHead: parsed["--expected-migration-head"],
    expectedSystemIdentifier: parsed["--expected-system-identifier"],
    help: false,
    releaseSha: parsed["--release-sha"],
    startupTimeoutMs,
    tenantSlug: parsed["--tenant-slug"],
    verifyEvidence: false,
    webPort: Number(parsed["--web-port"]),
    withReversibleWrite,
  });
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
  run = runCurrentReleaseRestoredCopyRuntimeAcceptance,
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
  try {
    const secrets = await loadCurrentReleaseSecrets(environment);
    if (args.verifyEvidence) {
      const result = await verifyCurrentReleaseEvidence(
        args,
        secrets.evidenceHmacKey,
      );
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return result.decision === CURRENT_RELEASE_RUNTIME_ACCEPTANCE_PASS
        ? 0
        : 1;
    }
    const receipt = await run({
      apiPort: args.apiPort,
      artifactRoot: args.artifactRoot,
      databaseUrl: secrets.databaseUrl,
      evidenceHmacKey: secrets.evidenceHmacKey,
      evidenceKeyId: args.evidenceKeyId,
      evidencePath: args.evidencePath,
      expected: {
        expectedMigrationCount: args.expectedMigrationCount,
        expectedMigrationHead: args.expectedMigrationHead,
        expectedSystemIdentifier: args.expectedSystemIdentifier,
        releaseSha: args.releaseSha,
        tenantSlug: args.tenantSlug,
      },
      loginEmail: secrets.loginEmail,
      loginPassword: secrets.loginPassword,
      startupTimeoutMs: args.startupTimeoutMs,
      webPort: args.webPort,
      withReversibleWrite: args.withReversibleWrite,
    });
    process.stdout.write(
      `${JSON.stringify({
        contractVersion: receipt.contractVersion,
        decision: receipt.decision,
        evidenceDigest: receipt.evidenceDigest,
        releaseSha: receipt.releaseSha,
        reasonCode: receipt.reasonCode,
        signatureKeyId: receipt.signature.keyId,
        startupTimeoutMs: receipt.evidence.runtime.startupTimeoutMs,
      })}\n`,
    );
    return receipt.decision === CURRENT_RELEASE_RUNTIME_ACCEPTANCE_PASS ? 0 : 1;
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        contractVersion: CURRENT_RELEASE_RUNTIME_ACCEPTANCE_CONTRACT,
        decision: "FAIL",
        releaseSha: args.releaseSha,
        reasonCode:
          error?.safeContractError === true
            ? error.reasonCode
            : "CURRENT_RELEASE_RUNTIME_UNEXPECTED_FAILURE",
      })}\n`,
    );
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
