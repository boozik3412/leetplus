import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  randomUUID,
  sign,
} from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import {
  RELEASE_GATE_ATTESTATION_CONTRACT,
  RELEASE_GATE_ATTESTATION_KIND,
  SHARED_BETA_ADMISSION_PROFILE,
  SHARED_BETA_ADMISSION_PURPOSE,
  SHARED_BETA_GATE_SET_VERSION,
  SHARED_BETA_RELEASE_GATE_CODES,
  TENANT_ADMISSION_DECISION_CONTRACT,
  TENANT_ADMISSION_DECISION_KIND,
  decisionCreateArguments,
  gatePersistArguments,
  sharedBetaPayloadDigest,
  sharedBetaPublicKeyFingerprint,
  verifySyntheticReleaseGateAttestationEnvelope,
  verifySyntheticTenantAdmissionDecisionEnvelope,
} from "./shared-beta-admission-provenance.mjs";

const SCRIPT_NAME = "shared-beta-admission-provenance-smoke";
const CONFIRMATION =
  "run-shared-beta-admission-provenance-smoke";
const DATABASE_PATTERN = /^lp_admission172_[a-z0-9_]{8,48}$/u;
const CI_DATABASE_MARKER_PATTERN =
  /(?:^|_)(?:ci|test|testing)(?:$|_)/u;
const TARGET_MIGRATION =
  "20260730020000_shared_beta_admission_provenance";

const HELP = `
${SCRIPT_NAME}

Runs a synthetic, loopback-only PostgreSQL 16 functional smoke against an
already disposable CURRENT_172 database. The database must be empty of the
three migration-172 sealed relations. The smoke persists exactly three
Ed25519-verified gates and one signed tenant GO, proves replay/assert/CAS
revocation and verifies zero PUBLIC privileges. It never consumes a decision,
activates a tenant, starts trial, releases mail for delivery, or touches a
provider. It creates one dormant owner-invite HOLD aggregate only inside the
disposable database and proves the same GO across that claim transition.

Required:
  DATABASE_URL
    Loopback database named lp_admission172_<random>, schema public.
  SHARED_BETA_ADMISSION_PROVENANCE_SMOKE_CONFIRM
    ${CONFIRMATION}

The database is intentionally not dropped by this script. Its caller owns the
disposable database lifecycle.
`.trim();

function contractError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseArguments(argv) {
  if (argv.includes("--help")) return { help: true, selfTest: false };
  const supported = new Set(["--self-test"]);
  if (argv.some((argument) => !supported.has(argument))) {
    contractError("CLI_ARGUMENT_UNSUPPORTED");
  }
  return { help: false, selfTest: argv.includes("--self-test") };
}

function parseConfig(environment) {
  if (environment.NODE_ENV === "production") {
    contractError("PRODUCTION_ENVIRONMENT_DENIED");
  }
  if (
    environment.SHARED_BETA_ADMISSION_PROVENANCE_SMOKE_CONFIRM !==
    CONFIRMATION
  ) {
    contractError("EXPLICIT_CONFIRMATION_REQUIRED");
  }
  let url;
  try {
    url = new URL(environment.DATABASE_URL);
  } catch {
    contractError("DATABASE_URL_INVALID");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/u, ""));
  if (
    !new Set(["127.0.0.1", "localhost", "::1"]).has(hostname) ||
    !DATABASE_PATTERN.test(databaseName) ||
    !CI_DATABASE_MARKER_PATTERN.test(databaseName) ||
    [...url.searchParams.keys()].some((key) => key !== "schema") ||
    (url.searchParams.has("schema") &&
      url.searchParams.get("schema") !== "public")
  ) {
    contractError("DEDICATED_LOOPBACK_CI_DATABASE_REQUIRED");
  }
  return { databaseName, hostname };
}

function exactNow() {
  return new Date(Math.trunc(Date.now() / 1000) * 1000);
}

function signedEnvelope(payload, fixture) {
  return {
    payload,
    payloadDigest: sharedBetaPayloadDigest(payload),
    publicKeyFingerprint: fixture.publicKeyFingerprint,
    signature: sign(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      fixture.privateKey,
    ).toString("base64url"),
    signatureAlgorithm: "Ed25519",
    signingKeyId: fixture.keyId,
  };
}

function syntheticAuthority(now) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint =
    sharedBetaPublicKeyFingerprint(publicKeyPem);
  const keyId = "shared-beta-loopback-ci-v1";
  return {
    privateKey,
    publicKeyFingerprint,
    keyId,
    roots: {
      [keyId]: {
        algorithm: "Ed25519",
        keyId,
        notAfter: new Date(now.valueOf() + 8 * 60 * 60 * 1_000).toISOString(),
        notBefore: new Date(now.valueOf() - 60 * 60 * 1_000).toISOString(),
        profile: SHARED_BETA_ADMISSION_PROFILE,
        publicKeyFingerprint,
        publicKeyPem,
        purpose: SHARED_BETA_ADMISSION_PURPOSE,
        status: "ACTIVE",
      },
    },
  };
}

