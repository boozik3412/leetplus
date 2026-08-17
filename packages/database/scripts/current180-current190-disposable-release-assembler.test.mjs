import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
  CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_MANIFEST_SHA256,
  CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_PLAN_CONTRACT,
  CURRENT180_CURRENT190_IN_MEMORY_ARTIFACT_CONTRACT,
  Current180Current190DisposableAssemblyError,
  assembleCurrent180Current190InMemoryArtifact,
  inspectCurrent180Current190DisposableReleaseAssembly,
  inspectCurrent180Current190DisposableReleaseAssemblyForTestOnly,
} from "./current180-current190-disposable-release-assembler.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const DATABASE_DIRECTORY = join(REPOSITORY_ROOT, "packages", "database");
const ALLOW_MANIFEST_PATH = join(
  DATABASE_DIRECTORY,
  "release-rehearsals",
  "current180-current190",
  "disposable-assembly-allow-manifest.json",
);
const CURRENT190_SQL_PATH = join(
  DATABASE_DIRECTORY,
  "migration-candidates",
  "20260805040000_guest_portal_session_current190",
  "migration.sql",
);
const CANONICAL_FIRST_SQL_PATH = join(
  DATABASE_DIRECTORY,
  "prisma",
  "migrations",
  "20260427072351_init",
  "migration.sql",
);
const ASSEMBLER_PATH = join(
  SCRIPT_DIRECTORY,
  "current180-current190-disposable-release-assembler.mjs",
);
const INSPECTION_CHAIN_PATHS = [
  join(SCRIPT_DIRECTORY, "current180-current190-release-refreeze-manifest.mjs"),
  join(
    SCRIPT_DIRECTORY,
    "current180-current190-release-materialization-planner.mjs",
  ),
  join(SCRIPT_DIRECTORY, "current180-current190-release-rehearsal-blocker.mjs"),
];
const EXPECTED_INSPECTION_CHAIN_HASHES = [
  "06132026c244cbb6b31d9f2f169e6849e176c5836eb195297c5703ceaedb5e8a",
  "adff50e690c02eaa1bd68ef00374f699656427833a462b413ae2c11fdde5243b",
  "4d6c1e587419586b81a7bcf7d600690d77c2f4df7ffbaf00b20588506a22e6ee",
];
const EXPECTED_PLAN_DIGEST =
  "950f27403e48793147a7f3afef4fcd4016d06aee9eb8872ef0357da6b1fd6b1e";
const EXPECTED_MIGRATION_MANIFEST_DIGEST =
  "3220929d1a33fd20748de14427bf3bd041e1c20445d9525b7fb0a560f8baf476";
const EXPECTED_ENTRY_MANIFEST_DIGEST =
  "00513bf5b31bbf37dd0d82fe025fed72c29c17fe3e26aad8bfa273c2829ed89a";
const EXPECTED_IN_MEMORY_ARTIFACT_DIGEST =
  "fdfa3af95281b9a7bc7b4127adcd8101d1a47ea951a2729139b05df3bf2dc9b1";
const EXCLUDED_CURRENT187_E_DIRECTORY =
  "20260805050000_identity_mail_ddl_fence_ledger_current187";
const IN_MEMORY_SCHEMA_TEXT = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function migrationManifestDigest(entries) {
  return sha256(
    `${entries.map(({ name, sha256: digest }) => `${name} ${digest}`).join("\n")}\n`,
  );
}

function entryManifestDigest(entries) {
  return sha256(
    `${entries.map(({ path, sha256: digest }) => `${path} ${digest}`).join("\n")}\n`,
  );
}

async function builtinPathInfo(path) {
  const [stat, realPath] = await Promise.all([lstat(path), realpath(path)]);
  return {
    realPath,
    symbolicLink: stat.isSymbolicLink(),
    type: stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "other",
  };
}

