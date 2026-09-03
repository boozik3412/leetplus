# SHA-bound production artifact staging

`stage-release-artifact.sh` является только подготовительной частью
production-release. Он принимает artifact, который уже был выпущен GitHub Full
Release Admission для одного exact SHA, проверяет его целостность и помещает в
новую release directory. Скрипт не скачивает файлы, не читает secrets, не
подключается к PostgreSQL и не управляет systemd.

Канонические source-инварианты slots, ports, systemd EnvironmentFiles,
runtime NSS groups, transient restored-copy identity и независимых slot-link
receipts собраны в машиночитаемом
[`production-topology-contract.json`](./production-topology-contract.json).
[`verify-production-topology-contract.mjs`](./verify-production-topology-contract.mjs)
сверяет его с operational scripts в Fast CI и Full Release Admission. Этот же
verifier вызывается disposable root/systemd twin: обе blue/green API/Web пары
поднимаются на exact ports и runtime identities, transient restored-copy phase
обязана вернуться в steady state без residue, после чего отдельно выполняются
fixtures slot bind и cutover/rollback. Это live evidence только одноразового CI
runner, а не production: installed generation, production read-only probes,
signed receipts и отдельный GO остаются обязательными. План следующих этапов
описан в
[`release-pipeline-acceleration.md`](../release-pipeline-acceleration.md).

## Пример prepare-only проверки

```bash
install -d -o root -g leetplus-build -m 0750 /srv/leetplus/release-inbox
install -d -o leetplus-build -g leetplus-build -m 0750 \
  /srv/leetplus/rehearsal-releases
install -o root -g leetplus-build -m 0440 \
  /secure/inbox/leetplus-release-<sha>.tar.gz \
  /secure/inbox/leetplus-release-<sha>.tar.gz.sha256 \
  /srv/leetplus/release-inbox/
sudo -u leetplus-build /usr/bin/env -i \
  /usr/local/libexec/leetplus/stage-release-artifact.sh \
  --release-sha <exact-40-character-sha> \
  --artifact /srv/leetplus/release-inbox/leetplus-release-<sha>.tar.gz \
  --artifact-sha256 /srv/leetplus/release-inbox/leetplus-release-<sha>.tar.gz.sha256 \
  --output-root /srv/leetplus/rehearsal-releases
```

Эта команда только проверяет и распаковывает artifact; её результат не имеет
production hydration receipt и не может быть promoted. Production `--hydrate`
намеренно разрешён исключительно внутри versioned systemd unit и требует
отдельного unprivileged system user
`leetplus-build`, чистого от runtime secrets/production credentials и
изолированного от внешней сети и local Unix sockets. Он запускает exact copy-only
`pnpm install --prod --offline --frozen-lockfile --ignore-scripts
--side-effects-cache-readonly --package-import-method=copy` через одноразовый
writable store-wrapper над read-only `/srv/leetplus/pnpm-store/v10/files` и
`/srv/leetplus/pnpm-store/v10/index`,
затем копирует два exact Prisma engine из manifest-bound
`/srv/leetplus/pnpm-store/.leetplus-tools/prisma-engines/6.19.3/debian-openssl-3.0.x`
во временный private input, запускает Prisma generate с command-scoped engine
paths, удаляет этот input, отвергает hardlinks и создаёт
полный `HYDRATED_SHA256SUMS`. Root и
runtime users не имеют права выполнять hydration. Ошибка сохраняет staging
directory для расследования и никогда не перезаписывает существующий release.
При построении manifest исключается только exact root
`./HYDRATED_SHA256SUMS`; одноимённый regular file в любой вложенной директории
остаётся связанным digest, а немедленная exact-tree проверка отвергает любой
пропущенный или лишний путь.

Любой production mode запускается только direct installed shebang
`/usr/bin/bash -p`, полностью удаляет inherited exported environment до первого
tool invocation и восстанавливает exact `PATH=/usr/sbin:/usr/bin:/sbin:/bin`,
`C.UTF-8` и `UTC`. Prepare-only launcher выше также даёт пустой initial env;
systemd unit делает эквивалентную loader/env boundary до `/usr/bin/flock` для
hydration. Repository checkout или `bash stage-release-artifact.sh` не являются
production authority.

