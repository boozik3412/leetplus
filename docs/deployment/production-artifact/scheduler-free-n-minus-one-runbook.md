# Scheduler-free N−1 для первого production cutover

Статус: **IMPLEMENTED IN REPOSITORY / NOT INSTALLED / PRODUCTION UNCHANGED**.

Этот контур нужен только для первого перехода с mutable legacy runtime на
versioned blue/green artifact. Совместимость API SHA
`7de04ff4ccc814494810730be3fa6bf661097b07` с новой схемой уже проверена на
restored copy, но его scheduler-пути нельзя оставлять активными во время
миграции. Поэтому прежние `leetplus-api.service`/`leetplus-web.service` не
являются допустимым hot rollback после schema effect.

Новый N−1 сохраняет HTTP rollback без второго scheduler owner:

| Компонент | Контракт |
| --- | --- |
| Source | только exact `7de04ff4ccc814494810730be3fa6bf661097b07` |
| API edge | `127.0.0.1:4300`, MainPID user `leetplus-api-nminus1`; public только exact `GET /health` и `POST /auth/login` |
| Legacy API child | `127.0.0.1:4301`, тот же user и exact systemd cgroup; никогда не является nginx/public upstream |
| Web | `127.0.0.1:3300`, user `leetplus-web-nminus1` |
| PostgreSQL login | `leetplus_legacy_rollback`, `NOINHERIT`, единственное membership в `leetplus` с `SET=true`, `INHERIT=false`, `ADMIN=false` |
| DB application name | `leetplus-nminus1-http-7de04ff4` |
| Network | API/Web units разрешают только `AF_INET/AF_INET6` на loopback (без `AF_UNIX`); exact nft fence разрешает `4301` только API UID и отвергает его для всех остальных local UID |
| Effects | scheduler, scheduled HTTP, recovery/materializer, email, Telegram, SMS, MAX, Langame write и tenant outbound принудительно выключены final overlay |
| Nginx target | `legacy-safe.conf`, API/Web `4300/3300` |

Одна переменная в прежнем `runtime.env` не может включить effect: deny overlay
загружается последним, проверяется `ExecStartPre`, а unit дополнительно запрещает
non-loopback egress на уровне kernel policy.

## Что создано

- `leetplus-api-rollback@.service` и `leetplus-web-rollback@.service` —
  versioned process pair, где instance равен full SHA;
- `legacy-rollback-auth-edge.mjs` — bounded supervisor/proxy перед exact legacy
  API. Он запускает child на `4301`, держит nginx-facing `4300`, ограничивает
  connections/tasks/memory, применяет backpressure и завершает child вместе с
  edge. Прямой доступ к optional-auth legacy handlers запрещён;
- `legacy-rollback-safe.env.example` — final fail-closed overlay;
- `legacy-rollback-7de04ff4.env.example` — non-secret SHA/ports/session identity;
- `preflight-legacy-rollback.sh` — exact source marker, complete regular-file
  manifest, immutable boundary, contained symlinks, final env и DB URL contract;
- `verify-legacy-rollback-readiness.sh` — exact units/process cwd/artifact и
  loopback HTTP; с `--require-drain` повторно доказывает drain;
- `activate-legacy-rollback-contour.sh` — crash-resumable atomic route → public
  watchdog → stop/disable → drain;
- `verify-legacy-runtime-drain.sh` — unit/process/cgroup/DB-session verifier с
  bounded settling;
- `install-legacy-rollback-contour.sh` — install-only; не запускает units, не
  reload nginx, не меняет route и не обращается к PostgreSQL. В production он
  принимает установку только от отдельно доставленного digest-pinned
  `leetplus-install-scheduler-free-nminus1-v1`; прямой запуск и копирование из
  mutable checkout fail closed;
- `../production-control-authority/leetplus-install-scheduler-free-nminus1-v1`
  — минимальный отдельно ревьюимый bootstrap authority. Он исполняется только
  как fixed `root:root 0500` byte, дважды проверяет complete immutable bundle
  против встроенного manifest SHA-256 и только затем запускает installer;
- `legacy-drain-units.conf.example` — закрытая классификация всех
  `leetplus-*.(service|timer)`. Неизвестный установленный unit блокирует effect.

