#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";

const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const INVOCATION_ID_PATTERN = /^[0-9a-f]{32}$/u;
const EXPECTED_FRAGMENT_PATH =
  "/etc/systemd/system/leetplus-release-hydrate@.service";
const EXPECTED_FRAGMENT_SHA256 =
  "e482da60adc0a4cf342abe226d0d6da022db70b021f1081611958673eaf55510";
const EXPECTED_STAGER_SHA256 =
  "aa871e61a275636fdc5dd859e6f586ecf1a373741828a2c1d1f5a5e757b5aa98";
const MAX_INPUT_BYTES = 64 * 1024;

const FORBIDDEN_ENVIRONMENT_KEYS = [
  "DATABASE_URL",
  "JWT_SECRET",
  "GUEST_PORTAL_JWT_SECRET",
  "APP_ENCRYPTION_KEY",
  "INTEGRATION_ENCRYPTION_KEY",
  "SYNC_SERVICE_TOKEN",
  "LANGAME_API_KEY",
  "BASH_ENV",
  "ENV",
  "SHELL",
  "HOME",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_EXTRA_CA_CERTS",
  "NODE_USE_ENV_PROXY",
  "NODE_V8_COVERAGE",
  "NODE_COMPILE_CACHE",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
  "GCONV_PATH",
  "LOCPATH",
  "OPENSSL_CONF",
  "OPENSSL_MODULES",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "NPM_CONFIG_USERCONFIG",
  "npm_config_userconfig",
  "NPM_CONFIG_GLOBALCONFIG",
  "npm_config_globalconfig",
  "NPM_CONFIG_NODE_OPTIONS",
  "npm_config_node_options",
  "NPM_CONFIG_SCRIPT_SHELL",
  "npm_config_script_shell",
  "PNPM_HOME",
  "COREPACK_HOME",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
];

const STATIC_PROPERTIES = [
  "Id",
  "LoadState",
  "UnitFileState",
  "FragmentPath",
  "DropInPaths",
  "Type",
  "RemainAfterExit",
  "User",
  "Group",
  "SupplementaryGroups",
  "DynamicUser",
  "ExecStartPre",
  "ExecStart",
  "Environment",
  "EnvironmentFiles",
  "PassEnvironment",
  "SetLoginEnvironment",
  "UnsetEnvironment",
  "NoNewPrivileges",
  "PrivateTmp",
  "PrivateDevices",
  "ProtectSystem",
  "ProtectHome",
  "ProtectProc",
  "ProcSubset",
  "ProtectKernelTunables",
  "ProtectKernelModules",
  "ProtectKernelLogs",
  "ProtectControlGroups",
  "ProtectClock",
  "ProtectHostname",
  "CapabilityBoundingSet",
  "AmbientCapabilities",
  "LockPersonality",
  "RestrictRealtime",
  "RestrictSUIDSGID",
  "SystemCallArchitectures",
  "RestrictAddressFamilies",
  "IPAddressDeny",
  "IPAddressAllow",
  "ReadOnlyPaths",
  "ReadWritePaths",
  "InaccessiblePaths",
  "MemoryMax",
  "MemorySwapMax",
  "TasksMax",
  "CPUQuotaPerSecUSec",
  "LimitFSIZE",
  "UMask",
  "KillMode",
  "RootDirectory",
  "RootImage",
];

const COMPLETED_PROPERTIES = [
  ...STATIC_PROPERTIES,
  "ActiveState",
  "SubState",
  "Result",
  "ExecMainStatus",
  "InvocationID",
  "ControlGroup",
];

function fail(message) {
  process.stderr.write(`verify-release-hydration-systemd: ${message}\n`);
  process.exit(1);
}

function parseArguments(argv) {
  const result = new Map();
  const allowed = new Set([
    "--release-sha",
    "--snapshot",
    "--unit-file",
    "--stager-file",
    "--phase",
    "--expected-invocation-id",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || value === undefined || result.has(key)) {
      fail(`invalid or duplicate argument: ${key ?? "<missing>"}`);
    }
    result.set(key, value);
  }
  for (const required of [
    "--release-sha",
    "--snapshot",
    "--unit-file",
    "--stager-file",
    "--phase",
  ]) {
    if (!result.has(required)) fail(`missing required argument: ${required}`);
  }
  return result;
}

