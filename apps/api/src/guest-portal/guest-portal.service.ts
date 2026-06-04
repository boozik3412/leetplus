import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import {
  GuestCommunicationConsentStatus,
  GuestCrmStatus,
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
} from '@prisma/client';
import { createHash, createHmac, randomInt, randomUUID } from 'node:crypto';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import type { LangameGuestSearchResultItem } from '../integrations/langame.types';
import { PrismaService } from '../prisma/prisma.service';

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const GUEST_TOKEN_EXPIRES_IN = '7d';
const GUEST_PORTAL_PURPOSE = 'guest_portal';
type JwtExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;

type GuestPortalTokenPayload = {
  sub: string;
  purpose: typeof GUEST_PORTAL_PURPOSE;
  tenantId: string;
  storeId: string;
  guestId: string | null;
  profileId: string | null;
  phoneHash: string;
};

type TenantStoreContext = {
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  store: {
    id: string;
    publicSlug: string | null;
    name: string;
    address: string | null;
  };
};

export type GuestPortalPublicConfig = {
  tenant: {
    name: string;
    slug: string;
  };
  store: {
    id: string;
    publicSlug: string | null;
    name: string;
    address: string | null;
  };
  otp: {
    ttlMinutes: number;
    resendSeconds: number;
    devCodeEnabled: boolean;
  };
};

export type GuestPortalOtpStartResponse = {
  challengeId: string;
  phoneMasked: string;
  expiresAt: string;
  resendAfterSeconds: number;
  delivery: {
    channel: 'DEV';
    status: 'DEV_CODE' | 'NOT_CONFIGURED';
    devCode?: string;
  };
};

export type GuestPortalOtpVerifyResponse = {
  token: string;
  portal: GuestPortalPayload;
};

export type GuestPortalCommunicationPreferenceAction =
  | 'GRANT'
  | 'DENY'
  | 'UNSUBSCRIBE';

export type GuestPortalCommunicationPreferenceResponse = {
  portal: GuestPortalPayload;
  message: string;
};

export type GuestPortalPayload = {
  tenant: GuestPortalPublicConfig['tenant'];
  store: GuestPortalPublicConfig['store'];
  guestFound: boolean;
  profile: {
    id: string | null;
    displayName: string;
    contactMasked: string | null;
    xp: number;
    level: number;
    nextLevelXp: number;
    levelProgressPercent: number;
    frame: 'starter' | 'bronze' | 'silver' | 'gold' | 'diamond';
  };
  loyalty: {
    groupName: string | null;
    discountPercent: number | null;
    currentHours: number | null;
    nextGroupName: string | null;
    nextGroupHours: number | null;
    progressPercent: number;
    balance: number | null;
    bonusBalance: number | null;
    lastSyncedAt: string | null;
  };
  guestSnapshot: GuestPortalGuestSnapshot;
  gamification: {
    nextActions: GuestPortalNextAction[];
    lootBoxes: GuestPortalLootBox[];
    missions: GuestPortalMission[];
    seasons: GuestPortalSeason[];
    rewardSummary: GuestPortalRewardSummary;
    rewards: GuestPortalReward[];
  };
  activity: {
    summary: {
      sessionsCount: number;
      playMinutes: number;
      logsCount: number;
      transactionsCount: number;
      gameEventsCount: number;
      lastActivityAt: string | null;
    };
    timeline: GuestPortalActivityItem[];
    xpHistory: GuestPortalXpHistoryItem[];
  };
  communications: GuestPortalCommunications;
};

export type GuestPortalGuestSnapshot = {
  source: {
    provider: string;
    domain: string | null;
    lastSyncedAt: string | null;
  };
  identity: {
    phoneMasked: string | null;
    emailMasked: string | null;
    fullNameMasked: string | null;
    birthdayProvided: boolean;
    documentPresent: boolean;
    bonusProgramNumberMasked: string | null;
  };
  registration: {
    registeredAt: string | null;
    lastActivityAt: string | null;
    confirmed: boolean;
    mobileRegistration: boolean;
    simpleRegistration: boolean;
    temporary: boolean;
    virtual: boolean;
    disabled: boolean;
  };
  profileCompleteness: {
    percent: number;
    completed: string[];
    missing: string[];
  };
  statusLabels: string[];
};

export type GuestPortalCommunications = {
  phone: {
    masked: string | null;
    consentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
    consentSource: string | null;
    consentAt: string | null;
    unsubscribedAt: string | null;
    otpVerified: boolean;
    otpDeliveryReady: boolean;
  };
  telegram: GuestPortalCommunicationChannel;
  max: GuestPortalCommunicationChannel;
};

export type GuestPortalCommunicationChannel = {
  connected: boolean;
  identityMasked: string | null;
  readyForRewards: boolean;
  status: 'READY' | 'CONNECTED_NO_CONSENT' | 'NOT_CONNECTED' | 'UNSUBSCRIBED';
};

export type GuestPortalNextAction = {
  id: string;
  kind:
    | 'CLAIM_REWARD'
    | 'OPEN_LOOT_BOX'
    | 'FINISH_MISSION'
    | 'BATTLE_PASS'
    | 'MATCH_LANGAME';
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  statusLabel: string;
  progressPercent: number | null;
  anchor: 'rewards' | 'lootBoxes' | 'missions' | 'battlePass' | 'profile';
};

export type GuestPortalLootBox = {
  id: string;
  name: string;
  triggerKind: string;
  rewardLabel: string | null;
  rewardType: string;
  manualApprovalRequired: boolean;
  note: string | null;
  openedCount: number;
  readyRewards: number;
  waitingApprovalRewards: number;
  redeemedRewards: number;
  latestReward: GuestPortalLootBoxReward | null;
};

export type GuestPortalLootBoxReward = {
  id: string;
  walletState:
    | 'WAITING_APPROVAL'
    | 'READY'
    | 'REDEEMED'
    | 'CANCELED'
    | 'EXPIRED';
  rewardLabel: string;
  rewardCode: string | null;
  claimPayload: string | null;
  qualifiedAt: string;
  expiresAt: string | null;
};

export type GuestPortalMission = {
  id: string;
  name: string;
  missionType: string;
  rewardLabel: string | null;
  xpReward: number;
  progressCurrent: number;
  progressTarget: number | null;
  progressUnit: string | null;
  progressPercent: number;
  questSteps: GuestPortalMissionStep[];
  periodTo: string | null;
  manualApprovalRequired: boolean;
};

export type GuestPortalMissionStep = {
  id: string;
  title: string;
  target: number;
  progressCurrent: number;
  completed: boolean;
  current: boolean;
};

export type GuestPortalSeason = {
  id: string;
  name: string;
  seasonType: string;
  premiumEnabled: boolean;
  periodTo: string | null;
  currentLevel: number;
  nextLevel: number | null;
  currentLevelXp: number;
  nextLevelXp: number | null;
  xpToNextLevel: number | null;
  progressPercent: number;
  reachedLevels: number;
  totalLevels: number;
  readyRewards: number;
  waitingApprovalRewards: number;
  redeemedRewards: number;
  nextRewardLabel: string | null;
  nextPremiumRewardLabel: string | null;
  levels: Array<{
    level: number;
    xp: number;
    freeReward: string | null;
    premiumReward: string | null;
    reached: boolean;
    current: boolean;
    next: boolean;
  }>;
};

export type GuestPortalReward = {
  id: string;
  status: string;
  walletState:
    | 'WAITING_APPROVAL'
    | 'READY'
    | 'REDEEMED'
    | 'CANCELED'
    | 'EXPIRED';
  rewardType: string;
  rewardAmount: number;
  rewardLabel: string;
  sourceKind: 'LOOT_BOX' | 'MISSION' | 'BATTLE_PASS' | 'MANUAL';
  sourceLabel: string | null;
  rewardCode: string | null;
  claimPayload: string | null;
  qualifiedAt: string;
  expiresAt: string | null;
};

export type GuestPortalRewardSummary = {
  total: number;
  ready: number;
  waitingApproval: number;
  redeemed: number;
  expired: number;
  nextExpiresAt: string | null;
};

export type GuestPortalActivityItem = {
  id: string;
  kind: 'SESSION' | 'LOG' | 'TRANSACTION' | 'GAME_EVENT';
  title: string;
  description: string | null;
  occurredAt: string;
  storeName: string | null;
  amount: number | null;
  xpDelta: number | null;
};

export type GuestPortalXpHistoryItem = {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  xpDelta: number;
  occurredAt: string;
  sourceLabel: string | null;
};

