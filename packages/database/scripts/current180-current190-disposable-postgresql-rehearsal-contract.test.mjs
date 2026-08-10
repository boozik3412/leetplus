import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
  assembleCurrent180Current190InMemoryArtifact,
  inspectCurrent180Current190DisposableReleaseAssembly,
} from "./current180-current190-disposable-release-assembler.mjs";
import {
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_STATUS,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONFIRMATION,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONTRACT,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_DATABASE_PATTERNS,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_EFFECTS,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PHASES,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PREFIXES,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PROFILE,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITION_EVIDENCE_CONTRACT,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS,
  Current180Current190PostgresqlRehearsalContractError,
  advanceCurrent180Current190PostgresqlRehearsalState,
  authorizeCurrent180Current190DisposablePostgresqlRehearsal,
  buildCurrent180Current190PostgresqlRehearsalChildEnvironment,
  buildCurrent180Current190PostgresqlRehearsalOwnershipIdentity,
  buildCurrent180Current190PostgresqlRehearsalOwnershipMarker,
  buildCurrent180Current190PostgresqlRehearsalSessionOptions,
  buildCurrent180Current190PostgresqlRehearsalTransitionEvidence,
  createCurrent180Current190PostgresqlRehearsalState,
  deriveCurrent180Current190PostgresqlRehearsalDatabaseNames,
  evaluateCurrent180Current190PostgresqlPrismaPrefix,
  evaluateCurrent180Current190PostgresqlSourcePreflight,
  inspectCurrent180Current190PostgresqlRehearsalEnvironment,
  reconcileCurrent180Current190PostgresqlRehearsalAllowConnections,
  reconcileCurrent180Current190PostgresqlRehearsalCreate,
  reconcileCurrent180Current190PostgresqlRehearsalDrop,
  reconcileCurrent180Current190PostgresqlRehearsalRename,
  sanitizeCurrent180Current190PostgresqlRehearsalDiagnostic,
  validateCurrent180Current190PostgresqlRehearsalDatabaseNames,
} from "./current180-current190-disposable-postgresql-rehearsal-contract.mjs";

const RUN_TOKEN = "0123456789abcdef".repeat(2);
const OTHER_RUN_TOKEN = "fedcba9876543210".repeat(2);
const SOURCE_URL =
  "postgresql://postgres@127.0.0.1:55432/leetplus_current180_ci?schema=public";
const PASSWORD_SOURCE_URL =
  "postgresql://postgres:p%40ssword@127.0.0.1:55432/leetplus_current180_ci?schema=public";
const FINAL_PREFIX = CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PREFIXES.at(-1);

const assemblyPlan =
  await inspectCurrent180Current190DisposableReleaseAssembly();
