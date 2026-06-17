# Telegram-вход в геймификацию

Этот runbook описывает production-запуск основного канала регистрации участника геймификации: `/play` -> Telegram-бот -> contact-share -> отдельный `GuestGameProfile` -> guest-token. Канал нужен не только для входа, но и для будущих уведомлений, рефералок и возврата гостей.

## Что делает контур

- `/play` создает одноразовый Telegram auth challenge для выбранного клуба и открывает deep link бота.
- Webhook LeetPlus принимает `/start lp_...`, переводит challenge в ожидание contact-share и возвращает safe `reply` payload.
- Бот просит гостя поделиться телефоном кнопкой `request_contact`.
- LeetPlus принимает только contact того же Telegram-пользователя, активирует или сливает отдельный `GuestGameProfile` по `phoneHash` и выдает guest-token через browser status endpoint.
- Общий `Guest` публичной регистрацией не создается; связь с Langame-гостем появляется через сохраненный snapshot и обычную guest foundation sync.
- Raw phone, raw chat id, raw Telegram update, bot token и Langame payload не возвращаются на frontend и не сохраняются в audit.

## Env на VDS

Минимальные переменные для публичного deep link и webhook:

```env
GUEST_GAME_TELEGRAM_BOT_USERNAME="<bot-username-without-@>"
GUEST_GAME_TELEGRAM_WEBHOOK_SECRET="<telegram-webhook-secret>"
WEB_URL="https://leetplus.ru"
API_URL="https://api.leetplus.ru"
```

Если сообщения отправляет внешний bot-adapter, LeetPlus оставляет API-side sender выключенным и только возвращает `reply` payload из `/guest-portal/telegram/webhook`.

Для прямой отправки ответов из LeetPlus API:

```env
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED="true"
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN="<telegram-bot-token>"
```

Вместо отдельного reply-token можно использовать уже согласованный `GUEST_GAME_TELEGRAM_BOT_TOKEN`. Секреты хранятся только на VDS и не попадают в репозиторий.

## Безопасный запуск

1. Настроить Telegram Bot API webhook на `https://api.leetplus.ru/guest-portal/telegram/webhook` с secret token из `GUEST_GAME_TELEGRAM_WEBHOOK_SECRET`.
2. Проверить в Guest Game Hub readiness `Telegram reply sender для входа`: webhook secret должен быть виден как настроенный, а sender может оставаться `adapter-only`, если сообщения отправляет внешний адаптер.
3. Если нужен API-side sender, включить `GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED=true`, добавить bot token и перезапустить API:

```bash
sudo systemctl restart leetplus-api.service
sudo journalctl -u leetplus-api.service -n 100 --no-pager
```

4. Открыть `https://leetplus.ru/play`, выбрать клуб 1337 или другой подключенный клуб, принять согласие и выбрать Telegram-бота.
5. В Telegram открыть deep link, отправить `/start lp_...`, затем поделиться контактом через кнопку Telegram. Contact должен принадлежать тому же Telegram-пользователю.
6. Вернуться на `/play`: status endpoint должен выдать guest-token, отдельный `GuestGameProfile`, safe local match и не создавать общий `Guest`.
7. В Guest Game Hub проверить readiness, отсутствие raw chat id/update/phone в ответах и возможность продолжить путь к квесту и bonus ledger.

## QA-чек

- Telegram остается первым вариантом входа в `/play`, даже если временно активен fallback.
- При `adapter-only` webhook возвращает `reply`, но LeetPlus сам не отправляет сообщение.
- При API-side sender ответ показывает только `replyDispatch`, маску chat id и missing env при ошибках.
- После `/start` гость получает запрос contact-share; после успешного contact-share клавиатура убирается.
- `GuestGameProfile` создается или переиспользуется по подтвержденному `phoneHash`, а общий `Guest` появляется только после snapshot-синхронизации.
- Реферальный `ref` передается в игровое событие только после успешной авторизации и не сохраняется как сырой код в публичном контуре.

## Откат

- Отключить прямую отправку из API: `GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED=false`, затем перезапустить `leetplus-api.service`.
- Вернуть внешний adapter-only режим: оставить webhook secret и bot username, но убрать reply-token из env API.
- Полностью остановить Telegram-вход: снять webhook у бота или убрать `GUEST_GAME_TELEGRAM_WEBHOOK_SECRET`; `/play` автоматически откроет первый готовый fallback, например звонок пользователя на номер или SMS.
- Подготовленные Telegram delivery-награды остаются отдельным outbox-контуром и не зависят от этого auth rollback.
