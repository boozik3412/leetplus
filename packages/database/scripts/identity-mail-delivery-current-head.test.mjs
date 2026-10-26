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
const previousCurrent189MigrationName =
  "20260831120000_guest_support_bug_report_input_repair";
const currentMigrationName =
  "20260908090000_initial_owner_invite_link_mode";
const previousRelease191MigrationName =
  "20260908180000_external_langame_simple_onboarding";
const previousRelease192MigrationName = "20261004090000_store_closures";
const previousRelease193MigrationName = "20261007120000_guest_leaderboard";
const previousRelease194MigrationName = "20261014120000_guest_game_holdout";
const releaseMigrationName = "20261026120000_daily_report_bot";
const predecessorName = "20260818020000_identity_mail_delivery_current_head_v1";
const preterminalManifestDigest =
  "589dd0a39f2372041a284392c72ad6ed59027877e909e1a5d377b9017c662fda";
const productionHistoryPreterminalManifestDigest =
  "094f3ad34ef8846f6088f51d5fb9491ff89af4509b60063453c22af07466d99b";
const workerAssertSourceDigest =
  "645feb480c46c42d7d8ca2dae07ec1c82f88264ac5d0e30d26593a8e566f3f66";
const workerAssertDefinitionDigest =
  "a6548a4a2434c6891bc9ed20396cbb7a8e6429bf74d445d5de4ef3357337dec4";

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

