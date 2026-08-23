import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionValidDigest,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";

export const CURRENT187_NETWORK_RUNTIME_SLICE =
  "CURRENT187_J_NETWORK_RUNTIME_ATTESTATION_FOUNDATION";
export const CURRENT187_NETWORK_RUNTIME_PROFILE =
  "CURRENT187_SYNTHETIC_NETWORK_RUNTIME_ATTESTATION_DENY_ONLY_V1";
export const CURRENT187_NETWORK_PROBE_RECEIPT_KIND =
  "CURRENT187_SYNTHETIC_NETWORK_PROBE_DENY_ONLY_RECEIPT";
export const CURRENT187_HOST_CONTROL_RECEIPT_KIND =
  "CURRENT187_SYNTHETIC_HOST_CONTROL_DENY_ONLY_RECEIPT";
export const CURRENT187_NETWORK_RUNTIME_RECEIPT_KIND =
  "CURRENT187_SYNTHETIC_NETWORK_RUNTIME_ATTESTATION_DENY_ONLY_RECEIPT";
export const CURRENT187_NETWORK_RUNTIME_STATUS = "SYNTHETIC_MATCHED_DENY_ONLY";

export const CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES = Object.freeze([
  "APPLICATION",
  "COORDINATOR",
  "MIGRATION",
  "WORKER",
]);

const EXPECTED_POOL_MODE_BY_PURPOSE = Object.freeze({
  APPLICATION: "TRANSACTION",
  COORDINATOR: "SESSION",
  MIGRATION: "SESSION",
  WORKER: "SESSION",
});
const SAFE_HBA_AUTH_METHODS = new Set(["cert", "scram-sha-256"]);
const SAFE_ENDPOINT_CLASSES = new Set(["DIRECT_DATABASE", "POOLER"]);
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const NETWORK_PROBE_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_NETWORK_PROBE_EVIDENCE_V1";
const HOST_CONTROL_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_HOST_CONTROL_EVIDENCE_V1";
const NETWORK_ENDPOINT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_NETWORK_ENDPOINT_BINDING_V1";
const TLS_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_TLS_BINDING_V1";
const HBA_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_HBA_BINDING_V1";
const POOLER_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_POOLER_BINDING_V1";
const SERVICE_ACCOUNT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_SERVICE_ACCOUNT_BINDING_V1";
const RUNTIME_ATTESTATION_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_NETWORK_RUNTIME_ATTESTATION_V1";

const NETWORK_INPUT_KEYS = Object.freeze([
  "clusterIdentityDigest",
  "databaseUniverseDigest",
  "environment",
  "hostControlChallengeDigest",
  "releaseSha",
  "services",
]);
const SERVICE_KEYS = Object.freeze([
  "allowedOperationsDigest",
  "applicationNameDigest",
  "backendIdentityDigest",
  "endpointClass",
  "endpointDigest",
  "hbaAuthMethod",
  "hbaRuleDigest",
  "negativeProbeDigest",
  "negativeProbePassed",
  "poolerMappingDigest",
  "poolMode",
  "positiveProbeDigest",
  "positiveProbePassed",
  "purpose",
  "secretReferenceDigest",
  "tlsMode",
  "tlsPeerDigest",
]);
const HOST_INPUT_KEYS = Object.freeze([
  "approvedNetworkProbeDigest",
  "clusterIdentityDigest",
  "controlPlaneSourceDigest",
  "databaseUniverseDigest",
  "environment",
  "externalAuditDigest",
  "hbaRulesDigest",
  "hostControlChallengeDigest",
  "negativeProbeMatrixPassed",
  "poolerConfigurationDigest",
  "poolerUserCollapseAbsent",
  "releaseSha",
  "reloadEpochDigest",
  "serviceAccountPolicyDigest",
  "serviceAccountsDistinct",
  "tlsConfigurationDigest",
  "tlsRequired",
  "trustAuthenticationAbsent",
  "wildcardClientRulesAbsent",
]);

const VERIFIED_NETWORK_PROBE_RECEIPTS = new WeakSet();
const VERIFIED_HOST_CONTROL_RECEIPTS = new WeakSet();
const VERIFIED_NETWORK_RUNTIME_RECEIPTS = new WeakSet();

