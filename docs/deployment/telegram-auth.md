# Telegram-вход и Mini App на 1337

Этот runbook описывает текущий production-контур регистрации участника геймификации: `/play` или `/game/auth` -> Telegram bot -> contact-share -> отдельный `GuestGameProfile` -> guest-token в браузере -> выбор клуба/игровой экран. Mini App живет на отдельном edge VDS и остается одним из вариантов после подтверждения телефона, но не должен быть единственным принудительным продолжением входа.

Актуальная правда по edge-серверу сохранена в `docs/deployment/telegram-edge-vds/CURRENT_1337_HANDOFF.md`.

## Текущее размещение

Telegram bot и Mini App вынесены на 1337:

- edge domain: `https://tg.leetplus.ru`
- public IP: `188.234.220.76`
- project root: `/srv/leetplus-telegram-edge`
- compose: `/srv/leetplus-telegram-edge/docker-compose.yml`
- secrets env: `/srv/leetplus-telegram-edge/secrets/telegram-edge.env`
- runtime data: `/srv/leetplus-telegram-edge/data`

Основной LeetPlus API остается на основной VDS:

- API URL: `https://api.leetplus.ru`
- бизнес-логика Telegram auth остается в основном API
- edge только poll-ит Telegram updates, проксирует Mini App и отправляет ответы в Telegram

Важно: используется Telegram long polling, не webhook. Telegram webhook должен быть пустым. `telegram-poller` сам вызывает `deleteWebhook(drop_pending_updates=false)` на старте.

Production egress после инцидента 31.08–06.09.2026 является частью security
contract: `telegram-poller` с адреса `172.25.0.10` ходит только через приватный
HTTP CONNECT bridge `172.25.0.1:18118`, а Privoxy передает hostname в локальный
Tor через `forward-socks5t 127.0.0.1:9050`. Прямой transparent путь через
`TG_PROXY -> redsocks` для router fake-IP `198.18.0.0/15` использовать нельзя:
он теряет hostname, после чего Tor не может установить соединение.

## Что делает контур

- `/play` и `/game/auth` показывают одну CTA `Войти через Telegram`: сначала информационное окно объясняет переход в Telegram и дает отмену `Другой способ входа`, затем web создает одноразовый Telegram auth challenge для выбранного клуба и открывает deep link бота.
- `telegram-poller` на 1337 получает updates через `getUpdates`.
- Edge adapter пересылает safe update в основной API `/guest-portal/telegram/webhook` с Telegram secret header.
- Основной API принимает `/start lp_...`, переводит challenge в ожидание contact-share и возвращает safe `reply` payload.
- Edge adapter отправляет safe reply в Telegram через Bot API/proxy: сначала кнопку `request_contact`, затем после contact-share inline-выбор `Вернуться на сайт LeetPlus`, `Открыть Mini App`, `Продолжить в боте`. Если позже включить API-side sender на основной VDS, успешный ответ API будет содержать `replyDispatch=SENT` без `reply` payload, поэтому edge не сможет продублировать `sendMessage`.
- LeetPlus принимает только contact того же Telegram-пользователя, активирует или сливает отдельный `GuestGameProfile` по `phoneHash`, а browser status endpoint выдает guest-token и переводит сайт на `/game/clubs`. Telegram reply не должен заставлять гостя открывать Mini App: Mini App, бот и возврат на сайт равноправные продолжения.
- `/game/app` открывается на `https://tg.leetplus.ru`, проверяет Telegram Mini App `initData` bot token-ом на edge, передает в основной API edge assertion по shared secret, получает обычную HttpOnly guest-session и читает `GET /guest-portal/session/game-summary`.

Raw phone, raw chat id, raw Telegram update, bot token и Langame payload не возвращаются на frontend и не сохраняются в audit.

## Env основной VDS

```env
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED=false
GUEST_GAME_TELEGRAM_MINI_APP_URL=https://tg.leetplus.ru/game/app
GUEST_GAME_TELEGRAM_BOT_USERNAME=leetplusru_bot
GUEST_GAME_TG_EDGE_SHARED_SECRET=<same-as-edge>
GUEST_GAME_TELEGRAM_WEBHOOK_SECRET=<same-as-edge-update-secret>
WEB_URL=https://leetplus.ru
API_URL=https://api.leetplus.ru
```

