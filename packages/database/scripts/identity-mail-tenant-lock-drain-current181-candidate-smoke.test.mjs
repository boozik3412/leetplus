import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  CURRENT181_SMOKE_CATALOG_CONTRACT,
  CURRENT181_SMOKE_CLONE_PATTERN,
  CURRENT181_SMOKE_CONFIRMATION,
  CURRENT181_SMOKE_CONFIRMATION_ENVIRONMENT,
  CURRENT181_SMOKE_SCRIPT_NAME,
  buildCurrent181SmokeSessionOptions,
  generateCurrent181SmokeCloneName,
  parseCurrent181SmokeArguments,
  parseCurrent181SmokeSourceUrl,
  readCurrent181SmokeStackPlan,
  runCurrent181SmokeSelfTest,
  sanitizeCurrent181SmokeError,
  splitCurrent181SmokeSql,
  validateCurrent181SmokeCandidateContract,
} from "./identity-mail-tenant-lock-drain-current181-candidate-smoke.mjs";

const plan = await readCurrent181SmokeStackPlan();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function candidateWithText(text, metadata = plan.current181.metadata) {
  const content = Buffer.from(text, "utf8");
  return {
    content,
    metadata: structuredClone(metadata),
    name: plan.current181.name,
    sha256: sha256(content),
    text,
  };
}

test("parses only help, self-test, or the opt-in real run", () => {
  assert.deepEqual(parseCurrent181SmokeArguments([]), {
    help: false,
    selfTest: false,
  });
  assert.deepEqual(parseCurrent181SmokeArguments(["--help"]), {
    help: true,
    selfTest: false,
  });
  assert.deepEqual(parseCurrent181SmokeArguments(["--self-test"]), {
    help: false,
    selfTest: true,
  });
  for (const invalid of [["--confirm"], ["--self-test", "extra"], "bad"]) {
    assert.throws(() => parseCurrent181SmokeArguments(invalid));
  }
  assert.equal(
    CURRENT181_SMOKE_CONFIRMATION,
    "run-identity-mail-tenant-lock-drain-current181-candidate-smoke",
  );
  assert.equal(
    CURRENT181_SMOKE_CONFIRMATION_ENVIRONMENT,
    "IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CANDIDATE_SMOKE_CONFIRM",
  );
  assert.equal(
    CURRENT181_SMOKE_SCRIPT_NAME,
    "identity-mail-tenant-lock-drain-current181-candidate-smoke",
  );
});

test("accepts only canonical numeric-loopback dedicated CI sources", () => {
  assert.equal(
    parseCurrent181SmokeSourceUrl(
      "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public",
    ).databaseName,
    "leetplus_ci",
  );
  assert.equal(
    parseCurrent181SmokeSourceUrl(
      "postgresql://postgres:test@[::1]:5432/leetplus_ci?schema=public",
    ).databaseName,
    "leetplus_ci",
  );
  for (const invalid of [
    "postgresql://postgres:test@localhost:5432/leetplus_ci?schema=public",
    "postgresql://postgres:test@127.0.0.2:5432/leetplus_ci?schema=public",
    "postgresql://postgres:test@127.0.0.1:5432/leetplus?schema=public",
    "postgresql://postgres:test@127.0.0.1:5432/postgres?schema=public",
    "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public&sslmode=disable",
    "mysql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public",
  ]) {
    assert.throws(() => parseCurrent181SmokeSourceUrl(invalid));
  }
});

test("generates only exact disposable clone names", () => {
  const first = generateCurrent181SmokeCloneName();
  const second = generateCurrent181SmokeCloneName();
  assert.match(first, CURRENT181_SMOKE_CLONE_PATTERN);
  assert.match(second, CURRENT181_SMOKE_CLONE_PATTERN);
  assert.notEqual(first, second);
  assert.doesNotMatch("leetplus_ci", CURRENT181_SMOKE_CLONE_PATTERN);
});

test("splits PostgreSQL statements without cutting comments, strings, or bodies", () => {
  const statements = splitCurrent181SmokeSql(`BEGIN;
-- ignored ; separator
DO $probe$
BEGIN
  PERFORM 'semi;colon';
  PERFORM $$nested;literal$$;
END;
$probe$;
/* outer ; /* nested ; */ still comment */
SELECT "semi;identifier", 'it''s;safe';
COMMIT;`);
  assert.equal(statements.length, 4);
  assert.equal(statements[0], "BEGIN");
  assert.match(statements[1], /^-- ignored/u);
  assert.match(statements[2], /^\/\* outer/u);
  assert.equal(statements[3], "COMMIT");
  assert.throws(() => splitCurrent181SmokeSql("SELECT $broken$unterminated;"));
});

