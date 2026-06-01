import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const statusValues = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'FINISHED',
  'ARCHIVED',
] as const;
const profileStatuses = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
const rewardStatuses = [
  'PENDING',
  'APPROVED',
  'PAID',
  'CANCELED',
  'EXPIRED',
] as const;
const rewardSources = ['MANUAL', 'LANGAME', 'API_IMPORT', 'CASHIER'] as const;
const eventSources = ['MANUAL', 'LANGAME', 'API_IMPORT', 'SYSTEM'] as const;

type StatusValue = (typeof statusValues)[number];
type ProfileStatus = (typeof profileStatuses)[number];
type RewardStatus = (typeof rewardStatuses)[number];
type RewardSource = (typeof rewardSources)[number];
type EventSource = (typeof eventSources)[number];

const gameProfileInclude = {
  guest: {
    select: {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      fullNameMasked: true,
      phoneMasked: true,
      emailMasked: true,
    },
  },
  lead: {
    select: {
      id: true,
      fullNameMasked: true,
      phoneMasked: true,
      emailMasked: true,
      matchedGuestId: true,
    },
  },
  createdByUser: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.GuestGameProfileInclude;

const audienceSelect = {
  id: true,
  name: true,
  description: true,
  guestsCount: true,
} satisfies Prisma.GuestAudienceSelect;

const creatorSelect = {
  id: true,
  fullName: true,
  email: true,
} satisfies Prisma.UserSelect;

const lootBoxInclude = {
  audience: { select: audienceSelect },
  createdByUser: { select: creatorSelect },
} satisfies Prisma.GuestGameLootBoxInclude;

const missionInclude = {
  audience: { select: audienceSelect },
  createdByUser: { select: creatorSelect },
} satisfies Prisma.GuestGameMissionInclude;

const seasonInclude = {
  audience: { select: audienceSelect },
  createdByUser: { select: creatorSelect },
} satisfies Prisma.GuestGameSeasonInclude;

const rewardInclude = {
  profile: {
    select: {
      id: true,
      displayName: true,
      contactMasked: true,
      xp: true,
      level: true,
    },
  },
  guest: {
    select: {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      fullNameMasked: true,
      phoneMasked: true,
      emailMasked: true,
    },
  },
  lootBox: { select: { id: true, name: true, status: true } },
  mission: { select: { id: true, name: true, status: true, xpReward: true } },
  season: { select: { id: true, name: true, status: true } },
  store: { select: { id: true, name: true } },
  createdByUser: { select: creatorSelect },
  approvedByUser: { select: creatorSelect },
} satisfies Prisma.GuestGameRewardInclude;

const eventInclude = {
  profile: {
    select: {
      id: true,
      displayName: true,
      contactMasked: true,
      xp: true,
      level: true,
    },
  },
  guest: {
    select: {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      fullNameMasked: true,
      phoneMasked: true,
    },
  },
  lootBox: { select: { id: true, name: true } },
  mission: { select: { id: true, name: true } },
  season: { select: { id: true, name: true } },
  createdByUser: { select: creatorSelect },
} satisfies Prisma.GuestGameEventInclude;

type ProfileRow = Prisma.GuestGameProfileGetPayload<{
  include: typeof gameProfileInclude;
}>;
type LootBoxRow = Prisma.GuestGameLootBoxGetPayload<{
  include: typeof lootBoxInclude;
}>;
type MissionRow = Prisma.GuestGameMissionGetPayload<{
  include: typeof missionInclude;
}>;
type SeasonRow = Prisma.GuestGameSeasonGetPayload<{
  include: typeof seasonInclude;
}>;
type RewardRow = Prisma.GuestGameRewardGetPayload<{
  include: typeof rewardInclude;
}>;
type EventRow = Prisma.GuestGameEventGetPayload<{
  include: typeof eventInclude;
}>;

export type GuestGameUser = {
  id: string;
  displayName: string;
  email: string;
};

export type GuestGameAudience = {
  id: string;
  name: string;
  description: string | null;
  guestsCount: number;
};

export type GuestGameProfile = {
  id: string;
  displayName: string;
  contactMasked: string | null;
  phoneHash: string | null;
  telegramIdentity: string | null;
  maxIdentity: string | null;
  xp: number;
  level: number;
  status: ProfileStatus;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  guest: {
    id: string;
    externalDomain: string | null;
    externalGuestId: string;
    displayName: string;
    contact: string;
  } | null;
  lead: {
    id: string;
    displayName: string;
    contact: string;
    matchedGuestId: string | null;
  } | null;
  createdBy: GuestGameUser | null;
};

export type GuestGameRuleBase = {
  id: string;
  name: string;
  status: StatusValue;
  rewardType: string;
  rewardAmount: number | null;
  rewardLabel: string | null;
  storeIds: string[];
  budgetAmount: number | null;
  manualApprovalRequired: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  audience: GuestGameAudience | null;
  createdBy: GuestGameUser | null;
};

export type GuestGameLootBox = GuestGameRuleBase & {
  triggerKind: string;
  segment: string | null;
  sessionType: string | null;
  periodRules: Prisma.JsonValue | null;
  limits: Prisma.JsonValue | null;
  probabilityRules: Prisma.JsonValue;
  antiFraudRules: Prisma.JsonValue | null;
};

export type GuestGameMission = GuestGameRuleBase & {
  missionType: string;
  triggerKind: string;
  xpReward: number;
  progressTarget: number | null;
  progressUnit: string | null;
  conditions: Prisma.JsonValue;
  periodFrom: string | null;
  periodTo: string | null;
  perGuestLimit: number | null;
  totalRewardLimit: number | null;
  antiFraudRules: Prisma.JsonValue | null;
};

export type GuestGameSeason = {
  id: string;
  name: string;
  status: StatusValue;
  seasonType: string;
  periodFrom: string | null;
  periodTo: string | null;
  xpRules: Prisma.JsonValue;
  levels: Prisma.JsonValue;
  freeRewards: Prisma.JsonValue | null;
  premiumRewards: Prisma.JsonValue | null;
  premiumEnabled: boolean;
  premiumUpgradeMode: string | null;
  budgetAmount: number | null;
  manualApprovalRequired: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  audience: GuestGameAudience | null;
  createdBy: GuestGameUser | null;
};

export type GuestGameReward = {
  id: string;
  status: RewardStatus;
  source: RewardSource;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
  guestExternalId: string | null;
  rewardType: string;
  rewardAmount: number;
  rewardLabel: string;
  rewardCode: string | null;
  qualifiedAt: string;
  expiresAt: string | null;
  paidAt: string | null;
  note: string | null;
  evidence: Prisma.JsonValue | null;
  createdAt: string;
  updatedAt: string;
  profile: Pick<
    GuestGameProfile,
    'id' | 'displayName' | 'contactMasked' | 'xp' | 'level'
  > | null;
  guest: GuestGameProfile['guest'];
  lootBox: { id: string; name: string; status: string } | null;
  mission: {
    id: string;
    name: string;
    status: string;
    xpReward: number;
  } | null;
  season: { id: string; name: string; status: string } | null;
  store: { id: string; name: string } | null;
  createdBy: GuestGameUser | null;
  approvedBy: GuestGameUser | null;
};

export type GuestGameEvent = {
  id: string;
  eventType: string;
  source: EventSource;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
  xpDelta: number;
  occurredAt: string;
  payload: Prisma.JsonValue | null;
  note: string | null;
  createdAt: string;
  profile: Pick<
    GuestGameProfile,
    'id' | 'displayName' | 'contactMasked' | 'xp' | 'level'
  > | null;
  guest: GuestGameProfile['guest'];
  lootBox: { id: string; name: string } | null;
  mission: { id: string; name: string } | null;
  season: { id: string; name: string } | null;
  createdBy: GuestGameUser | null;
};

export type GuestGamificationSummary = {
  profilesCount: number;
  totalXp: number;
  averageLevel: number;
  activeLootBoxes: number;
  activeMissions: number;
  activeSeasons: number;
  pendingRewards: number;
  approvedRewards: number;
  paidRewards: number;
  expiredRewards: number;
  plannedBudget: number;
  pendingRewardAmount: number;
  paidRewardAmount: number;
};

export type GuestGamificationWorkspace = {
  summary: GuestGamificationSummary;
  profiles: GuestGameProfile[];
  lootBoxes: GuestGameLootBox[];
  missions: GuestGameMission[];
  seasons: GuestGameSeason[];
  rewards: GuestGameReward[];
  events: GuestGameEvent[];
};

export type GuestGameProfileDto = {
  guestId?: string | null;
  leadId?: string | null;
  displayName?: string | null;
  contactMasked?: string | null;
  phoneHash?: string | null;
  telegramIdentity?: string | null;
  maxIdentity?: string | null;
  xp?: number | string | null;
  level?: number | string | null;
  status?: string | null;
  lastActivityAt?: string | null;
};

export type GuestGameProfileUpdateDto = Partial<GuestGameProfileDto>;

export type GuestGameLootBoxDto = {
  name?: string;
  status?: string;
  triggerKind?: string;
  rewardType?: string;
  rewardAmount?: number | string | null;
  rewardLabel?: string | null;
  audienceId?: string | null;
  segment?: string | null;
  sessionType?: string | null;
  storeIds?: string[];
  periodRules?: Prisma.InputJsonValue | null;
  limits?: Prisma.InputJsonValue | null;
  probabilityRules?: Prisma.InputJsonValue | null;
  budgetAmount?: number | string | null;
  antiFraudRules?: Prisma.InputJsonValue | null;
  manualApprovalRequired?: boolean;
  note?: string | null;
};

export type GuestGameLootBoxUpdateDto = Partial<GuestGameLootBoxDto>;

export type GuestGameMissionDto = {
  name?: string;
  status?: string;
  missionType?: string;
  triggerKind?: string;
  rewardType?: string;
  rewardAmount?: number | string | null;
  rewardLabel?: string | null;
  xpReward?: number | string | null;
  progressTarget?: number | string | null;
  progressUnit?: string | null;
  audienceId?: string | null;
  conditions?: Prisma.InputJsonValue | null;
  storeIds?: string[];
  periodFrom?: string | null;
  periodTo?: string | null;
  budgetAmount?: number | string | null;
  perGuestLimit?: number | string | null;
  totalRewardLimit?: number | string | null;
  antiFraudRules?: Prisma.InputJsonValue | null;
  manualApprovalRequired?: boolean;
  note?: string | null;
};

export type GuestGameMissionUpdateDto = Partial<GuestGameMissionDto>;

export type GuestGameSeasonDto = {
  name?: string;
  status?: string;
  seasonType?: string;
  audienceId?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  xpRules?: Prisma.InputJsonValue | null;
  levels?: Prisma.InputJsonValue | null;
  freeRewards?: Prisma.InputJsonValue | null;
  premiumRewards?: Prisma.InputJsonValue | null;
  premiumEnabled?: boolean;
  premiumUpgradeMode?: string | null;
  budgetAmount?: number | string | null;
  manualApprovalRequired?: boolean;
  note?: string | null;
};

export type GuestGameSeasonUpdateDto = Partial<GuestGameSeasonDto>;

export type GuestGameRewardDto = {
  profileId?: string | null;
  guestId?: string | null;
  lootBoxId?: string | null;
  missionId?: string | null;
  seasonId?: string | null;
  storeId?: string | null;
  status?: string | null;
  source?: string | null;
  externalProvider?: string | null;
  externalDomain?: string | null;
  externalId?: string | null;
  guestExternalId?: string | null;
  rewardType?: string;
  rewardAmount?: number | string | null;
  rewardLabel?: string;
  rewardCode?: string | null;
  qualifiedAt?: string | null;
  expiresAt?: string | null;
  note?: string | null;
  evidence?: Prisma.InputJsonValue | null;
};

export type GuestGameRewardUpdateDto = Partial<GuestGameRewardDto>;

export type GuestGameEventDto = {
  profileId?: string | null;
  guestId?: string | null;
  lootBoxId?: string | null;
  missionId?: string | null;
  seasonId?: string | null;
  eventType?: string;
  source?: string | null;
  externalProvider?: string | null;
  externalDomain?: string | null;
  externalId?: string | null;
  xpDelta?: number | string | null;
  occurredAt?: string | null;
  payload?: Prisma.InputJsonValue | null;
  note?: string | null;
};

@Injectable()
export class GuestGamificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspace(
    user: AuthenticatedUser,
  ): Promise<GuestGamificationWorkspace> {
    const [profiles, lootBoxes, missions, seasons, rewards, events] =
      await Promise.all([
        this.getProfiles(user),
        this.getLootBoxes(user),
        this.getMissions(user),
        this.getSeasons(user),
        this.getRewards(user),
        this.getEvents(user),
      ]);

    return {
      summary: this.buildSummary(
        profiles,
        lootBoxes,
        missions,
        seasons,
        rewards,
      ),
      profiles,
      lootBoxes,
      missions,
      seasons,
      rewards,
      events,
    };
  }

  async getProfiles(user: AuthenticatedUser): Promise<GuestGameProfile[]> {
    const rows = await this.prisma.guestGameProfile.findMany({
      where: { tenantId: user.tenantId },
      include: gameProfileInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });

    return rows.map(mapProfile);
  }

  async createProfile(
    user: AuthenticatedUser,
    dto: GuestGameProfileDto,
  ): Promise<GuestGameProfile> {
    const data = (await this.buildProfileData(
      user,
      dto,
      true,
    )) as Prisma.GuestGameProfileUncheckedCreateInput;
    const row = await this.prisma.guestGameProfile.create({
      data,
      include: gameProfileInclude,
    });

    await this.createSystemEvent(user, {
      profileId: row.id,
      guestId: row.guestId,
      eventType: 'PROFILE_CREATED',
      xpDelta: 0,
      note: 'Игровой профиль создан в LeetPlus.',
    });

    return mapProfile(row);
  }

  async updateProfile(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameProfileUpdateDto,
  ): Promise<GuestGameProfile> {
    await this.assertProfile(user, id);
    const data = await this.buildProfileData(user, dto, false);
    const row = await this.prisma.guestGameProfile.update({
      where: { id },
      data,
      include: gameProfileInclude,
    });

    return mapProfile(row);
  }

  async getLootBoxes(user: AuthenticatedUser): Promise<GuestGameLootBox[]> {
    const rows = await this.prisma.guestGameLootBox.findMany({
      where: { tenantId: user.tenantId },
      include: lootBoxInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map(mapLootBox);
  }

  async createLootBox(
    user: AuthenticatedUser,
    dto: GuestGameLootBoxDto,
  ): Promise<GuestGameLootBox> {
    const data = (await this.buildLootBoxData(
      user,
      dto,
      true,
    )) as Prisma.GuestGameLootBoxUncheckedCreateInput;
    const row = await this.prisma.guestGameLootBox.create({
      data,
      include: lootBoxInclude,
    });

    return mapLootBox(row);
  }

  async updateLootBox(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameLootBoxUpdateDto,
  ): Promise<GuestGameLootBox> {
    await this.assertLootBox(user, id);
    const data = await this.buildLootBoxData(user, dto, false);
    const row = await this.prisma.guestGameLootBox.update({
      where: { id },
      data,
      include: lootBoxInclude,
    });

    return mapLootBox(row);
  }

  async getMissions(user: AuthenticatedUser): Promise<GuestGameMission[]> {
    const rows = await this.prisma.guestGameMission.findMany({
      where: { tenantId: user.tenantId },
      include: missionInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map(mapMission);
  }

  async createMission(
    user: AuthenticatedUser,
    dto: GuestGameMissionDto,
  ): Promise<GuestGameMission> {
    const data = (await this.buildMissionData(
      user,
      dto,
      true,
    )) as Prisma.GuestGameMissionUncheckedCreateInput;
    const row = await this.prisma.guestGameMission.create({
      data,
      include: missionInclude,
    });

    return mapMission(row);
  }

  async updateMission(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameMissionUpdateDto,
  ): Promise<GuestGameMission> {
    await this.assertMission(user, id);
    const data = await this.buildMissionData(user, dto, false);
    const row = await this.prisma.guestGameMission.update({
      where: { id },
      data,
      include: missionInclude,
    });

    return mapMission(row);
  }

  async getSeasons(user: AuthenticatedUser): Promise<GuestGameSeason[]> {
    const rows = await this.prisma.guestGameSeason.findMany({
      where: { tenantId: user.tenantId },
      include: seasonInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map(mapSeason);
  }

  async createSeason(
    user: AuthenticatedUser,
    dto: GuestGameSeasonDto,
  ): Promise<GuestGameSeason> {
    const data = (await this.buildSeasonData(
      user,
      dto,
      true,
    )) as Prisma.GuestGameSeasonUncheckedCreateInput;
    const row = await this.prisma.guestGameSeason.create({
      data,
      include: seasonInclude,
    });

    return mapSeason(row);
  }

  async updateSeason(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameSeasonUpdateDto,
  ): Promise<GuestGameSeason> {
    await this.assertSeason(user, id);
    const data = await this.buildSeasonData(user, dto, false);
    const row = await this.prisma.guestGameSeason.update({
      where: { id },
      data,
      include: seasonInclude,
    });

    return mapSeason(row);
  }

  async getRewards(user: AuthenticatedUser): Promise<GuestGameReward[]> {
    const rows = await this.prisma.guestGameReward.findMany({
      where: { tenantId: user.tenantId },
      include: rewardInclude,
      orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return rows.map(mapReward);
  }

  async createReward(
    user: AuthenticatedUser,
    dto: GuestGameRewardDto,
  ): Promise<GuestGameReward> {
    const data = (await this.buildRewardData(
      user,
      dto,
      true,
    )) as Prisma.GuestGameRewardUncheckedCreateInput;
    const row = await this.prisma.guestGameReward.create({
      data,
      include: rewardInclude,
    });

    await this.createSystemEvent(user, {
      profileId: row.profileId,
      guestId: row.guestId,
      lootBoxId: row.lootBoxId,
      missionId: row.missionId,
      seasonId: row.seasonId,
      eventType: 'REWARD_QUALIFIED',
      xpDelta: 0,
      note: row.rewardLabel,
    });

    return mapReward(row);
  }

  async updateReward(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameRewardUpdateDto,
  ): Promise<GuestGameReward> {
    await this.assertReward(user, id);
    const data = await this.buildRewardData(user, dto, false);
    const row = await this.prisma.guestGameReward.update({
      where: { id },
      data,
      include: rewardInclude,
    });

    if (dto.status === 'PAID') {
      await this.createSystemEvent(user, {
        profileId: row.profileId,
        guestId: row.guestId,
        lootBoxId: row.lootBoxId,
        missionId: row.missionId,
        seasonId: row.seasonId,
        eventType: 'REWARD_PAID',
        xpDelta: 0,
        note: row.rewardLabel,
      });
    }

    return mapReward(row);
  }

  async getEvents(user: AuthenticatedUser): Promise<GuestGameEvent[]> {
    const rows = await this.prisma.guestGameEvent.findMany({
      where: { tenantId: user.tenantId },
      include: eventInclude,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return rows.map(mapEvent);
  }

  async createEvent(
    user: AuthenticatedUser,
    dto: GuestGameEventDto,
  ): Promise<GuestGameEvent> {
    const data = await this.buildEventData(user, dto);
    const row = await this.prisma.guestGameEvent.create({
      data,
      include: eventInclude,
    });

    if (row.profileId && row.xpDelta !== 0) {
      await this.applyXp(user, row.profileId, row.xpDelta);
      const updated = await this.prisma.guestGameEvent.findUnique({
        where: { id: row.id },
        include: eventInclude,
      });

      return mapEvent(updated ?? row);
    }

    return mapEvent(row);
  }

  private buildSummary(
    profiles: GuestGameProfile[],
    lootBoxes: GuestGameLootBox[],
    missions: GuestGameMission[],
    seasons: GuestGameSeason[],
    rewards: GuestGameReward[],
  ): GuestGamificationSummary {
    const plannedBudget =
      sum(lootBoxes.map((item) => item.budgetAmount ?? 0)) +
      sum(missions.map((item) => item.budgetAmount ?? 0)) +
      sum(seasons.map((item) => item.budgetAmount ?? 0));
    const pendingRewards = rewards.filter(
      (reward) => reward.status === 'PENDING',
    );
    const approvedRewards = rewards.filter(
      (reward) => reward.status === 'APPROVED',
    );
    const paidRewards = rewards.filter((reward) => reward.status === 'PAID');

    return {
      profilesCount: profiles.length,
      totalXp: sum(profiles.map((profile) => profile.xp)),
      averageLevel: profiles.length
        ? Math.round(
            (sum(profiles.map((profile) => profile.level)) / profiles.length) *
              10,
          ) / 10
        : 0,
      activeLootBoxes: lootBoxes.filter((item) => item.status === 'ACTIVE')
        .length,
      activeMissions: missions.filter((item) => item.status === 'ACTIVE')
        .length,
      activeSeasons: seasons.filter((item) => item.status === 'ACTIVE').length,
      pendingRewards: pendingRewards.length,
      approvedRewards: approvedRewards.length,
      paidRewards: paidRewards.length,
      expiredRewards: rewards.filter((reward) => reward.status === 'EXPIRED')
        .length,
      plannedBudget,
      pendingRewardAmount: sum(
        pendingRewards.map((reward) => reward.rewardAmount),
      ),
      paidRewardAmount: sum(paidRewards.map((reward) => reward.rewardAmount)),
    };
  }

  private async buildProfileData(
    user: AuthenticatedUser,
    dto: GuestGameProfileDto,
    isCreate: boolean,
  ): Promise<
    | Prisma.GuestGameProfileUncheckedCreateInput
    | Prisma.GuestGameProfileUncheckedUpdateInput
  > {
    const guest = dto.guestId
      ? await this.getTenantGuest(user, dto.guestId)
      : null;
    const lead = dto.leadId ? await this.getTenantLead(user, dto.leadId) : null;
    const xp = intValue(dto.xp);
    const level = intValue(dto.level);

    if (!isCreate && Object.keys(dto).length === 0) {
      return {};
    }

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      guestId: nullableId(dto.guestId),
      leadId: nullableId(dto.leadId),
      createdByUserId: isCreate ? user.id : undefined,
      displayName:
        stringValue(dto.displayName) ??
        guest?.fullNameMasked ??
        lead?.fullNameMasked ??
        guest?.externalGuestId,
      contactMasked:
        stringValue(dto.contactMasked) ??
        guest?.phoneMasked ??
        lead?.phoneMasked ??
        guest?.emailMasked ??
        lead?.emailMasked,
      phoneHash: nullableString(dto.phoneHash),
      telegramIdentity: nullableString(dto.telegramIdentity),
      maxIdentity: nullableString(dto.maxIdentity),
      xp: xp ?? (isCreate ? 0 : undefined),
      level: level ?? (xp != null ? levelFromXp(xp) : isCreate ? 1 : undefined),
      status: enumValue(
        dto.status,
        profileStatuses,
        isCreate ? 'ACTIVE' : undefined,
      ),
      lastActivityAt: dateValue(dto.lastActivityAt),
    });
  }

  private async buildLootBoxData(
    user: AuthenticatedUser,
    dto: GuestGameLootBoxDto,
    isCreate: boolean,
  ): Promise<
    | Prisma.GuestGameLootBoxUncheckedCreateInput
    | Prisma.GuestGameLootBoxUncheckedUpdateInput
  > {
    if (dto.audienceId) {
      await this.assertAudience(user, dto.audienceId);
    }

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      audienceId: nullableId(dto.audienceId),
      createdByUserId: isCreate ? user.id : undefined,
      name: requiredString(dto.name, 'Название лутбокса', isCreate),
      status: enumValue(
        dto.status,
        statusValues,
        isCreate ? 'DRAFT' : undefined,
      ),
      triggerKind:
        stringValue(dto.triggerKind) ??
        (isCreate ? 'SESSION_START' : undefined),
      rewardType:
        stringValue(dto.rewardType) ?? (isCreate ? 'PROMOCODE' : undefined),
      rewardAmount: decimalValue(dto.rewardAmount),
      rewardLabel: nullableString(dto.rewardLabel),
      segment: nullableString(dto.segment),
      sessionType: nullableString(dto.sessionType),
      storeIds: jsonValue(dto.storeIds),
      periodRules: jsonValue(dto.periodRules),
      limits: jsonValue(dto.limits),
      probabilityRules:
        jsonValue(dto.probabilityRules) ??
        (isCreate ? defaultProbabilityRules() : undefined),
      budgetAmount: decimalValue(dto.budgetAmount),
      antiFraudRules: jsonValue(dto.antiFraudRules),
      manualApprovalRequired:
        dto.manualApprovalRequired ?? (isCreate ? true : undefined),
      note: nullableString(dto.note),
    });
  }

  private async buildMissionData(
    user: AuthenticatedUser,
    dto: GuestGameMissionDto,
    isCreate: boolean,
  ): Promise<
    | Prisma.GuestGameMissionUncheckedCreateInput
    | Prisma.GuestGameMissionUncheckedUpdateInput
  > {
    if (dto.audienceId) {
      await this.assertAudience(user, dto.audienceId);
    }

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      audienceId: nullableId(dto.audienceId),
      createdByUserId: isCreate ? user.id : undefined,
      name: requiredString(dto.name, 'Название миссии', isCreate),
      status: enumValue(
        dto.status,
        statusValues,
        isCreate ? 'DRAFT' : undefined,
      ),
      missionType:
        stringValue(dto.missionType) ?? (isCreate ? 'REPEAT_VISIT' : undefined),
      triggerKind:
        stringValue(dto.triggerKind) ?? (isCreate ? 'REPEAT_VISIT' : undefined),
      rewardType:
        stringValue(dto.rewardType) ?? (isCreate ? 'PROMOCODE' : undefined),
      rewardAmount: decimalValue(dto.rewardAmount),
      rewardLabel: nullableString(dto.rewardLabel),
      xpReward: intValue(dto.xpReward) ?? (isCreate ? 50 : undefined),
      progressTarget: intValue(dto.progressTarget),
      progressUnit: nullableString(dto.progressUnit),
      conditions:
        jsonValue(dto.conditions) ??
        (isCreate ? defaultMissionConditions() : undefined),
      storeIds: jsonValue(dto.storeIds),
      periodFrom: dateValue(dto.periodFrom),
      periodTo: dateValue(dto.periodTo),
      budgetAmount: decimalValue(dto.budgetAmount),
      perGuestLimit: intValue(dto.perGuestLimit),
      totalRewardLimit: intValue(dto.totalRewardLimit),
      antiFraudRules: jsonValue(dto.antiFraudRules),
      manualApprovalRequired:
        dto.manualApprovalRequired ?? (isCreate ? true : undefined),
      note: nullableString(dto.note),
    });
  }

  private async buildSeasonData(
    user: AuthenticatedUser,
    dto: GuestGameSeasonDto,
    isCreate: boolean,
  ): Promise<
    | Prisma.GuestGameSeasonUncheckedCreateInput
    | Prisma.GuestGameSeasonUncheckedUpdateInput
  > {
    if (dto.audienceId) {
      await this.assertAudience(user, dto.audienceId);
    }

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      audienceId: nullableId(dto.audienceId),
      createdByUserId: isCreate ? user.id : undefined,
      name: requiredString(dto.name, 'Название сезона', isCreate),
      status: enumValue(
        dto.status,
        statusValues,
        isCreate ? 'DRAFT' : undefined,
      ),
      seasonType:
        stringValue(dto.seasonType) ?? (isCreate ? 'CLUB_SEASON' : undefined),
      periodFrom: dateValue(dto.periodFrom),
      periodTo: dateValue(dto.periodTo),
      xpRules:
        jsonValue(dto.xpRules) ?? (isCreate ? defaultXpRules() : undefined),
      levels: jsonValue(dto.levels) ?? (isCreate ? defaultLevels() : undefined),
      freeRewards: jsonValue(dto.freeRewards),
      premiumRewards: jsonValue(dto.premiumRewards),
      premiumEnabled: dto.premiumEnabled ?? (isCreate ? false : undefined),
      premiumUpgradeMode: nullableString(dto.premiumUpgradeMode),
      budgetAmount: decimalValue(dto.budgetAmount),
      manualApprovalRequired:
        dto.manualApprovalRequired ?? (isCreate ? true : undefined),
      note: nullableString(dto.note),
    });
  }

  private async buildRewardData(
    user: AuthenticatedUser,
    dto: GuestGameRewardDto,
    isCreate: boolean,
  ): Promise<
    | Prisma.GuestGameRewardUncheckedCreateInput
    | Prisma.GuestGameRewardUncheckedUpdateInput
  > {
    if (dto.profileId) {
      await this.assertProfile(user, dto.profileId);
    }
    if (dto.guestId) {
      await this.getTenantGuest(user, dto.guestId);
    }
    if (dto.lootBoxId) {
      await this.assertLootBox(user, dto.lootBoxId);
    }
    if (dto.missionId) {
      await this.assertMission(user, dto.missionId);
    }
    if (dto.seasonId) {
      await this.assertSeason(user, dto.seasonId);
    }
    if (dto.storeId) {
      await this.assertStore(user, dto.storeId);
    }

    const status = enumValue(
      dto.status,
      rewardStatuses,
      isCreate ? 'PENDING' : undefined,
    );

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      profileId: nullableId(dto.profileId),
      guestId: nullableId(dto.guestId),
      lootBoxId: nullableId(dto.lootBoxId),
      missionId: nullableId(dto.missionId),
      seasonId: nullableId(dto.seasonId),
      storeId: nullableId(dto.storeId),
      createdByUserId: isCreate ? user.id : undefined,
      approvedByUserId:
        status === 'APPROVED' || status === 'PAID' ? user.id : undefined,
      status,
      source: enumValue(
        dto.source,
        rewardSources,
        isCreate ? 'MANUAL' : undefined,
      ),
      externalProvider: integrationProviderValue(dto.externalProvider),
      externalDomain: nullableString(dto.externalDomain),
      externalId: nullableString(dto.externalId),
      guestExternalId: nullableString(dto.guestExternalId),
      rewardType: requiredString(dto.rewardType, 'Тип награды', isCreate),
      rewardAmount:
        decimalValue(dto.rewardAmount) ??
        (isCreate ? new Prisma.Decimal(0) : undefined),
      rewardLabel: requiredString(
        dto.rewardLabel,
        'Название награды',
        isCreate,
      ),
      rewardCode: nullableString(dto.rewardCode),
      qualifiedAt:
        dateValue(dto.qualifiedAt) ?? (isCreate ? new Date() : undefined),
      expiresAt: dateValue(dto.expiresAt),
      paidAt: status === 'PAID' ? new Date() : undefined,
      note: nullableString(dto.note),
      evidence: jsonValue(dto.evidence),
    });
  }

  private async buildEventData(
    user: AuthenticatedUser,
    dto: GuestGameEventDto,
  ): Promise<Prisma.GuestGameEventUncheckedCreateInput> {
    if (dto.profileId) {
      await this.assertProfile(user, dto.profileId);
    }
    if (dto.guestId) {
      await this.getTenantGuest(user, dto.guestId);
    }
    if (dto.lootBoxId) {
      await this.assertLootBox(user, dto.lootBoxId);
    }
    if (dto.missionId) {
      await this.assertMission(user, dto.missionId);
    }
    if (dto.seasonId) {
      await this.assertSeason(user, dto.seasonId);
    }

    return clean({
      tenantId: user.tenantId,
      profileId: nullableId(dto.profileId),
      guestId: nullableId(dto.guestId),
      lootBoxId: nullableId(dto.lootBoxId),
      missionId: nullableId(dto.missionId),
      seasonId: nullableId(dto.seasonId),
      createdByUserId: user.id,
      eventType: requiredString(dto.eventType, 'Тип события', true),
      source: enumValue(dto.source, eventSources, 'MANUAL'),
      externalProvider: integrationProviderValue(dto.externalProvider),
      externalDomain: nullableString(dto.externalDomain),
      externalId: nullableString(dto.externalId),
      xpDelta: intValue(dto.xpDelta) ?? 0,
      occurredAt: dateValue(dto.occurredAt) ?? new Date(),
      payload: jsonValue(dto.payload),
      note: nullableString(dto.note),
    }) as Prisma.GuestGameEventUncheckedCreateInput;
  }

  private async createSystemEvent(
    user: AuthenticatedUser,
    dto: Omit<GuestGameEventDto, 'source'>,
  ) {
    await this.prisma.guestGameEvent.create({
      data: {
        tenantId: user.tenantId,
        profileId: dto.profileId ?? null,
        guestId: dto.guestId ?? null,
        lootBoxId: dto.lootBoxId ?? null,
        missionId: dto.missionId ?? null,
        seasonId: dto.seasonId ?? null,
        createdByUserId: user.id,
        eventType: dto.eventType ?? 'SYSTEM',
        source: 'SYSTEM',
        xpDelta: intValue(dto.xpDelta) ?? 0,
        occurredAt: new Date(),
        note: dto.note ?? null,
      },
    });
  }

  private async applyXp(
    user: AuthenticatedUser,
    profileId: string,
    xpDelta: number,
  ) {
    const profile = await this.assertProfile(user, profileId);
    const nextXp = Math.max(0, profile.xp + xpDelta);

    await this.prisma.guestGameProfile.update({
      where: { id: profileId },
      data: {
        xp: nextXp,
        level: levelFromXp(nextXp),
        lastActivityAt: new Date(),
      },
    });
  }

  private async assertProfile(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameProfile.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Игровой профиль не найден');
    }

    return row;
  }

  private async assertLootBox(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameLootBox.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Лутбокс не найден');
    }

    return row;
  }

  private async assertMission(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameMission.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Игровая миссия не найдена');
    }

    return row;
  }

  private async assertSeason(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameSeason.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Сезон не найден');
    }

    return row;
  }

  private async assertReward(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameReward.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Награда не найдена');
    }

    return row;
  }

  private async assertAudience(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestAudience.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Группа гостей не найдена');
    }

    return row;
  }

  private async assertStore(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.store.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Клуб не найден');
    }

    return row;
  }

  private async getTenantGuest(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guest.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        externalGuestId: true,
        externalDomain: true,
        fullNameMasked: true,
        phoneMasked: true,
        emailMasked: true,
      },
    });

    if (!row) {
      throw new NotFoundException('Гость не найден');
    }

    return row;
  }

  private async getTenantLead(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestCrmLead.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        fullNameMasked: true,
        phoneMasked: true,
        emailMasked: true,
      },
    });

    if (!row) {
      throw new NotFoundException('CRM-гость не найден');
    }

    return row;
  }
}

