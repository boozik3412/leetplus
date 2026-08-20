# Background execution containment: implementation checkpoint

| Поле             | Значение                                                |
| ---------------- | ------------------------------------------------------- |
| Версия           | 1.16                                                    |
| Дата             | 20.08.2026                                              |
| Статус           | Code candidate; не deployed                             |
| Release decision | `NO-GO` для внешнего owner invite                       |
| Топология        | Shared API/workers/PostgreSQL, отдельный tenant на сеть |

## 1. Назначение

Этот checkpoint вводит временную fail-closed границу для фонового выполнения
до появления полного durable lease/generation/revision fencing.

Цель среза:

- сохранить совместимость текущей сети `Tenant A/A1..A4`, которая явно
  классифицирована как `INTERNAL`;
- не позволить будущему `Tenant B` в стадиях `PILOT`, `BETA` или `LIVE`
  запустить unattended job, если его effect path ещё не доказан как
  revision-fenced;
- централизовать перечень фоновых job kinds и запретить неизвестные значения;
- не смешивать временный containment с утверждением о готовности shared
  worker plane.

Документ не разрешает production deployment, migration apply, создание
внешнего tenant, owner invite или тестовой учётной записи.

## 2. Нормативная policy

Канонический реестр находится в
`apps/api/src/tenancy/tenant-background-execution-policy.ts`.

Policy использует только два execution-stage:

| Persisted `Tenant.customerStage` | Background stage |
| -------------------------------- | ---------------- |
| `INTERNAL`                       | `INTERNAL`       |
| `PILOT`, `BETA`, `LIVE`          | `EXTERNAL`       |
| отсутствует или неизвестен       | deny             |

Правила:

1. Известный job kind для `INTERNAL` временно сохраняет legacy-выполнение.
2. `EXTERNAL` допускается только для job kind со статусом
   `REVISION_FENCED`.
3. Missing/unknown stage и missing/unknown job kind всегда дают deny.
4. Новый background job нельзя добавить только в scheduler: он обязан
   одновременно появиться в registry, тестах и release review.
5. Policy не принимает tenant/store ID из клиентского запроса и не содержит
   bypass через env.
6. Каждый зарегистрированный job kind обязан иметь explicit system identity
   requirement: `TENANT_SYSTEM_IDENTITY`, `TENANT_STORE_SYSTEM_IDENTITY` или
   `TENANT_OR_STORE_SYSTEM_IDENTITY`.
7. Общий `SYNC_SERVICE_TOKEN` остаётся только HTTP/scheduler admission secret и
   не считается worker identity. Registry-level
   `sharedServiceTokenAllowed=false` закреплён для всех job kinds.
8. Runtime identity foundation обязан отдельно сопоставлять принятое policy
   decision с фактическим actor kind. `SHARED_SERVICE_TOKEN` всегда
   отклоняется как worker identity; `TENANT_SYSTEM_IDENTITY` требует
   `TENANT_SYSTEM`, `TENANT_STORE_SYSTEM_IDENTITY` требует
   `TENANT_STORE_SYSTEM` + store id, а
   `TENANT_OR_STORE_SYSTEM_IDENTITY` допускает tenant actor либо store actor со
   store id.

Stable reason codes:

- `ALLOWED_INTERNAL_LEGACY`;
- `ALLOWED_EXTERNAL_REVISION_FENCED`;
- `BACKGROUND_EXECUTION_STAGE_REQUIRED`;
- `BACKGROUND_EXECUTION_STAGE_UNKNOWN`;
- `BACKGROUND_JOB_KIND_REQUIRED`;
- `BACKGROUND_JOB_KIND_UNKNOWN`;
- `BACKGROUND_EXTERNAL_EXECUTION_DENIED`.

## 3. Реестр job kinds

### 3.1. Внешнее выполнение разрешено

Только два effect path имеют текущий статус `REVISION_FENCED`:

| Job kind                     | Effect                                     |
| ---------------------------- | ------------------------------------------ |
| `REPORT_DIGEST_SMTP`         | persisted report run → fresh check → SMTP  |
| `GUEST_BONUS_LEDGER_LANGAME` | claim generation/revision → Langame effect |

Этот статус не включает внешнее выполнение автоматически: lifecycle, trial,
module entitlement, capability, scope, provider configuration и отдельный
outbound `GO` продолжают действовать.

`REPORT_DIGEST_SMTP` дополнительно подключён к runtime identity foundation:
scheduler требует exact `TENANT_SYSTEM` actor до digest generation, а
`ReportsDigestService` повторяет эту проверку на последней границе перед SMTP
effect.

