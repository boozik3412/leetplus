# LeetPlus open beta: пакет запуска

| Поле             | Значение                                     |
| ---------------- | -------------------------------------------- |
| Статус           | Active implementation package                |
| Версия           | 1.4                                          |
| Дата             | 28.07.2026                                   |
| Release decision | `NO-GO`; isolated DP-1 только после Gate 1DP |
| Владелец         | LeetPlus product / engineering / operations  |

Этот каталог — навигационная точка для перевода текущей сети из demo-режима в
полноценную работу и последующего invite-only теста с внешними сетями. Он не
разрешает deployment, миграцию production-данных или выдачу доступа сам по
себе.

Общий внешний pilot остаётся `NO-GO` до Gate 2. Единственная предусмотренная
ранняя lane — один named `SINGLE_DESIGN_PARTNER` после отдельного Gate 1DP,
только в физически изолированном контуре и с полным согласованным начальным
in-app scope; high-risk и outbound effects включаются отдельно. Сейчас этот
lane также `NO-GO`.

## Зафиксированные решения

- четыре текущих клуба — четыре `Store` одной сети внутри одного существующего
  `Tenant`;
- текущий `tenantId` сохраняется, данные четырёх `Store` остаются внутри одного
  `Tenant` и не разделяются на четыре tenant;
- operational tenant перестаёт быть anonymous demo до переименования;
- независимая внешняя сеть всегда получает отдельный `Tenant`;
- ранний design partner получает новый `Tenant D` и единственный `Store D1`
  только в отдельном web/API/PostgreSQL/secrets контуре; current production
  `Tenant A` с четырьмя `Store A1..A4` не меняется и не копируется;
- все partner schedulers и outbound effects по умолчанию `OFF`; доступные
  surfaces включаются только вручную после отдельных evidence и `GO`;
- первая внешняя когорта подключается только вручную и по приглашениям;
- состав доступа задаёт
  [профиль первой когорты](./pilot-access-profile.md);
- tenant user работает только внутри своего tenant и persisted
  `NETWORK | STORES` scope;
- production-изменения выполняются только после exact candidate SHA, CI,
  backup/restore, canary и явного решения `GO`.

## Канонические документы

1. [Специальный launch backlog](../../OPEN_BETA_BACKLOG.md) — приоритеты,
   зависимости, Gate 0–3, метрики и последовательность разработки.
2. [Профиль доступа первой когорты](./pilot-access-profile.md) — что именно
   получает тестовый клуб и какие функции остаются закрыты.
3. [Профиль одного design partner](./single-design-partner-access-profile.md) —
   topology, progressive slices, ограничения и kill switches отдельного
   изолированного DP-1.
4. [Launch checklist одного design partner](./single-design-partner-launch-checklist.md) —
   исполнимые Gate 1DP checks, GO record, day-0, incident, rollback и
   offboarding.
   [PostgreSQL runtime-role contract](./design-partner-database-role-contract.md) —
   bounded real-PostgreSQL evidence для разделения migration/provisioning и
   restricted runtime identity.
5. [Intake первого тестового клуба](./single-design-partner-intake.md) —
   какие несекретные данные нужны для Tenant D/Store D1 и что передаётся
   только защищённым каналом.
6. [Cutover-чеклист текущей сети](./current-network-cutover-checklist.md) —
   безопасный перевод одного tenant с четырьмя Store.
7. [AccessScope package](../security/access-scope/README.md) — нормативная
   server-side модель tenant/store authority, rollout и rollback.
8. [Матрица внедрения](../security/access-scope/v1/module-adoption-matrix.md) —
   фактический статус поверхностей.
9. [Стратегия тестирования](../security/access-scope/v1/test-strategy.md) —
   обязательные positive/negative topology-сценарии.
10. [Attachment ACL rollout](../security/access-scope/v1/attachment-acl-rollout.md)
    и
    [implementation checkpoint](../security/access-scope/v1/attachment-acl-implementation-checkpoint.md).
11. [План templates/recurring tasks](../security/access-scope/v1/staff-task-catalog-adoption-plan.md) —
    подтверждённые same-tenant cross-store разрывы и следующий implementation
    slice.
12. [Checkpoint task catalog](../security/access-scope/v1/staff-task-catalog-implementation-checkpoint.md) —
    фактический template/materializer/audit candidate, проверки и остаточные
    блокеры recurring/scheduler.