Artifact и checksum обязаны находиться в одной canonical директории, иметь
exact `root:leetplus-build 0440`, один link и root-controlled ancestors без
symlink, group/other write или unreviewed mount boundary. Единственное исключение
— exact read-only leaf mount, созданный reviewed hydration unit через
`ReadOnlyPaths=/srv/leetplus/release-inbox`. Stager создаёт в output root
приватную копию через `cp --reflink=never`, проверяет её checksum и
повторно связывает inode/bytes до и после archive extraction; дальнейшие
операции не читают mutable inbox bytes.

## Переход к production

После успешного stage оператор выполняет только порядок из
[Controlled Beta-1 production canary plan](../../open-beta/controlled-beta-1-production-canary-plan.md):

1. проверенный backup и restored-copy rehearsal;
2. production-safe history controller и migration deploy из staged exact artifact;
3. запуск candidate API/Web отдельной `blue|green` парой на loopback-портах;
4. fail-closed config validation, exact API SHA/migration и Web BUILD_ID probe;
5. atomic nginx link switch с bounded watchdog и exact rollback receipt;
6. только после этого controlled `Tenant B/Store B1` activation.

Для `L2_SCHEMA_SECURITY` первый пункт разрешено готовить параллельно Full
Admission только через
[`parallel-backup-restored-copy-evidence`](../parallel-backup-restored-copy-evidence.md):
после final admission его digests обязательно повторно связываются со свежим
live evidence, а короткоживущий binding сам по себе не разрешает effect.

Обычный runtime rollout после отдельного production GO можно выполнять через
[`resumable-release-orchestrator`](../resumable-release-orchestrator.md). Он
последовательно вызывает те же hydration/promote, slot bind, loopback smoke и
blue/green authority, но связывает их защищённой цепочкой phase receipts и
возобновляет exact operation после lost response. Orchestrator не выполняет
schema/ACL/worker effects и не заменяет L2 signed controller.
Тот же installed authority предоставляет только ручной двухфазный retention
обезличенных attempt metrics: read-only exact plan и root-only digest-bound
apply под exclusive install/orchestrator locks. Archive остаётся локальным
root-owned evidence; runtime, DB, network и user security contours не
затрагиваются. Наличие source bytes не разрешает установку или запуск без
admitted production-control generation и отдельного GO.

Legacy `git pull → build → restart` не является допустимым заменителем этой
процедуры. Замена production timer/unit, перенос sensitive backup residue и
runtime switch требуют отдельного разрешения владельца production.

## Подготовленные systemd templates

[`systemd/`](./systemd/) содержит versioned instance templates
`leetplus-api@.service`/`leetplus-web@.service`, safety overlay и отдельный
oneshot migration unit. Candidate работает через `/srv/leetplus/slots/blue|green`
на портах `4100/3100` или `4200/3200`. До первого cutover scheduler-capable
legacy `4000/3000` обязательно останавливается и durably fenced, а HTTP rollback
переносится в scheduler-free N−1 пару `4300/3300`. API secrets читаются из
`/etc/leetplus/runtime.env`, а Web получает
только `/etc/leetplus/web-runtime.env`; оба файла находятся вне checkout и
artifact. API/Web каждого slot запускаются разными identities
`leetplus-api-blue|green` и `leetplus-web-blue|green` с общей read-only artifact
group `leetplus-runtime`, а API env явно недоступен Web unit. Перед каждым start
service-user preflight проверяет root ownership/permissions, post-hydration
manifest, provenance/migration и Web BUILD_ID; только API запускает production
config validator.
Web shadow unit имеет systemd `IPAddressDeny=any` и разрешает только localhost:
nginx и paired API. API по-прежнему слушает только `127.0.0.1`, но использует
отдельный reviewed network profile с исходящим TCP/DNS, потому что текущая
архитектура выполняет интеграции Langame/SMTP/SMS/provider непосредственно из
API-процесса. Применение Web-профиля `localhost-only` к API является production
regression: оно отключает актуальные сессии Langame и чек-ин во всех клубах.
Нелокальный `DATABASE_URL` по-прежнему приведёт к fail-closed readiness до switch.

Одноэкземплярные `leetplus-api.service`/`leetplus-web.service` сохранены только
как исторические templates и не разрешены для первого artifact cutover: restart
на тех же портах создаёт окно 502. Шаблон migration unit также не считается
production-safe history controller и не запускается до отдельного принятия
production-history пути.

