import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { SecretEncryptionService } from '../integrations/secret-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { DailyReportCommentaryService } from './daily-report-commentary';
import { formatChange, formatRub } from './daily-report-format';
import {
  DailyReportService,
  type DailyReportScope,
} from './daily-report.service';
import {
  TelegramApiError,
  type TelegramFetch,
  getMe,
  getUpdates,
  hashLinkCode,
  linkCodeFromText,
  sendMessage,
} from './daily-report-telegram';
import { escapeHtml, renderDailyReport } from './daily-report-text';
import {
  localDate,
  shiftDate,
  zonedWallClockToInstant,
} from './daily-report-window';
import type { DailyReport } from './daily-report.types';

/**
 * One tick of the platform's report bot (the worker runs it every few
 * minutes): check the token, link chats from `/start <code>`, refresh today's
 * data of every network with recipients, send each recipient the morning
 * report of their own network at 10:00 Moscow time and a follow-up when a
 * shift that was open at 10:00 closes.
 */

export const DELIVERY_TIME_ZONE = 'Europe/Moscow';
/** Minutes after Moscow midnight. */
export const REFRESH_FROM_MINUTE = 9 * 60 + 25;
export const SEND_FROM_MINUTE = 10 * 60;
/** A report that could not go out by 20:00 is not sent that day. */
export const SEND_UNTIL_MINUTE = 20 * 60;
const MAX_DAILY_ATTEMPTS = 3;
const FOLLOW_UP_WINDOW_MS = 24 * 60 * 60 * 1000;
const SHIFT_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const TOKEN_RECHECK_MS = 6 * 60 * 60 * 1000;

export type DailyReportRefresh = (input: {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  /** false: working shifts only (follow-up checks). */
  full: boolean;
}) => Promise<void>;

export type DailyReportTickDeps = {
  telegramFetch: TelegramFetch;
  llmFetch?: typeof fetch;
  refresh?: DailyReportRefresh;
};

export type OpenShiftRef = {
  shiftId: string;
  storeId: string;
  reportDate: string;
};

export type DailyReportTickResult = {
  bots: number;
  linked: number;
  sent: number;
  followUps: number;
  failures: string[];
};

export function moscowClock(now: Date) {
  const date = localDate(now, DELIVERY_TIME_ZONE);
  const midnight = zonedWallClockToInstant(date, 0, DELIVERY_TIME_ZONE);
  return {
    date,
    minutes: Math.floor((now.getTime() - midnight.getTime()) / 60_000),
  };
}

export function openShiftRefs(report: DailyReport): OpenShiftRef[] {
  return report.clubs.flatMap((club) =>
    club.shifts
      .filter((shift) => !shift.closed)
      .map((shift) => ({
        shiftId: shift.id,
        storeId: club.storeId,
        reportDate: club.reportDate,
      })),
  );
}

/** The message sent when a shift that was open in the morning report closes. */
export function renderFollowUp(report: DailyReport, ref: OpenShiftRef) {
  const club = report.clubs.find((item) => item.storeId === ref.storeId);
  const shift = club?.shifts.find((item) => item.id === ref.shiftId);
  if (!club || !shift?.closed) return null;
  const perHour =
    shift.revenuePerHour !== null
      ? ` · ${formatRub(shift.revenuePerHour)}/ч`
      : '';
  const change = formatChange(club.metrics.shiftRevenue.change);
  return [
    `✅ <b>${escapeHtml(club.name)}: смена закрыта</b>`,
    `${escapeHtml(shift.adminName)} ${shift.startedAt ?? '?'}–${shift.stoppedAt} · ${formatRub(shift.revenue)}${perHour}`,
    `Наличные ${formatRub(shift.cash)}, безнал ${formatRub(shift.cashless)}${shift.refunds ? `, возвраты ${formatRub(shift.refunds)}` : ''}`,
    `Касса клуба за сутки теперь ${formatRub(club.metrics.shiftRevenue.value)}${change ? ` (${change})` : ''}`,
  ].join('\n');
}

@Injectable()
export class DailyReportDeliveryService {
  private readonly logger = new Logger(DailyReportDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: SecretEncryptionService,
    private readonly accessScope: AccessScopeService,
    private readonly reports: DailyReportService,
    private readonly commentary: DailyReportCommentaryService,
  ) {}

