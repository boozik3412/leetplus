# Resumable blue/green release orchestrator

Статус: **V2 production rollout завершён; V3 recovery, lane-aware metrics и root-authorized metrics retention реализованы в source**

Актуально на: **03.09.2026**

## Назначение

`leetplus-resumable-release-orchestrator` объединяет штатные операции runtime
rollout в одну возобновляемую цепочку:

```text
HYDRATE -> BIND -> SMOKE -> CUTOVER -> POSTCHECK
```

Контроллер не заменяет существующие root-authoritative инструменты. Он вызывает
immutable hydration/promote, slot binder, readiness/authenticated smoke и
blue/green cutover из той же установленной production-control generation,
проверяя её до и после каждой незавершённой фазы.

Это не database migration controller. Контроллер не выполняет Prisma/SQL и не
меняет ACL или worker state. Для `L2_SCHEMA_SECURITY` backup,
restored-copy evidence, отдельный подписанный schema-plan и его exact
postcheck остаются обязательными до runtime rollout.

## Authority и effect boundary

Production разрешает запуск только через установленный bootstrap
`/usr/local/sbin/leetplus-resumable-release-orchestrator` (`root:root 0500`).
Bootstrap:

- удаляет inherited environment и использует exact `/usr/bin/node` major 22;
- непосредственно перед Node повторно строит environment через `env -i` из
  exact `PATH/LANG/LC_ALL/TZ` и двух bootstrap/lock ключей. Одного Bash
  `unset` недостаточно: Bash заново экспортирует `PWD`, `SHLVL` и `_`;
- проверяет root ownership, modes и SHA-256 установленного engine;
- сначала удерживает canonical production-control `install.lock`, затем единый
  root-only orchestrator lock; install lock наследуется каждым child command,
  а promoter повторно подтверждает тот же inode через fd 8;
- хранит records только в
  `/var/lib/leetplus/deploy-receipts/release-orchestrator/<operation-id>`.

Исключение — точные команды `metrics` и `metrics-retention-plan`: bootstrap
берёт non-blocking shared `install.lock` до проверки engine, но не берёт
orchestrator lock и не создаёт state. Это исключает гонку с install/rollout,
сохраняя обе команды read-only. `metrics-retention-apply` не входит в
исключение: он всегда использует exclusive `install.lock`, затем canonical
orchestrator lock.

`prepare` создаёт только `plan.json` с решением
`PREPARED_NOT_EFFECT_AUTHORIZATION`. План связывает exact target SHA/slot,
schema head/count, active rollback release, installed-control attestation и
latest accepted cutover generation/receipt. Для новых операций тот же plan
обязательно получает `effectiveLane=L1_RUNTIME|L2_SCHEMA_SECURITY` и SHA-256
impact receipt только из verified installed-control output. Он отказывает при pending child
intent, consumed rollback, неканоническом active upstream или уже активном
target slot. State inventory допускает только одну незавершённую orchestrator
operation: новый plan/apply блокируется, пока предыдущая цепочка не получила
валидный `final.json`; read-only `status` остаётся доступен для диагностики.

Только отдельный `apply` с точным `planSha256` создаёт immutable
`approval.json` и начинает effect. `resume` не может создать approval и
продолжает только уже одобренный exact plan. Как и прежде, сам запуск `apply`
требует отдельного production GO владельца.

## Phase receipts и восстановление

Каждая фаза публикует canonical JSON строго в порядке:

1. `NN-<phase>.intent.json`;
2. `NN-<phase>.evidence.json`;
3. `NN-<phase>.receipt.json`.

Receipt связывает SHA-256 плана, intent, evidence, предыдущего terminal phase
receipt и installed-control attestation. Любой пропуск, будущая запись,
изменённый byte, неверный mode/path, receipt-chain drift или чужая cutover
generation останавливает продолжение.

