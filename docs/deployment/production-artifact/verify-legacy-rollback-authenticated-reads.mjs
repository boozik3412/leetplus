#!/usr/bin/env node

// Authenticated, read-only application/DB smoke for the exact N-1 runtime.
// Secrets are read from a root-only file and are never emitted.

import { constants as fsConstants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import process from "node:process";

const EXACT_URL = "http://127.0.0.1:4300";
const PRODUCTION_URLS = new Set([
  EXACT_URL,
  "http://127.0.0.1:4100",
  "http://127.0.0.1:4200",
  "https://api.leetplus.ru",
]);
const EXACT_CREDENTIALS = "/etc/leetplus/legacy-rollback-smoke.env";
const EXACT_DATABASE_TARGET = "/etc/leetplus/legacy-drain-database-target.conf";
const EXACT_PG_SERVICE_FILE = "/etc/leetplus/pg_service.conf";
const EXACT_PG_SERVICE = "leetplus-drain-audit";
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_ORACLE_BYTES = 1024 * 1024;
const READS = Object.freeze([
  ["stores", "/stores"],
  ["assortment-summary", "/products/summary"],
  ["staff-checklist-templates", "/staff/checklist-templates?status=all"],
  ["staff-knowledge-base", "/staff/knowledge-base"],
  ["gamification-loot-boxes", "/guests/gamification/loot-boxes"],
  ["gamification-missions", "/guests/gamification/missions"],
  ["gamification-seasons", "/guests/gamification/seasons"],
  ["users-roles", "/users"],
]);
const EXACT_ROLE_OPTION_ROLES = Object.freeze([
  "ADMIN", "MANAGER", "CLUB_MANAGER", "MARKETER", "STANDARDS_MANAGER",
  "BUYER", "SENIOR_ADMINISTRATOR", "CLUB_ADMINISTRATOR", "TRAINEE",
]);
const EXACT_CAPABILITY_KEYS = Object.freeze([
  "view_dashboard", "view_reports", "view_assortment_reports", "export_reports",
  "manage_assortment_reports", "view_assortment_products", "view_assortment_catalog",
  "view_assortment_stores", "view_guests", "export_guests", "manage_guest_crm",
  "view_guest_gamification", "manage_guest_game_rules", "approve_guest_game_rewards",
  "operate_guest_game_ledger",
  "view_guest_game_pii", "view_marketing", "manage_marketing", "view_communications",
  "manage_communications", "view_staff", "view_staff_shift_workspace", "view_staff_tasks",
  "manage_staff_tasks", "view_staff_standards", "manage_staff_standards",
  "view_staff_training", "manage_staff_training", "view_staff_knowledge",
  "view_staff_control", "manage_staff_control", "view_staff_directory",
  "manage_staff_directory", "view_staff_salary", "manage_staff_salary",
  "edit_staff_knowledge", "review_staff_knowledge", "publish_staff_knowledge",
  "manage_users", "manage_integrations", "run_sync", "import_guest_foundation",
  "import_data", "use_utilities",
  "edit_products", "edit_catalog", "edit_stores",
]);
const LEGACY_CAPABILITY_KEYS = Object.freeze([
  "view_dashboard", "view_reports", "view_assortment_reports", "export_reports",
  "manage_assortment_reports", "view_assortment_products", "view_assortment_catalog",
  "view_assortment_stores", "view_guests", "export_guests", "manage_guest_crm",
  "view_guest_gamification", "manage_guest_game_rules", "approve_guest_game_rewards",
  "view_guest_game_pii", "view_marketing", "manage_marketing", "view_communications",
  "manage_communications", "view_staff", "view_staff_shift_workspace", "view_staff_tasks",
  "manage_staff_tasks", "view_staff_standards", "manage_staff_standards",
  "view_staff_training", "manage_staff_training", "view_staff_knowledge",
  "view_staff_control", "manage_staff_control", "view_staff_directory",
  "manage_staff_directory", "view_staff_salary", "manage_staff_salary",
  "edit_staff_knowledge", "review_staff_knowledge", "publish_staff_knowledge",
  "manage_users", "manage_integrations", "run_sync", "import_data", "use_utilities",
  "edit_products", "edit_catalog", "edit_stores",
]);
const LEGACY_ROLE_OPTION_ROLES = Object.freeze([
  "OWNER", "ADMIN", "MANAGER", "CLUB_MANAGER", "MARKETER", "STANDARDS_MANAGER",
  "BUYER", "SENIOR_ADMINISTRATOR", "CLUB_ADMINISTRATOR", "TRAINEE",
]);
// These digests bind the immutable 7de04ff4 N-1 response generation observed
// through the loopback auth edge. Compatibility is additionally gated by the
// exact legacy auth shape and cannot authorize an unknown catalog generation.
const LEGACY_CAPABILITY_OPTIONS_SHA256 =
  "b238ae71a18b0e6b816ca253a9d464aebeb0c7fac637447e94797bf45a56aa36";
const LEGACY_ROLE_OPTIONS_SHA256 =
  "5cfa7103e06632e4ab7fe54ce4b716f8a8984794fae9e1781b656803150a18e5";

function fail(code) {
  process.stderr.write(`verify-legacy-rollback-authenticated-reads: ${code}\n`);
  process.exit(1);
}

let baseUrl = EXACT_URL;
let credentialsPath = EXACT_CREDENTIALS;
let databaseOraclePath = "";
let testMode = false;
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--unprivileged-test-mode") {
    testMode = true;
  } else if (argument === "--base-url") {
    baseUrl = process.argv[++index] ?? "";
  } else if (argument === "--credentials") {
    credentialsPath = process.argv[++index] ?? "";
  } else if (argument === "--database-oracle") {
    databaseOraclePath = process.argv[++index] ?? "";
  } else {
    fail("UNKNOWN_ARGUMENT");
  }
}

if (testMode) {
  if (process.getuid?.() === 0) fail("TEST_MODE_FORBIDDEN_FOR_ROOT");
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u.test(baseUrl)) {
    fail("TEST_URL_NOT_LOOPBACK");
  }
  if (!databaseOraclePath) fail("TEST_DATABASE_ORACLE_REQUIRED");
} else {
  if (process.getuid?.() !== 0) fail("PRODUCTION_REQUIRES_ROOT");
  if (!PRODUCTION_URLS.has(baseUrl) || credentialsPath !== EXACT_CREDENTIALS || databaseOraclePath) {
    fail("PRODUCTION_INPUT_OVERRIDE_FORBIDDEN");
  }
}

for (const key of [
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
  "http_proxy", "https_proxy", "all_proxy", "no_proxy",
  "NODE_USE_ENV_PROXY", "NODE_OPTIONS", "NODE_PATH", "NODE_EXTRA_CA_CERTS",
  "NODE_DEBUG", "NODE_V8_COVERAGE", "NODE_COMPILE_CACHE", "SSLKEYLOGFILE",
  "LD_PRELOAD", "LD_LIBRARY_PATH", "LD_AUDIT", "GCONV_PATH", "LOCPATH",
  "OPENSSL_CONF", "OPENSSL_MODULES",
  "BASH_ENV", "ENV", "CURL_HOME", "CURL_CA_BUNDLE", "SSL_CERT_FILE", "SSL_CERT_DIR",
]) {
  if (process.env[key]) fail(`UNSAFE_ENVIRONMENT_${key.toUpperCase()}`);
}