`GUEST_BONUS_LEDGER_LANGAME` также подключён к runtime identity foundation:
live batch dispatch требует exact `TENANT_STORE_SYSTEM + storeId` до auto-queue,
claim и provider effects, а `GuestBonusLedgerService` повторяет проверку после
`DISPATCHING` на последней границе перед Langame balance write. Missing store
identity блокирует batch до effects; потерянная store identity возвращает ledger
entry в `PENDING` без provider call.

`GUEST_GAME_REWARD_MATERIALIZER` подключён к runtime identity foundation в
unattended scheduler path: scheduler выбирает runtime store identity только из
активных `backgroundExecutionEnabled` stores текущего tenant, проверяет exact
`TENANT_STORE_SYSTEM + storeId` до materialization effects и не
переиспользует один global store id для all-tenant sweep. Missing store
identity даёт deterministic skip `BACKGROUND_STORE_ID_REQUIRED` до claims.

`GUEST_GAME_DELIVERY_DISPATCH` и `GUEST_GAME_DELIVERY_BOT_PULL` подключены к
runtime identity foundation без открытия legacy outbound. Scheduled dispatch
выбирает runtime store identity из активных `backgroundExecutionEnabled`
stores текущего tenant, передаёт dispatcher synthetic actor
`STORES/[runtimeStoreId]`, а bot pull требует store identity до outbox query.
Для `STORES` actor `GuestGameDelivery` reads дополнительно ограничены
`storeId IN allowedStoreIds`. Legacy protocol gate и `EXTERNAL_DENY` для
external tenant остаются действующими.

`GUEST_GAME_DATA_RETENTION` и `GUEST_GAME_QUALITY_MONITORING` подключены к
runtime identity foundation как tenant-wide background jobs. Data retention
допускает tenant в executable global cleanup/recovery/policy list только после
exact `TENANT_SYSTEM + tenantId` acceptance; quality monitoring требует exact
`TENANT_SYSTEM + tenantId` до `collectTenant`. Missing tenant identity даёт
deterministic `SKIPPED` до wallet cleanup, policy lookup, quality snapshot или
alert writes.

`GUEST_ACTIVITY_LEDGER_SYNC` подключён к runtime identity foundation как
tenant-wide background job. Recovery enqueue требует exact
`TENANT_SYSTEM + tenantId` до `STALE_BINDING` mutation/enqueue, а queued job
claim требует такой же runtime actor до `updateMany` lock/claim. Missing tenant
identity превращается в deterministic no-op: recovery state не мутируется,
queued job не claim-ится и `syncProfile` не вызывается.

### 3.2. Внешнее выполнение запрещено

До отдельного durable fencing имеют `EXTERNAL_DENY`:

| Группа       | Job kind                                   |
| ------------ | ------------------------------------------ |
| Langame      | `LANGAME_SCHEDULED_SYNC`                   |
| Langame      | `LANGAME_DAILY_SYNC`                       |
| Langame      | `LANGAME_BUSINESS_SNAPSHOT`                |
| Langame      | `LANGAME_GUEST_DATA_FOUNDATION`            |
| Gamification | `GUEST_GAMIFICATION_SNAPSHOT_PIPELINE`     |
| Gamification | `GUEST_GAMIFICATION_SUPPLEMENTAL_PIPELINE` |
| Delivery     | `GUEST_GAME_DELIVERY_DISPATCH`             |
| Delivery     | `GUEST_GAME_DELIVERY_BOT_PULL`             |
| Guest data   | `GUEST_ACTIVITY_LEDGER_SYNC`               |
| Guest data   | `GUEST_GAME_DATA_RETENTION`                |
| Guest data   | `GUEST_GAME_LEDGER_FALLBACK`               |
| Guest data   | `GUEST_GAME_LOOT_BOX_RECOVERY`             |
| Guest data   | `GUEST_GAME_QUALITY_MONITORING`            |
| Guest data   | `GUEST_GAME_REWARD_MATERIALIZER`           |
| Staff        | `STAFF_TASK_RECURRING_RULES`               |

`STAFF_TASK_RECURRING_RULES` зарезервирован в registry, но scheduler и
all-tenant scheduled route остаются намеренно незарегистрированными в
application graph.

## 4. Реализованные enforcement points

### 4.1. Langame и supporting integrations