test("builds both exact candidate fences from the runtime SQL hash", () => {
  const options = buildCurrent181SmokeSessionOptions(plan.current181.sha256);
  assert.deepEqual(options, [
    "-c lock_timeout=5000",
    "-c statement_timeout=300000",
    "-c leetplus.identity_mail_tenant_enrollment_current180_confirmation=rehearse-dormant-identity-mail-tenant-enrollment-current180",
    "-c leetplus.identity_mail_tenant_enrollment_current180_sha256=e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683",
    "-c leetplus.identity_mail_tenant_lock_drain_current181_confirmation=rehearse-noncanonical-identity-mail-tenant-lock-drain-current181",
    `-c leetplus.identity_mail_tenant_lock_drain_current181_sha256=${plan.current181.sha256}`,
  ]);
  const wrong = buildCurrent181SmokeSessionOptions("f".repeat(64));
  assert.equal(wrong.at(-1).endsWith("f".repeat(64)), true);
  assert.throws(() => buildCurrent181SmokeSessionOptions("not-a-sha"));
  assert.throws(() =>
    buildCurrent181SmokeSessionOptions(plan.current181.sha256, {
      current181Confirmation: "unsafe value",
    }),
  );
});

test("pins the exact CURRENT179 -> CURRENT180 -> CURRENT181 dormant stack", () => {
  assert.equal(plan.entries.length, 179);
  assert.equal(
    plan.entries.at(-1).name,
    "20260731120000_identity_mail_delivery_release_head",
  );
  assert.equal(
    plan.current180.name,
    "20260801010000_identity_mail_tenant_enrollment_control_plane",
  );
  assert.equal(
    plan.current180.sha256,
    "e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683",
  );
  assert.equal(
    plan.current181.name,
    "20260801020000_identity_mail_tenant_lock_drain_worker_v2",
  );
  assert.match(plan.current181.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(plan.stack.length, 181);
  const result = validateCurrent181SmokeCandidateContract(plan.current181);
  assert.ok(result.statementCount > 10);
  assert.equal(plan.current181.metadata.authorization, false);
  assert.equal(plan.current181.metadata.canMutate, false);
  assert.equal(plan.current181.metadata.status, "NOT_DEPLOYABLE");
});

test("candidate contract rejects fence and authorization drift", () => {
  const missingFence = candidateWithText(
    plan.current181.text.replace(
      "rehearse-noncanonical-identity-mail-tenant-lock-drain-current181",
      "rehearse-untrusted-current181",
    ),
  );
  assert.throws(() => validateCurrent181SmokeCandidateContract(missingFence));

  const authorizedMetadata = structuredClone(plan.current181.metadata);
  authorizedMetadata.authorization = true;
  assert.throws(() =>
    validateCurrent181SmokeCandidateContract(
      candidateWithText(plan.current181.text, authorizedMetadata),
    ),
  );

  const unpinnedMetadata = structuredClone(plan.current181.metadata);
  unpinnedMetadata.migrationSqlSha256 = "0".repeat(64);
  assert.throws(() =>
    validateCurrent181SmokeCandidateContract(
      candidateWithText(plan.current181.text, unpinnedMetadata),
    ),
  );

  const mismatchedBytes = {
    ...plan.current181,
    content: Buffer.from(`${plan.current181.text}\n`, "utf8"),
  };
  assert.throws(() => validateCurrent181SmokeCandidateContract(mismatchedBytes));
});

test("catalog contract remains deliberately bounded and owner-only", () => {
  assert.deepEqual(CURRENT181_SMOKE_CATALOG_CONTRACT, {
    columnCount: 6,
    functionCount: 11,
    indexCount: 6,
    newFunctionCount: 9,
    v1ProsrcPinCount: 6,
  });
});

test("sanitizes credentials from failures", () => {
  assert.equal(
    sanitizeCurrent181SmokeError(
      new Error(
        "postgresql://postgres:very-secret@127.0.0.1:5432/leetplus_ci?schema=public",
      ),
    ),
    "<redacted-postgresql-url>",
  );
});

test("offline self-test is non-authorizing and uses migration bytes", async () => {
  const report = await runCurrent181SmokeSelfTest();
  assert.equal(report.decision, "SELF_TEST_PASSED");
  assert.equal(report.authorization, false);
  assert.equal(report.runtimeShaSource, "MIGRATION_SQL_BYTES");
  assert.equal(report.candidateSha256, plan.current181.sha256);
});
