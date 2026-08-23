import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { prepareLangameRuntimeTrustBootstrapLifecycleCurrent200 } from "./langame-runtime-trust-bootstrap-lifecycle-current200.mjs";
import { verifyFounderGlobalPlatformLangameRuntimeTrustBootstrapRegistryTransitionCurrent198 } from "./langame-runtime-trust-bootstrap-registry-current198-transition.cli.mjs";
import {
  LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CONTRACT,
  LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_COOLING_OFF_MS,
  LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_PREPARED_STATUS,
  LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_RISK_ACCEPTANCE,
  LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_VERIFIED_STATUS,
  isVerifiedLangameRuntimeTrustFounderPilotCurrent202,
  prepareLangameRuntimeTrustFounderPilotCurrent202,
  verifyLangameRuntimeTrustFounderPilotCurrent202,
  verifyPersistedLangameRuntimeTrustFounderPilotCurrent202,
} from "./langame-runtime-trust-founder-pilot-current202.mjs";

const PREPARED_AT = "2026-08-14T04:00:00.000Z";
const ELIGIBLE_AT = "2026-08-14T16:00:00.000Z";
const EXPIRES_AT = "2026-08-15T16:00:00.000Z";
const VERIFY_AT = "2026-08-14T16:01:00.000Z";

function publicKeyPem(authority) {
  return authority.publicKey.export({ format: "pem", type: "spki" });
}

function transition(root = generateKeyPairSync("ed25519")) {
  return prepareLangameRuntimeTrustBootstrapLifecycleCurrent200(
    {
      command: {
        approvedAt: "2026-08-14T03:59:00.000Z",
        effectiveAt: "2026-08-14T04:05:00.000Z",
        keyId: "langame-bootstrap-global-platform-1",
        nextPublicKeyPem: publicKeyPem(root),
        nextValidUntil: "2027-08-14T04:05:00.000Z",
        operation: "ENROLL",
        operationId: "11111111-1111-4111-8111-111111111111",
        reasonDigest: "a".repeat(64),
      },
      currentRegistry: {},
    },
    PREPARED_AT,
  );
}

function request(founder, overrides = {}) {
  return {
    eligibleAt: ELIGIBLE_AT,
    exceptionId: "22222222-2222-4222-8222-222222222222",
    expiresAt: EXPIRES_AT,
    founderId: "founder-primary",
    founderPublicKeyPem: publicKeyPem(founder),
    keyCustodyPlanDigest: "b".repeat(64),
    preparedAt: PREPARED_AT,
    releaseOwnerId: "founder-primary",
    restoredCopyPlanDigest: "c".repeat(64),
    riskAcceptance:
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_RISK_ACCEPTANCE,
    rollbackOwnerId: "founder-primary",
    rollbackPlanDigest: "d".repeat(64),
    ...overrides,
  };
}

function fixture() {
  const founder = generateKeyPairSync("ed25519");
  const packet = prepareLangameRuntimeTrustFounderPilotCurrent202(
    transition(),
    request(founder),
    PREPARED_AT,
  );
  const founderSignature = signPayload(
    null,
    Buffer.from(packet.founderPayloadCanonicalJson, "utf8"),
    founder.privateKey,
  ).toString("base64url");
  return { founder, founderSignature, packet };
}

function code(expected) {
  return (error) => error?.code === expected && error.safeContractError;
}

