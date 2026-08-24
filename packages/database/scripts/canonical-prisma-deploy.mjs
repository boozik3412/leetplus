#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CANONICAL_PRISMA_DEPLOY_CONTRACT = "CANONICAL_PRISMA_DEPLOY_V1";

const MIGRATION_NAME = /^\d{14}_[a-z0-9_]+$/u;
const TEMPORARY_ROOT_PREFIX = "leetplus-canonical-prisma-deploy-";
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "..");
const SOURCE_PRISMA_ROOT = path.join(DATABASE_DIRECTORY, "prisma");

export class CanonicalPrismaDeployError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "CanonicalPrismaDeployError";
    this.reasonCode = reasonCode;
  }
}

function fail(reasonCode) {
  throw new CanonicalPrismaDeployError(reasonCode);
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function assertRegularFile(filePath, reasonCode) {
  const stat = await lstat(filePath).catch(() => null);
  if (stat === null || stat.isSymbolicLink() || !stat.isFile()) {
    fail(reasonCode);
  }
}

async function assertDirectory(directoryPath, reasonCode) {
  const stat = await lstat(directoryPath).catch(() => null);
  if (stat === null || stat.isSymbolicLink() || !stat.isDirectory()) {
    fail(reasonCode);
  }
}

export function normalizeMigrationSqlBytes(sourceBytes) {
  if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length === 0) {
    fail("CANONICAL_PRISMA_MIGRATION_BYTES_INVALID");
  }
  let source;
  try {
    source = UTF8_DECODER.decode(sourceBytes);
  } catch {
    fail("CANONICAL_PRISMA_MIGRATION_UTF8_INVALID");
  }
  if (source.includes("\0")) {
    fail("CANONICAL_PRISMA_MIGRATION_NUL_INVALID");
  }
  return Buffer.from(source.replace(/\r\n?/gu, "\n"), "utf8");
}

async function inspectMigrationSource(sourcePrismaRoot) {
  if (!path.isAbsolute(sourcePrismaRoot)) {
    fail("CANONICAL_PRISMA_SOURCE_ROOT_INVALID");
  }
  await assertDirectory(
    sourcePrismaRoot,
    "CANONICAL_PRISMA_SOURCE_ROOT_INVALID",
  );
  const schemaPath = path.join(sourcePrismaRoot, "schema.prisma");
  const migrationsRoot = path.join(sourcePrismaRoot, "migrations");
  const migrationLockPath = path.join(migrationsRoot, "migration_lock.toml");
  await assertRegularFile(schemaPath, "CANONICAL_PRISMA_SCHEMA_INVALID");
  await assertDirectory(
    migrationsRoot,
    "CANONICAL_PRISMA_MIGRATIONS_ROOT_INVALID",
  );
  await assertRegularFile(
    migrationLockPath,
    "CANONICAL_PRISMA_MIGRATION_LOCK_INVALID",
  );

  const sourceEntries = await readdir(migrationsRoot, { withFileTypes: true });
  const migrationNames = sourceEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareUtf8);
  if (
    migrationNames.length === 0 ||
    new Set(migrationNames).size !== migrationNames.length ||
    migrationNames.some((name) => !MIGRATION_NAME.test(name)) ||
    sourceEntries.some(
      (entry) =>
        !(entry.isDirectory() && MIGRATION_NAME.test(entry.name)) &&
        !(entry.isFile() && entry.name === "migration_lock.toml"),
    )
  ) {
    fail("CANONICAL_PRISMA_MIGRATION_TREE_INVALID");
  }

  const migrations = [];
  for (const name of migrationNames) {
    const migrationDirectory = path.join(migrationsRoot, name);
    await assertDirectory(
      migrationDirectory,
      "CANONICAL_PRISMA_MIGRATION_DIRECTORY_INVALID",
    );
    const children = await readdir(migrationDirectory, {
      withFileTypes: true,
    });
    if (
      children.length !== 1 ||
      children[0].name !== "migration.sql" ||
      !children[0].isFile()
    ) {
      fail("CANONICAL_PRISMA_MIGRATION_DIRECTORY_INVALID");
    }
    const sourcePath = path.join(migrationDirectory, "migration.sql");
    await assertRegularFile(
      sourcePath,
      "CANONICAL_PRISMA_MIGRATION_FILE_INVALID",
    );
    const sourceBytes = await readFile(sourcePath);
    const canonicalBytes = normalizeMigrationSqlBytes(sourceBytes);
    migrations.push({
      canonicalBytes,
      name,
      normalized: !sourceBytes.equals(canonicalBytes),
      sha256: sha256(canonicalBytes),
    });
  }
  const manifestBytes = Buffer.from(
    `${migrations
      .map((migration) => `${migration.name} ${migration.sha256}`)
      .join("\n")}\n`,
    "utf8",
  );
  return {
    manifestDigest: sha256(manifestBytes),
    migrationCount: migrations.length,
    migrationHead: migrations.at(-1).name,
    migrations,
    migrationsRoot,
    migrationLockPath,
    normalizedMigrationCount: migrations.filter(({ normalized }) => normalized)
      .length,
    schemaPath,
  };
}

