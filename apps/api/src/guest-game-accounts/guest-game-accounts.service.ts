import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type GuestGameExternalAccount } from '@prisma/client';
import { resolveSecuritySecret } from '../config/environment-validation';
import { PrismaService } from '../prisma/prisma.service';
import {
  createGuestGameExternalFetch,
  type GuestGameExternalFetch,
} from './guest-game-external-fetch';
import {
  SteamOpenIdError,
  buildSteamOpenIdRedirect,
  parseSteamOpenIdAssertion,
  signSteamLinkState,
  steamRealm,
  steamReturnTo,
  verifySteamLinkState,
  verifySteamOpenIdAssertion,
} from './steam-openid';

/**
 * Game accounts of a guest (public guest contour). Steam is linked only
 * through Steam OpenID; FACEIT is found later by the worker from the verified
 * SteamID, so FACEIT/Steam Web API keys never reach this process. Depends on
 * Prisma and config only, so the guest runtime can provide it without any
 * corporate module.
 */

/** A Steam account can move to another profile, or a profile can switch to another Steam, only after this pause. */
export const STEAM_RELINK_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export type GuestGameAccountsLookupStatus =
  | 'PENDING'
  | 'FOUND'
  | 'NOT_FOUND'
  | 'FAILED';

export type GuestGameAccountsView = {
  enabled: boolean;
  steam: {
    steamId: string;
    nickname: string | null;
    avatarUrl: string | null;
    profileUrl: string;
    linkedAt: string;
  } | null;
  faceit: {
    status: GuestGameAccountsLookupStatus;
    nickname: string | null;
    level: number | null;
    elo: number | null;
    profileUrl: string | null;
    checkedAt: string | null;
  } | null;
  /** When the profile may link a different Steam account again. */
  relinkAvailableAt: string | null;
};

type AccountScope = { tenantId: string; profileId: string };

function detailsRecord(
  value: Prisma.JsonValue | null,
): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeHttpsUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function guestGameAccountsEnabled(config: Pick<ConfigService, 'get'>) {
  return (
    config.get<string>('GUEST_GAME_EXTERNAL_ACCOUNTS_ENABLED')?.trim() ===
    'true'
  );
}

export function buildGuestGameAccountsView(input: {
  enabled: boolean;
  steam: GuestGameExternalAccount | null;
  faceit: GuestGameExternalAccount | null;
  lastSteamUnlinkedAt: Date | null;
}): GuestGameAccountsView {
  const steamDetails = detailsRecord(input.steam?.details ?? null);
  const faceitDetails = detailsRecord(input.faceit?.details ?? null);
  const relinkAt = input.lastSteamUnlinkedAt
    ? new Date(input.lastSteamUnlinkedAt.getTime() + STEAM_RELINK_COOLDOWN_MS)
    : null;

  return {
    enabled: input.enabled,
    steam: input.steam
      ? {
          steamId: input.steam.externalId,
          nickname: input.steam.nickname,
          avatarUrl: safeHttpsUrl(stringField(steamDetails, 'avatarUrl')),
          profileUrl: `https://steamcommunity.com/profiles/${input.steam.externalId}`,
          linkedAt: input.steam.linkedAt.toISOString(),
        }
      : null,
    faceit: input.steam
      ? {
          status: input.faceit
            ? 'FOUND'
            : (input.steam.lookupStatus as GuestGameAccountsLookupStatus),
          nickname: input.faceit?.nickname ?? null,
          level: numberField(faceitDetails, 'level'),
          elo: numberField(faceitDetails, 'elo'),
          profileUrl: input.faceit?.nickname
            ? `https://www.faceit.com/ru/players/${encodeURIComponent(input.faceit.nickname)}`
            : null,
          checkedAt: input.steam.checkedAt?.toISOString() ?? null,
        }
      : null,
    relinkAvailableAt:
      relinkAt && relinkAt.getTime() > Date.now()
        ? relinkAt.toISOString()
        : null,
  };
}

