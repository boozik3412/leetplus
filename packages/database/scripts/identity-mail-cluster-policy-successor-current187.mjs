import { createHash } from "node:crypto";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionFail,
  current187AdmissionValidDigest,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import { isVerifiedCurrent187ConnectionProbeDeployBindingReceipt } from "./identity-mail-cluster-connection-probe-deploy-binding-current187.mjs";
import { isVerifiedCurrent187ClusterPolicyReceipt } from "./identity-mail-cluster-policy-current187.mjs";

export const CURRENT187_CLUSTER_POLICY_SUCCESSOR_SLICE =
  "CURRENT187_F_J5_R5_CONNECTION_PROBE_POLICY_SUCCESSOR";
export const CURRENT187_CLUSTER_POLICY_SUCCESSOR_PROFILE =
  "CURRENT187_CONNECTION_PROBE_POLICY_SUCCESSOR_SYNTHETIC_CI_V1";
export const CURRENT187_CLUSTER_POLICY_SUCCESSOR_KIND =
  "CURRENT187_CONNECTION_PROBE_POLICY_SUCCESSOR_RECEIPT";

const RECEIPT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_POLICY_SUCCESSOR_RECEIPT_V1";
const VERIFIED_SUCCESSOR_RECEIPTS = new WeakSet();

function fail(reasonCode, message) {
  current187AdmissionFail(reasonCode, message);
}

function digestReceipt(value) {
  return createHash("sha256")
    .update(`${RECEIPT_DIGEST_DOMAIN}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
}

export function evaluateCurrent187ClusterPolicySuccessor(
  clusterPolicyReceipt,
  connectionProbeBindingReceipt,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_CLUSTER_POLICY_SUCCESSOR_ARGUMENTS_INVALID",
      "Policy successor requires exact cluster-policy and connection-probe binding receipts.",
    );
  }
  if (!isVerifiedCurrent187ClusterPolicyReceipt(clusterPolicyReceipt)) {
    fail(
      "CURRENT187_CLUSTER_POLICY_SUCCESSOR_POLICY_RECEIPT_INVALID",
      "Policy successor requires an exact branded CURRENT187-F receipt.",
    );
  }
  if (
    !isVerifiedCurrent187ConnectionProbeDeployBindingReceipt(
      connectionProbeBindingReceipt,
    )
  ) {
    fail(
      "CURRENT187_CLUSTER_POLICY_SUCCESSOR_PROBE_RECEIPT_INVALID",
      "Policy successor requires an exact branded CURRENT187-J5-R4 receipt.",
    );
  }

  const reasons = new Set();
  if (
    clusterPolicyReceipt.policyStatus !== "BINDINGS_MATCHED" ||
    clusterPolicyReceipt.policyBindingsMatched !== true ||
    !current187AdmissionValidDigest(
      clusterPolicyReceipt.policyEvaluationDigest,
    ) ||
    clusterPolicyReceipt.authorization !== false ||
    clusterPolicyReceipt.canMutate !== false ||
    clusterPolicyReceipt.canSend !== false ||
    clusterPolicyReceipt.deploymentGoConsumable !== false ||
    clusterPolicyReceipt.productionRootEnrolled !== false ||
    clusterPolicyReceipt.productionRuntimeAttested !== false ||
    clusterPolicyReceipt.testAccessAuthorized !== false ||
    clusterPolicyReceipt.sharedBetaAccess !== false
  ) {
    reasons.add("CURRENT187_CLUSTER_POLICY_SUCCESSOR_LEGACY_POLICY_DENIED");
  }
  if (
    connectionProbeBindingReceipt.status !== "SCOPE_BOUND_DENY_ONLY" ||
    connectionProbeBindingReceipt.connectionProbeBindingsMatched !== true ||
    !current187AdmissionValidDigest(
      connectionProbeBindingReceipt.connectionProbeDeployBindingDigest,
    ) ||
    connectionProbeBindingReceipt.persistedConnectionProbeConsumptionVerified !==
      true ||
    connectionProbeBindingReceipt.authorization !== false ||
    connectionProbeBindingReceipt.canApply !== false ||
    connectionProbeBindingReceipt.canMutate !== false ||
    connectionProbeBindingReceipt.canSend !== false ||
    connectionProbeBindingReceipt.deploymentGoConsumable !== false ||
    connectionProbeBindingReceipt.productionBindingSatisfied !== false ||
    connectionProbeBindingReceipt.productionRootEnrolled !== false ||
    connectionProbeBindingReceipt.productionRuntimeAttested !== false ||
    connectionProbeBindingReceipt.testAccessAuthorized !== false ||
    connectionProbeBindingReceipt.sharedBetaAccess !== false ||
    connectionProbeBindingReceipt.syntheticOnly !== true
  ) {
    reasons.add("CURRENT187_CLUSTER_POLICY_SUCCESSOR_PROBE_BINDING_DENIED");
  }
  if (
    !current187AdmissionValidDigest(
      clusterPolicyReceipt.sourceAuthorityPayloadDigest,
    ) ||
    clusterPolicyReceipt.sourceAuthorityPayloadDigest !==
      connectionProbeBindingReceipt.sourceAuthorityPayloadDigest
  ) {
    reasons.add("CURRENT187_CLUSTER_POLICY_SUCCESSOR_AUTHORITY_MISMATCH");
  }

  const reasonCodes = Object.freeze([...reasons].sort());
  const publicReceipt = {
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    connectionProbeBindingsMatched:
      connectionProbeBindingReceipt.connectionProbeBindingsMatched === true,
    contract: CURRENT187_ADMISSION_CONTRACT,
    deploymentGoConsumable: false,
    kind: CURRENT187_CLUSTER_POLICY_SUCCESSOR_KIND,
    legacyPolicyBindingsMatched:
      clusterPolicyReceipt.policyBindingsMatched === true,
    persistedConnectionProbeConsumptionVerified:
      connectionProbeBindingReceipt.persistedConnectionProbeConsumptionVerified ===
      true,
    productionBindingSatisfied: false,
    productionRootEnrolled: false,
    productionRuntimeAttested: false,
    profile: CURRENT187_CLUSTER_POLICY_SUCCESSOR_PROFILE,
    reasonCodes,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    sharedBetaAccess: false,
    slice: CURRENT187_CLUSTER_POLICY_SUCCESSOR_SLICE,
    sourceAuthorityPayloadDigest:
      clusterPolicyReceipt.sourceAuthorityPayloadDigest,
    sourceConnectionProbeDeployBindingDigest:
      connectionProbeBindingReceipt.connectionProbeDeployBindingDigest,
    sourcePersistedConnectionProbeReceiptDigest:
      connectionProbeBindingReceipt.sourcePersistedConnectionProbeReceiptDigest,
    sourcePolicyEvaluationDigest: clusterPolicyReceipt.policyEvaluationDigest,
    status:
      reasonCodes.length === 0
        ? "SUCCESSOR_BINDINGS_MATCHED_DENY_ONLY"
        : "SUCCESSOR_BINDINGS_DENIED",
    successorPolicyBindingsMatched: reasonCodes.length === 0,
    syntheticOnly: true,
    testAccessAuthorized: false,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    successorPolicyEvaluationDigest: digestReceipt(publicReceipt),
  });
  VERIFIED_SUCCESSOR_RECEIPTS.add(receipt);
  return receipt;
}

export function isVerifiedCurrent187ClusterPolicySuccessorReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_SUCCESSOR_RECEIPTS.has(value)
  );
}