let credentialText;
let credentialHandle;
try {
  credentialHandle = await open(
    credentialsPath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  const credentialStat = await credentialHandle.stat();
  if (!credentialStat.isFile() || credentialStat.nlink !== 1) {
    fail("CREDENTIAL_FILE_UNSAFE");
  }
  if (!testMode && (credentialStat.uid !== 0 || (credentialStat.mode & 0o077) !== 0)) {
    fail("CREDENTIAL_FILE_PERMISSIONS_UNSAFE");
  }
  credentialText = await credentialHandle.readFile("utf8");
} catch {
  fail("CREDENTIAL_FILE_UNREADABLE");
} finally {
  await credentialHandle?.close();
}

const credentials = new Map();
for (const rawLine of credentialText.split(/\r?\n/u)) {
  if (!rawLine || rawLine.startsWith("#")) continue;
  const separator = rawLine.indexOf("=");
  if (separator < 1) fail("CREDENTIAL_FILE_MALFORMED");
  const key = rawLine.slice(0, separator);
  const value = rawLine.slice(separator + 1);
  if (!/^[A-Z][A-Z0-9_]*$/u.test(key) || !value || credentials.has(key)) {
    fail("CREDENTIAL_FILE_MALFORMED");
  }
  credentials.set(key, value);
}
const exactCredentialKeys = Object.freeze([
  "EMAIL",
  "PASSWORD",
  "TENANT_SLUG",
  "EXPECTED_TENANT_ID_SHA256",
  "EXPECTED_STORE_IDS_SHA256",
  "EXPECTED_ROLE_OPTIONS_SHA256",
  "EXPECTED_CAPABILITY_OPTIONS_SHA256",
  "MIN_ASSORTMENT_TOTAL_SKU",
  "MIN_STAFF_ROWS",
  "MIN_GAMIFICATION_CONFIG_ITEMS",
]);
if (
  credentials.size !== exactCredentialKeys.length ||
  exactCredentialKeys.some((key) => !credentials.has(key)) ||
  !credentials.get("EMAIL")?.includes("@") ||
  (credentials.get("PASSWORD")?.length ?? 0) < 8 ||
  !/^[a-z0-9][a-z0-9-]{1,62}$/u.test(credentials.get("TENANT_SLUG") ?? "") ||
  !/^[0-9a-f]{64}$/u.test(credentials.get("EXPECTED_TENANT_ID_SHA256") ?? "") ||
  !/^[0-9a-f]{64}$/u.test(credentials.get("EXPECTED_STORE_IDS_SHA256") ?? "") ||
  !/^[0-9a-f]{64}$/u.test(credentials.get("EXPECTED_ROLE_OPTIONS_SHA256") ?? "") ||
  !/^[0-9a-f]{64}$/u.test(credentials.get("EXPECTED_CAPABILITY_OPTIONS_SHA256") ?? "") ||
  !["MIN_ASSORTMENT_TOTAL_SKU", "MIN_STAFF_ROWS", "MIN_GAMIFICATION_CONFIG_ITEMS"]
    .every((key) => /^[1-9][0-9]{0,8}$/u.test(credentials.get(key) ?? ""))
) {
  fail("CREDENTIAL_CONTRACT_INVALID");
}
const minimumAssortmentTotalSku = Number(credentials.get("MIN_ASSORTMENT_TOTAL_SKU"));
const minimumStaffRows = Number(credentials.get("MIN_STAFF_ROWS"));
const minimumGamificationConfigItems = Number(credentials.get("MIN_GAMIFICATION_CONFIG_ITEMS"));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hasCompatibleNetworkScopeShape(record) {
  if (!record || typeof record !== "object") return false;
  const hasAccessScope = Object.hasOwn(record, "accessScope");
  const hasAllowedStoreIds = Object.hasOwn(record, "allowedStoreIds");

  // The admitted exact N-1 predates these response fields. Its canary scope is
  // independently proven by the database oracle before tenant reads are checked.
  if (!hasAccessScope && !hasAllowedStoreIds) return true;
  return hasAccessScope && hasAllowedStoreIds &&
    record.accessScope === "NETWORK" &&
    Array.isArray(record.allowedStoreIds) && record.allowedStoreIds.length === 0;
}

function hasCompatibleStaffAccessScope(record, legacyCanaryScopeOmitted) {
  if (!record || typeof record !== "object") return false;

  // The admitted exact N-1 predates this report field. Its NETWORK boundary is
  // independently proven by its matching legacy auth shape, exact store
  // topology and read-only DB oracle.
  if (!Object.hasOwn(record, "accessScope")) return legacyCanaryScopeOmitted;
  return ["NETWORK", "STORES"].includes(record.accessScope);
}

async function readProtectedFile(path, failureCode, { rootOnly = false } = {}) {
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const fileStat = await handle.stat();
    if (!fileStat.isFile() || fileStat.nlink !== 1) fail(`${failureCode}_UNSAFE`);
    if (rootOnly && (fileStat.uid !== 0 || (fileStat.mode & 0o077) !== 0)) {
      fail(`${failureCode}_PERMISSIONS_UNSAFE`);
    }
    const bytes = await handle.readFile();
    if (bytes.byteLength < 2 || bytes.byteLength > MAX_ORACLE_BYTES) {
      fail(`${failureCode}_SIZE_INVALID`);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    fail(`${failureCode}_UNREADABLE`);
  } finally {
    await handle?.close();
  }
}

function parseExactDatabaseTarget(text) {
  const target = new Map();
  for (const rawLine of text.split(/\r?\n/u)) {
    if (!rawLine || rawLine.startsWith("#")) continue;
    const separator = rawLine.indexOf("=");
    if (separator < 1) fail("DATABASE_TARGET_MALFORMED");
    const key = rawLine.slice(0, separator);
    const value = rawLine.slice(separator + 1);
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key) || !/^[A-Za-z0-9_.:-]+$/u.test(value) || target.has(key)) {
      fail("DATABASE_TARGET_MALFORMED");
    }
    target.set(key, value);
  }
  const exactKeys = [
    "DATABASE_NAME", "DATABASE_SERVER_ADDRESS", "DATABASE_SERVER_PORT",
    "DATABASE_SYSTEM_IDENTIFIER", "AUDIT_SESSION_USER", "FENCE_SESSION_USER",
    "FENCE_AUTHORITY_ROLE", "FENCE_FUNCTION_SCHEMA", "FENCE_FUNCTION_NAME",
  ];
  if (
    target.size !== exactKeys.length || exactKeys.some((key) => !target.has(key)) ||
    target.get("DATABASE_NAME") !== "leetplus" ||
    target.get("DATABASE_SERVER_ADDRESS") !== "127.0.0.1" ||
    target.get("DATABASE_SERVER_PORT") !== "5432" ||
    !/^[1-9][0-9]{15,24}$/u.test(target.get("DATABASE_SYSTEM_IDENTIFIER") ?? "") ||
    target.get("AUDIT_SESSION_USER") !== "leetplus_drain_audit" ||
    target.get("FENCE_SESSION_USER") !== "leetplus_role_fencer" ||
    target.get("FENCE_AUTHORITY_ROLE") !== "leetplus_fence_authority" ||
    target.get("FENCE_FUNCTION_SCHEMA") !== "leetplus_ops" ||
    target.get("FENCE_FUNCTION_NAME") !== "apply_nminus1_legacy_login_fence"
  ) fail("DATABASE_TARGET_INVALID");
  return target;
}

function hasExactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

function isSortedUniqueStringArray(values) {
  return Array.isArray(values) &&
    values.every((value) => typeof value === "string" && value) &&
    new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || values[index - 1].localeCompare(value) < 0);
}

function validateOracle(oracle, target) {
  const arrays = [
    oracle?.storeIds, oracle?.checklistIds, oracle?.checklistNetworkIds,
    oracle?.knowledgeIds, oracle?.knowledgeNetworkIds, oracle?.lootBoxIds,
    oracle?.missionIds, oracle?.seasonIds, oracle?.channelIds,
  ];
  if (
    !oracle || typeof oracle !== "object" || Array.isArray(oracle) ||
    Object.keys(oracle).sort().join("|") !== [
      "channelIds", "checklistIds", "checklistNetworkIds", "customRoles",
      "databaseAddress", "databaseName", "databasePort", "databaseReadOnly",
      "databaseSystemIdentifier", "invites", "knowledgeIds", "knowledgeNetworkIds",
      "activeProductCount", "lootBoxIds", "missionIds", "roleOverrides", "seasonIds",
      "sessionUser", "storeIds", "tenantId", "tenantSlug", "users",
    ].sort().join("|") ||
    !arrays.every(isSortedUniqueStringArray) ||
    !Array.isArray(oracle.users) || !Array.isArray(oracle.customRoles) ||
    !Array.isArray(oracle.invites) || !Array.isArray(oracle.roleOverrides) ||
    !Number.isInteger(oracle.activeProductCount) || oracle.activeProductCount < 1 ||
    oracle.storeIds.length !== 4 || oracle.users.length < 1 ||
    oracle.checklistIds.length + oracle.knowledgeIds.length < 1 ||
    oracle.lootBoxIds.length + oracle.missionIds.length + oracle.seasonIds.length < 1 ||
    oracle.channelIds.length < 1 ||
    oracle.tenantSlug !== credentials.get("TENANT_SLUG") ||
    typeof oracle.tenantId !== "string" || !oracle.tenantId ||
    sha256(oracle.tenantId) !== credentials.get("EXPECTED_TENANT_ID_SHA256") ||
    sha256(`${oracle.storeIds.join("\n")}\n`) !== credentials.get("EXPECTED_STORE_IDS_SHA256") ||
    oracle.databaseName !== target.get("DATABASE_NAME") ||
    oracle.databaseAddress !== target.get("DATABASE_SERVER_ADDRESS") ||
    String(oracle.databasePort) !== target.get("DATABASE_SERVER_PORT") ||
    oracle.databaseSystemIdentifier !== target.get("DATABASE_SYSTEM_IDENTIFIER") ||
    oracle.sessionUser !== target.get("AUDIT_SESSION_USER") || oracle.databaseReadOnly !== true
  ) fail("DATABASE_ORACLE_INVALID");

  const storeSet = new Set(oracle.storeIds);
  const customRoleSet = new Set(oracle.customRoles.map((role) => role?.id));
  const validScopedRecord = (record) =>
    ["NETWORK", "STORES"].includes(record.accessScope) &&
    isSortedUniqueStringArray(record.storeIds) && record.storeIds.every((id) => storeSet.has(id)) &&
    (record.accessScope === "NETWORK" ? record.storeIds.length === 0 : record.storeIds.length > 0) &&
    (record.customRoleId === null || (record.role === "CLUB_ADMINISTRATOR" && customRoleSet.has(record.customRoleId)));
  if (
    oracle.customRoles.some((role) =>
      !hasExactKeys(role, ["id", "name", "permissions"]) ||
      typeof role.id !== "string" || !role.id || typeof role.name !== "string" || !role.name ||
      !isSortedUniqueStringArray(role.permissions)
    ) ||
    new Set(oracle.customRoles.map((role) => role.id)).size !== oracle.customRoles.length ||
    oracle.customRoles.some((role, index) => index > 0 && oracle.customRoles[index - 1].id.localeCompare(role.id) >= 0) ||
    oracle.users.some((user) =>
      !hasExactKeys(user, ["accessScope", "customRoleId", "id", "isActive", "isPlatformAdmin", "role", "storeIds"]) ||
      typeof user.id !== "string" || !user.id || typeof user.role !== "string" || !user.role ||
      typeof user.isActive !== "boolean" || typeof user.isPlatformAdmin !== "boolean" ||
      (user.customRoleId !== null && (typeof user.customRoleId !== "string" || !user.customRoleId)) ||
      !validScopedRecord(user)
    ) ||
    new Set(oracle.users.map((user) => user.id)).size !== oracle.users.length ||
    oracle.users.some((user, index) => index > 0 && oracle.users[index - 1].id.localeCompare(user.id) >= 0) ||
    oracle.invites.some((invite) =>
      !hasExactKeys(invite, ["accessScope", "customRoleId", "id", "role", "storeIds"]) ||
      typeof invite.id !== "string" || !invite.id || typeof invite.role !== "string" || !invite.role ||
      (invite.customRoleId !== null && (typeof invite.customRoleId !== "string" || !invite.customRoleId)) ||
      !validScopedRecord(invite)
    ) ||
    new Set(oracle.invites.map((invite) => invite.id)).size !== oracle.invites.length ||
    oracle.invites.some((invite, index) => index > 0 && oracle.invites[index - 1].id.localeCompare(invite.id) >= 0) ||
    oracle.roleOverrides.some((override) =>
      !hasExactKeys(override, ["permissions", "role"]) || typeof override.role !== "string" || !override.role ||
      !isSortedUniqueStringArray(override.permissions)
    ) ||
    new Set(oracle.roleOverrides.map((override) => override.role)).size !== oracle.roleOverrides.length ||
    oracle.roleOverrides.some((override, index) => index > 0 && oracle.roleOverrides[index - 1].role.localeCompare(override.role) >= 0)
  ) fail("DATABASE_AUTHORITY_ORACLE_INVALID");

  return Object.freeze({
    ...oracle,
    customRoleIds: oracle.customRoles.map((role) => role.id),
    inviteIds: oracle.invites.map((invite) => invite.id),
    userIds: oracle.users.map((user) => user.id),
  });
}

