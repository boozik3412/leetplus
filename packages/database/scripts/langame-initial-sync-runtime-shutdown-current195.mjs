import { types as utilTypes } from "node:util";

import { isLangameInitialSyncRuntimeBootstrapCurrent194 } from "./langame-initial-sync-runtime-bootstrap-current194.mjs";
import {
  LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_CONTRACT,
  isLangameRuntimeRevokeIntentPrismaCurrent195,
} from "./langame-runtime-revoke-intent-prisma-current195.mjs";
import { isVerifiedLangameRuntimeRevokeIntentCurrent195 } from "./langame-runtime-revoke-intent-current195.mjs";

export const LANGAME_INITIAL_SYNC_RUNTIME_SHUTDOWN_CURRENT195_CONTRACT =
  "LANGAME_INITIAL_SYNC_RUNTIME_SHUTDOWN_CURRENT195_V1";
export const LANGAME_INITIAL_SYNC_RUNTIME_SHUTDOWN_CURRENT195_CONFIRMATION =
  "shutdown-langame-current195-with-persisted-intent-on-loopback-ci";

const PERSISTED_KEYS = Object.freeze(
  [
    "attestationId",
    "authorization",
    "contract",
    "databaseName",
    "databaseOid",
    "intentId",
    "intentPayloadDigest",
    "ownerRoleName",
    "ownerRoleOid",
    "persistedStatus",
    "replayed",
    "validUntil",
  ].sort(),
);
const APPLIED_KEYS = Object.freeze(
  [
    "appliedAt",
    "attestationId",
    "authorization",
    "contract",
    "expiredAt",
    "intentId",
    "replayed",
    "status",
  ].sort(),
);
const SNAPSHOT_KEYS = Object.freeze(
  [
    "attestationId",
    "authorization",
    "consumeReplayed",
    "consumedAt",
    "contract",
    "inFlight",
    "productionExecutionAllowed",
    "revokeReplayed",
    "revokedAt",
    "state",
  ].sort(),
);

