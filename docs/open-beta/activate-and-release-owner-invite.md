# ACTIVATE_AND_RELEASE_OWNER_INVITE_V1

Статус:
`ENGINEERING_ACCEPTED / NOT_DEPLOYED / EXTERNAL_PILOT_NO-GO`.

Задача `BETA-IAM-004I` завершает только атомарную database-границу первичной
активации внешнего tenant. Она не открывает Platform Admin route, не включает
SMTP worker, не создаёт тестера и не разрешает production cutover.

Для single-founder пилота release и rollback owner назначаются не application
ролью, а exact подписанным CURRENT202 evidence: все три значения `founderId`,
`releaseOwnerId`, `rollbackOwnerId` равны `founder-primary`. Это не активирует
данный writer. До принятого restored-copy rehearsal, runtime grants и отдельного
persisted `SHARED BETA GO` маршрут обязан оставаться закрытым.

## 1. Результат checkpoint

Один закрытый operator-only writer должен в одной PostgreSQL-транзакции:

1. доказать фактический текущий database/release context;
2. доказать фактическую полноту provisioned tenant shell;
3. связать оба доказательства с подписанным `TenantAdmissionDecision`;
4. вызвать dormant initial OWNER issue ровно один раз;
5. повторить все проверки после issue;
6. запустить finite shared-beta trial-окно точной подписанной длительности;
7. перевести tenant из
   `PILOT/SUSPENDED/PROVISIONING` в
   `PILOT/ACTIVE/OWNER_INVITED`;
8. CAS-потребить ровно один persisted GO;
9. перевести только связанный encrypted outbox из `HOLD` в `PENDING`;
10. сохранить immutable PII-free command/receipt и вернуть только безопасные
    идентификаторы и состояния.

Любая ошибка откатывает invite, claim transition, lifecycle, trial, decision,
outbox и audit целиком. До commit никакой внешний provider effect не
выполняется.

## 2. Независимые authority roots

Admission GO, CI build provenance и ops deployment provenance имеют разные
назначения и три разные pinned Ed25519 root registries:

- `SHARED_BETA_TENANT_ADMISSION` подписывает gate attestations и tenant GO;
- `SHARED_BETA_BUILD_PROVENANCE` подписывает immutable build attestation над
  release SHA, artifact, schema и policy;
- `SHARED_BETA_DEPLOYMENT_PROVENANCE` подписывает deployment marker над exact
  build attestation, environment, database challenge и выделенной
  activation-ролью.

Один key id/public key нельзя зарегистрировать более чем для одного purpose.
Environment variable, request body, database row или вызывающий application
process не могут добавлять root. Оба production build/deployment registry
остаются пустыми до отдельных key-enrollment ceremonies и поэтому fail-closed.

## 3. Фактический release context

Sealed `SharedBetaBuildProvenance` содержит:

- exact release SHA;
- immutable artifact content digest;
- release manifest digest;
- schema head и число успешно применённых миграций;
- digest ordered migration names/checksums;
- policy manifest digest;
- точные `trialPolicyVersion` и положительный `trialDurationSeconds` без
  database/application default;
- CI build reference/digest;
- точный подписанный payload, Ed25519 signature и build-key provenance.

Перед deployment DB создаёт одноразовый short-lived
`SharedBetaRuntimeReleaseChallenge`: 256-bit nonce, самостоятельно вычисленные
database identity/schema/migration-manifest digests и TTL. Raw database name,
OID и system identifier наружу не возвращаются. Challenge потребляется ровно
одним deployment marker.

Связанный sealed `SharedBetaDeploymentMarker` содержит:

- exact build provenance id/payload digest;
- consumed challenge id/digest;
- monotonic deployment generation и predecessor marker digest;
- environment;
- database identity digest;
- domain-separated actual-context digest;
- deployment-instance digest;
- exact dedicated activation database role name и OID;
- database challenge/reference digest;
- точный подписанный payload, Ed25519 signature и deployment-key provenance;
- bounded validity и monotonic revocation state.

