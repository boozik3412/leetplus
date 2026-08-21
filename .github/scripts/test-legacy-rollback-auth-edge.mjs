#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const LEGACY_SHA = "7de04ff4ccc814494810730be3fa6bf661097b07";
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const edge = join(root, "docs/deployment/production-artifact/legacy-rollback-auth-edge.mjs");
const childPreload = join(root, "docs/deployment/production-artifact/legacy-rollback-child-loopback.cjs");
const expectedOptionalControllers = [
  "apps/api/src/categories/categories.controller.ts",
  "apps/api/src/dashboard/dashboard.controller.ts",
  "apps/api/src/products/products.controller.ts",
  "apps/api/src/stores/stores.controller.ts",
  "apps/api/src/suppliers/suppliers.controller.ts",
];
const expectedOptionalSurfaces = [
  "GET /categories", "GET /categories/langame/overview",
  "GET /dashboard/summary", "GET /dashboard/revenue-diagnostics",
  "GET /products", "GET /products/:id", "GET /products/catalog",
  "GET /products/summary", "GET /stores", "GET /suppliers",
];
const EXPECTED_CONTROLLER_COUNT = 45;
const EXPECTED_HTTP_HANDLER_COUNT = 375;
const EXPECTED_NON_MANDATORY_JWT_COUNT = 58;
const EXPECTED_NON_MANDATORY_JWT_SHA256 = "41272ee3635f540a30b99006578be76e798e91ff4051ae96b0582abf4f64bc6d";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const controllerInventory = spawnSync("git", [
  "grep", "-l", "OptionalJwtAuthGuard", LEGACY_SHA, "--", "apps/api/src/**/*.controller.ts",
], { cwd: root, encoding: "utf8" });
assert(controllerInventory.status === 0 && !controllerInventory.stderr, "optional controller inventory failed");
const actualControllers = controllerInventory.stdout.trim().split(/\r?\n/u)
  .map((line) => line.slice(line.indexOf(":") + 1)).sort();
assert(JSON.stringify(actualControllers) === JSON.stringify(expectedOptionalControllers), "optional controller inventory drifted");
let optionalGuardCount = 0;
for (const controller of expectedOptionalControllers) {
  const source = spawnSync("git", ["show", `${LEGACY_SHA}:${controller}`], { cwd: root, encoding: "utf8" });
  assert(source.status === 0 && !source.stderr, `cannot read ${controller}`);
  optionalGuardCount += source.stdout.match(/@UseGuards\(OptionalJwtAuthGuard\)/gu)?.length ?? 0;
}
assert(optionalGuardCount === 9, "optional guard decorator count drifted");
const controllerPaths = spawnSync("git", [
  "ls-tree", "-r", "--name-only", LEGACY_SHA, "apps/api/src",
], { cwd: root, encoding: "utf8" }).stdout.trim().split(/\r?\n/u)
  .filter((path) => path.endsWith(".controller.ts")).sort();
