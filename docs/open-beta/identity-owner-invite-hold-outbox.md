# Dormant OWNER invite HOLD outbox

| Поле             | Значение                                                              |
| ---------------- | --------------------------------------------------------------------- |
| Версия           | 1.1                                                                   |
| Дата             | 29.07.2026                                                            |
| Backlog          | `BETA-IAM-004G`                                                       |
| Contract         | `DORMANT_OWNER_INVITE_HOLD_OUTBOX_V1`                                 |
| Schema target    | migration 171 / `CURRENT_171` candidate поверх принятого `CURRENT_170` |
| Статус           | `IMPLEMENTED_CANDIDATE`; local evidence `PASS`, exact-head CI pending  |
| Release decision | `NO-GO`; production, outbound и tester account не изменяются          |

## 1. Назначение и строгая граница

Этот checkpoint реализует dormant-контур первого атомарного выпуска initial
OWNER invite по
принятому immutable activation locator. Его цель — безопасно сохранить
invite hash и encrypted delivery payload, не открывая route и не разрешая
отправку.

Migration 171 предоставляет ровно один sealed atomic DB
writer. В одной транзакции writer:

1. находит и блокирует exact unbound `INVITE` claim;
2. создаёт один `UserInvite` с hard-coded `role=OWNER` и
   `accessScope=NETWORK`;
3. сохраняет только token hash в `UserInvite`;
4. создаёт один encrypted identity-mail outbox в состоянии `HOLD`;
5. переводит claim на созданный invite и сохраняет monotonic provenance
   revision;
6. создаёт immutable idempotency command;
7. создаёт PII-free audit event и возвращает PII-free receipt.

Все записи либо фиксируются вместе, либо полностью откатываются. Отдельные
ORM writes, partial commit и application-side compensation не являются
допустимой реализацией этого контракта.

Checkpoint остаётся dormant. Он не создаёт application path, способный
вызвать writer в production или выдать доступ внешнему клубу.

## 2. Authority и OWNER scope

`workflowLocator` — только opaque correlation key для bounded discovery. Он
не доказывает полномочия, не является bearer secret и не разрешает выпуск
приглашения.

Issue request должен быть связан с уже существующей shell reservation и
содержать exact ожидаемые tenant, locator, reservation subject и revision,
а также immutable request identifier и logical payload digest. Writer после
блокировки повторно проверяет:

- claim существует ровно в одном tenant;
- claim имеет ожидаемые locator, subject, revision и `claimType=INVITE`;
- reservation ещё не привязана к другому invite;
- idempotency command относится к тому же contract, environment, tenant,
  locator и logical payload;
- canonical email получен только из exact locked claim.

Caller не передаёт email, роль, access scope, custom role или store list.
Writer жёстко фиксирует:

```text
role          = OWNER
accessScope   = NETWORK
customRoleId  = NULL
storeIds      = []
```

`NETWORK` означает только текущий `tenantId`. Это не Platform Admin, не
доступ к другой сети и не право расширить собственный scope при последующей
delegation.

## 3. Persisted atomic result

Успешный first execution создаёт один согласованный aggregate:

```text
immutable command
  ├─ exact environment / tenant / locator / request / payload binding
  ├─ inviteId
  ├─ outboxId
  └─ final PII-free decision

UserInvite
  ├─ tenantId copied from locked claim
  ├─ canonical email copied inside the database
  ├─ hard-coded OWNER / NETWORK scope
  ├─ tokenHash only
  └─ persisted identityClaimRevision

IdentityMailOutbox
  ├─ same tenantId and inviteId
  ├─ status = HOLD
  ├─ versioned AEAD envelope
  └─ no claimable delivery lease

IdentityEmailClaim
  ├─ same immutable workflowLocator
  ├─ subjectId = inviteId
  ├─ claimType = INVITE
  └─ monotonic transitioned revision

PII-free audit / receipt
  └─ command, tenant, invite, outbox, decision and revision identifiers only
```

Migration 171 candidate must not expose any transition from `HOLD` to
`PENDING`. A `HOLD` row is durable encrypted preparation, not permission to
send. No worker can claim it.

## 4. Secret и encryption contract

Raw invite token остаётся one-time, cryptographically random и ephemeral.
Он создаётся из ровно 32 CSPRNG-байт и представляется canonical unpadded
base64url строкой ровно из 43 ASCII-символов. Совместимый `UserInvite`
contract хранит `tokenHash = lowercase_hex(SHA-256(token UTF-8))` длиной
64 символа и отдельный `tokenDigestVersion=sha256-v1`. Raw token:

- не хранится в plaintext;
- представлен в `UserInvite` только hash;
- представлен в outbox только authenticated ciphertext;
- не возвращается из database receipt или HTTP;
- не попадает в audit, idempotency command, application/proxy logs, traces,
  metrics, exceptions, fixtures или git.

