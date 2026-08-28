# Fallback-вход в геймификацию

Дата актуализации: 28.08.2026

Этот runbook описывает резервные каналы авторизации участника геймификации. Канонический пользовательский маршрут: `/game/auth -> /game/clubs -> /game`; `/play` сохраняется только как совместимый legacy-вход. Основной канал остаётся Telegram-бот с contact-share; fallback нужен, чтобы не останавливать регистрацию при временно неготовом Telegram или высокой цене SMS.

## Маршрутизация и ошибки сессии

- Успешное подтверждение Telegram, звонком или SMS должно выдать guest-token, затем открыть выбор клуба `/game/clubs` и только после выбора — `/game`.
- `401`, отсутствующая или истёкшая guest-cookie означают повторную авторизацию. На `/game` и `/game/rewards` показывается сообщение `Сессия входа не найдена или истекла. Подтвердите телефон заново.` с основным действием `Перейти ко входу` на `/game/auth`.
- Network/timeout/5xx — повторяемая техническая ошибка, а не доказательство истёкшей сессии. UI показывает `Повторить` и безопасный переход на `/start`, не стирая валидную cookie заранее.
- Возврат из Telegram должен продолжать тот же handoff/challenge. Повторный status polling обязан быть идемпотентным и не создавать второй профиль, referral event или guest-token lifecycle.
- После выбора клуба первый trusted `APP_OPEN` фиксирует `GuestGameProfile.gameActivatedAt`; одно подтверждение телефона без выбора клуба и `APP_OPEN` ещё не является входом в игровой контур.

## Приоритет каналов

1. Telegram-бот: основной путь для регистрации, уведомлений, рефералок и возврата гостей.
2. Звонок пользователя на номер: дешевый и понятный fallback.
3. SMS-код: обязательный резерв, но не основной канал из-за цены и риска накрутки.
4. Входящий звонок с последними 4 цифрами: поздний резерв, подключать после стабилизации первых трех каналов.

## Звонок пользователя на номер

Контур с SMS.ru Callcheck: `/game/auth` создает `USER_CALL` challenge, LeetPlus запрашивает у SMS.ru временный номер через `callcheck/add`, гость звонит на этот номер с введенного телефона, а browser status endpoint polling-ом проверяет `callcheck/status` по сохраненному `check_id`. Провайдер сбрасывает вызов после проверки, поэтому звонок для гостя бесплатный; API возвращает `freeCall=true`, а frontend показывает нейтральное сообщение `Звонок будет сброшен сразу после проверки` рядом с методом входа. После подтверждения LeetPlus выдает guest-token и активирует отдельный `GuestGameProfile` без callback от администратора.

Env на VDS для SMS.ru:

```env
GUEST_PORTAL_USER_CALL_ENABLED="true"
GUEST_PORTAL_USER_CALL_PROVIDER="SMS_RU_CALLCHECK"
GUEST_PORTAL_USER_CALL_SMS_RU_API_ID="<sms-ru-api-id>"
GUEST_PORTAL_USER_CALL_SMS_RU_BASE_URL="https://sms.ru"
GUEST_PORTAL_USER_CALL_PROVIDER_TIMEOUT_MS="8000"
GUEST_PORTAL_USER_CALL_STATUS_POLL_MIN_INTERVAL_MS="2500"
```

`GUEST_PORTAL_USER_CALL_SMS_RU_API_ID` хранится только в production env. Не коммитить реальное значение в `.env.example`, runbook или issue.

Ручной callback-provider остается совместимым контуром: `/game/auth` создает `USER_CALL` challenge, гость звонит с введенного телефона на настроенный номер, внешний call-provider подтверждает caller id через защищенный callback.

Env на VDS для ручного provider:

```env
GUEST_PORTAL_USER_CALL_ENABLED="true"
GUEST_PORTAL_USER_CALL_PROVIDER="MANUAL"
GUEST_PORTAL_USER_CALL_PHONE_NUMBER="<public-phone-number>"
GUEST_PORTAL_USER_CALL_SECRET="<provider-callback-secret>"
```

Provider callback:

```http
POST /guest-portal/user-call/confirm
x-guest-portal-user-call-secret: <provider-callback-secret>
```

Callback должен передавать номер звонящего только backend-у LeetPlus. При SMS.ru callback secret не нужен: в challenge сохраняется только provider name и внешний `check_id`. Frontend получает только статус, маски и safe local match; raw phone, `api_id`, callback secret и Langame payload не возвращаются в браузер.

### Отдельный guest-auth контур и параллельность

