# Founder pilot: production restored-copy rehearsal — 18.08.2026

## Решение

`PASS` для production-backup restore, production-history migration lane,
repeat-deploy, data zero-drift и activation-role TLS/HBA/SCRAM lifecycle на
изолированной копии.

Это не является production deploy или разрешением внешнего доступа. Изменения
собраны в exact SHA, приняты CI и повторно проверены из скачанного SHA-bound
artifact на сохранённой clean copy. Следующие release gates — trusted SMTP
canary/worker enrollment, Gate 1MT/2 и отдельный production cutover GO.

## Границы прогона

- production API и Web продолжали работать;
- production application database использовалась только как источник
  `pg_dump`;
- архив передавался потоком на локальную машину, remote dump-файл не
  создавался;
- восстановленная база слушала только `127.0.0.1:55439`;
- API, workers, schedulers, SMTP, Telegram и Langame на копии не запускались;
- имена tenant, club, пользователей, email и credential bytes в evidence не
  сохранялись;
- production application, schema, данные и services не изменялись.
- две временно добавленные SSH authorizations после получения backup удалены;
  повторная key-аутентификация подтверждённо отклонена, локальный ephemeral
  private/public key material удалён.

## Источник и backup

| Evidence                        | Значение                                                           |
| ------------------------------- | ------------------------------------------------------------------ |
| PostgreSQL source               | `16.13`                                                            |
| Логический размер source DB     | `8 181 537 815` bytes                                              |
| Backup format                   | custom `pg_dump`, zstd                                             |
| Backup size                     | `1 455 450 210` bytes                                              |
| Backup SHA-256                  | `31ad21d56041ac07177e3008fb39f7f4abae0632f909032b419a022c7d020b9b` |
| Captured at                     | `2026-08-18T09:28:19.706Z`                                         |
| `pg_restore --list`             | `1478` entries, zero stderr                                        |
| Source applied migrations       | `153`                                                              |
| Source rollback receipts        | `4`                                                                |
| Source unfinished receipts      | `0`                                                                |
| Source schema head              | `20260804120000_guest_game_max_pending_rewards`                    |
| Source applied-manifest digest  | `3f035d416525d1d76f09331f5933309f4366b36f831ab6bfa52d9ebcc04452c8` |
| Source rollback-manifest digest | `ae018d0beb9df8934dba01c0089b6219e774ac1fca78c5eaf415c36509400572` |

Агрегированная topology source: три tenant, четыре active Store; все четыре
Store принадлежат одному tenant. Два дополнительных tenant не имеют Store.
Имена и identity data в отчёт не включены.

## Диагностический прогон

Первый disposable restore намеренно использовался для discovery и не принят
как clean acceptance. Он выявил две production-history особенности.

1. Четыре `ReportDigestScheduleRun` оставались `RUNNING` более 43 дней. Все
   четыре имели тип `WEEKLY`, `sentCount=0`, `completedAt=NULL`, не содержали
   execution revision и error. Каноническая migration revision fence корректно
   отказалась работать при таком состоянии.
2. Production уже содержал более позднюю guest migration до CURRENT179.
   Кроме того, checksums двух старых миграций отличались от current artifact
   только регистром слова в SQL-комментарии (`LAngame`/`Langame`); executable
   DDL совпадал.

Ручные `resolve` диагностического прогона не перенесены в clean acceptance.
Вместо этого создан fail-closed controller
`founder-pilot-production-history-rehearsal` с режимами `plan/apply/check`.

## Production-history lane

Controller принимает только точное source-состояние выше и выполняет:

1. полный bounded read и hash всех `185` migration files;
2. точную materialization CURRENT179 и CURRENT185;
3. binding четырёх stale rows в secret/PII-free plan digest;
4. повторную проверку rows под `ACCESS EXCLUSIVE` lock;
5. перевод только bound rows в маркированный `FAILED`;
6. post-deploy проверку всех applied checksums, двух известных legacy
   checksums, runtime function digest и rollback history.

