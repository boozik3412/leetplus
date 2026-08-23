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
import { CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN } from "./identity-mail-cluster-connection-probe-attestation-current187.mjs";
import {
  CURRENT187_CONNECTION_PROBE_CONSUMPTION_KIND,
  CURRENT187_CONNECTION_PROBE_LEDGER_PROFILE,
  CURRENT187_CONNECTION_PROBE_LEDGER_SLICE,
  CURRENT187_CONNECTION_PROBE_REVOCATION_KIND,
  CURRENT187_CONNECTION_PROBE_REVOCATION_PURPOSE,
  CURRENT187_CONNECTION_PROBE_REVOCATION_TRUST_DOMAIN,
} from "./identity-mail-cluster-connection-probe-ledger-current187.mjs";

const { PrismaClient } = prismaPackage;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = join(
  dirname(SCRIPT_DIRECTORY),
  "migration-candidates",
  "20260812170000_identity_mail_connection_probe_ledger_current187",
  "migration.sql",
);
const PG_CONFIRMATION =
  "run-current187j5l-connection-probe-ledger-postgres-e2e";
const enabled =
  process.env
    .IDENTITY_MAIL_CONNECTION_PROBE_LEDGER_CURRENT187_PG_E2E_CONFIRM ===
  PG_CONFIRMATION;
const CONSUMPTION_COMMAND_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_CONSUMPTION_COMMAND_V1";
const REVOCATION_COMMAND_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_REVOCATION_COMMAND_V1";
const CONSUMPTION_RECEIPT_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_CONSUMPTION_RECEIPT_V1";
const REVOCATION_RECEIPT_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_REVOCATION_RECEIPT_V1";

