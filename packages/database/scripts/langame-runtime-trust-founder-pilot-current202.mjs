import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  isPreparedLangameRuntimeTrustBootstrapLifecycleCurrent200,
  prepareLangameRuntimeTrustBootstrapLifecycleCurrent200,
} from "./langame-runtime-trust-bootstrap-lifecycle-current200.mjs";
import {
  langameRuntimeTrustBootstrapRegistryDigestCurrent198,
  parsePinnedLangameRuntimeTrustBootstrapRegistryCurrent198,
  validateLangameRuntimeTrustBootstrapRegistryCurrent198,
  validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198,
} from "./langame-runtime-trust-bootstrap-registry-current198-contract.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CONTRACT =
  "LANGAME_RUNTIME_TRUST_FOUNDER_GLOBAL_PLATFORM_BOOTSTRAP_CURRENT202_V2";
export const LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_PREPARED_STATUS =
  "FOUNDER_SINGLE_CONTROL_GLOBAL_PLATFORM_BOOTSTRAP_PACKET_PREPARED_DENY_ONLY";
export const LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_VERIFIED_STATUS =
  "FOUNDER_SINGLE_CONTROL_GLOBAL_PLATFORM_BOOTSTRAP_EVIDENCE_VERIFIED_DENY_ONLY";
export const LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_RISK_ACCEPTANCE =
  "I_ACCEPT_SINGLE_FOUNDER_CONTROL_RISK_FOR_GLOBAL_PLATFORM_BOOTSTRAP";
export const LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_COOLING_OFF_MS =
  12 * 60 * 60 * 1_000;
export const LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_MAX_SIGNING_WINDOW_MS =
  24 * 60 * 60 * 1_000;
export const LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_MAX_CLOCK_SKEW_MS =
  5 * 60 * 1_000;
