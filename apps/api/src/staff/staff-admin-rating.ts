/**
 * Administrator rating («Операционная дисциплина», «Рейтинг администраторов»).
 *
 * Every administrator starts the period with 100 points:
 * - each checklist passed to a manager (escalated) costs 5;
 * - each active fine costs 10, each active warning 5 (the amount is ignored);
 * - each task with a deadline in the period that was not closed in time costs 3;
 * - the average check of their Langame shifts moves the score both ways:
 *   day shifts are compared with the club's day shifts, night with night,
 *   1 point per full 5% difference, at most 5 points per shift kind.
 * A reviewer may also decide: forgive one penalty item (its points stop
 * counting, the item stays visible as «прощено»), or add a bonus / penalty of
 * 1–10 points with a reason (StaffAdminRatingAdjustment).
 * The result is kept between 0 and 100. Nothing else changes the score.
 */

export const ADMIN_RATING_START = 100;

export const ADMIN_RATING_RULES = {
  escalatedChecklist: 5,
  fine: 10,
  warning: 5,
  overdueTask: 3,
  averageCheckStepPercent: 5,
  averageCheckMaxPoints: 5,
  averageCheckMinShifts: 2,
  /** Largest bonus or penalty a reviewer may give in one decision. */
  adjustmentMaxPoints: 10,
  /** Club-local hour range [from, to) of a day shift start. */
  dayShiftFromHour: 8,
  dayShiftToHour: 20,
} as const;

export type AdminRatingShiftKind = 'DAY' | 'NIGHT';

export type AdminRatingRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type AdminRatingItemKind =
  | 'CHECKLIST_ESCALATED'
  | 'FINE'
  | 'WARNING'
  | 'TASK_OVERDUE'
  | 'AVERAGE_CHECK'
  | 'MANUAL_BONUS'
  | 'MANUAL_PENALTY';

/** Penalty items a reviewer may forgive. */
export const ADMIN_RATING_FORGIVABLE_KINDS = [
  'CHECKLIST_ESCALATED',
  'FINE',
  'WARNING',
  'TASK_OVERDUE',
] as const;

export type AdminRatingForgivableKind =
  (typeof ADMIN_RATING_FORGIVABLE_KINDS)[number];

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
  /** Checklist run, discipline record or task id of a forgivable item. */
  targetId: string | null;
  forgiven: AdminRatingDecision | null;
  /** A bonus or penalty given by a reviewer. */
  decision: AdminRatingDecision | null;
};

export type AdminRatingAverageCheck = {
  shiftKind: AdminRatingShiftKind;
  shifts: number;
  average: number | null;
  clubAverage: number | null;
  deltaPercent: number | null;
  points: number;
};

export type AdminRatingResult = {
  score: number;
  /** Before the 0–100 bounds; breaks ties between equal scores. */
  rawScore: number;
  riskLevel: AdminRatingRiskLevel;
  items: AdminRatingItem[];
  counts: {
    escalatedChecklists: number;
    fines: number;
    warnings: number;
    overdueTasks: number;
    /** Penalty items a reviewer forgave, and the points they gave back. */
    forgiven: number;
    forgivenPoints: number;
    bonusPoints: number;
    penaltyPoints: number;
  };
  averageCheck: {
    day: AdminRatingAverageCheck;
    night: AdminRatingAverageCheck;
  };
  linkedToLangame: boolean;
};

export type AdminRatingAdjustment = {
  id: string;
  kind: 'BONUS' | 'PENALTY' | 'FORGIVE';
  /** Signed: >0 for a bonus, <0 for a penalty, 0 for forgiveness. */
  points: number;
  targetKind: string | null;
  targetId: string | null;
  reason: string;
  at: Date;
  authorName: string | null;
};

export type AdminRatingEscalation = {
  id: string;
  title: string;
  at: Date;
  storeName: string | null;
  failedItems: number;
};

export type AdminRatingDisciplineRecord = {
  id: string;
  level: string;
  title: string;
  category: string;
  amount: number;
  at: Date;
};

