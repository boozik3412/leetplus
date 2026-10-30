import {
  formatArrow,
  formatNumber,
  formatPercent,
  formatRub,
  pluralRu,
  shortPersonName,
  shortProductName,
} from './daily-report-format';
import type {
  DailyReport,
  DailyReportClub,
  DailyReportMetric,
} from './daily-report.types';

/** Telegram allows 4096 characters per message; keep a margin for markup. */
export const TELEGRAM_MESSAGE_LIMIT = 3900;

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Lists in a club message stop here; the rest is a count. */
const LIST_LIMIT = 15;

function arrow(metric: DailyReportMetric) {
  const text = formatArrow(metric.change);
  return text ? ` ${text}` : '';
}

function dayMonth(date: string) {
  const [, month, day] = date.split('-');
  return `${day}.${month}`;
}

function formatDayLabel(club: DailyReportClub) {
  const previous = new Date(`${club.reportDate}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return `${dayMonth(previous.toISOString().slice(0, 10))} → ${dayMonth(club.reportDate)}`;
}

function wholeNumber(value: number) {
  return formatNumber(Math.round(value));
}

function payments(count: number) {
  return `${formatNumber(count)} ${pluralRu(count, ['оплата', 'оплаты', 'оплат'])}`;
}

/** Clubs' cash, and with online top-ups the network revenue split in two. */
function revenueLines(report: DailyReport) {
  const totals = report.totals;
  if (!report.clubs.some((club) => club.online)) {
    return [
      `<b>${formatRub(totals.shiftRevenue.value)}</b> касса${arrow(totals.shiftRevenue)}`,
    ];
  }
  return [
    `<b>${formatRub(totals.revenue.value)}</b> выручка${arrow(totals.revenue)}`,
    `├ кассы клубов <b>${formatRub(totals.shiftRevenue.value)}</b>${arrow(totals.shiftRevenue)}`,
    `└ онлайн из приложения <b>${formatRub(totals.onlineTopups.value)}</b>${arrow(totals.onlineTopups)} · ${payments(totals.onlinePayments)}`,
  ];
}

function summarySection(report: DailyReport) {
  const first = report.clubs[0];
  const totals = report.totals;
  const guests = totals.guests.value;
  const visits = totals.visits.value;
  return [
    first
      ? `📊 <b>Сутки ${formatDayLabel(first)}</b>`
      : '📊 <b>Отчёт за сутки</b>',
    '<i>с 09:00 до 09:00 по времени клуба</i>',
    '',
    ...revenueLines(report),
    `<b>${formatRub(totals.barRevenue.value)}</b> бар${arrow(totals.barRevenue)} · маржа ${formatRub(totals.barMargin.value)}`,
    `<b>${wholeNumber(guests)}</b> ${pluralRu(guests, ['гость', 'гостя', 'гостей'])}${arrow(totals.guests)} · ${wholeNumber(visits)} ${pluralRu(visits, ['визит', 'визита', 'визитов'])} · ${wholeNumber(totals.playHours.value)} ч`,
    '<i>▲▼ к среднему за 7 суток</i>',
  ].join('\n');
}

function adminsSection(report: DailyReport) {
  const lines = ['👤 <b>Админы, ₽ в час</b>'];
  report.admins.forEach((admin, index) => {
    const usual = formatArrow(admin.vsUsual);
    lines.push(
      `${index + 1}. ${escapeHtml(shortPersonName(admin.name))} · ${wholeNumber(admin.revenuePerHour ?? 0)}${usual ? ` ${usual} к своему обычному` : ''}`,
    );
  });
  return lines.join('\n');
}

function guestLines(club: DailyReportClub) {
  const metrics = club.metrics;
  const load =
    club.load !== null ? `Загрузка ${formatPercent(club.load)} · ` : '';
  const guests = metrics.guests.value;
  if (metrics.visits.value === 0 && metrics.shiftRevenue.value > 0) {
    return [`${load}гостей 0 ⚠️ нет данных о гостях`];
  }
  const lines = [
    `${load}гостей <b>${wholeNumber(guests)}</b>${arrow(metrics.guests)}`,
  ];
  if (guests > 0) {
    const summary = club.guestSummary;
    const details = [
      `новых ${formatNumber(summary.newGuests)}`,
      `постоянных ${formatNumber(summary.regulars)}`,
    ];
    if (summary.averageVisitHours !== null) {
      details.push(`${formatNumber(summary.averageVisitHours)} ч за визит`);
    }
    if (summary.peakHour) {
      details.push(
        `пик в ${summary.peakHour}: ${formatNumber(summary.peakGuests)}${club.computerCount ? ` из ${formatNumber(club.computerCount)} ПК` : ''}`,
      );
    }
    lines.push(details.join(' · '));
  }
  return lines;
}

/** A collapsed Telegram quote: the title with the count, the items inside. */
function collapsedList(title: string, items: string[]) {
  const shown = items.slice(0, LIST_LIMIT);
  const rest = items.length - shown.length;
  return [
    `<blockquote expandable><b>${title} (${items.length})</b>`,
    ...shown,
    ...(rest > 0 ? [`и ещё ${rest}`] : []),
  ]
    .join('\n')
    .concat('</blockquote>');
}

function onlineLines(club: DailyReportClub) {
  const online = club.online;
  if (!online) return [];
  if (!online.sharedWith.length) {
    return [
      `Онлайн из приложения <b>${formatRub(online.amount.value)}</b>${arrow(online.amount)} · ${payments(online.payments)}`,
    ];
  }
  const others = online.sharedWith.map(escapeHtml);
  const peers =
    others.length > 1
      ? `${others.slice(0, -1).join(', ')} и ${others.at(-1)}`
      : others[0];
  return [
    `Онлайн из приложения <b>${formatRub(online.amount.value)}</b>${arrow(online.amount)}`,
    `<i>${formatPercent(online.share)} от ${formatRub(online.addressAmount)} (${payments(online.payments)}), общих с ${peers}: делим по гостям и среднему чеку</i>`,
  ];
}

function clubBlock(club: DailyReportClub) {
  const metrics = club.metrics;
  const lines: string[] = [
    `🏠 <b>${escapeHtml(club.name)}</b>`,
    ...(club.online
      ? [
          `Выручка <b>${formatRub(club.revenue.value)}</b>${arrow(club.revenue)}`,
        ]
      : []),
    `Касса <b>${formatRub(metrics.shiftRevenue.value)}</b>${arrow(metrics.shiftRevenue)} · бар <b>${formatRub(metrics.barRevenue.value)}</b>${arrow(metrics.barRevenue)}`,
    ...onlineLines(club),
    ...guestLines(club),
    '',
  ];
  if (club.shifts.length) {
    lines.push('<b>Смены</b>');
    club.shifts.forEach((shift) => {
      const time = `${shift.startedAt ?? '?'}–${shift.stoppedAt ?? 'не закрыта'}`;
      const perHour =
        shift.revenuePerHour !== null
          ? ` · ${formatRub(shift.revenuePerHour)}/ч`
          : '';
      lines.push(
        `${shift.closed ? '' : '⚠️ '}${time} ${escapeHtml(shortPersonName(shift.adminName))} · <b>${formatRub(shift.revenue)}</b>${perHour}`,
      );
    });
  } else {
    lines.push('⚠️ Смен за сутки нет в данных');
  }
  if (club.uncoveredPeriods.length) {
    lines.push(`⚠️ Без открытой смены: ${club.uncoveredPeriods.join(', ')}`);
  }
  if (club.topProducts.length) {
    lines.push(
      collapsedList(
        '🍫 Топ бара',
        club.topProducts.map(
          (item) =>
            `${escapeHtml(shortProductName(item.name))} · ${formatNumber(item.quantity)} шт · ${formatRub(item.revenue)}`,
        ),
      ),
    );
  }
  if (club.outOfStock.length) {
    lines.push(
      collapsedList(
        '🚫 Закончились',
        club.outOfStock.map((item) => escapeHtml(shortProductName(item.name))),
      ),
    );
  }
  if (club.runningOut.length) {
    lines.push(
      collapsedList(
        '⏳ Заканчиваются',
        club.runningOut.map(
          (item) =>
            `${escapeHtml(shortProductName(item.name))} · осталось ${formatNumber(item.quantity)} шт`,
        ),
      ),
    );
  }
  return lines.join('\n');
}

/**
 * The report as Telegram HTML messages, each under the message limit. The
 * first message is the network on one screen: totals, what needs attention,
 * the AI commentary and the admins. Each club follows in a message of its
 * own, sent without a sound.
 */
export function renderDailyReport(
  report: DailyReport,
  commentary: string | null,
): string[] {
  const sections = [summarySection(report)];
  if (report.alerts.length) {
    sections.push(
      [
        '⚠️ <b>Важно</b>',
        ...report.alerts.map((alert) => `• ${escapeHtml(alert)}`),
      ].join('\n'),
    );
  }
  if (commentary?.trim()) {
    sections.push(`🧠 <b>Разбор</b>\n${escapeHtml(commentary.trim())}`);
  }
  if (report.admins.length) sections.push(adminsSection(report));
  return [
    ...packMessages(sections),
    ...report.clubs.flatMap((club) => packMessages([clubBlock(club)])),
  ];
}

/** Joins sections into as few messages as fit, never splitting a section. */
export function packMessages(
  sections: string[],
  limit = TELEGRAM_MESSAGE_LIMIT,
) {
  const messages: string[] = [];
  let current = '';
  sections.forEach((section) => {
    const chunks =
      section.length > limit ? splitLongSection(section, limit) : [section];
    chunks.forEach((chunk) => {
      const next = current ? `${current}\n\n${chunk}` : chunk;
      if (next.length > limit && current) {
        messages.push(current);
        current = chunk;
      } else {
        current = next;
      }
    });
  });
  if (current) messages.push(current);
  return messages;
}

function splitLongSection(section: string, limit: number) {
  const chunks: string[] = [];
  let current = '';
  section.split('\n').forEach((line) => {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > limit && current) {
      chunks.push(current);
      current = line.slice(0, limit);
    } else {
      current = next.slice(0, limit);
    }
  });
  if (current) chunks.push(current);
  return chunks;
}
