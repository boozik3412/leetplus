# LeetPlus open beta: пакет запуска

| Поле             | Значение                                     |
| ---------------- | -------------------------------------------- |
| Статус           | Active implementation package                |
| Версия           | 1.37                                         |
| Дата             | 29.07.2026                                   |
| Release decision | `NO-GO`; shared beta только после Gate 1MT/2 |
| Владелец         | LeetPlus product / engineering / operations  |

Этот каталог — навигационная точка для перевода текущей сети из demo-режима в
полноценную работу и последующего invite-only теста с внешними сетями. Он не
разрешает deployment, миграцию production-данных или выдачу доступа сам по
себе.

Основной путь первого внешнего клуба — `SHARED_MULTI_TENANT_BETA`: новый
`Tenant B/Store B1` в общем web/API/workers/PostgreSQL/Telegram data plane.
Доступ остаётся `NO-GO` до Gate 1MT, Gate 2 и отдельного protected
`SHARED BETA GO`. Отдельный runtime/DB сохранён только как contingency или
enterprise-isolation option и не сокращает shared gates.

## Зафиксированные решения

- четыре текущих клуба — четыре `Store` одной сети внутри одного существующего
  `Tenant`;
- текущий `tenantId` сохраняется, данные четырёх `Store` остаются внутри одного
  `Tenant` и не разделяются на четыре tenant;
- operational tenant перестаёт быть anonymous demo до переименования;
- независимая внешняя сеть всегда получает отдельный `Tenant`;
- первый внешний клуб получает новый `Tenant B` и `Store B1` в общем data
  plane; current `Tenant A/A1..A4` не меняется и не копируется;
- shared web, API, workers, PostgreSQL и Telegram являются целевой topology;
- OWNER получает email-bound invite, а затем управляет пользователями,
  ролями, клубами и интеграциями только своей сети;
- все external effects и unattended jobs по умолчанию `OFF` и включаются
  только после отдельных evidence и `GO`;
- первая внешняя когорта подключается только вручную и по приглашениям;
- состав доступа задаёт
  [shared beta profile](./shared-multi-tenant-beta-profile.md);
- tenant user работает только внутри своего tenant и persisted
  `NETWORK | STORES` scope;
- production-изменения выполняются только после exact candidate SHA, CI,
  backup/restore, canary и явного решения `GO`.

## Канонические документы

1. [Специальный launch backlog](../../OPEN_BETA_BACKLOG.md) — приоритеты,
   зависимости, Gate 0–3, метрики и последовательность разработки.
2. [Shared multi-tenant beta profile](./shared-multi-tenant-beta-profile.md) —
   целевая topology, полный module scope, IAM и integrations contract.
3. [Shared multi-tenant launch checklist](./shared-multi-tenant-launch-checklist.md) —
   Gate 1MT/Gate 2, owner invite, day-0, first-club cycle и offboarding.
4. [Профиль доступа первой когорты](./pilot-access-profile.md) — продуктовый
   состав и нормативные access rules.
5. [Профиль optional isolated design partner](./single-design-partner-access-profile.md)
   и
   [его launch checklist](./single-design-partner-launch-checklist.md) —
   contingency/enterprise-isolation lane, не основной launch path.
   [PostgreSQL runtime-role contract](./design-partner-database-role-contract.md) —
   bounded real-PostgreSQL evidence для разделения migration/provisioning и
   restricted runtime identity.
6. [Intake isolated design partner](./single-design-partner-intake.md) —
   какие несекретные данные нужны для Tenant D/Store D1 и что передаётся
   только защищённым каналом.
7. [Cutover-чеклист текущей сети](./current-network-cutover-checklist.md) —
   безопасный перевод одного tenant с четырьмя Store.
8. [AccessScope package](../security/access-scope/README.md) — нормативная
   server-side модель tenant/store authority, rollout и rollback.
9. [Матрица внедрения](../security/access-scope/v1/module-adoption-matrix.md) —
   фактический статус поверхностей.
10. [Стратегия тестирования](../security/access-scope/v1/test-strategy.md) —
    обязательные positive/negative topology-сценарии.
11. [Attachment ACL rollout](../security/access-scope/v1/attachment-acl-rollout.md)
    и
    [implementation checkpoint](../security/access-scope/v1/attachment-acl-implementation-checkpoint.md).
12. [План templates/recurring tasks](../security/access-scope/v1/staff-task-catalog-adoption-plan.md) —
    подтверждённые same-tenant cross-store разрывы и следующий implementation
    slice.
13. [Checkpoint task catalog](../security/access-scope/v1/staff-task-catalog-implementation-checkpoint.md) —
    фактический template/materializer/audit candidate, проверки и остаточные
    блокеры recurring/scheduler.
14. [Checkpoint recurring actor HTTP](../security/access-scope/v1/staff-task-recurring-http-implementation-checkpoint.md) —
    scoped Rule CRUD/manual/interactive due candidate и явная изоляция
    scheduler/all-tenant execution.
15. [Runbook integrity inventory staff tasks](../security/access-scope/v1/staff-task-integrity-inventory-runbook.md) —
    guarded read-only проверка legacy Template/Rule/Task/Run перед
    same-tenant EXPAND/VALIDATE.
16. [Runbook StaffTask integrity EXPAND](../security/access-scope/v1/staff-task-integrity-expand-runbook.md) —
    пять concurrent parent indexes, 14 composite + 14 simple compatibility
    `NOT VALID` FK, archive-first/global-existence Store protection, immutable
    parent IDs и порядок дальнейших `VALIDATE/CONTRACT`.
