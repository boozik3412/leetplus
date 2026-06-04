import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import {
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
} from '@prisma/client';
import { createHash, createHmac, randomInt, randomUUID } from 'node:crypto';
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
  gamification: {
    lootBoxes: GuestPortalLootBox[];
    missions: GuestPortalMission[];
    seasons: GuestPortalSeason[];
    rewards: GuestPortalReward[];
  };
};

export type GuestPortalLootBox = {
  id: string;
  name: string;
  triggerKind: string;
  rewardLabel: string | null;
  rewardType: string;
  manualApprovalRequired: boolean;
  note: string | null;
};

export type GuestPortalMission = {
  id: string;
  name: string;
  missionType: string;
  rewardLabel: string | null;
  xpReward: number;
  progressTarget: number | null;
  progressUnit: string | null;
  progressPercent: number;
  periodTo: string | null;
  manualApprovalRequired: boolean;
};

export type GuestPortalSeason = {
  id: string;
  name: string;
  seasonType: string;
  premiumEnabled: boolean;
  periodTo: string | null;
  levels: Array<{
    level: number;
    xp: number;
    freeReward: string | null;
    premiumReward: string | null;
    reached: boolean;
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
  rewardCode: string | null;
  claimPayload: string | null;
  qualifiedAt: string;
  expiresAt: string | null;
};

@Injectable()
export class GuestPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
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
              OR: [
                ...(guest ? [{ guestId: guest.id }] : []),
                ...(profile ? [{ profileId: profile.id }] : []),
              ],
            },
            orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
            take: 20,
          })
        : [],
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
      gamification: {
        lootBoxes: lootBoxes
          .filter((item) => matchesStore(item.storeIds, context.store.id))
          .slice(0, 6)
          .map(mapLootBox),
        missions: missions
          .filter((item) => matchesStore(item.storeIds, context.store.id))
          .filter((item) => activePeriod(item.periodFrom, item.periodTo))
          .slice(0, 6)
          .map(mapMission),
        seasons: seasons
          .filter((item) => activePeriod(item.periodFrom, item.periodTo))
          .slice(0, 2)
          .map((item) => mapSeason(item, xp)),
        rewards: rewards.map(mapReward),
      },
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

function mapLootBox(row: {
  id: string;
  name: string;
  triggerKind: string;
  rewardLabel: string | null;
  rewardType: string;
  manualApprovalRequired: boolean;
  note: string | null;
}): GuestPortalLootBox {
  return {
    id: row.id,
    name: row.name,
    triggerKind: row.triggerKind,
    rewardLabel: row.rewardLabel,
    rewardType: row.rewardType,
    manualApprovalRequired: row.manualApprovalRequired,
    note: row.note,
  };
}

function mapMission(row: {
  id: string;
  name: string;
  missionType: string;
  rewardLabel: string | null;
  xpReward: number;
  progressTarget: number | null;
  progressUnit: string | null;
  periodTo: Date | null;
  manualApprovalRequired: boolean;
}): GuestPortalMission {
  return {
    id: row.id,
    name: row.name,
    missionType: row.missionType,
    rewardLabel: row.rewardLabel,
    xpReward: row.xpReward,
    progressTarget: row.progressTarget,
    progressUnit: row.progressUnit,
    progressPercent: 0,
    periodTo: iso(row.periodTo),
    manualApprovalRequired: row.manualApprovalRequired,
  };
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
): GuestPortalSeason {
  return {
    id: row.id,
    name: row.name,
    seasonType: row.seasonType,
    periodTo: iso(row.periodTo),
    premiumEnabled: row.premiumEnabled,
    levels: seasonLevels(row.levels, xp),
  };
}

function mapReward(row: {
  id: string;
  status: string;
  rewardType: string;
  rewardAmount: Prisma.Decimal;
  rewardLabel: string;
  rewardCode: string | null;
  qualifiedAt: Date;
  expiresAt: Date | null;
}): GuestPortalReward {
  const walletState = rewardWalletState(row.status, row.expiresAt);

  return {
    id: row.id,
    status: row.status,
    walletState,
    rewardType: row.rewardType,
    rewardAmount: Number(row.rewardAmount),
    rewardLabel: row.rewardLabel,
    rewardCode: row.rewardCode,
    claimPayload:
      row.rewardCode && walletState !== 'REDEEMED'
        ? buildRewardClaimPayload(row.id, row.rewardCode)
        : null,
    qualifiedAt: row.qualifiedAt.toISOString(),
    expiresAt: iso(row.expiresAt),
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
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 12);
}

function matchesStore(value: Prisma.JsonValue | null, storeId: string) {
  const storeIds = stringArray(value);
  return storeIds.length === 0 || storeIds.includes(storeId);
}

function activePeriod(from: Date | null, to: Date | null) {
  const now = Date.now();
  return (!from || from.getTime() <= now) && (!to || to.getTime() >= now);
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
