/**
 * Club-local time for dashboards. Facts are bucketed by the club's calendar
 * day and hour: the UTC calendar would move night sales (00:00–05:00 in
 * Yekaterinburg) to the previous day, away from the club's visits and the
 * daily source coverage.
 */

const QUERY_MARGIN_MS = 14 * 60 * 60 * 1000;

/** Instants that can fall on the calendar days `from`..`to` of any zone. */
export function clubDayQueryWindow(from: Date, to: Date) {
  return {
    gte: new Date(from.getTime() - QUERY_MARGIN_MS),
    lte: new Date(to.getTime() + QUERY_MARGIN_MS),
  };
}

/**
 * The club's wall-clock time of an instant, placed on the UTC axis: UTC
 * getters and UTC day boundaries then read the club's calendar.
 */
export function clubWallClock(
  value: Date,
  timeZone: string,
  formatters: Map<string, Intl.DateTimeFormat>,
) {
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
  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      value.getUTCMilliseconds(),
    ),
  );
}

/**
 * Time zone of a fact: its club, else the shared zone of its external domain,
 * else the tenant's single zone, else UTC.
 */
export function clubTimeZoneResolver(
  stores: ReadonlyArray<{
    id: string;
    externalDomain?: string | null;
    timeZone?: string | null;
  }>,
) {
  const byStore = new Map(
    stores.map((store) => [store.id, store.timeZone?.trim() || 'UTC']),
  );
  const byDomain = new Map<string, string | null>();
  stores.forEach((store) => {
    if (!store.externalDomain) return;
    const zone = byStore.get(store.id)!;
    const known = byDomain.get(store.externalDomain);
    byDomain.set(
      store.externalDomain,
      known === undefined || known === zone ? zone : null,
    );
  });
  const zones = new Set(byStore.values());
  const tenantZone = zones.size === 1 ? [...zones][0] : 'UTC';
  return (storeId?: string | null, domain?: string | null) =>
    (storeId ? byStore.get(storeId) : undefined) ??
    (domain ? byDomain.get(domain) : undefined) ??
    tenantZone;
}

/**
 * Rows whose `key` instant falls on the club-local days of `window`, with
 * `key` replaced by the club's wall-clock time. `source` returns the stored
 * row for freshness checks that need the real instant.
 */
export function onClubDays<T extends object, K extends keyof T>(
  rows: readonly T[],
  key: K,
  zoneOf: (row: NoInfer<T>) => string,
  window: { from: Date; to: Date },
  formatters: Map<string, Intl.DateTimeFormat>,
) {
  const sources = new Map<T, T>();
  const local: T[] = [];
  rows.forEach((row) => {
    const at = row[key] as unknown as Date | null | undefined;
    if (!at || typeof at.getTime !== 'function') return;
    const clock = clubWallClock(at, zoneOf(row), formatters);
    if (clock < window.from || clock > window.to) return;
    const shifted = { ...row, [key]: clock };
    sources.set(shifted, row);
    local.push(shifted);
  });
  return {
    rows: local,
    source: (row: T) => sources.get(row) ?? row,
  };
}