function fail(reasonCode, message) {
  current187AdmissionFail(reasonCode, message);
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
}

function requireDigests(value, keys, reasonCode) {
  if (!keys.every((key) => current187AdmissionValidDigest(value[key]))) {
    fail(
      reasonCode,
      "Every CURRENT187 infrastructure binding must be a non-zero SHA-256 digest.",
    );
  }
}

function exactDenseArray(value, length, reasonCode) {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) {
    fail(reasonCode, "Service probe evidence must be one exact dense array.");
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode, "Service probe evidence must be one exact dense array.");
  }
  const expectedKeys = [
    ...Array.from({ length }, (_, index) => String(index)),
    "length",
  ].sort();
  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.some((key) => typeof key !== "string")) {
    fail(reasonCode, "Service probe evidence must be one exact dense array.");
  }
  actualKeys.sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    descriptors.length?.value !== length ||
    descriptors.length?.enumerable !== false ||
    Array.from({ length }, (_, index) => descriptors[String(index)]).some(
      (descriptor) =>
        !descriptor ||
        !Object.hasOwn(descriptor, "value") ||
        descriptor.enumerable !== true,
    )
  ) {
    fail(reasonCode, "Service probe evidence must be one exact dense array.");
  }
  return Object.freeze(
    Array.from({ length }, (_, index) => descriptors[String(index)].value),
  );
}

function normalizeService(value, expectedPurpose) {
  const reasonCode = "CURRENT187_NETWORK_PROBE_SERVICE_INVALID";
  const service = current187AdmissionExactDataRecord(
    value,
    SERVICE_KEYS,
    reasonCode,
    "Each service probe must be one exact data-only record.",
  );
  requireDigests(
    service,
    [
      "allowedOperationsDigest",
      "applicationNameDigest",
      "backendIdentityDigest",
      "endpointDigest",
      "hbaRuleDigest",
      "negativeProbeDigest",
      "poolerMappingDigest",
      "positiveProbeDigest",
      "secretReferenceDigest",
      "tlsPeerDigest",
    ],
    reasonCode,
  );
  if (
    service.purpose !== expectedPurpose ||
    !SAFE_ENDPOINT_CLASSES.has(service.endpointClass) ||
    !SAFE_HBA_AUTH_METHODS.has(service.hbaAuthMethod) ||
    service.tlsMode !== "VERIFY_FULL" ||
    service.poolMode !== EXPECTED_POOL_MODE_BY_PURPOSE[expectedPurpose] ||
    service.positiveProbePassed !== true ||
    service.negativeProbePassed !== true
  ) {
    fail(
      reasonCode,
      "Service purpose, TLS, HBA, pool mode, or positive/negative probe evidence is unsafe.",
    );
  }
  return Object.freeze({ ...service });
}

function assertPairwiseDistinct(services, key) {
  const values = services.map((service) => service[key]);
  if (new Set(values).size !== values.length) {
    fail(
      "CURRENT187_NETWORK_PROBE_SERVICE_ACCOUNT_COLLAPSE",
      "Every runtime purpose must retain a distinct service-account mapping.",
    );
  }
}

function validateCommonBinding(value, reasonCode) {
  requireDigests(
    value,
    [
      "clusterIdentityDigest",
      "databaseUniverseDigest",
      "hostControlChallengeDigest",
    ],
    reasonCode,
  );
  if (
    value.environment !== "ci" ||
    !RELEASE_SHA_PATTERN.test(value.releaseSha)
  ) {
    fail(
      reasonCode,
      "The CURRENT187 foundation accepts only an exact synthetic-CI release binding.",
    );
  }
}

