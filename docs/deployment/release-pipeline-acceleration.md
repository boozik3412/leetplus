# Ускорение безопасного release pipeline

Статус: **implementation started, source/CI only**

Актуально на: **01.09.2026**

## Результат анализа

Один штатный цикл проверок не занимает сутки: последние просмотренные Fast CI
и Full Release Admission выполнялись примерно за 9 и 17 минут. Основная потеря
времени возникала после них, когда production preflight последовательно находил
не отражённые в CI различия реальной topology: systemd EnvironmentFiles,
NSS membership между steady-state и rehearsal, hydration origin против bind
destination, receipt state и installed-control binding. Каждый такой mismatch
требовал новый source fix, новый exact SHA, admission и повторную подготовку.

Значит, первый рычаг ускорения — не ослаблять проверки, а перенести production
contract discovery в один disposable pre-production contour и сделать
дублируемую topology машиночитаемой.

## Целевое время

| Lane | Изменения | Инженерная цель | Обязательная граница |
| --- | --- | ---: | --- |
| `L0 DOCS` | Только документация, без runtime/control payload | 5–15 минут | CI; deploy запрещён |
| `L1 RUNTIME` | Код/UI/API/config без schema/security authority | 20–45 минут | Fast + focused gates + один exact-SHA Full + blue/green |
| `L2 SCHEMA_SECURITY` | Prisma, DB ACL/function, auth/scope, systemd/nginx, workers, production-control | 60–120 минут | Полный admission, backup, restored copy, signed controller, rollback/postcheck |

Это цели, а не таймаут, после которого gate разрешено пропустить. Неизвестный
diff и сочетание нескольких lane всегда fail-closed повышаются до
`L2 SCHEMA_SECURITY`.

## Архитектура ускорения

```text
change set
    |
    v
impact classifier --unknown/mixed--> L2
    |
    v
Fast + focused gates
    |
    +---- in parallel: build artifact / prepare disposable restored copy
    |
    v
one immutable deployable SHA + one Full Release Admission
    |
    v
production preflight (read-only contract + fresh backup binding)
    |
    v
resumable blue/green controller -> smoke -> cutover -> postcheck
```

## Реализованный первый срез

Каноническая source topology теперь описана в
[`production-topology-contract.json`](./production-artifact/production-topology-contract.json).
Она фиксирует:

- blue/green/N−1 ports и service identities;
- primary и supplementary runtime groups, включая пустой explicit member set
  shared `leetplus-runtime` в steady state;
- exact API/Web EnvironmentFiles, в том числе независимый USER_CALL overlay;
- transient `leetplus-rehearsal` phase с ровно двумя группами и обязательным
  завершением до slot bind/cutover;
- разницу hydration-origin и bind-destination: один sealed SHA может быть
  независимо привязан к обоим runtime slots, но каждый slot требует свой
  protected receipt;
- независимость public guest, corporate tenant и workers/control-plane.

[`verify-production-topology-contract.mjs`](./production-artifact/verify-production-topology-contract.mjs)
проверяет canonical JSON schema и сверяет manifest с systemd templates,
blue/green cutover, restored-copy runner, slot binder, Web cache preparation и
N−1 auth edge. Negative fixture доказывает fail-closed отказ при трёх
инцидентных классах drift. Проверка подключена одновременно к Fast CI и Full
Release Admission.

Manifest пока является source/CI contract и намеренно не устанавливается в
production-control generation. Поэтому он не заменяет live read-only probes,
installed generation verifier, signed plan, runtime receipts или отдельный GO.
Его следующий безопасный этап — использовать тот же contract в disposable
production twin, а не добавлять новый production authority без rehearsal.

## Следующие этапы

### 1. Disposable dual-slot production twin

Один Linux gate должен поднять обе systemd slot-пары, проверить exact NSS и
EnvironmentFiles, отдельно выполнить transient restored-copy phase, доказать
cleanup steady-state, создать независимые hydration/bind receipts для обоих
slots и проиграть nginx cutover/rollback. Это переносит late production
mismatch в CI без дополнительной инфраструктуры: используются существующие
GitHub runners и PostgreSQL service containers.

### 2. Fail-closed impact classifier

Classifier получает base/head diff и выдаёт только повышение требований:

- Prisma/migration/DB controller/ACL → `L2`;
- auth, access scope, public guest boundary, systemd/nginx, worker или
  production-control → `L2`;
- обычный runtime код → не ниже `L1`;
- доказанный docs-only diff → `L0` и non-deployable receipt;
- неизвестный путь, generated artifact drift или смешанный набор → `L2`.

Результат сохраняется как artifact/receipt и повторно проверяется Full gate.
Ручной override может только повысить lane.

### 3. Один deployable exact SHA

Изменения собираются в короткий release train. Full admission выполняется для
immutable merge-candidate, который и становится deployable SHA; последующее
изменение дерева инвалидирует admission. Docs-only commits после release не
вызывают повторный runtime deploy и не считаются новой production baseline.

### 4. Параллельная подготовка и resumable rollout

Artifact build, backup transfer и disposable restored-copy можно выполнять
параллельно с независимыми CI jobs. Перед effect production controller повторно
связывает current DB identity, backup digest, exact artifact и topology receipt.
Hydration, slot bind, smoke, cutover и postcheck получают terminal phase
receipts; lost response продолжает ту же операцию вместо полного рестарта.

## Что не меняется

- Production runtime остаётся exact `22ab6b81…`, CURRENT189, generation 20;
  этот source/CI срез не является deploy.
- Public guest, corporate tenant и workers/control-plane не объединяются ради
  ускорения.
- Schema/security lane сохраняет backup, restored-copy acceptance, signed
  checksum-pinned controller и post-effect dual-slot verification.
- Любое расхождение topology, receipt, runtime identity или current DB state
  останавливает effect до отдельного исправления.
