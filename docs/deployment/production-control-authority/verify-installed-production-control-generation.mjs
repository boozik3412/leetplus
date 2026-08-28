#!/usr/bin/node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { TextDecoder } from "node:util";

const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SAFE_SOURCE_PATTERN = /^[A-Za-z0-9_.@+/-]+$/u;
const SAFE_DESTINATION_PATTERN = /^\/[A-Za-z0-9_.@+/-]+$/u;
const EXPECTED_INSTALL_MAP_SHA256 =
  "7404801cef6d9eb2aca40411789df7fcb76fb6e0260520f0be809f4812d2a56e";
const EXPECTED_REPOSITORY = "boozik3412/leetplus";
const GENERATION_BASE = "/srv/leetplus/production-control-generations";
const RECEIPT_BASE = "/var/lib/leetplus/deploy-receipts/production-control";
const INSTALLED_AUTHORITY = "/usr/local/sbin/leetplus-install-production-control-v1";
const ARTIFACT_VERIFIER_SOURCE =
  "docs/deployment/production-control-authority/verify-production-control-artifact.mjs";
const INSTALLED_VERIFIER_SOURCE =
  "docs/deployment/production-control-authority/verify-installed-production-control-generation.mjs";
const INSTALLER_SOURCE =
  "docs/deployment/production-control-authority/leetplus-install-production-control-v1";
const INSTALL_MAP_SOURCE =
  "docs/deployment/production-control-authority/production-control-install-map.tsv";
const ALLOWLIST_SOURCE =
  "docs/deployment/production-control-authority/production-control-payload.allowlist";
const INNER_MANIFEST_SOURCE =
  "docs/deployment/production-artifact/CONTROL_BUNDLE_SHA256SUMS";
const ROOT_MANIFEST_SOURCE = "SHA256SUMS";
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 192 * 1024 * 1024;
const MAX_TREE_ENTRIES = 512;
const DANGEROUS_ENVIRONMENT_NAMES = [
  "BASH_ENV",
  "ENV",
  "GCONV_PATH",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "LD_AUDIT",
  "LD_LIBRARY_PATH",
  "LD_PRELOAD",
  "LOCPATH",
  "NODE_COMPILE_CACHE",
  "NODE_EXTRA_CA_CERTS",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_USE_ENV_PROXY",
  "NODE_V8_COVERAGE",
  "OPENSSL_CONF",
  "OPENSSL_MODULES",
  "ALL_PROXY",
  "all_proxy",
  "https_proxy",
  "http_proxy",
  "no_proxy",
  "NO_PROXY",
];
const REQUIRED_DESTINATIONS = new Set([
  "/etc/systemd/system/leetplus-api@.service",
  "/etc/systemd/system/leetplus-release-hydrate@.service",
  "/etc/systemd/system/leetplus-web@.service",
  "/etc/tmpfiles.d/leetplus-release.conf",
  "/srv/leetplus/control-bundles/scheduler-free-nminus1-v1/CONTROL_BUNDLE_SHA256SUMS",
  "/usr/local/libexec/leetplus/stage-release-artifact.sh",
  "/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs",
  "/usr/local/libexec/leetplus/verify-production-control-artifact.mjs",
  "/usr/local/libexec/leetplus/verify-release-hydration-systemd.mjs",
  "/usr/local/sbin/leetplus-bind-release-slot",
  "/usr/local/sbin/leetplus-blue-green-cutover",
  "/usr/local/sbin/leetplus-install-scheduler-free-nminus1-v1",
  "/usr/local/sbin/leetplus-promote-release-artifact",
  "/usr/local/sbin/leetplus-seal-release-artifact",
]);

const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
let totalBytesRead = 0;
let trustedAuthorityRoot = "/";