function mapProfile(row: ProfileRow): GuestGameProfile {
  return {
    id: row.id,
    displayName:
      row.displayName ??
      row.guest?.fullNameMasked ??
      row.lead?.fullNameMasked ??
      row.guest?.externalGuestId ??
      'Игровой профиль',
    contactMasked:
      row.contactMasked ??
      row.guest?.phoneMasked ??
      row.lead?.phoneMasked ??
      row.guest?.emailMasked ??
      row.lead?.emailMasked ??
      null,
    phoneHash: row.phoneHash,
    telegramIdentity: row.telegramIdentity,
    maxIdentity: row.maxIdentity,
    xp: row.xp,
    level: row.level,
    status: row.status as ProfileStatus,
    lastActivityAt: iso(row.lastActivityAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    guest: row.guest
      ? {
          id: row.guest.id,
          externalDomain: row.guest.externalDomain,
          externalGuestId: row.guest.externalGuestId,
          displayName: row.guest.fullNameMasked ?? row.guest.externalGuestId,
          contact:
            row.guest.phoneMasked ?? row.guest.emailMasked ?? 'нет контакта',
        }
      : null,
    lead: row.lead
      ? {
          id: row.lead.id,
          displayName: row.lead.fullNameMasked ?? 'CRM-гость',
          contact:
            row.lead.phoneMasked ?? row.lead.emailMasked ?? 'нет контакта',
          matchedGuestId: row.lead.matchedGuestId,
        }
      : null,
    createdBy: mapUser(row.createdByUser),
  };
}

function mapLootBox(row: LootBoxRow): GuestGameLootBox {
  return {
    id: row.id,
    name: row.name,
    status: row.status as StatusValue,
    triggerKind: row.triggerKind,
    rewardType: row.rewardType,
    rewardAmount: numberOrNull(row.rewardAmount),
    rewardLabel: row.rewardLabel,
    segment: row.segment,
    sessionType: row.sessionType,
    storeIds: stringArray(row.storeIds),
    periodRules: row.periodRules,
    limits: row.limits,
    probabilityRules: row.probabilityRules,
    budgetAmount: numberOrNull(row.budgetAmount),
    antiFraudRules: row.antiFraudRules,
    manualApprovalRequired: row.manualApprovalRequired,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    audience: mapAudience(row.audience),
    createdBy: mapUser(row.createdByUser),
  };
}

function mapMission(row: MissionRow): GuestGameMission {
  return {
    id: row.id,
    name: row.name,
    status: row.status as StatusValue,
    missionType: row.missionType,
    triggerKind: row.triggerKind,
    rewardType: row.rewardType,
    rewardAmount: numberOrNull(row.rewardAmount),
    rewardLabel: row.rewardLabel,
    xpReward: row.xpReward,
    progressTarget: row.progressTarget,
    progressUnit: row.progressUnit,
    conditions: row.conditions,
    storeIds: stringArray(row.storeIds),
    periodFrom: iso(row.periodFrom),
    periodTo: iso(row.periodTo),
    budgetAmount: numberOrNull(row.budgetAmount),
    perGuestLimit: row.perGuestLimit,
    totalRewardLimit: row.totalRewardLimit,
    antiFraudRules: row.antiFraudRules,
    manualApprovalRequired: row.manualApprovalRequired,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    audience: mapAudience(row.audience),
    createdBy: mapUser(row.createdByUser),
  };
}

function mapSeason(row: SeasonRow): GuestGameSeason {
  return {
    id: row.id,
    name: row.name,
    status: row.status as StatusValue,
    seasonType: row.seasonType,
    periodFrom: iso(row.periodFrom),
    periodTo: iso(row.periodTo),
    xpRules: row.xpRules,
    levels: row.levels,
    freeRewards: row.freeRewards,
    premiumRewards: row.premiumRewards,
    premiumEnabled: row.premiumEnabled,
    premiumUpgradeMode: row.premiumUpgradeMode,
    budgetAmount: numberOrNull(row.budgetAmount),
    manualApprovalRequired: row.manualApprovalRequired,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    audience: mapAudience(row.audience),
    createdBy: mapUser(row.createdByUser),
  };
}

function mapReward(row: RewardRow): GuestGameReward {
  return {
    id: row.id,
    status: row.status as RewardStatus,
    source: row.source as RewardSource,
    externalProvider: row.externalProvider,
    externalDomain: row.externalDomain,
    externalId: row.externalId,
    guestExternalId: row.guestExternalId,
    rewardType: row.rewardType,
    rewardAmount: numberValue(row.rewardAmount),
    rewardLabel: row.rewardLabel,
    rewardCode: row.rewardCode,
    qualifiedAt: row.qualifiedAt.toISOString(),
    expiresAt: iso(row.expiresAt),
    paidAt: iso(row.paidAt),
    note: row.note,
    evidence: row.evidence,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    profile: mapProfileSummary(row.profile),
    guest: row.guest
      ? {
          id: row.guest.id,
          externalDomain: row.guest.externalDomain,
          externalGuestId: row.guest.externalGuestId,
          displayName: row.guest.fullNameMasked ?? row.guest.externalGuestId,
          contact:
            row.guest.phoneMasked ?? row.guest.emailMasked ?? 'нет контакта',
        }
      : null,
    lootBox: row.lootBox,
    mission: row.mission,
    season: row.season,
    store: row.store,
    createdBy: mapUser(row.createdByUser),
    approvedBy: mapUser(row.approvedByUser),
  };
}

function mapEvent(row: EventRow): GuestGameEvent {
  return {
    id: row.id,
    eventType: row.eventType,
    source: row.source as EventSource,
    externalProvider: row.externalProvider,
    externalDomain: row.externalDomain,
    externalId: row.externalId,
    xpDelta: row.xpDelta,
    occurredAt: row.occurredAt.toISOString(),
    payload: row.payload,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    profile: mapProfileSummary(row.profile),
    guest: row.guest
      ? {
          id: row.guest.id,
          externalDomain: row.guest.externalDomain,
          externalGuestId: row.guest.externalGuestId,
          displayName: row.guest.fullNameMasked ?? row.guest.externalGuestId,
          contact: row.guest.phoneMasked ?? 'нет контакта',
        }
      : null,
    lootBox: row.lootBox,
    mission: row.mission,
    season: row.season,
    createdBy: mapUser(row.createdByUser),
  };
}

function mapUser(
  row: { id: string; fullName: string | null; email: string } | null,
): GuestGameUser | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    displayName: row.fullName ?? row.email,
    email: row.email,
  };
}

