import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(
  new URL(
    "../prisma/migrations/20260818010000_founder_owner_invite_reissue_v1/migration.sql",
    import.meta.url,
  ),
);
const schemaPath = fileURLToPath(
  new URL("../prisma/schema.prisma", import.meta.url),
);
const servicePath = fileURLToPath(
  new URL(
    "../../../apps/api/src/admin/founder-owner-invite-lifecycle.service.ts",
    import.meta.url,
  ),
);

const [migration, schema, service] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(schemaPath, "utf8"),
  readFile(servicePath, "utf8"),
]);

test("reissue persists one immutable predecessor-to-successor authority", () => {
  assert.match(
    migration,
    /CREATE TABLE public\."FounderOwnerInviteReissueCommand"/u,
  );
  assert.match(
    migration,
    /CREATE TRIGGER "FounderOwnerInviteReissueCommand_immutable_trigger"/u,
  );
  assert.match(
    migration,
    /UNIQUE INDEX "founder_owner_invite_reissue_predecessor_uidx"/u,
  );
  assert.match(
    migration,
    /UNIQUE INDEX "founder_owner_invite_reissue_sequence_uidx"/u,
  );
  assert.match(schema, /model FounderOwnerInviteReissueCommand \{/u);
});

test("reissue creates and releases only a newly generated invite aggregate", () => {
  assert.match(
    migration,
    /PERFORM public\."identity_email_claim_reserve_invite_v2"/u,
  );
  assert.match(
    migration,
    /PERFORM public\."identity_owner_invite_issue_hold_v1"/u,
  );
  assert.match(
    migration,
    /SET "status" = 'PENDING'::public\."IdentityMailOutboxStatus"/u,
  );
  assert.match(
    migration,
    /FROM public\."FounderOwnerInviteReissueCommand" AS command[\s\S]*command\."createdTransactionId" = pg_catalog\.pg_current_xact_id\(\)::TEXT/u,
  );
  assert.doesNotMatch(
    migration,
    /SELECT[\s\S]{0,120}outbox_record\."secretCiphertext"/u,
  );
  assert.match(service, /Array\.from\(\{ length: 6 \}/u);
  assert.match(service, /sealInitialOwnerInviteToken\(/u);
});

test("reissue is private, tenant-locked and PII-free at the API boundary", () => {
  assert.match(
    migration,
    /CREATE FUNCTION public\."founder_owner_invite_reissue_v1"\([\s\S]*SECURITY DEFINER/u,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\."founder_owner_invite_reissue_v1"/u,
  );
  assert.match(migration, /leetplus:identity-mail-tenant:v1:/u);
  assert.match(migration, /blindResend', false/u);
  assert.doesNotMatch(service, /resendExistingToken/u);
  assert.doesNotMatch(
    service,
    /FounderOwnerInviteReissueResult[\s\S]{0,500}\bemail\b/u,
  );
});

test("reissue replay is exact and does not repeat mutations", () => {
  const replayIndex = migration.indexOf(
    "IF FOUND THEN",
    migration.indexOf(
      'FROM public."FounderOwnerInviteReissueCommand" AS command',
    ),
  );
  const firstIssueIndex = migration.indexOf(
    'PERFORM public."identity_owner_invite_issue_hold_v1"',
  );
  assert.ok(replayIndex > 0);
  assert.ok(firstIssueIndex > replayIndex);
  assert.match(
    migration.slice(replayIndex, firstIssueIndex),
    /RETURN pg_catalog\.jsonb_set\(replay_record\."receipt", '\{decision\}', '"REPLAYED"'::JSONB, false\)/u,
  );
});