17. [Runbook aggregate reconciliation plan](../security/access-scope/v1/staff-task-integrity-reconciliation-plan-runbook.md) —
    read-only классификация `8 proposal + 29 operator + 6 review`, exact
    schema-first gate, actionable cap, `contentDigest`/`executionDigest` и
    exits `0/1/2/3`.
18. [Runbook admission StaffTask snapshot](../security/access-scope/v1/staff-task-integrity-snapshot-admission-runbook.md) —
    обязательный fail-closed checkpoint перед production-like inventory и
    planner: PostgreSQL 16, frozen `BASELINE_156 | EXPAND_162`, current
    implementation candidate `CURRENT_170`, release manifest, catalog и
    отдельная SELECT-only роль.
    18a. [Runbook production-like authority operations](../security/access-scope/v1/staff-task-integrity-snapshot-authority-operations.md) —
    strict acquisition evidence, public-root lifecycle и detached Ed25519
    ceremony без private-key path внутри LeetPlus.
19. [Runbook SYNTHETIC reconciliation proposal dry-run](../security/access-scope/v1/staff-task-integrity-reconciliation-proposal-dry-run-runbook.md) —
    read-only row-evidence rehearsal только для подписанной disposable
    harness-БД: восемь proposal-кодов, HMAC-токены, coalescing и явный запрет
    standalone/production-like/apply.
20. [Шаблон release evidence](../security/access-scope/evidence/README.md) —
    какие обезличенные доказательства сохранять для каждого SHA.
21. [Tenant execution control-plane checkpoint](./tenant-execution-control-plane.md) —
    persisted stage/trial/profile, Platform Admin CAS, runtime admission,
    shared provisioning/revoke candidate, owner onboarding и точный остаток
    до dedicated external activation.
22. [Background execution containment](./background-execution-containment.md) —
    authoritative registry из 17 job kinds, временный `INTERNAL` compatibility
    lane, fail-closed external deny и точные ограничения до durable fencing.
23. [Initial OWNER identity and activation](./initial-owner-identity-and-activation.md) —
    shell-only provisioning, canonical email claim, encrypted mail outbox,
    persisted release gates, activation/suspend state machine и обязательная
    concurrency/effect-fencing matrix.
24. [Migration 166 delivery claim design](./delivery-claim-migration-166-design.md) —
    typed claim-generation/lease/revision для direct и bot delivery,
    canonical Store fence, fresh consent/reward/provider revalidation,
    provider-attempt marker, durable reaper/reconciliation, old-worker cutoff
    и обязательный populated `165 → 166` rehearsal. Reviewed design уже
    переведён в implementation candidate: additive migration и fail-closed
    legacy runtime containment созданы, но coordinator, Store-scoped effect
    enforcement, production-like evidence и cutover ещё не приняты.
25. [Identity email claim foundation and sealed write boundary](./identity-email-claim-foundation.md) —
    migrations 167/168, global canonical reservation, private advisory-lock
    namespace, sealed reserve/assert/transition/release RPC и zero-DML
    runtime-role contract для shell-only provisioning.
26. [Identity invite writer boundary](./identity-invite-writer-boundary.md) —
    migration 169, persisted claim provenance, explicit revoke history,
    sealed issue/reissue/revoke/accept, direct-create/email-change fail-closed
    и точный список оставшихся activation/backfill blockers.
