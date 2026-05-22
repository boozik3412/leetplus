import { IntegrationProvider, UserRole } from '@prisma/client';
import { GuestDataFoundationService } from './guest-data-foundation.service';

const user = {
  id: 'user-1',
  email: 'owner@example.com',
  fullName: 'Owner',
  role: UserRole.OWNER,
  isPlatformAdmin: false,
  tenantId: 'tenant-1',
  tenantSlug: 'tenant',
};

type GuestUpsertCall = {
  create: {
    tenantId: string;
    externalProvider: IntegrationProvider;
    externalDomain: string;
    externalGuestId: string;
    phoneMasked: string | null;
    phoneEncrypted: string | null;
    emailMasked: string | null;
    fullNameMasked: string | null;
    fullNameEncrypted: string | null;
    phoneHash: string | null;
    emailHash: string | null;
    fullNameHash: string | null;
    identityDocumentPresent: boolean;
  };
};

type ProfileRunUpdateCall = {
  data: {
    status: string;
    guestsCount: number;
    sessionsCount: number;
    transactionsCount: number;
    productSalesLinked: number;
    profile: {
      guests: {
        withIdentityDocument: number;
      };
      operationLogs: {
        fieldCounts: Record<string, number>;
        candidateFields: Record<string, number>;
      };
      cashTransactions: {
        total: number;
        candidateFields: Record<string, number>;
      };
      workingShifts: {
        total: number;
        candidateFields: Record<string, number>;
      };
      pcTypesInClubs: {
        total: number;
      };
      pcTypeLinks: {
        total: number;
      };
      operatorHints: {
        operationLogs: Record<
          string,
          { count: number; fields: Record<string, string[]> }
        >;
        cashTransactions: Record<
          string,
          { count: number; fields: Record<string, string[]> }
        >;
        workingShifts: Record<
          string,
          { count: number; fields: Record<string, string[]> }
        >;
      };
    };
  };
};

type GuestWorkingShiftUpsertCall = {
  where: {
    tenantId_externalProvider_externalDomain_externalShiftId: {
      tenantId: string;
      externalProvider: IntegrationProvider;
      externalDomain: string;
      externalShiftId: string;
    };
  };
  create: {
    tenantId: string;
    guestId: string | null;
    storeId: string | null;
    externalProvider: IntegrationProvider;
    externalDomain: string;
    externalShiftId: string;
    externalUserId: string | null;
    externalClubId: string | null;
    durationMinutes: number | null;
    message: string | null;
  };
  update: {
    guestId: string | null;
    storeId: string | null;
    externalUserId: string | null;
    externalClubId: string | null;
    durationMinutes: number | null;
    message: string | null;
  };
};

type StoreUpdateManyCall = {
  where: {
    tenantId: string;
    externalProvider: IntegrationProvider;
    externalDomain: string;
    externalClubId: string;
  };
  data: {
    computerCount: number;
    computerCountSyncedAt: Date;
  };
};

type GuestDataProfileRunUpdateManyCall = {
  where: {
    tenantId: string;
    provider: IntegrationProvider;
    status: string;
    startedAt: {
      lt: Date;
    };
  };
  data: {
    status: string;
    finishedAt: Date;
    errorMessage: string;
  };
};

