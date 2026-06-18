# Telegram-вход в геймификацию

Этот runbook описывает production-запуск основного канала регистрации участника геймификации: `/play` -> Telegram-бот -> contact-share -> отдельный `GuestGameProfile` -> guest-token. Из-за размещения основной VDS в РФ Telegram webhook, отправка сообщений и Mini App выносятся на отдельную не-РФ edge VDS. Детальный pack лежит в `docs/deployment/telegram-edge-vds`.

## Что делает контур

- `/play` создает одноразовый Telegram auth challenge для выбранного клуба и открывает deep link бота.
- Edge webhook `/tg/webhook` принимает update от Telegram, проверяет Telegram secret token и пересылает update в LeetPlus API.
- Webhook LeetPlus принимает `/start lp_...`, переводит challenge в ожидание contact-share и возвращает safe `reply` payload.
- Edge adapter отправляет safe reply в Telegram через Bot API/proxy: сначала кнопку `request_contact`, затем кнопку `Открыть Mini App`.
- LeetPlus принимает только contact того же Telegram-пользователя, активирует или сливает отдельный `GuestGameProfile` по `phoneHash`, выдает guest-token через browser status endpoint и возвращает кнопку `Открыть Mini App`.
- `/game/app` открывается на edge VDS, проверяет Telegram Mini App `initData` bot token-ом на edge, передает в основной API edge assertion по shared secret, получает обычную HttpOnly guest-session и читает существующий `GET /guest-portal/session/game-summary`.
- Общий `Guest` публичной регистрацией не создается; связь с Langame-гостем появляется через сохраненный snapshot и обычную guest foundation sync.
- Raw phone, raw chat id, raw Telegram update, bot token и Langame payload не возвращаются на frontend и не сохраняются в audit.

## Env на VDS

Минимальные переменные на основной VDS для публичного deep link, webhook-логики и edge assertion:

```env
GUEST_GAME_TELEGRAM_BOT_USERNAME="<bot-username-without-@>"
GUEST_GAME_TELEGRAM_WEBHOOK_SECRET="<telegram-webhook-secret>"
GUEST_GAME_TG_EDGE_SHARED_SECRET="<long-random-edge-shared-secret>"
GUEST_GAME_TELEGRAM_MINI_APP_URL="https://tg.leetplus.example/game/app"
WEB_URL="https://leetplus.ru"
API_URL="https://api.leetplus.ru"
```

На основной VDS нужно держать API-side sender выключенным. LeetPlus возвращает `reply` payload из `/guest-portal/telegram/webhook`, а отправляет его edge adapter.

Не включать на основной VDS:

```env
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED="false"
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN=""
```

Переменные на edge VDS описаны в `docs/deployment/telegram-edge-vds/telegram-edge.env.example`. На edge VDS должны жить реальные:

```env
GUEST_GAME_TG_EDGE_BOT_TOKEN="<telegram-bot-token>"
GUEST_GAME_TG_EDGE_WEBHOOK_SECRET="<telegram-webhook-secret>"
GUEST_GAME_TG_EDGE_SHARED_SECRET="<same-long-random-edge-shared-secret>"
GUEST_GAME_TG_EDGE_TELEGRAM_API_BASE_URL="https://api.telegram.org"
GUEST_GAME_TELEGRAM_MINI_APP_INIT_DATA_TTL_SECONDS="86400"
```

Если используется Bot API proxy, `GUEST_GAME_TG_EDGE_TELEGRAM_API_BASE_URL` указывает на proxy base URL, сохраняющий путь `/bot<TOKEN>/<method>`.

## Безопасный запуск

1. Поднять edge VDS по `docs/deployment/telegram-edge-vds/README.md`.
2. Настроить Telegram Bot API webhook на `https://tg.leetplus.example/tg/webhook` с secret token из `GUEST_GAME_TG_EDGE_WEBHOOK_SECRET`.
3. Проверить в Guest Game Hub readiness: `Telegram webhook consumer` должен видеть secret на основной VDS, `Telegram reply sender для входа` остается `adapter-only`, `Telegram Mini App` готов по edge assertion.
4. Перезапустить основной API после env:

```bash
sudo systemctl restart leetplus-api.service
sudo journalctl -u leetplus-api.service -n 100 --no-pager
```

5. Открыть `https://leetplus.ru/play`, выбрать клуб 1337 или другой подключенный клуб, принять согласие и выбрать Telegram-бота.
6. В Telegram открыть deep link, отправить `/start lp_...`, затем поделиться контактом через кнопку Telegram. Contact должен принадлежать тому же Telegram-пользователю.
7. После contact-share edge adapter должен показать кнопку `Открыть Mini App`; при нажатии открывается `https://tg.leetplus.example/game/app`.
8. Внутри Telegram Mini App edge web должен принять валидный `initData`, передать edge assertion в основной API, получить guest-session через HttpOnly cookie и загрузить клубную карту из `session/game-summary`.
9. Вернуться на `/play`: status endpoint также должен выдать guest-token, отдельный `GuestGameProfile`, safe local match и не создавать общий `Guest`.
10. В Guest Game Hub проверить readiness `Telegram Mini App`, отсутствие raw chat id/update/phone в ответах и возможность продолжить путь к квесту и bonus ledger.

## QA-чек

- Telegram остается первым вариантом входа в `/play`, даже если временно активен fallback.
- При `adapter-only` webhook возвращает `reply`, но LeetPlus сам не отправляет сообщение; отправка идет только с edge VDS.
- После `/start` гость получает запрос contact-share; после успешного contact-share бот предлагает кнопку `Открыть Mini App`.
- `/game/app` на edge VDS в обычном браузере без Telegram `initData` может открыть уже существующую guest-session, но полноценный Mini App вход требует Telegram WebView.
- Неверный `hash`, просроченный `auth_date` или Telegram-пользователь без подтвержденного `GuestGameProfile` не создают общий `Guest` и возвращают безопасный статус.
- `GuestGameProfile` создается или переиспользуется по подтвержденному `phoneHash`, а общий `Guest` появляется только после snapshot-синхронизации.
- Реферальный `ref` передается в игровое событие только после успешной авторизации и не сохраняется как сырой код в публичном контуре.

## Откат

- Остановить edge adapter: `sudo systemctl disable --now leetplus-telegram-edge.service`.
- Удалить webhook у Telegram или вернуть на старый временный endpoint.
- Отключить Mini App кнопку: убрать `GUEST_GAME_TELEGRAM_MINI_APP_URL` или временно вернуть текст reply без `web_app` в адаптере; `/play/game` остается совместимым web-экраном.
- Полностью остановить Telegram-вход: снять webhook у бота или убрать `GUEST_GAME_TELEGRAM_WEBHOOK_SECRET`; `/play` автоматически откроет первый готовый fallback, например звонок пользователя на номер или SMS.
- Подготовленные Telegram delivery-награды остаются отдельным outbox-контуром и не зависят от этого auth rollback.
