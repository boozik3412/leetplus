import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionValidDigest,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import { current187DdlFenceAttestationInventoryBinding } from "./identity-mail-ddl-fence-attestation-current187-authority.mjs";

export const CURRENT187_CLUSTER_INVENTORY_SLICE =
  "CURRENT187_B_PURE_CLUSTER_INVENTORY_PLANNER_ONLY";
export const CURRENT187_CLUSTER_INVENTORY_KIND =
  "CURRENT187_CLUSTER_INVENTORY_PLAN_REQUEST";
export const CURRENT187_CLUSTER_INVENTORY_PROFILE =
  "CURRENT187_PRE_GREEN_PURE_CLUSTER_INVENTORY_PLANNER_V1";
export const CURRENT187_CLUSTER_INVENTORY_RECEIPT_KIND =
  "CURRENT187_CLUSTER_INVENTORY_DENY_ONLY_RECEIPT";

export const CURRENT187_CLUSTER_IDENTITY_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CLUSTER_IDENTITY_V1";
export const CURRENT187_DATABASE_UNIVERSE_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_DATABASE_UNIVERSE_V1";
export const CURRENT187_NON_TEMPLATE_ALLOWLIST_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_NON_TEMPLATE_ALLOWLIST_V1";
export const CURRENT187_TEMPLATE_BASELINE_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_TEMPLATE_BASELINE_V1";
export const CURRENT187_PER_DATABASE_SCAN_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_PER_DATABASE_SCAN_SET_V1";
export const CURRENT187_CLUSTER_INVENTORY_PLAN_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CLUSTER_INVENTORY_PLAN_V1";
export const CURRENT187_CLUSTER_CATALOG_SNAPSHOT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CLUSTER_CATALOG_SNAPSHOT_V1";
export const CURRENT187_DDL_FENCE_STATE_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_DDL_FENCE_STATE_V1";
export const CURRENT187_PER_DATABASE_CATALOG_POLICY_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_PER_DATABASE_CATALOG_POLICY_V1";
export const CURRENT187_ROLE_BINDINGS_POLICY_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_ROLE_BINDINGS_POLICY_V1";
export const CURRENT187_CURRENT_ACL_POLICY_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CURRENT_ACL_POLICY_V1";
export const CURRENT187_DEFAULT_ACL_POLICY_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_DEFAULT_ACL_POLICY_V1";
export const CURRENT187_CLUSTER_CATALOG_POLICY_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CLUSTER_CATALOG_POLICY_V1";
export const CURRENT187_SEMANTIC_RISK_FACTS_POLICY_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CLUSTER_SEMANTIC_RISK_FACTS_POLICY_V1";

export const CURRENT187_CLUSTER_INVENTORY_MAX_FENCE_LIFETIME_MS =
  30 * 60 * 1_000;
export const CURRENT187_CLUSTER_INVENTORY_MAX_DATABASES = 1_024;

const REQUEST_KEYS = [
  "clusterIdentity",
  "contract",
  "ddlFence",
  "environment",
  "evaluatedAt",
  "expectedCatalog",
  "finalCatalogSnapshot",
  "initialCatalogSnapshot",
  "kind",
  "perDatabaseScans",
  "profile",
  "schemaVersion",
  "slice",
];

const CLUSTER_IDENTITY_KEYS = [
  "catalogVersionNo",
  "controlVersion",
  "endpointDigest",
  "serverVersionNum",
  "systemIdentifier",
  "topologyDigest",
];

const DDL_FENCE_KEYS = [
  "active",
  "clusterDdlBlocked",
  "creatorPrincipalsDisabled",
  "databaseDdlBlocked",
  "evidenceDigest",
  "fenceEpoch",
  "migrationPrincipalsDisabled",
  "validFrom",
  "validUntil",
];

const EXPECTED_CATALOG_KEYS = [
  "catalogRowsComplete",
  "nonTemplateDatabases",
  "templateDatabases",
];

const DATABASE_KEYS = [
  "collate",
  "connectionLimit",
  "ctype",
  "datallowconn",
  "encoding",
  "isTemplate",
  "localeProvider",
  "name",
  "oid",
  "ownerName",
  "ownerOid",
];

const SNAPSHOT_KEYS = [
  "capturedAt",
  "catalogRowsComplete",
  "clusterIdentityDigest",
  "databases",
  "ddlFenceDigest",
  "snapshotKind",
];

const PER_DATABASE_SCAN_KEYS = [
  "catalogDigest",
  "catalogSurfaceStatus",
  "clusterIdentityDigest",
  "completedAt",
  "connectionStatus",
  "currentAclPolicyDigest",
  "databaseIdentityDigest",
  "databaseName",
  "databaseOid",
  "defaultAclPolicyDigest",
  "ddlFenceDigest",
  "roleBindingsDigest",
  "scanEvidenceDigest",
  "semanticRiskFactsDigest",
  "semanticRiskFactsStatus",
  "startedAt",
];

