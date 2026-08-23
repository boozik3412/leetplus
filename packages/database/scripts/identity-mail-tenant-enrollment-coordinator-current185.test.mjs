import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
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
  identityMailTenantEnrollmentAuthorityPublicKeyFingerprint,
  verifySyntheticIdentityMailTenantEnrollmentCommandAuthority,
} from "./identity-mail-tenant-enrollment-authority.mjs";
import {
  IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_CANDIDATE_STATUS,
  IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_CONTRACT,
  IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OWNER_OWNED_RPC_METHOD,
  IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_MAX_ATTEMPTS,
  IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OPERATION,
  IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_RECEIPT_DECISION,
  IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_RECEIPT_OPERATION,
  createIdentityMailTenantEnrollmentOwnerOwnedRpcCurrent185,
  importPinnedIdentityMailTenantEnrollmentCommandCurrent185,
} from "./identity-mail-tenant-enrollment-coordinator-current185.mjs";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
after(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
});

const SCRIPTS_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const KEY_ID = "identity-mail-tenant-enrollment-current185-ci-v1";
const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const COMMAND_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const MARKER_ID = "44444444-4444-4444-8444-444444444444";
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
const DATABASE_NAME = "leetplus_current185_ci";
const EXPECTED_DATABASE_ARGUMENT_KEYS = Object.freeze(
  [
    "action",
    "actorDigest",
    "actualContextDigest",
    "authorizationEnvelopeCanonicalJson",
    "authorizationEnvelopeDigest",
    "contractVersion",
    "databaseIdentityDigest",
    "deploymentMarkerDigest",
    "deploymentMarkerId",
    "drainStateRevision",
    "expectedDatabaseName",
    "expectedDatabaseOid",
    "expectedPolicyRevision",
    "expectedState",
    "expiresAt",
    "finalStateRevision",
    "id",
    "intent",
    "nextPolicyRevision",
    "previousAcknowledgeSeconds",
    "previousBaseRetrySeconds",
    "previousConfigurationDigest",
    "previousLeaseSeconds",
    "previousMaxAttempts",
    "previousMaxRetrySeconds",
    "previousProviderAuthorityDigest",
    "previousWorkerRoleName",
    "previousWorkerRoleOid",
    "proposalCanonicalJson",
    "proposalContentDigest",
    "publicKeyFingerprint",
    "releaseSha",
    "requestId",
    "requestedAt",
    "rollbackOfCommandId",
    "runtimeConfigDigest",
    "signatureAlgorithm",
    "signatureBase64url",
    "signatureDomain",
    "signingKeyId",
    "stateRevisionBefore",
    "targetAcknowledgeSeconds",
    "targetBaseRetrySeconds",
    "targetConfigurationDigest",
    "targetLeaseSeconds",
    "targetMaxAttempts",
    "targetMaxRetrySeconds",
    "targetProviderAuthorityDigest",
    "targetState",
    "targetWorkerRoleName",
    "targetWorkerRoleOid",
    "tenantId",
  ].sort(),
);

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
const publicKeyFingerprint =
  identityMailTenantEnrollmentAuthorityPublicKeyFingerprint(publicKey);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function policy() {
  return {
    acknowledgeSeconds: 60,
    baseRetrySeconds: 30,
    leaseSeconds: 120,
    maxAttempts: 5,
    maxRetrySeconds: 900,
  };
}

function configuration({
  configurationDigest = CONFIGURATION_A,
  providerAuthorityDigest = PROVIDER_A,
} = {}) {
  return {
    ...policy(),
    configurationDigest,
    providerAuthorityDigest,
    workerRoleName: "leetplus_identity_mail_worker",
    workerRoleOid: 16_384,
  };
}

