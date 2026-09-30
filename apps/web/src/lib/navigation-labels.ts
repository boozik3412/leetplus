// What the route pill says while a page is opening. No runtime imports so the
// node:test suite can load it directly.

const ROUTE_LABELS: ReadonlyArray<readonly [prefix: string, label: string]> = [
  ["/dashboard/priorities", "Открываем приоритеты…"],
  ["/dashboard/revenue-by-club", "Открываем выручку по клубам…"],
  ["/dashboard/revenue-diagnostics", "Открываем диагностику выручки…"],
  ["/dashboard", "Открываем сводку сети…"],
  ["/assortment", "Открываем ассортимент…"],
  ["/reports", "Готовим отчёт…"],
  ["/products/table", "Готовим отчёт…"],
  ["/products/movement", "Готовим отчёт…"],
  ["/products", "Открываем товары…"],
  ["/guests/crm", "Открываем CRM гостей…"],
  ["/guests", "Открываем гостей…"],
  ["/staff/tasks", "Открываем задачи персонала…"],
  ["/staff/checklists", "Открываем чек-листы…"],
  ["/staff", "Открываем персонал…"],
  ["/gamification", "Открываем геймификацию…"],
  ["/marketing", "Открываем маркетинг…"],
  ["/categories", "Открываем категории…"],
  ["/suppliers", "Открываем поставщиков…"],
  ["/stores", "Открываем клубы…"],
  ["/users", "Открываем пользователей…"],
  ["/settings", "Открываем настройки…"],
  ["/support", "Открываем поддержку…"],
  ["/import", "Открываем импорт…"],
  ["/sync", "Открываем синхронизацию…"],
];

export const DEFAULT_NAVIGATION_LABEL = "Загружаем раздел…";

function startsWithSegment(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Pill text for a destination: the tree is named, other metrics are not. */
export function navigationLabel(pathname: string, search = "") {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/dashboard/executive-details") {
    return new URLSearchParams(search).get("metric") === "drivers"
      ? "Открываем дерево выручки…"
      : "Открываем детализацию…";
  }
  for (const [prefix, label] of ROUTE_LABELS) {
    if (startsWithSegment(path, prefix)) return label;
  }
  return DEFAULT_NAVIGATION_LABEL;
}
