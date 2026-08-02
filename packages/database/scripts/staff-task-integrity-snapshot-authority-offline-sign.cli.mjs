import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import {
  approvalReferenceForAcquisitionRequest,
  computeAcquisitionRequestDigest,
  normalizeAcquisitionRequest,
  parseCanonicalAcquisitionRequest,
} from "./staff-task-integrity-snapshot-acquisition-request.mjs";
import {
  AUTHORITY_CLASSIFICATION,
  AUTHORITY_ISOLATION_PROFILE,
  AUTHORITY_KIND,
  AUTHORITY_PROFILE,
  AUTHORITY_PURPOSE,
  AUTHORITY_SIGNATURE_ALGORITHM,
  authorityDatabaseMarker,
  authoritySigningPayload,
  computeApprovalReferenceDigest,
  computeAuthorityEnvelopeDigest,
  computeNonceBoundDatabaseIdentityDigest,
  encodeAuthorityEnvelope,
  verifyAuthorityEnvelopeAgainstRoots,
} from "./staff-task-integrity-snapshot-authority.mjs";
import {
  selectActiveAuthorityRoot,
  validateAuthorityRootRegistry,
} from "./staff-task-integrity-snapshot-authority-root-registry.mjs";
import { PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS } from "./staff-task-integrity-snapshot-authority-roots.mjs";

export const SIGNING_PACKAGE_KIND =
  "LEETPLUS_STAFF_TASK_SNAPSHOT_AUTHORITY_SIGNING_PACKAGE";
export const SIGNING_RECEIPT_KIND =
  "LEETPLUS_STAFF_TASK_SNAPSHOT_AUTHORITY_SIGNING_RECEIPT";
export const PREPARE_CONFIRMATION =
  "prepare-reviewed-production-like-authority-payload";
export const FINALIZE_CONFIRMATION =
  "finalize-reviewed-production-like-authority-envelope";

const MAX_DOCUMENT_BYTES = 32 * 1024;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const BASE64URL_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/u;
const PACKAGE_KEYS = Object.freeze(
  [
    "acquisitionRequestDigest",
    "approvalReference",
    "kind",
    "publicKeyFingerprint",
    "schemaVersion",
    "signingKeyId",
    "signingPayloadDigest",
    "unsignedEnvelope",
  ].sort((left, right) => left.localeCompare(right)),
);
const UNSIGNED_ENVELOPE_KEYS = Object.freeze(
  [
    "acquiredAt",
    "approvalReferenceDigest",
    "classification",
    "creationNonce",
    "databaseIdentityDigest",
    "expectedState",
    "expiresAt",
    "isolationProfile",
    "issuedAt",
    "kind",
    "profile",
    "purpose",
    "releaseSha",
    "restoredAt",
    "schemaVersion",
    "signatureAlgorithm",
    "signingKeyId",
    "snapshotArtifactDigest",
  ].sort((left, right) => left.localeCompare(right)),
);
const REPO_ROOT = realpathSync(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const DEFAULT_EVIDENCE_FILE_SYSTEM = Object.freeze({
  open: openSync,
  write: writeFileSync,
  sync: fsyncSync,
  close: closeSync,
  remove: rmSync,
});
export const CEREMONY_RELEASE_SOURCE_PATHS = Object.freeze([
  "packages/database/scripts/staff-task-integrity-canonical-json.mjs",
  "packages/database/scripts/staff-task-integrity-migration-state.mjs",
  "packages/database/scripts/staff-task-integrity-snapshot-acquisition-request.mjs",
  "packages/database/scripts/staff-task-integrity-snapshot-authority-offline-sign.cli.mjs",
  "packages/database/scripts/staff-task-integrity-snapshot-authority-root-registry.mjs",
  "packages/database/scripts/staff-task-integrity-snapshot-authority-roots.json",
  "packages/database/scripts/staff-task-integrity-snapshot-authority-roots.mjs",
  "packages/database/scripts/staff-task-integrity-snapshot-authority.mjs",
]);

function signingError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = 3;
  error.safeContractError = true;
  throw error;
}