Эти файлы ещё **не установлены** на server. Перед установкой оператор обязан
сверить текущие units, создать защищённый runtime env из существующей
конфигурации без вывода secrets, подготовить `/srv/leetplus/releases` и
`/etc/leetplus/release-env`, выполнить restored-copy rehearsal, затем отдельным
окном применить reviewed files, `daemon-reload` и проверку rollback. До этого
legacy deploy timer остаётся production blocker и не должен отключаться
автоматически.

Ручное `install`/`cp` этих файлов из checkout запрещено. Full Release Admission
теперь строит отдельный `leetplus-production-control-<SHA>.tar.gz` и внешний
SHA-256 из exact Git objects, повторно собирает и byte-for-byte сравнивает его в
fresh handoff job. Само наличие загруженного payload не является admission:
единственный положительный authority — отдельно загруженный final receipt,
связанный с exact artifact IDs и transport/payload digests. До зелёного Full CI,
скачивания exact receipt и независимой повторной проверки архив не считается
installable. Root bootstrap authority принимает только canonical allowlist полного
control manifest: stage/store/hydration/seal/promote/bind/preflight/cache,
readiness/cutover/current units и вложенный scheduler-free N−1 bundle вместе с
его independently pinned manifest. Архив с link/special/hardlink, дубликатом,
лишним/пропущенным путём, несовпадающим outer/inner digest или mutable source
не устанавливается. Runtime release artifact остаётся отдельным двухфайловым
контрактом и не может подменить control artifact. Конкретная install-команда
берётся только из SHA-bound CI evidence этого control artifact; локально
собранная команда/копия не является deployable authority.

Полный control payload устанавливается только отдельно просмотренным bootstrap
`/usr/local/sbin/leetplus-install-production-control-v1` (`root:root 0500`).
Bootstrap не распаковывается и не запускается из скачанного архива: оператор
сначала устанавливает exact reviewed byte независимо, а затем помещает в
`/srv/leetplus/production-control-inbox` с `root:root 0440` четыре файла одного
SHA: control archive, его `.sha256`, final admission JSON и его `.sha256`.
Admission receipt должен быть canonical receipt автоматического Full CI для
`boozik3412/leetplus`, `ci.yml@refs/heads/main`, с `workflowSha == release SHA` и
exact `productionControlArchiveSha256`. Full CI теперь дополнительно выпускает
его только после повторной проверки exact runtime-eligible main-push candidate;
manual, scheduled, feature-branch и Markdown-only runs final handoff не создают.
После независимой проверки команда имеет
ровно один production input:

```bash
sudo /usr/bin/env -i /usr/local/sbin/leetplus-install-production-control-v1 \
  --release-sha <exact-40-character-SHA>
```

Authority через `O_NOFOLLOW` создаёт приватный non-reflink byte snapshot,
повторно связывает inode/size/ctime/digest входа, до extraction проверяет каждый
raw ustar header и bounded regular-file envelope и запускает shipped outer
verifier только из root-owned immutable extraction. Затем он публикует exact
generation `/srv/leetplus/production-control-generations/<SHA>`, применяет только
digest-pinned `production-control-install-map.tsv`, provision-ит полный exact
scheduler-free inner bundle и выполняет `daemon-reload`. Отдельный inner launcher
по-прежнему отвечает за установку rollback contour; outer installer не активирует
его сервисы и не делает cutover.
Installer удерживает exclusive inode
`/run/leetplus-production-control/install.lock` от чтения admitted inputs до
финальной проверки. Любой caller, включая promoter, обязан получить и удерживать
тот же exclusive lock до installed-generation gate и завершения своих
state/effect операций, иначе verification и замена control generation могли бы
пересечься.

До первого installed byte создаётся durable
`production-control-generation-<SHA>.intent.json`. Повтор после interruption
идемпотентно восстанавливает те же bytes; accepted
`production-control-generation-<SHA>.receipt.json` (`root:root 0400`) появляется
только после полного install-map и связывает archive/admission, outer/inner
manifest, map, installer, stager, hydration attestor/unit, sealer и promoter
digests. Наличие receipt само по себе недостаточно: production caller обязан
запускать `/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs`
с `--release-sha <SHA> --require-root-authority`; outstanding intent, drift любого
installed byte, mount/link/hardlink, неверный mode/owner или receipt pin дают
fail-closed отказ. Final admission schema `2` дополнительно фиксирует только
`effectiveLane=L1_RUNTIME|L2_SCHEMA_SECURITY` и SHA-256 exact impact receipt.
Эти значения должны совпадать в immutable runtime/control provenance; installer
переносит их только в root-only installed-generation receipt, не из operator
environment. Promoter до global hydration lock получает и удерживает
installer lock, извлекает единственный verifier digest из root-only receipt,
сверяет exact installed verifier byte и запускает его в `env -i`. Только exact
16-line PASS record с тем же release/receipt, trusted lane/impact digest и текущими manifest, map,
installer, stager, hydration attestor/unit, sealer и promoter digests допускает
обращение к promotion state; lock остаётся открыт до последнего publication
effect.

