# Initial OWNER identity and external tenant activation

| Поле             | Значение                                                        |
| ---------------- | --------------------------------------------------------------- |
| Версия           | 1.15                                                            |
| Дата             | 30.07.2026                                                      |
| Статус           | local `CURRENT_174`; exact-SHA CI, delivery и release `NO-GO`   |
| Release decision | `NO-GO` для создания реального external tenant и owner invite   |
| Scope            | Первый OWNER нового tenant, email delivery, activation, suspend |

Этот документ задаёт обязательный контракт между provisioning, identity,
email delivery и execution control plane для первого внешнего клуба. Он
заменяет прежнее предположение, что provisioning может сразу создавать
`UserInvite`, запускать trial и возвращать one-time registration URL.

До operational acceptance всего контракта:

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
workflowLocator         immutable opaque workflow UUID
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
runtime DML. После migrations 169/170 текущий candidate allowlist содержит
пять identity RPC:

- `reserve_invite_v2`;
- `assert_invite_v1`;
- `assert_invite_locator_v1`;
- `transition_v2`;
- `release_v2`.

Обычная runtime role имеет нулевые effective table privileges на
`IdentityEmailClaim` и exact `EXECUTE` только на эти пять identity RPC плюс
две разрешённые guest-game RPC. Direct lock helper и worker event function
недоступны. Combined partial unique invariant запрещает одному
`(tenantId, subjectId)` одновременно быть `INVITE` и `USER`, сохраняя
отдельный pending `EMAIL_CHANGE`. Reserve повторно проверяет legacy
`User`/live `UserInvite` до replay decision. Все пять definer RPC имеют
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

Migration `20260729233000_identity_activation_locator` добавляет immutable
opaque UUID `workflowLocator` и sealed PII-free
`assert_invite_locator_v1(locator, tenant, subject, revision)`. Shell replay
теперь адресует reservation по persisted UUID без raw e-mail, затем функция
берёт canonical e-mail advisory lock и повторно проверяет exact claim под
`FOR UPDATE`. Runtime по-прежнему не имеет table/column `SELECT`; locator не
является authority и не заменяет persisted GO. Engineering checkpoint принят
на exact-head `8dfe219...` / CI `30493779099` (`run #47`), `3/3 PASS`;
independent review — `PASS` без P0/P1/P2. Подробный контракт:
[identity activation locator](./identity-activation-locator.md).

Исторические строки ещё требуют inventory/backfill. Historical
`CURRENT_171` реализовал dormant issue-by-locator/encrypted `HOLD` aggregate,
но не зарегистрировал его в application runtime и не разрешил отправку.
Последний remote-accepted `CURRENT_172` добавил signed non-consuming
admission provenance. Local candidate `CURRENT_174` уже реализует atomic
activation, finite trial, GO consume и единственный `HOLD→PENDING`, но
остаётся `LOCAL_ACCEPTED / EXACT_SHA_CI_PENDING / NOT_DEPLOYED`.
Production roots, production-like rehearsal, controlled delivery/SMTP,
admin route и verified mail ещё не приняты, поэтому identity workflow и
внешний доступ остаются `NO-GO`. Подробные checkpoints:
[identity invite writer boundary](./identity-invite-writer-boundary.md),
[signed admission provenance](./shared-beta-admission-provenance.md) и
[atomic activation](./activate-and-release-owner-invite.md).

### 3.2. Identity mail outbox

`IdentityMailOutbox` хранит только данные, необходимые для защищённой
доставки:

