import { Injectable } from '@nestjs/common';
import {
  DailyDataCoverageScope,
  DailyDataCoverageStatus,
  Prisma,
} from '@prisma/client';
import {
  buildAssortmentHealth,
  type AssortmentHealth,
} from './assortment-health';
import { PrismaService } from '../prisma/prisma.service';

export type AssortmentHealthLoaderQuery = {
  tenantId: string;
  storeIds: readonly string[] | null;
  categoryIds: readonly string[] | null;
  period: { from: Date; to: Date };
  asOf: Date;
  coveragePeriod?: { from: Date; to: Date };
};

export type AssortmentSalesDayEvidence = {
  storeId: string;
  date: Date;
  status: 'CONFIRMED' | 'MISSING' | 'FAILED';
};

export type AssortmentSourceHealthEvidence = {
  sales: AssortmentSourceModuleEvidence;
  inventory: AssortmentSourceModuleEvidence;
};

export type AssortmentSourceModuleEvidence = {
  totalDomains: number;
  confirmedDomains: number;
  failedDomains: number;
  missingDomains: number;
};

export type AssortmentHealthCatalogProduct = {
  id: string;
  article: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  supplierName: string | null;
};

export type AssortmentHealthCatalogStore = {
  id: string;
  name: string;
};

export type AssortmentHealthLoaderResult = {
  health: AssortmentHealth;
  productsById: ReadonlyMap<string, AssortmentHealthCatalogProduct>;
  storesById: ReadonlyMap<string, AssortmentHealthCatalogStore>;
  salesDayEvidence: AssortmentSalesDayEvidence[];
  sourceHealthEvidence: AssortmentSourceHealthEvidence;
};

