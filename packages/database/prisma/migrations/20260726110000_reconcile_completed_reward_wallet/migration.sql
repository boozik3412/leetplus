-- Normalize the legacy "start of season" AUTO/ADMIN_OTHER row into an
-- explicit non-deliverable marker. The narrow structural predicate avoids
-- reclassifying generic premium or multi-reward Battle Pass rows.
UPDATE "GuestGameReward" AS reward
SET
    "rewardType" = 'BATTLE_PASS_COMPLETION_MARKER',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "GuestGameSeason" AS season
WHERE season."tenantId" = reward."tenantId"
  AND season."id" = reward."seasonId"
  AND reward."status" IN ('APPROVED', 'PAID')
  AND reward."source" = 'API_IMPORT'
  AND UPPER(BTRIM(reward."rewardType")) = 'BATTLE_PASS_REWARD'
  AND reward."rewardAmount" = 0
  AND LOWER(BTRIM(reward."rewardLabel")) = 'старт сезона'
  AND reward."evidence" #>> '{source}' =
      'guest_gamification_process_event'
  AND reward."evidence" #>> '{rule,kind}' = 'SEASON'
  AND reward."evidence" #>> '{rule,battlePassStep}' = '1'
  AND reward."evidence" #>> '{rule,battlePassRewardTrack}' IS NULL
  AND reward."evidence" #>> '{rule,rewardLootBoxId}' IS NULL
  AND reward."evidence" #>> '{rule,manualApprovalRequired}' = 'false'
  AND (
      reward."evidence" #> '{rule,selectedReward}' IS NULL
      OR reward."evidence" #> '{rule,selectedReward}' = 'null'::jsonb
  )
  AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
          COALESCE(season."levels", '[]'::jsonb)
      ) AS level(value)
      WHERE COALESCE(
          level.value ->> 'sequence',
          level.value ->> 'level'
      ) = reward."evidence" #>> '{rule,battlePassStep}'
        AND UPPER(
            BTRIM(COALESCE(
                level.value #>> '{freeRewardDetails,type}',
                ''
            ))
        ) = 'ADMIN_OTHER'
        AND UPPER(
            BTRIM(COALESCE(
                level.value #>> '{freeRewardDetails,delivery}',
                'AUTO'
            ))
        ) = 'AUTO'
        AND NULLIF(BTRIM(COALESCE(
            level.value ->> 'premiumReward',
            ''
        )), '') IS NULL
        AND (
            level.value -> 'premiumRewardDetails' IS NULL
            OR level.value -> 'premiumRewardDetails' = 'null'::jsonb
            OR level.value -> 'premiumRewardDetails' = '{}'::jsonb
        )
  );

-- Persist the explicit contract in the season configuration. This keeps the
-- same start step non-deliverable for guests who reach it after deployment,
-- while every ordinary ADMIN_OTHER prize remains on the claimable path.
UPDATE "GuestGameSeason" AS season
SET
    "levels" = (
        SELECT jsonb_agg(
            CASE
                WHEN
                    UPPER(BTRIM(COALESCE(
                        level.value #>> '{freeRewardDetails,type}',
                        ''
                    ))) = 'ADMIN_OTHER'
                    AND UPPER(BTRIM(COALESCE(
                        level.value #>> '{freeRewardDetails,delivery}',
                        'AUTO'
                    ))) = 'AUTO'
                    AND NULLIF(BTRIM(COALESCE(
                        level.value ->> 'premiumReward',
                        ''
                    )), '') IS NULL
                    AND (
                        level.value -> 'premiumRewardDetails' IS NULL
                        OR level.value -> 'premiumRewardDetails' = 'null'::jsonb
                        OR level.value -> 'premiumRewardDetails' = '{}'::jsonb
                    )
                    AND EXISTS (
                        SELECT 1
                        FROM "GuestGameReward" AS reward
                        WHERE reward."tenantId" = season."tenantId"
                          AND reward."seasonId" = season."id"
                          AND reward."status" IN ('APPROVED', 'PAID')
                          AND UPPER(BTRIM(reward."rewardType")) =
                              'BATTLE_PASS_COMPLETION_MARKER'
                          AND reward."rewardAmount" = 0
                          AND reward."evidence" #>> '{rule,battlePassStep}' =
                              COALESCE(
                                  level.value ->> 'sequence',
                                  level.value ->> 'level'
                              )
                    )
                THEN jsonb_set(
                    level.value,
                    '{freeRewardDetails,type}',
                    to_jsonb('BATTLE_PASS_COMPLETION_MARKER'::text),
                    true
                )
                ELSE level.value
            END
            ORDER BY level.ordinality
        )
        FROM jsonb_array_elements(
            COALESCE(season."levels", '[]'::jsonb)
        ) WITH ORDINALITY AS level(value, ordinality)
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1
    FROM "GuestGameReward" AS reward
    WHERE reward."tenantId" = season."tenantId"
      AND reward."seasonId" = season."id"
      AND reward."status" IN ('APPROVED', 'PAID')
      AND UPPER(BTRIM(reward."rewardType")) =
          'BATTLE_PASS_COMPLETION_MARKER'
      AND reward."rewardAmount" = 0
)
  AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
          COALESCE(season."levels", '[]'::jsonb)
      ) AS level(value)
      WHERE UPPER(BTRIM(COALESCE(
                level.value #>> '{freeRewardDetails,type}',
                ''
            ))) = 'ADMIN_OTHER'
        AND EXISTS (
            SELECT 1
            FROM "GuestGameReward" AS reward
            WHERE reward."tenantId" = season."tenantId"
              AND reward."seasonId" = season."id"
              AND reward."status" IN ('APPROVED', 'PAID')
              AND UPPER(BTRIM(reward."rewardType")) =
                  'BATTLE_PASS_COMPLETION_MARKER'
              AND reward."rewardAmount" = 0
              AND reward."evidence" #>> '{rule,battlePassStep}' =
                  COALESCE(
                      level.value ->> 'sequence',
                      level.value ->> 'level'
                  )
        )
  );

