BEGIN;

ALTER TABLE "GuestGameProfile"
ADD COLUMN "gameActivatedAt" TIMESTAMP(3),
ADD COLUMN "preActivationXpExcluded" INTEGER NOT NULL DEFAULT 0;

-- Activation is intentionally recovered lazily by the runtime on the next
-- trusted module open (or summary read backed by an already attested open).
-- Keeping this migration free of an unbounded event aggregation avoids a hot
-- deployment update and lets the runtime reconcile signed XP atomically.

-- During the migrate -> API restart window an old ledger worker can still be
-- alive. Silently skip unsafe row transitions so its batch keeps running while
-- the reward/wallet columns are absent or a wallet claim is not accepted.
CREATE OR REPLACE FUNCTION "guard_guest_bonus_ledger_reward_claim"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    linked_reward RECORD;
BEGIN
    IF NEW."source" <> 'GAMIFICATION_REWARD'
       OR NEW."status" NOT IN (
           'PROCESSING',
           'DISPATCHING',
           'CONFIRMED'
       ) THEN
        RETURN NEW;
    END IF;

    IF NEW."rewardId" IS NULL THEN
        RETURN NULL;
    END IF;

    BEGIN
        SELECT
            reward."profileId",
            reward."claimRequired",
            reward."deliveryRequestedAt",
            reward."claimExpiresAt"
        INTO linked_reward
        FROM "GuestGameReward" AS reward
        WHERE reward."id" = NEW."rewardId"
          AND reward."tenantId" = NEW."tenantId";
    EXCEPTION
        WHEN undefined_column OR undefined_table THEN
            RETURN NULL;
    END;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF linked_reward."claimRequired" = false THEN
        -- Legacy/manual rewards without a guest game profile remain outside
        -- the portal wallet contract. Profile-owned rewards fail closed until
        -- the quarantine update below upgrades them to wallet semantics.
        IF linked_reward."profileId" IS NULL THEN
            RETURN NEW;
        END IF;

        RETURN NULL;
    END IF;

    BEGIN
        IF linked_reward."deliveryRequestedAt" IS NOT NULL
           AND linked_reward."claimExpiresAt" IS NOT NULL
           AND linked_reward."deliveryRequestedAt" <
               linked_reward."claimExpiresAt"
           AND EXISTS (
               SELECT 1
               FROM "GuestGameRewardWalletItem" AS wallet
               WHERE wallet."tenantId" = NEW."tenantId"
                 AND wallet."rewardId" = NEW."rewardId"
                 AND wallet."kind" = 'REWARD'
                 AND wallet."status" IN ('PROCESSING', 'FAILED')
           ) THEN
            RETURN NEW;
        END IF;
    EXCEPTION
        WHEN undefined_table THEN
            RETURN NULL;
    END;

    RETURN NULL;
END;
$$;

-- Stop old API writers before taking the cutover timestamp. Lock ledger first
-- and reward second to match the operational cutover order; both locks are
-- held through COMMIT, so no old worker can write in the guard-install gap.
LOCK TABLE "GuestBonusLedgerEntry" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "GuestGameReward" IN SHARE ROW EXCLUSIVE MODE;

-- The cutover marker and trigger become visible atomically. Any reward created
-- after this boundary is upgraded to wallet-gated semantics below.
DO $$
BEGIN
    CREATE TABLE "_GuestGameRewardWalletCutover" (
        "cutoverAt" TIMESTAMP(3) NOT NULL
    );
    INSERT INTO "_GuestGameRewardWalletCutover" ("cutoverAt")
    VALUES (clock_timestamp());

    CREATE TRIGGER "guest_bonus_ledger_reward_claim_guard"
    BEFORE INSERT OR UPDATE ON "GuestBonusLedgerEntry"
    FOR EACH ROW
    EXECUTE FUNCTION "guard_guest_bonus_ledger_reward_claim"();
END;
$$;

ALTER TABLE "GuestGameReward"
ADD COLUMN "claimRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deliveryRequestedAt" TIMESTAMP(3),
ADD COLUMN "claimExpiresAt" TIMESTAMP(3);

