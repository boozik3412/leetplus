import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  open,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import pg from "pg";

export const ACCESS_SCOPE_CLASSIFICATION_CONTRACT =
  "CURRENT_NETWORK_ACCESS_SCOPE_CLASSIFICATION_V1";
export const ACCESS_SCOPE_TARGET_CONTRACT =
  "CURRENT_NETWORK_ACCESS_SCOPE_RESTORED_COPY_TARGET_V1";
export const ACCESS_SCOPE_APPROVAL_CONTRACT =
  "CURRENT_NETWORK_ACCESS_SCOPE_DETACHED_APPROVAL_V1";
export const ACCESS_SCOPE_APPLY_ACTION =
  "CURRENT_NETWORK_ACCESS_SCOPE_CLASSIFICATION_V1_APPLY";
export const ACCESS_SCOPE_ROLLBACK_ACTION =
  "CURRENT_NETWORK_ACCESS_SCOPE_CLASSIFICATION_V1_ROLLBACK";

const LOOPBACK = "127.0.0.1";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const POSIX_PERMISSION_MASK = 0o7777;
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_DATABASE = /^leetplus_(?:scope|restored)_[a-z0-9_]{3,80}$/u;
const SAFE_ROLE = /^leetplus_[a-z0-9_]{3,80}$/u;
const TRUSTED_LOCK_FUNCTION =
  'public.leetplus_current_network_access_scope_lock_v1(text)';
const TRUSTED_LOCK_OWNER = "leetplus_scope_lock_owner";
const TRUSTED_LOCK_FUNCTION_SOURCE = `BEGIN
  PERFORM 1
  FROM public."Tenant" AS network_tenant
  WHERE network_tenant."id" = target_tenant_id
  FOR UPDATE;

  PERFORM 1
  FROM public."User" AS subject
  WHERE subject."tenantId" = target_tenant_id
  ORDER BY subject."id" COLLATE "C"
  FOR UPDATE;

  PERFORM 1
  FROM public."Store" AS store
  WHERE store."tenantId" = target_tenant_id
  ORDER BY store."id" COLLATE "C"
  FOR UPDATE;

  PERFORM 1
  FROM public."UserStoreAccess" AS access
  INNER JOIN public."User" AS subject ON subject."id" = access."userId"
  WHERE subject."tenantId" = target_tenant_id
  ORDER BY access."userId" COLLATE "C", access."storeId" COLLATE "C",
    access."id" COLLATE "C"
  FOR UPDATE OF access;
END`;
const TRUSTED_LOCK_FUNCTION_CALL_SQL =
  "SELECT public.leetplus_current_network_access_scope_lock_v1($1::text)";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const APPROVAL_PHRASES = Object.freeze({
  APPLY: "I_ACCEPT_EXACT_ACCESS_SCOPE_APPLY",
  ROLLBACK: "I_ACCEPT_EXACT_ACCESS_SCOPE_ROLLBACK",
});
const execFileAsync = promisify(execFile);

export class AccessScopeClassificationError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "AccessScopeClassificationError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new AccessScopeClassificationError(reasonCode);
}

function exactObject(value, keys, reasonCode) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactString(value, pattern, reasonCode) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !pattern.test(value)
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactBoolean(value, reasonCode) {
  if (typeof value !== "boolean") fail(reasonCode);
  return value;
}

function exactInteger(value, minimum, maximum, reasonCode) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(reasonCode);
  }
  return value;
}

function exactIso(value, reasonCode) {
  exactString(value, ISO_TIMESTAMP, reasonCode);
  if (new Date(value).toISOString() !== value) fail(reasonCode);
  return value;
}

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(domain, value) {
  return sha256(
    `${ACCESS_SCOPE_CLASSIFICATION_CONTRACT}\0${domain}\0${canonicalJson(value)}`,
  );
}

function equalDigest(left, right) {
  if (!SHA256.test(left ?? "") || !SHA256.test(right ?? "")) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function parseAccessScopeHmacKey(value) {
  if (Buffer.isBuffer(value)) {
    if (value.length < 32 || new Set(value).size < 8) {
      fail("ACCESS_SCOPE_HMAC_KEY_WEAK");
    }
    return Buffer.from(value);
  }
  if (typeof value !== "string" || value.length > 4096) {
    fail("ACCESS_SCOPE_HMAC_KEY_INVALID");
  }
  let bytes;
  if (/^hex:[0-9a-f]{64,256}$/u.test(value)) {
    bytes = Buffer.from(value.slice(4), "hex");
  } else if (/^base64:[A-Za-z0-9+/]{43,344}={0,2}$/u.test(value)) {
    bytes = Buffer.from(value.slice(7), "base64");
  } else {
    fail("ACCESS_SCOPE_HMAC_KEY_ENCODING_INVALID");
  }
  if (bytes.length < 32 || bytes.length > 256 || new Set(bytes).size < 8) {
    fail("ACCESS_SCOPE_HMAC_KEY_WEAK");
  }
  return bytes;
}

function hmacDigest(key, domain, ...parts) {
  const hmac = createHmac("sha256", key);
  hmac.update(`${ACCESS_SCOPE_CLASSIFICATION_CONTRACT}\0${domain}`);
  for (const part of parts) hmac.update(`\0${part}`);
  return hmac.digest("hex");
}

function normalizeDate(value, reasonCode) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) fail(reasonCode);
  return date.toISOString();
}

export function normalizeAccessScopeTarget(raw) {
  const target = exactObject(
    raw,
    [
      "contractVersion",
      "databaseName",
      "expectedSystemIdentifier",
      "host",
      "mode",
      "port",
      "roleName",
    ],
    "ACCESS_SCOPE_TARGET_INVALID",
  );
  if (
    target.contractVersion !== ACCESS_SCOPE_TARGET_CONTRACT ||
    target.mode !== "RESTORED_COPY" ||
    target.host !== LOOPBACK
  ) {
    fail("ACCESS_SCOPE_TARGET_NOT_RESTORED_COPY");
  }
  exactInteger(target.port, 1024, 65535, "ACCESS_SCOPE_TARGET_PORT_INVALID");
  if (target.port === 5432) fail("ACCESS_SCOPE_TARGET_PORT_NOT_ISOLATED");
  exactString(
    target.databaseName,
    SAFE_DATABASE,
    "ACCESS_SCOPE_TARGET_DATABASE_INVALID",
  );
  exactString(target.roleName, SAFE_ROLE, "ACCESS_SCOPE_TARGET_ROLE_INVALID");
  if (["postgres", "root"].includes(target.roleName)) {
    fail("ACCESS_SCOPE_TARGET_ROLE_PRIVILEGED");
  }
  if (!/^\d{10,24}$/u.test(target.expectedSystemIdentifier)) {
    fail("ACCESS_SCOPE_TARGET_SYSTEM_IDENTIFIER_INVALID");
  }
  return Object.freeze({ ...target });
}

export function assertAccessScopeRestoredCopyDatabaseUrl(databaseUrl, rawTarget) {
  const target = normalizeAccessScopeTarget(rawTarget);
  if (typeof databaseUrl !== "string" || databaseUrl.length > 8192) {
    fail("ACCESS_SCOPE_DATABASE_URL_INVALID");
  }
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail("ACCESS_SCOPE_DATABASE_URL_INVALID");
  }
  let username;
  let databaseName;
  let password;
  try {
    username = decodeURIComponent(parsed.username);
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
    password = decodeURIComponent(parsed.password);
  } catch {
    fail("ACCESS_SCOPE_DATABASE_URL_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname !== LOOPBACK ||
    Number(parsed.port) !== target.port ||
    databaseName !== target.databaseName ||
    username !== target.roleName ||
    password.length < 16 ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    fail("ACCESS_SCOPE_DATABASE_URL_TARGET_MISMATCH");
  }
  return Object.freeze({
    databaseName,
    host: LOOPBACK,
    port: target.port,
    roleName: username,
  });
}

function normalizeIdentity(raw, target, { requireExclusive = true } = {}) {
  const identity = exactObject(
    raw,
    [
      "canBypassRls",
      "canCreateDb",
      "canCreateRole",
      "canInherit",
      "canReplicate",
      "controlSystemCanExecute",
      "currentDatabase",
      "currentUser",
      "databaseCanConnect",
      "databaseCanCreate",
      "databaseCanTemporary",
      "isSuperuser",
      "lockFunctionAclMissingCount",
      "lockFunctionAclUnexpectedCount",
      "lockFunctionCanExecute",
      "lockFunctionConfigExact",
      "lockFunctionExists",
      "lockFunctionLanguage",
      "lockFunctionLeakproof",
      "lockFunctionOwner",
      "lockFunctionParallel",
      "lockFunctionReturnsVoid",
      "lockFunctionSecurityDefiner",
      "lockFunctionSource",
      "lockFunctionVolatile",
      "lockOwnerCanBypassRls",
      "lockOwnerCanCreateDb",
      "lockOwnerCanCreateRole",
      "lockOwnerCanInherit",
      "lockOwnerCanLogin",
      "lockOwnerCanReplicate",
      "lockOwnerIsSuperuser",
      "lockOwnerMembershipCount",
      "lockOwnerMissingColumnGrantCount",
      "lockOwnerMissingEffectiveColumnGrantCount",
      "lockOwnerMissingSchemaGrantCount",
      "lockOwnerRoleConfigEmpty",
      "lockOwnerRoleGrantedToMemberCount",
      "lockOwnerUnexpectedColumnGrantCount",
      "lockOwnerUnexpectedEffectiveColumnGrantCount",
      "lockOwnerUnexpectedOwnershipCount",
      "lockOwnerUnexpectedRoutineGrantCount",
      "lockOwnerUnexpectedSchemaGrantCount",
      "lockOwnerUnexpectedSequenceGrantCount",
      "lockOwnerUnexpectedTableGrantCount",
      "lockOwnerUnexpectedTypeGrantCount",
      "membershipCount",
      "missingEffectiveColumnPrivilegeCount",
      "missingEffectiveRelationPrivilegeCount",
      "missingEffectiveTypePrivilegeCount",
      "missingTableGrantCount",
      "missingUpdateColumnGrantCount",
      "otherSessionCount",
      "ownedExtraSchemaCount",
      "ownedExtraSchemaRelationCount",
      "ownedExtraSchemaRoutineCount",
      "ownedExtraSchemaTypeCount",
      "ownedPublicRelationCount",
      "ownedPublicRoutineCount",
      "ownedPublicTypeCount",
      "ownsDatabase",
      "ownsPublicSchema",
      "roleConfigEmpty",
      "roleGrantedToMemberCount",
      "schemaCanCreate",
      "schemaCanUse",
      "serverAddress",
      "serverPort",
      "sessionUser",
      "systemIdentifier",
      "typeCanUse",
      "unexpectedEffectiveColumnPrivilegeCount",
      "unexpectedEffectivePublicRoutineExecuteCount",
      "unexpectedEffectiveRelationPrivilegeCount",
      "unexpectedEffectiveSequencePrivilegeCount",
      "unexpectedEffectiveTypePrivilegeCount",
      "unexpectedExtraSchemaColumnPrivilegeCount",
      "unexpectedExtraSchemaPrivilegeCount",
      "unexpectedExtraSchemaRelationPrivilegeCount",
      "unexpectedExtraSchemaRoutinePrivilegeCount",
      "unexpectedExtraSchemaSequencePrivilegeCount",
      "unexpectedRoutineGrantCount",
      "unexpectedSequenceGrantCount",
      "unexpectedTableGrantCount",
      "unexpectedUpdateColumnGrantCount",
      "userSensitiveWriteGrantCount",
    ],
    "ACCESS_SCOPE_TARGET_IDENTITY_INVALID",
  );
  if (
    identity.currentDatabase !== target.databaseName ||
    identity.currentUser !== target.roleName ||
    identity.sessionUser !== target.roleName ||
    identity.serverAddress !== target.host ||
    Number(identity.serverPort) !== target.port ||
    String(identity.systemIdentifier) !== target.expectedSystemIdentifier
  ) {
    fail("ACCESS_SCOPE_TARGET_IDENTITY_MISMATCH");
  }
  for (const key of [
    "canBypassRls",
    "canCreateDb",
    "canCreateRole",
    "canReplicate",
    "isSuperuser",
  ]) {
    if (identity[key] !== false) fail("ACCESS_SCOPE_TARGET_ROLE_TOO_POWERFUL");
  }
  if (identity.canInherit !== false || identity.roleConfigEmpty !== true) {
    fail("ACCESS_SCOPE_TARGET_ROLE_CONFIGURATION_INVALID");
  }
  if (
    identity.lockFunctionExists !== true ||
    identity.lockFunctionOwner !== TRUSTED_LOCK_OWNER ||
    identity.lockFunctionLanguage !== "plpgsql" ||
    identity.lockFunctionSecurityDefiner !== true ||
    identity.lockFunctionVolatile !== "v" ||
    identity.lockFunctionParallel !== "u" ||
    identity.lockFunctionLeakproof !== false ||
    identity.lockFunctionReturnsVoid !== true ||
    identity.lockFunctionConfigExact !== true ||
    identity.lockFunctionCanExecute !== true ||
    String(identity.lockFunctionSource).replace(/\r\n?/gu, "\n").trim() !==
      TRUSTED_LOCK_FUNCTION_SOURCE
  ) {
    fail("ACCESS_SCOPE_TRUSTED_LOCK_FUNCTION_INVALID");
  }
  for (const key of [
    "lockOwnerCanBypassRls",
    "lockOwnerCanCreateDb",
    "lockOwnerCanCreateRole",
    "lockOwnerCanInherit",
    "lockOwnerCanLogin",
    "lockOwnerCanReplicate",
    "lockOwnerIsSuperuser",
  ]) {
    if (identity[key] !== false) {
      fail("ACCESS_SCOPE_TRUSTED_LOCK_OWNER_INVALID");
    }
  }
  if (identity.lockOwnerRoleConfigEmpty !== true) {
    fail("ACCESS_SCOPE_TRUSTED_LOCK_OWNER_INVALID");
  }
  for (const key of [
    "lockOwnerMembershipCount",
    "lockOwnerRoleGrantedToMemberCount",
  ]) {
    if (Number(identity[key]) !== 0) {
      fail("ACCESS_SCOPE_TRUSTED_LOCK_OWNER_INVALID");
    }
  }
  if (identity.ownsDatabase !== false || identity.ownsPublicSchema !== false) {
    fail("ACCESS_SCOPE_TARGET_ROLE_OWNERSHIP_INVALID");
  }
  for (const key of ["membershipCount", "roleGrantedToMemberCount"]) {
    if (Number(identity[key]) !== 0) {
      fail("ACCESS_SCOPE_TARGET_ROLE_MEMBERSHIP_INVALID");
    }
  }
  if (
    identity.databaseCanConnect !== true ||
    identity.databaseCanCreate !== false ||
    identity.databaseCanTemporary !== false ||
    identity.schemaCanUse !== true ||
    identity.schemaCanCreate !== false ||
    identity.typeCanUse !== true ||
    identity.controlSystemCanExecute !== true
  ) {
    fail("ACCESS_SCOPE_TARGET_EFFECTIVE_GRANTS_INVALID");
  }
  for (const key of [
    "missingTableGrantCount",
    "missingUpdateColumnGrantCount",
    "lockFunctionAclMissingCount",
    "lockFunctionAclUnexpectedCount",
    "lockOwnerMissingColumnGrantCount",
    "lockOwnerMissingEffectiveColumnGrantCount",
    "lockOwnerMissingSchemaGrantCount",
    "lockOwnerUnexpectedColumnGrantCount",
    "lockOwnerUnexpectedEffectiveColumnGrantCount",
    "lockOwnerUnexpectedOwnershipCount",
    "lockOwnerUnexpectedRoutineGrantCount",
    "lockOwnerUnexpectedSchemaGrantCount",
    "lockOwnerUnexpectedSequenceGrantCount",
    "lockOwnerUnexpectedTableGrantCount",
    "lockOwnerUnexpectedTypeGrantCount",
    "missingEffectiveColumnPrivilegeCount",
    "missingEffectiveRelationPrivilegeCount",
    "missingEffectiveTypePrivilegeCount",
    "ownedExtraSchemaCount",
    "ownedExtraSchemaRelationCount",
    "ownedExtraSchemaRoutineCount",
    "ownedExtraSchemaTypeCount",
    "ownedPublicRelationCount",
    "ownedPublicRoutineCount",
    "ownedPublicTypeCount",
    "unexpectedEffectiveColumnPrivilegeCount",
    "unexpectedEffectivePublicRoutineExecuteCount",
    "unexpectedEffectiveRelationPrivilegeCount",
    "unexpectedEffectiveSequencePrivilegeCount",
    "unexpectedEffectiveTypePrivilegeCount",
    "unexpectedExtraSchemaColumnPrivilegeCount",
    "unexpectedExtraSchemaPrivilegeCount",
    "unexpectedExtraSchemaRelationPrivilegeCount",
    "unexpectedExtraSchemaRoutinePrivilegeCount",
    "unexpectedExtraSchemaSequencePrivilegeCount",
    "unexpectedRoutineGrantCount",
    "unexpectedSequenceGrantCount",
    "unexpectedTableGrantCount",
    "unexpectedUpdateColumnGrantCount",
    "userSensitiveWriteGrantCount",
  ]) {
    if (Number(identity[key]) !== 0) {
      fail("ACCESS_SCOPE_TARGET_EXACT_GRANTS_MISMATCH");
    }
  }
  const sessions = Number(identity.otherSessionCount);
  if (!Number.isInteger(sessions) || sessions < 0) {
    fail("ACCESS_SCOPE_TARGET_SESSION_EVIDENCE_INVALID");
  }
  if (requireExclusive && sessions !== 0) {
    fail("ACCESS_SCOPE_TARGET_CONCURRENT_SESSION_PRESENT");
  }
  return Object.freeze({
    databaseName: identity.currentDatabase,
    lockFunctionOwner: identity.lockFunctionOwner,
    lockFunctionSourceSha256: sha256(
      String(identity.lockFunctionSource).replace(/\r\n?/gu, "\n").trim(),
    ),
    roleName: identity.currentUser,
    serverAddress: identity.serverAddress,
    serverPort: Number(identity.serverPort),
    systemIdentifier: String(identity.systemIdentifier),
  });
}

