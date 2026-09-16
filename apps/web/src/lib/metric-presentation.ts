import type { DashboardExecutiveProductRevenue } from "@/lib/dashboard-executive";

type ProductRevenueMetric = DashboardExecutiveProductRevenue["metric"];

export type ProductRevenueMetricPresentation = {
  value: string;
  status: "neutral" | "warning" | "danger";
  message: string | null;
  coverage: string | null;
  sourceDate: string | null;
};

function formatRubles(value: number) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value)} ₽`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function presentExecutiveProductRevenueMetric(
  metric: ProductRevenueMetric,
): ProductRevenueMetricPresentation {
  const coverage = metric.coverage;

  return {
    value: metric.value === null ? "—" : formatRubles(metric.value),
    status:
      metric.state === "FAILED"
        ? "danger"
        : metric.state === "PARTIAL" || metric.state === "MISSING"
          ? "warning"
          : "neutral",
    message: metric.reason,
    coverage:
      coverage?.total !== null && coverage?.total !== undefined
        ? `Продажи подтверждены для ${coverage.covered} из ${coverage.total} клубо-дней.`
        : null,
    sourceDate: metric.factAsOf
      ? `Последняя сохранённая продажа: ${formatDate(metric.factAsOf)}.`
      : null,
  };
}
