import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_KIND,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_ORDINAL,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_GRANTS_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_KIND,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_MAX_LIFETIME_MS,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PREDECESSOR,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PURPOSE,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_ALGORITHM,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SYNTHETIC_CONFIRMATION,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TRUST_DOMAIN,
  IdentityMailDutyRoleManifestV2Error,
  PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS,
  identityMailDutyRoleManifestV2Evidence,
  identityMailDutyRoleManifestV2Payload,
  identityMailDutyRoleManifestV2PayloadDigest,
  identityMailDutyRoleManifestV2PublicKeyFingerprint,
  isVerifiedIdentityMailDutyRoleManifestV2,
  isVerifiedSyntheticIdentityMailDutyRoleManifestV2,
  verifyPinnedIdentityMailDutyRoleManifestV2Envelope,
  verifySyntheticIdentityMailDutyRoleManifestV2Envelope,
} from "./identity-mail-duty-role-manifest-v2.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
after(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = join(SCRIPT_DIR, "identity-mail-duty-role-manifest-v2.mjs");
const NOW = "2026-08-02T12:00:00.000Z";
const DATABASE_NAME = "leetplus_duty_manifest_v2_ci";
const KEY_ID = "identity-mail-duty-manifest-v2-ci-1";
const RELEASE_SHA = "a".repeat(40);
const ARTIFACT_SHA = "b".repeat(64);
const DIGESTS = Object.freeze({
  actualContext: "1".repeat(64),
  databaseIdentity: "2".repeat(64),
  deploymentMarker: "3".repeat(64),
  grants: "4".repeat(64),
});
const SYNTHETIC_CONTEXT = Object.freeze({
  databaseName: DATABASE_NAME,
  environment: "ci",
  explicitConfirmation:
    IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SYNTHETIC_CONFIRMATION,
  hostname: "127.0.0.1",
  nodeEnv: "test",
});
const PAYLOAD_KEYS = Object.freeze(
  [
    "actualContextDigest",
    "authorization",
    "canMutate",
    "canSend",
    "chain",
    "contract",
    "database",
    "deploymentMarkerDigest",
    "deploymentMarkerId",
    "exactGrants",
    "issuedAt",
    "kind",
    "manifestId",
    "manifestRevision",
    "profile",
    "publicKeyFingerprint",
    "purpose",
    "roles",
    "schemaVersion",
    "signingKeyId",
    "trustDomain",
    "validUntil",
  ].sort(),
);
const EVIDENCE_KEYS = Object.freeze(
  [
    "contract",
    "issuedAt",
    "payloadCanonicalJson",
    "payloadDigest",
    "profile",
    "publicKeyFingerprint",
    "purpose",
    "schemaVersion",
    "signatureAlgorithm",
    "signatureBase64url",
    "signingKeyId",
    "trustDomain",
    "validUntil",
  ].sort(),
);

function expectCode(action, code) {
  assert.throws(
    action,
    (error) =>
      error instanceof IdentityMailDutyRoleManifestV2Error &&
      error.code === code &&
      error.reasonCode === code &&
      error.exitCode === 3 &&
      error.safeContractError === true,
  );
}

function authority(rootOverrides = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint =
    identityMailDutyRoleManifestV2PublicKeyFingerprint(publicKeyPem);
  const root = {
    algorithm: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_ALGORITHM,
    keyId: KEY_ID,
    notAfter: "2027-01-01T00:00:00.000Z",
    notBefore: "2026-01-01T00:00:00.000Z",
    profile: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PROFILE,
    publicKeyFingerprint,
    publicKeyPem,
    purpose: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PURPOSE,
    status: "ACTIVE",
    trustDomain: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TRUST_DOMAIN,
    ...rootOverrides,
  };
  return { privateKey, publicKeyFingerprint, root, roots: { [root.keyId]: root } };
}

function payloadFor(signer, overrides = {}) {
  return {
    actualContextDigest: DIGESTS.actualContext,
    authorization: false,
    canMutate: false,
    canSend: false,
    chain: {
      head: {
        artifactSha256: ARTIFACT_SHA,
        contract: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_CONTRACT,
        kind: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_KIND,
        ordinal: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_ORDINAL,
        releaseSha: RELEASE_SHA,
      },
      predecessor: { ...IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PREDECESSOR },
    },
    contract: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CONTRACT,
    database: {
      identityDigest: DIGESTS.databaseIdentity,
      name: DATABASE_NAME,
      oid: 16_384,
    },
    deploymentMarkerDigest: DIGESTS.deploymentMarker,
    deploymentMarkerId: "11111111-1111-4111-8111-111111111111",
    exactGrants: {
      digest: DIGESTS.grants,
      profile: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_GRANTS_PROFILE,
    },
    issuedAt: "2026-08-02T11:59:00.000Z",
    kind: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_KIND,
    manifestId: "22222222-2222-4222-8222-222222222222",
    manifestRevision: 1,
    profile: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PROFILE,
    publicKeyFingerprint: signer.publicKeyFingerprint,
    purpose: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PURPOSE,
    roles: {
      coordinator: {
        name: "identity_mail_enrollment_coordinator",
        oid: 16_385,
      },
      worker: { name: "identity_mail_worker_v2", oid: 16_386 },
    },
    schemaVersion: 2,
    signingKeyId: signer.root.keyId,
    trustDomain: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TRUST_DOMAIN,
    validUntil: "2026-08-02T12:10:00.000Z",
    ...overrides,
  };
}

function envelopeFor(payload, signer, overrides = {}) {
  return {
    payload,
    payloadDigest: identityMailDutyRoleManifestV2PayloadDigest(payload),
    publicKeyFingerprint: payload.publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      signer.privateKey,
    ).toString("base64url"),
    signatureAlgorithm: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_ALGORITHM,
    signingKeyId: payload.signingKeyId,
    ...overrides,
  };
}