  async tick(
    now: Date,
    deps: DailyReportTickDeps,
  ): Promise<DailyReportTickResult> {
    const result: DailyReportTickResult = {
      bots: 0,
      linked: 0,
      sent: 0,
      followUps: 0,
      failures: [],
    };
    // One bot for the platform; the newest row wins if an old one lingers.
    const bot = await this.prisma.dailyReportBot.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (!bot) return result;
    result.bots = 1;
    try {
      await this.tickBot(bot, now, deps, result);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Daily report bot: ${reason}`);
      result.failures.push(reason);
    }
    return result;
  }

  private async tickBot(
    bot: Prisma.DailyReportBotGetPayload<object>,
    now: Date,
    deps: DailyReportTickDeps,
    result: DailyReportTickResult,
  ) {
    const token = this.encryption.decrypt(bot.tokenCiphertext, 'integration');
    const ready = await this.checkToken(bot, token, now, deps.telegramFetch);
    if (!ready) return;
    result.linked += await this.pollLinks(bot, token, now, deps.telegramFetch);

    const clock = moscowClock(now);
    if (
      deps.refresh &&
      clock.minutes >= REFRESH_FROM_MINUTE &&
      bot.refreshedForDate !== clock.date
    ) {
      for (const tenantId of await this.recipientTenants()) {
        await this.refresh(tenantId, clock.date, true, now, deps.refresh);
      }
      await this.prisma.dailyReportBot.update({
        where: { id: bot.id },
        data: { refreshedForDate: clock.date, refreshedAt: now },
      });
      bot.refreshedAt = now;
    }
    if (
      clock.minutes >= SEND_FROM_MINUTE &&
      clock.minutes < SEND_UNTIL_MINUTE
    ) {
      for (const tenantId of await this.recipientTenants()) {
        result.sent += await this.sendDaily(
          tenantId,
          token,
          now,
          clock.date,
          deps,
        );
      }
    }
    result.followUps += await this.sendFollowUps(bot, token, now, deps);
  }

  /** getMe after a token change and every few hours; false when unusable. */
  private async checkToken(
    bot: Prisma.DailyReportBotGetPayload<object>,
    token: string,
    now: Date,
    fetchImpl: TelegramFetch,
  ) {
    const fresh =
      bot.status !== 'PENDING' &&
      bot.checkedAt &&
      now.getTime() - bot.checkedAt.getTime() < TOKEN_RECHECK_MS;
    if (fresh) return bot.status === 'READY';
    try {
      const me = await getMe(fetchImpl, token);
      await this.prisma.dailyReportBot.update({
        where: { id: bot.id },
        data: {
          status: 'READY',
          botUsername: me.username ?? null,
          lastError: null,
          checkedAt: now,
        },
      });
      bot.status = 'READY';
      bot.botUsername = me.username ?? null;
      return true;
    } catch (error) {
      if (error instanceof TelegramApiError && error.status === 401) {
        await this.prisma.dailyReportBot.update({
          where: { id: bot.id },
          data: {
            status: 'INVALID',
            lastError: 'Telegram не принял токен — проверьте его в BotFather',
            checkedAt: now,
          },
        });
        return false;
      }
      // Network trouble: keep the last known state and try again next tick.
      throw error;
    }
  }

  private async pollLinks(
    bot: Prisma.DailyReportBotGetPayload<object>,
    token: string,
    now: Date,
    fetchImpl: TelegramFetch,
  ) {
    const updates = await getUpdates(
      fetchImpl,
      token,
      Number(bot.updateOffset),
    );
    let linked = 0;
    for (const update of updates) {
      const message = update.message;
      const chat = message?.chat;
      if (!message || !chat || chat.type !== 'private') continue;
      const chatId = String(chat.id);
      const text = message.text?.trim() ?? '';
      const code = linkCodeFromText(text);
      if (code) {
        const recipient = await this.prisma.dailyReportRecipient.findFirst({
          where: {
            linkCodeHash: hashLinkCode(code),
            linkCodeExpiresAt: { gt: now },
          },
        });
        if (recipient) {
          const name = [message.from?.first_name, message.from?.last_name]
            .filter(Boolean)
            .join(' ');
          await this.prisma.dailyReportRecipient.update({
            where: { id: recipient.id },
            data: {
              chatId,
              telegramName:
                (message.from?.username ? `@${message.from.username}` : name) ||
                null,
              linkedAt: now,
              enabled: true,
              linkCodeHash: null,
              linkCodeExpiresAt: null,
            },
          });
          linked += 1;
          await this.reply(
            fetchImpl,
            token,
            chatId,
            'Готово! Каждый день в 10:00 по Москве сюда будет приходить отчёт за прошедшие сутки. Отключить: /stop',
          );
        } else {
          await this.reply(
            fetchImpl,
            token,
            chatId,
            'Ссылка устарела или уже использована. Попросите новую в LeetPlus: Настройки → Отчёт за сутки.',
          );
        }
      } else if (/^\/stop\b/.test(text)) {
        await this.prisma.dailyReportRecipient.updateMany({
          where: { chatId },
          data: { enabled: false },
        });
        await this.reply(
          fetchImpl,
          token,
          chatId,
          'Отчёт отключён. Включить снова можно в LeetPlus: Настройки → Отчёт за сутки.',
        );
      } else if (/^\/start\b/.test(text)) {
        await this.reply(
          fetchImpl,
          token,
          chatId,
          'Это бот ежедневного отчёта LeetPlus. Чтобы подключиться, откройте ссылку, которую выдаёт владелец сети в настройках.',
        );
      }
    }
    if (updates.length) {
      await this.prisma.dailyReportBot.update({
        where: { id: bot.id },
        data: { updateOffset: BigInt(updates.at(-1)!.update_id + 1) },
      });
    }
    return linked;
  }

  private async reply(
    fetchImpl: TelegramFetch,
    token: string,
    chatId: string,
    text: string,
  ) {
    try {
      await sendMessage(fetchImpl, token, chatId, text, false);
    } catch (error) {
      this.logger.warn(
        `Daily report bot reply failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Networks with at least one linked recipient who gets the report. */
  private async recipientTenants() {
    const rows = await this.prisma.dailyReportRecipient.findMany({
      where: { enabled: true, chatId: { not: null } },
      distinct: ['tenantId'],
      select: { tenantId: true },
    });
    return rows.map((row) => row.tenantId);
  }

  private async refresh(
    tenantId: string,
    today: string,
    full: boolean,
    now: Date,
    refresh: DailyReportRefresh,
  ) {
    try {
      await refresh({
        tenantId,
        dateFrom: shiftDate(today, -1),
        dateTo: today,
        full,
      });
    } catch (error) {
      // The report still goes out on the data already loaded; open shifts and
      // gaps make missing data visible.
      this.logger.warn(
        `Daily report refresh ${tenantId} failed at ${now.toISOString()}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async recipientScope(
    tenantId: string,
    userId: string,
  ): Promise<DailyReportScope | null> {
    const user = await this.prisma.user.findFirst({
      where: { tenantId, id: userId, isActive: true },
      select: {
        tenantId: true,
        accessScope: true,
        storeAccesses: { select: { storeId: true } },
      },
    });
    if (!user) return null;
    try {
      const scope = this.accessScope.fromPersisted(user);
      return {
        tenantId,
        storeIds: scope.mode === 'NETWORK' ? null : scope.storeIds,
      };
    } catch {
      return null;
    }
  }

  private async sendDaily(
    tenantId: string,
    token: string,
    now: Date,
    reportKey: string,
    deps: DailyReportTickDeps,
  ) {
    const recipients = await this.prisma.dailyReportRecipient.findMany({
      where: { tenantId, enabled: true, chatId: { not: null } },
      include: {
        deliveries: { where: { reportKey, kind: 'DAILY', subjectKey: '' } },
      },
    });
    // Recipients with the same clubs share one report and one AI commentary.
    const prepared = new Map<
      string,
      Promise<{ report: DailyReport; messages: string[] }>
    >();
    let sent = 0;
    for (const recipient of recipients) {
      const previous = recipient.deliveries[0];
      if (
        previous &&
        (previous.status === 'SENT' || previous.attempts >= MAX_DAILY_ATTEMPTS)
      ) {
        continue;
      }
      const scope = await this.recipientScope(tenantId, recipient.userId);
      if (!scope) continue;
      const key = scope.storeIds ? [...scope.storeIds].sort().join(',') : '*';
      if (!prepared.has(key)) {
        prepared.set(key, this.prepare(scope, now, deps));
      }
      let error: string | null = null;
      let openShifts: OpenShiftRef[] = [];
      try {
        const { report, messages } = await prepared.get(key)!;
        if (!report.clubs.length) continue;
        openShifts = openShiftRefs(report);
        for (const message of messages) {
          await sendMessage(
            deps.telegramFetch,
            token,
            recipient.chatId!,
            message,
          );
        }
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
        if (caught instanceof TelegramApiError && caught.chatGone) {
          await this.prisma.dailyReportRecipient.update({
            where: { id: recipient.id },
            data: { chatId: null, linkedAt: null },
          });
        }
      }
      const data = {
        status: error ? 'FAILED' : 'SENT',
        error: error?.slice(0, 500) ?? null,
        openShiftIds: openShifts as unknown as Prisma.InputJsonValue,
        sentAt: error ? null : new Date(),
      };
      await this.prisma.dailyReportDelivery.upsert({
        where: {
          recipientId_reportKey_kind_subjectKey: {
            recipientId: recipient.id,
            reportKey,
            kind: 'DAILY',
            subjectKey: '',
          },
        },
        create: {
          tenantId,
          recipientId: recipient.id,
          reportKey,
          kind: 'DAILY',
          ...data,
        },
        update: { ...data, attempts: { increment: 1 } },
      });
      if (!error) sent += 1;
    }
    return sent;
  }

  private async prepare(
    scope: DailyReportScope,
    now: Date,
    deps: DailyReportTickDeps,
  ) {
    const report = await this.reports.build(scope, now);
    const commentary = report.clubs.length
      ? await this.commentary.comment(report, deps.llmFetch)
      : null;
    return {
      report,
      messages: renderDailyReport(report, commentary?.text ?? null),
    };
  }

  private async sendFollowUps(
    bot: Prisma.DailyReportBotGetPayload<object>,
    token: string,
    now: Date,
    deps: DailyReportTickDeps,
  ) {
    const dailies = await this.prisma.dailyReportDelivery.findMany({
      where: {
        kind: 'DAILY',
        status: 'SENT',
        sentAt: { gt: new Date(now.getTime() - FOLLOW_UP_WINDOW_MS) },
        recipient: { enabled: true, chatId: { not: null } },
      },
      include: { recipient: true },
    });
    const pending = dailies.flatMap((delivery) =>
      ((delivery.openShiftIds ?? []) as OpenShiftRef[]).map((ref) => ({
        delivery,
        ref,
      })),
    );
    if (!pending.length) return 0;
    const done = new Set(
      (
        await this.prisma.dailyReportDelivery.findMany({
          where: {
            kind: 'FOLLOW_UP',
            recipientId: {
              in: [
                ...new Set(pending.map((item) => item.delivery.recipientId)),
              ],
            },
          },
          select: { recipientId: true, reportKey: true, subjectKey: true },
        })
      ).map((row) => `${row.recipientId}|${row.reportKey}|${row.subjectKey}`),
    );
    const waiting = pending.filter(
      ({ delivery, ref }) =>
        !done.has(
          `${delivery.recipientId}|${delivery.reportKey}|${ref.shiftId}`,
        ),
    );
    if (!waiting.length) return 0;

    const shifts = await this.prisma.guestWorkingShift.findMany({
      where: {
        OR: [...new Set(waiting.map((item) => item.delivery.tenantId))].map(
          (tenantId) => ({
            tenantId,
            id: {
              in: waiting
                .filter((item) => item.delivery.tenantId === tenantId)
                .map((item) => item.ref.shiftId),
            },
          }),
        ),
      },
      select: { id: true, stoppedAt: true },
    });
    const closed = new Set(
      shifts.filter((shift) => shift.stoppedAt).map((shift) => shift.id),
    );
    if (
      closed.size < new Set(waiting.map((item) => item.ref.shiftId)).size &&
      deps.refresh &&
      (!bot.refreshedAt ||
        now.getTime() - bot.refreshedAt.getTime() >= SHIFT_REFRESH_INTERVAL_MS)
    ) {
      // Shifts close in Langame; pull working shifts again, at most every 30 min.
      const open = waiting.filter((item) => !closed.has(item.ref.shiftId));
      for (const tenantId of new Set(
        open.map((item) => item.delivery.tenantId),
      )) {
        await this.refresh(
          tenantId,
          moscowClock(now).date,
          false,
          now,
          deps.refresh,
        );
      }
      await this.prisma.dailyReportBot.update({
        where: { id: bot.id },
        data: { refreshedAt: now },
      });
      bot.refreshedAt = now;
      return 0; // the next tick reads the refreshed shifts
    }

    let sent = 0;
    for (const { delivery, ref } of waiting) {
      if (!closed.has(ref.shiftId)) continue;
      const scope = await this.recipientScope(
        delivery.tenantId,
        delivery.recipient.userId,
      );
      if (!scope) continue;
      const report = await this.reports.build(scope, now, ref.reportDate);
      const text = renderFollowUp(report, ref);
      if (!text) continue;
      let error: string | null = null;
      try {
        await sendMessage(
          deps.telegramFetch,
          token,
          delivery.recipient.chatId!,
          text,
        );
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
      await this.prisma.dailyReportDelivery.create({
        data: {
          tenantId: delivery.tenantId,
          recipientId: delivery.recipientId,
          reportKey: delivery.reportKey,
          kind: 'FOLLOW_UP',
          subjectKey: ref.shiftId,
          status: error ? 'FAILED' : 'SENT',
          error: error?.slice(0, 500) ?? null,
          sentAt: error ? null : now,
        },
      });
      if (!error) sent += 1;
    }
    return sent;
  }
}
