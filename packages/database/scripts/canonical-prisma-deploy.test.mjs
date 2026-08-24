import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CanonicalPrismaDeployError,
  materializeCanonicalPrismaArtifact,
  normalizeMigrationSqlBytes,
} from "./canonical-prisma-deploy.mjs";

const TEMPORARY_DIRECTORIES = [];

async function fixture() {
  const root = await mkdtemp(
    path.join(tmpdir(), "leetplus-canonical-prisma-test-"),
  );
  TEMPORARY_DIRECTORIES.push(root);
  const sourcePrismaRoot = path.join(root, "source");
  const migrationsRoot = path.join(sourcePrismaRoot, "migrations");
  await mkdir(migrationsRoot, { recursive: true });
  await writeFile(
    path.join(sourcePrismaRoot, "schema.prisma"),
    "generator client {}\n",
  );
  await writeFile(
    path.join(migrationsRoot, "migration_lock.toml"),
    'provider = "postgresql"\n',
  );
  const migrations = [
    ["20260101000000_first", Buffer.from("SELECT 1;\r\n", "utf8")],
    ["20260102000000_second", Buffer.from("SELECT 2;\n", "utf8")],
  ];
  for (const [name, bytes] of migrations) {
    const directory = path.join(migrationsRoot, name);
    await mkdir(directory);
    await writeFile(path.join(directory, "migration.sql"), bytes);
  }
  return { migrations, root, sourcePrismaRoot };
}

test.after(async () => {
  await Promise.all(
    TEMPORARY_DIRECTORIES.map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

test("normalizes CRLF without changing the source and pins the canonical manifest", async () => {
  const { migrations, root, sourcePrismaRoot } = await fixture();
  const targetPrismaRoot = path.join(root, "target");
  const evidence = await materializeCanonicalPrismaArtifact({
    sourcePrismaRoot,
    targetPrismaRoot,
  });
  const expectedRows = migrations.map(([name, bytes]) => {
    const canonical = normalizeMigrationSqlBytes(bytes);
    return `${name} ${createHash("sha256").update(canonical).digest("hex")}`;
  });
  const expectedManifestDigest = createHash("sha256")
    .update(Buffer.from(`${expectedRows.join("\n")}\n`, "utf8"))
    .digest("hex");

  assert.deepEqual(evidence, {
    contractVersion: "CANONICAL_PRISMA_DEPLOY_V1",
    manifestDigest: expectedManifestDigest,
    migrationCount: 2,
    migrationHead: "20260102000000_second",
    normalizedMigrationCount: 1,
  });
  assert.equal(
    await readFile(
      path.join(
        targetPrismaRoot,
        "migrations",
        "20260101000000_first",
        "migration.sql",
      ),
      "utf8",
    ),
    "SELECT 1;\n",
  );
  assert.equal(
    await readFile(
      path.join(
        sourcePrismaRoot,
        "migrations",
        "20260101000000_first",
        "migration.sql",
      ),
      "utf8",
    ),
    "SELECT 1;\r\n",
  );
});

test("rejects non-migration entries instead of copying an ambiguous tree", async () => {
  const { root, sourcePrismaRoot } = await fixture();
  await writeFile(
    path.join(sourcePrismaRoot, "migrations", "unexpected.sql"),
    "SELECT 3;\n",
  );
  await assert.rejects(
    materializeCanonicalPrismaArtifact({
      sourcePrismaRoot,
      targetPrismaRoot: path.join(root, "target"),
    }),
    new CanonicalPrismaDeployError("CANONICAL_PRISMA_MIGRATION_TREE_INVALID"),
  );
});

test("rejects invalid UTF-8 and embedded NUL bytes", () => {
  assert.throws(
    () => normalizeMigrationSqlBytes(Buffer.from([0xc3, 0x28])),
    new CanonicalPrismaDeployError("CANONICAL_PRISMA_MIGRATION_UTF8_INVALID"),
  );
  assert.throws(
    () => normalizeMigrationSqlBytes(Buffer.from("SELECT\0 1;", "utf8")),
    new CanonicalPrismaDeployError("CANONICAL_PRISMA_MIGRATION_NUL_INVALID"),
  );
});