- `/guest-portal/*`, guest JWT с purpose `guest_portal`, `GUEST_PORTAL_JWT_SECRET` и HttpOnly guest-cookie отделены от корпоративных `/auth/*`, corporate JWT/cookie, ролей и fresh employee scope. `GuestPortalModule` больше не получает `JwtService` через прямой импорт корпоративного `AuthModule`; ограничения корпоративного входа не являются лимитом игрового модуля.
- Глобального лимита на число одновременно авторизующихся гостей нет. Сотни разных телефонов получают разные advisory lock keys и не ждут один общий application mutex. Защита от двойного клика сериализует только совпадающий `tenant + store + phoneHash + channel` и освобождает DB connection до сетевого запроса provider-а.
- Старт `USER_CALL` сначала сохраняет короткую reservation `CALL_PROVIDER_STARTING`, затем вне транзакции обращается к provider-у и переводит challenge в `PENDING`. Поэтому два параллельных запроса одного телефона не создают два платных provider challenge.
- Очистка просроченных challenge выполняется только в текущем `tenant + store + phoneHash + channel`. Запрос одного гостя не обновляет строки остальных клубов, телефонов или каналов; `USER_CALL` не блокирует `SMS/Telegram/MAX/DEV` OTP.
- `GUEST_PORTAL_USER_CALL_PROVIDER_TIMEOUT_MS` ограничивает полный provider request вместе с чтением JSON. По умолчанию `8000`, допустимый диапазон `100..30000` мс. Timeout старта возвращает безопасный повторяемый `503` и не оставляет reservation активной.
- `GUEST_PORTAL_USER_CALL_STATUS_POLL_MIN_INTERVAL_MS` объединяет дублирующие status poll одного challenge между вкладками и API instances через optimistic DB lease. По умолчанию `2500`, допустимый диапазон `500..10000` мс; это не лимит пользователей, а защита provider-а от повторов одного challenge.
- Создание/переиспользование `GuestGameProfile` сериализуется транзакционным lock только по `challengeId`. Разные гости выполняются параллельно, а повторный poll одного подтвержденного звонка не создает второй профиль или consent/referral lifecycle.

Корпоративный и игровой контуры пока могут работать в одном Node.js process, поэтому это логическая, token/module и DB-concurrency изоляция, но не полная process-level fault isolation. Перед широким публичным трафиком рекомендуется отдельный runtime pool для `/guest-portal/*`; его отказ не должен менять `/auth/*`, и наоборот.

## SMS-код

SMS-код остается резервным каналом после Telegram-бота и звонка пользователя. Production-путь поддерживает SMS.ru `/sms/send`: backend отправляет код только при включенном real-send, не возвращает `api_id` и raw provider payload на frontend, а challenge хранит только статус доставки, маску телефона и hash кода.

Текущее production-состояние: публичный каталог `/guest-portal/gamification/clubs` может показывать `SMS_CODE READY` для staged/test-mode режима или для явно включенного live canary. Без `GUEST_PORTAL_OTP_SMS_RU_TEST_MODE=true` и без `GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED=true` backend блокирует SMS.ru delivery до provider-вызова, возвращает `DELIVERY_BLOCKED` и показывает required env без раскрытия `api_id`.

Env на VDS для SMS.ru:

```env
GUEST_PORTAL_OTP_REAL_SEND_ENABLED="true"
GUEST_PORTAL_OTP_SMS_ENABLED="true"
GUEST_PORTAL_OTP_SMS_RU_API_ID="<sms-ru-api-id>"
GUEST_PORTAL_OTP_SMS_RU_BASE_URL="https://sms.ru"
GUEST_PORTAL_OTP_SMS_RU_TEST_MODE="false"
GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED="false"
GUEST_PORTAL_OTP_SMS_RATE_LIMIT_PHONE_WINDOW_MINUTES="60"
GUEST_PORTAL_OTP_SMS_RATE_LIMIT_PHONE_MAX="3"
GUEST_PORTAL_OTP_SMS_RATE_LIMIT_STORE_WINDOW_MINUTES="10"
GUEST_PORTAL_OTP_SMS_RATE_LIMIT_STORE_MAX="30"
GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_WINDOW_MINUTES="1440"
GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_MAX="300"
```

Если `GUEST_PORTAL_OTP_SMS_RU_API_ID` не задан, backend может переиспользовать `GUEST_PORTAL_USER_CALL_SMS_RU_API_ID` из Callcheck. Для staged QA можно временно включить `GUEST_PORTAL_OTP_SMS_RU_TEST_MODE=true`: SMS.ru примет запрос с `test=1`, но сообщение не будет отправлено и баланс не будет списан. Для первого live-шага нужно отдельно поставить `GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED=true`, оставить активными все rate-limit/budget env и запускать только ограниченный canary с наблюдением 429/delivery errors. Старый generic provider через `GUEST_PORTAL_OTP_SMS_ENDPOINT` + `GUEST_PORTAL_OTP_SMS_TOKEN` остается fallback-адаптером для другого SMS-шлюза.

