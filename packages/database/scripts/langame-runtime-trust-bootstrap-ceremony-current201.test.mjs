import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CONTRACT,
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_PREPARED_STATUS,
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_VERIFIED_STATUS,
  isVerifiedLangameRuntimeTrustBootstrapCeremonyCurrent201,
  prepareLangameRuntimeTrustBootstrapCeremonyCurrent201,
  verifyPersistedLangameRuntimeTrustBootstrapCeremonyCurrent201,
  verifyLangameRuntimeTrustBootstrapCeremonyCurrent201,
} from "./langame-runtime-trust-bootstrap-ceremony-current201.mjs";
import { prepareLangameRuntimeTrustBootstrapLifecycleCurrent200 } from "./langame-runtime-trust-bootstrap-lifecycle-current200.mjs";
import { verifyReviewedLangameRuntimeTrustBootstrapRegistryTransitionCurrent198 } from "./langame-runtime-trust-bootstrap-registry-current198-transition.cli.mjs";

const NOW = "2026-08-14T04:00:00.000Z";
const CREATED_AT = "2026-08-14T03:59:00.000Z";
const EXPIRES_AT = "2026-08-14T05:00:00.000Z";

function publicKeyPem(authority) {
  return authority.publicKey.export({ format: "pem", type: "spki" });
}

function transition() {
  const root = generateKeyPairSync("ed25519");
  return prepareLangameRuntimeTrustBootstrapLifecycleCurrent200(
    {
      command: {
        approvedAt: CREATED_AT,
        effectiveAt: "2026-08-14T04:05:00.000Z",
        keyId: "langame-bootstrap-production-1",
        nextPublicKeyPem: publicKeyPem(root),
        nextValidUntil: "2027-08-14T04:05:00.000Z",
        operation: "ENROLL",
        operationId: "11111111-1111-4111-8111-111111111111",
        reasonDigest: "a".repeat(64),
      },
      currentRegistry: {},
    },
    NOW,
  );
}

function fixture() {
  const operator = generateKeyPairSync("ed25519");
  const reviewer = generateKeyPairSync("ed25519");
  const packet = prepareLangameRuntimeTrustBootstrapCeremonyCurrent201(
    transition(),
    {
      ceremonyId: "22222222-2222-4222-8222-222222222222",
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
      operatorId: "release-operator-1",
      operatorPublicKeyPem: publicKeyPem(operator),
      reviewerId: "security-reviewer-1",
      reviewerPublicKeyPem: publicKeyPem(reviewer),
    },
    NOW,
  );
  const evidence = {
    operatorSignature: signPayload(
      null,
      Buffer.from(packet.operatorPayloadCanonicalJson, "utf8"),
      operator.privateKey,
    ).toString("base64url"),
    reviewerSignature: signPayload(
      null,
      Buffer.from(packet.reviewerPayloadCanonicalJson, "utf8"),
      reviewer.privateKey,
    ).toString("base64url"),
  };
  return { evidence, operator, packet, reviewer };
}

function code(expected) {
  return (error) => error?.code === expected && error.safeContractError;
}

test("CURRENT201 prepares distinct role-bound signing payloads", () => {
  const { packet } = fixture();
  assert.equal(
    packet.contract,
    LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CONTRACT,
  );
  assert.equal(
    packet.status,
    LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_PREPARED_STATUS,
  );
  assert.notEqual(
    packet.operatorPayloadCanonicalJson,
    packet.reviewerPayloadCanonicalJson,
  );
  assert.notEqual(
    packet.operatorPublicKeyFingerprint,
    packet.reviewerPublicKeyFingerprint,
  );
  assert.match(packet.candidateRegistryDigest, /^[a-f0-9]{64}$/u);
  assert.match(packet.operationDigest, /^[a-f0-9]{64}$/u);
  assert.equal(packet.authorization, false);
  assert.equal(packet.canApply, false);
  assert.equal(packet.canEnrollProductionRoots, false);
  assert.equal(packet.productionExecutionAllowed, false);
  assert.equal(packet.productionRootEnrolled, false);
  assert.equal(packet.sharedBetaAccess, false);
  assert.equal(packet.testAccessAuthorized, false);
});

test("CURRENT201 verifies two exact independent signatures", () => {
  const { evidence, packet } = fixture();
  const receipt = verifyLangameRuntimeTrustBootstrapCeremonyCurrent201(
    packet,
    evidence,
    NOW,
  );
  assert.equal(
    receipt.status,
    LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_VERIFIED_STATUS,
  );
  assert.equal(
    isVerifiedLangameRuntimeTrustBootstrapCeremonyCurrent201(receipt),
    true,
  );
  assert.equal(
    isVerifiedLangameRuntimeTrustBootstrapCeremonyCurrent201({ ...receipt }),
    false,
  );
  assert.equal(receipt.candidateCanonicalJson, packet.candidateCanonicalJson);
  assert.match(receipt.reviewEvidenceDigest, /^[a-f0-9]{64}$/u);
  for (const key of [
    "authorization",
    "canApply",
    "canEnrollProductionRoots",
    "productionExecutionAllowed",
    "productionRootEnrolled",
    "sharedBetaAccess",
    "testAccessAuthorized",
  ]) {
    assert.equal(receipt[key], false, key);
  }
});