const ASSEMBLY_ARTIFACT = await assembleCurrent180Current190InMemoryArtifact({
  allowContract: CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
  assemblyPlanDigest: assemblyPlan.assemblyPlanDigest,
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function recomputeAuthorizationReceipt(receipt) {
  const { authorizationReceiptDigest: _ignored, ...document } = receipt;
  return {
    ...document,
    authorizationReceiptDigest: sha256(canonicalJson(document)),
  };
}

function recomputeState(state, overrides) {
  const { stateDigest: _ignored, ...document } = { ...state, ...overrides };
  return {
    ...document,
    stateDigest: sha256(canonicalJson(document)),
  };
}

function environment(overrides = {}) {
  return {
    CURRENT180_CURRENT190_PG_REHEARSAL_CONFIRM:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONFIRMATION,
    CURRENT180_CURRENT190_PG_REHEARSAL_PROFILE:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PROFILE,
    [CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT]:
      SOURCE_URL,
    NODE_ENV: "test",
    PATH: "C:\\Windows\\System32",
    TEMP: "C:\\Temp",
    ...overrides,
  };
}

function authorize(
  environmentValue = environment(),
  artifact = ASSEMBLY_ARTIFACT,
) {
  return authorizeCurrent180Current190DisposablePostgresqlRehearsal({
    allowContract:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT,
    assemblyReceipt: artifact,
    environment: environmentValue,
  });
}

const AUTHORIZATION = authorize();
const NAMES =
  deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(RUN_TOKEN);

function expectContractError(callback, code, findings = undefined) {
  assert.throws(callback, (error) => {
    assert.ok(
      error instanceof Current180Current190PostgresqlRehearsalContractError,
    );
    assert.equal(error.code, code);
    if (findings !== undefined) {
      assert.deepEqual(error.findings, [...findings].sort());
    }
    return true;
  });
}

function ownershipContext(overrides = {}) {
  return {
    attempt: 1,
    authorizationReceiptDigest: AUTHORIZATION.authorizationReceiptDigest,
    ownerName: "postgres",
    ownerOid: 11,
    runToken: RUN_TOKEN,
    ...overrides,
  };
}

function markerInput(overrides = {}) {
  return {
    attempt: 1,
    authorizationReceiptDigest: AUTHORIZATION.authorizationReceiptDigest,
    runToken: RUN_TOKEN,
    ...overrides,
  };
}

function ownershipIdentity(overrides = {}) {
  return buildCurrent180Current190PostgresqlRehearsalOwnershipIdentity({
    ...ownershipContext(),
    oid: 101,
    ...overrides,
  });
}

function catalogRow(name, overrides = {}) {
  return {
    allowConnections: false,
    isTemplate: false,
    marker: null,
    name,
    oid: 101,
    ownerName: "postgres",
    ownerOid: 11,
    ...overrides,
  };
}

function sourcePreflight(environmentValue = environment(), overrides = {}) {
  const report =
    inspectCurrent180Current190PostgresqlRehearsalEnvironment(environmentValue);
  const source = CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PREFIXES[0];
  return {
    claimedOutboxCount: 0,
    current180SuccessorObjectCount: 0,
    current186NamedRoutineCount: 0,
    currentUserCanCreateDatabase: true,
    currentUserName: "postgres",
    currentUserOid: 11,
    currentUserSuperuser: true,
    databaseName: "leetplus_current180_ci",
    databaseOid: 100,
    databaseOwnerName: "postgres",
    databaseOwnerOid: 11,
    enrollmentCount: 0,
    host: "127.0.0.1",
    identityClaimLockOwnerOid: 11,
    isTemplate: false,
    migrationCount: source.count,
    migrationHead: source.head,
    migrationHeadChecksum: source.headChecksum,
    migrationManifestDigest: source.digest,
    otherSessionCount: 0,
    port: 55432,
    requiredRelationOwners:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS.map(
        (relationName) => ({ ownerOid: 11, relationName }),
      ),
    rolledBackMigrationCount: 0,
    serverVersionNumber: 160_006,
    sourceFingerprint: "f".repeat(64),
    sourceUrlSha256: report.source.urlSha256,
    unfinishedMigrationCount: 0,
    ...overrides,
  };
}

function prismaRows(count, transform = (row) => row) {
  return ASSEMBLY_ARTIFACT.entries.slice(2, count + 2).map((entry, index) => {
    const match = /^migrations\/(\d{14}_[a-z0-9_]+)\/migration\.sql$/u.exec(
      entry.path,
    );
    assert.ok(match);
    return transform(
      {
        appliedStepsCount: 1,
        checksum: entry.sha256,
        finishedAt: "2026-08-05T12:00:00.000Z",
        migrationName: match[1],
        rolledBackAt: null,
      },
      index,
    );
  });
}

function evaluatePrefix(count, transform) {
  return evaluateCurrent180Current190PostgresqlPrismaPrefix({
    assemblyReceipt: ASSEMBLY_ARTIFACT,
    rows: prismaRows(count, transform),
  });
}

const SOURCE_PIN =
  evaluateCurrent180Current190PostgresqlSourcePreflight(
    sourcePreflight(),
  ).sourcePin;
const OWNERSHIP_IDENTITY = ownershipIdentity();
const FINAL_PREFIX_EVIDENCE = evaluatePrefix(191).prefixEvidence;

function createState() {
  return createCurrent180Current190PostgresqlRehearsalState({
    authorizationReceipt: AUTHORIZATION,
    names: NAMES,
  });
}

function advance(state, event, additions = {}) {
  const evidenceDigest =
    event === "SOURCE_PINNED"
      ? additions.sourcePin?.sourcePinDigest
      : ["PROVISIONAL_MARKER_RECONCILED", "WORKING_MARKED"].includes(event)
        ? additions.ownershipIdentity?.identityDigest
        : ["APPLY_RECONCILED", "ZERO_DIFF_VERIFIED"].includes(event)
          ? additions.prefixEvidence?.prefixEvidenceDigest
          : sha256(`test-evidence:${event}`);
  const evidence =
    buildCurrent180Current190PostgresqlRehearsalTransitionEvidence({
      authorizationReceiptDigest: state.authorizationReceiptDigest,
      event,
      evidenceDigest,
      runToken: state.names.runToken,
    });
  return advanceCurrent180Current190PostgresqlRehearsalState(state, {
    event,
    evidence,
    ...additions,
  });
}

test("exports an immutable no-effects planning contract", () => {
  assert.equal(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONTRACT,
    "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_CONTRACT_V1",
  );
  assert.ok(
    Object.isFrozen(CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_EFFECTS),
  );
  assert.ok(
    Object.values(CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_EFFECTS).every(
      (value) => value === false,
    ),
  );
  assert.deepEqual(CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_EFFECTS, {
    databaseConnectionOpened: false,
    databaseMutationAttempted: false,
    externalProviderCallAttempted: false,
    filesystemReadAttempted: false,
    filesystemWriteAttempted: false,
    networkCallAttempted: false,
    processSpawnAttempted: false,
    productionStateRead: false,
    roleOrGrantMutationAttempted: false,
  });
});

test("accepts exact local pinned URLs with or without a bounded encoded password", () => {
  const passwordless =
    inspectCurrent180Current190PostgresqlRehearsalEnvironment(environment());
  assert.equal(passwordless.source.passwordPresent, false);
  assert.equal(passwordless.source.databaseName, "leetplus_current180_ci");
  assert.equal(JSON.stringify(passwordless).includes("postgres@"), false);

  const withPassword =
    inspectCurrent180Current190PostgresqlRehearsalEnvironment(
      environment({
        [CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT]:
          PASSWORD_SOURCE_URL,
      }),
    );
  assert.equal(withPassword.source.passwordPresent, true);
  assert.equal(JSON.stringify(withPassword).includes("p%40ssword"), false);
  assert.notEqual(withPassword.source.urlSha256, passwordless.source.urlSha256);
});

test("rejects every non-exact source URL boundary", () => {
  const invalidUrls = [
    SOURCE_URL.replace("postgresql://", "postgres://"),
    SOURCE_URL.replace("postgres@", "other@"),
    SOURCE_URL.replace("postgres@", "postgres:@"),
    SOURCE_URL.replace("127.0.0.1", "localhost"),
    SOURCE_URL.replace("55432", "5432"),
    SOURCE_URL.replace("leetplus_current180_ci", "leetplus_current179_ci"),
    SOURCE_URL.replace("?schema=public", ""),
    `${SOURCE_URL}&sslmode=disable`,
    `${SOURCE_URL}#fragment`,
    PASSWORD_SOURCE_URL.replace("p%40ssword", "pa%73sword"),
    SOURCE_URL.replace("/leetplus", "/%6Ceetplus"),
  ];
  for (const sourceUrl of invalidUrls) {
    expectContractError(
      () =>
        inspectCurrent180Current190PostgresqlRehearsalEnvironment(
          environment({
            [CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT]:
              sourceUrl,
          }),
        ),
      "REHEARSAL_SOURCE_URL_INVALID",
    );
  }
});

test("denies production, ambient DB variables, secrets, aliases, and reserved extras", () => {
  const cases = [
    { NODE_ENV: "production" },
    { DATABASE_URL: "postgresql://production" },
    { PGOPTIONS: "-c search_path=evil" },
    { SMTP_PASSWORD: "secret" },
    { LANGAME_API_KEY: "secret" },
    { TELEGRAM_BOT_TOKEN: "secret" },
    { CURRENT180_CURRENT190_PG_REHEARSAL_EXTRA: "1" },
    { current180_current190_pg_rehearsal_extra: "1" },
    { Path: "C:\\attacker" },
  ];
  for (const overrides of cases) {
    expectContractError(
      () =>
        inspectCurrent180Current190PostgresqlRehearsalEnvironment(
          environment(overrides),
        ),
      "REHEARSAL_ENVIRONMENT_DENIED",
    );
  }
});

test("does not invoke environment, option, nested-row, or diagnostic Proxy traps", () => {
  let traps = 0;
  const proxy = new Proxy(
    {},
    {
      get() {
        traps += 1;
        throw new Error("trap");
      },
      getOwnPropertyDescriptor() {
        traps += 1;
        throw new Error("trap");
      },
      getPrototypeOf() {
        traps += 1;
        throw new Error("trap");
      },
      ownKeys() {
        traps += 1;
        throw new Error("trap");
      },
    },
  );
  expectContractError(
    () => inspectCurrent180Current190PostgresqlRehearsalEnvironment(proxy),
    "REHEARSAL_ENVIRONMENT_INVALID",
  );
  expectContractError(
    () => authorizeCurrent180Current190DisposablePostgresqlRehearsal(proxy),
    "DISPOSABLE_POSTGRESQL_REHEARSAL_AUTHORIZATION_DENIED",
  );
  expectContractError(
    () => buildCurrent180Current190PostgresqlRehearsalChildEnvironment(proxy),
    "REHEARSAL_CHILD_ENVIRONMENT_INVALID",
  );
  expectContractError(
    () => reconcileCurrent180Current190PostgresqlRehearsalDrop(proxy),
    "REHEARSAL_DROP_RECONCILIATION_INVALID",
  );
  assert.equal(
    sanitizeCurrent180Current190PostgresqlRehearsalDiagnostic(proxy),
    "<redacted-unsafe-diagnostic>",
  );
  const rowsProxy = new Proxy([], {
    get() {
      traps += 1;
      throw new Error("trap");
    },
    ownKeys() {
      traps += 1;
      throw new Error("trap");
    },
  });
  expectContractError(
    () =>
      reconcileCurrent180Current190PostgresqlRehearsalDrop({
        catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
        expectedIdentity: OWNERSHIP_IDENTITY,
        finalDatabaseName: NAMES.finalDatabaseName,
        rows: rowsProxy,
        workingDatabaseName: NAMES.workingDatabaseName,
      }),
    "REHEARSAL_CATALOG_SNAPSHOT_INVALID",
  );
  assert.equal(traps, 0);
});

test("rejects own accessors, symbols, extra option keys, and revoked Proxies", () => {
  let getterReads = 0;
  const unsafeEnvironment = environment();
  Object.defineProperty(unsafeEnvironment, "DANGEROUS", {
    enumerable: true,
    get() {
      getterReads += 1;
      return "secret";
    },
  });
  expectContractError(
    () =>
      inspectCurrent180Current190PostgresqlRehearsalEnvironment(
        unsafeEnvironment,
      ),
    "REHEARSAL_ENVIRONMENT_INVALID",
  );
  assert.equal(getterReads, 0);

  const namesWithSymbol = { ...NAMES, [Symbol("extra")]: true };
  expectContractError(
    () =>
      validateCurrent180Current190PostgresqlRehearsalDatabaseNames(
        namesWithSymbol,
      ),
    "REHEARSAL_DATABASE_NAMES_INVALID",
  );
  expectContractError(
    () =>
      buildCurrent180Current190PostgresqlRehearsalOwnershipMarker({
        ...ownershipContext(),
        extra: true,
      }),
    "REHEARSAL_OWNERSHIP_MARKER_INPUT_INVALID",
  );
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  expectContractError(
    () => createCurrent180Current190PostgresqlRehearsalState(proxy),
    "REHEARSAL_STATE_INVALID",
  );
});

test("derives only same-token working and final database names", () => {
  assert.deepEqual(NAMES, {
    finalDatabaseName: `lp_c180190_${RUN_TOKEN}_ci`,
    runToken: RUN_TOKEN,
    workingDatabaseName: `lp_imtec_${RUN_TOKEN}_ci`,
  });
  assert.match(
    NAMES.workingDatabaseName,
    new RegExp(
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_DATABASE_PATTERNS.working,
      "u",
    ),
  );
  assert.match(
    NAMES.finalDatabaseName,
    new RegExp(
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_DATABASE_PATTERNS.final,
      "u",
    ),
  );
  for (const token of [
    RUN_TOKEN.slice(1),
    `${RUN_TOKEN}0`,
    RUN_TOKEN.toUpperCase(),
    "../../production",
  ]) {
    expectContractError(
      () => deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(token),
      "REHEARSAL_RUN_TOKEN_INVALID",
    );
  }
  expectContractError(
    () =>
      validateCurrent180Current190PostgresqlRehearsalDatabaseNames({
        ...NAMES,
        extra: true,
      }),
    "REHEARSAL_DATABASE_NAMES_INVALID",
  );
});

test("pins immutable CURRENT180-CURRENT186 GUCs and all source-CURRENT190 prefixes", () => {
  assert.deepEqual(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP.map(
      ({ ordinal }) => ordinal,
    ),
    [180, 181, 182, 183, 184, 185, 186],
  );
  const options = buildCurrent180Current190PostgresqlRehearsalSessionOptions();
  assert.equal(options.length, 17);
  assert.deepEqual(options.slice(0, 3), [
    "-c lock_timeout=5000",
    "-c statement_timeout=300000",
    "-c idle_in_transaction_session_timeout=300000",
  ]);
  for (const guc of CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP) {
    assert.ok(
      options.includes(`-c ${guc.confirmationGuc}=${guc.confirmation}`),
    );
    assert.ok(options.includes(`-c ${guc.sha256Guc}=${guc.sha256}`));
  }
  assert.deepEqual(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PREFIXES.map(
      ({ count }) => count,
    ),
    [180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191],
  );
  assert.equal(
    FINAL_PREFIX.digest,
    "a386282c2f2b04fa96892d3642b13f5d16efab637a9a6e77a659d1404b1fba5d",
  );
  assert.ok(Object.isFrozen(options));
  assert.ok(
    Object.isFrozen(CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP),
  );
  assert.ok(
    Object.isFrozen(CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PREFIXES),
  );
});

test("builds a credential-bearing but fully isolated planning child environment", () => {
  const child = buildCurrent180Current190PostgresqlRehearsalChildEnvironment({
    authorizationReceiptDigest: AUTHORIZATION.authorizationReceiptDigest,
    environment: environment({
      COMSPEC: "C:\\attacker.exe",
      PATHEXT: ".EVIL",
      PROVIDER_CONFIG: "must-not-pass",
    }),
    names: NAMES,
    target: "working",
  });
  assert.deepEqual(Object.keys(child).sort(), [
    "CURRENT180_CURRENT190_REHEARSAL_AUTHORIZATION_RECEIPT_SHA256",
    "CURRENT180_CURRENT190_REHEARSAL_DATABASE_URL_SHA256",
    "DATABASE_URL",
    "NODE_ENV",
    "NO_COLOR",
    "PGOPTIONS",
    "PRISMA_HIDE_UPDATE_MESSAGE",
  ]);
  for (const denied of [
    "COMSPEC",
    "PATH",
    "PATHEXT",
    "PROVIDER_CONFIG",
    "TEMP",
  ]) {
    assert.equal(child[denied], undefined);
  }
  const targetUrl = new URL(child.DATABASE_URL);
  assert.equal(targetUrl.pathname, `/${NAMES.workingDatabaseName}`);
  assert.equal(targetUrl.searchParams.get("options"), child.PGOPTIONS);
  assert.equal(
    child.CURRENT180_CURRENT190_REHEARSAL_DATABASE_URL_SHA256,
    sha256(Buffer.from(child.DATABASE_URL, "utf8")),
  );
  assert.equal(
    child.CURRENT180_CURRENT190_REHEARSAL_AUTHORIZATION_RECEIPT_SHA256,
    AUTHORIZATION.authorizationReceiptDigest,
  );
});

test("sanitizes URLs, assignments, long secrets, unsafe objects, and getters", () => {
  const diagnostic = sanitizeCurrent180Current190PostgresqlRehearsalDiagnostic(
    `failed ${PASSWORD_SOURCE_URL} PGPASSWORD=short ${"x".repeat(100)}`,
  );
  assert.equal(diagnostic.includes("p%40ssword"), false);
  assert.equal(diagnostic.includes("short"), false);
  assert.equal(diagnostic.includes("x".repeat(100)), false);
  let reads = 0;
  const unsafe = {};
  Object.defineProperty(unsafe, "message", {
    get() {
      reads += 1;
      return PASSWORD_SOURCE_URL;
    },
  });
  assert.equal(
    sanitizeCurrent180Current190PostgresqlRehearsalDiagnostic(unsafe),
    "<redacted-unsafe-diagnostic>",
  );
  assert.equal(reads, 0);
});

test("verifies the exact current assembler artifact but grants planning authority only", () => {
  assert.equal(
    AUTHORIZATION.contract,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT,
  );
  assert.equal(
    AUTHORIZATION.status,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_STATUS,
  );
  assert.equal(AUTHORIZATION.executionStatus, "PLANNING_ONLY_NOT_EXECUTABLE");
  assert.equal(AUTHORIZATION.authorization.planningOnly, true);
  assert.equal(AUTHORIZATION.authorization.canExecuteRehearsal, false);
  assert.equal(
    AUTHORIZATION.authorization.canApplyExactAssemblyToOwnedWorkingDatabase,
    false,
  );
  assert.equal(
    AUTHORIZATION.authorization.canCreateOwnedDisposableDatabase,
    false,
  );
  assert.equal(
    AUTHORIZATION.authorization.canDropOwnedDisposableDatabase,
    false,
  );
  assert.equal(AUTHORIZATION.authorization.canMutateProduction, false);
  assert.equal(AUTHORIZATION.authorization.productionApplyAuthorized, false);
  assert.deepEqual(AUTHORIZATION.executionBlockers, [
    "AUTHENTICATED_DURABLE_JOURNAL_VERIFIER_REQUIRED",
    "EFFECTFUL_POSTGRESQL_RUNNER_NOT_IMPLEMENTED",
    "MODULE_RECEIPTS_NOT_EXECUTION_AUTHORITY",
  ]);
  assert.match(AUTHORIZATION.authorizationReceiptDigest, /^[0-9a-f]{64}$/u);
  assert.ok(Object.isFrozen(AUTHORIZATION));
});

test("state rejects every over-authorized planning receipt even with a recomputed digest", () => {
  const falseOnlyFlags = [
    "canApplyExactAssemblyToOwnedWorkingDatabase",
    "canCallExternalProviders",
    "canConnectPinnedSourceReadOnly",
    "canCreateOwnedDisposableDatabase",
    "canDeploy",
    "canDropOwnedDisposableDatabase",
    "canExecuteRehearsal",
    "canMutateCanonicalMigrations",
    "canMutateProduction",
    "canMutateRolesOrGrants",
    "canRenameOwnedDisposableDatabase",
    "canResolveMigration",
    "canSpawnProcess",
    "productionApplyAuthorized",
  ];
  const rejectReceipt = (authorizationReceipt) =>
    expectContractError(
      () =>
        createCurrent180Current190PostgresqlRehearsalState({
          authorizationReceipt,
          names: NAMES,
        }),
      "REHEARSAL_STATE_INVALID",
      ["VALID_AUTHORIZATION_RECEIPT_REQUIRED"],
    );
  for (const flag of falseOnlyFlags) {
    rejectReceipt(
      recomputeAuthorizationReceipt({
        ...AUTHORIZATION,
        authorization: { ...AUTHORIZATION.authorization, [flag]: true },
      }),
    );
  }
  rejectReceipt(
    recomputeAuthorizationReceipt({
      ...AUTHORIZATION,
      authorization: { ...AUTHORIZATION.authorization, planningOnly: false },
    }),
  );
});

test("state requires exact nested planning receipt shapes after digest recomputation", () => {
  const rejectReceipt = (authorizationReceipt) =>
    expectContractError(
      () =>
        createCurrent180Current190PostgresqlRehearsalState({
          authorizationReceipt,
          names: NAMES,
        }),
      "REHEARSAL_STATE_INVALID",
      ["VALID_AUTHORIZATION_RECEIPT_REQUIRED"],
    );
  const missingAuthorization = { ...AUTHORIZATION.authorization };
  delete missingAuthorization.canSpawnProcess;
  const missingAssembly = { ...AUTHORIZATION.assembly };
  delete missingAssembly.assemblyPlanDigest;
  const missingEnvironment = { ...AUTHORIZATION.environment };
  delete missingEnvironment.usernameSha256;
  const missingExecutionBoundary = { ...AUTHORIZATION.executionBoundary };
  delete missingExecutionBoundary.shell;
  const nestedMutations = [
    {
      authorization: {
        ...AUTHORIZATION.authorization,
        unexpectedAuthority: false,
      },
    },
    { authorization: missingAuthorization },
    { assembly: { ...AUTHORIZATION.assembly, unexpectedPin: "0" } },
    { assembly: missingAssembly },
    { environment: { ...AUTHORIZATION.environment, unexpectedSource: false } },
    { environment: missingEnvironment },
    {
      executionBoundary: {
        ...AUTHORIZATION.executionBoundary,
        unexpectedProcessOption: false,
      },
    },
    { executionBoundary: missingExecutionBoundary },
    {
      executionBlockers: [
        ...AUTHORIZATION.executionBlockers,
        "UNVERIFIED_EXTRA_BLOCKER",
      ],
    },
  ];
  for (const mutation of nestedMutations) {
    rejectReceipt(
      recomputeAuthorizationReceipt({ ...AUTHORIZATION, ...mutation }),
    );
  }
});

test("state pins every assembler provenance field in a recomputed receipt", () => {
  const pinMutations = {
    assemblerReceiptCanApplyDatabase: true,
    assemblerReceiptIsAuthority: true,
    assemblyPlanDigest: "0".repeat(64),
    entryManifestDigest: "0".repeat(64),
    inMemoryArtifactDigest: "0".repeat(64),
    migrationCount: 189,
    migrationHead:
      "20260805030000_identity_employee_invite_mail_boundary_current189",
    migrationHeadChecksum: "0".repeat(64),
    migrationManifestDigest: "0".repeat(64),
  };
  for (const [field, value] of Object.entries(pinMutations)) {
    const forged = recomputeAuthorizationReceipt({
      ...AUTHORIZATION,
      assembly: { ...AUTHORIZATION.assembly, [field]: value },
    });
    expectContractError(
      () =>
        createCurrent180Current190PostgresqlRehearsalState({
          authorizationReceipt: forged,
          names: NAMES,
        }),
      "REHEARSAL_STATE_INVALID",
      ["VALID_AUTHORIZATION_RECEIPT_REQUIRED"],
    );
  }
});

test("rejects stale, drifted, over-authorized, or content-tampered assembler artifacts", () => {
  const cases = [
    { ...ASSEMBLY_ARTIFACT, assemblyPlanDigest: "0".repeat(64) },
    { ...ASSEMBLY_ARTIFACT, entryManifestDigest: "0".repeat(64) },
    { ...ASSEMBLY_ARTIFACT, inMemoryArtifactDigest: "0".repeat(64) },
    { ...ASSEMBLY_ARTIFACT, current187EAuxiliaryExcluded: false },
    {
      ...ASSEMBLY_ARTIFACT,
      authorization: {
        ...ASSEMBLY_ARTIFACT.authorization,
        canApplyDatabase: true,
      },
    },
    {
      ...ASSEMBLY_ARTIFACT,
      entries: ASSEMBLY_ARTIFACT.entries.map((entry, index) =>
        index === 100
          ? { ...entry, content: `${entry.content}\n-- tampered` }
          : entry,
      ),
    },
  ];
  for (const artifact of cases) {
    expectContractError(
      () => authorize(environment(), artifact),
      "DISPOSABLE_POSTGRESQL_REHEARSAL_AUTHORIZATION_DENIED",
    );
  }
});

test("authorization validates raw environment and rejects fake report-shaped input", () => {
  expectContractError(
    () =>
      authorizeCurrent180Current190DisposablePostgresqlRehearsal({
        allowContract:
          CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT,
        assemblyReceipt: ASSEMBLY_ARTIFACT,
        environmentReport:
          inspectCurrent180Current190PostgresqlRehearsalEnvironment(
            environment(),
          ),
      }),
    "DISPOSABLE_POSTGRESQL_REHEARSAL_AUTHORIZATION_DENIED",
    ["EXACT_AUTHORIZATION_INPUT_REQUIRED"],
  );
  expectContractError(
    () =>
      authorizeCurrent180Current190DisposablePostgresqlRehearsal({
        allowContract: "yes",
        assemblyReceipt: ASSEMBLY_ARTIFACT,
        environment: environment(),
      }),
    "DISPOSABLE_POSTGRESQL_REHEARSAL_AUTHORIZATION_DENIED",
    ["EXACT_DISPOSABLE_REHEARSAL_ALLOW_CONTRACT_REQUIRED"],
  );
});

test("binds marker and ownership identity to attempt, authorization, owner, and run", () => {
  const first =
    buildCurrent180Current190PostgresqlRehearsalOwnershipMarker(markerInput());
  const repeated =
    buildCurrent180Current190PostgresqlRehearsalOwnershipMarker(markerInput());
  const second = buildCurrent180Current190PostgresqlRehearsalOwnershipMarker(
    markerInput({ attempt: 2 }),
  );
  assert.equal(first, repeated);
  assert.notEqual(first, second);
  assert.equal(OWNERSHIP_IDENTITY.marker, first);
  assert.equal(OWNERSHIP_IDENTITY.ownerName, "postgres");
  assert.equal(OWNERSHIP_IDENTITY.runToken, RUN_TOKEN);
  assert.match(OWNERSHIP_IDENTITY.identityDigest, /^[0-9a-f]{64}$/u);
  expectContractError(
    () => ownershipIdentity({ ownerName: "foreign" }),
    "REHEARSAL_OWNERSHIP_IDENTITY_INPUT_INVALID",
  );
});

test("create reconciliation blocks unmarked ambiguity and only accepts exact marked ownership", () => {
  const marker = OWNERSHIP_IDENTITY.marker;
  const reconcile = (rows) =>
    reconcileCurrent180Current190PostgresqlRehearsalCreate({
      absencePreflightPassed: true,
      catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
      commandAttempted: true,
      finalDatabaseName: NAMES.finalDatabaseName,
      ownershipContext: ownershipContext(),
      rows,
      workingDatabaseName: NAMES.workingDatabaseName,
    });
  assert.equal(reconcile([]).decision, "CREATE_NOT_COMMITTED_RETRY_SAFE");
  const ambiguous = reconcile([catalogRow(NAMES.workingDatabaseName)]);
  assert.equal(ambiguous.decision, "CREATE_UNMARKED_AMBIGUOUS_BLOCKED");
  assert.equal(ambiguous.safeToMark, false);
  assert.equal(ambiguous.manualCleanupRequired, true);
  const committed = reconcile([
    catalogRow(NAMES.workingDatabaseName, { marker }),
  ]);
  assert.equal(committed.decision, "CREATE_COMMITTED_RECONCILED");
  assert.equal(
    committed.ownershipIdentity.identityDigest,
    OWNERSHIP_IDENTITY.identityDigest,
  );
  assert.match(committed.reconciliationReceiptDigest, /^[0-9a-f]{64}$/u);
  for (const rows of [
    [catalogRow(NAMES.workingDatabaseName, { allowConnections: true, marker })],
    [catalogRow(NAMES.workingDatabaseName, { marker, ownerOid: 12 })],
    [catalogRow(NAMES.finalDatabaseName, { marker })],
    [catalogRow("renamed_elsewhere", { marker })],
  ]) {
    assert.equal(reconcile(rows).decision, "CREATE_RECONCILIATION_BLOCKED");
  }
});

test("requires explicit exhaustive catalog scope for every reconciliation", () => {
  expectContractError(
    () =>
      reconcileCurrent180Current190PostgresqlRehearsalDrop({
        catalogScope: "TARGET_NAMES_ONLY",
        expectedIdentity: OWNERSHIP_IDENTITY,
        finalDatabaseName: NAMES.finalDatabaseName,
        rows: [],
        workingDatabaseName: NAMES.workingDatabaseName,
      }),
    "REHEARSAL_DROP_RECONCILIATION_INVALID",
  );
});

test("rename reconciliation requires same run, sealed state, OID, owner, and marker", () => {
  const reconcile = (fromDatabaseName, toDatabaseName, rows) =>
    reconcileCurrent180Current190PostgresqlRehearsalRename({
      catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
      expectedIdentity: OWNERSHIP_IDENTITY,
      fromDatabaseName,
      rows,
      toDatabaseName,
    });
  for (const [fromDatabaseName, toDatabaseName] of [
    [NAMES.workingDatabaseName, NAMES.finalDatabaseName],
    [NAMES.finalDatabaseName, NAMES.workingDatabaseName],
  ]) {
    assert.equal(
      reconcile(fromDatabaseName, toDatabaseName, [
        catalogRow(fromDatabaseName, { marker: OWNERSHIP_IDENTITY.marker }),
      ]).decision,
      "RENAME_NOT_COMMITTED_RETRY_SAFE",
    );
    assert.equal(
      reconcile(fromDatabaseName, toDatabaseName, [
        catalogRow(toDatabaseName, { marker: OWNERSHIP_IDENTITY.marker }),
      ]).decision,
      "RENAME_COMMITTED_RECONCILED",
    );
    assert.equal(
      reconcile(fromDatabaseName, toDatabaseName, [
        catalogRow(toDatabaseName, {
          allowConnections: true,
          marker: OWNERSHIP_IDENTITY.marker,
        }),
      ]).decision,
      "RENAME_RECONCILIATION_BLOCKED",
    );
    assert.equal(
      reconcile(fromDatabaseName, toDatabaseName, [
        catalogRow(fromDatabaseName, { marker: OWNERSHIP_IDENTITY.marker }),
        catalogRow("copied_marker", {
          marker: OWNERSHIP_IDENTITY.marker,
          oid: 202,
        }),
      ]).decision,
      "RENAME_RECONCILIATION_BLOCKED",
    );
  }
  const otherNames =
    deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(OTHER_RUN_TOKEN);
  expectContractError(
    () =>
      reconcile(NAMES.workingDatabaseName, otherNames.finalDatabaseName, [
        catalogRow(otherNames.finalDatabaseName, {
          marker: OWNERSHIP_IDENTITY.marker,
        }),
      ]),
    "REHEARSAL_RENAME_RECONCILIATION_INVALID",
  );
});

test("allow-connections and drop only reconcile the exact bound identity", () => {
  const allow = (expectedAllowConnections, rows) =>
    reconcileCurrent180Current190PostgresqlRehearsalAllowConnections({
      catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
      databaseName: NAMES.workingDatabaseName,
      expectedAllowConnections,
      expectedIdentity: OWNERSHIP_IDENTITY,
      rows,
    });
  assert.equal(
    allow(false, [
      catalogRow(NAMES.workingDatabaseName, {
        marker: OWNERSHIP_IDENTITY.marker,
      }),
    ]).decision,
    "ALLOW_SETTING_COMMITTED_RECONCILED",
  );
  assert.equal(
    allow(true, [
      catalogRow(NAMES.workingDatabaseName, {
        marker: OWNERSHIP_IDENTITY.marker,
      }),
    ]).decision,
    "ALLOW_SETTING_NOT_COMMITTED_RETRY_SAFE",
  );
  assert.equal(
    allow(false, [
      catalogRow(NAMES.workingDatabaseName, {
        marker: OWNERSHIP_IDENTITY.marker,
      }),
      catalogRow("copied_marker", {
        marker: OWNERSHIP_IDENTITY.marker,
        oid: 202,
      }),
    ]).decision,
    "ALLOW_RECONCILIATION_BLOCKED",
  );

  const drop = (rows) =>
    reconcileCurrent180Current190PostgresqlRehearsalDrop({
      catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
      expectedIdentity: OWNERSHIP_IDENTITY,
      finalDatabaseName: NAMES.finalDatabaseName,
      rows,
      workingDatabaseName: NAMES.workingDatabaseName,
    });
  assert.equal(drop([]).decision, "DROP_COMMITTED_RECONCILED");
  assert.equal(
    drop([
      catalogRow(NAMES.workingDatabaseName, {
        marker: OWNERSHIP_IDENTITY.marker,
      }),
    ]).decision,
    "DROP_NOT_COMMITTED_RETRY_SAFE",
  );
  for (const rows of [
    [
      catalogRow(NAMES.workingDatabaseName, {
        allowConnections: true,
        marker: OWNERSHIP_IDENTITY.marker,
      }),
    ],
    [
      catalogRow("renamed_elsewhere", {
        marker: OWNERSHIP_IDENTITY.marker,
      }),
    ],
    [
      catalogRow("copied_marker", {
        marker: OWNERSHIP_IDENTITY.marker,
        oid: 202,
      }),
    ],
    [catalogRow(NAMES.finalDatabaseName, { marker: null })],
  ]) {
    assert.equal(drop(rows).decision, "DROP_RECONCILIATION_BLOCKED");
    assert.equal(drop(rows).authorization.canDeleteForeignDatabase, false);
  }
});

test("source preflight returns an exact named owner/source pin", () => {
  const result =
    evaluateCurrent180Current190PostgresqlSourcePreflight(sourcePreflight());
  assert.equal(result.status, "SOURCE_PREFLIGHT_ACCEPTED");
  assert.equal(result.verified, true);
  assert.deepEqual(
    result.sourcePin.requiredRelationOwners.map(
      ({ relationName }) => relationName,
    ),
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS,
  );
  assert.equal(result.sourcePin.databaseOwnerName, "postgres");
  assert.equal(result.sourcePin.databaseOwnerOid, 11);
  assert.equal(result.sourcePin.sourceFingerprint, "f".repeat(64));
  assert.equal(
    result.sourcePin.sourceUrlSha256,
    inspectCurrent180Current190PostgresqlRehearsalEnvironment(environment())
      .source.urlSha256,
  );
  assert.match(result.sourcePin.sourcePinDigest, /^[0-9a-f]{64}$/u);
});

test("source preflight blocks wrong owners, projections, source pins, counts, and sessions", () => {
  const cases = [
    [{ host: "localhost" }, "SOURCE_DATABASE_IDENTITY_MISMATCH"],
    [{ serverVersionNumber: 150_010 }, "POSTGRESQL_16_REQUIRED"],
    [{ currentUserName: "other" }, "SOURCE_OWNER_AUTHORITY_MISMATCH"],
    [{ databaseOwnerName: "other" }, "SOURCE_OWNER_AUTHORITY_MISMATCH"],
    [{ currentUserOid: 12 }, "SOURCE_OWNER_AUTHORITY_MISMATCH"],
    [
      {
        requiredRelationOwners:
          CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS.map(
            (relationName) => ({ ownerOid: 11, relationName }),
          ).reverse(),
      },
      "SOURCE_OBJECT_OWNER_PARITY_MISMATCH",
    ],
    [
      {
        requiredRelationOwners: [
          ...sourcePreflight().requiredRelationOwners,
          { ownerOid: 11, relationName: "Tenant" },
        ],
      },
      "SOURCE_OBJECT_OWNER_PARITY_MISMATCH",
    ],
    [{ migrationCount: 179 }, "SOURCE_MIGRATION_HISTORY_MISMATCH"],
    [{ enrollmentCount: 1 }, "SOURCE_CANDIDATE_PRECONDITION_NOT_EMPTY"],
    [{ otherSessionCount: 1 }, "SOURCE_HAS_OTHER_SESSIONS"],
    [
      { otherSessionCount: Number.MAX_SAFE_INTEGER + 1 },
      "SOURCE_NUMERIC_EVIDENCE_INVALID",
    ],
    [{ sourceFingerprint: "invalid" }, "SOURCE_FINGERPRINT_INVALID"],
    [{ sourceUrlSha256: "invalid" }, "SOURCE_URL_PIN_INVALID"],
  ];
  for (const [overrides, finding] of cases) {
    const result = evaluateCurrent180Current190PostgresqlSourcePreflight(
      sourcePreflight(environment(), overrides),
    );
    assert.equal(result.status, "SOURCE_PREFLIGHT_BLOCKED");
    assert.ok(result.findings.includes(finding));
    assert.equal(result.sourcePin, undefined);
  }
});

test("Prisma reconciliation validates every exact row through CURRENT190", () => {
  for (const prefix of CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PREFIXES) {
    const result = evaluatePrefix(prefix.count);
    assert.equal(result.completedMigrationCount, prefix.count);
    assert.equal(
      result.decision,
      prefix.count === 191
        ? "PRISMA_EXACT_CURRENT190_COMMITTED"
        : "PRISMA_EXACT_PREFIX_RETRY_SAFE",
    );
    assert.equal(result.safeToRetryDeploy, prefix.count !== 191);
    assert.equal(result.safeToResolveMigration, false);
    assert.match(result.prefixEvidence.rowsDigest, /^[0-9a-f]{64}$/u);
  }
});

test("CURRENT187 is complete only with finished_at and applied_steps_count=1", () => {
  assert.equal(evaluatePrefix(188).decision, "PRISMA_EXACT_PREFIX_RETRY_SAFE");
  assert.equal(
    evaluatePrefix(188, (row, index) =>
      index === 187 ? { ...row, finishedAt: null } : row,
    ).decision,
    "PRISMA_FAILED_OR_UNFINISHED_DISCARD_DATABASE",
  );
  assert.equal(
    evaluatePrefix(188, (row, index) =>
      index === 187
        ? { ...row, rolledBackAt: "2026-08-05T12:01:00.000Z" }
        : row,
    ).decision,
    "PRISMA_FAILED_OR_UNFINISHED_DISCARD_DATABASE",
  );
  assert.equal(
    evaluatePrefix(188, (row, index) =>
      index === 187 ? { ...row, appliedStepsCount: 0 } : row,
    ).decision,
    "PRISMA_PREFIX_DRIFT_BLOCKED",
  );
});

test("Prisma reconciliation blocks checksum, order, duplicate, row-shape, and artifact drift", () => {
  assert.equal(
    evaluatePrefix(186, (row, index) =>
      index === 185 ? { ...row, checksum: "0".repeat(64) } : row,
    ).decision,
    "PRISMA_PREFIX_DRIFT_BLOCKED",
  );
  const duplicatedRows = prismaRows(186);
  duplicatedRows[185] = { ...duplicatedRows[0] };
  assert.equal(
    evaluateCurrent180Current190PostgresqlPrismaPrefix({
      assemblyReceipt: ASSEMBLY_ARTIFACT,
      rows: duplicatedRows,
    }).decision,
    "PRISMA_PREFIX_DRIFT_BLOCKED",
  );
  expectContractError(
    () =>
      evaluateCurrent180Current190PostgresqlPrismaPrefix({
        assemblyReceipt: ASSEMBLY_ARTIFACT,
        rows: prismaRows(186, (row, index) =>
          index === 185 ? { ...row, unexpected: true } : row,
        ),
      }),
    "REHEARSAL_PRISMA_PREFIX_INVALID",
    ["EXACT_PRISMA_ROWS_REQUIRED"],
  );
  expectContractError(
    () =>
      evaluateCurrent180Current190PostgresqlPrismaPrefix({
        assemblyReceipt: {
          ...ASSEMBLY_ARTIFACT,
          inMemoryArtifactDigest: "0".repeat(64),
        },
        rows: prismaRows(186),
      }),
    "REHEARSAL_PRISMA_PREFIX_INVALID",
    ["EXACT_ASSEMBLY_RECEIPT_REQUIRED"],
  );
});

test("state requires structured transition evidence and carries source, ownership, and Prisma pins", () => {
  let state = createState();
  state = advance(state, "PREFLIGHT_ACCEPTED");
  state = advance(state, "CLUSTER_LOCK_ACQUIRED");
  state = advance(state, "SOURCE_PINNED", { sourcePin: SOURCE_PIN });
  state = advance(state, "CREATE_ISSUED");
  state = advance(state, "CREATE_RECONCILED");
  state = advance(state, "WORKING_MARKED", {
    ownershipIdentity: OWNERSHIP_IDENTITY,
  });
  state = advance(state, "WORKING_OPENED");
  state = advance(state, "PRISMA_DEPLOY_ISSUED");
  state = advance(state, "APPLY_RECONCILED", {
    prefixEvidence: FINAL_PREFIX_EVIDENCE,
  });
  assert.equal(state.sourcePin.sourcePinDigest, SOURCE_PIN.sourcePinDigest);
  assert.equal(
    state.ownershipIdentity.identityDigest,
    OWNERSHIP_IDENTITY.identityDigest,
  );
  assert.equal(
    state.prismaPrefixEvidence.prefixEvidenceDigest,
    FINAL_PREFIX_EVIDENCE.prefixEvidenceDigest,
  );
  assert.equal(state.outcome, "ACTIVE");
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.sourcePin));
  assert.match(state.evidenceChainDigest, /^[0-9a-f]{64}$/u);
});

