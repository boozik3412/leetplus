import { identityMailTenantEnrollmentCommandDatabaseArguments } from "./identity-mail-tenant-enrollment-authority.mjs";

export const IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_CONTRACT =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_V1";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OPERATION =
  "ACCEPT_VERIFIED_IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_CURRENT185";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OWNER_OWNED_RPC_METHOD =
  "acceptVerifiedIdentityMailTenantEnrollmentCommand";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_MAX_ATTEMPTS = 2;
export const IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_RECEIPT_OPERATION =
  "ACCEPT_IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_RECEIPT_DECISION =
  "ACCEPTED";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_CANDIDATE_STATUS =
  "NOT_DEPLOYABLE";

const LOST_RESPONSE_ERRORS = new WeakSet();
const OWNER_OWNED_RPC_CAPABILITIES = new WeakSet();
const VERIFIED_RECEIPTS = new WeakSet();
const RECEIPT_KEYS = Object.freeze(
  [
    "authorization",
    "authorizationEnvelopeDigest",
    "canMutate",
    "candidateStatus",
    "commandId",
    "decision",
    "operation",
    "replayed",
    "requestId",
    "tenantId",
  ].sort(),
);

export class IdentityMailTenantEnrollmentCoordinatorCurrent185Error extends Error {
  constructor(code) {
    super(
      "Identity-mail tenant-enrollment CURRENT185 coordinator rejected the request.",
    );
    this.name = "IdentityMailTenantEnrollmentCoordinatorCurrent185Error";
    this.code = code;
  }
}

export class IdentityMailTenantEnrollmentOwnerOwnedRpcLostResponseError extends Error {
  constructor(cause) {
    super(
      "The owner-owned identity-mail tenant-enrollment RPC may have committed, but its response was lost.",
      cause === undefined ? undefined : { cause },
    );
    this.name = "IdentityMailTenantEnrollmentOwnerOwnedRpcLostResponseError";
    this.code =
      "IDENTITY_MAIL_TENANT_ENROLLMENT_OWNER_OWNED_RPC_RESPONSE_LOST";
    LOST_RESPONSE_ERRORS.add(this);
  }
}

export class IdentityMailTenantEnrollmentCoordinatorCurrent185AmbiguousOutcomeError extends Error {
  constructor(operationIdentity, cause, firstLostResponse) {
    super(
      "The owner-owned identity-mail tenant-enrollment RPC outcome remains ambiguous after an exact-identity retry.",
      cause === undefined ? undefined : { cause },
    );
    this.name =
      "IdentityMailTenantEnrollmentCoordinatorCurrent185AmbiguousOutcomeError";
    this.code =
      "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OUTCOME_AMBIGUOUS";
    this.attempts =
      IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_MAX_ATTEMPTS;
    this.operationIdentity = operationIdentity;
    Object.defineProperty(this, "firstLostResponse", {
      configurable: false,
      enumerable: false,
      value: firstLostResponse,
      writable: false,
    });
  }
}

function fail(code) {
  throw new IdentityMailTenantEnrollmentCoordinatorCurrent185Error(code);
}

export function createIdentityMailTenantEnrollmentOwnerOwnedRpcCurrent185(
  handler,
) {
  if (arguments.length !== 1 || typeof handler !== "function") {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_GATEWAY_INVALID",
    );
  }
  const capability = Object.freeze({
    [IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OWNER_OWNED_RPC_METHOD]:
      handler,
  });
  OWNER_OWNED_RPC_CAPABILITIES.add(capability);
  return capability;
}

function ownerOwnedRpcMethod(ownerOwnedRpc) {
  if (ownerOwnedRpc === null || typeof ownerOwnedRpc !== "object") {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_GATEWAY_INVALID",
    );
  }
  if (!OWNER_OWNED_RPC_CAPABILITIES.has(ownerOwnedRpc)) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_GATEWAY_INVALID",
    );
  }
  try {
    const keys = Reflect.ownKeys(ownerOwnedRpc);
    const descriptor = Object.getOwnPropertyDescriptor(
      ownerOwnedRpc,
      IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OWNER_OWNED_RPC_METHOD,
    );
    if (
      keys.length !== 1 ||
      keys[0] !==
        IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OWNER_OWNED_RPC_METHOD ||
      descriptor === undefined ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "function"
    ) {
      fail(
        "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_GATEWAY_INVALID",
      );
    }
    return descriptor.value;
  } catch (error) {
    if (error instanceof IdentityMailTenantEnrollmentCoordinatorCurrent185Error) {
      throw error;
    }
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_GATEWAY_INVALID",
    );
  }
}

