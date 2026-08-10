import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
  assembleCurrent180Current190InMemoryArtifact,
  inspectCurrent180Current190DisposableReleaseAssembly,
} from "./current180-current190-disposable-release-assembler.mjs";
import {
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONFIRMATION,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PROFILE,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS,
  authorizeCurrent180Current190DisposablePostgresqlRehearsal,
  buildCurrent180Current190PostgresqlRehearsalOwnershipMarker,
} from "./current180-current190-disposable-postgresql-rehearsal-contract.mjs";
import {
  appendCurrent180Current190PostgresqlRehearsalJournal,
  bindCurrent180Current190PostgresqlRehearsalJournalForTestOnly,
  cleanupCurrent180Current190PostgresqlRehearsalJournal,
  createCurrent180Current190PostgresqlRehearsalJournalSigner,
} from "./current180-current190-disposable-postgresql-rehearsal-journal.mjs";
import {
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_PLAN,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES,
} from "./current180-current190-disposable-postgresql-rehearsal-sql.mjs";
import {
  createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly,
  issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-coordinator.mjs";
import {
  assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceiptForTestOnly,
  cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly,
  materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-materializer.mjs";
import {
  CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT,
  Current180Current190DisposablePostgresqlRehearsalRunnerError,
  assertCurrent180Current190DisposablePostgresqlRehearsalRecoveryAdmissionReceipt,
  createCurrent180Current190DisposablePostgresqlRehearsalFakeRuntimeAdapterForTestOnly,
  inspectCurrent180Current190DisposablePostgresqlRehearsalRecoveryForManualJanitorForTestOnly,
  runCurrent180Current190DisposablePostgresqlRehearsal,
  runCurrent180Current190DisposablePostgresqlRehearsalForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-runner.mjs";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REHEARSAL_ROOT_PATTERNS = [
  /^lp-c180190-[0-9a-f]{64}-[A-Za-z0-9]{6}$/u,
  /^lp-c180190-journal-[0-9a-f]{32}-[A-Za-z0-9]{6}$/u,
];

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort(compareText)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function emptySemanticFingerprintDigest() {
  const rowsDigest = sha256(canonicalJson([]));
  const document = {
    components: Object.entries(
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES,
    ).map(([name, querySpec]) => ({
      name,
      querySpecDigest: querySpec.querySpecDigest,
      rowsDigest,
    })),
    contract:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_PLAN.contract,
  };
  return sha256(canonicalJson(document));
}

const SOURCE_ZERO_DIFF_LIFECYCLE_EVENTS = Object.freeze([
  "PREFLIGHT_ACCEPTED",
  "CLUSTER_LOCK_ACQUIRED",
  "SOURCE_PINNED",
  "CREATE_ISSUED",
  "CREATE_RECONCILED",
  "WORKING_MARKED",
  "WORKING_OPENED",
  "PRISMA_DEPLOY_ISSUED",
  "APPLY_RECONCILED",
  "WORKING_SEALED",
  "RENAME_ISSUED",
  "RENAME_RECONCILED",
  "FINAL_OPENED",
  "FINAL_FINGERPRINT_VERIFIED",
  "ZERO_DIFF_DEPLOY_ISSUED",
  "ZERO_DIFF_VERIFIED",
  "ROLLBACK_SEALED",
  "ROLLBACK_RENAME_ISSUED",
  "ROLLBACK_RENAME_RECONCILED",
  "DROP_ISSUED",
  "ABSENCE_VERIFIED",
  "SOURCE_ZERO_DIFF_VERIFIED",
]);

async function advanceJournalToSourceZeroDiff(journal, fingerprintDigest) {
  let phase = "INITIAL";
  for (const event of SOURCE_ZERO_DIFF_LIFECYCLE_EVENTS) {
    const transition =
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS[event];
    assert.ok(transition.from.includes(phase));
    await appendCurrent180Current190PostgresqlRehearsalJournal(journal, {
      event,
      evidenceDigest:
        event === "SOURCE_ZERO_DIFF_VERIFIED"
          ? fingerprintDigest
          : sha256(`evidence:${event}`),
      fromPhase: phase,
      stateDigest: sha256(`state:${phase}:${event}`),
      toPhase: transition.to,
    });
    phase = transition.to;
  }
  assert.equal(phase, "SOURCE_ZERO_DIFF_VERIFIED");
}

function environment() {
  return {
    CURRENT180_CURRENT190_PG_REHEARSAL_CONFIRM:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONFIRMATION,
    CURRENT180_CURRENT190_PG_REHEARSAL_PROFILE:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PROFILE,
    [CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT]:
      "postgresql://postgres@127.0.0.1:55432/leetplus_current180_ci?schema=public",
    NODE_ENV: "test",
  };
}

async function assembledArtifact() {
  const inspection =
    await inspectCurrent180Current190DisposableReleaseAssembly();
  assert.equal(inspection.verified, true);
  return assembleCurrent180Current190InMemoryArtifact({
    allowContract: CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
    assemblyPlanDigest: inspection.assemblyPlanDigest,
  });
}

function migrationRows(artifact, count) {
  return artifact.entries.slice(2, count + 2).map((entry) => ({
    appliedStepsCount: 1,
    checksum: entry.sha256,
    finishedAt: "2026-08-06T00:00:00.000Z",
    migrationName: entry.path.split("/")[1],
    rolledBackAt: null,
  }));
}

function authorityRow(databaseName) {
  return {
    allowConnections: true,
    currentUserCanCreateDatabase: true,
    currentUserName: "postgres",
    currentUserOid: 10,
    currentUserSuperuser: true,
    databaseName,
    databaseOid: databaseName === "postgres" ? 5 : 16_384,
    databaseOwnerName: "postgres",
    databaseOwnerOid: 10,
    isTemplate: false,
    serverVersionNumber: 160_014,
  };
}

function relationOwnerRows() {
  return CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS.map(
    (relationName, index) => ({
      exists: true,
      ordinal: index + 1,
      ownerName: "postgres",
      ownerOid: 10,
      relationKind: "r",
      relationName,
    }),
  );
}

function lockOwnerRows() {
  return [
    {
      exists: true,
      identityArguments: "text",
      ownerName: "postgres",
      ownerOid: 10,
      routineIdentity: "public.identity_mail_tenant_lock_v1(text)",
      routineKind: "f",
    },
  ];
}

function occupancyRows() {
  return [
    {
      claimedOutboxCount: 0,
      current180SuccessorObjectCount: 0,
      current186NamedRoutineCount: 0,
      enrollmentCount: 0,
      mailOutboxCount: 0,
      otherSessionCount: 0,
      tenantCount: 0,
      userCount: 0,
    },
  ];
}

function fingerprintCatalogRow() {
  return {
    allowConnections: true,
    characterType: "C",
    collation: "C",
    collationVersion: null,
    connectionLimit: -1,
    databaseAcl: "",
    encoding: "UTF8",
    icuLocale: null,
    icuRules: null,
    isTemplate: false,
    localeProvider: "c",
    ownerName: "postgres",
  };
}

function clusterRoleFingerprintRow() {
  return {
    bypassRls: false,
    canLogin: false,
    comment: "rehearsal drift fixture",
    connectionLimit: -1,
    createDatabase: false,
    createRole: false,
    inherit: true,
    passwordSet: false,
    passwordVerifierDigest: sha256(""),
    replication: false,
    roleName: "lp_rehearsal_unexpected_role",
    superuser: false,
    validUntil: "",
  };
}

function runtimeAttestation(crashRecoveryAdmission = {}) {
  const document = {
    adapterContract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT,
    crashRecoveryAdmission: {
      clusterResidueCount: crashRecoveryAdmission.clusterResidueCount ?? 0,
      journalResidueCount: crashRecoveryAdmission.journalResidueCount ?? 0,
      materializerResidueCount:
        crashRecoveryAdmission.materializerResidueCount ?? 0,
      recoveryRequired: crashRecoveryAdmission.recoveryRequired ?? false,
      verified: true,
    },
    nodeExecutablePath: process.execPath,
    nodeExecutableSha256: "a".repeat(64),
    prismaExecutablePath: resolve(
      "packages/database/node_modules/.bin/prisma.cmd",
    ),
    prismaExecutableSha256: "b".repeat(64),
    verified: true,
  };
  return {
    ...document,
    runtimeDigest: sha256(canonicalJson(document)),
  };
}

function createFakeRuntime(artifact, options = {}) {
  const calls = [];
  const consumedMaterializerVerificationReceipts = new WeakSet();
  const lostOnce = new Set(options.lostOnce ?? []);
  const state = {
    admissionFailed: false,
    activeLockReceipt: null,
    database: options.database ?? null,
    deployCount: 0,
    exactLockReceiptReleased: false,
    lockHeld: false,
    materializerVerificationConsumptionCount: 0,
  };
  const sourceRows = migrationRows(artifact, 180);
  const finalRows = migrationRows(artifact, 191);

  function connectionIdentity(connection) {
    return {
      backendPid: 4_242,
      databaseName: connection.databaseName,
      host: "127.0.0.1",
      port: 55_432,
      roleName: "postgres",
    };
  }

  function catalogRows(querySpec) {
    if (state.database === null) return [];
    const scope = querySpec.scope;
    const matches =
      [scope.workingDatabaseName, scope.finalDatabaseName].includes(
        state.database.name,
      ) ||
      (scope.expectedOid !== null &&
        scope.expectedOid === state.database.oid) ||
      (scope.expectedMarker !== null &&
        scope.expectedMarker === state.database.marker) ||
      scope.ownershipMarkers.includes(state.database.marker);
    return matches
      ? [
          {
            activeSessionCount: 0,
            allowConnections: state.database.allowConnections,
            databaseName: state.database.name,
            databaseOid: state.database.oid,
            isTemplate: false,
            marker: state.database.marker,
            ownerName: "postgres",
            ownerOid: 10,
          },
        ]
      : [];
  }

  async function liveQuery(input) {
    if (state.admissionFailed && options.rejectAllAfterAdmissionFailure) {
      throw new Error("liveQuery forbidden after admission failure");
    }
    calls.push({
      journalRecordDigest: input.journalRecordDigest,
      kind: "QUERY",
      queryId: input.querySpec.id ?? input.querySpec.contract,
    });
    let rows;
    if (input.querySpec.scope !== undefined) {
      rows = catalogRows(input.querySpec);
    } else {
      switch (input.querySpec.id) {
        case "maintenance-authority":
          rows = [authorityRow("postgres")];
          break;
        case "source-authority":
          rows = [authorityRow("leetplus_current180_ci")];
          break;
        case "required-relation-owners":
          rows = relationOwnerRows();
          break;
        case "identity-claim-lock-owner":
          rows = lockOwnerRows();
          break;
        case "migration-rows":
          rows =
            input.connection.kind === "SOURCE" || state.deployCount === 0
              ? sourceRows
              : finalRows;
          break;
        case "source-occupancy":
          rows = occupancyRows();
          break;
        case "fingerprint-catalog":
          rows =
            options.zeroDiffDrift === true &&
            state.deployCount >= 2 &&
            input.connection.kind === "TARGET"
              ? [fingerprintCatalogRow()]
              : [];
          break;
        case "fingerprint-cluster-roles":
          rows =
            options.clusterRoleDriftAfterDeploy === true &&
            state.deployCount >= 1
              ? [clusterRoleFingerprintRow()]
              : [];
          break;
        default:
          rows = [];
      }
    }
    return { connectionIdentity: connectionIdentity(input.connection), rows };
  }

  function maybeLose(kind) {
    if (!lostOnce.delete(kind)) return;
    const error = new Error("simulated lost response");
    error.code = "RUNTIME_EFFECT_RESPONSE_LOST";
    throw error;
  }

  async function executeStatement(input) {
    if (state.admissionFailed && options.rejectAllAfterAdmissionFailure) {
      throw new Error("executeStatement forbidden after admission failure");
    }
    const kind = input.statementSpec.kind;
    calls.push({
      journalRecordDigest: input.journalRecordDigest,
      kind,
      statementSpecDigest: input.statementSpec.statementSpecDigest,
    });
    if (kind === "CREATE_DATABASE_FROM_FIXED_CURRENT180") {
      state.database = {
        allowConnections: false,
        marker: null,
        name: input.names.workingDatabaseName,
        oid: 61_001,
      };
    } else if (kind === "COMMENT_OWNERSHIP_MARKER") {
      const marker = /LEETPLUS_CURRENT180190_REHEARSAL_V1:[0-9a-f]{64}/u.exec(
        input.statementSpec.sql,
      )?.[0];
      assert.match(marker, /^LEETPLUS_CURRENT180190_REHEARSAL_V1:/u);
      state.database.marker = marker;
    } else if (kind === "ALTER_ALLOW_CONNECTIONS") {
      state.database.allowConnections = /ALLOW_CONNECTIONS = true/u.test(
        input.statementSpec.sql,
      );
    } else if (kind === "RENAME_SAME_TOKEN_DATABASE") {
      state.database.name =
        state.database.name === input.names.workingDatabaseName
          ? input.names.finalDatabaseName
          : input.names.workingDatabaseName;
    } else if (kind === "DROP_EXACT_OWNED_SEALED_TARGET") {
      state.database = null;
    } else {
      assert.fail(`unexpected statement kind ${kind}`);
    }
    maybeLose(kind);
    return { responseObserved: true };
  }

  const implementation = {
    acquireClusterLock: async (input) => {
      calls.push({
        journalRecordDigest: input.journalRecordDigest,
        kind: "ACQUIRE_LOCK",
        runToken: input.runToken,
      });
      if (options.acquireFailureCode !== undefined) {
        state.admissionFailed = true;
        const error = new Error("simulated cluster lock refusal");
        error.code = options.acquireFailureCode;
        throw error;
      }
      assert.equal(state.lockHeld, false);
      state.lockHeld = true;
      state.activeLockReceipt = Object.freeze({
        backendPid: 4_242,
        contract: "TEST_ONLY_PINNED_CLUSTER_LOCK_V1",
        lockKeyDigest: sha256(canonicalJson(input.names)),
      });
      return state.activeLockReceipt;
    },
    attestExecutableRuntime: async (input) => {
      calls.push({
        journalRecordDigest: input.journalRecordDigest,
        kind: "ATTEST",
        runToken: input.runToken,
      });
      if (options.attestThrows === true) {
        state.admissionFailed = true;
        throw new Error("simulated executable attestation failure");
      }
      return runtimeAttestation(options.crashRecoveryAdmission);
    },
    cleanup: async (input) => {
      if (state.admissionFailed && options.rejectAllAfterAdmissionFailure) {
        throw new Error("cleanup forbidden after admission failure");
      }
      calls.push({
        journalRecordDigest: input.journalRecordDigest,
        kind: "RUNTIME_CLEANUP",
        reason: input.reason,
      });
      state.lockHeld = false;
      return {
        responseObserved: true,
        runtimeResourcesReleased: true,
        targetAbsentVerified: state.database === null,
      };
    },
    contract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT,
    deploy: async (input) => {
      if (state.admissionFailed && options.rejectAllAfterAdmissionFailure) {
        throw new Error("deploy forbidden after admission failure");
      }
      calls.push({
        journalRecordDigest: input.journalRecordDigest,
        kind: "DEPLOY",
        schemaPath: input.schemaPath,
      });
      assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceiptForTestOnly(
        input.materializerVerificationReceipt,
      );
      assert.equal(
        consumedMaterializerVerificationReceipts.has(
          input.materializerVerificationReceipt,
        ),
        false,
      );
      consumedMaterializerVerificationReceipts.add(
        input.materializerVerificationReceipt,
      );
      state.materializerVerificationConsumptionCount += 1;
      assert.equal(
        input.materializerVerificationReceipt.schemaPath,
        input.schemaPath,
      );
      state.deployCount += 1;
      maybeLose("DEPLOY");
      return { responseObserved: true };
    },
    executeStatement,
    liveQuery,
    releaseClusterLock: async (input) => {
      if (state.admissionFailed && options.rejectAllAfterAdmissionFailure) {
        throw new Error("release forbidden after admission failure");
      }
      calls.push({
        journalRecordDigest: input.journalRecordDigest,
        kind: "RELEASE_LOCK",
      });
      assert.equal(state.lockHeld, true);
      assert.strictEqual(input.lockReceipt, state.activeLockReceipt);
      state.exactLockReceiptReleased = true;
      state.lockHeld = false;
      state.activeLockReceipt = null;
      return { released: true };
    },
  };
  return {
    adapter:
      createCurrent180Current190DisposablePostgresqlRehearsalFakeRuntimeAdapterForTestOnly(
        implementation,
      ),
    calls,
    state,
  };
}

async function rehearsalRootNames() {
  return new Set(
    (await readdir(tmpdir(), { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isDirectory() &&
          REHEARSAL_ROOT_PATTERNS.some((pattern) => pattern.test(entry.name)),
      )
      .map(({ name }) => name),
  );
}

async function rehearsalRootNamesForRun(runToken) {
  const names = await rehearsalRootNames();
  const matching = new Set();
  for (const name of names) {
    if (name.startsWith(`lp-c180190-journal-${runToken}-`)) {
      matching.add(name);
      continue;
    }
    if (!name.startsWith("lp-c180190-") || name.includes("-journal-")) {
      continue;
    }
    try {
      const anchor = await readFile(
        join(
          tmpdir(),
          name,
          ".leetplus-current180-current190-recovery-anchor.json",
        ),
        "utf8",
      );
      if (anchor.includes(`\"runToken\":\"${runToken}\"`)) {
        matching.add(name);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return matching;
}

async function removeRehearsalRootsForRun(runToken) {
  const created = await rehearsalRootNamesForRun(runToken);
  for (const name of created) {
    await rm(join(tmpdir(), name), { force: false, recursive: true });
  }
  return [...created];
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function createAbsentTargetRecoveryFixture(artifact) {
  const authorization =
    authorizeCurrent180Current190DisposablePostgresqlRehearsal({
      allowContract:
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT,
      assemblyReceipt: artifact,
      environment: environment(),
    });
  const signer = createCurrent180Current190PostgresqlRehearsalJournalSigner();
  const coordinatorAuthority =
    createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly();
  const coordinatorRunBinding =
    await issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
      coordinatorAuthority,
      {
        authorizationReceiptDigest: authorization.authorizationReceiptDigest,
        runToken: signer.runToken,
      },
    );
  const journal =
    await bindCurrent180Current190PostgresqlRehearsalJournalForTestOnly(
      coordinatorAuthority,
      coordinatorRunBinding,
      signer,
    );
  const materialization =
    await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
      coordinatorAuthority,
      coordinatorRunBinding,
    );
  const fake = createFakeRuntime(artifact, {
    crashRecoveryAdmission: {
      clusterResidueCount: 0,
      journalResidueCount: 1,
      materializerResidueCount: 1,
      recoveryRequired: true,
    },
  });
  return {
    coordinatorAuthority,
    fake,
    journal,
    materialization,
  };
}

async function cleanupRecoveryFixture(fixture) {
  if (await pathExists(fixture.materialization.artifactRootPath)) {
    await cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      fixture.materialization,
    );
  }
  if (await pathExists(fixture.journal.rootPath)) {
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(
      fixture.journal,
    );
  }
}

test("rejects caller-created and cloned runtime adapters before any effect", async () => {
  const artifact = await assembledArtifact();
  const fake = createFakeRuntime(artifact);
  const clone = { ...fake.adapter };
  await assert.rejects(
    runCurrent180Current190DisposablePostgresqlRehearsalForTestOnly(
      { attempt: 1, environment: environment() },
      clone,
    ),
    (error) =>
      error instanceof
        Current180Current190DisposablePostgresqlRehearsalRunnerError &&
      error.code === "RUNNER_TEST_RUNTIME_ADAPTER_INVALID",
  );
  assert.equal(fake.calls.length, 0);
});

test("production runner refuses to start without an explicit file-backed coordinator pin", async () => {
  await assert.rejects(
    runCurrent180Current190DisposablePostgresqlRehearsal({
      attempt: 1,
      environment: environment(),
    }),
    (error) =>
      error instanceof
        Current180Current190DisposablePostgresqlRehearsalRunnerError &&
      error.code === "RUNNER_INPUT_INVALID" &&
      error.findings.includes(
        "EXACT_ATTEMPT_COORDINATOR_AND_ENVIRONMENT_REQUIRED",
      ),
  );
});

test("runs exact full lifecycle, releases the identical branded lock receipt, and leaves zero residue", async () => {
  const artifact = await assembledArtifact();
  const fake = createFakeRuntime(artifact);
  let result;
  try {
    result =
      await runCurrent180Current190DisposablePostgresqlRehearsalForTestOnly(
        { attempt: 1, environment: environment() },
        fake.adapter,
      );
  } catch (error) {
    assert.fail(
      canonicalJson({
        calls: fake.calls,
        code: error.code,
        failedClean: error.failedClean,
        findings: error.findings,
        state: fake.state,
      }),
    );
  }
  assert.equal(
    result.status,
    "DISPOSABLE_POSTGRESQL_REHEARSAL_COMPLETED_ZERO_DIFF_ZERO_RESIDUE",
  );
  assert.equal(result.verified, true);
  assert.equal(result.targetAbsentVerified, true);
  assert.equal(result.artifactRootAbsent, true);
  assert.equal(result.journalRootAbsent, true);
  assert.match(result.runnerReceiptDigest, SHA256_PATTERN);
  assert.match(result.coordinatorFingerprintSha256, SHA256_PATTERN);
  assert.equal(fake.state.database, null);
  assert.equal(fake.state.deployCount, 2);
  assert.equal(fake.state.exactLockReceiptReleased, true);
  assert.equal(fake.state.lockHeld, false);
  assert.equal(fake.state.materializerVerificationConsumptionCount, 2);
  const create = fake.calls.find(
    ({ kind }) => kind === "CREATE_DATABASE_FROM_FIXED_CURRENT180",
  );
  const comment = fake.calls.find(
    ({ kind }) => kind === "COMMENT_OWNERSHIP_MARKER",
  );
  assert.ok(create);
  assert.ok(comment);
  assert.notEqual(comment.journalRecordDigest, create.journalRecordDigest);
  assert.ok(
    fake.calls.some(({ queryId }) => queryId === "fingerprint-catalog"),
  );
  assert.deepEqual(await rehearsalRootNamesForRun(result.runToken), new Set());
});

test("reconciles one lost response for COMMENT, ALLOW, deploy, rename and drop", async () => {
  const artifact = await assembledArtifact();
  const fake = createFakeRuntime(artifact, {
    lostOnce: [
      "COMMENT_OWNERSHIP_MARKER",
      "ALTER_ALLOW_CONNECTIONS",
      "DEPLOY",
      "RENAME_SAME_TOKEN_DATABASE",
      "DROP_EXACT_OWNED_SEALED_TARGET",
    ],
  });
  const result =
    await runCurrent180Current190DisposablePostgresqlRehearsalForTestOnly(
      { attempt: 2, environment: environment() },
      fake.adapter,
    );
  assert.equal(result.verified, true);
  assert.equal(fake.state.database, null);
  assert.equal(fake.state.lockHeld, false);
});

test("zero-diff semantic drift fails clean and janitor proves target absence", async () => {
  const artifact = await assembledArtifact();
  const fake = createFakeRuntime(artifact, { zeroDiffDrift: true });
  await assert.rejects(
    runCurrent180Current190DisposablePostgresqlRehearsalForTestOnly(
      { attempt: 1, environment: environment() },
      fake.adapter,
    ),
    (error) =>
      error instanceof
        Current180Current190DisposablePostgresqlRehearsalRunnerError &&
      error.code === "RUNNER_ZERO_DIFF_BLOCKED" &&
      error.failedClean === true,
  );
  assert.equal(fake.state.database, null);
});

test("cluster-global role drift survives target DROP, fails source zero-diff, and makes the janitor preserve signed evidence", async () => {
  const artifact = await assembledArtifact();
  const fake = createFakeRuntime(artifact, {
    clusterRoleDriftAfterDeploy: true,
  });
  let runToken;
  try {
    await assert.rejects(
      runCurrent180Current190DisposablePostgresqlRehearsalForTestOnly(
        { attempt: 1, environment: environment() },
        fake.adapter,
      ),
      (error) => {
        runToken = fake.calls.find(({ runToken: value }) => value)?.runToken;
        return (
          error instanceof
            Current180Current190DisposablePostgresqlRehearsalRunnerError &&
          error.code === "RUNNER_SOURCE_ZERO_DIFF_BLOCKED" &&
          error.failedClean === false &&
          error.findings.includes("MANUAL_JANITOR_REQUIRED_EVIDENCE_PRESERVED")
        );
      },
    );
    assert.equal(fake.state.database, null);
    assert.equal(fake.state.lockHeld, true);
    assert.match(runToken, /^[0-9a-f]{32}$/u);
    assert.ok((await rehearsalRootNamesForRun(runToken)).size >= 2);
    assert.ok(
      fake.calls.filter(
        ({ queryId }) => queryId === "fingerprint-cluster-roles",
      ).length >= 4,
    );
  } finally {
    if (typeof runToken === "string") {
      const removed = await removeRehearsalRootsForRun(runToken);
      assert.ok(removed.length >= 2);
    }
  }
});

test("throwing executable attestation removes only this run's fresh journal and makes no later adapter call", async () => {
  const artifact = await assembledArtifact();
  const fake = createFakeRuntime(artifact, {
    attestThrows: true,
    rejectAllAfterAdmissionFailure: true,
  });
  await assert.rejects(
    runCurrent180Current190DisposablePostgresqlRehearsalForTestOnly(
      { attempt: 1, environment: environment() },
      fake.adapter,
    ),
    (error) =>
      error instanceof
        Current180Current190DisposablePostgresqlRehearsalRunnerError &&
      error.code === "RUNNER_RUNTIME_ATTESTATION_FAILED" &&
      error.failedClean === true &&
      error.findings.includes("ONLY_THIS_RUN_FRESH_PRE_EFFECT_RESIDUE_REMOVED"),
  );
  assert.deepEqual(
    fake.calls.map(({ kind }) => kind),
    ["ATTEST"],
  );
  assert.deepEqual(
    await rehearsalRootNamesForRun(fake.calls[0].runToken),
    new Set(),
  );
});

test("proved lock non-acquisition removes this run's materializer and journal without a later adapter call", async () => {
  const artifact = await assembledArtifact();
  const fake = createFakeRuntime(artifact, {
    acquireFailureCode: "RUNTIME_CLUSTER_LOCK_NOT_ACQUIRED",
    rejectAllAfterAdmissionFailure: true,
  });
  await assert.rejects(
    runCurrent180Current190DisposablePostgresqlRehearsalForTestOnly(
      { attempt: 1, environment: environment() },
      fake.adapter,
    ),
    (error) =>
      error instanceof
        Current180Current190DisposablePostgresqlRehearsalRunnerError &&
      error.code === "RUNNER_CLUSTER_LOCK_NOT_ACQUIRED" &&
      error.failedClean === true &&
      error.findings.includes("ONLY_THIS_RUN_FRESH_PRE_EFFECT_RESIDUE_REMOVED"),
  );
  assert.deepEqual(
    fake.calls.map(({ kind }) => kind),
    ["ATTEST", "ACQUIRE_LOCK"],
  );
  assert.equal(fake.state.database, null);
  const lockCall = fake.calls.find(({ kind }) => kind === "ACQUIRE_LOCK");
  assert.ok(lockCall);
  assert.deepEqual(
    await rehearsalRootNamesForRun(lockCall.runToken),
    new Set(),
  );
});

test("non-zero crash admission cannot start and removes only the new pre-effect journal", async () => {
  const artifact = await assembledArtifact();
  const fake = createFakeRuntime(artifact, {
    crashRecoveryAdmission: {
      clusterResidueCount: 1,
      recoveryRequired: true,
    },
    rejectAllAfterAdmissionFailure: true,
  });
  await assert.rejects(
    runCurrent180Current190DisposablePostgresqlRehearsalForTestOnly(
      { attempt: 1, environment: environment() },
      fake.adapter,
    ),
    (error) =>
      error instanceof
        Current180Current190DisposablePostgresqlRehearsalRunnerError &&
      error.code === "RUNNER_CRASH_RECOVERY_REQUIRED" &&
      error.failedClean === true,
  );
  assert.deepEqual(
    fake.calls.map(({ kind }) => kind),
    ["ATTEST"],
  );
  assert.deepEqual(
    await rehearsalRootNamesForRun(fake.calls[0].runToken),
    new Set(),
  );
});

test("lost CREATE with an unmarked target preserves database and durable evidence for manual janitor", async () => {
  const artifact = await assembledArtifact();
  const fake = createFakeRuntime(artifact, {
    lostOnce: ["CREATE_DATABASE_FROM_FIXED_CURRENT180"],
  });
  let runToken;
  try {
    await assert.rejects(
      runCurrent180Current190DisposablePostgresqlRehearsalForTestOnly(
        { attempt: 1, environment: environment() },
        fake.adapter,
      ),
      (error) =>
        error instanceof
          Current180Current190DisposablePostgresqlRehearsalRunnerError &&
        error.code === "RUNNER_CREATE_RESPONSE_LOST_UNMARKED" &&
        error.failedClean === false &&
        error.findings.includes("MANUAL_JANITOR_REQUIRED_EVIDENCE_PRESERVED"),
    );
    assert.equal(fake.state.database?.marker, null);
    assert.equal(
      fake.calls.some(({ kind }) => kind === "RUNTIME_CLEANUP"),
      false,
    );
    runToken = fake.calls.find(({ runToken: value }) => value)?.runToken;
    assert.match(runToken, /^[0-9a-f]{32}$/u);
    assert.ok((await rehearsalRootNamesForRun(runToken)).size >= 2);
  } finally {
    if (typeof runToken === "string") {
      const removed = await removeRehearsalRootsForRun(runToken);
      assert.ok(removed.length >= 2);
    }
  }
});

test("restart recovery finds a renamed database by its exact run ownership marker, preserves evidence, and never mutates", async () => {
  const artifact = await assembledArtifact();
  const authorization =
    authorizeCurrent180Current190DisposablePostgresqlRehearsal({
      allowContract:
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT,
      assemblyReceipt: artifact,
      environment: environment(),
    });
  const signer = createCurrent180Current190PostgresqlRehearsalJournalSigner();
  const coordinatorAuthority =
    createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly();
  const coordinatorRunBinding =
    await issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
      coordinatorAuthority,
      {
        authorizationReceiptDigest: authorization.authorizationReceiptDigest,
        runToken: signer.runToken,
      },
    );
  const journal =
    await bindCurrent180Current190PostgresqlRehearsalJournalForTestOnly(
      coordinatorAuthority,
      coordinatorRunBinding,
      signer,
    );
  const materialization =
    await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
      coordinatorAuthority,
      coordinatorRunBinding,
    );
  const marker = buildCurrent180Current190PostgresqlRehearsalOwnershipMarker({
    attempt: 1,
    authorizationReceiptDigest: authorization.authorizationReceiptDigest,
    runToken: journal.runToken,
  });
  const fake = createFakeRuntime(artifact, {
    crashRecoveryAdmission: {
      clusterResidueCount: 1,
      journalResidueCount: 1,
      materializerResidueCount: 1,
      recoveryRequired: true,
    },
    database: {
      allowConnections: false,
      marker,
      name: "renamed_owned_rehearsal",
      oid: 71_001,
    },
  });
  try {
    const receipt =
      await inspectCurrent180Current190DisposablePostgresqlRehearsalRecoveryForManualJanitorForTestOnly(
        {
          coordinatorAuthority,
          environment: environment(),
          journalLocator: { ...journal.verificationLocator },
          materializationRecoveryLocator: {
            ...materialization.recoveryLocator,
          },
        },
        fake.adapter,
      );
    assert.equal(receipt.mutationAttempted, false);
    assert.equal(receipt.automaticMutationAuthorized, false);
    assert.equal(receipt.targetState, "EXACT_MARKED_OWNED_TARGET_PRESENT");
    assert.equal(receipt.materializationEvidenceFound, true);
    assert.equal(receipt.materializationCleanupAttempted, false);
    assert.equal(receipt.materializationArtifactRootAbsent, false);
    assert.equal(await pathExists(materialization.artifactRootPath), true);
    assert.equal(await pathExists(journal.rootPath), true);
    assert.equal(
      receipt.status,
      "BLOCKED_MANUAL_EFFECT_AUTHORITY_NOT_RESTORABLE",
    );
    assertCurrent180Current190DisposablePostgresqlRehearsalRecoveryAdmissionReceipt(
      receipt,
    );
    assert.throws(
      () =>
        assertCurrent180Current190DisposablePostgresqlRehearsalRecoveryAdmissionReceipt(
          { ...receipt },
        ),
      Current180Current190DisposablePostgresqlRehearsalRunnerError,
    );
    assert.equal(
      fake.calls.some(({ kind }) =>
        [
          "CREATE_DATABASE_FROM_FIXED_CURRENT180",
          "ALTER_ALLOW_CONNECTIONS",
          "DROP_EXACT_OWNED_SEALED_TARGET",
          "RUNTIME_CLEANUP",
        ].includes(kind),
      ),
      false,
    );
  } finally {
    await cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      materialization,
    );
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
});

test("restart recovery preserves signed filesystem evidence when the target is absent before durable source zero-diff", async () => {
  const artifact = await assembledArtifact();
  const authorization =
    authorizeCurrent180Current190DisposablePostgresqlRehearsal({
      allowContract:
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT,
      assemblyReceipt: artifact,
      environment: environment(),
    });
  const signer = createCurrent180Current190PostgresqlRehearsalJournalSigner();
  const coordinatorAuthority =
    createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly();
  const coordinatorRunBinding =
    await issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
      coordinatorAuthority,
      {
        authorizationReceiptDigest: authorization.authorizationReceiptDigest,
        runToken: signer.runToken,
      },
    );
  const journal =
    await bindCurrent180Current190PostgresqlRehearsalJournalForTestOnly(
      coordinatorAuthority,
      coordinatorRunBinding,
      signer,
    );
  const materialization =
    await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
      coordinatorAuthority,
      coordinatorRunBinding,
    );
  const fake = createFakeRuntime(artifact, {
    crashRecoveryAdmission: {
      clusterResidueCount: 0,
      journalResidueCount: 1,
      materializerResidueCount: 1,
      recoveryRequired: true,
    },
  });
  try {
    const receipt =
      await inspectCurrent180Current190DisposablePostgresqlRehearsalRecoveryForManualJanitorForTestOnly(
        {
          coordinatorAuthority,
          environment: environment(),
          journalLocator: { ...journal.verificationLocator },
          materializationRecoveryLocator: {
            ...materialization.recoveryLocator,
          },
        },
        fake.adapter,
      );
    assert.equal(receipt.targetState, "TARGET_ABSENT");
    assert.equal(receipt.sourceGlobalZeroDiffDurablyVerified, false);
    assert.equal(receipt.sourceGlobalZeroDiffCurrentlyVerified, false);
    assert.equal(receipt.filesystemRestartCleanupAllowed, false);
    assert.equal(receipt.materializationEvidenceFound, true);
    assert.equal(receipt.materializationCleanupAttempted, false);
    assert.equal(receipt.materializationArtifactRootAbsent, false);
    assert.equal(receipt.journalCleanupAttempted, false);
    assert.equal(receipt.journalRootAbsent, false);
    assert.equal(receipt.runtimeResourcesReleased, true);
    assert.equal(
      receipt.status,
      "BLOCKED_MANUAL_SOURCE_GLOBAL_ZERO_DIFF_NOT_DURABLY_VERIFIED",
    );
    assert.equal(await pathExists(materialization.artifactRootPath), true);
    assert.equal(await pathExists(journal.rootPath), true);
    assert.equal(
      fake.calls.some(({ kind }) =>
        [
          "CREATE_DATABASE_FROM_FIXED_CURRENT180",
          "ALTER_ALLOW_CONNECTIONS",
          "DROP_EXACT_OWNED_SEALED_TARGET",
        ].includes(kind),
      ),
      false,
    );
    assert.equal(
      fake.calls.filter(({ kind }) => kind === "RUNTIME_CLEANUP").length,
      1,
    );
    assertCurrent180Current190DisposablePostgresqlRehearsalRecoveryAdmissionReceipt(
      receipt,
    );
  } finally {
    if (await pathExists(materialization.artifactRootPath)) {
      await cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
        materialization,
      );
    }
    if (await pathExists(journal.rootPath)) {
      await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
    }
  }
});

