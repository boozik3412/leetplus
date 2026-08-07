import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { isAbsolute } from "node:path";
import { isProxy } from "node:util/types";

import {
  CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
  assembleCurrent180Current190InMemoryArtifact,
  inspectCurrent180Current190DisposableReleaseAssembly,
} from "./current180-current190-disposable-release-assembler.mjs";
import {
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS,
  advanceCurrent180Current190PostgresqlRehearsalState,
  authorizeCurrent180Current190DisposablePostgresqlRehearsal,
  buildCurrent180Current190PostgresqlRehearsalChildEnvironment,
  buildCurrent180Current190PostgresqlRehearsalOwnershipIdentity,
  buildCurrent180Current190PostgresqlRehearsalOwnershipMarker,
  buildCurrent180Current190PostgresqlRehearsalTransitionEvidence,
  createCurrent180Current190PostgresqlRehearsalState,
  deriveCurrent180Current190PostgresqlRehearsalDatabaseNames,
  evaluateCurrent180Current190PostgresqlPrismaPrefix,
  evaluateCurrent180Current190PostgresqlSourcePreflight,
  reconcileCurrent180Current190PostgresqlRehearsalAllowConnections,
  reconcileCurrent180Current190PostgresqlRehearsalCreate,
  reconcileCurrent180Current190PostgresqlRehearsalDrop,
  reconcileCurrent180Current190PostgresqlRehearsalRename,
} from "./current180-current190-disposable-postgresql-rehearsal-contract.mjs";
import {
  appendCurrent180Current190PostgresqlRehearsalJournal,
  assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceipt,
  assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceiptForTestOnly,
  bindCurrent180Current190PostgresqlRehearsalJournal,
  bindCurrent180Current190PostgresqlRehearsalJournalForTestOnly,
  cleanupCurrent180Current190PostgresqlRehearsalJournal,
  cleanupCurrent180Current190PostgresqlRehearsalJournalAfterRestart,
  cleanupCurrent180Current190PostgresqlRehearsalJournalAfterRestartForTestOnly,
  createCurrent180Current190PostgresqlRehearsalJournalSigner,
  rehydrateCurrent180Current190PostgresqlRehearsalJournalRecovery,
  rehydrateCurrent180Current190PostgresqlRehearsalJournalRecoveryForTestOnly,
  refreshCurrent180Current190PostgresqlRehearsalJournal,
  verifyCurrent180Current190PostgresqlRehearsalJournal,
  verifyCurrent180Current190PostgresqlRehearsalJournalForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-journal.mjs";
import {
  createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly,
  issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding,
  issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly,
  loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority,
  loadCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthority,
} from "./current180-current190-disposable-postgresql-rehearsal-coordinator.mjs";
import {
  assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceipt,
  assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceiptForTestOnly,
  cleanupCurrent180Current190DisposablePostgresqlArtifact,
  cleanupCurrent180Current190DisposablePostgresqlArtifactAfterRestart,
  cleanupCurrent180Current190DisposablePostgresqlArtifactAfterRestartForTestOnly,
  cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly,
  discoverCurrent180Current190DisposablePostgresqlMaterializationRecoveryLocators,
  discoverCurrent180Current190DisposablePostgresqlMaterializationRecoveryLocatorsForTestOnly,
  materializeCurrent180Current190DisposablePostgresqlArtifact,
  materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly,
  rehydrateCurrent180Current190DisposablePostgresqlMaterializationRecovery,
  rehydrateCurrent180Current190DisposablePostgresqlMaterializationRecoveryForTestOnly,
  verifyCurrent180Current190DisposablePostgresqlArtifactForRunner,
  verifyCurrent180Current190DisposablePostgresqlArtifactForRunnerForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-materializer.mjs";
import {
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_PLAN,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES,
  buildCurrent180Current190PostgresqlAlterAllowConnectionsSql,
  buildCurrent180Current190PostgresqlApplicationDataFingerprintQuery,
  buildCurrent180Current190PostgresqlCatalogReconciliationQuery,
  buildCurrent180Current190PostgresqlCommentDatabaseSql,
  buildCurrent180Current190PostgresqlCreateDatabaseSql,
  buildCurrent180Current190PostgresqlDropDatabaseSql,
  buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest,
  buildCurrent180Current190PostgresqlRenameDatabaseSql,
  buildCurrent180Current190PostgresqlSequenceDataFingerprintQuery,
  reconcileCurrent180Current190PostgresqlCatalogEvidence,
} from "./current180-current190-disposable-postgresql-rehearsal-sql.mjs";

export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNNER_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNNER_V1";
export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_V1";
export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_EXECUTOR_AUTHORITY_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_EXECUTOR_AUTHORITY_V1";
export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_LIVE_EVIDENCE_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_LIVE_EVIDENCE_V1";

export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_INTERFACE =
  deepFreeze({
    contract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT,
    factory: {
      arguments: ["EXACT_DEEP_FROZEN_AUTHORIZATION_ENVIRONMENT_SNAPSHOT"],
      exportName:
        "createCurrent180Current190DisposablePostgresqlRehearsalRuntimeAdapter",
      module:
        "./current180-current190-disposable-postgresql-rehearsal-runtime.mjs",
    },
    methods: {
      acquireClusterLock: [
        "authorizationReceiptDigest",
        "journalRecordDigest",
        "names",
        "runToken",
      ],
      attestExecutableRuntime: [
        "authorizationReceiptDigest",
        "journalRecordDigest",
        "names",
        "runToken",
      ],
      cleanup: [
        "authorizationReceiptDigest",
        "expectedIdentity",
        "journalRecordDigest",
        "names",
        "reason",
        "runToken",
      ],
      deploy: [
        "databaseUrl",
        "env",
        "journalRecordDigest",
        "materializerVerificationReceipt",
        "names",
        "runToken",
        "schemaPath",
      ],
      executeStatement: [
        "connection",
        "journalRecordDigest",
        "names",
        "runToken",
        "statementSpec",
      ],
      liveQuery: [
        "connection",
        "journalRecordDigest",
        "names",
        "querySpec",
        "runToken",
      ],
      releaseClusterLock: [
        "journalRecordDigest",
        "lockReceipt",
        "names",
        "runToken",
      ],
    },
  });

export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_CRASH_RECOVERY_BOUNDARY =
  deepFreeze({
    admissionRequiresZeroClusterResidue: true,
    admissionRequiresZeroJournalResidue: true,
    admissionRequiresZeroMaterializerResidue: true,
    automaticRecoveryWithoutLiveJournalSigner: false,
    callerSuppliedRecoveryReceiptAccepted: false,
    janitorMayDeleteOnlyExactNameOidMarkerIdentity: true,
    lostPrivateAppendKeyRestorationClaimed: false,
    status: "FAIL_CLOSED_CRASH_RECOVERY_ADMISSION_V1",
  });

const RUNTIME_MODULE =
  "./current180-current190-disposable-postgresql-rehearsal-runtime.mjs";
const RUNTIME_FACTORY =
  "createCurrent180Current190DisposablePostgresqlRehearsalRuntimeAdapter";
const SOURCE_DATABASE_NAME = "leetplus_current179_ci";
const MAINTENANCE_DATABASE_NAME = "postgres";
const LOOPBACK_HOST = "127.0.0.1";
const LOOPBACK_PORT = 55_432;
const OWNER_ROLE = "postgres";
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MAX_EFFECT_ATTEMPTS = 2;
const MAX_RECONCILIATION_ATTEMPTS = 3;
const ADAPTER_KEYS = Object.freeze([
  "acquireClusterLock",
  "attestExecutableRuntime",
  "cleanup",
  "contract",
  "deploy",
  "executeStatement",
  "liveQuery",
  "releaseClusterLock",
]);
const testOnlyAdapters = new WeakSet();
const liveEvidenceReceipts = new WeakSet();
const effectAuthorizationReceipts = new WeakSet();
const recoveryAdmissionReceipts = new WeakMap();

export class Current180Current190DisposablePostgresqlRehearsalRunnerError extends Error {
  constructor(code, findings = [], failedClean = false) {
    super("CURRENT180-CURRENT190 PostgreSQL rehearsal runner failed closed.");
    this.name = "Current180Current190DisposablePostgresqlRehearsalRunnerError";
    this.code = code;
    this.failedClean = failedClean;
    this.findings = Object.freeze([...new Set(findings)].sort(compareText));
  }
}

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

function fail(code, findings, failedClean = false) {
  throw new Current180Current190DisposablePostgresqlRehearsalRunnerError(
    code,
    findings,
    failedClean,
  );
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (Object.hasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function dataSnapshot(value, seen = new WeakSet()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) {
    fail("RUNNER_DATA_BOUNDARY_INVALID", ["ACYCLIC_JSON_DATA_REQUIRED"]);
  }
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"),
    )
  ) {
    fail("RUNNER_DATA_BOUNDARY_INVALID", [
      "ACCESSORS_SYMBOLS_AND_EXOTIC_DATA_REJECTED",
    ]);
  }
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      keys.length !== value.length + 1
    ) {
      fail("RUNNER_DATA_BOUNDARY_INVALID", ["DENSE_PLAIN_ARRAY_REQUIRED"]);
    }
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(descriptors, String(index))) {
        fail("RUNNER_DATA_BOUNDARY_INVALID", ["DENSE_PLAIN_ARRAY_REQUIRED"]);
      }
      result.push(dataSnapshot(descriptors[String(index)].value, seen));
    }
    seen.delete(value);
    return result;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    fail("RUNNER_DATA_BOUNDARY_INVALID", ["PLAIN_DATA_OBJECT_REQUIRED"]);
  }
  const result = {};
  for (const key of Object.keys(descriptors).sort(compareText)) {
    result[key] = dataSnapshot(descriptors[key].value, seen);
  }
  seen.delete(value);
  return result;
}

function exactKeys(value, keys) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return (
    Reflect.ownKeys(descriptors).every(
      (key) =>
        typeof key === "string" && Object.hasOwn(descriptors[key], "value"),
    ) &&
    Object.keys(descriptors).sort(compareText).join("\n") ===
      [...keys].sort(compareText).join("\n")
  );
}

function snapshotEnvironment(environment) {
  const snapshot = dataSnapshot(environment);
  if (
    Object.values(snapshot).some(
      (value) => value !== undefined && typeof value !== "string",
    )
  ) {
    fail("RUNNER_INPUT_INVALID", ["STRING_ONLY_ENVIRONMENT_REQUIRED"]);
  }
  return deepFreeze(snapshot);
}

function assertAdapter(adapter, requireTestBrand) {
  if (!exactKeys(adapter, ADAPTER_KEYS)) {
    fail("RUNNER_RUNTIME_ADAPTER_INVALID", [
      "EXACT_RUNTIME_ADAPTER_INTERFACE_REQUIRED",
    ]);
  }
  if (
    adapter.contract !==
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT ||
    ADAPTER_KEYS.filter((key) => key !== "contract").some(
      (key) => typeof adapter[key] !== "function",
    )
  ) {
    fail("RUNNER_RUNTIME_ADAPTER_INVALID", [
      "EXACT_RUNTIME_ADAPTER_INTERFACE_REQUIRED",
    ]);
  }
  if (requireTestBrand && !testOnlyAdapters.has(adapter)) {
    fail("RUNNER_TEST_RUNTIME_ADAPTER_INVALID", [
      "MODULE_BRANDED_TEST_ONLY_ADAPTER_REQUIRED",
    ]);
  }
  return adapter;
}

export function createCurrent180Current190DisposablePostgresqlRehearsalFakeRuntimeAdapterForTestOnly(
  implementation,
) {
  if (arguments.length !== 1 || !exactKeys(implementation, ADAPTER_KEYS)) {
    fail("RUNNER_TEST_RUNTIME_ADAPTER_INVALID", [
      "EXACT_TEST_ONLY_IMPLEMENTATION_REQUIRED",
    ]);
  }
  if (
    implementation.contract !==
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT ||
    ADAPTER_KEYS.filter((key) => key !== "contract").some(
      (key) => typeof implementation[key] !== "function",
    )
  ) {
    fail("RUNNER_TEST_RUNTIME_ADAPTER_INVALID", [
      "EXACT_TEST_ONLY_IMPLEMENTATION_REQUIRED",
    ]);
  }
  const adapter = Object.freeze(
    Object.fromEntries(
      ADAPTER_KEYS.map((key) => [
        key,
        key === "contract"
          ? CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT
          : (...args) => implementation[key](...args),
      ]),
    ),
  );
  testOnlyAdapters.add(adapter);
  return adapter;
}

