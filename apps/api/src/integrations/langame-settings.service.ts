import { BadRequestException, Injectable } from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { LangameClient } from './langame.client';
import { SecretEncryptionService } from './secret-encryption.service';
import type {
  LangameRouteSummary,
  LangameRoutesDiagnosticsResult,
} from './langame.types';

const CREDENTIAL_NAME = 'Langame API key';

export type LangameSettingsDto = {
  tenantName?: string;
  apiKey?: string;
  domains?: string[];
};

@Injectable()
export class LangameSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly secretEncryptionService: SecretEncryptionService,
    private readonly langameClient: LangameClient,
  ) {}

  async getSettings(user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const [tenant, credential, sources, syncJobs, latestSuccessfulSyncJob] =
      await Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        }),
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
        this.prisma.integrationSyncJob.findFirst({
          where: {
            tenantId,
            provider: IntegrationProvider.LANGAME,
            status: 'SUCCESS',
          },
          orderBy: { startedAt: 'desc' },
        }),
      ]);
    const mapSyncJob = (job: (typeof syncJobs)[number]) => ({
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
    });

    return {
      tenantName: tenant?.name ?? '',
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
        lastSyncedDate: source.lastSyncedDate?.toISOString() ?? null,
      })),
      syncJobs: syncJobs.map(mapSyncJob),
      latestSuccessfulSyncJob: latestSuccessfulSyncJob
        ? mapSyncJob(latestSuccessfulSyncJob)
        : null,
    };
  }

  async saveSettings(user: AuthenticatedUser, dto: LangameSettingsDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const domains = this.normalizeDomains(dto.domains ?? []);
    const apiKey = dto.apiKey?.trim();
    const tenantName = dto.tenantName?.trim();

    if (domains.length === 0) {
      throw new BadRequestException('At least one Langame domain is required');
    }

    const existingCredential = await this.findCredential(tenantId);

    if (!apiKey && !existingCredential?.apiKeyEncrypted) {
      throw new BadRequestException('Langame API key is required');
    }

    if (tenantName) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { name: tenantName },
      });
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
      throw new BadRequestException('Langame integration is not configured');
    }

    const apiKey = credential.apiKeyEncrypted
      ? this.secretEncryptionService.decrypt(credential.apiKeyEncrypted)
      : null;

    if (!apiKey) {
      throw new BadRequestException('Langame API key is not configured');
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
      throw new BadRequestException('Langame domains are not configured');
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

  async getRoutesDiagnostics(
    user: AuthenticatedUser,
  ): Promise<LangameRoutesDiagnosticsResult> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const { apiKey, sources } = await this.resolveTenantAccess(tenantId);
    const checkedAt = new Date().toISOString();
    const diagnostics = await Promise.all(
      sources.map(async (source) => {
        try {
          const payload = this.sanitizePayload(
            await this.langameClient.getRoutes(source.baseUrl, apiKey),
          );
          const routeRows = this.extractRoutes(payload);
          const routes = routeRows.map((route) => this.toRouteSummary(route));

          return {
            id: source.id,
            name: source.name,
            domain: source.domain,
            baseUrl: source.baseUrl,
            status: 'SUCCESS' as const,
            routesCount: routes.length,
            routes,
            payload,
            errorMessage: null,
          };
        } catch (error) {
          return {
            id: source.id,
            name: source.name,
            domain: source.domain,
            baseUrl: source.baseUrl,
            status: 'FAILED' as const,
            routesCount: 0,
            routes: [],
            payload: null,
            errorMessage:
              error instanceof Error
                ? error.message
                : 'Unknown Langame routes diagnostics error',
          };
        }
      }),
    );

    return {
      checkedAt,
      sources: diagnostics,
    };
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
    const normalized = [
      ...new Set(
        domains
          .map((domain) => domain.trim().replace(/^https?:\/\//, ''))
          .map((domain) => domain.replace(/\/.*$/, '').toLowerCase())
          .filter(Boolean),
      ),
    ];
    const invalidDomain = normalized.find(
      (domain) =>
        !/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(domain) ||
        domain.includes('..'),
    );

    if (invalidDomain) {
      throw new BadRequestException(
        `Invalid Langame domain: ${invalidDomain}. Use domains like 1337.langame.ru without protocol or path.`,
      );
    }

    return normalized;
  }

  private extractRoutes(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (!this.isPlainObject(payload)) {
      return [];
    }

    const routeKeys = [
      'data',
      'routes',
      'items',
      'result',
      'availableRoutes',
      'available_routes',
    ];

    for (const key of routeKeys) {
      const value = payload[key];

      if (Array.isArray(value)) {
        return value;
      }
    }

    return [];
  }

  private toRouteSummary(route: unknown): LangameRouteSummary {
    if (typeof route === 'string') {
      return {
        method: null,
        path: route,
        name: null,
        params: null,
        raw: route,
      };
    }

    if (!this.isPlainObject(route)) {
      return {
        method: null,
        path: null,
        name: null,
        params: null,
        raw: route,
      };
    }

    return {
      method: this.firstString(route, [
        'method',
        'httpMethod',
        'http_method',
        'verb',
      ]),
      path: this.firstString(route, [
        'path',
        'route',
        'uri',
        'url',
        'endpoint',
      ]),
      name: this.firstString(route, ['name', 'title', 'description']),
      params:
        route.params ??
        route.parameters ??
        route.query ??
        route.required_params ??
        null,
      raw: route,
    };
  }

  private sanitizePayload(value: unknown, depth = 0): unknown {
    if (depth > 8) {
      return '[depth-limit]';
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizePayload(item, depth + 1));
    }

    if (!this.isPlainObject(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        this.isSensitiveField(key)
          ? '[hidden]'
          : this.sanitizePayload(entry, depth + 1),
      ]),
    );
  }

  private firstString(payload: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = payload[key];

      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    return null;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isSensitiveField(field: string) {
    return /api[_-]?key|token|secret|password|credential|authorization/i.test(
      field,
    );
  }
}
