-- A loot-box reward is delivered by creating an entitlement. The guest's
-- explicit action is opening that entitlement, not claiming the parent
-- GuestGameReward. Keep ordinary bonus rewards behind WAITING_CLAIM.
BEGIN;
SET LOCAL TIME ZONE 'UTC';

-- Serialize the repair with the legacy claim transaction. The old API writes
-- the parent reward first, then its wallet/effect rows, so use the same lock
-- order. These locks are held through COMMIT. A claim already in its
-- conflicting write phase completes before the repair snapshot; a later write
-- waits for the compatibility guard installed below. A deployment lock timeout
-- or deadlock remains a safe stop and must be retried after the normal
-- preflight rather than resolved as partially applied.
LOCK TABLE
  "GuestGameReward",
  "GuestGameRewardWalletItem",
  "GuestGameRewardEffect"
IN SHARE ROW EXCLUSIVE MODE;

-- Production currently runs PostgreSQL 16, but keep this migration portable
-- to older supported clusters and fail closed on malformed legacy evidence.
CREATE OR REPLACE FUNCTION pg_temp.guest_game_try_timestamptz(value TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN value::timestamptz;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END
$$;

-- Keep the reward selected when a case is opened separate from the reward
-- that originally granted the right to open that case.
ALTER TABLE "GuestGameEntitlement"
  ADD COLUMN "sourceRewardId" TEXT;

CREATE UNIQUE INDEX "guest_game_entitlement_source_reward_uidx"
  ON "GuestGameEntitlement" ("sourceRewardId");

ALTER TABLE "GuestGameEntitlement"
  ADD CONSTRAINT "GuestGameEntitlement_sourceRewardId_fkey"
  FOREIGN KEY ("sourceRewardId") REFERENCES "GuestGameReward"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep old application processes safe after this transaction commits and
-- before every API process has restarted. Old binaries treat a zero-value
-- case parent as an ordinary claim: deliveryRequestedAt + CLAIMED wallet +
-- CANCELED effect. Normalize every supported case parent at the database
-- boundary and reject a stale old-binary claim attempt atomically. The
-- follow-up contract migration removes this short-lived write shield.
CREATE OR REPLACE FUNCTION
  "guest_game_reward_guard_case_parent_claim"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."rewardType" = 'LOOT_BOX_ENTITLEMENT'
     AND (
       NEW."missionId" IS NOT NULL
       OR (
         NEW."seasonId" IS NOT NULL
         AND NEW."evidence" #>> '{rule,battlePassRewardTrack}' = 'FREE'
       )
     )
  THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW."deliveryRequestedAt" IS NOT NULL THEN
        RAISE EXCEPTION
          'Loot-box parent rewards cannot enter ordinary claim delivery'
          USING ERRCODE = '40001';
      END IF;
    ELSIF NEW."deliveryRequestedAt" IS NOT NULL
       AND (
         NEW."deliveryRequestedAt" IS DISTINCT FROM OLD."deliveryRequestedAt"
         OR OLD."rewardType" IS DISTINCT FROM 'LOOT_BOX_ENTITLEMENT'
         OR NOT COALESCE(
           OLD."missionId" IS NOT NULL
           OR (
             OLD."seasonId" IS NOT NULL
             AND OLD."evidence" #>> '{rule,battlePassRewardTrack}' = 'FREE'
           ),
           false
         )
       )
    THEN
        RAISE EXCEPTION
          'Loot-box parent rewards cannot enter ordinary claim delivery'
          USING ERRCODE = '40001';
    END IF;

    NEW."claimRequired" := false;
    NEW."claimExpiresAt" := NULL;
    NEW."rewardCode" := NULL;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "GuestGameReward_guard_case_parent_claim"
BEFORE INSERT OR UPDATE
ON "GuestGameReward"
FOR EACH ROW
EXECUTE FUNCTION "guest_game_reward_guard_case_parent_claim"();

-- Historical mission/Battle Pass case grants stored their parent reward in
-- evidence.rewardId and, before opening, also in entitlement.rewardId. Prefer
-- immutable evidence so an already consumed outcome prize is never mistaken
-- for the parent. A disagreement is unsafe and must block the migration rather
-- than silently turn one parent into an apparent outcome.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "GuestGameEntitlement" AS entitlement
    JOIN "GuestGameReward" AS evidence_reward
      ON evidence_reward."id" =
        NULLIF(entitlement."evidence" ->> 'rewardId', '')
     AND evidence_reward."tenantId" = entitlement."tenantId"
     AND evidence_reward."profileId" = entitlement."profileId"
     AND evidence_reward."rewardType" = 'LOOT_BOX_ENTITLEMENT'
     AND (
       evidence_reward."missionId" IS NOT NULL
       OR evidence_reward."seasonId" IS NOT NULL
     )
    JOIN "GuestGameReward" AS linked_reward
      ON linked_reward."id" = entitlement."rewardId"
     AND linked_reward."tenantId" = entitlement."tenantId"
     AND linked_reward."profileId" = entitlement."profileId"
     AND linked_reward."rewardType" = 'LOOT_BOX_ENTITLEMENT'
     AND (
       linked_reward."missionId" IS NOT NULL
       OR linked_reward."seasonId" IS NOT NULL
     )
    WHERE evidence_reward."id" <> linked_reward."id"
  ) THEN
    RAISE EXCEPTION
      'Conflicting legacy case source rewards require reconciliation before migration';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    WITH source_candidates AS (
      SELECT
        entitlement."id" AS "entitlementId",
        COALESCE(evidence_reward."id", linked_reward."id") AS "sourceRewardId"
      FROM "GuestGameEntitlement" AS entitlement
      LEFT JOIN "GuestGameReward" AS evidence_reward
        ON evidence_reward."id" =
          NULLIF(entitlement."evidence" ->> 'rewardId', '')
       AND evidence_reward."tenantId" = entitlement."tenantId"
       AND evidence_reward."profileId" = entitlement."profileId"
       AND evidence_reward."rewardType" = 'LOOT_BOX_ENTITLEMENT'
       AND (
         evidence_reward."missionId" IS NOT NULL
         OR evidence_reward."seasonId" IS NOT NULL
       )
      LEFT JOIN "GuestGameReward" AS linked_reward
        ON linked_reward."id" = entitlement."rewardId"
       AND linked_reward."tenantId" = entitlement."tenantId"
       AND linked_reward."profileId" = entitlement."profileId"
       AND linked_reward."rewardType" = 'LOOT_BOX_ENTITLEMENT'
       AND (
         linked_reward."missionId" IS NOT NULL
         OR linked_reward."seasonId" IS NOT NULL
       )
    )
    SELECT 1
    FROM source_candidates
    WHERE "sourceRewardId" IS NOT NULL
    GROUP BY "sourceRewardId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate legacy case source rewards require reconciliation before migration';
  END IF;
