# Handoff summary: sync token и tenant для Telegram edge VDS

Этот summary нужен для переноса Telegram-бота и Mini App на отдельную VDS. Важно: `sync token` и `tenant slug/id` берутся из основного LeetPlus, не из 1337 и не из Langame.

## Sync token

`sync token` - это значение `SYNC_SERVICE_TOKEN` с основной LeetPlus VDS/API.

Этот token защищает служебные endpoints основного API:

- `POST /guests/gamification/scheduled/deliveries/bot/pull`
- `POST /guests/gamification/scheduled/deliveries/bot/ack`

На новой Telegram edge VDS его нужно положить в env как:

```env
GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN=<значение SYNC_SERVICE_TOKEN с основной VDS>
```

Обычно файл env на новой VDS:

```text
/srv/leetplus-telegram-edge/secrets/telegram-edge.env
```

Если на основной VDS `SYNC_SERVICE_TOKEN` еще нет, его можно сгенерировать:

```bash
openssl rand -hex 32
```

После генерации одно и то же значение нужно прописать:

```env
# основная LeetPlus VDS/API
SYNC_SERVICE_TOKEN=<generated-token>

# новая Telegram edge VDS
GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN=<generated-token>
```

Не генерировать отдельный token только на edge VDS: основной API должен знать тот же самый секрет.

## Tenant slug/id

`tenant slug/id` берется из основной базы LeetPlus, таблица `Tenant`.

Обычно удобнее использовать slug:

```env
GUEST_GAME_BOT_CONSUMER_TENANT_SLUG=<tenant.slug>
```

Если нужен id вместо slug:

```env
GUEST_GAME_BOT_CONSUMER_TENANT_ID=<tenant.id>
```

Для edge consumer достаточно указать один вариант: либо `GUEST_GAME_BOT_CONSUMER_TENANT_SLUG`, либо `GUEST_GAME_BOT_CONSUMER_TENANT_ID`.

## Как найти значения на основной VDS

Найти `SYNC_SERVICE_TOKEN` в env основного API:

```bash
grep -R "^SYNC_SERVICE_TOKEN=" /srv /etc 2>/dev/null
```

Посмотреть tenant slug/id через Postgres:

```bash
psql "$DATABASE_URL" -c 'select id, slug, name, status from "Tenant";'
```

Если основной API запущен в Docker:

```bash
docker compose exec backend printenv SYNC_SERVICE_TOKEN
```

## Итоговый env-фрагмент для новой Telegram edge VDS

```env
GUEST_GAME_BOT_CONSUMER_API_URL=https://api.leetplus.ru
GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN=<SYNC_SERVICE_TOKEN с основной LeetPlus VDS/API>
GUEST_GAME_BOT_CONSUMER_TENANT_SLUG=<tenant.slug из основной БД LeetPlus>
GUEST_GAME_BOT_CONSUMER_CHANNELS=TELEGRAM
GUEST_GAME_BOT_CONSUMER_DRY_RUN=true
GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN=<telegram-bot-token>
GUEST_GAME_BOT_CONSUMER_TELEGRAM_API_BASE_URL=<telegram-bot-api-proxy-or-https://api.telegram.org>
```

## Коротко

- `SYNC_SERVICE_TOKEN` - секрет основного LeetPlus API.
- `GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN` на edge VDS - копия этого же секрета.
- `tenant slug/id` - запись из основной БД LeetPlus, таблица `Tenant`.
- 1337/Langame не являются источником ни для `SYNC_SERVICE_TOKEN`, ни для tenant slug/id.
- Реальные значения не коммитить и не отправлять в чатах без защищенного канала.
