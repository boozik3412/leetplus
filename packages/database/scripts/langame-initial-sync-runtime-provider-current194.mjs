import { types as utilTypes } from "node:util";

import { isVerifiedLangameInitialSyncRuntimeAttestationCurrent193 } from "./langame-initial-sync-runtime-attestation-current193.mjs";

export const LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_CONTRACT =
  "LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_V1";
export const LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_TEST_CONFIRMATION =
  "open-langame-current194-runtime-provider-on-loopback-ci";

const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u;
const CLAIM_KEYS = Object.freeze(
  [
    "actorUserId",
    "approvalId",
    "claimRequestDigest",
    "claimRequestId",
    "claimToken",
    "executionId",
    "planDigest",
    "tenantId",
  ].sort(),
);
const EXECUTE_KEYS = Object.freeze(
  [
    "actorUserId",
    "canonicalPlan",
    "claimToken",
    "executionId",
    "executionRequestDigest",
    "executionRequestId",
    "tenantId",
  ].sort(),
);
const RECONCILE_KEYS = Object.freeze(
  ["claimToken", "executionId", "planDigest", "tenantId"].sort(),
);
const REQUEST_KEYS = Object.freeze(
  [
    "consumeRequestDigest",
    "consumeRequestId",
    "registerRequestDigest",
    "registerRequestId",
  ].sort(),
);
const OWNER_DRIVER_KEYS = Object.freeze(["registerCurrent194"]);
const RUNTIME_DRIVER_KEYS = Object.freeze([
  "claimCurrent192",
  "close",
  "consumeCurrent194",
  "executeCurrent192",
  "reconcileCurrent192",
]);
const REGISTER_ROW_KEYS = Object.freeze(
  ["attestationId", "payloadDigest", "replayed", "status", "validUntil"].sort(),
);
const CONSUME_ROW_KEYS = Object.freeze(
  ["attestationId", "consumedAt", "replayed", "status", "validUntil"].sort(),
);
const USED_ATTESTATIONS = new WeakSet();
const BRANDED_SESSIONS = new WeakSet();

export class LangameInitialSyncRuntimeProviderCurrent194Error extends Error {
  constructor(code) {
    super("CURRENT194 Langame runtime provider rejected the operation.");
    this.name = "LangameInitialSyncRuntimeProviderCurrent194Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameInitialSyncRuntimeProviderCurrent194Error(code);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactRecord(value, expectedKeys, code) {
  let invalid;
  try {
    invalid =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value);
  } catch {
    fail(code);
  }
  if (invalid) fail(code);
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(code);
  }
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) fail(code);
  keys.sort(compareStrings);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
      );
    })
  ) {
    fail(code);
  }
  const result = Object.create(null);
  for (const key of expectedKeys) result[key] = descriptors[key].value;
  return Object.freeze(result);
}

function exactDriver(value, expectedKeys, code) {
  const driver = exactRecord(value, expectedKeys, code);
  if (expectedKeys.some((key) => typeof driver[key] !== "function")) fail(code);
  return driver;
}

function exactSingleRow(value, expectedKeys, code) {
  if (!Array.isArray(value) || value.length !== 1) fail(code);
  return exactRecord(value[0], expectedKeys, code);
}

function requests(value) {
  const request = exactRecord(
    value,
    REQUEST_KEYS,
    "CURRENT194_PROVIDER_REQUEST_INVALID",
  );
  if (
    !ID_PATTERN.test(request.registerRequestId) ||
    !SHA256_PATTERN.test(request.registerRequestDigest) ||
    !ID_PATTERN.test(request.consumeRequestId) ||
    !SHA256_PATTERN.test(request.consumeRequestDigest) ||
    request.registerRequestId === request.consumeRequestId ||
    request.registerRequestDigest === request.consumeRequestDigest
  ) {
    fail("CURRENT194_PROVIDER_REQUEST_INVALID");
  }
  return request;
}

function current192Claim(value) {
  const input = exactRecord(
    value,
    CLAIM_KEYS,
    "CURRENT194_PROVIDER_CLAIM_INPUT_INVALID",
  );
  if (
    !ID_PATTERN.test(input.executionId) ||
    !ID_PATTERN.test(input.tenantId) ||
    !ID_PATTERN.test(input.actorUserId) ||
    !ID_PATTERN.test(input.approvalId) ||
    !ID_PATTERN.test(input.claimRequestId) ||
    !SHA256_PATTERN.test(input.claimRequestDigest) ||
    !TOKEN_PATTERN.test(input.claimToken) ||
    !SHA256_PATTERN.test(input.planDigest)
  ) {
    fail("CURRENT194_PROVIDER_CLAIM_INPUT_INVALID");
  }
  return input;
}

