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
import { CURRENT187_ADMISSION_VERIFICATION_MODE_SYNTHETIC_LOOPBACK_CI } from "./identity-mail-cluster-application-admission-current187-authority.mjs";
import { isVerifiedCurrent187SemanticAllowlistReceipt } from "./identity-mail-cluster-semantic-allowlist-current187.mjs";

export const CURRENT187_SEMANTIC_APPROVAL_LEDGER_SLICE =
  "CURRENT187_I_PERSISTED_SEMANTIC_APPROVAL_CONSUMPTION_REVOCATION_LEDGER";
export const CURRENT187_SEMANTIC_APPROVAL_LEDGER_PROFILE =
  "CURRENT187_SEMANTIC_APPROVAL_LEDGER_SYNTHETIC_CI_V1";
export const CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_KIND =
  "CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_COMMAND";
export const CURRENT187_SEMANTIC_APPROVAL_REVOCATION_KIND =
  "CURRENT187_SEMANTIC_APPROVAL_REVOCATION_COMMAND";
export const CURRENT187_SEMANTIC_APPROVAL_REVOCATION_PURPOSE =
  "CURRENT187_SEMANTIC_APPROVAL_REVOCATION_V1";
export const CURRENT187_SEMANTIC_APPROVAL_REVOCATION_TRUST_DOMAIN =
  "LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_REVOCATION_AUTHORITY_V1";
export const CURRENT187_SEMANTIC_APPROVAL_REVOCATION_CONFIRMATION =
  "revoke-current187-semantic-approval-loopback-ci-only";

const CONSUMPTION_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_COMMAND_V1";
const REVOCATION_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_REVOCATION_COMMAND_V1";
const RECEIPT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_LEDGER_RECEIPT_V1";
const REVOCATION_RECEIPT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_REVOCATION_RECEIPT_V1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TRANSACTION_ID_PATTERN = /^[1-9][0-9]{0,19}$/u;
const REVOCATION_SCOPES = new Set([
  "APPROVAL",
  "DOCUMENT",
  "EVALUATION",
  "ROOT",
]);
const SENSITIVE_PATTERN =
  /(?:@|BEGIN [A-Z ]+KEY|https?:\/\/|password|privateKey|secret|accessToken|refreshToken|providerMessageId)/iu;

const CONSUMPTION_COMMAND_KEYS = Object.freeze(
  [
    "approvalDigest",
    "authorityIssuedAt",
    "authorityValidUntil",
    "authorityVerificationMode",
    "authorityVerifiedAt",
    "clusterIdentityDigest",
    "contract",
    "databaseUniverseDigest",
    "documentApprovedAt",
    "documentDigest",
    "documentValidUntil",
    "environment",
    "evaluationDigest",
    "kind",
    "nonce",
    "operationId",
    "policyRevision",
    "profile",
    "publicKeyFingerprint",
    "reviewEvidenceDigest",
    "schemaVersion",
    "semanticRiskFactsDigest",
    "signingKeyId",
    "slice",
    "syntheticVerification",
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
    "approvalDigest",
    "contract",
    "documentDigest",
    "environment",
    "evaluationDigest",
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
    "approvalDigest",
    "authorization",
    "canApply",
    "canMutate",
    "canSend",
    "commandDigest",
    "consumedAt",
    "documentDigest",
    "evaluationDigest",
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
  ].sort(),
);

const PERSISTED_REVOCATION_RECEIPT_KEYS = Object.freeze(
  [
    "approvalDigest",
    "authorization",
    "canApply",
    "canMutate",
    "canSend",
    "commandDigest",
    "documentDigest",
    "evaluationDigest",
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

function assertSecretFree(value, reasonCode) {
  const canonical = current187AdmissionCanonicalJson(value);
  if (
    Buffer.byteLength(canonical, "utf8") > 16 * 1024 ||
    SENSITIVE_PATTERN.test(canonical)
  ) {
    current187AdmissionFail(
      reasonCode,
      "The CURRENT187 semantic approval command must be bounded and secret-free.",
    );
  }
  return canonical;
}

function assertDenyOnlySemanticReceipt(receipt) {
  if (
    !isVerifiedCurrent187SemanticAllowlistReceipt(receipt) ||
    receipt.semanticAllowlistStatus !== "MATCHED_DENY_ONLY" ||
    receipt.semanticAllowlistMatched !== true ||
    receipt.policyAllowlistEvaluated !== true ||
    receipt.authorization !== false ||
    receipt.canMutate !== false ||
    receipt.canSend !== false ||
    receipt.deploymentGoConsumable !== false ||
    receipt.testAccessAuthorized !== false ||
    receipt.sharedBetaAccess !== false ||
    receipt.productionRootEnrolled !== false ||
    receipt.persistedConsumptionVerified !== false ||
    receipt.sourceAuthorityVerificationMode !==
      CURRENT187_ADMISSION_VERIFICATION_MODE_SYNTHETIC_LOOPBACK_CI
  ) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_SOURCE_RECEIPT_DENIED",
      "The ledger accepts only a branded synthetic deny-only semantic approval receipt.",
    );
  }
}

