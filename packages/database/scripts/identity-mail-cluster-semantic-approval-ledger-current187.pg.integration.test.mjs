import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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
  CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_KIND,
  CURRENT187_SEMANTIC_APPROVAL_LEDGER_PROFILE,
  CURRENT187_SEMANTIC_APPROVAL_LEDGER_SLICE,
  CURRENT187_SEMANTIC_APPROVAL_REVOCATION_KIND,
  CURRENT187_SEMANTIC_APPROVAL_REVOCATION_PURPOSE,
  CURRENT187_SEMANTIC_APPROVAL_REVOCATION_TRUST_DOMAIN,
} from "./identity-mail-cluster-semantic-approval-ledger-current187.mjs";

const { PrismaClient } = prismaPackage;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = join(
  dirname(SCRIPT_DIRECTORY),
  "migration-candidates",
  "20260810190000_identity_mail_semantic_approval_ledger_current187",
  "migration.sql",
);
const PG_CONFIRMATION = "run-current187i-semantic-approval-ledger-postgres-e2e";
const enabled =
  process.env
    .IDENTITY_MAIL_SEMANTIC_APPROVAL_LEDGER_CURRENT187_PG_E2E_CONFIRM ===
  PG_CONFIRMATION;
const CONSUMPTION_COMMAND_DOMAIN =
  "LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_COMMAND_V1";
const REVOCATION_COMMAND_DOMAIN =
  "LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_REVOCATION_COMMAND_V1";
const CONSUMPTION_RECEIPT_DOMAIN =
  "LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_LEDGER_RECEIPT_V1";
const REVOCATION_RECEIPT_DOMAIN =
  "LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_REVOCATION_RECEIPT_V1";

