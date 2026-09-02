# Ускорение безопасного release pipeline

Статус: **5/8 backlog items implemented, source/CI only**

Актуально на: **02.09.2026**

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

Manifest остаётся source/CI contract и намеренно не устанавливается в
production-control generation. Поэтому он не заменяет live read-only probes,
installed generation verifier, signed plan, runtime receipts или отдельный GO.
Тот же contract теперь используется в disposable production twin; это не
добавляет новую production authority и не обращается к production host.

## Этапы

### 1. Disposable dual-slot production twin — реализован

Root-isolated Linux fixture поднимает обе systemd slot-пары с checked-in
templates и минимальными HTTP listeners на exact production ports. Live
verifier проверяет effective API/Web EnvironmentFiles, User/Group, process
UID/GID/supplementary groups и exclusive listener ownership. Negative drift
добавляет лишний API EnvironmentFile и обязан остановить verifier.

Затем fixture создаёт transient `leetplus-rehearsal` identity, доказывает, что
steady-state её отклоняет, запускает systemd process с ровно двумя разрешёнными
группами и полностью удаляет identity. Cleanup считается terminal только при
отсутствии всех units, users/groups, paths и listeners. В том же authority CI
step после cleanup существующие slot-link и blue-green fixtures создают
независимые bind receipts и проигрывают cutover/rollback. Дополнительный сервер
или платный сервис не используется.

Первый exact Full Admission этого среза обнаружил ещё одну потерю времени:
внешний timeout Docker Hub возник до запуска child job, а `rerun failed jobs`
не смог переиспользовать уже созданный runtime candidate, потому что consumer
сам вычислял новый `run_attempt`. Теперь промежуточные non-deployable
runtime/control candidates имеют неизменное внутри workflow-run имя
`exact SHA + run_id`; producer при полном rerun атомарно заменяет их, а selective
rerun скачивает уже проверенный candidate. Deployable handoff payload и финальный
admission receipt остаются привязаны к producing `run_attempt`. Отдельный
regression-test запрещает вернуть attempt-bound имя промежуточного candidate.

### 2. Fail-closed impact classifier — реализован

Classifier получает base/head diff и выдаёт только повышение требований:

- Prisma/migration/DB controller/ACL → `L2`;
- auth, access scope, public guest boundary, systemd/nginx, worker или
  production-control → `L2`;
- обычный runtime код → не ниже `L1`;
- доказанный docs-only diff → `L0` и non-deployable receipt;
- неизвестный путь, generated artifact drift или смешанный набор → `L2`.

Результат сохраняется как artifact/receipt и повторно проверяется Full gate.
Ручной override может только повысить lane.

Канонический manifest
[`release-impact-classifier.json`](./release-impact-classifier.json) и CLI
[`classify-release-impact.mjs`](../../.github/scripts/classify-release-impact.mjs)
выдают детерминированный receipt для exact ancestor `base..head`. `L1` построен
как закрытый allowlist обычных application paths, а не как широкое `apps/**`:
новый путь по умолчанию становится `L2`. Rename намеренно разворачивается в
`delete + add`, поэтому перенос runtime-файла в Markdown не маскирует effect.

Отдельный первый job Fast/Full выбирает trusted base из PR merge-base или push
`before`; manual feature branch использует merge-base с `origin/main`. Force
push, schedule, manual `main`, отсутствующий base и иной неопределённый event
принудительно получают минимум `L2`. Только exact `L0_DOCS` пропускает тяжёлые
runtime/database jobs и не создаёт runtime candidate. `L1` и `L2` пока проходят
одинаковый существующий Full Admission; дальнейшее сокращение этих lanes требует
отдельных backlog items, а не неявного bypass.

Negative matrix проверяет docs/runtime/schema/auth/guest/unknown/mixed,
повышение minimum lane, tampered receipt, non-ancestor/head drift, повреждённый
manifest и runtime→docs rename. Workflow regression фиксирует, что root jobs
могут пропускаться только для exact `L0_DOCS`. Подробный контракт:
[`release-impact-classifier.md`](./release-impact-classifier.md).

### 3. Один deployable exact SHA

Изменения собираются в короткий release train. Full admission выполняется для
immutable merge-candidate, который и становится deployable SHA; последующее
изменение дерева инвалидирует admission. Docs-only commits после release не
вызывают повторный runtime deploy и не считаются новой production baseline.

Этот этап реализован отдельным exact-candidate receipt. Штатный путь теперь:
Fast CI на PR → merge → параллельные Fast и Full на одном exact merge SHA.
Только runtime-eligible `push` в `refs/heads/main` из exact main workflow может
дойти до final handoff. Manual/scheduled/feature Full остаётся разрешённым как
non-deployable validation, поэтому pre-merge проверка больше не создаёт второй
«почти admission» artifact. Final job повторно скачивает и проверяет
base/head/tree/impact/event/workflow authority перед публикацией payload.

Concurrency также привязана к exact event/SHA: последующий docs или runtime
merge не отменяет выполняющийся candidate. Для pull request Fast CI по-прежнему
отменяет superseded head, чтобы не тратить runner на заведомо устаревший diff.
Branch rules/merge queue не менялись; короткое окно release train остаётся
операционным правилом. Полный контракт:
[`release-candidate-admission.md`](./release-candidate-admission.md).

### 4. Параллельная подготовка и resumable rollout

Artifact build, backup transfer и disposable restored-copy можно выполнять
параллельно с независимыми CI jobs. Перед effect production controller повторно
связывает current DB identity, backup digest, exact artifact и topology receipt.
Hydration, slot bind, smoke, cutover и postcheck получают terminal phase
receipts; lost response продолжает ту же операцию вместо полного рестарта.

Первая половина этого этапа реализована контрактом
[`parallel-backup-restored-copy-evidence.md`](./parallel-backup-restored-copy-evidence.md).
Только deployable exact-main `L2` candidate может получить preparation receipt.
После final admission короткоживущий bind повторно проверяет exact runtime bytes,
installed control, live DB/topology, backup/off-host и restored-copy receipts,
а также zero pending intents. Оба решения намеренно nonauthorizing; schema-plan
должен отдельно подписать `effectBindingDigest`. Resumable hydration/cutover
phase orchestration остаётся `REL-ACC-007`.

## Что не меняется

- Production runtime остаётся exact `22ab6b81…`, CURRENT189, generation 20;
  этот source/CI срез не является deploy.
- Public guest, corporate tenant и workers/control-plane не объединяются ради
  ускорения.
- Schema/security lane сохраняет backup, restored-copy acceptance, signed
  checksum-pinned controller и post-effect dual-slot verification.
- Любое расхождение topology, receipt, runtime identity или current DB state
  останавливает effect до отдельного исправления.
