# LeetPlus: фактический перенос на1337, 11.09.2026

Этот отчёт фиксирует завершение переноса на399876/generation2. Позднее обычный
app rollout обновил activeblue доbcb0a4d3/generation3, сохранив data/control399876
и hotrollbackgreen. См. [последующий production checkpoint](langame-partial-sync-production-2026-09-11.md).
Исторические migration receipts и цифры ниже не переписаны.

Статус: **SERVING_ON_TARGET**. Сайт и API работают на новом сервере,
DNS переключён, owner user canary подтверждён, оба worker расписания включены.
Этот документ заменяет PREPARED_NOT_SERVING checkpoint как описание production.
Секреты, заголовки авторизации и персональные данные в отчёт не включены.

## Текущая топология

| Компонент      | Принятое состояние                                                                      |
| -------------- | --------------------------------------------------------------------------------------- |
| Новый сервер   | LAN192.168.1.137, public188.234.220.76, server1337                                      |
| Release        | `399876b560b4ac611eae35ee425d99422fb140b9`                                              |
| Runtime        | Active green, healthy hot rollback blue, Compose generation2                            |
| PostgreSQL     | 16.13, единственный primary на1337; CURRENT191, unfinished0                             |
| Приложение     | Оба COMBINED API/Web slot, bridgeOFF/reportingLIVE; API schedulers OFF                  |
| Data images    | Отдельно закреплённый dataRelease399876; обычный app rollout не меняет PG/Redis         |
| Старый VDS     | 168.222.143.243 — HTTPS proxy на188.234.220.76 с verified upstream TLS/SNI              |
| Старые writers | PG и четыре API/Web unit stopped/PID0/persistently masked; два worker timer disabled    |
| DNS            | A root/www/api188.234.220.76, TTL300; tg, mail/ftp, MX/NS/TXT не менялись               |
| Telegram       | Тот же единственный poller, state/offset сохранён; user canary PASS                     |
| Backup         | Encrypted daily06:00 Yekaterinburg; Windows reader07:00 и logon                         |
| Recovery       | Принятый runtime boot enabled; подготовительный SSH replication tunnel stopped/disabled |

Временная PostgreSQL-реплика перенесла ту же database identity:
`daff51ce2cf1d3c79d9d1e2d6d0007c0a4b2064337933eaa50510c87b914bca9`.
Последний source LSN `36/653EECD8` полностью replay-нут до stop старого primary
и promotion нового. На точке fencing совпали4tenant/6store/2651profile/
23483event/746reward/509ledger. Последующие изменения — обычные production
записи на новом primary; эти snapshot counts не являются текущими счётчиками.

## Admission и immutable операции

Exact-main Fast `34590140633` и Full `34590140602` завершились SUCCESS;
все девять Full jobs приняты. Docker admission SHA256:
`5bb3fee596ea070fb72c48e35d5953259c91db78b88150afd9b7978ed555e62a`.

| Операция                                         | Plan SHA256                                                        | Последний receipt SHA256                                           |
| ------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| BOOTSTRAP `6559701f-4e10-4579-a130-550864f7932f` | `9d54796bc20fc3eafef188e9c8ff1173d722c18d2d6555bbde9abd8918270917` | `182739472791f8ffabee0ba57d302117c55110855de18af01947b111a6681f20` |
| GREEN `7087620d-2ef0-4057-a7a1-77e2686b3bdb`     | `fe2ce94e8a3df994d7a11c06b0c35458647f930dca4ac1249e43d2043c935936` | `56ab99fbd0b72f94c03d50471f05e35242f454be87eaa5cac96696569d47d483` |

Обе цепочки HYDRATE/BIND/SMOKE/CUTOVER/POSTCHECK terminal. Подписи привязаны
к exact host/plan/action; installed immutable generations и старые receipts
не правились. Documentation merge после этой операции не является runtime SHA.

## Время и доступность

Все исходные timestamps ниже UTC; Екатеринбург —UTC+5.

