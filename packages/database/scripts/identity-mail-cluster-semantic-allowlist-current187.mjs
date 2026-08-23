import { createHash } from "node:crypto";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_PURPOSE,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionValidDigest,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import { isVerifiedCurrent187AdmissionReceipt } from "./identity-mail-cluster-application-admission-current187-authority.mjs";
import { isVerifiedCurrent187ClusterInventoryReceipt } from "./identity-mail-cluster-inventory-current187-planner.mjs";

export const CURRENT187_SEMANTIC_ALLOWLIST_SLICE =
  "CURRENT187_H_INDEPENDENT_SIGNED_SEMANTIC_ALLOWLIST";
export const CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_KIND =
  "CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT";
export const CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_PROFILE =
  "CURRENT187_SECRET_FREE_EXACT_FACTS_ALLOWLIST_V1";
export const CURRENT187_SEMANTIC_ALLOWLIST_RECEIPT_KIND =
  "CURRENT187_SEMANTIC_ALLOWLIST_DENY_ONLY_RECEIPT";

const DOCUMENT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_V1";
const RECEIPT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_SEMANTIC_ALLOWLIST_RECEIPT_V1";
const MAX_DOCUMENT_LIFETIME_MS = 90 * 24 * 60 * 60 * 1_000;

const DOCUMENT_KEYS = Object.freeze(
  [
    "approvedAt",
    "clusterIdentityDigest",
    "contract",
    "databaseUniverseDigest",
    "kind",
    "policyRevision",
    "profile",
    "reviewEvidenceDigest",
    "schemaVersion",
    "semanticRiskFactsDigest",
    "slice",
    "validUntil",
  ].sort(),
);

const VERIFIED_CURRENT187_SEMANTIC_ALLOWLIST_RECEIPTS = new WeakSet();

function canonicalIsoEpoch(value) {
  if (typeof value !== "string") {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_INVALID",
      "Semantic allowlist timestamps must be canonical UTC values.",
    );
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_INVALID",
      "Semantic allowlist timestamps must be canonical UTC values.",
    );
  }
  return epoch;
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
}

function normalizeDocument(value) {
  const document = current187AdmissionExactDataRecord(
    value,
    DOCUMENT_KEYS,
    "CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_INVALID",
    "The semantic allowlist document must be exact and data-only.",
  );
  const approvedAt = canonicalIsoEpoch(document.approvedAt);
  const validUntil = canonicalIsoEpoch(document.validUntil);
  if (
    document.contract !== CURRENT187_ADMISSION_CONTRACT ||
    document.kind !== CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_KIND ||
    document.profile !== CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_PROFILE ||
    document.schemaVersion !== CURRENT187_ADMISSION_SCHEMA_VERSION ||
    document.slice !== CURRENT187_SEMANTIC_ALLOWLIST_SLICE ||
    !Number.isSafeInteger(document.policyRevision) ||
    document.policyRevision < 1 ||
    document.policyRevision > 1_000_000 ||
    !current187AdmissionValidDigest(document.clusterIdentityDigest) ||
    !current187AdmissionValidDigest(document.databaseUniverseDigest) ||
    !current187AdmissionValidDigest(document.reviewEvidenceDigest) ||
    !current187AdmissionValidDigest(document.semanticRiskFactsDigest) ||
    validUntil <= approvedAt ||
    validUntil - approvedAt > MAX_DOCUMENT_LIFETIME_MS
  ) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_INVALID",
      "The semantic allowlist document failed its exact deny-only contract.",
    );
  }
  return current187AdmissionDeepFreeze({ ...document });
}

export function current187SemanticAllowlistDocumentDigest(value) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_ALLOWLIST_ARGUMENTS_INVALID",
      "Semantic allowlist document hashing accepts exactly one value.",
    );
  }
  return digest(DOCUMENT_DIGEST_DOMAIN, normalizeDocument(value));
}

function assertInputs(plannerReceipt, authorityReceipt) {
  if (!isVerifiedCurrent187ClusterInventoryReceipt(plannerReceipt)) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_ALLOWLIST_FACTS_RECEIPT_INVALID",
      "Semantic allowlist evaluation requires an exact branded CURRENT187 planner receipt.",
    );
  }
  if (!isVerifiedCurrent187AdmissionReceipt(authorityReceipt)) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_ALLOWLIST_AUTHORITY_RECEIPT_INVALID",
      "Semantic allowlist evaluation requires an exact branded independent authority receipt.",
    );
  }
}

