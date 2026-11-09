import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { parseFaceitPlayer } from './guest-game-accounts-lookup.service';
import {
  GuestGameAccountsService,
  STEAM_RELINK_COOLDOWN_MS,
  buildGuestGameAccountsView,
} from './guest-game-accounts.service';
import {
  STEAM_OPENID_ENDPOINT,
  signSteamLinkState,
  steamReturnTo,
} from './steam-openid';

const SCOPE = { tenantId: 'tenant-1', profileId: 'profile-1' };
const STEAM_ID = '76561198000000001';
const WEB = 'https://app.leetplus.ru';
const SECRET = 'guest-secret';

function config(enabled = true) {
  const values: Record<string, string> = {
    GUEST_GAME_EXTERNAL_ACCOUNTS_ENABLED: enabled ? 'true' : 'false',
    GUEST_PORTAL_JWT_SECRET: SECRET,
    WEB_URL: WEB,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function openid(state: string) {
  const returnTo = steamReturnTo(WEB, state);
  return {
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.return_to': returnTo,
    'openid.response_nonce': '2026-11-09T10:00:00Zabc',
    'openid.assoc_handle': '1234567890',
    'openid.signed':
      'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2ln',
  };
}

function harness(
  findFirst: (where: Record<string, unknown>) => unknown = () => null,
) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    guestGameExternalAccount: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(findFirst(where)),
      ),
      create: jest.fn().mockResolvedValue({ id: 'account-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestGameAuditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    guestGameExternalAccount: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  return { tx, prisma };
}

function service(prisma: unknown, enabled = true) {
  const instance = new GuestGameAccountsService(
    prisma as PrismaService,
    config(enabled),
  );
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response('ns:x\nis_valid:true\n', { status: 200 }));
  return instance;
}

afterEach(() => jest.restoreAllMocks());

describe('GuestGameAccountsService', () => {
  it('is closed until the network turns game accounts on', async () => {
    const { prisma } = harness();
    const accounts = service(prisma, false);
    expect(() => accounts.startSteamLink(SCOPE)).toThrow(NotFoundException);
    await expect(
      accounts.verifySteamLink(SCOPE, { state: 'x', openid: {} }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('links a Steam account proven through Steam OpenID', async () => {
    const { prisma, tx } = harness();
    const accounts = service(prisma);
    const state = signSteamLinkState(SECRET, { ...SCOPE, now: Date.now() });

    await accounts.verifySteamLink(SCOPE, { state, openid: openid(state) });

    const [url, init] = (global.fetch as jest.MockedFunction<typeof fetch>).mock
      .calls[0];
    expect(url).toBe(STEAM_OPENID_ENDPOINT);
    expect(init?.body as string).toContain('openid.mode=check_authentication');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.guestGameExternalAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ...SCOPE,
        provider: 'STEAM',
        externalId: STEAM_ID,
        verifiedVia: 'STEAM_OPENID',
        lookupStatus: 'PENDING',
      }) as unknown,
      select: { id: true },
    });
    expect(tx.guestGameAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'STEAM_LINKED' }) as unknown,
    });
  });

  it('rejects a state issued to another profile before calling Steam', async () => {
    const { prisma } = harness();
    const accounts = service(prisma);
    const state = signSteamLinkState(SECRET, {
      tenantId: 'tenant-1',
      profileId: 'profile-2',
      now: Date.now(),
    });

    await expect(
      accounts.verifySteamLink(SCOPE, { state, openid: openid(state) }),
    ).rejects.toThrow('другом профиле');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses a Steam account that is active on another guest', async () => {
    const { prisma, tx } = harness((where) =>
      where.status === 'ACTIVE' && where.externalId === STEAM_ID
        ? { profileId: 'profile-2' }
        : null,
    );
    const accounts = service(prisma);
    const state = signSteamLinkState(SECRET, { ...SCOPE, now: Date.now() });

    await expect(
      accounts.verifySteamLink(SCOPE, { state, openid: openid(state) }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.guestGameExternalAccount.create).not.toHaveBeenCalled();
  });

  it('keeps a moved Steam account on hold for the cooldown', async () => {
    const recently = new Date(Date.now() - STEAM_RELINK_COOLDOWN_MS / 2);
    const { prisma, tx } = harness((where) =>
      where.status === 'UNLINKED' && where.externalId === STEAM_ID
        ? { unlinkedAt: recently }
        : null,
    );
    const accounts = service(prisma);
    const state = signSteamLinkState(SECRET, { ...SCOPE, now: Date.now() });

    await expect(
      accounts.verifySteamLink(SCOPE, { state, openid: openid(state) }),
    ).rejects.toThrow('недавно был привязан');
    expect(tx.guestGameExternalAccount.create).not.toHaveBeenCalled();
  });

  it('is idempotent for the same Steam on the same profile', async () => {
    const { prisma, tx } = harness((where) =>
      where.status === 'ACTIVE' && where.externalId === STEAM_ID
        ? { profileId: SCOPE.profileId }
        : null,
    );
    const accounts = service(prisma);
    const state = signSteamLinkState(SECRET, { ...SCOPE, now: Date.now() });

    await accounts.verifySteamLink(SCOPE, { state, openid: openid(state) });
    expect(tx.guestGameExternalAccount.create).not.toHaveBeenCalled();
  });

  it('unlinks Steam and the FACEIT account found through it', async () => {
    const { prisma, tx } = harness();
    await service(prisma).unlinkSteam(SCOPE);

    expect(tx.guestGameExternalAccount.updateMany).toHaveBeenCalledWith({
      where: {
        ...SCOPE,
        provider: { in: ['STEAM', 'FACEIT'] },
        status: 'ACTIVE',
      },
      data: { status: 'UNLINKED', unlinkedAt: expect.any(Date) as unknown },
    });
  });
});

describe('game accounts view and FACEIT parsing', () => {
  it('shows the FACEIT lookup state of a linked Steam account', () => {
    const linkedAt = new Date('2026-11-09T10:00:00Z');
    const view = buildGuestGameAccountsView({
      enabled: true,
      steam: {
        externalId: STEAM_ID,
        nickname: 'player',
        linkedAt,
        lookupStatus: 'NOT_FOUND',
        checkedAt: linkedAt,
        details: { avatarUrl: 'javascript:alert(1)' },
      } as never,
      faceit: null,
      lastSteamUnlinkedAt: null,
    });

    expect(view.steam).toMatchObject({ steamId: STEAM_ID, avatarUrl: null });
    expect(view.faceit).toMatchObject({ status: 'NOT_FOUND', nickname: null });
  });

  it('accepts a FACEIT player only when it is bound to the same SteamID', () => {
    const body = {
      player_id: 'faceit-1',
      nickname: 'Nick',
      games: {
        cs2: { game_player_id: STEAM_ID, skill_level: 7, faceit_elo: 1450 },
      },
    };

    expect(parseFaceitPlayer(body, STEAM_ID)).toEqual({
      status: 'FOUND',
      playerId: 'faceit-1',
      nickname: 'Nick',
      level: 7,
      elo: 1450,
    });
    expect(parseFaceitPlayer(body, '76561198000000002')).toEqual({
      status: 'NOT_FOUND',
    });
    expect(parseFaceitPlayer({}, STEAM_ID)).toMatchObject({ status: 'FAILED' });
  });
});
