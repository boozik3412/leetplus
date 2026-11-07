"use client";

import type { HomeLootCard, UnavailableLootboxMessage } from "../types";
import { lootBoxGuestRequirementLines } from "./hints";
import { LootBoxDropChanceList } from "./preview";

export function LootboxUnavailableModal({
  card,
  checking,
  message,
  onClose,
  onRefresh,
}: {
  card: HomeLootCard;
  checking: boolean;
  message: UnavailableLootboxMessage;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const requirements = lootBoxGuestRequirementLines(card);

  return (
    <div
      id="lootboxUnavailable"
      className="lp-quest-complete-overlay lp-lootbox-unavailable-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lootboxUnavailableTitle"
    >
      <div className="lp-quest-complete-dialog lp-lootbox-unavailable-dialog">
        <button
          type="button"
          className="lp-quest-complete-close"
          aria-label="Закрыть окно"
          onClick={onClose}
        >
          ×
        </button>
        <span className="lp-quest-complete-kicker lp-lootbox-unavailable-kicker">
          Кейс недоступен
        </span>
        <h3 id="lootboxUnavailableTitle">{card.title}</h3>
        <p className="lp-lootbox-unavailable-lead">
          Пока условия открытия не выполнены.
        </p>

        <div className="lp-lootbox-unavailable-block">
          <span>Что нужно сделать</span>
          <ul>
            {requirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="lp-lootbox-unavailable-drops">
          <span>Что может выпасть</span>
          <LootBoxDropChanceList possibleRewards={card.possibleRewards} />
        </div>

        {message ? (
          <p className="lp-lootbox-unavailable-status" role="status">
            {message}
          </p>
        ) : null}

        <div className="lp-lootbox-unavailable-actions">
          <button
            type="button"
            className="lp-lootbox-unavailable-secondary"
            onClick={onClose}
          >
            Понятно
          </button>
          <button
            type="button"
            className="lp-lootbox-unavailable-primary"
            onClick={onRefresh}
            disabled={checking}
          >
            {checking ? "Проверяем..." : "Проверить условия"}
          </button>
        </div>
      </div>
    </div>
  );
}
