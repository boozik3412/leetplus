import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import pg from "pg";

import {
  FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION,
  FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
  applyFounderPilotCurrent188ProductionUpgradePlan,
  buildFounderPilotCurrent188ProductionUpgradePlan,
  createFounderPilotCurrent188ProductionUpgradePgAdapter,
  signFounderPilotCurrent188ProductionUpgradePlan,
  verifyFounderPilotCurrent188ProductionUpgradeFinal,
} from "./founder-pilot-current188-production-upgrade.mjs";
import { runBoundedFounderPilotProductionHistoryPrismaDeploy } from "./founder-pilot-production-history-production.cli.mjs";
import { materializeFounderPilotProductionHistoryLane } from "./founder-pilot-production-history-rehearsal.mjs";

const REQUIRED_CONFIRMATION =
  "run-founder-pilot-current188-production-upgrade-postgres-e2e";
const enabled =
  process.env.FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_PG_E2E_CONFIRM ===
  REQUIRED_CONFIRMATION;
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]{2,62}$/u;
const RELEASE_SHA = /^[0-9a-f]{40}$/u;
const SOURCE_MIGRATION_COUNT = 187;
const SOURCE_HEAD = "20260820010000_guest_portal_telegram_update_ledger";
const TARGET_HEAD = "20260828190000_guest_support_bug_reports";
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const SOURCE_PRISMA_ROOT = path.join(
  REPOSITORY_ROOT,
  "packages/database/prisma",
);
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const ROLLED_BACK_MIGRATIONS = Object.freeze([
  {
    checksum:
      "81f5fae590d361bc83721c62d6a8664abde60f9e00317ab51b732189c996194f",
    migrationName: "20260619190000_guest_game_visual_editor",
  },
  {
    checksum:
      "e090972dad648e997d97506f05b0e539c2351da46cdad5c6ebe5e400a113b267",
    migrationName: "20260710133000_repair_langame_credentials",
  },
  {
    checksum:
      "66c3592be463c18b029ed70846829cab33c4723f4c27a8547c1e770ceea5ce00",
    migrationName: "20260718150000_guest_game_origin_fallback",
  },
  {
    checksum:
      "6a87c9b399e34b3bc90262f32c329b768a5afc9d9afa9087569f3958bd48f922",
    migrationName: "20260725213500_guest_game_reward_wallet",
  },
]);
const LEGACY_APPLIED_CHECKSUMS = Object.freeze([
  {
    checksum:
      "98de87e5d79eb6611b0722e954fe0e7b2eb6480c7b485d9cf451ecff6dcf4341",
    migrationName: "20260518120000_guest_data_foundation",
  },
  {
    checksum:
      "226614a5e628a3d40a0fe584323d6ed2134f229092e35081ec9b05a24378eff5",
    migrationName: "20260519142000_guest_working_shifts",
  },
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredDisposableAdminUrl() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("CURRENT188_PG_E2E_NODE_ENV_REQUIRED");
  }
  const raw = process.env.DATABASE_URL;
  if (
    typeof raw !== "string" ||
    raw.length > 8192 ||
    /[\u0000-\u0020\u007f]/u.test(raw)
  ) {
    throw new Error("CURRENT188_PG_E2E_DATABASE_URL_REQUIRED");
  }
  const source = new URL(raw);
  const databaseName = decodeURIComponent(source.pathname.slice(1));
  const roleName = decodeURIComponent(source.username);
  const password = decodeURIComponent(source.password);
  const searchEntries = [...source.searchParams.entries()];
  if (
    source.protocol !== "postgresql:" ||
    source.hostname !== "127.0.0.1" ||
    source.port !== "5432" ||
    databaseName !== "leetplus_ci" ||
    roleName !== "postgres" ||
    password.length === 0 ||
    source.hash !== "" ||
    searchEntries.length !== 1 ||
    searchEntries[0][0] !== "schema" ||
    searchEntries[0][1] !== "public"
  ) {
    throw new Error("CURRENT188_PG_E2E_DATABASE_URL_FORBIDDEN");
  }
  const adminUrl = new URL(source);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  adminUrl.searchParams.set(
    "application_name",
    "current188_upgrade_pg16_fixture_admin",
  );
  return adminUrl;
}

