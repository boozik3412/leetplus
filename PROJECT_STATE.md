# LeetPlus Project State

Last updated: 2026-05-20

## Current Workflow

- Main local repo: `C:\Users\ALIENWARE\Desktop\leetplus`
- Production site: `https://leetplus.ru`
- API: `https://api.leetplus.ru`
- GitHub repo: `https://github.com/boozik3412/leetplus`
- Production branch: `main`
- VDS auto-deploy watches `origin/main`; preferred workflow is code change, verify build if needed, commit, push.
- Do not spend time refreshing local DB state or restarting local services unless explicitly requested. User reviews changes directly on `leetplus.ru`.

## Stack

- Monorepo with `pnpm workspaces`
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- Backend: NestJS 11, TypeScript
- Database: PostgreSQL, Prisma
- Production VDS: Ubuntu 24.04 LTS on reg.ru, IP `168.222.143.243`
- Production mail: `reports@leetplus.ru` through Mail.ru/VK WorkSpace SMTP

## Product Context

LeetPlus is an assortment analytics SaaS for computer clubs and club networks. It imports LAngame data, normalizes goods across clubs into network SKU groups, and provides analytics for sales, stock, OOS risk, margin, recommendations, LFL, new products, and assortment quality.

The active strategic product direction is a separate "Guests" module. It expands LeetPlus from assortment analytics into guest-base analytics, staff/control reports, mini CRM, loyalty/gamification, messenger communications, and guest-flow management. The product navigation is split into meaningful product blocks, and operational setup is separated into `Настройки` and `Синхронизация`.

Connected production LAngame sources:

- `1337.langame.ru`
- `443.langame.ru`
- `46.langamepro.ru`

## Important Data Rules

- Sales history must remain stable when product names change.
- Sales facts keep snapshot fields such as product/store names at the moment of sale.
- Deleted or missing LAngame nomenclature must not delete historical sales.
- LAngame sync must not automatically set `canonicalProductId`.
- Product grouping into a canonical/network SKU happens only through analysis/manual confirmation.
- A rejected parsing suggestion should not delete existing product links.
- Already confirmed parsing groups should not be suggested again unless there is a real change/new item to review.
- Manual store names in LeetPlus should be preserved; sync may update address/activity/source linkage, but not overwrite user-facing names.
- Guest history should remain stable when a guest profile changes in LAngame.
- LAngame sync must not overwrite manual guest CRM statuses, notes, segments, communication consents, or LeetPlus-owned loyalty state.
- Guest personal data must be treated as sensitive data: phone, email, full name, birthday, and document fields require access control and careful storage decisions.
- Guest communications require explicit channel consent, consent history, and unsubscribe handling.

## Key Metrics

- Active SKU: SKU with current stock or sales in the last 14 days.
- New products: products whose first historical positive stock appeared in the last 90 days.
- OOS risk: stock expected to last 3 days or less based on average daily sales.
- No-sales report: should exclude items with zero stock and items that had arrivals during the viewed report period.
- Cost per unit: calculated from stock cost basis and used for profit, margin, markup, ABC, and reports.
- Dashboard custom period charts: should compare 8 analogous periods; the selected custom period is the latest segment.

## Current Feature Areas

- Dashboard: executive network summary, compact filters, responsive header, KPI cards, trend charts, category weights/efficiency, active assortment, TOP SKU, guests/product/revenue summary, and load percent based on played hours divided by available PC-hours.
- Reports: collapsible report list, row-level sales detail report, summary export/email, LFL, new products, recommendations, OOS, no-sales, replenishment, ABC, top SKU/suppliers, assortment.
- Product parsing utilities: automatic analysis, safe confirmation/rejection, existing canonical SKU awareness, manual parsing page.
- Products/stores/directories: inline editing, multi-club filters, exports, manual store name preservation.
- Guest module: first production read-only layer is live, including data foundation sync, guest analytics dashboard, full guest report, guest card, mini CRM fields, first staff-control report, and PC-count based load calculation.
- Sync/admin UX: `/settings` is for LAngame connection settings only; `/sync` is the dedicated synchronization page with one combined sync action for assortment/sales/revenue plus guests.
- Mail: Mail.ru/VK WorkSpace domain is configured; SMTP uses `reports@leetplus.ru`.

## Recent Work

