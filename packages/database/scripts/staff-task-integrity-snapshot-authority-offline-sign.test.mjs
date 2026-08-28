import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import {
  ACQUISITION_DATA_MINIMIZATION_PROFILE,
  ACQUISITION_REQUEST_KIND,
} from "./staff-task-integrity-snapshot-acquisition-request.mjs";
import {
  computePublicKeyFingerprint,
  parseAuthorityEnvelope,
} from "./staff-task-integrity-snapshot-authority.mjs";
import { AUTHORITY_ROOT_STATUS } from "./staff-task-integrity-snapshot-authority-root-registry.mjs";
import {
  SIGNING_PACKAGE_KIND,
  SIGNING_RECEIPT_KIND,
  CEREMONY_RELEASE_SOURCE_PATHS,
  finalizeAuthoritySigningPackage,
  prepareAuthoritySigningPackage,
  writeExclusiveSet,
} from "./staff-task-integrity-snapshot-authority-offline-sign.cli.mjs";

const NOW = new Date("2026-07-29T06:00:00.000Z");
const KEY_ID = "staff-task-production-like-test-2026-01";
const OFFLINE_SCRIPT_PATH = fileURLToPath(
  new URL(
    "./staff-task-integrity-snapshot-authority-offline-sign.cli.mjs",
    import.meta.url,
  ),
);

function keyMaterial() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const root = Object.freeze({
    keyId: KEY_ID,
    algorithm: "Ed25519",
    classification: "PRODUCTION_LIKE",
    profile: "STAFF_TASK_INTEGRITY_PRODUCTION_LIKE_V1",
    purpose: "STAFF_TASK_INTEGRITY_RECONCILIATION",
    publicKeyPem,
    publicKeyFingerprint: computePublicKeyFingerprint(publicKeyPem),
    notBefore: "2026-07-29T00:00:00.000Z",
    notAfter: "2026-08-29T00:00:00.000Z",
    status: AUTHORITY_ROOT_STATUS.ACTIVE,
    supersedesKeyId: null,
    retiredAt: null,
    revokedAt: null,
  });
  return {
    privateKey,
    root,
    roots: Object.freeze({ [KEY_ID]: root }),
  };
}

function acquisitionRequest(expectedState = "BASELINE_156", overrides = {}) {
  const base = {
    schemaVersion: 1,
    kind: ACQUISITION_REQUEST_KIND,
    purpose: "STAFF_TASK_INTEGRITY_RECONCILIATION",
    classification: "PRODUCTION_LIKE",
    profile: "STAFF_TASK_INTEGRITY_PRODUCTION_LIKE_V1",
    isolationProfile: "ISOLATED_ENCRYPTED_NO_EGRESS_V1",
    releaseSha: "a".repeat(40),
    expectedState,
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
  };
}

test("prepare emits only a detached payload and privacy-safe signing package", () => {
  const { roots } = keyMaterial();
  const prepared = prepareAuthoritySigningPackage({
    acquisitionRequest: acquisitionRequest(),
    roots,
    now: NOW,
    creationNonce: "c".repeat(64),
  });

  assert.equal(prepared.signingPackage.kind, SIGNING_PACKAGE_KIND);
  assert.equal(prepared.signingPackage.signingKeyId, KEY_ID);
  assert.ok(Buffer.isBuffer(prepared.signingPayload));
  assert.deepEqual(
    prepared.signingPayload,
    Buffer.from(
      canonicalStringify(JSON.parse(prepared.signingPayload.toString("utf8"))),
      "utf8",
    ),
  );
  const serializedPackage = canonicalStringify(prepared.signingPackage);
  assert.doesNotMatch(
    serializedPackage,
    /leetplus_snapshot_rehearsal|7667202810308916656|16384|source-owner|security-approver/u,
  );
  assert.doesNotMatch(serializedPackage, /PRIVATE KEY|passphrase/iu);
});

test("an external detached signature finalizes one verifiable envelope", () => {
  const { privateKey, roots } = keyMaterial();
  const request = acquisitionRequest("CURRENT_188");
  const prepared = prepareAuthoritySigningPackage({
    acquisitionRequest: request,
    roots,
    now: NOW,
    creationNonce: "d".repeat(64),
  });
  const signature = sign(null, prepared.signingPayload, privateKey);
  const finalized = finalizeAuthoritySigningPackage({
    acquisitionRequest: request,
    signingPackage: prepared.signingPackage,
    signature,
    roots,
    now: NOW,
  });

  assert.equal(finalized.receipt.kind, SIGNING_RECEIPT_KIND);
  assert.equal(finalized.receipt.expectedState, "CURRENT_188");
  assert.match(finalized.authorityEnvelope, /^[A-Za-z0-9_-]+$/u);
  assert.match(
    finalized.receipt.databaseMarker,
    /^LEETPLUS_STAFF_TASK_SNAPSHOT_AUTHORITY_V2:[0-9a-f]{64}$/u,
  );
  const envelope = parseAuthorityEnvelope(finalized.authorityEnvelope);
  assert.equal(envelope.signingKeyId, KEY_ID);
  assert.equal(envelope.expectedState, "CURRENT_188");
});

