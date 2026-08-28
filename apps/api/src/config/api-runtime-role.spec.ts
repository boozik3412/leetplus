import {
  API_RUNTIME_ROLE_KEY,
  apiRuntimeServiceName,
  assertCorporateApiRuntimeRole,
  assertGuestApiRuntimeRole,
  guestRuntimeEnvironmentErrors,
  resolveApiRuntimeRole,
} from './api-runtime-role';

describe('API runtime role', () => {
  it('defaults only the legacy entrypoint to COMBINED', () => {
    expect(resolveApiRuntimeRole(undefined)).toBe('COMBINED');
    expect(resolveApiRuntimeRole(' guest ')).toBe('GUEST');
    expect(resolveApiRuntimeRole('corporate')).toBe('CORPORATE');
  });

  it('rejects unknown roles instead of widening the perimeter', () => {
    expect(() => resolveApiRuntimeRole('public')).toThrow(
      `${API_RUNTIME_ROLE_KEY} must be COMBINED, CORPORATE, or GUEST`,
    );
  });

  it('binds dedicated entrypoints to their exact role', () => {
    expect(() => assertGuestApiRuntimeRole('GUEST')).not.toThrow();
    expect(() => assertCorporateApiRuntimeRole('CORPORATE')).not.toThrow();
    expect(() => assertGuestApiRuntimeRole('CORPORATE')).toThrow(
      /requires LEETPLUS_API_RUNTIME_ROLE=GUEST/,
    );
    expect(() => assertCorporateApiRuntimeRole('GUEST')).toThrow(
      /requires LEETPLUS_API_RUNTIME_ROLE=CORPORATE/,
    );
  });

  it('requires the only injected guest scheduler to remain disabled', () => {
    expect(guestRuntimeEnvironmentErrors({}, 'CORPORATE')).toEqual([]);
    expect(guestRuntimeEnvironmentErrors({}, 'GUEST')).toEqual([
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED must equal false in GUEST API runtime',
    ]);
    expect(
      guestRuntimeEnvironmentErrors(
        { GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: ' false ' },
        'GUEST',
      ),
    ).toEqual([]);
  });

  it('publishes distinct health identities for each pool', () => {
    expect(apiRuntimeServiceName('COMBINED')).toBe('leetplus-api');
    expect(apiRuntimeServiceName('CORPORATE')).toBe('leetplus-api-corporate');
    expect(apiRuntimeServiceName('GUEST')).toBe('leetplus-api-guest');
  });
});