function assemblyOptions(plan) {
  return {
    allowContract: CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
    assemblyPlanDigest: plan.assemblyPlanDigest,
  };
}

async function inspectWithReadOverride(targetPath, transform) {
  return inspectCurrent180Current190DisposableReleaseAssemblyForTestOnly({
    readBytes: async (path) => {
      const bytes = await readFile(path);
      return resolve(path) === resolve(targetPath) ? transform(bytes) : bytes;
    },
  });
}

test("builds the exact immutable 180+CURRENT180..190 in-memory plan", async () => {
  const plan = await inspectCurrent180Current190DisposableReleaseAssembly();
  assert.equal(
    plan.contract,
    CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_PLAN_CONTRACT,
  );
  assert.equal(plan.status, "FROZEN_IN_MEMORY_ASSEMBLY_PLANNED");
  assert.equal(plan.verified, true);
  assert.equal(plan.assemblyPlanDigest, EXPECTED_PLAN_DIGEST);
  assert.equal(
    plan.allowManifestSha256,
    CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_MANIFEST_SHA256,
  );
  assert.equal(plan.migrations.length, 191);
  assert.deepEqual(
    plan.migrations.map(({ ordinal }) => ordinal),
    [
      ...Array.from({ length: 180 }, (_, index) => index + 1),
      ...Array.from({ length: 11 }, (_, index) => index + 180),
    ],
  );
  assert.deepEqual(
    [...plan.migrations]
      .sort((left, right) => left.name.localeCompare(right.name, "en"))
      .map(({ name }) => name),
    plan.migrations.map(({ name }) => name),
  );
  assert.equal(
    plan.migrations[179].name,
    "20260804120000_guest_game_max_pending_rewards",
  );
  assert.equal(
    plan.migrations[180].name,
    "20260804130000_identity_mail_tenant_enrollment_control_plane",
  );
  assert.equal(
    plan.migrations.at(-1).name,
    "20260805040000_guest_portal_session_current190",
  );
  assert.equal(
    migrationManifestDigest(plan.migrations),
    EXPECTED_MIGRATION_MANIFEST_DIGEST,
  );
  assert(Object.isFrozen(plan));
  assert(Object.isFrozen(plan.migrations));
  assert(Object.isFrozen(plan.migrations[0]));
});

test("keeps authority limited to read-only inspection and in-memory assembly", async () => {
  const plan = await inspectCurrent180Current190DisposableReleaseAssembly();
  assert.equal(plan.authorization.canInspectFrozenRepositorySources, true);
  assert.equal(plan.authorization.canAssembleInMemoryArtifact, true);
  assert.equal(plan.authorization.canMaterializeDisposableTempArtifact, false);
  assert.equal(plan.authorization.canCleanupOwnedDisposableTempArtifact, false);
  for (const key of [
    "canActivateRoutes",
    "canApplyDatabase",
    "canCallExternalProviders",
    "canCallNetwork",
    "canConnectDatabase",
    "canDeploy",
    "canMutateCanonicalMigrations",
    "canMutateGrants",
    "canMutateMigrationCandidates",
    "canMutateProduction",
    "canMutateReleaseProposals",
    "canProvisionRoles",
    "canResolveMigration",
    "canSpawnProcess",
    "productionApplyAuthorized",
  ]) {
    assert.equal(plan.authorization[key], false, key);
  }
  assert.equal(plan.assemblyBoundary.outputKind, "FROZEN_IN_MEMORY_UTF8_TEXT");
  assert.equal(plan.assemblyBoundary.callerSuppliedOutputPathAccepted, false);
  assert.equal(plan.assemblyBoundary.filesystemWriteAllowed, false);
  assert.equal(plan.assemblyBoundary.filesystemCleanupAllowed, false);
  assert.equal(plan.effects.filesystemWriteAttemptedByAssembler, false);
  assert.equal(plan.effects.databaseConnectionOpenedByAssembler, false);
  assert.equal(plan.effects.processSpawnAttemptedByAssembler, false);
  assert.equal(plan.effects.callerSuppliedEffectsUnverified, false);
  assert(plan.findings.includes("FILESYSTEM_MATERIALIZATION_FORBIDDEN"));
  assert(plan.findings.includes("POSTGRESQL_REHEARSAL_RUNNER_REQUIRED"));
});

