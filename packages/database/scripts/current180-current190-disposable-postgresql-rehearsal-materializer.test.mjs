import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  symlink,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import {
  assembleCurrent180Current190InMemoryArtifact,
  CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
  inspectCurrent180Current190DisposableReleaseAssembly,
} from "./current180-current190-disposable-release-assembler.mjs";
import {
  assertCurrent180Current190DisposablePostgresqlManualInspectionReceipt,
  assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceiptForTestOnly as assertRunnerVerificationReceiptForTestOnly,
  cleanupCurrent180Current190DisposablePostgresqlArtifactAfterRestartForTestOnly,
  cleanupCurrent180Current190DisposablePostgresqlArtifact as cleanupProductionArgumentGate,
  cleanupCurrent180Current190DisposablePostgresqlArtifactAfterManualInspection,
  cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly as cleanupArtifactForTestOnly,
  Current180Current190DisposablePostgresqlMaterializerError,
  materializeCurrent180Current190DisposablePostgresqlArtifact as materializeArtifactProductionArgumentGate,
  materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly as materializeArtifactForTestOnly,
  rehydrateCurrent180Current190DisposablePostgresqlMaterializationRecoveryForTestOnly,
  verifyCurrent180Current190DisposablePostgresqlArtifactForRunnerForTestOnly as verifyArtifactForRunnerForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-materializer.mjs";
import {
  createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly,
  issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-coordinator.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const MATERIALIZER_PATH = join(
  SCRIPT_DIRECTORY,
  "current180-current190-disposable-postgresql-rehearsal-materializer.mjs",
);
const ROOT_NAME_PATTERN = /^lp-c180190-[0-9a-f]{64}-[A-Za-z0-9]{6}$/u;

let artifact;
let initialOwnedRoots;
const coordinatorAuthority =
  createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly();
let coordinatorRunBinding;

function materializeCurrent180Current190DisposablePostgresqlArtifact(
  candidateArtifact,
) {
  if (arguments.length !== 1) {
    return materializeArtifactProductionArgumentGate(...arguments);
  }
  return materializeArtifactForTestOnly(
    candidateArtifact,
    coordinatorAuthority,
    coordinatorRunBinding,
  );
}

function materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
  candidateArtifact,
  options = {},
) {
  return materializeArtifactForTestOnly(
    candidateArtifact,
    coordinatorAuthority,
    coordinatorRunBinding,
    options,
  );
}

function cleanupCurrent180Current190DisposablePostgresqlArtifact(receipt) {
  if (arguments.length !== 1) {
    return cleanupProductionArgumentGate(...arguments);
  }
  return cleanupArtifactForTestOnly(receipt);
}

function cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
  receipt,
  options = {},
) {
  return cleanupArtifactForTestOnly(receipt, options);
}

function verifyCurrent180Current190DisposablePostgresqlArtifactForRunner(
  receipt,
) {
  return verifyArtifactForRunnerForTestOnly(receipt);
}

function assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceipt(
  receipt,
) {
  return assertRunnerVerificationReceiptForTestOnly(receipt);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isStrictDescendant(path, parent) {
  const pathRelativeToParent = relative(parent, path);
  return (
    pathRelativeToParent.length > 0 &&
    pathRelativeToParent !== ".." &&
    !pathRelativeToParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathRelativeToParent)
  );
}

async function ownedRoots() {
  const systemTemp = await realpath(tmpdir());
  return new Set(
    (await readdir(systemTemp, { withFileTypes: true }))
      .filter(
        (entry) => entry.isDirectory() && ROOT_NAME_PATTERN.test(entry.name),
      )
      .map((entry) => entry.name),
  );
}

async function findSingleNewOwnedRoot(beforeRoots) {
  const afterRoots = await ownedRoots();
  const newRoots = [...afterRoots].filter((name) => !beforeRoots.has(name));
  assert.equal(newRoots.length, 1);
  return join(await realpath(tmpdir()), newRoots[0]);
}

function assertSameSet(actual, expected) {
  assert.deepEqual([...actual].sort(), [...expected].sort());
}

async function expectMaterializerError(operation, code, finding) {
  let capturedError;
  await assert.rejects(operation, (error) => {
    capturedError = error;
    assert.ok(
      error instanceof
        Current180Current190DisposablePostgresqlMaterializerError,
    );
    assert.equal(error.code, code);
    if (finding !== undefined) {
      assert.ok(error.findings.includes(finding), error.findings.join(", "));
    }
    return true;
  });
  return capturedError;
}

async function assertPathAbsent(path) {
  await assert.rejects(lstat(path), (error) => error?.code === "ENOENT");
}

