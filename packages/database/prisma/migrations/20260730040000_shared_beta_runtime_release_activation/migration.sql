BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

-- CURRENT_174 is the first migration allowed to use PENDING. CURRENT_173
-- deliberately committed the enum expansion without adding any transition.
DO $precondition$
DECLARE
  status_labels TEXT[];
BEGIN
  SELECT pg_catalog.array_agg(
    enum_value.enumlabel
    ORDER BY enum_value.enumsortorder
  )
  INTO status_labels
  FROM pg_catalog.pg_enum AS enum_value
  INNER JOIN pg_catalog.pg_type AS enum_type
    ON enum_type.oid = enum_value.enumtypid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = enum_type.typnamespace
  WHERE namespace.nspname = 'public'
    AND enum_type.typname = 'IdentityMailOutboxStatus';

  IF status_labels IS DISTINCT FROM ARRAY['HOLD', 'PENDING']::TEXT[] THEN
    RAISE EXCEPTION
      'IdentityMailOutboxStatus must be exact CURRENT_173 HOLD/PENDING enum'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.to_regclass(
       'public."SharedBetaBuildProvenance"'
     ) IS NOT NULL
     OR pg_catalog.to_regclass(
       'public."SharedBetaRuntimeInstanceAnchor"'
     ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Shared beta runtime release schema already exists'
      USING ERRCODE = '55000';
  END IF;
END;
$precondition$;

LOCK TABLE
  public."Tenant",
  public."Store",
  public."User",
  public."UserRoleOverride",
  public."TenantModuleEntitlement",
  public."IdentityEmailClaim",
  public."IdentityOwnerInviteIssueCommand",
  public."IdentityMailOutbox",
  public."TenantAdmissionDecision",
  public."TenantAdmissionDecisionGate",
  public."ReleaseGateAttestation",
  public."PlatformAdminAuditEvent"
IN ACCESS EXCLUSIVE MODE;

-- PostgreSQL excludes UNLOGGED relation contents from physical base backups
-- and streaming replication. Binding every deployment challenge to this
-- singleton therefore makes a copied/promoted cluster fail closed until an
-- operator creates and signs a fresh challenge on that concrete instance.
CREATE UNLOGGED TABLE public."SharedBetaRuntimeInstanceAnchor" (
  "id" VARCHAR(64) NOT NULL
    DEFAULT 'SHARED_BETA_RUNTIME_INSTANCE',
  "anchorNonce" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SharedBetaRuntimeInstanceAnchor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SharedBetaRuntimeInstanceAnchor_id_check" CHECK (
    "id" = 'SHARED_BETA_RUNTIME_INSTANCE'
  ),
  CONSTRAINT "SharedBetaRuntimeInstanceAnchor_nonce_check" CHECK (
    ("anchorNonce" COLLATE "C") ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE public."SharedBetaBuildProvenance" (
  "id" TEXT NOT NULL,
  "authorityDomain" VARCHAR(32) NOT NULL
    DEFAULT 'SHARED_BETA_BUILD',
  "contractVersion" VARCHAR(64) NOT NULL
    DEFAULT 'SHARED_BETA_BUILD_PROVENANCE_V1',
  "releaseSha" CHAR(40) NOT NULL,
  "buildTime" TEXT NOT NULL,
  "builtAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "artifactContentDigest" CHAR(64) NOT NULL,
  "releaseManifestDigest" CHAR(64) NOT NULL,
  "schemaHead" VARCHAR(128) NOT NULL,
  "migrationCount" INTEGER NOT NULL,
  "migrationManifestDigest" CHAR(64) NOT NULL,
  "policyManifestDigest" CHAR(64) NOT NULL,
  "trialPolicyVersion" VARCHAR(64) NOT NULL,
  "trialDurationSeconds" INTEGER NOT NULL,
  "buildReferenceDigest" CHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadDigest" CHAR(64) NOT NULL,
  "signatureAlgorithm" VARCHAR(16) NOT NULL DEFAULT 'Ed25519',
  "signingKeyId" VARCHAR(64) NOT NULL,
  "publicKeyFingerprint" CHAR(64) NOT NULL,
  "signatureBase64url" TEXT NOT NULL,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "stateRevision" INTEGER NOT NULL DEFAULT 1,
  "revokedAt" TIMESTAMP(3) WITH TIME ZONE,
  "revocationReasonDigest" CHAR(64),
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SharedBetaBuildProvenance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SharedBetaBuildProvenance_id_check" CHECK (
    "id" = pg_catalog.lower(pg_catalog.btrim("id") COLLATE "C")
    AND ("id" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "SharedBetaBuildProvenance_kind_check" CHECK (
    "authorityDomain" = 'SHARED_BETA_BUILD'
    AND "contractVersion" = 'SHARED_BETA_BUILD_PROVENANCE_V1'
  ),
  CONSTRAINT "SharedBetaBuildProvenance_release_check" CHECK (
    ("releaseSha" COLLATE "C") ~ '^[0-9a-f]{40}$'
    AND ("buildTime" COLLATE "C") ~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    AND "buildTime"::TIMESTAMP(3) WITH TIME ZONE = "builtAt"
    AND ("artifactContentDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("releaseManifestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("schemaHead" COLLATE "C") ~
      '^[0-9]{14}_[a-z0-9_]{1,100}$'
    AND "migrationCount" >= 174
    AND ("migrationManifestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("policyManifestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("buildReferenceDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "SharedBetaBuildProvenance_trial_check" CHECK (
    "trialPolicyVersion" = 'SHARED_BETA_TRIAL_V1'
    AND "trialDurationSeconds" BETWEEN 3600 AND 7776000
  ),
  CONSTRAINT "SharedBetaBuildProvenance_signature_check" CHECK (
    pg_catalog.jsonb_typeof("payload") = 'object'
    AND ("payloadDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND "signatureAlgorithm" = 'Ed25519'
    AND "signingKeyId" =
      pg_catalog.lower(pg_catalog.btrim("signingKeyId") COLLATE "C")
    AND ("signingKeyId" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND ("publicKeyFingerprint" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("signatureBase64url" COLLATE "C") ~ '^[A-Za-z0-9_-]{86}$'
  ),
  CONSTRAINT "SharedBetaBuildProvenance_payload_check" CHECK (
    "payload" = pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'kind', 'LEETPLUS_SHARED_BETA_BUILD_PROVENANCE',
      'purpose', 'SHARED_BETA_BUILD_PROVENANCE',
      'profile', 'SHARED_BETA_RUNTIME_RELEASE_PROVENANCE_V1',
      'contract', 'SHARED_BETA_BUILD_PROVENANCE_V1',
      'releaseSha', "releaseSha",
      'buildTime', "buildTime",
      'builtAtEpochMs',
        (EXTRACT(EPOCH FROM "builtAt") * 1000)::BIGINT,
      'artifactContentDigest', "artifactContentDigest",
      'releaseManifestDigest', "releaseManifestDigest",
      'schemaHead', "schemaHead",
      'migrationCount', "migrationCount",
      'migrationManifestDigest', "migrationManifestDigest",
      'policyManifestDigest', "policyManifestDigest",
      'trialPolicyVersion', "trialPolicyVersion",
      'trialDurationSeconds', "trialDurationSeconds",
      'buildReferenceDigest', "buildReferenceDigest",
      'signingKeyId', "signingKeyId",
      'publicKeyFingerprint', "publicKeyFingerprint",
      'validUntilEpochMs',
        (EXTRACT(EPOCH FROM "validUntil") * 1000)::BIGINT
    )
  ),
  CONSTRAINT "SharedBetaBuildProvenance_timeline_check" CHECK (
    "builtAt" <= "createdAt" + INTERVAL '5 minutes'
    AND "validUntil" > "builtAt"
    AND "validUntil" <= "builtAt" + INTERVAL '7 days'
  ),
  CONSTRAINT "SharedBetaBuildProvenance_state_check" CHECK (
    (
      "stateRevision" = 1
      AND "revokedAt" IS NULL
      AND "revocationReasonDigest" IS NULL
    )
    OR (
      "stateRevision" = 2
      AND "revokedAt" IS NOT NULL
      AND "revokedAt" >= "createdAt"
      AND ("revocationReasonDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
  )
);

CREATE UNIQUE INDEX "shared_beta_build_payload_digest_uidx"
  ON public."SharedBetaBuildProvenance" ("payloadDigest");

CREATE INDEX "shared_beta_build_release_valid_idx"
  ON public."SharedBetaBuildProvenance" (
    "releaseSha",
    "validUntil"
  );

CREATE TABLE public."SharedBetaRuntimeReleaseChallenge" (
  "id" TEXT NOT NULL,
  "buildProvenanceId" TEXT NOT NULL,
  "environment" VARCHAR(64) NOT NULL,
  "activationRoleName" VARCHAR(63) NOT NULL,
  "activationRoleOid" BIGINT NOT NULL,
  "installerRoleName" VARCHAR(63) NOT NULL,
  "installerRoleOid" BIGINT NOT NULL,
  "creationNonce" CHAR(64) NOT NULL,
  "databaseIdentityDigest" CHAR(64) NOT NULL,
  "schemaHead" VARCHAR(128) NOT NULL,
  "migrationCount" INTEGER NOT NULL,
  "migrationManifestDigest" CHAR(64) NOT NULL,
  "expectedStateRevision" INTEGER NOT NULL,
  "candidateGeneration" BIGINT NOT NULL,
  "predecessorMarkerId" TEXT,
  "predecessorMarkerDigest" CHAR(64) NOT NULL,
  "challengeDigest" CHAR(64) NOT NULL,
  "actualContextDigest" CHAR(64) NOT NULL,
  "stateRevision" INTEGER NOT NULL DEFAULT 1,
  "consumedAt" TIMESTAMP(3) WITH TIME ZONE,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

  CONSTRAINT "SharedBetaRuntimeReleaseChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SharedBetaRuntimeReleaseChallenge_id_check" CHECK (
    "id" = pg_catalog.lower(pg_catalog.btrim("id") COLLATE "C")
    AND ("id" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseChallenge_environment_check" CHECK (
    "environment" =
      pg_catalog.lower(pg_catalog.btrim("environment") COLLATE "C")
    AND ("environment" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseChallenge_role_check" CHECK (
    ("activationRoleName"::TEXT COLLATE "C") ~
      '^[a-z_][a-z0-9_]{0,62}$'
    AND "activationRoleOid" BETWEEN 1 AND 4294967295
    AND "installerRoleOid" BETWEEN 1 AND 4294967295
    AND "activationRoleName" <> "installerRoleName"
    AND "activationRoleOid" <> "installerRoleOid"
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseChallenge_digest_check" CHECK (
    ("creationNonce" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("databaseIdentityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("schemaHead" COLLATE "C") ~
      '^[0-9]{14}_[a-z0-9_]{1,100}$'
    AND "migrationCount" >= 174
    AND ("migrationManifestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("challengeDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("actualContextDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseChallenge_generation_check" CHECK (
    "expectedStateRevision" >= 0
    AND "candidateGeneration" > 0
    AND (
      (
        "candidateGeneration" = 1
        AND "predecessorMarkerId" IS NULL
        AND ("predecessorMarkerDigest" COLLATE "C") ~
          '^[0-9a-f]{64}$'
      )
      OR (
        "candidateGeneration" > 1
        AND "predecessorMarkerId" IS NOT NULL
        AND ("predecessorMarkerDigest" COLLATE "C") ~
          '^[0-9a-f]{64}$'
      )
    )
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseChallenge_timeline_check" CHECK (
    "validUntil" > "createdAt"
    AND "validUntil" <= "createdAt" + INTERVAL '15 minutes'
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseChallenge_state_check" CHECK (
    (
      "stateRevision" = 1
      AND "consumedAt" IS NULL
    )
    OR (
      "stateRevision" = 2
      AND "consumedAt" IS NOT NULL
      AND "consumedAt" >= "createdAt"
      AND "consumedAt" <= "validUntil"
    )
  )
);

CREATE UNIQUE INDEX "shared_beta_runtime_challenge_digest_uidx"
  ON public."SharedBetaRuntimeReleaseChallenge" ("challengeDigest");

CREATE INDEX "shared_beta_runtime_challenge_expiry_idx"
  ON public."SharedBetaRuntimeReleaseChallenge" (
    "stateRevision",
    "validUntil"
  );

CREATE TABLE public."SharedBetaRuntimeReleaseMarker" (
  "id" TEXT NOT NULL,
  "buildProvenanceId" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "authorityDomain" VARCHAR(32) NOT NULL
    DEFAULT 'SHARED_BETA_DEPLOYMENT',
  "contractVersion" VARCHAR(64) NOT NULL
    DEFAULT 'SHARED_BETA_DEPLOYMENT_PROVENANCE_V1',
  "generation" BIGINT NOT NULL,
  "environment" VARCHAR(64) NOT NULL,
  "buildPayloadDigest" CHAR(64) NOT NULL,
  "deploymentInstanceDigest" CHAR(64) NOT NULL,
  "databaseIdentityDigest" CHAR(64) NOT NULL,
  "databaseChallengeDigest" CHAR(64) NOT NULL,
  "actualContextDigest" CHAR(64) NOT NULL,
  "schemaHead" VARCHAR(128) NOT NULL,
  "migrationCount" INTEGER NOT NULL,
  "migrationManifestDigest" CHAR(64) NOT NULL,
  "activationDatabaseRole" VARCHAR(63) NOT NULL,
  "coordinatorRoleName" VARCHAR(63) NOT NULL,
  "coordinatorRoleOid" BIGINT NOT NULL,
  "predecessorMarkerId" TEXT,
  "predecessorMarkerDigest" CHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadDigest" CHAR(64) NOT NULL,
  "signatureAlgorithm" VARCHAR(16) NOT NULL DEFAULT 'Ed25519',
  "signingKeyId" VARCHAR(64) NOT NULL,
  "publicKeyFingerprint" CHAR(64) NOT NULL,
  "signatureBase64url" TEXT NOT NULL,
  "deployedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "stateRevision" INTEGER NOT NULL DEFAULT 1,
  "revokedAt" TIMESTAMP(3) WITH TIME ZONE,
  "revocationReasonDigest" CHAR(64),
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SharedBetaRuntimeReleaseMarker_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SharedBetaRuntimeReleaseMarker_id_check" CHECK (
    "id" = pg_catalog.lower(pg_catalog.btrim("id") COLLATE "C")
    AND ("id" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseMarker_kind_check" CHECK (
    "authorityDomain" = 'SHARED_BETA_DEPLOYMENT'
    AND "contractVersion" = 'SHARED_BETA_DEPLOYMENT_PROVENANCE_V1'
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseMarker_generation_check" CHECK (
    "generation" > 0
    AND (
      (
        "generation" = 1
        AND "predecessorMarkerId" IS NULL
        AND ("predecessorMarkerDigest" COLLATE "C") ~
          '^[0-9a-f]{64}$'
      )
      OR (
        "generation" > 1
        AND "predecessorMarkerId" IS NOT NULL
        AND ("predecessorMarkerDigest" COLLATE "C") ~
          '^[0-9a-f]{64}$'
      )
    )
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseMarker_context_check" CHECK (
    "environment" =
      pg_catalog.lower(pg_catalog.btrim("environment") COLLATE "C")
    AND ("environment" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{0,63}$'
    AND ("deploymentInstanceDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("buildPayloadDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("databaseIdentityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("databaseChallengeDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("actualContextDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("schemaHead" COLLATE "C") ~
      '^[0-9]{14}_[a-z0-9_]{1,100}$'
    AND "migrationCount" >= 174
    AND ("migrationManifestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND "activationDatabaseRole" = "coordinatorRoleName"
    AND ("activationDatabaseRole"::TEXT COLLATE "C") ~
      '^[a-z_][a-z0-9_]{0,62}$'
    AND ("coordinatorRoleName"::TEXT COLLATE "C") ~
      '^[a-z_][a-z0-9_]{0,62}$'
    AND "coordinatorRoleOid" BETWEEN 1 AND 4294967295
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseMarker_signature_check" CHECK (
    pg_catalog.jsonb_typeof("payload") = 'object'
    AND ("payloadDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND "signatureAlgorithm" = 'Ed25519'
    AND "signingKeyId" =
      pg_catalog.lower(pg_catalog.btrim("signingKeyId") COLLATE "C")
    AND ("signingKeyId" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND ("publicKeyFingerprint" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("signatureBase64url" COLLATE "C") ~ '^[A-Za-z0-9_-]{86}$'
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseMarker_payload_check" CHECK (
    "payload" = pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'kind', 'LEETPLUS_SHARED_BETA_DEPLOYMENT_PROVENANCE',
      'purpose', 'SHARED_BETA_DEPLOYMENT_PROVENANCE',
      'profile', 'SHARED_BETA_RUNTIME_RELEASE_PROVENANCE_V1',
      'contract', 'SHARED_BETA_DEPLOYMENT_PROVENANCE_V1',
      'deploymentMarkerId', "id",
      'buildProvenanceId', "buildProvenanceId",
      'buildPayloadDigest', "buildPayloadDigest",
      'generation', "generation",
      'environment', "environment",
      'deploymentInstanceDigest', "deploymentInstanceDigest",
      'databaseIdentityDigest', "databaseIdentityDigest",
      'databaseChallengeDigest', "databaseChallengeDigest",
      'actualContextDigest', "actualContextDigest",
      'activationDatabaseRole', "activationDatabaseRole"::TEXT,
      'coordinatorRoleName', "coordinatorRoleName"::TEXT,
      'coordinatorRoleOid', "coordinatorRoleOid",
      'predecessorMarkerDigest', "predecessorMarkerDigest",
      'signingKeyId', "signingKeyId",
      'publicKeyFingerprint', "publicKeyFingerprint",
      'deployedAtEpochMs',
        (EXTRACT(EPOCH FROM "deployedAt") * 1000)::BIGINT,
      'validUntilEpochMs',
        (EXTRACT(EPOCH FROM "validUntil") * 1000)::BIGINT
    )
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseMarker_timeline_check" CHECK (
    "deployedAt" <= "createdAt" + INTERVAL '5 minutes'
    AND "validUntil" > "deployedAt"
    AND "validUntil" <= "deployedAt" + INTERVAL '24 hours'
  ),
  CONSTRAINT "SharedBetaRuntimeReleaseMarker_state_check" CHECK (
    (
      "stateRevision" = 1
      AND "revokedAt" IS NULL
      AND "revocationReasonDigest" IS NULL
    )
    OR (
      "stateRevision" = 2
      AND "revokedAt" IS NOT NULL
      AND "revokedAt" >= "createdAt"
      AND ("revocationReasonDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
  )
);

CREATE UNIQUE INDEX "shared_beta_runtime_marker_challenge_uidx"
  ON public."SharedBetaRuntimeReleaseMarker" ("challengeId");

CREATE UNIQUE INDEX "shared_beta_runtime_marker_payload_digest_uidx"
  ON public."SharedBetaRuntimeReleaseMarker" ("payloadDigest");

CREATE UNIQUE INDEX "shared_beta_runtime_marker_generation_uidx"
  ON public."SharedBetaRuntimeReleaseMarker" ("generation");

CREATE UNIQUE INDEX "shared_beta_runtime_one_active_marker_uidx"
  ON public."SharedBetaRuntimeReleaseMarker" ((1))
  WHERE "stateRevision" = 1
    AND "revokedAt" IS NULL;

CREATE TABLE public."SharedBetaRuntimeReleaseState" (
  "id" VARCHAR(64) NOT NULL,
  "currentMarkerId" TEXT,
  "generation" BIGINT NOT NULL DEFAULT 0,
  "stateRevision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SharedBetaRuntimeReleaseState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SharedBetaRuntimeReleaseState_singleton_check" CHECK (
    "id" = 'SHARED_BETA_RUNTIME_RELEASE'
    AND "generation" >= 0
    AND "stateRevision" >= 0
    AND (
      (
        "generation" = 0
        AND "currentMarkerId" IS NULL
      )
      OR (
        "generation" > 0
      )
    )
  )
);

INSERT INTO public."SharedBetaRuntimeReleaseState" (
  "id",
  "currentMarkerId",
  "generation",
  "stateRevision"
)
VALUES (
  'SHARED_BETA_RUNTIME_RELEASE',
  NULL,
  0,
  0
);

CREATE TABLE public."SharedBetaTenantActivationCommand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "action" VARCHAR(64) NOT NULL
    DEFAULT 'ACTIVATE_AND_RELEASE_OWNER_INVITE',
  "requestId" TEXT NOT NULL,
  "requestDigest" CHAR(64) NOT NULL,
  "decisionId" TEXT NOT NULL,
  "markerId" TEXT NOT NULL,
  "markerPayloadDigest" CHAR(64) NOT NULL,
  "markerGeneration" BIGINT NOT NULL,
  "buildProvenanceId" TEXT NOT NULL,
  "actualContextDigest" CHAR(64) NOT NULL,
  "actualShellDigest" CHAR(64) NOT NULL,
  "reservationSubjectId" TEXT NOT NULL,
  "reservationClaimRevision" INTEGER NOT NULL,
  "issueRequestId" TEXT NOT NULL,
  "issueRequestDigest" CHAR(64) NOT NULL,
  "issueCommandId" TEXT NOT NULL,
  "inviteId" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "messageKey" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "secretCiphertextDigest" CHAR(64) NOT NULL,
  "workflowLocator" TEXT NOT NULL,
  "activatedByUserId" TEXT NOT NULL,
  "entitlementProfileRevision" INTEGER NOT NULL,
  "executionRevisionBefore" INTEGER NOT NULL,
  "executionRevisionAfter" INTEGER NOT NULL,
  "trialPolicyVersion" VARCHAR(64) NOT NULL,
  "trialDurationSeconds" INTEGER NOT NULL,
  "trialStartsAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "trialEndsAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "receipt" JSONB NOT NULL,
  "createdTransactionId" TEXT NOT NULL,
  "activatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

  CONSTRAINT "SharedBetaTenantActivationCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SharedBetaTenantActivationCommand_id_check" CHECK (
    "id" = pg_catalog.lower(pg_catalog.btrim("id") COLLATE "C")
    AND ("id" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "SharedBetaTenantActivationCommand_action_check" CHECK (
    "action" = 'ACTIVATE_AND_RELEASE_OWNER_INVITE'
  ),
  CONSTRAINT "SharedBetaTenantActivationCommand_request_check" CHECK (
    "requestId" =
      pg_catalog.lower(pg_catalog.btrim("requestId") COLLATE "C")
    AND ("requestId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND ("requestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "SharedBetaTenantActivationCommand_digest_check" CHECK (
    ("markerPayloadDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("actualContextDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("actualShellDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("issueRequestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("tokenHash" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("secretCiphertextDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND "markerGeneration" > 0
  ),
  CONSTRAINT "SharedBetaTenantActivationCommand_identity_check" CHECK (
    "reservationSubjectId" =
      pg_catalog.lower(pg_catalog.btrim("reservationSubjectId") COLLATE "C")
    AND ("reservationSubjectId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "reservationClaimRevision" >= 1
    AND "issueRequestId" =
      pg_catalog.lower(pg_catalog.btrim("issueRequestId") COLLATE "C")
    AND ("issueRequestId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "messageKey" =
      pg_catalog.lower(pg_catalog.btrim("messageKey") COLLATE "C")
    AND ("messageKey" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "SharedBetaTenantActivationCommand_revision_check" CHECK (
    "entitlementProfileRevision" > 0
    AND "executionRevisionBefore" >= 0
    AND "executionRevisionAfter" = "executionRevisionBefore" + 1
  ),
  CONSTRAINT "SharedBetaTenantActivationCommand_trial_check" CHECK (
    "trialPolicyVersion" = 'SHARED_BETA_TRIAL_V1'
    AND "trialDurationSeconds" BETWEEN 3600 AND 7776000
    AND "trialStartsAt" = "activatedAt"
    AND "trialEndsAt" =
      "trialStartsAt" +
        ("trialDurationSeconds" * INTERVAL '1 second')
  ),
  CONSTRAINT "SharedBetaTenantActivationCommand_receipt_check" CHECK (
    "receipt" = pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'ACTIVATE_AND_RELEASE_OWNER_INVITE',
      'decision', 'ACTIVATED',
      'tenantId', "tenantId",
      'activationCommandId', "id",
      'admissionDecisionId', "decisionId",
      'markerId', "markerId",
      'markerGeneration', "markerGeneration",
      'tenantStatus', 'ACTIVE',
      'onboardingStatus', 'OWNER_INVITED',
      'executionRevision', "executionRevisionAfter",
      'trialStartsAtEpochMs',
        (EXTRACT(EPOCH FROM "trialStartsAt") * 1000)::BIGINT,
      'trialEndsAtEpochMs',
        (EXTRACT(EPOCH FROM "trialEndsAt") * 1000)::BIGINT,
      'inviteId', "inviteId",
      'outboxId', "outboxId",
      'outboxStatus', 'PENDING',
      'createdTransactionId', "createdTransactionId"
    )
  ),
  CONSTRAINT "SharedBetaTenantActivationCommand_transaction_check" CHECK (
    ("createdTransactionId" COLLATE "C") ~ '^[0-9]+$'
  ),
  CONSTRAINT "SharedBetaTenantActivationCommand_ids_distinct_check" CHECK (
    "id" <> "reservationSubjectId"
    AND "id" <> "issueCommandId"
    AND "id" <> "inviteId"
    AND "id" <> "outboxId"
    AND "issueCommandId" <> "inviteId"
    AND "issueCommandId" <> "outboxId"
    AND "inviteId" <> "outboxId"
  )
);

CREATE UNIQUE INDEX "shared_beta_activation_request_uidx"
  ON public."SharedBetaTenantActivationCommand" (
    "tenantId",
    "action",
    "requestId"
  );

CREATE UNIQUE INDEX "shared_beta_activation_tenant_uidx"
  ON public."SharedBetaTenantActivationCommand" ("tenantId");

CREATE UNIQUE INDEX "shared_beta_activation_decision_uidx"
  ON public."SharedBetaTenantActivationCommand" ("decisionId");

CREATE UNIQUE INDEX "shared_beta_activation_decision_tenant_uidx"
  ON public."SharedBetaTenantActivationCommand" (
    "decisionId",
    "tenantId"
  );

CREATE UNIQUE INDEX "shared_beta_activation_issue_uidx"
  ON public."SharedBetaTenantActivationCommand" ("issueCommandId");

CREATE UNIQUE INDEX "shared_beta_activation_tenant_issue_uidx"
  ON public."SharedBetaTenantActivationCommand" (
    "tenantId",
    "issueCommandId"
  );

CREATE UNIQUE INDEX "shared_beta_activation_invite_uidx"
  ON public."SharedBetaTenantActivationCommand" ("inviteId");

CREATE UNIQUE INDEX "shared_beta_activation_tenant_invite_uidx"
  ON public."SharedBetaTenantActivationCommand" (
    "tenantId",
    "inviteId"
  );

CREATE UNIQUE INDEX "shared_beta_activation_outbox_uidx"
  ON public."SharedBetaTenantActivationCommand" ("outboxId");

CREATE UNIQUE INDEX "shared_beta_activation_tenant_outbox_uidx"
  ON public."SharedBetaTenantActivationCommand" (
    "tenantId",
    "outboxId"
  );

CREATE UNIQUE INDEX "shared_beta_activation_locator_uidx"
  ON public."SharedBetaTenantActivationCommand" ("workflowLocator");

ALTER TABLE public."SharedBetaRuntimeReleaseChallenge"
  ADD CONSTRAINT "SharedBetaRuntimeReleaseChallenge_build_fkey"
  FOREIGN KEY ("buildProvenanceId")
  REFERENCES public."SharedBetaBuildProvenance" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."SharedBetaRuntimeReleaseMarker"
  ADD CONSTRAINT "SharedBetaRuntimeReleaseMarker_build_fkey"
  FOREIGN KEY ("buildProvenanceId")
  REFERENCES public."SharedBetaBuildProvenance" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "SharedBetaRuntimeReleaseMarker_challenge_fkey"
  FOREIGN KEY ("challengeId")
  REFERENCES public."SharedBetaRuntimeReleaseChallenge" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "SharedBetaRuntimeReleaseMarker_predecessor_fkey"
  FOREIGN KEY ("predecessorMarkerId")
  REFERENCES public."SharedBetaRuntimeReleaseMarker" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."SharedBetaRuntimeReleaseState"
  ADD CONSTRAINT "SharedBetaRuntimeReleaseState_marker_fkey"
  FOREIGN KEY ("currentMarkerId")
  REFERENCES public."SharedBetaRuntimeReleaseMarker" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."SharedBetaTenantActivationCommand"
  ADD CONSTRAINT "SharedBetaTenantActivationCommand_tenant_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES public."Tenant" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "SharedBetaTenantActivationCommand_decision_fkey"
  FOREIGN KEY ("decisionId", "tenantId")
  REFERENCES public."TenantAdmissionDecision" ("id", "tenantId")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "SharedBetaTenantActivationCommand_marker_fkey"
  FOREIGN KEY ("markerId")
  REFERENCES public."SharedBetaRuntimeReleaseMarker" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "SharedBetaTenantActivationCommand_build_fkey"
  FOREIGN KEY ("buildProvenanceId")
  REFERENCES public."SharedBetaBuildProvenance" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "SharedBetaTenantActivationCommand_issue_fkey"
  FOREIGN KEY ("tenantId", "issueCommandId")
  REFERENCES public."IdentityOwnerInviteIssueCommand" ("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "SharedBetaTenantActivationCommand_invite_fkey"
  FOREIGN KEY ("tenantId", "inviteId")
  REFERENCES public."UserInvite" ("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "SharedBetaTenantActivationCommand_outbox_fkey"
  FOREIGN KEY ("tenantId", "outboxId")
  REFERENCES public."IdentityMailOutbox" ("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "SharedBetaTenantActivationCommand_actor_fkey"
  FOREIGN KEY ("activatedByUserId")
  REFERENCES public."User" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."IdentityMailOutbox"
  ADD COLUMN "releasedAt" TIMESTAMP(3) WITH TIME ZONE;

ALTER TABLE public."IdentityMailOutbox"
  DROP CONSTRAINT "IdentityMailOutbox_crypto_check",
  ADD CONSTRAINT "IdentityMailOutbox_crypto_check" CHECK (
    "tokenDigestVersion" = 'sha256-v1'
    AND "template" =
      'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate"
    AND "envelopeVersion" = 1
    AND "keyVersion" = 'v1'
    AND pg_catalog.octet_length("secretCiphertext") = 71
    AND (
      (
        "status" = 'HOLD'::public."IdentityMailOutboxStatus"
        AND "releasedAt" IS NULL
      )
      OR (
        "status" = 'PENDING'::public."IdentityMailOutboxStatus"
        AND "releasedAt" IS NOT NULL
        AND "releasedAt" >= "createdAt"
        AND "releasedAt" < "expiresAt"
      )
    )
  );

ALTER TABLE public."TenantAdmissionDecision"
  DROP CONSTRAINT "TenantAdmissionDecision_state_check",
  ADD CONSTRAINT "TenantAdmissionDecision_state_check" CHECK (
    (
      "stateRevision" = 1
      AND "revokedAt" IS NULL
      AND "revocationReasonDigest" IS NULL
      AND "consumedAt" IS NULL
    )
    OR (
      "stateRevision" = 2
      AND "revokedAt" IS NOT NULL
      AND "revokedAt" >= "createdAt"
      AND ("revocationReasonDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND "consumedAt" IS NULL
    )
    OR (
      "stateRevision" = 2
      AND "revokedAt" IS NULL
      AND "revocationReasonDigest" IS NULL
      AND "consumedAt" IS NOT NULL
      AND "consumedAt" >= "createdAt"
      AND "consumedAt" >= "approvedAt"
      AND "consumedAt" < "validUntil"
    )
  );

DROP INDEX public."tenant_admission_decision_one_unrevoked_uidx";

CREATE UNIQUE INDEX "tenant_admission_decision_one_available_uidx"
  ON public."TenantAdmissionDecision" ("tenantId")
  WHERE "revokedAt" IS NULL
    AND "consumedAt" IS NULL;

COMMENT ON TABLE public."SharedBetaBuildProvenance" IS
  'Sealed CI build-root provenance. trialDurationSeconds is mandatory signed policy and has no default.';

COMMENT ON TABLE public."SharedBetaRuntimeReleaseChallenge" IS
  'One-shot database-generated deployment challenge bound to actual database identity, exact migrations, installer session and activation role OID.';

COMMENT ON TABLE public."SharedBetaRuntimeReleaseMarker" IS
  'Sealed deployment-root marker for one exact build, database, environment, generation and dedicated activation session role.';

COMMENT ON TABLE public."SharedBetaRuntimeReleaseState" IS
  'Singleton CAS pointer to the only current shared-beta runtime release marker.';

COMMENT ON TABLE public."SharedBetaTenantActivationCommand" IS
  'Immutable PII-free receipt binding one tenant activation, consumed admission GO, initial OWNER issue and exact HOLD-to-PENDING release.';

CREATE FUNCTION public."shared_beta_build_provenance_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Shared beta build provenance is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
     OR OLD."authorityDomain" IS DISTINCT FROM NEW."authorityDomain"
     OR OLD."contractVersion" IS DISTINCT FROM NEW."contractVersion"
     OR OLD."releaseSha" IS DISTINCT FROM NEW."releaseSha"
     OR OLD."buildTime" IS DISTINCT FROM NEW."buildTime"
     OR OLD."builtAt" IS DISTINCT FROM NEW."builtAt"
     OR OLD."artifactContentDigest" IS DISTINCT FROM
       NEW."artifactContentDigest"
     OR OLD."releaseManifestDigest" IS DISTINCT FROM
       NEW."releaseManifestDigest"
     OR OLD."schemaHead" IS DISTINCT FROM NEW."schemaHead"
     OR OLD."migrationCount" IS DISTINCT FROM NEW."migrationCount"
     OR OLD."migrationManifestDigest" IS DISTINCT FROM
       NEW."migrationManifestDigest"
     OR OLD."policyManifestDigest" IS DISTINCT FROM
       NEW."policyManifestDigest"
     OR OLD."trialPolicyVersion" IS DISTINCT FROM
       NEW."trialPolicyVersion"
     OR OLD."trialDurationSeconds" IS DISTINCT FROM
       NEW."trialDurationSeconds"
     OR OLD."buildReferenceDigest" IS DISTINCT FROM
       NEW."buildReferenceDigest"
     OR OLD."payload" IS DISTINCT FROM NEW."payload"
     OR OLD."payloadDigest" IS DISTINCT FROM NEW."payloadDigest"
     OR OLD."signatureAlgorithm" IS DISTINCT FROM
       NEW."signatureAlgorithm"
     OR OLD."signingKeyId" IS DISTINCT FROM NEW."signingKeyId"
     OR OLD."publicKeyFingerprint" IS DISTINCT FROM
       NEW."publicKeyFingerprint"
     OR OLD."signatureBase64url" IS DISTINCT FROM
       NEW."signatureBase64url"
     OR OLD."validUntil" IS DISTINCT FROM NEW."validUntil"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
     OR OLD."stateRevision" <> 1
     OR OLD."revokedAt" IS NOT NULL
     OR OLD."revocationReasonDigest" IS NOT NULL
     OR NEW."stateRevision" <> 2
     OR NEW."revokedAt" IS NULL
     OR NEW."revocationReasonDigest" IS NULL
  THEN
    RAISE EXCEPTION 'Shared beta build provenance payload is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

-- A deployment marker may bind only a dedicated LOGIN role with no ambient
-- application authority. The one coordinator function is the sole permitted
-- exception after a reviewed post-marker enrollment ceremony.
CREATE FUNCTION public."shared_beta_runtime_activation_role_assert_v1"(
  expected_role_name TEXT,
  expected_role_oid BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  role_record pg_catalog.pg_roles%ROWTYPE;
  unsafe_privilege_count INTEGER;
  unsafe_role_dependency_count INTEGER;
  unsafe_allowed_acl_count INTEGER;
  unsafe_coordinator_acl_count INTEGER;
  coordinator_activation_acl_count INTEGER;
  coordinator_function_count INTEGER;
  unsafe_role_setting_count INTEGER;
  unsafe_ambient_boundary_count INTEGER;
BEGIN
  IF expected_role_name IS NULL
     OR expected_role_name !~ '^[a-z_][a-z0-9_]{0,62}$'
     OR expected_role_oid NOT BETWEEN 1 AND 4294967295
  THEN
    RAISE EXCEPTION 'Shared beta activation role identity is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT role.*
  INTO role_record
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = expected_role_name
    AND role.oid = expected_role_oid::OID;

  IF NOT FOUND
     OR role_record.rolcanlogin IS DISTINCT FROM TRUE
     OR role_record.rolinherit IS DISTINCT FROM FALSE
     OR role_record.rolsuper IS DISTINCT FROM FALSE
     OR role_record.rolcreatedb IS DISTINCT FROM FALSE
     OR role_record.rolcreaterole IS DISTINCT FROM FALSE
     OR role_record.rolreplication IS DISTINCT FROM FALSE
     OR role_record.rolbypassrls IS DISTINCT FROM FALSE
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_auth_members AS membership
       WHERE membership.roleid = expected_role_oid::OID
          OR membership.member = expected_role_oid::OID
     )
  THEN
    RAISE EXCEPTION 'Shared beta activation role is not dedicated'
      USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)
  INTO unsafe_privilege_count
  FROM (
    SELECT relation.oid
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname NOT LIKE 'pg_toast%'
      AND namespace.nspname NOT LIKE 'pg_temp_%'
      AND namespace.nspname NOT LIKE 'pg_toast_temp_%'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (
        relation.relowner = expected_role_oid::OID
        OR pg_catalog.has_table_privilege(
          expected_role_oid::OID,
          relation.oid,
          'SELECT'
        )
        OR pg_catalog.has_table_privilege(
          expected_role_oid::OID,
          relation.oid,
          'INSERT'
        )
        OR pg_catalog.has_table_privilege(
          expected_role_oid::OID,
          relation.oid,
          'UPDATE'
        )
        OR pg_catalog.has_table_privilege(
          expected_role_oid::OID,
          relation.oid,
          'DELETE'
        )
        OR pg_catalog.has_table_privilege(
          expected_role_oid::OID,
          relation.oid,
          'TRUNCATE'
        )
        OR pg_catalog.has_table_privilege(
          expected_role_oid::OID,
          relation.oid,
          'REFERENCES'
        )
        OR pg_catalog.has_table_privilege(
          expected_role_oid::OID,
          relation.oid,
          'TRIGGER'
        )
      )

    UNION ALL

    SELECT sequence.oid
    FROM pg_catalog.pg_class AS sequence
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = sequence.relnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname NOT LIKE 'pg_toast%'
      AND namespace.nspname NOT LIKE 'pg_temp_%'
      AND namespace.nspname NOT LIKE 'pg_toast_temp_%'
      AND sequence.relkind = 'S'
      AND (
        sequence.relowner = expected_role_oid::OID
        OR pg_catalog.has_sequence_privilege(
          expected_role_oid::OID,
          sequence.oid,
          'USAGE'
        )
        OR pg_catalog.has_sequence_privilege(
          expected_role_oid::OID,
          sequence.oid,
          'SELECT'
        )
        OR pg_catalog.has_sequence_privilege(
          expected_role_oid::OID,
          sequence.oid,
          'UPDATE'
        )
      )

    UNION ALL

    SELECT attribute.attrelid
    FROM pg_catalog.pg_attribute AS attribute
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname NOT LIKE 'pg_toast%'
      AND namespace.nspname NOT LIKE 'pg_temp_%'
      AND namespace.nspname NOT LIKE 'pg_toast_temp_%'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND (
        pg_catalog.has_column_privilege(
          expected_role_oid::OID,
          relation.oid,
          attribute.attnum,
          'SELECT'
        )
        OR pg_catalog.has_column_privilege(
          expected_role_oid::OID,
          relation.oid,
          attribute.attnum,
          'INSERT'
        )
        OR pg_catalog.has_column_privilege(
          expected_role_oid::OID,
          relation.oid,
          attribute.attnum,
          'UPDATE'
        )
        OR pg_catalog.has_column_privilege(
          expected_role_oid::OID,
          relation.oid,
          attribute.attnum,
          'REFERENCES'
        )
      )

    UNION ALL

    SELECT namespace.oid
    FROM pg_catalog.pg_namespace AS namespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname NOT LIKE 'pg_toast%'
      AND namespace.nspname NOT LIKE 'pg_temp_%'
      AND namespace.nspname NOT LIKE 'pg_toast_temp_%'
      AND (
        namespace.nspowner = expected_role_oid::OID
        OR pg_catalog.has_schema_privilege(
          expected_role_oid::OID,
          namespace.oid,
          'CREATE'
        )
      )

    UNION ALL

    -- PostgreSQL grants PUBLIC USAGE on newly created enum/domain types by
    -- default. Do not mutate that application-wide policy here: fail closed
    -- until the activation database has completed its explicit type-ACL
    -- ceremony. SECURITY DEFINER coordinators do not require their caller to
    -- retain direct or PUBLIC-derived authority on application types.
    SELECT type_object.oid
    FROM pg_catalog.pg_type AS type_object
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = type_object.typnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname NOT LIKE 'pg_toast%'
      AND namespace.nspname NOT LIKE 'pg_temp_%'
      AND namespace.nspname NOT LIKE 'pg_toast_temp_%'
      AND type_object.typisdefined
      AND type_object.typtype IN ('d', 'e')
      AND pg_catalog.has_type_privilege(
        expected_role_oid::OID,
        type_object.oid,
        'USAGE'
      )

    UNION ALL

    SELECT procedure.oid
    FROM pg_catalog.pg_proc AS procedure
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname NOT LIKE 'pg_toast%'
      AND namespace.nspname NOT LIKE 'pg_temp_%'
      AND namespace.nspname NOT LIKE 'pg_toast_temp_%'
      AND (
        procedure.proowner = expected_role_oid::OID
        OR (
          procedure.oid IS DISTINCT FROM pg_catalog.to_regprocedure(
            'public."shared_beta_tenant_activate_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)'
          )
          AND pg_catalog.has_function_privilege(
            expected_role_oid::OID,
            procedure.oid,
            'EXECUTE'
          )
        )
      )
  ) AS unsafe_privilege;

  IF unsafe_privilege_count <> 0 THEN
    RAISE EXCEPTION
      'Shared beta activation role has pre-existing application authority'
      USING ERRCODE = '42501';
  END IF;

  -- Effective privilege checks above deliberately ignore pg_catalog and
  -- information_schema because PostgreSQL grants harmless read/execute
  -- baselines there through PUBLIC. pg_shdepend gives us the complementary
  -- direct role dependency inventory across the whole cluster. Permit only
  -- the exact coordinator EXECUTE plus the optional minimum CONNECT/USAGE
  -- grants needed when an installation has revoked those PUBLIC baselines.
  SELECT pg_catalog.count(*)
  INTO unsafe_role_dependency_count
  FROM pg_catalog.pg_shdepend AS dependency
  WHERE dependency.refclassid =
      'pg_catalog.pg_authid'::pg_catalog.regclass
    AND dependency.refobjid = expected_role_oid::OID
    AND NOT (
      dependency.deptype = 'a'
      AND dependency.objsubid = 0
      AND (
        (
          dependency.dbid = (
            SELECT database_record.oid
            FROM pg_catalog.pg_database AS database_record
            WHERE database_record.datname =
              pg_catalog.current_database()
          )
          AND dependency.classid =
            'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency.objid = pg_catalog.to_regprocedure(
            'public."shared_beta_tenant_activate_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)'
          )
        )
        OR (
          dependency.dbid = (
            SELECT database_record.oid
            FROM pg_catalog.pg_database AS database_record
            WHERE database_record.datname =
              pg_catalog.current_database()
          )
          AND dependency.classid =
            'pg_catalog.pg_namespace'::pg_catalog.regclass
          AND dependency.objid =
            'public'::pg_catalog.regnamespace
        )
        OR (
          dependency.dbid = 0
          AND dependency.classid =
            'pg_catalog.pg_database'::pg_catalog.regclass
          AND dependency.objid = (
            SELECT database_record.oid
            FROM pg_catalog.pg_database AS database_record
            WHERE database_record.datname =
              pg_catalog.current_database()
          )
        )
      )
    );

  -- Validate the privilege bits behind the three dependency exceptions.
  -- WITH GRANT OPTION and every wider privilege remain forbidden.
  SELECT pg_catalog.count(*)
  INTO unsafe_allowed_acl_count
  FROM (
    SELECT procedure.oid
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(procedure.proacl)
      AS privilege
    WHERE procedure.oid = pg_catalog.to_regprocedure(
        'public."shared_beta_tenant_activate_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)'
      )
      AND privilege.grantee = expected_role_oid::OID
      AND (
        privilege.privilege_type <> 'EXECUTE'
        OR privilege.is_grantable
      )

    UNION ALL

    SELECT namespace.oid
    FROM pg_catalog.pg_namespace AS namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(namespace.nspacl)
      AS privilege
    WHERE namespace.oid = 'public'::pg_catalog.regnamespace
      AND privilege.grantee = expected_role_oid::OID
      AND (
        privilege.privilege_type <> 'USAGE'
        OR privilege.is_grantable
      )

    UNION ALL

    SELECT database_record.oid
    FROM pg_catalog.pg_database AS database_record
    CROSS JOIN LATERAL pg_catalog.aclexplode(database_record.datacl)
      AS privilege
    WHERE database_record.datname = pg_catalog.current_database()
      AND privilege.grantee = expected_role_oid::OID
      AND (
        privilege.privilege_type <> 'CONNECT'
        OR privilege.is_grantable
      )
  ) AS unsafe_allowed_acl;

  -- The coordinator is the sole callable activation surface. Its ACL is
  -- therefore global state, not merely a property of expected_role_oid:
  -- owner plus an optional exact activation-role EXECUTE are the only
  -- accepted entries. This rejects PUBLIC and second-role grants even though
  -- the marker's session_user/OID binding would reject their fresh calls.
  SELECT
    pg_catalog.count(*) FILTER (
      WHERE privilege.grantee NOT IN (
          procedure.proowner,
          expected_role_oid::OID
        )
         OR privilege.privilege_type <> 'EXECUTE'
         OR (
           privilege.grantee = expected_role_oid::OID
           AND (
             privilege.is_grantable
             OR privilege.grantor <> procedure.proowner
           )
         )
    ),
    pg_catalog.count(*) FILTER (
      WHERE privilege.grantee = expected_role_oid::OID
        AND privilege.privilege_type = 'EXECUTE'
        AND NOT privilege.is_grantable
        AND privilege.grantor = procedure.proowner
    ),
    pg_catalog.count(DISTINCT procedure.oid)
  INTO
    unsafe_coordinator_acl_count,
    coordinator_activation_acl_count,
    coordinator_function_count
  FROM pg_catalog.pg_proc AS procedure
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      procedure.proacl,
      pg_catalog.acldefault('f', procedure.proowner)
    )
  ) AS privilege
  WHERE procedure.oid = pg_catalog.to_regprocedure(
    'public."shared_beta_tenant_activate_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)'
  );

  SELECT pg_catalog.count(*)
  INTO unsafe_role_setting_count
  FROM pg_catalog.pg_db_role_setting AS role_setting
  WHERE role_setting.setrole = expected_role_oid::OID;

  -- Materialize the hostile privilege matrix already used by the exact
  -- admission inventory. Direct dependencies are necessary but insufficient:
  -- dangerous PUBLIC ACL deltas, cross-database CONNECT, TEMP, FDW/server,
  -- parameter, tablespace and large-object authority do not depend on this
  -- role and must be evaluated as effective privileges.
  SELECT pg_catalog.count(*)
  INTO unsafe_ambient_boundary_count
  FROM (
    SELECT 'current_database'::TEXT AS boundary
    WHERE NOT pg_catalog.has_database_privilege(
        expected_role_oid::OID,
        pg_catalog.current_database(),
        'CONNECT'
      )
       OR pg_catalog.has_database_privilege(
         expected_role_oid::OID,
         pg_catalog.current_database(),
         'CONNECT WITH GRANT OPTION'
       )
       OR pg_catalog.has_database_privilege(
         expected_role_oid::OID,
         pg_catalog.current_database(),
         'CREATE'
       )
       OR pg_catalog.has_database_privilege(
         expected_role_oid::OID,
         pg_catalog.current_database(),
         'TEMP'
       )

    UNION ALL

    SELECT 'other_database'
    FROM pg_catalog.pg_database AS database_record
    WHERE database_record.datname <> pg_catalog.current_database()
      AND database_record.datallowconn
      AND pg_catalog.has_database_privilege(
        expected_role_oid::OID,
        database_record.oid,
        'CONNECT'
      )

    UNION ALL

    SELECT 'public_schema'
    WHERE NOT pg_catalog.has_schema_privilege(
        expected_role_oid::OID,
        'public',
        'USAGE'
      )
       OR pg_catalog.has_schema_privilege(
         expected_role_oid::OID,
         'public',
         'USAGE WITH GRANT OPTION'
       )
       OR pg_catalog.has_schema_privilege(
         expected_role_oid::OID,
         'public',
         'CREATE'
       )

    UNION ALL

    SELECT 'user_schema'
    FROM pg_catalog.pg_namespace AS namespace
    WHERE namespace.nspname <> 'public'
      AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname NOT LIKE 'pg_toast%'
      AND namespace.nspname NOT LIKE 'pg_temp_%'
      AND namespace.nspname NOT LIKE 'pg_toast_temp_%'
      AND (
        pg_catalog.has_schema_privilege(
          expected_role_oid::OID,
          namespace.oid,
          'USAGE'
        )
        OR pg_catalog.has_schema_privilege(
          expected_role_oid::OID,
          namespace.oid,
          'CREATE'
        )
      )

    UNION ALL

    SELECT 'system_schema_create'
    FROM pg_catalog.pg_namespace AS namespace
    WHERE (
        namespace.nspname IN ('pg_catalog', 'information_schema')
        OR namespace.nspname LIKE 'pg_toast%'
        OR namespace.nspname LIKE 'pg_temp_%'
        OR namespace.nspname LIKE 'pg_toast_temp_%'
      )
      AND pg_catalog.has_schema_privilege(
        expected_role_oid::OID,
        namespace.oid,
        'CREATE'
      )

    UNION ALL

    SELECT 'system_schema_acl'
    FROM pg_catalog.pg_namespace AS namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(namespace.nspacl)
      AS privilege
    WHERE (
        namespace.nspname IN ('pg_catalog', 'information_schema')
        OR namespace.nspname LIKE 'pg_toast%'
        OR namespace.nspname LIKE 'pg_temp_%'
        OR namespace.nspname LIKE 'pg_toast_temp_%'
      )
      AND (
        privilege.grantee = expected_role_oid::OID
        OR (
          privilege.grantee = 0
          AND (
            (
              namespace.nspname = 'pg_catalog'
              AND NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_init_privs AS initial
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                  initial.initprivs
                ) AS initial_privilege
                WHERE initial.classoid =
                    'pg_catalog.pg_namespace'::pg_catalog.regclass
                  AND initial.objoid = namespace.oid
                  AND initial.objsubid = 0
                  AND initial_privilege.grantee = privilege.grantee
                  AND initial_privilege.grantor = privilege.grantor
                  AND initial_privilege.privilege_type =
                    privilege.privilege_type
                  AND initial_privilege.is_grantable =
                    privilege.is_grantable
              )
            )
            OR (
              namespace.nspname = 'information_schema'
              AND (
                namespace.oid >= 16384
                OR privilege.privilege_type <> 'USAGE'
                OR privilege.is_grantable
              )
            )
            OR namespace.nspname NOT IN (
              'pg_catalog',
              'information_schema'
            )
          )
        )
      )

    UNION ALL

    SELECT 'system_relation_acl'
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl)
      AS privilege
    WHERE (
        namespace.nspname IN ('pg_catalog', 'information_schema')
        OR namespace.nspname LIKE 'pg_toast%'
        OR namespace.nspname LIKE 'pg_temp_%'
        OR namespace.nspname LIKE 'pg_toast_temp_%'
      )
      AND (
        privilege.grantee = expected_role_oid::OID
        OR (
          privilege.grantee = 0
          AND (
            (
              namespace.nspname = 'pg_catalog'
              AND NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_init_privs AS initial
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                  initial.initprivs
                ) AS initial_privilege
                WHERE initial.classoid =
                    'pg_catalog.pg_class'::pg_catalog.regclass
                  AND initial.objoid = relation.oid
                  AND initial.objsubid = 0
                  AND initial_privilege.grantee = privilege.grantee
                  AND initial_privilege.grantor = privilege.grantor
                  AND initial_privilege.privilege_type =
                    privilege.privilege_type
                  AND initial_privilege.is_grantable =
                    privilege.is_grantable
              )
            )
            OR (
              namespace.nspname = 'information_schema'
              AND (
                relation.oid >= 16384
                OR privilege.privilege_type <> 'SELECT'
                OR privilege.is_grantable
              )
            )
            OR namespace.nspname NOT IN (
              'pg_catalog',
              'information_schema'
            )
          )
        )
      )

    UNION ALL

    SELECT 'system_nonbootstrap_relation'
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE relation.oid >= 16384
      AND (
        namespace.nspname IN ('pg_catalog', 'information_schema')
        OR namespace.nspname LIKE 'pg_toast%'
        OR namespace.nspname LIKE 'pg_temp_%'
        OR namespace.nspname LIKE 'pg_toast_temp_%'
      )
      AND (
        relation.relowner = expected_role_oid::OID
        OR (
          relation.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND (
            pg_catalog.has_table_privilege(
              expected_role_oid::OID,
              relation.oid,
              'SELECT'
            )
            OR pg_catalog.has_table_privilege(
              expected_role_oid::OID,
              relation.oid,
              'INSERT'
            )
            OR pg_catalog.has_table_privilege(
              expected_role_oid::OID,
              relation.oid,
              'UPDATE'
            )
            OR pg_catalog.has_table_privilege(
              expected_role_oid::OID,
              relation.oid,
              'DELETE'
            )
            OR pg_catalog.has_table_privilege(
              expected_role_oid::OID,
              relation.oid,
              'TRUNCATE'
            )
            OR pg_catalog.has_table_privilege(
              expected_role_oid::OID,
              relation.oid,
              'REFERENCES'
            )
            OR pg_catalog.has_table_privilege(
              expected_role_oid::OID,
              relation.oid,
              'TRIGGER'
            )
          )
        )
        OR (
          relation.relkind = 'S'
          AND (
            pg_catalog.has_sequence_privilege(
              expected_role_oid::OID,
              relation.oid,
              'USAGE'
            )
            OR pg_catalog.has_sequence_privilege(
              expected_role_oid::OID,
              relation.oid,
              'SELECT'
            )
            OR pg_catalog.has_sequence_privilege(
              expected_role_oid::OID,
              relation.oid,
              'UPDATE'
            )
          )
        )
      )

    UNION ALL

    SELECT 'system_column_acl'
    FROM pg_catalog.pg_attribute AS attribute
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl)
      AS privilege
    WHERE attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND (
        namespace.nspname IN ('pg_catalog', 'information_schema')
        OR namespace.nspname LIKE 'pg_toast%'
        OR namespace.nspname LIKE 'pg_temp_%'
        OR namespace.nspname LIKE 'pg_toast_temp_%'
      )
      AND (
        privilege.grantee = expected_role_oid::OID
        OR (
          privilege.grantee = 0
          AND (
            (
              namespace.nspname = 'pg_catalog'
              AND NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_init_privs AS initial
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                  initial.initprivs
                ) AS initial_privilege
                WHERE initial.classoid =
                    'pg_catalog.pg_class'::pg_catalog.regclass
                  AND initial.objoid = relation.oid
                  AND initial.objsubid = attribute.attnum
                  AND initial_privilege.grantee = privilege.grantee
                  AND initial_privilege.grantor = privilege.grantor
                  AND initial_privilege.privilege_type =
                    privilege.privilege_type
                  AND initial_privilege.is_grantable =
                    privilege.is_grantable
              )
            )
            OR (
              namespace.nspname = 'information_schema'
              AND (
                relation.oid >= 16384
                OR privilege.privilege_type <> 'SELECT'
                OR privilege.is_grantable
              )
            )
            OR namespace.nspname NOT IN (
              'pg_catalog',
              'information_schema'
            )
          )
        )
      )

    UNION ALL

    SELECT 'system_nonbootstrap_column'
    FROM pg_catalog.pg_attribute AS attribute
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE relation.oid >= 16384
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (
        namespace.nspname IN ('pg_catalog', 'information_schema')
        OR namespace.nspname LIKE 'pg_toast%'
        OR namespace.nspname LIKE 'pg_temp_%'
        OR namespace.nspname LIKE 'pg_toast_temp_%'
      )
      AND (
        pg_catalog.has_column_privilege(
          expected_role_oid::OID,
          relation.oid,
          attribute.attnum,
          'SELECT'
        )
        OR pg_catalog.has_column_privilege(
          expected_role_oid::OID,
          relation.oid,
          attribute.attnum,
          'INSERT'
        )
        OR pg_catalog.has_column_privilege(
          expected_role_oid::OID,
          relation.oid,
          attribute.attnum,
          'UPDATE'
        )
        OR pg_catalog.has_column_privilege(
          expected_role_oid::OID,
          relation.oid,
          attribute.attnum,
          'REFERENCES'
        )
      )

    UNION ALL

    SELECT 'system_function_acl'
    FROM pg_catalog.pg_proc AS procedure
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(procedure.proacl)
      AS privilege
    WHERE (
        namespace.nspname IN ('pg_catalog', 'information_schema')
        OR namespace.nspname LIKE 'pg_toast%'
        OR namespace.nspname LIKE 'pg_temp_%'
        OR namespace.nspname LIKE 'pg_toast_temp_%'
      )
      AND (
        privilege.grantee = expected_role_oid::OID
        OR (
          privilege.grantee = 0
          AND (
            (
              namespace.nspname = 'pg_catalog'
              AND NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_init_privs AS initial
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                  initial.initprivs
                ) AS initial_privilege
                WHERE initial.classoid =
                    'pg_catalog.pg_proc'::pg_catalog.regclass
                  AND initial.objoid = procedure.oid
                  AND initial.objsubid = 0
                  AND initial_privilege.grantee = privilege.grantee
                  AND initial_privilege.grantor = privilege.grantor
                  AND initial_privilege.privilege_type =
                    privilege.privilege_type
                  AND initial_privilege.is_grantable =
                    privilege.is_grantable
              )
            )
            OR namespace.nspname <> 'pg_catalog'
          )
        )
      )

    UNION ALL

    SELECT 'system_executable_function'
    FROM pg_catalog.pg_proc AS procedure
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE (
        namespace.nspname IN ('pg_catalog', 'information_schema')
        OR namespace.nspname LIKE 'pg_toast%'
        OR namespace.nspname LIKE 'pg_temp_%'
        OR namespace.nspname LIKE 'pg_toast_temp_%'
      )
      AND (
        procedure.prosecdef
        OR procedure.oid >= 16384
      )
      AND pg_catalog.has_function_privilege(
        expected_role_oid::OID,
        procedure.oid,
        'EXECUTE'
      )

    UNION ALL

    SELECT 'foreign_server'
    FROM pg_catalog.pg_foreign_server AS server
    WHERE pg_catalog.has_server_privilege(
      expected_role_oid::OID,
      server.oid,
      'USAGE'
    )

    UNION ALL

    SELECT 'foreign_data_wrapper'
    FROM pg_catalog.pg_foreign_data_wrapper AS wrapper
    WHERE pg_catalog.has_foreign_data_wrapper_privilege(
      expected_role_oid::OID,
      wrapper.oid,
      'USAGE'
    )

    UNION ALL

    SELECT 'parameter'
    FROM pg_catalog.pg_parameter_acl AS parameter
    WHERE pg_catalog.has_parameter_privilege(
        expected_role_oid::OID,
        parameter.parname,
        'SET'
      )
       OR pg_catalog.has_parameter_privilege(
         expected_role_oid::OID,
         parameter.parname,
         'ALTER SYSTEM'
       )

    UNION ALL

    SELECT 'tablespace'
    FROM pg_catalog.pg_tablespace AS tablespace
    WHERE pg_catalog.has_tablespace_privilege(
      expected_role_oid::OID,
      tablespace.oid,
      'CREATE'
    )

    UNION ALL

    SELECT 'large_object'
    FROM pg_catalog.pg_largeobject_metadata AS large_object
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        large_object.lomacl,
        pg_catalog.acldefault('L'::"char", large_object.lomowner)
      )
    ) AS privilege
    WHERE privilege.grantee IN (0, expected_role_oid::OID)
      AND privilege.privilege_type IN ('SELECT', 'UPDATE')
  ) AS unsafe_boundary;

  IF unsafe_role_dependency_count <> 0
     OR unsafe_allowed_acl_count <> 0
     OR unsafe_coordinator_acl_count <> 0
     OR coordinator_activation_acl_count NOT BETWEEN 0 AND 1
     OR coordinator_function_count <> 1
     OR unsafe_role_setting_count <> 0
     OR unsafe_ambient_boundary_count <> 0
  THEN
    RAISE EXCEPTION
      'Shared beta activation role has direct ambient authority'
      USING ERRCODE = '42501';
  END IF;

  RETURN TRUE;
END;
$$;

CREATE FUNCTION public."shared_beta_runtime_release_challenge_create_v1"(
  candidate_challenge_id TEXT,
  expected_build_provenance_id TEXT,
  expected_environment TEXT,
  expected_activation_role_name TEXT,
  candidate_valid_until TIMESTAMP(3) WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  uuid_pattern CONSTANT TEXT :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  challenge_id TEXT;
  build_id TEXT;
  environment_name TEXT;
  activation_role_name TEXT;
  activation_role_oid BIGINT;
  installer_role_name TEXT;
  installer_role_oid BIGINT;
  creation_nonce TEXT;
  database_identity_digest TEXT;
  migration_state JSONB;
  schema_head TEXT;
  migration_count INTEGER;
  migration_manifest_digest TEXT;
  predecessor_marker_id TEXT;
  predecessor_marker_digest TEXT;
  challenge_digest TEXT;
  actual_context_digest TEXT;
  challenge_payload JSONB;
  actual_context_payload JSONB;
  written_at TIMESTAMP(3) WITH TIME ZONE;
  build_record public."SharedBetaBuildProvenance"%ROWTYPE;
  state_record public."SharedBetaRuntimeReleaseState"%ROWTYPE;
  persisted public."SharedBetaRuntimeReleaseChallenge"%ROWTYPE;
BEGIN
  challenge_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_challenge_id) COLLATE "C"
  );
  build_id := pg_catalog.lower(
    pg_catalog.btrim(expected_build_provenance_id) COLLATE "C"
  );
  environment_name := pg_catalog.lower(
    pg_catalog.btrim(expected_environment) COLLATE "C"
  );
  activation_role_name := pg_catalog.lower(
    pg_catalog.btrim(expected_activation_role_name) COLLATE "C"
  );
  written_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  IF challenge_id IS NULL
     OR candidate_challenge_id IS DISTINCT FROM challenge_id
     OR challenge_id !~ uuid_pattern
     OR build_id IS NULL
     OR expected_build_provenance_id IS DISTINCT FROM build_id
     OR build_id !~ uuid_pattern
     OR environment_name IS NULL
     OR expected_environment IS DISTINCT FROM environment_name
     OR environment_name !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
     OR activation_role_name IS NULL
     OR expected_activation_role_name IS DISTINCT FROM
       activation_role_name
     OR activation_role_name !~ '^[a-z_][a-z0-9_]{0,62}$'
     OR candidate_valid_until IS NULL
     OR candidate_valid_until IS DISTINCT FROM
       pg_catalog.date_trunc('milliseconds', candidate_valid_until)
     OR candidate_valid_until <= written_at
     OR candidate_valid_until > written_at + INTERVAL '15 minutes'
  THEN
    RAISE EXCEPTION 'Shared beta runtime challenge input is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'shared-beta-runtime-release-install:v1',
      174
    )
  );

  SELECT role.rolname::TEXT, role.oid::BIGINT
  INTO installer_role_name, installer_role_oid
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = session_user;

  SELECT role.oid::BIGINT
  INTO activation_role_oid
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = activation_role_name;

  IF installer_role_oid IS NULL
     OR activation_role_oid IS NULL
     OR installer_role_oid = activation_role_oid
  THEN
    RAISE EXCEPTION 'Shared beta runtime role binding is invalid'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public."shared_beta_runtime_activation_role_assert_v1"(
    activation_role_name,
    activation_role_oid
  );

  SELECT build.*
  INTO build_record
  FROM public."SharedBetaBuildProvenance" AS build
  WHERE build."id" = build_id
  FOR SHARE;

  IF NOT FOUND
     OR build_record."stateRevision" <> 1
     OR build_record."revokedAt" IS NOT NULL
     OR build_record."validUntil" <= written_at
     OR build_record."validUntil" < candidate_valid_until
  THEN
    RAISE EXCEPTION 'Shared beta build provenance is unavailable'
      USING ERRCODE = '23514';
  END IF;

  SELECT state.*
  INTO state_record
  FROM public."SharedBetaRuntimeReleaseState" AS state
  WHERE state."id" = 'SHARED_BETA_RUNTIME_RELEASE'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared beta runtime release state is missing'
      USING ERRCODE = '55000';
  END IF;

  SELECT challenge.*
  INTO persisted
  FROM public."SharedBetaRuntimeReleaseChallenge" AS challenge
  WHERE challenge."id" = challenge_id
  FOR UPDATE;

  IF FOUND THEN
    IF pg_catalog.pg_is_in_recovery() THEN
      RAISE EXCEPTION
        'Shared beta runtime challenge replay is denied in recovery'
        USING ERRCODE = '25006';
    END IF;

    migration_state :=
      public."shared_beta_runtime_migration_state_v1"();
    database_identity_digest :=
      public."shared_beta_runtime_database_identity_digest_v1"(
        persisted."creationNonce"
      );

    IF state_record."currentMarkerId" IS NULL THEN
      predecessor_marker_digest :=
        public."shared_beta_runtime_digest_v1"(
          'leetplus-shared-beta-runtime-release-predecessor-v1',
          pg_catalog.jsonb_build_object(
            'schemaVersion', 1,
            'state', 'GENESIS',
            'databaseIdentityDigest', database_identity_digest
          )
        );
    ELSE
      SELECT marker."payloadDigest"
      INTO predecessor_marker_digest
      FROM public."SharedBetaRuntimeReleaseMarker" AS marker
      WHERE marker."id" = state_record."currentMarkerId"
        AND marker."generation" = state_record."generation"
        AND marker."stateRevision" = 1
        AND marker."revokedAt" IS NULL;
    END IF;

    challenge_payload := pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'challengeId', persisted."id",
      'buildProvenanceId', persisted."buildProvenanceId",
      'buildPayloadDigest', build_record."payloadDigest",
      'environment', persisted."environment",
      'activationRoleName', persisted."activationRoleName",
      'activationRoleOid', persisted."activationRoleOid",
      'installerRoleName', persisted."installerRoleName",
      'installerRoleOid', persisted."installerRoleOid",
      'creationNonce', persisted."creationNonce",
      'databaseIdentityDigest', persisted."databaseIdentityDigest",
      'schemaHead', persisted."schemaHead",
      'migrationCount', persisted."migrationCount",
      'migrationManifestDigest', persisted."migrationManifestDigest",
      'expectedStateRevision', persisted."expectedStateRevision",
      'candidateGeneration', persisted."candidateGeneration",
      'predecessorMarkerDigest', persisted."predecessorMarkerDigest",
      'createdAtEpochMs',
        (EXTRACT(EPOCH FROM persisted."createdAt") * 1000)::BIGINT,
      'validUntilEpochMs',
        (EXTRACT(EPOCH FROM persisted."validUntil") * 1000)::BIGINT
    );
    challenge_digest := public."shared_beta_runtime_digest_v1"(
      'leetplus-shared-beta-database-challenge-v1',
      challenge_payload
    );
    actual_context_digest :=
      public."shared_beta_runtime_actual_context_from_challenge_v1"(
        persisted."id"
      );

    IF persisted."buildProvenanceId" IS DISTINCT FROM build_id
       OR persisted."environment" IS DISTINCT FROM environment_name
       OR persisted."activationRoleName"::TEXT IS DISTINCT FROM
         activation_role_name
       OR persisted."activationRoleOid" IS DISTINCT FROM
         activation_role_oid
       OR persisted."installerRoleName"::TEXT IS DISTINCT FROM
         installer_role_name
       OR persisted."installerRoleOid" IS DISTINCT FROM
         installer_role_oid
       OR persisted."validUntil" IS DISTINCT FROM candidate_valid_until
       OR persisted."stateRevision" <> 1
       OR persisted."consumedAt" IS NOT NULL
       OR persisted."validUntil" <= written_at
       OR persisted."expectedStateRevision" IS DISTINCT FROM
         state_record."stateRevision"
       OR persisted."candidateGeneration" IS DISTINCT FROM
         state_record."generation" + 1
       OR persisted."predecessorMarkerId" IS DISTINCT FROM
         state_record."currentMarkerId"
       OR persisted."predecessorMarkerDigest" IS DISTINCT FROM
         predecessor_marker_digest
       OR persisted."databaseIdentityDigest" IS DISTINCT FROM
         database_identity_digest
       OR persisted."challengeDigest" IS DISTINCT FROM challenge_digest
       OR persisted."actualContextDigest" IS DISTINCT FROM
         actual_context_digest
       OR persisted."schemaHead" IS DISTINCT FROM
         migration_state ->> 'schemaHead'
       OR persisted."migrationCount" IS DISTINCT FROM
         (migration_state ->> 'migrationCount')::INTEGER
       OR persisted."migrationManifestDigest" IS DISTINCT FROM
         migration_state ->> 'migrationManifestDigest'
       OR (migration_state ->> 'nonAppliedCount')::INTEGER <> 0
       OR (migration_state ->> 'checksumMismatchCount')::INTEGER <> 0
    THEN
      RAISE EXCEPTION 'Shared beta runtime challenge replay is stale'
        USING ERRCODE = '40001';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'CREATE_SHARED_BETA_RUNTIME_RELEASE_CHALLENGE',
      'decision', 'REPLAYED',
      'challengeId', persisted."id",
      'buildProvenanceId', persisted."buildProvenanceId",
      'buildPayloadDigest', build_record."payloadDigest",
      'environment', persisted."environment",
      'databaseIdentityDigest', persisted."databaseIdentityDigest",
      'databaseChallengeDigest', persisted."challengeDigest",
      'actualContextDigest', persisted."actualContextDigest",
      'generation', persisted."candidateGeneration",
      'predecessorMarkerDigest', persisted."predecessorMarkerDigest",
      'activationDatabaseRole',
        persisted."activationRoleName"::TEXT,
      'coordinatorRoleName', persisted."activationRoleName"::TEXT,
      'coordinatorRoleOid', persisted."activationRoleOid",
      'validUntilEpochMs',
        (EXTRACT(EPOCH FROM persisted."validUntil") * 1000)::BIGINT
    );
  END IF;

  IF pg_catalog.pg_is_in_recovery() THEN
    RAISE EXCEPTION 'Shared beta runtime deployment is denied in recovery'
      USING ERRCODE = '25006';
  END IF;

  migration_state :=
    public."shared_beta_runtime_migration_state_v1"();
  schema_head := migration_state ->> 'schemaHead';
  migration_count :=
    (migration_state ->> 'migrationCount')::INTEGER;
  migration_manifest_digest :=
    migration_state ->> 'migrationManifestDigest';

  IF (migration_state ->> 'nonAppliedCount')::INTEGER <> 0
     OR (migration_state ->> 'checksumMismatchCount')::INTEGER <> 0
     OR schema_head IS NULL
     OR pg_catalog.left(schema_head, 14) < '20260730040000'
     OR migration_count < 174
     OR build_record."schemaHead" IS DISTINCT FROM schema_head
     OR build_record."migrationCount" IS DISTINCT FROM migration_count
     OR build_record."migrationManifestDigest" IS DISTINCT FROM
       migration_manifest_digest
  THEN
    RAISE EXCEPTION 'Shared beta runtime migration state does not match build'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public."SharedBetaRuntimeInstanceAnchor" (
    "id",
    "anchorNonce",
    "createdAt"
  )
  VALUES (
    'SHARED_BETA_RUNTIME_INSTANCE',
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.gen_random_uuid()::TEXT || ':' ||
            pg_catalog.gen_random_uuid()::TEXT || ':' ||
            pg_catalog.clock_timestamp()::TEXT,
          'UTF8'
        )
      ),
      'hex'
    ),
    written_at
  )
  ON CONFLICT ("id") DO NOTHING;

  creation_nonce := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.gen_random_uuid()::TEXT || ':' ||
          pg_catalog.gen_random_uuid()::TEXT || ':' ||
          pg_catalog.clock_timestamp()::TEXT,
        'UTF8'
      )
    ),
    'hex'
  );
  database_identity_digest :=
    public."shared_beta_runtime_database_identity_digest_v1"(
      creation_nonce
    );

  IF database_identity_digest IS NULL
     OR database_identity_digest !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Shared beta database identity is unavailable'
      USING ERRCODE = '55000';
  END IF;

  predecessor_marker_id := state_record."currentMarkerId";
  IF predecessor_marker_id IS NULL THEN
    predecessor_marker_digest :=
      public."shared_beta_runtime_digest_v1"(
        'leetplus-shared-beta-runtime-release-predecessor-v1',
        pg_catalog.jsonb_build_object(
          'schemaVersion', 1,
          'state', 'GENESIS',
          'databaseIdentityDigest', database_identity_digest
        )
      );
  ELSE
    SELECT marker."payloadDigest"
    INTO predecessor_marker_digest
    FROM public."SharedBetaRuntimeReleaseMarker" AS marker
    WHERE marker."id" = predecessor_marker_id
      AND marker."generation" = state_record."generation"
      AND marker."stateRevision" = 1
      AND marker."revokedAt" IS NULL
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shared beta runtime predecessor is inconsistent'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  challenge_payload := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'challengeId', challenge_id,
    'buildProvenanceId', build_record."id",
    'buildPayloadDigest', build_record."payloadDigest",
    'environment', environment_name,
    'activationRoleName', activation_role_name,
    'activationRoleOid', activation_role_oid,
    'installerRoleName', installer_role_name,
    'installerRoleOid', installer_role_oid,
    'creationNonce', creation_nonce,
    'databaseIdentityDigest', database_identity_digest,
    'schemaHead', schema_head,
    'migrationCount', migration_count,
    'migrationManifestDigest', migration_manifest_digest,
    'expectedStateRevision', state_record."stateRevision",
    'candidateGeneration', state_record."generation" + 1,
    'predecessorMarkerDigest', predecessor_marker_digest,
    'createdAtEpochMs', (EXTRACT(EPOCH FROM written_at) * 1000)::BIGINT,
    'validUntilEpochMs',
      (EXTRACT(EPOCH FROM candidate_valid_until) * 1000)::BIGINT
  );
  challenge_digest := public."shared_beta_runtime_digest_v1"(
    'leetplus-shared-beta-database-challenge-v1',
    challenge_payload
  );

  actual_context_payload := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'buildProvenanceId', build_record."id",
    'buildPayloadDigest', build_record."payloadDigest",
    'releaseSha', build_record."releaseSha",
    'artifactContentDigest', build_record."artifactContentDigest",
    'releaseManifestDigest', build_record."releaseManifestDigest",
    'schemaHead', schema_head,
    'migrationCount', migration_count,
    'migrationManifestDigest', migration_manifest_digest,
    'policyManifestDigest', build_record."policyManifestDigest",
    'trialPolicyVersion', build_record."trialPolicyVersion",
    'trialDurationSeconds', build_record."trialDurationSeconds",
    'environment', environment_name,
    'databaseIdentityDigest', database_identity_digest,
    'databaseChallengeDigest', challenge_digest,
    'generation', state_record."generation" + 1,
    'predecessorMarkerDigest', predecessor_marker_digest,
    'activationRoleName', activation_role_name,
    'activationRoleOid', activation_role_oid
  );
  actual_context_digest := public."shared_beta_runtime_digest_v1"(
    'leetplus-shared-beta-actual-context-v1',
    actual_context_payload
  );

  INSERT INTO public."SharedBetaRuntimeReleaseChallenge" (
    "id",
    "buildProvenanceId",
    "environment",
    "activationRoleName",
    "activationRoleOid",
    "installerRoleName",
    "installerRoleOid",
    "creationNonce",
    "databaseIdentityDigest",
    "schemaHead",
    "migrationCount",
    "migrationManifestDigest",
    "expectedStateRevision",
    "candidateGeneration",
    "predecessorMarkerId",
    "predecessorMarkerDigest",
    "challengeDigest",
    "actualContextDigest",
    "stateRevision",
    "consumedAt",
    "createdAt",
    "validUntil"
  )
  VALUES (
    challenge_id,
    build_record."id",
    environment_name,
    activation_role_name,
    activation_role_oid,
    installer_role_name,
    installer_role_oid,
    creation_nonce,
    database_identity_digest,
    schema_head,
    migration_count,
    migration_manifest_digest,
    state_record."stateRevision",
    state_record."generation" + 1,
    predecessor_marker_id,
    predecessor_marker_digest,
    challenge_digest,
    actual_context_digest,
    1,
    NULL,
    written_at,
    candidate_valid_until
  )
  RETURNING *
  INTO persisted;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'CREATE_SHARED_BETA_RUNTIME_RELEASE_CHALLENGE',
    'decision', 'CREATED',
    'challengeId', persisted."id",
    'buildProvenanceId', persisted."buildProvenanceId",
    'buildPayloadDigest', build_record."payloadDigest",
    'environment', persisted."environment",
    'databaseIdentityDigest', persisted."databaseIdentityDigest",
    'databaseChallengeDigest', persisted."challengeDigest",
    'actualContextDigest', persisted."actualContextDigest",
    'generation', persisted."candidateGeneration",
    'predecessorMarkerDigest', persisted."predecessorMarkerDigest",
    'activationDatabaseRole', persisted."activationRoleName"::TEXT,
    'coordinatorRoleName', persisted."activationRoleName"::TEXT,
    'coordinatorRoleOid', persisted."activationRoleOid",
    'validUntilEpochMs',
      (EXTRACT(EPOCH FROM persisted."validUntil") * 1000)::BIGINT
  );
END;
$$;

CREATE FUNCTION public."shared_beta_runtime_actual_context_from_challenge_v1"(
  expected_challenge_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RETURN (
  SELECT public."shared_beta_runtime_digest_v1"(
    'leetplus-shared-beta-actual-context-v1',
    pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'buildProvenanceId', build."id",
      'buildPayloadDigest', build."payloadDigest",
      'releaseSha', build."releaseSha",
      'artifactContentDigest', build."artifactContentDigest",
      'releaseManifestDigest', build."releaseManifestDigest",
      'schemaHead', challenge."schemaHead",
      'migrationCount', challenge."migrationCount",
      'migrationManifestDigest', challenge."migrationManifestDigest",
      'policyManifestDigest', build."policyManifestDigest",
      'trialPolicyVersion', build."trialPolicyVersion",
      'trialDurationSeconds', build."trialDurationSeconds",
      'environment', challenge."environment",
      'databaseIdentityDigest', challenge."databaseIdentityDigest",
      'databaseChallengeDigest', challenge."challengeDigest",
      'generation', challenge."candidateGeneration",
      'predecessorMarkerDigest', challenge."predecessorMarkerDigest",
      'activationRoleName', challenge."activationRoleName"::TEXT,
      'activationRoleOid', challenge."activationRoleOid"
    )
  )
  FROM public."SharedBetaRuntimeReleaseChallenge" AS challenge
  INNER JOIN public."SharedBetaBuildProvenance" AS build
    ON build."id" = challenge."buildProvenanceId"
  WHERE challenge."id" = expected_challenge_id
  );
END;
$$;

CREATE FUNCTION public."shared_beta_runtime_release_marker_persist_v1"(
  candidate_deployment_marker_id TEXT,
  candidate_build_provenance_id TEXT,
  candidate_build_payload_digest TEXT,
  candidate_environment TEXT,
  candidate_database_identity_digest TEXT,
  candidate_database_challenge_digest TEXT,
  candidate_actual_context_digest TEXT,
  candidate_deployment_instance_digest TEXT,
  candidate_generation BIGINT,
  candidate_predecessor_marker_digest TEXT,
  candidate_activation_database_role TEXT,
  candidate_coordinator_role_name TEXT,
  candidate_coordinator_role_oid BIGINT,
  candidate_deployed_at TIMESTAMP(3) WITH TIME ZONE,
  candidate_payload JSONB,
  candidate_payload_digest TEXT,
  candidate_signature_algorithm TEXT,
  candidate_signing_key_id TEXT,
  candidate_public_key_fingerprint TEXT,
  candidate_signature_base64url TEXT,
  candidate_valid_until TIMESTAMP(3) WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  uuid_pattern CONSTANT TEXT :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  marker_id TEXT;
  build_id TEXT;
  build_payload_digest TEXT;
  environment_name TEXT;
  database_identity_digest TEXT;
  database_challenge_digest TEXT;
  actual_context_digest TEXT;
  deployment_instance_digest TEXT;
  predecessor_marker_digest TEXT;
  activation_role_name TEXT;
  coordinator_role_name TEXT;
  payload_digest TEXT;
  signing_key_id TEXT;
  key_fingerprint TEXT;
  signature_base64url TEXT;
  installer_role_name TEXT;
  installer_role_oid BIGINT;
  actual_payload_digest TEXT;
  actual_build_payload_digest TEXT;
  recomputed_database_identity_digest TEXT;
  recomputed_actual_context_digest TEXT;
  migration_state JSONB;
  expected_payload JSONB;
  written_at TIMESTAMP(3) WITH TIME ZONE;
  build_record public."SharedBetaBuildProvenance"%ROWTYPE;
  challenge_record public."SharedBetaRuntimeReleaseChallenge"%ROWTYPE;
  state_record public."SharedBetaRuntimeReleaseState"%ROWTYPE;
  persisted public."SharedBetaRuntimeReleaseMarker"%ROWTYPE;
BEGIN
  marker_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_deployment_marker_id) COLLATE "C"
  );
  build_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_build_provenance_id) COLLATE "C"
  );
  build_payload_digest :=
    pg_catalog.btrim(candidate_build_payload_digest);
  environment_name := pg_catalog.lower(
    pg_catalog.btrim(candidate_environment) COLLATE "C"
  );
  database_identity_digest :=
    pg_catalog.btrim(candidate_database_identity_digest);
  database_challenge_digest :=
    pg_catalog.btrim(candidate_database_challenge_digest);
  actual_context_digest :=
    pg_catalog.btrim(candidate_actual_context_digest);
  deployment_instance_digest :=
    pg_catalog.btrim(candidate_deployment_instance_digest);
  predecessor_marker_digest :=
    pg_catalog.btrim(candidate_predecessor_marker_digest);
  activation_role_name := pg_catalog.lower(
    pg_catalog.btrim(candidate_activation_database_role) COLLATE "C"
  );
  coordinator_role_name := pg_catalog.lower(
    pg_catalog.btrim(candidate_coordinator_role_name) COLLATE "C"
  );
  payload_digest := pg_catalog.btrim(candidate_payload_digest);
  signing_key_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_signing_key_id) COLLATE "C"
  );
  key_fingerprint :=
    pg_catalog.btrim(candidate_public_key_fingerprint);
  signature_base64url :=
    pg_catalog.btrim(candidate_signature_base64url);
  written_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  actual_payload_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        public."shared_beta_runtime_canonical_json_v1"(
          candidate_payload
        ),
        'UTF8'
      )
    ),
    'hex'
  );

  IF marker_id IS NULL
     OR candidate_deployment_marker_id IS DISTINCT FROM marker_id
     OR marker_id !~ uuid_pattern
     OR build_id IS NULL
     OR candidate_build_provenance_id IS DISTINCT FROM build_id
     OR build_id !~ uuid_pattern
     OR build_payload_digest !~ '^[0-9a-f]{64}$'
     OR environment_name IS NULL
     OR candidate_environment IS DISTINCT FROM environment_name
     OR environment_name !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
     OR database_identity_digest !~ '^[0-9a-f]{64}$'
     OR database_challenge_digest !~ '^[0-9a-f]{64}$'
     OR actual_context_digest !~ '^[0-9a-f]{64}$'
     OR deployment_instance_digest !~ '^[0-9a-f]{64}$'
     OR candidate_generation < 1
     OR predecessor_marker_digest !~ '^[0-9a-f]{64}$'
     OR activation_role_name IS NULL
     OR candidate_activation_database_role IS DISTINCT FROM
       activation_role_name
     OR activation_role_name !~ '^[a-z_][a-z0-9_]{0,62}$'
     OR coordinator_role_name IS NULL
     OR candidate_coordinator_role_name IS DISTINCT FROM
       coordinator_role_name
     OR coordinator_role_name IS DISTINCT FROM activation_role_name
     OR candidate_coordinator_role_oid NOT BETWEEN 1 AND 4294967295
     OR candidate_deployed_at IS NULL
     OR candidate_deployed_at IS DISTINCT FROM
       pg_catalog.date_trunc('milliseconds', candidate_deployed_at)
     OR candidate_payload IS NULL
     OR pg_catalog.jsonb_typeof(candidate_payload) <> 'object'
     OR payload_digest !~ '^[0-9a-f]{64}$'
     OR payload_digest IS DISTINCT FROM actual_payload_digest
     OR candidate_signature_algorithm <> 'Ed25519'
     OR signing_key_id !~ '^[a-z0-9][a-z0-9._-]{2,63}$'
     OR key_fingerprint !~ '^[0-9a-f]{64}$'
     OR signature_base64url !~ '^[A-Za-z0-9_-]{86}$'
     OR candidate_valid_until IS NULL
     OR candidate_valid_until IS DISTINCT FROM
       pg_catalog.date_trunc('milliseconds', candidate_valid_until)
  THEN
    RAISE EXCEPTION 'Shared beta deployment marker input is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'shared-beta-runtime-release-install:v1',
      174
    )
  );

  SELECT state.*
  INTO state_record
  FROM public."SharedBetaRuntimeReleaseState" AS state
  WHERE state."id" = 'SHARED_BETA_RUNTIME_RELEASE'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared beta runtime release state is missing'
      USING ERRCODE = '55000';
  END IF;

  SELECT marker.*
  INTO persisted
  FROM public."SharedBetaRuntimeReleaseMarker" AS marker
  WHERE marker."id" = marker_id
  FOR UPDATE;

  IF FOUND THEN
    SELECT challenge.*
    INTO challenge_record
    FROM public."SharedBetaRuntimeReleaseChallenge" AS challenge
    WHERE challenge."id" = persisted."challengeId"
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shared beta deployment marker replay is incomplete'
        USING ERRCODE = '23514';
    END IF;

    SELECT build.*
    INTO build_record
    FROM public."SharedBetaBuildProvenance" AS build
    WHERE build."id" = persisted."buildProvenanceId"
    FOR SHARE;

    SELECT role.rolname::TEXT, role.oid::BIGINT
    INTO installer_role_name, installer_role_oid
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = session_user;

    PERFORM public."shared_beta_runtime_activation_role_assert_v1"(
      persisted."coordinatorRoleName",
      persisted."coordinatorRoleOid"
    );

    IF installer_role_name IS DISTINCT FROM
         challenge_record."installerRoleName"
       OR installer_role_oid IS DISTINCT FROM
         challenge_record."installerRoleOid"
       OR build_record."id" IS NULL
       OR challenge_record."stateRevision" <> 2
       OR challenge_record."consumedAt" IS NULL
       OR build_record."stateRevision" <> 1
       OR build_record."revokedAt" IS NOT NULL
       OR build_record."validUntil" <= written_at
       OR persisted."stateRevision" <> 1
       OR persisted."revokedAt" IS NOT NULL
       OR persisted."validUntil" <= written_at
       OR state_record."currentMarkerId" IS DISTINCT FROM persisted."id"
       OR state_record."generation" IS DISTINCT FROM
         persisted."generation"
       OR persisted."buildProvenanceId" IS DISTINCT FROM build_id
       OR persisted."buildPayloadDigest" IS DISTINCT FROM
         build_payload_digest
       OR persisted."environment" IS DISTINCT FROM environment_name
       OR persisted."databaseIdentityDigest" IS DISTINCT FROM
         database_identity_digest
       OR persisted."databaseChallengeDigest" IS DISTINCT FROM
         database_challenge_digest
       OR persisted."actualContextDigest" IS DISTINCT FROM
         actual_context_digest
       OR persisted."deploymentInstanceDigest" IS DISTINCT FROM
         deployment_instance_digest
       OR persisted."generation" IS DISTINCT FROM candidate_generation
       OR persisted."predecessorMarkerDigest" IS DISTINCT FROM
         predecessor_marker_digest
       OR persisted."activationDatabaseRole" IS DISTINCT FROM
         activation_role_name
       OR persisted."coordinatorRoleName" IS DISTINCT FROM
         coordinator_role_name
       OR persisted."coordinatorRoleOid" IS DISTINCT FROM
         candidate_coordinator_role_oid
       OR persisted."deployedAt" IS DISTINCT FROM candidate_deployed_at
       OR persisted."payload" IS DISTINCT FROM candidate_payload
       OR persisted."payloadDigest" IS DISTINCT FROM payload_digest
       OR persisted."signingKeyId" IS DISTINCT FROM signing_key_id
       OR persisted."publicKeyFingerprint" IS DISTINCT FROM
         key_fingerprint
       OR persisted."signatureBase64url" IS DISTINCT FROM
         signature_base64url
       OR persisted."validUntil" IS DISTINCT FROM candidate_valid_until
    THEN
      RAISE EXCEPTION 'Shared beta deployment marker replay conflicts'
        USING ERRCODE = '23505';
    END IF;

    IF pg_catalog.pg_is_in_recovery() THEN
      RAISE EXCEPTION 'Shared beta deployment is denied in recovery'
        USING ERRCODE = '25006';
    END IF;

    migration_state :=
      public."shared_beta_runtime_migration_state_v1"();
    recomputed_database_identity_digest :=
      public."shared_beta_runtime_database_identity_digest_v1"(
        challenge_record."creationNonce"
      );
    recomputed_actual_context_digest :=
      public."shared_beta_runtime_actual_context_from_challenge_v1"(
        challenge_record."id"
      );
    actual_build_payload_digest := pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          public."shared_beta_runtime_canonical_json_v1"(
            build_record."payload"
          ),
          'UTF8'
        )
      ),
      'hex'
    );

    IF (migration_state ->> 'nonAppliedCount')::INTEGER <> 0
       OR (migration_state ->> 'checksumMismatchCount')::INTEGER <> 0
       OR migration_state ->> 'schemaHead' IS DISTINCT FROM
         persisted."schemaHead"
       OR (migration_state ->> 'migrationCount')::INTEGER IS DISTINCT FROM
         persisted."migrationCount"
       OR migration_state ->> 'migrationManifestDigest' IS DISTINCT FROM
         persisted."migrationManifestDigest"
       OR persisted."schemaHead" IS DISTINCT FROM build_record."schemaHead"
       OR persisted."migrationCount" IS DISTINCT FROM
         build_record."migrationCount"
       OR persisted."migrationManifestDigest" IS DISTINCT FROM
         build_record."migrationManifestDigest"
       OR recomputed_database_identity_digest IS DISTINCT FROM
         persisted."databaseIdentityDigest"
       OR recomputed_database_identity_digest IS DISTINCT FROM
         challenge_record."databaseIdentityDigest"
       OR recomputed_actual_context_digest IS DISTINCT FROM
         persisted."actualContextDigest"
       OR recomputed_actual_context_digest IS DISTINCT FROM
         challenge_record."actualContextDigest"
       OR actual_build_payload_digest IS DISTINCT FROM
         build_record."payloadDigest"
    THEN
      RAISE EXCEPTION
        'Shared beta deployment marker replay actual context drifted'
        USING ERRCODE = '23514';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'PERSIST_SHARED_BETA_DEPLOYMENT_MARKER',
      'decision', 'REPLAYED',
      'deploymentMarkerId', persisted."id",
      'buildProvenanceId', persisted."buildProvenanceId",
      'payloadDigest', persisted."payloadDigest",
      'generation', persisted."generation",
      'stateRevision', persisted."stateRevision"
    );
  END IF;

  SELECT challenge.*
  INTO challenge_record
  FROM public."SharedBetaRuntimeReleaseChallenge" AS challenge
  WHERE challenge."challengeDigest" = database_challenge_digest
    AND challenge."buildProvenanceId" = build_id
  FOR UPDATE;

  IF NOT FOUND
     OR challenge_record."stateRevision" <> 1
     OR challenge_record."consumedAt" IS NOT NULL
     OR challenge_record."validUntil" <= written_at
  THEN
    RAISE EXCEPTION 'Shared beta deployment challenge is unavailable'
      USING ERRCODE = '23514';
  END IF;

  SELECT role.rolname::TEXT, role.oid::BIGINT
  INTO installer_role_name, installer_role_oid
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = session_user;

  IF installer_role_name IS DISTINCT FROM
       challenge_record."installerRoleName"
     OR installer_role_oid IS DISTINCT FROM
       challenge_record."installerRoleOid"
     OR activation_role_name IS DISTINCT FROM
       challenge_record."activationRoleName"
     OR candidate_coordinator_role_oid IS DISTINCT FROM
       challenge_record."activationRoleOid"
  THEN
    RAISE EXCEPTION 'Shared beta deployment role binding changed'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public."shared_beta_runtime_activation_role_assert_v1"(
    activation_role_name,
    candidate_coordinator_role_oid
  );

  SELECT build.*
  INTO build_record
  FROM public."SharedBetaBuildProvenance" AS build
  WHERE build."id" = build_id
  FOR SHARE;

  IF NOT FOUND
     OR build_record."stateRevision" <> 1
     OR build_record."revokedAt" IS NOT NULL
     OR build_record."payloadDigest" IS DISTINCT FROM
       build_payload_digest
     OR build_record."validUntil" <= written_at
     OR build_record."signingKeyId" = signing_key_id
     OR build_record."publicKeyFingerprint" = key_fingerprint
  THEN
    RAISE EXCEPTION 'Shared beta build/deployment binding is invalid'
      USING ERRCODE = '23514';
  END IF;

  IF pg_catalog.pg_is_in_recovery() THEN
    RAISE EXCEPTION 'Shared beta deployment is denied in recovery'
      USING ERRCODE = '25006';
  END IF;

  migration_state :=
    public."shared_beta_runtime_migration_state_v1"();
  recomputed_database_identity_digest :=
    public."shared_beta_runtime_database_identity_digest_v1"(
      challenge_record."creationNonce"
    );
  recomputed_actual_context_digest :=
    public."shared_beta_runtime_actual_context_from_challenge_v1"(
      challenge_record."id"
    );

  IF (migration_state ->> 'nonAppliedCount')::INTEGER <> 0
     OR (migration_state ->> 'checksumMismatchCount')::INTEGER <> 0
     OR migration_state ->> 'schemaHead' IS DISTINCT FROM
       challenge_record."schemaHead"
     OR (migration_state ->> 'migrationCount')::INTEGER IS DISTINCT FROM
       challenge_record."migrationCount"
     OR migration_state ->> 'migrationManifestDigest' IS DISTINCT FROM
       challenge_record."migrationManifestDigest"
     OR recomputed_database_identity_digest IS DISTINCT FROM
       challenge_record."databaseIdentityDigest"
     OR database_identity_digest IS DISTINCT FROM
       recomputed_database_identity_digest
     OR recomputed_actual_context_digest IS DISTINCT FROM
       challenge_record."actualContextDigest"
     OR actual_context_digest IS DISTINCT FROM
       recomputed_actual_context_digest
     OR environment_name IS DISTINCT FROM challenge_record."environment"
     OR candidate_generation IS DISTINCT FROM
       challenge_record."candidateGeneration"
     OR predecessor_marker_digest IS DISTINCT FROM
       challenge_record."predecessorMarkerDigest"
     OR state_record."stateRevision" IS DISTINCT FROM
       challenge_record."expectedStateRevision"
     OR state_record."generation" + 1 IS DISTINCT FROM
       candidate_generation
     OR state_record."currentMarkerId" IS DISTINCT FROM
       challenge_record."predecessorMarkerId"
  THEN
    RAISE EXCEPTION 'Shared beta deployment actual context changed'
      USING ERRCODE = '40001';
  END IF;

  IF candidate_deployed_at > written_at + INTERVAL '5 minutes'
     OR candidate_deployed_at < build_record."builtAt"
     OR candidate_deployed_at >= build_record."validUntil"
     OR candidate_valid_until <= written_at
     OR candidate_valid_until <= candidate_deployed_at
     OR candidate_valid_until >
       candidate_deployed_at + INTERVAL '24 hours'
     OR candidate_valid_until > build_record."validUntil"
  THEN
    RAISE EXCEPTION 'Shared beta deployment validity is invalid'
      USING ERRCODE = '22023';
  END IF;

  expected_payload := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'kind', 'LEETPLUS_SHARED_BETA_DEPLOYMENT_PROVENANCE',
    'purpose', 'SHARED_BETA_DEPLOYMENT_PROVENANCE',
    'profile', 'SHARED_BETA_RUNTIME_RELEASE_PROVENANCE_V1',
    'contract', 'SHARED_BETA_DEPLOYMENT_PROVENANCE_V1',
    'deploymentMarkerId', marker_id,
    'buildProvenanceId', build_id,
    'buildPayloadDigest', build_payload_digest,
    'generation', candidate_generation,
    'environment', environment_name,
    'deploymentInstanceDigest', deployment_instance_digest,
    'databaseIdentityDigest', database_identity_digest,
    'databaseChallengeDigest', database_challenge_digest,
    'actualContextDigest', actual_context_digest,
    'activationDatabaseRole', activation_role_name,
    'coordinatorRoleName', coordinator_role_name,
    'coordinatorRoleOid', candidate_coordinator_role_oid,
    'predecessorMarkerDigest', predecessor_marker_digest,
    'signingKeyId', signing_key_id,
    'publicKeyFingerprint', key_fingerprint,
    'deployedAtEpochMs',
      (EXTRACT(EPOCH FROM candidate_deployed_at) * 1000)::BIGINT,
    'validUntilEpochMs',
      (EXTRACT(EPOCH FROM candidate_valid_until) * 1000)::BIGINT
  );

  IF candidate_payload IS DISTINCT FROM expected_payload THEN
    RAISE EXCEPTION 'Shared beta deployment payload binding is invalid'
      USING ERRCODE = '23514';
  END IF;

  IF challenge_record."predecessorMarkerId" IS NOT NULL THEN
    UPDATE public."SharedBetaRuntimeReleaseMarker"
    SET
      "stateRevision" = 2,
      "revokedAt" = written_at,
      "revocationReasonDigest" =
        public."shared_beta_runtime_digest_v1"(
          'leetplus-shared-beta-runtime-release-superseded-v1',
          pg_catalog.jsonb_build_object(
            'schemaVersion', 1,
            'predecessorMarkerId',
              challenge_record."predecessorMarkerId",
            'successorMarkerId', marker_id,
            'successorGeneration', candidate_generation
          )
        )
    WHERE "id" = challenge_record."predecessorMarkerId"
      AND "stateRevision" = 1
      AND "revokedAt" IS NULL
      AND "payloadDigest" = predecessor_marker_digest;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shared beta deployment predecessor changed'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  INSERT INTO public."SharedBetaRuntimeReleaseMarker" (
    "id",
    "buildProvenanceId",
    "challengeId",
    "generation",
    "environment",
    "buildPayloadDigest",
    "deploymentInstanceDigest",
    "databaseIdentityDigest",
    "databaseChallengeDigest",
    "actualContextDigest",
    "schemaHead",
    "migrationCount",
    "migrationManifestDigest",
    "activationDatabaseRole",
    "coordinatorRoleName",
    "coordinatorRoleOid",
    "predecessorMarkerId",
    "predecessorMarkerDigest",
    "payload",
    "payloadDigest",
    "signatureAlgorithm",
    "signingKeyId",
    "publicKeyFingerprint",
    "signatureBase64url",
    "deployedAt",
    "validUntil",
    "createdAt"
  )
  VALUES (
    marker_id,
    build_id,
    challenge_record."id",
    candidate_generation,
    environment_name,
    build_payload_digest,
    deployment_instance_digest,
    database_identity_digest,
    database_challenge_digest,
    actual_context_digest,
    challenge_record."schemaHead",
    challenge_record."migrationCount",
    challenge_record."migrationManifestDigest",
    activation_role_name,
    coordinator_role_name,
    candidate_coordinator_role_oid,
    challenge_record."predecessorMarkerId",
    predecessor_marker_digest,
    candidate_payload,
    payload_digest,
    'Ed25519',
    signing_key_id,
    key_fingerprint,
    signature_base64url,
    candidate_deployed_at,
    candidate_valid_until,
    written_at
  )
  RETURNING *
  INTO persisted;

  UPDATE public."SharedBetaRuntimeReleaseChallenge"
  SET
    "stateRevision" = 2,
    "consumedAt" = written_at
  WHERE "id" = challenge_record."id"
    AND "stateRevision" = 1
    AND "consumedAt" IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared beta deployment challenge changed'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public."SharedBetaRuntimeReleaseState"
  SET
    "currentMarkerId" = persisted."id",
    "generation" = persisted."generation",
    "stateRevision" = state_record."stateRevision" + 1,
    "updatedAt" = written_at
  WHERE "id" = state_record."id"
    AND "stateRevision" = state_record."stateRevision";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared beta runtime release state changed'
      USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'PERSIST_SHARED_BETA_DEPLOYMENT_MARKER',
    'decision', 'CREATED',
    'deploymentMarkerId', persisted."id",
    'buildProvenanceId', persisted."buildProvenanceId",
    'payloadDigest', persisted."payloadDigest",
    'generation', persisted."generation",
    'stateRevision', state_record."stateRevision" + 1
  );
