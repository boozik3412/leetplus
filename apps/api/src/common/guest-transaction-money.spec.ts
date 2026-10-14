import { Prisma } from '@prisma/client';
import {
  GUEST_TRANSACTION_ANOMALY_RUB,
  guestTransactionKind,
  guestTransactionSpend,
  guestTransactionTopUp,
  isGuestTransactionAnomaly,
} from './guest-transaction-money';

describe('guest transaction money', () => {
  it('splits a Langame top-up and the spend that follows it', () => {
    // Prod shape: +560 at 09:07:09, −560 seven seconds later, 0 with bonuses.
    expect(guestTransactionTopUp(560)).toBe(560);
    expect(guestTransactionSpend(560)).toBe(0);
    expect(guestTransactionSpend(-560)).toBe(560);
    expect(guestTransactionTopUp(-560)).toBe(0);
    expect(guestTransactionSpend(0)).toBe(0);
    expect(guestTransactionTopUp(0)).toBe(0);
  });

  it('reads Prisma decimals, strings and nulls', () => {
    expect(guestTransactionSpend(new Prisma.Decimal('-245.5'))).toBe(245.5);
    expect(guestTransactionTopUp('1300')).toBe(1300);
    expect(guestTransactionSpend(null)).toBe(0);
    expect(guestTransactionTopUp(undefined)).toBe(0);
    expect(guestTransactionSpend('abc')).toBe(0);
  });

  it('ignores test and correction entries above the anomaly limit', () => {
    expect(isGuestTransactionAnomaly(67_676_767)).toBe(true);
    expect(isGuestTransactionAnomaly(-66_664)).toBe(true);
    expect(isGuestTransactionAnomaly(GUEST_TRANSACTION_ANOMALY_RUB)).toBe(
      false,
    );
    expect(guestTransactionTopUp(67_676_767)).toBe(0);
    expect(guestTransactionSpend(-66_664)).toBe(0);
    expect(guestTransactionSpend(-GUEST_TRANSACTION_ANOMALY_RUB)).toBe(
      GUEST_TRANSACTION_ANOMALY_RUB,
    );
  });

  it('names the kind by the sign', () => {
    expect(guestTransactionKind(100)).toBe('TOP_UP');
    expect(guestTransactionKind(-100)).toBe('SPEND');
    expect(guestTransactionKind(0)).toBe('BONUS');
    expect(guestTransactionKind(null)).toBe('BONUS');
  });
});
