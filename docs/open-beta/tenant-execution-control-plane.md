# Tenant execution control plane: implementation checkpoint

| Поле             | Значение                                                                    |
| ---------------- | --------------------------------------------------------------------------- |
| Версия           | 1.16                                                                        |
| Дата             | 29.07.2026                                                                  |
| Статус           | `CURRENT_166` implementation candidate; remote `CURRENT_165` prerequisite PASS; current evidence pending |
| Release decision | `NO-GO` для внешнего owner invite                                           |
| Migrations       | `20260728120000...control_plane_expand` + `20260728150000...revision_fence` + `20260729120000...store_background_execution_fence` + `20260729160000...guest_game_delivery_claim_fence` |
| Основная модель  | Shared PostgreSQL, отдельный `Tenant` на независимую сеть                   |

Этот документ фиксирует фактически реализованный срез
`BETA-TEN-001..004` и `BETA-MT-002..004`. Shared provisioning остаётся
небезопасным foundation candidate: он преждевременно создаёт invite/trial и
на первом вызове возвращает raw registration URL. Его нельзя использовать с
реальным email; целевой shell-only/identity-outbox/activation contract
зафиксирован в
[initial OWNER identity and activation](./initial-owner-identity-and-activation.md).
Документ не разрешает production migration или выдачу доступа.

## 1. Persisted control plane

В `Tenant` добавлены:

- `customerStage`: `INTERNAL | PILOT | BETA | LIVE`;
- `onboardingStatus`:
  `PROVISIONING | OWNER_INVITED | ONBOARDING | READY | ACTIVE | OFFBOARDING`;
- `cohortKey`;
- `supportOwnerUserId`;
- парное UTC trial-окно `trialStartsAt/trialEndsAt`;
- `entitlementProfileRevision` — CAS-версия полного модульного профиля.

Новая сеть по умолчанию создаётся как:

```text
lifecycle = SUSPENDED
onboarding = PROVISIONING
customerStage = INTERNAL
entitlementProfileRevision = 0
```

Поэтому старый `tenant.create`, self-registration или scheduler, который
смотрит только на lifecycle, не создаёт runnable tenant. Миграция сохраняет
session-совместимость только существующим `ACTIVE` tenant, переводя их
onboarding в `ACTIVE`. Существующие `SUSPENDED/ARCHIVED` остаются
`PROVISIONING`.

Никакие entitlement-строки существующим tenant автоматически не выдаются.
Перед включением module enforcement текущий `Tenant A/A1..A4` обязан получить
явный проверенный профиль.

Migration также удаляет database default с `User.role`. Raw/legacy
`User.create` больше не может неявно получить максимальную tenant-роль:
каждый account-creation, invite acceptance и будущий owner-transfer workflow
обязан передать роль явно.

Migration `165` добавляет отдельный fail-closed Store fence:
`backgroundExecutionEnabled=false` и `executionRevision=0`. Trigger увеличивает
revision при изменении execution-состояния и атомарно выключает background
execution при archive/deactivation. Миграция не включает ни один Store,
outbound остаётся `OFF`. Migration `166` уже добавляет durable delivery-claim
schema как implementation candidate, а legacy provider paths fail-closed
заблокированы до delivery mutation. При bonus-ledger revoke/Telegram
unsubscribe основная ledger/reward/consent mutation продолжается, но provider
delivery rows/events не меняются; `CASHIER/MANUAL` cancellation сохраняется.
Effect-capable coordinator, Store-scoped enforcement и PostgreSQL/remote
evidence ещё pending.

## 2. Полный entitlement profile

`TenantModuleEntitlement` содержит ровно один row на module:

- `GAMIFICATION`;
- `ASSORTMENT`;
- `STAFF`;
- `COMMUNICATIONS`;
- `USERS_ROLES`;
- `INTEGRATIONS`.

Каждая строка хранит:

- `readEnabled`;
- `writeEnabled`;
- `outboundEnabled`;
- optional `validFrom/validUntil`;
- `profileRevision`;
- обязательный непустой `reason`.

Database constraints запрещают:

- revision меньше 1;
- `write=true` при `read=false`;
- `outbound=true` при `write=false`;
- обратное validity-окно;
- пустой reason;
- duplicate `(tenantId, module)`.

