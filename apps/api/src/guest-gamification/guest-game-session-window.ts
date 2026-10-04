// Time windows for play-time goals ("weekdays 08:00-17:00").
//
// SESSION_END (default, historical behaviour): a session counts when the
// moment it ended falls into the window, with its whole duration.
// OVERLAP: only the minutes of the session that lie inside the window count;
// the session may start before or end after it. A session is the interval
// [endedAt - minutes, endedAt]: both the live PLAY_HOUR/SESSION_STOP events and
// the ledger *_PLAY_TIME_ACCUMULATED facts are stamped with the stop time.

export type GuestGameWindowMatch = 'SESSION_END' | 'OVERLAP';

export type GuestGameWindowSpec = {
  hours: string[];
  // Empty means every day; 0 = Sunday … 6 = Saturday.
  weekdays: number[];
};

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

export function guestGameWindowMatch(
  metric: Record<string, unknown>,
  conditions: Record<string, unknown>,
): GuestGameWindowMatch {
  const value = metric.windowMatch ?? conditions.windowMatch;
  return typeof value === 'string' && value.trim().toUpperCase() === 'OVERLAP'
    ? 'OVERLAP'
    : 'SESSION_END';
}

export function guestGameWindowSpec(
  metric: Record<string, unknown>,
  conditions: Record<string, unknown>,
): GuestGameWindowSpec {
  const hours = stringValues(metric.hours ?? conditions.hours);
  const weekdayMode = stringValue(metric.weekdayMode ?? conditions.weekdayMode);
  const weekdaysOnly =
    metric.weekdaysOnly === true || conditions.weekdaysOnly === true;
  const weekdays =
    weekdayMode === 'WEEKDAYS' || weekdaysOnly
      ? [1, 2, 3, 4, 5]
      : weekdayMode === 'WEEKENDS'
        ? [0, 6]
        : numberValues(metric.weekdays ?? conditions.weekdays);
  return { hours, weekdays };
}

export function guestGameWindowIsRestricted(spec: GuestGameWindowSpec) {
  return spec.hours.length > 0 || spec.weekdays.length > 0;
}

// Minutes of [endedAt - minutes, endedAt] that fall into the window in the
// club's time zone. Sessions spanning midnight are split per local day.
export function sessionMinutesInsideWindow(input: {
  endedAt: Date;
  minutes: number;
  spec: GuestGameWindowSpec;
  timeZone?: string | null;
}) {
  const minutes = Math.max(0, input.minutes);
  const endMs = input.endedAt.getTime();
  if (!minutes || !Number.isFinite(endMs)) return 0;

  const windows = parseWindows(input.spec.hours);
  if (!windows.length) return 0;

  let cursor = endMs - minutes * MINUTE_MS;
  let insideMs = 0;
  // Each step reaches a window edge or local midnight, so even a multi-day
  // package needs only a few iterations; the guard stops pathological input.
  for (let guard = 0; cursor < endMs && guard < 1000; guard += 1) {
    const local = localParts(new Date(cursor), input.timeZone);
    const dayAllowed =
      !input.spec.weekdays.length ||
      input.spec.weekdays.includes(local.weekday);
    const minuteOfDay = local.secondOfDay / 60;
    let nextEdge = DAY_MINUTES;
    let inside = false;
    for (const [from, to] of windows) {
      if (minuteOfDay >= from && minuteOfDay < to) {
        inside = true;
        nextEdge = Math.min(nextEdge, to);
      } else if (from > minuteOfDay) {
        nextEdge = Math.min(nextEdge, from);
      }
    }
    const step = Math.min(
      endMs - cursor,
      Math.max(1000, (nextEdge * 60 - local.secondOfDay) * 1000),
    );
    if (dayAllowed && inside) insideMs += step;
    cursor += step;
  }
  return Math.round(insideMs / MINUTE_MS);
}

// "08:00-17:00" -> [[480, 1020]]; "23:59" closes the day; "22:00-02:00" wraps.
function parseWindows(hours: string[]): Array<[number, number]> {
  if (!hours.length) return [[0, DAY_MINUTES]];
  const windows: Array<[number, number]> = [];
  for (const window of hours) {
    const [fromText, toText] = window.split('-');
    const from = timeToMinutes(fromText);
    const rawTo = timeToMinutes(toText);
    if (from === null || rawTo === null) continue;
    const to = rawTo === DAY_MINUTES - 1 ? DAY_MINUTES : rawTo;
    if (from < to) {
      windows.push([from, to]);
    } else if (from > to) {
      windows.push([from, DAY_MINUTES], [0, to]);
    }
  }
  return windows;
}

function localParts(value: Date, timeZone?: string | null) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  const weekday =
    { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[
      part('weekday')
    ] ?? 0;
  return {
    weekday,
    secondOfDay:
      Number(part('hour')) * 3600 +
      Number(part('minute')) * 60 +
      Number(part('second')),
  };
}

function timeToMinutes(value: string | undefined) {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours > 23 || minutes > 59 ? null : hours * 60 + minutes;
}

function stringValues(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : typeof value === 'string' && value.trim()
      ? [value.trim()]
      : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function numberValues(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
    : [];
}
