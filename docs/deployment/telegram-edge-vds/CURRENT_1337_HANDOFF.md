# LeetPlus Telegram bot + Mini App on 1337: update handoff

## Текущее состояние

Telegram bot и Mini App перенесены на сервер 1337.

Новый edge-сервер:

- public IP: `188.234.220.76`
- project root: `/srv/leetplus-telegram-edge`
- compose: `/srv/leetplus-telegram-edge/docker-compose.yml`
- secrets env: `/srv/leetplus-telegram-edge/secrets/telegram-edge.env`
- runtime data: `/srv/leetplus-telegram-edge/data`
- domain: `https://tg.leetplus.ru`

Основной LeetPlus API остается на основной VDS:

- API URL: `https://api.leetplus.ru`
- основная бизнес-логика Telegram auth остается в основном API
- edge только принимает/поллит Telegram updates, проксирует Mini App и отправляет ответы в Telegram

Важно: используется polling, не webhook. Telegram webhook должен быть пустым. Poller сам делает `deleteWebhook(drop_pending_updates=false)` на старте.

## Сервисы на 1337

```bash
cd /srv/leetplus-telegram-edge
docker compose ps
```

Ожидаемые сервисы:

- `telegram-edge` - edge adapter, порт 4010 локально
- `telegram-mini-app-web` - Next.js Mini App, порт 3100 локально
- `telegram-poller` - Telegram long polling
- `bot-consumer` - optional, profile `consumer`, сейчас не live

Проверенный финальный canary уже прошел:

- `TELEGRAM_AUTH_START status=AWAITING_CONTACT replySent=true`
- `TELEGRAM_AUTH_CONTACT status=CONFIRMED replySent=true`

Актуальное UX-ТЗ для следующей проверки: после contact-share бот больше не должен показывать только `Открыть Mini App`. Основной API возвращает `replyMarkup` с выбором `Вернуться на сайт LeetPlus`, `Открыть Mini App`, `Продолжить в боте`, а edge 1337 отправляет этот payload без собственной продуктовой логики.

## Локальные исходники

Основной локальный repo:

```text
C:\Users\ALIENWARE\Desktop\leetplus
```

Admin/deploy repo:

```text
C:\Users\ALIENWARE\Desktop\server-admin-codex
```

Важные файлы:

```text
apps/api/src/guest-portal/telegram-edge-poller.cli.ts
apps/api/src/guest-portal/telegram-edge-adapter.ts
apps/api/src/guest-portal/guest-portal.service.ts
apps/api/package.json
apps/web/src/app/game/app/telegram-mini-app-client.tsx
deploy/leetplus-telegram-edge/docker-compose.yml
deploy/leetplus-telegram-edge/telegram-edge.env.template
deploy/leetplus-telegram-edge/OPERATIONS.md
```

## Как обновлять bot / Mini App

1. Править код локально в:

```text
C:\Users\ALIENWARE\Desktop\leetplus
```

2. Проверить build локально:

```powershell
node C:\Users\ALIENWARE\Desktop\leetplus\.codex-tools\node_modules\pnpm\bin\pnpm.cjs --filter api build
node C:\Users\ALIENWARE\Desktop\leetplus\.codex-tools\node_modules\pnpm\bin\pnpm.cjs --filter web build
```

3. Собрать архив исходников без секретов:

- исключить `.git`, `node_modules`, `.next`, `dist`, `.env*`, логи, кеши
- не класть реальные токены в архив

4. На 1337 перед заменой сделать backup:

```bash
cd /srv/leetplus-telegram-edge
mkdir -p backups
tar -czf backups/app-before-update-$(date +%Y%m%d-%H%M%S).tgz app docker-compose.yml secrets/telegram-edge.env
```

5. Заменить `/srv/leetplus-telegram-edge/app` новой версией кода.

Не перетирать:

```text
/srv/leetplus-telegram-edge/secrets/telegram-edge.env
/srv/leetplus-telegram-edge/data
/srv/leetplus-telegram-edge/backups
```

6. Пересобрать и поднять сервисы:

```bash
cd /srv/leetplus-telegram-edge
docker compose build telegram-edge telegram-poller telegram-mini-app-web
docker compose up -d telegram-edge telegram-poller telegram-mini-app-web
```

7. Проверить:

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

8. Проверить Mini App API proxy:

```bash
curl -ksS -o /dev/null -w 'HTTP:%{http_code}:BYTES:%{size_download}\n' \
  https://tg.leetplus.ru/api/guest-portal/gamification/clubs
```

Ожидаемо: `HTTP:200`.

9. Финальный Telegram canary:

- создать Telegram auth через LeetPlus/Mini App flow
- перейти в `@leetplusru_bot` по deep-link `/start lp_CODE`
- поделиться контактом
- проверить, что финальное сообщение предлагает сайт, Mini App и продолжение в боте, а не принудительный Mini App-only путь
- в логах poller должны быть:

```text
TELEGRAM_AUTH_START status=AWAITING_CONTACT replySent=true
TELEGRAM_AUTH_CONTACT status=CONFIRMED replySent=true
```

## Env/secrets

Реальные значения брать только с серверов, не из чата.

На 1337:

```text
/srv/leetplus-telegram-edge/secrets/telegram-edge.env
```

Ключевые env:

```env
GUEST_GAME_TG_EDGE_DRY_RUN=false
GUEST_GAME_TG_EDGE_BOT_TOKEN=<secret>
GUEST_GAME_TG_EDGE_WEBHOOK_SECRET=<secret>
GUEST_GAME_TG_EDGE_SHARED_SECRET=<secret>
GUEST_GAME_TG_EDGE_TELEGRAM_API_BASE_URL=https://api.telegram.org

GUEST_GAME_TG_EDGE_POLLING_DELETE_WEBHOOK_ON_START=true
GUEST_GAME_TG_EDGE_POLLING_DROP_PENDING_UPDATES=false
GUEST_GAME_TG_EDGE_POLLING_STATE_PATH=/app/data/telegram-poller-state.json

GUEST_GAME_BOT_CONSUMER_DRY_RUN=true
```

На основной LeetPlus VDS:

```env
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED=true
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN=<telegram-bot-token>
GUEST_GAME_TELEGRAM_MINI_APP_URL=https://tg.leetplus.ru/game/app
GUEST_GAME_TELEGRAM_BOT_USERNAME=leetplusru_bot
GUEST_GAME_TG_EDGE_SHARED_SECRET=<same as edge>
GUEST_GAME_TELEGRAM_WEBHOOK_SECRET=<same as edge webhook secret>
```

## Важные правила

- Не включать Telegram webhook, пока используется polling.
- Запускать ровно один `telegram-poller` на bot token.
- Не коммитить `.env`, bot token, sync token, SSH credentials.
- `bot-consumer` пока держать в dry-run, если отдельно не принято решение включать live-доставки.
- После каждого обновления проверять Telegram canary, а не только `docker compose ps`.
- Telegram bot token лучше перевыпустить позже, потому что он уже светился в чате.
