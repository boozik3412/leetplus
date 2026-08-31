# Current-release restored-copy runtime acceptance

## Назначение

Этот gate доказывает, что exact release artifact `N` запускается поверх уже
мигрированной disposable restored-copy и обслуживает разрешённый профиль
CONTROLLED BETA-1 через связку production-build API + Web.

Gate не выполняет миграции, не создаёт tenant, не меняет production, не
авторизует canary/cutover и не заменяет свежий backup/restore rehearsal.

Контракт:

`LEETPLUS_CURRENT_RELEASE_RESTORED_COPY_RUNTIME_ACCEPTANCE_V2`.

Исторические F4 receipts с контрактом `V1` остаются проверяемыми только exact
F4 artifact/CLI, который их создал. Текущий wrapper, verifier и новый production
rehearsal не принимают `V1`: поле `evidence.runtime.startupTimeoutMs` является
обязательной частью подписанного `V2` evidence.

Реализация:

- `packages/database/scripts/current-release-restored-copy-runtime-acceptance.mjs`;
- `packages/database/scripts/current-release-restored-copy-runtime-acceptance.cli.mjs`;
- `packages/database/scripts/current-release-restored-copy-runtime-acceptance.test.mjs`.
- `packages/database/scripts/run-current-release-restored-copy-acceptance.sh`
  внутри exact release artifact. Исходник для сборки находится в
  `docs/deployment/production-artifact/`, но запускать mutable checkout
  запрещено.

## Fail-closed границы

Команда принимает только:

- абсолютный hydrated artifact root;
- exact lowercase 40-character release SHA;
- PostgreSQL на `127.0.0.1`, нестандартном порту и в базе
  `leetplus_restored_*`;
- два разных нестандартных loopback-порта API/Web;
- ACTIVE tenant и активного неплатформенного `OWNER` с актуальным
  `NETWORK` scope;
