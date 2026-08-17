# Founder pilot: исполнимый restored-copy preflight

Статус:
`ENGINEERING IMPLEMENTED / UNIT 6/6 + SYNTHETIC PG READY / LIVE INPUTS REQUIRED`.

Контракт `FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_V1` — read-only gate перед
созданием dedicated runtime role, применением grants или миграций на
изолированной копии. Он не является deploy authority и никогда не подключается
к production.

Implementation SHA `9caa3e49a03e4b04156689aa6d8ef0d8f4ffebe6` принят push CI
`32053402516` и PR CI `32053406454` как `3/3 SUCCESS`. Release artifact
`9295786786`, digest
`sha256:e8cf5a0e062089fc709054c74e754de92e579bc0e6ce195ec6aa5aadf2526704`.

## Что доказывает команда

Команда допускает только database-only rehearsal и возвращает
`READY_FOR_RESTORED_COPY_DATABASE_REHEARSAL`, когда одновременно доказаны:

- фактический SHA-256 локального CI artifact совпадает с independently supplied
  digest;
- фактический SHA-256 backup совпадает с independently supplied digest;
- artifact и backup — разные файлы;
- PostgreSQL доступен только по `127.0.0.1` на порту, отличном от `5432`;
- имя БД имеет отдельный rehearsal/restored namespace;
- live database name, owner, server address/port и PostgreSQL system identifier
  совпадают с manifest;
- кроме самой read-only preflight session к target DB никто не подключён;
- `_prisma_migrations` содержит ровно ожидаемый source head/manifest и не имеет
  failed/rolled-back rows;
- `leetplus_founder_beta_activation_runtime` ещё не существует;
- operator явно фиксирует, что API, workers, schedulers, SMTP, Telegram и
  Langame выключены, production service tokens не смонтированы; live
  `pg_stat_activity` отдельно подтверждает zero other target sessions;
- backup capture time, RPO/RTO и deadline удаления копии валидны.

Возраст backup не может превышать заявленный RPO, а deadline удаления не может
быть дальше семи суток от preflight.

Любой mismatch возвращает `BLOCKED_MANUAL`. Результат не содержит database URL,
пароль, filesystem paths, email, токены или backup data.

## Manifest

Manifest хранится вне Git. Он не содержит пароль:

```json
{
  "contractVersion": "FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_V1",
  "release": {
    "releaseSha": "<40 lowercase hex>",
    "artifactPath": "C:\\absolute\\path\\release-artifact.tgz",
    "artifactSha256": "<64 lowercase hex>"
  },
  "backup": {
    "backupPath": "C:\\absolute\\path\\production-backup.dump",
    "backupSha256": "<64 lowercase hex>",
    "capturedAt": "2026-08-17T10:00:00.000Z"
  },
  "target": {
    "host": "127.0.0.1",
    "port": 55439,
    "databaseName": "leetplus_restored_founder_a1",
    "ownerRoleName": "postgres",
    "expectedSystemIdentifier": "<pg_control_system system_identifier>",
    "sourceMigrationCount": 183,
    "sourceSchemaHead": "20260817030000_founder_operator_beta_activation_runtime_v1",
    "sourceMigrationManifestDigest": "<64 lowercase hex>"
  },
  "isolation": {
    "databaseOnly": true,
    "apiStarted": false,
    "workersStarted": false,
    "schedulersEnabled": false,
    "smtpEnabled": false,
    "telegramEnabled": false,
    "langameEnabled": false,
    "productionServiceTokensMounted": false
  },
  "retention": {
    "rpoSeconds": 7200,
    "rtoSeconds": 3600,
    "deleteBy": "2026-08-18T12:00:00.000Z"
  }
}
```

Checksum файла на Windows можно получить отдельно:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\absolute\path\file'
```

## Запуск

Пароль передаётся только через отдельную process environment переменную:

```powershell
$env:FOUNDER_PILOT_RESTORED_COPY_DATABASE_URL = 'postgresql://postgres:<one-time-secret>@127.0.0.1:55439/leetplus_restored_founder_a1'
pnpm --filter database founder-pilot:restored-copy-preflight -- --manifest 'C:\absolute\path\manifest.json'
Remove-Item Env:FOUNDER_PILOT_RESTORED_COPY_DATABASE_URL
```

Команда открывает `READ ONLY` transaction с bounded statement timeout. Она не
делает restore, не создаёт role, не выдаёт grants, не применяет migration и не
запускает приложение.

## Локальное PostgreSQL evidence 17.08.2026

На отдельном loopback PostgreSQL 16.14 (`55439`) команда проверена против
synthetic clone локальной CI DB:

- release input: локальный `git archive` принятого SHA `171bb8fb…`, не
  скачанный GitHub CI artifact;
- source state: `183` applied migrations, head
  `20260817030000_founder_operator_beta_activation_runtime_v1`;
- runtime role: отсутствует; other target sessions: `0`;
- решение: `READY_FOR_RESTORED_COPY_DATABASE_REHEARSAL`;
- evidence digest:
  `7b1a1cc528acf65b22de893591b80162ff7b07aa68a07036466c7385af298a34`;
- synthetic DB, dump, archive и manifest после проверки удалены; отдельный
  PostgreSQL остановлен, его сохранённый data directory не удалялся.

Это подтверждает live SQL collector и CLI orchestration, но не закрывает
production backup gate: использовались synthetic clone и локальный archive, а
не immutable production backup и скачанный CI artifact.

## Что остаётся после `READY`

1. На production-backup restored copy выполнить уже реализованный
   [activation role deployment](./founder-pilot-activation-role-deployment.md).
2. Принять production-like HBA/TLS/SCRAM login, pool URL и live API call.
3. Выполнить migration apply/replay/rollback и zero-diff.
4. Удалить role, credentials, restored DB и backup copy в срок `deleteBy`.
5. Только после PII-free отчёта переходить к SMTP canary и Gate 1MT/2.