const oracleSql = String.raw`
\getenv tenant_slug LEETPLUS_ORACLE_TENANT_SLUG
\getenv canary_email LEETPLUS_ORACLE_CANARY_EMAIL
BEGIN TRANSACTION READ ONLY;
WITH target_tenant AS MATERIALIZED (
  SELECT "id", "slug" FROM public."Tenant" WHERE "slug" = :'tenant_slug'
), canary_user AS MATERIALIZED (
  SELECT "id" FROM public."User"
  WHERE "tenantId" = (SELECT "id" FROM target_tenant)
    AND lower("email") = lower(:'canary_email')
    AND "role" = 'ADMIN' AND "accessScope" = 'NETWORK'
    AND "isActive" AND NOT "isPlatformAdmin"
), baseline AS (
  SELECT pg_catalog.jsonb_build_object(
    'databaseName', pg_catalog.current_database(),
    'databaseAddress', pg_catalog.host(pg_catalog.inet_server_addr()),
    'databasePort', pg_catalog.inet_server_port(),
    'databaseSystemIdentifier', (SELECT system_identifier::text FROM pg_catalog.pg_control_system()),
    'sessionUser', session_user::text,
    'databaseReadOnly', pg_catalog.current_setting('transaction_read_only') = 'on',
    'tenantId', (SELECT "id" FROM target_tenant),
    'tenantSlug', (SELECT "slug" FROM target_tenant),
    'storeIds', COALESCE((SELECT pg_catalog.jsonb_agg("id" ORDER BY "id") FROM public."Store"
      WHERE "tenantId" = (SELECT "id" FROM target_tenant)), '[]'::jsonb),
    'activeProductCount', (SELECT count(*) FROM public."Product"
      WHERE "tenantId" = (SELECT "id" FROM target_tenant) AND "isActive"),
    'users', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', account."id", 'role', account."role"::text,
      'accessScope', account."accessScope"::text, 'customRoleId', account."customRoleId",
      'isActive', account."isActive", 'isPlatformAdmin', account."isPlatformAdmin",
      'storeIds', COALESCE((SELECT pg_catalog.jsonb_agg(access."storeId" ORDER BY access."storeId")
        FROM public."UserStoreAccess" access WHERE access."userId" = account."id"), '[]'::jsonb)
    ) ORDER BY account."id") FROM public."User" account
      WHERE account."tenantId" = (SELECT "id" FROM target_tenant)), '[]'::jsonb),
    'customRoles', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', custom_role."id", 'name', custom_role."name",
      'permissions', COALESCE((SELECT pg_catalog.jsonb_agg(permission ORDER BY permission)
        FROM pg_catalog.unnest(custom_role."permissions") permission), '[]'::jsonb)
    ) ORDER BY custom_role."id") FROM public."UserAccessRole" custom_role
      WHERE custom_role."tenantId" = (SELECT "id" FROM target_tenant)), '[]'::jsonb),
    'roleOverrides', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'role', role_override."role"::text,
      'permissions', COALESCE((SELECT pg_catalog.jsonb_agg(permission ORDER BY permission)
        FROM pg_catalog.unnest(role_override."permissions") permission), '[]'::jsonb)
    ) ORDER BY role_override."role"::text) FROM public."UserRoleOverride" role_override
      WHERE role_override."tenantId" = (SELECT "id" FROM target_tenant)), '[]'::jsonb),
    'invites', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', visible_invites."id", 'role', visible_invites."role"::text,
      'accessScope', visible_invites."accessScope"::text, 'customRoleId', visible_invites."customRoleId",
      'storeIds', COALESCE((SELECT pg_catalog.jsonb_agg(store_id ORDER BY store_id)
        FROM pg_catalog.unnest(visible_invites."storeIds") store_id), '[]'::jsonb)
    ) ORDER BY visible_invites."id") FROM (
      SELECT "id", "role", "accessScope", "customRoleId", "storeIds" FROM public."UserInvite"
      WHERE "tenantId" = (SELECT "id" FROM target_tenant)
        AND "acceptedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" > pg_catalog.statement_timestamp()
      ORDER BY "createdAt" DESC, "id" ASC LIMIT 20
    ) visible_invites), '[]'::jsonb),
    'checklistIds', COALESCE((SELECT pg_catalog.jsonb_agg("id" ORDER BY "id") FROM (
      SELECT "id" FROM public."StaffChecklistTemplate"
      WHERE "tenantId" = (SELECT "id" FROM target_tenant)
      ORDER BY "status" ASC, "updatedAt" DESC LIMIT 200
    ) visible_checklists), '[]'::jsonb),
    'checklistNetworkIds', COALESCE((SELECT pg_catalog.jsonb_agg("id" ORDER BY "id") FROM (
      SELECT "id" FROM public."StaffChecklistTemplate"
      WHERE "tenantId" = (SELECT "id" FROM target_tenant) AND "storeId" IS NULL
      ORDER BY "status" ASC, "updatedAt" DESC LIMIT 200
    ) network_checklists), '[]'::jsonb),
    'knowledgeIds', COALESCE((SELECT pg_catalog.jsonb_agg("id" ORDER BY "id") FROM (
      SELECT "id" FROM public."StaffKnowledgeArticle"
      WHERE "tenantId" = (SELECT "id" FROM target_tenant)
      ORDER BY "status" ASC, "folder" ASC, "category" ASC, "updatedAt" DESC LIMIT 300
    ) visible_knowledge), '[]'::jsonb),
    'knowledgeNetworkIds', COALESCE((SELECT pg_catalog.jsonb_agg("id" ORDER BY "id") FROM (
      SELECT "id" FROM public."StaffKnowledgeArticle"
      WHERE "tenantId" = (SELECT "id" FROM target_tenant) AND "storeId" IS NULL
      ORDER BY "status" ASC, "folder" ASC, "category" ASC, "updatedAt" DESC LIMIT 300
    ) network_knowledge), '[]'::jsonb),
    'lootBoxIds', COALESCE((SELECT pg_catalog.jsonb_agg("id" ORDER BY "id") FROM public."GuestGameLootBox"
      WHERE "tenantId" = (SELECT "id" FROM target_tenant)), '[]'::jsonb),
    'missionIds', COALESCE((SELECT pg_catalog.jsonb_agg("id" ORDER BY "id") FROM public."GuestGameMission"
      WHERE "tenantId" = (SELECT "id" FROM target_tenant)), '[]'::jsonb),
    'seasonIds', COALESCE((SELECT pg_catalog.jsonb_agg("id" ORDER BY "id") FROM public."GuestGameSeason"
      WHERE "tenantId" = (SELECT "id" FROM target_tenant)), '[]'::jsonb),
    'channelIds', COALESCE((SELECT pg_catalog.jsonb_agg(channel."id" ORDER BY channel."id")
      FROM public."StaffChatChannel" channel
      WHERE channel."tenantId" = (SELECT "id" FROM target_tenant) AND NOT channel."isArchived"
        AND (channel."name" <> 'Геймификация' OR EXISTS (
          SELECT 1 FROM public."StaffChatChannelMember" member
          WHERE member."channelId" = channel."id" AND member."userId" = (SELECT "id" FROM canary_user)
        ))), '[]'::jsonb)
  ) AS value
)
SELECT value::text FROM baseline
WHERE (SELECT count(*) FROM target_tenant) = 1 AND (SELECT count(*) FROM canary_user) = 1;
COMMIT;
`;