API-side Telegram sender на основной VDS по умолчанию выключен. Guest Game Hub считает live sender готовым через 1337 polling edge, если настроены `GUEST_GAME_TELEGRAM_WEBHOOK_SECRET` и `GUEST_GAME_TG_EDGE_SHARED_SECRET`. Для прямой API-side отправки нужно отдельно добавить `GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN`, поставить `GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED=true` и перезапустить `leetplus-api.service`.

## Env 1337 edge

Реальные значения брать только с сервера:

```text
/srv/leetplus-telegram-edge/secrets/telegram-edge.env
```

Ключевые переменные:

```env
GUEST_GAME_TG_EDGE_DRY_RUN=false
GUEST_GAME_TG_EDGE_BOT_TOKEN=<secret>
GUEST_GAME_TG_EDGE_WEBHOOK_SECRET=<secret>
GUEST_GAME_TG_EDGE_SHARED_SECRET=<secret>
GUEST_GAME_TG_EDGE_TELEGRAM_API_BASE_URL=https://api.telegram.org
# В production задается только сервису telegram-poller в docker-compose:
GUEST_GAME_TG_EDGE_TELEGRAM_PROXY_URL=http://172.25.0.1:18118

GUEST_GAME_TG_EDGE_POLLING_DELETE_WEBHOOK_ON_START=true
GUEST_GAME_TG_EDGE_POLLING_DROP_PENDING_UPDATES=false
GUEST_GAME_TG_EDGE_POLLING_TIMEOUT_SECONDS=50
GUEST_GAME_TG_EDGE_POLLING_LIMIT=100
GUEST_GAME_TG_EDGE_POLLING_ALLOWED_UPDATES=message,edited_message,callback_query
GUEST_GAME_TG_EDGE_POLLING_STATE_PATH=/app/data/telegram-poller-state.json
GUEST_GAME_TG_EDGE_POLLING_HEARTBEAT_PATH=/app/data/telegram-poller-heartbeat.json
GUEST_GAME_TG_EDGE_POLLING_HEARTBEAT_MAX_AGE_MS=150000
GUEST_GAME_TG_EDGE_POLLING_RETRY_DELAY_MS=5000

GUEST_GAME_BOT_CONSUMER_DRY_RUN=true
```

`GUEST_GAME_TG_EDGE_TELEGRAM_API_BASE_URL` остается официальным Bot API URL.
Egress proxy задается отдельной переменной
`GUEST_GAME_TG_EDGE_TELEGRAM_PROXY_URL`; текущий runtime принимает только
`http://` или `https://`, поэтому прямой `socks5h://` URL невалиден.

Compose закрепляет `leetplus_telegram_edge_default` как external network с
subnet `172.25.0.0/16`, poller как `172.25.0.10`, а proxy слушает только
`172.25.0.1:18118` и ACL-разрешает только этот poller IP. Listener нельзя
публиковать на host/LAN/public интерфейс.

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

## Обновление bot / Mini App

1. Локально проверить сборку:

```powershell
node C:\Users\ALIENWARE\Desktop\leetplus\.codex-tools\node_modules\pnpm\bin\pnpm.cjs --filter api build
node C:\Users\ALIENWARE\Desktop\leetplus\.codex-tools\node_modules\pnpm\bin\pnpm.cjs --filter web build
```

2. На 1337 перед заменой сделать backup:

```bash
cd /srv/leetplus-telegram-edge
mkdir -p backups
tar -czf backups/app-before-update-$(date +%Y%m%d-%H%M%S).tgz app docker-compose.yml secrets/telegram-edge.env
sha256sum data/telegram-poller-state.json
docker compose stop telegram-poller
cp -a data/telegram-poller-state.json backups/telegram-poller-state.before-update.json
```

Старый state snapshot никогда не восстанавливается поверх более нового
offset: это вызовет replay уже обработанных Telegram update.

3. Заменить `/srv/leetplus-telegram-edge/app` immutable source tree только
   принятого exact-main SHA. Из этого же дерева установить Compose и egress
   contract; сохранять вручную изменённые старые operational-файлы нельзя:

```bash
cd /srv/leetplus-telegram-edge
install -m 0644 app/deploy/leetplus-telegram-edge/docker-compose.yml \
  docker-compose.yml
app/deploy/leetplus-telegram-edge/install-telegram-http-proxy.sh
install -m 0755 \
  app/deploy/leetplus-telegram-edge/1337-telegram-proxy-update-ipset.sh \
  /srv/1337-telegram-proxy/scripts/update-ipset.sh
install -m 0755 \
  app/deploy/leetplus-telegram-edge/1337-telegram-proxy-apply-iptables.sh \
  /srv/1337-telegram-proxy/scripts/apply-iptables.sh
/srv/1337-telegram-proxy/scripts/update-ipset.sh
/srv/1337-telegram-proxy/scripts/apply-iptables.sh
docker compose config --quiet
```

