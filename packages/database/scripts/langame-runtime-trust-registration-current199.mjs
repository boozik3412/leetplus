import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_CONTRACT,
  LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_STATUS,
  isVerifiedLangameRuntimeTrustAcquisitionCurrent197,
  isVerifiedProductionLangameRuntimeTrustAcquisitionCurrent197,
} from "./langame-runtime-trust-acquisition-current197.mjs";
import {
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_CONTRACT,
  langameRuntimeTrustBootstrapRegistryDigestCurrent198,
} from "./langame-runtime-trust-bootstrap-registry-current198-contract.mjs";
import { PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198 } from "./langame-runtime-trust-bootstrap-registry-current198.mjs";
import {
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CONTRACT,
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_MAX_LIFETIME_MS,
  isVerifiedLangameRuntimeTrustEnrollmentCurrent196,
} from "./langame-runtime-trust-enrollment-current196.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_CONTRACT =
  "LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_V1";
export const LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_STATUS =
  "INITIAL_ENROLLMENT_REGISTRATION_PREPARED_DENY_ONLY";
export const LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_SYNTHETIC_CONFIRMATION =
  "prepare-langame-current199-registration-on-loopback-ci";

const INPUT_KEYS = Object.freeze(["acquisitionReceipt", "proposal"].sort());
const CONTEXT_KEYS = Object.freeze(
  ["databaseName", "environment", "explicitConfirmation", "hostname"].sort(),
);
const PROPOSAL_KEYS = Object.freeze(
  [
    "authorization",
    "bootstrapPublicKeyFingerprint",
    "bootstrapSigningKeyId",
    "canConnectNetwork",
    "canEnrollProductionRoots",
    "canMutate",
    "candidateBundleDigest",
    "clusterIdentityDigest",
    "contract",
    "databaseName",
    "databaseOid",
    "enrollmentGeneration",
    "enrollmentId",
    "enrollmentPayloadDigest",
    "issuedAt",
    "ownerRoleName",
    "ownerRoleOid",
    "productionExecutionAllowed",
    "releaseArtifactDigest",
    "releaseSha",
    "runtimeAttestationKeyId",
    "runtimeAttestationPublicKeyFingerprint",
    "runtimeConfigDigest",
    "runtimeRevokeIntentKeyId",
    "runtimeRevokeIntentPublicKeyFingerprint",
    "runtimeRoleName",
    "runtimeRoleOid",
    "sharedBetaAccess",
    "status",
    "testAccessAuthorized",
    "tlsCaCertificateSha256",
    "tlsEndpointHost",
    "tlsEndpointPort",
    "tlsLeafCertificateSha256",
    "tlsLeafNotAfter",
    "tlsLeafNotBefore",
    "tlsLeafSpkiSha256",
    "tlsMinimumProtocol",
    "tlsRejectUnauthorized",
    "tlsServerName",
    "validUntil",
    "verificationMode",
    "verifierArtifactDigest",
  ].sort(),
);
const ACQUISITION_KEYS = Object.freeze(
  [
    "authorization",
    "canConnectNetwork",
    "canEnrollProductionRoots",
    "canMutate",
    "candidateBundleDigest",
    "collectedAt",
    "contract",
    "databaseName",
    "databaseOid",
    "enrollmentId",
    "enrollmentPayloadDigest",
    "productionExecutionAllowed",
    "productionRootEnrolled",
    "protectedSourceFilesVerified",
    "receiptDigest",
    "releaseArtifactDigest",
    "releaseSha",
    "resolvedAddressSetDigest",
    "runtimeAttestationKeyId",
    "runtimeAttestationPublicKeyBytesSha256",
    "runtimeAttestationPublicKeyFingerprint",
    "runtimeConfigDigest",
    "runtimeRevokeIntentKeyId",
    "runtimeRevokeIntentPublicKeyBytesSha256",
    "runtimeRevokeIntentPublicKeyFingerprint",
    "sharedBetaAccess",
    "sourceNetworkIoPerformed",
    "status",
    "syntheticOnly",
    "testAccessAuthorized",
    "tlsCaCertificateSha256",
    "tlsEndpointHost",
    "tlsEndpointPort",
    "tlsHostnameVerified",
    "tlsLeafCertificateSha256",
    "tlsLeafSpkiSha256",
    "tlsObservationDigest",
    "tlsPeerObserved",
    "tlsServerName",
    "verifierArtifactDigest",
  ].sort(),
);
const MATCHING_KEYS = Object.freeze(
  [
    "candidateBundleDigest",
    "databaseName",
    "databaseOid",
    "enrollmentId",
    "enrollmentPayloadDigest",
    "releaseArtifactDigest",
    "releaseSha",
    "runtimeAttestationKeyId",
    "runtimeAttestationPublicKeyFingerprint",
    "runtimeConfigDigest",
    "runtimeRevokeIntentKeyId",
    "runtimeRevokeIntentPublicKeyFingerprint",
    "tlsCaCertificateSha256",
    "tlsEndpointHost",
    "tlsEndpointPort",
    "tlsLeafCertificateSha256",
    "tlsLeafSpkiSha256",
    "tlsServerName",
    "verifierArtifactDigest",
  ].sort(),
);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const ROLE_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const DNS_PATTERN =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const MAX_OID = 4_294_967_295;
const VERIFIED_REGISTRATIONS = new WeakSet();
const VERIFIED_PRODUCTION_REGISTRATIONS = new WeakSet();