function exactDataRecord(value, expectedKeys, code, message) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    signingError(code, message);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors).sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
  if (
    keys.length !== expectedKeys.length ||
    keys.some(
      (key, index) => typeof key !== "string" || key !== expectedKeys[index],
    ) ||
    keys.some((key) => !Object.hasOwn(descriptors[key], "value"))
  ) {
    signingError(code, message);
  }
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function normalizedNow(now) {
  const current = now instanceof Date ? new Date(now.valueOf()) : new Date(now);
  if (Number.isNaN(current.valueOf())) {
    signingError(
      "AUTHORITY_OFFLINE_SIGNING_TIME_INVALID",
      "The offline signing time is invalid.",
    );
  }
  return current;
}

function sha256(domain, value) {
  return createHash("sha256")
    .update(`${domain}\0`, "utf8")
    .update(value)
    .digest("hex");
}

function envelopeWithSignature(unsignedEnvelope, signature) {
  return {
    schemaVersion: unsignedEnvelope.schemaVersion,
    kind: unsignedEnvelope.kind,
    purpose: unsignedEnvelope.purpose,
    classification: unsignedEnvelope.classification,
    profile: unsignedEnvelope.profile,
    signatureAlgorithm: unsignedEnvelope.signatureAlgorithm,
    signingKeyId: unsignedEnvelope.signingKeyId,
    releaseSha: unsignedEnvelope.releaseSha,
    expectedState: unsignedEnvelope.expectedState,
    snapshotArtifactDigest: unsignedEnvelope.snapshotArtifactDigest,
    creationNonce: unsignedEnvelope.creationNonce,
    databaseIdentityDigest: unsignedEnvelope.databaseIdentityDigest,
    approvalReferenceDigest: unsignedEnvelope.approvalReferenceDigest,
    isolationProfile: unsignedEnvelope.isolationProfile,
    acquiredAt: unsignedEnvelope.acquiredAt,
    restoredAt: unsignedEnvelope.restoredAt,
    issuedAt: unsignedEnvelope.issuedAt,
    expiresAt: unsignedEnvelope.expiresAt,
    signature,
  };
}

export function prepareAuthoritySigningPackage({
  acquisitionRequest,
  roots = PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS,
  now = new Date(),
  creationNonce = randomBytes(32).toString("hex"),
}) {
  const current = normalizedNow(now);
  const normalizedRoots = validateAuthorityRootRegistry(roots);
  const activeRoot = selectActiveAuthorityRoot(normalizedRoots, current);
  const normalizedRequest = normalizeAcquisitionRequest(
    acquisitionRequest,
    current,
  );
  const requestDigest = computeAcquisitionRequestDigest(
    normalizedRequest,
    current,
  );
  const approvalReference = approvalReferenceForAcquisitionRequest(
    normalizedRequest,
    current,
  );
  if (!SHA_256_PATTERN.test(String(creationNonce ?? ""))) {
    signingError(
      "AUTHORITY_OFFLINE_SIGNING_NONCE_INVALID",
      "The signing ceremony nonce is invalid.",
    );
  }
  if (
    new Date(normalizedRequest.timeline.restoredAt).valueOf() >
      current.valueOf() ||
    new Date(normalizedRequest.timeline.expiresAt).valueOf() >
      new Date(activeRoot.notAfter).valueOf()
  ) {
    signingError(
      "AUTHORITY_OFFLINE_SIGNING_TIMELINE_INVALID",
      "The signing request is not ready or exceeds the active root validity window.",
    );
  }
  const unsignedEnvelope = Object.freeze({
    schemaVersion: 1,
    kind: AUTHORITY_KIND,
    purpose: AUTHORITY_PURPOSE,
    classification: AUTHORITY_CLASSIFICATION,
    profile: AUTHORITY_PROFILE,
    signatureAlgorithm: AUTHORITY_SIGNATURE_ALGORITHM,
    signingKeyId: activeRoot.keyId,
    releaseSha: normalizedRequest.releaseSha,
    expectedState: normalizedRequest.expectedState,
    snapshotArtifactDigest: normalizedRequest.snapshotArtifactDigest,
    creationNonce,
    databaseIdentityDigest: computeNonceBoundDatabaseIdentityDigest(
      {
        current_database: normalizedRequest.databaseIdentity.currentDatabase,
        cluster_system_identifier:
          normalizedRequest.databaseIdentity.clusterSystemIdentifier,
        database_oid: normalizedRequest.databaseIdentity.databaseOid,
      },
      creationNonce,
    ),
    approvalReferenceDigest: computeApprovalReferenceDigest(
      approvalReference,
      creationNonce,
    ),
    isolationProfile: AUTHORITY_ISOLATION_PROFILE,
    acquiredAt: normalizedRequest.timeline.acquiredAt,
    restoredAt: normalizedRequest.timeline.restoredAt,
    issuedAt: current.toISOString(),
    expiresAt: normalizedRequest.timeline.expiresAt,
  });
  const placeholderEnvelope = envelopeWithSignature(
    unsignedEnvelope,
    Buffer.alloc(64).toString("base64url"),
  );
  const signingPayload = authoritySigningPayload(placeholderEnvelope);
  const signingPackage = Object.freeze({
    schemaVersion: 1,
    kind: SIGNING_PACKAGE_KIND,
    acquisitionRequestDigest: requestDigest,
    approvalReference,
    signingKeyId: activeRoot.keyId,
    publicKeyFingerprint: activeRoot.publicKeyFingerprint,
    signingPayloadDigest: sha256(
      "staff-task-snapshot-authority-signing-payload-v1",
      signingPayload,
    ),
    unsignedEnvelope,
  });
  return Object.freeze({ signingPackage, signingPayload });
}

