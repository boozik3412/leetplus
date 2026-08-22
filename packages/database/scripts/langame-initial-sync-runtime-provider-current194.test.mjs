import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROUTINES,
  attestLangameInitialSyncRuntimeCurrent193,
  planLangameInitialSyncRuntimeCurrent193,
} from "./langame-initial-sync-runtime-boundary-current193.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
  langameInitialSyncRuntimeAttestationCurrent193PayloadDigest,
  langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint,
  projectLangameInitialSyncRuntimeAttestationCurrent193,
  verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193,
} from "./langame-initial-sync-runtime-attestation-current193.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_TEST_CONFIRMATION,
  isLangameInitialSyncRuntimeProviderCurrent194,
  openLangameInitialSyncRuntimeProviderCurrent194,
  openSyntheticLangameInitialSyncRuntimeProviderCurrent194,
} from "./langame-initial-sync-runtime-provider-current194.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const NOW = "2026-08-13T09:30:00.000Z";
const VALID_UNTIL = "2026-08-13T09:34:00.000Z";
const KEY_ID = "langame-current194-ci-1";
const requests = Object.freeze({
  consumeRequestDigest: "6".repeat(64),
  consumeRequestId: "consume-request-current194",
  registerRequestDigest: "5".repeat(64),
  registerRequestId: "register-request-current194",
});
const claimInput = Object.freeze({
  actorUserId: "actor-user-current194",
  approvalId: "approval-current194",
  claimRequestDigest: "1".repeat(64),
  claimRequestId: "claim-request-current194",
  claimToken: "claim-token-current194-abcdefghijklmnopqrstuvwxyz",
  executionId: "execution-current194",
  planDigest: "2".repeat(64),
  tenantId: "tenant-current194",
});
const executeInput = Object.freeze({
  actorUserId: claimInput.actorUserId,
  canonicalPlan: "{}",
  claimToken: claimInput.claimToken,
  executionId: claimInput.executionId,
  executionRequestDigest: "3".repeat(64),
  executionRequestId: "execute-request-current194",
  tenantId: claimInput.tenantId,
});
const reconcileInput = Object.freeze({
  claimToken: claimInput.claimToken,
  executionId: claimInput.executionId,
  planDigest: claimInput.planDigest,
  tenantId: claimInput.tenantId,
});
const revokeInput = Object.freeze({
  revocationReasonDigest: "8".repeat(64),
  revokeRequestDigest: "7".repeat(64),
  revokeRequestId: "revoke-request-current194",
});

function verifiedAttestation() {
  const plan = planLangameInitialSyncRuntimeCurrent193({
    databaseName: "leetplus_ci",
    databaseOid: 16_384,
    environment: "ci",
    executorRoleName: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    executorRoleOid: 20_001,
    releaseSha: "a".repeat(40),
    schemaOwnerRoleName: "leetplus_migration_owner",
    schemaOwnerRoleOid: 20_002,
  });
  const receipt = attestLangameInitialSyncRuntimeCurrent193(plan, {
    databaseAcl: { connect: true, create: false, temporary: false },
    databaseName: "leetplus_ci",
    databaseOid: 16_384,
    currentUser: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    defaultPrivilegeCount: 0,
    directSequencePrivilegeCount: 0,
    directTablePrivilegeCount: 0,
    executorRole: {
      bypassRls: false,
      canCreateDatabase: false,
      canCreateRole: false,
      canLogin: true,
      inherit: false,
      name: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
      oid: 20_001,
      replication: false,
      superuser: false,
    },
    functionOwnerRoleName: "leetplus_migration_owner",
    functionOwnerRoleOid: 20_002,
    membershipCount: 0,
    ownedObjectCount: 0,
    routines: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROUTINES.map(
      (routine) => ({
        executorCanExecute: routine.callable,
        identity: routine.identity,
        ownerRoleName: "leetplus_migration_owner",
        ownerRoleOid: 20_002,
        publicCanExecute: false,
        searchPath: routine.searchPath,
        securityDefiner: routine.securityDefiner,
      }),
    ),
    schemaAcl: { create: false, usage: true },
    sessionUser: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    unexpectedExecutableRoutineCount: 0,
  });
  const expected =
    projectLangameInitialSyncRuntimeAttestationCurrent193(receipt);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint =
    langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint(
      publicKeyPem,
    );
  const payload = {
    attestationId: "attestation-current194",
    ...expected,
    contract: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
    issuedAt: "2026-08-13T09:29:00.000Z",
    publicKeyFingerprint,
    purpose: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
    signingKeyId: KEY_ID,
    trustDomain:
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
    validUntil: VALID_UNTIL,
  };
  const envelope = {
    payload,
    payloadDigest:
      langameInitialSyncRuntimeAttestationCurrent193PayloadDigest(payload),
    publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      privateKey,
    ).toString("base64url"),
    signatureAlgorithm:
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
    signingKeyId: KEY_ID,
  };
  return verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193(
    envelope,
    expected,
    {
      [KEY_ID]: {
        algorithm:
          LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
        keyId: KEY_ID,
        notAfter: "2026-08-14T00:00:00.000Z",
        notBefore: "2026-08-13T00:00:00.000Z",
        publicKeyFingerprint,
        publicKeyPem,
        purpose: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
        status: "ACTIVE",
        trustDomain:
          LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
      },
    },
    {
      databaseName: "leetplus_ci",
      environment: "ci",
      explicitConfirmation:
        LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION,
      hostname: "127.0.0.1",
    },
    NOW,
  );
}

