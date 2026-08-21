#!/usr/bin/env node

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  AccessScopeClassificationError,
  buildAccessScopeClassificationPlan,
  checkAccessScopeClassification,
  createAccessScopeDetachedApproval,
  createAccessScopeInventory,
  createPgAccessScopeAdapter,
  executeAccessScopeClassification,
  readAccessScopeJsonFile,
  writeAccessScopeReceiptExclusive,
} from "./current-network-access-scope-classification.mjs";

const HELP = `Usage:
  node scripts/current-network-access-scope-classification.cli.mjs inventory \\
    --target <absolute-json> --output <absolute-json> \\
    [--database-url-env ACCESS_SCOPE_DATABASE_URL] \\
    [--evidence-root-env ACCESS_SCOPE_EVIDENCE_ROOT] \\
    [--hmac-key-env ACCESS_SCOPE_SUBJECT_HMAC_KEY] \\
    [--tenant-id-env ACCESS_SCOPE_TENANT_ID]

  node scripts/current-network-access-scope-classification.cli.mjs plan \\
    --inventory <absolute-json> --classifications <absolute-json> \\
    --output <absolute-json>

  node scripts/current-network-access-scope-classification.cli.mjs approve \\
    --plan <absolute-json> --direction APPLY|ROLLBACK \\
    --confirm-plan-digest <sha256> --confirm-platform-digest <sha256> \\
    --confirm I_ACCEPT_EXACT_ACCESS_SCOPE_APPLY|I_ACCEPT_EXACT_ACCESS_SCOPE_ROLLBACK \\
    --output <absolute-json>

  node scripts/current-network-access-scope-classification.cli.mjs apply \\
    --target <absolute-json> --plan <absolute-json> --approval <absolute-json> \\
    --output <absolute-json> [environment options from inventory]

  node scripts/current-network-access-scope-classification.cli.mjs rollback \\
    --target <absolute-json> --plan <absolute-json> --approval <absolute-json> \\
    --output <absolute-json> [environment options from inventory]

  node scripts/current-network-access-scope-classification.cli.mjs check \\
    --target <absolute-json> --plan <absolute-json> --direction APPLY|ROLLBACK \\
    --output <absolute-json> [environment options from inventory]

Only RESTORED_COPY targets on 127.0.0.1 and a non-5432 port are accepted.
Secrets and tenant ids are read from named environment variables; they are
never accepted as literal CLI values or printed. Every input and output must be
a direct child of the protected evidence root.`;

const ENV_NAME = /^[A-Z][A-Z0-9_]{2,100}$/u;
const COMMAND_OPTIONS = Object.freeze({
  apply: new Set([
    "approval",
    "database-url-env",
    "evidence-root-env",
    "hmac-key-env",
    "output",
    "plan",
    "target",
    "tenant-id-env",
  ]),
  approve: new Set([
    "confirm",
    "confirm-plan-digest",
    "confirm-platform-digest",
    "direction",
    "evidence-root-env",
    "output",
    "plan",
  ]),
  check: new Set([
    "database-url-env",
    "direction",
    "evidence-root-env",
    "hmac-key-env",
    "output",
    "plan",
    "target",
    "tenant-id-env",
  ]),
  inventory: new Set([
    "database-url-env",
    "evidence-root-env",
    "hmac-key-env",
    "output",
    "target",
    "tenant-id-env",
  ]),
  plan: new Set([
    "classifications",
    "evidence-root-env",
    "inventory",
    "output",
  ]),
  rollback: new Set([
    "approval",
    "database-url-env",
    "evidence-root-env",
    "hmac-key-env",
    "output",
    "plan",
    "target",
    "tenant-id-env",
  ]),
});

function fail(reasonCode) {
  throw new AccessScopeClassificationError(reasonCode);
}

export function parseAccessScopeCliArguments(argv) {
  if (!Array.isArray(argv) || argv.length === 0) fail("ACCESS_SCOPE_CLI_INVALID");
  if (argv.length === 1 && ["--help", "-h", "help"].includes(argv[0])) {
    return { command: "help", options: Object.freeze({}) };
  }
  const [command, ...tokens] = argv;
  const allowed = COMMAND_OPTIONS[command];
  if (allowed === undefined || tokens.length % 2 !== 0) {
    fail("ACCESS_SCOPE_CLI_INVALID");
  }
  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (
      typeof flag !== "string" ||
      !flag.startsWith("--") ||
      !allowed.has(flag.slice(2)) ||
      Object.hasOwn(options, flag.slice(2)) ||
      typeof value !== "string" ||
      value.length === 0 ||
      value.startsWith("--")
    ) {
      fail("ACCESS_SCOPE_CLI_INVALID");
    }
    options[flag.slice(2)] = value;
  }
  const required = {
    apply: ["approval", "output", "plan", "target"],
    approve: [
      "confirm",
      "confirm-plan-digest",
      "confirm-platform-digest",
      "direction",
      "output",
      "plan",
    ],
    check: ["direction", "output", "plan", "target"],
    inventory: ["output", "target"],
    plan: ["classifications", "inventory", "output"],
    rollback: ["approval", "output", "plan", "target"],
  }[command];
  if (required.some((key) => !Object.hasOwn(options, key))) {
    fail("ACCESS_SCOPE_CLI_REQUIRED_OPTION_MISSING");
  }
  return { command, options: Object.freeze(options) };
}

