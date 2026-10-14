/**
 * Meaning of a Langame `/transactions/list` row (`GuestTransaction`).
 *
 * Langame returns the signed fiat sum in `balance` (stored as `amount`) and no
 * type: a positive sum tops up the guest deposit, a negative sum spends it on
 * play time or a package, and a zero sum is a bonus-only row (cashback, bar
 * receipt marker). Bar sales are separate `SalesFact` rows and do not appear
 * as negative transactions, so "spend + bar" does not double count.
 *
 * Revenue-like metrics use the spend side; the top-up side is cash flow. Rows
 * above the anomaly limit are test or correction entries (67 676 767 ₽,
 * series of 66 664 ₽ seconds apart) and are ignored by both.
 */
export const GUEST_TRANSACTION_ANOMALY_RUB = 20_000;

type AmountInput = number | string | { toString(): string } | null | undefined;

function amountNumber(value: AmountInput): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isGuestTransactionAnomaly(value: AmountInput): boolean {
  return Math.abs(amountNumber(value)) > GUEST_TRANSACTION_ANOMALY_RUB;
}

/** Money the guest spent from the deposit (positive number), else 0. */
export function guestTransactionSpend(value: AmountInput): number {
  const amount = amountNumber(value);
  if (amount >= 0 || isGuestTransactionAnomaly(amount)) return 0;
  return -amount;
}

/** Money the guest put on the deposit, else 0. */
export function guestTransactionTopUp(value: AmountInput): number {
  const amount = amountNumber(value);
  if (amount <= 0 || isGuestTransactionAnomaly(amount)) return 0;
  return amount;
}

export type GuestTransactionKind = 'TOP_UP' | 'SPEND' | 'BONUS';

export function guestTransactionKind(value: AmountInput): GuestTransactionKind {
  const amount = amountNumber(value);
  if (amount > 0) return 'TOP_UP';
  if (amount < 0) return 'SPEND';
  return 'BONUS';
}

export const GUEST_TRANSACTION_KIND_LABELS: Record<
  GuestTransactionKind,
  string
> = {
  TOP_UP: 'Пополнение',
  SPEND: 'Списание',
  BONUS: 'Бонусы',
};

/**
 * SQL fragment (PostgreSQL) for the spend of a transaction row alias `t`,
 * matching `guestTransactionSpend`.
 */
export const GUEST_TRANSACTION_SPEND_SQL = `CASE WHEN t.amount < 0 AND t.amount >= -${GUEST_TRANSACTION_ANOMALY_RUB} THEN -t.amount ELSE 0 END`;
