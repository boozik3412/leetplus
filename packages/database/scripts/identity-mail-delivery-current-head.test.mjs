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
const guardMigrationName =
  "20260819010000_staff_attachment_parent_delete_guard";
const telegramMigrationName =
  "20260820010000_guest_portal_telegram_update_ledger";
const previousCurrentMigrationName = "20260828190000_guest_support_bug_reports";
const currentMigrationName =
  "20260831120000_guest_support_bug_report_input_repair";
const predecessorName = "20260818020000_identity_mail_delivery_current_head_v1";
const preterminalManifestDigest =
  "589dd0a39f2372041a284392c72ad6ed59027877e909e1a5d377b9017c662fda";
const productionHistoryPreterminalManifestDigest =
  "094f3ad34ef8846f6088f51d5fb9491ff89af4509b60063453c22af07466d99b";
const workerAssertSourceDigest =
  "645feb480c46c42d7d8ca2dae07ec1c82f88264ac5d0e30d26593a8e566f3f66";
const workerAssertDefinitionDigest =
  "a48f6bf4e52306fcf476178c668a7b5bd130f9e957f16ca14d018e22154f43fc";

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

test("CURRENT189 preserves the reviewed CURRENT185 digest and advances readiness exactly once", async () => {
  const { entries, rows } = await canonicalManifest();
  assert.equal(entries.length, 189);
  assert.equal(entries.at(-5), predecessorName);
  assert.equal(entries.at(-4), guardMigrationName);
  assert.equal(entries.at(-3), telegramMigrationName);
  assert.equal(entries.at(-2), previousCurrentMigrationName);
  assert.equal(entries.at(-1), currentMigrationName);
  assert.equal(
    sha256(`${rows.slice(0, -4).join("\n")}\n`),
    preterminalManifestDigest,
  );

  const sql = normalizedBytes(
    await readFile(
      path.join(migrationsRoot, guardMigrationName, "migration.sql"),
    ),
  ).toString("utf8");
  assert.match(sql, /completed_migration_count IS DISTINCT FROM 185/u);
  assert.match(sql, new RegExp(predecessorName, "u"));
  assert.match(sql, new RegExp(preterminalManifestDigest, "u"));
  assert.match(
    sql,
    new RegExp(productionHistoryPreterminalManifestDigest, "u"),
  );
  assert.match(sql, /migration_count IS DISTINCT FROM 186/u);
  assert.match(sql, new RegExp(guardMigrationName, "u"));
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
  const telegramSql = normalizedBytes(
    await readFile(
      path.join(migrationsRoot, telegramMigrationName, "migration.sql"),
    ),
  ).toString("utf8");
  assert.match(telegramSql, /migration_count IS DISTINCT FROM 187/u);
  assert.match(telegramSql, new RegExp(telegramMigrationName, "u"));
  assert.match(telegramSql, new RegExp(guardMigrationName, "u"));
  assert.match(telegramSql, new RegExp(preterminalManifestDigest, "u"));
  assert.match(
    telegramSql,
    new RegExp(productionHistoryPreterminalManifestDigest, "u"),
  );

  const previousCurrentSql = normalizedBytes(
    await readFile(
      path.join(migrationsRoot, previousCurrentMigrationName, "migration.sql"),
    ),
  ).toString("utf8");
  assert.match(previousCurrentSql, /migration_count IS DISTINCT FROM 188/u);
  assert.match(
    previousCurrentSql,
    new RegExp(previousCurrentMigrationName, "u"),
  );
  assert.match(previousCurrentSql, new RegExp(telegramMigrationName, "u"));
  assert.match(previousCurrentSql, new RegExp(guardMigrationName, "u"));
  assert.match(previousCurrentSql, new RegExp(preterminalManifestDigest, "u"));
  assert.match(
    previousCurrentSql,
    new RegExp(productionHistoryPreterminalManifestDigest, "u"),
  );

  const currentSql = normalizedBytes(
    await readFile(
      path.join(migrationsRoot, currentMigrationName, "migration.sql"),
    ),
  ).toString("utf8");
  assert.match(
    currentSql,
    /pg_catalog\.length\("description"\) BETWEEN 20 AND 2000/u,
  );
  assert.match(currentSql, /migration_count IS DISTINCT FROM 189/u);
  assert.match(currentSql, new RegExp(currentMigrationName, "u"));
  assert.match(currentSql, new RegExp(previousCurrentMigrationName, "u"));
  assert.match(currentSql, new RegExp(telegramMigrationName, "u"));
  assert.match(currentSql, new RegExp(guardMigrationName, "u"));
  assert.match(currentSql, new RegExp(preterminalManifestDigest, "u"));
  assert.match(
    currentSql,
    new RegExp(productionHistoryPreterminalManifestDigest, "u"),
  );
});

test("the active worker repository consumes the exact CURRENT189 receipt", async () => {
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
  assert.match(repository, new RegExp(currentMigrationName, "u"));
  assert.match(repository, /CURRENT_MIGRATION_COUNT = 189 as const/u);
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

test("the legacy inventory pins the CURRENT187 worker function definition", async () => {
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
