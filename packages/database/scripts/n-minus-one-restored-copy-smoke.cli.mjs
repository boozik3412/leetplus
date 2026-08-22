#!/usr/bin/env node

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  N_MINUS_ONE_PASS,
  N_MINUS_ONE_SCHEDULER_CONTRACT,
  prepareNMinusOneCheckout,
  runNMinusOneRestoredCopySmoke,
} from "./n-minus-one-restored-copy-smoke.mjs";

const DATABASE_URL_ENV = "N_MINUS_ONE_RESTORED_DATABASE_URL";
const LOGIN_EMAIL_ENV = "N_MINUS_ONE_LOGIN_EMAIL";
const LOGIN_PASSWORD_ENV = "N_MINUS_ONE_LOGIN_PASSWORD";

export function serializeSafeFailureMetadata(error) {
  const metadata = error?.safeMetadata;
  if (
    error?.safeContractError !== true ||
    !metadata ||
    typeof metadata !== "object" ||
    typeof metadata.stage !== "string" ||
    !/^[A-Z][A-Z0-9_]{2,31}$/u.test(metadata.stage)
  ) {
    return undefined;
  }
  return Object.freeze({
    exitCode: Number.isInteger(metadata.exitCode) ? metadata.exitCode : null,
    failureKind: ["EXIT", "SPAWN", "TIMEOUT"].includes(metadata.failureKind)
      ? metadata.failureKind
      : null,
    outputBytes: Number.isSafeInteger(metadata.outputBytes)
      ? metadata.outputBytes
      : null,
    outputDigest:
      typeof metadata.outputDigest === "string" &&
      /^[0-9a-f]{64}$/u.test(metadata.outputDigest)
        ? metadata.outputDigest
        : null,
    platformCode:
      typeof metadata.platformCode === "string" &&
      /^[A-Z][A-Z0-9_]{1,31}$/u.test(metadata.platformCode)
        ? metadata.platformCode
        : null,
    signal:
      typeof metadata.signal === "string" &&
      /^[A-Z][A-Z0-9]{1,31}$/u.test(metadata.signal)
        ? metadata.signal
        : null,
    stage: metadata.stage,
  });
}

