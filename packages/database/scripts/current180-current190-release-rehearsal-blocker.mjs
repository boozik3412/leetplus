import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CURRENT180_CURRENT190_REHEARSAL_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_RELEASE_REHEARSAL_BLOCKER_V1";
export const CURRENT180_CURRENT190_DISPOSABLE_DATABASE_PATTERN =
  /^lp_c180190_[0-9a-f]{32}_ci$/u;

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const CANONICAL_COUNT = 180;
const CANONICAL_HEAD = "20260804120000_guest_game_max_pending_rewards";
const CANONICAL_HEAD_SHA256 =
  "40587bc93c34875edf6064f9848e42ce0194b321165ac494750987533cef21ef";
const CANONICAL_MANIFEST_DIGEST =
  "8a763027a16c45532bf1cff84fdaacf27f2c4e834cae15cffd7a15feae63f6dc";

const EXPECTED_CURRENT187_TOOLING = deepFreeze([
  {
    file: "identity-mail-cluster-application-admission-current187-contract.mjs",
    sha256: "baa0c4044858ebf4598f23b6fb0c9bd0522174e74dbef06bdf316e8963c98334",
  },
  {
    file: "identity-mail-cluster-application-admission-current187-authority.mjs",
    sha256: "65ba10e96d68024ea4c92359fd10c2aba94696f9ef61517a0f9523e62a523b91",
  },
  {
    file: "identity-mail-cluster-inventory-current187-planner.mjs",
    sha256: "dd0d757b746106a9ce6ba92e0217285a6f1a59d8b61f584751078f6b2a829dbc",
  },
  {
    file: "identity-mail-cluster-acquisition-current187.mjs",
    sha256: "4828b5ae3173a4217c2cb4430588d8c135d8078d8063e29ea6bc742d113fa19f",
  },
  {
    file: "identity-mail-cluster-policy-current187.mjs",
    sha256: "da1fd62f3666fc79b2f076a2544b2f5091659b34b86bdcfc59fa1767f7135a41",
  },
  {
    file: "identity-mail-cluster-semantic-approval-ledger-current187.mjs",
    sha256: "8faaab8d111bcfbf192c2c19e817c8166dd888d0d60638a201d8f575f5f2d350",
  },
  {
    file: "identity-mail-cluster-semantic-allowlist-current187.mjs",
    sha256: "39dbcfd6b42039d69c1069d379a92c54d883eb727099e7e4c8d1714e2dec5ad2",
  },
  {
    file: "identity-mail-cluster-semantic-risk-current187.mjs",
    sha256: "cc0eb928a1dc491137cfae7b1c6ed22d8de13cf415bd162154ecf35624e37597",
  },
  {
    file: "identity-mail-ddl-fence-attestation-current187-contract.mjs",
    sha256: "f3e490d4605f9f0409a0f5687125808a0b1f70c42e7abbcb62ae96917550122e",
  },
  {
    file: "identity-mail-ddl-fence-attestation-current187-authority.mjs",
    sha256: "c10b7db997c80c9dbec589d971162c00736c266aedabe2e3b39932dae73ddf97",
  },
  {
    file: "identity-mail-ddl-fence-ledger-current187.mjs",
    sha256: "387e736d017a1dda18e2df5570820f90dd8138ca4fa4eeb392ad177877ab6f65",
  },
]);

