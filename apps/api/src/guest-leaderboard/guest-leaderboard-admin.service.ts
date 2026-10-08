import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  LEADERBOARD_BOARDS,
  LEADERBOARD_NETWORK_SCOPE_KEY,
  LeaderboardConfigError,
  leaderboardPlayerName,
  leaderboardPrizeLootBoxIds,
  networkTimeZone,
  normalizeLeaderboardConfig,
  type GuestLeaderboardConfig,
  type LeaderboardBoard,
} from './guest-leaderboard-core';
import { GuestLeaderboardReadService } from './guest-leaderboard-read.service';

/** Default name of a profile without a nickname (the import default). */
const RESET_DISPLAY_NAME = 'Гость клуба';
const STANDINGS_LIMIT = 50;

export type GuestLeaderboardSettingsResponse = {
  enabled: boolean;
  revision: number;
  updatedAt: string | null;
  config: GuestLeaderboardConfig;
  stores: Array<{ id: string; name: string; timeZone: string | null }>;
  lootBoxes: Array<{ id: string; name: string; status: string }>;
  networkTimeZone: string;
};

export type GuestLeaderboardSettingsDto = {
  enabled?: unknown;
  revision?: unknown;
  config?: unknown;
};

export type GuestLeaderboardAdminStanding = {
  rank: number;
  profileId: string;
  publicName: string;
  displayName: string | null;
  contactMasked: string | null;
  hasNickname: boolean;
  value: number;
  storeName: string | null;
};

export type GuestLeaderboardAdminStandings = {
  scopeKey: string;
  board: LeaderboardBoard;
  period: {
    key: string;
    label: string;
    resultsLabel: string;
    daysLeft: number;
  };
  totalPlayers: number;
  rows: GuestLeaderboardAdminStanding[];
  excluded: Array<{
    profileId: string;
    displayName: string | null;
    contactMasked: string | null;
  }>;
};

/**
 * Tenant administration of the leaderboard («Геймификация → Рейтинг»).
 * Reads need `view_guest_gamification`, writes `manage_guest_game_rules`
 * (RolesGuard maps GET and non-GET of /guests/gamification/* that way).
 * Every write is audited in GuestGameAuditEvent.
 */
