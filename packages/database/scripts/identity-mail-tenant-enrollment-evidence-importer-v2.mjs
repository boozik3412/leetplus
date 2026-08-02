import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_CONTRACT,
  identityMailTenantEnrollmentManifestBoundV2Evidence,
  isComposedPinnedIdentityMailTenantEnrollmentManifestBoundV2,
} from "./identity-mail-tenant-enrollment-manifest-bound-v2.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_CONTRACT =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_PROFILE =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_PROFILE_V1";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OPERATION =
  "IMPORT_IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_V2";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_METHOD =
  "importIdentityMailTenantEnrollmentEvidenceV2";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_BUNDLE_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORT_BUNDLE_V2_V1";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_MAX_BUNDLE_BYTES =
  262_144;
export const IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_MAX_ATTEMPTS =
  2;
export const IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_CANDIDATE_STATUS =
  "NOT_DEPLOYABLE";

const IMPORT_BUNDLES = new WeakSet();
const IMPORT_BUNDLE_PRIVATE = new WeakMap();
const OWNER_RPC_CAPABILITIES = new WeakSet();
const OWNER_RPC_REQUESTS = new WeakSet();
const OWNER_RPC_LOST_RESPONSES = new WeakSet();
const VERIFIED_IMPORT_RECEIPTS = new WeakSet();

const RECEIPT_KEYS = Object.freeze(
  [
    "authorization",
    "authorizationEnvelopeDigest",
    "bindingDigest",
    "bundleDigest",
    "canMutate",
    "canPersistEvidence",
    "canSend",
    "candidateStatus",
    "commandId",
    "decision",
    "exactGrantsDigest",
    "importReceiptDigest",
    "importedAtEpochMs",
    "importedTransactionId",
    "manifestId",
    "manifestPayloadDigest",
    "operation",
    "operationId",
    "requestId",
    "schemaVersion",
    "tenantId",
  ].sort(),
);

export class IdentityMailTenantEnrollmentEvidenceImporterV2Error extends Error {
  constructor(reasonCode) {
    super("The sealed tenant-enrollment evidence import was rejected.");
    this.name = "IdentityMailTenantEnrollmentEvidenceImporterV2Error";
    this.code = reasonCode;
    this.reasonCode = reasonCode;
    this.exitCode = 3;
    this.safeContractError = true;
  }
}

export class IdentityMailTenantEnrollmentEvidenceOwnerRpcV2LostResponseError extends Error {
  constructor() {
    super("The owner RPC response was lost after dispatch.");
    this.name =
      "IdentityMailTenantEnrollmentEvidenceOwnerRpcV2LostResponseError";
    this.code =
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_RESPONSE_LOST";
    this.reasonCode = this.code;
    this.safeContractError = true;
    OWNER_RPC_LOST_RESPONSES.add(this);
  }
}

export class IdentityMailTenantEnrollmentEvidenceImporterV2AmbiguousOutcomeError extends Error {
  constructor(operationIdentity) {
    super("The owner RPC import outcome is ambiguous after a lost response.");
    this.name =
      "IdentityMailTenantEnrollmentEvidenceImporterV2AmbiguousOutcomeError";
    this.code =
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_AMBIGUOUS";
    this.reasonCode = this.code;
    this.exitCode = 4;
    this.safeContractError = true;
    this.attempts =
      IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_MAX_ATTEMPTS;
    this.operationIdentity = operationIdentity;
  }
}

function fail(reasonCode) {
  throw new IdentityMailTenantEnrollmentEvidenceImporterV2Error(reasonCode);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isOrdinaryObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !utilTypes.isProxy(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  );
}

function hasExactDataProperties(value, expectedKeys) {
  if (!isOrdinaryObject(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) return false;
  keys.sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    return false;
  }
  return expectedKeys.every((key) => {
    const descriptor = descriptors[key];
    return (
      descriptor !== undefined &&
      Object.hasOwn(descriptor, "value") &&
      descriptor.get === undefined &&
      descriptor.set === undefined &&
      descriptor.enumerable === true
    );
  });
}

function isFrozenDataRecordWithExactCount(value, expectedCount) {
  if (!isOrdinaryObject(value) || !Object.isFrozen(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  return (
    keys.length === expectedCount &&
    keys.every(
      (key) =>
        typeof key === "string" &&
        Object.hasOwn(descriptors[key], "value") &&
        descriptors[key].get === undefined &&
        descriptors[key].set === undefined &&
        descriptors[key].enumerable === true,
    )
  );
}

function bundleDigest(bundleCanonicalJson) {
  return sha256(
    `${IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_BUNDLE_DIGEST_DOMAIN}\n${bundleCanonicalJson}\n`,
  );
}

function requireImportBundle(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    !IMPORT_BUNDLES.has(value)
  ) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_BUNDLE_NOT_MINTED",
    );
  }
}

