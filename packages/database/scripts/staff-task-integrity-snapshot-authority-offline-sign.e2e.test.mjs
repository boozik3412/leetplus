import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import {
  ACQUISITION_DATA_MINIMIZATION_PROFILE,
  ACQUISITION_REQUEST_KIND,
  approvalReferenceForAcquisitionRequest,
} from "./staff-task-integrity-snapshot-acquisition-request.mjs";
import {
  authorityDatabaseMarker,
  computeAuthorityEnvelopeDigest,
  computePublicKeyFingerprint,
  parseAuthorityEnvelope,
  verifyAuthorityEnvelopeAgainstRoots,
} from "./staff-task-integrity-snapshot-authority.mjs";
import { AUTHORITY_ROOT_STATUS } from "./staff-task-integrity-snapshot-authority-root-registry.mjs";
import {
  CEREMONY_RELEASE_SOURCE_PATHS,
  FINALIZE_CONFIRMATION,
  PREPARE_CONFIRMATION,
  SIGNING_PACKAGE_KIND,
  SIGNING_RECEIPT_KIND,
} from "./staff-task-integrity-snapshot-authority-offline-sign.cli.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../../..");
const CLI_SOURCE_PATH =
  "packages/database/scripts/staff-task-integrity-snapshot-authority-offline-sign.cli.mjs";
const ROOT_REGISTRY_SOURCE_PATH =
  "packages/database/scripts/staff-task-integrity-snapshot-authority-roots.json";
const PRODUCTION_ROOT_REGISTRY_PATH = path.join(
  SOURCE_REPOSITORY_ROOT,
  ROOT_REGISTRY_SOURCE_PATH,
);
const TEST_KEY_ID = "staff-task-positive-e2e-2026-01";

function git(repositoryPath, args) {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

function createCleanReleaseRepository(repositoryPath, roots) {
  mkdirSync(repositoryPath, { recursive: true });
  for (const sourcePath of CEREMONY_RELEASE_SOURCE_PATHS) {
    const destinationPath = path.join(repositoryPath, sourcePath);
    mkdirSync(path.dirname(destinationPath), { recursive: true });
    if (sourcePath === ROOT_REGISTRY_SOURCE_PATH) {
      writeFileSync(destinationPath, `${canonicalStringify(roots)}\n`, {
        flag: "wx",
        mode: 0o644,
      });
    } else {
      copyFileSync(
        path.join(SOURCE_REPOSITORY_ROOT, sourcePath),
        destinationPath,
      );
    }
  }

  git(repositoryPath, ["init", "--quiet"]);
  git(repositoryPath, ["config", "user.name", "LeetPlus authority E2E"]);
  git(repositoryPath, ["config", "user.email", "authority-e2e@invalid.test"]);
  git(repositoryPath, ["config", "commit.gpgsign", "false"]);
  git(repositoryPath, ["config", "core.autocrlf", "false"]);
  git(repositoryPath, ["add", "--", "."]);
  git(repositoryPath, [
    "commit",
    "--quiet",
    "--no-gpg-sign",
    "-m",
    "test: exact detached authority release",
  ]);

  assert.equal(git(repositoryPath, ["status", "--porcelain=v1"]), "");
  return git(repositoryPath, ["rev-parse", "HEAD"]);
}

function acquisitionRequest(releaseSha, clock) {
  return {
    schemaVersion: 1,
    kind: ACQUISITION_REQUEST_KIND,
    purpose: "STAFF_TASK_INTEGRITY_RECONCILIATION",
    classification: "PRODUCTION_LIKE",
    profile: "STAFF_TASK_INTEGRITY_PRODUCTION_LIKE_V1",
    isolationProfile: "ISOLATED_ENCRYPTED_NO_EGRESS_V1",
    releaseSha,
    expectedState: "CURRENT_170",
    snapshotArtifactDigest: "b".repeat(64),
    databaseIdentity: {
      currentDatabase: "leetplus_snapshot_authority_e2e",
      clusterSystemIdentifier: "7667202810308916656",
      databaseOid: "16384",
    },
    timeline: {
      acquiredAt: new Date(clock.valueOf() - 4 * 60 * 1_000).toISOString(),
      restoredAt: new Date(clock.valueOf() - 3 * 60 * 1_000).toISOString(),
      expiresAt: new Date(clock.valueOf() + 60 * 60 * 1_000).toISOString(),
    },
    actors: {
      sourceOwnerReference: "role:source-owner-e2e",
      acquisitionOperatorReference: "role:acquisition-operator-e2e",
      securityApproverReference: "role:security-approver-e2e",
      destructionOwnerReference: "role:destruction-owner-e2e",
    },
    controls: {
      dataMinimizationProfile: ACQUISITION_DATA_MINIMIZATION_PROFILE,
      encryptedInTransit: true,
      encryptedAtRest: true,
      disposableDestination: true,
      noEgress: true,
      applicationWorkloadsDisabled: true,
      productionCredentialsRemoved: true,
      destructionScheduled: true,
    },
    references: {
      changeRecordReference: "change:authority-positive-e2e",
      destinationReference: "destination:disposable-git-fixture",
      incidentContactReference: "incident-role:authority-e2e",
      destructionProcedureReference: "procedure:authority-e2e-cleanup",
    },
  };
}

function runCeremonyCli(repositoryPath, args) {
  return spawnSync(
    process.execPath,
    [path.join(repositoryPath, CLI_SOURCE_PATH), ...args],
    {
      cwd: repositoryPath,
      encoding: "utf8",
      windowsHide: true,
    },
  );
}

function assertSuccessfulCli(result, expectedStatus) {
  assert.equal(
    result.error,
    undefined,
    result.error ? String(result.error.message) : undefined,
  );
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), { status: expectedStatus });
}

