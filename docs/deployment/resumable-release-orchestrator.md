# Resumable blue/green release orchestrator

## Пакетная проверка и дисциплина повторов

Независимые local/CI gates запускаются одним bounded batch. Для каждого gate
обязательно сохраняются отдельные stdout/stderr и exit code; итоговая сводка
показывает все ошибки одного прохода, чтобы исправлять их одной группой.
Fail-fast применяется только перед production effect или в другой точке, где
продолжение способно изменить production, испортить immutable evidence либо
сделать последующие результаты недостоверными.

Перед повтором оператор читает durable error log целиком, фиксирует причину и
конкретно изменившееся условие. Неизменившийся полный batch не перезапускается.
После targeted-проверок изменённых причин выполняется один итоговый полный
batch. Это правило не разрешает параллельные production mutations и не
ослабляет фазовые fail-closed границы оркестратора.

Статус: **V2 production rollout завершён; V3 recovery, lane-aware metrics и root-authorized metrics retention реализованы в source. CURRENT191 bridge cutover остаётся незавершённым и не является production success.**

Актуально на: **09.09.2026**

Текущий CURRENT191 incident — operation
`8f70269b-e4f2-450c-b117-31e1375c68ce`: приняты `HYDRATE`, `BIND` и `SMOKE`,
но есть только pending `CUTOVER` intent. Physical DB остаётся
`CURRENT_190/190`; при этом оба runtime slot contracts recovery уже exact
`CURRENT_191/191`, `ALLOW_CURRENT_190/OFF`. Public nginx обслуживает active blue
`fa21bbe99be78313a883893b2dd6dc1d7c892777`; inactive green —
`f590875064bb84c7baf0d5665ef2d6856827df6a`. Нет CUTOVER evidence/receipt,
shared cutover intent и смены active generation. Это защищённая пауза, а не
причина вручную переключать nginx, env, link или operation records.

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
валидный `final.json` либо узкий terminal `superseded.json`; read-only `status`
остаётся доступен для диагностики.

Только отдельный `apply` с точным `planSha256` создаёт immutable
`approval.json` и начинает effect. `resume` не может создать approval и
продолжает только уже одобренный exact plan. Как и прежде, сам запуск `apply`
требует отдельного production GO владельца.

### Terminalize stale operation до runtime effect

`supersede-pre-runtime` — единственный допустимый способ закрыть V3 operation,
которую нужно заменить новым admitted release до первого runtime effect:

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator \
  supersede-pre-runtime \
  --operation-id <existing-uuid-v4> \
  --plan-sha256 <existing-plan-sha256> \
  --replacement-release-sha <different-exact-admitted-sha>
```

Команда допускается только для approved V3 operation, у которой нет `final.json`,
ровно `0` accepted phase receipts и существует только pending `HYDRATE` intent.
До terminalization она заново сверяет неизменённые baseline/accepted-cutover
continuity прежнего plan, установленную control attestation replacement SHA,
равенство `effectiveLane` и то, что replacement SHA отличается от исходного.
Новый SHA не наследует approval, plan, phase receipt или authority старой
операции.

При успехе controller публикует ровно один immutable
`superseded.json` (`root:root 0400`) в исходном operation directory. Он связывает
старый plan/approval/pending HYDRATE intent, baseline/cutover evidence и новую
installed-control attestation, но не изменяет runtime, DB, active link, slot env,
systemd units или cutover generation. Это terminal audit/control state только
снимает inventory blocker и разрешает новый `prepare` для replacement SHA.

После любого accepted phase receipt, а также после появления любого `BIND`
intent/evidence/receipt, эта команда запрещена. Так же запрещены ручное удаление, переименование или редактирование operation
records, `approval.json`, phase records, `final.json` либо `superseded.json`:
missing/mutated record остаётся fail-closed incident, а не supersession.

Live-проверки replacement control и cutover continuity выполняются именно при
первой exclusive-публикации receipt. Повтор той же команды с теми же тремя
идентификаторами валидирует и возвращает уже существующий immutable receipt без
зависимости от более поздних rollout/cutover поколений. Новый `prepare` отдельно
проверяет installed control уже для запрошенного им exact release; authority из
старого `superseded.json` никогда не переносится дальше.

### Terminalize после доказанного отката не принятого BIND

`supersede-after-bind-rollback` — отдельное, более узкое terminalize-исключение
для единственного случая, когда `HYDRATE` уже принят, а следующий `BIND`
остановился fail-closed **до** phase evidence/receipt, и exact slot bind был
сразу восстановлен receipt-bound rollback. Это не общий cancel и не способ
пропустить фазу:

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator \
  supersede-after-bind-rollback \
  --operation-id <existing-uuid-v4> \
  --plan-sha256 <existing-plan-sha256> \
  --replacement-release-sha <different-installed-admitted-sha> \
  --slot-bind-receipt-sha256 <exact-bind-receipt-sha256> \
  --slot-rollback-receipt-sha256 <exact-rollback-receipt-sha256>
```

