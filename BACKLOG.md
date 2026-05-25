# LeetPlus Backlog

Last updated: 2026-05-25

This file is the source of truth for product backlog, near-term roadmap, planned modules, and deferred ideas. `PROJECT_STATE.md` should stay focused on current project state, workflow, production context, and data rules.

## Status Labels

- Done: implemented and available or ready for production verification.
- Current risk: known production or data-quality risk that can affect existing behavior.
- Current limitation: known boundary of the current implementation.
- Next: near-term implementation candidate.
- Planned: accepted direction, not necessarily next in development.

## Product UX Architecture

Status: planned product direction. Use this section as a UX decision frame for new dashboards, reports, CRM screens, assortment tools, marketing tools, and staff workflows.

LeetPlus should evolve from a set of reports into a commercial operating system for computer club networks. The main UX principle is:

`Signal -> Work Scenario -> Decision -> Task/Launch -> Control -> Effect`

The first screen should not overload the user with every table, filter, and raw report. It should show the most important business signals, then route the user into the correct working scenario. Full reports, filters, exports, and diagnostics remain available, but they should unfold after the user chooses a scenario.

### Top-Level Business Blocks

1. `Управление гостями / CRM`
   - Business question: who should we retain, return, develop, or contact manually?
   - Signals: falling repeat visits, growing risk guests, low new-to-repeat conversion, overdue CRM tasks, VIP/TOP guest inactivity, event/booking leads without follow-up.
   - Route: signal -> guest group -> CRM task or campaign -> responsible user and deadline -> contact result -> effect in visits, revenue, load, and bar.

2. `Управление ассортиментом`
   - Business question: what should we buy, remove, redistribute, reprice, or investigate?
   - Signals: OOS, frozen money in stock, low margin, no sales, category decline, bar decline, write-offs, supplier/category problems.
   - Route: signal -> category/SKU/store scope -> cause diagnostics -> category-management decision -> task for action -> execution control -> effect in revenue, margin, OOS, turnover, stock, and write-offs.

3. `Маркетинг`
   - Business question: how do we stimulate demand and communicate value to guests?
   - Signals: need to raise traffic, low weak-hour load, low bar share, low repeat visits, event promotion needed, need to sell a promo bundle, inactive guest group ready for reactivation.
   - Route: signal -> marketing goal -> target guest group -> promo mechanic -> channel -> launch/control -> effect in reach, visits, revenue, bar, repeat visits, cost, and ROI.

4. `Персонал`
   - Business question: who executes commercial and operational actions, and where is execution quality weak?
   - Signals: overdue tasks, shift anomalies, refunds, cash/incassation mismatch, weak administrator metrics, missed checklists, training gaps.
   - Route: signal -> employee/shift/club scope -> action or review -> responsible manager -> control -> effect in discipline, service quality, revenue protection, and risk reduction.

### Dashboard UX Rule

The management dashboard should group signals by business logic instead of by database/report origin:

- `Клиентская база`: guests in risk, new guests without second visit, CRM overdue, VIP inactivity.
- `Ассортимент`: OOS, money in stock, no-sales SKU, low margin, write-offs.
- `Маркетинг`: weak-hour demand, promo opportunities, bar activation, event promotion, campaign effect.
- `Персонал`: overdue execution, administrator signals, shift/cash risks, operational discipline.

Each signal card should answer:

- what happened;
- why it matters commercially;
- expected business impact where measurable;
- one clear next action (`Разобрать`, `Создать кампанию`, `Создать задачу`, `Открыть отчет`).

### CRM Decision Route

- Choose problem or opportunity: return guests, develop new guests, protect TOP/VIP, process event/booking lead, recover risk guests.
- Choose guest group: saved group, segment, manual CRM guests, matched Langame guests.
- Choose action: CRM task, call, message, campaign, event follow-up, next contact.
- Assign: responsible user, channel, deadline, note.
- Record result: contacted, no answer, refused, promised to visit, booked, needs next contact, unsubscribed.
- Measure effect: returned guests, repeat visits, revenue after contact, bar, load, campaign conversion.

### Assortment Decision Route

- Choose signal: OOS, excess stock, low margin, no sales, category decline, write-off/loss.
- Diagnose cause: demand, stock, supplier, category role, price, club distribution, replacement SKU, shelf/bar execution.
- Choose category-management action: reorder, redistribute, reduce purchase, reprice, remove SKU, add replacement/new product, check supplier, create club task.
- Control execution: who owns action, due date, affected clubs/SKU/categories, completion status.
- Measure effect: sales, gross profit, margin, OOS reduction, turnover, stock release, write-off reduction.

