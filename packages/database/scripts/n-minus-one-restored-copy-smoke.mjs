import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import pg from "pg";

export const N_MINUS_ONE_CONTRACT =
  "LEETPLUS_N_MINUS_ONE_RESTORED_COPY_SMOKE_V1";
export const N_MINUS_ONE_SCHEDULER_CONTRACT =
  "LEETPLUS_N_MINUS_ONE_SCHEDULER_COMPATIBILITY_V1";
export const N_MINUS_ONE_LEGACY_SHA =
  "7de04ff4ccc814494810730be3fa6bf661097b07";
export const N_MINUS_ONE_PASS = "PASS";
export const N_MINUS_ONE_FAIL = "FAIL";

const SAFE_DATABASE = /^leetplus_restored_[a-z0-9_]{3,48}$/u;
const SAFE_SCHEDULER_DATABASE =
  /^leetplus_restored_scheduler_[a-z0-9_]{3,36}$/u;
const SAFE_MIGRATION = /^\d{14}_[a-z0-9_]{3,100}$/u;
const SAFE_TENANT_SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/u;
const SYSTEM_IDENTIFIER = /^\d{10,24}$/u;
const LOOPBACK = "127.0.0.1";
const MAX_HTTP_BYTES = 2 * 1024 * 1024;
const MAX_RUNTIME_LOG_BYTES = 64 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const SCHEDULER_COMPATIBILITY_DURATION_MS = 36_000;
const SCHEDULER_QUERY_COVERAGE_PREFIX =
  "N_MINUS_ONE_SCHEDULER_QUERY_COVERAGE_V1 ";
const childStartupFailures = new WeakSet();
const SAFE_INHERITED_ENVIRONMENT_KEYS = Object.freeze([
  "COMSPEC",
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "Path",
  "PATHEXT",
  "SYSTEMROOT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
  "USERPROFILE",
  "WINDIR",
]);
const SAFE_WINDOWS_ABSOLUTE_ENVIRONMENT_KEYS = Object.freeze([
  "APPDATA",
  "LOCALAPPDATA",
]);
const PREPARE_COMMAND_STAGE_REASON_PREFIX = Object.freeze({
  API_BUILD: "N_MINUS_ONE_PREPARE_API_BUILD",
  GIT_OBJECT: "N_MINUS_ONE_PREPARE_GIT_OBJECT",
  PNPM_INSTALL: "N_MINUS_ONE_PREPARE_PNPM_INSTALL",
  PRISMA_GENERATE: "N_MINUS_ONE_PREPARE_PRISMA_GENERATE",
  WORKTREE_ADD: "N_MINUS_ONE_PREPARE_WORKTREE_ADD",
});

export const N_MINUS_ONE_CRITICAL_READS = Object.freeze([
  Object.freeze({ name: "stores", path: "/stores" }),
  Object.freeze({ name: "assortment-summary", path: "/products/summary" }),
  Object.freeze({
    name: "staff-checklist-templates",
    path: "/staff/checklist-templates?status=all",
  }),
  Object.freeze({
    name: "staff-knowledge-base",
    path: "/staff/knowledge-base",
  }),
  Object.freeze({
    name: "staff-notifications",
    path: "/staff/notifications",
  }),
  Object.freeze({
    name: "gamification-workspace",
    path: "/guests/gamification/workspace",
  }),
  Object.freeze({ name: "users-roles", path: "/users" }),
]);

export const N_MINUS_ONE_FORCED_RUNTIME_POLICY = Object.freeze({
  ACCESS_SCOPE_ENFORCEMENT_MODE: "ENFORCED",
  DESIGN_PARTNER_ISOLATED_MODE: "false",
  FOUNDER_OPERATOR_BETA_MODE: "DISABLED",
  GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED: "false",
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN: "true",
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: "false",
  GUEST_GAME_BOT_CONSUMER_DRY_RUN: "true",
  GUEST_GAME_BOT_CONSUMER_ENABLED: "false",
  GUEST_GAME_DELIVERY_REAL_SEND_ENABLED: "false",
  GUEST_GAME_DELIVERY_TELEGRAM_ENABLED: "false",
  GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH: "true",
  GUEST_GAME_LEDGER_FALLBACK_MODE: "OFF",
  GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH: "true",
  GUEST_GAME_LOOT_BOX_RECOVERY_MODE: "OFF",
  GUEST_GAME_MAX_DELIVERY_ENABLED: "false",
  GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED: "false",
  GUEST_GAME_MONITORING_ENABLED: "false",
  GUEST_GAME_PIPELINE_BACKFILL_KILL_SWITCH: "true",
  GUEST_GAME_PIPELINE_BACKFILL_MODE: "OFF",
  GUEST_GAME_PIPELINE_SCHEDULER_ENABLED: "false",
  GUEST_GAME_RETENTION_LIVE_ENABLED: "false",
  GUEST_GAME_RETENTION_SCHEDULER_ENABLED: "false",
  GUEST_GAME_REWARD_MATERIALIZER_ENABLED: "false",
  GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH: "true",
  GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED: "false",
  GUEST_GAME_SUPPLEMENTAL_PIPELINE_KILL_SWITCH: "true",
  GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE: "OFF",
  GUEST_GAME_TELEGRAM_DELIVERY_ENABLED: "false",
  GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED: "false",
  GUEST_GAME_TG_EDGE_ADAPTER_ENABLED: "false",
  GUEST_GAME_TG_EDGE_DRY_RUN: "true",
  GUEST_GAME_TG_EDGE_POLLER_ENABLED: "false",
  GUEST_GAME_TG_EDGE_POLLING_DELETE_WEBHOOK_ON_START: "false",
  GUEST_PORTAL_DEV_OTP_ENABLED: "false",
  GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED: "false",
  GUEST_PORTAL_OTP_MAX_ENABLED: "false",
  GUEST_PORTAL_OTP_REAL_SEND_ENABLED: "false",
  GUEST_PORTAL_OTP_SMS_ENABLED: "false",
  GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED: "false",
  GUEST_PORTAL_OTP_SMS_RU_TEST_MODE: "true",
  GUEST_PORTAL_OTP_TELEGRAM_ENABLED: "false",
  GUEST_PORTAL_USER_CALL_ENABLED: "false",
  IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_ENABLED: "false",
  IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_REAL_PROVIDER_ENABLED:
    "false",
  IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_REHEARSAL_ENABLED: "false",
  IDENTITY_MAIL_WORKER_ENABLED: "false",
  IDENTITY_MAIL_WORKER_LIVE_CANARY_ENABLED: "false",
  IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED: "false",
  LANGAME_BONUS_ACCRUAL_ENABLED: "false",
  LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: "false",
  LANGAME_INITIAL_SYNC_EXECUTION_CURRENT192_ENABLED: "false",
  LANGAME_INITIAL_SYNC_PREFLIGHT_CURRENT188_ENABLED: "false",
  LANGAME_SCHEDULED_HTTP_ENABLED: "false",
  LANGAME_STAGED_ONBOARDING_ACTIVATION_CURRENT188_ENABLED: "false",
  LANGAME_STAGED_ONBOARDING_FOUNDATION_ENABLED: "false",
  LANGAME_STAGED_ONBOARDING_RECONCILE_CURRENT188_ENABLED: "false",
  LANGAME_STAGED_ONBOARDING_STATUS_CURRENT188_ENABLED: "false",
  REPORT_DIGEST_SCHEDULED_HTTP_ENABLED: "false",
  REPORT_DIGEST_SCHEDULER_ENABLED: "false",
  STAFF_ATTACHMENT_ACL_MODE: "ENFORCED",
  STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED: "false",
  STAFF_TASK_RULES_SCHEDULER_ENABLED: "false",
  TENANT_ACTIVATION_OUTBOUND_ENABLED: "false",
});

export const N_MINUS_ONE_LEGACY_SCHEDULER_EFFECTIVE_FLAGS = Object.freeze({
  GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED: Object.freeze({
    effective: true,
    source: "LEGACY_DEFAULT_ON_WHEN_UNSET",
  }),
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: Object.freeze({
    effective: true,
    source: "PRODUCTION_EXPLICIT_TRUE",
  }),
  GUEST_GAME_PIPELINE_SCHEDULER_ENABLED: Object.freeze({
    effective: true,
    source: "LEGACY_PRODUCTION_SYNC_TOKEN_DEFAULT",
  }),
  GUEST_GAME_RETENTION_SCHEDULER_ENABLED: Object.freeze({
    effective: true,
    source: "LEGACY_DEFAULT_ON_WHEN_UNSET",
  }),
  LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: Object.freeze({
    effective: true,
    source: "LEGACY_PRODUCTION_SYNC_TOKEN_DEFAULT",
  }),
  REPORT_DIGEST_SCHEDULER_ENABLED: Object.freeze({
    effective: true,
    source: "LEGACY_PRODUCTION_SYNC_TOKEN_DEFAULT",
  }),
});

