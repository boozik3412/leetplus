import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildIdentityMailEnrollmentEvidenceCurrent185Fixture } from "./identity-mail-enrollment-evidence-current185-fixture.mjs";

const INPUT = Object.freeze({
  actualContextDigest: "3".repeat(64),
  commandId: "22222222-2222-4222-8222-222222222222",
  coordinatorRoleName: "identity_mail_enrollment_coordinator",
  coordinatorRoleOid: 16_387,
  databaseIdentityDigest: "1".repeat(64),
  databaseName: "lp_imtec_0123456789abcdef0123456789abcdef_ci",
  databaseOid: 16_384,
  deploymentMarkerDigest: "2".repeat(64),
  deploymentMarkerId: "44444444-4444-4444-8444-444444444444",
  manifestId: "55555555-5555-4555-8555-555555555555",
  requestId: "33333333-3333-4333-8333-333333333333",
  tenantId: "11111111-1111-4111-8111-111111111111",
  validForMs: 10_000,
  workerRoleName: "identity_mail_worker_v2",
  workerRoleOid: 16_388,
});

async function fixtureResidue() {
  return new Set(
    (await readdir(tmpdir()))
      .filter(
        (entry) =>
          entry.startsWith("leetplus-manifest-bound-v2-") ||
          entry.startsWith(
            `leetplus-current185-evidence-fixture-${process.pid}-`,
          ),
      )
      .sort(),
  );
}

test("mints one actual branded, PII-free two-signer CURRENT185 bundle and cleans up", async () => {
  const before = await fixtureResidue();
  const fixture =
    await buildIdentityMailEnrollmentEvidenceCurrent185Fixture({ ...INPUT });
  const serialized = JSON.stringify(fixture);

  assert.equal(fixture.bundle.schemaVersion, 1);
  assert.equal(
    fixture.bundle.contract,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2",
  );
  assert.equal(fixture.bundle.tenantId, INPUT.tenantId);
  assert.equal(fixture.bundle.commandId, INPUT.commandId);
  assert.equal(fixture.bundle.requestId, INPUT.requestId);
  assert.equal(fixture.bundle.manifestId, INPUT.manifestId);
  assert.equal(fixture.bundle.bundleDigest, fixture.bundleDigest);
  assert.match(fixture.bundleDigest, /^[0-9a-f]{64}$/u);
  assert.equal(typeof fixture.bundleCanonicalJson, "string");
  assert.doesNotMatch(
    serialized,
    /(?:@|email|phone|password|privateKey|publicKeyPem|secret|accessToken|refreshToken|providerMessageId|BEGIN PRIVATE KEY)/iu,
  );
  assert.deepEqual(await fixtureResidue(), before);
});

test("fails closed on extra keys and non-disposable database identities", async () => {
  await assert.rejects(
    buildIdentityMailEnrollmentEvidenceCurrent185Fixture({
      ...INPUT,
      unexpected: true,
    }),
    /input keys are not exact/u,
  );
  await assert.rejects(
    buildIdentityMailEnrollmentEvidenceCurrent185Fixture({
      ...INPUT,
      databaseName: "leetplus_production",
    }),
    /databaseName is not an exact disposable database/u,
  );
});

test("mints a second signed command against the exact same manifest without exporting key material", async () => {
  const fixture =
    await buildIdentityMailEnrollmentEvidenceCurrent185Fixture({
      ...INPUT,
      reuseCommandId: "66666666-6666-4666-8666-666666666666",
      reuseRequestId: "77777777-7777-4777-8777-777777777777",
    });
  assert(fixture.reuse);
  assert.equal(
    fixture.reuse.bundle.manifestPayloadDigest,
    fixture.bundle.manifestPayloadDigest,
  );
  assert.equal(fixture.reuse.bundle.manifestId, fixture.bundle.manifestId);
  assert.notEqual(fixture.reuse.bundle.commandId, fixture.bundle.commandId);
  assert.notEqual(fixture.reuse.bundle.requestId, fixture.bundle.requestId);
  assert.notEqual(fixture.reuse.bundle.bundleDigest, fixture.bundle.bundleDigest);
  assert.doesNotMatch(
    JSON.stringify(fixture),
    /(?:privateKey|publicKeyPem|BEGIN PRIVATE KEY|"roots"\s*:)/iu,
  );
});