test("three schema states require three nonce-bound envelopes and markers", () => {
  const { privateKey, roots } = keyMaterial();
  const results = [
    ["BASELINE_156", "c"],
    ["EXPAND_162", "d"],
    ["CURRENT_188", "e"],
  ].map(([state, nonceByte]) => {
    const request = acquisitionRequest(state);
    const prepared = prepareAuthoritySigningPackage({
      acquisitionRequest: request,
      roots,
      now: NOW,
      creationNonce: nonceByte.repeat(64),
    });
    return finalizeAuthoritySigningPackage({
      acquisitionRequest: request,
      signingPackage: prepared.signingPackage,
      signature: sign(null, prepared.signingPayload, privateKey),
      roots,
      now: NOW,
    });
  });
  assert.equal(
    new Set(results.map((result) => result.authorityEnvelope)).size,
    3,
  );
  assert.equal(
    new Set(results.map((result) => result.receipt.databaseMarker)).size,
    3,
  );
});

test("tampered package, signature, root, and release binding reject", () => {
  const { privateKey, root, roots } = keyMaterial();
  const request = acquisitionRequest();
  const prepared = prepareAuthoritySigningPackage({
    acquisitionRequest: request,
    roots,
    now: NOW,
    creationNonce: "c".repeat(64),
  });
  const signature = sign(null, prepared.signingPayload, privateKey);
  assert.throws(
    () =>
      finalizeAuthoritySigningPackage({
        acquisitionRequest: request,
        signingPackage: {
          ...prepared.signingPackage,
          unsignedEnvelope: {
            ...prepared.signingPackage.unsignedEnvelope,
            expectedState: "EXPAND_162",
          },
        },
        signature,
        roots,
        now: NOW,
      }),
    { code: "AUTHORITY_SIGNING_PACKAGE_ACQUISITION_MISMATCH" },
  );
  const badSignature = Buffer.from(signature);
  badSignature[0] ^= 0xff;
  assert.throws(
    () =>
      finalizeAuthoritySigningPackage({
        acquisitionRequest: request,
        signingPackage: prepared.signingPackage,
        signature: badSignature,
        roots,
        now: NOW,
      }),
    { code: "PRODUCTION_LIKE_AUTHORITY_SIGNATURE_INVALID" },
  );
  const retiredRoot = Object.freeze({
    ...root,
    status: AUTHORITY_ROOT_STATUS.RETIRED,
    retiredAt: "2026-07-29T05:59:00.000Z",
  });
  assert.throws(
    () =>
      finalizeAuthoritySigningPackage({
        acquisitionRequest: request,
        signingPackage: prepared.signingPackage,
        signature,
        roots: Object.freeze({ [KEY_ID]: retiredRoot }),
        now: NOW,
      }),
    { code: "PRODUCTION_LIKE_AUTHORITY_NOT_ENROLLED" },
  );
  assert.throws(
    () =>
      prepareAuthoritySigningPackage({
        acquisitionRequest: acquisitionRequest("BASELINE_156", {
          releaseSha: "invalid-release",
        }),
        roots,
        now: NOW,
      }),
    { code: "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID" },
  );
});

test("a valid signature for a different acquisition request rejects", () => {
  const { privateKey, roots } = keyMaterial();
  const originalRequest = acquisitionRequest();
  const differentRequestBase = acquisitionRequest();
  const differentRequest = {
    ...differentRequestBase,
    references: {
      ...differentRequestBase.references,
      changeRecordReference: "change:open-beta-rehearsal-002",
    },
  };
  const prepared = prepareAuthoritySigningPackage({
    acquisitionRequest: differentRequest,
    roots,
    now: NOW,
    creationNonce: "e".repeat(64),
  });
  assert.throws(
    () =>
      finalizeAuthoritySigningPackage({
        acquisitionRequest: originalRequest,
        signingPackage: prepared.signingPackage,
        signature: sign(null, prepared.signingPayload, privateKey),
        roots,
        now: NOW,
      }),
    { code: "AUTHORITY_SIGNING_PACKAGE_ACQUISITION_MISMATCH" },
  );
});