test("CURRENT202 V2 prepares one-media global platform bootstrap evidence", () => {
  const { packet } = fixture();
  assert.equal(
    packet.contract,
    "LANGAME_RUNTIME_TRUST_FOUNDER_GLOBAL_PLATFORM_BOOTSTRAP_CURRENT202_V2",
  );
  assert.equal(
    packet.contract,
    LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CONTRACT,
  );
  assert.equal(
    packet.status,
    LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_PREPARED_STATUS,
  );
  assert.equal(packet.coolingOffMilliseconds, 12 * 60 * 60 * 1_000);
  assert.equal(
    packet.coolingOffMilliseconds,
    LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_COOLING_OFF_MS,
  );
  assert.equal(packet.encryptedRemovableMediaCount, 1);
  assert.equal(packet.physicalKeySeparationSatisfied, false);
  assert.equal(packet.platformScope, "GLOBAL");
  assert.equal(packet.customerKeyCeremonyRequired, false);
  assert.equal(packet.additionalTenantKeyCeremonyRequired, false);
  assert.equal(packet.routineTenantOnboardingRequiresRootAccess, false);
  assert.equal(packet.sharedBetaGoRequired, true);
  assert.equal(packet.tenantRolloutPolicyEmbedded, false);
  for (const legacyTenantPolicyKey of [
    "pilotDurationSeconds",
    "pilotStoreLimit",
    "pilotTenantLimit",
    "scaleBeyondPilotAllowed",
    "secondExternalTenantAllowed",
  ]) {
    assert.equal(Object.hasOwn(packet, legacyTenantPolicyKey), false);
  }
  assert.equal(packet.currentNetworkMutationAllowed, false);
  assert.equal(packet.outboundInitiallyEnabled, false);
  assert.equal(packet.publicSignupAllowed, false);
  assert.equal(packet.ownerRouteActivationAllowed, false);
  assert.equal(packet.authorization, false);
  assert.equal(packet.testAccessAuthorized, false);
});

test("CURRENT202 verifies one founder signature after cooling and re-verifies persisted evidence", () => {
  const { founderSignature, packet } = fixture();
  const receipt = verifyLangameRuntimeTrustFounderPilotCurrent202(
    packet,
    { founderSignature },
    VERIFY_AT,
  );
  assert.equal(
    receipt.status,
    LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_VERIFIED_STATUS,
  );
  assert.equal(
    isVerifiedLangameRuntimeTrustFounderPilotCurrent202(receipt),
    true,
  );
  assert.equal(
    isVerifiedLangameRuntimeTrustFounderPilotCurrent202({ ...receipt }),
    false,
  );
  const restored = verifyPersistedLangameRuntimeTrustFounderPilotCurrent202(
    JSON.parse(JSON.stringify(receipt)),
    {},
  );
  assert.equal(
    isVerifiedLangameRuntimeTrustFounderPilotCurrent202(restored),
    true,
  );
  assert.equal(restored.reviewEvidenceDigest, receipt.reviewEvidenceDigest);
});

test("CURRENT198 accepts exact CURRENT202 V2 global evidence only inside its cooling window", () => {
  const { founderSignature, packet } = fixture();
  const receipt = verifyLangameRuntimeTrustFounderPilotCurrent202(
    packet,
    { founderSignature },
    VERIFY_AT,
  );
  const candidate = JSON.parse(receipt.candidateCanonicalJson);
  const verified =
    verifyFounderGlobalPlatformLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
      {},
      candidate,
      JSON.parse(JSON.stringify(receipt)),
      VERIFY_AT,
    );
  assert.equal(verified.reviewEvidenceDigest, receipt.reviewEvidenceDigest);
  for (const observedAt of [PREPARED_AT, EXPIRES_AT]) {
    assert.throws(
      () =>
        verifyFounderGlobalPlatformLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
          {},
          candidate,
          receipt,
          observedAt,
        ),
      code("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_EXPIRED"),
    );
  }
});

test("CURRENT202 rejects signing before cooling-off or at expiry", () => {
  const { founderSignature, packet } = fixture();
  for (const now of [PREPARED_AT, EXPIRES_AT]) {
    assert.throws(
      () =>
        verifyLangameRuntimeTrustFounderPilotCurrent202(
          packet,
          { founderSignature },
          now,
        ),
      code("CURRENT202_FOUNDER_COOLING_OFF_OR_EXPIRY_INVALID"),
    );
  }
});

