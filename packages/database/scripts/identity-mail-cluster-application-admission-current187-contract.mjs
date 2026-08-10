import { types as utilTypes } from "node:util";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const CURRENT187_ADMISSION_CONTRACT =
  "CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1";
export const CURRENT187_ADMISSION_SLICE =
  "CURRENT187_A_PRE_GREEN_AUTHORITY_CONTRACT_ONLY";
export const CURRENT187_ADMISSION_SCHEMA_VERSION = 1;
export const CURRENT187_ADMISSION_SIGNATURE_ALGORITHM = "Ed25519";
export const CURRENT187_ADMISSION_MAX_LIFETIME_MS = 5 * 60 * 1_000;
export const CURRENT187_ADMISSION_MAX_CLOCK_SKEW_MS = 30 * 1_000;
export const CURRENT187_ADMISSION_SYNTHETIC_CONFIRMATION =
  "allow-current187-pre-green-authority-contract-loopback-ci-only";

export const CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE =
  "CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_V1";
export const CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE =
  "CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_V1";
export const CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE =
  "CURRENT187_PRODUCTION_DEPLOY_GO_V1";
export const CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_PURPOSE =
  "CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_V1";

const PURPOSE_DEFINITIONS_MUTABLE = {
  [CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE]: {
    kind: "CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL",
    profile: "CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PROFILE_V1",
    trustDomain:
      "LEETPLUS_CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_AUTHORITY_V1",
  },
  [CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE]: {
    kind: "CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO",
    profile: "CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PROFILE_V1",
    trustDomain:
      "LEETPLUS_CURRENT187_OFFLINE_PRODUCTION_ROOT_BOOTSTRAP_AUTHORITY_V1",
  },
  [CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE]: {
    kind: "CURRENT187_PRODUCTION_DEPLOY_GO",
    profile: "CURRENT187_PRODUCTION_DEPLOY_GO_PROFILE_V1",
    trustDomain:
      "LEETPLUS_CURRENT187_ENROLLED_PRODUCTION_DEPLOYMENT_AUTHORITY_V1",
  },
  [CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_PURPOSE]: {
    kind: "CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL",
    profile: "CURRENT187_SECRET_FREE_SEMANTIC_ALLOWLIST_APPROVAL_V1",
    trustDomain:
      "LEETPLUS_CURRENT187_INDEPENDENT_SEMANTIC_ALLOWLIST_AUTHORITY_V1",
  },
};

export const CURRENT187_ADMISSION_PURPOSES = Object.freeze(
  Object.keys(PURPOSE_DEFINITIONS_MUTABLE).sort(),
);

const COMMON_PAYLOAD_KEYS = [
  "contract",
  "issuedAt",
  "kind",
  "nonce",
  "operationId",
  "profile",
  "publicKeyFingerprint",
  "purpose",
  "schemaVersion",
  "signingKeyId",
  "slice",
  "trustDomain",
  "validUntil",
];

const COMMON_BINDING_KEYS = ["nonce", "operationId", "purpose"];

const PURPOSE_BINDING_KEYS_MUTABLE = {
  [CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE]: [
    "bootstrapChallengeDigest",
    "ceremonyTranscriptDigest",
    "clusterIdentityDigest",
    "environment",
    "expectedPriorAuthorityEpoch",
    "runtimeConfigDigest",
    "syntheticRootSetDigest",
    "verifierArtifactDigest",
  ],
  [CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE]: [
    "ceremonyTranscriptDigest",
    "challengeDigest",
    "clusterIdentityDigest",
    "engineeringGreenEvidenceDigest",
    "environment",
    "executableDigest",
    "expectedPriorAuthorityEpoch",
    "initialRevocationStateDigest",
    "operatorApprovalEvidenceDigest",
    "runtimeConfigDigest",
    "signaturePolicyDigest",
    "trustedRootSetDigest",
    "verifierArtifactDigest",
  ],
  [CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE]: [
    "beforeImageDigest",
    "clusterCatalogDigest",
    "clusterIdentityDigest",
    "currentAclPolicyDigest",
    "databaseUniverseDigest",
    "ddlFenceDigest",
    "defaultAclPolicyDigest",
    "emergencyPlanDigest",
    "enrollmentReceiptDigest",
    "environment",
    "executableDigest",
    "expectedPriorAuthorityEpoch",
    "hbaDigest",
    "immutableArtifactDigest",
    "liveScanDigest",
    "migrationManifestDigest",
    "networkEndpointDigest",
    "normalizedSqlDigest",
    "outboundKillSwitchEvidenceDigest",
    "perDatabaseCatalogDigest",
    "poolerDigest",
    "postgresMajorVersion",
    "predecessorChainDigest",
    "providerRecoveryEvidenceDigest",
    "releaseSha",
    "roleBindingsDigest",
    "rollbackPlanDigest",
    "runtimeConfigDigest",
    "serviceAccountMappingDigest",
    "tlsDigest",
    "zeroDiffProofDigest",
  ],
  [CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_PURPOSE]: [
    "clusterIdentityDigest",
    "databaseUniverseDigest",
    "environment",
    "reviewEvidenceDigest",
    "semanticAllowlistDocumentDigest",
    "semanticRiskFactsDigest",
  ],
};

