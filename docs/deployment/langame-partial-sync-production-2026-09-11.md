# Langame partial sync: production, 11.09.2026

Статус: **DEPLOYED**, после отдельного разрешения владельца. Действующий сайт
на server1337 обслуживает exact `bcb0a4d37e5791b04cc4707aa65c35680385836e`:
active blue, Compose generation3, healthy hot rollback green399876.
Это обычное обновление приложения после переноса, не повторный перенос хоста.

## Фактический результат для1171

11.09.2026 в14:10:30UTC под настоящей platform-admin сессией выполнен один
MANUAL CATALOG через штатный private BFF, после явного выбора сети `set-1`
и проверки её единственного активного источника `1171.langame.ru`.

- Прочитано и сохранено466 товаров:423 активных доступны через `/products`,
  43 неактивных сохранены в БД. Перед проверкой активный API-каталог был пуст.
- Категории и клубная конфигурация/цены по-прежнему отклонены самим Langame
  (`No permissions`); они не подменены пустым успешным ответом.
- Результат — PARTIAL, failedSources0/partialSources1, с отдельными комментариями.
  Settings/history показывает PARTIAL; в CURRENT191 хранится FAILED с явным
  `LANGAME_SYNC_PARTIAL:` marker, чтобы не объявлять полный период загруженным.
- Нативный audit-файл записан. API-вход, защищённая cookie, сохранённая сессия,
  выбор сети, каталог после импорта, settings/history и `/sync` HTTP200 проверены.
- Проверка была CATALOG: остатки, продажи и общая выручка этим запуском не
  импортировались. Их независимость покрыта регрессионными тестами, но доступ
  конкретного ключа к этим методам не объявляется проверенным.

Browser connector вернул `Codex auth token is unavailable` до навигации.
Это не ошибка production. Визуальная браузерная QA не заявляется; есть реальные
API/server-rendered HTTP доказательства и frontend tests. Учётные данные
передавались только через non-echo stdin/память, не записывались в файлы/argv/logs.

## Допуск и переключение

PR199 merged как bcb0a4d3. Exact-main Fast34604304891 и Full34604305010 — SUCCESS;
все9 Full jobs прошли. Docker admissionSHA:
`79ea27d3dfbd5e430e31ca56217874ae028124b70cb2573bee5bfb057a2d92f4`.
Архивы, parent admission, image IDs, TLS/network/import receipts и exact source
контроллера проверены независимо после загрузки.

| Evidence             | Значение                                                           |
| -------------------- | ------------------------------------------------------------------ |
| Native operation     | `722bf10f-5bb1-490a-aff0-e69db68afcab`                             |
| Plan SHA256          | `59c976463fd7b2789f3fdde07e84782b4397482b352ddf3c0fa099898e9dd47b` |
| Approval SHA256      | `e52ef180f144efd5b8a130ee3e028a99b3b06bde94f31b99b3faa8cd29b8fc90` |
| Final receipt SHA256 | `251e0780148922897cd35bfbbd829e46705f8b5e85e528f94c28d25c21513c0f` |

Обычная цепочка HYDRATE/BIND/SMOKE/CUTOVER/POSTCHECK завершена без повторного
apply. Менялся только неактивный blue API/Web; green399876 сохранён.
Все6 public/loopback API/Web проверок вернули200 с ожидаемыми SHA.
БД — sole primary на1337, CURRENT191/unfinished0; dataRelease PG/Redis и
installed control остаются exact399876, admission5bb3fee5….
Новый control bundle byte-identical установленному: preparation-only installer
и retire-preparation на обслуживающем сервере **не запускались**.

VDS остаётся только proxy; его БД/приложения не запускались, DNS/TLS не менялись.
Исходная сеть demo сохранила4 клуба/30 пользователей. У set-1 —2 карточки клубов
и1 пользователь; синхронизация привязана только к подтверждённому Langame club1.
Разрешения tenant, provider и публичного игрового входа не расширялись.