@Injectable()
export class GuestGameAccountsService {
  private readonly logger = new Logger(GuestGameAccountsService.name);
  private readonly steamFetch: GuestGameExternalFetch;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.steamFetch = createGuestGameExternalFetch(process.env);
  }

  async getAccounts(scope: AccountScope): Promise<GuestGameAccountsView> {
    return this.readView(scope);
  }

  startSteamLink(scope: AccountScope) {
    this.assertEnabled();
    const state = signSteamLinkState(this.stateKey(), {
      ...scope,
      now: Date.now(),
    });
    const webUrl = this.publicWebUrl();

    return {
      redirectUrl: buildSteamOpenIdRedirect({
        returnTo: steamReturnTo(webUrl, state),
        realm: steamRealm(webUrl),
      }),
    };
  }

  async verifySteamLink(
    scope: AccountScope,
    dto: { state?: unknown; openid?: unknown },
  ): Promise<GuestGameAccountsView> {
    this.assertEnabled();
    const now = Date.now();
    let steamId64: string;

    try {
      verifySteamLinkState(this.stateKey(), dto.state, {
        ...scope,
        now,
      });
      const returnTo = steamReturnTo(this.publicWebUrl(), dto.state as string);
      const assertion = parseSteamOpenIdAssertion(dto.openid, returnTo);
      // The provider call stays outside any database transaction.
      await verifySteamOpenIdAssertion(assertion.params, this.steamFetch);
      steamId64 = assertion.steamId64;
    } catch (error) {
      if (error instanceof SteamOpenIdError) {
        if (error.code === 'PROVIDER_UNAVAILABLE') {
          this.logger.warn(
            `Steam OpenID check failed for tenant ${scope.tenantId}`,
          );
          throw new ServiceUnavailableException(error.message);
        }
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    await this.linkSteam(scope, steamId64, new Date(now));

    return this.readView(scope);
  }

  async unlinkSteam(scope: AccountScope): Promise<GuestGameAccountsView> {
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const unlinked = await tx.guestGameExternalAccount.updateMany({
        where: {
          tenantId: scope.tenantId,
          profileId: scope.profileId,
          provider: { in: ['STEAM', 'FACEIT'] },
          status: 'ACTIVE',
        },
        data: { status: 'UNLINKED', unlinkedAt: now },
      });

      if (unlinked.count > 0) {
        await tx.guestGameAuditEvent.create({
          data: {
            tenantId: scope.tenantId,
            profileId: scope.profileId,
            entityType: 'GUEST_GAME_EXTERNAL_ACCOUNT',
            action: 'STEAM_UNLINKED',
            status: 'SUCCEEDED',
            happenedAt: now,
          },
        });
      }
    });

    return this.readView(scope);
  }

  private async linkSteam(scope: AccountScope, steamId64: string, now: Date) {
    const cooldownStart = new Date(now.getTime() - STEAM_RELINK_COOLDOWN_MS);

    try {
      await this.prisma.$transaction(async (tx) => {
        // Serialize links of this exact Steam account in this network only.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`guest-game-steam:${scope.tenantId}:${steamId64}`}, 0))`;

        const active = await tx.guestGameExternalAccount.findFirst({
          where: {
            tenantId: scope.tenantId,
            provider: 'STEAM',
            externalId: steamId64,
            status: 'ACTIVE',
          },
          select: { profileId: true },
        });

        if (active?.profileId === scope.profileId) {
          return;
        }

        if (active) {
          throw new ConflictException(
            'Этот Steam уже привязан к другому гостю клуба. Если это ваш аккаунт, обратитесь к администратору.',
          );
        }

        const movedRecently = await tx.guestGameExternalAccount.findFirst({
          where: {
            tenantId: scope.tenantId,
            provider: 'STEAM',
            externalId: steamId64,
            status: 'UNLINKED',
            profileId: { not: scope.profileId },
            unlinkedAt: { gt: cooldownStart },
          },
          orderBy: { unlinkedAt: 'desc' },
          select: { unlinkedAt: true },
        });

        if (movedRecently?.unlinkedAt) {
          throw new ConflictException(
            `Этот Steam недавно был привязан к другому гостю. Привязать его можно после ${this.formatDate(movedRecently.unlinkedAt)}.`,
          );
        }

        const own = await tx.guestGameExternalAccount.findFirst({
          where: {
            tenantId: scope.tenantId,
            profileId: scope.profileId,
            provider: 'STEAM',
            status: 'ACTIVE',
          },
          select: { id: true },
        });

        if (own) {
          throw new ConflictException(
            'К профилю уже привязан другой Steam. Сначала отвяжите его.',
          );
        }

        const switchedRecently = await tx.guestGameExternalAccount.findFirst({
          where: {
            tenantId: scope.tenantId,
            profileId: scope.profileId,
            provider: 'STEAM',
            status: 'UNLINKED',
            externalId: { not: steamId64 },
            unlinkedAt: { gt: cooldownStart },
          },
          orderBy: { unlinkedAt: 'desc' },
          select: { unlinkedAt: true },
        });

        if (switchedRecently?.unlinkedAt) {
          throw new ConflictException(
            `Сменить Steam можно раз в 30 дней: следующая привязка после ${this.formatDate(switchedRecently.unlinkedAt)}.`,
          );
        }

        const account = await tx.guestGameExternalAccount.create({
          data: {
            tenantId: scope.tenantId,
            profileId: scope.profileId,
            provider: 'STEAM',
            externalId: steamId64,
            status: 'ACTIVE',
            verifiedVia: 'STEAM_OPENID',
            linkedAt: now,
            lookupStatus: 'PENDING',
          },
          select: { id: true },
        });

        await tx.guestGameAuditEvent.create({
          data: {
            tenantId: scope.tenantId,
            profileId: scope.profileId,
            entityType: 'GUEST_GAME_EXTERNAL_ACCOUNT',
            entityId: account.id,
            action: 'STEAM_LINKED',
            status: 'SUCCEEDED',
            happenedAt: now,
            payload: { steamId: steamId64, verifiedVia: 'STEAM_OPENID' },
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Steam уже привязан. Обновите страницу.');
      }
      throw error;
    }
  }

  private async readView(scope: AccountScope): Promise<GuestGameAccountsView> {
    const [active, lastUnlinked] = await Promise.all([
      this.prisma.guestGameExternalAccount.findMany({
        where: {
          tenantId: scope.tenantId,
          profileId: scope.profileId,
          status: 'ACTIVE',
        },
      }),
      this.prisma.guestGameExternalAccount.findFirst({
        where: {
          tenantId: scope.tenantId,
          profileId: scope.profileId,
          provider: 'STEAM',
          status: 'UNLINKED',
        },
        orderBy: { unlinkedAt: 'desc' },
        select: { unlinkedAt: true },
      }),
    ]);
    const steam = active.find((row) => row.provider === 'STEAM') ?? null;

    return buildGuestGameAccountsView({
      enabled: guestGameAccountsEnabled(this.configService),
      steam,
      faceit: steam
        ? (active.find((row) => row.provider === 'FACEIT') ?? null)
        : null,
      lastSteamUnlinkedAt: steam ? null : (lastUnlinked?.unlinkedAt ?? null),
    });
  }

  private assertEnabled() {
    if (!guestGameAccountsEnabled(this.configService)) {
      throw new NotFoundException(
        'Игровые аккаунты в этом клубе пока недоступны.',
      );
    }
  }

  private stateKey() {
    return resolveSecuritySecret(
      this.configService,
      'GUEST_PORTAL_JWT_SECRET',
      ['JWT_SECRET'],
    );
  }

  private publicWebUrl() {
    return (
      this.configService.get<string>('WEB_URL')?.trim() ||
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      this.configService.get<string>('NEXT_PUBLIC_WEB_URL')?.trim() ||
      'http://localhost:3000'
    );
  }

  private formatDate(unlinkedAt: Date) {
    return new Date(
      unlinkedAt.getTime() + STEAM_RELINK_COOLDOWN_MS,
    ).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
  }
}
