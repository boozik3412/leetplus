# Production history 153 → 187: fail-closed controller

Статус: `IMPLEMENTED CANDIDATE / PRODUCTION EXECUTION NO-GO`.

Этот документ описывает единственный допустимый repository-side путь для
перехода production history с точного состояния `153 applied / 4 rolled back /
0 unfinished` на materialized CURRENT187. Он заменяет опасный прямой запуск
`prisma migrate deploy` из canonical migration tree. Само наличие controller в
artifact не разрешает production mutation.

## Почему direct Prisma deploy запрещён

Production history содержит ровно четыре старых
`ReportDigestScheduleRun(status=RUNNING)` и более позднюю guest migration перед
CURRENT179. Clean restored-copy acceptance доказал, что штатный путь требует:

1. точной materialization CURRENT179, CURRENT185 и CURRENT186;
2. digest-bound reconciliation только четырёх stale weekly runs;
3. Prisma deploy из materialized tree;
4. проверки `187/4/0`, всех migration checksums, preterminal manifest и runtime
   function digest.

Raw canonical tree сознательно fail-closed на этой production history и не
является rollback-путём.

## Реализованные safety fences

- Отдельный contract
  `FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_V1`; restored-copy rehearsal CLI
  по-прежнему не умеет подключаться к production.
- Любое production connection требует одновременно `--target production` и
  точное значение
  `FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRM`.
- URL exact-bound к loopback host, port, database, отдельной migration role и
  единственной canonical query
  `?options=-c%20role%3D<object-owner-role>`. Отсутствующий, повторный,
  иначе закодированный или дополненный connection option запрещён; тот же
  неизменённый URL получает Prisma child.
  Имена `postgres`, `template*`, `leetplus_restored_*` и
  `leetplus_rehearsal_*` запрещены.
- Live identity связывает database, system identifier, PostgreSQL 16, primary
  state, `session_user` migration role name/OID, `current_user` object-owner
  name/OID, ровно одно direct membership для migration login — только в
  object owner, с `SET TRUE`, `INHERIT FALSE`, `ADMIN FALSE` — database owner
  name/OID и фактически
  активные runtime sessions. Database owner и `current_user` обязаны совпасть
  с manifest-bound object owner; object owner обязан быть одной из exact
  application runtime roles.
- Migration session role обязана дополнительно быть `NOINHERIT`. Она, object
  owner и все объявленные application runtime roles обязаны быть
  LOGIN, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION` и
  `NOBYPASSRLS`; object owner не может состоять ни в одной другой role, поэтому
  скрытая effective privilege chain запрещена. Фактическая активная runtime
  role не может быть пропущена из manifest.
- Каждый read-only identity fence и финальный production `check` требуют zero
  owner mismatches во всех объектах schema `public`: `pg_class.relowner`,
  `pg_proc.proowner` и `pg_type.typowner` обязаны равняться exact object-owner
  OID. Поэтому одинаковый URL для controller/Prisma подтверждается также
  фактическим catalog postcondition, а не только configuration intent.
- Read-only plan принимает только exact `153/4/0`, source head/checksums и
  ровно четыре неизменённых stale `WEEKLY`, `sentCount=0`, без completion,
  execution revision и error. Digest включает id, tenant, schedule date и
  timestamps, но plan не раскрывает эти значения.
- Plan живёт не более часа, связывает exact release SHA, immutable artifact
  SHA-256, materialized tree digest и live target identity.
- Apply требует три независимых совпадения: буквальный plan digest,
  detached Ed25519 signature и публичный SPKI SHA-256 из отдельной environment
  pin. Private key не нужен на production host для apply.
- Controller берёт session advisory lock до любых effects и проверяет backend
  identity. Reconciliation использует единый порядок
  `advisory → _prisma_migrations SHARE → ReportDigestScheduleRun SHARE ROW
