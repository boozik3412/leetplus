import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_CONTRACT_V1";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_AUTHORIZATION_V1";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_STATUS =
  "DISPOSABLE_POSTGRESQL_REHEARSAL_ONLY";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PROFILE =
  "local-pinned";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONFIRMATION =
  "run-current180-current190-disposable-postgresql16-rehearsal";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT =
  "CURRENT180_CURRENT190_PG_REHEARSAL_SOURCE_DATABASE_URL";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE =
  "PG_DATABASE_EXHAUSTIVE_CLUSTER_SNAPSHOT_V1";

const PROFILE_ENVIRONMENT = "CURRENT180_CURRENT190_PG_REHEARSAL_PROFILE";
const CONFIRMATION_ENVIRONMENT = "CURRENT180_CURRENT190_PG_REHEARSAL_CONFIRM";
const ASSEMBLY_RECEIPT_CONTRACT =
  "CURRENT180_CURRENT190_FROZEN_IN_MEMORY_ARTIFACT_V1";
const ASSEMBLY_RECEIPT_STATUS =
  "FROZEN_IN_MEMORY_ARTIFACT_ASSEMBLED_NOT_RUNNABLE";
const ASSEMBLY_ALLOW_MANIFEST_SHA256 =
  "738063efe68828432bc39d4d1bea2f283e17c58dfc367ed6beb6c69a0cd5c69e";
const ASSEMBLY_REFREEZE_MANIFEST_SHA256 =
  "290909b51d4eb3bc1cab035a182b5647e89471680441c73bbe4d77cf704053e4";
const ASSEMBLY_PLAN_DIGEST =
  "597c310480026ab421d2e637fa328b3d902f1aa7a4cf886b4c19410f68115e1d";
const ASSEMBLY_ENTRY_MANIFEST_DIGEST =
  "00513bf5b31bbf37dd0d82fe025fed72c29c17fe3e26aad8bfa273c2829ed89a";
const ASSEMBLY_IN_MEMORY_ARTIFACT_DIGEST =
  "947e3fe7831cd5433c62ded00e6cff1595b9f3dbbe0ee3997ad4bd6fb22cfa5e";
const ASSEMBLY_RECEIPT_AUTHORIZATION_KEYS = Object.freeze([
  "canApplyDatabase",
  "canCallExternalProviders",
  "canConnectDatabase",
  "canDeploy",
  "canMaterializeFilesystem",
  "canMutateCanonicalMigrations",
  "canMutateProduction",
  "canProvisionRolesOrGrants",
  "canSpawnProcess",
  "productionApplyAuthorized",
  "runnerConsumptionAuthorized",
]);
const SOURCE_DATABASE = "leetplus_current180_ci";
const SOURCE_HOST = "127.0.0.1";
const SOURCE_PORT = "55432";
const SOURCE_QUERY = "?schema=public";
const SOURCE_USERNAME = "postgres";
const SOURCE_MIGRATION_COUNT = 180;
const SOURCE_MIGRATION_HEAD = "20260804120000_guest_game_max_pending_rewards";
const SOURCE_MIGRATION_HEAD_SHA256 =
  "40587bc93c34875edf6064f9848e42ce0194b321165ac494750987533cef21ef";
const SOURCE_MIGRATION_MANIFEST_DIGEST =
  "8a763027a16c45532bf1cff84fdaacf27f2c4e834cae15cffd7a15feae63f6dc";
