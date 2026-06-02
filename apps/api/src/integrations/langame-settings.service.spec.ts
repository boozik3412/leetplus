import { IntegrationProvider, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { LangameClient } from './langame.client';
import { LangameSettingsService } from './langame-settings.service';
import { SecretEncryptionService } from './secret-encryption.service';

type PrismaMock = {
  tenant: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  integrationCredential: {
    findFirst: jest.Mock;
    upsert: jest.Mock;
  };
  integrationSource: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
    upsert: jest.Mock;
  };
  integrationSyncJob: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
  langameEndpointProfileRun: {
    createMany: jest.Mock;
    findMany: jest.Mock;
  };
};

type TenantContextMock = {
  resolve: jest.Mock;
};

type EncryptionMock = {
  encrypt: jest.Mock;
  decrypt: jest.Mock;
};

type LangameClientMock = {
  getRoutes: jest.Mock;
  getDiagnosticEndpoint: jest.Mock;
  searchGuests: jest.Mock;
};

type CredentialUpsertCall = [
  {
    create: {
      apiKeyEncrypted?: string | null;
    };
    update: {
      apiKeyEncrypted?: string;
      apiKeyEnvVar?: string | null;
    };
  },
];

const user: AuthenticatedUser = {
  id: 'user-1',
  email: 'owner@example.com',
  fullName: null,
  role: UserRole.OWNER,
  tenantId: 'tenant-1',
  tenantSlug: 'demo',
};

