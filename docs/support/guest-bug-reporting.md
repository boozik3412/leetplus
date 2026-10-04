# Система обращений гостей (поддержка игрового модуля)

Актуально на **04.10.2026**. Описывает текущее поведение; как система
появлялась и раскатывалась — в разделе «История изменений» в конце.

## Кратко

Гость из игрового модуля сообщает о проблеме («жучок» в шапке), видит свои
обращения и ответы в «Моих обращениях», может ответить и оценить решение.
Сотрудники сети работают с очередью `/support`, администраторы LeetPlus — с
общей очередью `/administration/support-tickets`. Внешние каналы (почта, SMS,
Telegram) не используются: всё происходит внутри LeetPlus.

## Жизненный цикл обращения

| Статус у сотрудника | Статус у гостя | Как попадает                                                                 |
| ------------------- | -------------- | ---------------------------------------------------------------------------- |
| Новое               | Получено       | гость отправил форму; гость ответил на закрытое ≤7 дней или «не помогло»     |
| В работе            | Разбираемся    | «Взять в работу», назначение, первый ответ гостю на «Новое»                  |
| Решено              | Решено         | смена статуса или «Ответить и решить»                                        |
| Закрыто             | Закрыто        | смена статуса; гость ответил «Да, решено»; автоматически через 7 дней        |

- «Решено» без реакции гостя закрывается автоматически через 7 дней после
  решения (ленивая проверка при чтении очереди или списка гостя;
  compare-and-set по `resolvedAt`; дата закрытия — `resolvedAt + 7 дней`;
  событие `AUTO_CLOSED`).
- В течение 7 дней после закрытия сообщение гостя снова открывает обращение
  («Новое», событие `REOPENED_BY_GUEST`). Позже гостю предлагается отправить
  новое обращение.
- Каждое изменение пишет событие в support audit ledger
  (`GuestSupportTicketAuditEvent`).

## Гость

### Форма «Сообщить о проблеме»

- Поля: **клуб**, тема, описание (20–2000 символов), один скриншот
  JPG/PNG/WebP до 5 МБ. Темы: игровой модуль; задания и боевой пропуск;
  лутбоксы и награды; баланс и платежи; авторизация и профиль; интерфейс и
  отображение; другое.
- Клуб по умолчанию — выбранный сейчас в модуле («— сейчас выбран»). Если в
  сети больше одного клуба, гость может выбрать другой (см. «Клуб обращения»).
- После отправки гость видит номер `LP-BUG-XXXXXXXX` и подсказку, что ответ
  придёт в «Мои обращения».
- Сервер добавляет только ограниченную диагностику: route без query string,
  release SHA, класс браузера/устройства, viewport, timezone. Телефон, JWT,
  cookies, payload провайдеров и секреты не сохраняются.

### «Мои обращения»

- Кнопка рядом с жучком появляется, когда у гостя есть хотя бы одно
  обращение; бейдж — число непрочитанных ответов. При новом ответе модуль
  показывает уведомление «Поддержка LeetPlus ответила на обращение LP-BUG-…»
  (опрос раз в 90 секунд, пока вкладка видима).
- В списке у каждого обращения — **клуб**, тема, статус и дата; в переписке —
  клуб и тема в шапке, исходное описание, ответы и сообщения гостя.
- Ответы всегда подписаны «Поддержка LeetPlus»; имя, e-mail и роль сотрудника
  гостю не передаются. Внутренние заметки гость не видит.
- Гость может написать в обращение: 2–1000 символов, до 10 сообщений в час и
  30 в сутки на игровой профиль; повтор с тем же ключом не создаёт дубль.
- На решённое обращение гость отвечает «Да, решено» (закрывается) или «Нет,
  не помогло» с необязательным комментарием (возвращается в очередь как
  «Новое»). Один ответ на каждое решение.

## Клуб обращения

