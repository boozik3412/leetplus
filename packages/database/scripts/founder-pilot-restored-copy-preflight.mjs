import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

export const FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT =
  "FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_V1";
export const FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY =
  "READY_FOR_RESTORED_COPY_DATABASE_REHEARSAL";
export const FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_BLOCKED = "BLOCKED_MANUAL";
export const FOUNDER_PILOT_ACTIVATION_ROLE =
  "leetplus_founder_beta_activation_runtime";

const SHA256 = /^[0-9a-f]{64}$/u;
const RELEASE_SHA = /^[0-9a-f]{40}$/u;
const SAFE_ROLE = /^[a-z][a-z0-9_]{2,62}$/u;
const SAFE_DATABASE = /^leetplus_(?:rehearsal|restored)_[a-z0-9_]{3,48}$/u;
const LOOPBACK_HOST = "127.0.0.1";
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_MANIFEST_BYTES = 64 * 1024;
const acceptedPreflightReceipts = new WeakSet();

export class FounderPilotRestoredCopyPreflightError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "FounderPilotRestoredCopyPreflightError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new FounderPilotRestoredCopyPreflightError(reasonCode);
}

function exactRecord(value, keys, reasonCode) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(reasonCode);
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactString(value, pattern, reasonCode) {
  if (typeof value !== "string" || !pattern.test(value)) fail(reasonCode);
  return value;
}

function exactInteger(value, minimum, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(reasonCode);
  }
  return value;
}

function exactBoolean(value, expected, reasonCode) {
  if (value !== expected) fail(reasonCode);
  return value;
}

function absoluteFilePath(value, reasonCode) {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 4096 ||
    value.trim() !== value ||
    !path.isAbsolute(value)
  ) {
    fail(reasonCode);
  }
  return value;
}