END
$$;

WITH source_candidates AS (
  SELECT
    entitlement."id" AS "entitlementId",
    COALESCE(evidence_reward."id", linked_reward."id") AS "sourceRewardId"
  FROM "GuestGameEntitlement" AS entitlement
  LEFT JOIN "GuestGameReward" AS evidence_reward
    ON evidence_reward."id" =
      NULLIF(entitlement."evidence" ->> 'rewardId', '')
   AND evidence_reward."tenantId" = entitlement."tenantId"
   AND evidence_reward."profileId" = entitlement."profileId"
   AND evidence_reward."rewardType" = 'LOOT_BOX_ENTITLEMENT'
   AND (
     evidence_reward."missionId" IS NOT NULL
     OR evidence_reward."seasonId" IS NOT NULL
   )
  LEFT JOIN "GuestGameReward" AS linked_reward
    ON linked_reward."id" = entitlement."rewardId"
   AND linked_reward."tenantId" = entitlement."tenantId"
   AND linked_reward."profileId" = entitlement."profileId"
   AND linked_reward."rewardType" = 'LOOT_BOX_ENTITLEMENT'
   AND (
     linked_reward."missionId" IS NOT NULL
     OR linked_reward."seasonId" IS NOT NULL
   )
  WHERE entitlement."sourceRewardId" IS NULL
)
UPDATE "GuestGameEntitlement" AS entitlement
SET "sourceRewardId" = source_candidates."sourceRewardId"
FROM source_candidates
WHERE source_candidates."entitlementId" = entitlement."id"
  AND source_candidates."sourceRewardId" IS NOT NULL;

-- Expand/contract compatibility: retain rewardId=sourceRewardId for historical
-- unopened rows during the first deployment. origin/main uses that legacy
-- alias to de-duplicate case limits. The new application reads sourceRewardId
-- first and accepts either the alias or NULL until the follow-up contract
-- migration clears the alias after every old process has been replaced.

