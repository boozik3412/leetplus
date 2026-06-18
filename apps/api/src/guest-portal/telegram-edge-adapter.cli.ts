import {
  loadTelegramEdgeConfig,
  startTelegramEdgeServer,
} from './telegram-edge-adapter';

async function main() {
  const config = loadTelegramEdgeConfig(process.env);
  const server = await startTelegramEdgeServer(config, { logger: console });

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
