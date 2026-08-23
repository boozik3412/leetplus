import assert from "node:assert/strict";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import {
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOMAIN,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PROFILE,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PURPOSE,
  IDENTITY_MAIL_TENANT_ENROLLMENT_SIGNATURE_ALGORITHM,
  IDENTITY_MAIL_TENANT_ENROLLMENT_SYNTHETIC_CONFIRMATION,
  PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS,
  identityMailTenantEnrollmentAuthorityPublicKeyFingerprint,
  identityMailTenantEnrollmentCommandDatabaseArguments,
  isVerifiedIdentityMailTenantEnrollmentCommandAuthority,
  isVerifiedSyntheticIdentityMailTenantEnrollmentCommandAuthority,
  verifyPinnedIdentityMailTenantEnrollmentCommandAuthority,
  verifySyntheticIdentityMailTenantEnrollmentCommandAuthority,
} from "./identity-mail-tenant-enrollment-authority.mjs";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
after(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
});

const NOW = new Date("2026-08-01T10:05:00.000Z");
const REQUESTED_AT = "2026-08-01T10:00:00.000Z";
const EXPIRES_AT = "2026-08-01T10:15:00.000Z";
const KEY_ID = "identity-mail-tenant-enrollment-ci-v1";
const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const COMMAND_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const MARKER_ID = "44444444-4444-4444-8444-444444444444";
const ROLLBACK_COMMAND_ID = "55555555-5555-4555-8555-555555555555";
const RELEASE_SHA = "a".repeat(40);
const PROVIDER_A = "b".repeat(64);
const PROVIDER_B = "c".repeat(64);
const CONFIGURATION_A = "d".repeat(64);
const CONFIGURATION_B = "e".repeat(64);
const RUNTIME_DIGEST = "f".repeat(64);
const MARKER_DIGEST = "1".repeat(64);
const DATABASE_DIGEST = "2".repeat(64);
const CONTEXT_DIGEST = "3".repeat(64);
const ACTOR_DIGEST = "4".repeat(64);

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
const publicKeyFingerprint =
  identityMailTenantEnrollmentAuthorityPublicKeyFingerprint(publicKey);
