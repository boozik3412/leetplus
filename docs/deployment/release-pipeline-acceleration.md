# Ускорение безопасного release pipeline

Статус: **REL-ACC-001..009 implemented; REL-ACC-010 incremental control-state rehearsal в работе**

Актуально на: **04.09.2026**

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
phase orchestration теперь реализована отдельным
[`resumable-release-orchestrator`](./resumable-release-orchestrator.md).

Orchestrator фиксирует nonauthorizing exact plan, а после отдельного
production GO выполняет пять фаз `HYDRATE -> BIND -> SMOKE -> CUTOVER ->
POSTCHECK`. Для каждой фазы durable intent/evidence/receipt связан с plan,
installed production-control и предыдущим phase receipt. Потерянный ответ не
запускает весь rollout заново: hydration/promotion, bind reconcile, idempotent
service start/probes и cutover recovery повторно подтверждают только текущую
незавершённую фазу. Чужая generation, изменённый control byte/record или
расхождение active link останавливают продолжение. Previous slot остаётся hot.
Production-control install lock удерживается через всю operation; promoter
принимает только тот же унаследованный и повторно проверенный lock inode.

Первый production preflight 02.09.2026 установил и проверил admitted
production-control generation, но не создавал plan и не менял runtime/nginx/DB:
code/live topology review обнаружил, что прежний BIND вызывал cache и binder без
перехода hot-rollback target из `active/enabled` в требуемое
`masked/inactive`. Successor делает этот переход частью resumable контракта:
BIND выполняет persistent exact `mask --now` API/Web, cache принимает exact
root-owned mask, slot binder повторно проверяет обе fenced units, а SMOKE
снимает masks перед enable/start. При сбое public active slot не меняется;
resume продолжает ту же operation с target, оставленным fenced.

Exact successor из PR #121 прошёл pre/post-merge Fast и Full Admission как
`be907cf0…`; его production-control generation установлена и повторно проверена
root verifier. Первый `prepare` 03.09.2026 снова остановился до plan/effect:
production Bash после очистки environment синтезировал экспортируемые `PWD`,
`SHLVL` и `_`, тогда как engine корректно разрешает только шесть exact ключей.
PR #122 перенёс финальный `env -i` непосредственно перед Node и добавил
disposable-root запуск exact installed bootstrap.

Post-merge Fast CI `33718092094` и Full Release Admission `33718092121` для
exact `f3f119fa81fc497b75cc1e57f046d8539676c943` завершились `SUCCESS`.
Immutable runtime/control handoff был установлен и verified, после чего один
approved plan прошёл все пять фаз. Production теперь active blue generation 21
на `f3f119fa…`; hot rollback green `22ab6b81…` остаётся active. Public и
loopback API/Web, authenticated reads, CURRENT189 и worker timers прошли
postcheck; schema, ACL и security flags не менялись.

Один exact plan не потребовал нового SHA/admission, однако V2 понадобились
несколько коротких resume. Live evidence локализовал пять late cases: transient
cache cleanup, systemd `failed` после stop, отсутствие atomic slot-env bind,
readiness раньше завершения Nest startup и уже accepted cutover с
диагностическим stderr. V3 successor делает их частью того же fail-closed
контракта: bounded cache retry только под повторно проверенным fence,
`reset-failed` с exact inactive/dead/PID=0, root-only previous slot-env backup и
atomic lineage-bound update. Фактический legacy `API_BIND_HOST=localhost`
разрешён только как bounded input после полного target fence и всегда
нормализуется к canonical `127.0.0.1`; любой другой alias запрещён. Readiness
повторяется bounded только после обычного failure, а cutover stderr принимается
лишь по exact durable successor receipt и совпавшему active link.
Timeout, oversized output, чужая generation, изменённые flags или receipt drift
не повторяются и не принимаются.

V3 hardening объединён в `main` через PR #123 как exact merge
`c955e99e77a63ce959045fd75c2bbf2259dc62c4`. Production для этого source-only
изменения не переключался; post-merge Fast `33728044375` и Full `33728044457`
завершились `SUCCESS`, а фактическим baseline остаётся generation 21 ниже.

Этот successor не включает schema, ACL, worker или security-flag effects: L2
продолжает использовать параллельный evidence binding и отдельно подписанный
database/security controller.

## Что не меняется

- Production runtime по последнему каноническому evidence — active blue exact
  `f3f119fa…`, CURRENT189, generation 21; hot rollback green `22ab6b81…`
  остаётся independently ready.
- Public guest, corporate tenant и workers/control-plane не объединяются ради
  ускорения.
- Schema/security lane сохраняет backup, restored-copy acceptance, signed
  checksum-pinned controller и post-effect dual-slot verification.
- Любое расхождение topology, receipt, runtime identity или current DB state
  останавливает effect до отдельного исправления.

