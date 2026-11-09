/* eslint-disable @next/next/no-img-element -- static decorative landing art, sized by CSS */
import Link from "next/link";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { LandingStart } from "@/components/landing/landing-start";
import { landingCss } from "@/components/landing/landing-styles";

type LandingPageProps = {
  cabinetHref: string;
  gameHref: string;
  gameLabel: string;
};

export function LandingPage({ cabinetHref, gameHref, gameLabel }: LandingPageProps) {
  return (
    <div className="lpl">
      <style>{landingCss}</style>
      <header style={{ position: "sticky", top: "0", zIndex: "20", background: "rgba(5, 11, 16, 0.72)", backdropFilter: "blur(14px)", borderBottom: "1px solid rgba(131, 228, 236, 0.10)" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: "32px" }}>
      <a href="#top" aria-label="LeetPlus, на главную" style={{ display: "flex", alignItems: "center" }}><img src="/landing/logo.svg" alt="LeetPlus" style={{ height: "30px", width: "auto", display: "block" }} /></a>
      <nav className="lp-nav" aria-label="Разделы" style={{ gap: "28px", fontSize: "15px", fontWeight: "600", flex: "1" }}>
      <a href="#emotions" style={{ color: "#C9DADE" }}>Игровой модуль</a>
      <a href="#effect" style={{ color: "#C9DADE" }}>Эффект</a>
      <a href="#owner" style={{ color: "#C9DADE" }}>Для сети</a>
      <a href="#pricing" style={{ color: "#C9DADE" }}>Тарифы</a>
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "auto" }}>
      <Link href={cabinetHref} className="lp-ghost" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "700", color: "#C9DADE", padding: "10px 14px", border: "1px solid #2A4450", borderRadius: "12px", minHeight: "44px", boxSizing: "border-box" }}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path></svg><span className="hide-sm">Кабинет клуба</span></Link>
      <Link href={gameHref} className="guest-cta" style={{ display: "inline-flex", alignItems: "center", gap: "10px", background: "linear-gradient(135deg, #F3D38E, #D0AA6C)", color: "#1A1306", padding: "8px 16px 8px 10px", borderRadius: "12px", minHeight: "44px", boxSizing: "border-box" }}><span style={{ width: "30px", height: "30px", borderRadius: "8px", background: "rgba(26, 19, 6, 0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"></path><path d="M7 6h10a5 5 0 0 1 4.9 6l-.6 3.2a3 3 0 0 1-5.3 1.3L14.5 15h-5L8 16.5a3 3 0 0 1-5.3-1.3L2.1 12A5 5 0 0 1 7 6z"></path></svg></span><span style={{ display: "flex", flexDirection: "column", lineHeight: "1.1" }}><span className="hide-sm" style={{ fontSize: "11px", fontWeight: "800", letterSpacing: "1.2px", textTransform: "uppercase", opacity: "0.75" }}>Я гость клуба</span><span style={{ fontSize: "15px", fontWeight: "800" }}>{gameLabel}</span></span></Link>
      </div>
      </div>
      </header>

      <section id="top" className="bg-hero" style={{ position: "relative", overflow: "hidden", padding: "88px 24px 120px" }}>
      <div className="grid-floor" aria-hidden="true"></div>
      <div style={{ position: "relative", maxWidth: "1240px", margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "56px" }}>
      <div style={{ flex: "1 1 500px", minWidth: "0", display: "flex", flexDirection: "column", gap: "28px" }}>
      <p style={{ margin: "0", display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "13px", fontWeight: "800", letterSpacing: "3px", textTransform: "uppercase", color: "#D0AA6C" }}><span className="pulse-dot" style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#83E4EC" }}></span>Для компьютерных клубов на Langame</p>
      <h1 style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "800", fontSize: "clamp(36px, 5.4vw, 66px)", lineHeight: "1.06", letterSpacing: "-1px" }}>Клуб, в который <span className="shine">хочется вернуться</span></h1>
      <p style={{ margin: "0", fontSize: "20px", lineHeight: "1.6", color: "#C9DADE", maxWidth: "560px" }}>Кейсы, задания, боевой пропуск и рейтинг превращают обычный вечер за ПК в игру вокруг вашего клуба. Гость приходит за наградой, а вы видите, сколько это принесло.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
      <a href="#start" className="lp-btn" style={{ display: "inline-flex", alignItems: "center", gap: "10px", background: "linear-gradient(90deg, #83E4EC, #B8F1F5)", color: "#050B10", fontWeight: "800", fontSize: "17px", padding: "18px 28px", borderRadius: "14px", boxShadow: "0 10px 30px rgba(131, 228, 236, 0.3)" }}>2 месяца бесплатно
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a>
      <a href="#emotions" className="lp-ghost" style={{ display: "inline-flex", alignItems: "center", gap: "10px", color: "#F3FAFA", fontWeight: "700", fontSize: "17px", padding: "18px 24px", borderRadius: "14px", border: "1px solid rgba(201, 218, 222, 0.35)" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>Как это выглядит</a>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "28px", marginTop: "8px" }}>
      <div><p style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "30px", color: "#83E4EC" }}>+1,8</p><p style={{ margin: "0", fontSize: "14px", color: "#A9BEC4" }}>дня визитов на игрока</p></div>
      <div><p style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "30px", color: "#D0AA6C" }}>+665 ₽</p><p style={{ margin: "0", fontSize: "14px", color: "#A9BEC4" }}>трат за 28 дней</p></div>
      <div><p style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "30px", color: "#F3FAFA" }}>0</p><p style={{ margin: "0", fontSize: "14px", color: "#A9BEC4" }}>приложений гостю ставить</p></div>
      </div>
      </div>
      <div style={{ flex: "1 1 520px", minWidth: "0", position: "relative", padding: "24px 0" }}>
      <div className="glow-pulse" aria-hidden="true" style={{ position: "absolute", inset: "10% 10%", borderRadius: "50%", background: "radial-gradient(circle, rgba(208, 170, 108, 0.45) 0%, rgba(208, 170, 108, 0) 70%)" }}></div>
      <video src="/landing/case-open.mp4" poster="/landing/case-open-poster.webp" autoPlay muted loop playsInline aria-label="Видео: гость открывает легендарный кейс и получает 1000 бонусов" style={{ position: "relative", display: "block", width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: "24px", border: "1px solid rgba(131, 228, 236, 0.35)", boxShadow: "0 40px 100px rgba(0, 0, 0, 0.6), 0 0 60px rgba(131, 228, 236, 0.15)" }}></video>
      <div className="toast-in" style={{ position: "absolute", right: "4%", bottom: "-8%", display: "flex", alignItems: "center", gap: "12px", background: "rgba(13, 26, 33, 0.94)", border: "1px solid #2A5A62", borderRadius: "16px", padding: "12px 18px", boxShadow: "0 16px 40px rgba(0, 0, 0, 0.5)" }}>
      <span style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#12232B", display: "flex", alignItems: "center", justifyContent: "center" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#83E4EC" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"></path></svg></span>
      <span><b style={{ display: "block", fontSize: "15px" }}>Задание выполнено</b><span style={{ fontSize: "13px", color: "#A9BEC4" }}>7 дней подряд в клубе</span></span>
      </div>
      </div>
      </div>
      </section>

      <div aria-hidden="true" style={{ background: "#83E4EC", color: "#050B10", overflow: "hidden", padding: "16px 0", transform: "rotate(-1deg)", margin: "-18px -10px 0", position: "relative", zIndex: "2", boxShadow: "0 10px 40px rgba(131, 228, 236, 0.25)" }}>
      <div className="marquee" style={{ fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "20px", letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      <span style={{ padding: "0 28px" }}>Кейс открыт</span><span>✦</span><span style={{ padding: "0 28px" }}>+500 бонусов</span><span>✦</span><span style={{ padding: "0 28px" }}>7 дней подряд</span><span>✦</span><span style={{ padding: "0 28px" }}>Новый уровень пропуска</span><span>✦</span><span style={{ padding: "0 28px" }}>Топ-3 месяца</span><span>✦</span><span style={{ padding: "0 28px" }}>Комбо в баре</span><span>✦</span><span style={{ padding: "0 28px" }}>Ночной кейс</span><span>✦</span>
      <span style={{ padding: "0 28px" }}>Кейс открыт</span><span>✦</span><span style={{ padding: "0 28px" }}>+500 бонусов</span><span>✦</span><span style={{ padding: "0 28px" }}>7 дней подряд</span><span>✦</span><span style={{ padding: "0 28px" }}>Новый уровень пропуска</span><span>✦</span><span style={{ padding: "0 28px" }}>Топ-3 месяца</span><span>✦</span><span style={{ padding: "0 28px" }}>Комбо в баре</span><span>✦</span><span style={{ padding: "0 28px" }}>Ночной кейс</span><span>✦</span>
      </div>
      </div>

      <section id="emotions" style={{ padding: "120px 24px 96px" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "48px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "760px" }}>
      <p style={{ margin: "0", fontSize: "13px", fontWeight: "800", letterSpacing: "3px", textTransform: "uppercase", color: "#D0AA6C" }}>Игровой модуль</p>
      <h2 style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "clamp(30px, 4vw, 50px)", lineHeight: "1.1" }}>Гость возвращается не за скидкой. <span style={{ color: "#83E4EC" }}>За эмоцией.</span></h2>
      <p style={{ margin: "0", color: "#A9BEC4", fontSize: "19px" }}>Три чувства, которые знакомы каждому геймеру, теперь работают на ваш клуб.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "22px" }}>
      <article className="emo ph-thrill" style={{ position: "relative", overflow: "hidden", minHeight: "520px", borderRadius: "26px", border: "1px solid #1E313A", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "32px", gap: "12px" }}>
      <img className="float-c" src="/landing/case-legendary.webp" alt="" aria-hidden="true" style={{ position: "absolute", top: "28px", right: "18px", width: "46%", filter: "drop-shadow(0 20px 40px rgba(0, 0, 0, 0.8))" }} />
      <p className="emo-title" style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "800", fontSize: "44px", lineHeight: "1", color: "#D0AA6C" }}>Азарт</p>
      <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "800" }}>Кейс, который хочется открыть</h3>
      <p style={{ margin: "0", color: "#C9DADE", fontSize: "16px" }}>Обычный, редкий, эпический, легендарный. Приз выпадает в момент открытия, как в любимой игре, а не скучным кешбэком.</p>
      </article>
      <article className="emo ph-progress" style={{ position: "relative", overflow: "hidden", minHeight: "520px", borderRadius: "26px", border: "1px solid #1E313A", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "32px", gap: "12px" }}>
      <div style={{ position: "absolute", top: "32px", left: "32px", right: "32px", background: "rgba(13, 26, 33, 0.88)", border: "1px solid #2A5A62", borderRadius: "16px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: "800", letterSpacing: "1.5px", textTransform: "uppercase" }}><span style={{ color: "#83E4EC" }}>Боевой пропуск</span><span style={{ color: "#A9BEC4" }}>ур. 7 → 8</span></div>
      <div style={{ height: "10px", borderRadius: "999px", background: "#12232B", overflow: "hidden" }}><div className="bar-grow" style={{ height: "100%", width: "78%", background: "linear-gradient(90deg, #83E4EC, #E8FCFF)", boxShadow: "0 0 16px #83E4EC" }}></div></div>
      </div>
      <p className="emo-title" style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "800", fontSize: "44px", lineHeight: "1", color: "#83E4EC" }}>Прогресс</p>
      <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "800" }}>Уровни, которые жалко бросить</h3>
      <p style={{ margin: "0", color: "#C9DADE", fontSize: "16px" }}>Боевой пропуск копится весь сезон. Уйти в соседний клуб значит потерять свой уровень и главную награду.</p>
      </article>
      <article className="emo ph-rival" style={{ position: "relative", overflow: "hidden", minHeight: "520px", borderRadius: "26px", border: "1px solid #1E313A", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "32px", gap: "12px" }}>
      <ol style={{ position: "absolute", top: "32px", left: "32px", right: "32px", margin: "0", padding: "14px 18px", listStyle: "none", background: "rgba(13, 26, 33, 0.88)", backdropFilter: "blur(6px)", border: "1px solid #5A4A2A", borderRadius: "16px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "15px" }}>
      <li style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}><span><b style={{ color: "#D0AA6C" }}>1</b>&nbsp;&nbsp;nightowl</span><span style={{ color: "#A9BEC4" }}>42 ч</span></li>
      <li style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}><span><b style={{ color: "#C9DADE" }}>2</b>&nbsp;&nbsp;frag_master</span><span style={{ color: "#A9BEC4" }}>39 ч</span></li>
      <li style={{ display: "flex", justifyContent: "space-between", gap: "12px", color: "#83E4EC" }}><span><b>3</b>&nbsp;&nbsp;вы</span><span>37 ч</span></li>
      </ol>
      <p className="emo-title" style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "800", fontSize: "44px", lineHeight: "1", color: "#F3FAFA" }}>Соперничество</p>
      <h3 style={{ margin: "0", fontSize: "21px", fontWeight: "800" }}>Рейтинг, ради которого зовут друзей</h3>
      <p style={{ margin: "0", color: "#C9DADE", fontSize: "16px" }}>Подиум месяца по клубу и по сети, призы за 1–3 места. Компании приходят соревноваться вместе.</p>
      </article>
      </div>
      </div>
      </section>

      <section aria-label="Кейсы" style={{ position: "relative", overflow: "hidden", padding: "96px 24px", background: "radial-gradient(ellipse 70% 60% at 50% 60%, #14232A 0%, #050B10 70%)" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "40px", textAlign: "center" }}>
      <h2 style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "clamp(28px, 3.6vw, 44px)", lineHeight: "1.15", maxWidth: "820px" }}>Каждая награда ощущается <span className="shine">как лут</span></h2>
      <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: "24px", alignItems: "end" }}>
      <div className="case-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", cursor: "pointer" }}><div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}><div className="case-glow" aria-hidden="true" style={{ position: "absolute", inset: "15%", borderRadius: "50%", background: "radial-gradient(circle, rgba(169, 190, 196, 0.35), rgba(169, 190, 196, 0) 70%)" }}></div><img className="case-hop" src="/landing/case-common.webp" alt="Обычный кейс" style={{ position: "relative", width: "82%" }} /></div><p style={{ margin: "0", fontWeight: "800", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", color: "#C9DADE" }}>Обычный</p></div>
      <div className="case-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", cursor: "pointer" }}><div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}><div className="case-glow" aria-hidden="true" style={{ position: "absolute", inset: "15%", borderRadius: "50%", background: "radial-gradient(circle, rgba(90, 170, 255, 0.45), rgba(90, 170, 255, 0) 70%)" }}></div><img className="case-hop" src="/landing/case-rare.webp" alt="Редкий кейс" style={{ position: "relative", width: "86%" }} /></div><p style={{ margin: "0", fontWeight: "800", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", color: "#8EC5FF" }}>Редкий</p></div>
      <div className="case-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", cursor: "pointer" }}><div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}><div className="case-glow" aria-hidden="true" style={{ position: "absolute", inset: "15%", borderRadius: "50%", background: "radial-gradient(circle, rgba(170, 110, 255, 0.5), rgba(170, 110, 255, 0) 70%)" }}></div><img className="case-hop" src="/landing/case-epic.webp" alt="Эпический кейс" style={{ position: "relative", width: "92%" }} /></div><p style={{ margin: "0", fontWeight: "800", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", color: "#C9A8FF" }}>Эпический</p></div>
      <div className="case-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", cursor: "pointer" }}><div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}><div className="case-glow" aria-hidden="true" style={{ position: "absolute", inset: "10%", borderRadius: "50%", background: "radial-gradient(circle, rgba(243, 211, 142, 0.6), rgba(243, 211, 142, 0) 70%)" }}></div><img className="case-hop" src="/landing/case-legendary.webp" alt="Легендарный кейс" style={{ position: "relative", width: "100%" }} /></div><p style={{ margin: "0", fontWeight: "800", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", color: "#F3D38E" }}>Легендарный</p></div>
      </div>
      <p style={{ margin: "0", color: "#A9BEC4", fontSize: "18px", maxWidth: "640px" }}>Внутри то, что вы решите: бонусы, бесплатные часы, деньги на баланс или свой приз. Награда ждёт в кошельке 30 дней и возвращает гостя за собой.</p>
      </div>
      </section>

      <section aria-label="Экраны гостя" style={{ padding: "96px 24px", borderTop: "1px solid #12232B" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "64px", alignItems: "center" }}>
      <div style={{ flex: "1 1 420px", minWidth: "0", position: "relative", display: "flex", justifyContent: "center", gap: "22px" }}>
      <div className="glow-pulse" aria-hidden="true" style={{ position: "absolute", inset: "5% 0", background: "radial-gradient(circle, rgba(131, 228, 236, 0.25), rgba(131, 228, 236, 0) 70%)" }}></div>
      <img className="float-a" src="/landing/screen-cases.webp" alt="Экран гостя: кейсы" style={{ position: "relative", width: "min(46%, 250px)", aspectRatio: "1 / 2", objectFit: "cover", objectPosition: "top", border: "2px solid #2A4450", borderRadius: "34px", boxShadow: "0 40px 80px rgba(0, 0, 0, 0.6)", marginTop: "60px" }} />
      <img className="float-b" src="/landing/screen-tasks.webp" alt="Экран гостя: награды, чекин и задания" style={{ position: "relative", width: "min(46%, 250px)", aspectRatio: "1 / 2", objectFit: "cover", objectPosition: "top", border: "2px solid #2A4450", borderRadius: "34px", boxShadow: "0 40px 80px rgba(0, 0, 0, 0.6)" }} />
      </div>
      <div style={{ flex: "1 1 460px", minWidth: "0", display: "flex", flexDirection: "column", gap: "26px" }}>
      <h2 style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "clamp(28px, 3.6vw, 44px)", lineHeight: "1.15" }}>Открыл в Telegram. И уже играет</h2>
      <p style={{ margin: "0", color: "#A9BEC4", fontSize: "18px" }}>Никаких приложений. Гость открывает игру в Telegram или в браузере, входит через Telegram или бесплатный звонок и видит игру с логотипом вашего клуба.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <p style={{ margin: "0", display: "flex", gap: "14px", alignItems: "center", fontSize: "17px" }}><span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "10px", background: "#12232B", color: "#83E4EC", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>Задания ведут в пустые часы и в бар</p>
      <p style={{ margin: "0", display: "flex", gap: "14px", alignItems: "center", fontSize: "17px" }}><span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "10px", background: "#12232B", color: "#83E4EC", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" }}>2</span>Прогресс засчитывается сам, по данным Langame</p>
      <p style={{ margin: "0", display: "flex", gap: "14px", alignItems: "center", fontSize: "17px" }}><span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "10px", background: "#12232B", color: "#83E4EC", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" }}>3</span>Бонусы падают на счёт гостя в Langame</p>
      </div>
      </div>
      </div>
      </section>

      <section className="bg-builder" aria-label="Гибкая настройка" style={{ padding: "96px 24px" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "36px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "760px" }}>
      <p style={{ margin: "0", fontSize: "13px", fontWeight: "800", letterSpacing: "3px", textTransform: "uppercase", color: "#D0AA6C" }}>Гибкая настройка</p>
      <h2 style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "clamp(28px, 3.6vw, 44px)", lineHeight: "1.15" }}>Любая идея клуба становится сценарием</h2>
      <p style={{ margin: "0", color: "#C9DADE", fontSize: "18px" }}>Соберите задание из блоков в визуальном конструкторе, без программиста.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "16px" }}>
      <div style={{ background: "rgba(13, 26, 33, 0.85)", border: "1px solid #1E313A", borderRadius: "20px", padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}><p style={{ margin: "0", fontSize: "13px", fontWeight: "800", letterSpacing: "1.5px", textTransform: "uppercase", color: "#83E4EC" }}>Что засчитываем</p><div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "14px" }}><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Игровое время</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Чекин</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Бар</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Пополнение</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Дни подряд</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Друг</span></div></div>
      <div style={{ background: "rgba(13, 26, 33, 0.85)", border: "1px solid #1E313A", borderRadius: "20px", padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}><p style={{ margin: "0", fontSize: "13px", fontWeight: "800", letterSpacing: "1.5px", textTransform: "uppercase", color: "#83E4EC" }}>Когда и кому</p><div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "14px" }}><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Утро будней</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Ночь</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>День рождения</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Новички</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>VIP</span></div></div>
      <div style={{ background: "rgba(13, 26, 33, 0.85)", border: "1px solid #1E313A", borderRadius: "20px", padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}><p style={{ margin: "0", fontSize: "13px", fontWeight: "800", letterSpacing: "1.5px", textTransform: "uppercase", color: "#D0AA6C" }}>Награда и бюджет</p><div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "14px" }}><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Кейс</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Часы</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Бонусы</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Свой приз</span><span style={{ background: "#16272F", padding: "6px 12px", borderRadius: "999px" }}>Лимиты</span></div></div>
      </div>
      <p style={{ margin: "0", padding: "20px 24px", background: "rgba(131, 228, 236, 0.08)", border: "1px solid rgba(131, 228, 236, 0.3)", borderRadius: "18px", fontSize: "18px", color: "#E8F4F5" }}>Например: <b style={{ color: "#83E4EC" }}>«в будни с 10 до 14 новичкам кейс за 2 часа игры, не больше одного в день»</b>.</p>
      </div>
      </section>

      <section id="effect" style={{ position: "relative", overflow: "hidden", padding: "110px 24px", background: "radial-gradient(ellipse 70% 80% at 25% 50%, #0F2E35 0%, #08161C 55%, #050B10 100%)" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "64px", alignItems: "center" }}>
      <div style={{ flex: "1 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "24px" }}>
      <p style={{ margin: "0", fontSize: "13px", fontWeight: "800", letterSpacing: "3px", textTransform: "uppercase", color: "#D0AA6C" }}>Главное отличие</p>
      <h2 style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "800", fontSize: "clamp(30px, 4vw, 50px)", lineHeight: "1.1" }}>Эмоции гостя. <span style={{ color: "#83E4EC" }}>Цифры для вас.</span></h2>
      <p style={{ margin: "0", color: "#C9DADE", fontSize: "19px" }}>Часть гостей не видит задание, и мы честно сравниваем: ходят ли игроки чаще и тратят ли больше. Через 28 дней вы оставляете то, что окупается.</p>
      </div>
      <div style={{ flex: "1 1 460px", minWidth: "0", background: "rgba(13, 26, 33, 0.9)", border: "1px solid #2A5A62", borderRadius: "28px", padding: "36px", display: "flex", flexDirection: "column", gap: "26px", boxShadow: "0 40px 100px rgba(0, 0, 0, 0.5)" }}>
      <p style={{ margin: "0", fontSize: "13px", fontWeight: "800", letterSpacing: "2px", textTransform: "uppercase", color: "#D0AA6C" }}>Пилот · сеть из 4 клубов · 28 дней</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontWeight: "700" }}>Дни визитов, игроки</span><span style={{ fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "34px", color: "#83E4EC" }}>+1,8</span></div>
      <div style={{ height: "14px", borderRadius: "999px", background: "#12232B", overflow: "hidden" }}><div className="bar-grow" style={{ height: "100%", width: "88%", background: "linear-gradient(90deg, #83E4EC, #E8FCFF)", boxShadow: "0 0 18px rgba(131, 228, 236, 0.7)" }}></div></div>
      <div style={{ height: "14px", borderRadius: "999px", background: "#12232B", overflow: "hidden" }}><div className="bar-grow2" style={{ height: "100%", width: "52%", background: "#3C5A63" }}></div></div>
      <p style={{ margin: "0", fontSize: "14px", color: "#8EA6AD" }}>Верхняя полоса: игроки. Нижняя: похожие гости без игры.</p>
      </div>
      <div style={{ height: "1px", background: "#1E313A" }}></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "16px" }}><span style={{ fontWeight: "700" }}>Траты гостя в клубе и баре</span><span style={{ fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "34px", color: "#D0AA6C", whiteSpace: "nowrap" }}>+665 ₽</span></div>
      <p style={{ margin: "0", fontSize: "14px", color: "#8EA6AD" }}>402 игрока, октябрь 2026, в сравнении с похожими гостями. Вкладка «Эффект» есть по сети, по клубу и по каждому сценарию.</p>
      </div>
      </div>
      </section>

      <section id="owner" className="bg-owner" style={{ padding: "110px 24px" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "48px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "48px", alignItems: "center" }}>
      <div style={{ flex: "1 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "18px" }}>
      <p style={{ margin: "0", fontSize: "13px", fontWeight: "800", letterSpacing: "3px", textTransform: "uppercase", color: "#D0AA6C" }}>Для владельца сети</p>
      <h2 style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "clamp(28px, 3.6vw, 46px)", lineHeight: "1.12" }}>Утро начинается со спокойствия, а не с обзвона управляющих</h2>
      <p style={{ margin: "0", color: "#C9DADE", fontSize: "18px" }}>Отчёт за сутки приходит в Telegram с разбором от ИИ. Гости, бар и смены всех клубов собраны в одном кабинете.</p>
      </div>
      <div style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "12px", maxWidth: "460px" }}>
      <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "#A9BEC4" }}><span style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#12232B", display: "flex", alignItems: "center", justifyContent: "center" }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 96 96"><g fill="#83E4EC"><path d="M6 32 30 8H52V22H38V40H22V54H6Z M58 8H82L90 16V40H58Z"></path><path d="M6 32 30 8H52V22H38V40H22V54H6Z M58 8H82L90 16V40H58Z" transform="rotate(180 48 48)"></path></g></svg></span>Бот «Отчёт за сутки» · 10:00</div>
      <div className="toast-in" style={{ background: "#12232B", border: "1px solid #1E313A", borderRadius: "18px 18px 18px 6px", padding: "16px 18px", fontSize: "15px", lineHeight: "1.5" }}><b>Клуб на Ленина, вчера</b><br />Выручка выше среднего недели. Бар просел вечером: закончились энергетики. 3 постоянных гостя не приходят 10 дней.</div>
      <div className="toast-in2" style={{ background: "#12232B", border: "1px solid #1E313A", borderRadius: "18px 18px 18px 6px", padding: "16px 18px", fontSize: "15px", lineHeight: "1.5" }}><b>Что сделать сегодня</b><br />Дозаказать энергетики. Отправить троим гостям задание «Вернись за кейсом».</div>
      <div className="typing" aria-hidden="true" style={{ alignSelf: "flex-start", background: "#12232B", borderRadius: "14px", padding: "10px 14px" }}><span></span><span></span><span></span></div>
      </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "18px" }}>
      <div style={{ background: "rgba(13, 26, 33, 0.88)", backdropFilter: "blur(6px)", border: "1px solid #1E313A", borderRadius: "22px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}><p style={{ margin: "0", fontSize: "13px", fontWeight: "800", letterSpacing: "2px", textTransform: "uppercase", color: "#83E4EC" }}>CRM</p><h3 style={{ margin: "0", fontSize: "21px", fontWeight: "800" }}>Постоянные не уходят молча</h3><p style={{ margin: "0", color: "#A9BEC4", fontSize: "16px" }}>VIP перестал ходить, новичок не вернулся, бонусы лежат без дела. Видно, сколько денег под риском и кого вернуть.</p></div>
      <div style={{ background: "rgba(13, 26, 33, 0.88)", backdropFilter: "blur(6px)", border: "1px solid #1E313A", borderRadius: "22px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}><p style={{ margin: "0", fontSize: "13px", fontWeight: "800", letterSpacing: "2px", textTransform: "uppercase", color: "#D0AA6C" }}>Аналитика и бар</p><h3 style={{ margin: "0", fontSize: "21px", fontWeight: "800" }}>Пустая полка видна до того, как гость уйдёт</h3><p style={{ margin: "0", color: "#A9BEC4", fontSize: "16px" }}>Дашборд сети, упущенная прибыль, заказ товаров и ABC без ручных таблиц.</p></div>
      <div style={{ background: "rgba(13, 26, 33, 0.88)", backdropFilter: "blur(6px)", border: "1px solid #1E313A", borderRadius: "22px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}><p style={{ margin: "0", fontSize: "13px", fontWeight: "800", letterSpacing: "2px", textTransform: "uppercase", color: "#83E4EC" }}>Персонал</p><h3 style={{ margin: "0", fontSize: "21px", fontWeight: "800" }}>Клуб работает по стандарту без вас</h3><p style={{ margin: "0", color: "#A9BEC4", fontSize: "16px" }}>Чек-листы с фото, обучение, рейтинг администраторов и премии за результат.</p></div>
      </div>
      </div>
      </section>

      <LandingPricing />

      <LandingStart />

      <footer style={{ padding: "40px 24px", borderTop: "1px solid #12232B", background: "#050B10" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "24px 40px", alignItems: "center", justifyContent: "space-between", fontSize: "14px", color: "#8EA6AD" }}>
      <img src="/landing/logo.svg" alt="LeetPlus" style={{ height: "24px", width: "auto" }} />
      <p style={{ margin: "0" }}>Оператор сайта ООО «ЛИТ» · ОГРН 1231800017063 · ИНН 1800006677 · КПП 180001001</p>
      <nav aria-label="Ссылки в подвале" style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}><Link href={cabinetHref} style={{ color: "#A9BEC4" }}>Кабинет клуба</Link><Link href={gameHref} style={{ color: "#A9BEC4" }}>Играть в клубе</Link></nav>
      </div>
      </footer>
    </div>
  );
}
