import { UserRole } from '@prisma/client';
import { createHmac } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { LangameOnboardingStagedService } from './langame-onboarding-staged.service';

const networkUser: AuthenticatedUser = {
  id: 'actor-user-0001',
  email: 'owner@example.com',
  fullName: null,
  role: UserRole.OWNER,
  isPlatformAdmin: false,
  tenantId: 'tenant-00000001',
  tenantSlug: 'external-club',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
};

const storeUser: AuthenticatedUser = {
  ...networkUser,
  accessScope: 'STORES',
  allowedStoreIds: ['store-00000001'],
};

const hmacSecret = 'test-only-hmac-secret-at-least-32-bytes';
const credentialDigest = hmacDigest([
  'LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1',
  'CREDENTIAL',
  networkUser.tenantId,
  'submitted-api-key',
]);
const configDigest = hmacDigest([
  'LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1',
  'CONFIG',
  networkUser.tenantId,
  networkUser.id,
  'request-0000000001',
  'store-00000001',
  '443.langame.ru',
  '42',
  credentialDigest,
]);
const expectedBindingDigest = hmacDigest([
  'LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1',
  'BINDING',
  networkUser.tenantId,
  'store-00000001',
  '443.langame.ru',
  '42',
  configDigest,
]);
const activationBindingDigest = hmacDigest([
  'LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1',
  'BINDING',
  networkUser.tenantId,
  'store-00000001',
  '443.langame.ru',
  '42',
  configDigest,
]);