Singleton `SharedBetaRuntimeReleaseState` хранит active marker/generation.
Одновременно может существовать не более одного active deployment marker.
Marker rotation и activation блокируют одну и ту же state row.
Build provenance и marker пишутся только owner-only persistence primitives
после standalone проверки двух разных pinned подписей. Deployment persistence
primitive самостоятельно получает:

```text
current_database()
pg_database.oid
pg_control_system().system_identifier
SharedBetaRuntimeInstanceAnchor.anchorNonce
pg_postmaster_start_time()
_prisma_migrations exact successful head/count
```

и отклоняет payload, который не совпадает с этой БД и связанным build.
`SharedBetaRuntimeInstanceAnchor` — owner-only `UNLOGGED` singleton. PostgreSQL
не переносит его содержимое в physical base backup и streaming standby, поэтому
promotion/restore получает пустой anchor и старый challenge/marker становится
невалидным. Boot timestamp дополнительно делает marker недействительным после
любого restart. После restore, promotion или restart оператор обязан создать
новый challenge, получить новую ops-подпись и повернуть deployment marker до
следующей tenant activation. Сырой anchor nonce наружу не возвращается.
Полный live VM/process-memory snapshot clone находится вне текущей threat
model: он способен сохранить одновременно disk state, `UNLOGGED` contents и
исходный postmaster boot epoch. До появления independently sourced external
host/instance attestation такие clones запрещены operational policy и не могут
использоваться как production-like rehearsal/evidence.
PostgreSQL DB owner остаётся верхней trusted boundary: он технически способен
заменить функции и строки, поэтому production evidence дополнительно требует
проверенного immutable artifact deployment и exact migration checksums.
Текущий `git pull → build → systemd restart` этому условию не соответствует.

Marker также связывает exact non-superuser `NOINHERIT` activation role name и
OID. Activation требует совпадения `session_user` и `pg_authid.oid`;
application runtime credentials не получают membership, table privileges или
function `EXECUTE`. Runtime/PUBLIC не получают table/column access к
provenance.

Database identity вычисляется без caller-supplied authority и связывается с
одноразовым challenge:

```text
SHA-256(
  "leetplus-shared-beta-database-identity-v2"
  || NUL
  || canonical database identity + unlogged instance anchor
     + postmaster boot epoch + challenge nonce
)
```

Actual context вычисляется отдельно:

```text
SHA-256(
  "leetplus-shared-beta-actual-context-v1"
  || NUL
  || canonical release/environment/artifact/schema/policy/database binding
)
```

Activation сравнивает не только aggregate digest, но и каждое typed поле
build/marker с подписанными полями GO. Оба provenance объекта перечитываются
под lock до issue и повторно до consume.

Idempotent persistence build provenance возвращает `REPLAYED` только при
exact-match всех нормализованных candidate-полей и сохранённой строки:
release/build timeline, artifact/release/migration/policy manifests,
schema/count, trial policy/duration, build reference, payload/digest,
signature algorithm/key/fingerprint/signature и validity window. Совпадения
одного payload или signature недостаточно.

## 4. Фактический tenant shell

Actual-shell evidence строится самой БД под row locks и включает:

- `Tenant`: exact id/slug, `PILOT/SUSPENDED/PROVISIONING`, пустое trial-окно,
  expected entitlement/execution revisions и bootstrap metadata;
- ровно один `Store` этого tenant: inactive, без background execution и без
  gamification execution;
- ровно один `OWNER` role override;
- exact sorted capability set
  `SHARED_BETA_INITIAL_OWNER_CAPABILITIES` и его отдельный digest;
- ровно шесть current-revision `TenantModuleEntitlement`:
  `GAMIFICATION`, `ASSORTMENT`, `STAFF`, `COMMUNICATIONS`, `USERS_ROLES`,
  `INTEGRATIONS`, для каждого `read/write=ON`, `outbound=OFF`;
- ровно один `SHARED_BETA_TENANT_SHELL_PROVISIONED` audit event;
- exact provisioning receipt и metadata/request digest;
- исходные PII-free locator, reservation subject и claim revision.