function mapAudience(
  row: {
    id: string;
    name: string;
    description: string | null;
    guestsCount: number;
  } | null,
): GuestGameAudience | null {
  return row ? { ...row } : null;
}

function mapProfileSummary(
  row: {
    id: string;
    displayName: string | null;
    contactMasked: string | null;
    xp: number;
    level: number;
  } | null,
): Pick<
  GuestGameProfile,
  'id' | 'displayName' | 'contactMasked' | 'xp' | 'level'
> | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    displayName: row.displayName ?? 'Игровой профиль',
    contactMasked: row.contactMasked,
    xp: row.xp,
    level: row.level,
  };
}

function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function requiredString(value: unknown, label: string, required: boolean) {
  const parsed = stringValue(value);

  if (required && !parsed) {
    throw new BadRequestException(`${label} обязательно`);
  }

  return parsed;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function nullableString(value: unknown) {
  if (value === null) {
    return null;
  }

  return stringValue(value);
}

function nullableId(value: unknown) {
  if (value === null || value === '') {
    return null;
  }

  return stringValue(value);
}

function intValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new BadRequestException('Числовое поле заполнено неверно');
  }

  return Math.trunc(number);
}

function decimalValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new BadRequestException('Сумма заполнена неверно');
  }

  return new Prisma.Decimal(number);
}