export function finalizeAuthoritySigningPackage({
  acquisitionRequest,
  signingPackage,
  signature,
  roots = PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS,
  now = new Date(),
}) {
  const current = normalizedNow(now);
  const normalizedRequest = normalizeAcquisitionRequest(
    acquisitionRequest,
    current,
  );
  const requestDigest = computeAcquisitionRequestDigest(
    normalizedRequest,
    current,
  );
  const approvalReference = approvalReferenceForAcquisitionRequest(
    normalizedRequest,
    current,
  );
  const normalizedPackage = exactDataRecord(
    signingPackage,
    PACKAGE_KEYS,
    "AUTHORITY_SIGNING_PACKAGE_INVALID",
    "The authority signing package is invalid.",
  );
  normalizedPackage.unsignedEnvelope = exactDataRecord(
    normalizedPackage.unsignedEnvelope,
    UNSIGNED_ENVELOPE_KEYS,
    "AUTHORITY_SIGNING_PACKAGE_INVALID",
    "The unsigned authority envelope is invalid.",
  );
  if (
    normalizedPackage.schemaVersion !== 1 ||
    normalizedPackage.kind !== SIGNING_PACKAGE_KIND ||
    !SHA_256_PATTERN.test(
      String(normalizedPackage.acquisitionRequestDigest ?? ""),
    ) ||
    normalizedPackage.approvalReference !==
      `acquisition-v1:${normalizedPackage.acquisitionRequestDigest}` ||
    !SHA_256_PATTERN.test(
      String(normalizedPackage.publicKeyFingerprint ?? ""),
    ) ||
    !SHA_256_PATTERN.test(String(normalizedPackage.signingPayloadDigest ?? ""))
  ) {
    signingError(
      "AUTHORITY_SIGNING_PACKAGE_INVALID",
      "The authority signing package failed its exact contract.",
    );
  }
  const unsigned = normalizedPackage.unsignedEnvelope;
  const requestDatabaseIdentityDigest = computeNonceBoundDatabaseIdentityDigest(
    {
      current_database: normalizedRequest.databaseIdentity.currentDatabase,
      cluster_system_identifier:
        normalizedRequest.databaseIdentity.clusterSystemIdentifier,
      database_oid: normalizedRequest.databaseIdentity.databaseOid,
    },
    unsigned.creationNonce,
  );
  if (
    normalizedPackage.acquisitionRequestDigest !== requestDigest ||
    normalizedPackage.approvalReference !== approvalReference ||
    unsigned.releaseSha !== normalizedRequest.releaseSha ||
    unsigned.expectedState !== normalizedRequest.expectedState ||
    unsigned.snapshotArtifactDigest !==
      normalizedRequest.snapshotArtifactDigest ||
    unsigned.databaseIdentityDigest !== requestDatabaseIdentityDigest ||
    unsigned.acquiredAt !== normalizedRequest.timeline.acquiredAt ||
    unsigned.restoredAt !== normalizedRequest.timeline.restoredAt ||
    unsigned.expiresAt !== normalizedRequest.timeline.expiresAt
  ) {
    signingError(
      "AUTHORITY_SIGNING_PACKAGE_ACQUISITION_MISMATCH",
      "The signing package does not match the canonical acquisition request.",
    );
  }
  const normalizedRoots = validateAuthorityRootRegistry(roots);
  const activeRoot = selectActiveAuthorityRoot(normalizedRoots, current);
  if (
    normalizedPackage.signingKeyId !== activeRoot.keyId ||
    normalizedPackage.publicKeyFingerprint !==
      activeRoot.publicKeyFingerprint ||
    normalizedPackage.unsignedEnvelope.signingKeyId !== activeRoot.keyId
  ) {
    signingError(
      "AUTHORITY_SIGNING_PACKAGE_ROOT_MISMATCH",
      "The authority signing package does not match the active public root.",
    );
  }
  const signatureBytes = Buffer.isBuffer(signature)
    ? Buffer.from(signature)
    : Buffer.from(signature ?? []);
  if (signatureBytes.length !== 64) {
    signingError(
      "AUTHORITY_DETACHED_SIGNATURE_INVALID",
      "The detached Ed25519 signature must contain exactly 64 bytes.",
    );
  }
  const encodedSignature = signatureBytes.toString("base64url");
  if (!BASE64URL_SIGNATURE_PATTERN.test(encodedSignature)) {
    signingError(
      "AUTHORITY_DETACHED_SIGNATURE_INVALID",
      "The detached Ed25519 signature encoding is invalid.",
    );
  }
  const envelope = envelopeWithSignature(
    normalizedPackage.unsignedEnvelope,
    encodedSignature,
  );
  const signingPayload = authoritySigningPayload(envelope);
  if (
    sha256(
      "staff-task-snapshot-authority-signing-payload-v1",
      signingPayload,
    ) !== normalizedPackage.signingPayloadDigest
  ) {
    signingError(
      "AUTHORITY_SIGNING_PACKAGE_PAYLOAD_MISMATCH",
      "The authority signing package payload digest does not match.",
    );
  }
  const verified = verifyAuthorityEnvelopeAgainstRoots(
    envelope,
    {
      releaseSha: normalizedRequest.releaseSha,
      expectedState: normalizedRequest.expectedState,
      snapshotArtifactDigest: normalizedRequest.snapshotArtifactDigest,
      approvalReference,
      acquiredAt: normalizedRequest.timeline.acquiredAt,
      restoredAt: normalizedRequest.timeline.restoredAt,
      expiresAt: normalizedRequest.timeline.expiresAt,
    },
    normalizedRoots,
    current,
  );
  const authorityEnvelope = encodeAuthorityEnvelope(envelope);
  const authorityEnvelopeDigest = computeAuthorityEnvelopeDigest(envelope);
  const receipt = Object.freeze({
    schemaVersion: 1,
    kind: SIGNING_RECEIPT_KIND,
    acquisitionRequestDigest: normalizedPackage.acquisitionRequestDigest,
    signingKeyId: verified.signingKeyId,
    publicKeyFingerprint: verified.publicKeyFingerprint,
    releaseSha: verified.releaseSha,
    expectedState: verified.expectedState,
    issuedAt: verified.issuedAt,
    expiresAt: verified.expiresAt,
    authorityEnvelopeDigest,
    databaseMarker: authorityDatabaseMarker(authorityEnvelopeDigest),
  });
  return Object.freeze({ authorityEnvelope, receipt });
}