const SCHEDULER_SNAPSHOT_TABLES = Object.freeze([
  Object.freeze({
    name: "DailyDataCoverage",
    status: true,
    timestamp: "updatedAt",
  }),
  Object.freeze({
    name: "GuestActivitySyncJob",
    status: true,
    timestamp: "updatedAt",
  }),
  Object.freeze({
    name: "GuestBonusLedgerEntry",
    status: true,
    timestamp: "updatedAt",
  }),
  Object.freeze({
    name: "GuestGameDataRetentionRun",
    status: true,
    timestamp: "createdAt",
  }),
  Object.freeze({
    name: "GuestGameEntitlement",
    status: true,
    timestamp: "updatedAt",
  }),
  Object.freeze({
    name: "GuestGameEvent",
    status: false,
    timestamp: "createdAt",
  }),
  Object.freeze({
    name: "GuestGameReward",
    status: true,
    timestamp: "updatedAt",
  }),
  Object.freeze({
    name: "GuestGameRewardEffect",
    status: true,
    timestamp: "updatedAt",
  }),
  Object.freeze({
    name: "GuestGameRewardIntent",
    status: true,
    timestamp: "updatedAt",
  }),
  Object.freeze({
    name: "ReportDigestScheduleRun",
    status: true,
    timestamp: "updatedAt",
  }),
]);

export class NMinusOneSmokeError extends Error {
  constructor(reasonCode, safeMetadata = undefined) {
    super(reasonCode);
    this.name = "NMinusOneSmokeError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
    if (safeMetadata !== undefined) {
      this.safeMetadata = Object.freeze({ ...safeMetadata });
    }
  }
}

function fail(reasonCode) {
  throw new NMinusOneSmokeError(reasonCode);
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

function exactInteger(value, minimum, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(reasonCode);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeReason(error) {
  return error?.safeContractError === true
    ? error.reasonCode
    : "N_MINUS_ONE_UNEXPECTED_FAILURE";
}

function inheritSafeEnvironment(hostEnvironment = process.env) {
  const environment = {};
  for (const key of SAFE_INHERITED_ENVIRONMENT_KEYS) {
    if (typeof hostEnvironment[key] === "string") {
      environment[key] = hostEnvironment[key];
    }
  }
  return environment;
}

function assertSafeAbsoluteEnvironmentPath(value, platform, key) {
  const pathImplementation = platform === "win32" ? path.win32 : path.posix;
  const isLocalWindowsPath =
    platform !== "win32" || /^[A-Za-z]:[\\/]/u.test(value ?? "");
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 1024 ||
    value.trim() !== value ||
    /[\r\n\0]/u.test(value) ||
    !pathImplementation.isAbsolute(value) ||
    !isLocalWindowsPath
  ) {
    fail(`N_MINUS_ONE_PREPARE_WINDOWS_${key}_INVALID`);
  }
  return value;
}

export function buildNMinusOnePrepareEnvironment({
  hostEnvironment = process.env,
  platform = process.platform,
} = {}) {
  const environment = inheritSafeEnvironment(hostEnvironment);
  if (platform === "win32") {
    for (const key of SAFE_WINDOWS_ABSOLUTE_ENVIRONMENT_KEYS) {
      if (typeof hostEnvironment[key] !== "string") {
        fail(`N_MINUS_ONE_PREPARE_WINDOWS_${key}_REQUIRED`);
      }
      environment[key] = assertSafeAbsoluteEnvironmentPath(
        hostEnvironment[key],
        platform,
        key,
      );
    }
  }
  return Object.freeze({
    ...environment,
    CI: "true",
    COREPACK_ENABLE_PROJECT_SPEC: "1",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: platform === "win32" ? "NUL" : "/dev/null",
    NEXT_TELEMETRY_DISABLED: "1",
    npm_config_offline: "true",
  });
}

export function assertNMinusOneDatabaseUrl(databaseUrl) {
  if (
    typeof databaseUrl !== "string" ||
    databaseUrl.length < 20 ||
    databaseUrl.length > 4096 ||
    databaseUrl.trim() !== databaseUrl ||
    /[\r\n\0]/u.test(databaseUrl)
  ) {
    fail("N_MINUS_ONE_DATABASE_URL_INVALID");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail("N_MINUS_ONE_DATABASE_URL_INVALID");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    fail("N_MINUS_ONE_DATABASE_PROTOCOL_INVALID");
  }
  if (parsed.hostname !== LOOPBACK) {
    fail("N_MINUS_ONE_DATABASE_HOST_NOT_LOOPBACK");
  }
  if (!parsed.port) fail("N_MINUS_ONE_DATABASE_PORT_REQUIRED");
  const port = Number(parsed.port);
  exactInteger(port, 1024, 65535, "N_MINUS_ONE_DATABASE_PORT_INVALID");
  if (port === 5432) fail("N_MINUS_ONE_DATABASE_PORT_NOT_ISOLATED");
  if (!parsed.username || !parsed.password) {
    fail("N_MINUS_ONE_DATABASE_CREDENTIALS_REQUIRED");
  }
  let databaseName;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    fail("N_MINUS_ONE_DATABASE_NAME_INVALID");
  }
  exactString(
    databaseName,
    SAFE_DATABASE,
    "N_MINUS_ONE_DATABASE_NAME_NOT_ALLOWLISTED",
  );
  if (parsed.hash || parsed.pathname.slice(1).includes("/")) {
    fail("N_MINUS_ONE_DATABASE_URL_INVALID");
  }
  for (const [key, value] of parsed.searchParams) {
    const accepted =
      (key === "schema" && value === "public") ||
      (key === "sslmode" && value === "disable");
    if (!accepted) fail("N_MINUS_ONE_DATABASE_OPTION_NOT_ALLOWLISTED");
  }

  return Object.freeze({ databaseName, host: LOOPBACK, port });
}

export function assertNMinusOneRuntimePorts({ apiPort, databasePort }) {
  exactInteger(apiPort, 1024, 65535, "N_MINUS_ONE_API_PORT_INVALID");
  if ([3000, 4000, 5432, databasePort].includes(apiPort)) {
    fail("N_MINUS_ONE_API_PORT_NOT_ISOLATED");
  }
  return Object.freeze({ apiPort });
}

export function normalizeNMinusOneExpectedTarget(value) {
  const tenantSlug = exactString(
    value?.tenantSlug,
    SAFE_TENANT_SLUG,
    "N_MINUS_ONE_TENANT_SLUG_INVALID",
  );
  const expectedSystemIdentifier = exactString(
    value?.expectedSystemIdentifier,
    SYSTEM_IDENTIFIER,
    "N_MINUS_ONE_SYSTEM_IDENTIFIER_INVALID",
  );
  const expectedMigrationHead = exactString(
    value?.expectedMigrationHead,
    SAFE_MIGRATION,
    "N_MINUS_ONE_MIGRATION_HEAD_INVALID",
  );
  const expectedMigrationCount = exactInteger(
    value?.expectedMigrationCount,
    1,
    10_000,
    "N_MINUS_ONE_MIGRATION_COUNT_INVALID",
  );
  return Object.freeze({
    expectedMigrationCount,
    expectedMigrationHead,
    expectedSystemIdentifier,
    tenantSlug,
  });
}

export function buildNMinusOneRuntimeEnvironment({
  apiPort,
  databaseUrl,
  hostEnvironment = process.env,
}) {
  assertNMinusOneDatabaseUrl(databaseUrl);
  const environment = inheritSafeEnvironment(hostEnvironment);

  const ephemeral = randomBytes(48).toString("hex");
  Object.assign(environment, N_MINUS_ONE_FORCED_RUNTIME_POLICY, {
    API_URL: `http://${LOOPBACK}:${apiPort}`,
    APP_DOMAIN: "n-minus-one.invalid",
    APP_ENCRYPTION_KEY: `n-minus-one-${ephemeral}`,
    DATABASE_URL: databaseUrl,
    DADATA_API_KEY: "",
    GUEST_GAME_MAX_BOT_TOKEN: "",
    GUEST_GAME_MAX_DELIVERY_ENDPOINT: "",
    GUEST_GAME_TELEGRAM_BOT_TOKEN: "",
    GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN: "",
    GUEST_GAME_TG_EDGE_BOT_TOKEN: "",
    GUEST_PORTAL_OTP_MAX_ENDPOINT: "",
    GUEST_PORTAL_OTP_MAX_TOKEN: "",
    GUEST_PORTAL_OTP_SMS_RU_API_ID: "",
    GUEST_PORTAL_TELEGRAM_BOT_TOKEN: "",
    GUEST_PORTAL_USER_CALL_SMS_RU_API_ID: "",
    GUEST_PORTAL_USER_CALL_SECRET: "",
    JWT_SECRET: `n-minus-one-${ephemeral}`,
    LANGAME_API_KEY: "",
    LANGAME_DOMAINS: "invalid.local",
    MAIL_FROM: "n-minus-one@invalid.local",
    MAIL_HOST: LOOPBACK,
    MAIL_PASS: "",
    MAIL_PORT: "1",
    MAIL_SECURE: "false",
    MAIL_USER: "",
    NODE_ENV: "production",
    PORT: String(apiPort),
    SYNC_SERVICE_TOKEN: `n-minus-one-${ephemeral}`,
    WEB_URL: `http://${LOOPBACK}:${apiPort}`,
  });
  return environment;
}

