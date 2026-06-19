# VDS bot-consumer для геймификации

Эти шаблоны подключают внешний `guest-game:bot-consumer` к systemd. Runner забирает готовые `READY_FOR_BOT` доставки из LeetPlus API, в real-mode отправляет Telegram-сообщения или MAX-сообщения через отдельно настроенный generic provider endpoint и пишет ack обратно в LeetPlus. По умолчанию все настроено в dry-run, чтобы первый запуск ничего не отправлял гостям.

## Файлы

- `leetplus-guest-game-bot-consumer.env.example` - пример `/etc/leetplus/guest-game-bot-consumer.env`.
- `leetplus-guest-game-bot-consumer.service` - одноразовый systemd unit для одного tick consumer.
- `leetplus-guest-game-bot-consumer.timer` - периодический запуск unit без постоянного фонового процесса.

## Установка на VDS

```bash
cd /home/admin/leetplus

sudo install -d -m 0750 /etc/leetplus
sudo cp docs/deployment/systemd/leetplus-guest-game-bot-consumer.env.example /etc/leetplus/guest-game-bot-consumer.env
sudo chmod 0600 /etc/leetplus/guest-game-bot-consumer.env
sudo nano /etc/leetplus/guest-game-bot-consumer.env

sudo cp docs/deployment/systemd/leetplus-guest-game-bot-consumer.service /etc/systemd/system/
sudo cp docs/deployment/systemd/leetplus-guest-game-bot-consumer.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

В `/etc/leetplus/guest-game-bot-consumer.env` нужно заполнить:

- `GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN` - значение `SYNC_SERVICE_TOKEN` с основной LeetPlus VDS/API, не из Langame/1337. Этот token защищает `POST /guests/gamification/scheduled/deliveries/bot/pull` и `/ack`; если его еще нет на основной VDS, сгенерировать `openssl rand -hex 32` и прописать одинаковое значение в основном API как `SYNC_SERVICE_TOKEN`, а на edge/VDS consumer как `GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN`.
- `GUEST_GAME_BOT_CONSUMER_TENANT_SLUG` или `GUEST_GAME_BOT_CONSUMER_TENANT_ID` - значение из основной базы LeetPlus, таблица `Tenant`; обычно удобнее использовать `tenant.slug`.
- `GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN`.
- `GUEST_GAME_BOT_CONSUMER_TELEGRAM_API_BASE_URL` - `https://api.telegram.org` или base URL Bot API proxy, сохраняющий путь `/bot<TOKEN>/<method>`.
- Для MAX только после подтверждения provider-контракта: `GUEST_GAME_BOT_CONSUMER_MAX_DELIVERY_ENDPOINT` и `GUEST_GAME_BOT_CONSUMER_MAX_BOT_TOKEN`. Endpoint должен принимать `POST` JSON с recipient identity, delivery/reward metadata и текстом сообщения, а токен передается как `Authorization: Bearer ...`.

## Безопасный запуск

1. Оставить `GUEST_GAME_BOT_CONSUMER_DRY_RUN=true`, `GUEST_GAME_BOT_CONSUMER_MAX_TICKS=1` и `GUEST_GAME_BOT_CONSUMER_CHANNELS=TELEGRAM`.
2. Сделать ручной smoke-run:

```bash
sudo systemctl start leetplus-guest-game-bot-consumer.service
sudo journalctl -u leetplus-guest-game-bot-consumer.service -n 100 --no-pager
```

В dry-run consumer должен выполнить pull, но не отправлять Telegram и не писать ack.

3. После проверки включить timer:

```bash
sudo systemctl enable --now leetplus-guest-game-bot-consumer.timer
systemctl list-timers leetplus-guest-game-bot-consumer.timer
```

4. Для canary real-send поставить `GUEST_GAME_BOT_CONSUMER_DRY_RUN=false` и временно `GUEST_GAME_BOT_CONSUMER_LIMIT=1`, затем до запуска проверить карточку `VDS bot-consumer` в Guest Game Hub: блок `Первые к отправке` должен показывать ровно одного безопасного кандидата без raw phone/chat id/MAX identity. После ручного запуска service должны появиться реальные `GuestGameDeliveryEvent` `SENT` или безопасные `FAILED/BLOCKED`. До первого сохраненного ack карточка намеренно показывает `нужен canary LIMIT=1` и блокирует readiness real-send, если лимит не равен `1`. В journal итоговая строка содержит `acked` и `idempotentAcks`; ненулевой `idempotentAcks` означает, что LeetPlus принял повторный terminal ack как безопасный дубль без нового события.
5. Rollback: вернуть `GUEST_GAME_BOT_CONSUMER_DRY_RUN=true` или остановить timer командой `sudo systemctl disable --now leetplus-guest-game-bot-consumer.timer`.

## Ограничения

- Не коммитить реальный `/etc/leetplus/guest-game-bot-consumer.env`.
- На Telegram edge VDS можно использовать тот же Bot API proxy/base URL, что и для `leetplus-telegram-edge.service`.
- До подтвержденного MAX provider endpoint оставлять `GUEST_GAME_BOT_CONSUMER_CHANNELS=TELEGRAM`. Для MAX real-send одновременно нужны `GUEST_GAME_BOT_CONSUMER_CHANNELS=MAX`, `GUEST_GAME_BOT_CONSUMER_MAX_DELIVERY_ENDPOINT`, `GUEST_GAME_BOT_CONSUMER_MAX_BOT_TOKEN`, `GUEST_GAME_BOT_CONSUMER_DRY_RUN=false` и canary `GUEST_GAME_BOT_CONSUMER_LIMIT=1`.
- Этот runbook относится к внешнему VDS consumer. Если MAX отправляется внутренним API dispatcher-ом Guest Game Hub, дополнительно нужен отдельный `GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED=true`; одни endpoint/token не запускают provider-вызов.
- Cadence задает systemd timer, поэтому `GUEST_GAME_BOT_CONSUMER_INTERVAL_MS` в env-шаблоне намеренно пустой.
- Unit принудительно использует one-shot режим через `GUEST_GAME_BOT_CONSUMER_MAX_TICKS=1`, чтобы restart/deploy не создавал бесконечный процесс.