@Injectable()
export class GuestLeaderboardAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: GuestLeaderboardReadService,
  ) {}

  async getSettings(
    user: AuthenticatedUser,
  ): Promise<GuestLeaderboardSettingsResponse> {
    const [settings, stores, lootBoxes] = await Promise.all([
      this.reader.loadSettings(user.tenantId),
      this.reader.loadStores(user.tenantId),
      this.prisma.guestGameLootBox.findMany({
        where: { tenantId: user.tenantId, status: { not: 'ARCHIVED' } },
        select: { id: true, name: true, status: true },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
    ]);
    return {
      enabled: settings.enabled,
      revision: settings.revision,
      updatedAt: settings.updatedAt?.toISOString() ?? null,
      config: settings.config,
      stores,
      lootBoxes,
      networkTimeZone: networkTimeZone(stores),
    };
  }

  async saveSettings(
    user: AuthenticatedUser,
    dto: GuestLeaderboardSettingsDto,
  ): Promise<GuestLeaderboardSettingsResponse> {
    const stores = await this.reader.loadStores(user.tenantId);
    const storeIds = new Set(stores.map((store) => store.id));
    const config = this.parseConfig(dto.config, storeIds);
    const missingStore = config.disabledStoreIds.find(
      (id) => !storeIds.has(id),
    );
    if (missingStore) {
      throw new BadRequestException('Настройки рейтинга: неизвестный клуб.');
    }
    await this.assertLootBoxes(user.tenantId, config);
    const enabled = dto.enabled === true;
    const expectedRevision =
      typeof dto.revision === 'number' && Number.isInteger(dto.revision)
        ? dto.revision
        : null;

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.guestLeaderboardSettings.findUnique({
        where: { tenantId: user.tenantId },
        select: { revision: true, config: true },
      });
      if ((current?.revision ?? 0) !== (expectedRevision ?? 0)) {
        throw new ConflictException(
          'Настройки рейтинга уже изменил другой сотрудник. Обновите страницу.',
        );
      }
      // Exclusions are changed only by the moderation action; a settings save
      // from an older page keeps the stored list.
      const storedExcluded = current
        ? this.safeConfig(current.config).excludedProfileIds
        : [];
      const nextConfig = { ...config, excludedProfileIds: storedExcluded };
      const revision = (current?.revision ?? 0) + 1;
      await tx.guestLeaderboardSettings.upsert({
        where: { tenantId: user.tenantId },
        create: {
          tenantId: user.tenantId,
          enabled,
          config: nextConfig,
          revision,
          updatedByUserId: user.id,
        },
        update: {
          enabled,
          config: nextConfig,
          revision,
          updatedByUserId: user.id,
        },
      });
      await tx.guestGameAuditEvent.create({
        data: {
          tenantId: user.tenantId,
          entityType: 'LEADERBOARD_SETTINGS',
          entityId: user.tenantId,
          action: 'LEADERBOARD_SETTINGS_UPDATED',
          status: 'APPLIED',
          payload: {
            revision,
            enabled,
            actorUserId: user.id,
            boards: nextConfig.boards,
            networkEnabled: nextConfig.networkEnabled,
            disabledStoreIds: nextConfig.disabledStoreIds,
            formula: nextConfig.formula,
            prizeScopes: Object.keys(nextConfig.prizes),
          },
        },
      });
    });

    this.reader.invalidateSettings(user.tenantId);
    return this.getSettings(user);
  }

  async getStandings(
    user: AuthenticatedUser,
    query: { scope?: unknown; board?: unknown },
  ): Promise<GuestLeaderboardAdminStandings> {
    const now = new Date();
    const [settings, stores] = await Promise.all([
      this.reader.loadSettings(user.tenantId),
      this.reader.loadStores(user.tenantId),
    ]);
    const scopeKey =
      typeof query.scope === 'string' &&
      stores.some((s) => s.id === query.scope)
        ? query.scope
        : LEADERBOARD_NETWORK_SCOPE_KEY;
    const board = (LEADERBOARD_BOARDS as readonly string[]).includes(
      String(query.board),
    )
      ? (query.board as LeaderboardBoard)
      : 'points';
    const store =
      scopeKey === LEADERBOARD_NETWORK_SCOPE_KEY
        ? null
        : (stores.find((row) => row.id === scopeKey) ?? null);
    const period = this.reader.periodFor(
      store ? 'club' : 'network',
      store,
      stores,
      now,
    );
    // Moderators see excluded players too, so the list is ranked without them
    // and they are returned separately.
    const standings = await this.reader.standings({
      tenantId: user.tenantId,
      storeId: store?.id ?? null,
      board,
      config: settings.config,
      from: period.from,
      to: period.to,
      now,
    });
    const top = standings.slice(0, STANDINGS_LIMIT);
    const excludedIds = settings.config.excludedProfileIds;
    const names = await this.reader.profileNames(user.tenantId, [
      ...new Set([...top.map((row) => row.profileId), ...excludedIds]),
    ]);
    const homeStores = store
      ? new Map<string, string>()
      : await this.reader.homeStores(
          user.tenantId,
          period,
          now,
          top.map((row) => row.profileId),
        );
    const storeNames = new Map(stores.map((row) => [row.id, row.name]));

    return {
      scopeKey,
      board,
      period: {
        key: period.key,
        label: period.label,
        resultsLabel: period.resultsLabel,
        daysLeft: period.daysLeft,
      },
      totalPlayers: standings.length,
      rows: top.map((row) => {
        const profile = names.get(row.profileId);
        const publicName = leaderboardPlayerName({
          displayName: profile?.displayName,
          contactMasked: profile?.contactMasked,
          importedNames: [
            profile?.guest?.fullNameMasked,
            profile?.guest?.externalGuestId,
          ],
        });
        return {
          rank: row.rank,
          profileId: row.profileId,
          publicName: publicName.name,
          displayName: profile?.displayName ?? null,
          contactMasked: profile?.contactMasked ?? null,
          hasNickname: publicName.hasNickname,
          value: row.value,
          storeName: store
            ? store.name
            : (storeNames.get(homeStores.get(row.profileId) ?? '') ?? null),
        };
      }),
      excluded: excludedIds.map((profileId) => ({
        profileId,
        displayName: names.get(profileId)?.displayName ?? null,
        contactMasked: names.get(profileId)?.contactMasked ?? null,
      })),
    };
  }

  async setExclusion(
    user: AuthenticatedUser,
    profileId: string,
    dto: { excluded?: unknown },
  ) {
    const excluded = dto.excluded === true;
    await this.assertProfile(user.tenantId, profileId);
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.guestLeaderboardSettings.findUnique({
        where: { tenantId: user.tenantId },
        select: { revision: true, config: true, enabled: true },
      });
      const config = current
        ? this.safeConfig(current.config)
        : normalizeLeaderboardConfig(null);
      const ids = new Set(config.excludedProfileIds);
      if (excluded) ids.add(profileId);
      else ids.delete(profileId);
      const nextConfig = normalizeLeaderboardConfig({
        ...config,
        excludedProfileIds: [...ids],
      });
      const revision = (current?.revision ?? 0) + 1;
      await tx.guestLeaderboardSettings.upsert({
        where: { tenantId: user.tenantId },
        create: {
          tenantId: user.tenantId,
          enabled: false,
          config: nextConfig,
          revision,
          updatedByUserId: user.id,
        },
        update: {
          config: nextConfig,
          revision,
          updatedByUserId: user.id,
        },
      });
      await tx.guestGameAuditEvent.create({
        data: {
          tenantId: user.tenantId,
          profileId,
          entityType: 'LEADERBOARD_SETTINGS',
          entityId: user.tenantId,
          action: excluded
            ? 'LEADERBOARD_PROFILE_EXCLUDED'
            : 'LEADERBOARD_PROFILE_RESTORED',
          status: 'APPLIED',
          payload: { revision, actorUserId: user.id },
        },
      });
      return { revision, excluded };
    });
    this.reader.invalidateSettings(user.tenantId);
    return { profileId, ...result };
  }

  async resetNickname(user: AuthenticatedUser, profileId: string) {
    const profile = await this.assertProfile(user.tenantId, profileId);
    await this.prisma.$transaction([
      this.prisma.guestGameProfile.update({
        where: { id: profile.id },
        data: { displayName: RESET_DISPLAY_NAME },
      }),
      this.prisma.guestGameAuditEvent.create({
        data: {
          tenantId: user.tenantId,
          profileId: profile.id,
          entityType: 'GUEST_GAME_PROFILE',
          entityId: profile.id,
          action: 'LEADERBOARD_NICKNAME_RESET',
          status: 'APPLIED',
          payload: {
            previousDisplayName: profile.displayName,
            actorUserId: user.id,
          },
        },
      }),
    ]);
    return { profileId: profile.id, displayName: RESET_DISPLAY_NAME };
  }

  private parseConfig(input: unknown, storeIds: ReadonlySet<string>) {
    try {
      return normalizeLeaderboardConfig(
        input,
        new Set([LEADERBOARD_NETWORK_SCOPE_KEY, ...storeIds]),
      );
    } catch (error) {
      if (error instanceof LeaderboardConfigError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private safeConfig(value: unknown) {
    try {
      return normalizeLeaderboardConfig(value);
    } catch {
      return normalizeLeaderboardConfig(null);
    }
  }

  private async assertLootBoxes(
    tenantId: string,
    config: GuestLeaderboardConfig,
  ) {
    const ids = leaderboardPrizeLootBoxIds(config);
    if (ids.length === 0) return;
    const found = await this.prisma.guestGameLootBox.count({
      where: { tenantId, id: { in: ids } },
    });
    if (found !== ids.length) {
      throw new BadRequestException('Приз-кейс: кейс не найден в этой сети.');
    }
  }

  private async assertProfile(tenantId: string, profileId: string) {
    const profile = await this.prisma.guestGameProfile.findFirst({
      where: { tenantId, id: profileId },
      select: { id: true, displayName: true },
    });
    if (!profile) {
      throw new NotFoundException('Игрок не найден.');
    }
    return profile;
  }
}