async function loadBuiltInAdapter(environment) {
  let runtimeModule;
  try {
    runtimeModule = await import(RUNTIME_MODULE);
  } catch {
    fail("RUNNER_TRUSTED_RUNTIME_UNAVAILABLE", [
      "FIXED_RUNTIME_MODULE_IMPORT_FAILED",
    ]);
  }
  if (typeof runtimeModule[RUNTIME_FACTORY] !== "function") {
    fail("RUNNER_TRUSTED_RUNTIME_UNAVAILABLE", [
      "FIXED_RUNTIME_FACTORY_EXPORT_REQUIRED",
    ]);
  }
  let adapter;
  try {
    adapter = await runtimeModule[RUNTIME_FACTORY](environment);
  } catch {
    fail("RUNNER_TRUSTED_RUNTIME_UNAVAILABLE", [
      "FIXED_RUNTIME_FACTORY_REJECTED_ENVIRONMENT",
    ]);
  }
  return assertAdapter(adapter, false);
}

function createExecutorAuthority() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = Buffer.from(
    publicKey.export({ format: "der", type: "spki" }),
  );
  const executorKeyId = sha256(publicKeyDer);
  return {
    executorKeyId,
    privateKey,
    publicKey,
    publicKeySpkiDerBase64: publicKeyDer.toString("base64"),
  };
}

function signExecutorDocument(authority, document) {
  const bytes = Buffer.from(
    `LEETPLUS_CURRENT180_CURRENT190_EXECUTOR_AUTHORITY_V1\n${canonicalJson(document)}`,
    "utf8",
  );
  const signatureBase64 = sign(null, bytes, authority.privateKey).toString(
    "base64",
  );
  if (
    !verify(
      null,
      bytes,
      authority.publicKey,
      Buffer.from(signatureBase64, "base64"),
    )
  ) {
    fail("RUNNER_EXECUTOR_AUTHORITY_FAILED", [
      "IN_PROCESS_ED25519_SELF_VERIFICATION_FAILED",
    ]);
  }
  return signatureBase64;
}

function maintenanceConnection() {
  return deepFreeze({
    kind: "MAINTENANCE",
    databaseName: MAINTENANCE_DATABASE_NAME,
  });
}

function sourceConnection() {
  return deepFreeze({ kind: "SOURCE", databaseName: SOURCE_DATABASE_NAME });
}

function targetConnection(databaseName, names) {
  if (
    ![names.workingDatabaseName, names.finalDatabaseName].includes(databaseName)
  ) {
    fail("RUNNER_CONNECTION_INVALID", ["EXACT_DERIVED_TARGET_REQUIRED"]);
  }
  return deepFreeze({ kind: "TARGET", databaseName });
}

function assertConnectionCompatibility(querySpec, connection, names) {
  const expected =
    querySpec.connection === "MAINTENANCE"
      ? connection.kind === "MAINTENANCE" &&
        connection.databaseName === MAINTENANCE_DATABASE_NAME
      : querySpec.connection === "SOURCE"
        ? connection.kind === "SOURCE" &&
          connection.databaseName === SOURCE_DATABASE_NAME
        : querySpec.connection === "SOURCE_OR_TARGET"
          ? (connection.kind === "SOURCE" &&
              connection.databaseName === SOURCE_DATABASE_NAME) ||
            (connection.kind === "TARGET" &&
              [names.workingDatabaseName, names.finalDatabaseName].includes(
                connection.databaseName,
              ))
          : false;
  if (!expected) {
    fail("RUNNER_CONNECTION_INVALID", [
      "QUERY_SPEC_AND_EXACT_CONNECTION_MISMATCH",
    ]);
  }
}

async function currentJournalVerification(context) {
  const locator =
    context.journal?.verificationLocator ?? context.recoveryLocator;
  const receipt = context.testOnlyCoordinator
    ? await verifyCurrent180Current190PostgresqlRehearsalJournalForTestOnly(
        context.coordinatorVerificationAuthority,
        locator,
      )
    : await verifyCurrent180Current190PostgresqlRehearsalJournal(
        context.coordinatorVerificationAuthority,
        locator,
      );
  if (context.testOnlyCoordinator) {
    assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceiptForTestOnly(
      receipt,
    );
  } else {
    assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceipt(
      receipt,
    );
  }
  if (
    receipt.authorizationReceiptDigest !==
      context.authorization.authorizationReceiptDigest ||
    receipt.runToken !== context.names.runToken
  ) {
    fail("RUNNER_JOURNAL_BINDING_INVALID", [
      "EXACT_AUTHORIZATION_AND_RUN_TOKEN_BINDING_REQUIRED",
    ]);
  }
  return receipt;
}

async function materializeArtifactForContext(context) {
  return context.testOnlyCoordinator
    ? materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
        context.artifact,
        context.coordinatorSigningAuthority,
        context.coordinatorRunBinding,
      )
    : materializeCurrent180Current190DisposablePostgresqlArtifact(
        context.artifact,
        context.coordinatorSigningAuthority,
        context.coordinatorVerificationAuthority,
        context.coordinatorRunBinding,
      );
}

async function verifyMaterializedArtifactForContext(
  context,
  assertReceipt = true,
) {
  const receipt = context.testOnlyCoordinator
    ? await verifyCurrent180Current190DisposablePostgresqlArtifactForRunnerForTestOnly(
        context.materializationReceipt,
      )
    : await verifyCurrent180Current190DisposablePostgresqlArtifactForRunner(
        context.materializationReceipt,
      );
  if (!assertReceipt) return receipt;
  if (context.testOnlyCoordinator) {
    assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceiptForTestOnly(
      receipt,
    );
  } else {
    assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceipt(
      receipt,
    );
  }
  return receipt;
}

async function cleanupMaterializedArtifactForContext(context) {
  return context.testOnlyCoordinator
    ? cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
        context.materializationReceipt,
      )
    : cleanupCurrent180Current190DisposablePostgresqlArtifact(
        context.materializationReceipt,
      );
}

async function discoverMaterializationRecoveryLocatorsForContext(context) {
  const locators = context.testOnlyCoordinator
    ? await discoverCurrent180Current190DisposablePostgresqlMaterializationRecoveryLocatorsForTestOnly(
        context.coordinatorVerificationAuthority,
      )
    : await discoverCurrent180Current190DisposablePostgresqlMaterializationRecoveryLocators(
        context.coordinatorVerificationAuthority,
      );
  if (!Array.isArray(locators) || isProxy(locators)) {
    fail("RUNNER_RECOVERY_MATERIALIZATION_INVALID", [
      "EXACT_COORDINATOR_VERIFIED_LOCATOR_ARRAY_REQUIRED",
    ]);
  }
  return locators;
}

async function rehydrateMaterializationRecoveryForContext(context, locator) {
  return context.testOnlyCoordinator
    ? rehydrateCurrent180Current190DisposablePostgresqlMaterializationRecoveryForTestOnly(
        context.coordinatorVerificationAuthority,
        locator,
        context.artifact,
      )
    : rehydrateCurrent180Current190DisposablePostgresqlMaterializationRecovery(
        context.coordinatorVerificationAuthority,
        locator,
        context.artifact,
      );
}

async function selectMaterializationRecoveryForContext(
  context,
  requestedLocator,
) {
  const locators =
    requestedLocator === null
      ? await discoverMaterializationRecoveryLocatorsForContext(context)
      : [requestedLocator];
  const matching = [];
  for (const locator of locators) {
    const recoveryReceipt = await rehydrateMaterializationRecoveryForContext(
      context,
      locator,
    );
    if (
      recoveryReceipt.authorizationReceiptDigest ===
        context.authorization.authorizationReceiptDigest &&
      recoveryReceipt.runToken === context.names.runToken
    ) {
      matching.push({
        locatorDigest: sha256(canonicalJson(locator)),
        recoveryReceipt,
      });
    }
  }
  if (requestedLocator !== null && matching.length !== 1) {
    fail("RUNNER_RECOVERY_MATERIALIZATION_BINDING_MISMATCH", [
      "EXPLICIT_MATERIALIZATION_LOCATOR_MUST_BIND_EXACT_AUTHORIZATION_AND_RUN",
    ]);
  }
  if (matching.length > 1) {
    fail("RUNNER_RECOVERY_MATERIALIZATION_AMBIGUOUS", [
      "MULTIPLE_SIGNED_MATERIALIZATIONS_BIND_THE_SAME_AUTHORIZATION_AND_RUN",
    ]);
  }
  return matching[0] ?? null;
}

async function cleanupRecoveredMaterializationForContext(context, recovery) {
  return context.testOnlyCoordinator
    ? cleanupCurrent180Current190DisposablePostgresqlArtifactAfterRestartForTestOnly(
        recovery.recoveryReceipt,
      )
    : cleanupCurrent180Current190DisposablePostgresqlArtifactAfterRestart(
        recovery.recoveryReceipt,
      );
}

function validateConnectionIdentity(identity, connection) {
  if (
    !exactKeys(identity, [
      "backendPid",
      "databaseName",
      "host",
      "port",
      "roleName",
    ]) ||
    !Number.isSafeInteger(identity.backendPid) ||
    identity.backendPid < 1 ||
    identity.databaseName !== connection.databaseName ||
    identity.host !== LOOPBACK_HOST ||
    identity.port !== LOOPBACK_PORT ||
    identity.roleName !== OWNER_ROLE
  ) {
    fail("RUNNER_LIVE_QUERY_EVIDENCE_INVALID", [
      "EXACT_LIVE_CONNECTION_IDENTITY_REQUIRED",
    ]);
  }
  return dataSnapshot(identity);
}

function validateQueryRows(rows, querySpec) {
  const snapshot = dataSnapshot(rows);
  if (!Array.isArray(snapshot)) {
    fail("RUNNER_LIVE_QUERY_EVIDENCE_INVALID", ["ROWS_ARRAY_REQUIRED"]);
  }
  const expected = [...querySpec.resultColumns].sort(compareText).join("\n");
  for (const row of snapshot) {
    if (!exactKeys(row, querySpec.resultColumns)) {
      fail("RUNNER_LIVE_QUERY_EVIDENCE_INVALID", [
        "EXACT_QUERY_RESULT_PROJECTION_REQUIRED",
      ]);
    }
    if (Object.keys(row).sort(compareText).join("\n") !== expected) {
      fail("RUNNER_LIVE_QUERY_EVIDENCE_INVALID", [
        "EXACT_QUERY_RESULT_PROJECTION_REQUIRED",
      ]);
    }
  }
  return snapshot;
}

async function executeLiveQuery(context, querySpec, connection) {
  buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest({ querySpec });
  assertConnectionCompatibility(querySpec, connection, context.names);
  const journalReceipt = await currentJournalVerification(context);
  let raw;
  try {
    raw = await context.adapter.liveQuery(
      deepFreeze({
        connection,
        journalRecordDigest: journalReceipt.lastRecordDigest,
        names: context.names,
        querySpec,
        runToken: context.names.runToken,
      }),
    );
  } catch {
    fail("RUNNER_LIVE_QUERY_FAILED", ["TRUSTED_RUNTIME_LIVE_QUERY_FAILED"]);
  }
  if (!exactKeys(raw, ["connectionIdentity", "rows"])) {
    fail("RUNNER_LIVE_QUERY_EVIDENCE_INVALID", [
      "EXACT_RUNTIME_QUERY_RESULT_REQUIRED",
    ]);
  }
  const connectionIdentity = validateConnectionIdentity(
    raw.connectionIdentity,
    connection,
  );
  const rows = validateQueryRows(raw.rows, querySpec);
  const document = {
    authorizationReceiptDigest:
      context.authorization.authorizationReceiptDigest,
    connection,
    connectionIdentity,
    connectionIdentityDigest: sha256(canonicalJson(connectionIdentity)),
    contract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_LIVE_EVIDENCE_CONTRACT,
    durableJournalEntryDigest: journalReceipt.lastRecordDigest,
    executorKeyId: context.executor.executorKeyId,
    names: context.names,
    querySpecDigest: querySpec.querySpecDigest,
    resultRowsDigest: sha256(canonicalJson(rows)),
    runToken: context.names.runToken,
  };
  const receipt = deepFreeze({
    ...document,
    signatureBase64: signExecutorDocument(context.executor, document),
  });
  liveEvidenceReceipts.add(receipt);
  context.auditDigests.push(
    sha256(
      canonicalJson({ ...document, signatureBase64: receipt.signatureBase64 }),
    ),
  );
  return { evidenceReceipt: receipt, rows };
}

function assertLiveEvidence(receipt, querySpec, journalRecordDigest) {
  if (
    !liveEvidenceReceipts.has(receipt) ||
    receipt.querySpecDigest !== querySpec.querySpecDigest ||
    receipt.durableJournalEntryDigest !== journalRecordDigest
  ) {
    fail("RUNNER_LIVE_QUERY_EVIDENCE_INVALID", [
      "FRESH_IN_PROCESS_SIGNED_LIVE_EVIDENCE_REQUIRED",
    ]);
  }
}

