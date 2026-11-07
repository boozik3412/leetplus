import type {
  GuestPortalGameSummary,
  GuestPortalGameMissionPage,
  GuestPortalCheckInResponse,
} from "@/lib/guest-portal";
import { debugGuestGame, debugSummarySnapshot } from "./debug";
import { GUEST_GAME_AUTH_REQUIRED_MESSAGE } from "./constants";
import type {
  GuestPortalProfileUpdateResponse,
  GuestPortalLootBoxOpenResponse,
} from "./types";

export class EmptySessionError extends Error {}

export async function loadGameSummary() {
  const startedAt = Date.now();
  debugGuestGame("api-summary-start");
  const response = await fetch("/api/guest-portal/session/game-summary", {
    cache: "no-store",
  });
  debugGuestGame("api-summary-response", {
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
  });

  if (response.status === 401) {
    throw new EmptySessionError(GUEST_GAME_AUTH_REQUIRED_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось обновить игровой экран."),
    );
  }

  const summary = (await response.json()) as GuestPortalGameSummary;
  debugGuestGame("api-summary-data", debugSummarySnapshot(summary));

  return summary;
}

export async function loadGameMissionPage({
  offset,
  limit,
}: {
  offset: number;
  limit: number;
}): Promise<GuestPortalGameMissionPage> {
  const search = new URLSearchParams({
    offset: String(Math.max(0, offset)),
    limit: String(Math.max(1, limit)),
  });
  const response = await fetch(
    `/api/guest-portal/session/game-missions?${search.toString()}`,
    { cache: "no-store" },
  );

  if (response.status === 401) {
    throw new EmptySessionError(GUEST_GAME_AUTH_REQUIRED_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(
        response,
        "Не удалось загрузить остальные задания.",
      ),
    );
  }

  return (await response.json()) as GuestPortalGameMissionPage;
}

export async function acknowledgeGameCompletionNotification(notificationId: string) {
  const response = await fetch(
    `/api/guest-portal/session/completion-notifications/${encodeURIComponent(notificationId)}/acknowledge`,
    {
      method: "POST",
      cache: "no-store",
    },
  );

  if (response.status === 401) {
    throw new EmptySessionError(GUEST_GAME_AUTH_REQUIRED_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось закрыть уведомление."),
    );
  }
}

export async function claimGameRewardWalletItem(
  itemId: string,
): Promise<GuestPortalGameSummary> {
  return postGameRewardWalletClaim(
    `/api/guest-portal/session/reward-wallet/items/${encodeURIComponent(itemId)}/claim`,
  );
}

export async function claimAllGameRewardWalletItems(): Promise<GuestPortalGameSummary> {
  return postGameRewardWalletClaim(
    "/api/guest-portal/session/reward-wallet/claim-all",
  );
}

export async function postGameRewardWalletClaim(
  url: string,
): Promise<GuestPortalGameSummary> {
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new EmptySessionError(GUEST_GAME_AUTH_REQUIRED_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(
        response,
        "Не удалось обновить кошелёк наград.",
      ),
    );
  }

  const payload = (await response.json()) as
    | GuestPortalGameSummary
    | { summary?: GuestPortalGameSummary };
  const summary =
    "summary" in payload && payload.summary ? payload.summary : payload;

  if (
    summary &&
    "generatedAt" in summary &&
    typeof summary.generatedAt === "string"
  ) {
    return summary as GuestPortalGameSummary;
  }

  return loadGameSummary();
}

export async function recordGameAppOpen(surface: "WEB" | "TG_MINI_APP") {
  const response = await fetch("/api/guest-portal/session/app-open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ surface }),
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new EmptySessionError(GUEST_GAME_AUTH_REQUIRED_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(
        response,
        "Не удалось загрузить игровой экран.",
      ),
    );
  }

  return (await response.json()) as {
    previousSummary: GuestPortalGameSummary;
    summary: GuestPortalGameSummary;
  };
}

export async function updateGameProfileNickname(displayName: string) {
  const response = await fetch("/api/guest-portal/session/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new EmptySessionError(GUEST_GAME_AUTH_REQUIRED_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось сохранить никнейм."),
    );
  }

  return ((await response.json()) as GuestPortalProfileUpdateResponse).summary;
}

export async function checkInGameSession(): Promise<GuestPortalCheckInResponse> {
  const response = await fetch("/api/guest-portal/session/check-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: "Чекин гостя из игрового модуля." }),
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new EmptySessionError(GUEST_GAME_AUTH_REQUIRED_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось сделать чекин."),
    );
  }

  return (await response.json()) as GuestPortalCheckInResponse;
}

export async function openGameLootBox(
  lootBoxId: string,
): Promise<GuestPortalLootBoxOpenResponse> {
  const startedAt = Date.now();
  debugGuestGame("api-lootbox-open-start", { lootBoxId });
  const response = await fetch(
    `/api/guest-portal/session/loot-boxes/${encodeURIComponent(lootBoxId)}/open`,
    {
      method: "POST",
      cache: "no-store",
    },
  );
  debugGuestGame("api-lootbox-open-response", {
    lootBoxId,
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
  });

  if (response.status === 401) {
    throw new EmptySessionError(GUEST_GAME_AUTH_REQUIRED_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Лутбокс сейчас недоступен."),
    );
  }

  const result = (await response.json()) as GuestPortalLootBoxOpenResponse;
  debugGuestGame("api-lootbox-open-data", {
    lootBoxId,
    idempotent: result.idempotent,
    createdRewards: result.createdRewards,
    queuedRewardAmount: result.queuedRewardAmount,
    rewards: result.rewards,
    summary: debugSummarySnapshot(result.summary),
  });

  return result;
}

export async function openGameRewardWalletLootBox(
  walletItemId: string,
): Promise<GuestPortalLootBoxOpenResponse> {
  const response = await fetch(
    `/api/guest-portal/session/reward-wallet/items/${encodeURIComponent(walletItemId)}/open`,
    {
      method: "POST",
      cache: "no-store",
    },
  );

  if (response.status === 401) {
    throw new EmptySessionError(
      "Сессия входа истекла. Подтвердите телефон заново.",
    );
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(
        response,
        "Лутбокс из кошелька сейчас недоступен.",
      ),
    );
  }

  return (await response.json()) as GuestPortalLootBoxOpenResponse;
}

export async function logoutGameSession() {
  const response = await fetch("/api/guest-portal/session/logout", {
    method: "POST",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось завершить сессию."),
    );
  }
}

export async function readResponseMessage(
  response: Response,
  fallback = "Не удалось загрузить игровой экран.",
) {
  try {
    const payload = (await response.json()) as { message?: unknown };
    return typeof payload.message === "string" ? payload.message : fallback;
  } catch {
    return fallback;
  }
}
