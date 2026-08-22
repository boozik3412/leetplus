import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { assertDesignPartnerSmokeDatabaseTarget } from "./design-partner-provisioning-smoke-target.mjs";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(
  new URL("./design-partner-provision.cli.mjs", import.meta.url),
);
const smokePath = fileURLToPath(
  new URL("./design-partner-provisioning-smoke.mjs", import.meta.url),
);
const cliSourceUrl = new URL(
  "./design-partner-provision.cli.mjs",
  import.meta.url,
);
const provisioningSourceUrl = new URL(
  "./design-partner-provisioning.mjs",
  import.meta.url,
);
const smokeSourceUrl = new URL(
  "./design-partner-provisioning-smoke.mjs",
  import.meta.url,
);
const packageManifestUrl = new URL("../package.json", import.meta.url);
const DISABLED_CODE = "DESIGN_PARTNER_IDENTITY_WRITER_DISABLED";

async function executeDisabledCommand(command) {
  try {
    await execFileAsync(
      process.execPath,
      [cliPath, command, "--manifest", "missing-design-partner-manifest.json"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL:
            "postgresql://must-not-connect:must-not-connect@127.0.0.1:1/must_not_connect",
          DESIGN_PARTNER_CONFIRMATION: "must-not-be-used",
          WEB_URL: "https://must-not-be-used.invalid",
        },
        timeout: 5_000,
        windowsHide: true,
      },
    );
  } catch (error) {
    return {
      exitCode: error.code,
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? ""),
    };
  }
  assert.fail(`${command} unexpectedly remained enabled`);
}

for (const command of ["provision", "rotate-invite"]) {
  test(`${command} is rejected before manifest or database access`, async () => {
    const result = await executeDisabledCommand(command);

    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, "");
    const failure = JSON.parse(result.stderr);
    assert.deepEqual(Object.keys(failure).sort(), ["code", "message", "ok"]);
    assert.equal(failure.ok, false);
    assert.equal(failure.code, DISABLED_CODE);
    assert.match(failure.message, /sealed identity activation workflow/u);
    assert.doesNotMatch(
      result.stderr,
      /missing-design-partner-manifest|must-not-connect|must-not-be-used/iu,
    );
    assert.doesNotMatch(
      result.stderr,
      /owner@|invite=|https?:\/\/|token|password/iu,
    );
  });
}

test("the executable CLI cannot import or call legacy identity writers", async () => {
  const source = await readFile(cliSourceUrl, "utf8");

  assert.doesNotMatch(
    source,
    /\b(?:provisionDesignPartner|rotateDesignPartnerInvite)\b/u,
  );
  assert.match(source, new RegExp(DISABLED_CODE, "u"));
  assert.match(source, /args\.command === "provision"/u);
  assert.match(source, /args\.command === "rotate-invite"/u);
  assert.doesNotMatch(source, /^import .*@prisma\/client/mu);
  assert.ok(
    source.indexOf('await import("@prisma/client")') >
      source.indexOf('args.command === "provision"'),
  );
});

test("legacy writer exports are fail-closed without reading DB or token inputs", async () => {
  const source = await readFile(provisioningSourceUrl, "utf8");
  const inviteMutations = [
    ...source.matchAll(
      /\.userInvite\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/gu,
    ),
  ].map((match) => match[1]);

  assert.deepEqual(inviteMutations, ["updateMany"]);
  assert.doesNotMatch(source, /\brandomBytes\b/u);
  assert.doesNotMatch(source, /\bbuildInviteUrl\b/u);
  assert.doesNotMatch(source, /[?&]invite=/u);
  assert.doesNotMatch(source, /READY_TO_PROVISION|INVITE_ROTATION_REQUIRED/u);

  const provisioning = await import(provisioningSourceUrl);
  const accessedInputs = [];
  const forbiddenInput = new Proxy(
    {},
    {
      get(_target, property) {
        accessedInputs.push(String(property));
        throw new Error(
          `Unexpected legacy writer input access: ${String(property)}`,
        );
      },
    },
  );

  assert.deepEqual(Object.keys(provisioning).sort(), [
    "DesignPartnerProvisioningError",
    "assertDesignPartnerRuntimeSafetyOverlay",
    "computeDesignPartnerInviteRotationDigest",
    "computeDesignPartnerManifestDigest",
    "computeDesignPartnerProvisionedInviteDigest",
    "hashInviteToken",
    "normalizeDesignPartnerManifest",
    "previewDesignPartnerProvisioning",
    "provisionDesignPartner",
    "readDesignPartnerTopology",
    "rotateDesignPartnerInvite",
    "suspendDesignPartner",
  ]);

  for (const exportName of [
    "provisionDesignPartner",
    "rotateDesignPartnerInvite",
  ]) {
    await assert.rejects(
      provisioning[exportName](forbiddenInput, forbiddenInput, forbiddenInput),
      (error) =>
        error instanceof provisioning.DesignPartnerProvisioningError &&
        error.code === DISABLED_CODE,
    );
  }
  assert.deepEqual(accessedInputs, []);
});

