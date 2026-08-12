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
  CURRENT187_CONNECTION_PROBE_MAX_LIFETIME_MS,
  CURRENT187_CONNECTION_PROBE_PROFILE,
  CURRENT187_CONNECTION_PROBE_PURPOSE,
  CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
  current187ConnectionProbeEnvelopeDigest,
  current187ConnectionProbePayloadDigest,
  isVerifiedCurrent187ConnectionProbeReceipt,
} from "./identity-mail-cluster-connection-probe-attestation-current187.mjs";

export const CURRENT187_CONNECTION_PROBE_LEDGER_SLICE =
  "CURRENT187_J5_R3_PERSISTED_CONNECTION_PROBE_CONSUMPTION_REVOCATION_LEDGER";
export const CURRENT187_CONNECTION_PROBE_LEDGER_PROFILE =
  "CURRENT187_CONNECTION_PROBE_LEDGER_SYNTHETIC_CI_V1";
export const CURRENT187_CONNECTION_PROBE_CONSUMPTION_KIND =
  "CURRENT187_CONNECTION_PROBE_CONSUMPTION_COMMAND";
export const CURRENT187_CONNECTION_PROBE_REVOCATION_KIND =
  "CURRENT187_CONNECTION_PROBE_REVOCATION_COMMAND";
export const CURRENT187_CONNECTION_PROBE_REVOCATION_PURPOSE =
  "CURRENT187_CONNECTION_PROBE_REVOCATION_V1";
export const CURRENT187_CONNECTION_PROBE_REVOCATION_TRUST_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_REVOCATION_AUTHORITY_V1";
export const CURRENT187_CONNECTION_PROBE_REVOCATION_CONFIRMATION =
  "revoke-current187-connection-probe-loopback-ci-only";

const CONSUMPTION_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_CONSUMPTION_COMMAND_V1";
const REVOCATION_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_REVOCATION_COMMAND_V1";
const CONSUMPTION_RECEIPT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_CONSUMPTION_RECEIPT_V1";
const REVOCATION_RECEIPT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_REVOCATION_RECEIPT_V1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TRANSACTION_ID_PATTERN = /^[1-9][0-9]{0,19}$/u;
const REVOCATION_SCOPES = new Set(["ENVELOPE", "MATRIX", "ROOT"]);
const SENSITIVE_PATTERN =
  /(?:@|BEGIN [A-Z ]+KEY|https?:\/\/|password|privateKey|secret|accessToken|refreshToken|providerMessageId)/iu;

const CONSUMPTION_COMMAND_KEYS = Object.freeze(
  [
    "clusterIdentityDigest",
    "connectionProbeMatrixDigest",
    "contract",
    "databaseUniverseDigest",
    "envelopeDigest",
    "environment",
    "issuedAt",
    "kind",
    "nonce",
    "operationId",
    "payloadDigest",
    "profile",
    "publicKeyFingerprint",
    "releaseSha",
    "schemaVersion",
    "signingKeyId",
    "slice",
    "trustDomain",
    "validUntil",
    "verificationReceiptDigest",
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
    "connectionProbeMatrixDigest",
    "contract",
    "envelopeDigest",
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
    "trustDomain",
  ].sort(),
);
const PERSISTED_CONSUMPTION_RECEIPT_KEYS = Object.freeze(
  [
    "authorization",
    "canApply",
    "canMutate",
    "canSend",
    "commandDigest",
    "connectionProbeMatrixDigest",
    "consumedAt",
    "envelopeDigest",
    "kind",
    "nonce",
    "noncanonical",
    "operationId",
    "persistedConsumptionVerified",
    "productionRootEnrolled",
    "publicKeyFingerprint",
    "receiptDigest",
    "sharedBetaAccess",
    "status",
    "syntheticLoopbackCiOnly",
    "testAccessAuthorized",
    "transactionId",
    "verificationReceiptDigest",
  ].sort(),
);
const PERSISTED_REVOCATION_RECEIPT_KEYS = Object.freeze(
  [
    "authorization",
    "canApply",
    "canMutate",
    "canSend",
    "commandDigest",
    "connectionProbeMatrixDigest",
    "envelopeDigest",
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
    "status",
    "syntheticLoopbackCiOnly",
    "testAccessAuthorized",
    "transactionId",
  ].sort(),
);

const VERIFIED_PERSISTED_CONSUMPTION_RECEIPTS = new WeakSet();
const VERIFIED_PERSISTED_REVOCATION_RECEIPTS = new WeakSet();

