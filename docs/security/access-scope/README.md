# AccessScope: документация открытого теста

| Поле                           | Значение                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| Статус                         | Active                                                                                              |
| Версия контракта               | 1.9.0                                                                                               |
| Дата                           | 27.07.2026                                                                                          |
| Владелец                       | LeetPlus engineering                                                                                |
| Связанный backlog              | `BETA-SEC-003`, `BETA-SEC-006`, `BETA-IAM-001..003`, `BETA-CUT-001`, `BETA-CUT-003`, `BETA-CUT-008` |
| Исходный baseline              | `eb7ad9ef7d4783c47a7ddb5efbc271e5eb8a2fe2`                                                          |
| Schema-only candidate          | `28724008192442c03f35fcc46ff7de78cdead642` — not deployed                                           |
| Strict application candidate   | `df993a9d04fdb48809868555b0d040d52848e3ee` — not deployed                                           |
| Attachment ACL baseline        | `1207c63cacedba05937d4a96a03a8dfd11751d2e` — not deployed                                           |
| `STAFF_TASK` adoption          | `f0a6bccfdd26d5b782c03f0b23445a3d23080058` — not deployed                                           |
| Recurring actor HTTP           | `cbd7a6b426c4e9fd9e29c085eeb8547d88249ca5` — not deployed                                           |
| Staff task integrity inventory | `56d615437ecfcb90db252016d3e5b83f3f545578` — not run on production                                  |

Это каноническая документация server-side области доступа для перехода LeetPlus к
invite-only открытому тесту. Она отвечает на вопросы:

- кто может работать со всей сетью, а кто — только с выбранными клубами;
- где хранится это решение и почему JWT не является источником истины;
- как безопасно классифицировать текущую сеть из четырёх клубов;
- в каком порядке подключать users/roles, персонал, коммуникации, геймификацию и
  ассортимент;
- какие проверки обязательны до выдачи внешнего доступа.

## Зафиксированный контекст

- Четыре текущих клуба — четыре `Store` одного существующего `Tenant`.
- Они не разделяются на четыре tenant и не переносятся в новую сеть.
- Текущий `tenantId` и данные клубов сохраняются.
- Production и operational tenant не изменяются автоматически из этой ветки.
- Каждая новая независимая сеть получает отдельный `Tenant`.
- Первый внешний тест остаётся invite-only.

## Пакет документов

1. [ADR: источник полномочий](./v1/adr-0001-access-scope-authority.md) — почему
   выбран persisted `NETWORK | STORES`.
2. [Нормативный контракт](./v1/access-scope-contract.md) — обязательное поведение
   API, списков, detail, агрегатов, файлов и фоновых процессов.
3. [Runbook миграции и отката](./v1/migration-rollout-rollback-runbook.md) —
   preflight, expand, классификация, shadow, enforce и rollback.
4. [Матрица внедрения по модулям](./v1/module-adoption-matrix.md) — surfaces,
   порядок и критерии `VERIFIED`.
5. [Стратегия тестирования](./v1/test-strategy.md) — topology двух tenant,
   негативные сценарии и release gates.
6. [План внедрения для персонала и коммуникаций](./v1/staff-communications-adoption-plan.md) —
   `INVENTORY` девяти staff/attachments/chat surfaces, attachment backfill,
   порядок внедрения и exit criteria.
7. [ACL вложений: модель, миграция и ввод в эксплуатацию](./v1/attachment-acl-rollout.md) —
   lifecycle файла, parent-aware authorization, EXPAND/dual-write/backfill,
   quarantine, activation gates и rollback.
8. [ACL вложений: implementation checkpoint](./v1/attachment-acl-implementation-checkpoint.md) —
   фактически реализованные schema/runtime flows, 155 migrations, проверки,
   текущие ограничения и точные следующие шаги.
9. [План templates/recurring tasks](./v1/staff-task-catalog-adoption-plan.md) —
   route/action/job inventory, подтверждённые cross-store разрывы, безопасная
   materialization policy и следующий implementation slice.
10. [Task catalog: implementation checkpoint](./v1/staff-task-catalog-implementation-checkpoint.md) —
    scoped template CRUD/launch, shared materializer, catalog audit, проверки и
    оставшиеся recurring/scheduler блокеры.
11. [Recurring actor HTTP: implementation checkpoint](./v1/staff-task-recurring-http-implementation-checkpoint.md) —
    scoped Rule CRUD/manual/interactive due, Store/participant lock contract,
    IANA/DST schedule, PostgreSQL race evidence и background containment.
