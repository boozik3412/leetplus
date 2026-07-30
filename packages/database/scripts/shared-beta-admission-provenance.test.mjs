import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
} from "node:crypto";
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import * as provenanceModule from "./shared-beta-admission-provenance.mjs";
import {
  PINNED_SHARED_BETA_ADMISSION_ROOTS,
  RELEASE_GATE_ATTESTATION_CONTRACT,
  RELEASE_GATE_ATTESTATION_KIND,
  SHARED_BETA_ADMISSION_PROFILE,
  SHARED_BETA_ADMISSION_PURPOSE,
  SHARED_BETA_GATE_SET_VERSION,
  SHARED_BETA_RELEASE_GATE_CODES,
  TENANT_ADMISSION_DECISION_CONTRACT,
  TENANT_ADMISSION_DECISION_KIND,
  assertSyntheticLoopbackImportContext,
  decisionCreateArguments,
  gatePersistArguments,
  sharedBetaPayloadDigest,
  sharedBetaPublicKeyFingerprint,
  verifyPinnedReleaseGateAttestationEnvelope,
  verifyPinnedTenantAdmissionDecisionEnvelope,
  verifySyntheticReleaseGateAttestationEnvelope,
  verifySyntheticTenantAdmissionDecisionEnvelope,
} from "./shared-beta-admission-provenance.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DATABASE_ROOT = resolve(SCRIPT_DIR, "..");
const MIGRATION_PATH = join(
  DATABASE_ROOT,
  "prisma",
  "migrations",
  "20260730020000_shared_beta_admission_provenance",
  "migration.sql",
);
const SCHEMA_PATH = join(DATABASE_ROOT, "prisma", "schema.prisma");
const NOW = new Date("2026-07-30T09:00:00.000Z");
const RELEASE_SHA = "a".repeat(40);
const SYNTHETIC_CONTEXT = Object.freeze({
  databaseName: "lp_admission_test_ci",
  explicitConfirmation: "allow-synthetic-shared-beta-admission-provenance",
  hostname: "127.0.0.1",
  nodeEnv: "test",
});
const DIGESTS = Object.freeze({
  artifact: "b".repeat(64),
  policy: "c".repeat(64),
  database: "d".repeat(64),
  profile: "e".repeat(64),
  gates: "f".repeat(64),
  request: "1".repeat(64),
  shell: "2".repeat(64),
  approval: "3".repeat(64),
});

function authorityFixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const keyId = "shared-beta-ci-root-v1";
  const publicKeyFingerprint =
    sharedBetaPublicKeyFingerprint(publicKeyPem);
  return {
    privateKey,
    keyId,
    publicKeyFingerprint,
    roots: {
      [keyId]: {
        algorithm: "Ed25519",
        keyId,
        notAfter: "2026-08-06T00:00:00.000Z",
        notBefore: "2026-07-30T00:00:00.000Z",
        profile: SHARED_BETA_ADMISSION_PROFILE,
        publicKeyFingerprint,
        publicKeyPem,
        purpose: SHARED_BETA_ADMISSION_PURPOSE,
        status: "ACTIVE",
      },
    },
  };
}

function envelope(payload, fixture) {
  const signature = sign(
    null,
    Buffer.from(canonicalStringify(payload), "utf8"),
    fixture.privateKey,
  ).toString("base64url");
  return {
    payload,
    payloadDigest: sharedBetaPayloadDigest(payload),
    publicKeyFingerprint: fixture.publicKeyFingerprint,
    signature,
    signatureAlgorithm: "Ed25519",
    signingKeyId: fixture.keyId,
  };
}