Игровой профиль гостя один на всю сеть, а награды, кейсы и прогресс
привязаны к клубу, где они получены. Поэтому у каждого обращения есть клуб, и
система не смешивает клубы:

- **Обязательное поле.** `GuestSupportTicket.storeId` — клуб, о котором
  обращение. По умолчанию это клуб, выбранный в модуле в момент отправки.
- **Выбор гостя.** В форме можно указать другой клуб своей сети: активный, с
  включённым игровым модулем. Сервер проверяет, что клуб принадлежит той же
  сети (`tenantId`), иначе отвечает «Выберите клуб своей сети.».
- **Откуда отправлено.** Если гость указал не тот клуб, что выбран в модуле,
  в событии `CREATED_BY_GUEST` сохраняется `reportedFromStoreId`, а в карточке
  сотрудника появляется строка «Отправлено из клуба: … — гость указал другой
  клуб».
- **Гость видит клуб** у каждого обращения в «Моих обращениях».
- **Сотрудник видит клуб** меткой в шапке карточки и в строке «Сеть / клуб»,
  может отфильтровать очередь по клубу (фильтр «Клуб», в скобках — число
  обращений).
- **Награды гостя в этом клубе.** В карточке раскрывается панель «Награды
  гостя в клубе «…» · 30 дней до обращения и после» (загружается только по
  клику). Она показывает предметы кошелька наград гостя, полученные в клубе
  обращения: название, награда, источник (задание, кейс, боевой пропуск) и
  состояние — «кейс выдан, не открыт», «кейс открыт», «кейс истёк, не открыт»,
  «получена», «ждёт получения гостем», «начисляется», «ошибка начисления»; для
  бонусов — сумма и статус начисления («начислено», «подтверждено, ждёт
  начисления», «начисление отменено» и т. п.). Цветная точка: зелёная —
  выполнено, жёлтая — ждёт, красная — проблема. Ниже — сколько наград за тот
  же период было в других клубах сети: если гость пишет о другом клубе, это
  видно сразу. Показываются последние 30 записей.

## Сотрудник

### Очередь

- `/support` (сеть) и `/administration/support-tickets` (LeetPlus) по
  умолчанию открывают очередь: «Новое» и «В работе», сначала ждущие дольше
  всех. «Все статусы» — история по последнему действию.
- Плитки — быстрые фильтры: «В очереди», «Новые, не взяты», «Без
  ответственного», «Мои», «Ждут ответа» (последнее слово за гостем), «Дольше
  всех ждёт», «Всего».
- Фильтры: статус (включая «Ждут ответа гостю»), тема, **клуб**,
  ответственный, поиск; у LeetPlus дополнительно сеть.
- «Взять в работу» назначает текущего сотрудника и ставит «В работе».
  Изменение сохраняется, только если обращение не поменял другой сотрудник,
  иначе — конфликт и просьба обновить страницу.
- Ответственный — сотрудник сети обращения с `manage_support_tickets`
  (OWNER/ADMIN — всегда) или администратор LeetPlus.

### Карточка

- Метки: статус, **клуб**, тема, номер, возраст, «Ждёт ответа», «Гость:
  помогло / не помогло», «Ответ прочитан / не прочитан».
- Поля: ФИО и телефон гостя (расшифровка только в corporate contour), сеть и
  клуб, «Отправлено из клуба» (если отличается), даты, среда, страница.
- Панель «Награды гостя в клубе …», скриншот (крупный просмотр и скачивание),
  история событий.
- Переписка с метками «Гостю», «От гостя», «Заметка».
- Поле ответа: «Заметка для команды» (по умолчанию, видна только
  сотрудникам) или «Ответ гостю» (подпись «Поддержка LeetPlus»); кнопки
  «Отправить гостю» и «Ответить и решить» (ответ и «Решено» одним
  compare-and-set действием).

### Уведомления

