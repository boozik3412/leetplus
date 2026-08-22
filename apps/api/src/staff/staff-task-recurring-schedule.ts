import { BadRequestException } from '@nestjs/common';
import { parseLangameDate } from '../integrations/langame-date';
import { normalizeStoreTimeZone } from '../stores/store-timezones';

export type StaffTaskRecurringScheduleInput = {
  status: string;
  cadence: string;
  timeOfDay: string | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
};

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

type ZonedDateTimeParts = CalendarDate & {
  hour: number;
  minute: number;
  second: number;
};

export function resolveStaffTaskRecurringNextRunAt(
  input: StaffTaskRecurringScheduleInput,
  from = new Date(),
  storeTimeZone?: string | null,
) {
  if (input.status !== 'ACTIVE') {
    return null;
  }

  const timeZone = normalizeStoreTimeZone(null, storeTimeZone) ?? 'UTC';
  const { hours, minutes } = resolveScheduleTime(
    input.cadence,
    input.timeOfDay,
  );
  const localFrom = zonedDateTimeParts(from, timeZone);

  if (
    input.cadence === 'DAILY' ||
    input.cadence === 'OPENING_SHIFT' ||
    input.cadence === 'CLOSING_SHIFT'
  ) {
    return nextDaily(from, localFrom, hours, minutes, timeZone);
  }

  if (input.cadence === 'WEEKLY') {
    return nextWeekly(
      from,
      localFrom,
      hours,
      minutes,
      input.dayOfWeek ?? 1,
      timeZone,
    );
  }

  if (input.cadence === 'MONTHLY') {
    return nextMonthly(
      from,
      localFrom,
      hours,
      minutes,
      input.dayOfMonth ?? 1,
      timeZone,
    );
  }

  return nextDaily(from, localFrom, hours, minutes, timeZone);
}

function resolveScheduleTime(cadence: string, value: string | null) {
  const fallback =
    cadence === 'OPENING_SHIFT'
      ? '09:00'
      : cadence === 'CLOSING_SHIFT'
        ? '23:00'
        : '10:00';
  const [hours, minutes] = (value ?? fallback)
    .split(':')
    .map((part) => Number.parseInt(part, 10));

  return {
    hours: Number.isFinite(hours) ? hours : 10,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
}

function nextDaily(
  from: Date,
  localFrom: ZonedDateTimeParts,
  hours: number,
  minutes: number,
  timeZone: string,
) {
  const today = calendarDate(localFrom);
  const todayCandidate = firstZonedInstantAfter(
    today,
    hours,
    minutes,
    timeZone,
    from,
  );

  return (
    todayCandidate ??
    requiredZonedInstant(
      addCalendarDays(today, 1),
      hours,
      minutes,
      timeZone,
      from,
    )
  );
}

function nextWeekly(
  from: Date,
  localFrom: ZonedDateTimeParts,
  hours: number,
  minutes: number,
  dayOfWeek: number,
  timeZone: string,
) {
  const today = calendarDate(localFrom);
  const jsTargetDay = dayOfWeek % 7;
  const daysAhead = (jsTargetDay - calendarDayOfWeek(today) + 7) % 7;
  const candidateDate = addCalendarDays(today, daysAhead);
  const candidate = firstZonedInstantAfter(
    candidateDate,
    hours,
    minutes,
    timeZone,
    from,
  );

  return (
    candidate ??
    requiredZonedInstant(
      addCalendarDays(candidateDate, 7),
      hours,
      minutes,
      timeZone,
      from,
    )
  );
}

function nextMonthly(
  from: Date,
  localFrom: ZonedDateTimeParts,
  hours: number,
  minutes: number,
  dayOfMonth: number,
  timeZone: string,
) {
  const candidateDate = monthlyCalendarDate(
    localFrom.year,
    localFrom.month,
    dayOfMonth,
  );
  const candidate = firstZonedInstantAfter(
    candidateDate,
    hours,
    minutes,
    timeZone,
    from,
  );

  if (candidate) {
    return candidate;
  }

  const nextMonth = new Date(Date.UTC(localFrom.year, localFrom.month, 1));

  return requiredZonedInstant(
    monthlyCalendarDate(
      nextMonth.getUTCFullYear(),
      nextMonth.getUTCMonth() + 1,
      dayOfMonth,
    ),
    hours,
    minutes,
    timeZone,
    from,
  );
}

function monthlyCalendarDate(
  year: number,
  month: number,
  dayOfMonth: number,
) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    year,
    month,
    day: Math.min(Math.max(dayOfMonth, 1), lastDay),
  };
}