function usage() {
  return `Usage:
  node n-minus-one-restored-copy-smoke.cli.mjs \\
    --repository <absolute-repository-path> \\
    --tenant-slug <existing-tenant-a-slug> \\
    --expected-system-identifier <isolated-cluster-system-id> \\
    --expected-migration-count <exact-applied-count> \\
    --expected-migration-head <exact-head-name> \\
    --api-port <alternate-loopback-port> \\
    --evidence <absolute-receipt-path> \\
    [--scheduler-compatibility]

Required secret environment (values are never printed or persisted):
  ${DATABASE_URL_ENV}=postgresql://<role>:<password>@127.0.0.1:<non-5432>/leetplus_restored_*

Required only for normal API compatibility mode:
  ${LOGIN_EMAIL_ENV}=<active-existing-tenant-a-user>
  ${LOGIN_PASSWORD_ENV}=<password>

The command creates an exact detached ${"7de04ff4ccc814494810730be3fa6bf661097b07"}
worktree, installs only from the local pnpm store, builds the legacy API, binds
it to loopback on the alternate port, blocks non-PostgreSQL network connects,
runs the compatibility smoke, cleans its exact fixture and removes the worktree.
It refuses remote/5432/non-restored databases. It never starts Web.

With --scheduler-compatibility it requires a disposable database named
leetplus_restored_scheduler_*, reproduces the six production-effective legacy
scheduler flags for a bounded 36-second window, blocks all external network,
and records aggregate query plus exact before/after evidence. The clone may be
mutated and must be discarded after the run.`;
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true };
  }
  let schedulerCompatibility = false;
  const keyValueArgs = [];
  for (const argument of argv) {
    if (argument === "--scheduler-compatibility") {
      if (schedulerCompatibility) {
        throw new Error("N_MINUS_ONE_ARGUMENTS_INVALID");
      }
      schedulerCompatibility = true;
    } else {
      keyValueArgs.push(argument);
    }
  }
  const accepted = new Set([
    "--api-port",
    "--evidence",
    "--expected-migration-count",
    "--expected-migration-head",
    "--expected-system-identifier",
    "--repository",
    "--tenant-slug",
  ]);
  const parsed = {};
  for (let index = 0; index < keyValueArgs.length; index += 2) {
    const key = keyValueArgs[index];
    const value = keyValueArgs[index + 1];
    if (
      !accepted.has(key) ||
      value === undefined ||
      parsed[key] !== undefined
    ) {
      throw new Error("N_MINUS_ONE_ARGUMENTS_INVALID");
    }
    parsed[key] = value;
  }
  if ([...accepted].some((key) => parsed[key] === undefined)) {
    throw new Error("N_MINUS_ONE_ARGUMENTS_INVALID");
  }
  return {
    apiPort: Number(parsed["--api-port"]),
    evidencePath: parsed["--evidence"],
    expectedMigrationCount: Number(parsed["--expected-migration-count"]),
    expectedMigrationHead: parsed["--expected-migration-head"],
    expectedSystemIdentifier: parsed["--expected-system-identifier"],
    help: false,
    repositoryPath: parsed["--repository"],
    schedulerCompatibility,
    tenantSlug: parsed["--tenant-slug"],
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

  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "leetplus-n-minus-one-"),
  );
  const checkoutPath = path.join(temporaryRoot, "legacy-checkout");
  try {
    await prepareNMinusOneCheckout({
      checkoutPath,
      repositoryPath: args.repositoryPath,
    });
    const receipt = await runNMinusOneRestoredCopySmoke({
      apiPort: args.apiPort,
      checkoutPath,
      databaseUrl: environment[DATABASE_URL_ENV],
      evidencePath: args.evidencePath,
      expected: {
        expectedMigrationCount: args.expectedMigrationCount,
        expectedMigrationHead: args.expectedMigrationHead,
        expectedSystemIdentifier: args.expectedSystemIdentifier,
        tenantSlug: args.tenantSlug,
      },
      loginEmail: environment[LOGIN_EMAIL_ENV],
      loginPassword: environment[LOGIN_PASSWORD_ENV],
      schedulerCompatibility: args.schedulerCompatibility,
    });
    process.stdout.write(
      `${JSON.stringify({
        contractVersion: receipt.contractVersion,
        decision: receipt.decision,
        evidenceDigest: receipt.evidenceDigest,
        legacySha: receipt.legacySha,
        reasonCode: receipt.reasonCode,
      })}\n`,
    );
    return receipt.decision === N_MINUS_ONE_PASS ? 0 : 1;
  } catch (error) {
    const failureMetadata = serializeSafeFailureMetadata(error);
    process.stdout.write(
      `${JSON.stringify({
        contractVersion: args.schedulerCompatibility
          ? N_MINUS_ONE_SCHEDULER_CONTRACT
          : "LEETPLUS_N_MINUS_ONE_RESTORED_COPY_SMOKE_V1",
        decision: "FAIL",
        legacySha: "7de04ff4ccc814494810730be3fa6bf661097b07",
        reasonCode:
          error?.safeContractError === true
            ? error.reasonCode
            : "N_MINUS_ONE_UNEXPECTED_FAILURE",
        ...(failureMetadata ? { failureMetadata } : {}),
      })}\n`,
    );
    return 1;
  } finally {
    await new Promise((resolve) => {
      void import("node:child_process").then(({ spawn }) => {
        const child = spawn(
          "git",
          ["worktree", "remove", "--force", checkoutPath],
          {
            cwd: args.repositoryPath,
            stdio: "ignore",
            windowsHide: true,
          },
        );
        child.once("exit", resolve);
        child.once("error", resolve);
      });
    });
    const resolvedRoot = path.resolve(temporaryRoot);
    const expectedPrefix = path.resolve(os.tmpdir()) + path.sep;
    if (resolvedRoot.startsWith(expectedPrefix)) {
      await rm(resolvedRoot, { force: true, recursive: true });
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