12. [Staff task catalog integrity inventory](./v1/staff-task-integrity-inventory-runbook.md) —
    read-only legacy scan, reason-code gate и порядок
    `INVENTORY → RECONCILE → EXPAND → VALIDATE`.

Release evidence хранится в `evidence/<release-sha>/`. Evidence не содержит
секретов, токенов, email, телефонов или необработанных production ID.

## Текущая стадия

`DESIGN ACCEPTED → IMPLEMENTED CANDIDATE / EXPAND + CHAT/TASK PARENT ADOPTION`.

До завершения классификации существующих аккаунтов и модульной матрицы решение
для внешнего доступа остаётся `NO-GO`. Отсутствующий или противоречивый scope
обрабатывается fail-closed.

`EXPAND` schema и strict application — два отдельных activation шага. Текущий
candidate нельзя передавать в auto-deploy как единый production bundle:
сначала применяется schema-only migration, затем выполняется явная
классификация, и только при нуле unresolved active subjects включается strict
reader.

Текущий общий schema candidate содержит 156 миграций, latest —
`20260727120000_staff_task_catalog_audit_expand`; attachment ACL checkpoint
завершается миграцией
`20260727113000_staff_attachment_acl_invariant_hardening`. Native bind и
parent-aware reader реализованы для chat и новых shift-report uploads.
`STAFF_TASK` list/export/direct scope, transactional comment evidence bind и
strict parent reader реализованы как рабочий candidate. Participant targeting
использует authoritative persisted store scope и конкретный task store,
platform admins исключены. Direct create требует один store у task и shift, а
direct update проверяет equality до и повторно после lock; read fail-closed
скрывает shift вне actor `allowedStoreIds`. Structural PATCH null-store task
для `STORES` запрещён, но exact assignee/observer сохраняет разрешённые
comment/self-service status действия. Update/comment блокируют parent row и
повторяют scope checks после lock; manager-only status требует
`manage_staff_tasks`. Обычный create начинает task только в `OPEN`; assignment
labels принадлежат серверу. Grouped/`ANY_OF` нельзя переназначить через
single-assignee PATCH или лишить candidate observer membership.
Template CRUD/launch также имеет bounded candidate: scoped rows/count/summary
и options, fresh persisted scope, parent lock/recheck, ACTIVE/bound Store
policy, shared task materializer и атомарный catalog audit. Recurring actor
HTTP также имеет bounded candidate: scoped report/CRUD/manual launch,
Rule/Template lock/recheck, server-time interactive due и atomic
Run/Task/Rule/audits. In-process scheduler и scheduled all-tenant controller
не зарегистрированы, default-off и остаются `NO-GO`.
Для `CHECKLIST_RUN`, `KNOWLEDGE_ARTICLE`, `SHIFT_REGULATION`,
`TRAINING_COURSE`, `ONBOARDING_PLAN` producer/reader adoption остаётся pending.
Read-only inventory реализован, apply-backfill отсутствует. Поэтому
`STAFF_ATTACHMENT_ACL_MODE=ENFORCED` нельзя активировать до
inventory/backfill/reconciliation; внешний доступ остаётся `NO-GO`.

Для безопасного перехода реализован process-wide
`STAFF_ATTACHMENT_ACL_MODE=LEGACY|SHADOW|ENFORCED`: `LEGACY` сохраняет
tenant-only read, `SHADOW` вычисляет strict decision и безопасно логирует
mismatch, но отдаёт legacy result без quarantine expired pending, `ENFORCED`
делает parent ACL и TTL quarantine авторитетными. Production требует явный
mode; local/test default — `ENFORCED`, CI startup contract — `SHADOW`.
`LEGACY/SHADOW` допустимы только внутри закрытого перехода и запрещают внешний
beta; `ENFORCED` разрешён только после adoption, backfill и canary.

Inventory scanner выполняет весь scan в одной read-only `REPEATABLE READ`
snapshot transaction. Secondary review coverage включает chat body, task
description/checklist, checklist answers и остальные rich-text/JSON sources;
secondary copies не создают полномочий или automatic binding.

Финальный task candidate прошёл focused CI 21 suite / 302 tests, включая 63
task test, full API 74 suite / 1 526 passed / 2 todo, API boundary
lint/typecheck/build, web lint/typecheck и webpack production build на 203
страницы. Clean PostgreSQL прогон применил все 155 migrations; attachment
smoke подтвердил реальный `STAFF_TASK` binding/derived store, а отдельная
integration suite — A1→A2 scope race и два rollback-сценария, 3/3. Временные
schema удалены.

