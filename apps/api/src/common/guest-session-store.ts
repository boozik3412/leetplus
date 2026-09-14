export type GuestSessionStoreCandidate = {
  id: string;
  tenantId: string;
  externalDomain: string | null;
  externalClubId: string | null;
  isActive: boolean;
};

export type GuestSessionStoreResolutionState =
  | 'EXACT_CLUB'
  | 'UNIQUE_DOMAIN_STORE'
  | 'AMBIGUOUS_DOMAIN'
  | 'CROSS_DOMAIN'
  | 'NO_MATCH'
  | 'MISSING_DOMAIN';

export type GuestSessionStoreResolution = {
  storeId: string | null;
  state: GuestSessionStoreResolutionState;
  reason: string | null;
  coverage: { covered: number; total: number; percent: number | null };
};

export type ResolveGuestSessionStoreInput = {
  tenantId: string;
  externalDomain: string | null;
  externalClubId: string | null;
  stores: GuestSessionStoreCandidate[];
};

export function resolveGuestSessionStore(
  input: ResolveGuestSessionStoreInput,
): GuestSessionStoreResolution {
  if (!input.externalDomain) {
    return unresolved('MISSING_DOMAIN', 'У сессии нет внешнего домена.', 0);
  }

  const tenantStores = input.stores.filter(
    (store) => store.tenantId === input.tenantId && store.isActive,
  );
  const domainStores = tenantStores.filter(
    (store) => store.externalDomain === input.externalDomain,
  );

  if (input.externalClubId) {
    const exact = domainStores.find(
      (store) => store.externalClubId === input.externalClubId,
    );
    if (exact) {
      return resolved(exact.id, 'EXACT_CLUB');
    }
    const sameClubDifferentDomain = tenantStores.some(
      (store) => store.externalClubId === input.externalClubId,
    );
    if (sameClubDifferentDomain) {
      return unresolved(
        'CROSS_DOMAIN',
        'Клуб найден только в другом внешнем домене.',
        1,
      );
    }
    return unresolved(
      'NO_MATCH',
      'Для домена и клуба нет активного магазина.',
      0,
    );
  }

  if (domainStores.length === 1) {
    return resolved(domainStores[0].id, 'UNIQUE_DOMAIN_STORE');
  }
  if (domainStores.length > 1) {
    return unresolved(
      'AMBIGUOUS_DOMAIN',
      'В домене несколько активных магазинов, клуб сессии не указан.',
      domainStores.length,
    );
  }
  return unresolved('NO_MATCH', 'Для домена нет активного магазина.', 0);
}

function resolved(
  storeId: string,
  state: Extract<
    GuestSessionStoreResolutionState,
    'EXACT_CLUB' | 'UNIQUE_DOMAIN_STORE'
  >,
): GuestSessionStoreResolution {
  return {
    storeId,
    state,
    reason: null,
    coverage: { covered: 1, total: 1, percent: 100 },
  };
}

function unresolved(
  state: Exclude<
    GuestSessionStoreResolutionState,
    'EXACT_CLUB' | 'UNIQUE_DOMAIN_STORE'
  >,
  reason: string,
  total: number,
): GuestSessionStoreResolution {
  return {
    storeId: null,
    state,
    reason,
    coverage: { covered: 0, total, percent: total === 0 ? null : 0 },
  };
}