function registerRow(attestation, replayed = false, status = "ACTIVE") {
  return [
    {
      attestationId: attestation.attestationId,
      payloadDigest: attestation.payloadDigest,
      replayed,
      status,
      validUntil: new Date(VALID_UNTIL),
    },
  ];
}

function consumeRow(attestation, replayed = false, status = "CONSUMED") {
  return [
    {
      attestationId: attestation.attestationId,
      consumedAt: status === "CONSUMED" ? new Date(NOW) : null,
      replayed,
      status,
      validUntil: new Date(VALID_UNTIL),
    },
  ];
}

function revokeRow(attestation, replayed = false) {
  return [
    {
      attestationId: attestation.attestationId,
      replayed,
      revokedAt: new Date("2026-08-13T09:31:00.000Z"),
      status: "REVOKED",
    },
  ];
}

function drivers(attestation, overrides = {}) {
  const observed = {
    claims: [],
    closes: 0,
    consumes: [],
    executions: [],
    reconciliations: [],
    registers: [],
    revokes: [],
  };
  const owner = {
    async registerCurrent194(spec) {
      observed.registers.push(spec);
      if (overrides.register) return overrides.register(spec, observed);
      return registerRow(attestation);
    },
    async revokeCurrent194(spec) {
      observed.revokes.push(spec);
      if (overrides.revoke) return overrides.revoke(spec, observed);
      return revokeRow(attestation);
    },
  };
  const runtime = {
    async claimCurrent192(input) {
      observed.claims.push(input);
      if (overrides.claim) return overrides.claim(input, observed);
      return ["claim-result"];
    },
    async close() {
      observed.closes += 1;
      return overrides.close?.(observed);
    },
    async consumeCurrent194(spec) {
      observed.consumes.push(spec);
      if (overrides.consume) return overrides.consume(spec, observed);
      return consumeRow(attestation);
    },
    async executeCurrent192(input) {
      observed.executions.push(input);
      if (overrides.execute) return overrides.execute(input, observed);
      return ["execute-result"];
    },
    async reconcileCurrent192(input) {
      observed.reconciliations.push(input);
      if (overrides.reconcile) return overrides.reconcile(input, observed);
      return ["reconcile-result"];
    },
  };
  return { observed, owner, runtime };
}

async function open(attestation, fixture) {
  return openSyntheticLangameInitialSyncRuntimeProviderCurrent194(
    attestation,
    requests,
    fixture.owner,
    fixture.runtime,
    LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_TEST_CONFIRMATION,
  );
}

test("CURRENT194 production provider remains fail-closed", async () => {
  await assert.rejects(
    openLangameInitialSyncRuntimeProviderCurrent194(),
    (error) => error.code === "CURRENT194_PROVIDER_PRODUCTION_DENIED",
  );
});