export type GuestPortalLangameMatchResponse = {
  checkedAt: string;
  queryField: 'phone';
  phoneMasked: string;
  status: 'MATCHED_LOCAL' | 'FOUND_IN_LANGAME' | 'NOT_FOUND' | 'FAILED';
  localGuestFound: boolean;
  localGuestId: string | null;
  profileId: string | null;
  nextAction: string;
  sources: Array<{
    id: string;
    name: string;
    domain: string;
    status: 'SUCCESS' | 'FAILED';
    resultsCount: number;
    errorMessage: string | null;
    results: Array<
      LangameGuestSearchResultItem & {
        localGuestKnown: boolean;
        localGuestId: string | null;
      }
    >;
  }>;
};

type GuestPortalMissionProgress = {
  current: number;
  percent: number;
};

@Injectable()
export class GuestPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly langameSettingsService: LangameSettingsService,
  ) {}

  async getPublicConfig(
    tenantSlug: string,
    storeId: string,
  ): Promise<GuestPortalPublicConfig> {
    const context = await this.getTenantStore(tenantSlug, storeId);

    return {
      tenant: {
        name: context.tenant.name,
        slug: context.tenant.slug,
      },
      store: context.store,
      otp: {
        ttlMinutes: OTP_TTL_MINUTES,
        resendSeconds: OTP_RESEND_SECONDS,
        devCodeEnabled: this.isDevOtpEnabled(),
      },
    };
  }

  async startOtp(
    tenantSlug: string,
    storeId: string,
    dto: { phone?: unknown },
  ): Promise<GuestPortalOtpStartResponse> {
    const context = await this.getTenantStore(tenantSlug, storeId);
    const phone = this.phoneIdentity(dto.phone);
    const now = new Date();
    const resendAfter = new Date(now.getTime() - OTP_RESEND_SECONDS * 1000);

    await this.prisma.guestPortalOtpChallenge.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    const recentChallenge = await this.prisma.guestPortalOtpChallenge.findFirst(
      {
        where: {
          tenantId: context.tenant.id,
          storeId: context.store.id,
          phoneHash: phone.hash,
          status: 'PENDING',
          createdAt: { gt: resendAfter },
        },
        orderBy: { createdAt: 'desc' },
      },
    );

    if (recentChallenge) {
      throw new BadRequestException(
        'Код уже отправлен. Попробуйте повторить чуть позже.',
      );
    }

    const [guest, profileByPhone] = await Promise.all([
      this.prisma.guest.findFirst({
        where: {
          tenantId: context.tenant.id,
          phoneHash: phone.hash,
          isDisabled: false,
        },
        orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
        select: { id: true },
      }),
      this.prisma.guestGameProfile.findFirst({
        where: {
          tenantId: context.tenant.id,
          phoneHash: phone.hash,
          status: 'ACTIVE',
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      }),
    ]);

    const profile = guest
      ? await this.prisma.guestGameProfile.findFirst({
          where: {
            tenantId: context.tenant.id,
            guestId: guest.id,
            status: 'ACTIVE',
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        })
      : profileByPhone;

    const id = randomUUID();
    const code = this.generateOtp();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
    const devCodeEnabled = this.isDevOtpEnabled();

    await this.prisma.guestPortalOtpChallenge.create({
      data: {
        id,
        tenantId: context.tenant.id,
        storeId: context.store.id,
        phoneHash: phone.hash,
        phoneMasked: phone.masked,
        guestId: guest?.id ?? null,
        profileId: profile?.id ?? null,
        codeHash: this.hashOtpCode(id, code),
        status: 'PENDING',
        deliveryChannel: 'DEV',
        expiresAt,
        deliveredAt: devCodeEnabled ? now : null,
      },
    });

    return {
      challengeId: id,
      phoneMasked: phone.masked,
      expiresAt: expiresAt.toISOString(),
      resendAfterSeconds: OTP_RESEND_SECONDS,
      delivery: {
        channel: 'DEV',
        status: devCodeEnabled ? 'DEV_CODE' : 'NOT_CONFIGURED',
        ...(devCodeEnabled ? { devCode: code } : {}),
      },
    };
  }

  async verifyOtp(
    tenantSlug: string,
    storeId: string,
    dto: { challengeId?: unknown; code?: unknown },
  ): Promise<GuestPortalOtpVerifyResponse> {
    const context = await this.getTenantStore(tenantSlug, storeId);
    const challengeId = this.requiredString(dto.challengeId, 'challengeId');
    const code = this.requiredString(dto.code, 'Код').replace(/\D/g, '');

    if (code.length !== 6) {
      throw new BadRequestException('Введите шестизначный код.');
    }

    const challenge = await this.prisma.guestPortalOtpChallenge.findFirst({
      where: {
        id: challengeId,
        tenantId: context.tenant.id,
        storeId: context.store.id,
      },
    });

    if (!challenge || challenge.status !== 'PENDING') {
      throw new BadRequestException('Код не найден или уже использован.');
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      await this.prisma.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Срок действия кода истек.');
    }

    const isValid = challenge.codeHash === this.hashOtpCode(challenge.id, code);

    if (!isValid) {
      const attempts = challenge.attempts + 1;
      await this.prisma.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts,
          status: attempts >= OTP_MAX_ATTEMPTS ? 'BLOCKED' : 'PENDING',
        },
      });
      throw new BadRequestException('Код введен неверно.');
    }

    await this.prisma.guestPortalOtpChallenge.update({
      where: { id: challenge.id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });

    const payload: GuestPortalTokenPayload = {
      sub: challenge.id,
      purpose: GUEST_PORTAL_PURPOSE,
      tenantId: context.tenant.id,
      storeId: context.store.id,
      guestId: challenge.guestId,
      profileId: challenge.profileId,
      phoneHash: challenge.phoneHash,
    };
    const token = await this.jwtService.signAsync(payload, {
      expiresIn: (this.configService.get<string>(
        'GUEST_PORTAL_JWT_EXPIRES_IN',
      ) ?? GUEST_TOKEN_EXPIRES_IN) as JwtExpiresIn,
    });

    return {
      token,
      portal: await this.buildPortalPayload(payload),
    };
  }

  async getSession(authorization: string | undefined) {
    const payload = await this.verifyGuestToken(authorization);
    return this.buildPortalPayload(payload);
  }

  async updateCommunicationPreferences(
    authorization: string | undefined,
    dto: { action?: unknown },
  ): Promise<GuestPortalCommunicationPreferenceResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const action = communicationPreferenceAction(dto.action);
    const guest = await this.findGuest(payload);

    if (!guest) {
      throw new BadRequestException(
        'Профиль гостя еще не найден в синхронизированной базе. Согласие можно сохранить после сопоставления с Langame.',
      );
    }

    const now = new Date();
    const data =
      action === 'GRANT'
        ? {
            phoneConsentStatus: GuestCommunicationConsentStatus.GRANTED,
            phoneConsentSource: 'guest_portal',
            phoneConsentAt: now,
            unsubscribedAt: null,
          }
        : action === 'DENY'
          ? {
              phoneConsentStatus: GuestCommunicationConsentStatus.DENIED,
              phoneConsentSource: 'guest_portal',
              phoneConsentAt: null,
              unsubscribedAt: null,
            }
          : {
              phoneConsentStatus: GuestCommunicationConsentStatus.UNSUBSCRIBED,
              phoneConsentSource: 'guest_portal',
              phoneConsentAt: null,
              unsubscribedAt: now,
              crmStatus: GuestCrmStatus.DO_NOT_CONTACT,
              crmUpdatedAt: now,
            };

    await this.prisma.guest.update({
      where: { id: guest.id },
      data,
    });

    return {
      portal: await this.buildPortalPayload({
        ...payload,
        guestId: guest.id,
      }),
      message: communicationPreferenceMessage(action),
    };
  }

  async matchLangameGuest(
    authorization: string | undefined,
    dto: { phone?: unknown },
  ): Promise<GuestPortalLangameMatchResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const phone = this.phoneIdentity(dto.phone);

    if (phone.hash !== payload.phoneHash) {
      throw new BadRequestException(
        'Телефон не совпадает с подтвержденной гостевой сессией.',
      );
    }

    const [diagnostics, localGuest, localProfile] = await Promise.all([
      this.langameSettingsService.searchGuestByPhoneForPortal(
        payload.tenantId,
        phone.normalized,
      ),
      this.findGuest(payload),
      this.findProfile(payload, payload.guestId),
    ]);
    const externalPairs = diagnostics.sources.flatMap((source) =>
      source.results
        .filter((result) => result.externalGuestId)
        .map((result) => ({
          domain: source.domain,
          externalGuestId: result.externalGuestId as string,
        })),
    );
    const localGuestsByExternalId =
      externalPairs.length > 0
        ? await this.prisma.guest.findMany({
            where: {
              tenantId: payload.tenantId,
              externalProvider: IntegrationProvider.LANGAME,
              OR: externalPairs.map((pair) => ({
                externalDomain: pair.domain,
                externalGuestId: pair.externalGuestId,
              })),
            },
            select: {
              id: true,
              externalDomain: true,
              externalGuestId: true,
            },
          })
        : [];
    const localGuestMap = new Map(
      localGuestsByExternalId.map((guest) => [
        externalGuestKey(guest.externalDomain, guest.externalGuestId),
        guest.id,
      ]),
    );
    const sources = diagnostics.sources.map((source) => ({
      id: source.id,
      name: source.name,
      domain: source.domain,
      status: source.status,
      resultsCount: source.resultsCount,
      errorMessage: source.errorMessage,
      results: source.results.map((result) => {
        const mappedGuestId = result.externalGuestId
          ? (localGuestMap.get(
              externalGuestKey(source.domain, result.externalGuestId),
            ) ?? null)
          : null;

        return {
          ...result,
          localGuestKnown: Boolean(mappedGuestId),
          localGuestId: mappedGuestId,
        };
      }),
    }));
    const firstMappedGuestId =
      sources
        .flatMap((source) => source.results)
        .find((result) => result.localGuestId)?.localGuestId ?? null;
    const localGuestId = localGuest?.id ?? firstMappedGuestId;
    const localGuestFound = Boolean(localGuestId);
    const foundInLangame = sources.some((source) => source.resultsCount > 0);
    const anySuccess = sources.some((source) => source.status === 'SUCCESS');
    const status: GuestPortalLangameMatchResponse['status'] = localGuestFound
      ? 'MATCHED_LOCAL'
      : foundInLangame
        ? 'FOUND_IN_LANGAME'
        : anySuccess
          ? 'NOT_FOUND'
          : 'FAILED';

    return {
      checkedAt: diagnostics.checkedAt,
      queryField: 'phone',
      phoneMasked: phone.masked,
      status,
      localGuestFound,
      localGuestId,
      profileId: localProfile?.id ?? payload.profileId,
      nextAction: guestPortalLangameMatchNextAction(status),
      sources,
    };
  }

  private async buildPortalPayload(
    tokenPayload: GuestPortalTokenPayload,
  ): Promise<GuestPortalPayload> {
    const context = await this.getTenantStoreByIds(
      tokenPayload.tenantId,
      tokenPayload.storeId,
    );
    const guest = await this.findGuest(tokenPayload);
    const profile = await this.findProfile(tokenPayload, guest?.id ?? null);
    const [
      groups,
      balanceSnapshot,
      bonusBalanceSnapshot,
      lootBoxes,
      missions,
      seasons,
      rewards,
      activity,
    ] = await Promise.all([
      this.prisma.guestGroup.findMany({
        where: { tenantId: context.tenant.id },
        orderBy: [{ countHoursFrom: 'asc' }, { name: 'asc' }],
      }),
      guest
        ? this.prisma.guestBalanceSnapshot.findFirst({
            where: {
              tenantId: context.tenant.id,
              guestId: guest.id,
            },
            orderBy: { snapshotDate: 'desc' },
          })
        : null,
      guest
        ? this.prisma.guestBonusBalanceSnapshot.findFirst({
            where: {
              tenantId: context.tenant.id,
              guestId: guest.id,
            },
            orderBy: { snapshotDate: 'desc' },
          })
        : null,
      this.prisma.guestGameLootBox.findMany({
        where: {
          tenantId: context.tenant.id,
          status: 'ACTIVE',
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.guestGameMission.findMany({
        where: {
          tenantId: context.tenant.id,
          status: 'ACTIVE',
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.guestGameSeason.findMany({
        where: {
          tenantId: context.tenant.id,
          status: 'ACTIVE',
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      guest || profile
        ? this.prisma.guestGameReward.findMany({
            where: {
              tenantId: context.tenant.id,
              AND: [
                {
                  OR: [
                    ...(guest ? [{ guestId: guest.id }] : []),
                    ...(profile ? [{ profileId: profile.id }] : []),
                  ],
                },
                {
                  OR: [{ storeId: null }, { storeId: context.store.id }],
                },
              ],
            },
            include: {
              lootBox: { select: { name: true } },
              mission: { select: { name: true } },
              season: { select: { name: true } },
            },
            orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
            take: 20,
          })
        : [],
      this.buildActivity(context.tenant.id, context.store.id, guest, profile),
    ]);

    const xp = profile?.xp ?? 0;
    const level = Math.max(1, profile?.level ?? levelFromXp(xp));
    const currentLevelXp = (level - 1) * 500;
    const nextLevelXp = level * 500;
    const levelProgressPercent = percent(xp - currentLevelXp, 500);
    const currentHours = decimalNumber(guest?.currentCountHours ?? null);
    const loyalty = this.buildLoyalty(
      guest,
      groups,
      balanceSnapshot,
      bonusBalanceSnapshot,
      currentHours,
    );
    const visibleMissions = missions
      .filter((item) => matchesStore(item.storeIds, context.store.id))
      .filter((item) => activePeriod(item.periodFrom, item.periodTo))
      .slice(0, 6);
    const missionProgress = await this.buildMissionProgress(
      context.tenant.id,
      guest,
      profile,
      visibleMissions,
    );
    const portalRewards = rewards.map(mapReward).sort(comparePortalRewards);
    const portalLootBoxes = lootBoxes
      .filter((item) => matchesStore(item.storeIds, context.store.id))
      .slice(0, 6)
      .map((item) => mapLootBox(item, rewards));
    const portalMissions = visibleMissions.map((item) =>
      mapMission(item, missionProgress.get(item.id)),
    );
    const portalSeasons = seasons
      .filter((item) => activePeriod(item.periodFrom, item.periodTo))
      .slice(0, 2)
      .map((item) => mapSeason(item, xp, rewards));
    const nextActions = buildNextActions({
      guestFound: Boolean(guest || profile),
      lootBoxes: portalLootBoxes,
      missions: portalMissions,
      seasons: portalSeasons,
      rewards: portalRewards,
    });

    return {
      tenant: {
        name: context.tenant.name,
        slug: context.tenant.slug,
      },
      store: context.store,
      guestFound: Boolean(guest || profile),
      profile: {
        id: profile?.id ?? null,
        displayName:
          profile?.displayName ??
          guest?.fullNameMasked ??
          guest?.externalGuestId ??
          'Гость клуба',
        contactMasked:
          profile?.contactMasked ??
          guest?.phoneMasked ??
          guest?.emailMasked ??
          null,
        xp,
        level,
        nextLevelXp,
        levelProgressPercent,
        frame: frameForLevel(level),
      },
      loyalty,
      guestSnapshot: buildGuestSnapshot(guest),
      gamification: {
        nextActions,
        lootBoxes: portalLootBoxes,
        missions: portalMissions,
        seasons: portalSeasons,
        rewardSummary: buildRewardSummary(portalRewards),
        rewards: portalRewards,
      },
      activity,
      communications: buildCommunications(guest, profile),
    };
  }

  private async buildMissionProgress(
    tenantId: string,
    guest: { id: string } | null,
    profile: { id: string } | null,
    missions: Array<{
      id: string;
      periodFrom: Date | null;
      periodTo: Date | null;
      progressTarget: number | null;
    }>,
  ): Promise<Map<string, GuestPortalMissionProgress>> {
    if ((!guest && !profile) || missions.length === 0) {
      return new Map();
    }

    const missionById = new Map(
      missions.map((mission) => [mission.id, mission]),
    );
    const missionIds = [...missionById.keys()];
    const eventScope: Prisma.GuestGameEventWhereInput[] = [
      ...(guest ? [{ guestId: guest.id }] : []),
      ...(profile ? [{ profileId: profile.id }] : []),
    ];
    const rewardScope: Prisma.GuestGameRewardWhereInput[] = [
      ...(guest ? [{ guestId: guest.id }] : []),
      ...(profile ? [{ profileId: profile.id }] : []),
    ];

    const [eventRows, rewardRows] = await Promise.all([
      this.prisma.guestGameEvent.findMany({
        where: {
          tenantId,
          missionId: { in: missionIds },
          OR: eventScope,
        },
        select: {
          missionId: true,
          eventType: true,
          source: true,
          occurredAt: true,
        },
      }),
      this.prisma.guestGameReward.findMany({
        where: {
          tenantId,
          missionId: { in: missionIds },
          OR: rewardScope,
          status: { not: 'CANCELED' },
        },
        select: {
          missionId: true,
          qualifiedAt: true,
        },
      }),
    ]);

    const eventCounts = new Map<string, number>();
    const rewardCounts = new Map<string, number>();

    eventRows.forEach((row) => {
      if (!row.missionId || !missionProgressEvent(row)) {
        return;
      }

      const mission = missionById.get(row.missionId);
      if (!mission || !dateWithinMission(row.occurredAt, mission)) {
        return;
      }

      eventCounts.set(row.missionId, (eventCounts.get(row.missionId) ?? 0) + 1);
    });

    rewardRows.forEach((row) => {
      if (!row.missionId) {
        return;
      }

      const mission = missionById.get(row.missionId);
      if (!mission || !dateWithinMission(row.qualifiedAt, mission)) {
        return;
      }

      rewardCounts.set(
        row.missionId,
        (rewardCounts.get(row.missionId) ?? 0) + 1,
      );
    });

    const progress = new Map<string, GuestPortalMissionProgress>();

    missions.forEach((mission) => {
      const target =
        typeof mission.progressTarget === 'number' && mission.progressTarget > 0
          ? mission.progressTarget
          : 1;
      const current = Math.max(
        eventCounts.get(mission.id) ?? 0,
        rewardCounts.get(mission.id) ?? 0,
      );

      progress.set(mission.id, {
        current,
        percent: percent(current, target),
      });
    });

    return progress;
  }

  private async buildActivity(
    tenantId: string,
    storeId: string,
    guest: { id: string } | null,
    profile: { id: string } | null,
  ): Promise<GuestPortalPayload['activity']> {
    const empty = emptyActivity();

    if (!guest && !profile) {
      return empty;
    }

    const gameEventScope = [
      ...(guest ? [{ guestId: guest.id }] : []),
      ...(profile ? [{ profileId: profile.id }] : []),
    ];

    const [
      sessionStats,
      sessions,
      logsCount,
      logs,
      transactionStats,
      transactions,
      gameEventStats,
      gameEvents,
    ] = await Promise.all([
      guest
        ? this.prisma.guestSession.aggregate({
            where: { tenantId, guestId: guest.id, storeId },
            _count: { id: true },
            _sum: { durationMinutes: true },
            _max: { startedAt: true },
          })
        : null,
      guest
        ? this.prisma.guestSession.findMany({
            where: { tenantId, guestId: guest.id, storeId },
            include: { store: { select: { name: true } } },
            orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
            take: 8,
          })
        : [],
      guest
        ? this.prisma.guestLog.count({
            where: { tenantId, guestId: guest.id },
          })
        : 0,
      guest
        ? this.prisma.guestLog.findMany({
            where: { tenantId, guestId: guest.id },
            orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
            take: 8,
          })
        : [],
      guest
        ? this.prisma.guestTransaction.aggregate({
            where: { tenantId, guestId: guest.id, storeId },
            _count: { id: true },
            _max: { happenedAt: true },
          })
        : null,
      guest
        ? this.prisma.guestTransaction.findMany({
            where: { tenantId, guestId: guest.id, storeId },
            include: { store: { select: { name: true } } },
            orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
            take: 8,
          })
        : [],
      gameEventScope.length
        ? this.prisma.guestGameEvent.aggregate({
            where: { tenantId, OR: gameEventScope },
            _count: { id: true },
            _max: { occurredAt: true },
          })
        : null,
      gameEventScope.length
        ? this.prisma.guestGameEvent.findMany({
            where: { tenantId, OR: gameEventScope },
            include: {
              lootBox: { select: { name: true } },
              mission: { select: { name: true } },
              season: { select: { name: true } },
            },
            orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
            take: 8,
          })
        : [],
    ]);

    const sessionRows = sessions as Array<
      Parameters<typeof mapSessionActivity>[0]
    >;
    const logRows = logs as Array<Parameters<typeof mapLogActivity>[0]>;
    const transactionRows = transactions as Array<
      Parameters<typeof mapTransactionActivity>[0]
    >;
    const gameEventRows = gameEvents as Array<
      Parameters<typeof mapGameEventActivity>[0]
    >;

    const timeline: GuestPortalActivityItem[] = [
      ...sessionRows.map((row) => mapSessionActivity(row)),
      ...logRows.map((row) => mapLogActivity(row)),
      ...transactionRows.map((row) => mapTransactionActivity(row)),
      ...gameEventRows.map((row) => mapGameEventActivity(row)),
    ]
      .sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime(),
      )
      .slice(0, 12);
    const xpHistory = gameEventRows
      .filter((row) => row.xpDelta !== 0)
      .map((row) => mapXpHistory(row))
      .slice(0, 6);

    const lastActivityAt =
      newestDate([
        sessionStats?._max.startedAt ?? null,
        transactionStats?._max.happenedAt ?? null,
        gameEventStats?._max.occurredAt ?? null,
        timeline[0] ? new Date(timeline[0].occurredAt) : null,
      ]) ?? null;

    return {
      summary: {
        sessionsCount: sessionStats?._count.id ?? 0,
        playMinutes: sessionStats?._sum.durationMinutes ?? 0,
        logsCount,
        transactionsCount: transactionStats?._count.id ?? 0,
        gameEventsCount: gameEventStats?._count.id ?? 0,
        lastActivityAt: iso(lastActivityAt),
      },
      timeline,
      xpHistory,
    };
  }

  private buildLoyalty(
    guest: {
      externalProvider: IntegrationProvider | null;
      externalDomain: string | null;
      externalGuestTypeId: string | null;
      currentCountHours: Prisma.Decimal | null;
      lastSyncedAt: Date | null;
    } | null,
    groups: Array<{
      externalProvider: IntegrationProvider | null;
      externalDomain: string | null;
      externalGroupId: string;
      name: string;
      percent: Prisma.Decimal | null;
      countHoursFrom: Prisma.Decimal | null;
      countHoursTo: Prisma.Decimal | null;
    }>,
    balanceSnapshot: { balance: Prisma.Decimal; snapshotDate: Date } | null,
    bonusBalanceSnapshot: {
      bonusBalance: Prisma.Decimal;
      snapshotDate: Date;
    } | null,
    currentHours: number | null,
  ): GuestPortalPayload['loyalty'] {
    const groupByExternalId = guest?.externalGuestTypeId
      ? groups.find(
          (group) =>
            group.externalProvider === guest.externalProvider &&
            group.externalDomain === guest.externalDomain &&
            group.externalGroupId === guest.externalGuestTypeId,
        )
      : null;
    const groupByHours =
      currentHours == null
        ? null
        : groups.find((group) => {
            const from = decimalNumber(group.countHoursFrom);
            const to = decimalNumber(group.countHoursTo);
            return (
              (from == null || currentHours >= from) &&
              (to == null || currentHours <= to)
            );
          });
    const currentGroup = groupByExternalId ?? groupByHours ?? null;
    const nextGroup =
      currentHours == null
        ? null
        : (groups
            .filter((group) => {
              const from = decimalNumber(group.countHoursFrom);
              return from != null && from > currentHours;
            })
            .sort(
              (left, right) =>
                (decimalNumber(left.countHoursFrom) ?? 0) -
                (decimalNumber(right.countHoursFrom) ?? 0),
            )[0] ?? null);
    const currentFrom =
      decimalNumber(currentGroup?.countHoursFrom ?? null) ?? 0;
    const nextFrom = decimalNumber(nextGroup?.countHoursFrom ?? null);
    const progressPercent =
      currentHours == null || nextFrom == null
        ? currentGroup
          ? 100
          : 0
        : percent(currentHours - currentFrom, nextFrom - currentFrom);
    const lastSyncedAt =
      newestDate([
        guest?.lastSyncedAt ?? null,
        balanceSnapshot?.snapshotDate ?? null,
        bonusBalanceSnapshot?.snapshotDate ?? null,
      ])?.toISOString() ?? null;

    return {
      groupName: currentGroup?.name ?? null,
      discountPercent: decimalNumber(currentGroup?.percent ?? null),
      currentHours,
      nextGroupName: nextGroup?.name ?? null,
      nextGroupHours: nextFrom,
      progressPercent,
      balance: decimalNumber(balanceSnapshot?.balance ?? null),
      bonusBalance: decimalNumber(bonusBalanceSnapshot?.bonusBalance ?? null),
      lastSyncedAt,
    };
  }

  private async findGuest(payload: GuestPortalTokenPayload) {
    if (payload.guestId) {
      const guest = await this.prisma.guest.findFirst({
        where: {
          id: payload.guestId,
          tenantId: payload.tenantId,
        },
      });

      if (guest) {
        return guest;
      }
    }

    return this.prisma.guest.findFirst({
      where: {
        tenantId: payload.tenantId,
        phoneHash: payload.phoneHash,
        isDisabled: false,
      },
      orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  private async findProfile(
    payload: GuestPortalTokenPayload,
    guestId: string | null,
  ) {
    if (payload.profileId) {
      const profile = await this.prisma.guestGameProfile.findFirst({
        where: {
          id: payload.profileId,
          tenantId: payload.tenantId,
        },
      });

      if (profile) {
        return profile;
      }
    }

    return this.prisma.guestGameProfile.findFirst({
      where: {
        tenantId: payload.tenantId,
        status: 'ACTIVE',
        OR: [
          ...(guestId ? [{ guestId }] : []),
          { phoneHash: payload.phoneHash },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async verifyGuestToken(
    authorization: string | undefined,
  ): Promise<GuestPortalTokenPayload> {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : null;

    if (!token) {
      throw new UnauthorizedException('Guest token is required');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<GuestPortalTokenPayload>(token);

      if (payload.purpose !== GUEST_PORTAL_PURPOSE) {
        throw new UnauthorizedException('Invalid guest token');
      }

      await this.getTenantStoreByIds(payload.tenantId, payload.storeId);

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid guest token');
    }
  }

  private async getTenantStore(
    tenantSlug: string,
    storeId: string,
  ): Promise<TenantStoreContext> {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        slug: tenantSlug,
        status: TenantLifecycleStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        stores: {
          where: {
            OR: [{ id: storeId }, { publicSlug: storeId }],
            isActive: true,
          },
          select: {
            id: true,
            publicSlug: true,
            name: true,
            address: true,
          },
          take: 1,
        },
      },
    });

    const store = tenant?.stores[0] ?? null;

    if (!tenant || !store) {
      throw new NotFoundException('Гостевая ссылка не найдена.');
    }

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      store,
    };
  }

  private async getTenantStoreByIds(
    tenantId: string,
    storeId: string,
  ): Promise<TenantStoreContext> {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        status: TenantLifecycleStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        stores: {
          where: {
            id: storeId,
            isActive: true,
          },
          select: {
            id: true,
            publicSlug: true,
            name: true,
            address: true,
          },
          take: 1,
        },
      },
    });

    const store = tenant?.stores[0] ?? null;

    if (!tenant || !store) {
      throw new UnauthorizedException('Guest portal scope is inactive');
    }

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      store,
    };
  }

  private phoneIdentity(value: unknown) {
    const raw = this.requiredString(value, 'Телефон');
    const normalized = raw.replace(/\D/g, '');

    if (normalized.length < 6) {
      throw new BadRequestException('Введите корректный номер телефона.');
    }

    return {
      normalized,
      hash: createHmac('sha256', this.piiSecret())
        .update(normalized)
        .digest('hex'),
      masked: normalized.length <= 4 ? '****' : `***${normalized.slice(-4)}`,
    };
  }

  private requiredString(value: unknown, label: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${label} обязателен.`);
    }

    return value.trim();
  }

  private generateOtp() {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashOtpCode(challengeId: string, code: string) {
    return createHash('sha256')
      .update(`${this.piiSecret()}:${challengeId}:${code}`)
      .digest('hex');
  }

  private isDevOtpEnabled() {
    return (
      this.configService.get<string>('GUEST_PORTAL_DEV_OTP_ENABLED') ===
        'true' || this.configService.get<string>('NODE_ENV') !== 'production'
    );
  }

  private piiSecret() {
    const secret =
      this.configService.get<string>('APP_ENCRYPTION_KEY')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim();

    if (!secret) {
      throw new BadRequestException('APP_ENCRYPTION_KEY is not configured');
    }

    return secret;
  }
}

function externalGuestKey(domain: string | null, externalGuestId: string) {
  return `${domain ?? ''}:${externalGuestId}`;
}

function guestPortalLangameMatchNextAction(
  status: GuestPortalLangameMatchResponse['status'],
) {
  if (status === 'MATCHED_LOCAL') {
    return 'Профиль уже найден в LeetPlus. Данные лояльности и геймификации обновятся после обычной синхронизации Langame.';
  }

  if (status === 'FOUND_IN_LANGAME') {
    return 'Langame нашел профиль по подтвержденному телефону. После ближайшей синхронизации или ручного сопоставления он появится в гостевом кабинете.';
  }

  if (status === 'NOT_FOUND') {
    return 'Langame не вернул гостя по этому телефону. Проверьте номер у администратора клуба или попробуйте другой номер.';
  }

  return 'Не удалось проверить Langame по активным источникам. Попробуйте позже или обратитесь к администратору клуба.';
}

function mapLootBox(
  row: {
    id: string;
    name: string;
    triggerKind: string;
    rewardLabel: string | null;
    rewardType: string;
    manualApprovalRequired: boolean;
    note: string | null;
  },
  rewards: Array<{
    id: string;
    lootBoxId: string | null;
    status: string;
    rewardLabel: string;
    rewardCode: string | null;
    qualifiedAt: Date;
    expiresAt: Date | null;
  }>,
): GuestPortalLootBox {
  const rewardState = buildLootBoxRewardState(row.id, rewards);

  return {
    id: row.id,
    name: row.name,
    triggerKind: row.triggerKind,
    rewardLabel: row.rewardLabel,
    rewardType: row.rewardType,
    manualApprovalRequired: row.manualApprovalRequired,
    note: row.note,
    ...rewardState,
  };
}

function buildLootBoxRewardState(
  lootBoxId: string,
  rewards: Array<{
    id: string;
    lootBoxId: string | null;
    status: string;
    rewardLabel: string;
    rewardCode: string | null;
    qualifiedAt: Date;
    expiresAt: Date | null;
  }>,
): Pick<
  GuestPortalLootBox,
  | 'openedCount'
  | 'readyRewards'
  | 'waitingApprovalRewards'
  | 'redeemedRewards'
  | 'latestReward'
> {
  const lootBoxRewards = rewards
    .filter((reward) => reward.lootBoxId === lootBoxId)
    .sort(
      (left, right) => right.qualifiedAt.getTime() - left.qualifiedAt.getTime(),
    );
  const mappedStates = lootBoxRewards.map((reward) =>
    rewardWalletState(reward.status, reward.expiresAt),
  );
  const latest = lootBoxRewards[0] ?? null;
  const latestState = latest
    ? rewardWalletState(latest.status, latest.expiresAt)
    : null;

  return {
    openedCount: lootBoxRewards.length,
    readyRewards: mappedStates.filter((state) => state === 'READY').length,
    waitingApprovalRewards: mappedStates.filter(
      (state) => state === 'WAITING_APPROVAL',
    ).length,
    redeemedRewards: mappedStates.filter((state) => state === 'REDEEMED')
      .length,
    latestReward:
      latest && latestState
        ? {
            id: latest.id,
            walletState: latestState,
            rewardLabel: latest.rewardLabel,
            rewardCode: latest.rewardCode,
            claimPayload:
              latest.rewardCode && latestState === 'READY'
                ? buildRewardClaimPayload(latest.id, latest.rewardCode)
                : null,
            qualifiedAt: latest.qualifiedAt.toISOString(),
            expiresAt: iso(latest.expiresAt),
          }
        : null,
  };
}

function mapMission(
  row: {
    id: string;
    name: string;
    missionType: string;
    rewardLabel: string | null;
    xpReward: number;
    progressTarget: number | null;
    progressUnit: string | null;
    conditions: Prisma.JsonValue;
    periodTo: Date | null;
    manualApprovalRequired: boolean;
  },
  progress?: GuestPortalMissionProgress,
): GuestPortalMission {
  const progressCurrent = progress?.current ?? 0;
  const questSteps = missionQuestSteps(row.conditions, progressCurrent);
  const progressTarget = questSteps.length
    ? (questSteps[questSteps.length - 1]?.target ?? questSteps.length)
    : row.progressTarget;
  const progressPercent = questSteps.length
    ? percent(progressCurrent, progressTarget ?? questSteps.length)
    : (progress?.percent ?? 0);

  return {
    id: row.id,
    name: row.name,
    missionType: row.missionType,
    rewardLabel: row.rewardLabel,
    xpReward: row.xpReward,
    progressCurrent,
    progressTarget,
    progressUnit: row.progressUnit,
    progressPercent,
    questSteps,
    periodTo: iso(row.periodTo),
    manualApprovalRequired: row.manualApprovalRequired,
  };
}

function missionQuestSteps(
  value: Prisma.JsonValue,
  progressCurrent: number,
): GuestPortalMissionStep[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  const steps = (value as Record<string, unknown>).questSteps;
  if (!Array.isArray(steps)) {
    return [];
  }

  let lastTarget = 0;
  let openStepMarked = false;

  return steps
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const row = item as Record<string, unknown>;
      const title = stringField(row.title);
      if (!title) {
        return null;
      }

      const rawTarget = numberField(row.target);
      const target = Math.max(lastTarget + 1, rawTarget ?? index + 1);
      lastTarget = target;

      const completed = progressCurrent >= target;
      const current = !completed && !openStepMarked;
      if (current) {
        openStepMarked = true;
      }

      return {
        id: stringField(row.id) ?? `step-${index + 1}`,
        title,
        target,
        progressCurrent: Math.min(progressCurrent, target),
        completed,
        current,
      };
    })
    .filter((item): item is GuestPortalMissionStep => Boolean(item))
    .slice(0, 5);
}

function mapSeason(
  row: {
    id: string;
    name: string;
    seasonType: string;
    periodTo: Date | null;
    premiumEnabled: boolean;
    levels: Prisma.JsonValue;
  },
  xp: number,
  rewards: Array<{
    seasonId: string | null;
    status: string;
    expiresAt: Date | null;
  }>,
): GuestPortalSeason {
  const levels = seasonLevels(row.levels, xp);
  const progress = buildSeasonProgress(levels, xp, rewards, row.id);

  return {
    id: row.id,
    name: row.name,
    seasonType: row.seasonType,
    periodTo: iso(row.periodTo),
    premiumEnabled: row.premiumEnabled,
    ...progress,
    levels,
  };
}

function mapReward(row: {
  id: string;
  status: string;
  lootBoxId: string | null;
  missionId: string | null;
  seasonId: string | null;
  rewardType: string;
  rewardAmount: Prisma.Decimal;
  rewardLabel: string;
  rewardCode: string | null;
  qualifiedAt: Date;
  expiresAt: Date | null;
  lootBox?: { name: string } | null;
  mission?: { name: string } | null;
  season?: { name: string } | null;
}): GuestPortalReward {
  const walletState = rewardWalletState(row.status, row.expiresAt);
  const source = rewardSource(row);

  return {
    id: row.id,
    status: row.status,
    walletState,
    rewardType: row.rewardType,
    rewardAmount: Number(row.rewardAmount),
    rewardLabel: row.rewardLabel,
    sourceKind: source.sourceKind,
    sourceLabel: source.sourceLabel,
    rewardCode: row.rewardCode,
    claimPayload:
      row.rewardCode && walletState === 'READY'
        ? buildRewardClaimPayload(row.id, row.rewardCode)
        : null,
    qualifiedAt: row.qualifiedAt.toISOString(),
    expiresAt: iso(row.expiresAt),
  };
}

function buildRewardSummary(
  rewards: GuestPortalReward[],
): GuestPortalRewardSummary {
  const nextExpiresAt = rewards
    .filter((reward) => reward.walletState === 'READY' && reward.expiresAt)
    .map((reward) => reward.expiresAt as string)
    .sort()[0];

  return {
    total: rewards.length,
    ready: rewards.filter((reward) => reward.walletState === 'READY').length,
    waitingApproval: rewards.filter(
      (reward) => reward.walletState === 'WAITING_APPROVAL',
    ).length,
    redeemed: rewards.filter((reward) => reward.walletState === 'REDEEMED')
      .length,
    expired: rewards.filter((reward) => reward.walletState === 'EXPIRED')
      .length,
    nextExpiresAt: nextExpiresAt ?? null,
  };
}

function buildNextActions(input: {
  guestFound: boolean;
  lootBoxes: GuestPortalLootBox[];
  missions: GuestPortalMission[];
  seasons: GuestPortalSeason[];
  rewards: GuestPortalReward[];
}): GuestPortalNextAction[] {
  const actions: GuestPortalNextAction[] = [];
  const readyReward = input.rewards.find(
    (reward) => reward.walletState === 'READY',
  );
  const latestLootBox = input.lootBoxes.find((lootBox) => lootBox.latestReward);
  const closestMission = input.missions
    .filter((mission) => mission.progressPercent < 100)
    .sort((left, right) => right.progressPercent - left.progressPercent)[0];
  const waitingMission = input.missions.find(
    (mission) =>
      mission.progressPercent >= 100 && mission.manualApprovalRequired,
  );
  const season = input.seasons[0] ?? null;

  if (readyReward) {
    actions.push({
      id: `claim:${readyReward.id}`,
      kind: 'CLAIM_REWARD',
      title: 'Заберите готовую награду',
      description: readyReward.sourceLabel
        ? `${readyReward.rewardLabel} из сценария "${readyReward.sourceLabel}".`
        : readyReward.rewardLabel,
      priority: 'HIGH',
      statusLabel: readyReward.expiresAt ? 'есть срок действия' : 'готово',
      progressPercent: 100,
      anchor: 'rewards',
    });
  }

  if (latestLootBox?.latestReward) {
    actions.push({
      id: `loot-box:${latestLootBox.id}`,
      kind: 'OPEN_LOOT_BOX',
      title: 'Откройте последний лутбокс',
      description:
        latestLootBox.latestReward.walletState === 'READY'
          ? 'Внутри уже есть награда, которую можно показать администратору.'
          : 'Результат уже сохранен в LeetPlus и ожидает проверки клуба.',
      priority: readyReward ? 'MEDIUM' : 'HIGH',
      statusLabel:
        latestLootBox.latestReward.walletState === 'READY'
          ? 'можно забрать'
          : 'на проверке',
      progressPercent: 100,
      anchor: 'lootBoxes',
    });
  }

  if (closestMission) {
    const target = closestMission.progressTarget ?? 1;
    const unit = closestMission.progressUnit
      ? ` ${closestMission.progressUnit}`
      : '';
    actions.push({
      id: `mission:${closestMission.id}`,
      kind: 'FINISH_MISSION',
      title: 'Добейте ближайшую миссию',
      description: `${closestMission.name}: ${closestMission.progressCurrent}/${target}${unit}.`,
      priority: actions.length ? 'MEDIUM' : 'HIGH',
      statusLabel: `${Math.round(closestMission.progressPercent)}%`,
      progressPercent: closestMission.progressPercent,
      anchor: 'missions',
    });
  } else if (waitingMission) {
    actions.push({
      id: `mission-waiting:${waitingMission.id}`,
      kind: 'FINISH_MISSION',
      title: 'Миссия выполнена',
      description:
        'Клуб проверяет результат и подготовит награду в кошельке гостя.',
      priority: 'MEDIUM',
      statusLabel: 'ожидает проверки',
      progressPercent: 100,
      anchor: 'missions',
    });
  }

  if (season?.nextLevel) {
    actions.push({
      id: `battle-pass:${season.id}`,
      kind: 'BATTLE_PASS',
      title: `Дойдите до уровня ${season.nextLevel}`,
      description:
        season.nextRewardLabel ??
        'Следующая награда появится после набора XP в текущем сезоне.',
      priority: actions.length ? 'LOW' : 'MEDIUM',
      statusLabel:
        season.xpToNextLevel == null
          ? 'сезон завершен'
          : `${season.xpToNextLevel} XP`,
      progressPercent: season.progressPercent,
      anchor: 'battlePass',
    });
  }

  if (!input.guestFound) {
    actions.push({
      id: 'match-langame',
      kind: 'MATCH_LANGAME',
      title: 'Проверьте профиль Langame',
      description:
        'Если телефон есть в Langame, кабинет сможет связать гостя с локальными snapshot-данными.',
      priority: 'HIGH',
      statusLabel: 'нужна проверка',
      progressPercent: null,
      anchor: 'profile',
    });
  }

  return actions.slice(0, 4);
}

function buildGuestSnapshot(
  guest: {
    externalProvider: IntegrationProvider | null;
    externalDomain: string | null;
    phoneHash: string | null;
    phoneMasked: string | null;
    emailHash: string | null;
    emailMasked: string | null;
    fullNameHash: string | null;
    fullNameMasked: string | null;
    birthYear: number | null;
    birthMonth: number | null;
    birthDay: number | null;
    insertedAt: Date | null;
    lastActivityAt: Date | null;
    isVirtual: boolean;
    isTemporary: boolean;
    isDisabled: boolean;
    isSimpleRegistration: boolean;
    isConfirmed: boolean;
    isMobileRegistration: boolean;
    identityDocumentPresent: boolean;
    bonusProgramNumber: string | null;
    lastSyncedAt: Date | null;
  } | null,
): GuestPortalGuestSnapshot {
  if (!guest) {
    return {
      source: {
        provider: 'LeetPlus',
        domain: null,
        lastSyncedAt: null,
      },
      identity: {
        phoneMasked: null,
        emailMasked: null,
        fullNameMasked: null,
        birthdayProvided: false,
        documentPresent: false,
        bonusProgramNumberMasked: null,
      },
      registration: {
        registeredAt: null,
        lastActivityAt: null,
        confirmed: false,
        mobileRegistration: false,
        simpleRegistration: false,
        temporary: false,
        virtual: false,
        disabled: false,
      },
      profileCompleteness: {
        percent: 0,
        completed: [],
        missing: ['Синхронизированный профиль Langame'],
      },
      statusLabels: ['Профиль появится после синхронизации клуба'],
    };
  }

  const birthdayProvided = Boolean(
    guest.birthYear || guest.birthMonth || guest.birthDay,
  );
  const completenessItems = [
    {
      label: 'Телефон',
      done: Boolean(guest.phoneHash || guest.phoneMasked),
    },
    {
      label: 'Email',
      done: Boolean(guest.emailHash || guest.emailMasked),
    },
    {
      label: 'Имя',
      done: Boolean(guest.fullNameHash || guest.fullNameMasked),
    },
    {
      label: 'Дата рождения',
      done: birthdayProvided,
    },
    {
      label: 'Подтверждение профиля',
      done: guest.isConfirmed,
    },
    {
      label: 'Карта/номер бонусной программы',
      done: Boolean(guest.bonusProgramNumber),
    },
  ];
  const completed = completenessItems
    .filter((item) => item.done)
    .map((item) => item.label);
  const missing = completenessItems
    .filter((item) => !item.done)
    .map((item) => item.label);

  return {
    source: {
      provider:
        guest.externalProvider === IntegrationProvider.LANGAME
          ? 'Langame'
          : (guest.externalProvider ?? 'LeetPlus'),
      domain: guest.externalDomain ?? null,
      lastSyncedAt: iso(guest.lastSyncedAt),
    },
    identity: {
      phoneMasked: guest.phoneMasked,
      emailMasked: guest.emailMasked,
      fullNameMasked: guest.fullNameMasked,
      birthdayProvided,
      documentPresent: guest.identityDocumentPresent,
      bonusProgramNumberMasked: maskIdentifier(guest.bonusProgramNumber),
    },
    registration: {
      registeredAt: iso(guest.insertedAt),
      lastActivityAt: iso(guest.lastActivityAt),
      confirmed: guest.isConfirmed,
      mobileRegistration: guest.isMobileRegistration,
      simpleRegistration: guest.isSimpleRegistration,
      temporary: guest.isTemporary,
      virtual: guest.isVirtual,
      disabled: guest.isDisabled,
    },
    profileCompleteness: {
      percent: percent(completed.length, completenessItems.length),
      completed,
      missing,
    },
    statusLabels: buildGuestStatusLabels(guest),
  };
}

function buildGuestStatusLabels(guest: {
  isConfirmed: boolean;
  isMobileRegistration: boolean;
  isSimpleRegistration: boolean;
  isTemporary: boolean;
  isVirtual: boolean;
  isDisabled: boolean;
  identityDocumentPresent: boolean;
}) {
  const labels = [
    guest.isConfirmed ? 'Профиль подтвержден' : 'Профиль не подтвержден',
    guest.isMobileRegistration ? 'Мобильная регистрация' : null,
    guest.isSimpleRegistration ? 'Упрощенная регистрация' : null,
    guest.isTemporary ? 'Временный гость' : null,
    guest.isVirtual ? 'Виртуальный профиль' : null,
    guest.isDisabled ? 'Профиль отключен' : null,
    guest.identityDocumentPresent ? 'Документ указан в Langame' : null,
  ].filter((item): item is string => Boolean(item));

  return labels.length ? labels : ['Обычный профиль гостя'];
}

function comparePortalRewards(
  left: GuestPortalReward,
  right: GuestPortalReward,
) {
  const leftRank = walletStateRank(left.walletState);
  const rightRank = walletStateRank(right.walletState);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return Date.parse(right.qualifiedAt) - Date.parse(left.qualifiedAt);
}

function walletStateRank(state: GuestPortalReward['walletState']) {
  switch (state) {
    case 'READY':
      return 0;
    case 'WAITING_APPROVAL':
      return 1;
    case 'REDEEMED':
      return 2;
    case 'EXPIRED':
      return 3;
    case 'CANCELED':
      return 4;
  }
}

function rewardSource(row: {
  lootBoxId: string | null;
  missionId: string | null;
  seasonId: string | null;
  lootBox?: { name: string } | null;
  mission?: { name: string } | null;
  season?: { name: string } | null;
}): Pick<GuestPortalReward, 'sourceKind' | 'sourceLabel'> {
  if (row.lootBoxId) {
    return {
      sourceKind: 'LOOT_BOX',
      sourceLabel: row.lootBox?.name ?? null,
    };
  }

  if (row.missionId) {
    return {
      sourceKind: 'MISSION',
      sourceLabel: row.mission?.name ?? null,
    };
  }

  if (row.seasonId) {
    return {
      sourceKind: 'BATTLE_PASS',
      sourceLabel: row.season?.name ?? null,
    };
  }

  return {
    sourceKind: 'MANUAL',
    sourceLabel: null,
  };
}

function communicationPreferenceAction(
  value: unknown,
): GuestPortalCommunicationPreferenceAction {
  if (value === 'GRANT' || value === 'DENY' || value === 'UNSUBSCRIBE') {
    return value;
  }

  throw new BadRequestException(
    'Неизвестное действие для настройки коммуникаций.',
  );
}

function communicationPreferenceMessage(
  action: GuestPortalCommunicationPreferenceAction,
) {
  const messages = {
    GRANT:
      'Согласие сохранено. Игровые уведомления можно будет включить после подключения Telegram/MAX или SMS.',
    DENY: 'Отказ сохранен. Игровые сообщения не будут отправляться без нового согласия.',
    UNSUBSCRIBE:
      'Отписка сохранена. Каналы нельзя использовать для игровых сообщений без нового согласия.',
  } satisfies Record<GuestPortalCommunicationPreferenceAction, string>;

  return messages[action];
}

function buildCommunications(
  guest: {
    phoneMasked: string | null;
    phoneConsentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
    phoneConsentSource: string | null;
    phoneConsentAt: Date | null;
    unsubscribedAt: Date | null;
  } | null,
  profile: {
    contactMasked: string | null;
    telegramIdentity: string | null;
    maxIdentity: string | null;
  } | null,
): GuestPortalCommunications {
  const consentStatus = guest?.unsubscribedAt
    ? 'UNSUBSCRIBED'
    : (guest?.phoneConsentStatus ?? 'UNKNOWN');
  const consentGranted = consentStatus === 'GRANTED';

  return {
    phone: {
      masked: guest?.phoneMasked ?? profile?.contactMasked ?? null,
      consentStatus,
      consentSource: guest?.phoneConsentSource ?? null,
      consentAt: iso(guest?.phoneConsentAt ?? null),
      unsubscribedAt: iso(guest?.unsubscribedAt ?? null),
      otpVerified: true,
      otpDeliveryReady: false,
    },
    telegram: communicationChannel(
      profile?.telegramIdentity ?? null,
      consentGranted,
      consentStatus,
    ),
    max: communicationChannel(
      profile?.maxIdentity ?? null,
      consentGranted,
      consentStatus,
    ),
  };
}

function communicationChannel(
  identity: string | null,
  consentGranted: boolean,
  consentStatus: GuestPortalCommunications['phone']['consentStatus'],
): GuestPortalCommunicationChannel {
  const normalized = identity?.trim() || null;

  if (consentStatus === 'UNSUBSCRIBED') {
    return {
      connected: Boolean(normalized),
      identityMasked: maskExternalIdentity(normalized),
      readyForRewards: false,
      status: 'UNSUBSCRIBED',
    };
  }

  if (!normalized) {
    return {
      connected: false,
      identityMasked: null,
      readyForRewards: false,
      status: 'NOT_CONNECTED',
    };
  }

  return {
    connected: true,
    identityMasked: maskExternalIdentity(normalized),
    readyForRewards: consentGranted,
    status: consentGranted ? 'READY' : 'CONNECTED_NO_CONSENT',
  };
}

function maskExternalIdentity(value: string | null) {
  if (!value) {
    return null;
  }

  if (value.length <= 4) {
    return '****';
  }

  if (value.startsWith('@')) {
    return `${value.slice(0, 3)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 2)}...${value.slice(-2)}`;
}

function maskIdentifier(value: string | null) {
  const normalized = value?.trim() ?? '';

  if (!normalized) {
    return null;
  }

  if (normalized.length <= 4) {
    return '****';
  }

  return `${normalized.slice(0, 2)}...${normalized.slice(-2)}`;
}

function emptyActivity(): GuestPortalPayload['activity'] {
  return {
    summary: {
      sessionsCount: 0,
      playMinutes: 0,
      logsCount: 0,
      transactionsCount: 0,
      gameEventsCount: 0,
      lastActivityAt: null,
    },
    timeline: [],
    xpHistory: [],
  };
}

function mapSessionActivity(row: {
  id: string;
  startedAt: Date | null;
  stoppedAt: Date | null;
  durationMinutes: number | null;
  normalStop: boolean | null;
  packet: boolean | null;
  createdAt: Date;
  store: { name: string } | null;
}): GuestPortalActivityItem {
  const description = [
    row.durationMinutes == null ? null : `${row.durationMinutes} мин`,
    row.packet ? 'пакет часов' : 'обычная сессия',
    row.normalStop === false ? 'завершена нестандартно' : null,
  ]
    .filter((item): item is string => Boolean(item))
    .join(' · ');

  return {
    id: `session:${row.id}`,
    kind: 'SESSION',
    title: 'Игровая сессия',
    description: description || null,
    occurredAt: (row.startedAt ?? row.stoppedAt ?? row.createdAt).toISOString(),
    storeName: row.store?.name ?? null,
    amount: null,
    xpDelta: null,
  };
}

function mapLogActivity(row: {
  id: string;
  type: string | null;
  happenedAt: Date | null;
  createdAt: Date;
}): GuestPortalActivityItem {
  return {
    id: `log:${row.id}`,
    kind: 'LOG',
    title: row.type ? `Событие: ${row.type}` : 'Событие профиля',
    description: 'Сохранено из истории Langame',
    occurredAt: (row.happenedAt ?? row.createdAt).toISOString(),
    storeName: null,
    amount: null,
    xpDelta: null,
  };
}

function mapTransactionActivity(row: {
  id: string;
  type: string | null;
  happenedAt: Date | null;
  amount: Prisma.Decimal | null;
  createdAt: Date;
  store: { name: string } | null;
}): GuestPortalActivityItem {
  const amount = decimalNumber(row.amount);

  return {
    id: `transaction:${row.id}`,
    kind: 'TRANSACTION',
    title: row.type ? `Операция: ${row.type}` : 'Операция баланса',
    description:
      amount == null
        ? 'Обновление баланса гостя'
        : `${amount >= 0 ? 'Пополнение' : 'Списание'} ${Math.abs(amount)} руб`,
    occurredAt: (row.happenedAt ?? row.createdAt).toISOString(),
    storeName: row.store?.name ?? null,
    amount,
    xpDelta: null,
  };
}

function mapGameEventActivity(row: {
  id: string;
  eventType: string;
  xpDelta: number;
  occurredAt: Date;
  lootBox: { name: string } | null;
  mission: { name: string } | null;
  season: { name: string } | null;
}): GuestPortalActivityItem {
  const sourceName = row.mission?.name ?? row.lootBox?.name ?? row.season?.name;
  const xpLabel =
    row.xpDelta === 0 ? null : `${row.xpDelta > 0 ? '+' : ''}${row.xpDelta} XP`;
  const description = [sourceName, xpLabel]
    .filter((item): item is string => Boolean(item))
    .join(' · ');

  return {
    id: `game-event:${row.id}`,
    kind: 'GAME_EVENT',
    title: `Игровое событие: ${row.eventType}`,
    description: description || null,
    occurredAt: row.occurredAt.toISOString(),
    storeName: null,
    amount: null,
    xpDelta: row.xpDelta,
  };
}

function mapXpHistory(row: {
  id: string;
  eventType: string;
  xpDelta: number;
  occurredAt: Date;
  lootBox: { name: string } | null;
  mission: { name: string } | null;
  season: { name: string } | null;
}): GuestPortalXpHistoryItem {
  const sourceLabel =
    row.mission?.name ?? row.lootBox?.name ?? row.season?.name;

  return {
    id: `xp:${row.id}`,
    eventType: row.eventType,
    title: row.xpDelta > 0 ? 'XP начислен' : 'XP скорректирован',
    description: sourceLabel
      ? `${sourceLabel}: ${row.eventType}`
      : row.eventType,
    xpDelta: row.xpDelta,
    occurredAt: row.occurredAt.toISOString(),
    sourceLabel: sourceLabel ?? null,
  };
}

function rewardWalletState(
  status: string,
  expiresAt: Date | null,
): GuestPortalReward['walletState'] {
  if (status === 'PAID') {
    return 'REDEEMED';
  }

  if (status === 'CANCELED') {
    return 'CANCELED';
  }

  if (
    status === 'EXPIRED' ||
    (expiresAt !== null && expiresAt.getTime() < Date.now())
  ) {
    return 'EXPIRED';
  }

  if (status === 'APPROVED') {
    return 'READY';
  }

  return 'WAITING_APPROVAL';
}

function buildRewardClaimPayload(rewardId: string, rewardCode: string) {
  return `LEETPLUS_REWARD:${rewardId}:${rewardCode}`;
}

type GuestPortalSeasonLevel = GuestPortalSeason['levels'][number];

function seasonLevels(value: Prisma.JsonValue, xp: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const row = item as Record<string, unknown>;
      const level = numberField(row.level);
      const requiredXp = numberField(row.xp);

      if (level == null || requiredXp == null) {
        return null;
      }

      return {
        level,
        xp: requiredXp,
        freeReward: stringField(row.freeReward),
        premiumReward: stringField(row.premiumReward),
        reached: xp >= requiredXp,
        current: false,
        next: false,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => left.xp - right.xp || left.level - right.level)
    .slice(0, 12);
}

function buildSeasonProgress(
  levels: GuestPortalSeasonLevel[],
  xp: number,
  rewards: Array<{
    seasonId: string | null;
    status: string;
    expiresAt: Date | null;
  }>,
  seasonId: string,
): Omit<
  GuestPortalSeason,
  'id' | 'name' | 'seasonType' | 'premiumEnabled' | 'periodTo' | 'levels'
> {
  const reached = levels.filter((level) => level.reached);
  const current = reached[reached.length - 1] ?? levels[0] ?? null;
  const next = levels.find((level) => !level.reached) ?? null;
  const currentLevelXp = current?.xp ?? 0;
  const nextLevelXp = next?.xp ?? null;
  const xpToNextLevel =
    typeof nextLevelXp === 'number' ? Math.max(0, nextLevelXp - xp) : null;
  const progressPercent =
    typeof nextLevelXp === 'number'
      ? percent(xp - currentLevelXp, Math.max(1, nextLevelXp - currentLevelXp))
      : 100;
  const seasonRewards = rewards.filter(
    (reward) => reward.seasonId === seasonId,
  );
  const mappedRewards = seasonRewards.map((reward) =>
    rewardWalletState(reward.status, reward.expiresAt),
  );

  levels.forEach((level) => {
    level.current = current ? level.level === current.level : false;
    level.next = next ? level.level === next.level : false;
  });

  return {
    currentLevel: current?.level ?? 1,
    nextLevel: next?.level ?? null,
    currentLevelXp,
    nextLevelXp,
    xpToNextLevel,
    progressPercent,
    reachedLevels: reached.length,
    totalLevels: levels.length,
    readyRewards: mappedRewards.filter((state) => state === 'READY').length,
    waitingApprovalRewards: mappedRewards.filter(
      (state) => state === 'WAITING_APPROVAL',
    ).length,
    redeemedRewards: mappedRewards.filter((state) => state === 'REDEEMED')
      .length,
    nextRewardLabel: next?.freeReward ?? null,
    nextPremiumRewardLabel: next?.premiumReward ?? null,
  };
}

function matchesStore(value: Prisma.JsonValue | null, storeId: string) {
  const storeIds = stringArray(value);
  return storeIds.length === 0 || storeIds.includes(storeId);
}

function activePeriod(from: Date | null, to: Date | null) {
  const now = Date.now();
  return (!from || from.getTime() <= now) && (!to || to.getTime() >= now);
}

function dateWithinMission(
  value: Date,
  mission: { periodFrom: Date | null; periodTo: Date | null },
) {
  return (
    (!mission.periodFrom || value.getTime() >= mission.periodFrom.getTime()) &&
    (!mission.periodTo || value.getTime() <= mission.periodTo.getTime())
  );
}

function missionProgressEvent(row: { eventType: string; source: string }) {
  return (
    row.source !== 'SYSTEM' ||
    row.eventType === 'MISSION_COMPLETED' ||
    row.eventType === 'REWARD_QUALIFIED'
  );
}

function stringArray(value: Prisma.JsonValue | null) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberField(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  return null;
}

function decimalNumber(value: Prisma.Decimal | null | undefined) {
  return value == null ? null : Number(value);
}

function percent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function newestDate(values: Array<Date | null>) {
  return values
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];
}

function levelFromXp(xp: number) {
  return Math.max(1, Math.floor(xp / 500) + 1);
}

function frameForLevel(level: number): GuestPortalPayload['profile']['frame'] {
  if (level >= 20) {
    return 'diamond';
  }
  if (level >= 12) {
    return 'gold';
  }
  if (level >= 6) {
    return 'silver';
  }
  if (level >= 2) {
    return 'bronze';
  }
  return 'starter';
}

function iso(value: Date | null) {
  return value ? value.toISOString() : null;
}
