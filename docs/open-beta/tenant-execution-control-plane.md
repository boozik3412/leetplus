# Tenant execution control plane: implementation checkpoint

| Поле             | Значение                                                        |
| ---------------- | --------------------------------------------------------------- |
| Версия           | 1.4                                                             |
| Дата             | 28.07.2026                                                      |
| Статус           | Foundation + provisioning candidate; adoption/evidence pending   |
| Release decision | `NO-GO` для внешнего owner invite                               |
| Migration        | `20260728120000_tenant_execution_control_plane_expand`           |
| Основная модель  | Shared PostgreSQL, отдельный `Tenant` на независимую сеть        |

Этот документ фиксирует фактически реализованный первый срез
`BETA-TEN-001..004` и `BETA-MT-002..004`. Shared provisioning остаётся
foundation candidate: он не имеет real PostgreSQL/concurrency evidence,
email delivery, reissue/rotation и dedicated activation workflow. Документ
не является разрешением на production migration или выдачу доступа.

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

## 4. Shared provisioning candidate

Реализованы два Platform Admin endpoint:

```text
POST /admin/shared-beta/tenants/provision
POST /admin/tenants/:tenantId/initial-owner-invite/revoke
guards: JwtAuthGuard + PlatformAdminGuard
```

Provisioning выполняется одной serializable-транзакцией и создаёт:

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

Этот candidate пока подтверждён focused tests, но не real PostgreSQL
provision/revoke concurrency matrix. Его endpoint нельзя вызывать с данными
реального тестера до Gate 1MT, Gate 2 и protected `SHARED BETA GO`.

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
∩ outbound disabled for the initial OWNER_INVITED activation
```

Activation policy реализована как fail-closed проверочный primitive для
будущего dedicated workflow. Generic Platform Admin lifecycle endpoint
разрешён только для `INTERNAL` tenant и отклоняет любую lifecycle mutation
non-`INTERNAL` tenant, включая `ACTIVATE`, `SUSPEND` и `ARCHIVE`. Поэтому
наличие валидного activation policy decision само по себе не меняет состояние
shared external tenant и не является разрешением на доступ.

## 6. Auth и owner onboarding

- Public self-registration закрыта и в controller, и на уровне `AuthService`.
- Login до выпуска JWT проверяет lifecycle/onboarding/trial.
- `JwtAuthGuard` повторяет session admission на каждом запросе по свежим
  persisted данным.
- Invite preview/accept разрешены только active tenant в допустимом onboarding
  state, действующем trial-окне и с initialized external profile.
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
dedicated shared external activation
  → pending; intended transition to ACTIVE / OWNER_INVITED
first OWNER invite acceptance after dedicated activation
  → ACTIVE / ONBOARDING
READY / ACTIVE / OFFBOARDING onboarding transitions
  → dedicated workflows pending
```

## 7. Что ещё не реализовано

Этот checkpoint не закрывает Gate 1MT. До первого внешнего владельца нужны:

1. real PostgreSQL и конкурентные provision/replay/revoke/accept tests;
2. защищённая email delivery, resend/reissue/rotation и recovery one-time URL;
3. dedicated external activation/suspend/offboarding workflows;
4. module metadata/guard на всех API/BFF routes обязательных модулей;
5. применение policy к exports, files, jobs, sync, Telegram и rewards;
6. двухtenantная/двухклубная real-PostgreSQL и browser isolation matrix;
7. завершение dedicated owner-transfer и немедленный session revoke;
8. безопасный integration preview/select/map;
9. shared worker leases/fencing и tenant-aware Telegram delivery;
10. migration smoke в PostgreSQL 16, backup/restore и operational rollout.

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

PostgreSQL migration smoke выполняется CI на чистой PostgreSQL 16. Локальная
машина без PostgreSQL/Docker не считается migration evidence.

StaffTask integrity-проверки сохраняют immutable prefix `1..162`, а migration
`163` принимается только как явно allowlisted additive tail, не затрагивающий
protected `StaffTask*` relations. Frozen StaffTask evidence остаётся в state
`EXPAND_162`; фактическая текущая БД и downstream inventory/planner должны
проходить отдельный admission как `CURRENT_163`.