function readBoundedRegularFile(filePath, label) {
  let stat;
  try {
    stat = lstatSync(filePath);
  } catch {
    fail(`${label} is absent`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(`${label} must be a regular non-symlink file`);
  }
  if (stat.size <= 0 || stat.size > MAX_INPUT_BYTES) {
    fail(`${label} is empty or exceeds ${MAX_INPUT_BYTES} bytes`);
  }
  return readFileSync(filePath);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseSnapshot(bytes, expectedKeys) {
  const text = bytes.toString("utf8");
  if (Buffer.from(text, "utf8").compare(bytes) !== 0 || /[\r\0]/u.test(text)) {
    fail("systemd property snapshot is not canonical UTF-8 text");
  }
  if (!text.endsWith("\n"))
    fail("systemd property snapshot lacks final newline");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== expectedKeys.length) {
    fail("systemd property snapshot has an unexpected line count");
  }
  const allowedKeys = new Set(expectedKeys);
  const properties = new Map();
  for (const line of lines) {
    const separator = line.indexOf("=");
    if (separator <= 0)
      fail("systemd property snapshot contains a malformed line");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!allowedKeys.has(key)) fail(`unexpected systemd property: ${key}`);
    if (properties.has(key)) fail(`duplicate systemd property: ${key}`);
    properties.set(key, value);
  }
  for (const key of expectedKeys) {
    if (!properties.has(key)) fail(`missing systemd property: ${key}`);
  }
  return properties;
}

function assertExact(properties, key, expected) {
  if (properties.get(key) !== expected) {
    fail(`effective ${key} differs from the reviewed hydration policy`);
  }
}

function normalizeExactSet(value, key) {
  if (value === "") return [];
  const values = value.split(" ");
  if (
    values.some((item) => item.length === 0) ||
    new Set(values).size !== values.length
  ) {
    fail(`effective ${key} is not a canonical unique set`);
  }
  return values.sort((left, right) =>
    Buffer.from(left).compare(Buffer.from(right)),
  );
}

function assertExactSet(properties, key, expected) {
  const actual = normalizeExactSet(properties.get(key), key);
  const canonicalExpected = [...expected].sort((left, right) =>
    Buffer.from(left).compare(Buffer.from(right)),
  );
  if (JSON.stringify(actual) !== JSON.stringify(canonicalExpected)) {
    fail(`effective ${key} differs from the reviewed hydration policy`);
  }
  return actual.join(" ");
}

function assertExecStart(properties, releaseSha) {
  const expectedArgv =
    `/usr/bin/flock --exclusive --no-fork /run/leetplus-release/hydration.lock ` +
    `/usr/local/libexec/leetplus/stage-release-artifact.sh --release-sha ${releaseSha} ` +
    `--artifact /srv/leetplus/release-inbox/leetplus-release-${releaseSha}.tar.gz ` +
    `--artifact-sha256 /srv/leetplus/release-inbox/leetplus-release-${releaseSha}.tar.gz.sha256 ` +
    `--output-root /srv/leetplus/release-builds --pnpm-store-dir /srv/leetplus/pnpm-store --hydrate`;
  const value = properties.get("ExecStart");
  const prefix = `{ path=/usr/bin/flock ; argv[]=${expectedArgv} ; ignore_errors=no ; `;
  if (
    !value.startsWith(prefix) ||
    !value.endsWith(" }") ||
    value.slice(prefix.length, -2).length === 0 ||
    value.slice(prefix.length, -2).includes("{") ||
    value.slice(prefix.length, -2).includes("}") ||
    value.indexOf("argv[]=") !== value.lastIndexOf("argv[]=")
  ) {
    fail(
      "effective ExecStart differs from the one-command reviewed hydration policy",
    );
  }
  return expectedArgv;
}

