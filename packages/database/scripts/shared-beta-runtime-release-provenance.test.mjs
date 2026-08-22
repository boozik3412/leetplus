import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import test from "node:test";

import { sharedBetaPublicKeyFingerprint } from "./shared-beta-admission-provenance.mjs";
import {
  PINNED_SHARED_BETA_BUILD_PROVENANCE_ROOTS,
  PINNED_SHARED_BETA_DEPLOYMENT_PROVENANCE_ROOTS,
  SHARED_BETA_BUILD_PROVENANCE_CONTRACT,
  SHARED_BETA_BUILD_PROVENANCE_KIND,
  SHARED_BETA_BUILD_PROVENANCE_PURPOSE,
  SHARED_BETA_DEPLOYMENT_PROVENANCE_CONTRACT,
  SHARED_BETA_DEPLOYMENT_PROVENANCE_KIND,
  SHARED_BETA_DEPLOYMENT_PROVENANCE_PURPOSE,
  SHARED_BETA_RUNTIME_RELEASE_PROFILE,
  SHARED_BETA_RUNTIME_RELEASE_SIGNATURE_ALGORITHM,
  SHARED_BETA_SYNTHETIC_RUNTIME_RELEASE_CONFIRMATION,
  SHARED_BETA_TRIAL_DURATION_MAX_SECONDS,
  SHARED_BETA_TRIAL_DURATION_MIN_SECONDS,
  SHARED_BETA_TRIAL_POLICY_VERSION,
  assertSyntheticSharedBetaRuntimeReleaseContext,
  sharedBetaBuildProvenancePersistArguments,
  sharedBetaDeploymentProvenancePersistArguments,
  sharedBetaRuntimeReleasePayloadDigest,
  verifyPinnedSharedBetaBuildProvenanceEnvelope,
  verifyPinnedSharedBetaDeploymentProvenanceEnvelope,
  verifyPinnedSharedBetaRuntimeReleaseProvenancePair,
  verifySyntheticSharedBetaBuildProvenanceEnvelope,
  verifySyntheticSharedBetaDeploymentProvenanceEnvelope,
  verifySyntheticSharedBetaRuntimeReleaseProvenancePair,
} from "./shared-beta-runtime-release-provenance.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const BUILT_AT = Date.parse("2026-07-30T11:30:00.000Z");
const DEPLOYED_AT = Date.parse("2026-07-30T11:50:00.000Z");
const BUILD_VALID_UNTIL = Date.parse("2026-08-05T11:30:00.000Z");
const DEPLOYMENT_VALID_UNTIL = Date.parse("2026-07-31T11:50:00.000Z");
const SYNTHETIC_TRIAL_DURATION_SECONDS = 17 * 24 * 60 * 60;
const SYNTHETIC_CONTEXT = Object.freeze({
  databaseName: "lp_runtime_release_ci",
  environment: "ci",
  explicitConfirmation: SHARED_BETA_SYNTHETIC_RUNTIME_RELEASE_CONFIRMATION,
  hostname: "127.0.0.1",
  nodeEnv: "test",
});
const DIGESTS = Object.freeze({
  actualContext: "1".repeat(64),
  artifactContent: "2".repeat(64),
  buildReference: "3".repeat(64),
  databaseChallenge: "4".repeat(64),
  databaseIdentity: "5".repeat(64),
  deploymentInstance: "6".repeat(64),
  migrationManifest: "7".repeat(64),
  policyManifest: "8".repeat(64),
  releaseManifest: "9".repeat(64),
  predecessor: "0".repeat(64),
});