test("happy path reaches COMPLETED only through rollback, absence, and source zero-diff", () => {
  let state = createState();
  const path = [
    ["PREFLIGHT_ACCEPTED"],
    ["CLUSTER_LOCK_ACQUIRED"],
    ["SOURCE_PINNED", { sourcePin: SOURCE_PIN }],
    ["CREATE_ISSUED"],
    ["CREATE_RECONCILED"],
    ["WORKING_MARKED", { ownershipIdentity: OWNERSHIP_IDENTITY }],
    ["WORKING_OPENED"],
    ["PRISMA_DEPLOY_ISSUED"],
    ["APPLY_RECONCILED", { prefixEvidence: FINAL_PREFIX_EVIDENCE }],
    ["WORKING_SEALED"],
    ["RENAME_ISSUED"],
    ["RENAME_RECONCILED"],
    ["FINAL_OPENED"],
    ["FINAL_FINGERPRINT_VERIFIED"],
    ["ZERO_DIFF_DEPLOY_ISSUED"],
    ["ZERO_DIFF_VERIFIED", { prefixEvidence: FINAL_PREFIX_EVIDENCE }],
    ["ROLLBACK_SEALED"],
    ["ROLLBACK_RENAME_ISSUED"],
    ["ROLLBACK_RENAME_RECONCILED"],
    ["DROP_ISSUED"],
    ["ABSENCE_VERIFIED"],
    ["SOURCE_ZERO_DIFF_VERIFIED"],
    ["COMPLETED"],
  ];
  for (const [event, additions] of path) {
    state = advance(state, event, additions);
  }
  assert.equal(state.phase, "COMPLETED");
  assert.equal(state.outcome, "ACTIVE");
  assert.equal(state.eventCount, path.length);
});