export class LangameRuntimeTrustRegistrationCurrent199Error extends Error {
  constructor(code) {
    super("CURRENT199 Langame trust registration rejected the input.");
    this.name = "LangameRuntimeTrustRegistrationCurrent199Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameRuntimeTrustRegistrationCurrent199Error(code);
}

function dataRecord(value, requiredKeys, code, exact = false) {
  let descriptors;
  let prototype;
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value)
    ) {
      fail(code);
    }
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (error) {
    if (error?.safeContractError) throw error;
    fail(code);
  }
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !Object.hasOwn(descriptors[key], "value") ||
        descriptors[key].enumerable !== true,
    ) ||
    requiredKeys.some((key) => !Object.hasOwn(descriptors, key)) ||
    (exact &&
      (keys.length !== requiredKeys.length ||
        keys.some((key) => !requiredKeys.includes(key))))
  ) {
    fail(code);
  }
  const result = Object.create(null);
  for (const key of requiredKeys) result[key] = descriptors[key].value;
  return Object.freeze(result);
}

function canonicalEpoch(value, code) {
  if (typeof value !== "string") fail(code);
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    fail(code);
  }
  return epoch;
}

function oid(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_OID;
}

function digest(domain, value) {
  return createHash("sha256")
    .update(
      `${LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_CONTRACT}\n${domain}\n`,
      "utf8",
    )
    .update(canonicalStringify(value), "utf8")
    .digest("hex");
}