Команда допускается только для exact второго `CURRENT191` cross-slot
`current191-bridge` plan: accepted phases — ровно `HYDRATE`; существует
единственный pending `BIND` intent; нет `BIND` phase evidence/receipt и нет
`final.json`. Она требует пару immutable receipt от штатного binder'а
`BIND → ROLLBACK` с тем же operation/slot и `PRIOR_STATE=BOUND`, где rollback
ссылается на SHA-256 исходного bind receipt. Target slot обязан уже указывать
на `PRIOR_RELEASE`, его protected env — byte-в-byte совпадать с сохранённым до
BIND backup и быть exact `CURRENT190 OFF/LIVE`; обе target units должны быть
unmasked, stopped и process-free.

Оператор обязан передать SHA-256 обоих exact receipt. Controller связывает их
с terminal record, сверяет `OPERATION_ID` latest index с receipt, а также
канонический временной порядок: quiesce intent → bind create/accept → rollback
create/accept. Поэтому случайная более поздняя receipt pair того же slot/release
не принимается без её явного digest-pinned выбора в recovery-команде.

Независимо от target evidence controller также сверяет, что active slot всё
ещё является exact plan previous `CURRENT191 ALLOW_CURRENT_190/OFF`, а accepted
cutover generation не изменилась относительно baseline. Replacement control
должен быть установлен, принадлежать той же effective lane и иметь иной SHA.
Любой drift, иной profile/head/count/flags, отсутствующий rollback receipt,
masked/running target или BIND phase receipt остаётся fail-closed incident.

Успех публикует только immutable `root:root 0400` `superseded.json` в старой
operation directory, связывающий plan/approval/HYDRATE intent, protected env
backup, bind/rollback receipts, baseline и replacement control. Команда не
меняет DB, runtime env, slot link, units, nginx или cutover generation и не
авторизует schema/runtime mutation. Идемпотентный повтор читает тот же terminal
record; следующий release всё равно начинает новый exact `prepare` и получает
собственный GO.

### Terminalize после SMOKE и доказанного binder rollback

`supersede-after-smoke-bind-rollback` — ещё более узкое fail-closed
исключение для первого inactive slot нового replacement rollout
`CURRENT191 current191-bridge`. Оно допустимо, когда `HYDRATE` и `BIND` уже
имеют accepted evidence/receipts, canonical `SMOKE` intent и отдельный SMOKE
unmask intent опубликованы, а `SMOKE` остановился до своего evidence/receipt.
Это не принимает неудачный smoke и не заменяет обычный `resume`:

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator \
  supersede-after-smoke-bind-rollback \
  --operation-id <existing-uuid-v4> \
  --plan-sha256 <existing-plan-sha256> \
  --replacement-release-sha <different-installed-admitted-sha> \
  --slot-bind-receipt-sha256 <exact-bind-receipt-sha256> \
  --slot-rollback-receipt-sha256 <exact-rollback-receipt-sha256>
