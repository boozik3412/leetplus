import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CLI_CONFIRMATION,
  runLangameRuntimeTrustFounderPilotCurrent202Cli,
} from "./langame-runtime-trust-founder-pilot-current202.cli.mjs";
import {
  LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_PREPARED_STATUS,
  LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_RISK_ACCEPTANCE,
  LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_VERIFIED_STATUS,
  isVerifiedLangameRuntimeTrustFounderPilotCurrent202,
} from "./langame-runtime-trust-founder-pilot-current202.mjs";

const PREPARE_NOW = new Date("2026-08-14T04:00:00.000Z");
const VERIFY_NOW = new Date("2026-08-14T16:01:00.000Z");

function publicKeyPem(authority) {
  return authority.publicKey.export({ format: "pem", type: "spki" });
}

function args(mode, signaturePath = null) {
  const result = [
    "--mode",
    mode,
    "--operation",
    "enroll",
    "--operation-id",
    "11111111-1111-4111-8111-111111111111",
    "--key-id",
    "langame-bootstrap-global-platform-1",
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
    "--exception-id",
    "22222222-2222-4222-8222-222222222222",
    "--prepared-at",
    "2026-08-14T04:00:00.000Z",
    "--eligible-at",
    "2026-08-14T16:00:00.000Z",
    "--expires-at",
    "2026-08-15T16:00:00.000Z",
    "--founder-id",
    "founder-primary",
    "--founder-public-key",
    "founder.pem",
    "--release-owner-id",
    "founder-primary",
    "--rollback-owner-id",
    "founder-primary",
    "--key-custody-plan-digest",
    "b".repeat(64),
    "--restored-copy-plan-digest",
    "c".repeat(64),
    "--rollback-plan-digest",
    "d".repeat(64),
    "--risk-acceptance",
    LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_RISK_ACCEPTANCE,
  ];
  if (signaturePath) result.push("--founder-signature", signaturePath);
  result.push(
    "--confirm",
    LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CLI_CONFIRMATION,
  );
  return result;
}

function options(root, founder, now, signature = null) {
  return {
    clock: () => now,
    current200Options: {
      readPublicKey: async (filePath) => {
        assert.equal(filePath, "root.pem");
        return publicKeyPem(root);
      },
      registry: {},
    },
    readPublicKey: async (filePath) => {
      assert.equal(filePath, "founder.pem");
      return publicKeyPem(founder);
    },
    readSignature: async (filePath) => {
      assert.equal(filePath, "founder.sig");
      return signature;
    },
  };
}

test("CURRENT202 V2 CLI prepares, cools off, and verifies global bootstrap evidence", async () => {
  const root = generateKeyPairSync("ed25519");
  const founder = generateKeyPairSync("ed25519");
  const packet = await runLangameRuntimeTrustFounderPilotCurrent202Cli(
    args("prepare"),
    options(root, founder, PREPARE_NOW),
  );
  assert.equal(
    packet.status,
    LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_PREPARED_STATUS,
  );
  assert.equal(packet.encryptedRemovableMediaCount, 1);
  assert.equal(packet.platformScope, "GLOBAL");
  assert.equal(packet.customerKeyCeremonyRequired, false);
  assert.equal(packet.additionalTenantKeyCeremonyRequired, false);
  assert.equal(packet.tenantRolloutPolicyEmbedded, false);
  const signature = signPayload(
    null,
    Buffer.from(packet.founderPayloadCanonicalJson, "utf8"),
    founder.privateKey,
  ).toString("base64url");
  const receipt = await runLangameRuntimeTrustFounderPilotCurrent202Cli(
    args("verify", "founder.sig"),
    options(root, founder, VERIFY_NOW, signature),
  );
  assert.equal(
    receipt.status,
    LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_VERIFIED_STATUS,
  );
  assert.equal(
    isVerifiedLangameRuntimeTrustFounderPilotCurrent202(receipt),
    true,
  );
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.ownerRouteActivationAllowed, false);
});

test("CURRENT202 CLI descriptor-reads exact public and signature files", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "lp-current202-public-"));
  t.after(async () => rm(directory, { force: true, recursive: true }));
  const root = generateKeyPairSync("ed25519");
  const founder = generateKeyPairSync("ed25519");
  const files = {
    founder: path.join(directory, "founder.pem"),
    root: path.join(directory, "root.pem"),
    signature: path.join(directory, "founder.sig"),
  };
  await Promise.all([
    writeFile(files.root, publicKeyPem(root), "utf8"),
    writeFile(files.founder, publicKeyPem(founder), "utf8"),
  ]);
  const prepareArgs = args("prepare").map((value) => {
    if (value === "root.pem") return files.root;
    if (value === "founder.pem") return files.founder;
    return value;
  });
  const packet = await runLangameRuntimeTrustFounderPilotCurrent202Cli(
    prepareArgs,
    { clock: () => PREPARE_NOW, current200Options: { registry: {} } },
  );
  await writeFile(
    files.signature,
    signPayload(
      null,
      Buffer.from(packet.founderPayloadCanonicalJson, "utf8"),
      founder.privateKey,
    ).toString("base64url"),
    "utf8",
  );
  const verifyArgs = args("verify", files.signature).map((value) => {
    if (value === "root.pem") return files.root;
    if (value === "founder.pem") return files.founder;
    return value;
  });
  const receipt = await runLangameRuntimeTrustFounderPilotCurrent202Cli(
    verifyArgs,
    { clock: () => VERIFY_NOW, current200Options: { registry: {} } },
  );
  assert.equal(
    receipt.status,
    LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_VERIFIED_STATUS,
  );
});

test("CURRENT202 CLI rejects duplicate, widened, rotate, and unconfirmed arguments", async () => {
  const root = generateKeyPairSync("ed25519");
  const founder = generateKeyPairSync("ed25519");
  const base = options(root, founder, PREPARE_NOW);
  for (const candidate of [
    [...args("prepare"), "--extra", "x"],
    [...args("prepare"), "--mode", "prepare"],
    args("prepare").map((value) => (value === "enroll" ? "rotate" : value)),
    args("prepare").map((value) =>
      value === LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CLI_CONFIRMATION
        ? "yes"
        : value,
    ),
  ]) {
    await assert.rejects(
      runLangameRuntimeTrustFounderPilotCurrent202Cli(candidate, base),
      (error) =>
        error?.code === "CURRENT202_FOUNDER_CLI_ARGUMENTS_INVALID" &&
        error.safeContractError,
    );
  }
});

test("CURRENT202 CLI source has no private-key, registry-write, env, or database authority", async () => {
  const source = await readFile(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "langame-runtime-trust-founder-pilot-current202.cli.mjs",
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