test("copies every frozen CURRENT180..190 SQL source byte-for-byte in memory", async () => {
  const plan = await inspectCurrent180Current190DisposableReleaseAssembly();
  const artifact = await assembleCurrent180Current190InMemoryArtifact(
    assemblyOptions(plan),
  );
  const byPath = new Map(artifact.entries.map((entry) => [entry.path, entry]));
  for (const migration of plan.migrations.slice(180)) {
    const sourceBytes = await readFile(
      join(REPOSITORY_ROOT, migration.sourceDirectory, "migration.sql"),
    );
    const entry = byPath.get(`migrations/${migration.name}/migration.sql`);
    assert(entry, migration.name);
    assert.equal(entry.content, sourceBytes.toString("utf8"), migration.name);
    assert.equal(entry.byteLength, sourceBytes.length, migration.name);
    assert.equal(entry.sha256, sha256(sourceBytes), migration.name);
    assert.equal(sourceBytes.includes(0x0d), false, migration.name);
  }
});

test("excludes CURRENT187-E from plan and in-memory artifact", async () => {
  const plan = await inspectCurrent180Current190DisposableReleaseAssembly();
  const artifact = await assembleCurrent180Current190InMemoryArtifact(
    assemblyOptions(plan),
  );
  assert.equal(
    plan.migrations.some(
      ({ name }) => name === EXCLUDED_CURRENT187_E_DIRECTORY,
    ),
    false,
  );
  assert.equal(
    artifact.entries.some(({ path }) =>
      path.includes(EXCLUDED_CURRENT187_E_DIRECTORY),
    ),
    false,
  );
  assert.equal(
    plan.excludedAuxiliaryEvidenceLane.mustNeverEnterSchemaLane,
    true,
  );
  assert.equal(artifact.current187EAuxiliaryExcluded, true);
});

test("normalizes only a consistent canonical CRLF or LF source to LF", async () => {
  const plan = await inspectCurrent180Current190DisposableReleaseAssembly();
  const artifact = await assembleCurrent180Current190InMemoryArtifact(
    assemblyOptions(plan),
  );
  const first = plan.migrations[0];
  const source = await readFile(CANONICAL_FIRST_SQL_PATH, "utf8");
  const normalized = source.replaceAll("\r\n", "\n");
  const entry = artifact.entries.find(
    ({ path }) => path === `migrations/${first.name}/migration.sql`,
  );
  assert(entry);
  assert.equal(first.sha256, sha256(normalized));
  assert.equal(entry.content, normalized);
  assert.equal(entry.content.includes("\r"), false);
  assert.equal(
    plan.artifact.canonicalSourceLineEndingNormalization,
    "CONSISTENT_CRLF_OR_LF_TO_LF",
  );
  assert.equal(
    plan.artifact.frozenSourceSqlTransformation,
    "BYTE_EXACT_COPY_ONLY",
  );
});

test("is deterministic across repeated inspections and in-memory assemblies", async () => {
  const firstPlan =
    await inspectCurrent180Current190DisposableReleaseAssembly();
  const secondPlan =
    await inspectCurrent180Current190DisposableReleaseAssembly();
  assert.deepEqual(secondPlan, firstPlan);
  const firstArtifact = await assembleCurrent180Current190InMemoryArtifact(
    assemblyOptions(firstPlan),
  );
  const secondArtifact = await assembleCurrent180Current190InMemoryArtifact(
    assemblyOptions(secondPlan),
  );
  assert.deepEqual(secondArtifact, firstArtifact);
});