Blue/green больше не принимает `legacy.conf` как previous target. В candidate
nginx-конфигурациях нет независимых API/Web `backup` upstream: односторонний
отказ даёт bounded `502` до watchdog/operator rollback всей пары, но никогда не
создаёт смешанную candidate/N−1 generation.

## Обязательные входы до production-окна

1. Новый immutable backup production DB, globals dump, off-host copy и
   проверенный restore. Старый backup не заменяет backup непосредственно перед
   effect.
2. Exact offline build SHA `7de04ff4…` на совместимом Linux/Node/pnpm runtime.
   В root artifact должны быть:
   `.leetplus-source-sha` с одной exact SHA и `N_MINUS_ONE_SHA256SUMS`, который
   покрывает каждый regular file, кроме самого manifest. Artifact переносится
   в `/srv/leetplus/rollback-releases/<SHA>` и становится root-owned,
   service-readable, group/other-nonwritable. Любой dangling/escaping symlink,
   special entry или multiply-linked file — stop condition.
3. Root-only inventory всех установленных `leetplus-*` services/timers.
   Каждая запись должна быть осознанно отнесена к `REQUIRED_DRAIN`,
   `OPTIONAL_DRAIN` или `SAFE`. Нельзя удалять неизвестную запись из inventory,
   чтобы пройти verifier.
4. Отдельные service identities и secret groups:

   ```bash
   groupadd --system leetplus-runtime
   groupadd --system leetplus-api-runtime
   groupadd --system leetplus-web-runtime
   useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin \
     --gid leetplus-runtime --groups leetplus-api-runtime leetplus-api-blue
   useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin \
     --gid leetplus-runtime --groups leetplus-api-runtime leetplus-api-green
   useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin \
     --gid leetplus-runtime --groups leetplus-api-runtime leetplus-api-nminus1
   useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin \
     --gid leetplus-runtime --groups leetplus-web-runtime leetplus-web-blue
   useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin \
     --gid leetplus-runtime --groups leetplus-web-runtime leetplus-web-green
   useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin \
     --gid leetplus-runtime --groups leetplus-web-runtime leetplus-web-nminus1
   ```

   Команды выполняются только после `getent`/`id`-проверки. Existing identity с
   другим UID/GID/membership — stop condition, а не повод менять её на месте.
   Full passwd/group inventory должен содержать ровно эти шесть primary members
   `leetplus-runtime`; primary-GID sets `leetplus-api-runtime` и
   `leetplus-web-runtime` пусты, а их explicit member sets равны трём API и трём
   Web identities соответственно. Web identity не должна входить в
   `leetplus-api-runtime`.

5. Отдельная PostgreSQL session role. Пароль генерируется случайно, не попадает
   в shell history/runbook/evidence. На restored copy, затем в approved окне:

   ```sql
   CREATE ROLE leetplus_legacy_rollback
     LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
     NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20 PASSWORD '<SCRAM verifier>';
   GRANT leetplus TO leetplus_legacy_rollback
     WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;
   ```

   Если синтаксис role-option отличается на установленном minor PostgreSQL,
   операция останавливается; нельзя заменять контракт обычным inheriting grant.
   После установки fence authority у `leetplus` ровно два прямых члена:
   `leetplus_legacy_rollback` с `SET=true/INHERIT=false/ADMIN=false` и
   NOLOGIN `leetplus_fence_authority` с
   `SET=false/INHERIT=false/ADMIN=true`. У rollback/authority/fencer ролей нет
   собственных членов; единственное direct membership rollback и authority —
   описанное выше. Проверяются все options, reverse memberships, LOGIN/NOLOGIN,
   role config/connection limits и session-user identities. Любой второй
   прямой или транзитивный login path к `SET ROLE leetplus` — stop condition.

