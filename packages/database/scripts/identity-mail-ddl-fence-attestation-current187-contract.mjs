import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionValidDigest,
  current187AdmissionValidKeyId,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";

export const CURRENT187_DDL_FENCE_ATTESTATION_SLICE =
  "CURRENT187_D_INDEPENDENT_TECHNICAL_DDL_FENCE_ATTESTOR";
export const CURRENT187_DDL_FENCE_ATTESTATION_KIND =
  "CURRENT187_TECHNICAL_DDL_FENCE_ATTESTATION";
export const CURRENT187_DDL_FENCE_ATTESTATION_PROFILE =
  "CURRENT187_INDEPENDENT_TECHNICAL_DDL_FENCE_ATTESTATION_V1";
export const CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE =
  "CURRENT187_TECHNICAL_DDL_FENCE_ATTESTATION_V1";
export const CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN =
  "LEETPLUS_CURRENT187_INDEPENDENT_DDL_FENCE_AUTHORITY_V1";
export const CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM = "Ed25519";
export const CURRENT187_DDL_FENCE_ATTESTATION_MAX_LIFETIME_MS = 2 * 60 * 1_000;
export const CURRENT187_DDL_FENCE_ATTESTATION_MAX_CLOCK_SKEW_MS = 15 * 1_000;
export const CURRENT187_DDL_FENCE_ATTESTATION_MAX_FENCE_LIFETIME_MS =
  30 * 60 * 1_000;
export const CURRENT187_DDL_FENCE_ATTESTATION_MAX_FINAL_SNAPSHOT_AGE_MS =
  30 * 1_000;
export const CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONFIRMATION =
  "allow-current187-independent-ddl-fence-attestation-loopback-ci-only";

export const CURRENT187_DDL_FENCE_ATTESTATION_BINDING_KEYS = Object.freeze(
  [
    "acquisitionDigest",
    "applicationAuthorityFingerprint",
    "attestorArtifactDigest",
    "clusterIdentityDigest",
    "databaseUniverseDigest",
    "ddlFenceEvidenceDigest",
    "ddlFenceStateDigest",
    "environment",
    "fenceEpoch",
    "fenceValidFrom",
    "fenceValidUntil",
    "finalDatabaseUniverseDigest",
    "finalSnapshotCapturedAt",
    "finalSnapshotDigest",
    "immutableArtifactDigest",
    "inventoryPlanDigest",
    "nonce",
    "operationId",
    "purpose",
    "releasePolicyDigest",
    "releasePolicyId",
    "releaseSha",
    "scannerRoleBindingDigest",
  ].sort(),
);

export const CURRENT187_DDL_FENCE_INVENTORY_BINDING_KEYS = Object.freeze(
  [
    "acquisitionDigest",
    "clusterIdentityDigest",
    "databaseUniverseDigest",
    "ddlFenceEvidenceDigest",
    "ddlFenceStateDigest",
    "environment",
    "fenceEpoch",
    "fenceValidFrom",
    "fenceValidUntil",
    "finalDatabaseUniverseDigest",
    "finalSnapshotCapturedAt",
    "finalSnapshotDigest",
    "inventoryPlanDigest",
  ].sort(),
);

const COMMON_PAYLOAD_KEYS = [
  "contract",
  "issuedAt",
  "kind",
  "profile",
  "publicKeyFingerprint",
  "schemaVersion",
  "signingKeyId",
  "slice",
  "trustDomain",
  "validUntil",
];

export const CURRENT187_DDL_FENCE_ATTESTATION_PAYLOAD_KEYS = Object.freeze(
  [
    ...COMMON_PAYLOAD_KEYS,
    ...CURRENT187_DDL_FENCE_ATTESTATION_BINDING_KEYS,
  ].sort(),
);

export const CURRENT187_DDL_FENCE_ATTESTATION_ENVELOPE_KEYS = Object.freeze(
  [
    "payload",
    "payloadDigest",
    "publicKeyFingerprint",
    "signature",
    "signatureAlgorithm",
    "signingKeyId",
  ].sort(),
);

