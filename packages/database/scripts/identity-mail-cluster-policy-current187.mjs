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
import { isVerifiedCurrent187ClusterAcquisitionReceipt } from "./identity-mail-cluster-acquisition-current187.mjs";
import { isVerifiedCurrent187ClusterInventoryReceipt } from "./identity-mail-cluster-inventory-current187-planner.mjs";

export const CURRENT187_CLUSTER_POLICY_SLICE =
  "CURRENT187_F_SIGNED_CLUSTER_POLICY_EVALUATOR";
export const CURRENT187_CLUSTER_POLICY_PROFILE =
  "CURRENT187_PRE_GREEN_SIGNED_CLUSTER_POLICY_REHEARSAL_V1";
export const CURRENT187_CLUSTER_POLICY_RECEIPT_KIND =
  "CURRENT187_CLUSTER_POLICY_DENY_ONLY_RECEIPT";

const CURRENT187_CLUSTER_POLICY_RECEIPT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CLUSTER_POLICY_RECEIPT_V1";

const VERIFIED_CURRENT187_CLUSTER_POLICY_RECEIPTS = new WeakSet();

const POLICY_BINDINGS = Object.freeze([
  Object.freeze({
    authorityKey: "clusterCatalogDigest",
    plannerKey: "clusterCatalogDigest",
    reasonCode: "CURRENT187_CLUSTER_POLICY_CLUSTER_CATALOG_MISMATCH",
  }),
  Object.freeze({
    authorityKey: "clusterIdentityDigest",
    plannerKey: "clusterIdentityDigest",
    reasonCode: "CURRENT187_CLUSTER_POLICY_CLUSTER_IDENTITY_MISMATCH",
  }),
  Object.freeze({
    authorityKey: "currentAclPolicyDigest",
    plannerKey: "currentAclPolicyDigest",
    reasonCode: "CURRENT187_CLUSTER_POLICY_CURRENT_ACL_MISMATCH",
  }),
  Object.freeze({
    authorityKey: "databaseUniverseDigest",
    plannerKey: "expectedDatabaseUniverseDigest",
    reasonCode: "CURRENT187_CLUSTER_POLICY_DATABASE_UNIVERSE_MISMATCH",
  }),
  Object.freeze({
    authorityKey: "defaultAclPolicyDigest",
    plannerKey: "defaultAclPolicyDigest",
    reasonCode: "CURRENT187_CLUSTER_POLICY_DEFAULT_ACL_MISMATCH",
  }),
  Object.freeze({
    authorityKey: "perDatabaseCatalogDigest",
    plannerKey: "perDatabaseCatalogDigest",
    reasonCode: "CURRENT187_CLUSTER_POLICY_PER_DATABASE_CATALOG_MISMATCH",
  }),
  Object.freeze({
    authorityKey: "roleBindingsDigest",
    plannerKey: "roleBindingsDigest",
    reasonCode: "CURRENT187_CLUSTER_POLICY_ROLE_BINDINGS_MISMATCH",
  }),
]);

function digestPolicyReceipt(value) {
  return createHash("sha256")
    .update(`${CURRENT187_CLUSTER_POLICY_RECEIPT_DIGEST_DOMAIN}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
}

function assertBrandedInputs(acquisitionReceipt, authorityReceipt) {
  if (!isVerifiedCurrent187ClusterAcquisitionReceipt(acquisitionReceipt)) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_POLICY_ACQUISITION_RECEIPT_INVALID",
      "The cluster policy evaluator requires an exact branded CURRENT187 acquisition receipt.",
    );
  }
  if (!isVerifiedCurrent187AdmissionReceipt(authorityReceipt)) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_POLICY_AUTHORITY_RECEIPT_INVALID",
      "The cluster policy evaluator requires an exact branded purpose-bound authority receipt.",
    );
  }
}

export function evaluateCurrent187ClusterPolicy(
  acquisitionReceipt,
  authorityReceipt,
) {
  if (arguments.length !== 2) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_POLICY_ARGUMENTS_INVALID",
      "Cluster policy evaluation requires acquisition and authority receipts.",
    );
  }
  assertBrandedInputs(acquisitionReceipt, authorityReceipt);

  const reasons = new Set();
  const plannerReceipt = acquisitionReceipt.plannerReceipt;
  const payload = authorityReceipt.envelope.payload;

  if (
    acquisitionReceipt.acquisitionStatus !== "ACQUIRED" ||
    acquisitionReceipt.liveClusterScanAcquired !== true ||
    !isVerifiedCurrent187ClusterInventoryReceipt(plannerReceipt) ||
    plannerReceipt.inventoryStatus !== "MATCHED" ||
    plannerReceipt.inventoryProjectionMatched !== true
  ) {
    reasons.add("CURRENT187_CLUSTER_POLICY_ACQUISITION_NOT_MATCHED");
  }
  if (
    acquisitionReceipt.externalDdlFenceAttested !== true ||
    plannerReceipt?.externalDdlFenceAttested !== true ||
    !current187AdmissionValidDigest(
      acquisitionReceipt.externalDdlFenceAttestationDigest,
    )
  ) {
    reasons.add("CURRENT187_CLUSTER_POLICY_DDL_FENCE_NOT_ATTESTED");
  }
  if (
    payload.purpose !== CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE ||
    payload.environment !== "production"
  ) {
    reasons.add("CURRENT187_CLUSTER_POLICY_DEPLOYMENT_AUTHORITY_REQUIRED");
  }

  if (plannerReceipt) {
    for (const binding of POLICY_BINDINGS) {
      if (
        payload[binding.authorityKey] !== plannerReceipt[binding.plannerKey]
      ) {
        reasons.add(binding.reasonCode);
      }
    }
  }
  if (payload.liveScanDigest !== acquisitionReceipt.acquisitionDigest) {
    reasons.add("CURRENT187_CLUSTER_POLICY_LIVE_SCAN_MISMATCH");
  }
  if (
    payload.ddlFenceDigest !==
    acquisitionReceipt.externalDdlFenceAttestationDigest
  ) {
    reasons.add("CURRENT187_CLUSTER_POLICY_DDL_FENCE_BINDING_MISMATCH");
  }

  const reasonCodes = Object.freeze([...reasons].sort());
  const publicReceipt = {
    authorization: false,
    canMutate: false,
    canSend: false,
    contract: CURRENT187_ADMISSION_CONTRACT,
    deploymentGoConsumable: false,
    externalDdlFenceAttested:
      acquisitionReceipt.externalDdlFenceAttested === true,
    kind: CURRENT187_CLUSTER_POLICY_RECEIPT_KIND,
    persistedConsumptionVerified: false,
    policyBindingsMatched: reasonCodes.length === 0,
    policyStatus: reasonCodes.length === 0 ? "BINDINGS_MATCHED" : "DENIED",
    productionRootEnrolled: false,
    productionRuntimeAttested: false,
    reasonCodes,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    sharedBetaAccess: false,
    slice: CURRENT187_CLUSTER_POLICY_SLICE,
    sourceAcquisitionDigest: acquisitionReceipt.acquisitionDigest,
    sourceAuthorityPayloadDigest: authorityReceipt.envelope.payloadDigest,
    testAccessAuthorized: false,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    policyEvaluationDigest: digestPolicyReceipt(publicReceipt),
  });
  VERIFIED_CURRENT187_CLUSTER_POLICY_RECEIPTS.add(receipt);
  return receipt;
}

export function isVerifiedCurrent187ClusterPolicyReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_CURRENT187_CLUSTER_POLICY_RECEIPTS.has(value)
  );
}