export function createSyntheticCurrent187NetworkProbeReceiptForTestOnly(input) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_NETWORK_PROBE_ARGUMENTS_INVALID",
      "Synthetic network probe construction accepts exactly one input.",
    );
  }
  const source = current187AdmissionExactDataRecord(
    input,
    NETWORK_INPUT_KEYS,
    "CURRENT187_NETWORK_PROBE_INPUT_INVALID",
    "Synthetic network probe input must be one exact data-only record.",
  );
  validateCommonBinding(source, "CURRENT187_NETWORK_PROBE_BINDING_INVALID");
  const services = exactDenseArray(
    source.services,
    CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.length,
    "CURRENT187_NETWORK_PROBE_SERVICES_INVALID",
  ).map((service, index) =>
    normalizeService(
      service,
      CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES[index],
    ),
  );
  for (const key of [
    "applicationNameDigest",
    "backendIdentityDigest",
    "poolerMappingDigest",
    "secretReferenceDigest",
  ]) {
    assertPairwiseDistinct(services, key);
  }
  const publicReceipt = {
    authorization: false,
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: source.clusterIdentityDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: source.databaseUniverseDigest,
    environment: source.environment,
    hostControlChallengeDigest: source.hostControlChallengeDigest,
    kind: CURRENT187_NETWORK_PROBE_RECEIPT_KIND,
    productionRootEnrolled: false,
    productionRuntimeAttested: false,
    releaseSha: source.releaseSha,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    services,
    sharedBetaAccess: false,
    slice: CURRENT187_NETWORK_RUNTIME_SLICE,
    syntheticOnly: true,
    testAccessAuthorized: false,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    networkProbeDigest: digest(NETWORK_PROBE_DIGEST_DOMAIN, publicReceipt),
  });
  VERIFIED_NETWORK_PROBE_RECEIPTS.add(receipt);
  return receipt;
}

export function createSyntheticCurrent187HostControlReceiptForTestOnly(input) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_HOST_CONTROL_ARGUMENTS_INVALID",
      "Synthetic host-control construction accepts exactly one input.",
    );
  }
  const source = current187AdmissionExactDataRecord(
    input,
    HOST_INPUT_KEYS,
    "CURRENT187_HOST_CONTROL_INPUT_INVALID",
    "Synthetic host-control input must be one exact data-only record.",
  );
  validateCommonBinding(source, "CURRENT187_HOST_CONTROL_BINDING_INVALID");
  requireDigests(
    source,
    [
      "approvedNetworkProbeDigest",
      "controlPlaneSourceDigest",
      "externalAuditDigest",
      "hbaRulesDigest",
      "poolerConfigurationDigest",
      "reloadEpochDigest",
      "serviceAccountPolicyDigest",
      "tlsConfigurationDigest",
    ],
    "CURRENT187_HOST_CONTROL_BINDING_INVALID",
  );
  if (
    source.negativeProbeMatrixPassed !== true ||
    source.poolerUserCollapseAbsent !== true ||
    source.serviceAccountsDistinct !== true ||
    source.tlsRequired !== true ||
    source.trustAuthenticationAbsent !== true ||
    source.wildcardClientRulesAbsent !== true
  ) {
    fail(
      "CURRENT187_HOST_CONTROL_POLICY_DENIED",
      "Host/control-plane evidence does not prove the fail-closed HBA, TLS, pooler, and service-account policy.",
    );
  }
  const publicReceipt = {
    ...source,
    authorization: false,
    canMutate: false,
    canSend: false,
    contract: CURRENT187_ADMISSION_CONTRACT,
    kind: CURRENT187_HOST_CONTROL_RECEIPT_KIND,
    productionRootEnrolled: false,
    productionRuntimeAttested: false,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    sharedBetaAccess: false,
    slice: CURRENT187_NETWORK_RUNTIME_SLICE,
    syntheticOnly: true,
    testAccessAuthorized: false,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    hostControlEvidenceDigest: digest(
      HOST_CONTROL_DIGEST_DOMAIN,
      publicReceipt,
    ),
  });
  VERIFIED_HOST_CONTROL_RECEIPTS.add(receipt);
  return receipt;
}

function bindingProjection(services, keys) {
  return services.map((service) =>
    Object.fromEntries(["purpose", ...keys].map((key) => [key, service[key]])),
  );
}

