# Identity-mail stacked CURRENT181 worker v2 candidate

| Поле | Значение |
| --- | --- |
| Контракт | `IDENTITY_MAIL_CURRENT181_WORKER_V2_CANDIDATE_BOUNDARY_V1` |
| Статус | `SHA_PINNED / DISPOSABLE_REHEARSAL_PASSED / NOT_CANONICAL / NOT_DEPLOYABLE` |
| Audit baseline | `8afe7969ca95fb45e427451dfaec67ad274c0f35` |
| Implementation evidence | `7fb3cf966d5c612f0f2504f4545151ef3edb8ac9`; GitHub Actions [`30720288891`](https://github.com/boozik3412/leetplus/actions/runs/30720288891) (`run #79`) — `3/3 PASS` |
| Canonical schema | `CURRENT_179 / 20260731120000_identity_mail_delivery_release_head` |
| Неканонический prerequisite | `CURRENT_180 / 20260801010000_identity_mail_tenant_enrollment_control_plane` |
| CURRENT181 candidate | `20260801020000_identity_mail_tenant_lock_drain_worker_v2` |
| SQL SHA-256 | `c923d26d77fbb268fccc03d6eff0539a75c2644059d7f7ffc2493491c88f69ac` |
| Дата | `02.08.2026` |

> Successor note, 02.08.2026: подтверждённая ниже P1 lock inversion
> устранена на CURRENT179-compatible application/current-worker boundary и в
> dormant CURRENT182 claim candidate. Для outbox-only current v1
> mark/complete это означает validated process-local `CLAIMED` binding, а не
> DB-enforced v2 proof после restart. CURRENT183 дополнительно переводит
> caller/helper на freshness-safe `READ COMMITTED`, добавляет dormant exact-five
> v2 adapter и disposable diagnostic non-empty
> `ACTIVE|DRAINING × HOLD|PENDING` matrix. CURRENT181 repinned после исправления
> PostgreSQL special forms; signed coordinator, production runtime grant/attestation и P2
> lost-response promotion gates не закрыты. Текущий статус зафиксирован в
> [tenant-first claim protocol](./identity-mail-current182-tenant-first-claim-protocol.md)
> и [CURRENT183 freshness](./identity-mail-current183-worker-v2-freshness.md).

## 1. Решение

`CURRENT181` — следующий **stacked, неканонический** engineering candidate
поверх exact dormant `CURRENT180`. В working tree находятся `candidate.json`
и `migration.sql` в
`packages/database/migration-candidates/20260801020000_identity_mail_tenant_lock_drain_worker_v2`.
Metadata связывает ordinal `181` с exact predecessor `CURRENT180`, имеет
`authorization=false`, `canMutate=false`, `status=NOT_DEPLOYABLE` и pin-ит
exact SHA-256 SQL bytes. Static gate и disposable PostgreSQL race/rollback
rehearsal приняты. Найденная исходным independent review P1-инверсия
UserInvite ↔ IdentityEmailClaim закрыта в CURRENT179-compatible runtime и
CURRENT182; cross-path и CURRENT183 freshness matrices приняты в CI `#79`.
Открытый P2 — отсутствие exact event-backed replay у
provider-mark/complete после committed lost response. Поэтому candidate
остаётся строго dormant; наличие и pinning SQL не разрешают
объявлять `181/181` фактическим состоянием какой-либо общей или
production-базы.

Текущая граница CURRENT181 — dormant PostgreSQL worker v2 rehearsal без
runtime grant, без подключения standalone CLI и без SMTP. Candidate добавляет
общий tenant advisory-lock helper, пять operational worker v2 RPC, отдельный
owner-only reconcile с будущей operator boundary только в deployable release,
claim authority evidence, tenant-leading indexes и `ACTIVE/DRAINING`
settlement. Оба legacy producer v1 заменяются
немедленными pre-read `55000` stubs. Ни одна новая функция не получает
non-owner `EXECUTE`, enrollment rows и роли не создаются.

Worker-only `CURRENT181` нельзя продвигать отдельно. До canonical promotion он
должен либо быть расширен до полного atomic release, либо остаться
неканоническим rehearsal input для будущего объединённого candidate. Полный
release обязан одновременно закрыть producer gates, legacy producer retirement,
signed drain/apply/rollback и runtime attestation; частичный repin worker
запрещён.

## 2. Проверенное текущее состояние API

### 2.1. Process topology

Identity-mail worker — отдельный CLI process:

- entrypoint:
  `apps/api/src/identity-mail-worker/identity-mail-worker.cli.ts`;
- package command: `node dist/identity-mail-worker/identity-mail-worker.cli`;
- CLI не зарегистрирован в `AppModule` и не использует HTTP/Nest controller;
- `ConfigService` используется только для создания
  `IdentityMailSecretEnvelopeService` с изолированным worker environment;
- production systemd/nginx unit и worker env-файл в repository отсутствуют.

Следовательно, изменение основного Nest API само по себе не включает worker, но
изменение существующего CLI/repository может повлиять на уже развёрнутый
standalone process после следующего build/restart.

### 2.2. Current startup and admission

`identity-mail-worker.config.ts`:

- по умолчанию worker выключен;
- real send требует одновременно exact `true` для
  `IDENTITY_MAIL_WORKER_ENABLED`,
  `IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED` и
  `IDENTITY_MAIL_WORKER_LIVE_CANARY_ENABLED`;
- принимает от одного до четырёх unique canonical tenant UUID и сортирует их;
- pin-ит expected database/role, release SHA, migration name/count, crypto,
  SMTP/TLS и bounded delivery policy;
- текущие fixtures и repository принимают только `CURRENT179/179`.

`identity-mail-worker.cli.ts` после parsing создаёт Prisma client, repository,
SMTP provider и service, запускает health, затем выполняет:

```text
repository readiness -> SMTP verify -> health READY -> repeated runOnce
```

Независимой signed runtime attestation в этой цепочке нет. SMTP transport
создаётся до database readiness; network `verify()` выполняется после неё.

### 2.3. Current worker repository surface

`PrismaIdentityMailWorkerRepository` допускает ровно пять effective/direct
worker RPC и zero relation/column/sequence privilege:

| Method | Current SQL call |
| --- | --- |
| `assertReady` | `identity_mail_delivery_worker_assert_v1(tenantId)` |
| `claimOne` | `identity_initial_owner_mail_claim_v1(tenantId, leaseOwnerDigest, leaseTokenDigest, providerAuthorityDigest)` |
| `reapExpired` | `identity_initial_owner_mail_reap_v1(tenantId, providerAuthorityDigest, workerActorDigest, batchLimit)` |
| `markProviderAttempt` | `identity_initial_owner_mail_provider_mark_v1(outboxId, leaseVersion, leaseOwnerDigest, leaseTokenDigest, providerAttemptKey, providerAuthorityDigest, messageIdDigest)` |
| `complete` | `identity_initial_owner_mail_complete_v1(outboxId, leaseVersion, leaseOwnerDigest, leaseTokenDigest, outcomeCode, providerReceiptDigest, terminalAckDigest)` |

Все вызовы выполнены параметризованным `Prisma.sql` через `$queryRaw`. Для
каждого RPC Prisma выполняет отдельный statement; caller-side explicit
transaction, отдельный pre-RPC `SET LOCAL statement_timeout`, bounded
`lock_timeout` и driver deadline в repository отсутствуют.

`assertReady` сначала отдельным catalog query проверяет текущую session,
TLS, role OID/attributes, database/schema privileges и exact five-function
allowlist, а затем последовательно вызывает readiness v1 для каждого tenant.
Это не единый snapshot, и результат не содержит database OID, deployment
marker, actual-context binding либо worker artifact/executable digest.

### 2.4. Current service call graph

Единственные production-code вызовы repository находятся в
`identity-mail-worker.service.ts`:

```text
assertReady
  -> per-cycle assertReady
  -> SMTP verify
  -> reap every allowlisted tenant
  -> claim per tenant up to batchSize
  -> open token and build message
  -> provider marker
  -> SMTP send
  -> SENT completion
```

При ошибке до provider marker service вызывает pre-provider completion. После
входа в provider-marker boundary любая ошибка приводит только к
`RECONCILIATION_REQUIRED`; blind SMTP retry отсутствует. Ciphertext buffer
очищается в `finally`.

Текущий global per-cycle readiness требует active v1 enrollment для каждого
allowlisted tenant. Поэтому один будущий `DRAINING` tenant остановил бы и reap
для себя, и работу остальных tenant. Provider-mark и complete v1 дополнительно
не имеют tenantId первым аргументом и не могут взять общий tenant lock до
outbox lookup.

### 2.5. Stop behavior

На `SIGINT/SIGTERM` health немедленно становится
`503 / IDENTITY_MAIL_WORKER_STOPPING`, poll delay прерывается, новые reap/claim
не начинаются. Если signal замечен после возврата `claimOne`, service намеренно
заканчивает ровно этот lease, включая provider marker, SMTP и terminal
completion, после чего не берёт следующий claim. Forced process kill не
является drain evidence; выданный lease остаётся до DB expiry/reap.

### 2.6. Producer and activation calls

В `apps/api/src` нет вызовов
`identity_owner_invite_issue_hold_v1` или `shared_beta_tenant_activate_v1`.
Они используются database migration/smoke/PG fixtures. HTTP routes
`POST /admin/shared-beta/tenants/provision` и initial-owner revoke сейчас
безусловно возвращают `503`; существующий `SharedTenantProvisioningService`
создаёт только suspended shell и identity reservation, но controller его не
вызывает.

Это сохраняет внешний provisioning fail closed, однако owner implicit
`EXECUTE` старых SECURITY DEFINER producer RPC остаётся database-level bypass и
обязан быть retired в полном v2 release.

## 3. Pure runtime attestation: что уже есть и чего нет

`packages/database/scripts/identity-mail-worker-runtime-attestation.mjs`
реализует pure exact Ed25519 verifier для:

- `CURRENT180/180`, release SHA и deployment marker;
- database name/OID, database identity и actual context;
- `runtimeConfigDigest`, worker executable/artifact digests;
- sorted one-to-four tenant bindings: tenant, policy/state revisions,
  current configuration/provider authority и worker role name/OID.

Но текущий verifier намеренно не является runtime authorization:

```text
production roots = frozen empty
authorization = false
canMutate = false
canSend = false
databaseReadinessRequiredPerTenant = true
```

Он не импортируется API/CLI. В worker code отсутствуют:

- безопасный loader signed envelope;
- production pinned root enrollment;
- вычисление digest фактического executable и immutable release artifact;
- получение database OID, marker, database identity, actual context и exact
  tenant bindings;
- branded bridge между pure verifier и service;
- refresh/expiry policy и health reason codes для stale attestation.

Есть ещё два прямых integration blocker:

1. verifier жёстко pin-ит schema head/count к `CURRENT180/180`, тогда как
   worker v2 после stacked apply будет наблюдать `CURRENT181/181`; молча
   переиспользовать этот signed profile нельзя — до root enrollment нужен новый
   versioned runtime profile либо явно пересмотренный, заново принятый contract;
2. verifier является ESM `.mjs` внутри package `database`, который не имеет
   runtime export для CommonJS Nest build и не является dependency package
   `api`; прямой source-path import не попадёт в гарантированный deployment
   artifact. Нужен reviewed shared runtime package или API-local adapter с
   byte-for-byte canonical/digest parity tests.

Простое чтение JSON из env или проверка boolean-полей envelope запрещены.
Synthetic verifier допускается только в loopback CI и не может стать runtime
credential.

## 4. Exact worker v2 API delta

Будущий dormant CURRENT181 contract использует следующие positional
signatures. `tenantId` всегда первый и проходит scalar validation до relation
read:

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
```

Worker role получает только эти пять functions. Operator-only
`identity_initial_owner_mail_reconcile_v2(tenantId, ...)` не входит в worker
interface и allowlist.

Repository/type delta:

- provider-mark и every completion input обязаны передавать tenantId и exact
  `providerAuthorityDigest`;
- claim receipt обязан вернуть и parser обязан проверить secret-free
  `claimEnrollmentStateRevision`, `claimPolicyRevision` и
  `claimProviderAuthorityDigest`;
- provider-mark/complete/reap receipt обязаны возвращать tenantId, lease CAS,
  transition revision и state/authority decision, без PII;
- readiness возвращает exact observed tenant binding, достаточный для сравнения
  с runtime attestation: state/state revision, policy revision, current
  configuration/provider authority, worker role name/OID и active drain command
  identity;
- extra/missing key, unsafe integer, wrong tenant/order/authority или unknown
  decision отклоняется до SMTP.

## 5. ACTIVE/DRAINING process semantics

Один global `assertReady(): void` недостаточен. Полная deployable v2 boundary
должна разделить:

1. process/catalog/transport/attestation admission;
2. tenant claim admission (`ACTIVE` only);
3. settlement уже выданного lease (`ACTIVE` или exact pre-drain lease);
4. drain-mode reap (`DRAINING`, без перехода в `RETRY`).

Целевая readiness projection для allowlist должна классифицировать каждый tenant как
`ACTIVE_CLAIM_READY` либо `DRAINING_SETTLEMENT_ONLY`. `DRAINING` не должен
останавливать reap этого tenant или независимый `ACTIVE` tenant.

Exact dormant CURRENT181 реализует только database worker subset этой модели:
`identity_mail_delivery_worker_assert_v2` допускает `ACTIVE` и возвращает
неавторизующий `REHEARSAL_READY`; вызов claim в `DRAINING` завершается
fail-closed SQLSTATE `42501`, а не structured non-claim receipt. Это допустимо
для owner-only rehearsal без runtime wiring, но structured
`DRAINING_SETTLEMENT_ONLY` admission остаётся задачей API/runtime release.

Provider marker и completion сверяют lease-captured state/policy/authority.
Новый target authority не может завершить старый lease. В CURRENT181 stale или
expired CAS обычно fail-closed с SQLSTATE `40001`; целевой runtime adapter
должен до SMTP детерминированно классифицировать такие отказы либо получить
versioned exact receipt в объединённом release. Потеря ответа после возможного
committed marker остаётся ambiguous и ведёт только в reconciliation.

## 6. Fail-closed runtime integration order

Live wiring допускается только после database promotion evidence и отдельной
production root ceremony. Требуемый порядок startup/cycle:

```text
1. parse isolated worker config
2. acquire and hash exact executable + immutable release artifact
3. connect as exact worker role
4. read catalog/transport/database/marker and per-tenant v2 bindings
5. verify pinned signed runtime attestation against those observed bindings
6. require branded live authorization with exact allowlist and validity budget
7. only then construct/verify SMTP transport and publish READY
8. before each cycle re-check attestation freshness and DB readiness
9. before each new claim require ACTIVE claim admission
10. after committed provider marker finish only that lease; never start another
```

Attestation validity budget до нового claim должна покрывать bounded
provider-marker + SMTP acknowledgement horizon. Expiry либо binding drift до
claim немедленно переводит health в 503 и запрещает SMTP. Уже committed marker
не прерывается между marker и settlement произвольной process-side проверкой:
lease/drain CAS решает его deterministic completion/quarantine.

Каждый mutating v2 RPC caller использует короткую explicit transaction:
отдельный pre-RPC `SET LOCAL statement_timeout`, bounded `lock_timeout`, затем
ровно один parameterized RPC. Driver deadline/cancel обязан rollback-нуть
transaction и не возвращать aborted connection в pool.

## 7. Smallest safe dormant implementation slice

До SQL promotion безопасно реализовать только неисполняемый adapter contract:

1. добавить рядом с текущим worker отдельные v2 types, exact receipt parsers и
   parameterized query builders/repository class;
2. unit-тестами доказать пять exact v2 signatures, tenant-first values,
   CURRENT181/181 release pin, rejection extra/missing receipt fields и zero v1
   signature в v2 allowlist;
3. добавить service-level v2 state-machine tests только с mocked repository и
   fake SMTP: DRAINING no-claim, pre-drain settlement, stale marker zero-send,
   stop-after-claim one-settlement;
4. не импортировать v2 adapter из существующего CLI, не менять package command,
   текущие v1 constants/env, runtime grants или systemd unit;
5. не добавлять production root и не превращать current pure verifier result в
   `canSend=true`.

Это компилируемый/testable slice, но не работающий sender. Даже полный mock
suite не является PostgreSQL или deployment evidence.

## 8. Disposable PostgreSQL evidence

На PostgreSQL 16.13 приняты:

- exact stack `CURRENT179 -> dormant CURRENT180 -> CURRENT181`;
- predecessor foundation verifier больше не предполагает, что CURRENT180 —
  единственная candidate-папка: он принимает только exact ordered allowlist
  `[CURRENT180, CURRENT181]` и по-прежнему fail-closed блокирует любую
  неизвестную/дублированную candidate-папку; CURRENT180 suite — `82/82`,
  self-test — `21` negative probe;
- CURRENT181 semantic foundation suite — `87/87`, self-test — `7`
  fail-closed probe, итоговый `--check` — `COMPLIANT`;
- standalone rehearsal validator требует exact metadata SHA, равный runtime
  digest SQL bytes; прежний zero-sentinel отклоняется negative test;
- dynamic checksum из exact SQL bytes и оба GUC/unfinished-receipt fence;
- owner-only helper, пять worker v2 RPC и reconcile v2 без единого non-owner
  `EXECUTE`, table или column grant;
- exact catalog matrix: owner, security mode, language, search path,
  volatility, parallel mode, body hash, zero defaults/variadic/strict/
  leakproof/retset, zero unexpected overload и zero transitive
  migration-owner membership;
- неизменные `prosrc` всех шести worker/reconcile v1;
- immediate `55000 / LEGACY_IDENTITY_MAIL_PRODUCER_RETIRED` у обоих producer
  v1 до чтения relations;
- caller protocol `SERIALIZABLE + read-write + statement_timeout (0,30s]` и
  transaction-local `lock_timeout=5s`;
- same-tenant serialization при commit и rollback, одновременный прогресс
  другого tenant, освобождение lock после statement timeout `57014` и lock
  timeout `55P03`;
- failure-path с injected postcondition fault: полный rollback без columns,
  indexes, functions или завершённого CURRENT181 receipt;
- source `179/179` zero-diff, два disposable clone удалены, остаток — `0`;
- claim `EXPLAIN` использует reordered ready index без `Sort`; drain,
  zero-secret, marked/unmarked и rollback используют свои partial indexes.

Durable runner завершился за 17,8 секунды с решением
`CURRENT181_DISPOSABLE_REHEARSAL_PASSED`; offline harness tests — `10/10`.
Отдельные ACTIVE/DRAINING row fixtures намеренно сообщают
`SKIPPED_DORMANT_GUARD_NO_COORDINATOR_RPC`: обход dormant guard не подменяет
отсутствующий signed enrollment coordinator.

Revised candidate принят на exact head
`7fb3cf966d5c612f0f2504f4545151ef3edb8ac9`, GitHub Actions
[`30720288891`](https://github.com/boozik3412/leetplus/actions/runs/30720288891)
(`run #79`) — `3/3 PASS`: authority-root gate, application checks и полный
PostgreSQL migration smoke, включая CURRENT181→CURRENT183 stack и CURRENT183
matrix `3/3`. Старые `abbfe561...` / CI `#66` — historical superseded evidence:
они не подтверждают revised SQL после устранения runtime `42883`. Это всё ещё
engineering rehearsal, а не deploy authorization.

CURRENT181 остаётся dormant, если producer/activation ещё v1: worker lock сам
по себе не закрывает появление нового `HOLD/PENDING` во время drain.

## 9. Не реализовано и promotion blockers

На текущем implementation checkpoint уже существуют:

- fenced stacked migration SQL поверх exact CURRENT180;
- tenant lock helper, пять worker v2 RPC и отдельный reconcile v2;
- claim state/policy/provider authority evidence в outbox и delivery events;
- tenant-leading ready/drain/secret/marked/unmarked indexes;
- immediate `55000` retirement stubs обоих legacy producer v1;
- owner-only/no-grant catalog boundary и статический foundation gate.

До promotion по-прежнему отсутствуют либо не приняты:

- signed coordinator и production runtime должны применить уже принятый
  tenant-first lock protocol; application/current-worker cross-path races и
  diagnostic worker-v2 state/freshness matrix приняты, но не заменяют signed
  coordinator transitions и runtime grants;
- event-backed exact replay либо однозначный typed handoff в reconcile для
  `provider_mark_v2` и `complete_v2` после потерянного DB response. Сейчас
  повтор после успешного commit fail-closed возвращает stale `40001`; blind
  SMTP retry исключён, но caller не отличает commit от другого stale fence;
- ACTIVE/DRAINING row-level behavior fixtures через настоящий signed
  enrollment coordinator, без отключения dormant guard вручную;
- production-history inventory/backfill: текущий rehearsal precondition
  намеренно требует zero `CLAIMED`/attempt history и поэтому не является
  готовым production upgrade для базы с историческими delivery attempts;
- v2 role/grant/enrollment ceremony;
- production DI/config/CLI wiring и deployable receipt package для уже
  реализованного dormant CURRENT183 v2 adapter;
- executable/artifact digest acquisition и signed attestation loader;
- production runtime-attestation roots и live authorization brand;
- CURRENT181-compatible versioned attestation profile и deployable API/package
  bridge для verifier;
- producer v2 и activation v2;
- signed begin/resume/finalize/rollback coordinator;
- zero-secret + zero-inflight DRAINING barrier;
- relational rollback invariants;
- production-like rehearsal, deployment artifact и worker unit;
- production deploy, Tenant B, user, invite или SMTP send.

Любой из этих gaps сохраняет:

```text
CURRENT181 = NOT CANONICAL
WORKER V2 = NOT WIRED
PRODUCTION DEPLOY = NO-GO
EXTERNAL PILOT = NO-GO
```

## 10. Обязательная дальнейшая последовательность

1. `[x]` Завершить security review, закрепить exact SQL SHA и принять
   обязательный semantic static gate.
2. `[x]` Принять disposable PostgreSQL
   apply/catalog/concurrency/timeout/rollback rehearsal, сохранив source
   zero-diff и полный cleanup.
3. `[x]` Реализовать dormant exact-five-RPC v2 adapter и перевести
   acceptance/cancel/revoke/reissue/IdentityEmailClaim transitions на тот же
   tenant-first lock protocol без production wiring.
4. `[x]` Принять cross-path zero-`40P01` и diagnostic non-empty
   `ACTIVE|DRAINING × HOLD|PENDING` PostgreSQL matrices. Следующим отдельным
   шагом реализовать producer/activation v2 и signed enrollment coordinators
   под тем же tenant lock order.
5. Добавить event-backed replay/typed reconciliation handoff для
   provider-mark/complete lost-response cases.
6. Реализовать signed crash-resumable drain/apply/finalize/rollback и
   zero-secret/zero-inflight barrier.
7. Реализовать API runtime observation, executable/artifact hashing и branded
   pinned attestation integration; production roots всё ещё не enroll-ить.
8. Выполнить production-like disposable-clone rehearsal с отдельными v1-stop,
   schema apply, v2-role grant, v2-start и rollback checkpoints.
9. Только после exact-SHA CI и отдельного human `PRODUCTION DEPLOY GO` выполнить
   controlled deploy.
10. Tenant B/Store B1, OWNER invitation и первый внешний доступ требуют ещё
   одного отдельного `SHARED BETA GO` после production acceptance.