END;
$$;

CREATE FUNCTION public."shared_beta_runtime_instance_anchor_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Shared beta runtime instance anchor is immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "SharedBetaRuntimeInstanceAnchor_row_guard_trigger"
BEFORE UPDATE OR DELETE ON public."SharedBetaRuntimeInstanceAnchor"
FOR EACH ROW
EXECUTE FUNCTION public."shared_beta_runtime_instance_anchor_guard_v1"();

CREATE TRIGGER "SharedBetaRuntimeInstanceAnchor_truncate_guard_trigger"
BEFORE TRUNCATE ON public."SharedBetaRuntimeInstanceAnchor"
FOR EACH STATEMENT
EXECUTE FUNCTION public."shared_beta_runtime_instance_anchor_guard_v1"();

CREATE TRIGGER "SharedBetaBuildProvenance_guard_trigger"
BEFORE UPDATE OR DELETE ON public."SharedBetaBuildProvenance"
FOR EACH ROW
EXECUTE FUNCTION public."shared_beta_build_provenance_guard_v1"();

CREATE FUNCTION public."shared_beta_runtime_challenge_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Shared beta runtime challenge is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
     OR OLD."buildProvenanceId" IS DISTINCT FROM
       NEW."buildProvenanceId"
     OR OLD."environment" IS DISTINCT FROM NEW."environment"
     OR OLD."activationRoleName" IS DISTINCT FROM
       NEW."activationRoleName"
     OR OLD."activationRoleOid" IS DISTINCT FROM NEW."activationRoleOid"
     OR OLD."installerRoleName" IS DISTINCT FROM
       NEW."installerRoleName"
     OR OLD."installerRoleOid" IS DISTINCT FROM NEW."installerRoleOid"
     OR OLD."creationNonce" IS DISTINCT FROM NEW."creationNonce"
     OR OLD."databaseIdentityDigest" IS DISTINCT FROM
       NEW."databaseIdentityDigest"
     OR OLD."schemaHead" IS DISTINCT FROM NEW."schemaHead"
     OR OLD."migrationCount" IS DISTINCT FROM NEW."migrationCount"
     OR OLD."migrationManifestDigest" IS DISTINCT FROM
       NEW."migrationManifestDigest"
     OR OLD."expectedStateRevision" IS DISTINCT FROM
       NEW."expectedStateRevision"
     OR OLD."candidateGeneration" IS DISTINCT FROM
       NEW."candidateGeneration"
     OR OLD."predecessorMarkerId" IS DISTINCT FROM
       NEW."predecessorMarkerId"
     OR OLD."predecessorMarkerDigest" IS DISTINCT FROM
       NEW."predecessorMarkerDigest"
     OR OLD."challengeDigest" IS DISTINCT FROM NEW."challengeDigest"
     OR OLD."actualContextDigest" IS DISTINCT FROM
       NEW."actualContextDigest"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
     OR OLD."validUntil" IS DISTINCT FROM NEW."validUntil"
     OR OLD."stateRevision" <> 1
     OR OLD."consumedAt" IS NOT NULL
     OR NEW."stateRevision" <> 2
     OR NEW."consumedAt" IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public."SharedBetaRuntimeReleaseMarker" AS marker
       WHERE marker."challengeId" = OLD."id"
         AND marker."buildProvenanceId" = OLD."buildProvenanceId"
         AND marker."databaseChallengeDigest" = OLD."challengeDigest"
         AND marker."actualContextDigest" = OLD."actualContextDigest"
         AND marker."createdAt" = NEW."consumedAt"
     )
  THEN
    RAISE EXCEPTION 'Shared beta runtime challenge transition is invalid'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "SharedBetaRuntimeReleaseChallenge_guard_trigger"