const SAFE_IDENTIFIER_PATTERN = /^[^\u0000-\u001f\u007f]{1,63}$/u;
const SYSTEM_IDENTIFIER_PATTERN = /^[1-9][0-9]{0,19}$/u;
const POSITIVE_EPOCH_PATTERN = /^[1-9][0-9]{0,18}$/u;
const LOCALE_PROVIDER_PATTERN = /^(?:builtin|icu|libc)$/u;
const SAFE_CATALOG_TEXT_PATTERN = /^[^\u0000-\u001f\u007f]+$/u;
const VERIFIED_CURRENT187_CLUSTER_INVENTORY_RECEIPTS = new WeakSet();

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactDataArray(value, reasonCode, message) {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) {
    current187AdmissionFail(reasonCode, message);
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    current187AdmissionFail(reasonCode, message);
  }
  const declaredLength = descriptors.length?.value;
  if (
    !Number.isSafeInteger(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > CURRENT187_CLUSTER_INVENTORY_MAX_DATABASES
  ) {
    current187AdmissionFail(reasonCode, message);
  }
  const expectedKeys = [
    ...Array.from({ length: declaredLength }, (_, index) => String(index)),
    "length",
  ].sort(compareStrings);
  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.some((key) => typeof key !== "string")) {
    current187AdmissionFail(reasonCode, message);
  }
  actualKeys.sort(compareStrings);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    descriptors.length?.enumerable !== false ||
    expectedKeys
      .filter((key) => key !== "length")
      .some((key) => {
        const descriptor = descriptors[key];
        return (
          !descriptor ||
          !Object.hasOwn(descriptor, "value") ||
          descriptor.enumerable !== true
        );
      })
  ) {
    current187AdmissionFail(reasonCode, message);
  }
  return Object.freeze(
    Array.from(
      { length: declaredLength },
      (_, index) => descriptors[index].value,
    ),
  );
}

function canonicalIsoEpoch(value, reasonCode, label) {
  if (typeof value !== "string") {
    current187AdmissionFail(reasonCode, `${label} must be a UTC timestamp.`);
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    current187AdmissionFail(reasonCode, `${label} must be a UTC timestamp.`);
  }
  return epoch;
}

function validIdentifier(value) {
  return (
    typeof value === "string" &&
    SAFE_IDENTIFIER_PATTERN.test(value) &&
    Buffer.byteLength(value, "utf8") <= 63
  );
}

function validCatalogText(value, maxLength) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maxLength &&
    SAFE_CATALOG_TEXT_PATTERN.test(value)
  );
}

function digestCurrent187Value(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
}

function databaseIdentityKey(database) {
  return `${database.name}\u0000${database.oid}`;
}

function databaseSort(left, right) {
  return (
    compareStrings(left.name, right.name) ||
    left.oid - right.oid ||
    left.ownerOid - right.ownerOid
  );
}

export function normalizeCurrent187DatabaseIdentity(
  value,
  reasonCode = "CURRENT187_CLUSTER_INVENTORY_DATABASE_IDENTITY_INVALID",
) {
  const database = current187AdmissionExactDataRecord(
    value,
    DATABASE_KEYS,
    reasonCode,
    "A CURRENT187 database catalog row must be exact and data-only.",
  );
  if (
    !validIdentifier(database.name) ||
    !validIdentifier(database.ownerName) ||
    !Number.isSafeInteger(database.oid) ||
    database.oid < 1 ||
    database.oid > 4_294_967_295 ||
    !Number.isSafeInteger(database.ownerOid) ||
    database.ownerOid < 1 ||
    database.ownerOid > 4_294_967_295 ||
    typeof database.datallowconn !== "boolean" ||
    !Number.isSafeInteger(database.connectionLimit) ||
    database.connectionLimit < -1 ||
    !validCatalogText(database.encoding, 32) ||
    !LOCALE_PROVIDER_PATTERN.test(database.localeProvider) ||
    !validCatalogText(database.collate, 128) ||
    !validCatalogText(database.ctype, 128) ||
    typeof database.isTemplate !== "boolean"
  ) {
    current187AdmissionFail(
      reasonCode,
      "A CURRENT187 database identity contains an invalid bounded value.",
    );
  }
  return Object.freeze({ ...database });
}

function normalizeUniqueDatabaseArray(value, reasonCode, expectedTemplate) {
  const rows = exactDataArray(
    value,
    reasonCode,
    "A CURRENT187 database catalog projection must be a dense data-only array.",
  ).map((entry) => normalizeCurrent187DatabaseIdentity(entry, reasonCode));
  const identities = new Set();
  const names = new Set();
  const oids = new Set();
  for (const row of rows) {
    if (
      (expectedTemplate !== undefined && row.isTemplate !== expectedTemplate) ||
      identities.has(databaseIdentityKey(row)) ||
      names.has(row.name) ||
      oids.has(row.oid)
    ) {
      current187AdmissionFail(
        reasonCode,
        "A CURRENT187 database catalog projection is ambiguous or duplicated.",
      );
    }
    identities.add(databaseIdentityKey(row));
    names.add(row.name);
    oids.add(row.oid);
  }
  return Object.freeze([...rows].sort(databaseSort));
}

function assertNoCrossPartitionDuplicates(nonTemplates, templates, reasonCode) {
  const names = new Set(nonTemplates.map((database) => database.name));
  const oids = new Set(nonTemplates.map((database) => database.oid));
  if (
    templates.some(
      (database) => names.has(database.name) || oids.has(database.oid),
    )
  ) {
    current187AdmissionFail(
      reasonCode,
      "Template and non-template database baselines overlap.",
    );
  }
}

