"use client";

/*
 * TEMPORARY design mockups for the monthly race block (3 variants).
 * Switched with ?race=a|b|c on /play/game; without the param the current
 * gold card stays. Not for merge.
 *
 *   A «Срез таблицы»  — a CS-style scoreboard slice in the profile: the row
 *                        above you, you, the row below, and the entry line.
 *   B «Трасса»        — its own feed section: players plotted on one track
 *                        from 0 to the leader, finish flag = month results.
 *   C «Одна строка»   — the race shrinks to one line in the profile header.
 */

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import {
  formatLeaderboardNumber,
  leaderboardInitial,
  leaderboardRequestPath,
  leaderboardUnitWord,
  pluralRu,
  type GuestLeaderboard,
  type GuestLeaderboardEntry,
} from "@/lib/guest-leaderboard";

export type RaceVariant = "current" | "a" | "b" | "c";

export function useRaceVariant(): RaceVariant {
  const [variant, setVariant] = useState<RaceVariant>("current");
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("race");
    if (value === "a" || value === "b" || value === "c") setVariant(value);
  }, []);
  return variant;
}

function useRace() {
  const [data, setData] = useState<GuestLeaderboard | null>(null);
  useEffect(() => {
    let active = true;
    fetch(leaderboardRequestPath({}), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((next: GuestLeaderboard | null) => {
        if (active) setData(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  if (!data?.enabled || !data.me || data.me.excluded) return null;
  return data;
}

const MONTH_GENITIVE: Record<string, string> = {
  январь: "января", февраль: "февраля", март: "марта", апрель: "апреля",
  май: "мая", июнь: "июня", июль: "июля", август: "августа",
  сентябрь: "сентября", октябрь: "октября", ноябрь: "ноября", декабрь: "декабря",
};

function month(data: GuestLeaderboard) {
  const label = data.period?.label.toLocaleLowerCase("ru") ?? "";
  return MONTH_GENITIVE[label] ?? "месяца";
}

function points(data: GuestLeaderboard, value: number) {
  return `${formatLeaderboardNumber(data.board, value)} ${leaderboardUnitWord(data.board, value)}`.trim();
}

function daysLeft(data: GuestLeaderboard) {
  const left = data.period?.daysLeft ?? 0;
  return `${left} ${pluralRu(left, ["день", "дня", "дней"])}`;
}

function Chevron() {
  return (
    <svg className="lp-rm-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/* ─────────────────────── A · Срез таблицы ─────────────────────── */

type SliceRow =
  | { kind: "entry"; entry: GuestLeaderboardEntry }
  | { kind: "gap" }
  | { kind: "line"; label: string }
  | { kind: "me"; value: number };

function sliceRows(data: GuestLeaderboard): SliceRow[] {
  const me = data.me!;
  const leader = data.entries[0];
  const rows: SliceRow[] = [];
  if (me.rank) {
    const mine = data.entries.findIndex((entry) => entry.isMe);
    const window = data.entries.slice(Math.max(0, mine - 1), mine + 2);
    if (leader && window[0] !== leader) {
      rows.push({ kind: "entry", entry: leader });
      if (window[0].rank > 2) rows.push({ kind: "gap" });
    }
    window.forEach((entry) => rows.push({ kind: "entry", entry }));
    return rows;
  }
  if (leader) rows.push({ kind: "entry", entry: leader });
  if (data.target) {
    rows.push({ kind: "gap" });
    rows.push({
      kind: "entry",
      entry: {
        rank: data.target.rank,
        name: data.target.name,
        value: me.value + data.target.gap,
        isMe: false,
        movement: null,
        isNew: false,
        crown: false,
        gapBefore: true,
        storeName: null,
      },
    });
  }
  rows.push({ kind: "line", label: "граница таблицы" });
  rows.push({ kind: "me", value: me.value });
  return rows;
}

export function RaceScoreSlice() {
  const data = useRace();
  if (!data) return null;
  const me = data.me!;
  const rows = sliceRows(data);
  const summary = me.rank
    ? data.target
      ? `До ${data.target.rank}-го места ${points(data, data.target.gap)}`
      : "Вы ведёте гонку"
    : data.target
      ? `До таблицы ${points(data, data.target.gap)}`
      : "Таблица пуста, первые очки сделают вас лидером";
  return (
    <Link href="/game/rating" className="lp-rm-a" aria-label={`Рейтинг ${month(data)}: ${summary}. Открыть таблицу`}>
      <span className="lp-rm-a-head">
        <span className="lp-club-small-label">Рейтинг {month(data)}</span>
        <span className="lp-rm-a-days">итоги через {daysLeft(data)}</span>
      </span>
      <span className="lp-rm-a-board" role="presentation">
        {rows.map((row, index) => {
          if (row.kind === "gap") return <span key={index} className="lp-rm-a-gap" aria-hidden="true" />;
          if (row.kind === "line")
            return (
              <span key={index} className="lp-rm-a-line">
                <span>{row.label}</span>
              </span>
            );
          if (row.kind === "me")
            return (
              <span key={index} className="lp-rm-a-row is-me is-out">
                <span className="lp-rm-a-rank">—</span>
                <span className="lp-rm-a-name">Вы</span>
                <b>{formatLeaderboardNumber(data.board, row.value)}</b>
              </span>
            );
          const entry = row.entry;
          return (
            <span
              key={index}
              className={["lp-rm-a-row", entry.isMe ? "is-me" : "", entry.rank === 1 ? "is-leader" : ""].join(" ")}
            >
              <span className="lp-rm-a-rank">{entry.rank}</span>
              <span className="lp-rm-a-name">{entry.isMe ? "Вы" : entry.name}</span>
              <b>{formatLeaderboardNumber(data.board, entry.value)}</b>
            </span>
          );
        })}
      </span>
      <span className="lp-rm-a-foot">
        <span>{summary}</span>
        <Chevron />
      </span>
      <style>{css}</style>
    </Link>
  );
}

/* ─────────────────────── B · Трасса ─────────────────────── */

export function RaceTrack() {
  const data = useRace();
  if (!data) return null;
  const me = data.me!;
  const leader = data.entries[0];
  const max = Math.max(leader?.value ?? 0, me.value, 1);
  const at = (value: number) => `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
  const entryLine = !me.rank && data.target ? me.value + data.target.gap : null;
  const named = new Set<number>([1, 2, 3]);
  const others = data.entries.filter((entry) => !named.has(entry.rank) && !entry.isMe);
  const podium = data.entries.filter((entry) => named.has(entry.rank) && !entry.isMe);
  const headline = me.rank
    ? data.target
      ? `Вы ${me.rank}-й из ${data.totalPlayers}. До ${data.target.rank}-го места ${points(data, data.target.gap)}.`
      : `Вы ведёте гонку среди ${data.totalPlayers} игроков.`
    : data.target
      ? `${data.totalPlayers} ${pluralRu(data.totalPlayers, ["игрок", "игрока", "игроков"])} уже в таблице. Вам до неё ${points(data, data.target.gap)}.`
      : "Таблица пуста: первые очки сделают вас лидером.";
  return (
    <section className="lp-club-panel lp-rm-b" aria-label={`Гонка ${month(data)}`}>
      <div className="lp-club-section-head">
        <div>
          <h2>Гонка {month(data)}</h2>
          <p>{headline}</p>
        </div>
        <Link href="/game/rating" className="lp-rm-b-cta">
          {me.rank ? "Открыть таблицу" : "Как попасть в таблицу"}
        </Link>
      </div>

      <div className="lp-rm-b-track" role="img" aria-label={headline}>
        <span className="lp-rm-b-lane" />
        {others.map((entry) => (
          <span key={entry.rank} className="lp-rm-b-tick" style={{ "--x": at(entry.value) } as CSSProperties} />
        ))}
        {entryLine !== null ? (
          <span className="lp-rm-b-entry" style={{ "--x": at(entryLine) } as CSSProperties}>
            <span>вход в таблицу</span>
          </span>
        ) : null}
        {podium.map((entry) => (
          <span
            key={entry.rank}
            className={`lp-rm-b-pin is-p${entry.rank}`}
            style={{ "--x": at(entry.value) } as CSSProperties}
          >
            <span className="lp-rm-b-dot">{leaderboardInitial(entry.name)}</span>
            <span className="lp-rm-b-label">
              {entry.rank}. {entry.name}
              <small>{formatLeaderboardNumber(data.board, entry.value)}</small>
            </span>
          </span>
        ))}
        <span className="lp-rm-b-pin is-me" style={{ "--x": at(me.value) } as CSSProperties}>
          <span className="lp-rm-b-dot">Вы</span>
          <span className="lp-rm-b-label">
            {me.rank ? `${me.rank}-е место` : "старт"}
            <small>{formatLeaderboardNumber(data.board, me.value)}</small>
          </span>
        </span>
      </div>
      <div className="lp-rm-b-foot">
        <span>{data.prizes[0] ? `Первое место получит ${data.prizes[0].label}` : null}</span>
        <span className="lp-rm-b-finish">
          <span className="lp-rm-b-flag" aria-hidden="true" />
          Итоги {data.period?.resultsLabel ?? "в конце месяца"}, через {daysLeft(data)}
        </span>
      </div>
      <style>{css}</style>
    </section>
  );
}

/* ─────────────────────── C · Одна строка ─────────────────────── */

export function RaceHeaderLine() {
  const data = useRace();
  if (!data) return null;
  const me = data.me!;
  const text = me.rank
    ? `${me.rank}-е место за ${data.period?.label.toLocaleLowerCase("ru") ?? "месяц"}`
    : data.target
      ? `${points(data, data.target.gap)} до рейтинга`
      : `Рейтинг ${month(data)} пока пуст`;
  return (
    <Link href="/game/rating" className={["lp-rm-c", me.rank ? "is-ranked" : ""].join(" ")}>
      <svg className="lp-rm-c-badge" width="30" height="34" style={{ width: 32, height: 36, minWidth: 32 }} viewBox="0 0 56 64" aria-hidden="true">
        <path d="M28 3 L52 16.5 L52 46.5 L28 61 L4 46.5 L4 16.5 Z" />
        <text x="28" y="33" textAnchor="middle" dominantBaseline="central">{me.rank ?? "?"}</text>
      </svg>
      <span className="lp-rm-c-text">
        {text}
        <small>{me.rank && data.target ? `ещё ${points(data, data.target.gap)} до ${data.target.rank}-го` : `итоги ${month(data)} через ${daysLeft(data)}`}</small>
      </span>
      <Chevron />
      <style>{css}</style>
    </Link>
  );
}

const css = `
.lp-rm-chevron { flex: 0 0 auto; color: var(--quiet); transition: transform 160ms ease, color 160ms ease; }

/* A · Срез таблицы */
.lp-rm-a {
  display: grid;
  gap: 10px;
  margin-top: 18px;
  color: inherit;
  text-decoration: none;
}
.lp-rm-a-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.lp-rm-a-days { color: var(--quiet); font-size: 11px; }
.lp-rm-a-board {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(0, 6, 9, 0.55);
  font-variant-numeric: tabular-nums;
}
.lp-rm-a-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 10px;
  color: var(--muted);
  font-size: 13px;
}
.lp-rm-a-row + .lp-rm-a-row { border-top: 1px solid rgba(196, 224, 225, 0.07); }
.lp-rm-a-rank { color: var(--quiet); font-size: 12px; font-weight: 800; }
.lp-rm-a-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-rm-a-row b { color: var(--text); font-size: 13px; font-weight: 760; }
.lp-rm-a-row.is-leader .lp-rm-a-rank,
.lp-rm-a-row.is-leader b { color: var(--amber); }
.lp-rm-a-row.is-me {
  color: var(--text);
  background: linear-gradient(90deg, rgba(131, 228, 236, 0.16), rgba(131, 228, 236, 0.04));
  box-shadow: inset 2px 0 0 var(--cyan);
  font-weight: 760;
}
.lp-rm-a-row.is-me .lp-rm-a-rank { color: var(--cyan); }
.lp-rm-a-row.is-out { background: transparent; box-shadow: inset 2px 0 0 rgba(131, 228, 236, 0.4); color: var(--muted); }
.lp-rm-a-gap { height: 10px; background: repeating-linear-gradient(90deg, rgba(196,224,225,0.18) 0 2px, transparent 2px 7px) center / 100% 1px no-repeat; border-top: 1px solid rgba(196, 224, 225, 0.07); }
.lp-rm-a-line {
  position: relative;
  display: flex;
  justify-content: flex-end;
  height: 18px;
  padding: 0 10px;
  border-top: 1px dashed rgba(208, 170, 108, 0.7);
}
.lp-rm-a-line span { color: var(--amber); font-size: 11px; line-height: 16px; }
.lp-rm-a-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  padding: 0 4px 0 12px;
  border: 1px solid rgba(131, 228, 236, 0.2);
  border-radius: 7px;
  color: var(--cyan);
  font-size: 13px;
  font-weight: 700;
  transition: border-color 160ms ease;
}
.lp-rm-a-foot .lp-rm-chevron { color: var(--cyan); }
.lp-rm-a:hover .lp-rm-a-foot { border-color: rgba(131, 228, 236, 0.55); }
.lp-rm-a:hover .lp-rm-chevron { transform: translateX(2px); }
.lp-rm-a:focus-visible { outline: 2px solid var(--cyan); outline-offset: 4px; border-radius: 8px; }

/* B · Трасса */
.lp-rm-b { padding: 18px; }
.lp-rm-b .lp-club-section-head p { max-width: 56ch; color: var(--muted); font-size: 13px; }
.lp-rm-b-cta {
  display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px;
  border: 1px solid rgba(131, 228, 236, 0.32); border-radius: 7px;
  color: var(--cyan); font-size: 13px; font-weight: 760; text-decoration: none; white-space: nowrap;
  transition: border-color 160ms ease, background 160ms ease;
}
.lp-rm-b-cta:hover { border-color: rgba(131, 228, 236, 0.6); background: rgba(131, 228, 236, 0.06); }
.lp-rm-b-cta:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
.lp-rm-b-track {
  position: relative;
  height: 128px;
  margin: 8px 28px 0 28px;
}
.lp-rm-b-lane {
  position: absolute; left: 0; right: 0; top: 64px; height: 6px; border-radius: 999px;
  background: linear-gradient(90deg, rgba(131, 228, 236, 0.12), rgba(208, 170, 108, 0.35));
}
.lp-rm-b-tick {
  position: absolute; left: var(--x); top: 61px; width: 2px; height: 12px; margin-left: -1px;
  border-radius: 2px; background: rgba(196, 224, 225, 0.35);
}
.lp-rm-b-entry {
  position: absolute; left: var(--x); top: 40px; bottom: 34px; width: 0;
  border-left: 1px dashed var(--amber);
}
.lp-rm-b-entry span { position: absolute; top: -18px; left: 6px; color: var(--amber); font-size: 11px; white-space: nowrap; }
.lp-rm-b-pin { position: absolute; left: var(--x); top: 48px; display: grid; justify-items: center; transform: translateX(-50%); }
.lp-rm-b-dot {
  display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%;
  border: 2px solid #050b0e; color: var(--text); background: #1f3b3e; font-size: 13px; font-weight: 900;
}
.lp-rm-b-pin.is-p1 .lp-rm-b-dot { width: 44px; height: 44px; margin-top: -3px; color: #1a1206; background: var(--amber); }
.lp-rm-b-pin.is-me .lp-rm-b-dot { color: #001012; background: var(--cyan); box-shadow: 0 0 0 4px rgba(131, 228, 236, 0.18); font-size: 11px; }
.lp-rm-b-label { display: grid; justify-items: center; margin-top: 6px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.lp-rm-b-label small { color: var(--quiet); font-size: 11px; font-variant-numeric: tabular-nums; }
.lp-rm-b-pin.is-p2 .lp-rm-b-label, .lp-rm-b-pin.is-p3 .lp-rm-b-label { position: absolute; bottom: 44px; margin: 0 0 6px; }
.lp-rm-b-pin.is-me .lp-rm-b-label { color: var(--cyan); font-weight: 760; }
.lp-rm-b-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 20px; padding-top: 12px; border-top: 1px solid rgba(196, 224, 225, 0.08); color: var(--muted); font-size: 13px; }
.lp-rm-b-finish { display: inline-flex; align-items: center; gap: 10px; color: var(--text); font-weight: 700; }
.lp-rm-b-flag {
  width: 18px; height: 14px; flex: 0 0 auto; border-radius: 2px;
  background: conic-gradient(var(--text) 25%, transparent 0 50%, var(--text) 0 75%, transparent 0) 0 0 / 9px 7px, rgba(196, 224, 225, 0.12);
  opacity: 0.9;
}
@media (max-width: 760px) {
  .lp-rm-b .lp-club-section-head { flex-direction: column; align-items: stretch; }
  .lp-rm-b-cta { justify-content: center; }
  .lp-rm-b-track { margin: 22px 22px 0 22px; height: 140px; }
  .lp-rm-b-pin.is-p2 .lp-rm-b-label, .lp-rm-b-pin.is-p3 .lp-rm-b-label { display: none; }
}

/* C · Одна строка */
.lp-rm-c {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  margin: 4px 0 -6px;
  padding: 6px 8px 6px 6px;
  border-radius: 7px;
  color: inherit;
  text-decoration: none;
  background: rgba(196, 224, 225, 0.03);
  transition: background 160ms ease;
}
.lp-rm-c:hover { background: rgba(131, 228, 236, 0.07); }
.lp-rm-c:hover .lp-rm-chevron { color: var(--cyan); transform: translateX(2px); }
.lp-rm-c:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
.lp-rm-c-badge { display: block; width: 30px; height: 34px; }
.lp-rm-c-badge path { fill: rgba(196, 224, 225, 0.05); stroke: var(--quiet); stroke-width: 3; stroke-dasharray: 7 5; }
.lp-rm-c-badge text { fill: var(--muted); font-size: 26px; font-weight: 900; }
.lp-rm-c.is-ranked .lp-rm-c-badge path { fill: rgba(131, 228, 236, 0.14); stroke: var(--cyan); stroke-dasharray: none; }
.lp-rm-c.is-ranked .lp-rm-c-badge text { fill: var(--cyan); }
.lp-rm-c-text { display: grid; gap: 1px; min-width: 0; color: var(--text); font-size: 13px; font-weight: 700; line-height: 1.3; }
.lp-rm-c-text small { color: var(--quiet); font-size: 11px; font-weight: 500; }
@media (prefers-reduced-motion: reduce) {
  .lp-rm-chevron, .lp-rm-a-foot, .lp-rm-b-cta, .lp-rm-c { transition: none; }
}
`;
