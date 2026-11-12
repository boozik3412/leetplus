// Buttons of the visit rating question in the guest Telegram bot. Shared by
// the worker that asks (corporate/worker side) and the bot webhook that takes
// the answer (public guest side); keep it free of either side's services.

export const VISIT_RATING_CALLBACK_PREFIX = 'bot:rate:';
export const VISIT_RATING_SCORES = [1, 2, 3, 4, 5] as const;
export const VISIT_RATING_LOW_SCORE_MAX = 3;

const RATING_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `bot:rate:<ratingId>:<score>`, 47 bytes: inside Telegram's 64. */
export function visitRatingCallback(ratingId: string, score: number) {
  return `${VISIT_RATING_CALLBACK_PREFIX}${ratingId}:${score}`;
}

export function parseVisitRatingCallback(
  callbackData: string | null | undefined,
): { ratingId: string; score: number } | null {
  const value = callbackData?.trim() ?? '';
  if (!value.startsWith(VISIT_RATING_CALLBACK_PREFIX)) return null;
  const [ratingId, scoreText, ...rest] = value
    .slice(VISIT_RATING_CALLBACK_PREFIX.length)
    .split(':');
  if (rest.length || !ratingId || !RATING_ID.test(ratingId)) return null;
  const score = Number(scoreText);
  if (!VISIT_RATING_SCORES.includes(score as 1 | 2 | 3 | 4 | 5)) return null;
  return { ratingId, score };
}

export function visitRatingReplyMarkup(ratingId: string) {
  return {
    inline_keyboard: [
      VISIT_RATING_SCORES.map((score) => ({
        text: String(score),
        callback_data: visitRatingCallback(ratingId, score),
      })),
    ],
  };
}

export function visitRatingQuestion(storeName: string | null) {
  const club = storeName ? `в клубе «${storeName}»` : 'в клубе';
  return [
    `Как вам сегодня ${club}? Оцените визит от 1 до 5, где 5 — отлично.`,
    'Оценку увидит только команда клуба.',
  ].join('\n');
}

export function visitRatingThanks(score: number) {
  return score <= VISIT_RATING_LOW_SCORE_MAX
    ? 'Спасибо за честную оценку. Что пошло не так? Напишите сюда одним сообщением — передадим администратору клуба.'
    : 'Спасибо за оценку! Ждём вас снова.';
}
