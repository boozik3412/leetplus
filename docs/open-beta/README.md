# LeetPlus open beta: пакет запуска

| Поле             | Значение                                    |
| ---------------- | ------------------------------------------- |
| Статус           | Active implementation package               |
| Дата             | 27.07.2026                                  |
| Release decision | `NO-GO` до полного Gate 2                   |
| Владелец         | LeetPlus product / engineering / operations |

Этот каталог — навигационная точка для перевода текущей сети из demo-режима в
полноценную работу и последующего invite-only теста с внешними сетями. Он не
разрешает deployment, миграцию production-данных или выдачу доступа сам по
себе.

## Зафиксированные решения

- четыре текущих клуба — четыре `Store` одной сети внутри одного существующего
  `Tenant`;
- текущий `tenantId` сохраняется, данные четырёх `Store` остаются внутри одного
  `Tenant` и не разделяются на четыре tenant;
- operational tenant перестаёт быть anonymous demo до переименования;
- независимая внешняя сеть всегда получает отдельный `Tenant`;
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
3. [Cutover-чеклист текущей сети](./current-network-cutover-checklist.md) —
   безопасный перевод одного tenant с четырьмя Store.
4. [AccessScope package](../security/access-scope/README.md) — нормативная
   server-side модель tenant/store authority, rollout и rollback.
5. [Матрица внедрения](../security/access-scope/v1/module-adoption-matrix.md) —
   фактический статус поверхностей.
6. [Стратегия тестирования](../security/access-scope/v1/test-strategy.md) —
   обязательные positive/negative topology-сценарии.
7. [Attachment ACL rollout](../security/access-scope/v1/attachment-acl-rollout.md)
   и
   [implementation checkpoint](../security/access-scope/v1/attachment-acl-implementation-checkpoint.md).
8. [План templates/recurring tasks](../security/access-scope/v1/staff-task-catalog-adoption-plan.md) —
   подтверждённые same-tenant cross-store разрывы и следующий implementation
   slice.
9. [Checkpoint task catalog](../security/access-scope/v1/staff-task-catalog-implementation-checkpoint.md) —
   фактический template/materializer/audit candidate, проверки и остаточные
   блокеры recurring/scheduler.
10. [Checkpoint recurring actor HTTP](../security/access-scope/v1/staff-task-recurring-http-implementation-checkpoint.md) —
    scoped Rule CRUD/manual/interactive due candidate и явная изоляция
    scheduler/all-tenant execution.
11. [Runbook integrity inventory staff tasks](../security/access-scope/v1/staff-task-integrity-inventory-runbook.md) —
    guarded read-only проверка legacy Template/Rule/Task/Run перед
    same-tenant EXPAND/VALIDATE.
12. [Runbook StaffTask integrity EXPAND](../security/access-scope/v1/staff-task-integrity-expand-runbook.md) —
    пять concurrent parent indexes, 14 composite + 14 simple compatibility
    `NOT VALID` FK, archive-first/global-existence Store protection, immutable
    parent IDs и порядок дальнейших `VALIDATE/CONTRACT`.
13. [Runbook aggregate reconciliation plan](../security/access-scope/v1/staff-task-integrity-reconciliation-plan-runbook.md) —
    read-only классификация `8 proposal + 29 operator + 6 review`, exact
    schema-first gate, actionable cap, `contentDigest`/`executionDigest` и
    exits `0/1/2/3`.
14. [Runbook admission StaffTask snapshot](../security/access-scope/v1/staff-task-integrity-snapshot-admission-runbook.md) —
    обязательный fail-closed checkpoint перед production-like inventory и
    planner: PostgreSQL 16, exact `BASELINE_156 | EXPAND_162`, release
    manifest, catalog и отдельная SELECT-only роль.
15. [Шаблон release evidence](../security/access-scope/evidence/README.md) —
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
- StaffTask snapshot admission
  `7d67333b22f171c6e79f723190647cdd2454b128` —
  `IMPLEMENTED_CANDIDATE`, not deployed. Он принимает только изолированную
  loopback PostgreSQL 16 копию в точном `BASELINE_156` или `EXPAND_162`,
  сверяет ordered migration names/checksums, exact catalog и отдельную
  `LOGIN NOINHERIT` роль с SELECT только к девяти таблицам, без write, DDL,
  TEMP, membership и ownership. Локально подтверждены 16 unit, 34 offline
  smoke и real PostgreSQL smoke из 9 сценариев: exact Git blob baseline 156 →
  ровно шесть migrations → expand 162, а также
  trigger/privilege/tamper/privacy/cleanup guards. Выполнен только
  `SYNTHETIC` rehearsal; remote CI и production-like admission не
  выполнялись.
- production-like inventory/planner, reconciliation dry-run/apply,
  `VALIDATE`, `CONTRACT` и deployment не выполнялись.

Это не означает готовность к внешнему тесту. В launch scope ещё остаются
непроверенные staff surfaces, остальные attachment parent kinds, полный
gamification/assortment adoption, tenant entitlements/lifecycle, browser E2E,
operations, backup/restore и production canary.

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

## Условия первого внешнего приглашения

Доступ можно выдать только после Gate 2, когда:

- текущая сеть успешно переведена и прошла семь дней internal alpha;
- все обязательные surfaces имеют статус `VERIFIED`;
- `LEGACY/SHADOW` не используются как внешний attachment authorization;
- tenant/store IDOR, PII, exports, files, jobs и BFF regression зелёные;
- тот же production-like snapshot до inventory прошёл
  [обязательный admission checkpoint](../security/access-scope/v1/staff-task-integrity-snapshot-admission-runbook.md)
  в `BASELINE_156`, затем после ровно шести migrations — в `EXPAND_162`;
  подтверждены PostgreSQL 16, exact release manifest/catalog, девять
  SELECT-only relations, HMAC/artifact/approval/TTL evidence, isolation и
  no-egress;
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