function issueEffectAuthorization(context, input) {
  const document = {
    authorizationReceiptDigest:
      context.authorization.authorizationReceiptDigest,
    contract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_EXECUTOR_AUTHORITY_CONTRACT,
    durableJournalEntryDigest: input.journalRecordDigest,
    effectDigest: input.effectDigest,
    effectKind: input.effectKind,
    executorKeyId: context.executor.executorKeyId,
    names: context.names,
    runtimeDigest: context.runtimeAttestation.runtimeDigest,
    runToken: context.names.runToken,
  };
  const receipt = deepFreeze({
    ...document,
    signatureBase64: signExecutorDocument(context.executor, document),
  });
  effectAuthorizationReceipts.add(receipt);
  context.auditDigests.push(sha256(canonicalJson(receipt)));
  return receipt;
}

function assertEffectAuthorization(receipt, effectDigest, journalRecordDigest) {
  if (
    !effectAuthorizationReceipts.has(receipt) ||
    receipt.effectDigest !== effectDigest ||
    receipt.durableJournalEntryDigest !== journalRecordDigest
  ) {
    fail("RUNNER_EFFECT_AUTHORIZATION_INVALID", [
      "FRESH_IN_PROCESS_SIGNED_EFFECT_AUTHORIZATION_REQUIRED",
    ]);
  }
}

async function executeStatement(context, statementSpec) {
  const journalReceipt = await currentJournalVerification(context);
  const authorization = issueEffectAuthorization(context, {
    effectDigest: statementSpec.statementSpecDigest,
    effectKind: statementSpec.kind,
    journalRecordDigest: journalReceipt.lastRecordDigest,
  });
  assertEffectAuthorization(
    authorization,
    statementSpec.statementSpecDigest,
    journalReceipt.lastRecordDigest,
  );
  let result;
  context.databaseMutationAttempted = true;
  try {
    result = await context.adapter.executeStatement(
      deepFreeze({
        connection: maintenanceConnection(),
        journalRecordDigest: journalReceipt.lastRecordDigest,
        names: context.names,
        runToken: context.names.runToken,
        statementSpec,
      }),
    );
  } catch (error) {
    if (error?.code === "RUNTIME_EFFECT_RESPONSE_LOST") {
      return deepFreeze({ responseObserved: false });
    }
    fail("RUNNER_STATEMENT_EXECUTION_FAILED", [
      "TRUSTED_RUNTIME_STATEMENT_FAILED_WITHOUT_LOST_RESPONSE_CLASSIFICATION",
    ]);
  }
  if (
    !exactKeys(result, ["responseObserved"]) ||
    typeof result.responseObserved !== "boolean"
  ) {
    fail("RUNNER_STATEMENT_EXECUTION_FAILED", [
      "EXACT_STATEMENT_RESPONSE_REQUIRED",
    ]);
  }
  return deepFreeze({ responseObserved: result.responseObserved });
}

function prepareDeploy(context, databaseName) {
  const target =
    databaseName === context.names.workingDatabaseName ? "working" : "final";
  const child = buildCurrent180Current190PostgresqlRehearsalChildEnvironment({
    authorizationReceiptDigest:
      context.authorization.authorizationReceiptDigest,
    environment: context.environment,
    names: context.names,
    target,
  });
  const document = {
    databaseName,
    databaseUrlSha256:
      child.CURRENT180_CURRENT190_REHEARSAL_DATABASE_URL_SHA256,
    materializationReceiptDigest: context.materializationReceipt.receiptDigest,
    operation: "PRISMA_MIGRATE_DEPLOY",
    schemaPath: context.materializationReceipt.schemaPath,
  };
  return deepFreeze({
    child,
    databaseName,
    deployPlanDigest: sha256(canonicalJson(document)),
    schemaPath: context.materializationReceipt.schemaPath,
  });
}

async function executeDeploy(context, prepared) {
  const journalReceipt = await currentJournalVerification(context);
  const authorization = issueEffectAuthorization(context, {
    effectDigest: prepared.deployPlanDigest,
    effectKind: "PRISMA_MIGRATE_DEPLOY",
    journalRecordDigest: journalReceipt.lastRecordDigest,
  });
  assertEffectAuthorization(
    authorization,
    prepared.deployPlanDigest,
    journalReceipt.lastRecordDigest,
  );
  const materializerVerificationReceipt =
    await verifyMaterializedArtifactForContext(context, false);
  if (
    materializerVerificationReceipt.schemaPath !== prepared.schemaPath ||
    materializerVerificationReceipt.materializationReceiptDigest !==
      context.materializationReceipt.receiptDigest
  ) {
    fail("RUNNER_DEPLOY_EXECUTION_FAILED", [
      "FRESH_MATERIALIZER_VERIFICATION_TARGET_MISMATCH",
    ]);
  }
  let result;
  context.databaseMutationAttempted = true;
  try {
    result = await context.adapter.deploy(
      deepFreeze({
        databaseUrl: prepared.child.DATABASE_URL,
        env: prepared.child,
        journalRecordDigest: journalReceipt.lastRecordDigest,
        materializerVerificationReceipt,
        names: context.names,
        runToken: context.names.runToken,
        schemaPath: prepared.schemaPath,
      }),
    );
  } catch (error) {
    if (error?.code === "RUNTIME_EFFECT_RESPONSE_LOST") {
      return deepFreeze({ responseObserved: false });
    }
    fail("RUNNER_DEPLOY_EXECUTION_FAILED", [
      "TRUSTED_RUNTIME_DEPLOY_FAILED_WITHOUT_LOST_RESPONSE_CLASSIFICATION",
    ]);
  }
  if (
    !exactKeys(result, ["responseObserved"]) ||
    typeof result.responseObserved !== "boolean"
  ) {
    fail("RUNNER_DEPLOY_EXECUTION_FAILED", ["EXACT_DEPLOY_RESPONSE_REQUIRED"]);
  }
  return deepFreeze({ responseObserved: result.responseObserved });
}

function planDigest(value) {
  return sha256(canonicalJson(dataSnapshot(value)));
}

async function appendAndAdvance(context, event, evidenceDigest, extra = {}) {
  const transition =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS[event];
  if (
    transition === undefined ||
    !transition.from.includes(context.state.phase)
  ) {
    fail("RUNNER_LIFECYCLE_INVALID", ["EVENT_NOT_ALLOWED_FROM_CURRENT_STATE"]);
  }
  const evidence =
    buildCurrent180Current190PostgresqlRehearsalTransitionEvidence({
      authorizationReceiptDigest:
        context.authorization.authorizationReceiptDigest,
      event,
      evidenceDigest,
      runToken: context.names.runToken,
    });
  const input = { event, evidence, ...extra };
  let appendReceipt;
  try {
    appendReceipt = await appendCurrent180Current190PostgresqlRehearsalJournal(
      context.journal,
      {
        event,
        evidenceDigest,
        fromPhase: context.state.phase,
        stateDigest: context.state.stateDigest,
        toPhase: transition.to,
      },
    );
  } catch (error) {
    if (error?.code !== "REHEARSAL_JOURNAL_APPEND_RESPONSE_LOST") throw error;
    const refreshed =
      await refreshCurrent180Current190PostgresqlRehearsalJournal(
        context.journal,
      );
    if (refreshed.lastPhase !== transition.to) throw error;
    appendReceipt = refreshed;
  }
  context.state = advanceCurrent180Current190PostgresqlRehearsalState(
    context.state,
    input,
  );
  context.auditDigests.push(
    appendReceipt.recordDigest ?? appendReceipt.lastRecordDigest,
  );
  return appendReceipt;
}

function validateRuntimeAttestation(
  attestation,
  adapterContract,
  requireZeroResidue = true,
) {
  if (
    !exactKeys(attestation, [
      "adapterContract",
      "crashRecoveryAdmission",
      "nodeExecutablePath",
      "nodeExecutableSha256",
      "prismaExecutablePath",
      "prismaExecutableSha256",
      "runtimeDigest",
      "verified",
    ]) ||
    attestation.adapterContract !== adapterContract ||
    attestation.verified !== true ||
    !isAbsolute(attestation.nodeExecutablePath) ||
    !isAbsolute(attestation.prismaExecutablePath) ||
    !SHA256_PATTERN.test(String(attestation.nodeExecutableSha256 ?? "")) ||
    !SHA256_PATTERN.test(String(attestation.prismaExecutableSha256 ?? "")) ||
    !SHA256_PATTERN.test(String(attestation.runtimeDigest ?? "")) ||
    !exactKeys(attestation.crashRecoveryAdmission, [
      "clusterResidueCount",
      "journalResidueCount",
      "materializerResidueCount",
      "recoveryRequired",
      "verified",
    ])
  ) {
    fail("RUNNER_RUNTIME_ATTESTATION_INVALID", [
      "EXACT_EXECUTABLE_RUNTIME_ATTESTATION_REQUIRED",
    ]);
  }
  const admission = attestation.crashRecoveryAdmission;
  if (
    [
      admission.clusterResidueCount,
      admission.journalResidueCount,
      admission.materializerResidueCount,
    ].some((value) => !Number.isSafeInteger(value) || value < 0) ||
    typeof admission.recoveryRequired !== "boolean" ||
    admission.verified !== true
  ) {
    fail("RUNNER_RUNTIME_ATTESTATION_INVALID", [
      "EXACT_CRASH_RECOVERY_ATTESTATION_REQUIRED",
    ]);
  }
  const document = { ...attestation };
  delete document.runtimeDigest;
  if (attestation.runtimeDigest !== sha256(canonicalJson(document))) {
    fail("RUNNER_RUNTIME_ATTESTATION_INVALID", [
      "RUNTIME_ATTESTATION_DIGEST_MISMATCH",
    ]);
  }
  if (
    requireZeroResidue &&
    (admission.clusterResidueCount !== 0 ||
      admission.journalResidueCount !== 0 ||
      admission.materializerResidueCount !== 0 ||
      admission.recoveryRequired !== false)
  ) {
    fail("RUNNER_CRASH_RECOVERY_REQUIRED", [
      "ZERO_RESIDUE_ADMISSION_REQUIRED",
      "AUTOMATIC_RECOVERY_WITHOUT_LIVE_SIGNER_DENIED",
    ]);
  }
  return deepFreeze(dataSnapshot(attestation));
}

async function attestRuntime(context) {
  const journalReceipt = await currentJournalVerification(context);
  let attestation;
  try {
    attestation = await context.adapter.attestExecutableRuntime(
      deepFreeze({
        authorizationReceiptDigest:
          context.authorization.authorizationReceiptDigest,
        journalRecordDigest: journalReceipt.lastRecordDigest,
        names: context.names,
        runToken: context.names.runToken,
      }),
    );
  } catch {
    fail("RUNNER_RUNTIME_ATTESTATION_FAILED", [
      "TRUSTED_RUNTIME_ATTESTATION_FAILED",
    ]);
  }
  return validateRuntimeAttestation(attestation, context.adapter.contract);
}

function oneRow(rows, code) {
  if (rows.length !== 1) fail(code, ["EXACTLY_ONE_ROW_REQUIRED"]);
  return rows[0];
}

function migrationSummary(rows) {
  const finished = rows.filter(({ finishedAt }) => finishedAt !== null);
  return {
    migrationCount: rows.length,
    migrationHead: rows.at(-1)?.migrationName ?? null,
    migrationHeadChecksum: rows.at(-1)?.checksum ?? null,
    migrationManifestDigest: sha256(
      `${rows
        .map(({ checksum, migrationName }) => `${migrationName} ${checksum}`)
        .join("\n")}\n`,
    ),
    rolledBackMigrationCount: rows.filter(
      ({ rolledBackAt }) => rolledBackAt !== null,
    ).length,
    unfinishedMigrationCount: rows.length - finished.length,
  };
}