### Marketing Decision Route

- Choose goal first, not an empty promo builder: attract guests, return guests, increase repeat visits, fill weak hours, grow bar, promote tournament/event, sell promo bundle.
- Choose target group: saved guest group, CRM leads, new guests, risk guests, TOP/VIP, low-bar guests, weak-hour visitors.
- Choose mechanic: discount, bonus, promo bundle, mission/challenge, coupon, tournament, personal offer, referral mechanic.
- Configure rules: period, clubs, products/services, limits, budget, participation rules, anti-fraud constraints.
- Choose channel: in-club announcement, CRM task to administrator, Telegram/MAX, SMS/call, push/mobile app, social networks.
- Measure effect: reach, contacts, visits, revenue, bar, repeat visits, cost, ROI.

### UX Acceptance Rules

- Default screens should show compact previews, not full raw tables.
- Full reports should open separately, have breadcrumbs, filters, sorting, export, and responsive table/card layouts.
- Filters should be collapsed or compact by default when they are not the primary task.
- Buttons should be action-specific and named by user intent, not by internal data source.
- Every major workflow should have a clear `next action` and a visible `effect` layer.
- New sidebar items must be added when a feature becomes user-facing, otherwise the feature is considered undiscoverable.

## Stage 1. Management Dashboard

Status: implemented; remains in production UX polish mode.

- Done: first screen is focused on commercial control: revenue, gross profit, margin, sold units, OOS risk, stock, management focus, actions, and "what changed".
- Done: current/full period selectors, default current-day view, European date formatting, report anchors, responsive fixes, and compact report previews.
- Done: executive summary now combines total revenue, guests, assortment and load; the load metric uses PC capacity when PC count is available from Langame/global endpoints.
- Done: "What changed" now compares the latest full day against the previous full day for current-day mode; other periods keep analogous-period comparison.
- Done: "Main focus" includes money units in financial values and links "Money at risk" to the hybrid assortment-loss report.
- Done: dashboard auto-sync now refreshes both assortment/revenue data and guest foundation data, so the executive dashboard is responsible for all first-screen metrics.
- Done: current-day guest and load metrics count sessions by overlap with the selected period, so overnight sessions contribute to the current day instead of only to the day they started.
- Done: dashboard club revenue formula no longer treats Langame balance top-ups (`plus`) as club revenue; club revenue now uses confirmed balance spend/write-off in a concrete club with product/bar revenue as the safe fallback, so mobile app top-ups are not assigned to a store.
- Done: guest foundation sync now sends official ISO dates first and lets the Langame client fallback to `dd.mm.yyyy` only when the endpoint returns empty/400; `all_operations_log/list` additionally probes `operation_type=Списание/Пополнение`, so dashboard revenue can use balance spend facts when Langame returns them.
- Done: `transactions/list.balance` is now persisted as the transaction amount for non-cancelled rows, and dashboard diagnostics separately expose transaction spend candidates; mobile/top-up operations are still excluded from store revenue.
- Done: `log_cash_transaction/list` is now requested per club with required `club_id`, matching the official Langame API contract.
- Done: network-level total revenue now includes balance top-ups from Langame operation log as unallocated network revenue, while club/store breakdowns still stay based on store-scoped spend and product/bar facts.
- Done: `GuestOperationLog` now persists Langame `name/source/form`, so unallocated network top-ups can be narrowed to online-like sources such as app, guest account, web interface, QR, and legacy rows without any club binding.
- Done: `/dashboard/revenue-diagnostics` now shows unallocated online top-ups as a separate network money stream with source/form/name breakdown, and treats Langame `club_id=0` as unassigned network revenue instead of a club.
- Current risk: production still needs live verification that Langame returns enough PC context for all clubs; if load remains `нет данных`, inspect latest guest sync profile endpoint errors/field counts or VDS API logs.
- Current risk: current-day total revenue remains dependent on Langame returning balance-spend facts from `all_operations_log/list` or store-scoped `transactions/list`; if these sources stay empty after sync, the dashboard intentionally falls back to product/bar revenue and undercounts total club revenue.
- Current limitation: exact split between gameplay, services, app top-ups, and club-cash sources still needs production verification after a fresh sync with the newly persisted operation source/form fields.
- Next polish: continue adjusting color accents, wording, and direct action links from live `leetplus.ru` review.

