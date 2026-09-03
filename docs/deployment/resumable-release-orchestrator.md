# Resumable blue/green release orchestrator

Статус: **V2 production rollout завершён; V3 one-shot recovery hardening реализован в source и требует exact admission**

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

Это не database migration controller. Контроллер не выполняет Prisma/SQL, не
меняет ACL, worker state или security flags. Для `L2_SCHEMA_SECURITY` backup,
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

`prepare` создаёт только `plan.json` с решением
`PREPARED_NOT_EFFECT_AUTHORIZATION`. План связывает exact target SHA/slot,
schema head/count, active rollback release, installed-control attestation и
latest accepted cutover generation/receipt. Он отказывает при pending child
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
`GUEST_BUG_REPORTING_MODE` и `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE` сохраняются.
Любой неизвестный key, смена security flag, чужой previous SHA, symlink/hardlink
или drift между old/new exact bytes останавливает запуск target.

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
  --watchdog-seconds 30
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
