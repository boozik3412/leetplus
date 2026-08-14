import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isPreparedLangameRuntimeTrustBootstrapLifecycleCurrent200,
  prepareLangameRuntimeTrustBootstrapLifecycleCurrent200,
} from "./langame-runtime-trust-bootstrap-lifecycle-current200.mjs";
import {
  langameRuntimeTrustBootstrapRegistryDigestCurrent198,
  parsePinnedLangameRuntimeTrustBootstrapRegistryCurrent198,
} from "./langame-runtime-trust-bootstrap-registry-current198-contract.mjs";

const NOW = "2026-08-14T12:00:00.000Z";
const EFFECTIVE = "2026-08-14T12:05:00.000Z";
const VALID_UNTIL = "2027-08-14T12:05:00.000Z";

const h = (value) =>
  Buffer.from(String(value), "utf8")
    .toString("hex")
    .padEnd(64, "0")
    .slice(0, 64);

function publicKeyPem() {
  return generateKeyPairSync("ed25519").publicKey.export({
    format: "pem",
    type: "spki",
  });
}

function command(overrides = {}) {
  return {
    approvedAt: NOW,
    effectiveAt: EFFECTIVE,
    keyId: "langame-bootstrap-production-1",
    nextPublicKeyPem: publicKeyPem(),
    nextValidUntil: VALID_UNTIL,
    operation: "ENROLL",
    operationId: "11111111-1111-4111-8111-111111111111",
    reasonDigest: h("approved enrollment"),
    ...overrides,
  };
}

function prepare(currentRegistry, value) {
  return prepareLangameRuntimeTrustBootstrapLifecycleCurrent200(
    { command: value, currentRegistry },
    NOW,
  );
}

const code = (expected) => (error) =>
  error?.code === expected && error.safeContractError;

test("CURRENT200 prepares deterministic initial public-root enrollment", () => {
  const prepared = prepare({}, command());
  assert.equal(prepared.authorization, false);
  assert.equal(prepared.canApply, false);
  assert.equal(prepared.productionRootEnrolled, false);
  assert.equal(prepared.sharedBetaAccess, false);
  assert.equal(Object.isFrozen(prepared), true);
  assert.equal(
    isPreparedLangameRuntimeTrustBootstrapLifecycleCurrent200(prepared),
    true,
  );
  assert.equal(
    isPreparedLangameRuntimeTrustBootstrapLifecycleCurrent200({ ...prepared }),
    false,
  );
  assert.equal(
    prepared.currentRegistryDigest,
    langameRuntimeTrustBootstrapRegistryDigestCurrent198({}),
  );
  assert.deepEqual(
    parsePinnedLangameRuntimeTrustBootstrapRegistryCurrent198(
      prepared.candidateCanonicalJson,
    ),
    prepared.candidateRegistry,
  );
});

test("CURRENT200 prepares one linear rotation and emergency revoke", () => {
  const first = prepare({}, command());
  const rotated = prepare(
    first.candidateRegistry,
    command({
      effectiveAt: "2026-08-14T12:10:00.000Z",
      keyId: "langame-bootstrap-production-2",
      nextValidUntil: "2027-08-14T12:10:00.000Z",
      operation: "ROTATE",
      operationId: "22222222-2222-4222-8222-222222222222",
    }),
  );
  assert.equal(
    rotated.candidateRegistry["langame-bootstrap-production-1"].status,
    "RETIRED",
  );
  assert.equal(
    rotated.candidateRegistry["langame-bootstrap-production-2"].supersedesKeyId,
    "langame-bootstrap-production-1",
  );
  const revoked = prepare(
    rotated.candidateRegistry,
    command({
      effectiveAt: "2026-08-14T12:12:00.000Z",
      keyId: "langame-bootstrap-production-2",
      nextPublicKeyPem: null,
      nextValidUntil: null,
      operation: "REVOKE",
      operationId: "33333333-3333-4333-8333-333333333333",
    }),
  );
  assert.equal(
    revoked.candidateRegistry["langame-bootstrap-production-2"].status,
    "REVOKED",
  );
  assert.equal(
    Object.values(revoked.candidateRegistry).some(
      (root) => root.status === "ACTIVE",
    ),
    false,
  );
});