function assertSourceBindings(receipt) {
  if (
    !UUID_PATTERN.test(receipt.sourceOperationId) ||
    !current187AdmissionValidDigest(receipt.sourceNonce) ||
    !current187AdmissionValidDigest(receipt.sourceAuthorityPayloadDigest) ||
    !current187AdmissionValidDigest(
      receipt.sourceAuthorityPublicKeyFingerprint,
    ) ||
    !current187AdmissionValidKeyId(receipt.sourceAuthoritySigningKeyId) ||
    !current187AdmissionValidDigest(receipt.sourceClusterIdentityDigest) ||
    !current187AdmissionValidDigest(receipt.sourceDatabaseUniverseDigest) ||
    !current187AdmissionValidDigest(receipt.sourceDocumentDigest) ||
    !current187AdmissionValidDigest(receipt.sourceReviewEvidenceDigest) ||
    !current187AdmissionValidDigest(receipt.sourceSemanticRiskFactsDigest) ||
    !current187AdmissionValidDigest(
      receipt.semanticAllowlistEvaluationDigest,
    ) ||
    !Number.isSafeInteger(receipt.policyRevision) ||
    receipt.policyRevision < 1
  ) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_SOURCE_BINDING_INVALID",
      "The semantic approval receipt is missing an exact persisted-ledger binding.",
    );
  }
}

function createBundle(kind, domain, command) {
  const commandCanonicalJson = assertSecretFree(
    command,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_COMMAND_UNSAFE",
  );
  return current187AdmissionDeepFreeze({
    command,
    commandCanonicalJson,
    commandDigest: digest(domain, commandCanonicalJson),
    kind,
  });
}

export function createCurrent187SemanticApprovalConsumptionBundle(
  receipt,
  now,
) {
  if (arguments.length !== 2) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_ARGUMENTS_INVALID",
      "Consumption construction requires a branded receipt and explicit time.",
    );
  }
  assertDenyOnlySemanticReceipt(receipt);
  assertSourceBindings(receipt);
  const nowMs = canonicalEpoch(
    now,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_TIME_INVALID",
    "Consumption time",
  );
  const authorityIssuedAt = canonicalEpoch(
    receipt.sourceAuthorityIssuedAt,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_SOURCE_RECEIPT_DENIED",
    "Authority issue time",
  );
  const authorityValidUntil = canonicalEpoch(
    receipt.sourceAuthorityValidUntil,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_SOURCE_RECEIPT_DENIED",
    "Authority expiry",
  );
  const authorityVerifiedAt = canonicalEpoch(
    receipt.sourceAuthorityVerifiedAt,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_SOURCE_RECEIPT_DENIED",
    "Authority verification time",
  );
  const documentApprovedAt = canonicalEpoch(
    receipt.sourceDocumentApprovedAt,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_SOURCE_RECEIPT_DENIED",
    "Document approval time",
  );
  const documentValidUntil = canonicalEpoch(
    receipt.sourceDocumentValidUntil,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_SOURCE_RECEIPT_DENIED",
    "Document expiry",
  );
  if (
    authorityIssuedAt > authorityVerifiedAt ||
    authorityVerifiedAt > nowMs ||
    authorityValidUntil <= nowMs ||
    documentApprovedAt > nowMs ||
    documentValidUntil <= nowMs
  ) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_SOURCE_RECEIPT_EXPIRED",
      "The semantic approval or allowlist document is not active at consumption time.",
    );
  }

  const values = {
    approvalDigest: receipt.sourceAuthorityPayloadDigest,
    authorityIssuedAt: receipt.sourceAuthorityIssuedAt,
    authorityValidUntil: receipt.sourceAuthorityValidUntil,
    authorityVerificationMode: receipt.sourceAuthorityVerificationMode,
    authorityVerifiedAt: receipt.sourceAuthorityVerifiedAt,
    clusterIdentityDigest: receipt.sourceClusterIdentityDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: receipt.sourceDatabaseUniverseDigest,
    documentApprovedAt: receipt.sourceDocumentApprovedAt,
    documentDigest: receipt.sourceDocumentDigest,
    documentValidUntil: receipt.sourceDocumentValidUntil,
    environment: "ci",
    evaluationDigest: receipt.semanticAllowlistEvaluationDigest,
    kind: CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_KIND,
    nonce: receipt.sourceNonce,
    operationId: receipt.sourceOperationId,
    policyRevision: receipt.policyRevision,
    profile: CURRENT187_SEMANTIC_APPROVAL_LEDGER_PROFILE,
    publicKeyFingerprint: receipt.sourceAuthorityPublicKeyFingerprint,
    reviewEvidenceDigest: receipt.sourceReviewEvidenceDigest,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    semanticRiskFactsDigest: receipt.sourceSemanticRiskFactsDigest,
    signingKeyId: receipt.sourceAuthoritySigningKeyId,
    slice: CURRENT187_SEMANTIC_APPROVAL_LEDGER_SLICE,
    syntheticVerification: true,
  };
  const command = Object.fromEntries(
    CONSUMPTION_COMMAND_KEYS.map((key) => [key, values[key]]),
  );
  return createBundle(
    CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_KIND,
    CONSUMPTION_DIGEST_DOMAIN,
    command,
  );
}

