/**
 * Club day of the daily report. Administrators close shifts at 09:00 club
 * time, so a report day runs from 09:00 of the previous calendar day to 09:00
 * of the report date in the club's own zone (Izhevsk MSK+1, Yekaterinburg
 * MSK+2), never by UTC or Moscow time.
 */

export const DEFAULT_CLUB_DAY_BOUNDARY_HOUR = 9;

export type ClubDayWindow = {
  /** `YYYY-MM-DD` of the morning when the club day closed. */
  reportDate: string;
  timeZone: string;
  from: Date;
  to: Date;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClockParts(value: Date, timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Offset of the zone from UTC at this instant, in milliseconds. */
function zoneOffsetMs(value: Date, timeZone: string) {
  const parts = wallClockParts(value, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(value.getTime() / 1000) * 1000;
}

/** The instant when the club's clock shows `date` `hour`:00. */
export function zonedWallClockToInstant(
  date: string,
  hour: number,
  timeZone: string,
) {
  const [year, month, day] = date.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  // Two passes settle zones with and without daylight saving time.
  const first = guess - zoneOffsetMs(new Date(guess), timeZone);
  const second = guess - zoneOffsetMs(new Date(first), timeZone);
  return new Date(second);
}

/**
 * The instant of a club wall-clock time that was stored as if it were UTC
 * (Langame dates of rows without a club are parsed that way).
 */
export function wallClockStoredAsUtcToInstant(value: Date, timeZone: string) {
  const guess = value.getTime();
  const first = guess - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - zoneOffsetMs(new Date(first), timeZone));
}

/** Club-local calendar date `YYYY-MM-DD` of an instant. */
export function localDate(value: Date, timeZone: string) {
  const parts = wallClockParts(value, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** Club-local `HH:MM` of an instant. */
export function localTime(value: Date, timeZone: string) {
  const parts = wallClockParts(value, timeZone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** The club day that closed at `boundaryHour`:00 on `reportDate`. */
export function clubDayWindow(
  reportDate: string,
  timeZone: string,
  boundaryHour = DEFAULT_CLUB_DAY_BOUNDARY_HOUR,
): ClubDayWindow {
  return {
    reportDate,
    timeZone,
    from: zonedWallClockToInstant(
      shiftDate(reportDate, -1),
      boundaryHour,
      timeZone,
    ),
    to: zonedWallClockToInstant(reportDate, boundaryHour, timeZone),
  };
}

/**
 * The latest club day closed at `now`; before 09:00 club time it is the day
 * that closed yesterday morning.
 */
export function lastClosedClubDay(
  now: Date,
  timeZone: string,
  boundaryHour = DEFAULT_CLUB_DAY_BOUNDARY_HOUR,
) {
  const today = localDate(now, timeZone);
  const todayWindow = clubDayWindow(today, timeZone, boundaryHour);
  return now.getTime() >= todayWindow.to.getTime()
    ? todayWindow
    : clubDayWindow(shiftDate(today, -1), timeZone, boundaryHour);
}
