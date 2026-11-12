import { LANDING_GOALS, SALES_EMAIL, SALES_PHONE } from "@/components/landing/landing-config";

/**
 * Telegram account that receives club-owner requests from the homepage.
 * Change it here only: the CTA link and the visible handle both use it.
 */
export const SALES_TELEGRAM_USERNAME = "leetorigin";

const SALES_GREETING =
  "Здравствуйте! Хочу подключить игровой модуль LeetPlus (2 месяца бесплатно).";

const salesTelegramHref = `https://t.me/${SALES_TELEGRAM_USERNAME}?text=${encodeURIComponent(SALES_GREETING)}`;

const PERKS = [
  "Игровой модуль 2 месяца бесплатно",
  "Подключение к Langame и настройку делаем сами",
  "Отчёт об эффекте через 28 дней",
] as const;

export function LandingStart() {
  return (
    <section id="start" style={{ position: "relative", overflow: "hidden", padding: "110px 24px" }}>
    <video src="/landing/case-open.mp4" poster="/landing/case-open-poster.webp" autoPlay muted loop playsInline aria-hidden="true" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", filter: "blur(12px) brightness(0.3)", transform: "scale(1.1)" }}></video>
    <div aria-hidden="true" style={{ position: "absolute", inset: "0", background: "linear-gradient(90deg, rgba(5, 11, 16, 0.85) 0%, rgba(5, 11, 16, 0.4) 60%, rgba(5, 11, 16, 0.7) 100%)" }}></div>
    <div style={{ position: "relative", maxWidth: "1160px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "56px", alignItems: "center" }}>
    <div style={{ flex: "1 1 420px", minWidth: "0", display: "flex", flexDirection: "column", gap: "28px" }}>
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
    <h2 style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "800", fontSize: "clamp(30px, 4vw, 50px)", lineHeight: "1.1" }}>Запустим игру в вашем клубе <span className="shine">уже на этой неделе</span></h2>
    <p style={{ margin: "0", color: "#C9DADE", fontSize: "18px" }}>Игровой модуль первые 2 месяца бесплатно. Вы ничего не настраиваете сами.</p>
    </div>
    <ol style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "0" }}>
    <li style={{ display: "flex", gap: "16px" }}><div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><span style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#83E4EC", color: "#050B10", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" }}>1</span><span style={{ flex: "1", width: "2px", minHeight: "22px", background: "linear-gradient(#83E4EC, #2A4450)" }}></span></div><div style={{ padding: "6px 0 22px" }}><p style={{ margin: "0", fontWeight: "800", fontSize: "17px" }}>Короткий созвон</p><p style={{ margin: "4px 0 0", color: "#A9BEC4", fontSize: "15px" }}>Узнаём, сколько ПК, какие гости и что хочется поменять</p></div></li>
    <li style={{ display: "flex", gap: "16px" }}><div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><span style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#12232B", border: "1px solid #83E4EC", color: "#83E4EC", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" }}>2</span><span style={{ flex: "1", width: "2px", minHeight: "22px", background: "#2A4450" }}></span></div><div style={{ padding: "6px 0 22px" }}><p style={{ margin: "0", fontWeight: "800", fontSize: "17px" }}>Подключаем Langame и настраиваем</p><p style={{ margin: "4px 0 0", color: "#A9BEC4", fontSize: "15px" }}>Первые сценарии, логотип клуба, призы под ваш бар</p></div></li>
    <li style={{ display: "flex", gap: "16px" }}><div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><span style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#12232B", border: "1px solid #D0AA6C", color: "#F3D38E", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" }}>3</span></div><div style={{ padding: "6px 0 0" }}><p style={{ margin: "0", fontWeight: "800", fontSize: "17px" }}>Через 28 дней показываем эффект</p><p style={{ margin: "4px 0 0", color: "#A9BEC4", fontSize: "15px" }}>Отчёт «Эффект игры»: визиты и выручка игроков против контрольной группы</p></div></li>
    </ol>
    </div>

    <div style={{ flex: "1 1 460px", minWidth: "0", position: "relative", background: "linear-gradient(160deg, rgba(18, 35, 43, 0.92) 0%, rgba(8, 17, 22, 0.94) 100%)", backdropFilter: "blur(14px)", border: "1px solid rgba(131, 228, 236, 0.28)", borderRadius: "28px", padding: "34px", display: "flex", flexDirection: "column", gap: "24px", boxShadow: "0 40px 120px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
    <p style={{ margin: "0", fontFamily: "var(--lpl-display)", fontWeight: "700", fontSize: "22px" }}>Подключить клуб</p>
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "800", color: "#050B10", background: "#F3D38E", padding: "6px 12px", borderRadius: "999px" }}>2 месяца бесплатно</span>
    </div>
    <p style={{ margin: "0", color: "#C9DADE", fontSize: "17px", lineHeight: "1.5" }}>Напишите нам в Telegram: сколько у вас клубов и ПК, и что интересно. Ответим в рабочее время и договоримся о созвоне.</p>
    <ul style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
    {PERKS.map((perk) => (
      <li key={perk} style={{ display: "flex", gap: "12px", alignItems: "center", fontSize: "16px", fontWeight: "700" }}><span aria-hidden="true" style={{ flex: "none", width: "26px", height: "26px", borderRadius: "8px", background: "rgba(131, 228, 236, 0.12)", border: "1px solid rgba(131, 228, 236, 0.4)", color: "#83E4EC", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>✓</span>{perk}</li>
    ))}
    </ul>
    <a href={salesTelegramHref} target="_blank" rel="noopener noreferrer" data-goal={LANDING_GOALS.leadTelegram} data-goal-place="start" className="lp-btn guest-cta" style={{ font: "inherit", fontWeight: "800", fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", background: "linear-gradient(90deg, #83E4EC 0%, #C6F6F9 100%)", color: "#050B10", textDecoration: "none", borderRadius: "16px", padding: "20px", minHeight: "56px", boxShadow: "0 16px 40px rgba(131, 228, 236, 0.25)" }}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M21.94 4.6 18.8 19.4c-.24 1.05-.86 1.31-1.74.82l-4.8-3.54-2.32 2.23c-.26.26-.47.47-.97.47l.35-4.9 8.92-8.06c.39-.35-.08-.54-.6-.19L6.62 13.17 1.88 11.7c-1.03-.32-1.05-1.03.22-1.53L20.6 3.04c.86-.32 1.61.19 1.34 1.56Z"></path></svg>Написать в Telegram</a>
    <p style={{ margin: "-8px 0 0", textAlign: "center", fontSize: "14px", color: "#8EA6AD" }}>или найдите в Telegram <span style={{ color: "#C9DADE", fontWeight: "700" }}>@{SALES_TELEGRAM_USERNAME}</span></p>
    {SALES_PHONE || SALES_EMAIL ? (
      <p style={{ margin: "-12px 0 0", textAlign: "center", fontSize: "15px", color: "#8EA6AD", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 16px" }}>
      <span style={{ flexBasis: "100%" }}>Нет Telegram под рукой?</span>
      {SALES_PHONE ? <a href={`tel:${SALES_PHONE.replace(/[^+\d]/g, "")}`} data-goal={LANDING_GOALS.leadPhone} data-goal-place="start" style={{ fontWeight: "700", whiteSpace: "nowrap" }}>{SALES_PHONE}</a> : null}
      {SALES_EMAIL ? <a href={`mailto:${SALES_EMAIL}`} data-goal={LANDING_GOALS.leadEmail} data-goal-place="start" style={{ fontWeight: "700", whiteSpace: "nowrap" }}>{SALES_EMAIL}</a> : null}
      </p>
    ) : null}
    </div>
    </div>
    </section>
  );
}
