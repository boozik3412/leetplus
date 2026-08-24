#!/usr/bin/env node

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  MAX_PROTECTED_JSON_FILE_BYTES,
  readAccessScopeJsonFile,
  writeAccessScopeReceiptExclusive,
} from "./current-network-access-scope-classification.mjs";
import {
  APPROVAL_PHRASES,
  RESIDUAL_APPROVAL_PHRASES,
  StaffAttachmentReconciliationError,
  checkStaffAttachmentResidualReconciliation,
  checkStaffAttachmentReconciliation,
  createStaffAttachmentResidualReconciliationApproval,
  createStaffAttachmentResidualReconciliationPlanFromDatabase,
  createStaffAttachmentReconciliationApproval,
  createStaffAttachmentReconciliationPlanFromDatabase,
  executeStaffAttachmentResidualReconciliation,
  executeStaffAttachmentReconciliation,
  parseStaffAttachmentReconciliationRuntime,
  selfTestStaffAttachmentReconciliation,
} from "./staff-attachment-reconciliation.mjs";

const HELP = `Usage:
  node scripts/staff-attachment-reconciliation.cli.mjs --help
  node scripts/staff-attachment-reconciliation.cli.mjs --self-test

  node scripts/staff-attachment-reconciliation.cli.mjs plan \\
    --output <absolute-protected-json>

  node scripts/staff-attachment-reconciliation.cli.mjs approve \\
    --plan <absolute-protected-json> --direction APPLY|ROLLBACK \\
    --confirm-plan-digest <sha256> --confirm-action-count <integer> \\
    --confirm-review-count <integer> \\
    --confirm ${APPROVAL_PHRASES.APPLY}|${APPROVAL_PHRASES.ROLLBACK} \\
    --output <absolute-protected-json>

  node scripts/staff-attachment-reconciliation.cli.mjs apply \\
    --plan <absolute-protected-json> --approval <absolute-protected-json> \\
    --output <absolute-protected-json>

  node scripts/staff-attachment-reconciliation.cli.mjs rollback \\
    --plan <absolute-protected-json> --approval <absolute-protected-json> \\
    --output <absolute-protected-json>

  node scripts/staff-attachment-reconciliation.cli.mjs check \\
    --plan <absolute-protected-json> --direction APPLY|ROLLBACK \\
    --output <absolute-protected-json>

  node scripts/staff-attachment-reconciliation.cli.mjs residual-plan \\
    --output <absolute-protected-json>

  node scripts/staff-attachment-reconciliation.cli.mjs residual-approve \\
    --plan <absolute-protected-json> --direction APPLY|ROLLBACK \\
    --confirm-plan-digest <sha256> --confirm-action-count <integer> \\
    --confirm-binding-count <integer> --confirm-quarantine-count <integer> \\
    --confirm-review-count <integer> \\
    --confirm ${RESIDUAL_APPROVAL_PHRASES.APPLY}|${RESIDUAL_APPROVAL_PHRASES.ROLLBACK} \\
    --output <absolute-protected-json>

  node scripts/staff-attachment-reconciliation.cli.mjs residual-apply \\
    --plan <absolute-protected-json> --approval <absolute-protected-json> \\
    --output <absolute-protected-json>

  node scripts/staff-attachment-reconciliation.cli.mjs residual-rollback \\
    --plan <absolute-protected-json> --approval <absolute-protected-json> \\
    --output <absolute-protected-json>

  node scripts/staff-attachment-reconciliation.cli.mjs residual-check \\
    --plan <absolute-protected-json> --direction APPLY|ROLLBACK \\
    --output <absolute-protected-json>

Required environment for plan/apply/rollback/check:
  DATABASE_URL
  STAFF_ATTACHMENT_RECONCILIATION_TARGET=development|staging|production
  STAFF_ATTACHMENT_RECONCILIATION_RELEASE_SHA=<40 lowercase hex>
  STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_DATABASE_FINGERPRINT=<sha256>
  STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_DATABASE_NAME=<exact name>
  STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_SYSTEM_IDENTIFIER=<exact digits>
  STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_ROLE=<dedicated NOINHERIT role>
  STAFF_ATTACHMENT_RECONCILIATION_EVIDENCE_ROOT=<absolute protected directory>

Production additionally requires:
  STAFF_ATTACHMENT_RECONCILIATION_PRODUCTION_ATTESTATION=
  I_ATTEST_THIS_IS_THE_REVIEWED_STAFF_ATTACHMENT_RECONCILIATION_TARGET

STAFF_ATTACHMENT_ALLOWED_HTTPS_ORIGINS is optional and must contain HTTPS
origins only. Plan is read-only. Apply and rollback require a separately
materialized detached approval with manually re-entered exact plan digest and
counts. The base workflow never mutates review rows. The residual workflow can
bind every existing normalized primary parent or quarantine a no-parent blob,
but never deletes blob/source data and always requires a separate exact owner
approval. Non-expired PENDING rows and URL signals remain review-only.
Every input/output must be a direct child of the protected evidence root and
outputs are created exclusively; existing files are never overwritten.`;