function fail(reasonCode, message) {
  current187AdmissionFail(reasonCode, message);
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function canonicalEpoch(value, reasonCode, label) {
  if (typeof value !== "string") fail(reasonCode, `${label} is invalid.`);
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    fail(reasonCode, `${label} must be a canonical ISO timestamp.`);
  }
  return epoch;
}

function assertSecretFree(value, reasonCode) {
  const canonical = current187AdmissionCanonicalJson(value);
  if (
    Buffer.byteLength(canonical, "utf8") > 32 * 1_024 ||
    SENSITIVE_PATTERN.test(canonical)
  ) {
    fail(reasonCode, "The connection-probe ledger value is unsafe.");
  }
  return canonical;
}

function assertVerifiedSyntheticReceipt(receipt) {
  if (
    !isVerifiedCurrent187ConnectionProbeReceipt(receipt) ||
    receipt.syntheticOnly !== true ||
    receipt.environment !== "ci" ||
    receipt.signatureVerified !== true ||
    receipt.negativeProbeMatrixPassed !== true ||
    receipt.authorization !== false ||
    receipt.canMutate !== false ||
    receipt.canSend !== false ||
    receipt.productionRootEnrolled !== false ||
    receipt.productionRuntimeAttested !== false ||
    receipt.testAccessAuthorized !== false ||
    receipt.sharedBetaAccess !== false
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_SOURCE_RECEIPT_DENIED",
      "The ledger accepts only a branded synthetic deny-only J5 receipt.",
    );
  }
  for (const candidate of [
    receipt.clusterIdentityDigest,
    receipt.connectionProbeMatrixDigest,
    receipt.databaseUniverseDigest,
    receipt.envelopeDigest,
    receipt.payloadDigest,
    receipt.verificationReceiptDigest,
  ]) {
    if (!current187AdmissionValidDigest(candidate)) {
      fail(
        "CURRENT187_CONNECTION_PROBE_LEDGER_SOURCE_RECEIPT_DENIED",
        "The J5 receipt is missing an exact ledger binding.",
      );
    }
  }
}

function assertEnvelopeMatchesReceipt(envelope, receipt) {
  const payload = envelope?.payload;
  if (
    !envelope ||
    typeof envelope !== "object" ||
    !payload ||
    typeof payload !== "object" ||
    current187ConnectionProbePayloadDigest(payload) !== receipt.payloadDigest ||
    current187ConnectionProbeEnvelopeDigest(envelope) !==
      receipt.envelopeDigest ||
    payload.clusterIdentityDigest !== receipt.clusterIdentityDigest ||
    payload.databaseUniverseDigest !== receipt.databaseUniverseDigest ||
    payload.releaseSha !== receipt.releaseSha ||
    payload.environment !== receipt.environment ||
    payload.profile !== CURRENT187_CONNECTION_PROBE_PROFILE ||
    payload.purpose !== CURRENT187_CONNECTION_PROBE_PURPOSE ||
    payload.trustDomain !== CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN ||
    !UUID_PATTERN.test(payload.operationId) ||
    !current187AdmissionValidDigest(payload.nonce) ||
    !current187AdmissionValidDigest(payload.publicKeyFingerprint) ||
    !current187AdmissionValidKeyId(payload.signingKeyId)
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_ENVELOPE_MISMATCH",
      "The signed J5 envelope does not match its branded verification receipt.",
    );
  }
  return payload;
}

function createBundle(kind, domain, command) {
  const commandCanonicalJson = assertSecretFree(
    command,
    "CURRENT187_CONNECTION_PROBE_LEDGER_COMMAND_UNSAFE",
  );
  return current187AdmissionDeepFreeze({
    command,
    commandCanonicalJson,
    commandDigest: digest(domain, commandCanonicalJson),
    kind,
  });
}

