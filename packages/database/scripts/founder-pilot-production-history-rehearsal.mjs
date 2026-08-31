import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {
  assertFounderPilotRestoredCopyDatabaseUrl,
  founderPilotRestoredCopyManifestDigest,
} from "./founder-pilot-restored-copy-preflight.mjs";

export const FOUNDER_PILOT_PRODUCTION_HISTORY_REHEARSAL_CONTRACT =
  "FOUNDER_PILOT_PRODUCTION_HISTORY_REHEARSAL_V1";
export const FOUNDER_PILOT_PRODUCTION_HISTORY_REHEARSAL_READY =
  "READY_FOR_EXACT_PRISMA_DEPLOY";
export const FOUNDER_PILOT_PRODUCTION_HISTORY_REHEARSAL_VERIFIED =
  "PRODUCTION_HISTORY_REHEARSAL_VERIFIED";

const SOURCE_MIGRATION_COUNT = 153;
const SOURCE_MIGRATION_HEAD = "20260804120000_guest_game_max_pending_rewards";
const SOURCE_MIGRATION_MANIFEST_DIGEST =
  "3f035d416525d1d76f09331f5933309f4366b36f831ab6bfa52d9ebcc04452c8";
const SOURCE_ROLLED_BACK_MIGRATION_COUNT = 4;
const SOURCE_ROLLED_BACK_MIGRATION_MANIFEST_DIGEST =
  "ae018d0beb9df8934dba01c0089b6219e774ac1fca78c5eaf415c36509400572";
const FINAL_MIGRATION_COUNT = 187;
const FINAL_MIGRATION_HEAD =
  "20260820010000_guest_portal_telegram_update_ledger";
const CURRENT_SOURCE_MIGRATION_COUNT = 189;
const CURRENT_SOURCE_MIGRATION_HEAD =
  "20260831120000_guest_support_bug_report_input_repair";
const FINAL_PRETERMINAL_MANIFEST_DIGEST =
  "094f3ad34ef8846f6088f51d5fb9491ff89af4509b60063453c22af07466d99b";
const FINAL_WORKER_FUNCTION_DIGEST =
  "a7dd17037ceaccb294953dce145e0fcc589fb2646962db724d919c24ba87c53c";
const SOURCE_CURRENT179_SHA256 =
  "c394060fbf979c567403976c8e906dc67b3bd840aea9fa9550e1d939d04af519";
const MATERIALIZED_CURRENT179_SHA256 =
  "f4437ebb5c2c70fe4f7389bbbb75af123d1f60367626db743751b612f7a8ffed";
const SOURCE_CURRENT185_SHA256 =
  "fd7002d70074c6a5e2383649ecc527b2a5cd7bb4c4f0be7ae0cc345080bc28d6";
const MATERIALIZED_CURRENT185_SHA256 =
  "2979599d1b17829d497ea7def3f9d7b64659b5e6796e357ba5eca971d497b674";
const SOURCE_CURRENT186_SHA256 =
  "cc95b88495113ac789a52956b2bdc9ba86915c64846a46c146e96532b32d8db5";
const MATERIALIZED_CURRENT186_SHA256 =
  "36c911bbded42603e26a55b5be64aaac273a35df629f8439bf97b00dfc883063";
const CURRENT185_PRODUCTION_HISTORY_PRETERMINAL_MANIFEST_DIGEST =
  "7a0bb533293e9ddf69d689a1215f3589872d399dccecde5a598bf79175923bcc";
const MATERIALIZED_CURRENT185_WORKER_FUNCTION_DIGEST =
  "d2025dca020c73fd9e3bfdfe251566fff69c48880b4caeaa8a37349a223f4465";
const CURRENT179 = "20260731120000_identity_mail_delivery_release_head";
const CURRENT185 = "20260818020000_identity_mail_delivery_current_head_v1";
const CURRENT186 = "20260819010000_staff_attachment_parent_delete_guard";
const RECONCILIATION_MARKER =
  "FOUNDER_RESTORED_COPY_STALE_DIGEST_RECONCILED_V1";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_STALE_RUNS = 32;
const MINIMUM_STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SHA256 = /^[0-9a-f]{64}$/u;
const MIGRATION_NAME = /^\d{14}_[a-z0-9_]{3,100}$/u;
const SAFE_LANE = /^leetplus-founder-production-history-[a-z0-9_-]{3,80}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const LEGACY_APPLIED_CHECKSUMS = new Map([
  [
    "20260518120000_guest_data_foundation",
    "98de87e5d79eb6611b0722e954fe0e7b2eb6480c7b485d9cf451ecff6dcf4341",
  ],
  [
    "20260519142000_guest_working_shifts",
    "226614a5e628a3d40a0fe584323d6ed2134f229092e35081ec9b05a24378eff5",
  ],
]);