function dateValue(value: unknown) {
  if (value === null || value === '') {
    return null;
  }

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('Дата заполнена неверно');
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Дата заполнена неверно');
  }

  return date;
}

function jsonValue(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return Prisma.JsonNull;
  }

  return value;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number] | undefined,
) {
  const parsed = stringValue(value);

  if (!parsed) {
    return fallback;
  }

  if (!allowed.includes(parsed)) {
    throw new BadRequestException(`Недопустимый статус: ${parsed}`);
  }

  return parsed as T[number];
}

function integrationProviderValue(value: unknown) {
  if (value === null || value === '') {
    return null;
  }

  const parsed = stringValue(value);

  if (!parsed) {
    return undefined;
  }

  if (parsed !== IntegrationProvider.LANGAME) {
    throw new BadRequestException('Поддерживается только Langame provider');
  }

  return IntegrationProvider.LANGAME;
}

function iso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function numberOrNull(value: Prisma.Decimal | null) {
  return value == null ? null : Number(value);
}

function numberValue(value: Prisma.Decimal) {
  return Number(value);
}

function stringArray(value: Prisma.JsonValue | null) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function levelFromXp(xp: number) {
  return Math.max(1, Math.floor(xp / 500) + 1);
}

function defaultProbabilityRules(): Prisma.InputJsonValue {
  return {
    type: 'weighted',
    items: [
      { label: 'XP battle pass', weight: 50 },
      { label: 'Промокод бара', weight: 30 },
      { label: 'Миссия на повторный визит', weight: 20 },
    ],
  };
}

function defaultMissionConditions(): Prisma.InputJsonValue {
  return {
    progress: '0/1',
    source: 'Langame facts',
    requiresManualReview: true,
  };
}

function defaultXpRules(): Prisma.InputJsonValue {
  return {
    visit: 20,
    playHour: 10,
    barPurchase: 25,
    missionCompletion: 50,
  };
}

function defaultLevels(): Prisma.InputJsonValue {
  return [
    { level: 1, xp: 0, freeReward: 'Старт сезона' },
    { level: 2, xp: 250, freeReward: 'Промокод бара' },
    { level: 3, xp: 500, freeReward: 'Бонус на следующий визит' },
    { level: 4, xp: 900, freeReward: 'Часы игры с подтверждением' },
  ];
}
