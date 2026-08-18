import { PrismaClient } from "@prisma/client";
import {
  RuntimeFunctionEnrollmentError,
  applyRuntimeFunctionEnrollment,
  checkRuntimeFunctionEnrollment,
  parseRuntimeFunctionEnrollmentConfig,
  runRuntimeFunctionEnrollmentSelfTest,
} from "./runtime-function-enrollment.mjs";

const HELP = `LeetPlus runtime function ACL enrollment v1

Usage:
  node scripts/runtime-function-enrollment.cli.mjs --check
  node scripts/runtime-function-enrollment.cli.mjs --apply
  node scripts/runtime-function-enrollment.cli.mjs --self-test
  node scripts/runtime-function-enrollment.cli.mjs --help

Required environment for --check and --apply:
  DATABASE_URL
  RUNTIME_FUNCTION_ENROLLMENT_EXPECTED_DATABASE
  RUNTIME_FUNCTION_ENROLLMENT_ROLE

Additional environment for --apply:
  RUNTIME_FUNCTION_ENROLLMENT_CONFIRM

The exact confirmation value is:
  APPLY_RUNTIME_FUNCTION_ENROLLMENT_V1 <database> <role> 20260818020000_identity_mail_delivery_current_head_v1 185

Safety contract:
  - The command never creates a role, database, schema, table, or function.
  - The migration/admin DATABASE_URL must be different from the target role.
  - PostgreSQL 16, completed migration 166, exact terminal migration 185 and exact count 185 are required.
  - Only eight exact application functions receive EXECUTE: two delivery
    helpers, five sealed identity-email boundaries, and the PII-free initial
    OWNER invite SENT assertion.
  - All six worker-only functions, including the four leased mail delivery
    RPCs and their role assertion, are explicitly excluded.
  - The raw identity-email lock helper remains excluded.
  - The dormant OWNER invite HOLD writer remains excluded.
  - All nine shared-beta admission provenance functions remain excluded.
  - All twenty retained CURRENT_174 build, challenge, marker, state,
    activation and coordinator functions remain excluded from the general
    runtime role; CURRENT_176 replaces the obsolete outbox release guard.
  - All eight CURRENT_176 trigger/helper/reconciliation routines remain
    excluded from the general runtime role.
  - A role bound to a live activation challenge or an unrevoked runtime marker
    is rejected; dedicated activation roles are never enrolled here.
  - All table-level privileges on the fourteen identity and shared-beta sealed
    tables are explicitly revoked from both the runtime role and PUBLIC.
  - All SELECT, INSERT, UPDATE, and REFERENCES column privileges are revoked
    from the runtime role and PUBLIC across all 291 exact sealed columns.
  - USAGE on IdentityMailOutboxStatus and SharedBetaReleaseGateCode is revoked
    from the runtime role and PUBLIC; exact enum labels and ACLs are verified.
  - No password, connection URL, token, or function owner is printed.
`;

function sanitizeError(value) {
  return String(value instanceof Error ? value.message : value)
    .replace(/postgres(?:ql)?:\/\/[^\s")]+/giu, "<redacted-postgresql-url>")
    .replace(/password=[^\s;]+/giu, "password=<redacted>");
}

function printFailure(error) {
  const code =
    error instanceof RuntimeFunctionEnrollmentError
      ? error.code
      : "RUNTIME_FUNCTION_ENROLLMENT_FAILED";
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code,
      message: sanitizeError(error),
    })}\n`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(HELP);
    return;
  }
  if (args.length === 1 && args[0] === "--self-test") {
    runRuntimeFunctionEnrollmentSelfTest();
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        decision: "SELF_TEST_PASSED",
      })}\n`,
    );
    return;
  }

  const mode =
    args.length === 1 && args[0] === "--check"
      ? "check"
      : args.length === 1 && args[0] === "--apply"
        ? "apply"
        : null;
  if (!mode) {
    throw new RuntimeFunctionEnrollmentError(
      "RUNTIME_FUNCTION_ENROLLMENT_ARGUMENTS_INVALID",
      "Use exactly one of --check, --apply, --self-test, or --help.",
    );
  }

  const config = parseRuntimeFunctionEnrollmentConfig(process.env, mode);
  const prisma = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
    log: [],
  });

  try {
    const receipt =
      mode === "apply"
        ? await applyRuntimeFunctionEnrollment(prisma, config)
        : await checkRuntimeFunctionEnrollment(prisma, config);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  printFailure(error);
  process.exitCode = 1;
});