function readNamedEnvironment(options) {
  const names = {
    databaseUrl:
      options["database-url-env"] ?? "ACCESS_SCOPE_DATABASE_URL",
    hmacKey: options["hmac-key-env"] ?? "ACCESS_SCOPE_SUBJECT_HMAC_KEY",
    tenantId: options["tenant-id-env"] ?? "ACCESS_SCOPE_TENANT_ID",
  };
  for (const name of Object.values(names)) {
    if (!ENV_NAME.test(name)) fail("ACCESS_SCOPE_ENVIRONMENT_NAME_INVALID");
  }
  const values = {
    databaseUrl: process.env[names.databaseUrl],
    hmacKey: process.env[names.hmacKey],
    tenantId: process.env[names.tenantId],
  };
  if (Object.values(values).some((value) => typeof value !== "string" || value.length === 0)) {
    fail("ACCESS_SCOPE_ENVIRONMENT_VALUE_MISSING");
  }
  return values;
}

function readEvidenceRoot(options) {
  const name = options["evidence-root-env"] ?? "ACCESS_SCOPE_EVIDENCE_ROOT";
  if (!ENV_NAME.test(name)) fail("ACCESS_SCOPE_ENVIRONMENT_NAME_INVALID");
  const evidenceRoot = process.env[name];
  if (typeof evidenceRoot !== "string" || evidenceRoot.length === 0) {
    fail("ACCESS_SCOPE_EVIDENCE_ROOT_ENVIRONMENT_MISSING");
  }
  return Object.freeze({ evidenceRoot });
}

async function databaseContext(options, evidenceOptions) {
  const target = await readAccessScopeJsonFile(options.target, evidenceOptions);
  const environment = readNamedEnvironment(options);
  return {
    ...environment,
    adapter: createPgAccessScopeAdapter({
      databaseUrl: environment.databaseUrl,
      target,
    }),
    target,
  };
}

function safeStdout(result, receiptEvidence) {
  const output = {
    decision: result.decision ?? "ARTIFACT_WRITTEN",
    receiptSha256: receiptEvidence.receiptSha256,
    directorySync: receiptEvidence.directorySync,
    evidenceRootIdentityDigest: receiptEvidence.evidenceRootIdentityDigest,
    fileProtection: receiptEvidence.fileProtection,
    rootProtection: receiptEvidence.rootProtection,
    sizeBytes: receiptEvidence.sizeBytes,
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

export async function runAccessScopeCli(argv) {
  const { command, options } = parseAccessScopeCliArguments(argv);
  if (command === "help") {
    process.stdout.write(`${HELP}\n`);
    return null;
  }
  const evidenceOptions = readEvidenceRoot(options);
  let result;
  if (command === "inventory") {
    const context = await databaseContext(options, evidenceOptions);
    result = await createAccessScopeInventory({
      adapter: context.adapter,
      hmacKey: context.hmacKey,
      target: context.target,
      tenantId: context.tenantId,
    });
  } else if (command === "plan") {
    result = buildAccessScopeClassificationPlan({
      classificationManifest: await readAccessScopeJsonFile(
        options.classifications,
        evidenceOptions,
      ),
      inventory: await readAccessScopeJsonFile(
        options.inventory,
        evidenceOptions,
      ),
    });
  } else if (command === "approve") {
    result = createAccessScopeDetachedApproval({
      confirmationPhrase: options.confirm,
      confirmedPlanDigest: options["confirm-plan-digest"],
      confirmedPlatformDigest: options["confirm-platform-digest"],
      direction: options.direction,
      plan: await readAccessScopeJsonFile(options.plan, evidenceOptions),
    });
  } else if (["apply", "rollback"].includes(command)) {
    const context = await databaseContext(options, evidenceOptions);
    result = await executeAccessScopeClassification({
      adapter: context.adapter,
      approval: await readAccessScopeJsonFile(
        options.approval,
        evidenceOptions,
      ),
      direction: command === "apply" ? "APPLY" : "ROLLBACK",
      hmacKey: context.hmacKey,
      plan: await readAccessScopeJsonFile(options.plan, evidenceOptions),
      target: context.target,
      tenantId: context.tenantId,
    });
  } else if (command === "check") {
    const context = await databaseContext(options, evidenceOptions);
    result = await checkAccessScopeClassification({
      adapter: context.adapter,
      direction: options.direction,
      hmacKey: context.hmacKey,
      plan: await readAccessScopeJsonFile(options.plan, evidenceOptions),
      target: context.target,
      tenantId: context.tenantId,
    });
  } else {
    fail("ACCESS_SCOPE_CLI_INVALID");
  }
  const evidence = await writeAccessScopeReceiptExclusive(
    options.output,
    result,
    evidenceOptions,
  );
  safeStdout(result, evidence);
  return Object.freeze({ evidence, result });
}

async function main() {
  try {
    await runAccessScopeCli(process.argv.slice(2));
  } catch (error) {
    const reasonCode =
      error instanceof AccessScopeClassificationError
        ? error.reasonCode
        : "ACCESS_SCOPE_UNEXPECTED_FAILURE";
    const incidentDigest = createHash("sha256")
      .update(`access-scope-cli\0${reasonCode}`)
      .digest("hex");
    process.stderr.write(
      `${JSON.stringify({ decision: "BLOCKED", incidentDigest, reasonCode })}\n`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
