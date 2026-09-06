# LeetPlus Telegram Edge on 1337

Project root:

```bash
cd /srv/leetplus-telegram-edge
```

`app/` must be the immutable source tree for the admitted exact-main SHA. Do
not keep a separately edited `app/Dockerfile`: Compose builds the reviewed
`app/deploy/leetplus-telegram-edge/Dockerfile` directly. After staging a new
source tree and before any build, install and validate its complete operational
contract:

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

Never copy only the application files while retaining an older Compose,
Dockerfile or egress installer. Preserve `secrets/`, `data/` and `backups/`,
and never restore an older poller state over a larger live offset.

Core services:

```bash
docker compose ps
docker compose logs --tail=120 telegram-edge
docker compose logs --tail=120 telegram-poller
docker compose logs --tail=120 telegram-mini-app-web
docker compose up -d --build telegram-edge telegram-poller telegram-mini-app-web
```

## Mandatory Telegram egress boundary

`telegram-poller` must not connect to router fake-IP answers through the host
`TG_PROXY -> redsocks -> Tor` interception chain. A fake address such as
`198.18.0.42` loses the original hostname before it reaches Tor and makes the
bot silently stop polling.

The persistent production path is:

```text
telegram-poller 172.25.0.10
  -> HTTP CONNECT 172.25.0.1:18118
  -> Privoxy forward-socks5t 127.0.0.1:9050
  -> Telegram Bot API with remote DNS
```

Install or reconcile the bridge before starting the poller:

```bash
cd /path/to/server-admin-codex/deploy/leetplus-telegram-edge
./install-telegram-http-proxy.sh
systemctl is-active tor@default.service
systemctl is-active 1337-telegram-http-proxy.service
ss -ltn | grep '172.25.0.1:18118'
```

The installer pins `privoxy=4.1.0-1`, suppresses package maintainer auto-start,
and masks the distribution `privoxy.service`. Only the reviewed dedicated unit
may listen. A different package version is a new admitted change, not an
automatic upgrade.

Security invariants:

- listener is only `172.25.0.1:18118`, never `0.0.0.0`, LAN or public;
- only source `172.25.0.10` is admitted by Privoxy;
- Compose keeps `leetplus_telegram_edge_default` external with subnet
  `172.25.0.0/16` and assigns `telegram-poller` the exact address
  `172.25.0.10`;
- `GUEST_GAME_TG_EDGE_TELEGRAM_PROXY_URL` is set only on `telegram-poller`;
- the application supports an HTTP(S) proxy URL, not a direct `socks5h://`
  value;
- no second poller, manual `getUpdates`, hard-coded Telegram IP or webhook
  fallback is allowed.

The legacy transparent proxy remains defense-in-depth for other workloads,
but its versioned ipset/iptables scripts explicitly reject the router fake-IP
range. Reconcile them with:

```bash
install -m 0755 1337-telegram-proxy-update-ipset.sh \
  /srv/1337-telegram-proxy/scripts/update-ipset.sh
install -m 0755 1337-telegram-proxy-apply-iptables.sh \
  /srv/1337-telegram-proxy/scripts/apply-iptables.sh
/srv/1337-telegram-proxy/scripts/update-ipset.sh
/srv/1337-telegram-proxy/scripts/apply-iptables.sh
```

`198.18.0.0/15` must never be present in `telegram_proxy` or reach redsocks.

Telegram bot polling:

```bash
docker compose up -d telegram-poller
docker compose logs -f --tail=120 telegram-poller
docker compose stop telegram-poller
```

Run exactly one `telegram-poller` for the bot token. The poller deletes the Telegram webhook on start with `drop_pending_updates=false`, then uses long polling through Telegram Bot API. Its offset is stored in `/srv/leetplus-telegram-edge/data/telegram-poller-state.json`.
Its liveness heartbeat is stored separately in
`/srv/leetplus-telegram-edge/data/telegram-poller-heartbeat.json`; Docker
health must become `healthy` after startup and remain fresh even when Telegram
returns no updates.

Before every update, save the state checksum. Never restore an older state
over a larger live offset:

```bash
sha256sum data/telegram-poller-state.json
docker compose stop telegram-poller
cp -a data/telegram-poller-state.json backups/telegram-poller-state.before-update.json
```

Optional live Telegram delivery consumer:

```bash
docker compose --profile consumer up -d bot-consumer
docker compose --profile consumer logs --tail=120 bot-consumer
docker compose --profile consumer stop bot-consumer
```

Do not start `bot-consumer` in live mode until these fields are real and checked:

- `GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN`
- `GUEST_GAME_BOT_CONSUMER_TENANT_SLUG` or `GUEST_GAME_BOT_CONSUMER_TENANT_ID`
- `GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN`
- `GUEST_GAME_BOT_CONSUMER_DRY_RUN=false`

Health checks:

```bash
# The production health route is secret-protected. Probe it inside the
# container so the secret never appears in shell history or curl arguments.
docker compose exec -T telegram-edge node -e '
fetch("http://127.0.0.1:4010/health", {
  headers: { "x-edge-health-secret": process.env.GUEST_GAME_TG_EDGE_HEALTH_SECRET },
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.ok !== true) process.exit(1);
}).catch(() => process.exit(1));
'

# An unauthenticated health request must stay closed.
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:4010/health)" = 401
curl -I http://127.0.0.1:3100/game/app
test "$(curl -sS -o /dev/null -w '%{http_code}' \
  --resolve tg.leetplus.ru:443:127.0.0.1 \
  https://tg.leetplus.ru/health)" = 401
curl -I --resolve tg.leetplus.ru:80:127.0.0.1 http://tg.leetplus.ru/game/app
curl -i --resolve tg.leetplus.ru:80:127.0.0.1 http://tg.leetplus.ru/
```

Nginx:

```bash
nginx -t
systemctl reload nginx
```

Live prerequisites:

- DNS `tg.leetplus.ru` points to `188.234.220.76`.
- TLS certificate exists for `tg.leetplus.ru`.
- Main LeetPlus API has matching `GUEST_GAME_TELEGRAM_WEBHOOK_SECRET`, `GUEST_GAME_TG_EDGE_SHARED_SECRET`, `GUEST_GAME_TELEGRAM_MINI_APP_URL=https://tg.leetplus.ru/game/app`, and `GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED=false`.
- `/srv/leetplus-telegram-edge/secrets/telegram-edge.env` has real bot token, sync token and tenant scope before enabling live sends.
- Production Nginx reload is explicitly approved before enabling `/etc/nginx/sites-enabled/tg.leetplus.ru`.

Webhook mode, not used when polling is enabled:

```bash
curl -X POST "https://api.telegram.org/bot${GUEST_GAME_TG_EDGE_BOT_TOKEN}/setWebhook" \
  -d "url=https://tg.leetplus.ru/tg/webhook" \
  -d "secret_token=${GUEST_GAME_TG_EDGE_WEBHOOK_SECRET}" \
  -d "drop_pending_updates=false"
```

Polling mode:

```bash
curl -X POST "https://api.telegram.org/bot${GUEST_GAME_TG_EDGE_BOT_TOKEN}/deleteWebhook" \
  -d "drop_pending_updates=false"
curl "https://api.telegram.org/bot${GUEST_GAME_TG_EDGE_BOT_TOKEN}/getWebhookInfo"
docker compose up -d telegram-poller
```

After every update, require all of the following instead of accepting `Up`
alone:

```bash
docker compose ps telegram-poller
docker compose logs --since=5m telegram-poller
docker compose exec -T telegram-poller \
  node /app/apps/api/dist/guest-portal/telegram-edge-poller-health.cli
```

Expected: one poller, `healthy`, monotonically increasing offset when updates
arrive, recent successful heartbeat, webhook URL empty and no repeated
`category=DNS|CONNECT|SOCKS|TLS|TIMEOUT` failures. Finish with a fresh
`/game/auth -> /start -> contact -> /game/clubs` canary.

Rollback:

```bash
cd /srv/leetplus-telegram-edge
docker compose stop telegram-poller
docker compose --profile consumer stop bot-consumer
sed -i 's/^GUEST_GAME_TG_EDGE_DRY_RUN=.*/GUEST_GAME_TG_EDGE_DRY_RUN=true/' secrets/telegram-edge.env
sed -i 's/^GUEST_GAME_BOT_CONSUMER_DRY_RUN=.*/GUEST_GAME_BOT_CONSUMER_DRY_RUN=true/' secrets/telegram-edge.env
docker compose up -d telegram-edge telegram-mini-app-web
```