export function normalizeCurrent187ClusterIdentity(value) {
  const identity = current187AdmissionExactDataRecord(
    value,
    CLUSTER_IDENTITY_KEYS,
    "CURRENT187_CLUSTER_INVENTORY_CLUSTER_IDENTITY_INVALID",
    "The CURRENT187 cluster identity must be exact and data-only.",
  );
  let systemIdentifier;
  try {
    systemIdentifier = BigInt(identity.systemIdentifier);
  } catch {
    systemIdentifier = 0n;
  }
  if (
    typeof identity.systemIdentifier !== "string" ||
    !SYSTEM_IDENTIFIER_PATTERN.test(identity.systemIdentifier) ||
    systemIdentifier > 18_446_744_073_709_551_615n ||
    !Number.isSafeInteger(identity.serverVersionNum) ||
    identity.serverVersionNum < 100_000 ||
    identity.serverVersionNum > 999_999 ||
    !Number.isSafeInteger(identity.catalogVersionNo) ||
    identity.catalogVersionNo < 1 ||
    !Number.isSafeInteger(identity.controlVersion) ||
    identity.controlVersion < 1 ||
    !current187AdmissionValidDigest(identity.topologyDigest) ||
    !current187AdmissionValidDigest(identity.endpointDigest)
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_CLUSTER_IDENTITY_INVALID",
      "The CURRENT187 cluster identity contains an invalid bounded value.",
    );
  }
  return Object.freeze({ ...identity });
}

export function normalizeCurrent187DdlFence(value) {
  const fence = current187AdmissionExactDataRecord(
    value,
    DDL_FENCE_KEYS,
    "CURRENT187_CLUSTER_INVENTORY_DDL_FENCE_INVALID",
    "The CURRENT187 DDL fence declaration must be exact and data-only.",
  );
  if (
    typeof fence.fenceEpoch !== "string" ||
    !POSITIVE_EPOCH_PATTERN.test(fence.fenceEpoch) ||
    !current187AdmissionValidDigest(fence.evidenceDigest) ||
    [
      fence.active,
      fence.clusterDdlBlocked,
      fence.creatorPrincipalsDisabled,
      fence.databaseDdlBlocked,
      fence.migrationPrincipalsDisabled,
    ].some((entry) => typeof entry !== "boolean")
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_DDL_FENCE_INVALID",
      "The CURRENT187 DDL fence declaration contains an invalid value.",
    );
  }
  const validFromMs = canonicalIsoEpoch(
    fence.validFrom,
    "CURRENT187_CLUSTER_INVENTORY_DDL_FENCE_INVALID",
    "DDL fence start",
  );
  const validUntilMs = canonicalIsoEpoch(
    fence.validUntil,
    "CURRENT187_CLUSTER_INVENTORY_DDL_FENCE_INVALID",
    "DDL fence end",
  );
  if (
    validUntilMs <= validFromMs ||
    validUntilMs - validFromMs >
      CURRENT187_CLUSTER_INVENTORY_MAX_FENCE_LIFETIME_MS
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_DDL_FENCE_INVALID",
      "The CURRENT187 DDL fence window is invalid or unbounded.",
    );
  }
  return Object.freeze({ ...fence, validFromMs, validUntilMs });
}

export function normalizeCurrent187ExpectedDatabaseCatalog(value) {
  const expected = current187AdmissionExactDataRecord(
    value,
    EXPECTED_CATALOG_KEYS,
    "CURRENT187_CLUSTER_INVENTORY_EXPECTED_CATALOG_INVALID",
    "The CURRENT187 expected database catalog must be exact and data-only.",
  );
  const nonTemplateDatabases = normalizeUniqueDatabaseArray(
    expected.nonTemplateDatabases,
    "CURRENT187_CLUSTER_INVENTORY_EXPECTED_CATALOG_INVALID",
    false,
  );
  const templateDatabases = normalizeUniqueDatabaseArray(
    expected.templateDatabases,
    "CURRENT187_CLUSTER_INVENTORY_EXPECTED_CATALOG_INVALID",
    true,
  );
  assertNoCrossPartitionDuplicates(
    nonTemplateDatabases,
    templateDatabases,
    "CURRENT187_CLUSTER_INVENTORY_EXPECTED_CATALOG_INVALID",
  );
  if (
    expected.catalogRowsComplete !== true ||
    nonTemplateDatabases.length === 0 ||
    templateDatabases.length === 0 ||
    nonTemplateDatabases.length + templateDatabases.length >
      CURRENT187_CLUSTER_INVENTORY_MAX_DATABASES ||
    !nonTemplateDatabases.some((database) => database.name === "postgres")
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_EXPECTED_CATALOG_INVALID",
      "The CURRENT187 expected catalog is not an exhaustive explicit baseline.",
    );
  }
  return current187AdmissionDeepFreeze({
    catalogRowsComplete: true,
    nonTemplateDatabases,
    templateDatabases,
  });
}

function normalizeSnapshot(value, expectedKind) {
  const snapshot = current187AdmissionExactDataRecord(
    value,
    SNAPSHOT_KEYS,
    "CURRENT187_CLUSTER_INVENTORY_SNAPSHOT_INVALID",
    "A CURRENT187 cluster snapshot must be exact and data-only.",
  );
  const databases = normalizeUniqueDatabaseArray(
    snapshot.databases,
    "CURRENT187_CLUSTER_INVENTORY_SNAPSHOT_INVALID",
  );
  if (
    snapshot.snapshotKind !== expectedKind ||
    typeof snapshot.catalogRowsComplete !== "boolean" ||
    !current187AdmissionValidDigest(snapshot.clusterIdentityDigest) ||
    !current187AdmissionValidDigest(snapshot.ddlFenceDigest) ||
    databases.length === 0
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_SNAPSHOT_INVALID",
      "A CURRENT187 cluster snapshot contains an invalid bounded value.",
    );
  }
  const capturedAtMs = canonicalIsoEpoch(
    snapshot.capturedAt,
    "CURRENT187_CLUSTER_INVENTORY_SNAPSHOT_INVALID",
    "Cluster snapshot time",
  );
  return current187AdmissionDeepFreeze({
    ...snapshot,
    capturedAtMs,
    databases,
  });
}