Все шесть rows одной версии должны иметь
`profileRevision = Tenant.entitlementProfileRevision`. Частичное смешение
версий policy отклоняет.

Для point lookup используется unique tenant-leading index. Для tenant expiry
и cross-tenant expiry sweeps созданы отдельные composite/partial indexes.

## 3. Platform Admin mutation

Реализован endpoint:

```text
POST /admin/tenants/:tenantId/entitlement-profile
guards: JwtAuthGuard + PlatformAdminGuard
```

Он одновременно принимает stage, onboarding, cohort, support owner, trial и
все шесть module rows. Пример без production ID/PII:

```json
{
  "confirmation": "tenant-b",
  "expectedProfileRevision": 0,
  "reason": "Enable the reviewed first pilot profile",
  "requestId": "shared-beta-change-001",
  "supportTicket": "BETA-001",
  "customerStage": "PILOT",
  "onboardingStatus": "OWNER_INVITED",
  "cohortKey": "shared-beta-2026-08",
  "supportOwnerUserId": "<active-platform-admin-user-id>",
  "trialStartsAt": "2026-08-31T00:00:00.000Z",
  "trialEndsAt": "2026-09-30T00:00:00.000Z",
  "modules": [
    {
      "module": "GAMIFICATION",
      "readEnabled": true,
      "writeEnabled": true,
      "outboundEnabled": false,
      "validFrom": null,
      "validUntil": "2026-09-30T00:00:00.000Z"
    }
  ]
}
```

Фактический request обязан содержать все шесть module keys ровно по одному.
Пример выше сокращён и не является готовым payload.

Для initial shared-beta profile у всех шести строк обязательно
`readEnabled=true`, `writeEnabled=true`, `outboundEnabled=false`. Generic
profile endpoint всегда отклоняет payload, в котором хотя бы один
`outboundEnabled=true`; включить outbound сможет только отдельный
tenant/store-scoped workflow с собственными approval, canary, audit и kill
switch. Такой workflow в текущем срезе не реализован.

Допустимая onboarding mutation этого endpoint:

```text
X → X (profile/stage/trial update без onboarding transition)
```

Любой cross-state переход отклоняется как требующий dedicated workflow.
Provisioning создаёт tenant сразу в `OWNER_INVITED`; generic profile mutation
не переводит tenant ни в `OWNER_INVITED`, ни в `ONBOARDING`, `READY`, `ACTIVE`
или `OFFBOARDING`.

Транзакционный порядок:

1. проверить active Platform Admin и exact tenant-slug confirmation;
2. проверить stage/trial, complete module set и access hierarchy;
3. проверить active Platform Admin support owner;
4. выполнить CAS по `expectedProfileRevision` и прочитанному
   `Tenant.updatedAt`, чтобы не перезаписать параллельный onboarding/lifecycle
   transition;
5. заменить полный module set;
6. записать `TENANT_ENTITLEMENT_PROFILE_CHANGED` с before/after, request ID
   и SHA-256 digest канонического mutation payload;
7. commit.

Пара `(tenantId, action, requestId)` уникальна. Повтор идентичного request
возвращает сохранённый after-snapshot, а повтор request ID с другим digest
отклоняется. При CAS conflict никакие rows или audit не сохраняются. В
транзакции нет email, HTTP или другого внешнего вызова.

## 4. Legacy shared provisioning candidate

Реализованы два Platform Admin endpoint:

```text
POST /admin/shared-beta/tenants/provision
POST /admin/tenants/:tenantId/initial-owner-invite/revoke
guards: JwtAuthGuard + PlatformAdminGuard
```

Текущая реализация выполняет одну serializable-транзакцию и создаёт:

1. отдельный tenant в
   `PILOT + SUSPENDED + OWNER_INVITED + profileRevision=1`;
2. один неактивный Store с выключенной геймификацией;
3. tenant-scoped OWNER role override;
4. ровно шесть entitlement rows одной revision:
   `read/write=true`, `outbound=false`;
5. email-bound `OWNER + NETWORK` invite без stores/custom role;
6. audit receipt с каноническим request digest, support metadata и
   несекретным provisioning snapshot.

