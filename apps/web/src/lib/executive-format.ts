// Shared formatting for the executive dashboard. No runtime imports so the
// node:test contract suite can load it directly.

const MINUS = "−";
const weekdays = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
  })
    .format(value)
    .replace("-", MINUS);
}

export function formatMoney(value: number) {
  return `${formatNumber(value)} ₽`;
}

/** Always carries an explicit sign; negative values use the real minus. */
export function formatSigned(value: number, digits = 0, suffix = "") {
  const sign = value > 0 ? "+" : value < 0 ? MINUS : "";
  return `${sign}${formatNumber(Math.abs(value), digits)}${suffix}`;
}

function parseDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match
    ? { year: match[1], month: match[2], day: match[3] }
    : null;
}

/** "2026-09-29" → "29.09". */
export function formatDay(value: string) {
  const parts = parseDay(value);
  return parts ? `${parts.day}.${parts.month}` : value;
}

/** "2026-09-29" → "вт 29". Business dates are calendar labels, not instants. */
export function formatWeekdayDay(value: string) {
  const parts = parseDay(value);
  if (!parts) return value;
  const weekday = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return `${weekdays[weekday]} ${Number(parts.day)}`;
}

export function isWeekend(value: string) {
  if (!parseDay(value)) return false;
  const weekday = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function formatRange(from: string, to: string) {
  return from === to ? formatDay(from) : `${formatDay(from)}–${formatDay(to)}`;
}

export function periodDays(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

export function pluralRu(value: number, forms: [string, string, string]) {
  const plural = new Intl.PluralRules("ru-RU").select(value);
  return forms[plural === "one" ? 0 : plural === "few" ? 1 : 2];
}

export function formatClubs(value: number) {
  return `${formatNumber(value)} ${pluralRu(value, ["клуб", "клуба", "клубов"])}`;
}
