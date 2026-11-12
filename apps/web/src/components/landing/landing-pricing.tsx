"use client";

import { useState } from "react";
import { LANDING_GOALS } from "@/components/landing/landing-config";

// Monthly price per club, rubles: one module / two modules / all three.
const PRICES_SMALL_CLUB = [5500, 8900, 10900] as const; // up to 30 PCs
const PRICES_REGULAR = [7900, 12900, 15900] as const;

const SEG_ON = { background: "#83E4EC", color: "#050B10" };
const SEG_OFF = { background: "transparent", color: "#A9BEC4" };

function formatRub(value: number) {
  return value.toLocaleString("ru-RU").replace(/\s/g, "\u00a0");
}

export function LandingPricing() {
  const [small, setSmall] = useState(false);
  const prices = small ? PRICES_SMALL_CLUB : PRICES_REGULAR;

  return (
    <section id="pricing" style={{ position: "relative", overflow: "hidden", padding: "110px 24px", background: "#050B10" }}>
    <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "120px", width: "1100px", height: "700px", marginLeft: "-550px", background: "radial-gradient(ellipse at center, rgba(131, 228, 236, 0.10) 0%, rgba(131, 228, 236, 0) 60%)", pointerEvents: "none" }}></div>
    <div style={{ position: "relative", maxWidth: "1240px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "36px" }}>
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "24px" }}>
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "680px" }}>
    <p style={{ margin: "0", fontSize: "13px", fontWeight: "800", letterSpacing: "3px", textTransform: "uppercase", color: "#83E4EC" }}>Тарифы</p>
    <h2 style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "clamp(28px, 3.6vw, 44px)", lineHeight: "1.15" }}>Платите только за то, что нужно вашему клубу</h2>
    <p style={{ margin: "0", color: "#A9BEC4", fontSize: "18px" }}>Цена за клуб в месяц. Можно помесячно, без обязательной предоплаты.</p>
    </div>
    <div role="group" aria-label="Размер клуба" style={{ display: "inline-flex", gap: "4px", padding: "5px", background: "#0D1A21", border: "1px solid #1E313A", borderRadius: "999px" }}>
    <button type="button" className="seg" onClick={() => setSmall(true)} aria-pressed={small} style={{ ...(small ? SEG_ON : SEG_OFF) }}>Клуб до 30 ПК</button>
    <button type="button" className="seg" onClick={() => setSmall(false)} aria-pressed={!small} style={{ ...(small ? SEG_OFF : SEG_ON) }}>Больше 30 ПК</button>
    </div>
    </div>

    <div style={{ position: "relative", borderRadius: "24px", padding: "1px", background: "linear-gradient(110deg, #83E4EC 0%, #2A5A62 45%, #D0AA6C 100%)" }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px 28px", background: "linear-gradient(110deg, #0B2329 0%, #0D1A21 55%, #1D1A10 100%)", borderRadius: "23px", padding: "22px 28px" }}>
    <div style={{ flex: "0 0 auto", width: "64px", height: "64px", borderRadius: "18px", background: "rgba(131, 228, 236, 0.12)", border: "1px solid #2A5A62", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: "1" }}><span style={{ fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "26px", color: "#83E4EC" }}>2</span><span style={{ fontSize: "10px", fontWeight: "800", letterSpacing: "1px", textTransform: "uppercase", color: "#A9BEC4", marginTop: "3px" }}>мес.</span></div>
    <div style={{ flex: "1 1 360px", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
    <p style={{ margin: "0", fontSize: "20px", fontWeight: "800" }}>Игровой модуль первые 2 месяца бесплатно</p>
    <p style={{ margin: "0", color: "#A9BEC4", fontSize: "15px" }}>Подключаем, настраиваем сценарии под ваш клуб и каждый месяц присылаем отчёт «Эффект игры». Решение о продлении принимаете по цифрам.</p>
    </div>
    <a href="#start" data-goal={LANDING_GOALS.startCta} data-goal-place="pricing-free" className="lp-btn" style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "8px", background: "#F3FAFA", color: "#050B10", fontWeight: "800", padding: "14px 20px", borderRadius: "14px", minHeight: "44px", boxSizing: "border-box" }}>Начать бесплатно<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a>
    </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "20px", alignItems: "stretch" }}>

    <article className="plan" style={{ background: "#0D1A21", border: "1px solid #1E313A", borderRadius: "24px", padding: "30px", display: "flex", flexDirection: "column", gap: "20px" }}>
    <div style={{ display: "flex", gap: "8px" }} aria-hidden="true">
    <span style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(131, 228, 236, 0.14)", border: "1px solid #2A5A62", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"></path><path d="M7 6h10a5 5 0 0 1 4.9 6l-.6 3.2a3 3 0 0 1-5.3 1.3L14.5 15h-5L8 16.5a3 3 0 0 1-5.3-1.3L2.1 12A5 5 0 0 1 7 6z"></path></svg></span>
    <span style={{ width: "40px", height: "40px", borderRadius: "12px", border: "1px dashed #2A4450", display: "flex", alignItems: "center", justifyContent: "center", color: "#4A6670", fontWeight: "800" }}>+</span>
    <span style={{ width: "40px", height: "40px", borderRadius: "12px", border: "1px dashed #2A4450", display: "flex", alignItems: "center", justifyContent: "center", color: "#4A6670", fontWeight: "800" }}>+</span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
    <h3 style={{ margin: "0", fontSize: "22px", fontWeight: "800" }}>Один модуль</h3>
    <p style={{ margin: "0", color: "#A9BEC4", fontSize: "15px" }}>Начните с главного: игровой модуль, ассортимент и отчёты или персонал</p>
    </div>
    <p style={{ margin: "0", display: "flex", alignItems: "baseline", gap: "8px" }}><span style={{ fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "44px", lineHeight: "1" }}>{formatRub(prices[0])}</span><span style={{ color: "#A9BEC4", fontSize: "15px", fontWeight: "700" }}>₽ / мес</span></p>
    <ul style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "10px", fontSize: "15px", color: "#C9DADE" }}>
    <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "2px" }}><path d="M5 12l5 5L20 7"></path></svg>Интеграция с Langame</li>
    <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "2px" }}><path d="M5 12l5 5L20 7"></path></svg>Настройка под ваш клуб</li>
    <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "2px" }}><path d="M5 12l5 5L20 7"></path></svg>Помощь на запуске</li>
    </ul>
    <a href="#start" data-goal={LANDING_GOALS.startCta} data-goal-place="pricing-one" className="lp-ghost" style={{ marginTop: "auto", textAlign: "center", color: "#F3FAFA", fontWeight: "700", padding: "15px", borderRadius: "14px", border: "1px solid #2A4450", minHeight: "44px", boxSizing: "border-box" }}>Выбрать модуль</a>
    </article>

    <article className="plan" style={{ background: "#0D1A21", border: "1px solid #1E313A", borderRadius: "24px", padding: "30px", display: "flex", flexDirection: "column", gap: "20px" }}>
    <div style={{ display: "flex", gap: "8px" }} aria-hidden="true">
    <span style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(131, 228, 236, 0.14)", border: "1px solid #2A5A62", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"></path><path d="M7 6h10a5 5 0 0 1 4.9 6l-.6 3.2a3 3 0 0 1-5.3 1.3L14.5 15h-5L8 16.5a3 3 0 0 1-5.3-1.3L2.1 12A5 5 0 0 1 7 6z"></path></svg></span>
    <span style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(131, 228, 236, 0.14)", border: "1px solid #2A5A62", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path></svg></span>
    <span style={{ width: "40px", height: "40px", borderRadius: "12px", border: "1px dashed #2A4450", display: "flex", alignItems: "center", justifyContent: "center", color: "#4A6670", fontWeight: "800" }}>+</span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
    <h3 style={{ margin: "0", fontSize: "22px", fontWeight: "800" }}>Два модуля</h3>
    <p style={{ margin: "0", color: "#A9BEC4", fontSize: "15px" }}>Любая пара. Например, игра для гостей и контроль ассортимента</p>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <p style={{ margin: "0", display: "flex", alignItems: "baseline", gap: "8px" }}><span style={{ fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "44px", lineHeight: "1" }}>{formatRub(prices[1])}</span><span style={{ color: "#A9BEC4", fontSize: "15px", fontWeight: "700" }}>₽ / мес</span></p>
    <p style={{ margin: "0", fontSize: "14px", fontWeight: "700", color: "#83E4EC" }}>Экономия {formatRub(prices[0] * 2 - prices[1])} ₽ в месяц</p>
    </div>
    <ul style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "10px", fontSize: "15px", color: "#C9DADE" }}>
    <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "2px" }}><path d="M5 12l5 5L20 7"></path></svg>Всё из «Одного модуля»</li>
    <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "2px" }}><path d="M5 12l5 5L20 7"></path></svg>Данные модулей в одном кабинете</li>
    <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "2px" }}><path d="M5 12l5 5L20 7"></path></svg>Права сотрудников по ролям</li>
    </ul>
    <a href="#start" data-goal={LANDING_GOALS.startCta} data-goal-place="pricing-two" className="lp-ghost" style={{ marginTop: "auto", textAlign: "center", color: "#F3FAFA", fontWeight: "700", padding: "15px", borderRadius: "14px", border: "1px solid #2A4450", minHeight: "44px", boxSizing: "border-box" }}>Выбрать два</a>
    </article>

    <article className="plan" style={{ position: "relative", background: "linear-gradient(165deg, #10343B 0%, #0D1A21 55%)", border: "1px solid #83E4EC", borderRadius: "24px", padding: "30px", display: "flex", flexDirection: "column", gap: "20px", boxShadow: "0 0 0 4px rgba(131, 228, 236, 0.08), 0 30px 80px rgba(131, 228, 236, 0.16)" }}>
    <p style={{ margin: "0", position: "absolute", top: "26px", right: "26px", background: "#83E4EC", color: "#050B10", fontSize: "12px", fontWeight: "800", letterSpacing: "1.2px", textTransform: "uppercase", padding: "6px 12px", borderRadius: "999px" }}>Выгоднее всего</p>
    <div style={{ display: "flex", gap: "8px" }} aria-hidden="true">
    <span style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#83E4EC", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#050B10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"></path><path d="M7 6h10a5 5 0 0 1 4.9 6l-.6 3.2a3 3 0 0 1-5.3 1.3L14.5 15h-5L8 16.5a3 3 0 0 1-5.3-1.3L2.1 12A5 5 0 0 1 7 6z"></path></svg></span>
    <span style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#83E4EC", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#050B10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path></svg></span>
    <span style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#83E4EC", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#050B10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-2.5-5.1"></path></svg></span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
    <h3 style={{ margin: "0", fontSize: "22px", fontWeight: "800" }}>Клуб целиком</h3>
    <p style={{ margin: "0", color: "#C9DADE", fontSize: "15px" }}>Игровой модуль, ассортимент и отчёты, персонал</p>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <p style={{ margin: "0", display: "flex", alignItems: "baseline", gap: "8px" }}><span style={{ fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "44px", lineHeight: "1", color: "#83E4EC" }}>{formatRub(prices[2])}</span><span style={{ color: "#A9BEC4", fontSize: "15px", fontWeight: "700" }}>₽ / мес</span></p>
    <p style={{ margin: "0", fontSize: "14px", fontWeight: "700", color: "#83E4EC" }}>Экономия {formatRub(prices[0] * 3 - prices[2])} ₽ в месяц</p>
    </div>
    <ul style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "10px", fontSize: "15px", color: "#E8F4F5" }}>
    <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "2px" }}><path d="M5 12l5 5L20 7"></path></svg>Все три модуля</li>
    <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "2px" }}><path d="M5 12l5 5L20 7"></path></svg>Дашборд сети и ежедневный отчёт в Telegram</li>
    <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "2px" }}><path d="M5 12l5 5L20 7"></path></svg>Отчёт «Эффект игры» каждый месяц</li>
    </ul>
    <a href="#start" data-goal={LANDING_GOALS.startCta} data-goal-place="pricing-all" className="lp-btn" style={{ marginTop: "auto", textAlign: "center", background: "#83E4EC", color: "#050B10", fontWeight: "800", padding: "15px", borderRadius: "14px", minHeight: "44px", boxSizing: "border-box" }}>Подключить всё</a>
    </article>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "20px" }}>
    <div style={{ background: "#0A141A", border: "1px solid #1E313A", borderRadius: "20px", padding: "22px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 20px" }}>
    <p style={{ margin: "0", flex: "1 1 140px", fontSize: "16px", fontWeight: "800" }}>У вас сеть клубов</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "8px", padding: "10px 14px", borderRadius: "12px", background: "#12232B", fontSize: "14px", color: "#C9DADE" }}>2–4 клуба <b style={{ color: "#83E4EC", fontSize: "16px" }}>−10%</b></span>
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "8px", padding: "10px 14px", borderRadius: "12px", background: "#12232B", fontSize: "14px", color: "#C9DADE" }}>5–9 клубов <b style={{ color: "#83E4EC", fontSize: "16px" }}>−20%</b></span>
    </div>
    </div>
    <div style={{ background: "#0A141A", border: "1px solid #1E313A", borderRadius: "20px", padding: "22px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 20px" }}>
    <p style={{ margin: "0", flex: "1 1 140px", fontSize: "16px", fontWeight: "800" }}>Оплата вперёд</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "8px", padding: "10px 14px", borderRadius: "12px", background: "#12232B", fontSize: "14px", color: "#C9DADE" }}>3 мес <b style={{ color: "#83E4EC", fontSize: "16px" }}>−10%</b></span>
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "8px", padding: "10px 14px", borderRadius: "12px", background: "#12232B", fontSize: "14px", color: "#C9DADE" }}>6 мес <b style={{ color: "#83E4EC", fontSize: "16px" }}>−15%</b></span>
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "8px", padding: "10px 14px", borderRadius: "12px", background: "#12232B", fontSize: "14px", color: "#C9DADE" }}>12 мес <b style={{ color: "#83E4EC", fontSize: "16px" }}>−20%</b></span>
    </div>
    </div>
    </div>
    <p style={{ margin: "0", color: "#8EA6AD", fontSize: "14px" }}>Призы гостям и SMS оплачиваются по факту, без нашей наценки.</p>
    </div>
    </section>
  );
}
