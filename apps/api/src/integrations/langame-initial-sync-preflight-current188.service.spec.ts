import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service';
import type { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import type { LangameClient } from './langame.client';
import {
  LangameInitialSyncPreflightCurrent188Service,
  type LangameInitialSyncPreflightCurrent188Dto,
} from './langame-initial-sync-preflight-current188.service';
import type { SecretEncryptionService } from './secret-encryption.service';

const contract = 'LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1';
const hmacSecret = 'current188-preflight-test-secret-value';
const tenantId = 'tenant-a';
const userId = 'owner-a';
const storeId = 'store-a';
const receiptId = 'receipt-a';
const activationRequestId = 'activation-request-0001';
const syncRequestId = 'initial-sync-request-0001';
const configDigest = 'a'.repeat(64);
const domain = '443.langame.ru';
const externalClubId = '42';

const dto: LangameInitialSyncPreflightCurrent188Dto = {
  receiptId,
  activationRequestId,
  syncRequestId,
  configDigest,
  storeId,
  domain,
  externalClubId,
};

const user = {
  id: userId,
  tenantId,
} as never;

function digest(fields: readonly string[]) {
  return createHmac('sha256', hmacSecret)
    .update(JSON.stringify(fields), 'utf8')
    .digest('hex');
}

function bindingDigest() {
  return digest([
    contract,
    'BINDING',
    tenantId,
    storeId,
    domain,
    externalClubId,
    configDigest,
  ]);
}

function activationDigest() {
  const binding = bindingDigest();
  return digest([
    contract,
    'ACTIVATE',
    tenantId,
    userId,
    receiptId,
    activationRequestId,
    configDigest,
    binding,
    storeId,
    domain,
    externalClubId,
  ]);
}

function activatedRow(overrides: Record<string, unknown> = {}) {
  const activatedAt = new Date('2026-08-13T05:00:00.000Z');
  const binding = bindingDigest();
  const requestDigest = activationDigest();
  return {
    receiptId,
    status: 'CONSUMED',
    consumedAt: activatedAt,
    configDigest,
    bindingDigest: binding,
    activationRequestId,
    activationRequestDigest: requestDigest,
    claimId: 'claim-a',
    resolvedClaimId: 'claim-a',
    externalDomain: domain,
    externalClubId,
    claimDigest: binding,
    activatedAt,
    storeExternalProvider: 'LANGAME',
    storeExternalDomain: domain,
    storeExternalClubId: externalClubId,
    storeIntegrationSourceId: 'source-a',
    sourceId: 'source-a',
    sourceCredentialId: 'credential-a',
    sourceProvider: 'LANGAME',
    sourceDomain: domain,
    sourceBaseUrl: `https://${domain}/public_api`,
    sourceIsActive: true,
    credentialId: 'credential-a',
    credentialProvider: 'LANGAME',
    credentialIsActive: true,
    credentialApiKeyEncrypted: 'v2:iv:tag:ciphertext',
    credentialApiKeyEnvVar: null,
    credentialUpdatedAt: new Date('2026-08-13T05:00:00.000Z'),
    auditId: 'audit-a',
    auditRequestDigest: requestDigest,
    auditConfigDigest: configDigest,
    auditBindingDigest: binding,
    auditClaimDigest: binding,
    auditEventAt: activatedAt,
    ...overrides,
  };
}

describe('LangameInitialSyncPreflightCurrent188Service', () => {
  let queryRaw: jest.Mock;
  let assertNetwork: jest.Mock;
  let getDiagnosticEndpoint: jest.Mock;
  let decrypt: jest.Mock;
  let configValues: Record<string, string | undefined>;
  let service: LangameInitialSyncPreflightCurrent188Service;

  beforeEach(() => {
    queryRaw = jest.fn();
    assertNetwork = jest.fn().mockResolvedValue({ tenantId, userId });
    getDiagnosticEndpoint = jest.fn();
    decrypt = jest.fn().mockReturnValue('plain-api-key');
    configValues = {
      NODE_ENV: 'test',
      LANGAME_STAGED_ONBOARDING_FOUNDATION_ENABLED: 'true',
      LANGAME_STAGED_ONBOARDING_HMAC_SECRET: hmacSecret,
      LANGAME_INITIAL_SYNC_PREFLIGHT_CURRENT188_ENABLED: 'true',
    };
    const configService = {
      get: jest.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;
    service = new LangameInitialSyncPreflightCurrent188Service(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      { assertNetwork } as unknown as FreshStoreScopeService,
      configService,
      { getDiagnosticEndpoint } as unknown as LangameClient,
      { decrypt } as unknown as SecretEncryptionService,
    );
  });

  it('is default-off before database, credential, or provider access', async () => {
    configValues.LANGAME_INITIAL_SYNC_PREFLIGHT_CURRENT188_ENABLED = undefined;

    await expect(service.preflight(user, dto)).rejects.toThrow(
      'CURRENT188 initial sync preflight is disabled',
    );
    expect(assertNetwork).toHaveBeenCalledTimes(1);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(decrypt).not.toHaveBeenCalled();
    expect(getDiagnosticEndpoint).not.toHaveBeenCalled();
  });

  it('is unconditionally denied in production', async () => {
    configValues.NODE_ENV = 'production';

    await expect(service.preflight(user, dto)).rejects.toThrow(
      'CURRENT188 initial sync preflight is not production-authorized',
    );
    expect(queryRaw).not.toHaveBeenCalled();
    expect(getDiagnosticEndpoint).not.toHaveBeenCalled();
  });

  it('stops on fresh network-authority denial before configuration or effects', async () => {
    assertNetwork.mockRejectedValueOnce(new Error('fresh scope denied'));

    await expect(service.preflight(user, dto)).rejects.toThrow(
      'fresh scope denied',
    );
    expect(queryRaw).not.toHaveBeenCalled();
    expect(getDiagnosticEndpoint).not.toHaveBeenCalled();
  });

  it('performs a bounded selected-club read-set preflight without imports or writes', async () => {
    queryRaw.mockResolvedValue([activatedRow()]);
    getDiagnosticEndpoint
      .mockResolvedValueOnce({
        status: true,
        data: [{ id: 42, active: 1, name: 'Selected' }],
      })
      .mockResolvedValueOnce({
        status: true,
        data: [
          { id: 10, name: 'Water' },
          { id: 11, name: 'Snack' },
        ],
      })
      .mockResolvedValueOnce({
        status: true,
        data: [{ id: 10, count: 5 }],
      });

    const result = await service.preflight(user, dto);

    expect(result).toMatchObject({
      contractVersion: contract,
      receiptId,
      storeId,
      syncRequestId,
      status: 'READY',
      readSet: {
        selectedClubs: 1,
        products: 2,
        inventoryItems: 1,
      },
      providerReadsPerformed: 3,
      providerWritesStarted: false,
      platformImportStarted: false,
      initialReadOnlySyncAvailable: false,
      productionPreflightAllowed: false,
    });
    expect(result.approvalDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.readSetDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(assertNetwork).toHaveBeenCalledTimes(2);
    const bindingQueries = queryRaw.mock.calls as Array<
      [{ values?: unknown[] }]
    >;
    for (const [query] of bindingQueries) {
      expect(query.values).toEqual([tenantId, userId, receiptId, storeId]);
    }
    expect(decrypt).toHaveBeenCalledWith('v2:iv:tag:ciphertext');
    expect(getDiagnosticEndpoint.mock.calls).toEqual([
      [
        `https://${domain}/public_api`,
        'plain-api-key',
        '/clubs/list',
        {},
        { timeoutMs: 5_000, maxResponseBytes: 1024 * 1024 },
      ],
      [
        `https://${domain}/public_api`,
        'plain-api-key',
        '/products/list',
        {},
        { timeoutMs: 5_000, maxResponseBytes: 4 * 1024 * 1024 },
      ],
      [
        `https://${domain}/public_api`,
        'plain-api-key',
        '/goods/list',
        { club_id: externalClubId },
        { timeoutMs: 5_000, maxResponseBytes: 4 * 1024 * 1024 },
      ],
    ]);
  });

  it('rejects over-broad binding evidence before decrypting or calling Langame', async () => {
    queryRaw.mockResolvedValue([activatedRow(), activatedRow()]);

    await expect(service.preflight(user, dto)).rejects.toThrow(
      'Invalid Langame initial sync binding',
    );
    expect(decrypt).not.toHaveBeenCalled();
    expect(getDiagnosticEndpoint).not.toHaveBeenCalled();
  });

  it('rejects a changed activation request before provider access', async () => {
    queryRaw.mockResolvedValue([
      activatedRow({ activationRequestId: 'activation-request-changed' }),
    ]);

    await expect(service.preflight(user, dto)).rejects.toThrow(
      'Invalid Langame initial sync binding',
    );
    expect(getDiagnosticEndpoint).not.toHaveBeenCalled();
  });

  it('rejects provider failure without starting an import', async () => {
    queryRaw.mockResolvedValue([activatedRow()]);
    getDiagnosticEndpoint.mockRejectedValue(new Error('timeout'));

    await expect(service.preflight(user, dto)).rejects.toThrow(
      'Langame initial read-only sync preflight failed',
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing selected club after the fresh provider read', async () => {
    queryRaw.mockResolvedValue([activatedRow()]);
    getDiagnosticEndpoint
      .mockResolvedValueOnce({ status: true, data: [{ id: 7, active: 1 }] })
      .mockResolvedValueOnce({ status: true, data: [{ id: 10 }] })
      .mockResolvedValueOnce({ status: true, data: [{ id: 10 }] });

    await expect(service.preflight(user, dto)).rejects.toThrow(
      'Selected Langame club changed during initial sync preflight',
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects inventory rows that are absent from the product read set', async () => {
    queryRaw.mockResolvedValue([activatedRow()]);
    getDiagnosticEndpoint
      .mockResolvedValueOnce({ status: true, data: [{ id: 42, active: 1 }] })
      .mockResolvedValueOnce({ status: true, data: [{ id: 10 }] })
      .mockResolvedValueOnce({ status: true, data: [{ id: 11 }] });

    await expect(service.preflight(user, dto)).rejects.toThrow(
      'Langame initial sync read set is inconsistent',
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects binding or credential drift detected after provider reads', async () => {
    queryRaw.mockResolvedValueOnce([activatedRow()]).mockResolvedValueOnce([
      activatedRow({
        credentialUpdatedAt: new Date('2026-08-13T05:01:00.000Z'),
      }),
    ]);
    getDiagnosticEndpoint
      .mockResolvedValueOnce({ status: true, data: [{ id: 42, active: 1 }] })
      .mockResolvedValueOnce({ status: true, data: [{ id: 10 }] })
      .mockResolvedValueOnce({ status: true, data: [{ id: 10 }] });

    await expect(service.preflight(user, dto)).rejects.toThrow(
      'Langame onboarding binding changed during initial sync preflight',
    );
  });

  it('re-attests fresh network authority after provider reads', async () => {
    queryRaw.mockResolvedValue([activatedRow()]);
    assertNetwork
      .mockResolvedValueOnce({ tenantId, userId })
      .mockRejectedValueOnce(new Error('fresh scope revoked'));
    getDiagnosticEndpoint
      .mockResolvedValueOnce({ status: true, data: [{ id: 42, active: 1 }] })
      .mockResolvedValueOnce({ status: true, data: [{ id: 10 }] })
      .mockResolvedValueOnce({ status: true, data: [{ id: 10 }] });

    await expect(service.preflight(user, dto)).rejects.toThrow(
      'fresh scope revoked',
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed provider entity identifiers', async () => {
    queryRaw.mockResolvedValue([activatedRow()]);
    getDiagnosticEndpoint
      .mockResolvedValueOnce({ status: true, data: [{ id: 42, active: 1 }] })
      .mockResolvedValueOnce({ status: true, data: [{ id: -10 }] })
      .mockResolvedValueOnce({ status: true, data: [{ id: -10 }] });

    await expect(service.preflight(user, dto)).rejects.toThrow(
      'Invalid Langame product read set',
    );
    expect(assertNetwork).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