До установки units создаются shared group `leetplus-runtime`, отдельные system
users без login/home `leetplus-api-blue`, `leetplus-api-green`,
`leetplus-web-blue`, `leetplus-web-green` с primary group
`leetplus-runtime`, а также отдельный build user `leetplus-build`. Parent
`/var/lib/leetplus` остаётся `root:root 0755`; deploy receipts — `root:root
0700`. API secret env имеет `root:<api-only-group> 0640`, Web env —
`root:<web-only-group> 0640`, slot/safety metadata — `root:leetplus-runtime
0440`. Web identities никогда не входят в API-only secret group.

Production hydration выполняется только versioned unit
`leetplus-release-hydrate@.service` с `IPAddressDeny=any`, без runtime env.
Unit явно удаляет manager/global `NODE_*`, loader, proxy и runtime-secret
переменные, фиксирует безопасный `PATH` и закрывает capabilities/devices/kernel
interfaces. Stager после проверки systemd identity очищает весь унаследованный
environment и возвращает только фиксированные PATH/locale/timezone, sandbox
marker и exact `INVOCATION_ID`. До pnpm/Prisma execution stager обязан получить
kernel-level отказ `EACCES`/`EPERM`/`EAFNOSUPPORT` на bounded loopback
AF_INET-connect probe; любой connect, timeout или обычный socket error является
stop condition:

```bash
groupadd --system leetplus-runtime
groupadd --system leetplus-build
groupadd --system leetplus-api-runtime
groupadd --system leetplus-web-runtime
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid leetplus-build leetplus-build
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid leetplus-runtime --groups leetplus-api-runtime leetplus-api-blue
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid leetplus-runtime --groups leetplus-api-runtime leetplus-api-green
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid leetplus-runtime --groups leetplus-web-runtime leetplus-web-blue
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid leetplus-runtime --groups leetplus-web-runtime leetplus-web-green

systemd-tmpfiles --create /etc/tmpfiles.d/leetplus-release.conf

install -d -o root -g leetplus-build -m 0750 /srv/leetplus/release-inbox
install -d -o leetplus-build -g leetplus-build -m 0750 /srv/leetplus/release-builds
install -d -o root -g leetplus-runtime -m 0710 /srv/leetplus/release-promotions
install -d -o root -g root -m 0755 /srv/leetplus/releases /srv/leetplus/slots
test "$(stat -c '%U:%G:%a' /run/leetplus-release/hydration.lock)" = \
  'root:leetplus-build:660'

systemctl start leetplus-release-hydrate@<exact-40-character-SHA>.service
systemctl is-active --quiet leetplus-release-hydrate@<exact-40-character-SHA>.service
sudo /usr/local/sbin/leetplus-promote-release-artifact \
  --release-sha <exact-40-character-SHA> --slot blue
```

