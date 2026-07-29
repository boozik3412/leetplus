# Migration 166: durable delivery claim design

| Поле             | Значение                                                   |
| ---------------- | ---------------------------------------------------------- |
| Версия           | 0.5                                                        |
| Дата             | 29.07.2026                                                 |
| Статус           | Design candidate; 4 review включены, code отсутствует      |
| Release decision | `NO-GO` для external delivery и owner invite               |
| Базовая схема    | Exact `CURRENT_165`                                        |
| Первый scope     | `GuestGameDelivery`, Store fence consumption, direct и bot send paths |

## 1. Назначение

Этот документ фиксирует первый vertical slice durable worker plane из
`BETA-MT-008`.

Текущая проблема launch-blocking:

- direct dispatcher читает `READY`, вызывает provider и завершает delivery без
  durable claim;
- bot pull также только читает `READY`;
- direct dispatcher и несколько bot consumers могут отправить один payload
  одновременно;
- bot ack и manual mutation не имеют generation-bound CAS;
- tenant/store policy может измениться после pull, но до provider effect.

Remote PostgreSQL 16 prerequisite для exact `CURRENT_164` пройден на SHA
`37f8cc88cdba05b3c73f6bc14e14528f831228ee` (CI run `30423839760`).
Migration `165` добавляет только fail-closed Store background-execution fence,
не включает ни один Store и не разрешает outbound. Delivery claim migration
`166` всё ещё не создана. До начала её реализации обязателен отдельный remote
PostgreSQL 16 PASS exact-SHA кандидата `CURRENT_165`, включая populated
rehearsal `164 → 165`; локальные проверки этого не заменяют. Этот документ
является design contract, а не разрешением создать migration, применить DDL
или включить outbound.

## 2. Принятое архитектурное решение

Первый срез хранит claim state непосредственно в `GuestGameDelivery`, а общий
контракт реализует typed coordinator/token API.

Причины:

1. Claim, token digest, payload snapshot и event фиксируются одной короткой
   БД-транзакцией.
2. Сохраняются настоящие FK и same-tenant Store invariant.
3. Legacy `prepare`, manual update, cancellation и ack можно защитить
   предикатами той же строки.
4. Полиморфный `subjectId` в общей таблице не остановит старый безусловный
   update delivery без дополнительного trigger/CAS.
5. Существующие сильные паттерны bonus ledger и reward materializer уже
   используют domain-row generation fencing.

Общая coordination-модель для Langame, reports и остальных schedulers может
появиться следующим additive slice. Она не заменяет domain-level CAS для
provider effects.

## 3. Изменения схемы

### 3.1. `GuestGameDelivery`

Добавить:

```text
attempts               Int       NOT NULL DEFAULT 0
attemptBudget          Int       NOT NULL DEFAULT 5
claimGeneration        Int       NOT NULL DEFAULT 0
claimJobKind            String?
integrityState          String    NOT NULL DEFAULT 'VERIFIED'
integrityReasonCode     String?
executionRevision      Int?
storeExecutionRevision Int?
leaseOwner             String?
claimKeyVersion        Int?
claimOwnerDigest       String?
claimTokenDigest       String?
claimedAt              Timestamptz(3)?
leaseExpiresAt         Timestamptz(3)?
acknowledgeUntil       Timestamptz(3)?
effectInputDigest      String?
providerConfigDigest   String?
providerAuthorityRevision Int?
workloadIdentityDigest String?
sendGrantDigest        String?
sendGrantExpiresAt     Timestamptz(3)?
providerAttemptKey     String?
providerAttemptedAt    Timestamptz(3)?
providerOutcomeClass   String?
providerOutcomeCode    String?
providerObservedAt     Timestamptz(3)?
providerReceiptDigest  String?
providerReceiptRefEncrypted Bytes?
providerReceiptKeyVersion Int?
terminalAckDigest      String?
```

Новые runtime states:

```text
READY
PROCESSING
DISPATCHING
SENT
FAILED
BLOCKED
CANCELED
RECONCILIATION_REQUIRED
```

Инварианты:

- CHECK допустимых status разрешает только восемь значений выше;
- `integrityState IN ('VERIFIED', 'LEGACY_QUARANTINED')`;
- non-null `claimJobKind` разрешает только direct dispatch или bot pull;
- `0 <= attempts <= attemptBudget <= 10`;
- `0 <= claimGeneration < 2147483647`; exhaustion блокирует claim и создаёт
  alert;
- при active claim: `claimedAt < leaseExpiresAt <= acknowledgeUntil`;
- если marker существует:
  `claimedAt <= providerAttemptedAt < leaseExpiresAt`;
- при send grant:
  `providerAttemptedAt < sendGrantExpiresAt <= leaseExpiresAt <= acknowledgeUntil`;
- `storeId IS NULL` требует `storeExecutionRevision IS NULL`;
- `storeId IS NOT NULL` в активной claim требует положительную
  `storeExecutionRevision`;
- `claimGeneration` не сбрасывается при operator retry;
- `attempts` повышается ровно один раз при каждом `READY → PROCESSING` и
  никогда не сбрасывается; dedicated retry может увеличить `attemptBudget`
  только на один, с reason/event и общим пределом `10`.

