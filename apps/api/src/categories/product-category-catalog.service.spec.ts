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
});
