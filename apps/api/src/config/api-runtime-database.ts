import type { ApiRuntimeRole } from './api-runtime-role';

export const DEDICATED_API_DATABASE_ROLES = Object.freeze({
  CORPORATE: 'leetplus_api_corporate',
  GUEST: 'leetplus_api_guest',
} satisfies Record<Exclude<ApiRuntimeRole, 'COMBINED'>, string>);

const ALLOWED_DATABASE_OPTIONS = new Set([
  'schema',
  'connection_limit',
  'pool_timeout',
  'connect_timeout',
  'sslmode',
]);

export function dedicatedApiDatabaseEnvironmentErrors(
  databaseUrl: unknown,
  role: ApiRuntimeRole,
): string[] {
  if (role === 'COMBINED') return [];

  const error = `DATABASE_URL must use the dedicated ${DEDICATED_API_DATABASE_ROLES[role]} role, verified TLS, and bounded pool options in ${role} API runtime`;
  if (
    typeof databaseUrl !== 'string' ||
    !databaseUrl ||
    databaseUrl !== databaseUrl.trim()
  ) {
    return [error];
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return [error];
  }

  if (
    parsed.protocol !== 'postgresql:' ||
    parsed.username !== DEDICATED_API_DATABASE_ROLES[role] ||
    parsed.password.length < 32 ||
    !parsed.hostname ||
    parsed.pathname.length <= 1 ||
    parsed.hash
  ) {
    return [error];
  }

  const seen = new Set<string>();
  for (const [key] of parsed.searchParams) {
    if (seen.has(key) || !ALLOWED_DATABASE_OPTIONS.has(key)) {
      return [error];
    }
    seen.add(key);
  }

  if (
    parsed.searchParams.get('schema') !== 'public' ||
    !boundedInteger(parsed.searchParams.get('connection_limit'), 1, 32) ||
    !boundedInteger(parsed.searchParams.get('pool_timeout'), 1, 30) ||
    !boundedInteger(parsed.searchParams.get('connect_timeout'), 1, 30) ||
    parsed.searchParams.get('sslmode') !== 'verify-full'
  ) {
    return [error];
  }

  return [];
}

function boundedInteger(
  value: string | null,
  minimum: number,
  maximum: number,
): boolean {
  if (!value || !/^[1-9]\d*$/u.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum;
}