## Stage 2. Commercial Reports

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

## Stage 3. Assortment Matrix

- Add mandatory SKU and assortment role concepts.
- Build a product x club matrix: sold, in stock, no stock, no sales, missing, needs replenishment.
- Add an assortment quality index by club, category, and network.

## Stage 4. Recommendations Workflow

- Show financial effect for recommendations: expected revenue, profit, loss reduction, or stock release.
- Split recommendations by role: commercial director, buyer, club manager.
- Add recommendation statuses: new, in progress, done, rejected, hidden, reappeared.

## Stage 5. Regular Digests

- Daily email digest for network-level money, margin, OOS, write-offs, no-sales SKU, and required actions.
- Weekly commercial report for owner/director with dynamics and problem zones.
- Later add Telegram/MAX alerts for critical events.

## Stage 6. Product Commercialization

- Demo mode with prepared data and clear value story without Langame setup.
- Commercial network audit page: losses, growth opportunities, matrix quality, and expected effect.
- Tariff levels: basic analytics, advanced reports, recommendations, regular digests, and assortment audit.

## Stage 7. Guest Management Module

Status: MVP 1 read-only guest analytics is live in production. Automatic rewards and write-back to Langame are not implemented.

- Source document: `GUEST_MANAGEMENT_MODULE_TZ.md`.
- Done: product navigation has two left-nav blocks, "Ассортимент" and "Гости"; subsections are collapsed by default and open on click.
- Done: data profiling and read-only foundation sync for guest-related Langame endpoints started before reward/bonus write-back.
- Done: initial tenant-scoped guest foundation tables and manual endpoint `POST /integrations/langame/guests/foundation/sync`.
- Done: first protected guest analytics API and `/guests` dashboard with active/new/repeat/risk/lost guests, sessions, play hours, transaction revenue, bar revenue, visit trend, top guests, and endpoint data-quality warnings.
- Done: guest dashboard v1.1 adds period, club, guest group, segment, and search filters; paginated guest list; sort links; and a protected guest card `/guests/[id]` with sessions, transactions, and bar purchases.
- Done: guest phone and full name are now stored encrypted at application level and shown in full to authorized users; raw documents are still not stored or displayed.
- Done: `/guests` includes a manual foundation sync button so production users can refresh guest data and populate newly added encrypted contact fields after deploy.
- Done: guest CRM v1 adds manual LeetPlus-only status, note, next action, next contact date, and CRM event history on the protected guest card; these fields are not touched by Langame sync.
- Done: `/guests/report` full report opens separately with dates, club, group, segment, CRM status, search, sort, direction, and page-size filters.
- Done: client guest analytics excludes administrator groups by default, but administrator groups remain available in the group filter for explicit drilldown.
- Done: `/guests/staff-control` adds the first staff-control report for administrator groups and operation-log summary.
- Done: `/guests/staff-control` surfaces safe data-shape diagnostics for `all_operations_log/list`, `log_cash_transaction/list`, and `working_shifts/list` so the next iteration can validate real operator/admin identifiers.
- Done: `working_shifts/list` is persisted as tenant-scoped shift facts and linked to staff guests through `user_id` when it matches a Langame guest id; `/guests/staff-control` now shows shift counts, linked shifts, shift hours, shift payment amount, refunds, incassation, and middle check.
- Done: `/guests/staff-control` now exposes unmatched Langame operators grouped by `externalDomain + user_id` with shift hours, payments, refunds, incassation, middle check, and store list.
- Done: staff identity mapping v1 adds a tenant-scoped manual link from `working_shifts.user_id` to a staff guest, backfills already loaded shifts, and applies the mapping during future guest foundation sync runs.
- Done: `/guests/staff-control/operators` opens the full Langame operator report with period/club/status/search/sort filters plus link/unlink tools for staff identity mappings.
- Done: PC context is pulled from Langame `global/types_of_pc_in_clubs/list` + `global/linking_pc_by_type/list`, stored on `Store.computerCount`, and used for network/club load percent.
- Done: guest summary can backfill missing PC counts on demand when `Store.computerCount` is empty.
- Done: `/sync` now lives in a separate `Управление` navigation block, retries Langame date endpoints with `дд.мм.гггг` after `400`, shows compact latest sync job per source, and automatically marks stale guest `RUNNING` sync runs older than 2 hours as failed.
- Done: `/sync` guest diagnostics now expose endpoint error details, not only counts and endpoint names, so unavailable or parameter-sensitive Langame endpoints such as `guests/logs` can be triaged from the UI.
- Done: `guests/logs` is now treated as an optional extended endpoint and is not called by the standard guest foundation sync unless explicitly requested, because the public docs do not confirm period/pagination filters for it.
- Done: guest current-day analytics now counts session overlap across date boundaries, fixing zero guests/load for current day when sessions started before midnight.
- Done: `/guests/staff-control` now shows first shift anomaly cards for refunds, missing incassation, long shifts, low middle check, and high-cash unmapped operators.
- Done: shift anomaly cards now drill down into `/guests/staff-control/operators` with an explicit signal filter, matching sort, and linked/unlinked context where needed.
- Done: `/guests/staff-control` was converted to compact previews with full separate reports for administrators, operators, operations, and diagnostics; full reports now use breadcrumbs.
- Done: `/guests/staff-control` now has semantic management blocks with report descriptions: shift signals, employees/operators, and primary Langame data sources.
- Done: the "long shifts" staff-control signal now means average shift duration >= 14 hours, with inline explanations for every anomaly card.
- Done: `/guests/staff-control/operators` UI is now positioned as administrator comparison with infographic bars, rankings, and visible wording without "operator" terminology.
- Done: administrator comparison filters are compact by default, showing active filter chips and expanding into the full filter form on demand.
- Done: administrator comparison now starts with useful top rankings instead of aggregate totals: total revenue, revenue per shift, bar, bar per shift, bar share, and hookah revenue.
- Done: administrator top ranking cards are now more visual, with highlighted leaders, rank badges, and comparison bars for each metric.
- Done: administrator comparison page is compact by default; detailed per-admin comparison and mapping list open in full mode via `view=full`.
- Done: administrator ranking cards were toned down to a single calm accent, long names now wrap, and the sidebar item is named "Администраторы".
- Done: desktop sidebar is now a compact icon rail with popover menus for sections, while mobile keeps the slide-out menu.
- Done: compact desktop sidebar popovers now render above dashboard content without text overlap, close cleanly, and use clearer section icons for guests, staff, assortment, and management.
- Done: dashboard revenue uses the selected-period network revenue explicitly, and successful login can trigger a daily catch-up sync when Langame data is stale.
- Done: administrator comparison now includes compact shift-level details with shift ID, period, club, cash, refunds, incassation, bar revenue, and anomaly signals.
- Done: `/guests/staff-control/operations` now has a dedicated operations report with semantic categories for refunds/cancellations, discounts/bonuses, cash, guests, service operations, filters, sorting, and responsive cards.
- Done: `/guests/staff-control` now has a daily reconciliation block that places shift signals and operation-log categories side by side with direct drilldowns.
- Done: `/guests/report` now has a server-side CSV export for the full filtered guest selection, not only the current page.
- Done: `/guests/staff-control/operators` now has a server-side CSV export for the full filtered administrator comparison report.
- Done: `/guests/staff-control/operations` now has a server-side CSV export for the full filtered operation-log type summary.
- Done: `/guests/report` now has tenant-scoped saved filters for quick guest segments: save current filters, apply them later, and delete obsolete filters.
- Done: `/guests/report` now has tenant-scoped saved groups: save the current filtered guest selection as a snapshot with member rows, apply its filters later, and delete obsolete groups.
- Done: the `Гости` sidebar section now exposes distinct destinations for guest dashboard, guest list, full report, and saved groups instead of duplicate links to the same page.
- Done: `/guests/report#audiences` now starts the CRM workflow for groups: users can create contact tasks for saved groups and see the latest CRM tasks next to saved group snapshots.
- Done: manual CRM guests/leads can be added before Langame registration, with encrypted full name and phone storage; future guest sync links these leads to Langame guests by normalized phone hash and copies the CRM status/action into the matched guest only when the matched guest has no CRM status yet.
- Done: manual CRM leads with a next action now automatically create linked CRM tasks, and the group CRM panel supports task statuses: new, in progress, done, and canceled.
- Done: manual CRM leads now capture phone/messenger communication consent v1; the consent status is visible in the group CRM panel and is copied to the matched Langame guest during phone-based sync when the guest has no consent status yet.
- Done: group CRM panel now supports consent and unsubscribe handling for existing manual CRM leads; if a matched contact is marked unsubscribed, the linked guest is moved to `DO_NOT_CONTACT` with a CRM event.
- Done: group CRM panel now has CRM contact history v1: users can record contact channel, date, result, and note for manual leads; events are tenant-scoped and linked to the matched guest when available.
- Done: guest CRM now has a dedicated `/guests/crm` entry point and a separate sidebar item under `Гости`, so groups, manual leads, CRM tasks, consents, and contact history are discoverable without opening the full report anchor.
- Done: CRM tasks now support tenant-scoped assignees from LeetPlus users; the CRM workspace and group panel show/select the responsible user for each task.
- Done: saved groups and manual CRM guests now have a campaign-ready planning workflow: create a CRM task with target, channel, deadline, responsible user, and contact note before any automated messaging is introduced.
- Done: group CRM panel now has compact campaign analytics: active and overdue tasks, completed tasks, contact channels, contact results, saved group coverage, and nearest deadlines.
- Done: CRM tasks now have a full `/guests/crm/tasks` work report with filters by status, responsible user, target type, due period, search, sorting, responsive cards/table, breadcrumbs, and CSV export.
- Current limitation: `all_operations_log` is stored and summarized, but it still does not expose a reliable administrator identifier. `log_cash_transaction/list` currently returns errors on production sources, so cashier analytics starts from working shifts.
- Current limitation: PC-count parsing is defensive because real `global/*` payload shape may differ by Langame source; production verification should confirm `computerCount` is filled for each club.
- Planned data foundation: guests, guest groups, balances, bonus balances, sessions, transactions, all operations log, product expenses by guest, clubs, tariffs, shifts, and PC context.
- Next: connect operation categories to concrete administrator shifts when Langame exposes a reliable operator identifier in operation/cash logs.
- Next: verify production `/dashboard` current-day load percentage after deploy of the session-overlap calculation.
- Next: add campaign/contact outcome analytics by group and CRM task to track conversion from planned contact to completed result.
- Planned analytics: RFM, retention, churn risk, heatmaps, LTV, bonus load, campaign effect, and guest-flow forecasts.
- Planned CRM layer: segments, saved groups, CRM statuses, notes, tasks, communication history, and next-best-action recommendations.
- Planned loyalty/gamification: missions, rewards, budgets, limits, anti-fraud, and manual payout queue until a safe Langame write API is confirmed.
- Planned channels: Telegram bot/Mini App first, MAX bot/Mini App later after legal/account setup; all channels require explicit consent and unsubscribe support.

