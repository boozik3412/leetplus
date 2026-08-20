# SHA-bound production artifact staging

`stage-release-artifact.sh` является только подготовительной частью
production-release. Он принимает artifact, который уже был выпущен GitHub Full
Release Admission для одного exact SHA, проверяет его целостность и помещает в
новую release directory. Скрипт не скачивает файлы, не читает secrets, не
подключается к PostgreSQL и не управляет systemd.

## Пример prepare-only проверки

```bash
mkdir -p /srv/leetplus/rehearsal-releases
bash stage-release-artifact.sh \
  --release-sha <exact-40-character-sha> \
  --artifact /secure/inbox/leetplus-release-<sha>.tar.gz \
  --artifact-sha256 /secure/inbox/leetplus-release-<sha>.tar.gz.sha256 \
  --output-root /srv/leetplus/rehearsal-releases
```

Эта команда только проверяет и распаковывает artifact; её результат не имеет
production hydration receipt и не может быть promoted. Production `--hydrate`
намеренно разрешён исключительно внутри versioned systemd unit и требует
отдельного unprivileged system user
`leetplus-build`, чистого от runtime secrets/production credentials и
изолированного от внешней сети. Он запускает copy-only
`pnpm install --prod --offline --frozen-lockfile --ignore-scripts`, затем Prisma
generate, отвергает hardlinks и создаёт полный `HYDRATED_SHA256SUMS`. Root и
runtime users не имеют права выполнять hydration. Ошибка сохраняет staging
directory для расследования и никогда не перезаписывает существующий release.

## Переход к production

После успешного stage оператор выполняет только порядок из
[Controlled Beta-1 production canary plan](../../open-beta/controlled-beta-1-production-canary-plan.md):

1. проверенный backup и restored-copy rehearsal;
2. production-safe history controller и migration deploy из staged exact artifact;
3. запуск candidate API/Web отдельной `blue|green` парой на loopback-портах;
4. fail-closed config validation, exact API SHA/migration и Web BUILD_ID probe;
5. atomic nginx link switch с bounded watchdog и exact rollback receipt;
6. только после этого controlled `Tenant B/Store B1` activation.

Legacy `git pull → build → restart` не является допустимым заменителем этой
процедуры. Замена production timer/unit, перенос sensitive backup residue и
runtime switch требуют отдельного разрешения владельца production.

## Подготовленные systemd templates

[`systemd/`](./systemd/) содержит versioned instance templates
`leetplus-api@.service`/`leetplus-web@.service`, safety overlay и отдельный
oneshot migration unit. Candidate работает через `/srv/leetplus/slots/blue|green`
на портах `4100/3100` или `4200/3200`, не заменяя и не останавливая legacy
`4000/3000`. API secrets читаются из `/etc/leetplus/runtime.env`, а Web получает
только `/etc/leetplus/web-runtime.env`; оба файла находятся вне checkout и
artifact. API/Web каждого slot запускаются разными identities
`leetplus-api-blue|green` и `leetplus-web-blue|green` с общей read-only artifact
group `leetplus-runtime`, а API env явно недоступен Web unit. Перед каждым start
service-user preflight проверяет root ownership/permissions, post-hydration
manifest, provenance/migration и Web BUILD_ID; только API запускает production
config validator.
Оба shadow unit дополнительно имеют systemd `IPAddressDeny=any` и разрешают
только localhost: nginx, paired Web/API и локальный PostgreSQL. Поэтому даже
неизвестный application path не получает внешний egress во время technical
canary. Нелокальный `DATABASE_URL` приведёт к fail-closed readiness до switch.

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

Repository scripts хранятся без executable Git mode; installation поэтому
обязана задать его явно и не использовать файл из mutable checkout:

```bash
install -d -o root -g root -m 0755 /usr/local/libexec/leetplus
install -o root -g root -m 0755 \
  stage-release-artifact.sh stage-pnpm-store.sh preflight-release-slot.sh \
  prepare-web-slot-cache.sh verify-release-readiness.sh \
  /usr/local/libexec/leetplus/
install -o root -g root -m 0755 blue-green-cutover.sh \
  /usr/local/sbin/leetplus-blue-green-cutover
install -o root -g root -m 0755 seal-release-artifact.sh \
  /usr/local/sbin/leetplus-seal-release-artifact
install -o root -g root -m 0755 promote-release-artifact.sh \
  /usr/local/sbin/leetplus-promote-release-artifact
install -d -o root -g root -m 0700 /var/lib/leetplus/deploy-receipts
install -o root -g root -m 0644 systemd/leetplus-blue-green-recovery.service \
  systemd/leetplus-blue-green-recovery-watchdog.service \
  systemd/leetplus-blue-green-recovery.timer \
  systemd/leetplus-api@.service systemd/leetplus-web@.service \
  systemd/leetplus-release-hydrate@.service /etc/systemd/system/
install -d -o root -g root -m 0755 /etc/systemd/system/nginx.service.d
install -o root -g root -m 0644 \
  systemd/nginx.service.d/leetplus-blue-green-recovery.conf \
  /etc/systemd/system/nginx.service.d/
install -o root -g root -m 0644 systemd/tmpfiles.d/leetplus-release.conf \
  /etc/tmpfiles.d/leetplus-release.conf
```

До установки units создаются shared group `leetplus-runtime`, отдельные system
users без login/home `leetplus-api-blue`, `leetplus-api-green`,
`leetplus-web-blue`, `leetplus-web-green` с primary group
`leetplus-runtime`, а также отдельный build user `leetplus-build`. Parent
`/var/lib/leetplus` остаётся `root:root 0755`; deploy receipts — `root:root
0700`. API secret env имеет `root:<api-only-group> 0640`, Web env —
`root:<web-only-group> 0640`, slot/safety metadata — `root:leetplus-runtime
0440`. Web identities никогда не входят в API-only secret group.

Production hydration выполняется только versioned unit
`leetplus-release-hydrate@.service` с `IPAddressDeny=any`, без runtime env:

```bash
groupadd --system leetplus-runtime
groupadd --system leetplus-build
groupadd --system leetplus-api-runtime
useradd --system --no-create-home --shell /usr/sbin/nologin --gid leetplus-build leetplus-build
useradd --system --no-create-home --shell /usr/sbin/nologin --gid leetplus-runtime --groups leetplus-api-runtime leetplus-api-blue
useradd --system --no-create-home --shell /usr/sbin/nologin --gid leetplus-runtime --groups leetplus-api-runtime leetplus-api-green
useradd --system --no-create-home --shell /usr/sbin/nologin --gid leetplus-runtime leetplus-web-blue
useradd --system --no-create-home --shell /usr/sbin/nologin --gid leetplus-runtime leetplus-web-green

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
Node major/pnpm `10.33.2` окружении: `pnpm fetch --prod --frozen-lockfile
--store-dir <empty-store>`, затем содержимое `<empty-store>` архивируется и
архив получает отдельный SHA-256. На production оба файла и exact
`pnpm-lock.yaml` импортируются только через root
`stage-pnpm-store.sh --archive ... --archive-sha256 ... --lockfile ...
--node-major 22 --pnpm-version 10.33.2`. Скрипт не выполняет package code,
запрещает links/path traversal, пишет receipt с lockfile/bundle digests и
публикует root-owned read-only `/srv/leetplus/pnpm-store`. Hydration unit видит
его только read-only; mismatch Node/pnpm/lockfile или попытка fallback в сеть
останавливает release.

Команды создания identity выполняются только если exact user/group ещё нет;
существующая запись с другим UID/GID/membership является stop condition, а не
поводом запускать `useradd` повторно. Build, promotions и releases обязаны быть
на одной filesystem. Hydration и promotion используют один root-provisioned
stable lock inode; concurrent hydration/promote запрещены. Promoter связывает
receipt с exact successful systemd `InvocationID`, доказывает пустой cgroup,
останавливает completed oneshot, затем забирает builder-owned tree в недоступный
builder-у root boundary и повторно проверяет no-egress receipt/runtime manifest,
seal и только затем атомарно публикует `releases/<SHA>`. Slot/nginx/DB при этом
не изменяются. Ошибка после rename оставляет root-only quarantine в
`release-promotions/<SHA>` и требует ручного incident review.

Перед install каждый source file сверяется с exact candidate Git blob. Unit и
nginx templates устанавливаются root-owned/group-other-nonwritable; slot env и
runtime env имеют mode `0640`, а active link изначально указывает только на
проверенный `legacy.conf`.

После hydration exact release обязательно проходит
[`seal-release-artifact.sh`](./seal-release-artifact.sh): весь release становится
root-owned, service-readable и service-non-writable. Пустой `.next/cache`
служит только bind-mount point; Web instance получает отдельный persistent
`/var/cache/leetplus-web-blue|green`. Перед первым start и каждой сменой SHA root
запускает `prepare-web-slot-cache.sh` только при доказанно остановленном unit.
Старый cache переносится в root-only quarantine, а root-owned authoritative
marker `/var/lib/leetplus/web-cache-releases/<slot>.sha` привязывает новый cache
к exact SHA. Web preflight отклоняет отсутствующий или чужой marker. Остальная
release directory остаётся read-only.

Atomic routing задаётся reviewed файлами из [`nginx/`](./nginx/). Сначала
active link указывает на concrete `legacy.conf`, поэтому существующие процессы
являются реальным N-1 rollback target. Затем
[`blue-green-cutover.sh`](./blue-green-cutover.sh) создаёт root-only durable
pre-effect intent, до effect проверяет full host nginx config с candidate include
в private mount namespace, атомарно меняет nginx include, выполняет `nginx -t`, graceful
reload и bounded public watchdog. При любой ошибке exact previous target
восстанавливается и проверяется отдельным public legacy-compatible smoke; old
processes скрипт никогда не останавливает. До switch candidate API/Web обязаны
быть одновременно `active` и `enabled`, а templates упорядочены до nginx. После
accepted switch active slot остаётся boot-enabled до отдельного soak/retire
gate. Если внешний smoke недоступен, link
остаётся восстановленным, но rollback fail-closed сообщает отсутствие serving
evidence. Успешный switch оставляет accepted receipt для отдельного
`rollback --receipt`; durable `.intent` поддерживает crash recovery до receipt.
Handled signal/exit запускает exact rollback guard. Для `SIGKILL`/host loss
pre-nginx recovery unit восстанавливает и syntax-check'ит N-1 link без
рекурсивного nginx systemd job, а отдельный 10-секундный post-start watchdog
делает reload/public serving confirmation и архивирует intent. Новый switch
запрещён, пока существует outstanding intent.

Mutable Langame discrepancy evidence не записывается в immutable release.
До запуска API оператор создаёт отдельный persistent root и фиксирует тот же
абсолютный путь в `/etc/leetplus/runtime.env`:

```bash
install -d -o root -g leetplus-api-runtime -m 0770 /var/lib/leetplus/langame-sync
```

Только API slot users входят в `leetplus-api-runtime`; Web/legacy identities не
получают write в этот path. Per-slot log directories создаёт systemd через
`LogsDirectory=leetplus/api-%i`. Перед установкой оператор отдельно проверяет
exact membership обеих shared groups.

`LANGAME_DISCREPANCY_LOG_ROOT=/var/lib/leetplus/langame-sync` обязателен для
production startup. Относительный путь, filesystem root и путь с `..`
отклоняются до запуска приложения.

Минимальный acceptance test `/.github/scripts/test-stage-release-artifact.sh`
собирает disposable artifact, принимает его и доказывает fail-closed отказ для
повреждённого archive без созданного release directory. Он выполняется в Fast
CI и не использует PostgreSQL, systemd или production secrets.

`/.github/scripts/test-production-artifact-systemd-templates.sh` дополнительно
проверяет, что systemd templates не возвращают legacy checkout, не используют
secret env из repository и не дают migration unit mutable acquisition/build
capability.

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
Safety overlay не редактируется in-place. Текущие instance units также
запрещают non-loopback egress на уровне systemd, поэтому одной заменой env
невозможно включить рабочий Langame/SMTP/Telegram/provider контур. До owner
activation нужен отдельный reviewed network-profile unit/drop-in (или localhost
egress broker), exact-digest activation env и production-like rehearsal; затем
перезапускается только активный artifact slot и повторяется readiness/rollback.
Этот activation profile пока не реализован и является явным `NO-GO` для
внешнего owner invite, но не блокирует localhost-only technical canary.

Candidate не создаёт второй scheduler tick. До schema effect нужен отдельный
выбор с evidence: либо N/N-1 доказывает совместимость legacy background paths с
новой схемой и legacy API временно остаётся единственным scheduler owner, либо
legacy schedulers reviewed-дренируются до migration и сохраняется объявленное
окно без background execution. Legacy process всё равно остаётся hot для HTTP
rollback. Последующий scheduler-handoff обязан доказать zero-overlap, ownership
и rollback; cutover script намеренно его не выполняет.