function assertProtectedPath(filePath, expectedType) {
  if (process.platform === "win32") {
    return;
  }
  const mode = statSync(filePath).mode & 0o777;
  assert.equal(
    mode & 0o077,
    0,
    `${expectedType} must not grant group or world access`,
  );
}

test("child-process detached authority ceremony completes against one exact clean release", () => {
  const productionRegistryBefore = readFileSync(
    PRODUCTION_ROOT_REGISTRY_PATH,
    "utf8",
  );
  assert.deepEqual(JSON.parse(productionRegistryBefore), {});

  const sandboxPath = mkdtempSync(
    path.join(tmpdir(), "leetplus-authority-positive-e2e-"),
  );
  const repositoryPath = path.join(sandboxPath, "release");
  const evidencePath = path.join(sandboxPath, "protected-evidence");
  mkdirSync(evidencePath, { recursive: true, mode: 0o700 });
  chmodSync(evidencePath, 0o700);

  try {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
    const clock = new Date();
    const root = {
      keyId: TEST_KEY_ID,
      algorithm: "Ed25519",
      classification: "PRODUCTION_LIKE",
      profile: "STAFF_TASK_INTEGRITY_PRODUCTION_LIKE_V1",
      purpose: "STAFF_TASK_INTEGRITY_RECONCILIATION",
      publicKeyPem,
      publicKeyFingerprint: computePublicKeyFingerprint(publicKeyPem),
      notBefore: new Date(clock.valueOf() - 60 * 60 * 1_000).toISOString(),
      notAfter: new Date(clock.valueOf() + 24 * 60 * 60 * 1_000).toISOString(),
      status: AUTHORITY_ROOT_STATUS.ACTIVE,
      supersedesKeyId: null,
      retiredAt: null,
      revokedAt: null,
    };
    const roots = { [TEST_KEY_ID]: root };
    const releaseSha = createCleanReleaseRepository(repositoryPath, roots);
    assert.match(releaseSha, /^[0-9a-f]{40}$/u);
    assert.equal(git(repositoryPath, ["status", "--porcelain=v1"]), "");
    assert.equal(
      path.relative(repositoryPath, evidencePath).startsWith(`..${path.sep}`),
      true,
    );
    assertProtectedPath(evidencePath, "evidence directory");

    const request = acquisitionRequest(releaseSha, clock);
    const requestPath = path.join(evidencePath, "acquisition-request.json");
    const packagePath = path.join(evidencePath, "signing-package.json");
    const payloadPath = path.join(evidencePath, "signing-payload.bin");
    const signaturePath = path.join(evidencePath, "detached-signature.bin");
    const receiptPath = path.join(evidencePath, "signing-receipt.json");
    const envelopePath = path.join(evidencePath, "authority-envelope.txt");
    writeFileSync(requestPath, canonicalStringify(request), {
      flag: "wx",
      mode: 0o600,
    });

    const prepared = runCeremonyCli(repositoryPath, [
      "prepare",
      "--request-file",
      requestPath,
      "--package-file",
      packagePath,
      "--payload-file",
      payloadPath,
      "--confirm",
      PREPARE_CONFIRMATION,
    ]);
    assertSuccessfulCli(prepared, "PREPARED");
    assert.equal(git(repositoryPath, ["status", "--porcelain=v1"]), "");
    assert.equal(existsSync(packagePath), true);
    assert.equal(existsSync(payloadPath), true);
    const signingPackageText = readFileSync(packagePath, "utf8");
    const signingPackage = JSON.parse(signingPackageText);
    assert.equal(canonicalStringify(signingPackage), signingPackageText);
    assert.equal(signingPackage.kind, SIGNING_PACKAGE_KIND);
    assert.equal(signingPackage.signingKeyId, TEST_KEY_ID);

    const signingPayload = readFileSync(payloadPath);
    const detachedSignature = sign(null, signingPayload, privateKey);
    assert.equal(detachedSignature.length, 64);
    assert.equal(
      verify(null, signingPayload, publicKey, detachedSignature),
      true,
    );
    writeFileSync(signaturePath, detachedSignature, {
      flag: "wx",
      mode: 0o600,
    });
    assert.equal(readFileSync(signaturePath).length, 64);

    const finalized = runCeremonyCli(repositoryPath, [
      "finalize",
      "--request-file",
      requestPath,
      "--package-file",
      packagePath,
      "--signature-file",
      signaturePath,
      "--envelope-file",
      envelopePath,
      "--receipt-file",
      receiptPath,
      "--confirm",
      FINALIZE_CONFIRMATION,
    ]);
    assertSuccessfulCli(finalized, "FINALIZED");
    assert.equal(git(repositoryPath, ["status", "--porcelain=v1"]), "");
    assert.equal(existsSync(receiptPath), true);
    assert.equal(existsSync(envelopePath), true);

    const receiptText = readFileSync(receiptPath, "utf8");
    const receipt = JSON.parse(receiptText);
    const encodedEnvelope = readFileSync(envelopePath, "utf8");
    const envelope = parseAuthorityEnvelope(encodedEnvelope);
    const verificationTime = new Date();
    const approvalReference = approvalReferenceForAcquisitionRequest(
      request,
      verificationTime,
    );
    const verifiedEnvelope = verifyAuthorityEnvelopeAgainstRoots(
      envelope,
      {
        releaseSha,
        expectedState: request.expectedState,
        snapshotArtifactDigest: request.snapshotArtifactDigest,
        approvalReference,
        acquiredAt: request.timeline.acquiredAt,
        restoredAt: request.timeline.restoredAt,
        expiresAt: request.timeline.expiresAt,
      },
      roots,
      verificationTime,
    );
    const envelopeDigest = computeAuthorityEnvelopeDigest(envelope);

    assert.equal(canonicalStringify(receipt), receiptText);
    assert.equal(receipt.kind, SIGNING_RECEIPT_KIND);
    assert.equal(receipt.releaseSha, releaseSha);
    assert.equal(receipt.expectedState, "CURRENT_170");
    assert.equal(receipt.signingKeyId, TEST_KEY_ID);
    assert.equal(receipt.authorityEnvelopeDigest, envelopeDigest);
    assert.equal(
      receipt.databaseMarker,
      authorityDatabaseMarker(envelopeDigest),
    );
    assert.equal(verifiedEnvelope.envelopeDigest, envelopeDigest);
    assert.equal(verifiedEnvelope.databaseMarker, receipt.databaseMarker);
    assert.deepEqual(
      Buffer.from(envelope.signature, "base64url"),
      detachedSignature,
    );
    assert.equal(Buffer.from(envelope.signature, "base64url").length, 64);

    for (const filePath of [
      requestPath,
      packagePath,
      payloadPath,
      signaturePath,
      receiptPath,
      envelopePath,
    ]) {
      assertProtectedPath(filePath, "evidence file");
    }
    assert.equal(git(repositoryPath, ["status", "--porcelain=v1"]), "");
  } finally {
    assert.equal(
      readFileSync(PRODUCTION_ROOT_REGISTRY_PATH, "utf8"),
      productionRegistryBefore,
    );
    rmSync(sandboxPath, { recursive: true, force: true });
    assert.equal(existsSync(sandboxPath), false);
  }
});
