export const API_RUNTIME_ROLE_KEY = 'LEETPLUS_API_RUNTIME_ROLE' as const;

export const API_RUNTIME_ROLES = ['COMBINED', 'CORPORATE', 'GUEST'] as const;

export type ApiRuntimeRole = (typeof API_RUNTIME_ROLES)[number];

export const GUEST_RUNTIME_REQUIRED_SETTINGS = Object.freeze({
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false',
});

type EnvironmentValues = Record<string, unknown>;

export function resolveApiRuntimeRole(value: unknown): ApiRuntimeRole {
  const normalized =
    typeof value === 'string' ? value.trim().toUpperCase() : '';

  if (!normalized) return 'COMBINED';
  if (API_RUNTIME_ROLES.includes(normalized as ApiRuntimeRole)) {
    return normalized as ApiRuntimeRole;
  }

  throw new Error(
    `${API_RUNTIME_ROLE_KEY} must be COMBINED, CORPORATE, or GUEST`,
  );
}

export function assertGuestApiRuntimeRole(value: unknown): void {
  assertApiRuntimeRole(value, 'GUEST', 'Guest API');
}

export function assertCorporateApiRuntimeRole(value: unknown): void {
  assertApiRuntimeRole(value, 'CORPORATE', 'Corporate API');
}

export function assertCombinedApiRuntimeRole(value: unknown): void {
  assertApiRuntimeRole(value, 'COMBINED', 'Combined API');
}

export function guestRuntimeEnvironmentErrors(
  config: EnvironmentValues,
  role: ApiRuntimeRole,
): string[] {
  if (role !== 'GUEST') return [];

  return Object.entries(GUEST_RUNTIME_REQUIRED_SETTINGS).flatMap(
    ([key, expected]) => {
      const actual =
        typeof config[key] === 'string' ? config[key].trim().toLowerCase() : '';
      return actual === expected
        ? []
        : [`${key} must equal ${expected} in GUEST API runtime`];
    },
  );
}

export function apiRuntimeServiceName(role: ApiRuntimeRole): string {
  switch (role) {
    case 'CORPORATE':
      return 'leetplus-api-corporate';
    case 'GUEST':
      return 'leetplus-api-guest';
    default:
      return 'leetplus-api';
  }
}

function assertApiRuntimeRole(
  value: unknown,
  expected: ApiRuntimeRole,
  entrypoint: string,
): void {
  if (resolveApiRuntimeRole(value) !== expected) {
    throw new Error(
      `${entrypoint} entrypoint requires ${API_RUNTIME_ROLE_KEY}=${expected}`,
    );
  }
}
