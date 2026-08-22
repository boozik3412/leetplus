#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_NAME = "LEETPLUS_STORE_MANIFEST.json";
const RECEIPT_NAME = "LEETPLUS_STORE_RECEIPT";
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/u;

function fail(message) {
  throw new Error(`verify-pnpm-store-integrity: ${message}`);
}

function parseArguments(argv) {
  const mode = argv.shift();
  if (mode !== "prepare" && mode !== "verify")
    fail("mode must be prepare or verify");
  const values = new Map();
  while (argv.length > 0) {
    const key = argv.shift();
    if (!key?.startsWith("--") || argv.length === 0)
      fail(`invalid argument: ${key ?? ""}`);
    if (values.has(key)) fail(`duplicate argument: ${key}`);
    values.set(key, argv.shift());
  }
  const allowed = new Set([
    "--store-root",
    "--lockfile-sha256",
    "--node-major",
    "--pnpm-version",
    "--bundle-sha256",
  ]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) fail(`unknown argument: ${key}`);
  }
  for (const key of [
    "--store-root",
    "--lockfile-sha256",
    "--node-major",
    "--pnpm-version",
  ]) {
    if (!values.has(key)) fail(`missing argument: ${key}`);
  }
  if (mode === "prepare" && !values.has("--bundle-sha256")) {
    fail("prepare requires --bundle-sha256");
  }
  const result = {
    mode,
    storeRoot: values.get("--store-root"),
    lockfileSha256: values.get("--lockfile-sha256"),
    nodeMajor: values.get("--node-major"),
    pnpmVersion: values.get("--pnpm-version"),
    bundleSha256: values.get("--bundle-sha256"),
  };
  if (!SHA256_PATTERN.test(result.lockfileSha256))
    fail("lockfile SHA-256 is invalid");
  if (!/^[1-9][0-9]*$/u.test(result.nodeMajor)) fail("Node major is invalid");
  if (!VERSION_PATTERN.test(result.pnpmVersion))
    fail("pnpm version is invalid");
  if (
    result.bundleSha256 !== undefined &&
    !SHA256_PATTERN.test(result.bundleSha256)
  ) {
    fail("bundle SHA-256 is invalid");
  }
  return result;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(
    filePath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function assertCanonicalPath(relativePath) {
  const components = relativePath.split("/");
  if (
    components.length === 0 ||
    components.some(
      (component) =>
        component.length === 0 ||
        component === "." ||
        component === ".." ||
        component !== component.normalize("NFC") ||
        /[\\\u0000-\u001f\u007f]/u.test(component),
    )
  ) {
    fail(`store path is not canonical: ${relativePath}`);
  }
}

function decodeMountPath(value) {
  return value.replace(/\\(040|011|012|134)/gu, (_match, escaped) => {
    const replacements = { "040": " ", "011": "\t", "012": "\n", 134: "\\" };
    return replacements[escaped];
  });
}

function assertNoMountBoundary(storeRoot) {
  const mountInfo = fs.readFileSync("/proc/self/mountinfo", "utf8");
  for (const line of mountInfo.split("\n")) {
    if (line.length === 0) continue;
    const fields = line.split(" ");
    if (fields.length < 6)
      fail("/proc/self/mountinfo contains a malformed record");
    const mountPoint = decodeMountPath(fields[4]);
    if (mountPoint === storeRoot || mountPoint.startsWith(`${storeRoot}/`)) {
      fail(`store contains an exact or nested mountpoint: ${mountPoint}`);
    }
  }
}

function exactMode(stat) {
  return Number(stat.mode & 0o7777n);
}

function scanStore(storeRoot, excludeControlFiles) {
  const rootStat = fs.lstatSync(storeRoot, { bigint: true });
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    fail("store root is not a direct directory");
  if (rootStat.uid !== 0n) fail("store root is not owned by root");
  if (exactMode(rootStat) !== 0o550)
    fail("store root mode is not exactly 0550");
  const rootDevice = rootStat.dev;
  const files = [];

  function walk(directory, relativeDirectory = "") {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => compareUtf8(left.name, right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      assertCanonicalPath(relativePath);
      const absolutePath = path.join(storeRoot, ...relativePath.split("/"));
      const stat = fs.lstatSync(absolutePath, { bigint: true });
      if (stat.dev !== rootDevice)
        fail(`store entry crosses a filesystem boundary: ${relativePath}`);
      if (stat.uid !== 0n)
        fail(`store entry is not root-owned: ${relativePath}`);
      if (stat.isSymbolicLink())
        fail(`store contains a symlink: ${relativePath}`);
      if (stat.isDirectory()) {
        if (exactMode(stat) !== 0o550)
          fail(`store directory mode is not exactly 0550: ${relativePath}`);
        walk(absolutePath, relativePath);
        continue;
      }
      if (!stat.isFile())
        fail(`store contains a special filesystem entry: ${relativePath}`);
      if (exactMode(stat) !== 0o400 && exactMode(stat) !== 0o440)
        fail(`store file mode is not exactly 0400 or 0440: ${relativePath}`);
      if (stat.nlink !== 1n)
        fail(`store contains a multiply-linked file: ${relativePath}`);
      if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) {
        fail(`store file is too large to attest: ${relativePath}`);
      }
      if (
        !excludeControlFiles ||
        (relativePath !== MANIFEST_NAME && relativePath !== RECEIPT_NAME)
      ) {
        files.push({
          path: relativePath,
          sha256: sha256File(absolutePath),
          size: Number(stat.size),
        });
      }
    }
  }

  walk(storeRoot);
  files.sort((left, right) => compareUtf8(left.path, right.path));
  return files;
}