function quotedIdentifier(value) {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error("CURRENT188_PG_E2E_IDENTIFIER_INVALID");
  }
  return `"${value}"`;
}

function quotedPassword(value) {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("CURRENT188_PG_E2E_PASSWORD_INVALID");
  }
  return `'${value}'`;
}

function credentialUrl(baseUrl, databaseName, roleName, password) {
  const value = new URL(baseUrl);
  value.pathname = `/${databaseName}`;
  value.username = roleName;
  value.password = password;
  value.search = "";
  return value;
}

function canonicalMigrationUrl(
  databaseName,
  migrationRoleName,
  migrationPassword,
  objectOwnerRoleName,
) {
  return (
    `postgresql://${migrationRoleName}:${migrationPassword}` +
    `@127.0.0.1:5432/${databaseName}` +
    `?options=-c%20role%3D${objectOwnerRoleName}`
  );
}

async function runPrismaDeploy(databaseUrl, laneRoot) {
  const prismaCliPath = require.resolve("prisma/build/index.js");
  await execFileAsync(
    process.execPath,
    [
      prismaCliPath,
      "migrate",
      "deploy",
      "--schema",
      path.join(laneRoot, "schema.prisma"),
    ],
    {
      cwd: laneRoot,
      encoding: "utf8",
      env: {
        DATABASE_URL: databaseUrl,
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        NODE_ENV: "test",
        PATH: process.env.PATH,
        TZ: "UTC",
      },
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120_000,
      windowsHide: true,
    },
  );
}

