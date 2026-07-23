INSERT INTO "GuestGameCompletionNotification" (
    "id",
    "tenantId",
    "profileId",
    "rewardId",
    "kind",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    reward."tenantId",
    reward."profileId",
    reward."id",
    CASE
        WHEN reward."missionId" IS NOT NULL THEN 'MISSION'
        ELSE 'BATTLE_PASS'
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "GuestGameReward" AS reward
JOIN "GuestGameProfile" AS profile
    ON profile."id" = reward."profileId"
LEFT JOIN "GuestGameMission" AS mission
    ON mission."id" = reward."missionId"
LEFT JOIN "GuestGameSeason" AS season
    ON season."id" = reward."seasonId"
WHERE reward."profileId" IS NOT NULL
  AND reward."status" <> 'CANCELED'
  AND profile."status" = 'ACTIVE'
  AND (
      (
          mission."id" IS NOT NULL
          AND mission."status" = 'ACTIVE'
          AND (mission."periodFrom" IS NULL OR reward."qualifiedAt" >= mission."periodFrom")
          AND (mission."periodTo" IS NULL OR reward."qualifiedAt" <= mission."periodTo")
      )
      OR
      (
          season."id" IS NOT NULL
          AND season."status" = 'ACTIVE'
          AND (season."periodFrom" IS NULL OR reward."qualifiedAt" >= season."periodFrom")
          AND (season."periodTo" IS NULL OR reward."qualifiedAt" <= season."periodTo")
      )
  )
ON CONFLICT ("tenantId", "rewardId") DO NOTHING;
