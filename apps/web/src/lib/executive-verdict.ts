// One-sentence answer to «как дела» above the dashboard (UX plan, step 1.5).
// It only restates numbers the API already confirmed; runtime imports carry
// their extension so the node:test suite can load this file directly.
import type {
  ExecutiveDriverFactor,
  ExecutiveMetric,
  ExecutiveSummary,
} from "./dashboard-executive";
import { mainLever, silentClubs } from "./executive-driver-rules.ts";
import { formatDay, formatNumber, formatRange } from "./executive-format.ts";
import { clubDropSignals } from "./executive-priority-rules.ts";

/** Changes smaller than this (percent) read as «на уровне». */
export const VERDICT_FLAT_PERCENT = 1;

export type ExecutiveVerdictTone = "up" | "down" | "flat" | "unknown";

export type ExecutiveVerdict = {
  tone: ExecutiveVerdictTone;
  text: string;
};

const gainPhrase: Record<ExecutiveDriverFactor, string> = {
  VISITS: "больше визитов",
  CONVERSION: "в баре покупают чаще",
  PURCHASES: "больше покупок",
  CHECK: "средний чек вырос",
};

const lossPhrase: Record<ExecutiveDriverFactor, string> = {
  VISITS: "меньше визитов",
  CONVERSION: "в баре покупают реже",
  PURCHASES: "меньше покупок",
  CHECK: "средний чек упал",
};

function percentText(value: number) {
  const abs = Math.abs(value);
  return `${formatNumber(abs, abs < 10 ? 1 : 0)}%`;
}

function revenueSentence(
  metric: ExecutiveMetric,
  subject: string,
  against: string | null,
): { tone: ExecutiveVerdictTone; text: string } {
  if (
    metric.value === null ||
    metric.state === "MISSING" ||
    metric.state === "FAILED"
  ) {
    return {
      tone: "unknown",
      text: "Продажи за этот период ещё не подтверждены, вывод появится после загрузки данных из Langame.",
    };
  }

  const partial = metric.state === "PARTIAL" ? " по подтверждённым дням" : "";

  if (!against) {
    return {
      tone: "unknown",
      text: `${subject}${partial} без сравнения: сравнение с прошлым периодом выключено.`,
    };
  }

  const percent = metric.comparison?.percentDelta;

  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    return {
      tone: "unknown",
      text: `${subject}${partial} не с чем сравнить: за ${against} нет подтверждённых продаж.`,
    };
  }

  if (Math.abs(percent) < VERDICT_FLAT_PERCENT) {
    return {
      tone: "flat",
      text: `${subject}${partial} на уровне ${against}.`,
    };
  }

  return percent > 0
    ? {
        tone: "up",
        text: `${subject}${partial} на ${percentText(percent)} выше, чем ${against}.`,
      }
    : {
        tone: "down",
        text: `${subject}${partial} на ${percentText(percent)} ниже, чем ${against}.`,
      };
}

function leverSentence(summary: ExecutiveSummary): string | null {
  const network = summary.drivers?.rows.find((row) => row.scope === "NETWORK");
  const lever = network ? mainLever(network) : null;

  if (!lever) {
    return null;
  }

  return lever.kind === "LOSS"
    ? `Главная причина: ${lossPhrase[lever.factor]}.`
    : `Главный вклад: ${gainPhrase[lever.factor]}.`;
}

function clubSentence(summary: ExecutiveSummary): string | null {
  // A club without sales is a data question, not a decline: the priority
  // list suppresses its drop signal, and so does the verdict.
  const silent = silentClubs(summary);
  const silentIds = new Set(silent.map((club) => club.storeId));
  const [worst] = clubDropSignals(summary)
    .filter((signal) => !silentIds.has(signal.storeId))
    .sort((left, right) => left.percentDelta - right.percentDelta);

  if (worst) {
    return `Сильнее всего просел ${worst.storeName}: на ${percentText(worst.percentDelta)}.`;
  }

  const [unexplained] = silent.filter((club) => club.closure === null);

  return unexplained
    ? `${unexplained.storeName} без продаж с ${formatDay(unexplained.since)}.`
    : null;
}

/**
 * Revenue against the comparison period, then the factor behind the change
 * and the club that needs a look. A missing or partial figure is never
 * presented as confirmed, and no comparison is invented.
 */
export function executiveVerdict(
  summary: ExecutiveSummary,
  key: "revenue" | "productRevenue",
): ExecutiveVerdict {
  const metric = summary.metrics[key];
  const subject = key === "revenue" ? "Выручка" : "Выручка бара";
  const against = summary.scope.comparison
    ? formatRange(summary.scope.comparison.from, summary.scope.comparison.to)
    : null;
  const revenue = revenueSentence(metric, subject, against);

  if (revenue.tone === "unknown" && metric.value === null) {
    return revenue;
  }

  const parts = [
    revenue.text,
    revenue.tone === "unknown" ? null : leverSentence(summary),
    clubSentence(summary),
  ].filter((part): part is string => Boolean(part));

  return { tone: revenue.tone, text: parts.join(" ") };
}