test("CURRENT194 registers, consumes and exposes only narrow runtime and shutdown RPCs", async () => {
  const attestation = verifiedAttestation();
  const fixture = drivers(attestation);
  const session = await open(attestation, fixture);
  assert.equal(isLangameInitialSyncRuntimeProviderCurrent194(session), true);
  assert.equal(fixture.observed.registers.length, 1);
  assert.equal(fixture.observed.consumes.length, 1);
  assert.equal(
    fixture.observed.registers[0].contract,
    LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_CONTRACT,
  );
  assert.equal(
    fixture.observed.registers[0].schemaOwnerRoleOid,
    attestation.schemaOwnerRoleOid,
  );
  assert.equal(
    fixture.observed.registers[0].publicKeyFingerprint,
    attestation.publicKeyFingerprint,
  );
  assert.deepEqual(await session.claimCurrent192(claimInput), ["claim-result"]);
  assert.deepEqual(await session.executeCurrent192(executeInput), [
    "execute-result",
  ]);
  assert.deepEqual(await session.reconcileCurrent192(reconcileInput), [
    "reconcile-result",
  ]);
  assert.equal(fixture.observed.claims[0].executionId, claimInput.executionId);
  assert.equal(
    fixture.observed.executions[0].canonicalPlan,
    executeInput.canonicalPlan,
  );
  assert.equal(
    fixture.observed.reconciliations[0].planDigest,
    reconcileInput.planDigest,
  );
  assert.deepEqual(session.snapshot(), {
    contract: LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_CONTRACT,
    attestationId: attestation.attestationId,
    consumedAt: NOW,
    consumeReplayed: false,
    inFlight: 0,
    revokeReplayed: null,
    revokedAt: null,
    state: "ACTIVE",
    authorization: false,
    productionExecutionAllowed: false,
  });
  await session.drain();
  assert.equal(fixture.observed.closes, 1);
});

test("CURRENT194 reconciles exact lost register and consume responses", async () => {
  const attestation = verifiedAttestation();
  let registerAttempt = 0;
  let consumeAttempt = 0;
  const fixture = drivers(attestation, {
    register() {
      registerAttempt += 1;
      if (registerAttempt === 1) throw new Error("lost register response");
      return registerRow(attestation, true);
    },
    consume() {
      consumeAttempt += 1;
      if (consumeAttempt === 1) throw new Error("lost consume response");
      return consumeRow(attestation, true);
    },
  });
  const session = await open(attestation, fixture);
  assert.equal(fixture.observed.registers.length, 2);
  assert.equal(fixture.observed.registers[0], fixture.observed.registers[1]);
  assert.equal(fixture.observed.consumes.length, 2);
  assert.equal(fixture.observed.consumes[0], fixture.observed.consumes[1]);
  assert.equal(session.snapshot().consumeReplayed, true);
  await session.drain();
});

test("CURRENT194 closes the runtime client on ambiguous or terminal consume", async () => {
  const ambiguousAttestation = verifiedAttestation();
  const ambiguous = drivers(ambiguousAttestation, {
    consume() {
      throw new Error("ambiguous");
    },
  });
  await assert.rejects(
    open(ambiguousAttestation, ambiguous),
    (error) => error.code === "CURRENT194_PROVIDER_CONSUME_RESPONSE_AMBIGUOUS",
  );
  assert.equal(ambiguous.observed.consumes.length, 2);
  assert.equal(ambiguous.observed.closes, 1);

  const revokedAttestation = verifiedAttestation();
  const revoked = drivers(revokedAttestation, {
    consume() {
      return consumeRow(revokedAttestation, true, "REVOKED");
    },
  });
  await assert.rejects(
    open(revokedAttestation, revoked),
    (error) => error.code === "CURRENT194_PROVIDER_CONSUME_RECEIPT_INVALID",
  );
  assert.equal(revoked.observed.closes, 1);
});

