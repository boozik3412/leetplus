# Staff task templates и recurring rules: AccessScope adoption plan

| Поле           | Значение                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Статус         | templates, recurring actor HTTP, snapshot admission, inventory/planner, SYNTHETIC proposal dry-run и DB EXPAND `IMPLEMENTED_CANDIDATE`; scheduler `NO-GO` |
| Версия         | 1.11.0                                                                                                                                                    |
| Дата           | 28.07.2026                                                                                                                                                |
| Backlog        | `BETA-MOD-STAFF-003`, `BETA-SEC-003`, `BETA-OPS-008`                                                                                                      |
| Scope contract | [access-scope-contract.md](./access-scope-contract.md)                                                                                                    |

Документ фиксирует route/action/job inventory для шаблонов и регулярных задач.
Template CRUD/launch уже реализован отдельным bounded candidate, описанным в
[implementation checkpoint](./staff-task-catalog-implementation-checkpoint.md).
Recurring actor HTTP реализован следующим
[checkpoint](./staff-task-recurring-http-implementation-checkpoint.md).
Same-tenant schema-only EXPAND описан отдельным
[rollout/validation runbook](./staff-task-integrity-expand-runbook.md).
Aggregate-only классификация будущей reconciliation описана в
[reconciliation plan runbook](./staff-task-integrity-reconciliation-plan-runbook.md).
Допуск точного Git-bound snapshot перед inventory/planner обязателен по
[snapshot admission runbook](./staff-task-integrity-snapshot-admission-runbook.md).
Synthetic row-level proposal evidence описан в отдельном
[proposal dry-run runbook](./staff-task-integrity-reconciliation-proposal-dry-run-runbook.md);
он не является production-like evidence или apply authorization.
Scheduler и scheduled all-tenant HTTP не зарегистрированы и всё ещё не
применяют system execution contract, поэтому весь catalog slice и внешний тест
остаются `NO-GO`.

State contract после control-plane EXPAND разделён: StaffTask evidence
остаётся bound к frozen `EXPAND_162`, а current production-like
inventory/planner допускается только после `CURRENT_164` admission — exact
prefix плюс allowlisted migrations
`20260728120000_tenant_execution_control_plane_expand` и
`20260728150000_tenant_execution_revision_fence`. Historical SHA ниже не
являются evidence текущего незакоммиченного candidate.

## 1. Инвентаризация поверхности

