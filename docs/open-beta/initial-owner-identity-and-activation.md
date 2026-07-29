# Initial OWNER identity and external tenant activation

| Поле             | Значение                                                        |
| ---------------- | --------------------------------------------------------------- |
| Версия           | 1.4                                                             |
| Дата             | 29.07.2026                                                      |
| Статус           | `CURRENT_169` writer-boundary candidate; activation ещё pending  |
| Release decision | `NO-GO` для создания реального external tenant и owner invite   |
| Scope            | Первый OWNER нового tenant, email delivery, activation, suspend |

Этот документ задаёт обязательный контракт между provisioning, identity,
email delivery и execution control plane для первого внешнего клуба. Он
заменяет прежнее предположение, что provisioning может сразу создавать
`UserInvite`, запускать trial и возвращать one-time registration URL.

До выполнения этого контракта:

- email будущего тестера не передаётся в provisioning endpoint;
- provisioning controller возвращает
  `503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING`, а legacy revoke
  route — `503 SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING`;
- `Tenant B`, `Store B1`, `User`, `UserInvite` и тестовый пароль не создаются;
- migration и candidate-код не накатываются в production;
- release decision остаётся `NO-GO`.

## 1. Неподвижные требования

1. Независимая сеть получает отдельный `Tenant`; первый клуб сети — отдельный
   `Store` внутри него.
2. OWNER получает `NETWORK` authority только внутри своего tenant.
3. Provisioning не создаёт рабочую login identity и не раскрывает raw secret.
4. Первый invite выпускается только после persisted `SHARED BETA GO` для
   точного release SHA, environment, schema и entitlement profile.
5. Trial начинается при activation, а не при создании пустого tenant shell.
6. Во всех шести initial module rows `read/write=ON`, `outbound=OFF`.
7. Activation запрещена при `outbound=ON` в любом модуле, независимо от
   onboarding state.
8. SMTP, token, URL и email не вызываются и не формируются внутри database
   transaction.
9. Suspend после commit не позволяет начать новый HTTP/background/provider
   effect.
10. Raw token, registration URL, email, ciphertext, API key и password не
    попадают в API response, audit, application/proxy logs или git.

## 2. Целевая state machine

```text
S0  PILOT / SUSPENDED / PROVISIONING
    tenant shell + inactive Store + six-row profile
    owner email reserved
    no UserInvite, no token, no trial consumption

G0  PILOT / SUSPENDED / PROVISIONING
    immutable, signed SHARED BETA GO references exact release/profile

A0  PILOT / ACTIVE / OWNER_INVITED
    trial starts now
    invite hash + encrypted identity-mail outbox created atomically

A1  PILOT / ACTIVE / ONBOARDING
    owner accepts invite; one User and one USER email claim exist

A2  PILOT / ACTIVE / READY
    credentials, mapping, preview sync and reconciliation accepted

A3  PILOT / ACTIVE / ACTIVE
    onboarding accepted; initial outbound remains OFF

ACTIVE/* -> SUSPENDED/*
    execution revision increments; new effects stop

SUSPENDED/* -> ACTIVE/*
    requires a new admission decision bound to fresh revisions

SUSPENDED/* -> ARCHIVED/OFFBOARDING
    dedicated retention/offboarding workflow
```

`OWNER_INVITED` означает, что реальный invite и его delivery outbox уже
существуют. Поэтому provisioning shell не может иметь этот status.

## 3. Persisted identity primitives

### 3.1. Canonical email claim

`IdentityEmailClaim` резервирует один глобальный canonical email:

```text
emailCanonical          primary key
claimType               INVITE | USER | EMAIL_CHANGE
tenantId
subjectId               invite/user/change id
revision
createdAt
updatedAt
```

Для первого pilot действует явное ограничение: один canonical email может
принадлежать только одному tenant. Поддержка membership одного человека в
нескольких сетях требует будущей модели `Identity + TenantMembership`.

Migration `20260729190000_identity_email_claim_foundation` создаёт claim и
единый advisory-lock namespace:

```text
identity-email:v1:<canonical-email>
```

Migration `20260729210000_identity_email_claim_write_boundary` ввела sealed
runtime DML. После successor migration 169 текущий exact allowlist содержит:

- `reserve_invite_v2`;
- `assert_invite_v1`;
- `transition_v2`;
- `release_v2`.