Raw invite token хранится только как hash. One-time registration URL
возвращается только при первом успешном вызове. Идентичный request replay
возвращает сохранённый receipt без дублей, но намеренно не раскрывает URL
повторно, в том числе после истечения create-only temporal admission window.
Конфликтующий request digest, занятые slug/email или неполная authority
отклоняются fail-closed. Для нового tenant `trialStartsAt` обязан находиться в
пределах 24 часов от provisioning, а invite должен оставаться действующим
минимум 24 часа от `max(provisioning time, trialStartsAt)`, чтобы candidate не
мог создать принципиально непринимаемое приглашение.

Revoke доступен Platform Admin только пока tenant pristine: initial invite
не принят, пользователей, других invite и integration state нет. В одной
serializable-транзакции invite удаляется, tenant возвращается в
`SUSPENDED + PROVISIONING`, и создаётся отдельный audit event с request
digest. Revoke не является reissue: безопасные resend/reissue/rotation и
защищённая email delivery ещё не реализованы.

Этот candidate подтверждён focused tests, но не real PostgreSQL
provision/revoke concurrency matrix. Даже после такого evidence он не является
целевым launch flow: сначала он должен быть заменён на
`SUSPENDED/PROVISIONING` shell без invite/token/trial, canonical email claim и
protected activation, атомарно создающую invite + encrypted mail outbox.
До этой замены controller fail-closed возвращает
`503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING`, не вызывая legacy
service. Endpoint нельзя вызывать с данными реального тестера.

## 5. Runtime policy

`TenantExecutionPolicyService` возвращает стабильный reason code и работает
deny-by-default.

Session admission:

```text
lifecycle ACTIVE
∩ onboarding ONBOARDING | READY | ACTIVE
∩ valid PILOT/BETA trial
∩ initialized complete profile for every non-INTERNAL tenant
```

Module admission:

```text
session admission
∩ initialized complete-profile revision
∩ exact module row of the same revision
∩ row validity
∩ READ | WRITE | OUTBOUND bit
```

Activation admission:

```text
lifecycle SUSPENDED
∩ onboarding OWNER_INVITED | ONBOARDING | READY | ACTIVE
∩ valid trial
∩ exactly six current-revision rows
∩ read+write enabled for all six modules
∩ outbound disabled in every module for every initial activation/reactivation
```

Activation policy реализована как fail-closed проверочный primitive для
текущего legacy candidate. Она ещё ожидает pre-populated trial и
post-provisioning onboarding state, поэтому не является реализацией целевой
shell activation. Dedicated workflow должен под persisted GO атомарно
сформировать новое trial-окно и переход `PROVISIONING → OWNER_INVITED`, затем
проверить proposed state. Generic Platform Admin lifecycle endpoint
разрешён только для `INTERNAL` tenant и отклоняет любую lifecycle mutation
non-`INTERNAL` tenant, включая `ACTIVATE`, `SUSPEND` и `ARCHIVE`. Поэтому
наличие валидного activation policy decision само по себе не меняет состояние
shared external tenant и не является разрешением на доступ.

## 6. Auth и owner onboarding

- Public self-registration закрыта и в controller, и на уровне `AuthService`.
- Login до выпуска JWT проверяет lifecycle/onboarding/trial.
- `JwtAuthGuard` повторяет session admission на каждом запросе по свежим
  persisted данным.
- Для authenticated external tenant HTTP classifier назначает обязательным
  beta-prefixes `module + READ|WRITE|OUTBOUND`. Неизвестный route отклоняется
  с `TENANT_MODULE_ROUTE_UNCLASSIFIED`; только `GET|HEAD /auth/me` — явное
  session-only исключение. Existing `INTERNAL` tenant временно обходит только
  module rows, но не lifecycle/session admission.
- Routes/service/guest-search Langame diagnostics имеют `READ`; persisted
  endpoint-profile/snapshot runs, manual pull/read-only ingest, reward redeem
  и local ledger queue имеют `WRITE`; report email,
  delivery dispatch и bonus-ledger provider dispatch имеют `OUTBOUND`.
- `TenantExecutionAdmissionService` для lower-layer/background callers на
  каждом вызове перечитывает tenant и module rows из PostgreSQL, поддерживает
  несколько обязательных modules и возвращает stable denial. `INTERNAL`
  compatibility bypass распространяется только на entitlement rows.