| Surface                                    | Capability           | Текущее состояние                                    | Обязательное исправление                                                                                      |
| ------------------------------------------ | -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /staff/task-templates`                | `view_staff_tasks`   | `IMPLEMENTED_CANDIDATE`                              | scoped rows/options/count/summary и creator projection                                                        |
| `POST /staff/task-templates`               | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | fresh scope; STORES требует non-null active allowed Store                                                     |
| `PATCH /staff/task-templates/:id`          | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | hidden UUID `404`; parent lock; final state; atomic catalog audit                                             |
| `POST /staff/task-templates/:id/tasks`     | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | ACTIVE-only; bound Store; shared task materializer; observers/audit                                           |
| `GET /staff/task-rules`                    | `view_staff_tasks`   | `IMPLEMENTED_CANDIDATE`                              | scoped rules/runs/tasks/options/full summary и PII-safe projection                                            |
| `POST /staff/task-rules`                   | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | fresh scope; active allowed Store FOR SHARE; Template/participant locks; authoritative assignee; atomic audit |
| `PATCH /staff/task-rules/:id`              | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | hidden UUID `404`; Rule FOR UPDATE; Template/Store/participant recheck; scoped response/audit                 |
| `POST /staff/task-rules/:id/tasks`         | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | bound Store; shared materializer; actor/task/catalog audit; schedule unchanged                                |
| `POST /staff/task-rules/run-due`           | `manage_staff_tasks` | `IMPLEMENTED_CANDIDATE`                              | actor-scoped, server time, atomic Run/Task/Rule/audits, safe duplicate/error result                           |
| `POST /staff/task-rules/scheduled/run-due` | service token        | `NO-GO`, controller не зарегистрирован и default-off | lifecycle, entitlement, store policy, separate machine identity и system audit                                |
| in-process scheduler                       | process config       | `NO-GO`, provider не зарегистрирован и default-off   | один owner/lease, ACTIVE+entitled tenants, heartbeat, timezone и stale reclaim                                |

Отдельных detail, delete и export routes сейчас нет. Archive/pause выполняются
через status update.

## 2. Подтверждённые риски и текущий статус

1. Cross-store template/rule actor HTTP — закрыто bounded candidate.
2. Tenant-wide actor report/runs/PII — закрыто bounded candidate.
3. Interactive `run-due` actor loss/client time travel — закрыто bounded
   candidate.
4. Direct Template/Rule materialization — закрыто общим safe materializer.
5. Scheduler не исключает `SUSPENDED/ARCHIVED` tenant и пока не имеет staff
   entitlement gate; runtime graph поэтому не регистрирует scheduler.
6. Actor due имеет final Rule/Template/Store/participant lock/recheck; real
   PostgreSQL concurrent evidence 5/5 подтверждает ожидание и rollback.
7. Unique `(ruleId, scheduledFor)` уменьшает дубли, но stale `STARTED` run после
   crash system-path пока не reclaim-ится; actor path пишет occurrence и task в
   одном commit.
8. Same-tenant DB EXPAND реализован candidate для 14 связей
   rule/template/run/store/user/task. Три опасных `Store.onDelete=SetNull`
   заменены парой composite + temporary simple `RESTRICT`: simple FK сохраняет
   global existence legacy cross-tenant Store references, штатный путь —
   archive/deactivate. Production-like inventory/reconciliation и `VALIDATE`
   ещё не выполнялись.
9. Template/Rule domain audit реализован; retention/system denied attempts ещё
   требуют общей политики.
10. Unit и PG race/rollback suite добавлены; guarded inventory candidate готов,
    aggregate-only reconciliation planner также реализован, но
    production-like scan/reconciliation, API/BFF/browser и scheduler lease
    suite ещё обязательны.
11. Store-bound actor schedule использует IANA timezone/DST policy. Global Rule
    имеет UTC fallback и не допускается в первую внешнюю когорту до persisted
    tenant/rule timezone policy.

## 3. Нормативная модель

### NETWORK

- читает все templates/rules/runs своего Tenant;
- создаёт и изменяет store-bound и tenant-global ресурсы;
- может запускать due rules сети при наличии `manage_staff_tasks`;
- не может выбирать Platform Admin как assignee.

### STORES

- читает только `storeId IN allowedStoreIds`;
- не получает null/global templates, rules, runs или option projections;
- create требует non-null allowed Store;
- запрещённый explicit store filter даёт `403`;
- direct UUID вне scope маскируется как `404`;
- assignee имеет persisted `STORES` scope, включающий target Store, и не имеет
  доступ шире actor;
- linked template доступен actor и совместим с effective rule/task Store.

Client `tenantId`, `storeId`, template/rule UUID, labels или assignee никогда не
расширяют authority.

## 4. Реализация

### Slice A — единая catalog policy

Добавить переиспользуемую policy для templates/rules:

- resolve persisted actor scope;
- list/direct predicates;
- allowed Store selector;
- authoritative user selector;
- null/global write rule;
- server-owned task label deny;
- helpers `403` для explicit filter и `404` для hidden UUID.

Подключить её к обоим сервисам и `StaffModule`.

### Slice B — безопасные writes и launch

- вычислять effective final store/template/assignee/status;
- блокировать parent `FOR UPDATE`;
- после lock повторять scope/status/reference checks;
- разделить DRAFT/PUBLISHED template launch policy;
- вынести общий безопасный `StaffTask` materializer либо повторно применить все
  task invariants;
- create task только `OPEN`;
- не принимать клиентские `assignmentMode`, `candidateUserIds`,
  `originalAssignedToUserIds`, `bulkTaskGroupId`;
- audit содержит actor, source template/rule, effective Store и release SHA, но
  не PII.

### Slice C — interactive и scheduled due execution

- interactive run получает actor context и обрабатывает только доступные rules;
- scheduled path выбирает только `ACTIVE` и staff-entitled tenant;
- перед materialization в одной транзакции повторно проверяются tenant
  lifecycle, rule ACTIVE, Store active/allowed, template compatibility и
  assignee;
- scheduler имеет единственного owner/lease, in-flight guard, heartbeat и
  reclaim stale `STARTED`;
- suspend/entitlement revoke прекращают новые task writes немедленно.

До появления `TenantExecutionPolicy` scheduled activation остаётся `NO-GO`.

### Slice D — database и legacy inventory

Read-only часть реализована candidate
`56d615437ecfcb90db252016d3e5b83f3f545578`; операционный порядок описан в
[inventory runbook](./staff-task-integrity-inventory-runbook.md). Команда
обязательна в CI после применения всех миграций и не имеет apply-режима.

Read-only inventory считает:

- cross-tenant references;
- null-store ACTIVE rules/templates;
- rule/template store mismatch;
- inactive/platform/out-of-store assignees;
- run tenant mismatch;
- stale `STARTED` и повторяющиеся `FAILED`;
- active rules у suspended tenant или inactive Store;
- store deletion candidates, которые превратятся в global resources.

Scanner использует одну read-only `REPEATABLE READ` snapshot, возвращает 43
стабильных aggregate reason code без ID/PII и различает database/contract
failure (`1`) и blocking finding (`2`). Destructive auto-fix запрещён.

Schema-only EXPAND реализован отдельным bounded candidate
`dc26568d94d76b886f1d1b79c36b1bd9f00ac401` — not deployed:

- пять parent keys создаются отдельными
  `CREATE UNIQUE INDEX CONCURRENTLY`;
- 14 composite same-tenant FK добавляются как `NOT VALID`: новые invalid
  writes уже запрещены, legacy rows допускаются до reconciliation;
- 11 соответствующих legacy non-Store FK swap/re-add’ятся как `NOT VALID`:
  сохраняют 10 `ON DELETE SET NULL` и один `CASCADE`, но переходят на
  `ON UPDATE RESTRICT`;
- три legacy Store `SET NULL` FK пересоздаются под прежними именами как
  temporary simple `RESTRICT/RESTRICT NOT VALID`, параллельно с composite
  Store `RESTRICT`; это защищает legacy cross-tenant rows от dangling
  `storeId`;
- parent identifiers Store/User/Template/Rule/Task immutable; N/N-1 runtime
  compatibility не разрешает ID update или запуск старого seed;
- Prisma 6.19 отражает parent keys, Store relations и `onUpdate: Restrict`
  всех 11 simple non-Store relations; manual composite drift включает
  10 partial-`SET NULL` и один Run→Rule `CASCADE`, а `NOT VALID`/coexistence
  всех 14 simple compatibility FK остаётся DB-native;
- exact fresh-162 diff предлагает 14 security DROP: 11 non-Store composite и
  три temporary simple Store FK; 11 simple non-Store FK он не меняет,
  unrelated ADD/index-rename drift рассматривается отдельно; smoke получает
  diff через `--from-schema-datasource`/scoped env без URL или пароля в argv;
- offline self-test защищает 28 FK от DROP/RENAME/ALTER,
  `DROP NOT NULL` contract-колонок, trigger/`session_replication_role` bypass и
  запрещает destructive table/column DDL, DROP/ALTER пяти parent indexes,
  DROP SCHEMA и неожиданные migration directory names; exact artifact guard
  фиксирует пять one-statement concurrent index migrations и финальную
  transaction/timeouts/lock order/`28 ADD + 14 DROP + 28 NOT VALID`;
  разрешены только create-only generation и ручной SQL review, `db push`
  запрещён;
- полная схема содержит 162 migration, latest —
  `20260727131000_staff_task_integrity_expand`.

Порядок rehearsal, `VALIDATE`, `CONTRACT` и rollback зафиксирован в
[EXPAND runbook](./staff-task-integrity-expand-runbook.md). Наличие candidate
не отменяет обязательный production-like inventory и reconciliation.

Aggregate-only reconciliation planner описан в отдельном
[runbook](./staff-task-integrity-reconciliation-plan-runbook.md):
historical candidate `2c74c663...` не является current evidence; exact
current candidate SHA ещё не назначен.

- использует одно соединение и одну `READ ONLY REPEATABLE READ` transaction;
- требует exact target/confirmation, production attestation, 40-hex
  `RELEASE_SHA`, HMAC key и expected database binding; expected/actual DB
  names не выводятся; domain-separated HMAC `databaseIdentityDigest` связывает
  evidence с database name, PostgreSQL cluster и database OID без raw identity;
- принимает только полный каталог из 43 кодов:
  `8 proposal + 29 operator + 6 review`;
- считает actionable cap только по proposal/operator, исключая review-only
  counts;
- сохраняет protected StaffTask prefix `EXPAND_162`, но выполняет current
  schema-first exact gate `CURRENT_164`, `migrationCount=164`, latest
  `20260728150000_tenant_execution_revision_fence`, `unfinished=0`,
  `14 composite exact`, `14 simple exact`, `0 expected-FK mismatch`,
  `0 unexpected protected FK`, `5 indexes exact`, `0 index mismatch`;
- использует exits `0/1/2/3`;
- считает `TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID` blocking;
- fail-closed требует `inventoryExecuted === schema.ready`;
- не имеет apply path; proposal не является authorization; aggregate-only
  output не содержит row identifiers/database names; стабильный
  `contentDigest` и timestamp-bound `executionDigest` не являются row-stable
  checksum или CAS/apply token.

Planner только оценивает объём и классы работы. SYNTHETIC row-level proposal
dry-run schema `1` уже реализован для disposable harness, но не является
production-like evidence или apply authorization. Production-like row dry-run,
idempotent apply, locks/recheck, audit, rollback и повторный zero-diff остаются
отдельным следующим P0.

Historical snapshot admission evidence boundary зафиксирован на
`044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`; это не current candidate
evidence. Current admission также поддерживает `CURRENT_164` после exact
allowlisted migrations `163..164`, но требует нового exact SHA и повторного
evidence.
Admission допускает только loopback snapshot, точные runtime bytes и migration
manifest из Git artifact. Logical allowlist содержит девять
relations, но роль получает table-level `SELECT` только на восемь; для `User`
разрешены ровно `id`, `tenantId`, `isPlatformAdmin`, `isActive`,
`accessScope`. Admission report использует schema `2`, planner/proposal —
schema `1`. Caller HMAC не является production-like authority:
положительный допуск требует Ed25519 manifest, nonce-bound DB/approval
evidence и совпадающий DB marker. Trusted-root registry намеренно пуст, поэтому
production-like admission, inventory и planner остаются fail-closed `NO-GO`.
Отдельный historical test evidence
`2341b99937e54cc50d1763a0a794d975816c72ce` подтверждает authority `9/9`,
admission `19/19` и public-only pre-signed pinned-path `LOCAL PASS` в
изолированном child-процессе. Remote CI evidence ещё pending; используемый
экспериментальный Node 22 module mock классифицирован как P2. Это тест verifier
path, а не enrollment production root: reviewed root enrollment, operational
signer и approved snapshot acquisition остаются P0.
Синтетическая PostgreSQL 16.13 репетиция прошла 23 database-сценария: восемь
proposal-кодов дали восемь occurrences и семь cases, включая coalescing двух
last-task причин; подтверждены parity `10 blocking + 2 review` и cap boundary
`9 reject / 10 findings`.

## 5. Обязательная test topology

- Tenant A: Store A1 и A2;
- actors `NETWORK`, `STORES[A1]`, `STORES[A1,A2]`;
- Tenant B: Store B1;
- active, suspended и archived tenant;
- same-store, cross-store, cross-tenant, null/global, inactive/platform и
  contradictory assignee.

Проверить list/options/runs, forbidden filter, hidden UUID, create/update,
template launch, rule launch, interactive run-due, scheduled run-due, scope
revoke, concurrent pause/store change, duplicate tick и stale run reclaim.

Нужны:

- unit specs templates/recurring/scheduler — реализованы для bounded actor
  candidate;
- real PostgreSQL race/rollback integration — 2 suites/8 tests, включая
  recurring 5/5, реализована и обязательна в CI;
- historical integrity inventory contract — 9/9; frozen clean PostgreSQL
  prefix 162 `PASS`; намеренная cross-tenant fixture `BLOCKED`/2 без ID;
- historical aggregate reconciliation planner contract — pass на prefix 162;
  current `CURRENT_164` production-like evidence ещё pending;
- historical snapshot admission contract — `19` admission unit, `9` authority unit и
  `46` offline smoke checks; staged PostgreSQL 16.13 smoke прошёл `23`
  сценария `BASELINE_156 → migrations 157..162 → EXPAND_162`, exact восемь
  table grants + пять `User` columns, admission schema `2`, все восемь
  proposal-кодов/восемь occurrences/семь cases, coalescing, parity
  `10 blocking + 2 review`, cap `9 reject / 10 findings` и негативные
  privilege/trigger/tamper/privacy проверки;
- historical public-only pre-signed pinned-path test — `LOCAL PASS` на evidence
  `2341b99937e54cc50d1763a0a794d975816c72ce` в isolated child; remote CI
  evidence pending, experimental Node 22 module mock — P2;
- proposal dry-run contract — schema `1`, unit `14/14`; HMAC-authenticated
  synthetic provenance, privacy, execution unlinkability и no-apply boundary
  подтверждены;
- identity/inventory contract подтверждает HMAC `databaseIdentityDigest`,
  различие evidence между БД/кластерами и отклонение противоречивого
  `inventoryExecuted`;
- adversarial catalog smoke на disposable local/CI clone сохранил все expected
  FK, отклонил дополнительный конфликтующий FK и неверный порядок колонок
  index до inventory; source database не изменена, clone удалён;
- staged real PostgreSQL EXPAND smoke: populated legacy baseline 156 → ровно
  шесть migrations `157..162`; пять parent indexes построены на заполненных
  таблицах, 14 legacy rows сохранены, 14 composite + 14 simple compatibility
  `NOT VALID` FK, 14 benign legacy updates, 14 rejected new invalid writes,
  три archive-first, три legacy Store delete protections, пять rejected UUID
  - пять tenant moves и `prismaDriftDrops=14` — pass;
- API/BFF/browser negative journeys.

Текущий recurring checkpoint: focused 27 suites/375 tests и full API
80 suites/1 599 pass/2 todo; real PostgreSQL 8/8 и API/web production builds
зелёные. Это не заменяет inventory, browser и background system evidence.

## 6. Exit criteria

Для перехода всей templates/recurring/EXPAND части `BETA-MOD-STAFF-003` из
`IMPLEMENTED_CANDIDATE` в `VERIFIED` должны одновременно выполняться условия:

1. Все HTTP и system paths используют persisted scope.
2. Нельзя материализовать task в чужом Store или для недоступного assignee.
3. Interactive audit сохраняет реального actor.
4. Suspended/non-entitled tenant не обрабатывается.
5. Parent lock/recheck и rollback доказаны real PostgreSQL тестом.
6. Свежий production-like snapshot прошёл Git-bound admission сначала с
   отдельным `BASELINE_156` authority envelope/DB marker, затем после exact
   migrations `157..162` — с новым `EXPAND_162` envelope, новым nonce-bound
   binding и заменённым DB marker; обе state-specific protected evidence
   bundle и marker-rotation attestation сохранены. Remote target, baseline
   marker reuse и mutable worktree artifact не использовались.
7. Production-like legacy inventory и reconciliation имеют объяснённый zero
   critical mismatch.
8. Focused/full CI и production builds зелёные.
9. Все 14 composite FK валидированы в управляемом
   staging/production-like rehearsal.
10. После N-1 rollback window отдельный CONTRACT удалил ровно 14 simple
    compatibility FK и сохранил guard для 14 composite FK.
11. Aggregate planner на production-like snapshot прошёл exact schema gate и
    cap; proposal/operator обработаны отдельным approved reconciliation
    workflow, `contentDigest`/`executionDigest` не использовались как
    row-level/CAS authorization.

`VERIFIED` требует staging/canary evidence, exact release SHA, scheduler
ownership и общий Gate 2.

## 7. Changelog

- `1.10.0`, 28.07.2026 — runtime candidate сохранён на
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`, а тестовый контур зафиксирован
  отдельным SHA `2341b99937e54cc50d1763a0a794d975816c72ce`: authority `9/9`,
  admission `19/19`, public-only pre-signed pinned-path `LOCAL PASS` в isolated
  child. Remote CI evidence pending; experimental Node 22 module mock — P2.
  Production roots пусты; root enrollment, signer и acquisition остаются P0,
  production-like прогон и внешний beta — `NO-GO`.