function requireOwnerRpcCapability(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    !OWNER_RPC_CAPABILITIES.has(value)
  ) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_NOT_MINTED",
    );
  }
}

function ownerRpcMethod(capability) {
  requireOwnerRpcCapability(capability);
  const descriptors = Object.getOwnPropertyDescriptors(capability);
  const keys = Reflect.ownKeys(descriptors);
  const descriptor =
    descriptors[
      IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_METHOD
    ];
  if (
    keys.length !== 1 ||
    keys[0] !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_METHOD ||
    descriptor === undefined ||
    !Object.hasOwn(descriptor, "value") ||
    typeof descriptor.value !== "function"
  ) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_INVALID",
    );
  }
  return descriptor.value;
}

function isBrandedLostResponse(error) {
  return (
    error !== null &&
    typeof error === "object" &&
    OWNER_RPC_LOST_RESPONSES.has(error)
  );
}

function operationIdentity(bundle) {
  return Object.freeze({
    operation:
      IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OPERATION,
    operationId: bundle.bundleDigest,
    tenantId: bundle.tenantId,
    commandId: bundle.commandId,
    requestId: bundle.requestId,
    authorizationEnvelopeDigest: bundle.authorizationEnvelopeDigest,
    manifestId: bundle.manifestId,
    manifestPayloadDigest: bundle.manifestPayloadDigest,
    exactGrantsDigest: bundle.exactGrantsDigest,
    bindingDigest: bundle.bindingDigest,
    bundleDigest: bundle.bundleDigest,
  });
}

function importRequest(bundle, databaseArguments) {
  const request = Object.freeze({
    operation:
      IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OPERATION,
    operationId: bundle.bundleDigest,
    tenantId: bundle.tenantId,
    commandId: bundle.commandId,
    requestId: bundle.requestId,
    authorizationEnvelopeDigest: bundle.authorizationEnvelopeDigest,
    manifestId: bundle.manifestId,
    manifestPayloadDigest: bundle.manifestPayloadDigest,
    exactGrantsDigest: bundle.exactGrantsDigest,
    bindingDigest: bundle.bindingDigest,
    bundleDigest: bundle.bundleDigest,
    databaseArguments,
  });
  OWNER_RPC_REQUESTS.add(request);
  return request;
}

function verifyReceipt(receipt, request) {
  if (!hasExactDataProperties(receipt, RECEIPT_KEYS)) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_RECEIPT_INVALID",
    );
  }
  if (
    receipt.operation !== request.operation ||
    receipt.schemaVersion !== 1 ||
    receipt.operationId !== request.operationId ||
    receipt.tenantId !== request.tenantId ||
    receipt.commandId !== request.commandId ||
    receipt.requestId !== request.requestId ||
    receipt.authorizationEnvelopeDigest !==
      request.authorizationEnvelopeDigest ||
    receipt.manifestId !== request.manifestId ||
    receipt.manifestPayloadDigest !== request.manifestPayloadDigest ||
    receipt.exactGrantsDigest !== request.exactGrantsDigest ||
    receipt.bindingDigest !== request.bindingDigest ||
    receipt.bundleDigest !== request.bundleDigest ||
    (receipt.decision !== "IMPORTED" &&
      receipt.decision !== "IMPORT_REPLAY") ||
    typeof receipt.importReceiptDigest !== "string" ||
    !/^[0-9a-f]{64}$/u.test(receipt.importReceiptDigest) ||
    !Number.isSafeInteger(receipt.importedAtEpochMs) ||
    receipt.importedAtEpochMs < Date.UTC(2026, 0, 1) ||
    typeof receipt.importedTransactionId !== "string" ||
    !/^[0-9]{1,32}$/u.test(receipt.importedTransactionId) ||
    receipt.candidateStatus !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_CANDIDATE_STATUS ||
    receipt.canPersistEvidence !== true ||
    receipt.authorization !== false ||
    receipt.canMutate !== false ||
    receipt.canSend !== false
  ) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_RECEIPT_INVALID",
    );
  }
  const verified = Object.freeze(
    Object.fromEntries(RECEIPT_KEYS.map((key) => [key, receipt[key]])),
  );
  VERIFIED_IMPORT_RECEIPTS.add(verified);
  return verified;
}

export function createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2(
  handler,
) {
  if (
    arguments.length !== 1 ||
    typeof handler !== "function" ||
    utilTypes.isProxy(handler)
  ) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_HANDLER_INVALID",
    );
  }
  const capability = Object.freeze({
    [IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_METHOD](
      request,
    ) {
      if (
        request === null ||
        typeof request !== "object" ||
        !OWNER_RPC_REQUESTS.has(request)
      ) {
        fail(
          "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_REQUEST_NOT_MINTED",
        );
      }
      return Reflect.apply(handler, undefined, [request]);
    },
  });
  OWNER_RPC_CAPABILITIES.add(capability);
  return capability;
}