function parseReceipt(receiptPath) {
  const text = fs.readFileSync(receiptPath, "utf8");
  if (text.includes("\r") || !text.endsWith("\n"))
    fail("store receipt is not canonical LF text");
  const lines = text.slice(0, -1).split("\n");
  const expectedKeys = [
    "RECORD_VERSION",
    "LOCKFILE_SHA256",
    "NODE_MAJOR",
    "PNPM_VERSION",
    "BUNDLE_SHA256",
    "STORE_MANIFEST_SHA256",
    "STORE_REGULAR_FILE_COUNT",
    "STORE_VERIFIER_SHA256",
  ];
  if (lines.length !== expectedKeys.length)
    fail("store receipt field count is invalid");
  const values = new Map();
  lines.forEach((line, index) => {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.slice(0, separator) !== expectedKeys[index]) {
      fail("store receipt schema or field ordering is invalid");
    }
    const value = line.slice(separator + 1);
    if (values.has(expectedKeys[index]))
      fail("store receipt contains a duplicate field");
    values.set(expectedKeys[index], value);
  });
  return values;
}

function fsyncPath(targetPath) {
  const descriptor = fs.openSync(targetPath, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

if (process.platform !== "linux") fail("Linux is required");
const options = parseArguments(process.argv.slice(2));
if (options.mode === "prepare" && process.getuid?.() !== 0)
  fail("prepare requires root execution");
if (!path.isAbsolute(options.storeRoot)) fail("store root must be absolute");
const storeRoot = fs.realpathSync.native(options.storeRoot);
if (storeRoot !== options.storeRoot || storeRoot === "/")
  fail("store root must be an exact non-root path");
assertNoMountBoundary(storeRoot);

const manifestPath = path.join(storeRoot, MANIFEST_NAME);
const receiptPath = path.join(storeRoot, RECEIPT_NAME);
const verifierPath = fileURLToPath(import.meta.url);
const verifierSha256 = sha256File(verifierPath);

if (options.mode === "prepare") {
  if (fs.existsSync(manifestPath) || fs.lstatSync(storeRoot).isSymbolicLink()) {
    fail("store manifest already exists or store root is unsafe");
  }
  if (fs.existsSync(receiptPath)) fail("store receipt already exists");
  const files = scanStore(storeRoot, false);
  if (files.length === 0) fail("store has no regular package files");
  const manifestText = `${JSON.stringify({ files, version: 1 })}\n`;
  fs.writeFileSync(manifestPath, manifestText, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o400,
  });
  const manifestSha256 = sha256File(manifestPath);
  const receiptText = [
    "RECORD_VERSION=2",
    `LOCKFILE_SHA256=${options.lockfileSha256}`,
    `NODE_MAJOR=${options.nodeMajor}`,
    `PNPM_VERSION=${options.pnpmVersion}`,
    `BUNDLE_SHA256=${options.bundleSha256}`,
    `STORE_MANIFEST_SHA256=${manifestSha256}`,
    `STORE_REGULAR_FILE_COUNT=${files.length}`,
    `STORE_VERIFIER_SHA256=${verifierSha256}`,
    "",
  ].join("\n");
  fs.writeFileSync(receiptPath, receiptText, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o400,
  });
  fsyncPath(manifestPath);
  fsyncPath(receiptPath);
  fsyncPath(storeRoot);
}

