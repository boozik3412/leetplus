#!/usr/bin/env node

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY,
  assertFounderPilotRestoredCopyDatabaseUrl,
  loadFounderPilotRestoredCopyManifest,
  runFounderPilotRestoredCopyPreflight,
} from "./founder-pilot-restored-copy-preflight.mjs";

const { Client } = pg;
const DATABASE_URL_ENV = "FOUNDER_PILOT_RESTORED_COPY_DATABASE_URL";
const ACTIVATION_ROLE = "leetplus_founder_beta_activation_runtime";

function usage() {
  return `Usage:
  node founder-pilot-restored-copy-preflight.cli.mjs --manifest <absolute-json-path>

Required environment:
  ${DATABASE_URL_ENV}=postgresql://<owner>:<secret>@127.0.0.1:<non-5432>/<leetplus_restored_*>

This command is read-only. It never restores a backup, creates a role, applies a
migration, starts an application process, or contacts production/outbound services.`;
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true };
  }
  if (argv.length !== 2 || argv[0] !== "--manifest") {
    throw new Error("FOUNDER_PILOT_PREFLIGHT_ARGUMENTS_INVALID");
  }
  return { help: false, manifestPath: argv[1] };
}

function migrationManifestDigest(rows) {
  return createHash("sha256")
    .update(
      rows
        .map(({ checksum, migrationName }) => `${migrationName}\0${checksum}`)
        .join("\n"),
      "utf8",
    )
    .digest("hex");
}

async function inspectTarget(databaseUrl, expected) {
  assertFounderPilotRestoredCopyDatabaseUrl(databaseUrl, expected);
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const identity = await client.query(`
      SELECT
        pg_catalog.current_database() AS "currentDatabase",
        current_user AS "currentUser",
        pg_catalog.host(pg_catalog.inet_server_addr()) AS "serverAddress",
        pg_catalog.inet_server_port()::INTEGER AS "serverPort",
        (pg_catalog.pg_control_system()).system_identifier::TEXT AS "systemIdentifier",
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_roles AS role
          WHERE role.rolname = '${ACTIVATION_ROLE}'
        ) AS "founderActivationRoleCount",
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_stat_activity AS activity
          WHERE activity.datname = pg_catalog.current_database()
            AND activity.pid <> pg_catalog.pg_backend_pid()
        ) AS "otherTargetSessionCount"
    `);
    const migrations = await client.query(`
      SELECT
        migration."migration_name" AS "migrationName",
        migration."checksum",
        migration."finished_at" IS NOT NULL
          AND migration."rolled_back_at" IS NULL AS "applied"
      FROM public."_prisma_migrations" AS migration
      ORDER BY migration."migration_name" COLLATE "C", migration."started_at"
    `);
    await client.query("COMMIT");
    const applied = migrations.rows.filter((row) => row.applied === true);
    return {
      ...identity.rows[0],
      migrationCount: applied.length,
      migrationManifestDigest: migrationManifestDigest(applied),
      nonAppliedMigrationCount: migrations.rows.length - applied.length,
      schemaHead: applied.at(-1)?.migrationName ?? null,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The outer fail-closed result retains no database or credential details.
    }
    throw error;
  } finally {
    await client.end();
  }
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
  try {
    const manifest = await loadFounderPilotRestoredCopyManifest(
      args.manifestPath,
    );
    const databaseUrl = environment[DATABASE_URL_ENV];
    assertFounderPilotRestoredCopyDatabaseUrl(databaseUrl, manifest.target);
    const result = await runFounderPilotRestoredCopyPreflight({
      inspectTarget: (expected) => inspectTarget(databaseUrl, expected),
      manifest,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.decision === FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY
      ? 0
      : 1;
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        contractVersion: "FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_V1",
        decision: "BLOCKED_MANUAL",
        reasonCode:
          error?.safeContractError === true
            ? error.reasonCode
            : "FOUNDER_PILOT_PREFLIGHT_UNEXPECTED_FAILURE",
      })}\n`,
    );
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