- Lower-layer adoption текущего checkpoint покрывает report email/digest,
  scheduled Langame sync и daily composite sync, bonus-ledger provider
  dispatch, scheduled delivery pipeline, Telegram/MAX provider dispatch и
  bot-delivery pull. Denied tenant получает `SKIPPED`/`BLOCKED`, не останавливая
  остальные tenants. `TenantExecutionAdmissionService` теперь выдаёт
  revision-bound permit и fail-closed отклоняет uninitialized revision `0`.
- Migration `164` добавляет trigger-owned `Tenant.executionRevision`,
  backfill existing tenants в `1`, baseline `0` для нового shell, ровно один
  bump на lifecycle/onboarding/trial/profile mutation и запрет direct revision
  write. Shared API lifecycle/profile/OWNER/revoke paths включают expected
  revision в CAS и проверяют фактический `+1`; legacy operator scripts не
  считаются этим доказательством и должны проходить отдельный rollout review.
  Migration до изменения схемы берёт `ACCESS EXCLUSIVE` locks и отклоняется
  с SQLSTATE `55000`, если существует `RUNNING` report digest или
  `PROCESSING/DISPATCHING` bonus-ledger entry. Drain является обязательной
  database precondition, а не только операторской договорённостью.
- Непосредственно перед SMTP выполняются `assertPermitCurrent` и повторное
  чтение active actor, effective `export_reports`, tenant revision и exact
  `NETWORK | STORES` scope; любое изменение authority после построения файла
  запрещает отправку. Scheduled run сохраняет captured revision.
  Bonus-ledger claim сохраняет revision в строке,
  непосредственно перед Langame вызывает `evaluatePermit`, а каждый
  worker-transition требует exact
  `status + claimGeneration + attempts + executionRevision`; pre-dispatch CAS
  дополнительно привязан к `lockedAt`.
  `claimGeneration` монотонно увеличивается при каждом claim и не сбрасывается
  operator retry, поэтому старый provider response не может подтвердить новую
  claim generation после `NOT_APPLIED`.
- Langame bonus write использует обязательный bounded timeout не более 30 секунд,
  заново читает active source и credential непосредственно у provider boundary и
  повторно проверяет reward/staff eligibility и normalized phone target после
  перехода в `DISPATCHING`. После этих проверок выполняется exact ownership
  lookup по generation/attempt/lock и текущему `Tenant.executionRevision`;
  stale worker не вызывает provider.
  Неоднозначный timeout не ретраится автоматически: запись переводится в
  `RECONCILIATION_REQUIRED`, а ручной `NOT_APPLIED` запрещён до истечения
  fail-closed quarantine (по умолчанию 30 минут). Это ещё не доказывает
  at-most-once: до подтверждения provider idempotency/status API outbound
  остаётся `OFF`.
- Token-only scheduled digest HTTP допускает только явно включённый
  `dryRun=true`. Live HTTP SMTP fail-closed до общей маршрутизации через
  persisted `ReportDigestScheduleRun` coordinator и unique run guard.
- Telegram/MAX delivery и длинный Langame sync пока имеют только fresh
  admission/preflight без общего durable claim/lease. Микро-гонка уже начатого
  provider request описывается как bounded drain/reconciliation; строгий
  двухфазный suspend остаётся обязательным до outbound `GO`.
- Временный background execution registry перечисляет 17 проверенных job kinds.
  Для `PILOT/BETA/LIVE` только `REPORT_DIGEST_SMTP` и
  `GUEST_BONUS_LEDGER_LANGAME` имеют `REVISION_FENCED`; остальные 15
  fail-closed получают `EXTERNAL_DENY`. Оба разрешённых пути сверяют registry
  на scheduler/claim boundary и повторно непосредственно перед SMTP/Langame.
  `INTERNAL` сохраняет legacy-совместимость. Этот слой является containment, а
  не durable suspend/drain fence: stage/revision flip после claim и уже
  переданный bot payload требуют migration `166` и общей claim generation.
  Полная матрица и ограничения:
  [background-execution-containment.md](./background-execution-containment.md).
- Scheduled report digest вычисляет фактические capabilities системной или
  custom role с tenant overrides; без `export_reports` recipient получает
  `CAPABILITY_EXPORT_REPORTS_REQUIRED`, а export и SMTP не запускаются.
  Непосредственно перед SMTP повторно читаются active state, tenant revision,
  exact network/store scope, role, custom role и tenant override; отозванный
  или изменённый recipient получает
  `RECIPIENT_AUTHORITY_REVOKED`.