-- Old API processes omit these fields. Switch their insert default to the safe
-- wallet lane, then upgrade rows created since the guarded cutover.
ALTER TABLE "GuestGameReward"
ALTER COLUMN "claimRequired" SET DEFAULT true;

CREATE OR REPLACE FUNCTION "ensure_guest_game_reward_claim_deadline"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."claimRequired" = true
       AND NEW."claimExpiresAt" IS NULL THEN
        NEW."claimExpiresAt" =
            COALESCE(NEW."qualifiedAt", CURRENT_TIMESTAMP) +
            INTERVAL '30 days';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "guest_game_reward_claim_deadline"
BEFORE INSERT OR UPDATE OF
    "claimRequired",
    "qualifiedAt",
    "claimExpiresAt"
ON "GuestGameReward"
FOR EACH ROW
EXECUTE FUNCTION "ensure_guest_game_reward_claim_deadline"();

UPDATE "GuestGameReward" AS reward
SET
    "claimRequired" = true,
    "claimExpiresAt" =
        reward."qualifiedAt" + INTERVAL '30 days'
WHERE reward."createdAt" >= (
    SELECT marker."cutoverAt"
    FROM "_GuestGameRewardWalletCutover" AS marker
    LIMIT 1
);

-- Quarantine legacy automatic rewards before releasing the ledger lock. The
-- first trusted game-module activation remains the visibility boundary: this
-- step only closes the delivery lane and does not create wallet rows.
UPDATE "GuestGameReward" AS reward
SET
    "claimRequired" = true,
    "claimExpiresAt" = reward."qualifiedAt" + INTERVAL '30 days'
WHERE reward."createdAt" < (
    SELECT marker."cutoverAt"
    FROM "_GuestGameRewardWalletCutover" AS marker
    LIMIT 1
)
  AND reward."profileId" IS NOT NULL
  AND reward."status" = 'APPROVED'
  AND reward."claimRequired" = false
  AND reward."deliveryRequestedAt" IS NULL
  AND UPPER(reward."rewardType") NOT IN (
      'LOOT_BOX',
      'LOOTBOX',
      'LOOT_BOX_ENTITLEMENT'
  )
  AND reward."qualifiedAt" > CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND reward."qualifiedAt" <= CURRENT_TIMESTAMP
  AND NOT EXISTS (
      SELECT 1
      FROM "GuestGameDelivery" AS delivery
      WHERE delivery."tenantId" = reward."tenantId"
        AND delivery."rewardId" = reward."id"
  )
  AND NOT EXISTS (
      SELECT 1
      FROM "GuestBonusLedgerEntry" AS ledger
      WHERE ledger."tenantId" = reward."tenantId"
        AND ledger."rewardId" = reward."id"
        AND ledger."source" = 'GAMIFICATION_REWARD'
        AND ledger."status" NOT IN ('PENDING', 'FAILED')
  );

-- The equivalent safe legacy rows whose wallet deadline already passed are
-- made terminal in the same transaction. This prevents a restarted scheduler
-- from repeatedly selecting an old PENDING/FAILED ledger entry.
UPDATE "GuestGameReward" AS reward
SET
    "status" = 'EXPIRED',
    "claimRequired" = true,
    "claimExpiresAt" = reward."qualifiedAt" + INTERVAL '30 days'
WHERE reward."createdAt" < (
    SELECT marker."cutoverAt"
    FROM "_GuestGameRewardWalletCutover" AS marker
    LIMIT 1
)
  AND reward."profileId" IS NOT NULL
  AND reward."status" = 'APPROVED'
  AND reward."claimRequired" = false
  AND reward."deliveryRequestedAt" IS NULL
  AND UPPER(reward."rewardType") NOT IN (
      'LOOT_BOX',
      'LOOTBOX',
      'LOOT_BOX_ENTITLEMENT'
  )
  AND reward."qualifiedAt" <= CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND NOT EXISTS (
      SELECT 1
      FROM "GuestGameDelivery" AS delivery
      WHERE delivery."tenantId" = reward."tenantId"
        AND delivery."rewardId" = reward."id"
  )
  AND NOT EXISTS (
      SELECT 1
      FROM "GuestBonusLedgerEntry" AS ledger
      WHERE ledger."tenantId" = reward."tenantId"
        AND ledger."rewardId" = reward."id"
        AND ledger."source" = 'GAMIFICATION_REWARD'
        AND ledger."status" NOT IN ('PENDING', 'FAILED')
  );

