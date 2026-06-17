# Fallback-вход в геймификацию

Этот runbook описывает резервные каналы авторизации участника геймификации на `/play`: звонок пользователя на номер и входящий звонок с последними 4 цифрами. Основной канал остается Telegram-бот с contact-share; fallback нужен, чтобы не останавливать регистрацию при временно неготовом Telegram или высокой цене SMS.

## Приоритет каналов

1. Telegram-бот: основной путь для регистрации, уведомлений, рефералок и возврата гостей.
2. Звонок пользователя на номер: дешевый и понятный fallback.
3. SMS-код: обязательный резерв, но не основной канал из-за цены и риска накрутки.
4. Входящий звонок с последними 4 цифрами: поздний резерв, подключать после стабилизации первых трех каналов.

## Звонок пользователя на номер

Контур: `/play` создает `USER_CALL` challenge, гость звонит с введенного телефона на настроенный номер, внешний call-provider подтверждает caller id через защищенный callback, LeetPlus выдает guest-token и активирует отдельный `GuestGameProfile`.

Env на VDS:

```env
GUEST_PORTAL_USER_CALL_ENABLED="true"
GUEST_PORTAL_USER_CALL_PHONE_NUMBER="<public-phone-number>"
GUEST_PORTAL_USER_CALL_SECRET="<provider-callback-secret>"
```

Provider callback:

```http
POST /guest-portal/user-call/confirm
x-guest-portal-user-call-secret: <provider-callback-secret>
```

Callback должен передавать номер звонящего только backend-у LeetPlus. Frontend получает только статус, маски и safe local match; raw phone, callback secret и Langame payload не возвращаются в браузер.

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
2. Настроить `USER_CALL` env, перезапустить API и проверить readiness `Звонок пользователя для входа` в Guest Game Hub.
3. Выполнить QA: открыть `/play`, выбрать клуб 1337, выбрать звонок пользователя, ввести телефон, позвонить на публичный номер, отправить provider callback и дождаться guest-token.
4. Проверить, что создан или переиспользован отдельный `GuestGameProfile`, общий `Guest` публичной регистрацией не создан, а status response содержит только safe match/backfill.
5. SMS держать как резервный канал после user-call.
6. `INCOMING_CALL_LAST4` включать только после выбора provider-а исходящих звонков и отдельного теста блокировок: `NOT_CONFIGURED`, `BLOCKED`, успешный verify.
7. В Guest Game Hub проверить readiness `USER_CALL_AUTH` и `INCOMING_CALL_LAST4_AUTH`: карточки должны показывать только наличие env, required env и QA-шаг, без номера, endpoint, token, raw phone и Langame payload.

## Откат

- Отключить звонок пользователя: `GUEST_PORTAL_USER_CALL_ENABLED=false`, затем перезапустить `leetplus-api.service`.
- Отключить входящий звонок с 4 цифрами: `GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED=false`.
- Если provider callback скомпрометирован, заменить `GUEST_PORTAL_USER_CALL_SECRET` или `GUEST_PORTAL_INCOMING_CALL_LAST4_TOKEN` на VDS и перезапустить API.
- `/play` автоматически откроет первый готовый канал из оставшихся: Telegram, user-call, SMS или incoming-call-last4.

## Инварианты

- Публичная регистрация не создает общий `Guest`.
- Сырой телефон не возвращается в браузер.
- Секреты provider-ов, номера callback, endpoint token и Langame payload не попадают в readiness, audit и frontend.
- Связка с общей базой гостей появляется только через подтвержденный `phoneHash` и сохраненный Langame snapshot.
