import { createHash } from "node:crypto";

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
import {
  CURRENT187_DDL_FENCE_ATTESTATION_MAX_CLOCK_SKEW_MS,
  CURRENT187_DDL_FENCE_ATTESTATION_MAX_LIFETIME_MS,
  CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
  CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
} from "./identity-mail-ddl-fence-attestation-current187-contract.mjs";
import {
  current187DdlFenceAttestationReceiptBinding,
  isVerifiedCurrent187DdlFenceAttestationReceipt,
} from "./identity-mail-ddl-fence-attestation-current187-authority.mjs";

export const CURRENT187_DDL_FENCE_LEDGER_SLICE =
  "CURRENT187_E_PERSISTED_DDL_FENCE_CONSUMPTION_REVOCATION_LEDGER";
export const CURRENT187_DDL_FENCE_LEDGER_PROFILE =
  "CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1";
export const CURRENT187_DDL_FENCE_CONSUMPTION_KIND =
  "CURRENT187_DDL_FENCE_CONSUMPTION_COMMAND";
export const CURRENT187_DDL_FENCE_REVOCATION_KIND =
  "CURRENT187_DDL_FENCE_REVOCATION_COMMAND";
export const CURRENT187_DDL_FENCE_REVOCATION_PURPOSE =
  "CURRENT187_TECHNICAL_DDL_FENCE_REVOCATION_V1";
export const CURRENT187_DDL_FENCE_REVOCATION_TRUST_DOMAIN =
  "LEETPLUS_CURRENT187_DDL_FENCE_REVOCATION_AUTHORITY_V1";
export const CURRENT187_DDL_FENCE_REVOCATION_CONFIRMATION =
  "revoke-current187-ddl-fence-loopback-ci-only";

const CONSUMPTION_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_DDL_FENCE_CONSUMPTION_COMMAND_V1";
const REVOCATION_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_DDL_FENCE_REVOCATION_COMMAND_V1";
const RECEIPT_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_DDL_FENCE_LEDGER_RECEIPT_V1";
const REVOCATION_RECEIPT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_DDL_FENCE_REVOCATION_RECEIPT_V1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SAFE_TEXT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const REVOCATION_SCOPES = new Set(["ATTESTATION", "ENVELOPE", "ROOT"]);
const SENSITIVE_PATTERN =
  /(?:@|BEGIN [A-Z ]+KEY|https?:\/\/|password|privateKey|secret|accessToken|refreshToken|providerMessageId)/iu;

const CONSUMPTION_COMMAND_KEYS = Object.freeze(
  [
    "attestationDigest",
    "attestationPurpose",
    "attestationTrustDomain",
    "clusterIdentityDigest",
    "contract",
    "ddlFenceStateDigest",
    "environment",
    "envelopeDigest",
    "finalSnapshotDigest",
    "issuedAt",
    "kind",
    "nonce",
    "operationId",
    "payloadDigest",
    "profile",
    "publicKeyFingerprint",
    "purpose",
    "releasePolicyDigest",
    "releasePolicyId",
    "releaseSha",
    "schemaVersion",
    "signingKeyId",
    "slice",
    "syntheticVerification",
    "validUntil",
    "verifiedAt",
  ].sort(),
);

const REVOCATION_INPUT_KEYS = Object.freeze(
  [
    "actorDigest",
    "eventId",
    "explicitConfirmation",
    "reasonDigest",
    "revokedAt",
    "scope",
  ].sort(),
);

const REVOCATION_COMMAND_KEYS = Object.freeze(
  [
    "actorDigest",
    "attestationDigest",
    "contract",
    "environment",
    "eventId",
    "kind",
    "profile",
    "publicKeyFingerprint",
    "purpose",
    "reasonDigest",
    "revokedAt",
    "schemaVersion",
    "scope",
    "scopeDigest",
    "slice",
    "sourceEnvelopeDigest",
    "trustDomain",
  ].sort(),
);

