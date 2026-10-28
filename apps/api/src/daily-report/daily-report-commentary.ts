import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DailyReport } from './daily-report.types';

/**
 * AI commentary of the daily report. The model only explains numbers the
 * report already computed: any figure it writes must be found in the report,
 * otherwise the commentary is dropped and the owner gets the numbers alone.
 */

export const DAILY_REPORT_LLM_DEFAULTS = {
  // Cloud.ru Evolution Foundation Models: the request stays in Russia for the
  // models hosted by Cloud.ru itself (owner decision 26.10.2026). GLM-5.1
  // answers the network's figures in 12–20 s; DeepSeek V4 Pro did not answer
  // within 5 minutes (checked 28.10.2026).
  baseUrl: 'https://foundation-models.api.cloud.ru/v1',
  model: 'zai-org/GLM-5.1',
  timeoutMs: 60_000,
  // The morning report is sent by the worker, which has time to wait: a
  // reasoning model on the whole network's figures needs minutes, not seconds.
  workerTimeoutMs: 180_000,
  // GLM-5.1 reasons before answering; the reasoning counts towards the limit.
  maxTokens: 6000,
} as const;

export type DailyReportLlmConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

export type CommentaryResult =
  | { status: 'OK'; text: string; model: string }
  | {
      status: 'DISABLED' | 'FAILED' | 'REJECTED';
      text: null;
      reason: string;
    };

export type CommentaryOptions = {
  /** The request waits at least this long, whatever the configured timeout. */
  minTimeoutMs?: number;
  /** Ask once more when the provider times out, drops or answers 5xx. */
  retryOnFailure?: boolean;
};

type NumberMention = { raw: string; value: number; tol: number };

export function numbersIn(text: string): NumberMention[] {
  const mentions: NumberMention[] = [];
  const pattern =
    /(\d{1,3}(?:[\s\u00a0\u202f]\d{3})+|\d+)(?:[.,](\d+))?\s*(тыс|млн)?/gi;
  for (const match of text.matchAll(pattern)) {
    const integer = match[1].replace(/[\s\u00a0\u202f]/g, '');
    const multiplier = /тыс/i.test(match[3] ?? '')
      ? 1e3
      : /млн/i.test(match[3] ?? '')
        ? 1e6
        : 1;
    const tolerance = match[2]
      ? 0.5 * 10 ** -match[2].length
      : 0.5 * 10 ** /0*$/.exec(integer)![0].length;
    mentions.push({
      raw: match[0].trim(),
      value: Number(integer + (match[2] ? `.${match[2]}` : '')) * multiplier,
      tol: Math.max(tolerance * multiplier, 0.5),
    });
  }
  return mentions;
}

/** Figures of 100 and above that the report does not contain. */
export function unknownNumbers(text: string, facts: unknown) {
  const known: number[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'number') {
      known.push(value, Math.abs(value), value * 100, Math.abs(value * 100));
    } else if (typeof value === 'string') {
      numbersIn(value).forEach((mention) => known.push(mention.value));
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(walk);
    }
  };
  walk(facts);
  return numbersIn(text).filter(
    ({ value, tol }) =>
      value >= 100 &&
      !(value >= 2000 && value <= 2035 && Number.isInteger(value)) &&
      !known.some((item) => Math.abs(value - item) <= tol),
  );
}

/** The part of the report the model reads: no ids, rounded and compact. */
export function commentaryFacts(report: DailyReport) {
  return {
    totals: report.totals,
    networkRevenuePerHour: report.networkRevenuePerHour,
    alerts: report.alerts,
    clubs: report.clubs.map((club) => ({
      name: club.name,
      metrics: club.metrics,
      load: club.load,
      guests: club.guestSummary,
      refunds: club.refunds,
      openShifts: club.openShifts,
      uncoveredPeriods: club.uncoveredPeriods,
      shifts: club.shifts.map((shift) => ({
        admin: shift.adminName,
        from: shift.startedAt,
        to: shift.stoppedAt,
        closed: shift.closed,
        revenue: shift.revenue,
        revenuePerHour: shift.revenuePerHour,
        adminUsualPerHour: shift.adminUsualPerHour,
      })),
      topProducts: club.topProducts,
      outOfStock: club.outOfStock.map((item) => item.name),
      runningOut: club.runningOut.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        daysLeft: item.daysLeft,
      })),
      baselineDays: club.baselineDays,
    })),
    admins: report.admins,
  };
}