function authorityFixture(
  purpose,
  {
    keyId = purpose === SHARED_BETA_BUILD_PROVENANCE_PURPOSE
      ? "shared-beta-build-ci-v1"
      : "shared-beta-deployment-ci-v1",
    keyPair = generateKeyPairSync("ed25519"),
  } = {},
) {
  const publicKeyPem = keyPair.publicKey.export({
    type: "spki",
    format: "pem",
  });
  const publicKeyFingerprint = sharedBetaPublicKeyFingerprint(publicKeyPem);
  return {
    keyId,
    keyPair,
    privateKey: keyPair.privateKey,
    publicKeyFingerprint,
    roots: {
      [keyId]: {
        algorithm: SHARED_BETA_RUNTIME_RELEASE_SIGNATURE_ALGORITHM,
        keyId,
        notAfter: "2026-08-10T00:00:00.000Z",
        notBefore: "2026-07-30T00:00:00.000Z",
        profile: SHARED_BETA_RUNTIME_RELEASE_PROFILE,
        publicKeyFingerprint,
        publicKeyPem,
        purpose,
        status: "ACTIVE",
      },
    },
  };
}

function buildPayload(fixture, overrides = {}) {
  return {
    artifactContentDigest: DIGESTS.artifactContent,
    buildReferenceDigest: DIGESTS.buildReference,
    buildTime: new Date(BUILT_AT).toISOString(),
    builtAtEpochMs: BUILT_AT,
    contract: SHARED_BETA_BUILD_PROVENANCE_CONTRACT,
    kind: SHARED_BETA_BUILD_PROVENANCE_KIND,
    migrationCount: 174,
    migrationManifestDigest: DIGESTS.migrationManifest,
    policyManifestDigest: DIGESTS.policyManifest,
    profile: SHARED_BETA_RUNTIME_RELEASE_PROFILE,
    publicKeyFingerprint: fixture.publicKeyFingerprint,
    purpose: SHARED_BETA_BUILD_PROVENANCE_PURPOSE,
    releaseManifestDigest: DIGESTS.releaseManifest,
    releaseSha: "a".repeat(40),
    schemaHead: "20260730040000_shared_beta_runtime_release_activation",
    schemaVersion: 1,
    signingKeyId: fixture.keyId,
    trialDurationSeconds: SYNTHETIC_TRIAL_DURATION_SECONDS,
    trialPolicyVersion: SHARED_BETA_TRIAL_POLICY_VERSION,
    validUntilEpochMs: BUILD_VALID_UNTIL,
    ...overrides,
  };
}

function deploymentPayload(fixture, buildPayloadDigest, overrides = {}) {
  return {
    activationDatabaseRole: "shared_beta_activation_coordinator",
    actualContextDigest: DIGESTS.actualContext,
    buildPayloadDigest,
    buildProvenanceId: randomUUID(),
    contract: SHARED_BETA_DEPLOYMENT_PROVENANCE_CONTRACT,
    coordinatorRoleName: "shared_beta_activation_coordinator",
    coordinatorRoleOid: 16_442,
    databaseChallengeDigest: DIGESTS.databaseChallenge,
    databaseIdentityDigest: DIGESTS.databaseIdentity,
    deployedAtEpochMs: DEPLOYED_AT,
    deploymentInstanceDigest: DIGESTS.deploymentInstance,
    deploymentMarkerId: randomUUID(),
    environment: "ci",
    generation: 1,
    kind: SHARED_BETA_DEPLOYMENT_PROVENANCE_KIND,
    predecessorMarkerDigest: DIGESTS.predecessor,
    profile: SHARED_BETA_RUNTIME_RELEASE_PROFILE,
    publicKeyFingerprint: fixture.publicKeyFingerprint,
    purpose: SHARED_BETA_DEPLOYMENT_PROVENANCE_PURPOSE,
    schemaVersion: 1,
    signingKeyId: fixture.keyId,
    validUntilEpochMs: DEPLOYMENT_VALID_UNTIL,
    ...overrides,
  };
}

function envelope(payload, fixture) {
  return {
    payload,
    payloadDigest: sharedBetaRuntimeReleasePayloadDigest(payload),
    publicKeyFingerprint: fixture.publicKeyFingerprint,
    signature: sign(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      fixture.privateKey,
    ).toString("base64url"),
    signatureAlgorithm: SHARED_BETA_RUNTIME_RELEASE_SIGNATURE_ALGORITHM,
    signingKeyId: fixture.keyId,
  };
}