function normalizePerDatabaseScan(value) {
  const scan = current187AdmissionExactDataRecord(
    value,
    PER_DATABASE_SCAN_KEYS,
    "CURRENT187_CLUSTER_INVENTORY_SCAN_INVALID",
    "A CURRENT187 per-database scan declaration must be exact and data-only.",
  );
  if (
    !validIdentifier(scan.databaseName) ||
    !Number.isSafeInteger(scan.databaseOid) ||
    scan.databaseOid < 1 ||
    scan.databaseOid > 4_294_967_295 ||
    !current187AdmissionValidDigest(scan.databaseIdentityDigest) ||
    !current187AdmissionValidDigest(scan.clusterIdentityDigest) ||
    !current187AdmissionValidDigest(scan.ddlFenceDigest) ||
    !current187AdmissionValidDigest(scan.scanEvidenceDigest) ||
    !["CONNECTED", "NON_CONNECTABLE_PROVEN"].includes(scan.connectionStatus) ||
    !["COMPLETE", "NOT_READ_NON_CONNECTABLE_ALLOWLIST"].includes(
      scan.catalogSurfaceStatus,
    ) ||
    (scan.catalogDigest !== null &&
      !current187AdmissionValidDigest(scan.catalogDigest)) ||
    (scan.currentAclPolicyDigest !== null &&
      !current187AdmissionValidDigest(scan.currentAclPolicyDigest)) ||
    (scan.defaultAclPolicyDigest !== null &&
      !current187AdmissionValidDigest(scan.defaultAclPolicyDigest)) ||
    (scan.roleBindingsDigest !== null &&
      !current187AdmissionValidDigest(scan.roleBindingsDigest)) ||
    (scan.semanticRiskFactsDigest !== null &&
      !current187AdmissionValidDigest(scan.semanticRiskFactsDigest)) ||
    ![
      "FACTS_EXTRACTED_DENY_ONLY",
      "NOT_EXTRACTED_NON_CONNECTABLE_ALLOWLIST",
    ].includes(scan.semanticRiskFactsStatus) ||
    (scan.connectionStatus === "CONNECTED" &&
      (!current187AdmissionValidDigest(scan.catalogDigest) ||
        !current187AdmissionValidDigest(scan.currentAclPolicyDigest) ||
        !current187AdmissionValidDigest(scan.defaultAclPolicyDigest) ||
        !current187AdmissionValidDigest(scan.roleBindingsDigest) ||
        !current187AdmissionValidDigest(scan.semanticRiskFactsDigest) ||
        scan.semanticRiskFactsStatus !== "FACTS_EXTRACTED_DENY_ONLY")) ||
    (scan.connectionStatus === "NON_CONNECTABLE_PROVEN" &&
      (scan.catalogDigest !== null ||
        scan.currentAclPolicyDigest !== null ||
        scan.defaultAclPolicyDigest !== null ||
        scan.roleBindingsDigest !== null ||
        scan.semanticRiskFactsDigest !== null ||
        scan.semanticRiskFactsStatus !==
          "NOT_EXTRACTED_NON_CONNECTABLE_ALLOWLIST"))
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_SCAN_INVALID",
      "A CURRENT187 per-database scan declaration contains an invalid value.",
    );
  }
  const startedAtMs = canonicalIsoEpoch(
    scan.startedAt,
    "CURRENT187_CLUSTER_INVENTORY_SCAN_INVALID",
    "Per-database scan start",
  );
  const completedAtMs = canonicalIsoEpoch(
    scan.completedAt,
    "CURRENT187_CLUSTER_INVENTORY_SCAN_INVALID",
    "Per-database scan end",
  );
  if (completedAtMs < startedAtMs) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_SCAN_INVALID",
      "A CURRENT187 per-database scan has an invalid timeline.",
    );
  }
  return current187AdmissionDeepFreeze({
    ...scan,
    completedAtMs,
    startedAtMs,
  });
}

function normalizePerDatabaseScans(value) {
  const scans = exactDataArray(
    value,
    "CURRENT187_CLUSTER_INVENTORY_SCANS_INVALID",
    "CURRENT187 per-database scans must be a dense data-only array.",
  ).map(normalizePerDatabaseScan);
  const identities = new Set();
  const names = new Set();
  const oids = new Set();
  for (const scan of scans) {
    const identity = `${scan.databaseName}\u0000${scan.databaseOid}`;
    if (
      identities.has(identity) ||
      names.has(scan.databaseName) ||
      oids.has(scan.databaseOid)
    ) {
      current187AdmissionFail(
        "CURRENT187_CLUSTER_INVENTORY_SCANS_INVALID",
        "CURRENT187 per-database scan identities are ambiguous or duplicated.",
      );
    }
    identities.add(identity);
    names.add(scan.databaseName);
    oids.add(scan.databaseOid);
  }
  return Object.freeze(
    [...scans].sort((left, right) =>
      compareStrings(left.databaseName, right.databaseName),
    ),
  );
}

function databaseProjection(database) {
  return Object.freeze(
    Object.fromEntries(DATABASE_KEYS.map((key) => [key, database[key]])),
  );
}

