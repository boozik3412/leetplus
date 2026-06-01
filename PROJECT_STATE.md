# LeetPlus Project State

Last updated: 2026-06-01

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

LeetPlus is an assortment analytics SaaS for computer clubs and club networks. It imports Langame data, normalizes goods across clubs into network SKU groups, and provides analytics for sales, stock, OOS risk, margin, recommendations, LFL, new products, and assortment quality.

The active strategic product direction is a multi-block operating system for club networks: guest-base analytics/CRM, assortment management, marketing, staff control, and staff operations. The product navigation is split into meaningful product blocks, and operational setup is separated into `Настройки` and `Синхронизация`.

Connected production Langame sources:

- `1337.langame.ru`
- `443.langame.ru`
- `46.langamepro.ru`

## Important Data Rules

- Sales history must remain stable when product names change.
- Sales facts keep snapshot fields such as product/store names at the moment of sale.
- Deleted or missing Langame nomenclature must not delete historical sales.
- Langame sync must not automatically set `canonicalProductId`.
- Product grouping into a canonical/network SKU happens only through analysis/manual confirmation.
- A rejected parsing suggestion should not delete existing product links.
- Already confirmed parsing groups should not be suggested again unless there is a real change/new item to review.
- Manual store names in LeetPlus should be preserved; sync may update address/activity/source linkage, but not overwrite user-facing names.
- Guest history should remain stable when a guest profile changes in Langame.
- Langame sync must not overwrite manual guest CRM statuses, notes, segments, communication consents, or LeetPlus-owned loyalty state.
- Guest personal data must be treated as sensitive data: phone, email, full name, birthday, and document fields require access control and careful storage decisions.
- Guest communications require explicit channel consent, consent history, and unsubscribe handling.
- Dashboard and report hub pages should show dense tables as compact previews; every full report opened in a separate page/window must include breadcrumbs.
- Langame sync must not overwrite LeetPlus-owned staff operations data: tasks, checklist facts, regulation acknowledgements, training results, notes, and assignments.

## Key Metrics

- Active SKU: SKU with current stock or sales in the last 14 days.
- New products: products whose first historical positive stock appeared in the last 90 days.
- OOS risk: stock expected to last 3 days or less based on average daily sales.
- No-sales report: should exclude items with zero stock and items that had arrivals during the viewed report period.
- Cost per unit: calculated from stock cost basis and used for profit, margin, markup, ABC, and reports.
- Dashboard custom period charts: should compare 8 analogous periods; the selected custom period is the latest segment.

## Current Feature Areas