BEFORE UPDATE OR DELETE ON public."SharedBetaRuntimeReleaseChallenge"
FOR EACH ROW
EXECUTE FUNCTION public."shared_beta_runtime_challenge_guard_v1"();

CREATE FUNCTION public."shared_beta_runtime_marker_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Shared beta runtime release marker is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
     OR OLD."buildProvenanceId" IS DISTINCT FROM
       NEW."buildProvenanceId"
     OR OLD."challengeId" IS DISTINCT FROM NEW."challengeId"
     OR OLD."authorityDomain" IS DISTINCT FROM NEW."authorityDomain"
     OR OLD."contractVersion" IS DISTINCT FROM NEW."contractVersion"
     OR OLD."generation" IS DISTINCT FROM NEW."generation"
     OR OLD."environment" IS DISTINCT FROM NEW."environment"
     OR OLD."buildPayloadDigest" IS DISTINCT FROM
       NEW."buildPayloadDigest"
     OR OLD."deploymentInstanceDigest" IS DISTINCT FROM
       NEW."deploymentInstanceDigest"
     OR OLD."databaseIdentityDigest" IS DISTINCT FROM
       NEW."databaseIdentityDigest"
     OR OLD."databaseChallengeDigest" IS DISTINCT FROM
       NEW."databaseChallengeDigest"
     OR OLD."actualContextDigest" IS DISTINCT FROM
       NEW."actualContextDigest"
     OR OLD."schemaHead" IS DISTINCT FROM NEW."schemaHead"
     OR OLD."migrationCount" IS DISTINCT FROM NEW."migrationCount"
     OR OLD."migrationManifestDigest" IS DISTINCT FROM
       NEW."migrationManifestDigest"
     OR OLD."activationDatabaseRole" IS DISTINCT FROM
       NEW."activationDatabaseRole"
     OR OLD."coordinatorRoleName" IS DISTINCT FROM
       NEW."coordinatorRoleName"
     OR OLD."coordinatorRoleOid" IS DISTINCT FROM
       NEW."coordinatorRoleOid"
     OR OLD."predecessorMarkerId" IS DISTINCT FROM
       NEW."predecessorMarkerId"
     OR OLD."predecessorMarkerDigest" IS DISTINCT FROM
       NEW."predecessorMarkerDigest"
     OR OLD."payload" IS DISTINCT FROM NEW."payload"
     OR OLD."payloadDigest" IS DISTINCT FROM NEW."payloadDigest"
     OR OLD."signatureAlgorithm" IS DISTINCT FROM
       NEW."signatureAlgorithm"
     OR OLD."signingKeyId" IS DISTINCT FROM NEW."signingKeyId"
     OR OLD."publicKeyFingerprint" IS DISTINCT FROM
       NEW."publicKeyFingerprint"
     OR OLD."signatureBase64url" IS DISTINCT FROM
       NEW."signatureBase64url"
     OR OLD."deployedAt" IS DISTINCT FROM NEW."deployedAt"
     OR OLD."validUntil" IS DISTINCT FROM NEW."validUntil"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
     OR OLD."stateRevision" <> 1
     OR OLD."revokedAt" IS NOT NULL
     OR OLD."revocationReasonDigest" IS NOT NULL
     OR NEW."stateRevision" <> 2
     OR NEW."revokedAt" IS NULL
     OR NEW."revocationReasonDigest" IS NULL
  THEN
    RAISE EXCEPTION 'Shared beta runtime release marker payload is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "SharedBetaRuntimeReleaseMarker_guard_trigger"