const PERSISTED_RECEIPT_KEYS = Object.freeze(
  [
    "attestationDigest",
    "authorization",
    "canApply",
    "canMutate",
    "canSend",
    "commandDigest",
    "consumedAt",
    "envelopeDigest",
    "kind",
    "nonce",
    "noncanonical",
    "operationId",
    "persistedConsumptionVerified",
    "productionRootEnrolled",
    "receiptDigest",
    "sharedBetaAccess",
    "status",
    "syntheticLoopbackCiOnly",
    "testAccessAuthorized",
    "transactionId",
  ].sort(),
);

const PERSISTED_REVOCATION_RECEIPT_KEYS = Object.freeze(
  [
    "attestationDigest",
    "authorization",
    "canApply",
    "canMutate",
    "canSend",
    "commandDigest",
    "eventId",
    "kind",
    "noncanonical",
    "persistedRevocationVerified",
    "productionRootEnrolled",
    "publicKeyFingerprint",
    "receiptDigest",
    "revokedAt",
    "scope",
    "scopeDigest",
    "sharedBetaAccess",
    "sourceEnvelopeDigest",
    "status",
    "syntheticLoopbackCiOnly",
    "testAccessAuthorized",
    "transactionId",
  ].sort(),
);

const VERIFIED_PERSISTED_RECEIPTS = new WeakSet();
const VERIFIED_PERSISTED_REVOCATION_RECEIPTS = new WeakSet();

function digest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function canonicalEpoch(value, reasonCode, label) {
  if (typeof value !== "string") {
    current187AdmissionFail(reasonCode, `${label} must be a UTC timestamp.`);
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    current187AdmissionFail(reasonCode, `${label} must be a UTC timestamp.`);
  }
  return epoch;
}

function assertDenyOnlyReceipt(receipt) {
  if (
    !isVerifiedCurrent187DdlFenceAttestationReceipt(receipt) ||
    receipt.authorization !== false ||
    receipt.canApply !== false ||
    receipt.canMutate !== false ||
    receipt.canSend !== false ||
    receipt.testAccessAuthorized !== false ||
    receipt.sharedBetaAccess !== false ||
    receipt.productionRootEnrolled !== false ||
    receipt.persistedConsumptionVerified !== false ||
    receipt.syntheticVerification !== true
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_SOURCE_RECEIPT_DENIED",
      "The persisted ledger accepts only a branded synthetic deny-only CURRENT187-D receipt.",
    );
  }
}

function assertSecretFree(value, reasonCode) {
  const serialized = current187AdmissionCanonicalJson(value);
  if (
    Buffer.byteLength(serialized, "utf8") > 16 * 1024 ||
    SENSITIVE_PATTERN.test(serialized)
  ) {
    current187AdmissionFail(
      reasonCode,
      "The CURRENT187 ledger command must be bounded and PII/secret-free.",
    );
  }
  return serialized;
}

function bundle(kind, domain, command) {
  const commandCanonicalJson = assertSecretFree(
    command,
    "CURRENT187_DDL_FENCE_LEDGER_COMMAND_UNSAFE",
  );
  const commandDigest = digest(domain, commandCanonicalJson);
  return current187AdmissionDeepFreeze({
    command,
    commandCanonicalJson,
    commandDigest,
    kind,
  });
}