async function loadDatabaseOracle() {
  let target;
  let rawOracle;
  if (testMode) {
    target = new Map([
      ["DATABASE_NAME", "leetplus"], ["DATABASE_SERVER_ADDRESS", "127.0.0.1"],
      ["DATABASE_SERVER_PORT", "5432"], ["DATABASE_SYSTEM_IDENTIFIER", "1234567890123456"],
      ["AUDIT_SESSION_USER", "leetplus_drain_audit"],
    ]);
    rawOracle = await readProtectedFile(databaseOraclePath, "TEST_DATABASE_ORACLE");
  } else {
    target = parseExactDatabaseTarget(await readProtectedFile(EXACT_DATABASE_TARGET, "DATABASE_TARGET", { rootOnly: true }));
    const psqlArguments = [
      "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align",
    ];
    if (psqlArguments.some((argument) =>
      argument.includes(credentials.get("TENANT_SLUG")) || argument.includes(credentials.get("EMAIL")))) {
      fail("DATABASE_ORACLE_PII_IN_CHILD_ARGV");
    }
    const psql = spawnSync("/usr/bin/psql", psqlArguments, {
      encoding: "utf8",
      env: {
        LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
        PGCONNECT_TIMEOUT: "5",
        PGOPTIONS: "-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000 -c default_transaction_read_only=on",
        PGSERVICE: EXACT_PG_SERVICE, PGSERVICEFILE: EXACT_PG_SERVICE_FILE, TZ: "UTC",
        LEETPLUS_ORACLE_CANARY_EMAIL: credentials.get("EMAIL"),
        LEETPLUS_ORACLE_TENANT_SLUG: credentials.get("TENANT_SLUG"),
      },
      input: oracleSql,
      maxBuffer: MAX_ORACLE_BYTES,
      timeout: 20_000,
    });
    if (psql.error || psql.status !== 0 || psql.signal || psql.stderr) fail("DATABASE_ORACLE_QUERY_FAILED");
    rawOracle = psql.stdout.trim().split(/\r?\n/u).find((line) => line.startsWith("{")) ?? "";
  }
  let oracle;
  try { oracle = JSON.parse(rawOracle); } catch { fail("DATABASE_ORACLE_JSON_INVALID"); }
  return validateOracle(oracle, target);
}

function exactIdSet(values, expected) {
  if (!Array.isArray(values)) return false;
  const ids = values.map((value) => value?.id);
  return ids.every((id) => typeof id === "string" && id) &&
    new Set(ids).size === ids.length &&
    [...ids].sort().join("\n") === expected.join("\n");
}

const databaseOracleBefore = await loadDatabaseOracle();

async function request(path, { body, method = "GET", token } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      method,
      redirect: "manual",
      signal: controller.signal,
    });
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_BODY_BYTES) fail("BODY_TOO_LARGE");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES) fail("BODY_TOO_LARGE");
    return {
      contentType: response.headers.get("content-type") ?? "",
      status: response.status,
      text: new TextDecoder().decode(bytes),
    };
  } catch (error) {
    if (error?.name === "AbortError") fail("REQUEST_TIMEOUT");
    fail("REQUEST_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

async function requestFirstServerEvent(path, { token } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let reader;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (response.status !== 200 || !/^text\/event-stream(?:;|$)/iu.test(contentType)) {
      fail("COMMUNICATIONS_LIVE_READ_FAILED");
    }
    reader = response.body?.getReader();
    if (!reader) fail("COMMUNICATIONS_LIVE_READ_INVALID");
    const decoder = new TextDecoder();
    let buffered = "";
    let totalBytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) fail("COMMUNICATIONS_LIVE_READ_INVALID");
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) fail("BODY_TOO_LARGE");
      buffered += decoder.decode(chunk.value, { stream: true });
      const boundary = buffered.search(/\r?\n\r?\n/u);
      if (boundary < 0) continue;
      const block = buffered.slice(0, boundary);
      const event = block.split(/\r?\n/u)
        .filter((line) => line.startsWith("event:"))
        .map((line) => line.slice("event:".length).trim());
      const data = block.split(/\r?\n/u)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trimStart());
      if (event.length !== 1 || data.length < 1) {
        fail("COMMUNICATIONS_LIVE_READ_INVALID");
      }
      await reader.cancel();
      return { data: data.join("\n"), event: event[0] };
    }
  } catch (error) {
    if (error?.name === "AbortError") fail("COMMUNICATIONS_LIVE_READ_TIMEOUT");
    fail("COMMUNICATIONS_LIVE_READ_FAILED");
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => {});
  }
}

function json(response, reason) {
  if (!/^application\/json(?:;|$)/iu.test(response.contentType)) fail(reason);
  try {
    return JSON.parse(response.text);
  } catch {
    fail(reason);
  }
}

const login = await request("/auth/login", {
  body: {
    email: credentials.get("EMAIL"),
    password: credentials.get("PASSWORD"),
  },
  method: "POST",
});
if (![200, 201].includes(login.status)) fail("LOGIN_FAILED");
const loginBody = json(login, "LOGIN_RESPONSE_INVALID");
const token = loginBody?.accessToken;
if (
  typeof token !== "string" ||
  token.length < 20 ||
  loginBody?.user?.tenantSlug !== credentials.get("TENANT_SLUG") ||
  typeof loginBody?.user?.tenantId !== "string" || !loginBody.user.tenantId ||
  sha256(loginBody.user.tenantId) !== credentials.get("EXPECTED_TENANT_ID_SHA256") ||
  loginBody?.user?.role !== "ADMIN" || !hasCompatibleNetworkScopeShape(loginBody?.user) ||
  loginBody?.user?.isPlatformAdmin === true
) {
  fail("LOGIN_SCOPE_INVALID");
}

for (const [name, path] of [["auth-me", "/auth/me"], ...READS]) {
  const unauthenticated = await request(path);
  if (![401, 403].includes(unauthenticated.status)) {
    fail(`UNAUTHENTICATED_READ_${name.replaceAll("-", "_").toUpperCase()}_EXPOSED`);
  }
}

const me = await request("/auth/me", { token });
if (me.status !== 200) fail("AUTH_ME_FAILED");
const meBody = json(me, "AUTH_ME_RESPONSE_INVALID");
if (
  meBody?.tenantSlug !== credentials.get("TENANT_SLUG") ||
  typeof meBody?.tenantId !== "string" || !meBody.tenantId ||
  meBody.tenantId !== loginBody.user.tenantId ||
  sha256(meBody.tenantId) !== credentials.get("EXPECTED_TENANT_ID_SHA256") ||
  meBody?.role !== "ADMIN" || !hasCompatibleNetworkScopeShape(meBody) ||
  meBody?.isPlatformAdmin === true
) {
  fail("AUTH_ME_SCOPE_INVALID");
}
const legacyCanaryScopeOmitted = [loginBody.user, meBody].every((record) =>
  !Object.hasOwn(record, "accessScope") && !Object.hasOwn(record, "allowedStoreIds")
);