export function createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
  composed,
) {
  if (arguments.length !== 1) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_ARGUMENTS_INVALID",
    );
  }
  // The process-local composition brand is checked before calling its evidence
  // extractor. Plain, cloned, synthetic, proxied and cross-module values cannot
  // make any lower-trust field observable through this boundary.
  if (
    !isComposedPinnedIdentityMailTenantEnrollmentManifestBoundV2(composed)
  ) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_COMPOSITION_NOT_PINNED",
    );
  }
  const evidence =
    identityMailTenantEnrollmentManifestBoundV2Evidence(composed);
  if (
    evidence.contract !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_CONTRACT ||
    !isFrozenDataRecordWithExactCount(
      evidence.commandDatabaseArguments,
      69,
    ) ||
    evidence.authorization !== false ||
    evidence.canMutate !== false ||
    evidence.canSend !== false
  ) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_COMPOSITION_EVIDENCE_INVALID",
    );
  }

  const canonicalBundle = Object.freeze({
    schemaVersion: 1,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_CONTRACT,
    profile: IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_PROFILE,
    binding: composed,
    commandDatabaseArguments: evidence.commandDatabaseArguments,
    commandEvidence: evidence.command,
    manifestEvidence: evidence.dutyManifest,
    exactGrantsProjection: evidence.exactGrants.projection,
    authorization: false,
    canMutate: false,
    canSend: false,
  });
  const bundleCanonicalJson = canonicalStringify(canonicalBundle);
  const bundleBytes = Buffer.byteLength(bundleCanonicalJson, "utf8");
  if (
    bundleBytes < 1 ||
    bundleBytes >
      IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_MAX_BUNDLE_BYTES
  ) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_BUNDLE_SIZE_INVALID",
    );
  }
  const digest = bundleDigest(bundleCanonicalJson);
  const databaseArguments = Object.freeze([bundleCanonicalJson, digest]);
  const bundle = Object.freeze({
    schemaVersion: 1,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_CONTRACT,
    profile: IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_PROFILE,
    tenantId: composed.tenantId,
    commandId: composed.commandId,
    requestId: composed.requestId,
    authorizationEnvelopeDigest: composed.authorizationEnvelopeDigest,
    manifestId: composed.manifestId,
    manifestPayloadDigest: composed.manifestPayloadDigest,
    exactGrantsDigest: composed.exactGrantsDigest,
    bindingDigest: composed.bindingDigest,
    bundleDigest: digest,
    bundleBytes,
    authorization: false,
    canMutate: false,
    canSend: false,
  });
  IMPORT_BUNDLES.add(bundle);
  IMPORT_BUNDLE_PRIVATE.set(
    bundle,
    Object.freeze({ bundleCanonicalJson, databaseArguments }),
  );
  return bundle;
}

export function identityMailTenantEnrollmentEvidenceImportBundleV2DatabaseArguments(
  bundle,
) {
  if (arguments.length !== 1) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_ARGUMENTS_INVALID",
    );
  }
  requireImportBundle(bundle);
  return IMPORT_BUNDLE_PRIVATE.get(bundle).databaseArguments;
}

export function isIdentityMailTenantEnrollmentEvidenceImportBundleV2(value) {
  return (
    value !== null && typeof value === "object" && IMPORT_BUNDLES.has(value)
  );
}

export function isVerifiedIdentityMailTenantEnrollmentEvidenceImportReceiptV2(
  value,
) {
  return (
    value !== null &&
    typeof value === "object" &&
    VERIFIED_IMPORT_RECEIPTS.has(value)
  );
}

export async function importIdentityMailTenantEnrollmentEvidenceV2(
  bundle,
  ownerRpc,
) {
  if (arguments.length !== 2) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_ARGUMENTS_INVALID",
    );
  }
  // Both process-local brands are resolved before the owner handler is read or
  // invoked. This preserves a zero-observation boundary for hostile inputs.
  requireImportBundle(bundle);
  const invokeOwnerRpc = ownerRpcMethod(ownerRpc);
  const databaseArguments =
    IMPORT_BUNDLE_PRIVATE.get(bundle).databaseArguments;
  const request = importRequest(bundle, databaseArguments);
  let lostResponseObserved = false;

  for (
    let attempt = 1;
    attempt <=
    IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const receipt = await Reflect.apply(invokeOwnerRpc, ownerRpc, [request]);
      return verifyReceipt(receipt, request);
    } catch (error) {
      if (!lostResponseObserved && attempt === 1 && isBrandedLostResponse(error)) {
        lostResponseObserved = true;
        continue;
      }
      if (lostResponseObserved) {
        throw new IdentityMailTenantEnrollmentEvidenceImporterV2AmbiguousOutcomeError(
          operationIdentity(bundle),
        );
      }
      throw error;
    }
  }

  // The loop is deliberately bounded, and the only path reaching this point is
  // a branded lost response on both attempts.
  throw new IdentityMailTenantEnrollmentEvidenceImporterV2AmbiguousOutcomeError(
    operationIdentity(bundle),
  );
}