export function createCurrent187ConnectionProbeConsumptionBundle(
  envelope,
  receipt,
  now,
) {
  if (arguments.length !== 3) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_ARGUMENTS_INVALID",
      "Consumption requires envelope, branded receipt, and explicit time.",
    );
  }
  assertVerifiedSyntheticReceipt(receipt);
  const payload = assertEnvelopeMatchesReceipt(envelope, receipt);
  const nowMs = canonicalEpoch(
    now,
    "CURRENT187_CONNECTION_PROBE_LEDGER_TIME_INVALID",
    "Consumption time",
  );
  const issuedAt = canonicalEpoch(
    payload.issuedAt,
    "CURRENT187_CONNECTION_PROBE_LEDGER_SOURCE_EXPIRED",
    "J5 issue time",
  );
  const validUntil = canonicalEpoch(
    payload.validUntil,
    "CURRENT187_CONNECTION_PROBE_LEDGER_SOURCE_EXPIRED",
    "J5 expiry",
  );
  if (
    issuedAt > nowMs ||
    validUntil <= nowMs ||
    validUntil - issuedAt > CURRENT187_CONNECTION_PROBE_MAX_LIFETIME_MS
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_SOURCE_EXPIRED",
      "The J5 envelope is not active at consumption time.",
    );
  }
  const values = {
    clusterIdentityDigest: receipt.clusterIdentityDigest,
    connectionProbeMatrixDigest: receipt.connectionProbeMatrixDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: receipt.databaseUniverseDigest,
    envelopeDigest: receipt.envelopeDigest,
    environment: "ci",
    issuedAt: payload.issuedAt,
    kind: CURRENT187_CONNECTION_PROBE_CONSUMPTION_KIND,
    nonce: payload.nonce,
    operationId: payload.operationId,
    payloadDigest: receipt.payloadDigest,
    profile: CURRENT187_CONNECTION_PROBE_LEDGER_PROFILE,
    publicKeyFingerprint: payload.publicKeyFingerprint,
    releaseSha: receipt.releaseSha,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    signingKeyId: payload.signingKeyId,
    slice: CURRENT187_CONNECTION_PROBE_LEDGER_SLICE,
    trustDomain: CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
    validUntil: payload.validUntil,
    verificationReceiptDigest: receipt.verificationReceiptDigest,
  };
  const command = Object.fromEntries(
    CONSUMPTION_COMMAND_KEYS.map((key) => [key, values[key]]),
  );
  return createBundle(
    CURRENT187_CONNECTION_PROBE_CONSUMPTION_KIND,
    CONSUMPTION_DIGEST_DOMAIN,
    command,
  );
}

export function createSyntheticCurrent187ConnectionProbeRevocationBundle(
  envelope,
  receipt,
  inputValue,
) {
  if (arguments.length !== 3) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_ARGUMENTS_INVALID",
      "Revocation requires envelope, branded receipt, and exact input.",
    );
  }
  assertVerifiedSyntheticReceipt(receipt);
  const payload = assertEnvelopeMatchesReceipt(envelope, receipt);
  const input = current187AdmissionExactDataRecord(
    inputValue,
    REVOCATION_INPUT_KEYS,
    "CURRENT187_CONNECTION_PROBE_REVOCATION_INPUT_INVALID",
    "The synthetic J5 revocation must be exact and data-only.",
  );
  const revokedAt = canonicalEpoch(
    input.revokedAt,
    "CURRENT187_CONNECTION_PROBE_REVOCATION_INPUT_INVALID",
    "Revocation time",
  );
  const issuedAt = canonicalEpoch(
    payload.issuedAt,
    "CURRENT187_CONNECTION_PROBE_REVOCATION_INPUT_INVALID",
    "J5 issue time",
  );
  if (
    input.explicitConfirmation !==
      CURRENT187_CONNECTION_PROBE_REVOCATION_CONFIRMATION ||
    !UUID_PATTERN.test(input.eventId) ||
    !REVOCATION_SCOPES.has(input.scope) ||
    !current187AdmissionValidDigest(input.actorDigest) ||
    !current187AdmissionValidDigest(input.reasonDigest) ||
    revokedAt < issuedAt ||
    revokedAt - issuedAt > 30 * 60 * 1_000
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_REVOCATION_INPUT_INVALID",
      "The synthetic J5 revocation is invalid or outside its bounded window.",
    );
  }
  const scopeDigest = {
    ENVELOPE: receipt.envelopeDigest,
    MATRIX: receipt.connectionProbeMatrixDigest,
    ROOT: payload.publicKeyFingerprint,
  }[input.scope];
  const values = {
    actorDigest: input.actorDigest,
    connectionProbeMatrixDigest: receipt.connectionProbeMatrixDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    envelopeDigest: receipt.envelopeDigest,
    environment: "ci",
    eventId: input.eventId,
    kind: CURRENT187_CONNECTION_PROBE_REVOCATION_KIND,
    profile: CURRENT187_CONNECTION_PROBE_LEDGER_PROFILE,
    publicKeyFingerprint: payload.publicKeyFingerprint,
    purpose: CURRENT187_CONNECTION_PROBE_REVOCATION_PURPOSE,
    reasonDigest: input.reasonDigest,
    revokedAt: input.revokedAt,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    scope: input.scope,
    scopeDigest,
    slice: CURRENT187_CONNECTION_PROBE_LEDGER_SLICE,
    trustDomain: CURRENT187_CONNECTION_PROBE_REVOCATION_TRUST_DOMAIN,
  };
  const command = Object.fromEntries(
    REVOCATION_COMMAND_KEYS.map((key) => [key, values[key]]),
  );
  return createBundle(
    CURRENT187_CONNECTION_PROBE_REVOCATION_KIND,
    REVOCATION_DIGEST_DOMAIN,
    command,
  );
}

