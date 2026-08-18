import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS,
  IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION,
  IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT,
  IDENTITY_MAIL_WORKER_FUNCTIONS,
} from "./identity-mail-worker-enrollment.mjs";
import {
  checkIdentityMailTenantEnrollmentPreflight,
  inspectIdentityMailTenantEnrollmentPreflight,
  parseIdentityMailTenantEnrollmentPreflightConfig,
} from "./identity-mail-tenant-enrollment-preflight-database.mjs";
import {
  executeIdentityMailTenantEnrollmentPreflightCli,
  parseIdentityMailTenantEnrollmentPreflightCliArguments,
  readIdentityMailTenantEnrollmentPreflightProposal,
} from "./identity-mail-tenant-enrollment-preflight.cli.mjs";
import { parseIdentityMailTenantEnrollmentProposal } from "./identity-mail-tenant-enrollment-contract.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const NOW = new Date("2026-08-01T08:00:00.000Z");
const MIGRATION = IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION;
const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const DATABASE_OID = 16_384;
const ROLE_OID = 20_001;
const ROLE_NAME = "identity_mail_worker";
const MARKER_DIGEST = "d".repeat(64);
const PROVIDER_DIGEST = "b".repeat(64);
const RELEASE_SHA = "a".repeat(40);

function proposal(overrides = {}) {
  return {
    action: "ENABLE",
    contract: "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1",
    deploymentMarkerDigest: MARKER_DIGEST,
    expectedDatabaseName: "leetplus_beta",
    expectedDatabaseOid: DATABASE_OID,
    expectedRevision: 0,
    expectedState: "ABSENT",
    expiresAt: "2026-08-01T08:10:00.000Z",
    nextRevision: 1,
    policy: {
      acknowledgeSeconds: 120,
      baseRetrySeconds: 30,
      leaseSeconds: 300,
      maxAttempts: 5,
      maxRetrySeconds: 3_600,
    },
    providerAuthorityDigest: PROVIDER_DIGEST,
    releaseSha: RELEASE_SHA,
    requestId: REQUEST_ID,
    requestedAt: "2026-08-01T07:59:00.000Z",
    runtimeConfigDigest: "c".repeat(64),
    tenantId: TENANT_ID,
    workerRoleName: ROLE_NAME,
    workerRoleOid: ROLE_OID,
    ...overrides,
  };
}

function environment(overrides = {}) {
  return {
    DATABASE_URL:
      "postgresql://operator:password@127.0.0.1:5432/leetplus_beta?schema=public",
    IDENTITY_MAIL_TENANT_ENROLLMENT_PROVIDER_AUTHORITY_DIGEST: PROVIDER_DIGEST,
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_ACKNOWLEDGE_SECONDS: "120",
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_BASE_RETRY_SECONDS: "30",
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_LEASE_SECONDS: "300",
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_ATTEMPTS: "5",
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_RETRY_SECONDS: "3600",
    ...overrides,
  };
}

function functionCatalogRow(signature) {
  const expected = [
    ...IDENTITY_MAIL_WORKER_FUNCTIONS,
    ...IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS,
  ].find((entry) => entry.catalogSignature === signature);
  assert.ok(expected, `Unexpected function signature: ${signature}`);
  const allowed = IDENTITY_MAIL_WORKER_FUNCTIONS.includes(expected);
  return {
    configuration: ["search_path=pg_catalog"],
    direct_execute: allowed,
    direct_grant_option: false,
    effective_execute: allowed,
    exists: true,
    language: expected.language,
    owner_name: "operator",
    public_execute: false,
    security_definer: expected.securityDefiner,
    volatility: expected.volatility,
  };
}

