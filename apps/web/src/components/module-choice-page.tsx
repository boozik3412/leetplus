"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { LegalEntityInfo } from "@/components/legal-entity-info";
import type { GuestHomepageContext } from "@/lib/guest-homepage";
import { lootboxSkinForRarity } from "@/lib/lootbox-assets";

type ModuleChoicePageProps = {
  analyticsHref: string;
  gameContext: GuestHomepageContext | null;
};

const seasonSteps = [
  { label: "05", state: "complete" },
  { label: "06", state: "complete" },
  { label: "07", state: "active" },
  { label: "08", state: "locked" },
  { label: "09", state: "locked" },
] as const;

export function ModuleChoicePage({
  analyticsHref,
  gameContext,
}: ModuleChoicePageProps) {
  const [clubMenuOpen, setClubMenuOpen] = useState(false);
  const gameHref = gameContext ? "/game" : "/game/auth";

  return (
    <main className="lp-home">
      <header className="lp-home-header">
        <Link className="lp-home-brand" href="/start" aria-label="LeetPlus">
          <Image
            alt=""
            aria-hidden="true"
            height={42}
            priority
            src="/assets/brand/leetplus-logo-white.svg"
            width={42}
          />
          <span>LeetPlus</span>
        </Link>

        <Link className="lp-home-analytics" href={analyticsHref}>
          Корпоративный вход
          <ArrowIcon />
        </Link>
      </header>

      <section className="lp-home-hero" aria-labelledby="lp-home-title">
        <div className="lp-home-intro">
          <div className="lp-home-eyebrow">
            <span aria-hidden="true" />
            Сезон 07 · активен
          </div>
          <h1 id="lp-home-title">
            Ваш клуб.
            <br />
            Ваш сезон.
            <br />
            Ваши награды.
          </h1>
          <p>
            Играйте, выполняйте задания, поднимайте уровень клуба и открывайте
            награды вместе с командой.
          </p>

          <div className="lp-home-intro-actions">
            <Link className="lp-home-primary" href={gameHref}>
              {gameContext ? "Продолжить игру" : "Начать игру"}
              <ArrowIcon />
            </Link>
            <div className="lp-home-select-club-wrap">
              <button
                aria-expanded={clubMenuOpen}
                aria-haspopup="dialog"
                className="lp-home-select-club"
                onClick={() => setClubMenuOpen((open) => !open)}
                type="button"
              >
                <span className="lp-home-live-dot" aria-hidden="true" />
                <span>
                  <small>Текущий клуб</small>
                  {gameContext?.clubName ?? "Выбрать после входа"}
                </span>
                <ChevronIcon />
              </button>

              {clubMenuOpen ? (
                <div
                  aria-label="Выбор клуба"
                  className="lp-home-club-popover is-open"
                  role="dialog"
                >
                  <span className="lp-home-popover-kicker">Игровой профиль</span>
                  <strong>
                    {gameContext?.clubName ?? "Клуб выбирается после входа"}
                  </strong>
                  <p>
                    {gameContext
                      ? "Последний клуб сохранен в игровой сессии. Можно продолжить игру или выбрать другой клуб в модуле."
                      : "Авторизуйтесь удобным способом, затем откройте клуб, в котором проходит текущая игровая сессия."}
                  </p>
                  <Link href={gameHref} onClick={() => setClubMenuOpen(false)}>
                    {gameContext ? "Продолжить игру" : "Перейти к входу"}
                    <ArrowIcon />
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="lp-home-game-surface">
          <div className="lp-home-club-summary">
            <div className="lp-home-club-emblem" aria-hidden="true">
              <Image
                alt=""
                height={74}
                priority
                src="/assets/brand/leetplus-logo-white.svg"
                width={74}
              />
            </div>
            <div className="lp-home-level">
              <span>Уровень клуба</span>
              <strong>07</strong>
              <div className="lp-home-stat-progress" aria-label="4250 из 7500 XP">
                <span />
              </div>
              <small>
                <b>4 250</b> / 7 500 XP
              </small>
            </div>
            <div className="lp-home-stat">
              <span>Ранг</span>
              <strong>Gold II</strong>
              <div className="lp-home-rank-progress" aria-label="42 процента">
                <span />
              </div>
            </div>
            <div className="lp-home-stat">
              <span>Участники</span>
              <strong>
                <b>24</b> / 50
              </strong>
              <small>В сезоне клуба</small>
            </div>
          </div>

          <div className="lp-home-season-head">
            <span>Прогресс сезона</span>
            <span>
              Сезон завершится через <b>54 дня</b>
            </span>
          </div>

          <div className="lp-home-season-path" aria-label="Прогресс сезона">
            <div className="lp-home-season-line" aria-hidden="true">
              <span />
            </div>
            {seasonSteps.map((step) => (
              <div
                className={`lp-home-season-step is-${step.state}`}
                key={step.label}
              >
                <span>{step.label}</span>
                <small>{step.label}</small>
              </div>
            ))}
          </div>

          <div className="lp-home-quest-reward">
            <div className="lp-home-quest-copy">
              <div className="lp-home-panel-head">
                <span>Текущее задание</span>
                <strong>+120 XP</strong>
              </div>
              <h2>Сыграть 2 часа</h2>
              <p>Проведите в клубе 2 часа в этом сезоне.</p>
              <div className="lp-home-quest-progress-row">
                <strong>1 ч 15 мин</strong>
                <span>/ 2 ч</span>
              </div>
              <div className="lp-home-quest-progress" aria-label="1 час 15 минут из 2 часов">
                <span />
              </div>
              <Link className="lp-home-quest-link" href={gameHref}>
                Перейти к заданиям
                <ArrowIcon />
              </Link>
            </div>

            <div className="lp-home-reward-preview">
              <div>
                <span>Награда за задание</span>
                <strong>Редкий кейс</strong>
              </div>
              <div className="lp-home-reward-art">
                <Image
                  alt="Редкий лутбокс"
                  fetchPriority="high"
                  fill
                  loading="eager"
                  sizes="(max-width: 760px) 250px, 240px"
                  src="/assets/lootboxes/lootbox-rare-clean.png"
                  unoptimized
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {gameContext ? (
        <section className="lp-home-weekly" aria-labelledby="lp-home-weekly-title">
          <div className="lp-home-weekly-head">
            <div>
              <span>Последний клуб · {gameContext.clubName}</span>
              <h2 id="lp-home-weekly-title">Награды этой недели</h2>
            </div>
            <Link href="/game">
              Смотреть все награды
              <ArrowIcon />
            </Link>
          </div>
          <div className="lp-home-reward-grid">
            {gameContext.weeklyRewards.map((reward) => (
              <Link
                className={`lp-home-reward-card is-${reward.rarity}`}
                href="/game"
                key={reward.id}
              >
                <span>{reward.eyebrow}</span>
                <div className="lp-home-card-art" aria-hidden="true">
                  <Image
                    alt=""
                    fill
                    loading="eager"
                    sizes="(max-width: 720px) 230px, 18vw"
                    src={lootboxSkinForRarity(reward.rarity)}
                    unoptimized
                  />
                </div>
                <strong>{reward.title}</strong>
                <small>{reward.value}</small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <LegalEntityInfo className="lp-home-legal" compact />
      <style>{homeCss}</style>
    </main>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="m7 9 5 5 5-5" />
    </svg>
  );
}

const homeCss = `
:root {
  color-scheme: dark;
}

.lp-home {
  --cyan: #74e7ef;
  --cyan-bright: #8cf4fa;
  --cyan-dim: #2d828a;
  --mint: #9ae0c1;
  --violet: #c18cf4;
  --gold: #d0aa6c;
  --text: #edf7f8;
  --muted: #9badb0;
  --line: rgba(159, 211, 216, 0.17);
  min-height: 100vh;
  overflow-x: hidden;
  isolation: isolate;
  background: #000;
  color: var(--text);
  letter-spacing: 0;
}

.lp-home,
.lp-home *,
.lp-home *::before,
.lp-home *::after {
  box-sizing: border-box;
}

.lp-home::before {
  position: fixed;
  inset: 0;
  z-index: -2;
  content: "";
  pointer-events: none;
  background-image:
    linear-gradient(rgba(116, 231, 239, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(116, 231, 239, 0.02) 1px, transparent 1px);
  background-size: 96px 96px;
  mask-image: linear-gradient(180deg, #000, rgba(0, 0, 0, 0.62) 74%, transparent);
}

.lp-home::after {
  position: fixed;
  inset: 0;
  z-index: -1;
  content: "";
  pointer-events: none;
  background:
    radial-gradient(circle at 74% 36%, rgba(91, 209, 218, 0.075), transparent 28%),
    radial-gradient(circle at 92% 62%, rgba(193, 140, 244, 0.05), transparent 22%);
}

.lp-home a {
  color: inherit;
  text-decoration: none;
}

.lp-home button {
  border: 0;
  color: inherit;
  font: inherit;
}

.lp-home svg {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lp-home-header {
  position: relative;
  z-index: 20;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 28px;
  width: min(100%, 1600px);
  min-height: 84px;
  margin: 0 auto;
  padding: 16px clamp(24px, 4vw, 64px);
  border-bottom: 1px solid rgba(159, 211, 216, 0.13);
}

.lp-home-brand {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 12px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.17em;
  text-transform: uppercase;
}

.lp-home-brand img {
  width: 42px;
  height: 42px;
}

.lp-home-select-club:hover,
.lp-home-select-club:focus-visible {
  outline: none;
  border-color: rgba(116, 231, 239, 0.5) !important;
  background: rgba(116, 231, 239, 0.06);
}

.lp-home-select-club svg {
  width: 16px;
  height: 16px;
}

.lp-home-live-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--mint);
  box-shadow: 0 0 16px rgba(154, 224, 193, 0.58);
}

.lp-home-club-popover {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  width: min(340px, calc(100vw - 32px));
  padding: 18px;
  border: 1px solid rgba(116, 231, 239, 0.28);
  border-radius: 7px;
  background: rgba(4, 10, 13, 0.97);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.68);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-8px);
  transition: opacity 170ms ease, transform 170ms ease;
  backdrop-filter: blur(18px);
}

.lp-home-club-popover.is-open {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.lp-home-popover-kicker {
  display: block;
  margin-bottom: 8px;
  color: var(--cyan);
  font-size: 10px;
  font-weight: 780;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.lp-home-club-popover strong {
  display: block;
  font-size: 17px;
}

.lp-home-club-popover p {
  margin: 10px 0 16px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}

.lp-home-club-popover a {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--cyan);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.lp-home-analytics {
  display: inline-flex;
  align-items: center;
  justify-self: end;
  gap: 9px;
  color: #829396 !important;
  font-size: 12px;
  font-weight: 650;
  transition: color 180ms ease;
}

.lp-home-analytics:hover,
.lp-home-analytics:focus-visible {
  outline: none;
  color: var(--text) !important;
}

.lp-home-analytics svg {
  width: 18px;
  height: 18px;
}

.lp-home-hero {
  display: grid;
  grid-template-columns: minmax(420px, 470px) minmax(0, 1fr);
  gap: 34px;
  width: min(100%, 1600px);
  min-height: 630px;
  margin: 0 auto;
  padding: clamp(54px, 6vh, 74px) clamp(24px, 4vw, 64px) 44px;
}

.lp-home-intro {
  align-self: start;
  padding-top: 4px;
}

.lp-home-eyebrow {
  display: flex;
  align-items: center;
  gap: 13px;
  color: var(--cyan);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.19em;
  text-transform: uppercase;
}

.lp-home-eyebrow > span {
  width: 38px;
  height: 1px;
  background: var(--cyan);
}

.lp-home-intro h1 {
  margin: 25px 0 0;
  max-width: 500px;
  color: var(--text);
  font-size: clamp(52px, 3.95vw, 59px);
  line-height: 1.12;
  font-weight: 670;
  letter-spacing: 0;
}

.lp-home-intro > p {
  max-width: 470px;
  margin: 25px 0 0;
  color: #a7b7b9;
  font-size: clamp(15px, 1.3vw, 18px);
  line-height: 1.65;
}

.lp-home-intro-actions {
  display: grid;
  gap: 13px;
  width: min(100%, 430px);
  margin-top: 34px;
}

.lp-home-select-club-wrap {
  position: relative;
}

.lp-home-primary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: 0 25px;
  border-radius: 6px;
  background: linear-gradient(90deg, #70e1e9, #9ae0c1);
  box-shadow: 0 16px 44px rgba(77, 205, 212, 0.15);
  color: #051113 !important;
  font-size: 13px;
  font-weight: 880;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  transition: box-shadow 180ms ease, transform 180ms ease;
}

.lp-home-primary:hover,
.lp-home-primary:focus-visible {
  outline: none;
  box-shadow: 0 18px 58px rgba(77, 205, 212, 0.28);
  transform: translateY(-2px);
}

.lp-home-select-club {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  min-height: 58px;
  padding: 8px 15px;
  border: 1px solid rgba(159, 211, 216, 0.17) !important;
  border-radius: 6px;
  background: rgba(7, 13, 16, 0.68);
  color: #cbd7d8 !important;
  cursor: pointer;
  text-align: left;
  transition: border-color 180ms ease, background 180ms ease;
  width: 100%;
}

.lp-home-select-club > span:nth-child(2) {
  display: grid;
  gap: 4px;
  font-size: 12px;
  font-weight: 680;
}

.lp-home-select-club small {
  color: #71878a;
  font-size: 9px;
  font-weight: 760;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.lp-home-game-surface {
  min-width: 0;
  align-self: start;
}

.lp-home-club-summary {
  display: grid;
  grid-template-columns: 104px minmax(210px, 1.45fr) minmax(140px, 0.8fr) minmax(130px, 0.72fr);
  align-items: center;
  min-height: 136px;
  border-bottom: 1px solid var(--line);
}

.lp-home-club-summary > * + * {
  border-left: 1px solid rgba(159, 211, 216, 0.11);
}

.lp-home-club-emblem {
  display: grid;
  place-items: center;
  min-height: 86px;
}

.lp-home-club-emblem img {
  filter: drop-shadow(0 0 20px rgba(116, 231, 239, 0.15));
}

.lp-home-level,
.lp-home-stat {
  min-height: 86px;
  padding: 4px 24px;
}

.lp-home-level > span,
.lp-home-stat > span,
.lp-home-season-head,
.lp-home-panel-head > span,
.lp-home-reward-preview > div > span {
  color: #76898c;
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.lp-home-level > strong {
  display: block;
  margin-top: 4px;
  font-size: 48px;
  line-height: 1;
  font-weight: 640;
}

.lp-home-level small,
.lp-home-stat small {
  display: block;
  margin-top: 8px;
  color: #76898c;
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.lp-home-level small b,
.lp-home-season-head b,
.lp-home-stat strong b {
  color: var(--cyan);
  font-weight: 720;
}

.lp-home-stat-progress,
.lp-home-rank-progress {
  width: 100%;
  height: 4px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(159, 211, 216, 0.09);
}

.lp-home-stat-progress > span,
.lp-home-rank-progress > span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.lp-home-stat-progress > span {
  width: 57%;
  background: var(--cyan);
  box-shadow: 0 0 16px rgba(116, 231, 239, 0.46);
}

.lp-home-rank-progress > span {
  width: 42%;
  background: var(--gold);
}

.lp-home-stat > strong {
  display: block;
  margin-top: 13px;
  color: #dce7e8;
  font-size: 21px;
  font-weight: 620;
}

.lp-home-season-head {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 24px 0 14px;
}

.lp-home-season-path {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  min-height: 84px;
  padding: 10px 12px 12px;
}

.lp-home-season-line {
  position: absolute;
  top: 31px;
  left: 10%;
  right: 10%;
  height: 2px;
  background: rgba(159, 211, 216, 0.15);
}

.lp-home-season-line > span {
  display: block;
  width: 50%;
  height: 100%;
  background: linear-gradient(90deg, var(--cyan), var(--mint));
  box-shadow: 0 0 14px rgba(116, 231, 239, 0.38);
}

.lp-home-season-step {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 7px;
}

.lp-home-season-step > span {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid rgba(159, 211, 216, 0.22);
  border-radius: 50%;
  background: #02080a;
  color: #66797c;
  font-size: 14px;
  font-weight: 680;
}

.lp-home-season-step small {
  color: #5d7073;
  font-size: 9px;
  letter-spacing: 0.12em;
}

.lp-home-season-step.is-complete > span {
  border-color: rgba(116, 231, 239, 0.72);
  color: var(--cyan);
}

.lp-home-season-step.is-active > span {
  width: 52px;
  height: 52px;
  margin-top: -4px;
  border-color: var(--cyan);
  color: var(--text);
  box-shadow: 0 0 0 6px rgba(116, 231, 239, 0.06), 0 0 28px rgba(116, 231, 239, 0.34);
}

.lp-home-season-step.is-active small {
  color: var(--cyan);
}

.lp-home-quest-reward {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(280px, 0.92fr);
  min-height: 242px;
  margin-top: 2px;
  border: 1px solid rgba(159, 211, 216, 0.18);
  border-radius: 7px;
  background: rgba(4, 10, 13, 0.62);
  overflow: hidden;
}

.lp-home-quest-copy {
  padding: 24px 28px;
}

.lp-home-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 18px;
}

.lp-home-panel-head > strong {
  color: var(--cyan);
  font-size: 12px;
  letter-spacing: 0.09em;
}

.lp-home-quest-copy h2 {
  margin: 18px 0 0;
  font-size: 24px;
  line-height: 1.1;
  font-weight: 660;
}

.lp-home-quest-copy p {
  margin: 10px 0 0;
  color: #879a9d;
  font-size: 13px;
  line-height: 1.5;
}

.lp-home-quest-progress-row {
  display: flex;
  gap: 7px;
  margin-top: 20px;
  font-size: 12px;
}

.lp-home-quest-progress-row span {
  color: #71878a;
}

.lp-home-quest-progress {
  height: 4px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(159, 211, 216, 0.1);
}

.lp-home-quest-progress > span {
  display: block;
  width: 62.5%;
  height: 100%;
  border-radius: inherit;
  background: var(--cyan);
  box-shadow: 0 0 14px rgba(116, 231, 239, 0.38);
}

.lp-home-quest-link {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  min-height: 42px;
  margin-top: 22px;
  padding: 0 15px;
  border: 1px solid rgba(159, 211, 216, 0.22);
  border-radius: 5px;
  color: #cbd8d9 !important;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transition: border-color 180ms ease, color 180ms ease;
}

.lp-home-quest-link:hover,
.lp-home-quest-link:focus-visible {
  outline: none;
  border-color: rgba(116, 231, 239, 0.55);
  color: var(--cyan) !important;
}

.lp-home-reward-preview {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
  padding: 24px 24px 16px 34px;
  border-left: 1px solid rgba(159, 211, 216, 0.13);
  overflow: hidden;
}

.lp-home-reward-preview::before {
  position: absolute;
  inset: 0;
  content: "";
  background: radial-gradient(circle at 50% 72%, rgba(193, 140, 244, 0.16), transparent 44%);
  pointer-events: none;
}

.lp-home-reward-preview > div {
  position: relative;
  z-index: 1;
}

.lp-home-reward-preview > div > strong {
  display: block;
  margin-top: 7px;
  color: var(--violet);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.lp-home-reward-art {
  --reward-image-width: min(72%, 210px);
  position: relative;
  z-index: 1;
  align-self: end;
  justify-self: center;
  width: var(--reward-image-width);
  aspect-ratio: 1024 / 823;
  filter: drop-shadow(0 18px 30px rgba(110, 64, 160, 0.28));
}

.lp-home-reward-art img,
.lp-home-card-art img {
  object-fit: contain;
}

.lp-home-weekly {
  width: min(100%, 1600px);
  margin: 0 auto;
  padding: 54px clamp(24px, 4vw, 64px) 72px;
  border-top: 1px solid rgba(159, 211, 216, 0.14);
  content-visibility: auto;
}

.lp-home-weekly-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 32px;
}

.lp-home-weekly-head > div {
  display: grid;
  gap: 9px;
}

.lp-home-weekly-head > div > span {
  color: #71878a;
  font-size: 9px;
  font-weight: 760;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.lp-home-weekly h2 {
  margin: 0;
  font-size: clamp(34px, 3.4vw, 52px);
  line-height: 1;
  font-weight: 650;
}

.lp-home-weekly-head > a {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 0 15px;
  border: 1px solid rgba(159, 211, 216, 0.2);
  border-radius: 5px;
  color: #aebcbe;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.lp-home-reward-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-top: 30px;
}

.lp-home-reward-card {
  --reward-color: var(--cyan);
  position: relative;
  min-height: 320px;
  overflow: hidden;
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--reward-color), transparent 68%);
  border-radius: 7px;
  background: rgba(4, 10, 13, 0.72);
  transition: border-color 180ms ease, transform 180ms ease;
}

.lp-home-reward-card:hover,
.lp-home-reward-card:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--reward-color), transparent 28%);
  transform: translateY(-3px);
}

.lp-home-reward-card.is-epic {
  --reward-color: var(--violet);
}

.lp-home-reward-card.is-legendary {
  --reward-color: var(--gold);
}

.lp-home-reward-card > span {
  color: #71878a;
  font-size: 9px;
  font-weight: 780;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.lp-home-card-art {
  position: relative;
  width: 100%;
  height: 190px;
  margin: 6px auto 0;
}

.lp-home-reward-card > strong {
  display: block;
  color: #dce7e8;
  font-size: 17px;
}

.lp-home-reward-card > small {
  display: block;
  margin-top: 8px;
  color: var(--reward-color);
  font-size: 10px;
  font-weight: 780;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.lp-home-legal {
  width: min(100%, 1600px);
  margin: 0 auto;
  padding: 22px clamp(24px, 4vw, 64px) 26px;
  border-color: rgba(159, 211, 216, 0.12) !important;
  color: #65777a !important;
}

.lp-home-legal p,
.lp-home-legal dd {
  color: #819295 !important;
}

@media (max-width: 1180px) {
  .lp-home-hero {
    grid-template-columns: minmax(290px, 0.65fr) minmax(570px, 1.35fr);
    gap: 34px;
  }

  .lp-home-intro h1 {
    font-size: clamp(48px, 5.8vw, 67px);
  }

  .lp-home-club-summary {
    grid-template-columns: 84px minmax(190px, 1.3fr) minmax(120px, 0.75fr) minmax(112px, 0.7fr);
  }

  .lp-home-level,
  .lp-home-stat {
    padding-inline: 17px;
  }
}

@media (max-width: 960px) {
  .lp-home-header {
    grid-template-columns: 1fr auto;
  }

  .lp-home-hero {
    grid-template-columns: 1fr;
    min-height: auto;
    padding-top: 46px;
  }

  .lp-home-intro {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 0.75fr);
    column-gap: 40px;
    align-items: end;
  }

  .lp-home-eyebrow,
  .lp-home-intro h1 {
    grid-column: 1;
  }

  .lp-home-intro > p,
  .lp-home-intro-actions {
    grid-column: 2;
  }

  .lp-home-intro > p {
    grid-row: 1 / span 2;
    align-self: center;
    margin-top: 0;
  }

  .lp-home-intro-actions {
    grid-row: 3;
    margin-top: 24px;
  }

  .lp-home-game-surface {
    margin-top: 18px;
  }

  .lp-home-reward-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .lp-home::before {
    background-size: 64px 64px;
  }

  .lp-home-header {
    min-height: 70px;
    gap: 12px;
    padding: 13px 15px;
  }

  .lp-home-brand {
    gap: 9px;
    font-size: 11px;
  }

  .lp-home-brand img {
    width: 36px;
    height: 36px;
  }

  .lp-home-analytics {
    font-size: 10px;
  }

  .lp-home-analytics svg {
    display: none;
  }

  .lp-home-hero {
    gap: 36px;
    padding: 38px 15px 34px;
  }

  .lp-home-intro {
    display: block;
  }

  .lp-home-intro h1 {
    font-size: clamp(43px, 12.5vw, 60px);
  }

  .lp-home-intro > p {
    margin-top: 20px;
    font-size: 15px;
  }

  .lp-home-intro-actions {
    width: 100%;
    margin-top: 26px;
  }

  .lp-home-primary {
    min-height: 58px;
  }

  .lp-home-club-summary {
    grid-template-columns: 72px minmax(0, 1fr) minmax(100px, 0.75fr);
    min-height: 112px;
  }

  .lp-home-club-summary > :nth-child(4) {
    display: none;
  }

  .lp-home-club-emblem img {
    width: 58px;
    height: 58px;
  }

  .lp-home-level,
  .lp-home-stat {
    min-height: 70px;
    padding-inline: 13px;
  }

  .lp-home-level > strong {
    font-size: 38px;
  }

  .lp-home-stat > strong {
    margin-top: 11px;
    font-size: 18px;
  }

  .lp-home-stat-progress,
  .lp-home-rank-progress {
    margin-top: 7px;
  }

  .lp-home-season-head {
    align-items: end;
    padding-top: 20px;
    line-height: 1.45;
  }

  .lp-home-season-head span:last-child {
    max-width: 160px;
    text-align: right;
  }

  .lp-home-season-path {
    padding-inline: 0;
  }

  .lp-home-season-line {
    left: 9%;
    right: 9%;
  }

  .lp-home-season-step > span {
    width: 38px;
    height: 38px;
  }

  .lp-home-season-step.is-active > span {
    width: 46px;
    height: 46px;
  }

  .lp-home-quest-reward {
    grid-template-columns: minmax(0, 1.08fr) minmax(150px, 0.92fr);
    min-height: 278px;
  }

  .lp-home-quest-copy {
    padding: 21px 18px;
  }

  .lp-home-quest-copy h2 {
    font-size: 21px;
  }

  .lp-home-quest-link {
    width: 100%;
    justify-content: space-between;
    padding-inline: 12px;
  }

  .lp-home-reward-preview {
    padding: 21px 16px 14px 18px;
  }

  .lp-home-reward-art {
    --reward-image-width: min(88%, 190px);
    max-width: none;
  }

  .lp-home-weekly {
    padding: 42px 15px 52px;
  }

  .lp-home-weekly-head {
    align-items: start;
  }

  .lp-home-weekly h2 {
    font-size: 35px;
  }

  .lp-home-weekly-head > a {
    width: 44px;
    min-height: 44px;
    padding: 0;
    justify-content: center;
    overflow: hidden;
    color: transparent;
  }

  .lp-home-weekly-head > a svg {
    color: var(--cyan);
  }

  .lp-home-reward-grid {
    display: flex;
    gap: 12px;
    margin-right: -15px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: thin;
    scrollbar-color: var(--cyan-dim) rgba(159, 211, 216, 0.08);
  }

  .lp-home-reward-card {
    width: min(76vw, 290px);
    min-width: min(76vw, 290px);
    min-height: 300px;
    scroll-snap-align: start;
  }

  .lp-home-legal {
    padding-inline: 15px;
  }
}

@media (max-width: 430px) {
  .lp-home-quest-reward {
    grid-template-columns: 1fr;
  }

  .lp-home-reward-preview {
    min-height: 250px;
    border-top: 1px solid rgba(159, 211, 216, 0.13);
    border-left: 0;
  }

  .lp-home-reward-art {
    --reward-image-width: min(70vw, 240px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lp-home *,
  .lp-home *::before,
  .lp-home *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
`;