- scheduled sync проверяет policy до `syncTenantById`;
- `AUTO` sync повторяет проверку до credentials/provider/DB mutation;
- daily sync проверяет tenant до дочерних scopes и передаёт отдельный
  `LANGAME_DAILY_SYNC` job kind;
- business snapshot и guest foundation применяют policy только к
  `OUTBOUND/AUTO` ветке;
- configured guest-foundation sweep выдаёт external tenant явный `SKIPPED` и
  продолжает обработку последующих `INTERNAL` tenant;
- authenticated `MANUAL/WRITE` preview и явные in-app действия не
  блокируются этим временным background-барьером;
- внешний scheduled/AUTO вызов возвращает structured `SKIPPED` либо `503`
  с `BACKGROUND_EXECUTION_FENCE_PENDING`.

### 4.2. Gamification pipelines и delivery

- scheduled snapshot и supplemental pipeline проверяются до actor selection и
  processing;
- scheduled delivery dispatch проверяется до вызова dispatcher;
- legacy bot pull возвращает пустой детерминированный результат и не выдаёт
  provider payload;
- legacy direct dispatcher принудительно переводит реальную Telegram/MAX
  отправку в dry-run до provider-вызова и delivery mutation;
- legacy provider prepare/update и bot ack отклоняются до изменения delivery
  row/event; они не считаются coordinator или reconciliation path;
- bonus-ledger revoke и Telegram unsubscribe продолжают ledger/reward
  cancellation и consent update, но сохраняют связанные provider delivery
  rows/events неизменными. Cancellation для `CASHIER/MANUAL` остаётся;
- manual delivery dry-run остаётся доступным;
- ни один из этих deny-path не разрешает outbound.

### 4.3. Guest database background

- activity recovery и queue claim выбирают только `INTERNAL` tenant и
  проверяют policy до claim/mutation;
- activity recovery и queue claim дополнительно требуют accepted
  `TENANT_SYSTEM` runtime identity до recovery mutation, enqueue или claim;
- data retention сначала вычисляет исполнимые tenant и ограничивает ими все
  глобальные cleanup query;
- ledger fallback, loot-box recovery, quality monitoring и reward
  materializer проверяют policy до чтения рабочих данных и side effects;
- data retention и quality monitoring дополнительно требуют accepted
  `TENANT_SYSTEM` runtime identity до unattended cleanup/collection effects;
- external queue rows могут оставаться сохранёнными, но не claim-ятся.

Прямые/manual методы `enqueueProfileSync`/`syncProfile`, tenant-scoped
retention и quality collection не объявляются unattended entrypoints и этим
срезом не изменялись.

### 4.4. Разрешённые revision-fenced effects

- report digest проверяет registry при scheduler admission и повторно после
  fresh actor/capability/scope/revision проверки непосредственно перед SMTP;
- bonus-ledger live dispatch проверяет admission и registry до auto-queue,
  stale promotion и claim;
- после claim bonus-ledger повторяет fresh tenant/target/source/eligibility и
  registry проверки непосредственно перед Langame provider; denial
  CAS-возвращает принадлежащую worker запись в `PENDING` без provider effect.

## 5. Что этот срез гарантирует

- Новый tenant, уже находящийся в `PILOT/BETA/LIVE`, не запускает
  перечисленные unfenced scheduled/AUTO jobs.
- Неизвестный stage/job kind не получает неявного разрешения.
- Неизвестный или новый job kind не может попасть в registry без явного
  system identity requirement.
- Даже для разрешённых revision-fenced effects решение policy возвращает
  `sharedServiceTokenAllowed=false`: all-tenant/service-token admission не
  является worker identity и не заменяет tenant/store-scoped runtime actor.
- Runtime identity foundation fail-closed блокирует shared-token worker,
  missing actor kind, missing tenant id, missing store id и несовпадение
  required actor kind до подключения effect path.
- Data retention и quality monitoring больше не выполняют unattended
  tenant-wide effects только на основании service-token/policy admission:
  accepted runtime tenant identity требуется до global cleanup/collection.
- Activity ledger sync больше не выполняет recovery mutation/enqueue или queued
  job claim только на основании service-token/policy admission: accepted
  runtime tenant identity требуется до обоих unattended paths.
- Текущий `INTERNAL` tenant сохраняет совместимость разрешённых registry
  paths, но legacy provider delivery effects намеренно отключены до
  coordinator.
- Ручные integration preview/read/write сценарии не смешиваются с unattended
  execution.
- Провайдеры Langame/Telegram/MAX не вызываются после background denial в
  покрытых effect boundaries.