const EXPECTED_PREVIOUS_FOUNDATION_TOOLING = deepFreeze([
  {
    file: "identity-mail-tenant-enrollment-foundation.mjs",
    ordinal: 180,
    sha256: "fcf7f1a0480127210c661222cda9a5158ac0d24dbe8caaae60e440c5eb5f8252",
  },
  {
    file: "identity-mail-tenant-lock-drain-current181-foundation.mjs",
    ordinal: 181,
    sha256: "d69c2bc53fb2b941cb986f7c88bfb5e4981a9e3549c88544ec184abd679555b3",
  },
  {
    file: "identity-mail-worker-v2-freshness-current183-foundation.mjs",
    ordinal: 183,
    sha256: "0d80df28c71becf2c1d0ad6f288e002feeb4e6568ddff8ca540f8db71e155a4b",
  },
  {
    file: "identity-mail-worker-v2-replay-current184-foundation.mjs",
    ordinal: 184,
    sha256: "3cf54ac980b250a6b282d142372410bb35284a8f156b1df60ea9efdf0cd2c929",
  },
  {
    file: "identity-mail-enrollment-evidence-ledger-current185-foundation.mjs",
    ordinal: 185,
    sha256: "5e3ac6bbb075c2cbca7018f7a84d554b9241f23fa428976cd7e02bdc100a130f",
  },
  {
    file: "identity-mail-duty-role-current186-foundation.mjs",
    ordinal: 186,
    sha256: "5d2918b472ca41a8dae6612e127b817377d79d5f5da78624663d49d652166d97",
  },
]);

