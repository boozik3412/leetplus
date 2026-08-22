# Cutover-чеклист текущей сети: один Tenant, четыре Store

| Поле            | Значение                                           |
| --------------- | -------------------------------------------------- |
| Статус          | Template; execution prohibited without explicit GO |
| Версия          | 1.24.6                                             |
| Дата            | 02.08.2026                                         |
| Топология       | 1 operational Tenant / 4 Store                     |
| Метод           | In-place, без смены `tenantId`                     |
| External access | Запрещён до Gate 1MT/2 и `SHARED BETA GO`        |

Реальные ID, email, домены интеграций, токены и database URLs в этот файл не
вносятся. Для них используется защищённая операционная запись; здесь
сохраняются alias, checksum, counts и ссылка на неё.

Все фиксированные SHA ниже — historical checkpoints. Они не заполняют
`Full candidate SHA` и не заменяют CI/review/evidence нового exact current
candidate, который должен включать exact additive migrations `163..179` и пройти
`CURRENT_179`
admission.

`CURRENT180`, stacked `CURRENT181`, `CURRENT182`, `CURRENT183` и `CURRENT184` candidates
`20260801010000_identity_mail_tenant_enrollment_control_plane` /
`20260801020000_identity_mail_tenant_lock_drain_worker_v2` /
`20260801030000_identity_mail_tenant_first_claim_protocol` /
`20260802010000_identity_mail_worker_v2_freshness_protocol` /
`20260802020000_identity_mail_worker_v2_lost_response_replay` намеренно не входят
в canonical migration chain и не меняют этот target.

## A. Release identity и authority

- [ ] Candidate branch clean.
- [ ] Full candidate SHA:
- [ ] `origin/main` relation зафиксирован:
- [ ] EXPAND revision/count: `162`, latest —
      `20260727131000_staff_task_integrity_expand`; final cutover count/revision
      обновлены после отдельного VALIDATE/CONTRACT.
- [ ] EXPAND source checkpoint:
      `dc26568d94d76b886f1d1b79c36b1bd9f00ac401` — не production deployment.
- [ ] Reconciliation planner source checkpoint:
      `2c74c663780b3f183be708a01431c22efe57a723` — aggregate-only, no apply,
      не production deployment.
- [ ] Snapshot admission source checkpoint:
      `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` — schema `v2`,
      `IMPLEMENTED_CANDIDATE`, не production deployment.
- [x] Local test-evidence checkpoint
      `2341b99937e54cc50d1763a0a794d975816c72ce`: public-only pre-signed
      fixture без private key/generation/signing API проверила реальный pinned
      wrapper, marker/nonce-bound identity match и private same-process report
      evidence; marker/expiry и detached-report cases fail-closed, admission
      suite `19/19`.
- [ ] Remote CI checks и independent review exact test-evidence commit
      `2341b99937e54cc50d1763a0a794d975816c72ce` зелёные.
- [ ] Experimental Node.js 22 module-mock `P2` risk принят либо заменён
      стабильным test seam; mock остаётся изолированным spawned child и не
      изменяет production root registry.
- [ ] SYNTHETIC reconciliation proposal dry-run source checkpoint:
      `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` — schema `v1`, read-only
      harness-only, no apply, не production deployment.
- [x] В runtime candidate production authority root registry остаётся exact
      `{}` / `EMPTY / FAIL-CLOSED`; `PRODUCTION_LIKE` остаётся `NO-GO`.
- [x] Неканонический `CURRENT180` schema-candidate с SQL SHA-256
      `e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683`
      прошёл static gate `81/81`, self-test
      `21` probes и получил `COMPLIANT`; его статус —
      `DORMANT_SCHEMA_ONLY / NOT_DEPLOYABLE`.
- [x] Два независимых PostgreSQL 16.13 smoke этого candidate прошли на
      exact SQL SHA: legacy fixture и ошибочный fence fail-closed, clean
      `179→candidate 180` принят, source zero-diff и disposable clone/temp
      cleanup подтверждены; independent review P0/P1/P2=`0/0/0`.