Per-state CHECK/nullability contract:

| State | Обязательные данные | Запрещённые/особые данные |
| --- | --- | --- |
| `READY` | verified provider Store/recipient binding | Нет active lease, marker, send grant или outcome |
| `PROCESSING` | generation/job/revisions, owner+token digests, raw lease owner, claim/effect/config snapshot, lease+ack window | Нет provider marker, send grant, outcome или terminal ack |
| `DISPATCHING` | всё claim evidence, provider authority/workload digests, marker, one-time send grant и ack window | Нет terminal ack; marker неизменяем |
| `RECONCILIATION_REQUIRED` | captured claim evidence, marker, digests и sanitized ambiguous outcome evidence | Raw lease/grant очищены; auto retry запрещён |
| `SENT` | marker, definitive-success evidence и terminal ack digest | Raw lease/grant очищены; status immutable |
| `FAILED` | либо definitive-not-applied marker/outcome/ack, либо unattempted exhaustion evidence | Generation-terminal; возврат в `READY` только dedicated retry |
| `BLOCKED` | reason/event; legacy evidence сохраняется | Active lease/grant отсутствуют; claim запрещён |
| `CANCELED` | cancel reason/event | Active или ambiguous attempt запрещён |

Для `LEGACY_QUARANTINED` migration допускает отсутствующее новое evidence,
но DB запрещает переход в `READY/PROCESSING/DISPATCHING` до reconciliation.
Для всех новых `VERIFIED` rows state matrix является строгим CHECK, а не
только service-level validation.

FK и delete policy:

```text
storeId -> Store(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT

(tenantId, storeId) -> Store(tenantId, id)
  ON DELETE RESTRICT ON UPDATE RESTRICT

(tenantId, rewardId) -> GuestGameReward(tenantId, id)
  ON DELETE RESTRICT ON UPDATE RESTRICT

(tenantId, profileId) -> GuestGameProfile(tenantId, id)
  ON DELETE RESTRICT ON UPDATE RESTRICT

(tenantId, guestId) -> Guest(tenantId, id)
  ON DELETE RESTRICT ON UPDATE RESTRICT
```

Legacy `GuestGameDelivery_storeId_fkey ... ON DELETE SET NULL` удаляется в той
же транзакции. Simple и composite Store FK совместно запрещают как
cross-tenant ссылку, так и превращение club delivery в tenant-global запись
при hard delete. Store для этой очереди архивируется через `isActive=false`;
hard delete запрещён, пока существует delivery history. Composite reward FK
исключает delivery, ссылающуюся на reward другого tenant; для него
`GuestGameReward` получает explicit unique `(tenantId, id)`. Если Prisma не
может смоделировать оба Store FK одновременно, simple compatibility FK
остаётся явным DB-native contract с schema comment и catalog test.

Индексы:

```text
UNIQUE (tenantId, providerAttemptKey)
  WHERE providerAttemptKey IS NOT NULL

(tenantId, readinessStatus, channel, preparedAt, id)
  WHERE status = 'READY'

(tenantId, leaseExpiresAt, id)
  WHERE status = 'PROCESSING' AND providerAttemptedAt IS NULL

(tenantId, acknowledgeUntil, id)
  WHERE status = 'DISPATCHING'

(tenantId, providerObservedAt, id)
  WHERE status = 'RECONCILIATION_REQUIRED'

(tenantId, storeId, status, leaseExpiresAt, id)
  WHERE storeId IS NOT NULL
```

Partial indexes остаются explicit SQL migration contract и отдельно
проверяются catalog smoke.

### 3.2. Canonical effective Store

Новая effect-eligible provider delivery (`TELEGRAM`/`MAX`) не может быть
tenant-global:

- `delivery.storeId` и `reward.storeId` обязаны быть непустыми и равными;
- claim и provider attempt каждый раз читают актуальный reward и отклоняют
  mismatch;
- `CASHIER`/`MANUAL` без внешнего provider могут оставаться с `storeId=NULL`,
  но не могут войти в provider claim;
- для любой `VERIFIED` provider delivery Store binding становится immutable
  после первого claim и сохраняется через terminal history; изменение
  `reward.storeId` запрещено. Legacy mismatch допустим только как
  `LEGACY_QUARANTINED` read-only evidence.

Перед включением constraints migration выполняет inventory:

1. cross-tenant reward или непустой delivery Store другого tenant — preflight
   `SQLSTATE 55000`; migration не исправляет authority corruption;
2. `delivery.storeId=NULL`, same-tenant `reward.storeId!=NULL` и non-terminal
   delivery — deterministic backfill из reward с одним event;
3. оба значения равны — строка сохраняется;
4. same-tenant mismatch либо provider delivery без reward Store в
   `READY` — `BLOCKED`, `LEGACY_QUARANTINED`, immutable event и reason;
5. legacy `FAILED/SENT/CANCELED` mismatch/null сохраняет status/evidence,
   получает `LEGACY_QUARANTINED` и integrity event; retry запрещён без
   dedicated reconciliation;
