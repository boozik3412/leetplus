BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- One fixed order is used by the migration and documented runtime writers.
-- The migration is intentionally blocking and transactional: a lock timeout
-- leaves the complete CURRENT_165 schema and data untouched.
LOCK TABLE
  "GuestGameReward",
  "GuestGameDelivery",
  "GuestGameDeliveryEvent",
  "GuestGameProfile",
  "Guest",
  "Store",
  "Tenant"
IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = 'public."Store"'::pg_catalog.regclass
      AND attribute.attname = 'backgroundExecutionEnabled'
      AND attribute.atttypid = 'pg_catalog.bool'::pg_catalog.regtype
      AND attribute.attnotnull
      AND NOT attribute.attisdropped
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = 'public."Store"'::pg_catalog.regclass
      AND attribute.attname = 'executionRevision'
      AND attribute.atttypid = 'pg_catalog.int4'::pg_catalog.regtype
      AND attribute.attnotnull
      AND NOT attribute.attisdropped
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid = 'public."Store"'::pg_catalog.regclass
      AND trigger.tgname = 'Store_execution_revision_fence_trigger'
      AND NOT trigger.tgisinternal
      AND trigger.tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS catalog_constraint
    WHERE catalog_constraint.conrelid = 'public."Store"'::pg_catalog.regclass
      AND catalog_constraint.conname = 'Store_executionRevision_nonnegative_check'
      AND catalog_constraint.contype = 'c'
      AND catalog_constraint.convalidated
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS catalog_constraint
    WHERE catalog_constraint.conrelid = 'public."Store"'::pg_catalog.regclass
      AND catalog_constraint.conname = 'Store_backgroundExecution_requires_active_check'
      AND catalog_constraint.contype = 'c'
      AND catalog_constraint.convalidated
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid =
      'public."store_execution_revision_fence"()'::pg_catalog.regprocedure
      AND procedure.prosecdef IS FALSE
      AND procedure.proconfig @> ARRAY['search_path=pg_catalog']::TEXT[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attrdef AS attribute_default
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = attribute_default.adrelid
     AND attribute.attnum = attribute_default.adnum
    WHERE attribute_default.adrelid = 'public."Store"'::pg_catalog.regclass
      AND attribute.attname = 'backgroundExecutionEnabled'
      AND pg_catalog.pg_get_expr(
        attribute_default.adbin,
        attribute_default.adrelid
      ) = 'false'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attrdef AS attribute_default
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = attribute_default.adrelid
     AND attribute.attnum = attribute_default.adnum
    WHERE attribute_default.adrelid = 'public."Store"'::pg_catalog.regclass
      AND attribute.attname = 'executionRevision'
      AND pg_catalog.pg_get_expr(
        attribute_default.adbin,
        attribute_default.adrelid
      ) = '0'
  ) THEN
    RAISE EXCEPTION
      'CURRENT_165 Store background execution fence is not present'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "GuestGameDelivery" AS delivery
    WHERE delivery."status" NOT IN (
      'READY', 'BLOCKED', 'SENT', 'FAILED', 'CANCELED'
    )
       OR delivery."channel" NOT IN (
         'TELEGRAM', 'MAX', 'CASHIER', 'MANUAL'
       )
  ) THEN
    RAISE EXCEPTION
      'GuestGameDelivery contains an unsupported legacy status or channel'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "GuestGameDeliveryEvent" AS event
    WHERE event."eventType" IN (
      'DELIVERY_CLAIMED',
      'DELIVERY_PROVIDER_ATTEMPTED',
      'DELIVERY_FINALIZED',
      'DELIVERY_REAPED',
      'DELIVERY_RETRIED',
      'DELIVERY_CANCELED',
      'DELIVERY_RECONCILED',
      'DELIVERY_INTEGRITY_QUARANTINED'
    )
  ) THEN
    RAISE EXCEPTION
      'GuestGameDeliveryEvent contains a pre-166 reserved typed event name'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "GuestGameDelivery" AS delivery
    JOIN "GuestGameReward" AS reward
      ON reward."id" = delivery."rewardId"
    WHERE reward."tenantId" <> delivery."tenantId"
  ) THEN
    RAISE EXCEPTION
      'GuestGameDelivery has a cross-tenant reward binding'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "GuestGameDelivery" AS delivery
    JOIN "Store" AS store
      ON store."id" = delivery."storeId"
    WHERE delivery."storeId" IS NOT NULL
      AND store."tenantId" <> delivery."tenantId"
  ) OR EXISTS (
    SELECT 1
    FROM "GuestGameDelivery" AS delivery
    JOIN "GuestGameReward" AS reward
      ON reward."id" = delivery."rewardId"
    JOIN "Store" AS store
      ON store."id" = reward."storeId"
    WHERE reward."storeId" IS NOT NULL
      AND store."tenantId" <> delivery."tenantId"
  ) THEN
    RAISE EXCEPTION
      'GuestGameDelivery has a cross-tenant Store authority binding'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "GuestGameDelivery" AS delivery
    JOIN "GuestGameProfile" AS profile
      ON profile."id" = delivery."profileId"
    WHERE delivery."profileId" IS NOT NULL
      AND profile."tenantId" <> delivery."tenantId"
  ) OR EXISTS (
    SELECT 1
    FROM "GuestGameDelivery" AS delivery
    JOIN "Guest" AS guest
      ON guest."id" = delivery."guestId"
    WHERE delivery."guestId" IS NOT NULL
      AND guest."tenantId" <> delivery."tenantId"
  ) THEN
    RAISE EXCEPTION
      'GuestGameDelivery has a cross-tenant recipient binding'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "GuestGameDelivery" AS delivery
    JOIN "GuestGameReward" AS reward
      ON reward."id" = delivery."rewardId"
    JOIN "GuestGameProfile" AS profile
      ON profile."id" = reward."profileId"
    WHERE reward."profileId" IS NOT NULL
      AND profile."tenantId" <> delivery."tenantId"
  ) OR EXISTS (
    SELECT 1
    FROM "GuestGameDelivery" AS delivery
    JOIN "GuestGameReward" AS reward
      ON reward."id" = delivery."rewardId"
    JOIN "Guest" AS guest
      ON guest."id" = reward."guestId"
    WHERE reward."guestId" IS NOT NULL
      AND guest."tenantId" <> delivery."tenantId"
  ) THEN
    RAISE EXCEPTION
      'GuestGameReward has a cross-tenant canonical recipient binding'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "GuestGameDeliveryEvent" AS event
    JOIN "GuestGameDelivery" AS delivery
      ON delivery."id" = event."deliveryId"
    JOIN "GuestGameReward" AS reward
      ON reward."id" = event."rewardId"
    WHERE event."tenantId" <> delivery."tenantId"
       OR event."tenantId" <> reward."tenantId"
       OR event."rewardId" <> delivery."rewardId"
  ) THEN
    RAISE EXCEPTION
      'GuestGameDeliveryEvent has a cross-scope delivery or reward binding'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE UNIQUE INDEX "guest_tenant_id_uidx"
  ON "Guest" ("tenantId", "id");

CREATE UNIQUE INDEX "guest_game_profile_tenant_id_uidx"
  ON "GuestGameProfile" ("tenantId", "id");

CREATE UNIQUE INDEX "guest_game_reward_tenant_id_uidx"
  ON "GuestGameReward" ("tenantId", "id");

CREATE UNIQUE INDEX "guest_game_delivery_tenant_id_uidx"
  ON "GuestGameDelivery" ("tenantId", "id");

ALTER TABLE "GuestGameDelivery"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "attemptBudget" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "claimGeneration" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "transitionRevision" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "claimJobKind" TEXT,
  ADD COLUMN "integrityState" TEXT,
  ADD COLUMN "integrityReasonCode" TEXT,
  ADD COLUMN "stateReasonCode" TEXT,
  ADD COLUMN "executionRevision" INTEGER,
  ADD COLUMN "storeExecutionRevision" INTEGER,
  ADD COLUMN "leaseOwner" TEXT,
  ADD COLUMN "claimKeyVersion" INTEGER,
  ADD COLUMN "claimOwnerDigest" TEXT,
  ADD COLUMN "claimTokenDigest" TEXT,
  ADD COLUMN "claimedAt" TIMESTAMPTZ(3),
  ADD COLUMN "leaseExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "acknowledgeUntil" TIMESTAMPTZ(3),
  ADD COLUMN "effectInputDigest" TEXT,
  ADD COLUMN "providerConfigDigest" TEXT,
  ADD COLUMN "providerAuthorityRevision" INTEGER,
  ADD COLUMN "workloadIdentityDigest" TEXT,
  ADD COLUMN "sendGrantDigest" TEXT,
  ADD COLUMN "sendGrantExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "providerAttemptKey" TEXT,
  ADD COLUMN "providerAttemptedAt" TIMESTAMPTZ(3),
  ADD COLUMN "providerOutcomeClass" TEXT,
  ADD COLUMN "providerOutcomeCode" TEXT,
  ADD COLUMN "providerObservedAt" TIMESTAMPTZ(3),
  ADD COLUMN "providerReceiptDigest" TEXT,
  ADD COLUMN "providerReceiptRefEncrypted" BYTEA,
  ADD COLUMN "providerReceiptKeyVersion" INTEGER,
  ADD COLUMN "terminalAckDigest" TEXT;

ALTER TABLE "GuestGameDeliveryEvent"
  ADD COLUMN "transitionKey" TEXT,
  ADD COLUMN "transitionRevision" BIGINT,
  ADD COLUMN "storeId" TEXT,
  ADD COLUMN "attemptId" TEXT,
  ADD COLUMN "claimGeneration" INTEGER,
  ADD COLUMN "attemptNumber" INTEGER,
  ADD COLUMN "claimJobKind" TEXT,
  ADD COLUMN "executionRevision" INTEGER,
  ADD COLUMN "storeExecutionRevision" INTEGER,
  ADD COLUMN "claimKeyVersion" INTEGER,
  ADD COLUMN "claimOwnerDigest" TEXT,
  ADD COLUMN "claimTokenDigest" TEXT,
  ADD COLUMN "claimedAt" TIMESTAMPTZ(3),
  ADD COLUMN "leaseExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "acknowledgeUntil" TIMESTAMPTZ(3),
  ADD COLUMN "effectInputDigest" TEXT,
  ADD COLUMN "providerConfigDigest" TEXT,
  ADD COLUMN "providerAuthorityRevision" INTEGER,
  ADD COLUMN "workloadIdentityDigest" TEXT,
  ADD COLUMN "providerAttemptKey" TEXT,
  ADD COLUMN "providerAttemptedAt" TIMESTAMPTZ(3),
  ADD COLUMN "sendGrantDigest" TEXT,
  ADD COLUMN "sendGrantExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "providerOutcomeClass" TEXT,
  ADD COLUMN "providerOutcomeCode" TEXT,
  ADD COLUMN "providerObservedAt" TIMESTAMPTZ(3),
  ADD COLUMN "providerReceiptDigest" TEXT,
  ADD COLUMN "providerReceiptRefEncrypted" BYTEA,
  ADD COLUMN "providerReceiptKeyVersion" INTEGER,
  ADD COLUMN "terminalAckDigest" TEXT,
  ADD COLUMN "stateReasonCode" TEXT,
  ADD COLUMN "adapterVersion" TEXT,
  ADD COLUMN "httpStatusClass" INTEGER,
  ADD COLUMN "provenanceDigest" TEXT;