```text
id
tenantId
inviteId
template
status                  HOLD | PENDING | CLAIMED | RETRY | SENT | DEAD |
                        CANCELED | RECONCILIATION_REQUIRED
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

Целевой delivery worker обязан использовать `FOR UPDATE SKIP LOCKED`, lease и
CAS по `leaseVersion`; local `CURRENT_174` его ещё не реализует. SMTP должен
вызываться только после commit. Стабильный `Message-ID` является только
correlation evidence, а не provider idempotency. Timeout/crash после provider
attempt переводит запись в `RECONCILIATION_REQUIRED`/quarantine; blind
automatic resend запрещён до provider/operator reconciliation.

### 3.3. Execution fence

В `Tenant` реализован первый обязательный primitive:

```text
executionRevision
```

Следующие optional Tenant projection-поля остаются pending; local
`CURRENT_174` хранит immutable activation command/receipt в отдельных sealed
relations и не делает эти поля обязательными:

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

Service-level shell, writer boundary, PII-free locator replay и dormant
encrypted `HOLD` aggregate реализованы в historical accepted `CURRENT_171`.
Remote-accepted `CURRENT_172` добавил admission provenance, а local
`CURRENT_174` — atomic activation/trial/`HOLD→PENDING`. Оба admin route
остаются намеренно закрыты:

```text
503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING
```

Legacy initial-owner revoke route также закрыт:

```text
503 SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING
```

Для принятого historical `CURRENT_169` локальный disposable PostgreSQL
`16.13` подтвердил clean deploy `169/169`,
identity idempotency `100 = 1 CREATED + 99 ALREADY_RESERVED`, combined
`INVITE | USER` same-subject rejection, explicit revoke → release →
same-email reserve, shell integration `2/2` и 100-way cross-slug race
`50 winner responses + 50 IDENTITY_EMAIL_UNAVAILABLE`.
Предыдущий `CURRENT_168` exact-head
`3b8228dd278fae062c753bf4301e0339ba93738b` принят GitHub CI
[`30460154200`](https://github.com/boozik3412/leetplus/actions/runs/30460154200),
`3/3 PASS`, и независимым review без новых P0 только как historical
prerequisite. Engineering exact-head `CURRENT_169`
`f5d39fd89145c995c51e7005698327f5581a5cd8` принят GitHub CI
[`30467882578`](https://github.com/boozik3412/leetplus/actions/runs/30467882578)
(`run #37`), `3/3 PASS`, и independent review без новых P0/P1. Local и
remote engineering evidence не являются production-like admission или
разрешением вызвать route.

`CURRENT_170` engineering checkpoint дополнительно подтвердил populated upgrade
`169 → 170`, clean state `170/170`, immutable
`workflowLocator = initial subjectId`, PII-free locator receipt, exact seven
application RPC при zero effective `IdentityEmailClaim` table privileges,
shell integration `2/2` и fail-closed transactional rollback при любом legacy
subject не в exact lowercase trimmed UUID, включая uppercase/whitespace.
Exact-head `8dfe219...` / CI `30493779099` (`run #47`) принят,
`3/3 PASS`; independent review — `PASS` без P0/P1/P2, release artifact и
three-clone tooling пересобраны для migration 170.

Historical accepted `CURRENT_171` добавляет atomic hard-coded `NETWORK OWNER`
`UserInvite` hash, encrypted immutable `HOLD` outbox, claim transition,
idempotency command и PII-free audit/receipt. Issue RPC остаётся
`EXCLUDED_PENDING`, runtime allowlist — ровно семь, target/PUBLIC privileges
на sealed relations/columns отсутствуют. Локально прошли clean `171/171`,
populated `170 → 171`, hostile-default-ACL rollback/retry,
`1 CREATED + 99 REPLAYED + 0 deadlocks`, late-fault rollback и crypto
known-answer vector. Exact-head
`7fca785ac6c2d77bcbd3655985d668a45fca788a` принят GitHub CI
`30501299486` (`run #50`) — `3/3 PASS`; это historical prerequisite, а не
текущий schema target.

### 5.2. Activation

Local candidate `CURRENT_174` реализует database coordinator этой операции и
прошёл local PostgreSQL acceptance, но ожидает exact-SHA GitHub CI. HTTP route
ниже фиксирует целевой operator contract и не зарегистрирован для production;
существующие provisioning/revoke admin routes продолжают отвечать hard `503`.
Production roots, rehearsal, SMTP worker и фактическая выдача invite
отсутствуют.

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

Serializable transaction использует один глобальный lock order, совместимый с
accept/reissue/revoke:

```text
canonical authority/request preflight
  → request-scoped advisory lock и command replay lookup
  → bounded locator discovery
  → canonical e-mail advisory lock
  → exact IdentityEmailClaim row FOR UPDATE
  → Tenant row
  → admission/gate/profile rows в deterministic order
  → invite/outbox/command writes
```

Coordinator выполняет не более одного issue RPC в одной короткой transaction;
batch issue запрещён до отдельного изменения и теста lock protocol.

Порядок `Tenant → identity claim` запрещён: он инвертирует действующий
accept-path и создаёт риск deadlock.

1. без row lock проверяет форму actor authority, exact confirmation,
   `(tenantId, action, requestId)` и logical payload digest;
2. по locator находит reservation, берёт canonical e-mail advisory lock и
   exact claim row `FOR UPDATE`;
3. блокирует tenant, decision, gate и profile rows в постоянном порядке;
4. после всех locks повторно проверяет actor authority, shell provenance,
   request digest, claim revision, tenant state и exact
   release/environment/schema/profile/gate validity;
5. требует `SUSPENDED/PROVISIONING`, valid support owner и exact six-row
   current profile: read/write ON, outbound OFF;
6. фиксирует trial window от activation time;
7. вызывает dormant writer, который атомарно создаёт idempotency command,
   one-time invite hash и encrypted `HOLD` mail outbox; OWNER scope hard-coded
   как `NETWORK`;
8. переводит claim reservation → invite с persisted revision provenance;
9. CAS-переводит tenant в `ACTIVE/OWNER_INVITED`, увеличивает
   `executionRevision`, consumes decision, переводит только связанный outbox
   `HOLD→PENDING` и пишет PII-free audit receipt;
10. commit; SMTP и decrypt выполняются только после commit отдельным worker.

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
- отдельный `IDENTITY_MAIL_ENCRYPTION_KEY`: ровно 32 CSPRNG-байта в canonical
  unpadded base64url строке из 43 символов, без fallback/reuse;
- exact `IDENTITY_MAIL_ENCRYPTION_KEY_VERSION=v1`;
- stable lowercase `IDENTITY_MAIL_AAD_ENVIRONMENT` по шаблону
  `[a-z0-9][a-z0-9._-]{0,63}`, не выводимый из `NODE_ENV`;
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
Тот же fail-closed принцип применяется к identity-mail key: production и
isolated startup не принимают missing, malformed, non-canonical, reused key,
неподдерживаемую version или отсутствующий AAD environment. Само наличие этих
переменных не регистрирует mail service, не открывает route и не разрешает
outbound.

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
- migration 170: immutable opaque `workflowLocator`, partial unique
  `INVITE | USER` index и PII-free sealed locator assert; exact-head
  `8dfe219...` / CI `30493779099` и independent review приняты;
- migration 171 historical accepted checkpoint: atomic hard-coded
  `NETWORK OWNER` invite hash,
  encrypted immutable `HOLD` outbox, persisted claim transition, immutable
  idempotency command и PII-free audit/receipt; RPC dormant и
  `EXCLUDED_PENDING`; exact-head `7fca785...` / CI `30501299486`
  (`run #50`) — `3/3 PASS`;
- migration 172 — последний remote-accepted checkpoint: signed
  non-consuming admission provenance; exact-head `12d5741...` /
  CI `30509157338` (`run #53`) — `3/3 PASS`;
- migrations 173/174 — local candidate `CURRENT_174`: dormant enum expand,
  independent build/deployment provenance, instance-bound activation role и
  atomic activation с finite trial, GO consume и `HOLD→PENDING`; status
  `LOCAL_ACCEPTED / EXACT_SHA_CI_PENDING / NOT_DEPLOYED`;
- shell-only service: `PILOT/SUSPENDED/PROVISIONING`, inactive Store, six-row
  profile, HMAC audit, без User/UserInvite/token/trial/outbox;
- local PostgreSQL 16: historical `169/169` identity `1/99`,
  revoke→reserve и shell `2/2`; locator populated `169 → 170`; historical
  dormant checkpoint clean `171/171`, populated `170 → 171`; local current
  candidate clean `174/174`, populated `172 → 173 → 174`, hostile ACL,
  `1 ACTIVATED + 99 REPLAYED`, fault rollback и exact typed provenance
  replay;