test("threat model closes the supported package operator surface, not arbitrary repository execution", async () => {
  const packageManifest = JSON.parse(
    await readFile(packageManifestUrl, "utf8"),
  );
  const supportedOperatorScripts = Object.fromEntries(
    Object.entries(packageManifest.scripts).filter(([name]) =>
      name.startsWith("design-partner:"),
    ),
  );

  assert.deepEqual(supportedOperatorScripts, {
    "design-partner:provision": "node scripts/design-partner-provision.cli.mjs",
  });
});

test("the write-capable fixture accepts only the exact disposable CI target", () => {
  for (const target of [
    "postgresql://fixture:fixture@127.0.0.1:5432/leetplus_ci?schema=public",
    "postgres://fixture:fixture@localhost:5432/leetplus_ci?schema=public",
    "postgresql://fixture:fixture@[::1]:5432/leetplus_ci?schema=public",
  ]) {
    assert.doesNotThrow(() => assertDesignPartnerSmokeDatabaseTarget(target));
  }

  for (const target of [
    undefined,
    "not-a-url",
    "postgresql://owner:secret@db.example/leetplus_ci?schema=public",
    "postgresql://owner:secret@127.0.0.1/production?schema=public",
    "postgresql://owner:secret@127.0.0.1/leetplus_ci?schema=private",
    "postgresql://owner:secret@127.0.0.1/leetplus_ci?schema=public&sslmode=disable",
    "postgresql://owner:secret@127.0.0.1/leetplus_ci?schema=public&host=db.example",
    "https://owner:secret@127.0.0.1/leetplus_ci?schema=public",
  ]) {
    assert.throws(
      () => assertDesignPartnerSmokeDatabaseTarget(target),
      (error) => {
        assert.equal(
          error.message,
          "Design-partner smoke requires the exact disposable loopback database.",
        );
        assert.doesNotMatch(error.message, /owner|secret|db\.example/iu);
        return true;
      },
    );
  }
});

test("the smoke executable rejects a remote target before Prisma loads", async () => {
  const source = await readFile(smokeSourceUrl, "utf8");
  assert.doesNotMatch(source, /^import .*@prisma\/client/mu);
  assert.ok(
    source.indexOf("assertDesignPartnerSmokeDatabaseTarget(") <
      source.indexOf('await import("@prisma/client")'),
  );

  let result;
  try {
    await execFileAsync(process.execPath, [smokePath], {
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL:
          "postgresql://owner:secret@db.example/leetplus_ci?schema=public",
        DESIGN_PARTNER_PROVISIONING_SMOKE_CONFIRM:
          "run-design-partner-provisioning-smoke",
      },
      timeout: 5_000,
      windowsHide: true,
    });
    assert.fail("Remote smoke target unexpectedly passed");
  } catch (error) {
    result = {
      exitCode: error.code,
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? ""),
    };
  }

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /Design-partner smoke requires the exact disposable loopback database/u,
  );
  assert.doesNotMatch(
    result.stderr,
    /PrismaClient|owner|secret|db\.example|postgresql:\/\//iu,
  );
});