const EXPECTED_CANDIDATES = deepFreeze([
  {
    directory: "20260801010000_identity_mail_tenant_enrollment_control_plane",
    metadata: {
      schemaVersion: 1,
      contract: "IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE_V1",
      candidate: "20260804130000_identity_mail_tenant_enrollment_control_plane",
      ordinal: 180,
      predecessor: {
        count: 180,
        head: CANONICAL_HEAD,
        manifestDigest: CANONICAL_MANIFEST_DIGEST,
        headChecksum: CANONICAL_HEAD_SHA256,
      },
      migrationSqlSha256:
        "e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683",
      authorization: false,
      canMutate: false,
      status: "DORMANT_SCHEMA_ONLY",
    },
  },
  {
    directory: "20260801020000_identity_mail_tenant_lock_drain_worker_v2",
    metadata: {
      schemaVersion: 1,
      contract: "IDENTITY_MAIL_TENANT_LOCK_DRAIN_WORKER_V2_CANDIDATE_V1",
      candidate: "20260804140000_identity_mail_tenant_lock_drain_worker_v2",
      ordinal: 181,
      predecessor: {
        count: 181,
        head: "20260804130000_identity_mail_tenant_enrollment_control_plane",
        manifestDigest:
          "ce2cfdf0b499aefee7171c7229ee8d9e1ec5e37b31e0e247ccd30145ac14ff46",
        headChecksum:
          "e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683",
      },
      migrationSqlSha256:
        "c923d26d77fbb268fccc03d6eff0539a75c2644059d7f7ffc2493491c88f69ac",
      authorization: false,
      canMutate: false,
      status: "NOT_DEPLOYABLE",
    },
  },
  {
    directory: "20260801030000_identity_mail_tenant_first_claim_protocol",
    metadata: {
      schemaVersion: 1,
      contract: "IDENTITY_MAIL_TENANT_FIRST_CLAIM_PROTOCOL_CANDIDATE_V1",
      candidate: "20260804150000_identity_mail_tenant_first_claim_protocol",
      ordinal: 182,
      predecessor: {
        count: 182,
        head: "20260804140000_identity_mail_tenant_lock_drain_worker_v2",
        manifestDigest:
          "0d7fa6466d609504696eb96e53e27c33e10881c4d2edf38b69d88ef1ab689107",
        headChecksum:
          "c923d26d77fbb268fccc03d6eff0539a75c2644059d7f7ffc2493491c88f69ac",
      },
      migrationSqlSha256:
        "5eb1ab8f2535c212b334e599071aefbae19039cc519177f62cbe0de7373e6fdf",
      authorization: false,
      canMutate: false,
      status: "NOT_DEPLOYABLE",
    },
  },
  {
    directory: "20260802010000_identity_mail_worker_v2_freshness_protocol",
    metadata: {
      schemaVersion: 1,
      contract: "IDENTITY_MAIL_WORKER_V2_FRESHNESS_PROTOCOL_CANDIDATE_V1",
      candidate: "20260804160000_identity_mail_worker_v2_freshness_protocol",
      ordinal: 183,
      predecessor: {
        count: 183,
        head: "20260804150000_identity_mail_tenant_first_claim_protocol",
        manifestDigest:
          "f4359a47b40fdf2df1839db4fd33c577674d4f887b56aab9e7903373e103c52a",
        headChecksum:
          "5eb1ab8f2535c212b334e599071aefbae19039cc519177f62cbe0de7373e6fdf",
      },
      migrationSqlSha256:
        "a3b92838cac386480384abb770aa06a9f2cb27b4326d5c6f9344f9019b26f2f0",
      authorization: false,
      canMutate: false,
      status: "NOT_DEPLOYABLE",
    },
  },
  {
    directory: "20260802020000_identity_mail_worker_v2_lost_response_replay",
    metadata: {
      schemaVersion: 1,
      contract: "IDENTITY_MAIL_WORKER_V2_LOST_RESPONSE_REPLAY_CANDIDATE_V1",
      candidate: "20260804170000_identity_mail_worker_v2_lost_response_replay",
      ordinal: 184,
      predecessor: {
        count: 184,
        head: "20260804160000_identity_mail_worker_v2_freshness_protocol",
        manifestDigest:
          "fbefd932e2e34cc3358b2eee8028daf729b044b690af6df01aac2b888b15f642",
        headChecksum:
          "a3b92838cac386480384abb770aa06a9f2cb27b4326d5c6f9344f9019b26f2f0",
      },
      migrationSqlSha256:
        "d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424",
      authorization: false,
      canMutate: false,
      status: "NOT_DEPLOYABLE",
    },
  },
  {
    directory: "20260802030000_identity_mail_enrollment_evidence_ledger_v2",
    metadata: {
      schemaVersion: 1,
      contract: "IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_V2_CANDIDATE_V1",
      candidate: "20260804180000_identity_mail_enrollment_evidence_ledger_v2",
      ordinal: 185,
      predecessor: {
        count: 185,
        head: "20260804170000_identity_mail_worker_v2_lost_response_replay",
        manifestDigest:
          "d5f9f9ad5d7be5706897533eb71f92aa0bd9d8f3feca62462898fc3a0757ac7a",
        headChecksum:
          "d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424",
      },
      migrationSqlSha256:
        "2c8752ec4f92addabd21ace9be8071aea1e62be45887abb2c4944de2f96657e6",
      authorization: false,
      canMutate: false,
      canSend: false,
      status: "NOT_DEPLOYABLE",
    },
  },
  {
    directory: "20260803010000_identity_mail_duty_role_runtime_boundary_v2",
    metadata: {
      schemaVersion: 1,
      contract: "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_BOUNDARY_V2_CANDIDATE_V1",
      candidate: "20260804190000_identity_mail_duty_role_runtime_boundary_v2",
      ordinal: 186,
      predecessor: {
        count: 186,
        head: "20260804180000_identity_mail_enrollment_evidence_ledger_v2",
        manifestDigest:
          "a7a90ef8c5de5c8a54bdccd54309837ddda2c2e161d6650b335d83f7af04034d",
        headChecksum:
          "2c8752ec4f92addabd21ace9be8071aea1e62be45887abb2c4944de2f96657e6",
      },
      migrationSqlSha256:
        "7a1a0453b883d6bbf8640eff8c39b007376286b0f21d31f766771fead65a93dd",
      authorization: false,
      authorityScope: "CURRENT_DATABASE_ONLY",
      canMutate: false,
      canSend: false,
      crossDatabaseAuthorityControlled: false,
      futureCreatorDefaultPrivilegesControlled: false,
      applicationRoleAllowlistBound: false,
      productionApplyAuthorized: false,
      status: "NOT_DEPLOYABLE",
    },
  },
  {
    directory: "20260805050000_identity_mail_ddl_fence_ledger_current187",
    metadata: {
      schemaVersion: 1,
      contract: "CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1",
      candidate: "20260805050000_identity_mail_ddl_fence_ledger_current187",
      ordinal: 187,
      predecessor: {
        requiredContract:
          "CURRENT187_INDEPENDENT_TECHNICAL_DDL_FENCE_ATTESTATION_V1",
        resolved: false,
      },
      migrationSqlSha256:
        "dd5f4db5aecef2c537251bc5262063c1012a1383aec0d0137e7d8b9536f8bb63",
      authorization: false,
      canMutateProduction: false,
      canActivateApplicationRoute: false,
      canConsumeProductionAttestation: false,
      canRevokeProductionAttestation: false,
      canSend: false,
      testAccessAuthorized: false,
      sharedBetaAccess: false,
      productionRootEnrolled: false,
      productionRootsFrozenEmpty: true,
      applicationRoleAllowlistBound: false,
      productionApplyAuthorized: false,
      status: "NOT_DEPLOYABLE",
    },
  },
  {
    directory: "20260805020000_langame_onboarding_staged_receipt_current188",
    metadata: {
      schemaVersion: 1,
      contract: "LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1",
      candidate: "20260805020000_langame_onboarding_staged_receipt_current188",
      ordinal: 188,
      predecessor: {
        requiredContract:
          "IDENTITY_MAIL_CLUSTER_APPLICATION_ADMISSION_CURRENT187_V1",
        resolved: false,
      },
      migrationSqlSha256:
        "e76ed2c1b7e913bbfa9a9779cd0c860b120534c83eba504a0510469ff26f0c60",
      authorization: false,
      canMutateProduction: false,
      canActivateApplicationRoute: false,
      canStartSync: false,
      canWriteProvider: false,
      applicationRoleAllowlistBound: false,
      productionApplyAuthorized: false,
      status: "NOT_DEPLOYABLE",
    },
  },
  {
    directory:
      "20260805030000_identity_employee_invite_mail_boundary_current189",
    metadata: {
      schemaVersion: 1,
      contract: "IDENTITY_EMPLOYEE_INVITE_CURRENT189_V1",
      candidate:
        "20260805030000_identity_employee_invite_mail_boundary_current189",
      ordinal: 189,
      predecessor: {
        requiredContract: "LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1",
        resolved: false,
      },
      migrationSqlSha256:
        "4bbf4d49847b82731aa2e235796b4b1a898914768c1f4f4e2cb7a8b084e5c751",
      authorization: false,
      canMutateProduction: false,
      canActivateApplicationRoute: false,
      canAcceptEmployeeInvite: false,
      canSendProvider: false,
      applicationRoleAllowlistBound: false,
      workerRoleEnrolled: false,
      productionApplyAuthorized: false,
      status: "NOT_DEPLOYABLE",
    },
  },
  {
    directory: "20260805040000_guest_portal_session_current190",
    metadata: {
      schemaVersion: 1,
      contract: "GUEST_PORTAL_SESSION_CURRENT190_V1",
      candidate: "20260805040000_guest_portal_session_current190",
      ordinal: 190,
      predecessor: {
        requiredContract: "IDENTITY_EMPLOYEE_INVITE_CURRENT189_V1",
        resolved: false,
      },
      migrationSqlSha256:
        "d23c0e8fbdfddd0eb9ec7a73d877e7bbcde8c170683247a66f43530cca3867d5",
      authorization: false,
      canMutateProduction: false,
      canActivateApplicationRoute: false,
      canServePublicMedia: false,
      canSendOtp: false,
      canCallTelegram: false,
      canCallMessenger: false,
      canCallLangame: false,
      canRunSchedulers: false,
      applicationRoleAllowlistBound: false,
      productionApplyAuthorized: false,
      status: "NOT_DEPLOYABLE",
    },
  },
]);