function gatePayload(fixture, gateCode = SHARED_BETA_RELEASE_GATE_CODES[0]) {
  return {
    artifactDigest: DIGESTS.artifact,
    contractVersion: RELEASE_GATE_ATTESTATION_CONTRACT,
    environment: "ci",
    gateCode,
    kind: RELEASE_GATE_ATTESTATION_KIND,
    migrationCount: 172,
    passedAtEpochMs: Date.parse("2026-07-30T08:55:00.000Z"),
    policyManifestDigest: DIGESTS.policy,
    profile: SHARED_BETA_ADMISSION_PROFILE,
    provenanceKeyVersion: "shared-beta-provenance-v1",
    publicKeyFingerprint: fixture.publicKeyFingerprint,
    purpose: SHARED_BETA_ADMISSION_PURPOSE,
    releaseSha: RELEASE_SHA,
    schemaHead: "20260730020000_shared_beta_admission_provenance",
    schemaVersion: 1,
    signingKeyId: fixture.keyId,
    validUntilEpochMs: Date.parse("2026-07-30T21:00:00.000Z"),
  };
}

function decisionPayload(fixture) {
  return {
    approvalReferenceDigest: DIGESTS.approval,
    approvedAtEpochMs: Date.parse("2026-07-30T08:58:00.000Z"),
    approvedByUserId: randomUUID(),
    artifactDigest: DIGESTS.artifact,
    contractVersion: TENANT_ADMISSION_DECISION_CONTRACT,
    databaseIdentityDigest: DIGESTS.database,
    decision: "GO",
    decisionId: randomUUID(),
    environment: "ci",
    expectedClaimRevision: 1,
    expectedEntitlementProfileRevision: 1,
    expectedExecutionRevision: 0,
    gateSetDigest: DIGESTS.gates,
    gateSetVersion: SHARED_BETA_GATE_SET_VERSION,
    kind: TENANT_ADMISSION_DECISION_KIND,
    migrationCount: 172,
    policyManifestDigest: DIGESTS.policy,
    profile: SHARED_BETA_ADMISSION_PROFILE,
    profileDigest: DIGESTS.profile,
    publicKeyFingerprint: fixture.publicKeyFingerprint,
    purpose: SHARED_BETA_ADMISSION_PURPOSE,
    releaseSha: RELEASE_SHA,
    requestDigest: DIGESTS.request,
    requestId: randomUUID(),
    reservationSubjectId: randomUUID(),
    schemaHead: "20260730020000_shared_beta_admission_provenance",
    schemaVersion: 1,
    shellEvidenceDigest: DIGESTS.shell,
    signingKeyId: fixture.keyId,
    tenantId: randomUUID(),
    validUntilEpochMs: Date.parse("2026-07-30T20:00:00.000Z"),
    workflowLocator: randomUUID(),
  };
}

function expectCode(action, code) {
  assert.throws(action, (error) => error?.code === code);
}

test("production shared-beta authority registry is deliberately empty", () => {
  assert.deepEqual(PINNED_SHARED_BETA_ADMISSION_ROOTS, {});
  assert(Object.isFrozen(PINNED_SHARED_BETA_ADMISSION_ROOTS));
  const fixture = authorityFixture();
  expectCode(
    () =>
      verifyPinnedReleaseGateAttestationEnvelope(
        envelope(gatePayload(fixture), fixture),
        NOW,
      ),
    "SHARED_BETA_AUTHORITY_NOT_ENROLLED",
  );
  expectCode(
    () =>
      verifyPinnedTenantAdmissionDecisionEnvelope(
        envelope(decisionPayload(fixture), fixture),
        NOW,
      ),
    "SHARED_BETA_AUTHORITY_NOT_ENROLLED",
  );
});

