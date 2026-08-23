import { platform } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import {
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONFIRMATION,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PROFILE,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT,
  inspectCurrent180Current190PostgresqlRehearsalEnvironment,
} from "./current180-current190-disposable-postgresql-rehearsal-contract.mjs";
export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNNER_CLI_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNNER_CLI_V1";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EXPECTED_FLAGS = Object.freeze([
  "--attempt",
  "--confirm",
  "--coordinator-private",
  "--coordinator-public",
  "--coordinator-sha256",
  "--source-url",
]);

export class Current180Current190DisposablePostgresqlRehearsalRunnerCliError extends Error {
  constructor(code, findings = []) {
    super("CURRENT180-CURRENT190 disposable rehearsal CLI failed closed.");
    this.name =
      "Current180Current190DisposablePostgresqlRehearsalRunnerCliError";
    this.code = code;
    this.findings = Object.freeze([...new Set(findings)].sort());
  }
}

function fail(code, findings) {
  throw new Current180Current190DisposablePostgresqlRehearsalRunnerCliError(
    code,
    findings,
  );
}

function sameNativePath(left, right) {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return platform() === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || isProxy(argv)) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(argv);
  const expectedLength = EXPECTED_FLAGS.length * 2;
  const expectedKeys = [
    ...Array.from({ length: expectedLength }, (_, index) => String(index)),
    "length",
  ];
  if (
    descriptors.length?.value !== expectedLength ||
    Reflect.ownKeys(descriptors).sort().join("\n") !==
      expectedKeys.sort().join("\n") ||
    expectedKeys.some((key) => !Object.hasOwn(descriptors[key] ?? {}, "value"))
  ) {
    return null;
  }
  const values = new Map();
  for (let index = 0; index < expectedLength; index += 2) {
    const flag = descriptors[index].value;
    const value = descriptors[index + 1].value;
    if (
      !EXPECTED_FLAGS.includes(flag) ||
      typeof value !== "string" ||
      value.length === 0 ||
      values.has(flag)
    ) {
      return null;
    }
    values.set(flag, value);
  }
  if (values.size !== EXPECTED_FLAGS.length) return null;
  return Object.fromEntries(values);
}

export function buildCurrent180Current190DisposablePostgresqlRehearsalRunnerCliInput(
  argv,
) {
  if (arguments.length !== 1) {
    fail("RUNNER_CLI_INPUT_INVALID", ["EXACT_SIX_FLAG_PAIRS_REQUIRED"]);
  }
  const values = parseArguments(argv);
  if (values === null) {
    fail("RUNNER_CLI_INPUT_INVALID", ["EXACT_SIX_FLAG_PAIRS_REQUIRED"]);
  }
  const attempt = Number(values["--attempt"]);
  if (![1, 2].includes(attempt)) {
    fail("RUNNER_CLI_INPUT_INVALID", ["ATTEMPT_ONE_OR_TWO_REQUIRED"]);
  }
  if (
    values["--confirm"] !==
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONFIRMATION
  ) {
    fail("RUNNER_CLI_INPUT_INVALID", ["EXACT_CONFIRMATION_REQUIRED"]);
  }
  const privateKeyPath = values["--coordinator-private"];
  const publicKeyPath = values["--coordinator-public"];
  const expectedPublicKeySha256 = values["--coordinator-sha256"];
  if (
    !isAbsolute(privateKeyPath) ||
    !sameNativePath(privateKeyPath, resolve(privateKeyPath)) ||
    !isAbsolute(publicKeyPath) ||
    !sameNativePath(publicKeyPath, resolve(publicKeyPath)) ||
    sameNativePath(privateKeyPath, publicKeyPath) ||
    !SHA256_PATTERN.test(expectedPublicKeySha256)
  ) {
    fail("RUNNER_CLI_INPUT_INVALID", [
      "DISTINCT_ABSOLUTE_COORDINATOR_PATHS_AND_SHA256_REQUIRED",
    ]);
  }
  const environment = Object.freeze({
    CURRENT180_CURRENT190_PG_REHEARSAL_CONFIRM:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONFIRMATION,
    CURRENT180_CURRENT190_PG_REHEARSAL_PROFILE:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PROFILE,
    [CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT]:
      values["--source-url"],
    NODE_ENV: "test",
  });
  inspectCurrent180Current190PostgresqlRehearsalEnvironment(environment);
  return Object.freeze({
    attempt,
    coordinator: Object.freeze({
      expectedPublicKeySha256,
      privateKeyPath: resolve(privateKeyPath),
      publicKeyPath: resolve(publicKeyPath),
    }),
    environment,
  });
}

async function main() {
  const input =
    buildCurrent180Current190DisposablePostgresqlRehearsalRunnerCliInput(
      process.argv.slice(2),
    );
  const { runCurrent180Current190DisposablePostgresqlRehearsal } =
    await import("./current180-current190-disposable-postgresql-rehearsal-runner.mjs");
  const receipt =
    await runCurrent180Current190DisposablePostgresqlRehearsal(input);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (
  process.argv[1] &&
  sameNativePath(fileURLToPath(import.meta.url), resolve(process.argv[1]))
) {
  main().catch((error) => {
    const safe = {
      code:
        typeof error?.code === "string"
          ? error.code
          : "RUNNER_CLI_UNEXPECTED_FAILURE",
      failedClean: error?.failedClean === true,
      findings: Array.isArray(error?.findings) ? error.findings : [],
      status: "FAILED_CLOSED",
    };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