const criticalBodies = new Map();
for (const [name, path] of READS) {
  const response = await request(path, { token });
  if (response.status !== 200 || !/^application\/json(?:;|$)/iu.test(response.contentType)) {
    fail(`CRITICAL_READ_${name.replaceAll("-", "_").toUpperCase()}_FAILED`);
  }
  criticalBodies.set(name, json(response, `CRITICAL_READ_${name.replaceAll("-", "_").toUpperCase()}_INVALID`));
}

const stores = criticalBodies.get("stores");
if (
  !Array.isArray(stores) || stores.length !== 4 ||
  stores.some((store) =>
    typeof store?.id !== "string" || !store.id ||
    typeof store?.name !== "string" || !store.name ||
    typeof store?.isActive !== "boolean" ||
    store?.tenantId !== meBody.tenantId
  ) ||
  new Set(stores.map((store) => store.id)).size !== 4 ||
  !exactIdSet(stores, databaseOracleBefore.storeIds)
) fail("STORES_TOPOLOGY_INVALID");
const exactStoreIds = new Set(stores.map((store) => store.id));
const storeIdsDigest = sha256(`${[...exactStoreIds].sort().join("\n")}\n`);
if (storeIdsDigest !== credentials.get("EXPECTED_STORE_IDS_SHA256")) {
  fail("STORES_BASELINE_DIGEST_INVALID");
}

function exactStoreSet(storeList) {
  return Array.isArray(storeList) && storeList.length === exactStoreIds.size &&
    new Set(storeList.map((store) => store?.id)).size === exactStoreIds.size &&
    storeList.every((store) => exactStoreIds.has(store?.id));
}

function exactStoreSubset(storeList) {
  return Array.isArray(storeList) &&
    new Set(storeList.map((store) => store?.id)).size === storeList.length &&
    storeList.every((store) => exactStoreIds.has(store?.id));
}

const summary = criticalBodies.get("assortment-summary");
if (
  !summary || typeof summary !== "object" ||
  !["totalSku", "operationalActiveSku", "categorizedSku", "suppliedSku"]
    .every((key) => Number.isInteger(summary[key]) && summary[key] >= 0) ||
  summary.totalSku < minimumAssortmentTotalSku ||
  summary.totalSku !== databaseOracleBefore.activeProductCount ||
  ["operationalActiveSku", "categorizedSku", "suppliedSku"]
    .some((key) => summary[key] > summary.totalSku)
) fail("ASSORTMENT_SUMMARY_SHAPE_INVALID");

function validStoreReference(store) {
  return store === null || (
    store && typeof store === "object" && exactStoreIds.has(store.id) &&
    typeof store.name === "string" && typeof store.isActive === "boolean"
  );
}

function validStaffBase(body) {
  return body && typeof body === "object" && !Array.isArray(body) &&
    Array.isArray(body.rows) && Array.isArray(body.stores) &&
    exactStoreSet(body.stores) &&
    body.summary && typeof body.summary === "object" &&
    body.filters && typeof body.filters === "object" &&
    body.rows.every((row) =>
      row && typeof row === "object" && typeof row.id === "string" && row.id &&
      Object.hasOwn(row, "store") &&
      validStoreReference(row.store ?? null)
    );
}

const checklist = criticalBodies.get("staff-checklist-templates");
if (
  !validStaffBase(checklist) ||
  !hasCompatibleStaffAccessScope(checklist, legacyCanaryScopeOmitted) ||
  !["total", "draft", "active", "archived"].every((key) =>
    Number.isInteger(checklist.summary[key]) && checklist.summary[key] >= 0
  ) ||
  !Array.isArray(checklist.publishedRegulations) ||
  checklist.publishedRegulations.some((row) => !validStoreReference(row?.store ?? null))
) fail("STAFF_ORACLE_STAFF_CHECKLIST_TEMPLATES_INVALID");
if (
  !exactIdSet(checklist.rows, databaseOracleBefore.checklistIds) ||
  !exactIdSet(checklist.rows.filter((row) => row.store === null), databaseOracleBefore.checklistNetworkIds)
) fail("STAFF_CHECKLIST_DATABASE_ORACLE_INVALID");

const knowledge = criticalBodies.get("staff-knowledge-base");
if (
  !validStaffBase(knowledge) ||
  !hasCompatibleStaffAccessScope(knowledge, legacyCanaryScopeOmitted) ||
  !["total", "published", "draft", "archived"].every((key) =>
    Number.isInteger(knowledge.summary[key]) && knowledge.summary[key] >= 0
  ) ||
  !knowledge.settings || typeof knowledge.settings !== "object" ||
  !Array.isArray(knowledge.articleSuggestions) ||
  knowledge.articleSuggestions.some((row) => !validStoreReference(row?.store ?? null))
) fail("STAFF_ORACLE_STAFF_KNOWLEDGE_BASE_INVALID");
if (
  !exactIdSet(knowledge.rows, databaseOracleBefore.knowledgeIds) ||
  !exactIdSet(knowledge.rows.filter((row) => row.store === null), databaseOracleBefore.knowledgeNetworkIds)
) fail("STAFF_KNOWLEDGE_DATABASE_ORACLE_INVALID");
if (checklist.rows.length + knowledge.rows.length < minimumStaffRows) {
  fail("STAFF_BASELINE_EMPTY");
}

// The exact N-1 GET /staff/notifications synchronizes signals for NETWORK
// administrative canaries, so it is deliberately excluded from a read-only
// gate. The no-query team-chat SSE path calls getLiveState without selecting
// the reporting channel, which keeps its reconciliation branch unreachable.
const communicationsEvent = await requestFirstServerEvent(
  "/staff/team-chat/events",
  { token },
);
let communications;
try {
  communications = JSON.parse(communicationsEvent.data);
} catch {
  fail("COMMUNICATIONS_LIVE_READ_INVALID");
}
if (
  communicationsEvent.event !== "team-chat-state" ||
  !communications || typeof communications !== "object" ||
  typeof communications.generatedAt !== "string" ||
  !Number.isFinite(Date.parse(communications.generatedAt)) ||
  communications.activeChannelId !== null ||
  !communications.summary || typeof communications.summary !== "object" ||
  !["channels", "messages", "pinned", "unread"].every((key) =>
    Number.isInteger(communications.summary[key]) && communications.summary[key] >= 0
  ) ||
  !Array.isArray(communications.channels) || communications.channels.length < 1 ||
  communications.summary.channels !== communications.channels.length ||
  new Set(communications.channels.map((channel) => channel?.id)).size !== communications.channels.length ||
  !exactIdSet(communications.channels, databaseOracleBefore.channelIds) ||
  communications.channels.some((channel) =>
    !channel || typeof channel.id !== "string" || !channel.id ||
    typeof channel.updatedAt !== "string" || !Number.isFinite(Date.parse(channel.updatedAt)) ||
    !["messagesCount", "unreadCount", "mentionUnreadCount", "pinnedCount"].every((key) =>
      Number.isInteger(channel[key]) && channel[key] >= 0
    ) ||
    (channel.lastMessageAt !== null &&
      (typeof channel.lastMessageAt !== "string" || !Number.isFinite(Date.parse(channel.lastMessageAt))))
  )
) fail("COMMUNICATIONS_LIVE_READ_INVALID");

