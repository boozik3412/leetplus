import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
  CURRENT_EXPECTED_LATEST_MIGRATION,
  CURRENT_EXPECTED_MIGRATION_COUNT,
  STAFF_TASK_ALLOWED_ADDITIVE_TAIL,
  STAFF_TASK_CURRENT_RELEASE_STATE,
} from "./staff-task-integrity-migration-state.mjs";

const PREFIX_MIGRATION = "20260729120000_store_background_execution_fence";
const TARGET_MIGRATION = "20260729160000_guest_game_delivery_claim_fence";
const IDENTITY_FOUNDATION_MIGRATION =
  "20260729190000_identity_email_claim_foundation";
const migrationUrl = new URL(
  `../prisma/migrations/${TARGET_MIGRATION}/migration.sql`,
  import.meta.url,
);
const migrationsUrl = new URL("../prisma/migrations/", import.meta.url);
const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);
const baseManifestUrl = new URL(
  "./tenant-delivery-claim-base-165-manifest.json",
  import.meta.url,
);

const DELIVERY_COLUMNS = Object.freeze([
  ["attempts", "INTEGER NOT NULL DEFAULT 0"],
  ["attemptBudget", "INTEGER NOT NULL DEFAULT 5"],
  ["claimGeneration", "INTEGER NOT NULL DEFAULT 0"],
  ["transitionRevision", "BIGINT NOT NULL DEFAULT 0"],
  ["claimJobKind", "TEXT"],
  ["integrityState", "TEXT"],
  ["integrityReasonCode", "TEXT"],
  ["stateReasonCode", "TEXT"],
  ["executionRevision", "INTEGER"],
  ["storeExecutionRevision", "INTEGER"],
  ["leaseOwner", "TEXT"],
  ["claimKeyVersion", "INTEGER"],
  ["claimOwnerDigest", "TEXT"],
  ["claimTokenDigest", "TEXT"],
  ["claimedAt", "TIMESTAMPTZ(3)"],
  ["leaseExpiresAt", "TIMESTAMPTZ(3)"],
  ["acknowledgeUntil", "TIMESTAMPTZ(3)"],
  ["effectInputDigest", "TEXT"],
  ["providerConfigDigest", "TEXT"],
  ["providerAuthorityRevision", "INTEGER"],
  ["workloadIdentityDigest", "TEXT"],
  ["sendGrantDigest", "TEXT"],
  ["sendGrantExpiresAt", "TIMESTAMPTZ(3)"],
  ["providerAttemptKey", "TEXT"],
  ["providerAttemptedAt", "TIMESTAMPTZ(3)"],
  ["providerOutcomeClass", "TEXT"],
  ["providerOutcomeCode", "TEXT"],
  ["providerObservedAt", "TIMESTAMPTZ(3)"],
  ["providerReceiptDigest", "TEXT"],
  ["providerReceiptRefEncrypted", "BYTEA"],
  ["providerReceiptKeyVersion", "INTEGER"],
  ["terminalAckDigest", "TEXT"],
]);

const EVENT_COLUMNS = Object.freeze([
  ["transitionKey", "TEXT"],
  ["transitionRevision", "BIGINT"],
  ["storeId", "TEXT"],
  ["attemptId", "TEXT"],
  ["claimGeneration", "INTEGER"],
  ["attemptNumber", "INTEGER"],
  ["claimJobKind", "TEXT"],
  ["executionRevision", "INTEGER"],
  ["storeExecutionRevision", "INTEGER"],
  ["claimKeyVersion", "INTEGER"],
  ["claimOwnerDigest", "TEXT"],
  ["claimTokenDigest", "TEXT"],
  ["claimedAt", "TIMESTAMPTZ(3)"],
  ["leaseExpiresAt", "TIMESTAMPTZ(3)"],
  ["acknowledgeUntil", "TIMESTAMPTZ(3)"],
  ["effectInputDigest", "TEXT"],
  ["providerConfigDigest", "TEXT"],
  ["providerAuthorityRevision", "INTEGER"],
  ["workloadIdentityDigest", "TEXT"],
  ["providerAttemptKey", "TEXT"],
  ["providerAttemptedAt", "TIMESTAMPTZ(3)"],
  ["sendGrantDigest", "TEXT"],
  ["sendGrantExpiresAt", "TIMESTAMPTZ(3)"],
  ["providerOutcomeClass", "TEXT"],
  ["providerOutcomeCode", "TEXT"],
  ["providerObservedAt", "TIMESTAMPTZ(3)"],
  ["providerReceiptDigest", "TEXT"],
  ["providerReceiptRefEncrypted", "BYTEA"],
  ["providerReceiptKeyVersion", "INTEGER"],
  ["terminalAckDigest", "TEXT"],
  ["integrityState", "TEXT"],
  ["integrityReasonCode", "TEXT"],
  ["stateReasonCode", "TEXT"],
  ["adapterVersion", "TEXT"],
  ["httpStatusClass", "INTEGER"],
  ["provenanceDigest", "TEXT"],
]);

const ATTEMPT_COLUMNS = Object.freeze([
  ["id", "TEXT NOT NULL"],
  ["tenantId", "TEXT NOT NULL"],
  ["deliveryId", "TEXT NOT NULL"],
  ["rewardId", "TEXT NOT NULL"],
  ["storeId", "TEXT NOT NULL"],
  ["channel", "TEXT NOT NULL"],
  ["claimGeneration", "INTEGER NOT NULL"],
  ["attemptNumber", "INTEGER NOT NULL"],
  ["claimJobKind", "TEXT NOT NULL"],
  ["executionRevision", "INTEGER NOT NULL"],
  ["storeExecutionRevision", "INTEGER NOT NULL"],
  ["claimKeyVersion", "INTEGER NOT NULL"],
  ["claimOwnerDigest", "TEXT NOT NULL"],
  ["claimTokenDigest", "TEXT NOT NULL"],
  ["claimedAt", "TIMESTAMPTZ(3) NOT NULL"],
  ["leaseExpiresAt", "TIMESTAMPTZ(3) NOT NULL"],
  ["acknowledgeUntil", "TIMESTAMPTZ(3) NOT NULL"],
  ["effectInputDigest", "TEXT NOT NULL"],
  ["providerConfigDigest", "TEXT NOT NULL"],
  ["providerAuthorityRevision", "INTEGER NOT NULL"],
  ["workloadIdentityDigest", "TEXT NOT NULL"],
  ["providerAttemptKey", "TEXT NOT NULL"],
  ["providerAttemptedAt", "TIMESTAMPTZ(3) NOT NULL"],
  ["sendGrantDigest", "TEXT NOT NULL"],
  ["sendGrantExpiresAt", "TIMESTAMPTZ(3) NOT NULL"],
  ["createdAt", "TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"],
]);

const DELIVERY_CHECKS = Object.freeze([
  "GuestGameDelivery_status_check",
  "GuestGameDelivery_channel_check",
  "GuestGameDelivery_integrity_state_check",
  "GuestGameDelivery_claim_job_kind_check",
  "GuestGameDelivery_attempt_budget_check",
  "GuestGameDelivery_claim_generation_check",
  "GuestGameDelivery_revision_check",
  "GuestGameDelivery_reason_code_check",
  "GuestGameDelivery_runtime_identity_check",
  "GuestGameDelivery_digest_format_check",
  "GuestGameDelivery_outcome_check",
  "GuestGameDelivery_claim_window_check",
  "GuestGameDelivery_attempt_window_check",
  "GuestGameDelivery_send_grant_check",
  "GuestGameDelivery_receipt_pair_check",
  "GuestGameDelivery_store_revision_scope_check",
  "GuestGameDelivery_quarantine_state_check",
  "GuestGameDelivery_provider_state_check",
  "GuestGameDelivery_non_provider_state_check",
]);