До hydration trusted store собирается **не на production** в таком же exact
Node major/pnpm `10.33.2` окружении. Сначала `pnpm fetch --prod
--frozen-lockfile --ignore-scripts --package-import-method=copy --store-dir
<empty-store>` получает lockfile-bound package bytes без выполнения package
code. Затем в disposable exact-source workspace выполняется `pnpm install
--prod --offline --frozen-lockfile --side-effects-cache
--package-import-method=copy --store-dir <empty-store>`: pnpm запускает только
dependency hooks из reviewed `allowBuilds` и сохраняет их platform/Node-bound
side-effects в тот же CAS. Оба проверенных Prisma engine дополнительно копируются
как regular-file authority в
`<empty-store>/.leetplus-tools/prisma-engines/6.19.3/debian-openssl-3.0.x`,
чтобы production не зависел от ambient `HOME/.cache/prisma` или внутреннего
выбора pnpm side-effects key. После удаления disposable `node_modules` exact
package tree самого `pnpm 10.33.2` копируется
в `<empty-store>/.leetplus-tools/pnpm/10.33.2`, после чего содержимое store
архивируется и получает отдельный SHA-256. Production hydration не доверяет
host-level Corepack shim и не допускает сетевой fallback: pnpm запускается
через `/usr/bin/node` непосредственно из этого manifest-bound read-only tree.
На production оба файла и exact
`pnpm-lock.yaml` импортируются только через root
`stage-pnpm-store.sh --archive ... --archive-sha256 ... --lockfile ...
--node-major 22 --pnpm-version 10.33.2`. Скрипт не выполняет package code,
запрещает path traversal, symlink/special/hardlink, exact/nested mounts и
переход на другое устройство. До публикации он строит canonical полный manifest
каждого store file, пишет receipt с lockfile/bundle/manifest/verifier digests и
file count, затем повторно проверяет весь root-owned read-only tree общим
`verify-pnpm-store-integrity.mjs`. Hydration выполняет ту же проверку и связывает
store manifest/receipt SHA-256 со своим sandbox receipt **до** первого `pnpm`.
Для обязательной pnpm project registration stager создаёт внутри disposable
`node_modules` отдельный writable store-wrapper, связывает его `v10/files` и
`v10/index` с immutable trusted CAS, а после offline install полностью удаляет
wrapper. `v10/projects` остаётся только внутри disposable wrapper. Unit видит
исходный store только read-only; полная integrity-проверка
повторяется после install и Prisma generate. Любой topology/ownership/digest,
Node/pnpm/lockfile mismatch или попытка fallback в сеть останавливает release.

Команды создания identity выполняются только если exact user/group ещё нет;
существующая запись с другим UID/GID/membership, duplicate UID, другой
primary user или другая NSS group с тем же build GID является stop condition,
а не поводом запускать `useradd` повторно. Build, promotions и releases обязаны быть на одной
filesystem. Hydration и promotion используют один root-provisioned stable lock
inode; concurrent hydration/promote запрещены. Global `release-builds` обязан
быть exact empty до каждого hydration; stager проверяет его полный top-level
inventory вокруг каждого artifact-controlled шага и повторно связывает identity
и digest исходного `SHA256SUMS`, поэтому generator не может создать sibling или
переписать source manifest и затем сам себя заверить. Непосредственно перед переносом
builder-owned tree promoter выполняет bounded `/proc` inventory и требует ноль
процессов с real/effective/saved/fs UID `leetplus-build`, включая процессы вне
hydration cgroup. Promoter связывает
receipt с exact successful systemd `InvocationID`, доказывает пустой cgroup,
до доверия receipt проверяет exact installed fragment SHA, отсутствие drop-ins,
`systemd-analyze verify` и полный effective-property allowlist (identity,
`ExecStart`, env scrub, filesystem/kernel/network sandbox). После остановки
completed oneshot тот же policy digest проверяется повторно. До остановки unit
promoter O_EXCL-публикует и syncfs-ит root-only promotion intent, связывающий
exact invocation, source receipt, unit/stager/policy, hydrated manifest и все
три допустимых state path. Сам promoter принимается
только при прямом запуске через privileged Bash shebang и до обращения к
systemctl/Node очищает окружение, фиксируя PATH/locale/timezone. Только затем
builder-owned tree переходит в недоступный builder-у root boundary, повторно
проверяются no-egress receipt, canonical exact-tree runtime manifest и seal.
Неуказанный regular file является stop condition. Exact build/promotion/
release roots не могут быть mountpoints; exact candidate paths и весь receipt
subtree не могут содержать вложенные mounts. Root identities фиксируются до
lock и повторно проверяются до/после intent, rename, seal, receipt и syncfs.
До final release rename
promoter O_EXCL-публикует и syncfs-ит root-only
`/var/lib/leetplus/deploy-receipts/release-hydration-attestation-<SHA>.receipt`,
который связывает source receipt, exact invocation, unit/stager/policy и hydrated
manifest digests. Поэтому release никогда не становится bindable без durable
authority. Поле `RELEASE_SLOT` в этой записи фиксирует только проверенный
blue/green origin процесса hydration, а не ограничивает destination slot:
неизменяемый sealed artifact может быть отдельно привязан к обоим runtime slots,
и каждый bind всё равно имеет собственные slot-scoped intent/receipt и unit
preflight. Повтор той же promotion после crash/lost response принимает только
один exact state, связанный durable intent: stopped source, builder/root-owned
promotion quarantine (включая crash до/после seal или receipt) либо final sealed
release с receipt. Он повторно проверяет inactive unit policy, отсутствие build
UID процессов, manifests и idempotent seal, затем завершает или подтверждает
publication; несовместимый state остаётся root-only quarantine и fail-closed
stop. Promotion root имеет exact `root:leetplus-runtime 0710`, а final releases
root — `root:root` без group/other write; sealer проверяет эти разные authority
границы явно. Slot/nginx/DB при этом не изменяются.