- Cross-module Langame admission требует одновременно `INTEGRATIONS` и
  `ASSORTMENT`; guest foundation и business snapshot дополнительно требуют
  `GAMIFICATION` и `STAFF`. HTTP entrypoints синхронизации требуют
  AND-capabilities соответствующих модулей, а не только `run_sync`.
  Guest-foundation import использует отдельную capability
  `import_guest_foundation` и не открывает широкий `manage_guest_crm`.
- Login, invite preview/accept и каждый module action для external tenant
  разрешены только при exact профиле: ровно шесть уникальных rows текущей
  `entitlementProfileRevision`. Partial, duplicate и mixed-revision profile
  отклоняются до выдачи JWT, принятия invite или выполнения module action.
- На `OWNER_INVITED` допускается только email-bound
  `OWNER + NETWORK + no stores + no custom role`, причём в tenant ещё нет
  другого OWNER.
- Принятие первого `OWNER` invite блокирует tenant row `FOR UPDATE`; user,
  claim, audit и обязательный CAS transition `OWNER_INVITED → ONBOARDING`
  фиксируются в одной транзакции.
- Generic users/invites API не может назначить или выдать нового `OWNER`;
  для этого требуется отдельный owner-transfer workflow.
- Для любого external tenant generic direct user creation, invite
  issue/rotation и смена login email отклоняются. Они будут включены только
  через verified email delivery/change workflows, которые не возвращают raw
  token tenant actor и доказывают владение bound mailbox. До этого владелец
  может видеть пользователей, управлять разрешёнными non-identity полями и
  отзывать доступ, но не создавать новую login identity в обход проверки.

Таким образом suspend, onboarding revoke или trial expiry прекращают новые
login и authenticated requests без ожидания истечения JWT и без restart.

Текущая state machine:

```text
tenant create
  → SUSPENDED / PROVISIONING / revision 0
shared provisioning candidate
  → PILOT / SUSPENDED / OWNER_INVITED / revision 1
  → Store inactive / exact six rows read+write ON / outbound OFF
identical provisioning replay
  → same receipt / no duplicate / one-time URL not disclosed again
pristine initial-invite revoke
  → PILOT / SUSPENDED / PROVISIONING / revision 1
generic lifecycle mutation for non-INTERNAL tenant
  → DENY
generic customerStage transition
  → DENY
target shell provisioning replacement
  → PILOT / SUSPENDED / PROVISIONING / revision 1
  → no invite/token/trial; canonical owner-email claim only
protected SHARED BETA GO + dedicated activation
  → pending; intended transition to ACTIVE / OWNER_INVITED
  → trial + invite hash + encrypted mail outbox atomically
first OWNER invite acceptance after dedicated activation
  → ACTIVE / ONBOARDING
READY / ACTIVE / OFFBOARDING onboarding transitions
  → dedicated workflows pending
```

## 7. Что ещё не реализовано

Этот checkpoint не закрывает Gate 1MT. До первого внешнего владельца нужны:

1. exhaustive route manifest/decorators и policy для BFF/files/guest/Telegram;
2. durable worker lease/claim для delivery, Langame sync и оставшихся
   schedulers; strict suspend/drain поверх уже реализованного revision fence и
   временного 17-job fail-closed containment;
3. canonical email claim, encrypted outbox и fail-closed mail config;
4. shell-only provisioning вместо текущего raw-URL candidate;
5. persisted release gates и dedicated activation/suspend/reissue/revoke;
6. real PostgreSQL provision/activate/accept/suspend concurrency tests;
7. двухtenantная/двухклубная PostgreSQL/browser isolation matrix;
8. безопасный integration preview/select/map и tenant-aware Telegram;
9. Получить remote PASS подключённого PostgreSQL 16 populated
   `163 → 164` rehearsal, затем отдельно выполнить production-like
   backup/restore и operational rollout с обязательным pre-migration drain
   старого API/workers и zero in-flight evidence до apply revision fence.
10. DB-role/trigger sealing для прямого `TenantModuleEntitlement` DML:
    profile API уже повышает parent execution revision, но обходной runtime
    write должен быть запрещён до external `GO`.

До выполнения этого списка endpoint не вызывается с тестовым email, реальный
external tenant/invite не создаётся и release decision остаётся `NO-GO`.

## 8. Проверки текущего среза

