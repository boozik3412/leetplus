"use client";

import type { GuestPortalGameSummary } from "@/lib/guest-portal";
import { useState, useMemo, type CSSProperties } from "react";
import type {
  RewardHistorySourceFilter,
  RewardHistoryRarityFilter,
  RewardHistorySource,
  GameRewardHistoryItem,
} from "../types";
import {
  REWARD_HISTORY_PAGE_SIZE,
  REWARD_HISTORY_SOURCE_ORDER,
  REWARD_HISTORY_SOURCE_LABELS,
  REWARD_HISTORY_RARITY_ORDER,
  REWARD_HISTORY_RARITY_LABELS,
  REWARD_HISTORY_SOURCE_ROW_LABELS,
  REWARD_HISTORY_SOURCE_TONES,
  REWARD_HISTORY_RARITY_ROW_LABELS,
} from "../constants";
import Link from "next/link";
import { formatNumber } from "../format";
import {
  buildCanonicalRewardHistory,
  buildRewardHistoryClubOptions,
  rewardHistoryClubKey,
  buildRewardHistoryTotals,
  filterRewardHistory,
  groupRewardHistory,
  rewardHistorySource,
  rewardHistoryRarity,
  rewardHistoryOccurredAt,
  rewardHistoryClubLabel,
  formatRewardHistoryTime,
} from "./history";
import { walletStateLabel, rewardHistoryValue } from "../reward-labels";