## 6. Осознанные ограничения

Это containment, а не завершённый shared worker plane:

- migration `166` содержит durable delivery claim/CAS schema только как
  implementation candidate; effect-capable runtime coordinator отсутствует;
- нет общей durable claim generation для обычного Langame sync и
  database-enforced CAS/finalize для каждого перечисленного job;
- смена stage или revision посреди уже начатого `INTERNAL` выполнения не
  останавливает stale worker;
- нет двухфазного suspend/drain для всех очередей;
- нет единого distributed leader для всех process-local schedulers;
- registry-level identity metadata не создаёт сами runtime roles и не
  доказывает, что каждый legacy scheduler уже исполняется под отдельным
  tenant/store system actor;
- runtime identity helper пока является foundation/contract: оставшиеся legacy
  scheduler call-sites должны быть переведены на него отдельными bounded
  patches с job-specific tests;
- activity jobs внешнего tenant могут накапливаться unclaimed;
- не завершены shared Telegram tenant/store identity, durable update dedupe и
  per-store kill switch;
- некоторые legacy services сохраняют существующий lint debt, который не
  возник в этом срезе;
- migration `165` добавляет только fail-closed Store execution fence;
  migration `166` с delivery lease/attempt/transition fence создана, но её
  PostgreSQL/remote evidence и cutover ещё не приняты.

Remote PostgreSQL 16 prerequisite для exact `CURRENT_164` пройден на SHA
`37f8cc88cdba05b3c73f6bc14e14528f831228ee`, CI run `30423839760`.
Локальный isolated PostgreSQL major `16` diagnostic rehearsal populated
`163 → 164` также прошёл после усиления проверки exact preflight SQLSTATE:
`6` tenants, `6` report runs, `10` ledger rows, три drain rejection,
database SQLSTATE `55000/55P03/42P07`, lock-timeout/late-DDL rollback, пять
rolled-back attempts и recovery deploy.
Migration `165` является additive fail-closed candidate: она создаёт
`Store.backgroundExecutionEnabled=false` и revision fence, не активирует ни
один Store и не включает outbound. Production apply не выполнялся.

Поэтому `BETA-MT-008` остаётся `В работе`, outbound первого внешнего tenant
остаётся `OFF`, а release decision остаётся `NO-GO`.

## 7. Проверки

Обязательный локальный/CI gate:

```text
pnpm --filter api test:ci:background-execution
pnpm --filter api lint:ci:tenant-execution
pnpm --filter api typecheck
pnpm --filter api build
git diff --check
```

Suite проверяет:

- точность registry и deny для unknown values;
- точность identity metadata registry и `sharedServiceTokenAllowed=false` для
  всех job kinds;
- runtime identity foundation: deny shared service token, exact tenant/store
  actor match, missing store id и policy-denial precedence;
- report digest runtime identity adoption: exact tenant system actor в
  scheduler и на SMTP effect boundary, missing tenant identity → deterministic
  `SKIPPED` без provider effect;
- совместимость `INTERNAL`;
- deny для admitted `PILOT/BETA/LIVE`;
- отсутствие provider/credential и защищённой business mutation после denial;
  детерминированная audit-запись `SKIPPED`/`BLOCKED` разрешена;
- deterministic `SKIPPED`, empty bot pull и delivery `BLOCKED`;
- сохранение manual integration и delivery dry-run paths;
- запрет legacy provider prepare/update/bot ack и provider delivery mutation
  при bonus-ledger revoke/Telegram unsubscribe без отмены основной
  ledger/reward/consent business mutation;
- data retention runtime identity adoption: missing tenant identity blocks
  executable tenant list before wallet cleanup/recovery, policy lookup and
  retention run writes;
- quality monitoring runtime identity adoption: missing tenant identity blocks
  `collectTenant` before snapshot/alert writes;
- activity ledger runtime identity adoption: missing tenant identity blocks
  recovery mutation/enqueue and queued job claim before `syncProfile`;
- сохранение `CASHIER/MANUAL` cancellation.

Successor identity metadata exact-SHA CI acceptance:
[background execution identity metadata evidence 19.08.2026](./background-execution-identity-metadata-ci-evidence-2026-08-19.md).

Runtime identity foundation exact-SHA CI acceptance:
[background runtime identity foundation evidence 19.08.2026](./background-runtime-identity-foundation-ci-evidence-2026-08-19.md).

