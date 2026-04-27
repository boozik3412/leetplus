import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

export type ReportGroup = {
  id: string | null;
  name: string;
  productsCount: number;
  averageMarginPercent: number;
  averageSalePrice: number;
  totalFacing: number;
};

export type LowMarginProduct = {
  id: string;
  article: string;
  name: string;
  marginPercent: number;
  purchasePrice: string;
  salePrice: string;
  categoryName: string | null;
  supplierName: string | null;
};

export type AssortmentReport = {
  tenantId: string;
  tenantSlug: string;
  totalSku: number;
  activeSku: number;
  inactiveSku: number;
  averageMarginPercent: number;
  averageMarkupPercent: number;
  categoryBreakdown: ReportGroup[];
  supplierBreakdown: ReportGroup[];
  lowMarginProducts: LowMarginProduct[];
};

type GroupAccumulator = {
  id: string | null;
  name: string;
  productsCount: number;
  marginSum: number;
  salePriceSum: number;
  totalFacing: number;
};

type ReportItem = {
  marginPercent: number;
  salePrice: number;
  product: {
    facing: number;
  };
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getAssortmentReport(
    user: AuthenticatedUser,
  ): Promise<AssortmentReport> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);

    const [totalSku, activeProducts] = await Promise.all([
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          article: true,
          name: true,
          purchasePrice: true,
          salePrice: true,
          facing: true,
          categoryId: true,
          supplierId: true,
          category: {
            select: {
              name: true,
            },
          },
          supplier: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const activeSku = activeProducts.length;
    const margins = activeProducts.map((product) => {
      const purchasePrice = product.purchasePrice.toNumber();
      const salePrice = product.salePrice.toNumber();

      return {
        product,
        purchasePrice,
        salePrice,
        marginPercent: this.marginPercent(purchasePrice, salePrice),
        markupPercent: this.markupPercent(purchasePrice, salePrice),
      };
    });

    const marginSum = margins.reduce(
      (sum, item) => sum + item.marginPercent,
      0,
    );
    const markupSum = margins.reduce(
      (sum, item) => sum + item.markupPercent,
      0,
    );

    return {
      tenantId,
      tenantSlug,
      totalSku,
      activeSku,
      inactiveSku: totalSku - activeSku,
      averageMarginPercent: this.average(marginSum, activeSku),
      averageMarkupPercent: this.average(markupSum, activeSku),
      categoryBreakdown: this.buildGroups(
        margins,
        (item) => item.product.categoryId,
        (item) => item.product.category?.name ?? 'Без категории',
      ),
      supplierBreakdown: this.buildGroups(
        margins,
        (item) => item.product.supplierId,
        (item) => item.product.supplier?.name ?? 'Без поставщика',
      ),
      lowMarginProducts: margins
        .filter((item) => item.marginPercent < 20)
        .sort((a, b) => a.marginPercent - b.marginPercent)
        .slice(0, 10)
        .map((item) => ({
          id: item.product.id,
          article: item.product.article,
          name: item.product.name,
          marginPercent: this.round(item.marginPercent),
          purchasePrice: item.product.purchasePrice.toString(),
          salePrice: item.product.salePrice.toString(),
          categoryName: item.product.category?.name ?? null,
          supplierName: item.product.supplier?.name ?? null,
        })),
    };
  }

  private buildGroups<T extends ReportItem>(
    items: T[],
    getId: (item: T) => string | null,
    getName: (item: T) => string,
  ): ReportGroup[] {
    const groups = new Map<string, GroupAccumulator>();

    items.forEach((item) => {
      const id = getId(item);
      const key = id ?? getName(item);
      const current = groups.get(key) ?? {
        id,
        name: getName(item),
        productsCount: 0,
        marginSum: 0,
        salePriceSum: 0,
        totalFacing: 0,
      };

      current.productsCount += 1;
      current.marginSum += item.marginPercent;
      current.salePriceSum += item.salePrice;
      current.totalFacing += item.product.facing;
      groups.set(key, current);
    });

    return [...groups.values()]
      .map((group) => ({
        id: group.id,
        name: group.name,
        productsCount: group.productsCount,
        averageMarginPercent: this.average(
          group.marginSum,
          group.productsCount,
        ),
        averageSalePrice: this.average(group.salePriceSum, group.productsCount),
        totalFacing: group.totalFacing,
      }))
      .sort(
        (a, b) =>
          b.productsCount - a.productsCount || a.name.localeCompare(b.name),
      );
  }

  private marginPercent(purchasePrice: number, salePrice: number) {
    if (salePrice <= 0) {
      return 0;
    }

    return ((salePrice - purchasePrice) / salePrice) * 100;
  }

  private markupPercent(purchasePrice: number, salePrice: number) {
    if (purchasePrice <= 0) {
      return 0;
    }

    return ((salePrice - purchasePrice) / purchasePrice) * 100;
  }

  private average(sum: number, count: number) {
    return count > 0 ? this.round(sum / count) : 0;
  }

  private round(value: number) {
    return Math.round(value * 10) / 10;
  }
}