Перед install каждый source file сверяется с exact candidate Git blob. Unit и
nginx templates устанавливаются root-owned/group-other-nonwritable; slot env и
runtime env имеют mode `0640`. До первой необратимой границы active link может
указывать на проверенный `legacy.conf`, но этот scheduler-capable target не
является допустимым blue/green rollback. Сначала обязательная процедура
[`scheduler-free-n-minus-one-runbook.md`](./scheduler-free-n-minus-one-runbook.md)
поднимает reviewed auth-edge на `4300`, exact `7de04ff4…` child на защищённом
`4301` и Web на `3300`, атомарно маршрутизирует
`legacy-safe.conf`, ставит systemd+DB start fences и доказывает полный drain
старых `4000/3000` units/sessions.

Nginx никогда не направляется на `4301`. Auth-edge оставляет публичными только
exact `GET /health` и `POST /auth/login`; каждый другой запрос сначала проходит
uncached bounded `/auth/me` introspection на legacy child. Root-owned preload
принудительно исправляет wildcard `app.listen(PORT)` exact 7de на
`127.0.0.1:4301`, а ordered nft fence разрешает этот порт только API UID.

После hydration exact release обязательно проходит
[`seal-release-artifact.sh`](./seal-release-artifact.sh): весь release становится
root-owned, service-readable и service-non-writable. Пустой `.next/cache`
служит только bind-mount point; Web instance получает отдельный persistent
`/var/cache/leetplus-web-blue|green`. Перед первым start и каждой сменой SHA root
запускает `prepare-web-slot-cache.sh` только при доказанно остановленном unit.
Допустимы ровно два unit-file состояния: обычное `loaded/enabled` либо exact
root-owned instance mask `/etc/systemd/system/leetplus-web@<slot>.service ->
/dev/null`. Resumable orchestrator использует второй вариант: BIND сначала
выполняет `mask --now` для API/Web, затем готовит cache и меняет slot link;
SMOKE снимает маски перед enable/start. Неожиданный mask target, owner или
systemd state остаётся stop condition.
Старый cache переносится в root-only quarantine, а root-owned authoritative
marker `/var/lib/leetplus/web-cache-releases/<slot>.sha` привязывает новый cache
к exact SHA. Web preflight отклоняет отсутствующий или чужой marker. Остальная
release directory остаётся read-only.