function createReadOnlyPrismaMock({ roleExists = true } = {}) {
  const calls = [];
  const transaction = {
    async $executeRawUnsafe(sql, ...parameters) {
      calls.push({ kind: "execute", parameters, sql: String(sql).trim() });
      return 0;
    },
    async $queryRawUnsafe(sql, ...parameters) {
      const source = String(sql);
      calls.push({ kind: "query", parameters, sql: source });
      if (source.includes("AS database_oid")) {
        return [
          {
            database_name: "leetplus_beta",
            database_oid: BigInt(DATABASE_OID),
            migration_count: IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT,
            migration_head: MIGRATION,
            server_version_number: 160_013,
            transaction_isolation: "repeatable read",
            transaction_read_only: true,
            unfinished_migration_count: 0,
          },
        ];
      }
      if (source.includes("AS role_count")) {
        return [{ role_count: roleExists ? 1 : 0 }];
      }
      if (source.includes("AS current_user_name")) {
        return [
          {
            current_user_name: "operator",
            current_user_oid: 10n,
            database_name: "leetplus_beta",
            database_owner_name: "operator",
            database_owner_oid: 10n,
            server_version_number: 160_013,
            session_user_name: "operator",
            session_user_oid: 10n,
            tls_active: false,
            tls_cipher: null,
            tls_version: null,
          },
        ];
      }
      if (source.includes("worker.oid::BIGINT AS role_oid")) {
        return [
          {
            database_connect: true,
            database_create: false,
            database_temporary: false,
            direct_column_privilege_count: 0,
            direct_function_execute_count: 5,
            direct_relation_privilege_count: 0,
            direct_schema_create_count: 0,
            direct_sequence_privilege_count: 0,
            effective_column_privilege_count: 0,
            effective_function_execute_count: 5,
            effective_relation_privilege_count: 0,
            effective_schema_usage_count: 1,
            effective_sequence_privilege_count: 0,
            live_activation_binding_count: 0,
            live_marker_binding_count: 0,
            membership_count: 0,
            ownership_count: 0,
            public_schema_create: false,
            public_schema_usage: true,
            role_oid: BigInt(ROLE_OID),
            role_setting_count: 0,
            rolbypassrls: false,
            rolcanlogin: true,
            rolconfig: null,
            rolcreatedb: false,
            rolcreaterole: false,
            rolinherit: false,
            rolreplication: false,
            rolsuper: false,
          },
        ];
      }
      if (source.includes("AS completed_target_count")) {
        return [
          {
            completed_count: IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT,
            completed_target_count: 1,
            latest_completed_migration: MIGRATION,
            unfinished_count: 0,
          },
        ];
      }
      if (source.includes("AS total_count")) {
        return [{ enabled_count: 0, total_count: 0 }];
      }
      if (source.includes("WITH target AS")) {
        return [functionCatalogRow(parameters[0])];
      }
      if (source.includes("AS tenant_exists")) {
        return [
          {
            claimed_count: 0,
            enrollment_tenant_id: null,
            marked_claimed_count: 0,
            tenant_exists: true,
            tenant_id: TENANT_ID,
            unmarked_claimed_count: 0,
          },
        ];
      }
      if (source.includes('FROM public."SharedBetaRuntimeReleaseState"')) {
        return [
          {
            actual_context_matches: true,
            build_binding_matches: true,
            challenge_binding_matches: true,
            database_identity_matches: true,
            marker_current: true,
            marker_id: "33333333-3333-4333-8333-333333333333",
            marker_migration_count:
              IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT,
            marker_migration_head: MIGRATION,
            marker_payload_digest: MARKER_DIGEST,
            marker_revoked_at: null,
            marker_state_revision: 1,
            marker_valid_at_snapshot: true,
            marker_valid_until: new Date("2026-08-01T12:00:00.000Z"),
            payload_digest_matches: true,
            release_sha: RELEASE_SHA,
          },
        ];
      }
      assert.fail(`Unexpected SQL query: ${source.slice(0, 120)}`);
    },
  };
  const prisma = {
    transactionCount: 0,
    transactionOptions: null,
    async $transaction(callback, options) {
      this.transactionCount += 1;
      this.transactionOptions = options;
      return callback(transaction);
    },
  };
  return { calls, prisma };
}

test("config requires independently supplied provider authority and policy", () => {
  const config = parseIdentityMailTenantEnrollmentPreflightConfig(
    environment({
      IDENTITY_MAIL_TENANT_ENROLLMENT_PROVIDER_AUTHORITY_DIGEST: "e".repeat(64),
      IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_ATTEMPTS: "7",
    }),
  );
  assert.equal(config.databaseName, "leetplus_beta");
  assert.equal(config.providerAuthorityDigest, "e".repeat(64));
  assert.equal(config.transportPolicy, "LOOPBACK_PLAINTEXT");
  assert.deepEqual(config.targetPolicy, {
    acknowledgeSeconds: 120,
    baseRetrySeconds: 30,
    leaseSeconds: 300,
    maxAttempts: 7,
    maxRetrySeconds: 3_600,
  });
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.targetPolicy), true);
  assert.equal(
    parseIdentityMailTenantEnrollmentPreflightConfig(
      environment({
        DATABASE_URL:
          "postgresql://operator:password@[::1]:5432/leetplus_beta?schema=public",
      }),
    ).transportPolicy,
    "LOOPBACK_PLAINTEXT",
  );
});

