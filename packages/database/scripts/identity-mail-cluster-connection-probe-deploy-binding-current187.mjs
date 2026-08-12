import { createHash } from "node:crypto";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionFail,
  current187AdmissionValidDigest,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import { isVerifiedCurrent187AdmissionReceipt } from "./identity-mail-cluster-application-admission-current187-authority.mjs";
import { isVerifiedPersistedCurrent187ConnectionProbeReceipt } from "./identity-mail-cluster-connection-probe-ledger-current187.mjs";

export const CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_SLICE =
  "CURRENT187_J5_R4_PERSISTED_PROBE_DEPLOY_AUTHORITY_BINDING";
export const CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_PROFILE =
  "CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_SYNTHETIC_CI_V1";
export const CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_KIND =
  "CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_RECEIPT";

const RECEIPT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_RECEIPT_V1";
const VERIFIED_BINDING_RECEIPTS = new WeakSet();

function fail(reasonCode, message) {
  current187AdmissionFail(reasonCode, message);
}

function digestReceipt(value) {
  return createHash("sha256")
    .update(`${RECEIPT_DIGEST_DOMAIN}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
}

export function bindPersistedCurrent187ConnectionProbeToDeploymentAuthority(
  persistedProbeReceipt,
  deploymentAuthorityReceipt,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_ARGUMENTS_INVALID",
      "Probe deployment binding requires persisted probe and deployment authority receipts.",
    );
  }
  if (
    !isVerifiedPersistedCurrent187ConnectionProbeReceipt(persistedProbeReceipt)
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_DEPLOY_PERSISTED_RECEIPT_INVALID",
      "Probe deployment binding requires an exact branded persisted J5 receipt.",
    );
  }
  if (!isVerifiedCurrent187AdmissionReceipt(deploymentAuthorityReceipt)) {
    fail(
      "CURRENT187_CONNECTION_PROBE_DEPLOY_AUTHORITY_RECEIPT_INVALID",
      "Probe deployment binding requires an exact branded CURRENT187 authority receipt.",
    );
  }

  const payload = deploymentAuthorityReceipt.envelope.payload;
  const reasons = new Set();
  if (
    payload.purpose !== CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE ||
    payload.environment !== "production"
  ) {
    reasons.add("CURRENT187_CONNECTION_PROBE_DEPLOY_AUTHORITY_PURPOSE_DENIED");
  }
  if (
    persistedProbeReceipt.environment !== "ci" ||
    persistedProbeReceipt.syntheticOnly !== true ||
    persistedProbeReceipt.noncanonicalPersistedConnectionProbeLedger !== true ||
    persistedProbeReceipt.persistedConnectionProbeConsumptionVerified !==
      true ||
    persistedProbeReceipt.productionRootEnrolled !== false
  ) {
    reasons.add("CURRENT187_CONNECTION_PROBE_DEPLOY_SOURCE_PROFILE_DENIED");
  }
  if (payload.releaseSha !== persistedProbeReceipt.releaseSha) {
    reasons.add("CURRENT187_CONNECTION_PROBE_DEPLOY_RELEASE_MISMATCH");
  }
  if (
    payload.clusterIdentityDigest !==
    persistedProbeReceipt.clusterIdentityDigest
  ) {
    reasons.add("CURRENT187_CONNECTION_PROBE_DEPLOY_CLUSTER_MISMATCH");
  }
  if (
    payload.databaseUniverseDigest !==
    persistedProbeReceipt.databaseUniverseDigest
  ) {
    reasons.add("CURRENT187_CONNECTION_PROBE_DEPLOY_UNIVERSE_MISMATCH");
  }
  for (const key of [
    "envelopeDigest",
    "connectionProbeMatrixDigest",
    "persistedConnectionProbeReceiptDigest",
    "persistedConnectionProbeRootFingerprint",
    "verificationReceiptDigest",
  ]) {
    if (!current187AdmissionValidDigest(persistedProbeReceipt[key])) {
      reasons.add("CURRENT187_CONNECTION_PROBE_DEPLOY_SOURCE_DIGEST_INVALID");
    }
  }

  const reasonCodes = Object.freeze([...reasons].sort());
  const publicReceipt = {
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    connectionProbeBindingsMatched: reasonCodes.length === 0,
    contract: CURRENT187_ADMISSION_CONTRACT,
    deploymentGoConsumable: false,
    kind: CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_KIND,
    persistedConnectionProbeConsumptionVerified: true,
    productionBindingSatisfied: false,
    productionRootEnrolled: false,
    productionRuntimeAttested: false,
    profile: CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_PROFILE,
    reasonCodes,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    sharedBetaAccess: false,
    slice: CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_SLICE,
    sourceAuthorityPayloadDigest:
      deploymentAuthorityReceipt.envelope.payloadDigest,
    sourceConnectionProbeEnvelopeDigest: persistedProbeReceipt.envelopeDigest,
    sourceConnectionProbeMatrixDigest:
      persistedProbeReceipt.connectionProbeMatrixDigest,
    sourceConnectionProbeRootFingerprint:
      persistedProbeReceipt.persistedConnectionProbeRootFingerprint,
    sourceConnectionProbeVerificationReceiptDigest:
      persistedProbeReceipt.verificationReceiptDigest,
    sourceClusterIdentityDigest: persistedProbeReceipt.clusterIdentityDigest,
    sourceDatabaseUniverseDigest: persistedProbeReceipt.databaseUniverseDigest,
    sourcePersistedConnectionProbeReceiptDigest:
      persistedProbeReceipt.persistedConnectionProbeReceiptDigest,
    sourceReleaseSha: persistedProbeReceipt.releaseSha,
    status:
      reasonCodes.length === 0
        ? "SCOPE_BOUND_DENY_ONLY"
        : "SCOPE_BINDING_DENIED",
    syntheticOnly: true,
    testAccessAuthorized: false,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    connectionProbeDeployBindingDigest: digestReceipt(publicReceipt),
  });
  VERIFIED_BINDING_RECEIPTS.add(receipt);
  return receipt;
}

export function isVerifiedCurrent187ConnectionProbeDeployBindingReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_BINDING_RECEIPTS.has(value)
  );
}
