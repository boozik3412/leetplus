/**
 * Settings of the public homepage that the owner fills in by hand.
 * Everything here is public anyway (it is shown or loaded on the page).
 */

/**
 * Yandex.Metrika counter for leetplus.ru. `null` keeps analytics off:
 * no script is loaded and click goals are ignored. The counter is loaded on
 * the homepage only, never in the guest game or the club cabinet.
 * Before turning it on, the homepage must link a personal-data policy.
 */
export const YANDEX_METRIKA_COUNTER_ID: number | null = null;

/**
 * Fallback contacts for club owners without Telegram at hand.
 * `null` hides the line. Phone in the form shown to people, e.g. "+7 900 000-00-00".
 */
export const SALES_PHONE: string | null = null;
export const SALES_EMAIL: string | null = null;

/** Metrika goals sent from the homepage (configure the same ids in Metrika). */
export const LANDING_GOALS = {
  /** Any button that leads to the «Подключить клуб» block. */
  startCta: "lp_start_cta",
  /** «Написать в Telegram» to the sales account. */
  leadTelegram: "lp_lead_telegram",
  leadPhone: "lp_lead_phone",
  leadEmail: "lp_lead_email",
  /** The visitor reached the pricing / the «Подключить клуб» block. */
  viewPricing: "lp_view_pricing",
  viewStart: "lp_view_start",
  /** Guest and staff exits, counted apart from owner leads. */
  guestPlay: "lp_guest_play",
  cabinet: "lp_cabinet",
} as const;
