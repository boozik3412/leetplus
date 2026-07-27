# LeetPlus open beta: пакет запуска

| Поле | Значение |
|---|---|
| Статус | Active implementation package |
| Дата | 27.07.2026 |
| Release decision | `NO-GO` до полного Gate 2 |
| Владелец | LeetPlus product / engineering / operations |

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
10. [Шаблон release evidence](../security/access-scope/evidence/README.md) —
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
- exact SHA виден в API/web/edge;
- backup restore, alert и rollback drills подтверждены;
- gamification write-back включается отдельно по Store через
  `OFF → SHADOW → CANARY → LIVE`.
