import { BadRequestException, Injectable } from '@nestjs/common';
import {
  IntegrationSyncMode,
  IntegrationProvider,
  IntegrationSyncStatus,
  IntegrationSyncTrigger,
  Prisma,
} from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { LangameClient } from './langame.client';
import { LangameSettingsService } from './langame-settings.service';
import type {
  LangameGood,
  LangameProduct,
  LangameSyncQuery,
  LangameSyncResult,
  LangameSyncSourceResult,
} from './langame.types';

const DEFAULT_PAGE_LIMIT = 200;

type DiscrepancyLogEntry = {
  entity: 'Product' | 'InventorySnapshot' | 'SalesFact';
  externalId: string;
  field: string;
  previousValue: string | number | null;
  nextValue: string | number | null;
};

@Injectable()
export class LangameSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly langameClient: LangameClient,
    private readonly langameSettingsService: LangameSettingsService,
  ) {}

  async syncTenant(
    user: AuthenticatedUser,
    query: LangameSyncQuery,
  ): Promise<LangameSyncResult> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const { apiKey, sources } =
      await this.langameSettingsService.resolveTenantAccess(tenantId);
    const result: LangameSyncResult = {
      tenantId,
      sources: sources.length,
      failedSources: 0,
      stores: 0,
      products: 0,
      inventorySnapshots: 0,
      salesFacts: 0,
      discrepancies: 0,
      sourceResults: [],
    };
    const mode = this.resolveMode(query.mode);
    const trigger = this.resolveTrigger(query.trigger);

    for (const source of sources) {
      const syncJob = await this.prisma.integrationSyncJob.create({
        data: {
          tenantId,
          integrationSourceId: source.id,
          provider: IntegrationProvider.LANGAME,
          domain: source.domain,
          status: IntegrationSyncStatus.FAILED,
          mode,
          trigger,
        },
      });
      const discrepancies: DiscrepancyLogEntry[] = [];
      const sourceResult: LangameSyncSourceResult = {
        domain: source.domain,
        status: 'FAILED',
        stores: 0,
        products: 0,
        inventorySnapshots: 0,
        salesFacts: 0,
        discrepancies: 0,
        discrepancyLogPath: null,
        errorMessage: null,
      };

      try {
        const clubs = await this.langameClient.listClubs(
          source.baseUrl,
          apiKey,
        );
        const products = await this.langameClient.listProducts(
          source.baseUrl,
          apiKey,
        );
        const productsByExternalId = await this.syncProducts(
          tenantId,
          source.domain,
          products,
          discrepancies,
        );

        result.products += products.length;
        sourceResult.products = products.length;

        for (const club of clubs) {
          const store = await this.prisma.store.upsert({
            where: {
              tenantId_externalProvider_externalDomain_externalClubId: {
                tenantId,
                externalProvider: IntegrationProvider.LANGAME,
                externalDomain: source.domain,
                externalClubId: String(club.id),
              },
            },
            create: {
              tenantId,
              name: club.name,
              address:
                this.knownAddress(source.domain, club.id) ?? club.address,
              isActive: club.active === 1,
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: source.domain,
              externalClubId: String(club.id),
              integrationSourceId: source.id,
            },
            update: {
              name: club.name,
              address:
                this.knownAddress(source.domain, club.id) ?? club.address,
              isActive: club.active === 1,
              integrationSourceId: source.id,
            },
          });
          const goods = await this.langameClient.listGoods(
            source.baseUrl,
            apiKey,
            club.id,
          );

          result.stores += 1;
          sourceResult.stores += 1;
          const inventorySnapshots = await this.syncInventory(
            tenantId,
            source.domain,
            store.id,
            String(club.id),
            productsByExternalId,
            goods,
            period.toDate,
            discrepancies,
          );
          result.inventorySnapshots += inventorySnapshots;
          sourceResult.inventorySnapshots += inventorySnapshots;
        }

        const salesFacts = await this.syncProductExpenses(
          tenantId,
          source.baseUrl,
          source.domain,
          apiKey,
          productsByExternalId,
          period,
          discrepancies,
        );
        result.salesFacts += salesFacts;
        sourceResult.salesFacts = salesFacts;
        sourceResult.discrepancies = discrepancies.length;
        result.discrepancies += discrepancies.length;
        const discrepancyLogPath =
          trigger === IntegrationSyncTrigger.MANUAL && discrepancies.length > 0
            ? await this.writeDiscrepancyLog({
                tenantId,
                domain: source.domain,
                syncJobId: syncJob.id,
                discrepancies,
              })
            : null;
        sourceResult.discrepancyLogPath = discrepancyLogPath;

        await this.prisma.integrationSource.update({
          where: { id: source.id },
          data: { lastSyncedAt: new Date() },
        });
        await this.prisma.integrationSyncJob.update({
          where: { id: syncJob.id },
          data: {
            status: IntegrationSyncStatus.SUCCESS,
            finishedAt: new Date(),
            storesCount: sourceResult.stores,
            productsCount: sourceResult.products,
            inventoryCount: sourceResult.inventorySnapshots,
            salesCount: sourceResult.salesFacts,
            discrepancyCount: sourceResult.discrepancies,
            discrepancyLogPath,
            errorMessage: null,
          },
        });
        sourceResult.status = 'SUCCESS';
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown LAngame sync error';
        result.failedSources += 1;
        sourceResult.errorMessage = errorMessage;
        await this.prisma.integrationSyncJob.update({
          where: { id: syncJob.id },
          data: {
            status: IntegrationSyncStatus.FAILED,
            finishedAt: new Date(),
            storesCount: sourceResult.stores,
            productsCount: sourceResult.products,
            inventoryCount: sourceResult.inventorySnapshots,
            salesCount: sourceResult.salesFacts,
            discrepancyCount: sourceResult.discrepancies,
            errorMessage,
          },
        });
      }

      result.sourceResults.push(sourceResult);
    }

    return result;
  }

  private async syncProducts(
    tenantId: string,
    domain: string,
    products: LangameProduct[],
    discrepancies: DiscrepancyLogEntry[],
  ) {
    const byExternalId = new Map<string, string>();

    for (const product of products) {
      const existing = await this.prisma.product.findUnique({
        where: {
          tenantId_externalProvider_externalDomain_externalProductId: {
            tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: domain,
            externalProductId: String(product.id),
          },
        },
        select: {
          name: true,
          isActive: true,
        },
      });
      this.addDiscrepancy(discrepancies, {
        entity: 'Product',
        externalId: String(product.id),
        field: 'name',
        previousValue: existing?.name ?? null,
        nextValue: product.name,
      });
      this.addDiscrepancy(discrepancies, {
        entity: 'Product',
        externalId: String(product.id),
        field: 'isActive',
        previousValue:
          existing?.isActive === undefined ? null : Number(existing.isActive),
        nextValue: Number(product.active === 1),
      });
      const created = await this.prisma.product.upsert({
        where: {
          tenantId_externalProvider_externalDomain_externalProductId: {
            tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: domain,
            externalProductId: String(product.id),
          },
        },
        create: {
          tenantId,
          article: `LG-${domain}-${product.id}`,
          name: product.name,
          purchasePrice: new Prisma.Decimal(0),
          salePrice: new Prisma.Decimal(0),
          isActive: product.active === 1,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalProductId: String(product.id),
        },
        update: {
          name: product.name,
          isActive: product.active === 1,
        },
      });

      byExternalId.set(String(product.id), created.id);
    }

    return byExternalId;
  }

  private async syncInventory(
    tenantId: string,
    domain: string,
    storeId: string,
    externalClubId: string,
    productsByExternalId: Map<string, string>,
    goods: LangameGood[],
    snapshotDate: Date,
    discrepancies: DiscrepancyLogEntry[],
  ) {
    let synced = 0;

    for (const item of goods) {
      const productId = productsByExternalId.get(String(item.id));

      if (!productId) {
        continue;
      }

      const existing = await this.prisma.inventorySnapshot.findUnique({
        where: {
          tenantId_storeId_productId_snapshotDate: {
            tenantId,
            storeId,
            productId,
            snapshotDate,
          },
        },
        select: {
          quantity: true,
        },
      });
      this.addDiscrepancy(discrepancies, {
        entity: 'InventorySnapshot',
        externalId: `${domain}:${externalClubId}:${item.id}:${this.toDateInputValue(snapshotDate)}`,
        field: 'quantity',
        previousValue: existing?.quantity.toNumber() ?? null,
        nextValue: item.count,
      });
      await this.prisma.inventorySnapshot.upsert({
        where: {
          tenantId_storeId_productId_snapshotDate: {
            tenantId,
            storeId,
            productId,
            snapshotDate,
          },
        },
        create: {
          tenantId,
          storeId,
          productId,
          snapshotDate,
          quantity: new Prisma.Decimal(item.count),
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalClubId,
        },
        update: {
          quantity: new Prisma.Decimal(item.count),
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalClubId,
        },
      });
      synced += 1;
    }

    return synced;
  }

  private async syncProductExpenses(
    tenantId: string,
    baseUrl: string,
    domain: string,
    apiKey: string,
    productsByExternalId: Map<string, string>,
    period: { from: string; to: string },
    discrepancies: DiscrepancyLogEntry[],
  ) {
    const stores = await this.prisma.store.findMany({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
      },
      select: {
        id: true,
        externalClubId: true,
      },
    });
    const storesByExternalClubId = new Map(
      stores.map((store) => [store.externalClubId, store.id]),
    );
    let synced = 0;
    let page = 1;

    while (true) {
      const rows = await this.langameClient.listProductExpenses(
        baseUrl,
        apiKey,
        {
          page,
          pageLimit: DEFAULT_PAGE_LIMIT,
          dateFrom: period.from,
          dateTo: period.to,
        },
      );

      for (const row of rows.filter((item) => item.cancel !== 1)) {
        const productId = productsByExternalId.get(String(row.list_goods_id));
        const storeId = storesByExternalClubId.get(String(row.list_clubs_id));

        if (!productId || !storeId) {
          continue;
        }

        const nextRevenue = new Prisma.Decimal(row.price_sale).mul(row.count);
        const nextCost = new Prisma.Decimal(row.price_purchase ?? 0).mul(
          row.count,
        );
        const nextSaleDate = this.parseLangameDate(row.date);
        const existing = await this.prisma.salesFact.findUnique({
          where: {
            tenantId_externalProvider_externalDomain_externalSaleId: {
              tenantId,
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: domain,
              externalSaleId: String(row.id),
            },
          },
          select: {
            storeId: true,
            productId: true,
            saleDate: true,
            quantity: true,
            revenue: true,
            cost: true,
          },
        });
        this.addDiscrepancy(discrepancies, {
          entity: 'SalesFact',
          externalId: String(row.id),
          field: 'storeId',
          previousValue: existing?.storeId ?? null,
          nextValue: storeId,
        });
        this.addDiscrepancy(discrepancies, {
          entity: 'SalesFact',
          externalId: String(row.id),
          field: 'productId',
          previousValue: existing?.productId ?? null,
          nextValue: productId,
        });
        this.addDiscrepancy(discrepancies, {
          entity: 'SalesFact',
          externalId: String(row.id),
          field: 'saleDate',
          previousValue: existing
            ? this.toDateTimeValue(existing.saleDate)
            : null,
          nextValue: this.toDateTimeValue(nextSaleDate),
        });
        this.addDiscrepancy(discrepancies, {
          entity: 'SalesFact',
          externalId: String(row.id),
          field: 'quantity',
          previousValue: existing?.quantity.toNumber() ?? null,
          nextValue: row.count,
        });
        this.addDiscrepancy(discrepancies, {
          entity: 'SalesFact',
          externalId: String(row.id),
          field: 'revenue',
          previousValue: existing?.revenue.toNumber() ?? null,
          nextValue: nextRevenue.toNumber(),
        });
        this.addDiscrepancy(discrepancies, {
          entity: 'SalesFact',
          externalId: String(row.id),
          field: 'cost',
          previousValue: existing?.cost.toNumber() ?? null,
          nextValue: nextCost.toNumber(),
        });
        await this.prisma.salesFact.upsert({
          where: {
            tenantId_externalProvider_externalDomain_externalSaleId: {
              tenantId,
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: domain,
              externalSaleId: String(row.id),
            },
          },
          create: {
            tenantId,
            storeId,
            productId,
            saleDate: nextSaleDate,
            quantity: new Prisma.Decimal(row.count),
            revenue: nextRevenue,
            cost: nextCost,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: domain,
            externalSaleId: String(row.id),
          },
          update: {
            saleDate: nextSaleDate,
            quantity: new Prisma.Decimal(row.count),
            revenue: nextRevenue,
            cost: nextCost,
          },
        });
        synced += 1;
      }

      if (rows.length < DEFAULT_PAGE_LIMIT) {
        break;
      }

      page += 1;
    }

    return synced;
  }

  private resolvePeriod(query: LangameSyncQuery) {
    const now = new Date();
    const toDate = query.dateTo
      ? this.parseDateInput(query.dateTo, 'dateTo')
      : new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
    const fromDate = query.dateFrom
      ? this.parseDateInput(query.dateFrom, 'dateFrom')
      : new Date(toDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - 6);

    if (fromDate > toDate) {
      throw new BadRequestException('dateFrom must be before dateTo');
    }

    return {
      fromDate,
      toDate,
      from: this.toDateInputValue(fromDate),
      to: this.toDateInputValue(toDate),
    };
  }

  private resolveMode(mode: LangameSyncQuery['mode']) {
    if (!mode) {
      return IntegrationSyncMode.BACKFILL;
    }

    if (!Object.values(IntegrationSyncMode).includes(mode)) {
      throw new BadRequestException('Invalid LAngame sync mode');
    }

    return mode;
  }

  private resolveTrigger(trigger: LangameSyncQuery['trigger']) {
    if (!trigger) {
      return IntegrationSyncTrigger.MANUAL;
    }

    if (!Object.values(IntegrationSyncTrigger).includes(trigger)) {
      throw new BadRequestException('Invalid LAngame sync trigger');
    }

    return trigger;
  }

  private parseDateInput(value: string, field: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      throw new BadRequestException(`${field} must be YYYY-MM-DD`);
    }

    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private parseLangameDate(value: string) {
    const normalized = value.replace(' ', 'T');
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid LAngame date: ${value}`);
    }

    return date;
  }

  private toDateInputValue(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private toDateTimeValue(date: Date) {
    return date.toISOString();
  }

  private addDiscrepancy(
    discrepancies: DiscrepancyLogEntry[],
    entry: DiscrepancyLogEntry,
  ) {
    if (entry.previousValue === null) {
      return;
    }

    if (String(entry.previousValue) === String(entry.nextValue)) {
      return;
    }

    discrepancies.push(entry);
  }

  private async writeDiscrepancyLog({
    tenantId,
    domain,
    syncJobId,
    discrepancies,
  }: {
    tenantId: string;
    domain: string;
    syncJobId: string;
    discrepancies: DiscrepancyLogEntry[];
  }) {
    const directory = join(process.cwd(), 'logs', 'langame-sync', tenantId);
    await mkdir(directory, { recursive: true });
    const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${domain}-${syncJobId}.json`;
    const filePath = join(directory, fileName);

    await writeFile(
      filePath,
      JSON.stringify(
        {
          tenantId,
          domain,
          syncJobId,
          createdAt: new Date().toISOString(),
          discrepancies,
        },
        null,
        2,
      ),
      'utf8',
    );

    return filePath;
  }

  private knownAddress(domain: string, clubId: number) {
    const addresses: Record<string, Record<number, string>> = {
      '1337.langame.ru': {
        1: 'г. Екатеринбург, ул. Радищева, 12',
      },
      '443.langame.ru': {
        1: 'г. Екатеринбург, ул. Родонитовая, 33',
      },
      '46.langamepro.ru': {
        1: 'г. Ижевск, ул. Пушкинская, 217',
        2: 'г. Ижевск, ул. Холмогорова, 43',
      },
    };

    return addresses[domain]?.[clubId] ?? null;
  }
}
