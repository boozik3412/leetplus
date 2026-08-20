# Controlled Beta-1: production canary и SHA-bound deploy

Статус: `BLUE/GREEN SAFETY IMPLEMENTED IN REPOSITORY / NEW ARTIFACT AND REHEARSAL REQUIRED / NOT EXECUTED / PRODUCTION NO-GO`.

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

Нового принятого production candidate пока нет. Им станет только exact SHA
после интеграции production fixes, blue/green tooling, production-history
controller и нового полностью зелёного Fast CI + Full Release Admission.

Он был дополнительно скачан в isolated local system-temp directory и принят
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
  -> start blue|green API/Web on alternate loopback ports (old stays hot)
  -> config validation + API SHA/migration + Web BUILD_ID assertions
  -> durable pre-effect intent + atomic nginx include switch + watchdog
  -> accepted rollback receipt; old runtime remains hot through soak
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
2. Скачать оба файла artifact (`.tar.gz` и `.tar.gz.sha256`) по защищённому
   каналу и сверить SHA-256 вне production checkout.
3. Выполнить immutable backup и отдельную restore verification. Записать
   checksum, время и место хранения в закрытый release record.
4. Прогнать restored-copy rehearsal этого же artifact, включая миграции,
   rollback и `/health/ready` с pinned migration name/count. Отдельно запустить
   старый production SHA против migrated restored copy и принять критические
   authenticated reads/writes: это обязательное N/N-1 доказательство, потому
   что старый runtime остаётся hot после schema change.
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
   checkout SHA и status. Настроить nginx active upstream link сначала на
   concrete `legacy.conf`, выполнить `nginx -t`, graceful reload и доказать
   zero-diff внешнего ответа.
7. Отключить legacy deploy timer только непосредственно перед migration/window,
   не останавливая legacy API/Web. Это предотвращает `git pull`, но сохраняет
   рабочий N-1 runtime для мгновенного routing rollback.

### Release evidence (заполняется release owner перед effect)

- exact candidate SHA / CI run / artifact digest: `PENDING`;
- production backup UTC / size / SHA-256: `PENDING`;
- off-host copy size / SHA-256: `PENDING`;
- globals/roles backup digest: `PENDING`;
- production-history rehearsal receipt: `PENDING`;
- N/N-1 compatibility receipt: `PENDING`;
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
   immutable slot/service-user write boundary, API затем выполняет
   `config:validate:production`. Legacy units продолжают обслуживать traffic.
9. Проверить loopback: API `/version`, API `/health/ready`, Web root,
   динамический no-store `/api/release-identity` и static asset smoke. Для этого использовать versioned read-only
   [`verify-release-readiness.sh`](../deployment/production-artifact/verify-release-readiness.sh)
   с exact SHA, migration name/count и Web BUILD_ID из verified release.
10. Запустить `blue-green-cutover.sh switch`. Он до effect сохраняет durable
    root-only intent, предварительно проверяет candidate в private mount
    namespace с real host nginx config, меняет только один nginx symlink, требует `nginx -t`,
    graceful reload и bounded public watchdog. Ошибка автоматически возвращает
    exact previous target; old processes не останавливаются. Candidate nginx
    upstream первого cutover держит hot legacy как `backup`, но watchdog
    принимает только динамическую exact candidate identity.
    Handled exit запускает rollback guard; outstanding intent после SIGKILL
    восстанавливается pre-nginx unit и подтверждается отдельным post-start timer.
11. Сохранить accepted receipt и оставить N-1 runtime hot на объявленный soak.
    Candidate не создаёт второй scheduler tick. До migration должен быть уже
    принят один из путей: legacy background compatibility на новой схеме или
    reviewed drain legacy schedulers с объявленным окном без background work.
    HTTP process остаётся hot и boot-enabled в обоих случаях. Остановка/disable N-1 и передача
    scheduler ownership — отдельный zero-overlap post-acceptance gate.

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
exact previous target/digest/runtime contract, сначала доказывает direct
liveness и boot-enabled state N-1, затем выполняет `nginx -t`, graceful reload
даже при уже восстановленном link и bounded public smoke старого runtime. Если
внешняя проверка недоступна, link и процессы
остаются восстановленными, но rollback не объявляется принятым. Старые процессы
уже hot, поэтому restart не нужен. После owner activation дополнительно
закрываются invite/session/tenant effects по pilot rollback plan.

Schema rollback по умолчанию **не** означает restore старого backup: это
потеряет записи после backup и увеличит downtime. После принятого N/N-1 старый
runtime работает на новой схеме, а DB incident идёт через fix-forward. Restore
разрешён только в заранее объявленном write-quiesce/PITR сценарии.

## Что требуется до выполнения на production

- зелёные Fast CI и Full Release Admission для одного exact SHA;
- explicit production-change approval на: архивирование sensitive artifacts,
  замену legacy deploy/timer и switch runtime на artifact release directory;
- проверенный immutable backup и restored-copy rehearsal;
- production-history controller и N/N-1 old-SHA compatibility acceptance;
- legacy-background compatibility либо reviewed pre-migration scheduler drain;
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
