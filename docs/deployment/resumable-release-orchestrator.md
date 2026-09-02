# Resumable blue/green release orchestrator

Статус: **реализован в source/CI; production deployment требует отдельного GO**

Актуально на: **02.09.2026**

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
| `BIND` | cache preparation + inactive slot link | pending binder intent продолжает только `reconcile`; accepted link обязан иметь exact latest bind receipt |
| `SMOKE` | enable/start target API/Web, loopback readiness и authenticated reads | start/probes повторяются идемпотентно; invocation IDs и результаты должны совпасть |
| `CUTOVER` | штатный atomic nginx switch с watchdog | pending child intent проходит `recover-pending`; terminal successor принимается только как baseline generation + 1 с exact target и previous-runtime contract |
| `POSTCHECK` | public readiness + authenticated reads | read-only проверки повторяются; active link и accepted cutover receipt должны остаться теми же |

Если evidence успел стать durable, а ответ/receipt потерян, `resume` не
дописывает receipt вслепую: он повторно исполняет идемпотентную проверку фазы и
сравнивает стабильные authority-поля с записанным evidence. Завершение
публикует `final.json` с решением `ROLLOUT_PHASES_COMPLETED`. Предыдущий slot
контроллер не останавливает — он остаётся hot rollback.

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
installed-control drift, plan/receipt tampering и чужую cutover generation.