function normalizeRawSnapshot(raw, target, { requireExclusive = true } = {}) {
  const snapshot = exactObject(
    raw,
    ["accessRows", "identity", "stores", "tenantExists", "users"],
    "ACCESS_SCOPE_SNAPSHOT_INVALID",
  );
  const identity = normalizeIdentity(snapshot.identity, target, {
    requireExclusive,
  });
  if (snapshot.tenantExists !== true) fail("ACCESS_SCOPE_TENANT_NOT_FOUND");
  if (
    !Array.isArray(snapshot.users) ||
    !Array.isArray(snapshot.stores) ||
    !Array.isArray(snapshot.accessRows)
  ) {
    fail("ACCESS_SCOPE_SNAPSHOT_INVALID");
  }
  const users = snapshot.users.map((rawUser) => {
    const user = exactObject(
      rawUser,
      ["accessScope", "id", "isActive", "isPlatformAdmin", "role", "updatedAt"],
      "ACCESS_SCOPE_USER_ROW_INVALID",
    );
    if (
      typeof user.id !== "string" ||
      user.id.length < 1 ||
      user.id.length > 200 ||
      typeof user.role !== "string" ||
      user.role.length < 1 ||
      user.role.length > 80 ||
      ![null, "NETWORK", "STORES"].includes(user.accessScope)
    ) {
      fail("ACCESS_SCOPE_USER_ROW_INVALID");
    }
    exactBoolean(user.isActive, "ACCESS_SCOPE_USER_ROW_INVALID");
    exactBoolean(user.isPlatformAdmin, "ACCESS_SCOPE_USER_ROW_INVALID");
    return {
      accessScope: user.accessScope,
      id: user.id,
      isActive: user.isActive,
      isPlatformAdmin: user.isPlatformAdmin,
      role: user.role,
      updatedAt: normalizeDate(user.updatedAt, "ACCESS_SCOPE_USER_ROW_INVALID"),
    };
  });
  const userIds = new Set(users.map(({ id }) => id));
  if (userIds.size !== users.length) fail("ACCESS_SCOPE_USER_DUPLICATE");
  const stores = snapshot.stores.map((rawStore) => {
    const store = exactObject(
      rawStore,
      ["id", "isActive"],
      "ACCESS_SCOPE_STORE_ROW_INVALID",
    );
    if (typeof store.id !== "string" || store.id.length < 1 || store.id.length > 200) {
      fail("ACCESS_SCOPE_STORE_ROW_INVALID");
    }
    exactBoolean(store.isActive, "ACCESS_SCOPE_STORE_ROW_INVALID");
    return { id: store.id, isActive: store.isActive };
  });
  const storeIds = new Set(stores.map(({ id }) => id));
  if (storeIds.size !== stores.length) fail("ACCESS_SCOPE_STORE_DUPLICATE");
  const accessRows = snapshot.accessRows.map((rawAccess) => {
    const access = exactObject(
      rawAccess,
      ["createdAt", "id", "storeId", "userId"],
      "ACCESS_SCOPE_ACCESS_ROW_INVALID",
    );
    if (
      !UUID.test(access.id) ||
      !userIds.has(access.userId) ||
      !storeIds.has(access.storeId)
    ) {
      fail("ACCESS_SCOPE_ACCESS_ROW_INVALID");
    }
    return {
      createdAt: normalizeDate(
        access.createdAt,
        "ACCESS_SCOPE_ACCESS_ROW_INVALID",
      ),
      id: access.id,
      storeId: access.storeId,
      userId: access.userId,
    };
  });
  const accessIds = new Set(accessRows.map(({ id }) => id));
  const accessPairs = new Set(
    accessRows.map(({ storeId, userId }) => `${userId}\0${storeId}`),
  );
  if (accessIds.size !== accessRows.length || accessPairs.size !== accessRows.length) {
    fail("ACCESS_SCOPE_ACCESS_ROW_DUPLICATE");
  }
  return { accessRows, identity, stores, users };
}

