const rubFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 1,
});

/** `45 300 ₽` with a narrow no-break space as the thousands separator. */
export function formatRub(value: number) {
  return `${rubFormatter.format(Math.round(value))} ₽`;
}

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

/** `+12%` / `−8%`; `null` stays empty. */
export function formatChange(change: number | null) {
  if (change === null || !Number.isFinite(change)) return '';
  const percent = Math.round(change * 100);
  if (percent === 0) return '±0%';
  return percent > 0 ? `+${percent}%` : `−${Math.abs(percent)}%`;
}

export function formatPercent(share: number) {
  return `${Math.round(share * 100)}%`;
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}
