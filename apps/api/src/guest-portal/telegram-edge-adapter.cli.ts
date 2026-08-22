import {
  loadTelegramEdgeConfig,
  startTelegramEdgeServer,
} from './telegram-edge-adapter';
import { assertStandaloneProcessAllowed } from '../config/design-partner-runtime-policy';
import {
  createTelegramBotApiFetch,
  loadTelegramBotApiProxyUrl,
  maskTelegramBotApiProxyUrl,
} from './telegram-bot-api-fetch';

async function main() {
  assertStandaloneProcessAllowed(
    process.env,
    'GUEST_GAME_TG_EDGE_ADAPTER_ENABLED',
    { GUEST_GAME_TG_EDGE_DRY_RUN: 'true' },
    'GUEST_GAME_TG_EDGE_LEETPLUS_API_URL',
  );

  const config = loadTelegramEdgeConfig(process.env);
  const telegramProxyUrl = loadTelegramBotApiProxyUrl(process.env);
  const server = await startTelegramEdgeServer(config, {
    logger: console,
    telegramFetch: createTelegramBotApiFetch(process.env),
  });

  if (telegramProxyUrl) {
    console.log(
      `Telegram edge adapter Bot API proxy=${maskTelegramBotApiProxyUrl(
        telegramProxyUrl,
      )}`,
    );
  }

  const shutdown = async (signal: string) => {
    console.log(`Telegram edge adapter received ${signal}, shutting down.`);
    await server.close();
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT').finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM').finally(() => process.exit(0));
  });
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`Telegram edge adapter failed: ${message}`);
    process.exitCode = 1;
  });
}
