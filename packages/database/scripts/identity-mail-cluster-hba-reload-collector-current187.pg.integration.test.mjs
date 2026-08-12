import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  CURRENT187_HBA_RELOAD_SYNTHETIC_CONFIRMATION,
  collectSyntheticCurrent187HbaReloadEvidenceWithPrismaForTestOnly,
  computeSyntheticCurrent187HbaCatalogDigestForTestOnly,
  isVerifiedCurrent187HbaReloadReceipt,
} from "./identity-mail-cluster-hba-reload-collector-current187.mjs";

const PG_CONFIRMATION = "run-current187-hba-reload-postgres-e2e";
const APPLICATION_NAME = "leetplus.current187.j3.hba.ci";
const enabled =
  process.env.IDENTITY_MAIL_HBA_RELOAD_CURRENT187_PG_E2E_CONFIRM ===
  PG_CONFIRMATION;

function digest(label) {
  return createHash("sha256").update(label, "utf8").digest("hex");
}

function requireDisposableUrl() {
  const raw = process.env.DATABASE_URL;
  if (typeof raw !== "string") {
    throw new Error(
      "CURRENT187-J3 PostgreSQL acceptance requires DATABASE_URL.",
    );
  }
  const url = new URL(raw);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  const roleName = decodeURIComponent(url.username);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    !/_(?:ci|test)$/u.test(databaseName) ||
    /(?:^|_)(?:live|prod|production)(?:_|$)/u.test(databaseName) ||
    ["postgres", "template0", "template1"].includes(databaseName) ||
    roleName.length === 0 ||
    decodeURIComponent(url.password).length === 0 ||
    url.port.length === 0
  ) {
    throw new Error(
      "CURRENT187-J3 acceptance is restricted to an explicit loopback *_ci/*_test database.",
    );
  }
  url.search = "";
  url.searchParams.set("application_name", APPLICATION_NAME);
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("sslmode", "disable");
  return { databaseName, roleName, url };
}

function normalizeCatalogRows(rows) {
  return rows.map((row) => ({
    address: row.address,
    authMethod: row.authMethod,
    databases: row.databases,
    error: row.error,
    fileName: row.fileName,
    lineNumber: row.lineNumber,
    netmask: row.netmask,
    options: row.options ?? [],
    ruleNumber: row.ruleNumber,
    type: row.type,
    users: row.users,
  }));
}

test(
  "CURRENT187-J3 reads the actual HBA catalog and either observes a narrow policy or rejects the disposable fixture fail closed",
  { skip: !enabled, timeout: 30_000 },
  async () => {
    const fixture = requireDisposableUrl();
    const client = new PrismaClient({
      datasourceUrl: fixture.url.toString(),
      log: [],
    });
    let identity;
    let hbaRows;
    try {
      identity = await client.$queryRawUnsafe(`
        SELECT
          current_database()::text AS "databaseName",
          (SELECT oid::text FROM pg_catalog.pg_database WHERE datname = current_database()) AS "databaseOid",
          session_user::text AS "roleName",
          (SELECT oid::text FROM pg_catalog.pg_roles WHERE rolname = session_user) AS "roleOid",
          pg_catalog.pg_conf_load_time() AS "configurationLoadTime"
      `);
      hbaRows = await client.$queryRawUnsafe(`
        SELECT
          rule_number::text AS "ruleNumber",
          file_name::text AS "fileName",
          line_number::text AS "lineNumber",
          type::text AS "type",
          database::text[] AS "databases",
          user_name::text[] AS "users",
          address::text AS "address",
          netmask::text AS "netmask",
          auth_method::text AS "authMethod",
          options::text[] AS "options",
          error::text AS "error"
        FROM pg_catalog.pg_hba_file_rules
        ORDER BY rule_number
      `);
    } finally {
      await client.$disconnect();
    }
    assert.equal(identity.length, 1);
    assert.ok(hbaRows.length > 0);

    let expectedHbaCatalogDigest;
    let catalogSafe = true;
    try {
      expectedHbaCatalogDigest =
        computeSyntheticCurrent187HbaCatalogDigestForTestOnly(
          normalizeCatalogRows(hbaRows),
        );
    } catch (error) {
      catalogSafe = false;
      assert.match(error.code, /^CURRENT187_HBA_RELOAD_/u);
    }

    const baseInput = {
      applicationName: APPLICATION_NAME,
      clusterIdentityDigest: digest("current187-j3-ci-cluster"),
      databaseUrl: fixture.url.toString(),
      databaseUniverseDigest: digest("current187-j3-ci-universe"),
      environment: "ci",
      expectedControlDatabaseName: identity[0].databaseName,
      expectedControlDatabaseOid: identity[0].databaseOid,
      expectedControlRoleName: identity[0].roleName,
      expectedControlRoleOid: identity[0].roleOid,
      expectedHbaCatalogDigest:
        expectedHbaCatalogDigest ?? digest("unsafe-current187-j3-ci-hba"),
      explicitConfirmation: CURRENT187_HBA_RELOAD_SYNTHETIC_CONFIRMATION,
      releaseSha:
        typeof process.env.CI_RELEASE_SHA === "string" &&
        /^[a-f0-9]{40}$/u.test(process.env.CI_RELEASE_SHA)
          ? process.env.CI_RELEASE_SHA
          : "a".repeat(40),
      reloadChallengeDigest: digest("current187-j3-ci-reload-challenge"),
      reloadNotBefore: new Date(
        new Date(identity[0].configurationLoadTime).getTime() - 1_000,
      ).toISOString(),
      statementTimeoutMs: 5_000,
      transactionTimeoutMs: 15_000,
    };

    if (!catalogSafe) {
      await assert.rejects(
        () =>
          collectSyntheticCurrent187HbaReloadEvidenceWithPrismaForTestOnly(
            baseInput,
          ),
        { code: "CURRENT187_HBA_RELOAD_COLLECTION_FAILED" },
      );
      return;
    }

    const receipt =
      await collectSyntheticCurrent187HbaReloadEvidenceWithPrismaForTestOnly(
        baseInput,
      );
    assert.equal(isVerifiedCurrent187HbaReloadReceipt(receipt), true);
    assert.equal(receipt.hbaRulesObserved, true);
    assert.equal(receipt.hbaCatalogEffectiveAttested, false);
    assert.equal(receipt.hbaCatalogLoadedAttested, false);
    assert.equal(receipt.reloadEpochAttested, false);
    assert.equal(receipt.authorization, false);
    assert.equal(receipt.canMutate, false);
    assert.equal(receipt.canSend, false);
    assert.equal(receipt.sharedBetaAccess, false);
  },
);
