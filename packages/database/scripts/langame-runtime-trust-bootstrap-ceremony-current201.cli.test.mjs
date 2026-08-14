import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CLI_CONFIRMATION,
  runLangameRuntimeTrustBootstrapCeremonyCurrent201Cli,
} from "./langame-runtime-trust-bootstrap-ceremony-current201.cli.mjs";
import {
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_PREPARED_STATUS,
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_VERIFIED_STATUS,
  isVerifiedLangameRuntimeTrustBootstrapCeremonyCurrent201,
} from "./langame-runtime-trust-bootstrap-ceremony-current201.mjs";

const NOW = new Date("2026-08-14T04:00:00.000Z");

function publicKeyPem(authority) {
  return authority.publicKey.export({ format: "pem", type: "spki" });
}

function argumentsFor(mode, signaturePaths = null) {
  const values = [
    "--mode",
    mode,
    "--operation",
    "enroll",
    "--operation-id",
    "11111111-1111-4111-8111-111111111111",
    "--key-id",
    "langame-bootstrap-production-1",
    "--approved-at",
    "2026-08-14T03:59:00.000Z",
    "--effective-at",
    "2026-08-14T04:05:00.000Z",
    "--reason-digest",
    "a".repeat(64),
    "--public-key",
    "root.pem",
    "--valid-until",
    "2027-08-14T04:05:00.000Z",
    "--ceremony-id",
    "22222222-2222-4222-8222-222222222222",
    "--ceremony-created-at",
    "2026-08-14T03:59:00.000Z",
    "--ceremony-expires-at",
    "2026-08-14T05:00:00.000Z",
    "--operator-id",
    "release-operator-1",
    "--operator-public-key",
    "operator.pem",
    "--reviewer-id",
    "security-reviewer-1",
    "--reviewer-public-key",
    "reviewer.pem",
  ];
  if (signaturePaths) {
    values.push(
      "--operator-signature",
      signaturePaths.operator,
      "--reviewer-signature",
      signaturePaths.reviewer,
    );
  }
  values.push(
    "--confirm",
    LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CLI_CONFIRMATION,
  );
  return values;
}

function injectedOptions(root, operator, reviewer, signatures = {}) {
  const publicKeys = new Map([
    ["operator.pem", publicKeyPem(operator)],
    ["reviewer.pem", publicKeyPem(reviewer)],
  ]);
  return {
    clock: () => NOW,
    current200Options: {
      readPublicKey: async (filePath) => {
        assert.equal(filePath, "root.pem");
        return publicKeyPem(root);
      },
    },
    readPublicKey: async (filePath) => publicKeys.get(filePath),
    readSignature: async (filePath) => signatures[filePath],
  };
}

test("CURRENT201 CLI prepares and verifies one exact two-person packet", async () => {
  const root = generateKeyPairSync("ed25519");
  const operator = generateKeyPairSync("ed25519");
  const reviewer = generateKeyPairSync("ed25519");
  const options = injectedOptions(root, operator, reviewer);
  const packet = await runLangameRuntimeTrustBootstrapCeremonyCurrent201Cli(
    argumentsFor("prepare"),
    options,
  );
  assert.equal(
    packet.status,
    LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_PREPARED_STATUS,
  );
  const signatures = {
    "operator.sig": signPayload(
      null,
      Buffer.from(packet.operatorPayloadCanonicalJson, "utf8"),
      operator.privateKey,
    ).toString("base64url"),
    "reviewer.sig": signPayload(
      null,
      Buffer.from(packet.reviewerPayloadCanonicalJson, "utf8"),
      reviewer.privateKey,
    ).toString("base64url"),
  };
  const receipt = await runLangameRuntimeTrustBootstrapCeremonyCurrent201Cli(
    argumentsFor("verify", {
      operator: "operator.sig",
      reviewer: "reviewer.sig",
    }),
    injectedOptions(root, operator, reviewer, signatures),
  );
  assert.equal(
    receipt.status,
    LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_VERIFIED_STATUS,
  );
  assert.equal(
    isVerifiedLangameRuntimeTrustBootstrapCeremonyCurrent201(receipt),
    true,
  );
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.productionRootEnrolled, false);
  assert.equal(receipt.sharedBetaAccess, false);
});