export function RewardJournalPanel({
  summary,
  standalone = false,
}: {
  summary: GuestPortalGameSummary;
  standalone?: boolean;
}) {
  const [activeClub, setActiveClub] = useState("all");
  const [activeSourceFilter, setActiveSourceFilter] =
    useState<RewardHistorySourceFilter>("all");
  const [activeRarityFilter, setActiveRarityFilter] =
    useState<RewardHistoryRarityFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleRewardCount, setVisibleRewardCount] = useState(
    REWARD_HISTORY_PAGE_SIZE,
  );
  const rewardHistory = useMemo(
    () => buildCanonicalRewardHistory(summary),
    [summary],
  );
  const clubOptions = useMemo(
    () => buildRewardHistoryClubOptions(rewardHistory),
    [rewardHistory],
  );
  const effectiveActiveClub = clubOptions.some(
    (option) => option.id === activeClub,
  )
    ? activeClub
    : "all";

  const scopedRewards = useMemo(
    () =>
      effectiveActiveClub === "all"
        ? rewardHistory
        : rewardHistory.filter(
            (item) => rewardHistoryClubKey(item) === effectiveActiveClub,
          ),
    [effectiveActiveClub, rewardHistory],
  );
  const totals = useMemo(
    () => buildRewardHistoryTotals(scopedRewards),
    [scopedRewards],
  );
  const filteredRewards = useMemo(
    () =>
      filterRewardHistory(scopedRewards, {
        sourceFilter: activeSourceFilter,
        rarityFilter: activeRarityFilter,
        query: searchQuery,
      }),
    [activeSourceFilter, activeRarityFilter, scopedRewards, searchQuery],
  );
  const visibleRewards = useMemo(
    () => filteredRewards.slice(0, visibleRewardCount),
    [filteredRewards, visibleRewardCount],
  );
  const groupedRewards = useMemo(
    () => groupRewardHistory(visibleRewards),
    [visibleRewards],
  );
  const hasRewards = scopedRewards.length > 0;
  const hasMoreRewards = visibleRewards.length < filteredRewards.length;
  const hasActiveFilters =
    effectiveActiveClub !== "all" ||
    activeSourceFilter !== "all" ||
    activeRarityFilter !== "all" ||
    Boolean(searchQuery.trim());

  function toggleSourceFilter(source: RewardHistorySource) {
    setActiveSourceFilter((current) => (current === source ? "all" : source));
    setVisibleRewardCount(REWARD_HISTORY_PAGE_SIZE);
  }

  function resetRewardHistoryFilters() {
    setActiveClub("all");
    setActiveSourceFilter("all");
    setActiveRarityFilter("all");
    setSearchQuery("");
    setVisibleRewardCount(REWARD_HISTORY_PAGE_SIZE);
  }

  return (
    <section
      id="rewards"
      className={[
        "lp-club-panel lp-reward-journal",
        standalone ? "is-standalone" : "",
      ].join(" ")}
      aria-label="История наград"
    >
      <header className="lp-reward-journal-head">
        <div className="lp-reward-journal-title">
          <Link
            href={standalone ? "/game" : "#profile"}
            className="lp-reward-back-link"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m11.75 4.75-5.25 5.25 5.25 5.25" />
              <path d="M7 10h7" />
            </svg>
            <span>Назад в модуль</span>
          </Link>
          <h2>История наград</h2>
          <p>Все полученные награды — в одном месте.</p>
        </div>
        <span className="lp-reward-sync-pill">История обновлена</span>
      </header>

      <div
        className="lp-reward-filter-panel"
        aria-label="Фильтры истории наград"
      >
        <label className="lp-reward-scope-field">
          <span className="lp-club-small-label">Клуб</span>
          <select
            value={effectiveActiveClub}
            onChange={(event) => {
              setActiveClub(event.target.value);
              setVisibleRewardCount(REWARD_HISTORY_PAGE_SIZE);
            }}
          >
            {clubOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.scope}
              </option>
            ))}
          </select>
        </label>
        <label className="lp-reward-search">
          <span className="lp-club-small-label">Поиск</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Найти награду"
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setVisibleRewardCount(REWARD_HISTORY_PAGE_SIZE);
            }}
          />
        </label>
        <div className="lp-reward-source-filter">
          <span className="lp-club-small-label">Источник</span>
          <div className="lp-reward-source-options">
            <button
              type="button"
              className={activeSourceFilter === "all" ? "is-active" : ""}
              aria-pressed={activeSourceFilter === "all"}
              onClick={() => {
                setActiveSourceFilter("all");
                setVisibleRewardCount(REWARD_HISTORY_PAGE_SIZE);
              }}
            >
              Все <span>{formatNumber(totals.total)}</span>
            </button>
            {REWARD_HISTORY_SOURCE_ORDER.filter(
              (source) => totals.source[source] > 0,
            ).map((source) => (
              <button
                key={source}
                type="button"
                className={activeSourceFilter === source ? "is-active" : ""}
                aria-pressed={activeSourceFilter === source}
                onClick={() => toggleSourceFilter(source)}
              >
                {REWARD_HISTORY_SOURCE_LABELS[source]}{" "}
                <span>{formatNumber(totals.source[source])}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="lp-reward-rarity-field">
          <span className="lp-club-small-label">Редкость</span>
          <select
            value={activeRarityFilter}
            onChange={(event) => {
              setActiveRarityFilter(
                event.target.value as RewardHistoryRarityFilter,
              );
              setVisibleRewardCount(REWARD_HISTORY_PAGE_SIZE);
            }}
          >
            <option value="all">Любая</option>
            {REWARD_HISTORY_RARITY_ORDER.map((rarity) => (
              <option key={rarity} value={rarity}>
                {REWARD_HISTORY_RARITY_LABELS[rarity]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="lp-reward-reset"
          disabled={!hasActiveFilters}
          onClick={resetRewardHistoryFilters}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M15.2 6.1A6 6 0 1 0 16 10" />
            <path d="M15.2 2.8v3.7h-3.7" />
          </svg>
          Сбросить
        </button>
      </div>

      <section className="lp-reward-list-panel" aria-label="Список наград">
        {filteredRewards.length ? (
          <div className="lp-reward-list">
            {groupedRewards.map((group) => (
              <section key={group.key} className="lp-reward-group">
                <header className="lp-reward-group-head">
                  <h3>{group.title}</h3>
                </header>
                <div className="lp-reward-group-entries">
                  {group.items.map((item) => (
                    <RewardAchievementCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ))}
            {hasMoreRewards ? (
              <button
                type="button"
                className="lp-reward-load-more"
                onClick={() =>
                  setVisibleRewardCount(
                    (current) => current + REWARD_HISTORY_PAGE_SIZE,
                  )
                }
              >
                Показать ещё
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : (
          <p className="lp-reward-empty-copy">
            {hasRewards
              ? "Наград по выбранным условиям пока нет."
              : "Награды и начисления появятся здесь после лутбоксов, квестов, боевого пропуска или промокодов."}
          </p>
        )}
      </section>
    </section>
  );
}

export function RewardAchievementCard({ item }: { item: GameRewardHistoryItem }) {
  const source = rewardHistorySource(item);
  const rarity = rewardHistoryRarity(item);
  const occurredAt = rewardHistoryOccurredAt(item);

  return (
    <article
      className={`lp-reward-achievement-card rarity-${rarity}`}
      title={`${item.sourceLabel ?? REWARD_HISTORY_SOURCE_ROW_LABELS[source]} · ${rewardHistoryClubLabel(item)} · ${walletStateLabel(item.walletState)}`}
      style={
        {
          "--source-tone": REWARD_HISTORY_SOURCE_TONES[source],
        } as CSSProperties
      }
    >
      <span className="lp-reward-timeline-dot" aria-hidden="true" />
      <time dateTime={occurredAt} className="lp-reward-achievement-time">
        {formatRewardHistoryTime(occurredAt)}
      </time>
      <span className="lp-reward-achievement-source">
        <span aria-hidden="true" />
        {REWARD_HISTORY_SOURCE_ROW_LABELS[source]}
      </span>
      <span className="lp-reward-achievement-main">
        <strong>{item.rewardLabel}</strong>
      </span>
      <span className="lp-reward-rarity-label">
        <span aria-hidden="true" />
        {REWARD_HISTORY_RARITY_ROW_LABELS[rarity]}
      </span>
      <span className="lp-reward-value">{rewardHistoryValue(item)}</span>
    </article>
  );
}
