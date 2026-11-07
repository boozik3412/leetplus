"use client";

import type { GuestPortalRewardLootBoxPreview } from "@/lib/guest-portal";
import { formatChancePercent } from "../format";
import Image from "next/image";
import { lootboxSkinForRarity } from "@/lib/lootbox-assets";

export function LootBoxDropChanceList({
  possibleRewards,
}: {
  possibleRewards: GuestPortalRewardLootBoxPreview["possibleRewards"];
}) {
  return (
    <ul className="lp-lootbox-drop-chance-list">
      {possibleRewards.map((reward) => (
        <li key={`${reward.rewardLabel}:${reward.chancePercent}`}>
          <span data-rarity={reward.rarity} aria-hidden="true" />
          <strong>{reward.rewardLabel}</strong>
          <em>{formatChancePercent(reward.chancePercent)}</em>
        </li>
      ))}
    </ul>
  );
}

export function RewardLootBoxPreview({
  lootBox,
}: {
  lootBox: GuestPortalRewardLootBoxPreview;
}) {
  return (
    <div className="lp-reward-lootbox-preview">
      <div className="lp-reward-lootbox-media">
        <Image
          src={lootboxSkinForRarity(lootBox.caseRarity)}
          alt={`Кейс ${lootBox.name}`}
          width={1024}
          height={1024}
          sizes="(max-width: 520px) 148px, 180px"
          draggable={false}
        />
        <span>{lootBox.caseRarityLabel} кейс</span>
        <strong>{lootBox.name}</strong>
      </div>
      <div className="lp-lootbox-unavailable-drops lp-reward-lootbox-drops">
        <span>Что может выпасть</span>
        <LootBoxDropChanceList possibleRewards={lootBox.possibleRewards} />
      </div>
    </div>
  );
}
