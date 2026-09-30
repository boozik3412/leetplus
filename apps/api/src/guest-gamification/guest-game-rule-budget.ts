import type { Prisma } from '@prisma/client';

// A rule budget is spent by every reward that still counts toward it. The
// engine and the guest game module read the same sum, so a case or mission
// that the engine would block for budget is not advertised to guests.
export const GUEST_GAME_BUDGET_REWARD_STATUSES = [
  'PENDING',
  'APPROVED',
  'PAID',
] as const;

type RewardAggregateClient = {
  guestGameReward: Pick<Prisma.TransactionClient['guestGameReward'], 'groupBy'>;
};

export type GuestGameBudgetedRule = {
  id: string;
  budgetAmount: Prisma.Decimal | number | string | null;
};

export async function loadGuestGameRuleBudgetSpent(
  db: RewardAggregateClient,
  tenantId: string,
  rules: {
    lootBoxes?: readonly GuestGameBudgetedRule[];
    missions?: readonly GuestGameBudgetedRule[];
    seasons?: readonly GuestGameBudgetedRule[];
  },
): Promise<Map<string, number>> {
  const budgeted = (items: readonly GuestGameBudgetedRule[] = []) =>
    items.filter((item) => item.budgetAmount != null).map((item) => item.id);
  const lootBoxIds = budgeted(rules.lootBoxes);
  const missionIds = budgeted(rules.missions);
  const seasonIds = budgeted(rules.seasons);
  const status = { in: [...GUEST_GAME_BUDGET_REWARD_STATUSES] };

  const spendRows = await Promise.all([
    lootBoxIds.length
      ? db.guestGameReward
          .groupBy({
            by: ['lootBoxId'],
            where: { tenantId, status, lootBoxId: { in: lootBoxIds } },
            _sum: { rewardAmount: true },
          })
          .then((rows) =>
            rows.map((row) => ({
              id: row.lootBoxId,
              amount: row._sum.rewardAmount,
            })),
          )
      : Promise.resolve([]),
    missionIds.length
      ? db.guestGameReward
          .groupBy({
            by: ['missionId'],
            where: { tenantId, status, missionId: { in: missionIds } },
            _sum: { rewardAmount: true },
          })
          .then((rows) =>
            rows.map((row) => ({
              id: row.missionId,
              amount: row._sum.rewardAmount,
            })),
          )
      : Promise.resolve([]),
    seasonIds.length
      ? db.guestGameReward
          .groupBy({
            by: ['seasonId'],
            where: { tenantId, status, seasonId: { in: seasonIds } },
            _sum: { rewardAmount: true },
          })
          .then((rows) =>
            rows.map((row) => ({
              id: row.seasonId,
              amount: row._sum.rewardAmount,
            })),
          )
      : Promise.resolve([]),
  ]);

  const spent = new Map<string, number>();
  for (const row of spendRows.flat()) {
    if (row.id) spent.set(row.id, Number(row.amount ?? 0));
  }
  return spent;
}

export function guestGameRuleBudgetExhausted(
  rule: GuestGameBudgetedRule,
  spentByRuleId: ReadonlyMap<string, number>,
) {
  if (rule.budgetAmount == null) return false;
  const budget = Number(rule.budgetAmount);
  return Number.isFinite(budget) && (spentByRuleId.get(rule.id) ?? 0) >= budget;
}