CREATE TABLE "GuestGameDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "rewardId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "claimGeneration" INTEGER NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "claimJobKind" TEXT NOT NULL,
  "executionRevision" INTEGER NOT NULL,
  "storeExecutionRevision" INTEGER NOT NULL,
  "claimKeyVersion" INTEGER NOT NULL,
  "claimOwnerDigest" TEXT NOT NULL,
  "claimTokenDigest" TEXT NOT NULL,
  "claimedAt" TIMESTAMPTZ(3) NOT NULL,
  "leaseExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "acknowledgeUntil" TIMESTAMPTZ(3) NOT NULL,
  "effectInputDigest" TEXT NOT NULL,
  "providerConfigDigest" TEXT NOT NULL,
  "providerAuthorityRevision" INTEGER NOT NULL,
  "workloadIdentityDigest" TEXT NOT NULL,
  "providerAttemptKey" TEXT NOT NULL,
  "providerAttemptedAt" TIMESTAMPTZ(3) NOT NULL,
  "sendGrantDigest" TEXT NOT NULL,
  "sendGrantExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestGameDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE OR REPLACE FUNCTION public."guest_game_delivery_transition_key_v1"(
  tenant_id TEXT,
  delivery_id TEXT,
  reward_id TEXT,
  transition_revision BIGINT,
  claim_generation INTEGER,
  event_type TEXT,
  attempt_number INTEGER,
  outcome_class TEXT,
  outcome_code TEXT,
  from_status TEXT,
  to_status TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT
    'v1:' || pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.jsonb_build_object(
            'attemptNumber', attempt_number,
            'claimGeneration', claim_generation,
            'deliveryId', delivery_id,
            'eventType', event_type,
            'fromStatus', from_status,
            'outcomeClass', outcome_class,
            'outcomeCode', outcome_code,
            'rewardId', reward_id,
            'tenantId', tenant_id,
            'toStatus', to_status,
            'transitionRevision', transition_revision,
            'version', 1
          )::TEXT,
          'UTF8'
        )
      ),
      'hex'
    );
$$;

-- Runtime constraint triggers are SECURITY INVOKER. Keep the helper private by
-- default and grant EXECUTE only to an explicitly reviewed delivery-writer role
-- during role enrollment; PUBLIC access would violate the snapshot admission
-- least-privilege boundary.
REVOKE ALL
ON FUNCTION public."guest_game_delivery_transition_key_v1"(
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  INTEGER,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;

-- Backfill a canonical Store only for non-terminal provider deliveries where
-- the reward already supplies an unambiguous same-tenant Store.
WITH candidates AS (
  SELECT
    delivery."id",
    delivery."tenantId",
    delivery."rewardId",
    delivery."status",
    delivery."channel",
    reward."storeId"
  FROM "GuestGameDelivery" AS delivery
  JOIN "GuestGameReward" AS reward
    ON reward."tenantId" = delivery."tenantId"
   AND reward."id" = delivery."rewardId"
  WHERE delivery."channel" IN ('TELEGRAM', 'MAX')
    AND delivery."status" IN ('READY', 'BLOCKED')
    AND delivery."storeId" IS NULL
    AND reward."storeId" IS NOT NULL
),
updated AS (
  UPDATE "GuestGameDelivery" AS delivery
  SET "storeId" = candidates."storeId"
  FROM candidates
  WHERE delivery."id" = candidates."id"
  RETURNING
    delivery."id",
    delivery."tenantId",
    delivery."rewardId",
    delivery."storeId",
    delivery."status",
    delivery."channel"
)
INSERT INTO "GuestGameDeliveryEvent" (
  "id",
  "tenantId",
  "deliveryId",
  "rewardId",
  "storeId",
  "eventType",
  "transitionKey",
  "transitionRevision",
  "fromStatus",
  "toStatus",
  "channel",
  "claimGeneration",
  "attemptNumber",
  "stateReasonCode",
  "provenanceDigest",
  "note",
  "createdAt"
)
SELECT
  pg_catalog.gen_random_uuid()::TEXT,
  updated."tenantId",
  updated."id",
  updated."rewardId",
  updated."storeId",
  'DELIVERY_STORE_BACKFILLED',
  'v1:' || pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'delivery-store-backfill-v1:' || updated."tenantId" || ':' || updated."id",
        'UTF8'
      )
    ),
    'hex'
  ),
  0,
  updated."status",
  updated."status",
  updated."channel",
  0,
  0,
  'LEGACY_STORE_BACKFILLED',
  pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'delivery-store-backfill-evidence-v1:' || updated."tenantId" || ':' || updated."id",
        'UTF8'
      )
    ),
    'hex'
  ),
  'Migration 166 backfilled canonical Store from the same-tenant reward.',
  CURRENT_TIMESTAMP
FROM updated;

-- Provider terminal rows cannot prove a pre-provider marker. Provider rows
-- with an ambiguous Store or recipient graph are also preserved as read-only
-- quarantine evidence. READY rows become BLOCKED; terminal statuses remain.
WITH candidates AS (
  SELECT
    delivery."id",
    delivery."tenantId",
    delivery."rewardId",
    delivery."storeId",
    delivery."status" AS "fromStatus",
    delivery."channel",
    CASE
      WHEN delivery."status" IN ('SENT', 'FAILED', 'CANCELED')
        THEN 'LEGACY_PRE_166_PROVIDER_TERMINAL'
      WHEN delivery."status" = 'READY'
        AND delivery."readinessStatus" <> 'READY_FOR_BOT'
        THEN 'LEGACY_PROVIDER_READINESS_MISMATCH'
      WHEN reward."storeId" IS NULL
        OR delivery."storeId" IS NULL
        OR delivery."storeId" IS DISTINCT FROM reward."storeId"
        THEN 'LEGACY_PROVIDER_STORE_MISMATCH'
      WHEN reward."profileId" IS NULL
        OR delivery."profileId" IS NULL
        OR delivery."profileId" IS DISTINCT FROM reward."profileId"
        THEN 'LEGACY_PROVIDER_PROFILE_MISMATCH'
      WHEN delivery."guestId" IS DISTINCT FROM reward."guestId"
        THEN 'LEGACY_PROVIDER_GUEST_MISMATCH'
      ELSE NULL
    END AS "reasonCode"
  FROM "GuestGameDelivery" AS delivery
  JOIN "GuestGameReward" AS reward
    ON reward."tenantId" = delivery."tenantId"
   AND reward."id" = delivery."rewardId"
  WHERE delivery."channel" IN ('TELEGRAM', 'MAX')
),
quarantined AS (
  UPDATE "GuestGameDelivery" AS delivery
  SET
    "status" = CASE
      WHEN candidates."fromStatus" = 'READY' THEN 'BLOCKED'
      ELSE candidates."fromStatus"
    END,
    "integrityState" = 'LEGACY_QUARANTINED',
    "integrityReasonCode" = candidates."reasonCode",
    "stateReasonCode" = 'INTEGRITY_QUARANTINED'
  FROM candidates
  WHERE delivery."id" = candidates."id"
    AND candidates."reasonCode" IS NOT NULL
  RETURNING
    delivery."id",
    delivery."tenantId",
    delivery."rewardId",
    delivery."storeId",
    candidates."fromStatus",
    delivery."status" AS "toStatus",
    delivery."channel",
    delivery."integrityReasonCode"
)
INSERT INTO "GuestGameDeliveryEvent" (
  "id",
  "tenantId",
  "deliveryId",
  "rewardId",
  "storeId",
  "eventType",
  "transitionKey",
  "transitionRevision",
  "fromStatus",
  "toStatus",
  "channel",
  "claimGeneration",
  "attemptNumber",
  "stateReasonCode",
  "provenanceDigest",
  "note",
  "createdAt"
)
SELECT
  pg_catalog.gen_random_uuid()::TEXT,
  quarantined."tenantId",
  quarantined."id",
  quarantined."rewardId",
  quarantined."storeId",
  'DELIVERY_INTEGRITY_QUARANTINED',
  public."guest_game_delivery_transition_key_v1"(
    quarantined."tenantId",
    quarantined."id",
    quarantined."rewardId",
    0,
    0,
    'DELIVERY_INTEGRITY_QUARANTINED',
    0,
    NULL,
    NULL,
    quarantined."fromStatus",
    quarantined."toStatus"
  ),
  0,
  quarantined."fromStatus",
  quarantined."toStatus",
  quarantined."channel",
  0,
  0,
  'INTEGRITY_QUARANTINED',
  pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'delivery-integrity-evidence-v1:' || quarantined."tenantId" || ':' ||
          quarantined."id" || ':' || quarantined."integrityReasonCode",
        'UTF8'
      )
    ),
    'hex'
  ),
  'Migration 166 quarantined legacy provider delivery evidence.',
  CURRENT_TIMESTAMP
FROM quarantined;

UPDATE "GuestGameDelivery"
SET
  "integrityState" = COALESCE("integrityState", 'VERIFIED'),
  "stateReasonCode" = CASE
    WHEN "stateReasonCode" IS NOT NULL THEN "stateReasonCode"
    WHEN "status" = 'BLOCKED' THEN 'LEGACY_READINESS_BLOCKED'
    WHEN "status" = 'FAILED' AND "channel" IN ('CASHIER', 'MANUAL')
      THEN 'LEGACY_NON_PROVIDER_FAILED'
    WHEN "status" = 'CANCELED' AND "channel" IN ('CASHIER', 'MANUAL')
      THEN 'LEGACY_NON_PROVIDER_CANCELED'
    ELSE NULL
  END;

ALTER TABLE "GuestGameDelivery"
  ALTER COLUMN "integrityState" SET DEFAULT 'VERIFIED',
  ALTER COLUMN "integrityState" SET NOT NULL;

ALTER TABLE "GuestGameDelivery"
  DROP CONSTRAINT "GuestGameDelivery_rewardId_fkey",
  DROP CONSTRAINT "GuestGameDelivery_profileId_fkey",
  DROP CONSTRAINT "GuestGameDelivery_guestId_fkey",
  DROP CONSTRAINT "GuestGameDelivery_storeId_fkey";

ALTER TABLE "GuestGameDeliveryEvent"
  DROP CONSTRAINT "GuestGameDeliveryEvent_deliveryId_fkey",
  DROP CONSTRAINT "GuestGameDeliveryEvent_rewardId_fkey";