- [x] Exact implementation
      `475e9be4726787db955d895d348af1fc5a7c2db3`, GitHub Actions
      [`30690147568`](https://github.com/boozik3412/leetplus/actions/runs/30690147568)
      (`run #64`) — `3/3 PASS`, включая оба новых CURRENT180 gate.
- [x] Pure enrollment-command authority verifier и worker runtime-attestation
      реализованы без I/O/mutation surface: production roots frozen empty,
      focused suites `12/12` и `12/12`; fixture-substituted pinned test
      проверяет exact frozen 52-column DB mapping без production root-injection
      API; runtime verdict остаётся
      `authorization=false/canMutate=false/canSend=false` до per-tenant DB
      readiness.
- [x] Общий producer/worker lock order, пять operational worker v2 RPC,
      owner/operator-only reconcile и `DRAINING` zero-secret/zero-inflight
      barrier зафиксированы в
      [reviewed design](./protected-mail-tenant-lock-drain-v2.md).
- [x] Неканонический `CURRENT181` worker-v2 rehearsal candidate с exact
      SQL SHA-256
      `c923d26d77fbb268fccc03d6eff0539a75c2644059d7f7ffc2493491c88f69ac`
      прошёл semantic static gate и PostgreSQL 16.13
      apply/catalog/ACL/concurrency/timeout/rollback/cleanup rehearsal;
      source остался `179/179`, residue — `0`, grants/enrollment отсутствуют,
      статус — `NOT_DEPLOYABLE`. Revised exact stack принят на
      `7fb3cf966d5c612f0f2504f4545151ef3edb8ac9`, GitHub Actions
      [`30720288891`](https://github.com/boozik3412/leetplus/actions/runs/30720288891)
      (`run #79`) — `3/3 PASS`; исторические `abbfe561...` / `run #66`
      относятся к доревизионным bytes.
- [x] Неканонический `CURRENT182` tenant-first claim candidate с exact SQL
      SHA-256
      `5eb1ab8f2535c212b334e599071aefbae19039cc519177f62cbe0de7373e6fdf`
      добавлен поверх revised CURRENT181. Пять canonical claim entrypoint
      используют tenant -> email -> relation order, три legacy v1 writer
      немедленно возвращают `55000`; PUBLIC execute отсутствует. Foundation
      `15/15`, smoke self-test `7/7`; статус — `NOT_DEPLOYABLE`. Historical
      `dd8b541...` / `run #72` остаётся initial cross-path evidence, а revised
      CURRENT181..183 stack принят exact-head CI `run #79`.
- [x] Неканонический `CURRENT183` freshness candidate с exact SQL SHA-256
      `a3b92838cac386480384abb770aa06a9f2cb27b4326d5c6f9344f9019b26f2f0`
      pin-ит worker-v2 readiness к `183/183`; dormant exact-five-RPC adapter
      использует bounded `READ COMMITTED` и отдельные settings/tenant-lock/RPC
      statements. Статус candidate —
      `ENGINEERING_ACCEPTED / NOT_CANONICAL / NOT_DEPLOYABLE`; production
      DI/config/CLI его не регистрируют.
- [x] Неканонический `CURRENT184` lost-response candidate с exact SQL SHA-256
      `d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424`
      добавляет event-backed exact replay только для `provider_mark_v2` и
      `complete_v2`. Устаревший marker возвращает typed `HANDOFF` до SMTP;
      claim/reap и SMTP не входят в semantic retry. Foundation CURRENT180–184
      и focused API tests локально зелёные. Candidate owner-only,
      `NOT_CANONICAL / NOT_DEPLOYABLE`, без role/grant/DI/config/CLI.
- [x] Create, reissue/revoke, cancel, accept, shell provisioning/replay и
      emergency suspend переведены на общий bounded tenant-first protocol.
      Provisioning берёт fresh platform-authority locks только после tenant
      lock. Текущий CURRENT179 worker оборачивает tenant-addressed assert,
      claim и reap в тот же lock; outbox-only marker/completion допускаются
      только по exact DB-derived `CLAIMED` binding и берут lock по binding
      tenant. V1 RPC, receipts, migration head/count и authority allowlist не
      менялись; unit/static evidence локально зелёные.
- [ ] Worker v2 RPC/API, producer tenant lock и crash-resumable drain
      завершены одним atomic release: database worker-v2 rehearsal и race
      matrix уже приняты, dormant API v2 adapter реализован, но
      producer/activation v2, signed coordinators, runtime registration/grants
      и coordinator-created ACTIVE/DRAINING fixtures отсутствуют.
- [x] Historical canonical-CURRENT179 PostgreSQL evidence принято для actual
      CURRENT179 repository `claimOne`
      race и relation-level create/accept/cancel/reissue fixtures с
      commit/rollback/`55P03`/`57014`, two-tenant progress, zero `40P01`,
      source zero-diff и cleanup. Exact evidence SHA
      `dd8b541727565f2ac5154c1731d9bf73a5744d91`, GitHub Actions
      [`30709619765`](https://github.com/boozik3412/leetplus/actions/runs/30709619765)
      (`run #72`) — `3/3 PASS`, cross-path fixture — `8/8 PASS`.
- [x] Diagnostic worker-v2 freshness matrix принята для non-empty
      `ACTIVE|DRAINING × HOLD|PENDING` на exact `7fb3cf9...` / `run #79`:
      `ACTIVE/PENDING → CLAIMED`, `ACTIVE/HOLD → EMPTY`, оба `DRAINING`
      варианта → `42501`; post-lock snapshot свежий, второй tenant не
      блокируется, `40P01` отсутствует.
- [ ] Та же матрица принята через independently signed enrollment coordinator,
      runtime role/OID и production-like grants без owner-seeded diagnostic
      fixtures; diagnostic acceptance не заменяет этот promotion gate.
- [ ] `provider_mark_v2` и `complete_v2` имеют event-backed exact replay либо
      однозначный typed handoff в reconcile после committed lost DB response;
      blind SMTP retry остаётся запрещён.
- [ ] Canonical atomic release заменяет legacy
      `identity_owner_invite_issue_hold_v1` и
      `shared_beta_tenant_activate_v1` exact pre-read `55000` stubs.
      Неканонический CURRENT181 rehearsal уже доказывает эти stubs и zero
      callable legacy secret writer даже для function owner, но сам по себе
      release gate не закрывает.
- [ ] DB accept под tenant lock доказывает relational rollback: referenced
      command — terminal/current same-tenant `FORWARD`, current configuration
      равна original target, action/configuration соответствуют exact
      compensating mapping,
      rollback-of-rollback и второй rollback запрещены.
- [ ] Exact routine ACL matrix реализована и catalog-pinned: owner/security
      mode/search path/language/volatility/parallel/leakproof/null/retset,
      body/signature, role name/OID, hostile default ACL, transitive membership
      и zero unexpected PUBLIC/direct/grant-option access. Owner-only
      CURRENT181 slice уже pin-ит body/default/overload/membership и ACL;
      release role name/OID и grants остаются открыты.
- [ ] Enrollment-coordinator и reconcile-operator exact role name/OID включены
      в независимый signed release authority до выдачи grant; activation role
      получает только activation RPC, private issue producer — zero non-owner
      `EXECUTE`.
- [ ] Каждый mutating caller до RPC отдельным statement выполняет bounded
      `SET LOCAL statement_timeout`, имеет driver deadline/cancellation и
      гарантирует rollback/pool cleanup; внутренний `lock_timeout` ограничивает
      последующие advisory/row waits.
- [ ] Envelope timeline/root-at-now проверяются только initial accept/begin;
      exact persisted command может resume/drain/finalize после 15-минутного
      expiry/lease/ack wait по immutable receipt и `signatureVerifiedAt`,
      expired unaccepted proposal остаётся rejected.
- [ ] Promotion CURRENT180/CURRENT181/CURRENT182/CURRENT183 rehearsal в canonical release принят
      только в одном
      atomic release с worker v2/runtime attestation, producer/worker tenant
      advisory lock, `DRAINING` zero-secret barrier для secret-bearing
      `HOLD/PENDING/RETRY`, independently signed
      apply/rollback/zero-diff и production-like rehearsal.
- [x] Remote PostgreSQL 16 prerequisite `CURRENT_164` зелёный на
      `37f8cc88cdba05b3c73f6bc14e14528f831228ee`, CI `30423839760`; это
      SYNTHETIC evidence, runtime `CURRENT_164` не принимает.
- [x] Historical prerequisite `CURRENT_165` и populated `164 → 165` rehearsal
      зелёные на `4bd6a036...` / CI `30428288353`; все три CI job успешны.
      Documentation/evidence successor `7c20adec...` / CI `30429463161` также
      зелёный.
      Это не evidence для migration `166` и не закрывает production-like или
      deployment checkbox ниже.
- [x] Независимый adversarial review `CURRENT_166` не нашёл P0-блокера для
      применения как inert schema foundation. Из исходных четырёх P1
      legacy quarantine delivery-row/lifecycle закрыт previous baseline, ещё
      два закрыты exact-head checkpoint `d525b736...`, четвёртый
      lock-order/`40P01` — exact-head `be8c94c4...`. Все четыре engineering P1
      закрыты; provider writes остаются `NO-GO` до operational gates.
- [x] Historical schema target `CURRENT_166` был связан с previous accepted
      engineering PR-head baseline:
      `bbef153a288bfdf1c3573eb704f27c013cc0e856`, GitHub CI
      [`30443837684`](https://github.com/boozik3412/leetplus/actions/runs/30443837684)
      (`run #23`), выполненным через merge-ref; это не exact-SHA checkout
      evidence. Все три job `PASS`: Application checks `90549245276`,
      Authority checks `90549245284`, PostgreSQL migration smoke
      `90549245372` на PostgreSQL major `16`. Authority job не выполнял root
      enrollment; registry остаётся `{}`. `c1fee42c...` / CI `30442286822`
      остаётся historical precursor.
- [x] Historical `CURRENT_168` exact-head
      `3b8228dd278fae062c753bf4301e0339ba93738b` прошёл CI `30460154200`,
      `3/3 PASS`, и independent review без новых P0.
- [x] Historical engineering exact `CURRENT_169` checkpoint
      `f5d39fd89145c995c51e7005698327f5581a5cd8` принят GitHub CI
      [`30467882578`](https://github.com/boozik3412/leetplus/actions/runs/30467882578)
      (`run #37`), `3/3 PASS`: Application `90630292527`, authority-root
      `90630292169`, PostgreSQL 16 `90630292257`. Independent
      implementation/security review и review compatibility fix не нашли
      новых P0/P1; у fix нет P2. Это engineering checkpoint, не production-like
      admission и не разрешение на cutover.
- [x] Historical exact-head CI и independent review `CURRENT_170` candidate
      приняты: `8dfe219...` / CI `30493779099` (`run #47`), `3/3 PASS`,
      independent review без P0/P1/P2. PostgreSQL `16.13` подтвердил clean
      `170/170`, populated `169 → 170`, exact seven-RPC runtime enrollment при
      zero `IdentityEmailClaim` table privileges, locator/ACL/rollback и shell
      `2/2`; это не является production-like admission.
- [x] Terminal local candidate `CURRENT_179` /
      `20260731120000_identity_mail_delivery_release_head` прошёл local
      three-history PostgreSQL 16 rehearsal: identity branch, актуальный
      `origin/main` и clean history — `PASS`; terminal migration SHA
      `c394060fb...`, manifest `179` `333018542...`, tamper matrix
      `1/1/1/1/1`,
      cleanup residue `0`. `CURRENT_176` остаётся immutable identity-mail
      checkpoint, `CURRENT_178` — промежуточным `origin/main` prerequisite.
- [ ] Full candidate SHA зафиксирован, final independent re-review принят и
      exact-SHA GitHub CI завершился `3/3 PASS` именно для `CURRENT_179`.
      До этого local candidate не является engineering-accepted release,
      production deploy/restart/drain и внешний доступ запрещены.
- [x] Rejected initial `CURRENT_169` exact-head
      `f9db2643b576778fbb0c651229c37e42d3f0892c`, CI
      [`30467211571`](https://github.com/boozik3412/leetplus/actions/runs/30467211571)
      (`run #36`), сохранён как `REJECTED`, `2/3 PASS`: historical
      `EXPAND_162` rehearsal обнаружил post-baseline
      `User.identityClaimRevision` в Prisma `RETURNING`; исправлено frozen
      `id/tenantId` projection для create/update/delete.
- [x] Rejected exact-head candidate
      `a644b81e909ea97c21e3c404480505bf97b19935`, CI
      [`30447011917`](https://github.com/boozik3412/leetplus/actions/runs/30447011917)
      (`run #27`) сохранён как `REJECTED`: Application `90559756157` и
      Authority `90559756309` — `PASS`, PostgreSQL `90559756334` — `FAIL`
      из-за несовпадения ожидаемого custom replay text с SQLSTATE
      `23505`/generic Prisma message.
- [x] Previous accepted exact-head checkpoint:
      `d525b736d03162a2c58de17cbf7679ba6f515096`, CI
      [`30447467729`](https://github.com/boozik3412/leetplus/actions/runs/30447467729)
      (`run #28`), `3/3 PASS`: Application `90561260920`, Authority checks
      `90561260926`, PostgreSQL `90561260878`. Authority checks не выполняли
      root enrollment; registry остаётся `{}`.
- [x] Last accepted exact-head checkpoint:
      `be8c94c4ea9106a31055a0aff577ffbd62b67e7c`, CI
      [`30449026506`](https://github.com/boozik3412/leetplus/actions/runs/30449026506)
      (`run #29`), `3/3 PASS`: Application `90566337085`, Authority checks
      `90566337062`, PostgreSQL major `16` job `90566337060`. Authority checks
      не выполняли root enrollment; registry остаётся `{}`.
- [x] Clean/populated rehearsal `165 → 166` подтвердил exact prefix, `10`
      legacy deliveries, `1` canonical Store backfill, `6` quarantines, `3`
      preserved fail-closed stores, `4` committed transitions, `9` runtime
      boundary negatives и `7` rejected immutable mutations. PostgreSQL
      major `16` evidence также подтвердил
      `finalStateAndEvidenceUnchanged=true`,
      `sourceDatabaseMigrationsApplied=0`, неизменное source migration state
      и отсутствие изменений source application data.
- [ ] Production-like acquisition/admission, migration apply, deployment и
      cutover отдельно выполнены и приняты; engineering PASS выше намеренно не
      заполняет этот checkbox.
- [x] Engineering lock protocol реализован private SECURITY INVOKER
      `guest_game_reward_delivery_lock_v1`: canonical advisory seed `166` →
      same-tenant Reward `FOR UPDATE` → `VERIFIED` Telegram/MAX Deliveries
      `ORDER BY id FOR UPDATE`; оба deferred trigger делегируют boundary,
      application writers вызывают её до первой DML. Run #29 подтвердил
      `privateSecurityInvokerLockBoundaries=1`, две disposable owner-DML
      session, advisory waiter, оба committed trigger path,
      `rawDeadlockOrLockTimeoutErrors=0` и неизменный state/evidence.
- [x] Reason/integrity mutation является event-bearing; deferred validation
      re-read окончательной Delivery строки отклоняет queued-tuple/reason
      drift. Rejected `6a69cd8...` / CI `30445054152` (`run #26`),
      PostgreSQL job `90553255161`, завершился `FAILED` из-за retry readiness
      fixture; independent preflight также обнаружил null-closed Event gap.
      Exact-head `d525b736...` / run #28 принят после `3/3 PASS` и закрыл
      final-row reason/evidence consistency и null-closed Event integrity.
- [x] `LEGACY_QUARANTINED` полностью immutable: state/reason/scope/provider
      fields и `DELETE` отклоняются. Accepted PostgreSQL job
      `90549245372` подтвердил `immutableMutationsRejected=7` и
      `finalStateAndEvidenceUnchanged=true`.
- [x] Прямой `DELETE` `GuestGameDeliveryAttempt` и
      `GuestGameDeliveryEvent` fail-closed запрещён ordinary/enrolled DML
      roles при включённых triggers. Owner/superuser/DDL bypass operationally
      denied; retention не enrolled.
- [ ] Bounded audited retention identity/procedure, exact grants, retention
      window и audit отдельно спроектированы, реализованы и operationally
      enrolled; quarantine freeze не заполняет этот checkbox.
- [x] Worker runtime boundary не имеет прямого `INSERT` в durable transition
      evidence;
      разрешена только узкая reviewed procedure/подписанная provenance
      boundary, отклоняющая fabricated extra event. Exact-head
      `d525b736...` / run #28 принял worker boundary-only durable event write.
      Это не закрывает operational admission: отдельная non-owner runtime
      role и operational grants обязательны; worker boundary не принимает
      `actorUserId`, interactive same-tenant actor boundary pending.
- [ ] Actual non-owner runtime/app DB role прошла admission и получила explicit
      `EXECUTE` grant на private lock boundary. Сейчас `PUBLIC EXECUTE` revoked;
      batch/rebind/future provider writers остаются fail-closed, а
      whole-transaction bounded retry остаётся обязательной pre-activation
      defense-in-depth.
- [ ] `main` защищён branch protection/ruleset, CODEOWNERS/approval routing
      настроены и независимый reviewer одобрил root-enrollment change.
- [ ] Reviewed Ed25519 public authority root enrolment выполнен отдельным
      change; current empty-root fail-closed state снят только для exact
      approved release.
- [ ] Protected signer и snapshot acquisition/evidence owner отделены от
      caller-controlled env, database `COMMENT`, HMAC report и target process.
- [ ] API/web/edge показывают тот же SHA/build time.
- [ ] Required CI checks зелёные.
- [ ] Release decision owner и change window назначены.

## B. Topology manifest

- [ ] Protected operational record reference:
- [ ] Tenant alias/fingerprint:
- [ ] Store count равен `4`.
- [ ] Store aliases/fingerprints и Langame mapping checksums зафиксированы.
- [ ] Все четыре Store принадлежат одному ожидаемому Tenant.
- [ ] У всех четырёх Store задан и проверен валидный IANA `timeZone`; UTC
      fallback отсутствует в принятом recurring schedule.
- [ ] Cross-tenant `UserStoreAccess` count равен `0`.
- [ ] Восстановленная production-like копия прошла
      [snapshot admission](../security/access-scope/v1/staff-task-integrity-snapshot-admission-runbook.md)
      schema `v2` в состоянии `BASELINE_156`: exit `0`, exact release SHA,
      verified Ed25519 authority, matched database marker/freshness/blob
      binding, report digests, отдельные baseline authority bundle и marker
      install attestation зафиксированы.
- [ ] После применения ровно шести exact migrations `157..162` та же
      production-like копия получила новый state-bound `EXPAND_162` authority
      envelope с новым nonce-bound binding; DB marker заменён его digest до
      admission schema `v2`. Exit `0`, тот же release SHA, verified Ed25519
      authority, matched database marker/freshness/blob binding, новые report
      digests, expand authority bundle и marker-rotation attestation
      зафиксированы; baseline marker reuse запрещён, remote CI/synthetic
      evidence не засчитываются как этот `Gate 2A` checkpoint.
- [ ] После `EXPAND_162` применены только exact allowlisted migrations
      `20260728120000_tenant_execution_control_plane_expand` и
      `20260728150000_tenant_execution_revision_fence` и
      `20260729120000_store_background_execution_fence` и
      `20260729160000_guest_game_delivery_claim_fence` и
      `20260729190000_identity_email_claim_foundation` и
      `20260729210000_identity_email_claim_write_boundary` и
      `20260729230000_identity_invite_writer_boundary` и
      `20260729233000_identity_activation_locator` и
      `20260730010000_identity_owner_invite_hold_outbox` и
      `20260730020000_shared_beta_admission_provenance` и
      `20260730030000_identity_mail_outbox_pending_enum_expand` и
      `20260730040000_shared_beta_runtime_release_activation` и
      `20260731010000_identity_mail_delivery_status_expand` и
      `20260731020000_initial_owner_mail_delivery_boundary` и
      `20260731090000_guest_game_case_reward_lifecycle` и
      `20260731110000_guest_game_case_reward_contract` и
      `20260731120000_identity_mail_delivery_release_head`; они не изменили
      protected `StaffTask*` relations.
- [ ] Для `CURRENT_179` выпущен новый authority envelope с отдельным
      nonce-bound binding, DB marker повторно заменён и admission schema `v2`
      завершился exit `0`; reuse expand marker запрещён. Исторический
      `CURRENT_166` envelope/marker не разрешает `CURRENT_179` и не может быть
      переименован или повторно использован.
- [ ] Staff task integrity inventory выполнен на восстановленном snapshot:
      `blockingTotal=0`; каждый review reason code имеет owner/решение.
- [ ] Aggregate reconciliation planner выполнен на том же snapshot,
      release SHA и thresholds; schema-first gate равен
      `CURRENT_179`, `migrationCount=179`, latest
      `20260731120000_identity_mail_delivery_release_head`, `unfinished=0`,
      `14 composite exact`, `14 simple exact`, `0 expected-FK mismatch`,
      `0 unexpected protected FK`, `5 indexes exact`, `0 index mismatch`;
      actionable cap не превышен.
- [ ] Ожидаемое имя БД связано с target и совпало с фактическим
      `current_database()` (`databaseIdentityMatched=true`); ни одно имя БД не
      попало в report/evidence.
- [ ] Evidence содержит domain-separated HMAC `databaseIdentityDigest`,
      привязанный к database name, PostgreSQL `system_identifier` и database
      OID без вывода raw identity.
- [ ] HMAC `databaseIdentityDigest` и report integrity не используются как
      authority или provenance; production-like report считается
      same-process/non-transferable evidence и связан с отдельным защищённым
      подписанным manifest.
- [ ] Planner evidence содержит `8 proposal + 29 operator + 6 review`;
      `TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID` классифицирован как `BLOCKING`.
- [ ] Planner proposal не используется как authorization, а `contentDigest` и
      `executionDigest` — как row-level checksum или CAS token.
- [ ] SYNTHETIC proposal dry-run evidence не засчитывается как production-like
      reconciliation: exact database name и `synthetic:` reference являются
      доверенной декларацией harness/operator, а не provenance proof или Gate
      2 evidence; standalone target запрещён; для production-like необходимы
      отдельные protected row evidence, approval, locks/recheck, audit и
      rollback.
- [ ] Template/Rule/Task/Run inventory evidence содержит только aggregate
      counts и alias `Tenant A / Store A1..A4`, без production ID.
- [ ] Public/QR/Telegram links проинвентаризированы.
- [ ] План slug/domain rename и redirect/alias утверждён.

## C. Operational demo separation

- [ ] Anonymous operational B2B endpoints отвечают `401`.
- [ ] Fixed fallback на operational `demo` отсутствует.
- [ ] Если нужен public demo, он создан отдельно как synthetic tenant.
- [ ] Public demo не содержит PII, integration IDs, real revenue/cost/stock.
- [ ] Heavy public projections имеют pagination/rate limit.

## D. Users, roles и invitations

- [ ] Active/inactive user counts по role сохранены.
- [ ] Каждый active user классифицирован как `NETWORK` или непустой `STORES`.
- [ ] Unresolved active users count равен `0`.
- [ ] NETWORK users утверждены OWNER.
- [ ] Club managers имеют только ожидаемые Store.
- [ ] Platform Admin среди tenant users отсутствует.
- [ ] Pending invites классифицированы либо отозваны.
- [ ] Legacy/known QA credentials отозваны; sessions rotated/revoked.
- [ ] OWNER, network manager, club manager и employee acceptance пройдены.

## E. Data и integrations

- [ ] Backup непосредственно перед изменением успешен.
- [ ] Restore rehearsal в отдельную БД успешен; RPO/RTO записаны.
- [ ] Admission использовал отдельную `LOGIN NOINHERIT` роль с table-level
      `SELECT` ровно на восьми разрешённых relations и column-level `SELECT`
      только на
      `User(id, tenantId, isPlatformAdmin, isActive, accessScope)`; это девять
      логических relations без table-wide `User SELECT`; отсутствуют
      write/DDL/TEMP, membership, ownership и лишние privileges.
- [ ] Negative ACL gates отклонили отсутствующий grant, лишние User columns,
      table-wide `User SELECT`, table/column grant option, `PUBLIC SELECT`,
      запрещённые DML/DDL/TEMP/membership/ownership и физически
      переименованный authority column.
- [ ] Exact Git blob manifest подтвердил ordered names/checksums 156
      migrations до EXPAND и 162 после него; FK enforcement triggers,
      artifact digest, opaque approval, verified Ed25519 authority, database
      marker, freshness, exact runtime blob content, isolation, no-egress и
      cleanup evidence подтверждены.
- [ ] Schema-only EXPAND rehearsal успешен с timeout/lock evidence.
- [ ] Populated PostgreSQL 16 rehearsal применил migration `164` поверх
      existing migration `163` tenant/report-run/bonus-ledger rows, подтвердил
      backfill/data preservation/defaults и атомарный rollback при
      `lock_timeout`.
      Candidate уже подключён к CI и дополнительно проверяет три SQLSTATE
      `55000`, late-DDL rollback и повторный deploy; checkbox остаётся пустым
      до remote PostgreSQL 16 PASS exact candidate.
- [ ] EXPAND rehearsal начинается с populated legacy baseline 156 и применяет
      ровно шесть migration `157..162`; пять concurrent indexes строятся на
      заполненных parent-таблицах.
- [ ] Все пять StaffTask parent indexes существуют в ожидаемой schema,
      unique/valid/ready и имеют точный порядок `(tenantId, id)`.
- [ ] Все 14 same-tenant StaffTask catalog FK присутствуют как `NOT VALID` и
      уже отклоняют новые invalid writes.
- [ ] Одиннадцать paired legacy non-Store FK swap/re-add’ены как `NOT VALID`:
      прежние delete actions сохранены, `ON UPDATE RESTRICT` подтверждён.
- [ ] Три legacy Store FK под прежними именами существуют как temporary
      simple `RESTRICT/RESTRICT NOT VALID`; прежняя `SET NULL` семантика
      отсутствует.
- [ ] Каталог содержит ровно 14 composite + 14 simple compatibility
      `NOT VALID` FK.
- [ ] Все 14 legacy invalid rows после EXPAND проходят benign non-FK update;
      migration не замораживает их до reconciliation.
- [ ] Три temporary Store FK блокируют удаление Store даже для legacy
      cross-tenant row и не допускают dangling `storeId`.
- [ ] Production-like StaffTask inventory имеет `blockingTotal=0`; выполнены
      отдельные reconciliation dry-run, explicit apply и zero-diff dry-run.
- [ ] Planner использовал одно соединение и одну
      `READ ONLY REPEATABLE READ` transaction; exact target/confirmation,
      production attestation, 40-hex SHA, expected database binding и HMAC
      contract подтверждены.
- [ ] Planner output aggregate-only: UUID, row identifiers, database names,
      URL, credentials и PII отсутствуют.
- [ ] Planner exit contract `0/1/2/3` и actionable cap проверены; review-only
      occurrences не расходуют cap.
- [ ] `summary.inventoryExecuted === schema.ready`; любое противоречие
      отклонено как safety-contract error/exit `1`.
- [ ] Row-level reconciliation имела отдельные protected evidence,
      authorization, locks/recheck, audit и rollback; `contentDigest`/
      `executionDigest` не использовались вместо них.
- [ ] Synthetic rehearsal proposal dry-run привязан к exact
      `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`, exact-name/ref
      `SYNTHETIC EXPAND_162` disposable harness contract и read-only
      transaction; output содержит cases только для 8 proposal-кодов, а 29
      operator + 6 review остаются aggregate-only. Synthetic classification
      является доверенной декларацией harness/operator, не provenance proof.
- [ ] Synthetic PostgreSQL 16.13 fixture matrix прошла `23` scenarios и
      покрыла все `8` proposal codes, `8` occurrences, `7` cases и coalescing
      двух last-task причин в один case; exact aggregate/reason parity,
      cap/privacy/unlinkability и отсутствие raw identity/canary подтверждены.
- [ ] Source data после synthetic smoke не изменились; временная cluster ACL
      mutation восстановлена, disposable database/role удалены.
- [ ] `contentDigest` стабилен для одинакового aggregate content, а
      `executionDigest` меняется вместе с snapshot `generatedAt`; смена БД или
      PostgreSQL cluster меняет `databaseIdentityDigest` и оба evidence digest.
- [ ] Adversarial catalog smoke на disposable local/CI clone сохранил все 28
      expected FK, отдельно отклонил дополнительный конфликтующий FK с другим
      именем и неверный порядок колонок parent index с
      `SCHEMA_MISMATCH`/exit `3`; inventory не запускался, source database не
      изменялась, clone удалён.
- [ ] URL с `schema=pg_catalog` прочитал migration state только из
      `public._prisma_migrations`, вернул `SCHEMA_MISMATCH`/exit `3` и не
      запустил inventory.
- [ ] Все 14 same-tenant FK валидированы отдельным управляемым шагом;
      `convalidated=true` подтверждён по каждому constraint.
- [ ] Prisma schema содержит `onUpdate: Restrict` для 11 simple non-Store
      relations; exact destructive diff содержит только 11 non-Store
      composite + три simple Store FK, а unrelated ADD/index-rename drift
      классифицирован отдельно.
- [ ] Staged smoke получил `prismaDriftDrops=14` через
      `--from-schema-datasource` и scoped env; database URL/пароль отсутствуют
      в argv.
- [ ] Операционный `NOT VALID`/coexistence contract всех 14 simple FK сверён с
      `staff-task-integrity-expand-runbook.md`, хотя Prisma не отражает
      `convalidated`.
- [ ] Offline self-test/future-migration guard защищает все 28 DB-native FK от
      DROP/RENAME/ALTER, `DROP NOT NULL` contract-колонок, trigger/
      `session_replication_role` bypass и запрещает destructive table/column
      DDL, DROP/ALTER пяти parent indexes, DROP SCHEMA и неожиданные migration
      directory names.
- [ ] Exact artifact guard подтвердил пять one-statement
      `CREATE UNIQUE INDEX CONCURRENTLY` migrations `157..161` и финальную
      migration `162` с transaction/timeouts/lock order/`28 ADD + 14 DROP +
28 NOT VALID`.
- [ ] Migration создана create-only и прошла ручной SQL review.
- [ ] Пять parent UUID update и пять parent `tenantId` move сценариев
      отклонены; identifiers и tenant ownership immutable.
- [ ] `prisma db push` не используется; N-1 rollback не запускает старый seed
      или identifier updates.
- [ ] Физическое удаление Store блокируется при store-bound
      Task/Template/Rule; штатный путь — deactivate/archive.
- [ ] `_prisma_migrations` без pending/failed/unfinished rows.
- [ ] Langame domains и четыре store mappings сверены.
- [ ] Initial sync/backfill и freshness checks готовы.
- [ ] SKU, stock, operations и revenue control totals сохранены.
- [ ] Guest identity/reward/ledger reconciliation не имеет unresolved P0.

## F. Module acceptance

- [ ] `OPEN_BETA_FULL_OPERATIONS_V1` подготовлен.
- [ ] Gamification — admin, guest, Telegram, ledger и store canary.
- [ ] Assortment — catalog, facts, imports, reports и exports, 4/4 stores.
- [ ] Staff — control, ratings, motivation, tasks, regulations, KB, training,
      discipline и salary planning.
- [ ] Staff recurring actor path — sparse PATCH, Store timezone, pause/revoke и
      Template/Store/participant race acceptance пройдены; background выключен.
- [ ] Staff recurring legacy integrity — scanner exit `0`,
      `blockingTotal=0`, review findings приняты; stale `STARTED` и
      repeated-`FAILED` разобраны.
- [ ] Staff reconciliation planner — exit `0`, schema ready, cap соблюдён;
      proposal/operator decisions завершены отдельным approved workflow.
- [ ] Staff SYNTHETIC proposal dry-run — disposable PostgreSQL 16.13 smoke
      `23 scenarios`, все `8` proposal codes/`8` occurrences/`7` cases и
      двухпричинный last-task coalescing подтверждены; это не provenance
      proof, production-like evidence или apply authorization.
- [ ] Communications — chat, mentions, receipts, notifications, contact tasks.
- [ ] Users/roles — delegation, revoke и scope работают сразу.
- [ ] Attachments `ENFORCED`; inventory/backfill/reconciliation zero-diff.
- [ ] Marketing/full CRM/billing/public registration deny проверен.

## G. Operations

- [ ] Accepted artifact, migration apply и production runtime environment
      обновляются одной release-операцией:
      `EXPECTED_DATABASE_MIGRATION=20260731120000_identity_mail_delivery_release_head`
      и `EXPECTED_DATABASE_MIGRATION_COUNT=179`; старые значения не допускаются
      после apply.
- [ ] `/health/live`, `/health/ready`, `/version` проверены внешним probe.
- [ ] Migration identity/count подтверждены именно через `/health/ready`;
      legacy `/health` считается только liveness и не принимается как
      доказательство совместимости release с БД.
- [ ] Scheduler owner единственный; heartbeat/reclaim проверены.
- [ ] Langame timeout/retry/reconciliation envelope включён.
- [ ] Structured logs/request ID/tenant/source/SHA доступны оператору.
- [ ] Alerts дошли ответственному тестовым событием.
- [ ] N-1 либо fix-forward strategy доказана.
- [ ] Failed-readiness rollback drill успешен.
- [ ] Support owner, incident channel и on-call contacts назначены вне git.

## H. Dry-run и cutover

- [ ] Reviewed Ed25519 root enrollment, protected signer/acquisition и оба
      production-like admission checkpoints выполнены отдельным решением до
      inventory/planner.
- [ ] Production-like inventory/planner, row dry-run, explicit apply,
      rollback и zero-diff имеют отдельные evidence records и отдельные
      approvals; ни один предыдущий `GO` не переносится на следующий шаг.
- [ ] Dry-run не изменил production state.
- [ ] Перед apply migration `164` старый API/worker release переведён в
      controlled drain: scheduled HTTP, internal schedulers и bonus dispatch
      выключены; живые `PROCESSING/DISPATCHING` завершены либо помещены в
      reconciliation quarantine. После подтверждённого zero in-flight
      выполнены migrate + restart exact candidate, поэтому ни один worker
      старой версии не может выполнить effect после schema upgrade.
- [ ] Database preflight migration `164` самостоятельно подтвердил отсутствие
      `RUNNING` report digest и `PROCESSING/DISPATCHING` bonus-ledger rows;
      negative rehearsal получила SQLSTATE `55000` и доказала отсутствие
      partial DDL/data changes.
- [ ] Для EXPAND, `VALIDATE`, `CONTRACT`, deployment и `SHADOW → ENFORCED`
      сохранены отдельные phase approvals; ни один из них не разрешает cutover.
- [ ] Schema EXPAND применена и проверена.
- [ ] StaffTask catalog revision равна
      `20260727131000_staff_task_integrity_expand`; все 28 FK прошли
      post-apply catalog check.
- [ ] Pre-CONTRACT evidence подтверждает все 14 simple compatibility
      `NOT VALID` FK и зелёный 28-FK guard.
- [ ] Отдельный CONTRACT после N-1 window удалил ровно 14 simple FK и перевёл
      guard manifest на 14 surviving composite FK.
- [ ] Accounts/invites классифицированы.
- [ ] Strict application candidate активирован по плану.
- [ ] Модули переведены `SHADOW → ENFORCED` только при zero mismatch.
- [ ] Контрольные counts/checksums до cutover сохранены.
- [ ] Все pre-cutover условия `Gate 2A` выполнены и отдельный explicit
      `CUTOVER GO` с approver/change window сохранён до первой
      cutover-specific mutation.
- [ ] Application writes/jobs остановлены либо совместимы с фазой.
- [ ] Operational tenant переименован без смены `tenantId`.
- [ ] Public links/QR/Telegram проверены после rename.
- [ ] Контрольные counts/totals после cutover совпадают.
- [ ] Post-deploy browser/API/file/job smoke зелёный.
- [ ] Cutover evidence принято; начато отдельное семидневное internal-alpha
      окно для завершения Gate 2.

## I. Internal alpha и решение о внешнем pilot

Этот cutover относится только к существующему
`Tenant A/Store A1..A4`. Первый внешний клуб создаётся отдельно как
`Tenant B/Store B1` и получает согласованный scope: геймификация,
ассортимент/товары, сотрудники целиком, коммуникации, users/roles
и integrations только внутри своей сети. До отдельного protected
`SHARED BETA GO` этот доступ остаётся `EXTERNAL_PILOT_NO-GO`.

- [ ] Семь последовательных дней без launch-blocking P0/P1 incident.
- [ ] Нет cross-tenant/store/PII incident.
- [ ] Scheduled sync success ≥98%, freshness ≤24h.
- [ ] Revenue/operations divergence ≤1% либо исключение утверждено.
- [ ] Нет lost sync, duplicate reward или unresolved critical alert.
- [ ] Feedback и incidents привязаны к release SHA.
- [ ] Все условия Gate 2 завершены; итоговое решение `GO/NO-GO` на первый
      внешний invite-only pilot, дата и approver сохранены в release evidence.

## Stop conditions

Cutover немедленно останавливается при cross-scope выдаче, unknown active scope,
несовпадении tenant/store topology, повреждении totals, failed backup/restore,
неожиданном migration lock, недоступном rollback, attachment mismatch,
необъяснимом reward/ledger расхождении, отклонении exact Prisma drift,
ошибке future-migration DDL/artifact guard, planner schema/database identity
mismatch, catalog mismatch/cap exceeded, попытке считать proposal,
`contentDigest` или `executionDigest` разрешением на apply либо недоставленном
critical alert, а также попытке запустить SYNTHETIC proposal dry-run на
standalone/production-like target, выдать operator-declared `SYNTHETIC`
classification за provenance/Gate 2 evidence, принять HMAC как authority,
передать production-like report как самостоятельное transferable evidence
либо продолжить production-like шаг при пустом/unverified Ed25519 root,
marker/freshness/blob mismatch.

## Changelog

- `1.24.6`, 02.08.2026 — добавлен owner-only CURRENT184 lost-response replay
  candidate с exact SQL SHA
  `d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424`.
  Provider marker и completion получили event-backed exact DB-RPC replay;
  typed `HANDOFF` блокирует SMTP для устаревшего marker. Runtime/role/grants,
  signed coordinator, production apply и внешний доступ не включены;
  canonical target остаётся `CURRENT_179/179`.
- `1.24.5`, 02.08.2026 — revised CURRENT181/182 и новый CURRENT183 stack принят
  на exact `7fb3cf966d5c612f0f2504f4545151ef3edb8ac9`, GitHub Actions
  [`30720288891`](https://github.com/boozik3412/leetplus/actions/runs/30720288891)
  (`run #79`) — `3/3 PASS`. Disposable PostgreSQL suite принял непустую
  `ACTIVE|DRAINING × HOLD|PENDING` matrix, свежий post-lock snapshot,
  least-privilege exact-five-RPC role, progress второго tenant и zero
  `40P01`. Owner-seeded diagnostic fixtures не являются signed coordinator,
  production authority, deploy либо external-access evidence; canonical
  production target остаётся `CURRENT_179/179`.
- `1.24.2`, 01.08.2026 — реализован CURRENT179-compatible tenant-first
  protocol для application invite/claim paths, provisioning и suspend;
  tenant-addressed worker v1 RPC используют тот же lock, а outbox-only
  mark/complete требуют DB-derived process-local claim binding. Добавлен
  dormant CURRENT182 SQL candidate
  `4367c2c50b036ae21c22b88dc0980895c9010abb018c3f7a04d58ed0f00efa22`
  с пятью tenant-first claim entrypoint и тремя fail-closed legacy stubs.
  Локально foundation/smoke self-tests, API unit/static/typecheck и full
  regression зелёные; real PostgreSQL CI, DB-enforced worker v2,
  non-empty outbox/ACTIVE-DRAINING matrix и production promotion остаются
  отдельными незакрытыми gates.
- `1.24.1`, 01.08.2026 — exact implementation CURRENT181
  `abbfe5611b7bf10b223359d601b4665874493671` принят GitHub Actions
  [`30698074036`](https://github.com/boozik3412/leetplus/actions/runs/30698074036)
  (`run #66`) — `3/3 PASS`, включая полный PostgreSQL stack runner.
  Candidate и canonical target не изменены: `CURRENT181` остаётся
  `NOT_DEPLOYABLE`, фактическая schema — `CURRENT_179/179`; найденные P1/P2,
  production deploy, cutover и external pilot остаются `NO-GO`.
- `1.24.0`, 01.08.2026 — добавлен owner-only stacked `CURRENT181` rehearsal
  `20260801020000_identity_mail_tenant_lock_drain_worker_v2`, SQL SHA-256
  `b78b40ce37f48419c8d9e4f6ad8a90ddb9a242128a33d7dbfa76d8439ba0f455`:
  tenant advisory lock, worker/reconcile v2, claim authority evidence,
  tenant-leading indexes и immediate legacy producer stubs. Static
  `81/81`, self-test `7`, PostgreSQL 16.13 catalog/ACL/race/timeout/rollback/
  cleanup rehearsal — `PASS`; source сохранён `CURRENT_179/179`, residue —
  `0`. Candidate остаётся `NOT_CANONICAL / NOT_DEPLOYABLE`; API v2,
  acceptance/cancel/revoke/reissue tenant lock, cross-path race matrix,
  provider mark/complete replay, producer/activation/coordinators,
  grants/runtime attestation,
  production-like rehearsal, cutover и external pilot остаются `NO-GO`.
- `1.23.0`, 01.08.2026 — зафиксирован неканонический
  `CURRENT180` candidate
  `20260801010000_identity_mail_tenant_enrollment_control_plane`, SQL SHA-256
  `e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683`:
  `DORMANT_SCHEMA_ONLY / NOT_DEPLOYABLE`, static
  `81/81`, `21` probes, `COMPLIANT`; два независимых PostgreSQL 16.13
  smoke — `PASS`, source zero-diff/cleanup подтверждены, review
  P0/P1/P2=`0/0/0`. Canonical target сохранён `CURRENT_179/179`;
  historical 004J evidence не изменено, cutover и external pilot остаются
  `NO-GO`.
- `1.22.0`, 30.07.2026 — living cutover target синхронизирован с terminal
  local candidate `CURRENT_179` (`163..179`, latest
  `20260731120000_identity_mail_delivery_release_head`). Зафиксированы terminal
  SHA `c394060fb...`, manifest `179` `333018542...`, three-history rehearsal
  `PASS`, tamper matrix `1/1/1/1/1`, post-terminal pre-176 checksum drift
  rejection `55000/effects 0` и cleanup residue `0`. Exact-SHA CI,
  production-like admission, deploy/restart/drain, cutover и внешний доступ
  остаются unchecked `NO-GO`; historical evidence не переписано.
- `1.20.0`, 29.07.2026 — current cutover target синхронизирован с
  `CURRENT_170` (`163..170`, latest
  `20260729233000_identity_activation_locator`). Локальный PostgreSQL 16
  candidate подтверждён, но exact-head CI/review, production-like admission,
  cutover и внешний доступ остаются unchecked `NO-GO`.
- `1.21.0`, 29.07.2026 — engineering exact-head `CURRENT_170`
  `8dfe219...` / CI `30493779099` (`run #47`) и independent review приняты;
  production-like admission, cutover и внешний доступ остаются unchecked
  `NO-GO`.
- `1.19.1`, 29.07.2026 — engineering exact-head `CURRENT_169`
  `f5d39fd89145c995c51e7005698327f5581a5cd8` принят GitHub CI
  `30467882578` (`run #37`), `3/3 PASS`, и independent review без новых
  P0/P1. Initial candidate `f9db264...` / CI `30467211571` сохранён как
  `REJECTED`, `2/3 PASS`; historical User projection исправлен и повторный
  PostgreSQL 16 rehearsal прошёл. Production-like admission, cutover и внешний
  доступ остаются unchecked `NO-GO`.
- `1.19.0`, 29.07.2026 — current cutover target синхронизирован с
  `CURRENT_169` (`163..169`, latest
  `20260729230000_identity_invite_writer_boundary`). Local engineering
  evidence зафиксировано только как prerequisite; exact-head CI/review,
  production-like admission, cutover и внешний доступ остаются unchecked
  `NO-GO`.
- `1.18.0`, 29.07.2026 — единая retroactive evidence correction:
  schema target — `CURRENT_166`; previous accepted PR-head-associated merge-ref
  baseline —
  `bbef153a288bfdf1c3573eb704f27c013cc0e856`, CI `30443837684`
  (`run #23`), не exact-SHA evidence. Application `90549245276`, Authority
  checks `90549245284` и PostgreSQL `90549245372` — `3/3 PASS`; Authority
  job не выполнял root enrollment, roots `{}`. PostgreSQL подтвердил
  `immutableMutationsRejected=7` и
  `finalStateAndEvidenceUnchanged=true`. Legacy quarantine
  delivery-row/lifecycle freeze закрывает один из исходных четырёх P1.
  Rejected `6a69cd8...` / run #26 / PG job `90553255161` сохраняется как
  `FAILED`; `a644b81...` / CI `30447011917` (`run #27`) — `REJECTED`, `2/3
  PASS`. Previous accepted exact-head `d525b736...` / CI `30447467729` (`run
  #28`) — `3/3 PASS`; он закрыл final-row reason/Event integrity и worker
  boundary-only durable event write. Last accepted exact-head
  `be8c94c4...` / CI `30449026506` (`run #29`) — `3/3 PASS`; private
  SECURITY INVOKER lock boundary и двухсессионный rehearsal закрыли
  lock-order/deadlock/`40P01`. Все четыре исходных engineering
  provider-write P1 закрыты.
  PostgreSQL major `16` structured evidence включает
  `committedTransitions=4`, `runtimeBoundaryNegatives=9`,
  `privateSecurityInvokerLockBoundaries=1`,
  `rawDeadlockOrLockTimeoutErrors=0`, `holderAndWaiterCommitted=true`,
  `stateAndEvidenceUnchanged=true`,
  `sourceDatabaseMigrationsApplied=0`, неизменное source migration state и
  отсутствие изменений source application data. Actual non-owner runtime/app
  role и explicit `EXECUTE` grant/admission, bounded audited
  retention, production-like admission, apply/deploy, cutover, provider
  writes, owner invite и внешний тест остаются `NO-GO`.
- `1.17.0`, 29.07.2026 — exact-SHA engineering evidence `CURRENT_166`
  принято на
  `c1fee42cc0d85a2c2d1acb354ff5198280bc4ecc`, GitHub CI
  `30442286822` (`run #20`): все три job `PASS`, PostgreSQL major `16`,
  clean/populated `165 → 166` и все восемь collision fixtures зелёные.
  Четыре P1 provider-write blockers, production-like admission, apply/deploy,
  cutover, owner invite и внешний тест остаются `NO-GO`.
- `1.16.0`, 29.07.2026 — independent migration `166` review не нашёл
  P0-блокера для inert schema, но зафиксировал четыре P1 до provider
  activation: lock order/deadlock rehearsal, final-row reason/evidence
  consistency, legacy-quarantine recovery и procedure-only event writes.
  Remote PostgreSQL/CI и сами P1 остаются `NO-GO`.
- `1.15.0`, 29.07.2026 — cutover target переведён на implementation candidate
  `CURRENT_166` (`migrationCount=166`, latest
  `20260729160000_guest_game_delivery_claim_fence`). Remote exact-SHA,
  populated `165 → 166`, production-like admission и effect-capable
  coordinator остаются pending; статус `NO-GO`.
- `1.14.0`, 29.07.2026 — remote `CURRENT_165` и populated `164 → 165`
  rehearsal приняты на `4bd6a036...` / CI `30428288353`; documentation/evidence
  successor `7c20adec...` / CI `30429463161` также зелёный. Production-like,
  backup/restore, apply/cutover и внешний доступ остаются незакрытыми.
- `1.13.0`, 29.07.2026 — перед любым production apply добавлен atomic
  release-env gate для exact migration `165`/count `165`; миграционная
  совместимость подтверждается `/health/ready`, а не legacy `/health`.
- `1.12.0`, 29.07.2026 — schema checkpoint этой исторической версии переведён в
  `CURRENT_165` (`migrationCount=165`, latest
  `20260729120000_store_background_execution_fence`). Migration `165`
  fail-closed, не активирует Store и не включает outbound; production
  apply/cutover не выполнялись.
- `1.11.0`, 28.07.2026 — в обязательный CI подключён disposable populated
  PostgreSQL 16 rehearsal migration `163 → 164`: success/data preservation,
  три zero-in-flight rejection, lock-timeout, late-DDL transactional rollback
  и idempotent deploy. Remote PASS и production-like evidence ещё pending,
  поэтому соответствующие cutover checkbox не закрыты.
- `1.10.0`, 28.07.2026 — migration `164` получила fail-closed database
  precondition для zero in-flight report/bonus effects; manual SMTP повторно
  проверяет tenant revision, active actor, capability и exact scope, а
  Langame boundary — свежий target/source/eligibility и ownership generation.
- `1.9.0`, 28.07.2026 — перед migration `164` добавлен обязательный drain
  старого API/workers и zero in-flight evidence, чтобы worker старой версии
  не выполнил SMTP/Langame effect после schema upgrade.
- `1.8.0`, 28.07.2026 — current release tail расширен exact migration `164`
  с trigger-owned tenant execution revision; frozen StaffTask evidence
  остаётся `EXPAND_162`, current envelope/marker/admission теперь
  `CURRENT_164`, `migrationCount=164`.
- `1.7.0`, 28.07.2026 — frozen StaffTask prefix/evidence оставлены на
  `EXPAND_162`; current cutover checkpoint требует exact allowlisted tail 163,
  отдельный `CURRENT_163` envelope/marker/admission и planner gate на 163
  migrations. Прежние SHA считаются historical, не current candidate evidence.
- `1.6.0`, 28.07.2026 — runtime candidate оставлен на
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`, отдельно зафиксирован local
  test-evidence commit `2341b99937e54cc50d1763a0a794d975816c72ce`.
  Public-only pre-signed pinned-path fixture без private signing material
  прошла реальный branded wrapper, marker/nonce-bound identity, expiry и
  detached-report gates; admission suite `19/19` — `LOCAL PASS`. Production
  roots остаются `EMPTY / FAIL-CLOSED`, `PRODUCTION_LIKE` и внешний beta —
  `NO-GO`, remote CI pending. Experimental Node.js 22 module mock принят как
  отдельный `P2` test-infrastructure risk. Следующий порядок:
  remote CI/review → root/signer/acquisition → отдельный `BASELINE_156`
  envelope/marker/admission → новый `EXPAND_162` envelope с новым nonce,
  marker rotation и второй admission.
- `1.5.0`, 28.07.2026 — зафиксирован verified code SHA
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`: admission schema `v2`,
  exact least-privilege доступ к восьми разрешённым relations плюс пяти
  columns `User`, independent Ed25519 verifier, database marker, freshness и
  exact runtime blob binding. PostgreSQL 16.13 smoke прошёл `23` scenarios:
  все `8` proposal codes/`8` occurrences/`7` cases, двухпричинный last-task
  coalescing, negative ACL gates, unchanged source data и restored temporary
  cluster ACL. Pinned roots намеренно пусты, HMAC не authority,
  synthetic name/ref — operator/harness declaration, а production-like report
  same-process/non-transferable; production-like admission, inventory/planner,
  row dry-run, apply/rollback/zero-diff и cutover четырёх `Store` одного
  `Tenant` остаются отдельными `NO-GO` этапами.
- `1.4.0`, 27.07.2026 — добавлен exact SYNTHETIC proposal dry-run checkpoint
  `dee25393ae7bff171bdd74a49f2d01cdef9ce4ee`: read-only signed-harness
  boundary, 8 proposal-кодов, aggregate-only 29 operator + 6 review, self-test
  20, unit 14/14 и PostgreSQL major `16` smoke 14 scenarios. Покрыт один positive
  PG predicate; оставшиеся 7 + coalescing — P1. Production-like/standalone,
  apply, `VALIDATE`, `CONTRACT`, deploy и внешний beta остаются `NO-GO`.
- `1.3.0`, 27.07.2026 — добавлен обязательный snapshot admission checkpoint
  `7d67333b22f171c6e79f723190647cdd2454b128`: PostgreSQL 16, exact Git blob
  `BASELINE_156 → 6 migrations → EXPAND_162`, девять SELECT-only relations,
  privilege/trigger/tamper/privacy/cleanup guards. Локально прошли 16 unit,
  34 offline smoke и 9 real PostgreSQL scenarios; production-like admission,
  remote CI и внешний beta остаются `NO-GO`.
- `1.2.0`, 27.07.2026 — planner gate расширен до exact schema/catalog и
  скрытой expected/actual database identity binding; evidence разделена на
  стабильный `contentDigest` и timestamp-bound `executionDigest`; добавлен
  adversarial disposable-clone smoke для неверного FK/index contract и exact
  EXPAND artifact guard. Apply/authorization отсутствуют, внешний beta
  остаётся `NO-GO`.
- `1.1.0`, 27.07.2026 — добавлены aggregate reconciliation planner gate,
  classification `8 + 29 + 6`, schema contract,
  non-authorization HMAC/proposal rules и populated baseline
  `156 → 157..162` rehearsal; cutover и внешний beta остаются `NO-GO`.