export async function materializeCanonicalPrismaArtifact({
  sourcePrismaRoot,
  targetPrismaRoot,
}) {
  if (!path.isAbsolute(targetPrismaRoot)) {
    fail("CANONICAL_PRISMA_TARGET_ROOT_INVALID");
  }
  const source = await inspectMigrationSource(sourcePrismaRoot);
  await mkdir(targetPrismaRoot, { recursive: false, mode: 0o700 }).catch(() =>
    fail("CANONICAL_PRISMA_TARGET_ROOT_INVALID"),
  );
  const targetMigrationsRoot = path.join(targetPrismaRoot, "migrations");
  await mkdir(targetMigrationsRoot, { mode: 0o700 });
  await copyFile(
    source.schemaPath,
    path.join(targetPrismaRoot, "schema.prisma"),
  );
  await copyFile(
    source.migrationLockPath,
    path.join(targetMigrationsRoot, "migration_lock.toml"),
  );
  for (const migration of source.migrations) {
    const targetDirectory = path.join(targetMigrationsRoot, migration.name);
    await mkdir(targetDirectory, { mode: 0o700 });
    await writeFile(
      path.join(targetDirectory, "migration.sql"),
      migration.canonicalBytes,
      { flag: "wx", mode: 0o600 },
    );
  }
  return Object.freeze({
    contractVersion: CANONICAL_PRISMA_DEPLOY_CONTRACT,
    manifestDigest: source.manifestDigest,
    migrationCount: source.migrationCount,
    migrationHead: source.migrationHead,
    normalizedMigrationCount: source.normalizedMigrationCount,
  });
}

export function usage() {
  return `Usage:
  node scripts/canonical-prisma-deploy.mjs

Runs Prisma migrate deploy from a disposable, symlink-free migration tree whose
SQL files are canonical UTF-8 with LF line endings. DATABASE_URL and all Prisma
session options retain their normal Prisma semantics.`;
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (argv.length !== 0) {
    process.stderr.write(`${usage()}\n`);
    return 2;
  }

  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), TEMPORARY_ROOT_PREFIX),
  );
  const targetPrismaRoot = path.join(temporaryRoot, "prisma");
  try {
    const evidence = await materializeCanonicalPrismaArtifact({
      sourcePrismaRoot: SOURCE_PRISMA_ROOT,
      targetPrismaRoot,
    });
    process.stdout.write(
      `${JSON.stringify({ ...evidence, decision: "ARTIFACT_READY" })}\n`,
    );
    const require = createRequire(import.meta.url);
    const prismaCliPath = require.resolve("prisma/build/index.js");
    const result = spawnSync(
      process.execPath,
      [
        prismaCliPath,
        "migrate",
        "deploy",
        "--schema",
        path.join(targetPrismaRoot, "schema.prisma"),
      ],
      {
        cwd: DATABASE_DIRECTORY,
        env: process.env,
        shell: false,
        stdio: "inherit",
        windowsHide: true,
      },
    );
    if (result.error || result.signal !== null || result.status !== 0) {
      return result.status ?? 1;
    }
    return 0;
  } catch (error) {
    const reasonCode =
      error instanceof CanonicalPrismaDeployError
        ? error.reasonCode
        : "CANONICAL_PRISMA_DEPLOY_FAILED";
    process.stderr.write(
      `${JSON.stringify({
        contractVersion: CANONICAL_PRISMA_DEPLOY_CONTRACT,
        decision: "BLOCKED",
        reasonCode,
      })}\n`,
    );
    return 1;
  } finally {
    await rm(temporaryRoot, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main();
}
