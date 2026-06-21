# Summary: Telegram bot и Mini App на 1337

Актуальное состояние после переноса: см. `CURRENT_1337_HANDOFF.md`.

## Главное

Telegram bot и Mini App вынесены на отдельный edge-сервер 1337:

- domain: `https://tg.leetplus.ru`
- public IP: `188.234.220.76`
- project root: `/srv/leetplus-telegram-edge`
- compose: `/srv/leetplus-telegram-edge/docker-compose.yml`
- secrets env: `/srv/leetplus-telegram-edge/secrets/telegram-edge.env`
- runtime data: `/srv/leetplus-telegram-edge/data`

Используется Telegram long polling, не webhook. Telegram webhook должен быть пустым. Poller сам делает `deleteWebhook(drop_pending_updates=false)` на старте.

## Что работает на 1337

- `telegram-poller` получает updates через Telegram `getUpdates`.
- `telegram-edge` пересылает updates в основной LeetPlus API и отправляет replies в Telegram только как fallback, если основной API вернул safe `reply` payload.
- `telegram-mini-app-web` обслуживает Mini App `/game/app`.
- `/api/guest-portal/*` на edge проксирует Mini App API-запросы в основной API.
- `bot-consumer` опционален и пока должен оставаться в dry-run.

## ТЗ текущего Telegram UX

- На сайте `/game/auth` и `/play` у гостя одна кнопка `Войти через Telegram`: перед переходом показывается информационное окно с `Продолжить` и `Другой способ входа`.
- После `Продолжить` сайт создает challenge, открывает deep link Telegram и poll-ит статус; отдельную вторую кнопку `Открыть бота` не показывать.
- После contact-share основной API возвращает edge не принудительную Mini App кнопку, а inline-выбор `Вернуться на сайт LeetPlus`, `Открыть Mini App`, `Продолжить в боте`.
- Edge 1337 не должен хардкодить старую Mini App клавиатуру: он использует `replyMarkup` из основного API как opaque JSON. При API-side отправке основной API возвращает `replyDispatch=SENT` без `reply` payload, поэтому edge не дублирует отправку.
- Mini App на `https://tg.leetplus.ru/game/app` остается отдельным вариантом продолжения, пока основной сайт завершает авторизацию через browser status endpoint и HttpOnly guest-token.

## Что остается на основной VDS

- LeetPlus API и база данных.
- Бизнес-логика Telegram auth.
- `/guest-portal/telegram/webhook` как внутренний API endpoint для edge adapter.
- Guest-token/session выдача.
- `GET /guest-portal/session/game-summary`.
- Guest Game Hub readiness и аудит.

Основная VDS отправляет Telegram replies напрямую: `GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED=true`. Edge 1337 остается polling adapter-ом и fallback sender-ом.

## Env основной VDS

```env
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED=true
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN=<telegram-bot-token>
GUEST_GAME_TELEGRAM_MINI_APP_URL=https://tg.leetplus.ru/game/app
GUEST_GAME_TELEGRAM_BOT_USERNAME=leetplusru_bot
GUEST_GAME_TG_EDGE_SHARED_SECRET=<same-as-edge>
GUEST_GAME_TELEGRAM_WEBHOOK_SECRET=<same-as-edge-update-secret>
```

## Env 1337

```env
API_URL=https://api.leetplus.ru
NEXT_PUBLIC_API_URL=https://api.leetplus.ru

GUEST_GAME_TG_EDGE_DRY_RUN=false
GUEST_GAME_TG_EDGE_BOT_TOKEN=<secret>
GUEST_GAME_TG_EDGE_WEBHOOK_SECRET=<secret>
GUEST_GAME_TG_EDGE_SHARED_SECRET=<secret>
GUEST_GAME_TG_EDGE_TELEGRAM_API_BASE_URL=https://api.telegram.org

GUEST_GAME_TG_EDGE_POLLING_DELETE_WEBHOOK_ON_START=true
GUEST_GAME_TG_EDGE_POLLING_DROP_PENDING_UPDATES=false
GUEST_GAME_TG_EDGE_POLLING_TIMEOUT_SECONDS=50
GUEST_GAME_TG_EDGE_POLLING_LIMIT=100
GUEST_GAME_TG_EDGE_POLLING_ALLOWED_UPDATES=message,edited_message,callback_query
GUEST_GAME_TG_EDGE_POLLING_STATE_PATH=/app/data/telegram-poller-state.json
GUEST_GAME_TG_EDGE_POLLING_RETRY_DELAY_MS=5000

GUEST_GAME_BOT_CONSUMER_DRY_RUN=true
```

Реальные значения брать только с серверов, не из чата.

## Sync token и tenant для bot-consumer

`sync token` берется с основной LeetPlus VDS/API, не с 1337 и не из Langame. Это значение `SYNC_SERVICE_TOKEN`, которым защищены:

- `POST /guests/gamification/scheduled/deliveries/bot/pull`
- `POST /guests/gamification/scheduled/deliveries/bot/ack`

На edge VDS:

```env
GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN=<значение SYNC_SERVICE_TOKEN с основной VDS>
```

`tenant slug/id` берется из основной базы LeetPlus, таблица `Tenant`:

```env
GUEST_GAME_BOT_CONSUMER_TENANT_SLUG=<tenant.slug>
```

Подробно: `SYNC_TOKEN_TENANT_HANDOFF.md`.

## Проверка

```bash
cd /srv/leetplus-telegram-edge
docker compose ps
docker compose logs --tail=120 telegram-poller
docker compose logs --tail=80 telegram-edge
docker compose logs --tail=80 telegram-mini-app-web
./telegram-webhook-remote.sh info
./check-nginx-https-site.sh
```

Ожидаемо:

- webhook `url=-`
- `pending_update_count=0` или небольшое число
- `https_game_app_http=200`
- `https_webhook_wrong_secret_http=401`
- `https_root_http=404`

Mini App API proxy:

```bash
curl -ksS -o /dev/null -w 'HTTP:%{http_code}:BYTES:%{size_download}\n' \
  https://tg.leetplus.ru/api/guest-portal/gamification/clubs
```

Ожидаемо: `HTTP:200`.

Финальный canary в Telegram:

```text
TELEGRAM_AUTH_START status=AWAITING_CONTACT replySent=true
TELEGRAM_AUTH_CONTACT status=CONFIRMED replySent=true
```

После contact-share в самом Telegram должно быть видно три варианта продолжения, а не только `Открыть Mini App`.

## Правила

- Не включать Telegram webhook, пока используется polling.
- Запускать ровно один `telegram-poller` на bot token.
- Не коммитить `.env`, bot token, sync token, SSH credentials.
- `bot-consumer` держать в dry-run до отдельного live-решения.
- После каждого обновления проверять Telegram canary.
- Telegram bot token лучше перевыпустить, если он светился в чате.
