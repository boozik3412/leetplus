import {
  evaluateTelegramPollingHealth,
  loadTelegramPollingConfig,
  readPollingHeartbeat,
} from './telegram-edge-poller.cli';

async function main() {
  const config = loadTelegramPollingConfig(process.env);
  const heartbeat = await readPollingHeartbeat(config.heartbeatPath);
  const health = evaluateTelegramPollingHealth(
    heartbeat,
    config.heartbeatMaxAgeMs,
  );

  if (!health.healthy) {
    console.error(
      `Telegram poller unhealthy reason=${health.reason} ageMs=${
        health.ageMs ?? '-'
      } consecutiveFailures=${health.consecutiveFailures ?? '-'}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Telegram poller healthy ageMs=${health.ageMs ?? '-'} consecutiveFailures=${
      health.consecutiveFailures ?? '-'
    }`,
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`Telegram poller health check failed: ${message}`);
    process.exitCode = 1;
  });
}