function normalizeManifest(value) {
  const manifest = exactRecord(
    value,
    [
      "backup",
      "contractVersion",
      "isolation",
      "release",
      "retention",
      "target",
    ],
    "FOUNDER_PILOT_RESTORED_COPY_MANIFEST_INVALID",
  );
  if (
    manifest.contractVersion !== FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT
  ) {
    fail("FOUNDER_PILOT_RESTORED_COPY_CONTRACT_INVALID");
  }

  const release = exactRecord(
    manifest.release,
    ["artifactPath", "artifactSha256", "releaseSha"],
    "FOUNDER_PILOT_RESTORED_COPY_RELEASE_INVALID",
  );
  const backup = exactRecord(
    manifest.backup,
    ["backupPath", "backupSha256", "capturedAt"],
    "FOUNDER_PILOT_RESTORED_COPY_BACKUP_INVALID",
  );
  const target = exactRecord(
    manifest.target,
    [
      "databaseName",
      "expectedSystemIdentifier",
      "host",
      "ownerRoleName",
      "port",
      "sourceMigrationCount",
      "sourceMigrationManifestDigest",
      "sourceSchemaHead",
    ],
    "FOUNDER_PILOT_RESTORED_COPY_TARGET_INVALID",
  );
  const isolation = exactRecord(
    manifest.isolation,
    [
      "apiStarted",
      "databaseOnly",
      "langameEnabled",
      "productionServiceTokensMounted",
      "schedulersEnabled",
      "smtpEnabled",
      "telegramEnabled",
      "workersStarted",
    ],
    "FOUNDER_PILOT_RESTORED_COPY_ISOLATION_INVALID",
  );
  const retention = exactRecord(
    manifest.retention,
    ["deleteBy", "rpoSeconds", "rtoSeconds"],
    "FOUNDER_PILOT_RESTORED_COPY_RETENTION_INVALID",
  );

  exactString(
    release.releaseSha,
    RELEASE_SHA,
    "FOUNDER_PILOT_RELEASE_SHA_INVALID",
  );
  exactString(
    release.artifactSha256,
    SHA256,
    "FOUNDER_PILOT_ARTIFACT_DIGEST_INVALID",
  );
  absoluteFilePath(release.artifactPath, "FOUNDER_PILOT_ARTIFACT_PATH_INVALID");
  exactString(
    backup.backupSha256,
    SHA256,
    "FOUNDER_PILOT_BACKUP_DIGEST_INVALID",
  );
  absoluteFilePath(backup.backupPath, "FOUNDER_PILOT_BACKUP_PATH_INVALID");
  exactString(
    backup.capturedAt,
    ISO_TIMESTAMP,
    "FOUNDER_PILOT_BACKUP_TIME_INVALID",
  );

  exactString(
    target.databaseName,
    SAFE_DATABASE,
    "FOUNDER_PILOT_TARGET_DATABASE_INVALID",
  );
  if (target.host !== LOOPBACK_HOST)
    fail("FOUNDER_PILOT_TARGET_HOST_NOT_ISOLATED");
  exactInteger(target.port, 1024, 65535, "FOUNDER_PILOT_TARGET_PORT_INVALID");
  if (target.port === 5432) fail("FOUNDER_PILOT_TARGET_PORT_NOT_ISOLATED");
  exactString(
    target.ownerRoleName,
    SAFE_ROLE,
    "FOUNDER_PILOT_TARGET_OWNER_INVALID",
  );
  if (
    typeof target.expectedSystemIdentifier !== "string" ||
    !/^\d{10,24}$/u.test(target.expectedSystemIdentifier)
  ) {
    fail("FOUNDER_PILOT_TARGET_SYSTEM_IDENTIFIER_INVALID");
  }
  exactInteger(
    target.sourceMigrationCount,
    1,
    10000,
    "FOUNDER_PILOT_SOURCE_MIGRATION_COUNT_INVALID",
  );
  exactString(
    target.sourceMigrationManifestDigest,
    SHA256,
    "FOUNDER_PILOT_SOURCE_MIGRATION_DIGEST_INVALID",
  );
  if (
    typeof target.sourceSchemaHead !== "string" ||
    !/^\d{14}_[a-z0-9_]{3,100}$/u.test(target.sourceSchemaHead)
  ) {
    fail("FOUNDER_PILOT_SOURCE_SCHEMA_HEAD_INVALID");
  }

  exactBoolean(
    isolation.databaseOnly,
    true,
    "FOUNDER_PILOT_DATABASE_ONLY_REQUIRED",
  );
  for (const key of [
    "apiStarted",
    "langameEnabled",
    "productionServiceTokensMounted",
    "schedulersEnabled",
    "smtpEnabled",
    "telegramEnabled",
    "workersStarted",
  ]) {
    exactBoolean(
      isolation[key],
      false,
      `FOUNDER_PILOT_${key.replace(/[A-Z]/gu, (letter) => `_${letter}`).toUpperCase()}_FORBIDDEN`,
    );
  }

  exactString(
    retention.deleteBy,
    ISO_TIMESTAMP,
    "FOUNDER_PILOT_DELETE_BY_INVALID",
  );
  exactInteger(
    retention.rpoSeconds,
    0,
    7 * 24 * 60 * 60,
    "FOUNDER_PILOT_RPO_INVALID",
  );
  exactInteger(
    retention.rtoSeconds,
    1,
    7 * 24 * 60 * 60,
    "FOUNDER_PILOT_RTO_INVALID",
  );

  return Object.freeze({
    backup: Object.freeze({ ...backup }),
    contractVersion: manifest.contractVersion,
    isolation: Object.freeze({ ...isolation }),
    release: Object.freeze({ ...release }),
    retention: Object.freeze({ ...retention }),
    target: Object.freeze({ ...target }),
  });
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT}\0${domain}\0`)
    .update(stableJson(value))
    .digest("hex");
}

export function founderPilotRestoredCopyManifestDigest(value) {
  return digest("manifest", normalizeManifest(value));
}

export function assertFounderPilotRestoredCopyPreflightReceipt(
  receipt,
  manifest,
) {
  if (
    receipt === null ||
    typeof receipt !== "object" ||
    !acceptedPreflightReceipts.has(receipt) ||
    receipt.contractVersion !==
      FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT ||
    receipt.decision !== FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY ||
    receipt.reasonCode !== null ||
    receipt.manifestDigest !==
      founderPilotRestoredCopyManifestDigest(manifest) ||
    receipt.evidence?.releaseSha !== manifest.release.releaseSha ||
    receipt.evidence?.artifactSha256 !== manifest.release.artifactSha256 ||
    receipt.evidence?.backupSha256 !== manifest.backup.backupSha256 ||
    receipt.evidence?.sourceMigrationCount !==
      manifest.target.sourceMigrationCount ||
    receipt.evidence?.sourceSchemaHead !== manifest.target.sourceSchemaHead ||
    receipt.evidence?.sourceMigrationManifestDigest !==
      manifest.target.sourceMigrationManifestDigest ||
    !SHA256.test(receipt.evidenceDigest)
  ) {
    fail("FOUNDER_PILOT_PREFLIGHT_RECEIPT_NOT_LIVE");
  }
  return receipt;
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs]
    .map((part) => part.toString())
    .join(":");
}

export async function inspectFounderPilotImmutableFile({
  expectedSha256,
  filePath,
}) {
  const pathStat = await lstat(filePath, { bigint: true });
  if (pathStat.isSymbolicLink() || !pathStat.isFile()) {
    fail("FOUNDER_PILOT_EVIDENCE_FILE_INVALID");
  }
  const canonicalPath = await realpath(filePath);
  const handle = await open(canonicalPath, fsConstants.O_RDONLY);
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      fileIdentity(pathStat) !== fileIdentity(before) ||
      before.size <= 0n ||
      before.size > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      fail("FOUNDER_PILOT_EVIDENCE_FILE_INVALID");
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0n;
    while (position < before.size) {
      const remaining = before.size - position;
      const length = Number(
        remaining < BigInt(buffer.length) ? remaining : BigInt(buffer.length),
      );
      const { bytesRead } = await handle.read(
        buffer,
        0,
        length,
        Number(position),
      );
      if (bytesRead <= 0) fail("FOUNDER_PILOT_EVIDENCE_FILE_TORN");
      hash.update(buffer.subarray(0, bytesRead));
      position += BigInt(bytesRead);
    }
    const after = await handle.stat({ bigint: true });
    if (fileIdentity(before) !== fileIdentity(after)) {
      fail("FOUNDER_PILOT_EVIDENCE_FILE_TORN");
    }
    const actualSha256 = hash.digest("hex");
    if (actualSha256 !== expectedSha256) {
      fail("FOUNDER_PILOT_EVIDENCE_FILE_DIGEST_MISMATCH");
    }
    return Object.freeze({
      actualSha256,
      identityDigest: digest("file-identity", {
        canonicalPath,
        identity: fileIdentity(after),
      }),
      sizeBytes: after.size.toString(),
    });
  } finally {
    await handle.close();
  }
}

export async function loadFounderPilotRestoredCopyManifest(manifestPath) {
  absoluteFilePath(manifestPath, "FOUNDER_PILOT_MANIFEST_PATH_INVALID");
  const pathStat = await lstat(manifestPath, { bigint: true });
  if (pathStat.isSymbolicLink() || !pathStat.isFile()) {
    fail("FOUNDER_PILOT_MANIFEST_FILE_INVALID");
  }
  const handle = await open(await realpath(manifestPath), fsConstants.O_RDONLY);
  try {
    const stat = await handle.stat({ bigint: true });
    if (
      !stat.isFile() ||
      fileIdentity(pathStat) !== fileIdentity(stat) ||
      stat.size <= 0n ||
      stat.size > MAX_MANIFEST_BYTES
    ) {
      fail("FOUNDER_PILOT_MANIFEST_FILE_INVALID");
    }
    const buffer = Buffer.alloc(Number(stat.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const after = await handle.stat({ bigint: true });
    if (
      bytesRead !== buffer.length ||
      fileIdentity(stat) !== fileIdentity(after)
    ) {
      fail("FOUNDER_PILOT_MANIFEST_FILE_TORN");
    }
    let value;
    try {
      value = JSON.parse(buffer.toString("utf8"));
    } catch {
      fail("FOUNDER_PILOT_MANIFEST_JSON_INVALID");
    }
    return normalizeManifest(value);
  } finally {
    await handle.close();
  }
}

export function assertFounderPilotRestoredCopyDatabaseUrl(databaseUrl, target) {
  if (typeof databaseUrl !== "string" || databaseUrl.length > 8192) {
    fail("FOUNDER_PILOT_TARGET_DATABASE_URL_INVALID");
  }
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail("FOUNDER_PILOT_TARGET_DATABASE_URL_INVALID");
  }
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.hostname !== target.host ||
    Number(parsed.port) !== target.port ||
    databaseName !== target.databaseName ||
    parsed.username !== target.ownerRoleName ||
    parsed.password.length < 16
  ) {
    fail("FOUNDER_PILOT_TARGET_DATABASE_URL_MISMATCH");
  }
  return Object.freeze({
    databaseName,
    host: parsed.hostname,
    ownerRoleName: parsed.username,
    port: Number(parsed.port),
  });
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

export async function inspectFounderPilotRestoredCopyTarget(
  databaseUrl,
  expected,
) {
  assertFounderPilotRestoredCopyDatabaseUrl(databaseUrl, expected);
  const { Client } = pg;
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const identity = await client.query(
      `
        SELECT
          pg_catalog.current_database() AS "currentDatabase",
          current_user AS "currentUser",
          pg_catalog.host(pg_catalog.inet_server_addr()) AS "serverAddress",
          pg_catalog.inet_server_port()::INTEGER AS "serverPort",
          (pg_catalog.pg_control_system()).system_identifier::TEXT AS "systemIdentifier",
          (
            SELECT pg_catalog.count(*)::INTEGER
            FROM pg_catalog.pg_roles AS role
            WHERE role.rolname = $1
          ) AS "founderActivationRoleCount",
          (
            SELECT pg_catalog.count(*)::INTEGER
            FROM pg_catalog.pg_stat_activity AS activity
            WHERE activity.datname = pg_catalog.current_database()
              AND activity.pid <> pg_catalog.pg_backend_pid()
          ) AS "otherTargetSessionCount"
      `,
      [FOUNDER_PILOT_ACTIVATION_ROLE],
    );
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

function validateTargetEvidence(evidence, target) {
  const value = exactRecord(
    evidence,
    [
      "currentDatabase",
      "currentUser",
      "founderActivationRoleCount",
      "migrationCount",
      "migrationManifestDigest",
      "nonAppliedMigrationCount",
      "otherTargetSessionCount",
      "schemaHead",
      "serverAddress",
      "serverPort",
      "systemIdentifier",
    ],
    "FOUNDER_PILOT_TARGET_EVIDENCE_INVALID",
  );
  if (
    value.currentDatabase !== target.databaseName ||
    value.currentUser !== target.ownerRoleName ||
    value.serverAddress !== target.host ||
    value.serverPort !== target.port ||
    value.systemIdentifier !== target.expectedSystemIdentifier
  ) {
    fail("FOUNDER_PILOT_TARGET_IDENTITY_MISMATCH");
  }
  if (
    value.migrationCount !== target.sourceMigrationCount ||
    value.schemaHead !== target.sourceSchemaHead ||
    value.migrationManifestDigest !== target.sourceMigrationManifestDigest ||
    value.nonAppliedMigrationCount !== 0
  ) {
    fail("FOUNDER_PILOT_TARGET_MIGRATION_STATE_MISMATCH");
  }
  if (value.founderActivationRoleCount !== 0) {
    fail("FOUNDER_PILOT_TARGET_RUNTIME_ROLE_ALREADY_PRESENT");
  }
  if (value.otherTargetSessionCount !== 0) {
    fail("FOUNDER_PILOT_TARGET_CONCURRENT_SESSION_PRESENT");
  }
  return value;
}

function validateFileEvidence(evidence) {
  const value = exactRecord(
    evidence,
    ["actualSha256", "identityDigest", "sizeBytes"],
    "FOUNDER_PILOT_FILE_EVIDENCE_INVALID",
  );
  exactString(
    value.actualSha256,
    SHA256,
    "FOUNDER_PILOT_FILE_EVIDENCE_INVALID",
  );
  exactString(
    value.identityDigest,
    SHA256,
    "FOUNDER_PILOT_FILE_EVIDENCE_INVALID",
  );
  if (
    typeof value.sizeBytes !== "string" ||
    !/^[1-9]\d{0,20}$/u.test(value.sizeBytes)
  ) {
    fail("FOUNDER_PILOT_FILE_EVIDENCE_INVALID");
  }
  return value;
}

function blocked(reasonCode, checkedAt) {
  return Object.freeze({
    checkedAt,
    contractVersion: FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT,
    decision: FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_BLOCKED,
    reasonCode,
  });
}

export async function runFounderPilotRestoredCopyPreflight({
  inspectFile = inspectFounderPilotImmutableFile,
  inspectTarget,
  manifest: rawManifest,
  now = () => new Date(),
}) {
  let checkedAt = "1970-01-01T00:00:00.000Z";
  try {
    const currentTime = now();
    if (!(currentTime instanceof Date) || Number.isNaN(currentTime.valueOf())) {
      fail("FOUNDER_PILOT_CLOCK_INVALID");
    }
    checkedAt = currentTime.toISOString();
    const manifest = normalizeManifest(rawManifest);
    const deleteBy = new Date(manifest.retention.deleteBy);
    const capturedAt = new Date(manifest.backup.capturedAt);
    if (
      Number.isNaN(deleteBy.valueOf()) ||
      Number.isNaN(capturedAt.valueOf()) ||
      capturedAt > currentTime ||
      deleteBy <= currentTime
    ) {
      fail("FOUNDER_PILOT_EVIDENCE_WINDOW_INVALID");
    }
    if (
      currentTime.valueOf() - capturedAt.valueOf() >
      manifest.retention.rpoSeconds * 1000
    ) {
      fail("FOUNDER_PILOT_BACKUP_RPO_EXCEEDED");
    }
    if (deleteBy.valueOf() - currentTime.valueOf() > 7 * 24 * 60 * 60 * 1000) {
      fail("FOUNDER_PILOT_RETENTION_WINDOW_INVALID");
    }
    if (
      typeof inspectFile !== "function" ||
      typeof inspectTarget !== "function"
    ) {
      fail("FOUNDER_PILOT_PREFLIGHT_ADAPTER_INVALID");
    }

    const artifact = validateFileEvidence(
      await inspectFile({
        expectedSha256: manifest.release.artifactSha256,
        filePath: manifest.release.artifactPath,
        kind: "artifact",
      }),
    );
    const backup = validateFileEvidence(
      await inspectFile({
        expectedSha256: manifest.backup.backupSha256,
        filePath: manifest.backup.backupPath,
        kind: "backup",
      }),
    );
    if (artifact.identityDigest === backup.identityDigest) {
      fail("FOUNDER_PILOT_ARTIFACT_BACKUP_IDENTITY_COLLISION");
    }
    const targetEvidence = validateTargetEvidence(
      await inspectTarget(manifest.target),
      manifest.target,
    );
    const evidence = Object.freeze({
      artifactSha256: artifact.actualSha256,
      artifactSizeBytes: artifact.sizeBytes,
      backupCapturedAt: manifest.backup.capturedAt,
      backupSha256: backup.actualSha256,
      backupSizeBytes: backup.sizeBytes,
      deleteBy: manifest.retention.deleteBy,
      releaseSha: manifest.release.releaseSha,
      rpoSeconds: manifest.retention.rpoSeconds,
      rtoSeconds: manifest.retention.rtoSeconds,
      sourceMigrationCount: targetEvidence.migrationCount,
      sourceMigrationManifestDigest: targetEvidence.migrationManifestDigest,
      sourceSchemaHead: targetEvidence.schemaHead,
      targetIdentityDigest: digest("target-identity", {
        currentDatabase: targetEvidence.currentDatabase,
        currentUser: targetEvidence.currentUser,
        serverAddress: targetEvidence.serverAddress,
        serverPort: targetEvidence.serverPort,
        systemIdentifier: targetEvidence.systemIdentifier,
      }),
    });
    const receipt = Object.freeze({
      checkedAt,
      contractVersion: FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT,
      decision: FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY,
      evidence,
      evidenceDigest: digest("accepted-evidence", evidence),
      manifestDigest: founderPilotRestoredCopyManifestDigest(manifest),
      reasonCode: null,
    });
    acceptedPreflightReceipts.add(receipt);
    return receipt;
  } catch (error) {
    return blocked(
      error instanceof FounderPilotRestoredCopyPreflightError
        ? error.reasonCode
        : "FOUNDER_PILOT_PREFLIGHT_UNEXPECTED_FAILURE",
      checkedAt,
    );
  }
}
