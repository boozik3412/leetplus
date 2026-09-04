#!/usr/bin/node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";

const ARTIFACT_KIND = "leetplus-production-control";
const ALLOWLIST_PATH =
  "docs/deployment/production-control-authority/production-control-payload.allowlist";
const AUTHORITY_PATH =
  "docs/deployment/production-control-authority/leetplus-install-scheduler-free-nminus1-v1";
const INSTALL_AUTHORITY_PATH =
  "docs/deployment/production-control-authority/leetplus-install-production-control-v1";
const INSTALL_MAP_PATH =
  "docs/deployment/production-control-authority/production-control-install-map.tsv";
const INSTALLED_VERIFIER_PATH =
  "docs/deployment/production-control-authority/verify-installed-production-control-generation.mjs";
const INNER_ROOT = "docs/deployment/production-artifact";
const ORCHESTRATOR_ENGINE_PATH = `${INNER_ROOT}/resumable-release-orchestrator.mjs`;
const ORCHESTRATOR_LAUNCHER_PATH = `${INNER_ROOT}/resumable-release-orchestrator.sh`;
const INNER_MANIFEST_PATH = `${INNER_ROOT}/CONTROL_BUNDLE_SHA256SUMS`;
const PROVENANCE_PATH = "production-control-provenance.json";
const ROOT_MANIFEST_PATH = "SHA256SUMS";
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EFFECTIVE_LANES = new Set(["L1_RUNTIME", "L2_SCHEMA_SECURITY"]);
const SAFE_PATH_PATTERN = /^[A-Za-z0-9_.@+/-]+$/u;
const MAX_PAYLOAD_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES_READ = 128 * 1024 * 1024;
const MAX_TREE_ENTRIES = 256;
const MAX_RELATIVE_PATH_BYTES = 4096;

const EXPECTED_INNER_MEMBERS = [
  "activate-legacy-rollback-contour.sh",
  "apply-legacy-database-login-fence.sh",
  "apply-legacy-rollback-egress.sh",
  "blue-green-cutover.sh",
  "install-legacy-rollback-contour.sh",
  "legacy-rollback-auth-edge.mjs",
  "legacy-rollback-child-loopback.cjs",
  "nginx/blue.conf.example",
  "nginx/green.conf.example",
  "nginx/legacy-safe.conf.example",
  "preflight-legacy-rollback.sh",
  "rebind-legacy-drain-manifest-successor.sh",
  "systemd/leetplus-api-rollback@.service",
  "systemd/leetplus-blue-green-recovery-watchdog.service",
  "systemd/leetplus-blue-green-recovery.service",
  "systemd/leetplus-blue-green-recovery.timer",
  "systemd/leetplus-rollback-egress.service",
  "systemd/leetplus-web-rollback@.service",
  "systemd/legacy-database-login-fence-authority.sql.example",
  "systemd/legacy-drain-database-target.conf.example",
  "systemd/legacy-drain-units.conf.example",
  "systemd/legacy-rollback-7de04ff4.env.example",
  "systemd/legacy-rollback-safe.env.example",
  "systemd/nginx.service.d/leetplus-blue-green-recovery.conf",
  "verify-legacy-rollback-authenticated-reads.mjs",
  "verify-legacy-rollback-readiness.sh",
  "verify-legacy-runtime-drain.sh",
];