ALTER TABLE "GuestGameDelivery"
  ADD CONSTRAINT "GuestGameDelivery_tenantId_rewardId_fkey"
    FOREIGN KEY ("tenantId", "rewardId")
    REFERENCES "GuestGameReward" ("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestGameDelivery_tenantId_profileId_fkey"
    FOREIGN KEY ("tenantId", "profileId")
    REFERENCES "GuestGameProfile" ("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestGameDelivery_tenantId_guestId_fkey"
    FOREIGN KEY ("tenantId", "guestId")
    REFERENCES "Guest" ("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- Intentionally retained in addition to the Prisma-modeled composite FK.
  -- It preserves the legacy direct Store(id) referential contract while the
  -- composite constraint enforces same-tenant authority.
  ADD CONSTRAINT "GuestGameDelivery_storeId_fkey"
    FOREIGN KEY ("storeId")
    REFERENCES "Store" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestGameDelivery_tenantId_storeId_fkey"
    FOREIGN KEY ("tenantId", "storeId")
    REFERENCES "Store" ("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "GuestGameDeliveryAttempt"
  ADD CONSTRAINT "GuestGameDeliveryAttempt_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "Tenant" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestGameDeliveryAttempt_tenantId_deliveryId_fkey"
    FOREIGN KEY ("tenantId", "deliveryId")
    REFERENCES "GuestGameDelivery" ("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestGameDeliveryAttempt_tenantId_rewardId_fkey"
    FOREIGN KEY ("tenantId", "rewardId")
    REFERENCES "GuestGameReward" ("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestGameDeliveryAttempt_tenantId_storeId_fkey"
    FOREIGN KEY ("tenantId", "storeId")
    REFERENCES "Store" ("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX "guest_game_delivery_attempt_tenant_id_uidx"
  ON "GuestGameDeliveryAttempt" ("tenantId", "id");

CREATE UNIQUE INDEX "guest_game_delivery_attempt_generation_uidx"
  ON "GuestGameDeliveryAttempt" (
    "tenantId", "deliveryId", "claimGeneration"
  );

CREATE UNIQUE INDEX "guest_game_delivery_attempt_provider_key_uidx"
  ON "GuestGameDeliveryAttempt" ("tenantId", "providerAttemptKey");

CREATE INDEX "guest_game_delivery_attempt_store_idx"
  ON "GuestGameDeliveryAttempt" (
    "tenantId", "storeId", "providerAttemptedAt", "id"
  );

CREATE INDEX "guest_game_delivery_attempt_delivery_idx"
  ON "GuestGameDeliveryAttempt" ("deliveryId");

CREATE INDEX "guest_game_delivery_attempt_reward_idx"
  ON "GuestGameDeliveryAttempt" ("rewardId");

CREATE INDEX "guest_game_delivery_attempt_store_fk_idx"
  ON "GuestGameDeliveryAttempt" ("storeId");

CREATE UNIQUE INDEX "guest_game_delivery_event_transition_uidx"
  ON "GuestGameDeliveryEvent" ("tenantId", "transitionKey");

CREATE INDEX "guest_game_delivery_event_store_idx"
  ON "GuestGameDeliveryEvent" ("tenantId", "storeId");

CREATE INDEX "guest_game_delivery_event_attempt_idx"
  ON "GuestGameDeliveryEvent" ("tenantId", "attemptId");

ALTER TABLE "GuestGameDeliveryEvent"
  ADD CONSTRAINT "GuestGameDeliveryEvent_tenantId_deliveryId_fkey"
    FOREIGN KEY ("tenantId", "deliveryId")
    REFERENCES "GuestGameDelivery" ("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestGameDeliveryEvent_tenantId_rewardId_fkey"
    FOREIGN KEY ("tenantId", "rewardId")
    REFERENCES "GuestGameReward" ("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestGameDeliveryEvent_tenantId_storeId_fkey"
    FOREIGN KEY ("tenantId", "storeId")
    REFERENCES "Store" ("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestGameDeliveryEvent_tenantId_attemptId_fkey"
    FOREIGN KEY ("tenantId", "attemptId")
    REFERENCES "GuestGameDeliveryAttempt" ("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "GuestGameDelivery"
  ADD CONSTRAINT "GuestGameDelivery_status_check"
    CHECK (
      "status" IN (
        'READY',
        'PROCESSING',
        'DISPATCHING',
        'SENT',
        'FAILED',
        'BLOCKED',
        'CANCELED',
        'RECONCILIATION_REQUIRED'
      )
    ),
  ADD CONSTRAINT "GuestGameDelivery_channel_check"
    CHECK ("channel" IN ('TELEGRAM', 'MAX', 'CASHIER', 'MANUAL')),
  ADD CONSTRAINT "GuestGameDelivery_integrity_state_check"
    CHECK (
      "integrityState" IN ('VERIFIED', 'LEGACY_QUARANTINED')
    ),
  ADD CONSTRAINT "GuestGameDelivery_claim_job_kind_check"
    CHECK (
      "claimJobKind" IS NULL
      OR "claimJobKind" IN (
        'GUEST_GAME_DELIVERY_DISPATCH',
        'GUEST_GAME_DELIVERY_BOT_PULL'
      )
    ),
  ADD CONSTRAINT "GuestGameDelivery_attempt_budget_check"
    CHECK (
      "attempts" >= 0
      AND "attemptBudget" >= 1
      AND "attempts" <= "attemptBudget"
      AND "attemptBudget" <= 10
    ),
  ADD CONSTRAINT "GuestGameDelivery_claim_generation_check"
    CHECK (
      "claimGeneration" >= 0
      AND "claimGeneration" < 2147483647
      AND "transitionRevision" >= 0
    ),
  ADD CONSTRAINT "GuestGameDelivery_revision_check"
    CHECK (
      ("executionRevision" IS NULL OR "executionRevision" >= 0)
      AND (
        "storeExecutionRevision" IS NULL
        OR "storeExecutionRevision" >= 0
      )
      AND (
        "providerAuthorityRevision" IS NULL
        OR "providerAuthorityRevision" > 0
      )
      AND ("claimKeyVersion" IS NULL OR "claimKeyVersion" > 0)
      AND (
        "providerReceiptKeyVersion" IS NULL
        OR "providerReceiptKeyVersion" > 0
      )
    ),
  ADD CONSTRAINT "GuestGameDelivery_reason_code_check"
    CHECK (
      (
        "integrityReasonCode" IS NULL
        OR "integrityReasonCode" ~ '^[A-Z][A-Z0-9_]{2,95}$'
      )
      AND (
        "stateReasonCode" IS NULL
        OR "stateReasonCode" ~ '^[A-Z][A-Z0-9_]{2,95}$'
      )
    ),
  ADD CONSTRAINT "GuestGameDelivery_runtime_identity_check"
    CHECK (
      (
        "leaseOwner" IS NULL
        OR pg_catalog.btrim("leaseOwner") <> ''
      )
      AND (
        "providerAttemptKey" IS NULL
        OR pg_catalog.btrim("providerAttemptKey") <> ''
      )
    ),
  ADD CONSTRAINT "GuestGameDelivery_digest_format_check"
    CHECK (
      ("claimOwnerDigest" IS NULL OR "claimOwnerDigest" ~ '^[0-9a-f]{64}$')
      AND ("claimTokenDigest" IS NULL OR "claimTokenDigest" ~ '^[0-9a-f]{64}$')
      AND ("effectInputDigest" IS NULL OR "effectInputDigest" ~ '^[0-9a-f]{64}$')
      AND ("providerConfigDigest" IS NULL OR "providerConfigDigest" ~ '^[0-9a-f]{64}$')
      AND ("workloadIdentityDigest" IS NULL OR "workloadIdentityDigest" ~ '^[0-9a-f]{64}$')
      AND ("sendGrantDigest" IS NULL OR "sendGrantDigest" ~ '^[0-9a-f]{64}$')
      AND ("providerReceiptDigest" IS NULL OR "providerReceiptDigest" ~ '^[0-9a-f]{64}$')
      AND ("terminalAckDigest" IS NULL OR "terminalAckDigest" ~ '^[0-9a-f]{64}$')
    ),
  ADD CONSTRAINT "GuestGameDelivery_outcome_check"
    CHECK (
      (
        "providerOutcomeClass" IS NULL
        AND "providerOutcomeCode" IS NULL
        AND "providerObservedAt" IS NULL
      )
      OR (
        "providerOutcomeClass" IS NOT NULL
        AND "providerOutcomeCode" IS NOT NULL
        AND "providerOutcomeClass" IN ('APPLIED', 'NOT_APPLIED', 'AMBIGUOUS')
        AND "providerOutcomeCode" ~ '^[A-Z][A-Z0-9_]{2,95}$'
        AND "providerObservedAt" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "GuestGameDelivery_claim_window_check"
    CHECK (
      (
        "claimedAt" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "acknowledgeUntil" IS NULL
      )
      OR (
        "claimedAt" IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
        AND "acknowledgeUntil" IS NOT NULL
        AND "claimedAt" < "leaseExpiresAt"
        AND "leaseExpiresAt" <= "acknowledgeUntil"
      )
    ),
  ADD CONSTRAINT "GuestGameDelivery_attempt_window_check"
    CHECK (
      "providerAttemptedAt" IS NULL
      OR (
        "claimedAt" IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
        AND "claimedAt" <= "providerAttemptedAt"
        AND "providerAttemptedAt" < "leaseExpiresAt"
      )
    ),
  ADD CONSTRAINT "GuestGameDelivery_send_grant_check"
    CHECK (
      (
        "sendGrantDigest" IS NULL
        AND "sendGrantExpiresAt" IS NULL
      )
      OR (
        "sendGrantDigest" IS NOT NULL
        AND "sendGrantExpiresAt" IS NOT NULL
        AND "providerAttemptedAt" IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
        AND "providerAttemptedAt" < "sendGrantExpiresAt"
        AND "sendGrantExpiresAt" <= "leaseExpiresAt"
      )
    ),
  ADD CONSTRAINT "GuestGameDelivery_receipt_pair_check"
    CHECK (
      (
        "providerReceiptRefEncrypted" IS NULL
        AND "providerReceiptKeyVersion" IS NULL
      )
      OR (
        "providerReceiptRefEncrypted" IS NOT NULL
        AND "providerReceiptKeyVersion" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "GuestGameDelivery_store_revision_scope_check"
    CHECK (
      "storeId" IS NOT NULL
      OR "storeExecutionRevision" IS NULL
    ),
  ADD CONSTRAINT "GuestGameDelivery_quarantine_state_check"
    CHECK (
      "integrityState" <> 'LEGACY_QUARANTINED'
      OR "status" IN ('BLOCKED', 'SENT', 'FAILED', 'CANCELED')
    ),
  ADD CONSTRAINT "GuestGameDelivery_provider_state_check"
    CHECK (
      "integrityState" = 'LEGACY_QUARANTINED'
      OR "channel" NOT IN ('TELEGRAM', 'MAX')
      OR (
        "storeId" IS NOT NULL
        AND "profileId" IS NOT NULL
        AND (
          (
            "status" = 'READY'
            AND "readinessStatus" = 'READY_FOR_BOT'
            AND "leaseOwner" IS NULL
            AND "providerAttemptedAt" IS NULL
            AND "providerAttemptKey" IS NULL
            AND "providerOutcomeClass" IS NULL
            AND "terminalAckDigest" IS NULL
          )
          OR (
            "status" = 'PROCESSING'
            AND "claimGeneration" > 0
            AND "attempts" > 0
            AND "claimJobKind" IS NOT NULL
            AND "executionRevision" IS NOT NULL
            AND "executionRevision" > 0
            AND "storeExecutionRevision" IS NOT NULL
            AND "storeExecutionRevision" > 0
            AND "leaseOwner" IS NOT NULL
            AND "claimKeyVersion" IS NOT NULL
            AND "claimOwnerDigest" IS NOT NULL
            AND "claimTokenDigest" IS NOT NULL
            AND "claimedAt" IS NOT NULL
            AND "effectInputDigest" IS NOT NULL
            AND "providerConfigDigest" IS NOT NULL
            AND "providerAttemptedAt" IS NULL
            AND "providerAttemptKey" IS NULL
            AND "sendGrantDigest" IS NULL
            AND "providerOutcomeClass" IS NULL
            AND "terminalAckDigest" IS NULL
          )
          OR (
            "status" = 'DISPATCHING'
            AND "claimGeneration" > 0
            AND "attempts" > 0
            AND "claimJobKind" IS NOT NULL
            AND "executionRevision" IS NOT NULL
            AND "executionRevision" > 0
            AND "storeExecutionRevision" IS NOT NULL
            AND "storeExecutionRevision" > 0
            AND "leaseOwner" IS NOT NULL
            AND "claimTokenDigest" IS NOT NULL
            AND "effectInputDigest" IS NOT NULL
            AND "providerConfigDigest" IS NOT NULL
            AND "providerAuthorityRevision" IS NOT NULL
            AND "workloadIdentityDigest" IS NOT NULL
            AND "providerAttemptKey" IS NOT NULL
            AND "providerAttemptedAt" IS NOT NULL
            AND "sendGrantDigest" IS NOT NULL
            AND "sendGrantExpiresAt" IS NOT NULL
            AND "providerOutcomeClass" IS NULL
            AND "terminalAckDigest" IS NULL
          )
          OR (
            "status" = 'RECONCILIATION_REQUIRED'
            AND "claimGeneration" > 0
            AND "leaseOwner" IS NULL
            AND "providerAttemptKey" IS NOT NULL
            AND "providerAttemptedAt" IS NOT NULL
            AND "providerOutcomeClass" IS NOT NULL
            AND "providerOutcomeClass" = 'AMBIGUOUS'
            AND "providerObservedAt" IS NOT NULL
            AND "stateReasonCode" IS NOT NULL
          )
          OR (
            "status" = 'SENT'
            AND "leaseOwner" IS NULL
            AND "providerAttemptKey" IS NOT NULL
            AND "providerAttemptedAt" IS NOT NULL
            AND "providerOutcomeClass" IS NOT NULL
            AND "providerOutcomeClass" = 'APPLIED'
            AND "providerObservedAt" IS NOT NULL
            AND "terminalAckDigest" IS NOT NULL
          )
          OR (
            "status" = 'FAILED'
            AND "leaseOwner" IS NULL
            AND (
              (
                "providerAttemptKey" IS NOT NULL
                AND "providerAttemptedAt" IS NOT NULL
                AND "providerOutcomeClass" IS NOT NULL
                AND "providerOutcomeClass" = 'NOT_APPLIED'
                AND "providerObservedAt" IS NOT NULL
                AND "terminalAckDigest" IS NOT NULL
              )
              OR (
                "providerAttemptKey" IS NULL
                AND "providerAttemptedAt" IS NULL
                AND "attempts" = "attemptBudget"
                AND "stateReasonCode" IS NOT NULL
              )
            )
          )
          OR (
            "status" = 'BLOCKED'
            AND "leaseOwner" IS NULL
            AND "providerAttemptedAt" IS NULL
            AND "providerAttemptKey" IS NULL
            AND "sendGrantDigest" IS NULL
            AND "stateReasonCode" IS NOT NULL
          )
          OR (
            "status" = 'CANCELED'
            AND "leaseOwner" IS NULL
            AND "providerAttemptedAt" IS NULL
            AND "providerAttemptKey" IS NULL
            AND "stateReasonCode" IS NOT NULL
          )
        )
      )
    ),
  ADD CONSTRAINT "GuestGameDelivery_non_provider_state_check"
    CHECK (
      "integrityState" = 'LEGACY_QUARANTINED'
      OR "channel" IN ('TELEGRAM', 'MAX')
      OR (
        "status" IN ('READY', 'BLOCKED', 'SENT', 'FAILED', 'CANCELED')
        AND "claimJobKind" IS NULL
        AND "executionRevision" IS NULL
        AND "storeExecutionRevision" IS NULL
        AND "leaseOwner" IS NULL
        AND "claimKeyVersion" IS NULL
        AND "claimOwnerDigest" IS NULL
        AND "claimTokenDigest" IS NULL
        AND "claimedAt" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "acknowledgeUntil" IS NULL
        AND "effectInputDigest" IS NULL
        AND "providerConfigDigest" IS NULL
        AND "providerAuthorityRevision" IS NULL
        AND "workloadIdentityDigest" IS NULL
        AND "sendGrantDigest" IS NULL
        AND "sendGrantExpiresAt" IS NULL
        AND "providerAttemptKey" IS NULL
        AND "providerAttemptedAt" IS NULL
        AND "providerOutcomeClass" IS NULL
        AND "providerOutcomeCode" IS NULL
        AND "providerObservedAt" IS NULL
        AND "providerReceiptDigest" IS NULL
        AND "providerReceiptRefEncrypted" IS NULL
        AND "providerReceiptKeyVersion" IS NULL
        AND "terminalAckDigest" IS NULL
        AND (
          "status" NOT IN ('BLOCKED', 'FAILED', 'CANCELED')
          OR "stateReasonCode" IS NOT NULL
        )
      )
    );

ALTER TABLE "GuestGameDeliveryAttempt"
  ADD CONSTRAINT "GuestGameDeliveryAttempt_channel_check"
    CHECK ("channel" IN ('TELEGRAM', 'MAX')),
  ADD CONSTRAINT "GuestGameDeliveryAttempt_job_kind_check"
    CHECK (
      "claimJobKind" IN (
        'GUEST_GAME_DELIVERY_DISPATCH',
        'GUEST_GAME_DELIVERY_BOT_PULL'
      )
    ),
  ADD CONSTRAINT "GuestGameDeliveryAttempt_positive_revision_check"
    CHECK (
      "claimGeneration" > 0
      AND "claimGeneration" < 2147483647
      AND "attemptNumber" > 0
      AND "executionRevision" > 0
      AND "storeExecutionRevision" > 0
      AND "claimKeyVersion" > 0
      AND "providerAuthorityRevision" > 0
    ),
  ADD CONSTRAINT "GuestGameDeliveryAttempt_digest_format_check"
    CHECK (
      "claimOwnerDigest" ~ '^[0-9a-f]{64}$'
      AND "claimTokenDigest" ~ '^[0-9a-f]{64}$'
      AND "effectInputDigest" ~ '^[0-9a-f]{64}$'
      AND "providerConfigDigest" ~ '^[0-9a-f]{64}$'
      AND "workloadIdentityDigest" ~ '^[0-9a-f]{64}$'
      AND "sendGrantDigest" ~ '^[0-9a-f]{64}$'
    ),
  ADD CONSTRAINT "GuestGameDeliveryAttempt_provider_key_check"
    CHECK (pg_catalog.btrim("providerAttemptKey") <> ''),
  ADD CONSTRAINT "GuestGameDeliveryAttempt_window_check"
    CHECK (
      "claimedAt" <= "providerAttemptedAt"
      AND "providerAttemptedAt" < "sendGrantExpiresAt"
      AND "sendGrantExpiresAt" <= "leaseExpiresAt"
      AND "leaseExpiresAt" <= "acknowledgeUntil"
    );

ALTER TABLE "GuestGameDeliveryEvent"
  ADD CONSTRAINT "GuestGameDeliveryEvent_transition_key_check"
    CHECK (
      (
        "transitionKey" IS NULL
        OR "transitionKey" ~ '^v1:[0-9a-f]{64}$'
      )
      AND (
        "eventType" NOT IN (
          'DELIVERY_CLAIMED',
          'DELIVERY_PROVIDER_ATTEMPTED',
          'DELIVERY_FINALIZED',
          'DELIVERY_REAPED',
          'DELIVERY_RETRIED',
          'DELIVERY_CANCELED',
          'DELIVERY_RECONCILED',
          'DELIVERY_INTEGRITY_QUARANTINED'
        )
        OR "transitionKey" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "GuestGameDeliveryEvent_scope_value_check"
    CHECK (
      (
        "transitionRevision" IS NULL
        OR "transitionRevision" >= 0
      )
      AND
      ("claimGeneration" IS NULL OR "claimGeneration" >= 0)
      AND ("attemptNumber" IS NULL OR "attemptNumber" >= 0)
      AND (
        "claimJobKind" IS NULL
        OR "claimJobKind" IN (
          'GUEST_GAME_DELIVERY_DISPATCH',
          'GUEST_GAME_DELIVERY_BOT_PULL'
        )
      )
      AND ("executionRevision" IS NULL OR "executionRevision" >= 0)
      AND (
        "storeExecutionRevision" IS NULL
        OR "storeExecutionRevision" >= 0
      )
      AND ("claimKeyVersion" IS NULL OR "claimKeyVersion" > 0)
      AND (
        "providerAuthorityRevision" IS NULL
        OR "providerAuthorityRevision" > 0
      )
      AND (
        "providerReceiptKeyVersion" IS NULL
        OR "providerReceiptKeyVersion" > 0
      )
      AND (
        (
          "providerOutcomeClass" IS NULL
          AND "providerOutcomeCode" IS NULL
          AND "providerObservedAt" IS NULL
        )
        OR (
          "providerOutcomeClass" IS NOT NULL
          AND "providerOutcomeCode" IS NOT NULL
          AND "providerOutcomeClass" IN ('APPLIED', 'NOT_APPLIED', 'AMBIGUOUS')
          AND "providerOutcomeCode" ~ '^[A-Z][A-Z0-9_]{2,95}$'
          AND "providerObservedAt" IS NOT NULL
        )
      )
      AND (
        "stateReasonCode" IS NULL
        OR "stateReasonCode" ~ '^[A-Z][A-Z0-9_]{2,95}$'
      )
      AND (
        "httpStatusClass" IS NULL
        OR "httpStatusClass" BETWEEN 1 AND 5
      )
    ),
  ADD CONSTRAINT "GuestGameDeliveryEvent_provider_key_check"
    CHECK (
      "providerAttemptKey" IS NULL
      OR pg_catalog.btrim("providerAttemptKey") <> ''
    ),
  ADD CONSTRAINT "GuestGameDeliveryEvent_digest_format_check"
    CHECK (
      ("claimOwnerDigest" IS NULL OR "claimOwnerDigest" ~ '^[0-9a-f]{64}$')
      AND ("claimTokenDigest" IS NULL OR "claimTokenDigest" ~ '^[0-9a-f]{64}$')
      AND ("effectInputDigest" IS NULL OR "effectInputDigest" ~ '^[0-9a-f]{64}$')
      AND ("providerConfigDigest" IS NULL OR "providerConfigDigest" ~ '^[0-9a-f]{64}$')
      AND ("workloadIdentityDigest" IS NULL OR "workloadIdentityDigest" ~ '^[0-9a-f]{64}$')
      AND ("sendGrantDigest" IS NULL OR "sendGrantDigest" ~ '^[0-9a-f]{64}$')
      AND ("providerReceiptDigest" IS NULL OR "providerReceiptDigest" ~ '^[0-9a-f]{64}$')
      AND ("terminalAckDigest" IS NULL OR "terminalAckDigest" ~ '^[0-9a-f]{64}$')
      AND ("provenanceDigest" IS NULL OR "provenanceDigest" ~ '^[0-9a-f]{64}$')
    ),
  ADD CONSTRAINT "GuestGameDeliveryEvent_receipt_pair_check"
    CHECK (
      (
        "providerReceiptRefEncrypted" IS NULL
        AND "providerReceiptKeyVersion" IS NULL
      )
      OR (
        "providerReceiptRefEncrypted" IS NOT NULL
        AND "providerReceiptKeyVersion" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "GuestGameDeliveryEvent_claim_window_check"
    CHECK (
      (
        "claimedAt" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "acknowledgeUntil" IS NULL
      )
      OR (
        "claimedAt" IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
        AND "acknowledgeUntil" IS NOT NULL
        AND "claimedAt" < "leaseExpiresAt"
        AND "leaseExpiresAt" <= "acknowledgeUntil"
      )
    ),
  ADD CONSTRAINT "GuestGameDeliveryEvent_attempt_window_check"
    CHECK (
      "providerAttemptedAt" IS NULL
      OR (
        "claimedAt" IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
        AND "claimedAt" <= "providerAttemptedAt"
        AND "providerAttemptedAt" < "leaseExpiresAt"
      )
    ),
  ADD CONSTRAINT "GuestGameDeliveryEvent_send_grant_check"
    CHECK (
      (
        "sendGrantDigest" IS NULL
        AND "sendGrantExpiresAt" IS NULL
      )
      OR (
        "sendGrantDigest" IS NOT NULL
        AND "sendGrantExpiresAt" IS NOT NULL
        AND "providerAttemptedAt" IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
        AND "providerAttemptedAt" < "sendGrantExpiresAt"
        AND "sendGrantExpiresAt" <= "leaseExpiresAt"
      )
    ),
  ADD CONSTRAINT "GuestGameDeliveryEvent_durable_evidence_check"
    CHECK (
      "eventType" NOT IN (
        'DELIVERY_CLAIMED',
        'DELIVERY_PROVIDER_ATTEMPTED',
        'DELIVERY_FINALIZED',
        'DELIVERY_REAPED',
        'DELIVERY_RETRIED',
        'DELIVERY_CANCELED',
        'DELIVERY_RECONCILED',
        'DELIVERY_INTEGRITY_QUARANTINED'
      )
      OR (
        "transitionRevision" IS NOT NULL
        AND
        "claimGeneration" IS NOT NULL
        AND "attemptNumber" IS NOT NULL
        AND (
          (
            "claimGeneration" = 0
            AND "attemptNumber" = 0
          )
          OR (
            "claimGeneration" > 0
            AND "attemptNumber" > 0
            AND "storeId" IS NOT NULL
            AND "channel" IS NOT NULL
            AND "channel" IN ('TELEGRAM', 'MAX')
            AND "claimJobKind" IS NOT NULL
            AND "executionRevision" IS NOT NULL
            AND "executionRevision" > 0
            AND "storeExecutionRevision" IS NOT NULL
            AND "storeExecutionRevision" > 0
            AND "claimKeyVersion" IS NOT NULL
            AND "claimOwnerDigest" IS NOT NULL
            AND "claimTokenDigest" IS NOT NULL
            AND "claimedAt" IS NOT NULL
            AND "effectInputDigest" IS NOT NULL
            AND "providerConfigDigest" IS NOT NULL
          )
        )
        AND (
          (
            "providerAttemptKey" IS NULL
            AND "attemptId" IS NULL
          )
          OR (
            "providerAttemptKey" IS NOT NULL
            AND "attemptId" IS NOT NULL
            AND "providerAuthorityRevision" IS NOT NULL
            AND "providerAuthorityRevision" > 0
            AND "workloadIdentityDigest" IS NOT NULL
            AND "providerAttemptedAt" IS NOT NULL
            AND "sendGrantDigest" IS NOT NULL
            AND "sendGrantExpiresAt" IS NOT NULL
          )
        )
        AND (
          (
            "eventType" = 'DELIVERY_CLAIMED'
            AND "claimGeneration" > 0
            AND "providerAttemptKey" IS NULL
            AND "providerOutcomeClass" IS NULL
          )
          OR (
            "eventType" = 'DELIVERY_PROVIDER_ATTEMPTED'
            AND "attemptId" IS NOT NULL
            AND "providerAttemptKey" IS NOT NULL
            AND "providerOutcomeClass" IS NULL
          )
          OR (
            "eventType" = 'DELIVERY_FINALIZED'
            AND (
              (
                "attemptId" IS NULL
                AND "providerOutcomeClass" IS NULL
                AND "stateReasonCode" IS NOT NULL
              )
              OR (
                "attemptId" IS NOT NULL
                AND "providerOutcomeClass" IS NOT NULL
                AND "providerOutcomeClass" IN ('APPLIED', 'NOT_APPLIED')
                AND "terminalAckDigest" IS NOT NULL
              )
            )
          )
          OR (
            "eventType" = 'DELIVERY_REAPED'
            AND "stateReasonCode" IS NOT NULL
            AND (
              (
                "attemptId" IS NULL
                AND "providerOutcomeClass" IS NULL
              )
              OR (
                "attemptId" IS NOT NULL
                AND "providerOutcomeClass" IS NOT NULL
                AND "providerOutcomeClass" = 'AMBIGUOUS'
              )
            )
          )
          OR (
            "eventType" = 'DELIVERY_RETRIED'
            AND "stateReasonCode" IS NOT NULL
            AND (
              (
                "attemptId" IS NULL
                AND "providerOutcomeClass" IS NULL
              )
              OR (
                "attemptId" IS NOT NULL
                AND "providerOutcomeClass" IS NOT NULL
                AND "providerOutcomeClass" = 'NOT_APPLIED'
                AND "terminalAckDigest" IS NOT NULL
              )
            )
          )
          OR (
            "eventType" = 'DELIVERY_CANCELED'
            AND "attemptId" IS NULL
            AND "providerOutcomeClass" IS NULL
            AND "stateReasonCode" IS NOT NULL
          )
          OR (
            "eventType" = 'DELIVERY_RECONCILED'
            AND "attemptId" IS NOT NULL
            AND "providerOutcomeClass" IS NOT NULL
            AND "providerOutcomeClass" IN ('APPLIED', 'NOT_APPLIED')
            AND "terminalAckDigest" IS NOT NULL
          )
          OR (
            "eventType" = 'DELIVERY_INTEGRITY_QUARANTINED'
            AND "stateReasonCode" IS NOT NULL
          )
        )
      )
    );

CREATE UNIQUE INDEX "guest_game_delivery_current_attempt_uidx"
  ON "GuestGameDelivery" ("tenantId", "providerAttemptKey")
  WHERE "providerAttemptKey" IS NOT NULL;

CREATE INDEX "guest_game_delivery_ready_claim_idx"
  ON "GuestGameDelivery" (
    "tenantId", "readinessStatus", "channel", "preparedAt", "id"
  )
  WHERE "status" = 'READY';

CREATE INDEX "guest_game_delivery_processing_reaper_idx"
  ON "GuestGameDelivery" ("tenantId", "leaseExpiresAt", "id")
  WHERE "status" = 'PROCESSING' AND "providerAttemptedAt" IS NULL;

CREATE INDEX "guest_game_delivery_dispatching_ack_idx"
  ON "GuestGameDelivery" ("tenantId", "acknowledgeUntil", "id")
  WHERE "status" = 'DISPATCHING';

CREATE INDEX "guest_game_delivery_reconciliation_idx"
  ON "GuestGameDelivery" ("tenantId", "providerObservedAt", "id")
  WHERE "status" = 'RECONCILIATION_REQUIRED';

CREATE INDEX "guest_game_delivery_store_execution_idx"
  ON "GuestGameDelivery" (
    "tenantId", "storeId", "status", "leaseExpiresAt", "id"
  )
  WHERE "storeId" IS NOT NULL;

CREATE OR REPLACE FUNCTION public."guest_game_delivery_transition_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  status_changed BOOLEAN;
  is_provider BOOLEAN;
  retry_transition BOOLEAN;
  requires_transition_event BOOLEAN;
BEGIN
  is_provider := NEW."channel" IN ('TELEGRAM', 'MAX');

  IF TG_OP = 'INSERT' THEN
    IF NEW."integrityState" = 'LEGACY_QUARANTINED' THEN
      RAISE EXCEPTION
        'Fresh delivery cannot self-assign legacy quarantine'
        USING ERRCODE = '23514';
    END IF;

    IF NEW."claimGeneration" <> 0
       OR NEW."attempts" <> 0
       OR NEW."transitionRevision" <> 0
    THEN
      RAISE EXCEPTION
        'Fresh delivery must start without claim or transition revisions'
        USING ERRCODE = '23514';
    END IF;

    IF is_provider
       AND NEW."status" NOT IN ('READY', 'BLOCKED')
    THEN
      RAISE EXCEPTION
        'Fresh provider delivery must start READY or BLOCKED'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD."integrityState" = 'LEGACY_QUARANTINED' THEN
    RAISE EXCEPTION
      'Legacy quarantined delivery is immutable; dedicated reconciliation is not enabled'
      USING ERRCODE = '55000';
  END IF;

  status_changed := OLD."status" IS DISTINCT FROM NEW."status";
  retry_transition :=
    OLD."status" IN ('FAILED', 'BLOCKED', 'RECONCILIATION_REQUIRED')
    AND NEW."status" = 'READY';
  requires_transition_event :=
    OLD."integrityState" IS DISTINCT FROM NEW."integrityState"
    OR (
      is_provider
      AND NEW."integrityState" = 'VERIFIED'
      AND (
        status_changed
        OR OLD."claimGeneration" IS DISTINCT FROM NEW."claimGeneration"
      )
    );

  IF requires_transition_event THEN
    IF NEW."transitionRevision" <> OLD."transitionRevision" + 1 THEN
      RAISE EXCEPTION
        'Event-bearing transition must advance transition revision exactly once'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."transitionRevision" IS DISTINCT FROM OLD."transitionRevision" THEN
    RAISE EXCEPTION
      'Transition revision can advance only with a durable event'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."attempts" < OLD."attempts"
     OR NEW."attemptBudget" < OLD."attemptBudget"
     OR NEW."claimGeneration" < OLD."claimGeneration"
  THEN
    RAISE EXCEPTION
      'Delivery attempts, budget and generation are monotonic'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."attemptBudget" > OLD."attemptBudget" THEN
    IF NEW."attemptBudget" <> OLD."attemptBudget" + 1
       OR NOT retry_transition
    THEN
      RAISE EXCEPTION
        'Attempt budget can advance once only during dedicated retry'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD."status" = 'READY' AND NEW."status" = 'PROCESSING' THEN
    IF NEW."claimGeneration" <> OLD."claimGeneration" + 1
       OR NEW."attempts" <> OLD."attempts" + 1
       OR OLD."providerAttemptedAt" IS NOT NULL
    THEN
      RAISE EXCEPTION
        'Claim must advance generation and attempts exactly once'
        USING ERRCODE = '23514';
    END IF;
  ELSIF OLD."status" = 'PROCESSING'
        AND NEW."status" = 'PROCESSING'
        AND (
          NEW."claimGeneration" IS DISTINCT FROM OLD."claimGeneration"
          OR NEW."attempts" IS DISTINCT FROM OLD."attempts"
        )
  THEN
    IF NEW."claimGeneration" <> OLD."claimGeneration" + 1
       OR NEW."attempts" <> OLD."attempts" + 1
       OR OLD."providerAttemptedAt" IS NOT NULL
       OR OLD."leaseExpiresAt" > CURRENT_TIMESTAMP
    THEN
      RAISE EXCEPTION
        'Only an expired unattempted claim can advance generation'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."claimGeneration" <> OLD."claimGeneration"
        OR NEW."attempts" <> OLD."attempts"
  THEN
    RAISE EXCEPTION
      'Generation and attempts can advance only during an exact claim'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."claimGeneration" = OLD."claimGeneration"
     AND OLD."claimGeneration" > 0
     AND (
       NEW."claimJobKind" IS DISTINCT FROM OLD."claimJobKind"
       OR NEW."executionRevision" IS DISTINCT FROM OLD."executionRevision"
       OR NEW."storeExecutionRevision" IS DISTINCT FROM OLD."storeExecutionRevision"
       OR NEW."claimKeyVersion" IS DISTINCT FROM OLD."claimKeyVersion"
       OR NEW."claimOwnerDigest" IS DISTINCT FROM OLD."claimOwnerDigest"
       OR NEW."claimTokenDigest" IS DISTINCT FROM OLD."claimTokenDigest"
       OR NEW."claimedAt" IS DISTINCT FROM OLD."claimedAt"
       OR NEW."leaseExpiresAt" IS DISTINCT FROM OLD."leaseExpiresAt"
       OR NEW."acknowledgeUntil" IS DISTINCT FROM OLD."acknowledgeUntil"
       OR NEW."effectInputDigest" IS DISTINCT FROM OLD."effectInputDigest"
       OR NEW."providerConfigDigest" IS DISTINCT FROM OLD."providerConfigDigest"
     )
  THEN
    RAISE EXCEPTION
      'Claim snapshot is immutable within one generation'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."leaseOwner" IS DISTINCT FROM OLD."leaseOwner"
     AND NOT (
       NEW."claimGeneration" IS DISTINCT FROM OLD."claimGeneration"
       OR (
         status_changed
         AND NEW."leaseOwner" IS NULL
       )
     )
  THEN
    RAISE EXCEPTION
      'Raw lease owner can change only on claim or be cleared on transition'
      USING ERRCODE = '23514';
  END IF;

  IF (
    NEW."providerAuthorityRevision" IS DISTINCT FROM OLD."providerAuthorityRevision"
    OR NEW."workloadIdentityDigest" IS DISTINCT FROM OLD."workloadIdentityDigest"
    OR NEW."providerAttemptKey" IS DISTINCT FROM OLD."providerAttemptKey"
    OR NEW."providerAttemptedAt" IS DISTINCT FROM OLD."providerAttemptedAt"
    OR NEW."sendGrantDigest" IS DISTINCT FROM OLD."sendGrantDigest"
    OR NEW."sendGrantExpiresAt" IS DISTINCT FROM OLD."sendGrantExpiresAt"
  ) AND NOT (
    (
      OLD."status" = 'PROCESSING'
      AND NEW."status" = 'DISPATCHING'
    )
    OR retry_transition
  )
  THEN
    RAISE EXCEPTION
      'Provider marker can change only on marker commit or dedicated retry'
      USING ERRCODE = '23514';
  END IF;

  IF (
    NEW."providerOutcomeClass" IS DISTINCT FROM OLD."providerOutcomeClass"
    OR NEW."providerOutcomeCode" IS DISTINCT FROM OLD."providerOutcomeCode"
    OR NEW."providerObservedAt" IS DISTINCT FROM OLD."providerObservedAt"
    OR NEW."providerReceiptDigest" IS DISTINCT FROM OLD."providerReceiptDigest"
    OR NEW."providerReceiptRefEncrypted"
      IS DISTINCT FROM OLD."providerReceiptRefEncrypted"
    OR NEW."providerReceiptKeyVersion"
      IS DISTINCT FROM OLD."providerReceiptKeyVersion"
    OR NEW."terminalAckDigest" IS DISTINCT FROM OLD."terminalAckDigest"
  ) AND NOT (
    (
      OLD."status" = 'DISPATCHING'
      AND NEW."status" IN ('SENT', 'FAILED', 'RECONCILIATION_REQUIRED')
    )
    OR (
      OLD."status" = 'RECONCILIATION_REQUIRED'
      AND NEW."status" IN ('READY', 'SENT', 'FAILED')
    )
  )
  THEN
    RAISE EXCEPTION
      'Provider outcome evidence can change only during finalize or reconciliation'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" IN ('SENT', 'CANCELED')
     AND status_changed
  THEN
    RAISE EXCEPTION
      'Terminal delivery status is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."rewardId" IS DISTINCT FROM OLD."rewardId"
     OR NEW."channel" IS DISTINCT FROM OLD."channel"
  THEN
    RAISE EXCEPTION
      'Delivery tenant, reward and channel identity is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF is_provider AND status_changed AND NOT (
    (OLD."status" = 'READY' AND NEW."status" IN ('PROCESSING', 'BLOCKED', 'CANCELED'))
    OR (OLD."status" = 'PROCESSING' AND NEW."status" IN ('READY', 'DISPATCHING', 'FAILED', 'BLOCKED', 'CANCELED'))
    OR (OLD."status" = 'DISPATCHING' AND NEW."status" IN ('SENT', 'FAILED', 'RECONCILIATION_REQUIRED'))
    OR (OLD."status" = 'RECONCILIATION_REQUIRED' AND NEW."status" IN ('READY', 'SENT', 'FAILED'))
    OR (OLD."status" IN ('FAILED', 'BLOCKED') AND NEW."status" IN ('READY', 'CANCELED'))
  ) THEN
    RAISE EXCEPTION
      'Provider delivery transition is not allowed'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."claimGeneration" > 0 AND (
    NEW."profileId" IS DISTINCT FROM OLD."profileId"
    OR NEW."guestId" IS DISTINCT FROM OLD."guestId"
    OR NEW."storeId" IS DISTINCT FROM OLD."storeId"
  ) THEN
    RAISE EXCEPTION
      'Claimed delivery scope is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public."guest_game_delivery_transition_guard"()
FROM PUBLIC;

CREATE TRIGGER "GuestGameDelivery_transition_guard"
BEFORE INSERT OR UPDATE ON "GuestGameDelivery"
FOR EACH ROW
EXECUTE FUNCTION public."guest_game_delivery_transition_guard"();

CREATE OR REPLACE FUNCTION public."guest_game_delivery_binding_check"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  delivery_record RECORD;
  reward_record RECORD;
BEGIN
  -- This is a deferred trigger. Re-read the final row instead of validating a
  -- queued NEW tuple from an earlier statement in the same transaction.
  SELECT
    delivery."id",
    delivery."tenantId",
    delivery."rewardId",
    delivery."storeId",
    delivery."profileId",
    delivery."guestId",
    delivery."channel",
    delivery."integrityState"
  INTO delivery_record
  FROM public."GuestGameDelivery" AS delivery
  WHERE delivery."id" = NEW."id";

  IF NOT FOUND
     OR delivery_record."integrityState" <> 'VERIFIED'
     OR delivery_record."channel" NOT IN ('TELEGRAM', 'MAX')
  THEN
    RETURN NULL;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      delivery_record."tenantId" || ':' || delivery_record."rewardId",
      166
    )
  );

  -- Canonical lock order is Reward, then Delivery. The delivery row is
  -- selected again after both locks so every queued trigger sees final state.
  SELECT reward."storeId", reward."profileId", reward."guestId"
  INTO STRICT reward_record
  FROM public."GuestGameReward" AS reward
  WHERE reward."tenantId" = delivery_record."tenantId"
    AND reward."id" = delivery_record."rewardId"
  FOR UPDATE;

  SELECT
    delivery."storeId",
    delivery."profileId",
    delivery."guestId",
    delivery."channel",
    delivery."integrityState"
  INTO STRICT delivery_record
  FROM public."GuestGameDelivery" AS delivery
  WHERE delivery."tenantId" = delivery_record."tenantId"
    AND delivery."id" = NEW."id"
  FOR UPDATE;

  IF delivery_record."integrityState" = 'VERIFIED'
     AND delivery_record."channel" IN ('TELEGRAM', 'MAX')
     AND (
       reward_record."storeId" IS NULL
       OR delivery_record."storeId"
         IS DISTINCT FROM reward_record."storeId"
       OR reward_record."profileId" IS NULL
       OR delivery_record."profileId"
         IS DISTINCT FROM reward_record."profileId"
       OR delivery_record."guestId"
         IS DISTINCT FROM reward_record."guestId"
     )
  THEN
    RAISE EXCEPTION
      'Verified provider delivery does not match canonical reward binding'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION public."guest_game_delivery_binding_check"()
FROM PUBLIC;

CREATE CONSTRAINT TRIGGER "GuestGameDelivery_binding_check"
AFTER INSERT OR UPDATE OF
  "tenantId",
  "rewardId",
  "profileId",
  "guestId",
  "storeId",
  "channel",
  "integrityState",
  "status"
ON "GuestGameDelivery"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public."guest_game_delivery_binding_check"();

CREATE OR REPLACE FUNCTION public."guest_game_reward_delivery_binding_check"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  reward_record RECORD;
BEGIN
  -- A deferred trigger can be queued more than once. Resolve the current
  -- reward once, then validate the final delivery set under stable row locks.
  SELECT
    reward."id",
    reward."tenantId",
    reward."storeId",
    reward."profileId",
    reward."guestId"
  INTO reward_record
  FROM public."GuestGameReward" AS reward
  WHERE reward."id" = NEW."id";

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      reward_record."tenantId" || ':' || reward_record."id",
      166
    )
  );

  SELECT
    reward."id",
    reward."tenantId",
    reward."storeId",
    reward."profileId",
    reward."guestId"
  INTO STRICT reward_record
  FROM public."GuestGameReward" AS reward
  WHERE reward."tenantId" = reward_record."tenantId"
    AND reward."id" = reward_record."id"
  FOR UPDATE;

  PERFORM delivery."id"
  FROM public."GuestGameDelivery" AS delivery
  WHERE delivery."tenantId" = reward_record."tenantId"
    AND delivery."rewardId" = reward_record."id"
    AND delivery."channel" IN ('TELEGRAM', 'MAX')
    AND delivery."integrityState" = 'VERIFIED'
  ORDER BY delivery."id"
  FOR UPDATE;

  IF EXISTS (
       SELECT 1
       FROM public."GuestGameDelivery" AS delivery
       WHERE delivery."tenantId" = reward_record."tenantId"
         AND delivery."rewardId" = reward_record."id"
         AND delivery."channel" IN ('TELEGRAM', 'MAX')
         AND delivery."integrityState" = 'VERIFIED'
         AND delivery."claimGeneration" > 0
         AND delivery."storeId" IS DISTINCT FROM reward_record."storeId"
     )
  THEN
    RAISE EXCEPTION
      'Claimed provider reward Store binding is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
        SELECT 1
        FROM public."GuestGameDelivery" AS delivery
        WHERE delivery."tenantId" = reward_record."tenantId"
          AND delivery."rewardId" = reward_record."id"
          AND delivery."channel" IN ('TELEGRAM', 'MAX')
          AND delivery."integrityState" = 'VERIFIED'
          AND (
            reward_record."storeId" IS NULL
            OR delivery."storeId"
              IS DISTINCT FROM reward_record."storeId"
            OR reward_record."profileId" IS NULL
            OR delivery."profileId"
              IS DISTINCT FROM reward_record."profileId"
            OR delivery."guestId"
              IS DISTINCT FROM reward_record."guestId"
          )
  ) THEN
    RAISE EXCEPTION
      'Reward update breaks verified provider delivery binding'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION public."guest_game_reward_delivery_binding_check"()
FROM PUBLIC;

CREATE CONSTRAINT TRIGGER "GuestGameReward_delivery_binding_check"
AFTER UPDATE OF "storeId", "profileId", "guestId"
ON "GuestGameReward"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public."guest_game_reward_delivery_binding_check"();

CREATE OR REPLACE FUNCTION public."guest_game_delivery_transition_event_check"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  expected_event_type TEXT;
  matching_events INTEGER;
  matching_attempts INTEGER;
BEGIN
  IF OLD."integrityState" IS DISTINCT FROM NEW."integrityState" THEN
    expected_event_type := CASE
      WHEN NEW."integrityState" = 'LEGACY_QUARANTINED'
        THEN 'DELIVERY_INTEGRITY_QUARANTINED'
      ELSE 'DELIVERY_RECONCILED'
    END;
  ELSIF OLD."claimGeneration" IS DISTINCT FROM NEW."claimGeneration" THEN
    expected_event_type := 'DELIVERY_CLAIMED';
  ELSIF OLD."status" IS NOT DISTINCT FROM NEW."status" THEN
    RETURN NULL;
  ELSIF OLD."status" = 'PROCESSING' AND NEW."status" = 'DISPATCHING' THEN
    expected_event_type := 'DELIVERY_PROVIDER_ATTEMPTED';
  ELSIF OLD."status" = 'PROCESSING' AND NEW."status" = 'READY' THEN
    expected_event_type := 'DELIVERY_REAPED';
  ELSIF OLD."status" = 'DISPATCHING'
        AND NEW."status" = 'RECONCILIATION_REQUIRED' THEN
    expected_event_type := 'DELIVERY_REAPED';
  ELSIF OLD."status" IN ('FAILED', 'BLOCKED', 'RECONCILIATION_REQUIRED')
        AND NEW."status" = 'READY' THEN
    expected_event_type := 'DELIVERY_RETRIED';
  ELSIF NEW."status" = 'CANCELED' THEN
    expected_event_type := 'DELIVERY_CANCELED';
  ELSIF OLD."status" = 'RECONCILIATION_REQUIRED' THEN
    expected_event_type := 'DELIVERY_RECONCILED';
  ELSE
    expected_event_type := 'DELIVERY_FINALIZED';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO matching_events
  FROM public."GuestGameDeliveryEvent" AS event
  WHERE event."tenantId" = NEW."tenantId"
    AND event."deliveryId" = NEW."id"
    AND event."rewardId" = NEW."rewardId"
    AND event."storeId" IS NOT DISTINCT FROM NEW."storeId"
    AND event."channel" IS NOT DISTINCT FROM NEW."channel"
    AND event."eventType" = expected_event_type
    AND event."transitionKey" IS NOT NULL
    AND event."transitionRevision" = NEW."transitionRevision"
    AND event."transitionKey" =
      public."guest_game_delivery_transition_key_v1"(
        event."tenantId",
        event."deliveryId",
        event."rewardId",
        event."transitionRevision",
        event."claimGeneration",
        event."eventType",
        event."attemptNumber",
        event."providerOutcomeClass",
        event."providerOutcomeCode",
        event."fromStatus",
        event."toStatus"
      )
    AND event."fromStatus" IS NOT DISTINCT FROM OLD."status"
    AND event."toStatus" IS NOT DISTINCT FROM NEW."status"
    AND event."claimGeneration" IS NOT DISTINCT FROM NEW."claimGeneration"
    AND event."attemptNumber" IS NOT DISTINCT FROM NEW."attempts"
    AND event."claimJobKind" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."claimJobKind" ELSE NEW."claimJobKind" END
    )
    AND event."executionRevision" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."executionRevision" ELSE NEW."executionRevision" END
    )
    AND event."storeExecutionRevision" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."storeExecutionRevision" ELSE NEW."storeExecutionRevision" END
    )
    AND event."claimKeyVersion" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."claimKeyVersion" ELSE NEW."claimKeyVersion" END
    )
    AND event."claimOwnerDigest" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."claimOwnerDigest" ELSE NEW."claimOwnerDigest" END
    )
    AND event."claimTokenDigest" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."claimTokenDigest" ELSE NEW."claimTokenDigest" END
    )
    AND event."claimedAt" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."claimedAt" ELSE NEW."claimedAt" END
    )
    AND event."leaseExpiresAt" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."leaseExpiresAt" ELSE NEW."leaseExpiresAt" END
    )
    AND event."acknowledgeUntil" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."acknowledgeUntil" ELSE NEW."acknowledgeUntil" END
    )
    AND event."effectInputDigest" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."effectInputDigest" ELSE NEW."effectInputDigest" END
    )
    AND event."providerConfigDigest" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."providerConfigDigest" ELSE NEW."providerConfigDigest" END
    )
    AND event."providerAuthorityRevision" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."providerAuthorityRevision"
        ELSE NEW."providerAuthorityRevision" END
    )
    AND event."workloadIdentityDigest" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."workloadIdentityDigest"
        ELSE NEW."workloadIdentityDigest" END
    )
    AND event."providerAttemptKey" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."providerAttemptKey" ELSE NEW."providerAttemptKey" END
    )
    AND event."providerAttemptedAt" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."providerAttemptedAt" ELSE NEW."providerAttemptedAt" END
    )
    AND event."sendGrantDigest" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."sendGrantDigest" ELSE NEW."sendGrantDigest" END
    )
    AND event."sendGrantExpiresAt" IS NOT DISTINCT FROM (
      CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
        THEN OLD."sendGrantExpiresAt" ELSE NEW."sendGrantExpiresAt" END
    )
    AND event."providerOutcomeClass" IS NOT DISTINCT FROM (
      CASE
        WHEN expected_event_type = 'DELIVERY_RETRIED'
             AND OLD."status" = 'RECONCILIATION_REQUIRED'
          THEN 'NOT_APPLIED'
        WHEN expected_event_type = 'DELIVERY_RETRIED'
          THEN OLD."providerOutcomeClass"
        ELSE NEW."providerOutcomeClass"
      END
    )
    AND (
      (
        expected_event_type = 'DELIVERY_RETRIED'
        AND OLD."status" = 'RECONCILIATION_REQUIRED'
        AND event."providerOutcomeCode" IS NOT NULL
      )
      OR (
        NOT (
          expected_event_type = 'DELIVERY_RETRIED'
          AND OLD."status" = 'RECONCILIATION_REQUIRED'
        )
        AND event."providerOutcomeCode" IS NOT DISTINCT FROM (
          CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
            THEN OLD."providerOutcomeCode" ELSE NEW."providerOutcomeCode" END
        )
      )
    )
    AND (
      (
        expected_event_type = 'DELIVERY_RETRIED'
        AND OLD."status" = 'RECONCILIATION_REQUIRED'
        AND event."providerObservedAt" IS NOT NULL
      )
      OR (
        NOT (
          expected_event_type = 'DELIVERY_RETRIED'
          AND OLD."status" = 'RECONCILIATION_REQUIRED'
        )
        AND event."providerObservedAt" IS NOT DISTINCT FROM (
          CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
            THEN OLD."providerObservedAt" ELSE NEW."providerObservedAt" END
        )
      )
    )
    AND (
      (
        expected_event_type = 'DELIVERY_RETRIED'
        AND OLD."status" = 'RECONCILIATION_REQUIRED'
      )
      OR event."providerReceiptDigest" IS NOT DISTINCT FROM (
        CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
          THEN OLD."providerReceiptDigest" ELSE NEW."providerReceiptDigest" END
      )
    )
    AND (
      (
        expected_event_type = 'DELIVERY_RETRIED'
        AND OLD."status" = 'RECONCILIATION_REQUIRED'
      )
      OR event."providerReceiptRefEncrypted" IS NOT DISTINCT FROM (
        CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
          THEN OLD."providerReceiptRefEncrypted"
          ELSE NEW."providerReceiptRefEncrypted" END
      )
    )
    AND (
      (
        expected_event_type = 'DELIVERY_RETRIED'
        AND OLD."status" = 'RECONCILIATION_REQUIRED'
      )
      OR event."providerReceiptKeyVersion" IS NOT DISTINCT FROM (
        CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
          THEN OLD."providerReceiptKeyVersion"
          ELSE NEW."providerReceiptKeyVersion" END
      )
    )
    AND (
      (
        expected_event_type = 'DELIVERY_RETRIED'
        AND OLD."status" = 'RECONCILIATION_REQUIRED'
        AND event."terminalAckDigest" IS NOT NULL
      )
      OR (
        NOT (
          expected_event_type = 'DELIVERY_RETRIED'
          AND OLD."status" = 'RECONCILIATION_REQUIRED'
        )
        AND event."terminalAckDigest" IS NOT DISTINCT FROM (
          CASE WHEN expected_event_type = 'DELIVERY_RETRIED'
            THEN OLD."terminalAckDigest" ELSE NEW."terminalAckDigest" END
        )
      )
    )
    AND (
      (
        expected_event_type = 'DELIVERY_RETRIED'
        AND event."stateReasonCode" IS NOT NULL
      )
      OR (
        expected_event_type <> 'DELIVERY_RETRIED'
        AND event."stateReasonCode" IS NOT DISTINCT FROM NEW."stateReasonCode"
      )
    )
    AND (
      (
        event."providerAttemptKey" IS NULL
        AND event."attemptId" IS NULL
      )
      OR (
        event."providerAttemptKey" IS NOT NULL
        AND event."attemptId" IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public."GuestGameDeliveryAttempt" AS attempt
          WHERE attempt."tenantId" = event."tenantId"
            AND attempt."id" = event."attemptId"
            AND attempt."deliveryId" = event."deliveryId"
            AND attempt."rewardId" = event."rewardId"
            AND attempt."storeId" = event."storeId"
            AND attempt."claimGeneration" = event."claimGeneration"
            AND attempt."attemptNumber" = event."attemptNumber"
            AND attempt."providerAttemptKey" = event."providerAttemptKey"
        )
      )
    );

  IF matching_events <> 1 THEN
    RAISE EXCEPTION
      'Delivery transition requires exactly one typed durable event'
      USING ERRCODE = '23514';
  END IF;

  IF expected_event_type = 'DELIVERY_PROVIDER_ATTEMPTED' THEN
    SELECT pg_catalog.count(*)::INTEGER
    INTO matching_attempts
    FROM public."GuestGameDeliveryAttempt" AS attempt
    WHERE attempt."tenantId" = NEW."tenantId"
      AND attempt."deliveryId" = NEW."id"
      AND attempt."rewardId" = NEW."rewardId"
      AND attempt."storeId" = NEW."storeId"
      AND attempt."channel" = NEW."channel"
      AND attempt."claimGeneration" = NEW."claimGeneration"
      AND attempt."attemptNumber" = NEW."attempts"
      AND attempt."claimJobKind" = NEW."claimJobKind"
      AND attempt."executionRevision" = NEW."executionRevision"
      AND attempt."storeExecutionRevision" = NEW."storeExecutionRevision"
      AND attempt."claimKeyVersion" = NEW."claimKeyVersion"
      AND attempt."claimOwnerDigest" = NEW."claimOwnerDigest"
      AND attempt."claimTokenDigest" = NEW."claimTokenDigest"
      AND attempt."effectInputDigest" = NEW."effectInputDigest"
      AND attempt."providerConfigDigest" = NEW."providerConfigDigest"
      AND attempt."providerAuthorityRevision" = NEW."providerAuthorityRevision"
      AND attempt."workloadIdentityDigest" = NEW."workloadIdentityDigest"
      AND attempt."providerAttemptKey" = NEW."providerAttemptKey"
      AND attempt."providerAttemptedAt" = NEW."providerAttemptedAt"
      AND attempt."sendGrantDigest" = NEW."sendGrantDigest"
      AND attempt."sendGrantExpiresAt" = NEW."sendGrantExpiresAt"
      AND EXISTS (
        SELECT 1
        FROM public."GuestGameDeliveryEvent" AS event
        WHERE event."tenantId" = NEW."tenantId"
          AND event."deliveryId" = NEW."id"
          AND event."eventType" = 'DELIVERY_PROVIDER_ATTEMPTED'
          AND event."attemptId" = attempt."id"
          AND event."transitionKey" IS NOT NULL
      );

    IF matching_attempts <> 1 THEN
      RAISE EXCEPTION
        'Provider marker requires one matching immutable attempt'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION public."guest_game_delivery_transition_event_check"()
