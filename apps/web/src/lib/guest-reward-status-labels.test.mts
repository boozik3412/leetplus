import assert from "node:assert/strict";
import test from "node:test";
import {
  guestRewardActionNotice,
  guestRewardFulfillmentLabel,
  guestRewardLifecycleDescription,
  guestRewardStatusLabel,
  type GuestRewardLabelInput,
} from "./guest-reward-status-labels.ts";

function reward(
  overrides: Partial<GuestRewardLabelInput> = {},
): GuestRewardLabelInput {
  return {
    status: "APPROVED",
    walletState: "READY",
    rewardType: "ADMIN_OTHER",
    rewardAmount: 0,
    claimRequired: false,
    deliveryRequestedAt: null,
    sourceEntitlementStatus: null,
    ...overrides,
  };
}

test("distinguishes an available case from an opened case", () => {
  const available = reward({
    rewardType: "LOOT_BOX_ENTITLEMENT",
    walletState: "REDEEMED",
    sourceEntitlementStatus: "AVAILABLE",
  });
  const opened = reward({
    rewardType: "LOOT_BOX_ENTITLEMENT",
    walletState: "REDEEMED",
    sourceEntitlementStatus: "CONSUMED",
  });

  assert.equal(guestRewardStatusLabel(available), "право подтверждено");
  assert.equal(guestRewardFulfillmentLabel(available), "кейс доступен");
  assert.match(guestRewardLifecycleDescription(available), /ещё не открыт/);
  assert.equal(guestRewardFulfillmentLabel(opened), "кейс открыт");
  assert.match(guestRewardLifecycleDescription(opened), /уже открыт/);
});

test("shows the guest-claim boundary before a Langame bonus is queued", () => {
  const waitingForGuest = reward({
    rewardType: "BONUS_BALANCE",
    rewardAmount: 150,
    claimRequired: true,
  });

  assert.equal(guestRewardStatusLabel(waitingForGuest), "право подтверждено");
  assert.equal(
    guestRewardFulfillmentLabel(waitingForGuest),
    "ждёт получения гостем",
  );
  assert.match(
    guestRewardLifecycleDescription(waitingForGuest),
    /нажать «Забрать»/,
  );
});

test("distinguishes a queued Langame bonus from a completed accrual", () => {
  const queued = reward({
    rewardType: "BONUS_BALANCE",
    rewardAmount: 150,
    claimRequired: true,
    deliveryRequestedAt: "2026-09-06T05:00:00.000Z",
    walletState: "DELIVERY_PROCESSING",
  });
  const paid = reward({
    ...queued,
    status: "PAID",
    walletState: "REDEEMED",
  });

  assert.equal(guestRewardFulfillmentLabel(queued), "в очереди Langame");
  assert.equal(guestRewardStatusLabel(paid), "бонус начислен");
  assert.equal(guestRewardFulfillmentLabel(paid), "начислено в Langame");
});

test("labels Battle Pass completion markers as progress without a payout", () => {
  const marker = reward({
    rewardType: "BATTLE_PASS_COMPLETION_MARKER",
    rewardAmount: 0,
  });

  assert.equal(guestRewardStatusLabel(marker), "этап засчитан");
  assert.equal(guestRewardFulfillmentLabel(marker), "прогресс учтён");
  assert.match(guestRewardLifecycleDescription(marker), /не требуется/);
});

test("keeps manual approval and fulfillment as separate stages", () => {
  const pending = reward({ status: "PENDING", walletState: "WAITING_APPROVAL" });
  const approved = reward();

  assert.equal(guestRewardStatusLabel(pending), "ожидает проверки");
  assert.match(guestRewardActionNotice(pending), /Сначала подтвердите/);
  assert.equal(guestRewardStatusLabel(approved), "выдача согласована");
  assert.equal(
    guestRewardFulfillmentLabel(approved),
    "ожидает ручной выдачи",
  );
});