## Workers и непрерывность

Только два target timer были приостановлены14:00:41UTC. Текущий bonus tick
завершился сам; force-stop не применялся. После generation3 прежние подписанные
gen2 grants проверены по plan.previous и архивированы без изменения bytes.

| Worker | Canary receipt SHA256                                              | Новый TIMER grant                      |
| ------ | ------------------------------------------------------------------ | -------------------------------------- |
| bonus  | `dcb21a66bd5a63b4f2d6c891132080c1a0f70a09923eee2c9c59a3e8a5fe8f01` | `7a60de69-2f9c-466c-8a93-c3c0b4525f64` |
| daily  | `29bdf18aee2f3d06c70c831f437846bc9ebe5e84cddf515091db0e57e9487ac6` | `e0ba73ae-96a2-4ba0-a569-ebfc731e11a9` |

Оба native canary PASS, исходные dedicated profiles восстановлены. Daily и bonus
timer enabled/active с14:10UTC, grants связаны с bcb/generation3/host1337/demo.
Expiry —10.12.2026 14:07:13UTC bonus и14:10:01UTC daily. Следующий daily запуск —
12.09.2026 04:30 Asia/Yekaterinburg. API schedulers OFF; единственный Telegram
poller здоров и не перезапускался.

## Backup, rehearsal и cleanup

Fresh predeploy backup `backup-20260911T133317Z.lpbackup`, 2,830,377,675bytes,
SHA256 `9a44d473eb8a66272fd770b43962d1ff511efcf25e55485d6d6ccc069e38498b`,
проверен off-host с authenticated decryption и inner hashes. DumpSHA:
`2ceb801b9aebc5fd4b6ecdfe91c4e568bcea043c8d3d708fb4100808c51cc847`.

На этом dump exactbcb прошёл реальный SQL restore и оба isolated API/Web:
CURRENT191, mixed ownerspostgres158/leetplus946, restricted runtime privileges,
corporate/guest/exact Store/cross-token checks PASS, game/ledger counts unchanged.
Native preparation получает rehearsal-only adapter из authenticated текущих
target JSON profiles; исходный backup manifest не переписывается. JWT/provider
secrets копии отличаются, provider egress запрещён, live workers не запускаются.

Старые6 stopped clone container instances удалены только после native exact
attestation; вся прежняя копия с данными и evidence архивирована атомарным
same-filesystem rename. Новые6 rehearsal containers после acceptance остановлены;
их данные и доказательства сохранены. Старые production данные не удалялись.

Итоговый backup `backup-20260911T141445Z.lpbackup`, 3,346,043,595bytes,
SHA256 `482dba4cb571098f3e62e61e62d93163c7578e8c27a9885b628f3beffd7dce9a`,
получен Windows и прошёл authenticated decryption, dump/globals hashes,
проверку app/data bundles обоих SHA, accepted generation3 и подписей обеих
TIMER grants. DumpSHA `562ee3f201044e6b7861d570584281cf66cf6153f5060c4e48fb9f814c8af8e4`.
Реальный SQL restore выполнялся на свежем predeploy133317 backup; для финального
postdeploy141445 snapshot он не повторялся и не заявляется. Retention/deletion
старых off-host backups в этом проходе не выполнялись.

После включения timer независимо подтверждены новые автоматические bonus PASS
receipts14:16:21,14:18:36 и14:19:43UTC на bcb/generation3, а не только canary.

Операторский журнал: `deploy-evidence/langame-partial-sync-20260911/ERROR_LOG.md`.
Server evidence: `/srv/leetplus-operations/partial-sync-bcb0a4d3`;
native immutable records: `/var/lib/leetplus-compose/operations/722bf10f-5bb1-490a-aff0-e69db68afcab`.
Следующее обновление снова требует exact-main admission, verified backup/rehearsal,
отдельного signed GO и обновления worker grants. Этот отчёт не разрешает новый rollout.