export function createCurrent187DdlFenceConsumptionBundle(receipt, now) {
  if (arguments.length !== 2) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_ARGUMENTS_INVALID",
      "Consumption bundle construction requires a branded receipt and explicit time.",
    );
  }
  assertDenyOnlyReceipt(receipt);
  const binding = current187DdlFenceAttestationReceiptBinding(receipt);
  const nowMs = canonicalEpoch(
    now,
    "CURRENT187_DDL_FENCE_LEDGER_TIME_INVALID",
    "Consumption time",
  );
  const issuedAtMs = canonicalEpoch(
    receipt.issuedAt,
    "CURRENT187_DDL_FENCE_LEDGER_SOURCE_RECEIPT_DENIED",
    "Attestation issue time",
  );
  const validUntilMs = canonicalEpoch(
    receipt.validUntil,
    "CURRENT187_DDL_FENCE_LEDGER_SOURCE_RECEIPT_DENIED",
    "Attestation expiry",
  );
  if (
    binding.environment !== "ci" ||
    binding.purpose !== CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE ||
    issuedAtMs > nowMs + CURRENT187_DDL_FENCE_ATTESTATION_MAX_CLOCK_SKEW_MS ||
    validUntilMs <= nowMs ||
    validUntilMs - issuedAtMs > CURRENT187_DDL_FENCE_ATTESTATION_MAX_LIFETIME_MS
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_SOURCE_RECEIPT_EXPIRED",
      "The synthetic DDL-fence receipt is expired or outside its signed lifetime.",
    );
  }

  const command = Object.fromEntries(
    CONSUMPTION_COMMAND_KEYS.map((key) => [
      key,
      {
        attestationDigest: receipt.attestationDigest,
        attestationPurpose: CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
        attestationTrustDomain: CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
        clusterIdentityDigest: binding.clusterIdentityDigest,
        contract: CURRENT187_ADMISSION_CONTRACT,
        ddlFenceStateDigest: binding.ddlFenceStateDigest,
        environment: "ci",
        envelopeDigest: receipt.envelopeDigest,
        finalSnapshotDigest: binding.finalSnapshotDigest,
        issuedAt: receipt.issuedAt,
        kind: CURRENT187_DDL_FENCE_CONSUMPTION_KIND,
        nonce: binding.nonce,
        operationId: binding.operationId,
        payloadDigest: receipt.payloadDigest,
        profile: CURRENT187_DDL_FENCE_LEDGER_PROFILE,
        publicKeyFingerprint: receipt.publicKeyFingerprint,
        purpose: CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
        releasePolicyDigest: binding.releasePolicyDigest,
        releasePolicyId: binding.releasePolicyId,
        releaseSha: binding.releaseSha,
        schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
        signingKeyId: receipt.signingKeyId,
        slice: CURRENT187_DDL_FENCE_LEDGER_SLICE,
        syntheticVerification: true,
        validUntil: receipt.validUntil,
        verifiedAt: receipt.verifiedAt,
      }[key],
    ]),
  );
  return bundle(
    CURRENT187_DDL_FENCE_CONSUMPTION_KIND,
    CONSUMPTION_DIGEST_DOMAIN,
    command,
  );
}

export function current187DdlFenceLedgerDatabaseArguments(bundleValue) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_ARGUMENTS_INVALID",
      "Database argument projection accepts exactly one bundle.",
    );
  }
  const bundleRecord = current187AdmissionExactDataRecord(
    bundleValue,
    ["command", "commandCanonicalJson", "commandDigest", "kind"],
    "CURRENT187_DDL_FENCE_LEDGER_BUNDLE_INVALID",
    "The CURRENT187 ledger bundle must be exact and data-only.",
  );
  const keys =
    bundleRecord.kind === CURRENT187_DDL_FENCE_CONSUMPTION_KIND
      ? CONSUMPTION_COMMAND_KEYS
      : bundleRecord.kind === CURRENT187_DDL_FENCE_REVOCATION_KIND
        ? REVOCATION_COMMAND_KEYS
        : null;
  const domain =
    bundleRecord.kind === CURRENT187_DDL_FENCE_CONSUMPTION_KIND
      ? CONSUMPTION_DIGEST_DOMAIN
      : REVOCATION_DIGEST_DOMAIN;
  if (!keys) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_BUNDLE_INVALID",
      "The CURRENT187 ledger bundle kind is invalid.",
    );
  }
  const command = current187AdmissionExactDataRecord(
    bundleRecord.command,
    keys,
    "CURRENT187_DDL_FENCE_LEDGER_BUNDLE_INVALID",
    "The CURRENT187 ledger command shape is invalid.",
  );
  const canonical = assertSecretFree(
    command,
    "CURRENT187_DDL_FENCE_LEDGER_BUNDLE_INVALID",
  );
  if (
    canonical !== bundleRecord.commandCanonicalJson ||
    digest(domain, canonical) !== bundleRecord.commandDigest
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_BUNDLE_INVALID",
      "The CURRENT187 ledger bundle digest is invalid.",
    );
  }
  return Object.freeze([
    bundleRecord.commandCanonicalJson,
    bundleRecord.commandDigest,
  ]);
}

