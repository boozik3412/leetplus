import { once } from "node:events";
import { createServer } from "node:http";
import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const CONFIRM = "run-release-artifact-web-pair-child-process-fixture";
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const PORT_PATTERN = /^[1-9][0-9]{3,4}$/u;
const MAX_LOG_BYTES = 64 * 1024;

function fail(message) {
  throw new Error(`release-artifact-web-pair fixture: ${message}`);
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is required`);
  return value;
}

function requiredPort(name) {
  const raw = requiredEnvironment(name);
  if (!PORT_PATTERN.test(raw))
    fail(`${name} must be a non-privileged TCP port`);
  const value = Number(raw);
  if (value < 1024 || value > 65535)
    fail(`${name} is outside the allowed range`);
  return value;
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16 * 1024)
      fail("BFF sent an unexpectedly large login request");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function appendBounded(current, chunk) {
  const combined = current + String(chunk);
  return combined.length > MAX_LOG_BYTES
    ? combined.slice(combined.length - MAX_LOG_BYTES)
    : combined;
}

async function waitForWeb(url, childState) {
  const deadline = Date.now() + 60_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    if (childState.exit !== null) {
      fail(
        `Web exited before readiness (${childState.exit}); stdout=${childState.stdout}; stderr=${childState.stderr}`,
      );
    }
    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status === 200) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(
    `Web did not become ready: ${lastError}; stdout=${childState.stdout}; stderr=${childState.stderr}`,
  );
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const graceful = Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000, "timeout")),
  ]);
  if ((await graceful) === "timeout" && child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

if (requiredEnvironment("RELEASE_ARTIFACT_WEB_PAIR_CONFIRM") !== CONFIRM) {
  fail("explicit confirmation is absent");
}

const releaseSha = requiredEnvironment("RELEASE_ARTIFACT_WEB_PAIR_SHA");
if (!SHA_PATTERN.test(releaseSha)) fail("release SHA is invalid");
const apiPort = requiredPort("RELEASE_ARTIFACT_WEB_PAIR_API_PORT");
const webPort = requiredPort("RELEASE_ARTIFACT_WEB_PAIR_WEB_PORT");
if (apiPort === webPort) fail("API and Web ports must differ");

const releaseRoot = await realpath(
  requiredEnvironment("RELEASE_ARTIFACT_WEB_PAIR_ROOT"),
);
const webRoot = join(releaseRoot, "apps", "web");
const nextEntry = join(webRoot, "node_modules", "next", "dist", "bin", "next");
const [nextMetadata, buildId] = await Promise.all([
  lstat(nextEntry),
  readFile(join(webRoot, ".next", "BUILD_ID"), "utf8"),
]);
if (!nextMetadata.isFile() || nextMetadata.isSymbolicLink())
  fail("Next runtime entry is unsafe");
if (buildId.trimEnd() !== releaseSha)
  fail("downloaded Web BUILD_ID does not match release SHA");

let pairedRequest = null;
const apiServer = createServer(async (request, response) => {
  try {
    if (request.method !== "POST" || request.url !== "/auth/login") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end('{"message":"not found"}');
      return;
    }
    const body = await readBody(request);
    pairedRequest = {
      body: JSON.parse(body),
      host: request.headers.host,
      method: request.method,
      url: request.url,
    };
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    });
    response.end(
      JSON.stringify({
        accessToken: "fixture-access-token",
        user: {
          id: "fixture-user",
          email: "fixture@example.test",
          role: "OWNER",
        },
      }),
    );
  } catch {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end('{"message":"invalid fixture request"}');
  }
});

await new Promise((resolve, reject) => {
  apiServer.once("error", reject);
  apiServer.listen(apiPort, "127.0.0.1", resolve);
});

const childState = { exit: null, stderr: "", stdout: "" };
const childEnvironment = {
  API_URL: `http://127.0.0.1:${apiPort}`,
  CI: "true",
  HOME: process.env.HOME,
  NODE_ENV: "production",
  NO_COLOR: "1",
  PATH: process.env.PATH,
  RELEASE_SHA: releaseSha,
  // Deliberately poison the browser-exposed legacy fallback. A successful BFF
  // request proves that the built server resolves the slot-scoped API_URL.
  NEXT_PUBLIC_API_URL: "http://127.0.0.1:9",
  WEB_BUILD_ID: releaseSha,
};
const webChild = spawn(
  process.execPath,
  [nextEntry, "start", "--hostname", "127.0.0.1", "--port", String(webPort)],
  { cwd: webRoot, env: childEnvironment, stdio: ["ignore", "pipe", "pipe"] },
);
webChild.stdout.on("data", (chunk) => {
  childState.stdout = appendBounded(childState.stdout, chunk);
});
webChild.stderr.on("data", (chunk) => {
  childState.stderr = appendBounded(childState.stderr, chunk);
});
webChild.once("exit", (code, signal) => {
  childState.exit = code ?? signal ?? "unknown";
});

try {
  const identityResponse = await waitForWeb(
    `http://127.0.0.1:${webPort}/api/release-identity`,
    childState,
  );
  const cacheControl = identityResponse.headers.get("cache-control") ?? "";
  if (
    !cacheControl
      .toLowerCase()
      .split(",")
      .map((value) => value.trim())
      .includes("no-store")
  ) {
    fail("dynamic Web identity is cacheable");
  }
  const identity = await identityResponse.json();
  if (
    identity?.ok !== true ||
    identity?.release?.sha !== releaseSha ||
    identity?.release?.webBuildId !== releaseSha
  )
    fail("dynamic Web identity does not match the downloaded artifact");

  const loginResponse = await fetch(
    `http://127.0.0.1:${webPort}/api/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "fixture@example.test",
        password: "fixture-password",
        rememberMe: false,
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (loginResponse.status !== 200)
    fail(`authenticated BFF returned HTTP ${loginResponse.status}`);
  const loginBody = await loginResponse.json();
  if (loginBody?.user?.id !== "fixture-user")
    fail("authenticated BFF response projection is invalid");
  const cookie = loginResponse.headers.get("set-cookie") ?? "";
  if (
    !/leetplus_access_token=fixture-access-token/u.test(cookie) ||
    !/HttpOnly/iu.test(cookie) ||
    !/Secure/iu.test(cookie)
  ) {
    fail("authenticated BFF did not set the production HttpOnly cookie");
  }
  if (
    pairedRequest?.host !== `127.0.0.1:${apiPort}` ||
    pairedRequest?.method !== "POST" ||
    pairedRequest?.url !== "/auth/login" ||
    pairedRequest?.body?.email !== "fixture@example.test" ||
    pairedRequest?.body?.password !== "fixture-password" ||
    Object.hasOwn(pairedRequest?.body ?? {}, "rememberMe")
  )
    fail("built Web BFF did not pair with the exact slot API contract");

  process.stdout.write(
    `RELEASE_ARTIFACT_WEB_PAIR_ACCEPTED_SHA=${releaseSha}\n`,
  );
  process.stdout.write(
    `RELEASE_ARTIFACT_WEB_PAIR_API_URL=http://127.0.0.1:${apiPort}\n`,
  );
} finally {
  await stopChild(webChild);
  await new Promise((resolve) => apiServer.close(resolve));
}