const ATTEMPT_CHECKS = Object.freeze([
  "GuestGameDeliveryAttempt_channel_check",
  "GuestGameDeliveryAttempt_job_kind_check",
  "GuestGameDeliveryAttempt_positive_revision_check",
  "GuestGameDeliveryAttempt_digest_format_check",
  "GuestGameDeliveryAttempt_provider_key_check",
  "GuestGameDeliveryAttempt_window_check",
]);

const EVENT_CHECKS = Object.freeze([
  "GuestGameDeliveryEvent_transition_key_check",
  "GuestGameDeliveryEvent_scope_value_check",
  "GuestGameDeliveryEvent_provider_key_check",
  "GuestGameDeliveryEvent_digest_format_check",
  "GuestGameDeliveryEvent_receipt_pair_check",
  "GuestGameDeliveryEvent_claim_window_check",
  "GuestGameDeliveryEvent_attempt_window_check",
  "GuestGameDeliveryEvent_send_grant_check",
  "GuestGameDeliveryEvent_durable_evidence_check",
]);

const DURABLE_EVENT_TYPES = Object.freeze([
  "DELIVERY_CLAIMED",
  "DELIVERY_PROVIDER_ATTEMPTED",
  "DELIVERY_FINALIZED",
  "DELIVERY_REAPED",
  "DELIVERY_RETRIED",
  "DELIVERY_CANCELED",
  "DELIVERY_RECONCILED",
  "DELIVERY_INTEGRITY_QUARANTINED",
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function occurrenceCount(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function assertOccursExactly(haystack, needle, expected = 1) {
  assert.equal(
    occurrenceCount(haystack, needle),
    expected,
    `${needle} must occur exactly ${expected} time(s).`,
  );
}

function modelBlock(schema, modelName) {
  const match = schema.match(
    new RegExp(`model ${escapeRegExp(modelName)} \\{[\\s\\S]*?\\n\\}`, "u"),
  );
  assert(match, `Prisma model ${modelName} is missing.`);
  return match[0];
}

function functionBlock(sql, functionName) {
  const marker = `CREATE OR REPLACE FUNCTION public."${functionName}"()`;
  const start = sql.indexOf(marker);
  assert(start >= 0, `${functionName} is missing.`);
  const end = sql.indexOf("\n$$;", start);
  assert(end > start, `${functionName} body is not terminated.`);
  return sql.slice(start, end + 4);
}

function namedFunctionBlock(sql, functionName) {
  const marker = `CREATE OR REPLACE FUNCTION public."${functionName}"`;
  const start = sql.indexOf(marker);
  assert(start >= 0, `${functionName} is missing.`);
  const end = sql.indexOf("\n$$;", start);
  assert(end > start, `${functionName} body is not terminated.`);
  return sql.slice(start, end + 4);
}

function assertSqlColumns(sqlBlock, columns) {
  for (const [name, definition] of columns) {
    assert.match(
      sqlBlock,
      new RegExp(
        `"${escapeRegExp(name)}"\\s+${escapeRegExp(definition)}(?:,|;|\\n)`,
        "u",
      ),
      `${name} must retain its exact SQL type/default/nullability contract.`,
    );
  }
}

function assertPrismaField(model, name, type, attributes = "") {
  const suffix = attributes
    ? `\\s+${attributes
        .split(" ")
        .map((part) => escapeRegExp(part))
        .join("\\s+")}`
    : "";
  assert.match(
    model,
    new RegExp(
      `^\\s{2}${escapeRegExp(name)}\\s+${escapeRegExp(type)}${suffix}\\s*$`,
      "mu",
    ),
    `${name} must retain its exact Prisma type/default contract.`,
  );
}

function assertCompositeRestrictForeignKey(
  sql,
  constraint,
  childColumns,
  parent,
  parentColumns,
) {
  const columnSql = childColumns.map((column) => `"${column}"`).join(", ");
  const parentColumnSql = parentColumns
    .map((column) => `"${column}"`)
    .join(", ");
  assert.match(
    sql,
    new RegExp(
      `ADD CONSTRAINT "${escapeRegExp(constraint)}"\\s+` +
        `FOREIGN KEY \\(${escapeRegExp(columnSql)}\\)\\s+` +
        `REFERENCES "${escapeRegExp(parent)}" \\(${escapeRegExp(parentColumnSql)}\\)\\s+` +
        "ON DELETE RESTRICT ON UPDATE RESTRICT",
      "u",
    ),
    `${constraint} must be a same-scope RESTRICT foreign key.`,
  );
}

async function artifacts() {
  const [sql, schema] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
  ]);
  return { sql, schema };
}

test("migration 166 is transactional and requires the exact CURRENT_165 Store fence", async () => {
  const { sql, schema } = await artifacts();
  assert.doesNotMatch(
    sql,
    /\bAS\s+constraint\b/u,
    "PostgreSQL reserved keyword CONSTRAINT cannot be used as an unquoted alias.",
  );
  const baseManifest = JSON.parse(await readFile(baseManifestUrl, "utf8"));
  const migrationNames = (await readdir(migrationsUrl, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const targetIndex = migrationNames.indexOf(TARGET_MIGRATION);

  assert.equal(migrationNames.length, CURRENT_EXPECTED_MIGRATION_COUNT);
  assert.equal(migrationNames.at(-1), CURRENT_EXPECTED_LATEST_MIGRATION);
  assert.equal(STAFF_TASK_CURRENT_RELEASE_STATE, "CURRENT_174");
  const additiveTargetIndex =
    STAFF_TASK_ALLOWED_ADDITIVE_TAIL.indexOf(TARGET_MIGRATION);
  assert.deepEqual(
    STAFF_TASK_ALLOWED_ADDITIVE_TAIL.slice(
      additiveTargetIndex - 1,
      additiveTargetIndex + 1,
    ),
    [PREFIX_MIGRATION, TARGET_MIGRATION],
  );
  assert.equal(targetIndex, 165);
  assert.equal(migrationNames[targetIndex - 1], PREFIX_MIGRATION);
  assert.equal(migrationNames[targetIndex + 1], IDENTITY_FOUNDATION_MIGRATION);
  assert.equal(
    STAFF_TASK_ALLOWED_ADDITIVE_TAIL.at(-1),
    CURRENT_EXPECTED_LATEST_MIGRATION,
  );
  assert.deepEqual(
    {
      schemaVersion: baseManifest.schemaVersion,
      migrationCount: baseManifest.migrationCount,
      latestMigration: baseManifest.latestMigration,
      lineEnding: baseManifest.lineEnding,
    },
    {
      schemaVersion: 1,
      migrationCount: 165,
      latestMigration: PREFIX_MIGRATION,
      lineEnding: "LF",
    },
  );
  assert.equal(baseManifest.migrations.length, 165);
  assert.deepEqual(
    baseManifest.migrations.map(({ migrationName }) => migrationName),
    migrationNames.slice(0, targetIndex),
  );
  assert.equal(
    baseManifest.migrations.some(
      ({ migrationName }) => migrationName === TARGET_MIGRATION,
    ),
    false,
    "The immutable CURRENT_165 manifest must not include migration 166.",
  );
  for (const entry of baseManifest.migrations) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/u);
    const migrationSql = await readFile(
      new URL(`${entry.migrationName}/migration.sql`, migrationsUrl),
      "utf8",
    );
    const normalizedSql = migrationSql.replace(/\r\n?/gu, "\n");
    assert.equal(
      createHash("sha256").update(normalizedSql, "utf8").digest("hex"),
      entry.sha256,
      `${entry.migrationName} changed after the CURRENT_165 manifest was frozen.`,
    );
  }

  assert.match(sql, /^BEGIN;/u);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/u);
  assert.match(sql, /SET LOCAL statement_timeout = '120s';/u);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.match(
    sql,
    /LOCK TABLE\s+"GuestGameReward",\s+"GuestGameDelivery",\s+"GuestGameDeliveryEvent",\s+"GuestGameProfile",\s+"Guest",\s+"Store",\s+"Tenant"\s+IN ACCESS EXCLUSIVE MODE;/u,
  );
  assert.match(
    sql,
    /CURRENT_165 Store background execution fence is not present[\s\S]*ERRCODE = '55000'/u,
  );
  assert.match(
    sql,
    /attribute\.attname = 'backgroundExecutionEnabled'[\s\S]*attribute\.attnotnull/u,
  );
  assert.match(
    sql,
    /attribute\.attname = 'executionRevision'[\s\S]*attribute\.attnotnull/u,
  );
  assert.match(
    sql,
    /trigger\.tgname = 'Store_execution_revision_fence_trigger'[\s\S]*trigger\.tgenabled <> 'D'/u,
  );
  assert.match(
    sql,
    /FROM "GuestGameDeliveryEvent" AS event\s+WHERE event\."eventType" IN \(\s+'DELIVERY_CLAIMED',\s+'DELIVERY_PROVIDER_ATTEMPTED',\s+'DELIVERY_FINALIZED',\s+'DELIVERY_REAPED',\s+'DELIVERY_RETRIED',\s+'DELIVERY_CANCELED',\s+'DELIVERY_RECONCILED',\s+'DELIVERY_INTEGRITY_QUARANTINED'\s+\)[\s\S]*pre-166 reserved typed event name[\s\S]*ERRCODE = '55000'/u,
  );
  assert.match(
    sql,
    /reward\."tenantId" <> delivery\."tenantId"[\s\S]*cross-tenant reward binding[\s\S]*ERRCODE = '55000'/u,
  );
  assert.match(
    sql,
    /event\."tenantId" <> delivery\."tenantId"[\s\S]*cross-scope delivery or reward binding[\s\S]*ERRCODE = '55000'/u,
  );
  assert(
    sql.indexOf("CURRENT_165 Store background execution fence is not present") <
      sql.indexOf('CREATE UNIQUE INDEX "guest_tenant_id_uidx"'),
    "CURRENT_165 preflight must run before migration 166 DDL.",
  );
  assert(
    sql.indexOf("pre-166 reserved typed event name") <
      sql.indexOf('CREATE UNIQUE INDEX "guest_tenant_id_uidx"'),
    "Reserved typed delivery-event inventory must run before migration 166 DDL.",
  );

  assert.doesNotMatch(
    sql,
    /(?:ALTER TABLE|UPDATE|INSERT INTO|DELETE FROM)\s+"Store"/u,
  );
  assert.doesNotMatch(sql, /SET\s+"backgroundExecutionEnabled"\s*=/iu);
  const store = modelBlock(schema, "Store");
  assertPrismaField(
    store,
    "backgroundExecutionEnabled",
    "Boolean",
    "@default(false)",
  );
  assertPrismaField(store, "executionRevision", "Int", "@default(0)");
});