## Stage 8. Staff Operations Module

Status: planned. This is a new operational module for employees of computer club networks: regulations, shift checklists, training, knowledge base, and task control.

### Product Positioning

The module should not be a generic task tracker. It should become an operational control system for a computer club shift:

- regulations define how work must be done;
- training explains and validates that employees understand the work;
- tasks and checklists turn the standard into daily actions;
- evidence and audit history prove what happened;
- analytics shows where clubs, shifts, and employees need attention.

Recommended navigation block names: `Персонал`, `Операции`, or `Стандарты и смены`. Preferred first product name: `Персонал`, because it can naturally include tasks, training, regulations, and staff-control analytics.

### Competitor Notes

- Service Inspector: strongest reference for electronic checklists, regulations, standards, attestations, journals, instructions, mobile execution, photo/video evidence, violation tasks, notifications, and analytics. Source: https://serviceinspector.ru/
- LeaderTask: reference for fast task creation from app, email, Telegram, voice, and browser widget; also useful for reminders, recurring tasks, nested tasks, attachments, roles, permissions, offline mode, and mobile apps. Source: https://www.leadertask.ru/
- Todoist: reference for simple team workspaces, task assignment, comments, files, sections, subtasks, board/calendar/list views, templates, integrations, activity log, permissions, and AI Assist for task breakdown and filters. Source: https://www.todoist.com/
- YouGile: reference for board-based work, built-in messenger, many task fields/tools, nested subtasks, role permissions, templates, automated task transfer, API, mobile apps, and boxed/on-premise option. Source: https://ru.yougile.com/