@Injectable()
export class AssortmentHealthLoaderService {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    query: AssortmentHealthLoaderQuery,
  ): Promise<AssortmentHealthLoaderResult> {
    const storeFilter = query.storeIds
      ? { storeId: { in: [...query.storeIds] } }
      : {};
    const storeWhere = {
      tenantId: query.tenantId,
      isActive: true,
      ...(query.storeIds ? { id: { in: [...query.storeIds] } } : {}),
    };
    const productWhere: Prisma.ProductWhereInput = {
      tenantId: query.tenantId,
      isActive: true,
      ...(query.categoryIds
        ? { categoryId: { in: [...query.categoryIds] } }
        : {}),
    };
    const demandTo =
      query.period.to > query.asOf ? query.asOf : query.period.to;
    const demandFrom = new Date(demandTo);
    demandFrom.setUTCDate(demandFrom.getUTCDate() - 29);
    demandFrom.setUTCHours(0, 0, 0, 0);
    const salesFrom =
      query.period.from < demandFrom ? query.period.from : demandFrom;
    const coverageFrom =
      query.coveragePeriod && query.coveragePeriod.from < salesFrom
        ? query.coveragePeriod.from
        : salesFrom;
    const coverageTo =
      query.coveragePeriod && query.coveragePeriod.to > demandTo
        ? query.coveragePeriod.to > query.asOf
          ? query.asOf
          : query.coveragePeriod.to
        : demandTo;

    const [
      stores,
      products,
      snapshots,
      sales,
      exclusions,
      configurations,
      writeOffs,
      salesCoverage,
    ] = await Promise.all([
      this.prisma.store.findMany({
        where: storeWhere,
        select: {
          id: true,
          name: true,
          tenantId: true,
          externalDomain: true,
          externalClubId: true,
          isActive: true,
        },
      }),
      this.prisma.product.findMany({
        where: productWhere,
        select: {
          id: true,
          article: true,
          name: true,
          categoryId: true,
          isActive: true,
          purchasePrice: true,
          category: { select: { name: true } },
          supplier: { select: { name: true, orderMultiplicity: true } },
        },
      }),
      this.prisma.inventorySnapshot.findMany({
        where: {
          tenantId: query.tenantId,
          ...storeFilter,
          product: productWhere,
          snapshotDate: { lte: query.asOf },
        },
        select: {
          storeId: true,
          productId: true,
          snapshotDate: true,
          updatedAt: true,
          quantity: true,
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId: query.tenantId,
          isCanceled: false,
          ...storeFilter,
          product: productWhere,
          saleDate: { gte: salesFrom, lte: demandTo },
        },
        select: {
          storeId: true,
          productId: true,
          saleDate: true,
          quantity: true,
          revenue: true,
          cost: true,
        },
      }),
      this.prisma.productOosExclusion.findMany({
        where: { tenantId: query.tenantId },
        select: { productId: true },
      }),
      this.prisma.langameClubProductConfiguration.findMany({
        where: {
          tenantId: query.tenantId,
          isActive: true,
          productId: { not: null },
          ...(query.storeIds ? { storeId: { in: [...query.storeIds] } } : {}),
        },
        select: {
          storeId: true,
          productId: true,
          externalDomain: true,
          externalClubId: true,
          priceSale: true,
          purchasePrice: true,
          updatedAt: true,
        },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          tenantId: query.tenantId,
          ...storeFilter,
          product: productWhere,
          type: 'WRITEOFF',
          movementDate: { gte: query.period.from, lte: demandTo },
        },
        select: {
          storeId: true,
          productId: true,
          movementDate: true,
          quantity: true,
          amount: true,
        },
      }),
      this.prisma.dailyDataCoverage.findMany({
        where: {
          tenantId: query.tenantId,
          scope: DailyDataCoverageScope.BUSINESS_FACTS,
          businessDate: { gte: coverageFrom, lte: coverageTo },
        },
        select: {
          businessDate: true,
          status: true,
          sourceCounts: true,
          summary: true,
        },
      }),
    ]);

    const confirmedSalesCoverage = this.salesCoverageForStores({
      stores,
      records: salesCoverage,
      from: salesFrom,
      to: demandTo,
    });
    const writeOffCoverage = writeOffs.some(
      (movement) =>
        movement.quantity.toNumber() > 0 || movement.amount.toNumber() > 0,
    )
      ? { status: 'PARTIAL' as const }
      : { status: 'MISSING' as const };
    const storesById = new Map(stores.map((store) => [store.id, store]));
    const storeProductIds = [
      ...snapshots.map((snapshot) => ({
        storeId: snapshot.storeId,
        productId: snapshot.productId,
      })),
      ...sales.map((sale) => ({
        storeId: sale.storeId,
        productId: sale.productId,
      })),
      ...configurations.flatMap((configuration) => {
        const store = storesById.get(configuration.storeId);
        return configuration.productId &&
          store?.externalDomain === configuration.externalDomain &&
          store.externalClubId === configuration.externalClubId
          ? [{ storeId: store.id, productId: configuration.productId }]
          : [];
      }),
    ];
    const health = buildAssortmentHealth({
      asOf: query.asOf,
      demandTo,
      period: query.period,
      stores,
      products: products.map((product) => ({
        id: product.id,
        isActive: product.isActive,
        purchasePrice: product.purchasePrice.toNumber(),
        orderMultiplicity: product.supplier?.orderMultiplicity ?? null,
      })),
      inventorySnapshots: snapshots.map((snapshot) => ({
        storeId: snapshot.storeId,
        productId: snapshot.productId,
        snapshotDate: snapshot.snapshotDate,
        observedAt: snapshot.updatedAt,
        quantity: snapshot.quantity.toNumber(),
      })),
      sales: sales.map((sale) => ({
        storeId: sale.storeId,
        productId: sale.productId,
        saleDate: sale.saleDate,
        quantity: sale.quantity.toNumber(),
        revenue: sale.revenue.toNumber(),
        cost: sale.cost.toNumber(),
      })),
      salesCoverage: confirmedSalesCoverage,
      priceConfigurations: configurations.flatMap((configuration) =>
        configuration.productId &&
        (configuration.priceSale !== null ||
          configuration.purchasePrice !== null)
          ? [
              {
                tenantId: query.tenantId,
                productId: configuration.productId,
                externalDomain: configuration.externalDomain,
                externalClubId: configuration.externalClubId,
                price: configuration.priceSale?.toNumber() ?? null,
                purchasePrice: configuration.purchasePrice?.toNumber() ?? null,
                updatedAt: configuration.updatedAt,
              },
            ]
          : [],
      ),
      storeProductIds,
      excludedProductIds: exclusions.map((exclusion) => exclusion.productId),
      writeOffs: writeOffs.map((movement) => ({
        storeId: movement.storeId,
        productId: movement.productId,
        movementDate: movement.movementDate,
        quantity: movement.quantity.toNumber(),
        amount: movement.amount.toNumber(),
      })),
      writeOffCoverage,
    });

    return {
      health,
      productsById: new Map(
        products.map((product) => [
          product.id,
          {
            id: product.id,
            article: product.article,
            name: product.name,
            categoryId: product.categoryId,
            categoryName: product.category?.name ?? null,
            supplierName: product.supplier?.name ?? null,
          },
        ]),
      ),
      storesById: new Map(
        stores.map((store) => [store.id, { id: store.id, name: store.name }]),
      ),
      salesDayEvidence: this.salesDayEvidence({
        stores,
        records: salesCoverage,
        from: coverageFrom,
        to: coverageTo,
      }),
      sourceHealthEvidence: {
        sales: this.sourceModuleEvidence({
          stores,
          records: salesCoverage,
          from: query.period.from,
          to: demandTo,
          module: 'quick',
        }),
        inventory: this.sourceModuleEvidence({
          stores,
          records: salesCoverage,
          from: query.asOf,
          to: query.asOf,
          module: 'inventory',
        }),
      },
    };
  }

  private salesDayEvidence(input: {
    stores: Array<{ id: string; externalDomain: string | null }>;
    records: Array<{
      businessDate: Date;
      status: DailyDataCoverageStatus;
      sourceCounts: Prisma.JsonValue;
      summary: Prisma.JsonValue;
    }>;
    from: Date;
    to: Date;
  }): AssortmentSalesDayEvidence[] {
    return input.stores.flatMap((store) =>
      this.daysInclusive(input.from, input.to).map((date) => ({
        storeId: store.id,
        date,
        status: this.hasCompleteSalesCoverage(
          input.records,
          store.externalDomain,
          date,
          date,
        )
          ? ('CONFIRMED' as const)
          : this.hasFailedSalesCoverage(
                input.records,
                store.externalDomain,
                date,
                date,
              )
            ? ('FAILED' as const)
            : ('MISSING' as const),
      })),
    );
  }

  private salesCoverageForStores(input: {
    stores: Array<{ id: string; externalDomain: string | null }>;
    records: Array<{
      businessDate: Date;
      status: DailyDataCoverageStatus;
      sourceCounts: Prisma.JsonValue;
      summary: Prisma.JsonValue;
    }>;
    from: Date;
    to: Date;
  }) {
    return input.stores.map((store) => {
      const completed = this.hasCompleteSalesCoverage(
        input.records,
        store.externalDomain,
        input.from,
        input.to,
      );
      const failed = this.hasFailedSalesCoverage(
        input.records,
        store.externalDomain,
        input.from,
        input.to,
      );

      return {
        storeId: store.id,
        from: input.from,
        to: input.to,
        status: completed
          ? ('CONFIRMED' as const)
          : failed
            ? ('FAILED' as const)
            : ('MISSING' as const),
      };
    });
  }

  private hasCompleteSalesCoverage(
    records: Array<{
      businessDate: Date;
      status: DailyDataCoverageStatus;
      sourceCounts: Prisma.JsonValue;
      summary: Prisma.JsonValue;
    }>,
    domain: string | null,
    from: Date,
    to: Date,
  ) {
    if (!domain) return false;

    return this.daysInclusive(from, to).every((day) =>
      records.some(
        (record) =>
          this.sameUtcDay(record.businessDate, day) &&
          this.recordCoversDomain(record, domain, 'quick'),
      ),
    );
  }

  private hasFailedSalesCoverage(
    records: Array<{
      businessDate: Date;
      status: DailyDataCoverageStatus;
      sourceCounts: Prisma.JsonValue;
      summary: Prisma.JsonValue;
    }>,
    domain: string | null,
    from: Date,
    to: Date,
  ) {
    if (!domain) return false;

    return this.daysInclusive(from, to).some((day) =>
      records.some(
        (record) =>
          this.sameUtcDay(record.businessDate, day) &&
          this.recordFailsDomain(record, domain, 'quick'),
      ),
    );
  }

  private sourceModuleEvidence(input: {
    stores: Array<{ externalDomain: string | null }>;
    records: Array<{
      businessDate: Date;
      status: DailyDataCoverageStatus;
      sourceCounts: Prisma.JsonValue;
      summary: Prisma.JsonValue;
    }>;
    from: Date;
    to: Date;
    module: 'quick' | 'inventory';
  }): AssortmentSourceModuleEvidence {
    const domains = [
      ...new Set(
        input.stores.flatMap((store) =>
          store.externalDomain ? [store.externalDomain] : [],
        ),
      ),
    ];
    const result: AssortmentSourceModuleEvidence = {
      totalDomains: domains.length,
      confirmedDomains: 0,
      failedDomains: 0,
      missingDomains: 0,
    };

    domains.forEach((domain) => {
      const completed = this.daysInclusive(input.from, input.to).every((day) =>
        input.records.some(
          (record) =>
            this.sameUtcDay(record.businessDate, day) &&
            this.recordCoversDomain(record, domain, input.module),
        ),
      );
      if (completed) {
        result.confirmedDomains += 1;
        return;
      }
      const failed = this.daysInclusive(input.from, input.to).some((day) =>
        input.records.some(
          (record) =>
            this.sameUtcDay(record.businessDate, day) &&
            this.recordFailsDomain(record, domain, input.module),
        ),
      );
      if (failed) {
        result.failedDomains += 1;
      } else {
        result.missingDomains += 1;
      }
    });

    return result;
  }

  private recordCoversDomain(
    record: { sourceCounts: Prisma.JsonValue; summary: Prisma.JsonValue },
    domain: string,
    module: 'quick' | 'inventory',
  ) {
    return this.summaryDomains(record.summary, module).some(
      (item) => item.domain === domain && item.status === 'SUCCESS',
    );
  }

  private recordFailsDomain(
    record: { sourceCounts: Prisma.JsonValue; summary: Prisma.JsonValue },
    domain: string,
    module: 'quick' | 'inventory',
  ) {
    return this.summaryDomains(record.summary, module).some(
      (item) => item.domain === domain && item.status === 'FAILED',
    );
  }

  private summaryDomains(
    value: Prisma.JsonValue,
    module: 'quick' | 'inventory',
  ) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const record = value as Record<string, Prisma.JsonValue>;
    const source = record[module];
    const domains =
      module === 'quick' && Array.isArray(record.domains)
        ? record.domains
        : source && typeof source === 'object' && !Array.isArray(source)
          ? (source as Record<string, Prisma.JsonValue>).domains
          : [];

    return Array.isArray(domains)
      ? domains.flatMap((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item))
            return [];
          const domain = (item as Record<string, Prisma.JsonValue>).domain;
          const status = (item as Record<string, Prisma.JsonValue>).status;
          return typeof domain === 'string' && typeof status === 'string'
            ? [{ domain, status }]
            : [];
        })
      : [];
  }

  private daysInclusive(from: Date, to: Date) {
    const result: Date[] = [];
    const current = new Date(from);
    current.setUTCHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setUTCHours(0, 0, 0, 0);
    while (current <= end) {
      result.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return result;
  }

  private sameUtcDay(left: Date, right: Date) {
    return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
  }
}