Перед вызовом SMS.ru backend применяет бюджетные anti-abuse лимиты по уже созданным SMS-challenge: по умолчанию не больше 3 SMS на один подтверждаемый телефон за 60 минут, не больше 30 SMS на клуб за 10 минут и не больше 300 SMS на tenant за 24 часа. Значение `0` у соответствующего `*_MAX` или `*_WINDOW_MINUTES` отключает конкретный лимит, но для live-режима это допускается только на короткий controlled QA. При срабатывании лимита API возвращает безопасный 429 без вызова provider-а и без раскрытия телефона, `api_id` или счетчиков.

Readiness `OTP_SMS` в Guest Game Hub должен показывать только безопасные признаки: real-send, флаг SMS-канала, provider `SMS.ru /sms/send` или generic fallback, `test=1`, live-canary marker, наличие `api_id`/endpoint без самих значений и safe summary лимитов. Если SMS.ru настроен без `test=1` и без live-canary флага, либо любой SMS rate-limit/budget guard отключен env-ом, карточка должна оставаться `PARTIAL` до исправления. Если в карточке появляется raw `api_id`, endpoint, token, телефон, реальные счетчики попыток или provider payload, запуск SMS-резерва нужно остановить до исправления.

## Входящий звонок с 4 цифрами

Контур: `/game/auth` создает `INCOMING_CALL_LAST4` challenge, backend отправляет запрос call-provider, provider звонит гостю, гость вводит последние 4 цифры номера входящего звонка в `/game/auth`, LeetPlus сверяет код и выдает guest-token.

Env на VDS:

```env
GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED="true"
GUEST_PORTAL_INCOMING_CALL_LAST4_ENDPOINT="<provider-endpoint>"
GUEST_PORTAL_INCOMING_CALL_LAST4_TOKEN="<provider-token>"
```

Этот канал должен различать отсутствие настройки и policy-блокировку:

- `NOT_CONFIGURED`: не хватает env или provider еще не подключен;
- `BLOCKED`: канал настроен, но звонок заблокирован отпиской, согласием или provider policy.

## Безопасный запуск

1. Сначала включить Telegram-runbook и убедиться, что `/game/auth` показывает Telegram первым.
2. Настроить `USER_CALL` env, перезапустить API и проверить readiness `Звонок пользователя для входа` в Guest Game Hub. Для текущего production-пути использовать SMS.ru Callcheck.
3. Выполнить QA: открыть `/game/auth`, выбрать звонок пользователя, ввести телефон, убедиться, что UI показывает нейтральное сообщение о сбросе звонка после проверки, позвонить на выданный номер, дождаться guest-token через polling status и перейти к `/game/clubs`. Для ручного provider дополнительно отправить provider callback.
4. Проверить, что создан или переиспользован отдельный `GuestGameProfile`, общий `Guest` публичной регистрацией не создан, а status response содержит только safe match/backfill.
5. SMS держать как резервный канал после user-call: в staged/test-mode проверять provider acceptance и отсутствие утечек; live-режим включать отдельно только через `GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED=true`, с включенными rate limits, anti-abuse guard и бюджетным контролем.
6. `INCOMING_CALL_LAST4` включать только после выбора provider-а исходящих звонков и отдельного теста блокировок: `NOT_CONFIGURED`, `BLOCKED`, успешный verify.
7. В Guest Game Hub проверить readiness `USER_CALL_AUTH` и `INCOMING_CALL_LAST4_AUTH`: карточки должны показывать только наличие env, required env и QA-шаг, без номера, endpoint, token, raw phone и Langame payload.
8. Нагрузочный canary выполнять разными тестовыми телефонами: отсутствие общего 429/503, отсутствие роста latency `/auth/me`, bounded provider timeout и не более одного `callcheck/status` на challenge за настроенный poll interval. Повтор одного телефона в течение cooldown — ожидаемая anti-abuse блокировка, а не ограничение общей конкурентности.

## Откат

- Отключить звонок пользователя: `GUEST_PORTAL_USER_CALL_ENABLED=false`, затем перезапустить `leetplus-api.service`.
- Отключить входящий звонок с 4 цифрами: `GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED=false`.
- Если SMS.ru `api_id` или provider callback скомпрометирован, заменить `GUEST_PORTAL_USER_CALL_SMS_RU_API_ID`, `GUEST_PORTAL_USER_CALL_SECRET` или `GUEST_PORTAL_INCOMING_CALL_LAST4_TOKEN` на VDS и перезапустить API.
- `/game/auth` автоматически откроет первый готовый канал из оставшихся: Telegram, user-call, SMS или incoming-call-last4.

## Инварианты

- Публичная регистрация не создает общий `Guest`.
- Сырой телефон не возвращается в браузер.
- Секреты provider-ов, SMS.ru `api_id`, номера callback, endpoint token и Langame payload не попадают в readiness, audit и frontend.
- Связка с общей базой гостей появляется только через подтвержденный `phoneHash` и сохраненный Langame snapshot.
- Ни один guest-auth request не выполняет глобальный `updateMany` по challenge других пользователей.
- Ограничения, cookie и guard корпоративного входа не применяются к public guest-auth routes.