-- Existing pre-write effects are parked behind the guest claim. APPLIED or
-- in-flight effects are deliberately not rewritten because their outcome
-- requires reconciliation rather than an automatic retry.
UPDATE "GuestGameRewardEffect" AS effect
SET
    "status" = 'WAITING_CLAIM',
    "claimExpiresAt" = reward."claimExpiresAt",
    "nextAttemptAt" = NULL,
    "lastError" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "GuestGameReward" AS reward
WHERE reward."id" = effect."rewardId"
  AND reward."tenantId" = effect."tenantId"
  AND reward."createdAt" < (
      SELECT marker."cutoverAt"
      FROM "_GuestGameRewardWalletCutover" AS marker
      LIMIT 1
  )
  AND reward."status" = 'APPROVED'
  AND reward."claimRequired" = true
  AND reward."deliveryRequestedAt" IS NULL
  AND reward."claimExpiresAt" > CURRENT_TIMESTAMP
  AND effect."effectKind" = 'BONUS_LEDGER_QUEUE'
  AND effect."status" IN ('PENDING', 'FAILED');

UPDATE "GuestBonusLedgerEntry" AS ledger
SET
    "status" = 'CANCELED',
    "lockedAt" = NULL,
    "nextAttemptAt" = NULL,
    "canceledAt" = CURRENT_TIMESTAMP,
    "errorCode" = 'REWARD_CLAIM_EXPIRED',
    "errorMessage" = 'Reward claim expired during wallet rollout.',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "GuestGameReward" AS reward
WHERE reward."id" = ledger."rewardId"
  AND reward."tenantId" = ledger."tenantId"
  AND reward."createdAt" < (
      SELECT marker."cutoverAt"
      FROM "_GuestGameRewardWalletCutover" AS marker
      LIMIT 1
  )
  AND reward."status" = 'EXPIRED'
  AND reward."claimRequired" = true
  AND reward."deliveryRequestedAt" IS NULL
  AND reward."claimExpiresAt" <= CURRENT_TIMESTAMP
  AND ledger."source" = 'GAMIFICATION_REWARD'
  AND ledger."status" IN ('PENDING', 'FAILED');

UPDATE "GuestGameRewardEffect" AS effect
SET
    "status" = 'CANCELED',
    "claimedAt" = NULL,
    "claimExpiresAt" = NULL,
    "nextAttemptAt" = NULL,
    "lastError" = 'Reward claim expired during wallet rollout.',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "GuestGameReward" AS reward
WHERE reward."id" = effect."rewardId"
  AND reward."tenantId" = effect."tenantId"
  AND reward."createdAt" < (
      SELECT marker."cutoverAt"
      FROM "_GuestGameRewardWalletCutover" AS marker
      LIMIT 1
  )
  AND reward."status" = 'EXPIRED'
  AND reward."claimRequired" = true
  AND reward."deliveryRequestedAt" IS NULL
  AND reward."claimExpiresAt" <= CURRENT_TIMESTAMP
  AND effect."effectKind" = 'BONUS_LEDGER_QUEUE'
  AND effect."status" IN ('PENDING', 'FAILED', 'WAITING_CLAIM');

DROP TABLE "_GuestGameRewardWalletCutover";