const COMMAND_OPTIONS = Object.freeze({
  apply: new Set(["approval", "output", "plan"]),
  approve: new Set([
    "confirm",
    "confirm-action-count",
    "confirm-plan-digest",
    "confirm-review-count",
    "direction",
    "output",
    "plan",
  ]),
  check: new Set(["direction", "output", "plan"]),
  plan: new Set(["output"]),
  "residual-apply": new Set(["approval", "output", "plan"]),
  "residual-approve": new Set([
    "confirm",
    "confirm-action-count",
    "confirm-binding-count",
    "confirm-plan-digest",
    "confirm-quarantine-count",
    "confirm-review-count",
    "direction",
    "output",
    "plan",
  ]),
  "residual-check": new Set(["direction", "output", "plan"]),
  "residual-plan": new Set(["output"]),
  "residual-rollback": new Set(["approval", "output", "plan"]),
  rollback: new Set(["approval", "output", "plan"]),
});

function fail(reasonCode) {
  throw new StaffAttachmentReconciliationError(reasonCode);
}

export function parseStaffAttachmentReconciliationCliArguments(argv) {
  if (
    argv.length === 1 &&
    ["--help", "-h", "help"].includes(argv[0])
  ) {
    return { command: "help", options: Object.freeze({}) };
  }
  if (argv.length === 1 && argv[0] === "--self-test") {
    return { command: "self-test", options: Object.freeze({}) };
  }
  if (argv.length < 1) fail("ATTACHMENT_RECONCILIATION_CLI_INVALID");
  const [command, ...tokens] = argv;
  const allowed = COMMAND_OPTIONS[command];
  if (!allowed || tokens.length % 2 !== 0) {
    fail("ATTACHMENT_RECONCILIATION_CLI_INVALID");
  }
  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    const name = flag?.startsWith("--") ? flag.slice(2) : "";
    if (
      !allowed.has(name) ||
      Object.hasOwn(options, name) ||
      typeof value !== "string" ||
      value.length === 0 ||
      value.startsWith("--")
    ) {
      fail("ATTACHMENT_RECONCILIATION_CLI_INVALID");
    }
    options[name] = value;
  }
  const required = {
    apply: ["approval", "output", "plan"],
    approve: [
      "confirm",
      "confirm-action-count",
      "confirm-plan-digest",
      "confirm-review-count",
      "direction",
      "output",
      "plan",
    ],
    check: ["direction", "output", "plan"],
    plan: ["output"],
    "residual-apply": ["approval", "output", "plan"],
    "residual-approve": [
      "confirm",
      "confirm-action-count",
      "confirm-binding-count",
      "confirm-plan-digest",
      "confirm-quarantine-count",
      "confirm-review-count",
      "direction",
      "output",
      "plan",
    ],
    "residual-check": ["direction", "output", "plan"],
    "residual-plan": ["output"],
    "residual-rollback": ["approval", "output", "plan"],
    rollback: ["approval", "output", "plan"],
  }[command];
  if (required.some((name) => !Object.hasOwn(options, name))) {
    fail("ATTACHMENT_RECONCILIATION_CLI_REQUIRED_OPTION_MISSING");
  }
  return { command, options: Object.freeze(options) };
}

function evidenceOptions(environment = process.env) {
  const evidenceRoot =
    environment.STAFF_ATTACHMENT_RECONCILIATION_EVIDENCE_ROOT;
  if (typeof evidenceRoot !== "string" || evidenceRoot.length === 0) {
    fail("ATTACHMENT_RECONCILIATION_EVIDENCE_ROOT_REQUIRED");
  }
  return {
    evidenceRoot,
    maxFileBytes: MAX_PROTECTED_JSON_FILE_BYTES,
  };
}

function safeSummary(result, evidence) {
  return {
    actionCount:
      result.summary?.actionCount ?? result.actionCount ?? null,
    artifactSha256: evidence.receiptSha256,
    bindingCount:
      result.summary?.bindingCount ?? result.bindingCount ?? null,
    decision: result.decision ?? "ARTIFACT_WRITTEN",
    direction: result.direction ?? null,
    directorySync: evidence.directorySync,
    disposition: result.disposition ?? null,
    planDigest: result.planDigest ?? null,
    reviewAttachmentCount:
      result.summary?.reviewAttachmentCount ??
      result.reviewAttachmentCount ??
      null,
    quarantineAttachmentCount:
      result.summary?.quarantineAttachmentCount ??
      result.quarantineAttachmentCount ??
      null,
    sizeBytes: evidence.sizeBytes,
    zeroDiff: result.zeroDiff ?? null,
  };
}