function documentFor({ expiresAt, requestedAt }) {
  const previousConfiguration = configuration();
  const targetConfiguration = configuration({
    configurationDigest: CONFIGURATION_B,
    providerAuthorityDigest: PROVIDER_B,
  });
  const proposal = {
    action: "ROTATE",
    authorization: false,
    canMutate: false,
    contract: "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1",
    deploymentMarkerDigest: MARKER_DIGEST,
    expectedDatabaseName: DATABASE_NAME,
    expectedDatabaseOid: 16_385,
    expectedRevision: 3,
    expectedState: "ACTIVE",
    expiresAt,
    nextRevision: 4,
    policy: policy(),
    providerAuthorityDigest: PROVIDER_B,
    releaseSha: RELEASE_SHA,
    requestId: REQUEST_ID,
    requestedAt,
    runtimeConfigDigest: RUNTIME_DIGEST,
    tenantId: TENANT_ID,
    workerRoleName: targetConfiguration.workerRoleName,
    workerRoleOid: targetConfiguration.workerRoleOid,
  };
  const proposalContentDigest = sha256(
    Buffer.from(canonicalStringify(proposal), "utf8"),
  );
  const authorizationEnvelope = {
    action: "ROTATE",
    actorDigest: ACTOR_DIGEST,
    actualContextDigest: CONTEXT_DIGEST,
    authorityDomain: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOMAIN,
    authorization: true,
    canMutate: true,
    commandId: COMMAND_ID,
    contract: "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1",
    databaseIdentityDigest: DATABASE_DIGEST,
    deploymentMarkerDigest: MARKER_DIGEST,
    deploymentMarkerId: MARKER_ID,
    drainStateRevision: 5,
    expectedDatabaseName: DATABASE_NAME,
    expectedDatabaseOid: 16_385,
    expectedPolicyRevision: 3,
    expectedState: "ACTIVE",
    expiresAt,
    finalStateRevision: 6,
    intent: "FORWARD",
    nextPolicyRevision: 4,
    previousConfiguration,
    proposalContentDigest,
    publicKeyFingerprint,
    releaseSha: RELEASE_SHA,
    requestId: REQUEST_ID,
    requestedAt,
    rollbackOfCommandId: null,
    runtimeConfigDigest: RUNTIME_DIGEST,
    schemaVersion: 1,
    signatureAlgorithm: IDENTITY_MAIL_TENANT_ENROLLMENT_SIGNATURE_ALGORITHM,
    signingKeyId: KEY_ID,
    stateRevisionBefore: 4,
    targetConfiguration,
    targetState: "ACTIVE",
    tenantId: TENANT_ID,
  };
  const authorizationEnvelopeCanonicalJson = canonicalStringify(
    authorizationEnvelope,
  );
  const signedPayload = Buffer.from(
    `${IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOMAIN}\n${authorizationEnvelopeCanonicalJson}\n`,
    "utf8",
  );
  return {
    authorizationEnvelope,
    authorizationEnvelopeDigest: sha256(signedPayload),
    proposal,
    proposalContentDigest,
    signatureBase64url: sign(null, signedPayload, privateKey).toString(
      "base64url",
    ),
  };
}

