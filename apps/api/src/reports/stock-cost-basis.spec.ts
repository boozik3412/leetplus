import { buildProductCostBasis } from './stock-cost-basis';

const decimal = (value: number) => ({
  toNumber: () => value,
});

describe('buildProductCostBasis', () => {
  it('keeps newer stock layers in inventory after quantity decreases', () => {
    const basis = buildProductCostBasis(
      [{ id: 'product-1', purchasePrice: decimal(200) }],
      [
        {
          storeId: 'store-1',
          productId: 'product-1',
          snapshotDate: new Date('2026-01-01T00:00:00.000Z'),
          quantity: decimal(2),
          product: { purchasePrice: decimal(200) },
        },
        {
          storeId: 'store-1',
          productId: 'product-1',
          snapshotDate: new Date('2026-01-02T00:00:00.000Z'),
          quantity: decimal(5),
          product: { purchasePrice: decimal(150) },
        },
        {
          storeId: 'store-1',
          productId: 'product-1',
          snapshotDate: new Date('2026-01-03T00:00:00.000Z'),
          quantity: decimal(4),
          product: { purchasePrice: decimal(150) },
        },
      ],
    );

    expect(basis.get('product-1')).toMatchObject({
      stockQuantity: 4,
      stockCost: 650,
      unitCost: 162.5,
    });
  });
});
