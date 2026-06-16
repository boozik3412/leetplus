import {
  loadBotConsumerConfig,
  runBotConsumerOnce,
} from './guest-game-delivery-bot-consumer';

async function main() {
  const config = loadBotConsumerConfig(process.env);
  const intervalMs = parseOptionalInt(
    process.env.GUEST_GAME_BOT_CONSUMER_INTERVAL_MS,
  );
  const maxTicks = parseOptionalInt(
    process.env.GUEST_GAME_BOT_CONSUMER_MAX_TICKS,
  );
  let ticks = 0;

  while (!maxTicks || ticks < maxTicks) {
    ticks += 1;
    const result = await runBotConsumerOnce(config, { logger: console });

    console.log(
      [
        `tick=${ticks}`,
        `dryRun=${result.dryRun}`,
        `pulled=${result.pulled}`,
        `sent=${result.sent}`,
        `failed=${result.failed}`,
        `blocked=${result.blocked}`,
        `skipped=${result.skipped}`,
        `acked=${result.acked}`,
      ].join(' '),
    );

    if (!intervalMs || (maxTicks && ticks >= maxTicks)) {
      break;
    }

    await delay(intervalMs);
  }
}

function parseOptionalInt(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`Guest game bot consumer failed: ${message}`);
    process.exitCode = 1;
  });
}