const REQUIRED_PATHS = [
  INNER_MANIFEST_PATH,
  `${INNER_ROOT}/README.md`,
  `${INNER_ROOT}/bind-release-slot.sh`,
  `${INNER_ROOT}/langame-discrepancy-audit-authority.sh`,
  `${INNER_ROOT}/langame-daily-worker-authorization-authority.sh`,
  `${INNER_ROOT}/legacy-rollback-auth-edge.mjs`,
  `${INNER_ROOT}/legacy-rollback-child-loopback.cjs`,
  `${INNER_ROOT}/nginx/README.md`,
  `${INNER_ROOT}/nginx/active-upstreams.include.conf.example`,
  `${INNER_ROOT}/nginx/blue.conf.example`,
  `${INNER_ROOT}/nginx/green.conf.example`,
  `${INNER_ROOT}/preflight-release-slot.sh`,
  `${INNER_ROOT}/rebind-legacy-drain-manifest-successor.sh`,
  `${INNER_ROOT}/prepare-web-slot-cache.sh`,
  `${INNER_ROOT}/promote-release-artifact.sh`,
  `${INNER_ROOT}/resumable-release-orchestrator.mjs`,
  `${INNER_ROOT}/resumable-release-orchestrator.sh`,
  `${INNER_ROOT}/run-active-bonus-ledger-worker.sh`,
  `${INNER_ROOT}/run-active-langame-daily-worker.sh`,
  `${INNER_ROOT}/run-authorized-langame-daily-worker.sh`,
  `${INNER_ROOT}/run-current-release-restored-copy-acceptance.sh`,
  `${INNER_ROOT}/scheduler-free-n-minus-one-runbook.md`,
  `${INNER_ROOT}/seal-release-artifact.sh`,
  `${INNER_ROOT}/slot-link-runbook.md`,
  `${INNER_ROOT}/stage-pnpm-store.sh`,
  `${INNER_ROOT}/stage-release-artifact.sh`,
  `${INNER_ROOT}/systemd/blue.env.example`,
  `${INNER_ROOT}/systemd/bonus-ledger-worker.env.example`,
  `${INNER_ROOT}/systemd/canary-safe.env.example`,
  `${INNER_ROOT}/systemd/green.env.example`,
  `${INNER_ROOT}/systemd/guest-user-call-live.env.example`,
  `${INNER_ROOT}/systemd/langame-daily-worker.env.example`,
  `${INNER_ROOT}/systemd/leetplus-api@.service`,
  `${INNER_ROOT}/systemd/leetplus-langame-daily-worker.service`,
  `${INNER_ROOT}/systemd/leetplus-langame-daily-worker.timer`,
  `${INNER_ROOT}/systemd/leetplus-langame-discrepancy-audit-preflight.service`,
  `${INNER_ROOT}/systemd/leetplus-bonus-ledger-worker.service`,
  `${INNER_ROOT}/systemd/leetplus-bonus-ledger-worker.timer`,
  `${INNER_ROOT}/systemd/leetplus-release-hydrate@.service`,
  `${INNER_ROOT}/systemd/leetplus-web@.service`,
  `${INNER_ROOT}/systemd/legacy-database-login-fence-authority.sql.example`,
  `${INNER_ROOT}/systemd/tmpfiles.d/leetplus-release.conf`,
  `${INNER_ROOT}/systemd/web-runtime.env.example`,
  `${INNER_ROOT}/verify-pnpm-store-integrity.mjs`,
  `${INNER_ROOT}/verify-release-hydration-systemd.mjs`,
  `${INNER_ROOT}/verify-release-readiness.sh`,
  `${INNER_ROOT}/verify-langame-daily-worker-authorization.sh`,
  AUTHORITY_PATH,
  INSTALL_AUTHORITY_PATH,
  INSTALL_MAP_PATH,
  ALLOWLIST_PATH,
  INSTALLED_VERIFIER_PATH,
  "docs/deployment/production-control-authority/verify-production-control-artifact.mjs",
];

const FORBIDDEN_PATHS = new Set([
  `${INNER_ROOT}/nginx/legacy.conf.example`,
  `${INNER_ROOT}/systemd/leetplus-api.service`,
  `${INNER_ROOT}/systemd/leetplus-release-migrate@.service`,
  `${INNER_ROOT}/systemd/leetplus-web.service`,
  `${INNER_ROOT}/systemd/release.env.example`,
]);

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

const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
let totalBytesRead = 0;
let artifactTreeEntryCount = 0;