test("production roots remain empty until reviewed enrollment", () => {
  assert.throws(
    () =>
      prepareAuthoritySigningPackage({
        acquisitionRequest: acquisitionRequest(),
        roots: Object.freeze({}),
        now: NOW,
      }),
    { code: "PRODUCTION_LIKE_AUTHORITY_NOT_ENROLLED" },
  );
});

test("exclusive evidence set leaves no partial output when one path exists", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "leetplus-authority-output-"),
  );
  const firstPath = path.join(directory, "first.json");
  const existingPath = path.join(directory, "existing.json");
  try {
    writeFileSync(existingPath, "protected-existing-evidence", {
      flag: "wx",
      mode: 0o600,
    });
    assert.throws(
      () =>
        writeExclusiveSet([
          { filePath: firstPath, content: "first" },
          { filePath: existingPath, content: "second" },
        ]),
      { code: "AUTHORITY_EVIDENCE_OUTPUT_FAILED" },
    );
    assert.equal(existsSync(firstPath), false);
    assert.equal(
      readFileSync(existingPath, "utf8"),
      "protected-existing-evidence",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("exclusive evidence set removes a readiness file when its fsync fails", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "leetplus-authority-fsync-"),
  );
  const companionPath = path.join(directory, "companion.json");
  const readinessPath = path.join(directory, "readiness.bin");
  let syncCalls = 0;
  try {
    assert.throws(
      () =>
        writeExclusiveSet(
          [
            { filePath: companionPath, content: "companion" },
            { filePath: readinessPath, content: "readiness" },
          ],
          {
            open: openSync,
            write: writeFileSync,
            sync(descriptor) {
              syncCalls += 1;
              if (syncCalls === 2) {
                throw new Error("simulated readiness fsync failure");
              }
              fsyncSync(descriptor);
            },
            close: closeSync,
            remove: rmSync,
          },
        ),
      { code: "AUTHORITY_EVIDENCE_OUTPUT_FAILED" },
    );
    assert.equal(syncCalls, 2);
    assert.equal(existsSync(companionPath), false);
    assert.equal(existsSync(readinessPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("evidence pairs require one directory and ambiguous stream paths reject", () => {
  const firstDirectory = mkdtempSync(
    path.join(tmpdir(), "leetplus-authority-first-"),
  );
  const secondDirectory = mkdtempSync(
    path.join(tmpdir(), "leetplus-authority-second-"),
  );
  const ambiguousPath = path.join(firstDirectory, "request.json:stream");
  try {
    assert.throws(
      () =>
        writeExclusiveSet([
          {
            filePath: path.join(firstDirectory, "first.json"),
            content: "first",
          },
          {
            filePath: path.join(secondDirectory, "second.json"),
            content: "second",
          },
        ]),
      { code: "AUTHORITY_EVIDENCE_OUTPUT_INVALID" },
    );
    writeFileSync(ambiguousPath, "not-consumed", {
      flag: "wx",
      mode: 0o600,
    });
    const rejected = spawnSync(
      process.execPath,
      [
        OFFLINE_SCRIPT_PATH,
        "prepare",
        "--request-file",
        ambiguousPath,
        "--package-file",
        path.join(firstDirectory, "package.json"),
        "--payload-file",
        path.join(firstDirectory, "payload.bin"),
        "--confirm",
        "prepare-reviewed-production-like-authority-payload",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.equal(rejected.status, 3);
    assert.deepEqual(JSON.parse(rejected.stderr), {
      status: "REJECTED",
      code: "AUTHORITY_EVIDENCE_PATH_INVALID",
    });
    assert.equal(rejected.stdout, "");
  } finally {
    rmSync(firstDirectory, { recursive: true, force: true });
    rmSync(secondDirectory, { recursive: true, force: true });
  }
});

test("CLI rejects release evidence mismatch before creating output", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "leetplus-authority-release-"),
  );
  const requestPath = path.join(directory, "request.json");
  const packagePath = path.join(directory, "package.json");
  const payloadPath = path.join(directory, "payload.bin");
  const current = new Date();
  try {
    writeFileSync(
      requestPath,
      canonicalStringify(
        acquisitionRequest("BASELINE_156", {
          releaseSha: "0".repeat(40),
          timeline: {
            acquiredAt: new Date(
              current.valueOf() - 2 * 60 * 1_000,
            ).toISOString(),
            restoredAt: new Date(current.valueOf() - 60 * 1_000).toISOString(),
            expiresAt: new Date(
              current.valueOf() + 60 * 60 * 1_000,
            ).toISOString(),
          },
        }),
      ),
      { flag: "wx", mode: 0o600 },
    );
    const rejected = spawnSync(
      process.execPath,
      [
        OFFLINE_SCRIPT_PATH,
        "prepare",
        "--request-file",
        requestPath,
        "--package-file",
        packagePath,
        "--payload-file",
        payloadPath,
        "--confirm",
        "prepare-reviewed-production-like-authority-payload",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.equal(rejected.status, 3);
    assert.deepEqual(JSON.parse(rejected.stderr), {
      status: "REJECTED",
      code: "AUTHORITY_RELEASE_EVIDENCE_MISMATCH",
    });
    assert.equal(rejected.stdout, "");
    assert.equal(existsSync(packagePath), false);
    assert.equal(existsSync(payloadPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("offline ceremony source cannot read or use private signing material", () => {
  const source = readFileSync(OFFLINE_SCRIPT_PATH, "utf8");
  assert.doesNotMatch(
    source,
    /createPrivateKey|generateKeyPair|\bsign\s*\(|privateKey|passphrase|process\.env/iu,
  );
  assert.doesNotMatch(
    source,
    /@prisma|from\s+["']node:(?:http|https|net|tls)|\bfetch\s*\(/u,
  );
  assert.match(source, /CEREMONY_RELEASE_SOURCE_PATHS/u);
  assert.match(
    source,
    /Ceremony runtime differs from the exact release artifact/u,
  );
  assert.match(source, /fsyncSync/u);

  const expectedRuntimeSources = [
    "packages/database/scripts/staff-task-integrity-canonical-json.mjs",
    "packages/database/scripts/staff-task-integrity-migration-state.mjs",
    "packages/database/scripts/staff-task-integrity-snapshot-acquisition-request.mjs",
    "packages/database/scripts/staff-task-integrity-snapshot-authority-offline-sign.cli.mjs",
    "packages/database/scripts/staff-task-integrity-snapshot-authority-root-registry.mjs",
    "packages/database/scripts/staff-task-integrity-snapshot-authority-roots.json",
    "packages/database/scripts/staff-task-integrity-snapshot-authority-roots.mjs",
    "packages/database/scripts/staff-task-integrity-snapshot-authority.mjs",
  ].sort();
  assert.deepEqual(
    [...CEREMONY_RELEASE_SOURCE_PATHS].sort(),
    expectedRuntimeSources,
  );
  const repositoryRoot = path.resolve(
    path.dirname(OFFLINE_SCRIPT_PATH),
    "../../..",
  );
  const discoveredModules = new Set();
  const pendingModules = [
    "packages/database/scripts/staff-task-integrity-snapshot-authority-offline-sign.cli.mjs",
  ];
  while (pendingModules.length > 0) {
    const modulePath = pendingModules.pop();
    if (discoveredModules.has(modulePath)) {
      continue;
    }
    discoveredModules.add(modulePath);
    const moduleSource = readFileSync(
      path.join(repositoryRoot, modulePath),
      "utf8",
    );
    assert.doesNotMatch(
      moduleSource,
      /@prisma|staff-task-integrity-(?:inventory|reconciliation-plan)|process\.env|from\s+["']node:(?:http|https|net|tls)/u,
    );
    for (const match of moduleSource.matchAll(
      /(?:from\s+|import\s*)["'](\.\/[^"']+\.mjs)["']/gu,
    )) {
      const dependencyPath = path
        .relative(
          repositoryRoot,
          path.resolve(
            path.dirname(path.join(repositoryRoot, modulePath)),
            match[1],
          ),
        )
        .replaceAll("\\", "/");
      assert.ok(
        CEREMONY_RELEASE_SOURCE_PATHS.includes(dependencyPath),
        `unbounded ceremony dependency: ${dependencyPath}`,
      );
      pendingModules.push(dependencyPath);
    }
  }
  assert.deepEqual(
    [...discoveredModules].sort(),
    expectedRuntimeSources.filter((runtimePath) =>
      runtimePath.endsWith(".mjs"),
    ),
  );

  const rejected = spawnSync(
    process.execPath,
    [OFFLINE_SCRIPT_PATH, "invalid-mode"],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(rejected.status, 3);
  assert.deepEqual(JSON.parse(rejected.stderr), {
    status: "REJECTED",
    code: "AUTHORITY_OFFLINE_SIGNING_ARGUMENT_INVALID",
  });
  assert.equal(rejected.stdout, "");
});
