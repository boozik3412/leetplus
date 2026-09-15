import type { ExecutiveMetric } from "./dashboard-executive";

/** A missing/partial period or disabled comparison is not evidence of decline. */
export function hasConfirmedDecline(
  metric: ExecutiveMetric | undefined,
): boolean {
  return (
    metric?.state === "AVAILABLE" &&
    metric.value !== null &&
    Number.isFinite(metric.value) &&
    typeof metric.comparison?.previousValue === "number" &&
    Number.isFinite(metric.comparison.previousValue) &&
    typeof metric.comparison.absoluteDelta === "number" &&
    Number.isFinite(metric.comparison.absoluteDelta) &&
    metric.comparison.absoluteDelta < 0
  );
}

export function priorityCount(
  value: number,
  unit: "TASKS" | "CHECKLISTS" | "EMPLOYEES",
) {
  const forms = {
    TASKS: ["задача", "задачи", "задач"],
    CHECKLISTS: ["чек-лист", "чек-листа", "чек-листов"],
    EMPLOYEES: ["сотрудник", "сотрудника", "сотрудников"],
  }[unit];
  const plural = new Intl.PluralRules("ru-RU").select(value);
  return `${new Intl.NumberFormat("ru-RU").format(value)} ${forms[plural === "one" ? 0 : plural === "few" ? 1 : 2]}`;
}