-- Settled rewards belong in wallet history, never in the pending counter.
-- Repair canonical reward state first when the bonus ledger already confirmed
-- the external write.
WITH confirmed_rewards AS MATERIALIZED (
    SELECT
        reward."id",
        reward."tenantId",
        MAX(
            COALESCE(
                ledger."confirmedAt",
                ledger."processedAt",
                ledger."updatedAt"
            )
        ) AS "settledAt"
    FROM "GuestGameReward" AS reward
    INNER JOIN "GuestBonusLedgerEntry" AS ledger
        ON ledger."tenantId" = reward."tenantId"
       AND ledger."rewardId" = reward."id"
    WHERE ledger."status" = 'CONFIRMED'
      AND ledger."source" = 'GAMIFICATION_REWARD'
      AND ledger."entryType" = 'EARN'
    GROUP BY reward."id", reward."tenantId"
)
UPDATE "GuestGameReward" AS reward
SET
    "status" = 'PAID',
    "paidAt" = COALESCE(
        reward."paidAt",
        confirmed_rewards."settledAt",
        reward."qualifiedAt"
    ),
    "updatedAt" = CURRENT_TIMESTAMP
FROM confirmed_rewards
WHERE reward."id" = confirmed_rewards."id"
  AND reward."tenantId" = confirmed_rewards."tenantId"
  AND (
      reward."status" <> 'PAID'
      OR reward."paidAt" IS NULL
  );

-- An explicit zero-value Battle Pass completion marker is not a deliverable
-- prize. It remains in history as received.
UPDATE "GuestGameReward" AS reward
SET
    "claimRequired" = false,
    "deliveryRequestedAt" = NULL,
    "claimExpiresAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE UPPER(BTRIM(COALESCE(reward."rewardType", ''))) =
      'BATTLE_PASS_COMPLETION_MARKER'
  AND reward."rewardAmount" = 0
  AND reward."status" IN ('APPROVED', 'PAID')
  AND (
      reward."claimRequired" = true
      OR reward."deliveryRequestedAt" IS NOT NULL
      OR reward."claimExpiresAt" IS NOT NULL
  );