BEFORE UPDATE OR DELETE ON public."SharedBetaRuntimeReleaseMarker"
FOR EACH ROW
EXECUTE FUNCTION public."shared_beta_runtime_marker_guard_v1"();

CREATE FUNCTION public."shared_beta_runtime_state_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP <> 'UPDATE'
     OR OLD."id" IS DISTINCT FROM NEW."id"
     OR NEW."stateRevision" <> OLD."stateRevision" + 1
  THEN
    RAISE EXCEPTION 'Shared beta runtime release state is sealed'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."currentMarkerId" IS NOT NULL THEN
    IF NEW."generation" <> OLD."generation" + 1
       OR NOT EXISTS (
         SELECT 1
         FROM public."SharedBetaRuntimeReleaseMarker" AS marker
         WHERE marker."id" = NEW."currentMarkerId"
           AND marker."generation" = NEW."generation"
           AND marker."stateRevision" = 1
           AND marker."revokedAt" IS NULL
           AND marker."predecessorMarkerId" IS NOT DISTINCT FROM
             OLD."currentMarkerId"
       )
    THEN
      RAISE EXCEPTION 'Shared beta runtime marker install is invalid'
        USING ERRCODE = '55000';
    END IF;
  ELSE
    IF OLD."currentMarkerId" IS NULL
       OR NEW."generation" <> OLD."generation"
       OR NOT EXISTS (
         SELECT 1
         FROM public."SharedBetaRuntimeReleaseMarker" AS marker
         WHERE marker."id" = OLD."currentMarkerId"
           AND marker."stateRevision" = 2
           AND marker."revokedAt" IS NOT NULL
       )
    THEN
      RAISE EXCEPTION 'Shared beta runtime marker removal is invalid'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "SharedBetaRuntimeReleaseState_guard_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON public."SharedBetaRuntimeReleaseState"
