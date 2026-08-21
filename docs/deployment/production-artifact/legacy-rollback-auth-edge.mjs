#!/usr/bin/env node

// Scheduler-free N-1 admission edge. The exact legacy API is never a public or
// nginx upstream: it is a child on 127.0.0.1:4301 in this process' systemd
// cgroup. Only health and login are public; every other request needs one
// syntactically valid Bearer header and a fresh bounded /auth/me validation.

import { constants as fsConstants } from "node:fs";
import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { createServer, request as httpRequest, Agent } from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const LEGACY_SHA = "7de04ff4ccc814494810730be3fa6bf661097b07";
const PRODUCTION_RELEASE_ROOT = "/srv/leetplus/rollback-releases";
const PRODUCTION_EDGE_PORT = 4300;
const PRODUCTION_CHILD_PORT = 4301;
const PRODUCTION_CHILD_PRELOAD = "/usr/local/libexec/leetplus/legacy-rollback-child-loopback.cjs";
const CHILD_PRELOAD_SHA256 = "ea25c3cf121ff21f21c02b5bf017ac6b20e943918b6624210d593e800493127c";
const LOOPBACK = "127.0.0.1";
const MAX_REQUEST_BODY_BYTES = 16 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_HEADER_BYTES = 32 * 1024;
const MAX_HEADER_COUNT = 100;
const MAX_EDGE_CONNECTIONS = 64;
const MAX_REQUESTS_PER_SOCKET = 100;
const MAX_AUTH_VALIDATION_BYTES = 64 * 1024;
const AUTH_VALIDATION_TIMEOUT_MS = 5_000;
const UPSTREAM_TIMEOUT_MS = 30_000;
const PROXY_TOTAL_TIMEOUT_MS = 45_000;
const START_TIMEOUT_MS = 45_000;
const PUBLIC_REQUESTS = new Set(["GET /health", "POST /auth/login"]);
const OPTIONAL_GUARD_SURFACES = Object.freeze([
  "GET /categories",
  "GET /categories/langame/overview",
  "GET /dashboard/summary",
  "GET /dashboard/revenue-diagnostics",
  "GET /products",
  "GET /products/:id",
  "GET /products/catalog",
  "GET /products/summary",
  "GET /stores",
  "GET /suppliers",
]);
const FORBIDDEN_REQUEST_HEADERS = new Set([
  "expect", "keep-alive", "proxy-authenticate",
  "proxy-authorization", "proxy-connection", "te", "trailer",
  "transfer-encoding", "upgrade",
]);
const FORBIDDEN_RESPONSE_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
]);
const UNSAFE_ENVIRONMENT = Object.freeze([
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
  "http_proxy", "https_proxy", "all_proxy", "no_proxy",
  "NODE_USE_ENV_PROXY", "NODE_OPTIONS", "NODE_PATH", "NODE_EXTRA_CA_CERTS",
  "NODE_DEBUG", "NODE_V8_COVERAGE", "NODE_COMPILE_CACHE", "SSLKEYLOGFILE",
  "LD_PRELOAD", "LD_LIBRARY_PATH", "LD_AUDIT", "GCONV_PATH", "LOCPATH",
  "OPENSSL_CONF", "OPENSSL_MODULES", "BASH_ENV", "ENV",
]);

function fail(code) {
  process.stderr.write(`legacy-rollback-auth-edge: ${code}\n`);
  process.exit(1);
}

let releaseSha = "";
let releaseRoot = PRODUCTION_RELEASE_ROOT;
let legacyEntry = "";
let childPreload = PRODUCTION_CHILD_PRELOAD;
let edgePort = PRODUCTION_EDGE_PORT;
let childPort = PRODUCTION_CHILD_PORT;
let authValidationTimeoutMs = AUTH_VALIDATION_TIMEOUT_MS;
let proxyTotalTimeoutMs = PROXY_TOTAL_TIMEOUT_MS;
let timeoutOverride = false;
let testMode = false;
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--release-sha") releaseSha = process.argv[++index] ?? "";
  else if (argument === "--unprivileged-test-mode") testMode = true;
  else if (argument === "--release-root") releaseRoot = process.argv[++index] ?? "";
  else if (argument === "--legacy-entry") legacyEntry = process.argv[++index] ?? "";
  else if (argument === "--child-preload") childPreload = process.argv[++index] ?? "";
  else if (argument === "--edge-port") edgePort = Number(process.argv[++index]);
  else if (argument === "--child-port") childPort = Number(process.argv[++index]);
  else if (argument === "--auth-timeout-ms") {
    authValidationTimeoutMs = Number(process.argv[++index]);
    timeoutOverride = true;
  } else if (argument === "--proxy-timeout-ms") {
    proxyTotalTimeoutMs = Number(process.argv[++index]);
    timeoutOverride = true;
  }
  else fail("UNKNOWN_ARGUMENT");
}

