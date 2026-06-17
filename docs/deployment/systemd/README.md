# VDS bot-consumer для геймификации

Эти шаблоны подключают внешний `guest-game:bot-consumer` к systemd. Runner забирает готовые `READY_FOR_BOT` доставки из LeetPlus API, в real-mode отправляет Telegram-сообщения и пишет ack обратно в LeetPlus. По умолчанию все настроено в dry-run, чтобы первый запуск ничего не отправлял гостям.

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

- `GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN` - тот же service token, который защищает scheduled endpoints, или оставить пустым, если token уже передается как `SYNC_SERVICE_TOKEN` в окружении unit.
- `GUEST_GAME_BOT_CONSUMER_TENANT_SLUG` или `GUEST_GAME_BOT_CONSUMER_TENANT_ID`.
- `GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN`.

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

4. Для canary real-send поставить `GUEST_GAME_BOT_CONSUMER_DRY_RUN=false` и временно `GUEST_GAME_BOT_CONSUMER_LIMIT=1`, затем запустить service вручную и проверить карточку `VDS bot-consumer` в Guest Game Hub: должны появиться реальные `GuestGameDeliveryEvent` `SENT` или безопасные `FAILED/BLOCKED`. В journal итоговая строка содержит `acked` и `idempotentAcks`; ненулевой `idempotentAcks` означает, что LeetPlus принял повторный terminal ack как безопасный дубль без нового события.
5. Rollback: вернуть `GUEST_GAME_BOT_CONSUMER_DRY_RUN=true` или остановить timer командой `sudo systemctl disable --now leetplus-guest-game-bot-consumer.timer`.

## Ограничения

- Не коммитить реальный `/etc/leetplus/guest-game-bot-consumer.env`.
- До подтвержденного MAX API-контракта оставлять `GUEST_GAME_BOT_CONSUMER_CHANNELS=TELEGRAM`; real-send для `MAX` в runner заблокирован.
- Cadence задает systemd timer, поэтому `GUEST_GAME_BOT_CONSUMER_INTERVAL_MS` в env-шаблоне намеренно пустой.
- Unit принудительно использует one-shot режим через `GUEST_GAME_BOT_CONSUMER_MAX_TICKS=1`, чтобы restart/deploy не создавал бесконечный процесс.