function createPrismaMock(): PrismaMock {
  return {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    integrationCredential: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    integrationSource: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    integrationSyncJob: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    langameEndpointProfileRun: {
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

describe('LangameSettingsService', () => {
  let prisma: PrismaMock;
  let tenantContext: TenantContextMock;
  let encryption: EncryptionMock;
  let langameClient: LangameClientMock;
  let service: LangameSettingsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tenantContext = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        tenantSlug: 'demo',
      }),
    };
    encryption = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn((value: string) => value.replace('encrypted:', '')),
    };
    langameClient = {
      getRoutes: jest.fn(),
      getDiagnosticEndpoint: jest.fn(),
      searchGuests: jest.fn(),
    };
    prisma.tenant.findUnique.mockResolvedValue({
      name: 'Demo Cyber Club',
    });
    prisma.tenant.update.mockResolvedValue({
      id: 'tenant-1',
      name: 'Demo Cyber Club',
    });
    prisma.integrationCredential.findFirst.mockResolvedValue(null);
    prisma.integrationCredential.upsert.mockResolvedValue({
      id: 'credential-1',
      apiKeyEncrypted: 'encrypted:key',
    });
    prisma.integrationSource.findMany.mockResolvedValue([
      {
        id: 'source-1',
        name: '443.langame.ru',
        domain: '443.langame.ru',
        baseUrl: 'https://443.langame.ru/public_api',
        isActive: true,
        lastSyncedAt: null,
      },
    ]);
    prisma.integrationSyncJob.findFirst.mockResolvedValue(null);
    prisma.integrationSyncJob.findMany.mockResolvedValue([]);
    prisma.langameEndpointProfileRun.findMany.mockResolvedValue([]);
    prisma.langameEndpointProfileRun.createMany.mockResolvedValue({ count: 1 });
    service = new LangameSettingsService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
      encryption as unknown as SecretEncryptionService,
      langameClient as unknown as LangameClient,
    );
  });

  it('saves encrypted API key and active domains for tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      name: 'F5',
    });
    prisma.integrationCredential.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'credential-1',
        apiKeyEncrypted: 'encrypted:secret-key',
      });

    await expect(
      service.saveSettings(user, {
        tenantName: 'F5',
        apiKey: 'secret-key',
        domains: ['https://443.langame.ru/public_api', '46.langamepro.ru'],
      }),
    ).resolves.toMatchObject({
      hasApiKey: true,
      tenantName: 'F5',
      domains: ['443.langame.ru'],
    });
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { name: 'F5' },
    });
    expect(encryption.encrypt).toHaveBeenCalledWith('secret-key');
    const [credentialUpsert] = prisma.integrationCredential.upsert.mock
      .calls[0] as CredentialUpsertCall;
    expect(credentialUpsert.create.apiKeyEncrypted).toBe(
      'encrypted:secret-key',
    );
    expect(credentialUpsert.update.apiKeyEncrypted).toBe(
      'encrypted:secret-key',
    );
    expect(credentialUpsert.update.apiKeyEnvVar).toBeNull();
    expect(prisma.integrationSource.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.integrationSource.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        provider: IntegrationProvider.LANGAME,
        domain: { notIn: ['443.langame.ru', '46.langamepro.ru'] },
      },
      data: { isActive: false },
    });
  });

  it('resolves decrypted access for sync', async () => {
    prisma.integrationCredential.findFirst.mockResolvedValue({
      id: 'credential-1',
      apiKeyEncrypted: 'encrypted:secret-key',
    });

    await expect(service.resolveTenantAccess('tenant-1')).resolves.toEqual({
      apiKey: 'secret-key',
      sources: [
        {
          id: 'source-1',
          name: '443.langame.ru',
          domain: '443.langame.ru',
          baseUrl: 'https://443.langame.ru/public_api',
          isActive: true,
          lastSyncedAt: null,
        },
      ],
    });
  });

  it('returns latest endpoint profile quality summaries in settings', async () => {
    prisma.langameEndpointProfileRun.findMany.mockResolvedValue([
      {
        id: 'profile-1',
        domain: '443.langame.ru',
        endpointKey: 'guestSessions',
        endpointPath: '/guests/sessions',
        group: 'guests',
        status: 'SUCCESS',
        checkedAt: new Date('2026-06-02T08:00:00.000Z'),
        dateFrom: new Date('2026-06-01T00:00:00.000Z'),
        dateTo: new Date('2026-06-02T00:00:00.000Z'),
        requestParams: {
          page: '1',
          page_limit: '20',
        },
        rowCount: 20,
        payloadKind: 'object',
        fieldKeys: ['guest_id', 'date_start'],
        profile: {
          summary: 'events=visit:20',
        },
        errorMessage: null,
      },
    ]);

    await expect(service.getSettings(user)).resolves.toMatchObject({
      endpointProfiles: [
        {
          id: 'profile-1',
          domain: '443.langame.ru',
          endpointKey: 'guestSessions',
          endpointPath: '/guests/sessions',
          group: 'guests',
          status: 'SUCCESS',
          checkedAt: '2026-06-02T08:00:00.000Z',
          dateFrom: '2026-06-01T00:00:00.000Z',
          dateTo: '2026-06-02T00:00:00.000Z',
          rowCount: 20,
          payloadKind: 'object',
          fieldKeys: ['guest_id', 'date_start'],
          summary: 'events=visit:20',
          errorMessage: null,
        },
      ],
    });
  });

  it('returns sanitized routes diagnostics without leaking credentials', async () => {
    prisma.integrationCredential.findFirst.mockResolvedValue({
      id: 'credential-1',
      apiKeyEncrypted: 'encrypted:secret-key',
    });
    langameClient.getRoutes.mockResolvedValue({
      status: true,
      apiKey: 'must-not-leak',
      data: [
        {
          method: 'GET',
          path: '/transactions/list',
          token: 'also-hidden',
          params: ['date_from', 'date_to'],
        },
      ],
    });

    await expect(service.getRoutesDiagnostics(user)).resolves.toMatchObject({
      sources: [
        {
          domain: '443.langame.ru',
          status: 'SUCCESS',
          routesCount: 1,
          routes: [
            {
              method: 'GET',
              path: '/transactions/list',
              params: ['date_from', 'date_to'],
            },
          ],
          payload: {
            apiKey: '[hidden]',
            data: [
              {
                token: '[hidden]',
              },
            ],
          },
        },
      ],
    });
    expect(langameClient.getRoutes).toHaveBeenCalledWith(
      'https://443.langame.ru/public_api',
      'secret-key',
    );
  });

  it('profiles service diagnostics without leaking secret config fields', async () => {
    prisma.integrationCredential.findFirst.mockResolvedValue({
      id: 'credential-1',
      apiKeyEncrypted: 'encrypted:secret-key',
    });
    langameClient.getDiagnosticEndpoint.mockImplementation(
      (_baseUrl: string, _apiKey: string, path: string) => {
        if (path === '/config/list') {
          return Promise.resolve({
            status: true,
            data: [
              {
                module: 'terminal',
                enabled: true,
                api_key: 'must-not-leak',
                password: 'also-hidden',
              },
            ],
          });
        }

        if (path === '/ver/get_po') {
          return Promise.resolve({
            status: true,
            data: {
              version: '2.3.4',
            },
          });
        }

        return Promise.resolve({
          status: true,
          data: [],
        });
      },
    );

    const result = await service.getServiceDiagnostics(user);

    expect(result.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'config',
          path: '/config/list',
        }),
        expect.objectContaining({
          key: 'softwareVersion',
          path: '/ver/get_po',
        }),
      ]),
    );
    expect(result.sources[0]).toMatchObject({
      domain: '443.langame.ru',
      status: 'SUCCESS',
    });
    const configEndpoint = result.sources[0].endpoints.find(
      (endpoint) => endpoint.key === 'config',
    );
    const softwareVersionEndpoint = result.sources[0].endpoints.find(
      (endpoint) => endpoint.key === 'softwareVersion',
    );

    expect(configEndpoint).toMatchObject({
      key: 'config',
      status: 'SUCCESS',
      rowCount: 1,
      payloadKind: 'object',
      payloadPreview: {
        status: true,
        data: [
          {
            module: 'terminal',
            enabled: true,
            api_key: '[hidden]',
            password: '[hidden]',
          },
        ],
      },
    });
    expect(configEndpoint?.fieldKeys).toEqual(
      expect.arrayContaining(['module', 'enabled', 'api_key', 'password']),
    );
    expect(softwareVersionEndpoint).toMatchObject({
      key: 'softwareVersion',
      status: 'SUCCESS',
      summary: '2.3.4',
    });
    expect(langameClient.getDiagnosticEndpoint).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(JSON.stringify(result)).not.toContain('also-hidden');
  });

  it('profiles selected Langame GET endpoint with params and masked personal preview', async () => {
    prisma.integrationCredential.findFirst.mockResolvedValue({
      id: 'credential-1',
      apiKeyEncrypted: 'encrypted:secret-key',
    });
    langameClient.getDiagnosticEndpoint.mockResolvedValue({
      status: true,
      data: [
        {
          guest_id: 123,
          phone: '+7 999 123-45-67',
          fio: 'Иван Петров',
          date_start: '2026-06-01 10:00:00',
        },
      ],
    });

    const result = await service.getEndpointProfileDiagnostics(user, {
      endpointKey: 'guestSessions',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-02',
      page: 2,
      pageLimit: 99,
    });

    expect(result.endpoint).toMatchObject({
      key: 'guestSessions',
      path: '/guests/sessions',
    });
    expect(result.sources[0]).toMatchObject({
      domain: '443.langame.ru',
      status: 'SUCCESS',
      path: '/guests/sessions',
      requestParams: {
        page: '2',
        page_limit: '50',
        date_from: '2026-06-01',
        date_to: '2026-06-02',
      },
      rowCount: 1,
      payloadKind: 'object',
    });
    expect(result.sources[0].fieldKeys).toEqual(
      expect.arrayContaining(['guest_id', 'phone', 'fio', 'date_start']),
    );
    expect(JSON.stringify(result)).not.toContain('+7 999 123-45-67');
    expect(JSON.stringify(result)).not.toContain('Иван Петров');
    expect(langameClient.getDiagnosticEndpoint).toHaveBeenCalledWith(
      'https://443.langame.ru/public_api',
      'secret-key',
      '/guests/sessions',
      {
        page: '2',
        page_limit: '50',
        date_from: '2026-06-01',
        date_to: '2026-06-02',
      },
    );
    expect(prisma.langameEndpointProfileRun.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: 'tenant-1',
          integrationSourceId: 'source-1',
          provider: IntegrationProvider.LANGAME,
          domain: '443.langame.ru',
          endpointKey: 'guestSessions',
          endpointPath: '/guests/sessions',
          group: 'guests',
          status: 'SUCCESS',
          dateFrom: new Date('2026-06-01T00:00:00.000Z'),
          dateTo: new Date('2026-06-02T00:00:00.000Z'),
          rowCount: 1,
          payloadKind: 'object',
          fieldKeys: ['guest_id', 'phone', 'fio', 'date_start'],
          errorMessage: null,
        }),
      ],
    });
  });

  it('requires club id before profiling club-scoped Langame endpoints', async () => {
    prisma.integrationCredential.findFirst.mockResolvedValue({
      id: 'credential-1',
      apiKeyEncrypted: 'encrypted:secret-key',
    });
    langameClient.getDiagnosticEndpoint.mockClear();

    await expect(
      service.getEndpointProfileDiagnostics(user, {
        endpointKey: 'cashTransactions',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-02',
      }),
    ).rejects.toThrow('clubId is required');
    expect(langameClient.getDiagnosticEndpoint).not.toHaveBeenCalled();
  });

  it('runs masked guest search diagnostics for active Langame sources', async () => {
    prisma.integrationCredential.findFirst.mockResolvedValue({
      id: 'credential-1',
      apiKeyEncrypted: 'encrypted:secret-key',
    });
    langameClient.searchGuests.mockResolvedValue({
      status: true,
      data: [
        {
          guest_id: 123,
          guest_type_id: 5,
          phone: '+7 999 123-45-67',
          email: 'guest@example.com',
          fio: 'Иван Петров',
          bonus_program_number: '9988776655',
          date_last_activity: '2026-06-01',
        },
      ],
    });

    const result = await service.searchGuestDiagnostics(user, {
      query: '+7 999 123-45-67',
      field: 'phone',
    });

    expect(result).toMatchObject({
      queryField: 'phone',
      sources: [
        {
          domain: '443.langame.ru',
          status: 'SUCCESS',
          requestKeys: ['search', 'phone'],
          resultsCount: 1,
          results: [
            {
              externalGuestId: '123',
              guestTypeId: '5',
              phoneMasked: '***4567',
              emailMasked: 'g***@example.com',
              fullNameMasked: 'Ив***',
              bonusProgramNumberMasked: '***6655',
              dateLastActivity: '2026-06-01',
            },
          ],
        },
      ],
    });
    expect(langameClient.searchGuests).toHaveBeenCalledWith(
      'https://443.langame.ru/public_api',
      'secret-key',
      {
        search: '+7 999 123-45-67',
        phone: '79991234567',
      },
    );
    expect(JSON.stringify(result)).not.toContain('+7 999 123-45-67');
    expect(JSON.stringify(result)).not.toContain('guest@example.com');
    expect(JSON.stringify(result)).not.toContain('Иван Петров');
  });
});