6. nullable non-provider строки сохраняются без искусственного Store.

После inventory structurally valid rows получают `VERIFIED`, исключения —
`LEGACY_QUARANTINED`; только затем колонка становится `NOT NULL DEFAULT
'VERIFIED'` для новых rows.

DB-native deferred constraint triggers на `GuestGameDelivery` и изменение
`GuestGameReward.storeId` вместе с composite reward FK защищают равенство от
direct DML и concurrent reward mutation для effect-eligible states и
immutable Store binding всей `VERIFIED` provider history. Trigger блокирует
соответствующие reward/delivery rows в стабильном порядке. Historical
terminal/quarantined legacy mismatch остаётся read-only evidence, но не может
перейти в effect-eligible state. Одного service-level join недостаточно.

### 3.3. Recipient authority

`GuestGameProfile` и `Guest` получают explicit unique `(tenantId, id)`, после
чего delivery использует composite same-tenant `RESTRICT` FK. Provider claim
дополнительно требует, чтобы delivery profile/guest совпадали с canonical
recipient graph reward и принадлежали тому же tenant. Consent/unsubscribe и
channel identity читаются только через этот graph.

Migration inventory:

- cross-tenant profile/guest или event identity — preflight `SQLSTATE 55000`,
  zero partial changes;
- same-tenant delivery↔reward recipient mismatch — status сохраняется,
  `integrityState=LEGACY_QUARANTINED`, event и запрет retry;
- nullable non-provider legacy identity допустима, но не может войти в
  provider claim;
- hard delete profile/guest с delivery evidence запрещён; PII удаляется
  отдельной anonymization/retention процедурой без стирания effect evidence.

### 3.4. Delivery event evidence

В `GuestGameDeliveryEvent` добавляется nullable `transitionKey` и unique
`(tenantId, transitionKey)`. CHECK требует непустой key для versioned durable
event types: `CLAIMED`, `ATTEMPTED`, `FINALIZED`, `REAPED`, `RETRIED`,
`CANCELED`, `RECONCILED`, `INTEGRITY_QUARANTINED`. Key имеет фиксированный формат
`v1:<sha256(canonical-json)>`, где canonical input связывает delivery,
generation, event type, attempt и outcome; raw PII/secret в key отсутствуют.
Legacy event types могут сохранить `NULL`.

Claim, provider marker, finalize, reaper, release, retry, cancel и
reconciliation меняют delivery и вставляют event в одной транзакции, поэтому
replay не создаёт второе событие.

`GuestGameDelivery` получает unique `(tenantId, id)`, а event — composite
same-tenant FK `ON DELETE RESTRICT` к delivery и reward. Legacy cascade FK
delivery→reward и event→delivery/reward заменяются на `RESTRICT`, чтобы delete
reward не стирал claim/provider evidence. Constraint trigger проверяет, что
`event.rewardId` равен reward текущей delivery. Runtime role не имеет `UPDATE`
event; ordered `event → delivery → reward` delete доступен только отдельному
retention workflow после завершения evidence retention.

Перед FK выполняется inventory legacy events. Cross-tenant
`event.tenantId/deliveryId/rewardId` либо event reward, не равный delivery
reward, даёт preflight `SQLSTATE 55000`; migration не перепривязывает audit
evidence. Отдельная failure fixture доказывает zero partial changes, а success
fixture — `convalidated=true` для всех новых FK.

Event хранит scope, revision, generation, digests и allowlisted sanitized
provider evidence: adapter/version, outcome class/code, HTTP class без body,
opaque provider receipt/message reference, `observedAt` и provenance.
Чувствительный receipt reference хранится только encrypted с key version;
raw claim/send token, recipient identity, provider credentials, response body
и payload PII в event/log не попадают.

Для cross-table trigger все writers сначала берут transaction advisory lock
по versioned hash `(tenantId,rewardId)`, затем `GuestGameReward FOR UPDATE`,
затем связанные deliveries `FOR UPDATE ORDER BY id`. SQLSTATE `40P01` до
provider marker допускает не более трёх retries с jitter; после marker
автоматический transaction retry запрещён и требуется reconciliation.

### 3.5. Store-level fence

Exact base `CURRENT_165` уже содержит:

```text
backgroundExecutionEnabled Boolean NOT NULL DEFAULT false
executionRevision          Int     NOT NULL DEFAULT 0
```

Migration `166` не добавляет эти поля повторно, не меняет их defaults и не
сбрасывает существующие значения. Она обязана проверить exact base contract и
использовать captured Store revision во всех claim/attempt/finalize predicates.
Migration `165` уже гарантирует:

- существующие Store в момент применения `165` получают
  `backgroundExecutionEnabled=false`, `executionRevision=0`, а новые Store
  имеют те же fail-closed defaults;
- после любого execution-policy transition trigger сохраняет произвольную
  неотрицательную монотонную `executionRevision`; migration `166` обязана
  сохранить её без reset;
- migration не выбирает «текущий INTERNAL Tenant» и не включает Store по
  environment-specific данным;