| Фаза | Effect | Точное восстановление после lost response |
| --- | --- | --- |
| `HYDRATE` | versioned hydration unit + immutable promotion | existing sealed release принимается только через тот же hydration receipt; promoter выполняет собственный reconcile |
| `BIND` | persistent exact instance masks + `--now`, reset failed state, cache preparation, inactive slot link и atomic slot-env bind | повтор оставляет target fenced; cache повторяется не более трёх раз только после обычного non-zero exit и повторной проверки `masked/inactive/dead/PID=0`; pending binder intent продолжает только `reconcile`; previous slot-env bytes сохраняются root-only и принимаются только по exact lineage |
| `SMOKE` | снять exact masks, enable/start target API/Web, loopback readiness и authenticated reads | unmask/start повторяются идемпотентно; loopback readiness ждёт startup bounded-серией, но ambiguous/timeout/oversize/stderr не повторяются; invocation IDs и результаты должны совпасть |
| `CUTOVER` | штатный atomic nginx switch с watchdog | pending child intent проходит `recover-pending`; terminal successor принимается только как baseline generation + 1 с exact target и previous-runtime contract; диагностический stderr после exit 0 допустим только когда такой exact receipt уже durable и active link совпал |
| `POSTCHECK` | public readiness + authenticated reads | read-only проверки повторяются; active link и accepted cutover receipt должны остаться теми же |

Если evidence успел стать durable, а ответ/receipt потерян, `resume` не
дописывает receipt вслепую: он повторно исполняет идемпотентную проверку фазы и
сравнивает стабильные authority-поля с записанным evidence. Завершение
публикует `final.json` с решением `ROLLOUT_PHASES_COMPLETED`. Предыдущий slot
контроллер не останавливает — он остаётся hot rollback.

Каждый запуск `apply|resume` дополнительно публикует append-only metric attempt
в отдельном root-only каталоге. Запись содержит только trusted lane, время
старта/завершения, outcome, failure phase и нормализованный reason class; в ней
нет operation/release identifiers, SHA, путей, environment, command output или
PII. Эти записи не заменяют authoritative phase/final receipts.

До BIND target slot может быть предыдущим hot rollback и поэтому оставаться
`active/enabled`. BIND сам создаёт persistent instance masks для обеих unit с
`systemctl mask --now`, после чего cache и slot link могут меняться только при
доказанно `masked/inactive/process-free` состоянии. Маски снимаются лишь в
SMOKE непосредственно перед enable/start. Сбой до SMOKE оставляет public active
slot неизменным, а target — безопасно fenced; `resume` продолжает ту же
operation, не требуя ручной правки link или records. Отдельные durable
quiesce/unmask intents связаны с plan и phase intent: контроллер не принимает и
не снимает pre-existing operator mask, а после interrupted `mask --now` может
продолжить только маски, созданные уже внутри той же operation. Эта схема
использует record contract `LEETPLUS_RESUMABLE_RELEASE_ORCHESTRATOR_V3`.

V3 также делает `/etc/leetplus/slots/<slot>.env` частью BIND evidence. До
изменения проверяются exact `root:leetplus-runtime 0440`, один hard link,
canonical keys/ports, previous release/schema lineage и допустимая пара
reporting/bridge flags. Старые bytes атомарно сохраняются в operation directory
как `root:root 0400`; новый файл меняет release SHA, Web build ID, ожидаемый
schema head/count и plan-bound release-window timestamp. Дополнительно exact
legacy input `API_BIND_HOST=localhost`, обнаруженный на production, только
после `masked/inactive/dead/PID=0` нормализуется к canonical
`API_BIND_HOST=127.0.0.1`; evidence явно пишет
`LEGACY_LOCALHOST_TO_IPV4_LOOPBACK`. Уже canonical input пишет `NONE`, а
`::1`, `localhost.`, DNS names и другие aliases запрещены. Ports,
`GUEST_BUG_REPORTING_MODE` и `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE` сохраняются,
кроме узкого CURRENT191 runtime-profile ниже. Любой неизвестный key, смена
security flag вне этого профиля, чужой previous SHA, symlink/hardlink или drift
между old/new exact bytes останавливает запуск target.

### Узкий CURRENT191 slot runtime-profile

Установленный orchestrator допускает только два profile значения
`--slot-runtime-profile current191-bridge|current191-final`. Они не являются
общим writer для feature flags и принимаются только для exact target
`CURRENT_191/191` с migration
`20260908180000_external_langame_simple_onboarding` и count `191`.

- `current191-bridge` разрешён только на inactive slot: source этого slot должен
  быть admitted `CURRENT_190/190` с `bridge=OFF` и `reporting=LIVE`; target
  получает только `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_190` и
  `GUEST_BUG_REPORTING_MODE=OFF`.
