"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import type {
  GuestPortalCheckInResponse,
  GuestPortalGameSummary,
} from "@/lib/guest-portal";

type LoadState = "loading" | "ready" | "empty" | "error";
type SubmitState = "idle" | "submitting";
type GameNextAction = GuestPortalGameSummary["nextActions"][number];
type GameRewardWalletState =
  GuestPortalGameSummary["rewards"]["recent"][number]["walletState"];
type GameBonusHistoryItem =
  GuestPortalGameSummary["rewards"]["bonusHistory"]["items"][number];
type GameMission = GuestPortalGameSummary["missions"]["featured"][number];
type GameMissionHistoryItem = GuestPortalGameSummary["missions"]["history"][number];
type GameProgressTimelineItem =
  GuestPortalGameSummary["progress"]["timeline"][number];
type GameJourneyStep = GuestPortalGameSummary["journey"]["steps"][number];
type MissionBoardFilter = "AVAILABLE" | "ALMOST_DONE" | "REWARD_PENDING" | "ALL";
type HomeBanner = {
  id: string;
  label: string;
  title: string;
  description: string;
  tag: string;
  featured?: boolean;
  href: string;
};
type HomeLootCard = {
  id: string;
  title: string;
  description: string;
  status: string;
  active: boolean;
};
type HomeBattleQuest = {
  id: string;
  title: string;
  description: string;
  state: "complete" | "current" | "locked";
  label: string;
};

class EmptySessionError extends Error {}

export function GameSummaryClient() {
  const [summary, setSummary] = useState<GuestPortalGameSummary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [checkInState, setCheckInState] = useState<SubmitState>("idle");
  const [checkInMessage, setCheckInMessage] = useState<string | null>(null);

  const refreshSummary = useCallback(async () => {
    const nextSummary = await requestGameSummary();
    setSummary(nextSummary);
    setLoadState("ready");
    setMessage(null);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadInitialSummary() {
      try {
        const nextSummary = await requestGameSummary();

        if (!isActive) {
          return;
        }

        setSummary(nextSummary);
        setLoadState("ready");
        setMessage(null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        if (error instanceof EmptySessionError) {
          setSummary(null);
          setLoadState("empty");
          setMessage(error.message);
          return;
        }

        setLoadState("error");
        setMessage(getErrorMessage(error, "Не удалось загрузить игровой экран."));
      }
    }

    void loadInitialSummary();

    return () => {
      isActive = false;
    };
  }, []);

  async function checkIn() {
    setCheckInState("submitting");
    setCheckInMessage(null);

    try {
      const response = await fetch("/api/guest-portal/session/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: "Чекин гостя из игрового экрана LeetPlus Play.",
        }),
      });

      if (!response.ok) {
        throw new Error(
          await readResponseMessage(response, "Не удалось выполнить чекин."),
        );
      }

      const data = (await response.json()) as GuestPortalCheckInResponse;
      const xpDelta = data.checkIn.processResult.summary.appliedXpDelta;
      const rewards = data.checkIn.processResult.summary.createdRewards;
      const rewardText = rewards
        ? ` Наград в очереди: ${formatNumber(rewards)}.`
        : "";

      setCheckInMessage(
        `Чекин подтвержден: ${formatDate(data.checkIn.checkedAt)}. XP: ${formatNumber(
          xpDelta,
        )}.${rewardText}`,
      );
      await refreshSummary();
    } catch (error) {
      setCheckInMessage(
        getErrorMessage(error, "Не удалось выполнить чекин."),
      );
    } finally {
      setCheckInState("idle");
    }
  }

  if (loadState === "loading") {
    return <GameShell body={<LoadingView />} />;
  }

  if (loadState === "empty" || !summary) {
    return (
      <GameShell
        body={
          <EmptySessionView
            title="Игровой профиль еще не открыт"
            message={message ?? "Подтвердите телефон, чтобы увидеть квесты."}
          />
        }
      />
    );
  }

  if (loadState === "error") {
    return (
      <GameShell
        body={
          <EmptySessionView
            title="Не удалось открыть игру"
            message={message ?? "Попробуйте обновить страницу чуть позже."}
          />
        }
      />
    );
  }

  return (
    <GameShell
      body={
        <ReadyGameView
          summary={summary}
          onCheckIn={checkIn}
          isCheckingIn={checkInState === "submitting"}
          checkInMessage={checkInMessage}
        />
      }
    />
  );
}

function GameShell({ body }: { body: ReactNode }) {
  return (
    <main className="lp-club-home-page">
      {body}
      <style>{clubHomeCss}</style>
    </main>
  );
}

function LoadingView() {
  return (
    <div className="lp-club-home-static">
      <div className="lp-club-static-card" aria-busy="true">
        <div className="lp-club-skeleton lp-club-skeleton-short" />
        <div className="lp-club-skeleton lp-club-skeleton-title" />
        <div className="lp-club-skeleton" />
        <div className="lp-club-skeleton lp-club-skeleton-mid" />
        <div className="lp-club-static-grid">
          <div className="lp-club-skeleton" />
          <div className="lp-club-skeleton" />
          <div className="lp-club-skeleton" />
        </div>
      </div>
    </div>
  );
}

function EmptySessionView({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section className="lp-club-home-static">
      <div className="lp-club-static-card">
        <p className="lp-club-small-label">
          Игровой вход
        </p>
        <h1 className="lp-club-static-title">{title}</h1>
        <p className="lp-club-static-copy">{message}</p>
        <div className="lp-club-static-actions">
          <Link
            href="/play"
            className="lp-club-primary-link"
          >
            Зарегистрироваться
          </Link>
          <Link
            href="/"
            className="lp-club-ghost-link"
          >
            На главную
          </Link>
        </div>
      </div>
    </section>
  );
}

function ReadyGameView({
  summary,
  onCheckIn,
  isCheckingIn,
  checkInMessage,
}: {
  summary: GuestPortalGameSummary;
  onCheckIn: () => void;
  isCheckingIn: boolean;
  checkInMessage: string | null;
}) {
  const guestPortalHref = useMemo(
    () =>
      `/guest/${encodeURIComponent(summary.tenant.slug)}/${encodeURIComponent(
        summary.store.publicSlug ?? summary.store.id,
      )}`,
    [summary.store.id, summary.store.publicSlug, summary.tenant.slug],
  );
  const primaryAction = summary.nextActions[0] ?? null;
  const primaryActionHref = primaryAction
    ? gameActionHref(primaryAction, guestPortalHref)
    : null;
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedLootId, setSelectedLootId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const homeBanners = buildHomeBanners(
    summary,
    primaryAction,
    primaryActionHref,
    guestPortalHref,
  );
  const lootCards = buildHomeLootCards(summary, selectedLootId);
  const battleQuests = buildHomeBattleQuests(summary);
  const quickQuestCount = battleQuests.filter(
    (quest) => quest.state === "complete",
  ).length;
  const battlePassProgress = clampPercent(
    summary.battlePass.active?.progressPercent ?? summary.journey.summary.readyPercent,
  );
  const mainRewardLabel =
    summary.battlePass.active?.nextRewardLabel ??
    summary.rewards.ready[0]?.rewardLabel ??
    summary.rewards.latestBonus?.title ??
    "Главная награда";
  const rankLabel = buildRankLabel(summary.profile.level);
  const rankPercent = buildRankPercent(summary);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timerId = window.setTimeout(() => setToastMessage(null), 2200);

    return () => window.clearTimeout(timerId);
  }, [toastMessage]);

  function showToast(message: string) {
    setToastMessage(message);
  }

  function handlePromoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    showToast(
      promoCode.trim()
        ? "Промокод принят в проверку."
        : "Введите промокод для активации.",
    );
  }

  return (
    <div className="lp-club-home">
      <header className="lp-club-topbar">
        <button
          type="button"
          className="lp-club-menu-button"
          aria-label="Открыть меню"
          onClick={() => showToast("Меню игрового модуля скоро появится.")}
        >
          <MenuIcon />
        </button>

        <div className="lp-club-network">
          <Link href="/start" className="lp-club-brand" aria-label="LeetPlus">
            <BrandMark />
            <span>{summary.tenant.name}</span>
          </Link>
          <Link href="/game/clubs" className="lp-club-switch">
            <ClubIcon />
            <span>{summary.store.name}</span>
          </Link>
        </div>

        <div className="lp-club-session-state">Игровая сессия активна</div>
      </header>

      <div className="lp-club-shell">
        <div className="lp-club-main-flow">
          <section className="lp-club-stage" aria-label="Главный блок клуба">
            <div id="profile" className="lp-club-card">
              <div className="lp-club-label">Главная геймификации</div>
              <h1>Клубная карта игрока</h1>
              <p>
                {summary.profile.displayName} играет в клубе {summary.store.name}.
                Здесь собраны активности, награды, лутбоксы и прогресс сезона.
              </p>

              <div className="lp-club-quick-metrics" aria-label="Краткая статистика">
                <div className="lp-club-metric">
                  <strong>{formatNumber(summary.profile.level)}</strong>
                  <span>уровень</span>
                </div>
                <div className="lp-club-metric">
                  <strong>{formatNumber(rankPercent)}%</strong>
                  <span>ранг</span>
                </div>
                <div className="lp-club-metric">
                  <strong>{formatNumber(summary.rewards.summary.ready)}</strong>
                  <span>награды</span>
                </div>
              </div>
            </div>

            <HomeBannerGrid
              banners={homeBanners}
              onToast={showToast}
            />
          </section>

          <HomeLootBoxes
            cards={lootCards}
            onSelect={(card) => {
              setSelectedLootId(card.id);
              showToast(`Выбран лутбокс: ${card.title}.`);
            }}
          />

          <HomeBattlePass
            quests={battleQuests}
            progress={battlePassProgress}
            rewardLabel={mainRewardLabel}
            seasonName={summary.battlePass.active?.name ?? "Сезон клуба"}
            onToast={showToast}
          />
        </div>

        <PlayerProfilePanel
          summary={summary}
          guestPortalHref={guestPortalHref}
          rankLabel={rankLabel}
          rankPercent={rankPercent}
          quickQuestCount={quickQuestCount}
          quickQuests={battleQuests.slice(0, 3)}
          promoCode={promoCode}
          onPromoCodeChange={setPromoCode}
          onPromoSubmit={handlePromoSubmit}
          onCheckIn={() => {
            showToast("Проверяем активную сессию клуба.");
            onCheckIn();
          }}
          isCheckingIn={isCheckingIn}
          checkInMessage={checkInMessage}
        />
      </div>

      <section className="lp-club-detail-stack" aria-label="Подробности игрового профиля">
        <div className="lp-club-detail-head">
          <span>
            <span className="lp-club-small-label">Подробности</span>
            <h2>Квесты, награды и связь с клубом</h2>
          </span>
          <Link href="/game/clubs" className="lp-club-ghost-link">
            Сменить клуб
          </Link>
        </div>

        <JourneyPanel
          journey={summary.journey}
          guestPortalHref={guestPortalHref}
        />

        <ReferralPanel referral={summary.referral} />

        <ProgressPanel progress={summary.progress} />

        <NextActionsPanel
          actions={summary.nextActions}
          guestPortalHref={guestPortalHref}
        />

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <RewardResultPanel summary={summary} />
          <MissionsPanel missions={summary.missions.featured} />
        </section>

        <MissionHistoryPanel
          missions={summary.missions.history}
          total={summary.missions.total}
        />

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <LootBoxesPanel lootBoxes={summary.lootBoxes.featured} />
          <BattlePassPanel battlePass={summary.battlePass.active} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <ChannelsPanel summary={summary} guestPortalHref={guestPortalHref} />
          <ActivityPanel activity={summary.activity} />
        </section>
      </section>

      <div
        className={[
          "lp-club-toast",
          toastMessage ? "is-visible" : "",
        ].join(" ")}
        role="status"
        aria-live="polite"
      >
        {toastMessage}
      </div>
    </div>
  );
}

