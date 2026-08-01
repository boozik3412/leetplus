import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENT182_SMOKE_CLONE_PATTERN,
  buildCurrent182SmokeSessionOptions,
  generateCurrent182SmokeCloneName,
  parseCurrent182SmokeArguments,
  runCurrent182SmokeSelfTest,
  sanitizeCurrent182SmokeError,
} from "./identity-mail-tenant-first-claim-current182-candidate-smoke.mjs";

const CURRENT182_SHA256 =
  "0aa16e71c52a078d22b977ca8ca8d07be3e61cad59d8ade6fc4b365fbdddf8f1";

test("CURRENT182 smoke CLI accepts only help, self-test, or real mode", () => {
  assert.deepEqual(parseCurrent182SmokeArguments([]), {
    help: false,
    selfTest: false,
  });
  assert.deepEqual(parseCurrent182SmokeArguments(["--help"]), {
    help: true,
    selfTest: false,
  });
  assert.deepEqual(parseCurrent182SmokeArguments(["--self-test"]), {
    help: false,
    selfTest: true,
  });
  assert.throws(() => parseCurrent182SmokeArguments(["--unknown"]));
  assert.throws(() => parseCurrent182SmokeArguments(["--help", "extra"]));
  assert.throws(() => parseCurrent182SmokeArguments("--help"));
});

test("CURRENT182 smoke clone names stay inside the disposable fence", () => {
  const first = generateCurrent182SmokeCloneName();
  const second = generateCurrent182SmokeCloneName();
  assert.match(first, CURRENT182_SMOKE_CLONE_PATTERN);
  assert.match(second, CURRENT182_SMOKE_CLONE_PATTERN);
  assert.notEqual(first, second);
  for (const unsafe of [
    "postgres",
    "leetplus_ci",
    "lp_imtec_abc_ci",
    "lp_imtec_00000000000000000000000000000000",
  ]) {
    assert.doesNotMatch(unsafe, CURRENT182_SMOKE_CLONE_PATTERN);
  }
});

test("CURRENT182 session options add its two exact fences after CURRENT181", () => {
  const predecessor = buildCurrent182SmokeSessionOptions(CURRENT182_SHA256, {
    includeCurrent182: false,
  });
  const full = buildCurrent182SmokeSessionOptions(CURRENT182_SHA256);
  assert.equal(predecessor.length, 6);
  assert.equal(full.length, 8);
  assert.deepEqual(full.slice(0, predecessor.length), predecessor);
  assert.equal(
    full.at(-2),
    "-c leetplus.identity_mail_tenant_first_claim_current182_confirmation=rehearse-noncanonical-identity-mail-tenant-first-claim-current182",
  );
  assert.equal(
    full.at(-1),
    `-c leetplus.identity_mail_tenant_first_claim_current182_sha256=${CURRENT182_SHA256}`,
  );
  assert.throws(() => buildCurrent182SmokeSessionOptions("not-a-sha"));
});

test("CURRENT182 smoke error sanitizer redacts database URLs and long secrets", () => {
  const sanitized = sanitizeCurrent182SmokeError(
    `failed postgresql://admin:secret@127.0.0.1:5432/leetplus_ci ${"a".repeat(100)}`,
  );
  assert.doesNotMatch(sanitized, /admin:secret/u);
  assert.doesNotMatch(sanitized, /a{100}/u);
  assert.match(sanitized, /<redacted-postgresql-url>/u);
  assert.match(sanitized, /<redacted-secret>/u);
});

test("CURRENT182 smoke self-test freezes the 182-entry stack and byte SHA", async () => {
  const report = await runCurrent182SmokeSelfTest();
  assert.deepEqual(report, {
    authorization: false,
    candidateMigration:
      "20260801030000_identity_mail_tenant_first_claim_protocol",
    candidateSha256: CURRENT182_SHA256,
    decision: "SELF_TEST_PASSED",
    predecessorMigrationCount: 181,
    runtimeShaSource: "MIGRATION_SQL_BYTES",
  });
});