EXCLUSIVE`, `lock_timeout=3s`, `statement_timeout=20s` и короткую
  `READ COMMITTED` transaction. Обычные SELECT при этом не блокируются.
- Перед reconciliation и Prisma deploy записывается fsync phase intent.
  Commit lost-response сначала проверяется по точному marker/digest и никогда
  не повторяет DML вслепую.
- Prisma child получает только DATABASE_URL и минимальный process environment;
  SMTP, Telegram, Langame и service tokens ему не передаются. Output не
  публикуется: сохраняются только byte counts и SHA-256. Watchdog ограничен
  `60..900s`, output — 1 MiB.
- После ambiguous deploy допустим максимум один повтор и только если child уже
  завершён, database всё ещё exact `153/4/0`, unfinished migrations равны нулю
  и reconciliation marker подтверждён. Любое partial/unfinished состояние —
  `BLOCKED_MANUAL`, без retry.
- Повторный apply в пределах срока подписанного plan умеет продолжить после
  уже durable reconciliation либо только проверить CURRENT187 после crash;
  reconciliation повторно не выполняется.

## Файлы и CI

- `packages/database/scripts/founder-pilot-production-history-production.mjs`
- `packages/database/scripts/founder-pilot-production-history-production.cli.mjs`
- `packages/database/scripts/founder-pilot-production-history-production.test.mjs`
- `pnpm --filter database check:founder-pilot-production-history-production`

Production module/CLI включаются в deterministic release artifact. Unit suite
использует только fake adapters и filesystem fixtures; она не читает
`DATABASE_URL` и не соединяется ни с local, ни с production PostgreSQL.

## Manifest

Manifest создаётся отдельно для конкретного SHA/artifact и конкретного
cluster. Значения ниже — placeholders, а не готовая production конфигурация.

```json
{
  "contractVersion": "FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_V1",
  "environment": "PRODUCTION",
  "release": {
    "releaseSha": "<40 lowercase hex>",
    "artifactPath": "/srv/leetplus/artifacts/<sha>.tar.gz",
    "artifactSha256": "<64 lowercase hex>",
    "materializedTreeDigest": "<accepted restored-copy tree digest>"
  },
  "approval": {
    "keyId": "founder-prod-history-a1",
    "publicKeyPem": "<Ed25519 SPKI PEM>",
    "publicKeySpkiSha256": "<64 lowercase hex>",
    "maxPlanAgeSeconds": 3600
  },
  "operation": {
    "expectedStaleRunSetDigest": "<strict digest from fresh isolated restore>",
    "deployTimeoutSeconds": 900
  },
  "target": {
    "host": "127.0.0.1",
    "port": 5432,
    "databaseName": "<exact production database>",
    "expectedSystemIdentifier": "<pg_control_system identifier>",
    "expectedServerMajor": 16,
    "migrationRoleName": "<dedicated migration role>",
    "migrationRoleOid": 12345,
    "objectOwnerRoleName": "<database and migration object owner role>",
    "objectOwnerRoleOid": 12346,
    "applicationRuntimeRoles": [
      { "name": "<dedicated API runtime role>", "oid": 12346 }
    ]
  }
}
```

Manifest и plan не должны содержать password, DATABASE_URL, tenant names,
club names, email или token bytes.

## Операционный порядок

Все команды ниже сначала проходят на fresh isolated PostgreSQL cluster с
восстановленным production backup, database name как у production, отдельным
loopback port, без API/workers/outbound и с disposable role fixtures. Только
после отдельного evidence review тот же exact artifact может рассматриваться
для production окна.

1. Подтвердить off-host backup SHA-256 и `pg_restore --list`; отдельно сохранить
   globals/roles.
2. Восстановить fresh isolated cluster и получить strict stale-set digest.
   Для первого read-only `inventory` в manifest временно ставится
   `expectedStaleRunSetDigest` из 64 нулей; inventory возвращает только
   aggregate digest/count и не имеет `planDigest`, поэтому ничего не
   авторизует. Затем создать новый final manifest с полученным digest.
3. Создать dedicated migration/runtime roles, сделать выбранную runtime role
   владельцем database, создать migration login как `NOINHERIT` и выдать ей
   единственное прямое membership в object owner с `SET TRUE`,
   `INHERIT FALSE`, `ADMIN FALSE`; object owner не выдавать membership ни в
   одну другую role,
   снять exact OID/ACL evidence и доказать, что обе роли не
   superuser/bypass-RLS. В connection URL обязателен единственный canonical
   suffix `?options=-c%20role%3D<object-owner-role>`, чтобы и controller, и
   Prisma создавали новые objects от имени database owner. Для live-session fence
   на isolated cluster держать один отдельный read-only connection этой
   disposable runtime role; API и workers при этом не запускать.
4. Запустить `plan`; это только read-only database inspection и filesystem
   hashing. Plan пишется новым файлом mode `0600`.
5. Перенести plan на signing host и выполнить `approve`. Private key никогда
   не передаётся controller apply и не попадает в artifact/receipt.
6. Вернуть detached approval, сверить plan digest вслух/в change record.
7. Запустить `apply` с новым receipt path. Не запускать raw Prisma параллельно.
8. Проверить `check`, readiness, N/N-1 compatibility и zero-diff business
   aggregates. На isolated copy удалить все fixtures после retention deadline.
9. Перед production повторить backup/identity/role checks, убедиться, что
   blue/green shadow runtime готов, schedulers/outbound выключены в shadow и
   старый runtime остаётся hot rollback target.
10. В production запускать plan → approve → apply → check только в одном
    контролируемом окне. При любом `BLOCKED_MANUAL` не повторять Prisma вручную;
    сначала классифицировать migration state и сохранить receipt.

CLI `--help` является каноническим перечнем параметров. Secrets задаются только
через environment и не должны попадать в shell history или документацию.

## Оставшиеся gates до production execution

1. Merge актуального `origin/main`, новый clean SHA и полностью зелёный Full
   Release Admission artifact.
2. Fresh restored-copy replay именно нового controller с реальным PostgreSQL
   16, включая фактическое принятие canonical startup `role` option обоими
   clients, catalog evidence владельца созданных CURRENT154..187 objects,
   kill-after-reconciliation, lost deploy response и exact resume.
3. Dedicated migration/application runtime roles/grants и независимая
   attestation; текущая superuser application connection, если она обнаружена,
   является hard blocker.
4. N/N-1: старый production SHA должен пройти критические authenticated reads
   и writes против migrated restored copy.
5. Blue/green API/Web readiness и атомарный nginx upstream switch; первый
   artifact cutover откатывается на legacy SHA/runtime, а schema rollback по
   умолчанию является fix-forward.

До закрытия этих пунктов production history, services, timer, текущая сеть из
четырёх клубов и внешний OWNER invite не изменяются.
