"use client";

import Link from "next/link";
import { useState } from "react";
import { LegalEntityInfo } from "@/components/legal-entity-info";

type ModuleKey = "business" | "game";

type ModuleChoicePageProps = {
  analyticsHref: string;
};

const moduleMeta: Record<
  ModuleKey,
  {
    status: string;
    cta: string;
    href: (analyticsHref: string) => string;
    toast: string;
    details: string;
  }
> = {
  business: {
    status: "Аналитика",
    cta: "Открыть аналитику",
    href: (analyticsHref) => analyticsHref,
    toast: "Выбран корпоративный аналитический блок.",
    details:
      "Аналитика: отчеты, маркетинг, ассортимент, персонал и операционный контроль.",
  },
  game: {
    status: "Игровой",
    cta: "Перейти в модуль",
    href: () => "/game/auth",
    toast: "Выбран игровой модуль для гостей клубов.",
    details: "Игровой модуль: миссии, рейтинг, награды и гостевой вход.",
  },
};

export function ModuleChoicePage({ analyticsHref }: ModuleChoicePageProps) {
  const [activeModule, setActiveModule] = useState<ModuleKey>("game");
  const [toast, setToast] = useState<string | null>(null);
  const active = moduleMeta[activeModule];

  function announce(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }

  function selectModule(moduleKey: ModuleKey, announceSelection = true) {
    setActiveModule(moduleKey);
    if (announceSelection) {
      announce(moduleMeta[moduleKey].toast);
    }
  }

  return (
    <>
      <main className="lp-start">
        <header className="lp-start-topbar">
          <Link className="lp-start-brand" href="/start" aria-label="LeetPlus">
            <span className="lp-start-brand-mark" aria-hidden="true" />
            <span>LeetPlus</span>
          </Link>
          <div className="lp-start-status">
            <span className="lp-start-status-dot" aria-hidden="true" />
            {active.status}
          </div>
        </header>

        <section className="lp-start-split" aria-label="Стартовый выбор раздела">
          <article className="lp-start-zone lp-start-business">
            <div className="lp-start-content">
              <div className="lp-start-label">Корпоративный блок</div>
              <h1>Аналитика и управление</h1>
              <p className="lp-start-lead">
                Деловой режим для команды клуба: отчеты, ассортимент, продажи,
                смены и операционные показатели в одном рабочем контуре.
              </p>

              <CorporatePreview />

              <div className="lp-start-features">
                <span>BI-дашборды</span>
                <span>Маркетинг</span>
                <span>Ассортимент</span>
                <span>Персонал</span>
              </div>

              <div className="lp-start-actions">
                <Link
                  className="lp-start-primary"
                  href={analyticsHref}
                  onClick={() => selectModule("business", false)}
                >
                  Открыть аналитику
                  <ArrowIcon />
                </Link>
                <button
                  className="lp-start-secondary"
                  onClick={() => announce(moduleMeta.business.details)}
                  title="Подробнее об аналитике"
                  type="button"
                >
                  <PlusIcon />
                </button>
              </div>
            </div>
          </article>

          <article className="lp-start-zone lp-start-game">
            <div className="lp-start-content">
              <div className="lp-start-label">Гости клубов</div>
              <h1>Игровой модуль</h1>
              <p className="lp-start-lead">
                Гостевой режим для игроков клуба: задания, рейтинги, награды и
                быстрый вход через Telegram, звонок или SMS.
              </p>

              <GamePreview />

              <div className="lp-start-features">
                <span>Миссии</span>
                <span>Рейтинг</span>
                <span>Награды</span>
                <span>Гостевой вход</span>
              </div>

              <div className="lp-start-actions">
                <Link
                  className="lp-start-primary"
                  href="/game/auth"
                  onClick={() => selectModule("game", false)}
                >
                  Перейти в модуль
                  <ArrowIcon />
                </Link>
                <button
                  className="lp-start-secondary"
                  onClick={() => announce(moduleMeta.game.details)}
                  title="Подробнее об игровом модуле"
                  type="button"
                >
                  <InfoIcon />
                </button>
              </div>
            </div>
          </article>
        </section>

        <section className="lp-start-mobile" aria-label="Мобильный выбор модуля">
          <div className="lp-start-mobile-intro">
            <div className="lp-start-label">Стартовый экран</div>
            <h1>Выберите модуль</h1>
            <p className="lp-start-lead">
              Откройте рабочую аналитику клуба или игровой контур для гостей.
            </p>
          </div>

          <div
            className="lp-start-module-stack"
            role="radiogroup"
            aria-label="Модули LeetPlus"
          >
            <button
              aria-checked={activeModule === "business"}
              className={`lp-start-module-card lp-start-module-business ${
                activeModule === "business" ? "is-selected" : ""
              }`}
              onClick={() => selectModule("business")}
              role="radio"
              type="button"
            >
              <span className="lp-start-card-head">
                <span>
                  <span className="lp-start-card-kicker">
                    Корпоративный блок
                  </span>
                  <span className="lp-start-card-title">
                    Аналитика и управление
                  </span>
                </span>
                <span className="lp-start-card-icon" aria-hidden="true">
                  <ChartIcon />
                </span>
              </span>
              <span className="lp-start-card-copy">
                Деловой режим для отчетов, продаж, ассортимента, маркетинга и
                персонала.
              </span>
              <span className="lp-start-mini">
                <span className="lp-start-mobile-metrics">
                  <Metric value="84%" label="Загрузка" />
                  <Metric value="+18" label="Заказы" />
                  <Metric value="12.4" label="Средний чек" />
                </span>
                <Tags tags={["BI", "Маркетинг", "Ассортимент", "Персонал"]} />
              </span>
            </button>

            <button
              aria-checked={activeModule === "game"}
              className={`lp-start-module-card lp-start-module-game ${
                activeModule === "game" ? "is-selected" : ""
              }`}
              onClick={() => selectModule("game")}
              role="radio"
              type="button"
            >
              <span className="lp-start-card-head">
                <span>
                  <span className="lp-start-card-kicker">Гости клубов</span>
                  <span className="lp-start-card-title">Игровой модуль</span>
                </span>
                <span className="lp-start-card-icon" aria-hidden="true">
                  <OrbitIcon />
                </span>
              </span>
              <span className="lp-start-card-copy">
                Гостевой контур с миссиями, рейтингом, наградами и быстрым
                входом.
              </span>
              <span className="lp-start-mini">
                <MissionRow label="Сыграть 2 часа" value="+120 XP" />
                <MissionRow label="Командный матч" value="+80 XP" />
                <MissionRow label="Бонус бара" value="Награда" />
                <Tags tags={["Миссии", "Рейтинг", "Гостевой вход"]} />
              </span>
            </button>
          </div>
        </section>
      </main>

      <div className="lp-start-bottom-action">
        <div className="lp-start-action-inner">
          <Link
            className={`lp-start-cta ${
              activeModule === "business" ? "business-mode" : ""
            }`}
            href={active.href(analyticsHref)}
          >
            {active.cta}
            <ArrowIcon />
          </Link>
          <button
            className="lp-start-info"
            onClick={() => announce(active.details)}
            title="Подробнее о выбранном модуле"
            type="button"
          >
            <InfoIcon />
          </button>
        </div>
      </div>

      <LegalEntityInfo className="lp-start-legal" compact />

      <div
        className={`lp-start-toast ${toast ? "is-visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {toast}
      </div>

      <style>{startCss}</style>
    </>
  );
}

function CorporatePreview() {
  return (
    <div className="lp-start-preview" aria-label="Превью аналитического блока">
      <div className="lp-start-preview-head">
        <span>Операционная панель</span>
        <span>Сегодня</span>
      </div>
      <div className="lp-start-analytics-grid">
        <Metric value="84%" label="Загрузка" />
        <Metric value="+18" label="Заказы" />
        <Metric value="12.4" label="Средний чек" />
      </div>
      <div className="lp-start-chart" aria-hidden="true">
        {[42, 62, 48, 78, 66, 88, 72].map((height) => (
          <span key={height} style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

function GamePreview() {
  return (
    <div className="lp-start-preview" aria-label="Превью игрового модуля">
      <div className="lp-start-preview-head">
        <span>Сезон клуба</span>
        <span>Ранг 04</span>
      </div>
      <div className="lp-start-game-board">
        <div className="lp-start-rank-orbit" aria-hidden="true">
          <span>04</span>
        </div>
        <div className="lp-start-mission-list">
          <MissionRow label="Сыграть 2 часа" value="+120 XP" />
          <MissionRow label="Командный матч" value="+80 XP" />
          <MissionRow label="Бонус бара" value="Награда" />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="lp-start-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

function MissionRow({ label, value }: { label: string; value: string }) {
  return (
    <span className="lp-start-mission-row">
      <span>{label}</span>
      <span>{value}</span>
    </span>
  );
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <span className="lp-start-tags">
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15v-4" />
      <path d="M12 15V8" />
      <path d="M16 15v-6" />
    </svg>
  );
}

function OrbitIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 3v6" />
      <path d="M12 15v6" />
      <path d="M5.6 6.2l4.2 4.2" />
      <path d="M14.2 13.6l4.2 4.2" />
      <path d="M21 12h-6" />
      <path d="M9 12H3" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const startCss = `
:root {
  color-scheme: dark;
}

.lp-start {
  position: relative;
  min-height: 100vh;
  max-width: 100vw;
  overflow-x: hidden;
  isolation: isolate;
  color: #edf7f8;
  background:
    linear-gradient(90deg, rgba(148, 214, 184, 0.045), transparent 42%, rgba(140, 230, 237, 0.045)),
    #000;
  letter-spacing: 0;
}

.lp-start,
.lp-start *,
.lp-start *::before,
.lp-start *::after,
.lp-start-bottom-action,
.lp-start-bottom-action *,
.lp-start-bottom-action *::before,
.lp-start-bottom-action *::after {
  box-sizing: border-box;
}

.lp-start::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0.8;
  background-image:
    linear-gradient(rgba(160, 223, 225, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(160, 223, 225, 0.028) 1px, transparent 1px);
  background-size: 112px 112px;
  mask-image: linear-gradient(180deg, transparent, #000 14%, #000 86%, transparent);
}

.lp-start button {
  border: 0;
  color: inherit;
  font: inherit;
}

.lp-start-topbar {
  position: fixed;
  z-index: 5;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 22px clamp(20px, 4vw, 58px);
  pointer-events: none;
}

.lp-start-brand,
.lp-start-status {
  pointer-events: auto;
}

.lp-start-brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: #edf7f8;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  font-size: 12px;
  font-weight: 760;
  text-decoration: none;
}

.lp-start-brand-mark {
  position: relative;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(196, 224, 225, 0.36);
  border-radius: 50%;
}

.lp-start-brand-mark::before,
.lp-start-brand-mark::after {
  content: "";
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(140, 230, 237, 0.34);
  transform: rotate(45deg);
}

.lp-start-brand-mark::after {
  inset: 14px;
  border-color: #d0aa6c;
}

.lp-start-status {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 6px;
  background: rgba(7, 12, 16, 0.56);
  color: #a8b9ba;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
  font-weight: 720;
  backdrop-filter: blur(14px);
}

.lp-start-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #8ce6ed;
  box-shadow: 0 0 16px rgba(140, 230, 237, 0.72);
}

.lp-start-split {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.lp-start-zone {
  --pad-x: clamp(28px, 5vw, 72px);
  position: relative;
  min-height: 100vh;
  display: grid;
  align-content: center;
  padding: 108px var(--pad-x) 54px;
  overflow: hidden;
}

.lp-start-zone + .lp-start-zone {
  border-left: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-start-zone::before,
.lp-start-zone::after {
  content: "";
  position: absolute;
  pointer-events: none;
}

.lp-start-zone::before {
  inset: 0;
  z-index: -1;
}

.lp-start-business::before {
  background:
    radial-gradient(circle at 16% 18%, rgba(148, 214, 184, 0.09), transparent 28%),
    linear-gradient(135deg, rgba(16, 25, 24, 0.88), rgba(0, 0, 0, 0.9) 58%);
}

.lp-start-game::before {
  background:
    radial-gradient(circle at 76% 22%, rgba(140, 230, 237, 0.1), transparent 30%),
    linear-gradient(225deg, rgba(9, 21, 26, 0.9), rgba(0, 0, 0, 0.9) 62%);
}

.lp-start-business::after {
  left: var(--pad-x);
  right: 14%;
  bottom: 96px;
  height: 1px;
  background: linear-gradient(90deg, #94d6b8, transparent);
}

.lp-start-game::after {
  left: 14%;
  right: var(--pad-x);
  bottom: 96px;
  height: 1px;
  background: linear-gradient(90deg, transparent, #8ce6ed);
}

.lp-start-content {
  width: min(560px, 100%);
  padding-bottom: 82px;
}

.lp-start-game .lp-start-content {
  justify-self: end;
}

.lp-start-label {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
  color: #a8b9ba;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 11px;
  font-weight: 760;
}

.lp-start-label::before {
  content: "";
  height: 1px;
  background: linear-gradient(90deg, currentColor, transparent);
}

.lp-start-business .lp-start-label::before {
  background: linear-gradient(90deg, #94d6b8, transparent);
}

.lp-start-game .lp-start-label::before {
  background: linear-gradient(90deg, #8ce6ed, transparent);
}

.lp-start h1 {
  max-width: 540px;
  margin: 0;
  color: #edf7f8;
  font-size: clamp(44px, 5.7vw, 76px);
  line-height: 0.97;
  font-weight: 660;
  letter-spacing: 0;
}

.lp-start-game h1 {
  max-width: 500px;
}

.lp-start-lead {
  max-width: 470px;
  margin: 24px 0 0;
  color: #bdcbcc;
  font-size: clamp(16px, 1.7vw, 18px);
  line-height: 1.68;
}

.lp-start-preview {
  width: min(500px, 100%);
  margin-top: 34px;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.048), transparent 26%),
    rgba(5, 10, 13, 0.76);
  box-shadow: 0 34px 96px rgba(0, 0, 0, 0.48);
}

.lp-start-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 54px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.11);
}

.lp-start-preview-head span:first-child {
  color: #dce8e9;
  text-transform: uppercase;
  letter-spacing: 0.13em;
  font-size: 11px;
  font-weight: 780;
}

.lp-start-preview-head span:last-child {
  color: #70878a;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 10px;
  font-weight: 760;
}

.lp-start-analytics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: rgba(196, 224, 225, 0.11);
}

.lp-start-metric {
  min-height: 92px;
  padding: 16px;
  background: rgba(5, 10, 13, 0.95);
}

.lp-start-metric strong {
  display: block;
  color: #c8f0dd;
  font-size: 24px;
  line-height: 1;
  font-weight: 720;
}

.lp-start-metric span {
  display: block;
  margin-top: 10px;
  color: #70878a;
  text-transform: uppercase;
  letter-spacing: 0.11em;
  font-size: 9px;
  font-weight: 760;
}

.lp-start-chart {
  display: flex;
  align-items: end;
  gap: 8px;
  height: 118px;
  padding: 18px 16px 16px;
}

.lp-start-chart span {
  flex: 1;
  min-width: 0;
  background: linear-gradient(180deg, rgba(148, 214, 184, 0.9), rgba(148, 214, 184, 0.16));
  border-top: 1px solid rgba(200, 240, 221, 0.92);
}

.lp-start-game-board {
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr);
  gap: 18px;
  padding: 18px 16px;
}

.lp-start-rank-orbit {
  position: relative;
  width: 118px;
  height: 118px;
  border: 1px solid rgba(140, 230, 237, 0.28);
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.lp-start-rank-orbit::before,
.lp-start-rank-orbit::after {
  content: "";
  position: absolute;
  border-radius: 50%;
}

.lp-start-rank-orbit::before {
  inset: 13px;
  border: 1px solid rgba(140, 230, 237, 0.18);
}

.lp-start-rank-orbit::after {
  inset: 24px 24px 24px 66px;
  border-top: 3px solid #d0aa6c;
  border-right: 3px solid #d0aa6c;
}

.lp-start-rank-orbit span {
  color: #d0fbff;
  font-size: 30px;
  font-weight: 720;
}

.lp-start-mission-list {
  display: grid;
  gap: 10px;
  align-content: center;
}

.lp-start-mission-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  min-height: 38px;
  padding: 0 0 10px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-start-mission-row span:first-child {
  color: #dce8e9;
  font-size: 13px;
  font-weight: 680;
}

.lp-start-mission-row span:last-child {
  color: #8ce6ed;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 10px;
  font-weight: 780;
}

.lp-start-features,
.lp-start-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 26px 0 0;
}

.lp-start-features span,
.lp-start-tags span {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 6px;
  background: rgba(196, 224, 225, 0.035);
  color: #a8b9ba;
  text-transform: uppercase;
  letter-spacing: 0.11em;
  font-size: 10px;
  font-weight: 760;
}

.lp-start-actions {
  position: absolute;
  left: var(--pad-x);
  bottom: 54px;
  z-index: 2;
  width: min(560px, calc(100% - var(--pad-x) - var(--pad-x)));
  display: flex;
  align-items: center;
  gap: 12px;
}

.lp-start-game .lp-start-actions {
  left: auto;
  right: var(--pad-x);
}

.lp-start-primary,
.lp-start-secondary,
.lp-start-cta,
.lp-start-info {
  min-height: 50px;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease, color 180ms ease;
}

.lp-start-primary,
.lp-start-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 226px;
  padding: 0 20px;
  color: #051012;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 12px;
  font-weight: 840;
  text-decoration: none;
}

.lp-start-business .lp-start-primary,
.lp-start-cta.business-mode {
  background: linear-gradient(90deg, rgba(200, 240, 221, 0.98), rgba(148, 214, 184, 0.86));
}

.lp-start-game .lp-start-primary,
.lp-start-cta {
  background: linear-gradient(90deg, rgba(140, 230, 237, 0.98), rgba(84, 191, 198, 0.84));
}

.lp-start-secondary,
.lp-start-info {
  width: 50px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(196, 224, 225, 0.18);
  background: rgba(196, 224, 225, 0.04);
  color: #edf7f8;
}

.lp-start-primary:hover,
.lp-start-primary:focus-visible,
.lp-start-secondary:hover,
.lp-start-secondary:focus-visible,
.lp-start-cta:hover,
.lp-start-cta:focus-visible,
.lp-start-info:hover,
.lp-start-info:focus-visible {
  outline: none;
  transform: translateY(-1px);
}

.lp-start-secondary:hover,
.lp-start-secondary:focus-visible,
.lp-start-info:hover,
.lp-start-info:focus-visible {
  border-color: rgba(140, 230, 237, 0.48);
  background: rgba(140, 230, 237, 0.07);
}

.lp-start svg,
.lp-start-bottom-action svg {
  width: 19px;
  height: 19px;
  stroke-width: 1.8;
}

.lp-start-mobile,
.lp-start-bottom-action {
  display: none;
}

.lp-start-legal {
  margin: 0;
  width: 100%;
  max-width: none;
  border-color: rgba(196, 224, 225, 0.18) !important;
  background: #000;
  padding: 0;
  color: rgba(168, 185, 186, 0.72) !important;
}

.lp-start-legal > div {
  max-width: 1440px;
  margin: 0 auto;
  padding: 10px clamp(14px, 4vw, 58px) 18px;
}

.lp-start-legal p,
.lp-start-legal dd {
  color: rgba(237, 247, 248, 0.78) !important;
}

.lp-start-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 10;
  width: min(520px, calc(100vw - 36px));
  padding: 14px 16px;
  border: 1px solid rgba(140, 230, 237, 0.28);
  border-radius: 6px;
  background: rgba(7, 13, 16, 0.94);
  box-shadow: 0 34px 96px rgba(0, 0, 0, 0.48);
  color: #d7e5e6;
  font-size: 13px;
  line-height: 1.45;
  opacity: 0;
  transform: translate(-50%, 16px);
  pointer-events: none;
  transition: opacity 180ms ease, transform 180ms ease;
  backdrop-filter: blur(18px);
}