- exact PostgreSQL system identifier, migration head и migration count;
- direct runtime LOGIN role, который одновременно является owner базы и всех
  объектов `public`, без `SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `CREATEROLE` и
  `REPLICATION`;
- свежий service-owned per-operation evidence child внутри фиксированного
  root-owned, traversal-only parent; host evidence root скрыт от каждого unit,
  а только exact current child bind-монтируется в отдельный operation-scoped
  `/run` path;
- независимый HMAC key длиной не менее 32 символов и несекретный key ID.

Порты `3000`, `3001`, `4000`, `5432`, production hostname/IP и база `leetplus`
отклоняются до запуска runtime.

До старта проверяются canonical `SHA256SUMS`, полный
`HYDRATED_SHA256SUMS`, exact regular-file coverage всего runtime tree,
canonical `HYDRATED_SYMLINKS.json` с raw relative target каждого contained
symlink, отсутствие hardlink/special entries,
`HYDRATION_SANDBOX_RECEIPT`, `release-provenance.json`, Web `.next/BUILD_ID`,
API entrypoint и реальная manifest-covered цель hydrated Next runtime.
Незаявленный файл, symlink escape или изменение любого runtime byte даёт
`FAIL`.

Production wrapper является root-authoritative controller. Сам runtime
acceptance CLI исполняется фиксированным непривилегированным пользователем
в transient systemd service `leetplus-current-release-acceptance-<operation-id>.service` с
`NoNewPrivileges`, нулевыми effective capabilities, `IPAddressDeny=any` и
точным `IPAddressAllow=127.0.0.1/32 ::1/128`, `Delegate=no`. Перед любым
runtime effect CLI проверяет cgroup и `/proc/self/status`, доказывает живым
probe, что `127.0.0.1` разрешён, а соединение с заведомо доступным локальным
listener на `127.0.0.2` отклоняется ядром. Connect-hook BPF подтверждается
`EACCES|EPERM`, а `cgroup_skb` — таймаутом только этого self-hosted canary;
обычный внешний routing timeout доказательством не считается. API/Web и любые
их descendants наследуют тот же cgroup policy. Preload guard остаётся
дополнительным route/port-level ограничением, но не считается kernel boundary.

Все scheduler, scheduled HTTP, SMTP/provider, Langame, SMS, Telegram, MAX,
founder activation и guest-delivery эффекты принудительно выключены. API всё
равно стартует с `NODE_ENV=production`, обязательными exact release/migration
markers и независимыми случайными process-local secrets.

## Что проверяется

1. API `/version` возвращает exact release SHA.
2. API `/health/ready` возвращает тот же SHA, exact migration head/count и
   готовую БД.
3. Dynamic Web `/api/release-identity` возвращает те же SHA/BUILD_ID и
   `Cache-Control: no-store`.
4. Login проходит через production Web BFF, который выставляет `Secure` +
   `HttpOnly` cookie.
5. `/api/auth/me` подтверждает `OWNER`, `NETWORK`, ожидаемый tenant и
   `isPlatformAdmin=false`.
6. Выполняется authenticated read matrix; каждый ответ обязан быть JSON с
   ожидаемой непустой top-level schema, поэтому произвольный `200 {}` не
   принимается:
   - gamification: workspace, missions, loot boxes, seasons, rewards;
   - assortment: paginated product catalog и network-scoped stores;
   - staff: directory, tasks, checklists, templates, recurring rules,
     discipline, salary, regulations, knowledge base, training, assessments и
     onboarding;
   - communications: notifications и team chat;
   - users/roles: users, stores, system/custom roles, invites и capabilities
     только текущей сети.
7. По флагу `--with-reversible-write` создаётся один случайно именованный
   checklist template и удаляется тем же Web BFF. Остаток ищется по exact
   `(tenant, id, title)`. Если понадобился прямой SQL cleanup, результат —
   `FAIL`, даже когда остаток успешно удалён.

## Подготовка exact artifact

Использовать только архив и SHA из принятого Release Admission run. Hydration
выполняется только production-like Linux pipeline
`stage-release-artifact --hydrate` → no-egress systemd hydration →
`promote-release-artifact` → `seal-release-artifact`. Он использует exact
lockfile, заранее подготовленный root-owned offline pnpm store,
`--ignore-scripts`, `--package-import-method=copy`, создаёт
семиполевой `HYDRATION_SANDBOX_RECEIPT` с digest lockfile, store manifest и
store receipt, полный `HYDRATED_SHA256SUMS` и привязанный к нему
`HYDRATED_SYMLINKS.json`, затем переводит tree
в root-owned immutable boundary. Ручной `pnpm install`, сетевой install,
пересборка API/Web или копирование `dist/.next` из worktree запрещены.
Full regular-file coverage исключает только exact root path
`./HYDRATED_SHA256SUMS`; файл с таким basename в любом вложенном каталоге —
обычный artifact byte и обязан присутствовать в manifest.

## Запуск на disposable restored-copy

Production-like запуск выполняется только exact wrapper byte из принятого
artifact:

`/srv/leetplus/releases/<sha>/packages/database/scripts/run-current-release-restored-copy-acceptance.sh`.

Wrapper сам доказывает, что его `BASH_SOURCE` равен этому exact пути, имеет
одну ссылку, принадлежит root, недоступен для записи group/other и покрыт как
`SHA256SUMS`, так и `HYDRATED_SHA256SUMS`. Запуск копии из checkout, `/tmp`,
отдельного control bundle или старого release немедленно отклоняется.

Interpreter фиксирован как `/usr/bin/bash -p`; wrapper до первой внешней
команды требует privileged mode, удаляет **все** inherited exported variables
через builtin `compgen/unset` и затем экспортирует только exact
`PATH`, `LANG`, `LC_ALL`, `TZ`. Поэтому `BASH_ENV`, loader/preload/proxy или
случайный manager/operator environment не может изменить root-controller.

Один раз создать фиксированную непривилегированную identity и три state root:

```bash
sudo groupadd --system leetplus-rehearsal
sudo useradd --system --gid leetplus-rehearsal \
  --home-dir /nonexistent --shell /usr/sbin/nologin leetplus-rehearsal