AEAD использует отдельный `IDENTITY_MAIL_ENCRYPTION_KEY`: ровно 32
CSPRNG-байта в canonical unpadded base64url строке из 43 символов. Допустим
только `IDENTITY_MAIL_ENCRYPTION_KEY_VERSION=v1`; fallback или reuse JWT,
APP, integration, fingerprint и других production secrets запрещены.
`IDENTITY_MAIL_AAD_ENVIRONMENT` — отдельный несекретный exact lowercase
identifier по шаблону `[a-z0-9][a-z0-9._-]{0,63}`. Он сохраняется вместе с
command/outbox и не выводится из competing environment markers.

Envelope version `1` — один binary `bytea` ровно из `71` байта:

```text
nonce              12 random bytes
ciphertext         43 bytes (AES-256-GCM encryption of the 43-byte token UTF-8)
authenticationTag  16 bytes
total              71 bytes
```

Canonical AAD — deterministic UTF-8 JSON с фиксированным порядком и полным
exact набором полей:

```text
domain           = leetplus:identity-mail-secret-envelope
schemaVersion    = 1
environment      = persisted aadEnvironment
tenantId         = exact lowercase UUID
workflowLocator  = exact lowercase UUID
inviteId         = exact lowercase UUID
outboxId         = exact lowercase UUID
template         = INITIAL_OWNER_INVITE
messageKey       = exact lowercase UUID
requestDigest    = 64 lowercase hex
tokenHash        = 64 lowercase hex
digestVersion    = sha256-v1
expiresAt        = canonical UTC ISO-8601 with milliseconds
keyVersion       = v1
envelopeVersion  = 1
```

`commandId`/`issueRequestId` не входит в AAD: logical `requestDigest` и
уникальные tenant/invite/outbox/message identifiers уже дают необходимый
binding. Persisted identifiers и timestamp назначаются до encryption и затем
атомарно подтверждаются writer. Environment и tenant binding обязательны:
ciphertext нельзя перенести между local/staging/production, restore-контуром
или tenants.

Dedicated application crypto primitive при open сначала требует exact
совпадение persisted `aadEnvironment` с configured environment, заново
собирает exact AAD и fail-closed отклоняет любое несовпадение, malformed
length/version, ciphertext или tag. Primitive остаётся незарегистрированным:
migration 171 не создаёт provider, route, worker или runtime grant.
Результат `seal` содержит только hash, ciphertext и versioned metadata:
plaintext token из него не возвращается. Отрицательный source-boundary test
не допускает import/registration primitive вне его собственного unit-test до
отдельного activation checkpoint.

Email, raw token, token hash и ciphertext запрещены в response, logs, audit
и receipt. Outbox может хранить ciphertext и его non-secret envelope
metadata только в пределах этой persisted записи.

## 5. Глобальный lock order

Порядок должен оставаться совместимым с существующими
accept/reissue/revoke writers:

```text
canonical authority/request preflight
  → request-scoped transaction advisory lock
  → idempotency command replay lookup
  → bounded locator discovery without row lock
  → canonical email advisory lock
  → exact IdentityEmailClaim row FOR UPDATE
  → deterministic command/invite/outbox/audit writes
```

Запрещены:

- `claim row → email advisory lock`;
- `Tenant row → email/claim lock`;
- создание invite/outbox до exact claim recheck;
- разные lock orders для first execution и replay.

До отдельного изменения lock protocol coordinator обязан выполнять не более
одного issue RPC в одной короткой DB transaction. Batch нескольких issue RPC
в одной внешней transaction запрещён: пересечение request/email locks иначе
может образовать deadlock. Этот invariant должен иметь application integration
test до регистрации coordinator.

Issue-only path намеренно не блокирует и не изменяет `Tenant`. Будущий accept
может после identity locks блокировать Tenant в уже установленном глобальном
порядке. Это сохраняет совместимость без обратной зависимости
`Tenant → claim`.

## 6. Idempotency и replay

Idempotency identity — exact сочетание contract operation, environment,
tenant и stable request identifier. Immutable logical payload digest
включает только caller-controlled logical authority/provenance inputs,
например expected locator, reservation subject и claim revision. Stable
request identifier является отдельной частью idempotency identity, а не
случайным output.

Generated aggregate IDs (`commandId`, `inviteId`, `outboxId`, `messageKey`),
generated
timestamps (`expiresAt`, `createdAt`), raw token, token hash, nonce,
ciphertext, authentication tag и envelope bytes не входят в logical
`requestDigest`. Они создаются только для first execution и связываются
отдельными persisted columns и canonical AAD.

Replay никогда не доверяет одной command row. После nonlocking lookup он
проходит тот же locator/email/claim lock order и проверяет exact progressed
state:

- command binding и payload digest неизменны;
- claim всё ещё указывает на recorded invite с recorded revision;
- invite имеет exact tenant, hard-coded role/scope и recorded provenance;
- outbox указывает на тот же invite и остаётся exact recorded `HOLD`;
- audit/receipt identifiers и decision совпадают.

