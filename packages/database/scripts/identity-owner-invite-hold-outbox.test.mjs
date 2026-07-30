import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../prisma/migrations/20260730010000_identity_owner_invite_hold_outbox/migration.sql",
  import.meta.url,
);
const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);
const upgradeSmokeUrl = new URL(
  "./identity-owner-invite-hold-outbox-upgrade-smoke.mjs",
  import.meta.url,
);
const NEW_COLUMN_MANIFEST = Object.freeze({
  IdentityOwnerInviteIssueCommand: Object.freeze([
    "id",
    "tenantId",
    "action",
    "requestId",
    "issueRequestDigest",
    "aadEnvironment",
    "workflowLocator",
    "reservationSubjectId",
    "reservationClaimRevision",
    "inviteId",
    "outboxId",
    "messageKey",
    "tokenHash",
    "tokenDigestVersion",
    "template",
    "envelopeVersion",
    "keyVersion",
    "expiresAt",
    "claimRevision",
    "createdAt",
  ]),
  IdentityMailOutbox: Object.freeze([
    "id",
    "tenantId",
    "issueCommandId",
    "inviteId",
    "workflowLocator",
    "aadEnvironment",
    "template",
    "status",
    "messageKey",
    "issueRequestDigest",
    "tokenHash",
    "tokenDigestVersion",
    "secretCiphertext",
    "envelopeVersion",
    "keyVersion",
    "expiresAt",
    "createdAt",
  ]),
});

async function migrationSql() {
  return readFile(migrationUrl, "utf8");
}

async function prismaSchema() {
  return readFile(schemaUrl, "utf8");
}

async function upgradeSmokeSource() {
  return readFile(upgradeSmokeUrl, "utf8");
}

function functionBody(sql, functionName, nextMarker) {
  const start = sql.indexOf(`CREATE FUNCTION public."${functionName}"`);
  assert.notEqual(start, -1, `${functionName} is missing`);
  const end = sql.indexOf(nextMarker, start);
  assert.notEqual(end, -1, `${functionName} end marker is missing`);
  return sql.slice(start, end);
}

function receiptBodies(functionSql) {
  return [
    ...functionSql.matchAll(
      /receipt := pg_catalog\.jsonb_build_object\(([\s\S]*?)\n\s{2,4}\);/gu,
    ),
  ].map((match) => match[1]);
}

test("CURRENT_171 HOLD outbox migration is additive, dormant, and transactional", async () => {
  const sql = await migrationSql();

  assert.match(sql, /^BEGIN;/mu);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/u);
  assert.match(sql, /SET LOCAL statement_timeout = '120s';/u);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.doesNotMatch(sql, /^\s*GRANT\b/imu);
  assert.doesNotMatch(sql, /\bDROP\s+(?:TABLE|COLUMN|FUNCTION|TYPE)\b/iu);
  assert.doesNotMatch(sql, /\bEXECUTE\s+(?:FORMAT|\()/iu);
  assert.doesNotMatch(
    sql,
    /\b(?:smtp|nodemailer|sendmail|registrationUrl)\b/iu,
  );
});