export function evaluateCurrent187NetworkRuntimeAttestation(
  networkProbeReceipt,
  hostControlReceipt,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_NETWORK_RUNTIME_ARGUMENTS_INVALID",
      "Network runtime evaluation requires exact probe and host-control receipts.",
    );
  }
  if (!VERIFIED_NETWORK_PROBE_RECEIPTS.has(networkProbeReceipt)) {
    fail(
      "CURRENT187_NETWORK_RUNTIME_PROBE_RECEIPT_INVALID",
      "The network runtime evaluator requires an exact branded probe receipt.",
    );
  }
  if (!VERIFIED_HOST_CONTROL_RECEIPTS.has(hostControlReceipt)) {
    fail(
      "CURRENT187_NETWORK_RUNTIME_HOST_RECEIPT_INVALID",
      "The network runtime evaluator requires an exact branded host-control receipt.",
    );
  }
  const commonKeys = [
    "clusterIdentityDigest",
    "databaseUniverseDigest",
    "environment",
    "hostControlChallengeDigest",
    "releaseSha",
  ];
  if (
    hostControlReceipt.approvedNetworkProbeDigest !==
      networkProbeReceipt.networkProbeDigest ||
    commonKeys.some(
      (key) => hostControlReceipt[key] !== networkProbeReceipt[key],
    )
  ) {
    fail(
      "CURRENT187_NETWORK_RUNTIME_CROSS_BINDING_MISMATCH",
      "Probe and host-control evidence do not describe the same release, cluster, challenge, and database universe.",
    );
  }
  const services = networkProbeReceipt.services;
  const networkEndpointDigest = digest(
    NETWORK_ENDPOINT_DIGEST_DOMAIN,
    bindingProjection(services, ["endpointClass", "endpointDigest"]),
  );
  const tlsDigest = digest(TLS_DIGEST_DOMAIN, {
    serviceBindings: bindingProjection(services, ["tlsMode", "tlsPeerDigest"]),
    tlsConfigurationDigest: hostControlReceipt.tlsConfigurationDigest,
  });
  const hbaDigest = digest(HBA_DIGEST_DOMAIN, {
    hbaRulesDigest: hostControlReceipt.hbaRulesDigest,
    serviceBindings: bindingProjection(services, [
      "hbaAuthMethod",
      "hbaRuleDigest",
    ]),
  });
  const poolerDigest = digest(POOLER_DIGEST_DOMAIN, {
    poolerConfigurationDigest: hostControlReceipt.poolerConfigurationDigest,
    serviceBindings: bindingProjection(services, [
      "poolMode",
      "poolerMappingDigest",
    ]),
  });
  const serviceAccountMappingDigest = digest(SERVICE_ACCOUNT_DIGEST_DOMAIN, {
    serviceAccountPolicyDigest: hostControlReceipt.serviceAccountPolicyDigest,
    serviceBindings: bindingProjection(services, [
      "allowedOperationsDigest",
      "applicationNameDigest",
      "backendIdentityDigest",
      "negativeProbeDigest",
      "poolerMappingDigest",
      "positiveProbeDigest",
      "secretReferenceDigest",
    ]),
  });
  const publicReceipt = {
    authorization: false,
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: networkProbeReceipt.clusterIdentityDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: networkProbeReceipt.databaseUniverseDigest,
    hbaDigest,
    hostControlEvidenceDigest: hostControlReceipt.hostControlEvidenceDigest,
    hostControlEvidenceMatched: true,
    kind: CURRENT187_NETWORK_RUNTIME_RECEIPT_KIND,
    networkEndpointDigest,
    networkProbeDigest: networkProbeReceipt.networkProbeDigest,
    policyAllowlistEvaluated: false,
    poolerDigest,
    productionRootEnrolled: false,
    productionRuntimeAttested: false,
    releaseSha: networkProbeReceipt.releaseSha,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    serviceAccountMappingDigest,
    sharedBetaAccess: false,
    slice: CURRENT187_NETWORK_RUNTIME_SLICE,
    status: CURRENT187_NETWORK_RUNTIME_STATUS,
    syntheticOnly: true,
    testAccessAuthorized: false,
    tlsDigest,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    networkRuntimeAttestationDigest: digest(
      RUNTIME_ATTESTATION_DIGEST_DOMAIN,
      publicReceipt,
    ),
  });
  VERIFIED_NETWORK_RUNTIME_RECEIPTS.add(receipt);
  return receipt;
}

export function isVerifiedCurrent187NetworkRuntimeAttestationReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_NETWORK_RUNTIME_RECEIPTS.has(value)
  );
}
