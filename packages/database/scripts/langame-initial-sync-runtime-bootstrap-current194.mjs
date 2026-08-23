import { types as utilTypes } from "node:util";

import { verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193 } from "./langame-initial-sync-runtime-attestation-current193.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONFIRMATION,
  LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_RECOVERY_CONFIRMATION,
  createSyntheticLangameInitialSyncRuntimePrismaCurrent194,
  createSyntheticLangameInitialSyncRuntimeRevokeRecoveryCurrent194,
  isLangameInitialSyncRuntimePrismaCurrent194,
  isLangameInitialSyncRuntimeRevokeRecoveryCurrent194,
} from "./langame-initial-sync-runtime-prisma-current194.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_TEST_CONFIRMATION,
  isLangameInitialSyncRuntimeProviderCurrent194,
  openSyntheticLangameInitialSyncRuntimeProviderCurrent194,
} from "./langame-initial-sync-runtime-provider-current194.mjs";
import { isVerifiedLangameRuntimeRevokeIntentCurrent195 } from "./langame-runtime-revoke-intent-current195.mjs";

export const LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_CONTRACT =
  "LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_V1";
export const LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_CONFIRMATION =
  "open-langame-current194-bootstrap-on-loopback-ci";
export const LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_TEST_CONFIRMATION =
  "inject-langame-current194-bootstrap-for-unit-test";

const INPUT_KEYS = Object.freeze(
  [
    "attestationEnvelope",
    "expectedAttestation",
    "now",
    "providerRequest",
    "runtimeContext",
    "runtimeRoots",
  ].sort(),
);
const REVOKE_KEYS = Object.freeze(
  ["revocationReasonDigest", "revokeRequestDigest", "revokeRequestId"].sort(),
);
const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const BOOTSTRAPPED_SESSIONS = new WeakSet();

export class LangameInitialSyncRuntimeBootstrapCurrent194Error extends Error {
  constructor(code) {
    super("CURRENT194 Langame runtime bootstrap rejected the operation.");
    this.name = "LangameInitialSyncRuntimeBootstrapCurrent194Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameInitialSyncRuntimeBootstrapCurrent194Error(code);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactInput(value) {
  let invalid;
  try {
    invalid =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value);
  } catch {
    fail("CURRENT194_BOOTSTRAP_INPUT_INVALID");
  }
  if (invalid) fail("CURRENT194_BOOTSTRAP_INPUT_INVALID");
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail("CURRENT194_BOOTSTRAP_INPUT_INVALID");
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail("CURRENT194_BOOTSTRAP_INPUT_INVALID");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    fail("CURRENT194_BOOTSTRAP_INPUT_INVALID");
  }
  keys.sort(compareStrings);
  if (
    keys.length !== INPUT_KEYS.length ||
    keys.some((key, index) => key !== INPUT_KEYS[index]) ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
      );
    })
  ) {
    fail("CURRENT194_BOOTSTRAP_INPUT_INVALID");
  }
  const result = Object.create(null);
  for (const key of INPUT_KEYS) result[key] = descriptors[key].value;
  return Object.freeze(result);
}

function exactRecord(value, expectedKeys, code) {
  let invalid;
  let descriptors;
  try {
    invalid =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value);
    descriptors = invalid ? null : Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(code);
  }
  if (invalid) fail(code);
  const prototype = Object.getPrototypeOf(value);
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

function revokeRequest(value) {
  const input = exactRecord(
    value,
    REVOKE_KEYS,
    "CURRENT194_BOOTSTRAP_RECOVER_REVOKE_INPUT_INVALID",
  );
  if (
    !ID_PATTERN.test(input.revokeRequestId) ||
    !SHA256_PATTERN.test(input.revokeRequestDigest) ||
    !SHA256_PATTERN.test(input.revocationReasonDigest) ||
    input.revokeRequestDigest === input.revocationReasonDigest
  ) {
    fail("CURRENT194_BOOTSTRAP_RECOVER_REVOKE_INPUT_INVALID");
  }
  return input;
}

function verify(input) {
  return verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193(
    input.attestationEnvelope,
    input.expectedAttestation,
    input.runtimeRoots,
    input.runtimeContext,
    input.now,
  );
}

async function closePair(pair) {
  try {
    await pair.runtimeDriver.close();
  } catch {
    fail("CURRENT194_BOOTSTRAP_CLEANUP_FAILED");
  }
}

