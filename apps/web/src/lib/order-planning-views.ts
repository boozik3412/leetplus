// Shared by the server page (reads ?view=) and the client table.
export const ORDER_PLANNING_VIEWS = [
  "order",
  "out-of-stock",
  "running-out",
  "no-movement",
  "forecast",
  "movement",
  "excess",
  "all",
] as const;

export type OrderPlanningView = (typeof ORDER_PLANNING_VIEWS)[number];

export function isOrderPlanningView(
  value: string | undefined,
): value is OrderPlanningView {
  return ORDER_PLANNING_VIEWS.includes(value as OrderPlanningView);
}
