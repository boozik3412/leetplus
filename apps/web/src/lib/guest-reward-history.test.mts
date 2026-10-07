import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const sourceRoot = path.resolve(import.meta.dirname, "..");

test("reward history shows a paid bonus once, merged by its reward id", async () => {
  const [game, contract] = await Promise.all([
    readFile(
      path.join(sourceRoot, "app", "play", "game", "game-summary-client.tsx"),
      "utf8",
    ),
    readFile(path.join(sourceRoot, "lib", "guest-portal.ts"), "utf8"),
  ]);

  // Bonus ledger entries carry the reward they pay out…
  assert.match(contract, /rewardId\?: string \| null;/);
  // …and the canonical history keys them by that reward, so the payout and
  // the reward ("Редкое") are one row, not two ("Обычное" + "Редкое").
  const normalizer = game.slice(
    game.indexOf("function normalizeBonusRewardHistoryItem("),
    game.indexOf("function mergeRewardHistoryItems("),
  );
  assert.match(normalizer, /id: item\.rewardId \?\? item\.id,/);
  assert.match(
    game,
    /for \(const item of summary\.rewards\.bonusHistory\.items\) \{\s*upsert\(normalizeBonusRewardHistoryItem\(item\)\);/,
  );
});