async function openVerified(input, attestation, pair) {
  let session;
  try {
    session = await openSyntheticLangameInitialSyncRuntimeProviderCurrent194(
      attestation,
      input.providerRequest,
      pair.ownerDriver,
      pair.runtimeDriver,
      LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_TEST_CONFIRMATION,
    );
  } catch (error) {
    await closePair(pair);
    throw error;
  }
  if (!isLangameInitialSyncRuntimeProviderCurrent194(session)) {
    await closePair(pair);
    fail("CURRENT194_BOOTSTRAP_SESSION_INVALID");
  }
  BOOTSTRAPPED_SESSIONS.add(session);
  return session;
}

async function recoverVerified(attestation, revokeValue, recovery) {
  try {
    const request = revokeRequest(revokeValue);
    const rows = await recovery.recoverRevokeCurrent194({
      attestationId: attestation.attestationId,
      databaseName: attestation.databaseName,
      databaseOid: attestation.databaseOid,
      expectedPayloadDigest: attestation.payloadDigest,
      ownerRoleName: attestation.schemaOwnerRoleName,
      ownerRoleOid: attestation.schemaOwnerRoleOid,
      revocationReasonDigest: request.revocationReasonDigest,
      revokeRequestDigest: request.revokeRequestDigest,
      revokeRequestId: request.revokeRequestId,
    });
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      rows[0] === null ||
      typeof rows[0] !== "object" ||
      rows[0].attestationId !== attestation.attestationId ||
      rows[0].status !== "REVOKED" ||
      !(rows[0].revokedAt instanceof Date) ||
      typeof rows[0].replayed !== "boolean"
    ) {
      fail("CURRENT194_BOOTSTRAP_RECOVER_REVOKE_RECEIPT_INVALID");
    }
    return Object.freeze({
      attestationId: rows[0].attestationId,
      authorization: false,
      productionExecutionAllowed: false,
      replayed: rows[0].replayed,
      revokedAt: rows[0].revokedAt.toISOString(),
      status: rows[0].status,
    });
  } finally {
    try {
      await recovery.close();
    } catch {
      fail("CURRENT194_BOOTSTRAP_RECOVER_REVOKE_CLEANUP_FAILED");
    }
  }
}

function revokeIntentRequest(attestation, intent) {
  if (
    !isVerifiedLangameRuntimeRevokeIntentCurrent195(intent) ||
    intent.attestationId !== attestation.attestationId ||
    intent.attestationPublicKeyFingerprint !==
      attestation.publicKeyFingerprint ||
    intent.attestationSigningKeyId !== attestation.signingKeyId ||
    intent.databaseName !== attestation.databaseName ||
    intent.databaseOid !== attestation.databaseOid ||
    intent.expectedPayloadDigest !== attestation.payloadDigest ||
    intent.ownerRoleName !== attestation.schemaOwnerRoleName ||
    intent.ownerRoleOid !== attestation.schemaOwnerRoleOid ||
    intent.releaseSha !== attestation.releaseSha
  ) {
    fail("CURRENT194_BOOTSTRAP_RECOVER_REVOKE_INTENT_INVALID");
  }
  return Object.freeze({
    revocationReasonDigest: intent.revocationReasonDigest,
    revokeRequestDigest: intent.revokeRequestDigest,
    revokeRequestId: intent.revokeRequestId,
  });
}

export async function openLangameInitialSyncRuntimeBootstrapCurrent194() {
  fail("CURRENT194_BOOTSTRAP_PRODUCTION_DENIED");
}

export async function recoverLangameInitialSyncRuntimeRevokeCurrent194() {
  fail("CURRENT194_BOOTSTRAP_RECOVER_REVOKE_PRODUCTION_DENIED");
}

export async function openSyntheticLangameInitialSyncRuntimeBootstrapCurrent194(
  inputValue,
  prismaConfig,
  explicitConfirmation,
) {
  if (
    arguments.length !== 3 ||
    explicitConfirmation !==
      LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_CONFIRMATION
  ) {
    fail("CURRENT194_BOOTSTRAP_SYNTHETIC_DENIED");
  }
  const input = exactInput(inputValue);
  const attestation = verify(input);
  const pair = createSyntheticLangameInitialSyncRuntimePrismaCurrent194(
    prismaConfig,
    LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONFIRMATION,
  );
  return openVerified(input, attestation, pair);
}

