/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { BadRequestException } from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
import {
  bonusSettlementStoreMatches,
  resolveBonusSettlementStore,
} from './guest-bonus-settlement';

function store(overrides: Record<string, unknown> = {}) {
  return {
    id: 'store-1',
    tenantId: 'tenant-1',
    isActive: true,
    externalDomain: 'club.example',
    integrationSource: null,
    ...overrides,
  };
}
function transaction() {
  return { store: { findFirst: jest.fn(), findMany: jest.fn() } };
}

describe('guest bonus settlement', () => {
  it('accepts the fresh same-tenant claim store without assigning it to source reward', async () => {
    const tx = transaction();
    tx.store.findFirst.mockResolvedValue(store({ id: 'claim-store' }));
    await expect(
      resolveBonusSettlementStore(tx as any, {
        tenantId: 'tenant-1',
        externalDomain: 'CLUB.EXAMPLE.',
        claimStoreId: 'claim-store',
        existingStoreId: null,
      }),
    ).resolves.toBe('claim-store');
    expect(tx.store.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['another tenant', store({ tenantId: 'tenant-2' })],
    ['inactive store', store({ isActive: false })],
    ['another domain', store({ externalDomain: 'elsewhere.example' })],
  ])(
    'does not accept a %s as the settlement store',
    async (_name, selected) => {
      const tx = transaction();
      tx.store.findFirst.mockResolvedValue(selected);
      tx.store.findMany.mockResolvedValue([]);
      await expect(
        resolveBonusSettlementStore(tx as any, {
          tenantId: 'tenant-1',
          externalDomain: 'club.example',
          claimStoreId: 'store-1',
          existingStoreId: null,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('uses a unique active same-domain store only as a fallback', async () => {
    const tx = transaction();
    tx.store.findMany.mockResolvedValue([
      store({
        id: 'unique-source-store',
        integrationSource: {
          provider: IntegrationProvider.LANGAME,
          domain: 'club.example',
          isActive: true,
        },
      }),
    ]);
    await expect(
      resolveBonusSettlementStore(tx as any, {
        tenantId: 'tenant-1',
        externalDomain: 'club.example',
        claimStoreId: null,
        existingStoreId: null,
      }),
    ).resolves.toBe('unique-source-store');
  });

  it('fails closed for an ambiguous shared domain', async () => {
    const tx = transaction();
    tx.store.findMany.mockResolvedValue([
      store({ id: 'club-1337-a' }),
      store({ id: 'club-1337-b' }),
    ]);
    await expect(
      resolveBonusSettlementStore(tx as any, {
        tenantId: 'tenant-1',
        externalDomain: 'club.example',
        claimStoreId: null,
        existingStoreId: null,
      }),
    ).rejects.toThrow('Выберите клуб сети');
  });

  it('preserves an already bound valid settlement and rejects cross-tenant drift', async () => {
    const tx = transaction();
    tx.store.findFirst.mockResolvedValue(store({ id: 'bound-store' }));
    await expect(
      resolveBonusSettlementStore(tx as any, {
        tenantId: 'tenant-1',
        externalDomain: 'club.example',
        claimStoreId: 'other-current-club',
        existingStoreId: 'bound-store',
      }),
    ).resolves.toBe('bound-store');
    expect(
      bonusSettlementStoreMatches(
        store({ id: 'bound-store', tenantId: 'tenant-2' }),
        'tenant-1',
        'club.example',
      ),
    ).toBe(false);
  });
});