if (releaseSha !== LEGACY_SHA) fail("RELEASE_SHA_NOT_ADMITTED");
if (!Number.isInteger(edgePort) || edgePort < 1 || edgePort > 65_535 ||
  !Number.isInteger(childPort) || childPort < 1 || childPort > 65_535 || edgePort === childPort) {
  fail("PORT_CONTRACT_INVALID");
}
if (!Number.isInteger(authValidationTimeoutMs) || authValidationTimeoutMs < 100 ||
  authValidationTimeoutMs > AUTH_VALIDATION_TIMEOUT_MS ||
  !Number.isInteger(proxyTotalTimeoutMs) || proxyTotalTimeoutMs < 100 ||
  proxyTotalTimeoutMs > PROXY_TOTAL_TIMEOUT_MS) fail("TIMEOUT_CONTRACT_INVALID");
if (testMode) {
  if (process.getuid?.() === 0) fail("TEST_MODE_FORBIDDEN_FOR_ROOT");
  if (!legacyEntry || !releaseRoot || !childPreload) fail("TEST_INPUT_REQUIRED");
} else {
  if (process.getuid?.() === 0) fail("PRODUCTION_SERVICE_USER_REQUIRED");
  if (releaseRoot !== PRODUCTION_RELEASE_ROOT || edgePort !== PRODUCTION_EDGE_PORT ||
    childPort !== PRODUCTION_CHILD_PORT || legacyEntry || childPreload !== PRODUCTION_CHILD_PRELOAD || timeoutOverride) {
    fail("PRODUCTION_OVERRIDE_FORBIDDEN");
  }
  legacyEntry = `${releaseRoot}/${LEGACY_SHA}/apps/api/dist/main.js`;
}
for (const key of UNSAFE_ENVIRONMENT) {
  if (process.env[key]) fail(`UNSAFE_ENVIRONMENT_${key.toUpperCase()}`);
}

const canonicalReleaseRoot = await realpath(releaseRoot).catch(() => "");
if (!canonicalReleaseRoot || (!testMode && canonicalReleaseRoot !== releaseRoot)) {
  fail("RELEASE_ROOT_BOUNDARY_INVALID");
}
const expectedReleaseDirectory = resolve(canonicalReleaseRoot, LEGACY_SHA);
const releaseDirectory = await realpath(expectedReleaseDirectory).catch(() => "");
const canonicalEntry = await realpath(legacyEntry).catch(() => "");
const canonicalChildPreload = await realpath(childPreload).catch(() => "");
if (releaseDirectory !== expectedReleaseDirectory ||
  canonicalEntry !== resolve(releaseDirectory, "apps/api/dist/main.js")) {
  fail("LEGACY_ENTRY_BOUNDARY_INVALID");
}
if ((!testMode && canonicalChildPreload !== PRODUCTION_CHILD_PRELOAD) || !canonicalChildPreload) {
  fail("CHILD_PRELOAD_BOUNDARY_INVALID");
}
let entryHandle;
let preloadHandle;
try {
  entryHandle = await open(canonicalEntry, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  const entryStat = await entryHandle.stat();
  if (!entryStat.isFile() || entryStat.nlink !== 1 || entryStat.size < 1) fail("LEGACY_ENTRY_UNSAFE");
  preloadHandle = await open(canonicalChildPreload, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  const preloadStat = await preloadHandle.stat();
  if (!preloadStat.isFile() || preloadStat.nlink !== 1 || preloadStat.size < 1) fail("CHILD_PRELOAD_UNSAFE");
  const preloadBytes = await preloadHandle.readFile();
  if (createHash("sha256").update(preloadBytes).digest("hex") !== CHILD_PRELOAD_SHA256) fail("CHILD_PRELOAD_DIGEST_INVALID");
} catch {
  fail("LEGACY_CHILD_INPUT_UNREADABLE");
} finally {
  await entryHandle?.close();
  await preloadHandle?.close();
}

const childEnvironment = {
  ...process.env,
  LEGACY_ROLLBACK_CHILD_PORT: String(childPort),
  PORT: String(childPort),
};
delete childEnvironment.LEGACY_ROLLBACK_CHILD_PRELOAD_TEST_MODE;
if (testMode) childEnvironment.LEGACY_ROLLBACK_CHILD_PRELOAD_TEST_MODE = "true";
for (const key of UNSAFE_ENVIRONMENT) delete childEnvironment[key];
const child = spawn(testMode ? process.execPath : "/usr/bin/node", ["--require", canonicalChildPreload, canonicalEntry], {
  cwd: releaseDirectory,
  env: childEnvironment,
  stdio: ["ignore", "inherit", "inherit"],
});
const upstreamAgent = new Agent({ keepAlive: false, maxSockets: 64 });
let server;
let stopping = false;
let forcedExit;
let hardExit;
let childExited = false;
let terminationCode = 1;

function fixedJson(response, statusCode, code) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const body = Buffer.from(JSON.stringify({ code }));
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-length": String(body.byteLength),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

function terminate(code) {
  if (stopping) {
    if (code !== 0) terminationCode = 1;
    return;
  }
  stopping = true;
  terminationCode = code;
  server?.close();
  upstreamAgent.destroy();
  const finish = () => {
    if (forcedExit) clearTimeout(forcedExit);
    if (hardExit) clearTimeout(hardExit);
    process.exit(terminationCode);
  };
  if (childExited || child.exitCode !== null || child.signalCode !== null) {
    finish();
    return;
  }
  child.kill("SIGTERM");
  forcedExit = setTimeout(() => {
    if (!childExited && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    hardExit = setTimeout(() => process.exit(terminationCode), 1_000);
  }, 5_000);
  child.once("exit", finish);
}

child.once("error", () => terminate(1));
child.once("exit", () => {
  childExited = true;
  if (!stopping) terminate(1);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => terminate(0));
}

function rawHeaderValues(request, expectedName) {
  const values = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index].toLowerCase() === expectedName) values.push(request.rawHeaders[index + 1]);
  }
  return values;
}

