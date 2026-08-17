import { cookies } from "next/headers";
import { getApiUrl, requestJsonWithTimeout } from "@/lib/api";
import {
  GUEST_AUTH_COOKIE_NAME,
  type GuestPortalGameSummary,
  type GuestPortalLootBoxRarity,
} from "@/lib/guest-portal";

const HOMEPAGE_GAME_SUMMARY_TIMEOUT_MS = 4_000;

export type GuestHomepageReward = {
  id: string;
  title: string;
  eyebrow: string;
  value: string;
  rarity: GuestPortalLootBoxRarity;
};

export type GuestHomepageContext = {
  clubId: string;
  clubName: string;
  weeklyRewards: GuestHomepageReward[];
};

export async function getGuestHomepageContext(): Promise<GuestHomepageContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_AUTH_COOKIE_NAME)?.value ?? null;

  if (!token) {
    return null;
  }

  try {
    const result = await requestJsonWithTimeout<GuestPortalGameSummary>(
      `${getApiUrl()}/guest-portal/session/game-summary`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      HOMEPAGE_GAME_SUMMARY_TIMEOUT_MS,
    );

    if (!result.ok || !result.data) {
      return null;
    }

    return buildGuestHomepageContext(result.data);
  } catch {
    return null;
  }
}

export function buildGuestHomepageContext(
  summary: GuestPortalGameSummary,
): GuestHomepageContext | null {
  const weeklyRewards = summary.lootBoxes.featured.slice(0, 4).map((lootBox) => ({
    id: lootBox.id,
    title: lootBox.name,
    eyebrow: `${lootBox.caseRarityLabel} кейс`,
    value: lootBoxHomepageStatus(lootBox),
    rarity: lootBox.caseRarity,
  }));

  if (!summary.store.id || !summary.store.name || weeklyRewards.length === 0) {
    return null;
  }

  return {
    clubId: summary.store.id,
    clubName: summary.store.name,
    weeklyRewards,
  };
}

function lootBoxHomepageStatus(
  lootBox: GuestPortalGameSummary["lootBoxes"]["featured"][number],
) {
  if (lootBox.openable) {
    return "Можно открыть";
  }

  if (lootBox.openState === "LIMIT_REACHED") {
    return "Лимит достигнут";
  }

  if (lootBox.weeklyLimit != null) {
    return `${lootBox.weeklyOpenedCount} / ${lootBox.weeklyLimit} за неделю`;
  }

  if (lootBox.dailyLimit != null) {
    return `${lootBox.dailyOpenedCount} / ${lootBox.dailyLimit} за день`;
  }

  return lootBox.rewardLabel || "Доступен в клубе";
}