test("restart recovery cleans signed filesystem evidence only when the fresh source fingerprint equals the signed source zero-diff digest", async () => {
  const artifact = await assembledArtifact();
  const fixture = await createAbsentTargetRecoveryFixture(artifact);
  const fingerprintDigest = emptySemanticFingerprintDigest();
  try {
    await advanceJournalToSourceZeroDiff(fixture.journal, fingerprintDigest);
    const receipt =
      await inspectCurrent180Current190DisposablePostgresqlRehearsalRecoveryForManualJanitorForTestOnly(
        {
          coordinatorAuthority: fixture.coordinatorAuthority,
          environment: environment(),
          journalLocator: { ...fixture.journal.verificationLocator },
          materializationRecoveryLocator: {
            ...fixture.materialization.recoveryLocator,
          },
        },
        fixture.fake.adapter,
      );
    assert.equal(receipt.targetState, "TARGET_ABSENT");
    assert.equal(receipt.sourceZeroDiffFingerprintDigest, fingerprintDigest);
    assert.equal(receipt.currentSourceFingerprintDigest, fingerprintDigest);
    assert.equal(receipt.sourceGlobalZeroDiffDurablyVerified, true);
    assert.equal(receipt.sourceGlobalZeroDiffCurrentlyVerified, true);
    assert.equal(receipt.sourceGlobalZeroDiffRecheckFailed, false);
    assert.equal(receipt.filesystemRestartCleanupAllowed, true);
    assert.equal(receipt.materializationCleanupAttempted, true);
    assert.equal(receipt.materializationArtifactRootAbsent, true);
    assert.equal(receipt.journalCleanupAttempted, true);
    assert.equal(receipt.journalRootAbsent, true);
    assert.equal(
      receipt.status,
      "RECOVERED_ZERO_DATABASE_AND_SIGNED_FILESYSTEM_RESIDUE_NO_DATABASE_MUTATION",
    );
    assert.equal(
      await pathExists(fixture.materialization.artifactRootPath),
      false,
    );
    assert.equal(await pathExists(fixture.journal.rootPath), false);
    assertCurrent180Current190DisposablePostgresqlRehearsalRecoveryAdmissionReceipt(
      receipt,
    );
  } finally {
    await cleanupRecoveryFixture(fixture);
  }
});