function normalizedReleaseSourceContent(content) {
  if (!Buffer.isBuffer(content)) {
    signingError(
      "AUTHORITY_RELEASE_EVIDENCE_MISMATCH",
      "A ceremony release source is invalid.",
    );
  }
  const decoded = content.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(content) || decoded.includes("\0")) {
    signingError(
      "AUTHORITY_RELEASE_EVIDENCE_MISMATCH",
      "Ceremony release sources must be valid UTF-8 text.",
    );
  }
  return decoded.replace(/\r\n/gu, "\n");
}

function assertExactCleanReleaseSha(releaseSha) {
  let head;
  let status;
  try {
    head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    status = execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=normal"],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        windowsHide: true,
      },
    );
  } catch {
    signingError(
      "AUTHORITY_RELEASE_EVIDENCE_UNAVAILABLE",
      "Exact Git release evidence is unavailable.",
    );
  }
  if (head !== releaseSha || status !== "") {
    signingError(
      "AUTHORITY_RELEASE_EVIDENCE_MISMATCH",
      "The signing ceremony requires one exact clean release SHA.",
    );
  }
  try {
    for (const sourcePath of CEREMONY_RELEASE_SOURCE_PATHS) {
      const worktreeContent = readFileSync(path.join(REPO_ROOT, sourcePath));
      const releaseContent = execFileSync(
        "git",
        ["show", `${releaseSha}:${sourcePath}`],
        {
          cwd: REPO_ROOT,
          encoding: null,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
        },
      );
      if (
        normalizedReleaseSourceContent(worktreeContent) !==
        normalizedReleaseSourceContent(releaseContent)
      ) {
        signingError(
          "AUTHORITY_RELEASE_EVIDENCE_MISMATCH",
          "Ceremony runtime differs from the exact release artifact.",
        );
      }
    }
  } catch (error) {
    if (error?.safeContractError) {
      throw error;
    }
    signingError(
      "AUTHORITY_RELEASE_EVIDENCE_UNAVAILABLE",
      "Exact Git release evidence is unavailable.",
    );
  }
}

