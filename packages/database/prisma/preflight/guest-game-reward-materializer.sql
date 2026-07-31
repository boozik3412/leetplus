\set ON_ERROR_STOP on
\pset pager off

BEGIN TRANSACTION READ ONLY;

SELECT
  current_database() AS database_name,
  current_user AS database_user,
  current_setting('server_version') AS server_version,
  pg_is_in_recovery() AS is_replica;

SELECT
  migration_name,
  started_at,
  finished_at,
  rolled_back_at,
  applied_steps_count
FROM "_prisma_migrations"
WHERE migration_name IN (
  '20260718150000_guest_game_origin_fallback',
  '20260718150100_guest_game_event_origin_index',
  '20260718150200_guest_game_reward_idempotency_index',
  '20260718150300_guest_game_reward_origin_index',
  '20260718150400_guest_game_rule_decision_origin_index',
  '20260718150500_guest_game_entitlement_origin_index',
  '20260718150600_guest_activity_raw_external_source_index',
  '20260718150700_guest_activity_fact_external_source_index',
  '20260718150800_guest_activity_fact_fallback_queue_index',
  '20260718180000_guest_game_effect_postings',
  '20260718190000_guest_game_reward_effect_outbox',
  '20260718190100_staff_chat_message_dedupe_index',
  '20260731090000_guest_game_case_reward_lifecycle'
)
   OR (finished_at IS NULL AND rolled_back_at IS NULL)
ORDER BY started_at;

SELECT *
FROM (
  VALUES
    ('origin_receipt_table', to_regclass('public."GuestGameOriginReceipt"')),
    ('xp_table', to_regclass('public."GuestGameXpPosting"')),
    ('intent_table', to_regclass('public."GuestGameRewardIntent"')),
    ('effect_table', to_regclass('public."GuestGameRewardEffect"')),
    ('event_origin_index', to_regclass('public.guest_game_event_origin_uidx')),
    ('reward_idempotency_index', to_regclass('public.guest_game_reward_idempotency_uidx')),
    ('reward_origin_index', to_regclass('public.guest_game_reward_origin_idx')),
    ('decision_origin_index', to_regclass('public.guest_game_rule_decision_origin_idx')),
    ('entitlement_origin_index', to_regclass('public.guest_game_entitlement_origin_idx')),
    ('raw_external_source_index', to_regclass('public.guest_activity_raw_external_source_idx')),
    ('fact_external_source_index', to_regclass('public.guest_activity_fact_external_source_idx')),
    ('fact_fallback_queue_index', to_regclass('public.guest_activity_fact_fallback_queue_idx')),
    ('chat_dedupe_index', to_regclass('public.staff_chat_message_tenant_dedupe_unique')),
    ('intent_ready_index', to_regclass('public.guest_game_reward_intent_ready_partial_idx')),
    ('effect_ready_index', to_regclass('public.guest_game_reward_effect_ready_partial_idx')),
    ('case_source_reward_index', to_regclass('public.guest_game_entitlement_source_reward_uidx')),
    ('case_parent_guard_function', to_regprocedure('public.guest_game_reward_guard_case_parent_claim()')::oid),
    ('case_source_capture_function', to_regprocedure('public.guest_game_entitlement_capture_legacy_source_reward()')::oid)
) AS objects(name, object_oid);

SELECT
  event_object_table AS table_name,
  trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'GuestGameReward_guard_case_parent_claim',
    'GuestGameEntitlement_capture_legacy_source_reward'
  )
ORDER BY trigger_name;

SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  contype AS constraint_type
FROM pg_constraint
WHERE conname = 'GuestGameEntitlement_sourceRewardId_fkey';

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'StaffChatMessage' AND column_name = 'dedupeKey')
    OR (table_name = 'GuestGameEvent' AND column_name = 'originKey')
    OR (
      table_name = 'GuestGameReward'
      AND column_name IN ('originKey', 'idempotencyKey')
    )
    OR (table_name = 'GuestGameRuleDecision' AND column_name = 'originKey')
    OR (
      table_name = 'GuestGameEntitlement'
      AND column_name IN ('originKey', 'sourceRewardId')
    )
    OR (
      table_name = 'GuestActivityRawRecord'
      AND column_name = 'sourceExternalId'
    )
    OR (
      table_name = 'GuestActivityFact'
      AND column_name = 'sourceExternalId'
    )
  )
