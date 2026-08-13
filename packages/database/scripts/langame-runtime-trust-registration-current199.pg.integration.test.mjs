import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const DATABASE = "leetplus_ci";
const RUNTIME_ROLE = "leetplus_current199_runtime_ci";
const RUNTIME_MARKER = "LEETPLUS_CURRENT199_RUNTIME_CI_V1";
const PARENT_ROLE = "leetplus_current199_parent_ci";
const PARENT_MARKER = "LEETPLUS_CURRENT199_PARENT_CI_V1";
const REGISTRATION_ID = "enrollment_current199_pg_0001";
const CONFIRMATION =
  "run-langame-current199-registration-ledger-on-disposable-github-ci";

function admittedDatabaseUrl() {
  assert.equal(process.env.CI, "true");
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.equal(
    process.env.LANGAME_CURRENT199_REGISTRATION_INTEGRATION,
    CONFIRMATION,
  );
  const raw = process.env.DATABASE_URL;
  assert.equal(typeof raw, "string");
  const parsed = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(
    decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
    DATABASE,
  );
  assert.equal(decodeURIComponent(parsed.username), "postgres");
  assert.match(process.env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/u);
  return raw;
}

async function scalar(client, text, values = []) {
  const result = await client.query(text, values);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}

function registrationArguments(identity, validUntil) {
  const issuedAt = new Date(validUntil.getTime() - 4_000);
  const collectedAt = new Date(validUntil.getTime() - 3_800);
  const preparedAt = new Date(validUntil.getTime() - 3_500);
  return [
    REGISTRATION_ID,
    "LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_V1",
    "1".repeat(64),
    "2".repeat(64),
    "3".repeat(64),
    "LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_V1",
    "4".repeat(64),
    "5".repeat(64),
    "6".repeat(64),
    process.env.GITHUB_SHA,
    "7".repeat(64),
    "8".repeat(64),
    "9".repeat(64),
    DATABASE,
    identity.databaseOid,
    identity.ownerRoleName,
    identity.ownerRoleOid,
    RUNTIME_ROLE,
    identity.runtimeRoleOid,
    1,
    "langame-current199-bootstrap-ci",
    "a".repeat(64),
    "langame-current199-attestation-ci",
    "b".repeat(64),
    "c".repeat(64),
    "langame-current199-revoke-ci",
    "d".repeat(64),
    "e".repeat(64),
    "f".repeat(64),
    "api.langame.ru",
    443,
    "api.langame.ru",
    "0".repeat(64),
    "1".repeat(64),
    new Date("2026-01-01T00:00:00.000Z"),
    new Date("2027-01-01T00:00:00.000Z"),
    "TLSv1.3",
    "2".repeat(64),
    "3".repeat(64),
    issuedAt,
    collectedAt,
    preparedAt,
    validUntil,
    false,
  ];
}

const placeholders = Array.from(
  { length: 44 },
  (_, index) => `$${index + 1}`,
).join(", ");
const REGISTER_SQL = `
  SELECT *
  FROM public.langame_runtime_trust_registration_register_current199_v1(
    ${placeholders}
  )`;
const EXPIRE_SQL = `
  SELECT *
  FROM public.langame_runtime_trust_registration_expire_current199_v1($1, $2)`;

async function expectSqlState(action, expected) {
  await assert.rejects(action, (error) => error?.code === expected);
}