Восьмой backlog item реализует измерительный контур без нового внешнего сервиса.
Final admission schema 2, immutable runtime/control provenance и root-only
installed-generation receipt переносят exact `effectiveLane` и SHA-256 impact
receipt до orchestrator plan; ручная метка lane не принимается. Каждый
`apply|resume` пишет append-only attempt record только с lane, временем,
результатом, фазой и нормализованным классом причины — без operation ID, SHA,
путей, environment, command output или пользовательских данных.

Read-only команда `metrics` берёт shared production-control install lock и
читает только canonical root-owned operation/attempt receipts: она не создаёт
state, не берёт rollout lock и не обращается к DB, runtime units, timers или
сети. Отчёт содержит duration approval→final, intent→receipt по каждой фазе,
failure-phase histogram, unresolved inventory и p50/p95 отдельно для
`L1_RUNTIME`/`L2_SCHEMA_SECURITY`. До 20 terminal samples lane возвращается
`INSUFFICIENT_SAMPLE_SIZE` с `p50/p95=null`. Реальный первый V2 rollout не имеет
trusted lane provenance, поэтому проходит отдельный exact V2 terminal reader,
помечается `LEGACY_UNCLASSIFIED` и не входит в lane percentiles. Метрики не
разрешают deploy и не ослабляют ни один gate.

REL-ACC-008 объединён в `main` через PR #124 как exact merge
`5d6c0eb3623e66da2009e9f578053fa39da2ee66`. Exact-head Fast
`33733457026` и manual Full `33734441310`, затем post-merge Fast
`33736086893` и Full `33736086906` завершились `SUCCESS`. Admission до merge
fail-closed обнаружил и остановил два trust-chain расхождения: чтение JSON
receipt через parser формата `KEY=value` и stale SHA-256 hydration-controller.
Оба были исправлены и повторно доказаны на новом exact head. Production для
этого source/control изменения не переключался; метрики станут доступны со
следующей отдельно одобренной admitted production-control generation.

REL-ACC-009 закрывает operational retention до достижения live reader cap.
Отдельный read-only `metrics-retention-plan` под shared install lock выдаёт
детерминированный exact source/archive plan. Только явный root-only
`metrics-retention-apply` с тем же count и SHA-256 получает exclusive
`install.lock -> orchestrator.lock`: он публикует и повторно проверяет immutable
raw-record segments до удаления exact live copies, а terminal receipt пишет
последним. Lost response возобновляет только тот же plan; незавершённый archive
блокирует metrics, новый retention plan и rollout `apply|resume`. Reader
продолжает считать live+archive без дублей и имеет отдельные bounds: `4 096`
archive files, `128 MiB`, `131 072` archived attempts. Процедура не обращается к
DB, runtime/systemd, workers или сети и не является production deploy. Предел
`4 096` terminal operation directories для duration percentiles остаётся
отдельным будущим receipt-chain retention boundary; REL-ACC-009 их не удаляет.

REL-ACC-010 добавлен по результату Langame preflight 04.09.2026. Disposable
topology twin доказывал fresh install, но не воспроизводил переход от уже
принятого immutable N−1 activation receipt к additive unit manifest. Поэтому
production до runtime effect обнаружил сразу два контракта, которые должны
были быть видны в CI: stale predecessor manifest digest и systemd-состояние
oneshot service `static` при disabled timer.

Новый gate должен начинаться не с пустого state root, а с exact historical
receipt/manifest fixture и проигрывать весь lifecycle:

1. Установка новой control generation поверх старого immutable evidence.
2. Pinned additive manifest-successor `plan/apply/check` без route, DB или
   start/stop/enable effects; old receipt остаётся byte-for-byte неизменным.
3. Durable fences для новых `OPTIONAL_DRAIN` units и повторный
   `verify-legacy-runtime-drain` + readiness `--require-drain`.
4. Отдельный exact canary permit с возвратом fences после bounded execution.
5. Отдельный live-timer permit после совпавшего canary evidence без ручного
   timer-profile запуска перед `enable --now`: возможный `Persistent=true`
   catch-up остаётся единственным daily execution. Остальные OPTIONAL units
   по-прежнему не получают исключения.
6. Crash/lost-response, tampered receipt, symlink/mount, wrong owner/mode,
   active worker, чужой release/env/tenant и lock contention negative matrix.
7. Реальный PID 1 positive path wrapper→active release, system D-Bus
   `MainPID/InvocationID` attestation, immediate persistent timer fire,
   PID/cgroup residue и полный digest-bound timer revoke/recovery. Если
   disposable GitHub runner не предоставляет system bus, fixture создаёт её
   только в private root, публикует exact socket атомарно и удаляет по
   PID/start-time/socket identity; production fallback не добавляется.

Это не сокращает L2 admission. Оно переносит ещё один класс live discovery в
тот же 15–20-минутный disposable Linux gate, чтобы один topology successor не
порождал цепочку новых SHA и почти суточный operator cycle.
