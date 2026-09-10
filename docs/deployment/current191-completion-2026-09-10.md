# CURRENT191: завершение production-перехода 10.09.2026

## Фактический runtime и база

Production работает на `6097dc83863e1ab44d99d15ad0c19505cf7fa3fc`.
Оба API/Web slot используют этот SHA, physical DB — `CURRENT_191/191`,
head — `20260908180000_external_langame_simple_onboarding`.
Оба slot завершили `current191-final`: bridge `OFF`, bug reporting `LIVE`.
Active — green, hot rollback — blue, accepted cutover generation — 55.
Схема проверена штатным `final-check`; повторять миграцию не нужно.

| Доказательство            | Значение                                                           |
| ------------------------- | ------------------------------------------------------------------ |
| Exact-main Fast CI        | `34447421785`, SUCCESS                                             |
| Full Release Admission    | `34447421800`, SUCCESS                                             |
| Installed control receipt | `cb15dabe16d27f92ad1318690f9ff7722e1eb27a3738069cf1af05fa26a093a0` |
| Schema plan digest        | `276567b90d2a657dfbd7fa411b955b5dd69b48a8130b54867500128c176ef920` |
| Immutable pre-final check | `2e2d54c34d98a9c85c0a145e13d13c97d81ff639199b30c2f1522e00411b97ea` |
| Blue final receipt        | `ac7f8ee49069e165d0937ce11d68f6c0e3db4c5bd48f7ba914d8b003e42adfe5` |
| Green final receipt       | `d65685fd66c5b44364c8a58aea7cde02aa399b7f710e79afa0065ac87152ba5a` |
| Final runtime attestation | `8f0cb748445a8c0a8c6a908bea73f5ac787c66a168d31dcb96f32d0dfdc56fa9` |

Ежедневный Langame worker: прежний permit от `def5174…` снят после проверки
непрерывной цепочки из 9 cutover. Контрольный запуск за `2026-09-09` завершён:
BUSINESS_FACTS, GUEST_FOUNDATION, STAFF_SHIFTS и BUSINESS_SNAPSHOTS — SUCCESS.
Canary apply/check и timer apply/check прошли; daily и bonus-ledger timers
enabled/active. Следующий daily запуск — 11.09.2026 около 04:30 Asia/Yekaterinburg.
Canary authorization receipt: `ff020c1e1fe6ed4f5daffd40f46b0f9d2c5b917667fbcbe4a2d7565a35370776`;
timer authorization receipt: `aa252d20ac10818563b0e133eea8fcbfd7ca614a2b9900b05e4e28eee0a8a13c`.
Итоговая production acceptance — PASS; незавершённых rollout operations — 0.

## Правильная сеть и внешний onboarding

Исходная рабочая сеть с отображаемым именем **1337** имеет технический slug
`demo`: 4 клуба и 30 пользователей в проверенной копии. Пустые tenant со slug
`1337` и `club-a` не являются этой рабочей сетью. Нельзя выбирать tenant
только по отображаемому имени или переносить пользователей по совпадению имени.
Production-привязки пользователей и клубов данным переходом не менялись.

Для внешней сети действует простой corporate-маршрут:
ключ и домены → `POST /integrations/langame/settings/preview` → выбор клубов →
`PUT /integrations/langame/settings` → manual sync по сохранённым Store bindings.
`SAFE_EXTERNAL` не требует подтверждения отправки письма или ручного запуска
staged onboarding для обычного подключения. Сам API-ключ никогда не возвращается.

Проверено под platform-admin: сохранённая сессия, landing в administration,
переключение между `demo` и `set-1`, изолированные Store counts 4/1,
`INTERNAL`/`SAFE_EXTERNAL`, настройки Langame и validation нового preview route.
У `set-1` ключ пока не сохранён: реальное provider discovery требует ключа этой сети.
Проверка пустого preview не считается проверкой реального соединения с Langame.