async function persistGate(prisma, args) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT public."shared_beta_release_gate_attestation_persist_v1"(
      $1,
      $2::public."SharedBetaReleaseGateCode",
      $3, $4, $5, $6, $7::INTEGER, $8, $9::JSONB, $10, $11, $12,
      $13,
      pg_catalog.decode(
        pg_catalog.rpad(pg_catalog.translate($14, '-_', '+/'), 88, '='),
        'base64'
      ),
      $15::TIMESTAMPTZ, $16::TIMESTAMPTZ
    ) AS receipt`,
    args.candidateAttestationId,
    args.candidateGateCode,
    args.candidateReleaseSha,
    args.candidateEnvironment,
    args.candidateArtifactDigest,
    args.candidateSchemaHead,
    args.candidateMigrationCount,
    args.candidatePolicyManifestDigest,
    JSON.stringify(args.candidatePayload),
    args.candidatePayloadDigest,
    args.candidateSigningKeyId,
    args.candidateProvenanceKeyVersion,
    args.candidatePublicKeyFingerprint,
    args.candidateSignatureBase64url,
    args.candidatePassedAt,
    args.candidateValidUntil,
  );
  return rows[0].receipt;
}

async function gateSetDigestFromImports(prisma, imports) {
  const canonicalSet = imports
    .map((entry) => ({
      attestationId: entry.candidateAttestationId,
      gateCode: entry.candidateGateCode,
      payloadDigest: entry.candidatePayloadDigest,
    }))
    .sort((left, right) =>
      left.gateCode < right.gateCode
        ? -1
        : left.gateCode > right.gateCode
          ? 1
          : 0,
    );
  const [row] = await prisma.$queryRawUnsafe(
    `SELECT pg_catalog.encode(
       pg_catalog.sha256(
         pg_catalog.convert_to(
           'leetplus-shared-beta-gate-set-v1',
           'UTF8'
         )
         || '\\x00'::BYTEA
         || pg_catalog.convert_to($1::JSONB::TEXT, 'UTF8')
       ),
       'hex'
     ) AS digest`,
    JSON.stringify(canonicalSet),
  );
  return row.digest;
}

async function createDecision(prisma, verified, gateIds) {
  const args = decisionCreateArguments(verified, gateIds);
  const payload = verified.payload;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT public."shared_beta_tenant_admission_decision_create_v1"(
      $1, $2, $3, $4, $5, $6, $7::INTEGER, $8, $9, $10, $11, $12,
      $13::INTEGER, $14, $15, $16::INTEGER, $17::INTEGER, $18, $19,
      $20, $21, $22::JSONB, $23, $24, $25,
      pg_catalog.decode(
        pg_catalog.rpad(pg_catalog.translate($26, '-_', '+/'), 88, '='),
        'base64'
      ),
      $27::TIMESTAMPTZ, $28::TIMESTAMPTZ, $29, $30, $31
    ) AS receipt`,
    payload.decisionId,
    payload.tenantId,
    payload.requestId,
    payload.requestDigest,
    payload.workflowLocator,
    payload.reservationSubjectId,
    payload.expectedClaimRevision,
    payload.shellEvidenceDigest,
    payload.releaseSha,
    payload.environment,
    payload.artifactDigest,
    payload.schemaHead,
    payload.migrationCount,
    payload.policyManifestDigest,
    payload.databaseIdentityDigest,
    payload.expectedEntitlementProfileRevision,
    payload.expectedExecutionRevision,
    payload.profileDigest,
    payload.gateSetDigest,
    payload.approvedByUserId,
    payload.approvalReferenceDigest,
    JSON.stringify(args.candidatePayload),
    args.candidatePayloadDigest,
    payload.signingKeyId,
    payload.publicKeyFingerprint,
    args.candidateSignatureBase64url,
    new Date(payload.approvedAtEpochMs),
    new Date(payload.validUntilEpochMs),
    args.modulePolicyAttestationId,
    args.emailWorkflowAttestationId,
    args.postgresRehearsalAttestationId,
  );
  return rows[0].receipt;
}

async function assertDecision(prisma, payload) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT public."shared_beta_tenant_admission_decision_assert_v1"(
      $1, $2, $3, $4, $5::INTEGER, $6, $7, $8, $9, $10::INTEGER,
      $11, $12, $13::INTEGER, $14::INTEGER, $15, $16
    ) AS receipt`,
    payload.decisionId,
    payload.tenantId,
    payload.workflowLocator,
    payload.reservationSubjectId,
    payload.expectedClaimRevision,
    payload.releaseSha,
    payload.environment,
    payload.artifactDigest,
    payload.schemaHead,
    payload.migrationCount,
    payload.policyManifestDigest,
    payload.databaseIdentityDigest,
    payload.expectedEntitlementProfileRevision,
    payload.expectedExecutionRevision,
    payload.profileDigest,
    payload.gateSetDigest,
  );
  return rows[0].receipt;
}

async function revokeDecision(
  prisma,
  decisionId,
  tenantId,
  reasonDigest,
) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT public."shared_beta_tenant_admission_decision_revoke_v1"(
      $1, $2, 1, $3
    ) AS receipt`,
    decisionId,
    tenantId,
    reasonDigest,
  );
  return rows[0].receipt;
}

