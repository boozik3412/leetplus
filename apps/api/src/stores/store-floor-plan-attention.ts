// Hints for the administrator on «Схема клуба»: what to pay attention to
// about the guest at a computer. Pure functions, so the rules are tested
// without the database or Langame.

import type { GuestDashboardRow } from '../guests/guests.service';

/**
 * Colour groups on the scheme, most urgent first: a guest waits for an
 * answer, something to do today, something to offer, a new guest, and what
 * is good to know about the guest.
 */
export const STORE_FLOOR_PLAN_HINT_TONES = [
  'ALERT',
  'TODAY',
  'OFFER',
  'NEW',
  'KNOW',
] as const;
export type StoreFloorPlanHintTone =
  (typeof STORE_FLOOR_PLAN_HINT_TONES)[number];

export type StoreFloorPlanHintKey =
  | 'GUEST_MESSAGE'
  | 'REWARD_EXPIRING'
  | 'REWARDS_WAITING'
  | 'TIME_ENDING'
  | 'TASK'
  | 'NOT_IN_GAME'
  | 'GAME_IDLE'
  | 'BONUS_IDLE'
  | 'NO_PURCHASES'
  | 'FIRST_VISIT'
  | 'VIP'
  | 'RETURNED';

export type StoreFloorPlanHint = {
  key: StoreFloorPlanHintKey;
  tone: StoreFloorPlanHintTone;
  /** Short reason, shown on the marker and in the list. */
  title: string;
  /** What the administrator can do or say. */
  hint: string;
  /** GUEST_MESSAGE: the guest's message to mark «Иду» / «Решено». */
  alertId?: string;
};

/** A session ending this soon is worth an offer to extend it. */
export const TIME_ENDING_MS = 10 * 60_000;
/** Sitting this long without a single purchase: offer a drink. */
export const NO_PURCHASES_MS = 3 * 60 * 60_000;
/** A visit after this long a break is a return worth a word. */
export const RETURN_AFTER_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;
const TASK_TEXT_LIMIT = 140;

export type StoreFloorPlanHintInput = {
  now: Date;
  /** Club time zone, for dates in the hints. */
  timeZone?: string | null;
  startedAt: Date;
  endsAt: Date | null;
  /** Lines bought at the bar this shift; null when the bar was not read. */
  purchases: number | null;
  /** The viewer sees the «Гости» section. */
  guestAccess: boolean;
  /** The guest is marked «Сотрудник»: no guest hints. */
  isStaff: boolean;
  /** Langame names a guest who has no LeetPlus card yet. */
  newGuest: boolean;
  row: Pick<
    GuestDashboardRow,
    | 'segment'
    | 'visitsDays'
    | 'rfm'
    | 'crmStatus'
    | 'nextAction'
    | 'bonusLoad'
    | 'gameProfile'
  > | null;
  /** Start of the guest's previous visit, before this session. */
  previousVisitAt: Date | null;
};

function plural(count: number, one: string, few: string, many: string) {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

function dayMonth(iso: string | null, timeZone: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: timeZone ?? 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
    }).format(date);
  } catch {
    return (
      date.toISOString().slice(8, 10) + '.' + date.toISOString().slice(5, 7)
    );
  }
}

function whole(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
    .format(Math.round(value))
    .replace(/[\u00a0\u202f]/gu, ' ');
}