- после будущего отдельного deploy/GO audited control-plane cutover по exact Tenant/Store
  IDs может включить одобренные `Tenant A/A1..A4`; trigger повышает revision,
  а receipt связывает IDs, accepted SHA, actor, reason и timestamp;
- новый Store по умолчанию не допускает background effect.

Trigger-owned Store revision повышается ровно один раз при изменении:

- `isActive`;
- `gamificationEnabled`;
- `backgroundExecutionEnabled`;
- `integrationSourceId`;
- `externalProvider`;
- `externalDomain`;
- `externalClubId`.

Прямая запись revision запрещена. `backgroundExecutionEnabled=true` для
inactive Store запрещено. Archive выполняет один atomic update:
`isActive=false + backgroundExecutionEnabled=false`; BEFORE trigger также
fail-safe сбрасывает флаг при direct archive DML и повышает revision ровно
один раз.

Enable/disable доступен только через audited control-plane endpoint с
capability `manage_store_background_execution`, tenant/Store scope, expected
revision, reason и persisted activation/cutover GO. Новый внешний Store
остаётся `false` до отдельного Store activation. DTO/controller/service,
`StoresService.archive`, Platform Admin/owner UI, API/web capability catalogs,
default/custom role grants и seed safety входят в тот же atomic slice.

## 4. Claim token

Внутренний token:

```ts
type TenantBackgroundClaimToken = {
  version: 1;
  keyVersion: number;
  purpose: 'delivery-provider-effect';
  audience: 'leetplus-delivery-coordinator';
  tenantId: string;
  storeId: string | null;
  subjectId: string;
  channel: 'TELEGRAM' | 'MAX';
  jobKind:
    | 'GUEST_GAME_DELIVERY_DISPATCH'
    | 'GUEST_GAME_DELIVERY_BOT_PULL';
  claimGeneration: number;
  executionRevision: number;
  storeExecutionRevision: number | null;
  leaseOwner: string;
  leaseExpiresAt: string;
  acknowledgeUntil: string;
};
```

Внешний bot consumer не получает редактируемый набор этих полей. API выдаёт
opaque 256-bit CSPRNG capability token; в БД хранится только HMAC-SHA-256
digest token и отдельный HMAC digest raw lease owner. Token digest связан с
owner digest, всеми остальными полями внутреннего token, delivery ID, channel,
purpose, audience и обоими expiry. Внешний token имеет только несекретный
version/key-version prefix и случайный secret; он не является JWT и не
раскрывает claims.

Криптографический контракт:

- отдельный production key ring `GUEST_GAME_DELIVERY_CLAIM_TOKEN_KEYS`, без
  fallback на JWT/invite/service secrets;
- startup fail-closed, если active key отсутствует, слабый или повторяет иной
  application secret;
- issuance только active key; verification — active и bounded previous keys;
- previous key нельзя удалить до окончания всех `acknowledgeUntil` либо
  явного revoke оставшихся claims;
- raw token никогда не хранится и маскируется в logs/traces/errors;
- constant-time digest comparison, purpose/audience/channel/job binding и
  rejection любого replay в другой tenant, Store, delivery или generation.

`leaseExpiresAt` ограничивает право начать provider attempt.
`acknowledgeUntil` даёт более длинное bounded окно только для finalize уже
зафиксированного attempt. После него результат переводится в reconciliation,
а не принимается как обычный late ack. Duplicate terminal token также
принимается только до `acknowledgeUntil`; более длинный evidence retention
служит аудиту, но не продлевает cryptographic authority.

One-time `sendGrant` — отдельный opaque capability с TTL короче claim lease.
Он выдаётся только attempt endpoint, связан с token/generation,
`effectInputDigest`, `providerConfigDigest`, workload identity, provider
authority revision, endpoint и credential-version. Pull не выдаёт send grant.

Provider config authority:

- несекретные config/endpoint и credential version хранятся в защищённом
  control plane с монотонной revision;
- raw credential доступен принятой workload identity только из secret manager
  по exact version; API raw secret не возвращает;
- protected deployment manifest аттестует accepted SHA/protocol,
  adapter version, workload identity и egress policy;
- attempt проверяет подписанную attestation и связывает её digest с grant;
- network policy разрешает accepted workload только к allowlisted endpoint.

Consumer, который не может предъявить принятую attestation или получить exact
secret version, не получает sendable payload/grant и не имеет provider egress.

## 5. Единый effect protocol

### 5.1. Claim

`claimDeliveryBatch`:

1. получает fresh tenant execution permit;
2. проверяет temporary background registry;
3. одним `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED)` выбирает
   `READY` либо expired `PROCESSING`;
4. одновременно сверяет:
   - текущий `Tenant.executionRevision`;
   - active lifecycle/trial/entitlements;
   - Store active/enabled state и Store revision;
   - provider channel имеет canonical effective Store;
5. повышает `claimGeneration`;
6. внутри той же транзакции генерирует отдельный 256-bit token на строку и
   записывает owner/token digests, revisions, effect/provider-config digests
   и bounded lease;