Обычная runtime role имеет нулевые effective table privileges на
`IdentityEmailClaim` и exact `EXECUTE` только на эти четыре identity RPC плюс
две разрешённые guest-game RPC. Direct lock helper и worker event function
недоступны. Combined partial unique invariant запрещает одному
`(tenantId, subjectId)` одновременно быть `INVITE` и `USER`, сохраняя
отдельный pending `EMAIL_CHANGE`. Reserve повторно проверяет legacy
`User`/live `UserInvite` до replay decision. Все четыре definer RPC имеют
exact `search_path=pg_catalog`, который проверяется по PostgreSQL `proconfig`.
При операции с двумя email locks они берутся в лексикографическом порядке.
Canonicalization и uniqueness case-insensitive.

Для будущего accept/reissue обязателен порядок
`assert (lock retained) → User/UserInvite write → transition → commit`.

Migration `20260729230000_identity_invite_writer_boundary` переводит основные
application writers на этот invariant:

- issue использует `reserve_v2 → assert → create → transition_v2`;
- same-email reissue создаёт новый immutable invite и явно отзывает старый;
- revoke сохраняет history и вызывает `release_v2`;
- accept атомарно переводит claim `INVITE → USER`;
- direct user creation и user/invite email change fail-closed;
- legacy строки без persisted revision fail-closed.

Исторические строки ещё требуют inventory/backfill, а activation/outbox/mail
delivery не реализованы, поэтому identity workflow остаётся `NO-GO`.
Подробный checkpoint:
[identity invite writer boundary](./identity-invite-writer-boundary.md).

### 3.2. Identity mail outbox

`IdentityMailOutbox` хранит только данные, необходимые для защищённой
доставки:

```text
id
tenantId
inviteId
template
status                  HOLD | PENDING | CLAIMED | RETRY | SENT | DEAD |
                        CANCELED
secretCiphertext        nullable AES-GCM ciphertext
keyVersion
messageId
attempts
availableAt
leaseOwner
leaseVersion
leaseExpiresAt
sentAt
createdAt
updatedAt
```

Raw 256-bit token:

- в `UserInvite` хранится только SHA-256 hash;
- временно хранится в outbox только как AES-GCM ciphertext;
- шифруется отдельным versioned `IDENTITY_MAIL_ENCRYPTION_KEY`;
- очищается после `SENT`, `DEAD` или `CANCELED`;
- никогда не возвращается Platform Admin или tenant actor.

Worker использует `FOR UPDATE SKIP LOCKED`, lease и CAS по `leaseVersion`.
SMTP вызывается после commit. Для at-least-once delivery используется
стабильный provider idempotency key/`Message-ID`.

### 3.3. Execution fence

В `Tenant` реализован первый обязательный primitive:

```text
executionRevision
```

Остальные activation/suspend receipt-поля ещё pending:

```text
lastAdmissionDecisionId
lastActivatedProfileRevision
lastActivatedAt
suspendedAt
```

`executionRevision` монотонно увеличивается при lifecycle, onboarding, trial и
profile changes. Любой claimed job несёт прочитанную revision и
перепроверяет её вместе с persisted policy непосредственно перед внешним
effect.

Migration `20260728150000_tenant_execution_revision_fence` backfill-ит
существующие tenants в revision `1`, оставляет новый shell в `0`, выполняет
ровно один trigger bump на policy mutation и запрещает direct revision write.
Report schedule и bonus-ledger claim уже сохраняют captured revision; SMTP и
Langame bonus write повторно проверяют permit перед provider call. Общий
durable lease для delivery/Langame sync и strict two-phase suspend/drain ещё
не реализованы, поэтому initial outbound остаётся `OFF`.

## 4. Release gates и admission decision

Activation не принимает недоказуемый флаг `gatePassed=true`. Она ссылается на
persisted immutable records:

```text
ReleaseGateAttestation
  gateCode
  releaseSha
  environment
  artifactDigest
  schemaHead
  policyManifestDigest
  provenanceKeyVersion
  signature
  passedAt
  validUntil
  revokedAt

TenantAdmissionDecision
  tenantId
  decision = GO
  releaseSha
  environment
  entitlementProfileRevision
  expectedExecutionRevision
  profileDigest
  gateSetVersion
  approvedBy
  approvedAt
  validUntil
  consumedAt

TenantAdmissionDecisionGate
  decisionId
  gateCode
  attestationId
```

Минимальные gates:

- `MODULE_POLICY_ENFORCED`;
- `EMAIL_INVITE_WORKFLOW_VERIFIED`;
- `POSTGRESQL_RELEASE_REHEARSAL_VERIFIED`.

Отзыв использованного gate для active tenant выполняется под тем же
tenant-scoped lock и инициирует suspend.

## 5. Команды