const controlDevice = fs.lstatSync(storeRoot, { bigint: true }).dev;
for (const [label, controlPath] of [
  ["manifest", manifestPath],
  ["receipt", receiptPath],
]) {
  const stat = fs.lstatSync(controlPath, { bigint: true });
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== 0n ||
    stat.dev !== controlDevice ||
    stat.nlink !== 1n ||
    (exactMode(stat) !== 0o400 && exactMode(stat) !== 0o440)
  ) {
    fail(`store ${label} control file is unsafe`);
  }
  if (
    (label === "receipt" && stat.size > 16n * 1024n) ||
    (label === "manifest" && stat.size > 128n * 1024n * 1024n)
  ) {
    fail(`store ${label} control file exceeds its size limit`);
  }
}

const receipt = parseReceipt(receiptPath);
if (receipt.get("RECORD_VERSION") !== "2")
  fail("store receipt version is unsupported");
if (receipt.get("LOCKFILE_SHA256") !== options.lockfileSha256)
  fail("lockfile SHA-256 differs from receipt");
if (receipt.get("NODE_MAJOR") !== options.nodeMajor)
  fail("Node major differs from receipt");
if (receipt.get("PNPM_VERSION") !== options.pnpmVersion)
  fail("pnpm version differs from receipt");
if (
  options.bundleSha256 !== undefined &&
  receipt.get("BUNDLE_SHA256") !== options.bundleSha256
) {
  fail("bundle SHA-256 differs from receipt");
}
for (const key of [
  "BUNDLE_SHA256",
  "STORE_MANIFEST_SHA256",
  "STORE_VERIFIER_SHA256",
]) {
  if (!SHA256_PATTERN.test(receipt.get(key) ?? ""))
    fail(`store receipt ${key} is invalid`);
}
if (receipt.get("STORE_VERIFIER_SHA256") !== verifierSha256)
  fail("store verifier differs from receipt");
if (sha256File(manifestPath) !== receipt.get("STORE_MANIFEST_SHA256")) {
  fail("store manifest digest differs from receipt");
}

const manifestText = fs.readFileSync(manifestPath, "utf8");
if (
  manifestText.includes("\r") ||
  !manifestText.endsWith("\n") ||
  Buffer.byteLength(manifestText) > 128 * 1024 * 1024
) {
  fail("store manifest encoding or size is invalid");
}
let manifest;
try {
  manifest = JSON.parse(manifestText);
} catch {
  fail("store manifest is not valid JSON");
}
if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.files))
  fail("store manifest schema is invalid");
const canonicalManifest = `${JSON.stringify({ files: manifest.files, version: 1 })}\n`;
if (canonicalManifest !== manifestText)
  fail("store manifest is not canonical JSON");
if (`${manifest.files.length}` !== receipt.get("STORE_REGULAR_FILE_COUNT")) {
  fail("store regular-file count differs from receipt");
}
let previousPath = "";
for (const file of manifest.files) {
  if (
    !file ||
    Object.keys(file).join(",") !== "path,sha256,size" ||
    typeof file.path !== "string" ||
    !SHA256_PATTERN.test(file.sha256) ||
    !Number.isSafeInteger(file.size) ||
    file.size < 0
  ) {
    fail("store manifest entry is invalid");
  }
  assertCanonicalPath(file.path);
  if (file.path === MANIFEST_NAME || file.path === RECEIPT_NAME)
    fail("store manifest lists a control file");
  if (previousPath && compareUtf8(previousPath, file.path) >= 0)
    fail("store manifest paths are not unique and sorted");
  previousPath = file.path;
}

const actualFiles = scanStore(storeRoot, true);
if (actualFiles.length !== manifest.files.length)
  fail("store manifest does not cover the complete regular-file tree");
for (let index = 0; index < actualFiles.length; index += 1) {
  const actual = actualFiles[index];
  const expected = manifest.files[index];
  if (
    actual.path !== expected.path ||
    actual.sha256 !== expected.sha256 ||
    actual.size !== expected.size
  ) {
    fail(`store content differs from manifest at index ${index}`);
  }
}

process.stdout.write(`PNPM_STORE_INTEGRITY=PASS\n`);
process.stdout.write(
  `PNPM_STORE_MANIFEST_SHA256=${receipt.get("STORE_MANIFEST_SHA256")}\n`,
);
process.stdout.write(`PNPM_STORE_REGULAR_FILE_COUNT=${actualFiles.length}\n`);