test("fails closed when allow-manifest bytes drift", async () => {
  const report = await inspectWithReadOverride(ALLOW_MANIFEST_PATH, (bytes) =>
    Buffer.concat([bytes, Buffer.from("\n")]),
  );
  assert.equal(report.verified, false);
  assert.equal(report.status, "DISPOSABLE_ASSEMBLY_SOURCE_DRIFT_BLOCKED");
  assert(report.findings.includes("ALLOW_MANIFEST_BYTES_DRIFT"));
  assert.equal(report.authorization.canAssembleInMemoryArtifact, false);
});

test("fails closed when a frozen CURRENT190 source byte drifts", async () => {
  const report = await inspectWithReadOverride(CURRENT190_SQL_PATH, (bytes) => {
    const copy = Buffer.from(bytes);
    copy[0] ^= 1;
    return copy;
  });
  assert.equal(report.verified, false);
  assert(report.findings.includes("CURRENT190_SOURCE_SQL_BYTE_DRIFT"));
});

test("fails closed when canonical SQL changes after valid LF normalization", async () => {
  const report = await inspectWithReadOverride(
    CANONICAL_FIRST_SQL_PATH,
    (bytes) =>
      Buffer.from(
        `${bytes.toString("utf8").replaceAll("\r\n", "\n")}\n-- drift\n`,
      ),
  );
  assert.equal(report.verified, false);
  assert(report.findings.includes("CANONICAL_MIGRATION_MANIFEST_DRIFT"));
});

test("rejects lone CR canonical line endings", async () => {
  const report = await inspectWithReadOverride(
    CANONICAL_FIRST_SQL_PATH,
    (bytes) =>
      Buffer.from(
        bytes.toString("utf8").replaceAll("\r\n", "\n").replaceAll("\n", "\r"),
      ),
  );
  assert.equal(report.verified, false);
  assert(report.findings.includes("CANONICAL_MIGRATION_SQL_ENCODING_DRIFT"));
});

test("rejects mixed LF and CRLF canonical line endings", async () => {
  const report = await inspectWithReadOverride(
    CANONICAL_FIRST_SQL_PATH,
    (bytes) => {
      const lf = bytes.toString("utf8").replaceAll("\r\n", "\n");
      return Buffer.from(lf.replace("\n", "\r\n"));
    },
  );
  assert.equal(report.verified, false);
  assert(report.findings.includes("CANONICAL_MIGRATION_SQL_ENCODING_DRIFT"));
});