test("creates immutable command authority and an encrypted HOLD-only outbox", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /CREATE TYPE public\."IdentityMailTemplate" AS ENUM \(\s*'INITIAL_OWNER_INVITE'\s*\)/u,
  );
  assert.match(
    sql,
    /CREATE TYPE public\."IdentityMailOutboxStatus" AS ENUM \(\s*'HOLD'\s*\)/u,
  );
  assert.match(sql, /CREATE TABLE public\."IdentityOwnerInviteIssueCommand"/u);
  assert.match(sql, /CREATE TABLE public\."IdentityMailOutbox"/u);
  assert.match(
    sql,
    /"action" VARCHAR\(64\) NOT NULL DEFAULT 'ISSUE_INITIAL_OWNER_INVITE'/u,
  );
  assert.match(
    sql,
    /"issueRequestDigest" VARCHAR\(64\) NOT NULL[\s\S]*"aadEnvironment" VARCHAR\(64\) NOT NULL[\s\S]*"workflowLocator" TEXT NOT NULL/u,
  );
  assert.match(
    sql,
    /"tokenDigestVersion" VARCHAR\(16\) NOT NULL DEFAULT 'sha256-v1'[\s\S]*"envelopeVersion" INTEGER NOT NULL DEFAULT 1[\s\S]*"keyVersion" VARCHAR\(16\) NOT NULL DEFAULT 'v1'/u,
  );
  assert.match(
    sql,
    /"status" public\."IdentityMailOutboxStatus" NOT NULL DEFAULT 'HOLD'/u,
  );
  assert.match(sql, /pg_catalog\.octet_length\("secretCiphertext"\) = 71/u);
  assert.match(
    sql,
    /"aadEnvironment" =[\s\S]*'\^\[a-z0-9\]\[a-z0-9\._-\]\{0,63\}\$'/u,
  );
  assert.match(
    sql,
    /"issueRequestDigest" COLLATE "C"\) ~ '\^\[0-9a-f\]\{64\}\$'/u,
  );
  assert.match(sql, /"tokenHash" COLLATE "C"\) ~ '\^\[0-9a-f\]\{64\}\$'/u);
  assert.match(
    sql,
    /"expiresAt" > "createdAt"[\s\S]*"expiresAt" <= "createdAt" \+ INTERVAL '30 days'/u,
  );
});