6. `/etc/leetplus/rollback-runtime.env` содержит `NODE_ENV=production`,
   необходимые существующему API secrets и loopback `DATABASE_URL` с:
   username `leetplus_legacy_rollback`, exact DB `leetplus`, TCP
   `127.0.0.1:5432`, `schema=public`, `application_name` из таблицы выше и
   единственным `options=-c role=leetplus`; любые дополнительные URL options
   запрещены. Файл `root:leetplus-api-runtime
   0640`. `/etc/leetplus/rollback-web-runtime.env` содержит только Web-safe
   runtime values и `NODE_ENV=production`, `root:leetplus-web-runtime 0640`.
   API/provider credentials в Web-файле запрещены. API-файл обязан содержать
   случайный `JWT_SECRET` длиной не менее 32 и не более 4096 символов, без
   whitespace; отсутствие, короткое значение и публичный legacy fallback
   `leetplus-dev-jwt-secret-change-before-production` блокируют preflight.
7. На PostgreSQL 16 отдельно создаются NOLOGIN owner
   `leetplus_fence_authority`, LOGIN executor `leetplus_role_fencer` и LOGIN
   read-only auditor `leetplus_drain_audit`. Затем bootstrap superuser применяет
   SHA-bound, установленный из exact control bundle
   `/usr/local/libexec/leetplus/legacy-database-login-fence-authority.sql`
   (source path `systemd/legacy-database-login-fence-authority.sql.example`,
   SHA-256 `76f16367ab7ba14d3bc4aacffcc080425b12464f276cc4b1c3a09bd5046dd5e7`).
   Скрипт создаёт
   единственную `SECURITY DEFINER` функцию в `leetplus_ops`, пинит её owner,
   source/search_path/ACL и даёт executor только schema `USAGE` + function
   `EXECUTE`. Owner остаётся NOLOGIN; executor не получает membership, object
   ownership, table/sequence/function data authority или schema access вне
   этой функции. Wrong server/system/session, extra grant/role membership,
   owned object/default ACL/role config и source drift прерывают ту же
   транзакцию **до** `ALTER ROLE leetplus NOLOGIN`.

   Отдельный `/etc/leetplus/pg_service.conf` entry
   `leetplus-drain-audit`, доступный только root. Audit login должен видеть
   `pg_stat_activity` (`pg_monitor`/`pg_read_all_stats`), быть
   `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION` и не быть
   application owner; drain SQL всегда начинает `BEGIN READ ONLY`. Второй entry
   `leetplus-drain-fence` использует `leetplus_role_fencer`, который может
   выполнить только source-pinned function. Оба entry пинят production
   DB/server/port;
   root-owned target file дополнительно пинит `system_identifier` и exact
   `session_user`. Verifier передаёт только service name, поэтому password/URI
   не появляется в process arguments или receipt.
8. `/etc/leetplus/legacy-rollback-smoke.env`, `root:root 0600`, имеет ровно
   десять ключей: `EMAIL`, `PASSWORD`, `TENANT_SLUG`, SHA-256 exact tenant ID,
   SHA-256 отсортированных четырёх store IDs (строки соединены `\n`, включая
   завершающий `\n`), SHA-256 canonical exact девяти role options, SHA-256
   canonical exact capability catalog и три положительных reviewed lower bounds:
   `MIN_ASSORTMENT_TOTAL_SKU`, `MIN_STAFF_ROWS`,
   `MIN_GAMIFICATION_CONFIG_ITEMS`. Baseline снимается read-only с принятой
   restored production copy и отдельно сверяется release owner до окна; нулевые
   или произвольные значения запрещены. Скрипт открывает файл через
   `O_NOFOLLOW`, запускается с `env -i`, отвергает proxy/Node injection env и
   проверяет `/auth/me`, выделенную неплатформенную `ADMIN + NETWORK` canary role,
   exact tenant и topology текущих
   четырёх stores, exact users/invites/custom roles/permissions/access scopes,
   непустые baseline-bound assortment, staff/KB и gamification,
   communications и users/scope. Отдельная unauthenticated матрица обязана
   получить `401` на каждом critical read. Статические `/health` и Web 200
   недостаточны.

## Установка без runtime effect