- `current191-final` разрешён только на inactive slot: source этого slot должен
  уже быть exact target `CURRENT_191/191` с `ALLOW_CURRENT_190/OFF`; target
  получает только `OFF/LIVE`. Prepare дополнительно требует
  `--current191-check-receipt-sha256`: exact digest `root:root 0400` receipt,
  который CURRENT191 CLI создаёт только после успешного live `check`. Receipt
  привязан к release SHA, schema-plan digest, target head/count/checksum и
  database/dual-slot bridge evidence. `checkedAt` является точным audit-полем,
  но не TTL: один immutable receipt используется для обоих последовательных
  final plan. После первого final cutover новый check, требующий два bridge
  slots, уже невозможен, поэтому expiry между cutover нарушил бы resumability.
  Файл публикуется exclusive-create как
  `/var/lib/leetplus/deploy-receipts/external-langame-current191-<sha256>.check.json`;
  имя и exact bytes обязаны совпасть с переданным digest.

Каждый profile выполняется отдельно для одного inactive slot через обычные пять
фаз. Profile и, для final, check receipt входят в plan digest и тем самым во всю
цепочку phase receipts; следующий plan опирается на latest accepted cutover.
После переключения прежний active slot становится единственным допустимым
следующим inactive target. Нельзя менять оба slot одним plan, завершить rollout
с bridge на любом slot или подменять profile ручным изменением
`/etc/leetplus/slots/*.env`.

Plan, approval и все phase receipts по-прежнему связаны exact `planSha256`.
При timeout или lost response сначала используется `status`, затем только
`resume` с тем же operation ID и digest. После bridge profile database
controller выполняет свой exact `check`, сохраняет защищённый receipt, и его
SHA-256 передаётся в каждый final plan до bridge-off. В обоих plan orchestrator
заново сверяет immutable bytes и authority receipt; перед каждым effect source
slot обязан оставаться тем же release в `CURRENT191 ALLOW_CURRENT_190/OFF`, а
runtime readiness заново сверяет live DB. Поэтому отсутствие TTL не расширяет
допустимый target или доступ, но позволяет безопасно завершить второй slot после
паузы или разрыва SSH. После обоих `current191-final` операций external-Langame
CURRENT191 CLI выполняет `final-check`; лишь затем возможен terminal
orchestrator postcheck. Эти profile не выполняют DDL и не заменяют signed
database controller.

## Первый production rollout

03.09.2026 exact admitted release
`f3f119fa81fc497b75cc1e57f046d8539676c943` прошёл все пять фаз и переключил
production на active blue generation 21; green `22ab6b81…` сохранён hot
rollback. Public и loopback API/Web, authenticated reads и CURRENT189 postcheck
успешны, pending record отсутствует. Schema, ACL, guest flags и worker state не
менялись.

V2 корректно сохранил доступность и позволил продолжать тот же exact plan, но
потребовал несколько быстрых `resume`: transient cache process cleanup,
systemd failed state после stop, отсутствующий automatic slot-env bind,
ранний readiness probe и уже принятый cutover с диагностическим stderr. V3
автоматизирует ровно эти безопасные recovery cases; чужой receipt или
неоднозначный effect по-прежнему требует остановки и разбора.

## Операторский интерфейс

Подготовка плана (не effect):

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator \
  prepare \
  --operation-id <uuid-v4> \
  --release-sha <exact-admitted-sha> \
  --slot blue \
  --expected-migration <current-migration> \
  --expected-migration-count <count> \
  --previous-release-sha <active-exact-sha> \
  --previous-migration <active-migration> \
  --previous-migration-count <count> \
  --previous-web-build-id <active-exact-sha> \
  --slot-runtime-profile current191-bridge \
  --watchdog-seconds 30
```

Для обычного rollout параметр profile не передаётся. Для CURRENT191 сначала
используется `current191-bridge` ровно на одном inactive slot, затем отдельный
exact plan/cutover для второго slot. Только после committed schema и exact
database-controller `check` создаётся новый plan с `current191-final` для
текущего inactive slot; после его cutover тем же образом завершается второй
slot, а затем запускается CURRENT191 CLI `final-check`.

Для обоих final plan передаётся один и тот же exact receipt из успешного
dual-bridge `check`; его нельзя обновлять или заменять между slot cutover:

```bash
  --slot-runtime-profile current191-final \
  --current191-check-receipt-sha256 <exact-check-receipt-sha256>
```

После независимой сверки plan и отдельного production GO:

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator \
  apply --operation-id <uuid-v4> --plan-sha256 <exact-plan-sha256>
```