function current192Execute(value) {
  const input = exactRecord(
    value,
    EXECUTE_KEYS,
    "CURRENT194_PROVIDER_EXECUTE_INPUT_INVALID",
  );
  if (
    !ID_PATTERN.test(input.tenantId) ||
    !ID_PATTERN.test(input.actorUserId) ||
    !ID_PATTERN.test(input.executionId) ||
    !TOKEN_PATTERN.test(input.claimToken) ||
    !ID_PATTERN.test(input.executionRequestId) ||
    !SHA256_PATTERN.test(input.executionRequestDigest) ||
    typeof input.canonicalPlan !== "string" ||
    input.canonicalPlan.length < 2 ||
    input.canonicalPlan.length > 10_000_000
  ) {
    fail("CURRENT194_PROVIDER_EXECUTE_INPUT_INVALID");
  }
  return input;
}

function current192Reconcile(value) {
  const input = exactRecord(
    value,
    RECONCILE_KEYS,
    "CURRENT194_PROVIDER_RECONCILE_INPUT_INVALID",
  );
  if (
    !ID_PATTERN.test(input.tenantId) ||
    !ID_PATTERN.test(input.executionId) ||
    !TOKEN_PATTERN.test(input.claimToken) ||
    !SHA256_PATTERN.test(input.planDigest)
  ) {
    fail("CURRENT194_PROVIDER_RECONCILE_INPUT_INVALID");
  }
  return input;
}

function verifiedAttestation(value, mode) {
  if (
    !isVerifiedLangameInitialSyncRuntimeAttestationCurrent193(value) ||
    value.verificationMode !== mode ||
    !ID_PATTERN.test(value.attestationId) ||
    !SHA256_PATTERN.test(value.payloadDigest) ||
    !SHA256_PATTERN.test(value.catalogReceiptDigest) ||
    !SHA256_PATTERN.test(value.planDigest) ||
    !SHA256_PATTERN.test(value.current192MigrationSha256) ||
    !SHA256_PATTERN.test(value.publicKeyFingerprint) ||
    !RELEASE_SHA_PATTERN.test(value.releaseSha) ||
    typeof value.schemaOwnerRoleName !== "string" ||
    !Number.isInteger(value.schemaOwnerRoleOid)
  ) {
    fail("CURRENT194_PROVIDER_ATTESTATION_INVALID");
  }
  if (USED_ATTESTATIONS.has(value)) {
    fail("CURRENT194_PROVIDER_ATTESTATION_ALREADY_USED");
  }
  USED_ATTESTATIONS.add(value);
  return value;
}

async function exactRetry(effect, code) {
  try {
    return await effect();
  } catch {
    try {
      return await effect();
    } catch {
      fail(code);
    }
  }
}

function registerSpec(attestation, request) {
  return Object.freeze({
    contract: LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_CONTRACT,
    attestationId: attestation.attestationId,
    registerRequestId: request.registerRequestId,
    registerRequestDigest: request.registerRequestDigest,
    payloadDigest: attestation.payloadDigest,
    catalogReceiptDigest: attestation.catalogReceiptDigest,
    planDigest: attestation.planDigest,
    releaseSha: attestation.releaseSha,
    current192MigrationSha256: attestation.current192MigrationSha256,
    databaseName: attestation.databaseName,
    databaseOid: attestation.databaseOid,
    executorRoleName: attestation.executorRoleName,
    executorRoleOid: attestation.executorRoleOid,
    schemaOwnerRoleName: attestation.schemaOwnerRoleName,
    schemaOwnerRoleOid: attestation.schemaOwnerRoleOid,
    signingKeyId: attestation.signingKeyId,
    publicKeyFingerprint: attestation.publicKeyFingerprint,
    issuedAt: attestation.issuedAt,
    validUntil: attestation.validUntil,
  });
}

function consumeSpec(attestation, request) {
  return Object.freeze({
    contract: LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_CONTRACT,
    attestationId: attestation.attestationId,
    expectedPayloadDigest: attestation.payloadDigest,
    expectedCatalogReceiptDigest: attestation.catalogReceiptDigest,
    expectedReleaseSha: attestation.releaseSha,
    consumeRequestId: request.consumeRequestId,
    consumeRequestDigest: request.consumeRequestDigest,
  });
}

function assertRegisterRow(value, attestation) {
  const row = exactSingleRow(
    value,
    REGISTER_ROW_KEYS,
    "CURRENT194_PROVIDER_REGISTER_RECEIPT_INVALID",
  );
  if (
    row.attestationId !== attestation.attestationId ||
    row.payloadDigest !== attestation.payloadDigest ||
    !(row.validUntil instanceof Date) ||
    row.validUntil.toISOString() !== attestation.validUntil ||
    typeof row.replayed !== "boolean" ||
    !["ACTIVE", "CONSUMED", "REVOKED", "EXPIRED"].includes(row.status)
  ) {
    fail("CURRENT194_PROVIDER_REGISTER_RECEIPT_INVALID");
  }
  return row;
}