- engineering exact-head `CURRENT_169`
  `f5d39fd89145c995c51e7005698327f5581a5cd8`, CI `30467882578`
  (`run #37`): `3/3 PASS`, independent review без новых P0/P1;
- previous `CURRENT_168` exact-head
  `3b8228dd278fae062c753bf4301e0339ba93738b`, CI `30460154200`,
  `3/3 PASS`, сохраняется как historical prerequisite.
- `BETA-IAM-004E` transport engineering checkpoint на неизменном `CURRENT_169`:
  fragment-only link, capture/scrub до session/preview, fixed POST-body
  BFF/API, streaming/route-scoped `4 KiB` limit, strict Origin/JSON/token,
  allowlisted preview и no-store. External generic invite и обе shared-beta
  admin route остаются fail-closed; INTERNAL `registrationUrl` residual,
  production acceptance остаётся pending. Implementation exact-head
  `f09383563bbcc22e11e0e67ca597360cf8996f4b` принят CI `30488598755`
  (`run #43`), `3/3 PASS`; independent review — `PASS` без actionable
  P0/P1/P2.

Следующие обязательные шаги:

1. Использовать принятые
   [`BETA-IAM-004B`](./identity-legacy-backfill.md) exact-head
   `d1162eed042893ec3b27ed823bdaddfa64c7e90f` / CI `30479020686`
   (`run #39`), `3/3 PASS`, local evidence и финальный independent security
   review как engineering prerequisites; item остаётся открытым до отдельного
   production-like inventory и будущего signed proposal/apply/rollback
   исторических `User`/`UserInvite` без provenance. Для уже реализованной
   [`DESIGN_PARTNER_IDENTITY_WRITER_ISOLATION_V1`](./design-partner-identity-writer-isolation.md)
   independent review принят без actionable P0/P1/P2; exact-head
   `f4224072f60507bd97f8e49440e3bda89ffe2aaa` / CI `30483184102`
   (`run #41`) — `3/3 PASS`, включая PostgreSQL 16 smoke. CLI/exported
   `provision` и `rotate-invite` fail-closed до manifest/Prisma/БД/token,
   local unit/boundary `23/23 PASS`.
2. Использовать принятый `MIGRATION_170_ACTIVATION_LOCATOR` exact-head и
   release-bound inventory; full-table/column-wide `IdentityEmailClaim`
   SELECT fallback остаётся запрещён.
3. Получить exact-SHA GitHub CI для local `CURRENT_174`; до этого не переводить
   `BETA-IAM-004I` в `ENGINEERING_ACCEPTED`. Historical `CURRENT_171` и
   remote-accepted `CURRENT_172` использовать только как prerequisites;
   dormant issue RPC, provider и routes не включать.
4. Отдельно утвердить finite trial duration, провести reviewed enrollment
   production build/deployment roots и production-like
   base-backup/promotion/rollback rehearsal. Пустые production registries
   сохраняют fail-closed.
5. Реализовать encrypted leased delivery worker с CAS/retry/reconciliation,
   production SMTP/TLS/sender/Message-ID contract и protected
   resend/reissue/revoke; только после этого отдельно открыть reviewed admin
   route. До этого обе admin route сохраняют `503`.
6. Принять production proxy/APM/logging/CSP/browser/mail-client evidence для
   реализованного fragment + fixed POST-body transport и удалить INTERNAL
   raw `registrationUrl` compatibility residual после готовности outbox.
7. Выполнить полный real PostgreSQL delivery/reissue/revoke/accept concurrency
   matrix, two-tenant tests и end-to-end verified mail acceptance.
8. Довести durable lease/effect fencing для оставшихся workers, guest и
   Telegram surfaces поверх реализованного `executionRevision`.
9. Провести production-like inventory/admission, upgrade/rollback/zero-diff,
   backup/restore и two-tenant rehearsal; только затем принимать отдельный
   launch GO, production deployment и owner invite.

External employee invites, self-service email change и owner transfer
остаются fail-closed до завершения initial OWNER flow и вводятся отдельными
срезами.
