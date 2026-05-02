import { ProductParsingSuggestionStatus, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ProductParsingService } from './product-parsing.service';

type PrismaMock = {
  product: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  store: {
    findMany: jest.Mock;
  };
  productParsingRun: {
    create: jest.Mock;
    update: jest.Mock;
    findFirst: jest.Mock;
  };
  productParsingSuggestion: {
    updateMany: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  canonicalProduct: {
    count: jest.Mock;
    upsert: jest.Mock;
  };
};

type TenantContextMock = {
  resolve: jest.Mock;
};

type SuggestionCreateCall = [
  {
    data: {
      productIds: string[];
      rationale: {
        warnings: string[];
        products: {
          id: string;
          canonicalProductId: string | null;
          canonicalProductName: string | null;
        }[];
      };
    };
  },
];

type CanonicalProductUpsertCall = [
  {
    where: {
      tenantId_normalizedKey: {
        tenantId: string;
        normalizedKey: string;
      };
    };
  },
];

type ProductUpdateManyCall = [
  {
    where: {
      tenantId: string;
      id: { in: string[] };
    };
    data: {
      canonicalProductId: string;
    };
  },
];

type SuggestionUpdateCall = [
  {
    data: {
      canonicalProductId: string;
      status: ProductParsingSuggestionStatus;
    };
  },
];

const user: AuthenticatedUser = {
  id: 'user-1',
  email: 'owner@example.com',
  fullName: null,
  role: UserRole.OWNER,
  tenantId: 'tenant-1',
  tenantSlug: 'demo',
};

function createPrismaMock(): PrismaMock {
  return {
    product: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    store: {
      findMany: jest.fn(),
    },
    productParsingRun: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    productParsingSuggestion: {
      updateMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    canonicalProduct: {
      count: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

describe('ProductParsingService', () => {
  let prisma: PrismaMock;
  let tenantContext: TenantContextMock;
  let service: ProductParsingService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tenantContext = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        tenantSlug: 'demo',
      }),
    };
    service = new ProductParsingService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
    );
  });

  it('keeps new matching products available for review after a fresh analysis', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'product-existing',
        name: 'ADRENALINE Rush 500ml can',
        article: 'LG-443-10',
        externalDomain: '443.langame.ru',
        canonicalProductId: 'canonical-1',
        canonicalProduct: { name: 'ADRENALINE Rush 500ml can' },
      },
      {
        id: 'product-new',
        name: 'ADRENALINE Rush 500ml can',
        article: 'LG-46-99',
        externalDomain: '46.langamepro.ru',
        canonicalProductId: null,
        canonicalProduct: null,
      },
    ]);
    prisma.store.findMany.mockResolvedValue([]);
    prisma.productParsingSuggestion.updateMany.mockResolvedValue({ count: 0 });
    prisma.productParsingRun.create.mockResolvedValue({ id: 'run-1' });
    prisma.productParsingSuggestion.create.mockResolvedValue({});
    prisma.productParsingRun.update.mockResolvedValue({ id: 'run-1' });

    await service.analyze(user);

    expect(prisma.productParsingSuggestion.create).toHaveBeenCalledTimes(1);
    const [suggestionCreate] = prisma.productParsingSuggestion.create.mock
      .calls[0] as SuggestionCreateCall;

    expect(suggestionCreate.data.productIds).toEqual([
      'product-existing',
      'product-new',
    ]);
    expect(suggestionCreate.data.rationale.warnings).toContain(
      'Часть товаров уже привязана к сетевому SKU',
    );
    expect(suggestionCreate.data.rationale.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'product-existing',
          canonicalProductId: 'canonical-1',
          canonicalProductName: 'ADRENALINE Rush 500ml can',
        }),
        expect.objectContaining({
          id: 'product-new',
          canonicalProductId: null,
          canonicalProductName: null,
        }),
      ]),
    );
  });

  it('skips groups that are already linked to the same canonical product', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'product-1',
        name: 'ADRENALINE Rush 500ml can',
        article: 'LG-443-10',
        externalDomain: '443.langame.ru',
        canonicalProductId: 'canonical-1',
        canonicalProduct: { name: 'ADRENALINE Rush 500ml can' },
      },
      {
        id: 'product-2',
        name: 'ADRENALINE Rush 500ml can',
        article: 'LG-46-99',
        externalDomain: '46.langamepro.ru',
        canonicalProductId: 'canonical-1',
        canonicalProduct: { name: 'ADRENALINE Rush 500ml can' },
      },
    ]);
    prisma.store.findMany.mockResolvedValue([]);
    prisma.productParsingSuggestion.updateMany.mockResolvedValue({ count: 0 });
    prisma.productParsingRun.create.mockResolvedValue({ id: 'run-1' });
    prisma.productParsingRun.update.mockResolvedValue({ id: 'run-1' });

    await service.analyze(user);

    expect(prisma.productParsingSuggestion.create).not.toHaveBeenCalled();
    expect(prisma.productParsingRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          suggestionsCount: 0,
        }),
      }),
    );
  });

  it('applies a reviewed suggestion to the existing canonical product', async () => {
    prisma.productParsingSuggestion.findFirst.mockResolvedValue({
      id: 'suggestion-1',
      tenantId: 'tenant-1',
      runId: 'run-1',
      suggestedName: 'ADRENALINE Rush 500ml can',
      normalizedKey: 'adrenaline|rush|500|ml|can',
      productIds: ['product-existing', 'product-new'],
    });
    prisma.canonicalProduct.upsert.mockResolvedValue({ id: 'canonical-1' });
    prisma.product.updateMany.mockResolvedValue({ count: 2 });
    prisma.productParsingRun.update.mockResolvedValue({ id: 'run-1' });
    prisma.productParsingSuggestion.update.mockResolvedValue({
      id: 'suggestion-1',
    });

    await service.applySuggestion(user, 'suggestion-1', {});

    const [canonicalUpsert] = prisma.canonicalProduct.upsert.mock
      .calls[0] as CanonicalProductUpsertCall;
    expect(canonicalUpsert.where.tenantId_normalizedKey).toEqual({
      tenantId: 'tenant-1',
      normalizedKey: 'adrenaline|rush|500|ml|can',
    });

    const [productUpdateMany] = prisma.product.updateMany.mock
      .calls[0] as ProductUpdateManyCall;
    expect(productUpdateMany.where).toEqual({
      tenantId: 'tenant-1',
      id: { in: ['product-existing', 'product-new'] },
    });
    expect(productUpdateMany.data.canonicalProductId).toBe('canonical-1');

    const [suggestionUpdate] = prisma.productParsingSuggestion.update.mock
      .calls[0] as SuggestionUpdateCall;
    expect(suggestionUpdate.data.canonicalProductId).toBe('canonical-1');
    expect(suggestionUpdate.data.status).toBe(
      ProductParsingSuggestionStatus.APPLIED,
    );
  });
});