export function buildNMinusOneSchedulerCompatibilityEnvironment({
  apiPort,
  databaseUrl,
  hostEnvironment = process.env,
}) {
  const identity = assertNMinusOneDatabaseUrl(databaseUrl);
  if (!SAFE_SCHEDULER_DATABASE.test(identity.databaseName)) {
    fail("N_MINUS_ONE_SCHEDULER_DATABASE_NAME_NOT_ALLOWLISTED");
  }
  const environment = buildNMinusOneRuntimeEnvironment({
    apiPort,
    databaseUrl,
    hostEnvironment,
  });

  // Preserve the exact production-effective legacy enablement semantics. Five
  // flags were absent in production and therefore must remain absent here;
  // their legacy services enable themselves from NODE_ENV/SYNC_SERVICE_TOKEN
  // (or unconditionally when unset). Bonus-ledger was the sole explicit true.
  for (const key of [
    "GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED",
    "GUEST_GAME_PIPELINE_SCHEDULER_ENABLED",
    "GUEST_GAME_RETENTION_SCHEDULER_ENABLED",
    "LANGAME_DAILY_SYNC_SCHEDULER_ENABLED",
    "REPORT_DIGEST_SCHEDULER_ENABLED",
  ]) {
    delete environment[key];
  }
  environment.GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED = "true";

  // Exercise each initial tick inside one bounded window. These change timing,
  // never the effective enabled/disabled matrix.
  Object.assign(environment, {
    GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN: "true",
    GUEST_GAME_BONUS_LEDGER_SCHEDULER_QUEUE_APPROVED_REWARDS: "false",
    GUEST_GAME_RETENTION_LIVE_ENABLED: "false",
    LANGAME_DAILY_SYNC_LOCAL_TIME: "00:00",
    REPORT_DIGEST_DAILY_TIME: "00:00",
    REPORT_DIGEST_SCHEDULER_WINDOW_MINUTES: "1440",
  });
  return environment;
}

export function buildLoopbackNetworkGuardSource({
  apiPort,
  databasePort,
  schedulerCompatibility = false,
}) {
  assertNMinusOneRuntimePorts({ apiPort, databasePort });
  return `"use strict";
const dgram = require("node:dgram");
const dns = require("node:dns");
const net = require("node:net");
const allowedConnectPort = ${databasePort};
const allowedListenPort = ${apiPort};
const loopback = "127.0.0.1";
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function guardedListen(...args) {
  if (typeof args[0] === "object" && args[0] !== null) {
    const options = { ...args[0] };
    if (Number(options.port) !== allowedListenPort) {
      throw new Error("N_MINUS_ONE_NETWORK_LISTEN_BLOCKED");
    }
    options.host = loopback;
    args[0] = options;
  } else {
    if (Number(args[0]) !== allowedListenPort) {
      throw new Error("N_MINUS_ONE_NETWORK_LISTEN_BLOCKED");
    }
    const callback = typeof args[1] === "function" ? args[1] : args[2];
    args = callback ? [allowedListenPort, loopback, callback] : [allowedListenPort, loopback];
  }
  return originalListen.apply(this, args);
};
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  let port;
  let host;
  if (typeof args[0] === "object" && args[0] !== null) {
    port = Number(args[0].port);
    host = args[0].host;
  } else {
    port = Number(args[0]);
    host = typeof args[1] === "string" ? args[1] : undefined;
  }
  if (port !== allowedConnectPort || host !== loopback) {
    throw new Error("N_MINUS_ONE_NETWORK_CONNECT_BLOCKED");
  }
  return originalConnect.apply(this, args);
};
const originalLookup = dns.lookup;
dns.lookup = function guardedLookup(hostname, ...args) {
  if (hostname !== loopback) {
    throw new Error("N_MINUS_ONE_DNS_LOOKUP_BLOCKED");
  }
  return originalLookup.call(this, hostname, ...args);
};
for (const method of ["resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"]) {
  if (typeof dns[method] === "function") {
    dns[method] = function blockedDnsResolve() {
      throw new Error("N_MINUS_ONE_DNS_RESOLVE_BLOCKED");
    };
  }
}
for (const method of ["connect", "send"]) {
  const original = dgram.Socket.prototype[method];
  if (typeof original === "function") {
    dgram.Socket.prototype[method] = function blockedDatagram() {
      throw new Error("N_MINUS_ONE_DATAGRAM_BLOCKED");
    };
  }
}
${
  schedulerCompatibility
    ? `const Module = require("node:module");
const originalModuleLoad = Module._load;
const queryCoverage = {
  activity: 0,
  bonusLedger: 0,
  delete: 0,
  insert: 0,
  langameDaily: 0,
  pipeline: 0,
  reportDigest: 0,
  retention: 0,
  select: 0,
  total: 0,
  update: 0,
};
function observePrismaQuery(value) {
  const query = typeof value === "string" ? value : "";
  queryCoverage.total += 1;
  const verb = /^\\s*(SELECT|INSERT|UPDATE|DELETE)\\b/iu.exec(query)?.[1]?.toLowerCase();
  if (verb && Object.prototype.hasOwnProperty.call(queryCoverage, verb)) {
    queryCoverage[verb] += 1;
  }
  if (/"GuestActivity(?:Fact|RawRecord|SourceSyncState|SyncJob|SyncState)"/u.test(query)) queryCoverage.activity += 1;
  if (/"GuestBonusLedgerEntry"/u.test(query)) queryCoverage.bonusLedger += 1;
  if (/"(?:SalesFact|GuestGameEvent|GuestGameOriginReceipt|GuestGameRewardEffect|GuestGameRewardIntent|GuestGameXpPosting)"/u.test(query)) queryCoverage.pipeline += 1;
  if (/"GuestGameDataRetention(?:Policy|Run)"/u.test(query)) queryCoverage.retention += 1;
  if (/"(?:IntegrationCredential|IntegrationSource|DailyDataCoverage)"/u.test(query)) queryCoverage.langameDaily += 1;
  if (/"ReportDigestScheduleRun"/u.test(query)) queryCoverage.reportDigest += 1;
}
let wrappedPrisma = null;
Module._load = function guardedModuleLoad(request, parent, isMain) {
  const loaded = originalModuleLoad.call(this, request, parent, isMain);
  if (request !== "@prisma/client" || !loaded?.PrismaClient) return loaded;
  if (wrappedPrisma) return wrappedPrisma;
  const OriginalPrismaClient = loaded.PrismaClient;
  class NMinusOneInstrumentedPrismaClient extends OriginalPrismaClient {
    constructor(options = {}) {
      const existingLog = Array.isArray(options.log) ? options.log : [];
      super({
        ...options,
        log: [...existingLog, { emit: "event", level: "query" }],
      });
      this.$on("query", (event) => observePrismaQuery(event?.query));
    }
  }
  wrappedPrisma = new Proxy(loaded, {
    get(target, property, receiver) {
      if (property === "PrismaClient") return NMinusOneInstrumentedPrismaClient;
      return Reflect.get(target, property, receiver);
    },
  });
  return wrappedPrisma;
};
function emitQueryCoverage() {
  const encoded = Buffer.from(JSON.stringify(queryCoverage), "utf8").toString("base64url");
  process.stdout.write("\\n" + ${JSON.stringify(SCHEDULER_QUERY_COVERAGE_PREFIX)} + encoded + "\\n");
}
setInterval(emitQueryCoverage, 1_000).unref();
process.once("beforeExit", emitQueryCoverage);
`
    : ""
}
`;
}

const SCHEDULER_COVERAGE_KEYS = Object.freeze([
  "activity",
  "bonusLedger",
  "delete",
  "insert",
  "langameDaily",
  "pipeline",
  "reportDigest",
  "retention",
  "select",
  "total",
  "update",
]);

function emptySchedulerCounter() {
  return {
    activity: 0,
    bonusLedger: 0,
    langameDaily: 0,
    pipeline: 0,
    reportDigest: 0,
    retention: 0,
  };
}

function parseSchedulerCoverage(line) {
  if (!line.startsWith(SCHEDULER_QUERY_COVERAGE_PREFIX)) return null;
  const encoded = line.slice(SCHEDULER_QUERY_COVERAGE_PREFIX.length);
  if (!/^[A-Za-z0-9_-]{10,2048}$/u.test(encoded)) return null;
  try {
    const value = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    const keys = Object.keys(value ?? {}).sort();
    if (
      keys.length !== SCHEDULER_COVERAGE_KEYS.length ||
      keys.some(
        (key, index) => key !== [...SCHEDULER_COVERAGE_KEYS].sort()[index],
      )
    ) {
      return null;
    }
    for (const key of SCHEDULER_COVERAGE_KEYS) {
      if (
        !Number.isSafeInteger(value[key]) ||
        value[key] < 0 ||
        value[key] > 1_000_000_000
      ) {
        return null;
      }
    }
    return value;
  } catch {
    return null;
  }
}

