"use client";

import type { PlayerQuest, QuestBoardStyle } from "../types";
import { formatNumber } from "../format";
import { GuestMissionPreview } from "@/components/guest-mission-preview";
import { buildQuestGroups } from "./player-quests";
import { rewardWalletItemCompactStatus } from "../rewards/wallet-card";

export function QuestBoard({
  quests,
  total,
  loading,
  error,
  nextOffset,
  expanded,
  style,
  onClose,
  onQuestClick,
  onLoadMore,
}: {
  quests: PlayerQuest[];
  total: number;
  loading: boolean;
  error: string | null;
  nextOffset: number | null;
  expanded: boolean;
  style: QuestBoardStyle;
  onClose: () => void;
  onQuestClick: (quest: PlayerQuest) => void;
  onLoadMore: () => void;
}) {
  const groups = buildQuestGroups(quests);

  return (
    <section
      id="questBoard"
      className={[
        "lp-club-quest-board quest-board",
        expanded ? "is-open" : "",
      ].join(" ")}
      aria-label="Все квесты игрока"
      aria-hidden={!expanded}
      style={style}
    >
      <div className="lp-club-quest-board-head">
        <div>
          <span className="lp-club-small-label">Квесты</span>
          <h2>Экран задач</h2>
          <p>
            Показано {formatNumber(quests.length)} из {formatNumber(total)}{" "}
            задач клуба, сгруппированных по состоянию.
          </p>
        </div>
        <button
          id="questBoardClose"
          type="button"
          className="lp-club-quest-board-close quest-board-close"
          disabled={!expanded}
          onClick={onClose}
        >
          Свернуть
        </button>
      </div>

      <div className="lp-club-quest-board-list">
        {groups.map((group) => (
          <section
            key={group.id}
            className="lp-club-quest-group"
            aria-label={group.ariaLabel}
          >
            <div className="lp-club-quest-group-head">
              <strong>{group.title}</strong>
              <span>{formatNumber(group.items.length)}</span>
            </div>

            {group.items.length ? (
              group.items.map((quest) => (
                <button
                  key={quest.id}
                  type="button"
                  className={[
                    "lp-club-quest-full-card",
                    quest.status === "done" ? "is-done" : "",
                    quest.status === "live" ? "is-current" : "",
                    quest.walletItem ? "has-wallet-reward" : "",
                  ].join(" ")}
                  disabled={!expanded}
                  aria-haspopup="dialog"
                  onClick={() => onQuestClick(quest)}
                >
                  <GuestMissionPreview
                    data={quest.preview}
                    mode="compact"
                    showLabels={false}
                    className="!m-0 !w-full !max-w-full !p-0"
                  />
                  {quest.walletItem ? (
                    <span className="lp-club-side-quest-claim">
                      {rewardWalletItemCompactStatus(quest.walletItem)}
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="lp-club-quest-group-empty">Пока пусто</div>
            )}
          </section>
        ))}

        <div className="lp-club-quest-board-pagination">
          {error ? <p role="alert">{error}</p> : null}
          {nextOffset !== null || error ? (
            <button
              type="button"
              className="lp-club-quest-board-load-more"
              disabled={!expanded || loading}
              onClick={onLoadMore}
            >
              {loading ? "Загружаем…" : error ? "Повторить" : "Показать ещё"}
            </button>
          ) : loading ? (
            <p role="status">Загружаем задания…</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
