import { createHash } from "node:crypto";

import {
  identityMailTenantEnrollmentAuthorityV2Evidence,
  identityMailTenantEnrollmentAuthorityV2Payload,
  identityMailTenantEnrollmentCommandV2DatabaseArguments,
  isVerifiedIdentityMailTenantEnrollmentCommandAuthorityV2,
} from "./identity-mail-tenant-enrollment-authority-v2.mjs";
import {
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PROFILE,
  identityMailDutyRoleManifestV2Evidence,
  identityMailDutyRoleManifestV2Payload,
  isVerifiedIdentityMailDutyRoleManifestV2,
} from "./identity-mail-duty-role-manifest-v2.mjs";
import {
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DIGEST_DOMAIN,
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
  identityMailDutyRoleGrantsCurrent185Projection,
} from "./identity-mail-duty-role-grants-current185.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_CONTRACT =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_PROFILE =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_PROFILE_V1";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_V1";

const COMPOSED_PINNED_BINDINGS = new WeakSet();
const COMPOSED_PINNED_EVIDENCE = new WeakMap();

export class IdentityMailTenantEnrollmentManifestBoundV2Error extends Error {
  constructor(reasonCode) {
    super("The PINNED command/Manifest V2 composition was rejected.");
    this.name = "IdentityMailTenantEnrollmentManifestBoundV2Error";
    this.code = reasonCode;
    this.reasonCode = reasonCode;
    this.exitCode = 3;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new IdentityMailTenantEnrollmentManifestBoundV2Error(reasonCode);
}

function grantsProjectionDigest(projection) {
  return createHash("sha256")
    .update(
      `${IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DIGEST_DOMAIN}\n${canonicalStringify(projection)}\n`,
      "utf8",
    )
    .digest("hex");
}

function compositionDigest(projection) {
  return createHash("sha256")
    .update(
      `${IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_DIGEST_DOMAIN}\n${canonicalStringify(projection)}\n`,
      "utf8",
    )
    .digest("hex");
}

function exactMatch(left, right) {
  return left === right;
}

function allBindingsMatch(command, manifestPayload, manifestEvidence, grants) {
  return (
    exactMatch(command.expectedDatabaseName, manifestPayload.database.name) &&
    exactMatch(command.expectedDatabaseOid, manifestPayload.database.oid) &&
    exactMatch(
      command.databaseIdentityDigest,
      manifestPayload.database.identityDigest,
    ) &&
    exactMatch(command.expectedDatabaseName, grants.database.name) &&
    exactMatch(command.expectedDatabaseOid, grants.database.oid) &&
    exactMatch(command.databaseIdentityDigest, grants.database.identityDigest) &&
    exactMatch(command.deploymentMarkerId, manifestPayload.deploymentMarkerId) &&
    exactMatch(
      command.deploymentMarkerDigest,
      manifestPayload.deploymentMarkerDigest,
    ) &&
    exactMatch(command.actualContextDigest, manifestPayload.actualContextDigest) &&
    exactMatch(
      command.dutyManifestContract,
      IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CONTRACT,
    ) &&
    exactMatch(command.dutyManifestContract, manifestPayload.contract) &&
    exactMatch(
      command.dutyManifestProfile,
      IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PROFILE,
    ) &&
    exactMatch(command.dutyManifestProfile, manifestPayload.profile) &&
    exactMatch(command.dutyManifestId, manifestPayload.manifestId) &&
    exactMatch(command.dutyManifestRevision, manifestPayload.manifestRevision) &&
    exactMatch(command.dutyManifestPayloadDigest, manifestEvidence.payloadDigest) &&
    exactMatch(command.dutyManifestSigningKeyId, manifestEvidence.signingKeyId) &&
    exactMatch(
      command.dutyManifestPublicKeyFingerprint,
      manifestEvidence.publicKeyFingerprint,
    ) &&
    exactMatch(
      command.dutyCoordinatorRoleName,
      manifestPayload.roles.coordinator.name,
    ) &&
    exactMatch(
      command.dutyCoordinatorRoleOid,
      manifestPayload.roles.coordinator.oid,
    ) &&
    exactMatch(
      command.dutyCoordinatorRoleName,
      grants.roles.coordinator.name,
    ) &&
    exactMatch(command.dutyCoordinatorRoleOid, grants.roles.coordinator.oid) &&
    exactMatch(command.dutyWorkerRoleName, manifestPayload.roles.worker.name) &&
    exactMatch(command.dutyWorkerRoleOid, manifestPayload.roles.worker.oid) &&
    exactMatch(command.dutyWorkerRoleName, grants.roles.worker.name) &&
    exactMatch(command.dutyWorkerRoleOid, grants.roles.worker.oid) &&
    exactMatch(
      command.dutyExactGrantsProfile,
      IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
    ) &&
    exactMatch(command.dutyExactGrantsProfile, manifestPayload.exactGrants.profile) &&
    exactMatch(command.dutyExactGrantsProfile, grants.profile) &&
    exactMatch(command.dutyExactGrantsDigest, manifestPayload.exactGrants.digest) &&
    exactMatch(
      command.dutyPredecessorManifestDigest,
      manifestPayload.chain.predecessor.manifestDigest,
    ) &&
    exactMatch(
      command.dutyApplicationContract,
      IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_CONTRACT,
    ) &&
    exactMatch(
      command.dutyApplicationContract,
      manifestPayload.chain.head.contract,
    ) &&
    exactMatch(command.dutyApplicationReleaseSha, manifestPayload.chain.head.releaseSha) &&
    exactMatch(command.releaseSha, manifestPayload.chain.head.releaseSha) &&
    exactMatch(
      command.dutyApplicationArtifactSha256,
      manifestPayload.chain.head.artifactSha256,
    )
  );
}

export function composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
  commandAuthority,
  dutyManifest,
  grantsSnapshot,
) {
  if (arguments.length !== 3) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_ARGUMENTS_INVALID");
  }

  // Brand checks deliberately precede any grants-snapshot normalization. A
  // synthetic/plain/cloned/cross-module authority cannot make hostile catalog
  // getters or proxies observable through this composition boundary.
  if (!isVerifiedIdentityMailTenantEnrollmentCommandAuthorityV2(commandAuthority)) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_COMMAND_NOT_PINNED");
  }
  if (!isVerifiedIdentityMailDutyRoleManifestV2(dutyManifest)) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_MANIFEST_NOT_PINNED");
  }

  const command =
    identityMailTenantEnrollmentCommandV2DatabaseArguments(commandAuthority);
  const commandPayload =
    identityMailTenantEnrollmentAuthorityV2Payload(commandAuthority);
  const commandEvidence =
    identityMailTenantEnrollmentAuthorityV2Evidence(commandAuthority);
  const manifestPayload = identityMailDutyRoleManifestV2Payload(dutyManifest);
  const manifestEvidence = identityMailDutyRoleManifestV2Evidence(dutyManifest);

  // Exactly one normalization pass over caller-controlled grants input. The
  // digest is derived from this frozen projection and never rereads raw input.
  const grants = identityMailDutyRoleGrantsCurrent185Projection(grantsSnapshot);
  const exactGrantsDigest = grantsProjectionDigest(grants);

  if (
    command.publicKeyFingerprint === manifestEvidence.publicKeyFingerprint
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_SIGNER_REUSE");
  }
  if (
    command.dutyExactGrantsDigest !== exactGrantsDigest ||
    !allBindingsMatch(command, manifestPayload, manifestEvidence, grants)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_BINDING_MISMATCH");
  }

  const binding = Object.freeze({
    schemaVersion: 1,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_CONTRACT,
    profile: IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_PROFILE,
    authorization: false,
    canMutate: false,
    canSend: false,
    commandId: command.id,
    tenantId: command.tenantId,
    requestId: command.requestId,
    action: command.action,
    intent: command.intent,
    authorizationEnvelopeDigest: command.authorizationEnvelopeDigest,
    manifestId: manifestPayload.manifestId,
    manifestRevision: manifestPayload.manifestRevision,
    manifestPayloadDigest: manifestEvidence.payloadDigest,
    databaseName: command.expectedDatabaseName,
    databaseOid: command.expectedDatabaseOid,
    databaseIdentityDigest: command.databaseIdentityDigest,
    deploymentMarkerId: command.deploymentMarkerId,
    deploymentMarkerDigest: command.deploymentMarkerDigest,
    actualContextDigest: command.actualContextDigest,
    coordinatorRoleName: command.dutyCoordinatorRoleName,
    coordinatorRoleOid: command.dutyCoordinatorRoleOid,
    workerRoleName: command.dutyWorkerRoleName,
    workerRoleOid: command.dutyWorkerRoleOid,
    exactGrantsProfile: command.dutyExactGrantsProfile,
    exactGrantsDigest,
    predecessorManifestDigest: command.dutyPredecessorManifestDigest,
    applicationContract: command.dutyApplicationContract,
    applicationReleaseSha: command.dutyApplicationReleaseSha,
    applicationArtifactSha256: command.dutyApplicationArtifactSha256,
    commandSigningKeyId: command.signingKeyId,
    commandPublicKeyFingerprint: command.publicKeyFingerprint,
    manifestSigningKeyId: manifestEvidence.signingKeyId,
    manifestPublicKeyFingerprint: manifestEvidence.publicKeyFingerprint,
  });
  const bindingDigest = compositionDigest(binding);
  const composed = Object.freeze({ ...binding, bindingDigest });
  const evidence = Object.freeze({
    schemaVersion: 1,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_CONTRACT,
    bindingDigest,
    command: commandEvidence,
    commandDatabaseArguments: command,
    commandPayload,
    dutyManifest: manifestEvidence,
    dutyManifestPayload: manifestPayload,
    exactGrants: Object.freeze({
      profile: IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
      digest: exactGrantsDigest,
      digestDomain: IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DIGEST_DOMAIN,
      projection: grants,
    }),
    authorization: false,
    canMutate: false,
    canSend: false,
  });

  COMPOSED_PINNED_BINDINGS.add(composed);
  COMPOSED_PINNED_EVIDENCE.set(composed, evidence);
  return composed;
}

export function isComposedPinnedIdentityMailTenantEnrollmentManifestBoundV2(
  value,
) {
  return (
    value !== null &&
    typeof value === "object" &&
    COMPOSED_PINNED_BINDINGS.has(value)
  );
}

export function identityMailTenantEnrollmentManifestBoundV2Evidence(value) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_ARGUMENTS_INVALID");
  }
  if (!isComposedPinnedIdentityMailTenantEnrollmentManifestBoundV2(value)) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_NOT_COMPOSED");
  }
  return COMPOSED_PINNED_EVIDENCE.get(value);
}