| Evidence                        | Значение                                                           |
| ------------------------------- | ------------------------------------------------------------------ |
| Plan digest                     | `c5dbdf319f949b8474c0709c4f8ab99c44923c29aaed1c81e1da8b3f4b3ce37a` |
| Stale set count                 | `4`                                                                |
| Stale set digest                | `092517d4b963205b07a48206da5b28d08666196ee27622d9401efe1be657191a` |
| Materialized tree digest        | `873a3af791790f29ee1f1efb1df2b58a124ce017560bd1e37db282275de57062` |
| CURRENT179 materialized SHA-256 | `f4437ebb5c2c70fe4f7389bbbb75af123d1f60367626db743751b612f7a8ffed` |
| CURRENT185 materialized SHA-256 | `2979599d1b17829d497ea7def3f9d7b64659b5e6796e357ba5eca971d497b674` |
| Final preterminal digest        | `7a0bb533293e9ddf69d689a1215f3589872d399dccecde5a598bf79175923bcc` |
| Final worker function digest    | `d2025dca020c73fd9e3bfdfe251566fff69c48880b4caeaa8a37349a223f4465` |

## Clean acceptance

Свежий второй restore прошёл без предварительных failed migration receipts.

- первый exact Prisma deploy применил ровно `32` migration;
- итог: `185 applied / 4 historical rolled back / 0 unfinished`;
- второй exact Prisma deploy: `No pending migrations to apply`;
- controller check: `PRODUCTION_HISTORY_REHEARSAL_VERIFIED`;
- post-migration applied-manifest digest:
  `8d68d15ad0fb85b2e80b5987b5d190d9b79845ed9db3ba31ba2417c6f6685d51`;
- `RUNNING` digest jobs: `0`;
- exact reconciled stale jobs: `4`.

## Проверка данных

До и после clean deploy сравнены все `134` существовавшие business tables.

| Проверка                           | Результат                                                          |
| ---------------------------------- | ------------------------------------------------------------------ |
| Pre-existing table count           | `134`                                                              |
| Row-count manifest digest до/после | `412a60ebbec9727b562ccb08662cd1d07169a2c35d811426f676567a2773275d` |
| Row-count differences              | `0`                                                                |
| Control aggregate digest до/после  | `8d48126b09c8ab688d59f09fadb6a27a4685c65849eccb88320405409b655707` |
| Tenant / Store / User              | `3 / 4 / 30`                                                       |
| Product / Guest / StaffTask        | `1483 / 51257 / 42`                                                |
| SalesFact count                    | `106897`                                                           |
| Sales revenue                      | `20756676.44`                                                      |
| InventorySnapshot count            | `58054`                                                            |
| Inventory quantity                 | `434195`                                                           |

Новые migrations добавили 21 новую таблицу. Поэтому общий post-migration
table count не используется как zero-diff метрика; сравнение выполнено по
точному manifest исходных 134 таблиц.

## Activation role и network acceptance

На clean CURRENT185 copy выполнен полный lifecycle:

`PLAN → APPLIED → ATTESTED → TLS NETWORK ACCEPTED → ROLLED_BACK`.

- role: `NOINHERIT`, exact CONNECT/USAGE/one-wrapper EXECUTE;
- TLS: `TLSv1.3`, cipher `TLS_AES_256_GCM_SHA384`;
- HBA: один exact target `hostssl + scram-sha-256`, затем role-scoped deny
  для другой DB и plaintext;
- wrong secret: rejected;
- other database: rejected;
- plaintext: rejected;
- direct Tenant relation read: rejected;
- network evidence digest:
  `148c60498e5c1dff75c151444928cf0c22a69f0b66cbee797402698ad16bf99b`;
- role rollback: `PASS`;
- final preflight снова подтвердил role count `0` и exact CURRENT185 state.