function requireDisposableAdminUrl() {
  const raw = process.env.DATABASE_URL;
  if (typeof raw !== "string") {
    throw new Error("CURRENT187-J5-R3 PG acceptance requires DATABASE_URL.");
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
      "CURRENT187-J5-R3 PG acceptance is restricted to a loopback *_ci/*_test admin database.",
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
    clusterIdentityDigest: valueDigest(`${label}:cluster`),
    connectionProbeMatrixDigest: valueDigest(`${label}:matrix`),
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: valueDigest(`${label}:universe`),
    envelopeDigest: valueDigest(`${label}:envelope`),
    environment: "ci",
    issuedAt: canonicalTime(nowMs - 1_000),
    kind: CURRENT187_CONNECTION_PROBE_CONSUMPTION_KIND,
    nonce: valueDigest(`${label}:nonce`),
    operationId: randomUUID(),
    payloadDigest: valueDigest(`${label}:payload`),
    profile: CURRENT187_CONNECTION_PROBE_LEDGER_PROFILE,
    publicKeyFingerprint: valueDigest(`${label}:root`),
    releaseSha: createHash("sha1").update(`${label}:release`).digest("hex"),
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    signingKeyId: `current187-${label}-key-v1`,
    slice: CURRENT187_CONNECTION_PROBE_LEDGER_SLICE,
    trustDomain: CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
    validUntil: canonicalTime(options.validUntilMs ?? nowMs + 60_000),
    verificationReceiptDigest: valueDigest(`${label}:verification-receipt`),
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
    ENVELOPE: consumption.command.envelopeDigest,
    MATRIX: consumption.command.connectionProbeMatrixDigest,
    ROOT: consumption.command.publicKeyFingerprint,
  }[scope];
  const command = {
    actorDigest: valueDigest(`${label}:actor`),
    connectionProbeMatrixDigest:
      consumption.command.connectionProbeMatrixDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    envelopeDigest: consumption.command.envelopeDigest,
    environment: "ci",
    eventId: randomUUID(),
    kind: CURRENT187_CONNECTION_PROBE_REVOCATION_KIND,
    profile: CURRENT187_CONNECTION_PROBE_LEDGER_PROFILE,
    publicKeyFingerprint: consumption.command.publicKeyFingerprint,
    purpose: CURRENT187_CONNECTION_PROBE_REVOCATION_PURPOSE,
    reasonDigest: valueDigest(`${label}:reason`),
    revokedAt: canonicalTime(revokedAt),
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    scope,
    scopeDigest,
    slice: CURRENT187_CONNECTION_PROBE_LEDGER_SLICE,
    trustDomain: CURRENT187_CONNECTION_PROBE_REVOCATION_TRUST_DOMAIN,
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

function alteredBundle(bundle, changes, domain) {
  const command = { ...bundle.command, ...changes };
  const commandCanonicalJson = current187AdmissionCanonicalJson(command);
  return {
    command,
    commandCanonicalJson,
    commandDigest: domainDigest(domain, commandCanonicalJson),
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
    'SELECT public."current187_connection_probe_consume_v1"($1, $2) AS "receipt"',
    bundle.commandCanonicalJson,
    bundle.commandDigest,
  );
  return rows[0].receipt;
}

async function revoke(client, bundle) {
  const rows = await client.$queryRawUnsafe(
    'SELECT public."current187_connection_probe_revoke_v1"($1, $2) AS "receipt"',
    bundle.commandCanonicalJson,
    bundle.commandDigest,
  );
  return rows[0].receipt;
}

async function consumeRaw(client, commandCanonicalJson) {
  return client.$queryRawUnsafe(
    'SELECT public."current187_connection_probe_consume_v1"($1, $2) AS "receipt"',
    commandCanonicalJson,
    domainDigest(CONSUMPTION_COMMAND_DOMAIN, commandCanonicalJson),
  );
}

async function revokeRaw(client, commandCanonicalJson) {
  return client.$queryRawUnsafe(
    'SELECT public."current187_connection_probe_revoke_v1"($1, $2) AS "receipt"',
    commandCanonicalJson,
    domainDigest(REVOCATION_COMMAND_DOMAIN, commandCanonicalJson),
  );
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
    "leetplus.current187j5l_confirmation=rehearse-current187j5l-connection-probe-ledger-loopback-ci-only",
    "-c",
    `leetplus.current187j5l_consumer_role_name=${consumer.name}`,
    "-c",
    `leetplus.current187j5l_consumer_role_oid=${consumer.oid}`,
    "-c",
    `leetplus.current187j5l_revoker_role_name=${revoker.name}`,
    "-c",
    `leetplus.current187j5l_revoker_role_oid=${revoker.oid}`,
    "-c",
    `leetplus.current187j5l_runtime_role_name=${runtime.name}`,
    "-c",
    `leetplus.current187j5l_runtime_role_oid=${runtime.oid}`,
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
  "CURRENT187-J5-R3 PostgreSQL ledger is append-only, replay-safe, scoped, race-safe, and least-privilege",
  { skip: !enabled, timeout: 120_000 },
  async () => {
    const adminUrl = requireDisposableAdminUrl();
    const psqlPath = process.env.CURRENT187J5L_PSQL_PATH || "psql";
    const token = randomBytes(6).toString("hex");
    const databaseName = `lp_c187j5l_${token}_ci`;
    const admin = prismaFor(adminUrl);
    const clients = [];
    const password = randomBytes(24).toString("base64url");
    const roleDefinitions = [
      { key: "consumer", name: `c187j5lc_${token}` },
      { key: "revoker", name: `c187j5lv_${token}` },
      { key: "runtime", name: `c187j5lr_${token}` },
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
        `{"nonce":"${valueDigest(`${token}:ignored-duplicate`)}",` +
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
      const lostResponseReceipt = await consume(consumer, first);
      const reconciledReceipt = await consume(consumer, first);
      assert.equal(reconciledReceipt, lostResponseReceipt);
      const firstReceipt = JSON.parse(reconciledReceipt);
      assert.equal(firstReceipt.status, "CONSUMED");
      assert.equal(firstReceipt.authorization, false);
      assert.equal(firstReceipt.persistedConsumptionVerified, true);
      assert.equal(
        firstReceipt.receiptDigest,
        receiptDigest(CONSUMPTION_RECEIPT_DOMAIN, firstReceipt),
      );

      const conflict = alteredBundle(
        first,
        { payloadDigest: valueDigest(`${token}:conflict`) },
        CONSUMPTION_COMMAND_DOMAIN,
      );
      await expectSqlState(() => consume(consumer, conflict), "23505");
      const firstRevocation = revocationBundle(
        first,
        "ROOT",
        `${token}-first-after-response`,
      );
      await revoke(revoker, firstRevocation);
      assert.equal(await consume(consumer, first), lostResponseReceipt);

      const concurrent = consumptionBundle(`${token}-concurrent`);
      const concurrentReceipts = await Promise.all([
        consume(consumer, concurrent),
        consume(consumerPeer, concurrent),
      ]);
      assert.equal(concurrentReceipts[0], concurrentReceipts[1]);

      for (const scope of ["ENVELOPE", "MATRIX", "ROOT"]) {
        const source = consumptionBundle(
          `${token}-${scope.toLowerCase()}-revoked`,
        );
        const revoked = revocationBundle(
          source,
          scope,
          `${token}-${scope.toLowerCase()}-revoke`,
        );
        const lostRevocationResponse = await revoke(revoker, revoked);
        assert.equal(await revoke(revoker, revoked), lostRevocationResponse);
        const receipt = JSON.parse(lostRevocationResponse);
        assert.equal(receipt.status, "REVOKED");
        assert.equal(receipt.persistedRevocationVerified, true);
        assert.equal(
          receipt.receiptDigest,
          receiptDigest(REVOCATION_RECEIPT_DOMAIN, receipt),
        );
        await expectSqlState(() => consume(consumer, source), "55000");

        const changedEvent = alteredBundle(
          revoked,
          { eventId: randomUUID() },
          REVOCATION_COMMAND_DOMAIN,
        );
        await expectSqlState(() => revoke(revoker, changedEvent), "23505");
        const mismatchedScope = alteredBundle(
          revoked,
          { scope: scope === "ROOT" ? "ENVELOPE" : "ROOT" },
          REVOCATION_COMMAND_DOMAIN,
        );
        await expectSqlState(() => revoke(revoker, mismatchedScope), "22023");
      }

      const raceSource = consumptionBundle(`${token}-race`);
      const raceRevocation = revocationBundle(
        raceSource,
        "ENVELOPE",
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

      const expiryNow = Date.now();
      const expiring = consumptionBundle(`${token}-expiring`, {
        nowMs: expiryNow,
        validUntilMs: expiryNow + 900,
      });
      await locker.$executeRawUnsafe(
        "SELECT pg_advisory_lock(hashtextextended($1, 0))",
        `current187j5l:root:${expiring.command.publicKeyFingerprint}`,
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
        `current187j5l:root:${expiring.command.publicKeyFingerprint}`,
      );
      const expiryResult = await pendingExpiry;
      assert.equal(postgresCode(expiryResult.error), "55000");

      const revocationExpirySource = consumptionBundle(
        `${token}-revocation-expiring`,
      );
      const revocationExpiry = revocationBundle(
        revocationExpirySource,
        "MATRIX",
        `${token}-revocation-expiring`,
        Date.now() - (30 * 60_000 - 2_000),
      );
      await locker.$executeRawUnsafe(
        "SELECT pg_advisory_lock(hashtextextended($1, 0))",
        `current187j5l:root:${revocationExpiry.command.publicKeyFingerprint}`,
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
        `current187j5l:root:${revocationExpiry.command.publicKeyFingerprint}`,
      );
      const revocationExpiryResult = await pendingRevocationExpiry;
      assert.equal(postgresCode(revocationExpiryResult.error), "55000");

      await expectSqlState(
        () =>
          runtime.$queryRawUnsafe(
            'SELECT * FROM public."Current187ConnectionProbeConsumptionLedger"',
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
            'UPDATE public."Current187ConnectionProbeConsumptionLedger" SET "releaseSha" = repeat(\'a\', 40)',
          ),
        "55000",
      );
      await expectSqlState(
        () =>
          owner.$executeRawUnsafe(
            'DELETE FROM public."Current187ConnectionProbeRevocationLedger"',
          ),
        "55000",
      );
      await expectSqlState(
        () =>
          owner.$executeRawUnsafe(
            'TRUNCATE public."Current187ConnectionProbeConsumptionLedger"',
          ),
        "55000",
      );

      const counts = await owner.$queryRawUnsafe(
        'SELECT (SELECT count(*)::int FROM public."Current187ConnectionProbeConsumptionLedger") AS "consumptions", (SELECT count(*)::int FROM public."Current187ConnectionProbeRevocationLedger") AS "revocations"',
      );
      assert.equal(
        counts[0].consumptions,
        raceConsume.status === "fulfilled" ? 3 : 2,
      );
      assert.equal(counts[0].revocations, 5);
      const expiredRows = await owner.$queryRawUnsafe(
        'SELECT count(*)::int AS "count" FROM public."Current187ConnectionProbeConsumptionLedger" WHERE "operationId" = $1::uuid',
        expiring.command.operationId,
      );
      assert.equal(expiredRows[0].count, 0);
      const expiredRevocationRows = await owner.$queryRawUnsafe(
        'SELECT count(*)::int AS "count" FROM public."Current187ConnectionProbeRevocationLedger" WHERE "eventId" = $1::uuid',
        revocationExpiry.command.eventId,
      );
      assert.equal(expiredRevocationRows[0].count, 0);

      const privilegeRows = await owner.$queryRawUnsafe(
        `SELECT
          has_table_privilege($1, 'public."Current187ConnectionProbeConsumptionLedger"', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS "consumerTable",
          has_table_privilege($2, 'public."Current187ConnectionProbeRevocationLedger"', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS "revokerTable",
          has_table_privilege($3, 'public."Current187ConnectionProbeConsumptionLedger"', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS "runtimeTable",
          has_function_privilege($1, 'public.current187_connection_probe_consume_v1(text,text)', 'EXECUTE') AS "consumerConsume",
          has_function_privilege($1, 'public.current187_connection_probe_revoke_v1(text,text)', 'EXECUTE') AS "consumerRevoke",
          has_function_privilege($2, 'public.current187_connection_probe_revoke_v1(text,text)', 'EXECUTE') AS "revokerRevoke",
          has_function_privilege($3, 'public.current187_connection_probe_consume_v1(text,text)', 'EXECUTE') AS "runtimeConsume"`,
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
