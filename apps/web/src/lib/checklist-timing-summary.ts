import type {
  StaffChecklistAnswerTiming,
  StaffChecklistRun,
} from "./staff-checklists";

export type ChecklistTimingSummary = {
  /** Items with a planned time that can be judged (has an anchor). */
  total: number;
  /** Done on time or earlier. */
  onTime: number;
  /** Done late, or the window passed without a mark. */
  late: number;
};

/**
 * «В срок» on a checklist run: every item with a planned time, the same
 * items that show «вовремя к …» / «позже плана …». The «Дисц.» switch of an
 * item only decides whether lateness counts in discipline reports.
 */
export function checklistTimingSummary(
  run: Pick<StaffChecklistRun, "answers" | "itemTimings">,
): ChecklistTimingSummary {
  const timings: StaffChecklistAnswerTiming[] = run.itemTimings
    ? run.itemTimings.map((row) => row.timing)
    : run.answers.flatMap((answer) => (answer.timing ? [answer.timing] : []));
  const summary: ChecklistTimingSummary = { total: 0, onTime: 0, late: 0 };

  timings.forEach((timing) => {
    if (timing.status === "NO_ANCHOR" || timing.status === "NOT_CONFIGURED") {
      return;
    }
    summary.total += 1;
    if (timing.status === "ON_TIME" || timing.status === "EARLY") {
      summary.onTime += 1;
    } else if (timing.status === "LATE" || timing.status === "MISSED") {
      summary.late += 1;
    }
  });

  return summary;
}