test("uses tenant-safe composite provenance relations", async () => {
  const sql = await migrationSql();
  const schema = await prismaSchema();

  assert.match(
    sql,
    /CREATE UNIQUE INDEX "UserInvite_tenantId_id_key"[\s\S]*\("tenantId", "id"\)/u,
  );
  assert.match(
    sql,
    /FOREIGN KEY \("tenantId", "inviteId"\)[\s\S]*REFERENCES public\."UserInvite" \("tenantId", "id"\)[\s\S]*ON DELETE RESTRICT[\s\S]*ON UPDATE RESTRICT/u,
  );
  assert.match(
    sql,
    /FOREIGN KEY \("tenantId", "issueCommandId"\)[\s\S]*REFERENCES public\."IdentityOwnerInviteIssueCommand" \("tenantId", "id"\)/u,
  );
  assert.match(
    sql,
    /identity_owner_invite_issue_command_request_uidx"[\s\S]*"tenantId",[\s\S]*"action",[\s\S]*"requestId"/u,
  );

  assert.match(
    schema,
    /enum IdentityMailTemplate \{\s*INITIAL_OWNER_INVITE\s*\}/u,
  );
  assert.match(
    schema,
    /enum IdentityMailOutboxStatus \{\s*HOLD\s+PENDING\s*\}/u,
  );
  assert.match(schema, /model IdentityOwnerInviteIssueCommand \{/u);
  assert.match(schema, /model IdentityMailOutbox \{/u);
  assert.match(
    schema,
    /@@unique\(\[tenantId, id\], map: "UserInvite_tenantId_id_key"\)/u,
  );
  assert.match(
    schema,
    /issueCommand\s+IdentityOwnerInviteIssueCommand\s+@relation\("IdentityOwnerInviteIssueCommandOutbox", fields: \[tenantId, issueCommandId\], references: \[tenantId, id\], onDelete: Restrict, onUpdate: Restrict, map: "IdentityMailOutbox_issueCommand_fkey"\)/u,
  );
  assert.match(
    schema,
    /invite\s+UserInvite\s+@relation\("IdentityMailOutboxInvite", fields: \[tenantId, inviteId\], references: \[tenantId, id\], onDelete: Restrict, onUpdate: Restrict, map: "IdentityMailOutbox_invite_fkey"\)/u,
  );
});

test("defines the exact private RPC without a raw token or caller actor fields", async () => {
  const sql = await migrationSql();
  const body = functionBody(
    sql,
    "identity_owner_invite_issue_hold_v1",
    'COMMENT ON FUNCTION public."identity_owner_invite_issue_hold_v1"',
  );
  const signature = body.slice(0, body.indexOf("RETURNS JSONB"));

  assert.match(
    body,
    /requested_workflow_locator TEXT[\s\S]*expected_tenant_id TEXT[\s\S]*expected_reservation_subject_id TEXT[\s\S]*expected_claim_revision INTEGER[\s\S]*issue_request_id TEXT[\s\S]*issue_request_digest TEXT[\s\S]*requested_aad_environment TEXT[\s\S]*candidate_command_id TEXT[\s\S]*candidate_invite_id TEXT[\s\S]*candidate_outbox_id TEXT[\s\S]*candidate_message_key TEXT[\s\S]*candidate_token_hash TEXT[\s\S]*candidate_secret_ciphertext BYTEA[\s\S]*candidate_expires_at TIMESTAMP\(3\) WITH TIME ZONE/u,
  );
  assert.match(body, /RETURNS JSONB[\s\S]*SECURITY DEFINER/u);
  assert.match(body, /SET search_path = pg_catalog/u);
  assert.doesNotMatch(
    signature,
    /\b(?:raw_token|rawToken|candidate_email|actor_user_id|reason)\b/u,
  );
  assert.doesNotMatch(
    body,
    /FROM public\."Tenant"|UPDATE public\."Tenant"|FOR UPDATE OF .*Tenant/iu,
  );
});

test("locks request, discovers replay, then locks and rechecks canonical claim", async () => {
  const sql = await migrationSql();
  const body = functionBody(
    sql,
    "identity_owner_invite_issue_hold_v1",
    'COMMENT ON FUNCTION public."identity_owner_invite_issue_hold_v1"',
  );

  const requestLock = body.indexOf("pg_catalog.pg_advisory_xact_lock");
  const replayLookup = body.indexOf(
    'FROM public."IdentityOwnerInviteIssueCommand" AS command',
  );
  const locatorDiscovery = body.indexOf(
    'SELECT claim."emailCanonical"',
    replayLookup,
  );
  const emailLock = body.indexOf(
    'public."identity_email_claim_lock_v1"',
    locatorDiscovery,
  );
  const claimRowLock = body.indexOf("FOR UPDATE", emailLock);

  assert.ok(requestLock >= 0 && requestLock < replayLookup);
  assert.ok(replayLookup < locatorDiscovery);
  assert.ok(locatorDiscovery < emailLock);
  assert.ok(emailLock < claimRowLock);
  assert.doesNotMatch(
    body.slice(locatorDiscovery, emailLock),
    /FOR\s+(?:UPDATE|SHARE)/iu,
  );
  assert.match(
    body,
    /hashtextextended\([\s\S]*'identity-owner-invite-issue:v1:' \|\| tenant_id \|\| ':' \|\| request_id,[\s\S]*171/u,
  );
});

test("replay exact-binds authority but ignores newly generated ephemeral candidates", async () => {
  const sql = await migrationSql();
  const body = functionBody(
    sql,
    "identity_owner_invite_issue_hold_v1",
    'COMMENT ON FUNCTION public."identity_owner_invite_issue_hold_v1"',
  );

  const replayLookup = body.indexOf(
    'FROM public."IdentityOwnerInviteIssueCommand" AS command',
  );
  const authorityConflict = body.indexOf(
    "Initial owner invite request conflicts with authority",
  );
  const replayReturn = body.indexOf(
    "RETURN pg_catalog.jsonb_set(",
    authorityConflict,
  );
  const ephemeralValidation = body.indexOf(
    "-- Ephemeral values are validated only after replay has been ruled out.",
  );

  assert.ok(replayLookup < authorityConflict);
  assert.match(
    body.slice(replayLookup, ephemeralValidation),
    /"issueRequestDigest" IS DISTINCT FROM request_digest[\s\S]*"aadEnvironment" IS DISTINCT FROM aad_environment[\s\S]*"workflowLocator" IS DISTINCT FROM workflow_locator[\s\S]*"reservationSubjectId" IS DISTINCT FROM[\s\S]*"reservationClaimRevision" IS DISTINCT FROM/u,
  );
  assert.ok(
    replayReturn > authorityConflict && replayReturn < ephemeralValidation,
  );
  assert.ok(
    ephemeralValidation < body.indexOf("command_id :=", ephemeralValidation),
  );
  assert.match(
    body,
    /IF command_found THEN[\s\S]*claim\."subjectId" = command_record\."inviteId"[\s\S]*claim\."revision" = command_record\."claimRevision"/u,
  );
});

test("first issue hard-codes OWNER NETWORK and atomically advances provenance", async () => {
  const sql = await migrationSql();
  const body = functionBody(
    sql,
    "identity_owner_invite_issue_hold_v1",
    'COMMENT ON FUNCTION public."identity_owner_invite_issue_hold_v1"',
  );

  assert.match(
    body,
    /INSERT INTO public\."UserInvite"[\s\S]*locked_canonical_email[\s\S]*'OWNER'::public\."UserRole"[\s\S]*'NETWORK'::public\."UserAccessScope"[\s\S]*ARRAY\[\]::TEXT\[\][\s\S]*token_hash/u,
  );
  assert.match(body, /INSERT INTO public\."IdentityOwnerInviteIssueCommand"/u);
  assert.match(
    body,
    /INSERT INTO public\."IdentityMailOutbox"[\s\S]*'INITIAL_OWNER_INVITE'::public\."IdentityMailTemplate"[\s\S]*'HOLD'::public\."IdentityMailOutboxStatus"[\s\S]*candidate_secret_ciphertext[\s\S]*1,[\s\S]*'v1'/u,
  );
  assert.match(
    body,
    /UPDATE public\."IdentityEmailClaim"[\s\S]*"subjectId" = invite_id[\s\S]*"revision" = expected_claim_revision \+ 1[\s\S]*WHERE "emailCanonical" = locked_canonical_email[\s\S]*"workflowLocator" = workflow_locator/u,
  );
  assert.match(
    body,
    /INSERT INTO public\."PlatformAdminAuditEvent"[\s\S]*NULL,[\s\S]*request_id,[\s\S]*fixed_action,[\s\S]*'UserInvite'[\s\S]*receipt/u,
  );
  assert.match(body, /candidate_expires_at AT TIME ZONE 'UTC'/u);
  assert.match(
    body,
    /invite_record\."expiresAt" IS DISTINCT FROM[\s\S]*command_record\."expiresAt" AT TIME ZONE 'UTC'/u,
  );
  assert.match(
    body,
    /EXCEPTION[\s\S]*WHEN unique_violation THEN[\s\S]*ERRCODE = '23505'[\s\S]*WHEN foreign_key_violation THEN[\s\S]*ERRCODE = '23503'[\s\S]*WHEN check_violation OR not_null_violation THEN[\s\S]*ERRCODE = '23514'/u,
  );
});

test("returns and audits only the exact PII-free stable receipt", async () => {
  const sql = await migrationSql();
  const body = functionBody(
    sql,
    "identity_owner_invite_issue_hold_v1",
    'COMMENT ON FUNCTION public."identity_owner_invite_issue_hold_v1"',
  );
  const receipts = receiptBodies(body);

  assert.equal(receipts.length, 2);
  for (const receipt of receipts) {
    const keys = [...receipt.matchAll(/^\s*'([^']+)',/gmu)].map(
      (match) => match[1],
    );
    assert.deepEqual(keys, [
      "schemaVersion",
      "operation",
      "decision",
      "tenantId",
      "commandId",
      "inviteId",
      "outboxId",
      "claimType",
      "claimRevision",
      "role",
      "accessScope",
      "outboxStatus",
    ]);
    assert.match(receipt, /'schemaVersion', 1/u);
    assert.match(receipt, /'operation', 'ISSUE_DORMANT_OWNER_INVITE'/u);
    assert.match(receipt, /'decision', 'CREATED'/u);
    assert.match(receipt, /'tenantId'/u);
    assert.match(receipt, /'commandId'/u);
    assert.match(receipt, /'inviteId'/u);
    assert.match(receipt, /'outboxId'/u);
    assert.match(receipt, /'claimType', 'INVITE'/u);
    assert.match(receipt, /'claimRevision'/u);
    assert.match(receipt, /'role', 'OWNER'/u);
    assert.match(receipt, /'accessScope', 'NETWORK'/u);
    assert.match(receipt, /'outboxStatus', 'HOLD'/u);
    assert.doesNotMatch(
      receipt,
      /email|workflowLocator|tokenHash|secretCiphertext|messageKey|requestDigest|aadEnvironment|keyVersion/iu,
    );
  }
  assert.match(
    body,
    /RETURN pg_catalog\.jsonb_set\([\s\S]*receipt,[\s\S]*'\{decision\}',[\s\S]*'"REPLAYED"'::JSONB,[\s\S]*false/u,
  );
  assert.match(
    body,
    /"after"[\s\S]*"metadata"[\s\S]*receipt,[\s\S]*pg_catalog\.jsonb_build_object\([\s\S]*'authority', 'IdentityOwnerInviteIssueCommand'/u,
  );
});

test("keeps command, outbox, triggers, and RPC private and immutable", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /CREATE TRIGGER "IdentityOwnerInviteIssueCommand_immutable_trigger"[\s\S]*BEFORE UPDATE OR DELETE/u,
  );
  assert.match(
    sql,
    /CREATE TRIGGER "IdentityMailOutbox_hold_immutable_trigger"[\s\S]*BEFORE UPDATE OR DELETE/u,
  );
  assert.match(
    sql,
    /Initial owner invite issue command is immutable[\s\S]*ERRCODE = '55000'/u,
  );
  assert.match(
    sql,
    /Dormant identity mail HOLD outbox is immutable[\s\S]*ERRCODE = '55000'/u,
  );
  assert.match(
    sql,
    /REVOKE ALL[\s\S]*identity_owner_invite_issue_hold_v1[\s\S]*FROM PUBLIC;/u,
  );
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\."IdentityOwnerInviteIssueCommand" FROM PUBLIC;/u,
  );
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\."IdentityMailOutbox" FROM PUBLIC;/u,
  );
});