Report digest runtime identity exact-SHA CI acceptance:
[background report digest runtime identity evidence 19.08.2026](./background-report-digest-runtime-identity-ci-evidence-2026-08-19.md).

Retention and quality runtime identity exact-SHA CI acceptance:
[background retention and quality runtime identity evidence 20.08.2026](./background-retention-quality-runtime-identity-ci-evidence-2026-08-20.md).

Activity ledger runtime identity exact-SHA CI acceptance:
[background activity ledger runtime identity evidence 20.08.2026](./background-activity-ledger-runtime-identity-ci-evidence-2026-08-20.md).

Последний принятый baseline-результат до расширения migration-166 containment:

- background execution gate: `15 suites / 665 tests`;
- tenant execution gate: `16 suites / 663 tests`;
- полный API regression: `96 suites / 1873 passed / 2 todo`;
- tenant-execution lint, API production typecheck и API build: `PASS`.

Для expanded containment повторный focused/full API run, typecheck/lint и
предыдущий accepted engineering baseline связаны с PR head
`bbef153a288bfdf1c3573eb704f27c013cc0e856`, GitHub CI
[`30443837684`](https://github.com/boozik3412/leetplus/actions/runs/30443837684)
(`run #23`), выполненным через merge-ref; это не exact-SHA checkout evidence.
Application checks `90549245276`, Authority checks
`90549245284` и PostgreSQL migration smoke `90549245372` завершились `PASS`.
Authority checks не выполняли root enrollment; registry остаётся `{}`.
PostgreSQL evidence зафиксировал `immutableMutationsRejected=7` и
`finalStateAndEvidenceUnchanged=true`. `c1fee42c...` / CI `30442286822`
остаётся historical precursor до legacy quarantine delivery-row/lifecycle
freeze. Schema target — `CURRENT_166`; exact-head
`a644b81e909ea97c21e3c404480505bf97b19935` / CI
[`30447011917`](https://github.com/boozik3412/leetplus/actions/runs/30447011917)
(`run #27`) rejected (`2/3 PASS`: Application `90559756157` и Authority
`90559756309` — `PASS`, PostgreSQL `90559756334` — `FAIL` из-за несовпадения
ожидаемого custom replay text с SQLSTATE `23505`/generic Prisma message).
Previous accepted exact-head checkpoint —
`d525b736d03162a2c58de17cbf7679ba6f515096`, GitHub CI
[`30447467729`](https://github.com/boozik3412/leetplus/actions/runs/30447467729)
(`run #28`): Application `90561260920`, Authority checks `90561260926` и
PostgreSQL `90561260878` — `3/3 PASS`. Authority checks не выполняли root
enrollment; registry остаётся `{}`. PostgreSQL major `16` evidence
зафиксировал `populatedLegacyDeliveries=10`, `canonicalStoreBackfills=1`,
`legacyQuarantines=6`, `preservedFailClosedStores=3`,
`committedTransitions=4`, `runtimeBoundaryNegatives=9`,
`immutableMutationsRejected=7`,
`finalStateAndEvidenceUnchanged=true` и
`sourceDatabaseMigrationsApplied=0`; migration state source-базы не изменён,
source application data не затронуты. Last accepted exact-head checkpoint —
`be8c94c4ea9106a31055a0aff577ffbd62b67e7c`, GitHub CI
[`30449026506`](https://github.com/boozik3412/leetplus/actions/runs/30449026506)
(`run #29`): Application `90566337085`, Authority checks `90566337062` и
PostgreSQL major `16` job `90566337060` — `3/3 PASS`. Authority checks не
выполняли root enrollment; registry остаётся `{}`. Run #29 повторно
подтвердил evidence выше, `privateSecurityInvokerLockBoundaries=1` и
`rewardDeliveryLockOrderEvidence`: `restrictedRuntimeScopeChecks=true`,
`disposableOwnerDmlSessions=2`, `missingRewardRejected=true`,
`crossTenantRewardRejected=true`, `waiterObservedOnAdvisoryLock=true`,
`deliveryDeferredTriggerCommitted=true`, `rewardDeferredTriggerCommitted=true`,
`holderAndWaiterCommitted=true`, `rawDeadlockOrLockTimeoutErrors=0`,
`stateAndEvidenceUnchanged=true`. Все четыре исходных engineering
provider-write P1 закрыты. Это engineering checkpoint, не
production-like, deploy или outbound `GO`.

## 8. Следующий обязательный порядок

1. Сохранить remote PostgreSQL 16 PASS populated rehearsal `163 → 164` как
   исторический prerequisite evidence migration `165`: SHA `37f8cc88...` / CI
   `30423839760`.
2. Remote exact-SHA `CURRENT_165` PASS populated rehearsal `164 → 165`
   получен: `4bd6a036...` / CI `30428288353`; это engineering evidence, не
   production apply. Documentation/evidence successor `7c20adec...` / CI
   `30429463161` также зелёный; оба checkpoint исторические.
3. Exact additive migration
   `20260729160000_guest_game_delivery_claim_fence` уже создана как
   implementation candidate `CURRENT_166`; clean/populated PostgreSQL major
   `16` rehearsal `165 → 166` и previous accepted PR-head-associated
   merge-ref baseline — `bbef153a...` / `30443837684` (`run #23`), не
   exact-SHA evidence. Предыдущий `c1fee42c...` / `30442286822` остаётся
   historical precursor. Previous accepted exact-head checkpoint —
   `d525b736...` / `30447467729` (`run #28`), `3/3 PASS`; last accepted
   exact-head — `be8c94c4...` / `30449026506` (`run #29`), `3/3 PASS`.
   Independent adversarial review не нашёл P0-блокера для inert schema и
   исходно зафиксировал четыре P1 перед provider activation. Legacy quarantine
   delivery-row/lifecycle freeze закрыла один: `LEGACY_QUARANTINED` отклоняет
   любое изменение
   state/reason/scope/provider-полей и `DELETE`, а семь negative mutations
   сохраняют row/evidence неизменными. Exact-head `d525b736...` закрыл ещё два
   исходных P1: final-row reason/evidence consistency с null-closed Event
   integrity и worker boundary-only durable event write. Exact-head
   `be8c94c4...` закрыл четвёртый P1: Reward→Delivery lock
   order/deadlock/`40P01`. Полученный `CURRENT_165` PASS остаётся только историческим
   prerequisite; current engineering PASS не является production-like
   evidence или cutover.
4. Сохранить закрытие всех четырёх engineering P1 и отдельно пройти
   operational admission. Rejected `6a69cd8...` / CI `30445054152`
   (`run #26`), PostgreSQL job `90553255161`, сохраняется как `FAILED`
   evidence: retry readiness fixture и preflight null-closed Event gap не
   позволили закрыть P1. Exact-head `a644b81...` / CI `30447011917`
   (`run #27`) rejected: Application/Authority прошли, PostgreSQL — `FAIL`.
   Exact-head `d525b736...` / CI `30447467729` (`run #28`) принят после `3/3
PASS` и закрыл reason/Event и worker durable-event P1. Exact-head
   `be8c94c4...` / CI `30449026506` (`run #29`) принят после `3/3 PASS`:
   private SECURITY INVOKER `guest_game_reward_delivery_lock_v1` берёт
   advisory seed `166`, same-tenant Reward `FOR UPDATE`, затем `VERIFIED`
   Telegram/MAX Deliveries `ORDER BY id FOR UPDATE`; оба deferred trigger
   делегируют boundary, application writers вызывают её до первой DML.
   Для operational boundary обязательны отдельная non-owner runtime/app
   DB role, explicit `EXECUTE` grant и admission, поскольку `PUBLIC EXECUTE`
   revoked. Batch/rebind/future provider writers остаются fail-closed;
   whole-transaction bounded retry сохраняется defense-in-depth. Worker
   boundary не принимает
   `actorUserId`, interactive same-tenant actor boundary pending. Прямой
   `DELETE` Attempt/Event fail-closed запрещён ordinary/enrolled DML roles при
   включённых triggers; owner/superuser/DDL bypass operationally denied,
   bounded audited retention identity/procedure/grants не enrolled.
5. Реализовать effect-capable coordinator поверх durable
   claim/attempt/finalize/reaper/reconcile primitive и перевести на него direct
   dispatcher и bot pull. Текущий legacy runtime только fail-closed блокирует
   provider effects; это не готовый coordinator и не разрешение outbound.
6. Добавить durable claims и fresh per-source/provider boundary для обычного
   Langame sync и остальных job kinds.
7. Реализовать shared Telegram tenant/store identity, durable update dedupe и
   per-store kill switches.
8. Реализовать двухфазный suspend/drain и race tests для stage/revision flip.
9. Пройти real PostgreSQL A/A1/A2 + B/B1 job/provider negative matrix.
10. Только после этого переходить к canonical owner-email claim, encrypted
    outbox, shell provisioning и protected activation.