export const CURRENT187_ADMISSION_ENVELOPE_KEYS = Object.freeze(
  [
    "payload",
    "payloadDigest",
    "publicKeyFingerprint",
    "signature",
    "signatureAlgorithm",
    "signingKeyId",
  ].sort(),
);

export const CURRENT187_ADMISSION_ROOT_KEYS = Object.freeze(
  [
    "algorithm",
    "keyId",
    "notAfter",
    "notBefore",
    "profile",
    "publicKeyFingerprint",
    "publicKeyPem",
    "purpose",
    "status",
    "trustDomain",
  ].sort(),
);

export const CURRENT187_ADMISSION_SYNTHETIC_CONTEXT_KEYS = Object.freeze(
  [
    "databaseName",
    "endpointHost",
    "environment",
    "explicitConfirmation",
    "nodeEnv",
  ].sort(),
);

export class Current187AdmissionContractError extends Error {
  constructor(reasonCode, message) {
    super(message);
    this.name = "Current187AdmissionContractError";
    this.reasonCode = reasonCode;
    this.code = reasonCode;
    this.exitCode = 3;
    this.safeContractError = true;
  }
}

export function current187AdmissionFail(reasonCode, message) {
  throw new Current187AdmissionContractError(reasonCode, message);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function current187AdmissionExactDataRecord(
  value,
  expectedKeys,
  reasonCode,
  message,
) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    utilTypes.isProxy(value)
  ) {
    current187AdmissionFail(reasonCode, message);
  }

  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    current187AdmissionFail(reasonCode, message);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    current187AdmissionFail(reasonCode, message);
  }

  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.some((key) => typeof key !== "string")) {
    current187AdmissionFail(reasonCode, message);
  }
  actualKeys.sort(compareStrings);
  const wantedKeys = [...expectedKeys].sort(compareStrings);
  if (
    actualKeys.length !== wantedKeys.length ||
    actualKeys.some((key, index) => key !== wantedKeys[index]) ||
    actualKeys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
      );
    })
  ) {
    current187AdmissionFail(reasonCode, message);
  }

  const snapshot = Object.create(null);
  for (const key of wantedKeys) {
    snapshot[key] = descriptors[key].value;
  }
  return Object.freeze(snapshot);
}

export function current187AdmissionDataOnlyEntries(value, reasonCode, message) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    utilTypes.isProxy(value)
  ) {
    current187AdmissionFail(reasonCode, message);
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    current187AdmissionFail(reasonCode, message);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    current187AdmissionFail(reasonCode, message);
  }
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
      );
    })
  ) {
    current187AdmissionFail(reasonCode, message);
  }
  return keys.sort(compareStrings).map((key) => [key, descriptors[key].value]);
}

function deepFreezeCurrent187Value(value, seen) {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (Object.hasOwn(descriptor, "value")) {
      deepFreezeCurrent187Value(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

export function current187AdmissionDeepFreeze(value) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_ARGUMENTS_INVALID",
      "Deep freeze accepts exactly one internally normalized value.",
    );
  }
  return deepFreezeCurrent187Value(value, new WeakSet());
}

export const CURRENT187_ADMISSION_PURPOSE_DEFINITIONS =
  current187AdmissionDeepFreeze(PURPOSE_DEFINITIONS_MUTABLE);