function fail(message) {
  throw new Error(`verify-production-control-artifact: ${message}`);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function parseArguments(argv) {
  let artifactRoot;
  let expectedReleaseSha;
  let expectedEffectiveLane;
  let expectedImpactReceiptSha256;
  let requireRootAuthority = false;
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (
      argument === "--artifact-root" ||
      argument === "--expected-release-sha" ||
      argument === "--expected-effective-lane" ||
      argument === "--expected-impact-receipt-sha256"
    ) {
      if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
      seen.add(argument);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        fail(`${argument} requires one value`);
      }
      if (argument === "--artifact-root") artifactRoot = value;
      else if (argument === "--expected-release-sha") expectedReleaseSha = value;
      else if (argument === "--expected-effective-lane") expectedEffectiveLane = value;
      else expectedImpactReceiptSha256 = value;
      index += 1;
    } else if (argument === "--require-root-authority") {
      if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
      seen.add(argument);
      requireRootAuthority = true;
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }

  if (!artifactRoot) fail("--artifact-root is required");
  if (!RELEASE_SHA_PATTERN.test(expectedReleaseSha ?? "")) {
    fail("--expected-release-sha must be 40 lowercase hexadecimal characters");
  }
  if ((expectedEffectiveLane === undefined) !== (expectedImpactReceiptSha256 === undefined)) {
    fail("expected admission lane and impact receipt digest must be provided together");
  }
  if (
    expectedEffectiveLane !== undefined &&
    (!EFFECTIVE_LANES.has(expectedEffectiveLane) ||
      !SHA256_PATTERN.test(expectedImpactReceiptSha256))
  ) {
    fail("expected admission lane is invalid");
  }
  return {
    artifactRoot,
    expectedEffectiveLane,
    expectedImpactReceiptSha256,
    expectedReleaseSha,
    requireRootAuthority,
  };
}

function assertProcessBoundary() {
  if (Number.parseInt(process.versions.node.split(".", 1)[0], 10) !== 22) {
    fail(`Node.js major 22 is required; actual=${process.versions.node}`);
  }
  if (process.execArgv.length !== 0) {
    fail("Node.js runtime flags are forbidden for this verifier");
  }
  for (const name of Object.keys(process.env)) {
    if (/^(?:DYLD_|LD_|NODE_)/u.test(name)) {
      fail(`unsafe inherited environment is present: ${name}`);
    }
  }
  for (const name of DANGEROUS_ENVIRONMENT_NAMES) {
    if (Object.hasOwn(process.env, name)) {
      fail(`unsafe inherited environment is present: ${name}`);
    }
  }
}

function assertSafePath(relativePath, source) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    Buffer.byteLength(relativePath, "utf8") > MAX_RELATIVE_PATH_BYTES ||
    relativePath !== relativePath.normalize("NFC") ||
    !SAFE_PATH_PATTERN.test(relativePath)
  ) {
    fail(`${source} path is not canonical and safe: ${JSON.stringify(relativePath)}`);
  }
  const components = relativePath.split("/");
  if (
    components.some(
      (component) => component.length === 0 || component === "." || component === "..",
    )
  ) {
    fail(`${source} path has an unsafe component: ${JSON.stringify(relativePath)}`);
  }
}

