# LeetPlus open beta: пакет запуска

| Поле             | Значение                                     |
| ---------------- | -------------------------------------------- |
| Статус           | Active implementation package                |
| Версия           | 1.10                                         |
| Дата             | 28.07.2026                                   |
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
    `CURRENT_163`, release manifest, catalog и отдельная SELECT-only роль.
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
22. [Initial OWNER identity and activation](./initial-owner-identity-and-activation.md) —
    shell-only provisioning, canonical email claim, encrypted mail outbox,
    persisted release gates, activation/suspend state machine и обязательная
    concurrency/effect-fencing matrix.

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
- legacy shared provisioning/revoke foundation candidate: Platform Admin атомарно
  создаёт `PILOT/SUSPENDED/OWNER_INVITED/revision 1` tenant, один неактивный
  Store, OWNER override, exact six-row profile, email-bound `NETWORK OWNER`
  invite и audit/request digest; replay не создаёт дублей и не раскрывает
  one-time URL повторно; revoke возвращает только pristine pre-owner tenant в
  `SUSPENDED/PROVISIONING`. Real PostgreSQL/concurrency evidence, email
  delivery, reissue/rotation и dedicated activation ещё pending. Candidate
  не используется с реальным email и до launch заменяется на shell-only flow:
  без invite/token/trial до protected activation; controller legacy
  provisioning возвращает стабильный `503` и не вызывает candidate;
- external authenticated HTTP admission candidate: обязательные beta-prefixes
  получают `module + READ|WRITE|OUTBOUND`, неизвестный route запрещён;
  reusable lower-layer admission перечитывает persisted state на каждый
  effect и поддерживает cross-module requirements. Уже защищены report
  email/digest, scheduled Langame sync, bonus-ledger provider и игровой
  Telegram/MAX delivery/pull. Остальные schedulers, public guest/Telegram
  identity routes, files и execution fencing ещё pending;
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
  рабочего дерева; новый exact candidate SHA ещё не назначен. Полный каталог
  из 43 кодов классифицирован как `8 proposal + 29 operator + 6 review`;
  обязательны одна read-only `REPEATABLE READ` transaction, exact target /
  confirmation / production attestation / 40-hex SHA / HMAC и expected
  database binding. Frozen StaffTask evidence остаётся на exact
  `EXPAND_162`, а current schema-first gate требует `CURRENT_163`,
  `migrationCount=163`, latest
  `20260728120000_tenant_execution_control_plane_expand`,
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
  новый exact candidate SHA ещё не назначен. `IMPLEMENTED_CANDIDATE`, not
  deployed. Admission принимает только изолированную loopback PostgreSQL 16
  копию в точном `BASELINE_156`, `EXPAND_162` или `CURRENT_163`,
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
- Historical public-only pinned-path test evidence
  `2341b99937e54cc50d1763a0a794d975816c72ce` —
  `LOCAL PASS`, remote CI pending. Runtime candidate остаётся
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`. Pre-signed fixture не содержит
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

1. Исторические test/runtime SHA `2341b999...`/`044ceca2...` не использовать
   как current evidence; сначала создать exact candidate SHA текущего рабочего
   дерева, получить зелёные mandatory remote CI checks и independent review.
2. Выполнить reviewed Ed25519 root enrollment, protected signer и approved
   snapshot acquisition для exact current SHA.
3. отдельно production-like admission: новый state-bound `BASELINE_156`
   envelope/marker → admission → migrations `157..162` → новый
   `EXPAND_162` envelope/marker → admission → exact allowlisted migration
   `20260728120000_tenant_execution_control_plane_expand` → новый
   `CURRENT_163` envelope/marker → третий admission. Protected StaffTask
   evidence остаётся bound к prefix 162; planner работает только на current
   DB 163;
4. отдельно production-like inventory и aggregate planner;
5. отдельно production-like row dry-run;
6. отдельно explicit apply, rollback и доказательство zero-diff;
7. только после zero blocking — отдельные решения по `VALIDATE`, N-1 window,
   `CONTRACT` и deployment;
8. после выполнения всех platform/module prerequisites и отдельного `Gate 2A`
   explicit `CUTOVER GO` — in-place cutover четырёх `Store` текущей сети
   внутри одного существующего `Tenant`;
9. параллельно закрыть `BETA-MT-001..009`: shared topology, persisted
   stage/trial/entitlements, `TenantExecutionPolicy`, owner provisioning,
   delegation/integrations, A/B isolation и tenant-aware workers/Telegram;
10. семь стабильных дней internal alpha и Gate 1MT завершают Gate 2; только
    затем возможен protected `SHARED BETA GO` и owner invite нового
    `Tenant B/Store B1`.

Это не означает готовность к внешнему тесту. В launch scope ещё остаются
непроверенные staff surfaces, остальные attachment parent kinds, полный
gamification/assortment adoption, tenant entitlements/lifecycle, browser E2E,
operations, backup/restore и production canary.

Section 5.26 с isolated DP-1 сохраняется как contingency/enterprise-isolation
lane. Fail-closed bootstrap/rotate/suspend candidate остаётся полезным для
этого режима, но отдельный runtime/DB больше не является основным способом
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
  `EXPAND_162`, а после exact allowlisted migration 163 — в `CURRENT_163`;
  для каждого из трёх states использован отдельный signed envelope, перед
  вторым и третьим admission DB marker заменён digest нового envelope, а
  state-specific protected evidence и обе marker-rotation attestation
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
  `CURRENT_163`, `migrationCount=163`, latest
  `20260728120000_tenant_execution_control_plane_expand`, `unfinished=0`,
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
