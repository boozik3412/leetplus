# LeetPlus Project State

Last updated: 2026-05-31

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

- Dashboard: executive network summary, compact filters, responsive header, KPI cards, trend charts, category weights/efficiency, active assortment, TOP SKU, guests/product/revenue summary, and load percent based on played hours divided by available PC-hours.
- Reports: collapsible report list, row-level sales detail report, summary export/email, automatic daily/weekly email digests, LFL, new products, recommendation workflow, OOS, no-sales, replenishment, ABC, top SKU/suppliers, assortment.
- Product parsing utilities: automatic analysis, safe confirmation/rejection, existing canonical SKU awareness, manual parsing page.
- Products/stores/directories: inline editing, multi-club filters, exports, manual store name preservation.
- Guest module: first production read-only layer is live, including data foundation sync, guest analytics dashboard, full guest report, guest card, mini CRM fields, first staff-control report, and PC-count based load calculation.
- Staff operations: Stage 8 has started with `STAFF_OPERATIONS_MODULE_TZ.md`, `/staff/tasks` for tenant-scoped operational tasks, `/staff/shift-regulations` for constructing shift regulations with publication version history and employee acknowledgements, `/staff/checklist-templates` for reusable checklist templates, `/staff/checklists` for execution runs with required answers, evidence, review, and failed-item follow-up tasks, `/staff/checklists/report` for execution analytics by club, shift, employee, and checklist, `/staff/knowledge-base` for standards and materials, `/staff/training-courses` for role/club-scoped learning paths, and `/staff/onboarding` for administrator adaptation routes.
- Inside-team communication: `/staff/team-chat` is the first tenant-scoped operational feed for default information/support/general channels, per-club channels, custom employee channels, announcements, incidents, pinned messages, read receipts, quick creation of staff tasks from chat messages, and automatic incident posts from failed checklist submissions without realtime infrastructure yet.
- Access control: `/users` manages tenant user accounts, system roles, tenant-specific custom roles, permission checkboxes, active status, password resets, one-time registration invite links, and whole-network or selected-club access scopes, including a standards manager role for training, regulations, checklists, administrator control, and attestations.
- Platform administration: `/administration` is a separate platform-admin-only control plane for tenants, Langame sources, and recent sync jobs across all tenants; legacy `/admin` redirects there.
- Sync/admin UX: `/settings` is for Langame connection settings only; `/sync` is the dedicated synchronization page with one combined sync action for assortment/sales/revenue plus guests.
- Mail: Mail.ru/VK WorkSpace domain is configured; SMTP uses `reports@leetplus.ru`.

## Recent Work

- Made `/reports` lighter by removing the full sales-detail preload from the first screen; the full table remains available through its dedicated report page and email action.
- Added API-side regular report digests: daily email digest, weekly commercial email report with XLSX attachment, `/reports` send UI, protected scheduled endpoint, automatic scheduler, and duplicate-protected run journal.
- Expanded Stage 6 commercialization: `/commercial/audit` shows live audit signals, `/commercial/demo` shows prepared demo data without Langame setup, and `/commercial/tariffs` packages the product into tariff levels.
- Tightened marketing campaign contact workflow: campaign detail can create the linked CRM task from the contacts tab, contact results save to `marketingCampaignId`, and campaign effect tracks group/task/responsible/channel outcomes.
- Expanded Stage 8 Staff Operations: staff tasks now have execution comments, evidence links, and an audit journal for create/update/status/comment/evidence events.
- Added task templates for Staff Operations: `StaffTaskTemplate`, API `/staff/task-templates`, page `/staff/task-templates`, reusable packs for common club operations, default deadline offsets, labels, and task creation from a template.
- Added the first shift-regulation constructor for Stage 8 MVP 2: draft/published/archived standards for opening/closing/cash/bar/PC-zone shift work.
- Added employee acknowledgement tracking for published shift regulations: required counts are calculated by role and club scope, users can confirm the current regulation version, and republishing creates a new acknowledgement version.
- Added versioned publication snapshots for shift regulations: existing published regulations are backfilled, new publications keep title/scope/sections history, and the constructor shows the version log.
- Added attached link materials for shift regulations: documents, files, images, videos, and external URLs can be stored on a regulation and snapshotted into each published version.
- Added day and night administrator regulation templates from the current `Регламент.docx` into the shift-regulation constructor.
- Added the first shift-checklist execution workspace for Stage 8 MVP 2: published regulation snapshots can become checklist runs, block submission without required evidence, and create follow-up staff tasks from failed items.
- Added reusable checklist templates for Staff Operations: `StaffChecklistTemplate`, API `/staff/checklist-templates`, a dedicated `/staff/checklist-templates` constructor, sidebar entry, creation from published regulations, and checklist runs from either published regulation snapshots or active template snapshots.
- Added the first training-course constructor for Stage 8 MVP 3: `StaffTrainingCourse`, API `/staff/training-courses`, page `/staff/training-courses`, role/club scope, required courses, due days, and ordered steps from knowledge-base articles, text, links, and tasks.
- Added the first onboarding-plan constructor for Stage 8 MVP 3: `StaffOnboardingPlan`, API `/staff/onboarding`, page `/staff/onboarding`, role/club scope, duration, and ordered adaptation steps linked to courses, task templates, checklist templates, regulations, text, and external links.
- Added standard checklist template packs for Staff Operations: cash desk, PC zone, inventory handover, and administrator training can be loaded as editable drafts in `/staff/checklist-templates`.
- Added the checklist execution report for Staff Operations: API `/staff/checklists/report`, page `/staff/checklists/report`, staff sidebar link, period/status/type/club/employee/search filters, summary cards, grouped views by club/shift/employee/checklist, and latest run details.
- Added the first Staff Operations knowledge base: `StaffKnowledgeArticle`, API `/staff/knowledge-base`, page `/staff/knowledge-base`, search, categories, tags, role/store visibility, draft/published/archive statuses, and structured training materials by text, file, image, video, and external link.
- Added tenant user roles and account issuing: owner/system admin can create and edit users for managers, marketers, buyers, club managers, standards managers, senior administrators, and club administrators; inactive users cannot log in or use protected API routes.
- Added the `STANDARDS_MANAGER` role for staff standards: training, administrator hiring, regulations, checklists, work standards, administrator control, and attestations.
- Added tenant-specific custom roles in `/users`: owners/system admins can create club roles, choose section/action permissions, assign them to accounts, and the API guard checks those permissions for protected route groups.
- Added one-time registration invite links in `/users`: owners/system admins can preconfigure a system/custom role plus whole-network or selected-club scope, copy the link, and the employee completes registration through `/register?invite=...`.
- Added a separate `Администрирование` navigation block for platform admins and moved the platform control plane from `/admin` under assortment to `/administration`.
- Expanded the inside-team operational feed: `StaffChatChannel`, `StaffChatChannelMember`, `StaffChatMessage`, `StaffChatReadReceipt`, API `/staff/team-chat`, web proxies, sidebar entry, default network/club channels, custom employee channels, creating staff tasks from messages, and surfacing failed checklist submissions as chat incidents.
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