- `1.9.0`, 28.07.2026 — admission обновлён до schema v2 и evidence boundary
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`: exact runtime Git blobs,
  column-scoped `User`, Ed25519 manifest/DB marker/freshness и exhaustive
  synthetic proposal matrix подтверждены 23 PostgreSQL 16.13 сценариями.
  Trusted roots, operational signer/acquisition и production-like прогон ещё
  отсутствуют; apply и внешний beta остаются `NO-GO`.
- `1.8.0`, 27.07.2026 — добавлен обязательный Git-bound snapshot admission
  перед production-like inventory/planner: candidate
  `7d67333b22f171c6e79f723190647cdd2454b128`, состояния `BASELINE_156` и
  `EXPAND_162`, exact select-only role, `16` unit, `34` offline и `9`
  PostgreSQL 16 smoke-сценариев. Production-like acquisition/restore/admission
  не выполнялись, внешний beta остаётся `NO-GO`.
- `1.7.0`, 27.07.2026 — planner усилен schema-first exact gate, скрытой
  expected/actual database identity binding, aggregate-only/no-ID contract,
  `contentDigest`/`executionDigest` и adversarial disposable-clone FK/index
  smoke; EXPAND получил exact artifact/future-DDL guards. Apply/authorization
  отсутствуют, внешний beta остаётся `NO-GO`.
- `1.6.0`, 27.07.2026 — добавлен aggregate-only reconciliation planner:
  `8 proposal + 29 operator + 6 review`, exact schema gate, exits `0/1/2/3`,
  actionable cap и HMAC evidence с
  запретом использовать proposal/HMAC evidence как apply authorization; EXPAND
  rehearsal усилена populated baseline `156 → 157..162`.
- `1.5.0`, 27.07.2026 — добавлен same-tenant schema-only EXPAND candidate:
  пять concurrent parent indexes, 14 composite и 14 simple compatibility
  `NOT VALID` FK, archive-first/global-existence Store protection, immutable
  parent IDs, expanded DDL guard, scoped Prisma drift, staged PostgreSQL smoke
  и отдельный runbook;
  production-like reconciliation/VALIDATE/deploy остаются `NO-GO`.
- `1.4.0`, 27.07.2026 — реализован guarded read-only integrity inventory,
  добавлены 43 aggregate reason code, deterministic exit gate, clean-schema CI
  и отдельный runbook будущих DB constraints.
- `1.3.0`, 27.07.2026 — зафиксирован recurring actor HTTP candidate,
  Store/participant locking, IANA/DST schedule и background containment.
