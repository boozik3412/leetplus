import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  executeIdentityMailDutyRoleDeploymentCurrent186Cli,
  parseIdentityMailDutyRoleDeploymentCurrent186CliArguments,
} from "./identity-mail-duty-role-deployment-current186.cli.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import { identityMailDutyRoleCatalogCurrent186Fixture } from "./identity-mail-duty-role-current186-fixture.mjs";

function config() {
  return {
    actualContextDigest: "1".repeat(64),
    applicationArtifactSha256: "2".repeat(64),
    applicationContract: "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2",
    applicationReleaseSha: "3".repeat(40),
    coordinatorRoleOid: 94,
    databaseIdentityDigest: "a".repeat(64),
    databaseName: "leetplus_beta",
    databaseOid: 91,
    deploymentMarkerDigest: "4".repeat(64),
    deploymentMarkerId: "20000000-0000-4000-8000-000000000001",
    deploymentRoleName: "leetplus_owner",
    deploymentRoleOid: 92,
    definitionManifestDigest:
      identityMailDutyRoleCatalogCurrent186Fixture()
        .definitionManifestDigest,
    expectedEpoch: 0,
    migrationCount: 186,
    migrationHead: "20260803010000_identity_mail_duty_role_runtime_boundary_v2",
    migrationManifestDigest: "6".repeat(64),
    operationId: "10000000-0000-4000-8000-000000000001",
    schemaOwnerRoleOid: 93,
    workerRoleOid: 95,
  };
}

test("CURRENT186 CLI accepts only exact mode-specific argument shapes", () => {
  assert.deepEqual(
    parseIdentityMailDutyRoleDeploymentCurrent186CliArguments([
      "--apply",
      "--config-file",
      "config.json",
    ]),
    {
      configFile: "config.json",
      mode: "apply",
      receiptFile: null,
    },
  );
  assert.deepEqual(
    parseIdentityMailDutyRoleDeploymentCurrent186CliArguments([
      "--emergency",
      "--config-file",
      "config.json",
    ]),
    {
      configFile: "config.json",
      mode: "emergency",
      receiptFile: null,
    },
  );
  assert.deepEqual(
    parseIdentityMailDutyRoleDeploymentCurrent186CliArguments([
      "--rollback",
      "--config-file",
      "config.json",
      "--receipt-file",
      "apply-receipt.json",
    ]),
    {
      configFile: "config.json",
      mode: "rollback",
      receiptFile: "apply-receipt.json",
    },
  );
  for (const args of [
    ["--emergency", "--config-file", "config.json", "--receipt-file", "x"],
    ["--rollback", "--config-file", "config.json"],
    ["--check", "--config-file", "config.json", "--receipt-file", "x"],
    ["--unknown", "--config-file", "config.json"],
  ]) {
    assert.throws(
      () => parseIdentityMailDutyRoleDeploymentCurrent186CliArguments(args),
      /CLI request is invalid/u,
    );
  }
});

test("CURRENT186 CLI validates canonical config before loading Prisma", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "current186-cli-"));
  const file = path.join(directory, "config.json");
  await writeFile(file, `${JSON.stringify(config(), null, 2)}\n`, "utf8");
  let loads = 0;
  try {
    await assert.rejects(
      executeIdentityMailDutyRoleDeploymentCurrent186Cli(
        ["--check", "--config-file", file],
        {
          prismaLoader: async () => {
            loads += 1;
            return {};
          },
        },
      ),
      (error) =>
        error?.code ===
        "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CLI_CONFIG_INVALID",
    );
    assert.equal(loads, 0);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("CURRENT186 CLI emits only canonical safe JSON and disconnects", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "current186-cli-"));
  const file = path.join(directory, "config.json");
  await writeFile(file, canonicalStringify(config()), "utf8");
  let disconnected = false;
  let runnerInput;
  class PrismaClient {
    constructor(options) {
      assert.deepEqual(options, { log: [] });
    }

    async $disconnect() {
      disconnected = true;
    }
  }
  try {
    const execution = await executeIdentityMailDutyRoleDeploymentCurrent186Cli(
      ["--check", "--config-file", file],
      {
        prismaLoader: async () => ({ PrismaClient }),
        runner: async (value) => {
          runnerInput = value;
          return {
            authorization: false,
            candidateStatus: "NOT_DEPLOYABLE",
            canMutate: false,
            decision: "CHECKED",
          };
        },
      },
    );
    assert.equal(disconnected, true);
    assert.equal(runnerInput.mode, "check");
    assert.equal(Object.hasOwn(runnerInput, "emergency"), false);
    assert.equal(runnerInput.receipt, null);
    assert.deepEqual(JSON.parse(execution.output), {
      authorization: false,
      candidateStatus: "NOT_DEPLOYABLE",
      canMutate: false,
      decision: "CHECKED",
    });
    assert.equal(execution.output, `${execution.output.trim()}\n`);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("CURRENT186 CLI help performs no dependency load", async () => {
  let loads = 0;
  const result = await executeIdentityMailDutyRoleDeploymentCurrent186Cli(
    ["--help"],
    {
      prismaLoader: async () => {
        loads += 1;
        return {};
      },
    },
  );
  assert.equal(result.exitCode, 0);
  assert.equal(loads, 0);
  assert.match(result.output, /NOT_DEPLOYABLE/u);
  assert.match(result.output, /NOLOGIN/u);
});