function fail(message) {
  throw new Error(`verify-installed-production-control-generation: ${message}`);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function decodeUtf8(bytes, source) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${source} is not valid UTF-8`);
  }
}

function parseArguments(argv) {
  let releaseSha;
  let fixtureRoot;
  let requireRootAuthority = false;
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--release-sha" || argument === "--fixture-root") {
      if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
      seen.add(argument);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        fail(`${argument} requires one value`);
      }
      if (argument === "--release-sha") releaseSha = value;
      else fixtureRoot = value;
      index += 1;
    } else if (argument === "--require-root-authority") {
      if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
      seen.add(argument);
      requireRootAuthority = true;
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }
  if (!RELEASE_SHA_PATTERN.test(releaseSha ?? "")) {
    fail("--release-sha must be 40 lowercase hexadecimal characters");
  }
  if (fixtureRoot !== undefined) {
    if (
      process.env.LEETPLUS_PRODUCTION_CONTROL_FIXTURE_CONFIRMATION !==
      "verify-installed-production-control-generation"
    ) {
      fail("--fixture-root requires the exact CI fixture confirmation");
    }
    if (requireRootAuthority) {
      fail("--fixture-root and --require-root-authority are mutually exclusive");
    }
  } else if (!requireRootAuthority) {
    fail("production verification requires --require-root-authority");
  }
  return { releaseSha, fixtureRoot, requireRootAuthority };
}

function assertProcessBoundary(fixtureMode) {
  if (Number.parseInt(process.versions.node.split(".", 1)[0], 10) !== 22) {
    fail(`Node.js major 22 is required; actual=${process.versions.node}`);
  }
  if (process.execArgv.length !== 0) {
    fail("Node.js runtime flags are forbidden");
  }
  for (const name of Object.keys(process.env)) {
    if (/^(?:DYLD_|LD_|NODE_)/u.test(name)) {
      if (
        fixtureMode &&
        name === "LEETPLUS_PRODUCTION_CONTROL_FIXTURE_CONFIRMATION"
      ) {
        continue;
      }
      fail(`unsafe inherited environment is present: ${name}`);
    }
  }
  for (const name of DANGEROUS_ENVIRONMENT_NAMES) {
    if (Object.hasOwn(process.env, name)) {
      fail(`unsafe inherited environment is present: ${name}`);
    }
  }
  const expectedEnvironment = {
    PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    TZ: "UTC",
  };
  if (fixtureMode) {
    expectedEnvironment.LEETPLUS_PRODUCTION_CONTROL_FIXTURE_CONFIRMATION =
      "verify-installed-production-control-generation";
  }
  const actualNames = Object.keys(process.env).sort(compareUtf8);
  const expectedNames = Object.keys(expectedEnvironment).sort(compareUtf8);
  if (
    actualNames.length !== expectedNames.length ||
    actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    fail("verifier environment key set is not exact and secret-free");
  }
  for (const [name, value] of Object.entries(expectedEnvironment)) {
    if (process.env[name] !== value) fail(`verifier environment value drift: ${name}`);
  }
}

function canonicalRoot(input, source) {
  const resolved = path.resolve(input);
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`${source} must be a real directory`);
  }
  const canonical = fs.realpathSync.native(resolved);
  if (canonical !== resolved) {
    fail(`${source} and all ancestors must be canonical and symlink-free`);
  }
  return canonical;
}

function hostPath(rootPrefix, productionPath) {
  if (!productionPath.startsWith("/")) fail("internal destination is not absolute");
  if (rootPrefix === "/") return productionPath;
  return path.join(rootPrefix, ...productionPath.slice(1).split("/"));
}

function ancestorPaths(absolutePath) {
  const normalized = path.resolve(absolutePath);
  if (normalized !== absolutePath) {
    fail(`trusted authority path is not normalized: ${absolutePath}`);
  }
  const relative = path.relative(trustedAuthorityRoot, normalized);
  if (
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    fail(`trusted authority path escapes its root boundary: ${absolutePath}`);
  }
  const components = relative
    .split(path.sep)
    .filter(Boolean);
  const ancestors = [trustedAuthorityRoot];
  let current = trustedAuthorityRoot;
  for (const component of components) {
    current = path.join(current, component);
    ancestors.push(current);
  }
  return ancestors;
}

function assertTrustedAncestors(absolutePath, expectedUid, expectedGid, includeLeaf) {
  const all = ancestorPaths(absolutePath);
  const candidates = includeLeaf ? all : all.slice(0, -1);
  for (const candidate of candidates) {
    const stat = fs.lstatSync(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail(`trusted ancestor is not a real directory: ${candidate}`);
    }
    if (stat.uid !== expectedUid || stat.gid !== expectedGid) {
      fail(`trusted ancestor has the wrong owner: ${candidate}`);
    }
    if ((stat.mode & 0o022) !== 0) {
      fail(`trusted ancestor is group/other writable: ${candidate}`);
    }
  }
}

function assertExactDirectoryAuthority(
  absolutePath,
  expectedUid,
  expectedGid,
  mode,
  source,
) {
  assertTrustedAncestors(absolutePath, expectedUid, expectedGid, false);
  const stat = fs.lstatSync(absolutePath);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== expectedUid ||
    stat.gid !== expectedGid ||
    (stat.mode & 0o777) !== mode
  ) {
    fail(`${source} does not have exact directory authority mode ${mode.toString(8)}`);
  }
}

function readBoundedRegularFile(absolutePath, source) {
  const before = fs.lstatSync(absolutePath, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n) {
    fail(`${source} must be a regular non-hardlinked file`);
  }
  if (before.size <= 0n || before.size > BigInt(MAX_FILE_BYTES)) {
    fail(`${source} exceeds the bounded file size`);
  }
  const flags =
    fs.constants.O_RDONLY |
    (fs.constants.O_NOFOLLOW ?? 0) |
    (fs.constants.O_NONBLOCK ?? 0);
  let descriptor;
  try {
    descriptor = fs.openSync(absolutePath, flags);
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink !== 1n ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      opened.ctimeNs !== before.ctimeNs
    ) {
      fail(`${source} changed identity before read`);
    }
    const size = Number(opened.size);
    if (totalBytesRead + size > MAX_TOTAL_BYTES) {
      fail("installed-generation verification exceeded the aggregate read budget");
    }
    totalBytesRead += size;
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const read = fs.readSync(descriptor, bytes, offset, size - offset, offset);
      if (read === 0) fail(`${source} became short during read`);
      offset += read;
    }
    const overflow = Buffer.alloc(1);
    if (fs.readSync(descriptor, overflow, 0, 1, size) !== 0) {
      fail(`${source} grew during read`);
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      after.ctimeNs !== opened.ctimeNs
    ) {
      fail(`${source} changed during read`);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function assertSafeSource(source, label) {
  if (
    !SAFE_SOURCE_PATTERN.test(source) ||
    source !== source.normalize("NFC") ||
    source.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    fail(`${label} is not a canonical safe source path: ${JSON.stringify(source)}`);
  }
}

function assertSafeDestination(destination) {
  if (
    !SAFE_DESTINATION_PATTERN.test(destination) ||
    destination !== destination.normalize("NFC") ||
    destination.split("/").slice(1).some((part) => !part || part === "." || part === "..")
  ) {
    fail(`install map destination is not canonical and safe: ${JSON.stringify(destination)}`);
  }
}

function parseDigestManifest(bytes, source) {
  const text = decodeUtf8(bytes, source);
  if (!text.endsWith("\n") || text.endsWith("\n\n")) {
    fail(`${source} must end with exactly one LF`);
  }
  const entries = new Map();
  let prior;
  for (const line of text.slice(0, -1).split("\n")) {
    const match = /^([0-9a-f]{64})  \.\/([A-Za-z0-9_.@+/-]+)$/u.exec(line);
    if (!match) fail(`${source} contains a malformed line`);
    const [, digest, relative] = match;
    assertSafeSource(relative, source);
    if (entries.has(relative) || (prior !== undefined && compareUtf8(prior, relative) >= 0)) {
      fail(`${source} is duplicate or not canonically sorted`);
    }
    prior = relative;
    entries.set(relative, digest);
  }
  return entries;
}

function parseAllowlist(bytes) {
  const text = decodeUtf8(bytes, "payload allowlist");
  if (!text.endsWith("\n") || text.endsWith("\n\n")) {
    fail("payload allowlist must end with exactly one LF");
  }
  const paths = text.slice(0, -1).split("\n");
  let prior;
  const seen = new Set();
  for (const source of paths) {
    assertSafeSource(source, "payload allowlist");
    if (seen.has(source) || (prior !== undefined && compareUtf8(prior, source) >= 0)) {
      fail("payload allowlist is duplicate or not canonically sorted");
    }
    prior = source;
    seen.add(source);
  }
  return paths;
}

function parseInstallMap(bytes, manifestEntries) {
  if (sha256(bytes) !== EXPECTED_INSTALL_MAP_SHA256) {
    fail("install map differs from the separately reviewed authority pin");
  }
  const text = decodeUtf8(bytes, "production control install map");
  if (!text.endsWith("\n") || text.endsWith("\n\n")) {
    fail("install map must end with exactly one LF");
  }
  const entries = [];
  const destinations = new Set();
  let priorLine;
  for (const line of text.slice(0, -1).split("\n")) {
    const fields = line.split("\t");
    if (fields.length !== 3) fail("install map line is not exact TSV");
    const [source, destination, mode] = fields;
    assertSafeSource(source, "install map source");
    assertSafeDestination(destination);
    if (!/^(?:0400|0444|0500|0555)$/u.test(mode)) {
      fail(`install map mode is not permitted: ${mode}`);
    }
    if (!manifestEntries.has(source)) {
      fail(`install map source is outside root SHA256SUMS: ${source}`);
    }
    if (destinations.has(destination)) {
      fail(`install map contains a duplicate destination: ${destination}`);
    }
    if (priorLine !== undefined && compareUtf8(priorLine, line) >= 0) {
      fail("install map lines are not in canonical byte order");
    }
    priorLine = line;
    destinations.add(destination);
    entries.push({ source, destination, mode: Number.parseInt(mode, 8) });
  }
  for (const required of REQUIRED_DESTINATIONS) {
    if (!destinations.has(required)) {
      fail(`install map omits a required destination: ${required}`);
    }
  }
  return entries;
}

function walkGeneration(root, expectedUid, expectedGid) {
  const rootStat = fs.lstatSync(root);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    rootStat.uid !== expectedUid ||
    rootStat.gid !== expectedGid ||
    (rootStat.mode & 0o777) !== 0o500
  ) {
    fail("generation root is not exact trusted mode 0500 authority");
  }
  const files = [];
  const directories = [];
  const rootDevice = rootStat.dev;
  let count = 0;
  const visit = (directory, prefix = "") => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      compareUtf8(a.name, b.name),
    );
    for (const entry of entries) {
      count += 1;
      if (count > MAX_TREE_ENTRIES) fail("generation exceeds bounded entry count");
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      assertSafeSource(relative, "generation entry");
      const absolute = path.join(root, ...relative.split("/"));
      const stat = fs.lstatSync(absolute);
      if (stat.dev !== rootDevice || stat.uid !== expectedUid || stat.gid !== expectedGid) {
        fail(`generation entry has foreign device or ownership: ${relative}`);
      }
      if (stat.isDirectory()) {
        if ((stat.mode & 0o777) !== 0o500) {
          fail(`generation directory mode is not 0500: ${relative}`);
        }
        directories.push(relative);
        visit(absolute, relative);
      } else if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        (stat.mode & 0o777) !== 0o400
      ) {
        fail(`generation file is not exact regular 0400 authority: ${relative}`);
      } else {
        files.push(relative);
      }
    }
  };
  visit(root);
  return { files: files.sort(compareUtf8), directories: directories.sort(compareUtf8), device: rootDevice };
}

function expectedParentDirectories(files) {
  const directories = new Set();
  for (const file of files) {
    const components = file.split("/");
    components.pop();
    while (components.length > 0) {
      directories.add(components.join("/"));
      components.pop();
    }
  }
  return [...directories].sort(compareUtf8);
}

function assertExactArray(actual, expected, source) {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    fail(`${source} is not exact`);
  }
}

function decodeMountPath(value) {
  return value.replace(/\\(040|011|012|134)/gu, (_, code) => {
    const decoded = { "011": "\t", "012": "\n", "040": " ", "134": "\\" };
    return decoded[code];
  });
}

function readMountTargets() {
  let text;
  try {
    text = fs.readFileSync("/proc/self/mountinfo", "utf8");
  } catch {
    fail("cannot read complete /proc/self/mountinfo");
  }
  if (!text.endsWith("\n")) fail("mount inventory is incomplete");
  return text.slice(0, -1).split("\n").map((line) => {
    const fields = line.split(" ");
    if (fields.length < 7 || !fields.includes("-")) fail("mount inventory is malformed");
    return decodeMountPath(fields[4]);
  });
}

function assertNoExactOrNestedMount(root, targets, source) {
  for (const target of targets) {
    if (target === root || target.startsWith(`${root}${path.sep}`)) {
      fail(`${source} contains an exact or nested mount: ${target}`);
    }
  }
}

function assertNoExactFileMount(file, targets) {
  if (targets.includes(file)) fail(`installed destination is a mount: ${file}`);
}

function parseReceipt(bytes, expected) {
  const text = decodeUtf8(bytes, "installed generation receipt");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("installed generation receipt is not JSON");
  }
  if (Object.getPrototypeOf(parsed) !== Object.prototype) {
    fail("installed generation receipt is not one plain object");
  }
  const canonical = `${JSON.stringify(expected, null, 2)}\n`;
  if (text !== canonical) {
    fail("installed generation receipt schema, ordering or values are not exact");
  }
  return parsed;
}

function assertRegularAuthority(file, expectedUid, expectedGid, mode, source) {
  assertTrustedAncestors(file, expectedUid, expectedGid, false);
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.uid !== expectedUid ||
    stat.gid !== expectedGid ||
    (stat.mode & 0o777) !== mode
  ) {
    fail(`${source} does not have exact installed authority metadata`);
  }
}

function assertInstalledDestinations(
  rootPrefix,
  generationRoot,
  entries,
  manifestEntries,
  expectedUid,
  expectedGid,
  mountTargets,
) {
  for (const entry of entries) {
    const sourcePath = path.join(generationRoot, ...entry.source.split("/"));
    const destinationPath = hostPath(rootPrefix, entry.destination);
    assertRegularAuthority(
      destinationPath,
      expectedUid,
      expectedGid,
      entry.mode,
      `installed destination ${entry.destination}`,
    );
    assertNoExactFileMount(destinationPath, mountTargets);
    const expectedDigest = manifestEntries.get(entry.source);
    const sourceBytes = readBoundedRegularFile(sourcePath, `generation source ${entry.source}`);
    const installedBytes = readBoundedRegularFile(
      destinationPath,
      `installed destination ${entry.destination}`,
    );
    if (sha256(sourceBytes) !== expectedDigest || sha256(installedBytes) !== expectedDigest) {
      fail(`installed destination digest drift: ${entry.destination}`);
    }
  }
}

function assertArtifactVerifier(rootPrefix, generationRoot, releaseSha, fixtureMode) {
  const verifier = path.join(generationRoot, ...ARTIFACT_VERIFIER_SOURCE.split("/"));
  const nodePath = fixtureMode ? process.execPath : "/usr/bin/node";
  if (!fixtureMode) {
    if (fs.realpathSync.native(nodePath) !== nodePath) {
      fail("production Node executable is not exact /usr/bin/node");
    }
    assertRegularAuthority(nodePath, 0, 0, fs.lstatSync(nodePath).mode & 0o777, "Node executable");
    if ((fs.lstatSync(nodePath).mode & 0o022) !== 0) {
      fail("production Node executable is group/other writable");
    }
  }
  const args = [
    verifier,
    "--artifact-root",
    generationRoot,
    "--expected-release-sha",
    releaseSha,
  ];
  if (!fixtureMode) args.push("--require-root-authority");
  const result = spawnSync(nodePath, args, {
    encoding: "utf8",
    env: {
      PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      TZ: "UTC",
    },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
    maxBuffer: 128 * 1024,
  });
  if (
    result.error ||
    result.status !== 0 ||
    !result.stdout.includes("PRODUCTION_CONTROL_ARTIFACT_INTEGRITY=PASS\n") ||
    !result.stdout.includes(`PRODUCTION_CONTROL_RELEASE_SHA=${releaseSha}\n`) ||
    !result.stdout.includes(
      `PRODUCTION_CONTROL_ROOT_AUTHORITY=${fixtureMode ? "NOT_REQUESTED" : "REQUIRED"}\n`,
    ) ||
    result.stderr !== ""
  ) {
    fail("shipped production-control artifact verifier rejected the installed generation");
  }
}

const parsedArguments = parseArguments(process.argv.slice(2));
const fixtureMode = parsedArguments.fixtureRoot !== undefined;
assertProcessBoundary(fixtureMode);
if (process.platform !== "linux") fail("installed-generation verification is Linux-only");
if (!fixtureMode && (process.getuid?.() !== 0 || process.getgid?.() !== 0)) {
  fail("production installed-generation verification requires root");
}
const expectedUid = fixtureMode ? process.getuid() : 0;
const expectedGid = fixtureMode ? process.getgid() : 0;
const rootPrefix = fixtureMode
  ? canonicalRoot(parsedArguments.fixtureRoot, "fixture root")
  : "/";
trustedAuthorityRoot = rootPrefix;
const generationRoot = hostPath(
  rootPrefix,
  `${GENERATION_BASE}/${parsedArguments.releaseSha}`,
);
const receiptPath = hostPath(
  rootPrefix,
  `${RECEIPT_BASE}/production-control-generation-${parsedArguments.releaseSha}.receipt.json`,
);
const intentPath = hostPath(
  rootPrefix,
  `${RECEIPT_BASE}/production-control-generation-${parsedArguments.releaseSha}.intent.json`,
);
assertExactDirectoryAuthority(
  hostPath(rootPrefix, GENERATION_BASE),
  expectedUid,
  expectedGid,
  0o700,
  "production-control generation base",
);
assertExactDirectoryAuthority(
  hostPath(rootPrefix, RECEIPT_BASE),
  expectedUid,
  expectedGid,
  0o700,
  "production-control receipt base",
);
assertTrustedAncestors(generationRoot, expectedUid, expectedGid, false);
assertTrustedAncestors(receiptPath, expectedUid, expectedGid, false);
const mountTargets = readMountTargets();
assertNoExactOrNestedMount(generationRoot, mountTargets, "installed generation");
let intentPresent = false;
try {
  fs.lstatSync(intentPath);
  intentPresent = true;
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
if (intentPresent || fs.lstatSync(receiptPath).isSymbolicLink()) {
  fail("installed generation has an outstanding intent or linked receipt");
}

const generationTree = walkGeneration(generationRoot, expectedUid, expectedGid);
const rootManifestBytes = readBoundedRegularFile(
  path.join(generationRoot, ROOT_MANIFEST_SOURCE),
  "generation root SHA256SUMS",
);
const manifestEntries = parseDigestManifest(rootManifestBytes, "generation root SHA256SUMS");
const expectedFiles = [...manifestEntries.keys(), ROOT_MANIFEST_SOURCE].sort(compareUtf8);
assertExactArray(generationTree.files, expectedFiles, "generation regular-file tree");
assertExactArray(
  generationTree.directories,
  expectedParentDirectories(expectedFiles),
  "generation directory topology",
);
for (const [relative, digest] of manifestEntries) {
  const bytes = readBoundedRegularFile(
    path.join(generationRoot, ...relative.split("/")),
    `generation manifest target ${relative}`,
  );
  if (sha256(bytes) !== digest) fail(`generation digest mismatch: ${relative}`);
}

const allowlistBytes = readBoundedRegularFile(
  path.join(generationRoot, ...ALLOWLIST_SOURCE.split("/")),
  "generation payload allowlist",
);
const allowlist = parseAllowlist(allowlistBytes);
const installMapBytes = readBoundedRegularFile(
  path.join(generationRoot, ...INSTALL_MAP_SOURCE.split("/")),
  "generation install map",
);
const installEntries = parseInstallMap(installMapBytes, manifestEntries);
const innerManifestBytes = readBoundedRegularFile(
  path.join(generationRoot, ...INNER_MANIFEST_SOURCE.split("/")),
  "generation inner manifest",
);
const innerTrustPath = hostPath(
  rootPrefix,
  "/etc/leetplus/rollback-control-manifest.sha256",
);
assertRegularAuthority(
  innerTrustPath,
  expectedUid,
  expectedGid,
  0o400,
  "inner control manifest trust file",
);
assertNoExactFileMount(innerTrustPath, mountTargets);
const innerTrustBytes = readBoundedRegularFile(
  innerTrustPath,
  "inner control manifest trust file",
);
if (decodeUtf8(innerTrustBytes, "inner control manifest trust file") !== `${sha256(innerManifestBytes)}\n`) {
  fail("inner control manifest trust file differs from the installed generation");
}

const pin = (source, label) => {
  const digest = manifestEntries.get(source);
  if (!SHA256_PATTERN.test(digest ?? "")) fail(`root manifest omits ${label}`);
  return digest;
};
const receiptBytes = readBoundedRegularFile(receiptPath, "installed generation receipt");
assertRegularAuthority(receiptPath, expectedUid, expectedGid, 0o400, "installed generation receipt");
assertNoExactFileMount(receiptPath, mountTargets);
const authorityPath = hostPath(rootPrefix, INSTALLED_AUTHORITY);
assertRegularAuthority(authorityPath, expectedUid, expectedGid, 0o500, "installer authority");
assertNoExactFileMount(authorityPath, mountTargets);
const installerAuthorityBytes = readBoundedRegularFile(authorityPath, "installer authority");
if (sha256(installerAuthorityBytes) !== pin(INSTALLER_SOURCE, "installer authority")) {
  fail("installed separately reviewed authority differs from the generation byte");
}

const provisional = JSON.parse(decodeUtf8(receiptBytes, "installed generation receipt"));
const expectedReceipt = {
  schemaVersion: 1,
  recordKind: "leetplus-production-control-installed-generation",
  state: "ACCEPTED",
  releaseSha: parsedArguments.releaseSha,
  repository: EXPECTED_REPOSITORY,
  archiveSha256: provisional?.archiveSha256,
  admissionReceiptSha256: provisional?.admissionReceiptSha256,
  generationRoot: `${GENERATION_BASE}/${parsedArguments.releaseSha}`,
  artifactRootManifestSha256: sha256(rootManifestBytes),
  payloadAllowlistSha256: sha256(allowlistBytes),
  controlBundleManifestSha256: sha256(innerManifestBytes),
  installMapSha256: sha256(installMapBytes),
  installerAuthoritySha256: pin(INSTALLER_SOURCE, "installer authority"),
  artifactVerifierSha256: pin(ARTIFACT_VERIFIER_SOURCE, "artifact verifier"),
  installedGenerationVerifierSha256: pin(
    INSTALLED_VERIFIER_SOURCE,
    "installed generation verifier",
  ),
  hydrationStagerSha256: pin(
    "docs/deployment/production-artifact/stage-release-artifact.sh",
    "hydration stager",
  ),
  hydrationAttestorSha256: pin(
    "docs/deployment/production-artifact/verify-release-hydration-systemd.mjs",
    "hydration attestor",
  ),
  hydrationUnitSha256: pin(
    "docs/deployment/production-artifact/systemd/leetplus-release-hydrate@.service",
    "hydration unit",
  ),
  sealerSha256: pin(
    "docs/deployment/production-artifact/seal-release-artifact.sh",
    "release sealer",
  ),
  promoterSha256: pin(
    "docs/deployment/production-artifact/promote-release-artifact.sh",
    "release promoter",
  ),
  payloadFileCount: allowlist.length,
  installedFileCount: installEntries.length,
};
if (
  !SHA256_PATTERN.test(expectedReceipt.archiveSha256 ?? "") ||
  !SHA256_PATTERN.test(expectedReceipt.admissionReceiptSha256 ?? "")
) {
  fail("installed generation receipt has malformed admission digests");
}
parseReceipt(receiptBytes, expectedReceipt);
assertArtifactVerifier(rootPrefix, generationRoot, parsedArguments.releaseSha, fixtureMode);
assertInstalledDestinations(
  rootPrefix,
  generationRoot,
  installEntries,
  manifestEntries,
  expectedUid,
  expectedGid,
  mountTargets,
);

process.stdout.write(
  `PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS\n` +
    `PRODUCTION_CONTROL_RELEASE_SHA=${parsedArguments.releaseSha}\n` +
    `PRODUCTION_CONTROL_RECEIPT_PATH=${RECEIPT_BASE}/production-control-generation-${parsedArguments.releaseSha}.receipt.json\n` +
    `PRODUCTION_CONTROL_RECEIPT_SHA256=${sha256(receiptBytes)}\n` +
    `PRODUCTION_CONTROL_ROOT_MANIFEST_SHA256=${expectedReceipt.artifactRootManifestSha256}\n` +
    `PRODUCTION_CONTROL_INSTALL_MAP_SHA256=${expectedReceipt.installMapSha256}\n` +
    `PRODUCTION_CONTROL_INSTALLER_SHA256=${expectedReceipt.installerAuthoritySha256}\n` +
    `PRODUCTION_CONTROL_VERIFIER_SHA256=${expectedReceipt.installedGenerationVerifierSha256}\n` +
    `PRODUCTION_CONTROL_STAGER_SHA256=${expectedReceipt.hydrationStagerSha256}\n` +
    `PRODUCTION_CONTROL_ATTESTOR_SHA256=${expectedReceipt.hydrationAttestorSha256}\n` +
    `PRODUCTION_CONTROL_HYDRATION_UNIT_SHA256=${expectedReceipt.hydrationUnitSha256}\n` +
    `PRODUCTION_CONTROL_SEALER_SHA256=${expectedReceipt.sealerSha256}\n` +
    `PRODUCTION_CONTROL_PROMOTER_SHA256=${expectedReceipt.promoterSha256}\n` +
    `PRODUCTION_CONTROL_INSTALLED_FILE_COUNT=${expectedReceipt.installedFileCount}\n`,
);