7. атомарно создаёт `DELIVERY_CLAIMED` event.

Expired `PROCESSING` можно reclaim только если `providerAttemptedAt IS NULL`.

### 5.2. Provider attempt

`markProviderAttempt` в короткой транзакции блокирует delivery, reward,
recipient/profile identity, Tenant и Store в фиксированном порядке. Перед
provider заново проверяются:

1. полный claim token, lease и текущие Tenant/Store revisions;
2. lifecycle, trial, exact entitlements и background registry;
3. consent/unsubscribe, channel readiness и актуальная recipient identity;
4. reward status/eligibility, expiry, cancel/redeem state;
5. canonical effective Store и соответствие delivery текущему reward;
6. provider enabled/configured, control-plane/credential revision, signed
   workload attestation, разрешённый endpoint и egress policy.

Из проверенных данных строится immutable effect snapshot:

- canonical message/payload digest;
- HMAC recipient-target fingerprint без raw identity;
- reward/delivery/channel/Store binding;
- provider configuration/version digest без secret.

Если recomputed snapshot/digests отличаются от captured claim либо любая fresh
проверка не проходит, provider не вызывается. Delivery атомарно переводится в
`BLOCKED` или безопасно освобождается по классифицированной причине, вместе с
event.
Особенно важно: уже claimed `PROCESSING` не обходит unsubscribe, смену
identity, expiry или cancel.

При успехе `markProviderAttempt` выполняет CAS по полному claim token:

1. delivery переходит `PROCESSING → DISPATCHING`;
2. подтверждаются captured `effectInputDigest`/`providerConfigDigest` и
   записываются authority/workload digests, уникальный `providerAttemptKey`,
   `providerAttemptedAt` и digest короткого one-time send grant;
3. в той же транзакции создаётся `DELIVERY_PROVIDER_ATTEMPTED` event;
4. только после commit direct coordinator либо attempt response получает exact
   immutable send snapshot. Никакой payload, полученный раньше, не является
   sendable.

Crash до marker допускает reclaim. Crash после marker не допускает
автоматический resend и переводит delivery в
`RECONCILIATION_REQUIRED`.

### 5.3. Finalize

`finalizeDelivery` принимает полный claim token:

- `SENT` и `FAILED` фиксируются только из принадлежащего worker
  `DISPATCHING`;
- token generation/owner/captured revision, не совпадающие со значениями
  delivery row, не меняют строку; изменение current Tenant/Store revision уже
  после committed attempt не запрещает exact finalize этого attempt;
- terminal transition и event создаются одной транзакцией;
- одинаковый повтор terminal ack сверяется по сохранённому
  `claimTokenDigest + providerAttemptKey + terminalAckDigest`, идемпотентен
  только до `acknowledgeUntil`;
- конфликтующий terminal ack возвращает conflict;
- unknown/timeout provider outcome не становится обычным `FAILED` retry.

Ack после tenant suspend разрешён только как завершение/reconciliation уже
начатого exact provider attempt. Suspend/revision flip до marker даёт zero
provider calls. Committed marker является irrevocable bounded in-flight
authority: race после marker, но до network call может дать не более одного
exact provider call до `sendGrantExpiresAt`; drain обязан дождаться его либо
перевести в reconciliation. «Новый effect после suspend запрещён» означает,
что новая generation/marker после suspend не создаётся.

При terminal transition очищаются только raw active-lease поля. Generation,
captured revisions, token digest, effect/config digests, provider marker,
`acknowledgeUntil` и terminal ack digest сохраняются до retention для аудита.
Cryptographic duplicate ack проверяется только до `acknowledgeUntil`. После
retention evidence остаётся в immutable events, а очистка выполняется
отдельной audited policy.

### 5.4. Provider outcome taxonomy

| Наблюдение                                                          | Переход                              |
| ------------------------------------------------------------------- | ------------------------------------ |
| Provider однозначно подтвердил отправку с attempt/idempotency key   | `DISPATCHING → SENT`                 |
| Provider однозначно отверг запрос и гарантирует отсутствие effect   | `DISPATCHING → FAILED`               |
| Локальная ошибка доказанно произошла до committed provider marker  | `PROCESSING → READY/FAILED` по retry policy |
| Timeout, reset, ambiguous 5xx/response или crash после marker       | `DISPATCHING → RECONCILIATION_REQUIRED` |
| Повтор/lookup provider подтвердил ранее выполненный effect          | `RECONCILIATION_REQUIRED → SENT`     |
| Provider evidence доказало `NOT_APPLIED` после quarantine           | `RECONCILIATION_REQUIRED → READY`    |
| Permanent rejection подтверждён reconciliation                      | `RECONCILIATION_REQUIRED → FAILED`   |

Отсутствие ответа не считается `NOT_APPLIED`. Если provider не поддерживает
status lookup/idempotency, решение `NOT_APPLIED` требует manual evidence,
минимального quarantine window и two-person approval для bulk operation.

### 5.5. Transition и field-retention contract