Conclusion for LeetPlus: combine Service Inspector-style operational proof with LeetPlus-specific staff, shift, cash, guest, and assortment analytics. Compete by industry depth, not by copying a universal task manager.

### Target Users

- Network owner: sees operational discipline across clubs and understands where money, service, or compliance is at risk.
- Operations director or regional manager: controls execution by clubs, shifts, and managers.
- Club manager: assigns work, checks shift quality, trains employees, handles recurring issues.
- Senior administrator: runs the current shift and closes required checklists.
- Administrator: sees personal tasks, shift tasks, regulations, training, and knowledge base.

### Core Entities

- Staff member: LeetPlus employee identity, optionally linked to Langame operator/guest/admin identifiers.
- Role: owner, manager, senior administrator, administrator, auditor, viewer.
- Staff group: role, department, club team, trainee group.
- Regulation: versioned document with owner, status, effective date, required acknowledgement, attached materials.
- Knowledge base article: quick operational answer for administrators.
- Training material: text, file, image, video link, external link.
- Course: ordered set of materials, tasks, and tests.
- Test/attestation: questions, pass threshold, attempts, expiration date, result history.
- Task: one-time, recurring, shift-based, period-based, role-based, club-based, or personal.
- Checklist template: reusable operational checklist.
- Checklist run: concrete completion instance tied to shift, employee, club, and time.
- Evidence: photo, video, file, comment, numeric value, yes/no answer, timestamp.
- Violation: failed checklist item or manually created issue that can spawn a task.
- Audit event: immutable history of creation, edit, assignment, acknowledgement, completion, rejection, and verification.

