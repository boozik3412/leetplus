import assert from "node:assert/strict";
import test from "node:test";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import {
  ACQUISITION_APPROVAL_REFERENCE_PREFIX,
  ACQUISITION_DATA_MINIMIZATION_PROFILE,
  ACQUISITION_REQUEST_KIND,
  approvalReferenceForAcquisitionRequest,
  computeAcquisitionRequestDigest,
  normalizeAcquisitionRequest,
  parseCanonicalAcquisitionRequest,
} from "./staff-task-integrity-snapshot-acquisition-request.mjs";

const NOW = new Date("2026-07-29T06:00:00.000Z");

function request(overrides = {}) {
  const base = {
    schemaVersion: 1,
    kind: ACQUISITION_REQUEST_KIND,
    purpose: "STAFF_TASK_INTEGRITY_RECONCILIATION",
    classification: "PRODUCTION_LIKE",
    profile: "STAFF_TASK_INTEGRITY_PRODUCTION_LIKE_V1",
    isolationProfile: "ISOLATED_ENCRYPTED_NO_EGRESS_V1",
    releaseSha: "a".repeat(40),
    expectedState: "BASELINE_156",
    snapshotArtifactDigest: "b".repeat(64),
    databaseIdentity: {
      currentDatabase: "leetplus_snapshot_rehearsal",
      clusterSystemIdentifier: "7667202810308916656",
      databaseOid: "16384",
    },
    timeline: {
      acquiredAt: "2026-07-29T05:00:00.000Z",
      restoredAt: "2026-07-29T05:45:00.000Z",
      expiresAt: "2026-07-31T05:00:00.000Z",
    },
    actors: {
      sourceOwnerReference: "role:source-owner-01",
      acquisitionOperatorReference: "role:acquisition-operator-01",
      securityApproverReference: "role:security-approver-01",
      destructionOwnerReference: "role:destruction-owner-01",
    },
    controls: {
      dataMinimizationProfile: ACQUISITION_DATA_MINIMIZATION_PROFILE,
      encryptedInTransit: true,
      encryptedAtRest: true,
      disposableDestination: true,
      noEgress: true,
      applicationWorkloadsDisabled: true,
      productionCredentialsRemoved: true,
      destructionScheduled: true,
    },
    references: {
      changeRecordReference: "change:open-beta-rehearsal-001",
      destinationReference: "destination:loopback-pg16-001",
      incidentContactReference: "incident-role:open-beta-primary",
      destructionProcedureReference: "procedure:snapshot-destroy-v1",
    },
  };
  return {
    ...base,
    ...overrides,
    databaseIdentity: {
      ...base.databaseIdentity,
      ...(overrides.databaseIdentity ?? {}),
    },
    timeline: { ...base.timeline, ...(overrides.timeline ?? {}) },
    actors: { ...base.actors, ...(overrides.actors ?? {}) },
    controls: { ...base.controls, ...(overrides.controls ?? {}) },
    references: { ...base.references, ...(overrides.references ?? {}) },
  };
}

test("one exact canonical acquisition request produces a bound approval alias", () => {
  const normalized = normalizeAcquisitionRequest(request(), NOW);
  const canonical = canonicalStringify(normalized);
  assert.deepEqual(
    parseCanonicalAcquisitionRequest(canonical, NOW),
    normalized,
  );
  const digest = computeAcquisitionRequestDigest(normalized, NOW);
  assert.match(digest, /^[0-9a-f]{64}$/u);
  assert.equal(
    approvalReferenceForAcquisitionRequest(normalized, NOW),
    `${ACQUISITION_APPROVAL_REFERENCE_PREFIX}${digest}`,
  );
});

test("every material request change changes the approval authority alias", () => {
  const baseline = approvalReferenceForAcquisitionRequest(request(), NOW);
  for (const changed of [
    request({ expectedState: "EXPAND_162" }),
    request({ snapshotArtifactDigest: "c".repeat(64) }),
    request({
      databaseIdentity: { databaseOid: "16385" },
    }),
    request({
      actors: { securityApproverReference: "role:security-approver-02" },
    }),
    request({
      references: { changeRecordReference: "change:open-beta-rehearsal-002" },
    }),
  ]) {
    assert.notEqual(
      approvalReferenceForAcquisitionRequest(changed, NOW),
      baseline,
    );
  }
});