export function createNMinusOneRuntimeLogCollector({
  schedulerCompatibility = false,
} = {}) {
  const digest = createHash("sha256");
  const carries = { stderr: "", stdout: "" };
  let bytes = 0;
  let lines = 0;
  let networkBlocks = 0;
  let outputLimitExceeded = false;
  let prismaErrors = 0;
  let runtimeErrors = 0;
  let invalidCoverageMarkers = 0;
  let queryCoverage = null;
  const schedulerStarted = emptySchedulerCounter();
  const schedulerTerminal = emptySchedulerCounter();

  const observeLine = (rawLine) => {
    lines += 1;
    const line = rawLine.replace(/\u001b\[[0-9;]*m/gu, "").trim();
    if (!line) return;
    if (line.startsWith(SCHEDULER_QUERY_COVERAGE_PREFIX)) {
      const parsed = parseSchedulerCoverage(line);
      if (parsed) queryCoverage = parsed;
      else invalidCoverageMarkers += 1;
      return;
    }
    if (/N_MINUS_ONE_(?:NETWORK|DNS|DATAGRAM)_[A-Z_]*BLOCKED/u.test(line)) {
      networkBlocks += 1;
    }
    if (
      /PrismaClient(?:KnownRequest|UnknownRequest|Validation|Initialization)Error|Invalid .*invocation|column .* does not exist|relation .* does not exist/iu.test(
        line,
      )
    ) {
      prismaErrors += 1;
    }
    if (
      /UnhandledPromiseRejection|uncaught exception|FATAL ERROR/iu.test(line)
    ) {
      runtimeErrors += 1;
    }
    const starts = [
      ["activity", "Guest activity ledger queue scheduler started"],
      ["bonusLedger", "Guest bonus ledger scheduler is enabled"],
      ["pipeline", "Guest gamification pipeline scheduler started"],
      ["retention", "Guest game retention scheduler started"],
      ["langameDaily", "Langame daily sync scheduler is enabled"],
      ["reportDigest", "Report digest scheduler is enabled"],
    ];
    for (const [name, marker] of starts) {
      if (line.includes(marker)) schedulerStarted[name] += 1;
    }
    const terminals = [
      [
        "activity",
        /Guest activity ledger (?:recovery scanned|queue processed|queue tick failed)/u,
      ],
      ["bonusLedger", /Guest bonus ledger scheduler (?:finished|failed)/u],
      [
        "pipeline",
        /Guest gamification pipeline scheduler (?:finished|failed)/u,
      ],
      ["retention", /Guest game retention (?:finished|tick failed)/u],
      ["langameDaily", /Langame daily sync (?:\d{4}-\d{2}-\d{2}|failed)/u],
      [
        "reportDigest",
        /(?:Sent|Failed to send) (?:DAILY|WEEKLY) report digest/u,
      ],
    ];
    for (const [name, marker] of terminals) {
      if (marker.test(line)) schedulerTerminal[name] += 1;
    }
  };

  return Object.freeze({
    evidence() {
      return Object.freeze({
        bytes,
        invalidCoverageMarkers,
        lines,
        networkBlocks,
        outputLimitExceeded,
        outputDigest: digest.copy().digest("hex"),
        prismaErrors,
        queryCoverage: queryCoverage
          ? Object.freeze({ ...queryCoverage })
          : null,
        runtimeErrors,
        schedulerStarted: Object.freeze({ ...schedulerStarted }),
        schedulerTerminal: Object.freeze({ ...schedulerTerminal }),
      });
    },
    observe(chunk, streamName = "stdout") {
      bytes += chunk.length;
      if (bytes > MAX_RUNTIME_LOG_BYTES) outputLimitExceeded = true;
      digest.update(chunk);
      if (!schedulerCompatibility) return;
      const key = streamName === "stderr" ? "stderr" : "stdout";
      const combined = `${carries[key]}${chunk.toString("utf8")}`;
      const parts = combined.split(/\r?\n/u);
      carries[key] = parts.pop()?.slice(-16_384) ?? "";
      for (const line of parts) observeLine(line);
    },
  });
}

async function digestResponse(response) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_HTTP_BYTES) fail("N_MINUS_ONE_HTTP_BODY_TOO_LARGE");
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_HTTP_BYTES) fail("N_MINUS_ONE_HTTP_BODY_TOO_LARGE");
  return { body, bodySha256: sha256(body), bytes: body.length };
}

