import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [
      tenants,
      usersCount,
      storesCount,
      productsCount,
      salesFactsCount,
      integrationSourcesCount,
      recentSyncJobs,
    ] = await Promise.all([
      this.prisma.tenant.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              users: true,
              stores: true,
              products: true,
              salesFacts: true,
            },
          },
          integrationSources: {
            where: { provider: IntegrationProvider.LANGAME },
            select: {
              domain: true,
              isActive: true,
              lastSyncedAt: true,
            },
            orderBy: { domain: 'asc' },
          },
        },
      }),
      this.prisma.user.count(),
      this.prisma.store.count(),
      this.prisma.product.count(),
      this.prisma.salesFact.count(),
      this.prisma.integrationSource.count({
        where: { provider: IntegrationProvider.LANGAME },
      }),
      this.prisma.integrationSyncJob.findMany({
        where: { provider: IntegrationProvider.LANGAME },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      totals: {
        tenants: tenants.length,
        users: usersCount,
        stores: storesCount,
        products: productsCount,
        salesFacts: salesFactsCount,
        integrationSources: integrationSourcesCount,
      },
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        usersCount: tenant._count.users,
        storesCount: tenant._count.stores,
        productsCount: tenant._count.products,
        salesFactsCount: tenant._count.salesFacts,
        langameSources: tenant.integrationSources.map((source) => ({
          domain: source.domain,
          isActive: source.isActive,
          lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
        })),
      })),
      recentSyncJobs: recentSyncJobs.map((job) => ({
        id: job.id,
        tenantId: job.tenantId,
        domain: job.domain,
        status: job.status,
        mode: job.mode,
        trigger: job.trigger,
        startedAt: job.startedAt.toISOString(),
        finishedAt: job.finishedAt?.toISOString() ?? null,
        storesCount: job.storesCount,
        productsCount: job.productsCount,
        inventoryCount: job.inventoryCount,
        salesCount: job.salesCount,
        discrepancyCount: job.discrepancyCount,
        errorMessage: job.errorMessage,
      })),
    };
  }
}
