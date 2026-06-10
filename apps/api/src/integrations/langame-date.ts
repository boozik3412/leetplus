const DEFAULT_LANGAME_TIME_ZONE = 'UTC';

type LangameDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  hasTime: boolean;
};

export function parseLangameDate(
  value: string | null | undefined,
  timeZone: string | null | undefined = DEFAULT_LANGAME_TIME_ZONE,
) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.startsWith('0000-00-00')) {
    return null;
  }

  const parts = parseLangameDateParts(trimmed);

  if (parts) {
    if (!parts.hasTime) {
      return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    }

    return zonedTimeToUtc(parts, timeZone);
  }

  const normalized = trimmed.includes('T')
    ? trimmed
    : trimmed.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseLangameDateParts(value: string): LangameDateParts | null {
  const ruDate =
    /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      value,
    );

  if (ruDate) {
    return {
      day: Number(ruDate[1]),
      month: Number(ruDate[2]),
      year: Number(ruDate[3]),
      hour: Number(ruDate[4] ?? 0),
      minute: Number(ruDate[5] ?? 0),
      second: Number(ruDate[6] ?? 0),
      hasTime: Boolean(ruDate[4]),
    };
  }

  const isoDate =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      value,
    );

  if (isoDate) {
    return {
      year: Number(isoDate[1]),
      month: Number(isoDate[2]),
      day: Number(isoDate[3]),
      hour: Number(isoDate[4] ?? 0),
      minute: Number(isoDate[5] ?? 0),
      second: Number(isoDate[6] ?? 0),
      hasTime: Boolean(isoDate[4]),
    };
  }

  return null;
}

function zonedTimeToUtc(
  parts: LangameDateParts,
  timeZone: string | null | undefined,
) {
  const utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offsetMs = timeZoneOffsetMs(new Date(utcMs), timeZone);
  const firstPass = new Date(utcMs - offsetMs);
  const refinedOffsetMs = timeZoneOffsetMs(firstPass, timeZone);

  return new Date(utcMs - refinedOffsetMs);
}

function timeZoneOffsetMs(date: Date, timeZone: string | null | undefined) {
  const normalizedTimeZone = timeZone?.trim() || DEFAULT_LANGAME_TIME_ZONE;
  const fixedOffset = fixedUtcOffsetMs(normalizedTimeZone);

  if (fixedOffset !== null) {
    return fixedOffset;
  }

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: normalizedTimeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);
    const valueByType = new Map(parts.map((part) => [part.type, part.value]));
    const asUtcMs = Date.UTC(
      Number(valueByType.get('year')),
      Number(valueByType.get('month')) - 1,
      Number(valueByType.get('day')),
      Number(valueByType.get('hour')),
      Number(valueByType.get('minute')),
      Number(valueByType.get('second')),
    );

    return asUtcMs - date.getTime();
  } catch {
    return 0;
  }
}

function fixedUtcOffsetMs(timeZone: string) {
  const match = /^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(
    timeZone.replace(/\s+/g, ''),
  );

  if (!match) {
    return null;
  }

  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);

  return sign * (hours * 60 + minutes) * 60 * 1000;
}