describe('LangameOnboardingStagedService', () => {
  const prisma = {
    store: {
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  const config = {
    get: jest.fn(),
  };
  const langameClient = {
    getDiagnosticEndpoint: jest.fn(),
  };
  const encryption = {
    encrypt: jest.fn(),
  };
  let service: LangameOnboardingStagedService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string) => {
      if (key === 'LANGAME_STAGED_ONBOARDING_FOUNDATION_ENABLED') {
        return 'true';
      }
      if (key === 'LANGAME_STAGED_ONBOARDING_HMAC_SECRET') {
        return hmacSecret;
      }
      if (key === 'LANGAME_STAGED_ONBOARDING_ACTIVATION_CURRENT188_ENABLED') {
        return 'true';
      }
      return undefined;
    });
    prisma.store.findFirst.mockResolvedValue({ id: 'store-00000001' });
    prisma.$queryRaw.mockResolvedValue([
      {
        receiptId: 'receipt-00000001',
        status: 'PENDING',
        expiresAt: new Date('2026-08-05T12:15:00.000Z'),
        bindingDigest: expectedBindingDigest,
        replayed: false,
      },
    ]);
    langameClient.getDiagnosticEndpoint.mockResolvedValue({
      status: true,
      data: [
        {
          id: 42,
          name: 'External club',
          active: 1,
          api_key: 'upstream-must-not-leak',
        },
      ],
    });
    encryption.encrypt.mockReturnValue('opaque-encrypted-ciphertext');
    service = new LangameOnboardingStagedService(
      prisma as never,
      new AccessScopeService(),
      config as never,
      langameClient as never,
      encryption as never,
    );
  });

  it('denies STORES scope before configuration, database, or Langame access', async () => {
    await expect(service.preview(storeUser, validPreview())).rejects.toThrow(
      'Network access is required',
    );

    expect(config.get).not.toHaveBeenCalled();
    expect(prisma.store.findFirst).not.toHaveBeenCalled();
    expect(langameClient.getDiagnosticEndpoint).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('keeps the staged foundation default-off', async () => {
    config.get.mockReturnValue(undefined);

    await expect(service.preview(networkUser, validPreview())).rejects.toThrow(
      'Staged Langame onboarding foundation is disabled',
    );

    expect(prisma.store.findFirst).not.toHaveBeenCalled();
    expect(langameClient.getDiagnosticEndpoint).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('creates a digest-bound PII-free receipt without activation or sync', async () => {
    const result = await service.preview(networkUser, validPreview());

    expect(prisma.store.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'store-00000001',
        tenantId: 'tenant-00000001',
        isActive: true,
      },
      select: { id: true },
    });
    expect(langameClient.getDiagnosticEndpoint).toHaveBeenCalledTimes(1);
    expect(langameClient.getDiagnosticEndpoint).toHaveBeenCalledWith(
      'https://443.langame.ru/public_api',
      'submitted-api-key',
      '/clubs/list',
      {},
      { timeoutMs: 5_000 },
    );
    expect(encryption.encrypt).toHaveBeenCalledWith('submitted-api-key');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      contractVersion: 'LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1',
      receiptId: 'receipt-00000001',
      status: 'PENDING',
      expiresAt: '2026-08-05T12:15:00.000Z',
      bindingDigest: expectedBindingDigest,
      replayed: false,
      activationAvailable: false,
      externalSyncStarted: false,
    });
    expect(result.configDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('submitted-api-key');
    expect(JSON.stringify(result)).not.toContain('upstream-must-not-leak');
    expect(JSON.stringify(result)).not.toContain('External club');
  });

  it('rejects an unconfirmed external club without persisting a receipt', async () => {
    await expect(
      service.preview(networkUser, {
        ...validPreview(),
        externalClubId: '99',
      }),
    ).rejects.toThrow(
      'Selected Langame club was not confirmed by the diagnostic',
    );

    expect(encryption.encrypt).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not persist or leak a failed diagnostic', async () => {
    langameClient.getDiagnosticEndpoint.mockRejectedValue(
      new Error('upstream echoed submitted-api-key'),
    );

    await expect(service.preview(networkUser, validPreview())).rejects.toThrow(
      'Langame onboarding diagnostic failed',
    );

    expect(encryption.encrypt).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects a receipt row with any non-allowlisted field', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        receiptId: 'receipt-00000001',
        status: 'PENDING',
        expiresAt: new Date('2026-08-05T12:15:00.000Z'),
        bindingDigest: expectedBindingDigest,
        replayed: false,
        stagedApiKeyEncrypted: 'must-not-leak',
      },
    ]);

    await expect(service.preview(networkUser, validPreview())).rejects.toThrow(
      'Invalid staged Langame onboarding receipt',
    );
  });

  it('rejects a receipt whose DB binding differs from the requested binding', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        receiptId: 'receipt-00000001',
        status: 'PENDING',
        expiresAt: new Date('2026-08-05T12:15:00.000Z'),
        bindingDigest:
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        replayed: false,
      },
    ]);

    await expect(service.preview(networkUser, validPreview())).rejects.toThrow(
      'Invalid staged Langame onboarding receipt',
    );
  });

  it('keeps activation independently default-off before database access', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'LANGAME_STAGED_ONBOARDING_FOUNDATION_ENABLED') {
        return 'true';
      }
      if (key === 'LANGAME_STAGED_ONBOARDING_HMAC_SECRET') {
        return hmacSecret;
      }
      return undefined;
    });

    await expect(
      service.activate(networkUser, validActivation()),
    ).rejects.toThrow('CURRENT188 activation adapter is disabled');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects CURRENT188 activation in a production environment', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') {
        return 'production';
      }
      if (key === 'LANGAME_STAGED_ONBOARDING_FOUNDATION_ENABLED') {
        return 'true';
      }
      if (key === 'LANGAME_STAGED_ONBOARDING_HMAC_SECRET') {
        return hmacSecret;
      }
      if (key === 'LANGAME_STAGED_ONBOARDING_ACTIVATION_CURRENT188_ENABLED') {
        return 'true';
      }
      return undefined;
    });

    await expect(
      service.activate(networkUser, validActivation()),
    ).rejects.toThrow('CURRENT188 activation is not production-authorized');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('activates an exact HMAC-bound receipt without starting a sync', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        receiptId: 'receipt-00000001',
        status: 'ACTIVATED',
        consumedAt: new Date('2026-08-05T12:10:00.000Z'),
        claimDigest: activationBindingDigest,
        replayed: false,
      },
    ]);

    await expect(
      service.activate(networkUser, validActivation()),
    ).resolves.toEqual({
      contractVersion: 'LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1',
      receiptId: 'receipt-00000001',
      status: 'ACTIVATED',
      consumedAt: '2026-08-05T12:10:00.000Z',
      claimDigest: activationBindingDigest,
      replayed: false,
      externalSyncStarted: false,
      initialReadOnlySyncAvailable: false,
      productionActivationAllowed: false,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('accepts only a byte-equivalent activation replay receipt', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        receiptId: 'receipt-00000001',
        status: 'REPLAYED',
        consumedAt: new Date('2026-08-05T12:10:00.000Z'),
        claimDigest: activationBindingDigest,
        replayed: true,
      },
    ]);

    await expect(
      service.activate(networkUser, validActivation()),
    ).resolves.toMatchObject({
      status: 'REPLAYED',
      replayed: true,
      externalSyncStarted: false,
    });
  });

  it('rejects a changed or over-broad activation receipt', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        receiptId: 'receipt-00000001',
        status: 'ACTIVATED',
        consumedAt: new Date('2026-08-05T12:10:00.000Z'),
        claimDigest: 'a'.repeat(64),
        replayed: false,
        credential: 'must-not-leak',
      },
    ]);

    await expect(
      service.activate(networkUser, validActivation()),
    ).rejects.toThrow('Invalid staged Langame onboarding activation receipt');
  });

  it('denies STORES activation before configuration and database access', async () => {
    await expect(
      service.activate(storeUser, validActivation()),
    ).rejects.toThrow('Network access is required');
    expect(config.get).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

function validPreview() {
  return {
    requestId: 'request-0000000001',
    apiKey: 'submitted-api-key',
    domain: '443.langame.ru',
    storeId: 'store-00000001',
    externalClubId: '42',
  };
}

function validActivation() {
  return {
    receiptId: 'receipt-00000001',
    requestId: 'activate-request-0001',
    configDigest,
    storeId: 'store-00000001',
    domain: '443.langame.ru',
    externalClubId: '42',
  };
}

function hmacDigest(fields: readonly string[]) {
  return createHmac('sha256', hmacSecret)
    .update(JSON.stringify(fields), 'utf8')
    .digest('hex');
}