test("config rejects non-canonical and out-of-range policy", () => {
  assert.throws(
    () =>
      parseIdentityMailTenantEnrollmentPreflightConfig(
        environment({
          IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_ATTEMPTS: "05",
        }),
      ),
    { code: /_POLICY_MAX_ATTEMPTS_INVALID$/u },
  );
  assert.throws(
    () =>
      parseIdentityMailTenantEnrollmentPreflightConfig(
        environment({
          IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_RETRY_SECONDS: "10",
        }),
      ),
    { code: /_POLICY_RETRY_ORDER_INVALID$/u },
  );
  for (const databaseUrl of [
    "postgresql://operator:password@db.example.com:5432/leetplus_beta?schema=public",
    "postgresql://operator:password@localhost:5432/leetplus_beta?schema=public",
    "postgresql://operator:password@127.1:5432/leetplus_beta?schema=public",
    "postgresql://operator:password@127.0.0.1:5432/leetplus_beta?schema=public&sslmode=disable",
    "postgresql://operator:password@127.0.0.1:5432/postgres?schema=public",
  ]) {
    assert.throws(
      () =>
        parseIdentityMailTenantEnrollmentPreflightConfig(
          environment({ DATABASE_URL: databaseUrl }),
        ),
      { code: /_DATABASE_(?:TRANSPORT|URL)_INVALID$/u },
    );
  }
});

test("inspection uses one repeatable-read transaction and makes it read-only first", async () => {
  const { calls, prisma } = createReadOnlyPrismaMock();
  const config =
    parseIdentityMailTenantEnrollmentPreflightConfig(environment());
  const parsed = parseIdentityMailTenantEnrollmentProposal(proposal(), {
    now: NOW,
  });
  const snapshot = await inspectIdentityMailTenantEnrollmentPreflight(
    prisma,
    parsed,
    config,
  );

  assert.equal(prisma.transactionCount, 1);
  assert.deepEqual(prisma.transactionOptions, {
    isolationLevel: "RepeatableRead",
    maxWait: 5_000,
    timeout: 30_000,
  });
  assert.deepEqual(calls[0], {
    kind: "execute",
    parameters: [],
    sql: "SET TRANSACTION READ ONLY",
  });
  assert.equal(
    calls
      .filter(({ kind }) => kind === "execute")
      .every(({ sql }) => sql.startsWith("SET ")),
    true,
  );
  assert.deepEqual(snapshot.transaction, {
    isolation: "REPEATABLE_READ",
    readOnly: true,
  });
  assert.equal(snapshot.database.oid, DATABASE_OID);
  assert.equal(snapshot.workerRole.ownedObjectCount, 0);
  assert.equal(snapshot.workerRole.directFunctionExecuteCount, 5);
  assert.equal(snapshot.workerRole.deniedFunctionExecuteCount, 0);
  assert.equal(snapshot.workerRole.functionCatalogViolationCount, 0);
  assert.deepEqual(snapshot.tenant, { exists: true, id: TENANT_ID });
  assert.equal(snapshot.enrollment, null);
  assert.deepEqual(snapshot.drain, {
    claimedCount: 0,
    markedClaimedCount: 0,
    unmarkedClaimedCount: 0,
  });
  assert.equal(snapshot.providerAuthorityDigest, PROVIDER_DIGEST);
  assert.deepEqual(snapshot.targetPolicy, proposal().policy);
  assert.equal(snapshot.marker.payloadDigest, MARKER_DIGEST);
  assert.equal(snapshot.marker.actualContextMatches, true);

  const queriedSql = calls
    .filter(({ kind }) => kind === "query")
    .map(({ sql }) => sql)
    .join("\n");
  assert.doesNotMatch(
    queriedSql,
    /(?:^|\n)\s*(?:ALTER|CREATE|DELETE|DROP|GRANT|INSERT|REVOKE|TRUNCATE|UPDATE)\b/iu,
  );
  assert.equal(queriedSql.includes("AS total_count"), false);
  for (const forbiddenColumn of [
    '"email"',
    '"passwordHash"',
    '"secretCiphertext"',
    '"tokenHash"',
  ]) {
    assert.equal(queriedSql.includes(forbiddenColumn), false);
  }
});

test("inspection reports a missing worker role without calling role ACL inspection", async () => {
  const { calls, prisma } = createReadOnlyPrismaMock({ roleExists: false });
  const snapshot = await inspectIdentityMailTenantEnrollmentPreflight(
    prisma,
    parseIdentityMailTenantEnrollmentProposal(proposal(), { now: NOW }),
    parseIdentityMailTenantEnrollmentPreflightConfig(environment()),
  );
  assert.equal(snapshot.workerRole, null);
  assert.equal(
    calls.some(({ sql }) => sql.includes("worker.oid::BIGINT AS role_oid")),
    false,
  );
});

test("check returns a non-authorizing matched report", async () => {
  const { prisma } = createReadOnlyPrismaMock();
  const checked = await checkIdentityMailTenantEnrollmentPreflight(
    prisma,
    proposal(),
    parseIdentityMailTenantEnrollmentPreflightConfig(environment()),
    { now: NOW },
  );
  assert.equal(checked.result.inspectionDecision, "MATCHED");
  assert.equal(checked.result.authorization, false);
  assert.equal(checked.result.canMutate, false);
  assert.deepEqual(checked.result.findings, []);
  assert.equal(checked.result.runtimeConfigDigestEvaluation, "DEFERRED");
});

