# LeetPlus Backlog

Last updated: 2026-05-21

This file is the source of truth for product backlog, near-term roadmap, planned modules, and deferred ideas. `PROJECT_STATE.md` should stay focused on current project state, workflow, production context, and data rules.

## Status Labels

- Done: implemented and available or ready for production verification.
- Current risk: known production or data-quality risk that can affect existing behavior.
- Current limitation: known boundary of the current implementation.
- Next: near-term implementation candidate.
- Planned: accepted direction, not necessarily next in development.

## Stage 1. Management Dashboard

Status: implemented; remains in production UX polish mode.

- Done: first screen is focused on commercial control: revenue, gross profit, margin, sold units, OOS risk, stock, management focus, actions, and "what changed".
- Done: current/full period selectors, default current-day view, European date formatting, report anchors, responsive fixes, and compact report previews.
- Done: executive summary now combines total revenue, guests, assortment and load; the load metric uses PC capacity when PC count is available from Langame/global endpoints.
- Done: "What changed" now compares the latest full day against the previous full day for current-day mode; other periods keep analogous-period comparison.
- Done: "Main focus" includes money units in financial values and links "Money at risk" to the hybrid assortment-loss report.
- Done: dashboard auto-sync now refreshes both assortment/revenue data and guest foundation data, so the executive dashboard is responsible for all first-screen metrics.
- Done: current-day guest and load metrics count sessions by overlap with the selected period, so overnight sessions contribute to the current day instead of only to the day they started.
- Current risk: production still needs live verification that Langame returns enough PC context for all clubs; if load remains `нет данных`, inspect latest guest sync profile endpoint errors/field counts or VDS API logs.
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
- Done: dashboard revenue uses the selected-period network revenue explicitly, and successful login can trigger a daily catch-up sync when Langame data is stale.
- Done: administrator comparison now includes compact shift-level details with shift ID, period, club, cash, refunds, incassation, bar revenue, and anomaly signals.
- Done: `/guests/staff-control/operations` now has a dedicated operations report with semantic categories for refunds/cancellations, discounts/bonuses, cash, guests, service operations, filters, sorting, and responsive cards.
- Current limitation: `all_operations_log` is stored and summarized, but it still does not expose a reliable administrator identifier. `log_cash_transaction/list` currently returns errors on production sources, so cashier analytics starts from working shifts.
- Current limitation: PC-count parsing is defensive because real `global/*` payload shape may differ by Langame source; production verification should confirm `computerCount` is filled for each club.
- Planned data foundation: guests, guest groups, balances, bonus balances, sessions, transactions, all operations log, product expenses by guest, clubs, tariffs, shifts, and PC context.
- Next: connect operation categories to concrete administrator shifts when Langame exposes a reliable operator identifier in operation/cash logs; until then, use shift metrics plus operation-log category totals side by side.
- Next: verify production `/dashboard` current-day load percentage after deploy of the session-overlap calculation.
- Next: add export for `/guests/report` and `/guests/staff-control`, then saved filters/audiences.
- Planned analytics: RFM, retention, churn risk, heatmaps, LTV, bonus load, campaign effect, and guest-flow forecasts.
- Planned CRM layer: segments, saved audiences, CRM statuses, notes, tasks, communication history, and next-best-action recommendations.
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

## Continuous Polish

- Continue polishing report table UX, filters, exports, and mobile layout based on live `leetplus.ru` review.
- Keep README, `PROJECT_STATE.md`, and this file aligned when workflow, data rules, production setup, or roadmap changes.