export const CURRENT187_ADMISSION_BINDING_KEYS_BY_PURPOSE =
  current187AdmissionDeepFreeze(
    Object.fromEntries(
      CURRENT187_ADMISSION_PURPOSES.map((purpose) => [
        purpose,
        [
          ...COMMON_BINDING_KEYS,
          ...PURPOSE_BINDING_KEYS_MUTABLE[purpose],
        ].sort(),
      ]),
    ),
  );

export const CURRENT187_ADMISSION_PAYLOAD_KEYS_BY_PURPOSE =
  current187AdmissionDeepFreeze(
    Object.fromEntries(
      CURRENT187_ADMISSION_PURPOSES.map((purpose) => [
        purpose,
        [
          ...COMMON_PAYLOAD_KEYS,
          ...PURPOSE_BINDING_KEYS_MUTABLE[purpose],
        ].sort(),
      ]),
    ),
  );

function frozenEmptyRegistry() {
  return Object.freeze(Object.create(null));
}

// Deliberately frozen-empty in PRE-GREEN code. No caller/env/config path may
// enroll a production authority. First enrollment is a separate reviewed
// immutable release change after Engineering Green.
export const PINNED_CURRENT187_PRODUCTION_ROOTS_BY_PURPOSE =
  current187AdmissionDeepFreeze(
    Object.fromEntries(
      CURRENT187_ADMISSION_PURPOSES.map((purpose) => [
        purpose,
        frozenEmptyRegistry(),
      ]),
    ),
  );

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const POSITIVE_EPOCH_PATTERN = /^[1-9][0-9]{0,18}$/u;
const ZERO_SHA256 = "0".repeat(64);

export function current187AdmissionValidDigest(value) {
  return (
    typeof value === "string" &&
    SHA256_PATTERN.test(value) &&
    value !== ZERO_SHA256
  );
}

export function current187AdmissionValidKeyId(value) {
  return typeof value === "string" && KEY_ID_PATTERN.test(value);
}

export function current187AdmissionPurposeDefinition(purpose) {
  if (
    typeof purpose !== "string" ||
    !Object.hasOwn(CURRENT187_ADMISSION_PURPOSE_DEFINITIONS, purpose)
  ) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_PURPOSE_INVALID",
      "The CURRENT187 authority purpose is unknown.",
    );
  }
  return CURRENT187_ADMISSION_PURPOSE_DEFINITIONS[purpose];
}

function validateDigestFields(record, keys, reasonCode) {
  if (!keys.every((key) => current187AdmissionValidDigest(record[key]))) {
    current187AdmissionFail(
      reasonCode,
      "Every CURRENT187 evidence binding must be a non-zero SHA-256 digest.",
    );
  }
}

function validatePurposeBindings(purpose, value, reasonCode) {
  if (purpose === CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE) {
    if (
      value.environment !== "ci" ||
      value.expectedPriorAuthorityEpoch !== "0"
    ) {
      current187AdmissionFail(
        reasonCode,
        "The pre-Green rehearsal binding is not synthetic CI-only.",
      );
    }
    validateDigestFields(
      value,
      PURPOSE_BINDING_KEYS_MUTABLE[purpose].filter(
        (key) => key !== "environment" && key !== "expectedPriorAuthorityEpoch",
      ),
      reasonCode,
    );
    return;
  }

  if (purpose === CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE) {
    if (
      value.environment !== "production" ||
      value.expectedPriorAuthorityEpoch !== "0"
    ) {
      current187AdmissionFail(
        reasonCode,
        "The production-root enrollment binding is invalid.",
      );
    }
    validateDigestFields(
      value,
      PURPOSE_BINDING_KEYS_MUTABLE[purpose].filter(
        (key) => key !== "environment" && key !== "expectedPriorAuthorityEpoch",
      ),
      reasonCode,
    );
    return;
  }

  if (purpose === CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_PURPOSE) {
    if (value.environment !== "production") {
      current187AdmissionFail(
        reasonCode,
        "The independent semantic allowlist approval binding is invalid.",
      );
    }
    validateDigestFields(
      value,
      PURPOSE_BINDING_KEYS_MUTABLE[purpose].filter(
        (key) => key !== "environment",
      ),
      reasonCode,
    );
    return;
  }

  if (
    value.environment !== "production" ||
    typeof value.releaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(value.releaseSha) ||
    !Number.isSafeInteger(value.postgresMajorVersion) ||
    value.postgresMajorVersion < 10 ||
    value.postgresMajorVersion > 99 ||
    typeof value.expectedPriorAuthorityEpoch !== "string" ||
    !POSITIVE_EPOCH_PATTERN.test(value.expectedPriorAuthorityEpoch)
  ) {
    current187AdmissionFail(
      reasonCode,
      "The production deployment binding is invalid.",
    );
  }
  validateDigestFields(
    value,
    PURPOSE_BINDING_KEYS_MUTABLE[purpose].filter(
      (key) =>
        ![
          "environment",
          "expectedPriorAuthorityEpoch",
          "postgresMajorVersion",
          "releaseSha",
        ].includes(key),
    ),
    reasonCode,
  );
}