export function evaluateCurrent187SemanticAllowlist(
  plannerReceipt,
  documentValue,
  authorityReceipt,
) {
  if (arguments.length !== 3) {
    current187AdmissionFail(
      "CURRENT187_SEMANTIC_ALLOWLIST_ARGUMENTS_INVALID",
      "Semantic allowlist evaluation requires planner, document, and authority receipts.",
    );
  }
  assertInputs(plannerReceipt, authorityReceipt);
  const document = normalizeDocument(documentValue);
  const documentDigest = digest(DOCUMENT_DIGEST_DOMAIN, document);
  const payload = authorityReceipt.envelope.payload;
  const reasons = new Set();

  if (
    plannerReceipt.inventoryStatus !== "MATCHED" ||
    plannerReceipt.inventoryProjectionMatched !== true ||
    plannerReceipt.semanticRiskFactsStatus !== "FACTS_EXTRACTED_DENY_ONLY" ||
    !current187AdmissionValidDigest(plannerReceipt.semanticRiskFactsDigest)
  ) {
    reasons.add("CURRENT187_SEMANTIC_ALLOWLIST_FACTS_UNAVAILABLE");
  }
  if (
    payload.purpose !== CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_PURPOSE ||
    payload.environment !== "production"
  ) {
    reasons.add("CURRENT187_SEMANTIC_ALLOWLIST_INDEPENDENT_AUTHORITY_REQUIRED");
  }
  if (payload.semanticAllowlistDocumentDigest !== documentDigest) {
    reasons.add("CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_DIGEST_MISMATCH");
  }
  if (
    payload.clusterIdentityDigest !== plannerReceipt.clusterIdentityDigest ||
    document.clusterIdentityDigest !== plannerReceipt.clusterIdentityDigest
  ) {
    reasons.add("CURRENT187_SEMANTIC_ALLOWLIST_CLUSTER_IDENTITY_MISMATCH");
  }
  if (
    payload.databaseUniverseDigest !==
      plannerReceipt.expectedDatabaseUniverseDigest ||
    document.databaseUniverseDigest !==
      plannerReceipt.expectedDatabaseUniverseDigest
  ) {
    reasons.add("CURRENT187_SEMANTIC_ALLOWLIST_DATABASE_UNIVERSE_MISMATCH");
  }
  if (
    payload.semanticRiskFactsDigest !==
      plannerReceipt.semanticRiskFactsDigest ||
    document.semanticRiskFactsDigest !== plannerReceipt.semanticRiskFactsDigest
  ) {
    reasons.add("CURRENT187_SEMANTIC_ALLOWLIST_FACTS_DIGEST_MISMATCH");
  }
  if (payload.reviewEvidenceDigest !== document.reviewEvidenceDigest) {
    reasons.add("CURRENT187_SEMANTIC_ALLOWLIST_REVIEW_EVIDENCE_MISMATCH");
  }

  const verifiedAt = Date.parse(authorityReceipt.verifiedAt);
  if (
    !Number.isFinite(verifiedAt) ||
    verifiedAt < Date.parse(document.approvedAt) ||
    verifiedAt >= Date.parse(document.validUntil)
  ) {
    reasons.add("CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_INACTIVE");
  }

  const reasonCodes = Object.freeze([...reasons].sort());
  const matched = reasonCodes.length === 0;
  const publicReceipt = {
    authorization: false,
    canMutate: false,
    canSend: false,
    contract: CURRENT187_ADMISSION_CONTRACT,
    deploymentGoConsumable: false,
    kind: CURRENT187_SEMANTIC_ALLOWLIST_RECEIPT_KIND,
    persistedConsumptionVerified: false,
    policyAllowlistEvaluated: true,
    policyRevision: document.policyRevision,
    productionRootEnrolled: false,
    reasonCodes,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    semanticAllowlistMatched: matched,
    semanticAllowlistStatus: matched ? "MATCHED_DENY_ONLY" : "DENIED",
    sharedBetaAccess: false,
    slice: CURRENT187_SEMANTIC_ALLOWLIST_SLICE,
    sourceAuthorityIssuedAt: payload.issuedAt,
    sourceAuthorityPayloadDigest: authorityReceipt.envelope.payloadDigest,
    sourceAuthorityPublicKeyFingerprint:
      authorityReceipt.envelope.publicKeyFingerprint,
    sourceAuthoritySigningKeyId: authorityReceipt.envelope.signingKeyId,
    sourceAuthorityValidUntil: payload.validUntil,
    sourceAuthorityVerifiedAt: authorityReceipt.verifiedAt,
    sourceAuthorityVerificationMode: authorityReceipt.verificationMode,
    sourceClusterIdentityDigest: plannerReceipt.clusterIdentityDigest,
    sourceDatabaseUniverseDigest: plannerReceipt.expectedDatabaseUniverseDigest,
    sourceDocumentApprovedAt: document.approvedAt,
    sourceDocumentDigest: documentDigest,
    sourceDocumentValidUntil: document.validUntil,
    sourceNonce: payload.nonce,
    sourceOperationId: payload.operationId,
    sourceReviewEvidenceDigest: document.reviewEvidenceDigest,
    sourceSemanticRiskFactsDigest: plannerReceipt.semanticRiskFactsDigest,
    testAccessAuthorized: false,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    semanticAllowlistEvaluationDigest: digest(
      RECEIPT_DIGEST_DOMAIN,
      publicReceipt,
    ),
  });
  VERIFIED_CURRENT187_SEMANTIC_ALLOWLIST_RECEIPTS.add(receipt);
  return receipt;
}

export function isVerifiedCurrent187SemanticAllowlistReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_CURRENT187_SEMANTIC_ALLOWLIST_RECEIPTS.has(value)
  );
}