CREATE TABLE "GuestGameRewardWalletItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "storeId" TEXT,
    "rewardId" TEXT,
    "entitlementId" TEXT,
    "eventId" TEXT,
    "kind" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "rewardLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "claimXpDelta" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestGameRewardWalletItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "guest_game_reward_wallet_one_source_check"
        CHECK (num_nonnulls("rewardId", "entitlementId", "eventId") = 1),
    CONSTRAINT "guest_game_reward_wallet_status_check"
        CHECK (
            "status" IN (
                'PENDING',
                'PROCESSING',
                'FAILED',
                'OPENING',
                'CLAIMED'
            )
        ),
    CONSTRAINT "guest_game_reward_wallet_kind_check"
        CHECK ("kind" IN ('REWARD', 'LOOT_BOX_ENTITLEMENT')),
    CONSTRAINT "guest_game_reward_wallet_kind_source_check"
        CHECK (
            (
                "kind" = 'LOOT_BOX_ENTITLEMENT'
                AND "entitlementId" IS NOT NULL
            )
            OR (
                "kind" = 'REWARD'
                AND ("rewardId" IS NOT NULL OR "eventId" IS NOT NULL)
            )
        ),
    CONSTRAINT "guest_game_reward_wallet_source_kind_check"
        CHECK (
            "sourceKind" IN (
                'CHECK_IN',
                'MISSION',
                'BATTLE_PASS',
                'LOOT_BOX',
                'MANUAL'
            )
        ),
    CONSTRAINT "guest_game_reward_wallet_claimed_at_check"
        CHECK (
            ("status" = 'PENDING' AND "claimedAt" IS NULL)
            OR ("status" = 'PROCESSING' AND "claimedAt" IS NULL)
            OR ("status" = 'FAILED' AND "claimedAt" IS NULL)
            OR ("status" = 'OPENING' AND "claimedAt" IS NULL)
            OR ("status" = 'CLAIMED' AND "claimedAt" IS NOT NULL)
        ),
    CONSTRAINT "guest_game_reward_wallet_claim_xp_check"
        CHECK ("claimXpDelta" >= 0),
    CONSTRAINT "guest_game_reward_wallet_expiry_check"
        CHECK ("expiresAt" > "availableAt")
);

CREATE UNIQUE INDEX "guest_game_reward_wallet_reward_uidx"
ON "GuestGameRewardWalletItem"("tenantId", "rewardId");

CREATE UNIQUE INDEX "guest_game_reward_wallet_entitlement_uidx"
ON "GuestGameRewardWalletItem"("tenantId", "entitlementId");

CREATE UNIQUE INDEX "guest_game_reward_wallet_event_uidx"
ON "GuestGameRewardWalletItem"("tenantId", "eventId");

CREATE INDEX "guest_game_reward_wallet_pending_idx"
ON "GuestGameRewardWalletItem"(
    "tenantId",
    "profileId",
    "status",
    "expiresAt",
    "availableAt",
    "id"
);

CREATE INDEX "guest_game_reward_wallet_profile_idx"
ON "GuestGameRewardWalletItem"("profileId");

CREATE INDEX "guest_game_reward_wallet_store_idx"
ON "GuestGameRewardWalletItem"("storeId");

CREATE INDEX "guest_game_reward_wallet_reward_idx"
ON "GuestGameRewardWalletItem"("rewardId");

CREATE INDEX "guest_game_reward_wallet_entitlement_idx"
ON "GuestGameRewardWalletItem"("entitlementId");

CREATE INDEX "guest_game_reward_wallet_event_idx"
ON "GuestGameRewardWalletItem"("eventId");

CREATE INDEX "guest_game_reward_wallet_expiry_idx"
ON "GuestGameRewardWalletItem"("expiresAt", "id");

CREATE INDEX "guest_game_reward_wallet_stale_opening_idx"
ON "GuestGameRewardWalletItem"("kind", "status", "updatedAt", "id");

