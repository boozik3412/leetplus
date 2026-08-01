# Protected identity-mail tenant lock and drain v2

| Поле | Значение |
| --- | --- |
| Контракт | `PROTECTED_IDENTITY_MAIL_TENANT_LOCK_DRAIN_V2` |
| Статус | `REVIEWED_DESIGN_ONLY / NOT_CANONICAL / NOT_DEPLOYABLE` |
| Основание | `codex/open-beta-hardening`, commit `475e9be4726787db955d895d348af1fc5a7c2db3` |
| Schema baseline | canonical `CURRENT_179`; dormant candidate `CURRENT_180` |
| Дата | `01.08.2026` |

## 1. Решение и граница документа

Этот документ фиксирует точный future-контракт общей tenant-блокировки и
двухфазного drain для initial-owner identity mail. Он является условием
promotion dormant `CURRENT_180`, но сам ничего не продвигает и не разрешает.

Решение состоит из четырёх обязательных частей:

1. каждый producer, worker и enrollment coordinator первым берёт один и тот же
   transaction-scoped PostgreSQL advisory lock по `tenantId`;
2. worker v2 разделяет admission нового claim и settlement уже выданного lease;
3. `ACTIVE -> DRAINING` атомарно запрещает новые claims и новые decryptable
   payload, после чего bounded drain очищает secrets и завершает in-flight work;
4. `DRAINING -> ACTIVE|DISABLED` разрешён только exact replay сохранённой
   подписанной команды и только при одновременно истинных zero-secret и
   zero-inflight predicates.

Это design-only контракт. Здесь нет canonical migration, apply/rollback CLI,
runtime grant, production deploy, SMTP-вызова, tenant, роли, пользователя,
invite или tester email.

## 2. Проверенная текущая реализация

### 2.1. Producer paths

Единственная текущая запись нового encrypted outbox выполняется owner-only RPC
`identity_owner_invite_issue_hold_v1`:

- функция начинается в
  `packages/database/prisma/migrations/20260730010000_identity_owner_invite_hold_outbox/migration.sql:343`;
- сейчас она берёт request advisory lock на строке `434`, затем canonical-email
  lock и `IdentityEmailClaim` row lock;
- она создаёт `UserInvite`, immutable issue command и `IdentityMailOutbox` на
  строках `708`, `749` и `794`; outbox всегда создаётся как `HOLD` и содержит
  `secretCiphertext`.

Единственный текущий release `HOLD -> PENDING` находится внутри
`shared_beta_tenant_activate_v1`:

- coordinator начинается в
  `packages/database/prisma/migrations/20260730040000_shared_beta_runtime_release_activation/migration.sql:5133`;
- текущий lock является request-scoped, а не tenant-scoped (`:5246`);
- coordinator вызывает dormant issue RPC (`:5547`), повторно блокирует claim,
  invite и outbox (`:5564-5590`) и выполняет exact `HOLD -> PENDING`
  (`:5825-5834`).

Standalone release RPC отсутствует. Application code не имеет прямого доступа
к sealed outbox relations.

### 2.2. Worker v1 paths

Canonical worker boundary находится в
`packages/database/prisma/migrations/20260731020000_initial_owner_mail_delivery_boundary/migration.sql`:

- readiness: `identity_mail_delivery_worker_assert_v1` (`:1347`);
- claim: `identity_initial_owner_mail_claim_v1` (`:1460`);
- provider marker: `identity_initial_owner_mail_provider_mark_v1` (`:1635`);
- completion: `identity_initial_owner_mail_complete_v1` (`:1878`);
- reap: `identity_initial_owner_mail_reap_v1` (`:2237`);
- operator reconciliation: `identity_initial_owner_mail_reconcile_v1`
  (`:2724`).

Claim сначала вызывает readiness, который берёт enrollment `FOR SHARE`, а затем
выбирает outbox через `FOR UPDATE SKIP LOCKED` (`:1490-1497`, `:1501-1571`).
Reap имеет тот же enrollment-before-outbox порядок (`:2271-2279`,
`:2283-2401`).

Provider marker и complete делают обратное: сначала блокируют outbox
`FOR UPDATE`, затем вызывают readiness и пытаются получить enrollment
`FOR SHARE` (`:1679-1693` и `:1937-1951`). Это несовместимо с future apply,
который должен блокировать enrollment перед outbox, и создаёт цикл deadlock:

```text
drain:         enrollment FOR UPDATE -> waits for outbox
provider/ack:  outbox FOR UPDATE      -> waits for enrollment
```

Кроме того, readiness v1 принимает только `enabled=true`. Dormant candidate
проецирует `DRAINING` как `enabled=false`, поэтому после state flip v1 не может
детерминированно выполнить provider mark, complete или reap уже существующего
`CLAIMED`.

Application repository дополнительно pin-ит ровно пять v1 signatures в
`apps/api/src/identity-mail-worker/identity-mail-worker.repository.ts:109-114`.
Worker service правильно фиксирует provider boundary до SMTP send
(`apps/api/src/identity-mail-worker/identity-mail-worker.service.ts:213-233`)
и очищает claim buffer в `finally` (`:281`), но tenant drain authority в нём
отсутствует.

### 2.3. Dormant CURRENT180

Candidate
`packages/database/migration-candidates/20260801010000_identity_mail_tenant_enrollment_control_plane/migration.sql`
добавляет `state/stateRevision/activeCommandId` и event-chain foundation
(`:1047-1154`), но statement guards (`:1156-1230`) запрещают любую mutation.
Он не устанавливает lock helper, apply/finalize RPC или worker v2.

