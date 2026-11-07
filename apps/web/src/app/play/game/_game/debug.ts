import type { HomeLootCard } from "./types";
import type { GuestPortalGameSummary } from "@/lib/guest-portal";

export function debugGuestGame(stage: string, payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const logger = globalThis.console;
    logger.info(`[guest-game-debug:${stage}]`, payload);
  } catch {
    // Diagnostics must never affect the guest flow.
  }
}

export function debugHomeLootCard(card: HomeLootCard | null | undefined) {
  if (!card) {
    return null;
  }

  return {
    id: card.id,
    title: card.title,
    triggerKind: card.triggerKind,
    sessionType: card.sessionType,
    schedule: card.schedule,
    status: card.status,
    openable: card.openable,
    openState: card.openState,
    openBlocker: card.openBlocker,
    weeklyOpenedCount: card.weeklyOpenedCount,
    weeklyLimit: card.weeklyLimit,
    dailyOpenedCount: card.dailyOpenedCount,
    dailyLimit: card.dailyLimit,
    periodicLimitPeriod: card.periodicLimitPeriod,
    periodicOpenedCount: card.periodicOpenedCount,
    walletReady: card.walletReady,
    walletStatus: card.walletStatus,
  };
}

export function debugSummarySnapshot(summary: GuestPortalGameSummary) {
  return {
    generatedAt: summary.generatedAt,
    tenant: summary.tenant.slug,
    storeId: summary.store.id,
    storeName: summary.store.name,
    profileId: summary.profile.id,
    contactMasked: summary.profile.contactMasked,
    lootBoxesTotal: summary.lootBoxes.total,
    featuredLootBoxes: summary.lootBoxes.featured.map((lootBox) => ({
      id: lootBox.id,
      name: lootBox.name,
      triggerKind: lootBox.triggerKind,
      sessionType: lootBox.sessionType,
      schedule: lootBox.schedule,
      openable: lootBox.openable,
      openState: lootBox.openState,
      openBlocker: lootBox.openBlocker,
      openedCount: lootBox.openedCount,
      readyRewards: lootBox.readyRewards,
      weeklyOpenedCount: lootBox.weeklyOpenedCount,
      weeklyLimit: lootBox.weeklyLimit,
      dailyOpenedCount: lootBox.dailyOpenedCount,
      dailyLimit: lootBox.dailyLimit,
      periodicLimitPeriod: lootBox.periodicLimitPeriod,
      periodicOpenedCount: lootBox.periodicOpenedCount,
    })),
  };
}