function firstZonedInstantAfter(
  date: CalendarDate,
  hours: number,
  minutes: number,
  timeZone: string,
  after: Date,
) {
  return (
    zonedInstants(date, hours, minutes, timeZone).find(
      (candidate) => candidate > after,
    ) ?? null
  );
}

function requiredZonedInstant(
  date: CalendarDate,
  hours: number,
  minutes: number,
  timeZone: string,
  after: Date,
) {
  const candidate = firstZonedInstantAfter(
    date,
    hours,
    minutes,
    timeZone,
    after,
  );

  if (!candidate) {
    throw new BadRequestException('Unable to resolve recurring rule schedule');
  }

  return candidate;
}

function zonedInstants(
  date: CalendarDate,
  hours: number,
  minutes: number,
  timeZone: string,
) {
  const localIso = `${String(date.year).padStart(4, '0')}-${String(
    date.month,
  ).padStart(2, '0')}-${String(date.day).padStart(2, '0')} ${String(
    hours,
  ).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  const desiredWallTime = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    hours,
    minutes,
  );
  const baseline = parseLangameDate(localIso, timeZone);
  const probes = [-36, -18, 0, 18, 36].map(
    (hourOffset) => desiredWallTime + hourOffset * 60 * 60 * 1_000,
  );
  const offsets = new Set(
    probes.map((probe) => timeZoneOffsetMs(new Date(probe), timeZone)),
  );
  const candidates = new Map<number, Date>();

  if (baseline) {
    candidates.set(baseline.getTime(), baseline);
  }

  for (const offset of offsets) {
    const candidate = new Date(desiredWallTime - offset);
    candidates.set(candidate.getTime(), candidate);
  }

  const exact = Array.from(candidates.values())
    .filter((candidate) =>
      matchesZonedDateTime(candidate, date, hours, minutes, timeZone),
    )
    .sort((left, right) => left.getTime() - right.getTime());

  if (exact.length > 0) {
    // A repeated wall-clock time during the DST fall-back represents one
    // business occurrence. Always use the earliest instant so a rule cannot
    // run twice for the same local schedule slot.
    return exact.slice(0, 1);
  }

  const shiftedForward = Array.from(candidates.values())
    .map((candidate) => ({
      candidate,
      parts: zonedDateTimeParts(candidate, timeZone),
    }))
    .filter(
      ({ parts }) =>
        parts.year === date.year &&
        parts.month === date.month &&
        parts.day === date.day,
    )
    .map(({ candidate, parts }) => ({
      candidate,
      wallDelta:
        Date.UTC(
          parts.year,
          parts.month - 1,
          parts.day,
          parts.hour,
          parts.minute,
        ) - desiredWallTime,
    }))
    .filter(({ wallDelta }) => wallDelta > 0)
    .sort(
      (left, right) =>
        left.wallDelta - right.wallDelta ||
        left.candidate.getTime() - right.candidate.getTime(),
    );

  return shiftedForward[0] ? [shiftedForward[0].candidate] : [];
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = zonedDateTimeParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - Math.trunc(date.getTime() / 1_000) * 1_000;
}

function matchesZonedDateTime(
  value: Date,
  date: CalendarDate,
  hours: number,
  minutes: number,
  timeZone: string,
) {
  const parts = zonedDateTimeParts(value, timeZone);

  return (
    parts.year === date.year &&
    parts.month === date.month &&
    parts.day === date.day &&
    parts.hour === hours &&
    parts.minute === minutes
  );
}

function zonedDateTimeParts(
  value: Date,
  timeZone: string,
): ZonedDateTimeParts {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(value);
  const values = new Map(
    formatted.map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.get('year') ?? value.getUTCFullYear(),
    month: values.get('month') ?? value.getUTCMonth() + 1,
    day: values.get('day') ?? value.getUTCDate(),
    hour: values.get('hour') ?? value.getUTCHours(),
    minute: values.get('minute') ?? value.getUTCMinutes(),
    second: values.get('second') ?? value.getUTCSeconds(),
  };
}

function calendarDate(value: ZonedDateTimeParts): CalendarDate {
  return {
    year: value.year,
    month: value.month,
    day: value.day,
  };
}

function addCalendarDays(value: CalendarDate, days: number): CalendarDate {
  const date = new Date(
    Date.UTC(value.year, value.month - 1, value.day + days),
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function calendarDayOfWeek(value: CalendarDate) {
  return new Date(
    Date.UTC(value.year, value.month - 1, value.day),
  ).getUTCDay();
}
