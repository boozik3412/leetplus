import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign as signPayload,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import prismaPackage from "@prisma/client";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import {
  CURRENT187_DDL_FENCE_ATTESTATION_KIND,
  CURRENT187_DDL_FENCE_ATTESTATION_PROFILE,
  CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
  CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM,
  CURRENT187_DDL_FENCE_ATTESTATION_SLICE,
  CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONFIRMATION,
  CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
  current187DdlFenceAttestationCanonicalJson,
  normalizeCurrent187DdlFenceAttestationPayload,
} from "./identity-mail-ddl-fence-attestation-current187-contract.mjs";
import {
  createSyntheticCurrent187DdlFenceAttestationVerifier,
  current187DdlFenceAttestationPayloadDigest,
  current187DdlFenceAttestationPublicKeyFingerprint,
} from "./identity-mail-ddl-fence-attestation-current187-authority.mjs";
import {
  CURRENT187_DDL_FENCE_REVOCATION_CONFIRMATION,
  attachPersistedCurrent187DdlFenceConsumption,
  attachPersistedCurrent187DdlFenceRevocation,
  createCurrent187DdlFenceConsumptionBundle,
  createSyntheticCurrent187DdlFenceRevocationBundle,
  current187DdlFenceLedgerDatabaseArguments,
  isVerifiedPersistedCurrent187DdlFenceReceipt,
  isVerifiedPersistedCurrent187DdlFenceRevocationReceipt,
} from "./identity-mail-ddl-fence-ledger-current187.mjs";

const { PrismaClient } = prismaPackage;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = join(
  dirname(SCRIPT_DIRECTORY),
  "migration-candidates",
  "20260805050000_identity_mail_ddl_fence_ledger_current187",
  "migration.sql",
);
const PG_CONFIRMATION = "run-current187e-ddl-fence-ledger-postgres-e2e";
const enabled =
  process.env.IDENTITY_MAIL_DDL_FENCE_LEDGER_CURRENT187_PG_E2E_CONFIRM ===
  PG_CONFIRMATION;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