function pairFixture(options = {}) {
  const buildAuthority =
    options.buildAuthority ??
    authorityFixture(SHARED_BETA_BUILD_PROVENANCE_PURPOSE);
  const buildEnvelope = envelope(
    buildPayload(buildAuthority, options.buildOverrides),
    buildAuthority,
  );
  const deploymentAuthority =
    options.deploymentAuthority ??
    authorityFixture(SHARED_BETA_DEPLOYMENT_PROVENANCE_PURPOSE);
  const deploymentEnvelope = envelope(
    deploymentPayload(
      deploymentAuthority,
      buildEnvelope.payloadDigest,
      options.deploymentOverrides,
    ),
    deploymentAuthority,
  );
  return {
    buildAuthority,
    buildEnvelope,
    deploymentAuthority,
    deploymentEnvelope,
  };
}

function expectCode(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, code);
    assert.equal(error?.exitCode, 3);
    assert.equal(error?.safeContractError, true);
    return true;
  });
}

test("production build and deployment registries are independently empty", () => {
  assert.deepEqual(PINNED_SHARED_BETA_BUILD_PROVENANCE_ROOTS, {});
  assert.deepEqual(PINNED_SHARED_BETA_DEPLOYMENT_PROVENANCE_ROOTS, {});
  assert(Object.isFrozen(PINNED_SHARED_BETA_BUILD_PROVENANCE_ROOTS));
  assert(Object.isFrozen(PINNED_SHARED_BETA_DEPLOYMENT_PROVENANCE_ROOTS));
  assert.notStrictEqual(
    PINNED_SHARED_BETA_BUILD_PROVENANCE_ROOTS,
    PINNED_SHARED_BETA_DEPLOYMENT_PROVENANCE_ROOTS,
  );
});

test("two independent signatures verify one exact branded persistence pair", () => {
  const fixture = pairFixture();
  const verified = verifySyntheticSharedBetaRuntimeReleaseProvenancePair(
    fixture.buildEnvelope,
    fixture.deploymentEnvelope,
    fixture.buildAuthority.roots,
    fixture.deploymentAuthority.roots,
    SYNTHETIC_CONTEXT,
    NOW,
  );

  assert(Object.isFrozen(verified));
  assert(Object.isFrozen(verified.build));
  assert(Object.isFrozen(verified.build.payload));
  assert(Object.isFrozen(verified.deployment));
  assert(Object.isFrozen(verified.deployment.payload));
  assert.equal(
    verified.deployment.payload.buildPayloadDigest,
    verified.build.payloadDigest,
  );
  assert.notEqual(
    verified.build.signingKeyId,
    verified.deployment.signingKeyId,
  );
  assert.notEqual(
    verified.build.publicKeyFingerprint,
    verified.deployment.publicKeyFingerprint,
  );

  const buildArguments = sharedBetaBuildProvenancePersistArguments(
    verified.build,
    verified.deployment.payload.buildProvenanceId,
  );
  assert(Object.isFrozen(buildArguments));
  assert.equal(
    buildArguments.candidateArtifactContentDigest,
    DIGESTS.artifactContent,
  );
  assert.equal(
    buildArguments.candidateBuildProvenanceId,
    verified.deployment.payload.buildProvenanceId,
  );
  assert.equal(
    buildArguments.candidateMigrationManifestDigest,
    DIGESTS.migrationManifest,
  );
  assert.equal(
    buildArguments.candidateReleaseManifestDigest,
    DIGESTS.releaseManifest,
  );
  assert.equal(
    buildArguments.candidateTrialDurationSeconds,
    SYNTHETIC_TRIAL_DURATION_SECONDS,
  );
  assert.equal(
    buildArguments.candidateTrialPolicyVersion,
    "SHARED_BETA_TRIAL_V1",
  );
  assert.deepEqual(buildArguments.candidateBuiltAt, new Date(BUILT_AT));
  assert.equal(
    buildArguments.candidateBuildTime,
    new Date(BUILT_AT).toISOString(),
  );

  const deploymentArguments =
    sharedBetaDeploymentProvenancePersistArguments(verified);
  assert(Object.isFrozen(deploymentArguments));
  assert.equal(
    deploymentArguments.candidateBuildPayloadDigest,
    verified.build.payloadDigest,
  );
  assert.equal(
    deploymentArguments.candidateDatabaseChallengeDigest,
    DIGESTS.databaseChallenge,
  );
  assert.equal(deploymentArguments.candidateCoordinatorRoleOid, 16_442);
  assert.equal(deploymentArguments.candidateGeneration, 1);
  assert.deepEqual(
    deploymentArguments.candidateDeployedAt,
    new Date(DEPLOYED_AT),
  );
});

