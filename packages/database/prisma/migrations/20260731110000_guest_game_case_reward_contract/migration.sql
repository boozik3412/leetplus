-- Contract the temporary compatibility layer installed by
-- 20260731090000_guest_game_case_reward_lifecycle. Apply this migration only
-- after every API process runs the sourceRewardId-aware application version.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regclass(
       'public.guest_game_entitlement_source_reward_uidx'
     ) IS NULL
     OR to_regprocedure(
       'public.guest_game_reward_guard_case_parent_claim()'
     ) IS NULL
     OR to_regprocedure(
       'public.guest_game_entitlement_capture_legacy_source_reward()'
     ) IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'GuestGameEntitlement'
         AND column_name = 'sourceRewardId'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_index
       WHERE indexrelid = to_regclass(
           'public.guest_game_entitlement_source_reward_uidx'
         )
         AND indrelid = 'public."GuestGameEntitlement"'::regclass
         AND indisunique
         AND indisready
         AND indisvalid
         AND indislive
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'GuestGameEntitlement_sourceRewardId_fkey'
         AND conrelid = 'public."GuestGameEntitlement"'::regclass
         AND confrelid = 'public."GuestGameReward"'::regclass
         AND contype = 'f'
         AND confdeltype = 'r'
         AND confupdtype = 'c'
         AND convalidated
     )
     OR EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname =
         'GuestGameEntitlement_sourceOutcome_distinct_check'
         AND conrelid = 'public."GuestGameEntitlement"'::regclass
     )
  THEN
    RAISE EXCEPTION
      'Case reward contract requires the exact completed expand schema';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgrelid = 'public."GuestGameReward"'::regclass
         AND tgname = 'GuestGameReward_guard_case_parent_claim'
         AND tgfoid = to_regprocedure(
           'public.guest_game_reward_guard_case_parent_claim()'
         )
         AND tgenabled = 'O'
         AND NOT tgisinternal
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgrelid = 'public."GuestGameEntitlement"'::regclass
         AND tgname =
           'GuestGameEntitlement_capture_legacy_source_reward'
         AND tgfoid = to_regprocedure(
           'public.guest_game_entitlement_capture_legacy_source_reward()'
         )
         AND tgenabled = 'O'
         AND NOT tgisinternal
     )
  THEN
    RAISE EXCEPTION
      'Case reward contract requires both enabled expand compatibility triggers';
  END IF;
END
$$;

-- Match the application write order while retiring the old-binary shield.
-- DDL upgrades these locks as needed and holds them through COMMIT.
LOCK TABLE
  public."GuestGameReward",
  public."GuestGameEntitlement"
IN SHARE ROW EXCLUSIVE MODE;

-- A consumed case must point rewardId at the randomly selected outcome, never
-- back at its source parent. Stop instead of erasing ambiguous evidence.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."GuestGameEntitlement"
    WHERE "sourceRewardId" IS NOT NULL
      AND "rewardId" = "sourceRewardId"
      AND (
        "status" = 'CONSUMED'
        OR "consumedAt" IS NOT NULL
      )
  )
  THEN
    RAISE EXCEPTION
      'Case reward contract found a consumed source/outcome alias';
  END IF;
END
$$;

-- The expand wave retained rewardId=sourceRewardId only for compatibility with
-- old application processes. New code reads sourceRewardId for the grant and
-- reserves rewardId exclusively for the prize selected during manual opening.
UPDATE public."GuestGameEntitlement"
SET
  "rewardId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "sourceRewardId" IS NOT NULL
  AND "rewardId" = "sourceRewardId";

DROP TRIGGER "GuestGameEntitlement_capture_legacy_source_reward"
  ON public."GuestGameEntitlement";
DROP FUNCTION public."guest_game_entitlement_capture_legacy_source_reward"();

DROP TRIGGER "GuestGameReward_guard_case_parent_claim"
  ON public."GuestGameReward";
DROP FUNCTION public."guest_game_reward_guard_case_parent_claim"();

ALTER TABLE public."GuestGameEntitlement"
  ADD CONSTRAINT
    "GuestGameEntitlement_sourceOutcome_distinct_check"
  CHECK (
    "sourceRewardId" IS NULL
    OR "rewardId" IS NULL
    OR "sourceRewardId" <> "rewardId"
  )
  NOT VALID;

ALTER TABLE public."GuestGameEntitlement"
  VALIDATE CONSTRAINT
    "GuestGameEntitlement_sourceOutcome_distinct_check";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."GuestGameEntitlement"
    WHERE "sourceRewardId" IS NOT NULL
      AND "rewardId" = "sourceRewardId"
  )
  THEN
    RAISE EXCEPTION
      'Case reward contract left a source/outcome alias behind';
  END IF;
END
$$;

COMMIT;