export class Current180Current190ReleaseRehearsalBlockedError extends Error {
  constructor(code, findings) {
    super("CURRENT180-CURRENT190 release rehearsal is blocked.");
    this.name = "Current180Current190ReleaseRehearsalBlockedError";
    this.code = code;
    this.findings = Object.freeze([...new Set(findings)].sort());
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSql(value) {
  return String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function manifestDigest(entries) {
  const manifest = [...entries]
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    )
    .map(({ name, checksum }) => `${name} ${checksum}`)
    .join("\n");
  return sha256(`${manifest}\n`);
}

function fail(code, findings) {
  throw new Current180Current190ReleaseRehearsalBlockedError(code, findings);
}

export function assertCurrent180Current190DisposableTarget(
  databaseUrl,
  nodeEnv = process.env.NODE_ENV,
) {
  if (
    typeof nodeEnv === "string" &&
    nodeEnv.trim().toLowerCase() === "production"
  ) {
    fail("CURRENT180_CURRENT190_PRODUCTION_DENIED", [
      "NODE_ENV_PRODUCTION_DENIED",
    ]);
  }
  if (nodeEnv !== "test") {
    fail("CURRENT180_CURRENT190_NON_TEST_ENVIRONMENT_DENIED", [
      "NODE_ENV_TEST_REQUIRED",
    ]);
  }
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    fail("CURRENT180_CURRENT190_UNSAFE_TARGET", ["DATABASE_URL_INVALID"]);
  }

  let target;
  try {
    target = new URL(databaseUrl);
  } catch {
    fail("CURRENT180_CURRENT190_UNSAFE_TARGET", ["DATABASE_URL_INVALID"]);
  }

  let databaseName;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(target.pathname);
    databaseName = decodedPath.slice(1);
  } catch {
    fail("CURRENT180_CURRENT190_UNSAFE_TARGET", ["DATABASE_URL_INVALID"]);
  }
  const targetHost = target.hostname.replace(/^\[([^\]]+)\]$/u, "$1");
  if (
    !new Set(["postgres:", "postgresql:"]).has(target.protocol) ||
    !LOOPBACK_HOSTS.has(targetHost) ||
    decodedPath !== `/${databaseName}` ||
    target.pathname !== `/${databaseName}` ||
    !CURRENT180_CURRENT190_DISPOSABLE_DATABASE_PATTERN.test(databaseName) ||
    target.search.length > 0 ||
    target.hash.length > 0
  ) {
    fail("CURRENT180_CURRENT190_UNSAFE_TARGET", [
      "EXACT_LOOPBACK_DISPOSABLE_DATABASE_REQUIRED",
    ]);
  }

  return deepFreeze({
    databaseName,
    databaseNamePattern:
      CURRENT180_CURRENT190_DISPOSABLE_DATABASE_PATTERN.source,
    endpoint: "LOOPBACK_ONLY",
    nodeEnvironment: "TEST_ONLY",
  });
}

