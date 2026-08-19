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
const migrationName = "20260819010000_staff_attachment_parent_delete_guard";
const predecessorName = "20260818020000_identity_mail_delivery_current_head_v1";
const preterminalManifestDigest =
  "589dd0a39f2372041a284392c72ad6ed59027877e909e1a5d377b9017c662fda";
const productionHistoryPreterminalManifestDigest =
  "094f3ad34ef8846f6088f51d5fb9491ff89af4509b60063453c22af07466d99b";
const workerAssertSourceDigest =
  "645feb480c46c42d7d8ca2dae07ec1c82f88264ac5d0e30d26593a8e566f3f66";
const workerAssertDefinitionDigest =
  "4231a5a96d238dfa838551e722b56edf8a3787a2929f865508e94b747743cf80";

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

test("CURRENT186 is one forward-only guard and readiness re-pin over exact CURRENT185", async () => {
  const { entries, rows } = await canonicalManifest();
  assert.equal(entries.length, 186);
  assert.equal(entries.at(-2), predecessorName);
  assert.equal(entries.at(-1), migrationName);
  assert.equal(
    sha256(`${rows.slice(0, -1).join("\n")}\n`),
    preterminalManifestDigest,
  );

  const sql = normalizedBytes(
    await readFile(path.join(migrationsRoot, migrationName, "migration.sql")),
  ).toString("utf8");
  assert.match(sql, /completed_migration_count IS DISTINCT FROM 185/u);
  assert.match(sql, new RegExp(predecessorName, "u"));
  assert.match(sql, new RegExp(preterminalManifestDigest, "u"));
  assert.match(
    sql,
    new RegExp(productionHistoryPreterminalManifestDigest, "u"),
  );
  assert.match(sql, /migration_count IS DISTINCT FROM 186/u);
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
  assert.match(sql, /CREATE CONSTRAINT TRIGGER "StaffAttachmentBinding_/u);
  assert.match(sql, /SET search_path = public, pg_catalog/u);
  assert.match(sql, /privilege\.is_grantable/u);
  assert.match(sql, /FROM PUBLIC;/u);
});

test("the active worker repository consumes the same exact CURRENT186 receipt", async () => {
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
  assert.match(repository, /CURRENT_MIGRATION_COUNT = 186 as const/u);
  assert.match(repository, new RegExp(preterminalManifestDigest, "u"));
  assert.match(
    repository,
    new RegExp(productionHistoryPreterminalManifestDigest, "u"),
  );
  assert.doesNotMatch(
    repository,
    /const CURRENT_MIGRATION =\s*'20260731120000_identity_mail_delivery_release_head'/u,
  );
});

test("the legacy inventory pins the CURRENT185 worker function definition", async () => {
  const inventory = await readFile(
    path.join(
      databaseRoot,
      "scripts",
      "identity-legacy-backfill-inventory.mjs",
    ),
    "utf8",
  );
  assert.match(
    inventory,
    new RegExp(
      `name: "identity_mail_delivery_worker_assert_v1",[\\s\\S]*?definitionSha256:\\s*"${workerAssertDefinitionDigest}"`,
      "u",
    ),
  );
});
