#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

import {
  FounderPilotMailTenantEnrollmentError,
  createFounderPilotMailTenantEnrollmentPrismaAdapter,
  expectedFounderPilotMailTenantEnrollmentConfirmation,
  runFounderPilotMailTenantEnrollment,
} from "./founder-pilot-mail-tenant-enrollment.mjs";
import {
  IdentityMailWorkerEnrollmentError,
  parseIdentityMailWorkerEnrollmentConfig,
} from "./identity-mail-worker-enrollment.mjs";

const HELP = `LeetPlus single-founder pilot mail tenant enrollment v1

Usage:
  node scripts/founder-pilot-mail-tenant-enrollment.cli.mjs --mode plan
  node scripts/founder-pilot-mail-tenant-enrollment.cli.mjs --mode apply
  node scripts/founder-pilot-mail-tenant-enrollment.cli.mjs --mode check
  node scripts/founder-pilot-mail-tenant-enrollment.cli.mjs --mode disable
  node scripts/founder-pilot-mail-tenant-enrollment.cli.mjs --help

Required environment:
  DATABASE_URL
  FOUNDER_PILOT_MAIL_EXPECTED_DATABASE
  FOUNDER_PILOT_MAIL_TENANT_ID
  FOUNDER_PILOT_MAIL_ENVIRONMENT=production|staging
  FOUNDER_PILOT_MAIL_RELEASE_SHA
  FOUNDER_PILOT_MAIL_WORKER_ROLE
  FOUNDER_PILOT_MAIL_EXPECTED_ROLE_OID
  FOUNDER_PILOT_MAIL_PROVIDER_AUTHORITY_DIGEST
  FOUNDER_PILOT_MAIL_OPERATION_ID

Additional environment for apply/disable:
  FOUNDER_PILOT_MAIL_CONFIRM

Run plan first and copy its exact requiredConfirmation. The command is bound
to one already activated PILOT tenant, CURRENT185, one exact worker role/OID,
the activation release SHA and a fixed retry policy. It never reads or prints
email, invite token, ciphertext, SMTP credentials or another tenant's data.
It does not create a tenant, role, owner invitation or SMTP configuration.`;

function value(environment, key) {
  const candidate = environment[key];
  if (typeof candidate !== "string" || candidate.trim() !== candidate) {
    throw new FounderPilotMailTenantEnrollmentError(
      `FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_${key.replace(/^FOUNDER_PILOT_MAIL_/u, "")}_INVALID`,
    );
  }
  return candidate;
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true, mode: null };
  }
  if (
    argv.length !== 2 ||
    argv[0] !== "--mode" ||
    !["apply", "check", "disable", "plan"].includes(argv[1])
  ) {
    return null;
  }
  return { help: false, mode: argv[1] };
}

function requestFromEnvironment(environment, mode) {
  const worker = parseIdentityMailWorkerEnrollmentConfig(
    {
      DATABASE_URL: environment.DATABASE_URL,
      IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_DATABASE: value(
        environment,
        "FOUNDER_PILOT_MAIL_EXPECTED_DATABASE",
      ),
      IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_ROLE_OID: value(
        environment,
        "FOUNDER_PILOT_MAIL_EXPECTED_ROLE_OID",
      ),
      IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE: value(
        environment,
        "FOUNDER_PILOT_MAIL_WORKER_ROLE",
      ),
    },
    "check",
  );
  return {
    databaseUrl: worker.databaseUrl,
    request: {
      confirmation: ["apply", "disable"].includes(mode)
        ? value(environment, "FOUNDER_PILOT_MAIL_CONFIRM")
        : null,
      databaseName: worker.databaseName,
      environment: value(environment, "FOUNDER_PILOT_MAIL_ENVIRONMENT"),
      mode,
      operationId: value(environment, "FOUNDER_PILOT_MAIL_OPERATION_ID"),
      providerAuthorityDigest: value(
        environment,
        "FOUNDER_PILOT_MAIL_PROVIDER_AUTHORITY_DIGEST",
      ),
      releaseSha: value(environment, "FOUNDER_PILOT_MAIL_RELEASE_SHA"),
      roleName: worker.roleName,
      roleOid: worker.roleOid.toString(),
      tenantId: value(environment, "FOUNDER_PILOT_MAIL_TENANT_ID"),
      transportPolicy: worker.transportPolicy,
    },
  };
}

function safeFailure(error) {
  const databaseCode =
    typeof error?.code === "string" && /^[A-Z0-9_]{2,32}$/u.test(error.code)
      ? error.code
      : null;
  const databaseSubcode =
    typeof error?.meta?.code === "string" &&
    /^[0-9A-Z]{2,16}$/u.test(error.meta.code)
      ? error.meta.code
      : null;
  return {
    contractVersion: "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_V1",
    decision: "BLOCKED_MANUAL",
    reasonCode:
      error?.safeContractError === true
        ? error.reasonCode
        : error instanceof IdentityMailWorkerEnrollmentError
          ? error.code
          : databaseCode === null
            ? "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_CLI_FAILURE"
            : `FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_DATABASE_${databaseCode}${databaseSubcode === null ? "" : `_${databaseSubcode}`}`,
  };
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  const args = parseArgs(argv);
  if (args === null) {
    process.stderr.write(`${HELP}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  let prisma;
  try {
    const config = requestFromEnvironment(environment, args.mode);
    prisma = new PrismaClient({
      datasources: { db: { url: config.databaseUrl } },
      log: [],
    });
    const result = await runFounderPilotMailTenantEnrollment({
      adapter: createFounderPilotMailTenantEnrollmentPrismaAdapter(prisma),
      request: config.request,
    });
    let output = result;
    if (args.mode === "plan") {
      output = {
        ...result,
        requiredConfirmation:
          expectedFounderPilotMailTenantEnrollmentConfirmation({
            ...config.request,
            confirmation: null,
            mode: "apply",
          }),
      };
    } else if (args.mode === "check" && result.decision === "ACTIVE") {
      output = {
        ...result,
        requiredDisableConfirmation:
          expectedFounderPilotMailTenantEnrollmentConfirmation({
            ...config.request,
            confirmation: null,
            mode: "disable",
          }),
      };
    }
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(safeFailure(error), null, 2)}\n`);
    return 1;
  } finally {
    await prisma?.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
