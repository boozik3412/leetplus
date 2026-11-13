import type { UserRole } from "./roles";
import type { StaffTaskStore } from "./staff-tasks";

/**
 * Administrator rating as the API returns it (apps/api/src/staff/
 * staff-admin-rating.ts): 100 at the start of the period, minus escalations,
 * fines, warnings and overdue tasks, plus or minus the average check, and
 * the reviewer's decisions (forgiven items, bonuses and penalties).
 */
export type AdminRatingRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type AdminRatingItemKind =
  | "CHECKLIST_ESCALATED"
  | "FINE"
  | "WARNING"
  | "TASK_OVERDUE"
  | "AVERAGE_CHECK"
  | "MANUAL_BONUS"
  | "MANUAL_PENALTY";

/** Penalty items a reviewer may forgive. */
export const ADMIN_RATING_FORGIVABLE_KINDS: readonly AdminRatingItemKind[] = [
  "CHECKLIST_ESCALATED",
  "FINE",
  "WARNING",
  "TASK_OVERDUE",
];

/** A reviewer's decision: who, when and why. */
export type AdminRatingDecision = {
  adjustmentId: string;
  reason: string;
  authorName: string | null;
  at: string;
};

export type AdminRatingItem = {
  kind: AdminRatingItemKind;
  /** What counts in the score: 0 for a forgiven item. */
  points: number;
  /** The rule's points before a reviewer's decision. */
  basePoints: number;
  title: string;
  detail: string | null;
  date: string | null;
  href: string | null;
  targetId: string | null;
  forgiven: AdminRatingDecision | null;
  decision: AdminRatingDecision | null;
};

export type AdminRatingAverageCheck = {
  shiftKind: "DAY" | "NIGHT";
  shifts: number;
  average: number | null;
  clubAverage: number | null;
  deltaPercent: number | null;
  points: number;
};

export type AdminRatingCounts = {
  escalatedChecklists: number;
  fines: number;
  warnings: number;
  overdueTasks: number;
  forgiven: number;
  forgivenPoints: number;
  bonusPoints: number;
  penaltyPoints: number;
};

export const EMPTY_ADMIN_RATING_COUNTS: AdminRatingCounts = {
  escalatedChecklists: 0,
  fines: 0,
  warnings: 0,
  overdueTasks: 0,
  forgiven: 0,
  forgivenPoints: 0,
  bonusPoints: 0,
  penaltyPoints: 0,
};

export type AdminRatingUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  stores: StaffTaskStore[];
};

/** One administrator on «Операционная дисциплина» or «Рейтинг администраторов». */
export type AdminRatingView = {
  id: string;
  user: AdminRatingUser;
  score: number;
  riskLevel: AdminRatingRiskLevel;
  items: AdminRatingItem[];
  counts: AdminRatingCounts;
  averageCheck: {
    day: AdminRatingAverageCheck;
    night: AdminRatingAverageCheck;
  };
  linkedToLangame: boolean;
  shiftsTotal: number;
};

export const ADMIN_RATING_RULE_POINTS = {
  escalatedChecklist: 5,
  fine: 10,
  warning: 5,
  overdueTask: 3,
  averageCheckStepPercent: 5,
  averageCheckMaxPoints: 5,
  averageCheckMinShifts: 2,
  adjustmentMaxPoints: 10,
} as const;

export function canForgiveAdminRatingItem(item: AdminRatingItem) {
  return (
    ADMIN_RATING_FORGIVABLE_KINDS.includes(item.kind) &&
    Boolean(item.targetId) &&
    !item.forgiven
  );
}

export type AdminRatingAdjustmentBody =
  | {
      userId: string;
      kind: "FORGIVE";
      targetKind: AdminRatingItemKind;
      targetId: string;
      reason: string;
    }
  | {
      userId: string;
      kind: "BONUS" | "PENALTY";
      points: number;
      reason: string;
      occurredAt?: string;
    };

export const ADMIN_RATING_ADJUSTMENTS_URL =
  "/api/staff/administrator-ratings/adjustments";

export function adminRatingCancelUrl(adjustmentId: string) {
  return `${ADMIN_RATING_ADJUSTMENTS_URL}/${encodeURIComponent(adjustmentId)}/cancel`;
}

function pluralRu(value: number, forms: [string, string, string]) {
  const plural = new Intl.PluralRules("ru-RU").select(value);
  return forms[plural === "one" ? 0 : plural === "few" ? 1 : 2];
}

export function signedPoints(value: number) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

export function signedPercent(value: number) {
  if (value > 0) return `+${value}%`;
  if (value < 0) return `−${Math.abs(value)}%`;
  return "0%";
}

export type AdminRatingChip = {
  label: string;
  tone: "minus" | "plus" | "neutral";
};

/** Short reasons under the name: what moved the score, biggest first. */
export function adminRatingChips(row: AdminRatingView): AdminRatingChip[] {
  const chips: AdminRatingChip[] = [];
  const minus = (
    count: number,
    forms: [string, string, string],
    points: number,
  ) => {
    if (count <= 0) return;
    const word = pluralRu(count, forms);
    chips.push({
      label: `${count > 1 ? `${count} ` : ""}${word} ${signedPoints(-points * count)}`,
      tone: "minus",
    });
  };

  minus(
    row.counts.fines,
    ["штраф", "штрафа", "штрафов"],
    ADMIN_RATING_RULE_POINTS.fine,
  );
  minus(
    row.counts.escalatedChecklists,
    ["эскалация", "эскалации", "эскалаций"],
    ADMIN_RATING_RULE_POINTS.escalatedChecklist,
  );
  minus(
    row.counts.warnings,
    ["предупреждение", "предупреждения", "предупреждений"],
    ADMIN_RATING_RULE_POINTS.warning,
  );
  minus(
    row.counts.overdueTasks,
    ["просрочка", "просрочки", "просрочек"],
    ADMIN_RATING_RULE_POINTS.overdueTask,
  );

  if (row.counts.penaltyPoints > 0) {
    chips.push({
      label: `снижение ${signedPoints(-row.counts.penaltyPoints)}`,
      tone: "minus",
    });
  }

  [row.averageCheck.day, row.averageCheck.night].forEach((check) => {
    if (check.points === 0 || check.deltaPercent === null) return;
    chips.push({
      label: `чек ${check.shiftKind === "DAY" ? "днём" : "ночью"} ${signedPercent(check.deltaPercent)} · ${signedPoints(check.points)}`,
      tone: check.points > 0 ? "plus" : "minus",
    });
  });

  if (row.counts.bonusPoints > 0) {
    chips.push({
      label: `поощрение ${signedPoints(row.counts.bonusPoints)}`,
      tone: "plus",
    });
  }

  if (row.counts.forgiven > 0) {
    chips.push({
      label: `прощено ${row.counts.forgiven} · ${signedPoints(row.counts.forgivenPoints)}`,
      tone: "neutral",
    });
  }

  if (chips.length === 0) {
    chips.push({ label: "без замечаний", tone: "neutral" });
  }

  return chips;
}