export function createSyntheticCurrent187SemanticApprovalRevocationBundle(
  receipt,
  inputValue,
) {
  if (arguments.length !== 2) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_ARGUMENTS_INVALID",
      "Revocation construction requires a branded receipt and exact input.",
    );
  }
  assertDenyOnlySemanticReceipt(receipt);
  assertSourceBindings(receipt);
  const input = current187AdmissionExactDataRecord(
    inputValue,
    REVOCATION_INPUT_KEYS,
    "CURRENT187_SEMANTIC_APPROVAL_REVOCATION_INPUT_INVALID",
    "The synthetic semantic approval revocation must be exact and data-only.",
  );
  const revokedAt = canonicalEpoch(
    input.revokedAt,
    "CURRENT187_SEMANTIC_APPROVAL_REVOCATION_INPUT_INVALID",
    "Revocation time",
  );
  const verifiedAt = canonicalEpoch(
    receipt.sourceAuthorityVerifiedAt,
    "CURRENT187_SEMANTIC_APPROVAL_REVOCATION_INPUT_INVALID",
    "Authority verification time",
  );
  if (
    input.explicitConfirmation !==
      CURRENT187_SEMANTIC_APPROVAL_REVOCATION_CONFIRMATION ||
    !UUID_PATTERN.test(input.eventId) ||
    !REVOCATION_SCOPES.has(input.scope) ||
    !current187AdmissionValidDigest(input.actorDigest) ||
    !current187AdmissionValidDigest(input.reasonDigest) ||
    revokedAt < verifiedAt ||
    revokedAt - verifiedAt > 30 * 60 * 1_000
  ) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_REVOCATION_INPUT_INVALID",
      "The synthetic revocation is invalid or outside its bounded CI window.",
    );
  }
  const scopeDigest = {
    APPROVAL: receipt.sourceAuthorityPayloadDigest,
    DOCUMENT: receipt.sourceDocumentDigest,
    EVALUATION: receipt.semanticAllowlistEvaluationDigest,
    ROOT: receipt.sourceAuthorityPublicKeyFingerprint,
  }[input.scope];
  const values = {
    actorDigest: input.actorDigest,
    approvalDigest: receipt.sourceAuthorityPayloadDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    documentDigest: receipt.sourceDocumentDigest,
    environment: "ci",
    evaluationDigest: receipt.semanticAllowlistEvaluationDigest,
    eventId: input.eventId,
    kind: CURRENT187_SEMANTIC_APPROVAL_REVOCATION_KIND,
    profile: CURRENT187_SEMANTIC_APPROVAL_LEDGER_PROFILE,
    publicKeyFingerprint: receipt.sourceAuthorityPublicKeyFingerprint,
    purpose: CURRENT187_SEMANTIC_APPROVAL_REVOCATION_PURPOSE,
    reasonDigest: input.reasonDigest,
    revokedAt: input.revokedAt,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    scope: input.scope,
    scopeDigest,
    slice: CURRENT187_SEMANTIC_APPROVAL_LEDGER_SLICE,
    trustDomain: CURRENT187_SEMANTIC_APPROVAL_REVOCATION_TRUST_DOMAIN,
  };
  const command = Object.fromEntries(
    REVOCATION_COMMAND_KEYS.map((key) => [key, values[key]]),
  );
  return createBundle(
    CURRENT187_SEMANTIC_APPROVAL_REVOCATION_KIND,
    REVOCATION_DIGEST_DOMAIN,
    command,
  );
}