- Dashboard: standalone main LeetPlus entry at `/dashboard`, executive network summary, compact filters, responsive header, KPI cards, trend charts, category weights/efficiency, active assortment, TOP SKU, guests/product/revenue summary, and load percent based on played hours divided by available PC-hours.
- Reports: collapsible report list, row-level sales detail report, summary export/email, automatic daily/weekly email digests, LFL, new products, recommendation workflow, OOS, no-sales, replenishment, ABC, top SKU/suppliers, assortment.
- Product parsing utilities: automatic analysis, safe confirmation/rejection, existing canonical SKU awareness, manual parsing page.
- Products/stores/directories: inline editing, multi-club filters, exports, manual store name preservation.
- Guest module: first production read-only layer is live, including data foundation sync, guest analytics dashboard with retention v1, visits heatmap v1, guest flow forecast v1, LTV v1, bonus load v1, full guest report with RFM v1 and churn risk v1, guest card, mini CRM fields, first staff-control report, and PC-count based load calculation.
- Marketing: campaigns, reusable promo bundles, standalone promo-bundle launches/usages/reconciliation, campaign effect economics, and `/marketing/missions` for mission templates, Langame-fact conditions, guest segments, store scope, budgets, limits, anti-fraud rules, and a manual reward queue before any Langame write API.
- Staff operations: Stage 8 has started with `STAFF_OPERATIONS_MODULE_TZ.md`, `/staff/directory` for the reusable employee identity layer with LeetPlus account, club, and Langame `working_shifts.user_id` mapping, `/staff/tasks` for tenant-scoped operational tasks with observers and quick views by today, overdue, my tasks, watched tasks, approval workflow, club, employee, shift, and status, `/staff/task-templates` for reusable task templates, `/staff/task-rules` for recurring task rules with daily/weekly/monthly/opening/closing schedules and safe manual launch, `/staff/notifications` for tenant-scoped and адресные staff signals from overdue important tasks, due-rules, failed/escalated checklists, urgent team-chat incidents, returned knowledge-base materials with reaction SLA, and critical operations-dashboard shift/cash risks, `/staff/shift-regulations` for constructing shift regulations with publication version history and employee acknowledgements, `/staff/checklist-templates` for reusable checklist templates, `/staff/checklists` for execution runs with required answers, evidence, review, return/escalation, and failed-item follow-up tasks, `/staff/checklists/report` for execution analytics by club, shift, employee, checklist, and escalations, `/staff/operations-dashboard` for operational discipline, club/employee ratings, repeated checklist issue detection, checklist escalation risks, and shift/cash signals from `/guests/staff-control`, `/staff/discipline` for warnings/fines from the administrator penalty template, `/staff/administrator-ratings` for the combined administrator rating, `/staff/salary` for administrator salary schemes and payout calculation, `/staff/knowledge-base` for standards and materials with folders, approval status, required-reading receipts, related standards, publication version snapshots, return-to-author notifications, reaction SLA, quick revision tasks, and article draft suggestions from repeated checklist failures, `/staff/ai-assistant` for safe deterministic AI-help drafts from staff workflows, `/staff/training-courses` for role/club-scoped learning paths, `/staff/training-profiles` for employee course progress, `/staff/readiness-report` for shift readiness and attestation admission, `/staff/onboarding` for administrator adaptation routes, `/staff/assessments` for tests/attestations with pass thresholds, attempt limits, result history, and expiration, and `/staff/attachments` API/proxy storage for tenant-scoped staff files used by evidence and materials.
- Inside-team communication: `/staff/team-chat` is the first tenant-scoped operational feed for default information/support/general channels, per-club channels, custom employee channels, announcements, incidents, pinned messages, read receipts, quick creation of staff tasks from chat messages, and automatic incident posts from failed checklist submissions without realtime infrastructure yet.
- Access control: `/users` manages tenant user accounts, system roles, tenant-specific custom roles, permission checkboxes, active status, password resets, one-time registration invite links, and whole-network or selected-club access scopes, including a standards manager role for training, regulations, checklists, administrator control, and attestations.
- Platform administration: `/administration` is a separate platform-admin-only control plane for tenants, Langame sources, diagnostics, tenant lifecycle actions, Langame source support actions, support notes, and filterable/exportable audit trail with expandable before/after/metadata details across all tenants; legacy `/admin` redirects there.
- Sync/admin UX: `/settings` is for Langame connection settings only; `/sync` is the dedicated synchronization page with one combined sync action for assortment/sales/revenue plus guests. Login and opening the executive dashboard no longer start hidden Langame background syncs; production data refresh is explicit through `/sync`, the dashboard manual refresh button, or the scheduled service endpoint. `GET /integrations/langame/routes-diagnostics` safely checks `/public_api/routes` through the stored Langame key and masks secret-like fields.
- Mail: Mail.ru/VK WorkSpace domain is configured; SMTP uses `reports@leetplus.ru`.

## Recent Work