sudo usermod --groups leetplus-runtime leetplus-rehearsal
sudo install -d -o root -g root -m 0700 \
  /etc/leetplus/rehearsal-credentials \
  /var/lib/leetplus/rehearsal-control
sudo install -d -o root -g leetplus-rehearsal -m 0710 \
  /var/lib/leetplus/rehearsal-evidence
```

Wrapper под глобальным lock сам создаёт transient root
`/run/leetplus-current-release-evidence` как
`root:leetplus-rehearsal 0710`, только если `/run` canonical root-owned и не
group/other-writable. Каждый operation target под ним имеет exact
`root:root 0700`, обязан быть raw-byte empty вне unit namespace и удаляется с
parent-directory fsync после доказанного drain. Этот `/run` state не является
durable evidence и безопасно пересоздаётся при reboot/reconcile.

Имена, UID/GID и production roots не имеют override. Primary group пользователя
равна только `leetplus-rehearsal`, а полный вывод `id -G leetplus-rehearsal`
обязан содержать ровно два уникальных GID: primary GID и GID
`leetplus-runtime`. Эта единственная supplementary group нужна для чтения
sealed artifact `root:leetplus-runtime 0550/0440`. `sudo`, `adm`, `wheel`,
`docker`, `systemd-journal`, secret/admin и любые другие группы запрещены.
Wrapper сверяет exact passwd record (`home=/nonexistent`,
`shell=/usr/sbin/nologin`), keyed reverse lookup и полную NSS enumeration всех
passwd/group records с тем же числовым UID/GID. Ровно одна запись обязана быть
byte-for-byte fixed `leetplus-rehearsal`; duplicate UID/GID alias, другой account
с тем же primary GID и непустой explicit member list primary group запрещены. До credential
admission, непосредственно до каждого transient launch и после каждого exact
unit/cgroup drain bounded `/proc/<pid>/{status,cgroup}` scan требует ноль
процессов с любым real/effective/saved/fs UID `leetplus-rehearsal`. Это не даёт
чужому same-UID процессу читать staged systemd credential или менять активный
evidence child. Evidence parent имеет exact
`root:leetplus-rehearsal 0710`, но в каждом transient mount namespace целиком
закрывается `InaccessiblePaths`. Exact current child появляется только по
отдельному bind в `/run/leetplus-current-release-evidence/<operation-id>`;
sibling host paths остаются `ENOENT|EACCES`, даже когда frozen child остаётся
group-readable для verifier. Durable control root имеет exact `root:root 0700`.
Operation ID — явный уникальный lowercase alnum nonce длиной 8–32 символа.
Wrapper сначала захватывает глобальный nonblocking
`/var/lib/leetplus/rehearsal-control/current-release-runtime.lock`, затем
публикует `<operation-id>.intent.json`, fresh service-owned evidence child,
пустой root-owned operation-scoped `/run` bind target и global
`active-operation.json` через exclusive create с fsync file + directory.
Intent и active marker связывают operation/release/request с `credentialId` и
stable descriptor identity credential `(device, inode, size, mtimeNs,
  ctimeNs)`, host evidence child и exact unit-private bind destination/path,
полученной через `O_NOFOLLOW` + два совпадающих `fstat`; secret hash или secret
values не сохраняются. Замена/ротация credential после intent требует нового
operation ID.

До каждого transient launch аналогично fsync-публикуется exact op/unit-bound
`main|drain|verify.launch.json`. Каждый phase-record явно содержит
`state=SUBMISSION_INTENT`: это доказательство намерения вызвать `systemd-run`,
но не доказательство принятого или завершённого unit. После всех
stop/drain/verification proofs
публикуется `<operation-id>.completion.json`; только **после durable completion**
разрешён `reset-failed`, а затем удаляется active marker с fsync control root.
Поэтому post-completion reset/GC не стирает уже зафиксированный результат, а
pre-completion GC разбирается отдельной reconcile-веткой. Наличие чужого active
marker блокирует любой новый operation даже после потери wrapper process/SSH
response.

Для каждого rehearsal root создаёт ровно один bounded credential file
`/etc/leetplus/rehearsal-credentials/<credential-id>.json` с owner/mode
`root:root 0400`, одной ссылкой и финальным LF:

```json
{
  "databaseUrl": "postgresql://runtime:...@127.0.0.1:55432/leetplus_restored_...",
  "evidenceHmacKey": "at-least-32-random-characters",
  "loginEmail": "owner@example.invalid",
  "loginPassword": "clone-only-password"
}
```

Допустимы ровно четыре показанных JSON key. Значения нельзя передавать в
аргументах, environment, transcript или evidence. Wrapper передаёт только путь
через
`LoadCredential=current-release-runtime.json:/etc/leetplus/rehearsal-credentials/<credential-id>.json`;
CLI читает staged credential из `$CREDENTIALS_DIRECTORY`. Direct secret
environment остаётся только unit-test интерфейсом и в privileged workflow
запрещён.

Host runtime фиксирован: `/usr/bin/node` обязан быть root-owned,
group/other-nonwritable regular executable версии `22.x.y`. Другая major
version отклоняется до systemd запуска.

Пример запуска (значения identity берутся из принятого artifact/restore
evidence, а не вычисляются «на глаз»):

```bash
sudo -- /usr/bin/bash -p \
  /srv/leetplus/releases/0123456789abcdef0123456789abcdef01234567/packages/database/scripts/run-current-release-restored-copy-acceptance.sh \
  --operation-id beta1gate01 \
  --release-sha 0123456789abcdef0123456789abcdef01234567 \
  --tenant-slug restored-club \
  --expected-system-identifier 7345521890044432101 \
  --expected-migration-count 199 \
  --expected-migration-head 20260821010101_example_head \
  --api-port 4311 \
  --web-port 4312 \
  --credential-id restored-clone-01 \
  --evidence-key-id beta1-rehearsal-v1