Read-only preflight сейчас считает только total/unmarked/marked `CLAIMED`
(`packages/database/scripts/identity-mail-tenant-enrollment-preflight-database.mjs:398-420`),
а `drainComplete` определяет как `claimedCount === 0`
(`packages/database/scripts/identity-mail-tenant-enrollment-preflight.mjs:991-995`).
Этого недостаточно: `HOLD/PENDING/RETRY` всё ещё обязаны содержать encrypted
secret.

## 3. Термины и данные barrier

`Secret-bearing row` в этом контракте означает строку, из которой штатный
worker с encryption authority может восстановить raw invite token. В текущей
схеме это `IdentityMailOutbox.secretCiphertext IS NOT NULL`.

Текущие constraints в
`20260731020000_initial_owner_mail_delivery_boundary/migration.sql:454-540`
дают следующую классификацию:

| Outbox state | Provider marker | `secretCiphertext` | Drain treatment |
| --- | --- | --- | --- |
| `HOLD` | отсутствует | non-null | terminal cancel + wipe |
| `PENDING` | отсутствует | non-null | terminal cancel + wipe |
| `RETRY` | отсутствует | non-null | terminal cancel + wipe; в drain не возвращать в retry |
| `CLAIMED` | отсутствует | non-null | bounded graceful settlement либо после lease expiry cancel/dead + wipe |
| `CLAIMED` | присутствует | null | дождаться ack или quarantine; никогда не retry/cancel как unsent |
| terminal/reconciliation | сохранён по state contract | null | не secret-bearing; evidence сохраняется |

`UserInvite.email`, `IdentityEmailClaim.emailCanonical`, `tokenHash`, issue
command и delivery digests остаются PII либо one-way correlation evidence. Они
не являются decryptable token secret и не входят в zero-secret predicate.
Их retention/revoke — отдельная policy, а не основание объявить drain
незавершённым.

Promotion inventory обязан fail closed, если новый catalog добавляет другой
tenant-scoped ciphertext/envelope/token payload, новую relation или новый
status, не классифицированный этим barrier. Простого списка известных enum
labels недостаточно.

## 4. Общий advisory-lock helper

Future candidate вводит ровно один owner-only helper:

```text
public.identity_mail_tenant_lock_v1(p_tenant_id text) -> text
```

Обязательный контракт helper:

- принимает только lower-case canonical UUID и возвращает этот же UUID;
- перед любым relation read/lock вычисляет один signed-`bigint` key через
  `pg_catalog.hashtextextended`;
- domain bytes: `leetplus:identity-mail-tenant:v1:` + canonical `tenantId`;
- seed: integer `180`;
- берёт blocking `pg_advisory_xact_lock`, не session lock и не try-lock;
- имеет `VOLATILE`, `PARALLEL UNSAFE`, pinned `search_path=pg_catalog`;
- owner-only, `PUBLIC EXECUTE` отозван, worker/apply roles не вызывают helper
  напрямую; они вызывают только reviewed SECURITY DEFINER coordinator RPC;
- metadata, `prosrc` digest, owner и ACL входят в exact catalog manifest.

64-bit hash collision не нарушает isolation: он может только избыточно
сериализовать два tenant. Key не сохраняется как authority и не переносится
между PostgreSQL clusters.

Lock является transaction-scoped: commit, rollback или потеря backend session
освобождают его автоматически. Bounded `statement_timeout` обязан быть armed
до вызова RPC: caller начинает explicit transaction, отдельной предыдущей
командой выполняет `SET LOCAL statement_timeout = ...`, устанавливает более
короткий driver deadline/cancellation и только затем вызывает один RPC.
Изменение `statement_timeout` уже внутри PL/pgSQL не ограничивает тот же внешний
SQL statement и не считается защитой. RPC до relation read устанавливает
bounded `lock_timeout` для последующих advisory/row locks и fail closed
проверяет требуемые transaction isolation/read-write/settings. Timeout либо
driver cancellation всегда завершается rollback/connection cleanup; ни один
path не продолжает работу после неуспешного lock acquisition.

## 5. Канонический порядок блокировок

Все identity-mail v2 producer, worker settlement, reaper, reconciliation и
enrollment coordinator соблюдают следующий внешний порядок:

```text
1. scalar canonicalization/shape validation; никаких SQL reads
2. tenant advisory lock
3. IdentityMailDeliveryTenantEnrollment(tenantId)
4. operation request advisory/command replay authority
5. tenant IdentityMailOutbox rows, ORDER BY id
6. linked UserInvite rows, ORDER BY id
7. linked Tenant row
8. canonical-email advisory lock
9. IdentityEmailClaim rows, ORDER BY emailCanonical
10. immutable command/event/audit inserts and CAS updates
```

Enrollment lock mode:

- signed begin/finalize/rollback: `FOR UPDATE`;
- producer gate, claim admission и settlement: `FOR SHARE`;
- отсутствие enrollment при producer/worker admission трактуется fail closed,
  а не как implicit `ACTIVE`.

Activation имеет дополнительный уже существующий provenance graph. После
tenant advisory и enrollment он блокирует release singleton, marker, build,
shell relations и admission decision в их documented order, затем входит в
mail-specific order выше. Новая реализация не должна вызывать старый nested
issue RPC, который самостоятельно начинает с request/email locks; нужен v2
producer path, уже находящийся под tenant lock. Одного изменения call graph
недостаточно: обе старые producer entrypoint должны быть атомарно выведены из
эксплуатации, как определено в §7.3.

Для create path строки outbox/invite ещё отсутствуют. Coordinator сохраняет
тот же логический порядок: после tenant/enrollment/request authority он
выполняет identity reservation и вставляет весь aggregate в одной транзакции;
новая строка не становится видна worker до commit. Любой replay существующего
aggregate блокирует outbox перед invite/tenant/claim.