Raw email не входит ни в evidence, ни в ответ, ни в audit. Связь с mailbox
остаётся в sealed `IdentityEmailClaim` и HMAC fingerprint provisioning audit.

Shell digest:

```text
SHA-256(
  "leetplus-shared-beta-actual-shell-v1"
  || NUL
  || canonical locked shell evidence
)
```

Он обязан совпасть с подписанным `shellEvidenceDigest` до issue и повторно до
consume. Missing, extra, duplicate, stale или malformed row даёт один
fail-closed denial.

## 5. Immutable activation command

`SharedBetaTenantActivationCommand` — единственная idempotency authority
операции. В ней нет email, raw token, URL или ciphertext. Она связывает:

- activation request id/digest;
- tenant, decision, build provenance и deployment marker;
- expected и actual context/shell digests;
- workflow locator, reservation subject/revision;
- dormant issue request и exact command/invite/outbox/message ids;
- token hash и ciphertext digest;
- trial start/end;
- execution revision before/after;
- transaction id, созданный `pg_current_xact_id()`;
- immutable PII-free receipt.

Mutation guards Tenant, admission decision и outbox разрешают переход только
при наличии exact command той же транзакции. Committed command нельзя
использовать как разрешение в следующей транзакции.

Повтор операции с тем же request id и digest валидирует уже committed aggregate
и возвращает `REPLAYED`. Новые candidate token/ciphertext при replay не
читаются и не выпускаются.

## 6. Lock order

Обязательный порядок:

```text
activation request advisory lock
→ activation replay lookup
→ runtime release state singleton FOR UPDATE
→ current deployment marker FOR UPDATE
→ linked build provenance FOR UPDATE
→ Tenant FOR NO KEY UPDATE
→ Store ORDER BY id
→ OWNER override
→ provisioning audit/receipt
→ entitlements ORDER BY module
→ actual-context + actual-shell recomputation
→ dormant issue RPC exactly once
  → issue request advisory lock
  → locator discovery
  → canonical email advisory lock
  → IdentityEmailClaim FOR UPDATE
→ TenantAdmissionDecision FOR UPDATE
→ IdentityEmailClaim FOR UPDATE
→ immutable issue command
→ UserInvite FOR UPDATE
→ IdentityMailOutbox FOR UPDATE
→ gate links ORDER BY gateCode
→ gate attestations ORDER BY gateCode,id
→ entitlements ORDER BY module
→ marker and shell re-read/recompute
→ immutable activation command
→ Tenant CAS
→ admission decision CAS consume
→ exact outbox HOLD→PENDING
→ activation audit
```

Tenant использует `FOR NO KEY UPDATE`, чтобы оставаться совместимым с FK
`KEY SHARE`, который dormant issue получает после identity-claim lock.

## 7. Trial и invite

Версия trial-policy и положительный `trialDurationSeconds` обязаны
присутствовать в подписанном build provenance и policy manifest, digest
которого одновременно связан с build и tenant GO. Значения по умолчанию нет:
14 суток в backlog описывают длительность pilot cohort, а 30 суток в dormant
issue — только верхнюю границу жизни invite. Ни одно из них не становится
trial автоматически. Пока владелец продукта не утвердил точную длительность и
для неё не выпущен подписанный provenance, activation остаётся fail-closed.
Технический verifier принимает только целые значения от одного часа до
90 суток; это защитные границы формата, а не выбранная длительность продукта.

Invite должен истекать после activation time, не позже trial end и не позже
30-дневного ограничения dormant issue. Store после activation остаётся
inactive: OWNER сначала принимает invite, добавляет собственную интеграцию и
проходит отдельный onboarding/Store activation workflow.

## 8. ACL и runtime boundary

- Migration `173` только добавляет enum label `PENDING` и commit-ит его, не
  используя новое значение.
- Migration `174` заменяет HOLD-only constraint/guard и добавляет
  provenance/activation объекты. Это исключает PostgreSQL
  `unsafe use of new value` в одной транзакции.