FOR EACH ROW
EXECUTE FUNCTION public."shared_beta_runtime_state_guard_v1"();

CREATE FUNCTION public."shared_beta_activation_command_immutable_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Shared beta tenant activation command is immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "SharedBetaTenantActivationCommand_immutable_trigger"
BEFORE UPDATE OR DELETE ON public."SharedBetaTenantActivationCommand"
FOR EACH ROW
EXECUTE FUNCTION public."shared_beta_activation_command_immutable_v1"();

-- This is the database twin of
-- packages/database/scripts/staff-task-integrity-canonical-json.mjs.
-- Runtime-release payloads contain only JSON-safe scalar values, arrays and
-- objects. Object keys use bytewise C ordering and no insignificant
-- whitespace is emitted.
CREATE FUNCTION public."shared_beta_runtime_canonical_json_v1"(
  candidate JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  candidate_type TEXT;
  canonical_value TEXT;
BEGIN
  candidate_type := pg_catalog.jsonb_typeof(candidate);

  IF candidate_type IN ('null', 'string', 'number', 'boolean') THEN
    RETURN candidate::TEXT;
  END IF;

  IF candidate_type = 'array' THEN
    SELECT
      '[' ||
      COALESCE(
        pg_catalog.string_agg(
          public."shared_beta_runtime_canonical_json_v1"(entry.value),
          ','
          ORDER BY entry.ordinality
        ),
        ''
      ) ||
      ']'
    INTO canonical_value
    FROM pg_catalog.jsonb_array_elements(candidate)
      WITH ORDINALITY AS entry(value, ordinality);

    RETURN canonical_value;
  END IF;

  IF candidate_type = 'object' THEN
    SELECT
      '{' ||
      COALESCE(
        pg_catalog.string_agg(
          pg_catalog.to_jsonb(entry.key)::TEXT || ':' ||
            public."shared_beta_runtime_canonical_json_v1"(entry.value),
          ','
          ORDER BY entry.key COLLATE "C"
        ),
        ''
      ) ||
      '}'
    INTO canonical_value
    FROM pg_catalog.jsonb_each(candidate) AS entry(key, value);

    RETURN canonical_value;
  END IF;

  RAISE EXCEPTION 'Unsupported canonical JSON value'
    USING ERRCODE = '22023';
END;
$$;

CREATE FUNCTION public."shared_beta_runtime_digest_v1"(
  domain TEXT,
  candidate JSONB
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(domain, 'UTF8')
      || '\x00'::BYTEA
      || pg_catalog.convert_to(
        public."shared_beta_runtime_canonical_json_v1"(candidate),
        'UTF8'
      )
    ),
    'hex'
  );
$$;

CREATE FUNCTION public."shared_beta_runtime_migration_state_v1"()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH applied AS (
    SELECT
      migration."migration_name"::TEXT AS migration_name,
      migration."checksum"::TEXT AS checksum
    FROM public."_prisma_migrations" AS migration
    WHERE migration."finished_at" IS NOT NULL
      AND migration."rolled_back_at" IS NULL
  ),
  aggregate_state AS (
    SELECT
      pg_catalog.count(*)::INTEGER AS migration_count,
      pg_catalog.max(applied.migration_name) AS schema_head,
      COALESCE(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'migrationName', applied.migration_name,
            'checksum', applied.checksum
          )
          ORDER BY applied.migration_name
        ),
        '[]'::JSONB
      ) AS manifest
    FROM applied
  )
  SELECT pg_catalog.jsonb_build_object(
    'schemaHead', aggregate_state.schema_head,
    'migrationCount', aggregate_state.migration_count,
    'migrationManifestDigest',
      pg_catalog.encode(
        pg_catalog.sha256(
          COALESCE(
            (
              SELECT pg_catalog.string_agg(
                pg_catalog.convert_to(
                  applied.migration_name,
                  'UTF8'
                )
                || '\x00'::BYTEA
                || pg_catalog.convert_to(
                  applied.checksum,
                  'UTF8'
                ),
                '\x0a'::BYTEA
                ORDER BY applied.migration_name COLLATE "C"
              )
              FROM applied
            ),
            ''::BYTEA
          )
        ),
        'hex'
      ),
    'nonAppliedCount',
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."_prisma_migrations" AS migration
        WHERE migration."finished_at" IS NULL
           OR migration."rolled_back_at" IS NOT NULL
      ),
    'checksumMismatchCount',
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM applied
        WHERE applied.checksum !~ '^[0-9a-f]{64}$'
      )
  )
  FROM aggregate_state;
$$;

CREATE FUNCTION public."shared_beta_runtime_database_identity_digest_v1"(
  creation_nonce TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  database_oid OID;
  system_identifier TEXT;
  instance_anchor_nonce TEXT;
  instance_anchor_count INTEGER;
  postmaster_started_at TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  IF creation_nonce IS NULL
     OR creation_nonce !~ '^[0-9a-f]{64}$'
  THEN
    RETURN NULL;
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.min(anchor."anchorNonce"::TEXT)
  INTO
    instance_anchor_count,
    instance_anchor_nonce
  FROM public."SharedBetaRuntimeInstanceAnchor" AS anchor;

  IF instance_anchor_count <> 1
     OR instance_anchor_nonce IS NULL
     OR instance_anchor_nonce !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION
      'Shared beta runtime instance anchor is unavailable'
      USING ERRCODE = '55000';
  END IF;

  SELECT database_row.oid
  INTO database_oid
  FROM pg_catalog.pg_database AS database_row
  WHERE database_row.datname = pg_catalog.current_database();

  SELECT control.system_identifier::TEXT
  INTO system_identifier
  FROM pg_catalog.pg_control_system() AS control;

  postmaster_started_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.pg_postmaster_start_time()
  );

  IF database_oid IS NULL
     OR system_identifier IS NULL
     OR postmaster_started_at IS NULL
  THEN
    RAISE EXCEPTION
      'Shared beta database identity is unavailable'
      USING ERRCODE = '55000';
  END IF;

  RETURN pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'leetplus-shared-beta-database-identity-v2',
        'UTF8'
      )
      || '\x00'::BYTEA
      || pg_catalog.convert_to(
        public."shared_beta_runtime_canonical_json_v1"(
          pg_catalog.jsonb_build_object(
            'currentDatabase', pg_catalog.current_database(),
            'databaseOid', database_oid::TEXT,
            'systemIdentifier', system_identifier,
            'instanceAnchorNonce', instance_anchor_nonce,
            'postmasterStartedAtEpochMs',
              (
                EXTRACT(EPOCH FROM postmaster_started_at) * 1000
              )::BIGINT,
            'creationNonce', creation_nonce
          )
        ),
        'UTF8'
      )
    ),
    'hex'
  );
END;
$$;

CREATE FUNCTION public."shared_beta_build_provenance_persist_v1"(
  candidate_build_provenance_id TEXT,
  candidate_release_sha TEXT,
  candidate_build_time TEXT,
  candidate_built_at TIMESTAMP(3) WITH TIME ZONE,
  candidate_artifact_content_digest TEXT,
  candidate_release_manifest_digest TEXT,
  candidate_schema_head TEXT,
  candidate_migration_count INTEGER,
  candidate_migration_manifest_digest TEXT,
  candidate_policy_manifest_digest TEXT,
  candidate_trial_policy_version TEXT,
  candidate_trial_duration_seconds INTEGER,
  candidate_build_reference_digest TEXT,
  candidate_payload JSONB,
  candidate_payload_digest TEXT,
  candidate_signature_algorithm TEXT,
  candidate_signing_key_id TEXT,
  candidate_public_key_fingerprint TEXT,
  candidate_signature_base64url TEXT,
  candidate_valid_until TIMESTAMP(3) WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  build_id TEXT;
  release_sha TEXT;
  build_time TEXT;
  artifact_digest TEXT;
  release_manifest_digest TEXT;
  schema_head TEXT;
  migration_manifest_digest TEXT;
  policy_manifest_digest TEXT;
  trial_policy_version TEXT;
  build_reference_digest TEXT;
  payload_digest TEXT;
  signing_key_id TEXT;
  key_fingerprint TEXT;
  signature_base64url TEXT;
  actual_payload_digest TEXT;
  written_at TIMESTAMP(3) WITH TIME ZONE;
  persisted public."SharedBetaBuildProvenance"%ROWTYPE;
BEGIN
  build_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_build_provenance_id) COLLATE "C"
  );
  release_sha := pg_catalog.btrim(candidate_release_sha);
  build_time := pg_catalog.btrim(candidate_build_time);
  artifact_digest := pg_catalog.btrim(
    candidate_artifact_content_digest
  );
  release_manifest_digest := pg_catalog.btrim(
    candidate_release_manifest_digest
  );
  schema_head := pg_catalog.btrim(candidate_schema_head);
  migration_manifest_digest := pg_catalog.btrim(
    candidate_migration_manifest_digest
  );
  policy_manifest_digest := pg_catalog.btrim(
    candidate_policy_manifest_digest
  );
  trial_policy_version := pg_catalog.btrim(
    candidate_trial_policy_version
  );
  build_reference_digest := pg_catalog.btrim(
    candidate_build_reference_digest
  );
  payload_digest := pg_catalog.btrim(candidate_payload_digest);
  signing_key_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_signing_key_id) COLLATE "C"
  );
  key_fingerprint := pg_catalog.btrim(
    candidate_public_key_fingerprint
  );
  signature_base64url := pg_catalog.btrim(
    candidate_signature_base64url
  );
  written_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  actual_payload_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        public."shared_beta_runtime_canonical_json_v1"(
          candidate_payload
        ),
        'UTF8'
      )
    ),
    'hex'
  );

  IF build_id IS NULL
     OR candidate_build_provenance_id IS DISTINCT FROM build_id
     OR build_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR release_sha !~ '^[0-9a-f]{40}$'
     OR artifact_digest !~ '^[0-9a-f]{64}$'
     OR release_manifest_digest !~ '^[0-9a-f]{64}$'
     OR schema_head !~ '^[0-9]{14}_[a-z0-9_]{1,100}$'
     OR candidate_migration_count < 174
     OR migration_manifest_digest !~ '^[0-9a-f]{64}$'
     OR policy_manifest_digest !~ '^[0-9a-f]{64}$'
     OR trial_policy_version <> 'SHARED_BETA_TRIAL_V1'
     OR candidate_trial_duration_seconds NOT BETWEEN 3600 AND 7776000
     OR build_reference_digest !~ '^[0-9a-f]{64}$'
     OR candidate_payload IS NULL
     OR pg_catalog.jsonb_typeof(candidate_payload) <> 'object'
     OR payload_digest !~ '^[0-9a-f]{64}$'
     OR payload_digest IS DISTINCT FROM actual_payload_digest
     OR candidate_signature_algorithm <> 'Ed25519'
     OR signing_key_id !~ '^[a-z0-9][a-z0-9._-]{2,63}$'
     OR key_fingerprint !~ '^[0-9a-f]{64}$'
     OR signature_base64url !~ '^[A-Za-z0-9_-]{86}$'
     OR candidate_built_at IS NULL
     OR candidate_built_at IS DISTINCT FROM
       pg_catalog.date_trunc('milliseconds', candidate_built_at)
     OR build_time !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     OR build_time::TIMESTAMP(3) WITH TIME ZONE IS DISTINCT FROM
       candidate_built_at
     OR candidate_built_at > written_at + INTERVAL '5 minutes'
     OR candidate_valid_until <= written_at
     OR candidate_valid_until <= candidate_built_at
     OR candidate_valid_until >
       candidate_built_at + INTERVAL '7 days'
     OR candidate_valid_until IS DISTINCT FROM
       pg_catalog.date_trunc('milliseconds', candidate_valid_until)
  THEN
    RAISE EXCEPTION 'Shared beta build provenance input is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT build.*
  INTO persisted
  FROM public."SharedBetaBuildProvenance" AS build
  WHERE build."id" = build_id
  FOR UPDATE;

  IF FOUND THEN
    IF persisted."stateRevision" <> 1
       OR persisted."revokedAt" IS NOT NULL
       OR persisted."validUntil" <= written_at
       OR persisted."authorityDomain" IS DISTINCT FROM
         'SHARED_BETA_BUILD'
       OR persisted."contractVersion" IS DISTINCT FROM
         'SHARED_BETA_BUILD_PROVENANCE_V1'
       OR persisted."releaseSha"::TEXT IS DISTINCT FROM release_sha
       OR persisted."buildTime" IS DISTINCT FROM build_time
       OR persisted."builtAt" IS DISTINCT FROM candidate_built_at
       OR persisted."artifactContentDigest"::TEXT IS DISTINCT FROM
         artifact_digest
       OR persisted."releaseManifestDigest"::TEXT IS DISTINCT FROM
         release_manifest_digest
       OR persisted."schemaHead"::TEXT IS DISTINCT FROM schema_head
       OR persisted."migrationCount" IS DISTINCT FROM
         candidate_migration_count
       OR persisted."migrationManifestDigest"::TEXT IS DISTINCT FROM
         migration_manifest_digest
       OR persisted."policyManifestDigest"::TEXT IS DISTINCT FROM
         policy_manifest_digest
       OR persisted."trialPolicyVersion"::TEXT IS DISTINCT FROM
         trial_policy_version
       OR persisted."trialDurationSeconds" IS DISTINCT FROM
         candidate_trial_duration_seconds
       OR persisted."buildReferenceDigest"::TEXT IS DISTINCT FROM
         build_reference_digest
       OR persisted."payloadDigest" IS DISTINCT FROM payload_digest
       OR persisted."payload" IS DISTINCT FROM candidate_payload
       OR persisted."signatureAlgorithm"::TEXT IS DISTINCT FROM
         candidate_signature_algorithm
       OR persisted."signingKeyId"::TEXT IS DISTINCT FROM signing_key_id
       OR persisted."publicKeyFingerprint"::TEXT IS DISTINCT FROM
         key_fingerprint
       OR persisted."signatureBase64url" IS DISTINCT FROM
         signature_base64url
       OR persisted."validUntil" IS DISTINCT FROM candidate_valid_until
    THEN
      RAISE EXCEPTION 'Shared beta build provenance replay conflicts'
        USING ERRCODE = '23505';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'PERSIST_SHARED_BETA_BUILD_PROVENANCE',
      'decision', 'REPLAYED',
      'buildProvenanceId', persisted."id",
      'payloadDigest', persisted."payloadDigest",
      'stateRevision', persisted."stateRevision"
    );
  END IF;

  INSERT INTO public."SharedBetaBuildProvenance" (
    "id",
    "releaseSha",
    "buildTime",
    "builtAt",
    "artifactContentDigest",
    "releaseManifestDigest",
    "schemaHead",
    "migrationCount",
    "migrationManifestDigest",
    "policyManifestDigest",
    "trialPolicyVersion",
    "trialDurationSeconds",
    "buildReferenceDigest",
    "payload",
    "payloadDigest",
    "signatureAlgorithm",
    "signingKeyId",
    "publicKeyFingerprint",
    "signatureBase64url",
    "validUntil",
    "createdAt"
  )
  VALUES (
    build_id,
    release_sha,
    build_time,
    candidate_built_at,
    artifact_digest,
    release_manifest_digest,
    schema_head,
    candidate_migration_count,
    migration_manifest_digest,
    policy_manifest_digest,
    trial_policy_version,
    candidate_trial_duration_seconds,
    build_reference_digest,
    candidate_payload,
    payload_digest,
    'Ed25519',
    signing_key_id,
    key_fingerprint,
    signature_base64url,
    candidate_valid_until,
    written_at
  )
  RETURNING *
  INTO persisted;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'PERSIST_SHARED_BETA_BUILD_PROVENANCE',
    'decision', 'CREATED',
    'buildProvenanceId', persisted."id",
    'payloadDigest', persisted."payloadDigest",
    'stateRevision', persisted."stateRevision"
  );
END;
$$;

CREATE FUNCTION public."shared_beta_runtime_actual_context_assert_v1"(
  expected_marker_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  marker_id TEXT;
  session_role_oid BIGINT;
  migration_state JSONB;
  actual_database_identity_digest TEXT;
  actual_context_digest TEXT;
  actual_build_payload_digest TEXT;
  actual_marker_payload_digest TEXT;
  asserted_at TIMESTAMP(3) WITH TIME ZONE;
  state_record public."SharedBetaRuntimeReleaseState"%ROWTYPE;
  marker_record public."SharedBetaRuntimeReleaseMarker"%ROWTYPE;
  build_record public."SharedBetaBuildProvenance"%ROWTYPE;
  challenge_record public."SharedBetaRuntimeReleaseChallenge"%ROWTYPE;
BEGIN
  marker_id := pg_catalog.lower(
    pg_catalog.btrim(expected_marker_id) COLLATE "C"
  );
  asserted_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  IF marker_id IS NULL
     OR expected_marker_id IS DISTINCT FROM marker_id
     OR marker_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Shared beta runtime context input is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT state.*
  INTO state_record
  FROM public."SharedBetaRuntimeReleaseState" AS state
  WHERE state."id" = 'SHARED_BETA_RUNTIME_RELEASE'
  FOR SHARE;

  IF NOT FOUND OR state_record."currentMarkerId" IS DISTINCT FROM marker_id THEN
    RAISE EXCEPTION 'Shared beta runtime marker is not current'
      USING ERRCODE = '23514';
  END IF;

  SELECT marker.*
  INTO marker_record
  FROM public."SharedBetaRuntimeReleaseMarker" AS marker
  WHERE marker."id" = marker_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared beta runtime marker is missing'
      USING ERRCODE = '23514';
  END IF;

  SELECT build.*
  INTO build_record
  FROM public."SharedBetaBuildProvenance" AS build
  WHERE build."id" = marker_record."buildProvenanceId"
  FOR SHARE;

  SELECT challenge.*
  INTO challenge_record
  FROM public."SharedBetaRuntimeReleaseChallenge" AS challenge
  WHERE challenge."id" = marker_record."challengeId"
  FOR SHARE;

  SELECT role.oid::BIGINT
  INTO session_role_oid
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = session_user;

  IF build_record."id" IS NULL
     OR challenge_record."id" IS NULL
     OR marker_record."stateRevision" <> 1
     OR marker_record."revokedAt" IS NOT NULL
     OR marker_record."validUntil" <= asserted_at
     OR build_record."stateRevision" <> 1
     OR build_record."revokedAt" IS NOT NULL
     OR build_record."validUntil" <= asserted_at
     OR marker_record."generation" IS DISTINCT FROM
       state_record."generation"
     OR marker_record."buildPayloadDigest" IS DISTINCT FROM
       build_record."payloadDigest"
     OR marker_record."databaseChallengeDigest" IS DISTINCT FROM
       challenge_record."challengeDigest"
     OR marker_record."databaseIdentityDigest" IS DISTINCT FROM
       challenge_record."databaseIdentityDigest"
     OR marker_record."actualContextDigest" IS DISTINCT FROM
       challenge_record."actualContextDigest"
     OR challenge_record."stateRevision" <> 2
     OR challenge_record."consumedAt" IS DISTINCT FROM
       marker_record."createdAt"
     OR marker_record."activationDatabaseRole" IS DISTINCT FROM
       session_user::TEXT
     OR marker_record."coordinatorRoleName" IS DISTINCT FROM
       session_user::TEXT
     OR marker_record."coordinatorRoleOid" IS DISTINCT FROM
       session_role_oid
  THEN
    RAISE EXCEPTION 'Shared beta runtime context binding is invalid'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public."shared_beta_runtime_activation_role_assert_v1"(
    marker_record."coordinatorRoleName",
    marker_record."coordinatorRoleOid"
  );

  IF pg_catalog.pg_is_in_recovery() THEN
    RAISE EXCEPTION 'Shared beta activation is denied in recovery'
      USING ERRCODE = '25006';
  END IF;

  migration_state :=
    public."shared_beta_runtime_migration_state_v1"();
  actual_database_identity_digest :=
    public."shared_beta_runtime_database_identity_digest_v1"(
      challenge_record."creationNonce"
    );
  actual_context_digest :=
    public."shared_beta_runtime_actual_context_from_challenge_v1"(
      challenge_record."id"
    );
  actual_build_payload_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        public."shared_beta_runtime_canonical_json_v1"(
          build_record."payload"
        ),
        'UTF8'
      )
    ),
    'hex'
  );
  actual_marker_payload_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        public."shared_beta_runtime_canonical_json_v1"(
          marker_record."payload"
        ),
        'UTF8'
      )
    ),
    'hex'
  );

  IF (migration_state ->> 'nonAppliedCount')::INTEGER <> 0
     OR (migration_state ->> 'checksumMismatchCount')::INTEGER <> 0
     OR migration_state ->> 'schemaHead' IS DISTINCT FROM
       marker_record."schemaHead"
     OR (migration_state ->> 'migrationCount')::INTEGER IS DISTINCT FROM
       marker_record."migrationCount"
     OR migration_state ->> 'migrationManifestDigest' IS DISTINCT FROM
       marker_record."migrationManifestDigest"
     OR marker_record."schemaHead" IS DISTINCT FROM
       build_record."schemaHead"
     OR marker_record."migrationCount" IS DISTINCT FROM
       build_record."migrationCount"
     OR marker_record."migrationManifestDigest" IS DISTINCT FROM
       build_record."migrationManifestDigest"
     OR actual_database_identity_digest IS DISTINCT FROM
       marker_record."databaseIdentityDigest"
     OR actual_context_digest IS DISTINCT FROM
       marker_record."actualContextDigest"
     OR actual_build_payload_digest IS DISTINCT FROM
       build_record."payloadDigest"
     OR actual_marker_payload_digest IS DISTINCT FROM
       marker_record."payloadDigest"
  THEN
    RAISE EXCEPTION 'Shared beta runtime actual context drifted'
      USING ERRCODE = '23514';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'ASSERT_SHARED_BETA_RUNTIME_CONTEXT',
    'decision', 'ASSERTED',
    'markerId', marker_record."id",
    'markerPayloadDigest', marker_record."payloadDigest",
    'markerGeneration', marker_record."generation",
    'buildProvenanceId', build_record."id",
    'buildPayloadDigest', build_record."payloadDigest",
    'actualContextDigest', actual_context_digest,
    'releaseSha', build_record."releaseSha",
    'artifactContentDigest', build_record."artifactContentDigest",
    'schemaHead', marker_record."schemaHead",
    'migrationCount', marker_record."migrationCount",
    'policyManifestDigest', build_record."policyManifestDigest",
    'databaseIdentityDigest', marker_record."databaseIdentityDigest",
    'environment', marker_record."environment",
    'trialPolicyVersion', build_record."trialPolicyVersion",
    'trialDurationSeconds', build_record."trialDurationSeconds"
  );
END;
$$;

CREATE OR REPLACE FUNCTION
  public."shared_beta_tenant_admission_decision_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Tenant admission decision history is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF (
       pg_catalog.to_jsonb(OLD)
         - ARRAY[
             'stateRevision',
             'revokedAt',
             'revocationReasonDigest',
             'consumedAt'
           ]::TEXT[]
     ) IS DISTINCT FROM (
       pg_catalog.to_jsonb(NEW)
         - ARRAY[
             'stateRevision',
             'revokedAt',
             'revocationReasonDigest',
             'consumedAt'
           ]::TEXT[]
     )
     OR OLD."stateRevision" <> 1
     OR OLD."revokedAt" IS NOT NULL
     OR OLD."revocationReasonDigest" IS NOT NULL
     OR OLD."consumedAt" IS NOT NULL
     OR NEW."stateRevision" <> 2
     OR NOT (
       (
         NEW."revokedAt" IS NOT NULL
         AND NEW."revocationReasonDigest" IS NOT NULL
         AND NEW."consumedAt" IS NULL
       )
       OR (
         NEW."revokedAt" IS NULL
         AND NEW."revocationReasonDigest" IS NULL
         AND NEW."consumedAt" IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public."SharedBetaTenantActivationCommand" AS command
           WHERE command."tenantId" = OLD."tenantId"
             AND command."decisionId" = OLD."id"
             AND command."activatedAt" = NEW."consumedAt"
             AND command."createdTransactionId" =
               pg_catalog.pg_current_xact_id()::TEXT
         )
       )
     )
  THEN
    RAISE EXCEPTION 'Tenant admission decision transition is invalid'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER "IdentityMailOutbox_hold_immutable_trigger"
