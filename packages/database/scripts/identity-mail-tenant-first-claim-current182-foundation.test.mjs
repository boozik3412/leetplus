import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENT182_FOUNDATION_FINDINGS,
  current182FunctionBody,
  readCurrent182FoundationInputs,
  sha256,
  validateCurrent182Foundation,
} from "./identity-mail-tenant-first-claim-current182-foundation.mjs";

const TENANT_LOCK_CALL = 'public."identity_mail_tenant_lock_v1"';
const EMAIL_LOCK_CALL = 'public."identity_email_claim_lock_v1"';
const CANONICAL_NAMES = Object.freeze([
  "identity_email_claim_reserve_invite_v2",
  "identity_email_claim_assert_invite_v1",
  "identity_email_claim_assert_invite_locator_v1",
  "identity_email_claim_transition_v2",
  "identity_email_claim_release_v2",
]);

function cloneInputs(input) {
  return {
    candidateMetadataText: String(input.candidateMetadataText),
    candidateSql: String(input.candidateSql),
    predecessorSql: String(input.predecessorSql),
  };
}

function replaceRequired(value, before, after) {
  assert.ok(value.includes(before), `fixture fragment missing: ${before}`);
  return value.replace(before, after);
}

function freezeMutatedSql(input, mutate) {
  const value = cloneInputs(input);
  value.candidateSql = mutate(value.candidateSql);
  const metadata = JSON.parse(value.candidateMetadataText);
  metadata.migrationSqlSha256 = sha256(
    Buffer.from(value.candidateSql.replaceAll("\r\n", "\n"), "utf8"),
  );
  value.candidateMetadataText = JSON.stringify(metadata);
  return value;
}

function mutateFunctionBody(input, name, mutate) {
  return freezeMutatedSql(input, (sql) => {
    const body = current182FunctionBody(sql, name);
    assert.ok(body.length > 0, `fixture function body missing: ${name}`);
    return replaceRequired(sql, body, mutate(body));
  });
}

function assertFinding(input, finding) {
  const report = validateCurrent182Foundation(input);
  assert.equal(report.decision, "NON_COMPLIANT");
  assert.ok(report.findings.includes(finding), JSON.stringify(report));
}

const baseline = await readCurrent182FoundationInputs();

test("CURRENT182 frozen candidate is foundation-compliant", () => {
  const report = validateCurrent182Foundation(baseline);
  assert.equal(report.decision, "CURRENT182_FOUNDATION_COMPLIANT");
  assert.deepEqual(report.findings, []);
  assert.equal(report.authorization, false);
  assert.equal(report.canMutate, false);
  assert.equal(report.status, "NOT_DEPLOYABLE");
});

test("CURRENT182 rejects candidate metadata and SQL checksum drift", () => {
  const metadataDrift = cloneInputs(baseline);
  const metadata = JSON.parse(metadataDrift.candidateMetadataText);
  metadata.authorization = true;
  metadataDrift.candidateMetadataText = JSON.stringify(metadata);
  assertFinding(metadataDrift, CURRENT182_FOUNDATION_FINDINGS.METADATA_DRIFT);

  const sqlDrift = cloneInputs(baseline);
  sqlDrift.candidateSql += "\n-- drift\n";
  assertFinding(sqlDrift, CURRENT182_FOUNDATION_FINDINGS.SQL_SHA_DRIFT);
});

test("CURRENT182 rejects frozen CURRENT181 predecessor drift", () => {
  const value = cloneInputs(baseline);
  value.predecessorSql += "\n-- forbidden predecessor drift\n";
  assertFinding(value, CURRENT182_FOUNDATION_FINDINGS.CURRENT181_DRIFT);
});

test("CURRENT182 rejects a broken outer transaction boundary", () => {
  const value = freezeMutatedSql(baseline, (sql) =>
    replaceRequired(sql, "\nCOMMIT;\n", "\n-- COMMIT removed\n"),
  );
  assertFinding(
    value,
    CURRENT182_FOUNDATION_FINDINGS.TRANSACTION_BOUNDARY_DRIFT,
  );
});

test("CURRENT182 rejects tenant/email lock inversion in every canonical entrypoint", async (t) => {
  for (const name of CANONICAL_NAMES) {
    await t.test(name, () => {
      const value = mutateFunctionBody(baseline, name, (body) => {
        assert.ok(body.includes(TENANT_LOCK_CALL));
        assert.ok(body.includes(EMAIL_LOCK_CALL));
        return body
          .replace(TENANT_LOCK_CALL, "__CURRENT182_LOCK_SWAP__")
          .replace(EMAIL_LOCK_CALL, TENANT_LOCK_CALL)
          .replace("__CURRENT182_LOCK_SWAP__", EMAIL_LOCK_CALL);
      });
      assertFinding(
        value,
        CURRENT182_FOUNDATION_FINDINGS.TENANT_LOCK_ORDER_DRIFT,
      );
    });
  }
});

test("CURRENT182 rejects relation access before the tenant lock", () => {
  const value = mutateFunctionBody(
    baseline,
    "identity_email_claim_reserve_invite_v2",
    (body) =>
      replaceRequired(
        body,
        "BEGIN\n",
        'BEGIN\n  PERFORM 1 FROM public."IdentityEmailClaim";\n',
      ),
  );
  assertFinding(value, CURRENT182_FOUNDATION_FINDINGS.TENANT_LOCK_ORDER_DRIFT);
});

test("CURRENT182 rejects a legacy writer that does anything before failing", () => {
  const value = mutateFunctionBody(
    baseline,
    "identity_email_claim_reserve_invite_v1",
    (body) =>
      replaceRequired(
        body,
        "BEGIN\n",
        'BEGIN\n  PERFORM 1 FROM public."IdentityEmailClaim";\n',
      ),
  );
  assertFinding(value, CURRENT182_FOUNDATION_FINDINGS.LEGACY_STUB_DRIFT);
});

test("CURRENT182 rejects missing PUBLIC revoke", () => {
  const value = freezeMutatedSql(baseline, (sql) =>
    replaceRequired(
      sql,
      `REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_email_claim_reserve_invite_v2"(
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;`,
      "-- exact PUBLIC revoke removed",
    ),
  );
  assertFinding(value, CURRENT182_FOUNDATION_FINDINGS.ACL_DRIFT);
});

test("CURRENT182 rejects an unpinned postcondition body", () => {
  const value = freezeMutatedSql(baseline, (sql) =>
    replaceRequired(
      sql,
      "d8e6dfb1634be66e6a4f3be87fc480f2e4a5aba417a97e26eff8ccdefbaed6b5",
      "0".repeat(64),
    ),
  );
  assertFinding(value, CURRENT182_FOUNDATION_FINDINGS.POSTCONDITION_DRIFT);
});

test("CURRENT182 rejects top-level schema expansion", () => {
  const value = freezeMutatedSql(baseline, (sql) =>
    replaceRequired(
      sql,
      "SET LOCAL statement_timeout = '180s';",
      "SET LOCAL statement_timeout = '180s';\nCREATE TABLE public.forbidden();",
    ),
  );
  assertFinding(value, CURRENT182_FOUNDATION_FINDINGS.MUTATION_SURFACE_DRIFT);
});