const lootBoxes = criticalBodies.get("gamification-loot-boxes");
const missions = criticalBodies.get("gamification-missions");
const seasons = criticalBodies.get("gamification-seasons");
if (
  !exactIdSet(lootBoxes, databaseOracleBefore.lootBoxIds) ||
  !exactIdSet(missions, databaseOracleBefore.missionIds) ||
  !exactIdSet(seasons, databaseOracleBefore.seasonIds) ||
  lootBoxes.length + missions.length + seasons.length < minimumGamificationConfigItems
) fail("GAMIFICATION_DATABASE_ORACLE_INVALID");

const users = criticalBodies.get("users-roles");
const capabilityOptions = users?.capabilityOptions;
const capabilityOptionsDigest = Array.isArray(capabilityOptions)
  ? sha256(JSON.stringify(capabilityOptions.map(({ description, key, label }) => ({ description, key, label }))))
  : "";
const hasExactCapabilityCatalog = (expectedKeys, expectedDigest) =>
  Array.isArray(capabilityOptions) && capabilityOptions.length === expectedKeys.length &&
  capabilityOptions.every((capability, index) =>
    capability && typeof capability.key === "string" && capability.key &&
    capability.key === expectedKeys[index] &&
    typeof capability.label === "string" && capability.label &&
    typeof capability.description === "string" && capability.description
  ) &&
  new Set(capabilityOptions.map((capability) => capability.key)).size === capabilityOptions.length &&
  capabilityOptionsDigest === expectedDigest;
const currentCapabilityCatalogAccepted = hasExactCapabilityCatalog(
  EXACT_CAPABILITY_KEYS,
  credentials.get("EXPECTED_CAPABILITY_OPTIONS_SHA256"),
);
const legacyCapabilityCatalogAccepted = legacyCanaryScopeOmitted && hasExactCapabilityCatalog(
  LEGACY_CAPABILITY_KEYS,
  testMode
    ? credentials.get("EXPECTED_CAPABILITY_OPTIONS_SHA256")
    : LEGACY_CAPABILITY_OPTIONS_SHA256,
);
if (!currentCapabilityCatalogAccepted && !legacyCapabilityCatalogAccepted) {
  fail("CAPABILITY_CATALOG_INVALID");
}
const capabilityKeys = capabilityOptions.map((capability) => capability.key);
const capabilityKeySet = new Set(capabilityKeys);
const validPermissions = (permissions) =>
  Array.isArray(permissions) && new Set(permissions).size === permissions.length &&
  permissions.every((permission) => typeof permission === "string" && capabilityKeySet.has(permission));

const hasExactRoleOptionCatalog = (expectedRoles, expectedDigest) =>
  Array.isArray(users?.roleOptions) && users.roleOptions.length === expectedRoles.length &&
  users.roleOptions.every((role, index) =>
    role && role.role === expectedRoles[index] &&
    typeof role.label === "string" && role.label &&
    typeof role.description === "string" && role.description &&
    validPermissions(role.permissions) && typeof role.isOverridden === "boolean" &&
    (role.isOverridden
      ? typeof role.updatedAt === "string" && Number.isFinite(Date.parse(role.updatedAt))
      : role.updatedAt === null)
  ) &&
  sha256(JSON.stringify(users.roleOptions.map(({ description, isOverridden, label, permissions, role }) =>
    ({ description, isOverridden, label, permissions, role })))) === expectedDigest;
const currentRoleOptionCatalogAccepted = hasExactRoleOptionCatalog(
  EXACT_ROLE_OPTION_ROLES,
  credentials.get("EXPECTED_ROLE_OPTIONS_SHA256"),
);
const legacyRoleOptionCatalogAccepted = legacyCanaryScopeOmitted && hasExactRoleOptionCatalog(
  LEGACY_ROLE_OPTION_ROLES,
  testMode ? credentials.get("EXPECTED_ROLE_OPTIONS_SHA256") : LEGACY_ROLE_OPTIONS_SHA256,
);
if (!currentRoleOptionCatalogAccepted && !legacyRoleOptionCatalogAccepted) {
  fail("USERS_SCOPE_SHAPE_INVALID");
}
if (
  currentCapabilityCatalogAccepted !== currentRoleOptionCatalogAccepted ||
  legacyCapabilityCatalogAccepted !== legacyRoleOptionCatalogAccepted
) {
  fail("USERS_CATALOG_GENERATION_MISMATCH");
}
const usersCatalogGeneration = legacyCapabilityCatalogAccepted ? "LEGACY_7DE04FF4" : "CURRENT";
const hasCompatibleUserPlatformAdminFlag = (user) =>
  user?.isPlatformAdmin === false ||
  (usersCatalogGeneration === "LEGACY_7DE04FF4" && user?.isPlatformAdmin === true);

if (
  !users || typeof users !== "object" ||
  !Array.isArray(users.users) || users.users.length < 1 ||
  !exactStoreSet(users.stores)
) fail("USERS_SCOPE_SHAPE_INVALID");
if (
  users.users.some((user) =>
    !user || typeof user.id !== "string" || !user.id ||
    typeof user.email !== "string" || !user.email.includes("@") ||
    typeof user.role !== "string" || !user.role ||
    !validPermissions(user.permissions) || typeof user.isActive !== "boolean" ||
    !hasCompatibleUserPlatformAdminFlag(user) || !["NETWORK", "STORES"].includes(user.scope) ||
    (user.customRoleId !== null && (typeof user.customRoleId !== "string" || !user.customRoleId)) ||
    !exactStoreSubset(user.stores) || (user.scope === "NETWORK" && user.stores.length !== 0) ||
    (user.scope === "STORES" && user.stores.length === 0)
  )
) fail("USERS_USER_SCOPE_SHAPE_INVALID");
if (!users.users.some((user) =>
    user.email.toLowerCase() === credentials.get("EMAIL").toLowerCase() &&
    user.role === "ADMIN" && user.scope === "NETWORK" && user.isActive === true
  )) fail("USERS_CANARY_INVALID");
