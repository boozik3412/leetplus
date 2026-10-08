"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  LEADERBOARD_BOARD_HINTS,
  LEADERBOARD_BOARD_LABELS,
  LEADERBOARD_MAIN_BOARDS,
  formatDaysLeft,
  formatFormula,
  formatLeaderboardGap,
  formatLeaderboardValue,
  formatMovement,
  leaderboardInitial,
  leaderboardRequestPath,
  type GuestLeaderboard,
  type GuestLeaderboardBoard,
  type GuestLeaderboardEntry,
  type GuestLeaderboardScope,
} from "@/lib/guest-leaderboard";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: GuestLeaderboard }
  | { kind: "auth-required" }
  | { kind: "error"; message: string };

const AVATAR_TONES = [
  "#1f3b3e",
  "#2e2f4f",
  "#3f3322",
  "#20344c",
  "#43263c",
  "#2f3b20",
];

class AuthRequiredError extends Error {}

async function fetchLeaderboard(input: {
  scope?: GuestLeaderboardScope | null;
  board?: GuestLeaderboardBoard | null;
}): Promise<GuestLeaderboard> {
  const response = await fetch(leaderboardRequestPath(input), {
    cache: "no-store",
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) {
    let message = "Не удалось загрузить рейтинг.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // keep the fallback
    }
    throw new Error(message);
  }
  return (await response.json()) as GuestLeaderboard;
}

async function saveNickname(displayName: string) {
  const response = await fetch("/api/guest-portal/session/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
    cache: "no-store",
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) {
    let message = "Не удалось сохранить ник.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // keep the fallback
    }
    throw new Error(message);
  }
}

function avatarStyle(entry: { name: string; isMe?: boolean }, index: number) {
  if (entry.isMe) {
    return { background: "#83e4ec", color: "#041214" } satisfies CSSProperties;
  }
  let hash = index;
  for (const char of entry.name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return {
    background: AVATAR_TONES[hash % AVATAR_TONES.length],
    color: "#edf7f8",
  } satisfies CSSProperties;
}

function CrownIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.75)}
      viewBox="0 0 24 18"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M1 4l5.5 5L12 1l5.5 8L23 4l-2.2 13H3.2z" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

function Movement({ entry }: { entry: { movement: number | null; isNew?: boolean } }) {
  const movement = formatMovement(entry);
  if (!movement) return <span className="lp-rating-move" />;
  return (
    <span
      className={`lp-rating-move is-${movement.tone}`}
      aria-label={
        movement.tone === "up"
          ? `поднялся на ${entry.movement} за сутки`
          : movement.tone === "down"
            ? `опустился на ${Math.abs(entry.movement ?? 0)} за сутки`
            : movement.tone === "new"
              ? "новый в рейтинге"
              : "без изменений за сутки"
      }
    >
      {movement.text}
    </span>
  );
}