test("migration and Prisma schema expose the exact delivery claim columns and models", async () => {
  const { sql, schema } = await artifacts();
  const deliveryAlter = sql.slice(
    sql.indexOf('ALTER TABLE "GuestGameDelivery"\n  ADD COLUMN'),
    sql.indexOf('ALTER TABLE "GuestGameDeliveryEvent"\n  ADD COLUMN'),
  );
  const eventAlter = sql.slice(
    sql.indexOf('ALTER TABLE "GuestGameDeliveryEvent"\n  ADD COLUMN'),
    sql.indexOf('CREATE TABLE "GuestGameDeliveryAttempt"'),
  );
  const attemptTable = sql.slice(
    sql.indexOf('CREATE TABLE "GuestGameDeliveryAttempt"'),
    sql.indexOf("-- Backfill a canonical Store"),
  );
  assertSqlColumns(deliveryAlter, DELIVERY_COLUMNS);
  assertSqlColumns(eventAlter, EVENT_COLUMNS);
  assertSqlColumns(attemptTable, ATTEMPT_COLUMNS);
  assert.match(
    sql,
    /ALTER TABLE "GuestGameDelivery"\s+ALTER COLUMN "integrityState" SET DEFAULT 'VERIFIED',\s+ALTER COLUMN "integrityState" SET NOT NULL;/u,
  );

  const delivery = modelBlock(schema, "GuestGameDelivery");
  const event = modelBlock(schema, "GuestGameDeliveryEvent");
  const attempt = modelBlock(schema, "GuestGameDeliveryAttempt");

  for (const [name] of DELIVERY_COLUMNS) {
    const dateTimeFields = new Set([
      "claimedAt",
      "leaseExpiresAt",
      "acknowledgeUntil",
      "sendGrantExpiresAt",
      "providerAttemptedAt",
      "providerObservedAt",
    ]);
    const intDefaults = new Map([
      ["attempts", "@default(0)"],
      ["attemptBudget", "@default(5)"],
      ["claimGeneration", "@default(0)"],
      ["transitionRevision", "@default(0)"],
    ]);
    const type =
      name === "providerReceiptRefEncrypted"
        ? "Bytes?"
        : name === "transitionRevision"
          ? "BigInt"
          : dateTimeFields.has(name)
            ? "DateTime?"
            : new Set([
                  "attempts",
                  "attemptBudget",
                  "claimGeneration",
                  "executionRevision",
                  "storeExecutionRevision",
                  "claimKeyVersion",
                  "providerAuthorityRevision",
                  "providerReceiptKeyVersion",
                ]).has(name)
              ? name === "attempts" ||
                name === "attemptBudget" ||
                name === "claimGeneration"
                ? "Int"
                : "Int?"
              : name === "integrityState"
                ? "String"
                : "String?";
    const attributes = dateTimeFields.has(name)
      ? "@db.Timestamptz(3)"
      : name === "integrityState"
        ? '@default("VERIFIED")'
        : (intDefaults.get(name) ?? "");
    assertPrismaField(delivery, name, type, attributes);
  }

  for (const [name] of EVENT_COLUMNS) {
    const dateTimeFields = new Set([
      "claimedAt",
      "leaseExpiresAt",
      "acknowledgeUntil",
      "providerAttemptedAt",
      "sendGrantExpiresAt",
      "providerObservedAt",
    ]);
    const type =
      name === "providerReceiptRefEncrypted"
        ? "Bytes?"
        : name === "transitionRevision"
          ? "BigInt?"
          : dateTimeFields.has(name)
            ? "DateTime?"
            : new Set([
                  "claimGeneration",
                  "attemptNumber",
                  "executionRevision",
                  "storeExecutionRevision",
                  "claimKeyVersion",
                  "providerAuthorityRevision",
                  "providerReceiptKeyVersion",
                  "httpStatusClass",
                ]).has(name)
              ? "Int?"
              : "String?";
    assertPrismaField(
      event,
      name,
      type,
      dateTimeFields.has(name) ? "@db.Timestamptz(3)" : "",
    );
  }

  for (const [name] of ATTEMPT_COLUMNS) {
    const dateTimeFields = new Set([
      "claimedAt",
      "leaseExpiresAt",
      "acknowledgeUntil",
      "providerAttemptedAt",
      "sendGrantExpiresAt",
      "createdAt",
    ]);
    const intFields = new Set([
      "claimGeneration",
      "attemptNumber",
      "executionRevision",
      "storeExecutionRevision",
      "claimKeyVersion",
      "providerAuthorityRevision",
    ]);
    assertPrismaField(
      attempt,
      name,
      dateTimeFields.has(name)
        ? "DateTime"
        : intFields.has(name)
          ? "Int"
          : "String",
      dateTimeFields.has(name)
        ? name === "createdAt"
          ? "@default(now()) @db.Timestamptz(3)"
          : "@db.Timestamptz(3)"
        : name === "id"
          ? "@id @default(uuid())"
          : "",
    );
  }
});