export async function openLangameInitialSyncRuntimeBootstrapCurrent194ForTestOnly(
  inputValue,
  pair,
  explicitConfirmation,
) {
  if (
    arguments.length !== 3 ||
    explicitConfirmation !==
      LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_TEST_CONFIRMATION ||
    !isLangameInitialSyncRuntimePrismaCurrent194(pair)
  ) {
    fail("CURRENT194_BOOTSTRAP_TEST_INJECTION_DENIED");
  }
  let input;
  let attestation;
  try {
    input = exactInput(inputValue);
    attestation = verify(input);
  } catch (error) {
    await closePair(pair);
    throw error;
  }
  return openVerified(input, attestation, pair);
}

export async function recoverSyntheticLangameInitialSyncRuntimeRevokeCurrent194(
  inputValue,
  revokeValue,
  prismaConfig,
  explicitConfirmation,
) {
  if (
    arguments.length !== 4 ||
    explicitConfirmation !==
      LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_CONFIRMATION
  ) {
    fail("CURRENT194_BOOTSTRAP_RECOVER_REVOKE_SYNTHETIC_DENIED");
  }
  const input = exactInput(inputValue);
  const attestation = verify(input);
  const recovery =
    createSyntheticLangameInitialSyncRuntimeRevokeRecoveryCurrent194(
      prismaConfig,
      LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_RECOVERY_CONFIRMATION,
    );
  return recoverVerified(attestation, revokeValue, recovery);
}

export async function recoverSyntheticLangameInitialSyncRuntimeRevokeWithIntentCurrent195(
  inputValue,
  intent,
  prismaConfig,
  explicitConfirmation,
) {
  if (
    arguments.length !== 4 ||
    explicitConfirmation !==
      LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_CONFIRMATION
  ) {
    fail("CURRENT194_BOOTSTRAP_RECOVER_REVOKE_INTENT_SYNTHETIC_DENIED");
  }
  const input = exactInput(inputValue);
  const attestation = verify(input);
  const request = revokeIntentRequest(attestation, intent);
  const recovery =
    createSyntheticLangameInitialSyncRuntimeRevokeRecoveryCurrent194(
      prismaConfig,
      LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_RECOVERY_CONFIRMATION,
    );
  return recoverVerified(attestation, request, recovery);
}

export async function recoverLangameInitialSyncRuntimeRevokeCurrent194ForTestOnly(
  inputValue,
  revokeValue,
  recovery,
  explicitConfirmation,
) {
  if (
    arguments.length !== 4 ||
    explicitConfirmation !==
      LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_TEST_CONFIRMATION ||
    !isLangameInitialSyncRuntimeRevokeRecoveryCurrent194(recovery)
  ) {
    fail("CURRENT194_BOOTSTRAP_RECOVER_REVOKE_TEST_INJECTION_DENIED");
  }
  let input;
  let attestation;
  try {
    input = exactInput(inputValue);
    attestation = verify(input);
  } catch (error) {
    try {
      await recovery.close();
    } catch {
      fail("CURRENT194_BOOTSTRAP_RECOVER_REVOKE_CLEANUP_FAILED");
    }
    throw error;
  }
  return recoverVerified(attestation, revokeValue, recovery);
}

export async function recoverLangameInitialSyncRuntimeRevokeWithIntentCurrent195ForTestOnly(
  inputValue,
  intent,
  recovery,
  explicitConfirmation,
) {
  if (
    arguments.length !== 4 ||
    explicitConfirmation !==
      LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_TEST_CONFIRMATION ||
    !isLangameInitialSyncRuntimeRevokeRecoveryCurrent194(recovery)
  ) {
    fail("CURRENT194_BOOTSTRAP_RECOVER_REVOKE_INTENT_TEST_INJECTION_DENIED");
  }
  let attestation;
  let request;
  try {
    const input = exactInput(inputValue);
    attestation = verify(input);
    request = revokeIntentRequest(attestation, intent);
  } catch (error) {
    try {
      await recovery.close();
    } catch {
      fail("CURRENT194_BOOTSTRAP_RECOVER_REVOKE_CLEANUP_FAILED");
    }
    throw error;
  }
  return recoverVerified(attestation, request, recovery);
}

export function isLangameInitialSyncRuntimeBootstrapCurrent194(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    BOOTSTRAPPED_SESSIONS.has(value)
  );
}