```

Контроллер допускает только ровно две accepted phase receipts и единственный
pending `SMOKE` intent; plan обязан быть `current191-bridge`, а его current и
previous schema head/count — exact `CURRENT_191/191`. Оба явно переданных
digest должны обозначать штатную пару binder `BIND → ROLLBACK` того же
operation/slot: rollback ссылается на accepted BIND receipt и возвращает link
к `PRIOR_RELEASE`. Protected target env должен byte-в-byte совпасть с backup
до BIND и остаться exact `CURRENT191`, `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=
ALLOW_CURRENT_190`, `GUEST_BUG_REPORTING_MODE=OFF`. Target не может быть
active; API и Web instances обязаны быть unmasked, stopped и process-free.

Replacement — отдельный уже installed admitted control с иным release SHA,
иной control-attestation digest и той же effective lane. Нельзя переносить
authority старой operation в replacement: после terminal record новый release
проходит собственный `prepare`, approval и GO. Любое отсутствие canonical
SMOKE intent или SMOKE unmask intent, наличие SMOKE evidence/receipt,
несоответствие backup/link/receipt, running or masked target, manual env/link
change либо изменение operation record является fail-closed incident, а не
основанием повторить команды вслепую.

Успех создаёт только immutable `root:root 0400` `superseded.json`, связывающий
accepted BIND chain, pending SMOKE intent, backup env, оба binder receipt и
replacement control. Он не меняет DB, runtime env/link, units, nginx или
cutover generation. Ручное редактирование intent/evidence/receipt/
`superseded.json`, удаление operation directory или создание замещающих
records запрещены; повтор той же exact команды может лишь вернуть уже
опубликованный terminal record.

### Terminalize после принятого SMOKE и pending CUTOVER intent

`supersede-after-cutover-intent-bind-rollback` — единственный узкий recovery
маршрут для exact `CURRENT191 current191-bridge` operation, в которой `HYDRATE`,
`BIND` и `SMOKE` уже приняты, но `CUTOVER` остановился до evidence/receipt. Это
не допускает cutover задним числом и не ослабляет N-1 proof: readiness verifier
может признать legacy
`GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE` наряду с
`EXTERNAL_LANGAME_SIMPLE_ONBOARDING_SCHEMA_FORWARD_BRIDGE` **только** для exact
`CURRENT_190/190 -> CURRENT_191/191` bridge. Release/API/Web build identity,
source/target head/count, profile, flags, unfinished-migration и все остальные
readiness assertions остаются точными; любой иной переход или mode rejected.

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator \
  supersede-after-cutover-intent-bind-rollback \
  --operation-id <existing-uuid-v4> \
  --plan-sha256 <existing-plan-sha256> \
  --replacement-release-sha <different-installed-admitted-sha> \
  --slot-bind-receipt-sha256 <exact-bind-receipt-sha256> \
  --slot-rollback-receipt-sha256 <exact-rollback-receipt-sha256> \
  --slot-environment-restore-receipt-sha256 <exact-04-restore-receipt-sha256>
```

Непосредственно перед terminalizer штатный effect-mode вызывается отдельно с
тем же exact operation/plan и receipt pair:

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator \
  restore-slot-environment-after-cutover-intent-bind-rollback \
  --operation-id <existing-uuid-v4> \
  --plan-sha256 <existing-plan-sha256> \
  --slot-bind-receipt-sha256 <exact-bind-receipt-sha256> \
  --slot-rollback-receipt-sha256 <exact-rollback-receipt-sha256>