async function canonicalMigrationEntries(canonicalDirectory, readText) {
  const names = (await readdir(canonicalDirectory, { withFileTypes: true }))
    .filter(
      (entry) => entry.isDirectory() && /^\d{14}_[a-z0-9_]+$/u.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      checksum: sha256(
        normalizeSql(
          await readText(join(canonicalDirectory, name, "migration.sql")),
        ),
      ),
    })),
  );
}

function assertCandidateSqlContracts(artifacts, findings) {
  for (const artifact of artifacts.filter(({ ordinal }) => ordinal <= 185)) {
    if (!artifact.sql.includes("^lp_imtec_[0-9a-f]{32}_ci$")) {
      findings.push(`CURRENT${artifact.ordinal}_DISPOSABLE_GUARD_DRIFT`);
    }
  }
  const current187 = artifacts.find(({ ordinal }) => ordinal === 187);
  if (!current187?.sql.includes("^lp_c187e_[0-9a-f]{12}_ci$")) {
    findings.push("CURRENT187_DISPOSABLE_GUARD_DRIFT");
  }
  for (const marker of [
    "leetplus.current187e_consumer_role_name",
    "leetplus.current187e_consumer_role_oid",
    "leetplus.current187e_revoker_role_name",
    "leetplus.current187e_revoker_role_oid",
    "leetplus.current187e_runtime_role_name",
    "leetplus.current187e_runtime_role_oid",
  ]) {
    if (!current187?.sql.includes(marker)) {
      findings.push("CURRENT187_EXPLICIT_ROLE_BINDING_DRIFT");
    }
  }
}