function fixture(payloadOverrides = {}, rootOverrides = {}) {
  const signer = authority(rootOverrides);
  const payload = payloadFor(signer, payloadOverrides);
  return { envelope: envelopeFor(payload, signer), signer };
}

function verify(value, context = SYNTHETIC_CONTEXT, now = NOW) {
  return verifySyntheticIdentityMailDutyRoleManifestV2Envelope(
    value.envelope,
    value.signer.roots,
    context,
    now,
  );
}

function resign(value, payloadOverrides) {
  const payload = { ...value.envelope.payload, ...payloadOverrides };
  return { ...value, envelope: envelopeFor(payload, value.signer) };
}

test("verifies exact synthetic Manifest V2 bindings with a separate nonauthorizing brand", () => {
  const value = fixture();
  const verified = verify(value);
  assert.equal(isVerifiedSyntheticIdentityMailDutyRoleManifestV2(verified), true);
  assert.equal(isVerifiedIdentityMailDutyRoleManifestV2(verified), false);
  assert.equal(verified.verificationMode, "SYNTHETIC");
  assert.equal(verified.authorization, false);
  assert.equal(verified.canMutate, false);
  assert.equal(verified.canSend, false);
  assert.equal(verified.databaseIdentityDigest, DIGESTS.databaseIdentity);
  assert.equal(verified.deploymentMarkerDigest, DIGESTS.deploymentMarker);
  assert.equal(verified.actualContextDigest, DIGESTS.actualContext);
  assert.equal(verified.coordinatorRoleOid, 16_385);
  assert.equal(verified.workerRoleOid, 16_386);
  assert.equal(verified.exactGrantsDigest, DIGESTS.grants);
  assert.equal(verified.applicationReleaseSha, RELEASE_SHA);
  assert.equal(verified.applicationArtifactSha256, ARTIFACT_SHA);
  assert.deepEqual(Object.keys(value.envelope.payload).sort(), PAYLOAD_KEYS);
  assert(Object.isFrozen(verified));
  expectCode(
    () => identityMailDutyRoleManifestV2Payload(verified),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_NOT_VERIFIED",
  );
  expectCode(
    () => identityMailDutyRoleManifestV2Evidence(verified),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_NOT_VERIFIED",
  );
});

test("pins CURRENT184 predecessor while release and artifact are dynamic signed values", () => {
  assert.deepEqual(IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PREDECESSOR, {
    count: 184,
    head: "20260802020000_identity_mail_worker_v2_lost_response_replay",
    headChecksum:
      "d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424",
    manifestDigest:
      "9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819",
  });
  const value = fixture();
  const changedHead = {
    ...value.envelope.payload.chain.head,
    artifactSha256: "d".repeat(64),
    releaseSha: "e".repeat(40),
  };
  const changed = resign(value, {
    chain: {
      head: changedHead,
      predecessor: { ...IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PREDECESSOR },
    },
  });
  assert.equal(verify(changed).applicationReleaseSha, "e".repeat(40));
  assert.equal(verify(changed).applicationArtifactSha256, "d".repeat(64));

  const unsignedMutation = fixture();
  unsignedMutation.envelope.payload.chain.head.releaseSha = "f".repeat(40);
  expectCode(
    () => verify(unsignedMutation),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ENVELOPE_BINDING_INVALID",
  );
});