```

Gate принимает только ровно три accepted phase receipts, единственный pending
`CUTOVER` intent, отсутствие CUTOVER evidence/receipt и отсутствие shared
cutover intent. Active nginx link и accepted cutover generation обязаны всё ещё
совпадать с baseline и exact plan previous runtime; target остаётся inactive.
Replacement control уже installed/admitted, имеет другой release SHA и
control-attestation digest, но ту же effective lane.

Для текущего pending-CUTOVER recovery это только bridge-to-bridge re-pin:
previous и target runtime contracts — оба exact `CURRENT_191/191` с
`ALLOW_CURRENT_190/OFF`. Canonical rollback receipt должен вернуть target link
к exact `PRIOR_RELEASE=fa21bbe99be78313a883893b2dd6dc1d7c892777`, а не к
первому-bridge `CURRENT190 OFF/LIVE` состоянию.

До terminalizer оператор выполняет единственный допустимый порядок effect,
каждый шаг receipt-/byte-bound: **fence target units → canonical binder rollback
от exact BIND receipt → canonical
`restore-slot-environment-after-cutover-intent-bind-rollback` → unmask/reset-failed,
оставив units stopped/dead/PID=0/process-free → terminalize**. Restore mode получает
exact BIND/ROLLBACK digests, публикует immutable `04` restore intent/receipt и
crash-safe idempotently atomically возвращает только target slot env к byte-exact
pre-BIND backup, пока target masked/stopped. Ручной protected-env copy запрещён;
restore mode не меняет nginx, DB, slot link или units. Только после его receipt
допускается unmask без start. Terminalizer принимает оба binder digest **и**
`--slot-environment-restore-receipt-sha256`, проверяет их causality/operation/slot,
backup, restore receipt, link, fence и continuity, но сам не меняет nginx, DB,
env, units или slot link: он только exclusive-create публикует immutable `root:root 0400`
`superseded.json`. Любой manual effect, missing receipt, CUTOVER drift, running
или masked target, либо иной profile/head/count/flags остаётся fail-closed.

Только эти два recovery modes — canonical restore и terminalizer — держат тот
же hardened `/var/lib/leetplus/deploy-receipts/cutover.lock`, что штатный
blue-green cutover, дополнительно к orchestrator lock. Engine attest'ит
inherited cutover lock до env rename или terminal publication. Любой shared
cutover record `.intent`, `.intent.accepting.new` либо `.intent.recovering.new`
блокирует recovery. Обычные `apply`/`resume` этот lock заранее не берут: CUTOVER
фаза вызывает штатный cutover сама, чтобы не создать self-deadlock.
Новый release не наследует старый plan/approval/GO: после terminal receipt ему
нужны fresh exact `prepare`, approval и отдельный production GO.

### Immutable publication и slot-aware reconcile

`promote-release-artifact` публикует release ровно один раз по exact SHA в
`/srv/leetplus/releases/<SHA>`. Его immutable promotion intent и publication
attestation также адресуются SHA; поле `RELEASE_SLOT` в этих receipts означает
**только origin slot** первой публикации (`blue` или `green`), а не вечное
ограничение самого release на этот slot.

Повторное использование такого exact release в другом slot допускается только
когда canonical final directory `/srv/leetplus/releases/<SHA>` уже существует,
intent и attestation взаимно связаны exact digest/`RELEASE_SLOT`, а все их
остальные provenance, manifest и hydration поля проходят обычную строгую
проверку. Receipts при этом не переписываются и не создаются заново. Перед
reconcile обязательно выполняется `seal-release-artifact --dry-run` от
service-user **целевого** slot, поэтому доступность sealed tree доказывается
для фактической runtime identity.

Это исключение относится только к уже final-published release. Source/staging,
promotion/quarantine recovery и любая отсутствующая или незавершённая
publication остаются strict same-slot: origin `RELEASE_SLOT` обязан совпадать
с requested slot. Ручная правка receipt, slot env или release directory не
является recovery и останавливается fail-closed.

## Phase receipts и восстановление

Каждая фаза публикует canonical JSON строго в порядке:

1. `NN-<phase>.intent.json`;
2. `NN-<phase>.evidence.json`;
3. `NN-<phase>.receipt.json`.

Receipt связывает SHA-256 плана, intent, evidence, предыдущего terminal phase
receipt и installed-control attestation. Любой пропуск, будущая запись,
изменённый byte, неверный mode/path, receipt-chain drift или чужая cutover
generation останавливает продолжение.

| Фаза        | Effect                                                                                                                      | Точное восстановление после lost response                                                                                                                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HYDRATE`   | versioned hydration unit + immutable promotion                                                                              | existing sealed release принимается только через тот же hydration receipt; promoter выполняет собственный reconcile                                                                                                                                                                                 |
| `BIND`      | persistent exact instance masks + `--now`, reset failed state, cache preparation, inactive slot link и atomic slot-env bind | повтор оставляет target fenced; cache повторяется не более трёх раз только после обычного non-zero exit и повторной проверки `masked/inactive/dead/PID=0`; pending binder intent продолжает только `reconcile`; previous slot-env bytes сохраняются root-only и принимаются только по exact lineage |
| `SMOKE`     | снять exact masks, enable/start target API/Web, loopback readiness и authenticated reads                                    | unmask/start повторяются идемпотентно; loopback readiness ждёт startup bounded-серией, но ambiguous/timeout/oversize/stderr не повторяются; invocation IDs и результаты должны совпасть                                                                                                             |
| `CUTOVER`   | штатный atomic nginx switch с watchdog                                                                                      | pending child intent проходит `recover-pending`; terminal successor принимается только как baseline generation + 1 с exact target и previous-runtime contract; диагностический stderr после exit 0 допустим только когда такой exact receipt уже durable и active link совпал                       |
| `POSTCHECK` | public readiness + authenticated reads                                                                                      | read-only проверки повторяются; active link и accepted cutover receipt должны остаться теми же                                                                                                                                                                                                      |

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