test("CURRENT201 independently re-verifies persisted public review evidence", () => {
  const { evidence, packet } = fixture();
  const receipt = verifyLangameRuntimeTrustBootstrapCeremonyCurrent201(
    packet,
    evidence,
    NOW,
  );
  const rehydrated =
    verifyPersistedLangameRuntimeTrustBootstrapCeremonyCurrent201(
      JSON.parse(JSON.stringify(receipt)),
      {},
    );
  assert.equal(
    isVerifiedLangameRuntimeTrustBootstrapCeremonyCurrent201(rehydrated),
    true,
  );
  assert.equal(rehydrated.reviewEvidenceDigest, receipt.reviewEvidenceDigest);
  assert.equal(
    rehydrated.candidateCanonicalJson,
    receipt.candidateCanonicalJson,
  );
});

test("CURRENT198 transition accepts only the exact persisted CURRENT201 review", () => {
  const { evidence, packet } = fixture();
  const receipt = verifyLangameRuntimeTrustBootstrapCeremonyCurrent201(
    packet,
    evidence,
    NOW,
  );
  const candidate = JSON.parse(receipt.candidateCanonicalJson);
  const verified =
    verifyReviewedLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
      {},
      candidate,
      JSON.parse(JSON.stringify(receipt)),
      NOW,
    );
  assert.equal(verified.reviewEvidenceDigest, receipt.reviewEvidenceDigest);
  assert.equal(verified.candidateCanonicalJson, receipt.candidateCanonicalJson);
});

test("CURRENT198 transition rejects missing or candidate-drifted CURRENT201 review", () => {
  const { evidence, packet } = fixture();
  const receipt = verifyLangameRuntimeTrustBootstrapCeremonyCurrent201(
    packet,
    evidence,
    NOW,
  );
  const candidate = JSON.parse(receipt.candidateCanonicalJson);
  assert.throws(
    () =>
      verifyReviewedLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
        {},
        candidate,
        null,
        NOW,
      ),
    code("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_REQUIRED"),
  );
  const changed = {
    ...candidate,
    [Object.keys(candidate)[0]]: {
      ...candidate[Object.keys(candidate)[0]],
      notAfter: "2027-08-13T04:05:00.000Z",
    },
  };
  assert.throws(
    () =>
      verifyReviewedLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
        {},
        changed,
        receipt,
        NOW,
      ),
    code("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_INVALID"),
  );
  assert.throws(
    () =>
      verifyReviewedLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
        {},
        candidate,
        receipt,
        EXPIRES_AT,
      ),
    code("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_EXPIRED"),
  );
});

test("CURRENT201 persisted verifier rejects registry, payload and signature drift", () => {
  const { evidence, packet } = fixture();
  const receipt = verifyLangameRuntimeTrustBootstrapCeremonyCurrent201(
    packet,
    evidence,
    NOW,
  );
  for (const [changed, currentRegistry, expectedCode] of [
    [
      { ...receipt, currentRegistryDigest: "b".repeat(64) },
      {},
      "CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID",
    ],
    [
      {
        ...receipt,
        operatorPayloadCanonicalJson: receipt.reviewerPayloadCanonicalJson,
      },
      {},
      "CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID",
    ],
    [
      { ...receipt, reviewerSignature: receipt.operatorSignature },
      {},
      "CURRENT201_CEREMONY_SIGNATURE_INVALID",
    ],
    [receipt, { unexpected: true }, "CURRENT198_BOOTSTRAP_ROOT_INVALID"],
  ]) {
    assert.throws(
      () =>
        verifyPersistedLangameRuntimeTrustBootstrapCeremonyCurrent201(
          changed,
          currentRegistry,
        ),
      (error) => error?.code === expectedCode && error.safeContractError,
    );
  }
});

test("CURRENT201 rejects one person, one key and noncanonical public keys", () => {
  const authority = generateKeyPairSync("ed25519");
  const pem = publicKeyPem(authority);
  const base = {
    ceremonyId: "22222222-2222-4222-8222-222222222222",
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    operatorId: "release-operator-1",
    operatorPublicKeyPem: pem,
    reviewerId: "security-reviewer-1",
    reviewerPublicKeyPem: pem,
  };
  assert.throws(
    () =>
      prepareLangameRuntimeTrustBootstrapCeremonyCurrent201(
        transition(),
        { ...base, reviewerId: base.operatorId },
        NOW,
      ),
    code("CURRENT201_CEREMONY_PARTICIPANTS_INVALID"),
  );
  assert.throws(
    () =>
      prepareLangameRuntimeTrustBootstrapCeremonyCurrent201(
        transition(),
        base,
        NOW,
      ),
    code("CURRENT201_CEREMONY_PARTICIPANTS_INVALID"),
  );
  assert.throws(
    () =>
      prepareLangameRuntimeTrustBootstrapCeremonyCurrent201(
        transition(),
        { ...base, reviewerPublicKeyPem: `${pem}\n` },
        NOW,
      ),
    code("CURRENT201_CEREMONY_PUBLIC_KEY_INVALID"),
  );
});