-- Shield the short migration-to-restart window. An old binary can still insert
-- a mission/FREE-season parent into rewardId; copy that supported source into
-- sourceRewardId while retaining the alias for its old evaluator.
CREATE OR REPLACE FUNCTION
  "guest_game_entitlement_capture_legacy_source_reward"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  legacy_source_reward_id TEXT;
  legacy_source_event_id TEXT;
BEGIN
  IF NEW."sourceRewardId" IS NULL
     AND NEW."rewardId" IS NOT NULL
     AND NEW."ruleType" = 'LOOT_BOX'
     AND NEW."status" = 'AVAILABLE'
     AND NEW."consumedAt" IS NULL
  THEN
    SELECT reward."id", intent."eventId"
    INTO legacy_source_reward_id, legacy_source_event_id
    FROM "GuestGameReward" AS reward
    LEFT JOIN "GuestGameRewardIntent" AS intent
      ON intent."tenantId" = reward."tenantId"
     AND intent."idempotencyKey" = reward."idempotencyKey"
     AND intent."effectKind" = 'REWARD'
    WHERE reward."id" = NEW."rewardId"
      AND reward."tenantId" = NEW."tenantId"
      AND reward."profileId" = NEW."profileId"
      AND reward."rewardType" = 'LOOT_BOX_ENTITLEMENT'
      AND reward."status" IN ('APPROVED', 'PAID')
      AND (
        reward."missionId" IS NOT NULL
        OR (
          reward."seasonId" IS NOT NULL
          AND reward."evidence" #>> '{rule,battlePassRewardTrack}' = 'FREE'
        )
      )
    LIMIT 1;

    IF legacy_source_reward_id IS NOT NULL THEN
      NEW."sourceRewardId" := legacy_source_reward_id;
      IF NEW."eventId" IS NULL AND legacy_source_event_id IS NOT NULL THEN
        NEW."eventId" := legacy_source_event_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER
  "GuestGameEntitlement_capture_legacy_source_reward"
BEFORE INSERT OR UPDATE OF "rewardId", "sourceRewardId"
ON "GuestGameEntitlement"
FOR EACH ROW
EXECUTE FUNCTION "guest_game_entitlement_capture_legacy_source_reward"();

DO $$
BEGIN
  IF EXISTS (
    SELECT intent."tenantId", intent."rewardId"
    FROM "GuestGameRewardIntent" AS intent
    WHERE intent."rewardId" IS NOT NULL
      AND intent."effectKind" = 'REWARD'
    GROUP BY intent."tenantId", intent."rewardId"
    HAVING COUNT(DISTINCT intent."eventId") > 1
  ) THEN
    RAISE EXCEPTION
      'Case source rewards linked to multiple events require reconciliation before migration';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "GuestGameEntitlement" AS entitlement
    JOIN "GuestGameRewardIntent" AS intent
      ON intent."tenantId" = entitlement."tenantId"
     AND intent."rewardId" = entitlement."sourceRewardId"
     AND intent."effectKind" = 'REWARD'
    WHERE entitlement."eventId" IS NOT NULL
      AND entitlement."eventId" <> intent."eventId"
  ) THEN
    RAISE EXCEPTION
      'Case source entitlement event mismatch requires reconciliation before migration';
  END IF;
END
$$;

WITH unique_reward_events AS (
  SELECT
    intent."tenantId",
    intent."rewardId",
    MIN(intent."eventId") AS "eventId"
  FROM "GuestGameRewardIntent" AS intent
  WHERE intent."rewardId" IS NOT NULL
    AND intent."effectKind" = 'REWARD'
  GROUP BY intent."tenantId", intent."rewardId"
  HAVING COUNT(DISTINCT intent."eventId") = 1
)
UPDATE "GuestGameEntitlement" AS entitlement
SET "eventId" = unique_reward_events."eventId"
FROM unique_reward_events
WHERE entitlement."sourceRewardId" = unique_reward_events."rewardId"
  AND entitlement."tenantId" = unique_reward_events."tenantId"
  AND entitlement."eventId" IS NULL;

