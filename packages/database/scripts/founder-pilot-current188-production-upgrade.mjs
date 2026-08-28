import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { lstat, open, readdir, readFile, realpath } from "node:fs/promises";
import { request } from "node:http";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";
import { inspectFounderPilotImmutableFile } from "./founder-pilot-restored-copy-preflight.mjs";
import {
  FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS,
  materializeFounderPilotProductionHistoryLane,
} from "./founder-pilot-production-history-rehearsal.mjs";
import {
  FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
  FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT,
  createFounderPilotProductionHistoryProductionPgAdapter,
  founderPilotProductionHistoryProductionIdentityDigest,
  normalizeFounderPilotProductionHistoryProductionIdentity,
  normalizeFounderPilotProductionHistoryProductionManifest,
} from "./founder-pilot-production-history-production.mjs";

export const FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT =
  "FOUNDER_PILOT_PRODUCTION_HISTORY_187_TO_188_V2";
export const FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION =
  "I_ACCEPT_EXACT_PRODUCTION_HISTORY_187_TO_188_V2";
export const FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_INVENTORY_READY =
  "CURRENT188_UPGRADE_INVENTORY_READY_NOT_AUTHORIZATION";
export const FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_PLAN_READY =
  "CURRENT188_UPGRADE_PLAN_READY";
export const FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_APPLIED =
  "CURRENT188_UPGRADE_APPLIED";

const SOURCE_COUNT = 187;
const SOURCE_HEAD = "20260820010000_guest_portal_telegram_update_ledger";
const TARGET_COUNT = 188;
const TARGET_HEAD = "20260828190000_guest_support_bug_reports";
const TARGET_MIGRATION_SHA256 =
  "c40d5eeb84cc980053af48b56385bf48882ee355aec718a442dab855ea33eb9b";
const TARGET_WORKER_FUNCTION_SHA256 =
  "a9a4bf75b8d5a381ebfc5ed9a35c6b966cbaac9b631a321ee66c1a6c1cc113a5";
const TARGET_PRETERMINAL_MANIFEST_SHA256 =
  "094f3ad34ef8846f6088f51d5fb9491ff89af4509b60063453c22af07466d99b";
const BRIDGE_ATTESTATION_CONTRACT =
  "GUEST_SUPPORT_CURRENT187_ACTIVE_BRIDGE_CUTOVER_V1";
const BRIDGE_SOURCE_PHASE = "SOURCE_187";
const BRIDGE_TARGET_PHASE = "TARGET_188";
const BRIDGE_COMPATIBILITY_MODE = "GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE";
const BRIDGE_STATE_ROOT = "/var/lib/leetplus/deploy-receipts";
const BRIDGE_CONFIG_ROOT = "/etc/nginx/leetplus";
const BRIDGE_ENVIRONMENT_ROOT = "/etc/leetplus";
const BRIDGE_SYSTEMD_ROOT = "/etc/systemd/system";
const BRIDGE_RELEASE_ROOT = "/srv/leetplus/releases";
const BRIDGE_SLOT_ROOT = "/srv/leetplus/slots";
const BRIDGE_MAX_FILE_BYTES = 1024 * 1024;
const BRIDGE_MAX_HTTP_BYTES = 1024 * 1024;
const BRIDGE_LOCK_TIMEOUT_MS = 5_000;
const SHA256 = /^[0-9a-f]{64}$/u;
const SHA40 = /^[0-9a-f]{40}$/u;
const INVOCATION_ID = /^[0-9a-f]{32}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const NANO_ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}Z$/u;
const BASE64URL_SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const LEGACY_APPLIED_CHECKSUMS = new Map([
  [
    "20260518120000_guest_data_foundation",
    "98de87e5d79eb6611b0722e954fe0e7b2eb6480c7b485d9cf451ecff6dcf4341",
  ],
  [
    "20260519142000_guest_working_shifts",
    "226614a5e628a3d40a0fe584323d6ed2134f229092e35081ec9b05a24378eff5",
  ],
]);

const EXPECTED_TABLES = Object.freeze([
  "GuestSupportAttachment",
  "GuestSupportTicket",
  "GuestSupportTicketAuditEvent",
  "GuestSupportTicketComment",
]);
const EXPECTED_ENUMS = Object.freeze([
  Object.freeze({
    labels: Object.freeze(["PENDING", "AVAILABLE", "REJECTED"]),
    name: "GuestSupportAttachmentState",
  }),
  Object.freeze({
    labels: Object.freeze(["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
    name: "GuestSupportTicketStatus",
  }),
]);
const EXPECTED_INDEXES = Object.freeze(
  [
    "GuestSupportAttachment_pkey",
    "GuestSupportTicketAuditEvent_pkey",
    "GuestSupportTicketComment_pkey",
    "GuestSupportTicket_pkey",
    "GuestSupportTicket_ticketNumber_key",
    "guest_support_attachment_sha_idx",
    "guest_support_attachment_state_idx",
    "guest_support_attachment_ticket_idx",
    "guest_support_audit_actor_idx",
    "guest_support_audit_ticket_idx",
    "guest_support_comment_author_idx",
    "guest_support_comment_ticket_idx",
    "guest_support_ticket_assignee_status_idx",
    "guest_support_ticket_guest_idx",
    "guest_support_ticket_profile_idempotency_uidx",
    "guest_support_ticket_status_activity_idx",
    "guest_support_ticket_store_created_idx",
    "guest_support_ticket_tenant_id_uidx",
    "guest_support_ticket_topic_created_idx",
  ].sort(),
);
const EXPECTED_CONSTRAINTS = Object.freeze(
  [
    "GuestSupportAttachment_pkey",
    "GuestSupportAttachment_tenantId_fkey",
    "GuestSupportAttachment_tenantId_ticketId_fkey",
    "GuestSupportTicketAuditEvent_actorUserId_fkey",
    "GuestSupportTicketAuditEvent_pkey",
    "GuestSupportTicketAuditEvent_tenantId_fkey",
    "GuestSupportTicketAuditEvent_tenantId_ticketId_fkey",
    "GuestSupportTicketComment_authorUserId_fkey",
    "GuestSupportTicketComment_pkey",
    "GuestSupportTicketComment_tenantId_fkey",
    "GuestSupportTicketComment_tenantId_ticketId_fkey",
    "GuestSupportTicket_assignedToUserId_fkey",
    "GuestSupportTicket_pkey",
    "GuestSupportTicket_tenantId_fkey",
    "GuestSupportTicket_tenantId_guestId_fkey",
    "GuestSupportTicket_tenantId_profileId_fkey",
    "GuestSupportTicket_tenantId_storeId_fkey",
    "guest_support_attachment_content_type_chk",
    "guest_support_attachment_sha_chk",
    "guest_support_attachment_size_chk",
    "guest_support_attachment_state_chk",
    "guest_support_comment_body_length_chk",
    "guest_support_ticket_description_length_chk",
    "guest_support_ticket_idempotency_format_chk",
    "guest_support_ticket_kind_chk",
    "guest_support_ticket_number_format_chk",
    "guest_support_ticket_terminal_timestamps_chk",
    "guest_support_ticket_topic_chk",
  ].sort(),
);

export class FounderPilotCurrent188ProductionUpgradeError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "FounderPilotCurrent188ProductionUpgradeError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new FounderPilotCurrent188ProductionUpgradeError(reasonCode);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function digest(domain, value) {
  return sha256(
    `${FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT}\0${domain}\0${stableJson(value)}`,
  );
}

function exactRecord(value, keys, reasonCode) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")
  ) {
    fail(reasonCode);
  }
  return value;
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function currentDate(now) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) {
    fail("CURRENT188_UPGRADE_CLOCK_INVALID");
  }
  return value;
}

function parseNanoTimestamp(value) {
  if (typeof value !== "string" || !NANO_ISO_TIMESTAMP.test(value)) {
    return null;
  }
  const parsed = new Date(value.replace(/(\.\d{3})\d{6}Z$/u, "$1Z"));
  return Number.isFinite(parsed.valueOf()) ? parsed : null;
}

const BRIDGE_ATTESTATION_KEYS = Object.freeze([
  "acceptedAt",
  "activeTarget",
  "activeTargetSha256",
  "apiBaseUrl",
  "apiUnit",
  "apiUnitFileSha256",
  "bridgeContract",
  "bugReportingMode",
  "canarySafeEnvironmentSha256",
  "compatibilityMode",
  "compatibilityTargetMigration",
  "compatibilityTargetMigrationCount",
  "cutoverGeneration",
  "cutoverReceiptName",
  "cutoverReceiptSha256",
  "databaseMigration",
  "databaseMigrationCount",
  "latestReceiptConsumed",
  "pendingIntentCount",
  "phase",
  "releaseSha",
  "runtimeEnvironmentSha256",
  "runtimeRole",
  "schemaBridgeMode",
  "slot",
  "slotEnvironmentSha256",
  "webBaseUrl",
  "webBuildId",
  "webUnit",
  "webUnitFileSha256",
]);