### MVP 1. Staff Foundation And Tasks

Goal: let managers create short-term and long-term tasks for shifts, periods, clubs, roles, or specific employees.

- Create staff directory and role model independent from guest analytics, while reusing current staff identity mapping where useful.
- Support employee-to-Langame mapping from `working_shifts.user_id` and future operator identifiers.
- Add task types: one-time, shift, recurring, long-term, personal, club, role.
- Add task statuses: new, in progress, on review, done, overdue, canceled.
- Add priority, deadline, responsible employee, club, shift, author, observer, labels, attachments, comments, and checklist inside a task.
- Add recurring rules: daily, weekly, monthly, by shift opening, by shift closing.
- Add templates for common club operations.
- Add basic task list views: today, overdue, my tasks, by club, by employee, by shift, by status.
- Add audit history for every task.

Acceptance criteria:

- A manager can create a task for a concrete evening shift in one club.
- An administrator sees assigned shift tasks and can mark them complete with a comment or attachment.
- A manager sees completion status, overdue tasks, and task history.
- Existing Langame sync does not overwrite LeetPlus-owned staff/task data.

### MVP 2. Shift Checklists And Regulations

Goal: turn daily operating standards into controlled execution.

- Add versioned regulation editor: draft, published, archived.
- Add required employee acknowledgement for selected roles or clubs.
- Add checklist template builder with sections, required fields, evidence requirements, and scoring.
- Add checklist runs tied to club, shift, employee, role, and scheduled time.
- Add standard checklist packs: opening shift, closing shift, cash desk, bar, PC zone, cleanliness, incident handling, inventory handover.
- Allow checklist items to create violation tasks automatically.
- Add manager review flow: accepted, returned for correction, escalated.
- Add evidence: photo, video/file link, comment, numeric value, checkbox, select, timestamp.
- Add execution report by club, shift, employee, and checklist.

Acceptance criteria:

- An administrator can complete an opening or closing shift checklist.
- Required items cannot be closed without required evidence.
- A failed checklist item creates a follow-up task.
- A manager sees missed, late, failed, and returned checklist runs.

### MVP 3. Training, Knowledge Base, And Attestations

Goal: make onboarding and standard knowledge measurable.

- Add knowledge base for administrators with search, categories, tags, and role visibility.
- Add training materials: text, files, images, video links, external links.
- Add courses by role and club.
- Add onboarding plan for new administrators.
- Add tests and attestations with pass threshold, retakes, result history, and expiration.
- Link regulations to training: updated regulation can require acknowledgement or test retake.
- Add employee training profile: courses assigned, progress, overdue learning, certificates/attestations.
- Add manager report: who is ready for shift work, who failed tests, who has expired attestations.

Acceptance criteria:

- A new administrator receives an onboarding path.
- A manager sees completion percentage and test results.
- A published regulation update can trigger acknowledgement or attestation.
- Training results remain historical after employee role or club changes.

### MVP 4. Control And Analytics

Goal: show not only completion, but operational quality and risk.