export function current187ConnectionProbeLedgerDatabaseArguments(bundleValue) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_ARGUMENTS_INVALID",
      "Database argument projection accepts exactly one bundle.",
    );
  }
  const bundle = current187AdmissionExactDataRecord(
    bundleValue,
    ["command", "commandCanonicalJson", "commandDigest", "kind"],
    "CURRENT187_CONNECTION_PROBE_LEDGER_BUNDLE_INVALID",
    "The J5 ledger bundle must be exact and data-only.",
  );
  const keys =
    bundle.kind === CURRENT187_CONNECTION_PROBE_CONSUMPTION_KIND
      ? CONSUMPTION_COMMAND_KEYS
      : bundle.kind === CURRENT187_CONNECTION_PROBE_REVOCATION_KIND
        ? REVOCATION_COMMAND_KEYS
        : null;
  const domain =
    bundle.kind === CURRENT187_CONNECTION_PROBE_CONSUMPTION_KIND
      ? CONSUMPTION_DIGEST_DOMAIN
      : REVOCATION_DIGEST_DOMAIN;
  if (!keys) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_BUNDLE_INVALID",
      "The J5 ledger bundle kind is invalid.",
    );
  }
  const command = current187AdmissionExactDataRecord(
    bundle.command,
    keys,
    "CURRENT187_CONNECTION_PROBE_LEDGER_BUNDLE_INVALID",
    "The J5 ledger command shape is invalid.",
  );
  const canonical = assertSecretFree(
    command,
    "CURRENT187_CONNECTION_PROBE_LEDGER_BUNDLE_INVALID",
  );
  if (
    canonical !== bundle.commandCanonicalJson ||
    digest(domain, canonical) !== bundle.commandDigest
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_BUNDLE_INVALID",
      "The J5 ledger bundle digest is invalid.",
    );
  }
  return Object.freeze([bundle.commandCanonicalJson, bundle.commandDigest]);
}

function parseDatabaseReceipt(text, keys, reasonCode) {
  if (
    typeof text !== "string" ||
    Buffer.byteLength(text, "utf8") > 16 * 1_024 ||
    SENSITIVE_PATTERN.test(text)
  ) {
    fail(reasonCode, "The persisted J5 receipt is invalid.");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(reasonCode, "The persisted J5 receipt is not JSON.");
  }
  return current187AdmissionExactDataRecord(
    parsed,
    keys,
    reasonCode,
    "The persisted J5 receipt shape is invalid.",
  );
}

function receiptDigest(domain, receipt) {
  const value = { ...receipt };
  delete value.receiptDigest;
  return digest(domain, current187AdmissionCanonicalJson(value));
}

