import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildCurrent180Current190DisposablePostgresqlRehearsalRunnerCliInput } from "./current180-current190-disposable-postgresql-rehearsal-runner.cli.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(
  SCRIPT_DIRECTORY,
  "current180-current190-disposable-postgresql-rehearsal-runner.cli.mjs",
);
const CONFIRMATION =
  "run-current180-current190-disposable-postgresql16-rehearsal";
const PRIVATE_PATH = join(SCRIPT_DIRECTORY, "operator-private.pk8");
const PUBLIC_PATH = join(SCRIPT_DIRECTORY, "operator-public.spki");
const SOURCE_URL =
  "postgresql://postgres@127.0.0.1:55432/leetplus_current179_ci?schema=public";

function validArguments() {
  return [
    "--attempt",
    "1",
    "--source-url",
    SOURCE_URL,
    "--coordinator-private",
    PRIVATE_PATH,
    "--coordinator-public",
    PUBLIC_PATH,
    "--coordinator-sha256",
    "a".repeat(64),
    "--confirm",
    CONFIRMATION,
  ];
}

test("CLI builder produces only the exact pinned environment and coordinator input", () => {
  const input =
    buildCurrent180Current190DisposablePostgresqlRehearsalRunnerCliInput(
      validArguments(),
    );
  assert.equal(input.attempt, 1);
  assert.deepEqual(Object.keys(input).sort(), [
    "attempt",
    "coordinator",
    "environment",
  ]);
  assert.deepEqual(Object.keys(input.environment).sort(), [
    "CURRENT180_CURRENT190_PG_REHEARSAL_CONFIRM",
    "CURRENT180_CURRENT190_PG_REHEARSAL_PROFILE",
    "CURRENT180_CURRENT190_PG_REHEARSAL_SOURCE_DATABASE_URL",
    "NODE_ENV",
  ]);
  assert.equal(input.environment.NODE_ENV, "test");
  assert.equal(
    input.environment.CURRENT180_CURRENT190_PG_REHEARSAL_SOURCE_DATABASE_URL,
    SOURCE_URL,
  );
  assert.ok(Object.isFrozen(input));
  assert.ok(Object.isFrozen(input.coordinator));
  assert.ok(Object.isFrozen(input.environment));
});

test("CLI builder rejects missing, duplicate, malformed, production, and proxy-like argument vectors", () => {
  const cases = [
    validArguments().slice(0, -2),
    validArguments().map((value) => (value === CONFIRMATION ? "wrong" : value)),
    validArguments().map((value) => (value === "1" ? "3" : value)),
    validArguments().map((value) =>
      value === "a".repeat(64) ? "not-a-sha" : value,
    ),
    validArguments().map((value) =>
      value === SOURCE_URL
        ? "postgresql://postgres@production.example/leetplus?schema=public"
        : value,
    ),
  ];
  for (const argv of cases) {
    assert.throws(
      () =>
        buildCurrent180Current190DisposablePostgresqlRehearsalRunnerCliInput(
          argv,
        ),
      (error) =>
        typeof error?.code === "string" ||
        error?.name === "Current180Current190PostgresqlRehearsalError",
    );
  }
  const proxy = new Proxy(validArguments(), {
    get() {
      assert.fail("proxy trap must not produce an executable input");
    },
  });
  assert.throws(() =>
    buildCurrent180Current190DisposablePostgresqlRehearsalRunnerCliInput(proxy),
  );
  const accessor = validArguments();
  Object.defineProperty(accessor, "1", {
    enumerable: true,
    get() {
      assert.fail("accessor must not run");
    },
  });
  assert.throws(() =>
    buildCurrent180Current190DisposablePostgresqlRehearsalRunnerCliInput(
      accessor,
    ),
  );
});

test("CLI incomplete invocation fails before runtime loading and emits bounded diagnostics", async () => {
  const child = spawn(process.execPath, [CLI_PATH, "--attempt", "1"], {
    env: {},
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
  const [code] = await once(child, "close");
  assert.equal(code, 1);
  assert.equal(stdout, "");
  const diagnostic = JSON.parse(stderr);
  assert.deepEqual(Object.keys(diagnostic).sort(), [
    "code",
    "failedClean",
    "findings",
    "status",
  ]);
  assert.equal(diagnostic.code, "RUNNER_CLI_INPUT_INVALID");
  assert.equal(diagnostic.status, "FAILED_CLOSED");
});