function assertExecStartPre(properties, releaseSha) {
  const expectedArgv =
    `/usr/local/libexec/leetplus/stage-release-artifact.sh ` +
    `--release-sha ${releaseSha} --preflight-build-uid-fence`;
  const value = properties.get("ExecStartPre");
  const prefix =
    `{ path=/usr/local/libexec/leetplus/stage-release-artifact.sh ; ` +
    `argv[]=${expectedArgv} ; ignore_errors=no ; `;
  if (
    !value.startsWith(prefix) ||
    !value.endsWith(" }") ||
    value.slice(prefix.length, -2).length === 0 ||
    value.slice(prefix.length, -2).includes("{") ||
    value.slice(prefix.length, -2).includes("}") ||
    value.indexOf("argv[]=") !== value.lastIndexOf("argv[]=")
  ) {
    fail("effective ExecStartPre differs from the root build-UID fence policy");
  }
  return expectedArgv;
}

function validateStaticPolicy(
  properties,
  releaseSha,
  fragmentSha256,
  stagerSha256,
) {
  const unit = `leetplus-release-hydrate@${releaseSha}.service`;
  const normalized = {};
  const exactValues = {
    Id: unit,
    LoadState: "loaded",
    UnitFileState: "static",
    FragmentPath: EXPECTED_FRAGMENT_PATH,
    DropInPaths: "",
    Type: "oneshot",
    RemainAfterExit: "yes",
    User: "leetplus-build",
    Group: "leetplus-build",
    SupplementaryGroups: "",
    DynamicUser: "no",
    EnvironmentFiles: "",
    PassEnvironment: "",
    SetLoginEnvironment: "no",
    NoNewPrivileges: "yes",
    PrivateTmp: "yes",
    PrivateDevices: "yes",
    ProtectSystem: "strict",
    ProtectHome: "yes",
    ProtectProc: "invisible",
    ProcSubset: "pid",
    ProtectKernelTunables: "yes",
    ProtectKernelModules: "yes",
    ProtectKernelLogs: "yes",
    ProtectControlGroups: "yes",
    ProtectClock: "yes",
    ProtectHostname: "yes",
    CapabilityBoundingSet: "",
    AmbientCapabilities: "",
    LockPersonality: "yes",
    RestrictRealtime: "yes",
    RestrictSUIDSGID: "yes",
    SystemCallArchitectures: "native",
    InaccessiblePaths: "",
    MemoryPressureWatch: "skip",
    MemoryMax: "4294967296",
    MemorySwapMax: "0",
    TasksMax: "256",
    CPUQuotaPerSecUSec: "2s",
    LimitFSIZE: "2147483648",
    UMask: "0077",
    KillMode: "control-group",
    RootDirectory: "",
    RootImage: "",
  };
  for (const [key, expected] of Object.entries(exactValues)) {
    assertExact(properties, key, expected);
    normalized[key] = expected;
  }
  // systemctl renders the `any` alias as its effective IPv4/IPv6 prefixes.
  normalized.IPAddressDeny = assertExactSet(properties, "IPAddressDeny", [
    "0.0.0.0/0",
    "::/0",
  ]);
  normalized.IPAddressAllow = assertExactSet(
    properties,
    "IPAddressAllow",
    [],
  );
  normalized.Environment = assertExactSet(properties, "Environment", [
    "LEETPLUS_HYDRATION_SANDBOX=SYSTEMD_IP_DENY_ANY_V1",
    "PATH=/usr/sbin:/usr/bin:/sbin:/bin",
    "LANG=C.UTF-8",
    "LC_ALL=C.UTF-8",
    "TZ=UTC",
  ]);
  normalized.UnsetEnvironment = assertExactSet(
    properties,
    "UnsetEnvironment",
    FORBIDDEN_ENVIRONMENT_KEYS,
  );
  // systemctl show renders the effective empty allow-list from the fragment's
  // literal `none` as an empty value; an unrestricted empty deny-list renders
  // as `~`. The pinned fragment digest and live socket probes bind the source
  // spelling and kernel effect respectively.
  normalized.RestrictAddressFamilies = assertExactSet(
    properties,
    "RestrictAddressFamilies",
    [],
  );
  normalized.ReadOnlyPaths = assertExactSet(properties, "ReadOnlyPaths", [
    "/srv/leetplus/release-inbox",
    "/srv/leetplus/pnpm-store",
  ]);
  normalized.ReadWritePaths = assertExactSet(properties, "ReadWritePaths", [
    "/run/leetplus-release/hydration.lock",
    "/srv/leetplus/release-builds",
  ]);
  normalized.ExecStartPre = assertExecStartPre(properties, releaseSha);
  normalized.ExecStart = assertExecStart(properties, releaseSha);
  normalized.FragmentSha256 = fragmentSha256;
  normalized.StagerSha256 = stagerSha256;
  const canonicalPolicy = Object.entries(normalized)
    .sort(([left], [right]) => Buffer.from(left).compare(Buffer.from(right)))
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");
  return sha256(Buffer.from(canonicalPolicy, "utf8"));
}