test("restart recovery preserves signed filesystem evidence when the fresh source fingerprint differs from the signed source zero-diff digest", async () => {
  const artifact = await assembledArtifact();
  const fixture = await createAbsentTargetRecoveryFixture(artifact);
  const signedFingerprintDigest = "f".repeat(64);
  assert.notEqual(signedFingerprintDigest, emptySemanticFingerprintDigest());
  try {
    await advanceJournalToSourceZeroDiff(
      fixture.journal,
      signedFingerprintDigest,
    );
    const receipt =
      await inspectCurrent180Current190DisposablePostgresqlRehearsalRecoveryForManualJanitorForTestOnly(
        {
          coordinatorAuthority: fixture.coordinatorAuthority,
          environment: environment(),
          journalLocator: { ...fixture.journal.verificationLocator },
          materializationRecoveryLocator: {
            ...fixture.materialization.recoveryLocator,
          },
        },
        fixture.fake.adapter,
      );
    assert.equal(receipt.targetState, "TARGET_ABSENT");
    assert.equal(
      receipt.sourceZeroDiffFingerprintDigest,
      signedFingerprintDigest,
    );
    assert.equal(
      receipt.currentSourceFingerprintDigest,
      emptySemanticFingerprintDigest(),
    );
    assert.equal(receipt.sourceGlobalZeroDiffDurablyVerified, true);
    assert.equal(receipt.sourceGlobalZeroDiffCurrentlyVerified, false);
    assert.equal(receipt.sourceGlobalZeroDiffRecheckFailed, false);
    assert.equal(receipt.filesystemRestartCleanupAllowed, false);
    assert.equal(receipt.materializationCleanupAttempted, false);
    assert.equal(receipt.materializationArtifactRootAbsent, false);
    assert.equal(receipt.journalCleanupAttempted, false);
    assert.equal(receipt.journalRootAbsent, false);
    assert.equal(
      receipt.status,
      "BLOCKED_MANUAL_SOURCE_GLOBAL_ZERO_DIFF_FINGERPRINT_MISMATCH",
    );
    assert.equal(
      await pathExists(fixture.materialization.artifactRootPath),
      true,
    );
    assert.equal(await pathExists(fixture.journal.rootPath), true);
    assertCurrent180Current190DisposablePostgresqlRehearsalRecoveryAdmissionReceipt(
      receipt,
    );
  } finally {
    await cleanupRecoveryFixture(fixture);
  }
});
