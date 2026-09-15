import { bindReceiptIdentityToSourceHash } from './receipt-source-identity';
import { createReceiptMetricProjection } from './receipt-metrics';

const period = { from: '2026-09-07', to: '2026-09-08' };
const now = '2026-09-15T12:00:00.000Z';
function sale(
  id: string | null,
  revenue: number,
  date = period.from,
  storeId = 'A',
) {
  return {
    storeId,
    revenue,
    saleDate: new Date(`${date}T00:00:00.000Z`),
    sourcePayloadHash: bindReceiptIdentityToSourceHash(id, null),
    externalProvider: 'CSV',
    externalDomain: 'fixture',
  };
}
function projection(
  facts: ReturnType<typeof sale>[],
  covered = ['A:2026-09-07', 'A:2026-09-08'],
) {
  return createReceiptMetricProjection({
    facts,
    storeIds: ['A'],
    calculatedAt: now,
    salesDayEvidence: covered.map((key) => ({
      storeId: key.slice(0, 1),
      date: new Date(`${key.slice(2)}T00:00:00.000Z`),
      status: 'CONFIRMED' as const,
    })),
  });
}

describe('receipt metric projection', () => {
  it('counts receipts rather than lines and uses weighted receipt totals for every view', () => {
    const data = projection([
      sale('one', 100),
      sale('one', 200),
      sale('two', 900, period.to),
    ]);
    const total = data.getMetric(period);
    expect(total.value).toBe(600);
    expect(total.state).toBe('AVAILABLE');
    expect(total.receiptEvidence?.receiptCount).toBe(2);
    expect(data.getMetric({ from: period.from, to: period.from }).value).toBe(
      300,
    );
    expect(data.getMetric({ from: period.to, to: period.to }).value).toBe(900);
  });

  it('keeps namespaces and stores separate for the same receipt id', () => {
    const facts = [
      sale('same', 100),
      { ...sale('same', 300), externalDomain: 'second' },
      sale('same', 800, period.from, 'B'),
    ];
    const data = createReceiptMetricProjection({
      facts,
      storeIds: ['A', 'B'],
      calculatedAt: now,
      salesDayEvidence: ['A', 'B'].map((storeId) => ({
        storeId,
        date: new Date(`${period.from}T00:00:00Z`),
        status: 'CONFIRMED' as const,
      })),
    });
    const total = data.getMetric({ from: period.from, to: period.from });
    expect(total.value).toBe(400);
    expect(total.receiptEvidence?.receiptCount).toBe(3);
    expect(
      data.getMetric({ from: period.from, to: period.from }, ['A']).value,
    ).toBe(200);
  });

  it('keeps operation-id-only rows unknown and suppresses a false full receipt', () => {
    const metric = projection([sale(null, 500)]).getMetric(period);
    expect(metric.value).toBeNull();
    expect(metric.state).toBe('MISSING');
    expect(metric.reason).toContain('идентификатор');
  });

  it('exposes independent store-day and receipt-operation coverage', () => {
    const metric = projection(
      [sale('one', 100), sale(null, 300)],
      ['A:2026-09-07'],
    ).getMetric(period);
    expect(metric.value).toBe(100);
    expect(metric.state).toBe('PARTIAL');
    expect(metric.coverage).toEqual({
      covered: 1,
      total: 2,
      percent: 50,
      basis: 'STORE_DAYS',
    });
    expect(metric.receiptEvidence?.operations).toEqual({
      covered: 1,
      total: 2,
      percent: 50,
    });
    expect(metric.receiptEvidence?.revenue).toEqual({
      covered: 100,
      total: 400,
      percent: 25,
    });
    expect(metric.comparison).toBeNull();
  });

  it('rejects an identity reused on different dates throughout the validation window', () => {
    const data = projection([
      sale('reused', 100),
      sale('reused', 200, period.to),
      sale('valid', 300),
    ]);
    const total = data.getMetric(period);
    expect(total.value).toBe(300);
    expect(total.state).toBe('PARTIAL');
    expect(total.receiptEvidence?.ambiguousIdentityCount).toBe(1);
    expect(data.getMetric({ from: period.to, to: period.to }).value).toBeNull();
    expect(data.getMetric({ from: period.from, to: period.from }).state).toBe(
      'PARTIAL',
    );
  });

  it('separates absence of purchases from genuine free receipts', () => {
    const empty = projection([]).getMetric(period);
    expect(empty.value).toBeNull();
    expect(empty.receiptEvidence?.receiptCount).toBe(0);
    const free = projection([sale('free', 0)]).getMetric(period);
    expect(free.value).toBe(0);
    expect(free.state).toBe('AVAILABLE');
    expect(free.receiptEvidence?.revenue.percent).toBeNull();
  });

  it('does not use facts from unconfirmed days or excluded stores', () => {
    const metric = projection(
      [
        sale('one', 100),
        sale('two', 900, period.to),
        sale('foreign', 50000, period.from, 'B'),
      ],
      ['A:2026-09-07'],
    ).getMetric(period);
    expect(metric.value).toBe(100);
    expect(metric.state).toBe('PARTIAL');
    expect(metric.receiptEvidence?.receiptCount).toBe(1);
  });
});