function normalizeProposal(value, syntheticOnly) {
  const proposal = dataRecord(
    value,
    PROPOSAL_KEYS,
    "CURRENT199_TRUST_REGISTRATION_PROPOSAL_INVALID",
  );
  const digestKeys = [
    "bootstrapPublicKeyFingerprint",
    "candidateBundleDigest",
    "clusterIdentityDigest",
    "enrollmentPayloadDigest",
    "releaseArtifactDigest",
    "runtimeAttestationPublicKeyFingerprint",
    "runtimeConfigDigest",
    "runtimeRevokeIntentPublicKeyFingerprint",
    "tlsCaCertificateSha256",
    "tlsLeafCertificateSha256",
    "tlsLeafSpkiSha256",
    "verifierArtifactDigest",
  ];
  if (
    proposal.contract !==
      LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CONTRACT ||
    proposal.status !== "VERIFIED_NONAUTHORIZING_PROPOSAL" ||
    proposal.verificationMode !==
      (syntheticOnly ? "SYNTHETIC_CI" : "PINNED_PRODUCTION") ||
    proposal.authorization !== false ||
    proposal.canConnectNetwork !== false ||
    proposal.canEnrollProductionRoots !== false ||
    proposal.canMutate !== false ||
    proposal.productionExecutionAllowed !== false ||
    proposal.sharedBetaAccess !== false ||
    proposal.testAccessAuthorized !== false ||
    proposal.tlsRejectUnauthorized !== true ||
    proposal.enrollmentGeneration !== 1 ||
    !ID_PATTERN.test(proposal.enrollmentId) ||
    !KEY_PATTERN.test(proposal.bootstrapSigningKeyId) ||
    !KEY_PATTERN.test(proposal.runtimeAttestationKeyId) ||
    !KEY_PATTERN.test(proposal.runtimeRevokeIntentKeyId) ||
    new Set([
      proposal.bootstrapSigningKeyId,
      proposal.runtimeAttestationKeyId,
      proposal.runtimeRevokeIntentKeyId,
    ]).size !== 3 ||
    !DATABASE_PATTERN.test(proposal.databaseName) ||
    !oid(proposal.databaseOid) ||
    !ROLE_PATTERN.test(proposal.ownerRoleName) ||
    !oid(proposal.ownerRoleOid) ||
    !ROLE_PATTERN.test(proposal.runtimeRoleName) ||
    !oid(proposal.runtimeRoleOid) ||
    proposal.ownerRoleName === proposal.runtimeRoleName ||
    proposal.ownerRoleOid === proposal.runtimeRoleOid ||
    !RELEASE_SHA_PATTERN.test(proposal.releaseSha) ||
    !digestKeys.every((key) => SHA256_PATTERN.test(proposal[key])) ||
    !DNS_PATTERN.test(proposal.tlsEndpointHost) ||
    !DNS_PATTERN.test(proposal.tlsServerName) ||
    !Number.isInteger(proposal.tlsEndpointPort) ||
    proposal.tlsEndpointPort < 1 ||
    proposal.tlsEndpointPort > 65_535
  ) {
    fail("CURRENT199_TRUST_REGISTRATION_PROPOSAL_INVALID");
  }
  return proposal;
}

function normalizeAcquisition(value, syntheticOnly) {
  const receipt = dataRecord(
    value,
    ACQUISITION_KEYS,
    "CURRENT199_TRUST_REGISTRATION_ACQUISITION_INVALID",
  );
  if (
    receipt.contract !==
      LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_CONTRACT ||
    receipt.status !== LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_STATUS ||
    receipt.syntheticOnly !== syntheticOnly ||
    receipt.authorization !== false ||
    receipt.canConnectNetwork !== false ||
    receipt.canEnrollProductionRoots !== false ||
    receipt.canMutate !== false ||
    receipt.productionExecutionAllowed !== false ||
    receipt.productionRootEnrolled !== false ||
    receipt.sharedBetaAccess !== false ||
    receipt.testAccessAuthorized !== false ||
    receipt.protectedSourceFilesVerified !== true ||
    receipt.sourceNetworkIoPerformed !== true ||
    receipt.tlsHostnameVerified !== true ||
    receipt.tlsPeerObserved !== true ||
    !SHA256_PATTERN.test(receipt.receiptDigest) ||
    !SHA256_PATTERN.test(receipt.resolvedAddressSetDigest) ||
    !SHA256_PATTERN.test(receipt.runtimeAttestationPublicKeyBytesSha256) ||
    !SHA256_PATTERN.test(receipt.runtimeRevokeIntentPublicKeyBytesSha256) ||
    !SHA256_PATTERN.test(receipt.tlsObservationDigest)
  ) {
    fail("CURRENT199_TRUST_REGISTRATION_ACQUISITION_INVALID");
  }
  return receipt;
}