-- Preserve existing rows, but make every authoritative settled result terminal.
WITH settled_wallet_items AS MATERIALIZED (
    SELECT
        wallet."id",
        wallet."tenantId",
        COALESCE(
            wallet."claimedAt",
            reward."paidAt",
            (
                SELECT MAX(
                    COALESCE(
                        ledger."confirmedAt",
                        ledger."processedAt",
                        ledger."updatedAt"
                    )
                )
                FROM "GuestBonusLedgerEntry" AS ledger
                WHERE ledger."tenantId" = reward."tenantId"
                  AND ledger."rewardId" = reward."id"
                  AND ledger."status" = 'CONFIRMED'
                  AND ledger."source" = 'GAMIFICATION_REWARD'
                  AND ledger."entryType" = 'EARN'
            ),
            (
                SELECT MAX(
                    COALESCE(delivery."sentAt", delivery."updatedAt")
                )
                FROM "GuestGameDelivery" AS delivery
                WHERE delivery."tenantId" = reward."tenantId"
                  AND delivery."rewardId" = reward."id"
                  AND delivery."status" = 'SENT'
            ),
            reward."qualifiedAt"
        ) AS "settledAt"
    FROM "GuestGameRewardWalletItem" AS wallet
    INNER JOIN "GuestGameReward" AS reward
        ON reward."tenantId" = wallet."tenantId"
       AND reward."id" = wallet."rewardId"
    WHERE wallet."kind" = 'REWARD'
      AND wallet."status" IN ('PENDING', 'PROCESSING', 'FAILED')
      AND (
          reward."status" = 'PAID'
          OR reward."paidAt" IS NOT NULL
          OR (
              UPPER(BTRIM(COALESCE(reward."rewardType", ''))) =
                'BATTLE_PASS_COMPLETION_MARKER'
              AND reward."rewardAmount" = 0
              AND reward."status" IN ('APPROVED', 'PAID')
          )
          OR EXISTS (
              SELECT 1
              FROM "GuestBonusLedgerEntry" AS ledger
              WHERE ledger."tenantId" = reward."tenantId"
                AND ledger."rewardId" = reward."id"
                AND ledger."status" = 'CONFIRMED'
                AND ledger."source" = 'GAMIFICATION_REWARD'
                AND ledger."entryType" = 'EARN'
          )
          OR EXISTS (
              SELECT 1
              FROM "GuestGameDelivery" AS delivery
              WHERE delivery."tenantId" = reward."tenantId"
                AND delivery."rewardId" = reward."id"
                AND delivery."status" = 'SENT'
          )
      )
)
UPDATE "GuestGameRewardWalletItem" AS wallet
SET
    "status" = 'CLAIMED',
    "claimedAt" = settled_wallet_items."settledAt",
    "updatedAt" = CURRENT_TIMESTAMP
FROM settled_wallet_items
WHERE wallet."id" = settled_wallet_items."id"
  AND wallet."tenantId" = settled_wallet_items."tenantId"
  AND wallet."status" IN ('PENDING', 'PROCESSING', 'FAILED');

-- Backfill a durable CLAIMED history row for settled rewards that predate the
-- wallet. The 30-day participation boundary stays authoritative.
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
    'CLAIMED',
    reward."qualifiedAt",
    reward."qualifiedAt" + INTERVAL '30 days',
    COALESCE(
        reward."paidAt",
        (
            SELECT MAX(
                COALESCE(
                    ledger."confirmedAt",
                    ledger."processedAt",
                    ledger."updatedAt"
                )
            )
            FROM "GuestBonusLedgerEntry" AS ledger
            WHERE ledger."tenantId" = reward."tenantId"
              AND ledger."rewardId" = reward."id"
              AND ledger."status" = 'CONFIRMED'
              AND ledger."source" = 'GAMIFICATION_REWARD'
              AND ledger."entryType" = 'EARN'
        ),
        (
            SELECT MAX(COALESCE(delivery."sentAt", delivery."updatedAt"))
            FROM "GuestGameDelivery" AS delivery
            WHERE delivery."tenantId" = reward."tenantId"
              AND delivery."rewardId" = reward."id"
              AND delivery."status" = 'SENT'
        ),
        reward."qualifiedAt"
    ),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "GuestGameReward" AS reward
INNER JOIN "GuestGameProfile" AS profile
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
  AND reward."rewardType" <> 'LOOT_BOX_ENTITLEMENT'
  AND profile."gameActivatedAt" IS NOT NULL
  AND reward."qualifiedAt" >= profile."gameActivatedAt"
  AND reward."qualifiedAt" > CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND reward."qualifiedAt" <= CURRENT_TIMESTAMP
  AND (
      reward."status" = 'PAID'
      OR reward."paidAt" IS NOT NULL
      OR (
          UPPER(BTRIM(COALESCE(reward."rewardType", ''))) =
            'BATTLE_PASS_COMPLETION_MARKER'
          AND reward."rewardAmount" = 0
          AND reward."status" IN ('APPROVED', 'PAID')
      )
      OR EXISTS (
          SELECT 1
          FROM "GuestBonusLedgerEntry" AS ledger
          WHERE ledger."tenantId" = reward."tenantId"
            AND ledger."rewardId" = reward."id"
            AND ledger."status" = 'CONFIRMED'
            AND ledger."source" = 'GAMIFICATION_REWARD'
            AND ledger."entryType" = 'EARN'
      )
      OR EXISTS (
          SELECT 1
          FROM "GuestGameDelivery" AS delivery
          WHERE delivery."tenantId" = reward."tenantId"
            AND delivery."rewardId" = reward."id"
            AND delivery."status" = 'SENT'
      )
  )
ON CONFLICT ("tenantId", "rewardId") DO UPDATE
SET
    "status" = 'CLAIMED',
    "claimedAt" = COALESCE(
        "GuestGameRewardWalletItem"."claimedAt",
        EXCLUDED."claimedAt"
    ),
    "updatedAt" = CURRENT_TIMESTAMP;