async function createPinnedFixture() {
  const now = Date.now();
  const requestedAt = new Date(now - 30_000).toISOString();
  const expiresAt = new Date(now + 10 * 60_000).toISOString();
  const root = Object.freeze({
    algorithm: IDENTITY_MAIL_TENANT_ENROLLMENT_SIGNATURE_ALGORITHM,
    keyId: KEY_ID,
    notAfter: new Date(now + 24 * 60 * 60_000).toISOString(),
    notBefore: new Date(now - 24 * 60 * 60_000).toISOString(),
    profile: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PROFILE,
    publicKeyFingerprint,
    publicKeyPem,
    purpose: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PURPOSE,
    status: "ACTIVE",
  });
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), "leetplus-enrollment-current185-pinned-"),
  );
  const authoritySource = await readFile(
    join(SCRIPTS_DIRECTORY, "identity-mail-tenant-enrollment-authority.mjs"),
    "utf8",
  );
  const registryPattern =
    /export const PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS =\r?\n  Object\.freeze\(\{\}\);/gu;
  assert.equal([...authoritySource.matchAll(registryPattern)].length, 1);
  const fixtureRegistry = `export const PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS =
  Object.freeze({ ${JSON.stringify(KEY_ID)}: Object.freeze(${JSON.stringify(root)}) });`;
  const authorityPath = join(
    fixtureDirectory,
    "identity-mail-tenant-enrollment-authority.mjs",
  );
  const coordinatorPath = join(
    fixtureDirectory,
    "identity-mail-tenant-enrollment-coordinator-current185.mjs",
  );
  await Promise.all([
    writeFile(
      authorityPath,
      authoritySource.replace(registryPattern, fixtureRegistry),
      "utf8",
    ),
    writeFile(
      coordinatorPath,
      await readFile(
        join(
          SCRIPTS_DIRECTORY,
          "identity-mail-tenant-enrollment-coordinator-current185.mjs",
        ),
        "utf8",
      ),
      "utf8",
    ),
    writeFile(
      join(fixtureDirectory, "staff-task-integrity-canonical-json.mjs"),
      await readFile(
        join(SCRIPTS_DIRECTORY, "staff-task-integrity-canonical-json.mjs"),
        "utf8",
      ),
      "utf8",
    ),
  ]);
  const authority = await import(pathToFileURL(authorityPath).href);
  const coordinator = await import(pathToFileURL(coordinatorPath).href);
  const document = documentFor({ expiresAt, requestedAt });
  const verified =
    authority.verifyPinnedIdentityMailTenantEnrollmentCommandAuthority(
      document,
    );
  return {
    authority,
    coordinator,
    directory: fixtureDirectory,
    document,
    verified,
  };
}

const pinnedFixture = await createPinnedFixture();
after(async () => {
  await rm(pinnedFixture.directory, { force: true, recursive: true });
});

function gateway(coordinator, handler) {
  return coordinator.createIdentityMailTenantEnrollmentOwnerOwnedRpcCurrent185(
    handler,
  );
}

function receiptFor(coordinator, overrides = {}) {
  return {
    authorization: true,
    authorizationEnvelopeDigest:
      pinnedFixture.document.authorizationEnvelopeDigest,
    canMutate: true,
    candidateStatus:
      coordinator.IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_CANDIDATE_STATUS,
    commandId: COMMAND_ID,
    decision:
      coordinator.IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_RECEIPT_DECISION,
    operation:
      coordinator.IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_RECEIPT_OPERATION,
    replayed: false,
    requestId: REQUEST_ID,
    tenantId: TENANT_ID,
    ...overrides,
  };
}

async function captureRejection(operation) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  assert.fail("Expected operation to reject.");
}