test("missing, extra, accessor, duplicate, and noncanonical fields reject", () => {
  const missing = request();
  delete missing.controls.noEgress;
  assert.throws(() => normalizeAcquisitionRequest(missing, NOW), {
    code: "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID",
  });
  assert.throws(
    () =>
      normalizeAcquisitionRequest({ ...request(), callerOverride: true }, NOW),
    { code: "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID" },
  );
  const accessor = request();
  Object.defineProperty(accessor, "releaseSha", {
    enumerable: true,
    get: () => "a".repeat(40),
  });
  assert.throws(() => normalizeAcquisitionRequest(accessor, NOW), {
    code: "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID",
  });
  const canonical = canonicalStringify(request());
  assert.throws(() => parseCanonicalAcquisitionRequest(`${canonical}\n`, NOW), {
    code: "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID",
  });
  const duplicate = canonical.replace(
    '"schemaVersion":1',
    '"schemaVersion":1,"schemaVersion":1',
  );
  assert.throws(() => parseCanonicalAcquisitionRequest(duplicate, NOW), {
    code: "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID",
  });
});

test("the ceremony accepts CURRENT_187 and rejects frozen CURRENT_172", () => {
  assert.equal(
    normalizeAcquisitionRequest(request({ expectedState: "CURRENT_187" }), NOW)
      .expectedState,
    "CURRENT_187",
  );
  assert.throws(
    () =>
      normalizeAcquisitionRequest(
        request({ expectedState: "CURRENT_172" }),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID" },
  );
});

test("false controls and non-separated actors reject", () => {
  assert.throws(
    () =>
      normalizeAcquisitionRequest(
        request({ controls: { noEgress: false } }),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_CONTROLS_INVALID" },
  );
  assert.throws(
    () =>
      normalizeAcquisitionRequest(
        request({
          actors: {
            securityApproverReference: "role:acquisition-operator-01",
          },
        }),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_SEPARATION_INVALID" },
  );
  assert.throws(
    () =>
      normalizeAcquisitionRequest(
        request({
          actors: {
            sourceOwnerReference: 123,
            destructionOwnerReference: "123",
          },
        }),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_REFERENCE_INVALID" },
  );
});

test("PII-like references, remote destinations, and invalid DB identity reject", () => {
  assert.throws(
    () =>
      normalizeAcquisitionRequest(
        request({
          references: {
            incidentContactReference: "owner@example.com",
          },
        }),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_REFERENCE_INVALID" },
  );
  assert.throws(
    () =>
      normalizeAcquisitionRequest(
        request({
          references: {
            destinationReference: "https://db.example.test",
          },
        }),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_REFERENCE_INVALID" },
  );
  assert.throws(
    () =>
      normalizeAcquisitionRequest(
        request({
          databaseIdentity: { currentDatabase: "leetplus_production" },
        }),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_DATABASE_IDENTITY_INVALID" },
  );
  assert.throws(
    () =>
      normalizeAcquisitionRequest(
        request({
          databaseIdentity: { currentDatabase: "leetplus_contest" },
        }),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_DATABASE_IDENTITY_INVALID" },
  );
  assert.throws(
    () =>
      normalizeAcquisitionRequest(
        request({
          databaseIdentity: { databaseOid: 16384 },
        }),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_DATABASE_IDENTITY_INVALID" },
  );
  assert.equal(
    normalizeAcquisitionRequest(
      request({
        databaseIdentity: {
          currentDatabase: "leetplus-snapshot-rehearsal",
        },
      }),
      NOW,
    ).databaseIdentity.currentDatabase,
    "leetplus-snapshot-rehearsal",
  );
});

test("future restore, expiry, and lifetime above 72 hours reject", () => {
  assert.throws(
    () =>
      normalizeAcquisitionRequest(
        request({ timeline: { restoredAt: "2026-07-29T06:06:00.000Z" } }),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_TIMELINE_INVALID" },
  );
  assert.throws(
    () =>
      normalizeAcquisitionRequest(
        request({ timeline: { expiresAt: "2026-07-29T05:59:59.000Z" } }),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_TIMELINE_INVALID" },
  );
  assert.throws(
    () =>
      normalizeAcquisitionRequest(
        request({ timeline: { expiresAt: "2026-08-01T05:00:01.000Z" } }),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_TIMELINE_INVALID" },
  );
});