function isLostResponse(error) {
  return (
    error !== null &&
    typeof error === "object" &&
    LOST_RESPONSE_ERRORS.has(error)
  );
}

function exactReceiptSnapshot(value) {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.some((key) => typeof key !== "string")) {
      return null;
    }
    const keys = ownKeys.sort();
    if (
      keys.length !== RECEIPT_KEYS.length ||
      keys.some((key, index) => key !== RECEIPT_KEYS[index])
    ) {
      return null;
    }
    const snapshot = {};
    for (const key of RECEIPT_KEYS) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function verifiedReceipt(gatewayReceipt, identity) {
  const snapshot = exactReceiptSnapshot(gatewayReceipt);
  if (
    snapshot === null ||
    snapshot.operation !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_RECEIPT_OPERATION ||
    snapshot.decision !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_RECEIPT_DECISION ||
    snapshot.candidateStatus !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_CANDIDATE_STATUS ||
    snapshot.commandId !== identity.commandId ||
    snapshot.requestId !== identity.requestId ||
    snapshot.tenantId !== identity.tenantId ||
    snapshot.authorizationEnvelopeDigest !==
      identity.authorizationEnvelopeDigest ||
    typeof snapshot.replayed !== "boolean" ||
    snapshot.authorization !== true ||
    snapshot.canMutate !== true
  ) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_GATEWAY_RECEIPT_INVALID",
    );
  }
  const projection = Object.freeze({ ...snapshot });
  VERIFIED_RECEIPTS.add(projection);
  return projection;
}

export function isVerifiedIdentityMailTenantEnrollmentCoordinatorCurrent185Receipt(
  value,
) {
  return (
    value !== null && typeof value === "object" && VERIFIED_RECEIPTS.has(value)
  );
}

function operationIdentity(databaseArguments) {
  return Object.freeze({
    authorizationEnvelopeDigest: databaseArguments.authorizationEnvelopeDigest,
    commandId: databaseArguments.id,
    operation: IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_OPERATION,
    operationId: databaseArguments.id,
    requestId: databaseArguments.requestId,
    tenantId: databaseArguments.tenantId,
  });
}

/**
 * Sealed application-side bridge from the pinned authority verifier to an
 * injected owner-owned database RPC. The RPC must expose only the CURRENT185
 * acceptance operation; this module intentionally contains no database
 * credentials, grants, role selection, Nest wiring, CLI, or production root.
 */
export async function importPinnedIdentityMailTenantEnrollmentCommandCurrent185(
  verifiedAuthority,
  ownerOwnedRpc,
) {
  if (arguments.length !== 2) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_ARGUMENTS_INVALID",
    );
  }

  // This extractor is the security boundary. It accepts only the WeakSet-
  // branded result produced by the pinned verifier from this exact module
  // instance; plain, cloned, forged, and synthetic objects fail closed.
  const databaseArguments =
    identityMailTenantEnrollmentCommandDatabaseArguments(verifiedAuthority);
  const rpcMethod = ownerOwnedRpcMethod(ownerOwnedRpc);
  const identity = operationIdentity(databaseArguments);
  const gatewayRequest = Object.freeze({
    ...identity,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_CONTRACT,
    databaseArguments,
  });

  let firstLostResponse;
  for (
    let attempt = 1;
    attempt <=
    IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const gatewayReceipt = await Reflect.apply(rpcMethod, ownerOwnedRpc, [
        gatewayRequest,
      ]);
      return verifiedReceipt(gatewayReceipt, identity);
    } catch (error) {
      if (firstLostResponse === undefined && isLostResponse(error)) {
        firstLostResponse = error;
        continue;
      }
      if (firstLostResponse !== undefined) {
        throw new IdentityMailTenantEnrollmentCoordinatorCurrent185AmbiguousOutcomeError(
          identity,
          error,
          firstLostResponse,
        );
      }
      throw error;
    }
  }

  throw new IdentityMailTenantEnrollmentCoordinatorCurrent185AmbiguousOutcomeError(
    identity,
    firstLostResponse,
    firstLostResponse,
  );
}
