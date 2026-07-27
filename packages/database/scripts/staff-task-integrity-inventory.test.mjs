import assert from "node:assert/strict";
import test from "node:test";

import {
  INVENTORY_SQL,
  PRODUCTION_ATTESTATION,
  RUN_CONFIRMATION,
  buildReadOnlyDatabaseUrl,
  buildReport,
  parseArguments,
  parseBoundedInteger,
  parseRuntimeContract,
  runSelfTest,
} from "./staff-task-integrity-inventory.mjs";

function stagingEnvironment(overrides = {}) {
  return {
    DATABASE_URL:
      "postgresql://inventory:test@127.0.0.1:5432/example?schema=inventory",
    STAFF_TASK_INTEGRITY_INVENTORY_TARGET: "staging",
    STAFF_TASK_INTEGRITY_INVENTORY_CONFIRM: RUN_CONFIRMATION,
    ...overrides,
  };
}

test("help short-circuits all other CLI options", () => {
  assert.deepEqual(parseArguments(["--pretty", "--help", "--self-test"]), {
    help: true,
    selfTest: false,
    pretty: false,
  });
});

test("unsupported mutation-like CLI options fail closed", () => {
  for (const argument of ["--apply", "--fix", "--delete", "--target"]) {
    assert.throws(() => parseArguments([argument]), {
      code: "CLI_ARGUMENT_UNSUPPORTED",
    });
  }
});

test("runtime contract requires explicit target and confirmation", () => {
  assert.throws(
    () =>
      parseRuntimeContract(
        stagingEnvironment({
          STAFF_TASK_INTEGRITY_INVENTORY_TARGET: "",
        }),
      ),
    { code: "TARGET_ENVIRONMENT_REQUIRED" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        stagingEnvironment({
          STAFF_TASK_INTEGRITY_INVENTORY_CONFIRM: "",
        }),
      ),
    { code: "RUN_CONFIRMATION_REQUIRED" },
  );
});

test("production requires an exact read-only attestation", () => {
  assert.throws(
    () =>
      parseRuntimeContract(
        stagingEnvironment({
          STAFF_TASK_INTEGRITY_INVENTORY_TARGET: "production",
        }),
      ),
    { code: "PRODUCTION_ATTESTATION_REQUIRED" },
  );

  const config = parseRuntimeContract(
    stagingEnvironment({
      STAFF_TASK_INTEGRITY_INVENTORY_TARGET: "production",
      STAFF_TASK_INTEGRITY_INVENTORY_PRODUCTION_ATTESTATION:
        PRODUCTION_ATTESTATION,
    }),
  );
  assert.equal(config.target, "production");
  assert.equal(config.productionAttested, true);
});

test("bounded integer parser rejects signs, decimals, and overflow", () => {
  const options = {
    code: "INVALID",
    label: "value",
    minimum: 1,
    maximum: 10,
    fallback: 5,
  };
  assert.equal(parseBoundedInteger(undefined, options), 5);
  assert.equal(parseBoundedInteger("7", options), 7);
  for (const value of ["-1", "+1", "1.5", "11", "word"]) {
    assert.throws(() => parseBoundedInteger(value, options), {
      code: "INVALID",
    });
  }
});

test("database URL enforces one read-only bounded connection", () => {
  const config = parseRuntimeContract(stagingEnvironment());
  const url = new URL(
    buildReadOnlyDatabaseUrl(
      `${stagingEnvironment().DATABASE_URL}&options=-c%20application_name%3Dinventory`,
      config,
    ),
  );
  const options = url.searchParams.get("options") ?? "";

  assert.equal(url.searchParams.get("connection_limit"), "1");
  assert.match(options, /application_name=inventory/);
  assert.match(options, /default_transaction_read_only=on/);
  assert.match(options, /lock_timeout=500/);
  assert.match(options, /statement_timeout=30000/);
});

