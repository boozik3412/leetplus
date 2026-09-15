# LeetPlus repository context

Before changing authentication, landing/redirects, access scope, the public
game, gamification administration, integrations, background jobs or deployment,
read `docs/security/runtime-security-contours.md` completely. It is the
canonical boundary contract and current-state handoff for those areas.

## Required invariants

- Treat public guest, corporate tenant and unattended worker traffic as three
  different security/execution contours. Do not solve a problem in one contour
  by applying its guards, JWT, locks, rate limits, secrets or module graph to
  another contour.
- Public guest HTTP is `/guest-portal*` and public guest media. It uses the
  guest session/profile identity and must not depend on corporate `AuthModule`,
  staff scope or corporate JWT. There is no application-wide concurrent-user
  limit for this contour.
- `/guests/gamification*` is tenant-authenticated game administration, not
  public guest HTTP. It stays in the corporate contour with capabilities and
  fresh tenant scope. Public gameplay must remain available when this B2B
  contour is saturated or denied.
- Background schedulers, delivery consumers and service-token endpoints are
  worker/control-plane responsibilities. The public guest API runtime must not
  register them.
- Scope every guest-auth reservation, advisory lock, cleanup and poll lease to
  the smallest exact identity described in the canonical contract. Never add a
  global cleanup, mutex or shared corporate throttle to fix a single challenge.
- A successful login must land a role on a supported page before that page
  fetches restricted APIs. Do not widen capabilities to make a wrong landing
  page work. Platform admin without signed tenant context belongs to
  `/administration`.
- Web may remain localhost-only, but API egress needed for Langame, SMTP, SMS
  and approved providers must be explicit. Never copy the Web network sandbox
  onto an API/worker without a dependency-by-dependency egress review.
- `main` is source, not proof of production state. Production changes require
  one exact admitted SHA, immutable handoff and a separate explicit production
  GO. The dormant split-runtime candidate must not be installed manually.
- Run independent local and CI verification gates as one bounded batch that
  preserves a separate output log and exit code for every gate, then report all
  failures from that pass together. Fail fast only at an effect boundary where
  continuing could mutate production, invalidate evidence, or make later
  results unsafe to interpret. Before retrying a failed gate, read the durable
  error log and record the changed condition; never restart an unchanged full
  batch merely to discover one failure at a time.
- Keep that append-only journal at
  `deploy-evidence/<operation>/ERROR_LOG.md`. Read its complete current content
  before every retry and every production command; a retry is permitted only
  after the observed failure, cause and changed condition are recorded.

If a change alters any route ownership, identity, secret, process, database
role, scheduler placement, provider egress or rollout state, update
`docs/security/runtime-security-contours.md` and the current open-beta status in
the same change.

<!-- autopilot:start -->
## Ассортимент: готовое состояние исходного кода

- Входы — защищённые CSV imports товаров, остатков, продаж и движений, а также сохранённые интеграционные факты; они заполняют каталог, `InventorySnapshot`, `SalesFact`, `StockMovement`, покрытие и конфигурации цен.
- Обычный INTERNAL daily обновляет inventory ежедневно даже при закрытом QUICK; только недавний повтор подавляется при success AUTO INVENTORY всех активных доменов за 1 час. Это не порог качества данных: freshness остаётся 36 часов. Inventory-only run не двигает sales cursor.
- `resolveGuestSessionStore` доказывает Store по полной топологии tenant; вызывающий код затем применяет permissions. Inferred binding не меняет historical timestamps или parser timezone.
- Общие точки реализации — `apps/api/src/common/assortment-health.ts`, `assortment-health-loader.service.ts` и `guest-session-store.ts`; loader строит доказанные store×product grains и передаёт факты в pure `buildAssortmentHealth`.
- Устойчивые границы engine: `AssortmentHealth`/`AssortmentHealthRow` и `AssortmentMetric<T>` с `value|null`, `state`, `reason`, `coverage`, `asOf`; денежные оценки дополнительно несут `basis`.
- Отсутствующие данные остаются `null`/`UNKNOWN`, известный ноль остаётся нулём, а `PARTIAL` не становится точным итогом; Web показывает причину и coverage у конкретной карточки.
- Cutoff запроса — `selectedAssortmentAsOf`/report `asOf`; `inventory.asOf` — отдельная дата наблюдения остатка и не переносится как cutoff.
- `DashboardService` добавляет summary в `GET /dashboard/summary`, а `ReportsService` использует те же row sets для `operations`, `inventory-turnover` и `replenishment` вместе с scoped rows и write-off details.
- Web transport находится в `apps/web/src/lib/dashboard-summary.ts` и `apps/web/src/lib/reports.ts`; `/assortment/dashboard`, `/reports` и table pages сохраняют `from`, `to`, repeated `storeIds`/`categoryIds`, `asOf`, `noSalesDays` и subset URL.
- Карточки ассортимента кликабельны: OOS/low-stock/no-sales ведут в отчёты, turnover/excess — в inventory-turnover, а списания — в movement table с `subset=write-offs`.
- OOS `grossProfitAtRisk` хранит дневную/периодную оценку и cost basis: известная себестоимость позволяет расчёт, sale-price valuation не становится cost, отсутствие подтверждения остаётся null.
- Команды из package: `pnpm dev`, `pnpm --filter api start:dev`, `pnpm --filter web dev`, API `tsc --noEmit -p tsconfig.build.json` и Web `typecheck`/`build` через соответствующий filter.
- Один API test file: `pnpm.cmd --filter api exec jest --runInBand --runTestsByPath src/common/assortment-health.spec.ts`.
- Синтетическая UI QA использует fixture `localhost:4311` и Next `localhost:4312` через `API_URL` и `PORT` с `pnpm --filter web start`; это не обычный dev или production запуск.
- Источник и production proof определяются canonical deployment documentation, а не веткой или наличием исходного кода.