function projectSnapshot(rawSnapshot, target, tenantId, rawKey, options = {}) {
  if (
    typeof tenantId !== "string" ||
    tenantId.length < 1 ||
    tenantId.length > 200 ||
    tenantId.trim() !== tenantId
  ) {
    fail("ACCESS_SCOPE_TENANT_ID_INVALID");
  }
  const key = parseAccessScopeHmacKey(rawKey);
  const snapshot = normalizeRawSnapshot(rawSnapshot, target, options);
  const tenantDigest = hmacDigest(key, "tenant", tenantId);
  const accessByUser = new Map();
  for (const access of snapshot.accessRows) {
    const rows = accessByUser.get(access.userId) ?? [];
    rows.push({
      createdAt: access.createdAt,
      id: access.id,
      storeId: access.storeId,
    });
    accessByUser.set(access.userId, rows);
  }
  const rawIdByDigest = new Map();
  const subjects = snapshot.users
    .filter(({ isActive }) => isActive)
    .map((user) => {
      const subjectDigest = hmacDigest(key, "subject", tenantId, user.id);
      if (rawIdByDigest.has(subjectDigest)) fail("ACCESS_SCOPE_SUBJECT_COLLISION");
      rawIdByDigest.set(subjectDigest, user.id);
      const accessRows = (accessByUser.get(user.id) ?? [])
        .map((row) => ({ ...row }))
        .sort((left, right) =>
          `${left.storeId}\0${left.id}`.localeCompare(
            `${right.storeId}\0${right.id}`,
          ),
        );
      return {
        accessRows,
        accessScope: user.accessScope,
        isPlatformAdmin: user.isPlatformAdmin,
        role: user.role,
        subjectDigest,
        updatedAt: user.updatedAt,
      };
    })
    .sort((left, right) => left.subjectDigest.localeCompare(right.subjectDigest));
  const stores = snapshot.stores
    .map(({ id, isActive }) => ({ id, isActive }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const activeStoreCount = stores.filter(({ isActive }) => isActive).length;
  const aggregates = {
    activePlatformAdminCount: subjects.filter(({ isPlatformAdmin }) =>
      isPlatformAdmin,
    ).length,
    activeStoreCount,
    activeUserCount: subjects.length,
    networkScopeCount: subjects.filter(({ accessScope }) =>
      accessScope === "NETWORK",
    ).length,
    storesScopeCount: subjects.filter(({ accessScope }) =>
      accessScope === "STORES",
    ).length,
    unresolvedPlatformAdminCount: subjects.filter(
      ({ accessScope, isPlatformAdmin }) =>
        accessScope === null && isPlatformAdmin,
    ).length,
    unresolvedScopeCount: subjects.filter(({ accessScope }) => accessScope === null)
      .length,
    userStoreAccessCount: subjects.reduce(
      (sum, subject) => sum + subject.accessRows.length,
      0,
    ),
  };
  const state = { stores, subjects, tenantDigest };
  const identityDigest = digest("target-identity", snapshot.identity);
  return Object.freeze({
    aggregates: Object.freeze(aggregates),
    aggregateDigest: digest("aggregate", aggregates),
    identityDigest,
    rawIdByDigest,
    state: Object.freeze(state),
    stateDigest: digest("state", state),
    tenantDigest,
  });
}

function publicSubject(subject) {
  return Object.freeze({
    accessRows: Object.freeze(
      subject.accessRows.map((row) => Object.freeze({ ...row })),
    ),
    accessScope: subject.accessScope,
    isPlatformAdmin: subject.isPlatformAdmin,
    role: subject.role,
    subjectDigest: subject.subjectDigest,
    updatedAt: subject.updatedAt,
  });
}

export async function createAccessScopeInventory({
  adapter,
  hmacKey,
  now = () => new Date(),
  target: rawTarget,
  tenantId,
}) {
  if (adapter === null || typeof adapter?.readSnapshot !== "function") {
    fail("ACCESS_SCOPE_ADAPTER_INVALID");
  }
  const target = normalizeAccessScopeTarget(rawTarget);
  const capturedAt = normalizeDate(now(), "ACCESS_SCOPE_CLOCK_INVALID");
  const projected = projectSnapshot(
    await adapter.readSnapshot({ tenantId }),
    target,
    tenantId,
    hmacKey,
  );
  const body = Object.freeze({
    aggregateDigest: projected.aggregateDigest,
    aggregates: projected.aggregates,
    capturedAt,
    contractVersion: ACCESS_SCOPE_CLASSIFICATION_CONTRACT,
    decision: "INVENTORY_CAPTURED",
    stateDigest: projected.stateDigest,
    stores: Object.freeze(
      projected.state.stores.map((store) => Object.freeze({ ...store })),
    ),
    subjects: Object.freeze(projected.state.subjects.map(publicSubject)),
    targetIdentityDigest: projected.identityDigest,
    tenantDigest: projected.tenantDigest,
  });
  return Object.freeze({
    ...body,
    inventoryDigest: digest("inventory", body),
  });
}

function validateInventory(raw) {
  const inventory = exactObject(
    raw,
    [
      "aggregateDigest",
      "aggregates",
      "capturedAt",
      "contractVersion",
      "decision",
      "inventoryDigest",
      "stateDigest",
      "stores",
      "subjects",
      "targetIdentityDigest",
      "tenantDigest",
    ],
    "ACCESS_SCOPE_INVENTORY_INVALID",
  );
  if (
    inventory.contractVersion !== ACCESS_SCOPE_CLASSIFICATION_CONTRACT ||
    inventory.decision !== "INVENTORY_CAPTURED"
  ) {
    fail("ACCESS_SCOPE_INVENTORY_INVALID");
  }
  for (const key of [
    "aggregateDigest",
    "inventoryDigest",
    "stateDigest",
    "targetIdentityDigest",
    "tenantDigest",
  ]) exactString(inventory[key], SHA256, "ACCESS_SCOPE_INVENTORY_INVALID");
  exactIso(inventory.capturedAt, "ACCESS_SCOPE_INVENTORY_INVALID");
  if (!Array.isArray(inventory.stores) || !Array.isArray(inventory.subjects)) {
    fail("ACCESS_SCOPE_INVENTORY_INVALID");
  }
  const stores = inventory.stores.map((rawStore) => {
    const store = exactObject(
      rawStore,
      ["id", "isActive"],
      "ACCESS_SCOPE_INVENTORY_STORE_INVALID",
    );
    if (
      typeof store.id !== "string" ||
      store.id.length < 1 ||
      store.id.length > 200 ||
      store.id.trim() !== store.id
    ) {
      fail("ACCESS_SCOPE_INVENTORY_STORE_INVALID");
    }
    exactBoolean(store.isActive, "ACCESS_SCOPE_INVENTORY_STORE_INVALID");
    return store;
  });
  const storeIds = stores.map(({ id }) => id);
  if (
    new Set(storeIds).size !== stores.length ||
    canonicalJson([...storeIds].sort()) !== canonicalJson(storeIds)
  ) {
    fail("ACCESS_SCOPE_INVENTORY_STORE_SET_INVALID");
  }
  const knownStores = new Set(storeIds);
  const accessIds = new Set();
  const subjects = inventory.subjects.map((rawSubject) => {
    const subject = exactObject(
      rawSubject,
      [
        "accessRows",
        "accessScope",
        "isPlatformAdmin",
        "role",
        "subjectDigest",
        "updatedAt",
      ],
      "ACCESS_SCOPE_INVENTORY_SUBJECT_INVALID",
    );
    exactString(
      subject.subjectDigest,
      SHA256,
      "ACCESS_SCOPE_INVENTORY_SUBJECT_INVALID",
    );
    exactBoolean(
      subject.isPlatformAdmin,
      "ACCESS_SCOPE_INVENTORY_SUBJECT_INVALID",
    );
    if (
      typeof subject.role !== "string" ||
      subject.role.length < 1 ||
      subject.role.length > 80 ||
      subject.role.trim() !== subject.role ||
      ![null, "NETWORK", "STORES"].includes(subject.accessScope) ||
      !Array.isArray(subject.accessRows)
    ) {
      fail("ACCESS_SCOPE_INVENTORY_SUBJECT_INVALID");
    }
    exactIso(subject.updatedAt, "ACCESS_SCOPE_INVENTORY_SUBJECT_INVALID");
    const accessRows = subject.accessRows.map((rawRow) => {
      const row = exactObject(
        rawRow,
        ["createdAt", "id", "storeId"],
        "ACCESS_SCOPE_INVENTORY_ACCESS_ROW_INVALID",
      );
      exactString(row.id, UUID, "ACCESS_SCOPE_INVENTORY_ACCESS_ROW_INVALID");
      if (
        typeof row.storeId !== "string" ||
        row.storeId.length < 1 ||
        row.storeId.length > 200 ||
        row.storeId.trim() !== row.storeId ||
        !knownStores.has(row.storeId) ||
        accessIds.has(row.id)
      ) {
        fail("ACCESS_SCOPE_INVENTORY_ACCESS_ROW_INVALID");
      }
      accessIds.add(row.id);
      exactIso(row.createdAt, "ACCESS_SCOPE_INVENTORY_ACCESS_ROW_INVALID");
      return row;
    });
    const accessStoreIds = accessRows.map(({ storeId }) => storeId);
    if (
      new Set(accessStoreIds).size !== accessRows.length ||
      canonicalJson(
        [...accessRows].sort((left, right) =>
          `${left.storeId}\0${left.id}`.localeCompare(
            `${right.storeId}\0${right.id}`,
          ),
        ),
      ) !== canonicalJson(accessRows) ||
      (subject.accessScope === "NETWORK" && accessRows.length !== 0) ||
      (subject.accessScope === "STORES" && accessRows.length === 0)
    ) {
      fail("ACCESS_SCOPE_INVENTORY_ACCESS_STATE_INVALID");
    }
    return subject;
  });
  const subjectDigests = subjects.map(({ subjectDigest }) => subjectDigest);
  if (
    new Set(subjectDigests).size !== subjects.length ||
    canonicalJson([...subjectDigests].sort()) !== canonicalJson(subjectDigests)
  ) {
    fail("ACCESS_SCOPE_INVENTORY_SUBJECT_SET_INVALID");
  }
  const expectedAggregates = {
    activePlatformAdminCount: subjects.filter(({ isPlatformAdmin }) =>
      isPlatformAdmin,
    ).length,
    activeStoreCount: stores.filter(({ isActive }) => isActive).length,
    activeUserCount: subjects.length,
    networkScopeCount: subjects.filter(({ accessScope }) =>
      accessScope === "NETWORK",
    ).length,
    storesScopeCount: subjects.filter(({ accessScope }) =>
      accessScope === "STORES",
    ).length,
    unresolvedPlatformAdminCount: subjects.filter(
      ({ accessScope, isPlatformAdmin }) =>
        accessScope === null && isPlatformAdmin,
    ).length,
    unresolvedScopeCount: subjects.filter(({ accessScope }) => accessScope === null)
      .length,
    userStoreAccessCount: subjects.reduce(
      (sum, subject) => sum + subject.accessRows.length,
      0,
    ),
  };
  exactObject(
    inventory.aggregates,
    Object.keys(expectedAggregates),
    "ACCESS_SCOPE_INVENTORY_AGGREGATES_INVALID",
  );
  if (
    Object.values(inventory.aggregates).some(
      (value) => !Number.isInteger(value) || value < 0,
    ) ||
    canonicalJson(inventory.aggregates) !== canonicalJson(expectedAggregates)
  ) {
    fail("ACCESS_SCOPE_INVENTORY_AGGREGATES_INVALID");
  }
  const body = { ...inventory };
  delete body.inventoryDigest;
  if (!equalDigest(inventory.inventoryDigest, digest("inventory", body))) {
    fail("ACCESS_SCOPE_INVENTORY_DIGEST_MISMATCH");
  }
  if (!equalDigest(inventory.aggregateDigest, digest("aggregate", inventory.aggregates))) {
    fail("ACCESS_SCOPE_INVENTORY_AGGREGATE_MISMATCH");
  }
  if (
    !equalDigest(
      inventory.stateDigest,
      digest("state", {
        stores: inventory.stores,
        subjects: inventory.subjects,
        tenantDigest: inventory.tenantDigest,
      }),
    )
  ) {
    fail("ACCESS_SCOPE_INVENTORY_STATE_MISMATCH");
  }
  return inventory;
}

function normalizeClassificationManifest(raw) {
  const manifest = exactObject(
    raw,
    [
      "classifications",
      "contractVersion",
      "inventoryDigest",
      "networkStoreIds",
      "platformAdminSubjectDigests",
      "tenantDigest",
    ],
    "ACCESS_SCOPE_CLASSIFICATION_MANIFEST_INVALID",
  );
  if (manifest.contractVersion !== ACCESS_SCOPE_CLASSIFICATION_CONTRACT) {
    fail("ACCESS_SCOPE_CLASSIFICATION_MANIFEST_INVALID");
  }
  for (const key of ["inventoryDigest", "tenantDigest"]) {
    exactString(
      manifest[key],
      SHA256,
      "ACCESS_SCOPE_CLASSIFICATION_MANIFEST_INVALID",
    );
  }
  if (
    !Array.isArray(manifest.classifications) ||
    !Array.isArray(manifest.networkStoreIds) ||
    !Array.isArray(manifest.platformAdminSubjectDigests)
  ) {
    fail("ACCESS_SCOPE_CLASSIFICATION_MANIFEST_INVALID");
  }
  const classifications = manifest.classifications.map((rawEntry) => {
    const entry = exactObject(
      rawEntry,
      ["accessScope", "storeIds", "subjectDigest"],
      "ACCESS_SCOPE_CLASSIFICATION_ENTRY_INVALID",
    );
    exactString(
      entry.subjectDigest,
      SHA256,
      "ACCESS_SCOPE_CLASSIFICATION_ENTRY_INVALID",
    );
    if (!["NETWORK", "STORES"].includes(entry.accessScope)) {
      fail("ACCESS_SCOPE_CLASSIFICATION_ENTRY_INVALID");
    }
    if (!Array.isArray(entry.storeIds)) {
      fail("ACCESS_SCOPE_CLASSIFICATION_ENTRY_INVALID");
    }
    const storeIds = entry.storeIds.map((storeId) => {
      if (
        typeof storeId !== "string" ||
        storeId.length < 1 ||
        storeId.length > 200 ||
        storeId.trim() !== storeId
      ) {
        fail("ACCESS_SCOPE_CLASSIFICATION_STORE_ID_INVALID");
      }
      return storeId;
    });
    if (new Set(storeIds).size !== storeIds.length) {
      fail("ACCESS_SCOPE_CLASSIFICATION_STORE_DUPLICATE");
    }
    storeIds.sort();
    if (
      (entry.accessScope === "NETWORK" && storeIds.length !== 0) ||
      (entry.accessScope === "STORES" && storeIds.length === 0)
    ) {
      fail("ACCESS_SCOPE_CLASSIFICATION_SCOPE_STORE_MISMATCH");
    }
    return { ...entry, storeIds };
  });
  classifications.sort((left, right) =>
    left.subjectDigest.localeCompare(right.subjectDigest),
  );
  if (
    new Set(classifications.map(({ subjectDigest }) => subjectDigest)).size !==
    classifications.length
  ) {
    fail("ACCESS_SCOPE_CLASSIFICATION_SUBJECT_DUPLICATE");
  }
  const networkStoreIds = manifest.networkStoreIds.map((storeId) => {
    if (
      typeof storeId !== "string" ||
      storeId.length < 1 ||
      storeId.length > 200 ||
      storeId.trim() !== storeId
    ) {
      fail("ACCESS_SCOPE_NETWORK_STORE_ID_INVALID");
    }
    return storeId;
  });
  networkStoreIds.sort();
  if (new Set(networkStoreIds).size !== networkStoreIds.length) {
    fail("ACCESS_SCOPE_NETWORK_STORE_DUPLICATE");
  }
  const platformAdminSubjectDigests = manifest.platformAdminSubjectDigests.map(
    (subjectDigest) =>
      exactString(
        subjectDigest,
        SHA256,
        "ACCESS_SCOPE_PLATFORM_CONFIRMATION_INVALID",
      ),
  );
  platformAdminSubjectDigests.sort();
  if (
    new Set(platformAdminSubjectDigests).size !==
    platformAdminSubjectDigests.length
  ) {
    fail("ACCESS_SCOPE_PLATFORM_CONFIRMATION_DUPLICATE");
  }
  return {
    ...manifest,
    classifications,
    networkStoreIds,
    platformAdminSubjectDigests,
  };
}

function stateDigestForSubjects(subjects) {
  return digest(
    "classified-subject-state",
    subjects.map((subject) => ({
      accessRows: subject.accessRows,
      accessScope: subject.accessScope,
      isPlatformAdmin: subject.isPlatformAdmin,
      role: subject.role,
      subjectDigest: subject.subjectDigest,
      updatedAt: subject.updatedAt,
    })),
  );
}

function aggregatesAfter(inventory, desiredStates) {
  const byDigest = new Map(
    desiredStates.map((subject) => [subject.subjectDigest, subject]),
  );
  const subjects = inventory.subjects.map((subject) =>
    byDigest.get(subject.subjectDigest) ?? subject,
  );
  const aggregates = {
    activePlatformAdminCount: inventory.aggregates.activePlatformAdminCount,
    activeStoreCount: inventory.aggregates.activeStoreCount,
    activeUserCount: inventory.aggregates.activeUserCount,
    networkScopeCount: subjects.filter(({ accessScope }) => accessScope === "NETWORK")
      .length,
    storesScopeCount: subjects.filter(({ accessScope }) => accessScope === "STORES")
      .length,
    unresolvedPlatformAdminCount: subjects.filter(
      ({ accessScope, isPlatformAdmin }) =>
        accessScope === null && isPlatformAdmin,
    ).length,
    unresolvedScopeCount: subjects.filter(({ accessScope }) => accessScope === null)
      .length,
    userStoreAccessCount: subjects.reduce(
      (sum, subject) => sum + subject.accessRows.length,
      0,
    ),
  };
  return { aggregateDigest: digest("aggregate", aggregates), aggregates };
}

export function buildAccessScopeClassificationPlan({
  classificationManifest: rawManifest,
  inventory: rawInventory,
  now = () => new Date(),
  randomId = () => randomUUID(),
}) {
  const inventory = validateInventory(rawInventory);
  const manifest = normalizeClassificationManifest(rawManifest);
  if (
    !equalDigest(manifest.inventoryDigest, inventory.inventoryDigest) ||
    !equalDigest(manifest.tenantDigest, inventory.tenantDigest)
  ) {
    fail("ACCESS_SCOPE_CLASSIFICATION_INVENTORY_BINDING_MISMATCH");
  }
  const unresolved = inventory.subjects.filter(
    ({ accessScope }) => accessScope === null,
  );
  if (unresolved.length === 0) fail("ACCESS_SCOPE_NO_UNRESOLVED_SUBJECTS");
  const unresolvedByDigest = new Map(
    unresolved.map((subject) => [subject.subjectDigest, subject]),
  );
  if (
    manifest.classifications.length !== unresolved.length ||
    manifest.classifications.some(
      ({ subjectDigest }) => !unresolvedByDigest.has(subjectDigest),
    )
  ) {
    fail("ACCESS_SCOPE_CLASSIFICATION_NOT_EXACT_UNRESOLVED_SET");
  }
  const activeStores = new Set(
    inventory.stores.filter(({ isActive }) => isActive).map(({ id }) => id),
  );
  const exactCurrentNetworkStoreIds = [...activeStores].sort();
  if (
    exactCurrentNetworkStoreIds.length !== 4 ||
    canonicalJson(exactCurrentNetworkStoreIds) !==
      canonicalJson(manifest.networkStoreIds)
  ) {
    fail("ACCESS_SCOPE_CURRENT_FOUR_CLUB_NETWORK_NOT_EXACT");
  }
  const platformSubjects = unresolved
    .filter(({ isPlatformAdmin }) => isPlatformAdmin)
    .map(({ subjectDigest }) => subjectDigest)
    .sort();
  if (
    canonicalJson(platformSubjects) !==
    canonicalJson(manifest.platformAdminSubjectDigests)
  ) {
    fail("ACCESS_SCOPE_PLATFORM_CONFIRMATION_NOT_EXACT");
  }
  const plannedAt = normalizeDate(now(), "ACCESS_SCOPE_CLOCK_INVALID");
  const capturedAtMillis = new Date(inventory.capturedAt).valueOf();
  const plannedAtMillis = new Date(plannedAt).valueOf();
  if (
    plannedAtMillis < capturedAtMillis ||
    plannedAtMillis > capturedAtMillis + 24 * 60 * 60 * 1000
  ) {
    fail("ACCESS_SCOPE_PLAN_TIME_WINDOW_INVALID");
  }
  const priorStates = [];
  const desiredStates = [];
  for (const classification of manifest.classifications) {
    const prior = unresolvedByDigest.get(classification.subjectDigest);
    for (const storeId of classification.storeIds) {
      if (!activeStores.has(storeId)) {
        fail("ACCESS_SCOPE_CLASSIFICATION_STORE_NOT_ACTIVE");
      }
    }
    const priorAccessByStore = new Map(
      prior.accessRows.map((row) => [row.storeId, row]),
    );
    const desiredAccessRows = classification.storeIds.map((storeId) => {
      const existing = priorAccessByStore.get(storeId);
      if (existing !== undefined) return { ...existing };
      const id = randomId();
      if (!UUID.test(id)) fail("ACCESS_SCOPE_RANDOM_ID_INVALID");
      return { createdAt: plannedAt, id, storeId };
    });
    desiredAccessRows.sort((left, right) =>
      `${left.storeId}\0${left.id}`.localeCompare(`${right.storeId}\0${right.id}`),
    );
    priorStates.push({
      accessRows: prior.accessRows.map((row) => ({ ...row })),
      accessScope: prior.accessScope,
      isPlatformAdmin: prior.isPlatformAdmin,
      role: prior.role,
      subjectDigest: prior.subjectDigest,
      updatedAt: prior.updatedAt,
    });
    desiredStates.push({
      accessRows: desiredAccessRows,
      accessScope: classification.accessScope,
      isPlatformAdmin: prior.isPlatformAdmin,
      role: prior.role,
      subjectDigest: prior.subjectDigest,
      updatedAt: plannedAt,
    });
  }
  priorStates.sort((left, right) =>
    left.subjectDigest.localeCompare(right.subjectDigest),
  );
  desiredStates.sort((left, right) =>
    left.subjectDigest.localeCompare(right.subjectDigest),
  );
  const after = aggregatesAfter(inventory, desiredStates);
  if (after.aggregates.unresolvedScopeCount !== 0) {
    fail("ACCESS_SCOPE_PLAN_LEAVES_ACTIVE_UNRESOLVED");
  }
  const platformConfirmation = {
    platformAdminSubjectDigests: platformSubjects,
    tenantDigest: inventory.tenantDigest,
  };
  const desiredByDigest = new Map(
    desiredStates.map((state) => [state.subjectDigest, state]),
  );
  const stateAfter = {
    stores: inventory.stores,
    subjects: inventory.subjects.map((subject) => {
      const desired = desiredByDigest.get(subject.subjectDigest);
      return desired === undefined
        ? subject
        : {
            ...subject,
            accessRows: desired.accessRows,
            accessScope: desired.accessScope,
            updatedAt: desired.updatedAt,
          };
    }),
    tenantDigest: inventory.tenantDigest,
  };
  const planBody = Object.freeze({
    aggregateAfter: Object.freeze(after.aggregates),
    aggregateAfterDigest: after.aggregateDigest,
    aggregateBefore: inventory.aggregates,
    aggregateBeforeDigest: inventory.aggregateDigest,
    contractVersion: ACCESS_SCOPE_CLASSIFICATION_CONTRACT,
    decision: "PLAN_READY",
    desiredStateDigest: stateDigestForSubjects(desiredStates),
    desiredStates: Object.freeze(
      desiredStates.map((state) => Object.freeze(state)),
    ),
    inventoryDigest: inventory.inventoryDigest,
    networkStoreIds: Object.freeze(exactCurrentNetworkStoreIds),
    plannedAt,
    platformConfirmationDigest: digest(
      "platform-confirmation",
      platformConfirmation,
    ),
    platformAdminSubjectDigests: Object.freeze(platformSubjects),
    priorStateDigest: stateDigestForSubjects(priorStates),
    priorStates: Object.freeze(priorStates.map((state) => Object.freeze(state))),
    stateAfterDigest: digest("state", stateAfter),
    stateBeforeDigest: inventory.stateDigest,
    targetIdentityDigest: inventory.targetIdentityDigest,
    tenantDigest: inventory.tenantDigest,
  });
  return Object.freeze({
    ...planBody,
    planDigest: digest("plan", planBody),
  });
}

function normalizePlanState(rawState, { desired }) {
  const state = exactObject(
    rawState,
    [
      "accessRows",
      "accessScope",
      "isPlatformAdmin",
      "role",
      "subjectDigest",
      "updatedAt",
    ],
    "ACCESS_SCOPE_PLAN_STATE_INVALID",
  );
  exactString(
    state.subjectDigest,
    SHA256,
    "ACCESS_SCOPE_PLAN_STATE_INVALID",
  );
  exactBoolean(state.isPlatformAdmin, "ACCESS_SCOPE_PLAN_STATE_INVALID");
  if (
    typeof state.role !== "string" ||
    state.role.length < 1 ||
    state.role.length > 80 ||
    state.role.trim() !== state.role ||
    (desired
      ? !["NETWORK", "STORES"].includes(state.accessScope)
      : state.accessScope !== null) ||
    !Array.isArray(state.accessRows)
  ) {
    fail("ACCESS_SCOPE_PLAN_STATE_INVALID");
  }
  exactIso(state.updatedAt, "ACCESS_SCOPE_PLAN_STATE_INVALID");
  const accessRows = state.accessRows.map((rawRow) => {
    const row = exactObject(
      rawRow,
      ["createdAt", "id", "storeId"],
      "ACCESS_SCOPE_PLAN_ACCESS_ROW_INVALID",
    );
    exactString(row.id, UUID, "ACCESS_SCOPE_PLAN_ACCESS_ROW_INVALID");
    if (
      typeof row.storeId !== "string" ||
      row.storeId.length < 1 ||
      row.storeId.length > 200 ||
      row.storeId.trim() !== row.storeId
    ) {
      fail("ACCESS_SCOPE_PLAN_ACCESS_ROW_INVALID");
    }
    exactIso(row.createdAt, "ACCESS_SCOPE_PLAN_ACCESS_ROW_INVALID");
    return { ...row };
  });
  const ids = new Set(accessRows.map(({ id }) => id));
  const stores = new Set(accessRows.map(({ storeId }) => storeId));
  if (
    ids.size !== accessRows.length ||
    stores.size !== accessRows.length ||
    canonicalJson(
      [...accessRows].sort((left, right) =>
        `${left.storeId}\0${left.id}`.localeCompare(`${right.storeId}\0${right.id}`),
      ),
    ) !== canonicalJson(accessRows) ||
    (desired && state.accessScope === "NETWORK" && accessRows.length !== 0) ||
    (desired && state.accessScope === "STORES" && accessRows.length === 0)
  ) {
    fail("ACCESS_SCOPE_PLAN_ACCESS_ROW_INVALID");
  }
  return { ...state, accessRows };
}

function validatePlan(raw) {
  const plan = exactObject(
    raw,
    [
      "aggregateAfter",
      "aggregateAfterDigest",
      "aggregateBefore",
      "aggregateBeforeDigest",
      "contractVersion",
      "decision",
      "desiredStateDigest",
      "desiredStates",
      "inventoryDigest",
      "networkStoreIds",
      "planDigest",
      "plannedAt",
      "platformAdminSubjectDigests",
      "platformConfirmationDigest",
      "priorStateDigest",
      "priorStates",
      "stateAfterDigest",
      "stateBeforeDigest",
      "targetIdentityDigest",
      "tenantDigest",
    ],
    "ACCESS_SCOPE_PLAN_INVALID",
  );
  if (
    plan.contractVersion !== ACCESS_SCOPE_CLASSIFICATION_CONTRACT ||
    plan.decision !== "PLAN_READY" ||
    !Array.isArray(plan.priorStates) ||
    !Array.isArray(plan.desiredStates) ||
    !Array.isArray(plan.networkStoreIds) ||
    !Array.isArray(plan.platformAdminSubjectDigests)
  ) {
    fail("ACCESS_SCOPE_PLAN_INVALID");
  }
  for (const key of [
    "aggregateAfterDigest",
    "aggregateBeforeDigest",
    "desiredStateDigest",
    "inventoryDigest",
    "planDigest",
    "platformConfirmationDigest",
    "priorStateDigest",
    "stateAfterDigest",
    "stateBeforeDigest",
    "targetIdentityDigest",
    "tenantDigest",
  ]) exactString(plan[key], SHA256, "ACCESS_SCOPE_PLAN_INVALID");
  exactIso(plan.plannedAt, "ACCESS_SCOPE_PLAN_INVALID");
  if (
    plan.networkStoreIds.length !== 4 ||
    plan.networkStoreIds.some(
      (storeId) =>
        typeof storeId !== "string" ||
        storeId.length < 1 ||
        storeId.length > 200 ||
        storeId.trim() !== storeId,
    ) ||
    new Set(plan.networkStoreIds).size !== plan.networkStoreIds.length ||
    canonicalJson([...plan.networkStoreIds].sort()) !==
      canonicalJson(plan.networkStoreIds)
  ) {
    fail("ACCESS_SCOPE_PLAN_NETWORK_STORES_INVALID");
  }
  const priorStates = plan.priorStates.map((state) =>
    normalizePlanState(state, { desired: false }),
  );
  const desiredStates = plan.desiredStates.map((state) =>
    normalizePlanState(state, { desired: true }),
  );
  const priorDigests = priorStates.map(({ subjectDigest }) => subjectDigest);
  const desiredDigests = desiredStates.map(({ subjectDigest }) => subjectDigest);
  if (
    priorStates.length === 0 ||
    new Set(priorDigests).size !== priorDigests.length ||
    new Set(desiredDigests).size !== desiredDigests.length ||
    canonicalJson([...priorDigests].sort()) !== canonicalJson(priorDigests) ||
    canonicalJson(priorDigests) !== canonicalJson(desiredDigests)
  ) {
    fail("ACCESS_SCOPE_PLAN_SUBJECT_SET_INVALID");
  }
  const priorByDigest = new Map(
    priorStates.map((state) => [state.subjectDigest, state]),
  );
  for (const desired of desiredStates) {
    const prior = priorByDigest.get(desired.subjectDigest);
    if (
      prior.role !== desired.role ||
      prior.isPlatformAdmin !== desired.isPlatformAdmin ||
      desired.accessRows.some(
        ({ storeId }) => !plan.networkStoreIds.includes(storeId),
      )
    ) {
      fail("ACCESS_SCOPE_PLAN_STATE_TRANSITION_INVALID");
    }
  }
  const platformSubjects = priorStates
    .filter(({ isPlatformAdmin }) => isPlatformAdmin)
    .map(({ subjectDigest }) => subjectDigest)
    .sort();
  if (
    plan.platformAdminSubjectDigests.some(
      (subjectDigest) => !SHA256.test(subjectDigest),
    ) ||
    new Set(plan.platformAdminSubjectDigests).size !==
      plan.platformAdminSubjectDigests.length ||
    canonicalJson(platformSubjects) !==
      canonicalJson(plan.platformAdminSubjectDigests)
  ) {
    fail("ACCESS_SCOPE_PLAN_PLATFORM_SUBJECT_SET_INVALID");
  }
  const body = { ...plan };
  delete body.planDigest;
  if (!equalDigest(plan.planDigest, digest("plan", body))) {
    fail("ACCESS_SCOPE_PLAN_DIGEST_MISMATCH");
  }
  if (
    !equalDigest(
      plan.priorStateDigest,
      stateDigestForSubjects(priorStates),
    ) ||
    !equalDigest(
      plan.desiredStateDigest,
      stateDigestForSubjects(desiredStates),
    ) ||
    !equalDigest(plan.aggregateBeforeDigest, digest("aggregate", plan.aggregateBefore)) ||
    !equalDigest(plan.aggregateAfterDigest, digest("aggregate", plan.aggregateAfter))
  ) {
    fail("ACCESS_SCOPE_PLAN_INTERNAL_DIGEST_MISMATCH");
  }
  const platformConfirmation = {
    platformAdminSubjectDigests: plan.platformAdminSubjectDigests,
    tenantDigest: plan.tenantDigest,
  };
  if (
    !equalDigest(
      plan.platformConfirmationDigest,
      digest("platform-confirmation", platformConfirmation),
    )
  ) {
    fail("ACCESS_SCOPE_PLAN_PLATFORM_DIGEST_MISMATCH");
  }
  return plan;
}

export function createAccessScopeDetachedApproval({
  confirmationPhrase,
  confirmedPlanDigest,
  confirmedPlatformDigest,
  direction,
  now = () => new Date(),
  plan: rawPlan,
}) {
  const plan = validatePlan(rawPlan);
  if (!["APPLY", "ROLLBACK"].includes(direction)) {
    fail("ACCESS_SCOPE_APPROVAL_DIRECTION_INVALID");
  }
  if (
    !equalDigest(confirmedPlanDigest, plan.planDigest) ||
    !equalDigest(confirmedPlatformDigest, plan.platformConfirmationDigest)
  ) {
    fail("ACCESS_SCOPE_APPROVAL_DIGEST_CONFIRMATION_MISMATCH");
  }
  if (confirmationPhrase !== APPROVAL_PHRASES[direction]) {
    fail("ACCESS_SCOPE_APPROVAL_PHRASE_MISMATCH");
  }
  const approvedAt = normalizeDate(now(), "ACCESS_SCOPE_CLOCK_INVALID");
  const approvedAtMillis = new Date(approvedAt).valueOf();
  const plannedAtMillis = new Date(plan.plannedAt).valueOf();
  if (
    approvedAtMillis < plannedAtMillis ||
    approvedAtMillis > plannedAtMillis + 24 * 60 * 60 * 1000
  ) {
    fail("ACCESS_SCOPE_APPROVAL_TIME_WINDOW_INVALID");
  }
  const approvalBody = Object.freeze({
    approvedAt,
    contractVersion: ACCESS_SCOPE_APPROVAL_CONTRACT,
    direction,
    planDigest: plan.planDigest,
    platformConfirmationDigest: plan.platformConfirmationDigest,
    selfApprovalRiskAccepted: true,
    tenantDigest: plan.tenantDigest,
  });
  return Object.freeze({
    ...approvalBody,
    approvalDigest: digest("detached-approval", approvalBody),
  });
}

function validateApproval(raw, plan, direction) {
  const approval = exactObject(
    raw,
    [
      "approvalDigest",
      "approvedAt",
      "contractVersion",
      "direction",
      "planDigest",
      "platformConfirmationDigest",
      "selfApprovalRiskAccepted",
      "tenantDigest",
    ],
    "ACCESS_SCOPE_APPROVAL_INVALID",
  );
  if (
    approval.contractVersion !== ACCESS_SCOPE_APPROVAL_CONTRACT ||
    approval.direction !== direction ||
    approval.selfApprovalRiskAccepted !== true ||
    !equalDigest(approval.planDigest, plan.planDigest) ||
    !equalDigest(
      approval.platformConfirmationDigest,
      plan.platformConfirmationDigest,
    ) ||
    !equalDigest(approval.tenantDigest, plan.tenantDigest)
  ) {
    fail("ACCESS_SCOPE_APPROVAL_BINDING_MISMATCH");
  }
  exactIso(approval.approvedAt, "ACCESS_SCOPE_APPROVAL_INVALID");
  const approvedAtMillis = new Date(approval.approvedAt).valueOf();
  const plannedAtMillis = new Date(plan.plannedAt).valueOf();
  if (
    approvedAtMillis < plannedAtMillis ||
    approvedAtMillis > plannedAtMillis + 24 * 60 * 60 * 1000
  ) {
    fail("ACCESS_SCOPE_APPROVAL_TIME_WINDOW_INVALID");
  }
  const body = { ...approval };
  delete body.approvalDigest;
  if (!equalDigest(approval.approvalDigest, digest("detached-approval", body))) {
    fail("ACCESS_SCOPE_APPROVAL_DIGEST_MISMATCH");
  }
  return approval;
}

function auditProjection(plan, direction) {
  const apply = direction === "APPLY";
  return Object.freeze({
    action: apply ? ACCESS_SCOPE_APPLY_ACTION : ACCESS_SCOPE_ROLLBACK_ACTION,
    after: Object.freeze({
      aggregateDigest: apply
        ? plan.aggregateAfterDigest
        : plan.aggregateBeforeDigest,
      stateDigest: apply ? plan.desiredStateDigest : plan.priorStateDigest,
    }),
    before: Object.freeze({
      aggregateDigest: apply
        ? plan.aggregateBeforeDigest
        : plan.aggregateAfterDigest,
      stateDigest: apply ? plan.priorStateDigest : plan.desiredStateDigest,
    }),
    metadata: Object.freeze({
      contractVersion: ACCESS_SCOPE_CLASSIFICATION_CONTRACT,
      direction,
      inventoryDigest: plan.inventoryDigest,
      planDigest: plan.planDigest,
      platformConfirmationDigest: plan.platformConfirmationDigest,
      targetIdentityDigest: plan.targetIdentityDigest,
      tenantDigest: plan.tenantDigest,
    }),
    reason: "controlled-beta-1 access scope classification",
    requestId:
      direction === "APPLY" ? plan.planDigest : `${plan.planDigest}:rollback`,
    targetId: null,
    targetType: "TenantAccessScope",
  });
}

function validateAudit(actual, expected) {
  if (actual === null) return false;
  const projection = {
    action: actual.action,
    after: actual.after,
    before: actual.before,
    metadata: actual.metadata,
    reason: actual.reason,
    requestId: actual.requestId,
    targetId: actual.targetId,
    targetType: actual.targetType,
  };
  if (canonicalJson(projection) !== canonicalJson(expected)) {
    fail("ACCESS_SCOPE_DURABLE_AUDIT_MISMATCH");
  }
  return true;
}

function targetState(plan, direction) {
  return direction === "APPLY" ? plan.desiredStates : plan.priorStates;
}

function sourceState(plan, direction) {
  return direction === "APPLY" ? plan.priorStates : plan.desiredStates;
}

function assertProjectedPlanBinding(projected, plan) {
  if (
    !equalDigest(projected.tenantDigest, plan.tenantDigest) ||
    !equalDigest(projected.identityDigest, plan.targetIdentityDigest)
  ) {
    fail("ACCESS_SCOPE_FRESH_TARGET_BINDING_MISMATCH");
  }
}

function selectPlanSubjects(projected, plan, states) {
  const projectedByDigest = new Map(
    projected.state.subjects.map((subject) => [subject.subjectDigest, subject]),
  );
  const selected = states.map(({ subjectDigest }) => {
    const subject = projectedByDigest.get(subjectDigest);
    if (subject === undefined) fail("ACCESS_SCOPE_FRESH_SUBJECT_SET_MISMATCH");
    return {
      accessRows: subject.accessRows,
      accessScope: subject.accessScope,
      isPlatformAdmin: subject.isPlatformAdmin,
      role: subject.role,
      subjectDigest,
      updatedAt: subject.updatedAt,
    };
  });
  selected.sort((left, right) =>
    left.subjectDigest.localeCompare(right.subjectDigest),
  );
  return selected;
}

function assertExactState(projected, plan, direction) {
  const expectedStates = targetState(plan, direction);
  const actualStates = selectPlanSubjects(projected, plan, expectedStates);
  const expectedStateDigest =
    direction === "APPLY" ? plan.desiredStateDigest : plan.priorStateDigest;
  if (!equalDigest(stateDigestForSubjects(actualStates), expectedStateDigest)) {
    fail("ACCESS_SCOPE_TARGET_STATE_MISMATCH");
  }
  const expectedAggregateDigest =
    direction === "APPLY" ? plan.aggregateAfterDigest : plan.aggregateBeforeDigest;
  if (!equalDigest(projected.aggregateDigest, expectedAggregateDigest)) {
    fail("ACCESS_SCOPE_TARGET_AGGREGATE_MISMATCH");
  }
  const expectedFullStateDigest =
    direction === "APPLY" ? plan.stateAfterDigest : plan.stateBeforeDigest;
  if (!equalDigest(projected.stateDigest, expectedFullStateDigest)) {
    fail("ACCESS_SCOPE_TARGET_FULL_STATE_MISMATCH");
  }
}

function buildMutations(projected, states) {
  return states.map((state) => {
    const userId = projected.rawIdByDigest.get(state.subjectDigest);
    if (userId === undefined) fail("ACCESS_SCOPE_FRESH_SUBJECT_SET_MISMATCH");
    return {
      accessRows: state.accessRows.map((row) => ({ ...row })),
      accessScope: state.accessScope,
      updatedAt: state.updatedAt,
      userId,
    };
  });
}

async function reconcileAfterAmbiguousResponse({
  adapter,
  hmacKey,
  plan,
  rawTarget,
  tenantId,
  direction,
}) {
  const expectedAudit = auditProjection(plan, direction);
  const audit = await adapter.readAudit({
    action: expectedAudit.action,
    requestId: expectedAudit.requestId,
    tenantId,
  });
  if (!validateAudit(audit, expectedAudit)) return null;
  const opposite = auditProjection(
    plan,
    direction === "APPLY" ? "ROLLBACK" : "APPLY",
  );
  const oppositeExists = validateAudit(
    await adapter.readAudit({
      action: opposite.action,
      requestId: opposite.requestId,
      tenantId,
    }),
    opposite,
  );
  if (
    (direction === "APPLY" && oppositeExists) ||
    (direction === "ROLLBACK" && !oppositeExists)
  ) {
    fail("ACCESS_SCOPE_DURABLE_AUDIT_SEQUENCE_INVALID");
  }
  const target = normalizeAccessScopeTarget(rawTarget);
  const projected = projectSnapshot(
    await adapter.readSnapshot({ tenantId }),
    target,
    tenantId,
    hmacKey,
  );
  assertProjectedPlanBinding(projected, plan);
  assertExactState(projected, plan, direction);
  return projected;
}

function buildExecutionReceipt({ approval, direction, disposition, plan, projected }) {
  const body = Object.freeze({
    aggregateDigest: projected.aggregateDigest,
    approvalDigest: approval.approvalDigest,
    contractVersion: ACCESS_SCOPE_CLASSIFICATION_CONTRACT,
    decision:
      direction === "APPLY"
        ? "CLASSIFICATION_APPLIED"
        : "CLASSIFICATION_ROLLED_BACK",
    direction,
    disposition,
    planDigest: plan.planDigest,
    stateDigest:
      direction === "APPLY" ? plan.desiredStateDigest : plan.priorStateDigest,
    targetIdentityDigest: projected.identityDigest,
    tenantDigest: plan.tenantDigest,
    zeroDiff: disposition === "RECONCILED",
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest("execution-receipt", body),
  });
}

export async function executeAccessScopeClassification({
  adapter,
  approval: rawApproval,
  direction,
  hmacKey,
  plan: rawPlan,
  target: rawTarget,
  tenantId,
}) {
  if (
    adapter === null ||
    typeof adapter?.withSerializableTransaction !== "function" ||
    typeof adapter?.readSnapshot !== "function" ||
    typeof adapter?.readAudit !== "function"
  ) {
    fail("ACCESS_SCOPE_ADAPTER_INVALID");
  }
  if (!["APPLY", "ROLLBACK"].includes(direction)) {
    fail("ACCESS_SCOPE_EXECUTION_DIRECTION_INVALID");
  }
  const target = normalizeAccessScopeTarget(rawTarget);
  const plan = validatePlan(rawPlan);
  const approval = validateApproval(rawApproval, plan, direction);
  const key = parseAccessScopeHmacKey(hmacKey);
  const expectedAudit = auditProjection(plan, direction);
  let disposition = "COMMITTED";
  let projected;
  try {
    projected = await adapter.withSerializableTransaction(
      { tenantId },
      async (transaction) => {
        const fresh = projectSnapshot(
          await transaction.readLockedSnapshot({ tenantId }),
          target,
          tenantId,
          key,
        );
        assertProjectedPlanBinding(fresh, plan);
        const existingAudit = await transaction.readAudit({
          action: expectedAudit.action,
          requestId: expectedAudit.requestId,
          tenantId,
        });
        const opposite = auditProjection(
          plan,
          direction === "APPLY" ? "ROLLBACK" : "APPLY",
        );
        const oppositeAudit = await transaction.readAudit({
          action: opposite.action,
          requestId: opposite.requestId,
          tenantId,
        });
        const oppositeExists = validateAudit(oppositeAudit, opposite);
        if (direction === "ROLLBACK" && !oppositeExists) {
          fail("ACCESS_SCOPE_ROLLBACK_WITHOUT_DURABLE_APPLY");
        }
        if (direction === "APPLY" && oppositeExists) {
          fail("ACCESS_SCOPE_REAPPLY_AFTER_ROLLBACK_FORBIDDEN");
        }
        if (validateAudit(existingAudit, expectedAudit)) {
          assertExactState(fresh, plan, direction);
          disposition = "RECONCILED";
          return fresh;
        }
        if (direction === "APPLY") {
          if (!equalDigest(fresh.stateDigest, plan.stateBeforeDigest)) {
            fail("ACCESS_SCOPE_PLAN_STALE_UNDER_LOCK");
          }
          const sourceSubjects = selectPlanSubjects(fresh, plan, sourceState(plan, direction));
          if (
            !equalDigest(stateDigestForSubjects(sourceSubjects), plan.priorStateDigest) ||
            !equalDigest(fresh.aggregateDigest, plan.aggregateBeforeDigest)
          ) {
            fail("ACCESS_SCOPE_PLAN_STALE_UNDER_LOCK");
          }
        } else {
          assertExactState(fresh, plan, "APPLY");
        }
        await transaction.applyMutations({
          mutations: buildMutations(fresh, targetState(plan, direction)),
          tenantId,
        });
        await transaction.insertAudit({
          audit: expectedAudit,
          auditId: randomUUID(),
          tenantId,
        });
        const after = projectSnapshot(
          await transaction.readLockedSnapshot({ tenantId }),
          target,
          tenantId,
          key,
        );
        assertProjectedPlanBinding(after, plan);
        assertExactState(after, plan, direction);
        return after;
      },
    );
  } catch (error) {
    const reconciled = await reconcileAfterAmbiguousResponse({
      adapter,
      direction,
      hmacKey: key,
      plan,
      rawTarget: target,
      tenantId,
    }).catch(() => null);
    if (reconciled === null) throw error;
    projected = reconciled;
    disposition = "RECONCILED";
  }
  return buildExecutionReceipt({
    approval,
    direction,
    disposition,
    plan,
    projected,
  });
}

export async function checkAccessScopeClassification({
  adapter,
  direction,
  hmacKey,
  plan: rawPlan,
  target: rawTarget,
  tenantId,
}) {
  if (
    adapter === null ||
    typeof adapter?.readSnapshot !== "function" ||
    typeof adapter?.readAudit !== "function"
  ) {
    fail("ACCESS_SCOPE_ADAPTER_INVALID");
  }
  if (!["APPLY", "ROLLBACK"].includes(direction)) {
    fail("ACCESS_SCOPE_CHECK_DIRECTION_INVALID");
  }
  const target = normalizeAccessScopeTarget(rawTarget);
  const plan = validatePlan(rawPlan);
  const expectedAudit = auditProjection(plan, direction);
  if (
    !validateAudit(
      await adapter.readAudit({
        action: expectedAudit.action,
        requestId: expectedAudit.requestId,
        tenantId,
      }),
      expectedAudit,
    )
  ) {
    fail("ACCESS_SCOPE_DURABLE_AUDIT_NOT_FOUND");
  }
  const opposite = auditProjection(
    plan,
    direction === "APPLY" ? "ROLLBACK" : "APPLY",
  );
  const oppositeExists = validateAudit(
    await adapter.readAudit({
      action: opposite.action,
      requestId: opposite.requestId,
      tenantId,
    }),
    opposite,
  );
  if (
    (direction === "APPLY" && oppositeExists) ||
    (direction === "ROLLBACK" && !oppositeExists)
  ) {
    fail("ACCESS_SCOPE_DURABLE_AUDIT_SEQUENCE_INVALID");
  }
  const projected = projectSnapshot(
    await adapter.readSnapshot({ tenantId }),
    target,
    tenantId,
    hmacKey,
  );
  assertProjectedPlanBinding(projected, plan);
  assertExactState(projected, plan, direction);
  const body = Object.freeze({
    aggregateDigest: projected.aggregateDigest,
    contractVersion: ACCESS_SCOPE_CLASSIFICATION_CONTRACT,
    decision: "CLASSIFICATION_STATE_VERIFIED",
    direction,
    planDigest: plan.planDigest,
    stateDigest:
      direction === "APPLY" ? plan.desiredStateDigest : plan.priorStateDigest,
    targetIdentityDigest: projected.identityDigest,
    tenantDigest: plan.tenantDigest,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest("check-receipt", body),
  });
}

function absoluteReceiptPath(filePath) {
  if (
    typeof filePath !== "string" ||
    filePath.trim() !== filePath ||
    !path.isAbsolute(filePath) ||
    filePath.length > 4096 ||
    path.normalize(filePath) !== filePath ||
    [".", ".."].includes(path.basename(filePath))
  ) {
    fail("ACCESS_SCOPE_FILE_PATH_INVALID");
  }
  return filePath;
}

function comparablePath(filePath) {
  const normalized = path.normalize(filePath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function assertNoSymlinkAncestry(directoryPath) {
  const parsed = path.parse(directoryPath);
  const relative = path.relative(parsed.root, directoryPath);
  const components = relative === "" ? [] : relative.split(path.sep);
  let current = parsed.root;
  for (const component of components) {
    current = path.join(current, component);
    const stat = await lstat(current, { bigint: true }).catch(() => null);
    if (stat === null || stat.isSymbolicLink() || !stat.isDirectory()) {
      fail("ACCESS_SCOPE_EVIDENCE_ANCESTRY_INVALID");
    }
    const canonical = await realpath(current);
    if (comparablePath(canonical) !== comparablePath(current)) {
      fail("ACCESS_SCOPE_EVIDENCE_ANCESTRY_REPARSE_POINT");
    }
  }
}

const WINDOWS_ACL_ATTESTATION_SCRIPT = `
$ErrorActionPreference = 'Stop'
$target = $env:LEETPLUS_EVIDENCE_ACL_TARGET
if ([string]::IsNullOrWhiteSpace($target)) { throw 'target missing' }
$item = Get-Item -LiteralPath $target -Force
if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'reparse point rejected'
}
$acl = Get-Acl -LiteralPath $target
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
$rules = @($acl.GetAccessRules(
  $true,
  $true,
  [System.Security.Principal.SecurityIdentifier]
) | ForEach-Object {
  [pscustomobject]@{
    accessType = [int]$_.AccessControlType
    inheritanceFlags = [int]$_.InheritanceFlags
    isInherited = [bool]$_.IsInherited
    propagationFlags = [int]$_.PropagationFlags
    rights = [long]$_.FileSystemRights
    sid = $_.IdentityReference.Value
  }
})
[pscustomobject]@{
  accessRulesCanonical = [bool]$acl.AreAccessRulesCanonical
  accessRulesProtected = [bool]$acl.AreAccessRulesProtected
  currentSid = $currentSid
  ownerSid = $ownerSid
  rules = $rules
} | ConvertTo-Json -Compress -Depth 5
`;

async function attestWindowsEvidenceAcl(targetPath, kind) {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (typeof systemRoot !== "string" || !path.isAbsolute(systemRoot)) {
    fail("ACCESS_SCOPE_EVIDENCE_WINDOWS_ACL_TOOL_UNAVAILABLE");
  }
  const executable = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const encoded = Buffer.from(
    WINDOWS_ACL_ATTESTATION_SCRIPT,
    "utf16le",
  ).toString("base64");
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      executable,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded,
      ],
      {
        encoding: "utf8",
        env: {
          LEETPLUS_EVIDENCE_ACL_TARGET: targetPath,
          PATH: path.join(systemRoot, "System32"),
          SystemRoot: systemRoot,
          TEMP: process.env.TEMP ?? "",
          TMP: process.env.TMP ?? "",
          WINDIR: systemRoot,
        },
        maxBuffer: 128 * 1024,
        timeout: 10000,
        windowsHide: true,
      },
    ));
  } catch {
    fail("ACCESS_SCOPE_EVIDENCE_WINDOWS_ACL_ATTESTATION_FAILED");
  }
  let evidence;
  try {
    evidence = JSON.parse(stdout.trim());
  } catch {
    fail("ACCESS_SCOPE_EVIDENCE_WINDOWS_ACL_EVIDENCE_INVALID");
  }
  exactObject(
    evidence,
    [
      "accessRulesCanonical",
      "accessRulesProtected",
      "currentSid",
      "ownerSid",
      "rules",
    ],
    "ACCESS_SCOPE_EVIDENCE_WINDOWS_ACL_EVIDENCE_INVALID",
  );
  if (
    evidence.accessRulesCanonical !== true ||
    evidence.ownerSid !== evidence.currentSid ||
    !Array.isArray(evidence.rules)
  ) {
    fail("ACCESS_SCOPE_EVIDENCE_WINDOWS_ACL_NOT_PRIVATE");
  }
  if (kind === "root" && evidence.accessRulesProtected !== true) {
    fail("ACCESS_SCOPE_EVIDENCE_WINDOWS_ROOT_INHERITANCE_ENABLED");
  }
  const allowedSids = new Set([
    evidence.currentSid,
    "S-1-5-18",
    "S-1-5-32-544",
  ]);
  const observedSids = new Set();
  const fullControl = 2032127n;
  for (const rawRule of evidence.rules) {
    const rule = exactObject(
      rawRule,
      [
        "accessType",
        "inheritanceFlags",
        "isInherited",
        "propagationFlags",
        "rights",
        "sid",
      ],
      "ACCESS_SCOPE_EVIDENCE_WINDOWS_ACL_EVIDENCE_INVALID",
    );
    let rights;
    try {
      rights = BigInt(rule.rights);
    } catch {
      fail("ACCESS_SCOPE_EVIDENCE_WINDOWS_ACL_EVIDENCE_INVALID");
    }
    if (
      rule.accessType !== 0 ||
      typeof rule.sid !== "string" ||
      !allowedSids.has(rule.sid) ||
      (rights & fullControl) !== fullControl ||
      (kind === "root" &&
        (rule.isInherited !== false ||
          rule.inheritanceFlags !== 3 ||
          rule.propagationFlags !== 0))
    ) {
      fail("ACCESS_SCOPE_EVIDENCE_WINDOWS_ACL_NOT_PRIVATE");
    }
    observedSids.add(rule.sid);
  }
  if (
    observedSids.size !== allowedSids.size ||
    [...allowedSids].some((sid) => !observedSids.has(sid))
  ) {
    fail("ACCESS_SCOPE_EVIDENCE_WINDOWS_ACL_NOT_EXACT");
  }
  return Object.freeze({
    decision: "PROTECTED_EVIDENCE_PATH",
    protection: "WINDOWS_EXACT_DACL_VERIFIED",
  });
}

