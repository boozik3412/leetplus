import {
  closeSync,
  fstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseIdentityMailTenantEnrollmentProposal } from "./identity-mail-tenant-enrollment-contract.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const MAX_PROPOSAL_BYTES = 64 * 1024;
const HELP = `LeetPlus protected mail-worker tenant enrollment preflight v1

Usage:
  node scripts/identity-mail-tenant-enrollment-preflight.cli.mjs --check --proposal-file <canonical-json-path>
  node scripts/identity-mail-tenant-enrollment-preflight.cli.mjs --help

Required environment for --check:
  DATABASE_URL (exact numeric loopback PostgreSQL URL with schema=public)
  IDENTITY_MAIL_TENANT_ENROLLMENT_PROVIDER_AUTHORITY_DIGEST
  IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_ACKNOWLEDGE_SECONDS
  IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_BASE_RETRY_SECONDS
  IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_LEASE_SECONDS
  IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_ATTEMPTS
  IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_RETRY_SECONDS

Safety contract:
  - This command is inspection-only and has no apply or rollback mode.
  - The proposal is a regular, canonical UTF-8 JSON file of at most 64 KiB.
  - Proposal shape and validity are checked before Prisma is imported.
  - Database evidence is collected in one REPEATABLE READ, READ ONLY transaction.
  - This bounded slice rejects every remote, hostname-alias and extra URL option.
  - The report is PII-free and always has authorization=false/canMutate=false.
  - Runtime-config digest, independent signature, persisted replay and mutation
    ceremonies remain explicitly deferred.

Exit codes:
  0  MATCHED inspection
  2  BLOCKED inspection report
  1  contract, file, configuration or database error
`;

export class IdentityMailTenantEnrollmentPreflightCliError extends Error {
  constructor(code) {
    super(code);
    this.name = "IdentityMailTenantEnrollmentPreflightCliError";
    this.code = code;
    this.reasonCode = code;
    this.exitCode = 3;
  }
}

function fail(code) {
  throw new IdentityMailTenantEnrollmentPreflightCliError(code);
}

export function parseIdentityMailTenantEnrollmentPreflightCliArguments(args) {
  if (args.length === 1 && args[0] === "--help") {
    return Object.freeze({ mode: "help", proposalFile: null });
  }
  if (
    args.length !== 3 ||
    args[0] !== "--check" ||
    args[1] !== "--proposal-file" ||
    typeof args[2] !== "string" ||
    args[2].length === 0 ||
    args[2].length > 4_096 ||
    args[2] !== args[2].trim() ||
    args[2].includes("\0")
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_ARGUMENTS_INVALID");
  }
  return Object.freeze({ mode: "check", proposalFile: args[2] });
}

export function readIdentityMailTenantEnrollmentPreflightProposal(filePath) {
  let descriptor;
  try {
    descriptor = openSync(filePath, "r");
    const metadata = fstatSync(descriptor);
    if (
      !metadata.isFile() ||
      metadata.size <= 0 ||
      metadata.size > MAX_PROPOSAL_BYTES
    ) {
      fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FILE_INVALID");
    }
    const bytes = readFileSync(descriptor);
    if (
      bytes.length !== metadata.size ||
      bytes.length > MAX_PROPOSAL_BYTES ||
      (bytes.length >= 3 &&
        bytes[0] === 0xef &&
        bytes[1] === 0xbb &&
        bytes[2] === 0xbf) ||
      bytes.includes(0)
    ) {
      fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FILE_INVALID");
    }
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) {
      fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FILE_UTF8_INVALID");
    }
    let proposal;
    try {
      proposal = JSON.parse(text);
    } catch {
      fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FILE_JSON_INVALID");
    }
    if (canonicalStringify(proposal) !== text) {
      fail(
        "IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FILE_CANONICAL_JSON_REQUIRED",
      );
    }
    return proposal;
  } catch (error) {
    if (error instanceof IdentityMailTenantEnrollmentPreflightCliError) {
      throw error;
    }
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FILE_READ_FAILED");
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // A close failure cannot make a proposal trustworthy.
      }
    }
  }
}

export async function executeIdentityMailTenantEnrollmentPreflightCli(
  args,
  environment,
  {
    adapterLoader = () =>
      import("./identity-mail-tenant-enrollment-preflight-database.mjs"),
    now = new Date(),
    prismaLoader = () => import("@prisma/client"),
  } = {},
) {
  const command = parseIdentityMailTenantEnrollmentPreflightCliArguments(args);
  if (command.mode === "help") {
    return Object.freeze({ exitCode: 0, kind: "help", output: HELP });
  }

  const proposalInput =
    readIdentityMailTenantEnrollmentPreflightProposal(command.proposalFile);

  // This is deliberately before either adapterLoader or prismaLoader. Invalid,
  // expired or non-canonical proposals therefore perform zero database I/O.
  parseIdentityMailTenantEnrollmentProposal(proposalInput, { now });

  const adapter = await adapterLoader();
  const config = adapter.parseIdentityMailTenantEnrollmentPreflightConfig(
    environment,
  );
  const { PrismaClient } = await prismaLoader();
  const prisma = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
    log: [],
  });
  try {
    const { result } =
      await adapter.checkIdentityMailTenantEnrollmentPreflight(
        prisma,
        proposalInput,
        config,
        { now },
      );
    return Object.freeze({
      exitCode: result.inspectionDecision === "MATCHED" ? 0 : 2,
      kind: "report",
      output: `${canonicalStringify(result)}\n`,
    });
  } finally {
    await prisma.$disconnect();
  }
}

function safeFailureCode(error) {
  let candidate;
  try {
    const descriptors =
      error && typeof error === "object"
        ? Object.getOwnPropertyDescriptors(error)
        : Object.create(null);
    candidate = descriptors.code?.value ?? descriptors.reasonCode?.value;
  } catch {
    candidate = undefined;
  }
  return typeof candidate === "string" &&
    /^[A-Z][A-Z0-9_]{2,127}$/u.test(candidate)
    ? candidate
    : "IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FAILED";
}

async function main() {
  const execution = await executeIdentityMailTenantEnrollmentPreflightCli(
    process.argv.slice(2),
    process.env,
  );
  process.stdout.write(execution.output);
  return execution.exitCode;
}

const entrypoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (entrypoint) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(
        `${canonicalStringify({
          authorization: false,
          canMutate: false,
          code: safeFailureCode(error),
          ok: false,
        })}\n`,
      );
      process.exitCode = 1;
    });
}