export async function runStaffAttachmentReconciliationCli(
  argv,
  environment = process.env,
) {
  const parsed = parseStaffAttachmentReconciliationCliArguments(argv);
  if (parsed.command === "help") {
    process.stdout.write(`${HELP}\n`);
    return null;
  }
  if (parsed.command === "self-test") {
    const result = selfTestStaffAttachmentReconciliation();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  }
  const protectedRoot = evidenceOptions(environment);
  let result;
  if (parsed.command === "plan") {
    result = await createStaffAttachmentReconciliationPlanFromDatabase(
      parseStaffAttachmentReconciliationRuntime(environment),
    );
  } else if (parsed.command === "residual-plan") {
    result =
      await createStaffAttachmentResidualReconciliationPlanFromDatabase(
        parseStaffAttachmentReconciliationRuntime(environment),
      );
  } else if (parsed.command === "approve") {
    const plan = await readAccessScopeJsonFile(
      parsed.options.plan,
      protectedRoot,
    );
    result = createStaffAttachmentReconciliationApproval({
      actionCount: parsed.options["confirm-action-count"],
      confirmationPhrase: parsed.options.confirm,
      confirmedPlanDigest: parsed.options["confirm-plan-digest"],
      direction: parsed.options.direction,
      plan,
      reviewAttachmentCount: parsed.options["confirm-review-count"],
    });
  } else if (parsed.command === "residual-approve") {
    const plan = await readAccessScopeJsonFile(
      parsed.options.plan,
      protectedRoot,
    );
    result = createStaffAttachmentResidualReconciliationApproval({
      actionCount: parsed.options["confirm-action-count"],
      bindingCount: parsed.options["confirm-binding-count"],
      confirmationPhrase: parsed.options.confirm,
      confirmedPlanDigest: parsed.options["confirm-plan-digest"],
      direction: parsed.options.direction,
      plan,
      quarantineCount: parsed.options["confirm-quarantine-count"],
      reviewAttachmentCount: parsed.options["confirm-review-count"],
    });
  } else if (["apply", "rollback"].includes(parsed.command)) {
    const plan = await readAccessScopeJsonFile(
      parsed.options.plan,
      protectedRoot,
    );
    const approval = await readAccessScopeJsonFile(
      parsed.options.approval,
      protectedRoot,
    );
    result = await executeStaffAttachmentReconciliation({
      approval,
      config: parseStaffAttachmentReconciliationRuntime(environment),
      direction: parsed.command === "apply" ? "APPLY" : "ROLLBACK",
      plan,
    });
  } else if (
    ["residual-apply", "residual-rollback"].includes(parsed.command)
  ) {
    const plan = await readAccessScopeJsonFile(
      parsed.options.plan,
      protectedRoot,
    );
    const approval = await readAccessScopeJsonFile(
      parsed.options.approval,
      protectedRoot,
    );
    result = await executeStaffAttachmentResidualReconciliation({
      approval,
      config: parseStaffAttachmentReconciliationRuntime(environment),
      direction:
        parsed.command === "residual-apply" ? "APPLY" : "ROLLBACK",
      plan,
    });
  } else if (parsed.command === "check") {
    const plan = await readAccessScopeJsonFile(
      parsed.options.plan,
      protectedRoot,
    );
    result = await checkStaffAttachmentReconciliation({
      config: parseStaffAttachmentReconciliationRuntime(environment),
      direction: parsed.options.direction,
      plan,
    });
  } else if (parsed.command === "residual-check") {
    const plan = await readAccessScopeJsonFile(
      parsed.options.plan,
      protectedRoot,
    );
    result = await checkStaffAttachmentResidualReconciliation({
      config: parseStaffAttachmentReconciliationRuntime(environment),
      direction: parsed.options.direction,
      plan,
    });
  } else {
    fail("ATTACHMENT_RECONCILIATION_CLI_INVALID");
  }
  const evidence = await writeAccessScopeReceiptExclusive(
    parsed.options.output,
    result,
    protectedRoot,
  );
  process.stdout.write(`${JSON.stringify(safeSummary(result, evidence))}\n`);
  return Object.freeze({ evidence, result });
}

async function main() {
  try {
    await runStaffAttachmentReconciliationCli(process.argv.slice(2));
  } catch (error) {
    const reasonCode =
      typeof error?.reasonCode === "string" &&
      /^[A-Z][A-Z0-9_]{2,120}$/u.test(error.reasonCode)
        ? error.reasonCode
        : "ATTACHMENT_RECONCILIATION_UNEXPECTED_FAILURE";
    const incidentDigest = createHash("sha256")
      .update(`staff-attachment-reconciliation-cli\0${reasonCode}`)
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
