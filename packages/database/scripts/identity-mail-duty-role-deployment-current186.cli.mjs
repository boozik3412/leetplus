import { closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readIdentityMailDutyRoleCatalogCurrent186FromPostgres } from "./identity-mail-duty-role-catalog-current186.mjs";
import {
  normalizeIdentityMailDutyRoleDeploymentCurrent186Config,
  runIdentityMailDutyRoleDeploymentCurrent186,
} from "./identity-mail-duty-role-deployment-current186.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const MODES = Object.freeze([
  "apply",
  "attest",
  "check",
  "emergency",
  "plan",
  "rollback",
]);
const HELP = `LeetPlus CURRENT186 privileged duty-role deployment rehearsal

Usage:
  node scripts/identity-mail-duty-role-deployment-current186.cli.mjs --check --config-file <canonical-json-path>
  node scripts/identity-mail-duty-role-deployment-current186.cli.mjs --plan --config-file <canonical-json-path>
  node scripts/identity-mail-duty-role-deployment-current186.cli.mjs --apply --config-file <canonical-json-path>
  node scripts/identity-mail-duty-role-deployment-current186.cli.mjs --attest --config-file <canonical-json-path>
  node scripts/identity-mail-duty-role-deployment-current186.cli.mjs --rollback --config-file <canonical-json-path> --receipt-file <apply-json-path>
  node scripts/identity-mail-duty-role-deployment-current186.cli.mjs --emergency --config-file <canonical-json-path>
  node scripts/identity-mail-duty-role-deployment-current186.cli.mjs --help

Safety contract:
  - CURRENT186 is a NOT_DEPLOYABLE disposable rehearsal boundary.
  - Roles must already exist with the exact configured names and OIDs.
  - This command never creates or drops a PostgreSQL role.
  - Apply and rollback serialize through the CURRENT186 ACL advisory lock.
  - Emergency is receipt-independent and commits NOLOGIN/session containment before evidence attestation.
  - Reports contain catalog metadata only and never authorize production traffic.
`;

export class IdentityMailDutyRoleDeploymentCurrent186CliError extends Error {
  constructor(reasonCode) {
    super("The CURRENT186 deployment CLI request is invalid.");
    this.name = "IdentityMailDutyRoleDeploymentCurrent186CliError";
    this.code = reasonCode;
    this.reasonCode = reasonCode;
    this.exitCode = 2;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new IdentityMailDutyRoleDeploymentCurrent186CliError(reasonCode);
}

function validPath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4_096 &&
    value === value.trim() &&
    !value.includes("\0")
  );
}

export function parseIdentityMailDutyRoleDeploymentCurrent186CliArguments(
  args,
) {
  if (args.length === 1 && args[0] === "--help") {
    return Object.freeze({
      configFile: null,
      mode: "help",
      receiptFile: null,
    });
  }
  if (!Array.isArray(args) || args.length < 3 || args.length > 6) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CLI_ARGUMENTS_INVALID");
  }
  const modeFlag = args[0];
  const mode = typeof modeFlag === "string" ? modeFlag.slice(2) : "";
  if (!modeFlag?.startsWith("--") || !MODES.includes(mode)) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CLI_ARGUMENTS_INVALID");
  }
  let configFile = null;
  let receiptFile = null;
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];
    const candidate = args[index + 1];
    if (
      token === "--config-file" &&
      configFile === null &&
      validPath(candidate)
    ) {
      configFile = candidate;
      index += 1;
      continue;
    }
    if (
      token === "--receipt-file" &&
      mode === "rollback" &&
      receiptFile === null &&
      validPath(candidate)
    ) {
      receiptFile = candidate;
      index += 1;
      continue;
    }
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CLI_ARGUMENTS_INVALID");
  }
  if (
    configFile === null ||
    (mode === "rollback" ? receiptFile === null : receiptFile !== null)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CLI_ARGUMENTS_INVALID");
  }
  return Object.freeze({ configFile, mode, receiptFile });
}