const SYSTEM_PROMPT = [
  'Ты — аналитик сети компьютерных клубов. Владелец сети каждое утро получает отчёт за прошедшие сутки (с 09:00 до 09:00 по местному времени клуба).',
  'Тебе дают уже посчитанные цифры в JSON. Напиши короткий разбор для владельца на русском языке: 5–9 строк простым текстом, без markdown, без заголовков и без приветствия.',
  'Что важно: как прошли сутки в целом и в сравнении с обычным днём; какой клуб выделился в лучшую и в худшую сторону и чем; как прошли гости (новые, постоянные, пик загрузки); как отработали админы (выручка в час против среднего по сети и против своего обычного); проблемы — незакрытые смены, часы без смены, возвраты, закончившиеся ходовые товары.',
  'Закончи 2–3 конкретными действиями на сегодня, каждое с новой строки, начиная с «→».',
  'Касса (shiftRevenue) — все деньги, которые админы приняли за смены: наличные и безнал минус возвраты. Бар (barRevenue) — продажи товаров.',
  'Правила: используй только числа из JSON, ничего не придумывай и не пересчитывай. Деньги пиши как «45 300 ₽», изменения как «+12%» или «−8%». Поле change — доля: −0.18 значит −18%. Поле usual — среднее за прошлые 7 суток. Если сравнения нет (null), не сравнивай. Не повторяй все цифры подряд — владелец видит их ниже, объясни, что они значат.',
].join('\n');

@Injectable()
export class DailyReportCommentaryService {
  private readonly logger = new Logger(DailyReportCommentaryService.name);

  constructor(private readonly configService: ConfigService) {}

  config(): DailyReportLlmConfig | null {
    const apiKey = this.configService
      .get<string>('DAILY_REPORT_LLM_API_KEY')
      ?.trim();
    if (!apiKey) return null;
    const timeout = Number(
      this.configService.get<string>('DAILY_REPORT_LLM_TIMEOUT_MS'),
    );
    return {
      apiKey,
      baseUrl:
        this.configService.get<string>('DAILY_REPORT_LLM_BASE_URL')?.trim() ||
        DAILY_REPORT_LLM_DEFAULTS.baseUrl,
      model:
        this.configService.get<string>('DAILY_REPORT_LLM_MODEL')?.trim() ||
        DAILY_REPORT_LLM_DEFAULTS.model,
      timeoutMs:
        Number.isFinite(timeout) && timeout > 0
          ? timeout
          : DAILY_REPORT_LLM_DEFAULTS.timeoutMs,
    };
  }

  async comment(
    report: DailyReport,
    fetchImpl: typeof fetch = fetch,
    options: CommentaryOptions = {},
  ): Promise<CommentaryResult> {
    const configured = this.config();
    const config = configured && {
      ...configured,
      timeoutMs: Math.max(configured.timeoutMs, options.minTimeoutMs ?? 0),
    };
    if (!config) {
      return {
        status: 'DISABLED',
        text: null,
        reason: 'DAILY_REPORT_LLM_API_KEY is not set',
      };
    }
    if (!report.clubs.length) {
      return { status: 'DISABLED', text: null, reason: 'No clubs in scope' };
    }
    const facts = commentaryFacts(report);
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: JSON.stringify(facts) },
    ];
    let lastReason = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let text: string;
      try {
        text = await this.completeWithRetry(
          config,
          messages,
          fetchImpl,
          options.retryOnFailure ?? false,
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Daily report commentary failed: ${reason}`);
        return { status: 'FAILED', text: null, reason };
      }
      const unknown = unknownNumbers(text, facts);
      if (!unknown.length) {
        return { status: 'OK', text: text.trim(), model: config.model };
      }
      lastReason = `Numbers not in the report: ${unknown
        .map((item) => item.raw)
        .join(', ')}`;
      messages.push(
        { role: 'assistant', content: text },
        {
          role: 'user',
          content: `В разборе есть числа, которых нет в данных: ${unknown
            .map((item) => item.raw)
            .join(', ')}. Перепиши разбор, используя только числа из JSON.`,
        },
      );
    }
    this.logger.warn(`Daily report commentary rejected: ${lastReason}`);
    return { status: 'REJECTED', text: null, reason: lastReason };
  }

  private async completeWithRetry(
    config: DailyReportLlmConfig,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    fetchImpl: typeof fetch,
    retry: boolean,
  ) {
    try {
      return await this.complete(config, messages, fetchImpl);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // A 4xx (bad key, unknown model) will not get better on a second try.
      if (!retry || /^LLM responded 4\d\d/.test(reason)) throw error;
      this.logger.warn(
        `Daily report commentary failed, asking again: ${reason}`,
      );
      return this.complete(config, messages, fetchImpl);
    }
  }

  private async complete(
    config: DailyReportLlmConfig,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    fetchImpl: typeof fetch,
  ) {
    const response = await fetchImpl(
      `${config.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
          max_tokens: DAILY_REPORT_LLM_DEFAULTS.maxTokens,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `LLM responded ${response.status}: ${body.slice(0, 300)}`,
      );
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('LLM returned an empty answer');
    return text;
  }
}