Multi-row locks всегда имеют явный stable order. Drain barrier не использует
`SKIP LOCKED`: пропущенная строка могла бы дать ложный zero predicate. Внешний
SMTP/network call никогда не выполняется при удерживаемом DB lock или внутри
DB transaction.

## 6. Worker v2 RPC contract

Worker v1 нельзя `CREATE OR REPLACE` и repin-ить:

1. CURRENT179 и dormant CURRENT180 pin-ят exact v1 `prosrc`/signatures;
2. изменение lock order меняет security semantics, а не только release receipt;
3. provider-mark/complete v1 узнают tenant только после outbox row lock;
4. complete v1 не принимает authority digest;
5. readiness v1 запрещает settlement в `DRAINING`;
6. старый worker process не понимает state revision и lease-captured authority.

Future release создаёт новые v2 names/signatures, атомарно выдаёт worker v2
ровно пять operational RPC — assert, claim, provider-mark, complete и reap — и
отзывает v1 EXECUTE. `reconcile_v2` остаётся owner/operator-only; worker v2 не
получает на него `EXECUTE`. Worker v1 после schema promotion должен fail closed,
а не продолжить с новым migration head.

Минимальный v2 surface:

| RPC | Обязательные authority inputs | State rule |
| --- | --- | --- |
| `identity_mail_delivery_worker_assert_v2` | `tenantId`, `providerAuthorityDigest`; runtime attestation проверяется внутри boundary | readiness только `ACTIVE`; settlement receipt отдельно допускает exact active drain command |
| `identity_initial_owner_mail_claim_v2` | `tenantId`, lease owner/token digests, `providerAuthorityDigest` | только `ACTIVE`; сохраняет enrollment state/policy revision и authority digest в lease/event |
| `identity_initial_owner_mail_provider_mark_v2` | `tenantId`, outbox/lease CAS, provider attempt key, `providerAuthorityDigest`, message-id digest | `ACTIVE` либо pre-drain lease под exact previous authority |
| `identity_initial_owner_mail_complete_v2` | `tenantId`, outbox/lease CAS, `providerAuthorityDigest`, bounded outcome/receipt/ack digests | `ACTIVE` либо settlement pre-drain lease в `DRAINING` |
| `identity_initial_owner_mail_reap_v2` | `tenantId`, `providerAuthorityDigest`, actor digest, batch limit | `ACTIVE` использует retry policy; `DRAINING` использует previous policy и никогда не создаёт `RETRY` |
| `identity_initial_owner_mail_reconcile_v2` | `tenantId`, immutable attempt identity, signed/operator actor digest | terminal evidence only; не создаёт claim/send/retry |

Exact positional signatures и порядок authority arguments:

```text
identity_mail_delivery_worker_assert_v2(
  tenantId text, providerAuthorityDigest text
)
identity_initial_owner_mail_claim_v2(
  tenantId text, leaseOwnerDigest text, leaseTokenDigest text,
  providerAuthorityDigest text
)
identity_initial_owner_mail_provider_mark_v2(
  tenantId text, outboxId text, expectedLeaseVersion integer,
  leaseOwnerDigest text, leaseTokenDigest text, providerAttemptKey text,
  providerAuthorityDigest text, messageIdDigest text
)
identity_initial_owner_mail_complete_v2(
  tenantId text, outboxId text, expectedLeaseVersion integer,
  leaseOwnerDigest text, leaseTokenDigest text, providerAuthorityDigest text,
  outcomeCode text, providerReceiptDigest text, terminalAckDigest text
)
identity_initial_owner_mail_reap_v2(
  tenantId text, providerAuthorityDigest text, workerActorDigest text,
  batchLimit integer
)
identity_initial_owner_mail_reconcile_v2(
  tenantId text, outboxId text, expectedTransitionRevision bigint,
  resolutionCode text, evidenceDigest text, actorDigest text
)
```

Reconcile намеренно не принимает live provider authority: он читает immutable
attempt authority из outbox/event, не расшифровывает payload и не может вызвать
provider. Runtime config digest также не передаётся и не сохраняется в DB RPC.

Caller не выбирает `ACTIVE`/`DRAINING` boolean или строковый mode. Claim всегда
использует internal active-admission assertion. Provider-mark/complete/reap
используют internal settlement assertion, которая выводит допустимость из
outbox lease binding и exact `activeCommandId`; это исключает вызов claim через
более слабую drain-ветку.

`tenantId` является первым аргументом provider-mark, complete и reconcile. RPC
не имеет права читать или row-lock outbox, чтобы обнаружить tenant, до tenant
advisory lock. После lock outbox выбирается только по exact
`WHERE tenantId = p_tenant_id AND id = p_outbox_id`; mismatch/not-found
отклоняется. Unlocked locator read является запрещённым исключением из
канонического порядка.

Claim v2 сохраняет secret-free lease bindings как минимум в exact полях
`claimEnrollmentStateRevision`, `claimPolicyRevision` и
`claimProviderAuthorityDigest` плюс существующем lease CAS:

- enrollment `stateRevision` и `policyRevision` на момент claim;
- exact `providerAuthorityDigest`;
- lease version/owner/token digests и bounded expiry;
- outbox transition revision.

Provider marker и completion сверяют caller authority с lease-captured
authority, а не только с mutable current enrollment. В `DRAINING` они также
требуют, чтобы binding совпадал с `previousProviderAuthorityDigest` exact
`activeCommandId`. Новый target authority никогда не завершает старый lease.

### 6.1. Exact routine ownership и ACL matrix