async function synchronizeAppliedChecksums(client, laneRoot) {
  const migrationsRoot = path.join(laneRoot, "migrations");
  const migrationNames = (
    await readdir(migrationsRoot, { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(migrationNames.length, SOURCE_MIGRATION_COUNT);
  assert.equal(migrationNames.at(-1), SOURCE_HEAD);

  for (const migrationName of migrationNames) {
    const checksum = sha256(
      await readFile(path.join(migrationsRoot, migrationName, "migration.sql")),
    );
    const update = await client.query(
      `
        UPDATE public."_prisma_migrations"
        SET checksum = $1
        WHERE migration_name = $2
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `,
      [checksum, migrationName],
    );
    assert.equal(update.rowCount, 1);
  }
}

function manifest({
  artifactPath,
  artifactSha256,
  databaseName,
  keyPair,
  materializedTreeDigest,
  migrationRole,
  objectOwnerRole,
  systemIdentifier,
}) {
  const publicKeyPem = keyPair.publicKey
    .export({ format: "pem", type: "spki" })
    .toString("utf8");
  const publicKeySpkiSha256 = sha256(
    keyPair.publicKey.export({ format: "der", type: "spki" }),
  );
  const releaseSha = process.env.CI_RELEASE_SHA;
  if (!RELEASE_SHA.test(releaseSha ?? "")) {
    throw new Error("CURRENT188_PG_E2E_RELEASE_SHA_REQUIRED");
  }
  return {
    approval: {
      keyId: "current188-upgrade-pg16-ci",
      maxPlanAgeSeconds: 300,
      publicKeyPem,
      publicKeySpkiSha256,
    },
    contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
    environment: "PRODUCTION",
    operation: { deployTimeoutSeconds: 120 },
    release: {
      artifactPath,
      artifactSha256,
      materializedTreeDigest,
      releaseSha,
    },
    target: {
      applicationRuntimeRoles: [
        { name: objectOwnerRole.name, oid: objectOwnerRole.oid },
      ],
      databaseName,
      expectedServerMajor: 16,
      expectedSystemIdentifier: systemIdentifier,
      host: "127.0.0.1",
      migrationRoleName: migrationRole.name,
      migrationRoleOid: migrationRole.oid,
      objectOwnerRoleName: objectOwnerRole.name,
      objectOwnerRoleOid: objectOwnerRole.oid,
      port: 5432,
    },
  };
}

function bridgeSlotAttestation(releaseSha, phase, slot, seed) {
  const source = phase === "SOURCE_187";
  const blue = slot === "blue";
  return {
    apiBaseUrl: `http://127.0.0.1:${blue ? 4100 : 4200}`,
    apiInvocationId: seed.repeat(32),
    apiUnit: `leetplus-api@${slot}.service`,
    apiUnitFileSha256: seed.repeat(64),
    authenticatedSmokeSha256: seed.repeat(64),
    authenticatedSmokeStoreCount: 4,
    authenticatedSmokeUsersCatalog: "CURRENT",
    bugReportingMode: "OFF",
    canarySafeEnvironmentSha256: seed.repeat(64),
    compatibilityMode: source ? "GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE" : null,
    compatibilityTargetMigration: source ? TARGET_HEAD : null,
    compatibilityTargetMigrationCount: source ? 188 : null,
    databaseMigration: source ? SOURCE_HEAD : TARGET_HEAD,
    databaseMigrationCount: source ? 187 : 188,
    hydratedManifestSha256: seed.repeat(64),
    hydratedSha256SumsSha256: seed.repeat(64),
    hydrationAttestationSha256: seed.repeat(64),
    releaseProvenanceMigration: TARGET_HEAD,
    releaseProvenanceMigrationCount: 188,
    releaseProvenanceSha256: seed.repeat(64),
    releaseSha,
    runtimeEnvironmentSha256: seed.repeat(64),
    runtimeRole: "COMBINED",
    schemaBridgeMode: "ALLOW_CURRENT_187",
    sha256SumsSha256: seed.repeat(64),
    slot,
    slotEnvironmentSha256: seed.repeat(64),
    slotLinkReceiptSha256: seed.repeat(64),
    symlinkManifestSha256: seed.repeat(64),
    targetMigrationSha256:
      "c40d5eeb84cc980053af48b56385bf48882ee355aec718a442dab855ea33eb9b",
    upstreamTarget: `/etc/nginx/leetplus/upstreams/${slot}.conf`,
    upstreamTargetSha256: seed.repeat(64),
    webBaseUrl: `http://127.0.0.1:${blue ? 3100 : 3200}`,
    webBuildId: releaseSha,
    webInvocationId: seed.repeat(32),
    webUnit: `leetplus-web@${slot}.service`,
    webUnitFileSha256: seed.repeat(64),
  };
}

function bridgeAttestation(releaseSha, phase) {
  return {
    acceptedAt: "2026-08-28T11:58:00.000000000Z",
    active: bridgeSlotAttestation(releaseSha, phase, "green", "1"),
    bridgeContract: "GUEST_SUPPORT_CURRENT187_DUAL_BRIDGE_CUTOVER_V2",
    cutoverGeneration: 4,
    cutoverReceiptName: `20260828T115800000000000Z-g4-${releaseSha}-green.receipt`,
    cutoverReceiptSha256: "4".repeat(64),
    latestReceiptConsumed: false,
    pendingIntentCount: 0,
    phase,
    productionControl: {
      attestationSha256: "5".repeat(64),
      installMapSha256: "6".repeat(64),
      receiptSha256: "7".repeat(64),
      releaseSha,
      rootManifestSha256: "8".repeat(64),
      verifierSha256: "9".repeat(64),
    },
    rollback: bridgeSlotAttestation("b".repeat(40), phase, "blue", "a"),
    topologyMode: "DUAL_BRIDGE_N_MINUS_ONE",
  };
}

function bridgeRuntimeAdapter(releaseSha) {
  let locks = 0;
  return {
    acquireLock: async () => {
      locks += 1;
    },
    inspectSource: async () => bridgeAttestation(releaseSha, "SOURCE_187"),
    inspectTarget: async () => bridgeAttestation(releaseSha, "TARGET_188"),
    releaseLock: async () => {
      locks -= 1;
      assert.ok(locks >= 0);
    },
  };
}

async function closeClient(client, errors) {
  if (client === null) return;
  try {
    await client.end();
  } catch (error) {
    errors.push(error);
  }
}

async function captureCleanupError(operation, errors) {
  try {
    await operation();
  } catch (error) {
    errors.push(error);
  }
}

test(
  "CURRENT_188 controller upgrades an exact production-shaped CURRENT_187 on PostgreSQL 16",
  { skip: !enabled, timeout: 240_000 },
  async () => {
    assert.equal(process.env.TZ, "America/New_York");
    const adminUrl = requiredDisposableAdminUrl();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const databaseName = `lp_current188_${suffix}_ci`;
    const objectOwnerRoleName = `lp_c188_owner_${suffix}`;
    const migrationRoleName = `lp_c188_migrate_${suffix}`;
    const objectOwnerPassword = randomBytes(32).toString("hex");
    const migrationPassword = randomBytes(32).toString("hex");
    const quotedDatabase = quotedIdentifier(databaseName);
    const quotedObjectOwner = quotedIdentifier(objectOwnerRoleName);
    const quotedMigrationRole = quotedIdentifier(migrationRoleName);
    const temporaryRoot = await mkdtemp(
      path.join(os.tmpdir(), "leetplus-current188-upgrade-pg16-"),
    );
    const targetLaneRoot = path.join(
      temporaryRoot,
      "leetplus-founder-production-history-current188-pg",
    );
    const sourceLaneRoot = path.join(temporaryRoot, "source-current187");
    const bootstrapLaneRoot = path.join(temporaryRoot, "bootstrap-current187");
    const artifactPath = path.join(temporaryRoot, "release-artifact.tar.gz");
    const artifactBytes = Buffer.from("current188-pg16-release-artifact\n");
    const keyPair = generateKeyPairSync("ed25519");

    let admin = null;
    let runtime = null;
    let adapter = null;
    let databaseCreateAttempted = false;
    let migrationCreateAttempted = false;
    let ownerCreateAttempted = false;
    let operationError = null;

    try {
      const lane = await materializeFounderPilotProductionHistoryLane({
        laneRoot: targetLaneRoot,
        sourcePrismaRoot: SOURCE_PRISMA_ROOT,
        targetMigrationCount: 188,
        targetMigrationHead: TARGET_HEAD,
      });
      await cp(targetLaneRoot, sourceLaneRoot, { recursive: true });
      await rm(path.join(sourceLaneRoot, "migrations", TARGET_HEAD), {
        recursive: true,
      });
      await cp(SOURCE_PRISMA_ROOT, bootstrapLaneRoot, { recursive: true });
      await rm(path.join(bootstrapLaneRoot, "migrations", TARGET_HEAD), {
        recursive: true,
      });
      await writeFile(artifactPath, artifactBytes, { flag: "wx", mode: 0o600 });

      admin = new pg.Client({
        application_name: "current188_upgrade_pg16_fixture_admin",
        connectionString: adminUrl.toString(),
        connectionTimeoutMillis: 5_000,
        query_timeout: 10_000,
      });
      await admin.connect();
      const cluster = await admin.query(`
        SELECT
          (pg_catalog.pg_control_system()).system_identifier::TEXT
            AS "systemIdentifier"
      `);
      assert.match(cluster.rows[0].systemIdentifier, /^\d{10,24}$/u);

      ownerCreateAttempted = true;
      await admin.query(
        `CREATE ROLE ${quotedObjectOwner} LOGIN PASSWORD ${quotedPassword(
          objectOwnerPassword,
        )} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      migrationCreateAttempted = true;
      await admin.query(
        `CREATE ROLE ${quotedMigrationRole} LOGIN PASSWORD ${quotedPassword(
          migrationPassword,
        )} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await admin.query(
        `GRANT ${quotedObjectOwner} TO ${quotedMigrationRole} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
      );
      databaseCreateAttempted = true;
      await admin.query(
        `CREATE DATABASE ${quotedDatabase} WITH OWNER ${quotedObjectOwner} TEMPLATE template0`,
      );
      const roleRows = await admin.query(
        `
          SELECT role.rolname AS "name", role.oid::INTEGER AS "oid"
          FROM pg_catalog.pg_roles AS role
          WHERE role.rolname = ANY($1::TEXT[])
          ORDER BY role.rolname COLLATE "C"
        `,
        [[migrationRoleName, objectOwnerRoleName]],
      );
      const migrationRole = roleRows.rows.find(
        (role) => role.name === migrationRoleName,
      );
      const objectOwnerRole = roleRows.rows.find(
        (role) => role.name === objectOwnerRoleName,
      );
      assert.ok(migrationRole);
      assert.ok(objectOwnerRole);
      await admin.end();
      admin = null;

      const databaseUrl = canonicalMigrationUrl(
        databaseName,
        migrationRoleName,
        migrationPassword,
        objectOwnerRoleName,
      );
      // The production-history lane is intentionally not a clean-install
      // sequence: CURRENT_179 was applied after a previously deployed branch
      // migration and therefore carries production-specific preconditions.
      // Bootstrap the disposable database with the canonical clean sequence,
      // then reproduce the exact production migration ledger before exercising
      // the CURRENT_188 controller.
      await runPrismaDeploy(databaseUrl, bootstrapLaneRoot);

      const runtimeUrl = credentialUrl(
        adminUrl,
        databaseName,
        objectOwnerRoleName,
        objectOwnerPassword,
      );
      runtime = new pg.Client({
        application_name: "current188_upgrade_pg16_fixture_runtime",
        connectionString: runtimeUrl.toString(),
        connectionTimeoutMillis: 5_000,
        query_timeout: 10_000,
      });
      await runtime.connect();
      await synchronizeAppliedChecksums(runtime, sourceLaneRoot);
      for (const row of LEGACY_APPLIED_CHECKSUMS) {
        const update = await runtime.query(
          `
            UPDATE public."_prisma_migrations"
            SET checksum = $1
            WHERE migration_name = $2
              AND finished_at IS NOT NULL
              AND rolled_back_at IS NULL
          `,
          [row.checksum, row.migrationName],
        );
        assert.equal(update.rowCount, 1);
      }
      for (const row of ROLLED_BACK_MIGRATIONS) {
        await runtime.query(
          `
            INSERT INTO public."_prisma_migrations" (
              id, checksum, migration_name, rolled_back_at, started_at
            ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `,
          [randomUUID(), row.checksum, row.migrationName],
        );
      }
      const source = await runtime.query(`
        SELECT
          pg_catalog.count(*) FILTER (
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
          )::INTEGER AS "appliedCount",
          pg_catalog.count(*) FILTER (
            WHERE rolled_back_at IS NOT NULL
          )::INTEGER AS "rolledBackCount",
          pg_catalog.max(migration_name) FILTER (
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
          ) AS "head"
        FROM public."_prisma_migrations"
      `);
      assert.deepEqual(source.rows[0], {
        appliedCount: 187,
        head: SOURCE_HEAD,
        rolledBackCount: 4,
      });

      const productionManifest = manifest({
        artifactPath,
        artifactSha256: sha256(artifactBytes),
        databaseName,
        keyPair,
        materializedTreeDigest: lane.treeDigest,
        migrationRole,
        objectOwnerRole,
        systemIdentifier: cluster.rows[0].systemIdentifier,
      });
      adapter = await createFounderPilotCurrent188ProductionUpgradePgAdapter(
        databaseUrl,
        productionManifest,
        {
          productionConfirmation:
            FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION,
        },
      );
      const now = new Date("2026-08-28T12:00:00.000Z");
      const bridgeRuntime = bridgeRuntimeAdapter(
        productionManifest.release.releaseSha,
      );
      const plan = await buildFounderPilotCurrent188ProductionUpgradePlan({
        adapter,
        laneRoot: targetLaneRoot,
        manifest: productionManifest,
        now: () => now,
        runtimeAdapter: bridgeRuntime,
        sourcePrismaRoot: SOURCE_PRISMA_ROOT,
      });
      const approval = signFounderPilotCurrent188ProductionUpgradePlan({
        manifest: productionManifest,
        plan,
        privateKeyPem: keyPair.privateKey.export({
          format: "pem",
          type: "pkcs8",
        }),
      });
      const phases = [];
      const applied = await applyFounderPilotCurrent188ProductionUpgradePlan({
        adapter,
        approval,
        confirmPlanDigest: plan.planDigest,
        deploy: ({ laneRoot, timeoutSeconds }) =>
          runBoundedFounderPilotProductionHistoryPrismaDeploy({
            databaseUrl,
            laneRoot,
            prismaCliPath: require.resolve("prisma/build/index.js"),
            timeoutSeconds,
          }),
        laneRoot: targetLaneRoot,
        manifest: productionManifest,
        now: () => new Date("2026-08-28T12:01:00.000Z"),
        onPhase: async (phase) => phases.push(phase),
        pinnedApprovalKeySpkiSha256:
          productionManifest.approval.publicKeySpkiSha256,
        plan,
        productionConfirmation:
          FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION,
        runtimeAdapter: bridgeRuntime,
        sourcePrismaRoot: SOURCE_PRISMA_ROOT,
      });
      assert.equal(applied.decision, "CURRENT188_UPGRADE_APPLIED");
      assert.equal(applied.deploymentAttempt, 1);
      assert.equal(applied.migrationCount, 188);
      assert.equal(applied.migrationHead, TARGET_HEAD);
      assert.equal(phases.at(-1)?.phase, "FINAL_188_VERIFIED");

      const final = await verifyFounderPilotCurrent188ProductionUpgradeFinal({
        adapter,
        laneRoot: targetLaneRoot,
        manifest: productionManifest,
        runtimeAdapter: bridgeRuntime,
        sourcePrismaRoot: SOURCE_PRISMA_ROOT,
      });
      assert.equal(final.migrationCount, 188);
      assert.equal(final.migrationHead, TARGET_HEAD);

      const replay = await applyFounderPilotCurrent188ProductionUpgradePlan({
        adapter,
        approval,
        confirmPlanDigest: plan.planDigest,
        deploy: async () => {
          throw new Error("REPLAY_MUST_NOT_DEPLOY");
        },
        laneRoot: targetLaneRoot,
        manifest: productionManifest,
        now: () => new Date("2026-08-28T12:02:00.000Z"),
        onPhase: async () => undefined,
        pinnedApprovalKeySpkiSha256:
          productionManifest.approval.publicKeySpkiSha256,
        plan,
        productionConfirmation:
          FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION,
        runtimeAdapter: bridgeRuntime,
        sourcePrismaRoot: SOURCE_PRISMA_ROOT,
      });
      assert.equal(replay.deploymentAttempt, 0);
      assert.equal(replay.recoveredFromLostResponse, true);

      await adapter.close();
      adapter = null;
      await runtime.end();
      runtime = null;
    } catch (error) {
      operationError = error;
    }

    const cleanupErrors = [];
    if (adapter !== null) {
      await captureCleanupError(() => adapter.close(), cleanupErrors);
      adapter = null;
    }
    await closeClient(runtime, cleanupErrors);
    runtime = null;
    await closeClient(admin, cleanupErrors);
    admin = null;

    if (
      databaseCreateAttempted ||
      migrationCreateAttempted ||
      ownerCreateAttempted
    ) {
      const cleanup = new pg.Client({
        application_name: "current188_upgrade_pg16_fixture_cleanup",
        connectionString: adminUrl.toString(),
        connectionTimeoutMillis: 5_000,
        query_timeout: 10_000,
      });
      let cleanupConnected = false;
      await captureCleanupError(async () => {
        await cleanup.connect();
        cleanupConnected = true;
      }, cleanupErrors);
      if (cleanupConnected && databaseCreateAttempted) {
        await captureCleanupError(
          () =>
            cleanup.query(
              `
                SELECT pg_catalog.pg_terminate_backend(activity.pid)
                FROM pg_catalog.pg_stat_activity AS activity
                WHERE activity.datname = $1
                  AND activity.pid <> pg_catalog.pg_backend_pid()
              `,
              [databaseName],
            ),
          cleanupErrors,
        );
        await captureCleanupError(
          () => cleanup.query(`DROP DATABASE IF EXISTS ${quotedDatabase}`),
          cleanupErrors,
        );
      }
      if (cleanupConnected && migrationCreateAttempted) {
        await captureCleanupError(
          () => cleanup.query(`DROP ROLE IF EXISTS ${quotedMigrationRole}`),
          cleanupErrors,
        );
      }
      if (cleanupConnected && ownerCreateAttempted) {
        await captureCleanupError(
          () => cleanup.query(`DROP ROLE IF EXISTS ${quotedObjectOwner}`),
          cleanupErrors,
        );
      }
      await closeClient(cleanup, cleanupErrors);
    }
    await captureCleanupError(
      () => rm(temporaryRoot, { force: true, recursive: true }),
      cleanupErrors,
    );

    if (operationError !== null || cleanupErrors.length > 0) {
      throw new AggregateError(
        [operationError, ...cleanupErrors].filter(Boolean),
        "CURRENT188_PG_E2E_FAILED",
        { cause: operationError ?? cleanupErrors[0] },
      );
    }
  },
);
