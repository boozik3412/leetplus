import { BadRequestException, Injectable } from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { SecretEncryptionService } from './secret-encryption.service';

const CREDENTIAL_NAME = 'LAngame API key';

export type LangameSettingsDto = {
  apiKey?: string;
  domains?: string[];
};

@Injectable()
export class LangameSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly secretEncryptionService: SecretEncryptionService,
  ) {}

  async getSettings(user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const [credential, sources, syncJobs] = await Promise.all([
      this.findCredential(tenantId),
      this.prisma.integrationSource.findMany({
        where: {
          tenantId,
          provider: IntegrationProvider.LANGAME,
        },
        orderBy: { domain: 'asc' },
      }),
      this.prisma.integrationSyncJob.findMany({
        where: {
          tenantId,
          provider: IntegrationProvider.LANGAME,
        },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      hasApiKey: Boolean(credential?.apiKeyEncrypted),
      domains: sources
        .filter((source) => source.isActive)
        .map((source) => source.domain),
      sources: sources.map((source) => ({
        id: source.id,
        name: source.name,
        domain: source.domain,
        baseUrl: source.baseUrl,
        isActive: source.isActive,
        lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
      })),
      syncJobs: syncJobs.map((job) => ({
        id: job.id,
        domain: job.domain,
        status: job.status,
        startedAt: job.startedAt.toISOString(),
        finishedAt: job.finishedAt?.toISOString() ?? null,
        storesCount: job.storesCount,
        productsCount: job.productsCount,
        inventoryCount: job.inventoryCount,
        salesCount: job.salesCount,
        discrepancyCount: job.discrepancyCount,
        hasDiscrepancyLog: Boolean(job.discrepancyLogPath),
        errorMessage: job.errorMessage,
      })),
    };
  }

  async saveSettings(user: AuthenticatedUser, dto: LangameSettingsDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const domains = this.normalizeDomains(dto.domains ?? []);
    const apiKey = dto.apiKey?.trim();

    if (domains.length === 0) {
      throw new BadRequestException('At least one LAngame domain is required');
    }

    const existingCredential = await this.findCredential(tenantId);

    if (!apiKey && !existingCredential?.apiKeyEncrypted) {
      throw new BadRequestException('LAngame API key is required');
    }

    const credential = await this.prisma.integrationCredential.upsert({
      where: {
        tenantId_provider_name: {
          tenantId,
          provider: IntegrationProvider.LANGAME,
          name: CREDENTIAL_NAME,
        },
      },
      create: {
        tenantId,
        provider: IntegrationProvider.LANGAME,
        name: CREDENTIAL_NAME,
        apiKeyEncrypted: apiKey
          ? this.secretEncryptionService.encrypt(apiKey)
          : null,
      },
      update: {
        ...(apiKey
          ? {
              apiKeyEncrypted: this.secretEncryptionService.encrypt(apiKey),
              apiKeyEnvVar: null,
            }
          : {}),
        isActive: true,
      },
    });

    await this.prisma.integrationSource.updateMany({
      where: {
        tenantId,
        provider: IntegrationProvider.LANGAME,
        domain: { notIn: domains },
      },
      data: { isActive: false },
    });

    for (const domain of domains) {
      await this.prisma.integrationSource.upsert({
        where: {
          tenantId_provider_domain: {
            tenantId,
            provider: IntegrationProvider.LANGAME,
            domain,
          },
        },
        create: {
          tenantId,
          credentialId: credential.id,
          provider: IntegrationProvider.LANGAME,
          name: domain,
          domain,
          baseUrl: `https://${domain}/public_api`,
          isActive: true,
        },
        update: {
          credentialId: credential.id,
          baseUrl: `https://${domain}/public_api`,
          isActive: true,
        },
      });
    }

    return this.getSettings(user);
  }

  async resolveTenantAccess(tenantId: string) {
    const credential = await this.findCredential(tenantId);

    if (!credential) {
      throw new BadRequestException('LAngame integration is not configured');
    }

    const apiKey = credential.apiKeyEncrypted
      ? this.secretEncryptionService.decrypt(credential.apiKeyEncrypted)
      : null;

    if (!apiKey) {
      throw new BadRequestException('LAngame API key is not configured');
    }

    const sources = await this.prisma.integrationSource.findMany({
      where: {
        tenantId,
        credentialId: credential.id,
        provider: IntegrationProvider.LANGAME,
        isActive: true,
      },
      orderBy: { domain: 'asc' },
    });

    if (sources.length === 0) {
      throw new BadRequestException('LAngame domains are not configured');
    }

    return { apiKey, sources };
  }

  async getDiscrepancyLog(user: AuthenticatedUser, syncJobId: string) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const syncJob = await this.prisma.integrationSyncJob.findFirst({
      where: {
        id: syncJobId,
        tenantId,
        provider: IntegrationProvider.LANGAME,
      },
      select: {
        discrepancyLogPath: true,
      },
    });

    if (!syncJob?.discrepancyLogPath) {
      throw new BadRequestException('Discrepancy log is not available');
    }

    return JSON.parse(
      await readFile(syncJob.discrepancyLogPath, 'utf8'),
    ) as unknown;
  }

  private findCredential(tenantId: string) {
    return this.prisma.integrationCredential.findFirst({
      where: {
        tenantId,
        provider: IntegrationProvider.LANGAME,
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private normalizeDomains(domains: string[]) {
    return [
      ...new Set(
        domains
          .map((domain) => domain.trim().replace(/^https?:\/\//, ''))
          .map((domain) => domain.replace(/\/.*$/, '').toLowerCase())
          .filter(Boolean),
      ),
    ];
  }
}