test("CURRENT200 binds command identity, reason and exact candidate bytes", () => {
  const key = publicKeyPem();
  const base = command({ nextPublicKeyPem: key });
  const original = prepare({}, base);
  for (const overrides of [
    { operationId: "44444444-4444-4444-8444-444444444444" },
    { reasonDigest: h("different reason") },
    { effectiveAt: "2026-08-14T12:06:00.000Z" },
    { nextPublicKeyPem: publicKeyPem() },
  ]) {
    const changed = prepare({}, { ...base, ...overrides });
    assert.notEqual(changed.operationDigest, original.operationDigest);
    if (
      Object.hasOwn(overrides, "effectiveAt") ||
      Object.hasOwn(overrides, "nextPublicKeyPem")
    ) {
      assert.notEqual(
        changed.candidateRegistryDigest,
        original.candidateRegistryDigest,
      );
    } else {
      assert.equal(
        changed.candidateRegistryDigest,
        original.candidateRegistryDigest,
      );
    }
  }
});

test("CURRENT200 rejects invalid state, timeline and key material", () => {
  const first = prepare({}, command());
  for (const [registry, value, expected] of [
    [
      first.candidateRegistry,
      command(),
      "CURRENT200_BOOTSTRAP_OPERATION_STATE_INVALID",
    ],
    [
      {},
      command({ operation: "ROTATE" }),
      "CURRENT200_BOOTSTRAP_OPERATION_STATE_INVALID",
    ],
    [
      first.candidateRegistry,
      command({
        keyId: "different-active-root",
        nextPublicKeyPem: null,
        nextValidUntil: null,
        operation: "REVOKE",
      }),
      "CURRENT200_BOOTSTRAP_OPERATION_STATE_INVALID",
    ],
    [
      {},
      command({ approvedAt: "2026-08-14T12:00:01.000Z" }),
      "CURRENT200_BOOTSTRAP_TIMELINE_INVALID",
    ],
    [
      {},
      command({
        approvedAt: "2026-08-13T11:59:59.999Z",
        effectiveAt: "2026-08-14T12:05:00.000Z",
      }),
      "CURRENT200_BOOTSTRAP_TIMELINE_INVALID",
    ],
    [
      {},
      command({
        nextPublicKeyPem:
          "-----BEGIN PUBLIC KEY-----\nnope\n-----END PUBLIC KEY-----\n",
      }),
      "CURRENT200_BOOTSTRAP_PUBLIC_KEY_INVALID",
    ],
  ]) {
    assert.throws(() => prepare(registry, value), code(expected));
  }
});

test("CURRENT200 rejects proxies and accessors without invocation", () => {
  let calls = 0;
  const value = command();
  Object.defineProperty(value, "reasonDigest", {
    enumerable: true,
    get() {
      calls += 1;
      return h("reason");
    },
  });
  assert.throws(
    () => prepare({}, value),
    code("CURRENT200_BOOTSTRAP_COMMAND_INVALID"),
  );
  assert.equal(calls, 0);
  assert.throws(
    () =>
      prepareLangameRuntimeTrustBootstrapLifecycleCurrent200(
        new Proxy({ command: command(), currentRegistry: {} }, {}),
        NOW,
      ),
    code("CURRENT200_BOOTSTRAP_INPUT_INVALID"),
  );
});

test("CURRENT200 has no private-key, filesystem, network or mutation authority", async () => {
  const source = await readFile(
    fileURLToPath(
      new URL(
        "./langame-runtime-trust-bootstrap-lifecycle-current200.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  for (const forbidden of [
    /createPrivateKey/u,
    /generateKeyPair/u,
    /node:(?:child_process|fs|http|https|net|tls)/u,
    /process\.env/u,
    /PrismaClient/u,
    /writeFile/u,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
  assert.doesNotMatch(
    source,
    /(?:authorization|canApply|canEnrollProductionRoots|canMutateRepository|productionExecutionAllowed|productionRootEnrolled|sharedBetaAccess|testAccessAuthorized):\s*true/u,
  );
});