test("production pinned verification stays fail-closed", () => {
  const fixture = pairFixture();
  expectCode(
    () =>
      verifyPinnedSharedBetaBuildProvenanceEnvelope(fixture.buildEnvelope, NOW),
    "SHARED_BETA_RUNTIME_RELEASE_AUTHORITY_NOT_ENROLLED",
  );
  expectCode(
    () =>
      verifyPinnedSharedBetaDeploymentProvenanceEnvelope(
        fixture.deploymentEnvelope,
        NOW,
      ),
    "SHARED_BETA_RUNTIME_RELEASE_AUTHORITY_NOT_ENROLLED",
  );
  expectCode(
    () =>
      verifyPinnedSharedBetaRuntimeReleaseProvenancePair(
        fixture.buildEnvelope,
        fixture.deploymentEnvelope,
        NOW,
      ),
    "SHARED_BETA_RUNTIME_RELEASE_AUTHORITY_NOT_ENROLLED",
  );
});

test("build provenance rejects shape, binding, signature, and release tampering", () => {
  const fixture = pairFixture();
  const verify = (candidate) =>
    verifySyntheticSharedBetaBuildProvenanceEnvelope(
      candidate,
      fixture.buildAuthority.roots,
      SYNTHETIC_CONTEXT,
      NOW,
    );

  const extraPayload = {
    ...fixture.buildEnvelope.payload,
    unexpected: "not-signed-contract-data",
  };
  expectCode(
    () => verify(envelope(extraPayload, fixture.buildAuthority)),
    "SHARED_BETA_RUNTIME_RELEASE_PAYLOAD_INVALID",
  );

  const accessorPayload = { ...fixture.buildEnvelope.payload };
  Object.defineProperty(accessorPayload, "releaseSha", {
    enumerable: true,
    get() {
      return "a".repeat(40);
    },
  });
  expectCode(
    () =>
      verify({
        ...fixture.buildEnvelope,
        payload: accessorPayload,
      }),
    "SHARED_BETA_RUNTIME_RELEASE_PAYLOAD_INVALID",
  );

  expectCode(
    () =>
      verify({
        ...fixture.buildEnvelope,
        payload: {
          ...fixture.buildEnvelope.payload,
          releaseSha: "b".repeat(40),
        },
      }),
    "SHARED_BETA_RUNTIME_RELEASE_BINDING_INVALID",
  );

  const resignedDigestOnlyPayload = {
    ...fixture.buildEnvelope.payload,
    releaseSha: "b".repeat(40),
  };
  expectCode(
    () =>
      verify({
        ...fixture.buildEnvelope,
        payload: resignedDigestOnlyPayload,
        payloadDigest: sharedBetaRuntimeReleasePayloadDigest(
          resignedDigestOnlyPayload,
        ),
      }),
    "SHARED_BETA_RUNTIME_RELEASE_SIGNATURE_INVALID",
  );

  const missingTrialDuration = { ...fixture.buildEnvelope.payload };
  delete missingTrialDuration.trialDurationSeconds;
  expectCode(
    () => verify(envelope(missingTrialDuration, fixture.buildAuthority)),
    "SHARED_BETA_RUNTIME_RELEASE_PAYLOAD_INVALID",
  );

  expectCode(
    () =>
      verify({
        ...fixture.buildEnvelope,
        payload: {
          ...fixture.buildEnvelope.payload,
          trialDurationSeconds:
            fixture.buildEnvelope.payload.trialDurationSeconds + 1,
        },
      }),
    "SHARED_BETA_RUNTIME_RELEASE_BINDING_INVALID",
  );

  for (const overrides of [
    { releaseSha: "A".repeat(40) },
    {
      schemaHead: "20260730030000_identity_mail_outbox_pending_enum_expand",
    },
    { migrationCount: 173 },
    { buildTime: "2026-07-30T11:30:00Z" },
    {
      validUntilEpochMs: BUILT_AT + 7 * 24 * 60 * 60 * 1_000 + 1,
    },
    { artifactContentDigest: "f".repeat(63) },
    { trialDurationSeconds: 0 },
    { trialDurationSeconds: -1 },
    {
      trialDurationSeconds: SHARED_BETA_TRIAL_DURATION_MAX_SECONDS + 1,
    },
    { trialPolicyVersion: "SHARED_BETA_TRIAL_V2" },
  ]) {
    const payload = buildPayload(fixture.buildAuthority, overrides);
    expectCode(
      () => verify(envelope(payload, fixture.buildAuthority)),
      "SHARED_BETA_BUILD_PROVENANCE_INVALID",
    );
  }

  const minimumDuration = buildPayload(fixture.buildAuthority, {
    trialDurationSeconds: SHARED_BETA_TRIAL_DURATION_MIN_SECONDS,
  });
  assert.equal(
    verify(envelope(minimumDuration, fixture.buildAuthority)).payload
      .trialDurationSeconds,
    SHARED_BETA_TRIAL_DURATION_MIN_SECONDS,
  );
});