- Счётчик в боковом меню у «Обращения гостей» и «Тикеты поддержки» — число
  новых (не взятых) обращений; раз в минуту и сразу после действия. Сообщение
  гостя в обращении «В работе» видно на плитке «Ждут ответа», но не в
  счётчике меню.
- Уведомления браузера о новом обращении (пока LeetPlus открыт в любой
  вкладке) включаются на странице очереди.
- В центре уведомлений сотрудников (`/staff/notifications`, источник
  «Поддержка») каждое «Новое» — сигнал; через 24 часа он критичный и
  закрывается, когда обращение взяли в работу.

## Доступ

- Tenant-очередь: `view_support_tickets` (чтение) и `manage_support_tickets`
  (назначение, статус, заметки, ответы гостю) в свежем NETWORK scope.
  OWNER/ADMIN получают обе capability как минимум роли, в том числе с custom
  role. Техническому специалисту они выдаются явно.
- Platform-очередь — только platform admin (`PlatformAdminGuard`).
- Tenant API всегда добавляет `tenantId` в каждое чтение и запись; чужой или
  несуществующий объект — not found.

## Маршруты

| Кто              | Web (BFF)                                                                              | API                                                                                                      | Guard                                                         |
| ---------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Гость            | `POST /api/guest-support/bug-report`                                                   | `POST /guest-portal/session/support/bug-reports`                                                         | guest JWT, write requirements                                 |
| Гость            | `/api/guest-support/tickets`, `/[number]`, `/[number]/read`, `/messages`, `/feedback` | `/guest-portal/session/support/tickets*`                                                                 | guest JWT, exact tenant + game profile                        |
| Сотрудник сети   | `/api/support/bug-reports/*`                                                           | `/support/bug-reports` (`GET`, `summary`, `:id/guest-rewards`, `:id/attachments/:id`; `PATCH :id`; `POST :id/comments`, `:id/resolve-with-reply`) | corporate JWT, capability, `FreshNetworkScopeGuard`           |
| LeetPlus         | `/api/admin/support-tickets/*`                                                         | `/admin/support-tickets/*` (те же + `close-with-comment`)                                                | corporate JWT, `PlatformAdminGuard`                           |

Guest runtime не импортирует corporate-модули; corporate код использует только
чистые helpers `guest-portal/guest-support-thread.ts`. Все private BFF — `no-store`.

## Данные

- `GuestSupportTicket` — обращение (`tenantId`, `storeId` — клуб,
  `profileId`, тема, описание, статус, даты); `GuestSupportAttachment` —
  очищенный от metadata скриншот; `GuestSupportTicketComment` — заметки,
  ответы гостю и сообщения гостя; `GuestSupportTicketAuditEvent` — история.
- События: `CREATED_BY_GUEST` (metadata: `topic`, `storeId`,
  `reportedFromStoreId` при смене клуба, `profileId`, `hasAttachment`),
  `UPDATED_BY_SUPPORT`, `COMMENT_ADDED` (`visibility`), `CLOSED_WITH_COMMENT`,
  `PUBLIC_REPLY_SENT` (`commentId` — комментарий виден гостю),
  `GUEST_MESSAGE_ADDED`, `GUEST_READ`, `GUEST_FEEDBACK` (`HELPED|NOT_HELPED`),
  `REOPENED_BY_GUEST`, `AUTO_CLOSED`.
- Комментарий без `PUBLIC_REPLY_SENT` — внутренний. Обратная связь, клуб и
  награды реализованы без изменения схемы: текущий head миграций закреплён во
  многих runtime/test местах, и его расчистка — отдельная задача перед любой
  новой миграцией support.
- Награды в карточке читаются из `GuestGameRewardWalletItem` (с `storeId`
  клуба) и связанного `GuestGameReward` (статус начисления); support их не
  меняет.

## Ограничения и защита

