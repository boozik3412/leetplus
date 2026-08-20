# Controlled Beta-1: production canary и SHA-bound deploy

Статус: `PREPARED / NOT EXECUTED / PRODUCTION NO-GO`.

Этот документ — обязательная операционная последовательность для первого
внешнего `Tenant B/Store B1`. Он не разрешает выпуск по ветке, `git pull` или
из произвольной рабочей директории. Единственный разрешённый вход — exact
release artifact, созданный Full Release Admission для того же commit SHA.

## Принятый artifact candidate

Full Release Admission
[`32371530743`](https://github.com/boozik3412/leetplus/actions/runs/32371530743)
принял SHA `299c5a8b4948ce7483f03a370cb3a3f7d354dc5b` как `4/4 SUCCESS`.
Artifact `leetplus-release-299c5a8b…` имеет ID `9407707351`, размер
`28 563 832` bytes и GitHub digest
`sha256:f91b0ef6130fdf8148af97efa406a93fb6ce5194b9a10a169543137fde28c774`.

Он был дополнительно скачан в isolated local system-temp directory и принят
`stage-release-artifact.sh`: внешний checksum, gzip, internal `SHA256SUMS`,
provenance и inventory прошли. Проверка не подключалась к БД, не использовала
secrets, не меняла production и не выполняла hydration. Local probe
использовался только как evidence целостности stage-инструмента, не заменяет
restored-copy rehearsal.

## Зафиксированное исходное состояние

На 20.08.2026 read-only preflight подтвердил, что публичные API и Web доступны,
а базовые systemd services запущены. При этом production использует legacy
процедуру, которая обновляет checkout из ветки перед build/restart. Такой
процесс изменяем и не доказывает связь запущенного кода с CI artifact.

В рабочем checkout также обнаружены неотслеживаемые backup-артефакты окружения.
Их имена и содержимое намеренно не вносятся в репозиторий, логи и этот документ.
До canary их нужно инвентаризировать, заархивировать с ограниченным доступом
за пределами checkout и подтвердить, что checkout чист. Удалять их без
отдельного решения оператора запрещено.

## Инварианты deploy

1. `releaseSha` — полный lowercase Git SHA-1 из 40 символов.
2. Fast CI и вручную запущенный Full Release Admission успешны именно для
   `releaseSha`; SHA другого run, nightly или `main` не взаимозаменяемы.
3. На host перед изменением `current` проверяются внешний `.sha256`, gzip,
   внутренний `SHA256SUMS` и `release-provenance.json.releaseSha`.
4. Распаковка происходит в новый immutable release directory. Старый runtime
   остаётся нетронутым до успешного readiness нового.
5. `RELEASE_SHA`, `EXPECTED_DATABASE_MIGRATION` и
   `EXPECTED_DATABASE_MIGRATION_COUNT` задаются из проверенного provenance, а
   не из текущего checkout, branch или времени deploy.
6. `prisma migrate deploy` запускается только после проверенного backup и
   только из распакованного exact artifact. При ошибке migration/dependency
   hydration/restart symlink `current` не меняется.
7. API готов только если `/version` возвращает exact SHA, а `/health/ready`
   подтверждает готовность БД без unfinished migrations и с ожидаемым name/count.
8. Внешний owner invite, SMTP send, Telegram/MAX outbound и создание tenant
   запрещены, пока весь canary не принят явно.

## Целевая безопасная схема

```text
GitHub Full Release Admission (exact SHA)
  -> downloaded artifact + sha256
  -> host staging / releases/<SHA>.new
  -> verify provenance + SHA256SUMS + production dependency hydration
  -> verified backup / migration deploy
  -> atomically switch current -> releases/<SHA>
  -> restart API/Web
  -> /version + /health/ready exact assertions
  -> controlled Tenant B activation (separate GO)
```

`current` должен быть символьной ссылкой только на полностью проверенный
release directory. systemd units читают runtime secrets исключительно из
защищённого файла вне artifact и checkout. Artifact, logs и provenance не
содержат secrets.

Для prepare-only части доступен versioned
[`stage-release-artifact.sh`](../deployment/production-artifact/stage-release-artifact.sh):
он fail-closed проверяет checksum/provenance и может выполнить только offline
dependency hydration в новом release directory. Скрипт специально не имеет
capability на migration, systemd restart или `current` switch.

## Операторская последовательность

### A. До окна canary

1. Зафиксировать exact SHA и URL/ID Full Release Admission.
2. Скачать оба файла artifact (`.tar.gz` и `.tar.gz.sha256`) по защищённому
   каналу и сверить SHA-256 вне production checkout.
3. Выполнить immutable backup и отдельную restore verification. Записать
   checksum, время и место хранения в закрытый release record.
4. Прогнать restored-copy rehearsal этого же artifact, включая миграции,
   rollback и `/health/ready` с pinned migration name/count.
5. В отдельном обслуживаемом окне перенести неотслеживаемые
   environment-backup-артефакты из checkout в защищённое хранилище. Сначала
   составить PII-free inventory (count, timestamps, SHA-256); не выполнять
   массовое удаление.
6. Отключить legacy deploy timer на время canary, чтобы `git pull` не мог
   переписать runtime.

### B. Staging и switch

1. Создать `/srv/leetplus/releases/<SHA>.new` с root-owned permissions;
   распаковать artifact только туда.
2. Проверить внешний checksum, gzip, внутренний `SHA256SUMS`, отсутствие
   `node_modules`, exact provenance SHA и expected migration metadata.
3. Hydrate locked production dependencies и выполнить Prisma generate в
   staging directory. Любая незакреплённая версия или ошибка lockfile — стоп.
4. Переименовать staging в `/srv/leetplus/releases/<SHA>` только после всех
   проверок.
5. Запустить migration deploy из этого release directory. При неуспехе не
   переключать `current`; перейти к incident/rollback, не повторять вслепую.
6. Атомарно обновить `current` на новый release, restart API и Web.
7. Проверить с loopback и внешней точки: API `/version`, API `/health/ready`,
   Web status. Все ответы должны соответствовать exact SHA и migration metadata.

### C. Минимальный canary

1. Не включать Telegram/MAX outbound и публичную регистрацию.
2. Выполнить protected `FOUNDER_OPERATOR_BETA_GO_V1` для единственного
   `Tenant B/Store B1` с 30-дневной trial policy и rollback owner.
3. Создать один email-bound `OWNER/NETWORK` invite. Владелец сам устанавливает
   пароль; временные/общие пароли запрещены.
4. Пройти day-0 smoke: owner login, tenant/store isolation, один
   ограниченный пользователь, assortment, staff, communications, roles и
   integration preview. Существующие четыре клуба не должны измениться.
5. Зафиксировать PII-free outcome и перейти в D1 review. Второй внешний tenant
   до D1/D7 review запрещён.

## Немедленный stop/rollback

Немедленно остановить canary и выполнить
[rollback plan](./founder-pilot-rollback-plan.md), если наблюдается хотя бы
одно условие:

- API version/readiness не соответствует ожидаемому SHA/migration;
- migration незавершена, backup/restore не подтверждён или legacy timer снова
  может выполнить `git pull`;
- scope tenant/store, invite, роль, пароль или audit даёт аномалию;
- обнаружен неожиданный outbound, scheduler effect или данные существующей сети
  затронуты;
- checkout содержит неинвентаризированные sensitive artifacts.

Rollback означает: закрыть invite route, suspend `Tenant B`, отозвать
invite/session, остановить tenant-specific workers, вернуть `current` на
предыдущий проверенный release и проверить readiness. При неоднозначном
состоянии БД evidence сохраняется, автоматическое удаление запрещено.

## Что требуется до выполнения на production

- зелёные Fast CI и Full Release Admission для одного exact SHA;
- explicit production-change approval на: архивирование sensitive artifacts,
  замену legacy deploy/timer и switch runtime на artifact release directory;
- проверенный immutable backup и restored-copy rehearsal;
- отдельный release record с SHA, artifact digest, backup checksum,
  migration metadata, rollback target и результатами readiness.

До выполнения этих пунктов текущий статус остаётся `NO-GO` для внешнего invite.