| Событие                                   | 11сентября2026, UTC               |
| ----------------------------------------- | --------------------------------- |
| Начало maintenance intent                 | 11:41:15.641549                   |
| Старые приложения fenced                  | 11:47:32                          |
| Final LSN/replay                          | 11:48:30 /11:48:37                |
| Старый primary stopped/masked             | 11:50:00                          |
| Новый primary promoted                    | 11:50:03                          |
| Сайт/API через old-IP proxy восстановлены | 11:53:58.865                      |
| Тот же Telegram poller возобновлён        | 11:55:29                          |
| Green generation2 принят                  | К12:04:21                         |
| User Telegram/profile/corporate canary    | Подтверждён владельцем около12:09 |
| Все master/NS5/NS6/Google/Cloudflare A    | 12:16:23                          |

Консервативная пауза сайта/API —763секунды, около12мин43сек,
с16:41:15 до16:53:59 по Екатеринбургу. Это измерение включает время между
maintenance intent и подтверждённым восстановлением. Поздняя DNS publication
обслуживалась old-IP HTTPS proxy. Шесть последующих TLS/readiness проверок
root/www/api через каждый из двух IP вернули exact399876.

## Проверки и сохранённые границы

- Новый admitted bundle импортирован и проверен по exact image/control hashes.
  Из native API image проверен worker config loader с exact Compose CA.
- Actual SQL restore и оба isolated API/Web slot прошли corporate/guest,
  exact tenant-store oracle, cross-token denials; acceptance не изменила
  проверяемые event/reward/ledger counts. Реальные network denials подтверждены
  DROP counters; rehearsal недоступен с LAN и не имеет production/provider
  authority. Шесть rehearsal containers остановлены после сохранения evidence.
  -189 PostgreSQL user/session settings сопоставлены с source. Сохранены
  Europe/Moscow для PG/API/Web, workerUTC, en_US.UTF-8 locales, English text
  search; SQL text suppression остаётся deliberate security difference.
- Public guest и corporate tenant продолжают использовать разные identities,
  guards и scopes внутри COMBINED runtime; dormant physical split не включён.
- Сохранены declared provider domains, включая появившийся1171.langame.ru.
  Policy SHA256 `aa4237353b2914708831a2f97f9b4f9037594f891501985f2d15530e3e568ab6`.
  Worker scope не расширялся за INTERNALdemo.
- Existing Telegram container `f9c71b087a2d…` сохранён. Fresh getMe/getWebhookInfo
  PASS, empty webhook, pending0, heartbeat fresh/zero failures; offset225150245
  →225150247 после user canary. Второго consumer, ручного getUpdates,
  сброса updates или восстановления старого offset не было.

## Worker authority

| Worker        | CANARY receipt SHA256                                              | TIMER grant                            | Expiry UTC              |
| ------------- | ------------------------------------------------------------------ | -------------------------------------- | ----------------------- |
| bonus-ledger  | `662e4563af5defeb84a9526f838c28dd39749d73774921594bbb74d8d85ab504` | `69b3668b-cad3-4e00-ae58-21cb090a60ca` | 10.12.2026 12:09:33.685 |
| langame-daily | `1931cecb768a73b5b2a16941c5d925edfadb03a05c1d09560e6a05ff32fd238a` | `31190e41-c4bb-4e44-afe8-34c9b805e5bd` | 10.12.2026 12:12:05.670 |

Grants подписаны для exact399876/generation2/host1337/tenantdemo и digest
исходного dedicated profile. Bonus canary bounded/dry-run, gamification shadow;
daily canary использовал10.09.2026 с выключенными recovery/maintenance.
Перед TIMER возвращены исходные профили; canary grants архивированы.
Первый автоматический bonus tick уже имеет native PASS receipt
`bdc25a207f20e7ff40df507d868052ffd709785034459ca37d0a61db3ed3a2b3`.
Daily timer enabled/waiting, следующий запуск12.09.2026 04:30 Yekaterinburg.
Grant expiry требует штатного переоформления до указанного времени; смена
active release/generation также требует новой authority. Empty systemd unit
сам по себе не доказывает результат: использовать native worker receipts.

## HTTPS и каталог ACME

Certbot4.0.0 на target создал lineage `leetplus.ru` с тремя точными SAN:
root/www/api. Сертификат действует до10.12.2026 11:22:12UTC; fullchain SHA256
`d31e6f664d9a7478f974ca16c09d585c43983050adefcd90328f268c37a9808b`.
Native `certbot renew --cert-name leetplus.ru --dry-run` SUCCESS.
`certbot.timer` enabled/active; остальные шесть lineage не изменялись.