export function current187SemanticApprovalLedgerDatabaseArguments(bundleValue) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_ARGUMENTS_INVALID",
      "Database argument projection accepts exactly one bundle.",
    );
  }
  const bundle = current187AdmissionExactDataRecord(
    bundleValue,
    ["command", "commandCanonicalJson", "commandDigest", "kind"],
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_BUNDLE_INVALID",
    "The semantic approval ledger bundle must be exact and data-only.",
  );
  const keys =
    bundle.kind === CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_KIND
      ? CONSUMPTION_COMMAND_KEYS
      : bundle.kind === CURRENT187_SEMANTIC_APPROVAL_REVOCATION_KIND
        ? REVOCATION_COMMAND_KEYS
        : null;
  const domain =
    bundle.kind === CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_KIND
      ? CONSUMPTION_DIGEST_DOMAIN
      : REVOCATION_DIGEST_DOMAIN;
  if (!keys) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_BUNDLE_INVALID",
      "The semantic approval ledger bundle kind is invalid.",
    );
  }
  const command = current187AdmissionExactDataRecord(
    bundle.command,
    keys,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_BUNDLE_INVALID",
    "The semantic approval ledger command shape is invalid.",
  );
  const canonical = assertSecretFree(
    command,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_BUNDLE_INVALID",
  );
  if (
    canonical !== bundle.commandCanonicalJson ||
    digest(domain, canonical) !== bundle.commandDigest
  ) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_BUNDLE_INVALID",
      "The semantic approval ledger bundle digest is invalid.",
    );
  }
  return Object.freeze([bundle.commandCanonicalJson, bundle.commandDigest]);
}

function parseDatabaseReceipt(text, keys, reasonCode) {
  if (
    typeof text !== "string" ||
    Buffer.byteLength(text, "utf8") > 16 * 1024 ||
    SENSITIVE_PATTERN.test(text)
  ) {
    current187AdmissionFail(reasonCode, "The persisted receipt is invalid.");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    current187AdmissionFail(reasonCode, "The persisted receipt is not JSON.");
  }
  return current187AdmissionExactDataRecord(
    parsed,
    keys,
    reasonCode,
    "The persisted receipt shape is invalid.",
  );
}

function persistedConsumptionReceiptDigest(receipt) {
  const value = { ...receipt };
  delete value.receiptDigest;
  return digest(RECEIPT_DIGEST_DOMAIN, current187AdmissionCanonicalJson(value));
}

function persistedRevocationReceiptDigest(receipt) {
  const value = { ...receipt };
  delete value.receiptDigest;
  return digest(
    REVOCATION_RECEIPT_DIGEST_DOMAIN,
    current187AdmissionCanonicalJson(value),
  );
}

function assertConsumptionCommandMatchesSource(sourceReceipt, command) {
  const bindings = [
    [command.approvalDigest, sourceReceipt.sourceAuthorityPayloadDigest],
    [command.authorityIssuedAt, sourceReceipt.sourceAuthorityIssuedAt],
    [command.authorityValidUntil, sourceReceipt.sourceAuthorityValidUntil],
    [
      command.authorityVerificationMode,
      sourceReceipt.sourceAuthorityVerificationMode,
    ],
    [command.authorityVerifiedAt, sourceReceipt.sourceAuthorityVerifiedAt],
    [command.clusterIdentityDigest, sourceReceipt.sourceClusterIdentityDigest],
    [
      command.databaseUniverseDigest,
      sourceReceipt.sourceDatabaseUniverseDigest,
    ],
    [command.documentApprovedAt, sourceReceipt.sourceDocumentApprovedAt],
    [command.documentDigest, sourceReceipt.sourceDocumentDigest],
    [command.documentValidUntil, sourceReceipt.sourceDocumentValidUntil],
    [command.evaluationDigest, sourceReceipt.semanticAllowlistEvaluationDigest],
    [command.nonce, sourceReceipt.sourceNonce],
    [command.operationId, sourceReceipt.sourceOperationId],
    [command.policyRevision, sourceReceipt.policyRevision],
    [
      command.publicKeyFingerprint,
      sourceReceipt.sourceAuthorityPublicKeyFingerprint,
    ],
    [command.reviewEvidenceDigest, sourceReceipt.sourceReviewEvidenceDigest],
    [
      command.semanticRiskFactsDigest,
      sourceReceipt.sourceSemanticRiskFactsDigest,
    ],
    [command.signingKeyId, sourceReceipt.sourceAuthoritySigningKeyId],
  ];
  if (bindings.some(([actual, expected]) => actual !== expected)) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_SOURCE_BUNDLE_MISMATCH",
      "The persisted consumption bundle does not belong to the supplied semantic approval receipt.",
    );
  }
}