async function defaultEvidencePathAttestor({ kind, stat, targetPath }) {
  if (process.platform === "win32") {
    return attestWindowsEvidenceAcl(targetPath, kind);
  }
  const currentUid = process.geteuid?.();
  const expectedMode = kind === "root" ? 0o700 : 0o600;
  if (
    !Number.isInteger(currentUid) ||
    Number(stat.uid) !== currentUid ||
    (Number(stat.mode) & POSIX_PERMISSION_MASK) !== expectedMode
  ) {
    fail("ACCESS_SCOPE_EVIDENCE_POSIX_PERMISSION_INVALID");
  }
  return Object.freeze({
    decision: "PROTECTED_EVIDENCE_PATH",
    protection: `POSIX_OWNER_MODE_${expectedMode.toString(8)}_VERIFIED`,
  });
}

async function attestEvidencePath(attestor, input) {
  const result = await (attestor ?? defaultEvidencePathAttestor)(input);
  if (
    result === null ||
    typeof result !== "object" ||
    result.decision !== "PROTECTED_EVIDENCE_PATH" ||
    typeof result.protection !== "string" ||
    result.protection.length < 3 ||
    result.protection.length > 100
  ) {
    fail("ACCESS_SCOPE_EVIDENCE_PROTECTION_ATTESTATION_INVALID");
  }
  return result;
}