export type AdminRatingTask = {
  id: string;
  title: string;
  status: string;
  dueAt: Date;
  completedAt: Date | null;
};

export type AdminRatingShift = {
  storeId: string | null;
  shiftKind: AdminRatingShiftKind;
  middleCheck: number;
};

export type AdminRatingInput = {
  now: Date;
  escalations: AdminRatingEscalation[];
  records: AdminRatingDisciplineRecord[];
  tasks: AdminRatingTask[];
  /** The administrator's own Langame shifts in the period. */
  shifts: AdminRatingShift[];
  /** Average check of every club shift kind, `${storeId}:${kind}`. */
  clubAverages: ReadonlyMap<string, number>;
  linkedToLangame: boolean;
  /** «Мотивация персонала» filtered to this person and period. */
  disciplineHref: string;
  /** Active reviewer decisions: bonuses and penalties of the period, and
   * forgiveness of any item. */
  adjustments?: AdminRatingAdjustment[];
  formatDate?: (value: Date) => string;
};

export function adminRatingShiftKind(
  clubLocalHour: number,
): AdminRatingShiftKind {
  return clubLocalHour >= ADMIN_RATING_RULES.dayShiftFromHour &&
    clubLocalHour < ADMIN_RATING_RULES.dayShiftToHour
    ? 'DAY'
    : 'NIGHT';
}

export function clubAverageKey(
  storeId: string | null,
  shiftKind: AdminRatingShiftKind,
) {
  return `${storeId ?? 'none'}:${shiftKind}`;
}

/** Average check of every club and shift kind. */
export function buildClubAverages(shifts: readonly AdminRatingShift[]) {
  const sums = new Map<string, { sum: number; count: number }>();
  shifts.forEach((shift) => {
    if (!(shift.middleCheck > 0)) return;
    const key = clubAverageKey(shift.storeId, shift.shiftKind);
    const current = sums.get(key) ?? { sum: 0, count: 0 };
    current.sum += shift.middleCheck;
    current.count += 1;
    sums.set(key, current);
  });
  return new Map(
    Array.from(sums.entries()).map(([key, value]) => [
      key,
      value.sum / value.count,
    ]),
  );
}

/** ±1 point per full 5% difference, at most ±5. */
export function averageCheckPoints(deltaPercent: number) {
  const steps = Math.trunc(
    deltaPercent / ADMIN_RATING_RULES.averageCheckStepPercent,
  );
  const points = Math.max(
    -ADMIN_RATING_RULES.averageCheckMaxPoints,
    Math.min(ADMIN_RATING_RULES.averageCheckMaxPoints, steps),
  );
  return points === 0 ? 0 : points;
}

function compareAverageCheck(
  shiftKind: AdminRatingShiftKind,
  shifts: readonly AdminRatingShift[],
  clubAverages: ReadonlyMap<string, number>,
): AdminRatingAverageCheck {
  const own = shifts.filter(
    (shift) => shift.shiftKind === shiftKind && shift.middleCheck > 0,
  );
  if (own.length === 0) {
    return {
      shiftKind,
      shifts: 0,
      average: null,
      clubAverage: null,
      deltaPercent: null,
      points: 0,
    };
  }
  const average =
    own.reduce((sum, shift) => sum + shift.middleCheck, 0) / own.length;
  // An administrator of several clubs is measured against the clubs they
  // actually worked in, weighted by their shifts there.
  const baselines = own
    .map((shift) => clubAverages.get(clubAverageKey(shift.storeId, shiftKind)))
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const clubAverage =
    baselines.length === own.length
      ? baselines.reduce((sum, value) => sum + value, 0) / baselines.length
      : null;
  // Whole percents, so the points always match the percent on the screen.
  const deltaPercent =
    clubAverage !== null
      ? Math.round(((average - clubAverage) / clubAverage) * 100)
      : null;
  const points =
    deltaPercent !== null &&
    own.length >= ADMIN_RATING_RULES.averageCheckMinShifts
      ? averageCheckPoints(deltaPercent)
      : 0;

  return {
    shiftKind,
    shifts: own.length,
    average: Math.round(average),
    clubAverage: clubAverage !== null ? Math.round(clubAverage) : null,
    deltaPercent,
    points,
  };
}