export function createSyntheticCurrent187DdlFenceRevocationBundle(
  receipt,
  inputValue,
) {
  if (arguments.length !== 2) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_ARGUMENTS_INVALID",
      "Revocation construction requires a branded receipt and exact input.",
    );
  }
  assertDenyOnlyReceipt(receipt);
  const input = current187AdmissionExactDataRecord(
    inputValue,
    REVOCATION_INPUT_KEYS,
    "CURRENT187_DDL_FENCE_REVOCATION_INPUT_INVALID",
    "The synthetic revocation input must be exact and data-only.",
  );
  const revokedAt = canonicalEpoch(
    input.revokedAt,
    "CURRENT187_DDL_FENCE_REVOCATION_INPUT_INVALID",
    "Revocation time",
  );
  const verifiedAt = canonicalEpoch(
    receipt.verifiedAt,
    "CURRENT187_DDL_FENCE_REVOCATION_INPUT_INVALID",
    "Attestation verification time",
  );
  if (
    input.explicitConfirmation !==
      CURRENT187_DDL_FENCE_REVOCATION_CONFIRMATION ||
    !UUID_PATTERN.test(input.eventId) ||
    !REVOCATION_SCOPES.has(input.scope) ||
    !current187AdmissionValidDigest(input.reasonDigest) ||
    !current187AdmissionValidDigest(input.actorDigest) ||
    revokedAt < verifiedAt ||
    revokedAt - verifiedAt > 30 * 60 * 1_000
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_REVOCATION_INPUT_INVALID",
      "The synthetic revocation is invalid or outside its bounded CI window.",
    );
  }
  const scopeDigest = {
    ATTESTATION: receipt.attestationDigest,
    ENVELOPE: receipt.envelopeDigest,
    ROOT: receipt.publicKeyFingerprint,
  }[input.scope];
  const values = {
    actorDigest: input.actorDigest,
    attestationDigest: receipt.attestationDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    environment: "ci",
    eventId: input.eventId,
    kind: CURRENT187_DDL_FENCE_REVOCATION_KIND,
    profile: CURRENT187_DDL_FENCE_LEDGER_PROFILE,
    publicKeyFingerprint: receipt.publicKeyFingerprint,
    purpose: CURRENT187_DDL_FENCE_REVOCATION_PURPOSE,
    reasonDigest: input.reasonDigest,
    revokedAt: input.revokedAt,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    scope: input.scope,
    scopeDigest,
    slice: CURRENT187_DDL_FENCE_LEDGER_SLICE,
    sourceEnvelopeDigest: receipt.envelopeDigest,
    trustDomain: CURRENT187_DDL_FENCE_REVOCATION_TRUST_DOMAIN,
  };
  const command = Object.fromEntries(
    REVOCATION_COMMAND_KEYS.map((key) => [key, values[key]]),
  );
  return bundle(
    CURRENT187_DDL_FENCE_REVOCATION_KIND,
    REVOCATION_DIGEST_DOMAIN,
    command,
  );
}

function persistedReceiptDigest(receipt) {
  return digest(
    RECEIPT_DIGEST_DOMAIN,
    [
      receipt.kind,
      receipt.status,
      receipt.operationId,
      receipt.nonce,
      receipt.envelopeDigest,
      receipt.attestationDigest,
      receipt.commandDigest,
      receipt.consumedAt,
      receipt.transactionId,
      "false",
      "false",
      "false",
      "false",
      "false",
      "false",
      "false",
      "true",
      "true",
      "true",
    ].join("\n"),
  );
}