export const CURRENT187_DDL_FENCE_ATTESTATION_ROOT_KEYS = Object.freeze(
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

export const CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONTEXT_KEYS =
  Object.freeze(
    [
      "applicationAuthorityFingerprint",
      "databaseName",
      "endpointHost",
      "environment",
      "explicitConfirmation",
      "nodeEnv",
      "scannerRoleBindingDigest",
    ].sort(),
  );

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const POSITIVE_EPOCH_PATTERN = /^[1-9][0-9]{0,18}$/u;
const RELEASE_POLICY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;

function canonicalIsoEpoch(value, reasonCode, label) {
  if (typeof value !== "string") {
    current187AdmissionFail(reasonCode, `${label} must be a UTC timestamp.`);
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    current187AdmissionFail(reasonCode, `${label} must be a UTC timestamp.`);
  }
  return epoch;
}

function validateDigestFields(record, keys, reasonCode) {
  if (!keys.every((key) => current187AdmissionValidDigest(record[key]))) {
    current187AdmissionFail(
      reasonCode,
      "Every CURRENT187 DDL-fence evidence binding must be a non-zero SHA-256 digest.",
    );
  }
}

export function normalizeCurrent187DdlFenceAttestationBinding(value) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ARGUMENTS_INVALID",
      "DDL-fence binding normalization accepts exactly one value.",
    );
  }
  const binding = current187AdmissionExactDataRecord(
    value,
    CURRENT187_DDL_FENCE_ATTESTATION_BINDING_KEYS,
    "CURRENT187_DDL_FENCE_ATTESTATION_BINDING_INVALID",
    "The CURRENT187 DDL-fence binding must be exact and data-only.",
  );
  validateDigestFields(
    binding,
    [
      "acquisitionDigest",
      "applicationAuthorityFingerprint",
      "attestorArtifactDigest",
      "clusterIdentityDigest",
      "databaseUniverseDigest",
      "ddlFenceEvidenceDigest",
      "ddlFenceStateDigest",
      "finalDatabaseUniverseDigest",
      "finalSnapshotDigest",
      "immutableArtifactDigest",
      "inventoryPlanDigest",
      "nonce",
      "releasePolicyDigest",
      "scannerRoleBindingDigest",
    ],
    "CURRENT187_DDL_FENCE_ATTESTATION_BINDING_INVALID",
  );
  const fenceValidFromMs = canonicalIsoEpoch(
    binding.fenceValidFrom,
    "CURRENT187_DDL_FENCE_ATTESTATION_BINDING_INVALID",
    "DDL fence validity start",
  );
  const fenceValidUntilMs = canonicalIsoEpoch(
    binding.fenceValidUntil,
    "CURRENT187_DDL_FENCE_ATTESTATION_BINDING_INVALID",
    "DDL fence validity end",
  );
  const finalSnapshotCapturedAtMs = canonicalIsoEpoch(
    binding.finalSnapshotCapturedAt,
    "CURRENT187_DDL_FENCE_ATTESTATION_BINDING_INVALID",
    "Final catalog snapshot time",
  );
  if (
    binding.purpose !== CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE ||
    !["ci", "production"].includes(binding.environment) ||
    typeof binding.operationId !== "string" ||
    !UUID_PATTERN.test(binding.operationId) ||
    typeof binding.fenceEpoch !== "string" ||
    !POSITIVE_EPOCH_PATTERN.test(binding.fenceEpoch) ||
    typeof binding.releaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(binding.releaseSha) ||
    typeof binding.releasePolicyId !== "string" ||
    !RELEASE_POLICY_ID_PATTERN.test(binding.releasePolicyId) ||
    fenceValidUntilMs <= fenceValidFromMs ||
    fenceValidUntilMs - fenceValidFromMs >
      CURRENT187_DDL_FENCE_ATTESTATION_MAX_FENCE_LIFETIME_MS ||
    finalSnapshotCapturedAtMs < fenceValidFromMs ||
    finalSnapshotCapturedAtMs > fenceValidUntilMs ||
    binding.databaseUniverseDigest !== binding.finalDatabaseUniverseDigest
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_BINDING_INVALID",
      "The CURRENT187 DDL-fence binding contains an invalid identity, release, policy, or fence value.",
    );
  }
  return Object.freeze({ ...binding });
}

