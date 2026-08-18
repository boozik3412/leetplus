import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const databaseRoot = path.resolve(scriptsDirectory, "..");
const repositoryRoot = path.resolve(databaseRoot, "../..");
const migrationsRoot = path.join(databaseRoot, "prisma", "migrations");
const migrationName = "20260818020000_identity_mail_delivery_current_head_v1";
const predecessorName = "20260818010000_founder_owner_invite_reissue_v1";
const preterminalManifestDigest =
  "f269f0878c9940b7ee2619e778e032361acc844364ab876bbe7fcc01e15a9fcd";
const workerAssertSourceDigest =
  "47690501257272fd455475a00bea0e21b13f27187a669adef2115de349633315";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedBytes(value) {
  return Buffer.from(value.toString("utf8").replace(/\r\n?/gu, "\n"), "utf8");
}

async function canonicalManifest() {
  const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const rows = [];
  for (const name of entries) {
    const migration = normalizedBytes(
      await readFile(path.join(migrationsRoot, name, "migration.sql")),
    );
    rows.push(`${name} ${sha256(migration)}`);
  }
  return { entries, rows };
}

test("CURRENT185 is one forward-only readiness re-pin over exact CURRENT184", async () => {
  const { entries, rows } = await canonicalManifest();
  assert.equal(entries.length, 185);
  assert.equal(entries.at(-2), predecessorName);
  assert.equal(entries.at(-1), migrationName);
  assert.equal(
    sha256(`${rows.slice(0, -1).join("\n")}\n`),
    preterminalManifestDigest,
  );

  const sql = normalizedBytes(
    await readFile(path.join(migrationsRoot, migrationName, "migration.sql")),
  ).toString("utf8");
  assert.match(sql, /completed_migration_count IS DISTINCT FROM 184/u);
  assert.match(sql, new RegExp(predecessorName, "u"));
  assert.match(sql, new RegExp(preterminalManifestDigest, "u"));
  assert.match(sql, /migration_count IS DISTINCT FROM 185/u);
  assert.match(sql, new RegExp(migrationName, "u"));
  assert.match(sql, new RegExp(workerAssertSourceDigest, "u"));
  assert.equal(
    sql.match(
      /CREATE OR REPLACE FUNCTION public\."identity_mail_delivery_worker_assert_v1"/gu,
    )?.length,
    1,
  );
  assert.doesNotMatch(
    sql,
    /CREATE OR REPLACE FUNCTION public\."identity_initial_owner_mail_(?:claim|provider_mark|complete|reap)_v1"/u,
  );
  assert.match(sql, /FROM public\."IdentityMailDeliveryTenantEnrollment"/u);
  assert.match(sql, /privilege\.is_grantable/u);
  assert.match(sql, /FROM PUBLIC;/u);
});

test("the active worker repository consumes the same exact CURRENT185 receipt", async () => {
  const repository = await readFile(
    path.join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "identity-mail-worker",
      "identity-mail-worker.repository.ts",
    ),
    "utf8",
  );
  assert.match(repository, new RegExp(migrationName, "u"));
  assert.match(repository, /CURRENT_MIGRATION_COUNT = 185 as const/u);
  assert.match(repository, new RegExp(preterminalManifestDigest, "u"));
  assert.doesNotMatch(
    repository,
    /const CURRENT_MIGRATION =\s*'20260731120000_identity_mail_delivery_release_head'/u,
  );
});