FROM PUBLIC;

CREATE CONSTRAINT TRIGGER "GuestGameDelivery_transition_event_check"
AFTER UPDATE OF
  "status",
  "integrityState",
  "claimGeneration",
  "transitionRevision",
  "providerAttemptedAt",
  "providerOutcomeClass"
ON "GuestGameDelivery"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (
  OLD."integrityState" IS DISTINCT FROM NEW."integrityState"
  OR (
    NEW."channel" IN ('TELEGRAM', 'MAX')
    AND NEW."integrityState" = 'VERIFIED'
    AND (
      OLD."status" IS DISTINCT FROM NEW."status"
      OR OLD."claimGeneration" IS DISTINCT FROM NEW."claimGeneration"
    )
  )
)
EXECUTE FUNCTION public."guest_game_delivery_transition_event_check"();

-- Attempt evidence is insert-validated and append-only. UPDATE always fails;
-- DELETE is reserved for the separately operated evidence-retention identity.
CREATE OR REPLACE FUNCTION public."guest_game_delivery_attempt_append_only"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  delivery_record RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT
      delivery."rewardId",
      delivery."storeId",
      delivery."channel",
      delivery."status",
      delivery."claimGeneration",
      delivery."attempts",
      delivery."claimJobKind",
      delivery."executionRevision",
      delivery."storeExecutionRevision",
      delivery."claimKeyVersion",
      delivery."claimOwnerDigest",
      delivery."claimTokenDigest",
      delivery."claimedAt",
      delivery."leaseExpiresAt",
      delivery."acknowledgeUntil",
      delivery."effectInputDigest",
      delivery."providerConfigDigest",
      delivery."providerAuthorityRevision",
      delivery."workloadIdentityDigest",
      delivery."providerAttemptKey",
      delivery."providerAttemptedAt",
      delivery."sendGrantDigest",
      delivery."sendGrantExpiresAt"
    INTO STRICT delivery_record
    FROM public."GuestGameDelivery" AS delivery
    WHERE delivery."tenantId" = NEW."tenantId"
      AND delivery."id" = NEW."deliveryId";

    IF delivery_record."status" <> 'DISPATCHING'
       OR delivery_record."rewardId" IS DISTINCT FROM NEW."rewardId"
       OR delivery_record."storeId" IS DISTINCT FROM NEW."storeId"
       OR delivery_record."channel" IS DISTINCT FROM NEW."channel"
       OR delivery_record."claimGeneration" IS DISTINCT FROM NEW."claimGeneration"
       OR delivery_record."attempts" IS DISTINCT FROM NEW."attemptNumber"
       OR delivery_record."claimJobKind" IS DISTINCT FROM NEW."claimJobKind"
       OR delivery_record."executionRevision" IS DISTINCT FROM NEW."executionRevision"
       OR delivery_record."storeExecutionRevision" IS DISTINCT FROM NEW."storeExecutionRevision"
       OR delivery_record."claimKeyVersion" IS DISTINCT FROM NEW."claimKeyVersion"
       OR delivery_record."claimOwnerDigest" IS DISTINCT FROM NEW."claimOwnerDigest"
       OR delivery_record."claimTokenDigest" IS DISTINCT FROM NEW."claimTokenDigest"
       OR delivery_record."claimedAt" IS DISTINCT FROM NEW."claimedAt"
       OR delivery_record."leaseExpiresAt" IS DISTINCT FROM NEW."leaseExpiresAt"
       OR delivery_record."acknowledgeUntil" IS DISTINCT FROM NEW."acknowledgeUntil"
       OR delivery_record."effectInputDigest" IS DISTINCT FROM NEW."effectInputDigest"
       OR delivery_record."providerConfigDigest" IS DISTINCT FROM NEW."providerConfigDigest"
       OR delivery_record."providerAuthorityRevision" IS DISTINCT FROM NEW."providerAuthorityRevision"
       OR delivery_record."workloadIdentityDigest" IS DISTINCT FROM NEW."workloadIdentityDigest"
       OR delivery_record."providerAttemptKey" IS DISTINCT FROM NEW."providerAttemptKey"
       OR delivery_record."providerAttemptedAt" IS DISTINCT FROM NEW."providerAttemptedAt"
       OR delivery_record."sendGrantDigest" IS DISTINCT FROM NEW."sendGrantDigest"
       OR delivery_record."sendGrantExpiresAt" IS DISTINCT FROM NEW."sendGrantExpiresAt"
    THEN
      RAISE EXCEPTION
        'Attempt does not match the current delivery provider marker'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE'
     AND CURRENT_USER = 'leetplus_evidence_retention'
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'GuestGameDeliveryAttempt evidence is append-only'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL
ON FUNCTION public."guest_game_delivery_attempt_append_only"()
FROM PUBLIC;