```

`--with-reversible-write` добавляется только для отдельного явно принятого
write/cleanup прогона. Wrapper передаёт секреты в transient systemd unit,
понижает UID до `leetplus-rehearsal` и задаёт:

CLI также принимает optional `--startup-timeout-ms`. Значение должно быть
каноническим целым числом от `10000` до `300000`; default равен `90000`.
Нормализованное, а не исходное значение применяется одинаково к запуску API и
Web и сохраняется как `evidence.runtime.startupTimeoutMs`. Production wrapper
намеренно использует зафиксированный default; изменение timeout требует нового
operation/receipt, а не неявной переменной environment.

```text
User=leetplus-rehearsal
Group=leetplus-rehearsal
SupplementaryGroups=leetplus-runtime
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
IPAddressDeny=any
IPAddressAllow=127.0.0.1/32 ::1/128
Delegate=no
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
InaccessiblePaths=/var/lib/leetplus/rehearsal-evidence
ReadOnlyPaths=/srv/leetplus/releases/<sha>
BindPaths=/var/lib/leetplus/rehearsal-evidence/<operation-id>:/run/leetplus-current-release-evidence/<operation-id>:norbind
ReadWritePaths=/run/leetplus-current-release-evidence/<operation-id>
KillMode=control-group
RuntimeMaxSec=840s
UnsetEnvironment=<direct-secret-env, BASH_ENV, ENV, NODE_OPTIONS, NODE_PATH,
  NODE_EXTRA_CA_CERTS, NODE_DEBUG, NODE_V8_COVERAGE, NODE_COMPILE_CACHE,
  SSLKEYLOGFILE, LD_PRELOAD, LD_LIBRARY_PATH, LD_AUDIT, GCONV_PATH, LOCPATH,
  OPENSSL_CONF, OPENSSL_MODULES, CURL/SSL override variables,
  upper/lower proxy env, NODE_USE_ENV_PROXY>
