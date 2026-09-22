#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_CRITICAL_COMMANDS = Object.freeze({
  application: Object.freeze([
    Object.freeze(["--filter", "api", "lint:ci:pilot-http-surface"]),
    Object.freeze(["--filter", "api", "test:ci:pilot-http-surface"]),
  ]),
  "postgresql-assortment": Object.freeze([
    Object.freeze(["--filter", "database", "db:validate"]),
    Object.freeze(["--filter", "database", "db:generate"]),
    Object.freeze(["--filter", "database", "db:deploy"]),
    Object.freeze(["--filter", "api", "test:integration:pilot-assortment-store-scope:pg"]),
  ]),
});

function usage() {
  return "usage: node scripts/ci/release-critical.mjs <application|postgresql-assortment> [--dry-run]\n";
}

export function formatCommand(args) {
  return ["pnpm", ...args].join(" ");
}

export function runReleaseCriticalContract(
  contract,
  { dryRun = false, executor = spawnSync } = {},
) {
  const commands = RELEASE_CRITICAL_COMMANDS[contract];
  if (!commands) {
    throw new Error(`unknown release-critical contract: ${contract}`);
  }

  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  if (dryRun) {
    for (const args of commands) {
      process.stdout.write(`RELEASE_CRITICAL_COMMAND=${formatCommand(args)}\n`);
    }
    process.stdout.write(`RELEASE_CRITICAL_RESULT=${contract}:DRY_RUN\n`);
    return 0;
  }

  const logDirectory = process.env.RELEASE_CRITICAL_LOG_DIR;
  if (!logDirectory || !path.isAbsolute(logDirectory)) {
    throw new Error("RELEASE_CRITICAL_LOG_DIR must be an absolute path");
  }
  fs.mkdirSync(logDirectory, { recursive: true });
  const failures = [];

  for (const [index, args] of commands.entries()) {
    const command = formatCommand(args);
    const stem = `${String(index + 1).padStart(2, "0")}-${args.at(-1).replaceAll(/[^a-z0-9-]+/giu, "-")}`;
    process.stdout.write(`RELEASE_CRITICAL_COMMAND=${formatCommand(args)}\n`);
    const startedAt = new Date();
    const result = executor(pnpm, args, {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: "pipe",
      timeout: 10 * 60 * 1000,
      windowsHide: true,
      shell: process.platform === "win32",
    });
    const stdout = result.stdout ?? "";
    let stderr = result.stderr ?? "";
    if (result.error) stderr += `${result.error.stack ?? result.error.message}\n`;
    process.stdout.write(stdout);
    process.stderr.write(stderr);

    const exitCode = Number.isInteger(result.status) ? result.status : 1;
    const receipt = {
      contract,
      command,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      exitCode,
      signal: result.signal ?? null,
      timedOut: result.error?.code === "ETIMEDOUT",
    };
    fs.writeFileSync(path.join(logDirectory, `${stem}.stdout.log`), stdout, { flag: "wx" });
    fs.writeFileSync(path.join(logDirectory, `${stem}.stderr.log`), stderr, { flag: "wx" });
    fs.writeFileSync(
      path.join(logDirectory, `${stem}.exit.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
      { flag: "wx" },
    );

    if (exitCode !== 0) {
      failures.push({ command, exitCode });
      process.stderr.write(`RELEASE_CRITICAL_FAILURE=${contract} command=${command} exit=${exitCode}\n`);
      if (contract === "postgresql-assortment") break;
    }
  }

  if (failures.length > 0) {
    fs.writeFileSync(
      path.join(logDirectory, "summary.json"),
      `${JSON.stringify({ contract, result: "FAIL", failures }, null, 2)}\n`,
      { flag: "wx" },
    );
    return 1;
  }
  fs.writeFileSync(
    path.join(logDirectory, "summary.json"),
    `${JSON.stringify({ contract, result: "PASS", failures: [] }, null, 2)}\n`,
    { flag: "wx" },
  );
  process.stdout.write(`RELEASE_CRITICAL_RESULT=${contract}:PASS\n`);
  return 0;
}

const isEntrypoint = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isEntrypoint) {
  const args = process.argv.slice(2);
  const dryRunIndex = args.indexOf("--dry-run");
  const dryRun = dryRunIndex !== -1;
  if (dryRun) args.splice(dryRunIndex, 1);
  if (args.length !== 1 || !Object.hasOwn(RELEASE_CRITICAL_COMMANDS, args[0])) {
    process.stderr.write(usage());
    process.exitCode = 2;
  } else {
    try {
      process.exitCode = runReleaseCriticalContract(args[0], { dryRun });
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
