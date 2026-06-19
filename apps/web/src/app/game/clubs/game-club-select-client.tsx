"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  GuestPortalClubSelectResponse,
  GuestPortalGameSummary,
  GuestPortalGamificationClub,
  GuestPortalGamificationClubDirectory,
} from "@/lib/guest-portal";

type SessionState = "loading" | "ready" | "auth-required" | "error";

type GameClubSelectClientProps = {
  initialDirectory: GuestPortalGamificationClubDirectory;
  loadError: string | null;
};

export function GameClubSelectClient({
  initialDirectory,
  loadError,
}: GameClubSelectClientProps) {
  const [directory] = useState(initialDirectory);
  const [summary, setSummary] = useState<GuestPortalGameSummary | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [message, setMessage] = useState<string | null>(loadError);
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [submittingClubId, setSubmittingClubId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((nextMessage: string) => {
    setToast(nextMessage);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/guest-portal/session/game-summary", {
          cache: "no-store",
        });

        if (!active) {
          return;
        }

        if (response.status === 401) {
          setSessionState("auth-required");
          setMessage("Подтвердите телефон, чтобы выбрать клуб для игры.");
          return;
        }

        if (!response.ok) {
          throw new Error(await readMessage(response));
        }

        const data = (await response.json()) as GuestPortalGameSummary;
        const clubId = clubIdFromSummary(data);

        setSummary(data);
        setSelectedClubId(clubId);
        setSessionState("ready");
        setMessage(loadError);
      } catch (error) {
        if (!active) {
          return;
        }

        setSessionState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Не удалось открыть игровую сессию.",
        );
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, [loadError]);

  const cities = useMemo(
    () => directory.cities.filter(Boolean).slice(0, 6),
    [directory.cities],
  );
  const visibleClubs = useMemo(() => {
    const search = normalizeSearch(query);

    return directory.clubs.filter((club) => {
      const cityMatches =
        !cityFilter ||
        normalizeSearch(club.store.city) === normalizeSearch(cityFilter);
      const searchMatches =
        !search || normalizeSearch(clubSearchText(club)).includes(search);

      return cityMatches && searchMatches;
    });
  }, [cityFilter, directory.clubs, query]);
  const selectedClub =
    directory.clubs.find((club) => club.id === selectedClubId) ??
    (summary ? directory.clubs.find((club) => clubMatchesSummary(club, summary)) : null) ??
    visibleClubs[0] ??
    directory.clubs[0] ??
    null;
  const currentSessionClubId = summary ? clubIdFromSummary(summary) : null;
  const activeFilterLabel = cityFilter || query.trim() || "Все города";
  const coordinateReadiness = coordinateReadinessLabel(directory);

  async function selectClub(club: GuestPortalGamificationClub) {
    setSelectedClubId(club.id);
    setSubmittingClubId(club.id);
    setMessage(null);

    try {
      const response = await fetch("/api/guest-portal/session/select-club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId: club.id }),
      });

      if (response.status === 401) {
        setSessionState("auth-required");
        throw new Error("Сессия входа истекла. Подтвердите телефон заново.");
      }

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data = (await response.json()) as GuestPortalClubSelectResponse;

      setSummary(data.summary);
      setSelectedClubId(data.clubId);
      setSessionState("ready");
      showToast(data.message);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось выбрать клуб.",
      );
    } finally {
      setSubmittingClubId(null);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <main className="lp-club-select-page min-h-dvh overflow-x-hidden bg-black text-[#edf7f8] [color-scheme:dark]">
      <header className="lp-club-topbar">
        <Link className="lp-club-icon-button" href="/" aria-label="Назад">
          <ChevronLeftIcon />
        </Link>
        <div className="lp-club-brand">
          <span className="lp-club-brand-mark" aria-hidden="true" />
          <span>
            <strong>LeetPlus Game</strong>
            <em>выбор клуба</em>
          </span>
        </div>
        <span className="lp-club-status-pill">
          {sessionState === "ready" ? "сессия активна" : "после авторизации"}
        </span>
      </header>

      <div className="lp-club-shell">
        <section className="lp-club-hero" aria-label="Выбор клуба">
          <div>
            <div className="lp-club-label">Игровой модуль</div>
            <h1>Выберите клуб</h1>
            <p>
              Найдите город, выберите подключенный к LeetPlus игровой клуб и
              откройте квесты, батлпасс и награды именно для этой площадки.
            </p>
          </div>

          <form className="lp-club-search-card" onSubmit={submitSearch}>
            <label className="lp-club-micro-label" htmlFor="clubSearch">
              Поиск по городу или названию клуба
            </label>
            <div className="lp-club-search-box">
              <SearchIcon />
              <input
                id="clubSearch"
                autoComplete="off"
                placeholder="Например, Екатеринбург"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                className="lp-club-clear"
                type="button"
                onClick={() => {
                  setQuery("");
                  setCityFilter("");
                }}
              >
                Сброс
              </button>
            </div>
            <div className="lp-club-chips" aria-label="Быстрый выбор города">
              <CityChip
                active={!cityFilter}
                label="Все"
                onClick={() => setCityFilter("")}
              />
              {cities.map((city) => (
                <CityChip
                  active={cityFilter === city}
                  key={city}
                  label={city}
                  onClick={() => setCityFilter(city)}
                />
              ))}
            </div>
          </form>
        </section>

        {sessionState !== "ready" ? (
          <StatePanel state={sessionState} message={message} />
        ) : null}

        <section
          className={`lp-club-panel lp-club-map ${
            mapExpanded ? "is-expanded" : ""
          }`}
          aria-label="Карта клубов"
        >
          <div className="lp-club-map-head">
            <span>
              <h2>Карта клубов</h2>
              <p>
                {mapExpanded
                  ? "Карта развернута. Маркеры показывают схему подключенных клубов."
                  : "Карта свернута. Разверните, чтобы увидеть схему расположения клубов."}
              </p>
            </span>
            <button
              className="lp-club-map-toggle"
              type="button"
              aria-expanded={mapExpanded}
              onClick={() => setMapExpanded((value) => !value)}
            >
              <ChevronDownIcon />
              {mapExpanded ? "Свернуть карту" : "Развернуть карту"}
            </button>
          </div>
          <div className="lp-club-map-canvas" aria-hidden="true">
            {visibleClubs.slice(0, 9).map((club, index) => (
              <span
                className={`lp-club-marker ${
                  club.id === selectedClubId ? "is-selected" : ""
                }`}
                key={club.id}
                style={markerStyle(index)}
              >
                <MapPinIcon />
              </span>
            ))}
            <span className="lp-club-map-meta">
              <span>{activeFilterLabel}</span>
              <span>{pluralizeClubs(visibleClubs.length)}</span>
            </span>
          </div>
        </section>

        <section className="lp-club-content-grid">
          <section className="lp-club-panel lp-club-results" aria-label="Список клубов">
            <div className="lp-club-results-head">
              <span>
                <h2>Подключенные клубы</h2>
                <p>Показываем только клубы, где активирован LeetPlus Game.</p>
              </span>
              <span className="lp-club-count">
                {pluralizeClubs(visibleClubs.length)}
              </span>
            </div>

            {visibleClubs.length > 0 ? (
              <div className="lp-club-list">
                {visibleClubs.map((club) => (
                  <ClubCard
                    club={club}
                    current={currentSessionClubId === club.id}
                    key={club.id}
                    selected={selectedClub?.id === club.id}
                    submitting={submittingClubId === club.id}
                    onSelect={() => void selectClub(club)}
                  />
                ))}
              </div>
            ) : (
              <div className="lp-club-empty">
                В этом городе пока нет клубов с подключенным LeetPlus Game.
              </div>
            )}
          </section>

          <aside className="lp-club-panel lp-club-side" aria-label="Статус выбора">
            <SideBlock label="Сессия входа">
              <strong>{selectedClub?.store.name ?? "Клуб не выбран"}</strong>
              <div className="lp-club-progress" aria-label="Готовность">
                <span
                  style={
                    {
                      "--value": `${summary?.account.readinessPercent ?? 64}%`,
                    } as CSSProperties
                  }
                />
              </div>
            </SideBlock>
            <SideBlock label="Доступно сейчас">
              <div className="lp-club-small-list">
                <SmallRow
                  label="Квесты"
                  value={String(selectedClub?.gamification.activeMissions ?? 0)}
                />
                <SmallRow
                  label="Батлпасс"
                  value={
                    selectedClub?.gamification.activeSeasons
                      ? "активен"
                      : "нет"
                  }
                />
                <SmallRow
                  label="Награды"
                  value={
                    selectedClub?.gamification.bonusWriteReady
                      ? "Langame"
                      : "очередь"
                  }
                />
                <SmallRow label="Геопоиск" value={coordinateReadiness.status} />
              </div>
            </SideBlock>
            <SideBlock label="Карта и поиск рядом">
              <strong>{coordinateReadiness.title}</strong>
              <p className="lp-club-side-note">{coordinateReadiness.note}</p>
            </SideBlock>
            <SideBlock label="Игрок">
              <strong>
                {summary
                  ? `Уровень ${summary.profile.level} · ${formatNumber(summary.profile.xp)} XP`
                  : "Ожидает вход"}
              </strong>
            </SideBlock>
            <div className="lp-club-actions">
              <Link className="lp-club-primary" href="/game/app">
                Открыть игру
                <ArrowRightIcon />
              </Link>
              {selectedClub ? (
                <Link className="lp-club-secondary" href={selectedClub.links.guestPortalPath}>
                  Кабинет клуба
                </Link>
              ) : null}
            </div>
          </aside>
        </section>
      </div>

      <Toast message={toast} />
      <ClubSelectStyles />
    </main>
  );
}

