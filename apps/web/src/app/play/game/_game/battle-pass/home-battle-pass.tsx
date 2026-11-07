"use client";

import {
  type RefObject,
  useMemo,
  useState,
  useRef,
  type CSSProperties,
  useEffect,
} from "react";
import type { GuestPortalGameSummary } from "@/lib/guest-portal";
import type { HomeBattleQuest, BattlePassRewardCard } from "../types";
import { clampPercent, formatNumber } from "../format";
import Image from "next/image";
import { lootboxSkinForRarity } from "@/lib/lootbox-assets";
import {
  buildBattlePassRewardCards,
  emitBattlePassEvent,
  battlePassRewardEventDetail,
  battlePassSeasonTimeLabel,
  battlePassRewardStatusLabel,
  battlePassRewardTypeLabel,
  battlePassTokenDensity,
} from "./rewards";
import {
  BattlePassQuestModal,
  BattlePassHelpModal,
  BattlePassSeasonRewardsModal,
} from "./modals";

export function HomeBattlePass({
  sectionRef,
  summary,
  battlePass,
  quests,
  progress,
  rewardLabel,
  seasonName,
}: {
  sectionRef?: RefObject<HTMLElement | null>;
  summary: GuestPortalGameSummary;
  battlePass: GuestPortalGameSummary["battlePass"]["active"];
  quests: HomeBattleQuest[];
  progress: number;
  rewardLabel: string;
  seasonName: string;
}) {
  const rewards = useMemo(
    () => buildBattlePassRewardCards(battlePass, quests),
    [battlePass, quests],
  );
  const initialRewardId =
    rewards.find((reward) => reward.status === "ready")?.id ??
    rewards.find((reward) => reward.status === "current")?.id ??
    rewards[0]?.id ??
    null;
  const [activeRewardId, setActiveRewardId] = useState<string | null>(null);
  const [detailRewardId, setDetailRewardId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [seasonRewardsOpen, setSeasonRewardsOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const lastScrollEventRef = useRef(0);
  const selectedRewardId =
    activeRewardId && rewards.some((reward) => reward.id === activeRewardId)
      ? activeRewardId
      : initialRewardId;

  const activeReward =
    rewards.find((reward) => reward.id === selectedRewardId) ??
    rewards.find((reward) => reward.status === "ready") ??
    rewards.find((reward) => reward.status === "current") ??
    rewards[0] ??
    null;
  const currentReward =
    rewards.find((reward) => reward.status === "current") ??
    rewards.find((reward) => reward.status === "ready") ??
    activeReward;
  const detailReward = detailRewardId
    ? (rewards.find((reward) => reward.id === detailRewardId) ?? null)
    : null;
  const totalLevels = Math.max(
    rewards.length,
    battlePass?.levels.length ?? 0,
    1,
  );
  const currentLevel = Math.min(
    totalLevels,
    Math.max(
      0,
      battlePass?.currentLevel ??
        currentReward?.level ??
        activeReward?.level ??
        0,
    ),
  );
  const levelLineScale =
    totalLevels > 1
      ? clampPercent(((currentLevel - 1) / (totalLevels - 1)) * 100) / 100
      : 1;
  const progressCountLabel = `${formatNumber(currentLevel)} / ${formatNumber(totalLevels)}`;
  const progressQuestLabel = currentReward?.quest
    ? `Сейчас: ${currentReward.quest.title}`
    : currentReward
      ? `Сейчас: ${currentReward.title}`
      : null;
  const mainReward = rewards[rewards.length - 1] ?? activeReward;
  const mainRewardLevel = mainReward?.level ?? totalLevels;
  const mainRewardLabel =
    mainReward?.type === "lootbox"
      ? mainReward.title
      : rewardLabel || mainReward?.title || "Сезонный контейнер";
  const trackGapExpression = Array.from(
    { length: Math.max(rewards.length - 1, 0) },
    () => "var(--battlepass-card-gap)",
  ).join(" - ");
  const railEdgeOffset =
    rewards.length > 1 && trackGapExpression
      ? `calc((100% - ${trackGapExpression}) / ${rewards.length * 2})`
      : "50%";
  const trackGridStyle = {
    gridTemplateColumns: `repeat(${rewards.length}, minmax(var(--battlepass-card-width), 1fr))`,
  } as CSSProperties;
  const railStyle = {
    ...trackGridStyle,
    "--battlepass-line-scale": String(levelLineScale),
    "--battlepass-rail-edge": railEdgeOffset,
  } as CSSProperties &
    Record<"--battlepass-line-scale" | "--battlepass-rail-edge", string>;

  useEffect(() => {
    if (!detailReward && !helpOpen && !seasonRewardsOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDetailRewardId(null);
        setHelpOpen(false);
        setSeasonRewardsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailReward, helpOpen, seasonRewardsOpen]);

  const handleHelpClick = () => {
    emitBattlePassEvent("help_click", {
      seasonId: battlePass?.id ?? null,
      seasonName,
    });
    setHelpOpen(true);
  };

  const handleTrackScroll = () => {
    const track = trackRef.current;
    const now = Date.now();

    if (!track || now - lastScrollEventRef.current < 260) {
      return;
    }

    lastScrollEventRef.current = now;
    emitBattlePassEvent("track_scroll", {
      seasonId: battlePass?.id ?? null,
      scrollLeft: Math.round(track.scrollLeft),
      scrollWidth: track.scrollWidth,
      clientWidth: track.clientWidth,
    });
  };

  const focusReward = (reward: BattlePassRewardCard) => {
    setActiveRewardId(reward.id);
    emitBattlePassEvent(
      "level_focus",
      battlePassRewardEventDetail(reward, battlePass),
    );
  };

  const clickReward = (reward: BattlePassRewardCard, element: HTMLElement) => {
    focusReward(reward);
    element.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    emitBattlePassEvent(
      "reward_click",
      battlePassRewardEventDetail(reward, battlePass),
    );

    if (reward.status === "ready") {
      emitBattlePassEvent(
        "reward_claim",
        battlePassRewardEventDetail(reward, battlePass),
      );
    }

    setDetailRewardId(reward.id);
  };

  return (
    <section
      id="battlePass"
      ref={sectionRef}
      className="lp-club-panel lp-club-battlepass"
      aria-label="Боевой пропуск"
    >
      <div className="lp-club-battlepass-head">
        <span className="lp-club-battlepass-title">
          <h2>Боевой пропуск</h2>
          <p>Премиальная сезонная карта наград для гостей клуба.</p>
        </span>
        <button
          type="button"
          className="lp-club-battlepass-help"
          onClick={handleHelpClick}
        >
          <span aria-hidden="true">?</span>
          Как работает
        </button>
      </div>

      <div className="lp-club-battlepass-top">
        <button
          type="button"
          className="lp-club-battlepass-season lp-club-battlepass-season-button"
          aria-haspopup="dialog"
          onClick={() => setSeasonRewardsOpen(true)}
        >
          <span className="lp-club-battlepass-emblem">
            <picture>
              <source
                srcSet="/assets/brand/leetplus-logo-white.svg?v=battlepass-track"
                media="(prefers-color-scheme: dark)"
              />
              <img
                src="/assets/brand/leetplus-logo-white.svg?v=battlepass-track"
                alt="LeetPlus"
              />
            </picture>
          </span>
          <span className="lp-club-battlepass-season-copy">
            <strong>{seasonName}</strong>
            <span>
              <b>{formatNumber(progress)}%</b>
              {battlePassSeasonTimeLabel(battlePass?.periodTo)}
            </span>
            <small>Все награды сезона</small>
          </span>
        </button>

        <div className="lp-club-battlepass-main-reward">
          <span className="lp-club-battlepass-main-copy">
            <small>Главная награда</small>
            <strong>Сезонный контейнер</strong>
            <span>{mainRewardLabel}</span>
            <em>Открывается на шаге {formatNumber(mainRewardLevel)}</em>
          </span>
          <span className="lp-club-battlepass-main-case">
            <Image
              src={lootboxSkinForRarity(mainReward?.rarity ?? "legendary")}
              alt=""
              width={280}
              height={190}
              sizes="(max-width: 560px) 48vw, 220px"
            />
          </span>
        </div>
      </div>

      <div
        className="lp-club-battlepass-track"
        aria-label="Очередь наград боевого пропуска"
      >
        <div
          ref={trackRef}
          className="lp-club-battlepass-track-scroll"
          onScroll={handleTrackScroll}
        >
          <div className="lp-club-battlepass-track-inner">
            <div className="lp-club-battlepass-level-rail" style={railStyle}>
              {rewards.map((reward) => (
                <button
                  key={`level-${reward.id}`}
                  type="button"
                  className={[
                    "lp-club-battlepass-level",
                    reward.status === "claimed" ? "is-done" : "",
                    reward.id === activeReward?.id ? "is-active" : "",
                  ].join(" ")}
                  aria-label={`Шаг ${formatNumber(reward.level)}`}
                  onClick={() => focusReward(reward)}
                  onFocus={() => focusReward(reward)}
                >
                  {formatNumber(reward.level)}
                </button>
              ))}
            </div>

            <div
              className="lp-club-battlepass-reward-grid"
              style={trackGridStyle}
            >
              {rewards.map((reward) => {
                const isActive = reward.id === activeReward?.id;

                return (
                  <button
                    key={reward.id}
                    type="button"
                    className={[
                      "lp-club-battlepass-reward",
                      reward.type === "lootbox" ? "is-case" : "",
                      isActive ? "is-active" : "",
                      reward.status === "locked" ? "is-locked" : "",
                      reward.status === "ready" ? "is-ready" : "",
                      reward.status === "claimed" ? "is-claimed" : "",
                    ].join(" ")}
                    data-rank={reward.rarity}
                    data-status={battlePassRewardStatusLabel(reward.status)}
                    data-reward-id={reward.id}
                    onClick={(event) =>
                      clickReward(reward, event.currentTarget)
                    }
                    onFocus={() => focusReward(reward)}
                  >
                    <span className="lp-club-battlepass-reward-media">
                      <BattlePassRewardMedia reward={reward} />
                    </span>
                    <span className="lp-club-battlepass-reward-copy">
                      <strong>{reward.title}</strong>
                      <small>{reward.subtitle}</small>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="lp-club-battlepass-progress">
              <span className="lp-club-battlepass-meter">
                <i style={{ width: `${clampPercent(progress)}%` }} />
              </span>
              <span className="lp-club-battlepass-progress-copy">
                <strong>{progressCountLabel}</strong>
                {progressQuestLabel ? (
                  <small>{progressQuestLabel}</small>
                ) : null}
              </span>
            </div>
          </div>
        </div>
      </div>

      {detailReward ? (
        <BattlePassQuestModal
          reward={detailReward}
          summary={summary}
          onClose={() => setDetailRewardId(null)}
        />
      ) : null}

      {helpOpen ? (
        <BattlePassHelpModal
          battlePass={battlePass}
          seasonName={seasonName}
          progress={progress}
          totalLevels={totalLevels}
          currentLevel={currentLevel}
          currentReward={currentReward}
          mainRewardLabel={mainRewardLabel}
          mainRewardLevel={mainRewardLevel}
          onClose={() => setHelpOpen(false)}
        />
      ) : null}

      {seasonRewardsOpen ? (
        <BattlePassSeasonRewardsModal
          seasonName={seasonName}
          overview={battlePass?.rewardOverview ?? null}
          onClose={() => setSeasonRewardsOpen(false)}
        />
      ) : null}
    </section>
  );
}

export function BattlePassRewardMedia({ reward }: { reward: BattlePassRewardCard }) {
  if (reward.type === "lootbox") {
    return (
      <Image
        src={reward.image ?? lootboxSkinForRarity(reward.rarity)}
        alt=""
        width={180}
        height={130}
        sizes="132px"
      />
    );
  }

  const tokenLabel =
    reward.rewardValue ?? battlePassRewardTypeLabel(reward.type);
  const tokenDensity = battlePassTokenDensity(tokenLabel);

  return (
    <span
      className="lp-club-battlepass-token"
      data-density={tokenDensity}
      data-type={reward.type}
    >
      <span>{tokenLabel}</span>
    </span>
  );
}
