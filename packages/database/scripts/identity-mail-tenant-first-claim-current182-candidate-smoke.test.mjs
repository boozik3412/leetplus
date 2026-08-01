import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENT182_SMOKE_CLONE_PATTERN,
  CURRENT182_SMOKE_PROBE_QUERIES,
  assertCurrent182PredecessorManifestDigest,
  buildCurrent182SmokeSessionOptions,
  generateCurrent182SmokeCloneName,
  parseCurrent182SmokeArguments,
  runCurrent182SmokeSelfTest,
  sanitizeCurrent182SmokeError,
} from "./identity-mail-tenant-first-claim-current182-candidate-smoke.mjs";

const CURRENT182_SHA256 =
  "4367c2c50b036ae21c22b88dc0980895c9010abb018c3f7a04d58ed0f00efa22";

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

test("CURRENT182 predecessor manifest is derived from the exact ordered stack", () => {
  const entries = [
    { name: "20260801010000_first", sha256: "a".repeat(64) },
    { name: "20260801020000_second", sha256: "b".repeat(64) },
  ];
  const expected = assertCurrent182PredecessorManifestDigest(
    entries,
    "9754560c0af80eb355b37a4391575cc44050cb0984836690314f9ce51df445b5",
  );
  assert.equal(
    expected,
    "9754560c0af80eb355b37a4391575cc44050cb0984836690314f9ce51df445b5",
  );
  assert.throws(() =>
    assertCurrent182PredecessorManifestDigest(
      [{ ...entries[0], sha256: "c".repeat(64) }, entries[1]],
      expected,
    ),
  );
});

test("CURRENT182 PostgreSQL probes bind every placeholder to the exact routine type", () => {
  const queries = Object.values(CURRENT182_SMOKE_PROBE_QUERIES);
  assert.equal(queries.length, 8);
  for (const query of queries) {
    assert.doesNotMatch(query, /\$[1-9](?!::)/u);
  }
  assert.match(CURRENT182_SMOKE_PROBE_QUERIES.legacyTransition, /\$5::INTEGER/u);
  assert.match(CURRENT182_SMOKE_PROBE_QUERIES.legacyRelease, /\$5::INTEGER/u);
  assert.match(CURRENT182_SMOKE_PROBE_QUERIES.canonicalAssert, /\$4::INTEGER/u);
  assert.match(
    CURRENT182_SMOKE_PROBE_QUERIES.canonicalLocatorAssert,
    /\$4::INTEGER/u,
  );
  assert.match(
    CURRENT182_SMOKE_PROBE_QUERIES.canonicalTransition,
    /\$5::INTEGER/u,
  );
  assert.match(CURRENT182_SMOKE_PROBE_QUERIES.canonicalRelease, /\$5::INTEGER/u);
});

test("CURRENT182 smoke self-test freezes the 182-entry stack and byte SHA", async () => {
  const report = await runCurrent182SmokeSelfTest();
  assert.deepEqual(report, {
    authorization: false,
    candidateMigration:
      "20260801030000_identity_mail_tenant_first_claim_protocol",
    candidateSha256: CURRENT182_SHA256,
    decision: "SELF_TEST_PASSED",
    predecessorManifestDigest:
      "7db51f4803b9c6c76b9593e5e8e3573b58b165237d44796e6d6efe27a367c110",
    predecessorMigrationCount: 181,
    runtimeShaSource: "MIGRATION_SQL_BYTES",
  });
});