Dashboard обеих сетей вернул полный HTTP 200 с рабочим заголовком. Для `demo`
полный поток занял около 31,6 секунды; это отдельное наблюдение производительности,
а не ошибка авторизации. Platform redirect может передаваться через streaming
meta/NEXT_REDIRECT при HTTP 200: проверять нужно destination, не только status.

## Уроки финализации и recovery

`current191-final` меняет профиль уже привязанного релиза. Поле
`PRIOR_RELEASE_SHA` исторического BIND описывает прежний переход ссылки,
а не текущий SHA в slot env. Source correction проверяет final env относительно
`plan.releaseSha`, сохраняя signed schema check, actual current binding,
fence, metadata и все ограничения других profiles. Регрессионный fixture
обязан включать случай «current env = requested SHA, historical prior ≠ requested SHA».

Аналогично latest cutover может законно иметь одинаковые previous/current SHA
при разных blue/green slot. Worker supersession должна проверить всю
generation-by-generation цепочку до действительно устаревшего permit.
Равенство SHA последнего ребра само по себе не делает цепочку недействительной.

В этом переходе, по отдельному разрешению пользователя на ускоренное
операционное восстановление, применены два ограниченных signed operator recovery.
Они **не выдаются за новый CI-deploy** и не меняют 63 installed control files:

- Same-target BIND reaffirmation: новый точный BIND intent/receipt и atomic
  публикация той же ссылки; старые records сохранены. Manifest связан с
  helper SHA, old operation/plan/approval, schema-check, control, env, index и
  artifact digests. Требуются masked/stopped target, physical191 и четыре
  exclusive locks. Затем штатный orchestrator продолжает исходный plan.
- Worker supersession copy: ровно одно исправление latest same-SHA проверки;
  вся цепочка, tenant/env/permit/control/hot-rollback gates сохраняется.
  Отдельная offline signature разрешает только exact supersede-apply.
  Canary и timer по-прежнему выполняет штатный installed controller.

Это описание конкретного восстановления, не общий допуск на ручную правку env,
исторических receipts, отключение verifier или запуск произвольного root-кода.
Новые runtime/control изменения по-прежнему требуют exact-SHA admission и GO.
Recovery approval ограничена по времени, action и SHA; поздний completion
допустим только для доказанно committed собственного эффекта и не разрешает новый apply.

## Бэкапы, проверка и повторы

Fresh dump `pre-current191-a05d2a50-20260910T022100Z` и globals сохранены на
сервере и проверены off-host. Dump SHA:
`882572841d0ba79fa0a7f3f347117ca9fc66f8cad30f146d35f2606364b32ca7`.
Миграция прошла на отдельном кластере PG16.13 с исходной locale en_US.UTF-8.
После отдельного clone-only runtime-owner overlay exact6097 API/Web прошли
подписанную acceptance-проверку для рабочей сети; overlay не переносился в production.

Тестовый кластер удалён только после off-host проверки evidence. Исходный
резерв 2,5 GB не снижался. Дополнительное место получено штатным retirement
одного устаревшего dump и сокращением локальных archived systemd journals
после сохранения и проверки всех 27 исходных файлов off-host.
Текущие журналы и deployment receipts сохранены.

Независимые проверки выполняются одним bounded batch с отдельными logs/exit codes.
Перед повтором и каждой production-командой читается полный
`deploy-evidence/current191-20260909/ERROR_LOG.md`; в нём уже должны быть
ошибка, причина и изменённое условие. Passed backup/rehearsal не повторяются
ради postcheck или metadata cleanup.

После lost response используется status и exact resume/reconcile. Успешный
runtime receipt не означает завершённый cleanup: нужно проверить completion,
drain, active marker и временную группу. Неудачная первая schema попытка может
оставить timer остановленным; финальная проверка обязана восстановить его authority.

Windows offline signing CLI может записать подпись и затем получить ошибку
POSIX directory fsync. Нельзя считать generic error ни успехом, ни отсутствием
файла: проверить exact bytes и подпись, flush самого файла, затем выполнить
durable publication на Linux. Private key и credential values не печатаются.