test("pins and audits the full read-only inspection chain without executing it", async () => {
  const plan = await inspectCurrent180Current190DisposableReleaseAssembly();
  assert.deepEqual(
    plan.inspectionChain.map(({ sha256: digest }) => digest),
    EXPECTED_INSPECTION_CHAIN_HASHES,
  );
  for (let index = 0; index < INSPECTION_CHAIN_PATHS.length; index += 1) {
    const source = await readFile(INSPECTION_CHAIN_PATHS[index]);
    assert.equal(sha256(source), EXPECTED_INSPECTION_CHAIN_HASHES[index]);
  }
  const assemblerSource = await readFile(ASSEMBLER_PATH, "utf8");
  assert.doesNotMatch(assemblerSource, /from\s+["']\.\//u);
});

test("fails closed when a pinned inspection-chain source drifts", async () => {
  const report = await inspectWithReadOverride(
    INSPECTION_CHAIN_PATHS[0],
    (bytes) => Buffer.concat([bytes, Buffer.from("\n")]),
  );
  assert.equal(report.verified, false);
  assert(report.findings.includes("INSPECTION_CHAIN_SOURCE_BYTES_DRIFT"));
});

test("fails closed when repository source provenance reports a symlink", async () => {
  const report =
    await inspectCurrent180Current190DisposableReleaseAssemblyForTestOnly({
      pathInfo: async (path) => {
        const info = await builtinPathInfo(path);
        return resolve(path) === resolve(CURRENT190_SQL_PATH)
          ? { ...info, symbolicLink: true }
          : info;
      },
    });
  assert.equal(report.verified, false);
  assert(report.findings.includes("CURRENT190_SOURCE_SQL_PROVENANCE_INVALID"));
});

test("marks caller-supplied test capabilities and their effects unverified", async () => {
  let reads = 0;
  const report =
    await inspectCurrent180Current190DisposableReleaseAssemblyForTestOnly({
      readBytes: async (path) => {
        reads += 1;
        return readFile(path);
      },
    });
  assert.equal(report.verified, true);
  assert(reads > 0);
  assert.equal(report.dependencyBoundary.callerSuppliedCapabilityInvoked, true);
  assert.equal(report.dependencyBoundary.externalEffectsUnverified, true);
  assert.equal(report.effects.callerSuppliedEffectsUnverified, true);
  assert.equal(report.effects.scope, "ASSEMBLER_IMPLEMENTATION_ONLY");
  await assert.rejects(
    inspectCurrent180Current190DisposableReleaseAssemblyForTestOnly({
      writeBytes: async () => undefined,
    }),
    (error) => {
      assert(error instanceof Current180Current190DisposableAssemblyError);
      assert.equal(error.code, "DISPOSABLE_ASSEMBLY_TEST_ARGUMENTS_INVALID");
      return true;
    },
  );
});

test("rejects malformed public options without reflecting caller data", async () => {
  await assert.rejects(
    inspectCurrent180Current190DisposableReleaseAssembly({
      unexpectedSecret: "do-not-reflect",
    }),
    (error) => {
      assert(error instanceof Current180Current190DisposableAssemblyError);
      assert.equal(error.code, "DISPOSABLE_ASSEMBLY_ARGUMENTS_INVALID");
      assert.doesNotMatch(error.message, /do-not-reflect/u);
      assert.doesNotMatch(JSON.stringify(error.findings), /do-not-reflect/u);
      return true;
    },
  );
});

test("rejects Proxy and accessor options without invoking caller code", async () => {
  let proxyTrapCount = 0;
  const proxyOptions = new Proxy(
    {},
    {
      get() {
        proxyTrapCount += 1;
        return undefined;
      },
      getOwnPropertyDescriptor() {
        proxyTrapCount += 1;
        return undefined;
      },
      getPrototypeOf() {
        proxyTrapCount += 1;
        return Object.prototype;
      },
      ownKeys() {
        proxyTrapCount += 1;
        return [];
      },
    },
  );
  await assert.rejects(
    inspectCurrent180Current190DisposableReleaseAssembly(proxyOptions),
    Current180Current190DisposableAssemblyError,
  );
  assert.equal(proxyTrapCount, 0);

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  await assert.rejects(
    inspectCurrent180Current190DisposableReleaseAssembly(revoked.proxy),
    Current180Current190DisposableAssemblyError,
  );

  let accessorReadCount = 0;
  const inspectAccessorOptions = {};
  Object.defineProperty(inspectAccessorOptions, "unexpected", {
    enumerable: true,
    get() {
      accessorReadCount += 1;
      return "do-not-read";
    },
  });
  await assert.rejects(
    inspectCurrent180Current190DisposableReleaseAssembly(
      inspectAccessorOptions,
    ),
    Current180Current190DisposableAssemblyError,
  );

  const plan = await inspectCurrent180Current190DisposableReleaseAssembly();
  const assemblyAccessorOptions = {};
  for (const key of ["allowContract", "assemblyPlanDigest"]) {
    Object.defineProperty(assemblyAccessorOptions, key, {
      enumerable: true,
      get() {
        accessorReadCount += 1;
        return key === "allowContract"
          ? CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT
          : plan.assemblyPlanDigest;
      },
    });
  }
  await assert.rejects(
    assembleCurrent180Current190InMemoryArtifact(assemblyAccessorOptions),
    Current180Current190DisposableAssemblyError,
  );

  let coercionCount = 0;
  await assert.rejects(
    assembleCurrent180Current190InMemoryArtifact({
      allowContract: CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
      assemblyPlanDigest: {
        toString() {
          coercionCount += 1;
          return plan.assemblyPlanDigest;
        },
      },
    }),
    Current180Current190DisposableAssemblyError,
  );
  assert.equal(coercionCount, 0);

  const testOnlyAccessorOptions = {};
  Object.defineProperty(testOnlyAccessorOptions, "readBytes", {
    enumerable: true,
    get() {
      accessorReadCount += 1;
      return readFile;
    },
  });
  await assert.rejects(
    inspectCurrent180Current190DisposableReleaseAssemblyForTestOnly(
      testOnlyAccessorOptions,
    ),
    Current180Current190DisposableAssemblyError,
  );
  assert.equal(accessorReadCount, 0);

  let inheritedGetterCount = 0;
  Object.defineProperty(Object.prototype, "readBytes", {
    configurable: true,
    get() {
      inheritedGetterCount += 1;
      return readFile;
    },
  });
  try {
    const testOnlyReport =
      await inspectCurrent180Current190DisposableReleaseAssemblyForTestOnly({});
    assert.equal(testOnlyReport.verified, true);
    assert.equal(testOnlyReport.effects.callerSuppliedEffectsUnverified, true);
  } finally {
    delete Object.prototype.readBytes;
  }
  assert.equal(inheritedGetterCount, 0);

  let symbolGetterCount = 0;
  const symbolOptions = {};
  Object.defineProperty(symbolOptions, Symbol("hidden"), {
    get() {
      symbolGetterCount += 1;
      return "do-not-read";
    },
  });
  await assert.rejects(
    inspectCurrent180Current190DisposableReleaseAssembly(symbolOptions),
    Current180Current190DisposableAssemblyError,
  );
  assert.equal(symbolGetterCount, 0);
});

test("implementation has no filesystem-write, database, process, network or provider capability", async () => {
  const source = await readFile(ASSEMBLER_PATH, "utf8");
  const importSpecifiers = [...source.matchAll(/from\s+"([^"]+)";/gu)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(importSpecifiers, [
    "node:crypto",
    "node:fs/promises",
    "node:path",
    "node:url",
    "node:util/types",
  ]);
  assert.doesNotMatch(
    source,
    /\bnew\s+PrismaClient|\b(?:connect|query|spawnSync|execFile|fetch)\s*\(/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:mkdir|mkdtemp|writeFile|unlink|rmdir|rm)\s*\(/u,
  );
  assert.doesNotMatch(source, /from\s+["']node:os["']/u);
  assert.doesNotMatch(source, /from\s+["']\.\//u);
  assert.equal(source.match(/process\.env/gu)?.length, 1);
  assert.match(source, /replaceAll\("process\.env\.NODE_ENV", ""\)/u);
  assert.equal(source.match(/DATABASE_URL/gu)?.length, 1);
  assert.match(source, /url\s+= env\("DATABASE_URL"\)/u);
  assert.match(source, /FROZEN_IN_MEMORY_UTF8_TEXT/u);
  assert.match(source, /filesystemWriteAttemptedByAssembler: false/u);
});

test("assembles an exact frozen in-memory artifact without output paths", async () => {
  const plan = await inspectCurrent180Current190DisposableReleaseAssembly();
  const artifact = await assembleCurrent180Current190InMemoryArtifact(
    assemblyOptions(plan),
  );
  assert.equal(
    artifact.contract,
    CURRENT180_CURRENT190_IN_MEMORY_ARTIFACT_CONTRACT,
  );
  assert.equal(
    artifact.status,
    "FROZEN_IN_MEMORY_ARTIFACT_ASSEMBLED_NOT_RUNNABLE",
  );
  assert.equal(artifact.entryCount, 193);
  assert.equal(artifact.entries.length, 193);
  assert.equal(artifact.migrationCount, 191);
  assert.equal(
    artifact.migrationManifestDigest,
    EXPECTED_MIGRATION_MANIFEST_DIGEST,
  );
  assert.equal(artifact.entryManifestDigest, EXPECTED_ENTRY_MANIFEST_DIGEST);
  assert.equal(
    artifact.inMemoryArtifactDigest,
    EXPECTED_IN_MEMORY_ARTIFACT_DIGEST,
  );
  assert.equal(
    entryManifestDigest(artifact.entries),
    EXPECTED_ENTRY_MANIFEST_DIGEST,
  );
  assert.deepEqual(
    artifact.entries.slice(0, 2).map(({ path }) => path),
    ["schema.prisma", "migrations/migration_lock.toml"],
  );
  assert.equal(artifact.entries[0].content, IN_MEMORY_SCHEMA_TEXT);
  assert.equal(
    artifact.entries[1].sha256,
    "99836963713b4f5b269ad49af0ed3d7b0b2e336115c2f92dc9ac683d139d0900",
  );
  assert.equal(
    artifact.entries.at(-1).path,
    "migrations/20260805040000_guest_portal_session_current190/migration.sql",
  );
  assert.equal(
    artifact.entries.at(-1).sha256,
    "d23c0e8fbdfddd0eb9ec7a73d877e7bbcde8c170683247a66f43530cca3867d5",
  );
  for (const entry of artifact.entries) {
    assert.equal(typeof entry.content, "string", entry.path);
    assert.equal(Buffer.byteLength(entry.content, "utf8"), entry.byteLength);
    assert.equal(sha256(entry.content), entry.sha256, entry.path);
    assert.equal(entry.content.includes("\r"), false, entry.path);
    assert.equal(Object.hasOwn(entry, "outputDirectory"), false);
  }
  assert.equal(Object.hasOwn(artifact, "outputDirectory"), false);
  assert(Object.isFrozen(artifact));
  assert(Object.isFrozen(artifact.entries));
  assert(Object.isFrozen(artifact.entries[0]));
});

test("requires exact allow contract and plan digest and rejects output arguments", async () => {
  const plan = await inspectCurrent180Current190DisposableReleaseAssembly();
  for (const options of [
    {
      allowContract: CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
      assemblyPlanDigest: "0".repeat(64),
    },
    {
      allowContract: "WRONG",
      assemblyPlanDigest: plan.assemblyPlanDigest,
    },
    {
      ...assemblyOptions(plan),
      outputDirectory: "do-not-reflect",
    },
  ]) {
    await assert.rejects(
      assembleCurrent180Current190InMemoryArtifact(options),
      (error) => {
        assert(error instanceof Current180Current190DisposableAssemblyError);
        assert.doesNotMatch(error.message, /do-not-reflect/u);
        assert.doesNotMatch(JSON.stringify(error.findings), /do-not-reflect/u);
        return true;
      },
    );
  }
});

test("in-memory result remains non-runnable and immutable", async () => {
  const plan = await inspectCurrent180Current190DisposableReleaseAssembly();
  const artifact = await assembleCurrent180Current190InMemoryArtifact(
    assemblyOptions(plan),
  );
  for (const key of [
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
  ]) {
    assert.equal(artifact.authorization[key], false, key);
  }
  assert.equal(artifact.effects.filesystemWriteAttemptedByAssembler, false);
  assert.equal(artifact.effects.databaseConnectionOpenedByAssembler, false);
  assert.equal(artifact.effects.processSpawnAttemptedByAssembler, false);
  assert.equal(artifact.effects.inMemoryAssemblyPerformed, true);
  assert.throws(() => {
    artifact.entries[0].content = "mutated";
  }, TypeError);
});