function decodeUtf8(bytes, source) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${source} is not valid UTF-8`);
  }
}

function readBoundedRegularFile(absolutePath, source, allowEmpty = true) {
  const before = fs.lstatSync(absolutePath, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n) {
    fail(`${source} must be one regular, non-hardlinked file`);
  }
  if (
    (!allowEmpty && before.size === 0n) ||
    before.size > BigInt(MAX_PAYLOAD_FILE_BYTES)
  ) {
    fail(`${source} exceeds the bounded regular-file size`);
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
      fail(`${source} changed identity before bounded read`);
    }
    const size = Number(opened.size);
    if (totalBytesRead + size > MAX_TOTAL_BYTES_READ) {
      fail("artifact exceeds the aggregate bounded read budget");
    }
    totalBytesRead += size;
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const bytesRead = fs.readSync(descriptor, bytes, offset, size - offset, offset);
      if (bytesRead === 0) fail(`${source} became short during bounded read`);
      offset += bytesRead;
    }
    const overflowProbe = Buffer.alloc(1);
    if (fs.readSync(descriptor, overflowProbe, 0, 1, size) !== 0) {
      fail(`${source} grew during bounded read`);
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      after.ctimeNs !== opened.ctimeNs
    ) {
      fail(`${source} changed during bounded read`);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function readMetadataFile(root, relativePath, source) {
  return readBoundedRegularFile(
    path.join(root, ...relativePath.split("/")),
    source,
    false,
  );
}

function walkTree(root, directory = root, relativeDirectory = "") {
  const files = [];
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareUtf8(left.name, right.name));

  for (const entry of entries) {
    artifactTreeEntryCount += 1;
    if (artifactTreeEntryCount > MAX_TREE_ENTRIES) {
      fail("artifact tree exceeds the bounded entry count");
    }
    assertSafePath(entry.name, "artifact entry");
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    assertSafePath(relativePath, "artifact entry");
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const stat = fs.lstatSync(absolutePath);
    if (stat.isDirectory()) {
      files.push(...walkTree(root, absolutePath, relativePath));
      continue;
    }
    if (!stat.isFile()) fail(`artifact entry is not a regular file: ${relativePath}`);
    if (stat.nlink !== 1) {
      fail(`artifact regular file has shared hardlinks: ${relativePath}`);
    }
    files.push(relativePath);
  }
  return files;
}

function parseCanonicalDigestList(bytes, source, pathPrefix = "./") {
  const text = decodeUtf8(bytes, source);
  if (!text.endsWith("\n") || text.endsWith("\n\n")) {
    fail(`${source} must end with exactly one newline`);
  }
  const entries = [];
  const seen = new Set();
  let priorPath;

  for (const line of text.slice(0, -1).split("\n")) {
    const match = /^([0-9a-f]{64})  (\.\/[A-Za-z0-9_.@+/-]+)$/u.exec(line);
    if (!match) fail(`${source} line is not canonical: ${JSON.stringify(line)}`);
    const [, digest, manifestPath] = match;
    const relativePath = manifestPath.slice(pathPrefix.length);
    if (!manifestPath.startsWith(pathPrefix)) {
      fail(`${source} path has an unexpected prefix: ${manifestPath}`);
    }
    assertSafePath(relativePath, source);
    if (seen.has(relativePath)) fail(`${source} contains a duplicate path: ${relativePath}`);
    if (priorPath !== undefined && compareUtf8(priorPath, relativePath) >= 0) {
      fail(`${source} paths are not in canonical byte order`);
    }
    priorPath = relativePath;
    seen.add(relativePath);
    entries.push({ digest, relativePath });
  }
  return entries;
}

function assertSamePathSet(actualPaths, expectedPaths, source) {
  const actual = [...actualPaths].sort(compareUtf8);
  const expected = [...expectedPaths].sort(compareUtf8);
  if (
    actual.length !== expected.length ||
    actual.some((actualPath, index) => actualPath !== expected[index])
  ) {
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    const unexpected = actual.find((candidate) => !expectedSet.has(candidate));
    const missing = expected.find((candidate) => !actualSet.has(candidate));
    fail(
      `${source} path set is not exact` +
        `${unexpected ? `; unexpected=${unexpected}` : ""}` +
        `${missing ? `; missing=${missing}` : ""}`,
    );
  }
}

function assertDigests(root, entries, source, basePath = "") {
  for (const { digest, relativePath } of entries) {
    const artifactPath = basePath ? `${basePath}/${relativePath}` : relativePath;
    const absolutePath = path.join(root, ...artifactPath.split("/"));
    const bytes = readBoundedRegularFile(
      absolutePath,
      `${source} target ${relativePath}`,
    );
    if (sha256(bytes) !== digest) {
      fail(`${source} digest mismatch: ${relativePath}`);
    }
  }
}

function readAllowlist(root) {
  const bytes = readMetadataFile(root, ALLOWLIST_PATH, "payload allowlist");
  const text = decodeUtf8(bytes, "payload allowlist");
  if (!text.endsWith("\n") || text.endsWith("\n\n")) {
    fail("payload allowlist must end with exactly one newline");
  }
  const paths = text.slice(0, -1).split("\n");
  const seen = new Set();
  let priorPath;

  for (const listedPath of paths) {
    assertSafePath(listedPath, "payload allowlist");
    if (seen.has(listedPath)) {
      fail(`payload allowlist contains a duplicate path: ${listedPath}`);
    }
    if (priorPath !== undefined && compareUtf8(priorPath, listedPath) >= 0) {
      fail("payload allowlist paths are not in canonical byte order");
    }
    priorPath = listedPath;
    seen.add(listedPath);
  }
  return { bytes, paths };
}

function assertAllowedIdentity(allowlistPaths, actualFiles) {
  const allowlistSet = new Set(allowlistPaths);
  for (const requiredPath of REQUIRED_PATHS) {
    if (!allowlistSet.has(requiredPath)) {
      fail(`payload allowlist omits a required safe path: ${requiredPath}`);
    }
  }
  for (const listedPath of allowlistPaths) assertNotForbidden(listedPath);
  assertSamePathSet(
    actualFiles.filter((candidate) => candidate !== ROOT_MANIFEST_PATH),
    [...allowlistPaths, PROVENANCE_PATH],
    "payload allowlist versus artifact tree",
  );
}

function assertNotForbidden(candidate) {
  if (FORBIDDEN_PATHS.has(candidate)) {
    fail(`payload contains an explicitly forbidden path: ${candidate}`);
  }
  const lower = candidate.toLowerCase();
  const components = lower.split("/");
  const basename = components.at(-1);
  if (
    lower.startsWith(".github/") ||
    components.some((component) =>
      ["fixture", "fixtures", "secret", "secrets", "test", "tests", "__tests__"].includes(
        component,
      ),
    ) ||
    basename.startsWith("test-") ||
    /(?:^|\.)fixture(?:\.|$)/u.test(basename) ||
    /(?:^|\.)test(?:\.|$)/u.test(basename) ||
    basename === ".env" ||
    /\.(?:key|pem|p12|pfx|jks|kdb)$/u.test(basename) ||
    /^id_(?:rsa|dsa|ecdsa|ed25519)$/u.test(basename)
  ) {
    fail(`payload contains a fixture, test or secret path: ${candidate}`);
  }
}

function readProvenance(root, expectedReleaseSha, allowlistBytes, allowlistCount, innerBytes) {
  const bytes = readMetadataFile(root, PROVENANCE_PATH, "production control provenance");
  const text = decodeUtf8(bytes, "production control provenance");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("production control provenance is not valid JSON");
  }
  if (!SHA256_PATTERN.test(parsed?.nodeExecutableSha256 ?? "")) {
    fail("production control provenance has no exact Node executable digest");
  }
  const expected = {
    schemaVersion: 2,
    artifactKind: ARTIFACT_KIND,
    releaseSha: expectedReleaseSha,
    effectiveLane: parsed.effectiveLane,
    impactReceiptSha256: parsed.impactReceiptSha256,
    nodeMajor: 22,
    nodeExecutableSha256: parsed.nodeExecutableSha256,
    payloadAllowlistSha256: sha256(allowlistBytes),
    payloadFileCount: allowlistCount,
    controlBundleManifestSha256: sha256(innerBytes),
  };
  if (
    !EFFECTIVE_LANES.has(parsed.effectiveLane) ||
    !SHA256_PATTERN.test(parsed.impactReceiptSha256 ?? "")
  ) {
    fail("production control provenance has an invalid admission lane");
  }
  const canonical = `${JSON.stringify(expected, null, 2)}\n`;
  if (text !== canonical) {
    fail("production control provenance is not the exact canonical expected record");
  }
  if (Object.getPrototypeOf(parsed) !== Object.prototype) {
    fail("production control provenance must be one plain JSON object");
  }
  return expected;
}

function assertInnerBundle(root, innerBytes) {
  const entries = parseCanonicalDigestList(innerBytes, "inner control manifest");
  assertSamePathSet(
    entries.map(({ relativePath }) => relativePath),
    EXPECTED_INNER_MEMBERS,
    "inner control manifest",
  );
  const allowlist = new Set(readAllowlist(root).paths);
  for (const { relativePath } of entries) {
    const artifactPath = `${INNER_ROOT}/${relativePath}`;
    if (!allowlist.has(artifactPath)) {
      fail(`inner control manifest target is outside the payload allowlist: ${artifactPath}`);
    }
  }
  assertDigests(root, entries, "inner control manifest", INNER_ROOT);

  const authorityBytes = readMetadataFile(root, AUTHORITY_PATH, "control authority launcher");
  const authorityText = decodeUtf8(authorityBytes, "control authority launcher");
  const pinMatches = [
    ...authorityText.matchAll(
      /^readonly EXPECTED_CONTROL_MANIFEST_SHA256='([0-9a-f]{64})'\r?$/gmu,
    ),
  ];
  if (pinMatches.length !== 1) {
    fail("control authority launcher must contain exactly one canonical manifest pin");
  }
  const innerDigest = sha256(innerBytes);
  if (pinMatches[0][1] !== innerDigest) {
    fail("control authority launcher manifest pin does not match the inner manifest");
  }
}

function assertInstallAuthorityContract(root) {
  const installMapBytes = readMetadataFile(
    root,
    INSTALL_MAP_PATH,
    "production control install map",
  );
  const installMapText = decodeUtf8(
    installMapBytes,
    "production control install map",
  );
  if (!installMapText.endsWith("\n") || installMapText.endsWith("\n\n")) {
    fail("production control install map must end with exactly one newline");
  }
  const allowlist = new Set(readAllowlist(root).paths);
  const destinations = new Set();
  let priorLine;
  const lines = installMapText.slice(0, -1).split("\n");
  for (const line of lines) {
    const match = /^([A-Za-z0-9_.@+/-]+)\t(\/[A-Za-z0-9_.@+/-]+)\t(0400|0444|0500|0555)$/u.exec(
      line,
    );
    if (!match) fail("production control install map contains a noncanonical line");
    const [, source, destination] = match;
    assertSafePath(source, "production control install map source");
    const destinationComponents = destination.slice(1).split("/");
    if (
      destinationComponents.some(
        (component) => component.length === 0 || component === "." || component === "..",
      )
    ) {
      fail(`production control install map has an unsafe destination: ${destination}`);
    }
    if (!allowlist.has(source)) {
      fail(`production control install map source is outside the allowlist: ${source}`);
    }
    if (destinations.has(destination)) {
      fail(`production control install map repeats a destination: ${destination}`);
    }
    if (priorLine !== undefined && compareUtf8(priorLine, line) >= 0) {
      fail("production control install map is not in canonical byte order");
    }
    priorLine = line;
    destinations.add(destination);
  }
  if (lines.length !== 62) {
    fail("production control install map does not have the exact reviewed entry count");
  }
  for (const requiredDestination of [
    "/etc/systemd/system/leetplus-release-hydrate@.service",
    "/etc/systemd/system/leetplus-bonus-ledger-worker.service",
    "/etc/systemd/system/leetplus-bonus-ledger-worker.timer",
    "/etc/systemd/system/leetplus-langame-daily-worker.service",
    "/etc/systemd/system/leetplus-langame-daily-worker.timer",
    "/etc/systemd/system/leetplus-langame-discrepancy-audit-preflight.service",
    "/srv/leetplus/control-bundles/scheduler-free-nminus1-v1/CONTROL_BUNDLE_SHA256SUMS",
    "/usr/local/libexec/leetplus/stage-release-artifact.sh",
    "/usr/local/libexec/leetplus/run-active-bonus-ledger-worker.sh",
    "/usr/local/libexec/leetplus/run-active-langame-daily-worker.sh",
    "/usr/local/sbin/leetplus-rebind-legacy-drain-manifest-successor",
    "/usr/local/libexec/leetplus/resumable-release-orchestrator.mjs",
    "/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs",
    "/usr/local/libexec/leetplus/verify-release-hydration-systemd.mjs",
    "/usr/local/sbin/leetplus-install-scheduler-free-nminus1-v1",
    "/usr/local/sbin/leetplus-langame-discrepancy-audit-authority",
    "/usr/local/sbin/leetplus-promote-release-artifact",
    "/usr/local/sbin/leetplus-resumable-release-orchestrator",
    "/usr/local/sbin/leetplus-seal-release-artifact",
  ]) {
    if (!destinations.has(requiredDestination)) {
      fail(`production control install map omits a required authority: ${requiredDestination}`);
    }
  }

  const mapDigest = sha256(installMapBytes);
  for (const [relativePath, label] of [
    [INSTALL_AUTHORITY_PATH, "production control install authority"],
    [INSTALLED_VERIFIER_PATH, "installed generation verifier"],
  ]) {
    const source = decodeUtf8(readMetadataFile(root, relativePath, label), label);
    const pins = [
      ...source.matchAll(
        /(?:^|\n)(?:const |readonly )?EXPECTED_INSTALL_MAP_SHA256(?: =|=)\s*(?:\n\s*)?["']([0-9a-f]{64})["'];?/gu,
      ),
    ];
    if (pins.length !== 1 || pins[0][1] !== mapDigest) {
      fail(`${label} does not contain the unique exact install-map digest pin`);
    }
  }
}

function assertResumableOrchestratorContract(root) {
  const engineBytes = readMetadataFile(
    root,
    ORCHESTRATOR_ENGINE_PATH,
    "resumable release orchestrator engine",
  );
  const launcher = decodeUtf8(
    readMetadataFile(
      root,
      ORCHESTRATOR_LAUNCHER_PATH,
      "resumable release orchestrator launcher",
    ),
    "resumable release orchestrator launcher",
  );
  const pins = [
    ...launcher.matchAll(
      /^readonly EXPECTED_ENGINE_SHA256='([0-9a-f]{64})'$/gmu,
    ),
  ];
  if (pins.length !== 1 || pins[0][1] !== sha256(engineBytes)) {
    fail(
      "resumable release orchestrator launcher does not pin the exact engine bytes",
    );
  }
}

function decodeMountPath(value) {
  return value.replace(/\\(040|011|012|134)/gu, (_, code) => {
    const decoded = { "011": "\t", "012": "\n", "040": " ", "134": "\\" };
    return decoded[code];
  });
}

function ancestorPaths(absolutePath) {
  const parsed = path.parse(absolutePath);
  const relative = absolutePath.slice(parsed.root.length);
  const components = relative.split(path.sep).filter(Boolean);
  const ancestors = [parsed.root];
  let current = parsed.root;
  for (const component of components) {
    current = path.join(current, component);
    ancestors.push(current);
  }
  return ancestors;
}

function assertRootAuthority(root) {
  if (process.platform !== "linux" || typeof process.getuid !== "function") {
    fail("--require-root-authority is supported only on Linux");
  }
  if (process.getuid() !== 0 || process.getgid() !== 0) {
    fail("--require-root-authority requires a root verifier process");
  }

  for (const ancestor of ancestorPaths(root)) {
    const stat = fs.lstatSync(ancestor);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || stat.gid !== 0) {
      fail(`artifact ancestor is not a root-owned real directory: ${ancestor}`);
    }
    if ((stat.mode & 0o022) !== 0) {
      fail(`artifact ancestor is group/other writable: ${ancestor}`);
    }
  }

  const rootDevice = fs.lstatSync(root).dev;
  let authorityEntryCount = 0;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      authorityEntryCount += 1;
      if (authorityEntryCount > MAX_TREE_ENTRIES) {
        fail("root-authority artifact tree exceeds the bounded entry count");
      }
      const absolutePath = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.dev !== rootDevice) {
        fail(`artifact entry is on another device: ${absolutePath}`);
      }
      if (stat.uid !== 0 || stat.gid !== 0) {
        fail(`artifact entry is not root:root: ${absolutePath}`);
      }
      if (stat.isDirectory()) {
        if ((stat.mode & 0o022) !== 0) {
          fail(`artifact directory is group/other writable: ${absolutePath}`);
        }
        visit(absolutePath);
      } else if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o222) !== 0) {
        fail(`artifact file is not immutable regular root authority: ${absolutePath}`);
      }
    }
  };
  visit(root);

  let mountInfo;
  try {
    mountInfo = fs.readFileSync("/proc/self/mountinfo", "utf8");
  } catch {
    fail("cannot read complete mount inventory from /proc/self/mountinfo");
  }
  if (!mountInfo.endsWith("\n")) fail("mount inventory is incomplete");
  for (const line of mountInfo.slice(0, -1).split("\n")) {
    const fields = line.split(" ");
    if (fields.length < 7 || !fields.includes("-")) fail("mount inventory is malformed");
    const mountTarget = decodeMountPath(fields[4]);
    if (mountTarget === root || mountTarget.startsWith(`${root}${path.sep}`)) {
      fail(`artifact contains an exact or nested mount: ${mountTarget}`);
    }
  }
}

assertProcessBoundary();
const {
  artifactRoot,
  expectedEffectiveLane,
  expectedImpactReceiptSha256,
  expectedReleaseSha,
  requireRootAuthority,
} = parseArguments(
  process.argv.slice(2),
);
const unresolvedRoot = path.resolve(artifactRoot);
const rootStat = fs.lstatSync(unresolvedRoot);
if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
  fail("artifact root must be a real directory");
}
const root = fs.realpathSync.native(unresolvedRoot);
if (root !== unresolvedRoot) {
  fail("artifact root and every ancestor must be canonical and symlink-free");
}
if (requireRootAuthority) assertRootAuthority(root);

const actualFiles = walkTree(root).sort(compareUtf8);
const rootManifestBytes = readMetadataFile(root, ROOT_MANIFEST_PATH, "root SHA256SUMS");
const rootManifestEntries = parseCanonicalDigestList(
  rootManifestBytes,
  "root SHA256SUMS",
);
if (rootManifestEntries.some(({ relativePath }) => relativePath === ROOT_MANIFEST_PATH)) {
  fail("root SHA256SUMS must not hash itself");
}
assertSamePathSet(
  rootManifestEntries.map(({ relativePath }) => relativePath),
  actualFiles.filter((candidate) => candidate !== ROOT_MANIFEST_PATH),
  "root SHA256SUMS versus regular-file tree",
);
assertDigests(root, rootManifestEntries, "root SHA256SUMS");

const { bytes: allowlistBytes, paths: allowlistPaths } = readAllowlist(root);
assertAllowedIdentity(allowlistPaths, actualFiles);
const innerBytes = readMetadataFile(root, INNER_MANIFEST_PATH, "inner control manifest");
const provenance = readProvenance(
  root,
  expectedReleaseSha,
  allowlistBytes,
  allowlistPaths.length,
  innerBytes,
);
assertInnerBundle(root, innerBytes);
assertInstallAuthorityContract(root);
assertResumableOrchestratorContract(root);
if (
  expectedEffectiveLane !== undefined &&
  (provenance.effectiveLane !== expectedEffectiveLane ||
    provenance.impactReceiptSha256 !== expectedImpactReceiptSha256)
) {
  fail("production control provenance differs from the expected admission authority");
}

process.stdout.write(
  `PRODUCTION_CONTROL_ARTIFACT_INTEGRITY=PASS\n` +
    `PRODUCTION_CONTROL_RELEASE_SHA=${expectedReleaseSha}\n` +
    `PRODUCTION_CONTROL_SHA256SUMS_SHA256=${sha256(rootManifestBytes)}\n` +
    `PRODUCTION_CONTROL_ALLOWLIST_SHA256=${sha256(allowlistBytes)}\n` +
    `PRODUCTION_CONTROL_PAYLOAD_FILE_COUNT=${allowlistPaths.length}\n` +
    `PRODUCTION_CONTROL_INNER_MANIFEST_SHA256=${sha256(innerBytes)}\n` +
    `PRODUCTION_CONTROL_NODE_SHA256=${provenance.nodeExecutableSha256}\n` +
    `PRODUCTION_CONTROL_EFFECTIVE_LANE=${provenance.effectiveLane}\n` +
    `PRODUCTION_CONTROL_IMPACT_RECEIPT_SHA256=${provenance.impactReceiptSha256}\n` +
    `PRODUCTION_CONTROL_ROOT_AUTHORITY=${requireRootAuthority ? "REQUIRED" : "NOT_REQUESTED"}\n`,
);