async function collectSemanticFingerprint(context, connection) {
  const components = [];
  let tableInventory = [];
  let sequenceInventory = [];
  for (const [name, querySpec] of Object.entries(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES,
  )) {
    const result = await executeLiveQuery(context, querySpec, connection);
    components.push({
      name,
      querySpecDigest: querySpec.querySpecDigest,
      rowsDigest: result.evidenceReceipt.resultRowsDigest,
    });
    if (name === "dataTableInventory") tableInventory = result.rows;
    if (name === "dataSequenceInventory") sequenceInventory = result.rows;
  }
  for (const row of tableInventory) {
    if (row.tableName === "_prisma_migrations") continue;
    const querySpec =
      buildCurrent180Current190PostgresqlApplicationDataFingerprintQuery(row);
    const result = await executeLiveQuery(context, querySpec, connection);
    components.push({
      name: `application-data:${row.schemaName}.${row.tableName}`,
      querySpecDigest: querySpec.querySpecDigest,
      rowsDigest: result.evidenceReceipt.resultRowsDigest,
    });
  }
  for (const row of sequenceInventory) {
    const querySpec =
      buildCurrent180Current190PostgresqlSequenceDataFingerprintQuery(row);
    const result = await executeLiveQuery(context, querySpec, connection);
    components.push({
      name: `sequence-state:${row.schemaName}.${row.sequenceName}`,
      querySpecDigest: querySpec.querySpecDigest,
      rowsDigest: result.evidenceReceipt.resultRowsDigest,
    });
  }
  const document = {
    components,
    contract:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_PLAN.contract,
  };
  return deepFreeze({
    ...document,
    fingerprintDigest: sha256(canonicalJson(document)),
  });
}

async function collectSourcePreflight(context) {
  const maintenance = oneRow(
    (
      await executeLiveQuery(
        context,
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES.maintenanceAuthority,
        maintenanceConnection(),
      )
    ).rows,
    "RUNNER_MAINTENANCE_AUTHORITY_INVALID",
  );
  if (
    maintenance.databaseName !== MAINTENANCE_DATABASE_NAME ||
    maintenance.currentUserName !== OWNER_ROLE ||
    maintenance.currentUserSuperuser !== true ||
    maintenance.currentUserCanCreateDatabase !== true ||
    maintenance.serverVersionNumber < 160_000 ||
    maintenance.serverVersionNumber >= 170_000
  ) {
    fail("RUNNER_MAINTENANCE_AUTHORITY_INVALID", [
      "PINNED_POSTGRESQL16_CREATEDB_SUPERUSER_REQUIRED",
    ]);
  }
  const sourceAuthority = oneRow(
    (
      await executeLiveQuery(
        context,
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES.sourceAuthority,
        sourceConnection(),
      )
    ).rows,
    "RUNNER_SOURCE_AUTHORITY_INVALID",
  );
  const relationRows = (
    await executeLiveQuery(
      context,
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES.requiredRelationOwners,
      sourceConnection(),
    )
  ).rows;
  if (
    relationRows.length !==
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS.length ||
    relationRows.some(
      (row, index) =>
        row.ordinal !== index + 1 ||
        row.relationName !==
          CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS[index] ||
        row.exists !== true ||
        !["r", "p"].includes(row.relationKind) ||
        row.ownerName !== OWNER_ROLE,
    )
  ) {
    fail("RUNNER_SOURCE_OBJECT_OWNER_INVALID", [
      "EXACT_REQUIRED_RELATION_OWNER_PROJECTION_REQUIRED",
    ]);
  }
  const lockOwner = oneRow(
    (
      await executeLiveQuery(
        context,
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES.identityClaimLockOwner,
        sourceConnection(),
      )
    ).rows,
    "RUNNER_SOURCE_OBJECT_OWNER_INVALID",
  );
  if (
    lockOwner.exists !== true ||
    lockOwner.ownerName !== OWNER_ROLE ||
    lockOwner.ownerOid !== sourceAuthority.databaseOwnerOid
  ) {
    fail("RUNNER_SOURCE_OBJECT_OWNER_INVALID", [
      "IDENTITY_CLAIM_LOCK_OWNER_PARITY_REQUIRED",
    ]);
  }
  const migrationRows = (
    await executeLiveQuery(
      context,
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES.migrationRows,
      sourceConnection(),
    )
  ).rows;
  const occupancy = oneRow(
    (
      await executeLiveQuery(
        context,
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES.sourceOccupancy,
        sourceConnection(),
      )
    ).rows,
    "RUNNER_SOURCE_OCCUPANCY_INVALID",
  );
  const fingerprint = await collectSemanticFingerprint(
    context,
    sourceConnection(),
  );
  const report = evaluateCurrent180Current190PostgresqlSourcePreflight({
    claimedOutboxCount: occupancy.claimedOutboxCount,
    current180SuccessorObjectCount: occupancy.current180SuccessorObjectCount,
    current186NamedRoutineCount: occupancy.current186NamedRoutineCount,
    currentUserCanCreateDatabase: sourceAuthority.currentUserCanCreateDatabase,
    currentUserName: sourceAuthority.currentUserName,
    currentUserOid: sourceAuthority.currentUserOid,
    currentUserSuperuser: sourceAuthority.currentUserSuperuser,
    databaseName: sourceAuthority.databaseName,
    databaseOid: sourceAuthority.databaseOid,
    databaseOwnerOid: sourceAuthority.databaseOwnerOid,
    databaseOwnerName: sourceAuthority.databaseOwnerName,
    enrollmentCount: occupancy.enrollmentCount,
    host: LOOPBACK_HOST,
    identityClaimLockOwnerOid: lockOwner.ownerOid,
    isTemplate: sourceAuthority.isTemplate,
    ...migrationSummary(migrationRows),
    otherSessionCount: occupancy.otherSessionCount,
    port: LOOPBACK_PORT,
    requiredRelationOwners: relationRows.map(({ ownerOid, relationName }) => ({
      ownerOid,
      relationName,
    })),
    serverVersionNumber: sourceAuthority.serverVersionNumber,
    sourceFingerprint: fingerprint.fingerprintDigest,
    sourceUrlSha256: context.authorization.environment.sourceUrlSha256,
  });
  if (report.verified !== true) {
    fail("RUNNER_SOURCE_PREFLIGHT_BLOCKED", report.findings);
  }
  return { fingerprint, report };
}

function catalogRowsForContract(rows) {
  return rows.map((row) => ({
    allowConnections: row.allowConnections,
    isTemplate: row.isTemplate,
    marker: row.marker,
    name: row.databaseName,
    oid: row.databaseOid,
    ownerName: row.ownerName,
    ownerOid: row.ownerOid,
  }));
}

function ownershipMarkersForContext(context) {
  return [1, 2].map((attempt) =>
    buildCurrent180Current190PostgresqlRehearsalOwnershipMarker({
      attempt,
      authorizationReceiptDigest:
        context.authorization.authorizationReceiptDigest,
      runToken: context.names.runToken,
    }),
  );
}

async function catalogSnapshot(context, expectedIdentity = null) {
  const querySpec =
    buildCurrent180Current190PostgresqlCatalogReconciliationQuery({
      expectedMarker: expectedIdentity?.marker ?? null,
      expectedOid: expectedIdentity?.oid ?? null,
      finalDatabaseName: context.names.finalDatabaseName,
      ownershipMarkers: ownershipMarkersForContext(context),
      runToken: context.names.runToken,
      workingDatabaseName: context.names.workingDatabaseName,
    });
  const result = await executeLiveQuery(
    context,
    querySpec,
    maintenanceConnection(),
  );
  assertLiveEvidence(
    result.evidenceReceipt,
    querySpec,
    result.evidenceReceipt.durableJournalEntryDigest,
  );
  return {
    reconciliation: reconcileCurrent180Current190PostgresqlCatalogEvidence({
      querySpec,
      rows: result.rows,
    }),
    rows: result.rows,
  };
}

async function provisionOwnedWorkingDatabase(context) {
  const before = await catalogSnapshot(context);
  if (before.reconciliation.decision !== "TARGETS_ABSENT") {
    fail("RUNNER_CREATE_PREFLIGHT_BLOCKED", [
      "DERIVED_TARGET_NAMES_MUST_BE_ABSENT",
    ]);
  }
  const marker = buildCurrent180Current190PostgresqlRehearsalOwnershipMarker({
    attempt: context.attempt,
    authorizationReceiptDigest:
      context.authorization.authorizationReceiptDigest,
    runToken: context.names.runToken,
  });
  const createSpec = buildCurrent180Current190PostgresqlCreateDatabaseSql({
    runToken: context.names.runToken,
    workingDatabaseName: context.names.workingDatabaseName,
  });
  await appendAndAdvance(
    context,
    "CREATE_ISSUED",
    planDigest({
      catalogEvidenceDigest: before.reconciliation.catalogEvidenceDigest,
      createStatementSpecDigest: createSpec.statementSpecDigest,
      marker,
      reconciliationLimit: MAX_RECONCILIATION_ATTEMPTS,
    }),
  );
  let createAcknowledged = false;
  let latest;
  for (let attempt = 1; attempt <= MAX_RECONCILIATION_ATTEMPTS; attempt += 1) {
    if (attempt <= MAX_EFFECT_ATTEMPTS && latest?.rows?.length !== 1) {
      const result = await executeStatement(context, createSpec);
      createAcknowledged ||= result.responseObserved;
    }
    latest = await catalogSnapshot(context);
    if (latest.rows.length === 0) continue;
    if (latest.rows.length !== 1) {
      fail("RUNNER_CREATE_RECONCILIATION_BLOCKED", [
        "EXACT_SINGLE_TARGET_IDENTITY_REQUIRED",
      ]);
    }
    if (latest.rows[0].marker === null && !createAcknowledged) {
      fail("RUNNER_CREATE_RESPONSE_LOST_UNMARKED", [
        "UNMARKED_CREATE_WITHOUT_ACKNOWLEDGEMENT_REQUIRES_JANITOR",
      ]);
    }
    break;
  }
  if (latest?.rows?.length !== 1) {
    fail("RUNNER_CREATE_RECONCILIATION_BLOCKED", [
      "BOUNDED_CREATE_RECONCILIATION_EXHAUSTED",
    ]);
  }
  if (latest.rows[0].marker === null) {
    const identityReceipt = latest.reconciliation.identityReceipt;
    if (identityReceipt === null) {
      fail("RUNNER_CREATE_RECONCILIATION_BLOCKED", [
        "STRUCTURED_UNMARKED_IDENTITY_REQUIRED",
      ]);
    }
    const provisionalIdentity =
      buildCurrent180Current190PostgresqlRehearsalOwnershipIdentity({
        attempt: context.attempt,
        authorizationReceiptDigest:
          context.authorization.authorizationReceiptDigest,
        oid: latest.rows[0].databaseOid,
        ownerName: latest.rows[0].ownerName,
        ownerOid: latest.rows[0].ownerOid,
        runToken: context.names.runToken,
      });
    await appendAndAdvance(
      context,
      "CREATE_RECONCILED",
      provisionalIdentity.identityDigest,
    );
    const commentSpec = buildCurrent180Current190PostgresqlCommentDatabaseSql({
      identityReceipt,
      marker,
    });
    await appendAndAdvance(
      context,
      "PROVISIONAL_FAILURE_JOURNALED",
      planDigest({
        commentStatementSpecDigest: commentSpec.statementSpecDigest,
        provisionalIdentityDigest: provisionalIdentity.identityDigest,
      }),
    );
    for (
      let commentAttempt = 1;
      commentAttempt <= MAX_RECONCILIATION_ATTEMPTS;
      commentAttempt += 1
    ) {
      if (commentAttempt <= MAX_EFFECT_ATTEMPTS) {
        await executeStatement(context, commentSpec);
      }
      latest = await catalogSnapshot(context);
      if (latest.rows.length === 1 && latest.rows[0].marker === marker) break;
      if (latest.rows.length !== 1 || latest.rows[0].marker !== null) {
        fail("RUNNER_COMMENT_RECONCILIATION_BLOCKED", [
          "EXACT_PROVISIONAL_IDENTITY_REQUIRED",
        ]);
      }
    }
    if (latest.rows.length !== 1 || latest.rows[0].marker !== marker) {
      fail("RUNNER_COMMENT_RECONCILIATION_BLOCKED", [
        "BOUNDED_COMMENT_RECONCILIATION_EXHAUSTED",
      ]);
    }
    const markedDecision =
      reconcileCurrent180Current190PostgresqlRehearsalCreate({
        absencePreflightPassed: true,
        catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
        commandAttempted: true,
        finalDatabaseName: context.names.finalDatabaseName,
        ownershipContext: {
          attempt: context.attempt,
          authorizationReceiptDigest:
            context.authorization.authorizationReceiptDigest,
          ownerName: latest.rows[0].ownerName,
          ownerOid: latest.rows[0].ownerOid,
          runToken: context.names.runToken,
        },
        rows: catalogRowsForContract(latest.rows),
        workingDatabaseName: context.names.workingDatabaseName,
      });
    if (
      markedDecision.decision !== "CREATE_COMMITTED_RECONCILED" ||
      markedDecision.ownershipIdentity.identityDigest !==
        provisionalIdentity.identityDigest
    ) {
      fail("RUNNER_COMMENT_RECONCILIATION_BLOCKED", [
        "EXACT_PROVISIONAL_IDENTITY_CONTINUITY_REQUIRED",
      ]);
    }
    await appendAndAdvance(
      context,
      "PROVISIONAL_MARKER_RECONCILED",
      provisionalIdentity.identityDigest,
      { ownershipIdentity: provisionalIdentity },
    );
    return provisionalIdentity;
  }
  if (latest.rows[0].marker !== marker) {
    fail("RUNNER_CREATE_RECONCILIATION_BLOCKED", [
      "FOREIGN_OWNERSHIP_MARKER_REJECTED",
    ]);
  }
  const decision = reconcileCurrent180Current190PostgresqlRehearsalCreate({
    absencePreflightPassed: true,
    catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
    commandAttempted: true,
    finalDatabaseName: context.names.finalDatabaseName,
    ownershipContext: {
      attempt: context.attempt,
      authorizationReceiptDigest:
        context.authorization.authorizationReceiptDigest,
      ownerName: latest.rows[0].ownerName,
      ownerOid: latest.rows[0].ownerOid,
      runToken: context.names.runToken,
    },
    rows: catalogRowsForContract(latest.rows),
    workingDatabaseName: context.names.workingDatabaseName,
  });
  if (decision.decision !== "CREATE_COMMITTED_RECONCILED") {
    fail("RUNNER_CREATE_RECONCILIATION_BLOCKED", [decision.decision]);
  }
  await appendAndAdvance(
    context,
    "CREATE_RECONCILED",
    decision.ownershipIdentity.identityDigest,
  );
  await appendAndAdvance(
    context,
    "WORKING_MARKED",
    decision.ownershipIdentity.identityDigest,
    { ownershipIdentity: decision.ownershipIdentity },
  );
  return decision.ownershipIdentity;
}