| Переход | Кто | Обязательное условие | Retention |
| --- | --- | --- | --- |
| `READY → PROCESSING` | coordinator | fresh permit + row winner | Новая generation/token/revisions |
| `PROCESSING → READY` | release/reaper | marker отсутствует, lease истекла или effect не начинался | Generation и event сохраняются; active lease очищается |
| `PROCESSING → BLOCKED` | fresh revalidation | consent/identity/reward/config/Store deny | Digests/reason/event сохраняются |
| `PROCESSING → DISPATCHING` | attempt CAS | exact unexpired token и fresh snapshot | Marker/digests/ack window сохраняются |
| `DISPATCHING → SENT/FAILED` | finalize | exact token + definitive outcome | Terminal digest/marker сохраняются |
| `DISPATCHING → RECONCILIATION_REQUIRED` | reaper/finalize | explicit ambiguous outcome или истёк `acknowledgeUntil` | Вся attempt evidence сохраняется |
| `RECONCILIATION_REQUIRED → SENT/FAILED` | reconciler | documented provider evidence | Resolution event обязателен |
| `RECONCILIATION_REQUIRED → READY` | reconciler | доказанный `NOT_APPLIED`, quarantine, approval | Старый attempt архивируется в event; row marker очищается только dedicated retry |
| `FAILED/BLOCKED → READY` | retry workflow | причина устранена, active attempt отсутствует | Generation не сбрасывается; прежнее evidence в event |
| любой допустимый `→ CANCELED` | operator/domain cancel | active/ambiguous attempt отсутствует | Cancel event и причина обязательны |
| terminal → тот же terminal | duplicate ack | exact token/attempt/outcome digest до `acknowledgeUntil` | No-op; event dedupe |

Generic delivery update не имеет права выполнять reconciliation/retry или
очищать marker/digests.

`SENT/CANCELED` — row-terminal. `FAILED` — terminal outcome одной generation,
но row может вернуться в `READY` только dedicated retry после archival event;
migration никогда не переписывает legacy `FAILED` в `BLOCKED`, а ставит
`LEGACY_QUARANTINED` и сохраняет status/evidence.

### 5.6. Reaper и reconciliation

Отдельный leased reaper, доступный только принятому release protocol, регулярно
выбирает bounded batch через `FOR UPDATE SKIP LOCKED`:

- expired `PROCESSING` без marker: CAS в `READY` либо `FAILED` при exhaustion;
- `DISPATCHING` игнорирует `leaseExpiresAt` после marker и переходит в
  `RECONCILIATION_REQUIRED` только при explicit ambiguous finalize либо после
  `acknowledgeUntil`;
- active lease другого owner, свежий marker и terminal rows не изменяются.

Exact provider success ack из раннего `RECONCILIATION_REQUIRED` принимается до
`acknowledgeUntil` по тому же token/attempt/digest и создаёт resolution event.
После окна любой late result требует operator reconciliation.

Каждый переход и reaper run имеют audit/event, metrics и alert по возрасту
старейшей quarantine row. Один failed row не блокирует batch.

Reconciliation доступна только через отдельную capability
`reconcile_guest_game_deliveries`, с tenant и Store scope, reason,
provider evidence и actor. Tenant OWNER может работать только в собственной
сети; Platform Admin override отдельно аудируется. Bulk resolution требует
preview, bounded IDs, second approval и повторный zero-diff. Direct SQL,
generic `updateDelivery` и обычный service token не являются reconciliation
authority.

Reaper регистрируется отдельным job kind
`GUEST_GAME_DELIVERY_RECONCILIATION_REAPER`: сначала `EXTERNAL_DENY`, после
rehearsal/canary — `REVISION_FENCED`. Registry completeness test обновляется
атомарно с runtime; неизвестный/пропущенный kind остаётся fail-closed.
Он работает как maintenance-only accepted workload без provider credentials:
при suspended tenant может только освободить unattempted claim либо усилить
quarantine, но не создать marker, retry, send grant или provider effect.

## 6. Direct и bot paths

Оба пути используют один coordinator:

```text
direct:
  claim -> markProviderAttempt -> provider -> finalize

bot:
  pull/claim -> POST attempt -> provider -> POST ack/finalize
```

Bot API:

- pull возвращает только delivery ID, channel, masked metadata, expiry и
  opaque `claimToken`; raw recipient/message и другой sendable payload
  отсутствуют;
- новый attempt endpoint проверяет workload/config attestation, атомарно
  фиксирует provider marker и только в response возвращает fresh immutable
  recipient/message snapshot + one-time `sendGrant`;
- ack обязан вернуть тот же token;
- payload без exact attempt response/grant отправлять нельзя;
- pull/attempt/ack требуют versioned bot service identity и accepted release
  protocol;
- consumer не сохраняет payload для последующего unfenced resend;
- legacy payload без opaque token не принимается attempt/finalize endpoints и
  не может быть повторно выдан новым consumer.

Direct dispatcher и bot pull не имеют отдельных SQL-реализаций claim. Оба
вызывают один coordinator, используют одинаковые predicates, event types,
retry limits и provider outcome taxonomy.

## 7. Защита соседних mutations

Следующие пути обязаны стать claim-aware в том же срезе:

