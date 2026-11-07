"use client";

import type { RefObject } from "react";
import type { HomeLootCard } from "../types";
import Image from "next/image";
import { lootboxSkinForRarity } from "@/lib/lootbox-assets";
import { RefreshIcon, ClubIcon, LockIcon } from "../icons";
import {
  lootboxCardBlockedTooltip,
  lootboxWalletStatusLabel,
  lootboxCardHint,
} from "./hints";

export function HomeLootBoxes({
  sectionRef,
  cards,
  refreshPending,
  onRefresh,
  onSelect,
}: {
  sectionRef?: RefObject<HTMLElement | null>;
  cards: HomeLootCard[];
  refreshPending: boolean;
  onRefresh: () => void;
  onSelect: (card: HomeLootCard) => void;
}) {
  return (
    <section
      id="lootBoxes"
      ref={sectionRef}
      className="lp-club-panel lp-club-lootboxes"
      aria-label="Лутбоксы"
    >
      <div className="lp-club-section-head">
        <span>
          <h2>Лутбоксы</h2>
          <p>
            Быстрые награды за активность в клубе и прохождение цепочки заданий.
          </p>
        </span>
        <button
          type="button"
          className="lp-club-icon-badge lp-club-refresh-button"
          onClick={onRefresh}
          disabled={refreshPending}
          aria-label={
            refreshPending ? "Обновляем лутбоксы" : "Обновить лутбоксы"
          }
        >
          <RefreshIcon />
        </button>
      </div>

      <div className="lp-club-loot-grid">
        {cards.length ? (
          cards.map((card, index) => {
            const blockedReason = lootboxCardBlockedTooltip(card);

            return (
              <button
                key={card.id}
                type="button"
                className={[
                  "lootbox-entry",
                  "lp-lootbox-entry",
                  card.active ? "is-active" : "",
                  !card.openable ? "is-disabled" : "",
                  card.walletStatus ? "has-wallet-reward" : "",
                ].join(" ")}
                aria-haspopup="dialog"
                aria-controls={
                  card.openable ? "lootboxOverlay" : "lootboxUnavailable"
                }
                onClick={() => onSelect(card)}
              >
                <span className="lp-lootbox-entry-top">
                  <span>
                    <span className="lp-lootbox-entry-label">
                      {index === 0 ? "Лутбокс дня" : "Клубный контейнер"}
                    </span>
                    <strong>{card.title}</strong>
                  </span>
                  <span className="lp-lootbox-entry-state-wrap">
                    <span
                      className={[
                        "lp-lootbox-entry-state",
                        card.walletReady ? "is-wallet-ready" : "",
                      ].join(" ")}
                    >
                      {card.status}
                    </span>
                    {blockedReason ? (
                      <span className="lp-lootbox-blocker-chip">почему?</span>
                    ) : null}
                  </span>
                </span>
                <span className="lp-lootbox-entry-art" aria-hidden="true">
                  <Image
                    src={lootboxSkinForRarity(card.caseRarity)}
                    alt=""
                    width={1024}
                    height={1024}
                    sizes="230px"
                    draggable={false}
                  />
                </span>
                <span className="lp-lootbox-entry-bottom">
                  {card.walletStatus ? (
                    <span className="lp-lootbox-wallet-ready">
                      <ClubIcon />
                      {lootboxWalletStatusLabel(
                        card.walletStatus,
                        card.walletReady,
                      )}
                    </span>
                  ) : (
                    <>
                      <span className="lp-lootbox-entry-hint">
                        {lootboxCardHint(card)}
                      </span>
                      <span className="lp-lootbox-mini-lock" aria-hidden="true">
                        <LockIcon />
                      </span>
                    </>
                  )}
                </span>
              </button>
            );
          })
        ) : (
          <p className="lp-club-loot-empty">
            Клуб пока не опубликовал активные лутбоксы.
          </p>
        )}
      </div>
    </section>
  );
}