test("cleanup failure is sticky and can never branch back to COMPLETED", () => {
  let state = createState();
  for (const [event, additions] of [
    ["PREFLIGHT_ACCEPTED"],
    ["CLUSTER_LOCK_ACQUIRED"],
    ["SOURCE_PINNED", { sourcePin: SOURCE_PIN }],
    ["CREATE_ISSUED"],
    ["CREATE_RECONCILED"],
    ["WORKING_MARKED", { ownershipIdentity: OWNERSHIP_IDENTITY }],
  ]) {
    state = advance(state, event, additions);
  }
  state = advance(state, "FAIL_WITH_OWNERSHIP");
  assert.equal(state.outcome, "FAILED");
  expectContractError(
    () => advance(state, "DROP_ISSUED"),
    "REHEARSAL_TRANSITION_DENIED",
  );
  state = advance(state, "CLEANUP_DROP_ISSUED");
  state = advance(state, "CLEANUP_ABSENCE_VERIFIED");
  expectContractError(
    () => advance(state, "SOURCE_ZERO_DIFF_VERIFIED"),
    "REHEARSAL_TRANSITION_DENIED",
  );
  state = advance(state, "FAILED_CLEAN");
  assert.equal(state.phase, "FAILED_CLEAN");
  assert.equal(state.outcome, "FAILED");
  expectContractError(
    () => advance(state, "COMPLETED"),
    "REHEARSAL_TRANSITION_DENIED",
  );
});