/** Hints for one busy computer, most urgent first. */
export function storeFloorPlanSeatHints(
  input: StoreFloorPlanHintInput,
): StoreFloorPlanHint[] {
  const hints: StoreFloorPlanHint[] = [];
  const now = input.now.getTime();

  if (input.endsAt) {
    const left = input.endsAt.getTime() - now;
    if (left > 0 && left <= TIME_ENDING_MS) {
      const minutes = Math.max(1, Math.ceil(left / 60_000));
      hints.push({
        key: 'TIME_ENDING',
        tone: 'TODAY',
        title: `Осталось ${minutes} мин`,
        hint: 'Предложи продлить время или взять пакет',
      });
    }
  }

  if (!input.guestAccess || input.isStaff) {
    return sortHints(hints);
  }

  const sitting = now - input.startedAt.getTime();
  if (input.purchases === 0 && sitting >= NO_PURCHASES_MS) {
    const hours = Math.floor(sitting / (60 * 60_000));
    hints.push({
      key: 'NO_PURCHASES',
      tone: 'OFFER',
      title: `${hours} ч без покупок`,
      hint: 'Предложи напиток или перекус',
    });
  }

  if (input.newGuest) {
    hints.push({
      key: 'FIRST_VISIT',
      tone: 'NEW',
      title: 'Первый визит',
      hint: 'Познакомься, расскажи про игру и Telegram-бот клуба',
    });
    return sortHints(hints);
  }

  const row = input.row;
  if (!row) return sortHints(hints);
  const quiet = row.crmStatus === 'DO_NOT_CONTACT';

  if (row.nextAction) {
    const task = row.nextAction.replace(/\s+/gu, ' ').trim();
    hints.push({
      key: 'TASK',
      tone: 'KNOW',
      title: 'Задача по гостю',
      hint:
        task.length > TASK_TEXT_LIMIT
          ? `${task.slice(0, TASK_TEXT_LIMIT - 1)}…`
          : task,
    });
  }

  const game = row.gameProfile;
  if (game) {
    if (game.rewardsExpiringSoon > 0) {
      const date = dayMonth(
        game.nearestRewardExpiresAt,
        input.timeZone ?? null,
      );
      hints.push({
        key: 'REWARD_EXPIRING',
        tone: 'TODAY',
        title: date ? `Награда сгорает ${date}` : 'Награда скоро сгорит',
        hint: 'Напомни забрать награду в приложении',
      });
    } else if (game.pendingRewards > 0) {
      const count = game.pendingRewards;
      hints.push({
        key: 'REWARDS_WAITING',
        tone: 'TODAY',
        title: `${count} ${plural(count, 'награда ждёт', 'награды ждут', 'наград ждут')}`,
        hint: 'Подскажи, где забрать награды в приложении',
      });
    }
    if (game.engagement === 'IDLE' && !quiet) {
      hints.push({
        key: 'GAME_IDLE',
        tone: 'OFFER',
        title: 'Давно не заходил в игру',
        hint: 'Расскажи о новых заданиях и кейсах',
      });
    }
  } else if (!quiet && (row.segment === 'repeat' || row.segment === 'active')) {
    hints.push({
      key: 'NOT_IN_GAME',
      tone: 'OFFER',
      title: 'Ходит часто, не в игре',
      hint: 'Пригласи в игру: QR на стойке, первый кейс',
    });
  }

  if (!quiet && row.bonusLoad.status === 'RISK') {
    hints.push({
      key: 'BONUS_IDLE',
      tone: 'OFFER',
      title: `${whole(row.bonusLoad.currentBalance)} бонусов лежат`,
      hint: 'Подскажи, что бонусами можно оплатить время и бар',
    });
  }

  if (row.segment === 'new' && row.visitsDays <= 1) {
    hints.push({
      key: 'FIRST_VISIT',
      tone: 'NEW',
      title: 'Новый гость',
      hint: 'Познакомься, расскажи про игру и Telegram-бот клуба',
    });
  }

  if (
    row.crmStatus === 'VIP' ||
    row.rfm.segment === 'CHAMPION' ||
    row.rfm.segment === 'LOYAL'
  ) {
    hints.push({
      key: 'VIP',
      tone: 'KNOW',
      title: row.crmStatus === 'VIP' ? 'VIP' : 'Постоянный гость',
      hint: 'Поздоровайся по имени',
    });
  }

  if (input.previousVisitAt) {
    const days = Math.floor(
      (input.startedAt.getTime() - input.previousVisitAt.getTime()) / DAY_MS,
    );
    if (days >= RETURN_AFTER_DAYS) {
      hints.push({
        key: 'RETURNED',
        tone: 'KNOW',
        title: `Вернулся через ${days} дн.`,
        hint: 'Скажи, что рады видеть снова',
      });
    }
  }

  return sortHints(hints);
}

/** Stable order by tone: the first hint is the marker over the computer. */
export function sortHints(hints: StoreFloorPlanHint[]) {
  return hints
    .map((hint, index) => ({ hint, index }))
    .sort(
      (first, second) =>
        STORE_FLOOR_PLAN_HINT_TONES.indexOf(first.hint.tone) -
          STORE_FLOOR_PLAN_HINT_TONES.indexOf(second.hint.tone) ||
        first.index - second.index,
    )
    .map((entry) => entry.hint);
}

/** Text of a guest message for the scheme: one line, at most 200 chars. */
export function storeFloorPlanAlertText(value: string) {
  const line = value.replace(/\s+/gu, ' ').trim();
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}
