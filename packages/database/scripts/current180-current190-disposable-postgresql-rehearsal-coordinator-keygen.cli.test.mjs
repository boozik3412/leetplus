import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, rm, rmdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { generateCurrent180Current190PostgresqlRehearsalCoordinatorKeyPair } from "./current180-current190-disposable-postgresql-rehearsal-coordinator-keygen.cli.mjs";
import { loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority } from "./current180-current190-disposable-postgresql-rehearsal-coordinator.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const WORKSPACE_PARENT = dirname(REPOSITORY_ROOT);
const CONFIRMATION =
  "generate-current180-current190-disposable-rehearsal-coordinator";
const CLI_PATH = join(
  SCRIPT_DIRECTORY,
  "current180-current190-disposable-postgresql-rehearsal-coordinator-keygen.cli.mjs",
);

function freshOutput(label) {
  return join(
    WORKSPACE_PARENT,
    `lp-c180190-keygen-${label}-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
  );
}

async function cleanup(outputDirectory) {
  await rm(join(outputDirectory, "coordinator-private.pk8"), {
    force: true,
  });
  await rm(join(outputDirectory, "coordinator-public.spki"), { force: true });
  await rmdir(outputDirectory).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}

test("keygen creates a fresh loadable pinned pair outside repository and temp", async () => {
  const outputDirectory = freshOutput("success");
  try {
    const receipt =
      await generateCurrent180Current190PostgresqlRehearsalCoordinatorKeyPair({
        confirmation: CONFIRMATION,
        outputDirectory,
      });
    assert.equal(receipt.outputDirectory, outputDirectory);
    assert.match(receipt.expectedPublicKeySha256, /^[0-9a-f]{64}$/u);
    assert.ok((await stat(receipt.privateKeyPath)).isFile());
    assert.ok((await stat(receipt.publicKeyPath)).isFile());
    assert.ok((await readFile(receipt.privateKeyPath)).length > 0);
    const authority =
      await loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority({
        expectedPublicKeySha256: receipt.expectedPublicKeySha256,
        privateKeyPath: receipt.privateKeyPath,
        publicKeyPath: receipt.publicKeyPath,
      });
    assert.equal(
      authority.publicKeyFingerprintSha256,
      receipt.expectedPublicKeySha256,
    );
    await assert.rejects(
      generateCurrent180Current190PostgresqlRehearsalCoordinatorKeyPair({
        confirmation: CONFIRMATION,
        outputDirectory,
      }),
      { code: "COORDINATOR_KEYGEN_OUTPUT_EXISTS" },
    );
  } finally {
    await cleanup(outputDirectory);
  }
});

test("keygen rejects repository, system-temp, malformed, and proxy inputs before creation", async () => {
  const repositoryOutput = join(REPOSITORY_ROOT, "forbidden-keygen-output");
  const tempOutput = join(
    resolve(tmpdir()),
    `forbidden-keygen-${process.pid}-${Date.now()}`,
  );
  for (const outputDirectory of [repositoryOutput, tempOutput]) {
    await assert.rejects(
      generateCurrent180Current190PostgresqlRehearsalCoordinatorKeyPair({
        confirmation: CONFIRMATION,
        outputDirectory,
      }),
      { code: "COORDINATOR_KEYGEN_PATH_INVALID" },
    );
  }
  await assert.rejects(
    generateCurrent180Current190PostgresqlRehearsalCoordinatorKeyPair(
      new Proxy(
        { confirmation: CONFIRMATION, outputDirectory: freshOutput("proxy") },
        { get: () => assert.fail("proxy getter must not run") },
      ),
    ),
    { code: "COORDINATOR_KEYGEN_INPUT_INVALID" },
  );
  await assert.rejects(
    generateCurrent180Current190PostgresqlRehearsalCoordinatorKeyPair({
      confirmation: "wrong",
      outputDirectory: freshOutput("wrong-confirm"),
    }),
    { code: "COORDINATOR_KEYGEN_INPUT_INVALID" },
  );
});

test("CLI emits only a bounded public receipt and refuses incomplete arguments", async () => {
  const outputDirectory = freshOutput("cli");
  try {
    const child = spawn(
      process.execPath,
      [CLI_PATH, "--output-dir", outputDirectory, "--confirm", CONFIRMATION],
      { env: {}, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    const [code] = await once(child, "close");
    assert.equal(code, 0, stderr);
    const receipt = JSON.parse(stdout);
    assert.deepEqual(Object.keys(receipt).sort(), [
      "contract",
      "expectedPublicKeySha256",
      "keygenReceiptDigest",
      "outputDirectory",
      "privateKeyPath",
      "publicKeyPath",
      "status",
    ]);
    assert.doesNotMatch(stdout, /BEGIN (?:PRIVATE|PUBLIC) KEY/u);

    const rejected = spawn(
      process.execPath,
      [CLI_PATH, "--output-dir", outputDirectory],
      {
        env: {},
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let rejectedError = "";
    rejected.stderr
      .setEncoding("utf8")
      .on("data", (chunk) => (rejectedError += chunk));
    const [rejectedCode] = await once(rejected, "close");
    assert.equal(rejectedCode, 1);
    assert.equal(
      JSON.parse(rejectedError).code,
      "COORDINATOR_KEYGEN_CLI_INPUT_INVALID",
    );
  } finally {
    await cleanup(outputDirectory);
  }
});