Deploy-specific role names/OID ещё не enrolled, поэтому таблица использует
логические role classes. Future migration обязана заменить каждую role class
exact name/OID из подписанного release marker, закрепить OID в catalog manifest
и отклонить same-name recreated role. Database owner является отдельной
non-login identity; application, worker и coordinator credentials не могут
`SET ROLE` в owner. Activation marker уже связывает activation role, runtime
attestation связывает worker role; enrollment-coordinator и reconcile-operator
name/OID должны быть добавлены в независимый подписанный release authority до
любого grant.

| Surface | Owner | Security / path | Volatility | Единственный non-owner `EXECUTE` |
| --- | --- | --- | --- | --- |
| `identity_mail_tenant_lock_v1` | database owner | `SECURITY INVOKER`, `SET search_path = pg_catalog` | `VOLATILE`, `PARALLEL UNSAFE` | отсутствует; вызывается только из definer boundary |
| `identity_owner_invite_issue_hold_v2` | database owner | `SECURITY INVOKER`, `SET search_path = pg_catalog` | `VOLATILE`, `PARALLEL UNSAFE` | отсутствует; private producer primitive внутри reviewed definer coordinator |
| `shared_beta_tenant_activate_v2` | database owner | `SECURITY DEFINER`, `SET search_path = pg_catalog` | `VOLATILE`, `PARALLEL UNSAFE` | dedicated activation coordinator |
| `identity_mail_tenant_enrollment_begin_v2` | database owner | `SECURITY DEFINER`, `SET search_path = pg_catalog` | `VOLATILE`, `PARALLEL UNSAFE` | dedicated enrollment coordinator |
| `identity_mail_tenant_enrollment_resume_v2` | database owner | `SECURITY DEFINER`, `SET search_path = pg_catalog` | `VOLATILE`, `PARALLEL UNSAFE` | dedicated enrollment coordinator |
| `identity_mail_tenant_enrollment_finalize_v2` | database owner | `SECURITY DEFINER`, `SET search_path = pg_catalog` | `VOLATILE`, `PARALLEL UNSAFE` | dedicated enrollment coordinator |
| `identity_mail_tenant_enrollment_rollback_v2` | database owner | `SECURITY DEFINER`, `SET search_path = pg_catalog` | `VOLATILE`, `PARALLEL UNSAFE` | dedicated enrollment coordinator |
| пять operational worker v2 RPC из §6 | database owner | `SECURITY DEFINER`, `SET search_path = pg_catalog` | `VOLATILE`, `PARALLEL UNSAFE` | exact worker v2 role |
| `identity_initial_owner_mail_reconcile_v2` | database owner | `SECURITY DEFINER`, `SET search_path = pg_catalog` | `VOLATILE`, `PARALLEL UNSAFE` | dedicated operator-reconcile role |

Все строки таблицы используют `LANGUAGE plpgsql`, `NOT LEAKPROOF`,
`CALLED ON NULL INPUT` и не являются set-returning. Они имеют явный
`REVOKE ALL ... FROM PUBLIC`, zero grant option и exact `proacl`: кроме implicit
owner допускается только указанный grantee. Owner OID совпадает с exact
database-owner OID и owner sealed relations.
Application role не получает producer/apply/rollback RPC; worker не получает
producer, coordinator или reconcile; activation coordinator получает только
`shared_beta_tenant_activate_v2` и не получает прямой producer,
enrollment/worker/reconcile; enrollment coordinator не получает producer,
worker или reconcile. Private producer выполняется с owner authority только как
nested `SECURITY INVOKER` primitive из reviewed activation definer. Если в
будущем понадобится отдельный issue workflow, он требует нового signed
coordinator/role/ceremony, а не grant activation role. Ни один grantee не
получает прямой TABLE/COLUMN/SEQUENCE доступ к sealed relations.

Каждый `SECURITY DEFINER` body использует только schema-qualified objects, не
исполняет caller-controlled dynamic SQL и не принимает object name/regclass как
authority. Promotion inventory проверяет exact positional signature, owner
name/OID, `prosecdef`, `provolatile`, `proparallel`, `proconfig`, `prosrc` SHA,
role attributes/membership и отсутствие unexpected overload.

Migration не полагается на default function ACL: hostile owner default
privileges, включая `PUBLIC EXECUTE` и grant именованной bystander role,
создаются в отдельном fixture до deploy. После deploy explicit revoke и exact
grants обязаны дать ту же матрицу; проверка охватывает `acldefault`,
`pg_default_acl`, `aclexplode(COALESCE(proacl, acldefault(...)))`,
`has_function_privilege` через transitive membership, direct/PUBLIC grants,
grant option и повторный deploy. Дополнительный grant либо membership после
deploy блокирует readiness. Каждый dedicated grantee имеет только exact target
database `CONNECT`, schema `USAGE` и свои RPC: без `CREATE`, `TEMP`,
TABLE/COLUMN/SEQUENCE и чужих функций. Любая лишняя effective privilege
полностью откатывает release либо fail closed блокирует runtime readiness.

## 7. Producer gates

### 7.1. Issue encrypted HOLD

`identity_owner_invite_issue_hold_v2` и любой coordinator, который может
создать `secretCiphertext`, обязаны:

1. взять tenant lock;
2. заблокировать enrollment;
3. принять только exact `ACTIVE` enrollment и current provider authority;
4. затем выполнить request replay и identity reservation;
5. вставить один `HOLD` aggregate либо вернуть exact replay.

`ABSENT`, `DRAINING` и `DISABLED` запрещают новый secret. Первичное enrollment
выполняется до issue/activation. Legacy compatibility, позволяющая создавать
`HOLD` при absent enrollment, не входит в v2 contract и потребовала бы отдельной
подписанной migration/reissue ceremony.