async function prepareEvidenceBoundary(
  filePath,
  { evidencePathAttestor, evidenceRoot } = {},
) {
  absoluteReceiptPath(filePath);
  absoluteReceiptPath(evidenceRoot);
  if (path.basename(evidenceRoot) !== path.basename(path.normalize(evidenceRoot))) {
    fail("ACCESS_SCOPE_EVIDENCE_ROOT_INVALID");
  }
  await assertNoSymlinkAncestry(evidenceRoot);
  const rootStat = await lstat(evidenceRoot, { bigint: true }).catch(() => null);
  if (
    rootStat === null ||
    rootStat.isSymbolicLink() ||
    !rootStat.isDirectory()
  ) {
    fail("ACCESS_SCOPE_EVIDENCE_ROOT_INVALID");
  }
  const canonicalRoot = await realpath(evidenceRoot);
  if (
    comparablePath(canonicalRoot) !== comparablePath(evidenceRoot) ||
    comparablePath(path.dirname(filePath)) !== comparablePath(canonicalRoot)
  ) {
    fail("ACCESS_SCOPE_FILE_OUTSIDE_PROTECTED_ROOT");
  }
  const rootProtection = await attestEvidencePath(evidencePathAttestor, {
    kind: "root",
    stat: rootStat,
    targetPath: canonicalRoot,
  });
  return Object.freeze({
    canonicalRoot,
    destination: path.join(canonicalRoot, path.basename(filePath)),
    evidencePathAttestor,
    rootIdentityDigest: digest("evidence-root-identity", {
      canonicalRoot,
      dev: rootStat.dev.toString(),
      ino: rootStat.ino.toString(),
    }),
    rootProtection,
    rootStat,
  });
}