function validOriginTarget(target) {
  if (typeof target !== "string" || target.length < 1 || target.length > 8_192 ||
    !target.startsWith("/") || target.startsWith("//") || target.includes("\\") ||
    target.includes("#") || /[\u0000-\u001f\u007f]/u.test(target) ||
    /%(?![0-9a-f]{2})/iu.test(target) || /%(?:00|0a|0d|2f|5c)/iu.test(target)) return false;
  try {
    const parsed = new URL(target, "http://edge.invalid");
    return parsed.origin === "http://edge.invalid" && `${parsed.pathname}${parsed.search}` === target;
  } catch {
    return false;
  }
}

function requestHeaderContract(request) {
  if (request.rawHeaders.length / 2 > MAX_HEADER_COUNT ||
    request.rawHeaders.reduce((total, value) => total + Buffer.byteLength(value), 0) > MAX_HEADER_BYTES) return false;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (FORBIDDEN_REQUEST_HEADERS.has(request.rawHeaders[index].toLowerCase())) return false;
  }
  if (rawHeaderValues(request, "host").length !== 1 ||
    rawHeaderValues(request, "authorization").length > 1 ||
    rawHeaderValues(request, "content-length").length > 1 ||
    rawHeaderValues(request, "connection").length > 1) return false;
  const connections = rawHeaderValues(request, "connection");
  if (connections.length === 1 && !/^(?:close|keep-alive)$/iu.test(connections[0])) return false;
  const lengths = rawHeaderValues(request, "content-length");
  return lengths.length === 0 || (/^(?:0|[1-9][0-9]{0,8})$/u.test(lengths[0]) && Number(lengths[0]) <= MAX_REQUEST_BODY_BYTES);
}

function declaredBodyLength(request) {
  const lengths = rawHeaderValues(request, "content-length");
  return lengths.length === 0 ? 0 : Number(lengths[0]);
}

function sanitizedHeaders(request, bodyLength) {
  const headers = {};
  for (const [name, value] of Object.entries(request.headers)) {
    const lower = name.toLowerCase();
    if (FORBIDDEN_REQUEST_HEADERS.has(lower) || lower === "connection" || lower === "host" || lower === "content-length" ||
      lower.startsWith("x-forwarded-") || value === undefined) continue;
    headers[lower] = value;
  }
  headers.host = `${LOOPBACK}:${childPort}`;
  headers["content-length"] = String(bodyLength);
  return headers;
}

