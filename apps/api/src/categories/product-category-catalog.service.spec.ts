import { UserRole } from '@prisma/client';
import { ProductCategoryCatalogService } from './product-category-catalog.service';

describe('ProductCategoryCatalogService', () => {
  it('previews a Langame conflict by exact domain and group without changing products', async () => {
    const prisma = {
      langameProductGroup: {
        findMany: jest.fn().mockResolvedValue([
          {
            externalDomain: '46.langamepro.ru',
            externalGroupId: '3',
          },
        ]),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'category-drinks', name: 'Напитки' },
        ]),
      },
      langameClubProductConfiguration: {
        findMany: jest.fn().mockResolvedValue([
          {
            externalDomain: '46.langamepro.ru',
            externalGroupId: '3',
            store: { id: 'store-1', name: 'Пушкинская' },
            product: {
              id: 'product-1',
              name: 'Coca-Cola 0.5',
              categoryId: 'category-snacks',
              category: { id: 'category-snacks', name: 'Снеки' },
            },
          },
        ]),
      },
    };
    const tenantContextService = {
      resolve: jest.fn().mockResolvedValue({ tenantId: 'tenant-1' }),
    };
    const service = new ProductCategoryCatalogService(
      prisma as never,
      tenantContextService as never,
      { syncTenant: jest.fn() } as never,
    );

    const preview = await service.previewLangameMappings(
      {
        mappings: [
          {
            externalDomain: '46.langamepro.ru',
            externalGroupId: '3',
            categoryId: 'category-drinks',
          },
        ],
      },
      {
        id: 'user-1',
        email: 'owner@example.com',
        fullName: null,
        role: UserRole.OWNER,
        isPlatformAdmin: false,
        tenantId: 'tenant-1',
        tenantSlug: 'tenant',
      },
    );

    expect(preview.summary).toEqual({
      matched: 0,
      uncategorized: 0,
      conflicts: 1,
      ambiguous: 0,
    });
    expect(preview.items).toEqual([
      expect.objectContaining({
        productId: 'product-1',
        status: 'CONFLICT',
        currentCategory: { id: 'category-snacks', name: 'Снеки' },
        candidateCategories: [
          { id: 'category-drinks', name: 'Напитки', isNew: false },
        ],
      }),
    ]);
    expect(prisma.langameClubProductConfiguration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          isActive: true,
        }),
      }),
    );
    expect(prisma).not.toHaveProperty('product');
  });

  it('bulk-assigns only uncategorized products with one Langame target', async () => {
    const service = new ProductCategoryCatalogService(
      {} as never,
      {} as never,
      { syncTenant: jest.fn() } as never,
    );
    const tx = {
      langameClubProductConfiguration: {
        findMany: jest.fn().mockResolvedValue([
          {
            externalDomain: '46.langamepro.ru',
            externalGroupId: '3',
            productId: 'product-safe',
            product: { categoryId: null, isActive: true },
          },
          {
            externalDomain: '46.langamepro.ru',
            externalGroupId: '3',
            productId: 'product-already-categorized',
            product: { categoryId: 'category-existing', isActive: true },
          },
          {
            externalDomain: '46.langamepro.ru',
            externalGroupId: '3',
            productId: 'product-ambiguous',
            product: { categoryId: null, isActive: true },
          },
          {
            externalDomain: '46.langamepro.ru',
            externalGroupId: '5',
            productId: 'product-ambiguous',
            product: { categoryId: null, isActive: true },
          },
        ]),
      },
      product: { update: jest.fn() },
      categorySourceMappingEvent: { create: jest.fn() },
    };

    const updated = await (service as unknown as {
      assignUncategorizedProducts: (
        transaction: unknown,
        tenantId: string,
        mappings: unknown[],
        categoryIdsByCreateName: Map<string, string>,
        mappingIdsByKey: Map<string, string>,
        userId: string,
      ) => Promise<number>;
    }).assignUncategorizedProducts(
      tx,
      'tenant-1',
      [
        {
          externalDomain: '46.langamepro.ru',
          externalGroupId: '3',
          action: 'MAP',
          categoryId: 'category-drinks',
          categoryName: 'Напитки',
          createCategoryName: null,
          status: 'CONFIRMED',
          confidence: 100,
        },
        {
          externalDomain: '46.langamepro.ru',
          externalGroupId: '5',
          action: 'MAP',
          categoryId: 'category-snacks',
          categoryName: 'Снэки',
          createCategoryName: null,
          status: 'CONFIRMED',
          confidence: 100,
        },
      ],
      new Map(),
      new Map([
        ['46.langamepro.ru:3', 'mapping-drinks'],
        ['46.langamepro.ru:5', 'mapping-snacks'],
      ]),
      'user-1',
    );

    expect(updated).toBe(1);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'product-safe' },
      data: { categoryId: 'category-drinks' },
    });
    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(tx.categorySourceMappingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'product-safe',
          mappingId: 'mapping-drinks',
          previousValue: { categoryId: null },
          nextValue: { categoryId: 'category-drinks', assignedBy: 'bulk-import' },
        }),
      }),
    );
  });
});
