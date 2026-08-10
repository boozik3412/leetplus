import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CURRENT180_CURRENT190_DISPOSABLE_DATABASE_PATTERN,
  CURRENT180_CURRENT190_REHEARSAL_CONTRACT,
  Current180Current190ReleaseRehearsalBlockedError,
  assertCurrent180Current190AssemblyAllowed,
  assertCurrent180Current190DisposableTarget,
  inspectCurrent180Current190ReleaseRehearsal,
} from "./current180-current190-release-rehearsal-blocker.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const SAFE_DATABASE_NAME = "lp_c180190_0123456789abcdef0123456789abcdef_ci";
const SAFE_URL = `postgresql://release_rehearsal@127.0.0.1:55432/${SAFE_DATABASE_NAME}`;

async function report(overrides = {}) {
  return inspectCurrent180Current190ReleaseRehearsal({
    databaseUrl: SAFE_URL,
    nodeEnv: "test",
    repositoryRoot: REPOSITORY_ROOT,
    ...overrides,
  });
}

function expectBlocked(action, code, finding) {
  assert.throws(action, (error) => {
    assert(error instanceof Current180Current190ReleaseRehearsalBlockedError);
    assert.equal(error.code, code);
    assert(error.findings.includes(finding), JSON.stringify(error.findings));
    return true;
  });
}

test("pins all CURRENT180-CURRENT190 bytes and returns a deny-only blocker report", async () => {
  const value = await report();
  assert.equal(value.contract, CURRENT180_CURRENT190_REHEARSAL_CONTRACT);
  assert.equal(value.status, "BLOCKED");
  assert.deepEqual(value.canonical, {
    count: 180,
    head: "20260804120000_guest_game_max_pending_rewards",
    headChecksum:
      "40587bc93c34875edf6064f9848e42ce0194b321165ac494750987533cef21ef",
    manifestDigest:
      "8a763027a16c45532bf1cff84fdaacf27f2c4e834cae15cffd7a15feae63f6dc",
  });
  assert.equal(value.artifactIntegrityVerified, true);
  assert.equal(
    value.artifactSetDigest,
    "7b2d29eb70674dd62450c322f33b2a689f64dd110a4c85e123b8bc517887919a",
  );
  assert.equal(
    value.blockerDigest,
    "ddec0c400a08f04183ffc0348fd202cfa509973cd7b37973b4290eb482076916",
  );
  assert.equal(
    value.current187ToolingDigest,
    "99c5a971310a20eb2b5dccb2e625bba3a817918b172a3111dc0485772aab5523",
  );
  assert.equal(
    value.previousFoundationToolingDigest,
    "8141c8c5ac28967ca28b0f2aec91eb27c1df1250f41ce378bff114c9a863d817",
  );
  assert.equal(value.artifacts.length, 11);
  assert.deepEqual(
    value.artifacts.map(({ ordinal }) => ordinal),
    [180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190],
  );
  assert.deepEqual(
    value.logicalOrder,
    [180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190],
  );
  assert.deepEqual(
    value.prismaDirectoryOrder,
    [180, 181, 182, 183, 184, 185, 186, 188, 189, 190, 187],
  );
  assert.equal(value.verifiedThroughOrdinal, 186);
  assert(Object.isFrozen(value));
  assert(Object.isFrozen(value.blockers));
  assert(Object.isFrozen(value.authorization));
});

test("reports every mechanically proven lineage and composition blocker", async () => {
  const value = await report();
  assert.deepEqual(
    value.blockers.map(({ code }) => code),
    [
      "DISPOSABLE_DATABASE_GUARD_INTERSECTION_EMPTY",
      "EXPLICIT_DUTY_ROLE_BINDING_REQUIRED",
      "PREVIOUS_FOUNDATION_INVENTORY_GATES_REJECT_STACK",
      "PRISMA_DIRECTORY_ORDER_CONFLICT",
      "REQUIRED_CONTRACT_NOT_MATERIALIZED_IN_CANDIDATE_CHAIN",
      "REQUIRED_CONTRACT_NOT_MATERIALIZED_IN_CANDIDATE_CHAIN",
      "UNRESOLVED_PREDECESSOR_CONTRACT",
      "UNRESOLVED_PREDECESSOR_CONTRACT",
      "UNRESOLVED_PREDECESSOR_CONTRACT",
      "UNRESOLVED_PREDECESSOR_CONTRACT",
    ],
  );
  assert.deepEqual(
    value.blockers
      .filter(({ code }) => code === "UNRESOLVED_PREDECESSOR_CONTRACT")
      .map(({ ordinal }) => ordinal),
    [187, 188, 189, 190],
  );
  assert.deepEqual(
    value.blockers
      .filter(
        ({ code }) =>
          code === "REQUIRED_CONTRACT_NOT_MATERIALIZED_IN_CANDIDATE_CHAIN",
      )
      .map(({ ordinal }) => ordinal),
    [187, 188],
  );
  assert.deepEqual(
    value.blockers.find(
      ({ code }) => code === "PREVIOUS_FOUNDATION_INVENTORY_GATES_REJECT_STACK",
    )?.ordinals,
    [180, 181, 183, 184, 185, 186],
  );
});

