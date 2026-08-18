import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_BLOCKED,
  FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT,
  FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY,
  assertFounderPilotRestoredCopyPreflightReceipt,
  assertFounderPilotRestoredCopyDatabaseUrl,
  inspectFounderPilotImmutableFile,
  loadFounderPilotRestoredCopyManifest,
  runFounderPilotRestoredCopyPreflight,
} from "./founder-pilot-restored-copy-preflight.mjs";

const NOW = new Date("2026-08-17T12:00:00.000Z");
const RELEASE_SHA = "1".repeat(40);
const SYSTEM_IDENTIFIER = "7612345678901234567";
const MIGRATION_DIGEST = "2".repeat(64);
const ARTIFACT_BYTES = Buffer.from("accepted-release-artifact", "utf8");
const BACKUP_BYTES = Buffer.from("isolated-production-backup", "utf8");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function manifest(artifactPath, backupPath) {
  return {
    backup: {
      backupPath,
      backupSha256: sha256(BACKUP_BYTES),
      capturedAt: "2026-08-17T10:00:00.000Z",
    },
    contractVersion: FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT,
    isolation: {
      apiStarted: false,
      databaseOnly: true,
      langameEnabled: false,
      productionServiceTokensMounted: false,
      schedulersEnabled: false,
      smtpEnabled: false,
      telegramEnabled: false,
      workersStarted: false,
    },
    release: {
      artifactPath,
      artifactSha256: sha256(ARTIFACT_BYTES),
      releaseSha: RELEASE_SHA,
    },
    retention: {
      deleteBy: "2026-08-18T12:00:00.000Z",
      rpoSeconds: 7200,
      rtoSeconds: 3600,
    },
    target: {
      databaseName: "leetplus_restored_founder_a1",
      expectedSystemIdentifier: SYSTEM_IDENTIFIER,
      host: "127.0.0.1",
      ownerRoleName: "postgres",
      port: 55439,
      sourceMigrationCount: 184,
      sourceMigrationManifestDigest: MIGRATION_DIGEST,
      sourceSchemaHead: "20260818010000_founder_owner_invite_reissue_v1",
    },
  };
}

function targetEvidence(overrides = {}) {
  return {
    currentDatabase: "leetplus_restored_founder_a1",
    currentUser: "postgres",
    founderActivationRoleCount: 0,
    migrationCount: 184,
    migrationManifestDigest: MIGRATION_DIGEST,
    nonAppliedMigrationCount: 0,
    otherTargetSessionCount: 0,
    schemaHead: "20260818010000_founder_owner_invite_reissue_v1",
    serverAddress: "127.0.0.1",
    serverPort: 55439,
    systemIdentifier: SYSTEM_IDENTIFIER,
    ...overrides,
  };
}

async function fixture(t) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "lp-founder-preflight-"),
  );
  t.after(() => rm(directory, { force: true, recursive: true }));
  const artifactPath = path.join(directory, "release-artifact.tgz");
  const backupPath = path.join(directory, "restored-source.dump");
  await writeFile(artifactPath, ARTIFACT_BYTES, { flag: "wx" });
  await writeFile(backupPath, BACKUP_BYTES, { flag: "wx" });
  return { artifactPath, backupPath };
}

test("accepts exact files, isolated target identity, migration state, and outbound-off policy", async (t) => {
  const files = await fixture(t);
  const result = await runFounderPilotRestoredCopyPreflight({
    inspectTarget: async () => targetEvidence(),
    manifest: manifest(files.artifactPath, files.backupPath),
    now: () => NOW,
  });

  assert.equal(result.decision, FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY);
  assert.equal(result.reasonCode, null);
  assert.equal(result.evidence.releaseSha, RELEASE_SHA);
  assert.equal(result.evidence.backupSha256, sha256(BACKUP_BYTES));
  assert.equal(result.evidence.artifactSha256, sha256(ARTIFACT_BYTES));
  assert.match(result.evidence.targetIdentityDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.evidenceDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.manifestDigest, /^[0-9a-f]{64}$/u);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(
    serialized,
    /release-artifact|restored-source|postgresql:/u,
  );
  assert.doesNotMatch(serialized, /password|secret|ALIENWARE/iu);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.evidence));
  assert.equal(
    assertFounderPilotRestoredCopyPreflightReceipt(
      result,
      manifest(files.artifactPath, files.backupPath),
    ),
    result,
  );
  assert.throws(
    () =>
      assertFounderPilotRestoredCopyPreflightReceipt(
        structuredClone(result),
        manifest(files.artifactPath, files.backupPath),
      ),
    { reasonCode: "FOUNDER_PILOT_PREFLIGHT_RECEIPT_NOT_LIVE" },
  );
  const changedManifest = manifest(files.artifactPath, files.backupPath);
  changedManifest.retention.rtoSeconds += 1;
  assert.throws(
    () =>
      assertFounderPilotRestoredCopyPreflightReceipt(result, changedManifest),
    { reasonCode: "FOUNDER_PILOT_PREFLIGHT_RECEIPT_NOT_LIVE" },
  );
});

test("hashes the actual file and fails closed on a separately supplied checksum mismatch", async (t) => {
  const files = await fixture(t);
  await assert.rejects(
    inspectFounderPilotImmutableFile({
      expectedSha256: "f".repeat(64),
      filePath: files.backupPath,
    }),
    { reasonCode: "FOUNDER_PILOT_EVIDENCE_FILE_DIGEST_MISMATCH" },
  );

  const value = manifest(files.artifactPath, files.backupPath);
  value.backup.backupSha256 = "f".repeat(64);
  const result = await runFounderPilotRestoredCopyPreflight({
    inspectTarget: async () => targetEvidence(),
    manifest: value,
    now: () => NOW,
  });
  assert.deepEqual(
    { decision: result.decision, reasonCode: result.reasonCode },
    {
      decision: FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_BLOCKED,
      reasonCode: "FOUNDER_PILOT_EVIDENCE_FILE_DIGEST_MISMATCH",
    },
  );
});

