# Controlled Beta-1: production canary и SHA-bound deploy

Статус: `F4 ARTIFACT + RESTORED-COPY + CRASH/N-1 ACCEPTED / OPERATIONAL SUCCESSOR AND PRODUCTION CANARY PENDING / PRODUCTION NO-GO`.

Актуальный машиночитаемый вход перед canary —
[`Gate 1MT operational preflight`](./gate-1mt-operational-preflight.md).
Исторические SHA/run/artifact ниже остаются audit trail и не допускаются как
текущий evidence: каждый новый canary manifest обязан ссылаться на exact
release SHA, свежие CI/browser/inventory/metrics/rollback receipts и exact
target fingerprints. Provider traffic в `CONTROLLED_CANARY` запрещён.

Этот документ — обязательная операционная последовательность для первого
внешнего `Tenant B/Store B1`. Он не разрешает выпуск по ветке, `git pull` или
из произвольной рабочей директории. Единственный разрешённый вход — exact
release artifact, созданный Full Release Admission для того же commit SHA.

## Superseded artifact evidence и новый candidate gate

Fast CI [`32383168039`](https://github.com/boozik3412/leetplus/actions/runs/32383168039)
и Full Release Admission
[`32383465076`](https://github.com/boozik3412/leetplus/actions/runs/32383465076)
принимали SHA `d157764254507ead76231a913c1ffa3b5f445ef5` как соответственно
`2/2 SUCCESS` и `4/4 SUCCESS`. Artifact `leetplus-release-d1577642…` имеет
GitHub artifact ID `9412379741`; проверенный downloaded raw archive имеет
`28 563 679` bytes и SHA-256
`0c8d7202e6afd5b58556b4a74b45842ef7e98fff34358cb00132d1665bafabb9`.

Этот artifact теперь **SUPERSEDED / PRODUCTION FORBIDDEN**. Он предшествует
production SHA `7de04ff4ccc814494810730be3fa6bf661097b07` и не содержит четыре
production fixes, включая требуемый показ активных предупреждений за весь
период. Кроме того, его single-instance switch и raw migration path не
обеспечивают N/N-1 compatibility и zero-downtime rollback. Ни stage evidence,
ни старый зелёный CI не разрешают его запуск.

Следующий промежуточный exact SHA
`a34eae8e23f5a006662c7e1d850018aad1d3fa36` прошёл Fast CI
[`32413776104`](https://github.com/boozik3412/leetplus/actions/runs/32413776104)
и Full Release Admission
[`32414068403`](https://github.com/boozik3412/leetplus/actions/runs/32414068403),
который выпустил `leetplus-release-a34eae8e…`. Этот artifact также теперь
**SUPERSEDED / PRODUCTION FORBIDDEN**: прежняя Full CI matrix не запускала
production-history adapter на реальном PostgreSQL 16. Локальный faithful
`153/4/0` baseline последовательно выявил SQL blockers `42601`, `42P10` и
`42703`. Исправления находятся только в worktree; они ещё не имеют clean SHA,
зелёного CI и нового artifact. Дополнительно исправлены `/32` в live identity,
UTC-интерпретация legacy timestamps и package-cwd зависимость Git fixture.

После исправлений read-only inventory подтверждает exact `153/4/0`, четыре
stale rows с aggregate digest `a6b20…`, exact role/ownership topology и zero
ownership mismatch без database effects. Отдельный opt-in gate затем прошёл на
изолированном PostgreSQL `16.15`: `1/1`, с exact `153/4`, четырьмя legacy rows,
реальными `lock → recover → reconcile → APPLIED`, UTC wall-clock и final digest
checks. Cleanup доказала нулевой остаток временных databases, roles и sessions;
unit suite — `23/23`, независимый аудит — `P0=0 / P1=0 / P2=0`. Это всё ещё
worktree evidence, а не release acceptance. Новым production candidate станет
только последующий exact SHA после зелёного Fast/Full CI с этим gate и полного
replay нового artifact на свежей restored copy.

Последующий exact SHA `f4e8d79dadaa62734d045c7ae0b203f618d680b7`
принят Fast CI `32420934305` (`2/2`) и Full Release Admission
`32421266035` (`4/4`). Artifact ID `9426096697`, raw archive
`28 597 317` bytes, SHA-256
`9f77c15fd4b5bbdc42bc360c5dbdb9f34f66d40a00fcbbe159aaed7ff144d392`.
Fresh extraction этого artifact прошла `153/4/0 → reconcile(4) → 187/4/0`,
zero-pending second deploy, exact ownership и business zero-diff. Отдельная
fresh clone фактически прошла crash после durable reconciliation, restart без
повторного DML, real deploy с ambiguous child response и повторный restart с
`deploymentAttempt=0`. N−1 API и scheduler compatibility также приняты;
scheduler result требует production drain. Подробные immutable значения:
[`controlled-beta-1-f4-rehearsal-evidence-2026-08-21.md`](./controlled-beta-1-f4-rehearsal-evidence-2026-08-21.md).

Это закрывает artifact-bound local history/recovery/N−1 gate, но не даёт
production GO. Scheduler-free legacy rollback pair, receipt-bound slot helper,
authenticated current-release smoke и их successor-SHA CI admission ещё
готовятся; privileged Linux rehearsal и production pre-window evidence также
не выполнены.

Artifact `d1577642…` был дополнительно скачан в isolated local system-temp
directory и принят
`stage-release-artifact.sh`: внешний checksum, gzip, internal `SHA256SUMS`,
provenance и inventory прошли. Проверка не подключалась к БД, не использовала
secrets, не меняла production и не выполняла hydration. Local probe
использовался только как evidence целостности stage-инструмента, не заменяет
restored-copy rehearsal.

Первый server-side `--hydrate` rehearsal не был принят: pinned offline pnpm
store не содержал весь уже зафиксированный dependency set. Partial directory
был перемещён в отдельный `rehearsal-quarantine`, не использовался как release,
не подключался к БД и не менял runtime. В ходе этого обнаружения исправлена
regression в staging tool: failed install/generate теперь не может выполнить
финальный move. Повторная hydration разрешается только для будущего нового
candidate после Fast CI этого fix и pre-warm exact lockfile store; `d157…`
повторно не используется. Fallback на live runtime directory или
неприкреплённые package versions запрещён.

## Зафиксированное исходное состояние

На 20.08.2026 read-only preflight подтвердил, что публичные API и Web доступны,
а базовые systemd services запущены. При этом production использует legacy
процедуру, которая обновляет checkout из ветки перед build/restart. Такой
процесс изменяем и не доказывает связь запущенного кода с CI artifact.

Повторный read-only audit после fresh restored-copy rehearsal подтвердил:
live runtime всё ещё указывает на legacy checkout, release symlink отсутствует,
legacy deploy timer enabled, а checkout содержит `30` untracked entries. Их
имена и содержимое намеренно не читаются и не публикуются. На root filesystem
остается около `14 GB` свободного места, пока два protected isolated evidence
copies хранятся до declared retention deadline; дополнительную restored-copy
репетицию в canary window не создавать.

В рабочем checkout также обнаружены неотслеживаемые backup-артефакты окружения.
Их имена и содержимое намеренно не вносятся в репозиторий, логи и этот документ.
До canary их нужно инвентаризировать, заархивировать с ограниченным доступом
за пределами checkout и подтвердить, что checkout чист. Удалять их без
отдельного решения оператора запрещено.

## Инварианты deploy

1. `releaseSha` — полный lowercase Git SHA-1 из 40 символов.
2. Fast CI и вручную запущенный Full Release Admission успешны именно для
   `releaseSha`; SHA другого run, nightly или `main` не взаимозаменяемы.
   Full Release Admission обязательно исполняет production-history adapter SQL
   и exact migration/owner/runtime role topology на реальном PostgreSQL 16;
   unit/fake-adapter coverage этот gate не заменяет.
3. На host перед созданием slot symlink проверяются внешний `.sha256`, gzip,
   внутренний `SHA256SUMS` и `release-provenance.json.releaseSha`.
4. Распаковка происходит в новый immutable release directory. Старый runtime
   остаётся нетронутым до успешного readiness нового.
5. `RELEASE_SHA`, `EXPECTED_DATABASE_MIGRATION` и
   `EXPECTED_DATABASE_MIGRATION_COUNT` задаются из проверенного provenance, а
   не из текущего checkout, branch или времени deploy.
6. Raw `prisma migrate deploy` для production history запрещён. Migration
   выполняет только отдельно принятый exact-digest production-history
   controller после backup, restored-copy и N/N-1 rehearsal. При ошибке
   candidate slot и nginx routing не меняются.
7. API готов только если `/version` возвращает exact SHA, а `/health/ready`
   подтверждает готовность БД без unfinished migrations и с ожидаемым name/count.
   Web готов только если root возвращает exact HTTP 2xx, динамический no-store
   `/api/release-identity` подтверждает exact release SHA/Web BUILD_ID, а static
   manifest доступен как дополнительный (не авторитетный) asset smoke.
8. Shadow runtime всегда получает final overlay
   `FOUNDER_OPERATOR_BETA_MODE=DISABLED`,
   `DESIGN_PARTNER_ISOLATED_MODE=false`, все schedulers и outbound OFF. systemd
   egress разрешён только к localhost; нелокальная БД является stop condition.
9. Внешний owner invite, SMTP send, Telegram/MAX outbound и создание tenant
   запрещены, пока весь canary не принят явно.

## Целевая безопасная схема

```text
GitHub Full Release Admission (exact SHA)
  -> downloaded artifact + sha256
  -> host staging / releases/<SHA>.new
  -> verify provenance + SHA256SUMS
  -> isolated no-egress leetplus-build hydration + HYDRATED_SHA256SUMS
  -> root-owned seal + service-user read/execute probe
  -> restored-copy + old-SHA-on-new-schema N/N-1 acceptance
  -> verified backup + production-history controller
  -> start scheduler-free N-1 auth-edge/exact API child/Web on dedicated 4300/4301/3300 users
  -> authenticated read gate + atomic legacy-safe route
  -> persistent systemd/DB fence + old 4000/3000 unit/session drain receipt
  -> start blue|green API/Web on alternate loopback ports (safe N-1 stays hot)
  -> config validation + API SHA/migration + Web BUILD_ID assertions
  -> durable pre-effect intent + atomic nginx include switch + watchdog
  -> accepted generation-bound rollback receipt; scheduler-free N-1 remains hot through soak
  -> controlled Tenant B activation (separate GO)
```

`/srv/leetplus/slots/blue|green` указывает только на полностью проверенный
root-owned release. API instance читает runtime secrets из API-only файла вне
artifact/checkout; Web использует отдельный non-secret env и не может открыть
API env. Каждый slot/API/Web имеет отдельный system UID. Candidate не использует legacy
порты `4000/3000`; nginx переключает один active upstream include только после
loopback readiness. Artifact, logs и provenance не содержат secrets.

Для prepare-only части доступен versioned
[`stage-release-artifact.sh`](../deployment/production-artifact/stage-release-artifact.sh):
он fail-closed проверяет checksum/provenance и может выполнить только offline
dependency hydration в новом release directory. Скрипт специально не имеет
capability на migration, systemd restart или `current` switch.

Repository-side implementation:

- [blue/green cutover](../deployment/production-artifact/blue-green-cutover.sh);
- [service-user slot preflight](../deployment/production-artifact/preflight-release-slot.sh);
- [isolated hydration and root promotion](../deployment/production-artifact/README.md);
- [SHA-bound Web cache preparation](../deployment/production-artifact/prepare-web-slot-cache.sh);
- [root-owned release sealing](../deployment/production-artifact/seal-release-artifact.sh);
- [systemd instance/safety templates](../deployment/production-artifact/systemd/);
- [atomic nginx layout](../deployment/production-artifact/nginx/).

## Операторская последовательность

### A. До окна canary

1. Зафиксировать exact SHA и URL/ID Full Release Admission.
   Проверить, что run содержит успешный real-PostgreSQL production-history
   controller gate; зелёный historical run без этого шага недействителен.
2. Скачать final admission receipt и ровно указанные в нём runtime/control
   artifact IDs из того же успешного Full run. Независимо сверить transport
   digests, внешние `.tar.gz.sha256`, payload SHA-256 и exact release SHA вне
   production checkout. Payload без связанного final receipt не является
   admitted даже при успешной загрузке в Actions.
3. Выполнить immutable backup и отдельную restore verification. Записать
   checksum, время и место хранения в закрытый release record.
4. Прогнать restored-copy rehearsal этого же artifact, включая миграции,
   rollback и `/health/ready` с pinned migration name/count. Отдельно запустить
   exact N−1 child против migrated restored copy и принять критические
   authenticated reads: это обязательное N/N−1 доказательство для
   scheduler-free `4300/4301/3300` rollback contour. Оно не разрешает держать
   scheduler-capable legacy `4000/3000` hot после schema change.
   Fresh history и runtime-role lifecycle already accepted as isolated evidence:
   [runtime-role rehearsal](./controlled-beta-1-runtime-role-rehearsal-2026-08-20.md).
5. В отдельном обслуживаемом окне перенести неотслеживаемые
   environment-backup-артефакты из checkout в защищённое хранилище. Сначала
   составить PII-free inventory (count, timestamps, SHA-256); не выполнять
   массовое удаление.

Read-only unit audit дополнительно подтвердил active legacy deploy timer и
запуск API/Web от `admin` из mutable checkout с environment file внутри
checkout. Текущие команды запуска зафиксированы как input к rollout, но
содержимое environment file не читалось. Подготовленные versioned
[systemd templates](../deployment/production-artifact/systemd/) переносят
runtime на `/srv/leetplus/slots/blue|green` и secrets в
`/etc/leetplus/runtime.env`; они не установлены и не меняют production без
отдельного approval.

6. Сохранить root-only exact copies текущих legacy API/Web/timer/nginx units,
   checkout SHA и status. Не использовать `legacy.conf` и порты `4000/3000`
   как rollback target после начала scheduler-free activation.
7. Поднять exact SHA `7de04ff4ccc814494810730be3fa6bf661097b07`
   отдельными system users: nginx-facing auth-edge `4300`, exact API child
   `127.0.0.1:4301` и Web `3300`, с final deny overlay, UID-scoped loopback
   egress fence и отдельной DB session identity. Legacy child `4301` никогда не
   является nginx upstream; edge оставляет публичными только health/login и
   выполняет `/auth/me` introspection для любого другого Bearer. До routing
   пройти unauthenticated denial matrix и authenticated read-only smoke своей
   сети. Затем versioned activator обязан
   атомарно направить nginx на `legacy-safe.conf`, дождаться выхода старого nginx
   worker generation и соединений к `4000/3000`, установить persistent systemd
   start-fence и `NOLOGIN` для legacy DB role, остановить/disable весь closed
   inventory старых units и получить bounded zero-session/transaction receipt.
   Только scheduler-free `4300/3300` остаётся boot-enabled N-1.

### Release evidence (заполняется release owner перед effect)

- exact candidate SHA / CI run с real-PG controller gate / artifact digest:
  baseline `f4e8d79d…` / `32421266035` / raw
  `9f77c15fd4b5bbdc42bc360c5dbdb9f34f66d40a00fcbbe159aaed7ff144d392`
  принят для local replay; operational successor SHA перед production ещё
  `PENDING`; `a34eae8e…` явно `SUPERSEDED/NO-GO`;
- production backup UTC / size / SHA-256: `PENDING`;
- off-host copy size / SHA-256: `PENDING`;
- globals/roles backup digest: `PENDING`;
- production-history rehearsal receipt: exact f4 normal + actual
  crash/lost-response/resume `ACCEPTED` на disposable PostgreSQL;
- N/N-1 compatibility receipt: N−1 API + scheduler `ACCEPTED`; ранний N=f4
  Windows runtime receipt — `SUPERSEDED_DIAGNOSTIC`, hardened full-tree/kernel
  Linux acceptance `PENDING`; raw N=f4 data admission блокируют `5` unresolved scopes, а
  scheduler-free production handoff остаётся `PENDING`;
- legacy nginx/unit/config archive digest: `PENDING`.

### B. Staging и switch

1. Поместить artifact/checksum в root-controlled release inbox. Запустить
   exact `leetplus-release-hydrate@<SHA>.service`: отдельный `leetplus-build`,
   no runtime env и systemd `IPAddressDeny=any`.
2. Проверить внешний checksum, gzip, внутренний `SHA256SUMS`, отсутствие
   `node_modules`, exact provenance SHA и expected migration metadata.
3. Выполнить copy-only/ignore-scripts offline hydration, Prisma generate,
   hardlink check и создать `HYDRATED_SHA256SUMS` + systemd invocation receipt.
   Hydration и promoter разделяют один tmpfiles-provisioned global lock; promoter
   сверяет exact InvocationID, пустой cgroup и останавливает completed oneshot.
   Затем он забирает tree в недоступный builder-у boundary, повторно
   проверяет evidence, sealing и атомарно публикует `releases/<SHA>`. Любая
   незакреплённая версия или ошибка — стоп.
4. Создать пустой Web cache mountpoint и выполнить root-owned seal; service
   account должен читать/исполнять runtime, но не изменять release.
5. На доказанно остановленном candidate slot запустить
   `prepare-web-slot-cache.sh`: старый cache переносится в quarantine, root-only
   marker привязывается к exact SHA. Затем атомарно привязать slot к release.
6. Выполнить production-history controller. При неуспехе не запускать candidate
   и не менять nginx; сохранить evidence и перейти к incident, не повторять
   вслепую.
7. Создать protected release/slot env. Final canary overlay обязан выключать
   founder activation, schedulers, mail/provider/Langame/Telegram/MAX outbound.
8. Выполнить `systemctl enable --now` только для exact candidate
   `leetplus-api@<slot>` и `leetplus-web@<slot>` на alternate loopback ports.
   Cutover принимает только одновременно active и boot-enabled units; Web
   зависит от paired API, оба упорядочены до nginx. `ExecStartPre` проверяет
   immutable slot/service-user write boundary, exact NSS groups, safe PATH,
   полный loader/Node/proxy/curl env scrub и live kernel no-egress через
   ожидаемый `EACCES/EPERM` к собственному non-loopback адресу. API затем выполняет
   `config:validate:production`. Legacy units продолжают обслуживать traffic.
9. Проверить loopback: API `/version`, API `/health/ready`, Web root,
   динамический no-store `/api/release-identity` и static asset smoke. Для этого использовать versioned read-only
   [`verify-release-readiness.sh`](../deployment/production-artifact/verify-release-readiness.sh)
   с exact SHA, migration name/count и Web BUILD_ID из verified release.
10. Запустить `blue-green-cutover.sh switch`. Он до effect сохраняет durable
    root-only intent, предварительно проверяет candidate в private mount
    namespace с real host nginx config, меняет только один nginx symlink, требует `nginx -t`,
    а также exact installed slot-unit digest, zero drop-ins, effective
    identity/ExecStart/env/sandbox и MainPID+cgroup+loopback listener ownership,
    pinned nginx/preflight/readiness bytes и bounded/sanitized readiness bodies.
    Graceful reload и bounded public watchdog повторяют unit contract и требуют
    неизменный InvocationID. Ошибка автоматически возвращает
    exact previous scheduler-free target. Candidate nginx-конфиг содержит
    ровно одну API/Web пару и не использует независимые `backup` upstream:
    односторонний отказ не смешивает candidate и N-1, а до атомарного rollback
    всей пары возвращает bounded serving error. Fenced scheduler-capable
    `4000/3000` не запускается и не маршрутизируется.
    Handled exit запускает rollback guard; outstanding intent после SIGKILL
    восстанавливается pre-nginx unit и подтверждается отдельным post-start timer.
11. Сохранить schema-exact accepted receipt с монотонным `GENERATION` и
    latest-generation index; UTC timestamp не используется как ordering
    authority. Оставить
    scheduler-free N-1 runtime hot на объявленный soak. Receipt даёт rollback
    authority только пока он latest и не consumed. Lost response между rename
    receipt и atomic index replacement допускает лишь fail-closed reconciliation
    ровно одного schema-exact monotonic successor, совпадающего с live target;
    clock regression не меняет порядок поколений.
    `ACCEPTED_AT`/`RECOVERED_AT` создаются только whole-record temp + fsync +
    atomic replace; append-in-place и torn authoritative journals запрещены.
    Старые scheduler-capable units уже fenced/stopped, их DB login `NOLOGIN`, а
    drain verifier повторно подтверждает отсутствие процессов, cgroups,
    sessions, transactions и workers. Передача scheduler ownership новому
    release остаётся отдельным zero-overlap post-acceptance gate.

### C. Минимальный canary

1. Не включать Telegram/MAX outbound и публичную регистрацию. Public technical
   switch выполняется только в объявленном коротком maintenance window: shadow
   egress intentionally localhost-only, поэтому ручные external-integration
   actions текущих четырёх клубов временно недоступны. Watchdog дополняется
   authenticated critical-read smoke; любая деградация возвращает legacy.
2. После принятия technical canary заменить неизменяемый safety overlay только
   через отдельный reviewed owner-activation gate; in-place edit запрещён.
   Пока overlay подключён, `FOUNDER_OPERATOR_BETA_MODE=DISABLED` блокирует GO.
   Одной замены env недостаточно: technical units kernel-level разрешают только
   loopback. До owner GO нужно реализовать и принять отдельный network profile
   (unit/drop-in либо localhost egress broker) для Langame/SMTP/Telegram/provider.
   Сейчас этот профиль отсутствует, поэтому внешний invite остаётся `NO-GO`.
3. Выполнить protected `FOUNDER_OPERATOR_BETA_GO_V1` для единственного
   `Tenant B/Store B1` с 30-дневной trial policy и rollback owner.
4. Создать один email-bound `OWNER/NETWORK` invite. Владелец сам устанавливает
   пароль; временные/общие пароли запрещены.
5. Пройти day-0 smoke: owner login, tenant/store isolation, один
   ограниченный пользователь, assortment, staff, communications, roles и
   integration preview. Существующие четыре клуба не должны измениться.
6. Зафиксировать PII-free outcome и перейти в D1 review. Второй внешний tenant
   до D1/D7 review запрещён.

## Немедленный stop/rollback

Немедленно остановить canary и выполнить
[rollback plan](./founder-pilot-rollback-plan.md), если наблюдается хотя бы
одно условие:

- API version/readiness или Web BUILD_ID не соответствует exact release;
- migration незавершена, backup/restore не подтверждён или legacy timer снова
  может выполнить `git pull`;
- scope tenant/store, invite, роль, пароль или audit даёт аномалию;
- обнаружен неожиданный outbound, scheduler effect или данные существующей сети
  затронуты;
- checkout содержит неинвентаризированные sensitive artifacts.

До owner activation runtime rollback означает выполнить
`blue-green-cutover.sh rollback --receipt <intent|receipt>`: он допускает только
latest unconsumed generation с exact previous target/digest/runtime contract,
сначала доказывает direct liveness и boot-enabled state scheduler-free N-1,
затем выполняет `nginx -t`, graceful reload даже при уже восстановленном link и
bounded public/authenticated smoke. Если внешняя проверка недоступна, safe link
и N-1 процессы остаются восстановленными, но rollback не объявляется принятым.
Scheduler-capable legacy `4000/3000` остаётся fenced/stopped; его restart или
unmask в rollback запрещён. После owner activation дополнительно
закрываются invite/session/tenant effects по pilot rollback plan.

Schema rollback по умолчанию **не** означает restore старого backup: это
потеряет записи после backup и увеличит downtime. После принятого N/N-1 старый
runtime работает на новой схеме, а DB incident идёт через fix-forward. Restore
разрешён только в заранее объявленном write-quiesce/PITR сценарии.

## Что требуется до выполнения на production

- зелёные Fast CI и Full Release Admission для operational successor exact SHA
  (f4 baseline принят, новые rollback/drain/smoke helpers ещё не приняты);
- explicit production-change approval на: архивирование sensitive artifacts,
  замену legacy deploy/timer и switch runtime на artifact release directory;
- свежий непосредственно перед окном immutable production backup; f4
  restored-copy rehearsal уже принят;
- production-history normal/crash controller и N−1 old-SHA приняты локально;
  hardened N=f4 runtime требует privileged Linux systemd/cgroup запуска, а
  reviewed five-user scope classification/data admission ещё требуется;
- scheduler-free legacy target и reviewed pre-migration scheduler drain;
- repository blue/green fixtures и новый exact-SHA Full Release Admission;
- privileged Linux rehearsal: systemd parser, real full nginx parser,
  tmpfiles/cache bind, offline store/hydrate/promote/seal и reboot recovery;
- reviewed owner-activation network profile с outbound rehearsal;
- отдельный release record с SHA, artifact digest, backup checksum,
  migration metadata, rollback target и результатами readiness.

Read-only `verify-release-readiness.sh` принят Fast CI
[`32389801010`](https://github.com/boozik3412/leetplus/actions/runs/32389801010)
для SHA `e9dee8abb8e57fefe32feb75fbf567113c386d50`. Этот инструмент не
является candidate artifact и не меняет production. Это историческое evidence
предшествует exact Web BUILD_ID probe; текущая расширенная версия должна пройти
новый Fast CI и Full Release Admission вместе с будущим candidate SHA.

До выполнения этих пунктов текущий статус остаётся `NO-GO` для внешнего invite.