test("deployment provenance enforces exact challenge, generation, role and lifetime", () => {
  const fixture = pairFixture();
  const verify = (overrides) => {
    const payload = deploymentPayload(
      fixture.deploymentAuthority,
      fixture.buildEnvelope.payloadDigest,
      overrides,
    );
    return verifySyntheticSharedBetaDeploymentProvenanceEnvelope(
      envelope(payload, fixture.deploymentAuthority),
      fixture.deploymentAuthority.roots,
      SYNTHETIC_CONTEXT,
      NOW,
    );
  };

  assert.equal(
    verify({}).payload.databaseChallengeDigest,
    DIGESTS.databaseChallenge,
  );
  for (const overrides of [
    { databaseChallengeDigest: "f".repeat(63) },
    { coordinatorRoleName: '"unsafe-role"' },
    { coordinatorRoleOid: 0 },
    { activationDatabaseRole: "different_coordinator" },
    { generation: 0 },
    { predecessorMarkerDigest: "f".repeat(63) },
    {
      deployedAtEpochMs: DEPLOYED_AT,
      validUntilEpochMs: DEPLOYED_AT + 24 * 60 * 60 * 1_000 + 1,
    },
    { environment: "CI" },
    { deploymentMarkerId: "not-a-uuid" },
  ]) {
    expectCode(
      () => verify(overrides),
      "SHARED_BETA_DEPLOYMENT_PROVENANCE_INVALID",
    );
  }

  assert.equal(
    verify({
      generation: 2,
      predecessorMarkerDigest: "f".repeat(64),
    }).payload.generation,
    2,
  );
});

