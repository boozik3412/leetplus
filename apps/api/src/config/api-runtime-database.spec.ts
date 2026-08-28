import {
  DEDICATED_API_DATABASE_ROLES,
  dedicatedApiDatabaseEnvironmentErrors,
} from './api-runtime-database';

const PASSWORD = 'p'.repeat(40);

function databaseUrl(role: 'CORPORATE' | 'GUEST'): string {
  return (
    `postgresql://${DEDICATED_API_DATABASE_ROLES[role]}:${PASSWORD}` +
    '@db.internal.leetplus.ru:5432/leetplus' +
    '?schema=public&connection_limit=12&pool_timeout=5&connect_timeout=5&sslmode=verify-full'
  );
}

describe('dedicated API database environment', () => {
  it('does not change the current combined runtime contract', () => {
    expect(
      dedicatedApiDatabaseEnvironmentErrors(undefined, 'COMBINED'),
    ).toEqual([]);
  });

  it.each(['CORPORATE', 'GUEST'] as const)(
    'accepts the exact bounded %s pool',
    (role) => {
      expect(
        dedicatedApiDatabaseEnvironmentErrors(databaseUrl(role), role),
      ).toEqual([]);
    },
  );

  it('rejects cross-contour credential reuse', () => {
    expect(
      dedicatedApiDatabaseEnvironmentErrors(databaseUrl('CORPORATE'), 'GUEST'),
    ).toHaveLength(1);
    expect(
      dedicatedApiDatabaseEnvironmentErrors(databaseUrl('GUEST'), 'CORPORATE'),
    ).toHaveLength(1);
  });

  it.each([
    ['unbounded', 'connection_limit=0'],
    ['oversized', 'connection_limit=33'],
    ['unverified TLS', 'sslmode=require'],
    ['extra option', 'sslmode=verify-full&application_name=guest'],
    ['duplicate option', 'pool_timeout=5&pool_timeout=6'],
  ])('rejects a %s database URL', (_case, replacement) => {
    const valid = databaseUrl('GUEST');
    const invalid = replacement.startsWith('connection_limit')
      ? valid.replace('connection_limit=12', replacement)
      : replacement.startsWith('sslmode=require')
        ? valid.replace('sslmode=verify-full', replacement)
        : replacement.startsWith('sslmode=verify-full')
          ? valid.replace('sslmode=verify-full', replacement)
          : valid.replace('pool_timeout=5', replacement);

    expect(
      dedicatedApiDatabaseEnvironmentErrors(invalid, 'GUEST'),
    ).toHaveLength(1);
  });
});