test("CURRENT194 rejects clones, reuse, malformed requests and extra driver authority", async () => {
  const original = verifiedAttestation();
  const cloneFixture = drivers(original);
  await assert.rejects(
    open({ ...original }, cloneFixture),
    (error) => error.code === "CURRENT194_PROVIDER_ATTESTATION_INVALID",
  );
  assert.equal(cloneFixture.observed.registers.length, 0);

  const used = verifiedAttestation();
  const usedFixture = drivers(used);
  const session = await open(used, usedFixture);
  await assert.rejects(
    open(used, drivers(used)),
    (error) => error.code === "CURRENT194_PROVIDER_ATTESTATION_ALREADY_USED",
  );
  await session.drain();

  const badRequestAttestation = verifiedAttestation();
  const badRequestFixture = drivers(badRequestAttestation);
  await assert.rejects(
    openSyntheticLangameInitialSyncRuntimeProviderCurrent194(
      badRequestAttestation,
      { ...requests, consumeRequestDigest: "bad" },
      badRequestFixture.owner,
      badRequestFixture.runtime,
      LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_TEST_CONFIRMATION,
    ),
    (error) => error.code === "CURRENT194_PROVIDER_REQUEST_INVALID",
  );
  const recoveredAfterCallerError = await open(
    badRequestAttestation,
    badRequestFixture,
  );
  await recoveredAfterCallerError.drain();

  const extraDriverAttestation = verifiedAttestation();
  const extraFixture = drivers(extraDriverAttestation);
  await assert.rejects(
    openSyntheticLangameInitialSyncRuntimeProviderCurrent194(
      extraDriverAttestation,
      requests,
      extraFixture.owner,
      { ...extraFixture.runtime, arbitraryQuery: async () => [] },
      LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_TEST_CONFIRMATION,
    ),
    (error) => error.code === "CURRENT194_PROVIDER_RUNTIME_DRIVER_INVALID",
  );

  const extraOwnerAttestation = verifiedAttestation();
  const extraOwnerFixture = drivers(extraOwnerAttestation);
  await assert.rejects(
    openSyntheticLangameInitialSyncRuntimeProviderCurrent194(
      extraOwnerAttestation,
      requests,
      { ...extraOwnerFixture.owner, arbitraryQuery: async () => [] },
      extraOwnerFixture.runtime,
      LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_TEST_CONFIRMATION,
    ),
    (error) => error.code === "CURRENT194_PROVIDER_OWNER_DRIVER_INVALID",
  );
});

test("CURRENT194 drain rejects new work and waits for exact zero in-flight", async () => {
  const attestation = verifiedAttestation();
  let resolveQuery;
  const fixture = drivers(attestation, {
    execute() {
      return new Promise((resolve) => {
        resolveQuery = resolve;
      });
    },
  });
  const session = await open(attestation, fixture);
  const inFlight = session.executeCurrent192(executeInput);
  const draining = session.drain();
  assert.equal(session.snapshot().state, "DRAINING");
  assert.equal(session.snapshot().inFlight, 1);
  await assert.rejects(
    session.claimCurrent192(claimInput),
    (error) => error.code === "CURRENT194_PROVIDER_SESSION_NOT_ACTIVE",
  );
  assert.equal(fixture.observed.closes, 0);
  resolveQuery(["completed"]);
  assert.deepEqual(await inFlight, ["completed"]);
  await draining;
  assert.equal(session.snapshot().state, "CLOSED");
  assert.equal(session.snapshot().inFlight, 0);
  assert.equal(fixture.observed.closes, 1);
  await session.drain();
  assert.equal(fixture.observed.closes, 1);
});