-- Freeze the exact repair set for the whole migration. Ordinary unclaimed
-- rewards must still be inside the 30-day wallet retention window. A legacy
-- claim is recoverable at any age only when it was accepted before its
-- deadline and the old zero-value claim path canceled the case effect with
-- the exact known reason.
CREATE TEMP TABLE "_GuestGameCaseRewardLifecycleRepair"
ON COMMIT DROP
AS
SELECT
  reward."tenantId",
  reward."id" AS "rewardId",
  (
    reward."deliveryRequestedAt" IS NOT NULL
    AND reward."claimExpiresAt" IS NOT NULL
    AND reward."deliveryRequestedAt" < reward."claimExpiresAt"
    AND EXISTS (
      SELECT 1
      FROM "GuestGameRewardEffect" AS claimed_effect
      WHERE claimed_effect."tenantId" = reward."tenantId"
        AND claimed_effect."rewardId" = reward."id"
        AND claimed_effect."effectKind" = 'LOOT_BOX_ENTITLEMENT'
        AND claimed_effect."status" = 'CANCELED'
        AND claimed_effect."result" ->> 'reason' =
          'claimed_without_external_delivery'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "GuestGameEntitlement" AS claimed_entitlement
      WHERE claimed_entitlement."tenantId" = reward."tenantId"
        AND claimed_entitlement."sourceRewardId" = reward."id"
    )
  ) AS "legacyClaimAccepted"
FROM "GuestGameReward" AS reward
JOIN "GuestGameProfile" AS profile
  ON profile."id" = reward."profileId"
 AND profile."tenantId" = reward."tenantId"
 AND profile."status" = 'ACTIVE'
 AND profile."gameActivatedAt" IS NOT NULL
 AND reward."qualifiedAt" >= profile."gameActivatedAt"
WHERE reward."rewardType" = 'LOOT_BOX_ENTITLEMENT'
  AND reward."status" IN ('PENDING', 'APPROVED', 'PAID')
  AND (
    reward."missionId" IS NOT NULL
    OR (
      reward."seasonId" IS NOT NULL
      AND reward."evidence" #>> '{rule,battlePassRewardTrack}' = 'FREE'
    )
  )
  AND reward."qualifiedAt" <= CURRENT_TIMESTAMP
  AND (
    (
      reward."deliveryRequestedAt" IS NULL
      AND reward."qualifiedAt" >
        CURRENT_TIMESTAMP - INTERVAL '30 days'
    )
    OR (
      reward."deliveryRequestedAt" IS NOT NULL
      AND reward."claimExpiresAt" IS NOT NULL
      AND reward."deliveryRequestedAt" < reward."claimExpiresAt"
      AND EXISTS (
        SELECT 1
        FROM "GuestGameRewardEffect" AS claimed_effect
        WHERE claimed_effect."tenantId" = reward."tenantId"
          AND claimed_effect."rewardId" = reward."id"
          AND claimed_effect."effectKind" = 'LOOT_BOX_ENTITLEMENT'
          AND claimed_effect."status" = 'CANCELED'
          AND claimed_effect."result" ->> 'reason' =
            'claimed_without_external_delivery'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "GuestGameEntitlement" AS claimed_entitlement
        WHERE claimed_entitlement."tenantId" = reward."tenantId"
          AND claimed_entitlement."sourceRewardId" = reward."id"
      )
    )
  )
  AND (
    NULLIF(
      reward."evidence" #>> '{rule,rewardLootBoxId}',
      ''
    ) IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM "GuestGameMission" AS mission
      WHERE mission."id" = reward."missionId"
        AND mission."tenantId" = reward."tenantId"
        AND NULLIF(
          mission."conditions" #>> '{reward,lootBoxId}',
          ''
        ) IS NOT NULL
        AND mission."updatedAt" =
          pg_temp.guest_game_try_timestamptz(
            reward."evidence" #>> '{rule,ruleUpdatedAt}'
          )
    )
  );

UPDATE "GuestGameReward" AS reward
SET
  "claimRequired" = false,
  "claimExpiresAt" = NULL,
  "rewardCode" = NULL,
  "evidence" = CASE
    WHEN repair."legacyClaimAccepted" = true
    THEN jsonb_set(
      CASE
        WHEN jsonb_typeof(reward."evidence") = 'object'
        THEN reward."evidence"
        ELSE '{}'::jsonb
      END,
      '{caseRewardLegacyClaim}',
      jsonb_build_object(
        'acceptedAt', reward."deliveryRequestedAt",
        'originalClaimExpiresAt', reward."claimExpiresAt",
        'repairedAt', CURRENT_TIMESTAMP
      ),
      true
    )
    ELSE reward."evidence"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_GuestGameCaseRewardLifecycleRepair" AS repair
WHERE repair."tenantId" = reward."tenantId"
  AND repair."rewardId" = reward."id"
  AND (
    reward."claimRequired" = true
    OR reward."claimExpiresAt" IS NOT NULL
    OR reward."rewardCode" IS NOT NULL
  );