При полном совпадении replay возвращает тот же logical PII-free receipt с
decision `REPLAYED`. Он не генерирует и не ротирует secret, не меняет hash
или ciphertext, не создаёт новый invite/outbox и не продлевает expiry.
Freshly proposed generated IDs, timestamps, token, hash и ciphertext на replay
игнорируются: авторитетны только persisted command/invite/outbox значения.
При этом другой logical `requestDigest` для того же idempotency identity
остаётся collision и отклоняется fail-closed.

Любое частичное, несовместимое, terminal или неожиданно progressed состояние
заканчивается fail-closed reconciliation reason. Оно не исправляется
автоматической ротацией. Если первоначальная транзакция не commit-нулась,
никакой aggregate или command не существует; это новая попытка, а не replay
успешной команды.

## 7. RPC и database privileges

Issue RPC migration 171 candidate остаётся dormant:

- PUBLIC EXECUTE отозван;
- application runtime не получает EXECUTE;
- enrollment manifest фиксирует RPC как `EXCLUDED_PENDING`;
- grant option отсутствует;
- owner и exact `search_path=pg_catalog` должны проверяться catalog evidence;
- `IdentityEmailClaim` сохраняет zero effective runtime table/column
  privileges;
- новые outbox и command relations имеют zero effective runtime table/column
  privileges; privileges существующей audit relation не расширяются;
- существующие privileges на `UserInvite` не расширяются;
- direct table writes не заменяют sealed writer.

Runtime allowlist `CURRENT_171` остаётся ровно seven-RPC. Добавление
issue RPC в migration catalog не означает runtime enrollment и не открывает
route.

## 8. PII-free receipt и audit

Допустимый logical receipt ограничен allowlist-проекцией:

```json
{
  "schemaVersion": 1,
  "operation": "ISSUE_DORMANT_OWNER_INVITE",
  "decision": "CREATED",
  "tenantId": "<uuid>",
  "commandId": "<uuid>",
  "inviteId": "<uuid>",
  "outboxId": "<uuid>",
  "outboxStatus": "HOLD",
  "claimType": "INVITE",
  "claimRevision": 2,
  "role": "OWNER",
  "accessScope": "NETWORK"
}
```

Replay меняет только `decision` на `REPLAYED`; persisted aggregate и
остальные значения совпадают. Любое дополнительное поле отклоняется
application boundary.

Audit хранит operation, decision, tenant/invite/outbox/command identifiers,
actor/provenance identifiers и redacted reason code. Raw и canonical email,
token, URL, token hash, ciphertext, key material и encryption nonce не
допускаются в audit/receipt или error detail.

## 9. HTTP boundary

Migration 171 candidate не подключается к controller/service. Все
shared-beta admin routes, способные создать или отозвать initial OWNER
invite, остаются fail-closed:

```text
503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING
503 SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING
```

Наличие shell tenant, workflow locator или DB-owner test invocation не
разрешает application runtime grant и не меняет этот HTTP contract.

## 10. Намеренно не входит

Этот checkpoint не реализует и не разрешает:

- SMTP или иной outbound provider call;
- delivery worker, lease, claim, retry или reconciliation worker;
- `HOLD → PENDING` или любой другой outbox transition;
- persisted `SHARED BETA GO` и release-gate consumption;
- trial start;
- activation, suspend, onboarding или любую иную mutation `Tenant`;
- resend, reissue, revoke, accept или email change;
- production migration/deployment;
- создание внешнего tenant, tester account или временного пароля.

Внешний release decision остаётся `NO-GO`.

## 11. Evidence и остаточная приёмка

Local candidate evidence:

1. clean `171/171` и populated `CURRENT_170 → CURRENT_171` PostgreSQL 16
   deploy прошли;
2. first execution, replay/collision, malformed authority, late-fault
   rollback, immutable guards и progressed-state rejection прошли;
3. `100` concurrent contenders дали `1 CREATED + 99 REPLAYED`, deadlocks `0`;
4. hostile non-owner default ACL полностью откатывает migration, после
   удаления unsafe defaults normal retry проходит;
5. runtime allowlist остаётся `7`, issue RPC — `EXCLUDED_PENDING`,
   application/PUBLIC EXECUTE отсутствует;
6. три sealed relations и exact `45` columns не имеют effective/direct/PUBLIC
   runtime privileges; deliberate table/column ACL drift обнаруживается и
   устраняется;
7. raw token удалён из seal result, canonical AAD закреплён exact UTF-8
   assertion и fixed AES-256-GCM known-answer vector;
8. source-boundary test подтверждает отсутствие provider/module/route/worker
   registration.

До перевода `BETA-IAM-004G` в «Готово» остаются exact release-artifact
verification, полный локальный CI-equivalent, independent final review и
remote GitHub CI на точном candidate SHA. До будущей активации дополнительно
обязательны one-RPC-per-transaction coordinator invariant и сквозной
`seal → RPC → persisted outbox → open` PostgreSQL integration test.

Даже успешная engineering-приёмка этого checkpoint не разрешит выдачу
тестового доступа. Для неё отдельно нужны persisted GO, controlled
`HOLD→PENDING`, verified delivery, activation/trial lifecycle,
production-like admission, Gate 1MT, Gate 2 и explicit `SHARED BETA GO`.
