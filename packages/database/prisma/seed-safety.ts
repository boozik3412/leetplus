import { createHash, randomBytes } from "node:crypto";

const PRODUCTION_ENVIRONMENT_NAMES = [
  "NODE_ENV",
  "APP_ENV",
  "DEPLOY_ENV",
  "ENVIRONMENT",
  "VERCEL_ENV",
] as const;

const PRODUCTION_ENVIRONMENT_VALUES = new Set(["prod", "production", "live"]);
const PRODUCTION_TARGET_MARKER = /(^|[-_.])(prod|production)([-_.]|$)/i;

export const DEMO_SEED_ENV = {
  enabled: "DEMO_SEED_ENABLED",
  targetEnvironment: "DEMO_SEED_TARGET_ENVIRONMENT",
  allowRemoteDatabase: "DEMO_SEED_ALLOW_REMOTE_DATABASE",
  databaseFingerprint: "DEMO_SEED_DATABASE_FINGERPRINT",
  resetExisting: "DEMO_SEED_RESET_EXISTING",
  confirmTenantId: "DEMO_SEED_CONFIRM_TENANT_ID",
  tenantSlug: "DEMO_SEED_TENANT_SLUG",
  ownerEmail: "DEMO_SEED_OWNER_EMAIL",
  ownerPassword: "DEMO_SEED_OWNER_PASSWORD",
} as const;

const PROTECTED_TENANT_SLUGS = new Set(["demo", "public-demo"]);

export type SeedEnvironment = Record<string, string | undefined>;

export type SeedDatabaseTarget = {
  databaseName: string;
  descriptor: string;
  fingerprint: string;
  hostname: string;
  isLocal: boolean;
  schema: string;
};

export type ExistingSeedTenant = {
  id: string;
  slug: string;
};

export type DemoSeedCredentials = {
  email: string;
  password: string;
  generatedEmail: boolean;
  generatedPassword: boolean;
};

function isEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");

  if (normalized === "localhost" || normalized === "::1") {
    return true;
  }

  const ipv4Parts = normalized.split(".");
  return (
    ipv4Parts.length === 4 &&
    ipv4Parts[0] === "127" &&
    ipv4Parts.every((part) => /^\d{1,3}$/.test(part))
  );
}

function hasProductionMarker(value: string) {
  return PRODUCTION_TARGET_MARKER.test(value);
}