test("CURRENT185 coordinator source has one allowlisted import and no production or runtime wiring", async () => {
  const source = await readFile(
    join(
      SCRIPTS_DIRECTORY,
      "identity-mail-tenant-enrollment-coordinator-current185.mjs",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /-----BEGIN PUBLIC KEY-----/u);
  assert.doesNotMatch(
    source,
    /PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS/u,
  );
  assert.equal([...source.matchAll(/^\s*import\b/gmu)].length, 1);
  assert.match(
    source,
    /^import \{ identityMailTenantEnrollmentCommandDatabaseArguments \} from "\.\/identity-mail-tenant-enrollment-authority\.mjs";$/mu,
  );
  assert.doesNotMatch(source, /\b(?:grant|revoke)\b/iu);
  assert.doesNotMatch(source, /DATABASE_URL|process\./u);
  assert.doesNotMatch(
    source,
    /@prisma|PrismaClient|@nestjs|node:https?|\bimport\s*\(|\bfetch\s*\(|from\s+["'](?:axios|got|knex|pg|postgres)["']/u,
  );
});

test("CURRENT185 contract fixes one owner-only method and one exact retry", () => {
  assert.equal(
    IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_CONTRACT,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_V1",
  );
  assert.equal(
    IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OPERATION,
    "ACCEPT_VERIFIED_IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_CURRENT185",
  );
  assert.equal(
    IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OWNER_OWNED_RPC_METHOD,
    "acceptVerifiedIdentityMailTenantEnrollmentCommand",
  );
  assert.equal(
    IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_MAX_ATTEMPTS,
    2,
  );
  assert.equal(
    IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_RECEIPT_OPERATION,
    "ACCEPT_IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND",
  );
  assert.equal(
    IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_RECEIPT_DECISION,
    "ACCEPTED",
  );
  assert.equal(
    IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_CANDIDATE_STATUS,
    "NOT_DEPLOYABLE",
  );
  const handler = () => undefined;
  const capability =
    createIdentityMailTenantEnrollmentOwnerOwnedRpcCurrent185(handler);
  assert.equal(Object.isFrozen(capability), true);
  assert.deepEqual(Reflect.ownKeys(capability), [
    IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OWNER_OWNED_RPC_METHOD,
  ]);
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(
      capability,
      IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OWNER_OWNED_RPC_METHOD,
    ),
    {
      configurable: false,
      enumerable: true,
      value: handler,
      writable: false,
    },
  );
});

test("plain, null, and structurally forged authorities fail before the gateway is observed", async () => {
  let gatewayObserved = false;
  const untrustedGateway = {};
  Object.defineProperty(
    untrustedGateway,
    "acceptVerifiedIdentityMailTenantEnrollmentCommand",
    {
      get() {
        gatewayObserved = true;
        return () => undefined;
      },
    },
  );
  for (const authority of [null, {}, { verificationMode: "PINNED" }]) {
    const error = await captureRejection(() =>
      importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
        authority,
        untrustedGateway,
      ),
    );
    assert.equal(
      error?.code,
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_NOT_VERIFIED",
    );
  }
  assert.equal(gatewayObserved, false);
});

test("clones and prototype forgeries of a pinned result fail closed", async () => {
  const { coordinator, verified } = pinnedFixture;
  let calls = 0;
  const ownerGateway = gateway(coordinator, () => {
    calls += 1;
  });
  const candidates = [
    { ...verified },
    Object.assign(Object.create(Object.getPrototypeOf(verified)), verified),
  ];
  for (const candidate of candidates) {
    const error = await captureRejection(() =>
      coordinator.importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
        candidate,
        ownerGateway,
      ),
    );
    assert.equal(
      error?.code,
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_NOT_VERIFIED",
    );
  }
  assert.equal(calls, 0);
});

test("a valid synthetic authority is non-persistable through CURRENT185", async () => {
  const now = new Date("2026-08-02T10:05:00.000Z");
  const requestedAt = "2026-08-02T10:00:00.000Z";
  const expiresAt = "2026-08-02T10:15:00.000Z";
  const document = documentFor({ expiresAt, requestedAt });
  const syntheticRoot = Object.freeze({
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
  const synthetic = verifySyntheticIdentityMailTenantEnrollmentCommandAuthority(
    document,
    Object.freeze({ [KEY_ID]: syntheticRoot }),
    Object.freeze({
      databaseName: DATABASE_NAME,
      explicitConfirmation:
        IDENTITY_MAIL_TENANT_ENROLLMENT_SYNTHETIC_CONFIRMATION,
      hostname: "127.0.0.1",
      nodeEnv: "test",
    }),
    now,
  );
  let calls = 0;
  const error = await captureRejection(() =>
    importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
      synthetic,
      createIdentityMailTenantEnrollmentOwnerOwnedRpcCurrent185(() => {
        calls += 1;
      }),
    ),
  );
  assert.equal(
    error?.code,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_NOT_VERIFIED",
  );
  assert.equal(calls, 0);
});

test("the pinned bridge emits one exact frozen request containing the frozen 52-column mapping", async () => {
  const { authority, coordinator, document, verified } = pinnedFixture;
  const expectedDatabaseArguments =
    authority.identityMailTenantEnrollmentCommandDatabaseArguments(verified);
  let receiver;
  let receivedThis;
  let rawReceipt;
  const ownerGateway = gateway(coordinator, function accept(request) {
    receiver = request;
    receivedThis = this;
    rawReceipt = receiptFor(coordinator);
    return rawReceipt;
  });
  const receipt =
    await coordinator.importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
      verified,
      ownerGateway,
    );

  assert.equal(receivedThis, ownerGateway);
  assert.notEqual(receipt, rawReceipt);
  assert.deepEqual(receipt, rawReceipt);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(
    coordinator.isVerifiedIdentityMailTenantEnrollmentCoordinatorCurrent185Receipt(
      receipt,
    ),
    true,
  );
  assert.equal(
    coordinator.isVerifiedIdentityMailTenantEnrollmentCoordinatorCurrent185Receipt(
      { ...receipt },
    ),
    false,
  );
  assert.equal(Object.isFrozen(receiver), true);
  assert.equal(Object.isFrozen(receiver.databaseArguments), true);
  assert.equal(receiver.databaseArguments, expectedDatabaseArguments);
  assert.equal(EXPECTED_DATABASE_ARGUMENT_KEYS.length, 52);
  assert.deepEqual(
    Object.keys(receiver.databaseArguments).sort(),
    EXPECTED_DATABASE_ARGUMENT_KEYS,
  );
  assert.deepEqual(Object.keys(receiver).sort(), [
    "authorizationEnvelopeDigest",
    "commandId",
    "contract",
    "databaseArguments",
    "operation",
    "operationId",
    "requestId",
    "tenantId",
  ]);
  assert.equal(
    receiver.contract,
    coordinator.IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_CONTRACT,
  );
  assert.equal(
    receiver.operation,
    coordinator.IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OPERATION,
  );
  assert.equal(receiver.operationId, COMMAND_ID);
  assert.equal(receiver.commandId, COMMAND_ID);
  assert.equal(receiver.requestId, REQUEST_ID);
  assert.equal(receiver.tenantId, TENANT_ID);
  assert.equal(
    receiver.authorizationEnvelopeDigest,
    document.authorizationEnvelopeDigest,
  );
  assert.throws(() => {
    receiver.commandId = "99999999-9999-4999-8999-999999999999";
  }, TypeError);
});

test("null, plain-unstructured, accessor, extra-key, and mismatched gateway receipts fail closed", async () => {
  const { coordinator, verified } = pinnedFixture;
  let accessorObserved = false;
  const accessorReceipt = receiptFor(coordinator);
  Object.defineProperty(accessorReceipt, "decision", {
    enumerable: true,
    get() {
      accessorObserved = true;
      return "ACCEPTED";
    },
  });
  class ReceiptClass {
    constructor() {
      Object.assign(this, receiptFor(coordinator));
    }
  }
  const candidates = [
    null,
    {},
    [],
    new ReceiptClass(),
    accessorReceipt,
    { ...receiptFor(coordinator), extra: "not-exact" },
    Object.fromEntries(
      Object.entries(receiptFor(coordinator)).filter(
        ([key]) => key !== "requestId",
      ),
    ),
    receiptFor(coordinator, { operation: "OTHER_OPERATION" }),
    receiptFor(coordinator, { decision: "REPLAYED" }),
    receiptFor(coordinator, { candidateStatus: "DEPLOYABLE" }),
    receiptFor(coordinator, {
      commandId: "99999999-9999-4999-8999-999999999999",
    }),
    receiptFor(coordinator, {
      requestId: "99999999-9999-4999-8999-999999999999",
    }),
    receiptFor(coordinator, {
      tenantId: "99999999-9999-4999-8999-999999999999",
    }),
    receiptFor(coordinator, {
      authorizationEnvelopeDigest: "9".repeat(64),
    }),
    receiptFor(coordinator, { replayed: "false" }),
    receiptFor(coordinator, { authorization: false }),
    receiptFor(coordinator, { canMutate: false }),
  ];

  for (const candidate of candidates) {
    let calls = 0;
    const error = await captureRejection(() =>
      coordinator.importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
        verified,
        gateway(coordinator, () => {
          calls += 1;
          return candidate;
        }),
      ),
    );
    assert.equal(
      error?.code,
      "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_GATEWAY_RECEIPT_INVALID",
    );
    assert.equal(calls, 1);
  }
  assert.equal(accessorObserved, false);
});