```

`InaccessiblePaths` присутствует у main, drain, verifier и replay и скрывает весь
host evidence root. `BindPaths` + `ReadWritePaths` присутствуют только у main и
показывают exact current child по отдельному unit-private `/run` path. После
freeze verifier/replay получают тот же current child через
`BindReadOnlyPaths=<host-child>:<unit-child>:norbind` +
`ReadOnlyPaths=<unit-child>`. Drain не получает ни bind, ни evidence path.

Fresh per-operation child создаётся как
`leetplus-rehearsal:leetplus-rehearsal 0700`. Пустой host destination под
`/run/leetplus-current-release-evidence` создаётся как `root:root 0700`; bind
замещает его только внутри exact transient unit namespace. CLI получает только
unit-private `/run/.../receipt.json`, а durable intent связывает этот путь с
исходным host child. После остановки main wrapper меняет child на
`root:leetplus-rehearsal 0750`, а единственный `receipt.json` — на
`root:leetplus-rehearsal 0440`; до любого root-side content read проверяются
type/link count/owner/mode и размер 2 B…8 MiB. Verifier/replay видят current
receipt через read-only bind в тот же отдельный `/run` destination. Они не видят
host evidence root или sibling paths; drain не видит ни current, ни siblings.
Уже замороженный receipt не перезаписывается и не размораживается. Пустой `/run`
destination удаляется только после exact unit/cgroup/process/port/DB drains;
при lost/ambiguous response он сохраняется или безопасно пересоздаётся тем же
operation ID до reconciliation.

Состав child читается bounded raw-byte iterator без newline-delimited shell
parsing: допустимы только zero entries либо ровно один regular byte-name
`receipt.json`. Дополнительное имя, включая LF/control/non-UTF8, отклоняется до
freeze и root-side content read.

Имя unit должно иметь вид
`leetplus-current-release-acceptance-<operation-id>.service`. Runtime bounded
также внешним `timeout`. После каждого main/drain/verifier запуска wrapper bounded
командой `systemctl show` читает lifecycle-проекцию `Id`, `LoadState`,
`ActiveState`, `SubState`, `MainPID` и `ControlGroup`. Для каждого ещё loaded
main/drain/verifier/replay дополнительно требуется exact 48-property effective
policy: identity/groups/login environment, credential/working directory,
environment allow/deny, network/capability/kernel/process namespace sandbox,
root/mount/RO/RW contours, kill/timeout/umask/stdout/stderr/runtime и один exact
child-policy `ExecStart`. Для существующего unit принимаются только
exact op-bound `loaded/inactive/dead` или `loaded/failed/failed` с
`MainPID=0`, ожидаемым `/system.slice/<exact-unit>` и доступным пустым
`cgroup.procs`. Пустота устанавливается bounded descriptor read до EOF, а не
`stat.st_size`/`test -s`: pseudo-file cgroupfs имеет size zero даже при наличии
PID. Для main исходный процесс после возврата `systemd-run` всегда трактует
`not-found/inactive/dead` как fail-closed и сохраняет durable state. Только exact
`--reconcile` может классифицировать absent main при существующем submission
intent: пустой child проходит независимые port/DB/service-UID drains и
фиксируется только как durable FAIL; frozen receipt может дать PASS только после
тех же drains, root-side secret scan и независимой HMAC-проверки exact artifact
verifier. Drain и verifier — state-proven read-only phases: их exact absent unit
после синхронного ответа допустим только вместе с проверкой exit status, а после
lost response их exact phase intent разрешает bounded повтор того же oracle.
Main при этом не запускается. `active`,
`activating`, `deactivating`, `reloading`, transport error, timeout,
неполный/unbounded ответ, неожиданный Id, unreadable/nonempty cgroup и любой
другой state дают fail-closed с сохранением active marker и evidence.
Для exact loaded terminal unit допускается уже собранный systemd пустой cgroup:
при этом всё равно обязательны сохранённая exact effective policy, `MainPID=0`
и отсутствие любых процессов service UID. `not-found` после launch по-прежнему
разрешается только отдельной reconcile-веткой.

Для `--with-reversible-write` absent/empty или иной непроверенный receipt нельзя
закрыть даже как автоматический FAIL: запись могла успеть committed до crash, а
её случайный fixture identifier ещё не был опубликован. После process/port/DB
drain wrapper сохраняет active marker и не создаёт completion до ручной проверки
residue. Снять блокировку автоматически может только leak-free signed PASS,
семантически подтверждающий cleanup и `residue=0`.

После stop wrapper независимо доказывает, что оба loopback-порта закрыты, а
bounded credential-fed drain unit подтверждает ноль restored-DB sessions,
исключая только собственную controller session. `systemctl reset-failed`
также имеет внешний 10-second timeout. Любой port/DB/reset/cleanup partial
failure сохраняет active marker: неизвестное состояние не превращается в
разрешение следующего operation. Если directory fsync после unlink marker не
подтверждается, wrapper fail-closed восстанавливает exact marker и не выдаёт
успех.
Windows/обычный shell может использоваться только для unit tests: он
намеренно получает `CURRENT_RELEASE_KERNEL_SANDBOX_REQUIRED` и не выпускает
acceptance PASS.

Main, drain и verifier units пишут stdout/stderr в `null`: credential values не
попадают в argv, stdout или journal. Secret-bearing direct environment,
shell/Node/native loader, coverage/cache, OpenSSL/locale, CURL/CA,
upper/lower proxy variables и `NODE_USE_ENV_PROXY` явно удаляются через
`UnsetEnvironment`. Credential
попадает в units только как
`LoadCredential=current-release-runtime.json:<root-owned-path>`. После любого
`ExecStart` сначала выполняется in-process fail-closed gate. До вызова CLI или
DB drain он сверяет real/effective/saved/filesystem UID/GID, exact primary +
`leetplus-runtime` groups, `/proc/self/cgroup`, cwd/Node 22, exact allowlist
`PATH/LANG/LC_ALL/TZ`, systemd login/credential variables и отсутствие любого
другого inherited manager environment. `/proc/self/cmdline` обязан содержать
exact Node/eval/marker/payload argv, а SHA-256 фактического eval source обязан
совпасть с отдельным exact unit-environment pin, вычисленным root-wrapper из
своих текущих bytes. Затем gate повторно читает и сверяет тот
же полный effective unit policy в живом `MainPID`. Поэтому signed PASS не может
быть создан процессом, который миновал identity/environment/policy gate; GC или
lost wrapper response не превращают непроверенный запуск в PASS.

После любого
main результата wrapper запускает bounded drain, затем bounded verifier с exact
artifact CLI `--verify-evidence`. Acceptance выдаётся только по повторно
проверенной HMAC подписи и `decision=PASS`; исходный exit status/потерянный
ответ сами по себе не являются evidence.

При crash/потере ответа повторить **ту же exact команду**, добавив
`--reconcile`. Wrapper сверит release, request, operation и credential
ID/nanosecond stat identity с durable intent/active marker. Main API/Web никогда
не запускается повторно. Уже завершённый PASS проходит только новый read-only
signed replay. Незавершённый post-submission operation сначала доказывает exact
main unit stopped + empty cgroup либо exact `not-found/inactive/dead`, затем port
drain и controller-excluded DB-session drain. При `not-found` main никогда не
перезапускается: zero-entry evidence даёт только FAIL, а receipt допускается к
PASS только через independent signed verifier. После этого повторяются только
read-only drain/verifier phases, если их response был потерян:

Если crash произошёл после durable completion, но до/во время `reset-failed`
или удаления active marker, exact reconcile принимает completion даже при ещё
существующем matching active marker, повторяет только signed replay/metadata
cleanup и удаляет marker. Launch state после reset при этом не используется как
источник истины, и main не перезапускается.

```bash
sudo -- /usr/bin/bash -p /srv/leetplus/releases/<sha>/packages/database/scripts/run-current-release-restored-copy-acceptance.sh \
  <те же exact аргументы> --reconcile
