import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  it('merges products and Langame mappings into the selected target category', async () => {
    const transaction = {
      categorySourceMapping: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mapping-1',
            categoryId: 'category-energy-18',
            source: 'LANGAME',
            externalDomain: '46.langamepro.ru',
            externalGroupId: '15',
          },
        ]),
        update: jest.fn(),
      },
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 174 }),
      },
      categorySourceMappingEvent: { create: jest.fn() },
      category: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      category: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'category-energy', name: 'Энергетики' },
          { id: 'category-energy-18', name: 'Энергетики 18+' },
          { id: 'category-energy-adult', name: 'Энергетик (18+)' },
        ]),
      },
      $transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const tenantContextService = {
      resolve: jest.fn().mockResolvedValue({ tenantId: 'tenant-1' }),
    };
    const service = new CategoriesService(
      prisma as never,
      tenantContextService as never,
    );

    const result = await service.merge(
      {
        categoryIds: [
          'category-energy',
          'category-energy-18',
          'category-energy-adult',
        ],
        targetCategoryId: 'category-energy',
      },
      { id: 'user-1' } as never,
    );

    expect(result).toEqual({
      targetCategory: { id: 'category-energy', name: 'Энергетики' },
      mergedCategories: 2,
      productsUpdated: 174,
      mappingsUpdated: 1,
    });
    expect(transaction.product.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        categoryId: { in: ['category-energy-18', 'category-energy-adult'] },
      },
      data: { categoryId: 'category-energy' },
    });
    expect(transaction.categorySourceMapping.update).toHaveBeenCalledWith({
      where: { id: 'mapping-1' },
      data: { categoryId: 'category-energy' },
    });
    expect(transaction.categorySourceMappingEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CATEGORY_MERGED',
        previousValue: { categoryId: 'category-energy-18' },
        nextValue: { categoryId: 'category-energy' },
      }),
    });
    expect(transaction.category.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        id: { in: ['category-energy-18', 'category-energy-adult'] },
      },
    });
  });
});