function snapshotDatabaseProjection(snapshot) {
  return Object.freeze(snapshot.databases.map(databaseProjection));
}

function expectedUniverseProjection(expectedCatalog) {
  return Object.freeze(
    [
      ...expectedCatalog.nonTemplateDatabases,
      ...expectedCatalog.templateDatabases,
    ]
      .sort(databaseSort)
      .map(databaseProjection),
  );
}

function sameCanonical(left, right) {
  return (
    current187AdmissionCanonicalJson(left) ===
    current187AdmissionCanonicalJson(right)
  );
}

export function current187DatabaseIdentityDigest(databaseValue) {
  const database = normalizeCurrent187DatabaseIdentity(databaseValue);
  return digestCurrent187Value(
    CURRENT187_DATABASE_UNIVERSE_DIGEST_DOMAIN,
    databaseProjection(database),
  );
}

export function current187ClusterIdentityDigest(identityValue) {
  const identity = normalizeCurrent187ClusterIdentity(identityValue);
  return digestCurrent187Value(
    CURRENT187_CLUSTER_IDENTITY_DIGEST_DOMAIN,
    identity,
  );
}

function collectInventoryReasons({
  clusterIdentityDigest,
  ddlFence,
  evaluatedAtMs,
  expectedCatalog,
  finalSnapshot,
  initialSnapshot,
  scans,
}) {
  const reasons = new Set();
  const expectedUniverse = expectedUniverseProjection(expectedCatalog);
  const initialUniverse = snapshotDatabaseProjection(initialSnapshot);
  const finalUniverse = snapshotDatabaseProjection(finalSnapshot);
  const expectedIdentities = new Set(
    expectedCatalog.nonTemplateDatabases.map(databaseIdentityKey),
  );
  const expectedAllIdentities = new Set(
    expectedUniverse.map(databaseIdentityKey),
  );
  const initialIdentities = new Set(initialUniverse.map(databaseIdentityKey));
  const finalIdentities = new Set(finalUniverse.map(databaseIdentityKey));

  if (
    initialSnapshot.catalogRowsComplete !== true ||
    finalSnapshot.catalogRowsComplete !== true
  ) {
    reasons.add("CURRENT187_CLUSTER_INVENTORY_PARTIAL_CLUSTER_SNAPSHOT");
  }
  if (
    initialSnapshot.clusterIdentityDigest !== clusterIdentityDigest ||
    finalSnapshot.clusterIdentityDigest !== clusterIdentityDigest
  ) {
    reasons.add("CURRENT187_CLUSTER_INVENTORY_CLUSTER_IDENTITY_MISMATCH");
  }
  if (
    initialSnapshot.ddlFenceDigest !== ddlFence.evidenceDigest ||
    finalSnapshot.ddlFenceDigest !== ddlFence.evidenceDigest ||
    ddlFence.active !== true ||
    ddlFence.clusterDdlBlocked !== true ||
    ddlFence.creatorPrincipalsDisabled !== true ||
    ddlFence.databaseDdlBlocked !== true ||
    ddlFence.migrationPrincipalsDisabled !== true ||
    initialSnapshot.capturedAtMs < ddlFence.validFromMs ||
    finalSnapshot.capturedAtMs < initialSnapshot.capturedAtMs ||
    finalSnapshot.capturedAtMs > ddlFence.validUntilMs ||
    evaluatedAtMs < finalSnapshot.capturedAtMs ||
    evaluatedAtMs >= ddlFence.validUntilMs
  ) {
    reasons.add("CURRENT187_CLUSTER_INVENTORY_DDL_FENCE_OR_TIMELINE_INVALID");
  }
  if (!sameCanonical(initialUniverse, finalUniverse)) {
    reasons.add("CURRENT187_CLUSTER_INVENTORY_CONCURRENT_CATALOG_DRIFT");
  }
  if (
    !sameCanonical(expectedUniverse, initialUniverse) ||
    !sameCanonical(expectedUniverse, finalUniverse)
  ) {
    reasons.add("CURRENT187_CLUSTER_INVENTORY_EXPECTED_BASELINE_MISMATCH");
  }
  if (
    [...initialIdentities, ...finalIdentities].some(
      (identity) => !expectedAllIdentities.has(identity),
    )
  ) {
    reasons.add("CURRENT187_CLUSTER_INVENTORY_UNKNOWN_DATABASE");
  }
  if (
    [...expectedAllIdentities].some(
      (identity) =>
        !initialIdentities.has(identity) || !finalIdentities.has(identity),
    )
  ) {
    reasons.add("CURRENT187_CLUSTER_INVENTORY_MISSING_DATABASE");
  }

  const finalByIdentity = new Map(
    finalSnapshot.databases.map((database) => [
      databaseIdentityKey(database),
      database,
    ]),
  );
  const scansByIdentity = new Map(
    scans.map((scan) => [
      `${scan.databaseName}\u0000${scan.databaseOid}`,
      scan,
    ]),
  );
  if (
    scans.length !== expectedCatalog.nonTemplateDatabases.length ||
    [...expectedIdentities].some((identity) => !scansByIdentity.has(identity))
  ) {
    reasons.add("CURRENT187_CLUSTER_INVENTORY_PARTIAL_DATABASE_SCAN");
  }
  if (
    [...scansByIdentity].some(([identity]) => !expectedIdentities.has(identity))
  ) {
    reasons.add("CURRENT187_CLUSTER_INVENTORY_UNKNOWN_DATABASE_SCAN");
  }

  for (const expectedDatabase of expectedCatalog.nonTemplateDatabases) {
    const identity = databaseIdentityKey(expectedDatabase);
    const finalDatabase = finalByIdentity.get(identity);
    const scan = scansByIdentity.get(identity);
    if (!scan) {
      continue;
    }
    if (
      scan.clusterIdentityDigest !== clusterIdentityDigest ||
      scan.ddlFenceDigest !== ddlFence.evidenceDigest ||
      scan.databaseIdentityDigest !==
        current187DatabaseIdentityDigest(expectedDatabase) ||
      !finalDatabase ||
      scan.databaseIdentityDigest !==
        current187DatabaseIdentityDigest(finalDatabase)
    ) {
      reasons.add("CURRENT187_CLUSTER_INVENTORY_SCAN_IDENTITY_MISMATCH");
    }
    if (
      scan.startedAtMs < initialSnapshot.capturedAtMs ||
      scan.completedAtMs > finalSnapshot.capturedAtMs ||
      scan.startedAtMs < ddlFence.validFromMs ||
      scan.completedAtMs > ddlFence.validUntilMs
    ) {
      reasons.add("CURRENT187_CLUSTER_INVENTORY_SCAN_TIMELINE_INVALID");
    }
    if (expectedDatabase.datallowconn) {
      if (
        scan.connectionStatus !== "CONNECTED" ||
        scan.catalogSurfaceStatus !== "COMPLETE" ||
        !current187AdmissionValidDigest(scan.catalogDigest)
      ) {
        reasons.add("CURRENT187_CLUSTER_INVENTORY_UNREAD_CATALOG");
      }
    } else if (
      scan.connectionStatus !== "NON_CONNECTABLE_PROVEN" ||
      scan.catalogSurfaceStatus !== "NOT_READ_NON_CONNECTABLE_ALLOWLIST" ||
      scan.catalogDigest !== null
    ) {
      reasons.add(
        "CURRENT187_CLUSTER_INVENTORY_NON_CONNECTABLE_POLICY_MISMATCH",
      );
    }
  }

  return Object.freeze([...reasons].sort(compareStrings));
}

