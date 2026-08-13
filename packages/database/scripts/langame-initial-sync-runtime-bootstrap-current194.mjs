import { types as utilTypes } from "node:util";

import { verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193 } from "./langame-initial-sync-runtime-attestation-current193.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONFIRMATION,
  createSyntheticLangameInitialSyncRuntimePrismaCurrent194,
  isLangameInitialSyncRuntimePrismaCurrent194,
} from "./langame-initial-sync-runtime-prisma-current194.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_TEST_CONFIRMATION,
  isLangameInitialSyncRuntimeProviderCurrent194,
  openSyntheticLangameInitialSyncRuntimeProviderCurrent194,
} from "./langame-initial-sync-runtime-provider-current194.mjs";

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

export async function openLangameInitialSyncRuntimeBootstrapCurrent194() {
  fail("CURRENT194_BOOTSTRAP_PRODUCTION_DENIED");
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

export function isLangameInitialSyncRuntimeBootstrapCurrent194(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    BOOTSTRAPPED_SESSIONS.has(value)
  );
}