- Multipart формы: ровно разрешённые поля `topic`, `description`, `route`,
  `viewport`, `timeZone`, `storeId` и один файл; лимиты `fields=6`, `files=1`,
  `fileSize=5 MiB`, `fieldSize=4 KiB`, exclusive `parts=8` (с 04.10.2026;
  раньше 5 полей и `parts=7`). BFF требует точный ограниченный
  `Content-Length`.
- MIME обязан совпасть с сигнатурой; EXIF/text/XMP удаляются; файл отдаётся
  только как `attachment` с `nosniff`, `no-store` и sandbox CSP.
- Новые обращения: 5 в час и 20 в сутки на профиль; idempotency по
  `tenantId + profileId + idempotencyKey`; serializable transaction с retry.
- Сообщения гостя: 10 в час, 30 в сутки; idempotency по детерминированному
  id комментария.
- Флаг `GUEST_BUG_REPORTING_MODE=OFF|LIVE` (по умолчанию `OFF`). Kill switch —
  `OFF` и перезапуск API: форма, «Мои обращения» и гостевые маршруты
  отключаются (safe not found), сохранённые обращения не удаляются.

## Эксплуатация

- Релиз — `lp deploy <sha>` на хосте (blue/green, откат `lp rollback`),
  миграции для этой функции не нужны.
- Проверка использования (read-only): число событий
  `PUBLIC_REPLY_SENT`, `GUEST_MESSAGE_ADDED`, `GUEST_FEEDBACK`,
  `REOPENED_BY_GUEST`, `AUTO_CLOSED` в `GuestSupportTicketAuditEvent`;
  распределение обращений по `storeId`.

## Известные ограничения

- Счётчик в меню считает только «Новое»; сообщения гостя в «В работе» — на
  плитке «Ждут ответа».
- Панель наград показывает только кошелёк наград (то, что видит гость) за
  30 дней до обращения и после, не более 30 записей; полная история — в
  журнале игрового модуля.
- Автозакрытие ленивое: срабатывает при открытии очереди или списка гостя.
- Обращения, отправленные до 04.10.2026, не содержат `reportedFromStoreId`:
  их клуб — клуб, выбранный в модуле при отправке.

## История изменений

- **04.10.2026** — клуб обращения: выбор клуба в форме, `reportedFromStoreId`,
  клуб в «Моих обращениях», фильтр «Клуб» в очереди, панель «Награды гостя в
  клубе» (`GET …/:id/guest-rewards`); multipart расширен до 6 полей.