CREATE TRIGGER "GuestGameDeliveryAttempt_append_only"
BEFORE INSERT OR UPDATE OR DELETE ON "GuestGameDeliveryAttempt"
FOR EACH ROW
EXECUTE FUNCTION public."guest_game_delivery_attempt_append_only"();

-- Durable events are insert-validated and append-only. UPDATE always fails;
-- DELETE is reserved for the separately operated evidence-retention identity.
CREATE OR REPLACE FUNCTION public."guest_game_delivery_event_append_only"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  delivery_record RECORD;
  attempt_record RECORD;
  is_durable_event BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    is_durable_event := NEW."eventType" IN (
      'DELIVERY_CLAIMED',
      'DELIVERY_PROVIDER_ATTEMPTED',
      'DELIVERY_FINALIZED',
      'DELIVERY_REAPED',
      'DELIVERY_RETRIED',
      'DELIVERY_CANCELED',
      'DELIVERY_RECONCILED',
      'DELIVERY_INTEGRITY_QUARANTINED'
    );

    IF is_durable_event
       AND NEW."transitionKey" IS DISTINCT FROM
      public."guest_game_delivery_transition_key_v1"(
        NEW."tenantId",
        NEW."deliveryId",
        NEW."rewardId",
        NEW."transitionRevision",
        NEW."claimGeneration",
        NEW."eventType",
        NEW."attemptNumber",
        NEW."providerOutcomeClass",
        NEW."providerOutcomeCode",
        NEW."fromStatus",
        NEW."toStatus"
      )
    THEN
      RAISE EXCEPTION
        'Durable delivery event transition key is not canonical'
        USING ERRCODE = '23514';
    END IF;

    SELECT delivery."rewardId", delivery."transitionRevision"
    INTO STRICT delivery_record
    FROM public."GuestGameDelivery" AS delivery
    WHERE delivery."tenantId" = NEW."tenantId"
      AND delivery."id" = NEW."deliveryId";

    IF delivery_record."rewardId" IS DISTINCT FROM NEW."rewardId" THEN
      RAISE EXCEPTION
        'Delivery event reward does not match its delivery'
        USING ERRCODE = '23514';
    END IF;

    IF is_durable_event
       AND delivery_record."transitionRevision"
         IS DISTINCT FROM NEW."transitionRevision"
    THEN
      RAISE EXCEPTION
        'Durable event revision does not match its current delivery transition'
        USING ERRCODE = '23514';
    END IF;

    IF NEW."attemptId" IS NOT NULL THEN
      SELECT
        attempt."deliveryId",
        attempt."rewardId",
        attempt."storeId",
        attempt."channel",
        attempt."claimGeneration",
        attempt."attemptNumber",
        attempt."claimJobKind",
        attempt."executionRevision",
        attempt."storeExecutionRevision",
        attempt."claimKeyVersion",
        attempt."claimOwnerDigest",
        attempt."claimTokenDigest",
        attempt."claimedAt",
        attempt."leaseExpiresAt",
        attempt."acknowledgeUntil",
        attempt."effectInputDigest",
        attempt."providerConfigDigest",
        attempt."providerAuthorityRevision",
        attempt."workloadIdentityDigest",
        attempt."providerAttemptKey",
        attempt."providerAttemptedAt",
        attempt."sendGrantDigest",
        attempt."sendGrantExpiresAt"
      INTO STRICT attempt_record
      FROM public."GuestGameDeliveryAttempt" AS attempt
      WHERE attempt."tenantId" = NEW."tenantId"
        AND attempt."id" = NEW."attemptId";

      IF attempt_record."deliveryId" IS DISTINCT FROM NEW."deliveryId"
         OR attempt_record."rewardId" IS DISTINCT FROM NEW."rewardId"
         OR attempt_record."storeId" IS DISTINCT FROM NEW."storeId"
         OR attempt_record."channel" IS DISTINCT FROM NEW."channel"
         OR attempt_record."claimGeneration" IS DISTINCT FROM NEW."claimGeneration"
         OR attempt_record."attemptNumber" IS DISTINCT FROM NEW."attemptNumber"
         OR attempt_record."claimJobKind" IS DISTINCT FROM NEW."claimJobKind"
         OR attempt_record."executionRevision" IS DISTINCT FROM NEW."executionRevision"
         OR attempt_record."storeExecutionRevision"
           IS DISTINCT FROM NEW."storeExecutionRevision"
         OR attempt_record."claimKeyVersion" IS DISTINCT FROM NEW."claimKeyVersion"
         OR attempt_record."claimOwnerDigest" IS DISTINCT FROM NEW."claimOwnerDigest"
         OR attempt_record."claimTokenDigest" IS DISTINCT FROM NEW."claimTokenDigest"
         OR attempt_record."claimedAt" IS DISTINCT FROM NEW."claimedAt"
         OR attempt_record."leaseExpiresAt" IS DISTINCT FROM NEW."leaseExpiresAt"
         OR attempt_record."acknowledgeUntil"
           IS DISTINCT FROM NEW."acknowledgeUntil"
         OR attempt_record."effectInputDigest" IS DISTINCT FROM NEW."effectInputDigest"
         OR attempt_record."providerConfigDigest"
           IS DISTINCT FROM NEW."providerConfigDigest"
         OR attempt_record."providerAuthorityRevision"
           IS DISTINCT FROM NEW."providerAuthorityRevision"
         OR attempt_record."workloadIdentityDigest"
           IS DISTINCT FROM NEW."workloadIdentityDigest"
         OR attempt_record."providerAttemptKey" IS DISTINCT FROM NEW."providerAttemptKey"
         OR attempt_record."providerAttemptedAt"
           IS DISTINCT FROM NEW."providerAttemptedAt"
         OR attempt_record."sendGrantDigest" IS DISTINCT FROM NEW."sendGrantDigest"
         OR attempt_record."sendGrantExpiresAt"
           IS DISTINCT FROM NEW."sendGrantExpiresAt"
      THEN
        RAISE EXCEPTION
          'Delivery event does not match its immutable attempt'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE'
     AND CURRENT_USER = 'leetplus_evidence_retention'
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'GuestGameDeliveryEvent evidence is append-only'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL
ON FUNCTION public."guest_game_delivery_event_append_only"()
FROM PUBLIC;

CREATE TRIGGER "GuestGameDeliveryEvent_append_only"
BEFORE INSERT OR UPDATE OR DELETE ON "GuestGameDeliveryEvent"
FOR EACH ROW
EXECUTE FUNCTION public."guest_game_delivery_event_append_only"();

-- PostgreSQL grants no table DML to PUBLIC by default, but make the
-- append-only boundary explicit and resilient to broader future grants.
REVOKE UPDATE, DELETE
ON TABLE public."GuestGameDeliveryAttempt"
FROM PUBLIC;

REVOKE UPDATE, DELETE
ON TABLE public."GuestGameDeliveryEvent"
FROM PUBLIC;

COMMIT;