if (enabled) process.env.NODE_ENV = "test";
test.after(() => {
  if (!enabled) return;
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

function requireDisposableAdminUrl() {
  const raw = process.env.DATABASE_URL;
  if (typeof raw !== "string") {
    throw new Error("CURRENT187-E PG acceptance requires DATABASE_URL.");
  }
  const url = new URL(raw);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    !/_(?:ci|test)$/u.test(databaseName) ||
    /(?:^|_)(?:live|prod|production)(?:_|$)/u.test(databaseName) ||
    ["postgres", "template0", "template1"].includes(databaseName)
  ) {
    throw new Error(
      "CURRENT187-E PG acceptance is restricted to a loopback *_ci/*_test admin database.",
    );
  }
  return url;
}

function prismaFor(url) {
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

function databaseUrl(baseUrl, databaseName, username, password) {
  const url = new URL(baseUrl.toString());
  url.pathname = `/${databaseName}`;
  url.username = username;
  url.password = password;
  url.searchParams.delete("schema");
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("connect_timeout", "5");
  url.searchParams.set("socket_timeout", "20");
  return url;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function domainDigest(domain, canonicalJson) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(canonicalJson, "utf8")
    .digest("hex");
}

function canonicalTime(epochMs) {
  return new Date(epochMs).toISOString();
}

function signedFixture(databaseName, label, nowMs = Date.now()) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint =
    current187DdlFenceAttestationPublicKeyFingerprint(publicKeyPem);
  const applicationAuthorityFingerprint = digest(`${label}:application`);
  const scannerRoleBindingDigest = digest(`${label}:scanner`);
  const binding = {
    acquisitionDigest: digest(`${label}:acquisition`),
    applicationAuthorityFingerprint,
    attestorArtifactDigest: digest(`${label}:attestor-artifact`),
    clusterIdentityDigest: digest(`${label}:cluster`),
    databaseUniverseDigest: digest(`${label}:universe`),
    ddlFenceEvidenceDigest: digest(`${label}:fence-evidence`),
    ddlFenceStateDigest: digest(`${label}:fence-state`),
    environment: "ci",
    fenceEpoch: "1",
    fenceValidFrom: canonicalTime(nowMs - 60_000),
    fenceValidUntil: canonicalTime(nowMs + 10 * 60_000),
    finalDatabaseUniverseDigest: digest(`${label}:universe`),
    finalSnapshotCapturedAt: canonicalTime(nowMs - 2_000),
    finalSnapshotDigest: digest(`${label}:snapshot`),
    immutableArtifactDigest: digest(`${label}:artifact`),
    inventoryPlanDigest: digest(`${label}:plan`),
    nonce: digest(`${label}:nonce`),
    operationId: randomUUID(),
    purpose: CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
    releasePolicyDigest: digest(`${label}:release-policy`),
    releasePolicyId: `current187-${label}-policy-v1`,
    releaseSha: digest(`${label}:sha`).slice(0, 40),
    scannerRoleBindingDigest,
  };
  const payload = normalizeCurrent187DdlFenceAttestationPayload({
    ...binding,
    contract: CURRENT187_ADMISSION_CONTRACT,
    issuedAt: canonicalTime(nowMs - 1_000),
    kind: CURRENT187_DDL_FENCE_ATTESTATION_KIND,
    profile: CURRENT187_DDL_FENCE_ATTESTATION_PROFILE,
    publicKeyFingerprint,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    signingKeyId: `current187-${label}-key-v1`,
    slice: CURRENT187_DDL_FENCE_ATTESTATION_SLICE,
    trustDomain: CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
    validUntil: canonicalTime(nowMs + 90_000),
  });
  const envelope = {
    payload,
    payloadDigest: current187DdlFenceAttestationPayloadDigest(payload),
    publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(current187DdlFenceAttestationCanonicalJson(payload), "utf8"),
      privateKey,
    ).toString("base64url"),
    signatureAlgorithm: CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM,
    signingKeyId: payload.signingKeyId,
  };
  const verifier = createSyntheticCurrent187DdlFenceAttestationVerifier(
    {
      [payload.signingKeyId]: {
        algorithm: CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM,
        keyId: payload.signingKeyId,
        notAfter: canonicalTime(nowMs + 60 * 60_000),
        notBefore: canonicalTime(nowMs - 60_000),
        profile: CURRENT187_DDL_FENCE_ATTESTATION_PROFILE,
        publicKeyFingerprint,
        publicKeyPem,
        purpose: CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
        status: "ACTIVE",
        trustDomain: CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
      },
    },
    {
      applicationAuthorityFingerprint,
      databaseName,
      endpointHost: "127.0.0.1",
      environment: "ci",
      explicitConfirmation:
        CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONFIRMATION,
      nodeEnv: "test",
      scannerRoleBindingDigest,
    },
  );
  const now = canonicalTime(nowMs);
  return { binding, now, receipt: verifier.verify(envelope, binding, now) };
}

function alteredBundle(bundle, changes, domain) {
  const command = { ...bundle.command, ...changes };
  const canonicalJson = current187AdmissionCanonicalJson(command);
  return [canonicalJson, domainDigest(domain, canonicalJson)];
}