ON public."IdentityMailOutbox";

DROP FUNCTION public."identity_mail_outbox_hold_immutable_v1"();

CREATE FUNCTION public."identity_mail_outbox_release_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (
       pg_catalog.to_jsonb(OLD)
         - ARRAY['status', 'releasedAt']::TEXT[]
     ) IS DISTINCT FROM (
       pg_catalog.to_jsonb(NEW)
         - ARRAY['status', 'releasedAt']::TEXT[]
     )
     OR OLD."status" IS DISTINCT FROM
       'HOLD'::public."IdentityMailOutboxStatus"
     OR OLD."releasedAt" IS NOT NULL
     OR NEW."status" IS DISTINCT FROM
       'PENDING'::public."IdentityMailOutboxStatus"
     OR NEW."releasedAt" IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public."SharedBetaTenantActivationCommand" AS command
       WHERE command."tenantId" = OLD."tenantId"
         AND command."outboxId" = OLD."id"
         AND command."issueCommandId" = OLD."issueCommandId"
         AND command."inviteId" = OLD."inviteId"
         AND command."workflowLocator" = OLD."workflowLocator"
         AND command."issueRequestDigest" = OLD."issueRequestDigest"
         AND command."tokenHash" = OLD."tokenHash"
         AND command."activatedAt" = NEW."releasedAt"
         AND command."createdTransactionId" =
           pg_catalog.pg_current_xact_id()::TEXT
     )
  THEN
    RAISE EXCEPTION 'Identity mail outbox transition is invalid'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "IdentityMailOutbox_release_guard_trigger"
BEFORE UPDATE OR DELETE ON public."IdentityMailOutbox"
FOR EACH ROW
EXECUTE FUNCTION public."identity_mail_outbox_release_guard_v1"();

CREATE FUNCTION public."shared_beta_tenant_activation_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD."customerStage" =
       'PILOT'::public."TenantCustomerStage"
     AND OLD."status" =
       'SUSPENDED'::public."TenantLifecycleStatus"
     AND OLD."onboardingStatus" =
       'PROVISIONING'::public."TenantOnboardingStatus"
     AND OLD."trialStartsAt" IS NULL
     AND OLD."trialEndsAt" IS NULL
     AND (
       NEW."customerStage" IS DISTINCT FROM OLD."customerStage"
       OR NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."onboardingStatus" IS DISTINCT FROM
         OLD."onboardingStatus"
       OR NEW."trialStartsAt" IS DISTINCT FROM OLD."trialStartsAt"
       OR NEW."trialEndsAt" IS DISTINCT FROM OLD."trialEndsAt"
       OR NEW."entitlementProfileRevision" IS DISTINCT FROM
         OLD."entitlementProfileRevision"
       OR NEW."executionRevision" IS DISTINCT FROM
         OLD."executionRevision"
       OR NEW."statusChangedAt" IS DISTINCT FROM
         OLD."statusChangedAt"
       OR NEW."statusReason" IS DISTINCT FROM OLD."statusReason"
     )
     AND (
       NEW."status" IS DISTINCT FROM
         'ACTIVE'::public."TenantLifecycleStatus"
       OR NEW."customerStage" IS DISTINCT FROM
         'PILOT'::public."TenantCustomerStage"
       OR NEW."onboardingStatus" IS DISTINCT FROM
         'OWNER_INVITED'::public."TenantOnboardingStatus"
       OR NEW."trialStartsAt" IS NULL
       OR NEW."trialEndsAt" IS NULL
       OR NEW."trialEndsAt" <= NEW."trialStartsAt"
       OR NEW."entitlementProfileRevision" IS DISTINCT FROM
         OLD."entitlementProfileRevision"
       OR NEW."executionRevision" IS DISTINCT FROM
         OLD."executionRevision" + 1
       OR NOT EXISTS (
         SELECT 1
         FROM public."SharedBetaTenantActivationCommand" AS command
         WHERE command."tenantId" = OLD."id"
           AND command."trialStartsAt" = NEW."trialStartsAt"
           AND command."trialEndsAt" = NEW."trialEndsAt"
           AND command."executionRevisionBefore" =
             OLD."executionRevision"
           AND command."executionRevisionAfter" =
             NEW."executionRevision"
           AND command."activatedAt" = NEW."trialStartsAt"
           AND NEW."statusChangedAt" =
             command."activatedAt" AT TIME ZONE 'UTC'
           AND NEW."statusReason" =
             'Shared beta activation ' || command."id"
           AND command."createdTransactionId" =
             pg_catalog.pg_current_xact_id()::TEXT
       )
     )
  THEN
    RAISE EXCEPTION 'Tenant shared beta activation transition is invalid'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Tenant_shared_beta_activation_guard_trigger"
BEFORE UPDATE ON public."Tenant"
FOR EACH ROW
EXECUTE FUNCTION public."shared_beta_tenant_activation_guard_v1"();

CREATE FUNCTION public."shared_beta_activation_audit_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD."action" = 'SHARED_BETA_TENANT_ACTIVATED'
     OR (
       TG_OP = 'UPDATE'
       AND NEW."action" = 'SHARED_BETA_TENANT_ACTIVATED'
     )
  THEN
    RAISE EXCEPTION 'Shared beta activation audit is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "PlatformAdminAuditEvent_shared_beta_activation_guard_trigger"
BEFORE UPDATE OR DELETE ON public."PlatformAdminAuditEvent"
FOR EACH ROW
EXECUTE FUNCTION public."shared_beta_activation_audit_guard_v1"();

CREATE FUNCTION public."shared_beta_tenant_actual_shell_v1"(
  expected_tenant_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  uuid_pattern CONSTANT TEXT :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  shell_profile_version CONSTANT TEXT :=
    'SHARED_MULTI_TENANT_BETA_SHELL_V1';
  provision_action CONSTANT TEXT :=
    'SHARED_BETA_TENANT_SHELL_PROVISIONED';
  issue_action CONSTANT TEXT := 'ISSUE_INITIAL_OWNER_INVITE';
  expected_capability_digest CONSTANT TEXT :=
    'ebb460b8773b7fb5ee0cfbbc7cceab98113ac1c7296c679352fd72c71f6d3281';
  expected_capabilities CONSTANT TEXT[] := ARRAY[
    'approve_guest_game_rewards',
    'edit_catalog',
    'edit_products',
    'edit_staff_knowledge',
    'edit_stores',
    'export_reports',
    'import_data',
    'import_guest_foundation',
    'manage_assortment_reports',
    'manage_communications',
    'manage_guest_game_rules',
    'manage_integrations',
    'manage_staff_control',
    'manage_staff_directory',
    'manage_staff_salary',
    'manage_staff_standards',
    'manage_staff_tasks',
    'manage_staff_training',
    'manage_users',
    'operate_guest_game_ledger',
    'publish_staff_knowledge',
    'review_staff_knowledge',
    'run_sync',
    'use_utilities',
    'view_assortment_catalog',
    'view_assortment_products',
    'view_assortment_reports',
    'view_assortment_stores',
    'view_communications',
    'view_dashboard',
    'view_guest_gamification',
    'view_reports',
    'view_staff',
    'view_staff_control',
    'view_staff_directory',
    'view_staff_knowledge',
    'view_staff_salary',
    'view_staff_shift_workspace',
    'view_staff_standards',
    'view_staff_tasks',
    'view_staff_training'
  ]::TEXT[];
  expected_modules CONSTANT TEXT[] := ARRAY[
    'ASSORTMENT',
    'COMMUNICATIONS',
    'GAMIFICATION',
    'INTEGRATIONS',
    'STAFF',
    'USERS_ROLES'
  ]::TEXT[];
  tenant_id TEXT;
  tenant_record RECORD;
  store_record RECORD;
  override_record RECORD;
  audit_record RECORD;
  invite_record RECORD;
  outbox_record RECORD;
  issue_command_record
    public."IdentityOwnerInviteIssueCommand"%ROWTYPE;
  store_count INTEGER;
  tenant_user_count INTEGER;
  custom_role_count INTEGER;
  integration_credential_count INTEGER;
  integration_source_count INTEGER;
  override_count INTEGER;
  audit_count INTEGER;
  entitlement_count INTEGER;
  valid_entitlement_count INTEGER;
  identity_claim_count INTEGER;
  issue_command_count INTEGER;
  invite_count INTEGER;
  outbox_count INTEGER;
  issue_audit_count INTEGER;
  valid_issue_audit_count INTEGER;
  actual_capability_count INTEGER;
  distinct_capability_count INTEGER;
  actual_capabilities TEXT[];
  actual_modules TEXT[];
  capability_digest TEXT;
  profile_digest TEXT;
  actual_shell_digest TEXT;
  entitlements_json JSONB;
  expected_receipt JSONB;
  expected_metadata JSONB;
  shell_evidence JSONB;
  issue_receipt JSONB;
  provision_execution_revision INTEGER;
  workflow_locator TEXT;
  reservation_subject_id TEXT;
  reservation_claim_revision INTEGER := 1;
  claim_type TEXT;
  claim_tenant_id TEXT;
  claim_subject_id TEXT;
  claim_workflow_locator TEXT;
  claim_revision INTEGER;
  checked_at TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  tenant_id := pg_catalog.lower(
    pg_catalog.btrim(expected_tenant_id) COLLATE "C"
  );

  IF tenant_id IS NULL
     OR expected_tenant_id IS DISTINCT FROM tenant_id
     OR (tenant_id COLLATE "C") !~ uuid_pattern
  THEN
    RAISE EXCEPTION 'Shared beta tenant shell input is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    tenant."id" AS tenant_id,
    tenant."name" AS tenant_name,
    tenant."slug" AS tenant_slug,
    tenant."domain" AS tenant_domain,
    tenant."gameLogoUrl" AS game_logo_url,
    tenant."status"::TEXT AS lifecycle_status,
    tenant."customerStage"::TEXT AS customer_stage,
    tenant."onboardingStatus"::TEXT AS onboarding_status,
    tenant."cohortKey" AS cohort_key,
    tenant."supportOwnerUserId" AS support_owner_user_id,
    tenant."trialStartsAt" AS trial_starts_at,
    tenant."trialEndsAt" AS trial_ends_at,
    tenant."entitlementProfileRevision" AS profile_revision,
    tenant."executionRevision" AS execution_revision,
    tenant."statusChangedAt" AS status_changed_at,
    tenant."statusReason" AS status_reason,
    tenant."createdAt" AS created_at
  INTO tenant_record
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = tenant_id
  FOR NO KEY UPDATE;

  IF NOT FOUND
     OR tenant_record.lifecycle_status <> 'SUSPENDED'
     OR tenant_record.customer_stage <> 'PILOT'
     OR tenant_record.onboarding_status <> 'PROVISIONING'
     OR tenant_record.trial_starts_at IS NOT NULL
     OR tenant_record.trial_ends_at IS NOT NULL
     OR tenant_record.profile_revision <> 1
     OR tenant_record.execution_revision < 0
     OR tenant_record.tenant_domain IS NOT NULL
     OR tenant_record.game_logo_url IS NOT NULL
     OR tenant_record.cohort_key IS NULL
     OR pg_catalog.btrim(tenant_record.cohort_key) IS DISTINCT FROM
       tenant_record.cohort_key
     OR pg_catalog.char_length(tenant_record.cohort_key) NOT BETWEEN 3 AND 100
     OR tenant_record.support_owner_user_id IS NULL
     OR tenant_record.status_changed_at IS NULL
     OR tenant_record.status_reason IS NULL
     OR pg_catalog.btrim(tenant_record.status_reason) = ''
     OR pg_catalog.btrim(tenant_record.tenant_name) IS DISTINCT FROM
       tenant_record.tenant_name
     OR pg_catalog.char_length(tenant_record.tenant_name) NOT BETWEEN 2 AND 120
     OR tenant_record.tenant_slug IS DISTINCT FROM
       pg_catalog.lower(tenant_record.tenant_slug COLLATE "C")
     OR (tenant_record.tenant_slug COLLATE "C") !~
       '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  THEN
    RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
      USING ERRCODE = '23514';
  END IF;

  PERFORM store."id"
  FROM public."Store" AS store
  WHERE store."tenantId" = tenant_id
  ORDER BY store."id" COLLATE "C"
  FOR UPDATE;

  SELECT pg_catalog.count(*)::INTEGER
  INTO store_count
  FROM public."Store" AS store
  WHERE store."tenantId" = tenant_id;

  SELECT
    store."id" AS store_id,
    store."name" AS store_name,
    store."publicSlug" AS public_slug,
    store."timeZone" AS time_zone,
    store."isActive" AS is_active,
    store."gamificationEnabled" AS gamification_enabled,
    store."backgroundExecutionEnabled" AS background_execution_enabled,
    store."executionRevision" AS execution_revision,
    store."externalProvider"::TEXT AS external_provider,
    store."externalDomain" AS external_domain,
    store."externalClubId" AS external_club_id,
    store."integrationSourceId" AS integration_source_id,
    store."computerCount" AS computer_count,
    store."computerCountSyncedAt" AS computer_count_synced_at,
    store."createdAt" AS created_at
  INTO store_record
  FROM public."Store" AS store
  WHERE store."tenantId" = tenant_id;

  IF store_count <> 1
     OR NOT FOUND
     OR store_record.is_active
     OR store_record.gamification_enabled
     OR store_record.background_execution_enabled
     OR store_record.execution_revision <> 0
     OR store_record.external_provider IS NOT NULL
     OR store_record.external_domain IS NOT NULL
     OR store_record.external_club_id IS NOT NULL
     OR store_record.integration_source_id IS NOT NULL
     OR store_record.computer_count IS NOT NULL
     OR store_record.computer_count_synced_at IS NOT NULL
     OR store_record.public_slug IS DISTINCT FROM
       tenant_record.tenant_slug || '-main'
     OR store_record.time_zone IS NULL
     OR pg_catalog.btrim(store_record.time_zone) IS DISTINCT FROM
       store_record.time_zone
     OR pg_catalog.char_length(store_record.time_zone) NOT BETWEEN 1 AND 100
     OR pg_catalog.btrim(store_record.store_name) IS DISTINCT FROM
       store_record.store_name
     OR pg_catalog.char_length(store_record.store_name) NOT BETWEEN 2 AND 120
  THEN
    RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
      USING ERRCODE = '23514';
  END IF;

  PERFORM credential."id"
  FROM public."IntegrationCredential" AS credential
  WHERE credential."tenantId" = tenant_id
  ORDER BY credential."id" COLLATE "C"
  FOR UPDATE;

  SELECT pg_catalog.count(*)::INTEGER
  INTO integration_credential_count
  FROM public."IntegrationCredential" AS credential
  WHERE credential."tenantId" = tenant_id;

  PERFORM source."id"
  FROM public."IntegrationSource" AS source
  WHERE source."tenantId" = tenant_id
  ORDER BY source."id" COLLATE "C"
  FOR UPDATE;

  SELECT pg_catalog.count(*)::INTEGER
  INTO integration_source_count
  FROM public."IntegrationSource" AS source
  WHERE source."tenantId" = tenant_id;

  IF integration_credential_count <> 0
     OR integration_source_count <> 0
  THEN
    RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
      USING ERRCODE = '23514';
  END IF;

  PERFORM tenant_user."id"
  FROM public."User" AS tenant_user
  WHERE tenant_user."tenantId" = tenant_id
  ORDER BY tenant_user."id" COLLATE "C"
  FOR SHARE;

  SELECT pg_catalog.count(*)::INTEGER
  INTO tenant_user_count
  FROM public."User" AS tenant_user
  WHERE tenant_user."tenantId" = tenant_id;

  PERFORM custom_role."id"
  FROM public."UserAccessRole" AS custom_role
  WHERE custom_role."tenantId" = tenant_id
  ORDER BY custom_role."id" COLLATE "C"
  FOR UPDATE;

  SELECT pg_catalog.count(*)::INTEGER
  INTO custom_role_count
  FROM public."UserAccessRole" AS custom_role
  WHERE custom_role."tenantId" = tenant_id;

  IF tenant_user_count <> 0 OR custom_role_count <> 0 THEN
    RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
      USING ERRCODE = '23514';
  END IF;

  PERFORM role_override."id"
  FROM public."UserRoleOverride" AS role_override
  WHERE role_override."tenantId" = tenant_id
  ORDER BY role_override."role"::TEXT, role_override."id" COLLATE "C"
  FOR UPDATE;

  SELECT pg_catalog.count(*)::INTEGER
  INTO override_count
  FROM public."UserRoleOverride" AS role_override
  WHERE role_override."tenantId" = tenant_id;

  SELECT
    role_override."id" AS override_id,
    role_override."role"::TEXT AS role_name,
    role_override."permissions" AS permissions
  INTO override_record
  FROM public."UserRoleOverride" AS role_override
  WHERE role_override."tenantId" = tenant_id;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(
      DISTINCT capability.value COLLATE "C"
    )::INTEGER,
    pg_catalog.array_agg(
      capability.value
      ORDER BY capability.value COLLATE "C"
    )
  INTO
    actual_capability_count,
    distinct_capability_count,
    actual_capabilities
  FROM pg_catalog.unnest(override_record.permissions)
    AS capability(value);

  IF override_count <> 1
     OR override_record.role_name <> 'OWNER'
     OR actual_capability_count <> 41
     OR distinct_capability_count <> 41
     OR actual_capabilities IS DISTINCT FROM expected_capabilities
  THEN
    RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
      USING ERRCODE = '23514';
  END IF;

  capability_digest :=
    public."shared_beta_runtime_digest_v1"(
      'leetplus-shared-beta-owner-capabilities-v1',
      pg_catalog.to_jsonb(actual_capabilities)
    );

  IF capability_digest IS DISTINCT FROM expected_capability_digest THEN
    RAISE EXCEPTION 'Shared beta capability contract drifted'
      USING ERRCODE = '23514';
  END IF;

  PERFORM audit."id"
  FROM public."PlatformAdminAuditEvent" AS audit
  WHERE audit."tenantId" = tenant_id
    AND audit."action" = provision_action
  ORDER BY audit."id" COLLATE "C"
  FOR SHARE;

  SELECT pg_catalog.count(*)::INTEGER
  INTO audit_count
  FROM public."PlatformAdminAuditEvent" AS audit
  WHERE audit."tenantId" = tenant_id
    AND audit."action" = provision_action;

  SELECT
    audit."id" AS audit_id,
    audit."actorUserId" AS actor_user_id,
    audit."requestId" AS request_id,
    audit."targetType" AS target_type,
    audit."targetId" AS target_id,
    audit."reason" AS reason,
    audit."before" AS before_json,
    audit."after" AS after_json,
    audit."metadata" AS metadata_json,
    audit."createdAt" AS created_at
  INTO audit_record
  FROM public."PlatformAdminAuditEvent" AS audit
  WHERE audit."tenantId" = tenant_id
    AND audit."action" = provision_action;

  IF audit_count <> 1
     OR NOT FOUND
     OR audit_record.actor_user_id IS NULL
     OR audit_record.request_id IS NULL
     OR audit_record.target_type <> 'TENANT'
     OR audit_record.target_id IS DISTINCT FROM tenant_id
     OR audit_record.reason IS NULL
     OR pg_catalog.btrim(audit_record.reason) IS DISTINCT FROM
       audit_record.reason
     OR audit_record.before_json IS DISTINCT FROM 'null'::JSONB
     OR pg_catalog.jsonb_typeof(audit_record.after_json) <> 'object'
     OR pg_catalog.jsonb_typeof(audit_record.metadata_json) <> 'object'
     OR audit_record.created_at < tenant_record.created_at
     OR audit_record.created_at < store_record.created_at
  THEN
    RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
      USING ERRCODE = '23514';
  END IF;

  workflow_locator := pg_catalog.lower(
    pg_catalog.btrim(
      audit_record.after_json #>> '{ownerIdentity,reservationId}'
    ) COLLATE "C"
  );
  reservation_subject_id := workflow_locator;

  IF workflow_locator IS NULL
     OR (workflow_locator COLLATE "C") !~ uuid_pattern
     OR workflow_locator = tenant_id
     OR workflow_locator = store_record.store_id
     OR audit_record.after_json #>> '{ownerIdentity,claimRevision}' <> '1'
     OR NOT (audit_record.metadata_json ? 'supportTicket')
     OR pg_catalog.jsonb_typeof(
       audit_record.metadata_json->'requestDigest'
     ) IS DISTINCT FROM 'string'
     OR (
       audit_record.metadata_json->>'requestDigest' COLLATE "C"
     ) !~ '^[0-9a-f]{64}$'
     OR pg_catalog.jsonb_typeof(
       audit_record.metadata_json->'ownerEmailFingerprint'
     ) IS DISTINCT FROM 'string'
     OR (
       audit_record.metadata_json->>'ownerEmailFingerprint' COLLATE "C"
     ) !~ '^[0-9a-f]{64}$'
     OR pg_catalog.jsonb_typeof(
       audit_record.metadata_json->'executionRevision'
     ) IS DISTINCT FROM 'number'
     OR (
       audit_record.metadata_json->>'executionRevision'
     ) !~ '^(0|[1-9][0-9]*)$'
  THEN
    RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
      USING ERRCODE = '23514';
  END IF;

  BEGIN
    provision_execution_revision :=
      (audit_record.metadata_json->>'executionRevision')::INTEGER;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
        USING ERRCODE = '23514';
  END;

  IF provision_execution_revision <> 0
     OR tenant_record.execution_revision <>
       provision_execution_revision
     OR (
       audit_record.metadata_json->'supportTicket' <> 'null'::JSONB
       AND (
         pg_catalog.jsonb_typeof(
           audit_record.metadata_json->'supportTicket'
         ) <> 'string'
         OR pg_catalog.char_length(
           audit_record.metadata_json->>'supportTicket'
         ) NOT BETWEEN 1 AND 200
         OR pg_catalog.btrim(
           audit_record.metadata_json->>'supportTicket'
         ) IS DISTINCT FROM
           audit_record.metadata_json->>'supportTicket'
       )
     )
  THEN
    RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
      USING ERRCODE = '23514';
  END IF;

  expected_receipt := pg_catalog.jsonb_build_object(
    'profileVersion', shell_profile_version,
    'tenant', pg_catalog.jsonb_build_object(
      'id', tenant_id,
      'slug', tenant_record.tenant_slug,
      'status', 'SUSPENDED',
      'customerStage', 'PILOT',
      'onboardingStatus', 'PROVISIONING',
      'profileRevision', 1,
      'executionRevision', provision_execution_revision,
      'trialStartsAt', NULL,
      'trialEndsAt', NULL
    ),
    'store', pg_catalog.jsonb_build_object(
      'id', store_record.store_id,
      'name', store_record.store_name,
      'isActive', false,
      'gamificationEnabled', false,
      'backgroundExecutionEnabled', false
    ),
    'ownerIdentity', pg_catalog.jsonb_build_object(
      'claimType', 'INVITE',
      'reservationId', reservation_subject_id,
      'claimRevision', 1
    ),
    'modules', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'module', 'GAMIFICATION',
        'readEnabled', true,
        'writeEnabled', true,
        'outboundEnabled', false,
        'profileRevision', 1
      ),
      pg_catalog.jsonb_build_object(
        'module', 'ASSORTMENT',
        'readEnabled', true,
        'writeEnabled', true,
        'outboundEnabled', false,
        'profileRevision', 1
      ),
      pg_catalog.jsonb_build_object(
        'module', 'STAFF',
        'readEnabled', true,
        'writeEnabled', true,
        'outboundEnabled', false,
        'profileRevision', 1
      ),
      pg_catalog.jsonb_build_object(
        'module', 'COMMUNICATIONS',
        'readEnabled', true,
        'writeEnabled', true,
        'outboundEnabled', false,
        'profileRevision', 1
      ),
      pg_catalog.jsonb_build_object(
        'module', 'USERS_ROLES',
        'readEnabled', true,
        'writeEnabled', true,
        'outboundEnabled', false,
        'profileRevision', 1
      ),
      pg_catalog.jsonb_build_object(
        'module', 'INTEGRATIONS',
        'readEnabled', true,
        'writeEnabled', true,
        'outboundEnabled', false,
        'profileRevision', 1
      )
    )
  );
  expected_metadata := pg_catalog.jsonb_build_object(
    'profileVersion', shell_profile_version,
    'requestDigest', audit_record.metadata_json->>'requestDigest',
    'supportTicket', audit_record.metadata_json->'supportTicket',
    'supportOwnerUserId', tenant_record.support_owner_user_id,
    'ownerEmailFingerprint',
      audit_record.metadata_json->>'ownerEmailFingerprint',
    'ownerEmailFingerprintKeyVersion', 'v1',
    'initialOwnerRole', 'OWNER',
    'initialOwnerScopeAfterActivation', 'NETWORK',
    'ownerIdentityReservationId', reservation_subject_id,
    'initialStoreCount', 1,
    'moduleCount', 6,
    'outboundDefault', 'OFF',
    'activationRequired', true,
    'inviteCreated', false,
    'trialStarted', false,
    'confirmationRule', 'PROVISION tenant_slug',
    'executionRevision', provision_execution_revision
  );

  IF audit_record.after_json IS DISTINCT FROM expected_receipt
     OR audit_record.metadata_json IS DISTINCT FROM expected_metadata
  THEN
    RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
      USING ERRCODE = '23514';
  END IF;

  PERFORM administrator."id"
  FROM public."User" AS administrator
  WHERE administrator."id" = ANY(
    ARRAY[
      audit_record.actor_user_id,
      tenant_record.support_owner_user_id
    ]::TEXT[]
  )
  ORDER BY administrator."id" COLLATE "C"
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1
       FROM public."User" AS actor
       WHERE actor."id" = audit_record.actor_user_id
         AND actor."isActive"
         AND actor."isPlatformAdmin"
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public."User" AS support_owner
       WHERE support_owner."id" = tenant_record.support_owner_user_id
         AND support_owner."isActive"
         AND support_owner."isPlatformAdmin"
     )
  THEN
    RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
      USING ERRCODE = '23514';
  END IF;

  PERFORM entitlement."id"
  FROM public."TenantModuleEntitlement" AS entitlement
  WHERE entitlement."tenantId" = tenant_id
  ORDER BY entitlement."module"::TEXT COLLATE "C"
  FOR UPDATE;

  SELECT
    pg_catalog.count(*)::INTEGER,
    (
      pg_catalog.count(*) FILTER (
        WHERE entitlement."profileRevision" =
            tenant_record.profile_revision
          AND entitlement."readEnabled"
          AND entitlement."writeEnabled"
          AND NOT entitlement."outboundEnabled"
          AND entitlement."validFrom" IS NULL
          AND entitlement."validUntil" IS NULL
      )
    )::INTEGER,
    pg_catalog.array_agg(
      entitlement."module"::TEXT
      ORDER BY entitlement."module"::TEXT COLLATE "C"
    ),
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'module', entitlement."module"::TEXT,
        'readEnabled', entitlement."readEnabled",
        'writeEnabled', entitlement."writeEnabled",
        'outboundEnabled', entitlement."outboundEnabled",
        'validFromEpochMs', NULL,
        'validUntilEpochMs', NULL,
        'profileRevision', entitlement."profileRevision"
      )
      ORDER BY entitlement."module"::TEXT COLLATE "C"
    )
  INTO
    entitlement_count,
    valid_entitlement_count,
    actual_modules,
    entitlements_json
  FROM public."TenantModuleEntitlement" AS entitlement
  WHERE entitlement."tenantId" = tenant_id;

  profile_digest :=
    public."shared_beta_tenant_profile_digest_v1"(
      tenant_id,
      tenant_record.profile_revision
    );

  IF entitlement_count <> 6
     OR valid_entitlement_count <> 6
     OR actual_modules IS DISTINCT FROM expected_modules
     OR profile_digest IS NULL
     OR (profile_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
      USING ERRCODE = '23514';
  END IF;

  PERFORM claim."workflowLocator"
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."tenantId" = tenant_id
  ORDER BY claim."workflowLocator" COLLATE "C"
  FOR UPDATE;

  SELECT pg_catalog.count(*)::INTEGER
  INTO identity_claim_count
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."tenantId" = tenant_id;

  SELECT
    claim."claimType"::TEXT,
    claim."tenantId",
    claim."subjectId",
    claim."workflowLocator",
    claim."revision"
  INTO
    claim_type,
    claim_tenant_id,
    claim_subject_id,
    claim_workflow_locator,
    claim_revision
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."workflowLocator" = workflow_locator
  FOR UPDATE;

  IF identity_claim_count <> 1
     OR NOT FOUND
     OR claim_type <> 'INVITE'
     OR claim_tenant_id IS DISTINCT FROM tenant_id
     OR claim_workflow_locator IS DISTINCT FROM workflow_locator
  THEN
    RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
      USING ERRCODE = '23514';
  END IF;

  checked_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  IF claim_subject_id IS NOT DISTINCT FROM reservation_subject_id
     AND claim_revision IS NOT DISTINCT FROM reservation_claim_revision
  THEN
    SELECT pg_catalog.count(*)::INTEGER
    INTO issue_command_count
    FROM public."IdentityOwnerInviteIssueCommand" AS command
    WHERE command."tenantId" = tenant_id;
    SELECT pg_catalog.count(*)::INTEGER
    INTO invite_count
    FROM public."UserInvite" AS invite
    WHERE invite."tenantId" = tenant_id;
    SELECT pg_catalog.count(*)::INTEGER
    INTO outbox_count
    FROM public."IdentityMailOutbox" AS outbox
    WHERE outbox."tenantId" = tenant_id;
    SELECT pg_catalog.count(*)::INTEGER
    INTO issue_audit_count
    FROM public."PlatformAdminAuditEvent" AS issue_audit
    WHERE issue_audit."tenantId" = tenant_id
      AND issue_audit."action" = issue_action;

    IF issue_command_count <> 0
       OR invite_count <> 0
       OR outbox_count <> 0
       OR issue_audit_count <> 0
    THEN
      RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT command.*
    INTO issue_command_record
    FROM public."IdentityOwnerInviteIssueCommand" AS command
    WHERE command."tenantId" = tenant_id
      AND command."action" = issue_action
      AND command."workflowLocator" = workflow_locator
      AND command."reservationSubjectId" = reservation_subject_id
      AND command."reservationClaimRevision" =
        reservation_claim_revision
    FOR KEY SHARE;

    IF NOT FOUND
       OR claim_subject_id IS DISTINCT FROM issue_command_record."inviteId"
       OR claim_revision IS DISTINCT FROM reservation_claim_revision + 1
       OR issue_command_record."claimRevision" IS DISTINCT FROM
         reservation_claim_revision + 1
       OR issue_command_record."expiresAt" <= checked_at
    THEN
      RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
        USING ERRCODE = '23514';
    END IF;

    SELECT pg_catalog.count(*)::INTEGER
    INTO issue_command_count
    FROM public."IdentityOwnerInviteIssueCommand" AS command
    WHERE command."tenantId" = tenant_id;

    PERFORM invite."id"
    FROM public."UserInvite" AS invite
    WHERE invite."tenantId" = tenant_id
    ORDER BY invite."id" COLLATE "C"
    FOR UPDATE;

    SELECT pg_catalog.count(*)::INTEGER
    INTO invite_count
    FROM public."UserInvite" AS invite
    WHERE invite."tenantId" = tenant_id;

    SELECT
      invite."id" AS invite_id,
      (invite."email" = claim."emailCanonical") AS email_matches_claim,
      invite."role"::TEXT AS role_name,
      invite."accessScope"::TEXT AS access_scope,
      invite."customRoleId" AS custom_role_id,
      pg_catalog.cardinality(invite."storeIds") AS store_id_count,
      invite."tokenHash" AS token_hash,
      invite."expiresAt" AS expires_at,
      invite."fullName" AS full_name,
      invite."acceptedAt" AS accepted_at,
      invite."acceptedByUserId" AS accepted_by_user_id,
      invite."createdByUserId" AS created_by_user_id,
      invite."revokedAt" AS revoked_at,
      invite."revokedByUserId" AS revoked_by_user_id,
      invite."identityClaimRevision" AS identity_claim_revision,
      invite."createdAt" AS created_at,
      invite."updatedAt" AS updated_at
    INTO invite_record
    FROM public."UserInvite" AS invite
    INNER JOIN public."IdentityEmailClaim" AS claim
      ON claim."workflowLocator" = workflow_locator
    WHERE invite."tenantId" = tenant_id
      AND invite."id" = issue_command_record."inviteId";

    PERFORM outbox."id"
    FROM public."IdentityMailOutbox" AS outbox
    WHERE outbox."tenantId" = tenant_id
    ORDER BY outbox."id" COLLATE "C"
    FOR UPDATE;

    SELECT pg_catalog.count(*)::INTEGER
    INTO outbox_count
    FROM public."IdentityMailOutbox" AS outbox
    WHERE outbox."tenantId" = tenant_id;

    SELECT
      outbox."id" AS outbox_id,
      outbox."issueCommandId" AS issue_command_id,
      outbox."inviteId" AS invite_id,
      outbox."workflowLocator" AS workflow_locator,
      outbox."aadEnvironment" AS aad_environment,
      outbox."status"::TEXT AS status_name,
      outbox."messageKey" AS message_key,
      outbox."issueRequestDigest" AS issue_request_digest,
      outbox."tokenHash" AS token_hash,
      pg_catalog.octet_length(
        outbox."secretCiphertext"
      ) AS secret_ciphertext_length,
      outbox."expiresAt" AS expires_at,
      outbox."releasedAt" AS released_at
    INTO outbox_record
    FROM public."IdentityMailOutbox" AS outbox
    WHERE outbox."tenantId" = tenant_id
      AND outbox."id" = issue_command_record."outboxId"
      AND outbox."issueCommandId" = issue_command_record."id";

    IF issue_command_count <> 1
       OR invite_count <> 1
       OR outbox_count <> 1
       OR invite_record.email_matches_claim IS DISTINCT FROM true
       OR invite_record.role_name <> 'OWNER'
       OR invite_record.access_scope <> 'NETWORK'
       OR invite_record.custom_role_id IS NOT NULL
       OR invite_record.store_id_count <> 0
       OR invite_record.token_hash IS DISTINCT FROM
         issue_command_record."tokenHash"
       OR invite_record.expires_at IS DISTINCT FROM
         issue_command_record."expiresAt" AT TIME ZONE 'UTC'
       OR invite_record.full_name IS NOT NULL
       OR invite_record.accepted_at IS NOT NULL
       OR invite_record.accepted_by_user_id IS NOT NULL
       OR invite_record.created_by_user_id IS NOT NULL
       OR invite_record.revoked_at IS NOT NULL
       OR invite_record.revoked_by_user_id IS NOT NULL
       OR invite_record.identity_claim_revision IS DISTINCT FROM
         issue_command_record."claimRevision"
       OR invite_record.created_at IS DISTINCT FROM
         issue_command_record."createdAt" AT TIME ZONE 'UTC'
       OR invite_record.updated_at IS DISTINCT FROM
         issue_command_record."createdAt" AT TIME ZONE 'UTC'
       OR outbox_record.issue_command_id IS DISTINCT FROM
         issue_command_record."id"
       OR outbox_record.invite_id IS DISTINCT FROM
         issue_command_record."inviteId"
       OR outbox_record.workflow_locator IS DISTINCT FROM workflow_locator
       OR outbox_record.aad_environment IS DISTINCT FROM
         issue_command_record."aadEnvironment"
       OR outbox_record.status_name <> 'HOLD'
       OR outbox_record.released_at IS NOT NULL
       OR outbox_record.message_key IS DISTINCT FROM
         issue_command_record."messageKey"
       OR outbox_record.issue_request_digest IS DISTINCT FROM
         issue_command_record."issueRequestDigest"
       OR outbox_record.token_hash IS DISTINCT FROM
         issue_command_record."tokenHash"
       OR outbox_record.secret_ciphertext_length <> 71
       OR outbox_record.expires_at IS DISTINCT FROM
         issue_command_record."expiresAt"
    THEN
      RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
        USING ERRCODE = '23514';
    END IF;

    issue_receipt := pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'ISSUE_DORMANT_OWNER_INVITE',
      'decision', 'CREATED',
      'tenantId', tenant_id,
      'commandId', issue_command_record."id",
      'inviteId', issue_command_record."inviteId",
      'outboxId', issue_command_record."outboxId",
      'claimType', 'INVITE',
      'claimRevision', issue_command_record."claimRevision",
      'role', 'OWNER',
      'accessScope', 'NETWORK',
      'outboxStatus', 'HOLD'
    );

    PERFORM issue_audit."id"
    FROM public."PlatformAdminAuditEvent" AS issue_audit
    WHERE issue_audit."id" = issue_command_record."id"
      AND issue_audit."tenantId" = tenant_id
      AND issue_audit."actorUserId" IS NULL
      AND issue_audit."requestId" = issue_command_record."requestId"
      AND issue_audit."action" = issue_action
      AND issue_audit."targetType" = 'UserInvite'
      AND issue_audit."targetId" = issue_command_record."inviteId"
      AND issue_audit."reason" IS NULL
      AND issue_audit."before" IS NULL
      AND issue_audit."after" = issue_receipt
      AND issue_audit."createdAt" =
        issue_command_record."createdAt" AT TIME ZONE 'UTC'
      AND issue_audit."metadata" =
        pg_catalog.jsonb_build_object(
          'schemaVersion', 1,
          'authority', 'IdentityOwnerInviteIssueCommand',
          'issueCommandId', issue_command_record."id"
        )
    FOR SHARE;
    valid_issue_audit_count :=
      CASE WHEN FOUND THEN 1 ELSE 0 END;

    SELECT pg_catalog.count(*)::INTEGER
    INTO issue_audit_count
    FROM public."PlatformAdminAuditEvent" AS issue_audit
    WHERE issue_audit."tenantId" = tenant_id
      AND issue_audit."action" = issue_action;

    IF valid_issue_audit_count <> 1 OR issue_audit_count <> 1 THEN
      RAISE EXCEPTION 'Shared beta tenant shell is unavailable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  shell_evidence := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'profileVersion', shell_profile_version,
    'tenant', pg_catalog.jsonb_build_object(
      'id', tenant_id,
      'name', tenant_record.tenant_name,
      'slug', tenant_record.tenant_slug,
      'status', tenant_record.lifecycle_status,
      'customerStage', tenant_record.customer_stage,
      'onboardingStatus', tenant_record.onboarding_status,
      'cohortKey', tenant_record.cohort_key,
      'supportOwnerUserId', tenant_record.support_owner_user_id,
      'trialStartsAtEpochMs', NULL,
      'trialEndsAtEpochMs', NULL,
      'entitlementProfileRevision', tenant_record.profile_revision,
      'executionRevision', tenant_record.execution_revision
    ),
    'store', pg_catalog.jsonb_build_object(
      'id', store_record.store_id,
      'name', store_record.store_name,
      'publicSlug', store_record.public_slug,
      'timeZone', store_record.time_zone,
      'isActive', false,
      'gamificationEnabled', false,
      'backgroundExecutionEnabled', false,
      'executionRevision', store_record.execution_revision,
      'integrationBinding', NULL
    ),
    'ownerOverride', pg_catalog.jsonb_build_object(
      'role', 'OWNER',
      'capabilities', pg_catalog.to_jsonb(actual_capabilities),
      'capabilityDigest', capability_digest
    ),
    'entitlements', entitlements_json,
    'profileDigest', profile_digest,
    'provisioning', pg_catalog.jsonb_build_object(
      'auditEventId', audit_record.audit_id,
      'actorUserId', audit_record.actor_user_id,
      'requestId', audit_record.request_id,
      'receipt', audit_record.after_json,
      'metadata', audit_record.metadata_json
    ),
    'ownerIdentity', pg_catalog.jsonb_build_object(
      'workflowLocator', workflow_locator,
      'reservationSubjectId', reservation_subject_id,
      'reservationClaimRevision', reservation_claim_revision
    )
  );
  actual_shell_digest :=
    public."shared_beta_runtime_digest_v1"(
      'leetplus-shared-beta-actual-shell-v1',
      shell_evidence
    );

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'READ_SHARED_BETA_TENANT_ACTUAL_SHELL',
    'actualShellDigest', actual_shell_digest,
    'profileDigest', profile_digest,
    'workflowLocator', workflow_locator,
    'reservationSubjectId', reservation_subject_id,
    'reservationClaimRevision', reservation_claim_revision,
    'entitlementProfileRevision', tenant_record.profile_revision,
    'executionRevision', tenant_record.execution_revision
  );
