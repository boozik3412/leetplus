import { Prisma } from '@prisma/client';
import { keepTelegramConfig } from './marketing.service';

describe('keepTelegramConfig', () => {
  const telegram = {
    type: 'NEWS',
    text: 'Турнир',
    automation: { trigger: 'LAPSED', enabled: true },
  };

  it('keeps the stored Telegram settings when the campaign form saves', () => {
    expect(
      keepTelegramConfig(
        { template: 'WINBACK', telegram: { text: 'старый' } },
        { template: 'OLD', telegram },
      ),
    ).toEqual({ template: 'WINBACK', telegram });
    expect(keepTelegramConfig(Prisma.JsonNull, { telegram })).toEqual({
      telegram,
    });
  });

  it('never lets the form create Telegram settings', () => {
    expect(
      keepTelegramConfig(
        { template: 'WINBACK', telegram: { automation: { enabled: true } } },
        null,
      ),
    ).toEqual({ template: 'WINBACK' });
    expect(keepTelegramConfig(Prisma.JsonNull, null)).toBe(Prisma.JsonNull);
  });
});
