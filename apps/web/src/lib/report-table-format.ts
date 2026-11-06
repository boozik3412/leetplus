/** Number, money, date and CSV formatting shared by the report tables. */

export function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru"));
}

export function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatNullable(value: number | null) {
  return value === null ? "—" : formatQuantity(value);
}

export function formatInt(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    value,
  );
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

export function csvNumber(value: number) {
  return String(value).replace(".", ",");
}

export function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function shortDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}` : value;
}

/** Saves rows as a CSV that Excel opens with Cyrillic intact. */
export function downloadCsv(fileName: string, lines: string[][]) {
  const content = lines
    .map((line) => line.map(escapeCsv).join(";"))
    .join("\r\n");
  const blob = new Blob([`\ufeff${content}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
