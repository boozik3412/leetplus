# Fallback-вход в геймификацию

Этот runbook описывает резервные каналы авторизации участника геймификации на `/play`: звонок пользователя на номер и входящий звонок с последними 4 цифрами. Основной канал остается Telegram-бот с contact-share; fallback нужен, чтобы не останавливать регистрацию при временно неготовом Telegram или высокой цене SMS.

## Приоритет каналов

1. Telegram-бот: основной путь для регистрации, уведомлений, рефералок и возврата гостей.
2. Звонок пользователя на номер: дешевый и понятный fallback.
3. SMS-код: обязательный резерв, но не основной канал из-за цены и риска накрутки.
4. Входящий звонок с последними 4 цифрами: поздний резерв, подключать после стабилизации первых трех каналов.

## Звонок пользователя на номер

Контур с SMS.ru Callcheck: `/play` создает `USER_CALL` challenge, LeetPlus запрашивает у SMS.ru временный номер через `callcheck/add`, гость звонит на этот номер с введенного телефона, а browser status endpoint polling-ом проверяет `callcheck/status` по сохраненному `check_id`. Провайдер сбрасывает вызов после проверки, поэтому звонок для гостя бесплатный; API возвращает `freeCall=true`, а frontend показывает нейтральное сообщение `Звонок будет сброшен сразу после проверки` рядом с методом входа. После подтверждения LeetPlus выдает guest-token и активирует отдельный `GuestGameProfile` без callback от администратора.

Env на VDS для SMS.ru:

```env
GUEST_PORTAL_USER_CALL_ENABLED="true"
GUEST_PORTAL_USER_CALL_PROVIDER="SMS_RU_CALLCHECK"
GUEST_PORTAL_USER_CALL_SMS_RU_API_ID="<sms-ru-api-id>"
GUEST_PORTAL_USER_CALL_SMS_RU_BASE_URL="https://sms.ru"
```

`GUEST_PORTAL_USER_CALL_SMS_RU_API_ID` хранится только в production env. Не коммитить реальное значение в `.env.example`, runbook или issue.

Ручной callback-provider остается совместимым контуром: `/play` создает `USER_CALL` challenge, гость звонит с введенного телефона на настроенный номер, внешний call-provider подтверждает caller id через защищенный callback.

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

## SMS-код

SMS-код остается резервным каналом после Telegram-бота и звонка пользователя. Production-путь поддерживает SMS.ru `/sms/send`: backend отправляет код только при включенном real-send, не возвращает `api_id` и raw provider payload на frontend, а challenge хранит только статус доставки, маску телефона и hash кода.

Текущее production-состояние на 18.06.2026: публичный каталог `/guest-portal/gamification/clubs` показывает `SMS_CODE READY` без `requiredEnv`, а staged QA start endpoint по demo club возвращает безопасный `delivery.channel=SMS` и `status=SENT` provider-accepted результат. Это означает, что provider/env-gate закрыт для резервного staged-канала; перевод в live-рассылку без test-mode остается отдельным шагом после лимитов, антинакрутки и контроля бюджета.

Env на VDS для SMS.ru:

```env
GUEST_PORTAL_OTP_REAL_SEND_ENABLED="true"
GUEST_PORTAL_OTP_SMS_ENABLED="true"
GUEST_PORTAL_OTP_SMS_RU_API_ID="<sms-ru-api-id>"
GUEST_PORTAL_OTP_SMS_RU_BASE_URL="https://sms.ru"
GUEST_PORTAL_OTP_SMS_RU_TEST_MODE="false"
```

Если `GUEST_PORTAL_OTP_SMS_RU_API_ID` не задан, backend может переиспользовать `GUEST_PORTAL_USER_CALL_SMS_RU_API_ID` из Callcheck. Для staged QA можно временно включить `GUEST_PORTAL_OTP_SMS_RU_TEST_MODE=true`: SMS.ru примет запрос с `test=1`, но сообщение не будет отправлено и баланс не будет списан. Старый generic provider через `GUEST_PORTAL_OTP_SMS_ENDPOINT` + `GUEST_PORTAL_OTP_SMS_TOKEN` остается fallback-адаптером для другого SMS-шлюза.

Readiness `OTP_SMS` в Guest Game Hub должен показывать только безопасные признаки: real-send, флаг SMS-канала, provider `SMS.ru /sms/send` или generic fallback, `test=1` и наличие `api_id`/endpoint без самих значений. Если в карточке появляется raw `api_id`, endpoint, token, телефон или provider payload, запуск SMS-резерва нужно остановить до исправления.

## Входящий звонок с 4 цифрами

Контур: `/play` создает `INCOMING_CALL_LAST4` challenge, backend отправляет запрос call-provider, provider звонит гостю, гость вводит последние 4 цифры номера входящего звонка в `/play`, LeetPlus сверяет код и выдает guest-token.

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

1. Сначала включить Telegram-runbook и убедиться, что `/play` показывает Telegram первым.
2. Настроить `USER_CALL` env, перезапустить API и проверить readiness `Звонок пользователя для входа` в Guest Game Hub. Для текущего production-пути использовать SMS.ru Callcheck.
3. Выполнить QA: открыть `/play`, выбрать клуб 1337, выбрать звонок пользователя, ввести телефон, убедиться, что UI показывает нейтральное сообщение о сбросе звонка после проверки, позвонить на выданный номер и дождаться guest-token через polling status. Для ручного provider дополнительно отправить provider callback.
4. Проверить, что создан или переиспользован отдельный `GuestGameProfile`, общий `Guest` публичной регистрацией не создан, а status response содержит только safe match/backfill.
5. SMS держать как резервный канал после user-call: в staged/test-mode проверять provider acceptance и отсутствие утечек, а live-режим включать отдельно только после rate limits, anti-abuse guard и бюджетного контроля.
6. `INCOMING_CALL_LAST4` включать только после выбора provider-а исходящих звонков и отдельного теста блокировок: `NOT_CONFIGURED`, `BLOCKED`, успешный verify.
7. В Guest Game Hub проверить readiness `USER_CALL_AUTH` и `INCOMING_CALL_LAST4_AUTH`: карточки должны показывать только наличие env, required env и QA-шаг, без номера, endpoint, token, raw phone и Langame payload.

## Откат

- Отключить звонок пользователя: `GUEST_PORTAL_USER_CALL_ENABLED=false`, затем перезапустить `leetplus-api.service`.
- Отключить входящий звонок с 4 цифрами: `GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED=false`.
- Если SMS.ru `api_id` или provider callback скомпрометирован, заменить `GUEST_PORTAL_USER_CALL_SMS_RU_API_ID`, `GUEST_PORTAL_USER_CALL_SECRET` или `GUEST_PORTAL_INCOMING_CALL_LAST4_TOKEN` на VDS и перезапустить API.
- `/play` автоматически откроет первый готовый канал из оставшихся: Telegram, user-call, SMS или incoming-call-last4.

## Инварианты

- Публичная регистрация не создает общий `Guest`.
- Сырой телефон не возвращается в браузер.
- Секреты provider-ов, SMS.ru `api_id`, номера callback, endpoint token и Langame payload не попадают в readiness, audit и frontend.
- Связка с общей базой гостей появляется только через подтвержденный `phoneHash` и сохраненный Langame snapshot.