test("pre-marker failure enters durable recovery and cannot claim cleanup ownership", () => {
  let state = createState();
  for (const [event, additions] of [
    ["PREFLIGHT_ACCEPTED"],
    ["CLUSTER_LOCK_ACQUIRED"],
    ["SOURCE_PINNED", { sourcePin: SOURCE_PIN }],
    ["CREATE_ISSUED"],
    ["CREATE_RECONCILED"],
  ]) {
    state = advance(state, event, additions);
  }
  state = advance(state, "PROVISIONAL_FAILURE_JOURNALED");
  assert.equal(state.phase, "PROVISIONAL_DURABLE_RECOVERY_REQUIRED");
  assert.equal(state.outcome, "RECOVERY");
  expectContractError(
    () => advance(state, "FAIL_WITH_OWNERSHIP"),
    "REHEARSAL_TRANSITION_DENIED",
  );
  state = advance(state, "PROVISIONAL_MARKER_RECONCILED", {
    ownershipIdentity: OWNERSHIP_IDENTITY,
  });
  assert.equal(state.phase, "WORKING_MARKED");
  assert.equal(state.outcome, "ACTIVE");
});

test("state rejects bare events, wrong source URL, wrong identity, missing prefix, and tampering", () => {
  const initial = createState();
  expectContractError(
    () =>
      advanceCurrent180Current190PostgresqlRehearsalState(
        initial,
        "PREFLIGHT_ACCEPTED",
      ),
    "REHEARSAL_TRANSITION_DENIED",
    ["STRUCTURED_TRANSITION_INPUT_REQUIRED"],
  );
  expectContractError(
    () =>
      advanceCurrent180Current190PostgresqlRehearsalState(
        { ...initial, phase: "COMPLETED" },
        {},
      ),
    "REHEARSAL_STATE_INVALID",
    ["STATE_INTEGRITY_MISMATCH"],
  );

  let sourceState = advance(initial, "PREFLIGHT_ACCEPTED");
  sourceState = advance(sourceState, "CLUSTER_LOCK_ACQUIRED");
  const passwordSourcePin =
    evaluateCurrent180Current190PostgresqlSourcePreflight(
      sourcePreflight(
        environment({
          [CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT]:
            PASSWORD_SOURCE_URL,
        }),
      ),
    ).sourcePin;
  expectContractError(
    () =>
      advance(sourceState, "SOURCE_PINNED", {
        sourcePin: passwordSourcePin,
      }),
    "REHEARSAL_TRANSITION_DENIED",
    ["BOUND_SOURCE_PIN_REQUIRED"],
  );

  let ownedState = advance(sourceState, "SOURCE_PINNED", {
    sourcePin: SOURCE_PIN,
  });
  ownedState = advance(ownedState, "CREATE_ISSUED");
  ownedState = advance(ownedState, "CREATE_RECONCILED");
  const foreignIdentity = ownershipIdentity({ runToken: OTHER_RUN_TOKEN });
  expectContractError(
    () =>
      advance(ownedState, "WORKING_MARKED", {
        ownershipIdentity: foreignIdentity,
      }),
    "REHEARSAL_TRANSITION_DENIED",
    ["BOUND_OWNERSHIP_IDENTITY_REQUIRED"],
  );
});