test("CURRENT194 drains in-flight work before exact owner revoke and closes", async () => {
  const attestation = verifiedAttestation();
  let resolveQuery;
  let revokeAttempt = 0;
  const fixture = drivers(attestation, {
    execute() {
      return new Promise((resolve) => {
        resolveQuery = resolve;
      });
    },
    revoke() {
      revokeAttempt += 1;
      if (revokeAttempt === 1) throw new Error("lost revoke response");
      return revokeRow(attestation, true);
    },
  });
  const session = await open(attestation, fixture);
  const inFlight = session.executeCurrent192(executeInput);
  const revoking = session.revokeAndDrain(revokeInput);
  assert.equal(session.snapshot().state, "DRAINING");
  assert.equal(fixture.observed.revokes.length, 0);
  assert.equal(fixture.observed.closes, 0);
  await assert.rejects(
    session.reconcileCurrent192(reconcileInput),
    (error) => error.code === "CURRENT194_PROVIDER_SESSION_NOT_ACTIVE",
  );
  resolveQuery(["completed-before-revoke"]);
  assert.deepEqual(await inFlight, ["completed-before-revoke"]);
  await revoking;
  assert.equal(fixture.observed.revokes.length, 2);
  assert.equal(fixture.observed.revokes[0], fixture.observed.revokes[1]);
  assert.equal(
    fixture.observed.revokes[0].attestationId,
    attestation.attestationId,
  );
  assert.equal(
    fixture.observed.revokes[0].expectedPayloadDigest,
    attestation.payloadDigest,
  );
  assert.equal(fixture.observed.closes, 1);
  assert.deepEqual(session.snapshot(), {
    contract: LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_CONTRACT,
    attestationId: attestation.attestationId,
    consumedAt: NOW,
    consumeReplayed: false,
    inFlight: 0,
    revokeReplayed: true,
    revokedAt: "2026-08-13T09:31:00.000Z",
    state: "CLOSED",
    authorization: false,
    productionExecutionAllowed: false,
  });
  assert.equal(session.revokeAndDrain(revokeInput), revoking);
  assert.throws(
    () =>
      session.revokeAndDrain({
        ...revokeInput,
        revokeRequestDigest: "9".repeat(64),
      }),
    (error) => error.code === "CURRENT194_PROVIDER_REVOKE_REPLAY_MISMATCH",
  );
  assert.throws(
    () => session.drain(),
    (error) => error.code === "CURRENT194_PROVIDER_SHUTDOWN_CONFLICT",
  );
});

test("CURRENT194 closes and seals the session when revoke remains ambiguous", async () => {
  const attestation = verifiedAttestation();
  const fixture = drivers(attestation, {
    revoke() {
      throw new Error("ambiguous revoke");
    },
  });
  const session = await open(attestation, fixture);
  await assert.rejects(
    session.revokeAndDrain(revokeInput),
    (error) => error.code === "CURRENT194_PROVIDER_REVOKE_RESPONSE_AMBIGUOUS",
  );
  assert.equal(fixture.observed.revokes.length, 2);
  assert.equal(fixture.observed.closes, 1);
  assert.equal(session.snapshot().state, "CLOSED");
});

test("CURRENT194 provider source has no broad Prisma, process or network authority", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL(
        "./langame-initial-sync-runtime-provider-current194.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /PrismaService|PrismaClient|\$queryRaw|process\.env|fetch\s*\(|child_process|spawn|execFile|readFile|writeFile/iu,
  );
  assert.match(
    source,
    /openLangameInitialSyncRuntimeProviderCurrent194\(\) \{\s*fail\("CURRENT194_PROVIDER_PRODUCTION_DENIED"\)/u,
  );
});

test("CURRENT194 rejects malformed RPC inputs before the runtime driver", async () => {
  const attestation = verifiedAttestation();
  const fixture = drivers(attestation);
  const session = await open(attestation, fixture);
  await assert.rejects(
    session.claimCurrent192({ ...claimInput, unexpected: true }),
    (error) => error.code === "CURRENT194_PROVIDER_CLAIM_INPUT_INVALID",
  );
  await assert.rejects(
    session.executeCurrent192({ ...executeInput, canonicalPlan: "" }),
    (error) => error.code === "CURRENT194_PROVIDER_EXECUTE_INPUT_INVALID",
  );
  await assert.rejects(
    session.reconcileCurrent192({ ...reconcileInput, planDigest: "bad" }),
    (error) => error.code === "CURRENT194_PROVIDER_RECONCILE_INPUT_INVALID",
  );
  assert.equal(fixture.observed.claims.length, 0);
  assert.equal(fixture.observed.executions.length, 0);
  assert.equal(fixture.observed.reconciliations.length, 0);
  await session.drain();
});