export function inspectSeedDatabaseTarget(
  databaseUrl: string | undefined,
): SeedDatabaseTarget {
  if (!databaseUrl?.trim()) {
    throw new Error(
      "Demo seed refused: DATABASE_URL must be set before the seed safety check.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      "Demo seed refused: DATABASE_URL is not a valid PostgreSQL URL.",
    );
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      "Demo seed refused: DATABASE_URL must use the postgres or postgresql protocol.",
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  const schema = parsed.searchParams.get("schema")?.trim() || "public";

  if (!hostname || !databaseName) {
    throw new Error(
      "Demo seed refused: DATABASE_URL must include a host and database name.",
    );
  }

  const port = parsed.port || "5432";
  const descriptor = `${hostname}:${port}/${databaseName}?schema=${schema}`;
  const fingerprint = createHash("sha256")
    .update(descriptor)
    .digest("hex")
    .slice(0, 16);

  return {
    databaseName,
    descriptor,
    fingerprint,
    hostname,
    isLocal: isLoopbackHost(hostname),
    schema,
  };
}

export function assertDemoSeedEnvironment(
  environment: SeedEnvironment,
  target: SeedDatabaseTarget,
) {
  if (!isEnabled(environment[DEMO_SEED_ENV.enabled])) {
    throw new Error(
      `Demo seed refused: set ${DEMO_SEED_ENV.enabled}=true explicitly for a local development seed.`,
    );
  }

  if (
    environment[DEMO_SEED_ENV.targetEnvironment]?.trim().toLowerCase() !==
    "development"
  ) {
    throw new Error(
      `Demo seed refused: set ${DEMO_SEED_ENV.targetEnvironment}=development as an explicit non-production attestation.`,
    );
  }

  for (const variableName of PRODUCTION_ENVIRONMENT_NAMES) {
    const value = environment[variableName]?.trim().toLowerCase();
    if (value && PRODUCTION_ENVIRONMENT_VALUES.has(value)) {
      throw new Error(
        `Demo seed refused: ${variableName} identifies a production environment.`,
      );
    }
  }

  if (
    hasProductionMarker(target.hostname) ||
    hasProductionMarker(target.databaseName) ||
    hasProductionMarker(target.schema)
  ) {
    throw new Error(
      `Demo seed refused: database target ${target.descriptor} contains a production marker.`,
    );
  }

  if (!target.isLocal) {
    if (!isEnabled(environment[DEMO_SEED_ENV.allowRemoteDatabase])) {
      throw new Error(
        `Demo seed refused: ${target.descriptor} is not a loopback database. ` +
          `A non-production remote development database requires ${DEMO_SEED_ENV.allowRemoteDatabase}=true ` +
          `and ${DEMO_SEED_ENV.databaseFingerprint}=${target.fingerprint}.`,
      );
    }

    if (
      environment[DEMO_SEED_ENV.databaseFingerprint]?.trim() !==
      target.fingerprint
    ) {
      throw new Error(
        `Demo seed refused: database fingerprint confirmation is missing or incorrect. ` +
          `For the intended non-production target, set ${DEMO_SEED_ENV.databaseFingerprint}=${target.fingerprint}.`,
      );
    }
  }
}

export function assertExistingTenantResetAllowed(
  environment: SeedEnvironment,
  target: SeedDatabaseTarget,
  tenant: ExistingSeedTenant,
) {
  const resetEnabled = isEnabled(environment[DEMO_SEED_ENV.resetExisting]);
  const fingerprintMatches =
    environment[DEMO_SEED_ENV.databaseFingerprint]?.trim() ===
    target.fingerprint;
  const tenantIdMatches =
    environment[DEMO_SEED_ENV.confirmTenantId]?.trim() === tenant.id;

  if (!resetEnabled || !fingerprintMatches || !tenantIdMatches) {
    throw new Error(
      `Demo seed refused to reset existing tenant "${tenant.slug}" (${tenant.id}) on ${target.descriptor}. ` +
        `If this exact local/non-production tenant may be destroyed, set ` +
        `${DEMO_SEED_ENV.resetExisting}=true, ` +
        `${DEMO_SEED_ENV.databaseFingerprint}=${target.fingerprint}, and ` +
        `${DEMO_SEED_ENV.confirmTenantId}=${tenant.id}.`,
    );
  }
}

function normalizeOptionalValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function createDemoSeedCredentials(
  environment: SeedEnvironment,
): DemoSeedCredentials {
  const configuredEmail = normalizeOptionalValue(
    environment[DEMO_SEED_ENV.ownerEmail],
  );
  const configuredPassword = normalizeOptionalValue(
    environment[DEMO_SEED_ENV.ownerPassword],
  );
  const email =
    configuredEmail ??
    `owner+${randomBytes(8).toString("hex")}@local-demo.invalid`;
  const password = configuredPassword ?? randomBytes(24).toString("base64url");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      `Demo seed refused: ${DEMO_SEED_ENV.ownerEmail} must be a valid email address.`,
    );
  }

  if (password.length < 16) {
    throw new Error(
      `Demo seed refused: ${DEMO_SEED_ENV.ownerPassword} must contain at least 16 characters.`,
    );
  }

  return {
    email,
    password,
    generatedEmail: !configuredEmail,
    generatedPassword: !configuredPassword,
  };
}

export function resolveDemoSeedTenantSlug(environment: SeedEnvironment) {
  const slug =
    normalizeOptionalValue(environment[DEMO_SEED_ENV.tenantSlug]) ??
    "local-demo";

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      `Demo seed refused: ${DEMO_SEED_ENV.tenantSlug} must be a lowercase URL-safe slug.`,
    );
  }

  if (PROTECTED_TENANT_SLUGS.has(slug)) {
    throw new Error(
      `Demo seed refused: tenant slug "${slug}" is reserved and cannot be managed by the development seed.`,
    );
  }

  return slug;
}
