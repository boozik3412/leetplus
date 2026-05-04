type TrendPeriodSegment = {
  label: string;
  from: string;
  to: string;
};

export function formatTrendPeriodLabel(
  row: TrendPeriodSegment,
  period: string,
) {
  if (period === "day") {
    return formatShortDate(row.from);
  }

  if (period === "week") {
    const week = getIsoWeek(parseDateInput(row.from));

    return week === null ? row.label : `Н${week}`;
  }

  return row.label;
}

export function formatTrendPeriodTitle(
  row: TrendPeriodSegment,
  period: string,
) {
  if (period === "day") {
    const weekday = formatWeekday(row.from);
    const date = formatShortDate(row.from);

    return weekday ? `${weekday}, ${date}` : date;
  }

  if (period === "week") {
    const week = getIsoWeek(parseDateInput(row.from));

    if (week === null) {
      return row.label;
    }

    return `${week} неделя с ${formatShortDate(row.from)} по ${formatShortDate(
      row.to,
    )}`;
  }

  return row.label;
}

function formatShortDate(value: string) {
  const date = parseDateInput(value);

  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function formatWeekday(value: string) {
  const date = parseDateInput(value);

  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
}

function getIsoWeek(date: Date | null) {
  if (!date) {
    return null;
  }

  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));

  return Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}