13. [Checkpoint recurring actor HTTP](../security/access-scope/v1/staff-task-recurring-http-implementation-checkpoint.md) —
    scoped Rule CRUD/manual/interactive due candidate и явная изоляция
    scheduler/all-tenant execution.
14. [Runbook integrity inventory staff tasks](../security/access-scope/v1/staff-task-integrity-inventory-runbook.md) —
    guarded read-only проверка legacy Template/Rule/Task/Run перед
    same-tenant EXPAND/VALIDATE.
15. [Runbook StaffTask integrity EXPAND](../security/access-scope/v1/staff-task-integrity-expand-runbook.md) —
    пять concurrent parent indexes, 14 composite + 14 simple compatibility
    `NOT VALID` FK, archive-first/global-existence Store protection, immutable
    parent IDs и порядок дальнейших `VALIDATE/CONTRACT`.
16. [Runbook aggregate reconciliation plan](../security/access-scope/v1/staff-task-integrity-reconciliation-plan-runbook.md) —
    read-only классификация `8 proposal + 29 operator + 6 review`, exact
    schema-first gate, actionable cap, `contentDigest`/`executionDigest` и
    exits `0/1/2/3`.
17. [Runbook admission StaffTask snapshot](../security/access-scope/v1/staff-task-integrity-snapshot-admission-runbook.md) —
    обязательный fail-closed checkpoint перед production-like inventory и
    planner: PostgreSQL 16, exact `BASELINE_156 | EXPAND_162`, release
    manifest, catalog и отдельная SELECT-only роль.
18. [Runbook SYNTHETIC reconciliation proposal dry-run](../security/access-scope/v1/staff-task-integrity-reconciliation-proposal-dry-run-runbook.md) —
    read-only row-evidence rehearsal только для подписанной disposable
    harness-БД: восемь proposal-кодов, HMAC-токены, coalescing и явный запрет
    standalone/production-like/apply.
19. [Шаблон release evidence](../security/access-scope/evidence/README.md) —
    какие обезличенные доказательства сохранять для каждого SHA.

При противоречии исторического документа этому пакету действует
`OPEN_BETA_BACKLOG.md`. Изменение продуктового состава первой когорты требует
одновременного обновления backlog и `pilot-access-profile.md`.

## Текущее состояние реализации

Уже существуют неприменённые production candidates:

- CI/security baseline, startup contract и health/version foundation;
- persisted `NETWORK | STORES` и database invariants;
- user/role/invite authority;
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
- aggregate-only StaffTask reconciliation planner
  `2c74c663780b3f183be708a01431c22efe57a723` — not deployed: полный каталог
  из 43 кодов классифицирован как `8 proposal + 29 operator + 6 review`;
  обязательны одна read-only `REPEATABLE READ` transaction, exact target /
  confirmation / production attestation / 40-hex SHA / HMAC и expected
  database binding. Schema-first gate требует
  `162/latest/unfinished 0 + 14 composite exact + 14 simple exact +
0 expected-FK mismatch + 0 unexpected protected FK + 5 indexes exact +
0 index mismatch`; expected/actual database names не выводятся, а
  domain-separated HMAC `databaseIdentityDigest` связывает evidence с
  database name, PostgreSQL cluster и database OID без раскрытия raw identity.
  Proposal не является authorization, apply path отсутствует, output
  aggregate-only без identifiers. Инвариант
  `inventoryExecuted === schema.ready` проверяется fail-closed. Стабильный
  `contentDigest` и timestamp-bound `executionDigest` не являются
  row-stable/CAS authorization. Contract tests, clean real PostgreSQL planner
  и adversarial disposable-clone smoke для неверного FK/index contract прошли.
