# LeetPlus: подготовка переноса завершена 11.09.2026

Статус: **PREPARED_NOT_SERVING**. Этот документ не разрешает фактическое
переключение. Source VDS `168.222.143.243` продолжает обслуживать
`6097dc83863e1ab44d99d15ad0c19505cf7fa3fc`, CURRENT191, active green.
Root/www/api DNS по авторитетному ns5.hosting.reg.ru остаётся на VDS.

Новый узел: LAN `192.168.1.137`, static public `188.234.220.76`.
Подготовлены exact control/images
`ae0d76ccb2d588893b50962bcd31310f0547be08`:

- Fast CI `34568322877` и Full admission `34568322729` — SUCCESS.
- Admission SHA256:
  `62a2cd733dbd77a9b138c70fac4a6d58eaffcde164029565f2873e2791b13fe7`.
- CI проверил импорт/запуск всех четырёх image IDs в отдельном Docker29.1.3,
  strict Prisma TLS с отрицательными CA/hostname cases, остановленное создание
  контейнеров и реальные HTTP/network boundaries.
- Control поколения сохраняются immutable; предыдущие generated files и
  rehearsal архивированы, physical standby data сохранены. In-place patch
  установленного кода, переписывание старых acceptance receipts и ручная
  подстановка image IDs не использовались.

## Подтверждённые результаты

| Проверка | Результат |
| --- | --- |
| Physical replica | PostgreSQL16.13, streaming, recovery=true, replay не paused; после restage исходный system identity сохранился |
| Source-side lag | При проверке sender показывал streaming/async и 0 байт отставания; это измерение, не обещание постоянного нулевого lag |
| Logical restore | CURRENT191, `20260908180000_external_langame_simple_onboarding`, unfinished0; owners postgres158 / leetplus946 сохранены |
| Runtime role | Не superuser, без CREATE DB/ROLE, INHERIT, replication, bypassRLS и CREATE public |
| Host HTTP | Оба API и Web healthy; реальные localhost endpoints возвращают exact ae0d76cc |
| Corporate/guest | Login/me, четыре клуба exact internal tenant, guest session и оба отрицательных token boundaries — PASS в blue и green |
| Game data | Acceptance не изменила event/reward/bonus-ledger counts; пароль менялся только у одного тестового actor в disposable copy |
| Container proof | Exact images, non-root users, supplementary groups, read-only roots, mounts, actual ports/networks/gateway priorities — PASS |
| Actual network | Web→own API разрешён; Web→DB/host SSH/существующий host proxy/другой slot/external address запрещены; rehearsal API→production standby запрещён; DROP counters увеличились |
| LAN exposure | Порты rehearsal23100/23200/24100/24200 недоступны через LAN address, доступны по host loopback |
| Telegram continuity | Старые edge/poller сохранены. Non-consuming TLS HEAD из edge на fixed public IP target прошёл; это не финальный user canary |

Первый запрос Web попал в короткое startup окно и получил reset. После проверки
healthy всех четырёх приложений повторён только acceptance: итог PASS. При
последующем ручном rehearsal дождаться ready API **и** Web обоих slots; их
готовность не подменяется одним API health. Первый лог сохранён отдельно.

## Резервное копирование

Последний проверенный полный архив:
`C:\LeetPlusBackups\backup-20260911T062942Z.lpbackup`, 2 818 919 115 bytes.
SHA256:
`a2b1b1761b67e94df6eebc7f8ee26b0d172e096717edf999895bfd7f9c715d23`.

Архив получен с работающей standby через read-only SFTP jail. Windows проверил
AES-GCM authentication, checksum dump/globals и включённые admitted image/control
archives. Затем этот расшифрованный dump реально восстановлен в новой PG16.13
БД без сети: schema191/unfinished0/ограниченные права — PASS, контейнер остановлен.
Длительность SQL restore — 150 секунд. Данные этой проверки: 4 tenant, 5 store,
2646 profile, 23156 event, 697 reward, 470 ledger rows; это snapshot counts.

Target backup timer включён на **06:00 Asia/Yekaterinburg**, Windows task
`LeetPlus-Daily-Backup` — на **07:00** и вход пользователя. Реальный запуск
Windows task проверен, `LastTaskResult=0`, `backup-status.json=PASS`.
Backup controller не считает свежим backup от paused/disconnected/stale standby;
в архив входят encryption/configuration material и нужные release/data bundles.
Private RSA/Ed25519 keys остаются в Windows DPAPI custody, на Linux переданы
только public roots. Живые worker permits и deployment GO не подписывались.

Nominal off-host RPO24h зависит от доступности этого Windows компьютера.
UPS отсутствует; перенос не создаёт отказоустойчивую площадку.

## Что именно оставлено до отдельного переноса

На target работают production-name **только PostgreSQL standby и Redis**.
Production API/Web/bonus/daily worker containers отсутствуют; app timers и
accepted-runtime service не включены. `active.json`, operations и worker grants
отсутствуют. Rehearsal имеет отдельную БД, секреты входа, сети и localhost-порты.
Встроенные API schedulers выключены; источник остаётся единственным владельцем
записей и unattended provider effects.

TLS для root/api/www подготовлен, SAN/key pair и Nginx syntax проверены,
сертификат действует до **27.11.2026**. Публичная конфигурация не активирована.
ACME webroot `/srv/leetplus/acme` подготовлен; enrolment/renewal dry-run выполнить
после фактического DNS cutover, сохранив остальные сертификаты сервера.

Следующая операция требует отдельного GO и нового preflight: source SHA/env,
fresh backup, streaming/lag и свежие acceptance identities. Затем — maintenance,
drain/fence исходных writers и единственного poller, final LSN replay, остановка
old primary, promotion, signed target bootstrap, Nginx/DNS, fresh user canary
и новые worker grants. Окно — до 30 минут, VDS сохраняется 14 дней после принятия.
До target writes возможен возврат на source; после них host rollback требует
обратного переноса актуальной БД. Source `pg_rewind` не предполагается.

Replication login истекает **24.09.2026 16:46:57 UTC**. Если перенос откладывается
за эту дату, заранее переоформить ограниченный доступ и повторить freshness checks.

Подробная локальная последовательность и конфигурации maintenance/temporary
verified HTTPS proxy сохранены в operational evidence; они не активированы.
Нельзя превращать этот отчёт в deployment approval или создавать фиктивный
`sourceFenced/targetPromoted/finalLsnReplayed` receipt заранее.

## Где лежат подтверждения

Операционный каталог в общей рабочей папке Windows, вне Git worktree:
`deploy-evidence/docker-migration-1337-20260910`.
Журнал `ERROR_LOG.md` содержит причины, изменённые условия и отдельные попытки.
На target — `/srv/leetplus-migration/evidence`,
`/srv/leetplus-migration/rehearsal/evidence/runtime-acceptance.json`,
`/srv/leetplus-migration/restore-backup-20260911T062942Z/evidence/result.json`.
Raw database/configuration logs остаются private; секреты не публикуются в Git.