test("denies every mutation, role, grant, route, provider and production effect", async () => {
  const value = await report();
  assert.deepEqual(value.authorization, {
    canAssemble: false,
    canDeploy: false,
    canMutateCanonicalMigrations: false,
    canProvisionRoles: false,
    canMutateGrants: false,
    canActivateRoutes: false,
    canCallExternalProviders: false,
    canMutateProduction: false,
    productionApplyAuthorized: false,
  });
  assert.deepEqual(value.effects, {
    databaseConnectionOpened: false,
    migrationArtifactCreated: false,
    migrationCommandExecuted: false,
    roleOrGrantMutationAttempted: false,
    routeActivationAttempted: false,
    externalProviderCallAttempted: false,
  });
  expectBlocked(
    () => assertCurrent180Current190AssemblyAllowed(value),
    "CURRENT180_CURRENT190_ASSEMBLY_DENIED",
    "PRISMA_DIRECTORY_ORDER_CONFLICT",
  );
});

test("accepts only an exact loopback disposable target without query overrides", () => {
  assert.equal(
    CURRENT180_CURRENT190_DISPOSABLE_DATABASE_PATTERN.test(SAFE_DATABASE_NAME),
    true,
  );
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    const target = assertCurrent180Current190DisposableTarget(
      `postgresql://release_rehearsal@${host}:55432/${SAFE_DATABASE_NAME}`,
      "test",
    );
    assert.equal(target.databaseName, SAFE_DATABASE_NAME);
    assert.equal(target.endpoint, "LOOPBACK_ONLY");
    assert.equal(target.nodeEnvironment, "TEST_ONLY");
  }

  for (const unsafe of [
    `postgresql://release_rehearsal@10.0.0.2:55432/${SAFE_DATABASE_NAME}`,
    `postgresql://release_rehearsal@localhost.evil:55432/${SAFE_DATABASE_NAME}`,
    `postgresql://release_rehearsal@localhost:55432/prod_${SAFE_DATABASE_NAME}`,
    `postgresql://release_rehearsal@localhost:55432/${SAFE_DATABASE_NAME}_copy`,
    `postgresql://release_rehearsal@localhost:55432/${SAFE_DATABASE_NAME}?host=10.0.0.2`,
    `postgresql://release_rehearsal@localhost:55432/${SAFE_DATABASE_NAME}?options=-c%20search_path%3Dpublic`,
    `postgresql://release_rehearsal@localhost:55432//${SAFE_DATABASE_NAME}`,
    `postgresql://release_rehearsal@localhost:55432/${SAFE_DATABASE_NAME}/`,
    `postgresql://release_rehearsal@localhost:55432/%6cp_c180190_0123456789abcdef0123456789abcdef_ci`,
    `mysql://release_rehearsal@localhost:55432/${SAFE_DATABASE_NAME}`,
  ]) {
    expectBlocked(
      () => assertCurrent180Current190DisposableTarget(unsafe, "test"),
      "CURRENT180_CURRENT190_UNSAFE_TARGET",
      "EXACT_LOOPBACK_DISPOSABLE_DATABASE_REQUIRED",
    );
  }
});

test("denies NODE_ENV production before any target can be considered", () => {
  expectBlocked(
    () => assertCurrent180Current190DisposableTarget(SAFE_URL, "production"),
    "CURRENT180_CURRENT190_PRODUCTION_DENIED",
    "NODE_ENV_PRODUCTION_DENIED",
  );
  expectBlocked(
    () => assertCurrent180Current190DisposableTarget(SAFE_URL, " Production "),
    "CURRENT180_CURRENT190_PRODUCTION_DENIED",
    "NODE_ENV_PRODUCTION_DENIED",
  );
});

test("requires the exact test environment even when NODE_ENV is absent", () => {
  for (const nodeEnv of [undefined, "development", " test "]) {
    expectBlocked(
      () => assertCurrent180Current190DisposableTarget(SAFE_URL, nodeEnv),
      "CURRENT180_CURRENT190_NON_TEST_ENVIRONMENT_DENIED",
      "NODE_ENV_TEST_REQUIRED",
    );
  }
});

test("target failures never echo credentials or the supplied URL", () => {
  const marker = "never-echo-this-secret";
  const unsafe = `postgresql://release_rehearsal:${marker}@remote.invalid:5432/${SAFE_DATABASE_NAME}`;
  assert.throws(
    () => assertCurrent180Current190DisposableTarget(unsafe, "test"),
    (error) => {
      assert(error instanceof Current180Current190ReleaseRehearsalBlockedError);
      assert.doesNotMatch(error.message, new RegExp(marker, "u"));
      assert.doesNotMatch(
        JSON.stringify(error.findings),
        new RegExp(marker, "u"),
      );
      return true;
    },
  );
});

