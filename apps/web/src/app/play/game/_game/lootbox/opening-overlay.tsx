"use client";

import type {
  HomeLootCard,
  LootboxOverlayPhase,
  LootboxRouletteState,
} from "../types";
import {
  type RefObject,
  useRef,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type CSSProperties,
} from "react";
import { LOOTBOX_RARITY_LABELS } from "../constants";
import { lootboxSkinForRarity } from "@/lib/lootbox-assets";
import {
  lootBoxPrizeCardColorStyle,
  LootBoxPrizeVisual,
} from "@/components/lootbox-prize-visual";
import Image from "next/image";
import { normalizeLootboxRarity } from "./rarity";
import { lootboxRouletteEventDetail, emitLootboxEvent } from "./roulette";
import { LockIcon } from "../icons";

export function LootboxOpeningOverlay({
  card,
  phase,
  roulette,
  errorMessage,
  checkingConditions,
  rewardRef,
  onOpen,
  onClose,
  onCollect,
  onRefreshConditions,
  onRouletteFinish,
}: {
  card: HomeLootCard;
  phase: LootboxOverlayPhase;
  roulette: LootboxRouletteState | null;
  errorMessage: string | null;
  checkingConditions: boolean;
  rewardRef: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
  onClose: () => void;
  onCollect: () => void;
  onRefreshConditions: () => void;
  onRouletteFinish: (skipped: boolean) => void;
}) {
  const rouletteTrackRef = useRef<HTMLDivElement | null>(null);
  const rouletteAnimationRef = useRef<Animation | null>(null);
  const completeRouletteRef = useRef<((skipped: boolean) => void) | null>(null);
  const onRouletteFinishRef = useRef(onRouletteFinish);
  const isReady = phase === "ready";
  const isCharging = phase === "charging";
  const isRolling = phase === "rolling";
  const isOpening = phase === "opening";
  const isOpen = phase === "open";
  const isCollected = phase === "collected";
  const rewardRarity =
    normalizeLootboxRarity(roulette?.rarity ?? card.rewardRarity) ?? "common";
  const rewardRarityLabel =
    roulette?.rarityLabel ??
    card.rewardRarityLabel ??
    LOOTBOX_RARITY_LABELS[rewardRarity];
  const caseRarity = normalizeLootboxRarity(card.caseRarity) ?? "common";
  const rarityRevealed = isOpening || isOpen || isCollected;
  const visibleLootboxSkin = lootboxSkinForRarity(caseRarity);
  const rouletteVisible =
    Boolean(roulette) && (isRolling || isOpening || isOpen || isCollected);
  const rouletteResultLabel = !roulette
    ? "selection pending"
    : isRolling
      ? "selection in progress"
      : `${roulette.reward} / ${rewardRarityLabel}`;
  const statusLabel = isCollected
    ? "Награда сохранена"
    : isOpen
      ? "Контейнер открыт"
      : isOpening
        ? `Редкость: ${rewardRarityLabel}`
        : isRolling
          ? "Идет рулетка наград"
          : isCharging
            ? "Контейнер активируется"
            : "Нажмите на контейнер, чтобы открыть";
  const primaryActionLabel = isCollected
    ? "Готово"
    : isOpen
      ? "Забрать результат"
      : isOpening || isCharging || isRolling
        ? "Открывается"
        : errorMessage
          ? "Попробовать еще раз"
          : "Открыть контейнер";
  const handlePrimaryAction = isCollected
    ? onClose
    : isOpen
      ? onCollect
      : isReady
        ? onOpen
        : undefined;

  useEffect(() => {
    onRouletteFinishRef.current = onRouletteFinish;
  }, [onRouletteFinish]);

  useEffect(() => {
    const track = rouletteTrackRef.current;

    if (!isRolling || !roulette || !track) {
      completeRouletteRef.current = null;
      return;
    }

    const rouletteTrack = track;
    let animationFrameId = 0;
    let finishTimerId = 0;
    let settled = false;
    const startX = 96;

    function clearRouletteAnimation() {
      if (!rouletteAnimationRef.current) {
        return;
      }

      rouletteAnimationRef.current.onfinish = null;
      rouletteAnimationRef.current.oncancel = null;
      rouletteAnimationRef.current.cancel();
      rouletteAnimationRef.current = null;
    }

    rouletteTrack.style.transform = `translate3d(${startX}px, 0, 0)`;

    animationFrameId = window.requestAnimationFrame(() => {
      const winningCard = rouletteTrack.querySelector<HTMLElement>(
        '[data-winning="true"]',
      );

      if (!winningCard) {
        onRouletteFinishRef.current(false);
        return;
      }

      const selectedWinningCard = winningCard;
      const cardCenter =
        selectedWinningCard.offsetLeft + selectedWinningCard.offsetWidth / 2;
      const endX = -cardCenter;
      const baseDetail = lootboxRouletteEventDetail(roulette, false);

      function completeRoulette(skipped = false) {
        if (settled) {
          return;
        }

        settled = true;
        clearRouletteAnimation();
        completeRouletteRef.current = null;
        rouletteTrack.style.transform = `translate3d(${endX}px, 0, 0)`;
        selectedWinningCard.classList.add("is-winning");

        const finishDetail = {
          ...baseDetail,
          skipped,
        };

        if (skipped) {
          emitLootboxEvent("roulette-skip", finishDetail);
        }

        emitLootboxEvent("roulette-finish", finishDetail);
        finishTimerId = window.setTimeout(
          () => onRouletteFinishRef.current(skipped),
          skipped ? 60 : 540,
        );
      }

      completeRouletteRef.current = completeRoulette;
      emitLootboxEvent("roulette-start", {
        lootBoxId: roulette.lootBoxId,
        durationMs: roulette.durationMs,
        possibleRewards: roulette.items.length,
      });

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const duration = reduceMotion ? 1 : roulette.durationMs;

      rouletteAnimationRef.current = track.animate(
        [
          { transform: `translate3d(${startX}px, 0, 0)` },
          { transform: `translate3d(${endX + 760}px, 0, 0)`, offset: 0.54 },
          { transform: `translate3d(${endX + 320}px, 0, 0)`, offset: 0.76 },
          { transform: `translate3d(${endX + 118}px, 0, 0)`, offset: 0.89 },
          { transform: `translate3d(${endX + 34}px, 0, 0)`, offset: 0.97 },
          { transform: `translate3d(${endX}px, 0, 0)` },
        ],
        {
          duration,
          easing: "cubic-bezier(0.12, 0.02, 0.14, 1)",
          fill: "forwards",
        },
      );

      rouletteAnimationRef.current.onfinish = () => completeRoulette(false);
      rouletteAnimationRef.current.oncancel = () => {
        if (settled) {
          return;
        }

        completeRouletteRef.current = null;
        rouletteAnimationRef.current = null;
      };
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(finishTimerId);

      if (!settled) {
        clearRouletteAnimation();
      }

      completeRouletteRef.current = null;
    };
  }, [isRolling, roulette]);

  function handleMachineKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!isReady || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    onOpen();
  }

  function handleSkipRoulette(event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    completeRouletteRef.current?.(true);
  }

  return (
    <div
      id="lootboxOverlay"
      className={[
        "lp-lootbox-overlay",
        `rarity-${rewardRarity}`,
        rarityRevealed ? "rarity-revealed" : "rarity-hidden",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lootboxOverlayTitle"
    >
      <div className="lp-lootbox-dialog">
        <button
          type="button"
          className="lp-lootbox-close"
          aria-label="Закрыть окно лутбокса"
          onClick={onClose}
        >
          ×
        </button>

        <div className="lp-lootbox-dialog-head">
          <span className="lp-lootbox-kicker">Открытие лутбокса</span>
          <h3 id="lootboxOverlayTitle">{card.title}</h3>
          <p>{statusLabel}</p>
        </div>

        {errorMessage ? (
          <div className="lp-lootbox-open-error" role="alert">
            <span>Почему не открывается</span>
            <strong>{errorMessage}</strong>
            <button
              type="button"
              onClick={onRefreshConditions}
              disabled={checkingConditions}
            >
              {checkingConditions ? "Проверяем..." : "Проверить условия"}
            </button>
          </div>
        ) : null}

        {rouletteVisible && roulette ? (
          <div
            className={[
              "lp-lootbox-roulette",
              isRolling ? "is-visible" : "",
              !isRolling ? "is-finished" : "",
            ].join(" ")}
            aria-hidden={isCollected}
          >
            <div className="lp-lootbox-roulette-window">
              <div ref={rouletteTrackRef} className="lp-lootbox-roulette-track">
                {roulette.items.map((item, index) => {
                  const isWinner = Boolean(item.isWinner);
                  const canCollect = isWinner && isOpen;
                  const itemRarity =
                    rarityRevealed && item.rarity ? item.rarity : "hidden";
                  const itemCaption = isWinner
                    ? isCollected
                      ? "Получено"
                      : canCollect
                        ? "Забрать"
                        : rarityRevealed
                          ? item.caption
                          : "locked"
                    : rarityRevealed
                      ? item.caption
                      : "locked";

                  return (
                    <button
                      key={`${item.id}-${index}`}
                      type="button"
                      ref={isWinner ? rewardRef : undefined}
                      className={[
                        "lp-lootbox-roulette-card",
                        isWinner && !isRolling ? "is-winning" : "",
                        canCollect ? "can-collect" : "",
                        isWinner && isCollected ? "is-collected" : "",
                      ].join(" ")}
                      data-rarity={itemRarity}
                      data-winning={isWinner ? "true" : undefined}
                      style={lootBoxPrizeCardColorStyle(item)}
                      disabled={!canCollect}
                      tabIndex={canCollect ? 0 : -1}
                      aria-label={
                        canCollect
                          ? `Забрать награду ${item.reward}`
                          : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation();

                        if (canCollect) {
                          onCollect();
                        }
                      }}
                    >
                      <strong>{item.reward}</strong>
                      <LootBoxPrizeVisual
                        alt=""
                        className="lp-lootbox-roulette-visual"
                        imageUrl={item.imageUrl}
                        iconKey={item.iconKey}
                        rewardType={item.rewardType}
                      />
                      <span>{itemCaption}</span>
                    </button>
                  );
                })}
              </div>
              <span className="lp-lootbox-roulette-marker" aria-hidden="true" />
            </div>
            <div className="lp-lootbox-roulette-caption">
              <span>possible rewards</span>
              <strong>{rouletteResultLabel}</strong>
              <button
                type="button"
                className="lp-lootbox-roulette-skip"
                hidden={!isRolling}
                onClick={handleSkipRoulette}
              >
                Пропустить
              </button>
            </div>
          </div>
        ) : null}

        <div
          className={[
            "lp-lootbox-machine",
            isReady ? "is-ready" : "",
            isCharging ? "is-charging" : "",
            isRolling ? "is-rolling" : "",
            isOpening ? "is-opening" : "",
            isOpen || isCollected ? "is-open" : "",
            isCollected ? "is-collected" : "",
          ].join(" ")}
          role={isReady ? "button" : undefined}
          tabIndex={isReady ? 0 : undefined}
          aria-label={isReady ? "Открыть лутбокс" : undefined}
          onClick={isReady ? onOpen : undefined}
          onKeyDown={handleMachineKeyDown}
        >
          <span className="lp-lootbox-energy-field" aria-hidden="true" />
          <span className="lp-lootbox-shock-ring" aria-hidden="true" />
          <span className="lp-lootbox-energy-slit" aria-hidden="true" />
          <span className="lp-lootbox-beam" />
          <Image
            className="lp-lootbox-case-image"
            src={visibleLootboxSkin}
            alt=""
            width={1024}
            height={1024}
            sizes="(max-width: 768px) 88vw, 500px"
            aria-hidden="true"
            draggable={false}
          />
          <span className="lp-lootbox-lock-open" aria-hidden="true">
            <LockIcon />
          </span>
          {Array.from({ length: 9 }, (_, index) => (
            <span
              key={index}
              className="lp-lootbox-particle"
              style={{ "--particle-index": index } as CSSProperties}
            />
          ))}
        </div>

        <div className="lp-lootbox-dialog-actions">
          <button
            type="button"
            className="lp-club-ghost-link"
            onClick={onClose}
          >
            Закрыть
          </button>
          <button
            type="button"
            className="lp-club-primary-link"
            disabled={
              isOpening || isCharging || isRolling || checkingConditions
            }
            onClick={handlePrimaryAction}
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
