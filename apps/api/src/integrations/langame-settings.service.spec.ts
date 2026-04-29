import { IntegrationProvider, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
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
      findMany: jest.fn(),
    },
  };
}

describe('LangameSettingsService', () => {
  let prisma: PrismaMock;
  let tenantContext: TenantContextMock;
  let encryption: EncryptionMock;
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
    prisma.integrationSyncJob.findMany.mockResolvedValue([]);
    service = new LangameSettingsService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
      encryption as unknown as SecretEncryptionService,
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
});