const root = Object.freeze({
  algorithm: IDENTITY_MAIL_TENANT_ENROLLMENT_SIGNATURE_ALGORITHM,
  keyId: KEY_ID,
  notAfter: "2027-01-01T00:00:00.000Z",
  notBefore: "2026-01-01T00:00:00.000Z",
  profile: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PROFILE,
  publicKeyFingerprint,
  publicKeyPem,
  purpose: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PURPOSE,
  status: "ACTIVE",
});
const roots = Object.freeze({ [KEY_ID]: root });
const syntheticContext = Object.freeze({
  databaseName: "leetplus_ci",
  explicitConfirmation:
    IDENTITY_MAIL_TENANT_ENROLLMENT_SYNTHETIC_CONFIRMATION,
  hostname: "127.0.0.1",
  nodeEnv: "test",
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
  configurationDigest = CONFIGURATION_A,
  providerAuthorityDigest = PROVIDER_A,
  workerRoleName = "leetplus_identity_mail_worker",
  workerRoleOid = 16_384,
  ...policyOverrides
} = {}) {
  return {
    acknowledgeSeconds: 60,
    baseRetrySeconds: 30,
    configurationDigest,
    leaseSeconds: 120,
    maxAttempts: 5,
    maxRetrySeconds: 900,
    providerAuthorityDigest,
    workerRoleName,
    workerRoleOid,
    ...policyOverrides,
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
        configurationDigest: CONFIGURATION_B,
        providerAuthorityDigest: PROVIDER_B,
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
  signingKey = privateKey,
  { bindProposalDigest = true } = {},
) {
  const proposalCanonicalJson = canonicalStringify(proposal);
  const proposalContentDigest = sha256(
    Buffer.from(proposalCanonicalJson, "utf8"),
  );
  const boundEnvelope = bindProposalDigest
    ? { ...envelope, proposalContentDigest }
    : { ...envelope };
  const authorizationEnvelopeCanonicalJson =
    canonicalStringify(boundEnvelope);
  const signedPayload = Buffer.from(
    `${IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOMAIN}\n${authorizationEnvelopeCanonicalJson}\n`,
    "utf8",
  );
  return {
    authorizationEnvelope: boundEnvelope,
    authorizationEnvelopeDigest: sha256(signedPayload),
    proposal,
    proposalContentDigest,
    signatureBase64url: sign(null, signedPayload, signingKey).toString(
      "base64url",
    ),
  };
}

function documentFor(
  action = "ENABLE",
  {
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
  const proposal = {
    action,
    authorization: false,
    canMutate: false,
    contract: "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1",
    deploymentMarkerDigest: MARKER_DIGEST,
    expectedDatabaseName: "leetplus_ci",
    expectedDatabaseOid: 16_385,
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
    runtimeConfigDigest: RUNTIME_DIGEST,
    tenantId: TENANT_ID,
    workerRoleName: target.workerRoleName,
    workerRoleOid: target.workerRoleOid,
    ...proposalOverrides,
  };
  const envelope = {
    action,
    actorDigest: ACTOR_DIGEST,
    actualContextDigest: CONTEXT_DIGEST,
    authorityDomain: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOMAIN,
    authorization: true,
    canMutate: true,
    commandId,
    contract: "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1",
    databaseIdentityDigest: DATABASE_DIGEST,
    deploymentMarkerDigest: MARKER_DIGEST,
    deploymentMarkerId: MARKER_ID,
    drainStateRevision: state.drainStateRevision,
    expectedDatabaseName: "leetplus_ci",
    expectedDatabaseOid: 16_385,
    expectedPolicyRevision: state.expectedPolicyRevision,
    expectedState: state.expectedState,
    expiresAt: EXPIRES_AT,
    finalStateRevision: state.finalStateRevision,
    intent,
    nextPolicyRevision: state.nextPolicyRevision,
    previousConfiguration: state.previousConfiguration,
    proposalContentDigest: "0".repeat(64),
    publicKeyFingerprint,
    releaseSha: RELEASE_SHA,
    requestId: REQUEST_ID,
    requestedAt: REQUESTED_AT,
    rollbackOfCommandId,
    runtimeConfigDigest: RUNTIME_DIGEST,
    schemaVersion: 1,
    signatureAlgorithm: IDENTITY_MAIL_TENANT_ENROLLMENT_SIGNATURE_ALGORITHM,
    signingKeyId: KEY_ID,
    stateRevisionBefore: state.stateRevisionBefore,
    targetConfiguration: state.targetConfiguration,
    targetState: state.targetState,
    tenantId: TENANT_ID,
    ...envelopeOverrides,
  };
  return resignDocument(proposal, envelope);
}

function verify(document, candidateRoots = roots, context = syntheticContext, now = NOW) {
  return verifySyntheticIdentityMailTenantEnrollmentCommandAuthority(
    document,
    candidateRoots,
    context,
    now,
  );
}

function expectCode(action, code) {
  assert.throws(action, (error) => error?.code === code);
}

test("production authority roots are immutable, empty, and cannot be caller supplied", () => {
  assert.equal(Object.isFrozen(PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS), true);
  assert.deepEqual(PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS, {});
  expectCode(
    () => verifyPinnedIdentityMailTenantEnrollmentCommandAuthority(documentFor()),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_NOT_ENROLLED",
  );
  expectCode(
    () =>
      verifyPinnedIdentityMailTenantEnrollmentCommandAuthority(
        documentFor(),
        roots,
      ),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ARGUMENTS_INVALID",
  );
});

test("fixture-substituted pinned authority maps the exact frozen 52-column command", async () => {
  const fixtureNow = Date.now();
  const requestedAt = new Date(fixtureNow - 30_000).toISOString();
  const expiresAt = new Date(fixtureNow + 10 * 60_000).toISOString();
  const fixtureRoot = {
    ...root,
    notAfter: new Date(fixtureNow + 24 * 60 * 60_000).toISOString(),
    notBefore: new Date(fixtureNow - 24 * 60 * 60_000).toISOString(),
  };
  const document = documentFor("ROTATE", {
    envelopeOverrides: { expiresAt, requestedAt },
    proposalOverrides: { expiresAt, requestedAt },
  });
  const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), "leetplus-identity-mail-authority-pinned-"),
  );
  try {
    const moduleSource = await readFile(
      join(
        scriptsDirectory,
        "identity-mail-tenant-enrollment-authority.mjs",
      ),
      "utf8",
    );
    const registryPattern =
      /export const PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS =\r?\n  Object\.freeze\(\{\}\);/gu;
    assert.equal([...moduleSource.matchAll(registryPattern)].length, 1);
    const fixtureRegistry = `export const PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS =
  Object.freeze({ ${JSON.stringify(KEY_ID)}: Object.freeze(${JSON.stringify(fixtureRoot)}) });`;
    const fixtureModuleSource = moduleSource.replace(
      registryPattern,
      fixtureRegistry,
    );
    const fixtureModulePath = join(
      fixtureDirectory,
      "identity-mail-tenant-enrollment-authority.mjs",
    );
    await Promise.all([
      writeFile(fixtureModulePath, fixtureModuleSource, "utf8"),
      writeFile(
        join(fixtureDirectory, "staff-task-integrity-canonical-json.mjs"),
        await readFile(
          join(
            scriptsDirectory,
            "staff-task-integrity-canonical-json.mjs",
          ),
          "utf8",
        ),
        "utf8",
      ),
    ]);
    const fixtureModule = await import(pathToFileURL(fixtureModulePath).href);
    assert.equal(
      Object.isFrozen(
        fixtureModule.PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS,
      ),
      true,
    );

    const verified =
      fixtureModule.verifyPinnedIdentityMailTenantEnrollmentCommandAuthority(
        document,
      );
    assert.equal(
      fixtureModule.isVerifiedIdentityMailTenantEnrollmentCommandAuthority(
        verified,
      ),
      true,
    );
    assert.equal(
      fixtureModule.isVerifiedSyntheticIdentityMailTenantEnrollmentCommandAuthority(
        verified,
      ),
      false,
    );
    assert.equal(verified.verificationMode, "PINNED");
    assert.equal(Object.isFrozen(verified), true);

    const envelope = document.authorizationEnvelope;
    const previous = envelope.previousConfiguration;
    const target = envelope.targetConfiguration;
    const expectedArguments = {
      action: envelope.action,
      actorDigest: envelope.actorDigest,
      actualContextDigest: envelope.actualContextDigest,
      authorizationEnvelopeCanonicalJson: canonicalStringify(envelope),
      authorizationEnvelopeDigest: document.authorizationEnvelopeDigest,
      contractVersion: envelope.contract,
      databaseIdentityDigest: envelope.databaseIdentityDigest,
      deploymentMarkerDigest: envelope.deploymentMarkerDigest,
      deploymentMarkerId: envelope.deploymentMarkerId,
      drainStateRevision: envelope.drainStateRevision,
      expectedDatabaseName: envelope.expectedDatabaseName,
      expectedDatabaseOid: envelope.expectedDatabaseOid,
      expectedPolicyRevision: envelope.expectedPolicyRevision,
      expectedState: envelope.expectedState,
      expiresAt: envelope.expiresAt,
      finalStateRevision: envelope.finalStateRevision,
      id: envelope.commandId,
      intent: envelope.intent,
      nextPolicyRevision: envelope.nextPolicyRevision,
      previousAcknowledgeSeconds: previous.acknowledgeSeconds,
      previousBaseRetrySeconds: previous.baseRetrySeconds,
      previousConfigurationDigest: previous.configurationDigest,
      previousLeaseSeconds: previous.leaseSeconds,
      previousMaxAttempts: previous.maxAttempts,
      previousMaxRetrySeconds: previous.maxRetrySeconds,
      previousProviderAuthorityDigest: previous.providerAuthorityDigest,
      previousWorkerRoleName: previous.workerRoleName,
      previousWorkerRoleOid: previous.workerRoleOid,
      proposalCanonicalJson: canonicalStringify(document.proposal),
      proposalContentDigest: document.proposalContentDigest,
      publicKeyFingerprint: envelope.publicKeyFingerprint,
      releaseSha: envelope.releaseSha,
      requestId: envelope.requestId,
      requestedAt: envelope.requestedAt,
      rollbackOfCommandId: envelope.rollbackOfCommandId,
      runtimeConfigDigest: envelope.runtimeConfigDigest,
      signatureAlgorithm: envelope.signatureAlgorithm,
      signatureBase64url: document.signatureBase64url,
      signatureDomain: envelope.authorityDomain,
      signingKeyId: envelope.signingKeyId,
      stateRevisionBefore: envelope.stateRevisionBefore,
      targetAcknowledgeSeconds: target.acknowledgeSeconds,
      targetBaseRetrySeconds: target.baseRetrySeconds,
      targetConfigurationDigest: target.configurationDigest,
      targetLeaseSeconds: target.leaseSeconds,
      targetMaxAttempts: target.maxAttempts,
      targetMaxRetrySeconds: target.maxRetrySeconds,
      targetProviderAuthorityDigest: target.providerAuthorityDigest,
      targetState: envelope.targetState,
      targetWorkerRoleName: target.workerRoleName,
      targetWorkerRoleOid: target.workerRoleOid,
      tenantId: envelope.tenantId,
    };
    const databaseArguments =
      fixtureModule.identityMailTenantEnrollmentCommandDatabaseArguments(
        verified,
      );
    assert.equal(Object.keys(databaseArguments).length, 52);
    assert.equal(Object.keys(expectedArguments).length, 52);
    assert.deepEqual(databaseArguments, expectedArguments);
    assert.equal(Object.isFrozen(databaseArguments), true);
    assert.throws(() => {
      databaseArguments.id = ROLLBACK_COMMAND_ID;
    }, TypeError);
    expectCode(
      () =>
        fixtureModule.identityMailTenantEnrollmentCommandDatabaseArguments({
          ...verified,
        }),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_NOT_VERIFIED",
    );
  } finally {
    await rm(fixtureDirectory, { force: true, recursive: true });
  }
});

