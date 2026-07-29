# Background execution containment: implementation checkpoint

| Поле             | Значение                                                |
| ---------------- | ------------------------------------------------------- |
| Версия           | 1.6                                                     |
| Дата             | 29.07.2026                                              |
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

| Job kind                     | Effect                                      |
| ---------------------------- | ------------------------------------------- |
| `REPORT_DIGEST_SMTP`         | persisted report run → fresh check → SMTP   |
| `GUEST_BONUS_LEDGER_LANGAME` | claim generation/revision → Langame effect  |

Этот статус не включает внешнее выполнение автоматически: lifecycle, trial,
module entitlement, capability, scope, provider configuration и отдельный
outbound `GO` продолжают действовать.

### 3.2. Внешнее выполнение запрещено

До отдельного durable fencing имеют `EXTERNAL_DENY`:

| Группа             | Job kind                                      |
| ------------------ | --------------------------------------------- |
| Langame            | `LANGAME_SCHEDULED_SYNC`                      |
| Langame            | `LANGAME_DAILY_SYNC`                          |
| Langame            | `LANGAME_BUSINESS_SNAPSHOT`                   |
| Langame            | `LANGAME_GUEST_DATA_FOUNDATION`               |
| Gamification       | `GUEST_GAMIFICATION_SNAPSHOT_PIPELINE`        |
| Gamification       | `GUEST_GAMIFICATION_SUPPLEMENTAL_PIPELINE`    |
| Delivery           | `GUEST_GAME_DELIVERY_DISPATCH`                |
| Delivery           | `GUEST_GAME_DELIVERY_BOT_PULL`                |
| Guest data         | `GUEST_ACTIVITY_LEDGER_SYNC`                  |
| Guest data         | `GUEST_GAME_DATA_RETENTION`                   |
| Guest data         | `GUEST_GAME_LEDGER_FALLBACK`                  |
| Guest data         | `GUEST_GAME_LOOT_BOX_RECOVERY`                |
| Guest data         | `GUEST_GAME_QUALITY_MONITORING`               |
| Guest data         | `GUEST_GAME_REWARD_MATERIALIZER`              |
| Staff              | `STAFF_TASK_RECURRING_RULES`                  |

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
- data retention сначала вычисляет исполнимые tenant и ограничивает ими все
  глобальные cleanup query;
- ledger fallback, loot-box recovery, quality monitoring и reward
  materializer проверяют policy до чтения рабочих данных и side effects;
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
Локальный isolated PostgreSQL `16.14` diagnostic rehearsal populated
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
- совместимость `INTERNAL`;
- deny для admitted `PILOT/BETA/LIVE`;
- отсутствие provider/credential и защищённой business mutation после denial;
  детерминированная audit-запись `SKIPPED`/`BLOCKED` разрешена;
- deterministic `SKIPPED`, empty bot pull и delivery `BLOCKED`;
- сохранение manual integration и delivery dry-run paths;
- запрет legacy provider prepare/update/bot ack и provider delivery mutation
  при bonus-ledger revoke/Telegram unsubscribe без отмены основной
  ledger/reward/consent business mutation;
- сохранение `CASHIER/MANUAL` cancellation.

Последний принятый baseline-результат до расширения migration-166 containment:

- background execution gate: `15 suites / 665 tests`;
- tenant execution gate: `16 suites / 663 tests`;
- полный API regression: `96 suites / 1873 passed / 2 todo`;
- tenant-execution lint, API production typecheck и API build: `PASS`.

Для expanded containment выше обязательны повторный focused/full API run,
typecheck/lint и remote exact-SHA CI; они не заявлены этим документом как
завершённые.

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
   implementation candidate `CURRENT_166`; до принятия обязательны clean и
   populated PostgreSQL rehearsal `165 → 166` и remote exact-SHA CI.
   Independent adversarial review не нашёл P0-блокера для inert schema, но
   зафиксировал P1 перед provider activation: общий Reward→Delivery lock
   order/`40P01` rehearsal, final-row reason/evidence consistency,
   однозначный legacy-quarantine recovery и procedure-only durable event
   writes. Полученный `CURRENT_165` PASS остаётся только историческим
   prerequisite и не доказывает migration `166`.
4. Закрыть четыре P1 review отдельными PostgreSQL regression-сценариями и
   запретить выдачу runtime direct `INSERT` на transition evidence.
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