async function overwriteInPlace(path, bytes) {
  const handle = await open(path, "r+");
  try {
    await handle.truncate(0);
    await handle.write(bytes, 0, bytes.length, 0);
    await handle.truncate(bytes.length);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

before(async () => {
  const plan = await inspectCurrent180Current190DisposableReleaseAssembly();
  assert.equal(plan.status, "FROZEN_IN_MEMORY_ASSEMBLY_PLANNED");
  artifact = await assembleCurrent180Current190InMemoryArtifact({
    allowContract: CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
    assemblyPlanDigest: plan.assemblyPlanDigest,
  });
  coordinatorRunBinding =
    await issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
      coordinatorAuthority,
      {
        authorizationReceiptDigest: "a".repeat(64),
        runToken: "b".repeat(32),
      },
    );
  initialOwnedRoots = await ownedRoots();
});

after(async () => {
  assertSameSet(await ownedRoots(), initialOwnedRoots);
});

test("source is a bounded filesystem-only library with no automatic execution", async () => {
  const source = await readFile(MATERIALIZER_PATH, "utf8");
  const forbiddenRepositoryTempToken = [".", "tmp"].join("");
  assert.equal(source.includes(forbiddenRepositoryTempToken), false);
  assert.doesNotMatch(
    source,
    /node:child_process|@prisma|PrismaClient|from\s+["']pg["']|node:http|node:https|nodemailer|fetch\s*\(/u,
  );
  assert.doesNotMatch(source, /\brm\s*\(|recursive:\s*true/u);
  assert.match(source, /mkdtemp\(/u);
  assert.match(source, /open\(filePath,\s*"wx"/u);
  assert.match(source, /handle\.sync\(\)/u);
  assert.match(
    source,
    /for \(const directory of \[\.\.\.createdDirectories\]\.reverse\(\)\)[\s\S]*?syncDirectory\(directory\.path\)/u,
  );
  assert.doesNotMatch(source, /^await\s+materialize/mu);
});

test("materializes all exact entries only under system temp and cleans with zero residue", async () => {
  const beforeRoots = await ownedRoots();
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifact(artifact);
  try {
    const systemTemp = resolve(await realpath(tmpdir()));
    assert.ok(isStrictDescendant(receipt.artifactRootPath, systemTemp));
    assert.equal(
      isStrictDescendant(receipt.artifactRootPath, REPOSITORY_ROOT),
      false,
    );
    assert.equal(receipt.entryCount, 192);
    assert.equal(receipt.authorization.canApplyDatabase, false);
    assert.equal(receipt.authorization.canConnectDatabase, false);
    assert.equal(receipt.authorization.canSpawnProcess, false);
    assert.equal(receipt.effects.filesystemMaterializationPerformed, true);
    assert.equal(receipt.effects.databaseConnectionOpened, false);
    assert.equal(Object.isFrozen(receipt), true);

    for (const entry of artifact.entries) {
      const bytes = await readFile(
        resolve(receipt.artifactRootPath, ...entry.path.split("/")),
      );
      assert.equal(bytes.length, entry.byteLength);
      assert.equal(sha256(bytes), entry.sha256);
      assert.equal(bytes.toString("utf8"), entry.content);
    }
  } finally {
    const cleanup =
      await cleanupCurrent180Current190DisposablePostgresqlArtifact(receipt);
    assert.equal(cleanup.artifactRootAbsent, true);
    assert.equal(cleanup.effects.recursiveRemovalUsed, false);
  }
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("accepts a non-link Windows short-name temp alias and materializes under its canonical directory", async (t) => {
  const lexicalSystemTemp = resolve(tmpdir());
  if (
    process.platform !== "win32" ||
    !lexicalSystemTemp.split(sep).some((component) => component.includes("~"))
  ) {
    t.skip("the host system temp path is not a Windows short-name alias");
    return;
  }

  const canonicalSystemTemp = resolve(await realpath(lexicalSystemTemp));
  const lexicalStat = await lstat(lexicalSystemTemp, { bigint: true });
  const canonicalStat = await lstat(canonicalSystemTemp, { bigint: true });
  assert.equal(lexicalStat.isSymbolicLink(), false);
  assert.equal(canonicalStat.isSymbolicLink(), false);
  assert.deepEqual(
    { dev: String(lexicalStat.dev), ino: String(lexicalStat.ino) },
    { dev: String(canonicalStat.dev), ino: String(canonicalStat.ino) },
  );

  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifact(artifact);
  try {
    assert.equal(
      resolve(dirname(receipt.artifactRootPath)).toLowerCase(),
      canonicalSystemTemp.toLowerCase(),
    );
  } finally {
    await cleanupCurrent180Current190DisposablePostgresqlArtifact(receipt);
  }
});

test("fault after atomic root creation is cleaned without residue", async () => {
  const beforeRoots = await ownedRoots();
  await expectMaterializerError(
    materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
      {
        faultInjector(event) {
          if (event === "after-root-create") {
            throw new Error("injected root failure");
          }
        },
      },
    ),
    "DISPOSABLE_MATERIALIZER_FILESYSTEM_OPERATION_FAILED",
    "OWNED_ROOT_MATERIALIZATION_FAILED_WITH_ZERO_RESIDUE",
  );
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("fault after a partial entry set is cleaned explicitly without residue", async () => {
  const beforeRoots = await ownedRoots();
  let verifiedFiles = 0;
  await expectMaterializerError(
    materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
      {
        faultInjector(event) {
          if (event.startsWith("after-file:")) {
            verifiedFiles += 1;
          }
          if (verifiedFiles === 17) {
            throw new Error("injected partial write failure");
          }
        },
      },
    ),
    "DISPOSABLE_MATERIALIZER_FILESYSTEM_OPERATION_FAILED",
    "OWNED_ROOT_MATERIALIZATION_FAILED_WITH_ZERO_RESIDUE",
  );
  assert.equal(verifiedFiles, 17);
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("final whole-tree verification quarantines an injected extra before issuing a receipt", async () => {
  const beforeRoots = await ownedRoots();
  let extraPath;
  let materializationError;
  try {
    await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
      {
        async faultInjector(event) {
          if (event === "before-final-whole-tree-verification") {
            const rootPath = await findSingleNewOwnedRoot(beforeRoots);
            extraPath = join(rootPath, "injected-extra");
            const handle = await open(extraPath, "wx", 0o600);
            await handle.writeFile("untrusted\n", "utf8");
            await handle.close();
          }
        },
      },
    );
    assert.fail("materialization must reject an injected extra");
  } catch (error) {
    materializationError = error;
  }
  assert.ok(
    materializationError instanceof
      Current180Current190DisposablePostgresqlMaterializerError,
  );
  assert.equal(
    materializationError.code,
    "DISPOSABLE_MATERIALIZER_FAILURE_CLEANUP_INCOMPLETE",
  );
  const manualReceipt =
    assertCurrent180Current190DisposablePostgresqlManualInspectionReceipt(
      materializationError.manualInspectionReceipt,
    );
  assert.equal(
    manualReceipt.status,
    "PARTIAL_OWNED_ROOT_QUARANTINED_MANUAL_INSPECTION_REQUIRED",
  );
  assert.equal((await lstat(extraPath)).isFile(), true);
  assert.equal(
    (
      await lstat(join(manualReceipt.artifactRootPath, "schema.prisma"))
    ).isFile(),
    true,
  );
  await unlink(extraPath);
  const recovery =
    await cleanupCurrent180Current190DisposablePostgresqlArtifactAfterManualInspection(
      manualReceipt,
    );
  assert.equal(recovery.artifactRootAbsent, true);
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("failure cleanup refuses a swapped parent junction and never unlinks outside it", async () => {
  const beforeRoots = await ownedRoots();
  const externalRoot = await mkdtemp(
    join(await realpath(tmpdir()), "leetplus-external-sentinel-"),
  );
  const sentinelPath = join(externalRoot, "sentinel");
  const sentinelHandle = await open(sentinelPath, "wx", 0o600);
  await sentinelHandle.writeFile("must-survive\n", "utf8");
  await sentinelHandle.close();
  let heldMigrationsPath;
  let migrationsPath;
  let manualReceipt;
  try {
    let materializationError;
    try {
      await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
        artifact,
        {
          async faultInjector(event) {
            if (event === "before-final-whole-tree-verification") {
              const rootPath = await findSingleNewOwnedRoot(beforeRoots);
              migrationsPath = join(rootPath, "migrations");
              heldMigrationsPath = join(rootPath, "migrations-held");
              await rename(migrationsPath, heldMigrationsPath);
              await symlink(externalRoot, migrationsPath, "junction");
            }
          },
        },
      );
      assert.fail("materialization must reject a swapped parent junction");
    } catch (error) {
      materializationError = error;
    }
    assert.ok(
      materializationError instanceof
        Current180Current190DisposablePostgresqlMaterializerError,
    );
    assert.equal(
      materializationError.code,
      "DISPOSABLE_MATERIALIZER_FAILURE_CLEANUP_INCOMPLETE",
    );
    manualReceipt =
      assertCurrent180Current190DisposablePostgresqlManualInspectionReceipt(
        materializationError.manualInspectionReceipt,
      );
    assert.equal(await readFile(sentinelPath, "utf8"), "must-survive\n");
    assert.equal((await lstat(migrationsPath)).isSymbolicLink(), true);

    await rmdir(migrationsPath);
    await rename(heldMigrationsPath, migrationsPath);
    heldMigrationsPath = undefined;
    const recovery =
      await cleanupCurrent180Current190DisposablePostgresqlArtifactAfterManualInspection(
        manualReceipt,
      );
    assert.equal(recovery.artifactRootAbsent, true);
    manualReceipt = undefined;
  } finally {
    if (heldMigrationsPath !== undefined) {
      await rmdir(migrationsPath).catch(() => undefined);
      await rename(heldMigrationsPath, migrationsPath).catch(() => undefined);
    }
    if (manualReceipt !== undefined) {
      await cleanupCurrent180Current190DisposablePostgresqlArtifactAfterManualInspection(
        manualReceipt,
      ).catch(() => undefined);
    }
    await unlink(sentinelPath).catch(() => undefined);
    await rmdir(externalRoot).catch(() => undefined);
  }
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("rejects content and pinned envelope drift before creating a root", async () => {
  const beforeRoots = await ownedRoots();
  const drifted = structuredClone(artifact);
  drifted.entries[0].content += "\n";
  await expectMaterializerError(
    materializeCurrent180Current190DisposablePostgresqlArtifact(drifted),
    "DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID",
    "ARTIFACT_ENTRY_CONTENT_DIGEST_MISMATCH",
  );
  const envelopeDrift = structuredClone(artifact);
  envelopeDrift.authorization.canApplyDatabase = true;
  await expectMaterializerError(
    materializeCurrent180Current190DisposablePostgresqlArtifact(envelopeDrift),
    "DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID",
    "ARTIFACT_AUTHORITY_BOUNDARY_MISMATCH",
  );
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("rejects traversal, absolute, drive, backslash and duplicate paths", async () => {
  const beforeRoots = await ownedRoots();
  const attacks = [
    "../escape",
    "/absolute/schema.prisma",
    "C:/escape/schema.prisma",
    "migrations\\escape\\migration.sql",
    "migrations/./escape/migration.sql",
  ];
  for (const attack of attacks) {
    const candidate = structuredClone(artifact);
    candidate.entries[0].path = attack;
    await expectMaterializerError(
      materializeCurrent180Current190DisposablePostgresqlArtifact(candidate),
      "DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID",
      "ARTIFACT_ENTRY_SHAPE_INVALID",
    );
  }
  const duplicate = structuredClone(artifact);
  duplicate.entries[1].path = duplicate.entries[0].path.toUpperCase();
  await expectMaterializerError(
    materializeCurrent180Current190DisposablePostgresqlArtifact(duplicate),
    "DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID",
    "ARTIFACT_ENTRY_PATH_DUPLICATE",
  );
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("rejects caller output arguments, proxies and accessors without invoking them", async () => {
  const beforeRoots = await ownedRoots();
  await expectMaterializerError(
    materializeCurrent180Current190DisposablePostgresqlArtifact(artifact, {
      outputRoot: REPOSITORY_ROOT,
    }),
    "DISPOSABLE_MATERIALIZER_ARGUMENTS_INVALID",
    "EXACT_ARTIFACT_SIGNING_VERIFICATION_AND_RUN_BINDING_REQUIRED",
  );

  let proxyTrapInvoked = false;
  const proxyArtifact = new Proxy(artifact, {
    getOwnPropertyDescriptor() {
      proxyTrapInvoked = true;
      throw new Error("must not execute");
    },
    ownKeys() {
      proxyTrapInvoked = true;
      throw new Error("must not execute");
    },
  });
  await expectMaterializerError(
    materializeCurrent180Current190DisposablePostgresqlArtifact(proxyArtifact),
    "DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID",
    "ARTIFACT_DATA_ONLY_SNAPSHOT_REJECTED",
  );
  assert.equal(proxyTrapInvoked, false);

  let getterInvoked = false;
  const accessorArtifact = structuredClone(artifact);
  Object.defineProperty(accessorArtifact.entries[0], "content", {
    enumerable: true,
    get() {
      getterInvoked = true;
      throw new Error("must not execute");
    },
  });
  await expectMaterializerError(
    materializeCurrent180Current190DisposablePostgresqlArtifact(
      accessorArtifact,
    ),
    "DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID",
    "ARTIFACT_ACCESSOR_OR_SYMBOL_REJECTED",
  );
  assert.equal(getterInvoked, false);
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("cleanup requires the exact module-branded receipt and never invokes proxy traps", async () => {
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifact(artifact);
  try {
    await expectMaterializerError(
      cleanupCurrent180Current190DisposablePostgresqlArtifact(
        structuredClone(receipt),
      ),
      "DISPOSABLE_MATERIALIZER_CLEANUP_ARGUMENTS_INVALID",
      "MODULE_BRANDED_RECEIPT_REQUIRED",
    );
    let proxyTrapInvoked = false;
    const proxyReceipt = new Proxy(receipt, {
      get() {
        proxyTrapInvoked = true;
        throw new Error("must not execute");
      },
    });
    await expectMaterializerError(
      cleanupCurrent180Current190DisposablePostgresqlArtifact(proxyReceipt),
      "DISPOSABLE_MATERIALIZER_CLEANUP_ARGUMENTS_INVALID",
      "MODULE_BRANDED_RECEIPT_REQUIRED",
    );
    assert.equal(proxyTrapInvoked, false);
  } finally {
    await cleanupCurrent180Current190DisposablePostgresqlArtifact(receipt);
  }
});

test("runner consumption requires the latest fresh module-branded whole-tree verification", async () => {
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifact(artifact);
  let latestVerification;
  try {
    const firstVerification =
      await verifyCurrent180Current190DisposablePostgresqlArtifactForRunner(
        receipt,
      );
    assert.equal(
      firstVerification.status,
      "FRESH_WHOLE_TREE_VERIFIED_FOR_DISPOSABLE_RUNNER_NOT_PROCESS_AUTHORITY",
    );
    assert.equal(
      firstVerification.authorization.canBeConsumedByDisposablePostgresqlRunner,
      true,
    );
    assert.equal(firstVerification.authorization.canSpawnProcess, false);
    assert.equal(firstVerification.effects.toctouEliminationClaimed, false);
    const schemaStat = await lstat(firstVerification.schemaPath, {
      bigint: true,
    });
    assert.deepEqual(firstVerification.schemaIdentity, {
      dev: String(schemaStat.dev),
      ino: String(schemaStat.ino),
    });
    assert.deepEqual(Object.keys(firstVerification.schemaIdentity).sort(), [
      "dev",
      "ino",
    ]);
    assert.equal(
      Object.getPrototypeOf(firstVerification.schemaIdentity),
      Object.prototype,
    );
    assert.equal(Object.isFrozen(firstVerification.schemaIdentity), true);
    assert.equal(
      assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceipt(
        firstVerification,
      ),
      firstVerification,
    );
    await expectMaterializerError(
      Promise.resolve().then(() =>
        assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceipt(
          structuredClone(firstVerification),
        ),
      ),
      "DISPOSABLE_MATERIALIZER_RUNNER_RECEIPT_INVALID",
      "MODULE_BRANDED_RUNNER_VERIFICATION_RECEIPT_REQUIRED",
    );

    latestVerification =
      await verifyCurrent180Current190DisposablePostgresqlArtifactForRunner(
        receipt,
      );
    await expectMaterializerError(
      Promise.resolve().then(() =>
        assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceipt(
          firstVerification,
        ),
      ),
      "DISPOSABLE_MATERIALIZER_RUNNER_RECEIPT_INVALID",
      "RUNNER_VERIFICATION_RECEIPT_SUPERSEDED",
    );
    assert.equal(
      assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceipt(
        latestVerification,
      ),
      latestVerification,
    );
  } finally {
    await cleanupCurrent180Current190DisposablePostgresqlArtifact(receipt);
  }
  await expectMaterializerError(
    Promise.resolve().then(() =>
      assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceipt(
        latestVerification,
      ),
    ),
    "DISPOSABLE_MATERIALIZER_RUNNER_RECEIPT_INVALID",
    "RUNNER_VERIFICATION_RECEIPT_CLEANED",
  );
});

test("runner verification rejects a byte-identical schema file identity replacement", async () => {
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifact(artifact);
  const externalRoot = await mkdtemp(
    join(await realpath(tmpdir()), "leetplus-schema-identity-"),
  );
  const heldSchemaPath = join(externalRoot, "schema.prisma");
  const schemaBytes = await readFile(receipt.schemaPath);
  let heldOriginal = false;
  let replacementPresent = false;
  try {
    await rename(receipt.schemaPath, heldSchemaPath);
    heldOriginal = true;
    const replacementHandle = await open(receipt.schemaPath, "wx", 0o600);
    try {
      await replacementHandle.writeFile(schemaBytes);
      await replacementHandle.sync();
    } finally {
      await replacementHandle.close();
    }
    replacementPresent = true;
    assert.equal(
      (await readFile(receipt.schemaPath)).equals(schemaBytes),
      true,
    );
    await expectMaterializerError(
      verifyCurrent180Current190DisposablePostgresqlArtifactForRunner(receipt),
      "DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID",
      "MATERIALIZED_ENTRY_PROVENANCE_DRIFT",
    );
    await unlink(receipt.schemaPath);
    replacementPresent = false;
    await rename(heldSchemaPath, receipt.schemaPath);
    heldOriginal = false;
  } finally {
    if (replacementPresent) {
      await unlink(receipt.schemaPath).catch(() => undefined);
    }
    if (heldOriginal) {
      await rename(heldSchemaPath, receipt.schemaPath).catch(() => undefined);
    }
    await cleanupCurrent180Current190DisposablePostgresqlArtifact(receipt);
    await rmdir(externalRoot).catch(() => undefined);
  }
});

test("cleanup rejects byte drift, then succeeds after exact in-place repair", async () => {
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifact(artifact);
  const targetPath = receipt.schemaPath;
  const originalBytes = await readFile(targetPath);
  try {
    await overwriteInPlace(targetPath, Buffer.from("drift\n", "utf8"));
    await expectMaterializerError(
      cleanupCurrent180Current190DisposablePostgresqlArtifact(receipt),
      "DISPOSABLE_MATERIALIZER_CLEANUP_DENIED",
      "MATERIALIZED_ENTRY_BYTES_DRIFT",
    );
    assert.equal((await lstat(receipt.artifactRootPath)).isDirectory(), true);
    await overwriteInPlace(targetPath, originalBytes);
  } finally {
    await cleanupCurrent180Current190DisposablePostgresqlArtifact(receipt);
  }
});

test("cleanup rejects extras and symlinks before removing any owned entry", async (t) => {
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifact(artifact);
  const extraPath = join(receipt.artifactRootPath, "unexpected-entry");
  let extraCreated = false;
  let extraIsDirectoryLink = false;
  try {
    try {
      await symlink(receipt.schemaPath, extraPath, "file");
      extraCreated = true;
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) {
        try {
          await symlink(
            join(receipt.artifactRootPath, "migrations"),
            extraPath,
            "junction",
          );
          extraCreated = true;
          extraIsDirectoryLink = true;
        } catch (junctionError) {
          if (!["EPERM", "EACCES", "ENOSYS"].includes(junctionError?.code)) {
            throw junctionError;
          }
          t.diagnostic(
            `symlink and junction creation unavailable: ${junctionError.code}`,
          );
          const handle = await open(extraPath, "wx", 0o600);
          await handle.close();
          extraCreated = true;
        }
      } else {
        throw error;
      }
    }
    await expectMaterializerError(
      cleanupCurrent180Current190DisposablePostgresqlArtifact(receipt),
      "DISPOSABLE_MATERIALIZER_CLEANUP_DENIED",
      "OWNED_ROOT_FILE_SET_OR_TYPE_DRIFT",
    );
    assert.equal((await readFile(receipt.schemaPath, "utf8")).length > 0, true);
    if (extraIsDirectoryLink) {
      assert.equal((await lstat(extraPath)).isSymbolicLink(), true);
      await rmdir(extraPath);
    } else {
      await unlink(extraPath);
    }
    extraCreated = false;
  } finally {
    if (extraCreated) {
      const remover = extraIsDirectoryLink ? rmdir : unlink;
      await remover(extraPath).catch(() => undefined);
    }
    await cleanupCurrent180Current190DisposablePostgresqlArtifact(receipt);
  }
});

test("cleanup rechecks the full parent chain immediately before unlink", async () => {
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
    );
  const externalRoot = await mkdtemp(
    join(await realpath(tmpdir()), "leetplus-cleanup-sentinel-"),
  );
  const sentinelPath = join(externalRoot, "sentinel");
  const sentinelHandle = await open(sentinelPath, "wx", 0o600);
  await sentinelHandle.writeFile("must-survive-cleanup\n", "utf8");
  await sentinelHandle.close();
  const migrationsPath = join(receipt.artifactRootPath, "migrations");
  const heldMigrationsPath = join(receipt.artifactRootPath, "migrations-held");
  let swapped = false;
  let cleaned = false;
  try {
    await expectMaterializerError(
      cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
        receipt,
        {
          async faultInjector(event) {
            if (event === "after-cleanup-verification") {
              await rename(migrationsPath, heldMigrationsPath);
              await symlink(externalRoot, migrationsPath, "junction");
              swapped = true;
            }
          },
        },
      ),
      "DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID",
      "MATERIALIZED_ENTRY_PARENT_CHAIN_PRE_UNLINK_DRIFT",
    );
    assert.equal(
      await readFile(sentinelPath, "utf8"),
      "must-survive-cleanup\n",
    );
    assert.equal((await lstat(receipt.schemaPath)).isFile(), true);
    await rmdir(migrationsPath);
    await rename(heldMigrationsPath, migrationsPath);
    swapped = false;
    await cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      receipt,
    );
    cleaned = true;
  } finally {
    if (swapped) {
      await rmdir(migrationsPath).catch(() => undefined);
      await rename(heldMigrationsPath, migrationsPath).catch(() => undefined);
    }
    if (!cleaned) {
      await cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
        receipt,
      ).catch(() => undefined);
    }
    await unlink(sentinelPath).catch(() => undefined);
    await rmdir(externalRoot).catch(() => undefined);
  }
});

test("test-only cleanup fault before deletion leaves a fully retryable root", async () => {
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
    );
  try {
    await assert.rejects(
      cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
        receipt,
        {
          faultInjector(event) {
            if (event === "after-cleanup-verification") {
              throw new Error("injected cleanup pause");
            }
          },
        },
      ),
      /injected cleanup pause/u,
    );
    assert.equal((await lstat(receipt.schemaPath)).isFile(), true);
  } finally {
    await cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      receipt,
    );
  }
});

test("cleanup quarantines after a completed file unlink and resumes from the exact remaining set", async () => {
  const beforeRoots = await ownedRoots();
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
    );
  let manualReceipt;
  let removedArtifactPath;
  let recovered = false;
  try {
    const cleanupError = await expectMaterializerError(
      cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
        receipt,
        {
          faultInjector(event) {
            if (event.startsWith("after-cleanup-artifact-unlink:")) {
              removedArtifactPath = event.slice(
                "after-cleanup-artifact-unlink:".length,
              );
              throw new Error("injected response loss after file unlink");
            }
          },
        },
      ),
      "DISPOSABLE_MATERIALIZER_PARTIAL_CLEANUP_QUARANTINED",
      "PARTIAL_CLEANUP_REQUIRES_MANUAL_INSPECTION",
    );
    manualReceipt =
      assertCurrent180Current190DisposablePostgresqlManualInspectionReceipt(
        cleanupError.manualInspectionReceipt,
      );
    assert.equal(typeof removedArtifactPath, "string");
    await assertPathAbsent(
      resolve(receipt.artifactRootPath, ...removedArtifactPath.split("/")),
    );

    const retryError = await expectMaterializerError(
      cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
        receipt,
      ),
      "DISPOSABLE_MATERIALIZER_CLEANUP_QUARANTINED",
      "PARTIAL_CLEANUP_REQUIRES_MANUAL_INSPECTION_RECEIPT",
    );
    assert.equal(retryError.manualInspectionReceipt, manualReceipt);

    const recovery =
      await cleanupCurrent180Current190DisposablePostgresqlArtifactAfterManualInspection(
        manualReceipt,
      );
    recovered = true;
    assert.equal(recovery.artifactRootAbsent, true);
    await assertPathAbsent(receipt.artifactRootPath);
  } finally {
    if (!recovered && manualReceipt !== undefined) {
      await cleanupCurrent180Current190DisposablePostgresqlArtifactAfterManualInspection(
        manualReceipt,
      ).catch(() => undefined);
    }
  }
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("cleanup quarantines after a completed directory removal and resumes without recreating it", async () => {
  const beforeRoots = await ownedRoots();
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
    );
  let manualReceipt;
  let removedDirectoryPath;
  let recovered = false;
  try {
    const cleanupError = await expectMaterializerError(
      cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
        receipt,
        {
          faultInjector(event) {
            if (event.startsWith("after-cleanup-directory-remove:")) {
              removedDirectoryPath = event.slice(
                "after-cleanup-directory-remove:".length,
              );
              throw new Error("injected response loss after directory removal");
            }
          },
        },
      ),
      "DISPOSABLE_MATERIALIZER_PARTIAL_CLEANUP_QUARANTINED",
      "PARTIAL_CLEANUP_REQUIRES_MANUAL_INSPECTION",
    );
    manualReceipt =
      assertCurrent180Current190DisposablePostgresqlManualInspectionReceipt(
        cleanupError.manualInspectionReceipt,
      );
    assert.equal(typeof removedDirectoryPath, "string");
    await assertPathAbsent(
      resolve(receipt.artifactRootPath, ...removedDirectoryPath.split("/")),
    );

    const recovery =
      await cleanupCurrent180Current190DisposablePostgresqlArtifactAfterManualInspection(
        manualReceipt,
      );
    recovered = true;
    assert.equal(recovery.artifactRootAbsent, true);
    await assertPathAbsent(receipt.artifactRootPath);
  } finally {
    if (!recovered && manualReceipt !== undefined) {
      await cleanupCurrent180Current190DisposablePostgresqlArtifactAfterManualInspection(
        manualReceipt,
      ).catch(() => undefined);
    }
  }
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("manual recovery is fail-closed on an adversarial extra and remains retryable after inspection", async () => {
  const beforeRoots = await ownedRoots();
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
    );
  let manualReceipt;
  let extraPath;
  let recovered = false;
  try {
    const cleanupError = await expectMaterializerError(
      cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
        receipt,
        {
          faultInjector(event) {
            if (event.startsWith("after-cleanup-artifact-unlink:")) {
              throw new Error("injected response loss before recovery retry");
            }
          },
        },
      ),
      "DISPOSABLE_MATERIALIZER_PARTIAL_CLEANUP_QUARANTINED",
      "PARTIAL_CLEANUP_REQUIRES_MANUAL_INSPECTION",
    );
    manualReceipt =
      assertCurrent180Current190DisposablePostgresqlManualInspectionReceipt(
        cleanupError.manualInspectionReceipt,
      );
    extraPath = join(receipt.artifactRootPath, "unexpected-recovery-entry");
    const extraHandle = await open(extraPath, "wx", 0o600);
    await extraHandle.close();

    await expectMaterializerError(
      cleanupCurrent180Current190DisposablePostgresqlArtifactAfterManualInspection(
        manualReceipt,
      ),
      "DISPOSABLE_MATERIALIZER_MANUAL_RECOVERY_DENIED",
      "OWNED_ROOT_STILL_REQUIRES_MANUAL_INSPECTION",
    );
    assert.equal((await lstat(extraPath)).isFile(), true);
    assert.equal((await lstat(receipt.schemaPath)).isFile(), true);

    await unlink(extraPath);
    extraPath = undefined;
    const recovery =
      await cleanupCurrent180Current190DisposablePostgresqlArtifactAfterManualInspection(
        manualReceipt,
      );
    recovered = true;
    assert.equal(recovery.artifactRootAbsent, true);
  } finally {
    if (extraPath !== undefined) {
      await unlink(extraPath).catch(() => undefined);
    }
    if (!recovered && manualReceipt !== undefined) {
      await cleanupCurrent180Current190DisposablePostgresqlArtifactAfterManualInspection(
        manualReceipt,
      ).catch(() => undefined);
    }
  }
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("coordinator-signed locator rehydrates after process-state loss and cleans only the exact tree", async () => {
  const beforeRoots = await ownedRoots();
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifact(artifact);
  const locator = structuredClone(receipt.recoveryLocator);
  const attackerAuthority =
    createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly();
  await expectMaterializerError(
    rehydrateCurrent180Current190DisposablePostgresqlMaterializationRecoveryForTestOnly(
      attackerAuthority,
      locator,
      artifact,
    ),
    "DISPOSABLE_MATERIALIZER_RECOVERY_COORDINATOR_TRUST_INVALID",
    "COORDINATOR_SIGNED_MATERIALIZER_RECOVERY_ANCHOR_REQUIRED",
  );
  const recovery =
    await rehydrateCurrent180Current190DisposablePostgresqlMaterializationRecoveryForTestOnly(
      coordinatorAuthority,
      locator,
      artifact,
    );
  assert.equal(recovery.authorizationReceiptDigest, "a".repeat(64));
  assert.equal(recovery.runToken, "b".repeat(32));
  assert.equal(recovery.artifactRootAbsent, false);
  const cleanup =
    await cleanupCurrent180Current190DisposablePostgresqlArtifactAfterRestartForTestOnly(
      recovery,
    );
  assert.equal(cleanup.artifactRootAbsent, true);
  assert.equal(cleanup.recoveredLostResponse, false);
  await assertPathAbsent(receipt.artifactRootPath);
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("restart rehydration accepts only a monotonic signed partial cleanup and resumes it", async () => {
  const beforeRoots = await ownedRoots();
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
    );
  const locator = structuredClone(receipt.recoveryLocator);
  let faultInjected = false;
  await expectMaterializerError(
    cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      receipt,
      {
        faultInjector: async (event) => {
          if (
            !faultInjected &&
            event.startsWith("after-cleanup-artifact-unlink:")
          ) {
            faultInjected = true;
            throw new Error("simulated process loss after unlink");
          }
        },
      },
    ),
    "DISPOSABLE_MATERIALIZER_PARTIAL_CLEANUP_QUARANTINED",
    "PARTIAL_CLEANUP_REQUIRES_MANUAL_INSPECTION",
  );
  assert.equal(faultInjected, true);
  const recovery =
    await rehydrateCurrent180Current190DisposablePostgresqlMaterializationRecoveryForTestOnly(
      coordinatorAuthority,
      locator,
      artifact,
    );
  assert.equal(recovery.remainingArtifactEntryCount, 191);
  const cleanup =
    await cleanupCurrent180Current190DisposablePostgresqlArtifactAfterRestartForTestOnly(
      recovery,
    );
  assert.equal(cleanup.artifactRootAbsent, true);
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("restart cleanup reconciles a lost unlink response and rejects an unsigned extra before mutation", async () => {
  const beforeRoots = await ownedRoots();
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifact(artifact);
  const locator = structuredClone(receipt.recoveryLocator);
  const extraPath = join(receipt.artifactRootPath, "unsigned-extra.txt");
  const extraHandle = await open(extraPath, "wx", 0o600);
  try {
    await extraHandle.writeFile("foreign\n", "utf8");
    await extraHandle.sync();
  } finally {
    await extraHandle.close();
  }
  await expectMaterializerError(
    rehydrateCurrent180Current190DisposablePostgresqlMaterializationRecoveryForTestOnly(
      coordinatorAuthority,
      locator,
      artifact,
    ),
    "DISPOSABLE_MATERIALIZER_RECOVERY_DENIED",
    "RECOVERY_TREE_EXTRA_OR_TYPE_DRIFT",
  );
  await unlink(extraPath);
  const recovery =
    await rehydrateCurrent180Current190DisposablePostgresqlMaterializationRecoveryForTestOnly(
      coordinatorAuthority,
      locator,
      artifact,
    );
  let faultInjected = false;
  const cleanup =
    await cleanupCurrent180Current190DisposablePostgresqlArtifactAfterRestartForTestOnly(
      recovery,
      {
        faultInjector: async (event) => {
          if (
            !faultInjected &&
            event.startsWith("after-restart-artifact-unlink:")
          ) {
            faultInjected = true;
            throw new Error("simulated lost unlink response");
          }
        },
      },
    );
  assert.equal(faultInjected, true);
  assert.equal(cleanup.recoveredLostResponse, true);
  assert.equal(cleanup.artifactRootAbsent, true);
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("cleanup treats a lost response after root removal as recovered success", async () => {
  const beforeRoots = await ownedRoots();
  const receipt =
    await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      artifact,
    );
  const cleanup =
    await cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      receipt,
      {
        faultInjector(event) {
          if (event === "after-cleanup-root-remove") {
            throw new Error("injected response loss after root removal");
          }
        },
      },
    );
  assert.equal(cleanup.artifactRootAbsent, true);
  assert.equal(cleanup.recoveredAfterRootRemovalError, true);
  await assertPathAbsent(receipt.artifactRootPath);
  assertSameSet(await ownedRoots(), beforeRoots);
});