### 5.1. Shell provisioning

```http
POST /admin/shared-beta/tenants/provision
```

Serializable transaction:

1. проверяет fresh active Platform Admin, request replay/digest и authority;
2. берёт tenant/email advisory locks;
3. создаёт `PILOT/SUSPENDED/PROVISIONING` tenant;
4. создаёт inactive Store и OWNER role override;
5. создаёт ровно шесть rows revision 1 с
   `read/write=ON + outbound=OFF`;
6. создаёт `INVITE` email reservation без `UserInvite` и token;
7. пишет audit без raw email: только HMAC fingerprint;
8. возвращает несекретный shell snapshot.

Provisioning не запускает trial и не создаёт mail outbox.

Service-level shell candidate и writer boundary реализованы на `CURRENT_169`,
но route остаётся
намеренно закрыт:

```text
503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING
```

Legacy initial-owner revoke route также закрыт:

```text
503 SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING
```

Локальный disposable PostgreSQL `16.13` подтвердил clean deploy `169/169`,
identity idempotency `100 = 1 CREATED + 99 ALREADY_RESERVED`, combined
`INVITE | USER` same-subject rejection, explicit revoke → release →
same-email reserve, shell integration `2/2` и 100-way cross-slug race
`50 winner responses + 50 IDENTITY_EMAIL_UNAVAILABLE`.
Предыдущий `CURRENT_168` exact-head
`3b8228dd278fae062c753bf4301e0339ba93738b` принят GitHub CI
[`30460154200`](https://github.com/boozik3412/leetplus/actions/runs/30460154200),
`3/3 PASS`, и независимым review без новых P0; exact-head CI/review
`CURRENT_169` ещё pending. Local и remote engineering
evidence не являются production-like admission или разрешением вызвать route.

### 5.2. Activation

```http
POST /admin/shared-beta/tenants/:tenantId/activate
```

Request:

```json
{
  "requestId": "stable-id",
  "admissionDecisionId": "persisted-decision-id",
  "expectedExecutionRevision": 3,
  "expectedEntitlementProfileRevision": 2,
  "confirmation": "ACTIVATE tenant-slug",
  "reason": "Approved first external pilot",
  "supportTicket": "optional"
}
```

Serializable transaction:

1. проверяет actor, replay/digest, exact confirmation и tenant lock;
2. блокирует tenant, decision и gate rows в постоянном порядке;
3. проверяет exact release/environment/schema/profile/gate validity;
4. требует `SUSPENDED/PROVISIONING`, valid support owner и email claim;
5. требует exact six-row current profile, у всех read/write ON и outbound OFF;
6. фиксирует trial window от activation time;
7. создаёт one-time invite hash и encrypted `PENDING` mail outbox;
8. CAS-переводит tenant в `ACTIVE/OWNER_INVITED`, увеличивает
   `executionRevision`;
9. consumes decision и пишет audit receipt;
10. commit.

Response не содержит email/token/URL/ciphertext:

```json
{
  "ok": true,
  "replayed": false,
  "tenant": {
    "status": "ACTIVE",
    "onboardingStatus": "OWNER_INVITED",
    "executionRevision": 4
  },
  "ownerInvite": {
    "id": "invite-id",
    "deliveryStatus": "PENDING"
  }
}
```

### 5.3. Invite transport и acceptance

- письмо использует `register#invite=<token>`;
- frontend немедленно забирает fragment и очищает browser URL через
  `history.replaceState`;
- token передаётся API только в POST body;
- token не используется в query или URL path;
- acceptance выполняется под email/tenant locks;
- один из параллельных accept atomically переводит claim
  `INVITE -> USER`, создаёт одного User и один audit event;
- acceptance не подменяет независимую mailbox verification: доказательством
  владения является verified delivery path, а не ручная передача URL.

### 5.4. Reissue и revoke

Reissue:

1. отзывает предыдущий invite;
2. отменяет pending/claimed outbox по CAS;
3. выпускает новый hash/ciphertext/message id;
4. переносит email claim revision;
5. делает старый token недействительным;
6. не возвращает raw secret.

Revoke отменяет invite/outbox и освобождает claim только в допустимом state.
Все команды idempotent по `(tenantId, action, requestId)` и payload digest.

### 5.5. Emergency suspend

```http
POST /admin/shared-beta/tenants/:tenantId/suspend
```

Emergency suspend не зависит от stale expected revision или release gate.
Под tenant lock он:

1. ставит `SUSPENDED`;
2. увеличивает `executionRevision`;
3. отзывает unused invites и отменяет unsent identity outbox;
4. создаёт `TENANT_EXECUTION_INVALIDATED`;
5. пишет audit;
6. commit.

После commit не начинается новый effect. Уже начатый provider request
переходит в bounded drain или reconciliation; физически отозвать отправленный
HTTP request невозможно.

## 6. Fail-closed runtime configuration

Production startup обязан завершаться ошибкой, если отсутствуют или
невалидны:

- HTTPS `WEB_URL`;
- SMTP host/port/from;
- обязательный TLS/verification mode;
- `IDENTITY_MAIL_ENCRYPTION_KEY` и active key version;
- отдельный сильный `IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY` и его active
  version;
- token HMAC/hash version;
- release SHA/environment/schema identity;
- mail worker kill switch и lease settings.

`localhost:1025`, placeholder sender и implicit non-TLS не являются
production defaults.

Fingerprint HMAC startup-validation candidate уже реализован: требуется
отдельный production secret, запрещён reuse и принимается только key version
`v1`; CI environment contract обновлён. До deploy остаётся операционно
создать, защищённо установить и аттестовать отдельное production-значение.

Public login/invite endpoints получают rate limit и progressive backoff.
Login policy по `emailVerifiedAt` фиксируется явно; неявный обход запрещён.

## 7. Обязательная test matrix

Unit/API:

- outbound ON в любом из шести modules блокирует activation из любого
  reactivation state;
- missing/stale/revoked/wrong-SHA gate блокирует activation;
- response/log/audit snapshots не содержат email, token, URL или ciphertext;
- public invite transport не содержит token в path/query;
- resend/reissue/revoke имеют stable replay contract.

PostgreSQL 16:

- 100 concurrent provisions/issues одного canonical email в двух tenants
  создают один claim;
- 100 concurrent accepts создают одного User;
- accept против revoke/reissue имеет ровно одно terminal state;
- case-variant collision;
- activation против suspend/profile replacement/gate revocation;
- lease recovery после worker crash;
- SMTP success и crash до `SENT`;
- suspend между claim и provider send блокирует effect;
- restart worker не снимает persisted fence;
- migration, rollback и zero-diff smoke.

Two-tenant:

- `Tenant A/Store A1..A4` остаётся отдельным от `Tenant B/Store B1`;
- owner B не видит users, roles, credentials, jobs или data tenant A;
- shared all-tenant workers пропускают suspended/outbound-off tenant;
- один denied tenant не блокирует обработку другого.

## 8. Последовательность реализации

Завершённый candidate foundation:

- migration 167: canonical claim и единый lock namespace;
- migration 168: initial sealed reserve/assert/transition/release boundary;
- migration 169: persisted provenance/revocation и sealed runtime
  issue/reissue/revoke/accept candidate;
- shell-only service: `PILOT/SUSPENDED/PROVISIONING`, inactive Store, six-row
  profile, HMAC audit, без User/UserInvite/token/trial/outbox;
- local PostgreSQL `16.13`: `169/169`, identity `1/99`, revoke→reserve,
  shell `2/2`;
- previous `CURRENT_168` exact-head
  `3b8228dd278fae062c753bf4301e0339ba93738b`, CI `30460154200`:
  `3/3 PASS`; `CURRENT_169` exact-head evidence pending.

Следующие обязательные шаги:

1. Выполнить privacy-safe inventory/admitted backfill исторических
   `User`/`UserInvite` без provenance, изолировать design-partner CLI и
   подтвердить отсутствие direct application runtime table DML.
2. Спроектировать activation locator без хранения и раскрытия raw email;
   lookup и повторная проверка claim должны выполняться fail-closed под lock.
3. Добавить encrypted identity mail outbox и fail-closed mail config.
4. Реализовать release-gate attestations и tenant admission decision.
5. Реализовать initial OWNER activation, trial start, encrypted
   issue/reissue/resend delivery и emergency suspend поверх уже sealed
   application revoke/accept state machine; оба admin route до этого
   сохраняют `503`.
6. Перевести invite transport на fragment + POST body.
7. Выполнить полный real PostgreSQL concurrency matrix и two-tenant tests.
8. Довести durable lease/effect fencing для оставшихся workers, guest и
   Telegram surfaces поверх реализованного `executionRevision`.
9. Провести production-like upgrade/rollback/zero-diff, backup/restore и
    two-tenant rehearsal; только затем принимать отдельные persisted GO,
    production deployment и owner invite.

External employee invites, self-service email change и owner transfer
остаются fail-closed до завершения initial OWNER flow и вводятся отдельными
срезами.