const FINAL_MIGRATION_COUNT = 191;
const FINAL_MIGRATION_HEAD = "20260805040000_guest_portal_session_current190";
const FINAL_MIGRATION_MANIFEST_DIGEST =
  "3220929d1a33fd20748de14427bf3bd041e1c20445d9525b7fb0a560f8baf476";
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const TOKEN_PATTERN = /^[0-9a-f]{32}$/u;
const WORKING_DATABASE_PATTERN = /^lp_imtec_[0-9a-f]{32}_ci$/u;
const FINAL_DATABASE_PATTERN = /^lp_c180190_[0-9a-f]{32}_ci$/u;
const MARKER_PATTERN = /^LEETPLUS_CURRENT180190_REHEARSAL_V1:[0-9a-f]{64}$/u;
const MIGRATION_NAME_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SOURCE_URL_PATTERN =
  /^postgresql:\/\/postgres(?::[^/?#\\@]+)?@127\.0\.0\.1:55432\/leetplus_current180_ci\?schema=public$/u;
const SECRET_ENVIRONMENT_KEY_PATTERN =
  /(?:^|_)(?:API_?KEY|CREDENTIALS?|PRIVATE_?KEY|PASSWORD|SECRET|TOKEN)(?:$|_)/iu;
const FORBIDDEN_DATABASE_ENVIRONMENT_KEYS = new Set([
  "DATABASE_URL",
  "DIRECT_URL",
  "SHADOW_DATABASE_URL",
  "PGAPPNAME",
  "PGDATABASE",
  "PGHOST",
  "PGHOSTADDR",
  "PGOPTIONS",
  "PGPASSFILE",
  "PGPASSWORD",
  "PGPORT",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGSSLMODE",
  "PGUSER",
]);
const REQUIRED_ENVIRONMENT_KEYS = new Set([
  "NODE_ENV",
  PROFILE_ENVIRONMENT,
  CONFIRMATION_ENVIRONMENT,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT,
]);

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_DATABASE_PATTERNS =
  deepFreeze({
    final: FINAL_DATABASE_PATTERN.source,
    runToken: TOKEN_PATTERN.source,
    working: WORKING_DATABASE_PATTERN.source,
  });

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS =
  deepFreeze([
    "IdentityMailDeliveryTenantEnrollment",
    "IdentityMailOutbox",
    "SharedBetaRuntimeReleaseMarker",
    "Tenant",
  ]);

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP = deepFreeze([
  {
    confirmation: "rehearse-dormant-identity-mail-tenant-enrollment-current180",
    confirmationGuc:
      "leetplus.identity_mail_tenant_enrollment_current180_confirmation",
    migration: "20260804130000_identity_mail_tenant_enrollment_control_plane",
    ordinal: 180,
    sha256: "e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683",
    sha256Guc: "leetplus.identity_mail_tenant_enrollment_current180_sha256",
  },
  {
    confirmation:
      "rehearse-noncanonical-identity-mail-tenant-lock-drain-current181",
    confirmationGuc:
      "leetplus.identity_mail_tenant_lock_drain_current181_confirmation",
    migration: "20260804140000_identity_mail_tenant_lock_drain_worker_v2",
    ordinal: 181,
    sha256: "c923d26d77fbb268fccc03d6eff0539a75c2644059d7f7ffc2493491c88f69ac",
    sha256Guc: "leetplus.identity_mail_tenant_lock_drain_current181_sha256",
  },
  {
    confirmation:
      "rehearse-noncanonical-identity-mail-tenant-first-claim-current182",
    confirmationGuc:
      "leetplus.identity_mail_tenant_first_claim_current182_confirmation",
    migration: "20260804150000_identity_mail_tenant_first_claim_protocol",
    ordinal: 182,
    sha256: "5eb1ab8f2535c212b334e599071aefbae19039cc519177f62cbe0de7373e6fdf",
    sha256Guc: "leetplus.identity_mail_tenant_first_claim_current182_sha256",
  },
  {
    confirmation:
      "rehearse-noncanonical-identity-mail-worker-v2-freshness-current183",
    confirmationGuc:
      "leetplus.identity_mail_worker_v2_freshness_current183_confirmation",
    migration: "20260804160000_identity_mail_worker_v2_freshness_protocol",
    ordinal: 183,
    sha256: "a3b92838cac386480384abb770aa06a9f2cb27b4326d5c6f9344f9019b26f2f0",
    sha256Guc: "leetplus.identity_mail_worker_v2_freshness_current183_sha256",
  },
  {
    confirmation:
      "rehearse-noncanonical-identity-mail-worker-v2-replay-current184",
    confirmationGuc:
      "leetplus.identity_mail_worker_v2_replay_current184_confirmation",
    migration: "20260804170000_identity_mail_worker_v2_lost_response_replay",
    ordinal: 184,
    sha256: "d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424",
    sha256Guc: "leetplus.identity_mail_worker_v2_replay_current184_sha256",
  },
  {
    confirmation:
      "rehearse-noncanonical-identity-mail-enrollment-evidence-ledger-current185",
    confirmationGuc:
      "leetplus.identity_mail_enrollment_evidence_ledger_current185_confirmation",
    migration: "20260804180000_identity_mail_enrollment_evidence_ledger_v2",
    ordinal: 185,
    sha256: "2c8752ec4f92addabd21ace9be8071aea1e62be45887abb2c4944de2f96657e6",
    sha256Guc:
      "leetplus.identity_mail_enrollment_evidence_ledger_current185_sha256",
  },
  {
    confirmation:
      "rehearse-noncanonical-identity-mail-duty-role-runtime-current186",
    confirmationGuc:
      "leetplus.identity_mail_duty_role_runtime_current186_confirmation",
    migration: "20260804190000_identity_mail_duty_role_runtime_boundary_v2",
    ordinal: 186,
    sha256: "7a1a0453b883d6bbf8640eff8c39b007376286b0f21d31f766771fead65a93dd",
    sha256Guc: "leetplus.identity_mail_duty_role_runtime_current186_sha256",
  },
]);

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PREFIXES = deepFreeze([
  {
    count: 180,
    digest: SOURCE_MIGRATION_MANIFEST_DIGEST,
    head: SOURCE_MIGRATION_HEAD,
    headChecksum: SOURCE_MIGRATION_HEAD_SHA256,
  },
  {
    count: 181,
    digest: "ce2cfdf0b499aefee7171c7229ee8d9e1ec5e37b31e0e247ccd30145ac14ff46",
    head: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[0].migration,
    headChecksum: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[0].sha256,
  },
  {
    count: 182,
    digest: "0d7fa6466d609504696eb96e53e27c33e10881c4d2edf38b69d88ef1ab689107",
    head: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[1].migration,
    headChecksum: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[1].sha256,
  },
  {
    count: 183,
    digest: "f4359a47b40fdf2df1839db4fd33c577674d4f887b56aab9e7903373e103c52a",
    head: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[2].migration,
    headChecksum: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[2].sha256,
  },
  {
    count: 184,
    digest: "fbefd932e2e34cc3358b2eee8028daf729b044b690af6df01aac2b888b15f642",
    head: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[3].migration,
    headChecksum: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[3].sha256,
  },
  {
    count: 185,
    digest: "d5f9f9ad5d7be5706897533eb71f92aa0bd9d8f3feca62462898fc3a0757ac7a",
    head: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[4].migration,
    headChecksum: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[4].sha256,
  },
  {
    count: 186,
    digest: "a7a90ef8c5de5c8a54bdccd54309837ddda2c2e161d6650b335d83f7af04034d",
    head: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[5].migration,
    headChecksum: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[5].sha256,
  },
  {
    count: 187,
    digest: "d5143b06ab4e21ec99d5a6c600aa257effffd7ba4cdbbb156650ebdd378ffd16",
    head: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[6].migration,
    headChecksum: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP[6].sha256,
  },
  {
    count: 188,
    digest: "00401a0a356ead1f3e02947a43e7fefa2886521b413aa8985e154cb3b089d708",
    head: "20260805010000_identity_mail_cluster_application_admission_current187",
    headChecksum:
      "24de1c767af0b0bd9d386c9c2df11455743bd0ee041edfd2ca17cdba7e01c2e7",
  },
  {
    count: 189,
    digest: "1afdcb833940cce3b4da040eaea4d7cffcfe90d028ed6866d04de044646cbeca",
    head: "20260805020000_langame_onboarding_staged_receipt_current188",
    headChecksum:
      "e76ed2c1b7e913bbfa9a9779cd0c860b120534c83eba504a0510469ff26f0c60",
  },
  {
    count: 190,
    digest: "a6c0f85279e5e0a1dc29b753532ab02be635d026fa086355feeeae483d8dc670",
    head: "20260805030000_identity_employee_invite_mail_boundary_current189",
    headChecksum:
      "4bbf4d49847b82731aa2e235796b4b1a898914768c1f4f4e2cb7a8b084e5c751",
  },
  {
    count: 191,
    digest: FINAL_MIGRATION_MANIFEST_DIGEST,
    head: FINAL_MIGRATION_HEAD,
    headChecksum:
      "d23c0e8fbdfddd0eb9ec7a73d877e7bbcde8c170683247a66f43530cca3867d5",
  },
]);

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_EFFECTS = deepFreeze({
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

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PHASES = deepFreeze([
  "INITIAL",
  "PREFLIGHT_ACCEPTED",
  "CLUSTER_LOCKED",
  "SOURCE_PINNED",
  "CREATE_PENDING",
  "WORKING_OWNED",
  "PROVISIONAL_DURABLE_RECOVERY_REQUIRED",
  "WORKING_MARKED",
  "WORKING_OPEN",
  "APPLY_PENDING",
  "WORKING_APPLIED",
  "WORKING_SEALED",
  "RENAME_PENDING",
  "FINAL_OWNED",
  "FINAL_OPEN",
  "FINAL_VERIFIED",
  "ZERO_DIFF_PENDING",
  "ZERO_DIFF_VERIFIED",
  "ROLLBACK_SEALED",
  "ROLLBACK_RENAME_PENDING",
  "ROLLBACK_WORKING_OWNED",
  "DROP_PENDING",
  "ABSENCE_VERIFIED",
  "CLEANUP_DROP_PENDING",
  "CLEANUP_ABSENCE_VERIFIED",
  "SOURCE_ZERO_DIFF_VERIFIED",
  "COMPLETED",
  "BLOCKED",
  "CLEANUP_REQUIRED",
  "FAILED_CLEAN",
]);

const TRANSITION_SPECS = deepFreeze({
  ABSENCE_VERIFIED: {
    from: ["DROP_PENDING"],
    to: "ABSENCE_VERIFIED",
  },
  CLEANUP_ABSENCE_VERIFIED: {
    from: ["CLEANUP_DROP_PENDING"],
    to: "CLEANUP_ABSENCE_VERIFIED",
  },
  CLEANUP_DROP_ISSUED: {
    from: ["CLEANUP_REQUIRED"],
    to: "CLEANUP_DROP_PENDING",
  },
  APPLY_RECONCILED: { from: ["APPLY_PENDING"], to: "WORKING_APPLIED" },
  CLUSTER_LOCK_ACQUIRED: {
    from: ["PREFLIGHT_ACCEPTED"],
    to: "CLUSTER_LOCKED",
  },
  COMPLETED: { from: ["SOURCE_ZERO_DIFF_VERIFIED"], to: "COMPLETED" },
  CREATE_ISSUED: { from: ["SOURCE_PINNED"], to: "CREATE_PENDING" },
  CREATE_RECONCILED: { from: ["CREATE_PENDING"], to: "WORKING_OWNED" },
  DROP_ISSUED: {
    from: ["ROLLBACK_WORKING_OWNED"],
    to: "DROP_PENDING",
  },
  FAILED_CLEAN: {
    from: ["CLEANUP_ABSENCE_VERIFIED"],
    to: "FAILED_CLEAN",
  },
  FAIL_BEFORE_OWNERSHIP: {
    from: ["INITIAL", "PREFLIGHT_ACCEPTED", "CLUSTER_LOCKED", "SOURCE_PINNED"],
    to: "BLOCKED",
  },
  FAIL_WITH_OWNERSHIP: {
    from: [
      "WORKING_MARKED",
      "WORKING_OPEN",
      "APPLY_PENDING",
      "WORKING_APPLIED",
      "WORKING_SEALED",
      "RENAME_PENDING",
      "FINAL_OWNED",
      "FINAL_OPEN",
      "FINAL_VERIFIED",
      "ZERO_DIFF_PENDING",
      "ZERO_DIFF_VERIFIED",
      "ROLLBACK_SEALED",
      "ROLLBACK_RENAME_PENDING",
      "ROLLBACK_WORKING_OWNED",
    ],
    to: "CLEANUP_REQUIRED",
  },
  FINAL_FINGERPRINT_VERIFIED: {
    from: ["FINAL_OPEN"],
    to: "FINAL_VERIFIED",
  },
  FINAL_OPENED: { from: ["FINAL_OWNED"], to: "FINAL_OPEN" },
  PREFLIGHT_ACCEPTED: { from: ["INITIAL"], to: "PREFLIGHT_ACCEPTED" },
  PROVISIONAL_FAILURE_JOURNALED: {
    from: ["WORKING_OWNED"],
    to: "PROVISIONAL_DURABLE_RECOVERY_REQUIRED",
  },
  PROVISIONAL_MARKER_RECONCILED: {
    from: ["PROVISIONAL_DURABLE_RECOVERY_REQUIRED"],
    to: "WORKING_MARKED",
  },
  PRISMA_DEPLOY_ISSUED: { from: ["WORKING_OPEN"], to: "APPLY_PENDING" },
  RENAME_ISSUED: { from: ["WORKING_SEALED"], to: "RENAME_PENDING" },
  RENAME_RECONCILED: { from: ["RENAME_PENDING"], to: "FINAL_OWNED" },
  ROLLBACK_RENAME_ISSUED: {
    from: ["ROLLBACK_SEALED"],
    to: "ROLLBACK_RENAME_PENDING",
  },
  ROLLBACK_RENAME_RECONCILED: {
    from: ["ROLLBACK_RENAME_PENDING"],
    to: "ROLLBACK_WORKING_OWNED",
  },
  ROLLBACK_SEALED: {
    from: ["ZERO_DIFF_VERIFIED"],
    to: "ROLLBACK_SEALED",
  },
  SOURCE_PINNED: { from: ["CLUSTER_LOCKED"], to: "SOURCE_PINNED" },
  SOURCE_ZERO_DIFF_VERIFIED: {
    from: ["ABSENCE_VERIFIED"],
    to: "SOURCE_ZERO_DIFF_VERIFIED",
  },
  WORKING_MARKED: { from: ["WORKING_OWNED"], to: "WORKING_MARKED" },
  WORKING_OPENED: { from: ["WORKING_MARKED"], to: "WORKING_OPEN" },
  WORKING_SEALED: { from: ["WORKING_APPLIED"], to: "WORKING_SEALED" },
  ZERO_DIFF_DEPLOY_ISSUED: {
    from: ["FINAL_VERIFIED"],
    to: "ZERO_DIFF_PENDING",
  },
  ZERO_DIFF_VERIFIED: {
    from: ["ZERO_DIFF_PENDING"],
    to: "ZERO_DIFF_VERIFIED",
  },
});

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS =
  TRANSITION_SPECS;

export class Current180Current190PostgresqlRehearsalContractError extends Error {
  constructor(code, findings = []) {
    super(
      "CURRENT180-CURRENT190 PostgreSQL rehearsal contract rejected input.",
    );
    this.name = "Current180Current190PostgresqlRehearsalContractError";
    this.code = code;
    this.findings = Object.freeze([...new Set(findings)].sort(compareText));
  }
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

function fail(code, findings) {
  throw new Current180Current190PostgresqlRehearsalContractError(
    code,
    findings,
  );
}

function isPlainDataRecord(value) {
  if (!plainObject(value)) {
    return false;
  }
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) =>
      Object.hasOwn(descriptor, "value") &&
      (typeof descriptor.value === "string" || descriptor.value === undefined),
  );
}

function plainObject(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    isProxy(value) ||
    Array.isArray(value)
  ) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  return (
    Object.getPrototypeOf(value) === Object.prototype &&
    keys.every((key) => typeof key === "string") &&
    keys.every((key) =>
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"),
    )
  );
}

function exactKeys(value, expectedKeys) {
  return (
    plainObject(value) &&
    Reflect.ownKeys(value).sort(compareText).join("\n") ===
      [...expectedKeys].sort(compareText).join("\n")
  );
}

function denseDataArray(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    isProxy(value) ||
    !Array.isArray(value)
  ) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) return false;
  const expectedKeys = [
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    "length",
  ];
  if (
    keys.sort(compareText).join("\n") !==
    expectedKeys.sort(compareText).join("\n")
  ) {
    return false;
  }
  return keys.every((key) =>
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"),
  );
}

function deepDataTree(value, seen = new WeakSet()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    if (!denseDataArray(value)) return false;
    return Array.from({ length: value.length }, (_, index) =>
      Object.getOwnPropertyDescriptor(value, String(index)),
    ).every((descriptor) => deepDataTree(descriptor.value, seen));
  }
  if (!plainObject(value)) return false;
  return Reflect.ownKeys(value).every((key) =>
    deepDataTree(Object.getOwnPropertyDescriptor(value, key).value, seen),
  );
}

function boundedCredentialPart(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 256 &&
    !/[\u0000-\u0020\u007f]/u.test(value)
  );
}

function decodedCredentialPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    fail("REHEARSAL_SOURCE_URL_INVALID", [
      "CREDENTIAL_PERCENT_ENCODING_INVALID",
    ]);
  }
}

function inspectSourceUrl(raw) {
  if (typeof raw !== "string" || !SOURCE_URL_PATTERN.test(raw)) {
    fail("REHEARSAL_SOURCE_URL_INVALID", ["EXACT_LOCAL_SOURCE_URL_REQUIRED"]);
  }
  let source;
  try {
    source = new URL(raw);
  } catch {
    fail("REHEARSAL_SOURCE_URL_INVALID", ["SOURCE_URL_PARSE_FAILED"]);
  }
  const username = decodedCredentialPart(source.username);
  const password = decodedCredentialPart(source.password);
  const passwordPresent = raw.startsWith(`postgresql://${source.username}:`);
  if (
    source.protocol !== "postgresql:" ||
    source.hostname !== SOURCE_HOST ||
    source.port !== SOURCE_PORT ||
    source.pathname !== `/${SOURCE_DATABASE}` ||
    source.search !== SOURCE_QUERY ||
    source.hash !== "" ||
    source.toString() !== raw ||
    username !== SOURCE_USERNAME ||
    source.username !== encodeURIComponent(username) ||
    !boundedCredentialPart(username) ||
    (passwordPresent &&
      (!boundedCredentialPart(password) ||
        source.password !== encodeURIComponent(password))) ||
    (!passwordPresent && source.password !== "")
  ) {
    fail("REHEARSAL_SOURCE_URL_INVALID", ["SOURCE_URL_NOT_CANONICAL"]);
  }
  return {
    databaseName: SOURCE_DATABASE,
    endpoint: `${SOURCE_HOST}:${SOURCE_PORT}`,
    host: SOURCE_HOST,
    passwordPresent,
    port: Number(SOURCE_PORT),
    protocol: "postgresql",
    query: "schema=public",
    urlSha256: sha256(Buffer.from(raw, "utf8")),
    usernameSha256: sha256(Buffer.from(username, "utf8")),
  };
}

