ALTER TABLE "GuestGameMission"
  ADD COLUMN "maxPendingRewards" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "GuestGameMission"
  ADD CONSTRAINT "guest_game_mission_max_pending_rewards_check"
  CHECK ("maxPendingRewards" >= 1);

UPDATE "GuestGameLootBox"
SET "limits" = jsonb_set(
  COALESCE("limits"::jsonb, '{}'::jsonb),
  '{maxPendingRewards}',
  '1'::jsonb,
  true
);