async function setAllowConnections(
  context,
  databaseName,
  expected,
  intentEvent,
) {
  const initial = await catalogSnapshot(
    context,
    context.state.ownershipIdentity,
  );
  if (
    initial.reconciliation.decision !== "STRUCTURED_IDENTITY_VERIFIED" ||
    initial.reconciliation.identityReceipt === null ||
    initial.reconciliation.identityReceipt.databaseName !== databaseName
  ) {
    fail("RUNNER_ALLOW_RECONCILIATION_BLOCKED", [
      "EXACT_OWNED_IDENTITY_REQUIRED",
    ]);
  }
  const initialDecision =
    reconcileCurrent180Current190PostgresqlRehearsalAllowConnections({
      catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
      databaseName,
      expectedAllowConnections: expected,
      expectedIdentity: context.state.ownershipIdentity,
      rows: catalogRowsForContract(initial.rows),
    });
  const spec =
    initialDecision.decision === "ALLOW_SETTING_COMMITTED_RECONCILED"
      ? null
      : buildCurrent180Current190PostgresqlAlterAllowConnectionsSql({
          allowConnections: expected,
          identityReceipt: initial.reconciliation.identityReceipt,
        });
  await appendAndAdvance(
    context,
    intentEvent,
    planDigest({
      databaseName,
      expected,
      operation: "ALTER_ALLOW_CONNECTIONS",
      statementSpecDigest: spec?.statementSpecDigest ?? null,
    }),
  );
  if (spec === null) return;
  for (let attempt = 1; attempt <= MAX_RECONCILIATION_ATTEMPTS; attempt += 1) {
    if (attempt <= MAX_EFFECT_ATTEMPTS) await executeStatement(context, spec);
    const current = await catalogSnapshot(
      context,
      context.state.ownershipIdentity,
    );
    if (
      current.reconciliation.decision !== "STRUCTURED_IDENTITY_VERIFIED" ||
      current.reconciliation.identityReceipt === null
    ) {
      fail("RUNNER_ALLOW_RECONCILIATION_BLOCKED", [
        "EXACT_OWNED_IDENTITY_REQUIRED",
      ]);
    }
    const identityReceipt = current.reconciliation.identityReceipt;
    if (identityReceipt.databaseName !== databaseName) {
      fail("RUNNER_ALLOW_RECONCILIATION_BLOCKED", [
        "EXPECTED_DATABASE_NAME_MISMATCH",
      ]);
    }
    const decision =
      reconcileCurrent180Current190PostgresqlRehearsalAllowConnections({
        catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
        databaseName,
        expectedAllowConnections: expected,
        expectedIdentity: context.state.ownershipIdentity,
        rows: catalogRowsForContract(current.rows),
      });
    if (decision.decision === "ALLOW_SETTING_COMMITTED_RECONCILED") return;
    if (decision.safeToRetry !== true) {
      fail("RUNNER_ALLOW_RECONCILIATION_BLOCKED", [decision.decision]);
    }
  }
  fail("RUNNER_ALLOW_RECONCILIATION_BLOCKED", [
    "BOUNDED_ALLOW_RECONCILIATION_EXHAUSTED",
  ]);
}

async function deployAndReconcile(context, databaseName, event) {
  const prepared = prepareDeploy(context, databaseName);
  await appendAndAdvance(context, event, prepared.deployPlanDigest);
  let result;
  for (let attempt = 1; attempt <= MAX_RECONCILIATION_ATTEMPTS; attempt += 1) {
    if (attempt <= MAX_EFFECT_ATTEMPTS) await executeDeploy(context, prepared);
    const migrationRows = (
      await executeLiveQuery(
        context,
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES.migrationRows,
        targetConnection(databaseName, context.names),
      )
    ).rows;
    result = evaluateCurrent180Current190PostgresqlPrismaPrefix({
      assemblyReceipt: context.artifact,
      rows: migrationRows,
    });
    if (result.decision === "PRISMA_EXACT_CURRENT190_COMMITTED") break;
    if (result.safeToRetryDeploy !== true) {
      fail("RUNNER_DEPLOY_RECONCILIATION_BLOCKED", [result.decision]);
    }
  }
  if (result?.decision !== "PRISMA_EXACT_CURRENT190_COMMITTED") {
    fail("RUNNER_DEPLOY_RECONCILIATION_BLOCKED", [
      "BOUNDED_DEPLOY_RECONCILIATION_EXHAUSTED",
      result?.decision ?? "PRISMA_RECONCILIATION_DECISION_MISSING",
      Number.isSafeInteger(result?.completedMigrationCount)
        ? `PRISMA_PREFIX_COUNT_${result.completedMigrationCount}`
        : "PRISMA_PREFIX_COUNT_MISSING",
      typeof result?.completedMigrationHead === "string"
        ? `PRISMA_PREFIX_HEAD_${result.completedMigrationHead}`
        : "PRISMA_PREFIX_HEAD_MISSING",
    ]);
  }
  return result;
}

async function renameAndReconcile(
  context,
  fromDatabaseName,
  toDatabaseName,
  event,
) {
  const initial = await catalogSnapshot(
    context,
    context.state.ownershipIdentity,
  );
  const initialDecision =
    reconcileCurrent180Current190PostgresqlRehearsalRename({
      catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
      expectedIdentity: context.state.ownershipIdentity,
      fromDatabaseName,
      rows: catalogRowsForContract(initial.rows),
      toDatabaseName,
    });
  if (
    initialDecision.decision !== "RENAME_COMMITTED_RECONCILED" &&
    (initialDecision.safeToRetry !== true ||
      initial.reconciliation.identityReceipt === null)
  ) {
    fail("RUNNER_RENAME_RECONCILIATION_BLOCKED", [initialDecision.decision]);
  }
  const spec =
    initialDecision.decision === "RENAME_COMMITTED_RECONCILED"
      ? null
      : buildCurrent180Current190PostgresqlRenameDatabaseSql({
          fromDatabaseName,
          identityReceipt: initial.reconciliation.identityReceipt,
          toDatabaseName,
        });
  await appendAndAdvance(
    context,
    event,
    planDigest({
      fromDatabaseName,
      operation: "RENAME_DATABASE",
      statementSpecDigest: spec?.statementSpecDigest ?? null,
      toDatabaseName,
    }),
  );
  if (spec === null) return;
  for (let attempt = 1; attempt <= MAX_RECONCILIATION_ATTEMPTS; attempt += 1) {
    if (attempt <= MAX_EFFECT_ATTEMPTS) await executeStatement(context, spec);
    const current = await catalogSnapshot(
      context,
      context.state.ownershipIdentity,
    );
    const contractDecision =
      reconcileCurrent180Current190PostgresqlRehearsalRename({
        catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
        expectedIdentity: context.state.ownershipIdentity,
        fromDatabaseName,
        rows: catalogRowsForContract(current.rows),
        toDatabaseName,
      });
    if (contractDecision.decision === "RENAME_COMMITTED_RECONCILED") return;
    if (contractDecision.safeToRetry !== true) {
      fail("RUNNER_RENAME_RECONCILIATION_BLOCKED", [contractDecision.decision]);
    }
  }
  fail("RUNNER_RENAME_RECONCILIATION_BLOCKED", [
    "BOUNDED_RENAME_RECONCILIATION_EXHAUSTED",
  ]);
}

async function dropAndReconcile(context, event = "DROP_ISSUED") {
  const initial = await catalogSnapshot(
    context,
    context.state.ownershipIdentity,
  );
  const initialDecision = reconcileCurrent180Current190PostgresqlRehearsalDrop({
    catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
    expectedIdentity: context.state.ownershipIdentity,
    finalDatabaseName: context.names.finalDatabaseName,
    rows: catalogRowsForContract(initial.rows),
    workingDatabaseName: context.names.workingDatabaseName,
  });
  if (
    initialDecision.decision !== "DROP_COMMITTED_RECONCILED" &&
    (initialDecision.safeToRetry !== true ||
      initial.reconciliation.identityReceipt === null)
  ) {
    fail("RUNNER_DROP_RECONCILIATION_BLOCKED", [initialDecision.decision]);
  }
  const spec =
    initialDecision.decision === "DROP_COMMITTED_RECONCILED"
      ? null
      : buildCurrent180Current190PostgresqlDropDatabaseSql({
          databaseName: initial.reconciliation.identityReceipt.databaseName,
          identityReceipt: initial.reconciliation.identityReceipt,
        });
  await appendAndAdvance(
    context,
    event,
    planDigest({
      expectedIdentityDigest: context.state.ownershipIdentity.identityDigest,
      operation: "DROP_DATABASE",
      statementSpecDigest: spec?.statementSpecDigest ?? null,
    }),
  );
  if (spec === null) return;
  for (let attempt = 1; attempt <= MAX_RECONCILIATION_ATTEMPTS; attempt += 1) {
    if (attempt <= MAX_EFFECT_ATTEMPTS) await executeStatement(context, spec);
    const current = await catalogSnapshot(
      context,
      context.state.ownershipIdentity,
    );
    const decision = reconcileCurrent180Current190PostgresqlRehearsalDrop({
      catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
      expectedIdentity: context.state.ownershipIdentity,
      finalDatabaseName: context.names.finalDatabaseName,
      rows: catalogRowsForContract(current.rows),
      workingDatabaseName: context.names.workingDatabaseName,
    });
    if (decision.decision === "DROP_COMMITTED_RECONCILED") return;
    if (decision.safeToRetry !== true) {
      fail("RUNNER_DROP_RECONCILIATION_BLOCKED", [decision.decision]);
    }
  }
  fail("RUNNER_DROP_RECONCILIATION_BLOCKED", [
    "BOUNDED_DROP_RECONCILIATION_EXHAUSTED",
  ]);
}

async function releaseLock(context) {
  if (context.lockReceipt === null) return;
  const journalReceipt = await currentJournalVerification(context);
  let result;
  try {
    result = await context.adapter.releaseClusterLock(
      deepFreeze({
        journalRecordDigest: journalReceipt.lastRecordDigest,
        lockReceipt: context.lockReceipt,
        names: context.names,
        runToken: context.names.runToken,
      }),
    );
  } catch {
    fail("RUNNER_CLUSTER_LOCK_RELEASE_FAILED", [
      "TRUSTED_RUNTIME_LOCK_RELEASE_FAILED",
    ]);
  }
  if (!exactKeys(result, ["released"]) || result.released !== true) {
    fail("RUNNER_CLUSTER_LOCK_RELEASE_FAILED", [
      "EXACT_LOCK_RELEASE_RECEIPT_REQUIRED",
    ]);
  }
  context.lockReceipt = null;
}