- Add dashboard for operational discipline: done on time, overdue, failed, returned, unchecked.
- Add club rating by task/checklist discipline.
- Add employee rating by timely completion, repeated violations, training status, and review outcomes.
- Add recurring issue detection: same failed checklist item by club, role, employee, time, or shift type.
- Connect with existing `/guests/staff-control`: shifts, linked/unlinked operators, cash shift, refunds, incassation, middle check.
- Add anomaly cards: cash/refund anomalies plus missed checklist, suspicious self-service activity plus employee identity, poor bar sales plus missed bar checklist.
- Add XLSX/CSV export for tasks, checklist runs, training results, and violations.

Acceptance criteria:

- Owner sees clubs with the highest operational risk.
- Manager can drill down from club to shift, employee, checklist, evidence, and task history.
- Staff-control anomalies can reference operational context where available.

### MVP 5. AI Assistance

Goal: add useful assistance after basic data and workflows exist.

- Generate checklist draft from regulation text.
- Summarize long regulation into short shift instruction.
- Suggest task breakdown for a broad instruction.
- Detect repeated weak points by club, employee, checklist, and shift.
- Suggest training material or retest after repeated mistakes.
- Prepare weekly manager summary with completed work, overdue work, violations, and recommended actions.

Acceptance criteria:

- AI output is optional and never silently changes published regulations, tasks, or training.
- Every AI-generated checklist, summary, or recommendation requires user confirmation before publication or assignment.
- Sensitive staff and guest data is minimized in prompts and logs.

### Out Of First Release

- Full universal project management clone with complex boards, CRM, and arbitrary workflows.
- Separate public mobile app in app stores.
- Automatic payroll, fines, bonuses, or sanctions.
- Automatic write-back into Langame.
- Complex low-code business process designer.
- Mass Telegram/MAX workflows without separate legal and channel setup.

### Recommended Technical Sequence

1. Create `STAFF_OPERATIONS_MODULE_TZ.md` with roles, scenarios, data model, permissions, MVP scope, and acceptance criteria.
2. Extract staff identity into a reusable staff domain that can serve both `/guests/staff-control` and the new operations module.
3. Add database schema for tasks, task templates, task comments, attachments, audit events, and staff assignments.
4. Implement backend CRUD and list APIs for tasks with tenant/store/staff access control.
5. Implement `/staff/tasks` or `/operations/tasks` UI for manager and administrator workflows.
6. Add checklist templates and checklist runs.
7. Add regulation documents, versions, acknowledgements, and role/club targeting.
8. Add training materials, courses, tests, and attestation reports.
9. Add analytics, exports, and connections to current staff-control signals.
10. Add AI assistance only after real workflows produce enough structured data.

### Key Data Rules

- Historical task, checklist, training, and attestation facts must remain stable after employee rename, club rename, role change, or staff mapping change.
- Deleting or unlinking a staff mapping must not delete historical shift/task/checklist facts.
- Langame sync must not overwrite LeetPlus-owned staff statuses, notes, tasks, training results, acknowledgements, or role assignments.
- Staff personal data must be role-protected; expose only what is needed for operations.
- Attachments may contain sensitive workplace information and need tenant scoping, access control, and retention rules.
- Dates in UI should use `дд.мм.гггг`; money should show `руб`; counts and hours should be labeled.

## Stage 9. Marketing Module

Status: planned. This module should cover promo actions, guest mechanics, campaign communication, announcements, and measurable campaign effect. It should be designed around business goals first, not around an empty promo constructor.

### Product Positioning

Marketing in LeetPlus should help a club network stimulate demand and connect guest analytics with concrete offers:

- fill weak hours and weak clubs;
- increase repeat visits;
- return inactive guests;
- grow bar and promo bundle sales;
- promote tournaments, events, birthdays, and full-club bookings;
- create understandable mechanics for guests: bonuses, missions, challenges, coupons, bundles, and personal offers;
- measure commercial effect after launch.

Marketing should be connected to CRM groups and consent rules. At the current stage, public Langame write-back for automatic bonus issuance is not confirmed, so the first implementation should support planning, communication, manual execution, and effect analytics before automatic reward issuance.

### Core Scenarios

- Promo campaign for a saved guest group.
- Promo bundle constructor: game time + bar + hookah/service/product combinations.
- Weak-hour activation: offer for low-load hours or specific clubs.
- Bar growth campaign: target guests with low bar share or promote bundle mechanics.
- Reactivation campaign: risk/lost guests with controlled contact and return measurement.
- New guest second-visit campaign.
- Event/tournament promotion.
- Manual announcement/campaign task for administrators.
- Campaign performance review after launch.