27. [Legacy identity inventory and future backfill](./identity-legacy-backfill.md) —
    `IDENTITY_LEGACY_RECONCILIATION_V1`, least-privilege read-only inventory,
    exact catalog/RI-trigger/system authority, PG16 PUBLIC-ACL baseline,
    high-OID/SECURITY-DEFINER/INVOKER, FDW/parameter/type guards и 22-column
    ACL, strict remote TLS/production database binding, frozen-lock/Prisma
    `6.19.3` release verification; local core self `18` + smoke self `18` +
    unit `17/17` + three-clone PostgreSQL 16 smoke `PASS`; финальный independent
    security review — `PASS` без actionable P0/P1/P2, exact-head
    `d1162eed042893ec3b27ed823bdaddfa64c7e90f` / CI
     [`30479020686`](https://github.com/boozik3412/leetplus/actions/runs/30479020686)
     (`run #39`) — `3/3 PASS`. Production-like inventory и signed
     proposal/apply/rollback остаются отдельной будущей lane.
28. [Design-partner identity writer isolation](./design-partner-identity-writer-isolation.md) —
    `DESIGN_PARTNER_IDENTITY_WRITER_ISOLATION_V1`: legacy
    `provision`/`rotate-invite` fail-closed до manifest/Prisma/БД/token,
    `status` остаётся read-only для исторических isolated fixtures, emergency
    `suspend` — narrowing-only. Local unit/boundary `23/23 PASS`, independent
    review без actionable P0/P1/P2; exact-head
    `f4224072f60507bd97f8e49440e3bda89ffe2aaa` / CI `30483184102`
    (`run #41`) — `3/3 PASS`, включая PostgreSQL 16 writer-isolation lifecycle.
29. [Invite secret transport](./invite-secret-transport.md) —
    `INVITE_SECRET_TRANSPORT_V1`: fragment-only delivery, capture/scrub до
    session/preview, fixed POST-body BFF/API, streaming/route-scoped `4 KiB`
    limits, strict Origin/JSON/token, preview projection и explicit INTERNAL
    residual. На этом historical checkpoint schema остаётся `CURRENT_169`;
    outbox, activation locator, verified OWNER delivery и production
    acceptance ещё pending.
    Implementation exact-head
    `f09383563bbcc22e11e0e67ca597360cf8996f4b` принят CI
    [`30488598755`](https://github.com/boozik3412/leetplus/actions/runs/30488598755)
    (`run #43`), `3/3 PASS`; independent review — `PASS` без actionable
    P0/P1/P2.
30. [Identity activation locator](./identity-activation-locator.md) —
    migration 170, immutable opaque workflow UUID, PII-free locked assertion,
    exact seven-RPC runtime allowlist и zero table privileges. Локальный
    PostgreSQL 16 candidate подтверждён; exact-head CI/review, sealed OWNER
    issue, encrypted outbox и production admission ещё pending.

Текущий schema target рабочего кандидата — `CURRENT_170`. Локальный
disposable PostgreSQL `16.13` подтвердил clean deploy `170/170`, populated
upgrade `169 → 170`, exact seven-RPC runtime allowlist, zero
`IdentityEmailClaim` table privileges, immutable locator/PII-free receipt,
identity idempotency `100 = 1 CREATED + 99 ALREADY_RESERVED`, retained
revoked-history release и повторную same-email reservation после explicit
revoke. Full API — `101 suites / 1960 passed / 2 todo`, shell PostgreSQL
integration — `2/2`. Exact-head CI/review и release-bound inventory для
`CURRENT_170` ещё pending.

Historical engineering exact-head `CURRENT_169`
`f5d39fd89145c995c51e7005698327f5581a5cd8` принят GitHub CI
[`30467882578`](https://github.com/boozik3412/leetplus/actions/runs/30467882578)
(`run #37`), `3/3 PASS`, и independent review без новых P0/P1.

Предыдущий принятый `CURRENT_168` exact-head
`3b8228dd278fae062c753bf4301e0339ba93738b` прошёл GitHub CI
[`30460154200`](https://github.com/boozik3412/leetplus/actions/runs/30460154200),
`3/3 PASS`, и независимый review без новых P0. Он остаётся историческим
prerequisite, но не является evidence текущего candidate. Local и remote
engineering evidence не являются production-like admission, persisted GO
или production deploy. Production apply/deploy не выполнялись.

При противоречии исторического документа этому пакету действует
`OPEN_BETA_BACKLOG.md`. Изменение продуктового состава первой когорты требует
одновременного обновления backlog и `pilot-access-profile.md`.

## Текущее состояние реализации

Уже существуют неприменённые production candidates:

- tenant execution control-plane EXPAND: `SUSPENDED + PROVISIONING` default,
  stage/trial/cohort/support owner, атомарный six-module profile,
  initial `read/write=ON + outbound=OFF`, generic outbound rejection,
  только same-state profile mutation; все cross-state transitions принадлежат
  dedicated workflows,
  session/activation policy, запрет generic lifecycle mutation для каждого
  non-`INTERNAL` tenant, owner-invite onboarding transition и удалённый
  database default с `User.role`;
- shared shell-only provisioning candidate: Platform Admin service атомарно
  создаёт `PILOT/SUSPENDED/PROVISIONING/revision 1` tenant, один неактивный
  Store, OWNER override, exact six-row profile
  `read/write=ON + outbound=OFF`, canonical owner-email reservation и
  HMAC-only audit/request digest. Он не создаёт `User`, `UserInvite`, token,
  registration URL, trial, outbox или письмо. Provision controller остаётся
  закрыт с `503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING`, legacy
  initial-owner revoke route — с
  `503 SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING`;
- identity email claim candidate: migration 167 создаёт global canonical
  claim/lock namespace, migration 168 — sealed foundation, а migration 169 —
  persisted `User`/`UserInvite` claim provenance, explicit revoke history и
  sealed application issue/reissue/revoke/accept writers. Migration 170
  добавляет immutable opaque `workflowLocator` и PII-free sealed locator
  assert. Runtime candidate имеет exact семь application RPC и zero effective
  `IdentityEmailClaim` table privileges; identity allowlist использует
  `reserve_v2/assert_v1/assert_invite_locator_v1/transition_v2/release_v2`.
  Local PostgreSQL `16.13` evidence: clean `170/170`, populated `169 → 170`,
  identity `1/99`, locator/ACL/rollback checks,
  revoked-history/re-reservation и shell `2/2`; full API —
  `101 suites / 1960 passed / 2 todo`. Production startup-validation candidate
  требует отдельный fingerprint HMAC key version `v1`, запрещает reuse и
  включён в CI environment contract; до deploy нужно настроить отдельное
  production значение. Exact-head CI/review и release-bound inventory для
  locator, sealed issue-by-locator, admitted legacy provenance backfill,
  encrypted outbox/verified delivery и persisted GO ещё pending.
  Design-partner identity writer boundary принята как engineering checkpoint:
  legacy `provision`/`rotate-invite` fail-closed до manifest/Prisma/БД/token;
  на том historical `CURRENT_169` schema, six-RPC allowlist и shared admin
  route не изменялись. Exact-head
  `f4224072f60507bd97f8e49440e3bda89ffe2aaa`, PostgreSQL 16 и independent
  review приняты; production-like admission и activation остаются pending;
- accepted invite secret transport engineering checkpoint: canonical URL
  использует только
  `/register#invite=<43-char base64url>`, fragment удаляется до первого
  session/preview request, legacy token-path/query fallback отсутствует,
  fixed POST BFF/API имеют bounded body, strict request/token checks,
  allowlisted preview и private no-store responses. Для `INTERNAL` generic
  create/reissue всё ещё возвращает fragment-only `registrationUrl`
  авторизованному actor/UI; external generic workflow закрыт, обе shared-beta
  admin route остаются `503`. Exact-head
  `f09383563bbcc22e11e0e67ca597360cf8996f4b` / CI `30488598755`
  (`run #43`) — `3/3 PASS`, independent review — `PASS`; production
  proxy/APM/CSP/browser/mail-client acceptance остаётся pending;
- external authenticated HTTP admission candidate: обязательные beta-prefixes
  получают `module + READ|WRITE|OUTBOUND`, неизвестный route запрещён;
  reusable lower-layer admission перечитывает persisted state на каждый
  effect и поддерживает cross-module requirements. Уже защищены report
  email/digest, scheduled Langame sync, bonus-ledger provider и игровой
  Telegram/MAX delivery/pull;
- execution-revision fence candidate: migration `164` добавляет trigger-owned
  monotonic revision, CAS для lifecycle/profile/OWNER/revoke и durable
  revision capture в report schedule и bonus-ledger claim. Migration
  fail-closed требует zero `RUNNING/PROCESSING/DISPATCHING` effects до DDL.
  SMTP повторно проверяет actor/capability/scope/revision, а Langame bonus
  effect — target/source/eligibility/claim ownership непосредственно перед
  provider.
  Durable lease/reclaim для delivery/общего Langame sync, public
  guest/Telegram identity routes, files и strict suspend/drain ещё pending;
- background containment candidate: authoritative registry фиксирует 17 job
  kinds; `INTERNAL` временно сохраняет legacy execution, а
  `PILOT/BETA/LIVE` допускает только revision-fenced report SMTP и bonus-ledger
  Langame effect. Остальные 15 scheduled/AUTO paths fail-closed пропускаются
  до credentials/provider/защищённой business mutation; детерминированная
  audit-запись `SKIPPED`/`BLOCKED` разрешена. Оба разрешённых effect path сами
  проверяют registry. Это не durable suspend/drain fence; подробности и
  ограничения зафиксированы в checkpoint. Локальный gate:
  `15 suites / 665 tests`; полный API regression:
  `96 suites / 1873 passed / 2 todo`; подробности:
  [checkpoint](./background-execution-containment.md);
- guest-game delivery claim implementation candidate: migration `166`
  добавляет generation-bound claim, immutable provider-attempt evidence,
  typed transition events и database transition fence; legacy direct send
  принудительно остаётся dry-run, legacy bot pull не выдаёт payload, а
  provider prepare/update/bot ack отклоняются до delivery mutation.
  Bonus-ledger revoke и Telegram unsubscribe продолжают основную
  ledger/reward/consent mutation, но не изменяют provider delivery rows/events;
  `CASHIER/MANUAL` cancellation сохраняется.
  Schema target этого historical guest-game checkpoint — `CURRENT_166`.
  Previous accepted engineering baseline связан с
  PR head
  `bbef153a288bfdf1c3573eb704f27c013cc0e856`, GitHub CI
  [`30443837684`](https://github.com/boozik3412/leetplus/actions/runs/30443837684)
  (`run #23`), но выполнен через merge-ref и не является exact-SHA checkout
  evidence. Все три job `PASS`; PostgreSQL major `16` подтвердил
  `immutableMutationsRejected=7` и
  `finalStateAndEvidenceUnchanged=true`. Authority checks не выполняли root
  enrollment; canonical root registry остаётся `{}`. Это закрывает legacy
  quarantine delivery-row/lifecycle P1: `LEGACY_QUARANTINED` delivery
  immutable для ordinary/enrolled DML roles при включённых triggers, включая
  `DELETE`.
  `c1fee42c...` / CI `30442286822` сохраняется как historical precursor,
  принявший foundation migration `166` до этой lifecycle freeze.
  Изначально оставались три provider-write P1: lock order/`40P01`, final-row
  reason/evidence consistency и procedure-only durable events.
  Rejected `6a69cd8247a2ec1787d00e4f9afacee2af075c60` / CI
  `30445054152` (`run #26`), PostgreSQL job `90553255161`, завершился
  `FAILED`: retry readiness fixture и найденный preflight null-closed Event gap
  не позволили закрыть P1. Exact-head
  `a644b81e909ea97c21e3c404480505bf97b19935` / CI
  [`30447011917`](https://github.com/boozik3412/leetplus/actions/runs/30447011917)
  (`run #27`) — `REJECTED`: Application `90559756157` и Authority
  `90559756309` — `PASS`, PostgreSQL `90559756334` — `FAIL` из-за
  replay-message expectation. Previous accepted exact-head checkpoint —
  `d525b736d03162a2c58de17cbf7679ba6f515096`, CI
  [`30447467729`](https://github.com/boozik3412/leetplus/actions/runs/30447467729)
  (`run #28`): Application `90561260920`, Authority `90561260926` и PostgreSQL
  `90561260878` — `3/3 PASS`; `committedTransitions=4`,
  `runtimeBoundaryNegatives=9`. Он закрыл final-row reason/evidence и worker
  boundary-only durable-event P1. Последний принятый provider-write exact-head —
  `be8c94c4ea9106a31055a0aff577ffbd62b67e7c`, CI
  [`30449026506`](https://github.com/boozik3412/leetplus/actions/runs/30449026506)
  (`run #29`): Application `90566337085`, Authority checks `90566337062` и
  PostgreSQL major `16` job `90566337060` — `3/3 PASS`. Authority checks не
  выполняли root enrollment; roots остаются `{}`. Private SECURITY INVOKER
  `guest_game_reward_delivery_lock_v1` и двухсессионный rehearsal закрыли
  lock-order/`40P01`; `privateSecurityInvokerLockBoundaries=1`,
  `rawDeadlockOrLockTimeoutErrors=0`,
  `stateAndEvidenceUnchanged=true`,
  `sourceDatabaseMigrationsApplied=0`. Все четыре исходных engineering
  provider-write P1 закрыты. Отдельная non-owner runtime/app DB role всё ещё
  должна пройти admission и получить explicit `EXECUTE` grant, поскольку
  `PUBLIC EXECUTE` revoked; batch/rebind/future provider writers остаются
  fail-closed, whole-transaction bounded retry — defense-in-depth. Worker
  boundary не принимает `actorUserId`, а interactive same-tenant actor
  boundary и operational grants ещё pending.
  Effect-capable coordinator, persisted `NETWORK | STORES` проверка
  `allowedStoreIds`, provider/workload authority, bounded audited retention
  identity/procedure/grants, production-like evidence и cutover ещё pending.
  Прямой `DELETE` Attempt/Event fail-closed запрещён для ordinary/enrolled DML
  roles при включённых triggers. Owner/superuser/DDL bypass operationally
  denied; retention не enrolled. Поэтому outbound, production deploy и owner
  invite остаются `NO-GO`;
- historical migration `164` rehearsal workflow создаёт две
  disposable PostgreSQL 16 test-БД, поднимает exact schema `1..163` с
  tenant/report-run/bonus-ledger fixtures и проверяет upgrade `164`,
  preservation/backfill/defaults, trigger/CAS, три SQLSTATE `55000`,
  `lock_timeout`, late-DDL rollback и повторный deploy. Source database не
  мигрируется и не используется как template. Offline self-test и отдельный
  local PostgreSQL major `16` diagnostic rehearsal зелёные; remote
  prerequisite `CURRENT_164` уже прошёл на `37f8cc88...` / CI `30423839760`.
  Это historical prerequisite, не current migration `166` evidence;
  production-like backup/restore остаётся pending, поэтому этот пункт не
  меняет `NO-GO`;
- scheduled report digest применяет effective role/custom-role overrides и
  требует `export_reports`; Langame/guest foundation/business snapshot
  проверяют полный cross-module entitlement и AND-capability contract;
- CI/security baseline, startup contract и health/version foundation;
- persisted `NETWORK | STORES` и database invariants;
- user/role/invite authority; generic direct create, invite issue/rotation и
  email change для external tenant fail-closed до verified email workflows;
- scoped staff directory, notifications и team chat core;
- attachment lifecycle/ACL EXPAND schema;
- parent-aware chat и `STAFF_TASK` attachment adoption candidate.
- scoped task templates, shared safe task materializer и catalog audit EXPAND
  candidate.
- scoped recurring Rule CRUD/manual/interactive due candidate со
  Store/participant locks, sparse PATCH, IANA/DST schedule и real PostgreSQL
  race evidence; background scheduler и all-tenant scheduled route не
  зарегистрированы и остаются `NO-GO`.
- guarded staff task integrity inventory: 43 aggregate reason code, одна
  read-only `REPEATABLE READ` snapshot, fail-closed exit `1/2` и обязательный
  clean-schema CI run; production inventory не выполнялся.
- same-tenant StaffTask catalog EXPAND candidate
  `dc26568d94d76b886f1d1b79c36b1bd9f00ac401` — not deployed: 162 migrations,
  пять concurrent parent indexes, 14 composite + 14 simple compatibility
  `NOT VALID` FK, archive-first/global-existence protection, immutable parent
  IDs и future-migration guard для 28 DB-native constraints; staged real
  PostgreSQL smoke подтвердил 14 benign legacy updates, 5 UUID + 5 tenant
  move rejections и scoped `prismaDriftDrops=14`; expanded DDL guard пройден,
  а усиленная rehearsal строит пять concurrent indexes на populated legacy
  baseline 156 и применяет ровно шесть migrations `157..162`.
- aggregate-only StaffTask reconciliation planner: historical candidate
  `2c74c663780b3f183be708a01431c22efe57a723` не является evidence текущего
  рабочего дерева; historical prerequisite `CURRENT_165` remote evidence
  принято на `4bd6a036...` / CI `30428288353`, а documentation/evidence
  successor `7c20adec...` прошёл CI `30429463161` (полная ссылка — backlog
  §5.29). Оба checkpoint остаются историческими.
  Полный каталог
  из 43 кодов классифицирован как `8 proposal + 29 operator + 6 review`;
  обязательны одна read-only `REPEATABLE READ` transaction, exact target /
  confirmation / production attestation / 40-hex SHA / HMAC и expected
  database binding. Frozen StaffTask evidence остаётся на exact
  `EXPAND_162`, а current implementation candidate schema-first gate требует
  `CURRENT_170`, `migrationCount=170`, latest
  `20260729233000_identity_activation_locator`,
  `unfinished=0`, `14 composite exact`, `14 simple exact`,
  `0 expected-FK mismatch`, `0 unexpected protected FK`, `5 indexes exact` и
  `0 index mismatch`; expected/actual database names не выводятся, а
  domain-separated HMAC `databaseIdentityDigest` связывает evidence с
  database name, PostgreSQL cluster и database OID без раскрытия raw identity.
  Proposal не является authorization, apply path отсутствует, output
  aggregate-only без identifiers. Инвариант
  `inventoryExecuted === schema.ready` проверяется fail-closed. Стабильный
  `contentDigest` и timestamp-bound `executionDigest` не являются
  row-stable/CAS authorization. Contract tests, clean real PostgreSQL planner
  и adversarial disposable-clone smoke для неверного FK/index contract прошли.
- StaffTask snapshot admission schema `v2`: исторический runtime
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` не является current evidence;
  historical prerequisite `CURRENT_165` на `4bd6a036...` и его
  documentation/evidence successor `7c20adec...` прошли remote CI. Last
  previous accepted `CURRENT_166` baseline связан с PR head
  `bbef153a288bfdf1c3573eb704f27c013cc0e856` / merge-ref CI `30443837684`;
  это не exact-SHA checkout evidence. Historical precursor `c1fee42c...` /
  `30442286822` предшествовал legacy quarantine delivery-row/lifecycle freeze.
  Exact-head `a644b81...` / CI `30447011917` (`run #27`) rejected (`2/3
  PASS`, PostgreSQL `FAIL`). Previous accepted exact-head `d525b73...` / CI
  `30447467729` (`run #28`) — `3/3 PASS`. Последний принятый provider-write
  exact-head
  `be8c94c4...` / CI `30449026506` (`run #29`) — `3/3 PASS`; все четыре
  исходных engineering provider-write P1 закрыты. Принятый `CURRENT_168`
  implementation — `3b8228dd...` / CI `30460154200`, `3/3 PASS` — является
  предыдущим historical prerequisite. Historical engineering exact-head
  `CURRENT_169` `f5d39fd...` / CI `30467882578` (`run #37`) принят,
  `3/3 PASS`, но это не production-like admission и не exact-head evidence
  `CURRENT_170`.
  `IMPLEMENTED_CANDIDATE`, not deployed. Admission принимает только
  изолированную loopback PostgreSQL 16 копию в точном `BASELINE_156`,
  `EXPAND_162` или `CURRENT_170`,
  сверяет ordered migration names/checksums, exact Git blob content, catalog,
  database marker и freshness. Отдельная `LOGIN NOINHERIT` роль получает
  table-level `SELECT` ровно на восьми разрешённых relations и column-level
  `SELECT` только на
  `User(id, tenantId, isPlatformAdmin, isActive, accessScope)`, без
  table-wide `User SELECT`, write, DDL, TEMP, membership или ownership.
  Independent verify-only Ed25519 boundary реализована, но pinned public
  roots намеренно пусты: production-like authority fail-closed и остаётся
  `NO-GO`. HMAC не заменяет authority; production-like report доверяется
  только как same-process/non-transferable evidence.
- Detached authority operations имеют `IMPLEMENTED_CANDIDATE`: strict
  canonical acquisition request, derived `acquisition-v1:<digest>`, lifecycle
  registry `ACTIVE/RETIRED/REVOKED` и ceremony
  `prepare → external Ed25519 sign → finalize`. LeetPlus не читает private key
  или signer secret; `finalize` re-hash исходный request, root history
  проверяется actual parent→HEAD CI gate, а payload/envelope публикуются
  последними readiness files. Каждая output-пара своей фазы находится в одном
  protected каталоге; каталоги prepare/finalize могут различаться. Локально authority
  bundle прошёл `40/40`, включая child-process positive ceremony E2E и
  rejection промежуточного `CURRENT_164`;
  admission — `21/21`. Root registry остаётся exact `{}`. Ветка `main`
  сейчас без branch protection/ruleset и без `CODEOWNERS`; до enrollment
  production public root обязателен независимый reviewer и защищённый approval
  path. Реальный public root, внешний signer/HSM и snapshot
  acquisition/restore ещё не выполнены.
  Remote PostgreSQL 16 prerequisite для exact `CURRENT_164` пройден на SHA
  `37f8cc88cdba05b3c73f6bc14e14528f831228ee`, CI run `30423839760`.
- Historical public-only pinned-path test evidence
  `2341b99937e54cc50d1763a0a794d975816c72ce` —
  включён в полностью зелёный remote CI SHA
  `d77c74393c510b688f9f2a5c43eaa908390450b5`. Historical runtime
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` не является current candidate.
  Pre-signed fixture не содержит
  private key, generation или signing API; production root registry остаётся
  пустым. Изолированный Node.js 22 child проверяет реальный pinned wrapper,
  marker/nonce-bound identity, expiry и отказ detached report; admission suite
  прошла `19/19`. Experimental module mock является `P2` test-infrastructure
  risk и не превращает fixture в production authority.
- StaffTask reconciliation proposal dry-run
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` —
  `IMPLEMENTED_CANDIDATE`, not deployed. Он работает только внутри
  `SYNTHETIC EXPAND_162` disposable harness, в одной read-only
  `REPEATABLE READ` transaction и без apply-path. Реальный PostgreSQL 16.13
  smoke прошёл `23` scenarios: все `8` proposal codes дали `8` occurrences и
  `7` cases, включая coalescing двух last-task причин в один case; пройдены
  exact parity/cap/privacy/unlinkability и все negative ACL gates. Source data
  не изменились, временная cluster ACL mutation восстановлена. Planner и
  proposal report остаются schema `v1`. Exact synthetic database name и
  `synthetic:` reference — доверенная декларация harness/operator, а не
  provenance proof, production-like authority или Gate 2 evidence.
- production-like inventory/planner/proposal dry-run, standalone dry-run,
  reconciliation apply,
  `VALIDATE`, `CONTRACT` и deployment не выполнялись.

Ближайшая последовательность намеренно разделена на независимые решения:

1. Использовать принятый historical engineering exact `CURRENT_169`
   `f5d39fd89145c995c51e7005698327f5581a5cd8` / CI `30467882578`
   (`run #37`), `3/3 PASS`, как prerequisite. Exact-head CI/review для
   `CURRENT_170` locator candidate ещё pending. Ни один из них не deployed и
   не является production-like admission; `CURRENT_168`
   `3b8228dd278fae062c753bf4301e0339ba93738b` / CI `30460154200`
   сохраняется только как historical prerequisite.
2. Независимо проверить detached authority candidate, утвердить внешний
   signer/HSM, separation of duties и key custody; затем отдельным reviewed
   change enrol Ed25519 public root и получить зелёный remote CI exact
   enrolled-root SHA до acquisition.
3. Выполнить approved acquisition/restore в protected evidence boundary для
   exact current SHA; произвольный approval alias не использовать. Создать
   отдельную `LOGIN NOINHERIT` reader role, выдать exact grants и пройти
   negative ACL gate.
4. отдельно production-like admission: новый request/nonce/envelope/marker для
   `BASELINE_156` → admission → migrations `157..162` → новый request и
   `EXPAND_162` envelope/marker → admission → exact allowlisted migration
   `20260728120000_tenant_execution_control_plane_expand` → exact
   `20260728150000_tenant_execution_revision_fence` → exact fail-closed
   migration `20260729120000_store_background_execution_fence` → exact
   migration `20260729160000_guest_game_delivery_claim_fence` → foundation
    migration `20260729190000_identity_email_claim_foundation` → sealed
    boundary migration `20260729210000_identity_email_claim_write_boundary` →
    persisted writer migration
    `20260729230000_identity_invite_writer_boundary` → locator migration
    `20260729233000_identity_activation_locator` → новый третий
    `CURRENT_170` request/envelope/marker и третий admission.
    Protected StaffTask evidence остаётся bound к prefix 162; planner работает
    только на current DB 170;
5. отдельно production-like inventory и aggregate planner;
6. отдельно production-like row dry-run;
7. отдельно explicit apply, rollback и доказательство zero-diff;
8. только после zero blocking — отдельные решения по `VALIDATE`, N-1 window,
   `CONTRACT` и deployment;
9. после выполнения всех platform/module prerequisites и отдельного `Gate 2A`
   explicit `CUTOVER GO` — in-place cutover четырёх `Store` текущей сети
   внутри одного существующего `Tenant`;
10. параллельно закрыть `BETA-MT-001..009`: использовать принятые exact-head
    CI/review `BETA-IAM-004B` как engineering prerequisite, отдельно выполнить
    production-like inventory и будущий signed proposal/apply/rollback;
    использовать принятый exact-head PostgreSQL/CI/review checkpoint
    design-partner writer isolation, принять locator exact-head, реализовать
    sealed issue-by-locator, encrypted outbox/verified OWNER delivery и
    persisted GO, а для реализованного
    `BETA-IAM-004E` пройти production proxy/APM/CSP/browser/mail-client
    acceptance; затем закрыть delegation/integrations, A/B isolation и
    tenant-aware workers/Telegram;
11. семь стабильных дней internal alpha и Gate 1MT завершают Gate 2; только
    затем возможен protected `SHARED BETA GO` и owner invite нового
    `Tenant B/Store B1`.

После повторного zero-diff inventory/planner reader role отзывается и удаляется
до уничтожения disposable snapshot.

Это не означает готовность к внешнему тесту. В launch scope ещё остаются
непроверенные staff surfaces, остальные attachment parent kinds, полный
gamification/assortment adoption, tenant entitlements/lifecycle, browser E2E,
operations, backup/restore и production canary.

Section 5.26 с isolated DP-1 сохраняется как contingency/enterprise-isolation
lane. Legacy identity creation/rotation в ней disabled; полезными остаются
read-only historical status, narrowing-only emergency suspend и isolated
runtime admission. Отдельный runtime/DB больше не является основным способом
первого теста и не имеет назначенного календарного окна.

Текущий плановый ориентир первого shared friendly external club —
`31.08–07.09.2026`, если Gate 1MT и Gate 2 закрыты без stop condition. Это не
обещание даты.

## Рабочий цикл каждой реализации

Для каждого bounded slice:

1. Зафиксировать route/action/job/file inventory и resource class.
2. Применить persisted tenant/store scope и capability server-side.
3. Проверить list, detail, aggregate, mutation, export, file и background path.
4. Добавить same-tenant, cross-tenant, allowed-store и denied-store тесты.
5. Если есть конкурентная запись — добавить real PostgreSQL rollback/race test.
6. Обновить матрицу, backlog, rollout/rollback и verification evidence.
7. Выполнить focused и full CI, production builds и `git diff --check`.
8. Создать exact candidate SHA; не повышать статус до `VERIFIED` без staging
   или canary evidence.

## Правила хранения evidence

В git разрешены:

- aliases вместо production ID;
- counts, hashes/checksums и ожидаемые zero-values;
- exact SHA, migration revision/count и результаты автоматических проверок;
- ссылки на защищённые операционные записи.

В git запрещены production ID, email, телефоны, database URLs, токены,
credentials, encryption keys и необработанные выгрузки.

## Условия внешнего доступа

### Первый shared external club

Owner invite для `Tenant B/Store B1` можно выдать только после Gate 1MT,
Gate 2 и
[shared launch checklist](./shared-multi-tenant-launch-checklist.md), когда:

- текущая сеть успешно переведена и прошла семь дней internal alpha;
- persisted lifecycle/stage/trial/entitlements и `TenantExecutionPolicy`
  применяются fail-closed во всех HTTP/background/Telegram paths;
- idempotent shell provisioning создаёт отдельный Tenant B, Store B1,
  six-row profile и canonical owner-email claim без User/invite/token/trial;
- отдельная non-owner runtime role имеет exact seven-RPC allowlist и zero
  `IdentityEmailClaim` table DML; legacy `User`/`UserInvite` writers не
  обходят sealed reserve/assert/transition/release invariant;
- отдельное production fingerprint HMAC secret value version `v1`
  защищённо настроено и аттестовано; protected activation использует
  privacy-safe claim locator без raw-email lookup leak;
- persisted GO и dedicated activation запускают trial и атомарно создают
  email-bound OWNER invite + encrypted mail outbox; response/replay не
  раскрывает identity secret, а real PostgreSQL concurrency подтверждает
  zero-duplicate issue/accept;
- protected email delivery/reissue/revoke и emergency suspend проверены;
  generic lifecycle endpoint для Tenant B не используется;
- owner и все созданные им пользователи ограничены собственной сетью и
  `NETWORK | STORES` scope;
- shared PostgreSQL/runtime A/A1/A2 ↔ B/B1 IDOR matrix зелёная для API, BFF,
  browser, files, jobs, SSE и Telegram;
- integration preview/mapping не импортирует чужие клубы, secrets защищены,
  unattended sync и write-back остаются отдельно gated;
- shared workers используют tenant/store system identity, durable
  lease/fencing/idempotency и kill switches;
- все обязательные surfaces имеют статус `VERIFIED`;
- `LEGACY/SHADOW` не используются как внешний attachment authorization;
- tenant/store IDOR, PII, exports, files, jobs и BFF regression зелёные;
- тот же production-like snapshot до inventory прошёл
  [обязательный admission checkpoint](../security/access-scope/v1/staff-task-integrity-snapshot-admission-runbook.md)
  в `BASELINE_156`, после migrations `157..162` — в frozen-prefix
  `EXPAND_162`, а после exact allowlisted migrations `163..170` — в
  `CURRENT_170`;
  для каждого состояния использован отдельный signed envelope, перед каждым
  следующим admission DB marker заменён digest нового envelope, а
  state-specific protected evidence и marker-rotation attestation
  сохранены;
  подтверждены PostgreSQL 16, admission schema `v2`, exact release
  manifest/blob/catalog, database marker/freshness, table-level `SELECT` на
  восьми разрешённых relations и column-level `SELECT` только на
  `User(id, tenantId, isPlatformAdmin, isActive, accessScope)`, isolation и
  no-egress;
- reviewed Ed25519 public root enrolment, protected signer и acquisition
  evidence завершены до production-like admission; текущий empty-root
  fail-closed state не засчитывается как Gate 2;
- HMAC digest/report не используется как authority или provenance;
  production-like report не передаётся как самостоятельное доказательство,
  потому что его authority evidence same-process и non-transferable;
- staff task integrity inventory имеет zero blocking findings; все review-only
  findings имеют owner и принятое решение;
- aggregate reconciliation planner запущен на том же production-like
  snapshot и прошёл exact schema-first gate:
  `CURRENT_170`, `migrationCount=170`, latest
  `20260729233000_identity_activation_locator`, `unfinished=0`,
  `14 composite exact`, `14 simple exact`, `0 expected-FK mismatch`,
  `0 unexpected protected FK`, `5 indexes exact`, `0 index mismatch`;
  `databaseIdentityMatched=true`, `databaseIdentityDigest` зафиксирован,
  `inventoryExecuted === schema.ready`, actionable cap не превышен;
  `proposal` не считается authorization, `contentDigest`/`executionDigest` не
  используются как row-level/CAS token;
- текущий proposal dry-run candidate не засчитывается как production-like
  reconciliation: он допускает только exact-name/ref `SYNTHETIC` harness-БД,
  а эта классификация является доверенной декларацией operator/harness, не
  provenance proof;
  отдельные protected production-like row evidence, owner approval,
  locks/recheck, audit и rollback по-прежнему обязательны;
- adversarial catalog smoke на disposable local/CI clone при сохранении всех
  28 expected FK отклонил дополнительный конфликтующий FK с другим именем и
  неверный parent index с `SCHEMA_MISMATCH`, не запустил inventory и не
  изменил source database;
- отдельные reconciliation dry-run, approved apply и повторный zero-diff
  завершены до `VALIDATE`;
- все 14 StaffTask catalog constraints валидированы после production-like
  reconciliation; три Store delete restrictions и N/N-1 rollback проверены;
- все 14 simple compatibility FK не удалены до отдельного CONTRACT; rollback
  не запускает старый seed или parent ID updates, `db push` запрещён;
- expanded future-migration DDL guard и scoped
  `prismaDriftDrops=14` check зелёные; credentials отсутствуют в argv;
- после закрытия N-1 window CONTRACT удалил ровно 14 simple compatibility FK
  и оставил future guard на 14 validated composite FK;
- exact SHA виден в API/web/edge;
- backup restore, alert и rollback drills подтверждены;
- gamification write-back включается отдельно по Store через
  `OFF → SHADOW → CANARY → LIVE`.

Optional isolated DP-1 feedback не заменяет shared Gate 1MT/internal alpha и
не входит автоматически в Gate 3. Promotion из isolated режима требует новой
entitlement revision, отдельного решения и нового измерительного окна.

### Optional isolated contingency

Отдельные web/API/PostgreSQL/secrets допускаются только по документированному
решению о contingency/enterprise isolation и после Gate 1DP. Эта lane
остаётся `NO-GO`, не разрешает обход Gate 1MT/Gate 2 для shared beta и не имеет
обещанного срока.