test("report decision is deterministic for PASS, REVIEW, and BLOCKED", () => {
  const base = {
    target: "development",
    generatedAt: "2026-07-27T00:00:00.000Z",
    thresholds: {
      staleStartedMinutes: 60,
      failedWindowDays: 14,
      failedThreshold: 3,
    },
  };

  const pass = buildReport({
    ...base,
    rows: [
      { code: "CROSS_TENANT", severity: "BLOCKING", count: "0" },
      { code: "DELETE_REVIEW", severity: "REVIEW", count: "0" },
    ],
  });
  assert.equal(pass.summary.decision, "PASS");

  const review = buildReport({
    ...base,
    rows: [
      { code: "CROSS_TENANT", severity: "BLOCKING", count: "0" },
      { code: "DELETE_REVIEW", severity: "REVIEW", count: "4" },
    ],
  });
  assert.equal(review.summary.decision, "REVIEW");
  assert.equal(review.summary.reviewTotal, 4);

  const blocked = buildReport({
    ...base,
    rows: [
      { code: "CROSS_TENANT", severity: "BLOCKING", count: "1" },
      { code: "DELETE_REVIEW", severity: "REVIEW", count: "4" },
    ],
  });
  assert.equal(blocked.summary.decision, "BLOCKED");
  assert.equal(blocked.summary.blockingCodes, 1);
});

test("inventory SQL covers the complete catalog integrity contract", () => {
  const requiredCodes = [
    "TEMPLATE_STORE_CROSS_TENANT",
    "TEMPLATE_CREATOR_CROSS_TENANT",
    "RULE_TEMPLATE_CROSS_TENANT",
    "RULE_STORE_CROSS_TENANT",
    "RULE_CREATOR_CROSS_TENANT",
    "RULE_ASSIGNEE_CROSS_TENANT",
    "RULE_LAST_TASK_CROSS_TENANT",
    "RUN_RULE_CROSS_TENANT",
    "RUN_TASK_CROSS_TENANT",
    "TASK_STORE_CROSS_TENANT",
    "TASK_TEMPLATE_CROSS_TENANT",
    "TASK_RULE_CROSS_TENANT",
    "TASK_CREATOR_CROSS_TENANT",
    "TASK_ASSIGNEE_CROSS_TENANT",
    "RULE_TEMPLATE_STORE_MISMATCH",
    "TASK_TEMPLATE_STORE_MISMATCH",
    "TASK_RULE_STORE_MISMATCH",
    "RULE_LAST_TASK_SOURCE_MISMATCH",
    "RUN_TASK_SOURCE_MISMATCH",
    "ACTIVE_RULE_NULL_STORE",
    "ACTIVE_RULE_NULL_NEXT_RUN_AT",
    "ACTIVE_RULE_STORE_TIMEZONE_MISSING",
    "ACTIVE_RULE_STORE_TIMEZONE_INVALID",
    "ACTIVE_TEMPLATE_NULL_STORE",
    "ACTIVE_RULE_INACTIVE_STORE",
    "ACTIVE_RULE_INACTIVE_TEMPLATE",
    "ACTIVE_TEMPLATE_INACTIVE_STORE",
    "ACTIVE_RULE_INACTIVE_TENANT",
    "RULE_ASSIGNEE_PLATFORM",
    "RULE_ASSIGNEE_INACTIVE",
    "RULE_ASSIGNEE_SCOPE_INVALID",
    "RULE_ASSIGNEE_OUT_OF_STORE",
    "RULE_ASSIGNEE_GLOBAL_SCOPE_INVALID",
    "TASK_ASSIGNEE_PLATFORM",
    "TASK_ASSIGNEE_INACTIVE",
    "TASK_ASSIGNEE_SCOPE_INVALID",
    "TASK_ASSIGNEE_OUT_OF_STORE",
    "TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID",
    "STALE_STARTED_RUN",
    "REPEATED_FAILED_RUN",
    "TASK_STORE_SET_NULL_CANDIDATE",
    "TEMPLATE_STORE_SET_NULL_CANDIDATE",
    "RULE_STORE_SET_NULL_CANDIDATE",
  ];

  for (const code of requiredCodes) {
    assert.equal(INVENTORY_SQL.split(`'${code}'`).length - 1, 1, code);
  }
  assert.equal(requiredCodes.length, 43);
  assert.doesNotMatch(
    INVENTORY_SQL,
    /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|COPY|CALL|DO)\b/i,
  );
});

test("embedded self-test stays database-independent", () => {
  assert.deepEqual(runSelfTest(), {
    script: "staff-task-integrity-inventory",
    status: "PASS",
    checks: 12,
  });
});