Из mutable checkout production-установка запрещена. Release owner сначала
формирует минимальный bundle
`/srv/leetplus/control-bundles/scheduler-free-nminus1-v1` ровно из путей
`CONTROL_BUNDLE_SHA256SUMS`, делает все ancestors/entries `root:root` и
group/other-nonwritable, а manifest — `0400`. SHA-256 самого manifest отдельно
помещается в `/etc/leetplus/rollback-control-manifest.sha256` (`root:root 0400`)
из reviewed release evidence. Exact/nested mounts, symlink/special/hard-linked
entry, writable ancestor, лишний файл или digest drift блокируют операцию.

Bootstrap authority берётся из того же immutable CI artifact, но не является
частью исполняемого control bundle (это устраняет self-verification). Его
reviewed SHA-256 для этой версии:
`03799ce7d6174c5a21d7a380617de9fb5a50e6ee5f65a841279fe9940adfbe0c`.
Сначала byte копируется во временный root-owned файл, проверяется уже после
копирования и только затем атомарно публикуется:

```bash
sudo install -o root -g root -m 0500 \
  <immutable-ci-artifact>/leetplus-install-scheduler-free-nminus1-v1 \
  /usr/local/sbin/.leetplus-install-scheduler-free-nminus1-v1.new
echo '03799ce7d6174c5a21d7a380617de9fb5a50e6ee5f65a841279fe9940adfbe0c  /usr/local/sbin/.leetplus-install-scheduler-free-nminus1-v1.new' \
  | sudo sha256sum --check --strict
sudo mv -T /usr/local/sbin/.leetplus-install-scheduler-free-nminus1-v1.new \
  /usr/local/sbin/leetplus-install-scheduler-free-nminus1-v1
sudo sync -f /usr/local/sbin/leetplus-install-scheduler-free-nminus1-v1
sudo sync -d /usr/local/sbin
```

Любой digest mismatch — stop condition: `.new` удаляется оператором и не
публикуется; проверку нельзя обходить локальной правкой. После bootstrap сначала выполняется source-only
attestation, затем install-only provisioning. Authority повторяет проверку
непосредственно перед первым исполнением bundle bytes; installer повторно
проверяет manifest и final destination byte/owner/mode/link-count:

```bash
sudo /usr/local/sbin/leetplus-install-scheduler-free-nminus1-v1 --verify-only
sudo /usr/local/sbin/leetplus-install-scheduler-free-nminus1-v1
```

Если fail-closed остановка произошла после установки полного набора runtime
mask, повтор authority в том же boot обязан продолжить только при exact
`/run/systemd/system/* -> /dev/null`, canonical preparation record и полностью
quiescent rollback runtime. После reboot тот же record разрешает восстановить
исчезнувшие runtime mask. Совместимость между control generations ограничена
прибитой парой manifest/install-plan непосредственно предшествующей admitted
generation. Если предшественник уже зафиксировал boot fence и PREPARED intent,
roll-forward дополнительно требует byte-identical production preparing/fence/
intent records и их пять pinned SHA-256. Исходная generation identity этих
records сохраняется через POST_ATTESTED и удаляется только после attestation
новых destination bytes; произвольный или частичный mask/state set остаётся
stop condition.

На systemd 255 два старых template-dependency alias могут удерживать exact
предшествующий `leetplus-rollback-egress.service` в `LoadState=loaded`, несмотря
на canonical runtime mask. Такой cached state принимается только для pinned
predecessor egress SHA-256 при полном committed fence/intent, восьми exact
persistent drop-in, `ConditionResult=no`, `NeedDaemonReload=no` и строго
inactive/dead aliases. Authority заменяет этот byte admitted unit-файлом до
снятия любого fence; иной digest или effective state остаётся stop condition.

Прямой запуск `install-legacy-rollback-contour.sh` без authority остаётся
запрещённым. После provisioning:

Перед публикацией control artifact CI обязательно выполняет production-ветку
installer в одноразовом Linux/container root:

```bash
sudo env LEETPLUS_DISPOSABLE_ROOT_FIXTURE=CONFIRMED_DESTROYABLE_CI_ROOT \
  /usr/bin/bash -p .github/scripts/test-production-legacy-rollback-installer-root.sh
```

