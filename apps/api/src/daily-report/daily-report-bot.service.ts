import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SecretEncryptionService } from '../integrations/secret-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import {
  LINK_CODE_TTL_MS,
  hashLinkCode,
  newLinkCode,
  normalizeBotToken,
  tokenHint,
} from './daily-report-telegram';

export type DailyReportBotSettings = {
  /** Only a platform admin sets the token; the bot is one for every network. */
  canManageBot: boolean;
  bot: {
    connected: boolean;
    status: 'PENDING' | 'READY' | 'INVALID' | null;
    botUsername: string | null;
    tokenHint: string | null;
    lastError: string | null;
    checkedAt: string | null;
  };
  users: Array<{
    userId: string;
    name: string;
    email: string;
    role: string;
    scope: 'NETWORK' | 'STORES';
    storeCount: number;
    enabled: boolean;
    linked: boolean;
    telegramName: string | null;
    lastDelivery: { reportKey: string; status: string; at: string } | null;
  }>;
};

/**
 * One report bot for the whole platform: a platform admin stores its
 * encrypted token (the single `DailyReportBot` row; `tenantId` is the network
 * of the admin who saved it). Each network's owner ticks who gets that
 * network's report. No Telegram call happens here; the worker checks the
 * token and links chats, so the API keeps no new egress.
 */
@Injectable()
export class DailyReportBotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freshStoreScope: FreshStoreScopeService,
    private readonly encryption: SecretEncryptionService,
  ) {}

  async getSettings(user: AuthenticatedUser): Promise<DailyReportBotSettings> {
    const { tenantId } = await this.freshStoreScope.assertNetwork(user);
    const [bot, users, recipients] = await Promise.all([
      this.platformBot(),
      this.prisma.user.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          accessScope: true,
          _count: { select: { storeAccesses: true } },
        },
      }),
      this.prisma.dailyReportRecipient.findMany({
        where: { tenantId },
        include: {
          deliveries: {
            where: { kind: 'DAILY' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
    ]);
    const byUser = new Map(recipients.map((row) => [row.userId, row]));
    return {
      canManageBot: user.isPlatformAdmin,
      bot: {
        connected: Boolean(bot),
        status:
          (bot?.status as DailyReportBotSettings['bot']['status']) ?? null,
        botUsername: bot?.botUsername ?? null,
        tokenHint: user.isPlatformAdmin ? (bot?.tokenHint ?? null) : null,
        lastError: bot?.lastError ?? null,
        checkedAt: bot?.checkedAt?.toISOString() ?? null,
      },
      users: users.map((row) => {
        const recipient = byUser.get(row.id);
        const delivery = recipient?.deliveries[0];
        return {
          userId: row.id,
          name: row.fullName?.trim() || row.email,
          email: row.email,
          role: row.role,
          scope: row.accessScope === 'STORES' ? 'STORES' : 'NETWORK',
          storeCount: row._count.storeAccesses,
          enabled: recipient?.enabled ?? false,
          linked: Boolean(recipient?.chatId),
          telegramName: recipient?.telegramName ?? null,
          lastDelivery: delivery
            ? {
                reportKey: delivery.reportKey,
                status: delivery.status,
                at: (delivery.sentAt ?? delivery.createdAt).toISOString(),
              }
            : null,
        };
      }),
    };
  }

  async saveToken(user: AuthenticatedUser, body: { token?: unknown }) {
    const { tenantId } = await this.freshStoreScope.assertNetwork(user);
    this.assertPlatformAdmin(user);
    const token = normalizeBotToken(body?.token);
    if (!token) {
      throw new BadRequestException(
        'Токен должен выглядеть как 1234567890:AA… — скопируйте его из BotFather целиком',
      );
    }
    const current = await this.platformBot();
    // The same bot under a new token keeps its chats; another bot cannot
    // write to chats linked through the old one.
    const sameBot =
      current !== null &&
      botIdOf(current.tokenHint) === botIdOf(tokenHint(token));
    const data = {
      tokenCiphertext: this.encryption.encrypt(token, 'integration'),
      tokenHint: tokenHint(token),
      botUsername: sameBot ? current.botUsername : null,
      status: 'PENDING',
      lastError: null,
      checkedAt: null,
      updateOffset: sameBot ? current.updateOffset : 0,
      updatedByUserId: user.id,
    };
    await this.prisma.$transaction([
      this.prisma.dailyReportBot.deleteMany({
        where: { tenantId: { not: tenantId } },
      }),
      this.prisma.dailyReportBot.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      }),
      ...(sameBot
        ? []
        : [
            this.prisma.dailyReportRecipient.updateMany({
              data: { chatId: null, telegramName: null, linkedAt: null },
            }),
          ]),
    ]);
    return this.getSettings(user);
  }

  async deleteToken(user: AuthenticatedUser) {
    await this.freshStoreScope.assertNetwork(user);
    this.assertPlatformAdmin(user);
    await this.prisma.$transaction([
      this.prisma.dailyReportBot.deleteMany(),
      this.prisma.dailyReportRecipient.updateMany({
        data: { chatId: null, telegramName: null, linkedAt: null },
      }),
    ]);
    return this.getSettings(user);
  }

  async setRecipient(
    user: AuthenticatedUser,
    userId: string,
    body: { enabled?: unknown },
  ) {
    const { tenantId } = await this.freshStoreScope.assertNetwork(user);
    if (typeof body?.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be true or false');
    }
    await this.assertTenantUser(tenantId, userId);
    await this.prisma.dailyReportRecipient.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: { tenantId, userId, enabled: body.enabled },
      update: { enabled: body.enabled },
    });
    return this.getSettings(user);
  }

  /**
   * A one-time `t.me/<bot>?start=<code>` link for the user. The code is shown
   * once; only its hash is stored.
   */
  async createLink(user: AuthenticatedUser, userId: string) {
    const { tenantId } = await this.freshStoreScope.assertNetwork(user);
    await this.assertTenantUser(tenantId, userId);
    const bot = await this.platformBot();
    if (!bot?.botUsername || bot.status !== 'READY') {
      throw new BadRequestException(
        'Бот ещё не проверен: подождите пару минут после сохранения токена',
      );
    }
    const code = newLinkCode();
    await this.prisma.dailyReportRecipient.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: {
        tenantId,
        userId,
        enabled: true,
        linkCodeHash: hashLinkCode(code),
        linkCodeExpiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
      },
      update: {
        enabled: true,
        linkCodeHash: hashLinkCode(code),
        linkCodeExpiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
      },
    });
    return { url: `https://t.me/${bot.botUsername}?start=${code}` };
  }

  /** The platform's bot: one row; the newest wins if an old one lingers. */
  private platformBot() {
    return this.prisma.dailyReportBot.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
  }

  private assertPlatformAdmin(user: AuthenticatedUser) {
    if (!user.isPlatformAdmin) {
      throw new ForbiddenException(
        'Бота отчётов подключает администратор платформы',
      );
    }
  }

  private async assertTenantUser(tenantId: string, userId: string) {
    const target = await this.prisma.user.findFirst({
      where: { tenantId, id: userId, isActive: true },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Пользователь не найден');
  }
}

/** The numeric bot id from a hint such as `1234567890:…abcd`. */
function botIdOf(hint: string) {
  return hint.split(':')[0];
}
