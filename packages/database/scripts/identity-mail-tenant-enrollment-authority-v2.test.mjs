import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_APPLICATION_CONTRACT,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CONTRACT,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOMAIN,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_GRANTS_PROFILE,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_CONTRACT,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_PROFILE,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PREDECESSOR_MANIFEST_DIGEST,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROFILE,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PURPOSE,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_ALGORITHM,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SYNTHETIC_CONFIRMATION,
  IdentityMailTenantEnrollmentAuthorityV2Error,
  PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS,
  identityMailTenantEnrollmentAuthorityV2Evidence,
  identityMailTenantEnrollmentAuthorityV2Payload,
  identityMailTenantEnrollmentAuthorityV2PublicKeyFingerprint,
  identityMailTenantEnrollmentCommandV2DatabaseArguments,
  isVerifiedIdentityMailTenantEnrollmentCommandAuthorityV2,
  isVerifiedSyntheticIdentityMailTenantEnrollmentCommandAuthorityV2,
  verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2,
  verifySyntheticIdentityMailTenantEnrollmentCommandAuthorityV2,
} from "./identity-mail-tenant-enrollment-authority-v2.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
after(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = join(
  SCRIPT_DIR,
  "identity-mail-tenant-enrollment-authority-v2.mjs",
);
const NOW = "2026-08-02T10:05:00.000Z";
const REQUESTED_AT = "2026-08-02T10:00:00.000Z";
const EXPIRES_AT = "2026-08-02T10:15:00.000Z";
const DATABASE_NAME = "leetplus_authority_v2_ci";
const COMMAND_KEY_ID = "identity-mail-enrollment-v2-ci-1";
const MANIFEST_KEY_ID = "identity-mail-duty-manifest-v2-ci-1";
const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const COMMAND_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const MARKER_ID = "44444444-4444-4444-8444-444444444444";
const MANIFEST_ID = "55555555-5555-4555-8555-555555555555";
const ROLLBACK_COMMAND_ID = "66666666-6666-4666-8666-666666666666";
const RELEASE_SHA = "a".repeat(40);
const DIGESTS = Object.freeze({
  actor: "1".repeat(64),
  applicationArtifact: "2".repeat(64),
  configurationA: "3".repeat(64),
  configurationB: "4".repeat(64),
  context: "5".repeat(64),
  database: "6".repeat(64),
  grants: "7".repeat(64),
  manifestPayload: "8".repeat(64),
  marker: "9".repeat(64),
  providerA: "a".repeat(64),
  providerB: "b".repeat(64),
  runtime: "c".repeat(64),
});

const DATABASE_ARGUMENT_KEYS = Object.freeze(
  [
    "id",
    "tenantId",
    "requestId",
    "action",
    "intent",
    "contractVersion",
    "signatureDomain",
    "rollbackOfCommandId",
    "proposalContentDigest",
    "proposalCanonicalJson",
    "authorizationEnvelopeDigest",
    "authorizationEnvelopeCanonicalJson",
    "expectedState",
    "targetState",
    "expectedPolicyRevision",
    "nextPolicyRevision",
    "stateRevisionBefore",
    "drainStateRevision",
    "finalStateRevision",
    "previousWorkerRoleName",
    "previousWorkerRoleOid",
    "previousProviderAuthorityDigest",
    "previousMaxAttempts",
    "previousLeaseSeconds",
    "previousAcknowledgeSeconds",
    "previousBaseRetrySeconds",
    "previousMaxRetrySeconds",
    "previousConfigurationDigest",
    "targetWorkerRoleName",
    "targetWorkerRoleOid",
    "targetProviderAuthorityDigest",
    "targetMaxAttempts",
    "targetLeaseSeconds",
    "targetAcknowledgeSeconds",
    "targetBaseRetrySeconds",
    "targetMaxRetrySeconds",
    "targetConfigurationDigest",
    "runtimeConfigDigest",
    "expectedDatabaseName",
    "expectedDatabaseOid",
    "databaseIdentityDigest",
    "deploymentMarkerId",
    "deploymentMarkerDigest",
    "actualContextDigest",
    "releaseSha",
    "actorDigest",
    "signatureAlgorithm",
    "signingKeyId",
    "publicKeyFingerprint",
    "signatureBase64url",
    "requestedAt",
    "expiresAt",
    "dutyManifestContract",
    "dutyManifestProfile",
    "dutyManifestId",
    "dutyManifestRevision",
    "dutyManifestPayloadDigest",
    "dutyManifestSigningKeyId",
    "dutyManifestPublicKeyFingerprint",
    "dutyCoordinatorRoleName",
    "dutyCoordinatorRoleOid",
    "dutyWorkerRoleName",
    "dutyWorkerRoleOid",
    "dutyExactGrantsProfile",
    "dutyExactGrantsDigest",
    "dutyPredecessorManifestDigest",
    "dutyApplicationContract",
    "dutyApplicationReleaseSha",
    "dutyApplicationArtifactSha256",
  ],
);
const DUTY_BINDING_KEYS = Object.freeze(
  [
    "applicationArtifactSha256",
    "applicationContract",
    "applicationReleaseSha",
    "coordinatorRoleName",
    "coordinatorRoleOid",
    "exactGrantsDigest",
    "exactGrantsProfile",
    "manifestContract",
    "manifestId",
    "manifestPayloadDigest",
    "manifestProfile",
    "manifestPublicKeyFingerprint",
    "manifestRevision",
    "manifestSigningKeyId",
    "predecessorManifestDigest",
    "workerRoleName",
    "workerRoleOid",
  ].sort(),
);
const DUTY_DATABASE_ARGUMENT_MAPPING = Object.freeze([
  ["dutyManifestContract", "manifestContract"],
  ["dutyManifestProfile", "manifestProfile"],
  ["dutyManifestId", "manifestId"],
  ["dutyManifestRevision", "manifestRevision"],
  ["dutyManifestPayloadDigest", "manifestPayloadDigest"],
  ["dutyManifestSigningKeyId", "manifestSigningKeyId"],
  ["dutyManifestPublicKeyFingerprint", "manifestPublicKeyFingerprint"],
  ["dutyCoordinatorRoleName", "coordinatorRoleName"],
  ["dutyCoordinatorRoleOid", "coordinatorRoleOid"],
  ["dutyWorkerRoleName", "workerRoleName"],
  ["dutyWorkerRoleOid", "workerRoleOid"],
  ["dutyExactGrantsProfile", "exactGrantsProfile"],
  ["dutyExactGrantsDigest", "exactGrantsDigest"],
  ["dutyPredecessorManifestDigest", "predecessorManifestDigest"],
  ["dutyApplicationContract", "applicationContract"],
  ["dutyApplicationReleaseSha", "applicationReleaseSha"],
  ["dutyApplicationArtifactSha256", "applicationArtifactSha256"],
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function signer(rootOverrides = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint =
    identityMailTenantEnrollmentAuthorityV2PublicKeyFingerprint(publicKeyPem);
  const root = {
    algorithm: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_ALGORITHM,
    authorityDomain: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOMAIN,
    keyId: COMMAND_KEY_ID,
    notAfter: "2027-01-01T00:00:00.000Z",
    notBefore: "2026-01-01T00:00:00.000Z",
    profile: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROFILE,
    publicKeyFingerprint,
    publicKeyPem,
    purpose: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PURPOSE,
    status: "ACTIVE",
    ...rootOverrides,
  };
  return { privateKey, publicKeyFingerprint, root, roots: { [root.keyId]: root } };
}

const commandSigner = signer();
const manifestKeyPair = generateKeyPairSync("ed25519");
const manifestPublicKeyFingerprint =
  identityMailTenantEnrollmentAuthorityV2PublicKeyFingerprint(
    manifestKeyPair.publicKey.export({ type: "spki", format: "pem" }),
  );
const SYNTHETIC_CONTEXT = Object.freeze({
  databaseName: DATABASE_NAME,
  environment: "ci",
  explicitConfirmation:
    IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SYNTHETIC_CONFIRMATION,
  hostname: "127.0.0.1",
  nodeEnv: "test",
});

function expectCode(action, code) {
  assert.throws(
    action,
    (error) =>
      error instanceof IdentityMailTenantEnrollmentAuthorityV2Error &&
      error.code === code &&
      error.reasonCode === code &&
      error.exitCode === 3 &&
      error.safeContractError === true,
  );
}

function expectV2Error(action) {
  assert.throws(
    action,
    (error) =>
      error instanceof IdentityMailTenantEnrollmentAuthorityV2Error &&
      error.code.startsWith("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_"),
  );
}

function policy(overrides = {}) {
  return {
    acknowledgeSeconds: 60,
    baseRetrySeconds: 30,
    leaseSeconds: 120,
    maxAttempts: 5,
    maxRetrySeconds: 900,
    ...overrides,
  };
}

function configuration({
  configurationDigest = DIGESTS.configurationA,
  providerAuthorityDigest = DIGESTS.providerA,
  workerRoleName = "identity_mail_worker_v2",
  workerRoleOid = 16_386,
  ...overrides
} = {}) {
  return {
    ...policy(),
    configurationDigest,
    providerAuthorityDigest,
    workerRoleName,
    workerRoleOid,
    ...overrides,
  };
}

function dutyRoleBinding(overrides = {}) {
  return {
    applicationArtifactSha256: DIGESTS.applicationArtifact,
    applicationContract:
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_APPLICATION_CONTRACT,
    applicationReleaseSha: RELEASE_SHA,
    coordinatorRoleName: "identity_mail_enrollment_coordinator",
    coordinatorRoleOid: 16_385,
    exactGrantsDigest: DIGESTS.grants,
    exactGrantsProfile:
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_GRANTS_PROFILE,
    manifestContract:
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_CONTRACT,
    manifestId: MANIFEST_ID,
    manifestPayloadDigest: DIGESTS.manifestPayload,
    manifestProfile:
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_PROFILE,
    manifestPublicKeyFingerprint,
    manifestRevision: 1,
    manifestSigningKeyId: MANIFEST_KEY_ID,
    predecessorManifestDigest:
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PREDECESSOR_MANIFEST_DIGEST,
    workerRoleName: "identity_mail_worker_v2",
    workerRoleOid: 16_386,
    ...overrides,
  };
}

function actionState(action) {
  if (action === "ENABLE") {
    return {
      drainStateRevision: null,
      expectedPolicyRevision: 0,
      expectedState: "ABSENT",
      finalStateRevision: 1,
      nextPolicyRevision: 1,
      previousConfiguration: null,
      stateRevisionBefore: 0,
      targetConfiguration: configuration(),
      targetState: "ACTIVE",
    };
  }
  if (action === "ROTATE") {
    return {
      drainStateRevision: 5,
      expectedPolicyRevision: 3,
      expectedState: "ACTIVE",
      finalStateRevision: 6,
      nextPolicyRevision: 4,
      previousConfiguration: configuration(),
      stateRevisionBefore: 4,
      targetConfiguration: configuration({
        configurationDigest: DIGESTS.configurationB,
        providerAuthorityDigest: DIGESTS.providerB,
      }),
      targetState: "ACTIVE",
    };
  }
  return {
    drainStateRevision: 5,
    expectedPolicyRevision: 3,
    expectedState: "ACTIVE",
    finalStateRevision: 6,
    nextPolicyRevision: 4,
    previousConfiguration: configuration(),
    stateRevisionBefore: 4,
    targetConfiguration: configuration(),
    targetState: "DISABLED",
  };
}

function resignDocument(
  proposal,
  envelope,
  authority = commandSigner,
  signatureDomain = IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOMAIN,
) {
  const proposalCanonicalJson = canonicalStringify(proposal);
  const proposalContentDigest = sha256(Buffer.from(proposalCanonicalJson, "utf8"));
  const boundEnvelope = { ...envelope, proposalContentDigest };
  const authorizationEnvelopeCanonicalJson = canonicalStringify(boundEnvelope);
  const signedPayload = Buffer.from(
    `${signatureDomain}\n${authorizationEnvelopeCanonicalJson}\n`,
    "utf8",
  );
  return {
    authorizationEnvelope: boundEnvelope,
    authorizationEnvelopeDigest: sha256(signedPayload),
    proposal,
    proposalContentDigest,
    signatureBase64url: signPayload(
      null,
      signedPayload,
      authority.privateKey,
    ).toString("base64url"),
  };
}

function documentFor(
  action = "ENABLE",
  {
    authority = commandSigner,
    commandId = COMMAND_ID,
    envelopeOverrides = {},
    intent = "FORWARD",
    proposalOverrides = {},
    rollbackOfCommandId = null,
    stateOverrides = {},
  } = {},
) {
  const state = { ...actionState(action), ...stateOverrides };
  const target = state.targetConfiguration;
  const duty = dutyRoleBinding({
    workerRoleName: target.workerRoleName,
    workerRoleOid: target.workerRoleOid,
  });
  const proposal = {
    action,
    authorization: false,
    canMutate: false,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CONTRACT,
    deploymentMarkerDigest: DIGESTS.marker,
    dutyRoleBinding: duty,
    expectedDatabaseName: DATABASE_NAME,
    expectedDatabaseOid: 16_384,
    expectedRevision: state.expectedPolicyRevision,
    expectedState: state.expectedState,
    expiresAt: EXPIRES_AT,
    nextRevision: state.nextPolicyRevision,
    policy: policy({
      acknowledgeSeconds: target.acknowledgeSeconds,
      baseRetrySeconds: target.baseRetrySeconds,
      leaseSeconds: target.leaseSeconds,
      maxAttempts: target.maxAttempts,
      maxRetrySeconds: target.maxRetrySeconds,
    }),
    providerAuthorityDigest: target.providerAuthorityDigest,
    releaseSha: RELEASE_SHA,
    requestId: REQUEST_ID,
    requestedAt: REQUESTED_AT,
    runtimeConfigDigest: DIGESTS.runtime,
    tenantId: TENANT_ID,
    workerRoleName: target.workerRoleName,
    workerRoleOid: target.workerRoleOid,
    ...proposalOverrides,
  };
  const envelope = {
    action,
    actorDigest: DIGESTS.actor,
    actualContextDigest: DIGESTS.context,
    authorityDomain: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOMAIN,
    authorization: true,
    canMutate: true,
    commandId,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CONTRACT,
    databaseIdentityDigest: DIGESTS.database,
    deploymentMarkerDigest: DIGESTS.marker,
    deploymentMarkerId: MARKER_ID,
    drainStateRevision: state.drainStateRevision,
    dutyRoleBinding: duty,
    expectedDatabaseName: DATABASE_NAME,
    expectedDatabaseOid: 16_384,
    expectedPolicyRevision: state.expectedPolicyRevision,
    expectedState: state.expectedState,
    expiresAt: EXPIRES_AT,
    finalStateRevision: state.finalStateRevision,
    intent,
    nextPolicyRevision: state.nextPolicyRevision,
    previousConfiguration: state.previousConfiguration,
    proposalContentDigest: "0".repeat(64),
    publicKeyFingerprint: authority.publicKeyFingerprint,
    releaseSha: RELEASE_SHA,
    requestId: REQUEST_ID,
    requestedAt: REQUESTED_AT,
    rollbackOfCommandId,
    runtimeConfigDigest: DIGESTS.runtime,
    schemaVersion: 2,
    signatureAlgorithm:
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_ALGORITHM,
    signingKeyId: authority.root.keyId,
    stateRevisionBefore: state.stateRevisionBefore,
    targetConfiguration: state.targetConfiguration,
    targetState: state.targetState,
    tenantId: TENANT_ID,
    ...envelopeOverrides,
  };
  return resignDocument(proposal, envelope, authority);
}

function verify(
  document,
  authority = commandSigner,
  context = SYNTHETIC_CONTEXT,
  now = NOW,
) {
  return verifySyntheticIdentityMailTenantEnrollmentCommandAuthorityV2(
    document,
    authority.roots,
    context,
    now,
  );
}

test("production V2 roots are frozen, empty, and noninjectable", () => {
  assert(Object.isFrozen(PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS));
  assert.deepEqual(Object.keys(PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS), []);
  expectCode(
    () => verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(documentFor()),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_NOT_ENROLLED",
  );
  expectCode(
    () =>
      verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(
        documentFor(),
        commandSigner.roots,
      ),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ARGUMENTS_INVALID",
  );
});

test("synthetic ENABLE, ROTATE, DISABLE, and linked rollback preserve V1 transitions", () => {
  for (const action of ["ENABLE", "ROTATE", "DISABLE"]) {
    const document = documentFor(action);
    const verified = verify(document);
    assert.equal(isVerifiedSyntheticIdentityMailTenantEnrollmentCommandAuthorityV2(verified), true);
    assert.equal(isVerifiedIdentityMailTenantEnrollmentCommandAuthorityV2(verified), false);
    assert.equal(verified.action, action);
    assert.equal(verified.authorization, false);
    assert.equal(verified.canMutate, false);
    assert.equal(verified.canSend, false);
    assert(Object.isFrozen(verified));
    if (action === "ENABLE") {
      const envelope = document.authorizationEnvelope;
      const duty = envelope.dutyRoleBinding;
      assert.equal(verified.databaseName, envelope.expectedDatabaseName);
      assert.equal(verified.databaseOid, envelope.expectedDatabaseOid);
      assert.equal(
        verified.databaseIdentityDigest,
        envelope.databaseIdentityDigest,
      );
      assert.equal(verified.deploymentMarkerId, envelope.deploymentMarkerId);
      assert.equal(
        verified.deploymentMarkerDigest,
        envelope.deploymentMarkerDigest,
      );
      assert.equal(verified.actualContextDigest, envelope.actualContextDigest);
      assert.equal(verified.dutyManifestContract, duty.manifestContract);
      assert.equal(verified.dutyManifestProfile, duty.manifestProfile);
      assert.equal(
        verified.dutyManifestPublicKeyFingerprint,
        duty.manifestPublicKeyFingerprint,
      );
      assert.equal(verified.dutyExactGrantsProfile, duty.exactGrantsProfile);
      assert.equal(
        verified.dutyPredecessorManifestDigest,
        duty.predecessorManifestDigest,
      );
      assert.equal(
        verified.dutyApplicationArtifactSha256,
        duty.applicationArtifactSha256,
      );
    }
  }
  const rollback = documentFor("DISABLE", {
    commandId: ROLLBACK_COMMAND_ID,
    intent: "ROLLBACK",
    rollbackOfCommandId: COMMAND_ID,
  });
  assert.equal(verify(rollback).intent, "ROLLBACK");

  expectCode(
    () =>
      verify(
        documentFor("ROTATE", {
          stateOverrides: { drainStateRevision: null },
        }),
      ),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_REVISION_INVALID",
  );
  expectCode(
    () =>
      verify(
        documentFor("DISABLE", {
          stateOverrides: {
            targetConfiguration: configuration({
              configurationDigest: DIGESTS.configurationB,
            }),
          },
        }),
      ),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DISABLE_INVALID",
  );
});

test("uses successor manifest V2 profile and a noncircular application binding", () => {
  const duty = documentFor().authorizationEnvelope.dutyRoleBinding;
  assert.deepEqual(Object.keys(duty).sort(), DUTY_BINDING_KEYS);
  assert.equal(duty.manifestContract, "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2");
  assert.equal(duty.manifestProfile, "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE_V2");
  assert.equal(
    duty.applicationContract,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2",
  );
  assert.equal(duty.applicationReleaseSha, RELEASE_SHA);
  assert.equal(duty.applicationArtifactSha256, DIGESTS.applicationArtifact);
  assert.equal(
    duty.predecessorManifestDigest,
    "9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819",
  );
});

test("every exact dutyRoleBinding field is signed and proposal-bound", () => {
  const mutations = {
    applicationArtifactSha256: "d".repeat(64),
    applicationContract: "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V3",
    applicationReleaseSha: "b".repeat(40),
    coordinatorRoleName: "identity_mail_enrollment_coordinator_b",
    coordinatorRoleOid: 16_395,
    exactGrantsDigest: "e".repeat(64),
    exactGrantsProfile: "IDENTITY_MAIL_DUTY_GRANTS_PG17_V1",
    manifestContract: "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V1",
    manifestId: "77777777-7777-4777-8777-777777777777",
    manifestPayloadDigest: "f".repeat(64),
    manifestProfile: "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE_V1",
    manifestPublicKeyFingerprint: "0".repeat(64),
    manifestRevision: 2,
    manifestSigningKeyId: "identity-mail-duty-manifest-v2-ci-2",
    predecessorManifestDigest: "1".repeat(64),
    workerRoleName: "identity_mail_worker_v2_b",
    workerRoleOid: 16_396,
  };
  assert.deepEqual(Object.keys(mutations).sort(), DUTY_BINDING_KEYS);
  for (const [key, value] of Object.entries(mutations)) {
    const original = documentFor();
    const envelope = {
      ...original.authorizationEnvelope,
      dutyRoleBinding: {
        ...original.authorizationEnvelope.dutyRoleBinding,
        [key]: value,
      },
    };
    expectV2Error(() => verify(resignDocument(original.proposal, envelope)));
  }

  const proposalDrift = documentFor();
  const proposal = {
    ...proposalDrift.proposal,
    dutyRoleBinding: {
      ...proposalDrift.proposal.dutyRoleBinding,
      coordinatorRoleOid: 16_395,
    },
  };
  expectCode(
    () => verify(resignDocument(proposal, proposalDrift.authorizationEnvelope)),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_BINDING_INVALID",
  );
});

test("release binding and same-key manifest claim fail closed", () => {
  const releaseMismatch = documentFor();
  expectCode(
    () =>
      verify(
        resignDocument(
          { ...releaseMismatch.proposal, releaseSha: "b".repeat(40) },
          releaseMismatch.authorizationEnvelope,
        ),
      ),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROPOSAL_INVALID",
  );

  const sameSigner = documentFor();
  const sameFingerprintBinding = {
    ...sameSigner.authorizationEnvelope.dutyRoleBinding,
    manifestPublicKeyFingerprint: commandSigner.publicKeyFingerprint,
  };
  const sameFingerprintProposal = {
    ...sameSigner.proposal,
    dutyRoleBinding: sameFingerprintBinding,
  };
  const sameFingerprintEnvelope = {
    ...sameSigner.authorizationEnvelope,
    dutyRoleBinding: sameFingerprintBinding,
  };
  expectCode(
    () =>
      verify(resignDocument(sameFingerprintProposal, sameFingerprintEnvelope)),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ENVELOPE_INVALID",
  );
});

test("V1 downgrade, cross-domain signatures, and V1 root metadata cannot enter V2", () => {
  const v1 = documentFor();
  const { dutyRoleBinding: ignoredProposalDuty, ...v1Proposal } = v1.proposal;
  const { dutyRoleBinding: ignoredEnvelopeDuty, ...v1Envelope } =
    v1.authorizationEnvelope;
  void ignoredProposalDuty;
  void ignoredEnvelopeDuty;
  const downgraded = resignDocument(
    { ...v1Proposal, contract: "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1" },
    {
      ...v1Envelope,
      authorityDomain: "IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V1",
      contract: "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1",
      schemaVersion: 1,
    },
    commandSigner,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V1",
  );
  expectCode(
    () => verify(downgraded),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROPOSAL_INVALID",
  );

  const crossDomain = documentFor();
  expectCode(
    () =>
      verify(
        resignDocument(
          crossDomain.proposal,
          {
            ...crossDomain.authorizationEnvelope,
            authorityDomain: "IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V1",
          },
          commandSigner,
          "IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V1",
        ),
      ),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ENVELOPE_INVALID",
  );

  const reusedV1Root = {
    ...commandSigner.root,
    profile: "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V1",
    purpose: "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT",
  };
  delete reusedV1Root.authorityDomain;
  expectCode(
    () => verify(documentFor(), { ...commandSigner, roots: { [COMMAND_KEY_ID]: reusedV1Root } }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOT_INVALID",
  );
});

test("unknown command key and resigned fingerprint substitution are not trusted", () => {
  const unknownKey = documentFor();
  expectCode(
    () =>
      verify(
        resignDocument(
          unknownKey.proposal,
          {
            ...unknownKey.authorizationEnvelope,
            signingKeyId: "identity-mail-enrollment-v2-ci-unknown",
          },
          commandSigner,
        ),
      ),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_KEY_NOT_TRUSTED",
  );

  const substitutedFingerprint = documentFor();
  expectCode(
    () =>
      verify(
        resignDocument(
          substitutedFingerprint.proposal,
          {
            ...substitutedFingerprint.authorizationEnvelope,
            publicKeyFingerprint: "f".repeat(64),
          },
          commandSigner,
        ),
      ),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_KEY_NOT_TRUSTED",
  );
});

test("hostile records, accessors, symbols, transparent proxies, and revoked proxies reject", () => {
  const accessor = documentFor();
  let getterCalls = 0;
  Object.defineProperty(accessor.authorizationEnvelope.dutyRoleBinding, "manifestId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return MANIFEST_ID;
    },
  });
  expectCode(
    () => verify(accessor),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_ROLE_BINDING_INVALID",
  );
  assert.equal(getterCalls, 0);

  const symbol = documentFor();
  symbol.proposal[Symbol("extra")] = true;
  expectCode(
    () => verify(symbol),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROPOSAL_INVALID",
  );

  const proxied = documentFor();
  proxied.authorizationEnvelope = new Proxy(proxied.authorizationEnvelope, {});
  expectCode(
    () => verify(proxied),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ENVELOPE_INVALID",
  );

  const revokedDocument = Proxy.revocable(documentFor(), {});
  revokedDocument.revoke();
  expectCode(
    () => verify(revokedDocument.proxy),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOCUMENT_INVALID",
  );

  const revokedRoots = Proxy.revocable(commandSigner.roots, {});
  revokedRoots.revoke();
  expectCode(
    () =>
      verifySyntheticIdentityMailTenantEnrollmentCommandAuthorityV2(
        documentFor(),
        revokedRoots.proxy,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS_INVALID",
  );
});

test("proposal/envelope digests and Ed25519 signature are exact", () => {
  const proposalDigest = documentFor();
  proposalDigest.proposalContentDigest = "f".repeat(64);
  expectCode(
    () => verify(proposalDigest),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROPOSAL_DIGEST_INVALID",
  );

  const envelopeDigest = documentFor();
  envelopeDigest.authorizationEnvelopeDigest = "f".repeat(64);
  expectCode(
    () => verify(envelopeDigest),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ENVELOPE_DIGEST_INVALID",
  );

  const malformed = documentFor();
  malformed.signatureBase64url = "AA";
  expectCode(
    () => verify(malformed),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_INVALID",
  );

  const corrupted = documentFor();
  const signature = Buffer.from(corrupted.signatureBase64url, "base64url");
  signature[0] ^= 0xff;
  corrupted.signatureBase64url = signature.toString("base64url");
  expectCode(
    () => verify(corrupted),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_INVALID",
  );
});

test("timeline remains canonical, short, fresh, and inside the V2 root window", () => {
  for (const mutation of [
    { expiresAt: NOW },
    { requestedAt: "2026-08-02T10:10:00.001Z" },
    { requestedAt: "2026-08-02T10:00:00Z" },
    {
      expiresAt: "2026-08-02T10:15:00.001Z",
      requestedAt: "2026-08-02T10:00:00.000Z",
    },
  ]) {
    const value = documentFor(undefined, {
      envelopeOverrides: mutation,
      proposalOverrides: mutation,
    });
    expectCode(
      () => verify(value),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_TIMELINE_INVALID",
    );
  }
  expectCode(
    () =>
      verifySyntheticIdentityMailTenantEnrollmentCommandAuthorityV2(
        documentFor(),
        commandSigner.roots,
        SYNTHETIC_CONTEXT,
      ),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ARGUMENTS_INVALID",
  );
  expectCode(
    () => verify(documentFor(), commandSigner, SYNTHETIC_CONTEXT, "2026-08-02T10:05:00Z"),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CURRENT_TIME_INVALID",
  );
});

test("root shape, purpose, profile, domain, key and status are exact", () => {
  for (const mutation of [
    { authorityDomain: "IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V1" },
    { purpose: "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT" },
    { profile: "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V1" },
    { algorithm: "EdDSA" },
    { status: "REVOKED" },
    { publicKeyFingerprint: "0".repeat(64) },
  ]) {
    const mutatedRoot = { ...commandSigner.root, ...mutation };
    expectCode(
      () =>
        verify(documentFor(), {
          ...commandSigner,
          roots: { [COMMAND_KEY_ID]: mutatedRoot },
        }),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOT_INVALID",
    );
  }
  const accessorRoot = { ...commandSigner.root };
  let getterCalls = 0;
  Object.defineProperty(accessorRoot, "status", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "ACTIVE";
    },
  });
  expectCode(
    () => verify(documentFor(), { ...commandSigner, roots: { [COMMAND_KEY_ID]: accessorRoot } }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOT_INVALID",
  );
  assert.equal(getterCalls, 0);
});

test("synthetic verification requires exact loopback CI context and ambient test mode", () => {
  for (const mutation of [
    { databaseName: "leetplus_prod" },
    { environment: "production" },
    { explicitConfirmation: "yes" },
    { hostname: "LOCALHOST" },
    { hostname: "db.example.com" },
    { nodeEnv: "production" },
  ]) {
    expectCode(
      () => verify(documentFor(), commandSigner, { ...SYNTHETIC_CONTEXT, ...mutation }),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SYNTHETIC_CONTEXT_DENIED",
    );
  }
  const original = process.env.NODE_ENV;
  try {
    delete process.env.NODE_ENV;
    expectCode(
      () => verify(documentFor()),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SYNTHETIC_CONTEXT_DENIED",
    );
  } finally {
    process.env.NODE_ENV = original;
  }
});

test("fixture-substituted PINNED verifier exposes exact frozen 69-column mapping and evidence", async () => {
  const fixtureNow = Date.now();
  const fixtureSigner = signer({
    notAfter: new Date(fixtureNow + 60 * 60_000).toISOString(),
    notBefore: new Date(fixtureNow - 60 * 60_000).toISOString(),
  });
  const requestedAt = new Date(fixtureNow - 10_000).toISOString();
  const expiresAt = new Date(fixtureNow + 5 * 60_000).toISOString();
  const document = documentFor("ENABLE", {
    authority: fixtureSigner,
    envelopeOverrides: { expiresAt, requestedAt },
    proposalOverrides: { expiresAt, requestedAt },
  });
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), "leetplus-enrollment-authority-v2-pinned-"),
  );
  try {
    const source = await readFile(CONTRACT_PATH, "utf8");
    const registryPattern =
      /export const PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS =\r?\n  Object\.freeze\(\{\}\);/gu;
    assert.equal([...source.matchAll(registryPattern)].length, 1);
    const fixtureRegistry = `export const PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS =
  Object.freeze({ ${JSON.stringify(COMMAND_KEY_ID)}: Object.freeze(${JSON.stringify(fixtureSigner.root)}) });`;
    const fixtureSource = source.replace(registryPattern, fixtureRegistry);
    const fixtureModulePath = join(
      fixtureDirectory,
      "identity-mail-tenant-enrollment-authority-v2.mjs",
    );
    await Promise.all([
      writeFile(fixtureModulePath, fixtureSource, "utf8"),
      writeFile(
        join(fixtureDirectory, "staff-task-integrity-canonical-json.mjs"),
        await readFile(join(SCRIPT_DIR, "staff-task-integrity-canonical-json.mjs"), "utf8"),
        "utf8",
      ),
    ]);
    const fixtureModule = await import(pathToFileURL(fixtureModulePath).href);
    const verified =
      fixtureModule.verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(
        document,
      );
    assert.equal(
      fixtureModule.isVerifiedIdentityMailTenantEnrollmentCommandAuthorityV2(verified),
      true,
    );
    assert.equal(
      fixtureModule.isVerifiedSyntheticIdentityMailTenantEnrollmentCommandAuthorityV2(verified),
      false,
    );
    assert.equal(verified.verificationMode, "PINNED");

    const payload = fixtureModule.identityMailTenantEnrollmentAuthorityV2Payload(verified);
    const databaseArguments =
      fixtureModule.identityMailTenantEnrollmentCommandV2DatabaseArguments(verified);
    const evidence = fixtureModule.identityMailTenantEnrollmentAuthorityV2Evidence(verified);
    assert(Object.isFrozen(payload));
    assert(Object.isFrozen(payload.proposal));
    assert(Object.isFrozen(payload.proposal.dutyRoleBinding));
    assert(Object.isFrozen(payload.authorizationEnvelope));
    assert(Object.isFrozen(databaseArguments));
    assert(Object.isFrozen(evidence));
    assert.deepEqual(Object.keys(databaseArguments), DATABASE_ARGUMENT_KEYS);
    assert.equal(DATABASE_ARGUMENT_KEYS.length, 69);
    assert.equal(databaseArguments.dutyManifestId, MANIFEST_ID);
    assert.equal(
      databaseArguments.dutyManifestProfile,
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_PROFILE,
    );
    assert.equal(databaseArguments.releaseSha, databaseArguments.dutyApplicationReleaseSha);
    for (const [databaseKey, bindingKey] of DUTY_DATABASE_ARGUMENT_MAPPING) {
      assert.equal(
        databaseArguments[databaseKey],
        document.authorizationEnvelope.dutyRoleBinding[bindingKey],
      );
    }
    assert.equal(
      evidence.proposalCanonicalJson,
      canonicalStringify(payload.proposal),
    );
    assert.equal(
      evidence.authorizationEnvelopeCanonicalJson,
      canonicalStringify(payload.authorizationEnvelope),
    );
    assert.equal(evidence.signatureBase64url, document.signatureBase64url);
    assert.equal(
      isVerifiedIdentityMailTenantEnrollmentCommandAuthorityV2(verified),
      false,
    );

    for (const extractor of [
      fixtureModule.identityMailTenantEnrollmentAuthorityV2Payload,
      fixtureModule.identityMailTenantEnrollmentCommandV2DatabaseArguments,
      fixtureModule.identityMailTenantEnrollmentAuthorityV2Evidence,
    ]) {
      assert.throws(
        () => extractor({ ...verified }),
        (error) =>
          error?.code === "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_NOT_VERIFIED",
      );
    }

    const synthetic =
      fixtureModule.verifySyntheticIdentityMailTenantEnrollmentCommandAuthorityV2(
        document,
        fixtureSigner.roots,
        SYNTHETIC_CONTEXT,
        new Date(fixtureNow).toISOString(),
      );
    assert.equal(
      fixtureModule.isVerifiedSyntheticIdentityMailTenantEnrollmentCommandAuthorityV2(synthetic),
      true,
    );
    for (const extractor of [
      fixtureModule.identityMailTenantEnrollmentAuthorityV2Payload,
      fixtureModule.identityMailTenantEnrollmentCommandV2DatabaseArguments,
      fixtureModule.identityMailTenantEnrollmentAuthorityV2Evidence,
    ]) {
      assert.throws(
        () => extractor(synthetic),
        (error) =>
          error?.code === "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_NOT_VERIFIED",
      );
    }
  } finally {
    await rm(fixtureDirectory, { force: true, recursive: true });
  }
});

test("authority V2 is pure and has no SQL, DB, network, Nest, or env-root wiring", async () => {
  const source = await readFile(CONTRACT_PATH, "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(imports, [
    "node:crypto",
    "node:util",
    "./staff-task-integrity-canonical-json.mjs",
  ]);
  assert.equal([...source.matchAll(/^\s*import\b/gmu)].length, 3);
  assert.doesNotMatch(source, /\bimport\s*\(/u);
  assert.doesNotMatch(
    source,
    /(?:@prisma\/client|PrismaClient|@nestjs|nodemailer|smtp|fetch\(|axios|node:net|node:http|node:https|DATABASE_URL|\$executeRaw|\$queryRaw|\bGRANT\b|\bREVOKE\b)/iu,
  );
  assert.match(source, /const VERIFIED_PINNED_AUTHORITIES_V2 = new WeakSet\(\)/u);
  assert.match(source, /const VERIFIED_SYNTHETIC_AUTHORITIES_V2 = new WeakSet\(\)/u);
  assert.match(source, /const VERIFIED_PINNED_PAYLOADS_V2 = new WeakMap\(\)/u);
  assert.match(source, /utilTypes\.isProxy/u);
});
