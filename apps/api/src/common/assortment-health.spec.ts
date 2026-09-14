import { buildAssortmentHealth } from './assortment-health';

describe('buildAssortmentHealth', () => {
  it('keeps stock and actionability at the store-product grain', () => {
    const health = buildAssortmentHealth({
      asOf: new Date('2026-09-14T00:00:00.000Z'),
      period: {
        from: new Date('2026-08-25T00:00:00.000Z'),
        to: new Date('2026-09-14T00:00:00.000Z'),
      },
      stores: [
        {
          id: 'north',
          tenantId: 'tenant-1',
          externalDomain: 'clubs.example',
          externalClubId: 'north-club',
          isActive: true,
        },
        {
          id: 'south',
          tenantId: 'tenant-1',
          externalDomain: 'clubs.example',
          externalClubId: 'south-club',
          isActive: true,
        },
      ],
      products: [{ id: 'cola', isActive: true, orderMultiplicity: 4 }],
      inventorySnapshots: [
        {
          storeId: 'north',
          productId: 'cola',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 0,
        },
        {
          storeId: 'south',
          productId: 'cola',
          snapshotDate: new Date('2026-09-12T00:00:00.000Z'),
          quantity: 20,
        },
      ],
      sales: [
        {
          storeId: 'north',
          productId: 'cola',
          saleDate: new Date('2026-09-10T00:00:00.000Z'),
          quantity: 21,
          revenue: 210,
        },
        {
          storeId: 'south',
          productId: 'cola',
          saleDate: new Date('2026-09-10T00:00:00.000Z'),
          quantity: 21,
          revenue: 210,
        },
      ],
      salesCoverage: [
        {
          storeId: 'north',
          from: new Date('2026-08-25T00:00:00.000Z'),
          to: new Date('2026-09-14T00:00:00.000Z'),
          status: 'CONFIRMED',
        },
        {
          storeId: 'south',
          from: new Date('2026-08-25T00:00:00.000Z'),
          to: new Date('2026-09-14T00:00:00.000Z'),
          status: 'CONFIRMED',
        },
      ],
      priceConfigurations: [
        {
          tenantId: 'tenant-1',
          productId: 'cola',
          externalDomain: 'clubs.example',
          externalClubId: 'north-club',
          price: 0,
          updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' },
    });

    expect(health.rows.find((row) => row.storeId === 'north')).toMatchObject({
      productId: 'cola',
      inventory: { value: 0, state: 'AVAILABLE' },
      price: { value: 0, source: 'CLUB_CONFIGURATION' },
      risk: 'OUT_OF_STOCK',
      actionable: true,
      recommendedOrderQuantity: 8,
    });
    expect(health.rows.find((row) => row.storeId === 'south')).toMatchObject({
      productId: 'cola',
      inventory: { value: 20, state: 'STALE', asOf: '2026-09-12' },
      risk: 'STALE_INVENTORY',
      actionable: false,
    });
    expect(health.summary.outOfStock).toMatchObject({
      value: 1,
      state: 'PARTIAL',
    });
  });

  it('keeps the quantity action when a cross-tenant price configuration cannot value it', () => {
    const health = buildAssortmentHealth({
      asOf: new Date('2026-09-14T00:00:00.000Z'),
      period: {
        from: new Date('2026-08-25T00:00:00.000Z'),
        to: new Date('2026-09-14T00:00:00.000Z'),
      },
      stores: [
        {
          id: 'store-1',
          tenantId: 'tenant-1',
          externalDomain: 'club.example',
          externalClubId: '1',
          isActive: true,
        },
      ],
      products: [{ id: 'product-1', isActive: true }],
      inventorySnapshots: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 0,
        },
      ],
      sales: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          saleDate: new Date('2026-09-10T00:00:00.000Z'),
          quantity: 21,
          revenue: 0,
        },
      ],
      salesCoverage: [
        {
          storeId: 'store-1',
          from: new Date('2026-08-25T00:00:00.000Z'),
          to: new Date('2026-09-14T00:00:00.000Z'),
          status: 'CONFIRMED',
        },
      ],
      priceConfigurations: [
        {
          tenantId: 'other-tenant',
          productId: 'product-1',
          externalDomain: 'club.example',
          externalClubId: '1',
          price: 500,
          updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' },
    });

    expect(health.rows[0]).toMatchObject({
      risk: 'OUT_OF_STOCK',
      actionable: true,
      price: { value: 0, source: 'PERIOD_SALES' },
    });
  });

  it('reports no-sales, value coverage, turnover, excess and write-offs without counting service exclusions', () => {
    const health = buildAssortmentHealth({
      asOf: new Date('2026-09-14T00:00:00.000Z'),
      period: {
        from: new Date('2026-08-25T00:00:00.000Z'),
        to: new Date('2026-09-14T00:00:00.000Z'),
      },
      stores: [
        {
          id: 'store-1',
          tenantId: 'tenant-1',
          externalDomain: 'club.example',
          externalClubId: '1',
          isActive: true,
        },
      ],
      products: [
        { id: 'priced', isActive: true },
        { id: 'unknown-price', isActive: true },
        { id: 'service', isActive: true },
        { id: 'missing', isActive: true },
      ],
      inventorySnapshots: [
        {
          storeId: 'store-1',
          productId: 'priced',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 5,
        },
        {
          storeId: 'store-1',
          productId: 'unknown-price',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 2,
        },
        {
          storeId: 'store-1',
          productId: 'service',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 9,
        },
      ],
      sales: [],
      salesCoverage: [
        {
          storeId: 'store-1',
          from: new Date('2026-08-01T00:00:00.000Z'),
          to: new Date('2026-09-14T00:00:00.000Z'),
          status: 'CONFIRMED',
        },
      ],
      priceConfigurations: [
        {
          tenantId: 'tenant-1',
          productId: 'priced',
          externalDomain: 'club.example',
          externalClubId: '1',
          price: 100,
          updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        },
      ],
      excludedProductIds: ['service'],
      writeOffs: [
        {
          storeId: 'store-1',
          productId: 'priced',
          movementDate: new Date('2026-09-01T00:00:00.000Z'),
          quantity: 2,
          amount: 50,
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' },
    });

    const priced = health.rows.find((row) => row.productId === 'priced');
    expect(priced).toMatchObject({
      noSales: { 7: true, 14: true, 21: true, 30: true },
      frozenValue: { value: 500, state: 'AVAILABLE' },
      turnoverDays: { value: null, state: 'AVAILABLE' },
      excessQuantity: { value: 5 },
      excessValue: { value: 500 },
      writeOffQuantity: { value: 2 },
      writeOffAmount: { value: 50 },
    });
    expect(
      health.rows.find((row) => row.productId === 'missing'),
    ).toMatchObject({ risk: 'MISSING_INVENTORY' });
    expect(health.summary.noSales[21]).toMatchObject({
      value: 2,
      state: 'PARTIAL',
      coverage: { covered: 2, total: 3 },
    });
    expect(health.summary.frozenValue).toMatchObject({
      value: 500,
      state: 'PARTIAL',
      coverage: { covered: 1, total: 3 },
    });
    expect(health.summary.writeOffAmount).toMatchObject({
      value: 50,
      state: 'AVAILABLE',
    });
  });

  it('uses the separate demand cutoff instead of treating current-day sales as closed-period demand', () => {
    const health = buildAssortmentHealth({
      asOf: new Date('2026-09-14T12:00:00.000Z'),
      demandTo: new Date('2026-09-13T23:59:59.999Z'),
      period: {
        from: new Date('2026-08-25T00:00:00.000Z'),
        to: new Date('2026-09-13T23:59:59.999Z'),
      },
      stores: [
        {
          id: 'store-1',
          tenantId: 'tenant-1',
          externalDomain: 'club.example',
          externalClubId: '1',
          isActive: true,
        },
      ],
      products: [{ id: 'product-1', isActive: true }],
      inventorySnapshots: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          snapshotDate: new Date('2026-09-14T12:00:00.000Z'),
          quantity: 0,
        },
      ],
      sales: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          saleDate: new Date('2026-09-14T11:00:00.000Z'),
          quantity: 21,
          revenue: 210,
        },
      ],
      salesCoverage: [
        {
          storeId: 'store-1',
          from: new Date('2026-08-24T00:00:00.000Z'),
          to: new Date('2026-09-13T23:59:59.999Z'),
          status: 'CONFIRMED',
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' },
    });

    expect(health.rows[0]).toMatchObject({
      demand21d: { value: 0, state: 'AVAILABLE' },
      risk: 'NO_DEMAND',
      actionable: false,
    });
  });

  it('does not use a price configuration observed after a historical inventory cutoff', () => {
    const health = buildAssortmentHealth({
      asOf: new Date('2026-09-13T23:59:59.999Z'),
      period: {
        from: new Date('2026-08-25T00:00:00.000Z'),
        to: new Date('2026-09-13T23:59:59.999Z'),
      },
      stores: [
        {
          id: 'store-1',
          tenantId: 'tenant-1',
          externalDomain: 'club.example',
          externalClubId: '1',
          isActive: true,
        },
      ],
      products: [{ id: 'product-1', isActive: true }],
      inventorySnapshots: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          snapshotDate: new Date('2026-09-13T23:59:59.999Z'),
          quantity: 3,
        },
      ],
      sales: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          saleDate: new Date('2026-09-12T12:00:00.000Z'),
          quantity: 1,
          revenue: 100,
        },
      ],
      salesCoverage: [
        {
          storeId: 'store-1',
          from: new Date('2026-08-24T00:00:00.000Z'),
          to: new Date('2026-09-13T23:59:59.999Z'),
          status: 'CONFIRMED',
        },
      ],
      priceConfigurations: [
        {
          tenantId: 'tenant-1',
          productId: 'product-1',
          externalDomain: 'club.example',
          externalClubId: '1',
          price: 500,
          updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' },
    });

    expect(health.rows[0].price).toMatchObject({
      value: 100,
      source: 'PERIOD_SALES',
    });
  });

  it('does not publish an exact stock value from a stale configuration without a fresh transaction price', () => {
    const health = buildAssortmentHealth({
      asOf: new Date('2026-09-14T00:00:00.000Z'),
      period: {
        from: new Date('2026-08-25T00:00:00.000Z'),
        to: new Date('2026-09-14T00:00:00.000Z'),
      },
      stores: [
        {
          id: 'store-1',
          tenantId: 'tenant-1',
          externalDomain: 'club.example',
          externalClubId: '1',
          isActive: true,
        },
      ],
      products: [{ id: 'product-1', isActive: true }],
      inventorySnapshots: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 5,
        },
      ],
      sales: [],
      salesCoverage: [
        {
          storeId: 'store-1',
          from: new Date('2026-08-01T00:00:00.000Z'),
          to: new Date('2026-09-14T00:00:00.000Z'),
          status: 'CONFIRMED',
        },
      ],
      priceConfigurations: [
        {
          tenantId: 'tenant-1',
          productId: 'product-1',
          externalDomain: 'club.example',
          externalClubId: '1',
          price: 100,
          updatedAt: new Date('2026-09-03T00:00:00.000Z'),
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' },
    });

    expect(health.rows[0]).toMatchObject({
      price: { value: 100, state: 'STALE', source: 'CLUB_CONFIGURATION' },
      frozenValue: { value: null, state: 'STALE' },
      excessValue: { value: null, state: 'STALE' },
    });
  });

  it('does not price stock from unverified sales or a configuration observed after asOf', () => {
    const health = buildAssortmentHealth({
      asOf: new Date('2026-09-13T23:59:59.999Z'),
      period: {
        from: new Date('2026-08-25T00:00:00.000Z'),
        to: new Date('2026-09-14T23:59:59.999Z'),
      },
      stores: [
        {
          id: 'store-1',
          tenantId: 'tenant-1',
          externalDomain: 'club.example',
          externalClubId: '1',
          isActive: true,
        },
      ],
      products: [{ id: 'product-1', isActive: true }],
      inventorySnapshots: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          snapshotDate: new Date('2026-09-13T23:59:59.999Z'),
          quantity: 2,
        },
      ],
      sales: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          saleDate: new Date('2026-09-12T12:00:00.000Z'),
          quantity: 1,
          revenue: 100,
        },
      ],
      salesCoverage: [],
      priceConfigurations: [
        {
          tenantId: 'tenant-1',
          productId: 'product-1',
          externalDomain: 'club.example',
          externalClubId: '1',
          price: 500,
          updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' },
    });

    expect(health.rows[0].price).toMatchObject({
      value: null,
      state: 'UNKNOWN',
      source: 'UNKNOWN',
      coverage: { covered: 0, total: 1 },
    });
  });

  it('keeps stale inventory and unknown no-sales rows out of an exact summary', () => {
    const health = buildAssortmentHealth({
      asOf: new Date('2026-09-14T00:00:00.000Z'),
      period: {
        from: new Date('2026-08-25T00:00:00.000Z'),
        to: new Date('2026-09-14T00:00:00.000Z'),
      },
      stores: [
        {
          id: 'store-1',
          tenantId: 'tenant-1',
          externalDomain: 'club.example',
          externalClubId: '1',
          isActive: true,
        },
      ],
      products: [
        { id: 'priced', isActive: true },
        { id: 'unknown-no-sales', isActive: true },
        { id: 'stale-stock', isActive: true },
      ],
      inventorySnapshots: [
        {
          storeId: 'store-1',
          productId: 'priced',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 2,
        },
        {
          storeId: 'store-1',
          productId: 'unknown-no-sales',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 3,
        },
        {
          storeId: 'store-1',
          productId: 'stale-stock',
          snapshotDate: new Date('2026-09-12T00:00:00.000Z'),
          quantity: 4,
        },
      ],
      sales: [],
      salesCoverage: [
        {
          storeId: 'store-1',
          from: new Date('2026-08-25T00:00:00.000Z'),
          to: new Date('2026-09-14T00:00:00.000Z'),
          status: 'CONFIRMED',
        },
      ],
      priceConfigurations: [
        {
          tenantId: 'tenant-1',
          productId: 'priced',
          externalDomain: 'club.example',
          externalClubId: '1',
          price: 100,
          updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' },
    });

    expect(health.summary.inventory).toMatchObject({
      value: 9,
      state: 'STALE',
      coverage: { covered: 2, total: 3 },
    });
    expect(health.summary.frozenValue).toMatchObject({
      value: 200,
      state: 'PARTIAL',
      coverage: { covered: 1, total: 3 },
    });
  });

  it('bounds sales and write-offs at historical asOf and accepts a caller-set excess threshold', () => {
    const health = buildAssortmentHealth({
      asOf: new Date('2026-09-13T23:59:59.999Z'),
      period: {
        from: new Date('2026-08-25T00:00:00.000Z'),
        to: new Date('2026-09-14T23:59:59.999Z'),
      },
      excessStockDays: 10,
      stores: [
        {
          id: 'store-1',
          tenantId: 'tenant-1',
          externalDomain: 'club.example',
          externalClubId: '1',
          isActive: true,
        },
      ],
      products: [{ id: 'product-1', isActive: true }],
      inventorySnapshots: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          snapshotDate: new Date('2026-09-13T23:59:59.999Z'),
          quantity: 31,
        },
      ],
      sales: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          saleDate: new Date('2026-09-12T12:00:00.000Z'),
          quantity: 21,
          revenue: 2100,
        },
        {
          storeId: 'store-1',
          productId: 'product-1',
          saleDate: new Date('2026-09-14T12:00:00.000Z'),
          quantity: 210,
          revenue: 21000,
        },
      ],
      salesCoverage: [
        {
          storeId: 'store-1',
          from: new Date('2026-08-24T00:00:00.000Z'),
          to: new Date('2026-09-13T23:59:59.999Z'),
          status: 'CONFIRMED',
        },
      ],
      writeOffs: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          movementDate: new Date('2026-09-14T12:00:00.000Z'),
          quantity: 9,
          amount: 900,
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' },
    });

    expect(health.rows[0]).toMatchObject({
      demand21d: { value: 1 },
      excessQuantity: { value: 21 },
      writeOffQuantity: { value: 0 },
      writeOffAmount: { value: 0 },
    });
  });
});
