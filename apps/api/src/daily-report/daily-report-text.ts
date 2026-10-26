import {
  formatChange,
  formatNumber,
  formatPercent,
  formatRub,
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

function withChange(text: string, metric: DailyReportMetric) {
  const change = formatChange(metric.change);
  return change ? `${text} (${change})` : text;
}

function formatDayLabel(club: DailyReportClub) {
  const [, month, day] = club.reportDate.split('-');
  const previous = new Date(`${club.reportDate}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const prevDay = String(previous.getUTCDate()).padStart(2, '0');
  const prevMonth = String(previous.getUTCMonth() + 1).padStart(2, '0');
  return `${prevDay}.${prevMonth} 09:00 — ${day}.${month} 09:00`;
}

function guestLine(club: DailyReportClub) {
  const summary = club.guestSummary;
  const metrics = club.metrics;
  const parts = [
    withChange(
      `🎮 Гости: ${formatNumber(metrics.guests.value)}`,
      metrics.guests,
    ),
  ];
  if (metrics.guests.value > 0) {
    parts.push(
      `новых ${formatNumber(summary.newGuests)}, постоянных ${formatNumber(summary.regulars)}`,
    );
    if (summary.averageVisitHours !== null) {
      parts.push(
        `в среднем ${formatNumber(summary.averageVisitHours)} ч за визит`,
      );
    }
    if (summary.peakHour) {
      parts.push(
        `пик в ${summary.peakHour}: ${formatNumber(summary.peakGuests)}${club.computerCount ? ` из ${formatNumber(club.computerCount)} ПК` : ' одновременно'}`,
      );
    }
  }
  return parts.join('; ');
}

function clubBlock(club: DailyReportClub) {
  const lines: string[] = [];
  const metrics = club.metrics;
  lines.push(`<b>${escapeHtml(club.name)}</b>`);
  const head = [
    withChange(
      `касса ${formatRub(metrics.shiftRevenue.value)}`,
      metrics.shiftRevenue,
    ),
    withChange(
      `бар ${formatRub(metrics.barRevenue.value)}`,
      metrics.barRevenue,
    ),
  ];
  if (club.load !== null) head.push(`загрузка ${formatPercent(club.load)}`);
  lines.push(head.join(', '));
  lines.push(guestLine(club));

  if (club.shifts.length) {
    lines.push('Смены:');
    club.shifts.forEach((shift) => {
      const time = `${shift.startedAt ?? '?'}–${shift.stoppedAt ?? 'не закрыта'}`;
      const parts = [
        `${escapeHtml(shift.adminName)} ${time}`,
        formatRub(shift.revenue),
      ];
      if (shift.revenuePerHour !== null) {
        parts.push(`${formatRub(shift.revenuePerHour)}/ч`);
      }
      lines.push(`${shift.closed ? '•' : '⚠️'} ${parts.join(' · ')}`);
    });
  } else {
    lines.push('⚠️ Смен за сутки нет в данных');
  }
  if (club.uncoveredPeriods.length) {
    lines.push(`⚠️ Без открытой смены: ${club.uncoveredPeriods.join(', ')}`);
  }
  if (club.topProducts.length) {
    lines.push(
      `Топ бара: ${club.topProducts
        .map(
          (item) =>
            `${escapeHtml(item.name)} — ${formatNumber(item.quantity)} шт, ${formatRub(item.revenue)}`,
        )
        .join('; ')}`,
    );
  }
  if (club.outOfStock.length) {
    lines.push(
      `Закончились: ${club.outOfStock.map((item) => escapeHtml(item.name)).join(', ')}`,
    );
  }
  if (club.runningOut.length) {
    lines.push(
      `Заканчиваются: ${club.runningOut
        .map(
          (item) =>
            `${escapeHtml(item.name)} (${formatNumber(item.quantity)} шт)`,
        )
        .join(', ')}`,
    );
  }
  return lines.join('\n');
}

/**
 * The report as Telegram HTML parts, each under the message limit. The
 * commentary, when present, comes right after the network summary: the owner
 * reads the conclusions first and the per-club detail below.
 */
export function renderDailyReport(
  report: DailyReport,
  commentary: string | null,
): string[] {
  const sections: string[] = [];
  const first = report.clubs[0];
  const totals = report.totals;
  const title = first
    ? `📊 <b>Отчёт за сутки ${formatDayLabel(first)}</b>`
    : '📊 <b>Отчёт за сутки</b>';
  const zones = new Set(report.clubs.map((club) => club.timeZone));
  sections.push(
    [
      title,
      zones.size > 1 ? '<i>Время каждого клуба — местное.</i>' : null,
      '',
      withChange(
        `💰 Касса: ${formatRub(totals.shiftRevenue.value)}`,
        totals.shiftRevenue,
      ),
      withChange(
        `🥤 Бар: ${formatRub(totals.barRevenue.value)}, маржа ${formatRub(totals.barMargin.value)}`,
        totals.barRevenue,
      ),
      withChange(
        `🎮 Гости: ${formatNumber(totals.guests.value)}, визитов ${formatNumber(totals.visits.value)}, ${formatNumber(Math.round(totals.playHours.value))} ч игры`,
        totals.guests,
      ),
      '<i>В скобках — к среднему за прошлые 7 суток.</i>',
    ]
      .filter((line) => line !== null)
      .join('\n'),
  );

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
  report.clubs.forEach((club) => sections.push(clubBlock(club)));
  if (report.admins.length) {
    const lines = ['👤 <b>Админы, выручка в час</b>'];
    report.admins.forEach((admin, index) => {
      const compare = [
        admin.vsNetwork !== null
          ? `${formatChange(admin.vsNetwork)} к среднему по сети`
          : null,
        admin.vsUsual !== null
          ? `${formatChange(admin.vsUsual)} к своему обычному`
          : null,
      ].filter(Boolean);
      lines.push(
        `${index + 1}. ${escapeHtml(admin.name)} — ${formatRub(admin.revenuePerHour ?? 0)}/ч${compare.length ? ` (${compare.join(', ')})` : ''}`,
      );
    });
    sections.push(lines.join('\n'));
  }
  return packMessages(sections);
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
