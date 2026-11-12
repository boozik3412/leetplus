import {
  parseVisitRatingCallback,
  visitRatingCallback,
  visitRatingQuestion,
  visitRatingReplyMarkup,
} from './guest-visit-rating-callback';

const RATING = '8f6f1c1e-5d2a-4b7e-9c1d-2a3b4c5d6e7f';

describe('visit rating buttons', () => {
  it('round-trips a score within Telegram callback limits', () => {
    const data = visitRatingCallback(RATING, 4);
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
    expect(parseVisitRatingCallback(data)).toEqual({
      ratingId: RATING,
      score: 4,
    });
  });

  it.each([
    null,
    'bot:menu',
    `bot:rate:${RATING}:0`,
    `bot:rate:${RATING}:6`,
    `bot:rate:${RATING}:4:extra`,
    'bot:rate:not-a-uuid:4',
  ])('rejects %p', (data) => {
    expect(parseVisitRatingCallback(data)).toBeNull();
  });

  it('asks with one row of five buttons and names the club', () => {
    expect(visitRatingReplyMarkup(RATING).inline_keyboard).toEqual([
      [1, 2, 3, 4, 5].map((score) => ({
        text: String(score),
        callback_data: `bot:rate:${RATING}:${score}`,
      })),
    ]);
    expect(visitRatingQuestion('1337 Радищева')).toContain(
      'в клубе «1337 Радищева»',
    );
  });
});