async function request({
  baseUrl,
  body,
  fetchImpl = fetch,
  method = "GET",
  path: requestPath,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  token,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(`${baseUrl}${requestPath}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
      redirect: "manual",
      signal: controller.signal,
    });
    const digested = await digestResponse(response);
    return {
      ...digested,
      contentType: response.headers.get("content-type") ?? "",
      status: response.status,
    };
  } catch (error) {
    if (error?.name === "AbortError") fail("N_MINUS_ONE_HTTP_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(result, reasonCode) {
  if (!/^application\/json(?:;|$)/iu.test(result.contentType)) fail(reasonCode);
  try {
    return JSON.parse(result.body.toString("utf8"));
  } catch {
    fail(reasonCode);
  }
}

function expectStatus(result, accepted, reasonCode) {
  if (!accepted.includes(result.status)) fail(reasonCode);
  return Object.freeze({
    bodySha256: result.bodySha256,
    bytes: result.bytes,
    status: result.status,
  });
}

export async function executeNMinusOneHttpSmoke({
  apiPort,
  fetchImpl = fetch,
  loginEmail,
  loginPassword,
  onFixtureCreated = () => {},
  tenantSlug,
}) {
  if (typeof loginEmail !== "string" || !loginEmail.includes("@")) {
    fail("N_MINUS_ONE_LOGIN_EMAIL_REQUIRED");
  }
  if (typeof loginPassword !== "string" || loginPassword.length < 8) {
    fail("N_MINUS_ONE_LOGIN_PASSWORD_REQUIRED");
  }
  const baseUrl = `http://${LOOPBACK}:${apiPort}`;
  const probes = [];

  const health = await request({ baseUrl, fetchImpl, path: "/health" });
  probes.push({
    name: "health",
    ...expectStatus(health, [200], "N_MINUS_ONE_HEALTH_FAILED"),
  });

  const login = await request({
    baseUrl,
    body: { email: loginEmail, password: loginPassword },
    fetchImpl,
    method: "POST",
    path: "/auth/login",
  });
  expectStatus(login, [200, 201], "N_MINUS_ONE_LOGIN_FAILED");
  const loginBody = parseJson(login, "N_MINUS_ONE_LOGIN_RESPONSE_INVALID");
  const token = loginBody?.accessToken;
  if (typeof token !== "string" || token.length < 20) {
    fail("N_MINUS_ONE_LOGIN_RESPONSE_INVALID");
  }
  if (loginBody?.user?.tenantSlug !== tenantSlug) {
    fail("N_MINUS_ONE_LOGIN_TENANT_MISMATCH");
  }
  probes.push({ name: "login", status: login.status });

  const me = await request({
    baseUrl,
    fetchImpl,
    path: "/auth/me",
    token,
  });
  expectStatus(me, [200], "N_MINUS_ONE_AUTH_ME_FAILED");
  const meBody = parseJson(me, "N_MINUS_ONE_AUTH_ME_RESPONSE_INVALID");
  if (meBody?.tenantSlug !== tenantSlug || meBody?.isPlatformAdmin === true) {
    fail("N_MINUS_ONE_AUTH_ME_TENANT_MISMATCH");
  }
  probes.push({
    name: "auth-me",
    ...expectStatus(me, [200], "N_MINUS_ONE_AUTH_ME_FAILED"),
  });

  for (const probe of N_MINUS_ONE_CRITICAL_READS) {
    const result = await request({
      baseUrl,
      fetchImpl,
      path: probe.path,
      token,
    });
    probes.push({
      name: probe.name,
      ...expectStatus(
        result,
        [200],
        `N_MINUS_ONE_CRITICAL_READ_${probe.name
          .replaceAll("-", "_")
          .toUpperCase()}_FAILED`,
      ),
    });
  }

  const fixtureMarker = randomBytes(16).toString("hex");
  const fixtureTitle = `__n_minus_one_${fixtureMarker}`;
  await onFixtureCreated({ id: null, title: fixtureTitle });
  const create = await request({
    baseUrl,
    body: {
      description: "fixture-only rollback compatibility smoke",
      roleScope: "ALL_STAFF",
      sections: [
        {
          description: null,
          id: "n-minus-one-section",
          items: [
            {
              evidenceRequired: false,
              id: "n-minus-one-item",
              instruction: null,
              required: true,
              score: 1,
              timing: {
                affectsDiscipline: false,
                mode: "NONE",
                offsetMinutes: null,
                timeOfDay: null,
                toleranceMinutes: 0,
              },
              title: "fixture-only compatibility item",
              valueType: "CHECKBOX",
            },
          ],
          title: "N-1 compatibility",
        },
      ],
      shiftKind: "CUSTOM",
      status: "DRAFT",
      storeId: null,
      title: fixtureTitle,
    },
    fetchImpl,
    method: "POST",
    path: "/staff/checklist-templates",
    token,
  });
  expectStatus(create, [200, 201], "N_MINUS_ONE_FIXTURE_CREATE_FAILED");
  const created = parseJson(
    create,
    "N_MINUS_ONE_FIXTURE_CREATE_RESPONSE_INVALID",
  );
  if (typeof created?.id !== "string" || created.title !== fixtureTitle) {
    fail("N_MINUS_ONE_FIXTURE_CREATE_RESPONSE_INVALID");
  }
  await onFixtureCreated({ id: created.id, title: fixtureTitle });
  probes.push({ name: "fixture-create", status: create.status });

  const remove = await request({
    baseUrl,
    fetchImpl,
    method: "DELETE",
    path: `/staff/checklist-templates/${encodeURIComponent(created.id)}`,
    token,
  });
  expectStatus(remove, [200], "N_MINUS_ONE_FIXTURE_DELETE_FAILED");
  const removed = parseJson(
    remove,
    "N_MINUS_ONE_FIXTURE_DELETE_RESPONSE_INVALID",
  );
  if (removed?.id !== created.id || removed?.deleted !== true) {
    fail("N_MINUS_ONE_FIXTURE_DELETE_RESPONSE_INVALID");
  }
  probes.push({ name: "fixture-delete", status: remove.status });

  return Object.freeze({
    fixture: Object.freeze({ id: created.id, title: fixtureTitle }),
    probes: Object.freeze(probes.map((probe) => Object.freeze(probe))),
  });
}

export async function inspectNMinusOneDatabase(client, expected, urlIdentity) {
  const identity = await client.query(`
    SELECT current_database() AS "databaseName",
           current_user AS "databaseUser",
           COALESCE(host(inet_server_addr()), '') AS "serverAddress",
           inet_server_port() AS "serverPort",
           (SELECT system_identifier FROM pg_control_system())::text AS "systemIdentifier",
           current_setting('transaction_read_only') AS "transactionReadOnly"
  `);
  const migrations = await client.query(`
    SELECT migration_name AS "migrationName"
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at ASC, migration_name ASC
  `);
  const unfinished = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM "_prisma_migrations"
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
  `);
  const sessions = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
  `);
  const tenant = await client.query(
    `SELECT id FROM "Tenant" WHERE slug = $1 AND status = 'ACTIVE' LIMIT 2`,
    [expected.tenantSlug],
  );
  const row = identity.rows[0];
  const head = migrations.rows.at(-1)?.migrationName ?? null;
  const mismatch =
    row?.databaseName !== urlIdentity.databaseName ||
    row?.serverAddress !== LOOPBACK ||
    Number(row?.serverPort) !== urlIdentity.port ||
    row?.systemIdentifier !== expected.expectedSystemIdentifier;
  if (mismatch) fail("N_MINUS_ONE_DATABASE_IDENTITY_MISMATCH");
  if (row?.transactionReadOnly !== "off") {
    fail("N_MINUS_ONE_DATABASE_READ_ONLY");
  }
  if (
    migrations.rowCount !== expected.expectedMigrationCount ||
    head !== expected.expectedMigrationHead ||
    Number(unfinished.rows[0]?.count) !== 0
  ) {
    fail("N_MINUS_ONE_DATABASE_MIGRATION_STATE_MISMATCH");
  }
  if (Number(sessions.rows[0]?.count) !== 0) {
    fail("N_MINUS_ONE_DATABASE_NOT_EXCLUSIVE");
  }
  if (tenant.rowCount !== 1) fail("N_MINUS_ONE_TENANT_NOT_ACTIVE");

  return Object.freeze({
    databaseName: row.databaseName,
    migrationCount: migrations.rowCount,
    migrationHead: head,
    serverAddress: row.serverAddress,
    serverPort: Number(row.serverPort),
    systemIdentifierDigest: sha256(row.systemIdentifier),
    tenantIdentityDigest: sha256(`${tenant.rows[0].id}:${expected.tenantSlug}`),
  });
}

function exactCounter(value, reasonCode) {
  const normalized = String(value ?? "");
  if (!/^\d+$/u.test(normalized)) fail(reasonCode);
  return normalized;
}

async function schedulerSnapshotQuery(client, text) {
  try {
    return await client.query(text);
  } catch {
    fail("N_MINUS_ONE_SCHEDULER_SNAPSHOT_QUERY_FAILED");
  }
}

export async function captureNMinusOneSchedulerDatabaseSnapshot(client) {
  const databaseStatsResult = await schedulerSnapshotQuery(
    client,
    `
    SELECT xact_commit::text AS "xactCommit",
           xact_rollback::text AS "xactRollback",
           tup_returned::text AS "tuplesReturned",
           tup_fetched::text AS "tuplesFetched",
           tup_inserted::text AS "tuplesInserted",
           tup_updated::text AS "tuplesUpdated",
           tup_deleted::text AS "tuplesDeleted",
           stats_reset::text AS "statsReset",
           (SELECT COUNT(*)::text
              FROM pg_stat_activity
             WHERE datname = current_database()
               AND pid <> pg_backend_pid()) AS "otherSessions"
    FROM pg_stat_database
    WHERE datname = current_database()
  `,
  );
  if (databaseStatsResult.rowCount !== 1) {
    fail("N_MINUS_ONE_SCHEDULER_DATABASE_STATS_UNAVAILABLE");
  }
  const rawStats = databaseStatsResult.rows[0];
  const otherSessions = exactCounter(
    rawStats.otherSessions,
    "N_MINUS_ONE_SCHEDULER_DATABASE_STATS_INVALID",
  );
  if (otherSessions !== "0") {
    fail("N_MINUS_ONE_SCHEDULER_DATABASE_NOT_EXCLUSIVE");
  }
  const databaseStats = Object.freeze({
    otherSessions,
    statsReset: rawStats.statsReset ?? null,
    tuplesDeleted: exactCounter(
      rawStats.tuplesDeleted,
      "N_MINUS_ONE_SCHEDULER_DATABASE_STATS_INVALID",
    ),
    tuplesFetched: exactCounter(
      rawStats.tuplesFetched,
      "N_MINUS_ONE_SCHEDULER_DATABASE_STATS_INVALID",
    ),
    tuplesInserted: exactCounter(
      rawStats.tuplesInserted,
      "N_MINUS_ONE_SCHEDULER_DATABASE_STATS_INVALID",
    ),
    tuplesReturned: exactCounter(
      rawStats.tuplesReturned,
      "N_MINUS_ONE_SCHEDULER_DATABASE_STATS_INVALID",
    ),
    tuplesUpdated: exactCounter(
      rawStats.tuplesUpdated,
      "N_MINUS_ONE_SCHEDULER_DATABASE_STATS_INVALID",
    ),
    xactCommit: exactCounter(
      rawStats.xactCommit,
      "N_MINUS_ONE_SCHEDULER_DATABASE_STATS_INVALID",
    ),
    xactRollback: exactCounter(
      rawStats.xactRollback,
      "N_MINUS_ONE_SCHEDULER_DATABASE_STATS_INVALID",
    ),
  });
  const tableWriteStatsResult = await schedulerSnapshotQuery(
    client,
    `
    SELECT relname AS "tableName",
           n_tup_ins::text AS "tuplesInserted",
           n_tup_upd::text AS "tuplesUpdated",
           n_tup_del::text AS "tuplesDeleted"
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY relname ASC
  `,
  );
  if (tableWriteStatsResult.rowCount < 1) {
    fail("N_MINUS_ONE_SCHEDULER_TABLE_STATS_UNAVAILABLE");
  }
  const tableWriteStats = {};
  for (const row of tableWriteStatsResult.rows) {
    if (
      typeof row.tableName !== "string" ||
      !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(row.tableName) ||
      tableWriteStats[row.tableName]
    ) {
      fail("N_MINUS_ONE_SCHEDULER_TABLE_STATS_INVALID");
    }
    tableWriteStats[row.tableName] = Object.freeze({
      tuplesDeleted: exactCounter(
        row.tuplesDeleted,
        "N_MINUS_ONE_SCHEDULER_TABLE_STATS_INVALID",
      ),
      tuplesInserted: exactCounter(
        row.tuplesInserted,
        "N_MINUS_ONE_SCHEDULER_TABLE_STATS_INVALID",
      ),
      tuplesUpdated: exactCounter(
        row.tuplesUpdated,
        "N_MINUS_ONE_SCHEDULER_TABLE_STATS_INVALID",
      ),
    });
  }

  const tables = {};
  for (const table of SCHEDULER_SNAPSHOT_TABLES) {
    // Table and column identifiers are compile-time constants above. They are
    // deliberately not accepted from CLI input.
    const summary = await schedulerSnapshotQuery(
      client,
      `
      SELECT COUNT(*)::text AS "rowCount",
             MAX("${table.timestamp}")::text AS "maxTimestamp"
      FROM "${table.name}"
    `,
    );
    if (summary.rowCount !== 1) {
      fail("N_MINUS_ONE_SCHEDULER_TABLE_SNAPSHOT_INVALID");
    }
    const statusCounts = {};
    if (table.status) {
      const statuses = await schedulerSnapshotQuery(
        client,
        `
        SELECT status::text AS status, COUNT(*)::text AS count
        FROM "${table.name}"
        GROUP BY status
        ORDER BY status ASC
      `,
      );
      for (const row of statuses.rows) {
        if (
          typeof row.status !== "string" ||
          !/^[A-Z][A-Z0-9_-]{0,63}$/u.test(row.status)
        ) {
          fail("N_MINUS_ONE_SCHEDULER_TABLE_STATUS_INVALID");
        }
        statusCounts[row.status] = exactCounter(
          row.count,
          "N_MINUS_ONE_SCHEDULER_TABLE_STATUS_INVALID",
        );
      }
    }
    tables[table.name] = Object.freeze({
      maxTimestamp: summary.rows[0]?.maxTimestamp ?? null,
      rowCount: exactCounter(
        summary.rows[0]?.rowCount,
        "N_MINUS_ONE_SCHEDULER_TABLE_SNAPSHOT_INVALID",
      ),
      statusCounts: Object.freeze(statusCounts),
    });
  }

  const capturedAt = new Date().toISOString();
  const content = {
    databaseStats,
    tableWriteStats: Object.freeze(tableWriteStats),
    tables: Object.freeze(tables),
  };
  return Object.freeze({
    capturedAt,
    ...content,
    snapshotDigest: sha256(stableJson(content)),
  });
}

function counterDelta(after, before) {
  return (BigInt(after) - BigInt(before)).toString();
}

function cumulativeCounterDelta(after, before) {
  const delta = BigInt(after) - BigInt(before);
  if (delta < 0n) fail("N_MINUS_ONE_SCHEDULER_COUNTER_REGRESSION");
  return delta.toString();
}

export function diffNMinusOneSchedulerDatabaseSnapshots(before, after) {
  if (before.databaseStats.statsReset !== after.databaseStats.statsReset) {
    fail("N_MINUS_ONE_SCHEDULER_DATABASE_STATS_RESET");
  }
  const databaseStatsDelta = {};
  for (const key of [
    "tuplesDeleted",
    "tuplesFetched",
    "tuplesInserted",
    "tuplesReturned",
    "tuplesUpdated",
    "xactCommit",
    "xactRollback",
  ]) {
    databaseStatsDelta[key] = cumulativeCounterDelta(
      after.databaseStats[key],
      before.databaseStats[key],
    );
  }

  const beforeTableStats = Object.keys(before.tableWriteStats).sort();
  const afterTableStats = Object.keys(after.tableWriteStats).sort();
  if (
    beforeTableStats.length !== afterTableStats.length ||
    beforeTableStats.some(
      (tableName, index) => tableName !== afterTableStats[index],
    )
  ) {
    fail("N_MINUS_ONE_SCHEDULER_TABLE_STATS_DRIFT");
  }
  const tableWriteStatsDelta = {};
  for (const tableName of beforeTableStats) {
    const delta = {};
    for (const key of ["tuplesDeleted", "tuplesInserted", "tuplesUpdated"]) {
      const value = cumulativeCounterDelta(
        after.tableWriteStats[tableName][key],
        before.tableWriteStats[tableName][key],
      );
      if (value !== "0") delta[key] = value;
    }
    if (Object.keys(delta).length > 0) {
      tableWriteStatsDelta[tableName] = Object.freeze(delta);
    }
  }

  let tableChangeDetected = false;
  const tables = {};
  for (const table of SCHEDULER_SNAPSHOT_TABLES) {
    const beforeTable = before.tables[table.name];
    const afterTable = after.tables[table.name];
    if (!beforeTable || !afterTable) {
      fail("N_MINUS_ONE_SCHEDULER_SNAPSHOT_PAIR_INVALID");
    }
    const rowCountDelta = counterDelta(
      afterTable.rowCount,
      beforeTable.rowCount,
    );
    const statusCountsDelta = {};
    for (const status of new Set([
      ...Object.keys(beforeTable.statusCounts),
      ...Object.keys(afterTable.statusCounts),
    ])) {
      const delta = counterDelta(
        afterTable.statusCounts[status] ?? "0",
        beforeTable.statusCounts[status] ?? "0",
      );
      if (delta !== "0") statusCountsDelta[status] = delta;
    }
    const maxTimestampChanged =
      beforeTable.maxTimestamp !== afterTable.maxTimestamp;
    if (
      rowCountDelta !== "0" ||
      maxTimestampChanged ||
      Object.keys(statusCountsDelta).length > 0
    ) {
      tableChangeDetected = true;
    }
    tables[table.name] = Object.freeze({
      afterMaxTimestamp: afterTable.maxTimestamp,
      beforeMaxTimestamp: beforeTable.maxTimestamp,
      maxTimestampChanged,
      rowCountDelta,
      statusCountsDelta: Object.freeze(statusCountsDelta),
    });
  }

  const content = {
    databaseStatsDelta: Object.freeze(databaseStatsDelta),
    tableChangeDetected,
    tableWriteStatsDelta: Object.freeze(tableWriteStatsDelta),
    tables: Object.freeze(tables),
  };
  return Object.freeze({
    ...content,
    diffDigest: sha256(stableJson(content)),
  });
}

export function assertNMinusOneSchedulerCompatibilityEvidence(
  runtimeEvidence,
  databaseDiff,
) {
  if (
    !runtimeEvidence ||
    runtimeEvidence.invalidCoverageMarkers !== 0 ||
    runtimeEvidence.outputLimitExceeded === true ||
    runtimeEvidence.prismaErrors !== 0 ||
    runtimeEvidence.runtimeErrors !== 0
  ) {
    fail("N_MINUS_ONE_SCHEDULER_RUNTIME_ERRORS_DETECTED");
  }
  for (const scheduler of Object.keys(
    N_MINUS_ONE_LEGACY_SCHEDULER_EFFECTIVE_FLAGS,
  )) {
    const evidenceKey =
      scheduler === "GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED"
        ? "activity"
        : scheduler === "GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED"
          ? "bonusLedger"
          : scheduler === "GUEST_GAME_PIPELINE_SCHEDULER_ENABLED"
            ? "pipeline"
            : scheduler === "GUEST_GAME_RETENTION_SCHEDULER_ENABLED"
              ? "retention"
              : scheduler === "LANGAME_DAILY_SYNC_SCHEDULER_ENABLED"
                ? "langameDaily"
                : "reportDigest";
    if (runtimeEvidence.schedulerStarted?.[evidenceKey] < 1) {
      fail("N_MINUS_ONE_SCHEDULER_START_MARKER_MISSING");
    }
  }
  if (
    runtimeEvidence.schedulerTerminal?.bonusLedger < 1 ||
    runtimeEvidence.schedulerTerminal?.pipeline < 1 ||
    runtimeEvidence.schedulerTerminal?.retention < 1
  ) {
    fail("N_MINUS_ONE_SCHEDULER_TERMINAL_MARKER_MISSING");
  }
  if (
    !runtimeEvidence.queryCoverage ||
    runtimeEvidence.queryCoverage.total < 1
  ) {
    fail("N_MINUS_ONE_SCHEDULER_QUERY_COVERAGE_MISSING");
  }
  for (const key of [
    "activity",
    "bonusLedger",
    "pipeline",
    "retention",
    "langameDaily",
    "reportDigest",
  ]) {
    if (runtimeEvidence.queryCoverage[key] < 1) {
      fail("N_MINUS_ONE_SCHEDULER_QUERY_FAMILY_NOT_COVERED");
    }
  }
  if (
    !databaseDiff ||
    typeof databaseDiff.diffDigest !== "string" ||
    !/^[0-9a-f]{64}$/u.test(databaseDiff.diffDigest)
  ) {
    fail("N_MINUS_ONE_SCHEDULER_DATABASE_DIFF_MISSING");
  }
  return Object.freeze({ accepted: true });
}

export async function cleanupNMinusOneFixture(client, tenantSlug, fixture) {
  if (!fixture)
    return Object.freeze({ directCleanupRequired: false, residue: 0 });
  const tenant = await client.query(`SELECT id FROM "Tenant" WHERE slug = $1`, [
    tenantSlug,
  ]);
  if (tenant.rowCount !== 1) fail("N_MINUS_ONE_CLEANUP_TENANT_MISMATCH");
  const tenantId = tenant.rows[0].id;
  const exactPredicate = fixture.id
    ? `id = $1 AND "tenantId" = $2 AND title = $3`
    : `"tenantId" = $1 AND title = $2`;
  const exactParameters = fixture.id
    ? [fixture.id, tenantId, fixture.title]
    : [tenantId, fixture.title];
  const before = await client.query(
    `SELECT COUNT(*)::int AS count FROM "StaffChecklistTemplate"
     WHERE ${exactPredicate}`,
    exactParameters,
  );
  const directCleanupRequired = Number(before.rows[0]?.count) !== 0;
  if (directCleanupRequired) {
    await client.query(
      `DELETE FROM "StaffChecklistTemplate"
       WHERE ${exactPredicate}`,
      exactParameters,
    );
  }
  const after = await client.query(
    `SELECT COUNT(*)::int AS count FROM "StaffChecklistTemplate"
     WHERE "tenantId" = $1 AND title = $2`,
    [tenantId, fixture.title],
  );
  const residue = Number(after.rows[0]?.count);
  if (residue !== 0) fail("N_MINUS_ONE_FIXTURE_CLEANUP_FAILED");
  return Object.freeze({ directCleanupRequired, residue });
}

function pnpmCommand(args) {
  if (process.platform !== "win32") {
    return { args, executable: "pnpm" };
  }
  const commandShell = process.env.ComSpec ?? process.env.COMSPEC;
  if (!commandShell || !path.isAbsolute(commandShell)) {
    fail("N_MINUS_ONE_WINDOWS_COMMAND_SHELL_INVALID");
  }
  return {
    args: ["/d", "/s", "/c", "pnpm.cmd", ...args],
    executable: commandShell,
  };
}

async function terminateChild(child, graceMs = 5_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => child.once("close", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), graceMs)),
  ]);
  if (!exited && child.pid) {
    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const killer = spawn(
          "taskkill.exe",
          ["/PID", String(child.pid), "/T", "/F"],
          {
            stdio: "ignore",
            windowsHide: true,
          },
        );
        killer.once("exit", resolve);
        killer.once("error", resolve);
      });
    } else {
      child.kill("SIGKILL");
    }
  }
}