function publicSnapshot(snapshot) {
  return Object.freeze({
    capturedAt: snapshot.capturedAt,
    catalogRowsComplete: snapshot.catalogRowsComplete,
    clusterIdentityDigest: snapshot.clusterIdentityDigest,
    databases: snapshotDatabaseProjection(snapshot),
    ddlFenceDigest: snapshot.ddlFenceDigest,
    snapshotKind: snapshot.snapshotKind,
  });
}

function publicFence(fence) {
  return Object.freeze(
    Object.fromEntries(DDL_FENCE_KEYS.map((key) => [key, fence[key]])),
  );
}

function publicScan(scan) {
  return Object.freeze(
    Object.fromEntries(PER_DATABASE_SCAN_KEYS.map((key) => [key, scan[key]])),
  );
}

export function planCurrent187ClusterInventoryAdmission(requestValue) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_ARGUMENTS_INVALID",
      "CURRENT187 cluster inventory planning accepts exactly one request.",
    );
  }
  const request = current187AdmissionExactDataRecord(
    requestValue,
    REQUEST_KEYS,
    "CURRENT187_CLUSTER_INVENTORY_REQUEST_INVALID",
    "The CURRENT187 cluster inventory request must be exact and data-only.",
  );
  if (
    request.contract !== CURRENT187_ADMISSION_CONTRACT ||
    request.slice !== CURRENT187_CLUSTER_INVENTORY_SLICE ||
    request.schemaVersion !== CURRENT187_ADMISSION_SCHEMA_VERSION ||
    request.kind !== CURRENT187_CLUSTER_INVENTORY_KIND ||
    request.profile !== CURRENT187_CLUSTER_INVENTORY_PROFILE ||
    request.environment !== "ci"
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_CONTRACT_INVALID",
      "The CURRENT187 cluster inventory contract discriminator is invalid.",
    );
  }

  const evaluatedAtMs = canonicalIsoEpoch(
    request.evaluatedAt,
    "CURRENT187_CLUSTER_INVENTORY_CURRENT_TIME_INVALID",
    "Inventory evaluation time",
  );
  const clusterIdentity = normalizeCurrent187ClusterIdentity(
    request.clusterIdentity,
  );
  const clusterIdentityDigest =
    current187ClusterIdentityDigest(clusterIdentity);
  const ddlFence = normalizeCurrent187DdlFence(request.ddlFence);
  const expectedCatalog = normalizeCurrent187ExpectedDatabaseCatalog(
    request.expectedCatalog,
  );
  const initialSnapshot = normalizeSnapshot(
    request.initialCatalogSnapshot,
    "INITIAL",
  );
  const finalSnapshot = normalizeSnapshot(
    request.finalCatalogSnapshot,
    "FINAL",
  );
  const scans = normalizePerDatabaseScans(request.perDatabaseScans);
  const reasonCodes = collectInventoryReasons({
    clusterIdentityDigest,
    ddlFence,
    evaluatedAtMs,
    expectedCatalog,
    finalSnapshot,
    initialSnapshot,
    scans,
  });

  const expectedUniverse = expectedUniverseProjection(expectedCatalog);
  const initialUniverse = snapshotDatabaseProjection(initialSnapshot);
  const finalUniverse = snapshotDatabaseProjection(finalSnapshot);
  const publicScans = Object.freeze(scans.map(publicScan));
  const publicDdlFence = publicFence(ddlFence);
  const publicFinalSnapshot = publicSnapshot(finalSnapshot);
  const expectedDatabaseUniverseDigest = digestCurrent187Value(
    CURRENT187_DATABASE_UNIVERSE_DIGEST_DOMAIN,
    expectedUniverse,
  );
  const initialDatabaseUniverseDigest = digestCurrent187Value(
    CURRENT187_DATABASE_UNIVERSE_DIGEST_DOMAIN,
    initialUniverse,
  );
  const finalDatabaseUniverseDigest = digestCurrent187Value(
    CURRENT187_DATABASE_UNIVERSE_DIGEST_DOMAIN,
    finalUniverse,
  );
  const nonTemplateAllowlistDigest = digestCurrent187Value(
    CURRENT187_NON_TEMPLATE_ALLOWLIST_DIGEST_DOMAIN,
    expectedCatalog.nonTemplateDatabases.map(databaseProjection),
  );
  const templateBaselineDigest = digestCurrent187Value(
    CURRENT187_TEMPLATE_BASELINE_DIGEST_DOMAIN,
    expectedCatalog.templateDatabases.map(databaseProjection),
  );
  const perDatabaseScanSetDigest = digestCurrent187Value(
    CURRENT187_PER_DATABASE_SCAN_DIGEST_DOMAIN,
    publicScans,
  );
  const stableCatalogProjection = Object.freeze(
    publicScans.map((scan) =>
      Object.freeze({
        catalogDigest: scan.catalogDigest,
        catalogSurfaceStatus: scan.catalogSurfaceStatus,
        connectionStatus: scan.connectionStatus,
        databaseIdentityDigest: scan.databaseIdentityDigest,
      }),
    ),
  );
  const roleBindingsProjection = Object.freeze(
    publicScans.map((scan) =>
      Object.freeze({
        databaseIdentityDigest: scan.databaseIdentityDigest,
        roleBindingsDigest: scan.roleBindingsDigest,
      }),
    ),
  );
  const currentAclProjection = Object.freeze(
    publicScans.map((scan) =>
      Object.freeze({
        currentAclPolicyDigest: scan.currentAclPolicyDigest,
        databaseIdentityDigest: scan.databaseIdentityDigest,
      }),
    ),
  );
  const defaultAclProjection = Object.freeze(
    publicScans.map((scan) =>
      Object.freeze({
        databaseIdentityDigest: scan.databaseIdentityDigest,
        defaultAclPolicyDigest: scan.defaultAclPolicyDigest,
      }),
    ),
  );
  const semanticRiskFactsProjection = Object.freeze(
    publicScans.map((scan) =>
      Object.freeze({
        databaseIdentityDigest: scan.databaseIdentityDigest,
        semanticRiskFactsDigest: scan.semanticRiskFactsDigest,
        semanticRiskFactsStatus: scan.semanticRiskFactsStatus,
      }),
    ),
  );
  const perDatabaseCatalogDigest = digestCurrent187Value(
    CURRENT187_PER_DATABASE_CATALOG_POLICY_DIGEST_DOMAIN,
    stableCatalogProjection,
  );
  const roleBindingsDigest = digestCurrent187Value(
    CURRENT187_ROLE_BINDINGS_POLICY_DIGEST_DOMAIN,
    roleBindingsProjection,
  );
  const currentAclPolicyDigest = digestCurrent187Value(
    CURRENT187_CURRENT_ACL_POLICY_DIGEST_DOMAIN,
    currentAclProjection,
  );
  const defaultAclPolicyDigest = digestCurrent187Value(
    CURRENT187_DEFAULT_ACL_POLICY_DIGEST_DOMAIN,
    defaultAclProjection,
  );
  const semanticRiskFactsDigest = digestCurrent187Value(
    CURRENT187_SEMANTIC_RISK_FACTS_POLICY_DIGEST_DOMAIN,
    semanticRiskFactsProjection,
  );
  const semanticRiskFactsStatus = publicScans.every(
    (scan) =>
      scan.connectionStatus === "CONNECTED" &&
      scan.semanticRiskFactsStatus === "FACTS_EXTRACTED_DENY_ONLY",
  )
    ? "FACTS_EXTRACTED_DENY_ONLY"
    : "INCOMPLETE_DENIED";
  const clusterCatalogDigest = digestCurrent187Value(
    CURRENT187_CLUSTER_CATALOG_POLICY_DIGEST_DOMAIN,
    {
      clusterIdentityDigest,
      currentAclPolicyDigest,
      defaultAclPolicyDigest,
      expectedDatabaseUniverseDigest,
      perDatabaseCatalogDigest,
      roleBindingsDigest,
      semanticRiskFactsDigest,
    },
  );
  const ddlFenceStateDigest = digestCurrent187Value(
    CURRENT187_DDL_FENCE_STATE_DIGEST_DOMAIN,
    publicDdlFence,
  );
  const finalCatalogSnapshotDigest = digestCurrent187Value(
    CURRENT187_CLUSTER_CATALOG_SNAPSHOT_DIGEST_DOMAIN,
    publicFinalSnapshot,
  );
  const planDigest = digestCurrent187Value(
    CURRENT187_CLUSTER_INVENTORY_PLAN_DIGEST_DOMAIN,
    {
      clusterIdentity,
      ddlFence: publicDdlFence,
      environment: request.environment,
      evaluatedAt: request.evaluatedAt,
      expectedCatalog,
      finalCatalogSnapshot: publicFinalSnapshot,
      initialCatalogSnapshot: publicSnapshot(initialSnapshot),
      perDatabaseScans: publicScans,
      reasonCodes,
    },
  );

  const receipt = current187AdmissionDeepFreeze({
    authorization: false,
    canMutate: false,
    canSend: false,
    clusterCatalogDigest,
    clusterIdentityDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    currentAclPolicyDigest,
    ddlFenceEpoch: ddlFence.fenceEpoch,
    ddlFenceEvidenceDigest: ddlFence.evidenceDigest,
    ddlFenceStateDigest,
    ddlFenceValidFrom: ddlFence.validFrom,
    ddlFenceValidUntil: ddlFence.validUntil,
    defaultAclPolicyDigest,
    environment: request.environment,
    externalDdlFenceAttestationDigest: null,
    externalDdlFenceAttested: false,
    finalCatalogSnapshotCapturedAt: finalSnapshot.capturedAt,
    finalCatalogSnapshotDigest,
    finalDatabaseUniverseDigest,
    initialDatabaseUniverseDigest,
    inventoryProjectionMatched: reasonCodes.length === 0,
    inventoryStatus: reasonCodes.length === 0 ? "MATCHED" : "DENIED",
    kind: CURRENT187_CLUSTER_INVENTORY_RECEIPT_KIND,
    liveClusterScanVerified: false,
    nonTemplateAllowlistDigest,
    nonTemplateDatabaseCount: expectedCatalog.nonTemplateDatabases.length,
    perDatabaseScanCount: scans.length,
    perDatabaseCatalogDigest,
    perDatabaseScanSetDigest,
    persistedConsumptionVerified: false,
    planDigest,
    productionRootEnrolled: false,
    reasonCodes,
    roleBindingsDigest,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    semanticRiskFactsDigest,
    semanticRiskFactsStatus,
    sharedBetaAccess: false,
    slice: CURRENT187_CLUSTER_INVENTORY_SLICE,
    sourceIoPerformed: false,
    templateBaselineDigest,
    templateDatabaseCount: expectedCatalog.templateDatabases.length,
    testAccessAuthorized: false,
    expectedDatabaseUniverseDigest,
  });
  VERIFIED_CURRENT187_CLUSTER_INVENTORY_RECEIPTS.add(receipt);
  return receipt;
}