test("application head accepts only exact contract and lowercase 40/64 formats", () => {
  for (const headMutation of [
    { releaseSha: "A".repeat(40) },
    { releaseSha: "a".repeat(39) },
    { artifactSha256: "B".repeat(64) },
    { artifactSha256: "b".repeat(63) },
    { contract: "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V3" },
    { kind: "DATABASE_MIGRATION" },
    { ordinal: 186 },
  ]) {
    const value = fixture();
    const head = { ...value.envelope.payload.chain.head, ...headMutation };
    expectCode(
      () =>
        verify(
          resign(value, {
            chain: {
              head,
              predecessor: { ...IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PREDECESSOR },
            },
          }),
        ),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CHAIN_INVALID",
    );
  }
});

test("coordinator and worker must have distinct safe names and OIDs", () => {
  const validCoordinator = {
    name: "identity_mail_enrollment_coordinator",
    oid: 16_385,
  };
  const validWorker = { name: "identity_mail_worker_v2", oid: 16_386 };
  for (const roles of [
    { coordinator: { name: "postgres", oid: 16_385 }, worker: validWorker },
    { coordinator: { name: "pg_monitor", oid: 16_385 }, worker: validWorker },
    { coordinator: validCoordinator, worker: { ...validCoordinator } },
    {
      coordinator: validCoordinator,
      worker: { name: validWorker.name, oid: validCoordinator.oid },
    },
  ]) {
    expectCode(
      () => verify(resign(fixture(), { roles })),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROLES_INVALID",
    );
  }
});

test("hostile envelope/payload/accessor/symbol/transparent and revoked proxies fail closed", () => {
  const accessor = fixture();
  let getterCalls = 0;
  Object.defineProperty(accessor.envelope.payload, "manifestId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "22222222-2222-4222-8222-222222222222";
    },
  });
  expectCode(
    () => verify(accessor),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PAYLOAD_INVALID",
  );
  assert.equal(getterCalls, 0);

  const symbol = fixture();
  symbol.envelope.payload.roles.worker[Symbol("extra")] = true;
  expectCode(
    () => verify(symbol),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROLES_INVALID",
  );

  const proxyEnvelope = fixture();
  proxyEnvelope.envelope = new Proxy(proxyEnvelope.envelope, {});
  expectCode(
    () => verify(proxyEnvelope),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ENVELOPE_INVALID",
  );

  const proxyPayload = fixture();
  proxyPayload.envelope.payload = new Proxy(proxyPayload.envelope.payload, {});
  expectCode(
    () => verify(proxyPayload),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PAYLOAD_INVALID",
  );

  const revokedEnvelope = Proxy.revocable(fixture().envelope, {});
  revokedEnvelope.revoke();
  const revokedEnvelopeValue = fixture();
  revokedEnvelopeValue.envelope = revokedEnvelope.proxy;
  expectCode(
    () => verify(revokedEnvelopeValue),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ENVELOPE_INVALID",
  );

  const revokedPayload = Proxy.revocable(fixture().envelope.payload, {});
  revokedPayload.revoke();
  const revokedPayloadValue = fixture();
  revokedPayloadValue.envelope.payload = revokedPayload.proxy;
  expectCode(
    () => verify(revokedPayloadValue),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PAYLOAD_INVALID",
  );
});

test("transparent and revoked root registries and roots fail with typed errors", () => {
  const registryProxy = fixture();
  registryProxy.signer.roots = new Proxy(registryProxy.signer.roots, {});
  expectCode(
    () => verify(registryProxy),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS_INVALID",
  );

  const rootProxy = fixture();
  rootProxy.signer.roots = {
    [KEY_ID]: new Proxy(rootProxy.signer.root, {}),
  };
  expectCode(
    () => verify(rootProxy),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOT_INVALID",
  );

  const revokedRegistry = Proxy.revocable(fixture().signer.roots, {});
  revokedRegistry.revoke();
  const revokedRegistryValue = fixture();
  revokedRegistryValue.signer.roots = revokedRegistry.proxy;
  expectCode(
    () => verify(revokedRegistryValue),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS_INVALID",
  );

  const revokedRoot = Proxy.revocable(fixture().signer.root, {});
  revokedRoot.revoke();
  const revokedRootValue = fixture();
  revokedRootValue.signer.roots = { [KEY_ID]: revokedRoot.proxy };
  expectCode(
    () => verify(revokedRootValue),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOT_INVALID",
  );
});