test("purpose-scoped registries cannot be exchanged", () => {
  const fixture = pairFixture();
  expectCode(
    () =>
      verifySyntheticSharedBetaBuildProvenanceEnvelope(
        fixture.buildEnvelope,
        fixture.deploymentAuthority.roots,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_RUNTIME_RELEASE_ROOT_INVALID",
  );
  expectCode(
    () =>
      verifySyntheticSharedBetaDeploymentProvenanceEnvelope(
        fixture.deploymentEnvelope,
        fixture.buildAuthority.roots,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_RUNTIME_RELEASE_ROOT_INVALID",
  );
});

test("pair verification requires different key ids and fingerprints", () => {
  const sharedKeyId = "shared-beta-shared-ci-v1";
  const sameIdBuild = authorityFixture(SHARED_BETA_BUILD_PROVENANCE_PURPOSE, {
    keyId: sharedKeyId,
  });
  const sameIdDeployment = authorityFixture(
    SHARED_BETA_DEPLOYMENT_PROVENANCE_PURPOSE,
    { keyId: sharedKeyId },
  );
  const sameIdFixture = pairFixture({
    buildAuthority: sameIdBuild,
    deploymentAuthority: sameIdDeployment,
  });
  expectCode(
    () =>
      verifySyntheticSharedBetaRuntimeReleaseProvenancePair(
        sameIdFixture.buildEnvelope,
        sameIdFixture.deploymentEnvelope,
        sameIdBuild.roots,
        sameIdDeployment.roots,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_RUNTIME_RELEASE_AUTHORITY_SEPARATION_INVALID",
  );

  const sharedKeyPair = generateKeyPairSync("ed25519");
  const sameKeyBuild = authorityFixture(SHARED_BETA_BUILD_PROVENANCE_PURPOSE, {
    keyId: "shared-beta-build-same-key-v1",
    keyPair: sharedKeyPair,
  });
  const sameKeyDeployment = authorityFixture(
    SHARED_BETA_DEPLOYMENT_PROVENANCE_PURPOSE,
    {
      keyId: "shared-beta-deploy-same-key-v1",
      keyPair: sharedKeyPair,
    },
  );
  const sameKeyFixture = pairFixture({
    buildAuthority: sameKeyBuild,
    deploymentAuthority: sameKeyDeployment,
  });
  expectCode(
    () =>
      verifySyntheticSharedBetaRuntimeReleaseProvenancePair(
        sameKeyFixture.buildEnvelope,
        sameKeyFixture.deploymentEnvelope,
        sameKeyBuild.roots,
        sameKeyDeployment.roots,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_RUNTIME_RELEASE_AUTHORITY_SEPARATION_INVALID",
  );
});

test("deployment must link the exact build payload and its validity window", () => {
  const wrongLink = pairFixture({
    deploymentOverrides: {
      buildPayloadDigest: "f".repeat(64),
    },
  });
  expectCode(
    () =>
      verifySyntheticSharedBetaRuntimeReleaseProvenancePair(
        wrongLink.buildEnvelope,
        wrongLink.deploymentEnvelope,
        wrongLink.buildAuthority.roots,
        wrongLink.deploymentAuthority.roots,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_RUNTIME_RELEASE_PAIR_BINDING_INVALID",
  );

  const beforeBuild = pairFixture({
    deploymentOverrides: {
      deployedAtEpochMs: BUILT_AT - 1,
      validUntilEpochMs: BUILT_AT - 1 + 23 * 60 * 60 * 1_000,
    },
  });
  expectCode(
    () =>
      verifySyntheticSharedBetaRuntimeReleaseProvenancePair(
        beforeBuild.buildEnvelope,
        beforeBuild.deploymentEnvelope,
        beforeBuild.buildAuthority.roots,
        beforeBuild.deploymentAuthority.roots,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_RUNTIME_RELEASE_PAIR_BINDING_INVALID",
  );
});

test("synthetic verification requires exact non-production loopback CI context", () => {
  assert.equal(
    assertSyntheticSharedBetaRuntimeReleaseContext(SYNTHETIC_CONTEXT),
    true,
  );
  const fixture = pairFixture();
  for (const overrides of [
    { explicitConfirmation: "yes" },
    { hostname: "database.internal" },
    { hostname: "LOCALHOST" },
    { databaseName: "leetplus_runtime_release" },
    { databaseName: "leetplus_prod_ci" },
    { nodeEnv: "production" },
    { environment: "production" },
  ]) {
    expectCode(
      () =>
        verifySyntheticSharedBetaRuntimeReleaseProvenancePair(
          fixture.buildEnvelope,
          fixture.deploymentEnvelope,
          fixture.buildAuthority.roots,
          fixture.deploymentAuthority.roots,
          { ...SYNTHETIC_CONTEXT, ...overrides },
          NOW,
        ),
      "SHARED_BETA_RUNTIME_RELEASE_SYNTHETIC_CONTEXT_DENIED",
    );
  }

  expectCode(
    () =>
      assertSyntheticSharedBetaRuntimeReleaseContext({
        ...SYNTHETIC_CONTEXT,
        extra: true,
      }),
    "SHARED_BETA_RUNTIME_RELEASE_SYNTHETIC_CONTEXT_DENIED",
  );

  const productionMarker = pairFixture({
    deploymentOverrides: { environment: "production" },
  });
  expectCode(
    () =>
      verifySyntheticSharedBetaRuntimeReleaseProvenancePair(
        productionMarker.buildEnvelope,
        productionMarker.deploymentEnvelope,
        productionMarker.buildAuthority.roots,
        productionMarker.deploymentAuthority.roots,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_RUNTIME_RELEASE_SYNTHETIC_CONTEXT_DENIED",
  );
});

test("WeakSet brands reject copies and caller-shaped persistence values", () => {
  const fixture = pairFixture();
  const verified = verifySyntheticSharedBetaRuntimeReleaseProvenancePair(
    fixture.buildEnvelope,
    fixture.deploymentEnvelope,
    fixture.buildAuthority.roots,
    fixture.deploymentAuthority.roots,
    SYNTHETIC_CONTEXT,
    NOW,
  );

  expectCode(
    () =>
      sharedBetaBuildProvenancePersistArguments(
        { ...verified.build },
        verified.deployment.payload.buildProvenanceId,
      ),
    "SHARED_BETA_BUILD_PROVENANCE_NOT_VERIFIED",
  );
  expectCode(
    () =>
      sharedBetaBuildProvenancePersistArguments(
        fixture.buildEnvelope,
        verified.deployment.payload.buildProvenanceId,
      ),
    "SHARED_BETA_BUILD_PROVENANCE_NOT_VERIFIED",
  );
  expectCode(
    () =>
      sharedBetaBuildProvenancePersistArguments(verified.build, "not-a-uuid"),
    "SHARED_BETA_BUILD_PROVENANCE_PERSIST_ARGUMENTS_INVALID",
  );
  expectCode(
    () =>
      sharedBetaDeploymentProvenancePersistArguments({
        build: verified.build,
        deployment: verified.deployment,
      }),
    "SHARED_BETA_DEPLOYMENT_PROVENANCE_PAIR_NOT_VERIFIED",
  );
  expectCode(
    () =>
      sharedBetaDeploymentProvenancePersistArguments(
        fixture.deploymentEnvelope,
      ),
    "SHARED_BETA_DEPLOYMENT_PROVENANCE_PAIR_NOT_VERIFIED",
  );
});

test("individual synthetic verifiers retain independent brands", () => {
  const fixture = pairFixture();
  const build = verifySyntheticSharedBetaBuildProvenanceEnvelope(
    fixture.buildEnvelope,
    fixture.buildAuthority.roots,
    SYNTHETIC_CONTEXT,
    NOW,
  );
  const deployment = verifySyntheticSharedBetaDeploymentProvenanceEnvelope(
    fixture.deploymentEnvelope,
    fixture.deploymentAuthority.roots,
    SYNTHETIC_CONTEXT,
    NOW,
  );

  assert.equal(build.payload.kind, SHARED_BETA_BUILD_PROVENANCE_KIND);
  assert.equal(deployment.payload.kind, SHARED_BETA_DEPLOYMENT_PROVENANCE_KIND);
  assert(Object.isFrozen(build));
  assert(Object.isFrozen(deployment));
  assert.equal(
    sharedBetaBuildProvenancePersistArguments(
      build,
      deployment.payload.buildProvenanceId,
    ).candidatePayloadDigest,
    build.payloadDigest,
  );
  expectCode(
    () =>
      sharedBetaDeploymentProvenancePersistArguments({
        build,
        deployment,
      }),
    "SHARED_BETA_DEPLOYMENT_PROVENANCE_PAIR_NOT_VERIFIED",
  );
});
