import { buildAssortmentHealth } from './assortment-health';

const valuationSummaryInput = (
  overrides: Partial<Parameters<typeof buildAssortmentHealth>[0]> = {},
): Parameters<typeof buildAssortmentHealth>[0] => ({
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
  products: [],
  inventorySnapshots: [],
  sales: [],
  salesCoverage: [
    {
      storeId: 'store-1',
      from: new Date('2026-08-25T00:00:00.000Z'),
      to: new Date('2026-09-14T00:00:00.000Z'),
      status: 'CONFIRMED',
    },
  ],
  writeOffCoverage: { status: 'CONFIRMED' },
  ...overrides,
});

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
          purchasePrice: 100,
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
      frozenValue: {
        value: 500,
        state: 'PARTIAL',
        basis: 'SALE_PRICE_ESTIMATE',
      },
      excessValue: {
        value: 500,
        state: 'PARTIAL',
        basis: 'SALE_PRICE_ESTIMATE',
      },
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
          purchasePrice: 100,
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

  it('uses only proven store-product membership across unrelated domains', () => {
    const health = buildAssortmentHealth({
      asOf: new Date('2026-09-14T00:00:00.000Z'),
      period: {
        from: new Date('2026-08-25T00:00:00.000Z'),
        to: new Date('2026-09-14T00:00:00.000Z'),
      },
      stores: [
        {
          id: 'alpha',
          tenantId: 'tenant-1',
          externalDomain: 'alpha.example',
          externalClubId: '1',
          isActive: true,
        },
        {
          id: 'beta',
          tenantId: 'tenant-1',
          externalDomain: 'beta.example',
          externalClubId: '2',
          isActive: true,
        },
      ],
      products: [
        { id: 'shared', isActive: true },
        { id: 'other', isActive: true },
      ],
      storeProductIds: [
        { storeId: 'alpha', productId: 'shared' },
        { storeId: 'beta', productId: 'shared' },
        { storeId: 'alpha', productId: 'foreign-product' },
        { storeId: 'foreign-store', productId: 'shared' },
      ],
      inventorySnapshots: [
        {
          storeId: 'alpha',
          productId: 'shared',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 1,
        },
        {
          storeId: 'beta',
          productId: 'shared',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 1,
        },
      ],
      sales: [],
      salesCoverage: [
        {
          storeId: 'alpha',
          from: new Date('2026-08-01T00:00:00.000Z'),
          to: new Date('2026-09-14T00:00:00.000Z'),
          status: 'CONFIRMED',
        },
        {
          storeId: 'beta',
          from: new Date('2026-08-01T00:00:00.000Z'),
          to: new Date('2026-09-14T00:00:00.000Z'),
          status: 'CONFIRMED',
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' },
    });

    expect(health.rows.map((row) => `${row.storeId}:${row.productId}`)).toEqual(
      ['alpha:shared', 'beta:shared'],
    );
  });

  it('selects the newest valid configuration regardless of input order', () => {
    const configurations = [
      {
        tenantId: 'tenant-1',
        productId: 'product-1',
        externalDomain: 'club.example',
        externalClubId: '1',
        price: 100,
        purchasePrice: 40,
        updatedAt: new Date('2026-09-12T00:00:00.000Z'),
      },
      {
        tenantId: 'tenant-1',
        productId: 'product-1',
        externalDomain: 'club.example',
        externalClubId: '1',
        price: 120,
        purchasePrice: 50,
        updatedAt: new Date('2026-09-13T00:00:00.000Z'),
      },
    ];
    const input = {
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
          quantity: 2,
        },
      ],
      sales: [],
      salesCoverage: [
        {
          storeId: 'store-1',
          from: new Date('2026-08-01T00:00:00.000Z'),
          to: new Date('2026-09-14T00:00:00.000Z'),
          status: 'CONFIRMED' as const,
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' as const },
    };

    expect(
      buildAssortmentHealth({ ...input, priceConfigurations: configurations })
        .rows[0],
    ).toMatchObject({
      price: { value: 120 },
      frozenValue: { value: 100, basis: 'CLUB_PURCHASE_PRICE' },
    });
    expect(
      buildAssortmentHealth({
        ...input,
        priceConfigurations: [...configurations].reverse(),
      }).rows[0],
    ).toMatchObject({
      price: { value: 120 },
      frozenValue: { value: 100, basis: 'CLUB_PURCHASE_PRICE' },
    });
  });

  it('keeps the purchase-cost valuation distinct from the OOS sale price', () => {
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
      products: [{ id: 'product-1', isActive: true, purchasePrice: 30 }],
      inventorySnapshots: [
        {
          storeId: 'store-1',
          productId: 'product-1',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 2,
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
          updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' },
    });

    expect(health.rows[0]).toMatchObject({
      price: { value: 100, source: 'CLUB_CONFIGURATION' },
      frozenValue: {
        value: 60,
        basis: 'PRODUCT_PURCHASE_PRICE',
        state: 'PARTIAL',
      },
    });
  });

  it('publishes the purchase-cost basis on cost-only valuation summaries', () => {
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
        { id: 'frozen', isActive: true },
        { id: 'excess', isActive: true },
      ],
      inventorySnapshots: [
        {
          storeId: 'store-1',
          productId: 'frozen',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 4,
        },
        {
          storeId: 'store-1',
          productId: 'excess',
          snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
          quantity: 40,
        },
      ],
      sales: [
        {
          storeId: 'store-1',
          productId: 'excess',
          saleDate: new Date('2026-09-01T00:00:00.000Z'),
          quantity: 1,
          revenue: 20,
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
          tenantId: 'tenant-1',
          productId: 'frozen',
          externalDomain: 'club.example',
          externalClubId: '1',
          price: 20,
          purchasePrice: 10,
          updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        },
        {
          tenantId: 'tenant-1',
          productId: 'excess',
          externalDomain: 'club.example',
          externalClubId: '1',
          price: 20,
          purchasePrice: 10,
          updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        },
      ],
      writeOffCoverage: { status: 'CONFIRMED' },
    });

    expect(health.summary.frozenValue).toMatchObject({
      value: 40,
      basis: 'CLUB_PURCHASE_PRICE',
    });
    expect(health.summary.excessValue).toMatchObject({
      basis: 'CLUB_PURCHASE_PRICE',
    });
  });

  it('labels sale-only valuation summaries as sale-price estimates', () => {
    const health = buildAssortmentHealth(
      valuationSummaryInput({
        products: [{ id: 'estimate', isActive: true }],
        inventorySnapshots: [
          {
            storeId: 'store-1',
            productId: 'estimate',
            snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
            quantity: 4,
          },
        ],
        priceConfigurations: [
          {
            tenantId: 'tenant-1',
            productId: 'estimate',
            externalDomain: 'club.example',
            externalClubId: '1',
            price: 20,
            updatedAt: new Date('2026-09-14T00:00:00.000Z'),
          },
        ],
      }),
    );

    expect(health.summary.frozenValue).toMatchObject({
      value: 80,
      state: 'PARTIAL',
      basis: 'SALE_PRICE_ESTIMATE',
      coverage: { covered: 0, total: 1 },
      asOf: '2026-09-14',
    });
    expect(health.summary.excessValue).toMatchObject({
      value: 80,
      state: 'PARTIAL',
      basis: 'SALE_PRICE_ESTIMATE',
    });
  });

  it('marks mixed cost and sale-estimate valuation summaries as mixed', () => {
    const health = buildAssortmentHealth(
      valuationSummaryInput({
        products: [
          { id: 'cost', isActive: true },
          { id: 'estimate', isActive: true },
        ],
        inventorySnapshots: [
          {
            storeId: 'store-1',
            productId: 'cost',
            snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
            quantity: 4,
          },
          {
            storeId: 'store-1',
            productId: 'estimate',
            snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
            quantity: 4,
          },
        ],
        priceConfigurations: [
          {
            tenantId: 'tenant-1',
            productId: 'cost',
            externalDomain: 'club.example',
            externalClubId: '1',
            price: 20,
            purchasePrice: 10,
            updatedAt: new Date('2026-09-14T00:00:00.000Z'),
          },
          {
            tenantId: 'tenant-1',
            productId: 'estimate',
            externalDomain: 'club.example',
            externalClubId: '1',
            price: 20,
            updatedAt: new Date('2026-09-14T00:00:00.000Z'),
          },
        ],
      }),
    );

    expect(health.summary.frozenValue).toMatchObject({
      value: 120,
      state: 'PARTIAL',
      basis: 'MIXED',
      coverage: { covered: 1, total: 2 },
    });
    expect(health.summary.excessValue).toMatchObject({
      value: 120,
      state: 'PARTIAL',
      basis: 'MIXED',
    });
  });

  it('keeps unknown and stale valuation summaries null with their coverage and date', () => {
    const health = buildAssortmentHealth(
      valuationSummaryInput({
        products: [{ id: 'unknown', isActive: true }],
        inventorySnapshots: [
          {
            storeId: 'store-1',
            productId: 'unknown',
            snapshotDate: new Date('2026-09-12T00:00:00.000Z'),
            quantity: 4,
          },
        ],
      }),
    );

    expect(health.summary.frozenValue).toMatchObject({
      value: null,
      state: 'UNKNOWN',
      basis: 'UNKNOWN',
      coverage: { covered: 0, total: 1 },
      asOf: null,
    });
    expect(health.summary.excessValue).toMatchObject({
      value: null,
      state: 'STALE',
      basis: 'UNKNOWN',
      coverage: { covered: 0, total: 1 },
      asOf: '2026-09-12',
    });
  });

  it('keeps a recent inventory observation fresh when its idempotent day marker is old', () => {
    const health = buildAssortmentHealth(
      valuationSummaryInput({
        asOf: new Date('2026-09-15T13:00:00.000Z'),
        period: {
          from: new Date('2026-08-26T00:00:00.000Z'),
          to: new Date('2026-09-15T13:00:00.000Z'),
        },
        products: [{ id: 'observed', isActive: true }],
        inventorySnapshots: [
          {
            storeId: 'store-1',
            productId: 'observed',
            snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
            observedAt: new Date('2026-09-14T23:30:00.000Z'),
            quantity: 4,
          },
        ],
      }),
    );

    expect(health.rows[0].inventory).toMatchObject({
      value: 4,
      state: 'AVAILABLE',
      asOf: '2026-09-14',
    });
  });

  it('does not use an inventory observation that occurs after the snapshot cutoff', () => {
    const health = buildAssortmentHealth(
      valuationSummaryInput({
        asOf: new Date('2026-09-14T12:00:00.000Z'),
        period: {
          from: new Date('2026-08-25T00:00:00.000Z'),
          to: new Date('2026-09-14T12:00:00.000Z'),
        },
        products: [{ id: 'future-observation', isActive: true }],
        inventorySnapshots: [
          {
            storeId: 'store-1',
            productId: 'future-observation',
            snapshotDate: new Date('2026-09-14T00:00:00.000Z'),
            observedAt: new Date('2026-09-14T13:00:00.000Z'),
            quantity: 4,
          },
        ],
      }),
    );

    expect(health.rows[0].inventory).toMatchObject({
      value: null,
      state: 'MISSING',
      coverage: { covered: 0, total: 1 },
      asOf: null,
    });
  });
});