-- Parent REWARD wallet rows belonged to the obsolete ordinary-claim path.
-- Remove only unaccepted pending rows from the verified repair set. Preserve
-- an exact accepted legacy claim as terminal audit history instead of leaving
-- a hidden PROCESSING/FAILED row that can never re-enter normal expiry.
DELETE FROM "GuestGameRewardWalletItem" AS wallet
USING "_GuestGameCaseRewardLifecycleRepair" AS repair
WHERE repair."tenantId" = wallet."tenantId"
  AND repair."rewardId" = wallet."rewardId"
  AND repair."legacyClaimAccepted" = false
  AND wallet."kind" = 'REWARD'
  AND wallet."status" = 'PENDING'
  AND wallet."entitlementId" IS NULL;

UPDATE "GuestGameRewardWalletItem" AS wallet
SET
  "status" = 'CLAIMED',
  "claimedAt" = COALESCE(
    wallet."claimedAt",
    reward."deliveryRequestedAt",
    CURRENT_TIMESTAMP
  ),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_GuestGameCaseRewardLifecycleRepair" AS repair
JOIN "GuestGameReward" AS reward
  ON reward."tenantId" = repair."tenantId"
 AND reward."id" = repair."rewardId"
WHERE repair."tenantId" = wallet."tenantId"
  AND repair."rewardId" = wallet."rewardId"
  AND repair."legacyClaimAccepted" = true
  AND wallet."kind" = 'REWARD'
  AND wallet."status" IN ('PENDING', 'PROCESSING', 'FAILED')
  AND wallet."entitlementId" IS NULL;

-- Repair an interrupted reward/effect write before releasing legacy effects.
-- The unique slot and idempotency indexes make this insert replay-safe.
INSERT INTO "GuestGameRewardEffect" (
  "id",
  "tenantId",
  "rewardId",
  "effectKind",
  "slotKey",
  "idempotencyKey",
  "status",
  "payload",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  reward."tenantId",
  reward."id",
  'LOOT_BOX_ENTITLEMENT',
  'primary',
  'guest-game-reward-effect:v1:' ||
    reward."id" ||
    ':LOOT_BOX_ENTITLEMENT:primary',
  'PENDING',
  jsonb_build_object(
    'schemaVersion', 1,
    'rewardId', reward."id",
    'effectKind', 'LOOT_BOX_ENTITLEMENT'
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "GuestGameReward" AS reward
JOIN "_GuestGameCaseRewardLifecycleRepair" AS repair
  ON repair."tenantId" = reward."tenantId"
 AND repair."rewardId" = reward."id"
WHERE reward."status" IN ('APPROVED', 'PAID')
ON CONFLICT ("tenantId", "rewardId", "effectKind", "slotKey") DO NOTHING;

-- LOOT_BOX_ENTITLEMENT effects were incorrectly parked behind the ordinary
-- reward claim. A CANCELED effect is reopened only for the exact legacy claim
-- outcome captured above. A previously false-positive APPLIED effect is also
-- retried only when the verified repair reward still has no entitlement.
-- Arbitrary canceled or expired rows remain terminal.
UPDATE "GuestGameRewardEffect" AS effect
SET
  "status" = 'PENDING',
  "attempts" = 0,
  "leaseVersion" = effect."leaseVersion" + 1,
  "nextAttemptAt" = NULL,
  "claimedAt" = NULL,
  "claimExpiresAt" = NULL,
  "appliedAt" = NULL,
  "lastError" = NULL,
  "result" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_GuestGameCaseRewardLifecycleRepair" AS repair
WHERE repair."tenantId" = effect."tenantId"
  AND repair."rewardId" = effect."rewardId"
  AND effect."effectKind" = 'LOOT_BOX_ENTITLEMENT'
  AND (
    effect."status" = 'WAITING_CLAIM'
    OR (
      repair."legacyClaimAccepted" = true
      AND effect."status" = 'CANCELED'
      AND effect."result" ->> 'reason' =
        'claimed_without_external_delivery'
    )
    OR (
      effect."status" = 'APPLIED'
      AND NOT EXISTS (
        SELECT 1
        FROM "GuestGameEntitlement" AS applied_entitlement
        WHERE applied_entitlement."tenantId" = effect."tenantId"
          AND applied_entitlement."sourceRewardId" = effect."rewardId"
      )
    )
  );

COMMIT;