export function normalizeCurrent187DdlFenceAttestationPayload(value) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ARGUMENTS_INVALID",
      "DDL-fence payload normalization accepts exactly one value.",
    );
  }
  const payload = current187AdmissionExactDataRecord(
    value,
    CURRENT187_DDL_FENCE_ATTESTATION_PAYLOAD_KEYS,
    "CURRENT187_DDL_FENCE_ATTESTATION_PAYLOAD_INVALID",
    "The signed CURRENT187 DDL-fence payload must be exact and data-only.",
  );
  if (
    payload.contract !== CURRENT187_ADMISSION_CONTRACT ||
    payload.slice !== CURRENT187_DDL_FENCE_ATTESTATION_SLICE ||
    payload.schemaVersion !== CURRENT187_ADMISSION_SCHEMA_VERSION ||
    payload.kind !== CURRENT187_DDL_FENCE_ATTESTATION_KIND ||
    payload.profile !== CURRENT187_DDL_FENCE_ATTESTATION_PROFILE ||
    payload.purpose !== CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE ||
    payload.trustDomain !== CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN ||
    !current187AdmissionValidKeyId(payload.signingKeyId) ||
    !current187AdmissionValidDigest(payload.publicKeyFingerprint)
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_CONTRACT_INVALID",
      "The signed CURRENT187 DDL-fence discriminator is invalid.",
    );
  }
  const binding = normalizeCurrent187DdlFenceAttestationBinding(
    Object.fromEntries(
      CURRENT187_DDL_FENCE_ATTESTATION_BINDING_KEYS.map((key) => [
        key,
        payload[key],
      ]),
    ),
  );
  const issuedAtMs = canonicalIsoEpoch(
    payload.issuedAt,
    "CURRENT187_DDL_FENCE_ATTESTATION_TIMELINE_INVALID",
    "DDL-fence attestation issue time",
  );
  const validUntilMs = canonicalIsoEpoch(
    payload.validUntil,
    "CURRENT187_DDL_FENCE_ATTESTATION_TIMELINE_INVALID",
    "DDL-fence attestation validity end",
  );
  if (
    issuedAtMs < Date.parse(binding.finalSnapshotCapturedAt) ||
    issuedAtMs - Date.parse(binding.finalSnapshotCapturedAt) >
      CURRENT187_DDL_FENCE_ATTESTATION_MAX_FINAL_SNAPSHOT_AGE_MS ||
    issuedAtMs < Date.parse(binding.fenceValidFrom) ||
    validUntilMs > Date.parse(binding.fenceValidUntil) ||
    payload.publicKeyFingerprint === binding.applicationAuthorityFingerprint ||
    payload.publicKeyFingerprint === binding.scannerRoleBindingDigest
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_AUTHORITY_NOT_INDEPENDENT",
      "The DDL-fence authority is not independent or its evidence lies outside the fence window.",
    );
  }
  return current187AdmissionDeepFreeze({ ...payload });
}

export function current187DdlFenceAttestationBindingProjection(payloadValue) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ARGUMENTS_INVALID",
      "DDL-fence binding projection accepts exactly one payload.",
    );
  }
  const payload = normalizeCurrent187DdlFenceAttestationPayload(payloadValue);
  return Object.freeze(
    Object.fromEntries(
      CURRENT187_DDL_FENCE_ATTESTATION_BINDING_KEYS.map((key) => [
        key,
        payload[key],
      ]),
    ),
  );
}

export function current187DdlFenceInventoryBindingProjection(bindingValue) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ARGUMENTS_INVALID",
      "Inventory binding projection accepts exactly one binding.",
    );
  }
  const binding = normalizeCurrent187DdlFenceAttestationBinding(bindingValue);
  return Object.freeze(
    Object.fromEntries(
      CURRENT187_DDL_FENCE_INVENTORY_BINDING_KEYS.map((key) => [
        key,
        binding[key],
      ]),
    ),
  );
}

export function current187DdlFenceAttestationCanonicalJson(value) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ARGUMENTS_INVALID",
      "DDL-fence canonical serialization accepts exactly one value.",
    );
  }
  return current187AdmissionCanonicalJson(value);
}

export const PINNED_CURRENT187_DDL_FENCE_PRODUCTION_ROOTS = Object.freeze(
  Object.create(null),
);
