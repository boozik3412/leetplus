import { IntegrationProvider } from '@prisma/client';
import type { LangameGuestSession } from '../integrations/langame.types';
import { GuestsService } from './guests.service';

type PersistedLiveSessionInput = {
  where: {
    tenantId_externalProvider_externalDomain_externalSessionId: {
      tenantId: string;
      externalProvider: IntegrationProvider;
      externalDomain: string;
      externalSessionId: string;
    };
  };
  create: { expand: boolean | null; packet: boolean | null };
  update: { expand: boolean | null; packet: boolean | null };
};

describe('GuestsService live Langame session persistence', () => {
  const guestFindFirst = jest.fn();
  const storeFindFirst = jest.fn();
  const storeFindMany = jest.fn();
  const guestSessionFindFirst = jest.fn();
  let persistedInput: PersistedLiveSessionInput | null = null;
  const upsert = jest.fn((input: PersistedLiveSessionInput) => {
    persistedInput = input;
    return Promise.resolve({ id: 'guest-session-1' });
  });
  const resolveTenant = jest.fn();
  const resolveTenantAccess = jest.fn();
  const listGuestSessions = jest.fn();
  const listTariffTypeGroups = jest.fn();
  let service: GuestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    persistedInput = null;
    guestFindFirst.mockResolvedValue({
      id: 'guest-1',
      externalDomain: 'example.langame.test',
      externalGuestId: 'external-guest-1',
      fullNameMasked: 'Guest 1',
      phoneMasked: null,
      emailMasked: null,
    });
    storeFindFirst.mockResolvedValue(null);
    storeFindMany.mockResolvedValue([]);
    guestSessionFindFirst.mockResolvedValue(null);
    resolveTenant.mockResolvedValue({ tenantId: 'tenant-1' });
    resolveTenantAccess.mockResolvedValue({
      apiKey: 'test-key',
      sources: [
        {
          id: 'source-1',
          baseUrl: 'https://example.langame.test',
          domain: 'example.langame.test',
        },
      ],
    });
    listTariffTypeGroups.mockResolvedValue([]);

    service = new GuestsService(
      {
        guest: { findFirst: guestFindFirst },
        guestSession: { findFirst: guestSessionFindFirst, upsert },
        store: { findFirst: storeFindFirst, findMany: storeFindMany },
      } as never,
      { resolve: resolveTenant } as never,
      null as never,
      null as never,
      { resolveTenantAccess } as never,
      { listGuestSessions, listTariffTypeGroups } as never,
    );
  });

  it.each([
    ['expanded', 1, true],
    ['not expanded', 0, false],
    ['unknown', null, null],
  ] as const)(
    'parses and persists an %s live session marker',
    async (_label, expand, expected) => {
      listGuestSessions.mockResolvedValue([
        liveSessionRow({ expand, packet: false }),
      ]);

      const result = await service.getGuestLiveSession({} as never, 'guest-1');

      expectPersistedClassification(expected, false);
      expect(result.session?.expand).toBe(expected);
      expect(result.session?.packet).toBe(expected === true ? null : false);
    },
  );

  it.each([
    ['hourly', { id: 1, type: 'basic' }, false],
    ['package', { id: 2, type: 'subscription' }, true],
  ] as const)(
    'resolves a numeric %s tariff marker through the Langame dictionary',
    async (_label, tariffGroup, expected) => {
      listTariffTypeGroups.mockResolvedValue([tariffGroup]);
      listGuestSessions.mockResolvedValue([
        liveSessionRow({ packet: tariffGroup.id }),
      ]);

      await service.getGuestLiveSession({} as never, 'guest-1');

      expectPersistedClassification(false, expected);
    },
  );

  it('keeps a positive numeric tariff marker unknown without a dictionary', async () => {
    listTariffTypeGroups.mockRejectedValue(new Error('Unavailable'));
    listGuestSessions.mockResolvedValue([liveSessionRow({ packet: 1 })]);

    await service.getGuestLiveSession({} as never, 'guest-1');

    expectPersistedClassification(false, null);
  });

  it('keeps an expanded cached hourly-looking session unknown', async () => {
    listGuestSessions.mockRejectedValue(new Error('Unavailable'));
    guestSessionFindFirst.mockResolvedValue({
      id: 'cached-session-1',
      externalSessionId: 'cached-external-session-1',
      externalDomain: 'example.langame.test',
      externalUuid: 'cached-uuid-1',
      startedAt: new Date('2026-07-30T12:00:00.000Z'),
      stoppedAt: null,
      durationMinutes: 75,
      packet: false,
      expand: true,
      normalStop: null,
      store: null,
    });

    const result = await service.getGuestLiveSession({} as never, 'guest-1');

    expect(result.session).toEqual(
      expect.objectContaining({
        externalSessionId: 'cached-external-session-1',
        packet: null,
        expand: true,
      }),
    );
  });

  function expectPersistedClassification(
    expectedExpand: boolean | null,
    expectedPacket: boolean | null,
  ) {
    expect(persistedInput).not.toBeNull();

    if (!persistedInput) {
      throw new Error('Expected live session persistence');
    }

    expect(persistedInput.where).toEqual({
      tenantId_externalProvider_externalDomain_externalSessionId: {
        tenantId: 'tenant-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'example.langame.test',
        externalSessionId: 'session-1',
      },
    });
    expect(persistedInput.create.expand).toBe(expectedExpand);
    expect(persistedInput.update.expand).toBe(expectedExpand);
    expect(persistedInput.create.packet).toBe(expectedPacket);
    expect(persistedInput.update.packet).toBe(expectedPacket);
  }
});

function liveSessionRow(
  overrides: Partial<LangameGuestSession> = {},
): LangameGuestSession {
  return {
    id: 'session-1',
    guest_id: 'external-guest-1',
    club_id: 'club-1',
    UUID: 'uuid-1',
    date_start: '2026-07-30 12:00:00',
    date_stop: null,
    normal_stop: 0,
    expand: 0,
    packet: false,
    ...overrides,
  };
}