function postgresCode(error) {
  if (typeof error?.meta?.code === "string") return error.meta.code;
  const serialized = `${error?.message ?? ""}\n${JSON.stringify(error?.meta ?? {})}`;
  return /(?:code["': ]+)([0-9A-Z]{5})/u.exec(serialized)?.[1];
}

async function expectSqlState(action, expectedCode) {
  await assert.rejects(action, (error) => {
    assert.equal(postgresCode(error), expectedCode, String(error));
    return true;
  });
}

async function consume(client, bundle) {
  const args = current187DdlFenceLedgerDatabaseArguments(bundle);
  const rows = await client.$queryRawUnsafe(
    'SELECT public."current187_ddl_fence_consume_v1"($1, $2) AS "receipt"',
    ...args,
  );
  return rows[0].receipt;
}

async function revoke(client, bundle) {
  const args = current187DdlFenceLedgerDatabaseArguments(bundle);
  const rows = await client.$queryRawUnsafe(
    'SELECT public."current187_ddl_fence_revoke_v1"($1, $2) AS "receipt"',
    ...args,
  );
  return rows[0].receipt;
}

function revocationBundle(
  receipt,
  scope,
  label,
  revokedAt = new Date().toISOString(),
) {
  return createSyntheticCurrent187DdlFenceRevocationBundle(receipt, {
    actorDigest: digest(`${label}:actor`),
    eventId: randomUUID(),
    explicitConfirmation: CURRENT187_DDL_FENCE_REVOCATION_CONFIRMATION,
    reasonDigest: digest(`${label}:reason`),
    revokedAt,
    scope,
  });
}

function applyCandidateWithPsql({
  adminUrl,
  consumerOid,
  consumerRole,
  databaseName,
  ownerPassword,
  ownerRole,
  revokerOid,
  revokerRole,
  runtimeOid,
  runtimeRole,
}) {
  const psql = process.env.PSQL_BIN || "psql";
  const settings = [
    "SET leetplus.current187e_confirmation='rehearse-current187e-ddl-fence-ledger-loopback-ci-only'",
    `SET leetplus.current187e_consumer_role_name=${quoteLiteral(consumerRole)}`,
    `SET leetplus.current187e_consumer_role_oid=${quoteLiteral(consumerOid)}`,
    `SET leetplus.current187e_revoker_role_name=${quoteLiteral(revokerRole)}`,
    `SET leetplus.current187e_revoker_role_oid=${quoteLiteral(revokerOid)}`,
    `SET leetplus.current187e_runtime_role_name=${quoteLiteral(runtimeRole)}`,
    `SET leetplus.current187e_runtime_role_oid=${quoteLiteral(runtimeOid)}`,
  ].join("; ");
  const result = spawnSync(
    psql,
    [
      "-X",
      "--set",
      "ON_ERROR_STOP=1",
      "--host",
      adminUrl.hostname,
      "--port",
      adminUrl.port || "5432",
      "--username",
      ownerRole,
      "--dbname",
      databaseName,
      "--command",
      settings,
      "--file",
      SQL_PATH,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: ownerPassword },
      timeout: 60_000,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `CURRENT187-E candidate apply failed (${String(result.status)}): ${result.stderr}`,
    );
  }
}

async function terminateSessions(admin, databaseName, roles) {
  const roleList = roles.map(quoteLiteral).join(", ");
  await admin.$queryRawUnsafe(
    `SELECT pg_catalog.pg_terminate_backend(activity.pid)
       FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.pid <> pg_catalog.pg_backend_pid()
        AND (activity.datname = ${quoteLiteral(databaseName)}
          OR activity.usename IN (${roleList}))`,
  );
}

test(
  "CURRENT187-E persists exact consumption/revocation replay with hostile PostgreSQL ACL and race fixtures",
  { skip: !enabled, timeout: 180_000 },
  async () => {
    const adminUrl = requireDisposableAdminUrl();
    const admin = prismaFor(adminUrl);
    const suffix = randomBytes(6).toString("hex");
    const databaseName = `lp_c187e_${suffix}_ci`;
    const ownerRole = `lp_c187e_owner_${suffix}`;
    const consumerRole = `lp_c187e_consumer_${suffix}`;
    const revokerRole = `lp_c187e_revoker_${suffix}`;
    const runtimeRole = `lp_c187e_runtime_${suffix}`;
    const roles = [ownerRole, consumerRole, revokerRole, runtimeRole];
    const passwords = Object.fromEntries(
      roles.map((role) => [role, randomBytes(32).toString("hex")]),
    );
    const clients = new Set();
    let adminConnected = false;
    let databaseCreated = false;
    const createdRoles = [];

    try {
      await admin.$connect();
      adminConnected = true;
      for (const role of roles) {
        await admin.$executeRawUnsafe(
          `CREATE ROLE ${quoteIdentifier(role)} LOGIN PASSWORD ${quoteLiteral(passwords[role])}
             NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
        );
        createdRoles.push(role);
      }
      await admin.$executeRawUnsafe(
        `CREATE DATABASE ${quoteIdentifier(databaseName)} OWNER ${quoteIdentifier(ownerRole)}`,
      );
      databaseCreated = true;
      await admin.$executeRawUnsafe(
        `REVOKE CONNECT, TEMPORARY ON DATABASE ${quoteIdentifier(databaseName)} FROM PUBLIC`,
      );
      for (const role of roles) {
        await admin.$executeRawUnsafe(
          `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${quoteIdentifier(role)}`,
        );
      }
      const roleRows = await admin.$queryRawUnsafe(
        `SELECT role_entry.rolname AS "name", role_entry.oid::TEXT AS "oid"
           FROM pg_catalog.pg_roles AS role_entry
          WHERE role_entry.rolname IN (${roles.map(quoteLiteral).join(", ")})`,
      );
      const roleOids = Object.fromEntries(
        roleRows.map((row) => [row.name, row.oid]),
      );
      assert.equal(Object.keys(roleOids).length, 4);

      applyCandidateWithPsql({
        adminUrl,
        consumerOid: roleOids[consumerRole],
        consumerRole,
        databaseName,
        ownerPassword: passwords[ownerRole],
        ownerRole,
        revokerOid: roleOids[revokerRole],
        revokerRole,
        runtimeOid: roleOids[runtimeRole],
        runtimeRole,
      });

      const connect = async (role) => {
        const client = prismaFor(
          databaseUrl(adminUrl, databaseName, role, passwords[role]),
        );
        clients.add(client);
        await client.$connect();
        return client;
      };
      const owner = await connect(ownerRole);
      const consumerOne = await connect(consumerRole);
      const consumerTwo = await connect(consumerRole);
      const revoker = await connect(revokerRole);
      const runtime = await connect(runtimeRole);
      const auditor = prismaFor(
        databaseUrl(
          adminUrl,
          databaseName,
          decodeURIComponent(adminUrl.username),
          decodeURIComponent(adminUrl.password),
        ),
      );
      clients.add(auditor);
      await auditor.$connect();

      const policyRows = await owner.$queryRawUnsafe(
        'SELECT "consumerRoleName", "consumerRoleOid"::TEXT AS "consumerRoleOid", "revokerRoleName", "revokerRoleOid"::TEXT AS "revokerRoleOid", "runtimeRoleName", "runtimeRoleOid"::TEXT AS "runtimeRoleOid" FROM public."Current187DdlFenceLedgerPolicy"',
      );
      assert.deepEqual(policyRows, [
        {
          consumerRoleName: consumerRole,
          consumerRoleOid: roleOids[consumerRole],
          revokerRoleName: revokerRole,
          revokerRoleOid: roleOids[revokerRole],
          runtimeRoleName: runtimeRole,
          runtimeRoleOid: roleOids[runtimeRole],
        },
      ]);

      const rowSecurity = await owner.$queryRawUnsafe(
        `SELECT relation.relname AS "tableName",
                owner_role.rolname AS "ownerName",
                relation.relrowsecurity AS "rlsEnabled",
                relation.relforcerowsecurity AS "rlsForced",
                policy.polname AS "policyName",
                policy.polcmd AS "command",
                policy.polpermissive AS "permissive",
                ARRAY(
                  SELECT policy_role::TEXT
                  FROM pg_catalog.unnest(policy.polroles) AS policy_role
                  ORDER BY policy_role
                ) AS "policyRoleOids",
                pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) AS "usingExpression",
                pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) AS "checkExpression"
           FROM pg_catalog.pg_class AS relation
           JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = relation.relowner
           JOIN pg_catalog.pg_policy AS policy ON policy.polrelid = relation.oid
          WHERE relation.relnamespace = 'public'::pg_catalog.regnamespace
            AND relation.relkind = 'r'
          ORDER BY relation.relname COLLATE "C"`,
      );
      assert.deepEqual(
        rowSecurity,
        [
          "Current187DdlFenceConsumptionLedger",
          "Current187DdlFenceLedgerPolicy",
          "Current187DdlFenceRevocationLedger",
        ].map((tableName) => ({
          checkExpression: "true",
          command: "*",
          ownerName: ownerRole,
          permissive: true,
          policyName: `${tableName}_owner_only`,
          policyRoleOids: [roleOids[ownerRole]],
          rlsEnabled: true,
          rlsForced: true,
          tableName,
          usingExpression: "true",
        })),
      );

      const tableNames = [
        "Current187DdlFenceLedgerPolicy",
        "Current187DdlFenceConsumptionLedger",
        "Current187DdlFenceRevocationLedger",
      ];
      for (const role of [consumerRole, revokerRole, runtimeRole]) {
        for (const tableName of tableNames) {
          const privilegeRows = await owner.$queryRawUnsafe(
            "SELECT pg_catalog.has_table_privilege($1, $2, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS \"granted\"",
            role,
            `public."${tableName}"`,
          );
          assert.equal(privilegeRows[0].granted, false, `${role}:${tableName}`);
        }
      }
      const relationAclLeak = await auditor.$queryRawUnsafe(
        `SELECT relation.relname AS "relationName",
                COALESCE(grantee_role.rolname, 'PUBLIC') AS "grantee",
                privilege.privilege_type AS "privilege"
           FROM pg_catalog.pg_class AS relation
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(
               relation.relacl,
               pg_catalog.acldefault(
                 CASE WHEN relation.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
                 relation.relowner
               )
             )
           ) AS privilege
           LEFT JOIN pg_catalog.pg_roles AS grantee_role
             ON grantee_role.oid = privilege.grantee
          WHERE relation.relnamespace = 'public'::pg_catalog.regnamespace
            AND relation.relkind IN ('r', 'S')
            AND privilege.grantee <> relation.relowner
          ORDER BY relation.relname COLLATE "C",
                   COALESCE(grantee_role.rolname, 'PUBLIC') COLLATE "C",
                   privilege.privilege_type COLLATE "C"`,
      );
      assert.deepEqual(relationAclLeak, []);
      const sequenceCount = await auditor.$queryRawUnsafe(
        `SELECT pg_catalog.count(*)::INTEGER AS "count"
           FROM pg_catalog.pg_class AS relation
          WHERE relation.relnamespace = 'public'::pg_catalog.regnamespace
            AND relation.relkind = 'S'`,
      );
      assert.equal(sequenceCount[0].count, 0);
      const functionPrivileges = await owner.$queryRawUnsafe(
        `SELECT
           pg_catalog.has_function_privilege($1, 'public.current187_ddl_fence_consume_v1(text,text)', 'EXECUTE') AS "consumerConsume",
           pg_catalog.has_function_privilege($1, 'public.current187_ddl_fence_revoke_v1(text,text)', 'EXECUTE') AS "consumerRevoke",
           pg_catalog.has_function_privilege($2, 'public.current187_ddl_fence_consume_v1(text,text)', 'EXECUTE') AS "revokerConsume",
           pg_catalog.has_function_privilege($2, 'public.current187_ddl_fence_revoke_v1(text,text)', 'EXECUTE') AS "revokerRevoke",
           pg_catalog.has_function_privilege($3, 'public.current187_ddl_fence_consume_v1(text,text)', 'EXECUTE') AS "runtimeConsume",
           pg_catalog.has_function_privilege($3, 'public.current187_ddl_fence_revoke_v1(text,text)', 'EXECUTE') AS "runtimeRevoke"`,
        consumerRole,
        revokerRole,
        runtimeRole,
      );
      assert.deepEqual(functionPrivileges[0], {
        consumerConsume: true,
        consumerRevoke: false,
        revokerConsume: false,
        revokerRevoke: true,
        runtimeConsume: false,
        runtimeRevoke: false,
      });
      const nonOwnerFunctionAcl = await auditor.$queryRawUnsafe(
        `SELECT routine.proname AS "routineName",
                COALESCE(grantee_role.rolname, 'PUBLIC') AS "grantee",
                privilege.privilege_type AS "privilege",
                privilege.is_grantable AS "grantable"
           FROM pg_catalog.pg_proc AS routine
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
           ) AS privilege
           LEFT JOIN pg_catalog.pg_roles AS grantee_role
             ON grantee_role.oid = privilege.grantee
          WHERE routine.pronamespace = 'public'::pg_catalog.regnamespace
            AND privilege.grantee <> routine.proowner
          ORDER BY routine.proname COLLATE "C",
                   COALESCE(grantee_role.rolname, 'PUBLIC') COLLATE "C"`,
      );
      assert.deepEqual(nonOwnerFunctionAcl, [
        {
          grantable: false,
          grantee: consumerRole,
          privilege: "EXECUTE",
          routineName: "current187_ddl_fence_consume_v1",
        },
        {
          grantable: false,
          grantee: revokerRole,
          privilege: "EXECUTE",
          routineName: "current187_ddl_fence_revoke_v1",
        },
      ]);

      const expectedRoutineByRole = {
        [consumerRole]: ["current187_ddl_fence_consume_v1"],
        [revokerRole]: ["current187_ddl_fence_revoke_v1"],
        [runtimeRole]: [],
      };
      for (const role of [consumerRole, revokerRole, runtimeRole]) {
        await auditor.$executeRawUnsafe(`SET ROLE ${quoteIdentifier(role)}`);
        try {
          const identity = await auditor.$queryRawUnsafe(
            'SELECT current_user AS "currentUser", session_user AS "sessionUser"',
          );
          assert.deepEqual(identity, [
            {
              currentUser: role,
              sessionUser: decodeURIComponent(adminUrl.username),
            },
          ]);
          const tableGrants = await auditor.$queryRawUnsafe(
            `SELECT table_name AS "tableName", privilege_type AS "privilege"
               FROM information_schema.role_table_grants
              WHERE table_schema = 'public'
                AND table_name LIKE 'Current187DdlFence%'
              ORDER BY table_name, privilege_type`,
          );
          assert.deepEqual(tableGrants, []);
          const routineGrants = await auditor.$queryRawUnsafe(
            `SELECT routine_name AS "routineName", privilege_type AS "privilege"
               FROM information_schema.role_routine_grants
              WHERE routine_schema = 'public'
                AND routine_name LIKE 'current187_ddl_fence_%'
              ORDER BY routine_name, privilege_type`,
          );
          assert.deepEqual(
            routineGrants,
            expectedRoutineByRole[role].map((routineName) => ({
              privilege: "EXECUTE",
              routineName,
            })),
          );
          for (const directDml of [
            'SELECT * FROM public."Current187DdlFenceConsumptionLedger"',
            'INSERT INTO public."Current187DdlFenceConsumptionLedger" DEFAULT VALUES',
            'UPDATE public."Current187DdlFenceConsumptionLedger" SET "operationId" = "operationId"',
            'DELETE FROM public."Current187DdlFenceConsumptionLedger"',
            'TRUNCATE public."Current187DdlFenceConsumptionLedger"',
          ]) {
            const action = /^SELECT\b/u.test(directDml)
              ? () => auditor.$queryRawUnsafe(directDml)
              : () => auditor.$executeRawUnsafe(directDml);
            await expectSqlState(action, "42501");
          }
        } finally {
          await auditor.$executeRawUnsafe("RESET ROLE");
        }
      }
      await expectSqlState(
        () =>
          runtime.$queryRawUnsafe(
            'SELECT * FROM public."Current187DdlFenceConsumptionLedger"',
          ),
        "42501",
      );
      await expectSqlState(
        () =>
          consumerOne.$executeRawUnsafe(
            'DELETE FROM public."Current187DdlFenceRevocationLedger"',
          ),
        "42501",
      );
      await expectSqlState(
        () =>
          revoker.$executeRawUnsafe(
            'TRUNCATE public."Current187DdlFenceConsumptionLedger"',
          ),
        "42501",
      );

      const first = signedFixture(databaseName, `first-${suffix}`);
      const firstBundle = createCurrent187DdlFenceConsumptionBundle(
        first.receipt,
        first.now,
      );
      const [firstReceipt, replayReceipt] = await Promise.all([
        consume(consumerOne, firstBundle),
        consume(consumerTwo, firstBundle),
      ]);
      assert.equal(replayReceipt, firstReceipt);
      assert.doesNotMatch(
        firstReceipt,
        /(?:@|BEGIN [A-Z ]+KEY|https?:\/\/|password|privateKey|secret|accessToken|refreshToken|providerMessageId)/iu,
      );
      const attached = attachPersistedCurrent187DdlFenceConsumption(
        first.receipt,
        firstBundle,
        firstReceipt,
      );
      assert.equal(
        isVerifiedPersistedCurrent187DdlFenceReceipt(attached),
        true,
      );

      const consumeDomain =
        "LEETPLUS_CURRENT187_DDL_FENCE_CONSUMPTION_COMMAND_V1";
      const conflictCases = [
        alteredBundle(
          firstBundle,
          {
            envelopeDigest: digest(`${suffix}:operation-envelope`),
            nonce: digest(`${suffix}:operation-nonce`),
          },
          consumeDomain,
        ),
        alteredBundle(
          firstBundle,
          {
            envelopeDigest: digest(`${suffix}:nonce-envelope`),
            operationId: randomUUID(),
          },
          consumeDomain,
        ),
        alteredBundle(
          firstBundle,
          {
            nonce: digest(`${suffix}:envelope-nonce`),
            operationId: randomUUID(),
          },
          consumeDomain,
        ),
      ];
      for (const args of conflictCases) {
        await expectSqlState(
          () =>
            consumerOne.$queryRawUnsafe(
              'SELECT public."current187_ddl_fence_consume_v1"($1, $2)',
              ...args,
            ),
          "23505",
        );
      }
      const nowMs = Date.now();
      const expiredArgs = alteredBundle(
        firstBundle,
        {
          envelopeDigest: digest(`${suffix}:expired-envelope`),
          issuedAt: canonicalTime(nowMs - 100_000),
          nonce: digest(`${suffix}:expired-nonce`),
          operationId: randomUUID(),
          validUntil: canonicalTime(nowMs - 1_000),
          verifiedAt: canonicalTime(nowMs - 90_000),
        },
        consumeDomain,
      );
      await expectSqlState(
        () =>
          consumerOne.$queryRawUnsafe(
            'SELECT public."current187_ddl_fence_consume_v1"($1, $2)',
            ...expiredArgs,
          ),
        "55000",
      );

      const expiresWhileWaiting = signedFixture(
        databaseName,
        `expires-while-waiting-${suffix}`,
      );
      const expiresWhileWaitingBundle =
        createCurrent187DdlFenceConsumptionBundle(
          expiresWhileWaiting.receipt,
          expiresWhileWaiting.now,
        );
      const waitingNowMs = Date.now();
      const waitingArgs = alteredBundle(
        expiresWhileWaitingBundle,
        {
          issuedAt: canonicalTime(waitingNowMs - 30_000),
          validUntil: canonicalTime(waitingNowMs + 1_200),
          verifiedAt: canonicalTime(waitingNowMs - 1_000),
        },
        consumeDomain,
      );
      const waitingCommand = JSON.parse(waitingArgs[0]);
      await owner.$executeRawUnsafe("BEGIN");
      try {
        await owner.$executeRawUnsafe(
          "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))",
          `current187e:root:${waitingCommand.publicKeyFingerprint}`,
        );
        const pendingConsume = consumerTwo.$queryRawUnsafe(
          'SELECT public."current187_ddl_fence_consume_v1"($1, $2)',
          ...waitingArgs,
        );
        await new Promise((resolve) => setTimeout(resolve, 1_800));
        await owner.$executeRawUnsafe("COMMIT");
        await assert.rejects(pendingConsume, (error) => {
          assert.equal(postgresCode(error), "55000", String(error));
          return true;
        });
      } catch (error) {
        await owner.$executeRawUnsafe("ROLLBACK").catch(() => undefined);
        throw error;
      }
      const staleWaitResidue = await owner.$queryRawUnsafe(
        'SELECT pg_catalog.count(*)::INTEGER AS "count" FROM public."Current187DdlFenceConsumptionLedger" WHERE "operationId" = $1::UUID',
        waitingCommand.operationId,
      );
      assert.deepEqual(staleWaitResidue, [{ count: 0 }]);

      const firstRevocation = revocationBundle(
        first.receipt,
        "ENVELOPE",
        `first-${suffix}`,
        canonicalTime(Date.now()),
      );
      const firstRevocationReceipt = await revoke(revoker, firstRevocation);
      assert.equal(
        await revoke(revoker, firstRevocation),
        firstRevocationReceipt,
      );
      const attachedRevocation = attachPersistedCurrent187DdlFenceRevocation(
        firstRevocation,
        firstRevocationReceipt,
      );
      assert.equal(
        isVerifiedPersistedCurrent187DdlFenceRevocationReceipt(
          attachedRevocation,
        ),
        true,
      );
      await expectSqlState(() => consume(consumerOne, firstBundle), "55000");

      const revokeDomain =
        "LEETPLUS_CURRENT187_DDL_FENCE_REVOCATION_COMMAND_V1";
      const changedRevocation = alteredBundle(
        firstRevocation,
        { eventId: randomUUID() },
        revokeDomain,
      );
      await expectSqlState(
        () =>
          revoker.$queryRawUnsafe(
            'SELECT public."current187_ddl_fence_revoke_v1"($1, $2)',
            ...changedRevocation,
          ),
        "23505",
      );

      const before = signedFixture(databaseName, `before-${suffix}`);
      const beforeBundle = createCurrent187DdlFenceConsumptionBundle(
        before.receipt,
        before.now,
      );
      const beforeRevocation = revocationBundle(
        before.receipt,
        "ROOT",
        `before-${suffix}`,
        canonicalTime(Date.now()),
      );
      await revoke(revoker, beforeRevocation);
      await expectSqlState(() => consume(consumerOne, beforeBundle), "55000");

      const race = signedFixture(databaseName, `race-${suffix}`);
      const raceBundle = createCurrent187DdlFenceConsumptionBundle(
        race.receipt,
        race.now,
      );
      const raceRevocation = revocationBundle(
        race.receipt,
        "ATTESTATION",
        `race-${suffix}`,
        canonicalTime(Date.now()),
      );
      const [raceConsumeResult, raceRevokeResult] = await Promise.allSettled([
        consume(consumerTwo, raceBundle),
        revoke(revoker, raceRevocation),
      ]);
      assert.equal(raceRevokeResult.status, "fulfilled");
      if (raceConsumeResult.status === "rejected") {
        assert.equal(postgresCode(raceConsumeResult.reason), "55000");
      } else {
        assert.equal(
          isVerifiedPersistedCurrent187DdlFenceReceipt(
            attachPersistedCurrent187DdlFenceConsumption(
              race.receipt,
              raceBundle,
              raceConsumeResult.value,
            ),
          ),
          true,
        );
      }
      await expectSqlState(() => consume(consumerTwo, raceBundle), "55000");

      for (const mutation of [
        'UPDATE public."Current187DdlFenceConsumptionLedger" SET "consumedTransactionId" = "consumedTransactionId"',
        'DELETE FROM public."Current187DdlFenceRevocationLedger"',
        'TRUNCATE public."Current187DdlFenceLedgerPolicy"',
      ]) {
        await expectSqlState(() => owner.$executeRawUnsafe(mutation), "55000");
      }

      const catalogRows = await owner.$queryRawUnsafe(
        `SELECT routine.proname AS "name", owner_role.rolname AS "owner",
                routine.prosecdef AS "securityDefiner", routine.proconfig AS "config"
           FROM pg_catalog.pg_proc AS routine
           JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
          WHERE routine.pronamespace = 'public'::pg_catalog.regnamespace
          ORDER BY routine.proname COLLATE "C"`,
      );
      assert.deepEqual(
        catalogRows.map((row) => ({
          config: row.config,
          name: row.name,
          owner: row.owner,
          securityDefiner: row.securityDefiner,
        })),
        [
          {
            config: ["search_path=pg_catalog"],
            name: "current187_ddl_fence_consume_v1",
            owner: ownerRole,
            securityDefiner: true,
          },
          {
            config: ["search_path=pg_catalog"],
            name: "current187_ddl_fence_ledger_reject_mutation_v1",
            owner: ownerRole,
            securityDefiner: false,
          },
          {
            config: ["search_path=pg_catalog"],
            name: "current187_ddl_fence_revoke_v1",
            owner: ownerRole,
            securityDefiner: true,
          },
        ],
      );
      const counts = await owner.$queryRawUnsafe(
        `SELECT
           (SELECT pg_catalog.count(*)::INTEGER FROM public."Current187DdlFenceConsumptionLedger") AS "consumptions",
           (SELECT pg_catalog.count(*)::INTEGER FROM public."Current187DdlFenceRevocationLedger") AS "revocations"`,
      );
      assert.ok(counts[0].consumptions >= 1 && counts[0].consumptions <= 2);
      assert.equal(counts[0].revocations, 3);
      assert.doesNotMatch(
        await readFile(SQL_PATH, "utf8"),
        /(?:external-tester@example\.invalid|temporary-password|leetplus\.ru|api\.leetplus\.ru)/iu,
      );
    } finally {
      for (const client of clients) {
        await client.$disconnect().catch(() => undefined);
      }
      if (adminConnected) {
        await terminateSessions(admin, databaseName, roles).catch(
          () => undefined,
        );
        if (databaseCreated) {
          await admin
            .$executeRawUnsafe(
              `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
            )
            .catch(() => undefined);
        }
        for (const role of createdRoles.reverse()) {
          await admin
            .$executeRawUnsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`)
            .catch(() => undefined);
        }
        const residue = await admin.$queryRawUnsafe(
          `SELECT
             (SELECT pg_catalog.count(*)::INTEGER FROM pg_catalog.pg_database WHERE datname = ${quoteLiteral(databaseName)}) AS "databases",
             (SELECT pg_catalog.count(*)::INTEGER FROM pg_catalog.pg_roles WHERE rolname IN (${roles.map(quoteLiteral).join(", ")})) AS "roles"`,
        );
        assert.deepEqual(residue[0], { databases: 0, roles: 0 });
        await admin.$disconnect();
      }
    }
  },
);