function authenticateBearer(authorization, callback) {
  let settled = false;
  let validation;
  let absoluteDeadline;
  const finish = (accepted) => {
    if (settled) return;
    settled = true;
    if (absoluteDeadline) clearTimeout(absoluteDeadline);
    callback(accepted);
  };
  absoluteDeadline = setTimeout(() => {
    validation?.destroy(new Error("AUTH_VALIDATION_ABSOLUTE_TIMEOUT"));
    finish(false);
  }, authValidationTimeoutMs);
  validation = httpRequest({
    agent: upstreamAgent,
    headers: {
      accept: "application/json",
      authorization,
      connection: "close",
      host: `${LOOPBACK}:${childPort}`,
    },
    host: LOOPBACK,
    maxHeaderSize: MAX_HEADER_BYTES,
    method: "GET",
    path: "/auth/me",
    port: childPort,
    protocol: "http:",
  }, (validationResponse) => {
    const chunks = [];
    let bytes = 0;
    let invalid = validationResponse.statusCode !== 200 ||
      !/^application\/json(?:;|$)/iu.test(String(validationResponse.headers["content-type"] ?? "")) ||
      validationResponse.rawHeaders.length / 2 > MAX_HEADER_COUNT ||
      validationResponse.rawHeaders.reduce((total, value) => total + Buffer.byteLength(value), 0) > MAX_HEADER_BYTES;
    validationResponse.on("data", (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > MAX_AUTH_VALIDATION_BYTES) {
        invalid = true;
        validationResponse.destroy();
        finish(false);
        return;
      }
      chunks.push(chunk);
    });
    validationResponse.once("end", () => {
      if (invalid || bytes < 2) {
        finish(false);
        return;
      }
      try {
        const identity = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
        finish(Boolean(identity && typeof identity === "object" &&
          typeof identity.id === "string" && identity.id.length > 0 &&
          typeof identity.tenantId === "string" && identity.tenantId.length > 0 &&
          typeof identity.tenantSlug === "string" && identity.tenantSlug.length > 0 &&
          typeof identity.role === "string" && identity.role.length > 0 && identity.isActive === true));
      } catch {
        finish(false);
      }
    });
    validationResponse.once("error", () => finish(false));
  });
  validation.once("error", () => finish(false));
  validation.end();
  return validation;
}

function proxyRequest(request, response, bodyLength) {
  let requestBytes = 0;
  let requestRejected = false;
  let proxyFinished = false;
  const finishProxy = () => {
    if (proxyFinished) return;
    proxyFinished = true;
    clearTimeout(absoluteDeadline);
  };
  const upstream = httpRequest({
    agent: upstreamAgent,
    headers: sanitizedHeaders(request, bodyLength),
    host: LOOPBACK,
    maxHeaderSize: MAX_HEADER_BYTES,
    method: request.method,
    path: request.url,
    port: childPort,
    protocol: "http:",
  }, (upstreamResponse) => {
    if (upstreamResponse.rawHeaders.length / 2 > MAX_HEADER_COUNT ||
      upstreamResponse.rawHeaders.reduce((total, value) => total + Buffer.byteLength(value), 0) > MAX_HEADER_BYTES) {
      finishProxy();
      upstreamResponse.destroy();
      fixedJson(response, 502, "LEGACY_UPSTREAM_RESPONSE_INVALID");
      return;
    }
    const responseHeaders = {};
    for (const [name, value] of Object.entries(upstreamResponse.headers)) {
      if (!FORBIDDEN_RESPONSE_HEADERS.has(name.toLowerCase()) && value !== undefined) responseHeaders[name] = value;
    }
    delete responseHeaders["content-length"];
    response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
    let responseBytes = 0;
    upstreamResponse.on("data", (chunk) => {
      responseBytes += chunk.byteLength;
      if (responseBytes > MAX_RESPONSE_BYTES) {
        finishProxy();
        upstreamResponse.destroy();
        response.destroy();
        return;
      }
      if (!response.write(chunk)) {
        upstreamResponse.pause();
        response.once("drain", () => upstreamResponse.resume());
      }
    });
    upstreamResponse.once("end", () => {
      finishProxy();
      response.end();
    });
    upstreamResponse.once("error", () => {
      finishProxy();
      response.destroy();
    });
  });
  const absoluteDeadline = setTimeout(() => {
    if (proxyFinished) return;
    requestRejected = true;
    finishProxy();
    upstream.destroy(new Error("UPSTREAM_ABSOLUTE_TIMEOUT"));
    request.resume();
    fixedJson(response, 504, "LEGACY_UPSTREAM_TIMEOUT");
  }, proxyTotalTimeoutMs);
  upstream.setTimeout(UPSTREAM_TIMEOUT_MS, () => upstream.destroy(new Error("UPSTREAM_TIMEOUT")));
  upstream.once("error", () => {
    const wasRejected = requestRejected;
    requestRejected = true;
    finishProxy();
    request.resume();
    if (!wasRejected) fixedJson(response, 502, "LEGACY_UPSTREAM_UNAVAILABLE");
  });
  request.once("aborted", () => upstream.destroy());
  request.once("error", () => {
    requestRejected = true;
    upstream.destroy();
    fixedJson(response, 400, "REQUEST_STREAM_INVALID");
  });
  response.once("close", () => {
    finishProxy();
    if (!response.writableEnded) upstream.destroy();
  });
  request.on("data", (chunk) => {
    if (requestRejected) return;
    requestBytes += chunk.byteLength;
    if (requestBytes > bodyLength || requestBytes > MAX_REQUEST_BODY_BYTES) {
      requestRejected = true;
      upstream.destroy();
      fixedJson(response, requestBytes > MAX_REQUEST_BODY_BYTES ? 413 : 400,
        requestBytes > MAX_REQUEST_BODY_BYTES ? "REQUEST_BODY_TOO_LARGE" : "REQUEST_BODY_LENGTH_INVALID");
      request.resume();
      return;
    }
    if (!upstream.write(chunk)) {
      request.pause();
      upstream.once("drain", () => request.resume());
    }
  });
  request.once("end", () => {
    if (requestRejected) return;
    if (requestBytes !== bodyLength) {
      requestRejected = true;
      upstream.destroy();
      fixedJson(response, 400, "REQUEST_BODY_LENGTH_INVALID");
      return;
    }
    upstream.end();
  });
  request.resume();
}