.lp-start-toast.is-visible {
  opacity: 1;
  transform: translate(-50%, 0);
}

@media (max-width: 980px) {
  .lp-start {
    background:
      radial-gradient(circle at 18% 4%, rgba(169, 228, 199, 0.1), transparent 26%),
      radial-gradient(circle at 94% 36%, rgba(131, 228, 236, 0.1), transparent 26%),
      #000;
  }

  .lp-start::before {
    opacity: 0.55;
    background-size: 72px 72px;
    mask-image: linear-gradient(180deg, #000, #000 78%, transparent);
  }

  .lp-start-topbar {
    position: sticky;
    left: 0;
    right: auto;
    width: 100%;
    max-width: 100vw;
    box-sizing: border-box;
    min-height: 70px;
    padding: 16px 14px 12px;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0.68), transparent);
    backdrop-filter: blur(12px);
  }

  .lp-start-brand {
    min-width: 0;
    font-size: 12px;
    letter-spacing: 0;
  }

  .lp-start-status {
    flex: 0 0 auto;
    max-width: 128px;
    overflow: hidden;
    min-height: 32px;
    padding: 0 10px;
    font-size: 11px;
    letter-spacing: 0;
  }

  .lp-start-split {
    display: none;
  }

  .lp-start-mobile {
    display: block;
    width: calc(100% - 24px);
    max-width: 430px;
    margin: 0 auto;
    padding: 18px 0 24px;
  }

  .lp-start-mobile-intro {
    padding: 10px 0 20px;
  }

  .lp-start-mobile h1 {
    max-width: 340px;
    font-size: 42px;
    line-height: 0.98;
    font-weight: 720;
  }

  .lp-start-mobile .lp-start-lead {
    margin-top: 18px;
    max-width: 360px;
    font-size: 16px;
    line-height: 1.62;
  }

  .lp-start-mobile .lp-start-label {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    letter-spacing: 0;
  }

  .lp-start-mobile .lp-start-label::before {
    width: 40px;
    flex: 0 0 auto;
    background: linear-gradient(90deg, #83e4ec, transparent);
  }

  .lp-start-module-stack {
    display: grid;
    gap: 14px;
  }

  .lp-start-module-card {
    overflow: hidden;
    position: relative;
    width: 100%;
    min-height: 254px;
    padding: 18px;
    border: 1px solid rgba(196, 224, 225, 0.18);
    border-radius: 8px;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.055), transparent 28%),
      rgba(8, 14, 18, 0.94);
    box-shadow: 0 28px 84px rgba(0, 0, 0, 0.5);
    text-align: left;
    cursor: pointer;
    transition: border-color 180ms ease, background 180ms ease, transform 180ms ease;
  }

  .lp-start-module-card:focus-visible,
  .lp-start-module-card:hover {
    outline: none;
    transform: translateY(-1px);
  }

  .lp-start-module-card.is-selected {
    border-color: rgba(131, 228, 236, 0.72);
    background:
      linear-gradient(135deg, rgba(131, 228, 236, 0.12), transparent 34%),
      rgba(12, 20, 24, 0.88);
  }

  .lp-start-module-business.is-selected {
    border-color: rgba(169, 228, 199, 0.74);
    background:
      linear-gradient(135deg, rgba(169, 228, 199, 0.12), transparent 34%),
      rgba(12, 20, 24, 0.88);
  }

  .lp-start-module-card.is-selected::before {
    content: "";
    position: absolute;
    inset: 14px auto 14px -1px;
    width: 2px;
    background: #83e4ec;
    box-shadow: 0 0 16px rgba(131, 228, 236, 0.75);
  }

  .lp-start-module-business.is-selected::before {
    background: #a9e4c7;
    box-shadow: 0 0 16px rgba(169, 228, 199, 0.7);
  }

  .lp-start-card-head {
    display: flex;
    justify-content: space-between;
    gap: 18px;
  }

  .lp-start-card-kicker {
    display: block;
    color: #71878a;
    font-size: 11px;
    font-weight: 780;
    text-transform: uppercase;
  }

  .lp-start-card-title {
    display: block;
    margin-top: 8px;
    color: #edf7f8;
    font-size: 24px;
    line-height: 1.05;
    font-weight: 720;
  }

  .lp-start-card-icon {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    flex: 0 0 auto;
    border: 1px solid rgba(196, 224, 225, 0.2);
    border-radius: 50%;
    color: #83e4ec;
    background: rgba(196, 224, 225, 0.04);
  }

  .lp-start-module-business .lp-start-card-icon {
    color: #a9e4c7;
  }

  .lp-start-card-copy {
    display: block;
    margin: 16px 0 0;
    color: #a8b9ba;
    font-size: 14px;
    line-height: 1.55;
  }

  .lp-start-mini {
    display: block;
    margin-top: 18px;
    border-top: 1px solid rgba(196, 224, 225, 0.18);
    padding-top: 16px;
  }

  .lp-start-mobile-metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    border: 1px solid rgba(196, 224, 225, 0.12);
    background: rgba(196, 224, 225, 0.08);
  }

  .lp-start-mobile-metrics .lp-start-metric {
    min-height: 64px;
    padding: 11px 10px;
    background: rgba(1, 6, 8, 0.84);
  }

  .lp-start-mobile-metrics .lp-start-metric strong {
    color: #a9e4c7;
    font-size: 20px;
  }

  .lp-start-mobile-metrics .lp-start-metric span {
    margin-top: 8px;
  }

  .lp-start-module-card .lp-start-mission-row {
    align-items: center;
    min-height: 36px;
    padding-bottom: 0;
  }

  .lp-start-module-card .lp-start-mission-row span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lp-start-module-card .lp-start-mission-row span:last-child {
    flex: 0 0 auto;
  }

  .lp-start-tags {
    gap: 8px;
    margin-top: 14px;
  }

  .lp-start-tags span {
    min-height: 30px;
    padding: 0 10px;
  }

  .lp-start-bottom-action {
    position: relative;
    left: 0;
    right: 0;
    z-index: 5;
    display: block;
    padding: 8px 12px 28px;
    background: #000;
  }

  .lp-start-action-inner {
    width: 100%;
    max-width: 430px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 52px;
    gap: 10px;
  }

  .lp-start-cta,
  .lp-start-info {
    min-height: 54px;
    border-radius: 7px;
  }

  .lp-start-cta {
    min-width: 0;
    padding: 0 18px;
    font-size: 12px;
    font-weight: 880;
  }

  .lp-start-info {
    width: 52px;
  }

  .lp-start-legal {
    padding-inline: 0;
  }

  .lp-start-legal > div {
    padding-inline: 12px;
  }

  .lp-start-toast {
    left: 12px;
    right: 12px;
    bottom: 88px;
    width: auto;
    max-width: 430px;
    margin: 0 auto;
    transform: translateY(12px);
  }

  .lp-start-toast.is-visible {
    transform: translateY(0);
  }
}

@media (max-width: 360px) {
  .lp-start-mobile h1 {
    font-size: 36px;
  }

  .lp-start-module-card {
    padding: 16px;
  }

  .lp-start-card-title {
    font-size: 22px;
  }

  .lp-start-mobile-metrics {
    grid-template-columns: 1fr;
  }
}
`;