| Путь                              | Правило                                                        |
| --------------------------------- | -------------------------------------------------------------- |
| `prepareDeliveries`               | Не перезаписывает active/reconciliation claim                  |
| manual `updateDelivery`           | Не меняет `PROCESSING/DISPATCHING`; terminal conflict fail      |
| bonus-ledger delivery cancellation| CAS; active attempt только через reconciliation                |
| bot ack                           | Exact generation/owner/revisions; same terminal idempotent      |
| direct finalize                   | Exact generation/owner/revisions                               |
| retry                             | Только dedicated workflow; generation не сбрасывается          |
| retention/delete                  | Не удаляет active/reconciliation evidence                      |

Implementation call-site inventory для одного atomic slice:

- `apps/api/src/guest-gamification/guest-gamification.service.ts`:
  `deliveryStatuses` около строки 176, bot pull/ack, direct dispatcher,
  `prepareDeliveries` около 11281, `updateDelivery` около 11421,
  terminal/status mapper и fallback около 24200;
- `apps/api/src/guest-gamification/guest-gamification.controller.ts`: новые
  versioned pull/attempt/ack DTO/endpoints и capability checks;
- `apps/api/src/guest-gamification/guest-game-delivery-bot-consumer.ts` и CLI:
  token propagation, attempt-before-provider, exact finalize и redaction;
- новые typed delivery coordinator и reaper scheduler/services: один claim
  primitive, maintenance admission, accepted workload identity и metrics;
- API specs для dispatcher, consumer, controller, prepare/update races;
- `apps/api/src/stores/stores.service.ts` archive и Store
  enable/disable DTO/controller; соответствующий Platform/owner UI;
- `apps/api/src/auth/capabilities.ts`, API role/default/custom-role maps,
  `apps/web/src/lib/permissions.ts` и seed safety: новые lower_snake
  capabilities `reconcile_guest_game_deliveries` и
  `manage_store_background_execution`;
- `apps/web/src/lib/guest-gamification.ts` status union около строки 816;
- `apps/web/src/components/guest-gamification-panel.tsx` retry/sent/cancel
  actions около строки 6390: active/reconciliation states read-only,
  dedicated reconcile action отдельно gated.

Status labels, DTO validators, mappers, metrics и audit payload меняются в том
же PR; fallback неизвестного статуса в `READY` запрещён.

## 8. Migration `165 → 166` rehearsal

До добавления canonical migration:

1. сохранить immutable manifest первых `165` migrations с names/checksums;
2. сохранить уже полученный remote exact-SHA PASS populated `163 → 164` как
   исторический prerequisite migration `165`;
3. получить отдельный remote exact-SHA `CURRENT_165` PASS populated
   `164 → 165` и зафиксировать его как обязательный base gate migration `166`;
4. отвязать rehearsal `165` от предположения, что она всегда latest;
5. создать отдельный `tenant-delivery-claim-upgrade-smoke`.

Fixture:

- минимум два tenants `A/B`;
- Store `A1/A2/B1`, включая минимум один Store с ненулевой допустимой
  `executionRevision`;
- channels `TELEGRAM/MAX/MANUAL`;
- существующие `READY/BLOCKED/SENT/FAILED/CANCELED`;
- delivery events;
- same-tenant mismatch и отдельные intentionally invalid cross-tenant
  Store/reward failure databases;
- valid/invalid profile, guest и delivery-event tenant/reward bindings;
- nullable/matching/mismatched delivery↔reward Store combinations;
- consent/unsubscribe, expired/canceled reward и provider-config flips;
- expired unattempted, attempted ambiguous и terminal duplicate claims.

Acceptance:

- legacy rows сохранены, nullable claim state backfill корректен;
- migration `166` не включает ни один Store, не сбрасывает
  `backgroundExecutionEnabled` и сохраняет каждую существующую неотрицательную
  `executionRevision`, включая ненулевую fixture;
- pre-cutover evidence отдельно доказывает `backgroundExecutionEnabled=false`
  для всех Store; activation по exact IDs выполняется только отдельным audited
  cutover;
- provider delivery получает canonical Store; same-tenant mismatch
  блокируется с одним immutable event;
- cross-tenant Store/reward preflight даёт `SQLSTATE 55000`, не оставляет
  partial DDL/data/event и требует отдельной approved reconciliation;
- cross-tenant recipient/event и event↔delivery reward mismatch также дают
  `55000` без partial changes;
- legacy Store `SET NULL` отсутствует; simple+composite `RESTRICT` и
  archive-first behavior доказаны;
- hard delete Store с delivery history отклоняется без dangling/global rows;
- hard delete reward/delivery не каскадно стирает event evidence; dedicated
  retention удаляет его только в документированном порядке;
- parent unique, все FK/CHECK/trigger и раздельные partial indexes exact;
  `convalidated=true`;
- per-state nullability matrix и durable-event transition key CHECK
  отклоняют direct invalid DML;
- concurrent reward/delivery/recipient mutation использует единый lock order;
  deadlock retry допускается только до marker;
