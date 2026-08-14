import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CLI_CONFIRMATION,
  prepareLangameRuntimeTrustBootstrapLifecycleCurrent200Cli,
} from "./langame-runtime-trust-bootstrap-lifecycle-current200.cli.mjs";

const NOW = new Date("2026-08-14T12:00:00.000Z");
const PEM = generateKeyPairSync("ed25519").publicKey.export({
  format: "pem",
  type: "spki",
});
const REASON = Buffer.from("approved", "utf8")
  .toString("hex")
  .padEnd(64, "0")
  .slice(0, 64);

function args(operation = "enroll") {
  const common = [
    "--operation",
    operation,
    "--operation-id",
    "11111111-1111-4111-8111-111111111111",
    "--key-id",
    "langame-bootstrap-production-1",
    "--approved-at",
    NOW.toISOString(),
    "--effective-at",
    operation === "revoke"
      ? "2026-08-14T12:06:00.000Z"
      : "2026-08-14T12:05:00.000Z",
    "--reason-digest",
    REASON,
    "--confirm",
    LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CLI_CONFIRMATION,
  ];
  return operation === "revoke"
    ? common
    : [
        ...common,
        "--public-key",
        "outside-repository-public-key.pem",
        "--valid-until",
        "2027-08-14T12:05:00.000Z",
      ];
}

const options = Object.freeze({
  clock: () => NOW,
  readPublicKey: async () => PEM,
  registry: Object.freeze({}),
});

const code = (expected) => (error) =>
  error?.code === expected && error.safeContractError;

test("CURRENT200 CLI prepares a public candidate without writing", async () => {
  const result =
    await prepareLangameRuntimeTrustBootstrapLifecycleCurrent200Cli(
      args(),
      options,
    );
  assert.equal(result.operation, "ENROLL");
  assert.equal(result.canApply, false);
  assert.equal(result.productionRootEnrolled, false);
  assert.match(result.candidateCanonicalJson, /BEGIN PUBLIC KEY/u);
});

test("CURRENT200 CLI descriptor-reads one exact public-key file", async () => {
  const root = await mkdtemp(join(tmpdir(), "lp-current200-public-"));
  const publicKeyPath = join(root, "bootstrap-public.pem");
  try {
    await writeFile(publicKeyPath, PEM, { encoding: "utf8", flag: "wx" });
    const value = args().map((entry) =>
      entry === "outside-repository-public-key.pem" ? publicKeyPath : entry,
    );
    const result =
      await prepareLangameRuntimeTrustBootstrapLifecycleCurrent200Cli(value, {
        clock: () => NOW,
        registry: Object.freeze({}),
      });
    assert.equal(result.operation, "ENROLL");
    assert.match(result.candidateCanonicalJson, /BEGIN PUBLIC KEY/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CURRENT200 CLI rejects duplicate, unknown and unconfirmed arguments", async () => {
  for (const value of [
    [...args(), "--key-id", "duplicate"],
    [...args(), "--unknown", "value"],
    args().map((entry) =>
      entry ===
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CLI_CONFIRMATION
        ? "wrong-confirmation"
        : entry,
    ),
  ]) {
    await assert.rejects(
      prepareLangameRuntimeTrustBootstrapLifecycleCurrent200Cli(value, options),
      code("CURRENT200_BOOTSTRAP_CLI_ARGUMENTS_INVALID"),
    );
  }
});

test("CURRENT200 CLI revoke never reads public-key material", async () => {
  let reads = 0;
  const active =
    await prepareLangameRuntimeTrustBootstrapLifecycleCurrent200Cli(
      args(),
      options,
    );
  const revoked =
    await prepareLangameRuntimeTrustBootstrapLifecycleCurrent200Cli(
      args("revoke"),
      {
        clock: () => NOW,
        readPublicKey: async () => {
          reads += 1;
          return PEM;
        },
        registry: active.candidateRegistry,
      },
    );
  assert.equal(reads, 0);
  assert.equal(revoked.operation, "REVOKE");
});

test("CURRENT200 CLI source has no private key, signer or registry write", async () => {
  const source = await readFile(
    fileURLToPath(
      new URL(
        "./langame-runtime-trust-bootstrap-lifecycle-current200.cli.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  for (const forbidden of [
    /createPrivateKey/u,
    /generateKeyPair/u,
    /writeFile/u,
    /rename\(/u,
    /unlink\(/u,
    /process\.env/u,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});