test("a hostile receipt proxy is converted to a fail-closed validation error", async () => {
  const { coordinator, verified } = pinnedFixture;
  const hostileReceipt = new Proxy(receiptFor(coordinator), {
    ownKeys() {
      throw new Error("hostile ownKeys trap");
    },
  });
  const error = await captureRejection(() =>
    coordinator.importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
      verified,
      gateway(coordinator, () => hostileReceipt),
    ),
  );
  assert.equal(
    error?.code,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_GATEWAY_RECEIPT_INVALID",
  );
});

test("argument-count and gateway capability checks fail closed", async () => {
  const { coordinator, verified } = pinnedFixture;
  const missingArgumentError = await captureRejection(() =>
    coordinator.importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
      verified,
    ),
  );
  assert.equal(
    missingArgumentError?.code,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_ARGUMENTS_INVALID",
  );
  let error = await captureRejection(() =>
    coordinator.importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
      verified,
      gateway(coordinator, () => receiptFor(coordinator)),
      "unexpected-third-argument",
    ),
  );
  assert.equal(
    error?.code,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_ARGUMENTS_INVALID",
  );

  for (const create of [
    () => coordinator.createIdentityMailTenantEnrollmentOwnerOwnedRpcCurrent185(),
    () =>
      coordinator.createIdentityMailTenantEnrollmentOwnerOwnedRpcCurrent185(
        1,
      ),
    () =>
      coordinator.createIdentityMailTenantEnrollmentOwnerOwnedRpcCurrent185(
        () => undefined,
        "unexpected-second-argument",
      ),
  ]) {
    assert.throws(
      create,
      (factoryError) =>
        factoryError?.code ===
        "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_GATEWAY_INVALID",
    );
  }

  let accessorObserved = false;
  const accessorCapability = {};
  Object.defineProperty(
    accessorCapability,
    IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OWNER_OWNED_RPC_METHOD,
    {
      enumerable: true,
      get() {
        accessorObserved = true;
        return () => receiptFor(coordinator);
      },
    },
  );
  const inheritedCapability = Object.create({
    [IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OWNER_OWNED_RPC_METHOD]:
      () => receiptFor(coordinator),
  });
  const extraCapability = {
    [IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OWNER_OWNED_RPC_METHOD]:
      () => receiptFor(coordinator),
    extra: true,
  };
  const symbolCapability = {
    [IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OWNER_OWNED_RPC_METHOD]:
      () => receiptFor(coordinator),
    [Symbol("extra")]: true,
  };
  let proxyObserved = false;
  const proxiedBrandedCapability = new Proxy(
    gateway(coordinator, () => receiptFor(coordinator)),
    {
      get() {
        proxyObserved = true;
        throw new Error("gateway get trap must not run");
      },
      ownKeys() {
        proxyObserved = true;
        throw new Error("gateway ownKeys trap must not run");
      },
    },
  );
  const otherModuleBrandedCapability =
    createIdentityMailTenantEnrollmentOwnerOwnedRpcCurrent185(() =>
      receiptFor(coordinator),
    );
  for (const candidate of [
    null,
    {},
    { acceptVerifiedIdentityMailTenantEnrollmentCommand: 1 },
    inheritedCapability,
    accessorCapability,
    extraCapability,
    symbolCapability,
    proxiedBrandedCapability,
    otherModuleBrandedCapability,
  ]) {
    error = await captureRejection(() =>
      coordinator.importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
        verified,
        candidate,
      ),
    );
    assert.equal(
      error?.code,
      "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_GATEWAY_INVALID",
    );
  }
  assert.equal(accessorObserved, false);
  assert.equal(proxyObserved, false);
});

