# Interfaces / execution boundaries

Base f526aa10f60c5f7c0f68eb5520e86b23f65f4351, checkout C:/Users/ALIENWARE/Documents/New project/leetplus-assortment-action-center, branch codex/executive-dashboard-20260915, PR207. Existing Nest/Prisma/Next16.2.4/React19.2.4/Tailwind/Phosphor/Recharts stay. Read applicable AGENTS; for staff/auth/scope read canonical security contract completely. No production/provider/sync/backfill/auto-assign/notification/schema effects; do not install dependencies or read/print real secrets. Coordinator: task Спланировать открытый тест; controller/network effect owner: Тикеты. No competing server writes, fresh control baseline required before future rollout.

## Границы, решённые в спецификации

| Модуль | Владеет | Выставляет | Прячет |
|---|---|---|---|
| Receipt projection | canonical identity/grouping, coverage и admission current/previous | averageProductCheck ExecutiveMetric + receiptEvidence в existing executive-summary и details | чтение фактов, ambiguity, группировки и denominator |
| Staff priority reader | current scoped obligations, source capabilities, counts/paging | GET staff/operations-dashboard/priorities и GET staff/operations-dashboard/priorities/items | Prisma, assignment/readiness reuse, nullable/network membership и лимиты |
| Priority presentation | eligibility, стабильный порядок, top3/all, качество sources и targets | сборку карточек и read-only priority details | formatting и UI navigation state; не считает финансовые коэффициенты |
| Audit/docs | полный охват разделов и admission границы | проверенную матрицу и source-only handoff | не превращает рекомендации в выполненный код |

## Fixed wire before parallel authors

1. ExecutiveMetricKey adds averageProductCheck; unit RUB, grain PRODUCT_RECEIPT. Generic ExecutiveMetric gets optional receiptEvidence:
   `{receiptCount:number|null,operations:{covered:number,total:number,percent:number|null},revenue:{covered:number,total:number,percent:number|null},ambiguousIdentityCount:number}`.
   Existing coverage retains STORE_DAYS meaning. Operations/revenue denominator refers to saved facts from confirmed store-days and must be labelled accordingly. Revenue coverage ratio can be null at zero; AVAILABLE is not rejected just because valid free receipts have zero revenue. No NaN/Infinity; do not invent percentage for unsuitable signed/zero basis. Receipt mean/comparison use existing monetary precision; avoid floating noise and display small real declines with enough precision.
   API returns the ninth metric in summary/clubs/days. Web must tolerate older response missing this optional new metric as unavailable (no crash/no invented value). Existing top5 cards/ExecutiveTrendMetric are unchanged. Details accepts averageProductCheck and shows two coverage bases, receipt count and ambiguity/reason.

2. StaffPriorityKind exactly: TASKS_OVERDUE | CHECKLISTS_OVERDUE | CHECKLISTS_REVIEW | TRAINING_INCOMPLETE | REGULATIONS_UNACKNOWLEDGED.
   StaffPriorityState: AVAILABLE | PARTIAL | UNAVAILABLE | FAILED (separate from ExecutiveMetric states).
   StaffPriorityScope: `{storeIds:string[],includesNetworkAssignments:boolean}`.
   StaffPriorityMetric: `{kind:StaffPriorityKind,value:number|null,state:StaffPriorityState,reason:string|null,unit:'TASKS'|'CHECKLISTS'|'EMPLOYEES',coverage:{observed:number,total:number|null,limitCodes:string[]}|null}`.
   StaffPrioritySummary: `{scope:StaffPriorityScope,evaluatedAt:string,metrics:Record<StaffPriorityKind,StaffPriorityMetric>}`.
   StaffPriorityQuery: repeated storeIds; no financial period or caller-overridden evaluation clock. Missing IDs may resolve all active network stores for a direct permitted API caller; the dashboard with zero accepted stores must not send an empty selection as an all-network fallback.
   StaffPriorityDetailsQuery adds required kind, optional cursor, limit (default20/max100).
   StaffPriorityItem: `{id:string,title:string,status:string|null,dueAt:string|null,store:{id:string,name:string}|null,employee:{id:string,name:string|null}|null,missingCourses?:Array<{id:string,title:string}>,missingRegulations?:Array<{id:string,title:string,version:number}>,target:{type:'TASK'|'CHECKLIST'|'TRAINING_PROFILE'|'REGULATION_CATALOG',id?:string,userId?:string}|null}`.
   StaffPriorityDetails: `{scope:StaffPriorityScope,evaluatedAt:string,kind:StaffPriorityKind,metric:StaffPriorityMetric,items:StaffPriorityItem[],page:{limit:number,nextCursor:string|null,hasMore:boolean}}`.
   Training/regulation count unit is employees; details group obligations per employee, not one row per course. Summary returns counts/source metadata, not employee lists or messages. Items expose only fields needed by this authorized read flow; no emails/PII-rich descriptions.

