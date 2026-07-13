import {
  buildLangameTariffTypeGroupIndex,
  resolveLangameSessionTariff,
} from './langame-session-tariff';

describe('Langame session tariff classification', () => {
  const index = buildLangameTariffTypeGroupIndex([
    { id: 1, type: 'basic', name: 'Почасовой тариф' },
    { id: 9, type: 'subscription', name: 'Абонемент 3 часа' },
    { id: 17, type: 'packet', name: 'Пакет часов' },
  ]);

  it('classifies tariff group 1 as hourly instead of treating it as true', () => {
    expect(resolveLangameSessionTariff(1, index)).toEqual(
      expect.objectContaining({
        kind: 'hourly',
        tariffGroupId: '1',
        tariffType: 'basic',
      }),
    );
  });

  it.each([9, 17])(
    'classifies tariff group %s as package or subscription',
    (tariffGroupId) => {
      expect(resolveLangameSessionTariff(tariffGroupId, index).kind).toBe(
        'package_or_subscription',
      );
    },
  );

  it('does not guess an unknown positive tariff group from truthiness', () => {
    expect(resolveLangameSessionTariff(777, index).kind).toBe('unknown');
  });

  it('keeps compatibility with explicit boolean and zero markers', () => {
    expect(resolveLangameSessionTariff(true, index).kind).toBe(
      'package_or_subscription',
    );
    expect(resolveLangameSessionTariff(false, index).kind).toBe('hourly');
    expect(resolveLangameSessionTariff(0, index).kind).toBe('hourly');
  });
});