export function inspectCurrent180Current190PostgresqlRehearsalEnvironment(
  environment,
) {
  if (!isPlainDataRecord(environment)) {
    fail("REHEARSAL_ENVIRONMENT_INVALID", ["PLAIN_DATA_ENVIRONMENT_REQUIRED"]);
  }
  const findings = [];
  const caseInsensitiveKeys = new Set();
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) continue;
    const normalizedKey = key.toUpperCase();
    if (caseInsensitiveKeys.has(normalizedKey)) {
      findings.push("AMBIGUOUS_CASE_INSENSITIVE_ENVIRONMENT_KEY");
    }
    caseInsensitiveKeys.add(normalizedKey);
    if (FORBIDDEN_DATABASE_ENVIRONMENT_KEYS.has(normalizedKey)) {
      findings.push("AMBIENT_DATABASE_ENVIRONMENT_DENIED");
    }
    if (
      normalizedKey.startsWith("CURRENT180_CURRENT190_") &&
      !REQUIRED_ENVIRONMENT_KEYS.has(key)
    ) {
      findings.push("UNKNOWN_REHEARSAL_ENVIRONMENT_KEY");
    }
    if (
      key !==
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT &&
      SECRET_ENVIRONMENT_KEY_PATTERN.test(key)
    ) {
      findings.push("AMBIENT_SECRET_ENVIRONMENT_DENIED");
    }
  }
  if (environment.NODE_ENV !== "test") {
    findings.push(
      String(environment.NODE_ENV ?? "")
        .trim()
        .toLowerCase() === "production"
        ? "PRODUCTION_ENVIRONMENT_DENIED"
        : "NODE_ENV_TEST_REQUIRED",
    );
  }
  if (
    environment[PROFILE_ENVIRONMENT] !==
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PROFILE
  ) {
    findings.push("LOCAL_PINNED_PROFILE_REQUIRED");
  }
  if (
    environment[CONFIRMATION_ENVIRONMENT] !==
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONFIRMATION
  ) {
    findings.push("EXACT_REHEARSAL_CONFIRMATION_REQUIRED");
  }
  if (findings.length > 0) {
    fail("REHEARSAL_ENVIRONMENT_DENIED", findings);
  }
  const source = inspectSourceUrl(
    environment[
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT
    ],
  );
  return deepFreeze({
    contract: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONTRACT,
    effects: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_EFFECTS,
    nodeEnvironment: "test",
    profile: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PROFILE,
    source,
    status: "REHEARSAL_ENVIRONMENT_ACCEPTED",
    verified: true,
  });
}

export function deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(
  runToken,
) {
  if (typeof runToken !== "string" || !TOKEN_PATTERN.test(runToken)) {
    fail("REHEARSAL_RUN_TOKEN_INVALID", ["EXACT_32_HEX_RUN_TOKEN_REQUIRED"]);
  }
  return deepFreeze({
    finalDatabaseName: `lp_c180190_${runToken}_ci`,
    runToken,
    workingDatabaseName: `lp_imtec_${runToken}_ci`,
  });
}

export function validateCurrent180Current190PostgresqlRehearsalDatabaseNames(
  value,
) {
  if (
    !exactKeys(value, ["finalDatabaseName", "runToken", "workingDatabaseName"])
  ) {
    fail("REHEARSAL_DATABASE_NAMES_INVALID", [
      "DATABASE_NAMES_OBJECT_REQUIRED",
    ]);
  }
  const expected = deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(
    value.runToken,
  );
  if (
    value.workingDatabaseName !== expected.workingDatabaseName ||
    value.finalDatabaseName !== expected.finalDatabaseName ||
    !WORKING_DATABASE_PATTERN.test(value.workingDatabaseName) ||
    !FINAL_DATABASE_PATTERN.test(value.finalDatabaseName) ||
    value.workingDatabaseName === value.finalDatabaseName
  ) {
    fail("REHEARSAL_DATABASE_NAMES_INVALID", [
      "DERIVED_DATABASE_NAMES_REQUIRED",
    ]);
  }
  return expected;
}

export function buildCurrent180Current190PostgresqlRehearsalSessionOptions() {
  const options = [
    "-c lock_timeout=5000",
    "-c statement_timeout=300000",
    "-c idle_in_transaction_session_timeout=300000",
  ];
  for (const entry of CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_GUC_MAP) {
    options.push(
      `-c ${entry.confirmationGuc}=${entry.confirmation}`,
      `-c ${entry.sha256Guc}=${entry.sha256}`,
    );
  }
  return Object.freeze(options);
}

export function buildCurrent180Current190PostgresqlRehearsalChildEnvironment(
  input,
) {
  if (
    !exactKeys(input, [
      "authorizationReceiptDigest",
      "environment",
      "names",
      "target",
    ])
  ) {
    fail("REHEARSAL_CHILD_ENVIRONMENT_INVALID", [
      "EXACT_CHILD_ENVIRONMENT_INPUT_REQUIRED",
    ]);
  }
  const { authorizationReceiptDigest, environment, names, target } = input;
  if (!SHA256_PATTERN.test(String(authorizationReceiptDigest ?? ""))) {
    fail("REHEARSAL_CHILD_ENVIRONMENT_INVALID", [
      "AUTHORIZATION_RECEIPT_DIGEST_REQUIRED",
    ]);
  }
  inspectCurrent180Current190PostgresqlRehearsalEnvironment(environment);
  const validatedNames =
    validateCurrent180Current190PostgresqlRehearsalDatabaseNames(names);
  const targetDatabaseName =
    target === "working"
      ? validatedNames.workingDatabaseName
      : target === "final"
        ? validatedNames.finalDatabaseName
        : null;
  if (targetDatabaseName === null) {
    fail("REHEARSAL_CHILD_ENVIRONMENT_INVALID", ["TARGET_STAGE_INVALID"]);
  }
  const source = new URL(
    environment[
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT
    ],
  );
  const sessionOptions =
    buildCurrent180Current190PostgresqlRehearsalSessionOptions();
  source.pathname = `/${targetDatabaseName}`;
  source.search = "";
  source.searchParams.set("schema", "public");
  source.searchParams.set("connection_limit", "1");
  source.searchParams.set("connect_timeout", "5");
  source.searchParams.set("socket_timeout", "300");
  source.searchParams.set(
    "application_name",
    `lp-current180190-${validatedNames.runToken}`,
  );
  source.searchParams.set("options", sessionOptions.join(" "));
  const databaseUrl = source.toString();
  const child = {
    CURRENT180_CURRENT190_REHEARSAL_AUTHORIZATION_RECEIPT_SHA256:
      authorizationReceiptDigest,
    CURRENT180_CURRENT190_REHEARSAL_DATABASE_URL_SHA256: sha256(
      Buffer.from(databaseUrl, "utf8"),
    ),
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
    NO_COLOR: "1",
    PGOPTIONS: sessionOptions.join(" "),
    PRISMA_HIDE_UPDATE_MESSAGE: "true",
  };
  return deepFreeze(child);
}