export class LangameInitialSyncRuntimeShutdownCurrent195Error extends Error {
  constructor(code) {
    super("CURRENT195 Langame runtime shutdown rejected the operation.");
    this.name = "LangameInitialSyncRuntimeShutdownCurrent195Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameInitialSyncRuntimeShutdownCurrent195Error(code);
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

async function exactRetry(effect, code) {
  try {
    return await effect();
  } catch {
    try {
      return await effect();
    } catch {
      fail(code);
    }
  }
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function assertSnapshot(value, intent, state) {
  const snapshot = exactRecord(
    value,
    SNAPSHOT_KEYS,
    "CURRENT195_SHUTDOWN_SESSION_SNAPSHOT_INVALID",
  );
  if (
    snapshot.attestationId !== intent.attestationId ||
    snapshot.authorization !== false ||
    snapshot.productionExecutionAllowed !== false ||
    snapshot.state !== state ||
    !Number.isInteger(snapshot.inFlight) ||
    snapshot.inFlight < 0 ||
    (state === "CLOSED" && snapshot.inFlight !== 0)
  ) {
    fail("CURRENT195_SHUTDOWN_SESSION_SNAPSHOT_INVALID");
  }
  if (
    state === "ACTIVE" &&
    (snapshot.revokedAt !== null || snapshot.revokeReplayed !== null)
  ) {
    fail("CURRENT195_SHUTDOWN_SESSION_SNAPSHOT_INVALID");
  }
  if (
    state === "CLOSED" &&
    (snapshot.revokedAt !== null || snapshot.revokeReplayed !== null)
  ) {
    fail("CURRENT195_SHUTDOWN_RAW_REVOKE_DETECTED");
  }
  return snapshot;
}

function assertPersisted(value, intent) {
  const receipt = exactRecord(
    value,
    PERSISTED_KEYS,
    "CURRENT195_SHUTDOWN_PERSIST_RECEIPT_INVALID",
  );
  if (
    receipt.contract !==
      LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_CONTRACT ||
    receipt.authorization !== false ||
    receipt.intentId !== intent.intentId ||
    receipt.intentPayloadDigest !== intent.intentPayloadDigest ||
    receipt.attestationId !== intent.attestationId ||
    receipt.databaseName !== intent.databaseName ||
    receipt.databaseOid !== intent.databaseOid ||
    receipt.ownerRoleName !== intent.ownerRoleName ||
    receipt.ownerRoleOid !== intent.ownerRoleOid ||
    !["PENDING", "APPLIED"].includes(receipt.persistedStatus) ||
    typeof receipt.replayed !== "boolean" ||
    receipt.validUntil !== intent.validUntil
  ) {
    fail("CURRENT195_SHUTDOWN_PERSIST_RECEIPT_INVALID");
  }
  return value;
}

function assertApplied(value, intent) {
  const receipt = exactRecord(
    value,
    APPLIED_KEYS,
    "CURRENT195_SHUTDOWN_APPLY_RECEIPT_INVALID",
  );
  if (
    receipt.contract !==
      LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_CONTRACT ||
    receipt.authorization !== false ||
    receipt.intentId !== intent.intentId ||
    receipt.attestationId !== intent.attestationId ||
    receipt.status !== "APPLIED" ||
    typeof receipt.replayed !== "boolean" ||
    !isCanonicalIsoTimestamp(receipt.appliedAt) ||
    receipt.expiredAt !== null
  ) {
    fail("CURRENT195_SHUTDOWN_APPLY_RECEIPT_INVALID");
  }
  return receipt;
}

export async function shutdownLangameInitialSyncRuntimeCurrent195() {
  fail("CURRENT195_SHUTDOWN_PRODUCTION_DENIED");
}

export async function recoverLangameInitialSyncRuntimeShutdownCurrent195() {
  fail("CURRENT195_SHUTDOWN_RECOVERY_PRODUCTION_DENIED");
}

export async function recoverSyntheticLangameInitialSyncRuntimeShutdownCurrent195(
  intent,
  intentLedger,
  explicitConfirmation,
) {
  if (
    arguments.length !== 3 ||
    explicitConfirmation !==
      LANGAME_INITIAL_SYNC_RUNTIME_SHUTDOWN_CURRENT195_CONFIRMATION ||
    !isVerifiedLangameRuntimeRevokeIntentCurrent195(intent) ||
    !isLangameRuntimeRevokeIntentPrismaCurrent195(intentLedger)
  ) {
    fail("CURRENT195_SHUTDOWN_RECOVERY_SYNTHETIC_DENIED");
  }
  let primaryError = null;
  try {
    const persisted = assertPersisted(
      await exactRetry(
        () => intentLedger.registerCurrent195(intent),
        "CURRENT195_SHUTDOWN_RECOVERY_PERSIST_RESPONSE_AMBIGUOUS",
      ),
      intent,
    );
    const applied = assertApplied(
      await exactRetry(
        () => intentLedger.applyCurrent195(persisted),
        "CURRENT195_SHUTDOWN_RECOVERY_APPLY_RESPONSE_AMBIGUOUS",
      ),
      intent,
    );
    return Object.freeze({
      appliedAt: applied.appliedAt,
      attestationId: applied.attestationId,
      authorization: false,
      contract: LANGAME_INITIAL_SYNC_RUNTIME_SHUTDOWN_CURRENT195_CONTRACT,
      intentId: applied.intentId,
      persistedBeforeRestart: true,
      productionExecutionAllowed: false,
      replayed: applied.replayed,
      status: applied.status,
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await intentLedger.close();
    } catch {
      if (!primaryError) fail("CURRENT195_SHUTDOWN_RECOVERY_CLEANUP_FAILED");
    }
  }
}

export async function shutdownSyntheticLangameInitialSyncRuntimeCurrent195(
  session,
  intent,
  intentLedger,
  explicitConfirmation,
) {
  if (
    arguments.length !== 4 ||
    explicitConfirmation !==
      LANGAME_INITIAL_SYNC_RUNTIME_SHUTDOWN_CURRENT195_CONFIRMATION ||
    !isLangameInitialSyncRuntimeBootstrapCurrent194(session) ||
    !isVerifiedLangameRuntimeRevokeIntentCurrent195(intent) ||
    !isLangameRuntimeRevokeIntentPrismaCurrent195(intentLedger)
  ) {
    fail("CURRENT195_SHUTDOWN_SYNTHETIC_DENIED");
  }
  let primaryError = null;
  try {
    assertSnapshot(session.snapshot(), intent, "ACTIVE");
    const persisted = assertPersisted(
      await exactRetry(
        () => intentLedger.registerCurrent195(intent),
        "CURRENT195_SHUTDOWN_PERSIST_RESPONSE_AMBIGUOUS",
      ),
      intent,
    );
    await session.drain();
    assertSnapshot(session.snapshot(), intent, "CLOSED");
    const applied = assertApplied(
      await exactRetry(
        () => intentLedger.applyCurrent195(persisted),
        "CURRENT195_SHUTDOWN_APPLY_RESPONSE_AMBIGUOUS",
      ),
      intent,
    );
    return Object.freeze({
      appliedAt: applied.appliedAt,
      attestationId: applied.attestationId,
      authorization: false,
      contract: LANGAME_INITIAL_SYNC_RUNTIME_SHUTDOWN_CURRENT195_CONTRACT,
      intentId: applied.intentId,
      persistedBeforeDrain: true,
      productionExecutionAllowed: false,
      replayed: applied.replayed,
      status: applied.status,
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await intentLedger.close();
    } catch {
      if (!primaryError) fail("CURRENT195_SHUTDOWN_CLEANUP_FAILED");
    }
  }
}