- 20 concurrent claimers выдают одну delivery одному owner;
- direct dispatcher и bot pull имеют одного winner;
- `SKIP LOCKED` распределяет несколько rows без дублей;
- expired unattempted claim повышает generation;
- generation `N` не finalize-ит generation `N+1`;
- crash после provider marker не reclaim-ится;
- tenant/store revision flip до attempt даёт zero provider calls;
- consent/unsubscribe, identity, reward eligibility/expiry/cancel,
  reward-Store и provider-config flip до attempt дают zero provider calls;
- bot pull не содержит sendable payload; только attested attempt response
  выдаёт fresh snapshot/grant exact accepted workload/config revision;
- claim/attempt/finalize/reaper/retry/reconcile вставляют ровно один event на
  transition; replay не дублирует event;
- expired `PROCESSING` без marker безопасно освобождается, а attempted/ambiguous
  row попадает в reconciliation и не resend-ится;
- concurrent `SENT/FAILED` ack имеет одного terminal winner;
- exact duplicate terminal ack идемпотентен после очистки active lease;
  conflicting/stale/expired/cross-scope token отклоняется;
- active/previous claim key rotation, revoke, log redaction и ack expiry
  проверены без token/PII leakage;
- registry exact-key test включает новый reaper kind, unknown/missing value
  остаётся denied;
- Store archive атомарно выключает background execution; enable API требует
  capability, exact revision и persisted GO;
- marker/suspend race доказывает: до marker zero calls, после marker не более
  одного bounded in-flight call с drain/reconciliation evidence;
- outcome taxonomy не классифицирует timeout/reset как обычный retry;
- migration lock timeout, late-DDL rollback и повторный deploy доказаны;
- source database не изменяется и disposable databases удаляются.

## 9. Rollout

1. Remote `CURRENT_164` evidence — `PASS` на SHA `37f8cc88...`, CI
   `30423839760`; это исторический prerequisite migration `165`, а не
   production-like `GO`.
2. До реализации `166` получить и сохранить отдельный remote exact-SHA
   `CURRENT_165` PASS populated `164 → 165`; pending до зелёного CI кандидата.
3. Независимо reviewed additive migration `166` и отдельный real PostgreSQL
   rehearsal `165 → 166` на exact candidate SHA.
4. Protected release manifest фиксирует accepted SHA,
   `deliveryProtocolVersion=1`, migration checksums и workload identities;
   startup/readiness нового API/worker/bot отклоняет иной contract.
5. До cutover развёрнут containment release с job-specific
   `DELIVERY_PROTOCOL_CUTOVER_DENY`, который проверяется **до**
   `ALLOWED_INTERNAL_LEGACY` и действует для `INTERNAL/PILOT/BETA/LIVE`.
   Dispatcher/pull/attempt переходят в `DENY_NEW_EFFECTS`, а exact finalize и
   принятый reaper — только в `MAINTENANCE_ONLY`; новые claims/markers
   прекращаются, выполняется bounded drain. Одна registry-классификация
   `EXTERNAL_DENY` для этого недостаточна.
6. Все legacy API/worker/bot процессы останавливаются; legacy routes
   удаляются из ingress. Bot service token ротируется, старый отзывается.
   Ранее выданные legacy payloads проходят полное expiry/quarantine; если
   нельзя доказать остановку consumer либо отозвать его provider credential,
   cutover запрещён.
7. Provider credentials и egress выдаются только новой workload identity.
   Старый release не может вызвать Telegram/MAX даже при ошибочном restart.
8. Apply `166` в staging, затем запуск только accepted release. Mixed old/new
   workers и unsafe rollback на старый binary запрещены; rollback выполняется
   новым release с outbound OFF либо rollback-forward.
9. `SHADOW` использует только synthetic deliveries или read-only comparison
   решений на snapshot. Он не claim-ит real queue, не меняет delivery/event и
   не вызывает provider. Canary — первый этап, где разрешена реальная
   mutation, и он ограничен одним channel/Store.
10. Race/reconciliation/kill-switch drill и доказательство, что old token,
   old route, old workload и legacy payload дают zero provider calls.
11. Только после acceptance отдельно перевести:
   - `GUEST_GAME_DELIVERY_DISPATCH`;
   - `GUEST_GAME_DELIVERY_BOT_PULL`;
   - `GUEST_GAME_DELIVERY_RECONCILIATION_REAPER`
   из `EXTERNAL_DENY` в `REVISION_FENCED`.

Остальные background job kinds остаются без изменений.

Production migration/cutover требует отдельного явного решения. Этот документ,
локальный PostgreSQL PASS и commit сами по себе не являются таким решением.

## 10. Что migration `166` не закрывает

- общий scheduler leader/heartbeat;
- обычный Langame sync lease;
- activity queue generation/revision;
- полный tenant suspend/drain receipt;
- shared Telegram update routing и durable `(bot, updateId)` dedupe;
- owner identity/outbox и activation;
- remote CI, backup/restore и production deployment.

Поэтому даже успешная migration `166` сама по себе не закрывает
`BETA-MT-008`, Gate 1MT или `SHARED BETA GO`.