test("CLI accepts only help or the exact check/proposal-file shape", () => {
  assert.deepEqual(
    parseIdentityMailTenantEnrollmentPreflightCliArguments(["--help"]),
    { mode: "help", proposalFile: null },
  );
  assert.throws(
    () => parseIdentityMailTenantEnrollmentPreflightCliArguments(["--apply"]),
    { code: /_ARGUMENTS_INVALID$/u },
  );
  assert.throws(
    () =>
      parseIdentityMailTenantEnrollmentPreflightCliArguments([
        "--proposal-file",
        "proposal.json",
        "--check",
      ]),
    { code: /_ARGUMENTS_INVALID$/u },
  );
});

test("CLI exits nonzero for a BLOCKED inspection without treating it as an error", async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "leetplus-enrollment-preflight-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));
  const proposalPath = path.join(directory, "proposal.json");
  await writeFile(proposalPath, canonicalStringify(proposal()), {
    encoding: "utf8",
    flag: "wx",
  });

  class PrismaClientStub {
    async $disconnect() {}
  }

  for (const [inspectionDecision, exitCode] of [
    ["MATCHED", 0],
    ["BLOCKED", 2],
  ]) {
    const execution = await executeIdentityMailTenantEnrollmentPreflightCli(
      ["--check", "--proposal-file", proposalPath],
      environment(),
      {
        adapterLoader: async () => ({
          checkIdentityMailTenantEnrollmentPreflight: async () => ({
            result: {
              authorization: false,
              canMutate: false,
              inspectionDecision,
            },
          }),
          parseIdentityMailTenantEnrollmentPreflightConfig: () => ({
            databaseUrl: environment().DATABASE_URL,
          }),
        }),
        now: NOW,
        prismaLoader: async () => ({ PrismaClient: PrismaClientStub }),
      },
    );
    assert.equal(execution.exitCode, exitCode);
    assert.equal(
      JSON.parse(execution.output).inspectionDecision,
      inspectionDecision,
    );
  }
});

test("CLI rejects duplicate-key JSON before loading adapter or Prisma", async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "leetplus-enrollment-preflight-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));
  const proposalPath = path.join(directory, "duplicate.json");
  await writeFile(proposalPath, '{"action":"ENABLE","action":"ENABLE"}', {
    encoding: "utf8",
    flag: "wx",
  });
  let adapterLoaded = false;
  let prismaLoaded = false;
  await assert.rejects(
    executeIdentityMailTenantEnrollmentPreflightCli(
      ["--check", "--proposal-file", proposalPath],
      environment(),
      {
        adapterLoader: async () => {
          adapterLoaded = true;
          throw new Error("adapter must not load");
        },
        now: NOW,
        prismaLoader: async () => {
          prismaLoaded = true;
          throw new Error("Prisma must not load");
        },
      },
    ),
    { code: /_CANONICAL_JSON_REQUIRED$/u },
  );
  assert.equal(adapterLoaded, false);
  assert.equal(prismaLoaded, false);
});

test("CLI rejects a stale canonical proposal before loading adapter or Prisma", async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "leetplus-enrollment-preflight-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));
  const proposalPath = path.join(directory, "stale.json");
  const stale = proposal({
    expiresAt: "2026-08-01T07:55:00.000Z",
    requestedAt: "2026-08-01T07:50:00.000Z",
  });
  await writeFile(proposalPath, canonicalStringify(stale), {
    encoding: "utf8",
    flag: "wx",
  });
  let adapterLoaded = false;
  await assert.rejects(
    executeIdentityMailTenantEnrollmentPreflightCli(
      ["--check", "--proposal-file", proposalPath],
      environment(),
      {
        adapterLoader: async () => {
          adapterLoaded = true;
          throw new Error("adapter must not load");
        },
        now: NOW,
      },
    ),
    { code: "IDENTITY_MAIL_TENANT_ENROLLMENT_PROPOSAL_STALE" },
  );
  assert.equal(adapterLoaded, false);
});

test("bounded proposal reader rejects BOM and NUL", async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "leetplus-enrollment-preflight-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));
  const bomPath = path.join(directory, "bom.json");
  const nulPath = path.join(directory, "nul.json");
  await writeFile(
    bomPath,
    Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(canonicalStringify(proposal()), "utf8"),
    ]),
    { flag: "wx" },
  );
  await writeFile(nulPath, Buffer.from("{}\0", "utf8"), { flag: "wx" });
  assert.throws(
    () => readIdentityMailTenantEnrollmentPreflightProposal(bomPath),
    { code: /_FILE_INVALID$/u },
  );
  assert.throws(
    () => readIdentityMailTenantEnrollmentPreflightProposal(nulPath),
    { code: /_FILE_INVALID$/u },
  );
});