test("rejects declaration-only bypasses before target inspection", async (t) => {
  const files = await fixture(t);
  const cases = [
    [
      (value) => {
        value.extra = true;
      },
      "FOUNDER_PILOT_RESTORED_COPY_MANIFEST_INVALID",
    ],
    [
      (value) => {
        value.target.host = "10.0.0.5";
      },
      "FOUNDER_PILOT_TARGET_HOST_NOT_ISOLATED",
    ],
    [
      (value) => {
        value.target.port = 5432;
      },
      "FOUNDER_PILOT_TARGET_PORT_NOT_ISOLATED",
    ],
    [
      (value) => {
        value.isolation.smtpEnabled = true;
      },
      "FOUNDER_PILOT_SMTP_ENABLED_FORBIDDEN",
    ],
    [
      (value) => {
        value.isolation.productionServiceTokensMounted = true;
      },
      "FOUNDER_PILOT_PRODUCTION_SERVICE_TOKENS_MOUNTED_FORBIDDEN",
    ],
    [
      (value) => {
        value.retention.deleteBy = "2026-08-17T11:59:59.000Z";
      },
      "FOUNDER_PILOT_EVIDENCE_WINDOW_INVALID",
    ],
    [
      (value) => {
        value.backup.capturedAt = "2026-08-17T09:59:59.000Z";
      },
      "FOUNDER_PILOT_BACKUP_RPO_EXCEEDED",
    ],
    [
      (value) => {
        value.retention.deleteBy = "2026-08-25T12:00:00.000Z";
      },
      "FOUNDER_PILOT_RETENTION_WINDOW_INVALID",
    ],
  ];

  for (const [mutate, reasonCode] of cases) {
    let targetCalls = 0;
    const value = manifest(files.artifactPath, files.backupPath);
    mutate(value);
    const result = await runFounderPilotRestoredCopyPreflight({
      inspectTarget: async () => {
        targetCalls += 1;
        return targetEvidence();
      },
      manifest: value,
      now: () => NOW,
    });
    assert.equal(
      result.decision,
      FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_BLOCKED,
    );
    assert.equal(result.reasonCode, reasonCode);
    assert.equal(targetCalls, 0);
  }
});

test("rejects target identity, migration drift, unapplied rows, and pre-existing runtime role", async (t) => {
  const files = await fixture(t);
  const cases = [
    [
      { systemIdentifier: "7612345678901234568" },
      "FOUNDER_PILOT_TARGET_IDENTITY_MISMATCH",
    ],
    [
      { migrationManifestDigest: "3".repeat(64) },
      "FOUNDER_PILOT_TARGET_MIGRATION_STATE_MISMATCH",
    ],
    [
      { nonAppliedMigrationCount: 1 },
      "FOUNDER_PILOT_TARGET_MIGRATION_STATE_MISMATCH",
    ],
    [
      { founderActivationRoleCount: 1 },
      "FOUNDER_PILOT_TARGET_RUNTIME_ROLE_ALREADY_PRESENT",
    ],
    [
      { otherTargetSessionCount: 1 },
      "FOUNDER_PILOT_TARGET_CONCURRENT_SESSION_PRESENT",
    ],
  ];
  for (const [override, reasonCode] of cases) {
    const result = await runFounderPilotRestoredCopyPreflight({
      inspectTarget: async () => targetEvidence(override),
      manifest: manifest(files.artifactPath, files.backupPath),
      now: () => NOW,
    });
    assert.equal(
      result.decision,
      FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_BLOCKED,
    );
    assert.equal(result.reasonCode, reasonCode);
  }
});

test("requires a dedicated secret environment URL bound to the exact isolated target", async (t) => {
  const files = await fixture(t);
  const target = manifest(files.artifactPath, files.backupPath).target;
  const secret = "correct-horse-battery-staple";
  assert.deepEqual(
    assertFounderPilotRestoredCopyDatabaseUrl(
      `postgresql://postgres:${secret}@127.0.0.1:55439/leetplus_restored_founder_a1`,
      target,
    ),
    {
      databaseName: target.databaseName,
      host: target.host,
      ownerRoleName: target.ownerRoleName,
      port: target.port,
    },
  );
  for (const databaseUrl of [
    `postgresql://postgres:${secret}@127.0.0.1:5432/leetplus_restored_founder_a1`,
    `postgresql://postgres:${secret}@127.0.0.1:55439/leetplus_restored_wrong`,
    `postgresql://postgres:short@127.0.0.1:55439/leetplus_restored_founder_a1`,
    `postgresql://postgres:${secret}@10.0.0.5:55439/leetplus_restored_founder_a1`,
    `postgresql://postgres:${secret}@127.0.0.1:55439/leetplus_restored_founder_a1?application_name=api`,
  ]) {
    assert.throws(
      () => assertFounderPilotRestoredCopyDatabaseUrl(databaseUrl, target),
      { reasonCode: "FOUNDER_PILOT_TARGET_DATABASE_URL_MISMATCH" },
    );
  }
});

test("loads only a bounded exact JSON manifest", async (t) => {
  const files = await fixture(t);
  const manifestPath = path.join(
    path.dirname(files.artifactPath),
    "manifest.json",
  );
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest(files.artifactPath, files.backupPath))}\n`,
    { flag: "wx" },
  );
  const loaded = await loadFounderPilotRestoredCopyManifest(manifestPath);
  assert.equal(
    loaded.contractVersion,
    FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT,
  );
  assert.equal(loaded.release.releaseSha, RELEASE_SHA);
});