- Fixed dashboard trend card sizing behavior.
- Preserved manual store names during sync.
- Filtered no-sales report by stock and arrivals.
- Localized summary report export labels to Russian.
- Combined summary export and email controls.
- Clarified report export/email UI and error messages.
- Refined report disclosure controls.
- Added "Общий отчет по продажам" to reports and summary export/email for Excel pivot-table source rows.
- Reworked the management dashboard around commercial control: first-screen KPI composition, "what changed", "main focus", and "what to do today" blocks.
- Added full/current period selectors, European date formatting, dashboard report anchors, and responsive fixes from live review.
- Added product movement analytics: compact product-page preview, full table, 7/14/21 day periods, stock column, sorting/filtering, exports, and email.
- Started Stage 2 commercial reports with OOS revenue/profit-at-risk estimates in tables and exports, including profit at risk for the selected period.
- Added hybrid "Money at risk" reporting: OOS profit-at-risk plus frozen stock in no-sales products, surfaced on the dashboard and reports.
- Prepared `GUEST_MANAGEMENT_MODULE_TZ.md`: a draft specification for a future separate "Guests" module. Development is not started until the scope is approved.
- Started MVP 1 for the "Guests" module: added guest data foundation schema, LAngame guest endpoint client methods, and a protected manual foundation sync/profiling endpoint.
- Added the production "Guests" area with collapsible left-nav group, `/guests` dashboard, `/guests/report` full report, `/guests/[id]` guest card, encrypted phone/full-name storage, and LeetPlus-only CRM fields.
- Added default exclusion of administrator guest groups from client analytics while keeping admin groups selectable in filters for explicit inspection.
- Added first `/guests/staff-control` report: staff/admin group slice, staff activity KPIs, staff table, and operation-log summary. Current limitation: `all_operations_log` is not yet reliably linked to a specific administrator identity.
- Added safe staff-control diagnostics: guest foundation sync now probes `log_cash_transaction/list` and `working_shifts/list` and stores only field names/non-empty counts in the profile JSON, not raw payload values.
- Added executive network dashboard on `/dashboard`: combined money, guests, assortment, and load summary with direct navigation to relevant reports.
- Added PC-count foundation from LAngame `global/types_of_pc_in_clubs/list` and `global/linking_pc_by_type/list`; guest load is calculated as played hours / possible PC-hours.
- Moved synchronization controls out of `/settings` into `/sync`; settings now contain only LAngame API key/domains/sources, and sync has one combined action for all data.
- Moved `/sync` into a separate left-nav `Управление` block with `/settings`, added LAngame date-format fallback for date endpoints, compacted repeated sync history errors, and made stale guest sync runs older than 2 hours expire automatically instead of showing endless `RUNNING`.

## Near-Term Backlog

### Stage 1. Management Dashboard

Status: implemented; remains in production UX polish mode.

- Done: first screen is focused on commercial control: revenue, gross profit, margin, sold units, OOS risk, stock, management focus, actions, and "what changed".
- Done: current/full period selectors, default current-day view, European date formatting, report anchors, responsive fixes, and compact report previews.
- Done: executive summary now combines total revenue, guests, assortment and load; the load metric uses PC capacity when PC count is available from LAngame/global endpoints.
- Done: "What changed" now compares the latest full day against the previous full day for current-day mode; other periods keep analogous-period comparison.
- Done: "Main focus" includes money units in financial values and links "Money at risk" to the hybrid assortment-loss report.
- Current risk: production still needs live verification that LAngame returns enough PC context for all clubs; if load remains `нет данных`, inspect latest guest sync profile endpoint errors/field counts or VDS API logs.
- Next polish: continue adjusting color accents, wording, and direct action links from live `leetplus.ru` review.

### Stage 2. Commercial Reports

Status: active; first commercial-risk layer is implemented, next focus is deeper filters/export coverage and stronger economics.

- Done: OOS report has revenue/profit-at-risk estimates per day and profit at risk for the selected period.
- Done: hybrid "Money at risk" report combines OOS profit risk with frozen stock in no-sales SKU and is visible from dashboard and reports.
- Done: frozen stock fallback uses available cost/sale price so positions without cost do not collapse to 0 rubles when a sale price is known.
- Done: replenishment report full table has status/product/club/supplier/category filters, sortable stock/sales/demand/order columns, server XLSX/CSV export, local Excel/1C/PDF export, and email sending.
- Next: improve server-side export so it can optionally respect the current client-side filters from the table.
- Next: validate the frozen-stock formula against real production data and explain assumptions in the report UI.
- Next: add turnover, frozen money in stock, and slow SKU control beyond the current no-sales/OOS hybrid.
- Planned: add plan/fact by network, club, category, and supplier.
- Planned: add supplier scorecard with sales, profit, write-offs, OOS, delivery quality, and problem categories.

### Stage 3. Assortment Matrix

- Add mandatory SKU and assortment role concepts.
- Build a product x club matrix: sold, in stock, no stock, no sales, missing, needs replenishment.
- Add an assortment quality index by club, category, and network.

### Stage 4. Recommendations Workflow

- Show financial effect for recommendations: expected revenue, profit, loss reduction, or stock release.
- Split recommendations by role: commercial director, buyer, club manager.
- Add recommendation statuses: new, in progress, done, rejected, hidden, reappeared.

### Stage 5. Regular Digests

- Daily email digest for network-level money, margin, OOS, write-offs, no-sales SKU, and required actions.
- Weekly commercial report for owner/director with dynamics and problem zones.
- Later add Telegram/MAX alerts for critical events.

### Stage 6. Product Commercialization

- Demo mode with prepared data and clear value story without LAngame setup.
- Commercial network audit page: losses, growth opportunities, matrix quality, and expected effect.
- Tariff levels: basic analytics, advanced reports, recommendations, regular digests, and assortment audit.