function pathIsInside(parentPath, candidatePath) {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
}

function externalInputPath(rawPath, label) {
  const candidatePath = path.resolve(String(rawPath ?? ""));
  if (path.basename(candidatePath).includes(":")) {
    signingError(
      "AUTHORITY_EVIDENCE_PATH_INVALID",
      `${label} uses an ambiguous filesystem stream path.`,
    );
  }
  let resolvedPath;
  try {
    resolvedPath = realpathSync(candidatePath);
  } catch {
    signingError("AUTHORITY_EVIDENCE_PATH_INVALID", `${label} is unavailable.`);
  }
  if (
    pathIsInside(REPO_ROOT, resolvedPath) ||
    !statSync(resolvedPath).isFile()
  ) {
    signingError(
      "AUTHORITY_EVIDENCE_PATH_INVALID",
      `${label} must be a protected file outside the repository.`,
    );
  }
  return resolvedPath;
}

function externalOutputPath(rawPath) {
  const outputPath = path.resolve(String(rawPath ?? ""));
  if (path.basename(outputPath).includes(":")) {
    signingError(
      "AUTHORITY_EVIDENCE_PATH_INVALID",
      "Authority evidence cannot use an ambiguous filesystem stream path.",
    );
  }
  let parentPath;
  try {
    parentPath = realpathSync(path.dirname(outputPath));
  } catch {
    signingError(
      "AUTHORITY_EVIDENCE_PATH_INVALID",
      "The protected output directory is unavailable.",
    );
  }
  if (pathIsInside(REPO_ROOT, parentPath)) {
    signingError(
      "AUTHORITY_EVIDENCE_PATH_INVALID",
      "Authority evidence must stay outside the repository.",
    );
  }
  return outputPath;
}

function readBoundedFile(filePath, maxBytes = MAX_DOCUMENT_BYTES) {
  const bytes = readFileSync(filePath);
  if (bytes.length === 0 || bytes.length > maxBytes) {
    signingError(
      "AUTHORITY_EVIDENCE_FILE_INVALID",
      "An authority evidence file has an invalid size.",
    );
  }
  return bytes;
}