- Все новые таблицы, колонки, enum и функции изначально owner-only.
- Hostile `ALTER DEFAULT PRIVILEGES` должен приводить migration к rollback.
- Application runtime allowlist остаётся ровно из семи ранее принятых RPC.
- Activation, marker persistence, evidence helpers и dormant issue не входят в
  runtime enrollment.
- Отдельный reviewed enrollment выдаёт только activation function exact
  dedicated non-superuser `NOINHERIT` role, указанной в deployment marker;
  никакого table access или membership application runtime не получает.
- Activation role должна иметь только `CONNECT` к target database, `USAGE` на
  `public` и exact coordinator `EXECUTE`. Запрещены `TEMP/CREATE`, другие
  databases/schemas, membership/ownership, role settings, relation/column/type/
  sequence authority, FDW/server/parameter/tablespace/large-object privileges,
  system-schema authority, direct system-object ACL и опасные `PUBLIC` ACL
  delta относительно `pg_init_privs`.
- До создания challenge оператор обязан провести отдельную type-ACL ceremony:
  инвентаризировать все defined enum/domain вне system schemas, отозвать их
  default `PUBLIC USAGE` и выдать explicit `USAGE` только тем штатным runtime
  ролям, которым тип действительно нужен. Migration не делает такой
  cluster-wide revoke автоматически. Activation fail-closed требует zero
  effective `USAGE` для выделенной роли на каждом таком enum/domain; новый
  тип или direct/PUBLIC grant немедленно блокирует create и replay.
- Любой idempotent replay до возврата исторического receipt повторно сверяет
  `session_user`, фактический role OID, marker-bound coordinator и глобальный
  ACL coordinator. Дополнительный `PUBLIC`/bystander grant и удалённая заново
  созданная роль с тем же именем отклоняются до replay response.
- Универсального `release outbox` RPC нет.
- Admin provision/revoke routes продолжают отвечать hard `503`.

## 9. Обязательное evidence

До engineering acceptance нужны:

- static contract tests;
- clean PostgreSQL 16 deploy и populated
  `CURRENT_172 → CURRENT_173 → CURRENT_174`;
- hostile TABLE/COLUMN/FUNCTION/TYPE ACL rollback/retry;
- admission/build/deployment root separation, build↔challenge↔deployment
  binding и physical-clone DB identity mismatch; test обязан доказать
  `UNLOGGED` persistence, fail-closed при отсутствующем anchor и boot-epoch
  binding. Реальный base-backup/promotion остаётся отдельным последующим
  production-like launch gate и не входит в bounded engineering acceptance;
- exact shell positive fixture и negative drift matrix;
- `100` concurrent activation replay: `1 ACTIVATED + 99 REPLAYED`;
- activation races против gate/decision revocation, profile/store/override/audit
  mutation и marker rotation;
- fault injection после issue, Tenant CAS, decision consume и outbox release с
  zero residue;
- exact one `HOLD→PENDING`, one consumed GO, one finite trial;
- runtime-role proof: seven allowed RPC, zero access к новым sealed objects;
- activation-role proof: exact role name/OID, only coordinator `EXECUTE`, no
  table/sequence privileges or membership и zero effective `USAGE` на всех
  user-defined enum/domain; hostile matrix включает direct/PUBLIC type grant,
  `pg_authid`, `pg_read_file`, system/PUBLIC ACL, FDW/server,
  `pg_parameter_acl`, TEMP, другие databases и role settings;
- PostgreSQL fixture с временным cluster-wide `PUBLIC CONNECT` revoke
  разрешён только на single-purpose `leetplus_ci` cluster, требует отдельного
  явного cluster confirmation и держит session advisory lock до exact
  LIFO-restore/zero-residue cleanup. Forced process/host termination всё ещё
  может сорвать in-process restore, поэтому shared/local tunnel cluster
  запрещён;
- Prisma validation, application tests, exact-SHA CI и independent security
  review.

### Engineering acceptance evidence — 30.07.2026

Implementation commit:
`2540088076997ef228cd68e42165e857575aad86`.

Final accepted evidence head:
`eb056a491bc7ad161addfd8c4d859606231f7f43`.