ORDER BY table_name, column_name;

SELECT
  relname,
  n_live_tup,
  n_dead_tup,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  pg_size_pretty(pg_relation_size(relid)) AS heap_size,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  last_autovacuum,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE relname IN (
  'GuestGameEvent',
  'GuestGameReward',
  'GuestGameRewardWalletItem',
  'GuestGameRewardEffect',
  'GuestGameRuleDecision',
  'GuestGameEntitlement',
  'GuestActivityRawRecord',
  'GuestActivityFact',
  'StaffChatMessage'
)
ORDER BY pg_total_relation_size(relid) DESC;

SELECT
  pid,
  usename,
  application_name,
  state,
  wait_event_type,
  wait_event,
  now() - xact_start AS transaction_age,
  now() - query_start AS query_age,
  pg_blocking_pids(pid) AS blocking_pids
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND xact_start IS NOT NULL
  AND now() - xact_start > interval '30 seconds'
ORDER BY xact_start;

WITH targets(relid) AS (
  SELECT unnest(
    ARRAY[
      to_regclass('public."StaffChatMessage"'),
      to_regclass('public."GuestGameEvent"'),
      to_regclass('public."GuestGameReward"'),
      to_regclass('public."GuestGameRewardWalletItem"'),
      to_regclass('public."GuestGameRewardEffect"'),
      to_regclass('public."GuestGameRuleDecision"'),
      to_regclass('public."GuestGameEntitlement"'),
      to_regclass('public."GuestActivityRawRecord"'),
      to_regclass('public."GuestActivityFact"')
    ]
  )
)
SELECT
  l.relation::regclass AS relation,
  l.mode,
  l.granted,
  a.pid,
  a.state,
  now() - a.xact_start AS transaction_age,
  pg_blocking_pids(a.pid) AS blocking_pids
FROM pg_locks l
JOIN targets t ON t.relid = l.relation
LEFT JOIN pg_stat_activity a ON a.pid = l.pid
ORDER BY l.granted, relation, l.mode;

DO $$
DECLARE
  unfinished_migrations integer;
  base_migrations integer;
  case_migrations integer;
  rollout_objects integer;
  rollout_columns integer;
  case_rollout_objects integer;
  case_rollout_columns integer;
  case_rollout_constraints integer;
  case_rollout_triggers integer;
  case_source_index_valid integer;
  unsafe_transactions integer;
  waiting_locks integer;