3. GET /staff/operations-dashboard/priorities and /staff/operations-dashboard/priorities/items retain controller NETWORK+JWT+Roles and view_staff_control; restrict methods to dashboard managerial roles if required for consistency. Per-source view capabilities and training management remain mandatory. Items for unavailable feature permission deny, not empty success; summary represents source unavailable with null value. FreshStoreScope resolves requested store IDs; no silent broadening. A missing completion record proves non-completion only when the relevant read is complete: caps/truncated result/ack history must never create a false positive. PARTIAL count allowed only for independently confirmed positives; otherwise null/unavailable.

4. Web staff transport lives in new lib/staff-priorities.ts, server-authenticated same as current API helpers. Details page /dashboard/priorities supports kind/storeIds/cursor, and structured financial return context for Back (not an arbitrary external returnTo). It reads current staff state, explicitly labels refresh/evaluatedAt, never applies financial cutoff as staff deadline. No unsupported storeIds query sent to old staff pages: item links use taskId/runId/userId contracts. Regression on older API404 means unavailable source, not fallback to heavy/broader old dashboard.

5. Generic priority UI projection is internal Web type, not a new server business endpoint: stable id/kind/domain/title/caption/severity/target and sources. 01 may extract business-financial builder and list while adding its vertical feature. 03 takes ownership after01 and combines staff, stock and source states. T02 never edits main executive-dashboard/priority-list files. Query/payload changes need root acknowledgement and a message to affected author before editing.

## Zones / handoff

01 owns API common receipt grouping + executive-contract + dashboard service/spec; Web dashboard-executive mirror, executive-details page, executive-dashboard existing financial priorities and any newly extracted executive-priority-* presentation files. No staff or HTTP inventory edits.
02 owns API staff priority reader/types/tests, operations controller/module, narrow additive training/readiness scope/coverage metadata if required, exact new route inventory/capability mapping tests; Web new staff-priorities transport and /dashboard/priorities details page. No executive financial/dashboard files or canonical docs.
03 starts after01+02, owns main executive priority composition/streaming/list and main dashboard page, adapting staff DTO already fixed; lowStock/noSales plus source metadata. It may update financial priority builder after01. No API code or staff details except coordinated small adapter needs.
04 owns scoped PG/HTTP integration tests under apps/api/test, external UI fixture/evidence and docs. It starts after01+02 for API proof; final browser run waits for03 freeze. No app implementation changes. Docs use own source-only sections, preserving controller owner changes.

## Commands and evidence

Use .autopilot/run-priorities-gate.ps1 (root creates it from the existing verified wrapper), cached pnpm10.33.2 via node C:/Users/ALIENWARE/AppData/Local/node/corepack/v1/pnpm/10.33.2/bin/pnpm.cjs. Gate examples args --filter api exec jest --runInBand --runTestsByPath src/...spec.ts; API tsc --noEmit -p tsconfig.build.json; Web typecheck/build. Direct ESLint/Prettier JS entrypoint from correct package cwd; never pnpm.cmd/npx.cmd with parentheses, &, or JS snippets on Windows. No installs.

Evidence root C:/Users/ALIENWARE/Documents/New project/deploy-evidence/executive-priorities-20260915; complete ERROR_LOG.md before retries, append cause+changed condition, separate stdout/stderr/exit for each gate. Existing f526 API3571/PG16 evidence is baseline only; run affected tests and appropriate full API once code stable. Root owns full build, PG startup and final CI to avoid duplicate .next writers or mixed results. Stop local fixture before rebuilding .next. User already allowed local Chromium; existing synthetic issuer/fixtures available in prior executive evidence, no real credentials/canary.

Scripts returning after ordinary PowerShell work may leave LASTEXITCODE unset: use ErrorActionPreference=Stop for script exceptions, check LASTEXITCODE only immediately after native command. No global process kills; stop only verified recorded fixture PIDs/ports. No live db/production/network/controller writes by agents.

## Domain scout evidence

receipt-v1 CSV imports: fact-csv-import.service.ts accepts Чек/Заказ and hashes identity; buildReceiptMetrics legacy grain provider/domain/store/identity. No cross-date uniqueness contract. Read-only staff chain getDashboard -> getReport -> getProfiles contains only reads; upsert is confined to updateProgress. Legacy dashboard and checklist OVERDUE differ for RETURNED/ON_REVIEW: use new spec semantics, not an accidental copy. Training DTO currently lacks target user.accessScope and cap metadata; add only necessary evidence, preserve private/custom visibility. Required published regs use current-version acknowledgements; knowledge read receipts are not part of readiness. CRM lacks store binding, support lacks SLA; other candidates remain audit findings, not invented priorities.
