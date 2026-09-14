import { resolveGuestSessionStore } from './guest-session-store';

describe('resolveGuestSessionStore', () => {
  it('uses an exact domain-club binding and leaves shared or cross-domain sessions unresolved', () => {
    const stores = [
      {
        id: 'one',
        tenantId: 'tenant-1',
        externalDomain: 'shared.example',
        externalClubId: '1',
        isActive: true,
      },
      {
        id: 'two',
        tenantId: 'tenant-1',
        externalDomain: 'shared.example',
        externalClubId: '2',
        isActive: true,
      },
      {
        id: 'three',
        tenantId: 'tenant-1',
        externalDomain: 'single.example',
        externalClubId: '3',
        isActive: true,
      },
      {
        id: 'foreign',
        tenantId: 'tenant-2',
        externalDomain: 'shared.example',
        externalClubId: '1',
        isActive: true,
      },
    ];

    expect(
      resolveGuestSessionStore({
        tenantId: 'tenant-1',
        externalDomain: 'shared.example',
        externalClubId: '2',
        stores,
      }),
    ).toMatchObject({
      storeId: 'two',
      state: 'EXACT_CLUB',
      coverage: { covered: 1, total: 1 },
    });
    expect(
      resolveGuestSessionStore({
        tenantId: 'tenant-1',
        externalDomain: 'single.example',
        externalClubId: null,
        stores,
      }),
    ).toMatchObject({ storeId: 'three', state: 'UNIQUE_DOMAIN_STORE' });
    expect(
      resolveGuestSessionStore({
        tenantId: 'tenant-1',
        externalDomain: 'shared.example',
        externalClubId: null,
        stores,
      }),
    ).toMatchObject({
      storeId: null,
      state: 'AMBIGUOUS_DOMAIN',
      coverage: { covered: 0, total: 2 },
    });
    expect(
      resolveGuestSessionStore({
        tenantId: 'tenant-1',
        externalDomain: 'other.example',
        externalClubId: '1',
        stores,
      }),
    ).toMatchObject({ storeId: null, state: 'CROSS_DOMAIN' });
  });
});
