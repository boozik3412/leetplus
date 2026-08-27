#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  TELEGRAM_UPDATE_LEDGER_ACL_CONTRACT,
  createTelegramUpdateLedgerAclPgAdapter,
  runTelegramUpdateLedgerAclReconciliation,
} from "./telegram-update-ledger-runtime-acl-reconciliation.mjs";

const DATABASE_URL_ENV = "TELEGRAM_UPDATE_LEDGER_ACL_DATABASE_URL";
const EXPECTED_DATABASE_ENV = "TELEGRAM_UPDATE_LEDGER_ACL_EXPECTED_DATABASE";
const CONFIRMATION_ENV = "TELEGRAM_UPDATE_LEDGER_ACL_APPLY_CONFIRMATION";

function usage() {
  return `Usage:
  node telegram-update-ledger-runtime-acl-reconciliation.cli.mjs --mode <plan|check|apply>

Environment:
  ${DATABASE_URL_ENV}=postgresql://<owner>:<secret>@127.0.0.1:<port>/<database>
  ${EXPECTED_DATABASE_ENV}=<exact-database-name>
  ${CONFIRMATION_ENV}=<exact plan confirmation>  # apply only

The controller is fixed to public."GuestPortalTelegramUpdateLedger" and role
leetplus_runtime at CURRENT_187. It never creates roles or broad grants.`;
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true };
  }
  if (argv.length !== 2 || argv[0] !== "--mode") {
    throw new Error("ARGUMENTS_INVALID");
  }
  return { help: false, mode: argv[1] };
}

function safeFailure(error) {
  return {
    contractVersion: TELEGRAM_UPDATE_LEDGER_ACL_CONTRACT,
    decision: "BLOCKED_MANUAL",
    reasonCode:
      error?.safeContractError === true
        ? error.reasonCode
        : "TELEGRAM_UPDATE_LEDGER_ACL_CLI_FAILURE",
  };
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  let args;
  try {
    args = parseArgs(argv);
  } catch {
    process.stderr.write(`${usage()}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  let adapter = null;
  try {
    adapter = await createTelegramUpdateLedgerAclPgAdapter(
      environment[DATABASE_URL_ENV],
      environment[EXPECTED_DATABASE_ENV],
    );
    const result = await runTelegramUpdateLedgerAclReconciliation({
      adapter,
      confirmation:
        args.mode === "apply" ? environment[CONFIRMATION_ENV] ?? null : null,
      mode: args.mode,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return ["DRIFT_DETECTED"].includes(result.decision) ? 1 : 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(safeFailure(error), null, 2)}\n`);
    return 1;
  } finally {
    await adapter?.close().catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