export function normalizeCurrent187AdmissionBinding(
  purpose,
  value,
  reasonCode,
) {
  const exactReasonCode =
    arguments.length === 2
      ? "CURRENT187_ADMISSION_EXPECTED_BINDING_INVALID"
      : reasonCode;
  if (arguments.length !== 2 && arguments.length !== 3) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_ARGUMENTS_INVALID",
      "Binding normalization accepts purpose, value, and optional reason code.",
    );
  }
  const definition = current187AdmissionPurposeDefinition(purpose);
  void definition;
  const normalized = current187AdmissionExactDataRecord(
    value,
    CURRENT187_ADMISSION_BINDING_KEYS_BY_PURPOSE[purpose],
    exactReasonCode,
    "The expected CURRENT187 authority binding must be exact and data-only.",
  );
  if (
    normalized.purpose !== purpose ||
    typeof normalized.operationId !== "string" ||
    !UUID_PATTERN.test(normalized.operationId) ||
    !current187AdmissionValidDigest(normalized.nonce)
  ) {
    current187AdmissionFail(
      exactReasonCode,
      "The expected CURRENT187 authority identity binding is invalid.",
    );
  }
  validatePurposeBindings(purpose, normalized, exactReasonCode);
  return normalized;
}

export function normalizeCurrent187AdmissionPayload(value) {
  const discriminator = Object.freeze(
    Object.fromEntries(
      current187AdmissionDataOnlyEntries(
        value,
        "CURRENT187_ADMISSION_PAYLOAD_INVALID",
        "The signed CURRENT187 payload must be one data-only record.",
      ),
    ),
  );
  const definition = current187AdmissionPurposeDefinition(
    discriminator.purpose,
  );
  const payload = current187AdmissionExactDataRecord(
    value,
    CURRENT187_ADMISSION_PAYLOAD_KEYS_BY_PURPOSE[discriminator.purpose],
    "CURRENT187_ADMISSION_PAYLOAD_INVALID",
    "The signed CURRENT187 payload shape is invalid.",
  );
  if (
    payload.contract !== CURRENT187_ADMISSION_CONTRACT ||
    payload.slice !== CURRENT187_ADMISSION_SLICE ||
    payload.schemaVersion !== CURRENT187_ADMISSION_SCHEMA_VERSION ||
    payload.kind !== definition.kind ||
    payload.profile !== definition.profile ||
    payload.trustDomain !== definition.trustDomain ||
    payload.purpose !== discriminator.purpose ||
    !current187AdmissionValidKeyId(payload.signingKeyId) ||
    !current187AdmissionValidDigest(payload.publicKeyFingerprint)
  ) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_CONTRACT_INVALID",
      "The signed CURRENT187 contract discriminator is invalid.",
    );
  }
  const binding = Object.fromEntries(
    CURRENT187_ADMISSION_BINDING_KEYS_BY_PURPOSE[payload.purpose].map((key) => [
      key,
      payload[key],
    ]),
  );
  normalizeCurrent187AdmissionBinding(
    payload.purpose,
    binding,
    "CURRENT187_ADMISSION_PAYLOAD_BINDING_INVALID",
  );
  return payload;
}

export function current187AdmissionBindingProjection(payload) {
  const normalized = normalizeCurrent187AdmissionPayload(payload);
  return Object.freeze(
    Object.fromEntries(
      CURRENT187_ADMISSION_BINDING_KEYS_BY_PURPOSE[normalized.purpose].map(
        (key) => [key, normalized[key]],
      ),
    ),
  );
}

export function current187AdmissionCanonicalJson(value) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_ARGUMENTS_INVALID",
      "Canonical serialization accepts exactly one value.",
    );
  }
  return canonicalStringify(value);
}