export function attachVerifiedCurrent187DdlFenceAttestation(
  plannerReceipt,
  acquisitionDigest,
  attestationReceipt,
) {
  if (arguments.length !== 3) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_ATTESTATION_ARGUMENTS_INVALID",
      "Planner attestation requires a planner receipt, acquisition digest, and branded DDL-fence receipt.",
    );
  }
  if (
    !isVerifiedCurrent187ClusterInventoryReceipt(plannerReceipt) ||
    plannerReceipt.inventoryStatus !== "MATCHED" ||
    plannerReceipt.inventoryProjectionMatched !== true ||
    plannerReceipt.externalDdlFenceAttested !== false ||
    plannerReceipt.externalDdlFenceAttestationDigest !== null ||
    !current187AdmissionValidDigest(acquisitionDigest)
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_ATTESTATION_BASE_INVALID",
      "Only one branded, matched, unattested CURRENT187 inventory receipt can consume a DDL-fence attestation.",
    );
  }
  const signedBinding =
    current187DdlFenceAttestationInventoryBinding(attestationReceipt);
  const expectedBinding = Object.freeze({
    acquisitionDigest,
    clusterIdentityDigest: plannerReceipt.clusterIdentityDigest,
    databaseUniverseDigest: plannerReceipt.expectedDatabaseUniverseDigest,
    ddlFenceEvidenceDigest: plannerReceipt.ddlFenceEvidenceDigest,
    ddlFenceStateDigest: plannerReceipt.ddlFenceStateDigest,
    environment: plannerReceipt.environment,
    fenceEpoch: plannerReceipt.ddlFenceEpoch,
    fenceValidFrom: plannerReceipt.ddlFenceValidFrom,
    fenceValidUntil: plannerReceipt.ddlFenceValidUntil,
    finalDatabaseUniverseDigest: plannerReceipt.finalDatabaseUniverseDigest,
    finalSnapshotCapturedAt: plannerReceipt.finalCatalogSnapshotCapturedAt,
    finalSnapshotDigest: plannerReceipt.finalCatalogSnapshotDigest,
    inventoryPlanDigest: plannerReceipt.planDigest,
  });
  if (
    current187AdmissionCanonicalJson(signedBinding) !==
    current187AdmissionCanonicalJson(expectedBinding)
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_ATTESTATION_BINDING_MISMATCH",
      "The independent DDL-fence attestation does not match the exact acquisition and final inventory snapshot.",
    );
  }
  if (!current187AdmissionValidDigest(attestationReceipt.attestationDigest)) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_INVENTORY_ATTESTATION_RECEIPT_INVALID",
      "The branded DDL-fence attestation has no valid receipt digest.",
    );
  }
  const attested = current187AdmissionDeepFreeze({
    ...plannerReceipt,
    externalDdlFenceAttestationDigest: attestationReceipt.attestationDigest,
    externalDdlFenceAttested: true,
  });
  VERIFIED_CURRENT187_CLUSTER_INVENTORY_RECEIPTS.add(attested);
  return attested;
}

export function isVerifiedCurrent187ClusterInventoryReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_CURRENT187_CLUSTER_INVENTORY_RECEIPTS.has(value)
  );
}
