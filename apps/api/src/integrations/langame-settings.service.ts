import { BadRequestException, Injectable } from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { LangameClient } from './langame.client';
import { SecretEncryptionService } from './secret-encryption.service';
import type {
  LangameGuestSearchDiagnosticsResult,
  LangameGuestSearchField,
  LangameGuestSearchQuery,
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

  async searchGuestDiagnostics(
    user: AuthenticatedUser,
    dto: LangameGuestSearchQuery,
  ): Promise<LangameGuestSearchDiagnosticsResult> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const { apiKey, sources } = await this.resolveTenantAccess(tenantId);
    const query = dto.query?.trim();

    if (!query || query.length < 2) {
      throw new BadRequestException(
        'Укажите минимум 2 символа для точечного поиска гостя',
      );
    }

    const selectedField = this.normalizeGuestSearchField(dto.field);
    const queryField =
      selectedField === 'auto'
        ? this.detectGuestSearchField(query)
        : selectedField;
    const requestPayload = this.buildGuestSearchPayload(query, queryField);
    const filteredSources = sources.filter((source) => {
      if (dto.sourceId) {
        return source.id === dto.sourceId;
      }

      if (dto.sourceDomain) {
        return source.domain === dto.sourceDomain;
      }

      return true;
    });

    if (filteredSources.length === 0) {
      throw new BadRequestException('Langame source for search is not found');
    }

    const checkedAt = new Date().toISOString();
    const diagnostics = await Promise.all(
      filteredSources.map(async (source) => {
        try {
          const payload = await this.langameClient.searchGuests(
            source.baseUrl,
            apiKey,
            requestPayload,
          );
          const rows = this.extractGuestSearchRows(payload);

          return {
            id: source.id,
            name: source.name,
            domain: source.domain,
            baseUrl: source.baseUrl,
            status: 'SUCCESS' as const,
            requestKeys: Object.keys(requestPayload),
            resultsCount: rows.length,
            results: rows
              .slice(0, 10)
              .map((row) => this.toGuestSearchResultItem(row)),
            payloadPreview: this.sanitizeGuestSearchPayload(payload),
            errorMessage: null,
          };
        } catch (error) {
          return {
            id: source.id,
            name: source.name,
            domain: source.domain,
            baseUrl: source.baseUrl,
            status: 'FAILED' as const,
            requestKeys: Object.keys(requestPayload),
            resultsCount: 0,
            results: [],
            payloadPreview: null,
            errorMessage:
              error instanceof Error
                ? error.message
                : 'Unknown Langame guests/search diagnostics error',
          };
        }
      }),
    );

    return {
      checkedAt,
      queryField,
      sources: diagnostics,
    };
  }

  private normalizeGuestSearchField(
    field?: LangameGuestSearchField,
  ): LangameGuestSearchField {
    const allowed: LangameGuestSearchField[] = [
      'auto',
      'phone',
      'email',
      'guest_id',
      'fio',
      'bonus_program_number',
    ];

    return field && allowed.includes(field) ? field : 'auto';
  }

  private detectGuestSearchField(query: string): LangameGuestSearchField {
    const normalized = query.trim();

    if (normalized.includes('@')) {
      return 'email';
    }

    const digits = normalized.replace(/\D/g, '');

    if (digits.length >= 7) {
      return 'phone';
    }

    if (/^\d+$/.test(normalized)) {
      return 'guest_id';
    }

    return 'fio';
  }

  private buildGuestSearchPayload(
    query: string,
    field: LangameGuestSearchField,
  ) {
    const normalizedQuery = query.trim();
    const payload: Record<string, string> = {
      search: normalizedQuery,
    };

    if (field === 'phone') {
      payload.phone = normalizedQuery.replace(/\D/g, '') || normalizedQuery;
    } else if (field === 'email') {
      payload.email = normalizedQuery;
    } else if (field === 'guest_id') {
      payload.guest_id = normalizedQuery;
    } else if (field === 'fio') {
      payload.fio = normalizedQuery;
    } else if (field === 'bonus_program_number') {
      payload.bonus_program_number = normalizedQuery;
    }

    return payload;
  }

  private extractGuestSearchRows(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload.filter((item) => this.isPlainObject(item));
    }

    if (!this.isPlainObject(payload)) {
      return [];
    }

    if (this.looksLikeGuestRow(payload)) {
      return [payload];
    }

    const rowKeys = ['data', 'guests', 'items', 'results', 'result'];

    for (const key of rowKeys) {
      const value = payload[key];

      if (Array.isArray(value)) {
        return value.filter((item) => this.isPlainObject(item));
      }

      if (this.isPlainObject(value) && this.looksLikeGuestRow(value)) {
        return [value];
      }
    }

    return [];
  }

  private looksLikeGuestRow(row: Record<string, unknown>) {
    return Boolean(
      row.guest_id ??
      row.id ??
      row.real_guest_id ??
      row.phone ??
      row.email ??
      row.fio,
    );
  }

  private toGuestSearchResultItem(row: Record<string, unknown>) {
    return {
      externalGuestId: this.firstValueString(row, [
        'guest_id',
        'real_guest_id',
        'id',
      ]),
      guestTypeId: this.firstValueString(row, ['guest_type_id', 'type_id']),
      phoneMasked: this.maskPhone(this.firstValueString(row, ['phone'])),
      emailMasked: this.maskEmail(this.firstValueString(row, ['email'])),
      fullNameMasked: this.maskName(
        this.firstValueString(row, ['fio', 'full_name', 'name']),
      ),
      bonusProgramNumberMasked: this.maskGeneric(
        this.firstValueString(row, ['bonus_program_number']),
      ),
      dateLastActivity: this.firstValueString(row, [
        'date_last_activity',
        'last_activity_at',
        'updated_at',
      ]),
      rawKeys: Object.keys(row).slice(0, 30),
    };
  }

  private sanitizeGuestSearchPayload(value: unknown, depth = 0): unknown {
    if (depth > 5) {
      return '[depth-limit]';
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 5)
        .map((item) => this.sanitizeGuestSearchPayload(item, depth + 1));
    }

    if (!this.isPlainObject(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        this.isGuestSensitiveField(key)
          ? this.maskSensitiveValue(key, entry)
          : this.sanitizeGuestSearchPayload(entry, depth + 1),
      ]),
    );
  }

  private firstValueString(payload: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = payload[key];
      const stringValue = this.scalarToString(value);

      if (stringValue) {
        return stringValue;
      }
    }

    return null;
  }

  private maskSensitiveValue(field: string, value: unknown) {
    const stringValue = this.scalarToString(value);

    if (!stringValue) {
      return null;
    }

    if (/phone/i.test(field)) {
      return this.maskPhone(stringValue);
    }

    if (/email/i.test(field)) {
      return this.maskEmail(stringValue);
    }

    if (/fio|name/i.test(field)) {
      return this.maskName(stringValue);
    }

    return this.maskGeneric(stringValue);
  }

  private scalarToString(value: unknown) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value).trim();
    }

    return null;
  }

  private maskPhone(value: string | null) {
    if (!value) {
      return null;
    }

    const digits = value.replace(/\D/g, '');
    const tail = digits.slice(-4);

    return tail ? `***${tail}` : '***';
  }

  private maskEmail(value: string | null) {
    if (!value) {
      return null;
    }

    const [localPart, domain] = value.split('@');

    if (!domain) {
      return this.maskGeneric(value);
    }

    return `${localPart.slice(0, 1)}***@${domain}`;
  }

  private maskName(value: string | null) {
    if (!value) {
      return null;
    }

    return `${value.slice(0, 2)}***`;
  }

  private maskGeneric(value: string | null) {
    if (!value) {
      return null;
    }

    if (value.length <= 4) {
      return '***';
    }

    return `***${value.slice(-4)}`;
  }

  private isGuestSensitiveField(field: string) {
    return /phone|email|fio|full[_-]?name|name|birthday|document|passport|identity|bonus[_-]?program/i.test(
      field,
    );
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