GitHub CI
[`30592173595`](https://github.com/boozik3412/leetplus/actions/runs/30592173595)
(`run #57`) — `3/3 PASS`; independent reviews — P0/P1/P2=0.

Rejected `30560278803` (`run #55`) не является evidence: PostgreSQL step
`Verify database connectivity and migration state` обнаружил, что прежний
baseline smoke не учитывал fail-closed activation guard `CURRENT_174`.
Rejected `30587233880` (`run #56`) также не является evidence: PostgreSQL
legacy identity inventory ожидал historical catalog `CURRENT_171/172`, а не
фактический `CURRENT_174`.

- migration 173 SHA-256:
  `8c613bcea1d31bd4422c3c14dfd64728ab8244a8e2a996df9c22f6698cc0f8ff`;
- migration 174 SHA-256:
  `df7b7869781b369ae01c9d46f0dbc78d394631f78f7a2bb9b595ee450d0203f7`;
- populated PostgreSQL 16 upgrade отдельно подтвердил exact
  `172/172 → 173/173 → 174/174`, неизменный snapshot tenant/store/OWNER
  override/six entitlements/identity aggregate/three gates/AVAILABLE decision,
  `HOLD/PENDING`, затем `releasedAt=NULL`;
- hostile default TABLE/FUNCTION ACL оставил `CURRENT_173` применённым и ровно
  одну unfinished migration 174 без runtime objects; exact revoke,
  resolve/retry и owner-only ACL завершились без остаточных БД, ролей или
  временных артефактов;
- activation PostgreSQL fixture прошёл create, intended replay,
  `1 ACTIVATED + 99 REPLAYED`, fault rollback, `PUBLIC`/bystander ACL drift и
  same-name recreated-role/new-OID rejection; отдельный typed replay regression
  сохранил original payload/digest/signature и отклонил конфликты
  release/schema/migration/trial/key/timeline/manifests, а direct/PUBLIC
  enum/domain `USAGE` заблокировал role assert и activation replay до exact
  ACL restore; после теста ACL источника восстановлен, advisory lock свободен,
  generated DB/roles отсутствуют;
- clean `174/174` deploy и runtime enrollment подтвердили ровно `7`
  application RPC, запрет `5` pending, `9` admission и `21` runtime-release
  functions, а также zero privileges на `12` sealed tables, `232` columns и
  `2` types;
- bounded `CURRENT_174` legacy identity inventory подтвердил `133` columns,
  из них `110` exact identity, `73` constraints, `38` indexes, `42` exact
  functions, `9` enum labels, `6` triggers и `44` RI triggers; missing,
  body/overload, catalog/ACL/authority drift отклоняются fail-closed, cleanup
  residue — `0/0/0/0`;
- static activation contracts: `10 PASS + 1` ожидаемый env skip; Prisma
  validate/generate, database/API typecheck, targeted ESLint, Prettier и
  focused API `38 suites / 645 tests` прошли;
- финальные независимые reviews не оставили findings P0/P1/P2.

Это evidence не включает production root enrollment, production-like
base-backup/promotion rehearsal, deploy, SMTP worker или фактическую отправку
invite.

## 10. Что остаётся после 004I

Даже после acceptance этого checkpoint внешний тест остаётся `NO-GO`, пока не
готовы:

- `BETA-IAM-004J / LEASED_INITIAL_OWNER_MAIL_DELIVERY_V1`:
  lease/CAS/retry/reconciliation identity mail worker;
- production SMTP/TLS/sender/Message-ID contract;
- verified delivery и protected resend/reissue/revoke;
- production-like inventory/admission на фактическом окружении;
- platform route/operator ceremony;
- verified CURRENT201 two-person ceremony либо ограниченный CURRENT202 founder
  evidence, reviewed CURRENT198 transition и production-origin registration;
- restored-copy apply/repeat/rollback/zero-diff rehearsal; одна подготовленная
  флешка не заменяет изолированный PostgreSQL target и production backup;
- explicit launch GO и stop/rollback procedure.