function requireDisposableAdminUrl() {
  const raw = process.env.DATABASE_URL;
  if (typeof raw !== "string") {
    throw new Error("CURRENT187-I PG acceptance requires DATABASE_URL.");
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
      "CURRENT187-I PG acceptance is restricted to a loopback *_ci/*_test admin database.",
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

function domainDigest(domain, canonicalJson) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(canonicalJson, "utf8")
    .digest("hex");
}

function valueDigest(label) {
  return createHash("sha256").update(label, "utf8").digest("hex");
}

function canonicalTime(epochMs) {
  return new Date(epochMs).toISOString();
}

function consumptionBundle(label, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const command = {
    approvalDigest: valueDigest(`${label}:approval`),
    authorityIssuedAt: canonicalTime(nowMs - 1_000),
    authorityValidUntil: canonicalTime(
      options.authorityValidUntilMs ?? nowMs + 60_000,
    ),
    authorityVerificationMode: "SYNTHETIC_LOOPBACK_CI",
    authorityVerifiedAt: canonicalTime(nowMs - 500),
    clusterIdentityDigest: valueDigest(`${label}:cluster`),
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: valueDigest(`${label}:universe`),
    documentApprovedAt: canonicalTime(nowMs - 60_000),
    documentDigest: valueDigest(`${label}:document`),
    documentValidUntil: canonicalTime(nowMs + 60 * 60_000),
    environment: "ci",
    evaluationDigest: valueDigest(`${label}:evaluation`),
    kind: CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_KIND,
    nonce: valueDigest(`${label}:nonce`),
    operationId: randomUUID(),
    policyRevision: 1,
    profile: CURRENT187_SEMANTIC_APPROVAL_LEDGER_PROFILE,
    publicKeyFingerprint: valueDigest(`${label}:root`),
    reviewEvidenceDigest: valueDigest(`${label}:review`),
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    semanticRiskFactsDigest: valueDigest(`${label}:facts`),
    signingKeyId: `current187-${label}-key-v1`,
    slice: CURRENT187_SEMANTIC_APPROVAL_LEDGER_SLICE,
    syntheticVerification: true,
    ...options.overrides,
  };
  const commandCanonicalJson = current187AdmissionCanonicalJson(command);
  return {
    command,
    commandCanonicalJson,
    commandDigest: domainDigest(
      CONSUMPTION_COMMAND_DOMAIN,
      commandCanonicalJson,
    ),
  };
}

function revocationBundle(consumption, scope, label, revokedAt = Date.now()) {
  const scopeDigest = {
    APPROVAL: consumption.command.approvalDigest,
    DOCUMENT: consumption.command.documentDigest,
    EVALUATION: consumption.command.evaluationDigest,
    ROOT: consumption.command.publicKeyFingerprint,
  }[scope];
  const command = {
    actorDigest: valueDigest(`${label}:actor`),
    approvalDigest: consumption.command.approvalDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    documentDigest: consumption.command.documentDigest,
    environment: "ci",
    evaluationDigest: consumption.command.evaluationDigest,
    eventId: randomUUID(),
    kind: CURRENT187_SEMANTIC_APPROVAL_REVOCATION_KIND,
    profile: CURRENT187_SEMANTIC_APPROVAL_LEDGER_PROFILE,
    publicKeyFingerprint: consumption.command.publicKeyFingerprint,
    purpose: CURRENT187_SEMANTIC_APPROVAL_REVOCATION_PURPOSE,
    reasonDigest: valueDigest(`${label}:reason`),
    revokedAt: canonicalTime(revokedAt),
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    scope,
    scopeDigest,
    slice: CURRENT187_SEMANTIC_APPROVAL_LEDGER_SLICE,
    trustDomain: CURRENT187_SEMANTIC_APPROVAL_REVOCATION_TRUST_DOMAIN,
  };
  const commandCanonicalJson = current187AdmissionCanonicalJson(command);
  return {
    command,
    commandCanonicalJson,
    commandDigest: domainDigest(
      REVOCATION_COMMAND_DOMAIN,
      commandCanonicalJson,
    ),
  };
}

function receiptDigest(domain, receipt) {
  const value = { ...receipt };
  delete value.receiptDigest;
  return domainDigest(domain, current187AdmissionCanonicalJson(value));
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
  const rows = await client.$queryRawUnsafe(
    'SELECT public."current187_semantic_approval_consume_v1"($1, $2) AS "receipt"',
    bundle.commandCanonicalJson,
    bundle.commandDigest,
  );
  return rows[0].receipt;
}

async function revoke(client, bundle) {
  const rows = await client.$queryRawUnsafe(
    'SELECT public."current187_semantic_approval_revoke_v1"($1, $2) AS "receipt"',
    bundle.commandCanonicalJson,
    bundle.commandDigest,
  );
  return rows[0].receipt;
}

async function consumeRaw(client, commandCanonicalJson) {
  return client.$queryRawUnsafe(
    'SELECT public."current187_semantic_approval_consume_v1"($1, $2) AS "receipt"',
    commandCanonicalJson,
    domainDigest(CONSUMPTION_COMMAND_DOMAIN, commandCanonicalJson),
  );
}

async function revokeRaw(client, commandCanonicalJson) {
  return client.$queryRawUnsafe(
    'SELECT public."current187_semantic_approval_revoke_v1"($1, $2) AS "receipt"',
    commandCanonicalJson,
    domainDigest(REVOCATION_COMMAND_DOMAIN, commandCanonicalJson),
  );
}

function alteredBundle(bundle, changes, domain) {
  const command = { ...bundle.command, ...changes };
  const commandCanonicalJson = current187AdmissionCanonicalJson(command);
  return {
    command,
    commandCanonicalJson,
    commandDigest: domainDigest(domain, commandCanonicalJson),
  };
}

function applyCandidateWithPsql({
  adminUrl,
  consumer,
  databaseName,
  psqlPath,
  revoker,
  runtime,
}) {
  const options = [
    "-c",
    "leetplus.current187i_confirmation=rehearse-current187i-semantic-approval-ledger-loopback-ci-only",
    "-c",
    `leetplus.current187i_consumer_role_name=${consumer.name}`,
    "-c",
    `leetplus.current187i_consumer_role_oid=${consumer.oid}`,
    "-c",
    `leetplus.current187i_revoker_role_name=${revoker.name}`,
    "-c",
    `leetplus.current187i_revoker_role_oid=${revoker.oid}`,
    "-c",
    `leetplus.current187i_runtime_role_name=${runtime.name}`,
    "-c",
    `leetplus.current187i_runtime_role_oid=${runtime.oid}`,
  ].join(" ");
  const result = spawnSync(
    psqlPath,
    [
      "-h",
      adminUrl.hostname,
      "-p",
      adminUrl.port || "5432",
      "-U",
      decodeURIComponent(adminUrl.username),
      "-d",
      databaseName,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      SQL_PATH,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PGOPTIONS: options,
        PGPASSWORD: decodeURIComponent(adminUrl.password),
      },
      windowsHide: true,
    },
  );
  assert.equal(
    result.status,
    0,
    `${result.stdout.slice(-2_000)}\n${result.stderr.slice(-2_000)}`,
  );
}

