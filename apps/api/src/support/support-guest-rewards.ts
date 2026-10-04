// Read-only view of what the guest received in the ticket's club, so a
// specialist can check "the case was not given" without leaving the queue.
// The game profile is network-wide; every wallet item carries the club where
// it was earned, and the support card shows that club first.

export const SUPPORT_GUEST_REWARDS_WINDOW_DAYS = 30;
export const SUPPORT_GUEST_REWARDS_LIMIT = 30;

export type SupportGuestRewardState = 'DONE' | 'WAITING' | 'PROBLEM';

export type SupportGuestRewardsWalletRow = {
  id: string;
  storeId: string | null;
  kind: string;
  sourceKind: string;
  title: string;
  rewardLabel: string;
  status: string;
  createdAt: Date;
  claimedAt: Date | null;
  expiresAt: Date;
  reward: {
    status: string;
    rewardAmount: { toString(): string } | number;
    paidAt: Date | null;
  } | null;
};

export type SupportTicketGuestRewards = {
  ticketId: string;
  store: { id: string; name: string };
  since: string;
  items: Array<{
    id: string;
    createdAt: string;
    title: string;
    rewardLabel: string;
    sourceLabel: string;
    state: SupportGuestRewardState;
    stateLabel: string;
    claimedAt: string | null;
    expiresAt: string;
    payout: {
      amount: number;
      statusLabel: string;
      paidAt: string | null;
    } | null;
  }>;
  truncated: boolean;
  otherClubs: Array<{ storeId: string; name: string; items: number }>;
  withoutClub: number;
};

const sourceLabels: Record<string, string> = {
  BATTLE_PASS: 'Боевой пропуск',
  LOOT_BOX: 'Кейс',
  MISSION: 'Задание',
};

const payoutLabels: Record<string, string> = {
  PAID: 'начислено',
  APPROVED: 'подтверждено, ждёт начисления',
  PENDING: 'ожидает проверки',
  CANCELED: 'начисление отменено',
  EXPIRED: 'начисление истекло',
};

export function buildSupportGuestRewards(input: {
  ticket: {
    id: string;
    createdAt: Date;
    store: { id: string; name: string };
  };
  wallet: readonly SupportGuestRewardsWalletRow[];
  storeNames: ReadonlyMap<string, string>;
  now: Date;
}): SupportTicketGuestRewards {
  const { ticket, wallet, storeNames, now } = input;
  const inClub = wallet.filter((item) => item.storeId === ticket.store.id);
  const otherCounts = new Map<string, number>();
  let withoutClub = 0;
  for (const item of wallet) {
    if (!item.storeId) {
      withoutClub += 1;
    } else if (item.storeId !== ticket.store.id) {
      otherCounts.set(item.storeId, (otherCounts.get(item.storeId) ?? 0) + 1);
    }
  }

  return {
    ticketId: ticket.id,
    store: ticket.store,
    since: supportGuestRewardsSince(ticket.createdAt).toISOString(),
    items: inClub
      .slice(0, SUPPORT_GUEST_REWARDS_LIMIT)
      .map((item) => projectWalletItem(item, now)),
    truncated: inClub.length > SUPPORT_GUEST_REWARDS_LIMIT,
    otherClubs: [...otherCounts.entries()]
      .map(([storeId, items]) => ({
        storeId,
        name: storeNames.get(storeId) ?? 'Клуб сети',
        items,
      }))
      .sort((left, right) => right.items - left.items),
    withoutClub,
  };
}

export function supportGuestRewardsSince(ticketCreatedAt: Date) {
  return new Date(
    ticketCreatedAt.getTime() -
      SUPPORT_GUEST_REWARDS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
}

function projectWalletItem(item: SupportGuestRewardsWalletRow, now: Date) {
  const amount = item.reward ? Number(item.reward.rewardAmount.toString()) : 0;
  const payout =
    item.reward && amount > 0
      ? {
          amount,
          statusLabel: payoutLabels[item.reward.status] ?? item.reward.status,
          paidAt: item.reward.paidAt?.toISOString() ?? null,
        }
      : null;
  const wallet = walletState(item, now);
  const payoutProblem =
    item.reward?.status === 'CANCELED' || item.reward?.status === 'EXPIRED';
  const payoutWaiting =
    payout !== null && item.reward?.status !== 'PAID' && !payoutProblem;

  return {
    id: item.id,
    createdAt: item.createdAt.toISOString(),
    title: item.title,
    rewardLabel: item.rewardLabel,
    sourceLabel: sourceLabels[item.sourceKind] ?? 'Другое',
    state:
      wallet.state === 'PROBLEM' || (payout && payoutProblem)
        ? ('PROBLEM' as const)
        : wallet.state === 'WAITING' || payoutWaiting
          ? ('WAITING' as const)
          : ('DONE' as const),
    stateLabel: wallet.label,
    claimedAt: item.claimedAt?.toISOString() ?? null,
    expiresAt: item.expiresAt.toISOString(),
    payout,
  };
}

function walletState(
  item: Pick<SupportGuestRewardsWalletRow, 'kind' | 'status' | 'expiresAt'>,
  now: Date,
): { state: SupportGuestRewardState; label: string } {
  const lootBox = item.kind === 'LOOT_BOX_ENTITLEMENT';
  switch (item.status) {
    case 'CLAIMED':
      return { state: 'DONE', label: lootBox ? 'кейс открыт' : 'получена' };
    case 'PENDING':
      return item.expiresAt.getTime() <= now.getTime()
        ? {
            state: 'PROBLEM',
            label: lootBox ? 'кейс истёк, не открыт' : 'истекла, не получена',
          }
        : {
            state: 'WAITING',
            label: lootBox ? 'кейс выдан, не открыт' : 'ждёт получения гостем',
          };
    case 'OPENING':
    case 'PROCESSING':
      return {
        state: 'WAITING',
        label: lootBox ? 'кейс открывается' : 'начисляется',
      };
    case 'FAILED':
      return {
        state: 'PROBLEM',
        label: lootBox ? 'ошибка открытия' : 'ошибка начисления',
      };
    default:
      return { state: 'WAITING', label: item.status.toLowerCase() };
  }
}
