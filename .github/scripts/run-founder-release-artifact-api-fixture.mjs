import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const REQUIRED_CONFIRMATION =
  "run-founder-release-artifact-api-child-process-fixture";
const ACTIVATION_ROLE = "leetplus_founder_beta_activation_runtime";
const DATABASE_PATTERN = /^lp_founder_artifact_api_[0-9a-f]{32}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const MAX_CHILD_OUTPUT_BYTES = 256 * 1024;
const EXPECTED_MIGRATION =
  "20260819010000_staff_attachment_parent_delete_guard";
const EXPECTED_MIGRATION_COUNT = 186;

if (
  process.env.FOUNDER_RELEASE_ARTIFACT_API_CONFIRM !== REQUIRED_CONFIRMATION
) {
  throw new Error("FOUNDER_RELEASE_ARTIFACT_API_CONFIRM_REQUIRED");
}

const releaseRoot = resolve(requiredEnv("FOUNDER_RELEASE_ARTIFACT_ROOT"));
const releaseSha = requiredEnv("CI_RELEASE_SHA");
const maintenanceUrl = new URL(
  requiredEnv("FOUNDER_RELEASE_ARTIFACT_MAINTENANCE_DATABASE_URL"),
);
const port = positiveInteger(requiredEnv("FOUNDER_RELEASE_ARTIFACT_API_PORT"));

if (!RELEASE_SHA_PATTERN.test(releaseSha)) {
  throw new Error("CI_RELEASE_SHA_INVALID");
}
if (
  maintenanceUrl.protocol !== "postgresql:" ||
  maintenanceUrl.hostname !== "127.0.0.1" ||
  maintenanceUrl.pathname !== "/postgres"
) {
  throw new Error("MAINTENANCE_DATABASE_URL_INVALID");
}
if (port < 1024 || port > 65_535) {
  throw new Error("FOUNDER_RELEASE_ARTIFACT_API_PORT_INVALID");
}

const provenance = JSON.parse(
  readFileSync(join(releaseRoot, "release-provenance.json"), "utf8"),
);
if (
  provenance.releaseSha !== releaseSha ||
  provenance.databaseMigration !== EXPECTED_MIGRATION ||
  provenance.databaseMigrationCount !== EXPECTED_MIGRATION_COUNT ||
  provenance.founderPilotOperationalScriptsIncluded !== true ||
  provenance.founderPilotOperationalScriptCount !== 10 ||
  provenance.runtimeEnrollmentOperationalScriptsIncluded !== true ||
  provenance.runtimeEnrollmentOperationalScriptCount !== 6 ||
  provenance.operationalScriptCount !== 16
) {
  throw new Error("RELEASE_PROVENANCE_INVALID");
}

const artifactRequire = createRequire(
  join(releaseRoot, "apps/api/package.json"),
);
const { PrismaClient } = artifactRequire("@prisma/client");
const databaseName = `lp_founder_artifact_api_${randomUUID().replaceAll("-", "")}`;
if (!DATABASE_PATTERN.test(databaseName)) {
  throw new Error("DISPOSABLE_DATABASE_NAME_INVALID");
}

const targetUrl = new URL(maintenanceUrl);
targetUrl.pathname = `/${databaseName}`;
targetUrl.search = "?schema=public";

const activationPassword = randomBytes(32).toString("hex");
const activationUrl = new URL(targetUrl);
activationUrl.username = ACTIVATION_ROLE;
activationUrl.password = activationPassword;
activationUrl.search =
  "?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5";

const jwtSecret = randomBytes(48).toString("base64url");
const identityEncryptionKey = randomBytes(32).toString("base64url");
const identityFingerprintKey = randomBytes(48).toString("base64url");
const sensitiveValues = [
  activationPassword,
  jwtSecret,
  identityEncryptionKey,
  identityFingerprintKey,
];
const maintenance = new PrismaClient({
  datasources: { db: { url: maintenanceUrl.toString() } },
});
let primary;
let apiChild;
let databaseCreated = false;
let roleCreated = false;
let apiStopped = false;
let childStdout = "";
let childStderr = "";
let childOutputOverflow = false;
let result;
const cleanupErrors = [];