test("CURRENT195 preserves the reviewed CURRENT185 digest and advances readiness exactly once", async () => {
  const { entries, rows } = await canonicalManifest();
  assert.equal(entries.length, 195);
  assert.equal(entries.at(-11), predecessorName);
  assert.equal(entries.at(-10), guardMigrationName);
  assert.equal(entries.at(-9), telegramMigrationName);
  assert.equal(entries.at(-8), previousCurrentMigrationName);
  assert.equal(entries.at(-7), previousCurrent189MigrationName);
  assert.equal(entries.at(-6), currentMigrationName);
  assert.equal(entries.at(-5), previousRelease191MigrationName);
  assert.equal(entries.at(-4), previousRelease192MigrationName);
  assert.equal(entries.at(-3), previousRelease193MigrationName);
  assert.equal(entries.at(-2), previousRelease194MigrationName);
  assert.equal(entries.at(-1), releaseMigrationName);
  assert.equal(
    sha256(`${rows.slice(0, -10).join("\n")}\n`),
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

  const previousCurrent189Sql = normalizedBytes(
    await readFile(
      path.join(
        migrationsRoot,
        previousCurrent189MigrationName,
        "migration.sql",
      ),
    ),
  ).toString("utf8");
  assert.match(
    previousCurrent189Sql,
    /pg_catalog\.length\("description"\) BETWEEN 20 AND 2000/u,
  );
  assert.match(previousCurrent189Sql, /migration_count IS DISTINCT FROM 189/u);
  assert.match(
    previousCurrent189Sql,
    new RegExp(previousCurrent189MigrationName, "u"),
  );
  assert.match(
    previousCurrent189Sql,
    new RegExp(previousCurrentMigrationName, "u"),
  );
  assert.match(previousCurrent189Sql, new RegExp(telegramMigrationName, "u"));
  assert.match(previousCurrent189Sql, new RegExp(guardMigrationName, "u"));
  assert.match(
    previousCurrent189Sql,
    new RegExp(preterminalManifestDigest, "u"),
  );
  assert.match(
    previousCurrent189Sql,
    new RegExp(productionHistoryPreterminalManifestDigest, "u"),
  );

  const currentSql = normalizedBytes(
    await readFile(
      path.join(migrationsRoot, currentMigrationName, "migration.sql"),
    ),
  ).toString("utf8");
  assert.match(currentSql, /migration_count IS DISTINCT FROM 190/u);
  assert.match(currentSql, new RegExp(currentMigrationName, "u"));
  assert.match(currentSql, new RegExp(previousCurrent189MigrationName, "u"));
  assert.match(currentSql, new RegExp(preterminalManifestDigest, "u"));
  assert.match(
    currentSql,
    new RegExp(productionHistoryPreterminalManifestDigest, "u"),
  );
  assert.match(currentSql, /"deliveryMode" IN \('EMAIL', 'LINK'\)/u);
  assert.match(currentSql, /OWNER_INVITE_LINK_ONLY/u);
  assert.match(
    currentSql,
    /CREATE TRIGGER "UserInvite_initial_owner_delivery_mode_guard_trigger"/u,
  );
  assert.match(
    currentSql,
    /identity_initial_owner_invite_registration_allowed_v1/u,
  );
  assert.match(
    currentSql,
    /target_invite\."deliveryMode" = 'EMAIL'[\s\S]*?target_outbox\."status" =\s*'SENT'/u,
  );
  assert.match(
    currentSql,
    /target_invite\."deliveryMode" = 'LINK'[\s\S]*?target_outbox\."status" =\s*'CANCELED'/u,
  );
  assert.match(currentSql, /^BEGIN;/u);
  assert.match(currentSql, /COMMIT;\s*$/u);

  const release191Sql = normalizedBytes(
    await readFile(
      path.join(
        migrationsRoot,
        previousRelease191MigrationName,
        "migration.sql",
      ),
    ),
  ).toString("utf8");
  assert.match(
    release191Sql,
    /CREATE UNIQUE INDEX "store_external_identity_global_uidx"/u,
  );
  assert.match(
    release191Sql,
    /"externalProvider"[\s\S]*"externalDomain"[\s\S]*"externalClubId"/u,
  );
  assert.match(
    release191Sql,
    /CREATE OR REPLACE FUNCTION public\."identity_mail_delivery_worker_assert_v1"/u,
  );
  assert.match(
    release191Sql,
    /migration_count IS DISTINCT FROM 191[\s\S]*20260908180000_external_langame_simple_onboarding/u,
  );
  assert.match(release191Sql, /not CURRENT_191/u);
  assert.doesNotMatch(
    release191Sql,
    /\b(?:DELETE|DROP|TRUNCATE|UPDATE)\b/iu,
  );

  const release192Sql = normalizedBytes(
    await readFile(
      path.join(
        migrationsRoot,
        previousRelease192MigrationName,
        "migration.sql",
      ),
    ),
  ).toString("utf8");
  assert.match(release192Sql, /CREATE TABLE public\."StoreClosure"/u);
  assert.match(
    release192Sql,
    /migration_count IS DISTINCT FROM 192[\s\S]*20261004090000_store_closures/u,
  );
  assert.match(release192Sql, /not CURRENT_192/u);

  const release193Sql = normalizedBytes(
    await readFile(
      path.join(
        migrationsRoot,
        previousRelease193MigrationName,
        "migration.sql",
      ),
    ),
  ).toString("utf8");
  assert.match(
    release193Sql,
    /CREATE TABLE public\."GuestLeaderboardSettings"/u,
  );
  assert.match(
    release193Sql,
    /migration_count IS DISTINCT FROM 193[\s\S]*20261007120000_guest_leaderboard/u,
  );
  assert.match(release193Sql, /not CURRENT_193/u);

  const release194Sql = normalizedBytes(
    await readFile(
      path.join(
        migrationsRoot,
        previousRelease194MigrationName,
        "migration.sql",
      ),
    ),
  ).toString("utf8");
  assert.match(
    release194Sql,
    /ALTER TABLE public\."GuestGameMission"\s+ADD COLUMN "holdoutPercent" INTEGER NOT NULL DEFAULT 0/u,
  );
  assert.match(
    release194Sql,
    /migration_count IS DISTINCT FROM 194[\s\S]*20261014120000_guest_game_holdout/u,
  );
  assert.match(release194Sql, /not CURRENT_194/u);

  const releaseSql = normalizedBytes(
    await readFile(
      path.join(migrationsRoot, releaseMigrationName, "migration.sql"),
    ),
  ).toString("utf8");
  assert.match(releaseSql, /CREATE TABLE public\."DailyReportBot"/u);
  assert.match(releaseSql, /CREATE TABLE public\."DailyReportRecipient"/u);
  assert.match(releaseSql, /CREATE TABLE public\."DailyReportDelivery"/u);
  assert.match(
    releaseSql,
    /CREATE OR REPLACE FUNCTION public\."identity_mail_delivery_worker_assert_v1"/u,
  );
  assert.match(
    releaseSql,
    /migration_count IS DISTINCT FROM 195[\s\S]*20261026120000_daily_report_bot/u,
  );
  assert.match(
    releaseSql,
    /20261014120000_guest_game_holdout',\s*'20261026120000_daily_report_bot'/u,
  );
  assert.match(releaseSql, /not CURRENT_195/u);
  // Additive only: three new tables, no existing row or table changes.
  assert.doesNotMatch(
    releaseSql,
    /\b(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+public)\b/iu,
  );
  assert.doesNotMatch(releaseSql, /^\s*(?:BEGIN|COMMIT);/imu);
});

test("the active worker repository consumes the exact CURRENT195 receipt", async () => {
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
  assert.match(repository, new RegExp(releaseMigrationName, "u"));
  assert.match(repository, /CURRENT_MIGRATION_COUNT = 195 as const/u);
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

test("the legacy inventory pins the CURRENT195 worker function definition", async () => {
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