function prepareInternal(inputValue, now, syntheticOnly, productionOrigin) {
  const input = dataRecord(
    inputValue,
    INPUT_KEYS,
    "CURRENT199_TRUST_REGISTRATION_INPUT_INVALID",
    true,
  );
  if (
    productionOrigin &&
    (!isVerifiedLangameRuntimeTrustEnrollmentCurrent196(input.proposal) ||
      !isVerifiedLangameRuntimeTrustAcquisitionCurrent197(
        input.acquisitionReceipt,
      ) ||
      !isVerifiedProductionLangameRuntimeTrustAcquisitionCurrent197(
        input.acquisitionReceipt,
      ))
  ) {
    fail("CURRENT199_TRUST_REGISTRATION_PROVENANCE_INVALID");
  }
  const proposal = normalizeProposal(input.proposal, syntheticOnly);
  const acquisition = normalizeAcquisition(
    input.acquisitionReceipt,
    syntheticOnly,
  );
  if (MATCHING_KEYS.some((key) => proposal[key] !== acquisition[key])) {
    fail("CURRENT199_TRUST_REGISTRATION_BINDING_INVALID");
  }
  const issuedAtMs = canonicalEpoch(
    proposal.issuedAt,
    "CURRENT199_TRUST_REGISTRATION_TIMELINE_INVALID",
  );
  const collectedAtMs = canonicalEpoch(
    acquisition.collectedAt,
    "CURRENT199_TRUST_REGISTRATION_TIMELINE_INVALID",
  );
  const validUntilMs = canonicalEpoch(
    proposal.validUntil,
    "CURRENT199_TRUST_REGISTRATION_TIMELINE_INVALID",
  );
  const preparedAtMs = canonicalEpoch(
    now,
    "CURRENT199_TRUST_REGISTRATION_TIMELINE_INVALID",
  );
  if (
    collectedAtMs < issuedAtMs ||
    preparedAtMs < collectedAtMs ||
    preparedAtMs >= validUntilMs ||
    validUntilMs - issuedAtMs >
      LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_MAX_LIFETIME_MS
  ) {
    fail("CURRENT199_TRUST_REGISTRATION_TIMELINE_INVALID");
  }
  const bootstrapRegistryDigest =
    langameRuntimeTrustBootstrapRegistryDigestCurrent198(
      PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198,
    );
  const payload = Object.freeze({
    bootstrapPublicKeyFingerprint: proposal.bootstrapPublicKeyFingerprint,
    bootstrapRegistryContract:
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_CONTRACT,
    bootstrapRegistryDigest,
    bootstrapSigningKeyId: proposal.bootstrapSigningKeyId,
    candidateBundleDigest: proposal.candidateBundleDigest,
    clusterIdentityDigest: proposal.clusterIdentityDigest,
    collectedAt: acquisition.collectedAt,
    databaseName: proposal.databaseName,
    databaseOid: proposal.databaseOid,
    enrollmentGeneration: proposal.enrollmentGeneration,
    enrollmentId: proposal.enrollmentId,
    enrollmentPayloadDigest: proposal.enrollmentPayloadDigest,
    eventType: "INITIAL_ENROLLMENT_REGISTRATION_PREPARED",
    issuedAt: proposal.issuedAt,
    operation: "INITIAL_ENROLLMENT",
    ownerRoleName: proposal.ownerRoleName,
    ownerRoleOid: proposal.ownerRoleOid,
    preparedAt: now,
    priorEnrollmentDigest: null,
    protectedAcquisitionReceiptDigest: acquisition.receiptDigest,
    releaseArtifactDigest: proposal.releaseArtifactDigest,
    releaseSha: proposal.releaseSha,
    resolvedAddressSetDigest: acquisition.resolvedAddressSetDigest,
    runtimeAttestationKeyId: proposal.runtimeAttestationKeyId,
    runtimeAttestationPublicKeyBytesSha256:
      acquisition.runtimeAttestationPublicKeyBytesSha256,
    runtimeAttestationPublicKeyFingerprint:
      proposal.runtimeAttestationPublicKeyFingerprint,
    runtimeConfigDigest: proposal.runtimeConfigDigest,
    runtimeRevokeIntentKeyId: proposal.runtimeRevokeIntentKeyId,
    runtimeRevokeIntentPublicKeyBytesSha256:
      acquisition.runtimeRevokeIntentPublicKeyBytesSha256,
    runtimeRevokeIntentPublicKeyFingerprint:
      proposal.runtimeRevokeIntentPublicKeyFingerprint,
    runtimeRoleName: proposal.runtimeRoleName,
    runtimeRoleOid: proposal.runtimeRoleOid,
    syntheticOnly,
    tlsCaCertificateSha256: proposal.tlsCaCertificateSha256,
    tlsEndpointHost: proposal.tlsEndpointHost,
    tlsEndpointPort: proposal.tlsEndpointPort,
    tlsLeafCertificateSha256: proposal.tlsLeafCertificateSha256,
    tlsLeafNotAfter: proposal.tlsLeafNotAfter,
    tlsLeafNotBefore: proposal.tlsLeafNotBefore,
    tlsLeafSpkiSha256: proposal.tlsLeafSpkiSha256,
    tlsMinimumProtocol: proposal.tlsMinimumProtocol,
    tlsObservationDigest: acquisition.tlsObservationDigest,
    tlsServerName: proposal.tlsServerName,
    validUntil: proposal.validUntil,
    verifierArtifactDigest: proposal.verifierArtifactDigest,
  });
  const registration = Object.freeze({
    authorization: false,
    canApply: false,
    canMutate: false,
    canPersist: false,
    canRevoke: false,
    canRotate: false,
    contract: LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_CONTRACT,
    productionExecutionAllowed: false,
    registrationDigest: digest("REGISTRATION", payload),
    sharedBetaAccess: false,
    status: LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_STATUS,
    testAccessAuthorized: false,
    ...payload,
  });
  VERIFIED_REGISTRATIONS.add(registration);
  if (productionOrigin) VERIFIED_PRODUCTION_REGISTRATIONS.add(registration);
  return registration;
}