export async function runBoundedCommand(
  executable,
  args,
  {
    cwd,
    environment = process.env,
    prepareStage = undefined,
    timeoutMs = 10 * 60_000,
  } = {},
) {
  const stageReasonPrefix =
    prepareStage === undefined
      ? null
      : PREPARE_COMMAND_STAGE_REASON_PREFIX[prepareStage];
  if (prepareStage !== undefined && stageReasonPrefix === undefined) {
    fail("N_MINUS_ONE_PREPARE_STAGE_INVALID");
  }
  const commandError = ({
    bytes,
    code = null,
    failureKind,
    outputDigest,
    platformCode = null,
    signal = null,
  }) => {
    const suffix =
      failureKind === "TIMEOUT"
        ? "TIMEOUT"
        : failureKind === "SPAWN"
          ? "SPAWN_FAILED"
          : "COMMAND_FAILED";
    const reasonCode = stageReasonPrefix
      ? `${stageReasonPrefix}_${suffix}`
      : failureKind === "TIMEOUT"
        ? "N_MINUS_ONE_COMMAND_TIMEOUT"
        : failureKind === "SPAWN"
          ? "N_MINUS_ONE_COMMAND_SPAWN_FAILED"
          : "N_MINUS_ONE_COMMAND_FAILED";
    return new NMinusOneSmokeError(reasonCode, {
      exitCode: Number.isInteger(code) ? code : null,
      failureKind,
      outputBytes: bytes,
      outputDigest,
      platformCode:
        typeof platformCode === "string" &&
        /^[A-Z][A-Z0-9_]{1,31}$/u.test(platformCode)
          ? platformCode
          : null,
      signal:
        typeof signal === "string" && /^[A-Z][A-Z0-9]{1,31}$/u.test(signal)
          ? signal
          : null,
      stage: prepareStage ?? null,
    });
  };
  return new Promise((resolve, reject) => {
    const digest = createHash("sha256");
    let finalDigest = null;
    let bytes = 0;
    let settled = false;
    let timedOut = false;
    const finishDigest = () => {
      if (finalDigest === null) finalDigest = digest.digest("hex");
      return finalDigest;
    };
    const child = spawn(executable, args, {
      cwd,
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const observe = (chunk) => {
      bytes += chunk.length;
      digest.update(chunk);
    };
    child.stdout.on("data", observe);
    child.stderr.on("data", observe);
    const timer = setTimeout(async () => {
      if (settled) return;
      timedOut = true;
      await terminateChild(child);
      if (!settled) {
        settled = true;
        reject(
          commandError({
            bytes,
            code: child.exitCode,
            failureKind: "TIMEOUT",
            outputDigest: finishDigest(),
            signal: child.signalCode,
          }),
        );
      }
    }, timeoutMs);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        commandError({
          bytes,
          failureKind: "SPAWN",
          outputDigest: finishDigest(),
          platformCode: error?.code,
        }),
      );
    });
    child.once("exit", (code, signal) => {
      if (settled || timedOut) return;
      settled = true;
      clearTimeout(timer);
      const result = Object.freeze({
        bytes,
        code,
        outputDigest: finishDigest(),
        signal,
      });
      if (code !== 0) {
        reject(
          commandError({
            bytes,
            code,
            failureKind: "EXIT",
            outputDigest: result.outputDigest,
            signal,
          }),
        );
        return;
      }
      resolve(result);
    });
  });
}

