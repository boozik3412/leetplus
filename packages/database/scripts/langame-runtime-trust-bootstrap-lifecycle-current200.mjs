import { createHash, createPublicKey } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_ALGORITHM,
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_MAX_ROOT_LIFETIME_MS,
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_PURPOSE,
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_STATUS,
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_TRUST_DOMAIN,
  langameRuntimeTrustBootstrapRegistryDigestCurrent198,
  validateLangameRuntimeTrustBootstrapRegistryCurrent198,
  validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198,
} from "./langame-runtime-trust-bootstrap-registry-current198-contract.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CONTRACT =
  "LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_V1";
export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_STATUS =
  "PUBLIC_REGISTRY_TRANSITION_PREPARED_DENY_ONLY";
export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_MAX_DELAY_MS =
  24 * 60 * 60 * 1_000;
export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_MAX_APPROVAL_AGE_MS =
  24 * 60 * 60 * 1_000;

const INPUT_KEYS = Object.freeze(["command", "currentRegistry"].sort());
const COMMAND_KEYS = Object.freeze(
  [
    "approvedAt",
    "effectiveAt",
    "keyId",
    "nextPublicKeyPem",
    "nextValidUntil",
    "operation",
    "operationId",
    "reasonDigest",
  ].sort(),
);
const OPERATIONS = new Set(["ENROLL", "REVOKE", "ROTATE"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PREPARED_TRANSITIONS = new WeakSet();

export class LangameRuntimeTrustBootstrapLifecycleCurrent200Error extends Error {
  constructor(code) {
    super("CURRENT200 Langame bootstrap lifecycle rejected the input.");
    this.name = "LangameRuntimeTrustBootstrapLifecycleCurrent200Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameRuntimeTrustBootstrapLifecycleCurrent200Error(code);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactRecord(value, expectedKeys, code) {
  let invalid;
  let prototype;
  let descriptors;
  try {
    invalid =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value);
    prototype = invalid ? null : Object.getPrototypeOf(value);
    descriptors = invalid ? null : Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(code);
  }
  if (invalid || (prototype !== Object.prototype && prototype !== null)) {
    fail(code);
  }
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

function epoch(value, code) {
  if (typeof value !== "string") fail(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail(code);
  }
  return parsed;
}

function fingerprint(publicKeyPem) {
  if (
    typeof publicKeyPem !== "string" ||
    publicKeyPem.length > 4_096 ||
    !publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----\n") ||
    !publicKeyPem.endsWith("-----END PUBLIC KEY-----\n")
  ) {
    fail("CURRENT200_BOOTSTRAP_PUBLIC_KEY_INVALID");
  }
  let key;
  let canonical;
  try {
    key = createPublicKey(publicKeyPem);
    canonical = key.export({ format: "pem", type: "spki" });
  } catch {
    fail("CURRENT200_BOOTSTRAP_PUBLIC_KEY_INVALID");
  }
  if (key.asymmetricKeyType !== "ed25519" || canonical !== publicKeyPem) {
    fail("CURRENT200_BOOTSTRAP_PUBLIC_KEY_INVALID");
  }
  return createHash("sha256")
    .update(key.export({ format: "der", type: "spki" }))
    .digest("hex");
}

function digest(domain, value) {
  return createHash("sha256")
    .update(
      `${LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CONTRACT}\n${domain}\n`,
      "utf8",
    )
    .update(canonicalStringify(value), "utf8")
    .digest("hex");
}

function command(value, now) {
  const data = exactRecord(
    value,
    COMMAND_KEYS,
    "CURRENT200_BOOTSTRAP_COMMAND_INVALID",
  );
  if (
    !OPERATIONS.has(data.operation) ||
    !UUID_PATTERN.test(data.operationId) ||
    !KEY_PATTERN.test(data.keyId) ||
    !SHA256_PATTERN.test(data.reasonDigest)
  ) {
    fail("CURRENT200_BOOTSTRAP_COMMAND_INVALID");
  }
  const approvedAt = epoch(
    data.approvedAt,
    "CURRENT200_BOOTSTRAP_TIMELINE_INVALID",
  );
  const effectiveAt = epoch(
    data.effectiveAt,
    "CURRENT200_BOOTSTRAP_TIMELINE_INVALID",
  );
  const observedAt = epoch(now, "CURRENT200_BOOTSTRAP_TIMELINE_INVALID");
  if (
    approvedAt > observedAt ||
    observedAt - approvedAt >
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_MAX_APPROVAL_AGE_MS ||
    effectiveAt < approvedAt ||
    effectiveAt - observedAt >
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_MAX_DELAY_MS
  ) {
    fail("CURRENT200_BOOTSTRAP_TIMELINE_INVALID");
  }
  if (data.operation === "REVOKE") {
    if (data.nextPublicKeyPem !== null || data.nextValidUntil !== null) {
      fail("CURRENT200_BOOTSTRAP_COMMAND_INVALID");
    }
    return Object.freeze({
      ...data,
      approvedAtMs: approvedAt,
      effectiveAtMs: effectiveAt,
    });
  }
  const nextValidUntil = epoch(
    data.nextValidUntil,
    "CURRENT200_BOOTSTRAP_TIMELINE_INVALID",
  );
  if (
    nextValidUntil <= effectiveAt ||
    nextValidUntil - effectiveAt >
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_MAX_ROOT_LIFETIME_MS
  ) {
    fail("CURRENT200_BOOTSTRAP_TIMELINE_INVALID");
  }
  return Object.freeze({
    ...data,
    approvedAtMs: approvedAt,
    effectiveAtMs: effectiveAt,
    nextValidUntilMs: nextValidUntil,
    publicKeyFingerprint: fingerprint(data.nextPublicKeyPem),
  });
}

function activeRoot(registry) {
  return Object.values(registry).find(
    (root) =>
      root.status ===
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_STATUS.ACTIVE,
  );
}

function nextRegistry(current, operation) {
  const active = activeRoot(current);
  if (
    (operation.operation === "ENROLL" &&
      (Object.keys(current).length !== 0 || active !== undefined)) ||
    (operation.operation !== "ENROLL" && active === undefined) ||
    (operation.operation === "REVOKE" && active?.keyId !== operation.keyId) ||
    (operation.operation === "ROTATE" &&
      (active?.keyId === operation.keyId ||
        Object.hasOwn(current, operation.keyId)))
  ) {
    fail("CURRENT200_BOOTSTRAP_OPERATION_STATE_INVALID");
  }

  const result = Object.fromEntries(
    Object.entries(current).map(([key, value]) => [key, { ...value }]),
  );
  if (operation.operation === "REVOKE") {
    result[active.keyId] = {
      ...active,
      revokedAt: operation.effectiveAt,
      status:
        LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_STATUS.REVOKED,
    };
    return result;
  }
  if (operation.operation === "ROTATE") {
    result[active.keyId] = {
      ...active,
      retiredAt: operation.effectiveAt,
      status:
        LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_STATUS.RETIRED,
    };
  }
  result[operation.keyId] = {
    algorithm: LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_ALGORITHM,
    keyId: operation.keyId,
    notAfter: operation.nextValidUntil,
    notBefore: operation.effectiveAt,
    publicKeyFingerprint: operation.publicKeyFingerprint,
    publicKeyPem: operation.nextPublicKeyPem,
    purpose: LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_PURPOSE,
    retiredAt: null,
    revokedAt: null,
    status: LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_STATUS.ACTIVE,
    supersedesKeyId: active?.keyId ?? null,
    trustDomain:
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_TRUST_DOMAIN,
  };
  return result;
}

export function prepareLangameRuntimeTrustBootstrapLifecycleCurrent200(
  inputValue,
  now,
) {
  if (arguments.length !== 2) {
    fail("CURRENT200_BOOTSTRAP_ARGUMENTS_INVALID");
  }
  const input = exactRecord(
    inputValue,
    INPUT_KEYS,
    "CURRENT200_BOOTSTRAP_INPUT_INVALID",
  );
  const currentRegistry =
    validateLangameRuntimeTrustBootstrapRegistryCurrent198(
      input.currentRegistry,
    );
  const normalizedCommand = command(input.command, now);
  const candidateRegistry =
    validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
      currentRegistry,
      nextRegistry(currentRegistry, normalizedCommand),
    );
  const currentRegistryDigest =
    langameRuntimeTrustBootstrapRegistryDigestCurrent198(currentRegistry);
  const candidateRegistryDigest =
    langameRuntimeTrustBootstrapRegistryDigestCurrent198(candidateRegistry);
  const payload = Object.freeze({
    approvedAt: normalizedCommand.approvedAt,
    candidateRegistryDigest,
    currentRegistryDigest,
    effectiveAt: normalizedCommand.effectiveAt,
    keyId: normalizedCommand.keyId,
    operation: normalizedCommand.operation,
    operationId: normalizedCommand.operationId,
    reasonDigest: normalizedCommand.reasonDigest,
  });
  const prepared = Object.freeze({
    authorization: false,
    canApply: false,
    canEnrollProductionRoots: false,
    canMutateRepository: false,
    candidateCanonicalJson: canonicalStringify(candidateRegistry),
    candidateRegistry,
    contract: LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_CONTRACT,
    operationDigest: digest("OPERATION", payload),
    productionExecutionAllowed: false,
    productionRootEnrolled: false,
    sharedBetaAccess: false,
    status: LANGAME_RUNTIME_TRUST_BOOTSTRAP_LIFECYCLE_CURRENT200_STATUS,
    testAccessAuthorized: false,
    ...payload,
  });
  PREPARED_TRANSITIONS.add(prepared);
  return prepared;
}

export function isPreparedLangameRuntimeTrustBootstrapLifecycleCurrent200(
  value,
) {
  return (
    arguments.length === 1 &&
    value !== null &&
    typeof value === "object" &&
    PREPARED_TRANSITIONS.has(value)
  );
}
