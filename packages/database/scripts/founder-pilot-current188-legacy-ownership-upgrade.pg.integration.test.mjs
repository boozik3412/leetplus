import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { createRequire } from "node:module";
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
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import {
  FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONFIRMATION,
  FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS,
  FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT,
  applyFounderPilotCurrent188LegacyOwnershipPlan,
  buildFounderPilotCurrent188LegacyOwnershipPlan,
  createFounderPilotCurrent188LegacyOwnershipLocalPostgresExecutor,
  createFounderPilotCurrent188LegacyOwnershipPgAdapter,
  signFounderPilotCurrent188LegacyOwnershipPlan,
  verifyFounderPilotCurrent188LegacyOwnershipFinal,
} from "./founder-pilot-current188-legacy-ownership-upgrade.mjs";
import { materializeFounderPilotProductionHistoryLane } from "./founder-pilot-production-history-rehearsal.mjs";

const REQUIRED_CONFIRMATION =
  "run-founder-pilot-current188-legacy-ownership-postgres-e2e";
const enabled =
  process.env.FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_PG_E2E_CONFIRM ===
  REQUIRED_CONFIRMATION;
const productionExecutorEnabled =
  process.env
    .FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_PRODUCTION_EXECUTOR_E2E ===
  "run-exact-production-executor";
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]{2,62}$/u;
const RELEASE_SHA = /^[0-9a-f]{40}$/u;
const SOURCE_MIGRATION_COUNT = 187;
const SOURCE_HEAD = "20260820010000_guest_portal_telegram_update_ledger";
const TARGET_HEAD = "20260828190000_guest_support_bug_reports";
const RUNTIME_SAFETY = Object.freeze({
  apiUnitTemplateSha256: "8".repeat(64),
  canaryEnvironmentSha256: "9".repeat(64),
  legacyDrainReceiptSha256: "f".repeat(64),
  legacyDrainVerifierOutputSha256: "2".repeat(64),
  legacyDrainVerifierSha256: "1".repeat(64),
  systemdUnitInventoryDigest: "d".repeat(64),
  workerEnvironmentDigest: "3".repeat(64),
});
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
    throw new Error("CURRENT188_LEGACY_PG_E2E_NODE_ENV_REQUIRED");
  }
  const raw = process.env.DATABASE_URL;
  if (
    typeof raw !== "string" ||
    raw.length > 8192 ||
    /[\u0000-\u0020\u007f]/u.test(raw)
  ) {
    throw new Error("CURRENT188_LEGACY_PG_E2E_DATABASE_URL_REQUIRED");
  }
  const source = new URL(raw);
  const expectedPort = productionExecutorEnabled ? "55432" : "5432";
  const entries = [...source.searchParams.entries()];
  if (
    source.protocol !== "postgresql:" ||
    source.hostname !== "127.0.0.1" ||
    source.port !== expectedPort ||
    decodeURIComponent(source.pathname.slice(1)) !== "leetplus_ci" ||
    decodeURIComponent(source.username) !== "postgres" ||
    source.password.length === 0 ||
    source.hash !== "" ||
    entries.length !== 1 ||
    entries[0][0] !== "schema" ||
    entries[0][1] !== "public"
  ) {
    throw new Error("CURRENT188_LEGACY_PG_E2E_DATABASE_URL_FORBIDDEN");
  }
  const result = new URL(source);
  result.pathname = "/postgres";
  result.search = "";
  result.searchParams.set(
    "application_name",
    "current188_legacy_owner_pg16_fixture_admin",
  );
  return result;
}

function quotedIdentifier(value) {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error("CURRENT188_LEGACY_PG_E2E_IDENTIFIER_INVALID");
  }
  return `"${value}"`;
}