export function isTaskOverdue(task: AdminRatingTask, now: Date) {
  if (task.status === 'CANCELED') return false;
  if (task.status === 'DONE') {
    return Boolean(task.completedAt && task.completedAt > task.dueAt);
  }
  return task.dueAt < now;
}

export function adminRatingRiskLevel(score: number): AdminRatingRiskLevel {
  if (score < 65) return 'HIGH';
  if (score < 85) return 'MEDIUM';
  return 'LOW';
}

function defaultFormatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatRubles(value: number) {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(value))} ₽`;
}

function signedPercent(value: number) {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}%`;
}

function decisionOf(adjustment: AdminRatingAdjustment): AdminRatingDecision {
  return {
    adjustmentId: adjustment.id,
    reason: adjustment.reason,
    authorName: adjustment.authorName,
    at: adjustment.at.toISOString(),
  };
}

export function adminRatingTargetKey(kind: string, targetId: string) {
  return `${kind}:${targetId}`;
}

export function computeAdminRating(input: AdminRatingInput): AdminRatingResult {
  const format = input.formatDate ?? defaultFormatDate;
  const adjustments = input.adjustments ?? [];
  const forgiveness = new Map(
    adjustments
      .filter(
        (adjustment) =>
          adjustment.kind === 'FORGIVE' &&
          adjustment.targetKind &&
          adjustment.targetId,
      )
      .map((adjustment) => [
        adminRatingTargetKey(
          adjustment.targetKind ?? '',
          adjustment.targetId ?? '',
        ),
        adjustment,
      ]),
  );
  const items: AdminRatingItem[] = [];
  const pushPenalty = (
    item: Omit<
      AdminRatingItem,
      'points' | 'forgiven' | 'decision' | 'targetId'
    > & { targetId: string },
  ) => {
    const forgiven = forgiveness.get(
      adminRatingTargetKey(item.kind, item.targetId),
    );
    items.push({
      ...item,
      points: forgiven ? 0 : item.basePoints,
      forgiven: forgiven ? decisionOf(forgiven) : null,
      decision: null,
    });
  };

  input.escalations.forEach((run) => {
    pushPenalty({
      kind: 'CHECKLIST_ESCALATED',
      basePoints: -ADMIN_RATING_RULES.escalatedChecklist,
      targetId: run.id,
      title: `Чек-лист «${run.title}» передан руководителю`,
      detail: [
        format(run.at),
        run.storeName,
        run.failedItems > 0 ? `проблемных пунктов: ${run.failedItems}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      date: run.at.toISOString(),
      href: `/staff/checklists?runId=${encodeURIComponent(run.id)}#run-${run.id}`,
    });
  });

  input.records.forEach((record) => {
    const isFine = record.level.startsWith('FINE');
    const isWarning = record.level.startsWith('WARNING');
    if (!isFine && !isWarning) return;
    pushPenalty({
      kind: isFine ? 'FINE' : 'WARNING',
      basePoints: -(isFine
        ? ADMIN_RATING_RULES.fine
        : ADMIN_RATING_RULES.warning),
      targetId: record.id,
      title: `${isFine ? 'Штраф' : 'Предупреждение'} «${record.title}»`,
      detail: [
        format(record.at),
        record.category,
        isFine && record.amount > 0 ? formatRubles(record.amount) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      date: record.at.toISOString(),
      href: input.disciplineHref,
    });
  });

  const overdueTasks = input.tasks.filter((task) =>
    isTaskOverdue(task, input.now),
  );
  overdueTasks.forEach((task) => {
    pushPenalty({
      kind: 'TASK_OVERDUE',
      basePoints: -ADMIN_RATING_RULES.overdueTask,
      targetId: task.id,
      title: `Задача «${task.title}» не сделана в срок`,
      detail:
        task.status === 'DONE' && task.completedAt
          ? `срок ${format(task.dueAt)} · выполнена ${format(task.completedAt)}`
          : `срок ${format(task.dueAt)} · ещё не закрыта`,
      date: task.dueAt.toISOString(),
      href: `/staff/tasks?taskId=${encodeURIComponent(task.id)}&pageSize=200#task-${task.id}`,
    });
  });

  const day = compareAverageCheck('DAY', input.shifts, input.clubAverages);
  const night = compareAverageCheck('NIGHT', input.shifts, input.clubAverages);
  [day, night].forEach((check) => {
    if (check.points === 0 || check.average === null) return;
    items.push({
      kind: 'AVERAGE_CHECK',
      points: check.points,
      basePoints: check.points,
      title: `Средний чек, ${check.shiftKind === 'DAY' ? 'дневные' : 'ночные'} смены`,
      detail: `${check.shifts} смен · ${formatRubles(check.average)} против ${formatRubles(check.clubAverage ?? 0)} по клубу · ${signedPercent(check.deltaPercent ?? 0)}`,
      date: null,
      href: null,
      targetId: null,
      forgiven: null,
      decision: null,
    });
  });

  adjustments.forEach((adjustment) => {
    if (adjustment.kind === 'FORGIVE' || adjustment.points === 0) return;
    const isBonus = adjustment.points > 0;
    items.push({
      kind: isBonus ? 'MANUAL_BONUS' : 'MANUAL_PENALTY',
      points: adjustment.points,
      basePoints: adjustment.points,
      title: isBonus ? 'Поощрение' : 'Снижение',
      detail: [
        `«${adjustment.reason}»`,
        adjustment.authorName,
        format(adjustment.at),
      ]
        .filter(Boolean)
        .join(' · '),
      date: adjustment.at.toISOString(),
      href: null,
      targetId: null,
      forgiven: null,
      decision: decisionOf(adjustment),
    });
  });

  // Newest first inside each kind; the average check and the reviewer's
  // bonuses and penalties close the list.
  const kindOrder: Record<AdminRatingItemKind, number> = {
    CHECKLIST_ESCALATED: 0,
    FINE: 1,
    WARNING: 2,
    TASK_OVERDUE: 3,
    AVERAGE_CHECK: 4,
    MANUAL_BONUS: 5,
    MANUAL_PENALTY: 6,
  };
  items.sort(
    (a, b) =>
      kindOrder[a.kind] - kindOrder[b.kind] ||
      (b.date ?? '').localeCompare(a.date ?? ''),
  );

  const rawScore =
    ADMIN_RATING_START + items.reduce((sum, item) => sum + item.points, 0);
  const score = Math.max(0, Math.min(ADMIN_RATING_START, rawScore));

  const counted = (kind: AdminRatingItemKind) =>
    items.filter((item) => item.kind === kind && !item.forgiven).length;
  const forgivenItems = items.filter((item) => item.forgiven);

  return {
    score,
    rawScore,
    riskLevel: adminRatingRiskLevel(score),
    items,
    counts: {
      escalatedChecklists: counted('CHECKLIST_ESCALATED'),
      fines: counted('FINE'),
      warnings: counted('WARNING'),
      overdueTasks: counted('TASK_OVERDUE'),
      forgiven: forgivenItems.length,
      forgivenPoints: forgivenItems.reduce(
        (sum, item) => sum - item.basePoints,
        0,
      ),
      bonusPoints: items
        .filter((item) => item.kind === 'MANUAL_BONUS')
        .reduce((sum, item) => sum + item.points, 0),
      penaltyPoints: items
        .filter((item) => item.kind === 'MANUAL_PENALTY')
        .reduce((sum, item) => sum - item.points, 0),
    },
    averageCheck: { day, night },
    linkedToLangame: input.linkedToLangame,
  };
}