- Added marketing AI suggestions v1 on `/marketing`: local safe drafts from campaign history, saved audiences, CRM leads, contact tasks, and promo bundles now suggest the next campaign goal, target group, mechanic, channel, message copy, reason, and manual next action without sending anything automatically.
- Added Staff AI assistant v1: API `/staff/ai-assistant`, page `/staff/ai-assistant`, sidebar entry, local deterministic manager summary, checklist drafts from shift regulations, short shift instructions, task decompositions from current risks, weak-spot recommendations from recurring checklist failures, and explicit guards that nothing is published or assigned without user confirmation.
- Added marketing missions v1: `MarketingMission`, `MarketingMissionReward`, API `/marketing/missions` and `/marketing/mission-rewards`, web proxies, `/marketing/missions` UI, sidebar entry, mission templates, Langame-fact conditions, guest audience/store scope, budget/limit/anti-fraud fields, and manual reward approval/payment statuses before any Langame write API.
- Expanded platform administration: tenant lifecycle statuses, lifecycle actions with slug confirmation and audit trail, Langame source support actions, support notes, production diagnostics, filterable CSV-exportable audit trail with compact event details, and inactive-tenant auth blocking for ordinary users while platform admins keep recovery access.
- Added visits heatmap v1 to the guest dashboard: `/guests` now groups session starts by weekday and hour, shows visits, unique guests, play hours, and the peak slot for weak-hour planning.
- Added retention v1 to the guest dashboard: `/guests` now calculates the selected-period new-guest cohort, second activity day, 7/14/30-day retention, average days to second activity, and new guests without repeat activity.
- Added RFM v1 to the guest full report: `/guests/report` now calculates recency, frequency, monetary value, a 3-15 score, RFM segment, RFM sorting, and CSV export columns.
- Added churn risk v1 to the guest full report: `/guests/report` now calculates individual activity interval, days without activity, risk threshold, 0-100 score, risk level, value at risk, churn-risk sorting, and CSV export columns.
- Added LTV v1 to guest analytics: `/guests`, `/guests/report`, guest cards, sorting, and CSV export now show lifetime guest revenue from game operations and bar purchases.
- Added bonus load v1 to guest analytics: `/guests`, `/guests/report`, guest cards, sorting, and CSV export now show the latest guest bonus balance snapshots, total network bonus debt, inactive bonus balance, bonus-to-period-revenue ratio, and top guests by bonus balance.
- Added guest flow forecast v1 to guest analytics: `/guests` now forecasts the next 7 days from weekday averages in the latest historical session window, with expected visits, active guests, play hours, peak/quiet days, and confidence.
- Added audit/history for Staff Operations knowledge-base SLA settings: `StaffKnowledgeSettingsEvent` records previous and new revision SLA policies, actor, and timestamp, and `/staff/knowledge-base` shows the compact history next to the SLA policy editor.
- Added knowledge-base suggestions from repeated checklist failures: `/staff/knowledge-base` now receives deterministic article draft suggestions from repeated failed checklist answers, with prefilled standard text, tags, materials, and checklist links.
- Hardened the standalone main dashboard navigation: `/dashboard`, root, query-string, trailing-slash, nested dashboard and mobile menu variants resolve to `Главная`, the home icon is always shown to authenticated users, while `Ассортимент` remains active only for explicit assortment routes; legacy `skuGrouping` dashboard links redirect server-side and are cleaned up client-side to a main dashboard URL, including filter changes on the main dashboard.
- Reinforced the standalone dashboard sidebar state: hover-open groups are scoped to the current pathname, so old assortment hover state cannot follow the user onto `/dashboard`, while product sections still open normally by hover from the standalone main page.
- Added campaign economics v1 to marketing effect analytics: campaign detail now shows budget, attributed revenue lift, ROI, payback status, cost per contact/result/visit, visit/bar lift, and a management recommendation, with the same fields in CSV/XLSX export.
- Added guest-audience eligibility to standalone marketing promo-bundle launches: saved guest groups can limit a launch independently from campaigns, and launch/usage summaries show that audience scope.
- Added quick views to `/staff/tasks`: today, overdue, my tasks, by club, by employee, by shift, and by status with counters, grouped drilldown cards, and API support for `view` and `shiftId` filters.
- Added observers to staff tasks: tenant-scoped `StaffTaskObserver`, create/update observer syncing, API/export support, watcher filter, `Наблюдаю` quick view, create-form checkboxes, and task-card observer display.
- Clarified compact sidebar states: `/dashboard` remains the standalone `Главная` entry, while product groups opened by hover no longer reuse the active-page green state.
- Added the Staff Operations internal notification center: `StaffNotification`, API `/staff/notifications`, page `/staff/notifications`, sidebar entry, idempotent signal sync from overdue important tasks, due recurring rules, failed/escalated checklists, urgent team-chat incidents, critical operations-dashboard shift/cash risks, plus acknowledge/resolve workflow.
- Added automatic recurring task rule scheduler for Staff Operations: `StaffTaskRecurringRuleRun` journal, duplicate protection by rule/due time, protected scheduled endpoint, API-side interval runner, UI due-run action, and latest run log in `/staff/task-rules`.
- Hardened the network dashboard navigation: `/dashboard`, `/dashboard/*`, and the site root resolve to `Главная`, while `Ассортимент` is active only on explicit assortment routes.
- Made the network dashboard a standalone main navigation entry: `/dashboard` now shows as `Главная`, has its own home icon, and no longer activates the assortment block.
- Added the first Staff Directory layer: `StaffMember`, API `/staff/directory`, page `/staff/directory`, sidebar entry, LeetPlus account link, club scope, role/status fields, and Langame `working_shifts.user_id` mapping independent of guest analytics.
- Added first tenant-scoped binary attachments for Staff Operations: `StaffAttachment`, API `/staff/attachments`, web proxy upload/download routes, and upload controls for task evidence, checklist evidence, shift-regulation materials, and knowledge-base materials.
- Expanded the Staff Operations knowledge base: articles now support folders, review status, required-reading flags, approval notes, related-standard links, and `StaffKnowledgeArticleVersion` snapshots when published.
- Added required-reading receipts for the Staff Operations knowledge base: employees can mark the current published article version as read, while managers see read coverage and pending users by target role/store scope.
- Expanded knowledge-base authoring with ready templates for cash desk, service, bar, technical support, and administrator hiring, plus separate custom-role capabilities for draft editing, review, and publication/archive workflow.
- Added the Staff Operations knowledge-base approval queue: returned articles, review/published queue filters, reviewer comments, and a workflow event journal for draft creation, review requests, returns, version publications, and archive actions.
- Connected returned knowledge-base materials to operational follow-up: returned articles now create addressable author notifications, `/staff/notifications` recognizes `KNOWLEDGE_BASE` signals, and the approval workflow automatically creates or updates an author revision task with the reviewer as observer.
- Added reaction SLA for returned knowledge-base materials: returned articles store `returnedAt`/`revisionDueAt` and optional `revisionSlaDays`, show SLA badges and editable SLA days in `/staff/knowledge-base`, fall back to tenant-level `StaffKnowledgeSettings` presets by role and required material type, keep an audit/history of settings changes, surface due dates in author notifications, and auto-created revision tasks from approval workflow are filterable through `/staff/tasks?view=approval`.
- Recorded the backlog rule that new backlog entries are written in Russian and that the remaining English backlog wording should be translated in a separate documentation pass.
- Made `/reports` lighter by removing the full sales-detail preload from the first screen; the full table remains available through its dedicated report page and email action.
- Added API-side regular report digests: daily email digest, weekly commercial email report with XLSX attachment, `/reports` send UI, protected scheduled endpoint, automatic scheduler, and duplicate-protected run journal.
- Expanded Stage 6 commercialization: `/commercial/audit` shows live audit signals, `/commercial/demo` shows prepared demo data without Langame setup, and `/commercial/tariffs` packages the product into tariff levels.
- Tightened marketing campaign contact workflow: campaign detail can create the linked CRM task from the contacts tab, contact results save to `marketingCampaignId`, and campaign effect tracks group/task/responsible/channel outcomes.
- Expanded Stage 8 Staff Operations: staff tasks now have execution comments, evidence links, and an audit journal for create/update/status/comment/evidence events.
- Added task templates for Staff Operations: `StaffTaskTemplate`, API `/staff/task-templates`, page `/staff/task-templates`, reusable packs for common club operations, default deadline offsets, labels, and task creation from a template.
- Added recurring task rules for Staff Operations: `StaffTaskRecurringRule`, API `/staff/task-rules`, page `/staff/task-rules`, daily/weekly/monthly/opening/closing schedules, template linkage, next-run preview, and safe manual task creation before scheduler automation.
- Added the first shift-regulation constructor for Stage 8 MVP 2: draft/published/archived standards for opening/closing/cash/bar/PC-zone shift work.
- Added employee acknowledgement tracking for published shift regulations: required counts are calculated by role and club scope, users can confirm the current regulation version, and republishing creates a new acknowledgement version.
- Added versioned publication snapshots for shift regulations: existing published regulations are backfilled, new publications keep title/scope/sections history, and the constructor shows the version log.
- Added attached link materials for shift regulations: documents, files, images, videos, and external URLs can be stored on a regulation and snapshotted into each published version.
- Added day and night administrator regulation templates from the current `Регламент.docx` into the shift-regulation constructor.
- Added the first shift-checklist execution workspace for Stage 8 MVP 2: published regulation snapshots can become checklist runs, block submission without required evidence, and create follow-up staff tasks from failed items.
- Added reusable checklist templates for Staff Operations: `StaffChecklistTemplate`, API `/staff/checklist-templates`, a dedicated `/staff/checklist-templates` constructor, sidebar entry, creation from published regulations, and checklist runs from either published regulation snapshots or active template snapshots.
- Added employee-facing sandbox previews for Staff Operations builders: `/staff/shift-regulations`, `/staff/checklist-templates`, `/staff/task-templates`, `/staff/training-courses`, `/staff/onboarding`, and `/staff/knowledge-base` can now show a test flow with fake answers/evidence, required-field readiness, employee-facing layout, and no real tasks, training progress, acknowledgements, or operational facts.
- Added checklist escalation for Staff Operations: managers can escalate a checklist under review, the status is visible in workspace filters, execution reports, operations dashboard risk cards, and creates a pinned urgent incident in `/staff/team-chat`.
- Added the first training-course constructor for Stage 8 MVP 3: `StaffTrainingCourse`, API `/staff/training-courses`, page `/staff/training-courses`, role/club scope, required courses, due days, and ordered steps from knowledge-base articles, text, links, and tasks.
- Added the first onboarding-plan constructor for Stage 8 MVP 3: `StaffOnboardingPlan`, API `/staff/onboarding`, page `/staff/onboarding`, role/club scope, duration, and ordered adaptation steps linked to courses, task templates, checklist templates, regulations, text, and external links.
- Added tests and attestations for Stage 8 MVP 3: `StaffAssessment`, `StaffAssessmentResult`, API `/staff/assessments`, page `/staff/assessments`, role/club scope, pass threshold, attempt limit, expiration, auto-scored choice questions, free-text evidence answers, and result history.
- Linked updated shift regulations to attestations: a regulation can require a retake of an active test or attestation after publication, and the selected assessment is saved in the published version snapshot.
- Added employee training profiles for Stage 8 MVP 3: `StaffTrainingProgress`, API `/staff/training-profiles`, page `/staff/training-profiles`, course assignment by role/club, progress updates, overdue learning, certificates, and linked test/attestation status by employee.
- Added the readiness manager report for Stage 8 MVP 3: API `/staff/readiness-report`, page `/staff/readiness-report`, staff sidebar link, readiness status by employee, required course gaps, failed tests, failed/expired attestations, and pending shift-regulation acknowledgements.
- Added standard checklist template packs for Staff Operations: cash desk, PC zone, inventory handover, and administrator training can be loaded as editable drafts in `/staff/checklist-templates`.
- Added the checklist execution report for Staff Operations: API `/staff/checklists/report`, page `/staff/checklists/report`, staff sidebar link, period/status/type/club/employee/search filters, summary cards, grouped views by club/shift/employee/checklist, and latest run details.
- Added the first Staff Operations knowledge base: `StaffKnowledgeArticle`, API `/staff/knowledge-base`, page `/staff/knowledge-base`, search, categories, tags, role/store visibility, draft/published/archive statuses, and structured training materials by text, file, image, video, and external link.
- Added tenant user roles and account issuing: owner/system admin can create and edit users for managers, marketers, buyers, club managers, standards managers, senior administrators, and club administrators; inactive users cannot log in or use protected API routes.
- Added the `STANDARDS_MANAGER` role for staff standards: training, administrator hiring, regulations, checklists, work standards, administrator control, and attestations.
- Added tenant-specific custom roles in `/users`: owners/system admins can create club roles, choose section/action permissions, assign them to accounts, and the API guard checks those permissions for protected route groups.
- Added one-time registration invite links in `/users`: owners/system admins can preconfigure a system/custom role plus whole-network or selected-club scope, copy the link, and the employee completes registration through `/register?invite=...`.
- Added a separate `Администрирование` navigation block for platform admins and moved the platform control plane from `/admin` under assortment to `/administration`.
- Expanded the inside-team operational feed: `StaffChatChannel`, `StaffChatChannelMember`, `StaffChatMessage`, `StaffChatReadReceipt`, API `/staff/team-chat`, web proxies, sidebar entry, default network/club channels, custom employee channels, creating staff tasks from messages, and surfacing failed checklist submissions as chat incidents.
- Added the first operational discipline dashboard for Staff Operations: API `/staff/operations-dashboard`, page `/staff/operations-dashboard`, staff sidebar link, done-on-time/overdue/failed/returned/unchecked metrics, club and employee ratings, readiness blockers, repeated checklist issue detection, and current risk routing back to tasks/checklists.
- Added the administrator warning/fine system from the provided Excel template: API `/staff/discipline`, page `/staff/discipline`, default categories/rates, two warnings before fines, escalating fine amounts, active/canceled/reset records, and network/club enable switches.
- Added the administrator rating page `/staff/administrator-ratings`: regulation acknowledgements, checklist quality, attestation status, warnings and fines are combined into one score with per-criterion details.
- Added XLSX/CSV exports for Staff Operations: tasks, checklist execution report, training profiles/results, and discipline violations can be downloaded with current filters.
- Added the administrator salary workspace `/staff/salary`: salary schemes by network or club, fixed/shift/hour rates, bonus and penalty constructor, discipline fine inclusion, and payout calculation from tasks, checklists, linked shifts, warnings, and fines.
- Connected `/staff/operations-dashboard` to `/guests/staff-control` shift facts: the dashboard now summarizes shifts, linked/unlinked operators, shift hours, cash/payment amount, refunds, incassation, middle check, and shows shift/cash anomaly cards with drilldowns.
- Added recommendation workflow state: persisted statuses, responsible roles, financial effect, and an interactive recommendations queue.
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
- Completed the Stage 2 commercial reports layer: turnover/slow-SKU control with money in stock, plan/fact by network/club/category/supplier, and supplier scorecard with write-offs, OOS, slow/frozen SKU, problem categories, and delivery-data limitation labels.
- Completed Stage 3 assortment matrix: product assortment roles, mandatory SKU flag, product x club matrix API/table, and quality index by network, club, and category.
- Prepared `GUEST_MANAGEMENT_MODULE_TZ.md`: a draft specification for a future separate "Guests" module. Development is not started until the scope is approved.
- Started MVP 1 for the "Guests" module: added guest data foundation schema, Langame guest endpoint client methods, and a protected manual foundation sync/profiling endpoint.
- Added the production "Guests" area with collapsible left-nav group, `/guests` dashboard, `/guests/report` full report, `/guests/[id]` guest card, encrypted phone/full-name storage, and LeetPlus-only CRM fields.
- Added default exclusion of administrator guest groups from client analytics while keeping admin groups selectable in filters for explicit inspection.
- Added first `/guests/staff-control` report: staff/admin group slice, staff activity KPIs, staff table, and operation-log summary. Current limitation: `all_operations_log` is not yet reliably linked to a specific administrator identity.
- Added safe staff-control diagnostics: guest foundation sync now probes `log_cash_transaction/list` and `working_shifts/list` and stores only field names/non-empty counts in the profile JSON, not raw payload values.
- Added executive network dashboard on `/dashboard`: combined money, guests, assortment, and load summary with direct navigation to relevant reports.
- Added PC-count foundation from Langame `global/types_of_pc_in_clubs/list` and `global/linking_pc_by_type/list`; guest load is calculated as played hours / possible PC-hours.
- Moved synchronization controls out of `/settings` into `/sync`; settings now contain only Langame API key/domains/sources, and sync has one combined action for all data.
- Moved `/sync` into a separate left-nav `Управление` block with `/settings`, added Langame date-format fallback for date endpoints, compacted repeated sync history errors, and made stale guest sync runs older than 2 hours expire automatically instead of showing endless `RUNNING`.

## Product Backlog

The product backlog has moved to `BACKLOG.md`. Keep `PROJECT_STATE.md` focused on the current state, workflow, production context, and data rules.

## Useful Commands

```powershell
git -C 'C:\Users\ALIENWARE\Desktop\leetplus' status --short
node 'C:\Users\ALIENWARE\Desktop\leetplus\.codex-tools\node_modules\pnpm\bin\pnpm.cjs' -r build
git -C 'C:\Users\ALIENWARE\Desktop\leetplus' log --oneline -8
```