test("CURRENT201 rejects swapped, forged and malformed signatures", () => {
  const { evidence, operator, packet } = fixture();
  assert.throws(
    () =>
      verifyLangameRuntimeTrustBootstrapCeremonyCurrent201(
        packet,
        {
          operatorSignature: evidence.reviewerSignature,
          reviewerSignature: evidence.operatorSignature,
        },
        NOW,
      ),
    code("CURRENT201_CEREMONY_SIGNATURE_INVALID"),
  );
  const forged = signPayload(
    null,
    Buffer.from(packet.reviewerPayloadCanonicalJson, "utf8"),
    operator.privateKey,
  ).toString("base64url");
  assert.throws(
    () =>
      verifyLangameRuntimeTrustBootstrapCeremonyCurrent201(
        packet,
        { ...evidence, reviewerSignature: forged },
        NOW,
      ),
    code("CURRENT201_CEREMONY_SIGNATURE_INVALID"),
  );
  assert.throws(
    () =>
      verifyLangameRuntimeTrustBootstrapCeremonyCurrent201(
        packet,
        { ...evidence, operatorSignature: "x" },
        NOW,
      ),
    code("CURRENT201_CEREMONY_SIGNATURE_INVALID"),
  );
});

test("CURRENT201 binds every transition and participant field", () => {
  const { evidence, packet } = fixture();
  for (const changed of [
    { ...packet, ceremonyId: "33333333-3333-4333-8333-333333333333" },
    { ...packet, candidateRegistryDigest: "b".repeat(64) },
    { ...packet, operationDigest: "c".repeat(64) },
    { ...packet, operatorId: "other-operator" },
    { ...packet, reviewerId: "other-reviewer" },
  ]) {
    assert.throws(
      () =>
        verifyLangameRuntimeTrustBootstrapCeremonyCurrent201(
          changed,
          evidence,
          NOW,
        ),
      code("CURRENT201_CEREMONY_PACKET_INVALID"),
    );
  }
});

test("CURRENT201 rejects expired and oversized ceremony windows", () => {
  const { evidence, packet } = fixture();
  assert.throws(
    () =>
      verifyLangameRuntimeTrustBootstrapCeremonyCurrent201(
        packet,
        evidence,
        EXPIRES_AT,
      ),
    code("CURRENT201_CEREMONY_EVIDENCE_EXPIRED"),
  );
  assert.throws(
    () =>
      prepareLangameRuntimeTrustBootstrapCeremonyCurrent201(
        transition(),
        {
          ceremonyId: "22222222-2222-4222-8222-222222222222",
          createdAt: CREATED_AT,
          expiresAt: "2026-08-16T03:59:00.000Z",
          operatorId: "release-operator-1",
          operatorPublicKeyPem: publicKeyPem(generateKeyPairSync("ed25519")),
          reviewerId: "security-reviewer-1",
          reviewerPublicKeyPem: publicKeyPem(generateKeyPairSync("ed25519")),
        },
        NOW,
      ),
    code("CURRENT201_CEREMONY_TIMELINE_INVALID"),
  );
});

test("CURRENT201 rejects clones, proxies and accessors without invocation", () => {
  const prepared = transition();
  const operator = generateKeyPairSync("ed25519");
  const reviewer = generateKeyPairSync("ed25519");
  const request = {
    ceremonyId: "22222222-2222-4222-8222-222222222222",
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    operatorId: "release-operator-1",
    operatorPublicKeyPem: publicKeyPem(operator),
    reviewerId: "security-reviewer-1",
    reviewerPublicKeyPem: publicKeyPem(reviewer),
  };
  assert.throws(
    () =>
      prepareLangameRuntimeTrustBootstrapCeremonyCurrent201(
        { ...prepared },
        request,
        NOW,
      ),
    code("CURRENT201_CEREMONY_TRANSITION_INVALID"),
  );
  assert.throws(
    () =>
      prepareLangameRuntimeTrustBootstrapCeremonyCurrent201(
        prepared,
        new Proxy(request, {}),
        NOW,
      ),
    code("CURRENT201_CEREMONY_REQUEST_INVALID"),
  );
  let calls = 0;
  const accessor = { ...request };
  Object.defineProperty(accessor, "operatorId", {
    enumerable: true,
    get() {
      calls += 1;
      return "release-operator-1";
    },
  });
  assert.throws(
    () =>
      prepareLangameRuntimeTrustBootstrapCeremonyCurrent201(
        prepared,
        accessor,
        NOW,
      ),
    code("CURRENT201_CEREMONY_REQUEST_INVALID"),
  );
  assert.equal(calls, 0);
});

test("CURRENT201 source has no private-key, filesystem, network or mutation authority", async () => {
  const source = await readFile(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "langame-runtime-trust-bootstrap-ceremony-current201.mjs",
    ),
    "utf8",
  );
  for (const forbidden of [
    "createPrivateKey",
    "generateKeyPair",
    "node:fs",
    "node:net",
    "node:tls",
    "PrismaClient",
    "process.env",
    "writeFile",
    "execFile",
    "spawn(",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