Локально обязательны:

```text
Prisma format/validate/generate
database typecheck
API focused tests
API typecheck
boundary lint
seed safety
git diff --check
```

PostgreSQL migration smoke выполняется CI на чистой PostgreSQL 16. Локальный
run не заменяет remote exact-SHA evidence.

Для migration `164` обязательный CI дополнительно запускает безопасный
disposable rehearsal:

```text
TENANT_EXECUTION_REVISION_FENCE_UPGRADE_SMOKE_CONFIRM=run-tenant-execution-revision-fence-upgrade-smoke
pnpm --filter database db:smoke:tenant-execution-revision-fence-upgrade
```

Rehearsal создаёт две случайные test-БД из `template0`, не изменяет source
database и проверяет populated success, три SQLSTATE `55000` drain rejection,
`lock_timeout`, rollback после late DDL failure и idempotent повторный deploy.
Так как Prisma CLI при explicit `BEGIN/COMMIT` может скрыть исходный SQLSTATE
после попытки записать migration log из уже aborted transaction, harness:

1. извлекает exact committed preflight `DO` block migration `164`;
2. исполняет его через отдельное PostgreSQL connection и проверяет
   SQLSTATE `55000` вместе с точным reason;
3. отдельно запускает `migrate deploy` и проверяет non-zero bounded failure,
   attempt state в `_prisma_migrations`, отсутствие partial DDL/data,
   `resolve --rolled-back` и recovery deploy;
4. исполняет exact lock и late-index statements через отдельные connections и
   проверяет database SQLSTATE `55P03`/`42P07`; Prisma CLI output при этом
   обязан как минимум идентифицировать target-migration failure.

Изолированный локальный PostgreSQL `16.14` diagnostic run этого контракта
прошёл: сохранены `6` tenants, `6` report runs и `10` ledger rows; подтверждены
три drain rejection (`55000`), lock timeout (`55P03`), late-DDL conflict
(`42P07`) и rollback, `5` rolled-back attempts и recovery deploy.
Remote PostgreSQL 16 prerequisite для exact `CURRENT_164` пройден на SHA
`37f8cc88cdba05b3c73f6bc14e14528f831228ee`, CI run `30423839760`.
Exact `CURRENT_165` engineering candidate затем прошёл все три job на SHA
`4bd6a036df16579f68b2c96a14b6475c8311b231`, CI run `30428288353`, включая
populated Store rehearsal `164 → 165` и полный migration-smoke tail.
Documentation/evidence successor
`7c20adec4ee7cb0a390f1e38ec8e7dd333fa367f` также прошёл remote CI
`30429463161`.
Локальный diagnostic запуск сам по себе production-like evidence не является.
Migration `165` не применялась в production и не меняет release decision.
Это принятое historical prerequisite evidence. Current implementation
candidate уже включает
`20260729160000_guest_game_delivery_claim_fence`/`CURRENT_166`; его remote
exact-SHA и populated PostgreSQL `165 → 166` evidence ещё pending.

Последняя принятая проверка checkpoint `CURRENT_165`:

- tenant-execution suite: `16 suites / 663 tests`;
- background-execution containment suite: `15 suites / 665 tests`;
- focused security suite: `32 suites / 523 tests`;
- design-partner subset: `7 suites / 68 tests`;
- полный API regression: `96 suites / 1873 passed / 2 todo`
  (`1875 total`);
- API typecheck, production build, boundary/tenant-execution lint,
  production environment contract, Prisma validate/generate, database
  typecheck, seed safety `9/9`, migration-164 offline contract `6/6`,
  Store background-execution fence contract и
  populated-upgrade rehearsal self-test, real PostgreSQL `16.14` local
  diagnostic rehearsal, `git diff --check`: `PASS`.

StaffTask integrity-проверки сохраняют immutable prefix `1..162`, а migrations
`163..166` принимаются только как явно allowlisted additive tail, не
затрагивающий protected `StaffTask*` relations. Frozen StaffTask evidence
остаётся в state `EXPAND_162`; фактическая текущая БД и downstream
inventory/planner для current implementation candidate должны проходить
отдельный admission как `CURRENT_166` (`migrationCount=166`, latest
`20260729160000_guest_game_delivery_claim_fence`). Это operational target, а
не утверждение о завершённом remote или production-like evidence.
