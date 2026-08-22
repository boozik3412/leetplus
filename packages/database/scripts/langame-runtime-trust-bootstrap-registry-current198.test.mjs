import assert from "node:assert/strict";
import { createHash, createPublicKey, generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_ALGORITHM,
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_PURPOSE,
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_TRUST_DOMAIN,
  langameRuntimeTrustBootstrapRegistryDigestCurrent198,
  parsePinnedLangameRuntimeTrustBootstrapRegistryCurrent198,
  projectActiveLangameRuntimeTrustBootstrapRootsCurrent198,
  validateLangameRuntimeTrustBootstrapRegistryCurrent198,
  validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198,
} from "./langame-runtime-trust-bootstrap-registry-current198-contract.mjs";
import {
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_CANONICAL_JSON,
  PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198,
  PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_VERIFICATION_ROOTS_CURRENT198,
} from "./langame-runtime-trust-bootstrap-registry-current198.mjs";
import {
  extractLangameRuntimeTrustBootstrapRegistryCurrent198FromSource,
  loadParentLangameRuntimeTrustBootstrapRegistryCurrent198,
} from "./langame-runtime-trust-bootstrap-registry-current198-transition.cli.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

function authority() {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ format: "pem", type: "spki" });
  const fingerprint = createHash("sha256")
    .update(
      createPublicKey(publicKeyPem).export({ format: "der", type: "spki" }),
    )
    .digest("hex");
  return { fingerprint, publicKeyPem };
}

function root(keyId, options = {}) {
  const key = options.key ?? authority();
  return {
    algorithm: LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_ALGORITHM,
    keyId,
    notAfter: "2027-08-14T00:00:00.000Z",
    notBefore: "2026-08-14T00:00:00.000Z",
    publicKeyFingerprint: key.fingerprint,
    publicKeyPem: key.publicKeyPem,
    purpose: LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_PURPOSE,
    retiredAt: null,
    revokedAt: null,
    status: "ACTIVE",
    supersedesKeyId: null,
    trustDomain:
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_TRUST_DOMAIN,
    ...options.overrides,
  };
}

function code(expected) {
  return (error) => error?.code === expected && error.safeContractError;
}

test("CURRENT198 ships one exact frozen empty data-only registry", () => {
  assert.equal(
    LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_CANONICAL_JSON,
    "{}",
  );
  assert.deepEqual(
    PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198,
    {},
  );
  assert.deepEqual(
    PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_VERIFICATION_ROOTS_CURRENT198,
    {},
  );
  assert.equal(
    Object.isFrozen(PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198),
    true,
  );
  assert.equal(
    Object.isFrozen(
      PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_VERIFICATION_ROOTS_CURRENT198,
    ),
    true,
  );
  assert.match(
    langameRuntimeTrustBootstrapRegistryDigestCurrent198({}),
    /^[a-f0-9]{64}$/u,
  );
});

test("CURRENT198 release registry exposes no ambient authority", async () => {
  const sources = await Promise.all(
    [
      "./langame-runtime-trust-bootstrap-registry-current198-contract.mjs",
      "./langame-runtime-trust-bootstrap-registry-current198.mjs",
    ].map((relativePath) =>
      readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8"),
    ),
  );
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /\b(?:PrismaClient|createPrivateKey|fetch|privateKey|readFile|sign|writeFile)\b|node:(?:fs|http|https|net|tls)|process\.env/u,
    );
  }
});

test("CURRENT198 accepts one initial active root and projects only verifier fields", () => {
  const initialRoot = root("langame-bootstrap-production-1");
  const registry = {
    [initialRoot.keyId]: initialRoot,
  };
  const canonical = canonicalStringify(registry);
  const parsed =
    parsePinnedLangameRuntimeTrustBootstrapRegistryCurrent198(canonical);
  validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198({}, parsed);
  const projected =
    projectActiveLangameRuntimeTrustBootstrapRootsCurrent198(parsed);
  assert.deepEqual(Object.keys(projected), [initialRoot.keyId]);
  assert.deepEqual(Object.keys(projected[initialRoot.keyId]).sort(), [
    "algorithm",
    "keyId",
    "notAfter",
    "notBefore",
    "publicKeyFingerprint",
    "publicKeyPem",
    "purpose",
    "status",
    "trustDomain",
  ]);
  assert.equal(Object.isFrozen(parsed[initialRoot.keyId]), true);
  assert.equal(Object.isFrozen(projected[initialRoot.keyId]), true);
});

test("CURRENT198 allows guarded rotation, emergency stop and recovery", () => {
  const first = root("langame-bootstrap-production-1");
  const initial = { [first.keyId]: first };
  const retiredFirst = {
    ...first,
    retiredAt: "2026-10-01T00:00:00.000Z",
    status: "RETIRED",
  };
  const second = root("langame-bootstrap-production-2", {
    overrides: {
      notBefore: "2026-10-01T00:00:00.000Z",
      supersedesKeyId: first.keyId,
    },
  });
  const rotated = {
    [first.keyId]: retiredFirst,
    [second.keyId]: second,
  };
  validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
    initial,
    rotated,
  );
  const revokedSecond = {
    ...second,
    revokedAt: "2026-11-01T00:00:00.000Z",
    status: "REVOKED",
  };
  const stopped = {
    [first.keyId]: retiredFirst,
    [second.keyId]: revokedSecond,
  };
  validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
    rotated,
    stopped,
  );
  assert.deepEqual(
    projectActiveLangameRuntimeTrustBootstrapRootsCurrent198(stopped),
    {},
  );
  const third = root("langame-bootstrap-production-3", {
    overrides: {
      notBefore: "2026-11-02T00:00:00.000Z",
      supersedesKeyId: second.keyId,
    },
  });
  validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(stopped, {
    ...stopped,
    [third.keyId]: third,
  });
});