export function attachPersistedCurrent187SemanticApprovalConsumption(
  sourceReceipt,
  bundleValue,
  databaseReceiptText,
) {
  if (arguments.length !== 3) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_ARGUMENTS_INVALID",
      "Persisted consumption attachment requires source, bundle, and database receipt.",
    );
  }
  assertDenyOnlySemanticReceipt(sourceReceipt);
  const [, commandDigest] =
    current187SemanticApprovalLedgerDatabaseArguments(bundleValue);
  const command = bundleValue.command;
  assertConsumptionCommandMatchesSource(sourceReceipt, command);
  const receipt = parseDatabaseReceipt(
    databaseReceiptText,
    PERSISTED_CONSUMPTION_RECEIPT_KEYS,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_RECEIPT_INVALID",
  );
  if (
    bundleValue.kind !== CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_KIND ||
    receipt.kind !== "CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_RECEIPT" ||
    receipt.status !== "CONSUMED" ||
    receipt.operationId !== command.operationId ||
    receipt.nonce !== command.nonce ||
    receipt.approvalDigest !== command.approvalDigest ||
    receipt.evaluationDigest !== command.evaluationDigest ||
    receipt.documentDigest !== command.documentDigest ||
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
    receipt.receiptDigest !== persistedConsumptionReceiptDigest(receipt)
  ) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_RECEIPT_INVALID",
      "The persisted consumption receipt failed its exact deny-only binding.",
    );
  }
  canonicalEpoch(
    receipt.consumedAt,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_RECEIPT_INVALID",
    "Persisted consumption time",
  );
  const attached = current187AdmissionDeepFreeze({
    ...sourceReceipt,
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    noncanonicalPersistedSemanticApprovalLedger: true,
    persistedConsumptionVerified: true,
    persistedSemanticApprovalReceiptDigest: receipt.receiptDigest,
    productionRootEnrolled: false,
    sharedBetaAccess: false,
    testAccessAuthorized: false,
  });
  VERIFIED_PERSISTED_CONSUMPTION_RECEIPTS.add(attached);
  return attached;
}

export function isVerifiedPersistedCurrent187SemanticApprovalReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_PERSISTED_CONSUMPTION_RECEIPTS.has(value)
  );
}

export function attachPersistedCurrent187SemanticApprovalRevocation(
  bundleValue,
  databaseReceiptText,
) {
  if (arguments.length !== 2) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_ARGUMENTS_INVALID",
      "Persisted revocation attachment requires a bundle and database receipt.",
    );
  }
  const [, commandDigest] =
    current187SemanticApprovalLedgerDatabaseArguments(bundleValue);
  const receipt = parseDatabaseReceipt(
    databaseReceiptText,
    PERSISTED_REVOCATION_RECEIPT_KEYS,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_REVOCATION_RECEIPT_INVALID",
  );
  const command = bundleValue.command;
  if (
    bundleValue.kind !== CURRENT187_SEMANTIC_APPROVAL_REVOCATION_KIND ||
    receipt.kind !== "CURRENT187_SEMANTIC_APPROVAL_REVOCATION_RECEIPT" ||
    receipt.status !== "REVOKED" ||
    receipt.eventId !== command.eventId ||
    receipt.scope !== command.scope ||
    receipt.scopeDigest !== command.scopeDigest ||
    receipt.approvalDigest !== command.approvalDigest ||
    receipt.evaluationDigest !== command.evaluationDigest ||
    receipt.documentDigest !== command.documentDigest ||
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
    receipt.receiptDigest !== persistedRevocationReceiptDigest(receipt)
  ) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_APPROVAL_LEDGER_REVOCATION_RECEIPT_INVALID",
      "The persisted revocation receipt failed its exact deny-only binding.",
    );
  }
  canonicalEpoch(
    receipt.revokedAt,
    "CURRENT187_SEMANTIC_APPROVAL_LEDGER_REVOCATION_RECEIPT_INVALID",
    "Persisted revocation time",
  );
  const attached = current187AdmissionDeepFreeze({ ...receipt });
  VERIFIED_PERSISTED_REVOCATION_RECEIPTS.add(attached);
  return attached;
}

export function isVerifiedPersistedCurrent187SemanticApprovalRevocationReceipt(
  value,
) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_PERSISTED_REVOCATION_RECEIPTS.has(value)
  );
}

export const CURRENT187_SEMANTIC_APPROVAL_LEDGER_CONTRACT =
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