### 7.2. Activation HOLD -> PENDING

`shared_beta_tenant_activate_v2` берёт тот же tenant lock до activation request
lock и release/shell rows. Перед dormant issue и повторно перед release он
требует exact `ACTIVE`, неизменные state/policy revisions и authority binding.

Если drain начинает ждать, activation целиком завершается раньше state flip.
Если drain получил lock первым, activation видит `DRAINING` и отклоняется без
issue command, invite, outbox, trial, admission consume или audit residue.
Нельзя создать `HOLD` в одной транзакции и отпустить его в `PENDING` после
незащищённого enrollment re-read.

### 7.3. Обязательное retirement legacy producers

Atomic v2 release обязан одновременно сделать некликабельными два текущих
SECURITY DEFINER entrypoint, которые обходят tenant lock/state gate:

```text
identity_owner_invite_issue_hold_v1(...)
shared_beta_tenant_activate_v1(...)
```

Простого `REVOKE EXECUTE FROM PUBLIC` недостаточно: owner функции сохраняет
implicit EXECUTE, а leaked/ошибочно используемое database-owner соединение
сможет вызвать v1 напрямую. Допустимы только два результата:

1. old signature удалена после доказанного отсутствия зависимостей; или
2. old signature атомарно заменена owner-only fail-closed stub, которая до
   любого relation read, advisory/row lock или DML выдаёт fixed SQLSTATE
   `55000 / LEGACY_IDENTITY_MAIL_PRODUCER_RETIRED`.

Ни route, ни worker, ни coordinator, ни operator runbook после promotion не
содержат ссылку на v1 producer. Release marker/catalog authority pin-ят stub
или отсутствие функции. Catalog inventory перечисляет все SECURITY DEFINER
routine, способные создать `IdentityMailOutbox.secretCiphertext` либо выполнить
`HOLD -> PENDING`, и доказывает, что callable surface состоит только из
reviewed v2 coordinator path. Worker v1 delivery RPC могут оставаться
byte-for-byte неизменными и fail closed на новом head; это исключение не
распространяется на legacy producer v1.

## 8. Crash-resumable state protocol

### 8.1. Begin drain

`ROTATE` и `DISABLE` проходят независимую signature/marker/DB/role/revision
проверку до mutation. В одной короткой SERIALIZABLE транзакции coordinator:

1. берёт tenant lock и enrollment `FOR UPDATE`;
2. проверяет exact `ACTIVE`, expected revisions и current configuration;
3. создаёт immutable command с identity
   `(tenantId, action, requestId, authorizationEnvelopeDigest)` и сохраняет
   previous/target authority, role, policy и final revision;
4. append-ит `DRAIN_STARTED` event;
5. CAS-переводит enrollment в `DRAINING`, `enabled=false`, записывает
   `activeCommandId`, drain revision/time и сохраняет previous authority;
6. commit-ит всё атомарно.

Command логически сохраняется до state flip, но обе записи находятся в одной
транзакции: crash до commit оставляет zero residue; crash после commit оставляет
самодостаточное `DRAINING`.

После committed `DRAINING`:

- новый claim и оба producer path немедленно запрещены;
- target authority ещё не действует;
- pre-drain lease может только завершиться через bounded settlement v2;
- новый либо ещё не accepted proposal, другой request id/action/digest и
  expired unaccepted envelope не создают новую authorization;
- timeline/root-at-now проверяются только при initial accept/begin. После
  atomic acceptance exact command replay может законно пережить 15-минутный
  envelope expiry, lease и acknowledge deadline;
- resume/drain/finalize аутентифицируют persisted `activeCommandId`, immutable
  command/receipt/digests, `signatureVerifiedAt = acceptedAt` и exact accepted
  marker/DB/role provenance. Они не вызывают pinned verifier с текущим wall
  clock. Если подпись криптографически перепроверяется, root/timeline
  оцениваются на recorded `signatureVerifiedAt`, а не на resume time;
- current catalog/release integrity, emergency suspend/kill switch и exact
  command-state CAS всё равно проверяются отдельно; expiry принятой подписи не
  превращается в обход этих controls.

### 8.2. Drain steps

Drain выполняется повторяемыми короткими транзакциями, каждая заново берёт
tenant lock и exact active command. Она не держит lock во время ожидания lease,
ack deadline или внешнего процесса.

Порядок одного шага:

1. settlement/reaper завершает доступные `CLAIMED`;
2. `HOLD/PENDING/RETRY` блокируются `ORDER BY id FOR UPDATE`, получают terminal
   drain-cancel event и атомарно очищают `secretCiphertext`;
3. expired unmarked `CLAIMED` становится `CANCELED` или `DEAD`, но не `RETRY`,
   очищает lease binding и ciphertext;
4. marked `CLAIMED` не объявляется unsent: до acknowledge deadline допускается
   exact completion; после deadline становится `RECONCILIATION_REQUIRED` с
   сохранёнными provider attempt/message/authority digests;
5. predicates перечитываются под тем же tenant lock.

Для `ROTATE` pending secret не rewrap-ится автоматически. Он terminally
cancelled; новый invite/payload после activation новой authority требует
отдельного authorized reissue. Это исключает dual-decrypt и hidden replay.

### 8.3. Finalize

Только exact command replay может финализировать:

```text
DRAINING -> ACTIVE    для ROTATE
DRAINING -> DISABLED  для DISABLE
```

Finalize в одной SERIALIZABLE транзакции берёт tenant lock/enrollment, проверяет
command identity, zero-secret, zero-inflight, append-ит terminal event и CAS:

- `ROTATE`: устанавливает только target role/authority/policy, очищает
  `activeCommandId`, включает `ACTIVE` и увеличивает monotonic revisions;