Renewal использует `/srv/leetplus/acme` и root-owned hook
`/etc/leetplus-compose/renew-tls.py`, SHA256
`4655b2bb524ec23035652c1e1051d9f812e44cbde004ef06c37088bcb80fa574`.
Hook проверяет exact lineage/SAN, trusted chain, срок и key pair, архивирует
прежнюю пару в private `secrets/tls-history`, затем публикует root-only0400
files и reload-ит Nginx только после syntax check. Неуспех возвращает прежнюю
пару; private key не выводится. Hook фактически выполнился при выпуске.

Prepared defaults0700 у project root/acme первоначально дали HTTP403 на
реальном challenge probe. Итоговый host provisioning: `/srv/leetplus`
`root:www-data 0710`, `acme` `root:www-data 0750`; `.well-known` и challenge
directory0755, public token0644. Private secrets/data/backups остаются0700.
Проверены positive challenge read и negative project listing, private subtree
traversal и private key read от www-data. Эти mode/group необходимо сохранить
при восстановлении узла; повторный generic chmod0700 сломает renewal.
Immutable installed controller не патчился. Diagnostic token удалён.

## Итоговая резервная копия

Финальный backup **`backup-20260911T122329Z.lpbackup`** создан на новом primary
11.09.2026 в 12:23:29 UTC после установки TLS и worker grants. Он получен Windows,
аутентифицирован и расшифрован. Размер — **2 828 872 395 bytes**, SHA256:
`160abd04ffe9d9810bdd2ae3f2539dd43cab6566932bf1270ae13b752ba200ed`.

Проверены primary identity, dump/globals hashes, exact admitted image/control
bundle, active generation2, обе signed TIMER grants, terminal rollout receipt,
provider policy, новая TLS пара и renewal hook. Полный SQL restore этой off-host
копии завершился **PASS в 12:33:34 UTC за 149 секунд**. Isolated database имела
network NONE и затем остановлена; CURRENT191/unfinished0 и все семь restricted
runtime privilege flags=false подтверждены. Snapshot содержит 4 tenant,
6 store, 2653 profile, 23513 event, 751 reward и 511 ledger; это состояние
времени backup, а не live счётчики.

Encrypted archive: `C:\LeetPlusBackups\backup-20260911T122329Z.lpbackup`.
Pre-cutover backup111859Z также был фактически SQL-восстановлен до остановки
source; его SHA256:
`9bc958cb13245cf8f3e32b4d266d01c696ebcafd1c78ec6471bc229f5df48272`.

Daily schedule06:00 Yekaterinburg и restricted read-only encrypted SFTP reader
на Windows07:00/logon включены. Ключи backup/deployment хранятся под Windows
DPAPI.24-hour off-host RPO требует доступности Windows в момент выгрузки.
При полном восстановлении ОС заново установить admission-bound control/images,
восстановить private configuration и mode/group ACME, штатно зарегистрировать
Certbot renewal/webroot/hook. Архив содержит рабочую TLS пару и hook, но не весь
общесерверный `/etc/letsencrypt` других сайтов.

## Retention и следующие изменения

Старый VDS хранить как proxy минимум до25.09.2026 16:54 Yekaterinburg.
Ничего с него не удалялось. Его БД после target writes не является rollback
primary: возврат хоста требует reverse transfer актуальных target данных.
App rollback использует принятый slot на текущей БД. Нет UPS/HA; migration сама
по себе не устраняет риск отключения питания/канала нового узла.

Удаление VDS — отдельное решение после retention и проверки зависимостей:
mail/ftp DNS records всё ещё указывают на старый IP. Ни миграция сайта, ни
документационный PR не дают права удалять эти записи или сервер.

Следующий runtime deploy: exact-main Fast+Full → verified image/control handoff
→ restored-copy acceptance → signed host-bound plan → native five-phase rollout
→ новые worker grants для принятой generation. Source `main`, green CI и docs
merge по отдельности не подтверждают serving release и не разрешают rollout.

Локальный журнал и отдельные stdout/stderr/exit/script snapshots:
`deploy-evidence/docker-cutover-1337-20260911/ERROR_LOG.md`.
Native immutable state: `/var/lib/leetplus-compose/operations/` и `worker-runs/`.
Операторские receipts: `/srv/leetplus-migration/cutover-20260911-399876b560b4`;
source fencing: `/var/lib/leetplus/migration-cutover-20260911`.
