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
  | 'AVERAGE_CHECK';

export type AdminRatingItem = {
  kind: AdminRatingItemKind;
  points: number;
  title: string;
  detail: string | null;
  date: string | null;
  href: string | null;
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
  };
  averageCheck: {
    day: AdminRatingAverageCheck;
    night: AdminRatingAverageCheck;
  };
  linkedToLangame: boolean;
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

export function computeAdminRating(input: AdminRatingInput): AdminRatingResult {
  const format = input.formatDate ?? defaultFormatDate;
  const items: AdminRatingItem[] = [];

  input.escalations.forEach((run) => {
    items.push({
      kind: 'CHECKLIST_ESCALATED',
      points: -ADMIN_RATING_RULES.escalatedChecklist,
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

  let fines = 0;
  let warnings = 0;
  input.records.forEach((record) => {
    const isFine = record.level.startsWith('FINE');
    const isWarning = record.level.startsWith('WARNING');
    if (!isFine && !isWarning) return;
    if (isFine) fines += 1;
    if (isWarning) warnings += 1;
    items.push({
      kind: isFine ? 'FINE' : 'WARNING',
      points: -(isFine ? ADMIN_RATING_RULES.fine : ADMIN_RATING_RULES.warning),
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
    items.push({
      kind: 'TASK_OVERDUE',
      points: -ADMIN_RATING_RULES.overdueTask,
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
      title: `Средний чек, ${check.shiftKind === 'DAY' ? 'дневные' : 'ночные'} смены`,
      detail: `${check.shifts} смен · ${formatRubles(check.average)} против ${formatRubles(check.clubAverage ?? 0)} по клубу · ${signedPercent(check.deltaPercent ?? 0)}`,
      date: null,
      href: null,
    });
  });

  // Newest first inside each kind; the average check closes the list.
  const kindOrder: Record<AdminRatingItemKind, number> = {
    CHECKLIST_ESCALATED: 0,
    FINE: 1,
    WARNING: 2,
    TASK_OVERDUE: 3,
    AVERAGE_CHECK: 4,
  };
  items.sort(
    (a, b) =>
      kindOrder[a.kind] - kindOrder[b.kind] ||
      (b.date ?? '').localeCompare(a.date ?? ''),
  );

  const rawScore =
    ADMIN_RATING_START + items.reduce((sum, item) => sum + item.points, 0);
  const score = Math.max(0, Math.min(ADMIN_RATING_START, rawScore));

  return {
    score,
    rawScore,
    riskLevel: adminRatingRiskLevel(score),
    items,
    counts: {
      escalatedChecklists: input.escalations.length,
      fines,
      warnings,
      overdueTasks: overdueTasks.length,
    },
    averageCheck: { day, night },
    linkedToLangame: input.linkedToLangame,
  };
}