function persistedRevocationReceiptDigest(receipt) {
  return digest(
    REVOCATION_RECEIPT_DIGEST_DOMAIN,
    [
      receipt.eventId,
      receipt.scope,
      receipt.scopeDigest,
      receipt.sourceEnvelopeDigest,
      receipt.attestationDigest,
      receipt.publicKeyFingerprint,
      receipt.commandDigest,
      receipt.revokedAt,
      receipt.transactionId,
      "false",
      "false",
      "false",
      "false",
      "false",
      "false",
      "false",
      "true",
      "true",
      "true",
    ].join("\n"),
  );
}

export function attachPersistedCurrent187DdlFenceConsumption(
  sourceReceipt,
  bundleValue,
  databaseReceiptText,
) {
  if (arguments.length !== 3) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_ARGUMENTS_INVALID",
      "Persisted receipt attachment requires source, bundle, and database receipt text.",
    );
  }
  assertDenyOnlyReceipt(sourceReceipt);
  const [commandCanonicalJson, commandDigest] =
    current187DdlFenceLedgerDatabaseArguments(bundleValue);
  void commandCanonicalJson;
  if (
    typeof databaseReceiptText !== "string" ||
    Buffer.byteLength(databaseReceiptText, "utf8") > 16 * 1024
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_RECEIPT_INVALID",
      "The persisted ledger receipt is invalid.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(databaseReceiptText);
  } catch {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_RECEIPT_INVALID",
      "The persisted ledger receipt is not JSON.",
    );
  }
  const receipt = current187AdmissionExactDataRecord(
    parsed,
    PERSISTED_RECEIPT_KEYS,
    "CURRENT187_DDL_FENCE_LEDGER_RECEIPT_INVALID",
    "The persisted ledger receipt shape is invalid.",
  );
  const binding = current187DdlFenceAttestationReceiptBinding(sourceReceipt);
  if (
    receipt.kind !== "CURRENT187_DDL_FENCE_CONSUMPTION_RECEIPT" ||
    receipt.status !== "CONSUMED" ||
    receipt.operationId !== binding.operationId ||
    receipt.nonce !== binding.nonce ||
    receipt.envelopeDigest !== sourceReceipt.envelopeDigest ||
    receipt.attestationDigest !== sourceReceipt.attestationDigest ||
    receipt.commandDigest !== commandDigest ||
    receipt.authorization !== false ||
    receipt.canApply !== false ||
    receipt.canMutate !== false ||
    receipt.canSend !== false ||
    receipt.testAccessAuthorized !== false ||
    receipt.sharedBetaAccess !== false ||
    receipt.productionRootEnrolled !== false ||
    receipt.persistedConsumptionVerified !== true ||
    receipt.syntheticLoopbackCiOnly !== true ||
    receipt.noncanonical !== true ||
    !current187AdmissionValidDigest(receipt.receiptDigest) ||
    receipt.receiptDigest !== persistedReceiptDigest(receipt) ||
    typeof receipt.transactionId !== "string" ||
    !/^[1-9][0-9]{0,19}$/u.test(receipt.transactionId)
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_RECEIPT_INVALID",
      "The persisted ledger receipt failed its exact deny-only binding.",
    );
  }
  canonicalEpoch(
    receipt.consumedAt,
    "CURRENT187_DDL_FENCE_LEDGER_RECEIPT_INVALID",
    "Persisted consumption time",
  );
  const attached = current187AdmissionDeepFreeze({
    ...sourceReceipt,
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    noncanonicalPersistedLedger: true,
    persistedConsumptionVerified: true,
    persistedLedgerReceiptDigest: receipt.receiptDigest,
    productionRootEnrolled: false,
    sharedBetaAccess: false,
    testAccessAuthorized: false,
  });
  VERIFIED_PERSISTED_RECEIPTS.add(attached);
  return attached;
}

export function isVerifiedPersistedCurrent187DdlFenceReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_PERSISTED_RECEIPTS.has(value)
  );
}