function assertConsumeRow(value, attestation) {
  const row = exactSingleRow(
    value,
    CONSUME_ROW_KEYS,
    "CURRENT194_PROVIDER_CONSUME_RECEIPT_INVALID",
  );
  if (
    row.attestationId !== attestation.attestationId ||
    row.status !== "CONSUMED" ||
    !(row.consumedAt instanceof Date) ||
    !(row.validUntil instanceof Date) ||
    row.validUntil.toISOString() !== attestation.validUntil ||
    typeof row.replayed !== "boolean"
  ) {
    fail("CURRENT194_PROVIDER_CONSUME_RECEIPT_INVALID");
  }
  return row;
}

async function openInternal(
  attestationValue,
  requestValue,
  ownerValue,
  runtimeValue,
) {
  const request = requests(requestValue);
  const owner = exactDriver(
    ownerValue,
    OWNER_DRIVER_KEYS,
    "CURRENT194_PROVIDER_OWNER_DRIVER_INVALID",
  );
  const runtime = exactDriver(
    runtimeValue,
    RUNTIME_DRIVER_KEYS,
    "CURRENT194_PROVIDER_RUNTIME_DRIVER_INVALID",
  );
  const attestation = verifiedAttestation(attestationValue, "SYNTHETIC_CI");
  let handedOff = false;
  try {
    const registration = registerSpec(attestation, request);
    assertRegisterRow(
      await exactRetry(
        () => owner.registerCurrent194(registration),
        "CURRENT194_PROVIDER_REGISTER_RESPONSE_AMBIGUOUS",
      ),
      attestation,
    );
    const consumption = consumeSpec(attestation, request);
    const consumed = assertConsumeRow(
      await exactRetry(
        () => runtime.consumeCurrent194(consumption),
        "CURRENT194_PROVIDER_CONSUME_RESPONSE_AMBIGUOUS",
      ),
      attestation,
    );
    const session = createSession(runtime, attestation, consumed);
    handedOff = true;
    return session;
  } finally {
    if (!handedOff) {
      await runtime.close().catch(() => undefined);
    }
  }
}

function createSession(runtime, attestation, consumed) {
  let state = "ACTIVE";
  let inFlight = 0;
  let drainPromise = null;
  let resolveZero = null;

  const session = Object.freeze({
    async claimCurrent192(value) {
      if (arguments.length !== 1 || state !== "ACTIVE") {
        fail("CURRENT194_PROVIDER_SESSION_NOT_ACTIVE");
      }
      return invoke(() => runtime.claimCurrent192(current192Claim(value)));
    },
    async executeCurrent192(value) {
      if (arguments.length !== 1 || state !== "ACTIVE") {
        fail("CURRENT194_PROVIDER_SESSION_NOT_ACTIVE");
      }
      return invoke(() => runtime.executeCurrent192(current192Execute(value)));
    },
    async reconcileCurrent192(value) {
      if (arguments.length !== 1 || state !== "ACTIVE") {
        fail("CURRENT194_PROVIDER_SESSION_NOT_ACTIVE");
      }
      return invoke(() =>
        runtime.reconcileCurrent192(current192Reconcile(value)),
      );
    },
    drain() {
      if (arguments.length !== 0) fail("CURRENT194_PROVIDER_DRAIN_INVALID");
      if (drainPromise) return drainPromise;
      state = "DRAINING";
      drainPromise = (async () => {
        if (inFlight !== 0) {
          await new Promise((resolve) => {
            resolveZero = resolve;
          });
        }
        try {
          await runtime.close();
        } finally {
          state = "CLOSED";
        }
      })();
      return drainPromise;
    },
    snapshot() {
      if (arguments.length !== 0) fail("CURRENT194_PROVIDER_SNAPSHOT_INVALID");
      return Object.freeze({
        contract: LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_CONTRACT,
        attestationId: attestation.attestationId,
        consumedAt: consumed.consumedAt.toISOString(),
        consumeReplayed: consumed.replayed,
        inFlight,
        state,
        authorization: false,
        productionExecutionAllowed: false,
      });
    },
  });

  async function invoke(effect) {
    inFlight += 1;
    try {
      return await effect();
    } finally {
      inFlight -= 1;
      if (inFlight === 0 && resolveZero) {
        const resolve = resolveZero;
        resolveZero = null;
        resolve();
      }
    }
  }
  BRANDED_SESSIONS.add(session);
  return session;
}

export async function openLangameInitialSyncRuntimeProviderCurrent194() {
  fail("CURRENT194_PROVIDER_PRODUCTION_DENIED");
}

export async function openSyntheticLangameInitialSyncRuntimeProviderCurrent194(
  attestation,
  request,
  ownerDriver,
  runtimeDriver,
  explicitConfirmation,
) {
  if (
    arguments.length !== 5 ||
    explicitConfirmation !==
      LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_TEST_CONFIRMATION
  ) {
    fail("CURRENT194_PROVIDER_SYNTHETIC_DENIED");
  }
  return openInternal(attestation, request, ownerDriver, runtimeDriver);
}

export function isLangameInitialSyncRuntimeProviderCurrent194(value) {
  return (
    value !== null && typeof value === "object" && BRANDED_SESSIONS.has(value)
  );
}