function buildLineageBlockers(artifacts) {
  const blockers = [
    {
      code: "DISPOSABLE_DATABASE_GUARD_INTERSECTION_EMPTY",
      ordinals: [180, 181, 182, 183, 184, 185, 187],
    },
    {
      code: "PRISMA_DIRECTORY_ORDER_CONFLICT",
      ordinals: [187, 188, 189, 190],
    },
    {
      code: "PREVIOUS_FOUNDATION_INVENTORY_GATES_REJECT_STACK",
      ordinals: [180, 181, 183, 184, 185, 186],
    },
    {
      code: "EXPLICIT_DUTY_ROLE_BINDING_REQUIRED",
      ordinals: [187],
    },
  ];
  const contractsByEarlierOrdinal = new Set();
  for (const artifact of artifacts) {
    const predecessor = artifact.metadata.predecessor;
    if (Object.hasOwn(predecessor, "requiredContract")) {
      if (!contractsByEarlierOrdinal.has(predecessor.requiredContract)) {
        blockers.push({
          code: "REQUIRED_CONTRACT_NOT_MATERIALIZED_IN_CANDIDATE_CHAIN",
          ordinal: artifact.ordinal,
          requiredContract: predecessor.requiredContract,
        });
      }
      if (predecessor.resolved !== true) {
        blockers.push({
          code: "UNRESOLVED_PREDECESSOR_CONTRACT",
          ordinal: artifact.ordinal,
          requiredContract: predecessor.requiredContract,
        });
      }
    }
    contractsByEarlierOrdinal.add(artifact.metadata.contract);
  }
  return blockers.sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right), "en"),
  );
}

