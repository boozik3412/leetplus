'use strict';

const { ProxyAgent, fetch } = require('undici');

const token = process.env.GUEST_GAME_TG_EDGE_BOT_TOKEN?.trim();
const proxyUrl = process.env.GUEST_GAME_TG_EDGE_TELEGRAM_PROXY_URL?.trim();

if (!token || !proxyUrl) {
  console.error('required Telegram proxy check env is missing');
  process.exit(2);
}

const dispatcher = new ProxyAgent(proxyUrl);

async function call(method) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: 'POST',
      dispatcher,
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15_000),
    },
  );
  const payload = await response.json();

  if (!response.ok || payload.ok !== true) {
    throw new Error(`${method} failed status=${response.status}`);
  }

  return payload.result;
}

async function main() {
  const me = await call('getMe');
  const webhook = await call('getWebhookInfo');

  console.log(
    JSON.stringify({
      getMe: { ok: true, username: me.username },
      getWebhookInfo: {
        ok: true,
        urlEmpty: webhook.url === '',
        pendingUpdateCount: webhook.pending_update_count,
      },
    }),
  );
}

main()
  .catch((error) => {
    console.error(
      `telegram proxy check failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await dispatcher.close();
  });