test("timestamp rejection precedes payload digest, root, and signature work", () => {
  const malformed = fixture();
  malformed.envelope.payload.issuedAt = "2026-08-02T11:59:00Z";
  malformed.envelope.payloadDigest = "x".repeat(64);
  malformed.envelope.signature = "AA";
  malformed.signer.roots = new Proxy(malformed.signer.roots, {});
  expectCode(
    () => verify(malformed),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TIMELINE_INVALID",
  );
});

test("signature is exactly canonical 86-character Ed25519 base64url", () => {
  const value = fixture();
  assert.equal(value.envelope.signature.length, 86);
  for (const signature of [
    "A".repeat(85),
    "A".repeat(87),
    `${value.envelope.signature}=`,
    "AA",
  ]) {
    const mutated = fixture();
    mutated.envelope.signature = signature;
    expectCode(
      () => verify(mutated),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_INVALID",
    );
  }
  const corrupted = fixture();
  const bytes = Buffer.from(corrupted.envelope.signature, "base64url");
  bytes[0] ^= 0xff;
  corrupted.envelope.signature = bytes.toString("base64url");
  expectCode(
    () => verify(corrupted),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_INVALID",
  );
});

test("root domain/profile/purpose/status/fingerprint and short timeline are exact", () => {
  for (const mutation of [
    { trustDomain: "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_AUTHORITY_V1" },
    { profile: "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE_V1" },
    { purpose: "IDENTITY_MAIL_DUTY_ROLE_BINDING" },
    { status: "REVOKED" },
    { algorithm: "EdDSA" },
    { publicKeyFingerprint: "0".repeat(64) },
  ]) {
    const value = fixture();
    value.signer.roots = {
      [KEY_ID]: { ...value.signer.root, ...mutation },
    };
    expectCode(
      () => verify(value),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOT_INVALID",
    );
  }

  for (const mutation of [
    { validUntil: NOW },
    { issuedAt: "2026-08-02T12:01:00.001Z" },
    {
      issuedAt: "2026-08-02T11:50:00.000Z",
      validUntil: new Date(
        Date.parse("2026-08-02T11:50:00.000Z") +
          IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_MAX_LIFETIME_MS +
          1,
      ).toISOString(),
    },
  ]) {
    expectCode(
      () => verify(resign(fixture(), mutation)),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TIMELINE_INVALID",
    );
  }
});

test("production roots are frozen, empty, and pinned path is noninjectable", () => {
  const value = fixture();
  assert(Object.isFrozen(PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS));
  assert.deepEqual(Object.keys(PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS), []);
  expectCode(
    () => verifyPinnedIdentityMailDutyRoleManifestV2Envelope(value.envelope),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_AUTHORITY_NOT_ENROLLED",
  );
  expectCode(
    () =>
      verifyPinnedIdentityMailDutyRoleManifestV2Envelope(
        value.envelope,
        value.signer.roots,
      ),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ARGUMENTS_INVALID",
  );
});

test("synthetic verification requires exact loopback CI context", () => {
  for (const mutation of [
    { databaseName: "leetplus_prod" },
    { environment: "production" },
    { explicitConfirmation: "yes" },
    { hostname: "LOCALHOST" },
    { hostname: "db.example.com" },
    { nodeEnv: "production" },
  ]) {
    expectCode(
      () => verify(fixture(), { ...SYNTHETIC_CONTEXT, ...mutation }),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SYNTHETIC_CONTEXT_DENIED",
    );
  }
});

