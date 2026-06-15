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
  UserRole,
} from '@prisma/client';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
} from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  GuestGamificationService,
  type GuestGameCheckInResult,
} from '../guest-gamification/guest-gamification.service';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import type {
  LangameGuestDetailsPortalResult,
  LangameGuestSearchResultItem,
} from '../integrations/langame.types';
import { PrismaService } from '../prisma/prisma.service';

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const GUEST_TOKEN_EXPIRES_IN = '7d';
const GUEST_PORTAL_PURPOSE = 'guest_portal';
const TELEGRAM_LINK_TTL_MINUTES = 15;
const COMMUNICATION_PREFERENCE_EVENT_PREFIX =
  'guest_portal:communication_preference:';
const TELEGRAM_LINK_EVENT_PREFIX = 'guest_portal:telegram_bot_link:';
const GAME_CONSENT_EVENT_TYPE = 'GAME_CONSENT_GRANTED';
const GAME_CONSENT_VERSION = 'guest-game-v1-2026-06-15';
const GAME_PROFILE_LINKED_EVENT_TYPE = 'GAME_PROFILE_LINKED';
const GAME_PROFILE_LINK_SOURCE = 'GUEST_PORTAL_PROFILE_LINK';
type JwtExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;
type GuestPortalOtpDeliveryChannel = 'DEV' | 'SMS' | 'TELEGRAM' | 'MAX';
type GuestPortalOtpDeliveryStatus =
  | 'DEV_CODE'
  | 'SENT'
  | 'NOT_CONFIGURED'
  | 'BLOCKED'
  | 'FAILED';
type GuestPortalOtpDeliveryResult = {
  channel: GuestPortalOtpDeliveryChannel;
  status: GuestPortalOtpDeliveryStatus;
  deliveredAt: Date | null;
  devCode?: string;
  message: string;
  note?: string;
  identityMasked?: string | null;
  requiredEnv?: string[];
};
type GuestPortalPhoneIdentity = {
  normalized: string;
  hash: string;
  masked: string;
};

type GuestPortalTokenPayload = {
  sub: string;
  purpose: typeof GUEST_PORTAL_PURPOSE;
  tenantId: string;
  storeId: string;
  guestId: string | null;
  profileId: string | null;
  phoneHash: string;
};

type GuestPortalOtpChallengeRegistration = {
  id: string;
  tenantId: string;
  storeId: string;
  guestId: string | null;
  profileId: string | null;
  phoneHash: string;
  phoneMasked: string | null;
  gameConsentAcceptedAt: Date | null;
  gameConsentVersion: string | null;
};

type GuestPortalGameProfileLinkStatus =
  | 'LINKED'
  | 'ALREADY_LINKED'
  | 'WAITING_FOR_SYNC'
  | 'CONFLICT'
  | 'NOT_LINKED';