if (
  !Array.isArray(users.customRoles) ||
  users.customRoles.some((role) =>
    !role || typeof role.id !== "string" || !role.id ||
    typeof role.name !== "string" || !role.name || !validPermissions(role.permissions)
  )
) fail("USERS_CUSTOM_ROLE_SHAPE_INVALID");
if (
  !Array.isArray(users.invites) ||
  users.invites.some((invite) =>
    !invite || typeof invite.id !== "string" || !invite.id ||
    typeof invite.role !== "string" || !invite.role ||
    (invite.customRoleId !== null && (typeof invite.customRoleId !== "string" || !invite.customRoleId)) ||
    !["NETWORK", "STORES"].includes(invite.scope) || !exactStoreSubset(invite.stores) ||
    (invite.scope === "NETWORK" && invite.stores.length !== 0) ||
    (invite.scope === "STORES" && invite.stores.length === 0)
  )
) fail("USERS_INVITE_SHAPE_INVALID");
if (
  !exactIdSet(users.users, databaseOracleBefore.userIds) ||
  !exactIdSet(users.customRoles, databaseOracleBefore.customRoleIds) ||
  !exactIdSet(users.invites, databaseOracleBefore.inviteIds)
) fail("USERS_DATABASE_ORACLE_INVALID");

const userAuthority = [...users.users].sort((left, right) => left.id.localeCompare(right.id)).map((user) => ({
  accessScope: user.scope,
  customRoleId: user.customRoleId,
  id: user.id,
  isActive: user.isActive,
  isPlatformAdmin: user.isPlatformAdmin,
  role: user.role,
  storeIds: user.stores.map((store) => store.id).sort(),
}));
const customRoleAuthority = [...users.customRoles].sort((left, right) => left.id.localeCompare(right.id)).map((role) => ({
  id: role.id,
  name: role.name,
  permissions: [...role.permissions].sort(),
}));
const inviteAuthority = [...users.invites].sort((left, right) => left.id.localeCompare(right.id)).map((invite) => ({
  accessScope: invite.scope,
  customRoleId: invite.customRoleId,
  id: invite.id,
  role: invite.role,
  storeIds: invite.stores.map((store) => store.id).sort(),
}));
const databaseUserAuthority = databaseOracleBefore.users.map((user) => ({
  accessScope: user.accessScope,
  customRoleId: user.customRoleId,
  id: user.id,
  isActive: user.isActive,
  isPlatformAdmin: user.isPlatformAdmin,
  role: user.role,
  storeIds: user.storeIds,
}));
const databaseCustomRoleAuthority = databaseOracleBefore.customRoles.map((role) => ({
  id: role.id,
  name: role.name,
  permissions: role.permissions,
}));
const databaseInviteAuthority = databaseOracleBefore.invites.map((invite) => ({
  accessScope: invite.accessScope,
  customRoleId: invite.customRoleId,
  id: invite.id,
  role: invite.role,
  storeIds: invite.storeIds,
}));
if (JSON.stringify(userAuthority) !== JSON.stringify(databaseUserAuthority)) {
  const authorityFields = [
    "accessScope", "customRoleId", "id", "isActive", "isPlatformAdmin", "role", "storeIds",
  ];
  const driftFields = authorityFields.filter((field) =>
    userAuthority.some((user, index) =>
      JSON.stringify(user[field]) !== JSON.stringify(databaseUserAuthority[index]?.[field]))
  );
  process.stderr.write(
    `verify-legacy-rollback-authenticated-reads: USERS_DATABASE_AUTHORITY_FIELD_DRIFT=${driftFields.join(",")}\n`,
  );
  fail("USERS_DATABASE_AUTHORITY_INVALID");
}
if (JSON.stringify(customRoleAuthority) !== JSON.stringify(databaseCustomRoleAuthority)) {
  fail("CUSTOM_ROLES_DATABASE_AUTHORITY_INVALID");
}
if (JSON.stringify(inviteAuthority) !== JSON.stringify(databaseInviteAuthority)) {
  fail("INVITES_DATABASE_AUTHORITY_INVALID");
}

const roleOptionByRole = new Map(users.roleOptions.map((role) => [role.role, role]));
const customRoleById = new Map(users.customRoles.map((role) => [role.id, role]));
const overriddenRoles = new Set(databaseOracleBefore.roleOverrides.map((override) => override.role));
if (
  databaseOracleBefore.customRoles.some((role) => role.permissions.some((permission) => !capabilityKeySet.has(permission))) ||
  databaseOracleBefore.roleOverrides.some((override) =>
    override.permissions.some((permission) => !capabilityKeySet.has(permission))) ||
  users.roleOptions.some((role) => role.isOverridden !== overriddenRoles.has(role.role)) ||
  databaseOracleBefore.roleOverrides.some((override) => {
    const roleOption = roleOptionByRole.get(override.role);
    return !roleOption || override.permissions.some((permission) => !roleOption.permissions.includes(permission));
  })
) {
  fail("ROLE_OVERRIDE_DATABASE_AUTHORITY_INVALID");
}
for (const user of users.users) {
  let expectedPermissions;
  if (user.customRoleId !== null) {
    const customRole = customRoleById.get(user.customRoleId);
    if (!customRole || user.role !== "CLUB_ADMINISTRATOR" ||
      user.customRole?.id !== customRole.id ||
      JSON.stringify([...(user.customRole?.permissions ?? [])].sort()) !== JSON.stringify([...customRole.permissions].sort())) {
      fail("USER_CUSTOM_ROLE_AUTHORITY_INVALID");
    }
    expectedPermissions = [...customRole.permissions].sort();
  } else if (user.role === "OWNER") {
    if (user.customRole !== null) fail("USER_CUSTOM_ROLE_AUTHORITY_INVALID");
    expectedPermissions = [...capabilityKeys].sort();
  } else {
    if (user.customRole !== null) fail("USER_CUSTOM_ROLE_AUTHORITY_INVALID");
    const roleOption = roleOptionByRole.get(user.role);
    if (!roleOption) fail("USER_SYSTEM_ROLE_AUTHORITY_INVALID");
    expectedPermissions = [...roleOption.permissions].sort();
  }
  if (JSON.stringify([...user.permissions].sort()) !== JSON.stringify(expectedPermissions)) {
    fail("USER_EFFECTIVE_PERMISSIONS_INVALID");
  }
}
for (const invite of users.invites) {
  const expectedCustomRole = invite.customRoleId === null ? null : customRoleById.get(invite.customRoleId);
  if (
    (expectedCustomRole === null && invite.customRole !== null) ||
    (expectedCustomRole && (invite.role !== "CLUB_ADMINISTRATOR" || invite.customRole?.id !== expectedCustomRole.id ||
      JSON.stringify([...(invite.customRole?.permissions ?? [])].sort()) !==
        JSON.stringify([...expectedCustomRole.permissions].sort())))
  ) fail("INVITE_CUSTOM_ROLE_AUTHORITY_INVALID");
}

const databaseOracleAfter = await loadDatabaseOracle();
if (JSON.stringify(databaseOracleAfter) !== JSON.stringify(databaseOracleBefore)) {
  fail("DATABASE_ORACLE_CHANGED_DURING_SMOKE");
}

process.stdout.write("LEGACY_ROLLBACK_AUTHENTICATED_READS_ACCEPTED=true\n");
process.stdout.write(`LEGACY_ROLLBACK_AUTHENTICATED_READS_USERS_CATALOG=${usersCatalogGeneration}\n`);
process.stdout.write(`LEGACY_ROLLBACK_AUTHENTICATED_READS_STORE_COUNT=${exactStoreIds.size}\n`);
