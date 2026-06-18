# Summary: перенос Telegram-бота и Mini App на отдельную VDS

Цель: вынести весь Telegram-facing контур с основной РФ VDS на отдельную edge VDS, чтобы Telegram Bot API, webhook и Mini App работали через новый сервер и proxy, а основная VDS оставалась только источником бизнес-логики LeetPlus.

## Что переезжает на новую VDS

- Публичный Telegram webhook: `https://<tg-edge-domain>/tg/webhook`.
- Отправка ответов бота в Telegram: `request_contact`, финальное сообщение и кнопка `web_app`.
- Публичный Telegram Mini App route: `https://<tg-edge-domain>/game/app`.
- Web proxy Mini App: `/api/guest-portal/*`.
- Telegram Bot API/proxy base URL для `sendMessage` и `setWebhook`.
- Опционально: `guest-game:bot-consumer` для наградных Telegram-сообщений из outbox.

## Что остается на основной VDS

- Backend/API LeetPlus и база данных.
- Бизнес-логика `/guest-portal/telegram/webhook`.
- Создание и проверка Telegram auth challenge.
- Выпуск `leetplus_guest_token`.
- `GET /guest-portal/session/game-summary`.
- Guest Game Hub readiness, аудит, игровые профили и вся доменная логика.

Основная VDS не должна отправлять сообщения в Telegram в новой схеме: `GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED=false`.

## Схема работы

1. Telegram отправляет webhook на edge VDS: `/tg/webhook`.
2. Edge adapter проверяет Telegram webhook secret и пересылает update в основной API.
3. Основной API возвращает только безопасный `reply` payload.
4. Edge adapter отправляет `sendMessage` через Telegram Bot API proxy/base URL.
5. Mini App открывается на edge VDS по `/game/app`.
6. Edge web валидирует Telegram `initData` локально по bot token.
7. В основной API уходит только `telegramUserId/authDate` и header `x-guest-game-telegram-edge-secret`.
8. Основной API выдает обычную guest-session и summary.

## Ключевые файлы

- `docs/deployment/telegram-edge-vds/README.md` - полный runbook.
- `docs/deployment/telegram-edge-vds/telegram-edge.env.example` - env template для `/etc/leetplus/telegram-edge.env`.
- `docs/deployment/telegram-edge-vds/leetplus-telegram-edge.service` - systemd service webhook adapter.
- `docs/deployment/telegram-edge-vds/leetplus-telegram-mini-app-web.service` - systemd service Mini App web.
- `docs/deployment/telegram-edge-vds/nginx-telegram-edge.conf.example` - nginx allowlist.

## Env на основной VDS

```env
GUEST_GAME_TELEGRAM_BOT_USERNAME=<bot_username_without_at>
GUEST_GAME_TELEGRAM_LINK_SECRET=<existing-link-secret>
GUEST_GAME_TELEGRAM_WEBHOOK_SECRET=<same-secret-as-edge-webhook-secret>
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED=false
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN=
GUEST_GAME_TELEGRAM_MINI_APP_URL=https://<tg-edge-domain>/game/app
GUEST_GAME_TG_EDGE_SHARED_SECRET=<long-random-shared-secret>
```

`GUEST_GAME_TG_EDGE_SHARED_SECRET` должен отличаться от bot token и webhook secret.

## Env на новой edge VDS

```env
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1

API_URL=https://api.leetplus.ru
NEXT_PUBLIC_API_URL=https://api.leetplus.ru

GUEST_GAME_TG_EDGE_HOST=127.0.0.1
GUEST_GAME_TG_EDGE_PORT=4010
GUEST_GAME_TG_EDGE_LEETPLUS_API_URL=https://api.leetplus.ru
GUEST_GAME_TG_EDGE_LEETPLUS_WEBHOOK_PATH=/guest-portal/telegram/webhook
GUEST_GAME_TG_EDGE_WEBHOOK_SECRET=<same-secret-as-main-api>
GUEST_GAME_TG_EDGE_BOT_TOKEN=<telegram-bot-token>
GUEST_GAME_TG_EDGE_SHARED_SECRET=<same-shared-secret-as-main-api>
GUEST_GAME_TG_EDGE_TELEGRAM_API_BASE_URL=<telegram-bot-api-proxy-or-https://api.telegram.org>
GUEST_GAME_TG_EDGE_DRY_RUN=true
GUEST_GAME_TG_EDGE_REQUEST_TIMEOUT_MS=15000
GUEST_GAME_TG_EDGE_HEALTH_SECRET=<optional-health-secret>

TG_EDGE_WEB_HOST=127.0.0.1
TG_EDGE_WEB_PORT=3100
```

Для outbox consumer на той же VDS:

```env
GUEST_GAME_BOT_CONSUMER_API_URL=https://api.leetplus.ru
GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN=<sync-service-token>
GUEST_GAME_BOT_CONSUMER_TENANT_SLUG=<tenant-slug>
GUEST_GAME_BOT_CONSUMER_CHANNELS=TELEGRAM
GUEST_GAME_BOT_CONSUMER_DRY_RUN=true
GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN=<telegram-bot-token>
GUEST_GAME_BOT_CONSUMER_TELEGRAM_API_BASE_URL=<telegram-bot-api-proxy-or-https://api.telegram.org>
```

## Откуда брать sync token и tenant slug/id

`sync token` берется с основной LeetPlus VDS/API, не с 1337 и не из Langame. Это значение `SYNC_SERVICE_TOKEN`, которым защищены служебные endpoints:

- `POST /guests/gamification/scheduled/deliveries/bot/pull`;
- `POST /guests/gamification/scheduled/deliveries/bot/ack`.

На edge VDS его нужно положить так:

```env
GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN=<значение SYNC_SERVICE_TOKEN с основной VDS>
```

Если на основной VDS токена еще нет, сгенерировать его:

```bash
openssl rand -hex 32
```

Затем прописать одно и то же значение:

- на основной VDS/API как `SYNC_SERVICE_TOKEN`;
- на edge VDS в `/srv/leetplus-telegram-edge/secrets/telegram-edge.env` как `GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN`.

`tenant slug/id` берется из основной базы LeetPlus, таблица `Tenant`. Обычно удобнее использовать slug:

```env
GUEST_GAME_BOT_CONSUMER_TENANT_SLUG=<tenant.slug>
```

Как найти значения на основной VDS:

```bash
# env основного API
grep -R "^SYNC_SERVICE_TOKEN=" /srv /etc 2>/dev/null

# tenant slug/id через БД, если есть доступ к Postgres
psql "$DATABASE_URL" -c 'select id, slug, name, status from "Tenant";'
```

Если основной API запущен в Docker:

```bash
docker compose exec backend printenv SYNC_SERVICE_TOKEN
```

Коротко: `SYNC_SERVICE_TOKEN` - секрет основного LeetPlus API; `tenant slug/id` - запись клуба/тенанта в основной БД LeetPlus. На edge VDS эти значения только копируются.

## Сервисы на новой VDS

Запускаются только edge-процессы:

```bash
sudo systemctl enable --now leetplus-telegram-edge.service
sudo systemctl enable --now leetplus-telegram-mini-app-web.service
```

Основной LeetPlus backend, база данных, sync workers и Langame-интеграции на edge VDS не запускаются.

## Nginx allowlist

На edge-домене открываются только:

- `POST /tg/webhook`;
- `GET /health`, если нужен health check;
- `GET /game/app`;
- `/_next/*`;
- `/api/guest-portal/*`;
- `/favicon.ico`.

Все остальные пути должны возвращать `404`.

## Telegram webhook

Webhook ставится на edge URL:

```bash
curl -X POST "<telegram-bot-api-base>/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<tg-edge-domain>/tg/webhook" \
  -d "secret_token=<GUEST_GAME_TG_EDGE_WEBHOOK_SECRET>" \
  -d "drop_pending_updates=true"
```

Если используется Telegram Bot API proxy, `<telegram-bot-api-base>` должен быть proxy base URL, который сохраняет путь `/bot<TOKEN>/<method>`.

## Проверка перед live

1. Edge env настроен, `GUEST_GAME_TG_EDGE_DRY_RUN=true`.
2. `curl -i https://<tg-edge-domain>/health`.
3. `curl -i https://<tg-edge-domain>/game/app`.
4. Telegram webhook установлен на `https://<tg-edge-domain>/tg/webhook`.
5. Пройти `/game/auth -> Telegram -> contact-share`.
6. В journal adapter должны появиться dry-run записи без raw chat id/update.
7. После проверки поставить `GUEST_GAME_TG_EDGE_DRY_RUN=false` и перезапустить adapter.
8. Повторить canary: бот должен отправить кнопку Mini App, Mini App должна открыть `/game/app` и получить guest-session.

## Rollback

- Поставить `GUEST_GAME_TG_EDGE_DRY_RUN=true`.
- Перезапустить `leetplus-telegram-edge.service`.
- Удалить webhook или вернуть его на старый endpoint.
- На основной VDS временно убрать `GUEST_GAME_TELEGRAM_MINI_APP_URL`, чтобы `/play` и `/play/game` оставались fallback.
- Остановить edge services:

```bash
sudo systemctl disable --now leetplus-telegram-edge.service leetplus-telegram-mini-app-web.service
```

## Инварианты безопасности

- Bot token хранится только на edge VDS.
- Реальный `/etc/leetplus/telegram-edge.env` не коммитится.
- Raw Telegram update, raw chat id, raw phone, bot token и Langame payload не логируются.
- Основная VDS не отправляет Telegram replies напрямую.
- Edge shared secret не совпадает с Telegram bot token и webhook secret.
- Edge-домен не должен раскрывать основной LeetPlus web/admin UI.