type GuestPortalGameProfileLinkResult = {
  status: GuestPortalGameProfileLinkStatus;
  guestId: string | null;
  profileId: string | null;
  linkedNow: boolean;
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

export type GuestPortalGamificationClubDirectory = {
  updatedAt: string;
  total: number;
  cities: string[];
  clubs: Array<{
    id: string;
    tenant: {
      name: string;
      slug: string;
    };
    store: {
      id: string;
      publicSlug: string | null;
      name: string;
      city: string | null;
      address: string | null;
    };
    location: {
      city: string | null;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      coordinatesReady: boolean;
      distanceKm: number | null;
    };
    links: {
      guestPortalPath: string;
    };
    gamification: {
      activeMissions: number;
      activeLootBoxes: number;
      activeSeasons: number;
      activeRules: number;
      gamificationEnabled: boolean;
      configuredByStore: boolean;
      bonusWriteReady: boolean;
    };
  }>;
};

export type GuestPortalOtpStartResponse = {
  challengeId: string;
  phoneMasked: string;
  expiresAt: string;
  resendAfterSeconds: number;
  delivery: {
    channel: GuestPortalOtpDeliveryChannel;
    status: GuestPortalOtpDeliveryStatus;
    devCode?: string;
    message: string;
    note?: string;
    identityMasked?: string | null;
    requiredEnv?: string[];
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

export type GuestPortalCommunicationHistoryItem = {
  id: string;
  action: GuestPortalCommunicationPreferenceAction;
  label: string;
  note: string;
  createdAt: string;
};

export type GuestPortalCommunicationPreferenceResponse = {
  portal: GuestPortalPayload;
  message: string;
};

export type GuestPortalMessengerChannel = 'TELEGRAM' | 'MAX';

export type GuestPortalMessengerUpdateResponse = {
  portal: GuestPortalPayload;
  message: string;
};

export type GuestPortalTelegramLinkStartResponse = {
  code: string;
  codeMasked: string;
  expiresAt: string;
  botUsername: string | null;
  botDeepLink: string | null;
  status: 'READY' | 'BOT_NOT_CONFIGURED';
  message: string;
};

export type GuestPortalTelegramLinkConfirmResponse = {
  status: 'CONFIRMED';
  tenantId: string;
  profileId: string;
  telegramIdentityMasked: string | null;
  message: string;
};

export type GuestPortalTelegramWebhookResponse = {
  status: 'CONFIRMED' | 'UNSUBSCRIBED' | 'IGNORED' | 'FAILED';
  action: 'LINK_CODE' | 'UNSUBSCRIBE' | 'UNKNOWN';
  profileId: string | null;
  profilesAffected?: number;
  deliveriesBlocked?: number;
  telegramIdentityMasked: string | null;
  message: string;
};

export type GuestPortalPayload = {
  tenant: GuestPortalPublicConfig['tenant'];
  store: GuestPortalPublicConfig['store'];
  guestFound: boolean;
  crmLead: GuestPortalCrmLead;
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

export type GuestPortalCrmLead = {
  found: boolean;
  displayName: string | null;
  contactMasked: string | null;
  source: string | null;
  eventName: string | null;
  crmStatus: GuestCrmStatus | null;
  nextContactAt: string | null;
  matchedGuestFound: boolean;
  matchedAt: string | null;
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
  participation: {
    accountState:
      | 'LANGAME_SYNCED'
      | 'CRM_LEAD'
      | 'GAME_PROFILE'
      | 'DISABLED'
      | 'TEMPORARY'
      | 'VIRTUAL'
      | 'NOT_MATCHED';
    accountStateLabel: string;
    guestTypeId: string | null;
    genderLabel: string | null;
    registrationChannel: string;
    verificationLabel: string;
    loyaltyCardStatus: 'LINKED' | 'MISSING' | 'UNKNOWN';
    readinessPercent: number;
    readiness: GuestPortalProfileReadinessItem[];
  };
  statusLabels: string[];
};

export type GuestPortalProfileReadinessItem = {
  id: string;
  label: string;
  status: 'READY' | 'ATTENTION' | 'MISSING';
  note: string;
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
  history: GuestPortalCommunicationHistoryItem[];
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
  linkStatus: GuestPortalGameProfileLinkStatus;
  linkedGuestId: string | null;
  linkedProfileId: string | null;
  nextAction: string;
  portal: GuestPortalPayload | null;
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

export type GuestPortalLangameDetailsResponse = {
  checkedAt: string;
  status: 'SUCCESS' | 'FAILED' | 'NOT_LINKED';
  nextAction: string;
  localSnapshot: {
    sourceDomain: string | null;
    externalGuestId: string | null;
    lastSyncedAt: string | null;
  };
  langame: LangameGuestDetailsPortalResult | null;
};

export type GuestPortalCheckInResponse = {
  checkIn: GuestGameCheckInResult;
  portal: GuestPortalPayload;
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
    private readonly guestGamificationService: GuestGamificationService,
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

  async getGamificationClubDirectory(
    query: { lat?: string; lng?: string } = {},
  ): Promise<GuestPortalGamificationClubDirectory> {
    const [stores, missions, lootBoxes, seasons] = await Promise.all([
      this.prisma.store.findMany({
        where: {
          isActive: true,
          tenant: { is: { status: TenantLifecycleStatus.ACTIVE } },
        },
        select: {
          id: true,
          publicSlug: true,
          name: true,
          city: true,
          address: true,
          latitude: true,
          longitude: true,
          externalProvider: true,
          externalDomain: true,
          gamificationEnabled: true,
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.guestGameMission.findMany({
        where: { status: 'ACTIVE' },
        select: {
          tenantId: true,
          storeIds: true,
          periodFrom: true,
          periodTo: true,
        },
      }),
      this.prisma.guestGameLootBox.findMany({
        where: { status: 'ACTIVE' },
        select: {
          tenantId: true,
          storeIds: true,
        },
      }),
      this.prisma.guestGameSeason.findMany({
        where: { status: 'ACTIVE' },
        select: {
          tenantId: true,
          periodFrom: true,
          periodTo: true,
        },
      }),
    ]);
    const guestLocation = geoPoint(query.lat, query.lng);
    const bonusWriteEnabled = booleanEnv(
      this.configService.get<string>('LANGAME_BONUS_ACCRUAL_ENABLED'),
    );
    const clubs = stores
      .map((store) => {
        const activeMissions = missions.filter(
          (mission) =>
            mission.tenantId === store.tenant.id &&
            matchesStore(mission.storeIds, store.id) &&
            activePeriod(mission.periodFrom, mission.periodTo),
        ).length;
        const activeLootBoxes = lootBoxes.filter(
          (lootBox) =>
            lootBox.tenantId === store.tenant.id &&
            matchesStore(lootBox.storeIds, store.id),
        ).length;
        const activeSeasons = seasons.filter(
          (season) =>
            season.tenantId === store.tenant.id &&
            activePeriod(season.periodFrom, season.periodTo),
        ).length;
        const activeRules = activeMissions + activeLootBoxes + activeSeasons;
        const storeSlug = store.publicSlug ?? store.id;
        const latitude = decimalNumber(store.latitude);
        const longitude = decimalNumber(store.longitude);
        const distanceKm =
          guestLocation && latitude !== null && longitude !== null
            ? haversineDistanceKm(guestLocation, { latitude, longitude })
            : null;

        return {
          id: `${store.tenant.slug}:${storeSlug}`,
          tenant: {
            name: store.tenant.name,
            slug: store.tenant.slug,
          },
          store: {
            id: store.id,
            publicSlug: store.publicSlug,
            name: store.name,
            city: store.city,
            address: store.address,
          },
          location: {
            city: store.city,
            address: store.address,
            latitude,
            longitude,
            coordinatesReady: latitude !== null && longitude !== null,
            distanceKm,
          },
          links: {
            guestPortalPath: `/guest/${encodeURIComponent(
              store.tenant.slug,
            )}/${encodeURIComponent(storeSlug)}`,
          },
          gamification: {
            activeMissions,
            activeLootBoxes,
            activeSeasons,
            activeRules,
            gamificationEnabled: store.gamificationEnabled || activeRules > 0,
            configuredByStore: store.gamificationEnabled,
            bonusWriteReady:
              bonusWriteEnabled &&
              store.externalProvider === IntegrationProvider.LANGAME &&
              Boolean(store.externalDomain),
          },
        };
      })
      .filter((club) => club.gamification.gamificationEnabled)
      .sort((left, right) => compareDirectoryClubs(left, right));
    const cities = uniqueStrings(
      clubs.map((club) => club.store.city?.trim() || null),
    ).sort((left, right) => left.localeCompare(right, 'ru'));

    return {
      updatedAt: new Date().toISOString(),
      total: clubs.length,
      cities,
      clubs,
    };
  }

  async startOtp(
    tenantSlug: string,
    storeId: string,
    dto: { phone?: unknown; gameConsentAccepted?: unknown },
  ): Promise<GuestPortalOtpStartResponse> {
    const context = await this.getTenantStore(tenantSlug, storeId);
    const phone = this.phoneIdentity(dto.phone);
    const now = new Date();
    const resendAfter = new Date(now.getTime() - OTP_RESEND_SECONDS * 1000);
    const gameConsentAcceptedAt = dto.gameConsentAccepted === true ? now : null;

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
        select: {
          id: true,
          phoneConsentStatus: true,
          unsubscribedAt: true,
        },
      }),
      this.prisma.guestGameProfile.findFirst({
        where: {
          tenantId: context.tenant.id,
          phoneHash: phone.hash,
          status: 'ACTIVE',
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, telegramIdentity: true, maxIdentity: true },
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
          select: { id: true, telegramIdentity: true, maxIdentity: true },
        })
      : profileByPhone;

    const id = randomUUID();
    const code = this.generateOtp();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
    const delivery = await this.deliverOtpCode({
      code,
      context,
      phone,
      profile,
      guest,
    });

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
        status: otpChallengeStatus(delivery.status),
        deliveryChannel: delivery.channel,
        expiresAt,
        deliveredAt: delivery.deliveredAt,
        gameConsentAcceptedAt,
        gameConsentVersion: gameConsentAcceptedAt ? GAME_CONSENT_VERSION : null,
      },
    });

    return {
      challengeId: id,
      phoneMasked: phone.masked,
      expiresAt: expiresAt.toISOString(),
      resendAfterSeconds: OTP_RESEND_SECONDS,
      delivery: {
        channel: delivery.channel,
        status: delivery.status,
        ...(delivery.devCode ? { devCode: delivery.devCode } : {}),
        message: delivery.message,
        ...(delivery.note ? { note: delivery.note } : {}),
        ...(delivery.identityMasked
          ? { identityMasked: delivery.identityMasked }
          : {}),
        ...(delivery.requiredEnv?.length
          ? { requiredEnv: delivery.requiredEnv }
          : {}),
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

    const profile = await this.completeOtpRegistration(challenge);

    const payload: GuestPortalTokenPayload = {
      sub: challenge.id,
      purpose: GUEST_PORTAL_PURPOSE,
      tenantId: context.tenant.id,
      storeId: context.store.id,
      guestId: profile.guestId,
      profileId: profile.id,
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

  private async completeOtpRegistration(
    challenge: GuestPortalOtpChallengeRegistration,
  ) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const guest = challenge.guestId
        ? await tx.guest.findFirst({
            where: {
              id: challenge.guestId,
              tenantId: challenge.tenantId,
              isDisabled: false,
            },
            select: {
              id: true,
              externalGuestId: true,
              fullNameMasked: true,
              phoneMasked: true,
              emailMasked: true,
            },
          })
        : null;
      const existingProfile = await this.findRegistrationProfile(tx, challenge);
      const profile = existingProfile
        ? await tx.guestGameProfile.update({
            where: { id: existingProfile.id },
            data: {
              ...(guest && !existingProfile.guestId
                ? { guestId: guest.id }
                : {}),
              phoneHash: existingProfile.phoneHash ?? challenge.phoneHash,
              contactMasked:
                existingProfile.contactMasked ??
                guest?.phoneMasked ??
                guest?.emailMasked ??
                challenge.phoneMasked,
              displayName:
                existingProfile.displayName ??
                guest?.fullNameMasked ??
                guest?.externalGuestId ??
                'Гость клуба',
              status: 'ACTIVE',
              lastActivityAt: now,
            },
            select: { id: true, guestId: true },
          })
        : await tx.guestGameProfile.create({
            data: {
              tenantId: challenge.tenantId,
              ...(guest ? { guestId: guest.id } : {}),
              displayName:
                guest?.fullNameMasked ??
                guest?.externalGuestId ??
                'Гость клуба',
              contactMasked:
                guest?.phoneMasked ??
                guest?.emailMasked ??
                challenge.phoneMasked,
              phoneHash: challenge.phoneHash,
              status: 'ACTIVE',
              lastActivityAt: now,
            },
            select: { id: true, guestId: true },
          });

      await tx.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          status: 'VERIFIED',
          verifiedAt: now,
          guestId: profile.guestId ?? challenge.guestId,
          profileId: profile.id,
        },
      });
      await this.createGameConsentEvent(tx, challenge, profile.id, now);

      return {
        id: profile.id,
        guestId: profile.guestId ?? challenge.guestId,
      };
    });
  }

  private async createGameConsentEvent(
    tx: Prisma.TransactionClient,
    challenge: GuestPortalOtpChallengeRegistration,
    profileId: string,
    now: Date,
  ) {
    if (!challenge.gameConsentAcceptedAt) {
      return;
    }

    await tx.guestGameEvent.create({
      data: {
        tenantId: challenge.tenantId,
        profileId,
        guestId: challenge.guestId,
        eventType: GAME_CONSENT_EVENT_TYPE,
        source: 'GUEST_PORTAL',
        externalId: `otp:${challenge.id}:game-consent`,
        occurredAt: challenge.gameConsentAcceptedAt,
        payload: {
          consentVersion: challenge.gameConsentVersion ?? GAME_CONSENT_VERSION,
          storeId: challenge.storeId,
          phoneMasked: challenge.phoneMasked,
          acceptedAt: challenge.gameConsentAcceptedAt.toISOString(),
        },
        note: 'Гость подтвердил участие в геймификации LeetPlus при OTP-регистрации.',
        createdAt: now,
      },
    });
  }

  private async findRegistrationProfile(
    tx: Prisma.TransactionClient,
    challenge: GuestPortalOtpChallengeRegistration,
  ) {
    if (challenge.profileId) {
      const profile = await tx.guestGameProfile.findFirst({
        where: {
          id: challenge.profileId,
          tenantId: challenge.tenantId,
          status: 'ACTIVE',
        },
      });

      if (profile) {
        return profile;
      }
    }

    if (challenge.guestId) {
      const profile = await tx.guestGameProfile.findFirst({
        where: {
          tenantId: challenge.tenantId,
          guestId: challenge.guestId,
          status: 'ACTIVE',
        },
      });

      if (profile) {
        return profile;
      }
    }

    return tx.guestGameProfile.findFirst({
      where: {
        tenantId: challenge.tenantId,
        phoneHash: challenge.phoneHash,
        status: 'ACTIVE',
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getSession(authorization: string | undefined) {
    const payload = await this.verifyGuestToken(authorization);
    return this.buildPortalPayload(payload);
  }

  async checkIn(
    authorization: string | undefined,
    dto: { note?: unknown },
  ): Promise<GuestPortalCheckInResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const context = await this.getTenantStoreByIds(
      payload.tenantId,
      payload.storeId,
    );
    const guest = await this.findGuest(payload);

    if (!guest) {
      throw new BadRequestException(
        'Гость еще не сопоставлен с Langame. Сначала подтвердите профиль гостя.',
      );
    }

    const actor: AuthenticatedUser = {
      id: `guest-portal:${payload.sub}`,
      email: 'guest-portal@leetplus.local',
      fullName: 'Гостевой портал',
      role: UserRole.CLUB_MANAGER,
      isPlatformAdmin: false,
      tenantId: context.tenant.id,
      tenantSlug: context.tenant.slug,
      tenantStatus: TenantLifecycleStatus.ACTIVE,
    };
    const checkIn = await this.guestGamificationService.checkIn(actor, {
      guestId: guest.id,
      storeId: context.store.id,
      note: stringField(dto.note) ?? 'Чекин гостя из публичного кабинета.',
    });

    return {
      checkIn,
      portal: await this.buildPortalPayload({
        ...payload,
        guestId: guest.id,
        profileId: checkIn.processResult.event.profile?.id ?? payload.profileId,
      }),
    };
  }

  async updateCommunicationPreferences(
    authorization: string | undefined,
    dto: { action?: unknown },
  ): Promise<GuestPortalCommunicationPreferenceResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const action = communicationPreferenceAction(dto.action);
    const guest = await this.findGuest(payload);
    const existingProfile = await this.findProfile(payload, guest?.id ?? null);
    const crmLead = await this.findCrmLead(
      payload,
      existingProfile?.leadId ?? null,
      guest?.id ?? null,
    );

    if (!guest && !crmLead) {
      throw new BadRequestException(
        'Профиль гостя или CRM-заявка еще не найдены. Согласие можно сохранить после сопоставления с Langame или CRM-лидом.',
      );
    }

    const now = new Date();
    const consentData =
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
            };
    const guestData =
      action === 'UNSUBSCRIBE'
        ? {
            ...consentData,
            crmStatus: GuestCrmStatus.DO_NOT_CONTACT,
            crmUpdatedAt: now,
          }
        : consentData;
    const leadData =
      action === 'UNSUBSCRIBE'
        ? {
            ...consentData,
            crmStatus: GuestCrmStatus.DO_NOT_CONTACT,
          }
        : consentData;

    await this.prisma.$transaction([
      ...(guest
        ? [
            this.prisma.guest.update({
              where: { id: guest.id },
              data: guestData,
            }),
            this.prisma.guestCrmEvent.create({
              data: {
                tenantId: payload.tenantId,
                guestId: guest.id,
                status: communicationPreferenceCrmStatus(action),
                note: communicationPreferenceEventNote(action),
              },
            }),
          ]
        : []),
      ...(crmLead
        ? [
            this.prisma.guestCrmLead.update({
              where: { id: crmLead.id },
              data: leadData,
            }),
          ]
        : []),
    ]);

    return {
      portal: await this.buildPortalPayload({
        ...payload,
        guestId: guest?.id ?? payload.guestId,
      }),
      message: communicationPreferenceMessage(action),
    };
  }

  async updateMessengerChannel(
    authorization: string | undefined,
    dto: { channel?: unknown; identity?: unknown },
  ): Promise<GuestPortalMessengerUpdateResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const channel = messengerChannel(dto.channel);
    const identity = messengerIdentity(channel, dto.identity);
    const guest = await this.findGuest(payload);
    let existingProfile = await this.findProfile(payload, guest?.id ?? null);
    const crmLead = await this.findCrmLead(
      payload,
      existingProfile?.leadId ?? null,
      guest?.id ?? null,
    );
    if (!existingProfile && crmLead) {
      existingProfile = await this.findProfileByLead(
        payload.tenantId,
        crmLead.id,
      );
    }

    if (!guest && !existingProfile && !crmLead) {
      throw new BadRequestException(
        'Профиль гостя или CRM-заявка еще не найдены. Привязка Telegram/MAX станет доступна после сопоставления с Langame или CRM-лидом.',
      );
    }

    const field =
      channel === 'TELEGRAM'
        ? ({ telegramIdentity: identity } as const)
        : ({ maxIdentity: identity } as const);

    const profile = existingProfile
      ? await this.prisma.guestGameProfile.update({
          where: { id: existingProfile.id },
          data: {
            ...field,
            phoneHash: existingProfile.phoneHash ?? payload.phoneHash,
            status: 'ACTIVE',
          },
        })
      : await this.prisma.guestGameProfile.create({
          data: {
            tenantId: payload.tenantId,
            guestId: guest?.id,
            leadId: crmLead?.id,
            displayName:
              guest?.fullNameMasked ??
              guest?.externalGuestId ??
              crmLead?.fullNameMasked ??
              crmLead?.phoneMasked ??
              'Гость клуба',
            contactMasked:
              guest?.phoneMasked ??
              guest?.emailMasked ??
              crmLead?.phoneMasked ??
              crmLead?.emailMasked ??
              null,
            phoneHash: payload.phoneHash,
            ...field,
          },
        });

    if (guest) {
      await this.prisma.guestCrmEvent.create({
        data: {
          tenantId: payload.tenantId,
          guestId: guest.id,
          status: guest.crmStatus,
          note: messengerEventNote(channel),
        },
      });
    }

    return {
      portal: await this.buildPortalPayload({
        ...payload,
        guestId: guest?.id ?? payload.guestId,
        profileId: profile.id,
      }),
      message: messengerMessage(channel),
    };
  }

  async startTelegramLink(
    authorization: string | undefined,
  ): Promise<GuestPortalTelegramLinkStartResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const guest = await this.findGuest(payload);
    let existingProfile = await this.findProfile(payload, guest?.id ?? null);
    const crmLead = await this.findCrmLead(
      payload,
      existingProfile?.leadId ?? null,
      guest?.id ?? null,
    );
    if (!existingProfile && crmLead) {
      existingProfile = await this.findProfileByLead(
        payload.tenantId,
        crmLead.id,
      );
    }

    if (!guest && !existingProfile && !crmLead) {
      throw new BadRequestException(
        'Профиль гостя или CRM-заявка еще не найдены. Telegram-бот можно привязать после сопоставления с Langame или CRM-лидом.',
      );
    }

    const profile = existingProfile
      ? await this.prisma.guestGameProfile.update({
          where: { id: existingProfile.id },
          data: {
            phoneHash: existingProfile.phoneHash ?? payload.phoneHash,
            status: 'ACTIVE',
          },
        })
      : await this.prisma.guestGameProfile.create({
          data: {
            tenantId: payload.tenantId,
            guestId: guest?.id,
            leadId: crmLead?.id,
            displayName:
              guest?.fullNameMasked ??
              guest?.externalGuestId ??
              crmLead?.fullNameMasked ??
              crmLead?.phoneMasked ??
              'Гость клуба',
            contactMasked:
              guest?.phoneMasked ??
              guest?.emailMasked ??
              crmLead?.phoneMasked ??
              crmLead?.emailMasked ??
              null,
            phoneHash: payload.phoneHash,
          },
        });

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + TELEGRAM_LINK_TTL_MINUTES * 60 * 1000,
    );
    const code = this.generateTelegramLinkCode();
    const botUsername = this.telegramBotUsername();

    await this.prisma.$transaction([
      this.prisma.guestGameTelegramLinkChallenge.updateMany({
        where: {
          tenantId: payload.tenantId,
          profileId: profile.id,
          status: 'PENDING',
        },
        data: { status: 'EXPIRED' },
      }),
      this.prisma.guestGameTelegramLinkChallenge.create({
        data: {
          tenantId: payload.tenantId,
          storeId: payload.storeId,
          profileId: profile.id,
          guestId: guest?.id ?? null,
          phoneHash: payload.phoneHash,
          codeHash: this.hashTelegramLinkCode(code),
          status: 'PENDING',
          expiresAt,
        },
      }),
    ]);

    return {
      code,
      codeMasked: maskTelegramLinkCode(code),
      expiresAt: expiresAt.toISOString(),
      botUsername,
      botDeepLink: botUsername
        ? `https://t.me/${botUsername}?start=${encodeURIComponent(
            telegramStartPayload(code),
          )}`
        : null,
      status: botUsername ? 'READY' : 'BOT_NOT_CONFIGURED',
      message: botUsername
        ? 'Код создан. Откройте Telegram-бота по ссылке и подтвердите привязку.'
        : 'Код создан. Username Telegram-бота еще не настроен, поэтому код можно использовать после подключения бота.',
    };
  }

  async confirmTelegramLink(
    secret: string | undefined,
    dto: {
      code?: unknown;
      telegramChatId?: unknown;
      telegramUsername?: unknown;
    },
  ): Promise<GuestPortalTelegramLinkConfirmResponse> {
    this.assertTelegramLinkSecret(secret);
    const code = telegramLinkCode(dto.code);
    const chatId = telegramChatId(dto.telegramChatId);
    const username = telegramUsername(dto.telegramUsername);
    const now = new Date();

    const challenge =
      await this.prisma.guestGameTelegramLinkChallenge.findFirst({
        where: {
          codeHash: this.hashTelegramLinkCode(code),
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          profile: true,
          guest: {
            select: {
              id: true,
              crmStatus: true,
            },
          },
        },
      });

    if (!challenge) {
      throw new BadRequestException('Telegram link code is not active.');
    }

    if (challenge.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.guestGameTelegramLinkChallenge.update({
        where: { id: challenge.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Telegram link code has expired.');
    }

    const telegramIdentity = `chat:${chatId}`;
    const telegramChatIdMasked = maskTelegramChatId(chatId);

    await this.prisma.$transaction([
      this.prisma.guestGameProfile.update({
        where: { id: challenge.profileId },
        data: {
          telegramIdentity,
          phoneHash: challenge.profile.phoneHash ?? challenge.phoneHash,
          status: 'ACTIVE',
        },
      }),
      this.prisma.guestGameTelegramLinkChallenge.update({
        where: { id: challenge.id },
        data: {
          status: 'CONSUMED',
          consumedAt: now,
          telegramChatIdMasked,
          telegramUsername: username,
        },
      }),
      ...(challenge.guest
        ? [
            this.prisma.guestCrmEvent.create({
              data: {
                tenantId: challenge.tenantId,
                guestId: challenge.guest.id,
                status: challenge.guest.crmStatus,
                note: `${TELEGRAM_LINK_EVENT_PREFIX}confirmed`,
              },
            }),
          ]
        : []),
    ]);

    return {
      status: 'CONFIRMED',
      tenantId: challenge.tenantId,
      profileId: challenge.profileId,
      telegramIdentityMasked: maskExternalIdentity(telegramIdentity),
      message:
        'Telegram chat_id подтвержден и сохранен в гостевом игровом профиле. Внешние отправки включаются отдельно через dispatcher-настройки.',
    };
  }

  async handleTelegramWebhook(
    secret: string | undefined,
    dto: unknown,
  ): Promise<GuestPortalTelegramWebhookResponse> {
    this.assertTelegramLinkSecret(secret);
    const update = telegramWebhookUpdate(dto);
    const telegramIdentityMasked = maskExternalIdentity(
      `chat:${update.telegramChatId}`,
    );

    if (telegramWebhookUnsubscribeCommand(update.text)) {
      return this.unsubscribeTelegramWebhookProfile(
        update.telegramChatId,
        telegramIdentityMasked,
      );
    }

    const code = telegramWebhookLinkCode(update.text);

    if (!code) {
      return {
        status: 'IGNORED',
        action: 'UNKNOWN',
        profileId: null,
        telegramIdentityMasked,
        message:
          'Telegram webhook получен, но команда привязки не найдена. Ожидается /start lp_CODE или /link CODE.',
      };
    }

    try {
      const result = await this.confirmTelegramLink(secret, {
        code,
        telegramChatId: update.telegramChatId,
        telegramUsername: update.telegramUsername,
      });

      return {
        status: 'CONFIRMED',
        action: 'LINK_CODE',
        profileId: result.profileId,
        telegramIdentityMasked: result.telegramIdentityMasked,
        message:
          'Telegram webhook подтвердил код и сохранил chat_id гостя. Внешняя отправка наград остается под управлением delivery dispatcher.',
      };
    } catch (error) {
      return {
        status: 'FAILED',
        action: 'LINK_CODE',
        profileId: null,
        telegramIdentityMasked,
        message:
          error instanceof Error
            ? error.message
            : 'Telegram webhook не смог подтвердить код.',
      };
    }
  }

  private async unsubscribeTelegramWebhookProfile(
    telegramChatIdValue: string,
    telegramIdentityMasked: string | null,
  ): Promise<GuestPortalTelegramWebhookResponse> {
    const telegramIdentity = `chat:${telegramChatIdValue}`;
    const profiles = await this.prisma.guestGameProfile.findMany({
      where: {
        telegramIdentity,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        tenantId: true,
        guestId: true,
        leadId: true,
      },
    });

    if (profiles.length === 0) {
      return {
        status: 'IGNORED',
        action: 'UNSUBSCRIBE',
        profileId: null,
        profilesAffected: 0,
        deliveriesBlocked: 0,
        telegramIdentityMasked,
        message:
          'Telegram unsubscribe command received, but no active LeetPlus guest profile is linked to this chat_id.',
      };
    }

    const now = new Date();
    const profileIds = uniqueStrings(profiles.map((profile) => profile.id));
    const guestIds = uniqueStrings(profiles.map((profile) => profile.guestId));
    const leadIds = uniqueStrings(profiles.map((profile) => profile.leadId));
    const preferenceNote = `${COMMUNICATION_PREFERENCE_EVENT_PREFIX}UNSUBSCRIBE: Telegram bot stop command.`;
    const deliveryNote =
      'Guest unsubscribed from Telegram bot through webhook stop command.';

    const result = await this.prisma.$transaction(async (tx) => {
      if (guestIds.length > 0) {
        await tx.guest.updateMany({
          where: { id: { in: guestIds } },
          data: {
            phoneConsentStatus: GuestCommunicationConsentStatus.UNSUBSCRIBED,
            phoneConsentSource: 'telegram_bot',
            phoneConsentAt: null,
            unsubscribedAt: now,
            crmStatus: GuestCrmStatus.DO_NOT_CONTACT,
            crmUpdatedAt: now,
          },
        });
        await tx.guestCrmEvent.createMany({
          data: guestIds.map((guestId) => ({
            tenantId:
              profiles.find((profile) => profile.guestId === guestId)
                ?.tenantId ?? profiles[0].tenantId,
            guestId,
            status: GuestCrmStatus.DO_NOT_CONTACT,
            note: preferenceNote,
            createdAt: now,
          })),
        });
      }

      if (leadIds.length > 0) {
        await tx.guestCrmLead.updateMany({
          where: { id: { in: leadIds } },
          data: {
            phoneConsentStatus: GuestCommunicationConsentStatus.UNSUBSCRIBED,
            phoneConsentSource: 'telegram_bot',
            phoneConsentAt: null,
            unsubscribedAt: now,
            crmStatus: GuestCrmStatus.DO_NOT_CONTACT,
          },
        });
      }

      const pendingDeliveries = await tx.guestGameDelivery.findMany({
        where: {
          profileId: { in: profileIds },
          channel: 'TELEGRAM',
          status: 'READY',
          readinessStatus: 'READY_FOR_BOT',
        },
        select: {
          id: true,
          tenantId: true,
          rewardId: true,
          status: true,
        },
      });

      if (pendingDeliveries.length > 0) {
        await tx.guestGameDelivery.updateMany({
          where: {
            id: { in: pendingDeliveries.map((delivery) => delivery.id) },
          },
          data: {
            status: 'BLOCKED',
            readinessStatus: 'UNSUBSCRIBED',
            blockers: [
              'Guest unsubscribed from Telegram bot.',
            ] satisfies Prisma.InputJsonValue,
            note: deliveryNote,
          },
        });
        await tx.guestGameDeliveryEvent.createMany({
          data: pendingDeliveries.map((delivery) => ({
            tenantId: delivery.tenantId,
            deliveryId: delivery.id,
            rewardId: delivery.rewardId,
            eventType: 'DELIVERY_UNSUBSCRIBED',
            fromStatus: delivery.status,
            toStatus: 'BLOCKED',
            channel: 'TELEGRAM',
            note: deliveryNote,
            payload: {
              source: 'telegram_webhook',
              readinessStatus: 'UNSUBSCRIBED',
            } satisfies Prisma.InputJsonValue,
            createdAt: now,
          })),
        });
      }

      return { deliveriesBlocked: pendingDeliveries.length };
    });

    return {
      status: 'UNSUBSCRIBED',
      action: 'UNSUBSCRIBE',
      profileId: profiles.length === 1 ? profiles[0].id : null,
      profilesAffected: profiles.length,
      deliveriesBlocked: result.deliveriesBlocked,
      telegramIdentityMasked,
      message:
        'Telegram unsubscribe command processed. Guest communication consent is now UNSUBSCRIBED and pending Telegram deliveries are blocked.',
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
    const linkResult = localGuestId
      ? await this.linkGameProfileToLocalGuest(
          payload,
          localProfile?.id ?? payload.profileId,
          localGuestId,
          phone.masked,
        )
      : ({
          status: foundInLangame ? 'WAITING_FOR_SYNC' : 'NOT_LINKED',
          guestId: null,
          profileId: localProfile?.id ?? payload.profileId,
          linkedNow: false,
        } satisfies GuestPortalGameProfileLinkResult);
    const refreshedPayload =
      linkResult.linkedNow || linkResult.status === 'ALREADY_LINKED'
        ? await this.buildPortalPayload({
            ...payload,
            guestId: linkResult.guestId,
            profileId: linkResult.profileId ?? payload.profileId,
          })
        : null;

    return {
      checkedAt: diagnostics.checkedAt,
      queryField: 'phone',
      phoneMasked: phone.masked,
      status,
      localGuestFound,
      localGuestId,
      profileId: linkResult.profileId ?? localProfile?.id ?? payload.profileId,
      linkStatus: linkResult.status,
      linkedGuestId: linkResult.guestId,
      linkedProfileId: linkResult.profileId,
      nextAction: guestPortalLangameMatchNextAction(status, linkResult.status),
      portal: refreshedPayload,
      sources,
    };
  }

  private async linkGameProfileToLocalGuest(
    payload: GuestPortalTokenPayload,
    profileId: string | null,
    guestId: string,
    phoneMasked: string | null,
  ): Promise<GuestPortalGameProfileLinkResult> {
    if (!profileId) {
      return {
        status: 'NOT_LINKED',
        guestId,
        profileId: null,
        linkedNow: false,
      };
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const [profile, guest, existingLinkedProfile] = await Promise.all([
        tx.guestGameProfile.findFirst({
          where: {
            id: profileId,
            tenantId: payload.tenantId,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            guestId: true,
            phoneHash: true,
            contactMasked: true,
            displayName: true,
          },
        }),
        tx.guest.findFirst({
          where: {
            id: guestId,
            tenantId: payload.tenantId,
            isDisabled: false,
            phoneHash: payload.phoneHash,
          },
          select: {
            id: true,
            externalProvider: true,
            externalDomain: true,
            externalGuestId: true,
            phoneMasked: true,
            emailMasked: true,
            fullNameMasked: true,
          },
        }),
        tx.guestGameProfile.findFirst({
          where: {
            tenantId: payload.tenantId,
            guestId,
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
      ]);

      if (!profile || !guest) {
        return {
          status: 'NOT_LINKED',
          guestId,
          profileId: profile?.id ?? profileId,
          linkedNow: false,
        };
      }

      if (profile.guestId === guest.id) {
        return {
          status: 'ALREADY_LINKED',
          guestId: guest.id,
          profileId: profile.id,
          linkedNow: false,
        };
      }

      if (
        (profile.guestId && profile.guestId !== guest.id) ||
        (existingLinkedProfile && existingLinkedProfile.id !== profile.id)
      ) {
        return {
          status: 'CONFLICT',
          guestId: guest.id,
          profileId: profile.id,
          linkedNow: false,
        };
      }

      await tx.guestGameProfile.update({
        where: { id: profile.id },
        data: {
          guestId: guest.id,
          phoneHash: profile.phoneHash ?? payload.phoneHash,
          contactMasked:
            profile.contactMasked ??
            guest.phoneMasked ??
            guest.emailMasked ??
            phoneMasked,
          displayName:
            profile.displayName ??
            guest.fullNameMasked ??
            guest.externalGuestId ??
            'Гость клуба',
          lastActivityAt: now,
        },
      });
      await this.backfillGameProfileGuestLinks(
        tx,
        payload.tenantId,
        profile.id,
        guest.id,
      );
      await this.createGameProfileLinkedEvent(tx, {
        tenantId: payload.tenantId,
        profileId: profile.id,
        guestId: guest.id,
        externalProvider: guest.externalProvider,
        externalDomain: guest.externalDomain,
        externalGuestId: guest.externalGuestId,
        phoneMasked: phoneMasked ?? guest.phoneMasked,
        source: 'guest_portal_langame_match',
        occurredAt: now,
      });

      return {
        status: 'LINKED',
        guestId: guest.id,
        profileId: profile.id,
        linkedNow: true,
      };
    });
  }

  private async backfillGameProfileGuestLinks(
    tx: Prisma.TransactionClient,
    tenantId: string,
    profileId: string,
    guestId: string,
  ) {
    await Promise.all([
      tx.guestGameReward.updateMany({
        where: { tenantId, profileId, guestId: null },
        data: { guestId },
      }),
      tx.guestGameEvent.updateMany({
        where: { tenantId, profileId, guestId: null },
        data: { guestId },
      }),
      tx.guestGameDelivery.updateMany({
        where: { tenantId, profileId, guestId: null },
        data: { guestId },
      }),
      tx.guestBonusLedgerEntry.updateMany({
        where: { tenantId, profileId, guestId: null },
        data: { guestId },
      }),
    ]);
  }

  private async createGameProfileLinkedEvent(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      profileId: string;
      guestId: string;
      externalProvider: IntegrationProvider | null;
      externalDomain: string | null;
      externalGuestId: string;
      phoneMasked: string | null;
      source: string;
      occurredAt: Date;
    },
  ) {
    await tx.guestGameEvent.createMany({
      data: [
        {
          tenantId: input.tenantId,
          profileId: input.profileId,
          guestId: input.guestId,
          eventType: GAME_PROFILE_LINKED_EVENT_TYPE,
          source: GAME_PROFILE_LINK_SOURCE,
          externalProvider: input.externalProvider,
          externalDomain: input.externalDomain,
          externalId: `game-profile-link:${input.profileId}:${input.guestId}`,
          occurredAt: input.occurredAt,
          payload: {
            source: input.source,
            phoneMasked: input.phoneMasked,
            externalGuestId: input.externalGuestId,
          },
          note: 'Игровой профиль участника геймификации безопасно связан с синхронизированным гостем Langame.',
          createdAt: input.occurredAt,
        },
      ],
      skipDuplicates: true,
    });
  }

  async getLangameGuestDetails(
    authorization: string | undefined,
  ): Promise<GuestPortalLangameDetailsResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const guest = await this.findGuest(payload);
    const checkedAt = new Date().toISOString();
    const localSnapshot = {
      sourceDomain: guest?.externalDomain ?? null,
      externalGuestId: guest?.externalGuestId ?? null,
      lastSyncedAt: iso(guest?.lastSyncedAt ?? null),
    };

    if (!guest?.externalDomain || !guest.externalGuestId) {
      return {
        checkedAt,
        status: 'NOT_LINKED',
        nextAction:
          'Сначала сопоставьте гостя с Langame через проверку профиля или дождитесь синхронизации клуба.',
        localSnapshot,
        langame: null,
      };
    }

    const langame = await this.langameSettingsService.getGuestDetailsForPortal(
      payload.tenantId,
      guest.externalDomain,
      guest.externalGuestId,
    );
    const status = langame.source.status;

    return {
      checkedAt: langame.checkedAt,
      status,
      nextAction:
        status === 'SUCCESS'
          ? 'Карточка Langame проверена вручную. Данные показаны в безопасном виде и не сохранены как raw payload.'
          : 'Langame сейчас не вернул карточку гостя. Используйте сохраненный snapshot и повторите проверку позже.',
      localSnapshot,
      langame,
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
    let profile = await this.findProfile(tokenPayload, guest?.id ?? null);
    const crmLead = await this.findCrmLead(
      tokenPayload,
      profile?.leadId ?? null,
      guest?.id ?? null,
    );
    if (!profile && crmLead) {
      profile = await this.findProfileByLead(context.tenant.id, crmLead.id);
    }
    const [
      groups,
      balanceSnapshot,
      bonusBalanceSnapshot,
      lootBoxes,
      missions,
      seasons,
      rewards,
      communicationEvents,
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
      guest
        ? this.prisma.guestCrmEvent.findMany({
            where: {
              tenantId: context.tenant.id,
              guestId: guest.id,
              note: {
                startsWith: COMMUNICATION_PREFERENCE_EVENT_PREFIX,
              },
            },
            select: {
              id: true,
              note: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
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
      guestFound: Boolean(guest || profile || crmLead),
      crmLead: buildCrmLead(crmLead),
      profile: {
        id: profile?.id ?? null,
        displayName:
          profile?.displayName ??
          guest?.fullNameMasked ??
          guest?.externalGuestId ??
          crmLead?.fullNameMasked ??
          crmLead?.phoneMasked ??
          'Гость клуба',
        contactMasked:
          profile?.contactMasked ??
          guest?.phoneMasked ??
          guest?.emailMasked ??
          crmLead?.phoneMasked ??
          crmLead?.emailMasked ??
          null,
        xp,
        level,
        nextLevelXp,
        levelProgressPercent,
        frame: frameForLevel(level),
      },
      loyalty,
      guestSnapshot: buildGuestSnapshot(guest, crmLead, profile),
      gamification: {
        nextActions,
        lootBoxes: portalLootBoxes,
        missions: portalMissions,
        seasons: portalSeasons,
        rewardSummary: buildRewardSummary(portalRewards),
        rewards: portalRewards,
      },
      activity,
      communications: buildCommunications(
        guest,
        profile,
        communicationEvents,
        crmLead,
      ),
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

  private async findProfileByLead(tenantId: string, leadId: string) {
    return this.prisma.guestGameProfile.findFirst({
      where: {
        tenantId,
        leadId,
        status: 'ACTIVE',
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async findCrmLead(
    payload: GuestPortalTokenPayload,
    leadId: string | null,
    guestId: string | null,
  ) {
    return this.prisma.guestCrmLead.findFirst({
      where: {
        tenantId: payload.tenantId,
        OR: [
          ...(leadId ? [{ id: leadId }] : []),
          ...(guestId ? [{ matchedGuestId: guestId }] : []),
          { phoneHash: payload.phoneHash },
        ],
      },
      orderBy: [{ matchedAt: 'desc' }, { updatedAt: 'desc' }],
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

  private phoneIdentity(value: unknown): GuestPortalPhoneIdentity {
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

  private generateTelegramLinkCode() {
    const raw = randomBytes(5).toString('hex').toUpperCase();
    return `LP-${raw.slice(0, 4)}-${raw.slice(4)}`;
  }

  private hashOtpCode(challengeId: string, code: string) {
    return createHash('sha256')
      .update(`${this.piiSecret()}:${challengeId}:${code}`)
      .digest('hex');
  }

  private hashTelegramLinkCode(code: string) {
    return createHmac('sha256', this.piiSecret())
      .update(`telegram-link:${normalizeTelegramLinkCode(code)}`)
      .digest('hex');
  }

  private telegramBotUsername() {
    return normalizeTelegramBotUsername(
      this.configService.get<string>('GUEST_GAME_TELEGRAM_BOT_USERNAME') ??
        this.configService.get<string>('TELEGRAM_BOT_USERNAME') ??
        null,
    );
  }

  private assertTelegramLinkSecret(secret: string | undefined) {
    const expected = [
      this.configService.get<string>('GUEST_GAME_TELEGRAM_LINK_SECRET'),
      this.configService.get<string>('GUEST_GAME_TELEGRAM_WEBHOOK_SECRET'),
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    if (expected.length === 0) {
      throw new UnauthorizedException(
        'GUEST_GAME_TELEGRAM_LINK_SECRET or GUEST_GAME_TELEGRAM_WEBHOOK_SECRET is not configured',
      );
    }

    if (!secret || !expected.includes(secret.trim())) {
      throw new UnauthorizedException('Invalid Telegram link secret');
    }
  }

  private isDevOtpEnabled() {
    return (
      this.configService.get<string>('GUEST_PORTAL_DEV_OTP_ENABLED') ===
        'true' || this.configService.get<string>('NODE_ENV') !== 'production'
    );
  }

  private async deliverOtpCode(input: {
    code: string;
    context: TenantStoreContext;
    phone: GuestPortalPhoneIdentity;
    profile: {
      id: string;
      telegramIdentity: string | null;
      maxIdentity: string | null;
    } | null;
    guest: {
      id: string;
      phoneConsentStatus: GuestCommunicationConsentStatus;
      unsubscribedAt: Date | null;
    } | null;
  }): Promise<GuestPortalOtpDeliveryResult> {
    if (this.isDevOtpEnabled()) {
      return {
        channel: 'DEV',
        status: 'DEV_CODE',
        deliveredAt: new Date(),
        devCode: input.code,
        message:
          'Demo-код показан на странице, потому что включен dev/demo OTP-режим.',
      };
    }

    const config = guestPortalOtpDeliveryConfig(this.configService);

    if (!config.realSendEnabled) {
      return {
        channel: 'DEV',
        status: 'NOT_CONFIGURED',
        deliveredAt: null,
        message:
          'OTP-доставка в production не включена. Нужен SMS/Telegram/MAX provider.',
        requiredEnv: ['GUEST_PORTAL_OTP_REAL_SEND_ENABLED'],
      };
    }

    if (config.sms.enabled) {
      if (config.sms.endpoint && config.sms.token) {
        try {
          const payload = await sendHttpOtpDelivery({
            endpoint: config.sms.endpoint,
            token: config.sms.token,
            body: {
              channel: 'SMS',
              phone: input.phone.normalized,
              phoneMasked: input.phone.masked,
              text: otpMessage(input.code, input.context),
              purpose: 'guest_portal_otp',
            },
          });

          return {
            channel: 'SMS',
            status: 'SENT',
            deliveredAt: new Date(),
            message: `Код отправлен по SMS на ${input.phone.masked}.`,
            note: deliveryProviderNote(payload),
          };
        } catch (error) {
          return failedOtpDelivery('SMS', error);
        }
      }

      return {
        channel: 'SMS',
        status: 'NOT_CONFIGURED',
        deliveredAt: null,
        message: 'SMS OTP включен, но endpoint или token не настроены.',
        requiredEnv: [
          'GUEST_PORTAL_OTP_SMS_ENDPOINT',
          'GUEST_PORTAL_OTP_SMS_TOKEN',
        ],
      };
    }

    const telegramChatId = telegramChatIdFromIdentity(
      input.profile?.telegramIdentity ?? null,
    );

    if (config.telegram.enabled) {
      if (input.guest?.unsubscribedAt) {
        return {
          channel: 'TELEGRAM',
          status: 'BLOCKED',
          deliveredAt: null,
          message:
            'Гость отписан от коммуникаций; OTP через Telegram заблокирован.',
          note: 'Для входа нужен SMS-provider или ручная проверка в клубе.',
        };
      }

      if (config.telegram.token && telegramChatId) {
        try {
          const payload = await sendTelegramOtpDelivery({
            token: config.telegram.token,
            chatId: telegramChatId,
            text: otpMessage(input.code, input.context),
          });

          return {
            channel: 'TELEGRAM',
            status: 'SENT',
            deliveredAt: new Date(),
            message: 'Код отправлен в подтвержденный Telegram-чат гостя.',
            identityMasked: maskExternalIdentity(
              input.profile?.telegramIdentity ?? null,
            ),
            note: deliveryProviderNote(payload),
          };
        } catch (error) {
          return failedOtpDelivery('TELEGRAM', error);
        }
      }

      return {
        channel: 'TELEGRAM',
        status: 'BLOCKED',
        deliveredAt: null,
        message:
          'Telegram OTP включен, но у гостя нет подтвержденного numeric chat_id.',
        note: 'Гость должен один раз привязать Telegram-бота через гостевой кабинет.',
        requiredEnv: ['GUEST_GAME_TELEGRAM_BOT_TOKEN'],
      };
    }

    if (config.max.enabled) {
      if (input.guest?.unsubscribedAt) {
        return {
          channel: 'MAX',
          status: 'BLOCKED',
          deliveredAt: null,
          message: 'Гость отписан от коммуникаций; OTP через MAX заблокирован.',
          note: 'Для входа нужен SMS-provider или ручная проверка в клубе.',
        };
      }

      if (
        config.max.endpoint &&
        config.max.token &&
        input.profile?.maxIdentity
      ) {
        try {
          const payload = await sendHttpOtpDelivery({
            endpoint: config.max.endpoint,
            token: config.max.token,
            body: {
              channel: 'MAX',
              identity: input.profile.maxIdentity,
              identityMasked: maskExternalIdentity(input.profile.maxIdentity),
              text: otpMessage(input.code, input.context),
              purpose: 'guest_portal_otp',
            },
          });

          return {
            channel: 'MAX',
            status: 'SENT',
            deliveredAt: new Date(),
            message: 'Код отправлен в подтвержденный MAX-канал гостя.',
            identityMasked: maskExternalIdentity(input.profile.maxIdentity),
            note: deliveryProviderNote(payload),
          };
        } catch (error) {
          return failedOtpDelivery('MAX', error);
        }
      }

      return {
        channel: 'MAX',
        status: 'NOT_CONFIGURED',
        deliveredAt: null,
        message:
          'MAX OTP включен, но нет подтвержденного identity или provider-настроек.',
        requiredEnv: [
          'GUEST_PORTAL_OTP_MAX_ENDPOINT',
          'GUEST_PORTAL_OTP_MAX_TOKEN',
        ],
      };
    }

    return {
      channel: 'DEV',
      status: 'NOT_CONFIGURED',
      deliveredAt: null,
      message:
        'OTP-доставка не настроена: включите SMS, Telegram или MAX provider.',
      requiredEnv: [
        'GUEST_PORTAL_OTP_SMS_ENABLED',
        'GUEST_PORTAL_OTP_TELEGRAM_ENABLED',
        'GUEST_PORTAL_OTP_MAX_ENABLED',
      ],
    };
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

function otpChallengeStatus(status: GuestPortalOtpDeliveryStatus) {
  if (status === 'DEV_CODE' || status === 'SENT') {
    return 'PENDING';
  }

  return `DELIVERY_${status}`;
}

function guestPortalOtpDeliveryConfig(configService: ConfigService) {
  return {
    realSendEnabled: configFlag(
      configService,
      'GUEST_PORTAL_OTP_REAL_SEND_ENABLED',
    ),
    sms: {
      enabled: configFlag(configService, 'GUEST_PORTAL_OTP_SMS_ENABLED'),
      endpoint: configString(configService, 'GUEST_PORTAL_OTP_SMS_ENDPOINT'),
      token: configString(configService, 'GUEST_PORTAL_OTP_SMS_TOKEN'),
    },
    telegram: {
      enabled: configFlag(configService, 'GUEST_PORTAL_OTP_TELEGRAM_ENABLED'),
      token: configString(
        configService,
        'GUEST_PORTAL_TELEGRAM_BOT_TOKEN',
        'GUEST_GAME_TELEGRAM_BOT_TOKEN',
        'TELEGRAM_BOT_TOKEN',
      ),
    },
    max: {
      enabled: configFlag(configService, 'GUEST_PORTAL_OTP_MAX_ENABLED'),
      endpoint: configString(configService, 'GUEST_PORTAL_OTP_MAX_ENDPOINT'),
      token: configString(configService, 'GUEST_PORTAL_OTP_MAX_TOKEN'),
    },
  };
}

function configFlag(configService: ConfigService, key: string) {
  return configService.get<string>(key)?.trim().toLowerCase() === 'true';
}

function configString(configService: ConfigService, ...keys: string[]) {
  for (const key of keys) {
    const value = configService.get<string>(key)?.trim();

    if (value) {
      return value;
    }
  }

  return '';
}

function otpMessage(code: string, context: TenantStoreContext) {
  return [
    `Код LeetPlus: ${code}`,
    `Клуб: ${context.store.name}`,
    `Действует ${OTP_TTL_MINUTES} минут. Если вы не запрашивали вход, просто проигнорируйте сообщение.`,
  ].join('\n');
}

function failedOtpDelivery(
  channel: GuestPortalOtpDeliveryChannel,
  error: unknown,
): GuestPortalOtpDeliveryResult {
  return {
    channel,
    status: 'FAILED',
    deliveredAt: null,
    message: `${channel} provider не смог отправить OTP-код.`,
    note: safeDeliveryErrorMessage(error),
  };
}

async function sendHttpOtpDelivery({
  endpoint,
  token,
  body,
}: {
  endpoint: string;
  token: string;
  body: Record<string, unknown>;
}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(
      `OTP provider failed: ${response.status} ${providerErrorText(payload)}`,
    );
  }

  return payload;
}

async function sendTelegramOtpDelivery({
  token,
  chatId,
  text,
}: {
  token: string;
  chatId: string;
  text: string;
}) {
  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    },
  );
  const payload = await safeJson(response);
  const ok =
    payload && typeof payload === 'object' && 'ok' in payload
      ? Boolean((payload as { ok?: unknown }).ok)
      : response.ok;

  if (!response.ok || !ok) {
    throw new Error(
      `Telegram OTP failed: ${providerErrorText(payload) || response.status}`,
    );
  }

  return payload;
}

async function safeJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function providerErrorText(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const record = payload as Record<string, unknown>;
  const text =
    typeof record.description === 'string'
      ? record.description
      : typeof record.error === 'string'
        ? record.error
        : typeof record.message === 'string'
          ? record.message
          : '';

  return text.slice(0, 160);
}

function deliveryProviderNote(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return 'Provider принял запрос без подробного ответа.';
  }

  const record = payload as Record<string, unknown>;
  const result =
    record.result && typeof record.result === 'object'
      ? (record.result as Record<string, unknown>)
      : null;
  const id =
    stringFromUnknown(record.id) ??
    stringFromUnknown(record.message_id) ??
    stringFromUnknown(record.messageId) ??
    stringFromUnknown(result?.message_id) ??
    stringFromUnknown(result?.messageId);

  return id
    ? `Provider принял запрос, message id: ${maskIdentifier(id)}.`
    : 'Provider принял запрос.';
}

function safeDeliveryErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'OTP delivery provider error';

  return message.slice(0, 300);
}

function telegramChatIdFromIdentity(value: string | null) {
  const identity = value?.trim() ?? '';

  if (!identity.toLowerCase().startsWith('chat:')) {
    return null;
  }

  const normalized = identity.slice('chat:'.length).trim();

  return /^-?\d{5,32}$/.test(normalized) ? normalized : null;
}

function stringFromUnknown(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function externalGuestKey(domain: string | null, externalGuestId: string) {
  return `${domain ?? ''}:${externalGuestId}`;
}

function telegramWebhookUpdate(value: unknown) {
  const update = objectRecord(value);
  if (!update) {
    throw new BadRequestException('Telegram webhook payload is invalid.');
  }

  const callbackQuery = objectRecord(update.callback_query);
  const message =
    objectRecord(update.message) ??
    objectRecord(update.edited_message) ??
    objectRecord(update.channel_post) ??
    objectRecord(callbackQuery?.message);
  if (!message) {
    throw new BadRequestException('Telegram webhook message is missing.');
  }

  const chat = objectRecord(message.chat);
  const from = objectRecord(message.from) ?? objectRecord(callbackQuery?.from);
  const chatId = chat?.id ?? from?.id;
  const text =
    stringField(message.text) ??
    stringField(message.caption) ??
    stringField(callbackQuery?.data);
  const username =
    typeof from?.username === 'string'
      ? from.username
      : typeof chat?.username === 'string'
        ? chat.username
        : null;

  return {
    text,
    telegramChatId: telegramChatId(chatId),
    telegramUsername: username,
  };
}

function telegramWebhookLinkCode(text: string | null) {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const [command, ...payloadParts] = trimmed.split(/\s+/);
  const commandIsLink =
    /^\/start(@[A-Za-z0-9_]{3,64})?$/i.test(command) ||
    /^\/link(@[A-Za-z0-9_]{3,64})?$/i.test(command);
  const candidate = commandIsLink ? payloadParts.join(' ') : trimmed;

  try {
    return telegramLinkCode(candidate);
  } catch {
    return null;
  }
}

function telegramWebhookUnsubscribeCommand(text: string | null) {
  if (!text) {
    return false;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const [command] = trimmed.split(/\s+/);
  return (
    /^\/(stop|unsubscribe|cancel|отписаться|стоп)(@[A-Za-z0-9_]{3,64})?$/i.test(
      command,
    ) || /^(stop|unsubscribe|cancel|отписаться|стоп|отписка)$/i.test(trimmed)
  );
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function booleanEnv(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');
}

function geoPoint(lat: string | undefined, lng: string | undefined) {
  const latitude = coordinateNumber(lat, -90, 90);
  const longitude = coordinateNumber(lng, -180, 180);

  return latitude === null || longitude === null
    ? null
    : { latitude, longitude };
}

function coordinateNumber(value: string | undefined, min: number, max: number) {
  if (!value) {
    return null;
  }

  const numeric = Number(value.replace(',', '.'));
  return Number.isFinite(numeric) && numeric >= min && numeric <= max
    ? numeric
    : null;
}

function haversineDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthRadiusKm = 6371;
  const deltaLatitude = degreesToRadians(to.latitude - from.latitude);
  const deltaLongitude = degreesToRadians(to.longitude - from.longitude);
  const fromLatitude = degreesToRadians(from.latitude);
  const toLatitude = degreesToRadians(to.latitude);
  const angle =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(deltaLongitude / 2) ** 2;
  const distance =
    2 * earthRadiusKm * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle));

  return Math.round(distance * 10) / 10;
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function compareDirectoryClubs(
  left: GuestPortalGamificationClubDirectory['clubs'][number],
  right: GuestPortalGamificationClubDirectory['clubs'][number],
) {
  if (left.location.distanceKm !== null || right.location.distanceKm !== null) {
    if (left.location.distanceKm === null) {
      return 1;
    }

    if (right.location.distanceKm === null) {
      return -1;
    }

    return left.location.distanceKm - right.location.distanceKm;
  }

  return (
    (left.store.city ?? '').localeCompare(right.store.city ?? '', 'ru') ||
    left.store.name.localeCompare(right.store.name, 'ru')
  );
}

function normalizeTelegramLinkCode(value: string) {
  return value
    .trim()
    .replace(/^\/start\s+/i, '')
    .replace(/^lp[_-]?/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
}

function telegramLinkCode(value: unknown) {
  if (typeof value !== 'string') {
    throw new BadRequestException('Telegram link code is required.');
  }

  const normalized = normalizeTelegramLinkCode(value);
  if (!/^[A-F0-9]{10}$/.test(normalized)) {
    throw new BadRequestException('Telegram link code is invalid.');
  }

  return `LP-${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

function telegramStartPayload(code: string) {
  return `lp_${normalizeTelegramLinkCode(code)}`;
}

function maskTelegramLinkCode(code: string) {
  const normalized = normalizeTelegramLinkCode(code);
  return `LP-${normalized.slice(0, 2)}**-**${normalized.slice(-2)}`;
}

function telegramChatId(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BadRequestException('Telegram chat_id is required.');
  }

  const normalized = String(value).trim();
  if (!/^-?\d{5,32}$/.test(normalized)) {
    throw new BadRequestException(
      'Telegram chat_id must be a numeric Telegram chat identifier.',
    );
  }

  return normalized;
}

function maskTelegramChatId(value: string) {
  const sign = value.startsWith('-') ? '-' : '';
  const raw = sign ? value.slice(1) : value;

  if (raw.length <= 4) {
    return `${sign}****`;
  }

  return `${sign}${raw.slice(0, 2)}***${raw.slice(-2)}`;
}

function telegramUsername(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('Telegram username must be a string.');
  }

  const normalized = value.trim().replace(/^@/, '');
  if (!normalized) {
    return null;
  }

  if (!/^[A-Za-z0-9_]{3,64}$/.test(normalized)) {
    throw new BadRequestException('Telegram username is invalid.');
  }

  return `@${normalized}`;
}

function normalizeTelegramBotUsername(value: string | null) {
  const normalized = value?.trim().replace(/^@/, '') ?? '';

  if (!normalized || !/^[A-Za-z0-9_]{3,64}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function guestPortalLangameMatchNextAction(
  status: GuestPortalLangameMatchResponse['status'],
  linkStatus: GuestPortalGameProfileLinkStatus,
) {
  if (linkStatus === 'LINKED') {
    return 'Профиль Langame найден в сохраненных данных и сразу связан с игровым профилем. Бонусы, миссии и история будут считаться по общей связке.';
  }

  if (linkStatus === 'ALREADY_LINKED') {
    return 'Игровой профиль уже связан с синхронизированным гостем Langame. Данные лояльности и геймификации обновляются обычной синхронизацией.';
  }

  if (linkStatus === 'CONFLICT') {
    return 'Langame-гость найден, но уже есть другая активная игровая связка. Попросите администратора проверить профиль перед объединением.';
  }

  if (status === 'MATCHED_LOCAL') {
    return 'Профиль найден в LeetPlus. Если связь не появилась автоматически, дождитесь следующей синхронизации Langame или обратитесь к администратору клуба.';
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

function buildCrmLead(
  lead: {
    fullNameMasked: string | null;
    phoneMasked: string | null;
    emailMasked: string | null;
    source: string | null;
    eventName: string | null;
    crmStatus: GuestCrmStatus;
    nextContactAt: Date | null;
    matchedGuestId: string | null;
    matchedAt: Date | null;
  } | null,
): GuestPortalCrmLead {
  if (!lead) {
    return {
      found: false,
      displayName: null,
      contactMasked: null,
      source: null,
      eventName: null,
      crmStatus: null,
      nextContactAt: null,
      matchedGuestFound: false,
      matchedAt: null,
    };
  }

  return {
    found: true,
    displayName: lead.fullNameMasked ?? lead.phoneMasked ?? 'CRM-гость',
    contactMasked: lead.phoneMasked ?? lead.emailMasked ?? null,
    source: lead.source,
    eventName: lead.eventName,
    crmStatus: lead.crmStatus,
    nextContactAt: iso(lead.nextContactAt),
    matchedGuestFound: Boolean(lead.matchedGuestId),
    matchedAt: iso(lead.matchedAt),
  };
}

function buildGuestSnapshot(
  guest: {
    externalProvider: IntegrationProvider | null;
    externalDomain: string | null;
    externalGuestTypeId: string | null;
    phoneHash: string | null;
    phoneMasked: string | null;
    emailHash: string | null;
    emailMasked: string | null;
    fullNameHash: string | null;
    fullNameMasked: string | null;
    birthYear: number | null;
    birthMonth: number | null;
    birthDay: number | null;
    gender: string | null;
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
    currentCountHours: Prisma.Decimal | null;
    lastSyncedAt: Date | null;
  } | null,
  lead: {
    phoneMasked: string | null;
    emailMasked: string | null;
    fullNameMasked: string | null;
    matchedGuestId: string | null;
    matchedAt: Date | null;
  } | null,
  profile: {
    id: string;
    phoneHash: string | null;
    contactMasked: string | null;
    telegramIdentity: string | null;
    maxIdentity: string | null;
  } | null,
): GuestPortalGuestSnapshot {
  if (!guest) {
    const participation = buildGuestParticipation(null, lead, profile, 0);

    return {
      source: {
        provider: lead ? 'LeetPlus CRM' : 'LeetPlus',
        domain: null,
        lastSyncedAt: null,
      },
      identity: {
        phoneMasked: lead?.phoneMasked ?? profile?.contactMasked ?? null,
        emailMasked: lead?.emailMasked ?? null,
        fullNameMasked: lead?.fullNameMasked ?? null,
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
        missing: [
          lead || profile
            ? 'Синхронизированный профиль Langame'
            : 'Подтвержденный профиль гостя',
        ],
      },
      participation,
      statusLabels: lead
        ? ['Найдена CRM-заявка', 'Langame-профиль нужно сопоставить']
        : profile
          ? ['Есть игровой профиль LeetPlus', 'Langame-профиль нужно найти']
          : ['Профиль появится после синхронизации клуба'],
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
    participation: buildGuestParticipation(
      guest,
      lead,
      profile,
      percent(completed.length, completenessItems.length),
    ),
    statusLabels: buildGuestStatusLabels(guest),
  };
}

function buildGuestParticipation(
  guest: {
    externalGuestTypeId: string | null;
    phoneHash: string | null;
    phoneMasked: string | null;
    gender: string | null;
    isVirtual: boolean;
    isTemporary: boolean;
    isDisabled: boolean;
    isSimpleRegistration: boolean;
    isConfirmed: boolean;
    isMobileRegistration: boolean;
    identityDocumentPresent: boolean;
    bonusProgramNumber: string | null;
    currentCountHours: Prisma.Decimal | null;
  } | null,
  lead: {
    phoneMasked: string | null;
    emailMasked: string | null;
    fullNameMasked: string | null;
    matchedGuestId: string | null;
    matchedAt: Date | null;
  } | null,
  profile: {
    id: string;
    phoneHash: string | null;
    contactMasked: string | null;
    telegramIdentity: string | null;
    maxIdentity: string | null;
  } | null,
  completenessPercent: number,
): GuestPortalGuestSnapshot['participation'] {
  const accountState = guest?.isDisabled
    ? 'DISABLED'
    : guest?.isTemporary
      ? 'TEMPORARY'
      : guest?.isVirtual
        ? 'VIRTUAL'
        : guest
          ? 'LANGAME_SYNCED'
          : lead
            ? 'CRM_LEAD'
            : profile
              ? 'GAME_PROFILE'
              : 'NOT_MATCHED';
  const readiness = buildGuestReadiness(guest, lead, profile);

  return {
    accountState,
    accountStateLabel: guestAccountStateLabel(accountState),
    guestTypeId: guest?.externalGuestTypeId ?? null,
    genderLabel: guestGenderLabel(guest?.gender ?? null),
    registrationChannel: guestRegistrationChannel(guest, lead, profile),
    verificationLabel: guestVerificationLabel(guest, lead, profile),
    loyaltyCardStatus: guest
      ? guest.bonusProgramNumber
        ? 'LINKED'
        : 'MISSING'
      : 'UNKNOWN',
    readinessPercent: Math.max(
      completenessPercent,
      percent(
        readiness.filter((item) => item.status === 'READY').length,
        readiness.length,
      ),
    ),
    readiness,
  };
}

function buildGuestReadiness(
  guest: {
    externalGuestTypeId: string | null;
    phoneHash: string | null;
    phoneMasked: string | null;
    isConfirmed: boolean;
    identityDocumentPresent: boolean;
    bonusProgramNumber: string | null;
    currentCountHours: Prisma.Decimal | null;
  } | null,
  lead: { phoneMasked: string | null; matchedGuestId: string | null } | null,
  profile: {
    id: string;
    phoneHash: string | null;
    contactMasked: string | null;
    telegramIdentity: string | null;
    maxIdentity: string | null;
  } | null,
): GuestPortalProfileReadinessItem[] {
  const hasPhone = Boolean(
    guest?.phoneHash ||
    guest?.phoneMasked ||
    lead?.phoneMasked ||
    profile?.phoneHash ||
    profile?.contactMasked,
  );
  const hasMessenger = Boolean(
    profile?.telegramIdentity || profile?.maxIdentity,
  );
  const hasLoyalty = Boolean(
    guest?.externalGuestTypeId ||
    guest?.bonusProgramNumber ||
    guest?.currentCountHours,
  );

  return [
    {
      id: 'phone',
      label: 'Телефон',
      status: hasPhone ? 'READY' : 'MISSING',
      note: hasPhone
        ? 'Контакт подтвержден OTP и подходит для гостевого кабинета.'
        : 'Нужен подтвержденный телефон для личного кабинета.',
    },
    {
      id: 'langame',
      label: 'Профиль Langame',
      status: guest ? 'READY' : lead || profile ? 'ATTENTION' : 'MISSING',
      note: guest
        ? 'Профиль найден в сохраненном snapshot Langame.'
        : 'Профиль нужно сопоставить через синхронизацию или точечную проверку.',
    },
    {
      id: 'loyalty',
      label: 'Лояльность клуба',
      status: hasLoyalty ? 'READY' : guest ? 'ATTENTION' : 'MISSING',
      note: hasLoyalty
        ? 'Есть база для группы, часов или бонусной карты.'
        : 'Группа и часы появятся после данных Langame.',
    },
    {
      id: 'game_profile',
      label: 'Игровой профиль',
      status: profile ? 'READY' : guest || lead ? 'ATTENTION' : 'MISSING',
      note: profile
        ? 'XP, уровни и игровые награды связаны с профилем LeetPlus.'
        : 'Игровой профиль будет создан при первом игровом событии или привязке канала.',
    },
    {
      id: 'messenger',
      label: 'Telegram/MAX',
      status: hasMessenger ? 'READY' : 'ATTENTION',
      note: hasMessenger
        ? 'Канал сохранен, отправка включается только после настройки бота.'
        : 'Можно привязать Telegram-бота или alias для будущих игровых уведомлений.',
    },
  ];
}

function guestAccountStateLabel(
  state: GuestPortalGuestSnapshot['participation']['accountState'],
) {
  const labels = {
    LANGAME_SYNCED: 'Синхронизирован с Langame',
    CRM_LEAD: 'CRM-заявка без Langame-профиля',
    GAME_PROFILE: 'Игровой профиль LeetPlus',
    DISABLED: 'Отключен в Langame',
    TEMPORARY: 'Временный гость',
    VIRTUAL: 'Виртуальный профиль',
    NOT_MATCHED: 'Профиль не найден',
  } satisfies Record<
    GuestPortalGuestSnapshot['participation']['accountState'],
    string
  >;

  return labels[state];
}

function guestRegistrationChannel(
  guest: {
    isMobileRegistration: boolean;
    isSimpleRegistration: boolean;
  } | null,
  lead: unknown,
  profile: unknown,
) {
  if (guest?.isMobileRegistration) {
    return 'Мобильная регистрация Langame';
  }

  if (guest?.isSimpleRegistration) {
    return 'Упрощенная регистрация Langame';
  }

  if (guest) {
    return 'Стандартная регистрация Langame';
  }

  if (lead) {
    return 'CRM-заявка LeetPlus';
  }

  if (profile) {
    return 'Игровой профиль LeetPlus';
  }

  return 'Не определен';
}

function guestVerificationLabel(
  guest: {
    isConfirmed: boolean;
    identityDocumentPresent: boolean;
  } | null,
  lead: unknown,
  profile: unknown,
) {
  if (guest?.identityDocumentPresent) {
    return 'Документ указан в Langame';
  }

  if (guest?.isConfirmed) {
    return 'Профиль подтвержден в Langame';
  }

  if (guest) {
    return 'Есть Langame-профиль, подтверждение не отмечено';
  }

  if (lead || profile) {
    return 'Телефон подтвержден в гостевом портале';
  }

  return 'Ожидает подтверждения телефона';
}

function guestGenderLabel(value: string | null) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (['m', 'male', 'man', 'м', 'муж', 'мужской'].includes(normalized)) {
    return 'мужской';
  }

  if (['f', 'female', 'woman', 'ж', 'жен', 'женский'].includes(normalized)) {
    return 'женский';
  }

  return value;
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
  const action = communicationPreferenceActionOrNull(value);
  if (action) {
    return action;
  }

  throw new BadRequestException(
    'Неизвестное действие для настройки коммуникаций.',
  );
}

function communicationPreferenceActionOrNull(
  value: unknown,
): GuestPortalCommunicationPreferenceAction | null {
  if (value === 'GRANT' || value === 'DENY' || value === 'UNSUBSCRIBE') {
    return value;
  }

  return null;
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

function communicationPreferenceCrmStatus(
  action: GuestPortalCommunicationPreferenceAction,
) {
  if (action === 'GRANT') {
    return GuestCrmStatus.CONTACT;
  }

  if (action === 'UNSUBSCRIBE') {
    return GuestCrmStatus.DO_NOT_CONTACT;
  }

  return GuestCrmStatus.NONE;
}

function communicationPreferenceEventNote(
  action: GuestPortalCommunicationPreferenceAction,
) {
  const notes = {
    GRANT: 'Гость разрешил игровые коммуникации через гостевой портал.',
    DENY: 'Гость отказался от игровых коммуникаций через гостевой портал.',
    UNSUBSCRIBE:
      'Гость отписался от игровых коммуникаций через гостевой портал.',
  } satisfies Record<GuestPortalCommunicationPreferenceAction, string>;

  return `${COMMUNICATION_PREFERENCE_EVENT_PREFIX}${action}: ${notes[action]}`;
}

function messengerChannel(value: unknown): GuestPortalMessengerChannel {
  if (value === 'TELEGRAM' || value === 'MAX') {
    return value;
  }

  throw new BadRequestException('Выберите Telegram или MAX.');
}

function messengerIdentity(
  channel: GuestPortalMessengerChannel,
  value: unknown,
) {
  if (typeof value !== 'string') {
    throw new BadRequestException('Укажите публичный alias мессенджера.');
  }

  const trimmed = value.trim();
  const withoutUrl = trimmed
    .replace(/^https?:\/\/(www\.)?t\.me\//i, '')
    .replace(/^https?:\/\/(www\.)?telegram\.me\//i, '')
    .replace(/^https?:\/\/(www\.)?max\.ru\//i, '')
    .replace(/^max:\/\//i, '')
    .trim();
  const normalized = withoutUrl.startsWith('@') ? withoutUrl : `@${withoutUrl}`;

  if (!/^@[A-Za-z0-9_.-]{3,64}$/.test(normalized)) {
    throw new BadRequestException(
      `${channel === 'TELEGRAM' ? 'Telegram' : 'MAX'} alias должен содержать 3-64 символа: латиница, цифры, _, . или -.`,
    );
  }

  return normalized;
}

function messengerMessage(channel: GuestPortalMessengerChannel) {
  return `${
    channel === 'TELEGRAM' ? 'Telegram' : 'MAX'
  } сохранен в гостевом профиле. Реальная отправка сообщений включается отдельно после подключения бота.`;
}

function messengerEventNote(channel: GuestPortalMessengerChannel) {
  return `guest_portal:messenger_link:${channel.toLowerCase()}`;
}

function communicationPreferenceHistoryLabel(
  action: GuestPortalCommunicationPreferenceAction,
) {
  const labels = {
    GRANT: 'Согласие',
    DENY: 'Отказ',
    UNSUBSCRIBE: 'Отписка',
  } satisfies Record<GuestPortalCommunicationPreferenceAction, string>;

  return labels[action];
}

function mapCommunicationPreferenceHistory(
  rows: Array<{
    id: string;
    note: string | null;
    createdAt: Date;
  }>,
): GuestPortalCommunicationHistoryItem[] {
  return rows.flatMap((row) => {
    const note = row.note ?? '';
    const [, rest] = note.split(COMMUNICATION_PREFERENCE_EVENT_PREFIX);
    if (!rest) {
      return [];
    }

    const [rawAction, ...messageParts] = rest.split(': ');
    const action = communicationPreferenceActionOrNull(rawAction);
    if (!action) {
      return [];
    }
    const cleanNote = messageParts.join(': ').trim();

    return [
      {
        id: row.id,
        action,
        label: communicationPreferenceHistoryLabel(action),
        note: cleanNote || communicationPreferenceMessage(action),
        createdAt: row.createdAt.toISOString(),
      },
    ];
  });
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
  communicationEvents: Array<{
    id: string;
    note: string | null;
    createdAt: Date;
  }>,
  lead?: {
    phoneMasked: string | null;
    phoneConsentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
    phoneConsentSource: string | null;
    phoneConsentAt: Date | null;
    unsubscribedAt: Date | null;
  } | null,
): GuestPortalCommunications {
  const consentSource = guest ?? lead ?? null;
  const consentStatus = consentSource?.unsubscribedAt
    ? 'UNSUBSCRIBED'
    : (consentSource?.phoneConsentStatus ?? 'UNKNOWN');
  const consentGranted = consentStatus === 'GRANTED';

  return {
    phone: {
      masked:
        guest?.phoneMasked ??
        lead?.phoneMasked ??
        profile?.contactMasked ??
        null,
      consentStatus,
      consentSource: consentSource?.phoneConsentSource ?? null,
      consentAt: iso(consentSource?.phoneConsentAt ?? null),
      unsubscribedAt: iso(consentSource?.unsubscribedAt ?? null),
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
    history: mapCommunicationPreferenceHistory(communicationEvents),
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