assert(controllerPaths.length === EXPECTED_CONTROLLER_COUNT, "legacy controller count drifted");
const nonMandatoryJwtInventory = [];
let httpHandlerCount = 0;
for (const controller of controllerPaths) {
  const result = spawnSync("git", ["show", `${LEGACY_SHA}:${controller}`], { cwd: root, encoding: "utf8" });
  assert(result.status === 0 && !result.stderr, `cannot inventory ${controller}`);
  const source = result.stdout;
  const beforeClass = source.slice(0, source.indexOf("export class "));
  const controllerMatch = source.match(/@Controller\(\s*(['"])(.*?)\1\s*\)/su);
  const prefix = controllerMatch?.[2] ?? "";
  const classJwt = /@UseGuards\(\s*JwtAuthGuard(?:\s*[,\)])/su.test(beforeClass);
  const classOptional = /@UseGuards\(\s*OptionalJwtAuthGuard(?:\s*[,\)])/su.test(beforeClass);
  let decorators = [];
  let collecting = "";
  let balance = 0;
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!collecting && trimmed.startsWith("@")) {
      collecting = trimmed;
      balance = (trimmed.match(/\(/gu)?.length ?? 0) - (trimmed.match(/\)/gu)?.length ?? 0);
      if (balance <= 0) {
        decorators.push(collecting);
        collecting = "";
      }
      continue;
    }
    if (collecting) {
      collecting += ` ${trimmed}`;
      balance += (trimmed.match(/\(/gu)?.length ?? 0) - (trimmed.match(/\)/gu)?.length ?? 0);
      if (balance <= 0) {
        decorators.push(collecting);
        collecting = "";
      }
      continue;
    }
    if (!decorators.length || !trimmed || trimmed.startsWith("@")) continue;
    const routeDecorator = decorators.find((value) => /^@(Get|Post|Put|Patch|Delete|Options|Head|All)\(/u.test(value));
    if (routeDecorator) {
      const route = routeDecorator.match(/^@(Get|Post|Put|Patch|Delete|Options|Head|All)\(\s*(?:(['"])(.*?)\2)?\s*\)/su);
      assert(route, `cannot parse route decorator in ${controller}: ${routeDecorator}`);
      const method = route[1].toUpperCase();
      const path = `/${[prefix, route[3] ?? ""].filter(Boolean).join("/")}`;
      const methodDecorators = decorators.join(" ");
      const jwt = classJwt || /@UseGuards\(\s*JwtAuthGuard(?:\s*[,\)])/su.test(methodDecorators);
      const optional = classOptional || /@UseGuards\(\s*OptionalJwtAuthGuard(?:\s*[,\)])/su.test(methodDecorators);
      httpHandlerCount += 1;
      if (!jwt) nonMandatoryJwtInventory.push(`${optional ? "OPTIONAL" : "UNGUARDED"}\t${method}\t${path}\t${controller}`);
    }
    decorators = [];
  }
}
nonMandatoryJwtInventory.sort();
assert(httpHandlerCount === EXPECTED_HTTP_HANDLER_COUNT, "legacy HTTP handler inventory drifted");
assert(nonMandatoryJwtInventory.length === EXPECTED_NON_MANDATORY_JWT_COUNT,
  "legacy non-mandatory-JWT inventory count drifted");
assert(createHash("sha256").update(`${nonMandatoryJwtInventory.join("\n")}\n`).digest("hex") ===
  EXPECTED_NON_MANDATORY_JWT_SHA256, "legacy non-mandatory-JWT inventory digest drifted");
assert(nonMandatoryJwtInventory.includes("UNGUARDED\tGET\t/auth/invites/:token\tapps/api/src/auth/auth.controller.ts"),
  "unguarded invite route missing from inventory");
const authController = spawnSync("git", ["show", `${LEGACY_SHA}:apps/api/src/auth/auth.controller.ts`], {
  cwd: root, encoding: "utf8",
});
assert(authController.status === 0 && /@UseGuards\(JwtAuthGuard\)\s*@Get\('me'\)/su.test(authController.stdout),
  "legacy auth introspection route is not exact JwtAuthGuard-protected");
const authModule = spawnSync("git", ["show", `${LEGACY_SHA}:apps/api/src/auth/auth.module.ts`], {
  cwd: root, encoding: "utf8",
});
assert(authModule.status === 0 &&
  authModule.stdout.includes("const DEV_JWT_SECRET = 'leetplus-dev-jwt-secret-change-before-production';") &&
  authModule.stdout.includes("configService.get<string>('JWT_SECRET') ?? DEV_JWT_SECRET"),
"legacy public JWT fallback inventory drifted");
const edgeSource = await readFile(edge, "utf8");
const preloadSource = await readFile(childPreload, "utf8");
for (const surface of expectedOptionalSurfaces) {
  assert(edgeSource.includes(`"${surface}"`), `edge optional-surface pin missing: ${surface}`);
}
assert(edgeSource.includes("server.maxConnections = MAX_EDGE_CONNECTIONS"), "edge connection bound missing");
assert(edgeSource.includes("server.maxRequestsPerSocket = MAX_REQUESTS_PER_SOCKET"), "edge socket request bound missing");
assert(edgeSource.includes("authValidationTimeoutMs") &&
  edgeSource.includes('validation?.destroy(new Error("AUTH_VALIDATION_ABSOLUTE_TIMEOUT"))'),
"edge auth validation has no absolute total deadline");
assert(edgeSource.includes("proxyTotalTimeoutMs") &&
  edgeSource.includes('upstream.destroy(new Error("UPSTREAM_ABSOLUTE_TIMEOUT"))'),
"edge proxy has no absolute total deadline");
assert(edgeSource.includes("request.pause()") && edgeSource.includes("upstreamResponse.pause()") &&
  edgeSource.includes('response.once("drain"') && edgeSource.includes('upstream.once("drain"'),
"edge streaming backpressure contract missing");
assert(!edgeSource.includes("child.killed"), "edge shutdown trusts ChildProcess.killed before child exit");
assert(!edgeSource.includes("proxyRequest(request, response, Buffer.concat"), "edge buffers the complete request body");
assert(preloadSource.includes('host: "127.0.0.1"') && preloadSource.includes("LEGACY_ROLLBACK_MULTIPLE_LISTEN_FORBIDDEN") &&
  preloadSource.includes("LEGACY_ROLLBACK_LISTEN_PORT_FORBIDDEN"), "legacy child loopback preload is not fail-closed");
const rejectedPreload = spawnSync(process.execPath, ["--require", childPreload, "-e", "process.exit(0)"], {
  env: { ...process.env, LEGACY_ROLLBACK_CHILD_PORT: "4302", PORT: "4302" }, encoding: "utf8",
});
assert(rejectedPreload.status !== 0, "child preload accepted a noncanonical port");

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

async function request(port, path, { body = "", headers = {}, method = "GET" } = {}) {
  return await new Promise((resolveResponse, reject) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolveResponse(value);
    };
    const outgoing = httpRequest({ host: "127.0.0.1", port, path, method, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("end", () => finish({
        aborted: false, body: Buffer.concat(chunks).toString("utf8"), status: response.statusCode,
      }));
      response.once("aborted", () => finish({
        aborted: true, body: Buffer.concat(chunks).toString("utf8"), status: response.statusCode,
      }));
      response.once("error", () => finish({
        aborted: true, body: Buffer.concat(chunks).toString("utf8"), status: response.statusCode,
      }));
    });
    outgoing.once("error", (error) => {
      if (settled) return;
      reject(error);
    });
    outgoing.setTimeout(5_000, () => outgoing.destroy(new Error("fixture request deadline exceeded")));
    outgoing.end(body);
  });
}

async function rawRequest(port, bytes) {
  return await new Promise((resolveResponse, reject) => {
    const socket = connect(port, "127.0.0.1");
    let response = "";
    socket.setEncoding("utf8");
    socket.once("error", reject);
    socket.on("data", (chunk) => { response += chunk; });
    socket.once("end", () => resolveResponse(response));
    socket.once("connect", () => socket.end(bytes));
  });
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolveExit) => child.once("exit", resolveExit));
}

const testRoot = await mkdtemp(join(tmpdir(), "leetplus-auth-edge-"));
let edgeProcess;
try {
  const releaseRoot = join(testRoot, "rollback-releases");
  const releaseDirectory = join(releaseRoot, LEGACY_SHA);
  const legacyEntry = join(releaseDirectory, "apps/api/dist/main.js");
  const childLog = join(testRoot, "child.log");
  const childPidFile = join(testRoot, "child.pid");
  const childAddressFile = join(testRoot, "child.address");
  await mkdir(join(releaseDirectory, "apps/api/dist"), { recursive: true });
  await writeFile(childLog, "");
  await writeFile(legacyEntry, String.raw`
const { createServer } = require("node:http");
const { appendFileSync, writeFileSync } = require("node:fs");
writeFileSync(process.env.TEST_CHILD_PID_FILE, String(process.pid));
const server = createServer((request, response) => {
  appendFileSync(process.env.TEST_CHILD_LOG, request.method + " " + request.url + "\n");
  request.resume();
  request.once("end", () => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/health") response.end(JSON.stringify({ ok: true }));
    else if (request.url === "/auth/login") { response.statusCode = 201; response.end(JSON.stringify({ accessToken: "fixture" })); }
    else if (request.url === "/auth/me") {
      if (request.headers.authorization === "Bearer drip.jwt") {
        response.write('{"id":"');
        const interval = setInterval(() => response.write("x"), 100);
        response.once("close", () => clearInterval(interval));
      }
      else if (request.headers.authorization === "Bearer valid.jwt" || request.headers.authorization === "Bearer proxy-drip.jwt") response.end(JSON.stringify({ id: "owner-1", tenantId: "tenant-1", tenantSlug: "demo", role: "OWNER", isActive: true }));
      else { response.statusCode = 401; response.end(JSON.stringify({ message: "Unauthorized" })); }
    }
    else if (request.url === "/slow-drip") {
      response.write('{"data":"');
      const interval = setInterval(() => response.write("x"), 100);
      response.once("close", () => clearInterval(interval));
    }
    else if (request.url === "/auth/invites/public-token") response.end(JSON.stringify({ email: "would-leak-without-edge-introspection" }));
    else response.end(JSON.stringify({ authorized: true, path: request.url }));
  });
});
server.listen(Number(process.env.PORT), "0.0.0.0", () => writeFileSync(process.env.TEST_CHILD_ADDRESS_FILE, server.address().address));
process.on("SIGTERM", () => {
  if (process.env.TEST_CHILD_IGNORE_SIGTERM === "true") return;
  server.close(() => process.exit(0));
});
`);
  const edgePort = await freePort();
  const childPort = await freePort();
  const safeEnvironment = {
    LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: process.env.PATH ?? "",
    SystemRoot: process.env.SystemRoot ?? "", TEMP: process.env.TEMP ?? tmpdir(),
    TEST_CHILD_ADDRESS_FILE: childAddressFile, TEST_CHILD_LOG: childLog, TEST_CHILD_PID_FILE: childPidFile,
    TMP: process.env.TMP ?? tmpdir(), TZ: "UTC",
  };
  edgeProcess = spawn(process.execPath, [
    edge, "--release-sha", LEGACY_SHA, "--release-root", releaseRoot,
    "--legacy-entry", legacyEntry, "--child-preload", childPreload, "--edge-port", String(edgePort),
    "--child-port", String(childPort), "--unprivileged-test-mode",
  ], { env: safeEnvironment, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  edgeProcess.stdout.setEncoding("utf8");
  edgeProcess.stderr.setEncoding("utf8");
  edgeProcess.stdout.on("data", (chunk) => { stdout += chunk; });
  edgeProcess.stderr.on("data", (chunk) => { stderr += chunk; });
  const deadline = Date.now() + 15_000;
  while (!stdout.includes("LEGACY_ROLLBACK_AUTH_EDGE_READY=true") && Date.now() < deadline) {
    if (edgeProcess.exitCode !== null) throw new Error(`edge exited before ready: ${stderr}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  assert(stdout.includes("LEGACY_ROLLBACK_AUTH_EDGE_OPTIONAL_SURFACE_COUNT=10"), "edge surface count missing");
  assert((await readFile(childAddressFile, "utf8")).trim() === "127.0.0.1",
    "preload did not force a wildcard legacy child bind to loopback");

  assert((await request(edgePort, "/health")).status === 200, "public health failed");
  assert((await request(edgePort, "/auth/login", { body: "{}", headers: { "content-type": "application/json" }, method: "POST" })).status === 201, "public login failed");
  for (const surface of [...expectedOptionalSurfaces, "GET /users"]) {
    const separator = surface.indexOf(" ");
    const path = surface.slice(separator + 1).replace(":id", "product-1");
    assert((await request(edgePort, path, { method: surface.slice(0, separator) })).status === 401,
      `unauthenticated surface escaped edge: ${surface}`);
  }
  assert((await request(edgePort, "/products/summary", { headers: { authorization: "Basic abc" } })).status === 401, "Basic auth accepted");
  assert((await request(edgePort, "/products/summary", { headers: { authorization: "Bearer" } })).status === 401, "empty Bearer accepted");
  assert((await request(edgePort, "/products/summary", { headers: { authorization: "Bearer invalid.jwt" } })).status === 401, "backend-invalid Bearer accepted");
  assert((await request(edgePort, "/auth/invites/public-token", { headers: { authorization: "Bearer a" } })).status === 401,
    "syntactic fake Bearer reached an unguarded legacy route");
  assert((await request(edgePort, "/auth/invites/public-token", { headers: { authorization: "Bearer valid.jwt" } })).status === 200,
    "valid Bearer did not pass introspection before unguarded legacy route");
  assert((await request(edgePort, "/products/summary", { headers: { authorization: "Bearer valid.jwt" } })).status === 200, "authenticated request not forwarded");
  assert((await request(edgePort, "/products/import", {
    body: "x".repeat(2 * 1024 * 1024),
    headers: { authorization: "Bearer valid.jwt", "content-type": "application/octet-stream" }, method: "POST",
  })).status === 200, "bounded streaming request not forwarded");
  assert((await rawRequest(edgePort, `GET /products/summary HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer one\r\nAuthorization: Bearer two\r\n\r\n`)).includes(" 400 "), "duplicate authorization accepted");
  assert((await rawRequest(edgePort, `GET http://attacker.invalid/products HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer valid.jwt\r\n\r\n`)).includes(" 400 "), "absolute-form target accepted");
  assert((await rawRequest(edgePort, `GET /products HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer valid.jwt\r\nConnection: authorization\r\n\r\n`)).includes(" 400 "), "hop-by-hop smuggling header accepted");
  assert((await rawRequest(edgePort, `POST /auth/login HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 16777217\r\n\r\n`)).includes(" 400 "), "oversized declared request accepted");

  const childRequests = (await readFile(childLog, "utf8")).trim().split(/\r?\n/u);
  assert(childRequests.filter((line) => line.includes("/products/summary")).length === 1,
    "rejected auth request reached legacy child");
  assert(childRequests.filter((line) => line.includes("/auth/invites/public-token")).length === 1,
    "fake Bearer reached unguarded legacy handler");
  assert(childRequests.filter((line) => line.includes("/auth/me")).length === 5,
    "non-public requests did not receive one uncached auth introspection each");
  assert(!stdout.includes("valid.jwt") && !stderr.includes("valid.jwt") &&
    !stdout.includes("owner") && !stderr.includes("owner"), "edge log leaked request identity");

  edgeProcess.kill("SIGTERM");
  await waitForExit(edgeProcess);
  assert(edgeProcess.exitCode === 0 ||
    (process.platform === "win32" && edgeProcess.signalCode === "SIGTERM"),
  `edge did not stop cleanly: ${stderr}`);
  edgeProcess = undefined;

  const dripEdgePort = await freePort();
  const dripChildPort = await freePort();
  edgeProcess = spawn(process.execPath, [
    edge, "--release-sha", LEGACY_SHA, "--release-root", releaseRoot,
    "--legacy-entry", legacyEntry, "--child-preload", childPreload, "--edge-port", String(dripEdgePort),
    "--child-port", String(dripChildPort), "--auth-timeout-ms", "500", "--proxy-timeout-ms", "900",
    "--unprivileged-test-mode",
  ], { env: safeEnvironment, stdio: ["ignore", "pipe", "pipe"] });
  let dripStdout = "";
  let dripStderr = "";
  edgeProcess.stdout.setEncoding("utf8");
  edgeProcess.stderr.setEncoding("utf8");
  edgeProcess.stdout.on("data", (chunk) => { dripStdout += chunk; });
  edgeProcess.stderr.on("data", (chunk) => { dripStderr += chunk; });
  const dripReadyDeadline = Date.now() + 15_000;
  while (!dripStdout.includes("LEGACY_ROLLBACK_AUTH_EDGE_READY=true") && Date.now() < dripReadyDeadline) {
    if (edgeProcess.exitCode !== null) throw new Error(`drip edge exited before ready: ${dripStderr}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  assert(dripStdout.includes("LEGACY_ROLLBACK_AUTH_EDGE_READY=true"), "drip edge did not become ready");

  const authDripStartedAt = Date.now();
  const authDrip = await request(dripEdgePort, "/products", {
    headers: { authorization: "Bearer drip.jwt" },
  });
  const authDripElapsedMs = Date.now() - authDripStartedAt;
  assert(authDrip.status === 401 && authDripElapsedMs >= 350 && authDripElapsedMs < 2_000,
    `slow-drip auth validation escaped absolute deadline: ${authDrip.status}/${authDripElapsedMs}ms`);
  assert((await request(dripEdgePort, "/health")).status === 200,
    "auth drip did not release the edge connection");

  const proxyDripStartedAt = Date.now();
  const proxyDrip = await request(dripEdgePort, "/slow-drip", {
    headers: { authorization: "Bearer proxy-drip.jwt" },
  });
  const proxyDripElapsedMs = Date.now() - proxyDripStartedAt;
  assert(proxyDrip.aborted === true && proxyDripElapsedMs >= 700 && proxyDripElapsedMs < 2_500,
    `slow-drip upstream escaped absolute deadline: ${proxyDrip.aborted}/${proxyDripElapsedMs}ms`);
  assert((await request(dripEdgePort, "/health")).status === 200,
    "proxy drip did not release the edge connection");
  edgeProcess.kill("SIGTERM");
  await waitForExit(edgeProcess);
  assert(edgeProcess.exitCode === 0 ||
    (process.platform === "win32" && edgeProcess.signalCode === "SIGTERM"),
  `drip edge did not stop cleanly: ${dripStderr}`);
  edgeProcess = undefined;

  if (process.platform !== "win32") {
    const hostileEdgePort = await freePort();
    const hostileChildPort = await freePort();
    await writeFile(childPidFile, "");
    edgeProcess = spawn(process.execPath, [
      edge, "--release-sha", LEGACY_SHA, "--release-root", releaseRoot,
      "--legacy-entry", legacyEntry, "--child-preload", childPreload, "--edge-port", String(hostileEdgePort),
      "--child-port", String(hostileChildPort), "--unprivileged-test-mode",
    ], {
      env: { ...safeEnvironment, TEST_CHILD_IGNORE_SIGTERM: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let hostileStdout = "";
    let hostileStderr = "";
    edgeProcess.stdout.setEncoding("utf8");
    edgeProcess.stderr.setEncoding("utf8");
    edgeProcess.stdout.on("data", (chunk) => { hostileStdout += chunk; });
    edgeProcess.stderr.on("data", (chunk) => { hostileStderr += chunk; });
    const hostileDeadline = Date.now() + 15_000;
    while (!hostileStdout.includes("LEGACY_ROLLBACK_AUTH_EDGE_READY=true") && Date.now() < hostileDeadline) {
      if (edgeProcess.exitCode !== null) throw new Error(`hostile edge exited before ready: ${hostileStderr}`);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    assert(hostileStdout.includes("LEGACY_ROLLBACK_AUTH_EDGE_READY=true"), "hostile edge did not become ready");
    const hostileChildPid = Number((await readFile(childPidFile, "utf8")).trim());
    assert(Number.isSafeInteger(hostileChildPid) && hostileChildPid > 1, "hostile child pid missing");
    const stopStartedAt = Date.now();
    edgeProcess.kill("SIGTERM");
    await waitForExit(edgeProcess);
    const stopElapsedMs = Date.now() - stopStartedAt;
    assert(stopElapsedMs >= 4_500 && stopElapsedMs < 8_000,
      `hostile child shutdown was not bounded: ${stopElapsedMs}ms ${hostileStderr}`);
    let childStillExists = true;
    try { process.kill(hostileChildPid, 0); } catch { childStillExists = false; }
    assert(!childStillExists, "SIGTERM-resistant legacy child survived auth-edge shutdown");
    edgeProcess = undefined;
  }
  process.stdout.write("legacy rollback auth edge test: PASS\n");
} finally {
  if (edgeProcess && edgeProcess.exitCode === null) {
    edgeProcess.kill("SIGKILL");
    await waitForExit(edgeProcess);
  }
  await rm(testRoot, { recursive: true, force: true });
}