export function GameRatingClient() {
  const [request, setRequest] = useState<{
    scope: GuestLeaderboardScope | null;
    board: GuestLeaderboardBoard | null;
    nonce: number;
  }>({ scope: null, board: null, nonce: 0 });
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const scope = state.kind === "ready" ? state.data.scope : request.scope;
  const board = state.kind === "ready" ? state.data.board : request.board;

  useEffect(() => {
    let active = true;
    fetchLeaderboard({ scope: request.scope, board: request.board })
      .then((data) => {
        if (active) setState({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState(
          error instanceof AuthRequiredError
            ? { kind: "auth-required" }
            : {
                kind: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Не удалось загрузить рейтинг.",
              },
        );
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [request]);

  function reload(next: {
    scope: GuestLeaderboardScope | null;
    board: GuestLeaderboardBoard | null;
  }) {
    setRefreshing(true);
    setRequest((current) => ({ ...next, nonce: current.nonce + 1 }));
  }

  function select(next: {
    scope?: GuestLeaderboardScope;
    board?: GuestLeaderboardBoard;
  }) {
    reload({ scope: next.scope ?? scope, board: next.board ?? board });
  }

  return (
    <main className="lp-rating-page">
      <div className="lp-rating-shell">
        <header className="lp-rating-topbar">
          <Link href="/game" className="lp-rating-icon-button" aria-label="Назад к игре">
            <BackIcon />
          </Link>
          <div className="lp-rating-title">
            <span className="lp-rating-eyebrow">
              {state.kind === "ready"
                ? (state.data.scopes.find((s) => s.scope === state.data.scope)?.label ??
                  "Рейтинг")
                : "Игровой модуль"}
            </span>
            <h1>Рейтинг</h1>
          </div>
        </header>

        {state.kind === "loading" ? (
          <div className="lp-rating-skeleton" aria-busy="true" aria-label="Загружаем рейтинг">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {state.kind === "auth-required" ? (
          <section className="lp-rating-notice">
            <h2>Войдите в игру</h2>
            <p>Рейтинг виден после входа в игровой профиль.</p>
            <Link href="/game/auth" className="lp-rating-primary">
              Перейти ко входу
            </Link>
          </section>
        ) : null}

        {state.kind === "error" ? (
          <section className="lp-rating-notice">
            <h2>Рейтинг не загрузился</h2>
            <p>{state.message}</p>
            <button
              type="button"
              className="lp-rating-primary"
              onClick={() => reload({ scope, board })}
            >
              Повторить
            </button>
          </section>
        ) : null}

        {state.kind === "ready" && !state.data.enabled ? (
          <section className="lp-rating-notice">
            <h2>Рейтинг скоро появится</h2>
            <p>Клуб ещё не включил рейтинг игроков. Загляните позже.</p>
            <Link href="/game" className="lp-rating-primary">
              Вернуться в игру
            </Link>
          </section>
        ) : null}

        {state.kind === "ready" && state.data.enabled ? (
          <RatingBoard
            data={state.data}
            refreshing={refreshing}
            onSelect={select}
            onNicknameSaved={() => reload({ scope, board })}
          />
        ) : null}
      </div>
      <style>{ratingCss}</style>
    </main>
  );
}

function RatingBoard({
  data,
  refreshing,
  onSelect,
  onNicknameSaved,
}: {
  data: GuestLeaderboard;
  refreshing: boolean;
  onSelect: (next: {
    scope?: GuestLeaderboardScope;
    board?: GuestLeaderboardBoard;
  }) => void;
  onNicknameSaved: () => void;
}) {
  const mainBoards = data.boards.filter((b) => LEADERBOARD_MAIN_BOARDS.includes(b));
  const extraBoards = data.boards.filter((b) => !LEADERBOARD_MAIN_BOARDS.includes(b));
  // The first three rows stand on the podium (ties may share a place), shown
  // as 2-1-3; the rest form the table.
  const podium = data.entries.slice(0, 3).filter((entry) => entry.rank <= 3);
  const rows = data.entries.slice(podium.length);
  const ordered = [podium[1], podium[0], podium[2]].filter(
    (entry): entry is GuestLeaderboardEntry => Boolean(entry),
  );

  return (
    <div className={["lp-rating-board", refreshing ? "is-refreshing" : ""].join(" ")}>
      {data.period ? (
        <section className="lp-rating-season" aria-label="Период рейтинга">
          <div className="lp-rating-season-head">
            <strong>{data.period.label}</strong>
            <span>{formatDaysLeft(data.period.daysLeft)}</span>
          </div>
          <div className="lp-rating-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(data.period.progress * 100)}%` }} />
          </div>
          <p>
            {data.period.resultsLabel} подводим итоги
            {data.prizes.length ? " и выдаём призы" : ""}, потом рейтинг стартует с
            нуля.
          </p>
        </section>
      ) : null}

      {data.scopes.length > 1 ? (
        <div className="lp-rating-segment" role="group" aria-label="Чей рейтинг">
          {data.scopes.map((item) => (
            <button
              key={item.scope}
              type="button"
              aria-pressed={item.scope === data.scope}
              onClick={() => onSelect({ scope: item.scope })}
            >
              {item.scope === "club" ? "Мой клуб" : "Вся сеть"}
            </button>
          ))}
        </div>
      ) : null}

      {mainBoards.length ? (
        <div className="lp-rating-main-tabs" role="group" aria-label="Главные таблицы">
          {mainBoards.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === data.board}
              onClick={() => onSelect({ board: item })}
            >
              <strong>{LEADERBOARD_BOARD_LABELS[item]}</strong>
              <span>{LEADERBOARD_BOARD_HINTS[item]}</span>
            </button>
          ))}
        </div>
      ) : null}

      {extraBoards.length ? (
        <div className="lp-rating-chips" role="group" aria-label="Ещё таблицы">
          <span>Ещё таблицы:</span>
          {extraBoards.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === data.board}
              onClick={() => onSelect({ board: item })}
            >
              {LEADERBOARD_BOARD_LABELS[item]}
            </button>
          ))}
        </div>
      ) : null}

      {data.formula ? (
        <p className="lp-rating-formula">Очки: {formatFormula(data.formula)}</p>
      ) : null}

      {data.me && !data.me.hasNickname && !data.me.excluded ? (
        <NicknameBanner currentName={data.me.name} onSaved={onNicknameSaved} />
      ) : null}

      {data.me?.excluded ? (
        <p className="lp-rating-warning" role="status">
          Вас нет в рейтинге этого месяца. Если это ошибка, напишите администратору
          клуба.
        </p>
      ) : null}

      {data.totalPlayers === 0 ? (
        <section className="lp-rating-notice is-inline">
          <h2>Пока пусто</h2>
          <p>В этом месяце здесь ещё никого нет. Сыграйте — и станьте первым.</p>
        </section>
      ) : (
        <section className="lp-rating-podium" aria-label="Тройка лидеров">
          {ordered.map((entry, index) => (
            <div key={`${entry.rank}-${entry.name}`} className={`lp-rating-step is-rank-${Math.min(entry.rank, 3)}`}>
              {entry.rank === 1 ? (
                <span className="lp-rating-podium-crown">
                  <CrownIcon size={26} />
                </span>
              ) : null}
              <span
                className={["lp-rating-avatar is-large", entry.isMe ? "is-me" : ""].join(" ")}
                style={avatarStyle(entry, index)}
                aria-hidden="true"
              >
                {leaderboardInitial(entry.name)}
              </span>
              <strong className="lp-rating-step-name">
                {entry.name}
                {entry.isMe ? <span className="lp-rating-me-tag">вы</span> : null}
              </strong>
              <span className="lp-rating-step-value">
                {formatLeaderboardValue(data.board, entry.value)}
              </span>
              {entry.storeName ? (
                <span className="lp-rating-step-club">{entry.storeName}</span>
              ) : null}
              <span className="lp-rating-pedestal">{entry.rank}</span>
            </div>
          ))}
        </section>
      )}

      {data.prizes.length ? (
        <section className="lp-rating-prizes" aria-label="Призы месяца">
          <div className="lp-rating-prizes-head">
            <GiftIcon />
            <strong>
              Призы · {data.period?.label.toLocaleLowerCase("ru")} ·{" "}
              {LEADERBOARD_BOARD_LABELS[data.board].toLocaleLowerCase("ru")}
            </strong>
          </div>
          <ul>
            {data.prizes.map((prize) => (
              <li key={prize.place}>
                <span className={`lp-rating-place is-rank-${prize.place}`}>{prize.place}</span>
                <span>{prize.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length ? (
        <section className="lp-rating-list" aria-label="Таблица рейтинга">
          <div className="lp-rating-list-head">
            <span>Игроков в рейтинге: {data.totalPlayers}</span>
            <span>за сутки</span>
          </div>
          <ol>
            {rows.map((entry, index) => (
              <li key={`${entry.rank}-${entry.name}-${index}`} className={entry.gapBefore ? "has-gap" : ""}>
                {entry.gapBefore ? (
                  <span className="lp-rating-gap" aria-hidden="true">
                    ···
                  </span>
                ) : null}
                <div className={["lp-rating-row", entry.isMe ? "is-me" : ""].join(" ")}>
                  <span className="lp-rating-rank">{entry.rank}</span>
                  <span
                    className="lp-rating-avatar"
                    style={avatarStyle(entry, index + 3)}
                    aria-hidden="true"
                  >
                    {leaderboardInitial(entry.name)}
                  </span>
                  <span className="lp-rating-row-name">
                    <span className="lp-rating-row-title">
                      <span className="lp-rating-ellipsis">{entry.name}</span>
                      {entry.crown ? (
                        <span className="lp-rating-crown" title="Победитель прошлого месяца">
                          <CrownIcon size={15} />
                        </span>
                      ) : null}
                      {entry.isMe ? <span className="lp-rating-me-tag">вы</span> : null}
                    </span>
                    {entry.storeName ? (
                      <span className="lp-rating-row-club">{entry.storeName}</span>
                    ) : null}
                  </span>
                  <span className="lp-rating-row-value">
                    {formatLeaderboardValue(data.board, entry.value)}
                  </span>
                  <Movement entry={entry} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {data.me && !data.me.excluded ? <MeDock data={data} /> : null}
    </div>
  );
}

function MeDock({ data }: { data: GuestLeaderboard }) {
  const me = data.me!;
  const target = data.target;
  const progress =
    target && me.value > 0
      ? Math.max(6, Math.min(96, Math.round((me.value / (me.value + target.gap)) * 100)))
      : 6;

  return (
    <aside className="lp-rating-dock" aria-label="Ваше место">
      <div className="lp-rating-dock-head">
        <span className="lp-rating-dock-rank">
          {me.rank ? `#${me.rank}` : "—"}
          <small>{me.rank ? `из ${data.totalPlayers}` : "вне рейтинга"}</small>
        </span>
        <span className="lp-rating-dock-name">
          <strong>{me.name} · вы</strong>
          <span>{formatLeaderboardValue(data.board, me.value)}</span>
        </span>
        <Movement entry={{ movement: me.movement }} />
      </div>
      {target ? (
        <div className="lp-rating-dock-target">
          <p>
            {me.rank ? `До #${target.rank}` : "Чтобы попасть в рейтинг"} —{" "}
            <b>{formatLeaderboardGap(data.board, target.gap, data.formula)}</b>
          </p>
          <div className="lp-rating-bar is-dock" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : me.rank === 1 ? (
        <p className="lp-rating-dock-leader">
          Вы лидер месяца — удержите место до {data.period?.resultsLabel ?? "конца месяца"}
        </p>
      ) : null}
    </aside>
  );
}

function NicknameBanner({
  currentName,
  onSaved,
}: {
  currentName: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nickname = value.trim().replace(/\s+/gu, " ");
    if (!nickname) {
      setError("Введите ник.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await saveNickname(nickname);
      setEditing(false);
      onSaved();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Не удалось сохранить ник.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="lp-rating-nick" aria-label="Ник в рейтинге">
      {editing ? (
        <form onSubmit={submit}>
          <label htmlFor="ratingNickname">Ваш ник в рейтинге</label>
          <div className="lp-rating-nick-row">
            <input
              id="ratingNickname"
              type="text"
              autoComplete="nickname"
              maxLength={32}
              value={value}
              disabled={pending}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            />
            <button type="submit" disabled={pending}>
              {pending ? "Сохраняем" : "Сохранить"}
            </button>
          </div>
          {error ? (
            <p className="lp-rating-nick-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <>
          <p>
            Сейчас вас видят как «{currentName}». Придумайте ник, чтобы выделиться.
          </p>
          <button type="button" onClick={() => setEditing(true)}>
            Задать ник
          </button>
        </>
      )}
    </section>
  );
}

/** «Ваше место» card for the game home; hidden while the rating is off. */
export function GameRatingTeaser() {
  const [data, setData] = useState<GuestLeaderboard | null>(null);

  useEffect(() => {
    let active = true;
    fetchLeaderboard({})
      .then((next) => {
        if (active) setData(next);
      })
      .catch(() => {
        // The home screen stays usable without the rating.
      });
    return () => {
      active = false;
    };
  }, []);

  if (!data?.enabled || !data.me || data.me.excluded) return null;
  const scopeLabel =
    data.scopes.find((item) => item.scope === data.scope)?.label ?? "Рейтинг";

  return (
    <Link href="/game/rating" className="lp-rating-teaser">
      <span className="lp-rating-teaser-label">
        Рейтинг · {LEADERBOARD_BOARD_LABELS[data.board].toLocaleLowerCase("ru")}
      </span>
      <span className="lp-rating-teaser-main">
        <strong>{data.me.rank ? `#${data.me.rank}` : "—"}</strong>
        <span>
          {data.me.rank
            ? `из ${data.totalPlayers} · ${scopeLabel}`
            : "Сыграйте, чтобы попасть в рейтинг"}
        </span>
      </span>
      {data.target ? (
        <span className="lp-rating-teaser-gap">
          {data.me.rank ? `До #${data.target.rank}` : "До рейтинга"} —{" "}
          {formatLeaderboardGap(data.board, data.target.gap, data.formula)}
        </span>
      ) : null}
      <style>{teaserCss}</style>
    </Link>
  );
}

const teaserCss = `
.lp-rating-teaser {
  display: grid;
  gap: 6px;
  margin-top: 14px;
  padding: 14px 16px;
  border: 1px solid rgba(131, 228, 236, 0.42);
  border-radius: 8px;
  color: #edf7f8;
  text-decoration: none;
  background: rgba(131, 228, 236, 0.06);
  transition: border-color 160ms ease, background 160ms ease;
}
.lp-rating-teaser:hover,
.lp-rating-teaser:focus-visible {
  border-color: #83e4ec;
  background: rgba(131, 228, 236, 0.1);
}
.lp-rating-teaser-label {
  color: #a8b9ba;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.lp-rating-teaser-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.lp-rating-teaser-main strong {
  color: #83e4ec;
  font-size: 30px;
  line-height: 1;
  font-weight: 900;
}
.lp-rating-teaser-main span,
.lp-rating-teaser-gap {
  color: #c2d0d1;
  font-size: 13px;
}
`;

const ratingCss = `
.lp-rating-page {
  min-height: 100vh;
  color: #edf7f8;
  background:
    radial-gradient(circle at 80% 0%, rgba(131, 228, 236, 0.08), transparent 32%),
    #000;
  overflow-x: hidden;
}
.lp-rating-page *, .lp-rating-page *::before, .lp-rating-page *::after { box-sizing: border-box; }
.lp-rating-shell {
  width: min(640px, 100%);
  margin: 0 auto;
  padding: 0 16px 196px;
}
.lp-rating-topbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 0 12px;
  background: linear-gradient(180deg, #000 70%, rgba(0, 0, 0, 0));
}
.lp-rating-icon-button {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border: 1px solid rgba(196, 224, 225, 0.2);
  border-radius: 8px;
  color: #edf7f8;
  background: rgba(196, 224, 225, 0.035);
}
.lp-rating-title h1 { margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -0.01em; }
.lp-rating-eyebrow { display: block; color: #a8b9ba; font-size: 12px; }
.lp-rating-board { display: grid; gap: 14px; transition: opacity 160ms ease; }
.lp-rating-board.is-refreshing { opacity: 0.6; }
.lp-rating-season, .lp-rating-notice, .lp-rating-prizes, .lp-rating-nick {
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 8px;
  background: rgba(8, 14, 18, 0.9);
  padding: 14px 16px;
}
.lp-rating-season { display: grid; gap: 10px; }
.lp-rating-season-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.lp-rating-season-head strong { font-size: 16px; }
.lp-rating-season-head span { color: #d0aa6c; font-size: 13px; font-weight: 700; }
.lp-rating-season p { margin: 0; color: #a8b9ba; font-size: 12px; line-height: 1.5; }
.lp-rating-bar { height: 6px; border-radius: 99px; background: rgba(196, 224, 225, 0.12); overflow: hidden; }
.lp-rating-bar span { display: block; height: 100%; border-radius: inherit; background: #d0aa6c; }
.lp-rating-bar.is-dock span { background: #83e4ec; }
.lp-rating-segment {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 10px;
  background: rgba(8, 14, 18, 0.9);
}
.lp-rating-segment button {
  min-height: 44px;
  border: 0;
  border-radius: 7px;
  color: #a8b9ba;
  background: transparent;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.lp-rating-segment button[aria-pressed="true"] { color: #041214; background: #edf7f8; }
.lp-rating-main-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.lp-rating-main-tabs button {
  display: grid;
  gap: 2px;
  min-height: 64px;
  padding: 12px 14px;
  border: 1.5px solid rgba(196, 224, 225, 0.18);
  border-radius: 8px;
  color: #c2d0d1;
  background: rgba(8, 14, 18, 0.9);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.lp-rating-main-tabs button strong { font-size: 15px; }
.lp-rating-main-tabs button span { font-size: 12px; opacity: 0.75; }
.lp-rating-main-tabs button[aria-pressed="true"] {
  border-color: #83e4ec;
  color: #edf7f8;
  background: rgba(131, 228, 236, 0.1);
}
.lp-rating-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.lp-rating-chips > span { color: #a8b9ba; font-size: 12px; }
.lp-rating-chips button {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(196, 224, 225, 0.24);
  border-radius: 99px;
  color: #c2d0d1;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.lp-rating-chips button[aria-pressed="true"] { border-color: #83e4ec; color: #041214; background: #83e4ec; }
.lp-rating-formula { margin: -4px 0 0; color: #a8b9ba; font-size: 12px; line-height: 1.5; }
.lp-rating-warning {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid rgba(242, 167, 167, 0.4);
  border-radius: 8px;
  color: #f6d3d3;
  background: rgba(242, 167, 167, 0.08);
  font-size: 13px;
}
.lp-rating-nick { display: grid; gap: 10px; border-color: rgba(208, 170, 108, 0.45); background: rgba(208, 170, 108, 0.07); }
.lp-rating-nick p { margin: 0; color: #f1dfbf; font-size: 13px; line-height: 1.45; }
.lp-rating-nick > button, .lp-rating-nick-row button {
  justify-self: start;
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  color: #1a1206;
  background: #d0aa6c;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.lp-rating-nick label { color: #f1dfbf; font-size: 13px; font-weight: 700; }
.lp-rating-nick-row { display: flex; gap: 8px; margin-top: 6px; }
.lp-rating-nick-row input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid rgba(208, 170, 108, 0.5);
  border-radius: 8px;
  color: #edf7f8;
  background: #000;
  font: inherit;
}
.lp-rating-nick-error { color: #f6d3d3 !important; }
.lp-rating-podium {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: 8px;
  padding-top: 18px;
}
.lp-rating-step { display: grid; justify-items: center; gap: 6px; min-width: 0; text-align: center; }
.lp-rating-podium-crown { color: #d0aa6c; }
.lp-rating-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 50%;
  font-weight: 900;
  font-size: 14px;
}
.lp-rating-avatar.is-large { width: 60px; height: 60px; font-size: 24px; }
.is-rank-1 .lp-rating-avatar.is-large { width: 72px; height: 72px; box-shadow: 0 0 0 3px #d0aa6c; }
.is-rank-2 .lp-rating-avatar.is-large { box-shadow: 0 0 0 3px #c9d3d4; }
.is-rank-3 .lp-rating-avatar.is-large { box-shadow: 0 0 0 3px #c98e6a; }
.lp-rating-step-name {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  overflow: hidden;
  font-size: 14px;
  white-space: nowrap;
}
.lp-rating-step-value { color: #c2d0d1; font-size: 13px; }
.lp-rating-step-club { color: #a8b9ba; font-size: 11px; }
.lp-rating-pedestal {
  display: grid;
  place-items: center;
  width: 100%;
  border-radius: 8px 8px 3px 3px;
  font-size: 26px;
  font-weight: 900;
}
.is-rank-1 .lp-rating-pedestal { height: 112px; color: #d0aa6c; background: rgba(208, 170, 108, 0.14); border-top: 3px solid #d0aa6c; }
.is-rank-2 .lp-rating-pedestal { height: 84px; color: #c9d3d4; background: rgba(201, 211, 212, 0.09); border-top: 3px solid #c9d3d4; }
.is-rank-3 .lp-rating-pedestal { height: 64px; color: #c98e6a; background: rgba(201, 142, 106, 0.12); border-top: 3px solid #c98e6a; }
.lp-rating-prizes { display: grid; gap: 10px; border-color: rgba(208, 170, 108, 0.35); background: rgba(208, 170, 108, 0.05); }
.lp-rating-prizes-head { display: flex; align-items: center; gap: 8px; color: #d0aa6c; }
.lp-rating-prizes-head strong { color: #edf7f8; font-size: 14px; }
.lp-rating-prizes ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.lp-rating-prizes li { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.lp-rating-place {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  color: #120d05;
  font-weight: 900;
  font-size: 13px;
}
.lp-rating-place.is-rank-1 { background: #d0aa6c; }
.lp-rating-place.is-rank-2 { background: #c9d3d4; }
.lp-rating-place.is-rank-3 { background: #c98e6a; }
.lp-rating-list { display: grid; gap: 6px; }
.lp-rating-list-head { display: flex; justify-content: space-between; padding: 0 4px; color: #a8b9ba; font-size: 12px; }
.lp-rating-list ol { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.lp-rating-gap { display: block; color: #71878a; text-align: center; letter-spacing: 4px; line-height: 18px; }
.lp-rating-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 6px 10px;
  border: 1px solid rgba(196, 224, 225, 0.12);
  border-radius: 8px;
  background: rgba(8, 14, 18, 0.9);
}
.lp-rating-row.is-me { border-color: #83e4ec; background: rgba(131, 228, 236, 0.09); }
.lp-rating-rank { width: 28px; text-align: right; color: #c2d0d1; font-weight: 900; font-size: 13px; }
.lp-rating-row-name { display: grid; flex: 1 1 auto; min-width: 0; }
.lp-rating-row-title { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 14px; font-weight: 700; }
.lp-rating-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-rating-row-club { color: #a8b9ba; font-size: 12px; }
.lp-rating-row-value { font-size: 14px; font-weight: 800; white-space: nowrap; }
.lp-rating-crown { display: inline-flex; color: #d0aa6c; }
.lp-rating-me-tag {
  padding: 2px 6px;
  border-radius: 6px;
  color: #041214;
  background: #83e4ec;
  font-size: 11px;
  font-weight: 900;
}
.lp-rating-move { width: 40px; flex: 0 0 auto; color: #71878a; text-align: right; font-size: 12px; font-weight: 800; }
.lp-rating-move.is-up { color: #94d6b8; }
.lp-rating-move.is-down { color: #f2a7a7; }
.lp-rating-move.is-new { color: #83e4ec; font-size: 11px; }
.lp-rating-dock {
  position: fixed;
  left: 50%;
  bottom: max(12px, env(safe-area-inset-bottom, 0px));
  z-index: 10;
  display: grid;
  gap: 10px;
  width: min(616px, calc(100% - 24px));
  padding: 14px 16px;
  border: 1px solid #83e4ec;
  border-radius: 12px;
  background: rgba(4, 16, 18, 0.96);
  backdrop-filter: blur(12px);
  transform: translateX(-50%);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
}
.lp-rating-dock-head { display: flex; align-items: center; gap: 12px; }
.lp-rating-dock-rank { display: flex; align-items: baseline; gap: 4px; color: #83e4ec; font-size: 26px; font-weight: 900; }
.lp-rating-dock-rank small { color: #a8b9ba; font-size: 12px; font-weight: 600; }
.lp-rating-dock-name { display: grid; flex: 1 1 auto; min-width: 0; }
.lp-rating-dock-name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.lp-rating-dock-name span { color: #c2d0d1; font-size: 13px; }
.lp-rating-dock-target { display: grid; gap: 6px; }
.lp-rating-dock-target p, .lp-rating-dock-leader { margin: 0; font-size: 13px; }
.lp-rating-dock-target b { color: #83e4ec; }
.lp-rating-dock-leader { color: #d0aa6c; font-weight: 700; }
.lp-rating-notice { display: grid; gap: 10px; margin-top: 12px; }
.lp-rating-notice.is-inline { margin-top: 0; }
.lp-rating-notice h2 { margin: 0; font-size: 18px; }
.lp-rating-notice p { margin: 0; color: #c2d0d1; font-size: 14px; line-height: 1.5; }
.lp-rating-primary {
  justify-self: start;
  display: inline-grid;
  place-items: center;
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 8px;
  color: #041214;
  background: #83e4ec;
  font: inherit;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
}
.lp-rating-skeleton { display: grid; gap: 12px; margin-top: 12px; }
.lp-rating-skeleton span {
  height: 72px;
  border-radius: 8px;
  background: linear-gradient(90deg, rgba(196,224,225,0.05), rgba(196,224,225,0.12), rgba(196,224,225,0.05));
  background-size: 200% 100%;
  animation: lp-rating-shimmer 1.4s ease-in-out infinite;
}
.lp-rating-skeleton span:nth-child(2) { height: 220px; }
@keyframes lp-rating-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) {
  .lp-rating-skeleton span { animation: none; }
  .lp-rating-board { transition: none; }
}
.lp-rating-segment button:focus-visible,
.lp-rating-main-tabs button:focus-visible,
.lp-rating-chips button:focus-visible,
.lp-rating-icon-button:focus-visible,
.lp-rating-primary:focus-visible,
.lp-rating-nick button:focus-visible {
  outline: 2px solid #83e4ec;
  outline-offset: 2px;
}
`;