CA и server certificate были одноразовыми локальными rehearsal fixtures. Они
не являются production credentials и не переносятся в production.

## Artifact-bound повторная приёмка

Commit `3f325acc2428b1e3c3797075b218efeb454fae91` принят четырьмя GitHub
Actions runs:

- push CI `32128049790` — `SUCCESS`;
- push founder mail enrollment PostgreSQL gate `32128049799` — `SUCCESS`;
- PR CI `32128053592` — `SUCCESS`;
- PR founder mail enrollment PostgreSQL gate `32128053724` — `SUCCESS`.

Artifact `9321380247` имеет имя
`leetplus-release-3f325acc2428b1e3c3797075b218efeb454fae91`.

| Evidence                          | Значение                                                           |
| --------------------------------- | ------------------------------------------------------------------ |
| Downloaded archive size           | `28 487 516` bytes                                                 |
| Downloaded archive SHA-256        | `adb75120f35ca54bbd80924f467c78296d425f3c94de86f437998b9046b5b7f4` |
| Outer checksum                    | `PASS`                                                             |
| Per-file internal `SHA256SUMS`    | `PASS`                                                             |
| Offline frozen production install | `618 reused / 0 downloaded`                                        |
| Prisma generate                   | `PASS`, Prisma `6.19.3`                                            |
| Release migration count           | `185`                                                              |
| Operational scripts               | `16 = 10 founder + 6 runtime`                                      |
| Restored-copy manifest digest     | `1c0ecb7c77105422545a331501721a025c9bdf71df9969a2b77c47f242261d6c` |
| Restored-copy evidence digest     | `51efd85cdaf2baec1d81439ab296d2412f94373eea7d31f6521412e15d049cd0` |

Downloaded artifact повторно подтвердил на clean production-backup copy:

- `READY_FOR_RESTORED_COPY_DATABASE_REHEARSAL`;
- `PRODUCTION_HISTORY_REHEARSAL_VERIFIED`;
- `185 applied / 4 historical rolled back / 0 unfinished`;
- exact materialized tree, preterminal manifest и worker function digests;
- activation role lifecycle
  `PLAN → APPLIED → ATTESTED → TLS NETWORK ACCEPTED → ROLLED_BACK`;
- TLS `1.3`, `TLS_AES_256_GCM_SHA384`, network evidence digest
  `5170ed527a90255241beed6ed3b219a43dd40d755130f2ba55f2545af4ae90a5`;
- после rollback финальный preflight снова `READY`, role count `0`.

Raw database/role secrets не записывались в artifact, receipt или журнал.
Production application, database, migrations, roles и services не менялись.

## Реализованные изменения

- restored-copy preflight V2 отдельно связывает applied и rolled-back history;
- activation-role controller принимает тот же V2 history contract;
- добавлен production-history `plan/apply/check` controller и CLI;
- materialized lane поддерживает crash-safe exact replay уже созданного tree;
- active identity-mail worker принимает exact allowlist из canonical clean
  digest и этого reviewed production-history digest;
- release artifact включает новый controller; founder operational script count
  становится `10`, общий operational script count — `16`;
- новые contracts включены в CI.

## Что ещё обязательно до первого внешнего tenant

1. `DONE`: trusted TLS SMTP worker и protected enrollment/SENT/accept/disable
   на disposable клонах изолированной восстановленной копии.
2. Закрыть полную Gate 1MT A/B matrix, включая jobs/Telegram/files/SSE, и
   Gate 2 для текущей сети A1–A4.
3. Подготовить production backup/rollback window и выполнить отдельный
   reviewed cutover в `PREPARE`, затем `ACTIVE`.
4. Только после этого создать отдельный Tenant B/Store B1 и отправить OWNER
   email invite с самостоятельной установкой пароля.

Временный пароль, public signup, добавление tester в существующий tenant и
отдельная база на клиента не используются.