- `current191-bridge` разрешён только на inactive slot. Обычный source этого
  slot — admitted `CURRENT_190/190` с `bridge=OFF` и `reporting=LIVE`; target
  получает только `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_190` и
  `GUEST_BUG_REPORTING_MODE=OFF`. Для восстановления частично завершённого
  rollout допускается также exact source `CURRENT_191/191` уже в
  `ALLOW_CURRENT_190/OFF`: профиль только перепривязывает этот bridge slot к
  новому exact admitted release SHA, не меняя runtime flags и не выполняя DDL.
  После первого bridge cutover второй inactive slot может всё ещё быть exact
  `CURRENT_190/190 OFF/LIVE`, хотя previous-поля нового plan уже относятся к
  активному `CURRENT_191/191 ALLOW_CURRENT_190/OFF`. Этот cross-slot переход
  допускается только когда protected active env точно совпадает с previous
  release/head/count и bridge flags plan, а immutable backup target env точно
  совпадает с `PRIOR_*` принятого bind receipt и exact CURRENT190 source.
  Любой иной head/count, набор flags, отсутствующий `BOUND` origin или попытка
  применить исключение к `preserve`/`current191-final` отклоняется.
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
exact plan/cutover для второго slot. Во втором plan previous runtime описывает
активный первый bridge slot, а прежний CURRENT190 target origin подтверждается
bind receipt и immutable slot-env backup; это не разрешает ручную правку
previous-полей или target env. Только после committed schema и exact
database-controller `check` создаётся новый plan с `current191-final` для
текущего inactive slot; после его cutover тем же образом завершается второй
slot, а затем запускается CURRENT191 CLI `final-check`.

Если новый admitted SHA потребовался между двумя bridge cutover, inactive slot
с `CURRENT191 ALLOW_CURRENT_190/OFF` проходит отдельный `current191-bridge`
re-pin plan к этому SHA. Это единственный разрешённый bridge-to-bridge переход:
оба runtime flags сохраняются, live DB readiness выполняется заново, а новый
plan/approval/phase chain не переиспользует receipts предыдущей операции.

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

Если `status` доказывает approved V3 operation с единственным pending
`HYDRATE` intent и нулём accepted phase receipts, а новый exact admitted SHA
должен заменить её до runtime effect, используется только отдельный terminalize
command; затем создаётся новый plan, а не `resume` старого:

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator \
  supersede-pre-runtime \
  --operation-id <old-uuid-v4> \
  --plan-sha256 <old-exact-plan-sha256> \
  --replacement-release-sha <different-exact-admitted-sha>
```

`superseded.json` не является runtime release receipt и не заменяет production
GO для replacement. Он разрешён лишь до accepted `HYDRATE` receipt; после
любой accepted phase/BIND остаётся только same-plan `resume` или отдельный
fail-closed incident workflow. Удалять/править старую operation directory,
чтобы освободить новый `prepare`, запрещено.

Единственное исключение из этой последней границы описано выше:
`supersede-after-bind-rollback` применим не после accepted BIND, а только после
accepted `HYDRATE` и доказанного receipt-bound восстановления **не принятого**
BIND exact CURRENT191 second-slot bridge. Он не заменяет `resume`, rollback
или database controller.

Накопительная read-only сводка:

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-resumable-release-orchestrator metrics
```

Она читает только canonical root-owned operation и обезличенные attempt
records. Внешних запросов, DB, systemd/service/timer probes и новых файлов при
самом чтении нет. Для каждой trusted lane выводятся approval→final и
phase intent→receipt p50/p95, failure-phase histogram, terminal
`supersededOperationCount` и unresolved count. Пока
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

`leetplus-rehearsal` может быть supplementary member группы
`leetplus-runtime` только внутри restored-copy rehearsal gate. После любого
terminal PASS/FAIL, interrupted/reconciled gate или cleanup этот membership
удаляется до следующей production операции. Persistent membership запрещён:
preflight cache/BIND/cutover рассматривает его как privilege residue и
останавливается fail-closed. Эта временная identity не получает runtime,
database или cutover authority.

Интеграционный тест в Fast CI и Full Release Admission покрывает happy path,
lost response до evidence и после durable evidence каждой из пяти фаз,
installed-control drift, plan/receipt tampering, чужую cutover generation,
failed-state normalization, bounded cache/readiness retry, slot-env lineage и
legacy bind-host normalization, reporting/bridge pair, exhaustion exact 12
readiness attempts и accepted-cutover recovery после диагностического stderr,
включая запрет receipt без совпавшего active nginx link.