function parseCanonicalPackage(bytes) {
  const text = bytes.toString("utf8");
  if (Buffer.from(text, "utf8").compare(bytes) !== 0) {
    signingError(
      "AUTHORITY_SIGNING_PACKAGE_INVALID",
      "The signing package must be valid UTF-8.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    signingError(
      "AUTHORITY_SIGNING_PACKAGE_INVALID",
      "The signing package is not valid JSON.",
    );
  }
  if (canonicalStringify(parsed) !== text) {
    signingError(
      "AUTHORITY_SIGNING_PACKAGE_INVALID",
      "The signing package must be canonical JSON.",
    );
  }
  return parsed;
}

export function writeExclusiveSet(
  entries,
  fileSystem = DEFAULT_EVIDENCE_FILE_SYSTEM,
) {
  const entryPaths = Array.isArray(entries)
    ? entries.map((entry) => entry?.filePath)
    : [];
  const normalizedParentPaths = new Set(
    entryPaths.map((filePath) => {
      const parentPath = path.dirname(path.resolve(String(filePath ?? "")));
      return process.platform === "win32"
        ? parentPath.toLowerCase()
        : parentPath;
    }),
  );
  if (
    !Array.isArray(entries) ||
    entries.length !== 2 ||
    entries.some(
      (entry) =>
        typeof entry?.filePath !== "string" ||
        !path.isAbsolute(entry.filePath) ||
        (!Buffer.isBuffer(entry.content) &&
          typeof entry.content !== "string") ||
        entry.content.length === 0,
    ) ||
    new Set(entryPaths).size !== entries.length ||
    normalizedParentPaths.size !== 1 ||
    !fileSystem ||
    ["open", "write", "sync", "close", "remove"].some(
      (operation) => typeof fileSystem[operation] !== "function",
    )
  ) {
    signingError(
      "AUTHORITY_EVIDENCE_OUTPUT_INVALID",
      "Authority evidence must be two distinct files in one protected directory.",
    );
  }
  const createdPaths = [];
  let activeDescriptor = null;
  try {
    for (const entry of entries) {
      activeDescriptor = fileSystem.open(entry.filePath, "wx", 0o600);
      createdPaths.push(entry.filePath);
      fileSystem.write(activeDescriptor, entry.content);
      fileSystem.sync(activeDescriptor);
      fileSystem.close(activeDescriptor);
      activeDescriptor = null;
    }
  } catch {
    if (activeDescriptor !== null) {
      try {
        fileSystem.close(activeDescriptor);
      } catch {
        // Cleanup below remains fail-closed even if closing the failed handle
        // cannot be confirmed.
      }
      activeDescriptor = null;
    }
    for (const createdPath of createdPaths.reverse()) {
      try {
        fileSystem.remove(createdPath);
      } catch {
        // The protected directory is operator-controlled. A failed exact-path
        // cleanup remains fail-closed and is reported without exposing paths.
      }
    }
    signingError(
      "AUTHORITY_EVIDENCE_OUTPUT_FAILED",
      "Authority evidence could not be written as one complete set.",
    );
  }
}

function parseModeArguments(argv) {
  if (argv.length === 1 && argv[0] === "--help") {
    return { mode: "help" };
  }
  const mode = argv[0];
  const allowedByMode = {
    prepare: new Set([
      "--confirm",
      "--package-file",
      "--payload-file",
      "--request-file",
    ]),
    finalize: new Set([
      "--confirm",
      "--envelope-file",
      "--package-file",
      "--receipt-file",
      "--request-file",
      "--signature-file",
    ]),
  };
  if (!Object.hasOwn(allowedByMode, mode)) {
    signingError(
      "AUTHORITY_OFFLINE_SIGNING_ARGUMENT_INVALID",
      "The offline signing mode is invalid.",
    );
  }
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (
      !allowedByMode[mode].has(key) ||
      typeof value !== "string" ||
      value.length === 0 ||
      Object.hasOwn(options, key)
    ) {
      signingError(
        "AUTHORITY_OFFLINE_SIGNING_ARGUMENT_INVALID",
        "Offline signing arguments are invalid.",
      );
    }
    options[key] = value;
  }
  if (
    (mode === "prepare" &&
      (argv.length !== 9 || options["--confirm"] !== PREPARE_CONFIRMATION)) ||
    (mode === "finalize" &&
      (argv.length !== 13 || options["--confirm"] !== FINALIZE_CONFIRMATION))
  ) {
    signingError(
      "AUTHORITY_OFFLINE_SIGNING_CONFIRMATION_REQUIRED",
      "The exact offline signing confirmation is required.",
    );
  }
  return { mode, options };
}