### Core Entities

- Marketing campaign: goal, name, period, clubs, status, budget, owner.
- Target group: saved guest group, CRM leads, segment, manual selection, or rule-based audience.
- Promo mechanic: discount, bonus, promo bundle, mission/challenge, coupon, tournament, personal offer, referral mechanic.
- Promo bundle: items/services, base price, promo price, margin estimate, validity rules.
- Channel: in-club announcement, CRM task, Telegram/MAX, SMS/call, push/mobile app, social networks.
- Consent snapshot: who can be contacted and by which channel.
- Launch checklist: copy, channel, responsible user, schedule, approval.
- Campaign result: contacts, reach, visits, revenue, bar, load, repeat visits, cost, ROI.

### MVP 1. Campaign Planning And Manual Launch

Goal: let a manager create a simple campaign from a business signal and control manual execution.

- Add `/marketing` entry point and sidebar block when implementation starts.
- Start from goal selection: attract guests, return guests, increase repeat visits, fill weak hours, grow bar, promote event, sell promo bundle.
- Let the user choose a saved guest group or create one from guest filters.
- Add campaign fields: goal, period, clubs, target group, channel, responsible user, deadline, note, status.
- Generate CRM tasks for campaign execution when the channel requires manual contact.
- Respect communication consent and show exclusions before launch.
- Show a compact campaign list: planned, running, finished, canceled.
- Show a campaign detail page with breadcrumbs, tasks, contacts, notes, and effect placeholders.

Acceptance criteria:

- A manager can create a campaign for a saved guest group without opening raw guest tables.
- The campaign creates clear tasks for responsible users.
- Guests without required consent are visible as excluded, not silently contacted.
- Campaign facts remain tenant-scoped and are not overwritten by Langame sync.

### MVP 2. Promo Bundles And Mechanics

Goal: help clubs create commercially sane promo offers.

- Add promo bundle constructor with game time, bar products, hookah/services, discount, and price.
- Show estimated revenue, margin, and cost where data exists.
- Add mechanic templates: second visit, weak hours, birthday/event, bar combo, tournament, referral, VIP/TOP guest.
- Add limits: period, clubs, max uses, one per guest, minimum spend, group eligibility.
- Add anti-fraud notes and manual approval before any automatic reward workflow.

Acceptance criteria:

- A manager can create a promo bundle with clear price and expected margin.
- The UI explains the commercial tradeoff before launch.
- The system can link a promo bundle to a campaign and target group.

### MVP 3. Campaign Effect Analytics

Goal: measure whether marketing actions produced useful commercial effect.

- Add funnel: target group -> planned contacts -> completed contacts -> responded -> visited -> revenue -> bar -> repeat visits.
- Compare before/after windows for selected campaign.
- Show effect by club, group, channel, and responsible user.
- Separate store-scoped revenue from unallocated online top-ups when attributing campaign effect.
- Add CSV export for campaign results and contact outcomes.

Acceptance criteria:

- Commercial director sees which campaign produced visits and revenue.
- Campaign effect does not claim precision where attribution is uncertain.
- Online/unallocated top-ups are shown separately when they cannot be assigned to a club.

### Future Marketing Capabilities

- Automatic Telegram/MAX flows after legal/account/channel setup.
- Push/mobile app integrations if an approved channel exists.
- Guest-facing missions and gamification.
- Bonus budget limits and anti-fraud controls.
- Manual payout queue until a safe Langame write API is confirmed.
- AI suggestions for campaign goals, target groups, copy, and mechanics after enough campaign history exists.

### Key Data Rules

- Communication requires consent, consent history, and unsubscribe support.
- Campaign membership should be snapshotted so history does not change when a guest profile/group changes later.
- Marketing should not store documents or unnecessary personal data.
- Campaign results should preserve historical product, club, guest, and price context.
- Money in campaign reports must show `руб`; dates must use `дд.мм.гггг`; guests, visits, hours, contacts, and units must be labeled.

## Continuous Polish

- Continue polishing report table UX, filters, exports, and mobile layout based on live `leetplus.ru` review.
- Keep README, `PROJECT_STATE.md`, and this file aligned when workflow, data rules, production setup, or roadmap changes.