ALTER TABLE "GuestGameRewardWalletItem"
ADD CONSTRAINT "GuestGameRewardWalletItem_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameRewardWalletItem"
ADD CONSTRAINT "GuestGameRewardWalletItem_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestGameRewardWalletItem"
ADD CONSTRAINT "GuestGameRewardWalletItem_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameRewardWalletItem"
ADD CONSTRAINT "GuestGameRewardWalletItem_rewardId_fkey"
FOREIGN KEY ("rewardId") REFERENCES "GuestGameReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestGameRewardWalletItem"
ADD CONSTRAINT "GuestGameRewardWalletItem_entitlementId_fkey"
FOREIGN KEY ("entitlementId") REFERENCES "GuestGameEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestGameRewardWalletItem"
ADD CONSTRAINT "GuestGameRewardWalletItem_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "GuestGameEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill only still-actionable non-loot-box rewards inside the 30-day
-- retention window and never before the profile's first trusted app open.
INSERT INTO "GuestGameRewardWalletItem" (
    "id",
    "tenantId",
    "profileId",
    "storeId",
    "rewardId",
    "kind",
    "sourceKind",
    "sourceId",
    "title",
    "rewardLabel",
    "status",
    "availableAt",
    "expiresAt",
    "claimedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    reward."tenantId",
    reward."profileId",
    reward."storeId",
    reward."id",
    'REWARD',
    CASE
        WHEN reward."missionId" IS NOT NULL THEN 'MISSION'
        WHEN reward."seasonId" IS NOT NULL THEN 'BATTLE_PASS'
        WHEN reward."lootBoxId" IS NOT NULL THEN 'LOOT_BOX'
        ELSE 'MANUAL'
    END,
    COALESCE(
        reward."missionId",
        reward."seasonId",
        reward."lootBoxId",
        reward."id"
    ),
    COALESCE(
        mission."name",
        season."name",
        loot_box."name",
        reward."rewardLabel"
    ),
    reward."rewardLabel",
    'PENDING',
    reward."qualifiedAt",
    reward."qualifiedAt" + INTERVAL '30 days',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "GuestGameReward" AS reward
JOIN "GuestGameProfile" AS profile
    ON profile."tenantId" = reward."tenantId"
   AND profile."id" = reward."profileId"
LEFT JOIN "GuestGameMission" AS mission
    ON mission."tenantId" = reward."tenantId"
   AND mission."id" = reward."missionId"
LEFT JOIN "GuestGameSeason" AS season
    ON season."tenantId" = reward."tenantId"
   AND season."id" = reward."seasonId"
LEFT JOIN "GuestGameLootBox" AS loot_box
    ON loot_box."tenantId" = reward."tenantId"
   AND loot_box."id" = reward."lootBoxId"
WHERE reward."profileId" IS NOT NULL
  AND reward."claimRequired" = true
  AND UPPER(reward."rewardType") NOT IN (
      'LOOT_BOX',
      'LOOTBOX',
      'LOOT_BOX_ENTITLEMENT'
  )
  AND reward."status" = 'APPROVED'
  AND profile."gameActivatedAt" IS NOT NULL
  AND reward."qualifiedAt" >= profile."gameActivatedAt"
  AND reward."qualifiedAt" > CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND reward."qualifiedAt" <= CURRENT_TIMESTAMP
  AND NOT EXISTS (
      SELECT 1
      FROM "GuestGameDelivery" AS delivery
      WHERE delivery."tenantId" = reward."tenantId"
        AND delivery."rewardId" = reward."id"
  )
ON CONFLICT ("tenantId", "rewardId") DO NOTHING;

-- AVAILABLE entitlements are unopened loot-box rights. A narrowly scoped
-- legacy EXPIRED entitlement is also recoverable when it is unconsumed,
-- points at an active rule and only crossed its old session/day validUntil.
-- The wallet retention window is authoritative for both cases.
INSERT INTO "GuestGameRewardWalletItem" (
    "id",
    "tenantId",
    "profileId",
    "storeId",
    "entitlementId",
    "kind",
    "sourceKind",
    "sourceId",
    "title",
    "rewardLabel",
    "status",
    "availableAt",
    "expiresAt",
    "claimedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    entitlement."tenantId",
    entitlement."profileId",
    entitlement."storeId",
    entitlement."id",
    'LOOT_BOX_ENTITLEMENT',
    CASE
        WHEN NULLIF(entitlement."evidence"->>'missionId', '') IS NOT NULL
            THEN 'MISSION'
        WHEN NULLIF(entitlement."evidence"->>'seasonId', '') IS NOT NULL
            THEN 'BATTLE_PASS'
        ELSE 'LOOT_BOX'
    END,
    COALESCE(
        NULLIF(entitlement."evidence"->>'missionId', ''),
        NULLIF(entitlement."evidence"->>'seasonId', ''),
        entitlement."ruleId"
    ),
    COALESCE(
        NULLIF(source_mission."name", ''),
        NULLIF(source_season."name", ''),
        NULLIF(entitlement."ruleName", ''),
        NULLIF(loot_box."name", ''),
        'Лутбокс'
    ),
    '1 попытка открытия',
    'PENDING',
    entitlement."qualifiedAt",
    entitlement."qualifiedAt" + INTERVAL '30 days',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "GuestGameEntitlement" AS entitlement
JOIN "GuestGameProfile" AS profile
    ON profile."tenantId" = entitlement."tenantId"
   AND profile."id" = entitlement."profileId"
LEFT JOIN "GuestGameLootBox" AS loot_box
    ON loot_box."tenantId" = entitlement."tenantId"
   AND loot_box."id" = entitlement."ruleId"
LEFT JOIN "GuestGameMission" AS source_mission
    ON source_mission."tenantId" = entitlement."tenantId"
   AND source_mission."id" = NULLIF(
       entitlement."evidence"->>'missionId',
       ''
   )
LEFT JOIN "GuestGameSeason" AS source_season
    ON source_season."tenantId" = entitlement."tenantId"
   AND source_season."id" = NULLIF(
       entitlement."evidence"->>'seasonId',
       ''
   )
WHERE entitlement."profileId" IS NOT NULL
  AND entitlement."ruleType" = 'LOOT_BOX'
  AND entitlement."consumedAt" IS NULL
  AND entitlement."canceledAt" IS NULL
  AND entitlement."rewardId" IS NULL
  AND loot_box."id" IS NOT NULL
  AND loot_box."status" = 'ACTIVE'
  AND (
      entitlement."status" = 'AVAILABLE'
      OR (
          entitlement."status" = 'EXPIRED'
          AND entitlement."validUntil" IS NOT NULL
          AND entitlement."validUntil" <= CURRENT_TIMESTAMP
      )
  )
  AND profile."gameActivatedAt" IS NOT NULL
  AND entitlement."qualifiedAt" >= profile."gameActivatedAt"
  AND entitlement."qualifiedAt" > CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND entitlement."qualifiedAt" <= CURRENT_TIMESTAMP
ON CONFLICT ("tenantId", "entitlementId") DO NOTHING;

-- Reactivate only the legacy time-expired candidates materialized above.
-- Consumed/canceled entitlements and rights without a live rule stay terminal.
UPDATE "GuestGameEntitlement" AS entitlement
SET
    "status" = 'AVAILABLE',
    "validUntil" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE entitlement."ruleType" = 'LOOT_BOX'
  AND entitlement."status" = 'EXPIRED'
  AND entitlement."consumedAt" IS NULL
  AND entitlement."canceledAt" IS NULL
  AND entitlement."rewardId" IS NULL
  AND entitlement."validUntil" IS NOT NULL
  AND entitlement."validUntil" <= CURRENT_TIMESTAMP
  AND EXISTS (
      SELECT 1
      FROM "GuestGameLootBox" AS loot_box
      WHERE loot_box."tenantId" = entitlement."tenantId"
        AND loot_box."id" = entitlement."ruleId"
        AND loot_box."status" = 'ACTIVE'
  )
  AND EXISTS (
      SELECT 1
      FROM "GuestGameRewardWalletItem" AS wallet
      WHERE wallet."tenantId" = entitlement."tenantId"
        AND wallet."entitlementId" = entitlement."id"
        AND wallet."status" = 'PENDING'
        AND wallet."expiresAt" > CURRENT_TIMESTAMP
  );

COMMIT;