async function terminateSessions(admin, databaseName, roles) {
  await admin.$executeRawUnsafe(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND (datname = $1 OR usename = ANY($2::text[]))",
    databaseName,
    roles,
  );
}

test(
  "CURRENT187-I PostgreSQL ledger is append-only, replay-safe, scoped, race-safe, and least-privilege",
  { skip: !enabled, timeout: 120_000 },
  async () => {
    const adminUrl = requireDisposableAdminUrl();
    const psqlPath = process.env.CURRENT187I_PSQL_PATH || "psql";
    const token = randomBytes(6).toString("hex");
    const databaseName = `lp_c187i_${token}_ci`;
    const admin = prismaFor(adminUrl);
    const clients = [];
    const password = randomBytes(24).toString("base64url");
    const roleDefinitions = [
      { key: "consumer", name: `c187ic_${token}` },
      { key: "revoker", name: `c187iv_${token}` },
      { key: "runtime", name: `c187ir_${token}` },
    ];

    try {
      const identityRows = await admin.$queryRawUnsafe(
        'SELECT current_user AS "currentUser"',
      );
      const ownerName = identityRows[0].currentUser;
      for (const role of roleDefinitions) {
        await admin.$executeRawUnsafe(
          `CREATE ROLE ${quoteIdentifier(role.name)} LOGIN PASSWORD ${quoteLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
        );
      }
      await admin.$executeRawUnsafe(
        `CREATE DATABASE ${quoteIdentifier(databaseName)} OWNER ${quoteIdentifier(ownerName)} TEMPLATE template0`,
      );
      const roleRows = await admin.$queryRawUnsafe(
        'SELECT rolname AS "name", oid::text AS "oid" FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname',
        roleDefinitions.map((role) => role.name),
      );
      assert.equal(roleRows.length, 3);
      const roles = Object.fromEntries(
        roleDefinitions.map((role) => {
          const row = roleRows.find(
            (candidate) => candidate.name === role.name,
          );
          assert.ok(row);
          return [role.key, { ...role, oid: row.oid }];
        }),
      );
      applyCandidateWithPsql({
        adminUrl,
        consumer: roles.consumer,
        databaseName,
        psqlPath,
        revoker: roles.revoker,
        runtime: roles.runtime,
      });

      const owner = prismaFor(
        databaseUrl(
          adminUrl,
          databaseName,
          decodeURIComponent(adminUrl.username),
          decodeURIComponent(adminUrl.password),
        ),
      );
      const consumer = prismaFor(
        databaseUrl(adminUrl, databaseName, roles.consumer.name, password),
      );
      const consumerPeer = prismaFor(
        databaseUrl(adminUrl, databaseName, roles.consumer.name, password),
      );
      const revoker = prismaFor(
        databaseUrl(adminUrl, databaseName, roles.revoker.name, password),
      );
      const runtime = prismaFor(
        databaseUrl(adminUrl, databaseName, roles.runtime.name, password),
      );
      const locker = prismaFor(
        databaseUrl(
          adminUrl,
          databaseName,
          decodeURIComponent(adminUrl.username),
          decodeURIComponent(adminUrl.password),
        ),
      );
      clients.push(owner, consumer, consumerPeer, revoker, runtime, locker);

      const noncanonicalConsumption = consumptionBundle(
        `${token}-noncanonical-consumption`,
      );
      const duplicateKeyConsumption =
        `{"approvalDigest":"${valueDigest(`${token}:ignored-duplicate`)}",` +
        noncanonicalConsumption.commandCanonicalJson.slice(1);
      await expectSqlState(
        () => consumeRaw(consumer, duplicateKeyConsumption),
        "22023",
      );

      const noncanonicalRevocationSource = consumptionBundle(
        `${token}-noncanonical-revocation-source`,
      );
      const noncanonicalRevocation = revocationBundle(
        noncanonicalRevocationSource,
        "ROOT",
        `${token}-noncanonical-revocation`,
      );
      const reorderedRevocation = JSON.stringify({
        scope: noncanonicalRevocation.command.scope,
        ...noncanonicalRevocation.command,
      });
      await expectSqlState(
        () => revokeRaw(revoker, reorderedRevocation),
        "22023",
      );

      const first = consumptionBundle(`${token}-first`);
      const firstReceiptText = await consume(consumer, first);
      assert.equal(await consume(consumer, first), firstReceiptText);
      const firstReceipt = JSON.parse(firstReceiptText);
      assert.equal(firstReceipt.status, "CONSUMED");
      assert.equal(firstReceipt.authorization, false);
      assert.equal(firstReceipt.persistedConsumptionVerified, true);
      assert.equal(
        firstReceipt.receiptDigest,
        receiptDigest(CONSUMPTION_RECEIPT_DOMAIN, firstReceipt),
      );

      const conflict = alteredBundle(
        first,
        { reviewEvidenceDigest: valueDigest(`${token}:conflict`) },
        CONSUMPTION_COMMAND_DOMAIN,
      );
      await expectSqlState(() => consume(consumer, conflict), "23505");
      const firstRevocation = revocationBundle(
        first,
        "ROOT",
        `${token}-first-after-response`,
      );
      await revoke(revoker, firstRevocation);
      assert.equal(await consume(consumer, first), firstReceiptText);

      const alreadyConsumedExpiryNow = Date.now();
      const alreadyConsumedExpiring = consumptionBundle(
        `${token}-already-consumed-expiring`,
        {
          authorityValidUntilMs: alreadyConsumedExpiryNow + 900,
          nowMs: alreadyConsumedExpiryNow,
        },
      );
      const alreadyConsumedExpiryReceipt = await consume(
        consumer,
        alreadyConsumedExpiring,
      );
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      assert.equal(
        await consume(consumer, alreadyConsumedExpiring),
        alreadyConsumedExpiryReceipt,
      );

      const concurrent = consumptionBundle(`${token}-concurrent`);
      const concurrentReceipts = await Promise.all([
        consume(consumer, concurrent),
        consume(consumerPeer, concurrent),
      ]);
      assert.equal(concurrentReceipts[0], concurrentReceipts[1]);

      for (const scope of ["APPROVAL", "DOCUMENT", "EVALUATION", "ROOT"]) {
        const revokedSource = consumptionBundle(
          `${token}-${scope.toLowerCase()}-revoked`,
        );
        const revoked = revocationBundle(
          revokedSource,
          scope,
          `${token}-${scope.toLowerCase()}-revoke`,
        );
        const revocationReceiptText = await revoke(revoker, revoked);
        assert.equal(await revoke(revoker, revoked), revocationReceiptText);
        const revocationReceipt = JSON.parse(revocationReceiptText);
        assert.equal(revocationReceipt.status, "REVOKED");
        assert.equal(revocationReceipt.persistedRevocationVerified, true);
        assert.equal(
          revocationReceipt.receiptDigest,
          receiptDigest(REVOCATION_RECEIPT_DOMAIN, revocationReceipt),
        );
        await expectSqlState(() => consume(consumer, revokedSource), "55000");

        const changedEvent = alteredBundle(
          revoked,
          { eventId: randomUUID() },
          REVOCATION_COMMAND_DOMAIN,
        );
        await expectSqlState(() => revoke(revoker, changedEvent), "23505");
        const mismatchedScope = alteredBundle(
          revoked,
          { scope: scope === "ROOT" ? "APPROVAL" : "ROOT" },
          REVOCATION_COMMAND_DOMAIN,
        );
        await expectSqlState(() => revoke(revoker, mismatchedScope), "22023");
      }

      const raceSource = consumptionBundle(`${token}-race`);
      const raceRevocation = revocationBundle(
        raceSource,
        "APPROVAL",
        `${token}-race-revoke`,
      );
      const [raceConsume, raceRevoke] = await Promise.allSettled([
        consume(consumer, raceSource),
        revoke(revoker, raceRevocation),
      ]);
      assert.equal(raceRevoke.status, "fulfilled");
      if (raceConsume.status === "rejected") {
        assert.equal(postgresCode(raceConsume.reason), "55000");
      } else {
        assert.equal(JSON.parse(raceConsume.value).status, "CONSUMED");
      }

      const replayWindowSource = consumptionBundle(
        `${token}-revocation-replay-window`,
      );
      const replayWindowRevocation = revocationBundle(
        replayWindowSource,
        "EVALUATION",
        `${token}-revocation-replay-window`,
        Date.now() - (30 * 60_000 - 1_500),
      );
      const replayWindowReceipt = await revoke(revoker, replayWindowRevocation);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      assert.equal(
        await revoke(revoker, replayWindowRevocation),
        replayWindowReceipt,
      );

      const expiryNow = Date.now();
      const expiring = consumptionBundle(`${token}-expiring`, {
        authorityValidUntilMs: expiryNow + 900,
        nowMs: expiryNow,
      });
      await locker.$executeRawUnsafe(
        "SELECT pg_advisory_lock(hashtextextended($1, 0))",
        `current187i:root:${expiring.command.publicKeyFingerprint}`,
      );
      let consumptionWaitSettled = false;
      const pendingExpiry = consume(consumer, expiring)
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        )
        .finally(() => {
          consumptionWaitSettled = true;
        });
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(consumptionWaitSettled, false);
      await new Promise((resolve) => setTimeout(resolve, 900));
      await locker.$executeRawUnsafe(
        "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
        `current187i:root:${expiring.command.publicKeyFingerprint}`,
      );
      const expiryResult = await pendingExpiry;
      assert.equal(postgresCode(expiryResult.error), "55000");

      const revocationExpirySource = consumptionBundle(
        `${token}-revocation-expiring`,
      );
      const revocationExpiry = revocationBundle(
        revocationExpirySource,
        "EVALUATION",
        `${token}-revocation-expiring`,
        Date.now() - (30 * 60_000 - 2_000),
      );
      await locker.$executeRawUnsafe(
        "SELECT pg_advisory_lock(hashtextextended($1, 0))",
        `current187i:root:${revocationExpiry.command.publicKeyFingerprint}`,
      );
      let revocationWaitSettled = false;
      const pendingRevocationExpiry = revoke(revoker, revocationExpiry)
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        )
        .finally(() => {
          revocationWaitSettled = true;
        });
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(revocationWaitSettled, false);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await locker.$executeRawUnsafe(
        "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
        `current187i:root:${revocationExpiry.command.publicKeyFingerprint}`,
      );
      const revocationExpiryResult = await pendingRevocationExpiry;
      assert.equal(postgresCode(revocationExpiryResult.error), "55000");

      await expectSqlState(
        () =>
          runtime.$queryRawUnsafe(
            'SELECT * FROM public."Current187SemanticApprovalConsumptionLedger"',
          ),
        "42501",
      );
      await expectSqlState(
        () => consume(runtime, consumptionBundle("runtime")),
        "42501",
      );
      await expectSqlState(
        () => revoke(consumer, revocationBundle(first, "ROOT", "wrong-role")),
        "42501",
      );
      await expectSqlState(
        () =>
          owner.$executeRawUnsafe(
            'UPDATE public."Current187SemanticApprovalConsumptionLedger" SET "policyRevision" = 2',
          ),
        "55000",
      );
      await expectSqlState(
        () =>
          owner.$executeRawUnsafe(
            'DELETE FROM public."Current187SemanticApprovalRevocationLedger"',
          ),
        "55000",
      );
      await expectSqlState(
        () =>
          owner.$executeRawUnsafe(
            'TRUNCATE public."Current187SemanticApprovalConsumptionLedger"',
          ),
        "55000",
      );

      const counts = await owner.$queryRawUnsafe(
        'SELECT (SELECT count(*)::int FROM public."Current187SemanticApprovalConsumptionLedger") AS "consumptions", (SELECT count(*)::int FROM public."Current187SemanticApprovalRevocationLedger") AS "revocations"',
      );
      assert.equal(
        counts[0].consumptions,
        raceConsume.status === "fulfilled" ? 4 : 3,
      );
      assert.equal(counts[0].revocations, 7);
      const expiredRows = await owner.$queryRawUnsafe(
        'SELECT count(*)::int AS "count" FROM public."Current187SemanticApprovalConsumptionLedger" WHERE "operationId" = $1::uuid',
        expiring.command.operationId,
      );
      assert.equal(expiredRows[0].count, 0);
      const expiredRevocationRows = await owner.$queryRawUnsafe(
        'SELECT count(*)::int AS "count" FROM public."Current187SemanticApprovalRevocationLedger" WHERE "eventId" = $1::uuid',
        revocationExpiry.command.eventId,
      );
      assert.equal(expiredRevocationRows[0].count, 0);

      const privilegeRows = await owner.$queryRawUnsafe(
        `SELECT
          has_table_privilege($1, 'public."Current187SemanticApprovalConsumptionLedger"', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS "consumerTable",
          has_table_privilege($2, 'public."Current187SemanticApprovalRevocationLedger"', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS "revokerTable",
          has_table_privilege($3, 'public."Current187SemanticApprovalConsumptionLedger"', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS "runtimeTable",
          has_function_privilege($1, 'public.current187_semantic_approval_consume_v1(text,text)', 'EXECUTE') AS "consumerConsume",
          has_function_privilege($1, 'public.current187_semantic_approval_revoke_v1(text,text)', 'EXECUTE') AS "consumerRevoke",
          has_function_privilege($2, 'public.current187_semantic_approval_revoke_v1(text,text)', 'EXECUTE') AS "revokerRevoke",
          has_function_privilege($3, 'public.current187_semantic_approval_consume_v1(text,text)', 'EXECUTE') AS "runtimeConsume"`,
        roles.consumer.name,
        roles.revoker.name,
        roles.runtime.name,
      );
      assert.deepEqual(privilegeRows[0], {
        consumerConsume: true,
        consumerRevoke: false,
        consumerTable: false,
        revokerRevoke: true,
        revokerTable: false,
        runtimeConsume: false,
        runtimeTable: false,
      });
    } finally {
      await Promise.allSettled(clients.map((client) => client.$disconnect()));
      const roleNames = roleDefinitions.map((role) => role.name);
      await terminateSessions(admin, databaseName, roleNames).catch(() => {});
      await admin
        .$executeRawUnsafe(
          `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
        )
        .catch(() => {});
      for (const role of roleDefinitions.toReversed()) {
        await admin
          .$executeRawUnsafe(
            `DROP ROLE IF EXISTS ${quoteIdentifier(role.name)}`,
          )
          .catch(() => {});
      }
      const residue = await admin.$queryRawUnsafe(
        'SELECT (SELECT count(*)::int FROM pg_database WHERE datname = $1) AS "databases", (SELECT count(*)::int FROM pg_roles WHERE rolname = ANY($2::text[])) AS "roles", (SELECT count(*)::int FROM pg_stat_activity WHERE datname = $1 OR usename = ANY($2::text[])) AS "sessions"',
        databaseName,
        roleNames,
      );
      assert.deepEqual(residue[0], { databases: 0, roles: 0, sessions: 0 });
      await admin.$disconnect();
    }
  },
);