### Stage 7. Guest Management Module

Status: MVP 1 read-only guest analytics is live in production. Automatic rewards and write-back to LAngame are not implemented.

- Source document: `GUEST_MANAGEMENT_MODULE_TZ.md`.
- Done: product navigation has two left-nav blocks, "Ассортимент" and "Гости"; subsections are collapsed by default and open on click.
- Done: data profiling and read-only foundation sync for guest-related LAngame endpoints started before reward/bonus write-back.
- Done: initial tenant-scoped guest foundation tables and manual endpoint `POST /integrations/langame/guests/foundation/sync`.
- Done: first protected guest analytics API and `/guests` dashboard with active/new/repeat/risk/lost guests, sessions, play hours, transaction revenue, bar revenue, visit trend, top guests, and endpoint data-quality warnings.
- Done: guest dashboard v1.1 adds period, club, guest group, segment, and search filters; paginated guest list; sort links; and a protected guest card `/guests/[id]` with sessions, transactions, and bar purchases.
- Done: guest phone and full name are now stored encrypted at application level and shown in full to authorized users; raw documents are still not stored or displayed.
- Done: `/guests` includes a manual foundation sync button so production users can refresh guest data and populate newly added encrypted contact fields after deploy.
- Done: guest CRM v1 adds manual LeetPlus-only status, note, next action, next contact date, and CRM event history on the protected guest card; these fields are not touched by LAngame sync.
- Done: `/guests/report` full report opens separately with dates, club, group, segment, CRM status, search, sort, direction, and page-size filters.
- Done: client guest analytics excludes administrator groups by default, but administrator groups remain available in the group filter for explicit drilldown.
- Done: `/guests/staff-control` adds the first staff-control report for administrator groups and operation-log summary.
- Done: `/guests/staff-control` surfaces safe data-shape diagnostics for `all_operations_log/list`, `log_cash_transaction/list`, and `working_shifts/list` so the next iteration can validate real operator/admin identifiers.
- Done: `working_shifts/list` is persisted as tenant-scoped shift facts and linked to staff guests through `user_id` when it matches a LAngame guest id; `/guests/staff-control` now shows shift counts, linked shifts, shift hours, shift payment amount, refunds, incassation, and middle check.
- Done: `/guests/staff-control` now exposes unmatched LAngame operators grouped by `externalDomain + user_id` with shift hours, payments, refunds, incassation, middle check, and store list.
- Done: PC context is pulled from LAngame `global/types_of_pc_in_clubs/list` + `global/linking_pc_by_type/list`, stored on `Store.computerCount`, and used for network/club load percent.
- Done: guest summary can backfill missing PC counts on demand when `Store.computerCount` is empty.
- Done: `/sync` now lives in a separate `Управление` navigation block, retries LAngame date endpoints with `дд.мм.гггг` after `400`, shows compact latest sync job per source, and automatically marks stale guest `RUNNING` sync runs older than 2 hours as failed.
- Current limitation: `all_operations_log` is stored and summarized, but it still does not expose a reliable administrator identifier. `log_cash_transaction/list` currently returns errors on production sources, so cashier analytics starts from working shifts.
- Current limitation: PC-count parsing is defensive because real `global/*` payload shape may differ by LAngame source; production verification should confirm `computerCount` is filled for each club.
- Planned data foundation: guests, guest groups, balances, bonus balances, sessions, transactions, all operations log, product expenses by guest, clubs, tariffs, shifts, and PC context.
- Next: add a staff identity mapping layer so unmatched `working_shifts.user_id` values can be manually or semi-automatically linked to LeetPlus staff guests.
- Next: extend staff-control report from persisted shifts into shift anomalies, manual corrections, refunds/cancellations, discounts/bonuses, and suspicious guest/self-service activity.
- Next: verify production `/dashboard` load percentage and sync diagnostics after the next successful `/sync` run.
- Next: add export for `/guests/report` and `/guests/staff-control`, then saved filters/audiences.
- Planned analytics: RFM, retention, churn risk, heatmaps, LTV, bonus load, campaign effect, and guest-flow forecasts.
- Planned CRM layer: segments, saved audiences, CRM statuses, notes, tasks, communication history, and next-best-action recommendations.
- Planned loyalty/gamification: missions, rewards, budgets, limits, anti-fraud, and manual payout queue until a safe LAngame write API is confirmed.
- Planned channels: Telegram bot/Mini App first, MAX bot/Mini App later after legal/account setup; all channels require explicit consent and unsubscribe support.

### Continuous Polish

- Continue polishing report table UX, filters, exports, and mobile layout based on live `leetplus.ru` review.
- Keep README and this file aligned when workflow, data rules, or production setup changes.

## Useful Commands

```powershell
git -C 'C:\Users\ALIENWARE\Desktop\leetplus' status --short
node 'C:\Users\ALIENWARE\Desktop\leetplus\.codex-tools\node_modules\pnpm\bin\pnpm.cjs' -r build
git -C 'C:\Users\ALIENWARE\Desktop\leetplus' log --oneline -8
```