function handleRequest(request, response) {
  if (!validOriginTarget(request.url) || !requestHeaderContract(request)) {
    fixedJson(response, 400, "REQUEST_CONTRACT_INVALID");
    request.resume();
    return;
  }
  const publicRequest = PUBLIC_REQUESTS.has(`${request.method} ${request.url}`);
  const authorization = rawHeaderValues(request, "authorization")[0] ?? "";
  if (!publicRequest && !/^Bearer [A-Za-z0-9._~-]{1,4096}$/u.test(authorization)) {
    fixedJson(response, 401, "BEARER_REQUIRED");
    request.resume();
    return;
  }
  if (publicRequest) {
    proxyRequest(request, response, declaredBodyLength(request));
    return;
  }
  request.pause();
  const validation = authenticateBearer(authorization, (accepted) => {
    if (request.destroyed || response.destroyed) return;
    if (!accepted) {
      fixedJson(response, 401, "BEARER_INVALID");
      request.resume();
      return;
    }
    proxyRequest(request, response, declaredBodyLength(request));
  });
  request.once("aborted", () => validation.destroy());
  request.once("error", () => validation.destroy());
}

async function childReady() {
  return await new Promise((resolve) => {
    let settled = false;
    let request;
    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(accepted);
    };
    const deadline = setTimeout(() => {
      request?.destroy();
      finish(false);
    }, 1_000);
    request = httpRequest({
      agent: false, host: LOOPBACK, method: "GET", path: "/health", port: childPort,
    }, (response) => {
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.byteLength;
        if (bytes > MAX_AUTH_VALIDATION_BYTES) {
          response.destroy();
          finish(false);
        }
      });
      response.once("end", () => finish(response.statusCode === 200));
      response.once("error", () => finish(false));
    });
    request.once("error", () => finish(false));
    request.end();
  });
}

const startDeadline = Date.now() + START_TIMEOUT_MS;
while (!stopping && Date.now() < startDeadline) {
  if (await childReady()) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (stopping || !(await childReady())) terminate(1);
else {
  server = createServer({ maxHeaderSize: MAX_HEADER_BYTES }, handleRequest);
  server.maxHeadersCount = MAX_HEADER_COUNT;
  server.maxConnections = MAX_EDGE_CONNECTIONS;
  server.maxRequestsPerSocket = MAX_REQUESTS_PER_SOCKET;
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.once("error", () => terminate(1));
  server.listen(edgePort, LOOPBACK, () => {
    process.stdout.write("LEGACY_ROLLBACK_AUTH_EDGE_READY=true\n");
    process.stdout.write(`LEGACY_ROLLBACK_AUTH_EDGE_OPTIONAL_SURFACE_COUNT=${OPTIONAL_GUARD_SURFACES.length}\n`);
  });
}