test("CURRENT201 CLI descriptor-reads exact public-key and signature files", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "lp-current201-public-"));
  t.after(async () => rm(root, { force: true, recursive: true }));
  const bootstrap = generateKeyPairSync("ed25519");
  const operator = generateKeyPairSync("ed25519");
  const reviewer = generateKeyPairSync("ed25519");
  const files = {
    bootstrap: path.join(root, "root.pem"),
    operator: path.join(root, "operator.pem"),
    operatorSignature: path.join(root, "operator.sig"),
    reviewer: path.join(root, "reviewer.pem"),
    reviewerSignature: path.join(root, "reviewer.sig"),
  };
  await Promise.all([
    writeFile(files.bootstrap, publicKeyPem(bootstrap), "utf8"),
    writeFile(files.operator, publicKeyPem(operator), "utf8"),
    writeFile(files.reviewer, publicKeyPem(reviewer), "utf8"),
  ]);
  const args = argumentsFor("prepare").map((value) => {
    if (value === "root.pem") return files.bootstrap;
    if (value === "operator.pem") return files.operator;
    if (value === "reviewer.pem") return files.reviewer;
    return value;
  });
  const packet = await runLangameRuntimeTrustBootstrapCeremonyCurrent201Cli(
    args,
    { clock: () => NOW },
  );
  assert.equal(
    packet.status,
    LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_PREPARED_STATUS,
  );
  await Promise.all([
    writeFile(
      files.operatorSignature,
      signPayload(
        null,
        Buffer.from(packet.operatorPayloadCanonicalJson, "utf8"),
        operator.privateKey,
      ).toString("base64url"),
      "utf8",
    ),
    writeFile(
      files.reviewerSignature,
      signPayload(
        null,
        Buffer.from(packet.reviewerPayloadCanonicalJson, "utf8"),
        reviewer.privateKey,
      ).toString("base64url"),
      "utf8",
    ),
  ]);
  const verifyArgs = argumentsFor("verify", {
    operator: files.operatorSignature,
    reviewer: files.reviewerSignature,
  }).map((value) => {
    if (value === "root.pem") return files.bootstrap;
    if (value === "operator.pem") return files.operator;
    if (value === "reviewer.pem") return files.reviewer;
    return value;
  });
  const receipt = await runLangameRuntimeTrustBootstrapCeremonyCurrent201Cli(
    verifyArgs,
    { clock: () => NOW },
  );
  assert.equal(
    receipt.status,
    LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_VERIFIED_STATUS,
  );
});

test("CURRENT201 CLI rejects widened, duplicate and unconfirmed arguments", async () => {
  const root = generateKeyPairSync("ed25519");
  const operator = generateKeyPairSync("ed25519");
  const reviewer = generateKeyPairSync("ed25519");
  const options = injectedOptions(root, operator, reviewer);
  for (const args of [
    [...argumentsFor("prepare"), "--extra", "x"],
    [...argumentsFor("prepare"), "--mode", "prepare"],
    argumentsFor("prepare").map((value) =>
      value ===
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CLI_CONFIRMATION
        ? "yes"
        : value,
    ),
  ]) {
    await assert.rejects(
      runLangameRuntimeTrustBootstrapCeremonyCurrent201Cli(args, options),
      (error) =>
        error?.code === "CURRENT201_CEREMONY_CLI_ARGUMENTS_INVALID" &&
        error.safeContractError,
    );
  }
});

test("CURRENT201 CLI source has no private-key, registry-write or process authority", async () => {
  const source = await readFile(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "langame-runtime-trust-bootstrap-ceremony-current201.cli.mjs",
    ),
    "utf8",
  );
  for (const forbidden of [
    "createPrivateKey",
    "generateKeyPair",
    "privateKey",
    "writeFile",
    "appendFile",
    "rename(",
    "unlink(",
    "process.env",
    "PrismaClient",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
