#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  RELEASE_CRITICAL_COMMANDS,
  formatCommand,
  runReleaseCriticalContract,
} from "./release-critical.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FAST_PATH = path.join(REPOSITORY_ROOT, ".github/workflows/fast-ci.yml");
const FULL_PATH = path.join(REPOSITORY_ROOT, ".github/workflows/ci.yml");

function jobBlock(workflow, jobId) {
  const match = workflow.match(new RegExp(`(?:^|\\n)  ${jobId}:\\n[\\s\\S]*?(?=\\n  [a-z0-9_-]+:\\n|$)`, "u"));
  assert.ok(match, `missing workflow job ${jobId}`);
  return match[0];
}

test("the command contract pins the late-failure gates", () => {
  assert.deepEqual(
    RELEASE_CRITICAL_COMMANDS.application.map(formatCommand),
    [
      "pnpm --filter database db:generate",
      "pnpm --filter api lint:ci:pilot-http-surface",
      "pnpm --filter api test:ci:pilot-http-surface",
    ],
  );
  assert.deepEqual(
    RELEASE_CRITICAL_COMMANDS["postgresql-assortment"].map(formatCommand),
    [
      "pnpm --filter database db:validate",
      "pnpm --filter database db:generate",
      "pnpm --filter database db:deploy",
      "pnpm --filter api test:integration:pilot-assortment-store-scope:pg",
    ],
  );
});

test("the helper exposes both contracts without executing pnpm", () => {
  for (const contract of ["application", "postgresql-assortment"]) {
    const result = spawnSync(
      process.execPath,
      [path.join(REPOSITORY_ROOT, "scripts/ci/release-critical.mjs"), contract, "--dry-run"],
      { cwd: REPOSITORY_ROOT, encoding: "utf8", windowsHide: true },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`RELEASE_CRITICAL_RESULT=${contract}:DRY_RUN`, "u"));
  }
});

test("application aggregates failures and writes one receipt per independent command", () => {
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "release-critical-application-"));
  const previous = process.env.RELEASE_CRITICAL_LOG_DIR;
  process.env.RELEASE_CRITICAL_LOG_DIR = logDirectory;
  let calls = 0;
  try {
    const exitCode = runReleaseCriticalContract("application", {
      executor: () => {
        calls += 1;
        return { status: calls === 2 ? 7 : 0, signal: null, stdout: `stdout-${calls}\n`, stderr: "" };
      },
    });
    assert.equal(exitCode, 1);
    assert.equal(calls, 3);
    assert.equal(fs.readdirSync(logDirectory).filter((name) => name.endsWith(".exit.json")).length, 3);
    assert.equal(JSON.parse(fs.readFileSync(path.join(logDirectory, "summary.json"), "utf8")).failures.length, 1);
  } finally {
    if (previous === undefined) delete process.env.RELEASE_CRITICAL_LOG_DIR;
    else process.env.RELEASE_CRITICAL_LOG_DIR = previous;
    fs.rmSync(logDirectory, { recursive: true, force: true });
  }
});

for (const contract of ["application", "postgresql-assortment"]) test(`${contract} setup stops after a failed dependency`, () => {
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "release-critical-postgresql-"));
  const previous = process.env.RELEASE_CRITICAL_LOG_DIR;
  process.env.RELEASE_CRITICAL_LOG_DIR = logDirectory;
  let calls = 0;
  try {
    const exitCode = runReleaseCriticalContract(contract, {
      executor: () => {
        calls += 1;
        return { status: 5, signal: null, stdout: "", stderr: "dependency failed\n" };
      },
    });
    assert.equal(exitCode, 1);
    assert.equal(calls, 1);
    assert.equal(fs.readdirSync(logDirectory).filter((name) => name.endsWith(".exit.json")).length, 1);
  } finally {
    if (previous === undefined) delete process.env.RELEASE_CRITICAL_LOG_DIR;
    else process.env.RELEASE_CRITICAL_LOG_DIR = previous;
    fs.rmSync(logDirectory, { recursive: true, force: true });
  }
});

test("Fast and Full use identical release-critical jobs", () => {
  const fast = fs.readFileSync(FAST_PATH, "utf8");
  const full = fs.readFileSync(FULL_PATH, "utf8");
  for (const jobId of ["release-critical-application", "release-critical-postgresql-assortment"]) {
    assert.equal(jobBlock(fast, jobId), jobBlock(full, jobId), `${jobId} drifted between Fast and Full`);
  }
});

test("release-critical jobs pass docs-only and bind exact source", () => {
  const fast = fs.readFileSync(FAST_PATH, "utf8");
  const application = jobBlock(fast, "release-critical-application");
  const postgres = jobBlock(fast, "release-critical-postgresql-assortment");

  for (const block of [application, postgres]) {
    assert.match(block, /needs: release_impact/u);
    assert.match(block, /if: needs\.release_impact\.outputs\.effective_lane == 'L0_DOCS'/u);
    assert.match(block, /ref: \$\{\{ env\.CI_RELEASE_SHA \}\}/u);
    assert.match(block, /test "\$\(git rev-parse HEAD\)" = "\$CI_RELEASE_SHA"/u);
    assert.match(block, /pnpm install --frozen-lockfile/u);
    assert.match(block, /if: always\(\)/u);
    assert.match(block, /\$\{\{ github\.workflow \}\}/u);
    assert.match(block, /if-no-files-found: error/u);
  }
  assert.match(application, /node scripts\/ci\/release-critical\.mjs application/u);
  assert.match(
    postgres,
    /node scripts\/ci\/release-critical\.mjs postgresql-assortment/u,
  );
  assert.match(postgres, /postgres:16\.14-alpine3\.24@sha256:/u);
  for (const workflowPath of [FAST_PATH, FULL_PATH]) {
    assert.match(
      fs.readFileSync(workflowPath, "utf8"),
      /DATABASE_URL: postgresql:\/\/postgres:postgres@127\.0\.0\.1:5432\/leetplus_ci\?schema=public/u,
      `${path.basename(workflowPath)} must retain the clean PostgreSQL fixture target`,
    );
  }
});

test("Full admission retains legacy dependencies and adds both critical results", () => {
  const full = fs.readFileSync(FULL_PATH, "utf8");
  for (const jobId of ["production-control-candidate", "release-handoff"]) {
    const block = jobBlock(full, jobId);
    for (const dependency of [
      "release_impact",
      "authority-root-trust",
      "release-artifact-api",
      "migration-smoke",
      "release-critical-application",
      "release-critical-postgresql-assortment",
    ]) {
      assert.match(block, new RegExp(`- ${dependency}`, "u"), `${jobId} omits ${dependency}`);
    }
  }
});

test("critical commands have one workflow owner", () => {
  const full = fs.readFileSync(FULL_PATH, "utf8");
  const fast = fs.readFileSync(FAST_PATH, "utf8");
  for (const workflow of [fast, full]) {
    assert.equal((workflow.match(/release-critical\.mjs application/gu) ?? []).length, 1);
    assert.equal((workflow.match(/release-critical\.mjs postgresql-assortment/gu) ?? []).length, 1);
    assert.doesNotMatch(workflow, /run: pnpm --filter api lint:ci:pilot-http-surface/u);
    assert.doesNotMatch(workflow, /run: pnpm --filter api test:ci:pilot-http-surface/u);
    assert.doesNotMatch(
      workflow,
      /run: pnpm --filter api test:integration:pilot-assortment-store-scope:pg/u,
    );
  }
});