function StatePanel({
  state,
  message,
}: {
  state: SessionState;
  message: string | null;
}) {
  const authRequired = state === "auth-required";

  return (
    <section className="lp-club-panel lp-club-state">
      <div className="lp-club-micro-label">
        {state === "loading" ? "Проверяем сессию" : "Сессия входа"}
      </div>
      <h2>
        {state === "loading"
          ? "Открываем игровой профиль"
          : authRequired
            ? "Нужен игровой вход"
            : "Не удалось открыть сессию"}
      </h2>
      <p>
        {message ??
          "После подтверждения телефона здесь появится выбор клуба для игрового модуля."}
      </p>
      {authRequired ? (
        <Link className="lp-club-primary" href="/game/auth">
          Перейти ко входу
          <ArrowRightIcon />
        </Link>
      ) : null}
    </section>
  );
}

function CityChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`lp-club-chip ${active ? "is-active" : ""}`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ClubCard({
  club,
  current,
  selected,
  submitting,
  onSelect,
}: {
  club: GuestPortalGamificationClub;
  current: boolean;
  selected: boolean;
  submitting: boolean;
  onSelect: () => void;
}) {
  return (
    <article className={`lp-club-card ${selected ? "is-selected" : ""}`}>
      <div>
        <div className="lp-club-title">
          <span className="lp-club-card-icon" aria-hidden="true">
            <ClubIcon />
          </span>
          <span>
            <strong>{club.store.name}</strong>
            <span>{formatClubLocation(club)}</span>
          </span>
        </div>
        <div className="lp-club-tags">
          <span className="is-live">game module</span>
          {club.gamification.activeMissions > 0 ? <span>квесты</span> : null}
          {club.gamification.activeSeasons > 0 ? <span>батлпасс</span> : null}
          {club.gamification.activeLootBoxes > 0 ? <span>лутбоксы</span> : null}
          {current ? <span className="is-current">текущая сессия</span> : null}
        </div>
      </div>
      <div className="lp-club-card-side">
        <span className="lp-club-distance">{distanceLabel(club)}</span>
        <button
          className="lp-club-card-action"
          type="button"
          disabled={submitting}
          onClick={onSelect}
        >
          {submitting ? "Сохраняем" : current ? "Выбран" : "Выбрать"}
        </button>
      </div>
    </article>
  );
}