test("authority lookup rejects inherited roots for pinned and synthetic registries", () => {
  const fixture = authorityFixture();
  const gateEnvelope = envelope(gatePayload(fixture), fixture);
  const inheritedRegistry = Object.create({
    [fixture.keyId]: fixture.roots[fixture.keyId],
  });
  expectCode(
    () =>
      verifySyntheticReleaseGateAttestationEnvelope(
        gateEnvelope,
        inheritedRegistry,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_AUTHORITY_NOT_ENROLLED",
  );

  const installed = Reflect.defineProperty(Object.prototype, fixture.keyId, {
    configurable: true,
    enumerable: false,
    value: fixture.roots[fixture.keyId],
    writable: false,
  });
  assert.equal(installed, true);
  try {
    expectCode(
      () => verifyPinnedReleaseGateAttestationEnvelope(gateEnvelope, NOW),
      "SHARED_BETA_AUTHORITY_NOT_ENROLLED",
    );
  } finally {
    assert.equal(Reflect.deleteProperty(Object.prototype, fixture.keyId), true);
  }
});

test("verification snapshots envelope and payload data before validation and handoff", () => {
  const fixture = authorityFixture();
  const originalPayload = gatePayload(fixture);
  const originalEnvelope = envelope(originalPayload, fixture);
  let releaseShaReads = 0;
  let payloadDigestReads = 0;
  const dynamicPayload = new Proxy(originalPayload, {
    get(target, property, receiver) {
      if (property === "releaseSha") {
        releaseShaReads += 1;
        return releaseShaReads >= 3 ? "9".repeat(40) : target.releaseSha;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const dynamicEnvelope = new Proxy(
    { ...originalEnvelope, payload: dynamicPayload },
    {
      get(target, property, receiver) {
        if (property === "payloadDigest") {
          payloadDigestReads += 1;
          return payloadDigestReads >= 3
            ? "0".repeat(64)
            : target.payloadDigest;
        }
        return Reflect.get(target, property, receiver);
      },
    },
  );

  const verified = verifySyntheticReleaseGateAttestationEnvelope(
    dynamicEnvelope,
    fixture.roots,
    SYNTHETIC_CONTEXT,
    NOW,
  );
  const args = gatePersistArguments(verified, randomUUID());
  assert.equal(releaseShaReads, 0);
  assert.equal(payloadDigestReads, 0);
  assert.equal(verified.payload.releaseSha, originalPayload.releaseSha);
  assert.equal(verified.payloadDigest, originalEnvelope.payloadDigest);
  assert.equal(
    args.candidatePayloadDigest,
    sharedBetaPayloadDigest(args.candidatePayload),
  );
});

test("one exact Ed25519 gate envelope becomes a branded DB import", () => {
  const fixture = authorityFixture();
  const payload = gatePayload(fixture);
  const verified = verifySyntheticReleaseGateAttestationEnvelope(
    envelope(payload, fixture),
    fixture.roots,
    SYNTHETIC_CONTEXT,
    NOW,
  );
  const attestationId = randomUUID();
  const args = gatePersistArguments(verified, attestationId);
  assert.equal(args.candidateAttestationId, attestationId);
  assert.equal(args.candidateGateCode, payload.gateCode);
  assert.equal(args.candidateMigrationCount, 172);
  assert.equal(args.candidatePayloadDigest, sharedBetaPayloadDigest(payload));
  assert.match(args.candidateSignatureBase64url, /^[A-Za-z0-9_-]{86}$/u);
  assert.deepEqual(args.candidatePayload, payload);
  assert.equal(typeof verified.signature, "string");
  assert.throws(() => {
    verified.signature = Buffer.alloc(64);
  }, TypeError);
  const afterMutationAttempt = gatePersistArguments(verified, attestationId);
  assert.equal(
    afterMutationAttempt.candidateSignatureBase64url,
    args.candidateSignatureBase64url,
  );
  expectCode(
    () =>
      gatePersistArguments(
        {
          ...verified,
          candidateGateCode: SHARED_BETA_RELEASE_GATE_CODES[1],
        },
        randomUUID(),
      ),
    "SHARED_BETA_GATE_IMPORT_NOT_VERIFIED",
  );
});

test("gate verification rejects payload, signature, root, and timeline drift", () => {
  const fixture = authorityFixture();
  const original = envelope(gatePayload(fixture), fixture);
  expectCode(
    () =>
      verifySyntheticReleaseGateAttestationEnvelope(
        {
          ...original,
          payload: { ...original.payload, releaseSha: "9".repeat(40) },
        },
        fixture.roots,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_PROVENANCE_BINDING_INVALID",
  );
  expectCode(
    () =>
      verifySyntheticReleaseGateAttestationEnvelope(
        { ...original, signature: Buffer.alloc(64).toString("base64url") },
        fixture.roots,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_PROVENANCE_SIGNATURE_INVALID",
  );
  expectCode(
    () =>
      verifySyntheticReleaseGateAttestationEnvelope(
        original,
        {},
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_AUTHORITY_NOT_ENROLLED",
  );
  const expiredPayload = {
    ...original.payload,
    validUntilEpochMs: NOW.valueOf(),
  };
  expectCode(
    () =>
      verifySyntheticReleaseGateAttestationEnvelope(
        envelope(expiredPayload, fixture),
        fixture.roots,
        SYNTHETIC_CONTEXT,
        NOW,
    ),
    "SHARED_BETA_GATE_ATTESTATION_INVALID",
  );
  const backdatedPayload = {
    ...original.payload,
    passedAtEpochMs: Date.parse("2026-07-29T23:59:59.000Z"),
  };
  expectCode(
    () =>
      verifySyntheticReleaseGateAttestationEnvelope(
        envelope(backdatedPayload, fixture),
        fixture.roots,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_GATE_ATTESTATION_INVALID",
  );
  const shortRootRegistry = {
    [fixture.keyId]: {
      ...fixture.roots[fixture.keyId],
      notAfter: "2026-07-30T12:00:00.000Z",
    },
  };
  expectCode(
    () =>
      verifySyntheticReleaseGateAttestationEnvelope(
        original,
        shortRootRegistry,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_GATE_ATTESTATION_INVALID",
  );
});

test("decision approval and validity stay within the signing root window", () => {
  const fixture = authorityFixture();
  const originalPayload = decisionPayload(fixture);
  const backdatedPayload = {
    ...originalPayload,
    approvedAtEpochMs: Date.parse("2026-07-29T23:59:59.000Z"),
  };
  expectCode(
    () =>
      verifySyntheticTenantAdmissionDecisionEnvelope(
        envelope(backdatedPayload, fixture),
        fixture.roots,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_ADMISSION_DECISION_INVALID",
  );
  const shortRootRegistry = {
    [fixture.keyId]: {
      ...fixture.roots[fixture.keyId],
      notAfter: "2026-07-30T12:00:00.000Z",
    },
  };
  expectCode(
    () =>
      verifySyntheticTenantAdmissionDecisionEnvelope(
        envelope(originalPayload, fixture),
        shortRootRegistry,
        SYNTHETIC_CONTEXT,
        NOW,
      ),
    "SHARED_BETA_ADMISSION_DECISION_INVALID",
  );
});

test("signed tenant GO binds identity, database, revisions and exact gate ids", () => {
  const fixture = authorityFixture();
  const payload = decisionPayload(fixture);
  const verified = verifySyntheticTenantAdmissionDecisionEnvelope(
    envelope(payload, fixture),
    fixture.roots,
    SYNTHETIC_CONTEXT,
    NOW,
  );
  const gateIds = {
    EMAIL_INVITE_WORKFLOW_VERIFIED: randomUUID(),
    MODULE_POLICY_ENFORCED: randomUUID(),
    POSTGRESQL_RELEASE_REHEARSAL_VERIFIED: randomUUID(),
  };
  const args = decisionCreateArguments(verified, gateIds);
  assert.equal(args.decisionId, payload.decisionId);
  assert.equal(args.workflowLocator, payload.workflowLocator);
  assert.equal(args.databaseIdentityDigest, DIGESTS.database);
  assert.equal(args.expectedEntitlementProfileRevision, 1);
  assert.match(args.candidateSignatureBase64url, /^[A-Za-z0-9_-]{86}$/u);
  assert.equal(typeof verified.signature, "string");
  assert.throws(() => {
    verified.signature = Buffer.alloc(64);
  }, TypeError);
  const afterMutationAttempt = decisionCreateArguments(verified, gateIds);
  assert.equal(
    afterMutationAttempt.candidateSignatureBase64url,
    args.candidateSignatureBase64url,
  );
  assert.equal(
    args.modulePolicyAttestationId,
    gateIds.MODULE_POLICY_ENFORCED,
  );
  expectCode(
    () =>
      decisionCreateArguments(verified, {
        ...gateIds,
        EMAIL_INVITE_WORKFLOW_VERIFIED: gateIds.MODULE_POLICY_ENFORCED,
      }),
    "SHARED_BETA_DECISION_GATE_IDS_INVALID",
  );
});

test("tampering signed tenant or database claims invalidates the signature", () => {
  const fixture = authorityFixture();
  const original = envelope(decisionPayload(fixture), fixture);
  for (const mutation of [
    { tenantId: randomUUID() },
    { databaseIdentityDigest: "7".repeat(64) },
    { expectedExecutionRevision: 1 },
    { workflowLocator: randomUUID() },
  ]) {
    expectCode(
      () =>
        verifySyntheticTenantAdmissionDecisionEnvelope(
          { ...original, payload: { ...original.payload, ...mutation } },
          fixture.roots,
          SYNTHETIC_CONTEXT,
          NOW,
        ),
      "SHARED_BETA_PROVENANCE_BINDING_INVALID",
    );
  }
});

test("synthetic keys require explicit loopback non-production CI context", () => {
  assert.equal(
    provenanceModule.verifyReleaseGateAttestationEnvelope,
    undefined,
  );
  assert.equal(
    provenanceModule.verifyTenantAdmissionDecisionEnvelope,
    undefined,
  );
  assert.equal(
    assertSyntheticLoopbackImportContext({
      databaseName: "lp_admission_test_ci",
      explicitConfirmation:
        "allow-synthetic-shared-beta-admission-provenance",
      hostname: "127.0.0.1",
      nodeEnv: "test",
    }),
    true,
  );
  for (const context of [
    {
      databaseName: "production",
      explicitConfirmation:
        "allow-synthetic-shared-beta-admission-provenance",
      hostname: "127.0.0.1",
      nodeEnv: "test",
    },
    {
      databaseName: "lp_admission_test_ci",
      explicitConfirmation:
        "allow-synthetic-shared-beta-admission-provenance",
      hostname: "db.example.test",
      nodeEnv: "test",
    },
    {
      databaseName: "lp_admission_test_ci",
      explicitConfirmation:
        "allow-synthetic-shared-beta-admission-provenance",
      hostname: "127.0.0.1",
      nodeEnv: "production",
    },
  ]) {
    expectCode(
      () => assertSyntheticLoopbackImportContext(context),
      "SHARED_BETA_SYNTHETIC_CONTEXT_DENIED",
    );
    const fixture = authorityFixture();
    expectCode(
      () =>
        verifySyntheticReleaseGateAttestationEnvelope(
          envelope(gatePayload(fixture), fixture),
          fixture.roots,
          context,
          NOW,
        ),
      "SHARED_BETA_SYNTHETIC_CONTEXT_DENIED",
    );
  }
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    expectCode(
      () =>
        assertSyntheticLoopbackImportContext({
          ...SYNTHETIC_CONTEXT,
          nodeEnv: "test",
        }),
      "SHARED_BETA_SYNTHETIC_CONTEXT_DENIED",
    );
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});

test("migration 172 is sealed, exact-three-gate, signed and non-consuming", async () => {
  const [migration, schema] = await Promise.all([
    readFile(MIGRATION_PATH, "utf8"),
    readFile(SCHEMA_PATH, "utf8"),
  ]);
  const createStart = migration.indexOf(
    'CREATE FUNCTION public."shared_beta_tenant_admission_decision_create_v1"',
  );
  const assertStart = migration.indexOf(
    'CREATE FUNCTION public."shared_beta_tenant_admission_decision_assert_v1"',
  );
  const revokeStart = migration.indexOf(
    'CREATE FUNCTION public."shared_beta_tenant_admission_decision_revoke_v1"',
  );
  const gateRevokeStart = migration.indexOf(
    'CREATE FUNCTION public."shared_beta_release_gate_attestation_revoke_v1"',
  );
  assert(createStart >= 0);
  assert(assertStart > createStart);
  assert(revokeStart > assertStart);
  const createEnd = migration.indexOf("\n$$;", createStart);
  const assertEnd = migration.indexOf("\n$$;", assertStart);
  const gateRevokeEnd = migration.indexOf("\n$$;", gateRevokeStart);
  const revokeEnd = migration.indexOf("\n$$;", revokeStart);
  assert(createEnd > createStart);
  assert(assertEnd > assertStart);
  assert(gateRevokeEnd > gateRevokeStart);
  assert(revokeEnd > revokeStart);
  const createFunction = migration.slice(createStart, createEnd + 4);
  const assertFunction = migration.slice(assertStart, assertEnd + 4);
  const gateRevokeFunction = migration.slice(
    gateRevokeStart,
    gateRevokeEnd + 4,
  );
  const revokeFunction = migration.slice(revokeStart, revokeEnd + 4);
  assert.match(
    migration,
    /CREATE TYPE public\."SharedBetaReleaseGateCode" AS ENUM \(\s*'MODULE_POLICY_ENFORCED',\s*'EMAIL_INVITE_WORKFLOW_VERIFIED',\s*'POSTGRESQL_RELEASE_REHEARSAL_VERIFIED'\s*\)/u,
  );
  for (const table of [
    "ReleaseGateAttestation",
    "TenantAdmissionDecision",
    "TenantAdmissionDecisionGate",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\."${table}"`, "u"));
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON TABLE public\\."${table}" FROM PUBLIC`, "u"),
    );
    assert.match(schema, new RegExp(`model ${table} \\{`, "u"));
  }
  for (const field of [
    "workflowLocator",
    "reservationSubjectId",
    "expectedClaimRevision",
    "shellEvidenceDigest",
    "expectedEntitlementProfileRevision",
    "databaseIdentityDigest",
    "migrationCount",
    "requestId",
    "requestDigest",
    "payloadDigest",
    "signingKeyId",
    "publicKeyFingerprint",
    "consumedAt",
  ]) {
    assert.match(migration, new RegExp(`"${field}"`, "u"));
    assert.match(schema, new RegExp(`\\b${field}\\b`, "u"));
  }
  assert.match(
    migration,
    /"consumedAt" IS NULL[\s\S]*"consumedAt" IS NULL/u,
  );
  assert.doesNotMatch(
    migration,
    /HOLD\s*(?:->|→)\s*PENDING|ALTER TYPE public\."IdentityMailOutboxStatus"|UPDATE public\."Tenant"\s+SET|UPDATE public\."IdentityMailOutbox"/u,
  );
  assert.match(
    migration,
    /guarded_table_count <> 3[\s\S]*guarded_column_count <> 64[\s\S]*guarded_function_count <> 9/u,
  );
  assert.match(migration, /require owner-only ACL/u);
  assert.doesNotMatch(
    migration,
    /\bGRANT\s+(?:EXECUTE|SELECT|INSERT|UPDATE|DELETE)\b/iu,
  );
  assert.match(
    createFunction,
    /FROM public\."IdentityEmailClaim" AS claim[\s\S]*?WHERE claim\."workflowLocator" = workflow_locator\s+FOR UPDATE;/u,
  );
  assert.match(
    assertFunction,
    /FROM public\."IdentityEmailClaim" AS claim[\s\S]*?WHERE claim\."workflowLocator" = workflow_locator\s+FOR UPDATE;/u,
  );
  assert.doesNotMatch(
    createFunction,
    /IdentityOwnerInviteIssueCommand|ISSUED_HOLD/u,
  );
  assert.match(
    assertFunction,
    /public\."IdentityOwnerInviteIssueCommand"[\s\S]*public\."UserInvite"[\s\S]*public\."IdentityMailOutbox"/u,
  );
  assert.match(
    assertFunction,
    /identity_state := 'RESERVATION'[\s\S]*identity_state := 'ISSUED_HOLD'/u,
  );
  for (const functionBody of [createFunction, assertFunction]) {
    assert.match(
      functionBody,
      /ORDER BY attestation\."gateCode"::TEXT, attestation\."id"\s+FOR UPDATE/u,
    );
    assert.match(functionBody, /FOR NO KEY UPDATE;/u);
  }
  assert.match(
    createFunction,
    /GET DIAGNOSTICS locked_gate_count = ROW_COUNT;\s+IF locked_gate_count <> 3 THEN[\s\S]*Tenant admission gate set is unavailable/u,
  );
  assert.match(
    createFunction,
    /FROM public\."User" AS approver[\s\S]*?approver\."isPlatformAdmin" = true\s+FOR NO KEY UPDATE;/u,
  );
  const createEntitlementLock = createFunction.indexOf(
    'PERFORM entitlement."id"',
  );
  const rebasedWriteTime = createFunction.lastIndexOf(
    "written_at := pg_catalog.date_trunc(",
  );
  const decisionInsert = createFunction.indexOf(
    'INSERT INTO public."TenantAdmissionDecision"',
  );
  assert(createEntitlementLock >= 0);
  assert(rebasedWriteTime > createEntitlementLock);
  assert(decisionInsert > rebasedWriteTime);
  const assertEntitlementLock = assertFunction.indexOf(
    'PERFORM entitlement."id"',
  );
  const rebasedAssertTime = assertFunction.lastIndexOf(
    "asserted_at := pg_catalog.date_trunc(",
  );
  const assertionReceipt = assertFunction.indexOf(
    "assertion_receipt := pg_catalog.jsonb_build_object(",
  );
  assert(assertEntitlementLock >= 0);
  assert(rebasedAssertTime > assertEntitlementLock);
  assert(assertionReceipt > rebasedAssertTime);
  assert.match(
    assertFunction.slice(rebasedAssertTime, assertionReceipt),
    /decision_record\."validUntil" <= asserted_at[\s\S]*attestation\."validUntil" <= asserted_at[\s\S]*invite_record\."expiresAt" <=/u,
  );
  for (const [functionBody, updateStatement] of [
    [
      gateRevokeFunction,
      'UPDATE public."ReleaseGateAttestation"',
    ],
    [
      revokeFunction,
      'UPDATE public."TenantAdmissionDecision"',
    ],
  ]) {
    const lastRowLock = functionBody.lastIndexOf("FOR UPDATE;");
    const freshRevokeTime = functionBody.indexOf(
      "revoked_at := pg_catalog.date_trunc(",
    );
    const updateStart = functionBody.indexOf(updateStatement);
    assert(lastRowLock >= 0);
    assert(freshRevokeTime > lastRowLock);
    assert(updateStart > freshRevokeTime);
  }
});

test("public-key fingerprint is canonical SPKI DER SHA-256", () => {
  const fixture = authorityFixture();
  const normalized = createPublicKey(fixture.roots[fixture.keyId].publicKeyPem);
  assert.equal(normalized.asymmetricKeyType, "ed25519");
  assert.equal(
    sharedBetaPublicKeyFingerprint(normalized),
    fixture.publicKeyFingerprint,
  );
});