test("parent uniques and all delivery evidence foreign keys are same-scope RESTRICT contracts", async () => {
  const { sql, schema } = await artifacts();

  for (const [indexName, table] of [
    ["guest_tenant_id_uidx", "Guest"],
    ["guest_game_profile_tenant_id_uidx", "GuestGameProfile"],
    ["guest_game_reward_tenant_id_uidx", "GuestGameReward"],
    ["guest_game_delivery_tenant_id_uidx", "GuestGameDelivery"],
  ]) {
    assert.match(
      sql,
      new RegExp(
        `CREATE UNIQUE INDEX "${indexName}"\\s+ON "${table}" \\("tenantId", "id"\\);`,
        "u",
      ),
    );
    assert.match(
      modelBlock(schema, table),
      new RegExp(`@@unique\\(\\[tenantId, id\\], map: "${indexName}"\\)`, "u"),
    );
  }

  const foreignKeys = [
    [
      "GuestGameDelivery_tenantId_rewardId_fkey",
      ["tenantId", "rewardId"],
      "GuestGameReward",
      ["tenantId", "id"],
    ],
    [
      "GuestGameDelivery_tenantId_profileId_fkey",
      ["tenantId", "profileId"],
      "GuestGameProfile",
      ["tenantId", "id"],
    ],
    [
      "GuestGameDelivery_tenantId_guestId_fkey",
      ["tenantId", "guestId"],
      "Guest",
      ["tenantId", "id"],
    ],
    [
      "GuestGameDelivery_tenantId_storeId_fkey",
      ["tenantId", "storeId"],
      "Store",
      ["tenantId", "id"],
    ],
    [
      "GuestGameDeliveryAttempt_tenantId_deliveryId_fkey",
      ["tenantId", "deliveryId"],
      "GuestGameDelivery",
      ["tenantId", "id"],
    ],
    [
      "GuestGameDeliveryAttempt_tenantId_rewardId_fkey",
      ["tenantId", "rewardId"],
      "GuestGameReward",
      ["tenantId", "id"],
    ],
    [
      "GuestGameDeliveryAttempt_tenantId_storeId_fkey",
      ["tenantId", "storeId"],
      "Store",
      ["tenantId", "id"],
    ],
    [
      "GuestGameDeliveryEvent_tenantId_deliveryId_fkey",
      ["tenantId", "deliveryId"],
      "GuestGameDelivery",
      ["tenantId", "id"],
    ],
    [
      "GuestGameDeliveryEvent_tenantId_rewardId_fkey",
      ["tenantId", "rewardId"],
      "GuestGameReward",
      ["tenantId", "id"],
    ],
    [
      "GuestGameDeliveryEvent_tenantId_storeId_fkey",
      ["tenantId", "storeId"],
      "Store",
      ["tenantId", "id"],
    ],
    [
      "GuestGameDeliveryEvent_tenantId_attemptId_fkey",
      ["tenantId", "attemptId"],
      "GuestGameDeliveryAttempt",
      ["tenantId", "id"],
    ],
  ];
  for (const [constraint, childColumns, parent, parentColumns] of foreignKeys) {
    assertCompositeRestrictForeignKey(
      sql,
      constraint,
      childColumns,
      parent,
      parentColumns,
    );
  }
  assert.match(
    sql,
    /ADD CONSTRAINT "GuestGameDelivery_storeId_fkey"\s+FOREIGN KEY \("storeId"\)\s+REFERENCES "Store" \("id"\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT/u,
  );
  assert.match(
    sql,
    /ADD CONSTRAINT "GuestGameDeliveryAttempt_tenantId_fkey"\s+FOREIGN KEY \("tenantId"\)\s+REFERENCES "Tenant" \("id"\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT/u,
  );

  const replacementStart = sql.indexOf(
    'ALTER TABLE "GuestGameDelivery"\n  DROP CONSTRAINT',
  );
  const checkStart = sql.indexOf(
    'ALTER TABLE "GuestGameDelivery"\n  ADD CONSTRAINT "GuestGameDelivery_status_check"',
  );
  const replacementSql = sql.slice(replacementStart, checkStart);
  assert.doesNotMatch(
    replacementSql,
    /ON DELETE (?:CASCADE|SET NULL)|ON UPDATE (?:CASCADE|SET NULL)/u,
  );
  for (const legacyConstraint of [
    "GuestGameDelivery_rewardId_fkey",
    "GuestGameDelivery_profileId_fkey",
    "GuestGameDelivery_guestId_fkey",
    "GuestGameDelivery_storeId_fkey",
    "GuestGameDeliveryEvent_deliveryId_fkey",
    "GuestGameDeliveryEvent_rewardId_fkey",
  ]) {
    assert.match(
      replacementSql,
      new RegExp(`DROP CONSTRAINT "${legacyConstraint}"`, "u"),
    );
  }
  assert.doesNotMatch(
    replacementSql,
    /ADD CONSTRAINT "GuestGameDelivery_(?:rewardId|profileId|guestId)_fkey"/u,
  );

  const delivery = modelBlock(schema, "GuestGameDelivery");
  for (const relation of [
    'map: "GuestGameDelivery_tenantId_rewardId_fkey"',
    'map: "GuestGameDelivery_tenantId_profileId_fkey"',
    'map: "GuestGameDelivery_tenantId_guestId_fkey"',
    'map: "GuestGameDelivery_tenantId_storeId_fkey"',
  ]) {
    assert.match(delivery, new RegExp(`${escapeRegExp(relation)}\\)`, "u"));
  }
  assert.equal(
    occurrenceCount(delivery, "onDelete: Restrict, onUpdate: Restrict"),
    4,
  );
  const attempt = modelBlock(schema, "GuestGameDeliveryAttempt");
  assert.match(
    attempt,
    /tenant\s+Tenant\s+@relation\(fields: \[tenantId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict, map: "GuestGameDeliveryAttempt_tenantId_fkey"\)/u,
  );
});

test("all named CHECK constraints retain the state, evidence, and time-window contract", async () => {
  const { sql } = await artifacts();
  for (const constraint of [
    ...DELIVERY_CHECKS,
    ...ATTEMPT_CHECKS,
    ...EVENT_CHECKS,
  ]) {
    assertOccursExactly(sql, `ADD CONSTRAINT "${constraint}"`);
  }

  const deliveryCheckStart = sql.indexOf(
    'ADD CONSTRAINT "GuestGameDelivery_status_check"',
  );
  const deliveryChecks = sql.slice(
    deliveryCheckStart,
    sql.indexOf(
      'ALTER TABLE "GuestGameDeliveryAttempt"\n  ADD CONSTRAINT',
      deliveryCheckStart,
    ),
  );
  for (const status of [
    "READY",
    "PROCESSING",
    "DISPATCHING",
    "SENT",
    "FAILED",
    "BLOCKED",
    "CANCELED",
    "RECONCILIATION_REQUIRED",
  ]) {
    assert.match(deliveryChecks, new RegExp(`'${status}'`, "u"));
  }
  assert.match(
    deliveryChecks,
    /"attempts" >= 0[\s\S]*"attempts" <= "attemptBudget"[\s\S]*"attemptBudget" <= 10/u,
  );
  assert.match(
    deliveryChecks,
    /"claimGeneration" >= 0[\s\S]*"claimGeneration" < 2147483647[\s\S]*"transitionRevision" >= 0/u,
  );
  assert.match(
    deliveryChecks,
    /"claimedAt" < "leaseExpiresAt"[\s\S]*"leaseExpiresAt" <= "acknowledgeUntil"/u,
  );
  assert.match(
    deliveryChecks,
    /"providerAttemptedAt" < "sendGrantExpiresAt"[\s\S]*"sendGrantExpiresAt" <= "leaseExpiresAt"/u,
  );
  assert.match(
    deliveryChecks,
    /"integrityState" <> 'LEGACY_QUARANTINED'[\s\S]*"status" IN \('BLOCKED', 'SENT', 'FAILED', 'CANCELED'\)/u,
  );
  assert.match(
    deliveryChecks,
    /"status" = 'PROCESSING'[\s\S]*"status" = 'DISPATCHING'[\s\S]*"status" = 'RECONCILIATION_REQUIRED'[\s\S]*"status" = 'SENT'[\s\S]*"status" = 'FAILED'/u,
  );
  assert.match(
    deliveryChecks,
    /GuestGameDelivery_outcome_check"[\s\S]*"providerOutcomeClass" IS NOT NULL[\s\S]*"providerOutcomeCode" IS NOT NULL[\s\S]*"providerOutcomeClass" IN \('APPLIED', 'NOT_APPLIED', 'AMBIGUOUS'\)/u,
  );
  assert.match(
    deliveryChecks,
    /"status" = 'PROCESSING'[\s\S]*"executionRevision" IS NOT NULL[\s\S]*"executionRevision" > 0[\s\S]*"storeExecutionRevision" IS NOT NULL[\s\S]*"storeExecutionRevision" > 0/u,
  );
  assert.match(
    deliveryChecks,
    /"status" = 'DISPATCHING'[\s\S]*"executionRevision" IS NOT NULL[\s\S]*"executionRevision" > 0[\s\S]*"storeExecutionRevision" IS NOT NULL[\s\S]*"storeExecutionRevision" > 0/u,
  );
  assert.match(
    deliveryChecks,
    /"channel" IN \('TELEGRAM', 'MAX'\)[\s\S]*"status" IN \('READY', 'BLOCKED', 'SENT', 'FAILED', 'CANCELED'\)/u,
  );
  assert.match(
    deliveryChecks,
    /GuestGameDelivery_reason_code_check"[\s\S]*"integrityState" = 'VERIFIED'[\s\S]*"integrityReasonCode" IS NULL[\s\S]*"integrityState" = 'LEGACY_QUARANTINED'[\s\S]*"integrityReasonCode" IS NOT NULL/u,
  );

  const eventChecks = sql.slice(
    sql.indexOf('ADD CONSTRAINT "GuestGameDeliveryEvent_transition_key_check"'),
    sql.indexOf(
      'CREATE UNIQUE INDEX "guest_game_delivery_current_attempt_uidx"',
    ),
  );
  assert.match(eventChecks, /\^v1:\[0-9a-f\]\{64\}\$/u);
  for (const eventType of DURABLE_EVENT_TYPES) {
    assert.match(eventChecks, new RegExp(`'${eventType}'`, "u"));
  }
  assert.match(
    eventChecks,
    /"eventType" = 'DELIVERY_PROVIDER_ATTEMPTED'[\s\S]*"attemptId" IS NOT NULL[\s\S]*"providerAttemptKey" IS NOT NULL/u,
  );
  assert.match(
    eventChecks,
    /"eventType" = 'DELIVERY_RECONCILED'[\s\S]*"attemptId" IS NOT NULL[\s\S]*"providerOutcomeClass" IN \('APPLIED', 'NOT_APPLIED'\)/u,
  );
  assert.match(eventChecks, /"httpStatusClass" BETWEEN 1 AND 5/u);
  assert.match(
    eventChecks,
    /GuestGameDeliveryEvent_scope_value_check"[\s\S]*"providerOutcomeClass" IS NOT NULL[\s\S]*"providerOutcomeCode" IS NOT NULL[\s\S]*"providerOutcomeClass" IN \('APPLIED', 'NOT_APPLIED', 'AMBIGUOUS'\)/u,
  );
  assert.match(
    eventChecks,
    /GuestGameDeliveryEvent_scope_value_check"[\s\S]*"integrityState" IS NULL[\s\S]*"integrityReasonCode" IS NULL[\s\S]*"integrityState" = 'VERIFIED'[\s\S]*"integrityState" = 'LEGACY_QUARANTINED'[\s\S]*"integrityReasonCode" IS NOT NULL[\s\S]*\) IS TRUE[\s\S]*"stateReasonCode"/u,
  );
  assert.match(
    eventChecks,
    /GuestGameDeliveryEvent_durable_evidence_check"[\s\S]*"channel" IS NOT NULL[\s\S]*"channel" IN \('TELEGRAM', 'MAX'\)[\s\S]*"executionRevision" IS NOT NULL[\s\S]*"executionRevision" > 0[\s\S]*"storeExecutionRevision" IS NOT NULL[\s\S]*"storeExecutionRevision" > 0/u,
  );
  assert.match(
    eventChecks,
    /GuestGameDeliveryEvent_durable_evidence_check"[\s\S]*"eventType" = 'DELIVERY_INTEGRITY_QUARANTINED'[\s\S]*"integrityState" = 'LEGACY_QUARANTINED'[\s\S]*"integrityReasonCode" IS NOT NULL[\s\S]*"eventType" <> 'DELIVERY_INTEGRITY_QUARANTINED'[\s\S]*"integrityState" = 'VERIFIED'[\s\S]*"integrityReasonCode" IS NULL/u,
  );
  assert.match(
    eventChecks,
    /"providerAttemptKey" IS NOT NULL[\s\S]*"attemptId" IS NOT NULL[\s\S]*"providerAuthorityRevision" IS NOT NULL[\s\S]*"providerAuthorityRevision" > 0/u,
  );
});

test("all delivery claim indexes keep their exact keys, uniqueness, and partial predicates", async () => {
  const { sql, schema } = await artifacts();
  const indexContracts = [
    [
      "CREATE UNIQUE INDEX",
      "guest_game_delivery_attempt_tenant_id_uidx",
      "GuestGameDeliveryAttempt",
      ["tenantId", "id"],
      "",
    ],
    [
      "CREATE UNIQUE INDEX",
      "guest_game_delivery_attempt_generation_uidx",
      "GuestGameDeliveryAttempt",
      ["tenantId", "deliveryId", "claimGeneration"],
      "",
    ],
    [
      "CREATE UNIQUE INDEX",
      "guest_game_delivery_attempt_provider_key_uidx",
      "GuestGameDeliveryAttempt",
      ["tenantId", "providerAttemptKey"],
      "",
    ],
    [
      "CREATE UNIQUE INDEX",
      "guest_game_delivery_event_transition_uidx",
      "GuestGameDeliveryEvent",
      ["tenantId", "transitionKey"],
      "",
    ],
    [
      "CREATE UNIQUE INDEX",
      "guest_game_delivery_event_revision_uidx",
      "GuestGameDeliveryEvent",
      ["tenantId", "deliveryId", "transitionRevision"],
      `WHERE
    "transitionRevision" IS NOT NULL
    AND "eventType" IN (
      'DELIVERY_CLAIMED',
      'DELIVERY_PROVIDER_ATTEMPTED',
      'DELIVERY_FINALIZED',
      'DELIVERY_REAPED',
      'DELIVERY_RETRIED',
      'DELIVERY_CANCELED',
      'DELIVERY_RECONCILED',
      'DELIVERY_INTEGRITY_QUARANTINED'
    )`,
    ],
    [
      "CREATE UNIQUE INDEX",
      "guest_game_delivery_current_attempt_uidx",
      "GuestGameDelivery",
      ["tenantId", "providerAttemptKey"],
      `WHERE "providerAttemptKey" IS NOT NULL`,
    ],
    [
      "CREATE INDEX",
      "guest_game_delivery_ready_claim_idx",
      "GuestGameDelivery",
      ["tenantId", "readinessStatus", "channel", "preparedAt", "id"],
      `WHERE "status" = 'READY'`,
    ],
    [
      "CREATE INDEX",
      "guest_game_delivery_processing_reaper_idx",
      "GuestGameDelivery",
      ["tenantId", "leaseExpiresAt", "id"],
      `WHERE "status" = 'PROCESSING' AND "providerAttemptedAt" IS NULL`,
    ],
    [
      "CREATE INDEX",
      "guest_game_delivery_dispatching_ack_idx",
      "GuestGameDelivery",
      ["tenantId", "acknowledgeUntil", "id"],
      `WHERE "status" = 'DISPATCHING'`,
    ],
    [
      "CREATE INDEX",
      "guest_game_delivery_reconciliation_idx",
      "GuestGameDelivery",
      ["tenantId", "providerObservedAt", "id"],
      `WHERE "status" = 'RECONCILIATION_REQUIRED'`,
    ],
    [
      "CREATE INDEX",
      "guest_game_delivery_store_execution_idx",
      "GuestGameDelivery",
      ["tenantId", "storeId", "status", "leaseExpiresAt", "id"],
      `WHERE "storeId" IS NOT NULL`,
    ],
  ];
  for (const [kind, name, table, columns, predicate] of indexContracts) {
    const predicatePattern = predicate ? `\\s+${escapeRegExp(predicate)}` : "";
    const columnsPattern = columns
      .map((column) => `"${escapeRegExp(column)}"`)
      .join("\\s*,\\s*");
    assert.match(
      sql,
      new RegExp(
        `${kind} "${name}"\\s+ON "${table}"\\s*\\(\\s*${columnsPattern}\\s*\\)${predicatePattern};`,
        "u",
      ),
      `${name} changed its exact index contract.`,
    );
  }

  const attempt = modelBlock(schema, "GuestGameDeliveryAttempt");
  const event = modelBlock(schema, "GuestGameDeliveryEvent");
  assert.match(
    attempt,
    /@@unique\(\[tenantId, deliveryId, claimGeneration\], map: "guest_game_delivery_attempt_generation_uidx"\)/u,
  );
  assert.match(
    attempt,
    /@@unique\(\[tenantId, providerAttemptKey\], map: "guest_game_delivery_attempt_provider_key_uidx"\)/u,
  );
  assert.match(
    event,
    /@@unique\(\[tenantId, transitionKey\], map: "guest_game_delivery_event_transition_uidx"\)/u,
  );
});

test("transition, binding, and durable-event functions are hardened and attached exactly once", async () => {
  const { sql } = await artifacts();
  const functions = [
    "guest_game_delivery_transition_guard",
    "guest_game_delivery_binding_check",
    "guest_game_reward_delivery_binding_check",
    "guest_game_delivery_transition_event_check",
    "guest_game_delivery_attempt_append_only",
    "guest_game_delivery_event_append_only",
  ];
  for (const functionName of functions) {
    const body = functionBlock(sql, functionName);
    assert.match(body, /LANGUAGE plpgsql/u);
    assert.match(body, /SET search_path = pg_catalog, public/u);
    assertOccursExactly(
      sql,
      `REVOKE ALL\nON FUNCTION public."${functionName}"()\nFROM PUBLIC;`,
    );
  }

  const transition = functionBlock(sql, "guest_game_delivery_transition_guard");
  assert.match(
    transition,
    /TG_OP = 'DELETE'[\s\S]*OLD\."integrityState" = 'LEGACY_QUARANTINED'[\s\S]*Legacy quarantined delivery is immutable; dedicated reconciliation is not enabled[\s\S]*ERRCODE = '55000'[\s\S]*RETURN OLD;[\s\S]*is_provider :=/u,
  );
  assert.match(
    transition,
    /TG_OP = 'INSERT'[\s\S]*Fresh delivery cannot self-assign legacy quarantine[\s\S]*ERRCODE = '23514'/u,
  );
  assert.match(
    transition,
    /OLD\."integrityState" = 'LEGACY_QUARANTINED'[\s\S]*Legacy quarantined delivery is immutable; dedicated reconciliation is not enabled[\s\S]*ERRCODE = '55000'[\s\S]*status_changed :=/u,
  );
  assert.doesNotMatch(
    transition,
    /Legacy quarantined delivery requires reconciliation/u,
  );
  assert.match(
    transition,
    /Fresh delivery must start without claim or transition revisions/u,
  );
  assert.match(
    transition,
    /NEW\."attempts" < OLD\."attempts"[\s\S]*NEW\."claimGeneration" < OLD\."claimGeneration"/u,
  );
  assert.match(
    transition,
    /NEW\."attemptBudget" <> OLD\."attemptBudget" \+ 1[\s\S]*dedicated retry/u,
  );
  assert.match(
    transition,
    /NEW\."claimGeneration" <> OLD\."claimGeneration" \+ 1[\s\S]*NEW\."attempts" <> OLD\."attempts" \+ 1/u,
  );
  assert.match(
    transition,
    /reason_changed :=[\s\S]*OLD\."stateReasonCode" IS DISTINCT FROM NEW\."stateReasonCode"[\s\S]*OLD\."integrityReasonCode" IS DISTINCT FROM NEW\."integrityReasonCode"[\s\S]*Provider delivery reason can change only with an event-bearing state transition[\s\S]*ERRCODE = '23514'/u,
  );
  assert.match(
    transition,
    /requires_transition_event :=[\s\S]*integrity_changed[\s\S]*OR reason_changed/u,
  );
  assert.match(
    transition,
    /requires_transition_event[\s\S]*NEW\."transitionRevision" <> OLD\."transitionRevision" \+ 1[\s\S]*Event-bearing transition must advance transition revision exactly once/u,
  );
  assert.match(
    transition,
    /Transition revision can advance only with a durable event/u,
  );
  assert.match(transition, /Terminal delivery status is immutable/u);
  assert.match(
    transition,
    /Delivery tenant, reward and channel identity is immutable/u,
  );
  assert.match(transition, /Claimed delivery scope is immutable/u);
  assert.match(
    transition,
    /Claim snapshot is immutable within one generation/u,
  );
  assert.match(
    transition,
    /Provider marker can change only on marker commit or dedicated retry/u,
  );
  assert.match(
    transition,
    /Provider outcome evidence can change only during finalize or reconciliation/u,
  );
  assert.match(
    sql,
    /CREATE TRIGGER "GuestGameDelivery_transition_guard"\s+BEFORE INSERT OR UPDATE OR DELETE ON "GuestGameDelivery"\s+FOR EACH ROW\s+EXECUTE FUNCTION public\."guest_game_delivery_transition_guard"\(\);/u,
  );

  const binding = functionBlock(sql, "guest_game_delivery_binding_check");
  assert.match(
    binding,
    /must call this boundary before its first[\s\S]*DML[\s\S]*PERFORM public\."guest_game_reward_delivery_lock_v1"\(\s*delivery_record\."tenantId",\s*delivery_record\."rewardId"\s*\)[\s\S]*INTO STRICT reward_record[\s\S]*FROM public\."GuestGameReward" AS reward[\s\S]*INTO STRICT delivery_record[\s\S]*FROM public\."GuestGameDelivery" AS delivery/u,
  );
  assert.doesNotMatch(binding, /pg_advisory_xact_lock|FOR UPDATE/u);
  assert.match(
    binding,
    /Verified provider delivery does not match canonical reward binding[\s\S]*ERRCODE = '23514'/u,
  );
  assert.match(
    sql,
    /CREATE CONSTRAINT TRIGGER "GuestGameDelivery_binding_check"[\s\S]*DEFERRABLE INITIALLY DEFERRED[\s\S]*EXECUTE FUNCTION public\."guest_game_delivery_binding_check"\(\);/u,
  );

  const rewardBinding = functionBlock(
    sql,
    "guest_game_reward_delivery_binding_check",
  );
  assert.match(
    rewardBinding,
    /must call the same boundary before their[\s\S]*first mutation[\s\S]*PERFORM public\."guest_game_reward_delivery_lock_v1"\(\s*reward_record\."tenantId",\s*reward_record\."id"\s*\)[\s\S]*INTO STRICT reward_record[\s\S]*FROM public\."GuestGameReward" AS reward/u,
  );
  assert.doesNotMatch(rewardBinding, /pg_advisory_xact_lock|FOR UPDATE/u);
  assert.match(
    rewardBinding,
    /Claimed provider reward Store binding is immutable[\s\S]*ERRCODE = '23514'/u,
  );
  assert.match(
    rewardBinding,
    /Reward update breaks verified provider delivery binding[\s\S]*ERRCODE = '23514'/u,
  );
  assert.match(
    sql,
    /CREATE CONSTRAINT TRIGGER "GuestGameReward_delivery_binding_check"[\s\S]*DEFERRABLE INITIALLY DEFERRED[\s\S]*EXECUTE FUNCTION public\."guest_game_reward_delivery_binding_check"\(\);/u,
  );

  const eventCheck = functionBlock(
    sql,
    "guest_game_delivery_transition_event_check",
  );
  for (const eventType of DURABLE_EVENT_TYPES) {
    assert.match(eventCheck, new RegExp(`'${eventType}'`, "u"));
  }
  assert.match(
    eventCheck,
    /matching_events <> 1[\s\S]*Delivery transition requires exactly one typed durable event[\s\S]*ERRCODE = '23514'/u,
  );
  assert.match(
    eventCheck,
    /event\."transitionRevision" = NEW\."transitionRevision"[\s\S]*guest_game_delivery_transition_key_v1"\([\s\S]*event\."transitionRevision"/u,
  );
  assert.match(
    eventCheck,
    /event\."integrityState" IS NOT DISTINCT FROM NEW\."integrityState"[\s\S]*event\."integrityReasonCode"[\s\S]*IS NOT DISTINCT FROM NEW\."integrityReasonCode"/u,
  );
  assert.match(
    eventCheck,
    /matching_attempts <> 1[\s\S]*Provider marker requires one matching immutable attempt/u,
  );
  assert.match(
    eventCheck,
    /OLD\."claimGeneration" IS DISTINCT FROM NEW\."claimGeneration"[\s\S]*expected_event_type := 'DELIVERY_CLAIMED'[\s\S]*OLD\."status" IS NOT DISTINCT FROM NEW\."status"/u,
  );
  assert.doesNotMatch(
    eventCheck,
    /OLD\."status" IS NOT DISTINCT FROM NEW\."status" THEN\s+RETURN NULL;/u,
  );
  assert.match(
    eventCheck,
    /INTO STRICT final_delivery[\s\S]*FROM public\."GuestGameDelivery" AS delivery[\s\S]*event\."transitionRevision" = final_delivery\."transitionRevision"[\s\S]*final_events <> 1 OR matching_final_events <> 1[\s\S]*Final delivery state requires exactly one matching immutable durable event/u,
  );
  assert.match(
    eventCheck,
    /event\."eventType" = 'DELIVERY_RETRIED'[\s\S]*final_delivery\."stateReasonCode" IS NULL[\s\S]*event\."stateReasonCode" IS NOT NULL/u,
  );
  assert.match(
    sql,
    /REVOKE ALL\s+ON FUNCTION public\."guest_game_delivery_transition_key_v1"\([\s\S]*\)\s+FROM PUBLIC;/u,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE\s+ON FUNCTION public\."guest_game_delivery_transition_key_v1"\([\s\S]*\)\s+TO PUBLIC;/u,
  );
  assert.match(
    sql,
    /guest_game_delivery_transition_key_v1"\(\s*tenant_id TEXT,\s*delivery_id TEXT,\s*reward_id TEXT,\s*transition_revision BIGINT,[\s\S]*'transitionRevision', transition_revision/u,
  );
  assert.match(
    sql,
    /CREATE CONSTRAINT TRIGGER "GuestGameDelivery_transition_event_check"[\s\S]*DEFERRABLE INITIALLY DEFERRED[\s\S]*EXECUTE FUNCTION public\."guest_game_delivery_transition_event_check"\(\);/u,
  );
  assert.match(
    sql,
    /AFTER UPDATE OF[\s\S]*"transitionRevision",[\s\S]*"stateReasonCode",[\s\S]*"integrityReasonCode"[\s\S]*OLD\."transitionRevision" IS DISTINCT FROM NEW\."transitionRevision"[\s\S]*OLD\."stateReasonCode" IS DISTINCT FROM NEW\."stateReasonCode"[\s\S]*OLD\."integrityReasonCode" IS DISTINCT FROM NEW\."integrityReasonCode"/u,
  );
});

test("delivery attempts are insert-validated and fully append-only pending bounded retention", async () => {
  const { sql } = await artifacts();
  const body = functionBlock(sql, "guest_game_delivery_attempt_append_only");
  assert.match(
    body,
    /IF TG_OP = 'INSERT' THEN[\s\S]*INTO STRICT delivery_record[\s\S]*FROM public\."GuestGameDelivery"/u,
  );
  for (const field of [
    "rewardId",
    "storeId",
    "channel",
    "claimGeneration",
    "attempts",
    "claimJobKind",
    "executionRevision",
    "storeExecutionRevision",
    "claimKeyVersion",
    "claimOwnerDigest",
    "claimTokenDigest",
    "claimedAt",
    "leaseExpiresAt",
    "acknowledgeUntil",
    "effectInputDigest",
    "providerConfigDigest",
    "providerAuthorityRevision",
    "workloadIdentityDigest",
    "providerAttemptKey",
    "providerAttemptedAt",
    "sendGrantDigest",
    "sendGrantExpiresAt",
  ]) {
    assert.match(
      body,
      new RegExp(`delivery_record\\."${field}"`, "u"),
      `Attempt INSERT validation no longer binds ${field}.`,
    );
  }
  assert.match(
    body,
    /Attempt does not match the current delivery provider marker[\s\S]*ERRCODE = '23514'/u,
  );
  assert.doesNotMatch(body, /CURRENT_USER|SESSION_USER/u);
  assert.match(
    body,
    /GuestGameDeliveryAttempt evidence is append-only[\s\S]*ERRCODE = '55000'/u,
  );
  assert.doesNotMatch(body, /TG_OP = 'UPDATE'[\s\S]*RETURN (?:NEW|OLD)/u);
  assert.match(
    sql,
    /CREATE TRIGGER "GuestGameDeliveryAttempt_append_only"\s+BEFORE INSERT OR UPDATE OR DELETE ON "GuestGameDeliveryAttempt"\s+FOR EACH ROW\s+EXECUTE FUNCTION public\."guest_game_delivery_attempt_append_only"\(\);/u,
  );
  assert.match(
    sql,
    /REVOKE UPDATE, DELETE\s+ON TABLE public\."GuestGameDeliveryAttempt"\s+FROM PUBLIC;/u,
  );
});

test("delivery events validate scope and deny all updates/deletes pending bounded retention", async () => {
  const { sql } = await artifacts();
  const body = functionBlock(sql, "guest_game_delivery_event_append_only");
  assert.match(
    body,
    /IF TG_OP = 'INSERT' THEN[\s\S]*FROM public\."GuestGameDelivery" AS delivery/u,
  );
  assert.match(
    body,
    /delivery_record\."rewardId" IS DISTINCT FROM NEW\."rewardId"[\s\S]*Delivery event reward does not match its delivery/u,
  );
  assert.match(
    body,
    /delivery_record\."transitionRevision"[\s\S]*IS DISTINCT FROM NEW\."transitionRevision"[\s\S]*Durable event revision does not match its current delivery transition[\s\S]*ERRCODE = '23514'/u,
  );
  assert.match(
    body,
    /NEW\."toStatus" IS DISTINCT FROM delivery_record\."status"[\s\S]*NEW\."integrityState"[\s\S]*delivery_record\."integrityState"[\s\S]*NEW\."integrityReasonCode"[\s\S]*delivery_record\."integrityReasonCode"[\s\S]*Durable event final state does not match its current delivery/u,
  );
  assert.match(
    body,
    /NEW\."attemptId" IS NOT NULL[\s\S]*INTO STRICT attempt_record[\s\S]*FROM public\."GuestGameDeliveryAttempt"/u,
  );
  for (const field of [
    "deliveryId",
    "rewardId",
    "storeId",
    "channel",
    "claimGeneration",
    "attemptNumber",
    "claimJobKind",
    "executionRevision",
    "storeExecutionRevision",
    "claimKeyVersion",
    "claimOwnerDigest",
    "claimTokenDigest",
    "claimedAt",
    "leaseExpiresAt",
    "acknowledgeUntil",
    "effectInputDigest",
    "providerConfigDigest",
    "providerAuthorityRevision",
    "workloadIdentityDigest",
    "providerAttemptKey",
    "providerAttemptedAt",
    "sendGrantDigest",
    "sendGrantExpiresAt",
  ]) {
    assert.match(
      body,
      new RegExp(`attempt_record\\."${field}"`, "u"),
      `Event INSERT validation no longer binds attempt ${field}.`,
    );
  }
  assert.match(body, /Delivery event does not match its immutable attempt/u);
  assert.doesNotMatch(body, /CURRENT_USER|SESSION_USER/u);
  assert.match(
    body,
    /GuestGameDeliveryEvent evidence is append-only[\s\S]*ERRCODE = '55000'/u,
  );
  assert.doesNotMatch(body, /TG_OP = 'UPDATE'[\s\S]*RETURN (?:NEW|OLD)/u);
  assert.match(
    sql,
    /CREATE TRIGGER "GuestGameDeliveryEvent_append_only"\s+BEFORE INSERT OR UPDATE OR DELETE ON "GuestGameDeliveryEvent"\s+FOR EACH ROW\s+EXECUTE FUNCTION public\."guest_game_delivery_event_append_only"\(\);/u,
  );
  assert.match(
    sql,
    /REVOKE INSERT, UPDATE, DELETE\s+ON TABLE public\."GuestGameDeliveryEvent"\s+FROM PUBLIC;/u,
  );
});

test("single-reward writers acquire the canonical migration-166 lock order", async () => {
  const { sql } = await artifacts();
  const body = namedFunctionBlock(sql, "guest_game_reward_delivery_lock_v1");

  assert.match(
    body,
    /guest_game_reward_delivery_lock_v1"\(\s*tenant_id TEXT,\s*reward_id TEXT\s*\)\s+RETURNS BOOLEAN/u,
  );
  assert.match(
    body,
    /LANGUAGE plpgsql[\s\S]*VOLATILE[\s\S]*SECURITY INVOKER[\s\S]*SET search_path = pg_catalog/u,
  );
  assert.doesNotMatch(body, /SECURITY DEFINER|EXECUTE\s+format|EXECUTE\s+\w+/u);

  const advisoryLock = body.indexOf("pg_advisory_xact_lock");
  const rewardLock = body.indexOf('FROM public."GuestGameReward" AS reward');
  const deliveryLock = body.indexOf(
    'FROM public."GuestGameDelivery" AS delivery',
  );
  assert(advisoryLock >= 0);
  assert(rewardLock > advisoryLock);
  assert(deliveryLock > rewardLock);
  assert.match(
    body,
    /hashtextextended\(tenant_id \|\| ':' \|\| reward_id, 166\)/u,
  );
  assert.match(
    body,
    /FROM public\."GuestGameReward" AS reward[\s\S]*WHERE reward\."id" = reward_id[\s\S]*reward\."tenantId" = tenant_id[\s\S]*FOR UPDATE;/u,
  );
  assert.match(
    body,
    /reward does not exist in requested tenant[\s\S]*ERRCODE = '23503'/u,
  );
  assert.doesNotMatch(body, /reward\."id" = reward_id\s+FOR UPDATE/u);
  assert.match(
    body,
    /FROM public\."GuestGameDelivery" AS delivery[\s\S]*delivery\."tenantId" = tenant_id[\s\S]*delivery\."rewardId" = reward_id[\s\S]*delivery\."channel" IN \('TELEGRAM', 'MAX'\)[\s\S]*delivery\."integrityState" = 'VERIFIED'[\s\S]*ORDER BY delivery\."id"[\s\S]*FOR UPDATE;/u,
  );
  assert.match(
    sql,
    /REVOKE ALL\s+ON FUNCTION public\."guest_game_reward_delivery_lock_v1"\(TEXT, TEXT\)\s+FROM PUBLIC;/u,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE\s+ON FUNCTION public\."guest_game_reward_delivery_lock_v1"\(TEXT, TEXT\)\s+TO PUBLIC;/u,
  );
});

test("runtime durable events use one private SECURITY DEFINER boundary", async () => {
  const { sql } = await artifacts();
  const body = namedFunctionBlock(sql, "guest_game_delivery_record_event_v1");

  assert.match(
    body,
    /guest_game_delivery_record_event_v1"\(\s*event_payload JSON\s*\)\s+RETURNS JSONB/u,
  );
  assert.match(body, /LANGUAGE plpgsql[\s\S]*VOLATILE[\s\S]*SECURITY DEFINER/u);
  assert.match(body, /SET search_path = pg_catalog/u);
  assert.doesNotMatch(body, /EXECUTE\s+format|EXECUTE\s+\w+/u);
  assert.match(
    body,
    /json_typeof\(event_payload\) <> 'object'[\s\S]*payload must be a JSON object/u,
  );
  assert.match(
    body,
    /count\(\*\)[\s\S]*count\(DISTINCT key_row\.key\)[\s\S]*payload contains duplicate keys/u,
  );
  assert.match(
    body,
    /json_object_keys\(event_payload\)[\s\S]*payload contains unsupported key/u,
  );
  for (const serverOwnedKey of [
    "id",
    "transitionKey",
    "createdAt",
    "actorUserId",
  ]) {
    assert.doesNotMatch(
      body.slice(
        body.indexOf("WHERE key_row.key NOT IN"),
        body.indexOf("ORDER BY key_row.key"),
      ),
      new RegExp(`'${serverOwnedKey}'`, "u"),
      `${serverOwnedKey} must remain server-owned.`,
    );
  }
  for (const eventType of DURABLE_EVENT_TYPES) {
    assert.match(body, new RegExp(`'${eventType}'`, "u"));
  }
  assert.match(
    body,
    /transitionRevision" IS NULL[\s\S]*transitionRevision" <= 0[\s\S]*revision must be positive/u,
  );
  assert.match(
    body,
    /provenanceDigest" IS NULL[\s\S]*\^\[0-9a-f\]\{64\}\$[\s\S]*provenance digest must be 64 lowercase hex characters/u,
  );
  assert.match(
    body,
    /FROM public\."GuestGameDelivery" AS delivery[\s\S]*FOR UPDATE;/u,
  );
  assert.match(
    body,
    /delivery_record\."transitionRevision"[\s\S]*event_record\."transitionRevision"[\s\S]*does not match the current delivery revision/u,
  );
  assert.match(
    body,
    /delivery_record\."storeId"[\s\S]*event_record\."storeId"[\s\S]*delivery_record\."channel"[\s\S]*event_record\."channel"[\s\S]*does not match the current delivery scope/u,
  );
  assert.match(
    body,
    /FROM public\."GuestGameDeliveryEvent" AS existing_event[\s\S]*already exists for the current delivery revision[\s\S]*ERRCODE = '23505'/u,
  );
  assert.match(body, /pg_catalog\.gen_random_uuid\(\)::TEXT/u);
  assert.match(
    body,
    /guest_game_delivery_transition_key_v1"[\s\S]*INSERT INTO public\."GuestGameDeliveryEvent"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL\s+ON FUNCTION public\."guest_game_delivery_record_event_v1"\(JSON\)\s+FROM PUBLIC;/u,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE[\s\S]*TO PUBLIC;/u,
    "Migration 166 must leave zero PUBLIC-executable functions.",
  );
});
