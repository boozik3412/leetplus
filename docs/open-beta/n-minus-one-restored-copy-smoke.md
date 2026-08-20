# N−1 compatibility smoke на migrated restored copy

Статус: `HARNESS IMPLEMENTED / 13/13 LOCAL PASS / API + SCHEDULER RESTORED-COPY RUNS PENDING`.

Этот gate отвечает на узкий rollback-вопрос: сможет ли уже развёрнутый API с
точным SHA `7de04ff4ccc814494810730be3fa6bf661097b07` продолжить критические
операции Tenant A после применения новой схемы. Gate выполняется только на
изолированной восстановленной копии PostgreSQL и не является разрешением
production migration/cutover.

## Fail-closed граница

`packages/database/scripts/n-minus-one-restored-copy-smoke.cli.mjs` до запуска
legacy API требует одновременно:

- PostgreSQL URL с literal host `127.0.0.1`;
- явный нестандартный порт, отличный от `5432`;
- имя БД по allowlist `leetplus_restored_*`;
- exact PostgreSQL `system_identifier`;
- exact applied migration count и exact migration head;
- нулевое число unfinished migrations;
- ровно один active tenant с ожидаемым Tenant A slug;
- нулевое число других сессий в целевой БД;
- read/write target, не read-only;
- отдельный API port, отличный от `3000`, `4000`, `5432` и DB port;
- точный clean detached checkout SHA `7de04ff4…`.

Hostname `localhost`, remote IP, default PostgreSQL port, обычное production-имя
БД, неизвестные URL options, dirty checkout или любой identity/migration drift
дают typed `FAIL` до старта приложения.

## Изоляция runtime

CLI создаёт disposable detached worktree exact SHA и выполняет только offline
frozen install из локального pnpm store, Prisma generate и legacy API build.
На Windows prepare-процесс наследует `APPDATA` и `LOCALAPPDATA`, потому что
pnpm использует их для обнаружения локального store. Оба значения обязательны,
принимаются только как абсолютные пути без управляющих символов и не попадают в
receipt; UNC/device paths отклоняются, разрешён только локальный drive-rooted
путь. `PNPM_HOME`, registry credentials, npm tokens и произвольные
`npm_config_*` не наследуются; `npm_config_offline=true` задаётся самим harness.
Именно отсутствие этих двух значений объясняло прежний быстрый generic failure:
pnpm выбирал другой fallback store под профилем пользователя вместо уже
заполненного локального store из `LOCALAPPDATA`, и offline install завершался до
generate/build.
Legacy `main.ts` сам не принимает bind host и слушал бы wildcard interface.
Поэтому harness загружает отдельный Node preload guard, который:

1. разрешает API слушать только заданный port на `127.0.0.1`;
2. разрешает исходящий TCP только в exact loopback PostgreSQL port;
3. блокирует SMTP, Telegram, MAX, Langame, DaData и любой иной TCP destination
   независимо от application feature flags.

Дополнительно runtime получает минимальный env без наследования provider/cloud
credentials. Все schedulers, workers, materializers, delivery, OTP, Telegram,
MAX, Langame и live/recovery paths принудительно OFF/kill-switched;
`FOUNDER_OPERATOR_BETA_MODE=DISABLED`. JWT, encryption и service-token secrets
генерируются одноразово в памяти. Production secrets для приложения не нужны.

Prepare больше не сворачивает любой сбой в общий
`N_MINUS_ONE_COMMAND_FAILED`. Для пяти внешних шагов зафиксированы отдельные
префиксы reason code:

| Stage                      | Reason prefix                           |
| -------------------------- | --------------------------------------- |
| наличие exact Git object   | `N_MINUS_ONE_PREPARE_GIT_OBJECT_*`      |
| создание detached worktree | `N_MINUS_ONE_PREPARE_WORKTREE_ADD_*`    |
| offline frozen install     | `N_MINUS_ONE_PREPARE_PNPM_INSTALL_*`    |
| Prisma generate            | `N_MINUS_ONE_PREPARE_PRISMA_GENERATE_*` |
| legacy API build           | `N_MINUS_ONE_PREPARE_API_BUILD_*`       |

Суффикс различает `COMMAND_FAILED`, `SPAWN_FAILED` и `TIMEOUT`. При таком
отказе CLI возвращает только allowlisted `failureMetadata`: stage, exit code,
signal, тип отказа, число байт и SHA-256 совокупного stdout/stderr. Командная
строка, cwd, сырой вывод и значения environment не печатаются. Некорректные
Windows-пути завершаются до spawn кодами
`N_MINUS_ONE_PREPARE_WINDOWS_APPDATA_*` или
`N_MINUS_ONE_PREPARE_WINDOWS_LOCALAPPDATA_*`.