const args = parseArguments(process.argv.slice(2));
const releaseSha = args.get("--release-sha");
const phase = args.get("--phase");
const expectedInvocationId = args.get("--expected-invocation-id");
if (!RELEASE_SHA_PATTERN.test(releaseSha)) fail("release SHA is invalid");
if (!["completed", "policy"].includes(phase))
  fail("phase must be completed or policy");
if (phase === "completed") {
  if (!INVOCATION_ID_PATTERN.test(expectedInvocationId ?? "")) {
    fail("completed phase requires an exact expected invocation ID");
  }
} else if (expectedInvocationId !== undefined) {
  fail("policy phase must not accept an invocation ID");
}

const unitBytes = readBoundedRegularFile(
  args.get("--unit-file"),
  "hydration unit fragment",
);
const fragmentSha256 = sha256(unitBytes);
if (fragmentSha256 !== EXPECTED_FRAGMENT_SHA256) {
  fail(
    "installed hydration unit fragment digest differs from the reviewed template",
  );
}
const stagerBytes = readBoundedRegularFile(
  args.get("--stager-file"),
  "installed hydration stager",
);
const stagerSha256 = sha256(stagerBytes);
if (stagerSha256 !== EXPECTED_STAGER_SHA256) {
  fail("installed hydration stager digest differs from the reviewed script");
}
const expectedKeys =
  phase === "completed" ? COMPLETED_PROPERTIES : STATIC_PROPERTIES;
const snapshot = parseSnapshot(
  readBoundedRegularFile(args.get("--snapshot"), "systemd property snapshot"),
  expectedKeys,
);
const policySha256 = validateStaticPolicy(
  snapshot,
  releaseSha,
  fragmentSha256,
  stagerSha256,
);

if (phase === "completed") {
  assertExact(snapshot, "ActiveState", "active");
  assertExact(snapshot, "SubState", "exited");
  assertExact(snapshot, "Result", "success");
  assertExact(snapshot, "ExecMainStatus", "0");
  assertExact(snapshot, "InvocationID", expectedInvocationId);
  assertExact(
    snapshot,
    "ControlGroup",
    `/system.slice/leetplus-release-hydrate@${releaseSha}.service`,
  );
}

process.stdout.write("HYDRATION_SYSTEMD_POLICY_VERSION=1\n");
process.stdout.write(
  `HYDRATION_SYSTEMD_UNIT=leetplus-release-hydrate@${releaseSha}.service\n`,
);
process.stdout.write(`HYDRATION_SYSTEMD_FRAGMENT_SHA256=${fragmentSha256}\n`);
process.stdout.write(`HYDRATION_STAGER_SHA256=${stagerSha256}\n`);
process.stdout.write(`HYDRATION_SYSTEMD_POLICY_SHA256=${policySha256}\n`);
if (phase === "completed") {
  process.stdout.write(
    `HYDRATION_SYSTEMD_INVOCATION_ID=${expectedInvocationId}\n`,
  );
}
