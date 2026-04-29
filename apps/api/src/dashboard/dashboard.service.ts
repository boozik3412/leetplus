import { Injectable } from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { TenantContextService } from '../tenancy/tenant-context.service';

export type DashboardTopSku = {
  productId: string;
  article: string;
  name: string;
  revenue: number;
  grossProfit: number;
  soldQuantity: number;
};

export type DashboardSummary = {
  tenantId: string;
  tenantSlug: string;
  periodFrom: string;
  periodTo: string;
  totalSku: number;
  activeSku: number;
  categoriesCount: number;
  suppliersCount: number;
  averageMarginPercent: number;
  averageFacing: number;
  totalRevenue: number;
  grossProfit: number;
  adjustedGrossProfit: number;
  marginPercent: number;
  adjustedMarginPercent: number;
  soldQuantity: number;
  writeOffAmount: number;
  returnAmount: number;
  stockQuantity: number;
  outOfStockRiskCount: number;
  recommendedOrderQuantity: number;
  topSkuByRevenue: DashboardTopSku[];
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getSummary(user?: AuthenticatedUser): Promise<DashboardSummary> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod();

    const [
      totalSku,
      activeSku,
      categoriesCount,
      suppliersCount,
      productsForAverages,
      salesFacts,
      inventorySnapshots,
      stockMovements,
    ] = await Promise.all([
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.product.count({ where: { tenantId, isActive: true } }),
      this.prisma.category.count({ where: { tenantId } }),
      this.prisma.supplier.count({ where: { tenantId } }),
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          article: true,
          name: true,
          purchasePrice: true,
          salePrice: true,
          facing: true,
          supplier: {
            select: {
              orderMultiplicity: true,
            },
          },
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          saleDate: {
            gte: period.fromDate,
            lte: period.toDate,
          },
        },
        include: {
          product: {
            select: {
              id: true,
              article: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.inventorySnapshot.findMany({
        where: {
          tenantId,
          snapshotDate: {
            lte: period.toDate,
          },
        },
        select: {
          storeId: true,
          productId: true,
          quantity: true,
        },
        orderBy: {
          snapshotDate: 'desc',
        },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          tenantId,
          movementDate: {
            gte: period.fromDate,
            lte: period.toDate,
          },
        },
        select: {
          type: true,
          amount: true,
        },
      }),
    ]);

    let averageMarginPercent = 0;
    let averageFacing = 0;

    if (productsForAverages.length > 0) {
      const marginSum = productsForAverages.reduce((sum, p) => {
        const purchase = p.purchasePrice.toNumber();
        const sale = p.salePrice.toNumber();
        if (!sale || sale <= 0) {
          return sum;
        }
        return sum + ((sale - purchase) / sale) * 100;
      }, 0);
      averageMarginPercent = marginSum / productsForAverages.length;

      const facingSum = productsForAverages.reduce(
        (sum, p) => sum + p.facing,
        0,
      );
      averageFacing = facingSum / productsForAverages.length;
    }

    const salesByProduct = new Map<string, DashboardTopSku>();
    let totalRevenue = 0;
    let totalCost = 0;
    let soldQuantity = 0;

    salesFacts.forEach((fact) => {
      const quantity = fact.quantity.toNumber();
      const revenue = fact.revenue.toNumber();
      const cost = fact.cost.toNumber();
      const current = salesByProduct.get(fact.productId) ?? {
        productId: fact.product.id,
        article: fact.product.article,
        name: fact.product.name,
        revenue: 0,
        grossProfit: 0,
        soldQuantity: 0,
      };

      current.revenue += revenue;
      current.grossProfit += revenue - cost;
      current.soldQuantity += quantity;
      salesByProduct.set(fact.productId, current);

      totalRevenue += revenue;
      totalCost += cost;
      soldQuantity += quantity;
    });

    const movementImpact = this.stockMovementImpact(stockMovements);
    const grossProfit = totalRevenue - totalCost;
    const adjustedGrossProfit =
      grossProfit - movementImpact.writeOffAmount - movementImpact.returnAmount;
    const stockByProduct = this.latestStockByProduct(inventorySnapshots);
    const stockQuantity = [...stockByProduct.values()].reduce(
      (sum, quantity) => sum + quantity,
      0,
    );
    const periodDays = this.periodDays(period.fromDate, period.toDate);
    const demand = productsForAverages.map((product) => {
      const sold = salesByProduct.get(product.id)?.soldQuantity ?? 0;
      const averageDailySales = sold / periodDays;
      const stock = stockByProduct.get(product.id) ?? 0;

      return {
        stock,
        averageDailySales,
        stockDays: averageDailySales > 0 ? stock / averageDailySales : null,
        recommendedOrder: this.recommendedOrder(
          Math.max(0, averageDailySales - stock),
          product.supplier?.orderMultiplicity ?? null,
        ),
      };
    });

    return {
      tenantId,
      tenantSlug,
      periodFrom: this.toDateInputValue(period.fromDate),
      periodTo: this.toDateInputValue(period.toDate),
      totalSku,
      activeSku,
      categoriesCount,
      suppliersCount,
      averageMarginPercent: this.round(averageMarginPercent),
      averageFacing: this.round(averageFacing),
      totalRevenue: this.round(totalRevenue),
      grossProfit: this.round(grossProfit),
      adjustedGrossProfit: this.round(adjustedGrossProfit),
      marginPercent: this.marginPercent(totalCost, totalRevenue),
      adjustedMarginPercent: this.marginPercent(
        totalRevenue - adjustedGrossProfit,
        totalRevenue,
      ),
      soldQuantity: this.round(soldQuantity),
      writeOffAmount: this.round(movementImpact.writeOffAmount),
      returnAmount: this.round(movementImpact.returnAmount),
      stockQuantity: this.round(stockQuantity),
      outOfStockRiskCount: demand.filter(
        (item) =>
          item.averageDailySales > 0 &&
          item.stockDays !== null &&
          item.stockDays <= 3,
      ).length,
      recommendedOrderQuantity: this.round(
        demand.reduce((sum, item) => sum + item.recommendedOrder, 0),
      ),
      topSkuByRevenue: [...salesByProduct.values()]
        .sort(
          (a, b) =>
            b.revenue - a.revenue ||
            b.grossProfit - a.grossProfit ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 5)
        .map((item) => ({
          ...item,
          revenue: this.round(item.revenue),
          grossProfit: this.round(item.grossProfit),
          soldQuantity: this.round(item.soldQuantity),
        })),
    };
  }

  private resolvePeriod() {
    const toDate = new Date();
    toDate.setUTCHours(23, 59, 59, 999);
    const fromDate = new Date(toDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - 29);
    fromDate.setUTCHours(0, 0, 0, 0);

    return { fromDate, toDate };
  }

  private latestStockByProduct(
    snapshots: {
      storeId: string;
      productId: string;
      quantity: { toNumber: () => number };
    }[],
  ) {
    const seen = new Set<string>();
    const stockByProduct = new Map<string, number>();

    snapshots.forEach((snapshot) => {
      const snapshotKey = `${snapshot.storeId}:${snapshot.productId}`;

      if (seen.has(snapshotKey)) {
        return;
      }

      seen.add(snapshotKey);
      stockByProduct.set(
        snapshot.productId,
        (stockByProduct.get(snapshot.productId) ?? 0) +
          snapshot.quantity.toNumber(),
      );
    });

    return stockByProduct;
  }

  private stockMovementImpact(
    movements: {
      type: StockMovementType;
      amount: { toNumber: () => number };
    }[],
  ) {
    return movements.reduce(
      (impact, movement) => {
        const amount = movement.amount.toNumber();

        if (movement.type === StockMovementType.WRITEOFF) {
          impact.writeOffAmount += amount;
        } else {
          impact.returnAmount += amount;
        }

        return impact;
      },
      {
        writeOffAmount: 0,
        returnAmount: 0,
      },
    );
  }

  private recommendedOrder(
    dailyNeed: number,
    orderMultiplicity: number | null,
  ) {
    if (dailyNeed <= 0) {
      return 0;
    }

    if (!orderMultiplicity || orderMultiplicity <= 1) {
      return Math.ceil(dailyNeed);
    }

    return Math.ceil(dailyNeed / orderMultiplicity) * orderMultiplicity;
  }

  private marginPercent(cost: number, revenue: number) {
    if (revenue <= 0) {
      return 0;
    }

    return this.round(((revenue - cost) / revenue) * 100);
  }

  private periodDays(fromDate: Date, toDate: Date) {
    const millisecondsInDay = 24 * 60 * 60 * 1000;
    return Math.max(
      1,
      Math.ceil((toDate.getTime() - fromDate.getTime()) / millisecondsInDay),
    );
  }

  private toDateInputValue(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private round(value: number) {
    return Math.round(value * 10) / 10;
  }
}