BEGIN
  IF pg_is_in_recovery() THEN
    RAISE EXCEPTION 'reward materializer preflight must run on the primary database';
  END IF;

  SELECT COUNT(*)
  INTO unfinished_migrations
  FROM "_prisma_migrations"
  WHERE finished_at IS NULL
    AND rolled_back_at IS NULL;

  IF unfinished_migrations > 0 THEN
    RAISE EXCEPTION
      'reward materializer preflight found % unfinished Prisma migration(s)',
      unfinished_migrations;
  END IF;

  SELECT COUNT(*)
  INTO base_migrations
  FROM "_prisma_migrations"
  WHERE migration_name IN (
    '20260718150000_guest_game_origin_fallback',
    '20260718150100_guest_game_event_origin_index',
    '20260718150200_guest_game_reward_idempotency_index',
    '20260718150300_guest_game_reward_origin_index',
    '20260718150400_guest_game_rule_decision_origin_index',
    '20260718150500_guest_game_entitlement_origin_index',
    '20260718150600_guest_activity_raw_external_source_index',
    '20260718150700_guest_activity_fact_external_source_index',
    '20260718150800_guest_activity_fact_fallback_queue_index',
    '20260718180000_guest_game_effect_postings',
    '20260718190000_guest_game_reward_effect_outbox',
    '20260718190100_staff_chat_message_dedupe_index'
  )
    AND finished_at IS NOT NULL
    AND rolled_back_at IS NULL;

  SELECT COUNT(*)
  INTO case_migrations
  FROM "_prisma_migrations"
  WHERE migration_name = '20260731090000_guest_game_case_reward_lifecycle'
    AND finished_at IS NOT NULL
    AND rolled_back_at IS NULL;

  SELECT COUNT(*)
  INTO rollout_objects
  FROM (
    VALUES
      (to_regclass('public."GuestGameOriginReceipt"')),
      (to_regclass('public."GuestGameXpPosting"')),
      (to_regclass('public."GuestGameRewardIntent"')),
      (to_regclass('public."GuestGameRewardEffect"')),
      (to_regclass('public.guest_game_event_origin_uidx')),
      (to_regclass('public.guest_game_reward_idempotency_uidx')),
      (to_regclass('public.guest_game_reward_origin_idx')),
      (to_regclass('public.guest_game_rule_decision_origin_idx')),
      (to_regclass('public.guest_game_entitlement_origin_idx')),
      (to_regclass('public.guest_activity_raw_external_source_idx')),
      (to_regclass('public.guest_activity_fact_external_source_idx')),
      (to_regclass('public.guest_activity_fact_fallback_queue_idx')),
      (to_regclass('public.staff_chat_message_tenant_dedupe_unique')),
      (to_regclass('public.guest_game_reward_intent_ready_partial_idx')),
      (to_regclass('public.guest_game_reward_effect_ready_partial_idx'))
  ) AS rollout(object_oid)
  WHERE object_oid IS NOT NULL;

  SELECT COUNT(*)
  INTO rollout_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'StaffChatMessage' AND column_name = 'dedupeKey')
      OR (table_name = 'GuestGameEvent' AND column_name = 'originKey')
      OR (
        table_name = 'GuestGameReward'
        AND column_name IN ('originKey', 'idempotencyKey')
      )
      OR (table_name = 'GuestGameRuleDecision' AND column_name = 'originKey')
      OR (table_name = 'GuestGameEntitlement' AND column_name = 'originKey')
      OR (
        table_name = 'GuestActivityRawRecord'
        AND column_name = 'sourceExternalId'
      )
      OR (
        table_name = 'GuestActivityFact'
        AND column_name = 'sourceExternalId'
      )
    );

  SELECT COUNT(*)
  INTO case_rollout_objects
  FROM (
    VALUES
      (to_regclass('public.guest_game_entitlement_source_reward_uidx')::oid),
      (to_regprocedure('public.guest_game_reward_guard_case_parent_claim()')::oid),
      (to_regprocedure('public.guest_game_entitlement_capture_legacy_source_reward()')::oid)
  ) AS rollout(object_oid)
  WHERE object_oid IS NOT NULL;

  SELECT COUNT(*)
  INTO case_rollout_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'GuestGameEntitlement'
    AND column_name = 'sourceRewardId';

  SELECT COUNT(*)
  INTO case_rollout_constraints
  FROM pg_constraint
  WHERE conname = 'GuestGameEntitlement_sourceRewardId_fkey'
    AND conrelid = 'public."GuestGameEntitlement"'::regclass
    AND confrelid = 'public."GuestGameReward"'::regclass
    AND contype = 'f'
    AND confdeltype = 'r'
    AND confupdtype = 'c'
    AND convalidated;

  SELECT COUNT(*)
  INTO case_rollout_triggers
  FROM (
    VALUES
      (
        to_regclass('public."GuestGameReward"')::oid,
        'GuestGameReward_guard_case_parent_claim',
        to_regprocedure(
          'public.guest_game_reward_guard_case_parent_claim()'
        )::oid
      ),
      (
        to_regclass('public."GuestGameEntitlement"')::oid,
        'GuestGameEntitlement_capture_legacy_source_reward',
        to_regprocedure(
          'public.guest_game_entitlement_capture_legacy_source_reward()'
        )::oid
      )
  ) AS expected(table_oid, trigger_name, function_oid)
  JOIN pg_trigger AS actual
    ON actual.tgrelid = expected.table_oid
   AND actual.tgname = expected.trigger_name
   AND actual.tgfoid = expected.function_oid
   AND actual.tgenabled <> 'D'
   AND NOT actual.tgisinternal;

  SELECT COUNT(*)
  INTO case_source_index_valid
  FROM pg_index
  WHERE indexrelid = to_regclass(
      'public.guest_game_entitlement_source_reward_uidx'
    )
    AND indrelid = 'public."GuestGameEntitlement"'::regclass
    AND indisunique
    AND indisready
    AND indisvalid
    AND indislive;

  IF base_migrations = 0 AND (rollout_objects > 0 OR rollout_columns > 0) THEN
    RAISE EXCEPTION
      'reward materializer preflight found partial schema drift: % objects and % columns exist before migration history',
      rollout_objects,
      rollout_columns;
  END IF;

  IF base_migrations NOT IN (0, 12) THEN
    RAISE EXCEPTION
      'reward materializer rollout is only safe before all migrations or after all migrations; % of 12 are completed',
      base_migrations;
  END IF;

  IF base_migrations = 12 AND (rollout_objects <> 15 OR rollout_columns <> 8) THEN
    RAISE EXCEPTION
      'reward materializer post-migration schema is incomplete: % of 15 objects and % of 8 columns found',
      rollout_objects,
      rollout_columns;
  END IF;

  IF case_migrations NOT IN (0, 1) THEN
    RAISE EXCEPTION
      'case reward lifecycle migration history is ambiguous: % completed rows found',
      case_migrations;
  END IF;

  IF case_migrations = 0
     AND (
       case_rollout_objects > 0
       OR case_rollout_columns > 0
       OR case_rollout_constraints > 0
       OR case_rollout_triggers > 0
       OR case_source_index_valid > 0
     )
  THEN
    RAISE EXCEPTION
      'case reward lifecycle preflight found partial schema drift before migration history';
  END IF;

  IF case_migrations = 1
     AND (
       case_rollout_objects <> 3
       OR case_rollout_columns <> 1
       OR case_rollout_constraints <> 1
       OR case_rollout_triggers <> 2
       OR case_source_index_valid <> 1
     )
  THEN
    RAISE EXCEPTION
      'case reward lifecycle schema is incomplete: % of 3 objects, % of 1 columns, % of 1 constraints, % of 2 triggers and % of 1 valid unique indexes found',
      case_rollout_objects,
      case_rollout_columns,
      case_rollout_constraints,
      case_rollout_triggers,
      case_source_index_valid;
  END IF;

  WITH targets(relid) AS (
    SELECT unnest(
      ARRAY[
        to_regclass('public."StaffChatMessage"'),
        to_regclass('public."GuestGameEvent"'),
        to_regclass('public."GuestGameReward"'),
        to_regclass('public."GuestGameRewardWalletItem"'),
        to_regclass('public."GuestGameRewardEffect"'),
        to_regclass('public."GuestGameRuleDecision"'),
        to_regclass('public."GuestGameEntitlement"'),
        to_regclass('public."GuestActivityRawRecord"'),
        to_regclass('public."GuestActivityFact"')
      ]
    )
  )
  SELECT COUNT(DISTINCT a.pid)
  INTO unsafe_transactions
  FROM pg_stat_activity a
  JOIN pg_locks l ON l.pid = a.pid
  JOIN targets t ON t.relid = l.relation
  WHERE a.pid <> pg_backend_pid()
    AND a.xact_start IS NOT NULL
    AND (
      now() - a.xact_start > interval '30 seconds'
      OR a.state = 'idle in transaction'
    );

  IF unsafe_transactions > 0 THEN
    RAISE EXCEPTION
      'reward materializer preflight found % long or idle transaction(s) touching rollout tables',
      unsafe_transactions;
  END IF;

  WITH targets(relid) AS (
    SELECT unnest(
      ARRAY[
        to_regclass('public."StaffChatMessage"'),
        to_regclass('public."GuestGameEvent"'),
        to_regclass('public."GuestGameReward"'),
        to_regclass('public."GuestGameRewardWalletItem"'),
        to_regclass('public."GuestGameRewardEffect"'),
        to_regclass('public."GuestGameRuleDecision"'),
        to_regclass('public."GuestGameEntitlement"'),
        to_regclass('public."GuestActivityRawRecord"'),
        to_regclass('public."GuestActivityFact"')
      ]
    )
  )
  SELECT COUNT(*)
  INTO waiting_locks
  FROM pg_locks l
  JOIN targets t ON t.relid = l.relation
  WHERE l.pid <> pg_backend_pid()
    AND NOT l.granted;

  IF waiting_locks > 0 THEN
    RAISE EXCEPTION
      'reward materializer preflight found % waiting lock(s) on rollout tables',
      waiting_locks;
  END IF;

  RAISE NOTICE
    'reward materializer preflight passed: % of 12 base migrations and % of 1 case migrations completed, % base objects, % base columns, % case objects, % case columns, % case constraints, % case triggers, % valid case indexes',
    base_migrations,
    case_migrations,
    rollout_objects,
    rollout_columns,
    case_rollout_objects,
    case_rollout_columns,
    case_rollout_constraints,
    case_rollout_triggers,
    case_source_index_valid;
END
$$;

COMMIT;