function SideBlock({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="lp-club-side-block">
      <span className="lp-club-micro-label">{label}</span>
      {children}
    </div>
  );
}

function SmallRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="lp-club-small-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Toast({ message }: { message: string | null }) {
  return (
    <div
      className={`lp-club-toast ${message ? "is-visible" : ""}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

function clubIdFromSummary(summary: GuestPortalGameSummary) {
  return `${summary.tenant.slug}:${summary.store.publicSlug ?? summary.store.id}`;
}

function clubMatchesSummary(
  club: GuestPortalGamificationClub,
  summary: GuestPortalGameSummary,
) {
  return (
    club.tenant.slug === summary.tenant.slug &&
    club.store.id === summary.store.id
  );
}

function clubSearchText(club: GuestPortalGamificationClub) {
  return [
    club.tenant.name,
    club.tenant.slug,
    club.store.name,
    club.store.city,
    club.store.address,
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeSearch(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function formatClubLocation(club: GuestPortalGamificationClub) {
  return [club.store.city, club.store.address].filter(Boolean).join(" · ");
}

function coordinateReadinessLabel(
  directory: GuestPortalGamificationClubDirectory,
) {
  const coordinates = directory.search.coordinates;

  if (coordinates.total === 0) {
    return {
      status: "нет клубов",
      title: "Клубы не найдены",
      note: "Подключите клубы к LeetPlus Game, чтобы открыть выбор площадки.",
    };
  }

  if (coordinates.missing === 0) {
    return {
      status: "готов",
      title: "Геопоиск готов",
      note: `${formatNumber(coordinates.ready)} из ${formatNumber(
        coordinates.total,
      )} клубов имеют координаты.`,
    };
  }

  if (coordinates.ready === 0) {
    return {
      status: "нет координат",
      title: "Координаты не заполнены",
      note: `Заполните координаты для ${formatNumber(
        coordinates.missing,
      )} клубов в /stores, чтобы заработал поиск рядом.`,
    };
  }

  return {
    status: `${coordinates.readyPercent}%`,
    title: "Геопоиск частично готов",
    note: `${formatNumber(coordinates.ready)} из ${formatNumber(
      coordinates.total,
    )} клубов с координатами; без координат: ${formatNumber(
      coordinates.missing,
    )}.`,
  };
}

function distanceLabel(club: GuestPortalGamificationClub) {
  const distance = club.location.distanceKm;

  if (distance === null) {
    return club.location.coordinatesReady ? "рядом" : "без координат";
  }

  return `${distance.toFixed(distance >= 10 ? 0 : 1)} км`;
}

function pluralizeClubs(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} клуб`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} клуба`;
  }

  return `${count} клубов`;
}

function markerStyle(index: number) {
  const points = [
    ["28%", "52%"],
    ["48%", "38%"],
    ["68%", "58%"],
    ["80%", "32%"],
    ["36%", "28%"],
    ["58%", "72%"],
    ["18%", "40%"],
    ["74%", "76%"],
    ["44%", "60%"],
  ];
  const [x, y] = points[index % points.length];

  return { "--x": x, "--y": y } as CSSProperties;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

async function readMessage(response: Response) {
  try {
    const data = (await response.json()) as { message?: unknown };

    return typeof data.message === "string"
      ? data.message
      : "Запрос не выполнен.";
  } catch {
    return "Запрос не выполнен.";
  }
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="m21 21-4.3-4.3" />
      <circle cx="11" cy="11" r="7" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M12 21s7-5.3 7-11a7 7 0 0 0-14 0c0 5.7 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
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

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function ClubSelectStyles() {
  return (
    <style>{`
.lp-club-select-page {
  --bg: #000;
  --panel: rgba(8, 14, 18, 0.92);
  --line: rgba(196, 224, 225, 0.17);
  --line-strong: rgba(131, 228, 236, 0.58);
  --text: #edf7f8;
  --muted: #a8b9ba;
  --quiet: #71878a;
  --cyan: #83e4ec;
  --teal: #54bfc6;
  --amber: #d0aa6c;
  --good: #94d6b8;
  background:
    radial-gradient(circle at 82% 10%, rgba(131, 228, 236, 0.1), transparent 28%),
    radial-gradient(circle at 14% 72%, rgba(208, 170, 108, 0.04), transparent 28%),
    #000;
  letter-spacing: 0;
  position: relative;
  isolation: isolate;
}
.lp-club-select-page::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0.7;
  background-image:
    linear-gradient(rgba(160, 223, 225, 0.034) 1px, transparent 1px),
    linear-gradient(90deg, rgba(160, 223, 225, 0.026) 1px, transparent 1px);
  background-size: 96px 96px;
  mask-image: linear-gradient(180deg, transparent, #000 12%, #000 86%, transparent);
}
.lp-club-select-page svg {
  width: 19px;
  height: 19px;
  stroke-width: 1.8;
}
.lp-club-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: calc(76px + env(safe-area-inset-top, 0px));
  padding: calc(17px + env(safe-area-inset-top, 0px)) clamp(16px, 3.2vw, 46px) 14px;
  background: linear-gradient(180deg, rgba(0,0,0,.96), rgba(0,0,0,.72), transparent);
  backdrop-filter: blur(14px);
}
.lp-club-icon-button {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(196, 224, 225, 0.2);
  border-radius: 8px;
  background: rgba(196, 224, 225, 0.035);
  color: var(--text);
}
.lp-club-brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
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
.lp-club-brand strong,
.lp-club-brand em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: normal;
}
.lp-club-brand strong {
  color: var(--text);
  font-size: 12px;
  font-weight: 850;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.lp-club-brand em {
  margin-top: 4px;
  color: var(--cyan);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.lp-club-status-pill {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 8px;
  background: rgba(7, 12, 16, 0.58);
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.lp-club-status-pill::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 15px rgba(131, 228, 236, 0.62);
}
.lp-club-shell {
  display: grid;
  gap: 18px;
  width: min(1260px, 100%);
  margin: 0 auto;
  padding: 18px clamp(16px, 3.2vw, 46px) calc(32px + env(safe-area-inset-bottom, 0px));
}
.lp-club-panel,
.lp-club-hero {
  position: relative;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(255,255,255,.045), transparent 28%), var(--panel);
  box-shadow: 0 30px 90px rgba(0,0,0,.48);
}
.lp-club-panel::before,
.lp-club-hero::before {
  content: "";
  position: absolute;
  top: -1px;
  left: -1px;
  width: 42px;
  height: 42px;
  border-top: 1px solid var(--cyan);
  border-left: 1px solid var(--cyan);
  border-top-left-radius: 8px;
  pointer-events: none;
}
.lp-club-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 440px);
  gap: 24px;
  min-height: 292px;
  padding: 26px;
  overflow: hidden;
}
.lp-club-label,
.lp-club-micro-label {
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: .13em;
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
.lp-club-hero h1 {
  margin: 32px 0 0;
  max-width: 660px;
  color: var(--text);
  font-size: clamp(44px, 5.2vw, 76px);
  line-height: .92;
  font-weight: 760;
}
.lp-club-hero p,
.lp-club-state p {
  max-width: 620px;
  margin: 18px 0 0;
  color: #c2d0d1;
  font-size: 16px;
  line-height: 1.62;
}
.lp-club-search-card {
  align-self: end;
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 8px;
  background: rgba(2, 8, 11, 0.52);
}
.lp-club-search-box {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 0 10px 0 14px;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 7px;
  background: rgba(0, 6, 9, 0.7);
}
.lp-club-search-box:focus-within {
  border-color: rgba(131, 228, 236, 0.58);
  box-shadow: 0 0 0 3px rgba(131, 228, 236, 0.08);
}
.lp-club-search-box svg {
  color: var(--cyan);
}
.lp-club-search-box input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--text);
  background: transparent;
  font-size: 15px;
}
.lp-club-search-box input::placeholder {
  color: rgba(194, 208, 209, 0.42);
}
.lp-club-clear,
.lp-club-chip,
.lp-club-map-toggle,
.lp-club-card-action {
  cursor: pointer;
}
.lp-club-clear {
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  background: rgba(196, 224, 225, 0.04);
  color: var(--muted);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.lp-club-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.lp-club-chip {
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.04);
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.lp-club-chip.is-active {
  border-color: rgba(131, 228, 236, 0.58);
  background: rgba(131, 228, 236, 0.1);
  color: var(--cyan);
}
.lp-club-state {
  display: grid;
  gap: 14px;
  padding: 20px;
}
.lp-club-state h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.08;
  font-weight: 740;
}
.lp-club-map {
  overflow: hidden;
}
.lp-club-map-head,
.lp-club-results-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}
.lp-club-map-head {
  align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.1);
}
.lp-club-map-head h2,
.lp-club-results-head h2 {
  margin: 0;
  color: var(--text);
  font-size: 24px;
  line-height: 1.08;
  font-weight: 740;
}
.lp-club-map-head p,
.lp-club-results-head p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.lp-club-map-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 13px;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 7px;
  background: rgba(196, 224, 225, 0.04);
  color: var(--cyan);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: .12em;
  text-transform: uppercase;
  white-space: nowrap;
}
.lp-club-map.is-expanded .lp-club-map-toggle svg {
  transform: rotate(180deg);
}
.lp-club-map-canvas {
  position: relative;
  height: 116px;
  overflow: hidden;
  background:
    linear-gradient(90deg, transparent 0 18%, rgba(131,228,236,.08) 18% 18.5%, transparent 18.5% 100%),
    linear-gradient(180deg, transparent 0 54%, rgba(131,228,236,.07) 54% 54.5%, transparent 54.5% 100%),
    radial-gradient(circle at 78% 30%, rgba(131,228,236,.13), transparent 28%),
    rgba(3, 9, 12, .78);
  transition: height 220ms ease;
}
.lp-club-map-canvas::before {
  content: "";
  position: absolute;
  inset: 18px;
  opacity: .8;
  background:
    linear-gradient(135deg, transparent 0 36%, rgba(196,224,225,.14) 36% 36.4%, transparent 36.4%),
    linear-gradient(45deg, transparent 0 58%, rgba(196,224,225,.1) 58% 58.5%, transparent 58.5%),
    linear-gradient(90deg, rgba(196,224,225,.09) 1px, transparent 1px),
    linear-gradient(rgba(196,224,225,.08) 1px, transparent 1px);
  background-size: auto, auto, 82px 82px, 82px 82px;
}
.lp-club-map.is-expanded .lp-club-map-canvas {
  height: 320px;
}
.lp-club-marker {
  position: absolute;
  left: var(--x);
  top: var(--y);
  z-index: 2;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(131, 228, 236, 0.64);
  border-radius: 50%;
  background: rgba(4, 12, 15, .92);
  color: var(--cyan);
  box-shadow: 0 0 24px rgba(131, 228, 236, .18);
  transform: translate(-50%, -50%);
}
.lp-club-marker.is-selected {
  border-color: var(--amber);
  color: var(--amber);
}
.lp-club-map-meta {
  position: absolute;
  right: 18px;
  bottom: 16px;
  z-index: 3;
  display: flex;
  gap: 8px;
}
.lp-club-map-meta span {
  padding: 8px 10px;
  border: 1px solid rgba(196, 224, 225, 0.12);
  border-radius: 7px;
  background: rgba(0, 6, 9, 0.58);
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.lp-club-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 286px;
  gap: 18px;
  align-items: start;
}
.lp-club-results,
.lp-club-side {
  padding: 18px;
}
.lp-club-results-head {
  margin-bottom: 16px;
}
.lp-club-count {
  color: var(--cyan);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: .12em;
  text-transform: uppercase;
  white-space: nowrap;
}
.lp-club-list {
  display: grid;
  gap: 12px;
}
.lp-club-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  padding: 15px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  background: rgba(2, 8, 11, .52);
  transition: border-color 180ms ease, background 180ms ease, transform 180ms ease;
}
.lp-club-card.is-selected,
.lp-club-card:hover {
  border-color: rgba(131, 228, 236, 0.58);
  background: linear-gradient(90deg, rgba(131,228,236,.1), transparent), rgba(8, 18, 22, .82);
  transform: translateY(-1px);
}
.lp-club-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.lp-club-card-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border: 1px solid rgba(131, 228, 236, 0.26);
  border-radius: 7px;
  color: var(--cyan);
  background: rgba(196, 224, 225, 0.045);
}
.lp-club-title strong,
.lp-club-title span span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lp-club-title strong {
  color: var(--text);
  font-size: 17px;
  line-height: 1.15;
}
.lp-club-title span span {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
}
.lp-club-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 13px;
}
.lp-club-tags span {
  padding: 7px 9px;
  border: 1px solid rgba(196, 224, 225, 0.12);
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.035);
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.lp-club-tags .is-live {
  border-color: rgba(131, 228, 236, .36);
  color: var(--cyan);
}
.lp-club-tags .is-current {
  border-color: rgba(208, 170, 108, .42);
  color: var(--amber);
}
.lp-club-card-side {
  display: grid;
  justify-items: end;
  align-content: space-between;
  gap: 12px;
}
.lp-club-distance {
  color: var(--quiet);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.lp-club-card-action {
  min-height: 42px;
  padding: 0 15px;
  border-radius: 7px;
  background: linear-gradient(90deg, rgba(131, 228, 236, .96), rgba(84, 191, 198, .82));
  color: #041012;
  font-size: 10px;
  font-weight: 880;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.lp-club-card-action:disabled {
  cursor: wait;
  opacity: .65;
}
.lp-club-empty {
  padding: 18px;
  border: 1px dashed rgba(196, 224, 225, 0.18);
  border-radius: 7px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
  background: rgba(196, 224, 225, 0.035);
}
.lp-club-side {
  display: grid;
  gap: 14px;
}
.lp-club-side-block {
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}
.lp-club-side-block:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.lp-club-side-block strong {
  display: block;
  margin-top: 7px;
  color: var(--text);
  font-size: 20px;
  line-height: 1.05;
}
.lp-club-side-note {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}
.lp-club-progress {
  height: 9px;
  margin-top: 12px;
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
}
.lp-club-small-list {
  display: grid;
  gap: 9px;
  margin-top: 12px;
}
.lp-club-small-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted);
  font-size: 12px;
}
.lp-club-small-row span:last-child {
  color: var(--cyan);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.lp-club-actions {
  display: grid;
  gap: 10px;
}
.lp-club-primary,
.lp-club-secondary {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 7px;
  padding: 0 15px;
  font-size: 11px;
  font-weight: 880;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.lp-club-primary {
  background: linear-gradient(90deg, rgba(131, 228, 236, .96), rgba(84, 191, 198, .82));
  color: #041012;
}
.lp-club-secondary {
  border: 1px solid rgba(196, 224, 225, .16);
  color: var(--cyan);
}
.lp-club-toast {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  z-index: 30;
  max-width: 430px;
  margin: 0 auto;
  padding: 13px 14px;
  border: 1px solid rgba(131, 228, 236, .28);
  border-radius: 7px;
  background: rgba(7, 13, 16, .94);
  color: #d7e5e6;
  box-shadow: 0 30px 90px rgba(0,0,0,.48);
  font-size: 13px;
  line-height: 1.45;
  opacity: 0;
  transform: translateY(12px);
  pointer-events: none;
  transition: opacity 180ms ease, transform 180ms ease;
  backdrop-filter: blur(18px);
}
.lp-club-toast.is-visible {
  opacity: 1;
  transform: translateY(0);
}
@media (max-width: 940px) {
  .lp-club-hero,
  .lp-club-content-grid {
    grid-template-columns: 1fr;
  }
  .lp-club-hero {
    min-height: 0;
  }
  .lp-club-search-card {
    align-self: stretch;
  }
}
@media (max-width: 560px) {
  .lp-club-topbar {
    grid-template-columns: 40px minmax(0, 1fr);
    min-height: calc(66px + env(safe-area-inset-top, 0px));
    padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 10px;
  }
  .lp-club-status-pill {
    display: none;
  }
  .lp-club-shell {
    padding: 10px 12px calc(24px + env(safe-area-inset-bottom, 0px));
  }
  .lp-club-hero,
  .lp-club-results,
  .lp-club-side {
    padding: 16px;
  }
  .lp-club-hero h1 {
    margin-top: 18px;
    font-size: 38px;
  }
  .lp-club-hero p {
    font-size: 14px;
    line-height: 1.52;
  }
  .lp-club-search-card {
    padding: 14px;
  }
  .lp-club-search-box {
    grid-template-columns: 28px minmax(0, 1fr) auto;
    min-height: 52px;
  }
  .lp-club-map-head,
  .lp-club-results-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .lp-club-map.is-expanded .lp-club-map-canvas {
    height: 260px;
  }
  .lp-club-map-meta {
    left: 12px;
    right: 12px;
    justify-content: space-between;
  }
  .lp-club-card {
    grid-template-columns: 1fr;
  }
  .lp-club-card-side {
    grid-template-columns: 1fr auto;
    justify-items: start;
    align-items: center;
  }
  .lp-club-card-action {
    justify-self: end;
  }
}
@media (max-width: 360px) {
  .lp-club-hero h1 {
    font-size: 34px;
  }
  .lp-club-chips {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }
  .lp-club-chips::-webkit-scrollbar {
    display: none;
  }
}
      `}</style>
  );
}