test("fails closed on non-owner table, exact-column, or function ACL", async () => {
  const sql = await migrationSql();
  const publicTableRevoke = sql.indexOf(
    'REVOKE ALL ON TABLE public."IdentityMailOutbox" FROM PUBLIC;',
  );
  const ownerOnlyAssertion = sql.indexOf("DO $owner_only_acl$");
  const commit = sql.lastIndexOf("COMMIT;");

  assert.ok(publicTableRevoke >= 0 && publicTableRevoke < ownerOnlyAssertion);
  assert.ok(ownerOnlyAssertion < commit);
  const assertionSql = sql.slice(ownerOnlyAssertion, commit);
  const expectedColumns = Object.entries(NEW_COLUMN_MANIFEST).flatMap(
    ([tableName, columns]) =>
      columns.map((columnName) => `('${tableName}', '${columnName}')`),
  );
  assert.equal(expectedColumns.length, 37);
  for (const columnEntry of expectedColumns) {
    assert.equal(
      assertionSql.split(columnEntry).length - 1,
      1,
      `${columnEntry} must occur exactly once in the ACL inventory`,
    );
  }
  assert.match(
    sql,
    /guarded_table_count <> 2[\s\S]*guarded_column_count <> 37[\s\S]*expected_column_count <> 37[\s\S]*guarded_function_count <> 3[\s\S]*Identity owner invite ACL inventory is incomplete[\s\S]*ERRCODE = '55000'/u,
  );
  assert.match(
    sql,
    /relation\.relname IN \([\s\S]*'IdentityOwnerInviteIssueCommand'[\s\S]*'IdentityMailOutbox'[\s\S]*\)[\s\S]*acl\.grantee <> relation\.relowner/u,
  );
  assert.match(
    sql,
    /procedure\.proname IN \([\s\S]*'identity_owner_invite_issue_command_immutable_v1'[\s\S]*'identity_mail_outbox_hold_immutable_v1'[\s\S]*'identity_owner_invite_issue_hold_v1'[\s\S]*\)[\s\S]*acl\.grantee <> procedure\.proowner/u,
  );
  assert.match(
    sql,
    /pg_catalog\.aclexplode\([\s\S]*COALESCE\([\s\S]*relation\.relacl,[\s\S]*pg_catalog\.acldefault\('r', relation\.relowner\)/u,
  );
  assert.match(
    sql,
    /FROM pg_catalog\.pg_attribute AS attribute[\s\S]*attribute\.attnum > 0[\s\S]*NOT attribute\.attisdropped/u,
  );
  assert.match(
    sql,
    /pg_catalog\.aclexplode\(attribute\.attacl\)[\s\S]*acl\.grantee <> relation\.relowner/u,
  );
  assert.match(
    sql,
    /pg_catalog\.aclexplode\([\s\S]*COALESCE\([\s\S]*procedure\.proacl,[\s\S]*pg_catalog\.acldefault\('f', procedure\.proowner\)/u,
  );
  assert.match(
    sql,
    /unsafe_acl_count <> 0[\s\S]*Identity owner invite objects require owner-only ACL[\s\S]*ERRCODE = '55000'/u,
  );
});

test("documents enum USAGE as non-authorizing metadata rather than an ACL shortcut", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /COMMENT ON TYPE public\."IdentityMailTemplate" IS[\s\S]*Enum USAGE permits constructing typed values only\. It grants no table access, RPC execution, or owner-invite authority\./u,
  );
  assert.match(
    sql,
    /COMMENT ON TYPE public\."IdentityMailOutboxStatus" IS[\s\S]*Enum USAGE permits constructing typed values only\. It grants no table access, RPC execution, or mail-delivery authority\./u,
  );
  assert.doesNotMatch(
    sql,
    /GRANT\s+(?:USAGE|ALL)[\s\S]*ON TYPE public\."IdentityMail/iu,
  );
});

test("real rehearsal injects hostile defaults, proves rollback, and retries safely", async () => {
  const source = await upgradeSmokeSource();

  assert.match(
    source,
    /ALTER DEFAULT PRIVILEGES IN SCHEMA public[\s\S]*SELECT ON TABLES/u,
  );
  assert.match(
    source,
    /ALTER DEFAULT PRIVILEGES IN SCHEMA public[\s\S]*EXECUTE ON FUNCTIONS/u,
  );
  const enableDefaults = source.indexOf(
    "await setUnsafeDefaultPrivileges(",
    source.indexOf("async function runRealSmoke"),
  );
  const expectedFailure = source.indexOf(
    "expectMigrateDeployFailure(",
    enableDefaults,
  );
  const rollbackAssertion = source.indexOf(
    "await assertTargetMigrationRolledBack(",
    expectedFailure,
  );
  const disableDefaults = source.indexOf(
    "await setUnsafeDefaultPrivileges(",
    rollbackAssertion,
  );
  const resolveFailure = source.indexOf(
    "runMigrateResolveRolledBack(",
    disableDefaults,
  );
  const successfulRetry = source.indexOf(
    "runMigrateDeploy(artifact.schemaPath, hostileAclUrl);",
    resolveFailure,
  );

  assert.ok(enableDefaults >= 0 && enableDefaults < expectedFailure);
  assert.ok(expectedFailure < rollbackAssertion);
  assert.ok(rollbackAssertion < disableDefaults);
  assert.ok(disableDefaults < resolveFailure);
  assert.ok(resolveFailure < successfulRetry);
  for (const objectName of [
    "IdentityOwnerInviteIssueCommand",
    "IdentityMailOutbox",
    "UserInvite_tenantId_id_key",
    "identity_owner_invite_issue_command_immutable_v1",
    "identity_mail_outbox_hold_immutable_v1",
    "IdentityMailTemplate",
    "IdentityMailOutboxStatus",
  ]) {
    assert.ok(source.includes(objectName));
  }
  assert.match(
    source,
    /pg_catalog\.to_regprocedure\(\$1\)::text AS issue_rpc/u,
  );
  assert.match(
    source,
    /assert\.deepEqual\([\s\S]*await readSourceMigrationState\(admin\),[\s\S]*sourceMigrationState/u,
  );
  assert.match(source, /generatedDatabaseCount: 3/u);
  assert.match(source, /generatedRoleCount: 3/u);
});

test("real rehearsal rejects a column-only grant injected into the exact migration", async () => {
  const source = await upgradeSmokeSource();

  assert.match(
    source,
    /CREATE EVENT TRIGGER[\s\S]*ON ddl_command_end[\s\S]*WHEN TAG IN \('CREATE TABLE'\)/u,
  );
  assert.match(
    source,
    /pg_catalog\.pg_event_trigger_ddl_commands\(\)[\s\S]*IdentityOwnerInviteIssueCommand[\s\S]*GRANT SELECT \("tokenHash"\) ON TABLE/u,
  );
  assert.match(
    source,
    /await assertUnsafeDefaultPrivileges\([\s\S]*false,[\s\S]*\);[\s\S]*await installUnsafeColumnAclInjector\(/u,
  );
  assert.match(
    source,
    /await installUnsafeColumnAclInjector\([\s\S]*expectMigrateDeployFailure\([\s\S]*await assertTargetMigrationRolledBack\([\s\S]*await assertUnsafeColumnAclInjector\([\s\S]*true[\s\S]*await dropUnsafeColumnAclInjector\([\s\S]*await assertUnsafeColumnAclInjector\([\s\S]*false/u,
  );
  assert.match(
    source,
    /hostileColumnAcl:[\s\S]*columnOnlyGrantRejected: true,[\s\S]*exactColumnInventoryCount: 37,[\s\S]*failedMigrationRolledBack: true,[\s\S]*injectorRemoved: true,[\s\S]*normalRetrySucceeded: true/u,
  );
});

test("real rehearsal checks effective and direct ACL for every new column", async () => {
  const source = await upgradeSmokeSource();

  assert.match(
    source,
    /NEW_SEALED_COLUMN_MANIFEST[\s\S]*IdentityOwnerInviteIssueCommand[\s\S]*IdentityMailOutbox/u,
  );
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) {
    assert.match(
      source,
      new RegExp(`has_column_privilege\\([\\s\\S]*'${privilege}'`, "u"),
    );
  }
  assert.match(
    source,
    /assertRoleHasNoEffectiveNewColumnPrivileges\([\s\S]*roles\.appRoleName[\s\S]*assertRoleHasNoEffectiveNewColumnPrivileges\([\s\S]*roles\.issuerRoleName/u,
  );
  assert.match(
    source,
    /assertRoleHasNoEffectiveNewColumnPrivileges\([\s\S]*role\.roleName/u,
  );
  assert.match(
    source,
    /attribute\.attacl[\s\S]*direct_non_owner_acl_count[\s\S]*acl\.grantee = 0[\s\S]*direct_public_acl_count/u,
  );
});

test("real rehearsal synchronizes different requests for one locator", async () => {
  const source = await upgradeSmokeSource();

  assert.match(
    source,
    /pg_try_advisory_lock\([\s\S]*pg_advisory_xact_lock_shared\(/u,
  );
  assert.match(source, /waiter_count === 2[\s\S]*pg_advisory_unlock\(/u);
  assert.match(
    source,
    /requestId: randomUUID\(\),[\s\S]*requestDigest: randomBytes\(32\)[\s\S]*commandId: randomUUID\(\),[\s\S]*inviteId: randomUUID\(\),[\s\S]*outboxId: randomUUID\(\)/u,
  );
  assert.match(
    source,
    /fulfilled\.length, 1[\s\S]*rejected\.length, 1[\s\S]*assertNoAggregate\(verifier, inputs\[loser\.index\]\)/u,
  );
  assert.match(
    source,
    /return \{[\s\S]*contenders: 2,[\s\S]*barrierWaiters: 2,[\s\S]*created: 1,[\s\S]*genericConflicts: 1,[\s\S]*partialLoserAggregates: 0,[\s\S]*deadlocks: 0,[\s\S]*\};/u,
  );
  assert.match(
    source,
    /const locatorConcurrency =[\s\S]*assertDifferentRequestSameLocatorConcurrency\([\s\S]*evidence = \{[\s\S]*locatorConcurrency,/u,
  );
});

test("real rehearsal proves public enum USAGE cannot read tables or execute issue RPC", async () => {
  const source = await upgradeSmokeSource();

  assert.match(
    source,
    /has_type_privilege\([\s\S]*IdentityMailTemplate[\s\S]*'USAGE'[\s\S]*has_type_privilege\([\s\S]*IdentityMailOutboxStatus[\s\S]*'USAGE'/u,
  );
  assert.match(
    source,
    /template_usage: true,[\s\S]*status_usage: true,[\s\S]*issue_execute: false/u,
  );
  assert.match(
    source,
    /await assertRoleHasNoTablePrivileges\(admin, role\.roleName\)/u,
  );
  assert.match(
    source,
    /await expectPermissionDenied\(\(\) => issue\(roleClient, probeInput\)\)/u,
  );
});
