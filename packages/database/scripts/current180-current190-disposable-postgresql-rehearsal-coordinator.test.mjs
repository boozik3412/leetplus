import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, open, realpath, rmdir, unlink } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  Current180Current190PostgresqlRehearsalCoordinatorError,
  assertCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding,
  assertCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly,
  createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly,
  issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding,
  issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly,
  loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority,
  loadCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthority,
  signCurrent180Current190PostgresqlRehearsalCoordinatorAnchor,
  signCurrent180Current190PostgresqlRehearsalCoordinatorAnchorForTestOnly,
  verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchor,
  verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchorForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-coordinator.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const WORKSPACE_ROOT = resolve(REPOSITORY_ROOT, "..");
const AUTHORIZATION_DIGEST = "a".repeat(64);
const RUN_TOKEN = "b".repeat(32);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeExclusive(path, bytes) {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function createKeyFixture(label, parentPath = WORKSPACE_ROOT) {
  const rootPath = join(
    parentPath,
    `lp-c180190-coordinator-test-${label}-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
  );
  const rootHandle = await open(rootPath, "wx", 0o600).catch(() => null);
  if (rootHandle !== null) {
    await rootHandle.close();
    await unlink(rootPath);
  }
  const { mkdir } = await import("node:fs/promises");
  await mkdir(rootPath, { mode: 0o700 });
  const privateKeyPath = join(rootPath, "coordinator-private.pk8");
  const publicKeyPath = join(rootPath, "coordinator-public.spki");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateBytes = Buffer.from(
    privateKey.export({ format: "der", type: "pkcs8" }),
  );
  const publicBytes = Buffer.from(
    publicKey.export({ format: "der", type: "spki" }),
  );
  await writeExclusive(privateKeyPath, privateBytes);
  await writeExclusive(publicKeyPath, publicBytes);
  return {
    expectedPublicKeySha256: sha256(publicBytes),
    privateKeyPath,
    publicKeyPath,
    rootPath,
  };
}

async function cleanupKeyFixture(fixture) {
  await unlink(fixture.privateKeyPath).catch(() => undefined);
  await unlink(fixture.publicKeyPath).catch(() => undefined);
  await rmdir(fixture.rootPath).catch(() => undefined);
}

async function overwriteInPlace(path, bytes) {
  const handle = await open(path, "r+");
  try {
    await handle.truncate(0);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function productionConfig(fixture) {
  return {
    expectedPublicKeySha256: fixture.expectedPublicKeySha256,
    privateKeyPath: fixture.privateKeyPath,
    publicKeyPath: fixture.publicKeyPath,
  };
}

function productionVerificationConfig(fixture) {
  return {
    expectedPublicKeySha256: fixture.expectedPublicKeySha256,
    publicKeyPath: fixture.publicKeyPath,
  };
}

function runInput() {
  return {
    authorizationReceiptDigest: AUTHORIZATION_DIGEST,
    runToken: RUN_TOKEN,
  };
}

function anchorInput() {
  return {
    payload: {
      authorizationReceiptDigest: AUTHORIZATION_DIGEST,
      fileIdentity: { dev: "1", ino: "2" },
      rootIdentity: { dev: "1", ino: "3" },
      runToken: RUN_TOKEN,
    },
    purpose: "JOURNAL_ROOT_ANCHOR",
  };
}

function expectCoordinatorError(error, code) {
  assert.ok(
    error instanceof Current180Current190PostgresqlRehearsalCoordinatorError,
  );
  assert.equal(error.code, code);
  return true;
}

test("file-backed coordinator reload verifies a previously signed durable anchor", async () => {
  const fixture = await createKeyFixture("reload");
  try {
    const first =
      await loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority(
        productionConfig(fixture),
      );
    const binding =
      await issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding(
        first,
        runInput(),
      );
    assert.equal(
      await assertCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding(
        first,
        binding,
      ),
      binding,
    );
    const anchor =
      await signCurrent180Current190PostgresqlRehearsalCoordinatorAnchor(
        first,
        binding,
        anchorInput(),
      );

    const reloaded =
      await loadCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthority(
        productionVerificationConfig(fixture),
      );
    assert.equal(
      Object.hasOwn(reloaded, "privateKeyPath"),
      false,
      "read-only verification authority must not expose or load a private key path",
    );
    const verification =
      await verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchor(
        reloaded,
        structuredClone(anchor),
        { purpose: "JOURNAL_ROOT_ANCHOR" },
      );
    assert.equal(verification.authorizationReceiptDigest, AUTHORIZATION_DIGEST);
    assert.equal(verification.runToken, RUN_TOKEN);
    assert.equal(
      verification.coordinatorFingerprintSha256,
      fixture.expectedPublicKeySha256,
    );
    assert.deepEqual(verification.payload, anchorInput().payload);
  } finally {
    await cleanupKeyFixture(fixture);
  }
});

test("an independently generated attacker coordinator cannot substitute anchor provenance", async () => {
  const trustedFixture = await createKeyFixture("trusted");
  const attackerFixture = await createKeyFixture("attacker");
  try {
    const trusted =
      await loadCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthority(
        productionVerificationConfig(trustedFixture),
      );
    const attacker =
      await loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority(
        productionConfig(attackerFixture),
      );
    const attackerBinding =
      await issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding(
        attacker,
        runInput(),
      );
    const forgedOrigin =
      await signCurrent180Current190PostgresqlRehearsalCoordinatorAnchor(
        attacker,
        attackerBinding,
        anchorInput(),
      );
    await assert.rejects(
      verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchor(
        trusted,
        forgedOrigin,
        { purpose: "JOURNAL_ROOT_ANCHOR" },
      ),
      (error) => expectCoordinatorError(error, "COORDINATOR_ANCHOR_INVALID"),
    );
  } finally {
    await cleanupKeyFixture(trustedFixture);
    await cleanupKeyFixture(attackerFixture);
  }
});

test("production and test-only authorities cannot cross their API boundary", async () => {
  const testAuthority =
    createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly();
  const testBinding =
    await issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
      testAuthority,
      runInput(),
    );
  assert.equal(
    await assertCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
      testAuthority,
      testBinding,
    ),
    testBinding,
  );
  const testAnchor =
    await signCurrent180Current190PostgresqlRehearsalCoordinatorAnchorForTestOnly(
      testAuthority,
      testBinding,
      anchorInput(),
    );
  assert.equal(
    (
      await verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchorForTestOnly(
        testAuthority,
        testAnchor,
        { purpose: "JOURNAL_ROOT_ANCHOR" },
      )
    ).runToken,
    RUN_TOKEN,
  );
  await assert.rejects(
    issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding(
      testAuthority,
      runInput(),
    ),
    (error) => expectCoordinatorError(error, "COORDINATOR_AUTHORITY_INVALID"),
  );
});

test("loader rejects mismatched pins, key pairs, repository paths and actual system temp paths", async () => {
  const first = await createKeyFixture("first");
  const second = await createKeyFixture("second");
  const tempFixture = await createKeyFixture(
    "system-temp",
    resolve(await realpath(tmpdir())),
  );
  try {
    await assert.rejects(
      loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority({
        ...productionConfig(first),
        expectedPublicKeySha256: "0".repeat(64),
      }),
      (error) => expectCoordinatorError(error, "COORDINATOR_KEY_FILE_INVALID"),
    );
    await assert.rejects(
      loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority({
        ...productionConfig(first),
        publicKeyPath: second.publicKeyPath,
      }),
      (error) => expectCoordinatorError(error, "COORDINATOR_KEY_FILE_INVALID"),
    );

    if (platform() !== "win32") {
      await chmod(first.privateKeyPath, 0o644);
      await assert.rejects(
        loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority(
          productionConfig(first),
        ),
        (error) =>
          expectCoordinatorError(error, "COORDINATOR_KEY_FILE_INVALID"),
      );
      await chmod(first.privateKeyPath, 0o600);
    }

    const repositoryPrivate = join(
      REPOSITORY_ROOT,
      ".coordinator-private-test.pk8",
    );
    const repositoryPublic = join(
      REPOSITORY_ROOT,
      ".coordinator-public-test.spki",
    );
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const publicBytes = Buffer.from(
      publicKey.export({ format: "der", type: "spki" }),
    );
    await writeExclusive(
      repositoryPrivate,
      Buffer.from(privateKey.export({ format: "der", type: "pkcs8" })),
    );
    await writeExclusive(repositoryPublic, publicBytes);
    try {
      await assert.rejects(
        loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority({
          expectedPublicKeySha256: sha256(publicBytes),
          privateKeyPath: repositoryPrivate,
          publicKeyPath: repositoryPublic,
        }),
        (error) =>
          expectCoordinatorError(error, "COORDINATOR_KEY_PATH_INVALID"),
      );
    } finally {
      await unlink(repositoryPrivate).catch(() => undefined);
      await unlink(repositoryPublic).catch(() => undefined);
    }

    await assert.rejects(
      loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority(
        productionConfig(tempFixture),
      ),
      (error) => expectCoordinatorError(error, "COORDINATOR_KEY_PATH_INVALID"),
    );
  } finally {
    await cleanupKeyFixture(first);
    await cleanupKeyFixture(second);
    await cleanupKeyFixture(tempFixture);
  }
});

test("loaded production authority fails closed when key bytes drift without an inode replacement", async () => {
  const fixture = await createKeyFixture("same-inode-drift");
  try {
    const authority =
      await loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority(
        productionConfig(fixture),
      );
    const replacement = generateKeyPairSync("ed25519");
    await overwriteInPlace(
      fixture.privateKeyPath,
      Buffer.from(
        replacement.privateKey.export({ format: "der", type: "pkcs8" }),
      ),
    );
    await assert.rejects(
      issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding(
        authority,
        runInput(),
      ),
      (error) => expectCoordinatorError(error, "COORDINATOR_AUTHORITY_STALE"),
    );
  } finally {
    await cleanupKeyFixture(fixture);
  }
});

test("proxy and accessor inputs are rejected without invoking caller code", async () => {
  let calls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "privateKeyPath", {
    enumerable: true,
    get() {
      calls += 1;
      return "C:\\never";
    },
  });
  await assert.rejects(
    loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority(accessor),
    (error) => expectCoordinatorError(error, "COORDINATOR_LOAD_INPUT_INVALID"),
  );
  assert.equal(calls, 0);

  const proxy = new Proxy(
    {},
    {
      get() {
        calls += 1;
        return undefined;
      },
    },
  );
  await assert.rejects(
    loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority(proxy),
    (error) => expectCoordinatorError(error, "COORDINATOR_LOAD_INPUT_INVALID"),
  );
  assert.equal(calls, 0);
});