export function sanitizeCurrent180Current190PostgresqlRehearsalDiagnostic(
  value,
) {
  let diagnostic;
  if (
    value === null ||
    value === undefined ||
    ["string", "number", "boolean", "bigint", "symbol"].includes(typeof value)
  ) {
    diagnostic = String(value);
  } else if (!isProxy(value)) {
    const message = Object.getOwnPropertyDescriptor(value, "message");
    diagnostic =
      message &&
      Object.hasOwn(message, "value") &&
      typeof message.value === "string"
        ? message.value
        : "<redacted-unsafe-diagnostic>";
  } else {
    diagnostic = "<redacted-unsafe-diagnostic>";
  }
  return diagnostic
    .replace(/postgres(?:ql)?:\/\/[^\s"')]+/giu, "<redacted-postgresql-url>")
    .replace(
      /\b(?:DATABASE_URL|PGPASSWORD|PASSWORD|SECRET|TOKEN|API_KEY)=\S+/giu,
      "<redacted-secret-assignment>",
    )
    .replace(/[A-Za-z0-9_-]{86,}/gu, "<redacted-long-secret>");
}

function validAssemblyReceipt(receipt) {
  if (
    !deepDataTree(receipt) ||
    !exactKeys(receipt, [
      "allowManifestSha256",
      "assemblyBoundary",
      "assemblyPlanDigest",
      "authorization",
      "contract",
      "current187EAuxiliaryExcluded",
      "effects",
      "entries",
      "entryCount",
      "entryManifestDigest",
      "inMemoryArtifactDigest",
      "migrationCount",
      "migrationHead",
      "migrationHeadChecksum",
      "migrationManifestDigest",
      "refreezeManifestSha256",
      "status",
    ]) ||
    receipt.contract !== ASSEMBLY_RECEIPT_CONTRACT ||
    receipt.status !== ASSEMBLY_RECEIPT_STATUS ||
    receipt.allowManifestSha256 !== ASSEMBLY_ALLOW_MANIFEST_SHA256 ||
    receipt.refreezeManifestSha256 !== ASSEMBLY_REFREEZE_MANIFEST_SHA256 ||
    receipt.assemblyPlanDigest !== ASSEMBLY_PLAN_DIGEST ||
    receipt.entryManifestDigest !== ASSEMBLY_ENTRY_MANIFEST_DIGEST ||
    receipt.inMemoryArtifactDigest !== ASSEMBLY_IN_MEMORY_ARTIFACT_DIGEST ||
    receipt.current187EAuxiliaryExcluded !== true ||
    receipt.migrationCount !== FINAL_MIGRATION_COUNT ||
    receipt.migrationHead !== FINAL_MIGRATION_HEAD ||
    receipt.migrationHeadChecksum !==
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PREFIXES.at(-1).headChecksum ||
    receipt.migrationManifestDigest !== FINAL_MIGRATION_MANIFEST_DIGEST ||
    receipt.entryCount !== FINAL_MIGRATION_COUNT + 2 ||
    !denseDataArray(receipt.entries) ||
    receipt.entries.length !== receipt.entryCount ||
    !exactKeys(receipt.authorization, ASSEMBLY_RECEIPT_AUTHORIZATION_KEYS) ||
    ASSEMBLY_RECEIPT_AUTHORIZATION_KEYS.some(
      (key) => receipt.authorization[key] !== false,
    )
  ) {
    return false;
  }
  const entriesValid = receipt.entries.every(
    (entry) =>
      exactKeys(entry, [
        "byteLength",
        "content",
        "path",
        "sha256",
        "sourceKind",
      ]) &&
      Number.isSafeInteger(entry.byteLength) &&
      entry.byteLength >= 0 &&
      typeof entry.content === "string" &&
      typeof entry.path === "string" &&
      entry.path.length >= 1 &&
      entry.path.length <= 256 &&
      typeof entry.sourceKind === "string" &&
      entry.sourceKind.length >= 1 &&
      entry.byteLength === Buffer.byteLength(entry.content, "utf8") &&
      entry.sha256 === sha256(Buffer.from(entry.content, "utf8")),
  );
  if (
    !entriesValid ||
    new Set(receipt.entries.map(({ path }) => path)).size !==
      receipt.entries.length ||
    receipt.entries[0].path !== "schema.prisma" ||
    receipt.entries[1].path !== "migrations/migration_lock.toml" ||
    sha256(
      `${receipt.entries
        .map(({ path, sha256: digest }) => `${path} ${digest}`)
        .join("\n")}\n`,
    ) !== ASSEMBLY_ENTRY_MANIFEST_DIGEST
  ) {
    return false;
  }
  const { inMemoryArtifactDigest: _ignored, ...publicArtifact } = receipt;
  const calculatedArtifactDigest = sha256(
    canonicalJson({
      ...publicArtifact,
      entries: receipt.entries.map(
        ({ byteLength, path, sha256: digest, sourceKind }) => ({
          byteLength,
          path,
          sha256: digest,
          sourceKind,
        }),
      ),
    }),
  );
  return calculatedArtifactDigest === ASSEMBLY_IN_MEMORY_ARTIFACT_DIGEST;
}

export function authorizeCurrent180Current190DisposablePostgresqlRehearsal(
  input,
) {
  if (!exactKeys(input, ["allowContract", "assemblyReceipt", "environment"])) {
    fail("DISPOSABLE_POSTGRESQL_REHEARSAL_AUTHORIZATION_DENIED", [
      "EXACT_AUTHORIZATION_INPUT_REQUIRED",
    ]);
  }
  const { allowContract, assemblyReceipt, environment } = input;
  const environmentReport =
    inspectCurrent180Current190PostgresqlRehearsalEnvironment(environment);
  const findings = [];
  if (
    allowContract !==
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT
  ) {
    findings.push("EXACT_DISPOSABLE_REHEARSAL_ALLOW_CONTRACT_REQUIRED");
  }
  if (!validAssemblyReceipt(assemblyReceipt)) {
    findings.push("EXACT_NO_AUTHORITY_ASSEMBLY_RECEIPT_REQUIRED");
  }
  const assemblerAuthorityBoundaryValid =
    plainObject(assemblyReceipt) &&
    exactKeys(
      assemblyReceipt.authorization,
      ASSEMBLY_RECEIPT_AUTHORIZATION_KEYS,
    ) &&
    ASSEMBLY_RECEIPT_AUTHORIZATION_KEYS.every(
      (key) => assemblyReceipt.authorization[key] === false,
    );
  if (!assemblerAuthorityBoundaryValid) {
    findings.push("ASSEMBLER_AUTHORITY_BOUNDARY_INVALID");
  }
  if (findings.length > 0) {
    fail("DISPOSABLE_POSTGRESQL_REHEARSAL_AUTHORIZATION_DENIED", findings);
  }
  const document = {
    assembly: {
      assemblerReceiptCanApplyDatabase: false,
      assemblerReceiptIsAuthority: false,
      assemblyPlanDigest: assemblyReceipt.assemblyPlanDigest,
      entryManifestDigest: assemblyReceipt.entryManifestDigest,
      inMemoryArtifactDigest: assemblyReceipt.inMemoryArtifactDigest,
      migrationCount: FINAL_MIGRATION_COUNT,
      migrationHead: FINAL_MIGRATION_HEAD,
      migrationHeadChecksum: assemblyReceipt.migrationHeadChecksum,
      migrationManifestDigest: FINAL_MIGRATION_MANIFEST_DIGEST,
    },
    authoritySource:
      "EXPLICIT_DISPOSABLE_REHEARSAL_CONTRACT_NOT_ASSEMBLER_RECEIPT",
    authorization: {
      canApplyExactAssemblyToOwnedWorkingDatabase: false,
      canCallExternalProviders: false,
      canConnectPinnedSourceReadOnly: false,
      canCreateOwnedDisposableDatabase: false,
      canDeploy: false,
      canDropOwnedDisposableDatabase: false,
      canExecuteRehearsal: false,
      canMutateCanonicalMigrations: false,
      canMutateProduction: false,
      canMutateRolesOrGrants: false,
      canRenameOwnedDisposableDatabase: false,
      canResolveMigration: false,
      canSpawnProcess: false,
      planningOnly: true,
      productionApplyAuthorized: false,
    },
    contract: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT,
    environment: {
      endpoint: environmentReport.source.endpoint,
      passwordPresent: environmentReport.source.passwordPresent,
      profile: environmentReport.profile,
      sourceDatabaseName: environmentReport.source.databaseName,
      sourceUrlSha256: environmentReport.source.urlSha256,
      usernameSha256: environmentReport.source.usernameSha256,
    },
    executionBoundary: {
      absoluteVerifiedExecutableRequired: true,
      inheritedPathDenied: true,
      runnerOwnedTemporaryDirectoryRequired: true,
      shell: false,
    },
    executionBlockers: [
      "AUTHENTICATED_DURABLE_JOURNAL_VERIFIER_REQUIRED",
      "EFFECTFUL_POSTGRESQL_RUNNER_NOT_IMPLEMENTED",
      "MODULE_RECEIPTS_NOT_EXECUTION_AUTHORITY",
    ],
    executionStatus: "PLANNING_ONLY_NOT_EXECUTABLE",
    status: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_STATUS,
  };
  return deepFreeze({
    ...document,
    authorizationReceiptDigest: sha256(canonicalJson(document)),
  });
}

export function buildCurrent180Current190PostgresqlRehearsalOwnershipMarker(
  input,
) {
  if (
    !exactKeys(input, ["attempt", "authorizationReceiptDigest", "runToken"])
  ) {
    fail("REHEARSAL_OWNERSHIP_MARKER_INPUT_INVALID", [
      "EXACT_MARKER_INPUT_REQUIRED",
    ]);
  }
  const { attempt, authorizationReceiptDigest, runToken } = input;
  if (
    !Number.isInteger(attempt) ||
    attempt < 1 ||
    attempt > 2 ||
    !SHA256_PATTERN.test(String(authorizationReceiptDigest ?? "")) ||
    !TOKEN_PATTERN.test(String(runToken ?? ""))
  ) {
    fail("REHEARSAL_OWNERSHIP_MARKER_INPUT_INVALID", [
      "EXACT_MARKER_INPUT_REQUIRED",
    ]);
  }
  return `LEETPLUS_CURRENT180190_REHEARSAL_V1:${sha256(
    canonicalJson({ attempt, authorizationReceiptDigest, runToken }),
  )}`;
}

export function buildCurrent180Current190PostgresqlRehearsalOwnershipIdentity(
  input,
) {
  if (
    !exactKeys(input, [
      "attempt",
      "authorizationReceiptDigest",
      "oid",
      "ownerName",
      "ownerOid",
      "runToken",
    ]) ||
    !positiveOid(input.oid) ||
    !positiveOid(input.ownerOid) ||
    input.ownerName !== SOURCE_USERNAME
  ) {
    fail("REHEARSAL_OWNERSHIP_IDENTITY_INPUT_INVALID", [
      "EXACT_OWNERSHIP_IDENTITY_INPUT_REQUIRED",
    ]);
  }
  const identity = {
    attempt: input.attempt,
    authorizationReceiptDigest: input.authorizationReceiptDigest,
    marker: buildCurrent180Current190PostgresqlRehearsalOwnershipMarker({
      attempt: input.attempt,
      authorizationReceiptDigest: input.authorizationReceiptDigest,
      runToken: input.runToken,
    }),
    oid: input.oid,
    ownerName: input.ownerName,
    ownerOid: input.ownerOid,
    runToken: input.runToken,
  };
  return deepFreeze({
    ...identity,
    identityDigest: sha256(canonicalJson(identity)),
  });
}

function positiveOid(value) {
  return Number.isInteger(value) && value >= 1 && value <= 4_294_967_295;
}

function normalizeCatalogRows(rows) {
  if (!denseDataArray(rows)) {
    fail("REHEARSAL_CATALOG_SNAPSHOT_INVALID", ["CATALOG_ROWS_ARRAY_REQUIRED"]);
  }
  return rows.map((row) => {
    if (
      !exactKeys(row, [
        "allowConnections",
        "isTemplate",
        "marker",
        "name",
        "oid",
        "ownerName",
        "ownerOid",
      ]) ||
      typeof row.name !== "string" ||
      row.name.length < 1 ||
      row.name.length > 63 ||
      !positiveOid(row.oid) ||
      !positiveOid(row.ownerOid) ||
      typeof row.ownerName !== "string" ||
      row.ownerName.length < 1 ||
      row.ownerName.length > 63 ||
      typeof row.allowConnections !== "boolean" ||
      typeof row.isTemplate !== "boolean" ||
      !(
        row.marker === null ||
        (typeof row.marker === "string" && row.marker.length <= 128)
      )
    ) {
      fail("REHEARSAL_CATALOG_SNAPSHOT_INVALID", ["CATALOG_ROW_INVALID"]);
    }
    return { ...row };
  });
}

function catalogDecision(decision, options = {}) {
  const receipt = {
    authorization: {
      canDeleteForeignDatabase: false,
      canExecuteRehearsal: false,
      canMutateProduction: false,
      canResolveMigration: false,
      planningOnly: true,
      productionApplyAuthorized: false,
    },
    catalogScope: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE,
    contract:
      "CURRENT180_CURRENT190_POSTGRESQL_CATALOG_RECONCILIATION_RECEIPT_V1",
    decision,
    status: "PLANNING_ONLY_RECONCILIATION_EVIDENCE",
    ...options,
  };
  return deepFreeze({
    ...receipt,
    reconciliationReceiptDigest: sha256(canonicalJson(receipt)),
  });
}

function exactOwnedRow(row, expected) {
  return (
    row !== undefined &&
    row.oid === expected.oid &&
    row.ownerOid === expected.ownerOid &&
    row.ownerName === expected.ownerName &&
    row.marker === expected.marker &&
    row.isTemplate === false
  );
}

function exactSealedOwnedRow(row, expected) {
  return exactOwnedRow(row, expected) && row.allowConnections === false;
}

function validExpectedIdentity(value) {
  if (
    !exactKeys(value, [
      "attempt",
      "authorizationReceiptDigest",
      "identityDigest",
      "marker",
      "oid",
      "ownerName",
      "ownerOid",
      "runToken",
    ])
  ) {
    return false;
  }
  try {
    const expected =
      buildCurrent180Current190PostgresqlRehearsalOwnershipIdentity({
        attempt: value.attempt,
        authorizationReceiptDigest: value.authorizationReceiptDigest,
        oid: value.oid,
        ownerName: value.ownerName,
        ownerOid: value.ownerOid,
        runToken: value.runToken,
      });
    return canonicalJson(expected) === canonicalJson(value);
  } catch (error) {
    if (error instanceof Current180Current190PostgresqlRehearsalContractError) {
      return false;
    }
    throw error;
  }
}

function expectedMarkerFromOwnershipContext(value) {
  if (
    !exactKeys(value, [
      "attempt",
      "authorizationReceiptDigest",
      "ownerName",
      "ownerOid",
      "runToken",
    ]) ||
    !positiveOid(value.ownerOid) ||
    value.ownerName !== SOURCE_USERNAME
  ) {
    return null;
  }
  try {
    return buildCurrent180Current190PostgresqlRehearsalOwnershipMarker({
      attempt: value.attempt,
      authorizationReceiptDigest: value.authorizationReceiptDigest,
      runToken: value.runToken,
    });
  } catch (error) {
    if (error instanceof Current180Current190PostgresqlRehearsalContractError) {
      return null;
    }
    throw error;
  }
}

function databaseRunToken(databaseName) {
  return WORKING_DATABASE_PATTERN.test(databaseName)
    ? databaseName.slice("lp_imtec_".length, -"_ci".length)
    : FINAL_DATABASE_PATTERN.test(databaseName)
      ? databaseName.slice("lp_c180190_".length, -"_ci".length)
      : null;
}

function matchingDatabaseNamePair(workingDatabaseName, finalDatabaseName) {
  const working = WORKING_DATABASE_PATTERN.exec(workingDatabaseName);
  const final = FINAL_DATABASE_PATTERN.exec(finalDatabaseName);
  return (
    working !== null &&
    final !== null &&
    workingDatabaseName.slice("lp_imtec_".length, -"_ci".length) ===
      finalDatabaseName.slice("lp_c180190_".length, -"_ci".length)
  );
}

export function reconcileCurrent180Current190PostgresqlRehearsalCreate(input) {
  if (
    !exactKeys(input, [
      "absencePreflightPassed",
      "catalogScope",
      "commandAttempted",
      "finalDatabaseName",
      "ownershipContext",
      "rows",
      "workingDatabaseName",
    ])
  ) {
    fail("REHEARSAL_CREATE_RECONCILIATION_INVALID", [
      "EXACT_CREATE_RECONCILIATION_INPUT_REQUIRED",
    ]);
  }
  const {
    absencePreflightPassed,
    catalogScope,
    commandAttempted,
    finalDatabaseName,
    ownershipContext,
    rows,
    workingDatabaseName,
  } = input;
  const expectedMarker = expectedMarkerFromOwnershipContext(ownershipContext);
  if (
    absencePreflightPassed !== true ||
    catalogScope !== CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE ||
    commandAttempted !== true ||
    expectedMarker === null ||
    !matchingDatabaseNamePair(
      String(workingDatabaseName ?? ""),
      String(finalDatabaseName ?? ""),
    ) ||
    databaseRunToken(workingDatabaseName) !== ownershipContext.runToken
  ) {
    fail("REHEARSAL_CREATE_RECONCILIATION_INVALID", [
      "CREATE_ATTEMPT_AND_ABSENCE_PREFLIGHT_REQUIRED",
    ]);
  }
  const normalized = normalizeCatalogRows(rows);
  const working = normalized.filter(({ name }) => name === workingDatabaseName);
  const final = normalized.filter(({ name }) => name === finalDatabaseName);
  const expectedMarkerRows = normalized.filter(
    ({ marker }) => marker === expectedMarker,
  );
  if (working.length === 0 && final.length === 0) {
    if (expectedMarkerRows.length > 0) {
      return catalogDecision("CREATE_RECONCILIATION_BLOCKED", {
        safeToRetry: false,
      });
    }
    return catalogDecision("CREATE_NOT_COMMITTED_RETRY_SAFE", {
      safeToRetry: true,
    });
  }
  if (
    working.length === 1 &&
    final.length === 0 &&
    working[0].ownerOid === ownershipContext.ownerOid &&
    working[0].ownerName === ownershipContext.ownerName &&
    working[0].allowConnections === false &&
    working[0].isTemplate === false &&
    working[0].marker === expectedMarker &&
    expectedMarkerRows.length === 1
  ) {
    const ownershipIdentity =
      buildCurrent180Current190PostgresqlRehearsalOwnershipIdentity({
        ...ownershipContext,
        oid: working[0].oid,
      });
    return catalogDecision("CREATE_COMMITTED_RECONCILED", {
      databaseOid: working[0].oid,
      markerState: "MARKED",
      ownershipIdentity,
      safeToMark: false,
      safeToRetry: false,
    });
  }
  if (
    working.length === 1 &&
    final.length === 0 &&
    working[0].ownerOid === ownershipContext.ownerOid &&
    working[0].ownerName === ownershipContext.ownerName &&
    working[0].allowConnections === false &&
    working[0].isTemplate === false &&
    working[0].marker === null
  ) {
    return catalogDecision("CREATE_UNMARKED_AMBIGUOUS_BLOCKED", {
      manualCleanupRequired: true,
      safeToMark: false,
      safeToRetry: false,
    });
  }
  return catalogDecision("CREATE_RECONCILIATION_BLOCKED", {
    safeToRetry: false,
  });
}

export function reconcileCurrent180Current190PostgresqlRehearsalRename(input) {
  if (
    !exactKeys(input, [
      "expectedIdentity",
      "catalogScope",
      "fromDatabaseName",
      "rows",
      "toDatabaseName",
    ])
  ) {
    fail("REHEARSAL_RENAME_RECONCILIATION_INVALID", [
      "EXACT_RENAME_RECONCILIATION_INPUT_REQUIRED",
    ]);
  }
  const {
    catalogScope,
    expectedIdentity,
    fromDatabaseName,
    rows,
    toDatabaseName,
  } = input;
  if (
    catalogScope !== CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE ||
    !validExpectedIdentity(expectedIdentity) ||
    typeof fromDatabaseName !== "string" ||
    typeof toDatabaseName !== "string" ||
    fromDatabaseName === toDatabaseName ||
    !(
      (matchingDatabaseNamePair(fromDatabaseName, toDatabaseName) &&
        WORKING_DATABASE_PATTERN.test(fromDatabaseName)) ||
      (matchingDatabaseNamePair(toDatabaseName, fromDatabaseName) &&
        FINAL_DATABASE_PATTERN.test(fromDatabaseName))
    ) ||
    databaseRunToken(fromDatabaseName) !== expectedIdentity.runToken ||
    databaseRunToken(toDatabaseName) !== expectedIdentity.runToken
  ) {
    fail("REHEARSAL_RENAME_RECONCILIATION_INVALID", [
      "EXACT_RENAME_IDENTITY_REQUIRED",
    ]);
  }
  const normalized = normalizeCatalogRows(rows);
  const from = normalized.filter(({ name }) => name === fromDatabaseName);
  const to = normalized.filter(({ name }) => name === toDatabaseName);
  const identityOutsideExpectedNames = normalized.some(
    ({ marker, name, oid }) =>
      ![fromDatabaseName, toDatabaseName].includes(name) &&
      (oid === expectedIdentity.oid || marker === expectedIdentity.marker),
  );
  if (identityOutsideExpectedNames) {
    return catalogDecision("RENAME_RECONCILIATION_BLOCKED", {
      safeToRetry: false,
    });
  }
  if (
    from.length === 1 &&
    to.length === 0 &&
    exactSealedOwnedRow(from[0], expectedIdentity)
  ) {
    return catalogDecision("RENAME_NOT_COMMITTED_RETRY_SAFE", {
      databaseName: fromDatabaseName,
      safeToRetry: true,
    });
  }
  if (
    from.length === 0 &&
    to.length === 1 &&
    exactSealedOwnedRow(to[0], expectedIdentity)
  ) {
    return catalogDecision("RENAME_COMMITTED_RECONCILED", {
      databaseName: toDatabaseName,
      safeToRetry: false,
    });
  }
  return catalogDecision("RENAME_RECONCILIATION_BLOCKED", {
    safeToRetry: false,
  });
}

export function reconcileCurrent180Current190PostgresqlRehearsalAllowConnections(
  input,
) {
  if (
    !exactKeys(input, [
      "databaseName",
      "catalogScope",
      "expectedAllowConnections",
      "expectedIdentity",
      "rows",
    ])
  ) {
    fail("REHEARSAL_ALLOW_RECONCILIATION_INVALID", [
      "EXACT_ALLOW_RECONCILIATION_INPUT_REQUIRED",
    ]);
  }
  const {
    catalogScope,
    databaseName,
    expectedAllowConnections,
    expectedIdentity,
    rows,
  } = input;
  if (
    catalogScope !== CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE ||
    typeof expectedAllowConnections !== "boolean" ||
    !validExpectedIdentity(expectedIdentity) ||
    !(
      WORKING_DATABASE_PATTERN.test(String(databaseName ?? "")) ||
      FINAL_DATABASE_PATTERN.test(String(databaseName ?? ""))
    ) ||
    databaseRunToken(databaseName) !== expectedIdentity.runToken
  ) {
    fail("REHEARSAL_ALLOW_RECONCILIATION_INVALID", [
      "EXACT_ALLOW_IDENTITY_REQUIRED",
    ]);
  }
  const normalized = normalizeCatalogRows(rows);
  const matching = normalized.filter(({ name }) => name === databaseName);
  if (
    matching.length !== 1 ||
    !exactOwnedRow(matching[0], expectedIdentity) ||
    normalized.filter(
      ({ marker, oid }) =>
        oid === expectedIdentity.oid || marker === expectedIdentity.marker,
    ).length !== 1
  ) {
    return catalogDecision("ALLOW_RECONCILIATION_BLOCKED", {
      safeToRetry: false,
    });
  }
  return catalogDecision(
    matching[0].allowConnections === expectedAllowConnections
      ? "ALLOW_SETTING_COMMITTED_RECONCILED"
      : "ALLOW_SETTING_NOT_COMMITTED_RETRY_SAFE",
    {
      safeToRetry: matching[0].allowConnections !== expectedAllowConnections,
    },
  );
}

export function reconcileCurrent180Current190PostgresqlRehearsalDrop(input) {
  if (
    !exactKeys(input, [
      "expectedIdentity",
      "catalogScope",
      "finalDatabaseName",
      "rows",
      "workingDatabaseName",
    ])
  ) {
    fail("REHEARSAL_DROP_RECONCILIATION_INVALID", [
      "EXACT_DROP_RECONCILIATION_INPUT_REQUIRED",
    ]);
  }
  const {
    catalogScope,
    expectedIdentity,
    finalDatabaseName,
    rows,
    workingDatabaseName,
  } = input;
  if (
    catalogScope !== CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CATALOG_SCOPE ||
    !validExpectedIdentity(expectedIdentity) ||
    !matchingDatabaseNamePair(
      String(workingDatabaseName ?? ""),
      String(finalDatabaseName ?? ""),
    ) ||
    databaseRunToken(workingDatabaseName) !== expectedIdentity.runToken
  ) {
    fail("REHEARSAL_DROP_RECONCILIATION_INVALID", [
      "EXACT_DROP_IDENTITY_REQUIRED",
    ]);
  }
  const normalized = normalizeCatalogRows(rows);
  const candidates = normalized.filter(({ name }) =>
    [workingDatabaseName, finalDatabaseName].includes(name),
  );
  const matchingIdentityRows = normalized.filter(
    ({ marker, oid }) =>
      oid === expectedIdentity.oid || marker === expectedIdentity.marker,
  );
  if (candidates.length === 0) {
    if (matchingIdentityRows.length > 0) {
      return catalogDecision("DROP_RECONCILIATION_BLOCKED", {
        safeToRetry: false,
      });
    }
    return catalogDecision("DROP_COMMITTED_RECONCILED", {
      safeToRetry: false,
    });
  }
  if (
    candidates.length === 1 &&
    exactSealedOwnedRow(candidates[0], expectedIdentity) &&
    matchingIdentityRows.length === 1
  ) {
    return catalogDecision("DROP_NOT_COMMITTED_RETRY_SAFE", {
      databaseName: candidates[0].name,
      safeToRetry: true,
    });
  }
  return catalogDecision("DROP_RECONCILIATION_BLOCKED", {
    safeToRetry: false,
  });
}

export function evaluateCurrent180Current190PostgresqlSourcePreflight(
  snapshot,
) {
  const findings = [];
  if (
    !exactKeys(snapshot, [
      "claimedOutboxCount",
      "current180SuccessorObjectCount",
      "current186NamedRoutineCount",
      "currentUserCanCreateDatabase",
      "currentUserName",
      "currentUserOid",
      "currentUserSuperuser",
      "databaseName",
      "databaseOid",
      "databaseOwnerOid",
      "databaseOwnerName",
      "enrollmentCount",
      "host",
      "identityClaimLockOwnerOid",
      "isTemplate",
      "migrationCount",
      "migrationHead",
      "migrationHeadChecksum",
      "migrationManifestDigest",
      "otherSessionCount",
      "port",
      "requiredRelationOwners",
      "rolledBackMigrationCount",
      "serverVersionNumber",
      "sourceFingerprint",
      "sourceUrlSha256",
      "unfinishedMigrationCount",
    ])
  ) {
    return deepFreeze({
      findings: ["SOURCE_PREFLIGHT_SNAPSHOT_INVALID"],
      status: "SOURCE_PREFLIGHT_BLOCKED",
      verified: false,
    });
  }
  if (
    snapshot.databaseName !== SOURCE_DATABASE ||
    snapshot.host !== SOURCE_HOST ||
    snapshot.port !== Number(SOURCE_PORT)
  ) {
    findings.push("SOURCE_DATABASE_IDENTITY_MISMATCH");
  }
  const countFields = [
    "claimedOutboxCount",
    "current180SuccessorObjectCount",
    "current186NamedRoutineCount",
    "enrollmentCount",
    "migrationCount",
    "otherSessionCount",
    "rolledBackMigrationCount",
    "unfinishedMigrationCount",
  ];
  if (
    countFields.some(
      (field) => !Number.isSafeInteger(snapshot[field]) || snapshot[field] < 0,
    )
  ) {
    findings.push("SOURCE_NUMERIC_EVIDENCE_INVALID");
  }
  if (
    !Number.isSafeInteger(snapshot.serverVersionNumber) ||
    snapshot.serverVersionNumber < 160_000 ||
    snapshot.serverVersionNumber >= 170_000
  ) {
    findings.push("POSTGRESQL_16_REQUIRED");
  }
  if (
    !positiveOid(snapshot.databaseOid) ||
    !positiveOid(snapshot.databaseOwnerOid) ||
    snapshot.currentUserOid !== snapshot.databaseOwnerOid ||
    snapshot.currentUserName !== SOURCE_USERNAME ||
    snapshot.databaseOwnerName !== SOURCE_USERNAME ||
    snapshot.currentUserSuperuser !== true ||
    snapshot.currentUserCanCreateDatabase !== true ||
    snapshot.isTemplate !== false
  ) {
    findings.push("SOURCE_OWNER_AUTHORITY_MISMATCH");
  }
  const relationOwnersValid =
    denseDataArray(snapshot.requiredRelationOwners) &&
    snapshot.requiredRelationOwners.length ===
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS.length &&
    snapshot.requiredRelationOwners.every(
      (entry, index) =>
        exactKeys(entry, ["ownerOid", "relationName"]) &&
        entry.relationName ===
          CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS[index] &&
        entry.ownerOid === snapshot.databaseOwnerOid,
    );
  if (
    !relationOwnersValid ||
    snapshot.identityClaimLockOwnerOid !== snapshot.databaseOwnerOid
  ) {
    findings.push("SOURCE_OBJECT_OWNER_PARITY_MISMATCH");
  }
  if (
    snapshot.migrationCount !== SOURCE_MIGRATION_COUNT ||
    snapshot.migrationHead !== SOURCE_MIGRATION_HEAD ||
    snapshot.migrationHeadChecksum !== SOURCE_MIGRATION_HEAD_SHA256 ||
    snapshot.migrationManifestDigest !== SOURCE_MIGRATION_MANIFEST_DIGEST ||
    snapshot.unfinishedMigrationCount !== 0 ||
    snapshot.rolledBackMigrationCount !== 0
  ) {
    findings.push("SOURCE_MIGRATION_HISTORY_MISMATCH");
  }
  if (
    snapshot.enrollmentCount !== 0 ||
    snapshot.claimedOutboxCount !== 0 ||
    snapshot.current180SuccessorObjectCount !== 0 ||
    snapshot.current186NamedRoutineCount !== 0
  ) {
    findings.push("SOURCE_CANDIDATE_PRECONDITION_NOT_EMPTY");
  }
  if (snapshot.otherSessionCount !== 0) {
    findings.push("SOURCE_HAS_OTHER_SESSIONS");
  }
  if (!SHA256_PATTERN.test(String(snapshot.sourceFingerprint ?? ""))) {
    findings.push("SOURCE_FINGERPRINT_INVALID");
  }
  if (!SHA256_PATTERN.test(String(snapshot.sourceUrlSha256 ?? ""))) {
    findings.push("SOURCE_URL_PIN_INVALID");
  }
  const result = {
    effects: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_EFFECTS,
    findings: [...new Set(findings)].sort(compareText),
    status:
      findings.length === 0
        ? "SOURCE_PREFLIGHT_ACCEPTED"
        : "SOURCE_PREFLIGHT_BLOCKED",
    verified: findings.length === 0,
  };
  if (findings.length > 0) return deepFreeze(result);
  const sourcePin = {
    contract: "CURRENT180_CURRENT190_POSTGRESQL_SOURCE_PIN_V1",
    currentUserOid: snapshot.currentUserOid,
    currentUserName: snapshot.currentUserName,
    databaseName: snapshot.databaseName,
    databaseOid: snapshot.databaseOid,
    databaseOwnerOid: snapshot.databaseOwnerOid,
    databaseOwnerName: snapshot.databaseOwnerName,
    host: snapshot.host,
    identityClaimLockOwnerOid: snapshot.identityClaimLockOwnerOid,
    migrationCount: snapshot.migrationCount,
    migrationHead: snapshot.migrationHead,
    migrationHeadChecksum: snapshot.migrationHeadChecksum,
    migrationManifestDigest: snapshot.migrationManifestDigest,
    port: snapshot.port,
    requiredRelationOwners: snapshot.requiredRelationOwners.map((entry) => ({
      ...entry,
    })),
    serverVersionNumber: snapshot.serverVersionNumber,
    sourceFingerprint: snapshot.sourceFingerprint,
    sourceUrlSha256: snapshot.sourceUrlSha256,
  };
  return deepFreeze({
    ...result,
    sourcePin: {
      ...sourcePin,
      sourcePinDigest: sha256(canonicalJson(sourcePin)),
    },
  });
}

export function evaluateCurrent180Current190PostgresqlPrismaPrefix(input) {
  if (!exactKeys(input, ["assemblyReceipt", "rows"])) {
    fail("REHEARSAL_PRISMA_PREFIX_INVALID", [
      "EXACT_PRISMA_PREFIX_INPUT_REQUIRED",
    ]);
  }
  const { assemblyReceipt, rows } = input;
  if (!validAssemblyReceipt(assemblyReceipt)) {
    fail("REHEARSAL_PRISMA_PREFIX_INVALID", [
      "EXACT_ASSEMBLY_RECEIPT_REQUIRED",
    ]);
  }
  if (!denseDataArray(rows)) {
    fail("REHEARSAL_PRISMA_PREFIX_INVALID", ["EXACT_PRISMA_ROWS_REQUIRED"]);
  }
  const rowsValid = rows.every(
    (row) =>
      exactKeys(row, [
        "appliedStepsCount",
        "checksum",
        "finishedAt",
        "migrationName",
        "rolledBackAt",
      ]) &&
      Number.isSafeInteger(row.appliedStepsCount) &&
      row.appliedStepsCount >= 0 &&
      typeof row.checksum === "string" &&
      SHA256_PATTERN.test(row.checksum) &&
      typeof row.migrationName === "string" &&
      MIGRATION_NAME_PATTERN.test(row.migrationName) &&
      (row.finishedAt === null ||
        (typeof row.finishedAt === "string" &&
          row.finishedAt.length >= 1 &&
          row.finishedAt.length <= 64)) &&
      (row.rolledBackAt === null ||
        (typeof row.rolledBackAt === "string" &&
          row.rolledBackAt.length >= 1 &&
          row.rolledBackAt.length <= 64)),
  );
  if (!rowsValid) {
    fail("REHEARSAL_PRISMA_PREFIX_INVALID", ["EXACT_PRISMA_ROWS_REQUIRED"]);
  }
  const base = {
    authorization: {
      canManuallyWriteMigrationHistory: false,
      canResolveMigration: false,
      productionApplyAuthorized: false,
    },
  };
  if (
    rows.some(
      ({ finishedAt, rolledBackAt }) =>
        finishedAt === null || rolledBackAt !== null,
    )
  ) {
    return deepFreeze({
      ...base,
      decision: "PRISMA_FAILED_OR_UNFINISHED_DISCARD_DATABASE",
      safeToRetryDeploy: false,
      safeToResolveMigration: false,
    });
  }
  if (
    new Set(rows.map(({ migrationName }) => migrationName)).size !== rows.length
  ) {
    return deepFreeze({
      ...base,
      decision: "PRISMA_PREFIX_DRIFT_BLOCKED",
      safeToRetryDeploy: false,
      safeToResolveMigration: false,
    });
  }
  const expectedMigrations = assemblyReceipt.entries
    .slice(2)
    .map(({ path, sha256: checksum }) => {
      const match = /^migrations\/(\d{14}_[a-z0-9_]+)\/migration\.sql$/u.exec(
        path,
      );
      return match === null ? null : { checksum, migrationName: match[1] };
    });
  if (
    expectedMigrations.length !== FINAL_MIGRATION_COUNT ||
    expectedMigrations.some((entry) => entry === null)
  ) {
    fail("REHEARSAL_PRISMA_PREFIX_INVALID", [
      "ASSEMBLY_MIGRATION_ENTRIES_INVALID",
    ]);
  }
  const exactRows = rows.every(
    (row, index) =>
      index < expectedMigrations.length &&
      row.migrationName === expectedMigrations[index].migrationName &&
      row.checksum === expectedMigrations[index].checksum &&
      row.appliedStepsCount === 1,
  );
  const expectedPrefix =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PREFIXES.find(
      ({ count }) => count === rows.length,
    );
  const calculatedManifestDigest = sha256(
    `${expectedMigrations
      .slice(0, rows.length)
      .map(({ migrationName, checksum }) => `${migrationName} ${checksum}`)
      .join("\n")}\n`,
  );
  if (
    !exactRows ||
    expectedPrefix === undefined ||
    rows.at(-1)?.migrationName !== expectedPrefix.head ||
    rows.at(-1)?.checksum !== expectedPrefix.headChecksum ||
    calculatedManifestDigest !== expectedPrefix.digest
  ) {
    return deepFreeze({
      ...base,
      decision: "PRISMA_PREFIX_DRIFT_BLOCKED",
      safeToRetryDeploy: false,
      safeToResolveMigration: false,
    });
  }
  const prefixEvidence = {
    assemblyArtifactDigest: assemblyReceipt.inMemoryArtifactDigest,
    completedMigrationCount: rows.length,
    completedMigrationHead: rows.at(-1).migrationName,
    completedMigrationManifestDigest: calculatedManifestDigest,
    contract: "CURRENT180_CURRENT190_POSTGRESQL_PRISMA_PREFIX_EVIDENCE_V1",
    rowsDigest: sha256(canonicalJson(rows)),
  };
  const exactFinal = rows.length === FINAL_MIGRATION_COUNT;
  return deepFreeze({
    ...base,
    completedMigrationCount: rows.length,
    completedMigrationHead: rows.at(-1).migrationName,
    decision: exactFinal
      ? "PRISMA_EXACT_CURRENT190_COMMITTED"
      : "PRISMA_EXACT_PREFIX_RETRY_SAFE",
    prefixEvidence: {
      ...prefixEvidence,
      prefixEvidenceDigest: sha256(canonicalJson(prefixEvidence)),
    },
    safeToRetryDeploy: !exactFinal,
    safeToResolveMigration: false,
  });
}

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITION_EVIDENCE_CONTRACT =
  "CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITION_EVIDENCE_V1";

const TRANSITION_EVIDENCE_STATUS =
  "VERIFIED_DISPOSABLE_POSTGRESQL_REHEARSAL_EVIDENCE";
const STATE_KEYS = Object.freeze([
  "authorizationReceiptDigest",
  "eventCount",
  "evidenceChainDigest",
  "lastEvent",
  "lastEvidenceReceiptDigest",
  "names",
  "outcome",
  "ownershipIdentity",
  "phase",
  "prismaPrefixEvidence",
  "sourcePin",
  "sourceUrlSha256",
  "stateDigest",
]);
const AUTHORIZATION_RECEIPT_ASSEMBLY = deepFreeze({
  assemblerReceiptCanApplyDatabase: false,
  assemblerReceiptIsAuthority: false,
  assemblyPlanDigest: ASSEMBLY_PLAN_DIGEST,
  entryManifestDigest: ASSEMBLY_ENTRY_MANIFEST_DIGEST,
  inMemoryArtifactDigest: ASSEMBLY_IN_MEMORY_ARTIFACT_DIGEST,
  migrationCount: FINAL_MIGRATION_COUNT,
  migrationHead: FINAL_MIGRATION_HEAD,
  migrationHeadChecksum:
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PREFIXES.at(-1).headChecksum,
  migrationManifestDigest: FINAL_MIGRATION_MANIFEST_DIGEST,
});
const AUTHORIZATION_RECEIPT_PERMISSIONS = deepFreeze({
  canApplyExactAssemblyToOwnedWorkingDatabase: false,
  canCallExternalProviders: false,
  canConnectPinnedSourceReadOnly: false,
  canCreateOwnedDisposableDatabase: false,
  canDeploy: false,
  canDropOwnedDisposableDatabase: false,
  canExecuteRehearsal: false,
  canMutateCanonicalMigrations: false,
  canMutateProduction: false,
  canMutateRolesOrGrants: false,
  canRenameOwnedDisposableDatabase: false,
  canResolveMigration: false,
  canSpawnProcess: false,
  planningOnly: true,
  productionApplyAuthorized: false,
});
const AUTHORIZATION_RECEIPT_EXECUTION_BOUNDARY = deepFreeze({
  absoluteVerifiedExecutableRequired: true,
  inheritedPathDenied: true,
  runnerOwnedTemporaryDirectoryRequired: true,
  shell: false,
});
const AUTHORIZATION_RECEIPT_EXECUTION_BLOCKERS = deepFreeze([
  "AUTHENTICATED_DURABLE_JOURNAL_VERIFIER_REQUIRED",
  "EFFECTFUL_POSTGRESQL_RUNNER_NOT_IMPLEMENTED",
  "MODULE_RECEIPTS_NOT_EXECUTION_AUTHORITY",
]);
const FAILED_REHEARSAL_PHASES = new Set([
  "BLOCKED",
  "CLEANUP_REQUIRED",
  "CLEANUP_DROP_PENDING",
  "CLEANUP_ABSENCE_VERIFIED",
  "FAILED_CLEAN",
]);

function expectedOutcomeForPhase(phase) {
  return phase === "PROVISIONAL_DURABLE_RECOVERY_REQUIRED"
    ? "RECOVERY"
    : FAILED_REHEARSAL_PHASES.has(phase)
      ? "FAILED"
      : "ACTIVE";
}

function validAuthorizationReceipt(receipt) {
  if (
    !deepDataTree(receipt) ||
    !exactKeys(receipt, [
      "assembly",
      "authoritySource",
      "authorization",
      "authorizationReceiptDigest",
      "contract",
      "environment",
      "executionBoundary",
      "executionBlockers",
      "executionStatus",
      "status",
    ]) ||
    receipt.contract !==
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_CONTRACT ||
    receipt.status !==
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_AUTHORIZATION_STATUS ||
    receipt.authoritySource !==
      "EXPLICIT_DISPOSABLE_REHEARSAL_CONTRACT_NOT_ASSEMBLER_RECEIPT" ||
    !SHA256_PATTERN.test(receipt.authorizationReceiptDigest) ||
    !exactKeys(receipt.assembly, Object.keys(AUTHORIZATION_RECEIPT_ASSEMBLY)) ||
    canonicalJson(receipt.assembly) !==
      canonicalJson(AUTHORIZATION_RECEIPT_ASSEMBLY) ||
    !exactKeys(
      receipt.authorization,
      Object.keys(AUTHORIZATION_RECEIPT_PERMISSIONS),
    ) ||
    canonicalJson(receipt.authorization) !==
      canonicalJson(AUTHORIZATION_RECEIPT_PERMISSIONS) ||
    !exactKeys(receipt.environment, [
      "endpoint",
      "passwordPresent",
      "profile",
      "sourceDatabaseName",
      "sourceUrlSha256",
      "usernameSha256",
    ]) ||
    receipt.environment.endpoint !== `${SOURCE_HOST}:${SOURCE_PORT}` ||
    receipt.environment.profile !==
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PROFILE ||
    receipt.environment.sourceDatabaseName !== SOURCE_DATABASE ||
    typeof receipt.environment.passwordPresent !== "boolean" ||
    !SHA256_PATTERN.test(receipt.environment.sourceUrlSha256) ||
    receipt.environment.usernameSha256 !==
      sha256(Buffer.from(SOURCE_USERNAME, "utf8")) ||
    !exactKeys(
      receipt.executionBoundary,
      Object.keys(AUTHORIZATION_RECEIPT_EXECUTION_BOUNDARY),
    ) ||
    canonicalJson(receipt.executionBoundary) !==
      canonicalJson(AUTHORIZATION_RECEIPT_EXECUTION_BOUNDARY) ||
    receipt.executionStatus !== "PLANNING_ONLY_NOT_EXECUTABLE" ||
    !denseDataArray(receipt.executionBlockers) ||
    canonicalJson(receipt.executionBlockers) !==
      canonicalJson(AUTHORIZATION_RECEIPT_EXECUTION_BLOCKERS)
  ) {
    return false;
  }
  const { authorizationReceiptDigest: _ignored, ...document } = receipt;
  return receipt.authorizationReceiptDigest === sha256(canonicalJson(document));
}

function validSourcePin(sourcePin) {
  if (
    !deepDataTree(sourcePin) ||
    !exactKeys(sourcePin, [
      "contract",
      "currentUserName",
      "currentUserOid",
      "databaseName",
      "databaseOid",
      "databaseOwnerName",
      "databaseOwnerOid",
      "host",
      "identityClaimLockOwnerOid",
      "migrationCount",
      "migrationHead",
      "migrationHeadChecksum",
      "migrationManifestDigest",
      "port",
      "requiredRelationOwners",
      "serverVersionNumber",
      "sourceFingerprint",
      "sourcePinDigest",
      "sourceUrlSha256",
    ]) ||
    sourcePin.contract !== "CURRENT180_CURRENT190_POSTGRESQL_SOURCE_PIN_V1" ||
    sourcePin.currentUserName !== SOURCE_USERNAME ||
    sourcePin.databaseOwnerName !== SOURCE_USERNAME ||
    sourcePin.currentUserOid !== sourcePin.databaseOwnerOid ||
    !positiveOid(sourcePin.currentUserOid) ||
    !positiveOid(sourcePin.databaseOid) ||
    sourcePin.databaseName !== SOURCE_DATABASE ||
    sourcePin.host !== SOURCE_HOST ||
    sourcePin.port !== Number(SOURCE_PORT) ||
    sourcePin.identityClaimLockOwnerOid !== sourcePin.databaseOwnerOid ||
    sourcePin.migrationCount !== SOURCE_MIGRATION_COUNT ||
    sourcePin.migrationHead !== SOURCE_MIGRATION_HEAD ||
    sourcePin.migrationHeadChecksum !== SOURCE_MIGRATION_HEAD_SHA256 ||
    sourcePin.migrationManifestDigest !== SOURCE_MIGRATION_MANIFEST_DIGEST ||
    !Number.isSafeInteger(sourcePin.serverVersionNumber) ||
    sourcePin.serverVersionNumber < 160_000 ||
    sourcePin.serverVersionNumber >= 170_000 ||
    !SHA256_PATTERN.test(sourcePin.sourceFingerprint) ||
    !SHA256_PATTERN.test(sourcePin.sourceUrlSha256) ||
    !denseDataArray(sourcePin.requiredRelationOwners) ||
    sourcePin.requiredRelationOwners.length !==
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS.length ||
    sourcePin.requiredRelationOwners.some(
      (entry, index) =>
        !exactKeys(entry, ["ownerOid", "relationName"]) ||
        entry.ownerOid !== sourcePin.databaseOwnerOid ||
        entry.relationName !==
          CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_RELATIONS[index],
    ) ||
    !SHA256_PATTERN.test(sourcePin.sourcePinDigest)
  ) {
    return false;
  }
  const { sourcePinDigest: _ignored, ...document } = sourcePin;
  return sourcePin.sourcePinDigest === sha256(canonicalJson(document));
}

function validPrismaPrefixEvidence(evidence) {
  if (
    !exactKeys(evidence, [
      "assemblyArtifactDigest",
      "completedMigrationCount",
      "completedMigrationHead",
      "completedMigrationManifestDigest",
      "contract",
      "prefixEvidenceDigest",
      "rowsDigest",
    ]) ||
    evidence.contract !==
      "CURRENT180_CURRENT190_POSTGRESQL_PRISMA_PREFIX_EVIDENCE_V1" ||
    evidence.assemblyArtifactDigest !== ASSEMBLY_IN_MEMORY_ARTIFACT_DIGEST ||
    evidence.completedMigrationCount !== FINAL_MIGRATION_COUNT ||
    evidence.completedMigrationHead !== FINAL_MIGRATION_HEAD ||
    evidence.completedMigrationManifestDigest !==
      FINAL_MIGRATION_MANIFEST_DIGEST ||
    !SHA256_PATTERN.test(evidence.rowsDigest) ||
    !SHA256_PATTERN.test(evidence.prefixEvidenceDigest)
  ) {
    return false;
  }
  const { prefixEvidenceDigest: _ignored, ...document } = evidence;
  return evidence.prefixEvidenceDigest === sha256(canonicalJson(document));
}

export function buildCurrent180Current190PostgresqlRehearsalTransitionEvidence(
  input,
) {
  if (
    !exactKeys(input, [
      "authorizationReceiptDigest",
      "event",
      "evidenceDigest",
      "runToken",
    ]) ||
    !SHA256_PATTERN.test(String(input.authorizationReceiptDigest ?? "")) ||
    !Object.hasOwn(TRANSITION_SPECS, input.event) ||
    !SHA256_PATTERN.test(String(input.evidenceDigest ?? "")) ||
    !TOKEN_PATTERN.test(String(input.runToken ?? ""))
  ) {
    fail("REHEARSAL_TRANSITION_EVIDENCE_INVALID", [
      "EXACT_TRANSITION_EVIDENCE_REQUIRED",
    ]);
  }
  const evidence = {
    authorizationReceiptDigest: input.authorizationReceiptDigest,
    contract:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITION_EVIDENCE_CONTRACT,
    event: input.event,
    evidenceDigest: input.evidenceDigest,
    evidenceKind: `${input.event}_EVIDENCE`,
    runToken: input.runToken,
    status: TRANSITION_EVIDENCE_STATUS,
  };
  return deepFreeze({
    ...evidence,
    evidenceReceiptDigest: sha256(canonicalJson(evidence)),
  });
}

function validTransitionEvidence(evidence, state, event) {
  if (
    !deepDataTree(evidence) ||
    !exactKeys(evidence, [
      "authorizationReceiptDigest",
      "contract",
      "event",
      "evidenceDigest",
      "evidenceKind",
      "evidenceReceiptDigest",
      "runToken",
      "status",
    ])
  ) {
    return false;
  }
  try {
    const expected =
      buildCurrent180Current190PostgresqlRehearsalTransitionEvidence({
        authorizationReceiptDigest: state.authorizationReceiptDigest,
        event,
        evidenceDigest: evidence.evidenceDigest,
        runToken: state.names.runToken,
      });
    return canonicalJson(expected) === canonicalJson(evidence);
  } catch (error) {
    if (error instanceof Current180Current190PostgresqlRehearsalContractError) {
      return false;
    }
    throw error;
  }
}

export function createCurrent180Current190PostgresqlRehearsalState(input) {
  if (!exactKeys(input, ["authorizationReceipt", "names"])) {
    fail("REHEARSAL_STATE_INVALID", ["EXACT_STATE_INPUT_REQUIRED"]);
  }
  const { authorizationReceipt, names } = input;
  if (!validAuthorizationReceipt(authorizationReceipt)) {
    fail("REHEARSAL_STATE_INVALID", ["VALID_AUTHORIZATION_RECEIPT_REQUIRED"]);
  }
  const validatedNames =
    validateCurrent180Current190PostgresqlRehearsalDatabaseNames(names);
  const state = {
    authorizationReceiptDigest: authorizationReceipt.authorizationReceiptDigest,
    eventCount: 0,
    evidenceChainDigest: sha256(
      canonicalJson({
        authorizationReceiptDigest:
          authorizationReceipt.authorizationReceiptDigest,
        runToken: validatedNames.runToken,
        seed: "CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_STATE_V1",
      }),
    ),
    lastEvent: null,
    lastEvidenceReceiptDigest: null,
    names: validatedNames,
    outcome: "ACTIVE",
    ownershipIdentity: null,
    phase: "INITIAL",
    prismaPrefixEvidence: null,
    sourcePin: null,
    sourceUrlSha256: authorizationReceipt.environment.sourceUrlSha256,
  };
  return deepFreeze({
    ...state,
    stateDigest: sha256(canonicalJson(state)),
  });
}

export function advanceCurrent180Current190PostgresqlRehearsalState(
  state,
  input,
) {
  if (
    !exactKeys(state, STATE_KEYS) ||
    !CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PHASES.includes(state.phase) ||
    !SHA256_PATTERN.test(String(state.authorizationReceiptDigest ?? "")) ||
    !SHA256_PATTERN.test(String(state.evidenceChainDigest ?? "")) ||
    !SHA256_PATTERN.test(String(state.sourceUrlSha256 ?? "")) ||
    !Number.isSafeInteger(state.eventCount) ||
    state.eventCount < 0 ||
    state.eventCount > 64 ||
    !["ACTIVE", "FAILED", "RECOVERY"].includes(state.outcome)
  ) {
    fail("REHEARSAL_STATE_INVALID", ["VALID_STATE_REQUIRED"]);
  }
  const validatedNames =
    validateCurrent180Current190PostgresqlRehearsalDatabaseNames(state.names);
  const stateWithoutDigest = { ...state };
  delete stateWithoutDigest.stateDigest;
  if (
    state.stateDigest !== sha256(canonicalJson(stateWithoutDigest)) ||
    state.outcome !== expectedOutcomeForPhase(state.phase) ||
    (state.eventCount === 0 &&
      (state.phase !== "INITIAL" ||
        state.lastEvent !== null ||
        state.lastEvidenceReceiptDigest !== null)) ||
    (state.eventCount > 0 &&
      (!Object.hasOwn(TRANSITION_SPECS, state.lastEvent) ||
        TRANSITION_SPECS[state.lastEvent].to !== state.phase ||
        !SHA256_PATTERN.test(String(state.lastEvidenceReceiptDigest ?? "")))) ||
    !(state.sourcePin === null || validSourcePin(state.sourcePin)) ||
    (state.sourcePin?.sourceUrlSha256 !== undefined &&
      state.sourcePin.sourceUrlSha256 !== state.sourceUrlSha256) ||
    !(
      state.ownershipIdentity === null ||
      (validExpectedIdentity(state.ownershipIdentity) &&
        state.ownershipIdentity.authorizationReceiptDigest ===
          state.authorizationReceiptDigest &&
        state.ownershipIdentity.runToken === validatedNames.runToken)
    ) ||
    !(
      state.prismaPrefixEvidence === null ||
      validPrismaPrefixEvidence(state.prismaPrefixEvidence)
    )
  ) {
    fail("REHEARSAL_STATE_INVALID", ["STATE_INTEGRITY_MISMATCH"]);
  }
  if (!plainObject(input)) {
    fail("REHEARSAL_TRANSITION_DENIED", [
      "STRUCTURED_TRANSITION_INPUT_REQUIRED",
    ]);
  }
  const event = input.event;
  const sourcePinEvent = event === "SOURCE_PINNED";
  const ownershipEvent = [
    "PROVISIONAL_MARKER_RECONCILED",
    "WORKING_MARKED",
  ].includes(event);
  const prismaPrefixEvent = ["APPLY_RECONCILED", "ZERO_DIFF_VERIFIED"].includes(
    event,
  );
  const expectedInputKeys = ["event", "evidence"];
  if (sourcePinEvent) expectedInputKeys.push("sourcePin");
  if (ownershipEvent) expectedInputKeys.push("ownershipIdentity");
  if (prismaPrefixEvent) expectedInputKeys.push("prefixEvidence");
  if (!exactKeys(input, expectedInputKeys)) {
    fail("REHEARSAL_TRANSITION_DENIED", [
      "STRUCTURED_TRANSITION_INPUT_REQUIRED",
    ]);
  }
  const transition = TRANSITION_SPECS[event];
  if (!transition || !transition.from.includes(state.phase)) {
    fail("REHEARSAL_TRANSITION_DENIED", ["EVENT_NOT_ALLOWED_FROM_PHASE"]);
  }
  if (!validTransitionEvidence(input.evidence, state, event)) {
    fail("REHEARSAL_TRANSITION_DENIED", ["BOUND_TRANSITION_EVIDENCE_REQUIRED"]);
  }
  let sourcePin = state.sourcePin;
  if (sourcePinEvent) {
    if (
      !validSourcePin(input.sourcePin) ||
      input.sourcePin.sourceUrlSha256 !== state.sourceUrlSha256 ||
      input.evidence.evidenceDigest !== input.sourcePin.sourcePinDigest
    ) {
      fail("REHEARSAL_TRANSITION_DENIED", ["BOUND_SOURCE_PIN_REQUIRED"]);
    }
    sourcePin = input.sourcePin;
  }
  let ownershipIdentity = state.ownershipIdentity;
  if (ownershipEvent) {
    if (
      !validExpectedIdentity(input.ownershipIdentity) ||
      input.ownershipIdentity.authorizationReceiptDigest !==
        state.authorizationReceiptDigest ||
      input.ownershipIdentity.runToken !== validatedNames.runToken ||
      input.evidence.evidenceDigest !== input.ownershipIdentity.identityDigest
    ) {
      fail("REHEARSAL_TRANSITION_DENIED", [
        "BOUND_OWNERSHIP_IDENTITY_REQUIRED",
      ]);
    }
    ownershipIdentity = input.ownershipIdentity;
  }
  let prismaPrefixEvidence = state.prismaPrefixEvidence;
  if (prismaPrefixEvent) {
    if (
      !validPrismaPrefixEvidence(input.prefixEvidence) ||
      input.evidence.evidenceDigest !==
        input.prefixEvidence.prefixEvidenceDigest
    ) {
      fail("REHEARSAL_TRANSITION_DENIED", [
        "BOUND_PRISMA_PREFIX_EVIDENCE_REQUIRED",
      ]);
    }
    prismaPrefixEvidence = input.prefixEvidence;
  }
  if (event === "FAIL_WITH_OWNERSHIP" && ownershipIdentity === null) {
    fail("REHEARSAL_TRANSITION_DENIED", [
      "OWNERSHIP_IDENTITY_REQUIRED_FOR_CLEANUP",
    ]);
  }
  const outcome = ["FAIL_BEFORE_OWNERSHIP", "FAIL_WITH_OWNERSHIP"].includes(
    event,
  )
    ? "FAILED"
    : event === "PROVISIONAL_FAILURE_JOURNALED"
      ? "RECOVERY"
      : event === "PROVISIONAL_MARKER_RECONCILED"
        ? "ACTIVE"
        : state.outcome;
  if (outcome !== expectedOutcomeForPhase(transition.to)) {
    fail("REHEARSAL_TRANSITION_DENIED", ["PHASE_OUTCOME_INVARIANT_VIOLATION"]);
  }
  const nextState = {
    authorizationReceiptDigest: state.authorizationReceiptDigest,
    eventCount: state.eventCount + 1,
    evidenceChainDigest: sha256(
      `${state.evidenceChainDigest}:${input.evidence.evidenceReceiptDigest}`,
    ),
    lastEvent: event,
    lastEvidenceReceiptDigest: input.evidence.evidenceReceiptDigest,
    names: validatedNames,
    outcome,
    ownershipIdentity,
    phase: transition.to,
    prismaPrefixEvidence,
    sourcePin,
    sourceUrlSha256: state.sourceUrlSha256,
  };
  return deepFreeze({
    ...nextState,
    stateDigest: sha256(canonicalJson(nextState)),
  });
}