Atomic routing задаётся reviewed файлами из [`nginx/`](./nginx/). Входом в
первый blue/green cutover является только уже активный scheduler-free
`legacy-safe.conf` (`4300/3300`); `legacy.conf` и старые `4000/3000` процессы
скрипт отклоняет. Затем [`blue-green-cutover.sh`](./blue-green-cutover.sh)
создаёт root-only durable
pre-effect intent, до effect проверяет full host nginx config с candidate include
в private mount namespace, атомарно меняет nginx include, выполняет `nginx -t`, graceful
reload и bounded public watchdog. При любой ошибке exact previous target
восстанавливается и проверяется отдельным authenticated read-only smoke.
Watchdog сначала требует три последовательных public readiness-пробы одного
release/schema/Web BUILD_ID, затем в том же абсолютном deadline выполняет один
authenticated catalog smoke и принимает switch только при его успехе. Такой
порядок не смешивает здоровье runtime с наблюдаемым production ingress
post-login cooldown: сразу после stateful smoke следующий запрос может кратко
получить `400`, поэтому auth не запускается между тремя readiness samples.
Любая readiness-ошибка обнуляет серию, а auth-ошибка отклоняет switch. Readiness
и authenticated child processes не наследуют descriptor shared cutover lock:
даже если bounded probe оставит краткоживущий descendant после deadline, он не
может блокировать следующую reconciliation/cutover операцию.
Blue/green не останавливает previous scheduler-free pair; scheduler-capable
legacy units уже durably fenced/stopped предыдущей обязательной процедурой и
никогда не возвращаются в route. До switch candidate API/Web обязаны
быть одновременно `active` и `enabled`, а templates упорядочены до nginx. После
accepted switch active slot остаётся boot-enabled до отдельного soak/retire
gate. Если внешний smoke недоступен, link
остаётся восстановленным, но rollback fail-closed сообщает отсутствие serving
evidence. Успешный switch оставляет accepted receipt для отдельного
`rollback --receipt`; право rollback связано только с последним принятым
монотонным generation index, поэтому старый или уже использованный receipt
fail-closed отклоняется. Durable `.intent` и атомарные phase records
поддерживают crash/lost-response recovery до receipt/index.
Установленный
[`leetplus-resumable-release-orchestrator`](../resumable-release-orchestrator.md)
добавляет внешний exact plan и SHA-256-linked receipts для полного порядка
hydrate → bind → smoke → cutover → postcheck. Он не ослабляет внутренний
cutover recovery и никогда не останавливает hot previous slot.
Handled signal/exit запускает exact rollback guard. Для `SIGKILL`/host loss
pre-nginx recovery unit восстанавливает и syntax-check'ит N-1 link без
рекурсивного nginx systemd job, а отдельный 10-секундный post-start watchdog
делает reload/public serving confirmation и архивирует intent. Новый switch
запрещён, пока существует outstanding intent.

Mutable Langame discrepancy evidence не записывается в immutable release.
До запуска API оператор создаёт отдельный persistent root и фиксирует тот же
абсолютный путь в `/etc/leetplus/runtime.env`:

```bash
install -d -o root -g leetplus-api-runtime -m 2770 /var/lib/leetplus/langame-sync
```

Только API slot users входят в `leetplus-api-runtime`; Web/legacy identities не
получают write в этот path. Per-slot log directories создаёт systemd через
`LogsDirectory=leetplus/api-%i`. Перед установкой оператор отдельно проверяет
exact membership обеих shared groups.

`leetplus-langame-discrepancy-audit-preflight.service` запускается перед каждым
стартом обоих API slot и только проверяет этот контракт: root и только его
direct UUID tenant directories, отсутствие symlink/mount/unexpected objects,
`root:leetplus-api-runtime 2770` на root и `leetplus-api-<slot>:leetplus-api-runtime
2770` на tenant directory. Он выполняет bounded двусторонние blue→green и
green→blue create/read/delete probes и не делает repair. Если legacy directory
остаётся в `0770`/`0750`, root operator сначала получает exact `plan` от
`leetplus-langame-discrepancy-audit-authority`, а затем отдельным explicit
confirmation применяет только group/mode repair; owners, releases, database,
network и systemd unit files этот authority не меняет.

Unattended daily sync не запускается внутри обоих API slot. Отдельные
`leetplus-langame-daily-worker.service`/`.timer` разрешают active immutable
release и требуют тот же storage preflight. Secret env создаётся оператором как
`/etc/leetplus/langame-daily-worker.env` (`root:leetplus-api-runtime 0640`) и не
входит в install map. Установка unit files оставляет timer disabled; canary и
enable требуют отдельного production GO. Current profile допускает ровно один
internal tenant и сохраняет external background deny. Полный порядок описан в
[`../langame-sync-production-recovery.md`](../langame-sync-production-recovery.md).

`LANGAME_DISCREPANCY_LOG_ROOT=/var/lib/leetplus/langame-sync` обязателен для
production startup. Относительный путь, filesystem root и путь с `..`
отклоняются до запуска приложения.

Минимальный acceptance test `/.github/scripts/test-stage-release-artifact.sh`
использует explicit `--unprivileged-test-mode`. Такой результат создаётся только
как `.untrusted-test-<sha>` и получает unmanifested `UNTRUSTED_TEST_STAGE`, то
есть не может совпасть с production path или пройти bind manifest checks. Fixture
доказывает fail-closed отказ для повреждённого archive и adversarial manifest.
Privileged hydration-systemd fixture отдельно проверяет prepare-only production
env scrub, private snapshot и отказ для writable/hardlinked input, writable
ancestor и symlinked ancestor.