- `DISABLE`: сохраняет terminal evidence, очищает `activeCommandId`, оставляет
  `enabled=false` и устанавливает `DISABLED`;
- command/event/enrollment не удаляются и revision не уменьшается.

Crash до commit не меняет `DRAINING`. Crash после commit возвращает exact
terminal receipt при replay. Rollback является новой signed monotonic command,
а не удалением history и не восстановлением старой revision.

### 8.4. Relational rollback semantics

Pure Ed25519 verifier проверяет только подпись, форму `ROLLBACK` envelope и
non-self `rollbackOfCommandId`. Он не читает command ledger и поэтому не
доказывает, что команда действительно компенсирует предыдущую mutation.
Такое доказательство является обязательным P0-инвариантом будущего DB accept.

Под тем же tenant advisory lock и enrollment `FOR UPDATE` rollback coordinator
обязан:

1. заблокировать referenced command по exact `(tenantId, id)` и принять только
   terminal/current command с `intent=FORWARD`;
2. отклонить rollback-of-rollback, non-terminal command, command другого tenant
   и command, после которого current enrollment/configuration уже изменились;
3. доказать, что current state/configuration равны terminal target referenced
   forward command;
4. принять только точную compensating mapping:
   - forward `ENABLE` → rollback action `DISABLE`; `ENABLE` из `DISABLED`
     заранее допускается только без изменения configuration, а изменение
     выполняется отдельной последующей `ROTATE`;
   - forward `ROTATE` → rollback action `ROTATE` в exact original
     `previousConfiguration`;
   - forward `DISABLE` → rollback action `ENABLE` в exact original
     `previousConfiguration`;
5. сверить rollback `previousConfiguration` с current/original target,
   `targetConfiguration` с указанным inverse, а state/policy/final revisions —
   с новым monotonic transition;
6. разрешить не более одного accepted rollback на один forward command через
   partial unique invariant `(tenantId, rollbackOfCommandId) WHERE
   intent='ROLLBACK'` либо эквивалентную доказанную atomic RPC uniqueness;
7. создать новую immutable command/event/receipt и никогда не удалять либо
   переписывать original command, delivery или enrollment history.

Rollback forward `ENABLE` из `ABSENT` не удаляет enrollment row и не возвращает
revision к нулю: approved compensating terminal state — `DISABLED` с первой
configuration и сохранённой историей. Это lifecycle compensation, а не
структурное возвращение к отсутствующей строке. Для `ENABLE` из `DISABLED`
previous/target configuration обязаны быть byte-equivalent, поэтому последующий
`DISABLE` восстанавливает и исходный state, и configuration.
Текущий dormant candidate имеет только same-tenant FK и non-unique index, поэтому
этот relational contract пока не реализован и pure-verifier success не является
apply authority.

## 9. Exact barrier predicates

Predicates выполняются внутри finalize transaction после tenant lock и после
blocking lock всех matching outbox rows. Ни read-only preflight, ни snapshot до
lock не являются mutation authority.

Reference zero-secret predicate:

```sql
NOT EXISTS (
  SELECT 1
  FROM public."IdentityMailOutbox" AS outbox
  WHERE outbox."tenantId" = p_tenant_id
    AND outbox."secretCiphertext" IS NOT NULL
)
AND NOT EXISTS (
  SELECT 1
  FROM public."IdentityMailOutbox" AS outbox
  WHERE outbox."tenantId" = p_tenant_id
    AND outbox."status" IN ('HOLD', 'PENDING', 'RETRY')
)
```

Обе части обязательны. Первая доказывает отсутствие recoverable secret,
вторая fail closed при constraint/trigger drift, который ошибочно допустил бы
secret-bearing status с `NULL` payload.

Reference zero-inflight predicate:

```sql
NOT EXISTS (
  SELECT 1
  FROM public."IdentityMailOutbox" AS outbox
  WHERE outbox."tenantId" = p_tenant_id
    AND outbox."status" = 'CLAIMED'
)
```

Consistency predicate дополнительно требует:

```text
claimedCount = unmarkedClaimedCount + markedClaimedCount = 0
secretCiphertextCount = 0
HOLD = PENDING = RETRY = 0
all terminal/reconciliation rows have secretCiphertext = NULL
no unclassified secret-bearing catalog object/status exists
```

`RECONCILIATION_REQUIRED` не является in-flight lease: one-time provider
attempt уже durably marked, ciphertext удалён, acknowledge deadline завершён,
auto retry запрещён. Late operator reconciliation может сохранить `SENT` или
`DEAD` evidence после rotation/disable, но не использует old secret и не
создаёт provider call.

## 10. Race and crash matrix

| Race/crash | Обязательный результат |
| --- | --- |
| issue `HOLD` получил tenant lock первым | issue transaction полностью commit/rollback; drain видит и wipe-ит committed row |
| drain получил tenant lock до issue | issue видит `DRAINING`, не создаёт ни одной строки |
| activation получил lock первым | exact issue + `HOLD -> PENDING` commit раньше drain |
| drain получил lock первым | activation fail closed до issue/release/trial/admission mutation |
| claim получил lock первым | lease сохраняет ACTIVE state/authority revision; drain ждёт commit и затем учитывает `CLAIMED` |
| drain получил lock первым | claim возвращает non-ready/empty без ciphertext |
| provider mark против begin drain | оба начинают с tenant lock; pre-drain lease либо durably marked, либо DRAINING settlement recheck решает по lease deadline/authority |
| complete против finalize | finalize не может пройти при `CLAIMED`; completion terminally commit-ится раньше следующей проверки |
| reap против drain step | один tenant lock исключает double transition/event; drain-mode reap не создаёт `RETRY` |
| marked ack timeout | только `RECONCILIATION_REQUIRED`, provider evidence сохраняется, resend отсутствует |
| crash до begin-drain commit | command/event/state отсутствуют |
| crash после begin-drain commit | exact same command resume; другой command отвергается |
| crash после частичного drain batch | committed rows terminal/wiped; следующий batch idempotently продолжает |
| crash до finalize commit | состояние остаётся `DRAINING` |
| crash после finalize commit | replay возвращает exact terminal receipt без новой revision |
| backend/session loss при lock | PostgreSQL автоматически освобождает xact advisory lock |
| два разных tenant | разные 64-bit keys; не должны сериализоваться, кроме реально общих release/email resources |