test("recomputed state digests cannot forge phase/outcome combinations", () => {
  const initial = createState();
  for (const outcome of ["FAILED", "RECOVERY"]) {
    expectContractError(
      () => advance(recomputeState(initial, { outcome }), "PREFLIGHT_ACCEPTED"),
      "REHEARSAL_STATE_INVALID",
      ["STATE_INTEGRITY_MISMATCH"],
    );
  }

  const blocked = advance(initial, "FAIL_BEFORE_OWNERSHIP");
  assert.equal(blocked.phase, "BLOCKED");
  assert.equal(blocked.outcome, "FAILED");
  for (const outcome of ["ACTIVE", "RECOVERY"]) {
    expectContractError(
      () => advance(recomputeState(blocked, { outcome }), "COMPLETED"),
      "REHEARSAL_STATE_INVALID",
      ["STATE_INTEGRITY_MISMATCH"],
    );
  }

  let workingOwned = initial;
  for (const [event, additions] of [
    ["PREFLIGHT_ACCEPTED"],
    ["CLUSTER_LOCK_ACQUIRED"],
    ["SOURCE_PINNED", { sourcePin: SOURCE_PIN }],
    ["CREATE_ISSUED"],
    ["CREATE_RECONCILED"],
  ]) {
    workingOwned = advance(workingOwned, event, additions);
  }
  const recovery = advance(workingOwned, "PROVISIONAL_FAILURE_JOURNALED");
  assert.equal(recovery.outcome, "RECOVERY");
  for (const outcome of ["ACTIVE", "FAILED"]) {
    expectContractError(
      () =>
        advance(
          recomputeState(recovery, { outcome }),
          "PROVISIONAL_MARKER_RECONCILED",
          { ownershipIdentity: OWNERSHIP_IDENTITY },
        ),
      "REHEARSAL_STATE_INVALID",
      ["STATE_INTEGRITY_MISMATCH"],
    );
  }

  const workingMarked = advance(workingOwned, "WORKING_MARKED", {
    ownershipIdentity: OWNERSHIP_IDENTITY,
  });
  for (const outcome of ["FAILED", "RECOVERY"]) {
    expectContractError(
      () =>
        advance(recomputeState(workingMarked, { outcome }), "WORKING_OPENED"),
      "REHEARSAL_STATE_INVALID",
      ["STATE_INTEGRITY_MISMATCH"],
    );
  }
});

test("transition evidence and vocabulary are immutable and closed", () => {
  const evidence =
    buildCurrent180Current190PostgresqlRehearsalTransitionEvidence({
      authorizationReceiptDigest: AUTHORIZATION.authorizationReceiptDigest,
      event: "PREFLIGHT_ACCEPTED",
      evidenceDigest: "e".repeat(64),
      runToken: RUN_TOKEN,
    });
  assert.equal(
    evidence.contract,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITION_EVIDENCE_CONTRACT,
  );
  assert.ok(Object.isFrozen(evidence));
  assert.ok(Object.isFrozen(CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PHASES));
  assert.ok(
    Object.isFrozen(CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS),
  );
  assert.equal(
    new Set(CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PHASES).size,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PHASES.length,
  );
  for (const transition of Object.values(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS,
  )) {
    assert.ok(Object.isFrozen(transition));
    assert.ok(Object.isFrozen(transition.from));
    assert.ok(
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PHASES.includes(transition.to),
    );
  }
});
