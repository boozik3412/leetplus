import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../prisma/migrations/20260730030000_identity_mail_outbox_pending_enum_expand/migration.sql",
  import.meta.url,
);
const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);

test("CURRENT_173 expands the outbox enum in an isolated transaction", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /^BEGIN;/u);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/u);
  assert.match(sql, /SET LOCAL statement_timeout = '30s';/u);
  assert.match(
    sql,
    /ALTER TYPE public\."IdentityMailOutboxStatus"\s+ADD VALUE 'PENDING' AFTER 'HOLD';/u,
  );
  assert.match(sql, /ARRAY\['HOLD'\]::TEXT\[\]/u);
  assert.match(sql, /ARRAY\['HOLD', 'PENDING'\]::TEXT\[\]/u);
  assert.match(sql, /COMMIT;\s*$/u);
});

test("CURRENT_173 grants no transition, delivery, or table authority", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.doesNotMatch(sql, /^\s*(?:GRANT|REVOKE)\b/imu);
  assert.doesNotMatch(sql, /^\s*(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/imu);
  assert.doesNotMatch(
    sql,
    /^\s*(?:CREATE|ALTER|DROP)\s+(?:TABLE|FUNCTION|TRIGGER|POLICY)\b/imu,
  );
  assert.doesNotMatch(sql, /\bHOLD\s*(?:-|=)>\s*PENDING\b/iu);
  assert.doesNotMatch(sql, /\b(?:smtp|nodemailer|sendmail|worker)\b/iu);
});

test("Prisma exposes PENDING only as the additive enum label", async () => {
  const schema = await readFile(schemaUrl, "utf8");
  const match = schema.match(/enum IdentityMailOutboxStatus \{([\s\S]*?)\n\}/u);

  assert(match, "IdentityMailOutboxStatus is missing");
  const labels = match[1]
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  assert.deepEqual(labels, ["HOLD", "PENDING"]);
});