async function assertEvidenceRootRebound(boundary) {
  const after = await lstat(boundary.canonicalRoot, { bigint: true }).catch(
    () => null,
  );
  if (
    after === null ||
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    !sameFileIdentity(boundary.rootStat, after) ||
    comparablePath(await realpath(boundary.canonicalRoot)) !==
      comparablePath(boundary.canonicalRoot)
  ) {
    fail("ACCESS_SCOPE_EVIDENCE_ROOT_REBOUND");
  }
}

async function syncEvidenceDirectory(boundary) {
  let handle;
  try {
    handle = await open(boundary.canonicalRoot, fsConstants.O_RDONLY);
    await handle.sync();
    return "DIRECTORY_FSYNC_VERIFIED";
  } catch (error) {
    if (
      process.platform === "win32" &&
      ["EACCES", "EISDIR", "EINVAL", "EPERM"].includes(error?.code)
    ) {
      return "DIRECTORY_FSYNC_UNAVAILABLE_WIN32";
    }
    fail("ACCESS_SCOPE_EVIDENCE_DIRECTORY_FSYNC_FAILED");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function readAccessScopeJsonFile(filePath, options = {}) {
  const boundary = await prepareEvidenceBoundary(filePath, options);
  const pathStat = await lstat(boundary.destination, { bigint: true }).catch(
    () => null,
  );
  if (
    pathStat === null ||
    pathStat.isSymbolicLink() ||
    !pathStat.isFile() ||
    pathStat.size <= 0n ||
    pathStat.size > BigInt(MAX_FILE_BYTES)
  ) {
    fail("ACCESS_SCOPE_FILE_INVALID");
  }
  if (
    comparablePath(await realpath(boundary.destination)) !==
    comparablePath(boundary.destination)
  ) {
    fail("ACCESS_SCOPE_FILE_REBOUND");
  }
  await attestEvidencePath(boundary.evidencePathAttestor, {
    kind: "file",
    stat: pathStat,
    targetPath: boundary.destination,
  });
  const handle = await open(boundary.destination, fsConstants.O_RDONLY);
  try {
    const before = await handle.stat({ bigint: true });
    if (
      pathStat.dev !== before.dev ||
      pathStat.ino !== before.ino ||
      pathStat.size !== before.size ||
      pathStat.mtimeNs !== before.mtimeNs
    ) {
      fail("ACCESS_SCOPE_FILE_TORN");
    }
    const bytes = Buffer.alloc(Number(before.size));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat({ bigint: true });
    if (
      bytesRead !== bytes.length ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs
    ) {
      fail("ACCESS_SCOPE_FILE_TORN");
    }
    const rebound = await lstat(boundary.destination, { bigint: true }).catch(
      () => null,
    );
    if (
      rebound === null ||
      rebound.isSymbolicLink() ||
      !rebound.isFile() ||
      !sameFileIdentity(after, rebound)
    ) {
      fail("ACCESS_SCOPE_FILE_REBOUND");
    }
    await assertEvidenceRootRebound(boundary);
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      fail("ACCESS_SCOPE_FILE_JSON_INVALID");
    }
  } finally {
    await handle.close();
  }
}

export async function writeAccessScopeReceiptExclusive(
  filePath,
  value,
  options = {},
) {
  const boundary = await prepareEvidenceBoundary(filePath, options);
  const bytes = Buffer.from(`${canonicalJson(value)}\n`, "utf8");
  let durableFileStat;
  const handle = await open(
    boundary.destination,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  ).catch((error) => {
    if (error?.code === "EEXIST") fail("ACCESS_SCOPE_RECEIPT_ALREADY_EXISTS");
    throw error;
  });
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    const handleStat = await handle.stat({ bigint: true });
    durableFileStat = handleStat;
    const pathStat = await lstat(boundary.destination, { bigint: true }).catch(
      () => null,
    );
    if (
      pathStat === null ||
      pathStat.isSymbolicLink() ||
      !pathStat.isFile() ||
      !sameFileIdentity(handleStat, pathStat) ||
      handleStat.size !== BigInt(bytes.length) ||
      comparablePath(await realpath(boundary.destination)) !==
        comparablePath(boundary.destination)
    ) {
      fail("ACCESS_SCOPE_RECEIPT_PATH_REBOUND");
    }
  } finally {
    await handle.close();
  }
  const finalStat = await lstat(boundary.destination, { bigint: true }).catch(
    () => null,
  );
  if (finalStat === null || finalStat.isSymbolicLink() || !finalStat.isFile()) {
    fail("ACCESS_SCOPE_RECEIPT_PATH_REBOUND");
  }
  if (!sameFileIdentity(durableFileStat, finalStat)) {
    fail("ACCESS_SCOPE_RECEIPT_PATH_REBOUND");
  }
  const fileProtection = await attestEvidencePath(
    boundary.evidencePathAttestor,
    {
      kind: "file",
      stat: finalStat,
      targetPath: boundary.destination,
    },
  );
  const directorySync = await syncEvidenceDirectory(boundary);
  await assertEvidenceRootRebound(boundary);
  return Object.freeze({
    directorySync,
    evidenceRootIdentityDigest: boundary.rootIdentityDigest,
    fileProtection: fileProtection.protection,
    receiptSha256: sha256(bytes),
    rootProtection: boundary.rootProtection.protection,
    sizeBytes: bytes.length,
  });
}