END;
$$;

CREATE FUNCTION public."shared_beta_tenant_activate_v1"(
  candidate_activation_command_id TEXT,
  expected_tenant_id TEXT,
  activation_request_id TEXT,
  activation_request_digest TEXT,
  expected_decision_id TEXT,
  expected_deployment_marker_id TEXT,
  activated_by_user_id TEXT,
  issue_request_id TEXT,
  issue_request_digest TEXT,
  candidate_issue_command_id TEXT,
  candidate_invite_id TEXT,
  candidate_outbox_id TEXT,
  candidate_message_key TEXT,
  candidate_token_hash TEXT,
  candidate_secret_ciphertext BYTEA,
  candidate_invite_expires_at TIMESTAMP(3) WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  uuid_pattern CONSTANT TEXT :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  tenant_id TEXT;
  request_id TEXT;
  request_digest TEXT;
  decision_id TEXT;
  marker_id TEXT;
  actor_id TEXT;
  dormant_request_id TEXT;
  dormant_request_digest TEXT;
  session_role_name TEXT;
  session_role_oid BIGINT;
  activation_command_id TEXT;
  transaction_id TEXT;
  secret_ciphertext_digest TEXT;
  trial_policy_version TEXT;
  trial_duration_seconds INTEGER;
  valid_actor_count INTEGER;
  activated_at TIMESTAMP(3) WITH TIME ZONE;
  trial_ends_at TIMESTAMP(3) WITH TIME ZONE;
  runtime_context JSONB;
  repeated_runtime_context JSONB;
  shell_context JSONB;
  repeated_shell_context JSONB;
  assertion_receipt JSONB;
  issue_receipt JSONB;
  activation_receipt JSONB;
  state_record public."SharedBetaRuntimeReleaseState"%ROWTYPE;
  marker_record public."SharedBetaRuntimeReleaseMarker"%ROWTYPE;
  build_record public."SharedBetaBuildProvenance"%ROWTYPE;
  tenant_record public."Tenant"%ROWTYPE;
  decision_record public."TenantAdmissionDecision"%ROWTYPE;
  issue_record public."IdentityOwnerInviteIssueCommand"%ROWTYPE;
  invite_record public."UserInvite"%ROWTYPE;
  outbox_record public."IdentityMailOutbox"%ROWTYPE;
  activation_record public."SharedBetaTenantActivationCommand"%ROWTYPE;
  audit_record public."PlatformAdminAuditEvent"%ROWTYPE;
BEGIN
  tenant_id := pg_catalog.lower(
    pg_catalog.btrim(expected_tenant_id) COLLATE "C"
  );
  request_id := pg_catalog.lower(
    pg_catalog.btrim(activation_request_id) COLLATE "C"
  );
  request_digest := pg_catalog.btrim(activation_request_digest);
  decision_id := pg_catalog.lower(
    pg_catalog.btrim(expected_decision_id) COLLATE "C"
  );
  marker_id := pg_catalog.lower(
    pg_catalog.btrim(expected_deployment_marker_id) COLLATE "C"
  );
  actor_id := pg_catalog.lower(
    pg_catalog.btrim(activated_by_user_id) COLLATE "C"
  );
  dormant_request_id := pg_catalog.lower(
    pg_catalog.btrim(issue_request_id) COLLATE "C"
  );
  dormant_request_digest := pg_catalog.btrim(issue_request_digest);

  IF tenant_id IS NULL
     OR expected_tenant_id IS DISTINCT FROM tenant_id
     OR tenant_id !~ uuid_pattern
     OR request_id IS NULL
     OR activation_request_id IS DISTINCT FROM request_id
     OR request_id !~ uuid_pattern
     OR request_digest IS NULL
     OR activation_request_digest IS DISTINCT FROM request_digest
     OR request_digest !~ '^[0-9a-f]{64}$'
     OR decision_id IS NULL
     OR expected_decision_id IS DISTINCT FROM decision_id
     OR decision_id !~ uuid_pattern
     OR marker_id IS NULL
     OR expected_deployment_marker_id IS DISTINCT FROM marker_id
     OR marker_id !~ uuid_pattern
     OR actor_id IS NULL
     OR activated_by_user_id IS DISTINCT FROM actor_id
     OR actor_id !~ uuid_pattern
     OR dormant_request_id IS NULL
     OR issue_request_id IS DISTINCT FROM dormant_request_id
     OR dormant_request_id !~ uuid_pattern
     OR dormant_request_digest IS NULL
     OR issue_request_digest IS DISTINCT FROM dormant_request_digest
     OR dormant_request_digest !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Shared beta tenant activation authority is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'shared-beta-tenant-activation:v1:' ||
        tenant_id || ':' || request_id,
      174
    )
  );

  SELECT command.*
  INTO activation_record
  FROM public."SharedBetaTenantActivationCommand" AS command
  WHERE command."tenantId" = tenant_id
    AND command."action" = 'ACTIVATE_AND_RELEASE_OWNER_INVITE'
    AND command."requestId" = request_id
  FOR UPDATE;

  IF FOUND THEN
    SELECT role.rolname::TEXT, role.oid::BIGINT
    INTO session_role_name, session_role_oid
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = session_user;

    SELECT marker.*
    INTO marker_record
    FROM public."SharedBetaRuntimeReleaseMarker" AS marker
    WHERE marker."id" = activation_record."markerId"
    FOR SHARE;

    IF NOT FOUND
       OR session_role_name IS DISTINCT FROM
         marker_record."coordinatorRoleName"
       OR session_role_oid IS DISTINCT FROM
         marker_record."coordinatorRoleOid"
       OR marker_record."activationDatabaseRole" IS DISTINCT FROM
         session_role_name
    THEN
      RAISE EXCEPTION
        'Shared beta tenant activation replay role binding is invalid'
        USING ERRCODE = '42501';
    END IF;

    PERFORM public."shared_beta_runtime_activation_role_assert_v1"(
      marker_record."coordinatorRoleName",
      marker_record."coordinatorRoleOid"
    );

    IF activation_record."requestDigest" IS DISTINCT FROM request_digest
       OR activation_record."decisionId" IS DISTINCT FROM decision_id
       OR activation_record."markerId" IS DISTINCT FROM marker_id
       OR activation_record."activatedByUserId" IS DISTINCT FROM actor_id
       OR activation_record."issueRequestId" IS DISTINCT FROM
         dormant_request_id
       OR activation_record."issueRequestDigest" IS DISTINCT FROM
         dormant_request_digest
    THEN
      RAISE EXCEPTION 'Shared beta tenant activation replay conflicts'
        USING ERRCODE = '23505';
    END IF;

    SELECT command.*
    INTO issue_record
    FROM public."IdentityOwnerInviteIssueCommand" AS command
    WHERE command."id" = activation_record."issueCommandId"
      AND command."tenantId" = tenant_id
    FOR SHARE;

    SELECT audit.*
    INTO audit_record
    FROM public."PlatformAdminAuditEvent" AS audit
    WHERE audit."id" = activation_record."id";

    IF issue_record."id" IS NULL
       OR audit_record."id" IS NULL
       OR issue_record."requestId" IS DISTINCT FROM
         activation_record."issueRequestId"
       OR issue_record."issueRequestDigest" IS DISTINCT FROM
         activation_record."issueRequestDigest"
       OR issue_record."workflowLocator" IS DISTINCT FROM
         activation_record."workflowLocator"
       OR issue_record."reservationSubjectId" IS DISTINCT FROM
         activation_record."reservationSubjectId"
       OR issue_record."reservationClaimRevision" IS DISTINCT FROM
         activation_record."reservationClaimRevision"
       OR issue_record."inviteId" IS DISTINCT FROM
         activation_record."inviteId"
       OR issue_record."outboxId" IS DISTINCT FROM
         activation_record."outboxId"
       OR issue_record."messageKey" IS DISTINCT FROM
         activation_record."messageKey"
       OR issue_record."tokenHash" IS DISTINCT FROM
         activation_record."tokenHash"
       OR audit_record."tenantId" IS DISTINCT FROM tenant_id
       OR audit_record."actorUserId" IS DISTINCT FROM actor_id
       OR audit_record."requestId" IS DISTINCT FROM request_id
       OR audit_record."action" IS DISTINCT FROM
         'SHARED_BETA_TENANT_ACTIVATED'
       OR audit_record."targetType" IS DISTINCT FROM 'TENANT'
       OR audit_record."targetId" IS DISTINCT FROM tenant_id
       OR audit_record."reason" IS NOT NULL
       OR audit_record."before" IS DISTINCT FROM
         pg_catalog.jsonb_build_object(
           'status', 'SUSPENDED',
           'onboardingStatus', 'PROVISIONING',
           'executionRevision',
             activation_record."executionRevisionBefore"
         )
       OR audit_record."after" IS DISTINCT FROM
         activation_record."receipt"
       OR audit_record."metadata" IS DISTINCT FROM
         pg_catalog.jsonb_build_object(
           'schemaVersion', 1,
           'authority', 'SharedBetaTenantActivationCommand',
           'activationCommandId', activation_record."id",
           'markerPayloadDigest',
             activation_record."markerPayloadDigest",
           'actualContextDigest',
             activation_record."actualContextDigest",
           'actualShellDigest', activation_record."actualShellDigest",
           'createdTransactionId',
             activation_record."createdTransactionId"
         )
    THEN
      RAISE EXCEPTION 'Shared beta tenant activation replay is incomplete'
        USING ERRCODE = '23514';
    END IF;

    RETURN pg_catalog.jsonb_set(
      activation_record."receipt",
      '{decision}',
      '"REPLAYED"'::JSONB,
      false
    );
  END IF;

  IF pg_catalog.current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'Shared beta activation requires SERIALIZABLE'
      USING ERRCODE = '25001';
  END IF;

  activation_command_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_activation_command_id) COLLATE "C"
  );

  IF activation_command_id IS NULL
     OR candidate_activation_command_id IS DISTINCT FROM
       activation_command_id
     OR activation_command_id !~ uuid_pattern
  THEN
    RAISE EXCEPTION 'Shared beta activation candidate is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT state.*
  INTO state_record
  FROM public."SharedBetaRuntimeReleaseState" AS state
  WHERE state."id" = 'SHARED_BETA_RUNTIME_RELEASE'
  FOR UPDATE;

  IF NOT FOUND OR state_record."currentMarkerId" IS DISTINCT FROM marker_id THEN
    RAISE EXCEPTION 'Shared beta runtime marker is not current'
      USING ERRCODE = '23514';
  END IF;

  SELECT marker.*
  INTO marker_record
  FROM public."SharedBetaRuntimeReleaseMarker" AS marker
  WHERE marker."id" = marker_id
  FOR UPDATE;

  SELECT build.*
  INTO build_record
  FROM public."SharedBetaBuildProvenance" AS build
  WHERE build."id" = marker_record."buildProvenanceId"
  FOR UPDATE;

  IF marker_record."id" IS NULL OR build_record."id" IS NULL THEN
    RAISE EXCEPTION 'Shared beta runtime provenance is incomplete'
      USING ERRCODE = '23514';
  END IF;

  runtime_context :=
    public."shared_beta_runtime_actual_context_assert_v1"(marker_id);

  SELECT tenant.*
  INTO tenant_record
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = tenant_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared beta tenant is missing'
      USING ERRCODE = '23503';
  END IF;

  shell_context :=
    public."shared_beta_tenant_actual_shell_v1"(tenant_id);

  SELECT decision.*
  INTO decision_record
  FROM public."TenantAdmissionDecision" AS decision
  WHERE decision."id" = decision_id
    AND decision."tenantId" = tenant_id
  FOR UPDATE;

  IF NOT FOUND
     OR decision_record."stateRevision" <> 1
     OR decision_record."revokedAt" IS NOT NULL
     OR decision_record."consumedAt" IS NOT NULL
     OR decision_record."validUntil" <=
       pg_catalog.clock_timestamp()
     OR decision_record."workflowLocator" IS DISTINCT FROM
       shell_context ->> 'workflowLocator'
     OR decision_record."reservationSubjectId" IS DISTINCT FROM
       shell_context ->> 'reservationSubjectId'
     OR decision_record."expectedClaimRevision" IS DISTINCT FROM
       (shell_context ->> 'reservationClaimRevision')::INTEGER
     OR decision_record."shellEvidenceDigest" IS DISTINCT FROM
       shell_context ->> 'actualShellDigest'
     OR decision_record."releaseSha" IS DISTINCT FROM
       runtime_context ->> 'releaseSha'
     OR decision_record."environment" IS DISTINCT FROM
       runtime_context ->> 'environment'
     OR decision_record."artifactDigest" IS DISTINCT FROM
       runtime_context ->> 'artifactContentDigest'
     OR decision_record."schemaHead" IS DISTINCT FROM
       runtime_context ->> 'schemaHead'
     OR decision_record."migrationCount" IS DISTINCT FROM
       (runtime_context ->> 'migrationCount')::INTEGER
     OR decision_record."policyManifestDigest" IS DISTINCT FROM
       runtime_context ->> 'policyManifestDigest'
     OR decision_record."databaseIdentityDigest" IS DISTINCT FROM
       runtime_context ->> 'databaseIdentityDigest'
     OR decision_record."expectedEntitlementProfileRevision"
       IS DISTINCT FROM
       (shell_context ->> 'entitlementProfileRevision')::INTEGER
     OR decision_record."expectedExecutionRevision" IS DISTINCT FROM
       (shell_context ->> 'executionRevision')::INTEGER
     OR decision_record."profileDigest" IS DISTINCT FROM
       shell_context ->> 'profileDigest'
  THEN
    RAISE EXCEPTION 'Shared beta admission does not match actual state'
      USING ERRCODE = '23514';
  END IF;

  PERFORM user_record."id"
  FROM public."User" AS user_record
  WHERE user_record."id" IN (
    actor_id,
    decision_record."approvedByUserId"
  )
  ORDER BY user_record."id"
  FOR SHARE;

  SELECT pg_catalog.count(*)
  INTO valid_actor_count
  FROM public."User" AS user_record
  WHERE user_record."id" IN (
      actor_id,
      decision_record."approvedByUserId"
    )
    AND user_record."isActive"
    AND user_record."isPlatformAdmin";

  IF valid_actor_count <> (
       pg_catalog.cardinality(
         ARRAY[
           actor_id,
           decision_record."approvedByUserId"
         ]::TEXT[]
       )
       - CASE
           WHEN actor_id = decision_record."approvedByUserId" THEN 1
           ELSE 0
         END
     )
  THEN
    RAISE EXCEPTION 'Shared beta activation actor is unavailable'
      USING ERRCODE = '42501';
  END IF;

  assertion_receipt :=
    public."shared_beta_tenant_admission_decision_assert_v1"(
      decision_record."id",
      decision_record."tenantId",
      decision_record."workflowLocator",
      decision_record."reservationSubjectId",
      decision_record."expectedClaimRevision",
      decision_record."releaseSha",
      decision_record."environment",
      decision_record."artifactDigest",
      decision_record."schemaHead",
      decision_record."migrationCount",
      decision_record."policyManifestDigest",
      decision_record."databaseIdentityDigest",
      decision_record."expectedEntitlementProfileRevision",
      decision_record."expectedExecutionRevision",
      decision_record."profileDigest",
      decision_record."gateSetDigest"
    );

  issue_receipt :=
    public."identity_owner_invite_issue_hold_v1"(
      decision_record."workflowLocator",
      tenant_id,
      decision_record."reservationSubjectId",
      decision_record."expectedClaimRevision",
      dormant_request_id,
      dormant_request_digest,
      marker_record."environment",
      candidate_issue_command_id,
      candidate_invite_id,
      candidate_outbox_id,
      candidate_message_key,
      candidate_token_hash,
      candidate_secret_ciphertext,
      candidate_invite_expires_at
    );

  PERFORM claim."workflowLocator"
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."workflowLocator" = decision_record."workflowLocator"
    AND claim."tenantId" = tenant_id
  FOR UPDATE;

  SELECT command.*
  INTO issue_record
  FROM public."IdentityOwnerInviteIssueCommand" AS command
  WHERE command."tenantId" = tenant_id
    AND command."requestId" = dormant_request_id
    AND command."action" = 'ISSUE_INITIAL_OWNER_INVITE'
  FOR SHARE;

  SELECT invite.*
  INTO invite_record
  FROM public."UserInvite" AS invite
  WHERE invite."tenantId" = tenant_id
    AND invite."id" = issue_record."inviteId"
  FOR UPDATE;

  SELECT outbox.*
  INTO outbox_record
  FROM public."IdentityMailOutbox" AS outbox
  WHERE outbox."tenantId" = tenant_id
    AND outbox."id" = issue_record."outboxId"
  FOR UPDATE;

  assertion_receipt :=
    public."shared_beta_tenant_admission_decision_assert_v1"(
      decision_record."id",
      decision_record."tenantId",
      decision_record."workflowLocator",
      decision_record."reservationSubjectId",
      decision_record."expectedClaimRevision",
      decision_record."releaseSha",
      decision_record."environment",
      decision_record."artifactDigest",
      decision_record."schemaHead",
      decision_record."migrationCount",
      decision_record."policyManifestDigest",
      decision_record."databaseIdentityDigest",
      decision_record."expectedEntitlementProfileRevision",
      decision_record."expectedExecutionRevision",
      decision_record."profileDigest",
      decision_record."gateSetDigest"
    );

  repeated_runtime_context :=
    public."shared_beta_runtime_actual_context_assert_v1"(marker_id);
  repeated_shell_context :=
    public."shared_beta_tenant_actual_shell_v1"(tenant_id);

  IF runtime_context IS DISTINCT FROM repeated_runtime_context
     OR shell_context ->> 'actualShellDigest' IS DISTINCT FROM
       repeated_shell_context ->> 'actualShellDigest'
     OR issue_record."id" IS NULL
     OR invite_record."id" IS NULL
     OR outbox_record."id" IS NULL
     OR issue_record."workflowLocator" IS DISTINCT FROM
       decision_record."workflowLocator"
     OR issue_record."reservationSubjectId" IS DISTINCT FROM
       decision_record."reservationSubjectId"
     OR issue_record."reservationClaimRevision" IS DISTINCT FROM
       decision_record."expectedClaimRevision"
     OR issue_record."issueRequestDigest" IS DISTINCT FROM
       dormant_request_digest
     OR invite_record."role" IS DISTINCT FROM
       'OWNER'::public."UserRole"
     OR invite_record."accessScope" IS DISTINCT FROM
       'NETWORK'::public."UserAccessScope"
     OR outbox_record."status" IS DISTINCT FROM
       'HOLD'::public."IdentityMailOutboxStatus"
     OR outbox_record."releasedAt" IS NOT NULL
     OR issue_receipt ->> 'commandId' IS DISTINCT FROM issue_record."id"
     OR assertion_receipt ->> 'identityState' IS DISTINCT FROM
       'ISSUED_HOLD'
  THEN
    RAISE EXCEPTION 'Shared beta activation aggregate changed during issue'
      USING ERRCODE = '40001';
  END IF;

  activated_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  trial_policy_version :=
    runtime_context ->> 'trialPolicyVersion';
  trial_duration_seconds :=
    (runtime_context ->> 'trialDurationSeconds')::INTEGER;
  trial_ends_at := activated_at +
    (trial_duration_seconds * INTERVAL '1 second');

  IF trial_policy_version <> 'SHARED_BETA_TRIAL_V1'
     OR trial_duration_seconds NOT BETWEEN 3600 AND 7776000
     OR marker_record."validUntil" <= activated_at
     OR marker_record."stateRevision" <> 1
     OR marker_record."revokedAt" IS NOT NULL
     OR build_record."validUntil" <= activated_at
     OR build_record."stateRevision" <> 1
     OR build_record."revokedAt" IS NOT NULL
     OR decision_record."validUntil" <= activated_at
     OR outbox_record."expiresAt" <= activated_at
     OR outbox_record."expiresAt" > trial_ends_at
  THEN
    RAISE EXCEPTION 'Shared beta activation trial/invite window is invalid'
      USING ERRCODE = '23514';
  END IF;

  transaction_id := pg_catalog.pg_current_xact_id()::TEXT;
  secret_ciphertext_digest := pg_catalog.encode(
    pg_catalog.sha256(outbox_record."secretCiphertext"),
    'hex'
  );
  activation_receipt := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'ACTIVATE_AND_RELEASE_OWNER_INVITE',
    'decision', 'ACTIVATED',
    'tenantId', tenant_id,
    'activationCommandId', activation_command_id,
    'admissionDecisionId', decision_record."id",
    'markerId', marker_record."id",
    'markerGeneration', marker_record."generation",
    'tenantStatus', 'ACTIVE',
    'onboardingStatus', 'OWNER_INVITED',
    'executionRevision', tenant_record."executionRevision" + 1,
    'trialStartsAtEpochMs',
      (EXTRACT(EPOCH FROM activated_at) * 1000)::BIGINT,
    'trialEndsAtEpochMs',
      (EXTRACT(EPOCH FROM trial_ends_at) * 1000)::BIGINT,
    'inviteId', issue_record."inviteId",
    'outboxId', issue_record."outboxId",
    'outboxStatus', 'PENDING',
    'createdTransactionId', transaction_id
  );

  INSERT INTO public."SharedBetaTenantActivationCommand" (
    "id",
    "tenantId",
    "requestId",
    "requestDigest",
    "decisionId",
    "markerId",
    "markerPayloadDigest",
    "markerGeneration",
    "buildProvenanceId",
    "actualContextDigest",
    "actualShellDigest",
    "reservationSubjectId",
    "reservationClaimRevision",
    "issueRequestId",
    "issueRequestDigest",
    "issueCommandId",
    "inviteId",
    "outboxId",
    "messageKey",
    "tokenHash",
    "secretCiphertextDigest",
    "workflowLocator",
    "activatedByUserId",
    "entitlementProfileRevision",
    "executionRevisionBefore",
    "executionRevisionAfter",
    "trialPolicyVersion",
    "trialDurationSeconds",
    "trialStartsAt",
    "trialEndsAt",
    "receipt",
    "createdTransactionId",
    "activatedAt"
  )
  VALUES (
    activation_command_id,
    tenant_id,
    request_id,
    request_digest,
    decision_record."id",
    marker_record."id",
    marker_record."payloadDigest",
    marker_record."generation",
    build_record."id",
    runtime_context ->> 'actualContextDigest',
    shell_context ->> 'actualShellDigest',
    decision_record."reservationSubjectId",
    decision_record."expectedClaimRevision",
    dormant_request_id,
    dormant_request_digest,
    issue_record."id",
    issue_record."inviteId",
    issue_record."outboxId",
    issue_record."messageKey",
    issue_record."tokenHash",
    secret_ciphertext_digest,
    decision_record."workflowLocator",
    actor_id,
    tenant_record."entitlementProfileRevision",
    tenant_record."executionRevision",
    tenant_record."executionRevision" + 1,
    trial_policy_version,
    trial_duration_seconds,
    activated_at,
    trial_ends_at,
    activation_receipt,
    transaction_id,
    activated_at
  )
  RETURNING *
  INTO activation_record;

  UPDATE public."Tenant"
  SET
    "status" = 'ACTIVE'::public."TenantLifecycleStatus",
    "onboardingStatus" =
      'OWNER_INVITED'::public."TenantOnboardingStatus",
    "trialStartsAt" = activated_at,
    "trialEndsAt" = trial_ends_at,
    "executionRevision" = tenant_record."executionRevision" + 1,
    "statusChangedAt" = activated_at AT TIME ZONE 'UTC',
    "statusReason" =
      'Shared beta activation ' || activation_command_id,
    "updatedAt" = activated_at AT TIME ZONE 'UTC'
  WHERE "id" = tenant_id
    AND "status" =
      'SUSPENDED'::public."TenantLifecycleStatus"
    AND "customerStage" =
      'PILOT'::public."TenantCustomerStage"
    AND "onboardingStatus" =
      'PROVISIONING'::public."TenantOnboardingStatus"
    AND "trialStartsAt" IS NULL
    AND "trialEndsAt" IS NULL
    AND "entitlementProfileRevision" =
      decision_record."expectedEntitlementProfileRevision"
    AND "executionRevision" =
      decision_record."expectedExecutionRevision"
  RETURNING *
  INTO tenant_record;

  IF NOT FOUND
     OR tenant_record."executionRevision" IS DISTINCT FROM
       activation_record."executionRevisionAfter"
  THEN
    RAISE EXCEPTION 'Shared beta tenant activation CAS failed'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public."TenantAdmissionDecision"
  SET
    "stateRevision" = 2,
    "consumedAt" = activated_at
  WHERE "id" = decision_record."id"
    AND "tenantId" = tenant_id
    AND "stateRevision" = 1
    AND "revokedAt" IS NULL
    AND "consumedAt" IS NULL
    AND "validUntil" > activated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared beta admission consumption CAS failed'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public."IdentityMailOutbox"
  SET
    "status" = 'PENDING'::public."IdentityMailOutboxStatus",
    "releasedAt" = activated_at
  WHERE "id" = outbox_record."id"
    AND "tenantId" = tenant_id
    AND "issueCommandId" = issue_record."id"
    AND "status" = 'HOLD'::public."IdentityMailOutboxStatus"
    AND "releasedAt" IS NULL
    AND "expiresAt" > activated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared beta owner invite release CAS failed'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public."PlatformAdminAuditEvent" (
    "id",
    "tenantId",
    "actorUserId",
    "requestId",
    "action",
    "targetType",
    "targetId",
    "reason",
    "before",
    "after",
    "metadata",
    "createdAt"
  )
  VALUES (
    activation_record."id",
    tenant_id,
    actor_id,
    request_id,
    'SHARED_BETA_TENANT_ACTIVATED',
    'TENANT',
    tenant_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'status', 'SUSPENDED',
      'onboardingStatus', 'PROVISIONING',
      'executionRevision',
        activation_record."executionRevisionBefore"
    ),
    activation_receipt,
    pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'authority', 'SharedBetaTenantActivationCommand',
      'activationCommandId', activation_record."id",
      'markerPayloadDigest',
        activation_record."markerPayloadDigest",
      'actualContextDigest',
        activation_record."actualContextDigest",
      'actualShellDigest', activation_record."actualShellDigest",
      'createdTransactionId',
        activation_record."createdTransactionId"
    ),
    activated_at AT TIME ZONE 'UTC'
  );

  RETURN activation_receipt;
