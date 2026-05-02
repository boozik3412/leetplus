import { BadRequestException, Injectable } from '@nestjs/common';
import {
  IntegrationSyncMode,
  IntegrationProvider,
  IntegrationSyncStatus,
  IntegrationSyncTrigger,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { LangameClient } from './langame.client';
import { LangameSettingsService } from './langame-settings.service';
import type {
  LangameGood,
  LangameOperationLog,
  LangameProduct,
  LangameProductExpense,
  LangameSyncQuery,
  LangameSyncResult,
  LangameScheduledSyncResult,
  LangameSyncSourceResult,
} from './langame.types';

const DEFAULT_PAGE_LIMIT = 200;
const MAX_LANGAME_PERIOD_DAYS = 365;
const MAX_LANGAME_OPERATION_LOG_PERIOD_DAYS = 31;

type DiscrepancyLogEntry = {
  entity: 'Product' | 'InventorySnapshot' | 'SalesFact';
  externalId: string;
  field: string;
  previousValue: string | number | null;
  nextValue: string | number | null;
};

type ProductSyncRef = {
  id: string;
  name: string;
};

type StoreSyncRef = {
  id: string;
  name: string;
};

type ResolvedSyncPeriod = {
  fromDate: Date;
  toDate: Date;
  from: string;
  to: string;
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
    return this.syncTenantById(tenantId, query);
  }

  async syncConfiguredTenants(
    query: LangameSyncQuery,
  ): Promise<LangameScheduledSyncResult> {
    const mode = query.mode ?? 'QUICK';
    const tenants = await this.prisma.tenant.findMany({
      where: {
        ...(query.tenantSlug ? { slug: query.tenantSlug } : {}),
        integrationCredentials: {
          some: {
            provider: IntegrationProvider.LANGAME,
            isActive: true,
            apiKeyEncrypted: { not: null },
          },
        },
        integrationSources: {
          some: {
            provider: IntegrationProvider.LANGAME,
            isActive: true,
          },
        },
      },
      select: { id: true },
    });

    const results: LangameSyncResult[] = [];

    for (const tenant of tenants) {
      results.push(
        await this.syncTenantById(tenant.id, {
          ...query,
          mode,
          trigger: 'AUTO',
        }),
      );
    }

    return {
      mode,
      tenants: tenants.length,
      results,
    };
  }

  private async syncTenantById(
    tenantId: string,
    query: LangameSyncQuery,
  ): Promise<LangameSyncResult> {
    const requestedPeriod = this.resolvePeriod(query);
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
      clubRevenueFacts: 0,
      discrepancies: 0,
      sourceResults: [],
    };
    const mode = this.resolveMode(query.mode);
    const trigger = this.resolveTrigger(query.trigger);
    const shouldSyncCatalog = ['CATALOG', 'BACKFILL', 'FULL'].includes(mode);
    const shouldSyncInventory = ['INVENTORY', 'BACKFILL', 'FULL'].includes(
      mode,
    );
    const shouldSyncSales = ['QUICK', 'BACKFILL', 'FULL'].includes(mode);
    const shouldSyncClubRevenue = shouldSyncSales;

    for (const source of sources) {
      const period = this.resolveSourcePeriod(
        query,
        requestedPeriod,
        source.lastSyncedDate ?? null,
      );

      if (!period) {
        continue;
      }

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
        clubRevenueFacts: 0,
        discrepancies: 0,
        discrepancyLogPath: null,
        errorMessage: null,
      };

      try {
        const products = shouldSyncCatalog
          ? await this.langameClient.listProducts(source.baseUrl, apiKey)
          : [];
        const productsByExternalId = shouldSyncCatalog
          ? await this.syncProducts(
              tenantId,
              source.domain,
              products,
              discrepancies,
            )
          : await this.loadProductMap(tenantId, source.domain);

        result.products += products.length;
        sourceResult.products = products.length;

        if (shouldSyncCatalog || shouldSyncInventory) {
          const clubs = await this.langameClient.listClubs(
            source.baseUrl,
            apiKey,
          );

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

            result.stores += 1;
            sourceResult.stores += 1;

            if (shouldSyncInventory) {
              const goods = await this.langameClient.listGoods(
                source.baseUrl,
                apiKey,
                club.id,
              );
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
          }
        }

        if (shouldSyncSales) {
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
        }
        if (shouldSyncClubRevenue) {
          const clubRevenueFacts = await this.syncClubRevenueFacts(
            tenantId,
            source.baseUrl,
            source.domain,
            apiKey,
            period,
          );
          result.clubRevenueFacts += clubRevenueFacts;
          sourceResult.clubRevenueFacts = clubRevenueFacts;
        }
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
          data: {
            lastSyncedAt: new Date(),
            lastSyncedDate: this.maxSyncedDate(
              source.lastSyncedDate ?? null,
              period.toDate,
            ),
          },
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

  private async loadProductMap(tenantId: string, domain: string) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
        externalProductId: { not: null },
      },
      select: {
        id: true,
        name: true,
        externalProductId: true,
      },
    });

    return new Map(
      products
        .filter((product) => product.externalProductId)
        .map((product) => [
          product.externalProductId as string,
          {
            id: product.id,
            name: product.name,
          },
        ]),
    );
  }

  private async syncProducts(
    tenantId: string,
    domain: string,
    products: LangameProduct[],
    discrepancies: DiscrepancyLogEntry[],
  ) {
    const byExternalId = new Map<string, ProductSyncRef>();
    const syncedExternalIds = products.map((product) => String(product.id));

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
          externalMissingSince: null,
          // Canonical grouping is intentionally not assigned during sync:
          // product merging is allowed only after a fresh parsing analysis
          // and explicit user confirmation in the utilities workflow.
        },
        update: {
          name: product.name,
          isActive: product.active === 1,
          externalMissingSince: null,
        },
      });

      byExternalId.set(String(product.id), {
        id: created.id,
        name: product.name,
      });
    }

    if (syncedExternalIds.length > 0) {
      await this.prisma.product.updateMany({
        where: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalProductId: {
            notIn: syncedExternalIds,
          },
          externalMissingSince: null,
        },
        data: {
          isActive: false,
          externalMissingSince: new Date(),
        },
      });
    }

    return byExternalId;
  }

  private async syncInventory(
    tenantId: string,
    domain: string,
    storeId: string,
    externalClubId: string,
    productsByExternalId: Map<string, ProductSyncRef>,
    goods: LangameGood[],
    snapshotDate: Date,
    discrepancies: DiscrepancyLogEntry[],
  ) {
    let synced = 0;

    for (const item of goods) {
      const productId = productsByExternalId.get(String(item.id))?.id;

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
    productsByExternalId: Map<string, ProductSyncRef>,
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
        name: true,
        externalClubId: true,
      },
    });
    const storesByExternalClubId = new Map(
      stores.map((store) => [
        store.externalClubId,
        {
          id: store.id,
          name: store.name,
        },
      ]),
    );
    let synced = 0;

    for (const chunk of this.splitPeriodByLangameLimit(period)) {
      let page = 1;

      while (true) {
        const rows = await this.langameClient.listProductExpenses(
          baseUrl,
          apiKey,
          {
            page,
            pageLimit: DEFAULT_PAGE_LIMIT,
            dateFrom: chunk.from,
            dateTo: chunk.to,
          },
        );

        for (const row of rows) {
          const externalProductId = String(row.list_goods_id);
          const externalClubId =
            row.list_clubs_id === null ? null : String(row.list_clubs_id);
          const product = await this.resolveSaleProduct(
            tenantId,
            domain,
            productsByExternalId,
            externalProductId,
          );
          const store = externalClubId
            ? await this.resolveSaleStore(
                tenantId,
                domain,
                storesByExternalClubId,
                externalClubId,
              )
            : null;

          if (!store) {
            continue;
          }

          const isCanceled = row.cancel === 1;
          const nextRevenue = isCanceled
            ? new Prisma.Decimal(0)
            : new Prisma.Decimal(row.price_sale).mul(row.count);
          const nextCost = isCanceled
            ? new Prisma.Decimal(0)
            : new Prisma.Decimal(row.price_purchase ?? 0).mul(row.count);
          const nextQuantity = isCanceled ? 0 : row.count;
          const nextSaleDate = this.parseLangameDate(row.date);
          const sourcePayloadHash = this.langameSalePayloadHash(row);
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
              externalProductId: true,
              externalClubId: true,
              productNameAtSale: true,
              storeNameAtSale: true,
              isCanceled: true,
            },
          });
          this.addDiscrepancy(discrepancies, {
            entity: 'SalesFact',
            externalId: String(row.id),
            field: 'storeId',
            previousValue: existing?.storeId ?? null,
            nextValue: store.id,
          });
          this.addDiscrepancy(discrepancies, {
            entity: 'SalesFact',
            externalId: String(row.id),
            field: 'productId',
            previousValue: existing?.productId ?? null,
            nextValue: product.id,
          });
          this.addDiscrepancy(discrepancies, {
            entity: 'SalesFact',
            externalId: String(row.id),
            field: 'externalProductId',
            previousValue: existing?.externalProductId ?? null,
            nextValue: externalProductId,
          });
          this.addDiscrepancy(discrepancies, {
            entity: 'SalesFact',
            externalId: String(row.id),
            field: 'externalClubId',
            previousValue: existing?.externalClubId ?? null,
            nextValue: externalClubId,
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
            nextValue: nextQuantity,
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
          this.addDiscrepancy(discrepancies, {
            entity: 'SalesFact',
            externalId: String(row.id),
            field: 'isCanceled',
            previousValue:
              existing?.isCanceled === undefined
                ? null
                : Number(existing.isCanceled),
            nextValue: Number(isCanceled),
          });
          const productChanged = existing?.productId
            ? existing.productId !== product.id
            : false;
          const storeChanged = existing?.storeId
            ? existing.storeId !== store.id
            : false;
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
              storeId: store.id,
              productId: product.id,
              saleDate: nextSaleDate,
              quantity: new Prisma.Decimal(nextQuantity),
              revenue: nextRevenue,
              cost: nextCost,
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: domain,
              externalSaleId: String(row.id),
              externalProductId,
              externalClubId,
              productNameAtSale: product.name,
              storeNameAtSale: store.name,
              sourcePayloadHash,
              isCanceled,
              canceledAt: isCanceled ? new Date() : null,
            },
            update: {
              storeId: store.id,
              productId: product.id,
              saleDate: nextSaleDate,
              quantity: new Prisma.Decimal(nextQuantity),
              revenue: nextRevenue,
              cost: nextCost,
              externalProductId,
              externalClubId,
              productNameAtSale:
                productChanged || !existing?.productNameAtSale
                  ? product.name
                  : existing.productNameAtSale,
              storeNameAtSale:
                storeChanged || !existing?.storeNameAtSale
                  ? store.name
                  : existing.storeNameAtSale,
              sourcePayloadHash,
              isCanceled,
              canceledAt: isCanceled ? new Date() : null,
            },
          });
          synced += 1;
        }

        if (rows.length < DEFAULT_PAGE_LIMIT) {
          break;
        }

        page += 1;
      }
    }

    return synced;
  }

  private async resolveSaleProduct(
    tenantId: string,
    domain: string,
    productsByExternalId: Map<string, ProductSyncRef>,
    externalProductId: string,
  ) {
    const existing = productsByExternalId.get(externalProductId);

    if (existing) {
      return existing;
    }

    const placeholderName = `LAngame product #${externalProductId}`;
    const product = await this.prisma.product.upsert({
      where: {
        tenantId_externalProvider_externalDomain_externalProductId: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalProductId,
        },
      },
      create: {
        tenantId,
        article: `LG-${domain}-${externalProductId}`,
        name: placeholderName,
        purchasePrice: new Prisma.Decimal(0),
        salePrice: new Prisma.Decimal(0),
        isActive: false,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
        externalProductId,
        externalMissingSince: new Date(),
      },
      update: {
        isActive: false,
        externalMissingSince: new Date(),
      },
      select: {
        id: true,
        name: true,
      },
    });
    const resolved = {
      id: product.id,
      name: product.name,
    };
    productsByExternalId.set(externalProductId, resolved);

    return resolved;
  }

  private async resolveSaleStore(
    tenantId: string,
    domain: string,
    storesByExternalClubId: Map<string | null, StoreSyncRef>,
    externalClubId: string,
  ) {
    const existing = storesByExternalClubId.get(externalClubId);

    if (existing) {
      return existing;
    }

    const placeholderName = `LAngame club #${externalClubId}`;
    const store = await this.prisma.store.upsert({
      where: {
        tenantId_externalProvider_externalDomain_externalClubId: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalClubId,
        },
      },
      create: {
        tenantId,
        name: placeholderName,
        isActive: false,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
        externalClubId,
      },
      update: {
        isActive: false,
      },
      select: {
        id: true,
        name: true,
      },
    });
    const resolved = {
      id: store.id,
      name: store.name,
    };
    storesByExternalClubId.set(externalClubId, resolved);

    return resolved;
  }

  private langameSalePayloadHash(row: LangameProductExpense) {
    return createHash('sha256').update(JSON.stringify(row)).digest('hex');
  }

  private async syncClubRevenueFacts(
    tenantId: string,
    baseUrl: string,
    domain: string,
    apiKey: string,
    period: { from: string; to: string; fromDate: Date; toDate: Date },
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
    const operations: LangameOperationLog[] = [];

    for (const chunk of this.splitPeriodByDays(
      period,
      MAX_LANGAME_OPERATION_LOG_PERIOD_DAYS,
    )) {
      operations.push(
        ...(await this.langameClient.listAllOperationsLog(baseUrl, apiKey, {
          dateFrom: this.toLangameOperationDateValue(chunk.from),
          dateTo: this.toLangameOperationDateValue(chunk.to),
        })),
      );
    }
    const revenueByStoreAndDate = new Map<
      string,
      {
        storeId: string | null;
        externalClubId: string;
        revenueDate: Date;
        totalRevenue: Prisma.Decimal;
      }
    >();

    for (const operation of operations) {
      const totalRevenue = this.operationRevenue(operation);

      if (totalRevenue.lte(0)) {
        continue;
      }

      const externalClubId =
        operation.club_id === null ? null : String(operation.club_id);
      const storeId = externalClubId
        ? storesByExternalClubId.get(externalClubId)
        : null;
      const resolvedStoreId = storeId ?? null;

      if (!externalClubId || (!resolvedStoreId && externalClubId !== '0')) {
        continue;
      }

      const revenueDate = this.startOfUtcDay(
        this.parseLangameDate(operation.date_normal),
      );
      const key = `${resolvedStoreId ?? externalClubId}:${revenueDate.toISOString()}`;
      const current = revenueByStoreAndDate.get(key) ?? {
        storeId: resolvedStoreId,
        externalClubId,
        revenueDate,
        totalRevenue: new Prisma.Decimal(0),
      };
      current.totalRevenue = current.totalRevenue.add(totalRevenue);
      revenueByStoreAndDate.set(key, current);
    }

    await this.prisma.clubRevenueFact.deleteMany({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
        revenueDate: {
          gte: this.startOfUtcDay(period.fromDate),
          lte: this.startOfUtcDay(period.toDate),
        },
      },
    });

    for (const item of revenueByStoreAndDate.values()) {
      await this.prisma.clubRevenueFact.upsert({
        where: {
          tenantId_externalProvider_externalDomain_externalClubId_revenueDate: {
            tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: domain,
            externalClubId: item.externalClubId,
            revenueDate: item.revenueDate,
          },
        },
        create: {
          tenantId,
          storeId: item.storeId,
          revenueDate: item.revenueDate,
          totalRevenue: item.totalRevenue,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalClubId: item.externalClubId,
        },
        update: {
          totalRevenue: item.totalRevenue,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalClubId: item.externalClubId,
        },
      });
    }

    return revenueByStoreAndDate.size;
  }

  private resolvePeriod(query: LangameSyncQuery) {
    const now = new Date();
    const mode = this.resolveMode(query.mode);
    const defaultTo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const toDate = query.dateTo
      ? this.parseDateInput(query.dateTo, 'dateTo')
      : defaultTo;
    const fromDate = query.dateFrom
      ? this.parseDateInput(query.dateFrom, 'dateFrom')
      : new Date(toDate);

    if (!query.dateFrom) {
      if (mode === 'QUICK' || mode === 'INVENTORY' || mode === 'CATALOG') {
        fromDate.setUTCDate(fromDate.getUTCDate());
      } else if (mode === 'FULL') {
        fromDate.setUTCFullYear(2022, 0, 1);
      } else {
        fromDate.setUTCDate(fromDate.getUTCDate() - 6);
      }
    }

    fromDate.setUTCHours(0, 0, 0, 0);
    toDate.setUTCHours(23, 59, 59, 999);

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

  private resolveSourcePeriod(
    query: LangameSyncQuery,
    requestedPeriod: ResolvedSyncPeriod,
    lastSyncedDate: Date | null,
  ) {
    if (!query.catchUp) {
      return requestedPeriod;
    }

    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const fromDate = lastSyncedDate
      ? this.startOfUtcDay(lastSyncedDate)
      : new Date(today);

    if (lastSyncedDate && fromDate >= today) {
      return null;
    }

    const toDate = new Date(today);
    fromDate.setUTCHours(0, 0, 0, 0);
    toDate.setUTCHours(23, 59, 59, 999);

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
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(
      value,
    );

    if (!match) {
      throw new BadRequestException(`Invalid LAngame date: ${value}`);
    }

    return new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6]),
      ),
    );
  }

  private operationRevenue(operation: LangameOperationLog) {
    if (operation.type !== 'plus') {
      return new Prisma.Decimal(0);
    }

    return new Prisma.Decimal(operation.sum ?? 0);
  }

  private startOfUtcDay(date: Date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private maxSyncedDate(current: Date | null, next: Date) {
    const nextDay = this.startOfUtcDay(next);

    if (!current) {
      return nextDay;
    }

    const currentDay = this.startOfUtcDay(current);

    return currentDay > nextDay ? currentDay : nextDay;
  }

  private splitPeriodByLangameLimit(period: { from: string; to: string }) {
    return this.splitPeriodByDays(period, MAX_LANGAME_PERIOD_DAYS);
  }

  private splitPeriodByDays(
    period: { from: string; to: string },
    maxDays: number,
  ) {
    const chunks: { from: string; to: string }[] = [];
    let cursor = this.parseDateInput(period.from, 'dateFrom');
    const end = this.parseDateInput(period.to, 'dateTo');

    while (cursor <= end) {
      const chunkEnd = new Date(cursor);
      chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);

      if (chunkEnd > end) {
        chunkEnd.setTime(end.getTime());
      }

      chunks.push({
        from: this.toDateInputValue(cursor),
        to: this.toDateInputValue(chunkEnd),
      });
      cursor = new Date(chunkEnd);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return chunks;
  }

  private toLangameOperationDateValue(value: string) {
    const [year, month, day] = value.split('-');

    return `${day}.${month}.${year}`;
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