- StaffTask snapshot admission schema `v2`
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` —
  `IMPLEMENTED_CANDIDATE`, not deployed. Он принимает только изолированную
  loopback PostgreSQL 16 копию в точном `BASELINE_156` или `EXPAND_162`,
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
- Public-only pinned-path test evidence
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

1. зелёные mandatory remote CI checks и independent review для exact
   test-evidence commit `2341b99937e54cc50d1763a0a794d975816c72ce`;
2. reviewed Ed25519 root enrollment, protected signer и approved snapshot
   acquisition; runtime candidate остаётся
   `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`;
3. отдельно production-like admission: новый state-bound `BASELINE_156`
   envelope/marker → admission → migrations `157..162` → новый
   `EXPAND_162` envelope с новым nonce-bound binding → marker rotation →
   второй admission;
4. отдельно production-like inventory и aggregate planner;
5. отдельно production-like row dry-run;
6. отдельно explicit apply, rollback и доказательство zero-diff;
7. только после zero blocking — отдельные решения по `VALIDATE`, N-1 window,
   `CONTRACT` и deployment;
8. после выполнения всех platform/module prerequisites и отдельного `Gate 2A`
   explicit `CUTOVER GO` — in-place cutover четырёх `Store` текущей сети
   внутри одного существующего `Tenant`;
9. семь стабильных дней internal alpha завершают Gate 2; только затем возможен
   отдельный `GO` на первый общий внешний invite-only pilot.

Это не означает готовность к внешнему тесту. В launch scope ещё остаются
непроверенные staff surfaces, остальные attachment parent kinds, полный
gamification/assortment adoption, tenant entitlements/lifecycle, browser E2E,
operations, backup/restore и production canary.

Отдельно реализуется isolated DP-1 lane из backlog section 5.26: новые
web/API/PostgreSQL/secrets, Tenant D/Store D1 и полный согласованный начальный
набор in-app модулей. Fail-closed bootstrap/rotate/suspend CLI, API startup
overlay validation, HMAC-bound initial/rotated invite receipts и
запрет generic activation уже находятся в статусе `IMPLEMENTED_CANDIDATE`.
Изолированный runtime, persisted surface entitlements, reviewed activation и
Gate 1DP ещё не готовы, поэтому lane остаётся `NO-GO`. Ориентир
`2–4 рабочих дня` зависит от прохождения полного Gate 1DP; он не меняет
production/cutover sequence выше.

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

### Один isolated design partner

До Gate 2 можно выдать ограниченный доступ только одному named DP-1 и только
когда:

- создан отдельный контур с собственными web, API, PostgreSQL, secrets и
  storage namespace;
- partner runtime технически не имеет production credentials/data path;
- текущая сеть остаётся Tenant A с четырьмя Store A1..A4, а partner создан как
  новый Tenant D с единственным Store D1;
- завершены `BETA-DP-001..009`, Gate 1DP и отдельный
  [`DESIGN_PARTNER GO`](./single-design-partner-launch-checklist.md);
- exact SHA, CI, ephemeral PostgreSQL/IDOR/browser tests, health/version,
  backup/restore и rollback evidence приняты;
- credentials одновременно открывают `VERIFIED + ENFORCED` slices
  `DP-S0..DP-S4`: IAM/support, ассортимент целиком, сотрудников целиком,
  in-app коммуникации и геймификацию;
- не входящие в scope surfaces, все unattended schedulers и внешние outbound
  effects остаются `OFF`;
- support, feedback, incident, stop/offboarding owners и expiry назначены.

Сейчас эти условия не выполнены, поэтому DP-1 остаётся `NO-GO`. Самый ранний
ориентир — `2–4 рабочих дня` после реализации и проверки, а не после
публикации этого документа.

### Первая общая внешняя когорта

Общий invite-only доступ можно выдать только после Gate 2, когда:

- текущая сеть успешно переведена и прошла семь дней internal alpha;
- все обязательные surfaces имеют статус `VERIFIED`;
- `LEGACY/SHADOW` не используются как внешний attachment authorization;
- tenant/store IDOR, PII, exports, files, jobs и BFF regression зелёные;
- тот же production-like snapshot до inventory прошёл
  [обязательный admission checkpoint](../security/access-scope/v1/staff-task-integrity-snapshot-admission-runbook.md)
  в `BASELINE_156`, затем после ровно шести migrations — в `EXPAND_162`;
  для каждого state использован отдельный signed envelope, перед вторым
  admission DB marker заменён digest нового envelope, а state-specific
  protected evidence и marker-rotation attestation сохранены;
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
  `162/latest/unfinished 0 + 14 composite exact + 14 simple exact +
0 expected-FK mismatch + 0 unexpected protected FK + 5 indexes exact +
0 index mismatch`;
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

DP-1 feedback или время работы до Gate 2 не заменяют internal alpha и не
входят автоматически в Gate 3. Promotion партнёра в общую когорту требует
новой entitlement revision, отдельного решения и нового измерительного окна.
