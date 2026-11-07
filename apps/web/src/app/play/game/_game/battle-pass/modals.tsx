"use client";

import type { GuestPortalGameSummary } from "@/lib/guest-portal";
import { formatNumber, clampPercent, formatDate } from "../format";
import type {
  BattlePassLevelCompletionDialog,
  BattlePassRewardCard,
  GameRewardHistoryItem,
} from "../types";
import { RewardLootBoxPreview } from "../lootbox/preview";
import Link from "next/link";
import {
  findBattlePassQuestMission,
  findBattlePassQuestReward,
  findBattlePassQuestLootBoxDrop,
  battlePassRewardStatusLabel,
  stripBattlePassDetailPrefix,
  battlePassDetailProgress,
} from "./rewards";
import { formatMissionStepProgress } from "../quest-progress";
import { lootboxRewardRarityLabel } from "../lootbox/rarity";
import {
  rewardHistoryClaimCode,
  rewardHistoryValue,
  walletStateLabel,
  formatRewardChance,
  walletStateHint,
} from "../reward-labels";

export function BattlePassSeasonRewardsModal({
  seasonName,
  overview,
  onClose,
}: {
  seasonName: string;
  overview:
    | NonNullable<
        GuestPortalGameSummary["battlePass"]["active"]
      >["rewardOverview"]
    | null;
  onClose: () => void;
}) {
  const hasRewards = Boolean(
    overview &&
    (overview.ranges.length ||
      overview.guaranteed.length ||
      overview.possible.length),
  );
  const hasSeasonTotalRows = Boolean(
    overview && (overview.ranges.length || overview.guaranteed.length),
  );

  return (
    <div
      className="lp-quest-complete-overlay lp-battlepass-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battlePassSeasonRewardsTitle"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <div className="lp-quest-complete-dialog lp-battlepass-detail-dialog lp-battlepass-season-rewards-dialog">
        <button
          type="button"
          className="lp-quest-complete-close"
          aria-label="Закрыть награды сезона"
          onClick={onClose}
        >
          ×
        </button>

        <span className="lp-quest-complete-kicker">Награды сезона</span>
        <h3 id="battlePassSeasonRewardsTitle">Что можно заработать</h3>
        <p className="lp-battlepass-season-rewards-lead">
          Полный путь в сезоне {seasonName} открывает все награды ниже. Итог
          зависит от содержимого сезонных лутбоксов.
        </p>

        {hasRewards ? (
          <div className="lp-battlepass-season-rewards-content">
            {hasSeasonTotalRows ? (
              <div className="lp-battlepass-season-reward-group">
                <div className="lp-battlepass-season-range-header">
                  <span className="lp-battlepass-season-reward-heading">
                    Итог за сезон
                  </span>
                  <span>Гарантированно</span>
                  <span>Максимум</span>
                </div>
                <div className="lp-battlepass-season-range-list">
                  {overview?.ranges.map((reward) => (
                    <div
                      key={reward.type}
                      className="lp-battlepass-season-range-row"
                    >
                      <strong>{reward.label}</strong>
                      <b>{formatSeasonRewardValue(reward.min, reward.unit)}</b>
                      <i aria-hidden="true">
                        {reward.min === reward.max ? "" : "→"}
                      </i>
                      <b
                        className={
                          reward.min === reward.max ? "is-empty" : undefined
                        }
                      >
                        {reward.min === reward.max
                          ? "—"
                          : formatSeasonRewardValue(reward.max, reward.unit)}
                      </b>
                    </div>
                  ))}
                  {overview?.guaranteed.map((reward) => (
                    <div
                      key={`guaranteed:${reward.type}:${reward.label}`}
                      className="lp-battlepass-season-range-row is-guaranteed"
                    >
                      <strong>{reward.label}</strong>
                      <span
                        className="lp-battlepass-season-guaranteed-mark"
                        aria-label={
                          reward.quantity > 1
                            ? `Гарантированная награда в количестве ${formatNumber(reward.quantity)}`
                            : "Гарантированная награда"
                        }
                      >
                        {reward.quantity > 1
                          ? `+ ×${formatNumber(reward.quantity)}`
                          : "+"}
                      </span>
                      <i aria-hidden="true" />
                      <b className="is-empty">—</b>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {overview?.possible.length ? (
              <div className="lp-battlepass-season-reward-group">
                <span className="lp-battlepass-season-reward-heading">
                  Возможные призы из лутбоксов
                </span>
                <div className="lp-battlepass-season-possible-list">
                  {overview.possible.map((reward) => (
                    <div key={reward.type}>
                      <strong>{reward.label}</strong>
                      <span>{reward.items.join(" · ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="lp-battlepass-season-rewards-empty">
            Состав наград этого сезона пока уточняется.
          </p>
        )}

        {overview?.unresolved.length ? (
          <p className="lp-battlepass-season-rewards-note">
            Некоторые сезонные контейнеры еще не раскрывают состав призов.
            Диапазон обновится автоматически после их настройки.
          </p>
        ) : null}

        <button
          type="button"
          className="lp-quest-complete-action"
          onClick={onClose}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

export function formatSeasonRewardValue(value: number, unit: string) {
  return `${formatNumber(value)} ${unit}`.trim();
}

export function BattlePassLevelCompletionModal({
  completion,
  acknowledging,
  errorMessage,
  onAcknowledge,
}: {
  completion: BattlePassLevelCompletionDialog;
  acknowledging: boolean;
  errorMessage: string | null;
  onAcknowledge: (openRewards: boolean) => void;
}) {
  const hasNextLevel = completion.nextLevel !== null;

  return (
    <div
      className="lp-quest-complete-overlay lp-battlepass-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battlePassLevelCompleteTitle"
    >
      <div
        className={[
          "lp-quest-complete-dialog lp-battlepass-detail-dialog lp-battlepass-level-complete-dialog",
          completion.rewardLootBox ? "has-lootbox-preview" : "",
        ].join(" ")}
      >
        <span className="lp-quest-complete-kicker">Уровень пройден</span>
        <span className="lp-battlepass-level-complete-mark" aria-hidden="true">
          {formatNumber(completion.completedLevel)}
        </span>
        <h3 id="battlePassLevelCompleteTitle">Поздравляем!</h3>
        <p className="lp-battlepass-level-complete-lead">
          Вы прошли уровень {formatNumber(completion.completedLevel)} баттлпасса
          {completion.completedTitle ? ` — «${completion.completedTitle}»` : ""}
          .
        </p>

        <div className="lp-battlepass-detail-lines">
          <div className="lp-battlepass-detail-line is-reward">
            <span>Награда уровня</span>
            <strong>{completion.rewardLabel}</strong>
            {completion.rewardLootBox ? (
              <RewardLootBoxPreview lootBox={completion.rewardLootBox} />
            ) : null}
          </div>

          {hasNextLevel ? (
            <div className="lp-battlepass-detail-line is-current">
              <span>Следующий уровень</span>
              <strong>
                {formatNumber(completion.nextLevel ?? 0)}.{" "}
                {completion.nextTitle}
              </strong>
              <p>
                Для прохождения следующего уровня вам необходимо:{" "}
                {completion.nextCondition}
              </p>
            </div>
          ) : (
            <div className="lp-battlepass-detail-line is-current">
              <span>Сезон завершен</span>
              <strong>
                Вы прошли весь баттлпасс «{completion.seasonName}».
              </strong>
              <p>Все доступные уровни этого сезона выполнены.</p>
            </div>
          )}
        </div>
        {errorMessage ? (
          <p className="lp-completion-ack-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="lp-completion-ack-actions">
          <button
            type="button"
            className="lp-completion-ack-secondary"
            onClick={() => onAcknowledge(true)}
            disabled={acknowledging}
          >
            Посмотреть награды
          </button>
          <button
            type="button"
            className="lp-quest-complete-action"
            onClick={() => onAcknowledge(false)}
            disabled={acknowledging}
          >
            {acknowledging
              ? "Закрываем..."
              : hasNextLevel
                ? "К следующему уровню"
                : "Отлично"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BattlePassHelpModal({
  battlePass,
  seasonName,
  progress,
  totalLevels,
  currentLevel,
  currentReward,
  mainRewardLabel,
  mainRewardLevel,
  onClose,
}: {
  battlePass: GuestPortalGameSummary["battlePass"]["active"];
  seasonName: string;
  progress: number;
  totalLevels: number;
  currentLevel: number;
  currentReward: BattlePassRewardCard | null;
  mainRewardLabel: string;
  mainRewardLevel: number;
  onClose: () => void;
}) {
  const nextRewardLabel =
    battlePass?.nextRewardLabel ??
    currentReward?.plannedReward ??
    currentReward?.rewardValue ??
    currentReward?.title ??
    mainRewardLabel;

  return (
    <div
      className="lp-quest-complete-overlay lp-battlepass-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battlePassHelpTitle"
    >
      <div className="lp-quest-complete-dialog lp-battlepass-detail-dialog lp-battlepass-help-dialog">
        <button
          type="button"
          className="lp-quest-complete-close"
          aria-label="Закрыть пояснение боевого пропуска"
          onClick={onClose}
        >
          ×
        </button>
        <span className="lp-quest-complete-kicker">Как работает</span>
        <h3 id="battlePassHelpTitle">Боевой пропуск</h3>
        <p className="lp-battlepass-detail-season">
          {seasonName} · шаг {formatNumber(currentLevel)} из{" "}
          {formatNumber(totalLevels)}
        </p>

        <div className="lp-battlepass-detail-progress">
          <div>
            <span>Прогресс сезона</span>
            <strong>{formatNumber(progress)}%</strong>
          </div>
          <span className="lp-battlepass-detail-meter">
            <i style={{ width: `${clampPercent(progress)}%` }} />
          </span>
        </div>

        <div className="lp-battlepass-detail-block">
          <span>Что это</span>
          <p>
            Боевой пропуск собирает цепочку клубных заданий и наград. Выполняйте
            текущую задачу, чтобы продвигаться по этапам сезона.
          </p>
        </div>

        <div className="lp-battlepass-detail-block">
          <span>Как проходить шаги</span>
          <ul className="lp-battlepass-help-list">
            <li>Смотрите карточку с пометкой “Сейчас”.</li>
            <li>Нажмите на этап, чтобы увидеть подробное условие и награду.</li>
            <li>
              Когда условие выполнено, прогресс сезона перейдет к следующему
              этапу.
            </li>
          </ul>
        </div>

        <div className="lp-battlepass-detail-block is-current">
          <span>Награды</span>
          <p>
            Следующая награда: {nextRewardLabel}. Главная награда сезона:{" "}
            {mainRewardLabel}, открывается на шаге{" "}
            {formatNumber(mainRewardLevel)}.
          </p>
        </div>

        {!battlePass ? (
          <p className="lp-battlepass-help-note">
            Сезон пока не запущен. Когда клуб опубликует боевой пропуск, здесь
            появятся этапы, условия и награды.
          </p>
        ) : null}

        <button
          type="button"
          className="lp-quest-complete-action"
          onClick={onClose}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

export function BattlePassQuestModal({
  reward,
  summary,
  onClose,
}: {
  reward: BattlePassRewardCard;
  summary: GuestPortalGameSummary;
  onClose: () => void;
}) {
  const quest = reward.quest ?? null;
  const mission = findBattlePassQuestMission(summary, reward);
  const actualReward = findBattlePassQuestReward(summary, reward);
  const lootBoxDrop = findBattlePassQuestLootBoxDrop(
    summary,
    reward,
    actualReward,
    mission,
  );
  const activeStep =
    mission?.questSteps.find((step) => step.current) ??
    mission?.questSteps.find((step) => !step.completed) ??
    null;
  const statusLabel =
    quest?.status ?? battlePassRewardStatusLabel(reward.status);
  const task = stripBattlePassDetailPrefix(
    quest?.condition ??
      reward.condition ??
      reward.description ??
      reward.subtitle,
    "Условие",
  );
  const executionCondition = stripBattlePassDetailPrefix(
    reward.executionCondition ??
      mission?.conditionLabel ??
      quest?.condition ??
      task,
    "Условие",
  );
  const plannedReward = stripBattlePassDetailPrefix(
    quest?.reward ?? reward.plannedReward ?? reward.title,
    "Награда",
  );
  const plannedRewardLootBox =
    reward.lootBoxPreview ?? mission?.rewardLootBox ?? null;
  const fallbackRewardStatus = mission?.rewardStatus ?? null;
  const fallbackRewardLabel =
    fallbackRewardStatus?.rewardLabel ??
    (fallbackRewardStatus?.rewardAmount !== null &&
    fallbackRewardStatus?.rewardAmount !== undefined
      ? `${formatNumber(fallbackRewardStatus.rewardAmount)} бонусов`
      : null);
  const receivedAt =
    actualReward?.qualifiedAt ??
    lootBoxDrop?.qualifiedAt ??
    fallbackRewardStatus?.occurredAt ??
    null;
  const progress = battlePassDetailProgress(
    summary,
    reward,
    task,
    quest,
    mission,
    activeStep,
  );

  return (
    <div
      className="lp-quest-complete-overlay lp-battlepass-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battlePassQuestTitle"
    >
      <div
        className={[
          "lp-quest-complete-dialog lp-battlepass-detail-dialog",
          plannedRewardLootBox ? "has-lootbox-preview" : "",
        ].join(" ")}
      >
        <button
          type="button"
          className="lp-quest-complete-close"
          aria-label="Закрыть подробности задания"
          onClick={onClose}
        >
          ×
        </button>
        <span className="lp-quest-complete-kicker">{statusLabel}</span>
        <h3 id="battlePassQuestTitle">
          {quest?.title ?? `Этап ${formatNumber(reward.level)}`}
        </h3>

        <div className="lp-battlepass-detail-progress">
          <div>
            <span>Прогресс</span>
            <strong>{progress.label}</strong>
          </div>
          <span className="lp-battlepass-detail-meter">
            <i style={{ width: `${clampPercent(progress.percent)}%` }} />
          </span>
        </div>

        <div className="lp-battlepass-detail-lines">
          <div className="lp-battlepass-detail-line">
            <span>Описание</span>
            <p>{task}</p>
          </div>

          <div className="lp-battlepass-detail-line">
            <span>Условия выполнения</span>
            <p>{executionCondition}</p>
          </div>

          {activeStep ? (
            <div className="lp-battlepass-detail-line is-current">
              <span>Текущий шаг</span>
              <strong>{activeStep.title}</strong>
              <p>{formatMissionStepProgress(activeStep)}</p>
            </div>
          ) : null}

          <div className="lp-battlepass-detail-line is-reward">
            <span>Награда</span>
            <strong>{plannedReward}</strong>
            {plannedRewardLootBox ? (
              <RewardLootBoxPreview lootBox={plannedRewardLootBox} />
            ) : null}
          </div>
        </div>

        {actualReward ? (
          <BattlePassReceivedRewardCard
            reward={actualReward}
            title={
              actualReward.sourceKind === "LOOT_BOX"
                ? "Содержимое кейса"
                : "Полученная награда"
            }
          />
        ) : fallbackRewardLabel ? (
          <div className="lp-battlepass-received-card">
            <span>Полученная награда</span>
            <strong>{fallbackRewardLabel}</strong>
            <p>{fallbackRewardStatus?.label}</p>
            {receivedAt ? <small>{formatDate(receivedAt)}</small> : null}
            <Link
              href="/game/rewards"
              className="lp-battlepass-reward-history-link"
            >
              Открыть историю наград
            </Link>
          </div>
        ) : reward.status === "claimed" ? (
          <div className="lp-battlepass-received-card">
            <span>Полученная награда</span>
            <p>
              Награда уже засчитана, но детальный результат не найден в текущем
              кошельке.
            </p>
            <Link
              href="/game/rewards"
              className="lp-battlepass-reward-history-link"
            >
              Открыть историю наград
            </Link>
          </div>
        ) : null}

        {lootBoxDrop && lootBoxDrop.id !== actualReward?.id ? (
          <BattlePassReceivedRewardCard
            reward={lootBoxDrop}
            title="Содержимое кейса"
          />
        ) : null}

        {receivedAt ? (
          <div className="lp-quest-complete-meta">
            <span>Получено</span>
            <span>{formatDate(receivedAt)}</span>
          </div>
        ) : null}

        <button
          type="button"
          className="lp-quest-complete-action"
          onClick={onClose}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

export function BattlePassReceivedRewardCard({
  reward,
  title,
}: {
  reward: GameRewardHistoryItem;
  title: string;
}) {
  const rarityLabel = lootboxRewardRarityLabel(reward);
  const claimCode = rewardHistoryClaimCode(reward);

  return (
    <div className="lp-battlepass-received-card">
      <span>{title}</span>
      <strong>{reward.rewardLabel}</strong>
      <p>
        {rewardHistoryValue(reward)} · {walletStateLabel(reward.walletState)}
      </p>
      {rarityLabel ? <small>{rarityLabel}</small> : null}
      {reward.rewardDropChance !== null ? (
        <small>
          Шанс выпадения: {formatRewardChance(reward.rewardDropChance)}
        </small>
      ) : null}
      {claimCode ? (
        <em>
          {claimCode.label}: {claimCode.value}
        </em>
      ) : null}
      <small>{walletStateHint(reward.walletState)}</small>
      <Link href="/game/rewards" className="lp-battlepass-reward-history-link">
        Открыть историю наград
      </Link>
    </div>
  );
}