test("a known gateway failure is returned unchanged and is never retried", async () => {
  const { coordinator, verified } = pinnedFixture;
  const knownFailure = new Error("known database rejection");
  let calls = 0;
  const error = await captureRejection(() =>
    coordinator.importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
      verified,
      gateway(coordinator, () => {
        calls += 1;
        throw knownFailure;
      }),
    ),
  );
  assert.equal(error, knownFailure);
  assert.equal(calls, 1);
});

test("a plain object mimicking lost-response metadata is not retryable", async () => {
  const { coordinator, verified } = pinnedFixture;
  const forgedLostResponse = {
    code: "IDENTITY_MAIL_TENANT_ENROLLMENT_OWNER_GATEWAY_RESPONSE_LOST",
  };
  let calls = 0;
  const error = await captureRejection(() =>
    coordinator.importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
      verified,
      gateway(coordinator, () => {
        calls += 1;
        throw forgedLostResponse;
      }),
    ),
  );
  assert.equal(error, forgedLostResponse);
  assert.equal(calls, 1);
});

test("lost response retries once with the identical operation and command object", async () => {
  const { coordinator, verified } = pinnedFixture;
  const calls = [];
  const rawReceipt = receiptFor(coordinator, { replayed: true });
  const result =
    await coordinator.importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
      verified,
      gateway(coordinator, (request) => {
        calls.push(request);
        if (calls.length === 1) {
          throw new coordinator.IdentityMailTenantEnrollmentOwnerOwnedRpcLostResponseError(
            new Error("socket closed after commit"),
          );
        }
        return rawReceipt;
      }),
    );
  assert.notEqual(result, rawReceipt);
  assert.deepEqual(result, rawReceipt);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(
    coordinator.isVerifiedIdentityMailTenantEnrollmentCoordinatorCurrent185Receipt(
      result,
    ),
    true,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1]);
  assert.equal(calls[0].databaseArguments, calls[1].databaseArguments);
  assert.equal(calls[0].operationId, COMMAND_ID);
  assert.equal(calls[0].commandId, COMMAND_ID);
  assert.equal(calls[0].requestId, REQUEST_ID);
});