Compose собирает канонический
`app/deploy/leetplus-telegram-edge/Dockerfile`, а не отдельный stale
`app/Dockerfile`.

Не перетирать:

```text
/srv/leetplus-telegram-edge/secrets/telegram-edge.env
/srv/leetplus-telegram-edge/data
/srv/leetplus-telegram-edge/backups
```

4. Пересобрать и поднять сервисы:

```bash
cd /srv/leetplus-telegram-edge
docker compose build telegram-edge telegram-poller telegram-mini-app-web
docker compose up -d telegram-edge telegram-poller telegram-mini-app-web
```

Installer обязан подтвердить Tor, приватный Privoxy listener, exact Docker
subnet и ACL до запуска poller. Штатный `privoxy.service` с default-конфигом
остается disabled; используется только hardened
`1337-telegram-http-proxy.service`.

## Проверка

```bash
cd /srv/leetplus-telegram-edge
docker compose ps
docker compose logs --tail=120 telegram-poller
docker compose exec -T telegram-poller \
  node /app/apps/api/dist/guest-portal/telegram-edge-poller-health.cli
docker compose logs --tail=80 telegram-edge
docker compose logs --tail=80 telegram-mini-app-web
./telegram-webhook-remote.sh info
./check-nginx-https-site.sh
```

Ожидаемо:

- webhook `url=-`
- `pending_update_count=0` или небольшое число
- `telegram-poller` ровно один и имеет Docker health `healthy`
- `/app/data/telegram-poller-heartbeat.json` содержит свежий успешный poll
- offset меняется только монотонно; repeated outbound error отсутствует
- `https_game_app_http=200`
- `https_webhook_wrong_secret_http=401`
- `https_root_http=404`

Mini App API proxy:

```bash
curl -ksS -o /dev/null -w 'HTTP:%{http_code}:BYTES:%{size_download}\n' \
  https://tg.leetplus.ru/api/guest-portal/gamification/clubs
```

Ожидаемо: `HTTP:200`.

Финальный Telegram canary:

- создать Telegram auth через LeetPlus/Mini App flow
- перейти в `@leetplusru_bot` по deep-link `/start lp_CODE`
- поделиться контактом
- убедиться, что сообщение после contact-share дает выбор: `Вернуться на сайт LeetPlus`, `Открыть Mini App`, `Продолжить в боте`; Mini App не должен открываться без выбора гостя
- в логах poller должны быть:

```text
TELEGRAM_AUTH_START status=AWAITING_CONTACT replySent=true
TELEGRAM_AUTH_CONTACT status=CONFIRMED replySent=true
```

## Откат

- Поставить `GUEST_GAME_TG_EDGE_DRY_RUN=true`.
- Перезапустить сервисы edge:

```bash
cd /srv/leetplus-telegram-edge
docker compose up -d telegram-edge telegram-poller telegram-mini-app-web
```

- Для отключения Mini App кнопки временно убрать `GUEST_GAME_TELEGRAM_MINI_APP_URL` на основной VDS.
- Для полного отключения Telegram-входа остановить `telegram-poller` или убрать `GUEST_GAME_TELEGRAM_WEBHOOK_SECRET` на основной VDS; `/play` откроет первый готовый fallback.
- Для rollback API-side sender задать `GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED=false` и перезапустить `leetplus-api.service`: edge adapter снова будет отправлять safe reply payload.

## Правила безопасности

- Не включать Telegram webhook, пока используется polling.
- Запускать ровно один `telegram-poller` на bot token.
- Не вызывать `getUpdates` вручную: это конкурирующий consumer и может
  продвинуть offset вне сохраненного state.
- Не удалять отдельный HTTP CONNECT bridge и не возвращать poller в
  transparent `TG_PROXY` при обновлении compose/app.
- Не добавлять fake-IP или hard-coded Telegram IP в локальный ipset.
- Не коммитить `.env`, bot token, sync token, SSH credentials.
- `bot-consumer` держать в dry-run, если отдельно не принято решение включать live-доставки.
- После каждого обновления проверять Telegram canary, а не только `docker compose ps`.
- Telegram bot token лучше перевыпустить, если он светился в чате.