export class FounderPilotProductionHistoryRehearsalError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "FounderPilotProductionHistoryRehearsalError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new FounderPilotProductionHistoryRehearsalError(reasonCode);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
  return sha256(
    `${FOUNDER_PILOT_PRODUCTION_HISTORY_REHEARSAL_CONTRACT}\0${domain}\0${stableJson(value)}`,
  );
}

function exactPath(value, reasonCode) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 3 ||
    value.length > 4096 ||
    !path.isAbsolute(value)
  ) {
    fail(reasonCode);
  }
  return value;
}

async function readBoundedFile(filePath, reasonCode) {
  const pathStat = await lstat(filePath, { bigint: true }).catch(() => null);
  if (pathStat === null || pathStat.isSymbolicLink() || !pathStat.isFile()) {
    fail(reasonCode);
  }
  const resolvedPath = await realpath(filePath);
  const handle = await open(resolvedPath, fsConstants.O_RDONLY);
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.dev !== pathStat.dev ||
      before.ino !== pathStat.ino ||
      before.size <= 0n ||
      before.size > BigInt(MAX_FILE_BYTES)
    ) {
      fail(reasonCode);
    }
    const bytes = Buffer.alloc(Number(before.size));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat({ bigint: true });
    if (
      bytesRead !== bytes.length ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs
    ) {
      fail(reasonCode);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function writeExclusive(filePath, bytes) {
  const handle = await open(
    filePath,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function replaceExact(source, from, to, expectedCount, reasonCode) {
  const count = source.split(from).length - 1;
  if (count !== expectedCount) fail(reasonCode);
  return source.replaceAll(from, to);
}

function replaceFirstExact(source, from, to, expectedCount, reasonCode) {
  const count = source.split(from).length - 1;
  if (count !== expectedCount) fail(reasonCode);
  return source.replace(from, to);
}

export function materializeFounderPilotProductionHistorySql(
  migrationName,
  sourceBytes,
) {
  if (!Buffer.isBuffer(sourceBytes)) {
    fail("FOUNDER_PILOT_HISTORY_SOURCE_SQL_INVALID");
  }
  const sourceDigest = sha256(sourceBytes);
  let sql = sourceBytes.toString("utf8");
  if (migrationName === CURRENT179) {
    if (sourceDigest !== SOURCE_CURRENT179_SHA256) {
      fail("FOUNDER_PILOT_HISTORY_CURRENT179_SOURCE_DRIFT");
    }
    sql = replaceExact(
      sql,
      "completed_migration_count IS DISTINCT FROM 178",
      "completed_migration_count IS DISTINCT FROM 179",
      1,
      "FOUNDER_PILOT_HISTORY_CURRENT179_TRANSFORM_DRIFT",
    );
    sql = replaceExact(
      sql,
      "IF migration_count IS DISTINCT FROM 179",
      "IF migration_count IS DISTINCT FROM 180",
      1,
      "FOUNDER_PILOT_HISTORY_CURRENT179_TRANSFORM_DRIFT",
    );
    sql = replaceFirstExact(
      sql,
      "20260731110000_guest_game_case_reward_contract",
      SOURCE_MIGRATION_HEAD,
      3,
      "FOUNDER_PILOT_HISTORY_CURRENT179_TRANSFORM_DRIFT",
    );
    sql = replaceExact(
      sql,
      "7f9867971a39e010b2dac03be18fc083dabe67b98d1d6ed15a0cc4540a8cfd14",
      "a4160b0690c7530557f5ee7001500b1714d7f7fee150dd072c93651e0932ccb2",
      2,
      "FOUNDER_PILOT_HISTORY_CURRENT179_TRANSFORM_DRIFT",
    );
    sql = replaceExact(
      sql,
      "a8912b95b9dbd7197acd97981b88bae680bf80d3f820a13c569110c1efa49f37",
      "29c600a53a852e90008dbff2d76b456e304cec9a256b98d486cdc59f622eb960",
      1,
      "FOUNDER_PILOT_HISTORY_CURRENT179_TRANSFORM_DRIFT",
    );
    const result = Buffer.from(sql, "utf8");
    if (sha256(result) !== MATERIALIZED_CURRENT179_SHA256) {
      fail("FOUNDER_PILOT_HISTORY_CURRENT179_OUTPUT_DRIFT");
    }
    return result;
  }
  if (migrationName === CURRENT185) {
    if (sourceDigest !== SOURCE_CURRENT185_SHA256) {
      fail("FOUNDER_PILOT_HISTORY_CURRENT185_SOURCE_DRIFT");
    }
    sql = replaceExact(
      sql,
      "f269f0878c9940b7ee2619e778e032361acc844364ab876bbe7fcc01e15a9fcd",
      CURRENT185_PRODUCTION_HISTORY_PRETERMINAL_MANIFEST_DIGEST,
      2,
      "FOUNDER_PILOT_HISTORY_CURRENT185_TRANSFORM_DRIFT",
    );
    sql = replaceExact(
      sql,
      "a8912b95b9dbd7197acd97981b88bae680bf80d3f820a13c569110c1efa49f37",
      "29c600a53a852e90008dbff2d76b456e304cec9a256b98d486cdc59f622eb960",
      1,
      "FOUNDER_PILOT_HISTORY_CURRENT185_TRANSFORM_DRIFT",
    );
    sql = replaceExact(
      sql,
      "47690501257272fd455475a00bea0e21b13f27187a669adef2115de349633315",
      MATERIALIZED_CURRENT185_WORKER_FUNCTION_DIGEST,
      1,
      "FOUNDER_PILOT_HISTORY_CURRENT185_TRANSFORM_DRIFT",
    );
    const result = Buffer.from(sql, "utf8");
    if (sha256(result) !== MATERIALIZED_CURRENT185_SHA256) {
      fail("FOUNDER_PILOT_HISTORY_CURRENT185_OUTPUT_DRIFT");
    }
    return result;
  }
  if (migrationName === CURRENT186) {
    if (sourceDigest !== SOURCE_CURRENT186_SHA256) {
      fail("FOUNDER_PILOT_HISTORY_CURRENT186_SOURCE_DRIFT");
    }
    sql = replaceExact(
      sql,
      "47690501257272fd455475a00bea0e21b13f27187a669adef2115de349633315",
      MATERIALIZED_CURRENT185_WORKER_FUNCTION_DIGEST,
      1,
      "FOUNDER_PILOT_HISTORY_CURRENT186_TRANSFORM_DRIFT",
    );
    const result = Buffer.from(sql, "utf8");
    if (sha256(result) !== MATERIALIZED_CURRENT186_SHA256) {
      fail("FOUNDER_PILOT_HISTORY_CURRENT186_OUTPUT_DRIFT");
    }
    return result;
  }
  return sourceBytes;
}

async function inspectSourceTree(
  sourcePrismaRoot,
  {
    materialized = false,
    targetMigrationCount = FINAL_MIGRATION_COUNT,
    targetMigrationHead = FINAL_MIGRATION_HEAD,
  } = {},
) {
  const supportedTarget =
    (targetMigrationCount === FINAL_MIGRATION_COUNT &&
      targetMigrationHead === FINAL_MIGRATION_HEAD) ||
    (targetMigrationCount === CURRENT_SOURCE_MIGRATION_COUNT &&
      targetMigrationHead === CURRENT_SOURCE_MIGRATION_HEAD);
  if (!supportedTarget) {
    fail("FOUNDER_PILOT_HISTORY_MATERIALIZATION_TARGET_INVALID");
  }
  exactPath(sourcePrismaRoot, "FOUNDER_PILOT_HISTORY_SOURCE_ROOT_INVALID");
  const rootStat = await lstat(sourcePrismaRoot, { bigint: true }).catch(
    () => null,
  );
  if (
    rootStat === null ||
    rootStat.isSymbolicLink() ||
    !rootStat.isDirectory()
  ) {
    fail("FOUNDER_PILOT_HISTORY_SOURCE_ROOT_INVALID");
  }
  const schemaBytes = await readBoundedFile(
    path.join(sourcePrismaRoot, "schema.prisma"),
    "FOUNDER_PILOT_HISTORY_SCHEMA_INVALID",
  );
  const migrationsRoot = path.join(sourcePrismaRoot, "migrations");
  const migrationRootStat = await lstat(migrationsRoot, { bigint: true }).catch(
    () => null,
  );
  if (
    migrationRootStat === null ||
    migrationRootStat.isSymbolicLink() ||
    !migrationRootStat.isDirectory()
  ) {
    fail("FOUNDER_PILOT_HISTORY_MIGRATIONS_ROOT_INVALID");
  }
  const entries = await readdir(migrationsRoot, { withFileTypes: true });
  const availableMigrationNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expectedAvailableCount = materialized
    ? targetMigrationCount
    : CURRENT_SOURCE_MIGRATION_COUNT;
  const expectedAvailableHead = materialized
    ? targetMigrationHead
    : CURRENT_SOURCE_MIGRATION_HEAD;
  if (
    availableMigrationNames.length !== expectedAvailableCount ||
    availableMigrationNames.at(-1) !== expectedAvailableHead ||
    entries.some(
      (entry) =>
        !entry.isDirectory() &&
        !(entry.isFile() && entry.name === "migration_lock.toml"),
    ) ||
    availableMigrationNames.some((name) => !MIGRATION_NAME.test(name))
  ) {
    fail("FOUNDER_PILOT_HISTORY_MIGRATION_TREE_INVALID");
  }
  const migrationNames = availableMigrationNames.slice(0, targetMigrationCount);
  if (
    migrationNames.length !== targetMigrationCount ||
    migrationNames.at(-1) !== targetMigrationHead
  ) {
    fail("FOUNDER_PILOT_HISTORY_MIGRATION_TREE_INVALID");
  }
  const files = [
    {
      bytes: schemaBytes,
      relativePath: "schema.prisma",
    },
    {
      bytes: await readBoundedFile(
        path.join(migrationsRoot, "migration_lock.toml"),
        "FOUNDER_PILOT_HISTORY_MIGRATION_LOCK_INVALID",
      ),
      relativePath: "migrations/migration_lock.toml",
    },
  ];
  for (const migrationName of migrationNames) {
    const directory = path.join(migrationsRoot, migrationName);
    const children = await readdir(directory, { withFileTypes: true });
    if (
      children.length !== 1 ||
      children[0].name !== "migration.sql" ||
      !children[0].isFile()
    ) {
      fail("FOUNDER_PILOT_HISTORY_MIGRATION_DIRECTORY_INVALID");
    }
    const sourceBytes = await readBoundedFile(
      path.join(directory, "migration.sql"),
      "FOUNDER_PILOT_HISTORY_MIGRATION_FILE_INVALID",
    );
    let outputBytes = sourceBytes;
    if (materialized && migrationName === CURRENT179) {
      if (sha256(sourceBytes) !== MATERIALIZED_CURRENT179_SHA256) {
        fail("FOUNDER_PILOT_HISTORY_CURRENT179_OUTPUT_DRIFT");
      }
    } else if (materialized && migrationName === CURRENT185) {
      if (sha256(sourceBytes) !== MATERIALIZED_CURRENT185_SHA256) {
        fail("FOUNDER_PILOT_HISTORY_CURRENT185_OUTPUT_DRIFT");
      }
    } else if (materialized && migrationName === CURRENT186) {
      if (sha256(sourceBytes) !== MATERIALIZED_CURRENT186_SHA256) {
        fail("FOUNDER_PILOT_HISTORY_CURRENT186_OUTPUT_DRIFT");
      }
    } else {
      outputBytes = materializeFounderPilotProductionHistorySql(
        migrationName,
        sourceBytes,
      );
    }
    files.push({
      bytes: outputBytes,
      migrationName,
      relativePath: `migrations/${migrationName}/migration.sql`,
      sourceSha256: sha256(sourceBytes),
    });
  }
  const fileManifest = files.map(({ bytes, relativePath }) => ({
    relativePath,
    sha256: sha256(bytes),
  }));
  return {
    fileManifest,
    files,
    migrationChecksums: new Map(
      files
        .filter(({ migrationName }) => migrationName !== undefined)
        .map(({ bytes, migrationName }) => [migrationName, sha256(bytes)]),
    ),
    treeDigest: digest("materialized-prisma-tree", fileManifest),
  };
}

// Production admission reuses the exact, already-rehearsed migration
// materialization.  Expose only the immutable digest/count projection so a
// read-only production plan can bind the same bytes without creating a lane.
export async function inspectFounderPilotProductionHistorySourceTree(
  sourcePrismaRoot,
) {
  const tree = await inspectSourceTree(sourcePrismaRoot);
  return Object.freeze({
    materializedCurrent179Sha256: MATERIALIZED_CURRENT179_SHA256,
    materializedCurrent185Sha256: MATERIALIZED_CURRENT185_SHA256,
    materializedCurrent186Sha256: MATERIALIZED_CURRENT186_SHA256,
    migrationCount: tree.migrationChecksums.size,
    treeDigest: tree.treeDigest,
  });
}

function assertLaneRoot(laneRoot) {
  exactPath(laneRoot, "FOUNDER_PILOT_HISTORY_LANE_ROOT_INVALID");
  if (!SAFE_LANE.test(path.basename(laneRoot))) {
    fail("FOUNDER_PILOT_HISTORY_LANE_ROOT_INVALID");
  }
}

export async function materializeFounderPilotProductionHistoryLane({
  laneRoot,
  sourcePrismaRoot,
  targetMigrationCount = FINAL_MIGRATION_COUNT,
  targetMigrationHead = FINAL_MIGRATION_HEAD,
}) {
  assertLaneRoot(laneRoot);
  const source = await inspectSourceTree(sourcePrismaRoot, {
    targetMigrationCount,
    targetMigrationHead,
  });
  const requestedParent = path.dirname(laneRoot);
  const parentStat = await lstat(requestedParent, { bigint: true }).catch(
    () => null,
  );
  if (
    parentStat === null ||
    parentStat.isSymbolicLink() ||
    !parentStat.isDirectory()
  ) {
    fail("FOUNDER_PILOT_HISTORY_LANE_PARENT_INVALID");
  }
  const parent = await realpath(requestedParent);
  const resolvedLaneRoot = path.join(parent, path.basename(laneRoot));
  const existing = await lstat(resolvedLaneRoot, { bigint: true }).catch(
    (error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    },
  );
  if (existing !== null) {
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      fail("FOUNDER_PILOT_HISTORY_EXISTING_LANE_INVALID");
    }
    const verification = await inspectSourceTree(resolvedLaneRoot, {
      materialized: true,
      targetMigrationCount,
      targetMigrationHead,
    });
    if (verification.treeDigest !== source.treeDigest) {
      fail("FOUNDER_PILOT_HISTORY_EXISTING_LANE_DRIFT");
    }
    return Object.freeze({
      current179Sha256: MATERIALIZED_CURRENT179_SHA256,
      current185Sha256: MATERIALIZED_CURRENT185_SHA256,
      migrationCount: targetMigrationCount,
      treeDigest: source.treeDigest,
    });
  }
  await mkdir(resolvedLaneRoot, { mode: 0o700 });
  await mkdir(path.join(resolvedLaneRoot, "migrations"), { mode: 0o700 });
  for (const file of source.files) {
    const destination = path.join(
      resolvedLaneRoot,
      ...file.relativePath.split("/"),
    );
    if (file.migrationName !== undefined) {
      await mkdir(path.dirname(destination), { mode: 0o700 });
    }
    await writeExclusive(destination, file.bytes);
  }
  const verification = await inspectSourceTree(resolvedLaneRoot, {
    materialized: true,
    targetMigrationCount,
    targetMigrationHead,
  });
  if (verification.treeDigest !== source.treeDigest) {
    fail("FOUNDER_PILOT_HISTORY_LANE_VERIFICATION_FAILED");
  }
  return Object.freeze({
    current179Sha256: MATERIALIZED_CURRENT179_SHA256,
    current185Sha256: MATERIALIZED_CURRENT185_SHA256,
    migrationCount: targetMigrationCount,
    treeDigest: source.treeDigest,
  });
}

function migrationManifestDigest(rows) {
  return sha256(
    rows
      .map(({ checksum, migrationName }) => `${migrationName}\0${checksum}`)
      .sort()
      .join("\n"),
  );
}

function staleProjection(row) {
  return {
    completedAt: row.completedAt,
    errorMessage: row.errorMessage,
    executionRevision: row.executionRevision,
    id: row.id,
    sentCount: row.sentCount,
    startedAt:
      row.startedAt instanceof Date
        ? row.startedAt.toISOString()
        : String(row.startedAt),
    status: row.status,
    type: row.type,
  };
}

function validateSourceEvidence(evidence, capturedAt) {
  if (
    evidence.migrationCount !== SOURCE_MIGRATION_COUNT ||
    evidence.migrationHead !== SOURCE_MIGRATION_HEAD ||
    evidence.migrationManifestDigest !== SOURCE_MIGRATION_MANIFEST_DIGEST ||
    evidence.rolledBackMigrationCount !== SOURCE_ROLLED_BACK_MIGRATION_COUNT ||
    evidence.rolledBackMigrationManifestDigest !==
      SOURCE_ROLLED_BACK_MIGRATION_MANIFEST_DIGEST ||
    evidence.unfinishedMigrationCount !== 0
  ) {
    fail("FOUNDER_PILOT_HISTORY_SOURCE_MIGRATION_STATE_MISMATCH");
  }
  if (
    !Array.isArray(evidence.runningDigestRows) ||
    evidence.runningDigestRows.length === 0 ||
    evidence.runningDigestRows.length > MAX_STALE_RUNS
  ) {
    fail("FOUNDER_PILOT_HISTORY_STALE_RUN_SET_INVALID");
  }
  const captured = new Date(capturedAt).valueOf();
  if (!Number.isFinite(captured)) fail("FOUNDER_PILOT_HISTORY_CLOCK_INVALID");
  const rows = evidence.runningDigestRows.map(staleProjection);
  for (const row of rows) {
    const startedAt = new Date(row.startedAt).valueOf();
    if (
      !UUID.test(row.id) ||
      row.status !== "RUNNING" ||
      row.type !== "WEEKLY" ||
      row.sentCount !== 0 ||
      row.completedAt !== null ||
      row.executionRevision !== null ||
      row.errorMessage !== null ||
      !Number.isFinite(startedAt) ||
      startedAt > captured - MINIMUM_STALE_AGE_MS
    ) {
      fail("FOUNDER_PILOT_HISTORY_STALE_RUN_NOT_RECONCILABLE");
    }
  }
  rows.sort((left, right) => left.id.localeCompare(right.id));
  return rows;
}

export function validateFounderPilotProductionHistorySourceEvidence({
  capturedAt,
  evidence,
  expectedStaleRunCount = null,
  expectedStaleRunSetDigest = null,
}) {
  const rows = validateSourceEvidence(evidence, capturedAt);
  const staleRunSetDigest = digest("stale-report-digest-runs", rows);
  if (
    (expectedStaleRunCount !== null && rows.length !== expectedStaleRunCount) ||
    (expectedStaleRunSetDigest !== null &&
      staleRunSetDigest !== expectedStaleRunSetDigest)
  ) {
    fail("FOUNDER_PILOT_HISTORY_STALE_RUN_SET_MISMATCH");
  }
  return Object.freeze({
    rows: Object.freeze(rows.map((row) => Object.freeze({ ...row }))),
    staleRunSetDigest,
  });
}

export async function buildFounderPilotProductionHistoryPlan({
  inspectTarget,
  manifest,
  sourcePrismaRoot,
}) {
  if (typeof inspectTarget !== "function") {
    fail("FOUNDER_PILOT_HISTORY_ADAPTER_INVALID");
  }
  const sourceTree = await inspectSourceTree(sourcePrismaRoot);
  const evidence = await inspectTarget();
  const staleRows = validateSourceEvidence(
    evidence,
    manifest.backup.capturedAt,
  );
  const plan = {
    contractVersion: FOUNDER_PILOT_PRODUCTION_HISTORY_REHEARSAL_CONTRACT,
    materializedCurrent179Sha256: MATERIALIZED_CURRENT179_SHA256,
    materializedCurrent185Sha256: MATERIALIZED_CURRENT185_SHA256,
    materializedTreeDigest: sourceTree.treeDigest,
    releaseSha: manifest.release.releaseSha,
    restoredCopyManifestDigest:
      founderPilotRestoredCopyManifestDigest(manifest),
    sourceMigrationCount: evidence.migrationCount,
    sourceMigrationManifestDigest: evidence.migrationManifestDigest,
    sourceRolledBackMigrationCount: evidence.rolledBackMigrationCount,
    sourceRolledBackMigrationManifestDigest:
      evidence.rolledBackMigrationManifestDigest,
    sourceSchemaHead: evidence.migrationHead,
    staleRunCount: staleRows.length,
    staleRunSetDigest: digest("stale-report-digest-runs", staleRows),
  };
  return Object.freeze({
    ...plan,
    planDigest: digest("plan", plan),
  });
}

export const FOUNDER_PILOT_PRODUCTION_HISTORY_INSPECT_SQL = `
SELECT
  migration."migration_name" AS "migrationName",
  migration."checksum",
  migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL AS "applied",
  migration."rolled_back_at" IS NOT NULL AS "rolledBack"
FROM public."_prisma_migrations" AS migration
ORDER BY migration."migration_name" COLLATE "C", migration."started_at";

SELECT
  run."id",
  run."status",
  run."type",
  run."sentCount",
  run."startedAt",
  run."completedAt",
  (pg_catalog.to_jsonb(run) ->> 'executionRevision')::INTEGER
    AS "executionRevision",
  run."errorMessage"
FROM public."ReportDigestScheduleRun" AS run
WHERE run."status" = 'RUNNING'
ORDER BY run."id" COLLATE "C";
`;

function normalizeMigrationEvidence(migrationRows, runningDigestRows) {
  const applied = migrationRows.filter((row) => row.applied === true);
  const rolledBack = migrationRows.filter(
    (row) => row.applied !== true && row.rolledBack === true,
  );
  const unfinished = migrationRows.filter(
    (row) => row.applied !== true && row.rolledBack !== true,
  );
  return {
    migrationCount: applied.length,
    migrationHead: applied.at(-1)?.migrationName ?? null,
    migrationManifestDigest: migrationManifestDigest(applied),
    migrationRows,
    rolledBackMigrationCount: rolledBack.length,
    rolledBackMigrationManifestDigest: migrationManifestDigest(rolledBack),
    runningDigestRows,
    unfinishedMigrationCount: unfinished.length,
  };
}

export function normalizeFounderPilotProductionHistoryEvidence(
  migrationRows,
  runningDigestRows,
) {
  return normalizeMigrationEvidence(migrationRows, runningDigestRows);
}

export async function createFounderPilotProductionHistoryPgAdapter(
  databaseUrl,
  target,
) {
  assertFounderPilotRestoredCopyDatabaseUrl(databaseUrl, target);
  const client = new pg.Client({
    application_name: "founder_history_v1",
    connectionString: databaseUrl,
  });
  await client.connect();
  let closed = false;
  async function inspectTarget() {
    if (closed) fail("FOUNDER_PILOT_HISTORY_ADAPTER_CLOSED");
    await client.query("BEGIN TRANSACTION READ ONLY");
    try {
      await client.query("SET LOCAL statement_timeout = '15s'");
      const migrations = await client.query(
        FOUNDER_PILOT_PRODUCTION_HISTORY_INSPECT_SQL.split(";\n\n")[0],
      );
      const runs = await client.query(
        FOUNDER_PILOT_PRODUCTION_HISTORY_INSPECT_SQL.split(";\n\n")[1],
      );
      await client.query("COMMIT");
      return normalizeMigrationEvidence(migrations.rows, runs.rows);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
  async function reconcile(plan, capturedAt) {
    if (closed) fail("FOUNDER_PILOT_HISTORY_ADAPTER_CLOSED");
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '30s'");
      await client.query(
        'LOCK TABLE public."_prisma_migrations" IN SHARE MODE',
      );
      await client.query(
        'LOCK TABLE public."ReportDigestScheduleRun" IN ACCESS EXCLUSIVE MODE',
      );
      const migrations = await client.query(
        FOUNDER_PILOT_PRODUCTION_HISTORY_INSPECT_SQL.split(";\n\n")[0],
      );
      const runs = await client.query(`
        SELECT
          run."id", run."status", run."type", run."sentCount",
          run."startedAt", run."completedAt",
          (pg_catalog.to_jsonb(run) ->> 'executionRevision')::INTEGER
            AS "executionRevision",
          run."errorMessage"
        FROM public."ReportDigestScheduleRun" AS run
        WHERE run."status" = 'RUNNING'
        ORDER BY run."id" COLLATE "C"
      `);
      const rows = validateSourceEvidence(
        normalizeMigrationEvidence(migrations.rows, runs.rows),
        capturedAt,
      );
      if (digest("stale-report-digest-runs", rows) !== plan.staleRunSetDigest) {
        fail("FOUNDER_PILOT_HISTORY_STALE_RUN_SET_CHANGED");
      }
      const result = await client.query(
        `
          UPDATE public."ReportDigestScheduleRun"
          SET
            "status" = 'FAILED',
            "completedAt" = $2::timestamptz,
            "errorMessage" = $3,
            "updatedAt" = $2::timestamptz
          WHERE "id" = ANY($1::text[])
            AND "status" = 'RUNNING'
            AND "completedAt" IS NULL
            AND "sentCount" = 0
            AND "errorMessage" IS NULL
        `,
        [
          rows.map((row) => row.id),
          capturedAt,
          `${RECONCILIATION_MARKER}:${plan.staleRunSetDigest}`,
        ],
      );
      if (result.rowCount !== rows.length) {
        fail("FOUNDER_PILOT_HISTORY_RECONCILIATION_RACE");
      }
      await client.query("COMMIT");
      return rows.length;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
  async function inspectFinal() {
    if (closed) fail("FOUNDER_PILOT_HISTORY_ADAPTER_CLOSED");
    const result = await client.query(`
      SELECT
        pg_catalog.encode(
          pg_catalog.sha256(
            pg_catalog.convert_to(
              pg_catalog.string_agg(
                migration."migration_name" || ' ' || migration."checksum",
                E'\\n'
                ORDER BY migration."migration_name" COLLATE "C"
              ) FILTER (
                WHERE migration."migration_name" NOT IN (
                  '20260819010000_staff_attachment_parent_delete_guard',
                  '20260820010000_guest_portal_telegram_update_ledger',
                  '20260828190000_guest_support_bug_reports',
                  '20260831120000_guest_support_bug_report_input_repair'
                )
              ) || E'\\n',
              'UTF8'
            )
          ),
          'hex'
        ) AS "preterminalManifestDigest",
        (
          SELECT pg_catalog.encode(
            pg_catalog.sha256(pg_catalog.convert_to(routine.prosrc, 'UTF8')),
            'hex'
          )
          FROM pg_catalog.pg_proc AS routine
          WHERE routine.oid = pg_catalog.to_regprocedure(
            'public."identity_mail_delivery_worker_assert_v1"(text)'
          )
        ) AS "workerFunctionDigest"
      FROM public."_prisma_migrations" AS migration
      WHERE migration."finished_at" IS NOT NULL
        AND migration."rolled_back_at" IS NULL
    `);
    return result.rows[0];
  }
  return Object.freeze({
    close: async () => {
      if (!closed) {
        closed = true;
        await client.end();
      }
    },
    inspectFinal,
    inspectTarget,
    reconcile,
  });
}

export async function applyFounderPilotProductionHistoryPlan({
  adapter,
  confirmPlanDigest,
  laneRoot,
  manifest,
  plan,
  sourcePrismaRoot,
}) {
  if (
    typeof confirmPlanDigest !== "string" ||
    !SHA256.test(confirmPlanDigest) ||
    confirmPlanDigest !== plan.planDigest
  ) {
    fail("FOUNDER_PILOT_HISTORY_PLAN_CONFIRMATION_MISMATCH");
  }
  const lane = await materializeFounderPilotProductionHistoryLane({
    laneRoot,
    sourcePrismaRoot,
  });
  if (lane.treeDigest !== plan.materializedTreeDigest) {
    fail("FOUNDER_PILOT_HISTORY_MATERIALIZED_TREE_MISMATCH");
  }
  const reconciledRunCount = await adapter.reconcile(
    plan,
    manifest.backup.capturedAt,
  );
  return Object.freeze({
    contractVersion: FOUNDER_PILOT_PRODUCTION_HISTORY_REHEARSAL_CONTRACT,
    decision: FOUNDER_PILOT_PRODUCTION_HISTORY_REHEARSAL_READY,
    materializedTreeDigest: lane.treeDigest,
    planDigest: plan.planDigest,
    reasonCode: null,
    reconciledRunCount,
  });
}

export async function verifyFounderPilotProductionHistoryRehearsal({
  adapter,
  laneRoot,
}) {
  const lane = await inspectSourceTree(laneRoot, { materialized: true });
  const evidence = await adapter.inspectTarget();
  if (
    evidence.migrationCount !== FINAL_MIGRATION_COUNT ||
    evidence.migrationHead !== FINAL_MIGRATION_HEAD ||
    evidence.rolledBackMigrationCount !== SOURCE_ROLLED_BACK_MIGRATION_COUNT ||
    evidence.rolledBackMigrationManifestDigest !==
      SOURCE_ROLLED_BACK_MIGRATION_MANIFEST_DIGEST ||
    evidence.unfinishedMigrationCount !== 0 ||
    evidence.runningDigestRows.length !== 0
  ) {
    fail("FOUNDER_PILOT_HISTORY_FINAL_STATE_MISMATCH");
  }
  const appliedRows = evidence.migrationRows.filter(
    (row) => row.applied === true,
  );
  for (const row of appliedRows) {
    const expected =
      LEGACY_APPLIED_CHECKSUMS.get(row.migrationName) ??
      lane.migrationChecksums.get(row.migrationName);
    if (expected === undefined || row.checksum !== expected) {
      fail("FOUNDER_PILOT_HISTORY_FINAL_MIGRATION_CHECKSUM_MISMATCH");
    }
  }
  const final = await adapter.inspectFinal?.();
  if (
    final === undefined ||
    final.preterminalManifestDigest !== FINAL_PRETERMINAL_MANIFEST_DIGEST ||
    final.workerFunctionDigest !== FINAL_WORKER_FUNCTION_DIGEST
  ) {
    fail("FOUNDER_PILOT_HISTORY_FINAL_RUNTIME_FINGERPRINT_MISMATCH");
  }
  return Object.freeze({
    contractVersion: FOUNDER_PILOT_PRODUCTION_HISTORY_REHEARSAL_CONTRACT,
    decision: FOUNDER_PILOT_PRODUCTION_HISTORY_REHEARSAL_VERIFIED,
    materializedTreeDigest: lane.treeDigest,
    migrationCount: evidence.migrationCount,
    preterminalManifestDigest: final.preterminalManifestDigest,
    reasonCode: null,
    rolledBackMigrationCount: evidence.rolledBackMigrationCount,
    workerFunctionDigest: final.workerFunctionDigest,
  });
}

export const FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS = Object.freeze({
  finalMigrationCount: FINAL_MIGRATION_COUNT,
  finalMigrationHead: FINAL_MIGRATION_HEAD,
  finalPreterminalManifestDigest: FINAL_PRETERMINAL_MANIFEST_DIGEST,
  finalWorkerFunctionDigest: FINAL_WORKER_FUNCTION_DIGEST,
  materializedCurrent179Sha256: MATERIALIZED_CURRENT179_SHA256,
  materializedCurrent185Sha256: MATERIALIZED_CURRENT185_SHA256,
  materializedCurrent186Sha256: MATERIALIZED_CURRENT186_SHA256,
  sourceMigrationCount: SOURCE_MIGRATION_COUNT,
  sourceMigrationHead: SOURCE_MIGRATION_HEAD,
  sourceMigrationManifestDigest: SOURCE_MIGRATION_MANIFEST_DIGEST,
  sourceRolledBackMigrationCount: SOURCE_ROLLED_BACK_MIGRATION_COUNT,
  sourceRolledBackMigrationManifestDigest:
    SOURCE_ROLLED_BACK_MIGRATION_MANIFEST_DIGEST,
});