async function runtimeCleanup(context, reason, expectedIdentity) {
  const journalReceipt = await currentJournalVerification(context);
  let result;
  try {
    result = await context.adapter.cleanup(
      deepFreeze({
        authorizationReceiptDigest:
          context.authorization.authorizationReceiptDigest,
        expectedIdentity,
        journalRecordDigest: journalReceipt.lastRecordDigest,
        names: context.names,
        reason,
        runToken: context.names.runToken,
      }),
    );
  } catch {
    fail("RUNNER_JANITOR_FAILED", ["TRUSTED_RUNTIME_JANITOR_FAILED"]);
  }
  if (
    !exactKeys(result, [
      "responseObserved",
      "runtimeResourcesReleased",
      "targetAbsentVerified",
    ]) ||
    typeof result.responseObserved !== "boolean" ||
    typeof result.runtimeResourcesReleased !== "boolean" ||
    typeof result.targetAbsentVerified !== "boolean"
  ) {
    fail("RUNNER_JANITOR_FAILED", ["EXACT_JANITOR_RECEIPT_REQUIRED"]);
  }
  return result;
}

async function janitorAfterFailure(context, originalError) {
  const noMutationCapableEffectCouldHaveStarted =
    context.databaseMutationAttempted === false &&
    context.lockReceipt === null &&
    (context.lockAttempted === false || context.lockProvenAbsent === true) &&
    originalError?.manualInspectionReceipt == null;
  if (noMutationCapableEffectCouldHaveStarted) {
    let ownResidueRemoved = false;
    try {
      if (context.materializationReceipt !== null) {
        await cleanupMaterializedArtifactForContext(context);
        context.materializationReceipt = null;
      }
      if (context.journal !== null) {
        await cleanupCurrent180Current190PostgresqlRehearsalJournal(
          context.journal,
        );
        context.journal = null;
      }
      ownResidueRemoved = true;
    } catch {
      ownResidueRemoved = false;
    }
    fail(
      originalError?.code ?? "RUNNER_PRE_EFFECT_ADMISSION_FAILED",
      [
        ...(originalError?.findings ?? ["PRE_EFFECT_ADMISSION_FAILED"]),
        ownResidueRemoved
          ? "ONLY_THIS_RUN_FRESH_PRE_EFFECT_RESIDUE_REMOVED"
          : "MANUAL_JANITOR_REQUIRED_FOR_THIS_RUN_FRESH_RESIDUE",
      ],
      ownResidueRemoved,
    );
  }
  let databaseClean = false;
  let preserveEvidence = false;
  let failedCleanTransitionPending = false;
  try {
    const expectedIdentity = context.state?.ownershipIdentity ?? null;
    const freshCatalog = await catalogSnapshot(context, expectedIdentity);
    if (freshCatalog.rows.length === 0) {
      databaseClean = true;
    } else if (expectedIdentity === null) {
      preserveEvidence = true;
    } else if (
      freshCatalog.rows.length !== 1 ||
      freshCatalog.reconciliation.decision !== "STRUCTURED_IDENTITY_VERIFIED" ||
      freshCatalog.reconciliation.identityReceipt === null ||
      freshCatalog.rows[0].databaseOid !== expectedIdentity.oid ||
      freshCatalog.rows[0].marker !== expectedIdentity.marker
    ) {
      preserveEvidence = true;
    } else {
      const transition =
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS.FAIL_WITH_OWNERSHIP;
      if (transition.from.includes(context.state.phase)) {
        const identityReceipt = freshCatalog.reconciliation.identityReceipt;
        const sealSpec = freshCatalog.rows[0].allowConnections
          ? buildCurrent180Current190PostgresqlAlterAllowConnectionsSql({
              allowConnections: false,
              identityReceipt,
            })
          : null;
        await appendAndAdvance(
          context,
          "FAIL_WITH_OWNERSHIP",
          planDigest({
            errorCode: originalError?.code ?? "UNCLASSIFIED_FAILURE",
            operation: "EXACT_OWNED_DATABASE_JANITOR",
            sealStatementSpecDigest: sealSpec?.statementSpecDigest ?? null,
          }),
        );
        if (sealSpec !== null) await executeStatement(context, sealSpec);
        await dropAndReconcile(context, "CLEANUP_DROP_ISSUED");
        await appendAndAdvance(
          context,
          "CLEANUP_ABSENCE_VERIFIED",
          planDigest({ targetAbsent: true }),
        );
        failedCleanTransitionPending = true;
        databaseClean = true;
      } else {
        preserveEvidence = true;
      }
    }
  } catch {
    databaseClean = false;
    preserveEvidence = true;
  }
  if (databaseClean && !preserveEvidence && context.databaseMutationAttempted) {
    try {
      if (!SHA256_PATTERN.test(String(context.sourceFingerprintBefore ?? ""))) {
        throw new Error("source fingerprint was not pinned before DB effects");
      }
      const sourceAfterJanitor = await collectSemanticFingerprint(
        context,
        sourceConnection(),
      );
      if (
        sourceAfterJanitor.fingerprintDigest !== context.sourceFingerprintBefore
      ) {
        throw new Error("source semantic fingerprint changed");
      }
      if (failedCleanTransitionPending) {
        await appendAndAdvance(
          context,
          "FAILED_CLEAN",
          planDigest({
            failedClean: true,
            sourceFingerprint: sourceAfterJanitor.fingerprintDigest,
          }),
        );
      }
    } catch {
      databaseClean = false;
      preserveEvidence = true;
    }
  }
  if (databaseClean && !preserveEvidence) {
    try {
      await releaseLock(context);
    } catch {
      databaseClean = false;
    }
  }
  if (databaseClean && !preserveEvidence) {
    try {
      const resources = await runtimeCleanup(
        context,
        "RELEASE_RUNTIME_RESOURCES_AFTER_FAILED_CLEAN",
        context.state?.ownershipIdentity ?? null,
      );
      databaseClean = resources.runtimeResourcesReleased;
    } catch {
      databaseClean = false;
    }
  }
  if (databaseClean && !preserveEvidence) {
    try {
      if (context.materializationReceipt !== null) {
        await cleanupMaterializedArtifactForContext(context);
        context.materializationReceipt = null;
      }
      await cleanupCurrent180Current190PostgresqlRehearsalJournal(
        context.journal,
      );
      context.journal = null;
    } catch {
      databaseClean = false;
    }
  }
  fail(
    originalError?.code ?? "RUNNER_REHEARSAL_FAILED",
    [
      ...(originalError?.findings ?? ["UNCLASSIFIED_REHEARSAL_FAILURE"]),
      databaseClean && !preserveEvidence
        ? "FAILED_CLEAN_ZERO_DATABASE_RESIDUE"
        : "MANUAL_JANITOR_REQUIRED_EVIDENCE_PRESERVED",
    ],
    databaseClean && !preserveEvidence,
  );
}

async function runInternal(
  input,
  adapter,
  coordinatorSigningAuthority,
  coordinatorVerificationAuthority,
  testOnlyCoordinator,
) {
  if (!exactKeys(input, ["attempt", "environment"])) {
    fail("RUNNER_INPUT_INVALID", ["EXACT_ATTEMPT_AND_ENVIRONMENT_REQUIRED"]);
  }
  if (
    !Number.isInteger(input.attempt) ||
    input.attempt < 1 ||
    input.attempt > 2
  ) {
    fail("RUNNER_INPUT_INVALID", ["ATTEMPT_ONE_OR_TWO_REQUIRED"]);
  }
  const environment = snapshotEnvironment(input.environment);
  const selectedAdapter = assertAdapter(adapter, testOnlyAdapters.has(adapter));
  const inspection =
    await inspectCurrent180Current190DisposableReleaseAssembly();
  if (inspection.verified !== true) {
    fail("RUNNER_ASSEMBLY_INSPECTION_BLOCKED", inspection.findings);
  }
  const artifact = await assembleCurrent180Current190InMemoryArtifact({
    allowContract: CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
    assemblyPlanDigest: inspection.assemblyPlanDigest,
  });
  const authorization =
    authorizeCurrent180Current190DisposablePostgresqlRehearsal({
      allowContract:
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT,
      assemblyReceipt: artifact,
      environment,
    });
  const signer = createCurrent180Current190PostgresqlRehearsalJournalSigner();
  const coordinatorRunBinding = testOnlyCoordinator
    ? await issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
        coordinatorSigningAuthority,
        {
          authorizationReceiptDigest: authorization.authorizationReceiptDigest,
          runToken: signer.runToken,
        },
      )
    : await issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding(
        coordinatorSigningAuthority,
        {
          authorizationReceiptDigest: authorization.authorizationReceiptDigest,
          runToken: signer.runToken,
        },
      );
  const journal = testOnlyCoordinator
    ? await bindCurrent180Current190PostgresqlRehearsalJournalForTestOnly(
        coordinatorSigningAuthority,
        coordinatorRunBinding,
        signer,
      )
    : await bindCurrent180Current190PostgresqlRehearsalJournal(
        coordinatorSigningAuthority,
        coordinatorVerificationAuthority,
        coordinatorRunBinding,
        signer,
      );
  const names = deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(
    journal.runToken,
  );
  const context = {
    adapter: selectedAdapter,
    artifact,
    attempt: input.attempt,
    auditDigests: [],
    authorization,
    coordinatorSigningAuthority,
    coordinatorVerificationAuthority,
    coordinatorRunBinding,
    databaseMutationAttempted: false,
    environment,
    executor: createExecutorAuthority(),
    journal,
    lockReceipt: null,
    lockAttempted: false,
    lockProvenAbsent: false,
    materializationReceipt: null,
    names,
    runtimeAttestation: null,
    sourceFingerprintBefore: null,
    state: createCurrent180Current190PostgresqlRehearsalState({
      authorizationReceipt: authorization,
      names,
    }),
    testOnlyCoordinator,
  };
  try {
    context.runtimeAttestation = await attestRuntime(context);
    await appendAndAdvance(
      context,
      "PREFLIGHT_ACCEPTED",
      planDigest({
        artifactDigest: artifact.inMemoryArtifactDigest,
        runtimeDigest: context.runtimeAttestation.runtimeDigest,
      }),
    );
    context.materializationReceipt =
      await materializeArtifactForContext(context);
    const materializerVerification =
      await verifyMaterializedArtifactForContext(context);
    await appendAndAdvance(
      context,
      "CLUSTER_LOCK_ACQUIRED",
      planDigest({
        materializerVerificationDigest:
          materializerVerification.verificationDigest,
        operation: "SESSION_ADVISORY_CLUSTER_LOCK_AND_SOURCE_PREFLIGHT",
      }),
    );
    const lockJournalReceipt = await currentJournalVerification(context);
    context.lockAttempted = true;
    let lockReceipt;
    try {
      lockReceipt = await context.adapter.acquireClusterLock(
        deepFreeze({
          authorizationReceiptDigest: authorization.authorizationReceiptDigest,
          journalRecordDigest: lockJournalReceipt.lastRecordDigest,
          names,
          runToken: names.runToken,
        }),
      );
    } catch (error) {
      if (error?.code === "RUNTIME_CLUSTER_LOCK_NOT_ACQUIRED") {
        context.lockProvenAbsent = true;
        fail("RUNNER_CLUSTER_LOCK_NOT_ACQUIRED", [
          "TRUSTED_RUNTIME_PROVED_CLUSTER_LOCK_EFFECT_ABSENT",
        ]);
      }
      fail("RUNNER_CLUSTER_LOCK_AMBIGUOUS", [
        "CLUSTER_LOCK_RESPONSE_OR_EFFECT_AMBIGUOUS_EVIDENCE_PRESERVED",
      ]);
    }
    if (lockReceipt === null || typeof lockReceipt !== "object") {
      fail("RUNNER_CLUSTER_LOCK_FAILED", [
        "DATA_ONLY_TRUSTED_RUNTIME_LOCK_RECEIPT_REQUIRED",
      ]);
    }
    if (isProxy(lockReceipt) || !Object.isFrozen(lockReceipt)) {
      fail("RUNNER_CLUSTER_LOCK_FAILED", [
        "FROZEN_NON_PROXY_TRUSTED_RUNTIME_LOCK_RECEIPT_REQUIRED",
      ]);
    }
    try {
      dataSnapshot(lockReceipt);
    } catch {
      fail("RUNNER_CLUSTER_LOCK_FAILED", [
        "FROZEN_DATA_ONLY_TRUSTED_RUNTIME_LOCK_RECEIPT_REQUIRED",
      ]);
    }
    context.lockReceipt = lockReceipt;
    const source = await collectSourcePreflight(context);
    context.sourceFingerprintBefore = source.fingerprint.fingerprintDigest;
    await appendAndAdvance(
      context,
      "SOURCE_PINNED",
      source.report.sourcePin.sourcePinDigest,
      { sourcePin: source.report.sourcePin },
    );
    await provisionOwnedWorkingDatabase(context);
    await setAllowConnections(
      context,
      names.workingDatabaseName,
      true,
      "WORKING_OPENED",
    );
    const apply = await deployAndReconcile(
      context,
      names.workingDatabaseName,
      "PRISMA_DEPLOY_ISSUED",
    );
    await appendAndAdvance(
      context,
      "APPLY_RECONCILED",
      apply.prefixEvidence.prefixEvidenceDigest,
      { prefixEvidence: apply.prefixEvidence },
    );
    await setAllowConnections(
      context,
      names.workingDatabaseName,
      false,
      "WORKING_SEALED",
    );
    await renameAndReconcile(
      context,
      names.workingDatabaseName,
      names.finalDatabaseName,
      "RENAME_ISSUED",
    );
    await appendAndAdvance(
      context,
      "RENAME_RECONCILED",
      context.state.ownershipIdentity.identityDigest,
    );
    await setAllowConnections(
      context,
      names.finalDatabaseName,
      true,
      "FINAL_OPENED",
    );
    const finalFingerprint = await collectSemanticFingerprint(
      context,
      targetConnection(names.finalDatabaseName, names),
    );
    await appendAndAdvance(
      context,
      "FINAL_FINGERPRINT_VERIFIED",
      finalFingerprint.fingerprintDigest,
    );
    const zeroDiff = await deployAndReconcile(
      context,
      names.finalDatabaseName,
      "ZERO_DIFF_DEPLOY_ISSUED",
    );
    const zeroDiffFingerprint = await collectSemanticFingerprint(
      context,
      targetConnection(names.finalDatabaseName, names),
    );
    if (
      zeroDiffFingerprint.fingerprintDigest !==
      finalFingerprint.fingerprintDigest
    ) {
      fail("RUNNER_ZERO_DIFF_BLOCKED", [
        "SECOND_DEPLOY_SEMANTIC_FINGERPRINT_CHANGED",
      ]);
    }
    await appendAndAdvance(
      context,
      "ZERO_DIFF_VERIFIED",
      zeroDiff.prefixEvidence.prefixEvidenceDigest,
      { prefixEvidence: zeroDiff.prefixEvidence },
    );
    await setAllowConnections(
      context,
      names.finalDatabaseName,
      false,
      "ROLLBACK_SEALED",
    );
    await renameAndReconcile(
      context,
      names.finalDatabaseName,
      names.workingDatabaseName,
      "ROLLBACK_RENAME_ISSUED",
    );
    await appendAndAdvance(
      context,
      "ROLLBACK_RENAME_RECONCILED",
      context.state.ownershipIdentity.identityDigest,
    );
    await dropAndReconcile(context);
    await appendAndAdvance(
      context,
      "ABSENCE_VERIFIED",
      planDigest({ targetAbsent: true }),
    );
    const sourceAfter = await collectSemanticFingerprint(
      context,
      sourceConnection(),
    );
    if (
      sourceAfter.fingerprintDigest !== source.fingerprint.fingerprintDigest
    ) {
      fail("RUNNER_SOURCE_ZERO_DIFF_BLOCKED", [
        "SOURCE_SEMANTIC_FINGERPRINT_CHANGED",
      ]);
    }
    await appendAndAdvance(
      context,
      "SOURCE_ZERO_DIFF_VERIFIED",
      sourceAfter.fingerprintDigest,
    );
    await appendAndAdvance(
      context,
      "COMPLETED",
      planDigest({
        artifactReceiptDigest: context.materializationReceipt.receiptDigest,
        cleanupReason: "COMPLETED_RELEASE_RUNTIME_RESOURCES",
        expectedIdentityDigest: context.state.ownershipIdentity.identityDigest,
        lockReceiptDigest: sha256(canonicalJson(context.lockReceipt)),
        sourceFingerprint: sourceAfter.fingerprintDigest,
      }),
    );
    const finalStateDigest = context.state.stateDigest;
    await releaseLock(context);
    const runtimeCleanupReceipt = await runtimeCleanup(
      context,
      "COMPLETED_RELEASE_RUNTIME_RESOURCES",
      context.state.ownershipIdentity,
    );
    if (
      runtimeCleanupReceipt.runtimeResourcesReleased !== true ||
      runtimeCleanupReceipt.targetAbsentVerified !== true
    ) {
      fail("RUNNER_FINAL_CLEANUP_BLOCKED", [
        "RUNTIME_RESOURCE_RELEASE_AND_TARGET_ABSENCE_REQUIRED",
      ]);
    }
    const artifactCleanup =
      await cleanupMaterializedArtifactForContext(context);
    context.materializationReceipt = null;
    const journalCleanup =
      await cleanupCurrent180Current190PostgresqlRehearsalJournal(
        context.journal,
      );
    context.journal = null;
    const result = {
      artifactRootAbsent: artifactCleanup.artifactRootAbsent,
      attempt: context.attempt,
      auditChainDigest: sha256(`${context.auditDigests.join(":")}\n`),
      authorizationReceiptDigest: authorization.authorizationReceiptDigest,
      contract:
        CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNNER_CONTRACT,
      coordinatorFingerprintSha256:
        context.coordinatorVerificationAuthority.publicKeyFingerprintSha256,
      executorKeyId: context.executor.executorKeyId,
      executorPublicKeySpkiDerBase64: context.executor.publicKeySpkiDerBase64,
      finalStateDigest,
      journalRootAbsent: journalCleanup.rootAbsent,
      runToken: names.runToken,
      runtimeDigest: context.runtimeAttestation.runtimeDigest,
      sourceFingerprint: sourceAfter.fingerprintDigest,
      status:
        "DISPOSABLE_POSTGRESQL_REHEARSAL_COMPLETED_ZERO_DIFF_ZERO_RESIDUE",
      targetAbsentVerified: runtimeCleanupReceipt.targetAbsentVerified,
      verified: true,
    };
    return deepFreeze({
      ...result,
      runnerReceiptDigest: sha256(canonicalJson(result)),
    });
  } catch (error) {
    return janitorAfterFailure(context, error);
  }
}