function HomeBannerGrid({
  banners,
  onToast,
}: {
  banners: HomeBanner[];
  onToast: (message: string) => void;
}) {
  return (
    <div className="lp-club-banner-grid" aria-label="Баннеры клуба">
      {banners.map((banner) => (
        <Link
          key={banner.id}
          href={banner.href}
          className={[
            "lp-club-banner",
            banner.featured ? "is-featured" : "",
          ].join(" ")}
          onClick={() => onToast(`Открыт раздел: ${banner.title}.`)}
        >
          <span className="lp-club-banner-content">
            <span>
              <span className="lp-club-banner-kicker">{banner.label}</span>
              <span className="lp-club-banner-title">{banner.title}</span>
              <span className="lp-club-banner-copy">{banner.description}</span>
            </span>
            <span className="lp-club-banner-tag">{banner.tag}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function HomeLootBoxes({
  cards,
  onSelect,
}: {
  cards: HomeLootCard[];
  onSelect: (card: HomeLootCard) => void;
}) {
  return (
    <section id="lootBoxes" className="lp-club-panel lp-club-lootboxes" aria-label="Лутбоксы">
      <div className="lp-club-section-head">
        <span>
          <h2>Лутбоксы</h2>
          <p>
            Быстрые награды за активность в клубе и прохождение цепочки заданий.
          </p>
        </span>
        <span className="lp-club-icon-badge" aria-hidden="true">
          <RefreshIcon />
        </span>
      </div>

      <div className="lp-club-loot-grid">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className={[
              "lp-club-loot-card",
              card.active ? "is-active" : "",
            ].join(" ")}
            onClick={() => onSelect(card)}
          >
            <em>{card.status}</em>
            <strong>{card.title}</strong>
            <span>{card.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function HomeBattlePass({
  quests,
  progress,
  rewardLabel,
  seasonName,
  onToast,
}: {
  quests: HomeBattleQuest[];
  progress: number;
  rewardLabel: string;
  seasonName: string;
  onToast: (message: string) => void;
}) {
  return (
    <section id="battlePass" className="lp-club-panel lp-club-battlepass" aria-label="Батлпасс">
      <div className="lp-club-section-head">
        <span>
          <h2>Батлпасс клуба</h2>
          <p>Цепочка заданий ведет к главной награде текущего сезона.</p>
        </span>
        <span className="lp-club-small-label">
          {seasonName} / {formatNumber(progress)}% завершено
        </span>
      </div>

      <div className="lp-club-battle-track">
        {quests.map((quest) => (
          <button
            key={quest.id}
            type="button"
            className={[
              "lp-club-quest",
              quest.state === "complete" ? "is-complete" : "",
              quest.state === "current" ? "is-current" : "",
            ].join(" ")}
            onClick={() => onToast(`${quest.title}: ${quest.description}`)}
          >
            <span>
              <strong>{quest.title}</strong>
              <span>{quest.description}</span>
            </span>
            <small>{quest.label}</small>
          </button>
        ))}

        <div className="lp-club-reward" aria-label="Главная награда">
          <span className="lp-club-reward-shape" aria-hidden="true" />
          <span className="lp-club-reward-content">
            <strong>{rewardLabel}</strong>
            <span>season drop</span>
          </span>
        </div>
      </div>
    </section>
  );
}

function PlayerProfilePanel({
  summary,
  guestPortalHref,
  rankLabel,
  rankPercent,
  quickQuestCount,
  quickQuests,
  promoCode,
  onPromoCodeChange,
  onPromoSubmit,
  onCheckIn,
  isCheckingIn,
  checkInMessage,
}: {
  summary: GuestPortalGameSummary;
  guestPortalHref: string;
  rankLabel: string;
  rankPercent: number;
  quickQuestCount: number;
  quickQuests: HomeBattleQuest[];
  promoCode: string;
  onPromoCodeChange: (value: string) => void;
  onPromoSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCheckIn: () => void;
  isCheckingIn: boolean;
  checkInMessage: string | null;
}) {
  return (
    <aside className="lp-club-profile-panel" aria-label="Профиль игрока">
      <div className="lp-club-profile-logo">
        <div className="lp-club-avatar" aria-hidden="true">
          <ProfileIcon />
        </div>
        <span>
          <strong>{profileInitials(summary.profile.displayName)}</strong>
          <span>Гость клуба</span>
        </span>
      </div>

      <div className="lp-club-profile-section">
        <div className="lp-club-profile-row">
          <span className="lp-club-small-label">Уровень</span>
          <strong>{formatNumber(summary.profile.level)}</strong>
        </div>
        <div className="lp-club-progress" aria-label="Прогресс уровня">
          <span
            style={
              {
                "--value": `${clampPercent(summary.profile.levelProgressPercent)}%`,
              } as CSSProperties
            }
          />
        </div>
      </div>

      <div className="lp-club-profile-section rank">
        <div className="lp-club-profile-row">
          <span className="lp-club-small-label">Ранг</span>
          <strong>{rankLabel}</strong>
        </div>
        <div className="lp-club-progress" aria-label="Прогресс ранга">
          <span
            style={{ "--value": `${rankPercent}%` } as CSSProperties}
          />
        </div>
      </div>

      <div className="lp-club-profile-section lp-club-profile-stats">
        <div>
          <span className="lp-club-small-label">Бонусы</span>
          <strong>{formatNumber(summary.loyalty.bonusBalance ?? 0)}</strong>
        </div>
        <div>
          <span className="lp-club-small-label">Время</span>
          <strong>{formatMinutes(summary.activity.playMinutes)}</strong>
        </div>
      </div>

      <form className="lp-club-promo" onSubmit={onPromoSubmit}>
        <label className="lp-club-small-label" htmlFor="promoCode">
          Промокод
        </label>
        <input
          id="promoCode"
          type="text"
          placeholder="Введите код"
          autoComplete="off"
          value={promoCode}
          onChange={(event) => onPromoCodeChange(event.target.value)}
        />
        <button type="submit">Активировать</button>
        <Link className="lp-club-side-link" href="#rewards">
          История наград
        </Link>
      </form>

      <div className="lp-club-quick-actions">
        <button
          type="button"
          onClick={onCheckIn}
          disabled={isCheckingIn}
        >
          {isCheckingIn ? "Проверяем..." : "Чекин в клубе"}
        </button>
        <Link href={guestPortalHref}>Открыть кабинет</Link>
        {checkInMessage ? <p>{checkInMessage}</p> : null}
      </div>

      <section className="lp-club-quest-widget" aria-label="Квесты игрока">
        <div className="lp-club-quest-widget-head">
          <span>
            <span className="lp-club-small-label">Квесты</span>
            <strong>Быстрые задачи</strong>
          </span>
          <span className="lp-club-quest-count">
            {formatNumber(quickQuestCount)} / {formatNumber(quickQuests.length)}
          </span>
        </div>

        <div className="lp-club-side-quest-list">
          {quickQuests.map((quest) => (
            <Link
              key={quest.id}
              href="#battlePass"
              className={[
                "lp-club-side-quest",
                quest.state === "complete" ? "is-done" : "",
                quest.state === "current" ? "is-current" : "",
              ].join(" ")}
            >
              <span className="lp-club-side-quest-icon" aria-hidden="true">
                {quest.state === "complete" ? <CheckIcon /> : <QuestIcon />}
              </span>
              <span>
                <strong>{quest.title}</strong>
                <span>{quest.description}</span>
              </span>
              <span className="lp-club-side-quest-state">{quest.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </aside>
  );
}

function buildHomeBanners(
  summary: GuestPortalGameSummary,
  primaryAction: GameNextAction | null,
  primaryActionHref: string | null,
  guestPortalHref: string,
): HomeBanner[] {
  const featuredMission = summary.missions.featured[0] ?? null;
  const secondMission = summary.missions.featured[1] ?? null;

  return [
    {
      id: "primary",
      label: primaryAction ? "Акция / квест" : "Акция / реклама",
      title: primaryAction?.title ?? "Ночной рейд",
      description:
        primaryAction?.description ??
        "Бонусные часы и XP за вечернюю активность в выбранном клубе.",
      tag: primaryAction ? gameActionButtonLabel(primaryAction) : "до 30 июня",
      featured: true,
      href: primaryActionHref ?? "#missions",
    },
    {
      id: "tournament",
      label: "Событие",
      title: featuredMission?.name ?? "Клубный турнир",
      description:
        featuredMission?.rewardLabel ??
        "Соберите стак и получите очки ранга за участие.",
      tag: featuredMission ? `${formatNumber(featuredMission.xpReward)} XP` : "регистрация",
      href: "#missions",
    },
    {
      id: "drop",
      label: "Коллаб",
      title: secondMission?.name ?? "Партнерский дроп",
      description:
        secondMission?.rewardLabel ??
        summary.referral.channelHint ??
        "Лимитированные предметы и бонусы для гостей клуба.",
      tag: secondMission ? "квест" : "получить",
      href: guestPortalHref,
    },
  ];
}

function buildHomeLootCards(
  summary: GuestPortalGameSummary,
  selectedLootId: string | null,
): HomeLootCard[] {
  const fallback: HomeLootCard[] = [
    {
      id: "daily-container",
      title: "Ежедневный контейнер",
      description: "Открывается за визит, авторизацию и активность в клубе.",
      status: summary.rewards.summary.ready > 0 ? "ready" : "daily",
      active: false,
    },
    {
      id: "team-drop",
      title: "Командный дроп",
      description: "Награда за игру компанией и выполнение клубных задач.",
      status: `${formatNumber(summary.journey.summary.completed)}/${formatNumber(
        summary.journey.summary.total,
      )}`,
      active: false,
    },
    {
      id: "rank-case",
      title: "Ранговый кейс",
      description: "Откроется после следующей ступени уровня или ранга.",
      status: "rank",
      active: false,
    },
  ];
  const realCards = summary.lootBoxes.featured.slice(0, 3).map((lootBox) => ({
    id: lootBox.id,
    title: lootBox.name,
    description:
      lootBox.latestReward?.rewardLabel ??
      lootBox.rewardLabel ??
      "Лутбокс с наградой за активность в клубе.",
    status:
      lootBox.readyRewards > 0
        ? "ready"
        : lootBox.openedCount > 0
          ? formatNumber(lootBox.openedCount)
          : "rank",
    active: false,
  }));
  const cards = [...realCards, ...fallback].slice(0, 3);
  const activeId = selectedLootId ?? cards[0]?.id ?? null;

  return cards.map((card) => ({
    ...card,
    active: card.id === activeId,
  }));
}

function buildHomeBattleQuests(summary: GuestPortalGameSummary): HomeBattleQuest[] {
  const journeyQuests: HomeBattleQuest[] = summary.journey.steps.map((step) => ({
    id: step.id,
    title: step.label,
    description: step.hint,
    state: homeQuestState(step.status),
    label: homeQuestStateLabel(step.status),
  }));
  const missionQuests: HomeBattleQuest[] = summary.missions.featured.map((mission) => ({
    id: mission.id,
    title: mission.name,
    description: mission.rewardLabel ?? "Клубный квест с XP и наградой.",
    state: mission.progressPercent >= 100 ? "complete" : "locked",
    label: mission.progressPercent >= 100 ? "готово" : "квест",
  }));
  const fallback: HomeBattleQuest[] = [
    {
      id: "promo",
      title: "Промокод",
      description: "Активировать клубный код.",
      state: "locked",
      label: "next",
    },
    {
      id: "season-final",
      title: "Финальный чек",
      description: "Забрать сезонный дроп.",
      state: "locked",
      label: "reward",
    },
  ];

  return [...journeyQuests, ...missionQuests, ...fallback].slice(0, 6);
}

function homeQuestState(
  status: GameJourneyStep["status"],
): HomeBattleQuest["state"] {
  if (status === "DONE") {
    return "complete";
  }

  return status === "CURRENT" || status === "ATTENTION" ? "current" : "locked";
}

function homeQuestStateLabel(status: GameJourneyStep["status"]) {
  if (status === "DONE") {
    return "готово";
  }

  if (status === "CURRENT") {
    return "сейчас";
  }

  return status === "ATTENTION" ? "проверить" : "locked";
}

function buildRankLabel(level: number) {
  const tiers = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
  const safeLevel = Math.max(1, level);
  const tier = tiers[Math.min(tiers.length - 1, Math.floor((safeLevel - 1) / 3))];
  const romans = ["IV", "III", "II", "I"];
  const roman = romans[(safeLevel - 1) % romans.length] ?? "I";

  return `${tier} ${roman}`;
}

function buildRankPercent(summary: GuestPortalGameSummary) {
  const explicitProgress = summary.profile.levelProgressPercent;
  const readiness = summary.account.readinessPercent;

  return clampPercent(Math.max(explicitProgress, Math.min(100, readiness)));
}

function profileInitials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  return letters.toUpperCase() || "LP";
}

function BrandMark() {
  return <span className="lp-club-brand-mark" aria-hidden="true" />;
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function ClubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M4 9h16" />
      <path d="M6 9v10h12V9" />
      <path d="M8 9V6a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14.4-4.8L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.4 4.8L20 16" />
      <path d="M20 20v-4h-4" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M12 3 4.5 7.4v8.8L12 21l7.5-4.8V7.4L12 3Z" />
      <path d="M9 12.2 11.2 14 15.4 9.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function QuestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M4 7h16v10H4z" />
      <path d="M8 7v10" />
      <path d="M16 7v10" />
    </svg>
  );
}

function ReferralPanel({
  referral,
}: {
  referral: GuestPortalGameSummary["referral"];
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [shareState, setShareState] = useState<"idle" | "shared" | "failed">(
    "idle",
  );

  async function copyReferralLink() {
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function shareReferralInvite() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "LeetPlus Play",
          text: referral.shareText,
          url: referral.link,
        });
      } else {
        await navigator.clipboard.writeText(referral.shareText);
      }

      setShareState("shared");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setShareState("failed");
    }
  }

  const telegramShareText = referral.shareText.replace(referral.link, "").trim();
  const telegramShareHref = `https://t.me/share/url?url=${encodeURIComponent(
    referral.link,
  )}&text=${encodeURIComponent(telegramShareText || referral.shareText)}`;
  const referralStats = [
    {
      label: "Регистраций",
      value: formatNumber(referral.stats.acceptedCount),
      hint: "по вашей ссылке",
    },
    {
      label: "К бонусу",
      value: formatNumber(referral.stats.eligibleCount),
      hint: "без саморефералок",
    },
    {
      label: "Последняя",
      value: referral.stats.latestAcceptedAt
        ? formatDate(referral.stats.latestAcceptedAt)
        : "пока нет",
      hint: "принятая регистрация",
    },
  ];

  return (
    <section
      id="referral"
      className="rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
            Рефералка
          </p>
          <h2 className="mt-1 text-xl font-black">
            Пригласите друга в квесты клуба
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            {referral.channelHint}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {referralStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-cyan-200/15 bg-zinc-950/35 px-3 py-2"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-100/70">
                  {stat.label}
                </p>
                <p className="mt-1 text-lg font-black text-white">
                  {stat.value}
                </p>
                <p className="text-xs text-zinc-400">{stat.hint}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <div className="rounded-lg border border-white/10 bg-zinc-950/50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Код
            </p>
            <p className="mt-1 break-all font-mono text-sm font-bold text-cyan-100">
              {referral.code}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={copyReferralLink}
              className="rounded-lg bg-cyan-200 px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-cyan-100"
            >
              {copyState === "copied"
                ? "Ссылка скопирована"
                : copyState === "failed"
                  ? "Не удалось скопировать"
                  : "Скопировать ссылку"}
            </button>
            <button
              type="button"
              onClick={shareReferralInvite}
              className="rounded-lg border border-cyan-200/35 px-4 py-3 text-sm font-black text-cyan-100 transition hover:border-cyan-100 hover:text-white"
            >
              {shareState === "shared"
                ? "Готово"
                : shareState === "failed"
                  ? "Не удалось"
                  : "Поделиться"}
            </button>
            <a
              href={telegramShareHref}
              rel="noreferrer"
              target="_blank"
              className="rounded-lg border border-cyan-200/35 px-4 py-3 text-center text-sm font-black text-cyan-100 transition hover:border-cyan-100 hover:text-white"
            >
              В Telegram
            </a>
            <a
              href={referral.link}
              className="rounded-lg border border-cyan-200/35 px-4 py-3 text-center text-sm font-black text-cyan-100 transition hover:border-cyan-100 hover:text-white"
            >
              Открыть ссылку
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function JourneyPanel({
  journey,
  guestPortalHref,
}: {
  journey: GuestPortalGameSummary["journey"];
  guestPortalHref: string;
}) {
  const nextStepLabel = journey.summary.nextStepLabel ?? "маршрут пройден";

  return (
    <section id="journey" className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Путь к бонусу
          </p>
          <h2 className="mt-1 text-xl font-black">
            {journey.summary.completed}/{journey.summary.total} шагов готовы
          </h2>
        </div>
        <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-300">
          следующий: {nextStepLabel}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>готовность</span>
          <span>{journey.summary.readyPercent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-300"
            style={{ width: `${clampPercent(journey.summary.readyPercent)}%` }}
          />
        </div>
      </div>

      <ol className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {journey.steps.map((step, index) => (
          <li
            key={step.id}
            className="min-h-32 border-l border-white/10 pl-3"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-black text-zinc-300">
                {index + 1}
              </span>
              <span className={journeyStatusClass(step.status)}>
                {journeyStatusLabel(step.status)}
              </span>
            </div>
            <h3 className="mt-3 text-sm font-black text-white">{step.label}</h3>
            <p className="mt-2 text-xs leading-5 text-zinc-400">{step.hint}</p>
            {step.status !== "DONE" ? (
              <Link
                href={journeyStepHref(step, guestPortalHref)}
                className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-emerald-300/30 px-3 text-xs font-black text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-300/10"
              >
                Открыть
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function journeyStatusLabel(status: GameJourneyStep["status"]) {
  const labels = {
    DONE: "готово",
    CURRENT: "сейчас",
    WAITING: "ждет",
    ATTENTION: "проверить",
  } satisfies Record<GameJourneyStep["status"], string>;

  return labels[status];
}

function journeyStatusClass(status: GameJourneyStep["status"]) {
  const base = "rounded-full px-2 py-1 text-xs font-black";

  switch (status) {
    case "DONE":
      return `${base} bg-emerald-300 text-zinc-950`;
    case "CURRENT":
      return `${base} bg-sky-300 text-zinc-950`;
    case "WAITING":
      return `${base} bg-amber-300/20 text-amber-100`;
    default:
      return `${base} bg-rose-300/20 text-rose-100`;
  }
}

function journeyStepHref(step: GameJourneyStep, guestPortalHref: string) {
  if (step.anchor === "langame-match") {
    return `${guestPortalHref}#langame-match`;
  }

  return `#${step.anchor}`;
}

function ProgressPanel({
  progress,
}: {
  progress: GuestPortalGameSummary["progress"];
}) {
  const stats = progress.summary;

  return (
    <section
      id="progress"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Мой прогресс
          </p>
          <h2 className="mt-1 text-xl font-black">Что уже засчитано</h2>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-zinc-200">
          уровень {formatNumber(stats.level)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ProgressMetric
          label="XP"
          value={formatNumber(stats.xp)}
          note={
            stats.xpToNextLevel > 0
              ? `до уровня ${formatNumber(stats.xpToNextLevel)} XP`
              : "следующий уровень рядом"
          }
        />
        <ProgressMetric
          label="Квесты"
          value={`${formatNumber(stats.missionsCompleted)}/${formatNumber(
            stats.missionsTotal,
          )}`}
          note={`${formatNumber(stats.missionsAlmostDone)} почти готовы`}
        />
        <ProgressMetric
          label="Награды"
          value={formatNumber(stats.rewardsReady)}
          note={`${formatNumber(stats.rewardsWaitingApproval)} ждут проверки`}
        />
        <ProgressMetric
          label="Бонусы Langame"
          value={formatSignedNumber(stats.confirmedBonusAmount)}
          note={`${formatSignedNumber(stats.pendingBonusAmount)} в очереди`}
        />
      </div>

      <div className="mt-5 space-y-2">
        {progress.timeline.length ? (
          progress.timeline.map((item) => (
            <ProgressTimelineRow key={item.id} item={item} />
          ))
        ) : (
          <p className="rounded-lg border border-white/10 bg-zinc-950/45 p-4 text-sm leading-6 text-zinc-300">
            Первые события появятся после чекина, квеста или начисления.
          </p>
        )}
      </div>
    </section>
  );
}

function ProgressMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/45 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{note}</p>
    </div>
  );
}

function ProgressTimelineRow({ item }: { item: GameProgressTimelineItem }) {
  const meta = [
    progressTimelineKindLabel(item.kind),
    item.storeName,
    item.xpDelta !== null ? `${formatSignedNumber(item.xpDelta)} XP` : null,
    item.amount !== null ? `${formatSignedNumber(item.amount)} бонусов` : null,
    formatDate(item.occurredAt),
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-zinc-950/45 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={progressTimelineStatusClass(item.status)}>
            {progressTimelineStatusLabel(item.status)}
          </span>
          <p className="min-w-0 truncate text-sm font-black text-white">
            {item.title}
          </p>
        </div>
        {item.description ? (
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            {item.description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] font-bold text-zinc-400 sm:max-w-xs sm:justify-end">
        {meta.map((value) => (
          <span
            key={value}
            className="rounded-full border border-white/10 px-2 py-1"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function progressTimelineKindLabel(kind: GameProgressTimelineItem["kind"]) {
  const labels = {
    ACTIVITY: "событие",
    REWARD: "награда",
    BONUS_LEDGER: "Langame",
  } satisfies Record<GameProgressTimelineItem["kind"], string>;

  return labels[kind];
}

function progressTimelineStatusLabel(status: GameProgressTimelineItem["status"]) {
  const labels = {
    DONE: "засчитано",
    READY: "готово",
    WAITING: "ждет",
    ATTENTION: "проверка",
  } satisfies Record<GameProgressTimelineItem["status"], string>;

  return labels[status];
}

function progressTimelineStatusClass(status: GameProgressTimelineItem["status"]) {
  const base = "rounded-full px-2 py-1 text-xs font-black";

  switch (status) {
    case "DONE":
      return `${base} bg-emerald-300 text-zinc-950`;
    case "READY":
      return `${base} bg-sky-300 text-zinc-950`;
    case "WAITING":
      return `${base} bg-amber-300/20 text-amber-100`;
    default:
      return `${base} bg-rose-300/20 text-rose-100`;
  }
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/50 p-3">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{note}</p>
    </div>
  );
}

function NextActionsPanel({
  actions,
  guestPortalHref,
}: {
  actions: GuestPortalGameSummary["nextActions"];
  guestPortalHref: string;
}) {
  if (actions.length === 0) {
    return (
      <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
          План игры
        </p>
        <h2 className="mt-1 text-xl font-black">Свободная игра</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          Как только появятся награды, квесты или новый сезонный шаг, они
          появятся здесь.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            План игры
          </p>
          <h2 className="mt-1 text-xl font-black">Что сделать дальше</h2>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-300">
          {formatNumber(actions.length)} шага
        </span>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {actions.map((action) => {
          const href = gameActionHref(action, guestPortalHref);

          return (
            <article
              key={action.id}
              className="rounded-lg border border-white/10 bg-zinc-950/45 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {action.statusLabel}
                  </p>
                  <h3 className="mt-1 truncate text-sm font-black text-white">
                    {action.title}
                  </h3>
                </div>
                <span
                  className={[
                    "shrink-0 rounded-full px-2 py-1 text-xs font-black",
                    actionPriorityClass(action.priority),
                  ].join(" ")}
                >
                  {actionPriorityLabel(action.priority)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-5 text-zinc-300">
                {action.description}
              </p>
              {action.progressPercent !== null ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>прогресс</span>
                    <span>{Math.round(action.progressPercent)}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-300"
                      style={{ width: `${clampPercent(action.progressPercent)}%` }}
                    />
                  </div>
                </div>
              ) : null}
              <Link
                href={href}
                className="mt-4 flex min-h-10 items-center justify-center rounded-lg border border-emerald-300/35 px-3 text-sm font-black text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-300/10"
              >
                {gameActionButtonLabel(action)}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RewardResultPanel({ summary }: { summary: GuestPortalGameSummary }) {
  const reward = summary.rewards.ready[0] ?? null;
  const recentRewards = summary.rewards.recent;
  const latestBonus = summary.rewards.latestBonus;
  const bonusHistory = summary.rewards.bonusHistory;
  const bonusBalance = summary.loyalty.bonusBalance;
  const hasRewardResult = Boolean(
    reward || latestBonus || recentRewards.length || bonusHistory.items.length,
  );

  return (
    <section
      id="rewards"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Кошелек
          </p>
          <h2 className="mt-1 text-xl font-black">Результат квеста</h2>
        </div>
        {latestBonus ? (
          <span
            className={[
              "rounded-full px-2 py-1 text-xs font-black",
              latestBonus.status === "CONFIRMED"
                ? "bg-emerald-300 text-zinc-950"
                : "bg-white/10 text-zinc-200",
            ].join(" ")}
          >
            {latestBonus.statusLabel}
          </span>
        ) : reward ? (
          <span className="rounded-full bg-emerald-300 px-2 py-1 text-xs font-black text-zinc-950">
            READY
          </span>
        ) : null}
      </div>

      {hasRewardResult ? (
        <div className="mt-5 space-y-4">
          {latestBonus ? (
            <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/[0.08] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                Последний бонус
              </p>
              <div className="mt-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-black text-white">
                    {latestBonus.title}
                  </p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {latestBonus.sourceLabel ?? latestBonus.sourceKind}
                    {latestBonus.storeName
                      ? ` · ${latestBonus.storeName}`
                      : ""}
                  </p>
                </div>
                <span
                  className={[
                    "shrink-0 text-xl font-black",
                    latestBonus.amount >= 0
                      ? "text-emerald-300"
                      : "text-rose-300",
                  ].join(" ")}
                >
                  {formatSignedNumber(latestBonus.amount)}
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-zinc-950/50 p-3">
                  <p className="text-xs text-zinc-400">Статус</p>
                  <p className="mt-1 text-sm font-black">
                    {latestBonus.statusLabel}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDate(latestBonus.confirmedAt ?? latestBonus.occurredAt)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-zinc-950/50 p-3">
                  <p className="text-xs text-zinc-400">Баланс после</p>
                  <p className="mt-1 text-sm font-black">
                    {latestBonus.balanceAfter !== null
                      ? formatNumber(latestBonus.balanceAfter)
                      : bonusBalance !== null
                        ? formatNumber(bonusBalance)
                        : "обновляется"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {bonusBalance !== null
                      ? "текущий бонусный баланс"
                      : "ждем подтверждения Langame"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {reward ? (
            <div>
              <p className="text-lg font-black">{reward.rewardLabel}</p>
              <p className="mt-2 text-sm text-zinc-300">
                {reward.sourceLabel ?? reward.sourceKind} ·{" "}
                {formatNumber(reward.rewardAmount)}
              </p>
              <div className="mt-4 rounded-lg border border-white/10 bg-zinc-950/60 p-4">
                <p className="text-xs text-zinc-400">Код для кассы</p>
                <p className="mt-1 break-all text-2xl font-black tracking-wider">
                  {reward.rewardCode ??
                    reward.claimPayload ??
                    "покажите кабинет"}
                </p>
              </div>
              {reward.expiresAt ? (
                <p className="mt-3 text-xs text-zinc-400">
                  Действует до {formatDate(reward.expiresAt)}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-white/10 bg-zinc-950/60 p-4">
            <p className="text-xs text-zinc-400">Бонусный баланс</p>
            <p className="mt-1 text-2xl font-black">
              {bonusBalance !== null ? formatNumber(bonusBalance) : "нет данных"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {summary.loyalty.bonusBalanceSource ?? "ожидаем первый snapshot"}
            </p>
          </div>

          {bonusHistory.items.length ? (
            <BonusHistoryPanel history={bonusHistory} />
          ) : null}

          {recentRewards.length ? (
            <div className="rounded-lg border border-white/10 bg-zinc-950/45 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Кошелек наград
                  </p>
                  <h3 className="mt-1 text-sm font-black text-white">
                    Последние награды
                  </h3>
                </div>
                <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-zinc-200">
                  {formatNumber(recentRewards.length)}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {recentRewards.map((item) => {
                  const readyCode =
                    item.walletState === "READY"
                      ? item.rewardCode ?? item.claimPayload
                      : null;

                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">
                            {item.rewardLabel}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {item.sourceLabel ?? rewardSourceKindLabel(item.sourceKind)}
                            {" · "}
                            {formatDate(item.qualifiedAt)}
                          </p>
                        </div>
                        <span
                          className={[
                            "shrink-0 rounded-full px-2 py-1 text-xs font-black",
                            walletStateBadgeClass(item.walletState),
                          ].join(" ")}
                        >
                          {walletStateLabel(item.walletState)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-col gap-1 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                        <span>{formatNumber(item.rewardAmount)} · {item.rewardType}</span>
                        {readyCode ? (
                          <span className="font-black text-emerald-200">
                            код: {readyCode}
                          </span>
                        ) : item.expiresAt ? (
                          <span>до {formatDate(item.expiresAt)}</span>
                        ) : (
                          <span>{walletStateHint(item.walletState)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-zinc-300">
          Готовых наград пока нет. Выполните миссию или дождитесь события в
          клубе.
        </p>
      )}
    </section>
  );
}

function BonusHistoryPanel({
  history,
}: {
  history: GuestPortalGameSummary["rewards"]["bonusHistory"];
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/45 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Langame ledger
          </p>
          <h3 className="mt-1 text-sm font-black text-white">
            История начислений
          </h3>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-zinc-200">
          {formatNumber(history.items.length)}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <BonusHistoryMetric
          label="Начислено"
          value={formatSignedNumber(history.summary.confirmedAmount)}
        />
        <BonusHistoryMetric
          label="В очереди"
          value={formatSignedNumber(history.summary.pendingAmount)}
        />
        <BonusHistoryMetric
          label="Проверки"
          value={formatNumber(history.summary.failed)}
        />
      </div>
      <div className="mt-4 space-y-2">
        {history.items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {item.sourceLabel ?? rewardSourceKindLabel(item.sourceKind)}
                  {item.storeName ? ` · ${item.storeName}` : ""}
                </p>
              </div>
              <span
                className={[
                  "shrink-0 rounded-full px-2 py-1 text-xs font-black",
                  bonusStatusBadgeClass(item.status),
                ].join(" ")}
              >
                {item.statusLabel}
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-1 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
              <span
                className={
                  item.amount >= 0 ? "text-emerald-200" : "text-rose-200"
                }
              >
                {formatSignedNumber(item.amount)}
              </span>
              <span>
                {bonusHistoryDate(item)}
                {item.balanceAfter !== null
                  ? ` · баланс ${formatNumber(item.balanceAfter)}`
                  : ""}
              </span>
            </div>
            {item.status !== "CONFIRMED" ? (
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                {bonusStatusHint(item.status)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function BonusHistoryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/50 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function LootBoxesPanel({
  lootBoxes,
}: {
  lootBoxes: GuestPortalGameSummary["lootBoxes"]["featured"];
}) {
  const [openedLootBoxId, setOpenedLootBoxId] = useState<string | null>(null);

  return (
    <section
      id="lootBoxes"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Лутбоксы
          </p>
          <h2 className="mt-1 text-xl font-black">Открыть приз</h2>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-300">
          {formatNumber(lootBoxes.length)} активных
        </span>
      </div>

      {lootBoxes.length ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {lootBoxes.map((lootBox) => {
            const latestReward = lootBox.latestReward;
            const isOpened = openedLootBoxId === lootBox.id;

            return (
              <article
                key={lootBox.id}
                className={[
                  "rounded-lg border p-4 transition",
                  latestReward
                    ? "border-emerald-300/30 bg-emerald-300/[0.07]"
                    : "border-white/10 bg-zinc-950/45",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-black">
                      {lootBox.name}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-400">
                      {lootBox.rewardLabel ??
                        "Награда определяется правилами клуба"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-xs font-black text-zinc-200">
                    {lootBox.triggerKind}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <MiniMetric
                    label="Сработал"
                    value={formatNumber(lootBox.openedCount)}
                  />
                  <MiniMetric
                    label="К выдаче"
                    value={formatNumber(lootBox.readyRewards)}
                  />
                  <MiniMetric
                    label="Получено"
                    value={formatNumber(lootBox.redeemedRewards)}
                  />
                </div>

                {latestReward ? (
                  <div className="mt-4 rounded-lg border border-emerald-300/25 bg-zinc-950/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                          Последний результат
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatDate(latestReward.qualifiedAt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-zinc-200">
                        {walletStateLabel(latestReward.walletState)}
                      </span>
                    </div>

                    {isOpened ? (
                      <div className="mt-3 rounded-lg border border-emerald-200/25 bg-emerald-300/[0.08] p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                          Выпала награда
                        </p>
                        <p className="mt-1 text-lg font-black text-white">
                          {latestReward.rewardLabel}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-zinc-300">
                          {walletStateHint(latestReward.walletState)}
                          {latestReward.expiresAt
                            ? ` До ${formatDate(latestReward.expiresAt)}.`
                            : ""}
                        </p>
                        {latestReward.rewardCode &&
                        latestReward.walletState === "READY" ? (
                          <p className="mt-3 rounded-lg border border-dashed border-emerald-200/50 px-3 py-2 text-sm font-black text-emerald-50">
                            Код кассиру: {latestReward.rewardCode}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpenedLootBoxId(lootBox.id)}
                        className="mt-3 w-full rounded-lg bg-emerald-300 px-3 py-2 text-sm font-black text-zinc-950 transition hover:bg-emerald-200"
                        aria-expanded={false}
                      >
                        Открыть лутбокс
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-zinc-400">
                    Лутбокс откроется после подходящего события в клубе:
                    сессии, квеста или правила Guest Game Hub.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-zinc-300">
          Лутбоксы появятся после настройки правил старта сессии или клубных
          событий.
        </p>
      )}
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/45 p-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function MissionsPanel({
  missions,
}: {
  missions: GuestPortalGameSummary["missions"]["featured"];
}) {
  const [activeFilter, setActiveFilter] =
    useState<MissionBoardFilter>("AVAILABLE");
  const filterOptions = useMemo(
    () => buildMissionFilterOptions(missions),
    [missions],
  );
  const visibleMissions = useMemo(
    () =>
      missions.filter((mission) => missionMatchesFilter(mission, activeFilter)),
    [activeFilter, missions],
  );

  return (
    <section
      id="missions"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
        Миссии
      </p>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black">Ближайшие квесты</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Выберите цель: новый квест, почти готовый прогресс или награду.
          </p>
        </div>
        {missions.length ? (
          <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-200">
            {visibleMissions.length} из {missions.length}
          </span>
        ) : null}
      </div>
      {missions.length ? (
        <MissionFilterTabs
          activeFilter={activeFilter}
          options={filterOptions}
          onChange={setActiveFilter}
        />
      ) : null}
      <div className="mt-5 space-y-3">
        {missions.length ? (
          visibleMissions.length ? (
            visibleMissions.map((mission) => {
              const activeStep =
                mission.questSteps.find((step) => step.current) ??
                mission.questSteps.find((step) => !step.completed) ??
                null;
              const progressTarget = mission.progressTarget ?? 1;
              const progressUnit = mission.progressUnit
                ? ` ${mission.progressUnit}`
                : "";
              const progressLabel =
                mission.progressPercent >= 100
                  ? `Выполнено: ${formatNumber(
                      mission.progressCurrent,
                    )}/${formatNumber(progressTarget)}${progressUnit}`
                  : `Прогресс: ${formatNumber(
                      mission.progressCurrent,
                    )}/${formatNumber(progressTarget)}${progressUnit}`;

              return (
                <article
                  key={mission.id}
                  className={missionCardClass(mission)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-black">
                        {mission.name}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-400">
                        {mission.rewardLabel ?? `${mission.xpReward} XP`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="block text-sm font-black text-emerald-300">
                        {Math.round(mission.progressPercent)}%
                      </span>
                      <span className={missionStatusBadgeClass(mission)}>
                        {missionStateLabel(mission)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-300"
                      style={{
                        width: `${clampPercent(mission.progressPercent)}%`,
                      }}
                    />
                  </div>
                  <div className="mt-3 flex flex-col gap-2 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                    <span>{progressLabel}</span>
                    <span className="font-bold text-zinc-200">
                      +{formatNumber(mission.xpReward)} XP
                    </span>
                  </div>

                  <MissionRewardStatusCard status={mission.rewardStatus} />

                  {activeStep ? (
                    <div className="mt-4 rounded-lg border border-emerald-300/25 bg-emerald-300/[0.08] p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                        Текущий шаг
                      </p>
                      <p className="mt-1 text-sm font-black text-white">
                        {activeStep.title}
                      </p>
                      <p className="mt-1 text-xs text-emerald-100/80">
                        {formatMissionStepProgress(activeStep)}
                      </p>
                    </div>
                  ) : null}

                  {mission.questSteps.length ? (
                    <div className="mt-3 grid gap-2">
                      {mission.questSteps.map((step, index) => (
                        <div
                          key={step.id}
                          className={[
                            "flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2",
                            step.completed
                              ? "border-emerald-300/30 bg-emerald-300/[0.07]"
                              : step.current
                                ? "border-emerald-300/25 bg-white/[0.06]"
                                : "border-white/10 bg-white/[0.03]",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black",
                              step.completed
                                ? "bg-emerald-300 text-zinc-950"
                                : step.current
                                  ? "bg-white text-zinc-950"
                                  : "bg-white/10 text-zinc-300",
                            ].join(" ")}
                          >
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-white">
                              {step.title}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {formatMissionStepProgress(step)}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-black text-zinc-300">
                            {missionStepStateLabel(step)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-col gap-1 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                    <span>{missionRewardNote(mission)}</span>
                    {mission.periodTo ? (
                      <span>до {formatDate(mission.periodTo)}</span>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="rounded-lg border border-white/10 bg-zinc-950/45 p-4 text-sm leading-6 text-zinc-300">
              В этой вкладке квестов пока нет. Откройте другую группу или
              дождитесь нового события клуба.
            </p>
          )
        ) : (
          <p className="text-sm leading-6 text-zinc-300">
            Активных миссий пока нет. Клуб может включить их в Guest Game Hub.
          </p>
        )}
      </div>
    </section>
  );
}

function MissionHistoryPanel({
  missions,
  total,
}: {
  missions: GameMissionHistoryItem[];
  total: number;
}) {
  return (
    <section
      id="mission-history"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            История квестов
          </p>
          <h2 className="mt-1 text-xl font-black">Активные и завершенные</h2>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-zinc-200">
          {formatNumber(missions.length)} из {formatNumber(total)}
        </span>
      </div>

      <div className="mt-5 space-y-2">
        {missions.length ? (
          missions.map((mission) => (
            <MissionHistoryRow key={mission.id} mission={mission} />
          ))
        ) : (
          <p className="rounded-lg border border-white/10 bg-zinc-950/45 p-4 text-sm leading-6 text-zinc-300">
            История появится после первого игрового события в клубе.
          </p>
        )}
      </div>
    </section>
  );
}

function MissionHistoryRow({
  mission,
}: {
  mission: GameMissionHistoryItem;
}) {
  const progressTarget = mission.progressTarget ?? 1;
  const progressUnit = mission.progressUnit ? ` ${mission.progressUnit}` : "";
  const rewardLabel =
    mission.rewardStatus.rewardLabel ??
    mission.rewardLabel ??
    `${formatNumber(mission.xpReward)} XP`;
  const meta = [
    `${Math.round(mission.progressPercent)}%`,
    `${formatNumber(mission.progressCurrent)}/${formatNumber(
      progressTarget,
    )}${progressUnit}`,
    rewardLabel,
    mission.periodTo ? `до ${formatDate(mission.periodTo)}` : null,
    mission.rewardStatus.occurredAt
      ? formatDate(mission.rewardStatus.occurredAt)
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="grid gap-3 rounded-lg border border-white/10 bg-zinc-950/45 px-3 py-3 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={missionHistoryBadgeClass(mission.rewardStatus.state)}>
            {mission.rewardStatus.label}
          </span>
          <p className="min-w-0 truncate text-sm font-black text-white">
            {mission.name}
          </p>
        </div>
        <p className="mt-1 text-xs leading-5 text-zinc-400">
          {mission.rewardStatus.hint}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] font-bold text-zinc-400 lg:max-w-md lg:justify-end">
        {meta.map((value) => (
          <span
            key={value}
            className="rounded-full border border-white/10 px-2 py-1"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function missionHistoryBadgeClass(
  state: GameMissionHistoryItem["rewardStatus"]["state"],
) {
  const base = "rounded-full px-2 py-1 text-xs font-black";

  switch (state) {
    case "CONFIRMED":
    case "READY":
    case "REDEEMED":
    case "COMPLETED":
      return `${base} bg-emerald-300 text-zinc-950`;
    case "QUEUED":
    case "SENDING":
    case "WAITING_APPROVAL":
      return `${base} bg-amber-300/20 text-amber-100`;
    case "FAILED":
    case "CANCELED":
    case "EXPIRED":
      return `${base} bg-rose-300/20 text-rose-100`;
    default:
      return `${base} bg-white/10 text-zinc-200`;
  }
}

function MissionFilterTabs({
  activeFilter,
  options,
  onChange,
}: {
  activeFilter: MissionBoardFilter;
  options: Array<{ key: MissionBoardFilter; label: string; count: number }>;
  onChange: (filter: MissionBoardFilter) => void;
}) {
  return (
    <div
      aria-label="Фильтр квестов"
      className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-zinc-950/35 p-1 sm:grid-cols-4"
      role="tablist"
    >
      {options.map((option) => {
        const active = option.key === activeFilter;

        return (
          <button
            key={option.key}
            aria-selected={active}
            className={[
              "min-h-11 rounded-md px-3 py-2 text-left text-xs font-bold transition",
              active
                ? "bg-emerald-300 text-zinc-950"
                : "bg-transparent text-zinc-300 hover:bg-white/10 hover:text-white",
            ].join(" ")}
            onClick={() => onChange(option.key)}
            role="tab"
            type="button"
          >
            <span className="block truncate">{option.label}</span>
            <span className="mt-1 block text-[11px] opacity-75">
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function buildMissionFilterOptions(missions: GameMission[]) {
  return [
    {
      key: "AVAILABLE" as const,
      label: "Доступные",
      count: missions.filter((mission) =>
        missionMatchesFilter(mission, "AVAILABLE"),
      ).length,
    },
    {
      key: "ALMOST_DONE" as const,
      label: "Почти готовы",
      count: missions.filter((mission) =>
        missionMatchesFilter(mission, "ALMOST_DONE"),
      ).length,
    },
    {
      key: "REWARD_PENDING" as const,
      label: "Награда",
      count: missions.filter((mission) =>
        missionMatchesFilter(mission, "REWARD_PENDING"),
      ).length,
    },
    {
      key: "ALL" as const,
      label: "Все",
      count: missions.length,
    },
  ];
}

function missionMatchesFilter(
  mission: GameMission,
  filter: MissionBoardFilter,
) {
  switch (filter) {
    case "AVAILABLE":
      return mission.progressPercent < 100;
    case "ALMOST_DONE":
      return mission.progressPercent >= 70 && mission.progressPercent < 100;
    case "REWARD_PENDING":
      return mission.rewardStatus.state !== "IN_PROGRESS";
    case "ALL":
      return true;
    default:
      return false;
  }
}

function missionCardClass(mission: GameMission) {
  if (
    mission.rewardStatus.state === "FAILED" ||
    mission.rewardStatus.state === "CANCELED" ||
    mission.rewardStatus.state === "EXPIRED"
  ) {
    return "rounded-lg border border-rose-300/25 bg-rose-300/[0.06] p-4";
  }

  if (
    mission.rewardStatus.state === "QUEUED" ||
    mission.rewardStatus.state === "SENDING" ||
    mission.rewardStatus.state === "WAITING_APPROVAL"
  ) {
    return "rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-4";
  }

  return [
    "rounded-lg border p-4",
    mission.progressPercent >= 100
      ? "border-emerald-300/30 bg-emerald-300/[0.07]"
      : mission.progressPercent >= 70
        ? "border-amber-300/25 bg-amber-300/[0.06]"
        : "border-white/10 bg-zinc-950/45",
  ].join(" ");
}

function missionStatusBadgeClass(mission: GameMission) {
  if (
    mission.rewardStatus.state === "FAILED" ||
    mission.rewardStatus.state === "CANCELED" ||
    mission.rewardStatus.state === "EXPIRED"
  ) {
    return "mt-1 block rounded-full bg-rose-300/20 px-2 py-1 text-xs font-bold text-rose-100";
  }

  if (
    mission.rewardStatus.state === "QUEUED" ||
    mission.rewardStatus.state === "SENDING" ||
    mission.rewardStatus.state === "WAITING_APPROVAL"
  ) {
    return "mt-1 block rounded-full bg-amber-300/20 px-2 py-1 text-xs font-bold text-amber-100";
  }

  return [
    "mt-1 block rounded-full px-2 py-1 text-xs font-bold",
    mission.progressPercent >= 100
      ? "bg-emerald-300 text-zinc-950"
      : mission.progressPercent >= 70
        ? "bg-amber-300/20 text-amber-100"
        : "bg-white/10 text-zinc-200",
  ].join(" ");
}

function missionStateLabel(mission: GameMission) {
  if (mission.rewardStatus.state !== "IN_PROGRESS") {
    return mission.rewardStatus.label.toLowerCase();
  }

  if (mission.progressPercent >= 100) {
    return mission.manualApprovalRequired
      ? "ждет подтверждения"
      : "квест выполнен";
  }

  return "в процессе";
}

function missionRewardNote(mission: GameMission) {
  if (mission.manualApprovalRequired) {
    return "Награда появится после подтверждения команды.";
  }

  return "Бонус начисляется автоматически после выполнения.";
}

function MissionRewardStatusCard({
  status,
}: {
  status: GameMission["rewardStatus"];
}) {
  const rewardLabel =
    status.rewardLabel ??
    (status.rewardAmount !== null
      ? `${formatSignedNumber(status.rewardAmount)} бонусов`
      : null);
  const meta = [
    status.rewardWalletState ? walletStateLabel(status.rewardWalletState) : null,
    status.occurredAt ? formatDate(status.occurredAt) : null,
    status.balanceAfter !== null
      ? `баланс ${formatNumber(status.balanceAfter)}`
      : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className={missionRewardStatusPanelClass(status.state)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={missionRewardStatusTitleClass(status.state)}>
            {status.label}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-300">{status.hint}</p>
        </div>
        {rewardLabel ? (
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-xs font-black text-zinc-100">
            {rewardLabel}
          </span>
        ) : null}
      </div>
      {meta.length ? (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-zinc-400">
          {meta.map((item) => (
            <span
              key={item}
              className="rounded-full border border-white/10 px-2 py-1"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function missionRewardStatusPanelClass(
  state: GameMission["rewardStatus"]["state"],
) {
  const base = "mt-4 rounded-lg border px-3 py-3";

  switch (state) {
    case "CONFIRMED":
    case "READY":
    case "REDEEMED":
    case "COMPLETED":
      return `${base} border-emerald-300/25 bg-emerald-300/[0.08]`;
    case "QUEUED":
    case "SENDING":
    case "WAITING_APPROVAL":
      return `${base} border-amber-300/25 bg-amber-300/[0.07]`;
    case "FAILED":
    case "CANCELED":
    case "EXPIRED":
      return `${base} border-rose-300/25 bg-rose-300/[0.07]`;
    default:
      return `${base} border-white/10 bg-zinc-950/35`;
  }
}

function missionRewardStatusTitleClass(
  state: GameMission["rewardStatus"]["state"],
) {
  switch (state) {
    case "CONFIRMED":
    case "READY":
    case "REDEEMED":
    case "COMPLETED":
      return "text-xs font-black uppercase tracking-wide text-emerald-200";
    case "QUEUED":
    case "SENDING":
    case "WAITING_APPROVAL":
      return "text-xs font-black uppercase tracking-wide text-amber-100";
    case "FAILED":
    case "CANCELED":
    case "EXPIRED":
      return "text-xs font-black uppercase tracking-wide text-rose-100";
    default:
      return "text-xs font-black uppercase tracking-wide text-zinc-300";
  }
}

function missionStepStateLabel(
  step: GameMission["questSteps"][number],
) {
  if (step.completed) {
    return "готово";
  }

  return step.current ? "сейчас" : "далее";
}

function formatMissionStepProgress(
  step: GameMission["questSteps"][number],
) {
  return `${formatNumber(step.progressCurrent)} / ${formatNumber(step.target)}`;
}

function BattlePassPanel({
  battlePass,
}: {
  battlePass: GuestPortalGameSummary["battlePass"]["active"];
}) {
  return (
    <section
      id="battlePass"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
        Battle Pass
      </p>
      {battlePass ? (
        <>
          <div className="mt-1 flex items-start justify-between gap-3">
            <h2 className="text-xl font-black">{battlePass.name}</h2>
            <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold">
              {battlePass.progressPercent}%
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-300"
              style={{ width: `${clampPercent(battlePass.progressPercent)}%` }}
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Уровень"
              value={formatNumber(battlePass.currentLevel)}
              note={
                battlePass.nextLevel
                  ? `следующий ${battlePass.nextLevel}`
                  : "максимум"
              }
            />
            <Metric
              label="До уровня"
              value={
                battlePass.xpToNextLevel !== null
                  ? `${formatNumber(battlePass.xpToNextLevel)} XP`
                  : "0 XP"
              }
              note={battlePass.nextRewardLabel ?? "награда не задана"}
            />
            <Metric
              label="Наград"
              value={formatNumber(battlePass.readyRewards)}
              note={`${formatNumber(
                battlePass.waitingApprovalRewards,
              )} ждут`}
            />
          </div>
          {battlePass.levels.length ? (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-white">
                  Дорожка уровней
                </h3>
                <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold text-zinc-300">
                  {formatNumber(battlePass.levels.length)} рядом
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {battlePass.levels.map((level) => {
                  const rewardText =
                    level.freeReward ??
                    level.premiumReward ??
                    `${formatNumber(level.xp)} XP`;

                  return (
                    <div
                      key={level.level}
                      className={[
                        "rounded-lg border px-3 py-3",
                        level.current
                          ? "border-emerald-300/40 bg-emerald-300/[0.09]"
                          : level.reached
                            ? "border-white/10 bg-white/[0.06]"
                            : level.next
                              ? "border-amber-300/35 bg-amber-300/[0.08]"
                              : "border-white/10 bg-zinc-950/45",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Уровень {formatNumber(level.level)}
                          </p>
                          <p className="mt-1 text-sm font-black text-white">
                            {rewardText}
                          </p>
                        </div>
                        <span
                          className={[
                            "shrink-0 rounded-full px-2 py-1 text-xs font-black",
                            level.current
                              ? "bg-emerald-300 text-zinc-950"
                              : level.reached
                                ? "bg-white/10 text-zinc-200"
                                : level.next
                                  ? "bg-amber-300 text-zinc-950"
                                  : "bg-white/10 text-zinc-400",
                          ].join(" ")}
                        >
                          {battlePassLevelLabel(level)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-col gap-1 text-xs text-zinc-500">
                        <span>{formatNumber(level.xp)} XP</span>
                        {level.freeReward && level.premiumReward ? (
                          <span>premium: {level.premiumReward}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm leading-6 text-zinc-300">
          Сезон пока не запущен. Когда клуб включит Battle Pass, прогресс
          появится здесь.
        </p>
      )}
    </section>
  );
}

function battlePassLevelLabel(
  level: NonNullable<
    GuestPortalGameSummary["battlePass"]["active"]
  >["levels"][number],
) {
  if (level.current) {
    return "сейчас";
  }

  if (level.reached) {
    return "пройден";
  }

  return level.next ? "далее" : "закрыт";
}

function ActivityPanel({
  activity,
}: {
  activity: GuestPortalGameSummary["activity"];
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Активность
          </p>
          <h2 className="mt-1 text-xl font-black">Почему изменился прогресс</h2>
        </div>
        {activity.lastActivityAt ? (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-300">
            обновлено {formatDate(activity.lastActivityAt)}
          </span>
        ) : null}
      </div>

      {activity.recent.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {activity.recent.map((item) => (
            <article
              key={item.id}
              className="rounded-lg border border-white/10 bg-zinc-950/45 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {activityKindLabel(item.kind)}
                  </p>
                  <h3 className="mt-1 truncate text-sm font-black text-white">
                    {item.title}
                  </h3>
                </div>
                {item.xpDelta !== null ? (
                  <span
                    className={[
                      "shrink-0 rounded-full px-2 py-1 text-xs font-black",
                      item.xpDelta >= 0
                        ? "bg-emerald-300 text-zinc-950"
                        : "bg-rose-300 text-zinc-950",
                    ].join(" ")}
                  >
                    {formatSignedNumber(item.xpDelta)} XP
                  </span>
                ) : null}
              </div>
              {item.description ? (
                <p className="mt-2 text-sm leading-5 text-zinc-300">
                  {item.description}
                </p>
              ) : null}
              <div className="mt-3 flex flex-col gap-1 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                <span>{formatDate(item.occurredAt)}</span>
                {item.storeName ? <span>{item.storeName}</span> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-zinc-300">
          История появится после первого чекина, XP-события или операции в
          клубе.
        </p>
      )}
    </section>
  );
}

function activityKindLabel(
  kind: GuestPortalGameSummary["activity"]["recent"][number]["kind"],
) {
  const labels = {
    SESSION: "сессия",
    LOG: "событие",
    TRANSACTION: "баланс",
    GAME_EVENT: "XP",
  } satisfies Record<
    GuestPortalGameSummary["activity"]["recent"][number]["kind"],
    string
  >;

  return labels[kind];
}

function rewardSourceKindLabel(
  kind: GuestPortalGameSummary["rewards"]["recent"][number]["sourceKind"],
) {
  const labels = {
    LOOT_BOX: "лутбокс",
    MISSION: "квест",
    BATTLE_PASS: "Battle Pass",
    MANUAL: "ручная награда",
  } satisfies Record<
    GuestPortalGameSummary["rewards"]["recent"][number]["sourceKind"],
    string
  >;

  return labels[kind];
}

function bonusStatusBadgeClass(status: GameBonusHistoryItem["status"]) {
  const classes = {
    PENDING: "bg-amber-300 text-zinc-950",
    PROCESSING: "bg-sky-300 text-zinc-950",
    CONFIRMED: "bg-emerald-300 text-zinc-950",
    FAILED: "bg-rose-300/20 text-rose-100",
    CANCELED: "bg-white/10 text-zinc-400",
    UNKNOWN: "bg-white/10 text-zinc-300",
  } satisfies Record<GameBonusHistoryItem["status"], string>;

  return classes[status];
}

function bonusStatusHint(status: GameBonusHistoryItem["status"]) {
  const hints = {
    PENDING: "Начисление уже поставлено в очередь и уйдет в Langame автоматически.",
    PROCESSING: "Начисление сейчас отправляется в Langame.",
    CONFIRMED: "Бонус подтвержден Langame и учтен в игровом балансе.",
    FAILED: "Начисление не потеряно: LeetPlus проверит его повторно или покажет в админке.",
    CANCELED: "Начисление отменено до подтверждения в Langame.",
    UNKNOWN: "Статус проверяется, начисление остается в журнале LeetPlus.",
  } satisfies Record<GameBonusHistoryItem["status"], string>;

  return hints[status];
}

function bonusHistoryDate(item: GameBonusHistoryItem) {
  return formatDate(item.confirmedAt ?? item.processedAt ?? item.occurredAt);
}

function actionPriorityLabel(priority: GameNextAction["priority"]) {
  const labels = {
    HIGH: "важно",
    MEDIUM: "скоро",
    LOW: "потом",
  } satisfies Record<GameNextAction["priority"], string>;

  return labels[priority];
}

function actionPriorityClass(priority: GameNextAction["priority"]) {
  const classes = {
    HIGH: "bg-emerald-300 text-zinc-950",
    MEDIUM: "bg-amber-300 text-zinc-950",
    LOW: "bg-white/10 text-zinc-300",
  } satisfies Record<GameNextAction["priority"], string>;

  return classes[priority];
}

function walletStateLabel(state: GameRewardWalletState) {
  const labels = {
    WAITING_APPROVAL: "Ждет проверки",
    READY: "Можно забрать",
    REDEEMED: "Выдано",
    CANCELED: "Отменено",
    EXPIRED: "Сгорело",
  } satisfies Record<GameRewardWalletState, string>;

  return labels[state];
}

function walletStateBadgeClass(state: GameRewardWalletState) {
  const classes = {
    WAITING_APPROVAL: "bg-amber-300 text-zinc-950",
    READY: "bg-emerald-300 text-zinc-950",
    REDEEMED: "bg-white/10 text-zinc-200",
    CANCELED: "bg-rose-300/20 text-rose-100",
    EXPIRED: "bg-white/10 text-zinc-400",
  } satisfies Record<GameRewardWalletState, string>;

  return classes[state];
}

function walletStateHint(state: GameRewardWalletState) {
  const hints = {
    WAITING_APPROVAL: "Сотрудник клуба проверит результат и подготовит выдачу.",
    READY: "Покажите код кассиру в клубе, чтобы получить награду.",
    REDEEMED: "Награда уже выдана и отмечена в LeetPlus.",
    CANCELED: "Награда отменена сотрудником клуба.",
    EXPIRED: "Срок действия награды закончился.",
  } satisfies Record<GameRewardWalletState, string>;

  return hints[state];
}

function ChannelsPanel({
  summary,
  guestPortalHref,
}: {
  summary: GuestPortalGameSummary;
  guestPortalHref: string;
}) {
  const communicationsHref = `${guestPortalHref}#communications`;
  const hasRewardChannel =
    summary.communications.telegram.readyForRewards ||
    summary.communications.max.readyForRewards;

  return (
    <section
      id="communications"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
        Каналы
      </p>
      <h2 className="mt-1 text-xl font-black">Готовность связи</h2>
      <div className="mt-5 space-y-3">
        <ChannelRow
          label="Телефон"
          status={summary.communications.phoneConsentStatus}
          ready={summary.communications.phoneConsentStatus === "GRANTED"}
        />
        <ChannelRow
          label="Telegram"
          status={summary.communications.telegram.status}
          ready={summary.communications.telegram.readyForRewards}
        />
        <ChannelRow
          label="MAX"
          status={summary.communications.max.status}
          ready={summary.communications.max.readyForRewards}
        />
      </div>
      <div className="mt-4 rounded-lg border border-white/10 bg-zinc-950/45 p-3">
        <p className="text-sm font-bold text-white">
          {hasRewardChannel
            ? "Игровые уведомления готовы к выдаче наград."
            : "Награды можно забрать по коду кассиру, а уведомления включаются в кабинете."}
        </p>
        <Link
          href={communicationsHref}
          className="mt-3 flex min-h-10 items-center justify-center rounded-lg border border-emerald-300/35 px-3 text-sm font-black text-emerald-100 transition hover:border-emerald-300"
        >
          Открыть каналы
        </Link>
      </div>
    </section>
  );
}

function ChannelRow({
  label,
  status,
  ready,
}: {
  label: string;
  status: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-zinc-950/45 px-3 py-3">
      <div>
        <p className="text-sm font-bold">{label}</p>
        <p className="text-xs text-zinc-400">{status}</p>
      </div>
      <span
        className={[
          "rounded-full px-2 py-1 text-xs font-black",
          ready
            ? "bg-emerald-300 text-zinc-950"
            : "bg-white/10 text-zinc-300",
        ].join(" ")}
      >
        {ready ? "готов" : "нужно связать"}
      </span>
    </div>
  );
}

const clubHomeCss = `
.lp-club-home-page {
  min-height: 100vh;
  color: #edf7f8;
  background: #000;
  letter-spacing: 0;
  overflow-x: hidden;
}

.lp-club-home-page *,
.lp-club-home-page *::before,
.lp-club-home-page *::after {
  box-sizing: border-box;
}

.lp-club-home {
  --bg: #000;
  --panel: rgba(8, 14, 18, 0.9);
  --panel-strong: rgba(10, 18, 22, 0.96);
  --line: rgba(196, 224, 225, 0.18);
  --line-strong: rgba(140, 230, 237, 0.56);
  --text: #edf7f8;
  --muted: #a8b9ba;
  --quiet: #71878a;
  --cyan: #83e4ec;
  --teal: #54bfc6;
  --amber: #d0aa6c;
  --good: #94d6b8;
  --radius: 8px;
  --shadow: 0 30px 90px rgba(0, 0, 0, 0.48);
  position: relative;
  min-height: 100vh;
  isolation: isolate;
  background:
    radial-gradient(circle at 72% 8%, rgba(131, 228, 236, 0.08), transparent 28%),
    radial-gradient(circle at 18% 68%, rgba(208, 170, 108, 0.045), transparent 26%),
    #000;
}

.lp-club-home::before,
.lp-club-home-static::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0.72;
  background-image:
    linear-gradient(rgba(160, 223, 225, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(160, 223, 225, 0.028) 1px, transparent 1px);
  background-size: 96px 96px;
  mask-image: linear-gradient(180deg, transparent, #000 12%, #000 86%, transparent);
}

.lp-club-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  min-height: 78px;
  padding: 18px clamp(18px, 3.4vw, 46px);
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.96), rgba(0, 0, 0, 0.72), transparent);
  backdrop-filter: blur(14px);
}

.lp-club-menu-button,
.lp-club-icon-badge {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border: 1px solid rgba(196, 224, 225, 0.2);
  border-radius: 8px;
  color: #edf7f8;
  background: rgba(196, 224, 225, 0.035);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-club-menu-button {
  cursor: pointer;
}

.lp-club-menu-button:hover,
.lp-club-icon-badge:hover {
  border-color: rgba(131, 228, 236, 0.58);
  background: rgba(131, 228, 236, 0.08);
  transform: translateY(-1px);
}

.lp-club-home svg,
.lp-club-home-static svg {
  width: 20px;
  height: 20px;
  stroke-width: 1.8;
}

.lp-club-network {
  display: flex;
  align-items: center;
  gap: clamp(18px, 4vw, 54px);
  min-width: 0;
}

.lp-club-brand,
.lp-club-switch {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  text-decoration: none;
  text-transform: uppercase;
}

.lp-club-brand {
  gap: 12px;
  color: var(--text);
  font-size: 12px;
  font-weight: 820;
  letter-spacing: 0.14em;
}

.lp-club-brand-mark {
  position: relative;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid rgba(196, 224, 225, 0.36);
  border-radius: 50%;
}

.lp-club-brand-mark::before,
.lp-club-brand-mark::after {
  content: "";
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(131, 228, 236, 0.38);
  transform: rotate(45deg);
}

.lp-club-brand-mark::after {
  inset: 14px;
  border-color: var(--amber);
}

.lp-club-switch {
  gap: 9px;
  color: var(--cyan);
  font-size: 12px;
  font-weight: 820;
  letter-spacing: 0.12em;
}

.lp-club-switch span,
.lp-club-brand span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-club-session-state {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 11px 13px;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 8px;
  background: rgba(7, 12, 16, 0.56);
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-club-session-state::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 16px rgba(131, 228, 236, 0.64);
}

.lp-club-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  width: min(1480px, 100%);
  min-height: calc(100vh - 78px);
  margin: 0 auto;
  padding: 18px clamp(18px, 3.4vw, 46px) 32px;
}

.lp-club-main-flow {
  display: grid;
  grid-template-rows: minmax(250px, auto) auto minmax(220px, 1fr);
  gap: 20px;
  min-width: 0;
}

.lp-club-stage {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(500px, 590px);
  gap: 20px;
  min-width: 0;
}

.lp-club-card,
.lp-club-panel,
.lp-club-profile-panel,
.lp-club-static-card {
  position: relative;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.045), transparent 26%),
    var(--panel);
  box-shadow: var(--shadow);
}

.lp-club-card::before,
.lp-club-panel::before,
.lp-club-profile-panel::before,
.lp-club-static-card::before {
  content: "";
  position: absolute;
  top: -1px;
  left: -1px;
  width: 42px;
  height: 42px;
  border-top: 1px solid var(--cyan);
  border-left: 1px solid var(--cyan);
  border-top-left-radius: var(--radius);
  pointer-events: none;
}

.lp-club-card {
  min-height: 250px;
  overflow: hidden;
  padding: 24px;
}

.lp-club-card::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(131, 228, 236, 0.58), transparent);
}

.lp-club-label,
.lp-club-small-label {
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.lp-club-label {
  display: inline-flex;
  align-items: center;
  gap: 9px;
}

.lp-club-label::before {
  content: "";
  width: 36px;
  height: 1px;
  background: linear-gradient(90deg, var(--cyan), transparent);
}

.lp-club-home h1,
.lp-club-home h2,
.lp-club-home h3,
.lp-club-home p,
.lp-club-home-static h1,
.lp-club-home-static p {
  margin: 0;
}

.lp-club-card h1 {
  max-width: 560px;
  margin-top: 34px;
  color: var(--text);
  font-size: clamp(42px, 5.2vw, 76px);
  line-height: 0.92;
  font-weight: 760;
}

.lp-club-card p {
  max-width: 560px;
  margin-top: 18px;
  color: #c2d0d1;
  font-size: 16px;
  line-height: 1.62;
}

.lp-club-quick-metrics {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 12px;
  margin-top: 28px;
}

.lp-club-metric {
  min-width: 92px;
  padding: 12px 13px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  background: rgba(2, 8, 11, 0.46);
}

.lp-club-metric strong {
  display: block;
  color: var(--cyan);
  font-size: 18px;
  line-height: 1;
}

.lp-club-metric span {
  display: block;
  margin-top: 7px;
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-club-banner-grid {
  display: grid;
  grid-template-columns: 1.05fr 1fr 1fr;
  gap: 14px;
  min-width: 0;
}

.lp-club-banner {
  position: relative;
  min-height: 250px;
  overflow: hidden;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: var(--radius);
  color: inherit;
  text-decoration: none;
  background:
    linear-gradient(180deg, rgba(131, 228, 236, 0.11), transparent 34%),
    rgba(5, 11, 14, 0.82);
  transition:
    border-color 180ms ease,
    transform 180ms ease,
    background 180ms ease;
}

.lp-club-banner:hover {
  border-color: rgba(131, 228, 236, 0.58);
  transform: translateY(-2px);
}

.lp-club-banner::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.7;
  background:
    linear-gradient(135deg, transparent 0 34%, rgba(131, 228, 236, 0.12) 34% 35%, transparent 35% 100%),
    radial-gradient(circle at 72% 18%, rgba(131, 228, 236, 0.16), transparent 24%);
}

.lp-club-banner.is-featured {
  background:
    linear-gradient(180deg, rgba(208, 170, 108, 0.17), transparent 36%),
    rgba(7, 12, 16, 0.86);
}

.lp-club-banner.is-featured::before {
  background:
    radial-gradient(circle at 70% 18%, rgba(208, 170, 108, 0.2), transparent 24%),
    linear-gradient(135deg, transparent 0 38%, rgba(208, 170, 108, 0.15) 38% 39%, transparent 39% 100%);
}

.lp-club-banner-content {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: space-between;
  padding: 18px;
}

.lp-club-banner-kicker,
.lp-club-banner-title,
.lp-club-banner-copy {
  display: block;
}

.lp-club-banner-kicker {
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.lp-club-banner-title {
  margin-top: 18px;
  color: var(--text);
  font-size: 24px;
  line-height: 1.05;
  font-weight: 780;
}

.lp-club-banner-copy {
  margin-top: 10px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.lp-club-banner-tag {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: var(--cyan);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-club-lootboxes,
.lp-club-battlepass,
.lp-club-profile-panel {
  padding: 18px;
}

.lp-club-section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.lp-club-section-head h2,
.lp-club-detail-head h2 {
  color: var(--text);
  font-size: 24px;
  line-height: 1.08;
  font-weight: 740;
}

.lp-club-section-head p {
  margin-top: 7px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.lp-club-loot-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.lp-club-loot-card {
  position: relative;
  min-height: 116px;
  overflow: hidden;
  padding: 16px;
  border: 1px solid rgba(196, 224, 225, 0.15);
  border-radius: var(--radius);
  color: inherit;
  text-align: left;
  background: rgba(2, 8, 11, 0.54);
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-club-loot-card:hover,
.lp-club-loot-card.is-active {
  border-color: rgba(131, 228, 236, 0.64);
  background:
    linear-gradient(90deg, rgba(131, 228, 236, 0.12), transparent),
    rgba(8, 18, 22, 0.86);
  transform: translateY(-1px);
}

.lp-club-loot-card::after {
  content: "";
  position: absolute;
  right: 14px;
  bottom: 14px;
  width: 52px;
  height: 38px;
  border: 1px solid rgba(131, 228, 236, 0.38);
  border-radius: 6px;
  background:
    linear-gradient(90deg, transparent 0 45%, rgba(131, 228, 236, 0.24) 45% 55%, transparent 55% 100%),
    linear-gradient(180deg, rgba(196, 224, 225, 0.1), rgba(196, 224, 225, 0.02));
  box-shadow: inset 0 0 0 7px rgba(0, 0, 0, 0.22);
}

.lp-club-loot-card strong {
  display: block;
  max-width: 70%;
  color: var(--text);
  font-size: 16px;
  line-height: 1.2;
}

.lp-club-loot-card span {
  display: block;
  margin-top: 10px;
  max-width: 70%;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.lp-club-loot-card em {
  position: absolute;
  right: 16px;
  top: 14px;
  color: var(--cyan);
  font-size: 10px;
  font-style: normal;
  font-weight: 860;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-club-battlepass {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.lp-club-battle-track {
  display: grid;
  grid-template-columns: repeat(6, minmax(104px, 1fr)) 178px;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.lp-club-quest {
  position: relative;
  display: grid;
  align-content: space-between;
  min-height: 96px;
  padding: 13px;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 7px;
  color: inherit;
  text-align: left;
  background: rgba(2, 8, 11, 0.58);
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-club-quest:hover,
.lp-club-quest.is-complete,
.lp-club-quest.is-current {
  transform: translateY(-1px);
}

.lp-club-quest.is-complete {
  border-color: rgba(148, 214, 184, 0.54);
  background: rgba(23, 48, 40, 0.38);
}

.lp-club-quest.is-current {
  border-color: rgba(131, 228, 236, 0.68);
  background:
    linear-gradient(90deg, rgba(131, 228, 236, 0.12), transparent),
    rgba(8, 18, 22, 0.86);
}

.lp-club-quest:not(:last-of-type)::after {
  content: "";
  position: absolute;
  top: calc(50% - 7px);
  right: -19px;
  z-index: 2;
  width: 14px;
  height: 14px;
  border-top: 2px solid rgba(196, 224, 225, 0.7);
  border-right: 2px solid rgba(196, 224, 225, 0.7);
  transform: rotate(45deg);
}

.lp-club-quest strong {
  display: block;
  color: var(--text);
  font-size: 14px;
  line-height: 1.22;
}

.lp-club-quest span span {
  display: block;
  margin-top: 9px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
}

.lp-club-quest small {
  color: var(--cyan);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-club-reward {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 176px;
}

.lp-club-reward-shape {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(135deg, rgba(208, 170, 108, 0.26), rgba(131, 228, 236, 0.12)),
    rgba(7, 13, 16, 0.98);
  clip-path: polygon(50% 0%, 62% 30%, 96% 21%, 76% 50%, 96% 79%, 62% 70%, 50% 100%, 38% 70%, 4% 79%, 24% 50%, 4% 21%, 38% 30%);
  filter: drop-shadow(0 0 32px rgba(208, 170, 108, 0.16));
}

.lp-club-reward::before {
  content: "";
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(208, 170, 108, 0.6);
  clip-path: polygon(50% 0%, 62% 30%, 96% 21%, 76% 50%, 96% 79%, 62% 70%, 50% 100%, 38% 70%, 4% 79%, 24% 50%, 4% 21%, 38% 30%);
  pointer-events: none;
}

.lp-club-reward-content {
  position: relative;
  z-index: 1;
  max-width: 128px;
  text-align: center;
}

.lp-club-reward-content strong {
  display: block;
  color: var(--text);
  font-size: 17px;
  line-height: 1.1;
  font-weight: 860;
}

.lp-club-reward-content span {
  display: block;
  margin-top: 9px;
  color: var(--amber);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-club-profile-panel {
  align-self: start;
  min-height: 100%;
}

.lp-club-profile-logo {
  display: grid;
  min-height: 92px;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: center;
  gap: 13px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border: 1px solid rgba(131, 228, 236, 0.4);
  border-radius: 50%;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.06);
}

.lp-club-profile-logo strong {
  display: block;
  color: var(--text);
  font-size: 15px;
  line-height: 1.18;
}

.lp-club-profile-logo span span {
  display: block;
  margin-top: 7px;
  color: var(--quiet);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-club-profile-section {
  padding: 17px 0;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.lp-club-profile-row strong {
  color: var(--text);
  font-size: 20px;
  line-height: 1;
}

.lp-club-progress {
  height: 10px;
  overflow: hidden;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 999px;
  background: rgba(0, 6, 9, 0.72);
}

.lp-club-progress span {
  display: block;
  width: var(--value);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--teal));
  box-shadow: 0 0 20px rgba(131, 228, 236, 0.34);
}

.lp-club-profile-section.rank .lp-club-progress span {
  background: linear-gradient(90deg, var(--amber), rgba(208, 170, 108, 0.48));
}

.lp-club-profile-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.lp-club-profile-stats strong {
  display: block;
  margin-top: 6px;
  color: var(--text);
  font-size: 18px;
}

.lp-club-promo {
  display: grid;
  gap: 10px;
  padding-top: 17px;
}

.lp-club-promo input {
  width: 100%;
  height: 46px;
  min-width: 0;
  padding: 0 12px;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 7px;
  outline: 0;
  color: var(--text);
  background: rgba(0, 6, 9, 0.68);
  font-size: 13px;
}

.lp-club-promo input:focus {
  border-color: rgba(131, 228, 236, 0.58);
  box-shadow: 0 0 0 3px rgba(131, 228, 236, 0.08);
}

.lp-club-promo button,
.lp-club-quick-actions button,
.lp-club-quick-actions a,
.lp-club-primary-link,
.lp-club-ghost-link {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 860;
  letter-spacing: 0.08em;
  text-align: center;
  text-decoration: none;
  text-transform: uppercase;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.lp-club-promo button,
.lp-club-primary-link {
  border: 1px solid rgba(131, 228, 236, 0.4);
  color: #001012;
  background: linear-gradient(135deg, #83e4ec, #94d6b8);
}

.lp-club-promo button:hover,
.lp-club-primary-link:hover {
  transform: translateY(-1px);
}

.lp-club-side-link,
.lp-club-ghost-link {
  color: var(--cyan);
  border: 1px solid rgba(131, 228, 236, 0.22);
  background: rgba(196, 224, 225, 0.035);
}

.lp-club-side-link {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}

.lp-club-quick-actions {
  display: grid;
  gap: 10px;
  padding-top: 17px;
}

.lp-club-quick-actions button {
  border: 1px solid rgba(131, 228, 236, 0.4);
  color: #001012;
  background: linear-gradient(135deg, #83e4ec, #94d6b8);
}

.lp-club-quick-actions button:disabled {
  cursor: wait;
  opacity: 0.68;
}

.lp-club-quick-actions a {
  border: 1px solid rgba(196, 224, 225, 0.18);
  color: var(--text);
  background: rgba(0, 6, 9, 0.46);
}

.lp-club-quick-actions p {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.lp-club-quest-widget {
  margin-top: 18px;
  padding-top: 17px;
  border-top: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-quest-widget-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lp-club-quest-widget-head strong {
  display: block;
  margin-top: 6px;
  color: var(--text);
  font-size: 14px;
}

.lp-club-quest-count {
  border-radius: 999px;
  padding: 6px 8px;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
  font-size: 10px;
  font-weight: 860;
}

.lp-club-side-quest-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.lp-club-side-quest {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 10px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: inherit;
  text-decoration: none;
  background: rgba(2, 8, 11, 0.48);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-club-side-quest:hover,
.lp-club-side-quest.is-current {
  border-color: rgba(131, 228, 236, 0.58);
  background:
    linear-gradient(90deg, rgba(131, 228, 236, 0.1), transparent),
    rgba(8, 18, 22, 0.82);
  transform: translateY(-1px);
}

.lp-club-side-quest.is-done {
  border-color: rgba(148, 214, 184, 0.42);
  background: rgba(23, 48, 40, 0.3);
}

.lp-club-side-quest-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(131, 228, 236, 0.26);
  border-radius: 7px;
  color: var(--cyan);
  background: rgba(196, 224, 225, 0.045);
}

.lp-club-side-quest strong {
  display: block;
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-club-side-quest span span {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-club-side-quest-state {
  color: var(--quiet);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.lp-club-side-quest.is-current .lp-club-side-quest-state,
.lp-club-side-quest.is-done .lp-club-side-quest-state {
  color: var(--cyan);
}

.lp-club-detail-stack {
  display: grid;
  gap: 18px;
  width: min(1480px, 100%);
  margin: 0 auto;
  padding: 4px clamp(18px, 3.4vw, 46px) 48px;
}

.lp-club-detail-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  padding-top: 10px;
}

.lp-club-toast {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: 18px;
  z-index: 20;
  max-width: 420px;
  margin: 0 auto;
  padding: 13px 14px;
  border: 1px solid rgba(131, 228, 236, 0.28);
  border-radius: 7px;
  background: rgba(7, 13, 16, 0.94);
  color: #d7e5e6;
  box-shadow: var(--shadow);
  font-size: 13px;
  line-height: 1.45;
  opacity: 0;
  transform: translateY(12px);
  pointer-events: none;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
  backdrop-filter: blur(18px);
}

.lp-club-toast.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.lp-club-home-static {
  --panel: rgba(8, 14, 18, 0.9);
  --line: rgba(196, 224, 225, 0.18);
  --cyan: #83e4ec;
  --text: #edf7f8;
  --muted: #a8b9ba;
  --radius: 8px;
  --shadow: 0 30px 90px rgba(0, 0, 0, 0.48);
  position: relative;
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  isolation: isolate;
  background:
    radial-gradient(circle at 72% 8%, rgba(131, 228, 236, 0.08), transparent 28%),
    #000;
}

.lp-club-static-card {
  width: min(560px, 100%);
  padding: 26px;
}

.lp-club-static-title {
  margin-top: 12px;
  color: var(--text);
  font-size: clamp(28px, 6vw, 44px);
  line-height: 1;
  font-weight: 780;
}

.lp-club-static-copy {
  margin-top: 14px;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.65;
}

.lp-club-static-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}

.lp-club-skeleton {
  height: 12px;
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.12);
}

.lp-club-skeleton + .lp-club-skeleton {
  margin-top: 12px;
}

.lp-club-skeleton-short {
  width: 120px;
}

.lp-club-skeleton-title {
  width: 68%;
  height: 42px;
  margin-top: 18px;
}

.lp-club-skeleton-mid {
  width: 76%;
}

.lp-club-static-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 24px;
}

.lp-club-static-grid .lp-club-skeleton {
  height: 64px;
  margin-top: 0;
  border-radius: 8px;
}

@media (max-width: 1180px) {
  .lp-club-shell {
    grid-template-columns: 1fr;
  }

  .lp-club-profile-panel {
    min-height: 0;
    display: grid;
    grid-template-columns: 1.1fr 1fr 1fr;
    gap: 16px;
  }

  .lp-club-profile-logo,
  .lp-club-profile-section {
    padding: 0;
    border-bottom: 0;
  }

  .lp-club-promo,
  .lp-club-quick-actions {
    padding-top: 0;
  }

  .lp-club-quest-widget {
    grid-column: span 2;
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
}

@media (max-width: 920px) {
  .lp-club-topbar {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .lp-club-session-state {
    display: none;
  }

  .lp-club-stage,
  .lp-club-banner-grid,
  .lp-club-loot-grid,
  .lp-club-profile-panel {
    grid-template-columns: 1fr;
  }

  .lp-club-card {
    min-height: 0;
  }

  .lp-club-quick-metrics {
    margin-top: 22px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .lp-club-banner {
    min-height: 156px;
  }

  .lp-club-battle-track {
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    padding-bottom: 6px;
    scroll-snap-type: x proximity;
  }

  .lp-club-quest {
    min-width: 132px;
    scroll-snap-align: start;
  }

  .lp-club-reward {
    min-width: 170px;
  }

  .lp-club-quest-widget {
    grid-column: auto;
    margin-top: 18px;
    padding-top: 17px;
    border-top: 1px solid rgba(196, 224, 225, 0.12);
  }

  .lp-club-detail-head {
    align-items: start;
    flex-direction: column;
  }
}

@media (max-width: 560px) {
  .lp-club-topbar {
    min-height: 70px;
    padding: 14px;
  }

  .lp-club-network {
    gap: 12px;
  }

  .lp-club-brand {
    gap: 9px;
    font-size: 10px;
    letter-spacing: 0.08em;
  }

  .lp-club-brand-mark {
    width: 30px;
    height: 30px;
  }

  .lp-club-switch {
    display: none;
  }

  .lp-club-shell {
    padding: 12px 12px 28px;
  }

  .lp-club-card h1 {
    font-size: 40px;
  }

  .lp-club-card,
  .lp-club-lootboxes,
  .lp-club-battlepass,
  .lp-club-profile-panel {
    padding: 16px;
  }

  .lp-club-quick-metrics,
  .lp-club-profile-stats,
  .lp-club-static-grid {
    grid-template-columns: 1fr;
  }

  .lp-club-section-head {
    align-items: start;
    flex-direction: column;
  }

  .lp-club-quest:not(:last-of-type)::after {
    right: -18px;
  }

  .lp-club-detail-stack {
    padding: 0 12px 36px;
  }

  .lp-club-static-actions {
    flex-direction: column;
  }
}
`;

function gameActionHref(action: GameNextAction, guestPortalHref: string) {
  if (action.kind === "MATCH_LANGAME") {
    return `${guestPortalHref}#langame-match`;
  }

  return `#${action.anchor}`;
}

function gameActionButtonLabel(action: GameNextAction) {
  const labels = {
    CLAIM_REWARD: "Забрать награду",
    OPEN_LOOT_BOX: "Открыть приз",
    FINISH_MISSION: "Открыть квест",
    BATTLE_PASS: "Открыть сезон",
    MATCH_LANGAME: "Связать Langame",
  } satisfies Record<GameNextAction["kind"], string>;

  return labels[action.kind];
}

async function requestGameSummary() {
  const response = await fetch("/api/guest-portal/session/game-summary", {
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new EmptySessionError("Сначала подтвердите телефон и выберите клуб.");
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось загрузить игровой экран."),
    );
  }

  return (await response.json()) as GuestPortalGameSummary;
}

async function readResponseMessage(
  response: Response,
  fallback = "Не удалось загрузить игровой экран.",
) {
  try {
    const payload = (await response.json()) as { message?: unknown };
    return typeof payload.message === "string" ? payload.message : fallback;
  } catch {
    return fallback;
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSignedNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
    signDisplay: "always",
  }).format(value);
}

function formatMinutes(value: number) {
  if (value < 60) {
    return `${formatNumber(value)} мин`;
  }

  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value / 60)} ч`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