test("fixture PINNED payload and canonical signature evidence are exact and module-local", async () => {
  const fixtureNow = Date.now();
  const signer = authority({
    notAfter: new Date(fixtureNow + 60 * 60_000).toISOString(),
    notBefore: new Date(fixtureNow - 60 * 60_000).toISOString(),
  });
  const payload = payloadFor(signer, {
    issuedAt: new Date(fixtureNow - 10_000).toISOString(),
    validUntil: new Date(fixtureNow + 5 * 60_000).toISOString(),
  });
  const envelope = envelopeFor(payload, signer);
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), "leetplus-duty-role-manifest-v2-pinned-"),
  );
  try {
    const source = await readFile(CONTRACT_PATH, "utf8");
    const registryPattern =
      /export const PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS =\r?\n  Object\.freeze\(\{\}\);/gu;
    assert.equal([...source.matchAll(registryPattern)].length, 1);
    const fixtureRegistry = `export const PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS =
  Object.freeze({ ${JSON.stringify(KEY_ID)}: Object.freeze(${JSON.stringify(signer.root)}) });`;
    const fixtureSource = source.replace(registryPattern, fixtureRegistry);
    const fixtureModulePath = join(
      fixtureDirectory,
      "identity-mail-duty-role-manifest-v2.mjs",
    );
    await Promise.all([
      writeFile(fixtureModulePath, fixtureSource, "utf8"),
      writeFile(
        join(fixtureDirectory, "staff-task-integrity-canonical-json.mjs"),
        await readFile(join(SCRIPT_DIR, "staff-task-integrity-canonical-json.mjs"), "utf8"),
        "utf8",
      ),
    ]);
    const fixtureModule = await import(pathToFileURL(fixtureModulePath).href);
    const verified =
      fixtureModule.verifyPinnedIdentityMailDutyRoleManifestV2Envelope(envelope);
    assert.equal(fixtureModule.isVerifiedIdentityMailDutyRoleManifestV2(verified), true);
    assert.equal(
      fixtureModule.isVerifiedSyntheticIdentityMailDutyRoleManifestV2(verified),
      false,
    );
    assert.equal(isVerifiedIdentityMailDutyRoleManifestV2(verified), false);
    const pinnedPayload = fixtureModule.identityMailDutyRoleManifestV2Payload(verified);
    const evidence = fixtureModule.identityMailDutyRoleManifestV2Evidence(verified);
    assert.deepEqual(pinnedPayload, payload);
    assert.notEqual(pinnedPayload, payload);
    assert(Object.isFrozen(pinnedPayload));
    assert(Object.isFrozen(pinnedPayload.chain));
    assert(Object.isFrozen(pinnedPayload.chain.head));
    assert(Object.isFrozen(pinnedPayload.roles.coordinator));
    assert.deepEqual(Object.keys(evidence).sort(), EVIDENCE_KEYS);
    assert(Object.isFrozen(evidence));
    assert.equal(evidence.payloadCanonicalJson, canonicalStringify(pinnedPayload));
    assert.equal(evidence.payloadDigest, envelope.payloadDigest);
    assert.equal(evidence.signatureBase64url, envelope.signature);
    assert.equal(evidence.signingKeyId, KEY_ID);
    assert.equal(evidence.publicKeyFingerprint, signer.publicKeyFingerprint);
    assert.equal(evidence.issuedAt, payload.issuedAt);
    assert.equal(evidence.validUntil, payload.validUntil);

    for (const extractor of [
      fixtureModule.identityMailDutyRoleManifestV2Payload,
      fixtureModule.identityMailDutyRoleManifestV2Evidence,
    ]) {
      assert.throws(
        () => extractor({ ...verified }),
        (error) => error?.code === "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_NOT_VERIFIED",
      );
    }
    const synthetic =
      fixtureModule.verifySyntheticIdentityMailDutyRoleManifestV2Envelope(
        envelope,
        signer.roots,
        SYNTHETIC_CONTEXT,
        new Date(fixtureNow).toISOString(),
      );
    for (const extractor of [
      fixtureModule.identityMailDutyRoleManifestV2Payload,
      fixtureModule.identityMailDutyRoleManifestV2Evidence,
    ]) {
      assert.throws(
        () => extractor(synthetic),
        (error) => error?.code === "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_NOT_VERIFIED",
      );
    }
  } finally {
    await rm(fixtureDirectory, { force: true, recursive: true });
  }
});

test("Manifest V2 is pure and contains no DB, network, Nest, env-root, or runtime wiring", async () => {
  const source = await readFile(CONTRACT_PATH, "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(imports, [
    "node:crypto",
    "node:util",
    "./staff-task-integrity-canonical-json.mjs",
  ]);
  assert.doesNotMatch(
    source,
    /(?:@prisma\/client|PrismaClient|@nestjs|nodemailer|smtp|fetch\(|axios|node:net|node:http|node:https|DATABASE_URL|\$executeRaw|\$queryRaw|\bGRANT\b|\bREVOKE\b)/iu,
  );
  assert.match(source, /const VERIFIED_PINNED_MANIFESTS_V2 = new WeakSet\(\)/u);
  assert.match(source, /const VERIFIED_SYNTHETIC_MANIFESTS_V2 = new WeakSet\(\)/u);
  assert.match(source, /const VERIFIED_PINNED_PAYLOADS_V2 = new WeakMap\(\)/u);
  assert.match(source, /const VERIFIED_PINNED_EVIDENCE_V2 = new WeakMap\(\)/u);
  assert.match(source, /utilTypes\.isProxy/u);
});