export async function runCurrent180Current190DisposablePostgresqlRehearsal(
  input,
) {
  if (
    arguments.length !== 1 ||
    !exactKeys(input, ["attempt", "coordinator", "environment"])
  ) {
    fail("RUNNER_INPUT_INVALID", [
      "EXACT_ATTEMPT_COORDINATOR_AND_ENVIRONMENT_REQUIRED",
    ]);
  }
  const environment = snapshotEnvironment(input.environment);
  const coordinator = deepFreeze(dataSnapshot(input.coordinator));
  const coordinatorVerification = deepFreeze({
    expectedPublicKeySha256: coordinator.expectedPublicKeySha256,
    publicKeyPath: coordinator.publicKeyPath,
  });
  const [
    adapter,
    coordinatorSigningAuthority,
    coordinatorVerificationAuthority,
  ] = await Promise.all([
    loadBuiltInAdapter(environment),
    loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority(
      coordinator,
    ),
    loadCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthority(
      coordinatorVerification,
    ),
  ]);
  return runInternal(
    { attempt: input.attempt, environment },
    adapter,
    coordinatorSigningAuthority,
    coordinatorVerificationAuthority,
    false,
  );
}

export async function runCurrent180Current190DisposablePostgresqlRehearsalForTestOnly(
  input,
  adapter,
) {
  if (arguments.length !== 2) {
    fail("RUNNER_TEST_INPUT_INVALID", [
      "EXACT_INPUT_AND_TEST_ADAPTER_REQUIRED",
    ]);
  }
  assertAdapter(adapter, true);
  const coordinatorAuthority =
    createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly();
  return runInternal(
    input,
    adapter,
    coordinatorAuthority,
    coordinatorAuthority,
    true,
  );
}

async function buildRecoveryPlanningAuthorization(environment) {
  const inspection =
    await inspectCurrent180Current190DisposableReleaseAssembly();
  if (inspection.verified !== true) {
    fail("RUNNER_RECOVERY_INSPECTION_BLOCKED", inspection.findings);
  }
  const artifact = await assembleCurrent180Current190InMemoryArtifact({
    allowContract: CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
    assemblyPlanDigest: inspection.assemblyPlanDigest,
  });
  const authorization =
    authorizeCurrent180Current190DisposablePostgresqlRehearsal({
      allowContract:
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT,
      assemblyReceipt: artifact,
      environment,
    });
  return { artifact, authorization };
}

function deriveRecoveryIdentity(context, rows) {
  if (rows.length !== 1) return null;
  const row = rows[0];
  if (
    row.ownerName !== OWNER_ROLE ||
    row.isTemplate !== false ||
    typeof row.marker !== "string"
  ) {
    return null;
  }
  for (const [index, marker] of ownershipMarkersForContext(context).entries()) {
    if (marker !== row.marker) continue;
    return buildCurrent180Current190PostgresqlRehearsalOwnershipIdentity({
      attempt: index + 1,
      authorizationReceiptDigest:
        context.authorization.authorizationReceiptDigest,
      oid: row.databaseOid,
      ownerName: row.ownerName,
      ownerOid: row.ownerOid,
      runToken: context.names.runToken,
    });
  }
  return null;
}