const REQUEST_KEYS = Object.freeze(
  [
    "eligibleAt",
    "exceptionId",
    "expiresAt",
    "founderId",
    "founderPublicKeyPem",
    "keyCustodyPlanDigest",
    "preparedAt",
    "releaseOwnerId",
    "restoredCopyPlanDigest",
    "riskAcceptance",
    "rollbackOwnerId",
    "rollbackPlanDigest",
  ].sort(),
);
const EVIDENCE_KEYS = Object.freeze(["founderSignature"]);
const PAYLOAD_KEYS = Object.freeze(
  [
    "additionalTenantKeyCeremonyRequired",
    "approvedAt",
    "candidateRegistryDigest",
    "contract",
    "coolingOffMilliseconds",
    "currentNetworkMutationAllowed",
    "customerKeyCeremonyRequired",
    "currentRegistryDigest",
    "effectiveAt",
    "eligibleAt",
    "encryptedRemovableMediaCount",
    "exceptionId",
    "expiresAt",
    "founderId",
    "founderPublicKeyFingerprint",
    "keyCustodyPlanDigest",
    "keyId",
    "operation",
    "operationDigest",
    "operationId",
    "organizationalIndependenceSatisfied",
    "outboundInitiallyEnabled",
    "physicalKeySeparationSatisfied",
    "platformScope",
    "preparedAt",
    "publicSignupAllowed",
    "reasonDigest",
    "releaseOwnerId",
    "restoredCopyPlanDigest",
    "riskAcceptance",
    "rollbackOwnerId",
    "rollbackPlanDigest",
    "routineTenantOnboardingRequiresRootAccess",
    "sharedBetaGoRequired",
    "singleFounderRiskAccepted",
    "tenantRolloutPolicyEmbedded",
  ].sort(),
);
const RECEIPT_KEYS = Object.freeze(
  [
    ...PAYLOAD_KEYS,
    "authorization",
    "canApply",
    "canEnrollProductionRoots",
    "candidateCanonicalJson",
    "founderPayloadCanonicalJson",
    "founderPublicKeyPem",
    "founderSignature",
    "ownerRouteActivationAllowed",
    "productionExecutionAllowed",
    "productionRootEnrolled",
    "reviewEvidenceDigest",
    "sharedBetaAccess",
    "status",
    "testAccessAuthorized",
  ].sort(),
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/u;
const PREPARED_PACKETS = new WeakSet();
const VERIFIED_RECEIPTS = new WeakSet();

export class LangameRuntimeTrustFounderPilotCurrent202Error extends Error {
  constructor(code) {
    super(
      "CURRENT202 founder global platform bootstrap evidence was rejected.",
    );
    this.name = "LangameRuntimeTrustFounderPilotCurrent202Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameRuntimeTrustFounderPilotCurrent202Error(code);
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

function founderPublicKey(publicKeyPem) {
  if (
    typeof publicKeyPem !== "string" ||
    publicKeyPem.length > 4_096 ||
    !publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----\n") ||
    !publicKeyPem.endsWith("-----END PUBLIC KEY-----\n")
  ) {
    fail("CURRENT202_FOUNDER_PUBLIC_KEY_INVALID");
  }
  let key;
  let canonical;
  try {
    key = createPublicKey(publicKeyPem);
    canonical = key.export({ format: "pem", type: "spki" });
  } catch {
    fail("CURRENT202_FOUNDER_PUBLIC_KEY_INVALID");
  }
  if (key.asymmetricKeyType !== "ed25519" || canonical !== publicKeyPem) {
    fail("CURRENT202_FOUNDER_PUBLIC_KEY_INVALID");
  }
  return Object.freeze({
    fingerprint: createHash("sha256")
      .update(key.export({ format: "der", type: "spki" }))
      .digest("hex"),
    key,
    pem: publicKeyPem,
  });
}

function signature(value) {
  if (typeof value !== "string" || !SIGNATURE_PATTERN.test(value)) {
    fail("CURRENT202_FOUNDER_SIGNATURE_INVALID");
  }
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== 64 || bytes.toString("base64url") !== value) {
    fail("CURRENT202_FOUNDER_SIGNATURE_INVALID");
  }
  return bytes;
}

function digest(domain, value) {
  return createHash("sha256")
    .update(
      `${LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CONTRACT}\n${domain}\n`,
      "utf8",
    )
    .update(canonicalStringify(value), "utf8")
    .digest("hex");
}

function assertPreparedEnrollment(value) {
  if (
    !isPreparedLangameRuntimeTrustBootstrapLifecycleCurrent200(value) ||
    value.operation !== "ENROLL" ||
    value.authorization !== false ||
    value.canApply !== false ||
    value.canEnrollProductionRoots !== false ||
    value.productionExecutionAllowed !== false ||
    value.productionRootEnrolled !== false ||
    value.sharedBetaAccess !== false ||
    value.testAccessAuthorized !== false ||
    Object.keys(value.candidateRegistry ?? {}).length !== 1
  ) {
    fail("CURRENT202_FOUNDER_TRANSITION_INVALID");
  }
}

function fixedControls() {
  return Object.freeze({
    additionalTenantKeyCeremonyRequired: false,
    coolingOffMilliseconds:
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_COOLING_OFF_MS,
    currentNetworkMutationAllowed: false,
    customerKeyCeremonyRequired: false,
    encryptedRemovableMediaCount: 1,
    organizationalIndependenceSatisfied: false,
    outboundInitiallyEnabled: false,
    physicalKeySeparationSatisfied: false,
    platformScope: "GLOBAL",
    publicSignupAllowed: false,
    routineTenantOnboardingRequiresRootAccess: false,
    sharedBetaGoRequired: true,
    singleFounderRiskAccepted: true,
    tenantRolloutPolicyEmbedded: false,
  });
}

function payloadFromTransition(transition, request, founder) {
  return Object.freeze({
    approvedAt: transition.approvedAt,
    candidateRegistryDigest: transition.candidateRegistryDigest,
    contract: LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CONTRACT,
    currentRegistryDigest: transition.currentRegistryDigest,
    effectiveAt: transition.effectiveAt,
    eligibleAt: request.eligibleAt,
    exceptionId: request.exceptionId,
    expiresAt: request.expiresAt,
    founderId: request.founderId,
    founderPublicKeyFingerprint: founder.fingerprint,
    keyCustodyPlanDigest: request.keyCustodyPlanDigest,
    keyId: transition.keyId,
    operation: transition.operation,
    operationDigest: transition.operationDigest,
    operationId: transition.operationId,
    preparedAt: request.preparedAt,
    reasonDigest: transition.reasonDigest,
    releaseOwnerId: request.releaseOwnerId,
    restoredCopyPlanDigest: request.restoredCopyPlanDigest,
    riskAcceptance: request.riskAcceptance,
    rollbackOwnerId: request.rollbackOwnerId,
    rollbackPlanDigest: request.rollbackPlanDigest,
    ...fixedControls(),
  });
}

export function prepareLangameRuntimeTrustFounderPilotCurrent202(
  preparedTransition,
  requestValue,
  now,
) {
  if (arguments.length !== 3) {
    fail("CURRENT202_FOUNDER_ARGUMENTS_INVALID");
  }
  assertPreparedEnrollment(preparedTransition);
  const request = exactRecord(
    requestValue,
    REQUEST_KEYS,
    "CURRENT202_FOUNDER_REQUEST_INVALID",
  );
  if (
    !UUID_PATTERN.test(request.exceptionId) ||
    !ID_PATTERN.test(request.founderId) ||
    request.releaseOwnerId !== request.founderId ||
    request.rollbackOwnerId !== request.founderId ||
    request.riskAcceptance !==
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_RISK_ACCEPTANCE ||
    !SHA256_PATTERN.test(request.keyCustodyPlanDigest) ||
    !SHA256_PATTERN.test(request.restoredCopyPlanDigest) ||
    !SHA256_PATTERN.test(request.rollbackPlanDigest)
  ) {
    fail("CURRENT202_FOUNDER_REQUEST_INVALID");
  }
  const observedAt = epoch(now, "CURRENT202_FOUNDER_TIMELINE_INVALID");
  const preparedAt = epoch(
    request.preparedAt,
    "CURRENT202_FOUNDER_TIMELINE_INVALID",
  );
  const eligibleAt = epoch(
    request.eligibleAt,
    "CURRENT202_FOUNDER_TIMELINE_INVALID",
  );
  const expiresAt = epoch(
    request.expiresAt,
    "CURRENT202_FOUNDER_TIMELINE_INVALID",
  );
  if (
    Math.abs(observedAt - preparedAt) >
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_MAX_CLOCK_SKEW_MS ||
    eligibleAt - preparedAt !==
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_COOLING_OFF_MS ||
    observedAt >= eligibleAt ||
    expiresAt <= eligibleAt ||
    expiresAt - eligibleAt >
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_MAX_SIGNING_WINDOW_MS
  ) {
    fail("CURRENT202_FOUNDER_TIMELINE_INVALID");
  }
  const founder = founderPublicKey(request.founderPublicKeyPem);
  const payload = payloadFromTransition(preparedTransition, request, founder);
  const packet = Object.freeze({
    authorization: false,
    canApply: false,
    canEnrollProductionRoots: false,
    candidateCanonicalJson: preparedTransition.candidateCanonicalJson,
    founderPayloadCanonicalJson: canonicalStringify(payload),
    founderPublicKeyPem: founder.pem,
    ownerRouteActivationAllowed: false,
    productionExecutionAllowed: false,
    productionRootEnrolled: false,
    sharedBetaAccess: false,
    status: LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_PREPARED_STATUS,
    testAccessAuthorized: false,
    ...payload,
  });
  PREPARED_PACKETS.add(packet);
  return packet;
}

export function verifyLangameRuntimeTrustFounderPilotCurrent202(
  packet,
  evidenceValue,
  now,
) {
  if (arguments.length !== 3 || !PREPARED_PACKETS.has(packet)) {
    fail("CURRENT202_FOUNDER_PACKET_INVALID");
  }
  const evidence = exactRecord(
    evidenceValue,
    EVIDENCE_KEYS,
    "CURRENT202_FOUNDER_EVIDENCE_INVALID",
  );
  const observedAt = epoch(now, "CURRENT202_FOUNDER_TIMELINE_INVALID");
  if (
    observedAt <
      epoch(packet.eligibleAt, "CURRENT202_FOUNDER_TIMELINE_INVALID") ||
    observedAt >= epoch(packet.expiresAt, "CURRENT202_FOUNDER_TIMELINE_INVALID")
  ) {
    fail("CURRENT202_FOUNDER_COOLING_OFF_OR_EXPIRY_INVALID");
  }
  const founderSignature = signature(evidence.founderSignature);
  let valid = false;
  try {
    valid = verifySignature(
      null,
      Buffer.from(packet.founderPayloadCanonicalJson, "utf8"),
      createPublicKey(packet.founderPublicKeyPem),
      founderSignature,
    );
  } catch {
    fail("CURRENT202_FOUNDER_SIGNATURE_INVALID");
  }
  if (!valid) fail("CURRENT202_FOUNDER_SIGNATURE_INVALID");
  const reviewEvidenceDigest = digest("REVIEW_EVIDENCE", {
    founderPayloadCanonicalJson: packet.founderPayloadCanonicalJson,
    founderSignature: evidence.founderSignature,
  });
  const verified = Object.freeze({
    ...packet,
    founderSignature: evidence.founderSignature,
    reviewEvidenceDigest,
    status: LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_VERIFIED_STATUS,
  });
  VERIFIED_RECEIPTS.add(verified);
  return verified;
}

function canonicalPayload(value) {
  if (typeof value !== "string" || value.length < 2 || value.length > 48_000) {
    fail("CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID");
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail("CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID");
  }
  const normalized = exactRecord(
    parsed,
    PAYLOAD_KEYS,
    "CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID",
  );
  if (canonicalStringify(normalized) !== value) {
    fail("CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID");
  }
  return normalized;
}

export function verifyPersistedLangameRuntimeTrustFounderPilotCurrent202(
  receiptValue,
  currentRegistryValue,
) {
  if (arguments.length !== 2) {
    fail("CURRENT202_FOUNDER_PERSISTED_ARGUMENTS_INVALID");
  }
  const receipt = exactRecord(
    receiptValue,
    RECEIPT_KEYS,
    "CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID",
  );
  if (
    receipt.contract !==
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CONTRACT ||
    receipt.status !==
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_VERIFIED_STATUS ||
    receipt.authorization !== false ||
    receipt.canApply !== false ||
    receipt.canEnrollProductionRoots !== false ||
    receipt.ownerRouteActivationAllowed !== false ||
    receipt.productionExecutionAllowed !== false ||
    receipt.productionRootEnrolled !== false ||
    receipt.sharedBetaAccess !== false ||
    receipt.testAccessAuthorized !== false ||
    receipt.operation !== "ENROLL" ||
    !UUID_PATTERN.test(receipt.exceptionId) ||
    !UUID_PATTERN.test(receipt.operationId) ||
    !ID_PATTERN.test(receipt.founderId) ||
    receipt.releaseOwnerId !== receipt.founderId ||
    receipt.rollbackOwnerId !== receipt.founderId ||
    !KEY_PATTERN.test(receipt.keyId) ||
    !SHA256_PATTERN.test(receipt.candidateRegistryDigest) ||
    !SHA256_PATTERN.test(receipt.currentRegistryDigest) ||
    !SHA256_PATTERN.test(receipt.operationDigest) ||
    !SHA256_PATTERN.test(receipt.reasonDigest) ||
    !SHA256_PATTERN.test(receipt.keyCustodyPlanDigest) ||
    !SHA256_PATTERN.test(receipt.restoredCopyPlanDigest) ||
    !SHA256_PATTERN.test(receipt.rollbackPlanDigest) ||
    !SHA256_PATTERN.test(receipt.reviewEvidenceDigest) ||
    receipt.riskAcceptance !==
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_RISK_ACCEPTANCE ||
    receipt.coolingOffMilliseconds !==
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_COOLING_OFF_MS ||
    receipt.platformScope !== "GLOBAL" ||
    receipt.customerKeyCeremonyRequired !== false ||
    receipt.additionalTenantKeyCeremonyRequired !== false ||
    receipt.routineTenantOnboardingRequiresRootAccess !== false ||
    receipt.sharedBetaGoRequired !== true ||
    receipt.tenantRolloutPolicyEmbedded !== false ||
    receipt.encryptedRemovableMediaCount !== 1 ||
    receipt.currentNetworkMutationAllowed !== false ||
    receipt.organizationalIndependenceSatisfied !== false ||
    receipt.outboundInitiallyEnabled !== false ||
    receipt.physicalKeySeparationSatisfied !== false ||
    receipt.publicSignupAllowed !== false ||
    receipt.singleFounderRiskAccepted !== true
  ) {
    fail("CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID");
  }
  const preparedAt = epoch(
    receipt.preparedAt,
    "CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID",
  );
  const eligibleAt = epoch(
    receipt.eligibleAt,
    "CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID",
  );
  const expiresAt = epoch(
    receipt.expiresAt,
    "CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID",
  );
  if (
    eligibleAt - preparedAt !==
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_COOLING_OFF_MS ||
    expiresAt <= eligibleAt ||
    expiresAt - eligibleAt >
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_MAX_SIGNING_WINDOW_MS
  ) {
    fail("CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID");
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
  let replayed;
  try {
    const nextRoot = candidateRegistry[receipt.keyId];
    replayed = prepareLangameRuntimeTrustBootstrapLifecycleCurrent200(
      {
        command: {
          approvedAt: receipt.approvedAt,
          effectiveAt: receipt.effectiveAt,
          keyId: receipt.keyId,
          nextPublicKeyPem: nextRoot?.publicKeyPem,
          nextValidUntil: nextRoot?.notAfter,
          operation: receipt.operation,
          operationId: receipt.operationId,
          reasonDigest: receipt.reasonDigest,
        },
        currentRegistry,
      },
      receipt.approvedAt,
    );
  } catch {
    fail("CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID");
  }
  if (
    Object.keys(candidateRegistry).length !== 1 ||
    langameRuntimeTrustBootstrapRegistryDigestCurrent198(currentRegistry) !==
      receipt.currentRegistryDigest ||
    langameRuntimeTrustBootstrapRegistryDigestCurrent198(candidateRegistry) !==
      receipt.candidateRegistryDigest ||
    replayed.candidateCanonicalJson !== receipt.candidateCanonicalJson ||
    replayed.operationDigest !== receipt.operationDigest
  ) {
    fail("CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID");
  }
  const founder = founderPublicKey(receipt.founderPublicKeyPem);
  if (founder.fingerprint !== receipt.founderPublicKeyFingerprint) {
    fail("CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID");
  }
  const payload = canonicalPayload(receipt.founderPayloadCanonicalJson);
  for (const key of PAYLOAD_KEYS) {
    if (payload[key] !== receipt[key]) {
      fail("CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID");
    }
  }
  const founderSignature = signature(receipt.founderSignature);
  let signatureValid = false;
  try {
    signatureValid = verifySignature(
      null,
      Buffer.from(receipt.founderPayloadCanonicalJson, "utf8"),
      founder.key,
      founderSignature,
    );
  } catch {
    fail("CURRENT202_FOUNDER_SIGNATURE_INVALID");
  }
  if (!signatureValid) fail("CURRENT202_FOUNDER_SIGNATURE_INVALID");
  if (
    digest("REVIEW_EVIDENCE", {
      founderPayloadCanonicalJson: receipt.founderPayloadCanonicalJson,
      founderSignature: receipt.founderSignature,
    }) !== receipt.reviewEvidenceDigest
  ) {
    fail("CURRENT202_FOUNDER_PERSISTED_EVIDENCE_INVALID");
  }
  const verified = Object.freeze({ ...receipt });
  VERIFIED_RECEIPTS.add(verified);
  return verified;
}

export function isVerifiedLangameRuntimeTrustFounderPilotCurrent202(value) {
  return (
    arguments.length === 1 &&
    value !== null &&
    typeof value === "object" &&
    VERIFIED_RECEIPTS.has(value)
  );
}
