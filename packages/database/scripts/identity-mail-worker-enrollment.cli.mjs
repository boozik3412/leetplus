import { PrismaClient } from "@prisma/client";
import {
  IdentityMailWorkerEnrollmentError,
  applyIdentityMailWorkerEnrollment,
  checkIdentityMailWorkerEnrollment,
  parseIdentityMailWorkerEnrollmentConfig,
  runIdentityMailWorkerEnrollmentSelfTest,
} from "./identity-mail-worker-enrollment.mjs";

const HELP = `LeetPlus initial OWNER identity-mail worker enrollment v1

Usage:
  node scripts/identity-mail-worker-enrollment.cli.mjs --check
  node scripts/identity-mail-worker-enrollment.cli.mjs --apply
  node scripts/identity-mail-worker-enrollment.cli.mjs --self-test
  node scripts/identity-mail-worker-enrollment.cli.mjs --help

Required environment for --check and --apply:
  DATABASE_URL
  IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_DATABASE
  IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE
  IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_ROLE_OID

Additional environment for --apply:
  IDENTITY_MAIL_WORKER_ENROLLMENT_CONFIRM

Exact confirmation:
  APPLY_IDENTITY_MAIL_WORKER_ENROLLMENT_V1 <database> <role> <roleOid> 20260818010000_founder_owner_invite_reissue_v1 184

Safety contract:
  - The command never creates a role or a tenant enrollment row.
  - CURRENT_USER and SESSION_USER must be the unchanged database owner.
  - The existing target role must match exact name/OID and be LOGIN,
    NOINHERIT, non-privileged, without membership, role settings or ownership.
  - Exact merged terminal release head CURRENT_184 and count 184 are required.
  - The target role receives public schema USAGE and EXECUTE on exactly five
    delivery RPCs: readiness, claim, provider-mark, complete and tenant-scoped
    reap.
  - PUBLIC EXECUTE is revoked on all fourteen CURRENT_176 delivery routines.
  - Direct table, column, sequence, schema-CREATE and other function grants
    are removed from the target role.
  - IdentityMailDeliveryTenantEnrollment must remain empty; canary tenant
    enrollment is a separate protected ceremony.
  - This command configures no SMTP, roots, routes, tenant or production GO.
`;

function sanitizeError(value) {
  return String(value instanceof Error ? value.message : value)
    .replace(/postgres(?:ql)?:\/\/[^\s")]+/giu, "<redacted-postgresql-url>")
    .replace(/password=[^\s;]+/giu, "password=<redacted>");
}

function printFailure(error) {
  const code =
    error instanceof IdentityMailWorkerEnrollmentError
      ? error.code
      : "IDENTITY_MAIL_WORKER_ENROLLMENT_FAILED";
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
    runIdentityMailWorkerEnrollmentSelfTest();
    process.stdout.write(
      `${JSON.stringify({ ok: true, decision: "SELF_TEST_PASSED" })}\n`,
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
    throw new IdentityMailWorkerEnrollmentError(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_ARGUMENTS_INVALID",
      "Use exactly one of --check, --apply, --self-test, or --help.",
    );
  }

  const config = parseIdentityMailWorkerEnrollmentConfig(process.env, mode);
  const prisma = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
    log: [],
  });
  try {
    const result =
      mode === "apply"
        ? await applyIdentityMailWorkerEnrollment(prisma, config)
        : await checkIdentityMailWorkerEnrollment(prisma, config);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  printFailure(error);
  process.exitCode = 1;
});