for (const secondOutcome of ["lost", "known"]) {
  test(`a lost response followed by ${secondOutcome} failure becomes an exact two-attempt ambiguous outcome`, async () => {
    const { coordinator, verified } = pinnedFixture;
    const requests = [];
    const secondFailure =
      secondOutcome === "lost"
        ? new coordinator.IdentityMailTenantEnrollmentOwnerOwnedRpcLostResponseError(
            new Error("second socket close"),
          )
        : new Error("known-looking rejection after ambiguous commit");
    const firstFailure =
      new coordinator.IdentityMailTenantEnrollmentOwnerOwnedRpcLostResponseError(
        new Error("first socket close"),
      );
    const error = await captureRejection(() =>
      coordinator.importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
        verified,
        gateway(coordinator, (request) => {
          requests.push(request);
          if (requests.length === 1) throw firstFailure;
          throw secondFailure;
        }),
      ),
    );
    assert.equal(
      error instanceof
        coordinator.IdentityMailTenantEnrollmentCoordinatorCurrent185AmbiguousOutcomeError,
      true,
    );
    assert.equal(
      error.code,
      "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OUTCOME_AMBIGUOUS",
    );
    assert.equal(error.attempts, 2);
    assert.equal(error.cause, secondFailure);
    assert.equal(error.firstLostResponse, firstFailure);
    assert.equal(Object.keys(error).includes("firstLostResponse"), false);
    assert.equal(Object.isFrozen(error.operationIdentity), true);
    assert.deepEqual(error.operationIdentity, {
      authorizationEnvelopeDigest:
        pinnedFixture.document.authorizationEnvelopeDigest,
      commandId: COMMAND_ID,
      operation:
        coordinator.IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OPERATION,
      operationId: COMMAND_ID,
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
    });
    assert.equal(requests.length, 2);
    assert.equal(requests[0], requests[1]);
    assert.equal("signatureBase64url" in error.operationIdentity, false);
    assert.equal("databaseArguments" in error.operationIdentity, false);
  });
}