test(
  "CURRENT199 actual owner-only registration ledger replays and expires exactly",
  { timeout: 45_000 },
  async () => {
    const databaseUrl = admittedDatabaseUrl();
    const owner = new Client({ connectionString: databaseUrl });
    const first = new Client({ connectionString: databaseUrl });
    const second = new Client({ connectionString: databaseUrl });
    let runtimeRoleCreated = false;
    let parentRoleCreated = false;
    let databaseOwnerChanged = false;
    let fixtureRowsMayExist = false;
    await owner.connect();
    try {
      const preflight = await scalar(
        owner,
        `SELECT
          (SELECT count(*)::INTEGER FROM pg_catalog.pg_roles
           WHERE rolname = $1) AS "runtimeRoleCount",
          (SELECT count(*)::INTEGER FROM pg_catalog.pg_roles
           WHERE rolname = $2) AS "parentRoleCount",
          (SELECT count(*)::INTEGER
           FROM public."LangameRuntimeTrustRegistrationV1")
            AS "registrationCount",
          (SELECT count(*)::INTEGER
           FROM public."LangameRuntimeTrustRegistrationEventV1")
            AS "eventCount"`,
        [RUNTIME_ROLE, PARENT_ROLE],
      );
      assert.deepEqual(preflight, {
        eventCount: 0,
        parentRoleCount: 0,
        registrationCount: 0,
        runtimeRoleCount: 0,
      });

      await owner.query(
        `CREATE ROLE ${RUNTIME_ROLE}
         LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
         NOREPLICATION NOBYPASSRLS`,
      );
      await owner.query(
        `COMMENT ON ROLE ${RUNTIME_ROLE} IS '${RUNTIME_MARKER}'`,
      );
      runtimeRoleCreated = true;
      await owner.query(
        `CREATE ROLE ${PARENT_ROLE}
         NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
         NOREPLICATION NOBYPASSRLS`,
      );
      await owner.query(`COMMENT ON ROLE ${PARENT_ROLE} IS '${PARENT_MARKER}'`);
      parentRoleCreated = true;
      const identity = await scalar(
        owner,
        `SELECT database_object.oid::BIGINT AS "databaseOid",
          CURRENT_USER AS "ownerRoleName",
          owner_role.oid::BIGINT AS "ownerRoleOid",
          runtime_role.oid::BIGINT AS "runtimeRoleOid"
        FROM pg_catalog.pg_database AS database_object
        INNER JOIN pg_catalog.pg_roles AS owner_role
          ON owner_role.rolname = CURRENT_USER
        INNER JOIN pg_catalog.pg_roles AS runtime_role
          ON runtime_role.rolname = $1
        WHERE database_object.datname = pg_catalog.current_database()`,
        [RUNTIME_ROLE],
      );

      const acl = await scalar(
        owner,
        `SELECT
          (SELECT bool_or(pg_catalog.has_function_privilege(
             $1, routine.oid, 'EXECUTE'
           ))
           FROM pg_catalog.pg_proc AS routine
           WHERE routine.proname IN (
             'langame_runtime_trust_registration_register_current199_v1',
             'langame_runtime_trust_registration_expire_current199_v1'
           )) AS "canExecute",
          pg_catalog.has_table_privilege(
            $1, 'public."LangameRuntimeTrustRegistrationV1"', 'SELECT'
          ) AS "canRead",
          pg_catalog.has_table_privilege(
            $1, 'public."LangameRuntimeTrustRegistrationV1"', 'INSERT'
          ) AS "canInsert"`,
        [RUNTIME_ROLE],
      );
      assert.deepEqual(acl, {
        canExecute: false,
        canInsert: false,
        canRead: false,
      });

      const validationArgs = registrationArguments(
        identity,
        new Date(Date.now() + 120_000),
      );

      const wrongOid = [...validationArgs];
      wrongOid[18] = BigInt(identity.runtimeRoleOid) + 1n;
      await expectSqlState(() => owner.query(REGISTER_SQL, wrongOid), "42501");
      await owner.query(`ALTER ROLE ${RUNTIME_ROLE} CREATEROLE`);
      await expectSqlState(
        () => owner.query(REGISTER_SQL, validationArgs),
        "42501",
      );
      await owner.query(`ALTER ROLE ${RUNTIME_ROLE} NOCREATEROLE`);
      await owner.query(`GRANT ${PARENT_ROLE} TO ${RUNTIME_ROLE}`);
      await expectSqlState(
        () => owner.query(REGISTER_SQL, validationArgs),
        "42501",
      );
      await owner.query(`REVOKE ${PARENT_ROLE} FROM ${RUNTIME_ROLE}`);
      await owner.query(`ALTER DATABASE ${DATABASE} OWNER TO ${PARENT_ROLE}`);
      databaseOwnerChanged = true;
      await expectSqlState(
        () => owner.query(REGISTER_SQL, validationArgs),
        "42501",
      );
      await owner.query(`ALTER DATABASE ${DATABASE} OWNER TO postgres`);
      databaseOwnerChanged = false;

      const validUntil = new Date(Date.now() + 8_000);
      const args = registrationArguments(identity, validUntil);

      await first.connect();
      await second.connect();
      fixtureRowsMayExist = true;
      const concurrent = await Promise.all([
        first.query(REGISTER_SQL, args),
        second.query(REGISTER_SQL, args),
      ]);
      const registrations = concurrent.map((result) => result.rows[0]);
      assert.deepEqual(registrations.map((row) => row.replayed).sort(), [
        false,
        true,
      ]);
      for (const row of registrations) {
        assert.equal(row.registrationId, REGISTRATION_ID);
        assert.equal(row.status, "PENDING");
        assert.equal(row.validUntil.toISOString(), validUntil.toISOString());
      }

      const replay = (await owner.query(REGISTER_SQL, args)).rows[0];
      assert.equal(replay.replayed, true);
      assert.equal(replay.status, "PENDING");
      const changedReplay = [...args];
      changedReplay[8] = "a".repeat(64);
      await expectSqlState(
        () => owner.query(REGISTER_SQL, changedReplay),
        "55000",
      );
      const conflictingInitialRegistration = [...args];
      conflictingInitialRegistration[0] = "enrollment_current199_pg_0002";
      conflictingInitialRegistration[2] = "a".repeat(64);
      conflictingInitialRegistration[3] = "b".repeat(64);
      conflictingInitialRegistration[4] = "c".repeat(64);
      await expectSqlState(
        () => owner.query(REGISTER_SQL, conflictingInitialRegistration),
        "55000",
      );
      await expectSqlState(
        () => owner.query(EXPIRE_SQL, [REGISTRATION_ID, "1".repeat(64)]),
        "55000",
      );

      const remaining = validUntil.getTime() - Date.now();
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining + 150));
      }
      const expiries = await Promise.all([
        first.query(EXPIRE_SQL, [REGISTRATION_ID, "1".repeat(64)]),
        second.query(EXPIRE_SQL, [REGISTRATION_ID, "1".repeat(64)]),
      ]);
      assert.deepEqual(
        expiries.map((result) => result.rows[0].replayed).sort(),
        [false, true],
      );
      for (const result of expiries) {
        assert.equal(result.rows[0].registrationId, REGISTRATION_ID);
        assert.equal(result.rows[0].status, "EXPIRED");
        assert.ok(result.rows[0].expiredAt instanceof Date);
      }

      await expectSqlState(
        () =>
          owner.query(
            `UPDATE public."LangameRuntimeTrustRegistrationV1"
             SET "status" = 'PENDING' WHERE "id" = $1`,
            [REGISTRATION_ID],
          ),
        "42501",
      );
      await expectSqlState(
        () =>
          owner.query(
            `DELETE FROM public."LangameRuntimeTrustRegistrationEventV1"
             WHERE "registrationId" = $1`,
            [REGISTRATION_ID],
          ),
        "42501",
      );
      const terminal = await scalar(
        owner,
        `SELECT
          (SELECT count(*)::INTEGER
           FROM public."LangameRuntimeTrustRegistrationV1"
           WHERE "id" = $1 AND "status" = 'EXPIRED')
            AS "expiredRegistrationCount",
          (SELECT count(*)::INTEGER
           FROM public."LangameRuntimeTrustRegistrationEventV1"
           WHERE "registrationId" = $1) AS "eventCount"`,
        [REGISTRATION_ID],
      );
      assert.deepEqual(terminal, {
        eventCount: 2,
        expiredRegistrationCount: 1,
      });
    } finally {
      await Promise.allSettled([first.end(), second.end()]);
      if (databaseOwnerChanged) {
        await owner.query(`ALTER DATABASE ${DATABASE} OWNER TO postgres`);
      }
      if (fixtureRowsMayExist) {
        await owner.query(
          `TRUNCATE TABLE
            public."LangameRuntimeTrustRegistrationEventV1",
            public."LangameRuntimeTrustRegistrationV1"`,
        );
      }
      if (runtimeRoleCreated) {
        if (parentRoleCreated) {
          await owner.query(`REVOKE ${PARENT_ROLE} FROM ${RUNTIME_ROLE}`);
        }
        const marker = await scalar(
          owner,
          `SELECT pg_catalog.shobj_description(role_object.oid, 'pg_authid')
             AS marker
           FROM pg_catalog.pg_roles AS role_object
           WHERE role_object.rolname = $1`,
          [RUNTIME_ROLE],
        );
        assert.equal(marker.marker, RUNTIME_MARKER);
        await owner.query(`DROP ROLE ${RUNTIME_ROLE}`);
      }
      if (parentRoleCreated) {
        const marker = await scalar(
          owner,
          `SELECT pg_catalog.shobj_description(role_object.oid, 'pg_authid')
             AS marker
           FROM pg_catalog.pg_roles AS role_object
           WHERE role_object.rolname = $1`,
          [PARENT_ROLE],
        );
        assert.equal(marker.marker, PARENT_MARKER);
        await owner.query(`DROP ROLE ${PARENT_ROLE}`);
      }
      await owner.end();
    }
  },
);