```

Crash после active-marker fsync, но до main submission-intent record,
разрешается только
exact `--reconcile`: wrapper требует exact `not-found/inactive/dead`, пустой
child и отсутствие launch proof, удаляет child/active marker и завершает
fail-closed; новый запуск требует новый operation ID. Crash после fsync
submission intent, но до вызова `systemd-run`, также закрывается только exact
reconcile: exact absent unit, zero-entry child и независимые drains приводят к
durable FAIL без main relaunch. Если transient main был принят, создал signed
receipt и затем был garbage-collected, первый процесс сохраняет marker и
завершается fail-closed; exact reconcile принимает PASS только после freeze,
port/DB/service-UID drains и signed replay. Изменённый аргумент,
отсутствующий/неподписанный receipt, preexisting evidence child, symlink,
hardlink, writable root, активный/transitional unit или foreign active marker
отклоняются.

Receipt сначала создаётся runtime как single-link regular file
`leetplus-rehearsal:leetplus-rehearsal 0600`, затем без чтения замораживается в
`root:leetplus-rehearsal 0440` внутри `root:leetplus-rehearsal 0750` child и
проверяется как bounded stable
`O_NOFOLLOW` descriptor. Evidence не удаляется автоматически: после PASS/FAIL
его сначала переносят в immutable off-host rehearsal bundle вместе с intent,
phase/completion records и только затем удаляют credential file по отдельной
root-процедуре.

Если direct environment использовался в локальном unit test, после команды
удалить четыре secret values из процесса. В privileged Linux wrapper они
запрещены. Пароль допустимо менять только у пользователя disposable clone;
production credential не должен участвовать в этом gate.

## Acceptance

Допускается только receipt со всеми условиями:

- `decision = PASS` и `reasonCode = null`;
- `releaseSha`, artifact `buildId`, API `/version`, readiness и Web identity
  соответствуют одному exact SHA;
- migration head/count соответствуют принятому artifact provenance;
- все probe status равны `200` (login/create могут быть `200/201`);
- runtime `outputLimitExceeded`, `secretLeakDetected` и
  `networkBlockDetected` равны `false`;
- `evidence.runtime.startupTimeoutMs` находится в допустимом диапазоне и равен
  нормализованному CLI/default контракту;
- kernel sandbox evidence подтверждает loopback allow и non-loopback
  `EACCES|EPERM` deny;
- runtime role/object ownership mismatch = `0/0/0`;
- каждый critical read имеет semantic projection evidence, не только status;
- после остановки process groups оба порта свободны, DB sessions кроме
  отдельной drain-controller session равны нулю и foreign service-UID process
  отсутствует; сохранившийся exact unit имеет `MainPID=0` и читаемый пустой
  неделегированный cgroup, а collected main допускается только exact
  not-found-веткой с подписанным runtime kernel evidence и повторными drains;
- cleanup `residue = 0` и `directCleanupRequired = false`;
- `evidenceDigest` и `signature.value` — lowercase SHA-256/HMAC digests;
- повторная HMAC-проверка исходным rehearsal key проходит.

Receipt публикуется один раз через `O_EXCL`, fsync file + parent directory и
никогда не перезаписывает существующий path. Он содержит только probe
names/status/bytes/body hashes, агрегатные
счётчики, digests runtime logs/DB identities и HMAC. HTTP bodies, runtime logs,
tenant/user IDs, e-mail, password, JWT, connection string и process-local
secrets не сохраняются.

Privileged isolation-контракт отдельно доказывается на disposable Linux CI с
реальным systemd и отдельным service UID. Sibling sentinel намеренно остаётся
DAC-readable как `root:<service-group> 0750/0440`, чтобы тест доказывал именно
mount-namespace boundary, а не только mode bits. Main получает `ENOENT|EACCES`
на current/sibling host paths, сохраняет возможность `O_EXCL`-записи через exact
unit-private writable bind; verifier читает current receipt только через exact
read-only bind и также получает `ENOENT|EACCES` на оба host evidence path. Fixture
сам запускается только как `/usr/bin/bash -p`, до первой внешней команды удаляет
все inherited exported variables и восстанавливает exact
`PATH/LANG/LC_ALL/TZ`. Все privileged tools имеют fixed absolute paths,
root-owned canonical non-writable bytes/ancestor chain; Node 22 заранее
копируется в fixed `/usr/local/libexec/leetplus/current-wrapper-fixture-node22`.
Fixture извлекает exact embedded `child_policy_eval` из wrapper по уникальным
границам, вычисляет его SHA-256 и запускает именно эти bytes внутри real systemd
для `main`, `verify`, `drain` и signed `replay`; отдельный похожий evaluator не
считается доказательством. Каждый child изнутри сверяет четыре UID/GID поля,
real/effective numeric identity, exact primary + отдельную runtime group,
собственный cgroup/cwd/Node, source digest и exact environment allowlist, а также
полную 48-property effective policy/lifecycle/ExecStart projection. Root-controller
затем подтверждает successful exited state, нулевой `MainPID` и bounded-empty
`cgroup.procs` вместе с `InaccessiblePaths`, `BindPaths`/`BindReadOnlyPaths` и
`ReadWritePaths`/`ReadOnlyPaths` transient unit. До bind-тестов fixture full-scan
NSS обязан отклонить duplicate UID, duplicate primary GID, duplicate runtime
read-group GID, foreign primary-GID user,
неверный home, interactive shell и живой foreign same-UID process; после stop
этого hostile unit `/proc`-fence обязан снова дать zero:

```bash
sudo -n /usr/bin/install -d -o root -g root -m 0755 /usr/local/libexec/leetplus
sudo -n /usr/bin/install -o root -g root -m 0755 \
  "$(/usr/bin/realpath -e -- "$(command -v node)")" \
  /usr/local/libexec/leetplus/current-wrapper-fixture-node22