Fixture сам отказывается работать без `/.dockerenv` или
`/run/.containerenv`. Он проверяет реальный authority→installer handshake,
normal Linux directory link counts, exact NSS/primary-GID sets, durable
drop-in-before-marker crash/reboot resume, pre-existing runtime mask refusal,
no-drift `daemon-reload`/effective generation, install→API preflight и cache
UID fence. Эту команду запрещено запускать на production/обычном host root.

```bash
sudo systemd-analyze verify \
  /etc/systemd/system/leetplus-api-rollback@.service \
  /etc/systemd/system/leetplus-web-rollback@.service \
  /etc/systemd/system/leetplus-rollback-egress.service

sudo systemctl daemon-reload
sudo systemctl enable leetplus-blue-green-recovery.service
sudo systemctl enable --now leetplus-blue-green-recovery.timer
sudo systemctl enable --now leetplus-rollback-egress.service
sudo /usr/local/libexec/leetplus/apply-legacy-rollback-egress.sh --verify
systemctl show -p DropInPaths nginx.service
```

Egress verification обязана показать ordered allow API UID → `4301`, сразу
следующий global reject `127.0.0.1:4301`, а затем остальные exact reject rules.
Никакой другой local UID, включая Web и root, не должен соединяться с legacy
child; nginx использует только auth-edge `4300`.

`DropInPaths` обязан содержать exact
`/etc/systemd/system/nginx.service.d/leetplus-blue-green-recovery.conf`; recovery
service/timer должны быть enabled, timer active. Это обеспечивает pre-nginx
intent recovery после reboot. Отсутствие любого из этих признаков — stop.

Сначала создаётся пустой cache bind target в artifact и проверяются права.
Затем запускается только exact pair:

```bash
sudo systemctl enable --now \
  leetplus-api-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service \
  leetplus-web-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service

sudo /usr/local/libexec/leetplus/verify-legacy-rollback-readiness.sh \
  --release-sha 7de04ff4ccc814494810730be3fa6bf661097b07
```

На этом этапе public nginx и старые units ещё не изменены. Любая ошибка
устраняется до route/drain.

## Единственная route/drain операция

До команды active link обязан указывать на reviewed `legacy.conf`, а safe pair
должен быть active+enabled. Выполняется:

```bash
sudo /usr/local/libexec/leetplus/activate-legacy-rollback-contour.sh
```

Последовательность внутри:

1. shared `deploy-receipts/cutover.lock`, fail-closed inventory установленных и
   loaded/transient LeetPlus units, re-attestation root-owned operational bytes
   и full authenticated exact rollback readiness;
2. durable `activation.intent` и snapshot PID+start-time/cgroup;
3. private-namespace full `nginx -t` с `legacy-safe.conf`;
4. atomic symlink switch, `nginx -t`, graceful reload;
5. три последовательных public API/Web success, live отрицательная матрица
   auth-edge для всех exact optional-auth legacy surfaces и production-like
   authenticated read-only smoke; static health сам по себе не открывает
   route/drain;
6. durable `ROUTED_PUBLICLY=true` — граница, после которой скрипт никогда не
   возвращает scheduler-capable target;
7. дождаться выхода captured pre-reload nginx workers и clean samples
   соединений к `3000/4000`; установить exact systemd start-fence drop-ins,
   применить внутри одной target-pinned DB transaction `ALTER ROLE leetplus
   NOLOGIN`, создать durable fence marker и только затем `disable --now`
   каждого DRAIN unit;
8. несколько последовательных clean samples: units inactive+disabled и exact
   fence drop-ins loaded,
   MainPID/ControlPID/ExecMainPID zero, cgroups empty, captured PID identities
   исчезли, `leetplus` DB sessions/transactions/workers zero, rollback sessions
   имеют только pinned application name, role/membership catalog exact;
9. atomic `activation.receipt`, связанный SHA-256 со всеми intent/route/
   connection/fence/drain evidence, и повторная readiness+drain проверка.

До шага 6 ошибка безопасно восстанавливает старый link: старые units ещё не
остановлены. После шага 6 любая ошибка оставляет `4300/3300` serving и
`activation.intent`, но блокирует migration. Повтор той же команды продолжает
операцию; запуск старых units или ручной возврат `legacy.conf` запрещён.