try {
  await maintenance.$connect();
  await maintenance.$executeRawUnsafe(
    `CREATE DATABASE "${databaseName}" TEMPLATE template0`,
  );
  databaseCreated = true;

  await runCommand("pnpm", ["--filter", "database", "db:deploy"], releaseRoot, {
    DATABASE_URL: targetUrl.toString(),
  });

  primary = new PrismaClient({
    datasources: { db: { url: targetUrl.toString() } },
  });
  await primary.$connect();

  await maintenance.$executeRawUnsafe(
    `CREATE ROLE "${ACTIVATION_ROLE}" LOGIN PASSWORD '${activationPassword}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
  );
  roleCreated = true;
  await maintenance.$executeRawUnsafe(
    `GRANT CONNECT ON DATABASE "${databaseName}" TO "${ACTIVATION_ROLE}"`,
  );
  await maintenance.$executeRawUnsafe(
    `REVOKE CREATE, TEMPORARY ON DATABASE "${databaseName}" FROM PUBLIC`,
  );
  await primary.$executeRawUnsafe("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  await primary.$executeRawUnsafe(
    `GRANT USAGE ON SCHEMA public TO "${ACTIVATION_ROLE}"`,
  );
  await primary.$executeRawUnsafe(
    `GRANT EXECUTE ON FUNCTION public."founder_operator_beta_tenant_activate_v2"(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE) TO "${ACTIVATION_ROLE}"`,
  );

  const platformTenantId = randomUUID();
  const actorId = randomUUID();
  await primary.tenant.create({
    data: {
      id: platformTenantId,
      name: "Artifact child process platform",
      slug: `artifact-platform-${platformTenantId}`,
      status: "ACTIVE",
      customerStage: "INTERNAL",
      onboardingStatus: "ACTIVE",
    },
  });
  await primary.user.create({
    data: {
      id: actorId,
      tenantId: platformTenantId,
      email: `artifact-platform-${actorId}@example.test`,
      passwordHash: "not-a-login-credential",
      role: "OWNER",
      accessScope: "NETWORK",
      isPlatformAdmin: true,
    },
  });

  const childEnvironment = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    DATABASE_URL: targetUrl.toString(),
    FOUNDER_OPERATOR_BETA_MODE: "ACTIVE",
    FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL: activationUrl.toString(),
    RELEASE_SHA: releaseSha,
    EXPECTED_DATABASE_MIGRATION: EXPECTED_MIGRATION,
    EXPECTED_DATABASE_MIGRATION_COUNT: String(EXPECTED_MIGRATION_COUNT),
    JWT_SECRET: jwtSecret,
    IDENTITY_MAIL_AAD_ENVIRONMENT: "ci",
    IDENTITY_MAIL_ENCRYPTION_KEY: identityEncryptionKey,
    IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: "v1",
    IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY: identityFingerprintKey,
    IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION: "v1",
    ACCESS_SCOPE_ENFORCEMENT_MODE: "ENFORCED",
    STAFF_ATTACHMENT_ACL_MODE: "ENFORCED",
    GUEST_GAME_PIPELINE_SCHEDULER_ENABLED: "false",
    GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: "false",
    GUEST_GAME_RETENTION_SCHEDULER_ENABLED: "false",
    LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: "false",
    GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED: "false",
    REPORT_DIGEST_SCHEDULER_ENABLED: "false",
    STAFF_TASK_RULES_SCHEDULER_ENABLED: "false",
    STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED: "false",
    LANGAME_SCHEDULED_HTTP_ENABLED: "false",
    GUEST_GAME_SCHEDULED_HTTP_ENABLED: "false",
    REPORT_DIGEST_SCHEDULED_HTTP_ENABLED: "false",
    GUEST_GAME_BOT_CONSUMER_ENABLED: "false",
    GUEST_GAME_TG_EDGE_ADAPTER_ENABLED: "false",
    GUEST_GAME_TG_EDGE_POLLER_ENABLED: "false",
    GUEST_GAME_DELIVERY_REAL_SEND_ENABLED: "false",
    GUEST_GAME_TELEGRAM_DELIVERY_ENABLED: "false",
    GUEST_GAME_MAX_DELIVERY_ENABLED: "false",
    GUEST_PORTAL_OTP_REAL_SEND_ENABLED: "false",
    GUEST_PORTAL_OTP_SMS_ENABLED: "false",
    LANGAME_BONUS_ACCRUAL_ENABLED: "false",
  };
  apiChild = spawn(process.execPath, ["apps/api/dist/main.js"], {
    cwd: releaseRoot,
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  apiChild.stdout.on("data", (chunk) => {
    childStdout = boundedAppend(childStdout, chunk);
  });
  apiChild.stderr.on("data", (chunk) => {
    childStderr = boundedAppend(childStderr, chunk);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const version = await waitForJson(apiChild, `${baseUrl}/version`, 60_000);
  if (version?.release?.sha !== releaseSha) {
    throw new Error("API_RELEASE_SHA_MISMATCH");
  }
  const readiness = await fetchJson(`${baseUrl}/health/ready`);
  if (
    readiness?.ok !== true ||
    readiness?.release?.sha !== releaseSha ||
    readiness?.dependencies?.database?.migration !== EXPECTED_MIGRATION ||
    readiness?.dependencies?.database?.migrationCount !==
      EXPECTED_MIGRATION_COUNT
  ) {
    throw new Error("API_READINESS_INVALID");
  }

  const token = signJwt(jwtSecret, actorId);
  const run = randomUUID();
  const tenantSlug = `artifact-beta-${run}`;
  const ownerEmail = `${tenantSlug}@example.test`;
  sensitiveValues.push(ownerEmail, token);
  const shell = {
    confirmation: `PROVISION ${tenantSlug}`,
    requestId: `${run}-shell`,
    reason: "Provision isolated release artifact API fixture",
    supportTicket: "FOUNDER-ARTIFACT-API",
    tenantName: `Fixture ${tenantSlug}`,
    tenantSlug,
    cohortKey: "founder-artifact-api-fixture",
    supportOwnerUserId: actorId,
    storeName: "Artifact API Fixture Store",
    storeTimeZone: "Asia/Yekaterinburg",
    ownerEmail,
  };
  const provisioned = await postJson(
    `${baseUrl}/admin/shared-beta/tenants/provision`,
    token,
    shell,
  );
  if (
    provisioned?.decision !== "SHELL_PROVISIONED" ||
    provisioned?.tenant?.slug !== tenantSlug
  ) {
    throw new Error("TENANT_PROVISIONING_RECEIPT_INVALID");
  }

  const now = Date.now();
  const goBody = {
    shell,
    go: {
      confirmation: `AUTHORIZE BETA ${tenantSlug}`,
      requestId: randomUUID(),
      reason: "Authorize isolated release artifact API fixture",
      supportTicket: "FOUNDER-ARTIFACT-API",
      tenantId: provisioned.tenant.id,
      tenantSlug,
      expectedExecutionRevision: 0,
      expectedEntitlementProfileRevision: 1,
      validUntil: new Date(now + 60 * 60 * 1_000).toISOString(),
      singleFounderRiskAcceptance:
        "I ACCEPT SINGLE-FOUNDER BETA OPERATIONAL RISK",
    },
  };
  const go = await postJson(
    `${baseUrl}/admin/shared-beta/tenants/${provisioned.tenant.id}/founder-operator-go`,
    token,
    goBody,
  );
  if (go?.decision !== "ISSUED" || go?.releaseSha !== releaseSha) {
    throw new Error("FOUNDER_GO_RECEIPT_INVALID");
  }

  const activationBody = {
    shell,
    activation: {
      confirmation: `ACTIVATE ${tenantSlug}`,
      requestId: randomUUID(),
      reason: "Activate isolated release artifact API fixture",
      supportTicket: "FOUNDER-ARTIFACT-API",
      tenantId: provisioned.tenant.id,
      tenantSlug,
      goId: go.goId,
      expectedExecutionRevision: 0,
      expectedEntitlementProfileRevision: 1,
      inviteExpiresAt: new Date(now + 2 * 60 * 60 * 1_000).toISOString(),
    },
  };
  const activated = await postJson(
    `${baseUrl}/admin/shared-beta/tenants/${provisioned.tenant.id}/activate`,
    token,
    activationBody,
  );
  const replayed = await postJson(
    `${baseUrl}/admin/shared-beta/tenants/${provisioned.tenant.id}/activate`,
    token,
    activationBody,
  );
  if (
    activated?.decision !== "ACTIVATED" ||
    replayed?.decision !== "REPLAYED"
  ) {
    throw new Error("FOUNDER_ACTIVATION_RECEIPT_INVALID");
  }

  const [tenant, commandCount, inviteCount, outboxCount, userCount] =
    await Promise.all([
      primary.tenant.findUniqueOrThrow({
        where: { id: provisioned.tenant.id },
      }),
      primary.founderOperatorBetaActivationCommand.count({
        where: { tenantId: provisioned.tenant.id },
      }),
      primary.userInvite.count({
        where: { tenantId: provisioned.tenant.id },
      }),
      primary.identityMailOutbox.count({
        where: { tenantId: provisioned.tenant.id, status: "PENDING" },
      }),
      primary.user.count({ where: { tenantId: provisioned.tenant.id } }),
    ]);
  if (
    tenant.status !== "ACTIVE" ||
    tenant.onboardingStatus !== "OWNER_INVITED" ||
    commandCount !== 1 ||
    inviteCount !== 1 ||
    outboxCount !== 1 ||
    userCount !== 0
  ) {
    throw new Error("FOUNDER_ACTIVATION_DATABASE_STATE_INVALID");
  }

  const responseText = JSON.stringify([provisioned, go, activated, replayed]);
  for (const forbidden of [
    ownerEmail,
    activationPassword,
    jwtSecret,
    identityEncryptionKey,
    identityFingerprintKey,
    token,
  ]) {
    if (responseText.includes(forbidden)) {
      throw new Error("FOUNDER_ACTIVATION_RESPONSE_EXPOSED_SECRET");
    }
  }

  result = {
    ok: true,
    releaseSha,
    versionSha: version.release.sha,
    migration: readiness.dependencies.database.migration,
    migrationCount: readiness.dependencies.database.migrationCount,
    provisionDecision: provisioned.decision,
    goDecision: go.decision,
    activationDecision: activated.decision,
    replayDecision: replayed.decision,
    tenantStatus: tenant.status,
    onboardingStatus: tenant.onboardingStatus,
    databaseResidue: 0,
    roleResidue: 0,
  };
} finally {
  if (apiChild) {
    try {
      await stopChild(apiChild);
      apiStopped = true;
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  for (const client of [primary]) {
    try {
      await client?.$disconnect();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (databaseCreated) {
    try {
      await maintenance.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
      databaseCreated = false;
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (roleCreated) {
    try {
      await maintenance.$executeRawUnsafe(`DROP ROLE "${ACTIVATION_ROLE}"`);
      roleCreated = false;
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    const [databaseResidue] = await maintenance.$queryRawUnsafe(
      "SELECT count(*)::int AS count FROM pg_catalog.pg_database WHERE datname = $1",
      databaseName,
    );
    const [roleResidue] = await maintenance.$queryRawUnsafe(
      "SELECT count(*)::int AS count FROM pg_catalog.pg_roles WHERE rolname = $1",
      ACTIVATION_ROLE,
    );
    if (databaseResidue?.count !== 0 || roleResidue?.count !== 0) {
      cleanupErrors.push(new Error("FOUNDER_ARTIFACT_FIXTURE_RESIDUE"));
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await maintenance.$disconnect();
  } catch (error) {
    cleanupErrors.push(error);
  }
  for (const secret of sensitiveValues) {
    if (childStdout.includes(secret) || childStderr.includes(secret)) {
      cleanupErrors.push(new Error("API_CHILD_OUTPUT_EXPOSED_SECRET"));
    }
  }
  if (childOutputOverflow) {
    cleanupErrors.push(new Error("API_CHILD_OUTPUT_LIMIT_EXCEEDED"));
  }
  childStdout = "";
  childStderr = "";
}

if (!apiStopped || cleanupErrors.length > 0) {
  throw new AggregateError(
    cleanupErrors,
    "FOUNDER_ARTIFACT_FIXTURE_CLEANUP_FAILED",
  );
}

process.stdout.write(`${JSON.stringify(result)}\n`);

function requiredEnv(key) {
  const value = process.env[key];
  if (!value || value !== value.trim()) {
    throw new Error(`${key}_REQUIRED`);
  }
  return value;
}

function positiveInteger(value) {
  if (!/^[1-9]\d*$/u.test(value)) {
    throw new Error("POSITIVE_INTEGER_REQUIRED");
  }
  return Number(value);
}

function boundedAppend(current, chunk) {
  const next = current + chunk.toString("utf8");
  if (Buffer.byteLength(next, "utf8") > MAX_CHILD_OUTPUT_BYTES) {
    childOutputOverflow = true;
    return current;
  }
  return next;
}

async function runCommand(command, args, cwd, extraEnv) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: "ignore",
  });
  let outcome;
  try {
    outcome = await waitForExit(child, 120_000);
  } catch {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      try {
        await waitForExit(child, 5_000);
      } catch {
        // The isolated job is fail-closed and will be torn down by the runner.
      }
    }
    throw new Error("ARTIFACT_DATABASE_MIGRATION_FAILED");
  }
  if (outcome.code !== 0) {
    throw new Error("ARTIFACT_DATABASE_MIGRATION_FAILED");
  }
}

async function waitForJson(child, url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("API_CHILD_EXITED_BEFORE_READY");
    }
    try {
      return await fetchJson(url);
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  throw new Error("API_CHILD_STARTUP_TIMEOUT");
}

async function fetchJson(url, init) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error("API_HTTP_REQUEST_FAILED");
  }
  return response.json();
}

function postJson(url, token, body) {
  return fetchJson(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function signJwt(secret, subject) {
  const now = Math.floor(Date.now() / 1_000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: subject, iat: now, exp: now + 300 }),
  ).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", secret)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error("API_CHILD_EXITED_BEFORE_CONTROLLED_SHUTDOWN");
  }
  if (!child.kill("SIGTERM")) {
    throw new Error("API_CHILD_CONTROLLED_SHUTDOWN_SIGNAL_FAILED");
  }
  try {
    const outcome = await waitForExit(child, 15_000);
    if (outcome.code !== 0 && outcome.signal !== "SIGTERM") {
      throw new Error("API_CHILD_GRACEFUL_SHUTDOWN_FAILED");
    }
  } catch {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      try {
        await waitForExit(child, 5_000);
      } catch {
        // Preserve the original fail-closed shutdown result.
      }
    }
    throw new Error("API_CHILD_GRACEFUL_SHUTDOWN_FAILED");
  }
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolveExit, rejectExit) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveExit({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timeout = setTimeout(() => {
      cleanup();
      rejectExit(new Error("CHILD_PROCESS_TIMEOUT"));
    }, timeoutMs);
    const onError = () => {
      cleanup();
      rejectExit(new Error("CHILD_PROCESS_ERROR"));
    };
    const onExit = (code, signal) => {
      cleanup();
      resolveExit({ code, signal });
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("error", onError);
      child.off("exit", onExit);
    };
    child.once("error", onError);
    child.once("exit", onExit);
  });
}