export function normalizeFounderPilotCurrent188BridgeAttestation(
  value,
  { expectedPhase, expectedReleaseSha } = {},
) {
  const attestation = exactRecord(
    value,
    BRIDGE_ATTESTATION_KEYS,
    "CURRENT188_UPGRADE_BRIDGE_ATTESTATION_INVALID",
  );
  const source = expectedPhase === BRIDGE_SOURCE_PHASE;
  const target = expectedPhase === BRIDGE_TARGET_PHASE;
  const expectedSlot = attestation.slot;
  const expectedApiPort = expectedSlot === "blue" ? 4100 : 4200;
  const expectedWebPort = expectedSlot === "blue" ? 3100 : 3200;
  if (
    (!source && !target) ||
    !SHA40.test(expectedReleaseSha ?? "") ||
    attestation.bridgeContract !== BRIDGE_ATTESTATION_CONTRACT ||
    attestation.phase !== expectedPhase ||
    attestation.releaseSha !== expectedReleaseSha ||
    !["blue", "green"].includes(expectedSlot) ||
    attestation.apiUnit !== `leetplus-api@${expectedSlot}.service` ||
    attestation.webUnit !== `leetplus-web@${expectedSlot}.service` ||
    attestation.apiBaseUrl !== `http://127.0.0.1:${expectedApiPort}` ||
    attestation.webBaseUrl !== `http://127.0.0.1:${expectedWebPort}` ||
    attestation.activeTarget !==
      `${BRIDGE_CONFIG_ROOT}/upstreams/${expectedSlot}.conf` ||
    parseNanoTimestamp(attestation.acceptedAt) === null ||
    !Number.isSafeInteger(attestation.cutoverGeneration) ||
    attestation.cutoverGeneration < 1 ||
    attestation.cutoverGeneration > 999_999_999 ||
    attestation.cutoverReceiptName !==
      `${attestation.cutoverReceiptName.match(/^([0-9]{8}T[0-9]{15}Z)-/u)?.[1] ?? ""}-g${attestation.cutoverGeneration}-${expectedReleaseSha}-${expectedSlot}.receipt` ||
    ![
      attestation.activeTargetSha256,
      attestation.apiUnitFileSha256,
      attestation.canarySafeEnvironmentSha256,
      attestation.cutoverReceiptSha256,
      attestation.runtimeEnvironmentSha256,
      attestation.slotEnvironmentSha256,
      attestation.webUnitFileSha256,
    ].every((candidate) => SHA256.test(candidate)) ||
    attestation.latestReceiptConsumed !== false ||
    attestation.pendingIntentCount !== 0 ||
    attestation.runtimeRole !== "COMBINED" ||
    attestation.bugReportingMode !== "OFF" ||
    attestation.schemaBridgeMode !== "ALLOW_CURRENT_187" ||
    attestation.webBuildId !== expectedReleaseSha
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_ATTESTATION_INVALID");
  }
  if (
    source
      ? attestation.databaseMigration !== SOURCE_HEAD ||
        attestation.databaseMigrationCount !== SOURCE_COUNT ||
        attestation.compatibilityMode !== BRIDGE_COMPATIBILITY_MODE ||
        attestation.compatibilityTargetMigration !== TARGET_HEAD ||
        attestation.compatibilityTargetMigrationCount !== TARGET_COUNT
      : attestation.databaseMigration !== TARGET_HEAD ||
        attestation.databaseMigrationCount !== TARGET_COUNT ||
        attestation.compatibilityMode !== null ||
        attestation.compatibilityTargetMigration !== null ||
        attestation.compatibilityTargetMigrationCount !== null
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_ATTESTATION_INVALID");
  }
  return Object.freeze({ ...attestation });
}

function bridgeAttestationInvariant(attestation) {
  const {
    compatibilityMode: _compatibilityMode,
    compatibilityTargetMigration: _compatibilityTargetMigration,
    compatibilityTargetMigrationCount: _compatibilityTargetMigrationCount,
    databaseMigration: _databaseMigration,
    databaseMigrationCount: _databaseMigrationCount,
    phase: _phase,
    ...invariant
  } = attestation;
  return invariant;
}

export function founderPilotCurrent188BridgeAttestationDigest(value, options) {
  return digest(
    "active-bridge-attestation",
    normalizeFounderPilotCurrent188BridgeAttestation(value, options),
  );
}

function exactBridgeRuntimeAdapter(adapter) {
  for (const method of [
    "acquireLock",
    "inspectSource",
    "inspectTarget",
    "releaseLock",
  ]) {
    if (typeof adapter?.[method] !== "function") {
      fail("CURRENT188_UPGRADE_BRIDGE_RUNTIME_ADAPTER_INVALID");
    }
  }
  return adapter;
}

async function readProtectedBridgeFile(
  filePath,
  { allowEmpty = false, maximumBytes = BRIDGE_MAX_FILE_BYTES, mode },
) {
  let before;
  try {
    before = await lstat(filePath, { bigint: true });
  } catch {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== 0n ||
    before.nlink !== 1n ||
    Number(before.mode & 0o777n) !== mode ||
    (!allowEmpty && before.size < 1n) ||
    before.size > BigInt(maximumBytes) ||
    (await realpath(filePath).catch(() => null)) !== filePath
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  const handle = await open(
    filePath,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  ).catch(() => null);
  if (handle === null) fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      opened.mtimeNs !== before.mtimeNs ||
      opened.ctimeNs !== before.ctimeNs
    ) {
      fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
    }
    const bytes = Buffer.alloc(Number(opened.size));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat({ bigint: true });
    if (
      bytesRead !== bytes.length ||
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      after.mtimeNs !== opened.mtimeNs ||
      after.ctimeNs !== opened.ctimeNs
    ) {
      fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function assertProtectedBridgeDirectory(directoryPath) {
  const metadata = await lstat(directoryPath, { bigint: true }).catch(
    () => null,
  );
  if (
    !metadata?.isDirectory() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== 0n ||
    (metadata.mode & 0o022n) !== 0n ||
    (await realpath(directoryPath).catch(() => null)) !== directoryPath
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
}

function decodeBridgeUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
}

function parseExactBridgeKeyValues(bytes, keys) {
  const text = decodeBridgeUtf8(bytes);
  if (!text.endsWith("\n") || text.includes("\0") || text.includes("\r")) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== keys.length) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  const result = {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const prefix = `${key}=`;
    if (!lines[index].startsWith(prefix)) {
      fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
    }
    result[key] = lines[index].slice(prefix.length);
  }
  return result;
}

const BRIDGE_ENVIRONMENT_KEYS = new Set([
  "EXPECTED_DATABASE_MIGRATION",
  "EXPECTED_DATABASE_MIGRATION_COUNT",
  "GUEST_BUG_REPORTING_MODE",
  "GUEST_SUPPORT_SCHEMA_BRIDGE_MODE",
  "LEETPLUS_API_RUNTIME_ROLE",
  "RELEASE_SHA",
  "WEB_BUILD_ID",
]);

function mergeBridgeEnvironment(target, bytes) {
  const text = decodeBridgeUtf8(bytes);
  if (!text.endsWith("\n") || text.includes("\0") || text.includes("\r")) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  const local = new Set();
  for (const line of text.slice(0, -1).split("\n")) {
    if (line.length === 0 || line.startsWith("#")) continue;
    const keyMatch = /^([A-Z][A-Z0-9_]*)=/u.exec(line);
    if (!keyMatch || !BRIDGE_ENVIRONMENT_KEYS.has(keyMatch[1])) continue;
    const match = /^([A-Z][A-Z0-9_]*)=([^\s'"`]+)$/u.exec(line);
    if (!match) fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
    const [, key, value] = match;
    if (!BRIDGE_ENVIRONMENT_KEYS.has(key)) continue;
    if (local.has(key)) fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
    local.add(key);
    target[key] = value;
  }
}

async function trustedBridgeExecutable(input, expectedPattern) {
  const resolved = await realpath(input).catch(() => null);
  const metadata = resolved
    ? await lstat(resolved, { bigint: true }).catch(() => null)
    : null;
  if (
    !resolved ||
    !expectedPattern.test(resolved) ||
    !metadata?.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== 0n ||
    metadata.nlink !== 1n ||
    (metadata.mode & 0o022n) !== 0n ||
    (metadata.mode & 0o111n) === 0n
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  return resolved;
}

async function runBridgeCommand(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: {
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
        TZ: "UTC",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("BRIDGE_COMMAND_TIMEOUT"));
    }, BRIDGE_LOCK_TIMEOUT_MS);
    const append = (current, chunk) => {
      const next = Buffer.concat([current, chunk]);
      if (next.length > 256 * 1024) {
        child.kill("SIGKILL");
        reject(new Error("BRIDGE_COMMAND_OVERSIZED"));
      }
      return next;
    };
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 || signal !== null || stderr.length !== 0) {
        reject(new Error("BRIDGE_COMMAND_FAILED"));
        return;
      }
      try {
        resolve(decodeBridgeUtf8(stdout));
      } catch (error) {
        reject(error);
      }
    });
  }).catch(() => fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID"));
}