function quotedPassword(value) {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("CURRENT188_LEGACY_PG_E2E_PASSWORD_INVALID");
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

function ownerMigrationUrl(
  databaseName,
  migrationRoleName,
  migrationPassword,
  ownerRoleName,
  port,
) {
  return (
    `postgresql://${migrationRoleName}:${migrationPassword}` +
    `@127.0.0.1:${port}/${databaseName}` +
    `?options=-c%20role%3D${ownerRoleName}`
  );
}

async function runPrismaDeploy(databaseUrl, laneRoot) {
  await execFileAsync(
    process.execPath,
    [
      require.resolve("prisma/build/index.js"),
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
  const names = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(names.length, SOURCE_MIGRATION_COUNT);
  assert.equal(names.at(-1), SOURCE_HEAD);
  for (const migrationName of names) {
    const checksum = sha256(
      await readFile(path.join(migrationsRoot, migrationName, "migration.sql")),
    );
    const result = await client.query(
      `UPDATE public."_prisma_migrations"
       SET checksum = $1
       WHERE migration_name = $2
         AND finished_at IS NOT NULL
         AND rolled_back_at IS NULL`,
      [checksum, migrationName],
    );
    assert.equal(result.rowCount, 1);
  }
}

function roleProjection(row) {
  return {
    bypassRls: row.bypassRls,
    canLogin: row.canLogin,
    createDb: row.createDb,
    createRole: row.createRole,
    inherit: row.inherit,
    name: row.name,
    oid: row.oid,
    replication: row.replication,
    superuser: row.superuser,
  };
}

function manifest({
  artifactPath,
  artifactSha256,
  databaseName,
  databaseOwnerRole,
  historicalOwnershipDigest,
  keyPair,
  materializedTreeDigest,
  roleMembershipDigest,
  roles,
  runtimeRole,
  systemIdentifier,
  port,
}) {
  const publicKeyPem = keyPair.publicKey
    .export({ format: "pem", type: "spki" })
    .toString("utf8");
  const publicKeySpkiSha256 = sha256(
    keyPair.publicKey.export({ format: "der", type: "spki" }),
  );
  const releaseSha = process.env.CI_RELEASE_SHA;
  if (!RELEASE_SHA.test(releaseSha ?? "")) {
    throw new Error("CURRENT188_LEGACY_PG_E2E_RELEASE_SHA_REQUIRED");
  }
  const postgresRole = roles.find(({ name }) => name === "postgres");
  assert.ok(postgresRole);
  return {
    approval: {
      keyId: "current188-legacy-pg16-ci",
      maxPlanAgeSeconds: 300,
      maxRecoveryAgeSeconds: 86400,
      publicKeyPem,
      publicKeySpkiSha256,
    },
    contractVersion: FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT,
    environment: "PRODUCTION",
    operation: { deployTimeoutSeconds: 120 },
    release: {
      artifactPath,
      artifactSha256,
      materializedTreeDigest,
      releaseSha,
    },
    runtimeSafety: {
      apiUnitTemplatePath: "/etc/systemd/system/leetplus-api@.service",
      apiUnitTemplateSha256: RUNTIME_SAFETY.apiUnitTemplateSha256,
      canaryEnvironmentPath: "/etc/leetplus/canary-safe.env",
      canaryEnvironmentSha256: RUNTIME_SAFETY.canaryEnvironmentSha256,
      expectedSystemdUnitInventoryDigest:
        RUNTIME_SAFETY.systemdUnitInventoryDigest,
      legacyDrainReceiptPath:
        "/var/lib/leetplus/legacy-drain/activation.receipt",
      legacyDrainReceiptSha256: RUNTIME_SAFETY.legacyDrainReceiptSha256,
      legacyDrainVerifierPath:
        "/usr/local/libexec/leetplus/verify-legacy-runtime-drain.sh",
      legacyDrainVerifierSha256: RUNTIME_SAFETY.legacyDrainVerifierSha256,
    },
    target: {
      activeRuntimeRoleNames: [],
      applicationRuntimeRole: {
        name: runtimeRole.name,
        oid: runtimeRole.oid,
      },
      databaseName,
      databaseOwnerRole: {
        name: databaseOwnerRole.name,
        oid: databaseOwnerRole.oid,
      },
      expectedHistoricalOwnershipDigest: historicalOwnershipDigest,
      expectedRoleMembershipDigest: roleMembershipDigest,
      expectedRoles: roles.map(roleProjection),
      expectedServerMajor: 16,
      expectedSupportCatalogDigest:
        FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.targetSupportCatalogSha256,
      expectedSystemIdentifier: systemIdentifier,
      host: "127.0.0.1",
      inspectionRole: { name: runtimeRole.name, oid: runtimeRole.oid },
      port,
      privilegedExecutionRole: {
        name: postgresRole.name,
        oid: postgresRole.oid,
      },
      socketDirectory: "/var/run/postgresql",
      workerFunctionOwnerRole: {
        name: postgresRole.name,
        oid: postgresRole.oid,
      },
    },
  };
}

function bridgeAttestation(releaseSha, phase) {
  const source = phase === "SOURCE_187";
  return {
    acceptedAt: "2026-08-29T11:58:00.000000000Z",
    activeTarget: "/etc/nginx/leetplus/upstreams/green.conf",
    activeTargetSha256: "1".repeat(64),
    apiBaseUrl: "http://127.0.0.1:4200",
    apiUnit: "leetplus-api@green.service",
    apiUnitFileSha256: "2".repeat(64),
    bridgeContract: "GUEST_SUPPORT_CURRENT187_ACTIVE_BRIDGE_CUTOVER_V1",
    bugReportingMode: "OFF",
    canarySafeEnvironmentSha256: "3".repeat(64),
    compatibilityMode: source ? "GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE" : null,
    compatibilityTargetMigration: source ? TARGET_HEAD : null,
    compatibilityTargetMigrationCount: source ? 188 : null,
    cutoverGeneration: 4,
    cutoverReceiptName: `20260829T115800000000000Z-g4-${releaseSha}-green.receipt`,
    cutoverReceiptSha256: "4".repeat(64),
    databaseMigration: source ? SOURCE_HEAD : TARGET_HEAD,
    databaseMigrationCount: source ? 187 : 188,
    latestReceiptConsumed: false,
    pendingIntentCount: 0,
    phase,
    releaseSha,
    runtimeEnvironmentSha256: "5".repeat(64),
    runtimeRole: "COMBINED",
    schemaBridgeMode: "ALLOW_CURRENT_187",
    slot: "green",
    slotEnvironmentSha256: "6".repeat(64),
    webBaseUrl: "http://127.0.0.1:3200",
    webBuildId: releaseSha,
    webUnit: "leetplus-web@green.service",
    webUnitFileSha256: "7".repeat(64),
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

function runtimeSafetyAdapter() {
  return {
    inspect: async () => ({ accepted: true, ...RUNTIME_SAFETY }),
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

test(
  "legacy mixed-owner controller upgrades CURRENT_187 and grants only support DML on PostgreSQL 16",
  { skip: !enabled, timeout: 240_000 },
  async () => {
    const adminUrl = requiredDisposableAdminUrl();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const databaseName = `lp_c188_legacy_${suffix}`;
    const ownerRoleName = `lp_c188_owner_${suffix}`;
    const runtimeRoleName = `lp_c188_runtime_${suffix}`;
    const migrationRoleName = `lp_c188_migrate_${suffix}`;
    const runtimePassword = randomBytes(32).toString("hex");
    const migrationPassword = randomBytes(32).toString("hex");
    const quotedDatabase = quotedIdentifier(databaseName);
    const quotedOwner = quotedIdentifier(ownerRoleName);
    const quotedRuntime = quotedIdentifier(runtimeRoleName);
    const quotedMigration = quotedIdentifier(migrationRoleName);
    const temporaryRoot = await mkdtemp(
      path.join(os.tmpdir(), "leetplus-current188-legacy-pg16-"),
    );
    let targetLaneRoot = path.join(
      temporaryRoot,
      "leetplus-founder-production-history-current188-legacy-pg",
    );
    const sourceLaneRoot = path.join(temporaryRoot, "source-current187");
    const bootstrapLaneRoot = path.join(temporaryRoot, "bootstrap-current187");
    const artifactPath = path.join(temporaryRoot, "release.tar.gz");
    const artifact = Buffer.from("current188-legacy-pg16-release\n");
    const keyPair = generateKeyPairSync("ed25519");
    let admin = null;
    let databaseAdmin = null;
    let runtime = null;
    let adapter = null;
    let operationError = null;
    const cleanupErrors = [];
    let createdDatabase = false;
    let createdOwner = false;
    let createdRuntime = false;
    let createdMigration = false;

    try {
      const lane = await materializeFounderPilotProductionHistoryLane({
        laneRoot: targetLaneRoot,
        sourcePrismaRoot: SOURCE_PRISMA_ROOT,
        targetMigrationCount: 188,
        targetMigrationHead: TARGET_HEAD,
      });
      if (productionExecutorEnabled) {
        const sealedLaneRoot = path.join(
          "/var/lib/leetplus/current188-legacy-lanes",
          `leetplus-founder-production-history-current188-${lane.treeDigest}`,
        );
        await cp(targetLaneRoot, sealedLaneRoot, { recursive: true });
        await rm(targetLaneRoot, { recursive: true });
        targetLaneRoot = sealedLaneRoot;
      }
      await cp(targetLaneRoot, sourceLaneRoot, { recursive: true });
      await rm(path.join(sourceLaneRoot, "migrations", TARGET_HEAD), {
        recursive: true,
      });
      await cp(SOURCE_PRISMA_ROOT, bootstrapLaneRoot, { recursive: true });
      await rm(path.join(bootstrapLaneRoot, "migrations", TARGET_HEAD), {
        recursive: true,
      });
      await writeFile(artifactPath, artifact, { flag: "wx", mode: 0o600 });

      admin = new pg.Client({
        connectionString: adminUrl.toString(),
        connectionTimeoutMillis: 5_000,
        query_timeout: 10_000,
      });
      await admin.connect();
      const cluster = await admin.query(`
        SELECT (pg_catalog.pg_control_system()).system_identifier::TEXT
          AS "systemIdentifier"
      `);
      createdOwner = true;
      await admin.query(
        `CREATE ROLE ${quotedOwner} NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      createdRuntime = true;
      await admin.query(
        `CREATE ROLE ${quotedRuntime} LOGIN PASSWORD ${quotedPassword(
          runtimePassword,
        )} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      createdMigration = true;
      await admin.query(
        `CREATE ROLE ${quotedMigration} LOGIN PASSWORD ${quotedPassword(
          migrationPassword,
        )} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await admin.query(
        `GRANT ${quotedOwner} TO ${quotedMigration} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
      );
      createdDatabase = true;
      await admin.query(
        `CREATE DATABASE ${quotedDatabase} WITH OWNER ${quotedOwner} TEMPLATE template0`,
      );
      await admin.end();
      admin = null;

      const ownerUrl = ownerMigrationUrl(
        databaseName,
        migrationRoleName,
        migrationPassword,
        ownerRoleName,
        adminUrl.port,
      );
      await runPrismaDeploy(ownerUrl, bootstrapLaneRoot);
      const migrationClient = new pg.Client({
        connectionString: ownerUrl,
        connectionTimeoutMillis: 5_000,
        query_timeout: 20_000,
      });
      await migrationClient.connect();
      await synchronizeAppliedChecksums(migrationClient, sourceLaneRoot);
      for (const row of LEGACY_APPLIED_CHECKSUMS) {
        const update = await migrationClient.query(
          `UPDATE public."_prisma_migrations"
           SET checksum = $1
           WHERE migration_name = $2
             AND finished_at IS NOT NULL
             AND rolled_back_at IS NULL`,
          [row.checksum, row.migrationName],
        );
        assert.equal(update.rowCount, 1);
      }
      for (const row of ROLLED_BACK_MIGRATIONS) {
        await migrationClient.query(
          `INSERT INTO public."_prisma_migrations" (
             id, checksum, migration_name, rolled_back_at, started_at
           ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [randomUUID(), row.checksum, row.migrationName],
        );
      }
      await migrationClient.end();

      const databaseAdminUrl = credentialUrl(
        adminUrl,
        databaseName,
        "postgres",
        decodeURIComponent(adminUrl.password),
      );
      databaseAdmin = new pg.Client({
        connectionString: databaseAdminUrl.toString(),
        connectionTimeoutMillis: 5_000,
        query_timeout: 20_000,
      });
      await databaseAdmin.connect();
      await databaseAdmin.query(
        `ALTER TABLE public."Tenant" OWNER TO postgres`,
      );
      await databaseAdmin.query(
        `ALTER FUNCTION public."identity_mail_delivery_worker_assert_v1"(TEXT) OWNER TO postgres`,
      );
      await databaseAdmin.query(
        `GRANT USAGE ON SCHEMA public TO ${quotedRuntime}`,
      );
      await databaseAdmin.query(
        `GRANT SELECT ON TABLE public."_prisma_migrations" TO ${quotedRuntime}`,
      );
      const roleRows = await databaseAdmin.query(
        `SELECT
           role.rolname AS "name", role.oid::INTEGER AS "oid",
           role.rolcanlogin AS "canLogin", role.rolcreatedb AS "createDb",
           role.rolcreaterole AS "createRole", role.rolinherit AS "inherit",
           role.rolreplication AS "replication", role.rolsuper AS "superuser",
           role.rolbypassrls AS "bypassRls"
         FROM pg_catalog.pg_roles AS role
         WHERE role.rolname = ANY($1::TEXT[])
         ORDER BY role.rolname COLLATE "C"`,
        [[ownerRoleName, runtimeRoleName, "postgres"]],
      );
      const databaseOwnerRole = roleRows.rows.find(
        ({ name }) => name === ownerRoleName,
      );
      const runtimeRole = roleRows.rows.find(
        ({ name }) => name === runtimeRoleName,
      );
      assert.ok(databaseOwnerRole);
      assert.ok(runtimeRole);
      await databaseAdmin.end();
      databaseAdmin = null;

      const runtimeUrl = credentialUrl(
        adminUrl,
        databaseName,
        runtimeRoleName,
        runtimePassword,
      );
      const draft = manifest({
        artifactPath,
        artifactSha256: sha256(artifact),
        databaseName,
        databaseOwnerRole,
        historicalOwnershipDigest: "0".repeat(64),
        keyPair,
        materializedTreeDigest: lane.treeDigest,
        roleMembershipDigest: "0".repeat(64),
        roles: roleRows.rows,
        runtimeRole,
        systemIdentifier: cluster.rows[0].systemIdentifier,
        port: Number(adminUrl.port),
      });
      const discovery =
        await createFounderPilotCurrent188LegacyOwnershipPgAdapter(
          runtimeUrl.toString(),
          draft,
          {
            productionConfirmation:
              FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONFIRMATION,
          },
        );
      const observed = await discovery.inspect();
      await discovery.close();
      assert.equal(observed.migrationCount, 187);
      assert.equal(observed.workerFunctionOwnerRoleName, "postgres");
      assert.ok(observed.ownershipCounts[ownerRoleName] > 0);
      assert.ok(observed.ownershipCounts.postgres > 0);

      const productionManifest = manifest({
        artifactPath,
        artifactSha256: sha256(artifact),
        databaseName,
        databaseOwnerRole,
        historicalOwnershipDigest: observed.historicalOwnershipDigest,
        keyPair,
        materializedTreeDigest: lane.treeDigest,
        roleMembershipDigest: observed.roleMembershipDigest,
        roles: roleRows.rows,
        runtimeRole,
        systemIdentifier: cluster.rows[0].systemIdentifier,
        port: Number(adminUrl.port),
      });
      adapter = await createFounderPilotCurrent188LegacyOwnershipPgAdapter(
        runtimeUrl.toString(),
        productionManifest,
        {
          productionConfirmation:
            FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONFIRMATION,
        },
      );
      const bridge = bridgeRuntimeAdapter(
        productionManifest.release.releaseSha,
      );
      const runtimeSafety = runtimeSafetyAdapter();
      const plan = await buildFounderPilotCurrent188LegacyOwnershipPlan({
        adapter,
        laneRoot: targetLaneRoot,
        manifest: productionManifest,
        now: () => new Date("2026-08-29T12:00:00.000Z"),
        runtimeAdapter: bridge,
        runtimeSafetyAdapter: runtimeSafety,
        sourcePrismaRoot: SOURCE_PRISMA_ROOT,
      });
      const approval = signFounderPilotCurrent188LegacyOwnershipPlan({
        manifest: productionManifest,
        plan,
        privateKeyPem: keyPair.privateKey.export({
          format: "pem",
          type: "pkcs8",
        }),
      });
      const fixtureExecutor = {
        grantRuntimeAccess: async () => {
          const grantClient = new pg.Client({
            connectionString: databaseAdminUrl.toString(),
            connectionTimeoutMillis: 5_000,
            query_timeout: 20_000,
          });
          await grantClient.connect();
          try {
            await grantClient.query(`
              BEGIN;
              REVOKE ALL PRIVILEGES ON TABLE
                public."GuestSupportAttachment",
                public."GuestSupportTicket",
                public."GuestSupportTicketAuditEvent",
                public."GuestSupportTicketComment"
              FROM PUBLIC;
              REVOKE ALL PRIVILEGES ON TYPE
                public."GuestSupportAttachmentState",
                public."GuestSupportTicketStatus"
              FROM PUBLIC;
              REVOKE ALL PRIVILEGES ON TABLE
                public."GuestSupportAttachment",
                public."GuestSupportTicket",
                public."GuestSupportTicketAuditEvent",
                public."GuestSupportTicketComment"
              FROM ${quotedRuntime};
              REVOKE ALL PRIVILEGES ON TYPE
                public."GuestSupportAttachmentState",
                public."GuestSupportTicketStatus"
              FROM ${quotedRuntime};
              GRANT SELECT, INSERT, UPDATE ON TABLE
                public."GuestSupportTicket"
              TO ${quotedRuntime};
              GRANT SELECT, INSERT ON TABLE
                public."GuestSupportAttachment",
                public."GuestSupportTicketAuditEvent",
                public."GuestSupportTicketComment"
              TO ${quotedRuntime};
              GRANT USAGE ON TYPE
                public."GuestSupportAttachmentState",
                public."GuestSupportTicketStatus"
              TO ${quotedRuntime};
              COMMIT;
            `);
            return { status: "SUCCEEDED" };
          } finally {
            await grantClient.end();
          }
        },
        migrate: async () => {
          try {
            await runPrismaDeploy(databaseAdminUrl.toString(), targetLaneRoot);
            const targetEvidence = await adapter.inspect();
            assert.equal(
              targetEvidence.support.catalogDigest,
              FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.targetSupportCatalogSha256,
            );
            return { status: "SUCCEEDED" };
          } catch {
            return { status: "FAILED" };
          }
        },
      };
      const productionExecutor = productionExecutorEnabled
        ? createFounderPilotCurrent188LegacyOwnershipLocalPostgresExecutor()
        : null;
      const requireProductionSuccess = async (operation, options) => {
        const result = await productionExecutor[operation](options);
        assert.equal(
          result.status,
          "SUCCEEDED",
          `${operation}: ${result.stderr}`,
        );
        return result;
      };
      const executor = productionExecutorEnabled
        ? {
            grantRuntimeAccess: (options) =>
              requireProductionSuccess("grantRuntimeAccess", options),
            migrate: (options) => requireProductionSuccess("migrate", options),
          }
        : fixtureExecutor;
      const applied = await applyFounderPilotCurrent188LegacyOwnershipPlan({
        adapter,
        approval,
        confirmPlanDigest: plan.planDigest,
        executor,
        laneRoot: targetLaneRoot,
        manifest: productionManifest,
        now: () => new Date("2026-08-29T12:01:00.000Z"),
        onPhase: async () => undefined,
        pinnedApprovalKeySpkiSha256:
          productionManifest.approval.publicKeySpkiSha256,
        plan,
        productionConfirmation:
          FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONFIRMATION,
        runtimeAdapter: bridge,
        runtimeSafetyAdapter: runtimeSafety,
        sourcePrismaRoot: SOURCE_PRISMA_ROOT,
      });
      assert.equal(applied.decision, "CURRENT188_LEGACY_OWNERSHIP_APPLIED");
      assert.equal(applied.migrationCount, 188);
      assert.equal(
        applied.historicalOwnershipDigest,
        observed.historicalOwnershipDigest,
      );

      const verified = await verifyFounderPilotCurrent188LegacyOwnershipFinal({
        adapter,
        laneRoot: targetLaneRoot,
        manifest: productionManifest,
        runtimeAdapter: bridge,
        runtimeSafetyAdapter: runtimeSafety,
        sourcePrismaRoot: SOURCE_PRISMA_ROOT,
      });
      assert.equal(verified.migrationHead, TARGET_HEAD);

      runtime = new pg.Client({
        connectionString: runtimeUrl.toString(),
        connectionTimeoutMillis: 5_000,
        query_timeout: 10_000,
      });
      await runtime.connect();
      const privileges = await runtime.query(`
        SELECT
          pg_catalog.has_table_privilege(
            CURRENT_USER, 'public."GuestSupportTicket"', 'SELECT,INSERT,UPDATE'
          ) AS "supportDml",
          pg_catalog.has_table_privilege(
            CURRENT_USER, 'public."GuestSupportAttachment"', 'SELECT,INSERT'
          ) AS "attachmentDml",
          pg_catalog.has_table_privilege(
            CURRENT_USER, 'public."GuestSupportAttachment"', 'UPDATE'
          ) AS "attachmentUpdate",
          pg_catalog.has_table_privilege(
            CURRENT_USER, 'public."GuestSupportTicketComment"', 'UPDATE'
          ) AS "commentUpdate",
          pg_catalog.has_table_privilege(
            CURRENT_USER, 'public."GuestSupportTicketAuditEvent"', 'UPDATE'
          ) AS "auditUpdate",
          pg_catalog.has_table_privilege(
            CURRENT_USER, 'public."GuestSupportTicket"', 'DELETE'
          ) AS "supportDelete",
          pg_catalog.has_type_privilege(
            CURRENT_USER, 'public."GuestSupportTicketStatus"', 'USAGE'
          ) AS "enumUsage",
          pg_catalog.has_schema_privilege(CURRENT_USER, 'public', 'CREATE')
            AS "schemaCreate"
      `);
      assert.deepEqual(privileges.rows[0], {
        attachmentDml: true,
        attachmentUpdate: false,
        auditUpdate: false,
        commentUpdate: false,
        enumUsage: true,
        schemaCreate: false,
        supportDelete: false,
        supportDml: true,
      });
      await runtime.end();
      runtime = null;

      const replay = await applyFounderPilotCurrent188LegacyOwnershipPlan({
        adapter,
        approval,
        confirmPlanDigest: plan.planDigest,
        executor: {
          grantRuntimeAccess: async () => {
            throw new Error("REPLAY_MUST_NOT_GRANT");
          },
          migrate: async () => {
            throw new Error("REPLAY_MUST_NOT_MIGRATE");
          },
        },
        laneRoot: targetLaneRoot,
        manifest: productionManifest,
        now: () => new Date("2026-08-29T12:02:00.000Z"),
        onPhase: async () => undefined,
        pinnedApprovalKeySpkiSha256:
          productionManifest.approval.publicKeySpkiSha256,
        plan,
        productionConfirmation:
          FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONFIRMATION,
        runtimeAdapter: bridge,
        runtimeSafetyAdapter: runtimeSafety,
        sourcePrismaRoot: SOURCE_PRISMA_ROOT,
      });
      assert.equal(replay.deploymentAttempt, 0);
      assert.equal(replay.grantAttempt, 0);
      if (productionExecutorEnabled) {
        const blocker = new pg.Client({
          connectionString: databaseAdminUrl.toString(),
          connectionTimeoutMillis: 5_000,
          query_timeout: 20_000,
        });
        await blocker.connect();
        try {
          await blocker.query("BEGIN");
          await blocker.query(
            'LOCK TABLE public."GuestSupportTicket" IN ACCESS EXCLUSIVE MODE',
          );
          const bounded = await productionExecutor.grantRuntimeAccess({
            applicationRuntimeRole: runtimeRoleName,
            target: productionManifest.target,
            timeoutSeconds: 1,
          });
          assert.ok(["AMBIGUOUS", "FAILED"].includes(bounded.status));
        } finally {
          await blocker.query("ROLLBACK").catch(() => undefined);
          await blocker.end();
        }
        const afterTimeout =
          await verifyFounderPilotCurrent188LegacyOwnershipFinal({
            adapter,
            laneRoot: targetLaneRoot,
            manifest: productionManifest,
            runtimeAdapter: bridge,
            runtimeSafetyAdapter: runtimeSafety,
            sourcePrismaRoot: SOURCE_PRISMA_ROOT,
          });
        assert.equal(afterTimeout.migrationHead, TARGET_HEAD);
      }
      await adapter.close();
      adapter = null;
    } catch (error) {
      operationError = error;
    }

    if (adapter !== null) {
      try {
        await adapter.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    await closeClient(runtime, cleanupErrors);
    await closeClient(databaseAdmin, cleanupErrors);
    await closeClient(admin, cleanupErrors);

    if (createdDatabase || createdOwner || createdRuntime || createdMigration) {
      const cleanup = new pg.Client({
        connectionString: adminUrl.toString(),
        connectionTimeoutMillis: 5_000,
        query_timeout: 10_000,
      });
      try {
        await cleanup.connect();
        if (createdDatabase) {
          await cleanup.query(
            `SELECT pg_catalog.pg_terminate_backend(activity.pid)
             FROM pg_catalog.pg_stat_activity AS activity
             WHERE activity.datname = $1
               AND activity.pid <> pg_catalog.pg_backend_pid()`,
            [databaseName],
          );
          await cleanup.query(`DROP DATABASE IF EXISTS ${quotedDatabase}`);
        }
        if (createdMigration) {
          await cleanup.query(`DROP ROLE IF EXISTS ${quotedMigration}`);
        }
        if (createdRuntime) {
          await cleanup.query(`DROP ROLE IF EXISTS ${quotedRuntime}`);
        }
        if (createdOwner) {
          await cleanup.query(`DROP ROLE IF EXISTS ${quotedOwner}`);
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
      await closeClient(cleanup, cleanupErrors);
    }
    try {
      await rm(temporaryRoot, { force: true, recursive: true });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (productionExecutorEnabled) {
      try {
        await rm(targetLaneRoot, { force: true, recursive: true });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (operationError !== null && cleanupErrors.length === 0) {
      throw operationError;
    }
    if (operationError !== null || cleanupErrors.length > 0) {
      throw new AggregateError(
        [operationError, ...cleanupErrors].filter(Boolean),
        "CURRENT188_LEGACY_PG_E2E_FAILED",
        { cause: operationError ?? cleanupErrors[0] },
      );
    }
  },
);