async function inspectRecoveryInternal(
  input,
  adapter,
  coordinatorVerificationAuthority,
  testOnlyCoordinator,
) {
  if (
    !exactKeys(input, [
      "environment",
      "journalLocator",
      "materializationRecoveryLocator",
    ])
  ) {
    fail("RUNNER_RECOVERY_INPUT_INVALID", [
      "EXACT_ENVIRONMENT_JOURNAL_AND_MATERIALIZATION_LOCATOR_REQUIRED",
    ]);
  }
  const environment = snapshotEnvironment(input.environment);
  const journalLocator = deepFreeze(dataSnapshot(input.journalLocator));
  const materializationRecoveryLocator =
    input.materializationRecoveryLocator === null
      ? null
      : deepFreeze(dataSnapshot(input.materializationRecoveryLocator));
  const { artifact, authorization } =
    await buildRecoveryPlanningAuthorization(environment);
  const journalReceipt = testOnlyCoordinator
    ? await verifyCurrent180Current190PostgresqlRehearsalJournalForTestOnly(
        coordinatorVerificationAuthority,
        journalLocator,
      )
    : await verifyCurrent180Current190PostgresqlRehearsalJournal(
        coordinatorVerificationAuthority,
        journalLocator,
      );
  if (testOnlyCoordinator) {
    assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceiptForTestOnly(
      journalReceipt,
    );
  } else {
    assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceipt(
      journalReceipt,
    );
  }
  if (
    journalReceipt.authorizationReceiptDigest !==
    authorization.authorizationReceiptDigest
  ) {
    fail("RUNNER_RECOVERY_AUTHORIZATION_MISMATCH", [
      "DURABLE_JOURNAL_MUST_BIND_EXACT_REBUILT_PLANNING_AUTHORIZATION",
    ]);
  }
  const names = deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(
    journalReceipt.runToken,
  );
  const executor = createExecutorAuthority();
  const context = {
    adapter,
    artifact,
    auditDigests: [],
    authorization,
    coordinatorVerificationAuthority,
    executor,
    journal: null,
    names,
    recoveryLocator: journalLocator,
    testOnlyCoordinator,
  };
  const materializationRecovery = await selectMaterializationRecoveryForContext(
    context,
    materializationRecoveryLocator,
  );
  let rawAttestation;
  try {
    rawAttestation = await adapter.attestExecutableRuntime(
      deepFreeze({
        authorizationReceiptDigest: authorization.authorizationReceiptDigest,
        journalRecordDigest: journalReceipt.lastRecordDigest,
        names,
        runToken: names.runToken,
      }),
    );
  } catch {
    fail("RUNNER_RECOVERY_INSPECTION_BLOCKED", [
      "TRUSTED_RUNTIME_RECOVERY_ATTESTATION_FAILED",
    ]);
  }
  const runtimeAttestation = validateRuntimeAttestation(
    rawAttestation,
    adapter.contract,
    false,
  );
  const catalog = await catalogSnapshot(context);
  const exactOwnershipIdentity = deriveRecoveryIdentity(context, catalog.rows);
  const targetState =
    catalog.rows.length === 0
      ? "TARGET_ABSENT"
      : exactOwnershipIdentity !== null
        ? "EXACT_MARKED_OWNED_TARGET_PRESENT"
        : "AMBIGUOUS_UNMARKED_OR_FOREIGN_TARGET_PRESENT";
  const signedSourceZeroDiffFingerprintDigest =
    journalReceipt.sourceZeroDiffFingerprintDigest ?? null;
  const sourceGlobalZeroDiffDurablyVerified =
    ["SOURCE_ZERO_DIFF_VERIFIED", "COMPLETED"].includes(
      journalReceipt.lastPhase,
    ) &&
    SHA256_PATTERN.test(String(signedSourceZeroDiffFingerprintDigest ?? ""));
  let currentSourceFingerprint = null;
  let sourceGlobalZeroDiffRecheckFailed = false;
  if (targetState === "TARGET_ABSENT" && sourceGlobalZeroDiffDurablyVerified) {
    try {
      currentSourceFingerprint = await collectSemanticFingerprint(
        context,
        sourceConnection(),
      );
    } catch {
      sourceGlobalZeroDiffRecheckFailed = true;
    }
  }
  const sourceGlobalZeroDiffCurrentlyVerified =
    sourceGlobalZeroDiffDurablyVerified &&
    currentSourceFingerprint?.fingerprintDigest ===
      signedSourceZeroDiffFingerprintDigest;
  const filesystemRestartCleanupAllowed =
    targetState === "TARGET_ABSENT" && sourceGlobalZeroDiffCurrentlyVerified;
  const recoveryRuntimeCleanup =
    targetState === "TARGET_ABSENT"
      ? await runtimeCleanup(
          context,
          "RELEASE_RUNTIME_RESOURCES_AFTER_FAILED_CLEAN",
          null,
        )
      : null;
  if (
    recoveryRuntimeCleanup !== null &&
    (recoveryRuntimeCleanup.runtimeResourcesReleased !== true ||
      recoveryRuntimeCleanup.targetAbsentVerified !== true)
  ) {
    fail("RUNNER_RECOVERY_RUNTIME_CLEANUP_INCOMPLETE", [
      "READ_ONLY_INSPECTION_RESOURCE_RELEASE_AND_TARGET_ABSENCE_REQUIRED",
    ]);
  }
  const materializationCleanup =
    filesystemRestartCleanupAllowed && materializationRecovery !== null
      ? await cleanupRecoveredMaterializationForContext(
          context,
          materializationRecovery,
        )
      : null;
  if (
    materializationCleanup !== null &&
    materializationCleanup.artifactRootAbsent !== true
  ) {
    fail("RUNNER_RECOVERY_MATERIALIZATION_CLEANUP_INCOMPLETE", [
      "SIGNED_RECOVERED_ARTIFACT_ROOT_ABSENCE_REQUIRED",
    ]);
  }
  const journalRecovery = filesystemRestartCleanupAllowed
    ? testOnlyCoordinator
      ? await rehydrateCurrent180Current190PostgresqlRehearsalJournalRecoveryForTestOnly(
          coordinatorVerificationAuthority,
          journalLocator,
        )
      : await rehydrateCurrent180Current190PostgresqlRehearsalJournalRecovery(
          coordinatorVerificationAuthority,
          journalLocator,
        )
    : null;
  const journalCleanup =
    journalRecovery === null
      ? null
      : testOnlyCoordinator
        ? await cleanupCurrent180Current190PostgresqlRehearsalJournalAfterRestartForTestOnly(
            journalRecovery,
          )
        : await cleanupCurrent180Current190PostgresqlRehearsalJournalAfterRestart(
            journalRecovery,
          );
  if (journalCleanup !== null && journalCleanup.rootAbsent !== true) {
    fail("RUNNER_RECOVERY_JOURNAL_CLEANUP_INCOMPLETE", [
      "COORDINATOR_SIGNED_JOURNAL_ROOT_ABSENCE_REQUIRED",
    ]);
  }
  const status =
    targetState === "TARGET_ABSENT"
      ? !sourceGlobalZeroDiffDurablyVerified
        ? "BLOCKED_MANUAL_SOURCE_GLOBAL_ZERO_DIFF_NOT_DURABLY_VERIFIED"
        : sourceGlobalZeroDiffRecheckFailed
          ? "BLOCKED_MANUAL_SOURCE_GLOBAL_ZERO_DIFF_RECHECK_FAILED"
          : sourceGlobalZeroDiffCurrentlyVerified
            ? "RECOVERED_ZERO_DATABASE_AND_SIGNED_FILESYSTEM_RESIDUE_NO_DATABASE_MUTATION"
            : "BLOCKED_MANUAL_SOURCE_GLOBAL_ZERO_DIFF_FINGERPRINT_MISMATCH"
      : targetState === "EXACT_MARKED_OWNED_TARGET_PRESENT"
        ? "BLOCKED_MANUAL_EFFECT_AUTHORITY_NOT_RESTORABLE"
        : "BLOCKED_MANUAL_AMBIGUOUS_OR_UNMARKED_TARGET";
  const requiredManualActions =
    targetState === "EXACT_MARKED_OWNED_TARGET_PRESENT"
      ? [
          "REVIEW_EXACT_NAME_OID_OWNER_MARKER_AND_ACTIVE_SESSION_EVIDENCE",
          "ISSUE_SEPARATE_HUMAN_APPROVED_RECOVERY_AUTHORITY",
          "DO_NOT_REUSE_THIS_PLAN_ONLY_RECEIPT_AS_EXECUTION_AUTHORITY",
        ]
      : targetState === "TARGET_ABSENT" &&
          !sourceGlobalZeroDiffCurrentlyVerified
        ? [
            "PRESERVE_DURABLE_JOURNAL_AND_FILESYSTEM_EVIDENCE",
            "INDEPENDENTLY_VERIFY_SOURCE_GLOBAL_ZERO_DIFF_BEFORE_CLEANUP",
            "DO_NOT_CLAIM_ZERO_RESIDUE_FROM_TARGET_ABSENCE_ALONE",
          ]
        : targetState === "TARGET_ABSENT"
          ? [
              "ARCHIVE_THE_SIGNED_RECOVERY_RECEIPT",
              "DO_NOT_REUSE_THIS_RECEIPT_AS_DATABASE_EFFECT_AUTHORITY",
            ]
          : [
              "PRESERVE_DURABLE_JOURNAL_AND_FILESYSTEM_EVIDENCE",
              "MANUAL_INSPECTION_REQUIRED",
              "DO_NOT_AUTOMATICALLY_MUTATE_ANY_DATABASE",
            ];
  const document = {
    authorizationReceiptDigest: authorization.authorizationReceiptDigest,
    automaticMutationAuthorized: false,
    catalogEvidenceDigest: catalog.reconciliation.catalogEvidenceDigest,
    contract:
      "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RECOVERY_ADMISSION_V1",
    coordinatorFingerprintSha256:
      coordinatorVerificationAuthority.publicKeyFingerprintSha256,
    durableJournalByteDigest: journalReceipt.byteDigest,
    durableJournalLastRecordDigest: journalReceipt.lastRecordDigest,
    currentSourceFingerprintDigest:
      currentSourceFingerprint?.fingerprintDigest ?? null,
    executorKeyId: executor.executorKeyId,
    executorPublicKeySpkiDerBase64: executor.publicKeySpkiDerBase64,
    exactOwnershipIdentity,
    filesystemRestartCleanupAllowed,
    journalLocatorDigest: journalLocator.locatorDigest,
    journalCleanupAttempted: journalCleanup !== null,
    journalCleanupReceiptDigest:
      journalCleanup === null ? null : sha256(canonicalJson(journalCleanup)),
    journalPhase: journalReceipt.lastPhase,
    journalRootAbsent: journalCleanup?.rootAbsent ?? false,
    journalSequence: journalReceipt.lastSequence,
    materializationArtifactRootAbsent:
      materializationCleanup?.artifactRootAbsent ?? false,
    materializationCleanupAttempted: materializationCleanup !== null,
    materializationCleanupReceiptDigest:
      materializationCleanup === null
        ? null
        : sha256(canonicalJson(materializationCleanup)),
    materializationEvidenceFound: materializationRecovery !== null,
    materializationRecoveryLocatorDigest:
      materializationRecovery?.locatorDigest ?? null,
    mutationAttempted: false,
    names,
    requiredManualActions,
    runtimeCrashRecoveryAdmission: runtimeAttestation.crashRecoveryAdmission,
    runtimeDigest: runtimeAttestation.runtimeDigest,
    runtimeResourcesReleased:
      recoveryRuntimeCleanup?.runtimeResourcesReleased ?? false,
    sourceGlobalZeroDiffDurablyVerified,
    sourceGlobalZeroDiffCurrentlyVerified,
    sourceGlobalZeroDiffRecheckFailed,
    sourceZeroDiffFingerprintDigest: signedSourceZeroDiffFingerprintDigest,
    status,
    targetRowsDigest: sha256(canonicalJson(catalog.rows)),
    targetState,
    verified: true,
  };
  const signatureBase64 = signExecutorDocument(executor, document);
  const receipt = deepFreeze({
    ...document,
    signatureBase64,
    recoveryAdmissionReceiptDigest: sha256(
      canonicalJson({ ...document, signatureBase64 }),
    ),
  });
  recoveryAdmissionReceipts.set(receipt, { publicKey: executor.publicKey });
  return receipt;
}

export function assertCurrent180Current190DisposablePostgresqlRehearsalRecoveryAdmissionReceipt(
  receipt,
) {
  if (arguments.length !== 1 || isProxy(receipt)) {
    fail("RUNNER_RECOVERY_RECEIPT_INVALID", [
      "MODULE_BRANDED_SIGNED_RECOVERY_RECEIPT_REQUIRED",
    ]);
  }
  const state = recoveryAdmissionReceipts.get(receipt);
  if (state === undefined) {
    fail("RUNNER_RECOVERY_RECEIPT_INVALID", [
      "MODULE_BRANDED_SIGNED_RECOVERY_RECEIPT_REQUIRED",
    ]);
  }
  const document = { ...receipt };
  delete document.recoveryAdmissionReceiptDigest;
  delete document.signatureBase64;
  const expectedDigest = sha256(
    canonicalJson({ ...document, signatureBase64: receipt.signatureBase64 }),
  );
  const bytes = Buffer.from(
    `LEETPLUS_CURRENT180_CURRENT190_EXECUTOR_AUTHORITY_V1\n${canonicalJson(document)}`,
    "utf8",
  );
  if (
    expectedDigest !== receipt.recoveryAdmissionReceiptDigest ||
    !verify(
      null,
      bytes,
      state.publicKey,
      Buffer.from(receipt.signatureBase64, "base64"),
    ) ||
    receipt.automaticMutationAuthorized !== false ||
    receipt.mutationAttempted !== false ||
    (!receipt.status.startsWith("BLOCKED_MANUAL_") &&
      receipt.status !==
        "RECOVERED_ZERO_DATABASE_AND_SIGNED_FILESYSTEM_RESIDUE_NO_DATABASE_MUTATION")
  ) {
    fail("RUNNER_RECOVERY_RECEIPT_INVALID", [
      "SIGNED_PLAN_ONLY_RECOVERY_RECEIPT_INTEGRITY_MISMATCH",
    ]);
  }
  return receipt;
}

export async function inspectCurrent180Current190DisposablePostgresqlRehearsalRecoveryForManualJanitor(
  input,
) {
  if (
    arguments.length !== 1 ||
    !exactKeys(input, [
      "coordinator",
      "environment",
      "journalLocator",
      "materializationRecoveryLocator",
    ])
  ) {
    fail("RUNNER_RECOVERY_INPUT_INVALID", [
      "EXACT_COORDINATOR_ENVIRONMENT_AND_DURABLE_LOCATOR_REQUIRED",
    ]);
  }
  const environment = snapshotEnvironment(input.environment);
  const coordinator = deepFreeze(dataSnapshot(input.coordinator));
  const coordinatorVerification = deepFreeze({
    expectedPublicKeySha256: coordinator.expectedPublicKeySha256,
    publicKeyPath: coordinator.publicKeyPath,
  });
  const [adapter, coordinatorVerificationAuthority] = await Promise.all([
    loadBuiltInAdapter(environment),
    loadCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthority(
      coordinatorVerification,
    ),
  ]);
  return inspectRecoveryInternal(
    {
      environment,
      journalLocator: input.journalLocator,
      materializationRecoveryLocator: input.materializationRecoveryLocator,
    },
    adapter,
    coordinatorVerificationAuthority,
    false,
  );
}

export async function inspectCurrent180Current190DisposablePostgresqlRehearsalRecoveryForManualJanitorForTestOnly(
  input,
  adapter,
) {
  if (arguments.length !== 2) {
    fail("RUNNER_RECOVERY_TEST_INPUT_INVALID", [
      "EXACT_INPUT_AND_TEST_ADAPTER_REQUIRED",
    ]);
  }
  assertAdapter(adapter, true);
  if (
    !exactKeys(input, [
      "coordinatorAuthority",
      "environment",
      "journalLocator",
      "materializationRecoveryLocator",
    ])
  ) {
    fail("RUNNER_RECOVERY_TEST_INPUT_INVALID", [
      "EXACT_TEST_COORDINATOR_ENVIRONMENT_AND_LOCATOR_REQUIRED",
    ]);
  }
  return inspectRecoveryInternal(
    {
      environment: input.environment,
      journalLocator: input.journalLocator,
      materializationRecoveryLocator: input.materializationRecoveryLocator,
    },
    adapter,
    input.coordinatorAuthority,
    true,
  );
}