## Сводный дашборд: исходный код

- Исходное состояние на 15.09.2026: `apps/api/src/dashboard/dashboard.controller.ts` даёт corporate JWT+role-guarded read-only `GET /dashboard/executive-summary`, `executive-operations` и `executive-product-revenue`; `DashboardService` нормализует scope через `FreshStoreScopeService`.
- Общий wire contract: API `apps/api/src/common/executive-contract.ts`, Web `apps/web/src/lib/dashboard-executive.ts`. `ExecutiveAppliedScope` возвращает принятые inclusive `YYYY-MM-DD` period, concrete `storeIds`, `storeTimeZones`, optional comparison и отдельный ISO `asOf`; `PER_STORE` — label mixed-zone scope, не IANA-зона для `Intl`.
- `ExecutiveMetric` всегда несёт `value|null`, state, reason, coverage, independent `factAsOf`, `lastCalculatedAt`, comparison и `ratio`; `MISSING`/`FAILED` не заменять нулём. Club/day details — агрегаты той же accepted scope, не чеки или отдельные сессии.
- Product revenue читает saved non-cancelled `SalesFact` только для подтверждённых store-days через `AssortmentHealthLoaderService.loadSalesCoverage`; fiscal-date labels сопоставляются без повторного timezone shift. `AVAILABLE` допускает доказанный ноль, `PARTIAL` — только подтверждённую часть.
- Сохранённые `GuestSession` дают лишь доказуемо привязанные visits и сейчас `PARTIAL` при наблюдениях: независимого store-day completeness proof нет, поэтому visit comparisons подавлены. Services, реальные topups и historical capacity/load не доказаны: остаются `MISSING`; revenue может показать лишь partial product component, а ARPV/product share/load не объявлять реальными ratio.
- `getExecutiveOperations` читает assortment отдельно; failure не ломает primary summary. Web `apps/web/src/app/(app)/dashboard/page.tsx` loads summary first, requests operations against accepted scope and discards scope mismatch; UI shows evidence/reason/coverage and builds only role-safe internal detail/report links.
- Entry UI: `/dashboard` uses shared `DashboardFilters`; `ExecutiveDashboard`, `executive-trend-chart.tsx` and `executive-club-table.tsx` render summary; `/dashboard/executive-details` re-queries the same scope and labels output as club/day aggregates. Transport accepts abort signal and throws `ExecutiveDashboardRequestError` for non-OK responses.
- Product pilot aliases (`tenantId`, `tenantSlug`, period fields and `selectedStoreIds`) remain compatibility data; new UI consumes `scope`. Legacy `/dashboard/summary` and assortment surfaces stay separate.

## Проверенные локальные gates и среда

- Executive dashboard changes are source-only until an exact release is admitted; source HEAD and runtime state must be checked independently.
- Passed receipt: cached pnpm `10.33.2`, root API `pnpm --filter api exec jest --runInBand` — 192 suites / 3571 tests; не повторять без изменения кода. Focused API file: `pnpm.cmd --filter api exec jest --runInBand --runTestsByPath src/dashboard/dashboard.service.spec.ts`.
- Web `pnpm --filter web typecheck` and `pnpm --filter web build` passed. ESLint was run only on changed files through direct `node.exe` from `apps/web`; this is not a claim that an unrestricted full-project lint passed. App Router paths containing parentheses must be literal; filtered pnpm changes cwd, so root-relative glob patterns are invalid there.
- Local PG fixture is PostgreSQL 16.13 on `127.0.0.1:55495`, baseline 15/15 and final scoped HTTP acceptance 16/16 passed with CLI `testTimeout=30000`; the fixture was stopped after acceptance and is not production DB. Use `DATABASE_URL` only by name and never record its value.
- Full UI QA bootstrap uses separate local services on `4321/4322`; synthetic control data and `API_URL`/`PORT` overrides are test-only, not production authentication. CUA auth is unavailable; user permitted local Chromium.
- Do not install dependencies merely to repeat these gates. `pnpm` is pinned to `10.33.2`; use `pnpm dev`, `pnpm --filter api start:dev`, or `pnpm --filter web dev` only when an actual local run is needed.

## Границы следующей сессии

- Макеты и demo data in parent `output/summary-dashboard-concepts-20260915` are presentation references only, never production values. Current run record is `.autopilot/2026-09-15-executive-dashboard`; do not treat its plan/spec/tickets as source of truth over code.
- No auth, provider, import, backfill, schema or production effect follows from this dashboard. Keep saved-data reads, canonical fresh scope and the public/corporate/worker contours from `docs/security/runtime-security-contours.md` separate.
<!-- autopilot:end -->