test("CURRENT198 rejects noncanonical, malformed and widened registry sources", () => {
  for (const encoded of ["", "{ }", '{"x":1}\n', "[]", "null"]) {
    assert.throws(() =>
      parsePinnedLangameRuntimeTrustBootstrapRegistryCurrent198(encoded),
    );
  }
  const initialRoot = root("langame-bootstrap-production-1");
  for (const changed of [
    { ...initialRoot, algorithm: "RSA" },
    { ...initialRoot, purpose: "OTHER" },
    { ...initialRoot, publicKeyFingerprint: "0".repeat(64) },
    { ...initialRoot, retiredAt: "2026-09-01T00:00:00.000Z" },
    {
      ...initialRoot,
      retiredAt: "2026-09-01T00:00:00.000Z",
      revokedAt: "2026-10-01T00:00:00.000Z",
      status: "REVOKED",
    },
    { ...initialRoot, extra: true },
  ]) {
    assert.throws(() =>
      validateLangameRuntimeTrustBootstrapRegistryCurrent198({
        [initialRoot.keyId]: changed,
      }),
    );
  }
});

test("CURRENT198 rejects root history removal, rewrite and ambiguous rotation", () => {
  const first = root("langame-bootstrap-production-1");
  const initial = { [first.keyId]: first };
  assert.throws(
    () =>
      validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
        initial,
        {},
      ),
    code("CURRENT198_BOOTSTRAP_REGISTRY_HISTORY_REMOVED"),
  );
  const rewritten = {
    ...first,
    notAfter: "2027-08-13T00:00:00.000Z",
    revokedAt: "2026-11-01T00:00:00.000Z",
    status: "REVOKED",
  };
  assert.throws(
    () =>
      validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
        initial,
        { [first.keyId]: rewritten },
      ),
    code("CURRENT198_BOOTSTRAP_REGISTRY_HISTORY_REWRITTEN"),
  );
  const second = root("langame-bootstrap-production-2");
  assert.throws(
    () =>
      validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
        initial,
        { [first.keyId]: first, [second.keyId]: second },
      ),
    code("CURRENT198_BOOTSTRAP_REGISTRY_MULTIPLE_ACTIVE"),
  );
  const retiredFirst = {
    ...first,
    retiredAt: "2026-10-01T00:00:00.000Z",
    status: "RETIRED",
  };
  const wrongTimeline = root("langame-bootstrap-production-2", {
    overrides: {
      notBefore: "2026-10-02T00:00:00.000Z",
      supersedesKeyId: first.keyId,
    },
  });
  assert.throws(
    () =>
      validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
        initial,
        {
          [first.keyId]: retiredFirst,
          [wrongTimeline.keyId]: wrongTimeline,
        },
      ),
    code("CURRENT198_BOOTSTRAP_REGISTRY_TRANSITION_INVALID"),
  );

  const revokedFirst = {
    ...first,
    revokedAt: "2026-09-01T00:00:00.000Z",
    status: "REVOKED",
  };
  const forkOne = root("langame-bootstrap-production-2", {
    overrides: { supersedesKeyId: first.keyId },
  });
  const forkTwo = root("langame-bootstrap-production-3", {
    overrides: {
      revokedAt: "2026-09-01T00:00:00.000Z",
      status: "REVOKED",
      supersedesKeyId: first.keyId,
    },
  });
  assert.throws(
    () =>
      validateLangameRuntimeTrustBootstrapRegistryCurrent198({
        [first.keyId]: revokedFirst,
        [forkOne.keyId]: forkOne,
        [forkTwo.keyId]: forkTwo,
      }),
    code("CURRENT198_BOOTSTRAP_REGISTRY_SUPERSESSION_INVALID"),
  );
});

test("CURRENT198 transition parser extracts only one exact canonical data literal", async () => {
  const source = await readFile(
    fileURLToPath(
      new URL(
        "./langame-runtime-trust-bootstrap-registry-current198.mjs",
        import.meta.url,
      ),
    ),
  );
  assert.deepEqual(
    extractLangameRuntimeTrustBootstrapRegistryCurrent198FromSource(source),
    {},
  );
  for (const changed of [
    Buffer.from("export const x = {};", "utf8"),
    Buffer.concat([source, source]),
    Buffer.from(source.toString("utf8").replace('  "{}";', '  "{ }";'), "utf8"),
  ]) {
    assert.throws(() =>
      extractLangameRuntimeTrustBootstrapRegistryCurrent198FromSource(changed),
    );
  }
});

test("CURRENT198 loads exact binary parent tree evidence", async () => {
  const source = await readFile(
    fileURLToPath(
      new URL(
        "./langame-runtime-trust-bootstrap-registry-current198.mjs",
        import.meta.url,
      ),
    ),
  );
  const modulePath =
    "packages/database/scripts/langame-runtime-trust-bootstrap-registry-current198.mjs";
  const git = (args) => {
    if (args[0] === "cat-file") return "";
    if (args[0] === "ls-tree") {
      return Buffer.from(
        `100644 blob ${"a".repeat(40)}\t${modulePath}\0`,
        "utf8",
      );
    }
    if (args[0] === "show") return source;
    throw new Error("unexpected git call");
  };
  assert.deepEqual(
    loadParentLangameRuntimeTrustBootstrapRegistryCurrent198(
      "b".repeat(40),
      git,
    ),
    {},
  );
});