function help() {
  return `Detached StaffTask production-like authority ceremony

Prepare:
  node staff-task-integrity-snapshot-authority-offline-sign.cli.mjs prepare \\
    --request-file <protected canonical acquisition JSON> \\
    --package-file <new protected signing package> \\
    --payload-file <new raw payload for external signer> \\
    --confirm ${PREPARE_CONFIRMATION}

The raw payload is signed outside LeetPlus by the approved offline Ed25519
signer. LeetPlus never accepts a private key or signing secret.

Finalize:
  node staff-task-integrity-snapshot-authority-offline-sign.cli.mjs finalize \\
    --request-file <same protected canonical acquisition JSON> \\
    --package-file <protected signing package> \\
    --signature-file <raw 64-byte detached Ed25519 signature> \\
    --envelope-file <new protected base64url envelope> \\
    --receipt-file <new protected canonical receipt> \\
    --confirm ${FINALIZE_CONFIRMATION}

Each output pair must share one protected directory outside the repository.
Existing files are never overwritten. The readiness file is written last:
payload for prepare, envelope for finalize. Normal execution requires one
exact clean release SHA and byte-matched ceremony runtime.
`;
}

async function main() {
  const parsed = parseModeArguments(process.argv.slice(2));
  if (parsed.mode === "help") {
    process.stdout.write(help());
    return;
  }
  if (parsed.mode === "prepare") {
    const requestPath = externalInputPath(
      parsed.options["--request-file"],
      "The acquisition request",
    );
    const request = parseCanonicalAcquisitionRequest(
      readBoundedFile(requestPath),
    );
    assertExactCleanReleaseSha(request.releaseSha);
    const prepared = prepareAuthoritySigningPackage({
      acquisitionRequest: request,
    });
    assertExactCleanReleaseSha(request.releaseSha);
    writeExclusiveSet([
      {
        filePath: externalOutputPath(parsed.options["--package-file"]),
        content: canonicalStringify(prepared.signingPackage),
      },
      {
        filePath: externalOutputPath(parsed.options["--payload-file"]),
        content: prepared.signingPayload,
      },
    ]);
    process.stdout.write('{"status":"PREPARED"}\n');
    return;
  }
  const request = parseCanonicalAcquisitionRequest(
    readBoundedFile(
      externalInputPath(
        parsed.options["--request-file"],
        "The acquisition request",
      ),
    ),
  );
  const signingPackage = parseCanonicalPackage(
    readBoundedFile(
      externalInputPath(
        parsed.options["--package-file"],
        "The signing package",
      ),
    ),
  );
  assertExactCleanReleaseSha(request.releaseSha);
  const finalized = finalizeAuthoritySigningPackage({
    acquisitionRequest: request,
    signingPackage,
    signature: readBoundedFile(
      externalInputPath(
        parsed.options["--signature-file"],
        "The detached signature",
      ),
      64,
    ),
  });
  assertExactCleanReleaseSha(request.releaseSha);
  writeExclusiveSet([
    {
      filePath: externalOutputPath(parsed.options["--receipt-file"]),
      content: canonicalStringify(finalized.receipt),
    },
    {
      filePath: externalOutputPath(parsed.options["--envelope-file"]),
      content: finalized.authorityEnvelope,
    },
  ]);
  process.stdout.write('{"status":"FINALIZED"}\n');
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${canonicalStringify({
        status: "REJECTED",
        code: String(error?.code ?? "AUTHORITY_OFFLINE_SIGNING_FAILED"),
      })}\n`,
    );
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