END;
$$;

COMMENT ON TABLE public."SharedBetaRuntimeInstanceAnchor" IS
  'UNLOGGED immutable singleton; absence after backup, standby promotion or crash invalidates copied deployment challenges.';

COMMENT ON COLUMN public."IdentityMailOutbox"."releasedAt" IS
  'Exact activation-transaction timestamp for the sole guarded HOLD-to-PENDING owner-invite release.';

COMMENT ON FUNCTION
  public."shared_beta_build_provenance_persist_v1"(
    TEXT,
    TEXT,
    TEXT,
    TIMESTAMP(3) WITH TIME ZONE,
    TEXT,
    TEXT,
    TEXT,
    INTEGER,
    TEXT,
    TEXT,
    TEXT,
    INTEGER,
    TEXT,
    JSONB,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TIMESTAMP(3) WITH TIME ZONE
  ) IS
  'Owner-only persistence/replay boundary for one externally verified, signed shared-beta build provenance payload.';

COMMENT ON FUNCTION
  public."shared_beta_runtime_release_challenge_create_v1"(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TIMESTAMP(3) WITH TIME ZONE
  ) IS
  'Owner-only one-shot database challenge bound to the exact build, database, migration state and dedicated activation role.';

COMMENT ON FUNCTION
  public."shared_beta_runtime_release_marker_persist_v1"(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    BIGINT,
    TEXT,
    TEXT,
    TEXT,
    BIGINT,
    TIMESTAMP(3) WITH TIME ZONE,
    JSONB,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TIMESTAMP(3) WITH TIME ZONE
  ) IS
  'Owner-only persistence/replay boundary for one externally verified, signed deployment marker consuming an exact database challenge.';

COMMENT ON FUNCTION
  public."shared_beta_runtime_actual_context_assert_v1"(TEXT) IS
  'Owner-only fail-closed assertion that the requested marker remains the sole current unexpired runtime and matches actual database state.';

COMMENT ON FUNCTION
  public."shared_beta_tenant_actual_shell_v1"(TEXT) IS
  'Owner-only locking proof of the exact dormant tenant shell, owner reservation or HOLD aggregate, entitlements and zero integration state.';

COMMENT ON FUNCTION
  public."shared_beta_tenant_activate_v1"(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    BYTEA,
    TIMESTAMP(3) WITH TIME ZONE
  ) IS
  'Sole post-enrollment coordinator for SERIALIZABLE atomic tenant activation, admission consumption and initial OWNER invite HOLD-to-PENDING release.';

REVOKE ALL
ON FUNCTION public."shared_beta_build_provenance_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_activation_role_assert_v1"(
  TEXT,
  BIGINT
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_release_challenge_create_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMP(3) WITH TIME ZONE
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_actual_context_from_challenge_v1"(
  TEXT
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_release_marker_persist_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  TIMESTAMP(3) WITH TIME ZONE,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMP(3) WITH TIME ZONE
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_instance_anchor_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_challenge_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_marker_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_state_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_activation_command_immutable_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_canonical_json_v1"(JSONB)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_digest_v1"(TEXT, JSONB)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_migration_state_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_database_identity_digest_v1"(
  TEXT
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_build_provenance_persist_v1"(
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMP(3) WITH TIME ZONE,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMP(3) WITH TIME ZONE
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_runtime_actual_context_assert_v1"(TEXT)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_tenant_admission_decision_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."identity_mail_outbox_release_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_tenant_activation_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_activation_audit_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_tenant_actual_shell_v1"(TEXT)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_tenant_activate_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BYTEA,
  TIMESTAMP(3) WITH TIME ZONE
)
FROM PUBLIC;

-- A fresh NOINHERIT activation role would otherwise inherit EXECUTE on these
-- legacy application helpers from PUBLIC and could never satisfy the exact
-- zero-authority challenge precondition. Trigger execution does not require
-- callers to retain EXECUTE on the trigger routine itself.
REVOKE ALL
ON FUNCTION public."assert_staff_attachment_state"(TEXT)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."check_staff_attachment_binding_state"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."check_staff_attachment_row_state"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."check_store_access_scope_invariants"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."check_user_access_scope_invariants"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."check_user_store_access_invariants"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."ensure_guest_game_reward_claim_deadline"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."guard_guest_bonus_ledger_reward_claim"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."lock_staff_attachment_binding_delete"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."prepare_staff_attachment_binding"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."resolve_staff_attachment_resource_scope"(
  public."StaffAttachmentResourceKind",
  TEXT
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."serialize_store_tenant_change"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."serialize_user_access_scope_change"()
FROM PUBLIC;

REVOKE ALL ON TABLE public."SharedBetaRuntimeInstanceAnchor" FROM PUBLIC;
REVOKE ALL ON TABLE public."SharedBetaBuildProvenance" FROM PUBLIC;
REVOKE ALL ON TABLE public."SharedBetaRuntimeReleaseChallenge" FROM PUBLIC;
REVOKE ALL ON TABLE public."SharedBetaRuntimeReleaseMarker" FROM PUBLIC;
REVOKE ALL ON TABLE public."SharedBetaRuntimeReleaseState" FROM PUBLIC;
REVOKE ALL
ON TABLE public."SharedBetaTenantActivationCommand"
FROM PUBLIC;
REVOKE ALL ON TABLE public."IdentityMailOutbox" FROM PUBLIC;
REVOKE ALL ON TABLE public."TenantAdmissionDecision" FROM PUBLIC;

-- REVOKE FROM PUBLIC is insufficient when an operator has installed hostile
-- ALTER DEFAULT PRIVILEGES for a named role. Abort the whole transactional
-- migration unless every new object, the two altered relations and the new
-- releasedAt column have exact owner-only ACLs.
DO $owner_only_acl$
DECLARE
  new_table_count INTEGER;
  instance_anchor_count INTEGER;
  guarded_table_count INTEGER;
  guarded_column_count INTEGER;
  released_at_count INTEGER;
  guarded_function_count INTEGER;
  unsafe_acl_count INTEGER;
BEGIN
  SELECT pg_catalog.count(*)
  INTO instance_anchor_count
  FROM pg_catalog.pg_class AS relation
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'SharedBetaRuntimeInstanceAnchor'
    AND relation.relkind = 'r'
    AND relation.relpersistence = 'u';

  SELECT pg_catalog.count(*)
  INTO new_table_count
  FROM pg_catalog.pg_class AS relation
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname IN (
      'SharedBetaRuntimeInstanceAnchor',
      'SharedBetaBuildProvenance',
      'SharedBetaRuntimeReleaseChallenge',
      'SharedBetaRuntimeReleaseMarker',
      'SharedBetaRuntimeReleaseState',
      'SharedBetaTenantActivationCommand'
    );

  SELECT pg_catalog.count(*)
  INTO guarded_table_count
  FROM pg_catalog.pg_class AS relation
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname IN (
      'SharedBetaRuntimeInstanceAnchor',
      'SharedBetaBuildProvenance',
      'SharedBetaRuntimeReleaseChallenge',
      'SharedBetaRuntimeReleaseMarker',
      'SharedBetaRuntimeReleaseState',
      'SharedBetaTenantActivationCommand',
      'IdentityMailOutbox',
      'TenantAdmissionDecision'
    );

  SELECT pg_catalog.count(*)
  INTO guarded_column_count
  FROM pg_catalog.pg_attribute AS attribute
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = attribute.attrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND (
      relation.relname IN (
        'SharedBetaRuntimeInstanceAnchor',
        'SharedBetaBuildProvenance',
        'SharedBetaRuntimeReleaseChallenge',
        'SharedBetaRuntimeReleaseMarker',
        'SharedBetaRuntimeReleaseState',
        'SharedBetaTenantActivationCommand'
      )
      OR (
        relation.relname = 'IdentityMailOutbox'
        AND attribute.attname = 'releasedAt'
      )
    );

  SELECT pg_catalog.count(*)
  INTO released_at_count
  FROM pg_catalog.pg_attribute AS attribute
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = attribute.attrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'IdentityMailOutbox'
    AND relation.relkind = 'r'
    AND attribute.attname = 'releasedAt'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND pg_catalog.format_type(
      attribute.atttypid,
      attribute.atttypmod
    ) = 'timestamp(3) with time zone';

  SELECT pg_catalog.count(*)
  INTO guarded_function_count
  FROM pg_catalog.pg_proc AS procedure
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'assert_staff_attachment_state',
      'check_staff_attachment_binding_state',
      'check_staff_attachment_row_state',
      'check_store_access_scope_invariants',
      'check_user_access_scope_invariants',
      'check_user_store_access_invariants',
      'ensure_guest_game_reward_claim_deadline',
      'guard_guest_bonus_ledger_reward_claim',
      'lock_staff_attachment_binding_delete',
      'prepare_staff_attachment_binding',
      'resolve_staff_attachment_resource_scope',
      'serialize_store_tenant_change',
      'serialize_user_access_scope_change',
      'shared_beta_runtime_instance_anchor_guard_v1',
      'shared_beta_build_provenance_guard_v1',
      'shared_beta_runtime_activation_role_assert_v1',
      'shared_beta_runtime_release_challenge_create_v1',
      'shared_beta_runtime_actual_context_from_challenge_v1',
      'shared_beta_runtime_release_marker_persist_v1',
      'shared_beta_runtime_challenge_guard_v1',
      'shared_beta_runtime_marker_guard_v1',
      'shared_beta_runtime_state_guard_v1',
      'shared_beta_activation_command_immutable_v1',
      'shared_beta_runtime_canonical_json_v1',
      'shared_beta_runtime_digest_v1',
      'shared_beta_runtime_migration_state_v1',
      'shared_beta_runtime_database_identity_digest_v1',
      'shared_beta_build_provenance_persist_v1',
      'shared_beta_runtime_actual_context_assert_v1',
      'shared_beta_tenant_admission_decision_guard_v1',
      'identity_mail_outbox_release_guard_v1',
      'shared_beta_tenant_activation_guard_v1',
      'shared_beta_activation_audit_guard_v1',
      'shared_beta_tenant_actual_shell_v1',
      'shared_beta_tenant_activate_v1'
    );

  IF instance_anchor_count <> 1
     OR new_table_count <> 6
     OR guarded_table_count <> 8
     OR guarded_column_count <> 123
     OR released_at_count <> 1
     OR guarded_function_count <> 35
  THEN
    RAISE EXCEPTION
      'Shared beta runtime activation ACL inventory is incomplete'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)
  INTO unsafe_acl_count
  FROM (
    SELECT relation.oid AS object_oid, acl.grantee
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relname IN (
        'SharedBetaRuntimeInstanceAnchor',
        'SharedBetaBuildProvenance',
        'SharedBetaRuntimeReleaseChallenge',
        'SharedBetaRuntimeReleaseMarker',
        'SharedBetaRuntimeReleaseState',
        'SharedBetaTenantActivationCommand',
        'IdentityMailOutbox',
        'TenantAdmissionDecision'
      )
      AND acl.grantee <> relation.relowner

    UNION ALL

    SELECT attribute.attrelid AS object_oid, acl.grantee
    FROM pg_catalog.pg_attribute AS attribute
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND (
        relation.relname IN (
          'SharedBetaRuntimeInstanceAnchor',
          'SharedBetaBuildProvenance',
          'SharedBetaRuntimeReleaseChallenge',
          'SharedBetaRuntimeReleaseMarker',
          'SharedBetaRuntimeReleaseState',
          'SharedBetaTenantActivationCommand'
        )
        OR (
          relation.relname = 'IdentityMailOutbox'
          AND attribute.attname = 'releasedAt'
        )
      )
      AND acl.grantee <> relation.relowner

    UNION ALL

    SELECT procedure.oid AS object_oid, acl.grantee
    FROM pg_catalog.pg_proc AS procedure
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'assert_staff_attachment_state',
        'check_staff_attachment_binding_state',
        'check_staff_attachment_row_state',
        'check_store_access_scope_invariants',
        'check_user_access_scope_invariants',
        'check_user_store_access_invariants',
        'ensure_guest_game_reward_claim_deadline',
        'guard_guest_bonus_ledger_reward_claim',
        'lock_staff_attachment_binding_delete',
        'prepare_staff_attachment_binding',
        'resolve_staff_attachment_resource_scope',
        'serialize_store_tenant_change',
        'serialize_user_access_scope_change',
        'shared_beta_runtime_instance_anchor_guard_v1',
        'shared_beta_build_provenance_guard_v1',
        'shared_beta_runtime_activation_role_assert_v1',
        'shared_beta_runtime_release_challenge_create_v1',
        'shared_beta_runtime_actual_context_from_challenge_v1',
        'shared_beta_runtime_release_marker_persist_v1',
        'shared_beta_runtime_challenge_guard_v1',
        'shared_beta_runtime_marker_guard_v1',
        'shared_beta_runtime_state_guard_v1',
        'shared_beta_activation_command_immutable_v1',
        'shared_beta_runtime_canonical_json_v1',
        'shared_beta_runtime_digest_v1',
        'shared_beta_runtime_migration_state_v1',
        'shared_beta_runtime_database_identity_digest_v1',
        'shared_beta_build_provenance_persist_v1',
        'shared_beta_runtime_actual_context_assert_v1',
        'shared_beta_tenant_admission_decision_guard_v1',
        'identity_mail_outbox_release_guard_v1',
        'shared_beta_tenant_activation_guard_v1',
        'shared_beta_activation_audit_guard_v1',
        'shared_beta_tenant_actual_shell_v1',
        'shared_beta_tenant_activate_v1'
      )
      AND acl.grantee <> procedure.proowner
  ) AS unsafe_acl;

  IF unsafe_acl_count <> 0 THEN
    RAISE EXCEPTION
      'Shared beta runtime activation objects require owner-only ACL'
      USING ERRCODE = '55000';
  END IF;
END;
$owner_only_acl$;

COMMIT;
