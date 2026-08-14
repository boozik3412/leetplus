import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { types as utilTypes } from "node:util";

import { isPreparedLangameRuntimeTrustBootstrapLifecycleCurrent200 } from "./langame-runtime-trust-bootstrap-lifecycle-current200.mjs";
import {
  langameRuntimeTrustBootstrapRegistryDigestCurrent198,
  parsePinnedLangameRuntimeTrustBootstrapRegistryCurrent198,
  validateLangameRuntimeTrustBootstrapRegistryCurrent198,
  validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198,
} from "./langame-runtime-trust-bootstrap-registry-current198-contract.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CONTRACT =
  "LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_V1";
export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_PREPARED_STATUS =
  "TWO_PERSON_PUBLIC_REVIEW_PACKET_PREPARED_DENY_ONLY";
export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_VERIFIED_STATUS =
  "TWO_PERSON_PUBLIC_REVIEW_EVIDENCE_VERIFIED_DENY_ONLY";
export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_MAX_LIFETIME_MS =
  24 * 60 * 60 * 1_000;
export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_MAX_SKEW_MS =
  30 * 1_000;

const REQUEST_KEYS = Object.freeze(
  [
    "ceremonyId",
    "createdAt",
    "expiresAt",
    "operatorId",
    "operatorPublicKeyPem",
    "reviewerId",
    "reviewerPublicKeyPem",
  ].sort(),
);
const EVIDENCE_KEYS = Object.freeze(
  ["operatorSignature", "reviewerSignature"].sort(),
);
const PARTICIPANT_PAYLOAD_KEYS = Object.freeze(
  [
    "candidateRegistryDigest",
    "ceremonyId",
    "contract",
    "createdAt",
    "currentRegistryDigest",
    "expiresAt",
    "operation",
    "operationDigest",
    "operationId",
    "participantId",
    "participantPublicKeyFingerprint",
    "participantRole",
    "reasonDigest",
  ].sort(),
);
const VERIFIED_RECEIPT_KEYS = Object.freeze(
  [
    "authorization",
    "canApply",
    "canEnrollProductionRoots",
    "candidateCanonicalJson",
    "candidateRegistryDigest",
    "ceremonyId",
    "contract",
    "createdAt",
    "currentRegistryDigest",
    "expiresAt",
    "operation",
    "operationDigest",
    "operationId",
    "operatorId",
    "operatorPayloadCanonicalJson",
    "operatorPublicKeyFingerprint",
    "operatorPublicKeyPem",
    "operatorSignature",
    "productionExecutionAllowed",
    "productionRootEnrolled",
    "reasonDigest",
    "reviewEvidenceDigest",
    "reviewerId",
    "reviewerPayloadCanonicalJson",
    "reviewerPublicKeyFingerprint",
    "reviewerPublicKeyPem",
    "reviewerSignature",
    "sharedBetaAccess",
    "status",
    "testAccessAuthorized",
  ].sort(),
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PARTICIPANT_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/u;
const PREPARED_PACKETS = new WeakSet();
const VERIFIED_EVIDENCE = new WeakSet();

export class LangameRuntimeTrustBootstrapCeremonyCurrent201Error extends Error {
  constructor(code) {
    super("CURRENT201 Langame bootstrap ceremony rejected the input.");
    this.name = "LangameRuntimeTrustBootstrapCeremonyCurrent201Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameRuntimeTrustBootstrapCeremonyCurrent201Error(code);
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

function publicKey(publicKeyPem) {
  if (
    typeof publicKeyPem !== "string" ||
    publicKeyPem.length > 4_096 ||
    !publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----\n") ||
    !publicKeyPem.endsWith("-----END PUBLIC KEY-----\n")
  ) {
    fail("CURRENT201_CEREMONY_PUBLIC_KEY_INVALID");
  }
  let key;
  let canonical;
  try {
    key = createPublicKey(publicKeyPem);
    canonical = key.export({ format: "pem", type: "spki" });
  } catch {
    fail("CURRENT201_CEREMONY_PUBLIC_KEY_INVALID");
  }
  if (key.asymmetricKeyType !== "ed25519" || canonical !== publicKeyPem) {
    fail("CURRENT201_CEREMONY_PUBLIC_KEY_INVALID");
  }
  return Object.freeze({
    fingerprint: createHash("sha256")
      .update(key.export({ format: "der", type: "spki" }))
      .digest("hex"),
    key,
    pem: publicKeyPem,
  });
}

function digest(domain, value) {
  return createHash("sha256")
    .update(
      `${LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CONTRACT}\n${domain}\n`,
      "utf8",
    )
    .update(canonicalStringify(value), "utf8")
    .digest("hex");
}

function participantPayload(common, role, participantId, fingerprint) {
  return Object.freeze({
    ...common,
    participantId,
    participantPublicKeyFingerprint: fingerprint,
    participantRole: role,
  });
}

function assertPreparedTransition(value) {
  if (!isPreparedLangameRuntimeTrustBootstrapLifecycleCurrent200(value)) {
    fail("CURRENT201_CEREMONY_TRANSITION_INVALID");
  }
  for (const key of [
    "candidateRegistryDigest",
    "currentRegistryDigest",
    "operationDigest",
    "reasonDigest",
  ]) {
    if (!SHA256_PATTERN.test(value[key])) {
      fail("CURRENT201_CEREMONY_TRANSITION_INVALID");
    }
  }
  if (
    typeof value.candidateCanonicalJson !== "string" ||
    value.candidateCanonicalJson.length < 2 ||
    value.candidateCanonicalJson.length > 64 * 1_024 ||
    value.authorization !== false ||
    value.canApply !== false ||
    value.productionExecutionAllowed !== false ||
    value.testAccessAuthorized !== false
  ) {
    fail("CURRENT201_CEREMONY_TRANSITION_INVALID");
  }
}

export function prepareLangameRuntimeTrustBootstrapCeremonyCurrent201(
  preparedTransition,
  requestValue,
  now,
) {
  if (arguments.length !== 3) {
    fail("CURRENT201_CEREMONY_ARGUMENTS_INVALID");
  }
  assertPreparedTransition(preparedTransition);
  const request = exactRecord(
    requestValue,
    REQUEST_KEYS,
    "CURRENT201_CEREMONY_REQUEST_INVALID",
  );
  if (
    !UUID_PATTERN.test(request.ceremonyId) ||
    !PARTICIPANT_PATTERN.test(request.operatorId) ||
    !PARTICIPANT_PATTERN.test(request.reviewerId) ||
    request.operatorId === request.reviewerId
  ) {
    fail("CURRENT201_CEREMONY_PARTICIPANTS_INVALID");
  }
  const observedAt = epoch(now, "CURRENT201_CEREMONY_TIMELINE_INVALID");
  const createdAt = epoch(
    request.createdAt,
    "CURRENT201_CEREMONY_TIMELINE_INVALID",
  );
  const expiresAt = epoch(
    request.expiresAt,
    "CURRENT201_CEREMONY_TIMELINE_INVALID",
  );
  if (
    createdAt >
      observedAt +
        LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_MAX_SKEW_MS ||
    observedAt >= expiresAt ||
    expiresAt <= createdAt ||
    expiresAt - createdAt >
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_MAX_LIFETIME_MS
  ) {
    fail("CURRENT201_CEREMONY_TIMELINE_INVALID");
  }
  const operator = publicKey(request.operatorPublicKeyPem);
  const reviewer = publicKey(request.reviewerPublicKeyPem);
  if (operator.fingerprint === reviewer.fingerprint) {
    fail("CURRENT201_CEREMONY_PARTICIPANTS_INVALID");
  }
  const common = Object.freeze({
    candidateRegistryDigest: preparedTransition.candidateRegistryDigest,
    ceremonyId: request.ceremonyId,
    contract: LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CONTRACT,
    createdAt: request.createdAt,
    currentRegistryDigest: preparedTransition.currentRegistryDigest,
    expiresAt: request.expiresAt,
    operation: preparedTransition.operation,
    operationDigest: preparedTransition.operationDigest,
    operationId: preparedTransition.operationId,
    reasonDigest: preparedTransition.reasonDigest,
  });
  const operatorPayload = participantPayload(
    common,
    "OPERATOR",
    request.operatorId,
    operator.fingerprint,
  );
  const reviewerPayload = participantPayload(
    common,
    "INDEPENDENT_REVIEWER",
    request.reviewerId,
    reviewer.fingerprint,
  );
  const packet = Object.freeze({
    authorization: false,
    canApply: false,
    canEnrollProductionRoots: false,
    candidateCanonicalJson: preparedTransition.candidateCanonicalJson,
    candidateRegistryDigest: preparedTransition.candidateRegistryDigest,
    ceremonyId: request.ceremonyId,
    contract: LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CONTRACT,
    createdAt: request.createdAt,
    currentRegistryDigest: preparedTransition.currentRegistryDigest,
    expiresAt: request.expiresAt,
    operation: preparedTransition.operation,
    operationDigest: preparedTransition.operationDigest,
    operationId: preparedTransition.operationId,
    operatorId: request.operatorId,
    operatorPayloadCanonicalJson: canonicalStringify(operatorPayload),
    operatorPublicKeyFingerprint: operator.fingerprint,
    operatorPublicKeyPem: operator.pem,
    productionExecutionAllowed: false,
    productionRootEnrolled: false,
    reasonDigest: preparedTransition.reasonDigest,
    reviewerId: request.reviewerId,
    reviewerPayloadCanonicalJson: canonicalStringify(reviewerPayload),
    reviewerPublicKeyFingerprint: reviewer.fingerprint,
    reviewerPublicKeyPem: reviewer.pem,
    sharedBetaAccess: false,
    status: LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_PREPARED_STATUS,
    testAccessAuthorized: false,
  });
  PREPARED_PACKETS.add(packet);
  return packet;
}

function signature(value) {
  if (typeof value !== "string" || !SIGNATURE_PATTERN.test(value)) {
    fail("CURRENT201_CEREMONY_SIGNATURE_INVALID");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 64 || decoded.toString("base64url") !== value) {
    fail("CURRENT201_CEREMONY_SIGNATURE_INVALID");
  }
  return decoded;
}

export function verifyLangameRuntimeTrustBootstrapCeremonyCurrent201(
  packet,
  evidenceValue,
  now,
) {
  if (arguments.length !== 3 || !PREPARED_PACKETS.has(packet)) {
    fail("CURRENT201_CEREMONY_PACKET_INVALID");
  }
  const evidence = exactRecord(
    evidenceValue,
    EVIDENCE_KEYS,
    "CURRENT201_CEREMONY_EVIDENCE_INVALID",
  );
  const observedAt = epoch(now, "CURRENT201_CEREMONY_TIMELINE_INVALID");
  if (
    observedAt >=
    epoch(packet.expiresAt, "CURRENT201_CEREMONY_TIMELINE_INVALID")
  ) {
    fail("CURRENT201_CEREMONY_EVIDENCE_EXPIRED");
  }
  const operatorSignature = signature(evidence.operatorSignature);
  const reviewerSignature = signature(evidence.reviewerSignature);
  let operatorVerified = false;
  let reviewerVerified = false;
  try {
    operatorVerified = verifySignature(
      null,
      Buffer.from(packet.operatorPayloadCanonicalJson, "utf8"),
      createPublicKey(packet.operatorPublicKeyPem),
      operatorSignature,
    );
    reviewerVerified = verifySignature(
      null,
      Buffer.from(packet.reviewerPayloadCanonicalJson, "utf8"),
      createPublicKey(packet.reviewerPublicKeyPem),
      reviewerSignature,
    );
  } catch {
    fail("CURRENT201_CEREMONY_SIGNATURE_INVALID");
  }
  if (!operatorVerified || !reviewerVerified) {
    fail("CURRENT201_CEREMONY_SIGNATURE_INVALID");
  }
  const reviewEvidenceDigest = digest("REVIEW_EVIDENCE", {
    candidateRegistryDigest: packet.candidateRegistryDigest,
    ceremonyId: packet.ceremonyId,
    currentRegistryDigest: packet.currentRegistryDigest,
    operationDigest: packet.operationDigest,
    operatorPayloadCanonicalJson: packet.operatorPayloadCanonicalJson,
    operatorSignature: evidence.operatorSignature,
    reviewerPayloadCanonicalJson: packet.reviewerPayloadCanonicalJson,
    reviewerSignature: evidence.reviewerSignature,
  });
  const verified = Object.freeze({
    authorization: false,
    canApply: false,
    canEnrollProductionRoots: false,
    candidateCanonicalJson: packet.candidateCanonicalJson,
    candidateRegistryDigest: packet.candidateRegistryDigest,
    ceremonyId: packet.ceremonyId,
    contract: LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CONTRACT,
    createdAt: packet.createdAt,
    currentRegistryDigest: packet.currentRegistryDigest,
    expiresAt: packet.expiresAt,
    operation: packet.operation,
    operationDigest: packet.operationDigest,
    operationId: packet.operationId,
    operatorId: packet.operatorId,
    operatorPayloadCanonicalJson: packet.operatorPayloadCanonicalJson,
    operatorPublicKeyFingerprint: packet.operatorPublicKeyFingerprint,
    operatorPublicKeyPem: packet.operatorPublicKeyPem,
    operatorSignature: evidence.operatorSignature,
    productionExecutionAllowed: false,
    productionRootEnrolled: false,
    reasonDigest: packet.reasonDigest,
    reviewEvidenceDigest,
    reviewerId: packet.reviewerId,
    reviewerPayloadCanonicalJson: packet.reviewerPayloadCanonicalJson,
    reviewerPublicKeyFingerprint: packet.reviewerPublicKeyFingerprint,
    reviewerPublicKeyPem: packet.reviewerPublicKeyPem,
    reviewerSignature: evidence.reviewerSignature,
    sharedBetaAccess: false,
    status: LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_VERIFIED_STATUS,
    testAccessAuthorized: false,
  });
  VERIFIED_EVIDENCE.add(verified);
  return verified;
}

function canonicalPayload(value) {
  if (
    typeof value !== "string" ||
    value.length < 2 ||
    value.length > 32 * 1_024
  ) {
    fail("CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID");
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail("CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID");
  }
  const normalized = exactRecord(
    parsed,
    PARTICIPANT_PAYLOAD_KEYS,
    "CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID",
  );
  if (canonicalStringify(normalized) !== value) {
    fail("CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID");
  }
  return normalized;
}

function assertPayloadMatchesReceipt(payload, receipt, role, participantId) {
  const matching = {
    candidateRegistryDigest: receipt.candidateRegistryDigest,
    ceremonyId: receipt.ceremonyId,
    contract: receipt.contract,
    createdAt: receipt.createdAt,
    currentRegistryDigest: receipt.currentRegistryDigest,
    expiresAt: receipt.expiresAt,
    operation: receipt.operation,
    operationDigest: receipt.operationDigest,
    operationId: receipt.operationId,
    reasonDigest: receipt.reasonDigest,
  };
  for (const [key, value] of Object.entries(matching)) {
    if (payload[key] !== value) {
      fail("CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID");
    }
  }
  if (
    payload.participantRole !== role ||
    payload.participantId !== participantId
  ) {
    fail("CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID");
  }
}

export function verifyPersistedLangameRuntimeTrustBootstrapCeremonyCurrent201(
  receiptValue,
  currentRegistryValue,
) {
  if (arguments.length !== 2) {
    fail("CURRENT201_CEREMONY_PERSISTED_ARGUMENTS_INVALID");
  }
  const receipt = exactRecord(
    receiptValue,
    VERIFIED_RECEIPT_KEYS,
    "CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID",
  );
  if (
    receipt.contract !==
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_CONTRACT ||
    receipt.status !==
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_VERIFIED_STATUS ||
    receipt.authorization !== false ||
    receipt.canApply !== false ||
    receipt.canEnrollProductionRoots !== false ||
    receipt.productionExecutionAllowed !== false ||
    receipt.productionRootEnrolled !== false ||
    receipt.sharedBetaAccess !== false ||
    receipt.testAccessAuthorized !== false ||
    !UUID_PATTERN.test(receipt.ceremonyId) ||
    !UUID_PATTERN.test(receipt.operationId) ||
    !new Set(["ENROLL", "ROTATE", "REVOKE"]).has(receipt.operation) ||
    !PARTICIPANT_PATTERN.test(receipt.operatorId) ||
    !PARTICIPANT_PATTERN.test(receipt.reviewerId) ||
    receipt.operatorId === receipt.reviewerId ||
    !SHA256_PATTERN.test(receipt.candidateRegistryDigest) ||
    !SHA256_PATTERN.test(receipt.currentRegistryDigest) ||
    !SHA256_PATTERN.test(receipt.operationDigest) ||
    !SHA256_PATTERN.test(receipt.reasonDigest) ||
    !SHA256_PATTERN.test(receipt.reviewEvidenceDigest)
  ) {
    fail("CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID");
  }
  const createdAt = epoch(
    receipt.createdAt,
    "CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID",
  );
  const expiresAt = epoch(
    receipt.expiresAt,
    "CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID",
  );
  if (
    expiresAt <= createdAt ||
    expiresAt - createdAt >
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_MAX_LIFETIME_MS
  ) {
    fail("CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID");
  }
  const currentRegistry =
    validateLangameRuntimeTrustBootstrapRegistryCurrent198(
      currentRegistryValue,
    );
  const candidateRegistry =
    parsePinnedLangameRuntimeTrustBootstrapRegistryCurrent198(
      receipt.candidateCanonicalJson,
    );
  validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
    currentRegistry,
    candidateRegistry,
  );
  if (
    langameRuntimeTrustBootstrapRegistryDigestCurrent198(currentRegistry) !==
      receipt.currentRegistryDigest ||
    langameRuntimeTrustBootstrapRegistryDigestCurrent198(candidateRegistry) !==
      receipt.candidateRegistryDigest
  ) {
    fail("CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID");
  }
  const operator = publicKey(receipt.operatorPublicKeyPem);
  const reviewer = publicKey(receipt.reviewerPublicKeyPem);
  if (
    operator.fingerprint !== receipt.operatorPublicKeyFingerprint ||
    reviewer.fingerprint !== receipt.reviewerPublicKeyFingerprint ||
    operator.fingerprint === reviewer.fingerprint
  ) {
    fail("CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID");
  }
  const operatorPayload = canonicalPayload(
    receipt.operatorPayloadCanonicalJson,
  );
  const reviewerPayload = canonicalPayload(
    receipt.reviewerPayloadCanonicalJson,
  );
  assertPayloadMatchesReceipt(
    operatorPayload,
    receipt,
    "OPERATOR",
    receipt.operatorId,
  );
  assertPayloadMatchesReceipt(
    reviewerPayload,
    receipt,
    "INDEPENDENT_REVIEWER",
    receipt.reviewerId,
  );
  if (
    operatorPayload.participantPublicKeyFingerprint !== operator.fingerprint ||
    reviewerPayload.participantPublicKeyFingerprint !== reviewer.fingerprint
  ) {
    fail("CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID");
  }
  const operatorSignature = signature(receipt.operatorSignature);
  const reviewerSignature = signature(receipt.reviewerSignature);
  let signaturesValid = false;
  try {
    signaturesValid =
      verifySignature(
        null,
        Buffer.from(receipt.operatorPayloadCanonicalJson, "utf8"),
        operator.key,
        operatorSignature,
      ) &&
      verifySignature(
        null,
        Buffer.from(receipt.reviewerPayloadCanonicalJson, "utf8"),
        reviewer.key,
        reviewerSignature,
      );
  } catch {
    fail("CURRENT201_CEREMONY_SIGNATURE_INVALID");
  }
  if (!signaturesValid) {
    fail("CURRENT201_CEREMONY_SIGNATURE_INVALID");
  }
  const expectedEvidenceDigest = digest("REVIEW_EVIDENCE", {
    candidateRegistryDigest: receipt.candidateRegistryDigest,
    ceremonyId: receipt.ceremonyId,
    currentRegistryDigest: receipt.currentRegistryDigest,
    operationDigest: receipt.operationDigest,
    operatorPayloadCanonicalJson: receipt.operatorPayloadCanonicalJson,
    operatorSignature: receipt.operatorSignature,
    reviewerPayloadCanonicalJson: receipt.reviewerPayloadCanonicalJson,
    reviewerSignature: receipt.reviewerSignature,
  });
  if (expectedEvidenceDigest !== receipt.reviewEvidenceDigest) {
    fail("CURRENT201_CEREMONY_PERSISTED_EVIDENCE_INVALID");
  }
  const verified = Object.freeze({ ...receipt });
  VERIFIED_EVIDENCE.add(verified);
  return verified;
}

export function isVerifiedLangameRuntimeTrustBootstrapCeremonyCurrent201(
  value,
) {
  return (
    arguments.length === 1 &&
    value !== null &&
    typeof value === "object" &&
    VERIFIED_EVIDENCE.has(value)
  );
}