export async function inspectCurrent180Current190ReleaseRehearsal(options) {
  const target = assertCurrent180Current190DisposableTarget(
    options?.databaseUrl,
    options?.nodeEnv,
  );
  const repositoryRoot = resolve(
    options?.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT,
  );
  const readText = options?.readText ?? ((path) => readFile(path, "utf8"));
  const databaseDirectory = join(repositoryRoot, "packages", "database");
  const canonicalDirectory = join(databaseDirectory, "prisma", "migrations");
  const candidateDirectory = join(databaseDirectory, "migration-candidates");
  const scriptsDirectory = join(databaseDirectory, "scripts");

  let canonicalEntries;
  let rawArtifacts;
  let current187Tooling;
  let previousFoundationTooling;
  try {
    [
      canonicalEntries,
      rawArtifacts,
      current187Tooling,
      previousFoundationTooling,
    ] = await Promise.all([
      canonicalMigrationEntries(canonicalDirectory, readText),
      Promise.all(
        EXPECTED_CANDIDATES.map(async (expected) => {
          const directory = join(candidateDirectory, expected.directory);
          const [metadataText, sqlText] = await Promise.all([
            readText(join(directory, "candidate.json")),
            readText(join(directory, "migration.sql")),
          ]);
          return {
            directory: expected.directory,
            expected,
            metadataText,
            sql: normalizeSql(sqlText),
          };
        }),
      ),
      Promise.all(
        EXPECTED_CURRENT187_TOOLING.map(async (expected) => ({
          ...expected,
          actualSha256: sha256(
            normalizeSql(await readText(join(scriptsDirectory, expected.file))),
          ),
        })),
      ),
      Promise.all(
        EXPECTED_PREVIOUS_FOUNDATION_TOOLING.map(async (expected) => ({
          ...expected,
          actualSha256: sha256(
            normalizeSql(await readText(join(scriptsDirectory, expected.file))),
          ),
        })),
      ),
    ]);
  } catch {
    fail("CURRENT180_CURRENT190_ARTIFACT_INTEGRITY_BLOCKED", [
      "ARTIFACT_READ_FAILED",
    ]);
  }

  const findings = [];
  if (canonicalEntries.length !== CANONICAL_COUNT) {
    findings.push("CANONICAL_COUNT_DRIFT");
  }
  if (canonicalEntries.at(-1)?.name !== CANONICAL_HEAD) {
    findings.push("CANONICAL_HEAD_DRIFT");
  }
  if (canonicalEntries.at(-1)?.checksum !== CANONICAL_HEAD_SHA256) {
    findings.push("CANONICAL_HEAD_SHA_DRIFT");
  }
  if (manifestDigest(canonicalEntries) !== CANONICAL_MANIFEST_DIGEST) {
    findings.push("CANONICAL_MANIFEST_DRIFT");
  }
  for (const tooling of current187Tooling) {
    if (tooling.actualSha256 !== tooling.sha256) {
      findings.push("CURRENT187_TOOLING_SHA_DRIFT");
    }
  }
  for (const tooling of previousFoundationTooling) {
    if (tooling.actualSha256 !== tooling.sha256) {
      findings.push("PREVIOUS_FOUNDATION_TOOLING_SHA_DRIFT");
    }
  }

  const artifacts = [];
  for (const raw of rawArtifacts) {
    let metadata;
    try {
      metadata = JSON.parse(raw.metadataText);
    } catch {
      findings.push(`CURRENT${raw.expected.metadata.ordinal}_METADATA_INVALID`);
      continue;
    }
    const ordinal = raw.expected.metadata.ordinal;
    const sqlSha256 = sha256(raw.sql);
    if (canonicalJson(metadata) !== canonicalJson(raw.expected.metadata)) {
      findings.push(`CURRENT${ordinal}_METADATA_DRIFT`);
    }
    if (
      !SHA256_PATTERN.test(sqlSha256) ||
      sqlSha256 !== raw.expected.metadata.migrationSqlSha256 ||
      metadata.migrationSqlSha256 !== sqlSha256
    ) {
      findings.push(`CURRENT${ordinal}_SQL_SHA_DRIFT`);
    }
    artifacts.push({
      contract: metadata.contract,
      directory: raw.directory,
      metadata,
      ordinal,
      sql: raw.sql,
      sqlSha256,
      targetDirectory: metadata.candidate,
    });
  }

  if (
    artifacts.length !== EXPECTED_CANDIDATES.length ||
    artifacts.some(
      ({ directory }, index) =>
        directory !== EXPECTED_CANDIDATES[index].directory,
    )
  ) {
    findings.push("LOGICAL_CANDIDATE_ORDER_DRIFT");
  }
  if (
    canonicalEntries.some(({ name }) =>
      EXPECTED_CANDIDATES.some(({ directory }) => directory === name),
    )
  ) {
    findings.push("NONCANONICAL_CANDIDATE_PROMOTED");
  }

  const chainEntries = [...canonicalEntries];
  for (const artifact of artifacts.filter(({ ordinal }) => ordinal <= 186)) {
    const predecessor = artifact.metadata.predecessor;
    const predecessorHead = chainEntries.at(-1);
    if (
      predecessor.count !== chainEntries.length ||
      predecessor.head !== predecessorHead?.name ||
      predecessor.headChecksum !== predecessorHead?.checksum ||
      predecessor.manifestDigest !== manifestDigest(chainEntries)
    ) {
      findings.push(`CURRENT${artifact.ordinal}_PREDECESSOR_CHAIN_DRIFT`);
    }
    chainEntries.push({
      checksum: artifact.sqlSha256,
      name: artifact.targetDirectory,
    });
  }
  assertCandidateSqlContracts(artifacts, findings);

  if (findings.length > 0) {
    fail("CURRENT180_CURRENT190_ARTIFACT_INTEGRITY_BLOCKED", findings);
  }

  const logicalOrder = artifacts.map(({ ordinal }) => ordinal);
  const prismaDirectoryOrder = [...artifacts]
    .sort((left, right) =>
      left.directory < right.directory
        ? -1
        : left.directory > right.directory
          ? 1
          : 0,
    )
    .map(({ ordinal }) => ordinal);
  const blockers = buildLineageBlockers(artifacts);
  const artifactSetDigest = sha256(
    `${artifacts
      .map(
        ({ contract, directory, ordinal, sqlSha256, targetDirectory }) =>
          `${ordinal} ${directory}->${targetDirectory} ${contract} ${sqlSha256}`,
      )
      .join("\n")}\n`,
  );
  const current187ToolingDigest = sha256(
    `${current187Tooling
      .map(({ file, sha256: digest }) => `${file} ${digest}`)
      .join("\n")}\n`,
  );
  const previousFoundationToolingDigest = sha256(
    `${previousFoundationTooling
      .map(
        ({ file, ordinal, sha256: digest }) => `${ordinal} ${file} ${digest}`,
      )
      .join("\n")}\n`,
  );
  const blockerDigest = sha256(canonicalJson(blockers));

  return deepFreeze({
    contract: CURRENT180_CURRENT190_REHEARSAL_CONTRACT,
    status: "BLOCKED",
    target,
    canonical: {
      count: CANONICAL_COUNT,
      head: CANONICAL_HEAD,
      headChecksum: CANONICAL_HEAD_SHA256,
      manifestDigest: CANONICAL_MANIFEST_DIGEST,
    },
    artifactIntegrityVerified: true,
    artifactSetDigest,
    current187ToolingDigest,
    previousFoundationToolingDigest,
    artifacts: artifacts.map(
      ({
        contract,
        directory,
        metadata,
        ordinal,
        sqlSha256,
        targetDirectory,
      }) => ({
        contract,
        directory,
        ordinal,
        predecessor: metadata.predecessor,
        sqlSha256,
        targetDirectory,
      }),
    ),
    blockerDigest,
    logicalOrder,
    prismaDirectoryOrder,
    verifiedThroughOrdinal: 186,
    blockers,
    authorization: {
      canAssemble: false,
      canDeploy: false,
      canMutateCanonicalMigrations: false,
      canProvisionRoles: false,
      canMutateGrants: false,
      canActivateRoutes: false,
      canCallExternalProviders: false,
      canMutateProduction: false,
      productionApplyAuthorized: false,
    },
    effects: {
      databaseConnectionOpened: false,
      migrationArtifactCreated: false,
      migrationCommandExecuted: false,
      roleOrGrantMutationAttempted: false,
      routeActivationAttempted: false,
      externalProviderCallAttempted: false,
    },
  });
}

export function assertCurrent180Current190AssemblyAllowed(report) {
  if (
    report?.contract !== CURRENT180_CURRENT190_REHEARSAL_CONTRACT ||
    report?.status !== "READY" ||
    report?.authorization?.canAssemble !== true ||
    report?.authorization?.canDeploy !== true ||
    report?.authorization?.productionApplyAuthorized !== false
  ) {
    const findings = Array.isArray(report?.blockers)
      ? report.blockers.map(({ code }) => code)
      : ["REHEARSAL_REPORT_INVALID"];
    fail("CURRENT180_CURRENT190_ASSEMBLY_DENIED", findings);
  }
  fail("CURRENT180_CURRENT190_ASSEMBLER_NOT_IMPLEMENTED", [
    "SEPARATE_REVIEWED_ASSEMBLER_REQUIRED",
  ]);
}
