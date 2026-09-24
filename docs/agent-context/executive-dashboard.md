# Executive dashboard implementation context

Read for executive metrics, periods, revenue or priorities. These source contracts
were moved from root AGENTS.md; they are not evidence of deployment or current data coverage.
Verify affected code/schema and current observations before changing behavior.
Repository-relative paths below are entry points, not an instruction to read every file.
See [priority contract](../executive-dashboard-priorities.md) and [verification](verification.md).


- Source implementation map (verify affected code): `apps/api/src/dashboard/dashboard.controller.ts` даёт corporate JWT+role-guarded read-only `GET /dashboard/executive-summary`, `executive-operations` и `executive-product-revenue`; `DashboardService` нормализует scope через `FreshStoreScopeService`.
- Общий wire contract: API `apps/api/src/common/executive-contract.ts`, Web `apps/web/src/lib/dashboard-executive.ts`. `ExecutiveAppliedScope` возвращает принятые inclusive `YYYY-MM-DD` period, concrete `storeIds`, `storeTimeZones`, optional comparison и отдельный ISO `asOf`; `PER_STORE` — label mixed-zone scope, не IANA-зона для `Intl`.
- `ExecutiveMetric` всегда несёт `value|null`, state, reason, coverage, independent `factAsOf`, `lastCalculatedAt`, comparison и `ratio`; `MISSING`/`FAILED` не заменять нулём. Club/day details — агрегаты той же accepted scope, не чеки или отдельные сессии.
- Product revenue читает saved non-cancelled `SalesFact` только для подтверждённых store-days через `AssortmentHealthLoaderService.loadSalesCoverage`; fiscal-date labels сопоставляются без повторного timezone shift. `AVAILABLE` допускает доказанный ноль, `PARTIAL` — только подтверждённую часть.
- Сохранённые `GuestSession` дают лишь доказуемо привязанные visits и сейчас `PARTIAL` при наблюдениях: независимого store-day completeness proof нет, поэтому visit comparisons подавлены. Services, реальные topups и historical capacity/load не доказаны: остаются `MISSING`; revenue может показать лишь partial product component, а ARPV/product share/load не объявлять реальными ratio.
- `getExecutiveOperations` читает assortment отдельно; failure не ломает primary summary. Web `apps/web/src/app/(app)/dashboard/page.tsx` loads summary first, requests operations against accepted scope and discards scope mismatch; UI shows evidence/reason/coverage and builds only role-safe internal detail/report links.
- Entry UI: `/dashboard` uses shared `DashboardFilters`; `ExecutiveDashboard`, `executive-trend-chart.tsx` and `executive-club-table.tsx` render summary; `/dashboard/executive-details` re-queries the same scope and labels output as club/day aggregates. Transport accepts abort signal and throws `ExecutiveDashboardRequestError` for non-OK responses.
- ExecutiveDashboard is a client presentation boundary: its five KPI buttons choose the daily metric without a data request. The chart reads the corresponding saved `days[].metrics` values; ratio math stays on the API. Its «Подробнее» link preserves selected metric/scope and does not prefetch on each selection. The server page still authenticates and fetches scoped data.
- Period contract: `full-week` is the last seven completed days, ending yesterday. For `full-day`, keep one-day KPI/club/priority totals but load a separate 21-day chart via the existing custom executive-summary reader. `lib/executive-history.ts` preserves accepted clubs/timezones/asOf, checks exact scope and 21 ordered dates, and rejects failed/mismatched history without substituting the daily point. Chart details use the history range; `returnPeriod=full-day` restores the daily filter. The chart labels its own comparison range; KPI comparisons remain daily.
- Club table notes are collapsed by default behind «Пояснения»; short partial/missing/stale/failed labels stay visible. Confirmed values and zero have no repeated evidence footers in the compact view.
- Product pilot aliases (`tenantId`, `tenantSlug`, period fields and `selectedStoreIds`) remain compatibility data; new UI consumes `scope`. Legacy `/dashboard/summary` and assortment surfaces stay separate.


- Receipt metric contract: `averageProductCheck` дополняет executive contract; receipt grouping в `common/receipt-metrics.ts` проверяет namespace, fiscal-day ambiguity и отдельное покрытие операций/выручки. Web tolerates old API without that metric; five top cards remain unchanged.
- Staff priorities live in existing StaffModule (`staff-priorities.service.ts`), retain fresh NETWORK and source-feature permissions, read current server-time obligations, and expose exact paged details. Training caps produce lower bounds/unknown, not false zero. Independent Web Suspense slot does not delay primary dashboard. Contract and cross-module audit: `docs/executive-dashboard-priorities.md`.