export function attachPersistedCurrent187DdlFenceRevocation(
  bundleValue,
  databaseReceiptText,
) {
  if (arguments.length !== 2) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_ARGUMENTS_INVALID",
      "Persisted revocation attachment requires a bundle and database receipt text.",
    );
  }
  const [, commandDigest] =
    current187DdlFenceLedgerDatabaseArguments(bundleValue);
  if (
    bundleValue.kind !== CURRENT187_DDL_FENCE_REVOCATION_KIND ||
    typeof databaseReceiptText !== "string" ||
    Buffer.byteLength(databaseReceiptText, "utf8") > 16 * 1024 ||
    SENSITIVE_PATTERN.test(databaseReceiptText)
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_REVOCATION_RECEIPT_INVALID",
      "The persisted revocation receipt is invalid.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(databaseReceiptText);
  } catch {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_REVOCATION_RECEIPT_INVALID",
      "The persisted revocation receipt is not JSON.",
    );
  }
  const receipt = current187AdmissionExactDataRecord(
    parsed,
    PERSISTED_REVOCATION_RECEIPT_KEYS,
    "CURRENT187_DDL_FENCE_LEDGER_REVOCATION_RECEIPT_INVALID",
    "The persisted revocation receipt shape is invalid.",
  );
  const command = bundleValue.command;
  if (
    receipt.kind !== "CURRENT187_DDL_FENCE_REVOCATION_RECEIPT" ||
    receipt.status !== "REVOKED" ||
    receipt.eventId !== command.eventId ||
    receipt.scope !== command.scope ||
    receipt.scopeDigest !== command.scopeDigest ||
    receipt.sourceEnvelopeDigest !== command.sourceEnvelopeDigest ||
    receipt.attestationDigest !== command.attestationDigest ||
    receipt.publicKeyFingerprint !== command.publicKeyFingerprint ||
    receipt.commandDigest !== commandDigest ||
    receipt.authorization !== false ||
    receipt.canApply !== false ||
    receipt.canMutate !== false ||
    receipt.canSend !== false ||
    receipt.testAccessAuthorized !== false ||
    receipt.sharedBetaAccess !== false ||
    receipt.productionRootEnrolled !== false ||
    receipt.persistedRevocationVerified !== true ||
    receipt.syntheticLoopbackCiOnly !== true ||
    receipt.noncanonical !== true ||
    !current187AdmissionValidDigest(receipt.receiptDigest) ||
    receipt.receiptDigest !== persistedRevocationReceiptDigest(receipt) ||
    typeof receipt.transactionId !== "string" ||
    !/^[1-9][0-9]{0,19}$/u.test(receipt.transactionId)
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_REVOCATION_RECEIPT_INVALID",
      "The persisted revocation receipt failed its exact deny-only binding.",
    );
  }
  canonicalEpoch(
    receipt.revokedAt,
    "CURRENT187_DDL_FENCE_LEDGER_REVOCATION_RECEIPT_INVALID",
    "Persisted revocation time",
  );
  const attached = current187AdmissionDeepFreeze({ ...receipt });
  VERIFIED_PERSISTED_REVOCATION_RECEIPTS.add(attached);
  return attached;
}

export function isVerifiedPersistedCurrent187DdlFenceRevocationReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_PERSISTED_REVOCATION_RECEIPTS.has(value)
  );
}

export const CURRENT187_DDL_FENCE_LEDGER_CONTRACT =
  current187AdmissionDeepFreeze({
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    consumptionCommandKeys: [...CONSUMPTION_COMMAND_KEYS],
    productionRootEnrolled: false,
    productionRootsFrozenEmpty: true,
    revocationCommandKeys: [...REVOCATION_COMMAND_KEYS],
    sharedBetaAccess: false,
    status: "NONCANONICAL_DENY_ONLY_SYNTHETIC_CI",
    testAccessAuthorized: false,
  });

export function assertCurrent187DdlFenceLedgerStaticValue(value, label) {
  if (
    typeof value !== "string" ||
    (!current187AdmissionValidDigest(value) &&
      !current187AdmissionValidKeyId(value) &&
      !RELEASE_SHA_PATTERN.test(value) &&
      !SAFE_TEXT_PATTERN.test(value))
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_LEDGER_STATIC_VALUE_INVALID",
      `${label} is invalid.`,
    );
  }
  return value;
}