test("fails closed on SQL byte drift before creating a report", async () => {
  const defaultRead = (path) => readFile(path, "utf8");
  await assert.rejects(
    report({
      readText: async (path) => {
        const source = await defaultRead(path);
        return path.endsWith(
          join(
            "20260805040000_guest_portal_session_current190",
            "migration.sql",
          ),
        )
          ? `${source}\n-- forbidden drift\n`
          : source;
      },
    }),
    (error) => {
      assert(error instanceof Current180Current190ReleaseRehearsalBlockedError);
      assert.equal(
        error.code,
        "CURRENT180_CURRENT190_ARTIFACT_INTEGRITY_BLOCKED",
      );
      assert(error.findings.includes("CURRENT190_SQL_SHA_DRIFT"));
      return true;
    },
  );
});

test("fails closed on metadata authority or predecessor drift", async () => {
  const defaultRead = (path) => readFile(path, "utf8");
  await assert.rejects(
    report({
      readText: async (path) => {
        const source = await defaultRead(path);
        if (
          !path.endsWith(
            join(
              "20260805030000_identity_employee_invite_mail_boundary_current189",
              "candidate.json",
            ),
          )
        ) {
          return source;
        }
        const metadata = JSON.parse(source);
        metadata.productionApplyAuthorized = true;
        metadata.predecessor.resolved = true;
        return JSON.stringify(metadata);
      },
    }),
    (error) => {
      assert(error instanceof Current180Current190ReleaseRehearsalBlockedError);
      assert.equal(
        error.code,
        "CURRENT180_CURRENT190_ARTIFACT_INTEGRITY_BLOCKED",
      );
      assert(error.findings.includes("CURRENT189_METADATA_DRIFT"));
      return true;
    },
  );
});

test("fails closed on frozen CURRENT187 authority tooling drift", async () => {
  const defaultRead = (path) => readFile(path, "utf8");
  await assert.rejects(
    report({
      readText: async (path) => {
        const source = await defaultRead(path);
        return path.endsWith(
          "identity-mail-cluster-application-admission-current187-contract.mjs",
        )
          ? `${source}\n// forbidden authority drift\n`
          : source;
      },
    }),
    (error) => {
      assert(error instanceof Current180Current190ReleaseRehearsalBlockedError);
      assert.equal(
        error.code,
        "CURRENT180_CURRENT190_ARTIFACT_INTEGRITY_BLOCKED",
      );
      assert(error.findings.includes("CURRENT187_TOOLING_SHA_DRIFT"));
      return true;
    },
  );
});

test("fails closed on previously observed foundation-gate drift", async () => {
  const defaultRead = (path) => readFile(path, "utf8");
  await assert.rejects(
    report({
      readText: async (path) => {
        const source = await defaultRead(path);
        return path.endsWith(
          "identity-mail-duty-role-current186-foundation.mjs",
        )
          ? `${source}\n// forbidden gate drift\n`
          : source;
      },
    }),
    (error) => {
      assert(error instanceof Current180Current190ReleaseRehearsalBlockedError);
      assert.equal(
        error.code,
        "CURRENT180_CURRENT190_ARTIFACT_INTEGRITY_BLOCKED",
      );
      assert(error.findings.includes("PREVIOUS_FOUNDATION_TOOLING_SHA_DRIFT"));
      return true;
    },
  );
});

test("fails closed on canonical CURRENT180 byte drift", async () => {
  const defaultRead = (path) => readFile(path, "utf8");
  await assert.rejects(
    report({
      readText: async (path) => {
        const source = await defaultRead(path);
        return path.endsWith(
          join(
            "20260804120000_guest_game_max_pending_rewards",
            "migration.sql",
          ),
        )
          ? `${source}\n-- forbidden canonical drift\n`
          : source;
      },
    }),
    (error) => {
      assert(error instanceof Current180Current190ReleaseRehearsalBlockedError);
      assert.equal(
        error.code,
        "CURRENT180_CURRENT190_ARTIFACT_INTEGRITY_BLOCKED",
      );
      assert(error.findings.includes("CANONICAL_HEAD_SHA_DRIFT"));
      assert(error.findings.includes("CANONICAL_MANIFEST_DRIFT"));
      assert(error.findings.includes("CURRENT180_PREDECESSOR_CHAIN_DRIFT"));
      return true;
    },
  );
});

test("implementation is read-only and imports no deploy, database or provider client", async () => {
  const source = await readFile(
    join(
      SCRIPT_DIRECTORY,
      "current180-current190-release-rehearsal-blocker.mjs",
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /node:child_process|@prisma|PrismaClient|\bpg\b|node:http|node:https|nodemailer|fetch\s*\(/u,
  );
  assert.doesNotMatch(source, /execFile|spawnSync|CREATE ROLE|ALTER ROLE/u);
});