function readCanonicalJson(filePath, maximumBytes, reasonCode) {
  let descriptor;
  try {
    descriptor = openSync(filePath, "r");
    const metadata = fstatSync(descriptor);
    if (
      !metadata.isFile() ||
      metadata.size <= 0 ||
      metadata.size > maximumBytes
    ) {
      fail(reasonCode);
    }
    const bytes = readFileSync(descriptor);
    if (
      bytes.length !== metadata.size ||
      bytes.length > maximumBytes ||
      bytes.includes(0) ||
      (bytes.length >= 3 &&
        bytes[0] === 0xef &&
        bytes[1] === 0xbb &&
        bytes[2] === 0xbf)
    ) {
      fail(reasonCode);
    }
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) fail(reasonCode);
    const canonicalText = text.endsWith("\n") ? text.slice(0, -1) : text;
    let value;
    try {
      value = JSON.parse(canonicalText);
    } catch {
      fail(reasonCode);
    }
    if (canonicalStringify(value) !== canonicalText) fail(reasonCode);
    return value;
  } catch (error) {
    if (error instanceof IdentityMailDutyRoleDeploymentCurrent186CliError) {
      throw error;
    }
    fail(reasonCode);
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // A close failure cannot make an input trustworthy.
      }
    }
  }
}

export function createIdentityMailDutyRoleDeploymentCurrent186PrismaAdapter(
  client,
  { transactionCapable = true } = {},
) {
  const adapter = {
    async execute(sql, parameters = []) {
      return client.$executeRawUnsafe(sql, ...parameters);
    },
    async query(sql, parameters = []) {
      return client.$queryRawUnsafe(sql, ...parameters);
    },
    async readCatalog(expectations) {
      return readIdentityMailDutyRoleCatalogCurrent186FromPostgres(
        adapter,
        expectations,
      );
    },
  };
  if (transactionCapable) {
    adapter.transaction = (callback) =>
      client.$transaction(
        (transaction) =>
          callback(
            createIdentityMailDutyRoleDeploymentCurrent186PrismaAdapter(
              transaction,
              { transactionCapable: false },
            ),
          ),
        {
          isolationLevel: "ReadCommitted",
          maxWait: 5_000,
          timeout: 120_000,
        },
      );
  }
  return Object.freeze(adapter);
}

export async function executeIdentityMailDutyRoleDeploymentCurrent186Cli(
  args,
  {
    prismaLoader = () => import("@prisma/client"),
    runner = runIdentityMailDutyRoleDeploymentCurrent186,
  } = {},
) {
  const command =
    parseIdentityMailDutyRoleDeploymentCurrent186CliArguments(args);
  if (command.mode === "help") {
    return Object.freeze({ exitCode: 0, output: HELP });
  }
  const config = normalizeIdentityMailDutyRoleDeploymentCurrent186Config(
    readCanonicalJson(
      command.configFile,
      MAX_CONFIG_BYTES,
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CLI_CONFIG_INVALID",
    ),
  );
  const receipt =
    command.receiptFile === null
      ? null
      : readCanonicalJson(
          command.receiptFile,
          MAX_RECEIPT_BYTES,
          "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CLI_RECEIPT_INVALID",
        );
  const { PrismaClient } = await prismaLoader();
  const client = new PrismaClient({ log: [] });
  try {
    const result = await runner({
      adapter:
        createIdentityMailDutyRoleDeploymentCurrent186PrismaAdapter(client),
      config,
      mode: command.mode,
      receipt,
    });
    return Object.freeze({
      exitCode: 0,
      output: `${canonicalStringify(result)}\n`,
    });
  } finally {
    await client.$disconnect();
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
    : "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CLI_FAILED";
}

async function main() {
  const execution = await executeIdentityMailDutyRoleDeploymentCurrent186Cli(
    process.argv.slice(2),
  );
  process.stdout.write(execution.output);
  return execution.exitCode;
}

const entrypoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

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