export function prepareLangameRuntimeTrustRegistrationCurrent199(input) {
  if (arguments.length !== 1) {
    fail("CURRENT199_TRUST_REGISTRATION_ARGUMENTS_INVALID");
  }
  return prepareInternal(input, new Date().toISOString(), false, true);
}

export function prepareSyntheticLangameRuntimeTrustRegistrationCurrent199ForTestOnly(
  input,
  contextValue,
  now,
) {
  if (arguments.length !== 3) {
    fail("CURRENT199_TRUST_REGISTRATION_ARGUMENTS_INVALID");
  }
  const context = dataRecord(
    contextValue,
    CONTEXT_KEYS,
    "CURRENT199_TRUST_REGISTRATION_SYNTHETIC_DENIED",
    true,
  );
  const preliminaryInput = dataRecord(
    input,
    INPUT_KEYS,
    "CURRENT199_TRUST_REGISTRATION_INPUT_INVALID",
    true,
  );
  const preliminaryProposal = dataRecord(
    preliminaryInput.proposal,
    PROPOSAL_KEYS,
    "CURRENT199_TRUST_REGISTRATION_PROPOSAL_INVALID",
  );
  if (
    context.environment !== "ci" ||
    context.explicitConfirmation !==
      LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_SYNTHETIC_CONFIRMATION ||
    !LOOPBACK_HOSTS.has(context.hostname) ||
    context.databaseName !== preliminaryProposal.databaseName ||
    !/_ci$/u.test(context.databaseName)
  ) {
    fail("CURRENT199_TRUST_REGISTRATION_SYNTHETIC_DENIED");
  }
  return prepareInternal(preliminaryInput, now, true, false);
}

export function isPreparedLangameRuntimeTrustRegistrationCurrent199(value) {
  return (
    arguments.length === 1 &&
    value !== null &&
    typeof value === "object" &&
    VERIFIED_REGISTRATIONS.has(value)
  );
}

export function isPreparedProductionLangameRuntimeTrustRegistrationCurrent199(
  value,
) {
  return (
    arguments.length === 1 &&
    value !== null &&
    typeof value === "object" &&
    VERIFIED_PRODUCTION_REGISTRATIONS.has(value)
  );
}