`/.github/scripts/test-production-artifact-systemd-templates.sh` дополнительно
проверяет, что systemd templates не возвращают legacy checkout, не используют
secret env из repository и не дают migration unit mutable acquisition/build
capability.

`/.github/scripts/test-release-hydration-systemd-attestation.sh` на disposable
GitHub runner устанавливает exact hydration template, запускает
`systemd-analyze verify`, сверяет реальные effective properties, доказывает
отказ для drop-in/property/unit/env drift и выполняет bounded kernel probes для
`IPAddressDeny=any`, `RestrictAddressFamilies=none` и `UnsetEnvironment`.
Он также проверяет exact nologin/no-home build identity без supplementary
groups, duplicate UID/primary GID/group-GID alias, отклоняет независимый процесс
под build UID, nonempty global build root и hostile generator, а также читает PID
из реального nonempty zero-size `cgroup.procs`. Stage fixture отдельно фиксирует
exact offline/copy/ignore-scripts/side-effects-cache-readonly argv и
mutation-canary доказывает, что удаление `--ignore-scripts` исполняет dependency
lifecycle marker и ломает gate. Full admission запускает hydration без `HOME` и
`XDG_CACHE_HOME`, в отдельной no-egress systemd unit, сверяет generated Prisma
query engine с sealed store authority и требует удаления временного engine input.
Тем же real-systemd fixture выполняются normal promotion и retry после lost
response, recovery из post-stop/post-move/post-seal состояний, exact sealer root
authority и dry-run owner/group/mode attestation, exact
build/promotion/release/receipt-root mounts и fail-closed
candidate/receipt nested bind-mount negatives. Перед positive promotion fixture
также доказывает отсутствие state mutation при drift installed-generation
verifier относительно receipt pin и при занятом production-control install
lock.

`/.github/scripts/test-production-pnpm-store-integrity.sh` под bounded sudo на
disposable runner проверяет canonical store и adversarial owner/mode, symlink,
hardlink, special file, unlisted/content/receipt drift и nested bind mount.

`/.github/scripts/test-production-artifact-blue-green.sh` проверяет exact Web
BUILD_ID, immutable/service-readable slot boundary, nginx switch, accepted
receipt, signal/exit guard, crash-intent recovery, link/archive durability fault
injection, nginx-test failure и public-watchdog rollback.
CI также сравнивает final `canary-safe.env` со всеми известными effect-style
ключами `.env.example` и canonical design-partner deny settings.

Full Release Admission также запускает скачанный/hydrated Web artifact реальным
child process, проверяет dynamic `/api/release-identity` и authenticated login
BFF против exact `API_URL` при намеренно неверном `NEXT_PUBLIC_API_URL`. Это не
заменяет privileged Linux rehearsal: до production обязательны
`systemd-analyze verify`, real full `nginx -t`, tmpfiles/cache bind, offline
store → hydrate → quiesce → promote → seal и reboot/recovery exercise на
isolated VM/host copy.

Пока instance unit подключает `canary-safe.env`, owner activation физически
невозможна: final layer всегда возвращает `FOUNDER_OPERATOR_BETA_MODE=DISABLED`.
Safety overlay не редактируется in-place. Единственное принятое исключение —
API-only профиль `guest-user-call-live.env`: он загружается после safety overlay,
имеет exact digest в production-control generation и включает только
пользовательский SMS.ru Callcheck с bounded timeout. Web этот профиль не читает,
а scheduler, delivery, reward materializer, mail и остальные provider paths
остаются выключены.

API slot сохраняет reviewed outbound egress для Langame/SMS/SMTP и других
явных integrations; Web остаётся localhost-only. Полная owner activation всё
ещё требует отдельного reviewed network/activation profile и production-like
rehearsal. `guest-user-call-live.env` не является owner GO и не разрешает
фоновые эффекты.

Candidate не создаёт второй scheduler tick. До любого schema effect обязательна
процедура scheduler-free N−1: auth-edge/exact-child/Web rollback contour
поднимается на `4300/4301/3300`,
старые scheduler-capable `4000/3000` units и DB sessions reviewed-дренируются,
durably fenced и проверяются на zero-overlap. Hot для HTTP rollback остаётся
только `legacy-safe.conf` с парой `4300/3300`; старый scheduler-capable process
не является допустимым rollback target. Cutover script handoff не выполняет и
fail-closed отклоняет запуск без этого evidence.