async function revokeGate(prisma, attestationId, reasonDigest) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT public."shared_beta_release_gate_attestation_revoke_v1"(
      $1, 1, $2
    ) AS receipt`,
    attestationId,
    reasonDigest,
  );
  return rows[0].receipt;
}

async function issueOwnerInviteHold(prisma, input) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT public."identity_owner_invite_issue_hold_v1"(
      $1, $2, $3, $4::INTEGER, $5, $6, $7, $8, $9, $10, $11,
      $12, $13::BYTEA, $14::TIMESTAMPTZ
    ) AS receipt`,
    input.workflowLocator,
    input.tenantId,
    input.reservationSubjectId,
    input.expectedClaimRevision,
    input.requestId,
    input.requestDigest,
    input.aadEnvironment,
    input.commandId,
    input.inviteId,
    input.outboxId,
    input.messageKey,
    input.tokenHash,
    input.secretCiphertext,
    input.expiresAt,
  );
  return rows[0].receipt;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function waitForBlockedAdmissionCall(prisma, functionName) {
  assert(
    new Set([
      "shared_beta_tenant_admission_decision_assert_v1",
      "shared_beta_tenant_admission_decision_create_v1",
      "shared_beta_tenant_admission_decision_revoke_v1",
      "shared_beta_release_gate_attestation_revoke_v1",
    ]).has(functionName),
  );
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const [state] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::INTEGER AS blocked
       FROM pg_catalog.pg_stat_activity
       WHERE pid <> pg_catalog.pg_backend_pid()
         AND datname = pg_catalog.current_database()
         AND state = 'active'
         AND wait_event_type = 'Lock'
         AND query LIKE ('%' || $1 || '%')`,
      functionName,
    );
    if (state.blocked > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `Admission call ${functionName} did not wait on the claim lock.`,
  );
}

async function waitForBlockedQueryMarker(prisma, marker) {
  assert.equal(marker, "admission-approver-demotion-race");
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const [state] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::INTEGER AS blocked
       FROM pg_catalog.pg_stat_activity
       WHERE pid <> pg_catalog.pg_backend_pid()
         AND datname = pg_catalog.current_database()
         AND state = 'active'
         AND wait_event_type = 'Lock'
         AND query LIKE ('%' || $1 || '%')`,
      marker,
    );
    if (state.blocked > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Query marker ${marker} did not wait on its row lock.`);
}

async function createThroughRolledBackIssueRace(
  prisma,
  verifiedDecision,
  gateIds,
  issueInput,
  approverId,
) {
  const issuer = new PrismaClient();
  const demoter = new PrismaClient();
  const revoker = new PrismaClient();
  const claimLocked = deferred();
  const continueIssue = deferred();
  const issueWritten = deferred();
  const rollbackIssue = deferred();
  const decisionRevoked = deferred();
  const rollbackRevoke = deferred();
  const rollbackError = new Error(
    "Expected rollback after create-vs-issue lock-order fixture.",
  );
  const revokeRollbackError = new Error(
    "Expected rollback after create-vs-revoke timestamp fixture.",
  );
  let createPromise;
  let demotionPromise;
  let revokePromise;
  const issuePromise = issuer.$transaction(
    async (transaction) => {
      const locked = await transaction.$queryRawUnsafe(
        `SELECT "workflowLocator"
         FROM public."IdentityEmailClaim"
         WHERE "workflowLocator" = $1
           AND "tenantId" = $2
           AND "subjectId" = $3
           AND "revision" = $4
         FOR UPDATE`,
        issueInput.workflowLocator,
        issueInput.tenantId,
        issueInput.reservationSubjectId,
        issueInput.expectedClaimRevision,
      );
      assert.equal(locked.length, 1);
      claimLocked.resolve();
      await continueIssue.promise;
      const issued = await issueOwnerInviteHold(transaction, issueInput);
      assert.equal(issued.decision, "CREATED");
      issueWritten.resolve();
      await rollbackIssue.promise;
      throw rollbackError;
    },
    { maxWait: 5_000, timeout: 15_000 },
  );
  void issuePromise.catch((error) => {
    claimLocked.reject(error);
    issueWritten.reject(error);
  });

  try {
    await claimLocked.promise;
    createPromise = createDecision(prisma, verifiedDecision, gateIds);
    await waitForBlockedAdmissionCall(
      prisma,
      "shared_beta_tenant_admission_decision_create_v1",
    );
    demotionPromise = demoter
      .$queryRawUnsafe(
        `/* admission-approver-demotion-race */
         UPDATE public."User"
         SET
           "isActive" = false,
           "isPlatformAdmin" = false
         WHERE "id" = $1
         RETURNING "id"`,
        approverId,
      )
      .then((rows) => rows);
    await waitForBlockedQueryMarker(
      prisma,
      "admission-approver-demotion-race",
    );
    continueIssue.resolve();
    await issueWritten.promise;
    revokePromise = revoker.$transaction(
      async (transaction) => {
        const revoked = await revokeDecision(
          transaction,
          verifiedDecision.payload.decisionId,
          verifiedDecision.payload.tenantId,
          "9".repeat(64),
        );
        assert.equal(revoked.decision, "REVOKED");
        decisionRevoked.resolve(revoked);
        await rollbackRevoke.promise;
        throw revokeRollbackError;
      },
      { maxWait: 5_000, timeout: 15_000 },
    );
    void revokePromise.catch((error) => decisionRevoked.reject(error));
    await waitForBlockedAdmissionCall(
      prisma,
      "shared_beta_tenant_admission_decision_revoke_v1",
    );
    rollbackIssue.resolve();
    await assert.rejects(
      issuePromise,
      (error) => error === rollbackError,
    );
    const created = await createPromise;
    const [demoted, revoked] = await Promise.all([
      demotionPromise,
      decisionRevoked.promise,
    ]);
    assert.equal(demoted.length, 1);
    assert.equal(revoked.decisionId, verifiedDecision.payload.decisionId);
    rollbackRevoke.resolve();
    await assert.rejects(
      revokePromise,
      (error) => error === revokeRollbackError,
    );
    return created;
  } catch (error) {
    continueIssue.resolve();
    rollbackIssue.resolve();
    rollbackRevoke.resolve();
    await Promise.allSettled([
      issuePromise,
      createPromise ?? Promise.resolve(),
      demotionPromise ?? Promise.resolve(),
      revokePromise ?? Promise.resolve(),
    ]);
    throw error;
  } finally {
    continueIssue.resolve();
    rollbackIssue.resolve();
    rollbackRevoke.resolve();
    await Promise.allSettled([
      issuePromise,
      createPromise ?? Promise.resolve(),
      demotionPromise ?? Promise.resolve(),
      revokePromise ?? Promise.resolve(),
    ]);
    await Promise.all([
      issuer.$disconnect(),
      demoter.$disconnect(),
      revoker.$disconnect(),
    ]);
    const restored = await prisma.$executeRawUnsafe(
      `UPDATE public."User"
       SET
         "isActive" = true,
         "isPlatformAdmin" = true
       WHERE "id" = $1`,
      approverId,
    );
    assert.equal(restored, 1);
  }
}

async function proveLateGateInsertRejected(
  prisma,
  verifiedDecision,
  gateImports,
) {
  const blocker = new PrismaClient();
  const writer = new PrismaClient();
  const ordered = [...gateImports].sort((left, right) =>
    left.candidateGateCode < right.candidateGateCode
      ? -1
      : left.candidateGateCode > right.candidateGateCode
        ? 1
        : 0,
  );
  const lateImport = ordered.at(-1);
  const blockedImport = ordered.at(1);
  const initiallyPresent = ordered.slice(0, -1);
  const gateIds = Object.fromEntries(
    ordered.map((entry) => [
      entry.candidateGateCode,
      entry.candidateAttestationId,
    ]),
  );
  const rowLocked = deferred();
  const releaseRow = deferred();
  let blockerPromise;
  let createPromise;

  try {
    for (const gateImport of initiallyPresent) {
      const persisted = await persistGate(prisma, gateImport);
      assert.equal(persisted.decision, "CREATED");
    }

    blockerPromise = blocker.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRawUnsafe(
          `SELECT "id"
           FROM public."ReleaseGateAttestation"
           WHERE "id" = $1
           FOR UPDATE`,
          blockedImport.candidateAttestationId,
        );
        assert.equal(rows.length, 1);
        rowLocked.resolve();
        await releaseRow.promise;
      },
      { maxWait: 5_000, timeout: 15_000 },
    );
    void blockerPromise.catch((error) => rowLocked.reject(error));

    await rowLocked.promise;
    createPromise = createDecision(prisma, verifiedDecision, gateIds);
    await waitForBlockedAdmissionCall(
      prisma,
      "shared_beta_tenant_admission_decision_create_v1",
    );

    const insertedLate = await persistGate(writer, lateImport);
    assert.equal(insertedLate.decision, "CREATED");
    releaseRow.resolve();
    await assert.rejects(createPromise);
    await blockerPromise;
  } finally {
    releaseRow.resolve();
    await Promise.allSettled([
      blockerPromise ?? Promise.resolve(),
      createPromise ?? Promise.resolve(),
    ]);
    await Promise.all([blocker.$disconnect(), writer.$disconnect()]);
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `SET LOCAL session_replication_role = 'replica'`,
      );
      const removed = await transaction.$executeRawUnsafe(
        `DELETE FROM public."ReleaseGateAttestation"
         WHERE "id" IN ($1, $2, $3)`,
        ...ordered.map((entry) => entry.candidateAttestationId),
      );
      assert.equal(removed, 3);
    });
  }
}

async function revokeGateThroughLockWait(
  prisma,
  attestationId,
  reasonDigest,
) {
  const blocker = new PrismaClient();
  const observer = new PrismaClient();
  const rowLocked = deferred();
  const releaseRow = deferred();
  let blockerPromise;
  let revokePromise;

  try {
    blockerPromise = blocker.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRawUnsafe(
          `SELECT "id"
           FROM public."ReleaseGateAttestation"
           WHERE "id" = $1
           FOR UPDATE`,
          attestationId,
        );
        assert.equal(rows.length, 1);
        rowLocked.resolve();
        await releaseRow.promise;
      },
      { maxWait: 5_000, timeout: 15_000 },
    );
    void blockerPromise.catch((error) => rowLocked.reject(error));
    await rowLocked.promise;

    revokePromise = revokeGate(prisma, attestationId, reasonDigest);
    await waitForBlockedAdmissionCall(
      observer,
      "shared_beta_release_gate_attestation_revoke_v1",
    );
    const [releaseMark] = await observer.$queryRawUnsafe(
      `SELECT pg_catalog.date_trunc(
         'milliseconds',
         pg_catalog.clock_timestamp()
       ) AS marked_at`,
    );
    releaseRow.resolve();
    const receipt = await revokePromise;
    await blockerPromise;
    const [persisted] = await observer.$queryRawUnsafe(
      `SELECT "revokedAt" AS revoked_at
       FROM public."ReleaseGateAttestation"
       WHERE "id" = $1`,
      attestationId,
    );
    assert(persisted.revoked_at >= releaseMark.marked_at);
    return receipt;
  } finally {
    releaseRow.resolve();
    await Promise.allSettled([
      blockerPromise ?? Promise.resolve(),
      revokePromise ?? Promise.resolve(),
    ]);
    await Promise.all([blocker.$disconnect(), observer.$disconnect()]);
  }
}

async function issueAndAssertThroughClaimRace(
  prisma,
  issueInput,
  decisionPayload,
) {
  const issuer = new PrismaClient();
  const claimLocked = deferred();
  const continueIssue = deferred();
  let assertionPromise;
  const issuePromise = issuer.$transaction(
    async (transaction) => {
      const locked = await transaction.$queryRawUnsafe(
        `SELECT "workflowLocator"
         FROM public."IdentityEmailClaim"
         WHERE "workflowLocator" = $1
           AND "tenantId" = $2
           AND "subjectId" = $3
           AND "revision" = $4
         FOR UPDATE`,
        issueInput.workflowLocator,
        issueInput.tenantId,
        issueInput.reservationSubjectId,
        issueInput.expectedClaimRevision,
      );
      assert.equal(locked.length, 1);
      claimLocked.resolve();
      await continueIssue.promise;
      return issueOwnerInviteHold(transaction, issueInput);
    },
    { maxWait: 5_000, timeout: 15_000 },
  );
  void issuePromise.catch((error) => claimLocked.reject(error));

  try {
    await claimLocked.promise;
    assertionPromise = assertDecision(prisma, decisionPayload);
    await waitForBlockedAdmissionCall(
      prisma,
      "shared_beta_tenant_admission_decision_assert_v1",
    );
    continueIssue.resolve();
    const [issued, asserted] = await Promise.all([
      issuePromise,
      assertionPromise,
    ]);
    return { asserted, issued };
  } catch (error) {
    continueIssue.resolve();
    await Promise.allSettled([
      issuePromise,
      assertionPromise ?? Promise.resolve(),
    ]);
    throw error;
  } finally {
    continueIssue.resolve();
    await issuer.$disconnect();
  }
}

async function runSelfTest() {
  assert.equal(SHARED_BETA_RELEASE_GATE_CODES.length, 3);
  assert.equal(new Set(SHARED_BETA_RELEASE_GATE_CODES).size, 3);
  assert.throws(
    () =>
      parseConfig({
        DATABASE_URL: "postgresql://localhost/production",
        SHARED_BETA_ADMISSION_PROVENANCE_SMOKE_CONFIRM: CONFIRMATION,
      }),
    (error) => error?.code === "DEDICATED_LOOPBACK_CI_DATABASE_REQUIRED",
  );
  assert.throws(
    () =>
      parseConfig({
        DATABASE_URL:
          "postgresql://localhost/lp_admission172_production_data",
        SHARED_BETA_ADMISSION_PROVENANCE_SMOKE_CONFIRM: CONFIRMATION,
      }),
    (error) => error?.code === "DEDICATED_LOOPBACK_CI_DATABASE_REQUIRED",
  );
  return { script: SCRIPT_NAME, status: "PASS", selfTests: 4 };
}

async function runRealSmoke(environment) {
  const config = parseConfig(environment);
  const prisma = new PrismaClient();
  const now = exactNow();
  const fixture = syntheticAuthority(now);
  const context = {
    databaseName: config.databaseName,
    explicitConfirmation:
      "allow-synthetic-shared-beta-admission-provenance",
    hostname: config.hostname,
    nodeEnv: environment.NODE_ENV ?? "test",
  };
  const ids = {
    admin: randomUUID(),
    claimSubject: randomUUID(),
    createRaceIssueCommand: randomUUID(),
    createRaceIssueInvite: randomUUID(),
    createRaceIssueMessageKey: randomUUID(),
    createRaceIssueOutbox: randomUUID(),
    createRaceIssueRequest: randomUUID(),
    decision: randomUUID(),
    issueCommand: randomUUID(),
    issueInvite: randomUUID(),
    issueMessageKey: randomUUID(),
    issueOutbox: randomUUID(),
    issueRequest: randomUUID(),
    request: randomUUID(),
    tenant: randomUUID(),
  };
  ids.workflow = ids.claimSubject;
  const release = {
    artifactDigest: "a".repeat(64),
    environment: "ci",
    migrationCount: 172,
    policyManifestDigest: "b".repeat(64),
    releaseSha: "c".repeat(40),
    schemaHead: TARGET_MIGRATION,
  };

  try {
    const [server] = await prisma.$queryRawUnsafe(
      `SELECT current_setting('server_version_num')::INTEGER AS version`,
    );
    assert.equal(Math.trunc(server.version / 10_000), 16);
    const [migrationState] = await prisma.$queryRawUnsafe(
      `SELECT
        count(*)::INTEGER AS count,
        max(migration_name) AS head
       FROM public."_prisma_migrations"
       WHERE finished_at IS NOT NULL
         AND rolled_back_at IS NULL`,
    );
    assert.equal(migrationState.count, 172);
    assert.equal(migrationState.head, TARGET_MIGRATION);

    const [sealedState] = await prisma.$queryRawUnsafe(
      `SELECT
        (SELECT count(*)::INTEGER FROM public."ReleaseGateAttestation")
          AS attestations,
        (SELECT count(*)::INTEGER FROM public."TenantAdmissionDecision")
          AS decisions,
        (SELECT count(*)::INTEGER FROM public."TenantAdmissionDecisionGate")
          AS links`,
    );
    assert.deepEqual(sealedState, {
      attestations: 0,
      decisions: 0,
      links: 0,
    });

    await prisma.$executeRawUnsafe(
      `INSERT INTO public."Tenant" (
        "id", "name", "slug", "status", "customerStage",
        "onboardingStatus", "entitlementProfileRevision",
        "executionRevision", "createdAt", "updatedAt"
      ) VALUES (
        $1, 'Synthetic admission tenant', $2,
        'SUSPENDED', 'PILOT', 'PROVISIONING', 1, 0,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      ids.tenant,
      `admission-${ids.tenant}`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO public."User" (
        "id", "tenantId", "email", "passwordHash", "role",
        "accessScope", "isActive", "isPlatformAdmin", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, 'synthetic-not-a-login', 'OWNER', 'NETWORK',
        true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      ids.admin,
      ids.tenant,
      `admission-${ids.admin}@example.invalid`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO public."IdentityEmailClaim" (
        "emailCanonical", "claimType", "tenantId", "subjectId",
        "workflowLocator", "revision", "createdAt", "updatedAt"
      ) VALUES (
        $1, 'INVITE', $2, $3, $4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      `admission-${ids.claimSubject}@example.invalid`,
      ids.tenant,
      ids.claimSubject,
      ids.workflow,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO public."TenantModuleEntitlement" (
        "id", "tenantId", "module", "readEnabled", "writeEnabled",
        "outboundEnabled", "validFrom", "validUntil", "profileRevision",
        "reason", "createdAt", "updatedAt"
      )
      SELECT
        gen_random_uuid()::TEXT,
        $1,
        module,
        true,
        true,
        false,
        NULL,
        NULL,
        1,
        'synthetic admission fixture',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM pg_catalog.unnest(
        ARRAY[
          'GAMIFICATION',
          'ASSORTMENT',
          'STAFF',
          'COMMUNICATIONS',
          'USERS_ROLES',
          'INTEGRATIONS'
        ]::public."TenantModule"[]
      ) AS module`,
      ids.tenant,
    );

    const [profileRow] = await prisma.$queryRawUnsafe(
      `SELECT public."shared_beta_tenant_profile_digest_v1"(
        $1, 1
      ) AS digest`,
      ids.tenant,
    );
    assert.match(profileRow.digest, /^[0-9a-f]{64}$/u);

    const gateIds = {};
    for (const gateCode of SHARED_BETA_RELEASE_GATE_CODES) {
      const payload = {
        artifactDigest: release.artifactDigest,
        contractVersion: RELEASE_GATE_ATTESTATION_CONTRACT,
        environment: release.environment,
        gateCode,
        kind: RELEASE_GATE_ATTESTATION_KIND,
        migrationCount: release.migrationCount,
        passedAtEpochMs: now.valueOf(),
        policyManifestDigest: release.policyManifestDigest,
        profile: SHARED_BETA_ADMISSION_PROFILE,
        provenanceKeyVersion: "shared-beta-loopback-ci-v1",
        publicKeyFingerprint: fixture.publicKeyFingerprint,
        purpose: SHARED_BETA_ADMISSION_PURPOSE,
        releaseSha: release.releaseSha,
        schemaHead: release.schemaHead,
        schemaVersion: 1,
        signingKeyId: fixture.keyId,
        validUntilEpochMs: now.valueOf() + 2 * 60 * 60 * 1_000,
      };
      const verified = verifySyntheticReleaseGateAttestationEnvelope(
        signedEnvelope(payload, fixture),
        fixture.roots,
        context,
        now,
      );
      const attestationId = randomUUID();
      gateIds[gateCode] = attestationId;
      const created = await persistGate(
        prisma,
        gatePersistArguments(verified, attestationId),
      );
      assert.equal(created.decision, "CREATED");
      const replayed = await persistGate(
        prisma,
        gatePersistArguments(verified, attestationId),
      );
      assert.equal(replayed.decision, "REPLAYED");
    }

    const [gateSetRow] = await prisma.$queryRawUnsafe(
      `SELECT pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            'leetplus-shared-beta-gate-set-v1',
            'UTF8'
          )
          || '\\x00'::BYTEA
          ||
          pg_catalog.convert_to(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'gateCode', "gateCode"::TEXT,
                'attestationId', "id",
                'payloadDigest', "payloadDigest"
              )
              ORDER BY "gateCode"::TEXT
            )::TEXT,
            'UTF8'
          )
        ),
        'hex'
      ) AS digest
      FROM public."ReleaseGateAttestation"`,
    );

    const decisionPayload = {
      approvalReferenceDigest: "d".repeat(64),
      approvedAtEpochMs: now.valueOf() + 1_000,
      approvedByUserId: ids.admin,
      artifactDigest: release.artifactDigest,
      contractVersion: TENANT_ADMISSION_DECISION_CONTRACT,
      databaseIdentityDigest: "e".repeat(64),
      decision: "GO",
      decisionId: ids.decision,
      environment: release.environment,
      expectedClaimRevision: 1,
      expectedEntitlementProfileRevision: 1,
      expectedExecutionRevision: 0,
      gateSetDigest: gateSetRow.digest,
      gateSetVersion: SHARED_BETA_GATE_SET_VERSION,
      kind: TENANT_ADMISSION_DECISION_KIND,
      migrationCount: release.migrationCount,
      policyManifestDigest: release.policyManifestDigest,
      profile: SHARED_BETA_ADMISSION_PROFILE,
      profileDigest: profileRow.digest,
      publicKeyFingerprint: fixture.publicKeyFingerprint,
      purpose: SHARED_BETA_ADMISSION_PURPOSE,
      releaseSha: release.releaseSha,
      requestDigest: "f".repeat(64),
      requestId: ids.request,
      reservationSubjectId: ids.claimSubject,
      schemaHead: release.schemaHead,
      schemaVersion: 1,
      shellEvidenceDigest: "1".repeat(64),
      signingKeyId: fixture.keyId,
      tenantId: ids.tenant,
      validUntilEpochMs: now.valueOf() + 60 * 60 * 1_000,
      workflowLocator: ids.workflow,
    };
    const verifiedDecision =
      verifySyntheticTenantAdmissionDecisionEnvelope(
        signedEnvelope(decisionPayload, fixture),
        fixture.roots,
        context,
        now,
      );
    const swappedGateIds = {
      ...gateIds,
      MODULE_POLICY_ENFORCED:
        gateIds.EMAIL_INVITE_WORKFLOW_VERIFIED,
      EMAIL_INVITE_WORKFLOW_VERIFIED:
        gateIds.MODULE_POLICY_ENFORCED,
    };
    await assert.rejects(() =>
      createDecision(prisma, verifiedDecision, swappedGateIds),
    );

    const lateGateImports = [];
    for (const gateCode of SHARED_BETA_RELEASE_GATE_CODES) {
      const payload = {
        artifactDigest: release.artifactDigest,
        contractVersion: RELEASE_GATE_ATTESTATION_CONTRACT,
        environment: release.environment,
        gateCode,
        kind: RELEASE_GATE_ATTESTATION_KIND,
        migrationCount: release.migrationCount,
        passedAtEpochMs: now.valueOf() - 1_000,
        policyManifestDigest: release.policyManifestDigest,
        profile: SHARED_BETA_ADMISSION_PROFILE,
        provenanceKeyVersion: "shared-beta-loopback-ci-v1",
        publicKeyFingerprint: fixture.publicKeyFingerprint,
        purpose: SHARED_BETA_ADMISSION_PURPOSE,
        releaseSha: release.releaseSha,
        schemaHead: release.schemaHead,
        schemaVersion: 1,
        signingKeyId: fixture.keyId,
        validUntilEpochMs:
          now.valueOf() + 2 * 60 * 60 * 1_000 + 1_000,
      };
      const verifiedLateGate =
        verifySyntheticReleaseGateAttestationEnvelope(
          signedEnvelope(payload, fixture),
          fixture.roots,
          context,
          now,
        );
      lateGateImports.push(
        gatePersistArguments(verifiedLateGate, randomUUID()),
      );
    }
    const lateGateSetDigest = await gateSetDigestFromImports(
      prisma,
      lateGateImports,
    );
    const lateGateDecisionPayload = {
      ...decisionPayload,
      decisionId: randomUUID(),
      gateSetDigest: lateGateSetDigest,
      requestDigest: "8".repeat(64),
      requestId: randomUUID(),
    };
    const verifiedLateGateDecision =
      verifySyntheticTenantAdmissionDecisionEnvelope(
        signedEnvelope(lateGateDecisionPayload, fixture),
        fixture.roots,
        context,
        now,
      );
    await proveLateGateInsertRejected(
      prisma,
      verifiedLateGateDecision,
      lateGateImports,
    );

    const createRaceIssueInput = {
      aadEnvironment: release.environment,
      commandId: ids.createRaceIssueCommand,
      expectedClaimRevision: 1,
      expiresAt: new Date(now.valueOf() + 90 * 60 * 1_000),
      inviteId: ids.createRaceIssueInvite,
      messageKey: ids.createRaceIssueMessageKey,
      outboxId: ids.createRaceIssueOutbox,
      requestDigest: "6".repeat(64),
      requestId: ids.createRaceIssueRequest,
      reservationSubjectId: ids.claimSubject,
      secretCiphertext: Buffer.alloc(71, 0x59),
      tenantId: ids.tenant,
      tokenHash: "7".repeat(64),
      workflowLocator: ids.workflow,
    };
    // The issuer owns claim first, create owns Tenant second, and the issuer
    // must still complete every Tenant-FK write. The fixture then rolls the
    // issue transaction back so create can prove the original reservation.
    const createdDecision = await createThroughRolledBackIssueRace(
      prisma,
      verifiedDecision,
      gateIds,
      createRaceIssueInput,
      ids.admin,
    );
    assert.equal(createdDecision.decision, "CREATED");
    const replayedDecision = await createDecision(
      prisma,
      verifiedDecision,
      gateIds,
    );
    assert.equal(replayedDecision.decision, "REPLAYED");
    const asserted = await assertDecision(prisma, decisionPayload);
    assert.equal(asserted.decision, "ASSERTED");
    assert.equal(asserted.identityState, "RESERVATION");
    assert.equal(asserted.issueCommandId, undefined);
    assert.equal(asserted.inviteId, undefined);
    assert.equal(asserted.outboxId, undefined);

    // A progressed claim without the immutable issue aggregate must never be
    // treated as continuity of the signed reservation.
    await assert.rejects(() =>
      prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `UPDATE public."IdentityEmailClaim"
           SET
             "subjectId" = $2,
             "revision" = "revision" + 1
           WHERE "workflowLocator" = $1`,
          ids.workflow,
          randomUUID(),
        );
        await assertDecision(transaction, decisionPayload);
      }),
    );
    const reservationAfterMissingAggregate = await assertDecision(
      prisma,
      decisionPayload,
    );
    assert.equal(
      reservationAfterMissingAggregate.identityState,
      "RESERVATION",
    );

    const issueInput = {
      aadEnvironment: release.environment,
      commandId: ids.issueCommand,
      expectedClaimRevision: 1,
      expiresAt: new Date(now.valueOf() + 90 * 60 * 1_000),
      inviteId: ids.issueInvite,
      messageKey: ids.issueMessageKey,
      outboxId: ids.issueOutbox,
      requestDigest: "4".repeat(64),
      requestId: ids.issueRequest,
      reservationSubjectId: ids.claimSubject,
      secretCiphertext: Buffer.alloc(71, 0x5a),
      tenantId: ids.tenant,
      tokenHash: "5".repeat(64),
      workflowLocator: ids.workflow,
    };
    // The issuer owns the claim lock first. Assertion must wait, then observe
    // the complete immutable aggregate after issue commits—never an
    // unproven progressed claim.
    const {
      asserted: assertedIssued,
      issued,
    } = await issueAndAssertThroughClaimRace(
      prisma,
      issueInput,
      decisionPayload,
    );
    assert.equal(issued.decision, "CREATED");
    assert.equal(issued.commandId, ids.issueCommand);
    assert.equal(issued.inviteId, ids.issueInvite);
    assert.equal(issued.outboxId, ids.issueOutbox);
    assert.equal(issued.outboxStatus, "HOLD");

    assert.equal(assertedIssued.decision, "ASSERTED");
    assert.equal(assertedIssued.identityState, "ISSUED_HOLD");
    assert.equal(assertedIssued.issueCommandId, ids.issueCommand);
    assert.equal(assertedIssued.inviteId, ids.issueInvite);
    assert.equal(assertedIssued.outboxId, ids.issueOutbox);
    assert.doesNotMatch(
      JSON.stringify(assertedIssued),
      /email|token|cipher|requestDigest/iu,
    );

    // Both negatives are transaction-local and roll back. The first removes
    // the otherwise immutable authority command with replica-mode triggers;
    // the second makes the live invite revoked through its normal columns.
    await assert.rejects(() =>
      prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `SET LOCAL session_replication_role = 'replica'`,
        );
        await transaction.$executeRawUnsafe(
          `DELETE FROM public."IdentityOwnerInviteIssueCommand"
           WHERE "id" = $1`,
          ids.issueCommand,
        );
        await assertDecision(transaction, decisionPayload);
      }),
    );
    await assert.rejects(() =>
      prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `UPDATE public."UserInvite"
           SET "revokedAt" = CURRENT_TIMESTAMP
           WHERE "id" = $1
             AND "tenantId" = $2`,
          ids.issueInvite,
          ids.tenant,
        );
        await assertDecision(transaction, decisionPayload);
      }),
    );
    const issuedAfterNegativeRollbacks = await assertDecision(
      prisma,
      decisionPayload,
    );
    assert.equal(
      issuedAfterNegativeRollbacks.identityState,
      "ISSUED_HOLD",
    );

    const collisionPayload = {
      ...decisionPayload,
      requestDigest: "0".repeat(64),
    };
    const verifiedCollision =
      verifySyntheticTenantAdmissionDecisionEnvelope(
        signedEnvelope(collisionPayload, fixture),
        fixture.roots,
        context,
        now,
      );
    await assert.rejects(() =>
      createDecision(prisma, verifiedCollision, gateIds),
    );

    const bindingDriftCases = [
      ["decisionId", randomUUID()],
      ["tenantId", randomUUID()],
      ["workflowLocator", randomUUID()],
      ["reservationSubjectId", randomUUID()],
      ["expectedClaimRevision", 2],
      ["releaseSha", "4".repeat(40)],
      ["environment", "other-ci"],
      ["artifactDigest", "5".repeat(64)],
      ["schemaHead", "20260730020001_unreviewed"],
      ["migrationCount", 173],
      ["policyManifestDigest", "6".repeat(64)],
      ["databaseIdentityDigest", "7".repeat(64)],
      ["expectedEntitlementProfileRevision", 2],
      ["expectedExecutionRevision", 1],
      ["profileDigest", "8".repeat(64)],
      ["gateSetDigest", "9".repeat(64)],
    ];
    for (const [field, value] of bindingDriftCases) {
      await assert.rejects(() =>
        assertDecision(prisma, {
          ...decisionPayload,
          [field]: value,
        }),
      );
    }

    await prisma.$executeRawUnsafe(
      `UPDATE public."TenantModuleEntitlement"
       SET "outboundEnabled" = true
       WHERE "tenantId" = $1
         AND "module" = 'GAMIFICATION'`,
      ids.tenant,
    );
    await assert.rejects(() => assertDecision(prisma, decisionPayload));
    await prisma.$executeRawUnsafe(
      `UPDATE public."TenantModuleEntitlement"
       SET "outboundEnabled" = false
       WHERE "tenantId" = $1
         AND "module" = 'GAMIFICATION'`,
      ids.tenant,
    );

    await prisma.$executeRawUnsafe(
      `UPDATE public."TenantModuleEntitlement"
       SET "validUntil" = $2
       WHERE "tenantId" = $1
         AND "module" = 'GAMIFICATION'`,
      ids.tenant,
      new Date(now.valueOf() + 30 * 60 * 1_000),
    );
    await assert.rejects(() => assertDecision(prisma, decisionPayload));
    await prisma.$executeRawUnsafe(
      `UPDATE public."TenantModuleEntitlement"
       SET "validUntil" = NULL
       WHERE "tenantId" = $1
         AND "module" = 'GAMIFICATION'`,
      ids.tenant,
    );
    const assertedAfterProfileDrift = await assertDecision(
      prisma,
      decisionPayload,
    );
    assert.equal(assertedAfterProfileDrift.decision, "ASSERTED");
    assert.equal(
      assertedAfterProfileDrift.identityState,
      "ISSUED_HOLD",
    );

    await prisma.$executeRawUnsafe(
      `UPDATE public."Tenant"
       SET "customerStage" = 'INTERNAL'
       WHERE "id" = $1`,
      ids.tenant,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE public."Tenant"
       SET "customerStage" = 'PILOT'
       WHERE "id" = $1`,
      ids.tenant,
    );
    await assert.rejects(() => assertDecision(prisma, decisionPayload));
    const [revisionDrift] = await prisma.$queryRawUnsafe(
      `SELECT
         "customerStage"::TEXT AS customer_stage,
         "entitlementProfileRevision" AS entitlement_profile_revision,
         "executionRevision" AS execution_revision
       FROM public."Tenant"
       WHERE "id" = $1`,
      ids.tenant,
    );
    assert.deepEqual(revisionDrift, {
      customer_stage: "PILOT",
      entitlement_profile_revision: 1,
      execution_revision: 2,
    });

    const [acl] = await prisma.$queryRawUnsafe(
      `SELECT
        (
          SELECT count(*)::INTEGER
          FROM pg_catalog.pg_class AS relation
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(
              relation.relacl,
              pg_catalog.acldefault('r', relation.relowner)
            )
          ) AS privilege
          WHERE namespace.nspname = 'public'
            AND relation.relname IN (
              'ReleaseGateAttestation',
              'TenantAdmissionDecision',
              'TenantAdmissionDecisionGate'
            )
            AND privilege.grantee <> relation.relowner
        ) AS table_privileges,
        (
          SELECT count(*)::INTEGER
          FROM pg_catalog.pg_proc AS procedure
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(
              procedure.proacl,
              pg_catalog.acldefault('f', procedure.proowner)
            )
          ) AS privilege
          WHERE namespace.nspname = 'public'
            AND procedure.proname LIKE 'shared_beta_%'
            AND privilege.grantee <> procedure.proowner
        ) AS function_privileges,
        (
          SELECT count(*)::INTEGER
          FROM pg_catalog.pg_attribute AS attribute
          INNER JOIN pg_catalog.pg_class AS relation
            ON relation.oid = attribute.attrelid
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            attribute.attacl
          ) AS privilege
          WHERE namespace.nspname = 'public'
            AND relation.relname IN (
              'ReleaseGateAttestation',
              'TenantAdmissionDecision',
              'TenantAdmissionDecisionGate'
            )
            AND attribute.attnum > 0
            AND NOT attribute.attisdropped
            AND privilege.grantee <> relation.relowner
        ) AS column_privileges,
        (
          SELECT count(*)::INTEGER
          FROM pg_catalog.pg_type AS type
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = type.typnamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(
              type.typacl,
              pg_catalog.acldefault('T', type.typowner)
            )
          ) AS privilege
          WHERE namespace.nspname = 'public'
            AND type.typname = 'SharedBetaReleaseGateCode'
            AND type.typtype = 'e'
            AND privilege.grantee <> type.typowner
        ) AS type_privileges`,
    );
    assert.deepEqual(acl, {
      column_privileges: 0,
      function_privileges: 0,
      table_privileges: 0,
      type_privileges: 0,
    });

    const gateRevoke = await revokeGateThroughLockWait(
      prisma,
      gateIds.MODULE_POLICY_ENFORCED,
      "2".repeat(64),
    );
    assert.equal(gateRevoke.decision, "REVOKED");
    await assert.rejects(() => assertDecision(prisma, decisionPayload));

    const decisionRevoke = await prisma.$queryRawUnsafe(
      `SELECT public."shared_beta_tenant_admission_decision_revoke_v1"(
        $1, $2, 1, $3
      ) AS receipt`,
      ids.decision,
      ids.tenant,
      "3".repeat(64),
    );
    assert.equal(decisionRevoke[0].receipt.decision, "REVOKED");
    await assert.rejects(() =>
      prisma.$queryRawUnsafe(
        `SELECT public."shared_beta_tenant_admission_decision_revoke_v1"(
          $1, $2, 1, $3
        )`,
        ids.decision,
        ids.tenant,
        "3".repeat(64),
      ),
    );

    const [finalState] = await prisma.$queryRawUnsafe(
      `SELECT
        (SELECT count(*)::INTEGER FROM public."ReleaseGateAttestation")
          AS attestations,
        (SELECT count(*)::INTEGER FROM public."TenantAdmissionDecision")
          AS decisions,
        (SELECT count(*)::INTEGER FROM public."TenantAdmissionDecisionGate")
          AS links,
        (SELECT count(*)::INTEGER
          FROM public."TenantAdmissionDecision"
          WHERE "consumedAt" IS NOT NULL) AS consumed,
        (SELECT count(*)::INTEGER
          FROM public."IdentityMailOutbox"
          WHERE "status" <> 'HOLD') AS non_hold_outbox,
        (SELECT count(*)::INTEGER
          FROM public."IdentityOwnerInviteIssueCommand"
          WHERE "tenantId" = $1
            AND "id" = $2) AS "issueCommands",
        (SELECT count(*)::INTEGER
          FROM public."UserInvite"
          WHERE "tenantId" = $1
            AND "id" = $3
            AND "role" = 'OWNER'
            AND "accessScope" = 'NETWORK'
            AND "acceptedAt" IS NULL
            AND "revokedAt" IS NULL) AS "liveOwnerInvites",
        (SELECT count(*)::INTEGER
          FROM public."IdentityMailOutbox"
          WHERE "tenantId" = $1
            AND "id" = $4
            AND "status" = 'HOLD') AS "holdOutbox",
        (SELECT count(*)::INTEGER
          FROM public."IdentityEmailClaim"
          WHERE "tenantId" = $1
            AND "workflowLocator" = $5
            AND "subjectId" = $3
            AND "revision" = 2) AS "issuedClaims"`,
      ids.tenant,
      ids.issueCommand,
      ids.issueInvite,
      ids.issueOutbox,
      ids.workflow,
    );
    assert.deepEqual(finalState, {
      attestations: 3,
      consumed: 0,
      decisions: 1,
      holdOutbox: 1,
      issueCommands: 1,
      issuedClaims: 1,
      links: 3,
      liveOwnerInvites: 1,
      non_hold_outbox: 0,
    });

    return {
      script: SCRIPT_NAME,
      status: "PASS",
      postgresMajor: 16,
      migrationCount: 172,
      migrationHead: TARGET_MIGRATION,
      signedGates: 3,
      signedDecisions: 1,
      idempotentReplay: true,
      requestCollisionRejected: true,
      wrongGateBindingRejected: true,
      bindingDriftRejections: bindingDriftCases.length,
      profileBooleanDriftRejected: true,
      profileWindowDriftRejected: true,
      executionRevisionDriftRejected: true,
      exactAssertion: true,
      preIssueReservationAsserted: true,
      issuedHoldAsserted: true,
      missingIssueAggregateRejected: true,
      tamperedIssueAggregateRejected: true,
      issueBeforeRecheckOrderingVerified: true,
      lateGateInsertRejected: true,
      createIssueRaceSerialized: true,
      approverDemotionRaceSerialized: true,
      decisionRevokeTimestampRebased: true,
      gateRevokeTimestampRebased: true,
      claimTransitionRaceSerialized: true,
      gateRevocationCAS: true,
      decisionRevocationCAS: true,
      consumedDecisions: 0,
      nonHoldOutbox: 0,
      publicPrivileges: 0,
    };
  } finally {
    await prisma.$disconnect();
  }
}

const options = parseArguments(process.argv.slice(2));
if (options.help) {
  process.stdout.write(`${HELP}\n`);
} else {
  const result = options.selfTest
    ? await runSelfTest()
    : await runRealSmoke(process.env);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