test("valid synthetic ENABLE is domain-separated, isolated, and non-persistable", () => {
  const document = documentFor();
  const canonicalEnvelope = canonicalStringify(document.authorizationEnvelope);
  const exactPayload = Buffer.from(
    `${IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOMAIN}\n${canonicalEnvelope}\n`,
    "utf8",
  );
  assert.equal(document.authorizationEnvelopeDigest, sha256(exactPayload));

  const verified = verify(document);
  assert.equal(
    isVerifiedIdentityMailTenantEnrollmentCommandAuthority(verified),
    false,
  );
  assert.equal(
    isVerifiedSyntheticIdentityMailTenantEnrollmentCommandAuthority(verified),
    true,
  );
  assert.equal(Object.isFrozen(verified), true);
  assert.equal(verified.verificationMode, "SYNTHETIC");
  assert.equal(verified.action, "ENABLE");
  expectCode(
    () => identityMailTenantEnrollmentCommandDatabaseArguments(verified),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_NOT_VERIFIED",
  );
  expectCode(
    () => identityMailTenantEnrollmentCommandDatabaseArguments({ ...verified }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_NOT_VERIFIED",
  );
});

test("valid ROTATE, DISABLE, and signed rollback linkage envelopes verify", () => {
  const rotate = verify(documentFor("ROTATE"));
  assert.equal(rotate.action, "ROTATE");
  const disable = verify(documentFor("DISABLE"));
  assert.equal(disable.action, "DISABLE");
  const rollback = verify(
    documentFor("ROTATE", {
      commandId: ROLLBACK_COMMAND_ID,
      intent: "ROLLBACK",
      rollbackOfCommandId: COMMAND_ID,
    }),
  );
  assert.equal(rollback.intent, "ROLLBACK");
  assert.equal(rollback.rollbackOfCommandId, COMMAND_ID);
});

test("document, envelope, nested configuration, accessor, and prototype attacks reject", () => {
  const document = documentFor();
  expectCode(
    () => verify({ ...document, unexpected: true }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOCUMENT_INVALID",
  );
  const missing = { ...document };
  delete missing.signatureBase64url;
  expectCode(
    () => verify(missing),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOCUMENT_INVALID",
  );
  const symbolDocument = { ...document };
  symbolDocument[Symbol("first")] = true;
  symbolDocument[Symbol("second")] = true;
  expectCode(
    () => verify(symbolDocument),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOCUMENT_INVALID",
  );

  const accessorEnvelope = { ...document.authorizationEnvelope };
  Object.defineProperty(accessorEnvelope, "actorDigest", {
    enumerable: true,
    get: () => ACTOR_DIGEST,
  });
  expectCode(
    () => verify({ ...document, authorizationEnvelope: accessorEnvelope }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ENVELOPE_INVALID",
  );

  const prototypeEnvelope = { ...document.authorizationEnvelope };
  Object.setPrototypeOf(prototypeEnvelope, { inherited: true });
  expectCode(
    () => verify({ ...document, authorizationEnvelope: prototypeEnvelope }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ENVELOPE_INVALID",
  );

  const targetWithExtra = {
    ...document.authorizationEnvelope.targetConfiguration,
    secret: "forbidden",
  };
  const nested = resignDocument(document.proposal, {
    ...document.authorizationEnvelope,
    targetConfiguration: targetWithExtra,
  });
  expectCode(
    () => verify(nested),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_CONFIGURATION_INVALID",
  );
});

test("synthetic verification requires exact loopback non-production CI context", () => {
  const document = documentFor();
  for (const context of [
    { ...syntheticContext, explicitConfirmation: "wrong" },
    { ...syntheticContext, hostname: "db.example.com" },
    { ...syntheticContext, hostname: "LOCALHOST" },
    { ...syntheticContext, databaseName: "leetplus" },
    { ...syntheticContext, databaseName: "prod_ci" },
    { ...syntheticContext, databaseName: "other_ci" },
    { ...syntheticContext, nodeEnv: "development" },
    { ...syntheticContext, nodeEnv: "production" },
  ]) {
    expectCode(
      () => verify(document, roots, context),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_SYNTHETIC_CONTEXT_DENIED",
    );
  }
  const accessor = { ...syntheticContext };
  Object.defineProperty(accessor, "hostname", {
    enumerable: true,
    get: () => "127.0.0.1",
  });
  expectCode(
    () => verify(document, roots, accessor),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_SYNTHETIC_CONTEXT_DENIED",
  );

  const activeNodeEnv = process.env.NODE_ENV;
  try {
    for (const ambientNodeEnv of [
      undefined,
      "development",
      "prod",
      "Production",
    ]) {
      if (ambientNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = ambientNodeEnv;
      }
      expectCode(
        () => verify(document),
        "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_SYNTHETIC_CONTEXT_DENIED",
      );
    }
  } finally {
    process.env.NODE_ENV = activeNodeEnv;
  }
});

test("root inheritance, accessors, purpose/profile/status/key/fingerprint and key type drift reject", () => {
  const document = documentFor();
  const inheritedRoots = Object.create({ [KEY_ID]: root });
  expectCode(
    () => verify(document, inheritedRoots),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS_INVALID",
  );

  const accessorRoots = {};
  Object.defineProperty(accessorRoots, KEY_ID, {
    enumerable: true,
    get: () => root,
  });
  expectCode(
    () => verify(document, accessorRoots),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS_INVALID",
  );

  for (const override of [
    { purpose: "SHARED_BETA_TENANT_ADMISSION" },
    { profile: "SHARED_BETA_ADMISSION_V1" },
    { status: "RETIRED" },
    { algorithm: "RSA" },
    { keyId: "different-key" },
    { publicKeyFingerprint: "9".repeat(64) },
  ]) {
    expectCode(
      () => verify(document, { [KEY_ID]: { ...root, ...override } }),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID",
    );
  }

  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey;
  const rsaPem = rsa.export({ type: "spki", format: "pem" });
  expectCode(
    () =>
      verify(document, {
        [KEY_ID]: {
          ...root,
          publicKeyFingerprint: sha256(
            createPublicKey(rsaPem).export({ type: "spki", format: "der" }),
          ),
          publicKeyPem: rsaPem,
        },
      }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID",
  );

  expectCode(
    () =>
      verify(document, {
        [KEY_ID]: {
          ...root,
          publicKeyPem: {
            toString() {
              throw new Error("must not coerce");
            },
          },
        },
      }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID",
  );
});

test("unknown signing key and fingerprint substitution reject after exact resigning", () => {
  const document = documentFor();
  const unknownKey = resignDocument(document.proposal, {
    ...document.authorizationEnvelope,
    signingKeyId: "identity-mail-tenant-enrollment-unknown",
  });
  expectCode(
    () => verify(unknownKey),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_KEY_NOT_TRUSTED",
  );
  const fingerprint = resignDocument(document.proposal, {
    ...document.authorizationEnvelope,
    publicKeyFingerprint: "8".repeat(64),
  });
  expectCode(
    () => verify(fingerprint),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_KEY_NOT_TRUSTED",
  );

  const coercionKey = {
    ...document,
    authorizationEnvelope: {
      ...document.authorizationEnvelope,
      signingKeyId: {
        toString() {
          throw new Error("must not coerce");
        },
      },
    },
  };
  expectCode(
    () => verify(coercionKey),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ENVELOPE_INVALID",
  );
});

test("signature, signature encoding, proposal digest, and envelope digest mutations reject", () => {
  const document = documentFor();
  const signature = Buffer.from(document.signatureBase64url, "base64url");
  signature[0] ^= 0xff;
  expectCode(
    () => verify({ ...document, signatureBase64url: signature.toString("base64url") }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_SIGNATURE_INVALID",
  );
  expectCode(
    () => verify({ ...document, signatureBase64url: `${document.signatureBase64url}=` }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_SIGNATURE_INVALID",
  );
  expectCode(
    () => verify({ ...document, proposalContentDigest: "7".repeat(64) }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PROPOSAL_DIGEST_INVALID",
  );
  expectCode(
    () => verify({ ...document, authorizationEnvelopeDigest: "7".repeat(64) }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ENVELOPE_DIGEST_INVALID",
  );
});

test("proposal, database, marker, release, actor, and target bindings reject even when resigned", () => {
  const base = documentFor();
  const cases = [
    resignDocument(
      { ...base.proposal, workerRoleOid: 16_386 },
      base.authorizationEnvelope,
    ),
    resignDocument(base.proposal, {
      ...base.authorizationEnvelope,
      deploymentMarkerDigest: "5".repeat(64),
    }),
    resignDocument(base.proposal, {
      ...base.authorizationEnvelope,
      expectedDatabaseOid: 16_386,
    }),
    resignDocument(base.proposal, {
      ...base.authorizationEnvelope,
      releaseSha: "6".repeat(40),
    }),
    resignDocument(base.proposal, {
      ...base.authorizationEnvelope,
      runtimeConfigDigest: "7".repeat(64),
    }),
  ];
  for (const candidate of cases) {
    expectCode(
      () => verify(candidate),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_BINDING_INVALID",
    );
  }

  const actor = resignDocument(base.proposal, {
    ...base.authorizationEnvelope,
    actorDigest: "8".repeat(64),
  });
  const verified = verify(actor);
  assert.equal(verified.verificationMode, "SYNTHETIC");
});

test("transition, revision, previous/target, disable, rotate, and rollback invariants reject", () => {
  const baseEnable = documentFor();
  const invalidTransition = resignDocument(baseEnable.proposal, {
    ...baseEnable.authorizationEnvelope,
    expectedState: "DRAINING",
  });
  expectCode(
    () => verify(invalidTransition),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_TRANSITION_INVALID",
  );

  const invalidRevision = documentFor("ROTATE", {
    stateOverrides: { finalStateRevision: 7 },
  });
  expectCode(
    () => verify(invalidRevision),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_REVISION_INVALID",
  );
  const postgresIntegerOverflow = documentFor("ROTATE", {
    stateOverrides: {
      drainStateRevision: 2_147_483_648,
      expectedPolicyRevision: 2_147_483_647,
      finalStateRevision: 2_147_483_649,
      nextPolicyRevision: 2_147_483_648,
      stateRevisionBefore: 2_147_483_647,
    },
  });
  expectCode(
    () => verify(postgresIntegerOverflow),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PROPOSAL_INVALID",
  );
  const unsafeBigintProjection = documentFor("ROTATE", {
    stateOverrides: {
      drainStateRevision: Number.MAX_SAFE_INTEGER + 1,
      finalStateRevision: Number.MAX_SAFE_INTEGER + 2,
      stateRevisionBefore: Number.MAX_SAFE_INTEGER,
    },
  });
  expectCode(
    () => verify(unsafeBigintProjection),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_REVISION_INVALID",
  );
  assert.equal(
    verify(
      documentFor("ROTATE", {
        stateOverrides: {
          drainStateRevision: 2_147_483_647,
          expectedPolicyRevision: 2_147_483_646,
          finalStateRevision: 2_147_483_648,
          nextPolicyRevision: 2_147_483_647,
          stateRevisionBefore: 2_147_483_646,
        },
      }),
    ).action,
    "ROTATE",
  );

  const absentPrevious = documentFor("ENABLE", {
    stateOverrides: { previousConfiguration: configuration() },
  });
  expectCode(
    () => verify(absentPrevious),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_REVISION_INVALID",
  );

  const disabledConfiguration = configuration();
  const enableFromDisabledState = {
    drainStateRevision: null,
    expectedPolicyRevision: 3,
    expectedState: "DISABLED",
    finalStateRevision: 5,
    nextPolicyRevision: 4,
    previousConfiguration: disabledConfiguration,
    stateRevisionBefore: 4,
    targetConfiguration: disabledConfiguration,
    targetState: "ACTIVE",
  };
  assert.equal(
    verify(
      documentFor("ENABLE", {
        stateOverrides: enableFromDisabledState,
      }),
    ).action,
    "ENABLE",
  );
  const enableFromDisabledWithConfigurationChange = documentFor("ENABLE", {
    stateOverrides: {
      ...enableFromDisabledState,
      targetConfiguration: configuration({
        configurationDigest: CONFIGURATION_B,
        providerAuthorityDigest: PROVIDER_B,
      }),
    },
  });
  expectCode(
    () => verify(enableFromDisabledWithConfigurationChange),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ENABLE_INVALID",
  );

  const disableDifferent = documentFor("DISABLE", {
    stateOverrides: {
      targetConfiguration: configuration({
        configurationDigest: CONFIGURATION_B,
        providerAuthorityDigest: PROVIDER_B,
      }),
    },
  });
  expectCode(
    () => verify(disableDifferent),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DISABLE_INVALID",
  );

  const rotateDigestOnly = documentFor("ROTATE", {
    stateOverrides: {
      targetConfiguration: configuration({
        configurationDigest: CONFIGURATION_B,
      }),
    },
  });
  expectCode(
    () => verify(rotateDigestOnly),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROTATION_INVALID",
  );

  const forwardWithRollback = documentFor("ENABLE", {
    rollbackOfCommandId: ROLLBACK_COMMAND_ID,
  });
  expectCode(
    () => verify(forwardWithRollback),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROLLBACK_INVALID",
  );
  const rollbackWithoutTarget = documentFor("ENABLE", {
    intent: "ROLLBACK",
  });
  expectCode(
    () => verify(rollbackWithoutTarget),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROLLBACK_INVALID",
  );
});

test("expired, future-issued, excessive, and root-outside timelines reject", () => {
  const timelineCases = [
    {
      expiresAt: "2026-08-01T10:04:59.999Z",
      requestedAt: "2026-08-01T09:55:00.000Z",
    },
    {
      expiresAt: "2026-08-01T10:20:00.000Z",
      requestedAt: "2026-08-01T10:10:00.001Z",
    },
    {
      expiresAt: "2026-08-01T10:16:00.001Z",
      requestedAt: "2026-08-01T10:00:00.000Z",
    },
  ];
  for (const timeline of timelineCases) {
    const document = documentFor("ENABLE", {
      envelopeOverrides: timeline,
      proposalOverrides: timeline,
    });
    expectCode(
      () => verify(document),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_TIMELINE_INVALID",
    );
  }

  expectCode(
    () =>
      verify(documentFor(), {
        [KEY_ID]: {
          ...root,
          notAfter: "2026-08-01T10:14:59.999Z",
        },
      }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_TIMELINE_INVALID",
  );
  expectCode(
    () =>
      verify(documentFor(), {
        [KEY_ID]: {
          ...root,
          notBefore: "2026-08-01T10:05:00.001Z",
        },
      }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_TIMELINE_INVALID",
  );
});