export function attachPersistedCurrent187ConnectionProbeConsumption(
  envelope,
  sourceReceipt,
  bundleValue,
  databaseReceiptText,
) {
  if (arguments.length !== 4) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_ARGUMENTS_INVALID",
      "Consumption attachment requires envelope, source, bundle, and database receipt.",
    );
  }
  assertVerifiedSyntheticReceipt(sourceReceipt);
  const payload = assertEnvelopeMatchesReceipt(envelope, sourceReceipt);
  const [, commandDigest] =
    current187ConnectionProbeLedgerDatabaseArguments(bundleValue);
  const command = bundleValue.command;
  if (
    bundleValue.kind !== CURRENT187_CONNECTION_PROBE_CONSUMPTION_KIND ||
    command.envelopeDigest !== sourceReceipt.envelopeDigest ||
    command.connectionProbeMatrixDigest !==
      sourceReceipt.connectionProbeMatrixDigest ||
    command.verificationReceiptDigest !==
      sourceReceipt.verificationReceiptDigest ||
    command.operationId !== payload.operationId ||
    command.nonce !== payload.nonce ||
    command.publicKeyFingerprint !== payload.publicKeyFingerprint
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_SOURCE_BUNDLE_MISMATCH",
      "The persisted consumption bundle does not belong to this J5 envelope.",
    );
  }
  const receipt = parseDatabaseReceipt(
    databaseReceiptText,
    PERSISTED_CONSUMPTION_RECEIPT_KEYS,
    "CURRENT187_CONNECTION_PROBE_LEDGER_RECEIPT_INVALID",
  );
  if (
    receipt.kind !== "CURRENT187_CONNECTION_PROBE_CONSUMPTION_RECEIPT" ||
    receipt.status !== "CONSUMED" ||
    receipt.operationId !== command.operationId ||
    receipt.nonce !== command.nonce ||
    receipt.envelopeDigest !== command.envelopeDigest ||
    receipt.connectionProbeMatrixDigest !==
      command.connectionProbeMatrixDigest ||
    receipt.verificationReceiptDigest !== command.verificationReceiptDigest ||
    receipt.publicKeyFingerprint !== command.publicKeyFingerprint ||
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
    !TRANSACTION_ID_PATTERN.test(receipt.transactionId) ||
    !current187AdmissionValidDigest(receipt.receiptDigest) ||
    receipt.receiptDigest !==
      receiptDigest(CONSUMPTION_RECEIPT_DIGEST_DOMAIN, receipt)
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_RECEIPT_INVALID",
      "The persisted J5 consumption receipt failed its exact deny-only binding.",
    );
  }
  canonicalEpoch(
    receipt.consumedAt,
    "CURRENT187_CONNECTION_PROBE_LEDGER_RECEIPT_INVALID",
    "Persisted consumption time",
  );
  const attached = current187AdmissionDeepFreeze({
    ...sourceReceipt,
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    noncanonicalPersistedConnectionProbeLedger: true,
    persistedConnectionProbeConsumptionVerified: true,
    persistedConnectionProbeOperationId: receipt.operationId,
    persistedConnectionProbeReceiptDigest: receipt.receiptDigest,
    persistedConnectionProbeRootFingerprint: receipt.publicKeyFingerprint,
    productionRootEnrolled: false,
    sharedBetaAccess: false,
    testAccessAuthorized: false,
  });
  VERIFIED_PERSISTED_CONSUMPTION_RECEIPTS.add(attached);
  return attached;
}

export function isVerifiedPersistedCurrent187ConnectionProbeReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_PERSISTED_CONSUMPTION_RECEIPTS.has(value)
  );
}

export function attachPersistedCurrent187ConnectionProbeRevocation(
  bundleValue,
  databaseReceiptText,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_ARGUMENTS_INVALID",
      "Revocation attachment requires bundle and database receipt.",
    );
  }
  const [, commandDigest] =
    current187ConnectionProbeLedgerDatabaseArguments(bundleValue);
  const command = bundleValue.command;
  const receipt = parseDatabaseReceipt(
    databaseReceiptText,
    PERSISTED_REVOCATION_RECEIPT_KEYS,
    "CURRENT187_CONNECTION_PROBE_LEDGER_REVOCATION_RECEIPT_INVALID",
  );
  if (
    bundleValue.kind !== CURRENT187_CONNECTION_PROBE_REVOCATION_KIND ||
    receipt.kind !== "CURRENT187_CONNECTION_PROBE_REVOCATION_RECEIPT" ||
    receipt.status !== "REVOKED" ||
    receipt.eventId !== command.eventId ||
    receipt.scope !== command.scope ||
    receipt.scopeDigest !== command.scopeDigest ||
    receipt.envelopeDigest !== command.envelopeDigest ||
    receipt.connectionProbeMatrixDigest !==
      command.connectionProbeMatrixDigest ||
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
    !TRANSACTION_ID_PATTERN.test(receipt.transactionId) ||
    !current187AdmissionValidDigest(receipt.receiptDigest) ||
    receipt.receiptDigest !==
      receiptDigest(REVOCATION_RECEIPT_DIGEST_DOMAIN, receipt)
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_LEDGER_REVOCATION_RECEIPT_INVALID",
      "The persisted J5 revocation receipt failed its exact deny-only binding.",
    );
  }
  canonicalEpoch(
    receipt.revokedAt,
    "CURRENT187_CONNECTION_PROBE_LEDGER_REVOCATION_RECEIPT_INVALID",
    "Persisted revocation time",
  );
  const attached = current187AdmissionDeepFreeze({ ...receipt });
  VERIFIED_PERSISTED_REVOCATION_RECEIPTS.add(attached);
  return attached;
}

export function isVerifiedPersistedCurrent187ConnectionProbeRevocationReceipt(
  value,
) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_PERSISTED_REVOCATION_RECEIPTS.has(value)
  );
}

export const CURRENT187_CONNECTION_PROBE_LEDGER_CONTRACT =
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