После timeout, разрыва SSH или неоднозначного ответа сначала выполняется
read-only status, затем exact resume:

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator \
  status --operation-id <uuid-v4> --plan-sha256 <exact-plan-sha256>
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator \
  resume --operation-id <uuid-v4> --plan-sha256 <exact-plan-sha256>
```

Накопительная read-only сводка:

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator metrics
```

Она читает только canonical root-owned operation и обезличенные attempt
records. Внешних запросов, DB, systemd/service/timer probes и новых файлов при
самом чтении нет. Для каждой trusted lane выводятся approval→final и
phase intent→receipt p50/p95, failure-phase histogram и unresolved count. Пока
одна lane не накопила 20 terminal operations, процентили равны `null` с
`INSUFFICIENT_SAMPLE_SIZE`. Единственный исторический V2 rollout валидируется
по своей точной terminal schema как `LEGACY_UNCLASSIFIED` и не влияет на lane
percentiles; incomplete или повреждённая V2/V3 цепочка отклоняет отчёт. Reader
fail-closed ограничивает live inventory `16 384` attempt records. Команда
`metrics` записи не удаляет и не ротирует; для этого существует только
отдельная двухфазная процедура ниже.

### Retention обезличенных attempt records

Рекомендуемая операционная точка — до `10 000` live files, с сохранением
последних `4 096`:

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator \
  metrics-retention-plan --retain-attempt-count 4096
```

Plan является детерминированным и nonauthorizing: он связывает exact live и
archive inventory, per-file digests, оставляемое окно и segments не более 512
записей. Он ничего не создаёт. После независимой сверки `plan` и его SHA-256
оператор отдельно запускает effect:

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator \
  metrics-retention-apply \
  --retain-attempt-count 4096 \
  --plan-sha256 <exact-plan-sha256>
```

Apply допускает только root-installed authority и порядок exclusive
`production-control install.lock -> orchestrator.lock`. Незавершённая rollout
operation, изменённый source/archive inventory, другой count или plan digest
останавливают effect. Процедура не принимает произвольные paths/record IDs и не
обращается к DB, systemd, runtime, timers или сети.

Archive публикуется в sibling-каталоге
`/var/lib/leetplus/deploy-receipts/release-orchestrator-metrics-archive`:
canonical manifest, один или несколько immutable segments и terminal receipt
имеют `root:root 0400`, каталог — `0700`. Каждый segment содержит исходный уже
обезличенный metric record, его UUID filename и SHA-256; release/operation SHA,
environment, command output и PII не добавляются. Сначала все segment bytes
fsync/publish/reopen проходят полную проверку, затем exact live copies
удаляются и fsync выполняется для live directory; receipt публикуется последним.

Если ответ потерян между этими шагами, durable manifest является единственным
разрешением продолжить. Обычные `metrics`, новый retention plan и rollout
`apply|resume` fail-closed блокируются, пока exact
`metrics-retention-apply --plan-sha256` не закончит тот же plan. Replay допускает
только исходный retained inventory плюс ещё не удалённые exact planned files;
новая или изменённая live-запись запрещена. Уже опубликованный segment не
перезаписывается, exact duplicate live copy не считается дважды.

Диагностический reader остаётся bounded: максимум `4 096` archive files,
`128 MiB` archive bytes и `131 072` archived attempts. Это не разрешение удалить
authoritative operation directories: duration p50/p95 по-прежнему читаются из
terminal receipt chains, для которых действует отдельный предел `4 096`.
Будущий operation-history archive обязан сохранить status/replay semantics и
оформляется отдельным controller до достижения этого объёма.

Нельзя начинать новую операцию, редактировать records или вручную увеличивать
generation, пока предыдущая цепочка не получила terminal status либо не была
разобрана отдельной fail-closed процедурой.

## Security contours

Orchestrator является только production-control coordination layer и не
образует новый runtime-контур. Public guest продолжает проверяться public
readiness/cutover watchdog, corporate tenant — authenticated catalog smoke,
workers/control-plane — отдельными unit/controller gates. Ни один результат
одного контура не подменяет admission другого.

Интеграционный тест в Fast CI и Full Release Admission покрывает happy path,
lost response до evidence и после durable evidence каждой из пяти фаз,
installed-control drift, plan/receipt tampering, чужую cutover generation,
failed-state normalization, bounded cache/readiness retry, slot-env lineage и
legacy bind-host normalization, reporting/bridge pair, exhaustion exact 12
readiness attempts и accepted-cutover recovery после диагностического stderr,
включая запрет receipt без совпавшего active nginx link.
