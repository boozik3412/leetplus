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

/** `▲ 12%` / `▼ 8%` against the usual day; `null` stays empty. */
export function formatArrow(change: number | null) {
  if (change === null || !Number.isFinite(change)) return '';
  const percent = Math.round(change * 100);
  if (percent === 0) return '±0%';
  return percent > 0 ? `▲ ${percent}%` : `▼ ${Math.abs(percent)}%`;
}

/** Russian plural: `pluralRu(3, ['гость', 'гостя', 'гостей'])` → `гостя`. */
export function pluralRu(count: number, forms: [string, string, string]) {
  const whole = Math.abs(Math.trunc(count));
  const tens = whole % 100;
  const ones = whole % 10;
  if (tens >= 11 && tens <= 14) return forms[2];
  if (ones === 1) return forms[0];
  if (ones >= 2 && ones <= 4) return forms[1];
  return forms[2];
}

/**
 * `Семенова Анастасия Анатольевна` → `Семенова А.`. Only a name of two or
 * three capitalised words is shortened; `Администратор не определён` stays.
 */
export function shortPersonName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2 || parts.length > 3) return name.trim();
  if (!parts.every((part) => /^[A-ZА-ЯЁ]/.test(part))) return name.trim();
  return `${parts[0]} ${parts[1][0]}.`;
}

const PRODUCT_KIND =
  /^(?:энергетический напиток|газированный напиток|негазированный напиток|негазированная вода|газированная вода|питьевая вода|напиток)\s+/i;
const END = '(?=$|[\\s,;)])';

/**
 * `Энергетический напиток BURN Гуава 500мл ж/б` → `BURN Гуава 0,5 л`. A
 * placeholder of a product missing from the Langame catalogue says so.
 */
export function shortProductName(name: string) {
  const placeholder = /^Langame product #(\S+)$/.exec(name.trim());
  if (placeholder) {
    return `Товар #${placeholder[1]} (нет в каталоге Langame)`;
  }
  return name
    .replace(PRODUCT_KIND, '')
    .replace(new RegExp(`\\s*(?:ж/б|ст/б|ПЭТ|пэт)${END}`, 'g'), '')
    .replace(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*мл${END}`, 'g'), (_, ml) => {
      const liters = Number(String(ml).replace(',', '.')) / 1000;
      return `${String(liters).replace('.', ',')} л`;
    })
    .replace(
      new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(л|г|кг)${END}`, 'g'),
      (_, amount: string, unit: string) =>
        `${amount.replace('.', ',')} ${unit}`,
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}