const IDENTITY_SQL = `
  WITH expected_table_grants("tableName", "privilegeType") AS (
    VALUES
      ('UserStoreAccess'::TEXT, 'INSERT'::TEXT),
      ('UserStoreAccess'::TEXT, 'DELETE'::TEXT),
      ('PlatformAdminAuditEvent'::TEXT, 'INSERT'::TEXT)
  ), actual_table_grants("tableName", "privilegeType") AS (
    SELECT grant_row.table_name::TEXT, grant_row.privilege_type::TEXT
    FROM information_schema.role_table_grants AS grant_row
    WHERE grant_row.grantee = current_user
      AND grant_row.table_schema = 'public'
  ), expected_update_columns("tableName", "columnName") AS (
    VALUES
      ('User'::TEXT, 'accessScope'::TEXT),
      ('User'::TEXT, 'updatedAt'::TEXT)
  ), actual_update_columns("tableName", "columnName") AS (
    SELECT grant_row.table_name::TEXT, grant_row.column_name::TEXT
    FROM information_schema.role_column_grants AS grant_row
    WHERE grant_row.grantee = current_user
      AND grant_row.table_schema = 'public'
      AND grant_row.privilege_type = 'UPDATE'
  ), public_relations("oid", "relationName", "relationKind") AS (
    SELECT relation.oid, relation.relname::TEXT, relation.relkind
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
  ), expected_effective_relation_grants("relationName", "privilegeType") AS (
    SELECT "tableName", "privilegeType" FROM expected_table_grants
  ), actual_effective_relation_grants("relationName", "privilegeType") AS (
    SELECT relation."relationName", privilege."privilegeType"
    FROM public_relations AS relation
    CROSS JOIN (
      VALUES
        ('SELECT'::TEXT), ('INSERT'::TEXT), ('UPDATE'::TEXT),
        ('DELETE'::TEXT), ('TRUNCATE'::TEXT), ('REFERENCES'::TEXT),
        ('TRIGGER'::TEXT)
    ) AS privilege("privilegeType")
    WHERE pg_catalog.has_table_privilege(
      current_user, relation."oid", privilege."privilegeType"
    )
  ), public_columns("relationOid", "relationName", "columnName", "attnum") AS (
    SELECT relation."oid", relation."relationName", attribute.attname::TEXT,
      attribute.attnum
    FROM public_relations AS relation
    INNER JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation."oid"
    WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
  ), expected_effective_column_grants(
    "relationName", "columnName", "privilegeType"
  ) AS (
    SELECT expected."relationName", expected."columnName", 'SELECT'::TEXT
    FROM (
      VALUES
        ('Tenant'::TEXT, 'id'::TEXT),
        ('Store'::TEXT, 'id'::TEXT),
        ('Store'::TEXT, 'isActive'::TEXT),
        ('User'::TEXT, 'id'::TEXT),
        ('User'::TEXT, 'tenantId'::TEXT),
        ('User'::TEXT, 'role'::TEXT),
        ('User'::TEXT, 'accessScope'::TEXT),
        ('User'::TEXT, 'isActive'::TEXT),
        ('User'::TEXT, 'isPlatformAdmin'::TEXT),
        ('User'::TEXT, 'updatedAt'::TEXT),
        ('UserStoreAccess'::TEXT, 'id'::TEXT),
        ('UserStoreAccess'::TEXT, 'userId'::TEXT),
        ('UserStoreAccess'::TEXT, 'storeId'::TEXT),
        ('UserStoreAccess'::TEXT, 'createdAt'::TEXT),
        ('PlatformAdminAuditEvent'::TEXT, 'action'::TEXT),
        ('PlatformAdminAuditEvent'::TEXT, 'requestId'::TEXT),
        ('PlatformAdminAuditEvent'::TEXT, 'targetType'::TEXT),
        ('PlatformAdminAuditEvent'::TEXT, 'targetId'::TEXT),
        ('PlatformAdminAuditEvent'::TEXT, 'reason'::TEXT),
        ('PlatformAdminAuditEvent'::TEXT, 'before'::TEXT),
        ('PlatformAdminAuditEvent'::TEXT, 'after'::TEXT),
        ('PlatformAdminAuditEvent'::TEXT, 'metadata'::TEXT)
    ) AS expected("relationName", "columnName")
    UNION ALL
    SELECT column_row."relationName", column_row."columnName", 'INSERT'::TEXT
    FROM public_columns AS column_row
    WHERE column_row."relationName" IN (
      'UserStoreAccess', 'PlatformAdminAuditEvent'
    )
    UNION ALL
    SELECT 'User'::TEXT, 'accessScope'::TEXT, 'UPDATE'::TEXT
    UNION ALL
    SELECT 'User'::TEXT, 'updatedAt'::TEXT, 'UPDATE'::TEXT
  ), actual_effective_column_grants(
    "relationName", "columnName", "privilegeType"
  ) AS (
    SELECT column_row."relationName", column_row."columnName",
      privilege."privilegeType"
    FROM public_columns AS column_row
    CROSS JOIN (
      VALUES
        ('SELECT'::TEXT), ('INSERT'::TEXT), ('UPDATE'::TEXT),
        ('REFERENCES'::TEXT)
    ) AS privilege("privilegeType")
    WHERE pg_catalog.has_column_privilege(
      current_user,
      column_row."relationOid",
      column_row."attnum",
      privilege."privilegeType"
    )
  ), candidate_namespaces("oid", "schemaName") AS (
    SELECT namespace.oid, namespace.nspname::TEXT
    FROM pg_catalog.pg_namespace AS namespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname NOT LIKE 'pg_toast%'
      AND namespace.nspname NOT LIKE 'pg_temp_%'
  ), candidate_types("oid", "schemaName", "typeName") AS (
    SELECT type_row.oid, namespace."schemaName", type_row.typname::TEXT
    FROM pg_catalog.pg_type AS type_row
    INNER JOIN candidate_namespaces AS namespace
      ON namespace.oid = type_row.typnamespace
    WHERE type_row.typisdefined
      AND type_row.typtype IN ('b', 'c', 'd', 'e', 'm', 'r')
      AND NOT (type_row.typcategory = 'A' AND type_row.typelem <> 0)
  ), trusted_lock_owner AS (
    SELECT owner.*
    FROM pg_catalog.pg_roles AS owner
    WHERE owner.rolname = '${TRUSTED_LOCK_OWNER}'
  ), trusted_lock_function AS (
    SELECT routine.*, language.lanname::TEXT AS "languageName",
      owner.rolname::TEXT AS "ownerName"
    FROM pg_catalog.pg_proc AS routine
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    INNER JOIN pg_catalog.pg_language AS language
      ON language.oid = routine.prolang
    INNER JOIN pg_catalog.pg_roles AS owner
      ON owner.oid = routine.proowner
    WHERE routine.oid = pg_catalog.to_regprocedure('${TRUSTED_LOCK_FUNCTION}')
      AND namespace.nspname = 'public'
  ), expected_lock_owner_column_grants(
    "schemaName", "relationName", "columnName", "privilegeType"
  ) AS (
    VALUES
      ('public'::TEXT, 'Tenant'::TEXT, 'id'::TEXT, 'SELECT'::TEXT),
      ('public'::TEXT, 'Tenant'::TEXT, 'id'::TEXT, 'UPDATE'::TEXT),
      ('public'::TEXT, 'Store'::TEXT, 'id'::TEXT, 'SELECT'::TEXT),
      ('public'::TEXT, 'Store'::TEXT, 'id'::TEXT, 'UPDATE'::TEXT),
      ('public'::TEXT, 'Store'::TEXT, 'tenantId'::TEXT, 'SELECT'::TEXT),
      ('public'::TEXT, 'User'::TEXT, 'id'::TEXT, 'SELECT'::TEXT),
      ('public'::TEXT, 'User'::TEXT, 'id'::TEXT, 'UPDATE'::TEXT),
      ('public'::TEXT, 'User'::TEXT, 'tenantId'::TEXT, 'SELECT'::TEXT),
      ('public'::TEXT, 'UserStoreAccess'::TEXT, 'id'::TEXT, 'SELECT'::TEXT),
      ('public'::TEXT, 'UserStoreAccess'::TEXT, 'id'::TEXT, 'UPDATE'::TEXT),
      ('public'::TEXT, 'UserStoreAccess'::TEXT, 'userId'::TEXT, 'SELECT'::TEXT),
      ('public'::TEXT, 'UserStoreAccess'::TEXT, 'storeId'::TEXT, 'SELECT'::TEXT)
  ), actual_lock_owner_column_grants(
    "schemaName", "relationName", "columnName", "privilegeType"
  ) AS (
    SELECT namespace."schemaName", relation.relname::TEXT,
      attribute.attname::TEXT,
      acl.privilege_type::TEXT
    FROM pg_catalog.pg_attribute AS attribute
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    INNER JOIN candidate_namespaces AS namespace
      ON namespace."oid" = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
    INNER JOIN trusted_lock_owner AS owner ON owner.oid = acl.grantee
    WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
  ), effective_lock_owner_column_grants(
    "schemaName", "relationName", "columnName", "privilegeType"
  ) AS (
    SELECT namespace."schemaName", relation.relname::TEXT,
      attribute.attname::TEXT, privilege."privilegeType"
    FROM pg_catalog.pg_attribute AS attribute
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    INNER JOIN candidate_namespaces AS namespace
      ON namespace."oid" = relation.relnamespace
    INNER JOIN trusted_lock_owner AS owner ON TRUE
    CROSS JOIN (
      VALUES
        ('SELECT'::TEXT), ('INSERT'::TEXT), ('UPDATE'::TEXT),
        ('REFERENCES'::TEXT)
    ) AS privilege("privilegeType")
    WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
      AND pg_catalog.has_column_privilege(
        owner.oid,
        relation.oid,
        attribute.attnum,
        privilege."privilegeType"
      )
  ), expected_lock_owner_schema_grants("schemaName", "privilegeType") AS (
    VALUES ('public'::TEXT, 'USAGE'::TEXT)
  ), actual_lock_owner_schema_grants("schemaName", "privilegeType") AS (
    SELECT namespace."schemaName", acl.privilege_type::TEXT
    FROM candidate_namespaces AS namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        (
          SELECT catalog_namespace.nspacl
          FROM pg_catalog.pg_namespace AS catalog_namespace
          WHERE catalog_namespace.oid = namespace."oid"
        ),
        pg_catalog.acldefault(
          'n',
          (
            SELECT catalog_namespace.nspowner
            FROM pg_catalog.pg_namespace AS catalog_namespace
            WHERE catalog_namespace.oid = namespace."oid"
          )
        )
      )
    ) AS acl
    INNER JOIN trusted_lock_owner AS owner ON owner.oid = acl.grantee
  ), expected_lock_function_acl("grantee", "isGrantable") AS (
    SELECT writer.oid, FALSE
    FROM pg_catalog.pg_roles AS writer
    WHERE writer.rolname = current_user
  ), actual_lock_function_acl("grantee", "isGrantable") AS (
    SELECT acl.grantee, acl.is_grantable
    FROM trusted_lock_function AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        routine.proacl,
        pg_catalog.acldefault('f', routine.proowner)
      )
    ) AS acl
    WHERE acl.grantee <> routine.proowner
      AND acl.privilege_type = 'EXECUTE'
  ), expected_effective_type_grants("schemaName", "typeName") AS (
    VALUES
      ('public'::TEXT, 'UserAccessScope'::TEXT),
      ('public'::TEXT, 'UserRole'::TEXT)
  ), actual_effective_type_grants("schemaName", "typeName") AS (
    SELECT type_row."schemaName", type_row."typeName"
    FROM candidate_types AS type_row
    WHERE pg_catalog.has_type_privilege(current_user, type_row."oid", 'USAGE')
  )
  SELECT
    pg_catalog.current_database() AS "currentDatabase",
    current_user AS "currentUser",
    session_user AS "sessionUser",
    pg_catalog.host(pg_catalog.inet_server_addr()) AS "serverAddress",
    pg_catalog.inet_server_port()::INTEGER AS "serverPort",
    (pg_catalog.pg_control_system()).system_identifier::TEXT AS "systemIdentifier",
    role.rolsuper AS "isSuperuser",
    role.rolcreatedb AS "canCreateDb",
    role.rolcreaterole AS "canCreateRole",
    role.rolinherit AS "canInherit",
    role.rolreplication AS "canReplicate",
    role.rolbypassrls AS "canBypassRls",
    (role.rolconfig IS NULL OR pg_catalog.cardinality(role.rolconfig) = 0)
      AS "roleConfigEmpty",
    (
      SELECT pg_catalog.count(*) = 1 FROM trusted_lock_function
    ) AS "lockFunctionExists",
    COALESCE(
      (SELECT routine.prosrc::TEXT FROM trusted_lock_function AS routine),
      ''::TEXT
    ) AS "lockFunctionSource",
    COALESCE(
      (SELECT routine."ownerName" FROM trusted_lock_function AS routine),
      ''::TEXT
    ) AS "lockFunctionOwner",
    COALESCE(
      (SELECT routine."languageName" FROM trusted_lock_function AS routine),
      ''::TEXT
    ) AS "lockFunctionLanguage",
    COALESCE(
      (SELECT routine.prosecdef FROM trusted_lock_function AS routine), FALSE
    ) AS "lockFunctionSecurityDefiner",
    COALESCE(
      (SELECT routine.provolatile::TEXT FROM trusted_lock_function AS routine),
      ''::TEXT
    ) AS "lockFunctionVolatile",
    COALESCE(
      (SELECT routine.proparallel::TEXT FROM trusted_lock_function AS routine),
      ''::TEXT
    ) AS "lockFunctionParallel",
    COALESCE(
      (SELECT routine.proleakproof FROM trusted_lock_function AS routine), TRUE
    ) AS "lockFunctionLeakproof",
    COALESCE(
      (
        SELECT routine.prorettype = 'pg_catalog.void'::pg_catalog.regtype
        FROM trusted_lock_function AS routine
      ),
      FALSE
    ) AS "lockFunctionReturnsVoid",
    COALESCE(
      (
        SELECT routine.proconfig =
          ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
        FROM trusted_lock_function AS routine
      ),
      FALSE
    ) AS "lockFunctionConfigExact",
    COALESCE(
      (
        SELECT pg_catalog.has_function_privilege(
          current_user, routine.oid, 'EXECUTE'
        )
        FROM trusted_lock_function AS routine
      ),
      FALSE
    ) AS "lockFunctionCanExecute",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM expected_lock_function_acl AS expected
      LEFT JOIN actual_lock_function_acl AS actual
        ON actual."grantee" = expected."grantee"
       AND actual."isGrantable" = expected."isGrantable"
      WHERE actual."grantee" IS NULL
    ) AS "lockFunctionAclMissingCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM actual_lock_function_acl AS actual
      LEFT JOIN expected_lock_function_acl AS expected
        ON expected."grantee" = actual."grantee"
       AND expected."isGrantable" = actual."isGrantable"
      WHERE expected."grantee" IS NULL
    ) AS "lockFunctionAclUnexpectedCount",
    (SELECT owner.rolcanlogin FROM trusted_lock_owner AS owner)
      AS "lockOwnerCanLogin",
    (SELECT owner.rolsuper FROM trusted_lock_owner AS owner)
      AS "lockOwnerIsSuperuser",
    (SELECT owner.rolcreatedb FROM trusted_lock_owner AS owner)
      AS "lockOwnerCanCreateDb",
    (SELECT owner.rolcreaterole FROM trusted_lock_owner AS owner)
      AS "lockOwnerCanCreateRole",
    (SELECT owner.rolinherit FROM trusted_lock_owner AS owner)
      AS "lockOwnerCanInherit",
    (SELECT owner.rolreplication FROM trusted_lock_owner AS owner)
      AS "lockOwnerCanReplicate",
    (SELECT owner.rolbypassrls FROM trusted_lock_owner AS owner)
      AS "lockOwnerCanBypassRls",
    (
      SELECT owner.rolconfig IS NULL OR
        pg_catalog.cardinality(owner.rolconfig) = 0
      FROM trusted_lock_owner AS owner
    ) AS "lockOwnerRoleConfigEmpty",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_auth_members AS membership
      INNER JOIN trusted_lock_owner AS owner
        ON owner.oid = membership.member
    ) AS "lockOwnerMembershipCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_auth_members AS membership
      INNER JOIN trusted_lock_owner AS owner
        ON owner.oid = membership.roleid
    ) AS "lockOwnerRoleGrantedToMemberCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM expected_lock_owner_column_grants AS expected
      LEFT JOIN actual_lock_owner_column_grants AS actual
        ON actual."schemaName" = expected."schemaName"
       AND actual."relationName" = expected."relationName"
       AND actual."columnName" = expected."columnName"
       AND actual."privilegeType" = expected."privilegeType"
      WHERE actual."relationName" IS NULL
    ) AS "lockOwnerMissingColumnGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM actual_lock_owner_column_grants AS actual
      LEFT JOIN expected_lock_owner_column_grants AS expected
        ON expected."schemaName" = actual."schemaName"
       AND expected."relationName" = actual."relationName"
       AND expected."columnName" = actual."columnName"
       AND expected."privilegeType" = actual."privilegeType"
      WHERE expected."relationName" IS NULL
    ) AS "lockOwnerUnexpectedColumnGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM expected_lock_owner_column_grants AS expected
      LEFT JOIN effective_lock_owner_column_grants AS actual
        ON actual."schemaName" = expected."schemaName"
       AND actual."relationName" = expected."relationName"
       AND actual."columnName" = expected."columnName"
       AND actual."privilegeType" = expected."privilegeType"
      WHERE actual."relationName" IS NULL
    ) AS "lockOwnerMissingEffectiveColumnGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM effective_lock_owner_column_grants AS actual
      LEFT JOIN expected_lock_owner_column_grants AS expected
        ON expected."schemaName" = actual."schemaName"
       AND expected."relationName" = actual."relationName"
       AND expected."columnName" = actual."columnName"
       AND expected."privilegeType" = actual."privilegeType"
      WHERE expected."relationName" IS NULL
    ) AS "lockOwnerUnexpectedEffectiveColumnGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM expected_lock_owner_schema_grants AS expected
      LEFT JOIN actual_lock_owner_schema_grants AS actual
        ON actual."schemaName" = expected."schemaName"
       AND actual."privilegeType" = expected."privilegeType"
      WHERE actual."schemaName" IS NULL
    ) AS "lockOwnerMissingSchemaGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM actual_lock_owner_schema_grants AS actual
      LEFT JOIN expected_lock_owner_schema_grants AS expected
        ON expected."schemaName" = actual."schemaName"
       AND expected."privilegeType" = actual."privilegeType"
      WHERE expected."schemaName" IS NULL
    ) + (
      SELECT pg_catalog.count(*)::INTEGER
      FROM candidate_namespaces AS namespace
      INNER JOIN trusted_lock_owner AS owner ON TRUE
      WHERE (
          namespace."schemaName" <> 'public'
          AND (
            pg_catalog.has_schema_privilege(owner.oid, namespace."oid", 'USAGE')
            OR pg_catalog.has_schema_privilege(owner.oid, namespace."oid", 'CREATE')
          )
        )
        OR (
          namespace."schemaName" = 'public'
          AND pg_catalog.has_schema_privilege(owner.oid, namespace."oid", 'CREATE')
        )
    ) AS "lockOwnerUnexpectedSchemaGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_class AS relation
      INNER JOIN candidate_namespaces AS namespace
        ON namespace."oid" = relation.relnamespace
      INNER JOIN trusted_lock_owner AS owner ON TRUE
      CROSS JOIN (
        VALUES
          ('SELECT'::TEXT), ('INSERT'::TEXT), ('UPDATE'::TEXT),
          ('DELETE'::TEXT), ('TRUNCATE'::TEXT), ('REFERENCES'::TEXT),
          ('TRIGGER'::TEXT)
      ) AS privilege("privilegeType")
      WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND pg_catalog.has_table_privilege(
          owner.oid, relation.oid, privilege."privilegeType"
        )
    ) AS "lockOwnerUnexpectedTableGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_class AS sequence
      INNER JOIN candidate_namespaces AS namespace
        ON namespace."oid" = sequence.relnamespace
      INNER JOIN trusted_lock_owner AS owner ON TRUE
      CROSS JOIN (
        VALUES ('USAGE'::TEXT), ('SELECT'::TEXT), ('UPDATE'::TEXT)
      ) AS privilege("privilegeType")
      WHERE sequence.relkind = 'S'
        AND pg_catalog.has_sequence_privilege(
          owner.oid, sequence.oid, privilege."privilegeType"
        )
    ) AS "lockOwnerUnexpectedSequenceGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM candidate_types AS type_row
      INNER JOIN trusted_lock_owner AS owner ON TRUE
      WHERE pg_catalog.has_type_privilege(owner.oid, type_row."oid", 'USAGE')
    ) AS "lockOwnerUnexpectedTypeGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_proc AS routine
      INNER JOIN candidate_namespaces AS namespace
        ON namespace."oid" = routine.pronamespace
      INNER JOIN trusted_lock_owner AS owner ON TRUE
      WHERE routine.oid <>
          pg_catalog.to_regprocedure('${TRUSTED_LOCK_FUNCTION}')
        AND pg_catalog.has_function_privilege(
          owner.oid, routine.oid, 'EXECUTE'
        )
    ) AS "lockOwnerUnexpectedRoutineGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM (
        SELECT database_row.oid
        FROM pg_catalog.pg_database AS database_row
        INNER JOIN trusted_lock_owner AS owner
          ON owner.oid = database_row.datdba
        UNION ALL
        SELECT namespace."oid"
        FROM candidate_namespaces AS namespace
        INNER JOIN pg_catalog.pg_namespace AS catalog_namespace
          ON catalog_namespace.oid = namespace."oid"
        INNER JOIN trusted_lock_owner AS owner
          ON owner.oid = catalog_namespace.nspowner
        UNION ALL
        SELECT relation.oid
        FROM pg_catalog.pg_class AS relation
        INNER JOIN candidate_namespaces AS namespace
          ON namespace."oid" = relation.relnamespace
        INNER JOIN trusted_lock_owner AS owner
          ON owner.oid = relation.relowner
        UNION ALL
        SELECT type_row.oid
        FROM pg_catalog.pg_type AS type_row
        INNER JOIN candidate_namespaces AS namespace
          ON namespace."oid" = type_row.typnamespace
        INNER JOIN trusted_lock_owner AS owner
          ON owner.oid = type_row.typowner
        UNION ALL
        SELECT routine.oid
        FROM pg_catalog.pg_proc AS routine
        INNER JOIN candidate_namespaces AS namespace
          ON namespace."oid" = routine.pronamespace
        INNER JOIN trusted_lock_owner AS owner
          ON owner.oid = routine.proowner
        WHERE routine.oid <>
          pg_catalog.to_regprocedure('${TRUSTED_LOCK_FUNCTION}')
      ) AS unexpected_owned_object
    ) AS "lockOwnerUnexpectedOwnershipCount",
    pg_catalog.has_database_privilege(
      current_user, pg_catalog.current_database(), 'CONNECT'
    ) AS "databaseCanConnect",
    pg_catalog.has_database_privilege(
      current_user, pg_catalog.current_database(), 'CREATE'
    ) AS "databaseCanCreate",
    pg_catalog.has_database_privilege(
      current_user, pg_catalog.current_database(), 'TEMPORARY'
    ) AS "databaseCanTemporary",
    pg_catalog.has_schema_privilege(
      current_user, 'public', 'USAGE'
    ) AS "schemaCanUse",
    pg_catalog.has_schema_privilege(
      current_user, 'public', 'CREATE'
    ) AS "schemaCanCreate",
    pg_catalog.has_type_privilege(
      current_user, 'public."UserAccessScope"', 'USAGE'
    ) AS "typeCanUse",
    pg_catalog.has_function_privilege(
      current_user, 'pg_catalog.pg_control_system()', 'EXECUTE'
    ) AS "controlSystemCanExecute",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.member = role.oid
    ) AS "membershipCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.roleid = role.oid
    ) AS "roleGrantedToMemberCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM expected_table_grants AS expected
      LEFT JOIN actual_table_grants AS actual
        ON actual."tableName" = expected."tableName"
       AND actual."privilegeType" = expected."privilegeType"
      WHERE actual."tableName" IS NULL
    ) AS "missingTableGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM actual_table_grants AS actual
      LEFT JOIN expected_table_grants AS expected
        ON expected."tableName" = actual."tableName"
       AND expected."privilegeType" = actual."privilegeType"
      WHERE expected."tableName" IS NULL
    ) AS "unexpectedTableGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM expected_update_columns AS expected
      LEFT JOIN actual_update_columns AS actual
        ON actual."tableName" = expected."tableName"
       AND actual."columnName" = expected."columnName"
      WHERE actual."tableName" IS NULL
    ) AS "missingUpdateColumnGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM actual_update_columns AS actual
      LEFT JOIN expected_update_columns AS expected
        ON expected."tableName" = actual."tableName"
       AND expected."columnName" = actual."columnName"
      WHERE expected."tableName" IS NULL
    ) AS "unexpectedUpdateColumnGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM expected_effective_relation_grants AS expected
      LEFT JOIN actual_effective_relation_grants AS actual
        ON actual."relationName" = expected."relationName"
       AND actual."privilegeType" = expected."privilegeType"
      WHERE actual."relationName" IS NULL
    ) AS "missingEffectiveRelationPrivilegeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM actual_effective_relation_grants AS actual
      LEFT JOIN expected_effective_relation_grants AS expected
        ON expected."relationName" = actual."relationName"
       AND expected."privilegeType" = actual."privilegeType"
      WHERE expected."relationName" IS NULL
    ) AS "unexpectedEffectiveRelationPrivilegeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM expected_effective_column_grants AS expected
      LEFT JOIN actual_effective_column_grants AS actual
        ON actual."relationName" = expected."relationName"
       AND actual."columnName" = expected."columnName"
       AND actual."privilegeType" = expected."privilegeType"
      WHERE actual."relationName" IS NULL
    ) AS "missingEffectiveColumnPrivilegeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM actual_effective_column_grants AS actual
      LEFT JOIN expected_effective_column_grants AS expected
        ON expected."relationName" = actual."relationName"
       AND expected."columnName" = actual."columnName"
       AND expected."privilegeType" = actual."privilegeType"
      WHERE expected."relationName" IS NULL
    ) AS "unexpectedEffectiveColumnPrivilegeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM information_schema.role_column_grants AS grant_row
      WHERE grant_row.grantee = current_user
        AND grant_row.table_schema = 'public'
        AND grant_row.table_name = 'User'
        AND grant_row.privilege_type IN ('INSERT', 'UPDATE')
        AND grant_row.column_name IN (
          'tenantId', 'email', 'passwordHash', 'fullName', 'role',
          'customRoleId', 'isActive', 'isPlatformAdmin',
          'emailVerifiedAt', 'identityClaimRevision', 'createdAt'
        )
    ) AS "userSensitiveWriteGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM information_schema.role_routine_grants AS grant_row
      WHERE grant_row.grantee = current_user
        AND NOT (
          grant_row.privilege_type = 'EXECUTE'
          AND (
            (
              grant_row.routine_schema = 'pg_catalog'
              AND grant_row.routine_name = 'pg_control_system'
            )
            OR (
              grant_row.routine_schema = 'public'
              AND grant_row.routine_name =
                'leetplus_current_network_access_scope_lock_v1'
            )
          )
        )
    ) AS "unexpectedRoutineGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM information_schema.role_usage_grants AS grant_row
      WHERE grant_row.grantee = current_user
        AND grant_row.object_type = 'SEQUENCE'
    ) AS "unexpectedSequenceGrantCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_class AS sequence
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = sequence.relnamespace
      CROSS JOIN (
        VALUES ('USAGE'::TEXT), ('SELECT'::TEXT), ('UPDATE'::TEXT)
      ) AS privilege("privilegeType")
      WHERE namespace.nspname = 'public'
        AND sequence.relkind = 'S'
        AND pg_catalog.has_sequence_privilege(
          current_user, sequence.oid, privilege."privilegeType"
        )
    ) AS "unexpectedEffectiveSequencePrivilegeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_proc AS routine
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname = 'public'
        AND routine.oid <>
          pg_catalog.to_regprocedure('${TRUSTED_LOCK_FUNCTION}')
        AND pg_catalog.has_function_privilege(
          current_user, routine.oid, 'EXECUTE'
        )
    ) AS "unexpectedEffectivePublicRoutineExecuteCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM candidate_namespaces AS namespace
      WHERE namespace."schemaName" <> 'public'
        AND (
          pg_catalog.has_schema_privilege(
            current_user, namespace.oid, 'USAGE'
          )
          OR pg_catalog.has_schema_privilege(
            current_user, namespace.oid, 'CREATE'
          )
        )
    ) AS "unexpectedExtraSchemaPrivilegeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_class AS relation
      INNER JOIN candidate_namespaces AS namespace
        ON namespace.oid = relation.relnamespace
      CROSS JOIN (
        VALUES
          ('SELECT'::TEXT), ('INSERT'::TEXT), ('UPDATE'::TEXT),
          ('DELETE'::TEXT), ('TRUNCATE'::TEXT), ('REFERENCES'::TEXT),
          ('TRIGGER'::TEXT)
      ) AS privilege("privilegeType")
      WHERE namespace."schemaName" <> 'public'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND pg_catalog.has_table_privilege(
          current_user, relation.oid, privilege."privilegeType"
        )
    ) AS "unexpectedExtraSchemaRelationPrivilegeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_class AS relation
      INNER JOIN candidate_namespaces AS namespace
        ON namespace.oid = relation.relnamespace
      INNER JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = relation.oid
      CROSS JOIN (
        VALUES
          ('SELECT'::TEXT), ('INSERT'::TEXT), ('UPDATE'::TEXT),
          ('REFERENCES'::TEXT)
      ) AS privilege("privilegeType")
      WHERE namespace."schemaName" <> 'public'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND attribute.attnum > 0 AND NOT attribute.attisdropped
        AND pg_catalog.has_column_privilege(
          current_user,
          relation.oid,
          attribute.attnum,
          privilege."privilegeType"
        )
    ) AS "unexpectedExtraSchemaColumnPrivilegeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_class AS sequence
      INNER JOIN candidate_namespaces AS namespace
        ON namespace.oid = sequence.relnamespace
      CROSS JOIN (
        VALUES ('USAGE'::TEXT), ('SELECT'::TEXT), ('UPDATE'::TEXT)
      ) AS privilege("privilegeType")
      WHERE namespace."schemaName" <> 'public'
        AND sequence.relkind = 'S'
        AND pg_catalog.has_sequence_privilege(
          current_user, sequence.oid, privilege."privilegeType"
        )
    ) AS "unexpectedExtraSchemaSequencePrivilegeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_proc AS routine
      INNER JOIN candidate_namespaces AS namespace
        ON namespace.oid = routine.pronamespace
      WHERE namespace."schemaName" <> 'public'
        AND pg_catalog.has_function_privilege(
          current_user, routine.oid, 'EXECUTE'
        )
    ) AS "unexpectedExtraSchemaRoutinePrivilegeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM expected_effective_type_grants AS expected
      LEFT JOIN actual_effective_type_grants AS actual
        ON actual."schemaName" = expected."schemaName"
       AND actual."typeName" = expected."typeName"
      WHERE actual."typeName" IS NULL
    ) AS "missingEffectiveTypePrivilegeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM actual_effective_type_grants AS actual
      LEFT JOIN expected_effective_type_grants AS expected
        ON expected."schemaName" = actual."schemaName"
       AND expected."typeName" = actual."typeName"
      WHERE expected."typeName" IS NULL
    ) AS "unexpectedEffectiveTypePrivilegeCount",
    (
      SELECT (database_row.datdba = role.oid)
      FROM pg_catalog.pg_database AS database_row
      WHERE database_row.datname = pg_catalog.current_database()
    ) AS "ownsDatabase",
    (
      SELECT (namespace.nspowner = role.oid)
      FROM pg_catalog.pg_namespace AS namespace
      WHERE namespace.nspname = 'public'
    ) AS "ownsPublicSchema",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_class AS relation
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relowner = role.oid
    ) AS "ownedPublicRelationCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_proc AS routine
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname = 'public' AND routine.proowner = role.oid
    ) AS "ownedPublicRoutineCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_type AS type_row
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = type_row.typnamespace
      WHERE namespace.nspname = 'public' AND type_row.typowner = role.oid
    ) AS "ownedPublicTypeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM candidate_namespaces AS namespace
      WHERE namespace."schemaName" <> 'public'
        AND namespace.oid IN (
          SELECT owned_namespace.oid
          FROM pg_catalog.pg_namespace AS owned_namespace
          WHERE owned_namespace.nspowner = role.oid
        )
    ) AS "ownedExtraSchemaCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_class AS relation
      INNER JOIN candidate_namespaces AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace."schemaName" <> 'public'
        AND relation.relowner = role.oid
    ) AS "ownedExtraSchemaRelationCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_proc AS routine
      INNER JOIN candidate_namespaces AS namespace
        ON namespace.oid = routine.pronamespace
      WHERE namespace."schemaName" <> 'public'
        AND routine.proowner = role.oid
    ) AS "ownedExtraSchemaRoutineCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_type AS type_row
      INNER JOIN candidate_namespaces AS namespace
        ON namespace.oid = type_row.typnamespace
      WHERE namespace."schemaName" <> 'public'
        AND type_row.typowner = role.oid
    ) AS "ownedExtraSchemaTypeCount",
    (
      SELECT pg_catalog.count(*)::INTEGER
      FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.datname = pg_catalog.current_database()
        AND activity.backend_type = 'client backend'
        AND activity.pid <> pg_catalog.pg_backend_pid()
    ) AS "otherSessionCount"
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = current_user
`;