## 11. Process-memory limitation

PostgreSQL может доказать отсутствие ciphertext и active DB lease, но не может
доказать, что raw token/message уже исчез из heap другого процесса. Worker
service получает ciphertext и открывает token после claim; buffer zeroization
в `finally` полезна, но не является database evidence.

Безопасность v2 опирается на следующие свойства:

- SMTP send разрешён только после committed provider marker;
- mark v2 требует live CAS, lease-captured authority и допустимый ACTIVE либо
  pre-drain binding;
- expired/reaped unmarked lease не может поздно создать marker, поэтому
  удерживаемый process token не даёт права отправки;
- marked lease блокирует finalize до completion либо ack-timeout quarantine;
- worker v2 не берёт новый claim в `DRAINING` и zeroizes ciphertext/token/message
  buffers на всех exit paths;
- runtime attestation и controlled worker shutdown/restart являются отдельным
  promotion evidence, но не подменяют DB predicates.

Остановка OS process не должна выполняться внутри DB transaction. Forced kill
не даёт права считать unmarked lease завершённым до DB expiry/reap.

## 12. Обязательные tests и evidence

### 12.1. Static/catalog

- exact helper name, domain bytes, seed `180`, volatility, parallel safety,
  owner, `search_path`, `prosrc` SHA и zero non-owner ACL;
- exact matrix §6.1 для helper, producer, activation, enrollment coordinators,
  пяти worker RPC и reconcile: owner name/OID, security mode, `proconfig`,
  language, volatility/parallel, leakproof/null/retset flags, positional
  signature, body SHA, grantee name/OID и zero unexpected
  overload/effective/default/PUBLIC/grant-option ACL;
- exact five-RPC worker v2 allowlist (assert/claim/provider-mark/complete/reap),
  zero `reconcile_v2` EXECUTE и zero v1 EXECUTE у worker v2;
- v1 worker `prosrc` остаётся byte-for-byte неизменным;
- обе legacy producer v1 signature отсутствуют либо являются exact
  pre-read/pre-lock/pre-DML `55000` stubs; database owner, coordinator,
  application и worker не имеют callable legacy secret-writer path;
- catalog-wide SECURITY DEFINER inventory не обнаруживает неизвестный writer
  `secretCiphertext` или `HOLD -> PENDING`;
- command/event/enrollment/outbox constraints и guards owner-only;
- catalog inventory обнаруживает новый secret-bearing column/relation/status;
- migration manifest, release marker, DB/role OID и runtime attestation exact;
- preflight показывает отдельные secret/ready/claimed/marked/unmarked counts и
  никогда не возвращает `authorization=true` или `canMutate=true`.

### 12.2. PostgreSQL concurrency

- `100` same-request begin/resume/finalize: одна state transition, остальные
  exact replay, zero duplicate events;
- begin принимает live envelope непосредственно до expiry; resume/drain/finalize
  exact persisted command проходят после envelope expiry и ack deadline без
  новой подписи, тогда как такой же ещё не accepted expired proposal
  отклоняется;
- drain против issue, activation, claim, provider mark, complete, reap и
  reconcile с holder/waiter transactions;
- unmarked claim до/после lease expiry и marked claim до/после ack deadline;
- `HOLD/PENDING/RETRY` wipe batches, включая crash между batches;
- same-tenant serialization и simultaneous two-tenant progress;
- stable `ORDER BY id`, no `SKIP LOCKED` barrier, bounded lock timeout;
- caller делает pre-RPC `SET LOCAL statement_timeout` отдельным statement,
  driver deadline отменяет waiter, а timeout/cancel rollback освобождает
  transaction/advisory lock и connection не возвращается в pool в aborted state;
- forced backend disconnect освобождает advisory lock;
- `pg_stat_database.deadlocks` delta `0`, raw `40P01/55P03` классифицированы,
  holder/waiter commit evidence сохранено;
- после finalize: exact zero-secret/zero-inflight, no provider resend, event
  chain непрерывна и revisions monotonic.

### 12.3. Worker/runtime

- worker v1 fail closed на promoted head и не имеет v2 grants;
- worker v2 не claim-ит и не создаёт provider marker в новом `DRAINING` work;
- pre-drain lease допускает только exact old-authority settlement;
- mark failure/expired CAS приводит к zero SMTP calls;
- committed marker всегда предшествует SMTP send;
- ambiguous/lost response идёт только в reconciliation;
- ciphertext/token/message buffers очищаются на success/error/stop paths;
- stop после claim завершает только уже выданный lease и не берёт следующий.

### 12.4. Rollback/negative matrix

- wrong signature/key, SHA, DB name/OID, role name/OID, marker, runtime
  attestation, authority, policy, expected state/revision и expired proposal;
- current-time re-verification не может wedged-ить уже accepted `DRAINING`;
  changed command/receipt/digest либо попытка rebound expired envelope
  отклоняются;