function parseBridgeSystemdProperties(text, keys) {
  if (!text.endsWith("\n") || text.includes("\0") || text.includes("\r")) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  const result = {};
  for (const line of text.slice(0, -1).split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 1) fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
    const key = line.slice(0, separator);
    if (!keys.includes(key) || Object.hasOwn(result, key)) {
      fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
    }
    result[key] = line.slice(separator + 1);
  }
  if (Object.keys(result).length !== keys.length) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  return result;
}

function bridgeEnvironmentFilePaths(value) {
  return value
    .split(/\s+/u)
    .map((token) =>
      token
        .replace(/^\{/u, "")
        .replace(/^path=/u, "")
        .replace(/[;}]+$/u, ""),
    )
    .filter((token) => token.startsWith("/"));
}

async function inspectBridgeUnit({ slot, systemctl, runtimeKind }) {
  const unit = `leetplus-${runtimeKind}@${slot}.service`;
  const keys = [
    "ActiveState",
    "ControlGroup",
    "EnvironmentFiles",
    "FragmentPath",
    "InvocationID",
    "MainPID",
    "NeedDaemonReload",
    "SubState",
    "UnitFileState",
    "WorkingDirectory",
  ];
  const output = await runBridgeCommand(systemctl, [
    "show",
    "--all",
    "--no-pager",
    ...keys.map((key) => `--property=${key}`),
    unit,
  ]);
  const properties = parseBridgeSystemdProperties(output, keys);
  const expectedFragment = `${BRIDGE_SYSTEMD_ROOT}/leetplus-${runtimeKind}@.service`;
  const expectedEnvironmentFiles = [
    `${BRIDGE_ENVIRONMENT_ROOT}/${runtimeKind === "api" ? "runtime" : "web-runtime"}.env`,
    `${BRIDGE_ENVIRONMENT_ROOT}/slots/${slot}.env`,
    `${BRIDGE_ENVIRONMENT_ROOT}/canary-safe.env`,
  ];
  if (
    properties.ActiveState !== "active" ||
    properties.SubState !== "running" ||
    properties.UnitFileState !== "enabled" ||
    properties.NeedDaemonReload !== "no" ||
    properties.FragmentPath !== expectedFragment ||
    properties.WorkingDirectory !==
      `${BRIDGE_SLOT_ROOT}/${slot}${runtimeKind === "web" ? "/apps/web" : ""}` ||
    !/^[1-9][0-9]*$/u.test(properties.MainPID) ||
    !INVOCATION_ID.test(properties.InvocationID) ||
    !properties.ControlGroup.startsWith("/") ||
    stableJson(bridgeEnvironmentFilePaths(properties.EnvironmentFiles)) !==
      stableJson(expectedEnvironmentFiles)
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  const cgroup = await readFile(
    `/proc/${properties.MainPID}/cgroup`,
    "utf8",
  ).catch(() => null);
  if (
    typeof cgroup !== "string" ||
    !cgroup
      .trimEnd()
      .split("\n")
      .some(
        (line) =>
          line.split(":").slice(2).join(":") === properties.ControlGroup,
      )
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  const fragmentBytes = await readProtectedBridgeFile(expectedFragment, {
    mode: 0o444,
  });
  return Object.freeze({
    fragmentSha256: sha256(fragmentBytes),
    unit,
  });
}

function fetchBridgeJson({ port, requestPath }) {
  return new Promise((resolve, reject) => {
    const requestHandle = request(
      {
        agent: false,
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-store",
          Connection: "close",
        },
        host: "127.0.0.1",
        method: "GET",
        path: requestPath,
        port,
        protocol: "http:",
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = String(response.headers["content-type"] ?? "");
        const contentEncoding = String(
          response.headers["content-encoding"] ?? "",
        );
        const declaredLength = Number(response.headers["content-length"] ?? 0);
        if (
          status < 200 ||
          status >= 300 ||
          !/^application\/json(?:;|$)/iu.test(contentType) ||
          (contentEncoding !== "" && contentEncoding !== "identity") ||
          !Number.isSafeInteger(declaredLength) ||
          declaredLength < 0 ||
          declaredLength > BRIDGE_MAX_HTTP_BYTES
        ) {
          response.resume();
          reject(new Error("BRIDGE_HTTP_INVALID"));
          return;
        }
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > BRIDGE_MAX_HTTP_BYTES) {
            requestHandle.destroy(new Error("BRIDGE_HTTP_OVERSIZED"));
            return;
          }
          chunks.push(chunk);
        });
        response.once("end", () => {
          try {
            const value = JSON.parse(
              new TextDecoder("utf-8", { fatal: true }).decode(
                Buffer.concat(chunks),
              ),
            );
            if (
              value === null ||
              typeof value !== "object" ||
              Array.isArray(value)
            ) {
              reject(new Error("BRIDGE_HTTP_INVALID"));
              return;
            }
            resolve(value);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    requestHandle.setTimeout(BRIDGE_LOCK_TIMEOUT_MS, () => {
      requestHandle.destroy(new Error("BRIDGE_HTTP_TIMEOUT"));
    });
    requestHandle.once("error", reject);
    requestHandle.end();
  }).catch(() => fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID"));
}

async function inspectLiveBridgeRuntime({ expectedPhase, now, releaseSha }) {
  for (const directory of [
    BRIDGE_STATE_ROOT,
    BRIDGE_CONFIG_ROOT,
    `${BRIDGE_CONFIG_ROOT}/upstreams`,
    BRIDGE_ENVIRONMENT_ROOT,
    `${BRIDGE_ENVIRONMENT_ROOT}/slots`,
    BRIDGE_SYSTEMD_ROOT,
    BRIDGE_RELEASE_ROOT,
    BRIDGE_SLOT_ROOT,
  ]) {
    await assertProtectedBridgeDirectory(directory);
  }
  const activeLink = `${BRIDGE_CONFIG_ROOT}/active-upstreams.conf`;
  const activeMetadata = await lstat(activeLink, { bigint: true }).catch(
    () => null,
  );
  const activeTarget = await realpath(activeLink).catch(() => null);
  const activeMatch = activeTarget
    ? new RegExp(
        `^${BRIDGE_CONFIG_ROOT.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}/upstreams/(blue|green)\\.conf$`,
        "u",
      ).exec(activeTarget)
    : null;
  if (
    !activeMetadata?.isSymbolicLink() ||
    activeMetadata.uid !== 0n ||
    !activeMatch
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  const slot = activeMatch[1];
  const apiPort = slot === "blue" ? 4100 : 4200;
  const webPort = slot === "blue" ? 3100 : 3200;
  const activeTargetBytes = await readProtectedBridgeFile(activeTarget, {
    mode: 0o644,
  });

  const slotLink = `${BRIDGE_SLOT_ROOT}/${slot}`;
  const slotMetadata = await lstat(slotLink, { bigint: true }).catch(
    () => null,
  );
  const expectedReleaseRoot = `${BRIDGE_RELEASE_ROOT}/${releaseSha}`;
  if (
    !slotMetadata?.isSymbolicLink() ||
    slotMetadata.uid !== 0n ||
    (await realpath(slotLink).catch(() => null)) !== expectedReleaseRoot
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  await assertProtectedBridgeDirectory(expectedReleaseRoot);

  const latestIndexPath = `${BRIDGE_STATE_ROOT}/latest-accepted.index`;
  const latestIndex = parseExactBridgeKeyValues(
    await readProtectedBridgeFile(latestIndexPath, { mode: 0o600 }),
    [
      "RECORD_VERSION",
      "GENERATION",
      "RECEIPT_PATH",
      "RECEIPT_SHA256",
      "CONSUMED",
    ],
  );
  if (
    latestIndex.RECORD_VERSION !== "2" ||
    latestIndex.CONSUMED !== "false" ||
    !/^[1-9][0-9]{0,8}$/u.test(latestIndex.GENERATION) ||
    !SHA256.test(latestIndex.RECEIPT_SHA256) ||
    path.dirname(latestIndex.RECEIPT_PATH) !== BRIDGE_STATE_ROOT
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  const receiptName = path.basename(latestIndex.RECEIPT_PATH);
  const receiptBytes = await readProtectedBridgeFile(latestIndex.RECEIPT_PATH, {
    mode: 0o600,
  });
  const receipt = parseExactBridgeKeyValues(receiptBytes, [
    "RECORD_VERSION",
    "GENERATION",
    "RELEASE_SHA",
    "SLOT",
    "PREVIOUS_TARGET",
    "PREVIOUS_SHA256",
    "PREVIOUS_RUNTIME_KIND",
    "PREVIOUS_SLOT",
    "PREVIOUS_API_UNIT",
    "PREVIOUS_WEB_UNIT",
    "PREVIOUS_API_URL",
    "PREVIOUS_WEB_URL",
    "PREVIOUS_RELEASE_SHA",
    "PREVIOUS_MIGRATION",
    "PREVIOUS_MIGRATION_COUNT",
    "PREVIOUS_WEB_BUILD_ID",
    "ACTIVATED_TARGET",
    "ACTIVATED_SHA256",
    "INTENT_RECORDED_AT",
    "ACCEPTED_AT",
  ]);
  const acceptedAt = parseNanoTimestamp(receipt.ACCEPTED_AT);
  const observedAt = currentDate(now);
  const previousSlot = slot === "blue" ? "green" : "blue";
  const previousTarget = `${BRIDGE_CONFIG_ROOT}/upstreams/${previousSlot}.conf`;
  const previousTargetBytes = await readProtectedBridgeFile(previousTarget, {
    mode: 0o644,
  });
  const previousApiPort = previousSlot === "blue" ? 4100 : 4200;
  const previousWebPort = previousSlot === "blue" ? 3100 : 3200;
  if (
    receipt.RECORD_VERSION !== "3" ||
    receipt.GENERATION !== latestIndex.GENERATION ||
    receipt.RELEASE_SHA !== releaseSha ||
    receipt.SLOT !== slot ||
    receipt.ACTIVATED_TARGET !== activeTarget ||
    receipt.ACTIVATED_SHA256 !== sha256(activeTargetBytes) ||
    receipt.PREVIOUS_RUNTIME_KIND !== "SLOT" ||
    receipt.PREVIOUS_SLOT !== previousSlot ||
    receipt.PREVIOUS_TARGET !== previousTarget ||
    receipt.PREVIOUS_SHA256 !== sha256(previousTargetBytes) ||
    receipt.PREVIOUS_API_UNIT !== `leetplus-api@${previousSlot}.service` ||
    receipt.PREVIOUS_WEB_UNIT !== `leetplus-web@${previousSlot}.service` ||
    receipt.PREVIOUS_API_URL !== `http://127.0.0.1:${previousApiPort}` ||
    receipt.PREVIOUS_WEB_URL !== `http://127.0.0.1:${previousWebPort}` ||
    !SHA40.test(receipt.PREVIOUS_RELEASE_SHA) ||
    receipt.PREVIOUS_MIGRATION !== SOURCE_HEAD ||
    receipt.PREVIOUS_MIGRATION_COUNT !== String(SOURCE_COUNT) ||
    receipt.PREVIOUS_WEB_BUILD_ID !== receipt.PREVIOUS_RELEASE_SHA ||
    latestIndex.RECEIPT_SHA256 !== sha256(receiptBytes) ||
    receiptName !==
      `${receipt.INTENT_RECORDED_AT}-g${latestIndex.GENERATION}-${releaseSha}-${slot}.receipt` ||
    !acceptedAt ||
    acceptedAt.valueOf() > observedAt.valueOf() + 5_000
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  const pendingIntentCount = (
    await readdir(BRIDGE_STATE_ROOT, { withFileTypes: true })
  ).filter(
    (entry) => entry.isFile() && /\.intent(?:\.|$)/u.test(entry.name),
  ).length;
  if (pendingIntentCount !== 0) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }

  const runtimeEnvironmentPath = `${BRIDGE_ENVIRONMENT_ROOT}/runtime.env`;
  const slotEnvironmentPath = `${BRIDGE_ENVIRONMENT_ROOT}/slots/${slot}.env`;
  const canarySafeEnvironmentPath = `${BRIDGE_ENVIRONMENT_ROOT}/canary-safe.env`;
  const [runtimeEnvironment, slotEnvironment, canarySafeEnvironment] =
    await Promise.all([
      readProtectedBridgeFile(runtimeEnvironmentPath, { mode: 0o640 }),
      readProtectedBridgeFile(slotEnvironmentPath, { mode: 0o440 }),
      readProtectedBridgeFile(canarySafeEnvironmentPath, { mode: 0o440 }),
    ]);
  const environment = {};
  mergeBridgeEnvironment(environment, runtimeEnvironment);
  mergeBridgeEnvironment(environment, slotEnvironment);
  mergeBridgeEnvironment(environment, canarySafeEnvironment);
  if (
    environment.RELEASE_SHA !== releaseSha ||
    environment.WEB_BUILD_ID !== releaseSha ||
    environment.EXPECTED_DATABASE_MIGRATION !== TARGET_HEAD ||
    environment.EXPECTED_DATABASE_MIGRATION_COUNT !== String(TARGET_COUNT) ||
    (environment.LEETPLUS_API_RUNTIME_ROLE ?? "COMBINED") !== "COMBINED" ||
    environment.GUEST_BUG_REPORTING_MODE !== "OFF" ||
    environment.GUEST_SUPPORT_SCHEMA_BRIDGE_MODE !== "ALLOW_CURRENT_187"
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }

  const systemctl = await trustedBridgeExecutable(
    "/usr/bin/systemctl",
    /^\/usr\/bin\/systemctl$/u,
  );
  const [apiUnit, webUnit, version, readiness, webIdentity] = await Promise.all(
    [
      inspectBridgeUnit({ runtimeKind: "api", slot, systemctl }),
      inspectBridgeUnit({ runtimeKind: "web", slot, systemctl }),
      fetchBridgeJson({ port: apiPort, requestPath: "/version" }),
      fetchBridgeJson({ port: apiPort, requestPath: "/health/ready" }),
      fetchBridgeJson({ port: webPort, requestPath: "/api/release-identity" }),
    ],
  );
  const database = readiness?.dependencies?.database;
  const compatibility = database?.compatibility;
  const readinessCheckedAt = new Date(readiness?.checkedAt ?? "invalid");
  if (
    version?.service !== "leetplus-api" ||
    version?.release?.sha !== releaseSha ||
    readiness?.ok !== true ||
    readiness?.service !== "leetplus-api" ||
    readiness?.release?.sha !== releaseSha ||
    database?.ok !== true ||
    webIdentity?.ok !== true ||
    webIdentity?.release?.sha !== releaseSha ||
    webIdentity?.release?.webBuildId !== releaseSha ||
    !Number.isFinite(readinessCheckedAt.valueOf()) ||
    Math.abs(observedAt.valueOf() - readinessCheckedAt.valueOf()) > 30_000
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }
  if (
    expectedPhase === BRIDGE_SOURCE_PHASE
      ? database.migration !== SOURCE_HEAD ||
        database.migrationCount !== SOURCE_COUNT ||
        compatibility?.mode !== BRIDGE_COMPATIBILITY_MODE ||
        compatibility?.targetMigration !== TARGET_HEAD ||
        compatibility?.targetMigrationCount !== TARGET_COUNT
      : expectedPhase !== BRIDGE_TARGET_PHASE ||
        database.migration !== TARGET_HEAD ||
        database.migrationCount !== TARGET_COUNT ||
        compatibility !== undefined
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_LIVE_STATE_INVALID");
  }

  return normalizeFounderPilotCurrent188BridgeAttestation(
    {
      acceptedAt: receipt.ACCEPTED_AT,
      activeTarget,
      activeTargetSha256: sha256(activeTargetBytes),
      apiBaseUrl: `http://127.0.0.1:${apiPort}`,
      apiUnit: apiUnit.unit,
      apiUnitFileSha256: apiUnit.fragmentSha256,
      bridgeContract: BRIDGE_ATTESTATION_CONTRACT,
      bugReportingMode: environment.GUEST_BUG_REPORTING_MODE,
      canarySafeEnvironmentSha256: sha256(canarySafeEnvironment),
      compatibilityMode:
        expectedPhase === BRIDGE_SOURCE_PHASE ? compatibility.mode : null,
      compatibilityTargetMigration:
        expectedPhase === BRIDGE_SOURCE_PHASE
          ? compatibility.targetMigration
          : null,
      compatibilityTargetMigrationCount:
        expectedPhase === BRIDGE_SOURCE_PHASE
          ? compatibility.targetMigrationCount
          : null,
      cutoverGeneration: Number(latestIndex.GENERATION),
      cutoverReceiptName: receiptName,
      cutoverReceiptSha256: latestIndex.RECEIPT_SHA256,
      databaseMigration: database.migration,
      databaseMigrationCount: database.migrationCount,
      latestReceiptConsumed: false,
      pendingIntentCount,
      phase: expectedPhase,
      releaseSha,
      runtimeEnvironmentSha256: sha256(runtimeEnvironment),
      runtimeRole: "COMBINED",
      schemaBridgeMode: environment.GUEST_SUPPORT_SCHEMA_BRIDGE_MODE,
      slot,
      slotEnvironmentSha256: sha256(slotEnvironment),
      webBaseUrl: `http://127.0.0.1:${webPort}`,
      webBuildId: webIdentity.release.webBuildId,
      webUnit: webUnit.unit,
      webUnitFileSha256: webUnit.fragmentSha256,
    },
    { expectedPhase, expectedReleaseSha: releaseSha },
  );
}

const BRIDGE_LOCK_HOLDER = String.raw`
import fcntl, os, stat, sys
p = sys.argv[1]
fd = os.open(p, os.O_RDWR | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0))
s = os.fstat(fd)
ps = os.stat(p, follow_symlinks=False)
if (not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or s.st_gid != 0 or
    stat.S_IMODE(s.st_mode) != 0o600 or s.st_nlink != 1 or
    (s.st_dev, s.st_ino) != (ps.st_dev, ps.st_ino)):
    raise SystemExit(71)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    raise SystemExit(72)
ps2 = os.stat(p, follow_symlinks=False)
if (s.st_dev, s.st_ino) != (ps2.st_dev, ps2.st_ino):
    raise SystemExit(73)
sys.stdout.write("LOCKED\n")
sys.stdout.flush()
sys.stdin.buffer.read()
fcntl.flock(fd, fcntl.LOCK_UN)
os.close(fd)
`;

export function createFounderPilotCurrent188ProductionBridgeRuntimeAdapter({
  now = () => new Date(),
  releaseSha,
} = {}) {
  if (
    process.platform !== "linux" ||
    typeof process.geteuid !== "function" ||
    process.geteuid() !== 0 ||
    !SHA40.test(releaseSha ?? "")
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_RUNTIME_AUTHORITY_REQUIRED");
  }
  let lock = null;
  async function acquireLock() {
    if (lock !== null) fail("CURRENT188_UPGRADE_BRIDGE_LOCK_INVALID");
    await assertProtectedBridgeDirectory(BRIDGE_STATE_ROOT);
    await readProtectedBridgeFile(`${BRIDGE_STATE_ROOT}/cutover.lock`, {
      allowEmpty: true,
      maximumBytes: 16 * 1024,
      mode: 0o600,
    });
    const python = await trustedBridgeExecutable(
      "/usr/bin/python3",
      /^\/usr\/bin\/python3(?:\.\d+)*$/u,
    );
    const child = spawn(
      python,
      [
        "-I",
        "-S",
        "-E",
        "-c",
        BRIDGE_LOCK_HOLDER,
        `${BRIDGE_STATE_ROOT}/cutover.lock`,
      ],
      {
        env: {
          LANG: "C.UTF-8",
          LC_ALL: "C.UTF-8",
          PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
          TZ: "UTC",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    const closePromise = new Promise((resolve) => {
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    const acquired = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("BRIDGE_LOCK_TIMEOUT"));
      }, BRIDGE_LOCK_TIMEOUT_MS);
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
        if (stdout === "LOCKED\n") {
          clearTimeout(timer);
          resolve(true);
        } else if (stdout.length > 16) {
          clearTimeout(timer);
          reject(new Error("BRIDGE_LOCK_OUTPUT_INVALID"));
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
        if (stderr.length > 4096) child.kill("SIGKILL");
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", () => {
        if (stdout !== "LOCKED\n") {
          clearTimeout(timer);
          reject(new Error("BRIDGE_LOCK_UNAVAILABLE"));
        }
      });
    }).catch(async () => {
      child.kill("SIGKILL");
      await closePromise;
      fail("CURRENT188_UPGRADE_BRIDGE_LOCK_UNAVAILABLE");
    });
    if (acquired !== true || stderr !== "" || child.exitCode !== null) {
      child.kill("SIGKILL");
      await closePromise;
      fail("CURRENT188_UPGRADE_BRIDGE_LOCK_UNAVAILABLE");
    }
    lock = { child, closePromise, stderr: () => stderr };
  }
  async function releaseLock() {
    if (lock === null) return;
    const held = lock;
    lock = null;
    held.child.stdin.end();
    let releaseTimer;
    const result = await Promise.race([
      held.closePromise,
      new Promise(
        (resolve) =>
          (releaseTimer = setTimeout(
            () => resolve({ code: null, signal: "TIMEOUT" }),
            BRIDGE_LOCK_TIMEOUT_MS,
          )),
      ),
    ]);
    clearTimeout(releaseTimer);
    if (result.code !== 0 || result.signal !== null || held.stderr() !== "") {
      held.child.kill("SIGKILL");
      fail("CURRENT188_UPGRADE_BRIDGE_LOCK_RELEASE_FAILED");
    }
  }
  function inspect(expectedPhase) {
    if (lock === null || lock.child.exitCode !== null) {
      fail("CURRENT188_UPGRADE_BRIDGE_LOCK_REQUIRED");
    }
    return inspectLiveBridgeRuntime({ expectedPhase, now, releaseSha });
  }
  return Object.freeze({
    acquireLock,
    close: releaseLock,
    inspectSource: () => inspect(BRIDGE_SOURCE_PHASE),
    inspectTarget: () => inspect(BRIDGE_TARGET_PHASE),
    releaseLock,
  });
}

function toLegacyManifest(manifest) {
  return {
    ...manifest,
    contractVersion: FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT,
    operation: {
      deployTimeoutSeconds: manifest.operation.deployTimeoutSeconds,
      expectedStaleRunSetDigest: "0".repeat(64),
    },
  };
}

export function normalizeFounderPilotCurrent188ProductionUpgradeManifest(
  value,
) {
  const manifest = exactRecord(
    value,
    [
      "approval",
      "contractVersion",
      "environment",
      "operation",
      "release",
      "target",
    ],
    "CURRENT188_UPGRADE_MANIFEST_INVALID",
  );
  if (
    manifest.contractVersion !==
    FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT
  ) {
    fail("CURRENT188_UPGRADE_CONTRACT_INVALID");
  }
  const operation = exactRecord(
    manifest.operation,
    ["deployTimeoutSeconds"],
    "CURRENT188_UPGRADE_OPERATION_INVALID",
  );
  const normalizedLegacy =
    normalizeFounderPilotProductionHistoryProductionManifest(
      toLegacyManifest(manifest),
    );
  return Object.freeze({
    ...normalizedLegacy,
    contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
    operation: Object.freeze({
      deployTimeoutSeconds: operation.deployTimeoutSeconds,
    }),
  });
}

export function founderPilotCurrent188ProductionUpgradeManifestDigest(value) {
  return digest(
    "production-manifest",
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(value),
  );
}

function canonicalPublicKey(pem, expectedFingerprint) {
  let key;
  try {
    key = createPublicKey(pem);
  } catch {
    fail("CURRENT188_UPGRADE_APPROVAL_KEY_INVALID");
  }
  if (
    key.asymmetricKeyType !== "ed25519" ||
    sha256(key.export({ format: "der", type: "spki" })) !== expectedFingerprint
  ) {
    fail("CURRENT188_UPGRADE_APPROVAL_KEY_INVALID");
  }
  return key;
}

function migrationDigest(rows) {
  return sha256(
    rows
      .map(({ checksum, migrationName }) => `${migrationName}\0${checksum}`)
      .sort()
      .join("\n"),
  );
}

async function inspectMaterializedLane({ laneRoot, sourcePrismaRoot }) {
  const lane = await materializeFounderPilotProductionHistoryLane({
    laneRoot,
    sourcePrismaRoot,
    targetMigrationCount: TARGET_COUNT,
    targetMigrationHead: TARGET_HEAD,
  });
  normalizeSha256(
    lane.treeDigest,
    "CURRENT188_UPGRADE_MATERIALIZED_TREE_INVALID",
  );
  if (lane.migrationCount !== TARGET_COUNT) {
    fail("CURRENT188_UPGRADE_MATERIALIZED_TREE_INVALID");
  }
  const migrationsRoot = path.join(laneRoot, "migrations");
  const names = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (names.length !== TARGET_COUNT || names.at(-1) !== TARGET_HEAD) {
    fail("CURRENT188_UPGRADE_MATERIALIZED_TREE_INVALID");
  }
  const rows = await Promise.all(
    names.map(async (migrationName) => ({
      checksum:
        LEGACY_APPLIED_CHECKSUMS.get(migrationName) ??
        sha256(
          await readFile(
            path.join(migrationsRoot, migrationName, "migration.sql"),
          ),
        ),
      migrationName,
    })),
  );
  const target = rows.at(-1);
  if (
    target?.migrationName !== TARGET_HEAD ||
    target?.checksum !== TARGET_MIGRATION_SHA256
  ) {
    fail("CURRENT188_UPGRADE_TARGET_MIGRATION_DRIFT");
  }
  const sourceRows = rows.slice(0, -1);
  return Object.freeze({
    finalManifestDigest: migrationDigest(rows),
    sourceManifestDigest: migrationDigest(sourceRows),
    sourceRows: Object.freeze(sourceRows.map((row) => Object.freeze(row))),
    targetRows: Object.freeze(rows.map((row) => Object.freeze(row))),
    treeDigest: lane.treeDigest,
  });
}

function normalizeSha256(value, reasonCode) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(reasonCode);
  return value;
}

function appliedRows(evidence) {
  return evidence.migrationRows
    .filter((row) => row.applied === true)
    .map((row) => ({
      checksum: row.checksum,
      migrationName: row.migrationName,
    }));
}

function rowsEqual(actual, expected) {
  if (actual.length !== expected.length) return false;
  return actual.every(
    (row, index) =>
      row.migrationName === expected[index].migrationName &&
      row.checksum === expected[index].checksum,
  );
}

function exactSourceState(evidence, lane) {
  return (
    evidence?.migrationCount === SOURCE_COUNT &&
    evidence?.migrationHead === SOURCE_HEAD &&
    evidence?.migrationManifestDigest === lane.sourceManifestDigest &&
    evidence?.rolledBackMigrationCount ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount &&
    evidence?.rolledBackMigrationManifestDigest ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest &&
    evidence?.unfinishedMigrationCount === 0 &&
    Array.isArray(evidence?.runningDigestRows) &&
    evidence.runningDigestRows.length === 0 &&
    rowsEqual(appliedRows(evidence), lane.sourceRows)
  );
}

function exactFinalState(evidence, lane) {
  return (
    evidence?.migrationCount === TARGET_COUNT &&
    evidence?.migrationHead === TARGET_HEAD &&
    evidence?.migrationManifestDigest === lane.finalManifestDigest &&
    evidence?.rolledBackMigrationCount ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount &&
    evidence?.rolledBackMigrationManifestDigest ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest &&
    evidence?.unfinishedMigrationCount === 0 &&
    Array.isArray(evidence?.runningDigestRows) &&
    evidence.runningDigestRows.length === 0 &&
    rowsEqual(appliedRows(evidence), lane.targetRows)
  );
}

function arraysEqual(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function supportContractExact(evidence) {
  return (
    evidence?.migrationChecksum === TARGET_MIGRATION_SHA256 &&
    arraysEqual(evidence.tableNames, EXPECTED_TABLES) &&
    arraysEqual(evidence.indexNames, EXPECTED_INDEXES) &&
    arraysEqual(evidence.constraintNames, EXPECTED_CONSTRAINTS) &&
    Array.isArray(evidence.enumTypes) &&
    stableJson(evidence.enumTypes) === stableJson(EXPECTED_ENUMS) &&
    evidence.publicTablePrivilegeCount === 0 &&
    evidence.publicWorkerExecuteCount === 0
  );
}

function planBase(plan) {
  const { planDigest: _ignored, ...base } = plan;
  return base;
}

function normalizePlan(value) {
  const plan = exactRecord(
    value,
    [
      "approvalKeyId",
      "approvalKeySpkiSha256",
      "artifactSha256",
      "bridgeAttestation",
      "contractVersion",
      "decision",
      "expiresAt",
      "materializedTreeDigest",
      "plannedAt",
      "planDigest",
      "productionManifestDigest",
      "releaseSha",
      "sourceMigrationCount",
      "sourceMigrationManifestDigest",
      "sourceRolledBackMigrationCount",
      "sourceRolledBackMigrationManifestDigest",
      "sourceSchemaHead",
      "targetIdentityDigest",
      "targetMigrationCount",
      "targetMigrationSha256",
      "targetSchemaHead",
    ],
    "CURRENT188_UPGRADE_PLAN_INVALID",
  );
  if (
    plan.contractVersion !==
      FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT ||
    plan.decision !== FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_PLAN_READY ||
    !SHA40.test(plan.releaseSha) ||
    !SHA256.test(plan.planDigest) ||
    ![
      plan.approvalKeySpkiSha256,
      plan.artifactSha256,
      plan.materializedTreeDigest,
      plan.productionManifestDigest,
      plan.sourceMigrationManifestDigest,
      plan.sourceRolledBackMigrationManifestDigest,
      plan.targetIdentityDigest,
      plan.targetMigrationSha256,
    ].every((candidate) => SHA256.test(candidate)) ||
    !ISO_TIMESTAMP.test(plan.plannedAt) ||
    !ISO_TIMESTAMP.test(plan.expiresAt) ||
    plan.sourceMigrationCount !== SOURCE_COUNT ||
    plan.sourceSchemaHead !== SOURCE_HEAD ||
    plan.targetMigrationCount !== TARGET_COUNT ||
    plan.targetSchemaHead !== TARGET_HEAD ||
    plan.targetMigrationSha256 !== TARGET_MIGRATION_SHA256 ||
    plan.sourceRolledBackMigrationCount !==
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount ||
    digest("production-plan", planBase(plan)) !== plan.planDigest
  ) {
    fail("CURRENT188_UPGRADE_PLAN_INVALID");
  }
  return Object.freeze({
    ...plan,
    bridgeAttestation: normalizeFounderPilotCurrent188BridgeAttestation(
      plan.bridgeAttestation,
      {
        expectedPhase: BRIDGE_SOURCE_PHASE,
        expectedReleaseSha: plan.releaseSha,
      },
    ),
  });
}

function assertPlanWindow(plan, manifest, now) {
  const plannedAt = new Date(plan.plannedAt);
  const expiresAt = new Date(plan.expiresAt);
  if (
    !Number.isFinite(plannedAt.valueOf()) ||
    !Number.isFinite(expiresAt.valueOf()) ||
    expiresAt.valueOf() - plannedAt.valueOf() !==
      manifest.approval.maxPlanAgeSeconds * 1000 ||
    now < plannedAt ||
    now >= expiresAt
  ) {
    fail("CURRENT188_UPGRADE_PLAN_EXPIRED");
  }
}

async function inspectRelease({
  inspectArtifact,
  laneRoot,
  manifest,
  sourcePrismaRoot,
}) {
  const [artifact, lane] = await Promise.all([
    inspectArtifact({
      expectedSha256: manifest.release.artifactSha256,
      filePath: manifest.release.artifactPath,
    }),
    inspectMaterializedLane({ laneRoot, sourcePrismaRoot }),
  ]);
  if (lane.treeDigest !== manifest.release.materializedTreeDigest) {
    fail("CURRENT188_UPGRADE_MATERIALIZED_TREE_MISMATCH");
  }
  return Object.freeze({ artifact, lane });
}

function createCurrent188ProductionUpgradePlan({
  bridgeAttestation: rawBridgeAttestation,
  evidence,
  manifest,
  plannedAt,
  release,
}) {
  const identity = normalizeFounderPilotProductionHistoryProductionIdentity(
    evidence.identity,
    manifest.target,
  );
  if (!exactSourceState(evidence, release.lane)) {
    fail("CURRENT188_UPGRADE_SOURCE_STATE_MISMATCH");
  }
  const bridgeAttestation = normalizeFounderPilotCurrent188BridgeAttestation(
    rawBridgeAttestation,
    {
      expectedPhase: BRIDGE_SOURCE_PHASE,
      expectedReleaseSha: manifest.release.releaseSha,
    },
  );
  if (
    parseNanoTimestamp(bridgeAttestation.acceptedAt).valueOf() >
    plannedAt.valueOf() + 5_000
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_ATTESTATION_INVALID");
  }
  const base = {
    approvalKeyId: manifest.approval.keyId,
    approvalKeySpkiSha256: manifest.approval.publicKeySpkiSha256,
    artifactSha256: manifest.release.artifactSha256,
    bridgeAttestation,
    contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
    decision: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_PLAN_READY,
    expiresAt: new Date(
      plannedAt.valueOf() + manifest.approval.maxPlanAgeSeconds * 1000,
    ).toISOString(),
    materializedTreeDigest: release.lane.treeDigest,
    plannedAt: plannedAt.toISOString(),
    productionManifestDigest:
      founderPilotCurrent188ProductionUpgradeManifestDigest(manifest),
    releaseSha: manifest.release.releaseSha,
    sourceMigrationCount: SOURCE_COUNT,
    sourceMigrationManifestDigest: release.lane.sourceManifestDigest,
    sourceRolledBackMigrationCount: evidence.rolledBackMigrationCount,
    sourceRolledBackMigrationManifestDigest:
      evidence.rolledBackMigrationManifestDigest,
    sourceSchemaHead: SOURCE_HEAD,
    targetIdentityDigest:
      founderPilotProductionHistoryProductionIdentityDigest(identity),
    targetMigrationCount: TARGET_COUNT,
    targetMigrationSha256: TARGET_MIGRATION_SHA256,
    targetSchemaHead: TARGET_HEAD,
  };
  return Object.freeze({
    ...base,
    planDigest: digest("production-plan", base),
  });
}

export async function buildFounderPilotCurrent188ProductionUpgradePlan({
  adapter,
  inspectArtifact = inspectFounderPilotImmutableFile,
  laneRoot,
  manifest: rawManifest,
  now = () => new Date(),
  runtimeAdapter,
  sourcePrismaRoot,
}) {
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  if (
    !adapter ||
    typeof adapter.inspectTarget !== "function" ||
    typeof inspectArtifact !== "function"
  ) {
    fail("CURRENT188_UPGRADE_ADAPTER_INVALID");
  }
  const bridgeRuntime = exactBridgeRuntimeAdapter(runtimeAdapter);
  const plannedAt = currentDate(now);
  let bridgeLockHeld = false;
  try {
    await bridgeRuntime.acquireLock();
    bridgeLockHeld = true;
    const [release, evidence, bridgeAttestation] = await Promise.all([
      inspectRelease({ inspectArtifact, laneRoot, manifest, sourcePrismaRoot }),
      adapter.inspectTarget(),
      bridgeRuntime.inspectSource(),
    ]);
    return createCurrent188ProductionUpgradePlan({
      bridgeAttestation,
      evidence,
      manifest,
      plannedAt,
      release,
    });
  } finally {
    if (bridgeLockHeld) await bridgeRuntime.releaseLock();
  }
}

export async function inspectFounderPilotCurrent188ProductionUpgradeInventory({
  adapter,
  laneRoot,
  manifest: rawManifest,
  now = () => new Date(),
  sourcePrismaRoot,
}) {
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  const observedAt = currentDate(now);
  const [release, evidence] = await Promise.all([
    inspectRelease({
      inspectArtifact: inspectFounderPilotImmutableFile,
      laneRoot,
      manifest,
      sourcePrismaRoot,
    }),
    adapter.inspectTarget(),
  ]);
  const identity = normalizeFounderPilotProductionHistoryProductionIdentity(
    evidence.identity,
    manifest.target,
  );
  if (!exactSourceState(evidence, release.lane)) {
    fail("CURRENT188_UPGRADE_SOURCE_STATE_MISMATCH");
  }
  return Object.freeze({
    contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
    decision: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_INVENTORY_READY,
    observedAt: observedAt.toISOString(),
    reasonCode: null,
    sourceMigrationCount: SOURCE_COUNT,
    sourceMigrationManifestDigest: release.lane.sourceManifestDigest,
    sourceRolledBackMigrationCount: evidence.rolledBackMigrationCount,
    sourceRolledBackMigrationManifestDigest:
      evidence.rolledBackMigrationManifestDigest,
    sourceSchemaHead: SOURCE_HEAD,
    targetIdentityDigest:
      founderPilotProductionHistoryProductionIdentityDigest(identity),
    targetMigrationCount: TARGET_COUNT,
    targetMigrationSha256: TARGET_MIGRATION_SHA256,
    targetSchemaHead: TARGET_HEAD,
  });
}

function approvalPayload(plan) {
  return Buffer.from(
    `${FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT}\0approval\0${plan.planDigest}`,
  );
}

export function signFounderPilotCurrent188ProductionUpgradePlan({
  manifest: rawManifest,
  plan: rawPlan,
  privateKeyPem,
}) {
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch {
    fail("CURRENT188_UPGRADE_PRIVATE_KEY_INVALID");
  }
  if (
    privateKey.asymmetricKeyType !== "ed25519" ||
    sha256(
      createPublicKey(privateKey).export({ format: "der", type: "spki" }),
    ) !== manifest.approval.publicKeySpkiSha256
  ) {
    fail("CURRENT188_UPGRADE_PRIVATE_KEY_INVALID");
  }
  return Object.freeze({
    algorithm: "Ed25519",
    contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
    keyId: manifest.approval.keyId,
    planDigest: plan.planDigest,
    signature: sign(null, approvalPayload(plan), privateKey).toString(
      "base64url",
    ),
  });
}

export function verifyFounderPilotCurrent188ProductionUpgradeApproval({
  approval,
  manifest: rawManifest,
  pinnedApprovalKeySpkiSha256,
  plan: rawPlan,
}) {
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  const receipt = exactRecord(
    approval,
    ["algorithm", "contractVersion", "keyId", "planDigest", "signature"],
    "CURRENT188_UPGRADE_APPROVAL_INVALID",
  );
  if (
    receipt.algorithm !== "Ed25519" ||
    receipt.contractVersion !==
      FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT ||
    receipt.keyId !== manifest.approval.keyId ||
    receipt.planDigest !== plan.planDigest ||
    !BASE64URL_SIGNATURE.test(receipt.signature) ||
    pinnedApprovalKeySpkiSha256 !== manifest.approval.publicKeySpkiSha256
  ) {
    fail("CURRENT188_UPGRADE_APPROVAL_INVALID");
  }
  const key = canonicalPublicKey(
    manifest.approval.publicKeyPem,
    manifest.approval.publicKeySpkiSha256,
  );
  if (
    !verify(
      null,
      approvalPayload(plan),
      key,
      Buffer.from(receipt.signature, "base64url"),
    )
  ) {
    fail("CURRENT188_UPGRADE_APPROVAL_INVALID");
  }
  return Object.freeze({ approvalDigest: digest("approval", receipt) });
}

async function emitPhase(onPhase, plan, phase, extra = {}) {
  if (typeof onPhase !== "function") {
    fail("CURRENT188_UPGRADE_PHASE_JOURNAL_REQUIRED");
  }
  await onPhase(
    Object.freeze({
      contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
      phase,
      planDigest: plan.planDigest,
      ...extra,
    }),
  );
}

function boundedDeploymentEvidence(result) {
  const evidence = { status: result?.status ?? null };
  for (const key of [
    "exitCode",
    "signal",
    "stderrBytes",
    "stderrSha256",
    "stdoutBytes",
    "stdoutSha256",
  ]) {
    if (result?.[key] !== undefined) evidence[key] = result[key];
  }
  return Object.freeze(evidence);
}

async function verifyFinal({ adapter, lane, manifest }) {
  const [evidence, runtime, support] = await Promise.all([
    adapter.inspectTarget(),
    adapter.inspectFinal(),
    adapter.inspectCurrent188SupportContract(),
  ]);
  const identity = normalizeFounderPilotProductionHistoryProductionIdentity(
    evidence.identity,
    manifest.target,
  );
  if (
    !exactFinalState(evidence, lane) ||
    runtime?.preterminalManifestDigest !== TARGET_PRETERMINAL_MANIFEST_SHA256 ||
    runtime?.workerFunctionDigest !== TARGET_WORKER_FUNCTION_SHA256 ||
    !supportContractExact(support)
  ) {
    return null;
  }
  return Object.freeze({
    identityDigest:
      founderPilotProductionHistoryProductionIdentityDigest(identity),
    migrationCount: evidence.migrationCount,
    migrationHead: evidence.migrationHead,
    migrationManifestDigest: evidence.migrationManifestDigest,
    supportContractDigest: digest("support-contract", support),
    workerFunctionDigest: runtime.workerFunctionDigest,
  });
}

async function verifyBridgeTarget({
  manifest,
  runtimeAdapter,
  sourceAttestation = null,
}) {
  const targetAttestation = normalizeFounderPilotCurrent188BridgeAttestation(
    await runtimeAdapter.inspectTarget(),
    {
      expectedPhase: BRIDGE_TARGET_PHASE,
      expectedReleaseSha: manifest.release.releaseSha,
    },
  );
  if (
    sourceAttestation !== null &&
    stableJson(bridgeAttestationInvariant(sourceAttestation)) !==
      stableJson(bridgeAttestationInvariant(targetAttestation))
  ) {
    fail("CURRENT188_UPGRADE_BRIDGE_TARGET_STATE_MISMATCH");
  }
  return Object.freeze({
    bridgeAttestationDigest: founderPilotCurrent188BridgeAttestationDigest(
      targetAttestation,
      {
        expectedPhase: BRIDGE_TARGET_PHASE,
        expectedReleaseSha: manifest.release.releaseSha,
      },
    ),
    bridgeCutoverGeneration: targetAttestation.cutoverGeneration,
    bridgeSlot: targetAttestation.slot,
  });
}

export async function verifyFounderPilotCurrent188ProductionUpgradeFinal({
  adapter,
  laneRoot,
  manifest: rawManifest,
  runtimeAdapter,
  sourcePrismaRoot,
}) {
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  const bridgeRuntime = exactBridgeRuntimeAdapter(runtimeAdapter);
  for (const method of ["acquireLock", "releaseLock"]) {
    if (typeof adapter?.[method] !== "function") {
      fail("CURRENT188_UPGRADE_ADAPTER_INVALID");
    }
  }
  let bridgeLockHeld = false;
  let databaseLockHeld = false;
  try {
    await bridgeRuntime.acquireLock();
    bridgeLockHeld = true;
    await adapter.acquireLock();
    databaseLockHeld = true;
    const release = await inspectRelease({
      inspectArtifact: inspectFounderPilotImmutableFile,
      laneRoot,
      manifest,
      sourcePrismaRoot,
    });
    const final = await verifyFinal({ adapter, lane: release.lane, manifest });
    if (final === null) fail("CURRENT188_UPGRADE_FINAL_STATE_NOT_REACHED");
    const bridge = await verifyBridgeTarget({
      manifest,
      runtimeAdapter: bridgeRuntime,
    });
    return Object.freeze({ ...final, ...bridge });
  } finally {
    if (databaseLockHeld) await adapter.releaseLock();
    if (bridgeLockHeld) await bridgeRuntime.releaseLock();
  }
}

export async function applyFounderPilotCurrent188ProductionUpgradePlan({
  adapter,
  approval,
  confirmPlanDigest,
  deploy,
  inspectArtifact = inspectFounderPilotImmutableFile,
  laneRoot,
  manifest: rawManifest,
  now = () => new Date(),
  onPhase,
  pinnedApprovalKeySpkiSha256,
  plan: rawPlan,
  productionConfirmation,
  runtimeAdapter,
  sourcePrismaRoot,
}) {
  if (
    productionConfirmation !==
    FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION
  ) {
    fail("CURRENT188_UPGRADE_PRODUCTION_CONFIRMATION_REQUIRED");
  }
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  if (!safeEqual(confirmPlanDigest, plan.planDigest)) {
    fail("CURRENT188_UPGRADE_PLAN_CONFIRMATION_MISMATCH");
  }
  assertPlanWindow(plan, manifest, currentDate(now));
  const approvalReceipt = verifyFounderPilotCurrent188ProductionUpgradeApproval(
    {
      approval,
      manifest,
      pinnedApprovalKeySpkiSha256,
      plan,
    },
  );
  for (const method of [
    "acquireLock",
    "inspectCurrent188SupportContract",
    "inspectFinal",
    "inspectTarget",
    "releaseLock",
  ]) {
    if (typeof adapter?.[method] !== "function") {
      fail("CURRENT188_UPGRADE_ADAPTER_INVALID");
    }
  }
  if (typeof deploy !== "function") fail("CURRENT188_UPGRADE_DEPLOY_INVALID");
  const bridgeRuntime = exactBridgeRuntimeAdapter(runtimeAdapter);
  await emitPhase(onPhase, plan, "APPROVAL_VERIFIED", {
    approvalDigest: approvalReceipt.approvalDigest,
  });
  let lockHeld = false;
  let bridgeLockHeld = false;
  try {
    await bridgeRuntime.acquireLock();
    bridgeLockHeld = true;
    await emitPhase(onPhase, plan, "BRIDGE_CUTOVER_LOCK_ACQUIRED");
    await adapter.acquireLock();
    lockHeld = true;
    await emitPhase(onPhase, plan, "CONTROLLER_LOCK_ACQUIRED");
    const release = await inspectRelease({
      inspectArtifact,
      laneRoot,
      manifest,
      sourcePrismaRoot,
    });
    const existingFinal = await verifyFinal({
      adapter,
      lane: release.lane,
      manifest,
    });
    if (existingFinal !== null) {
      if (existingFinal.identityDigest !== plan.targetIdentityDigest) {
        fail("CURRENT188_UPGRADE_RECOVERY_IDENTITY_MISMATCH");
      }
      const bridge = await verifyBridgeTarget({
        manifest,
        runtimeAdapter: bridgeRuntime,
        sourceAttestation: plan.bridgeAttestation,
      });
      await emitPhase(onPhase, plan, "FINAL_188_VERIFIED", {
        bridgeAttestationDigest: bridge.bridgeAttestationDigest,
        deploymentAttempt: 0,
        recoveredFromLostResponse: true,
      });
      return Object.freeze({
        ...existingFinal,
        ...bridge,
        contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
        decision: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_APPLIED,
        deploymentAttempt: 0,
        planDigest: plan.planDigest,
        reasonCode: null,
        recoveredFromLostResponse: true,
      });
    }
    const [freshEvidence, freshBridgeAttestation] = await Promise.all([
      adapter.inspectTarget(),
      bridgeRuntime.inspectSource(),
    ]);
    const normalizedFreshBridgeAttestation =
      normalizeFounderPilotCurrent188BridgeAttestation(freshBridgeAttestation, {
        expectedPhase: BRIDGE_SOURCE_PHASE,
        expectedReleaseSha: manifest.release.releaseSha,
      });
    if (
      stableJson(normalizedFreshBridgeAttestation) !==
      stableJson(plan.bridgeAttestation)
    ) {
      fail("CURRENT188_UPGRADE_BRIDGE_ATTESTATION_MISMATCH");
    }
    const freshPlan = createCurrent188ProductionUpgradePlan({
      bridgeAttestation: normalizedFreshBridgeAttestation,
      evidence: freshEvidence,
      manifest,
      plannedAt: new Date(plan.plannedAt),
      release,
    });
    if (!safeEqual(freshPlan.planDigest, plan.planDigest)) {
      fail("CURRENT188_UPGRADE_FRESH_PLAN_MISMATCH");
    }
    await emitPhase(onPhase, plan, "ACTIVE_BRIDGE_SOURCE_187_VERIFIED", {
      bridgeAttestationDigest: founderPilotCurrent188BridgeAttestationDigest(
        normalizedFreshBridgeAttestation,
        {
          expectedPhase: BRIDGE_SOURCE_PHASE,
          expectedReleaseSha: manifest.release.releaseSha,
        },
      ),
      bridgeCutoverGeneration:
        normalizedFreshBridgeAttestation.cutoverGeneration,
      bridgeSlot: normalizedFreshBridgeAttestation.slot,
    });
    let attempt = 1;
    let recoveredFromLostResponse = false;
    while (attempt <= 2) {
      await emitPhase(onPhase, plan, "PRISMA_DEPLOY_INTENT_DURABLE", {
        attempt,
        targetMigrationSha256: TARGET_MIGRATION_SHA256,
      });
      const result = await deploy({
        attempt,
        databaseUrlRedactionRequired: true,
        laneRoot,
        timeoutSeconds: manifest.operation.deployTimeoutSeconds,
      });
      await emitPhase(
        onPhase,
        plan,
        result?.status === "SUCCEEDED"
          ? "PRISMA_DEPLOY_RESPONSE_SUCCEEDED"
          : result?.status === "FAILED"
            ? "PRISMA_DEPLOY_RESPONSE_FAILED"
            : "PRISMA_DEPLOY_RESPONSE_AMBIGUOUS",
        { attempt, deployment: boundedDeploymentEvidence(result) },
      );
      if (result?.status === "FAILED") {
        fail("CURRENT188_UPGRADE_PRISMA_DEPLOY_FAILED");
      }
      if (!["AMBIGUOUS", "SUCCEEDED"].includes(result?.status)) {
        fail("CURRENT188_UPGRADE_PRISMA_DEPLOY_RESULT_INVALID");
      }
      const final = await verifyFinal({
        adapter,
        lane: release.lane,
        manifest,
      });
      if (final !== null) {
        recoveredFromLostResponse = result.status === "AMBIGUOUS";
        const bridge = await verifyBridgeTarget({
          manifest,
          runtimeAdapter: bridgeRuntime,
          sourceAttestation: plan.bridgeAttestation,
        });
        await emitPhase(onPhase, plan, "FINAL_188_VERIFIED", {
          bridgeAttestationDigest: bridge.bridgeAttestationDigest,
          deploymentAttempt: attempt,
          recoveredFromLostResponse,
        });
        return Object.freeze({
          ...final,
          ...bridge,
          contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
          decision: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_APPLIED,
          deploymentAttempt: attempt,
          planDigest: plan.planDigest,
          reasonCode: null,
          recoveredFromLostResponse,
        });
      }
      if (result.status === "SUCCEEDED") {
        fail("CURRENT188_UPGRADE_FINAL_STATE_NOT_REACHED");
      }
      const state = await adapter.inspectTarget();
      if (attempt !== 1 || !exactSourceState(state, release.lane)) {
        fail("CURRENT188_UPGRADE_PRISMA_DEPLOY_AMBIGUOUS");
      }
      attempt += 1;
    }
    fail("CURRENT188_UPGRADE_FINAL_STATE_NOT_REACHED");
  } finally {
    if (lockHeld) await adapter.releaseLock();
    if (bridgeLockHeld) await bridgeRuntime.releaseLock();
  }
}

export async function createFounderPilotCurrent188ProductionUpgradePgAdapter(
  databaseUrl,
  rawManifest,
  { productionConfirmation } = {},
) {
  if (
    productionConfirmation !==
    FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION
  ) {
    fail("CURRENT188_UPGRADE_PRODUCTION_CONFIRMATION_REQUIRED");
  }
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  return createFounderPilotProductionHistoryProductionPgAdapter(
    databaseUrl,
    toLegacyManifest(manifest),
    {
      productionConfirmation:
        FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
    },
  );
}

export const FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS =
  Object.freeze({
    sourceMigrationCount: SOURCE_COUNT,
    sourceMigrationHead: SOURCE_HEAD,
    targetMigrationCount: TARGET_COUNT,
    targetMigrationHead: TARGET_HEAD,
    targetMigrationSha256: TARGET_MIGRATION_SHA256,
    targetPreterminalManifestSha256: TARGET_PRETERMINAL_MANIFEST_SHA256,
    targetWorkerFunctionSha256: TARGET_WORKER_FUNCTION_SHA256,
  });