test("CURRENT202 rejects a different release or rollback owner and unaccepted risk", () => {
  const founder = generateKeyPairSync("ed25519");
  for (const override of [
    { releaseOwnerId: "somebody-else" },
    { rollbackOwnerId: "somebody-else" },
    { riskAcceptance: "I_ACCEPT" },
  ]) {
    assert.throws(
      () =>
        prepareLangameRuntimeTrustFounderPilotCurrent202(
          transition(),
          request(founder, override),
          PREPARED_AT,
        ),
      code("CURRENT202_FOUNDER_REQUEST_INVALID"),
    );
  }
});

test("CURRENT202 rejects widened input, forged signatures, and cloned packets", () => {
  const founder = generateKeyPairSync("ed25519");
  assert.throws(
    () =>
      prepareLangameRuntimeTrustFounderPilotCurrent202(
        transition(),
        { ...request(founder), extra: true },
        PREPARED_AT,
      ),
    code("CURRENT202_FOUNDER_REQUEST_INVALID"),
  );
  const { founderSignature, packet } = fixture();
  assert.throws(
    () =>
      verifyLangameRuntimeTrustFounderPilotCurrent202(
        { ...packet },
        { founderSignature },
        VERIFY_AT,
      ),
    code("CURRENT202_FOUNDER_PACKET_INVALID"),
  );
  const attacker = generateKeyPairSync("ed25519");
  assert.throws(
    () =>
      verifyLangameRuntimeTrustFounderPilotCurrent202(
        packet,
        {
          founderSignature: signPayload(
            null,
            Buffer.from(packet.founderPayloadCanonicalJson, "utf8"),
            attacker.privateKey,
          ).toString("base64url"),
        },
        VERIFY_AT,
      ),
    code("CURRENT202_FOUNDER_SIGNATURE_INVALID"),
  );
});

test("CURRENT202 V2 persisted verifier rejects scope, control, and payload drift", () => {
  const { founderSignature, packet } = fixture();
  const receipt = verifyLangameRuntimeTrustFounderPilotCurrent202(
    packet,
    { founderSignature },
    VERIFY_AT,
  );
  for (const changed of [
    {
      ...receipt,
      contract: "LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_V1",
    },
    { ...receipt, encryptedRemovableMediaCount: 2 },
    { ...receipt, platformScope: "TENANT" },
    { ...receipt, customerKeyCeremonyRequired: true },
    { ...receipt, additionalTenantKeyCeremonyRequired: true },
    { ...receipt, routineTenantOnboardingRequiresRootAccess: true },
    { ...receipt, sharedBetaGoRequired: false },
    { ...receipt, tenantRolloutPolicyEmbedded: true },
    { ...receipt, pilotTenantLimit: 1 },
    { ...receipt, releaseOwnerId: "somebody-else" },
    { ...receipt, reviewEvidenceDigest: "e".repeat(64) },
  ]) {
    assert.throws(
      () =>
        verifyPersistedLangameRuntimeTrustFounderPilotCurrent202(changed, {}),
      code("CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID"),
    );
  }
});

test("CURRENT202 source has no filesystem, private-key, process, or production authority", async () => {
  const source = await readFile(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "langame-runtime-trust-founder-pilot-current202.mjs",
    ),
    "utf8",
  );
  for (const forbidden of [
    "createPrivateKey",
    "generateKeyPair",
    "privateKey",
    "readFile",
    "writeFile",
    "process.env",
    "PrismaClient",
    "fetch(",
    '"pilotDurationSeconds"',
    '"pilotStoreLimit"',
    '"pilotTenantLimit"',
    '"scaleBeyondPilotAllowed"',
    '"secondExternalTenantAllowed"',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }

  const transitionSource = await readFile(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "langame-runtime-trust-bootstrap-registry-current198-transition.cli.mjs",
    ),
    "utf8",
  );
  assert.equal(
    transitionSource.includes(
      "langame-current198-bootstrap-founder-global-current202.json",
    ),
    true,
  );
  assert.equal(
    transitionSource.includes(
      "langame-current198-bootstrap-founder-current202.json",
    ),
    true,
  );
  assert.equal(
    transitionSource.includes('"FOUNDER_GLOBAL_PLATFORM_CURRENT202_V2"'),
    true,
  );
});