DB/read invariant для legacy A-task/B-shift, когда оба store входят в scope
multi-store actor, ещё отсутствует. Его schema enforcement и inventory
существующих mismatch являются отдельным обязательным evidence gap.

Recurring actor candidate прошёл focused CI 27 suites / 375 tests, full API
80 suites / 1 599 passed / 2 todo и real PostgreSQL transaction security
2 suites / 8 tests. Пять recurring race-сценариев подтверждают фактическую
блокировку и post-wait rollback для Template, Store и participant revoke.
Scheduler/all-tenant route не зарегистрированы; tenant-global timezone,
production-like legacy reconciliation, DB constraints и browser evidence
остаются `NO-GO`.

Staff task integrity inventory реализован отдельным candidate
`56d615437ecfcb90db252016d3e5b83f3f545578`. Он проверяет 43 aggregate
same-tenant/store/assignee/schedule/run/deletion reason code в одной
read-only `REPEATABLE READ` snapshot, не возвращает row identifiers и
различает ошибки (`1`) и blocking findings (`2`). Clean schema со всеми 156
миграциями дала `PASS`; локальная намеренно cross-tenant fixture дала
`BLOCKED` без утечки ID. Production/production-like scan и reconciliation не
выполнялись, поэтому это implementation evidence, а не разрешение внешнего
доступа.

Четыре текущих клуба по-прежнему являются четырьмя `Store` одного `Tenant`.
Первый внешний тест после прохождения gates включает полные модули
геймификации, ассортимента, сотрудников, коммуникаций и users/roles только в
пределах собственного tenant/allowed stores.

## Управление версиями

- Изменение смысла `NETWORK`, `STORES` или правил видимости — новая major-версия
  контракта и новый ADR.
- Дополнение поверхности теми же правилами — minor-версия.
- Исправление формулировок и ссылок — patch-версия.
- ADR не переписывается задним числом: новое решение supersedes старое.
- Runbook, матрица и тест-стратегия обновляются вместе с реализацией.

## Changelog

- `1.9.0`, 27.07.2026 — добавлен guarded staff task integrity inventory:
  43 reason code, read-only RepeatableRead, deterministic exit gate,
  clean-schema CI и runbook будущих same-tenant/Store deletion constraints.
- `1.8.0`, 27.07.2026 — recurring P1 закрыты Store/participant locks,
  scoped mutation projections, sparse PATCH и Store IANA/DST schedule;
  PostgreSQL race suite включён в обязательный CI.
- `1.7.0`, 27.07.2026 — recurring Rule actor HTTP переведён на persisted
  scope, Rule/Template locks, shared materializer и atomic interactive due;
  scheduler/all-tenant route удалены из runtime graph и оставлены `NO-GO`.
- `1.6.0`, 27.07.2026 — final participant/business-policy checks переведены
  на transaction client, добавлены два regression-теста и явно отделён
  application recheck от ещё не реализованного reference-row/DB invariant.
- `1.5.0`, 27.07.2026 — зафиксированы full API/build gates, real PostgreSQL
  A1→A2/rollback integration, защита начального status и server-owned task
  labels; добавлен inventory/план внедрения templates и recurring rules.
- `1.4.0`, 27.07.2026 — уточнён финальный `STAFF_TASK` candidate: authoritative
  participant scope, application-level task/shift recheck после parent lock,
  fail-closed null-task mutations, capability-gated status transitions и
  подтверждённые focused/DB проверки; full suite/build, legacy task/shift
  invariant, revoke и real A1/A2 integration остаются открыты.
- `1.3.0`, 27.07.2026 — зафиксирован `STAFF_TASK` adoption candidate:
  persisted scope для task list/export/direct paths, transactional comment
  evidence binding и strict task parent reader; verification/revoke и
  production-like A1/A2/B evidence остаются открыты.
- `1.2.0`, 27.07.2026 — зафиксированы attachment rollout modes, beta gates,
  safe shadow semantics и единый RepeatableRead inventory snapshot с secondary
  copies.
- `1.1.0`, 27.07.2026 — добавлен attachment ACL implementation checkpoint:
  155 migrations, partial chat/shift dual-write, read-only inventory, rollout
  ограничения и `NO-GO` до backfill/parent adoption.
- `1.0.0`, 27.07.2026 — принят persisted AccessScope, зафиксированы topology,
  безопасная миграция, порядок модулей и release gates.