Только наличие `/var/lib/leetplus/legacy-drain/activation.receipt` и успешная
команда ниже открывают migration gate:

```bash
sudo /usr/local/libexec/leetplus/verify-legacy-rollback-readiness.sh \
  --release-sha 7de04ff4ccc814494810730be3fa6bf661097b07 \
  --require-drain
```

## Cutover и rollback

После drain active link указывает на `legacy-safe.conf`. Обычный
`blue-green-cutover.sh switch` принимает его как единственный первый N−1,
но до route проверяет не только HTTP: exact digest/FragmentPath и отсутствие
drop-ins slot API/Web units, effective User/Group/ExecStart/EnvironmentFiles,
final canary-safe overlay, sandbox/capability/path policy, active
InvocationID/MainPID/cgroup и принадлежность loopback listener. Он также
проверяет exact NSS groups, pinned nginx/preflight/readiness bytes, безопасный
PATH и полный loader/Node/proxy/curl env scrub. ExecStartPre внутри live cgroup
обязан получить kernel `EACCES/EPERM` при соединении с собственным non-loopback
адресом; HTTP и declarative unit properties без этого no-egress evidence
недостаточны. Watchdog
повторяет тот же контракт и запрещает restart/change invocation во время окна,
записывает exact units/ports/SHA в durable receipt и atomic
`latest-accepted.index`, а перед каждым switch/recovery повторяет
`--require-drain`. Intent/receipt имеют exact canonical schema и монотонный
`GENERATION`; UTC timestamp является только метаданными/частью уникального имени
и никогда не определяет порядок. Rollback принимает только latest unconsumed
generation. Crash после accepted receipt rename, но до index replace,
восстанавливается под тем же shared cutover lock лишь для ровно одного
schema-exact monotonic successor, совпадающего с live target; даже при переводе
host clock назад stale/superseded/consumed receipt отклоняется.
`ACCEPTED_AT` и `RECOVERED_AT` никогда не дописываются в authoritative файл:
полная phase-record сначала пишется и fsync-ится отдельно, затем атомарно
заменяет intent. Частично записанный uncommitted temp отбрасывается только при
наличии неизменённого schema-exact intent; committed phase после host loss
детерминированно завершается под тем же lock.
Blue/green inventory резервирует timestamp/generation namespace
`YYYYMMDDT...Z-g...-<sha>-<slot>` и не интерпретирует находящиеся в общем
durable root receipts других release authorities как cutover journal. Любая
запись внутри зарезервированного namespace по-прежнему проходит полную exact
schema/filename-проверку и при drift останавливает recovery fail-closed.
`legacy.conf` и receipt с `LEGACY_UNVERSIONED` отклоняются.

При candidate failure nginx возвращается на scheduler-free `4300/3300`. Старый
scheduler-capable API не запускается. Восстановление старого DB backup — отдельная
аварийная процедура с downtime/RPO решением, а не автоматический HTTP rollback.

## Stop conditions

- нет fresh backup+restore/off-host evidence;
- exact 7de artifact/manifest не совпадает или writable;
- неизвестный `leetplus-*` unit;
- rollback API/Web не active+enabled или process cwd не exact release;
- nginx либо любой local UID обходит auth-edge и достигает legacy child `4301`;
- safe overlay divergence, non-loopback DB/provider address;
- candidate NSS/env/PATH/unit/nginx/helper digest drift либо live kernel
  no-egress self-test не вернул `EACCES/EPERM`;
- старый unit/PID/cgroup/DB session остаётся после bounded settling;
- роль `leetplus_legacy_rollback` наследует права, имеет лишнее membership или
  привилегированный attribute;
- public watchdog не даёт три последовательных success;
- существует `activation.intent` без принятого продолжения;
- recovery service/timer не enabled/active либо nginx не загрузил exact
  recovery Requires/After drop-in;
- accepted blue/green receipt не связан с latest-generation index, либо найдено
  больше одного unindexed generation;
- `legacy.conf` снова стал active после `ROUTED_PUBLICLY=true`.

Ни один repository test или install script сам не меняет production. Реальное
создание role, запуск units, nginx route, stop legacy и migration требуют fresh
production backup и отдельного подтверждённого окна.