sudo -n /usr/bin/env -i \
  CI=true \
  GITHUB_ACTIONS=true \
  CURRENT_WRAPPER_EVIDENCE_ISOLATION_FIXTURE_CONFIRM=run-root-current-wrapper-evidence-isolation-fixture \
  LANG=C LC_ALL=C TZ=UTC PATH=/usr/sbin:/usr/bin:/sbin:/bin \
  /usr/bin/bash -p .github/scripts/test-current-release-restored-copy-acceptance-wrapper.sh \
  --privileged-evidence-isolation-fixture
```

## Интерпретация clone-only classification

Если исходная restored-copy содержит активных пользователей с
`accessScope = NULL`, gate обязан завершиться с
`CURRENT_RELEASE_ACTIVE_SCOPE_UNRESOLVED`. Для отдельной проверки runtime
binary допускается создать ещё один disposable clone и применить к нему
явно зафиксированный test-only classification overlay.

Такой overlay доказывает только совместимость exact release artifact с
целевым `NETWORK` scope. Его `PASS` не является production data admission и
не разрешает автоматически классифицировать production-пользователей.
Платформенный пользователь также никогда не считается tenant `NETWORK`
автоматически. Production-переход требует отдельного reviewed classify
manifest, `plan`, управляемого `apply`, проверки агрегатов и `zero-diff` для
всех нецелевых строк.

После clone-only запуска нужно подтвердить отсутствие fixture residue и
runtime sessions, удалить только classified disposable clone и повторно
зафиксировать, что исходная restored-copy сохранила исходное число миграций и
неразрешённых scope. Эти сведения сохраняются только как агрегаты без ID,
e-mail и иных PII.

## Что следует после PASS

Ранний Windows attempt на test-only classified clone считается
`SUPERSEDED_DIAGNOSTIC`: он помог выявить data blocker, но был выполнен до
full-tree/kernel/role/drain hardening и не закрывает этот gate.

PASS нового контракта закрывает только current-release runtime compatibility gate. До
production canary отдельно обязательны scheduler-free legacy rollback slot и
drain verifier, production role/HBA/TLS/SCRAM/pool attestation, свежий
immutable off-host backup с restore proof, production signing material,
privileged Linux rehearsal и управляемое canary/rollback окно.