async function querySnapshot(client, tenantId, { locked }) {
  const identity = (await client.query(IDENTITY_SQL)).rows[0];
  if (locked) {
    await client.query(TRUSTED_LOCK_FUNCTION_CALL_SQL, [tenantId]);
  }
  const tenant = await client.query(
    `SELECT "id" FROM public."Tenant" WHERE "id" = $1`,
    [tenantId],
  );
  const users = await client.query(
    `SELECT
       "id",
       "role"::TEXT AS "role",
       "accessScope"::TEXT AS "accessScope",
       "isActive",
       "isPlatformAdmin",
       "updatedAt"
     FROM public."User"
     WHERE "tenantId" = $1
     ORDER BY "id" COLLATE "C"`,
    [tenantId],
  );
  const stores = await client.query(
    `SELECT "id", "isActive"
     FROM public."Store"
     WHERE "tenantId" = $1
     ORDER BY "id" COLLATE "C"`,
    [tenantId],
  );
  const accessRows = await client.query(
    `SELECT
       access."id",
       access."userId",
       access."storeId",
       access."createdAt"
     FROM public."UserStoreAccess" AS access
     INNER JOIN public."User" AS subject ON subject."id" = access."userId"
     WHERE subject."tenantId" = $1
     ORDER BY access."userId" COLLATE "C", access."storeId" COLLATE "C", access."id" COLLATE "C"`,
    [tenantId],
  );
  return {
    accessRows: accessRows.rows,
    identity,
    stores: stores.rows,
    tenantExists: tenant.rowCount === 1,
    users: users.rows,
  };
}

async function queryAudit(client, { action, requestId, tenantId }) {
  const result = await client.query(
    `SELECT
       "action", "requestId", "targetType", "targetId", "reason",
       "before", "after", "metadata"
     FROM public."PlatformAdminAuditEvent"
     WHERE "tenantId" = $1 AND "action" = $2 AND "requestId" = $3`,
    [tenantId, action, requestId],
  );
  if (result.rowCount > 1) fail("ACCESS_SCOPE_DURABLE_AUDIT_DUPLICATE");
  return result.rows[0] ?? null;
}

async function setTransactionBounds(client) {
  await client.query("SET LOCAL statement_timeout = '15s'");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
}

export function createPgAccessScopeAdapter({ databaseUrl, target: rawTarget }) {
  const target = normalizeAccessScopeTarget(rawTarget);
  assertAccessScopeRestoredCopyDatabaseUrl(databaseUrl, target);
  const { Client } = pg;
  const connect = async () => {
    const client = new Client({
      application_name: "leetplus_access_scope_classifier_v1",
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
      query_timeout: 20000,
    });
    await client.connect();
    return client;
  };
  const readSnapshot = async ({ tenantId }) => {
    const client = await connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await setTransactionBounds(client);
      await client.query(
        "SELECT pg_catalog.pg_advisory_xact_lock_shared(hashtext($1), hashtext($2))",
        [ACCESS_SCOPE_CLASSIFICATION_CONTRACT, tenantId],
      );
      const snapshot = await querySnapshot(client, tenantId, { locked: false });
      await client.query("COMMIT");
      return snapshot;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await client.end().catch(() => undefined);
    }
  };
  const readAudit = async ({ action, requestId, tenantId }) => {
    const client = await connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await setTransactionBounds(client);
      const result = await queryAudit(client, { action, requestId, tenantId });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await client.end().catch(() => undefined);
    }
  };
  const withSerializableTransaction = async ({ tenantId }, operation) => {
    const client = await connect();
    let committed = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
      await setTransactionBounds(client);
      await client.query(
        "SELECT pg_catalog.pg_advisory_xact_lock(hashtext($1), hashtext($2))",
        [ACCESS_SCOPE_CLASSIFICATION_CONTRACT, tenantId],
      );
      const transaction = {
        applyMutations: async ({ mutations, tenantId: exactTenantId }) => {
          for (const mutation of [...mutations].sort((left, right) =>
            left.userId.localeCompare(right.userId),
          )) {
            const updated = await client.query(
              `UPDATE public."User"
               SET "accessScope" = $1::public."UserAccessScope", "updatedAt" = $2::timestamptz
               WHERE "tenantId" = $3 AND "id" = $4`,
              [
                mutation.accessScope,
                mutation.updatedAt,
                exactTenantId,
                mutation.userId,
              ],
            );
            if (updated.rowCount !== 1) fail("ACCESS_SCOPE_MUTATION_USER_MISMATCH");
            await client.query(
              `DELETE FROM public."UserStoreAccess" WHERE "userId" = $1`,
              [mutation.userId],
            );
            for (const access of mutation.accessRows) {
              await client.query(
                `INSERT INTO public."UserStoreAccess" ("id", "userId", "storeId", "createdAt")
                 VALUES ($1, $2, $3, $4::timestamptz)`,
                [access.id, mutation.userId, access.storeId, access.createdAt],
              );
            }
          }
        },
        insertAudit: async ({ audit, auditId, tenantId: exactTenantId }) => {
          await client.query(
            `INSERT INTO public."PlatformAdminAuditEvent"
               ("id", "tenantId", "actorUserId", "requestId", "action",
                "targetType", "targetId", "reason", "before", "after", "metadata", "createdAt")
             VALUES ($1, $2, NULL, $3, $4, $5, $6, $7,
                     $8::jsonb, $9::jsonb, $10::jsonb, clock_timestamp())`,
            [
              auditId,
              exactTenantId,
              audit.requestId,
              audit.action,
              audit.targetType,
              audit.targetId,
              audit.reason,
              JSON.stringify(audit.before),
              JSON.stringify(audit.after),
              JSON.stringify(audit.metadata),
            ],
          );
        },
        readAudit: (input) => queryAudit(client, input),
        readLockedSnapshot: ({ tenantId: exactTenantId }) =>
          querySnapshot(client, exactTenantId, { locked: true }),
      };
      const result = await operation(transaction);
      await client.query("COMMIT");
      committed = true;
      return result;
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await client.end().catch(() => undefined);
    }
  };
  return Object.freeze({ readAudit, readSnapshot, withSerializableTransaction });
}

export const accessScopeClassificationInternals = Object.freeze({
  auditProjection,
  digest,
  identitySql: IDENTITY_SQL,
  normalizeIdentity,
  posixPermissionMask: POSIX_PERMISSION_MASK,
  projectSnapshot,
  trustedLockFunctionCallSql: TRUSTED_LOCK_FUNCTION_CALL_SQL,
  trustedLockFunctionOwner: TRUSTED_LOCK_OWNER,
  trustedLockFunctionSource: TRUSTED_LOCK_FUNCTION_SOURCE,
  validateApproval,
  validateInventory,
  validatePlan,
});