- **03.10.2026** — обратная связь с гостем (PR #277): «Мои обращения», ответы
  «Поддержка LeetPlus», сообщения и оценка гостя, автозакрытие через 7 дней,
  повторное открытие, «Ждут ответа».
- **29–30.09.2026** — рабочая очередь (PR #258): «Взять в работу», плитки,
  счётчики в меню, уведомления браузера и центра уведомлений.
- **24.09.2026**, **07.09.2026**, **01.09.2026**, **CURRENT_188** — разделы ниже
  сохранены как исторические записи; их статусы и контроллеры раскатки
  относятся к своему времени (сейчас релизы идут через `lp`).

### Source-only atomic support actions, 24.09.2026

Platform admin может использовать подготовленный
`POST /admin/support-tickets/:id/close-with-comment` только после свежей
проверки `tenantId`, `profileId`, номера обращения, `NEW`, `updatedAt` и MD5
описания. Комментарий, `CLOSED` и audit входят в одну транзакцию; точный
`requestId` допускает безопасную сверку потерянного ответа. Случайное
повторное закрытие, иной комментарий или изменившийся тикет дают конфликт,
а не ещё одну запись. Существующие обычные PATCH и POST comments не заменены.

Для GAMEPASS vol.1 шаг 4 GOOD MORNING, VIETNAM предложен текст, точно
описывающий текущую проверку по *завершению* одной будничной сессии:
«В будни завершите одну сессию от 60 минут между 08:00 и 17:00.»
Пояснение: «Почасовая или пакетная сессия должна длиться не менее 60 минут
и завершиться в будний день с 08:00 до 17:00 по времени клуба. Время разных
сессий не суммируется.» Отдельный guarded copy route обновляет только эти
две строки при точном CAS; награды и правило оценки не меняются. Ни текст,
ни новые маршруты пока не опубликованы в production. Вёрстка у гостя и
фактический postcheck нужны после отдельного релиза/разрешения.

### Состояние production на 01.09.2026

Статус: **production LIVE на CURRENT_189**

Актуально на: **01.09.2026**

Фактический production state: active green
`22ab6b81dacc726068d0dfcc5172fe67581a45b1`, cutover generation 20, exact
`CURRENT_189/189`, `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=OFF`,
`GUEST_BUG_REPORTING_MODE=LIVE`. Active green и hot-rollback blue проходят
exact readiness одного release. Production форма принимает описание от 20
символов, а canonical multipart envelope `5 fields + 1 file` не блокируется
ложной ошибкой `Too many parts`.

### Production rollout 07.09.2026

Защищённая проекция ФИО и телефона развернута в production через PR #154 на
exact SHA `54babfaf8f755e49d48fdae870bf085479ea7315`. Fast CI
`34098587581` и Full Release Admission `34098587544` завершились `SUCCESS`;
restored-copy acceptance прошёл на свежем production backup. Five-phase
operation `2232646f-3eab-470f-8619-784a9b24a31d` завершилась terminal receipt
`832ca85fa6dcff7db2fd0e732e058af7bb3b4fa32e5339700a6eb026c3d0d32ba`.

Postflight подтвердил active blue на exact `54babfaf…`, hot-rollback green на
`0e51235d…`, readiness обоих slot на `CURRENT_189/189`, bridge `OFF` и reporting
`LIVE`. Authenticated UI QA проверила все `7/7` доступных карточек: ФИО раскрыто,
телефон показан отдельным полем, desktop и узкая компоновка не создают
горизонтального переполнения. В новой браузерной сессии console errors и
warnings отсутствовали. Support schema, public response, audit/attachment
metadata и существующие tenant/platform guards не менялись.

### Production repair CURRENT_189

Additive migration:
`20260831120000_guest_support_bug_report_input_repair` (`CURRENT_189`, 189
applied после rollout). Она только ослабляет check длины описания с `30..2000`
до `20..2000` и перевыпускает fail-closed identity-mail worker receipt на exact
новый head. Существующие обращения не переписываются и не удаляются.

API и Web используют одну и ту же границу `20..2000`; controller сохраняет
независимые limits `files=1`, `fields=5`, `fileSize=5 MiB`, `fieldSize=4 KiB` и
`parts=7`. Регрессионный HTTP test обязан принимать ровно пять полей плюс JPG и
отвергать шестое текстовое поле. Database check отдельно принимает 20 символов
и отвергает 19.

Rollout завершён 01.09.2026 на exact SHA `22ab6b81…`: Fast CI
`33514154571`, Full Release Admission `33514154601`, restored-copy acceptance
PASS, затем checksum-pinned controller применил единственный переход
`188 -> 189`. Перед DDL создан backup
`current189-preupgrade-20260901T1511Z`, dump SHA-256
`6839ec24f440339e672326d6ba500a9e02baa4bebee267a2a337bdf862625244`.
После postflight оба slot готовы на exact CURRENT189, bridge возвращён в
`OFF`, reporting включён в `LIVE`, а bonus-ledger timer работает автономно.

Тесты закрепляют принятие ровно пяти полей плюс JPG, отказ для шестого поля,
границу 20/19 символов и сохранение signature/MIME/size guards. Tenant queue
проверена через `/support`, platform queue — через
`/administration/support-tickets`; существующее обращение доступно в обеих
очередях только в соответствующем authenticated contour.

#### История fail-closed rehearsal

Первый restored-copy acceptance корректно завершился `FAIL` до production
effect: database oracle сравнивал `/products` со всеми 1489 строками `Product`,
тогда как контракт endpoint возвращает 1238 активных товаров. Разница — 251
архивный `isActive=false` товар. Oracle теперь использует тот же активный scope,
а regression фиксирует SQL-предикат. Это не меняет данные и не скрывает
расхождение активного каталога; новый exact-SHA rehearsal обязан пройти заново.

Следующий exact-SHA rehearsal также остановился до production effect с
`CURRENT_RELEASE_CROSS_TENANT_USER_REFERENCE`. Read-only разбор всех 103
tenant-scoped foreign keys к `User` подтвердил ноль реальных cross-tenant
ссылок. Причиной были исторические ссылки на platform-admin этого же tenant,
которого `/users` корректно скрывает от tenant owner. Acceptance oracle теперь
разделяет visible user set и полный tenant reference set: это разрешает только
same-tenant ссылку, не добавляет platform-admin в API-каталог и сохраняет
fail-closed отказ для настоящего foreign user ID. Регрессионный тест покрывает
обе стороны границы; production остаётся неизменённым до нового admission.

Для rollout CURRENT_189 добавлен отдельный режим
`GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_188`. Его контракт:

- source — exact `20260828190000_guest_support_bug_reports`, count `188`;
- target — exact
  `20260831120000_guest_support_bug_report_input_repair`, count `189`;
- только `API_RUNTIME_ROLE=COMBINED` и
  `GUEST_BUG_REPORTING_MODE=OFF`;
- target release identity обязана быть exact CURRENT_189;
- после применения migration readiness становится exact CURRENT_189 без
  compatibility evidence; затем bridge обязан вернуться в `OFF`, а reporting —
  в `LIVE`.

Перед DDL оба blue/green slot заменяются одним independently admitted
target-189 SHA и проверяются через этот bridge. Старый CURRENT_188 runtime после
DDL не является rollback authority. Миграция выполняется под production-control
install lock и blue/green cutover lock при остановленном bonus-ledger timer;
после exact-189 postflight timer возвращается в автономный режим. Исторический
`ALLOW_CURRENT_187` остаётся отдельным контрактом только для 187→188 и не
расширяется.

### Историческое включение CURRENT_188

Additive migration:
`20260828190000_guest_support_bug_reports` (`CURRENT_188`, 188 applied).
Она создаёт только новые enum/table/index/FK/check objects и перевыпускает
identity-mail readiness receipt на exact новый head. Удаление или изменение
существующих business rows не выполняется.

Production сейчас может находиться на `CURRENT_187`, тогда как admitted artifact
ожидает `CURRENT_188`. Поэтому rollout выполняется двумя cutover, без окна 502 и
без запуска нового кода с доступной гостю записью до появления таблиц:

1. получить green Fast CI + Full Release Admission одного exact SHA и проверить
   SHA-bound runtime/control artifacts и final admission receipt;
2. сделать backup, восстановить его в изолированную PostgreSQL 16 copy и пройти
   exact checksum-pinned database path `187 -> 188`, repeat/catalog check и
   обычный restored-copy acceptance. Production `V2 plan/apply` здесь не
   подменяется: его live bridge-attestation возможна только после реального
   первого cutover;
3. запустить inactive slot с release identity `CURRENT_188`, но с
   `GUEST_BUG_REPORTING_MODE=OFF` и
   `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_187`; readiness принимает
   только exact чистый `CURRENT_187` и публикует явную compatibility evidence;
   tenant/platform support API в этом режиме отвечает safe not found до любого
   запроса к отсутствующим support tables, а Web-страницы очередей возвращают
   пользователя в соответствующий dashboard;
   API slot одновременно обязан пройти exact `guest-user-call-live.env`
   attestation, чтобы публичный Callcheck можно было переключить с временного
   old-SHA sidecar до schema effect без окна недоступности;
4. пройти loopback/public read-only canary и атомарно переключить трафик на этот
   bridge slot. До schema effect предыдущий slot также обязан быть заменён на
   independently admitted target-188 artifact, пройти hydration/slot-link,
   unit/env/Web identity и authenticated read-smoke и работать при фактической
   БД CURRENT_187 только через тот же explicit bridge. Старый CURRENT_187
   artifact не остаётся rollback target;
5. для фактической production mixed-owner topology применить только подписанный
   checksum-pinned
   `FOUNDER_PILOT_CURRENT188_LEGACY_MIXED_OWNERSHIP_V2` controller. До любого
   database effect он берёт тот же root-owned cutover lock, проверяет активный
   nginx target, непросроченный accepted receipt/index с `CONSUMED=false`,
   отсутствие cutover/slot-link intent и exact active + rollback runtime.
   Для обоих slot он закрепляет target-188 provenance, hydration/slot-link
   receipts, systemd invocation, environment/Web identity, authenticated smoke,
   exact target migration checksum, `COMBINED + OFF + ALLOW_CURRENT_187` и live
   readiness `187 -> target 188`; active production-control generation обязана
   совпадать с controller SHA. Production-control install lock удерживается
   вместе с blue/green lock до post-effect проверки, поэтому control generation
   не может смениться во время DDL. Подписанный plan закрепляет эту
   `DUAL_BRIDGE_N_MINUS_ONE` topology, production database/role identity и
   пообъектный digest исторических OID/owner/ACL. Controller
   допускает ровно `187 applied / 4 rolled back / 0 unfinished`, выполняет
   одну целевую миграцию локально от `postgres`, не меняет исторических
   owners, одной транзакцией отзывает PUBLIC grants и выдаёт runtime только
   минимальный support ACL. Под тем же lock он проверяет readiness `188/188`,
   body/comment worker function, таблицы, enum, constraints, indexes,
   неизменность ownership digest и exact ACL. Под тем же lock оба slot обязаны
   перейти в exact `CURRENT_188` readiness без active compatibility evidence;
6. убедиться, что active и rollback bridge после изменения БД готовы уже как
   exact `CURRENT_188`. Перезапустить candidate slot с
   `GUEST_BUG_REPORTING_MODE=LIVE` и
   `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=OFF`;
7. пройти negative contour matrix, guest submit/idempotency/invalid-file,
   tenant/platform isolation canary, затем второй atomic cutover и bounded soak.

Executable production controller и команды описаны в
[CURRENT_188 legacy mixed-owner controller](../open-beta/founder-pilot-current188-legacy-mixed-owner-upgrade-controller.md).
Строгий
[CURRENT_188 V3 controller](../open-beta/founder-pilot-current188-production-upgrade-controller.md)
остаётся для базы с единым migration owner и на текущей mixed-owner production
топологии обязан блокироваться до effect.
Bridge не является общим допуском N/N+1: он принимает только одну пару
`187 -> 188`, только `COMBINED` runtime и только при выключенной отправке багов.
После второго cutover значение обязано вернуться в `OFF`.

Исполняемый checksum-pinned контроллер перехода 188→189, формат подписанного
плана, правила lost-response recovery и postflight описаны в
[CURRENT_189 guest-support production controller](../open-beta/guest-support-current189-production-upgrade-controller.md).

Rollback приложения не требует schema rollback: additive objects остаются, а
после перехода схемы rollback target — первый bridge slot того же admitted SHA,
который уже прошёл exact `CURRENT_188` readiness. Старый `CURRENT_187` runtime
нельзя возвращать после миграции, потому что его exact-head readiness справедливо
откажет. Операционный kill switch — вернуть
`GUEST_BUG_REPORTING_MODE=OFF` и перезапустить active API; форма исчезает из
следующего game-summary, create route отвечает safe not found. Уже сохранённые
обращения не удаляются.