async function commandText(executable, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      ...options,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderrBytes = 0;
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 4096) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0 || stderrBytes > 1024 * 1024) {
        reject(new NMinusOneSmokeError("N_MINUS_ONE_GIT_VERIFICATION_FAILED"));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export async function verifyNMinusOneCheckout(checkoutPath) {
  const resolved = await realpath(checkoutPath);
  const stat = await lstat(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail("N_MINUS_ONE_CHECKOUT_INVALID");
  }
  const sha = await commandText("git", ["rev-parse", "HEAD"], {
    cwd: resolved,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (sha !== N_MINUS_ONE_LEGACY_SHA) fail("N_MINUS_ONE_LEGACY_SHA_MISMATCH");
  const trackedStatus = await commandText(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { cwd: resolved, stdio: ["ignore", "pipe", "pipe"] },
  );
  if (trackedStatus !== "") fail("N_MINUS_ONE_CHECKOUT_DIRTY");
  return Object.freeze({ checkoutPath: resolved, legacySha: sha });
}

async function waitForApi(apiPort, child, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childStartupFailures.has(child)) {
      fail("N_MINUS_ONE_API_SPAWN_FAILED");
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      fail("N_MINUS_ONE_API_EXITED_DURING_STARTUP");
    }
    try {
      const response = await fetch(`http://${LOOPBACK}:${apiPort}/health`, {
        redirect: "manual",
        signal: AbortSignal.timeout(1_500),
      });
      if (response.status === 200) {
        await response.arrayBuffer();
        return;
      }
    } catch {
      // Retry only inside the fixed startup watchdog.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail("N_MINUS_ONE_API_STARTUP_TIMEOUT");
}

async function waitForSchedulerCompatibility(
  apiPort,
  child,
  durationMs = SCHEDULER_COMPATIBILITY_DURATION_MS,
) {
  const startedAt = Date.now();
  const deadline = startedAt + durationMs;
  while (Date.now() < deadline) {
    if (childStartupFailures.has(child)) {
      fail("N_MINUS_ONE_API_SPAWN_FAILED");
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      fail("N_MINUS_ONE_API_EXITED_DURING_SCHEDULER_WINDOW");
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(250, Math.max(1, deadline - Date.now()))),
    );
  }
  const health = await request({
    baseUrl: `http://${LOOPBACK}:${apiPort}`,
    path: "/health",
    timeoutMs: 2_000,
  });
  return Object.freeze({
    durationMs: Date.now() - startedAt,
    finalHealth: expectStatus(
      health,
      [200],
      "N_MINUS_ONE_SCHEDULER_FINAL_HEALTH_FAILED",
    ),
  });
}

function startLegacyApi({
  apiPort,
  checkoutPath,
  databaseUrl,
  guardPath,
  schedulerCompatibility = false,
}) {
  const environment = schedulerCompatibility
    ? buildNMinusOneSchedulerCompatibilityEnvironment({
        apiPort,
        databaseUrl,
      })
    : buildNMinusOneRuntimeEnvironment({
        apiPort,
        databaseUrl,
      });
  const child = spawn(
    process.execPath,
    ["--require", guardPath, path.join("dist", "main.js")],
    {
      cwd: path.join(checkoutPath, "apps", "api"),
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  child.once("error", () => {
    childStartupFailures.add(child);
  });
  const collector = createNMinusOneRuntimeLogCollector({
    schedulerCompatibility,
  });
  child.stdout.on("data", (chunk) => collector.observe(chunk, "stdout"));
  child.stderr.on("data", (chunk) => collector.observe(chunk, "stderr"));
  return {
    child,
    evidence: () => collector.evidence(),
  };
}

async function writeReceipt(evidencePath, receipt) {
  if (!evidencePath) return;
  if (!path.isAbsolute(evidencePath)) fail("N_MINUS_ONE_EVIDENCE_PATH_INVALID");
  const directory = path.dirname(evidencePath);
  await mkdir(directory, { recursive: true });
  const temporary = `${evidencePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(temporary, 0o600).catch(() => {});
  await rename(temporary, evidencePath);
}

export async function runNMinusOneRestoredCopySmoke(options) {
  const startedAt = new Date();
  const schedulerCompatibility = options.schedulerCompatibility === true;
  const urlIdentity = assertNMinusOneDatabaseUrl(options.databaseUrl);
  if (
    schedulerCompatibility &&
    !SAFE_SCHEDULER_DATABASE.test(urlIdentity.databaseName)
  ) {
    fail("N_MINUS_ONE_SCHEDULER_DATABASE_NAME_NOT_ALLOWLISTED");
  }
  const expected = normalizeNMinusOneExpectedTarget(options.expected);
  const { apiPort } = assertNMinusOneRuntimePorts({
    apiPort: options.apiPort,
    databasePort: urlIdentity.port,
  });
  let apiRuntime = null;
  let client = null;
  let fixture = null;
  let checkoutEvidence = null;
  let databaseEvidence = null;
  let httpEvidence = null;
  let cleanupEvidence = null;
  let schedulerBefore = null;
  let schedulerAfter = null;
  let schedulerDatabaseDiff = null;
  let schedulerWindow = null;
  let decision = N_MINUS_ONE_FAIL;
  let reasonCode = null;

  try {
    checkoutEvidence = await verifyNMinusOneCheckout(options.checkoutPath);
    client = new pg.Client({
      application_name: "leetplus_n_minus_one_smoke",
      connectionString: options.databaseUrl,
      connectionTimeoutMillis: 10_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
    });
    await client.connect();
    databaseEvidence = await inspectNMinusOneDatabase(
      client,
      expected,
      urlIdentity,
    );
    if (schedulerCompatibility) {
      schedulerBefore = await captureNMinusOneSchedulerDatabaseSnapshot(client);
    }

    const guardPath = path.join(
      await realpath(options.checkoutPath),
      ".n-minus-one-loopback-guard.cjs",
    );
    await writeFile(
      guardPath,
      buildLoopbackNetworkGuardSource({
        apiPort,
        databasePort: urlIdentity.port,
        schedulerCompatibility,
      }),
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    try {
      apiRuntime = startLegacyApi({
        apiPort,
        checkoutPath: checkoutEvidence.checkoutPath,
        databaseUrl: options.databaseUrl,
        guardPath,
        schedulerCompatibility,
      });
      await waitForApi(apiPort, apiRuntime.child, options.startupTimeoutMs);
      if (schedulerCompatibility) {
        schedulerWindow = await waitForSchedulerCompatibility(
          apiPort,
          apiRuntime.child,
        );
      } else {
        httpEvidence = await executeNMinusOneHttpSmoke({
          apiPort,
          loginEmail: options.loginEmail,
          loginPassword: options.loginPassword,
          onFixtureCreated: async (value) => {
            fixture = value;
          },
          tenantSlug: expected.tenantSlug,
        });
      }
    } finally {
      await terminateChild(apiRuntime?.child);
      await import("node:fs/promises").then(({ unlink }) =>
        unlink(guardPath).catch(() => {}),
      );
    }
    if (schedulerCompatibility) {
      schedulerAfter = await captureNMinusOneSchedulerDatabaseSnapshot(client);
      schedulerDatabaseDiff = diffNMinusOneSchedulerDatabaseSnapshots(
        schedulerBefore,
        schedulerAfter,
      );
      assertNMinusOneSchedulerCompatibilityEvidence(
        apiRuntime?.evidence(),
        schedulerDatabaseDiff,
      );
    }
    decision = N_MINUS_ONE_PASS;
  } catch (error) {
    reasonCode = safeReason(error);
  } finally {
    await terminateChild(apiRuntime?.child);
    if (client) {
      try {
        if (schedulerCompatibility) {
          if (schedulerBefore && !schedulerAfter) {
            schedulerAfter =
              await captureNMinusOneSchedulerDatabaseSnapshot(client);
            schedulerDatabaseDiff = diffNMinusOneSchedulerDatabaseSnapshots(
              schedulerBefore,
              schedulerAfter,
            );
          }
          cleanupEvidence = Object.freeze({
            cloneDiscardRequired: true,
            inPlaceCleanupAttempted: false,
            residueAssessment: "NOT_APPLICABLE_DISPOSABLE_CLONE",
            strategy: "DISCARD_DISPOSABLE_SCHEDULER_CLONE",
          });
        } else {
          cleanupEvidence = await cleanupNMinusOneFixture(
            client,
            expected.tenantSlug,
            fixture,
          );
          if (
            cleanupEvidence.directCleanupRequired &&
            decision === N_MINUS_ONE_PASS
          ) {
            decision = N_MINUS_ONE_FAIL;
            reasonCode = "N_MINUS_ONE_API_DELETE_LEFT_RESIDUE";
          }
        }
      } catch (error) {
        decision = N_MINUS_ONE_FAIL;
        reasonCode = safeReason(error);
      }
      await client.end().catch(() => {});
    }
  }

  const finishedAt = new Date();
  const evidence = {
    apiRuntime: apiRuntime?.evidence() ?? null,
    checkout: checkoutEvidence
      ? { legacySha: checkoutEvidence.legacySha }
      : null,
    cleanup: cleanupEvidence,
    database: databaseEvidence,
    http: httpEvidence ? { probes: httpEvidence.probes } : null,
    scheduler: schedulerCompatibility
      ? {
          after: schedulerAfter,
          authorizesHotSchedulerRollback: false,
          before: schedulerBefore,
          databaseDiff: schedulerDatabaseDiff,
          effectiveLegacyFlags: N_MINUS_ONE_LEGACY_SCHEDULER_EFFECTIVE_FLAGS,
          requiresProductionDrain: true,
          safetyConclusion: "DISPOSABLE_CLONE_SCHEMA_COMPATIBILITY_ONLY",
          window: schedulerWindow,
        }
      : null,
  };
  const receiptBase = {
    contractVersion: schedulerCompatibility
      ? N_MINUS_ONE_SCHEDULER_CONTRACT
      : N_MINUS_ONE_CONTRACT,
    decision,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    evidence,
    finishedAt: finishedAt.toISOString(),
    legacySha: N_MINUS_ONE_LEGACY_SHA,
    mode: schedulerCompatibility
      ? "SCHEDULER_COMPATIBILITY"
      : "API_COMPATIBILITY",
    reasonCode: decision === N_MINUS_ONE_PASS ? null : reasonCode,
    startedAt: startedAt.toISOString(),
  };
  const receipt = Object.freeze({
    ...receiptBase,
    evidenceDigest: sha256(stableJson(receiptBase)),
  });
  await writeReceipt(options.evidencePath, receipt);
  return receipt;
}

export async function prepareNMinusOneCheckout({
  checkoutPath,
  repositoryPath,
  timeoutMs = 10 * 60_000,
}) {
  if (!path.isAbsolute(repositoryPath) || !path.isAbsolute(checkoutPath)) {
    fail("N_MINUS_ONE_REPOSITORY_PATH_INVALID");
  }
  const commandEnvironment = buildNMinusOnePrepareEnvironment();
  await runBoundedCommand(
    "git",
    ["cat-file", "-e", `${N_MINUS_ONE_LEGACY_SHA}^{commit}`],
    {
      cwd: repositoryPath,
      environment: commandEnvironment,
      prepareStage: "GIT_OBJECT",
      timeoutMs: 30_000,
    },
  );
  await runBoundedCommand(
    "git",
    ["worktree", "add", "--detach", checkoutPath, N_MINUS_ONE_LEGACY_SHA],
    {
      cwd: repositoryPath,
      environment: commandEnvironment,
      prepareStage: "WORKTREE_ADD",
      timeoutMs: 60_000,
    },
  );
  await verifyNMinusOneCheckout(checkoutPath);
  const install = pnpmCommand(["install", "--offline", "--frozen-lockfile"]);
  await runBoundedCommand(install.executable, install.args, {
    cwd: checkoutPath,
    environment: commandEnvironment,
    prepareStage: "PNPM_INSTALL",
    timeoutMs,
  });
  const generate = pnpmCommand(["--filter", "database", "db:generate"]);
  await runBoundedCommand(generate.executable, generate.args, {
    cwd: checkoutPath,
    environment: commandEnvironment,
    prepareStage: "PRISMA_GENERATE",
    timeoutMs,
  });
  const build = pnpmCommand(["--filter", "api", "build"]);
  await runBoundedCommand(build.executable, build.args, {
    cwd: checkoutPath,
    environment: commandEnvironment,
    prepareStage: "API_BUILD",
    timeoutMs,
  });
  return verifyNMinusOneCheckout(checkoutPath);
}