Это поведение относится к обычному API compatibility mode. Отдельный
`--scheduler-compatibility` mode описан ниже и никогда не запускается на той же
копии БД: для него действует более узкий allowlist
`leetplus_restored_scheduler_*`.

## Проверяемая матрица

После bounded startup watchdog выполняются:

1. `GET /health`;
2. `POST /auth/login` существующего active Tenant A пользователя;
3. `GET /auth/me` с проверкой exact tenant slug и запретом platform admin;
4. authenticated critical reads:
   - stores;
   - assortment summary;
   - staff checklist templates;
   - staff knowledge base;
   - staff notifications/communications;
   - gamification workspace;
   - users/roles;
5. representative write: создать fixture-only draft checklist template;
6. representative reversal: удалить тот же exact template через legacy API;
7. direct DB zero-residue check по exact `id + tenantId + title`.

Если API delete не завершился, `finally` выполняет узкий DB cleanup только этой
fixture. Такой запуск всё равно получает `FAIL`; cleanup нужен лишь для
гарантии отсутствия residue. Ни один существующий объект Tenant A не меняется.

## Отдельная scheduler-совместимость legacy runtime

Production legacy env имел только
`GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED=true` в явном виде. В exact SHA
`7de04ff4…` отсутствие остальных флагов фактически включает ещё пять сервисов:

| Scheduler                   | Production-effective источник   |
| --------------------------- | ------------------------------- |
| Guest activity ledger       | default ON при unset            |
| Guest bonus ledger          | explicit `true`                 |
| Guest gamification pipeline | production + sync-token default |
| Guest game retention        | default ON при unset            |
| Langame daily sync          | production + sync-token default |
| Report digest               | production + sync-token default |

Scheduler mode сохраняет именно эту матрицу: пять переменных остаются unset, а
bonus-ledger остаётся explicit `true`. Одновременно он применяет все доступные
ограничители, не меняющие матрицу enablement:

- bonus-ledger работает с `DRY_RUN=true` и без постановки approved rewards;
- retention получает `LIVE_ENABLED=false`;
- delivery/materializer/recovery/backfill/supplemental paths kill-switched;
- Founder mode, OTP и все outbound workers выключены;
- Node preload запрещает любой внешний DNS, TCP и UDP; разрешены только exact
  loopback DB port и отдельный loopback API listen port.

Pipeline scheduler в этом legacy SHA жёстко вызывает `dryRunOnly=false`, а
report-digest создаёт schedule-run до попытки отправки. Поэтому гарантировать
общий `zero DB effect` невозможно даже при заблокированном outbound. Такой тест
разрешён исключительно на disposable restored clone и не выдаёт разрешение на
hot rollback со включёнными schedulers.

После health-ready API работает в bounded окне `36 секунд`: этого достаточно
для фиксированного retention tick на 30-й секунде. Preload считает только
aggregate Prisma query coverage без SQL, parameters и строк данных. Обязательна
реальная schema-query coverage всех шести семейств; одно лишь срабатывание
network block не считается успехом. До запуска и после полного завершения API
фиксируются aggregate row/status/max-timestamp snapshots десяти
safety-sensitive таблиц, database-level counters и per-table write-counter
deltas для всех таблиц public schema. После остановки не допускается ни одной
иной DB session и смена `stats_reset` между snapshots.

Запуск использует отдельную свежую копию той же уже мигрированной restored DB:

```powershell
$env:N_MINUS_ONE_RESTORED_DATABASE_URL = 'postgresql://<role>:<password>@127.0.0.1:<port>/leetplus_restored_scheduler_<run>?schema=public&sslmode=disable'

pnpm --filter database n-minus-one:restored-copy-smoke -- `
  --repository 'C:\absolute\path\to\leetplus-open-beta' `
  --tenant-slug '<tenant-a-slug>' `
  --expected-system-identifier '<isolated-cluster-system-id>' `
  --expected-migration-count '<exact-count>' `
  --expected-migration-head '<exact-head>' `
  --api-port '<alternate-port>' `
  --evidence 'C:\absolute\protected\evidence\n-minus-one-scheduler-receipt.json' `
  --scheduler-compatibility
```

Login email/password в этом режиме не нужны. После получения receipt clone
обязательно удаляется целиком; точечный cleanup scheduler effects намеренно не
предпринимается.

## Запуск

Сначала должна существовать уже восстановленная и уже мигрированная отдельная
локальная БД. Её подготовка не входит в этот CLI. Секреты передаются только
через environment и не входят в argv, stdout или receipt:

```powershell
$env:N_MINUS_ONE_RESTORED_DATABASE_URL = 'postgresql://<role>:<password>@127.0.0.1:<port>/leetplus_restored_<run>?schema=public&sslmode=disable'
$env:N_MINUS_ONE_LOGIN_EMAIL = '<existing-tenant-a-user>'
$env:N_MINUS_ONE_LOGIN_PASSWORD = '<password>'

pnpm --filter database n-minus-one:restored-copy-smoke -- `
  --repository 'C:\absolute\path\to\leetplus-open-beta' `
  --tenant-slug '<tenant-a-slug>' `
  --expected-system-identifier '<isolated-cluster-system-id>' `
  --expected-migration-count '<exact-count>' `
  --expected-migration-head '<exact-head>' `
  --api-port '<alternate-port>' `
  --evidence 'C:\absolute\protected\evidence\n-minus-one-receipt.json'
```

После запуска удалить три secret environment values из текущей shell session.
Receipt содержит только статусы, counts, timestamps и SHA-256 digests. Email,
пароль, JWT, DB URL/password, tenant/user/object IDs и HTTP bodies не пишутся.

Локальная проверка implementation:

```powershell
pnpm --filter database check:n-minus-one-restored-copy-smoke
```

## Условия принятия

Gate принят только если receipt содержит:

- `contractVersion=LEETPLUS_N_MINUS_ONE_RESTORED_COPY_SMOKE_V1`;
- `decision=PASS`;
- exact legacy SHA `7de04ff4…`;
- exact expected migrated schema identity;
- success для всех health/login/read/write/delete probes;
- `cleanup.residue=0`;
- `cleanup.directCleanupRequired=false`;
- reviewed aggregate-only `evidenceDigest`.

Scheduler compatibility имеет отдельный contract
`LEETPLUS_N_MINUS_ONE_SCHEDULER_COMPATIBILITY_V1`. Его `PASS` требует start
markers всех шести сервисов, terminal markers immediate pipeline/bonus и
30-second retention, schema-query coverage всех шести семейств, отсутствие
Prisma/schema/fatal runtime errors, final health `200` и reviewed exact
before/after aggregate diff. Receipt всегда содержит
`authorizesHotSchedulerRollback=false` и `requiresProductionDrain=true`.

Любой `FAIL` сохраняет запрет production schema migration. DB restore как
обычный rollback после открытия записи не принимается: он потеряет изменения
после backup. До доказанной N/N−1 совместимости rollback остаётся либо
немедленным переключением runtime при backward-compatible схеме, либо
fix-forward.

## Обязательный fail-closed drain и zero-HTTP-downtime N−1 handoff

Поскольку no-effect для legacy pipeline/report scheduler доказать нельзя,
production migration запрещена при наличии хотя бы одной legacy scheduler
session. Безопасная последовательность для single-founder release:

1. Не меняя текущий upstream, поднять exact legacy SHA `7de04ff4…` как отдельный
   rollback slot на новом loopback port с **явными `false` для всех шести
   scheduler flags**, всеми остальными workers/outbound OFF и той же
   pre-migration production DB.
2. На rollback slot принять readiness, login, Tenant A critical reads и
   aggregate process/build identity. До переключения он не получает внешний
   трафик.
3. Атомарно переключить nginx upstream на scheduler-free legacy slot и сделать
   graceful reload. Старый upstream остаётся жив до успешных post-switch
   probes, поэтому HTTP downtime не требуется.
4. После успешных probes остановить прежний legacy process со включёнными
   schedulers. Проверить `pg_stat_activity`: нет его application sessions,
   незавершённых scheduler transactions и второго scheduler-capable процесса.
   Зафиксировать settling snapshot очередей/status counts в release evidence.
5. Только после доказанного drain разрешается schema migration и запуск current
   release. Current release сначала также стартует scheduler-free; scheduler
   ownership включается отдельным последующим gate.
6. При runtime rollback nginx возвращается на уже готовый scheduler-free exact
   legacy slot. Запуск прежнего scheduler-capable process на migrated DB
   запрещён, даже если disposable scheduler smoke получил `PASS`.

Если любой шаг не даёт однозначного evidence, upstream остаётся на последнем
здоровом slot, migration не начинается. Это fail-closed требование, а не
рекомендация оператора.

## Что ещё не выполнено

- Реальный запуск на migrated restored copy ещё не выполнялся.
- Реальный scheduler-compatibility запуск на отдельном disposable migrated
  clone ещё не выполнялся; до него scheduler contract остаётся `PENDING`.
- Web N−1 не запускается этим harness. Старый Next build требует отдельной
  artifact/build identity и network-isolated build acceptance; API является
  обязательной DB compatibility boundary. Web rollback проверяется отдельно
  blue/green Web readiness и точным BUILD_ID.
- Harness не создаёт restored DB, не применяет migration, не запускает current
  release и не взаимодействует с production/remote PostgreSQL.