- same request с другим digest/action/tenant;
- новый request из `DRAINING`;
- finalize при каждом отдельном blocker: `HOLD`, `PENDING`, `RETRY`, unmarked
  `CLAIMED`, marked `CLAIMED`, non-null ciphertext и catalog drift;
- hostile TABLE/COLUMN/FUNCTION/TYPE/default/PUBLIC/direct ACL;
- fault injection до/после command, event, state CAS, wipe batch и finalize;
- whole-transaction rollback оставляет zero schema/business/role/grant residue;
- signed rollback создаёт новую monotonic command/event, никогда не удаляет
  delivery/enrollment history;
- rollback отклоняет missing/cross-tenant/non-terminal/non-current source,
  rollback-of-rollback, changed current configuration, wrong inverse
  action/configuration/revisions и второй rollback того же forward command;
- forward `ENABLE`, `ROTATE` и `DISABLE` имеют отдельные accepted compensating
  PostgreSQL fixtures, включая `ENABLE` из `ABSENT -> rollback DISABLED`;
- `ENABLE` из `DISABLED` с той же configuration проходит, а попытка одновременно
  изменить configuration отклоняется до command persistence.

### 12.5. Production-like rehearsal

Нужен disposable PostgreSQL 16 clone с exact CURRENT179 data shape, worker v2
role, two-tenant concurrency, process crash/restart, SMTP stub с controllable
ack/lost-response и полным zero-diff cleanup. Synthetic/unit-only evidence не
разрешает promotion.

## 13. Promotion blockers

Owner-only implementation checkpoint
[`CURRENT181`](./identity-mail-current181-worker-v2-candidate.md) материализует
helper, worker v2, reconcile, legacy stubs и disposable race/catalog evidence.
Таблица ниже относится к **единому deployable release**, а не отрицает этот
неканонический rehearsal.

| Severity | Blocker |
| --- | --- |
| `P0` | CURRENT181 helper/worker/reconcile rehearsal не объединён с runtime attestation и producer/operator paths в одном atomic release |
| `P0` | provider-mark/complete v1 сохраняют reverse outbox-before-enrollment order и не могут settlement в `DRAINING` |
| `P0` | issue `HOLD` и activation `HOLD -> PENDING` не используют общий tenant lock/state gate |
| `P0` | CURRENT181 ставит exact pre-read `55000` legacy stubs, но они ещё не входят в canonical release вместе с producer/activation v2 |
| `P0` | current preflight/future finalize не доказывают zero `HOLD/PENDING/RETRY`, zero ciphertext и zero `CLAIMED` одновременно |
| `P0` | signed apply/resume/finalize/rollback и exact same-command recovery отсутствуют |
| `P0` | pure verifier доказывает только signed rollback linkage; terminal/current source, exact compensating mapping и one-rollback relational invariant в DB отсутствуют |
| `P0` | CURRENT181 owner-only routine/catalog matrix принята; deploy-specific worker/coordinator/operator role name+OID, grants и hostile default-privilege matrix ещё отсутствуют |
| `P0` | enrollment-coordinator и reconcile-operator exact role name/OID ещё не связаны независимым signed release authority; deploy-specific grants не имеют authority |
| `P0` | persisted post-expiry resume/finalize semantics и exact accepted-command replay после lease/ack wait ещё не реализованы PostgreSQL fixture |
| `P1` | owner-only catalog и two-tenant race matrix CURRENT181 приняты; v1 runtime revoke/v2 grants и реальные ACTIVE/DRAINING fixtures ещё не приняты |
| `P1` | current cancel/revoke/reissue и IdentityEmailClaim transition paths не берут tenant advisory lock первыми; worker Outbox/UserInvite → email claim имеет достижимую инверсию с cancel/reissue email claim → UserInvite. Acceptance также должен войти в единый protocol и race matrix, хотя SENT-gate не позволяет считать его цикл доказанным. До любого runtime grant требуется cross-path zero-40P01 PostgreSQL matrix |
| `P1` | process-memory/runtime stop attestation и no-send-after-stale-marker tests не приняты |
| `P1` | local disposable CURRENT181 rehearsal и SQL-level security review приняты; production-like stop-v1/apply/grant/start-v2/rollback rehearsal отсутствует |
| `P2` | provider_mark_v2/complete_v2 после committed lost response не имеют event-backed exact replay: повтор fail-closed даёт stale 40001 и требует typed handoff в reconcile до runtime wiring |
| `P2` | operator observability не разделяет secret, ready, unmarked claim, marked claim и reconciliation counts |

Пока существует любой `P0` или `P1`, stacked dormant CURRENT180/CURRENT181
нельзя копировать в `prisma/migrations`, repin-ить worker или использовать для
external pilot.

## 14. Явные non-goals

Этот документ не:

- создаёт или изменяет canonical migration/candidate SQL;
- реализует helper, v2 RPC, worker, apply, finalize, resume или rollback;
- выдаёт role membership, relation/routine grant или production authority;
- меняет backlog/checklist/status других документов;
- создаёт tenant/store/user/invite/outbox/enrollment/command/event;
- читает, сохраняет или публикует raw email, token, ciphertext, DB/SMTP secret;
- выполняет Prisma deploy, database mutation, SMTP verification/send, worker
  restart, production rehearsal или tester onboarding;
- разрешает `SHARED BETA GO`, production deploy или внешний доступ.

Следующий engineering slice в принятой последовательности расширяет принятый
CURRENT181 rehearsal producer/activation v2, signed crash-resumable enrollment
coordinators, API adapter и runtime attestation, после чего формируется единый
canonical candidate. Частичный runtime repin worker по-прежнему запрещён.
Production apply/deploy и `SHARED BETA GO` остаются отдельной явно
авторизуемой границей.
