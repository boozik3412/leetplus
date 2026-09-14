import { BadRequestException } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';

export const GUEST_BONUS_SETTLEMENT_BINDING = 'GUEST_WALLET_CLAIM_V1';

export type BonusSettlementStore = {
  id: string;
  tenantId: string;
  isActive: boolean;
  externalDomain: string | null;
  integrationSource: {
    provider: IntegrationProvider;
    domain: string;
    isActive: boolean;
  } | null;
};

export const bonusSettlementStoreSelect = {
  id: true,
  tenantId: true,
  isActive: true,
  externalDomain: true,
  integrationSource: {
    select: { provider: true, domain: true, isActive: true },
  },
} as const satisfies Prisma.StoreSelect;

export function bonusSettlementDomain(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\.$/, '') || null;
}

export function bonusSettlementStoreMatches(
  store: BonusSettlementStore | null | undefined,
  tenantId: string,
  externalDomain: string | null | undefined,
): store is BonusSettlementStore {
  if (!store || store.tenantId !== tenantId || !store.isActive) return false;
  const source = store.integrationSource;
  const domain =
    source?.provider === IntegrationProvider.LANGAME && source.isActive
      ? source.domain
      : store.externalDomain;
  const targetDomain = bonusSettlementDomain(externalDomain);
  return (
    targetDomain !== null && bonusSettlementDomain(domain) === targetDomain
  );
}

/** Resolve payment routing without assigning a physical club to a domain fact. */
export async function resolveBonusSettlementStore(
  tx: Pick<Prisma.TransactionClient, 'store'>,
  input: {
    tenantId: string;
    externalDomain: string | null;
    claimStoreId: string | null;
    existingStoreId: string | null;
  },
): Promise<string> {
  const domain = bonusSettlementDomain(input.externalDomain);
  if (!domain) {
    throw new BadRequestException(
      'У награды не определена сеть Langame для начисления. Обратитесь в поддержку.',
    );
  }
  const selectedId = input.existingStoreId ?? input.claimStoreId;
  if (selectedId) {
    const selected = await tx.store.findFirst({
      where: { id: selectedId, tenantId: input.tenantId, isActive: true },
      select: bonusSettlementStoreSelect,
    });
    if (bonusSettlementStoreMatches(selected, input.tenantId, domain)) {
      return selected.id;
    }
    if (input.existingStoreId) {
      throw new BadRequestException(
        'Клуб начисления этой награды изменился. Обратитесь в поддержку.',
      );
    }
  }

  const candidates = await tx.store.findMany({
    where: {
      tenantId: input.tenantId,
      isActive: true,
      OR: [
        { externalDomain: { equals: domain, mode: 'insensitive' } },
        {
          integrationSource: {
            is: {
              provider: IntegrationProvider.LANGAME,
              isActive: true,
              domain: { equals: domain, mode: 'insensitive' },
            },
          },
        },
      ],
    },
    select: bonusSettlementStoreSelect,
    take: 2,
  });
  if (
    candidates.length === 1 &&
    bonusSettlementStoreMatches(candidates[0], input.tenantId, domain)
  ) {
    return candidates[0].id;
  }
  throw new BadRequestException(
    'Выберите клуб сети, в которой заработана награда, и повторите получение.',
  );
}