describe('GuestDataFoundationService', () => {
  const prisma = {
    guestDataProfileRun: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGroup: {
      upsert: jest.fn(),
    },
    guest: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    guestBalanceSnapshot: {
      upsert: jest.fn(),
    },
    guestBonusBalanceSnapshot: {
      upsert: jest.fn(),
    },
    guestSession: {
      upsert: jest.fn(),
    },
    guestLog: {
      upsert: jest.fn(),
    },
    guestTransaction: {
      upsert: jest.fn(),
    },
    guestOperationLog: {
      upsert: jest.fn(),
    },
    guestWorkingShift: {
      upsert: jest.fn(),
    },
    guestStaffIdentityMapping: {
      findMany: jest.fn(),
    },
    salesFact: {
      updateMany: jest.fn(),
    },
    store: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const tenantContextService = {
    resolve: jest.fn(),
  };
  const langameClient = {
    listGuestGroups: jest.fn(),
    listGuests: jest.fn(),
    listGuestBalances: jest.fn(),
    listGuestBonusBalances: jest.fn(),
    listGuestSessions: jest.fn(),
    listTransactions: jest.fn(),
    listGuestLogs: jest.fn(),
    listAllOperationsLog: jest.fn(),
    listCashTransactions: jest.fn(),
    listWorkingShifts: jest.fn(),
    listPcTypesInClubs: jest.fn(),
    listPcTypeLinks: jest.fn(),
    listProductExpenses: jest.fn(),
  };
  const langameSettingsService = {
    resolveTenantAccess: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };

  let service: GuestDataFoundationService;

  beforeEach(() => {
    jest.clearAllMocks();

    tenantContextService.resolve.mockResolvedValue({
      tenantId: 'tenant-1',
      tenantSlug: 'tenant',
    });
    langameSettingsService.resolveTenantAccess.mockResolvedValue({
      apiKey: 'api-key',
      sources: [
        {
          id: 'source-1',
          baseUrl: 'https://club.example/public_api',
          domain: 'club.example',
        },
      ],
    });
    configService.get.mockImplementation((key: string) =>
      key === 'APP_ENCRYPTION_KEY' ? 'local-secret' : undefined,
    );

    prisma.guestDataProfileRun.create.mockResolvedValue({ id: 'run-1' });
    prisma.guestDataProfileRun.findFirst.mockResolvedValue(null);
    prisma.guestDataProfileRun.update.mockResolvedValue({});
    prisma.guestDataProfileRun.updateMany.mockResolvedValue({ count: 0 });
    prisma.store.findMany.mockResolvedValue([
      { id: 'store-1', externalClubId: '10' },
    ]);
    prisma.store.updateMany.mockResolvedValue({ count: 1 });
    prisma.guest.findMany.mockResolvedValue([
      { id: 'guest-1', externalGuestId: '42' },
    ]);
    prisma.salesFact.updateMany.mockResolvedValue({ count: 1 });
    prisma.guestStaffIdentityMapping.findMany.mockResolvedValue([]);

    langameClient.listGuestGroups.mockResolvedValue([
      { id: 7, name: 'VIP', percent: '10' },
    ]);
    langameClient.listGuests.mockResolvedValue([
      {
        guest_id: 42,
        guest_type_id: 7,
        phone: '+7 999 111-22-33',
        email: 'Guest@Example.com',
        fio: 'Ivan Petrov',
        birthday: '1990-05-10',
        date_insert: '2026-01-01 10:00:00',
        date_last_activity: '2026-05-01 11:00:00',
        identity_document: 'passport',
        identity_document_data: { number: '1234' },
      },
    ]);
    langameClient.listGuestBalances.mockResolvedValue([
      { guest_id: 42, balance: '1500.50' },
    ]);
    langameClient.listGuestBonusBalances.mockResolvedValue([
      { guest_id: 42, bonus_balance: '250' },
    ]);
    langameClient.listGuestSessions.mockResolvedValue([
      {
        id: 100,
        guest_id: 42,
        list_clubs_id: 10,
        date_start: '2026-05-01 10:00:00',
        date_stop: '2026-05-01 12:00:00',
      },
    ]);
    langameClient.listTransactions.mockResolvedValue([
      {
        id: 200,
        real_guest_id: 42,
        list_clubs_id: 10,
        type: 'deposit',
        date_normal: '01.05.2026 09:00:00',
        sum: '1000',
        balance: '1500.50',
      },
    ]);
    langameClient.listGuestLogs.mockResolvedValue([
      { guest_id: 42, type: 'login', date: '2026-05-01 10:00:00' },
    ]);
    langameClient.listAllOperationsLog.mockResolvedValue([
      {
        club_id: 10,
        type: 'cash',
        date_normal: '2026-05-01 09:00:00',
        sum: '1000',
        admin_id: 5,
      },
    ]);
    langameClient.listCashTransactions.mockResolvedValue([
      {
        admin_id: 5,
        user_name: 'Admin',
        sum: '1000',
        date: '2026-05-01 09:00:00',
      },
    ]);
    langameClient.listWorkingShifts.mockResolvedValue([
      {
        shift_id: 11,
        id: 11,
        admin_id: 5,
        user_id: 42,
        list_clubs_id: 10,
        date_start: '2026-05-01 08:00:00',
        date_stop: '2026-05-01 18:30:00',
        start: '500',
        nal: '1000',
        beznal: '2000',
        refunds_nal: '50',
        refunds_beznal: '70',
        mobile_pay: '300',
        yandex_pay: '400',
        incass: '1500',
        middle_check: '250',
      },
    ]);
    langameClient.listPcTypesInClubs.mockResolvedValue([
      { id: 20, list_clubs_id: 10, name: 'Standart' },
    ]);
    langameClient.listPcTypeLinks.mockResolvedValue([
      { id: 1, pc_type_id: 20, pc_id: 1001 },
      { id: 2, pc_type_id: 20, pc_id: 1002 },
    ]);
    langameClient.listProductExpenses.mockResolvedValue([
      {
        id: 300,
        date: '2026-05-01 12:10:00',
        list_goods_id: 5,
        list_clubs_id: 10,
        real_guest_id: 42,
        price_purchase: '50',
        price_sale: 100,
        count: 2,
        cancel: 0,
      },
    ]);

    service = new GuestDataFoundationService(
      prisma as never,
      tenantContextService as never,
      langameClient as never,
      langameSettingsService as never,
      configService as never,
    );
  });

  it('syncs guest foundation data without storing raw personal data', async () => {
    const result = await service.syncTenant(user, {
      dateFrom: '2026-05-01',
      dateTo: '2026-05-01',
    });

    expect(result.failedSources).toBe(0);
    expect(prisma.guest.upsert).toHaveBeenCalledTimes(1);

    const guestUpsertCalls = prisma.guest.upsert.mock.calls as Array<
      [GuestUpsertCall]
    >;
    const guestUpsert = guestUpsertCalls[0]?.[0];
    expect(guestUpsert).toBeDefined();
    if (!guestUpsert) {
      throw new Error('Guest upsert was not called');
    }

    const guestCreate = guestUpsert.create;
    expect(guestCreate.tenantId).toBe('tenant-1');
    expect(guestCreate.externalProvider).toBe(IntegrationProvider.LANGAME);
    expect(guestCreate.externalDomain).toBe('club.example');
    expect(guestCreate.externalGuestId).toBe('42');
    expect(guestCreate.phoneMasked).toBe('***2233');
    expect(guestCreate.emailMasked).toBe('g***@example.com');
    expect(guestCreate.fullNameMasked).toBe('I. P.');
    expect(guestCreate.phoneEncrypted).toEqual(expect.any(String));
    expect(guestCreate.fullNameEncrypted).toEqual(expect.any(String));
    expect(guestCreate.phoneEncrypted).not.toContain('+7 999 111-22-33');
    expect(guestCreate.fullNameEncrypted).not.toContain('Ivan Petrov');
    expect(guestCreate.phoneHash).toEqual(expect.any(String));
    expect(guestCreate.emailHash).toEqual(expect.any(String));
    expect(guestCreate.fullNameHash).toEqual(expect.any(String));
    expect(guestCreate.identityDocumentPresent).toBe(true);
    expect(guestCreate).not.toHaveProperty('phone');
    expect(guestCreate).not.toHaveProperty('email');
    expect(guestCreate).not.toHaveProperty('fio');
    expect(guestCreate).not.toHaveProperty('identity_document_data');

    expect(prisma.salesFact.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club.example',
        externalSaleId: '300',
      },
      data: {
        externalGuestId: '42',
        guestId: 'guest-1',
      },
    });

    const profileRunUpdates = prisma.guestDataProfileRun.update.mock
      .calls as Array<[ProfileRunUpdateCall]>;
    const successUpdate = profileRunUpdates.find(
      ([call]) => call.data.status === 'SUCCESS',
    )?.[0];
    expect(successUpdate).toBeDefined();
    if (!successUpdate) {
      throw new Error('Successful profile update was not called');
    }
    expect(successUpdate.data.guestsCount).toBe(1);
    expect(successUpdate.data.sessionsCount).toBe(1);
    expect(successUpdate.data.transactionsCount).toBe(1);
    expect(successUpdate.data.productSalesLinked).toBe(1);
    expect(successUpdate.data.profile.guests.withIdentityDocument).toBe(1);
    expect(successUpdate.data.profile.operationLogs.fieldCounts.club_id).toBe(
      1,
    );
    expect(
      successUpdate.data.profile.operationLogs.candidateFields.admin_id,
    ).toBe(1);
    expect(successUpdate.data.profile.cashTransactions.total).toBe(1);
    expect(
      successUpdate.data.profile.cashTransactions.candidateFields.admin_id,
    ).toBe(1);
    expect(successUpdate.data.profile.workingShifts.total).toBe(1);
    expect(
      successUpdate.data.profile.workingShifts.candidateFields.shift_id,
    ).toBe(1);
    expect(successUpdate.data.profile.pcTypesInClubs.total).toBe(1);
    expect(successUpdate.data.profile.pcTypeLinks.total).toBe(2);
    const storeUpdateCalls = prisma.store.updateMany.mock.calls as Array<
      [StoreUpdateManyCall]
    >;
    const storeUpdate = storeUpdateCalls[0]?.[0];
    expect(storeUpdate).toBeDefined();
    if (!storeUpdate) {
      throw new Error('Store computer count update was not called');
    }
    expect(storeUpdate).toMatchObject({
      where: {
        tenantId: 'tenant-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club.example',
        externalClubId: '10',
      },
      data: {
        computerCount: 2,
      },
    });
    expect(storeUpdate.data.computerCountSyncedAt).toBeInstanceOf(Date);
    expect(
      successUpdate.data.profile.operatorHints.cashTransactions['admin_id=5']
        ?.fields.user_name,
    ).toEqual(['Admin']);
    expect(
      successUpdate.data.profile.operatorHints.workingShifts['user_id=42']
        ?.fields.user_id,
    ).toEqual(['42']);
    expect(langameClient.listAllOperationsLog).toHaveBeenCalledWith(
      'https://club.example/public_api',
      'api-key',
      {
        dateFrom: '01.05.2026',
        dateTo: '01.05.2026',
      },
    );
    expect(langameClient.listAllOperationsLog).toHaveBeenCalledWith(
      'https://club.example/public_api',
      'api-key',
      {
        dateFrom: '01.05.2026',
        dateTo: '01.05.2026',
        operationType: 'Списание',
      },
    );
    const shiftUpsertCalls = prisma.guestWorkingShift.upsert.mock
      .calls as Array<[GuestWorkingShiftUpsertCall]>;
    const shiftUpsert = shiftUpsertCalls[0]?.[0];
    expect(shiftUpsert).toBeDefined();
    if (!shiftUpsert) {
      throw new Error('Working shift upsert was not called');
    }

    expect(
      shiftUpsert.where
        .tenantId_externalProvider_externalDomain_externalShiftId,
    ).toEqual({
      tenantId: 'tenant-1',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club.example',
      externalShiftId: '11',
    });
    expect(shiftUpsert.create.tenantId).toBe('tenant-1');
    expect(shiftUpsert.create.guestId).toBe('guest-1');
    expect(shiftUpsert.create.storeId).toBe('store-1');
    expect(shiftUpsert.create.externalProvider).toBe(
      IntegrationProvider.LANGAME,
    );
    expect(shiftUpsert.create.externalDomain).toBe('club.example');
    expect(shiftUpsert.create.externalShiftId).toBe('11');
    expect(shiftUpsert.create.externalUserId).toBe('42');
    expect(shiftUpsert.create.externalClubId).toBe('10');
    expect(shiftUpsert.create.durationMinutes).toBe(630);
    expect(shiftUpsert.create.message).toBeNull();
    expect(shiftUpsert.update.guestId).toBe('guest-1');
    expect(shiftUpsert.update.storeId).toBe('store-1');
    expect(shiftUpsert.update.externalUserId).toBe('42');
    expect(shiftUpsert.update.externalClubId).toBe('10');
    expect(shiftUpsert.update.durationMinutes).toBe(630);
    expect(shiftUpsert.update.message).toBeNull();
  });

  it('rejects profiling periods longer than ninety days', async () => {
    await expect(
      service.syncTenant(user, {
        dateFrom: '2026-01-01',
        dateTo: '2026-05-01',
      }),
    ).rejects.toThrow('Guest foundation period must be 90 days or less');
  });

  it('marks stale running guest syncs as failed before reporting status', async () => {
    const staleRun = {
      domain: 'club.example',
      status: 'FAILED',
      startedAt: new Date('2026-05-19T10:44:00.000Z'),
      finishedAt: new Date('2026-05-19T12:44:00.000Z'),
      dateFrom: new Date('2026-05-14T00:00:00.000Z'),
      dateTo: new Date('2026-05-20T23:59:59.999Z'),
      guestsCount: 0,
      sessionsCount: 0,
      transactionsCount: 0,
      productSalesLinked: 0,
      errorMessage:
        'Синхронизация остановлена: не было завершения больше 2 часов. Запустите повторно.',
      profile: null,
    };

    prisma.guestDataProfileRun.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(staleRun);

    const status = await service.getTenantSyncStatus(user);

    const updateManyCalls = prisma.guestDataProfileRun.updateMany.mock
      .calls as Array<[GuestDataProfileRunUpdateManyCall]>;
    const updateManyCall = updateManyCalls[0]?.[0];
    expect(updateManyCall).toBeDefined();
    if (!updateManyCall) {
      throw new Error('Stale running sync cleanup was not called');
    }
    expect(updateManyCall.where).toMatchObject({
      tenantId: 'tenant-1',
      provider: IntegrationProvider.LANGAME,
      status: 'RUNNING',
    });
    expect(updateManyCall.where.startedAt.lt).toBeInstanceOf(Date);
    expect(updateManyCall.data).toMatchObject({
      status: 'FAILED',
      errorMessage:
        'Синхронизация остановлена: не было завершения больше 2 часов. Запустите повторно.',
    });
    expect(updateManyCall.data.finishedAt).toBeInstanceOf(Date);
    expect(status.running).toBe(false);
    expect(status.status).toBe('FAILED');
    expect(status.latestRun?.errorMessage).toContain('2 часов');
  });
});
