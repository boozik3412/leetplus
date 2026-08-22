import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as crossModuleImporter from "./identity-mail-tenant-enrollment-evidence-importer-v2.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const TEMP_DIRECTORIES = [];

after(async () => {
  await Promise.all(
    TEMP_DIRECTORIES.map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function loadPinnedScenarioFactory() {
  const sourcePath = join(
    SCRIPT_DIRECTORY,
    "identity-mail-tenant-enrollment-manifest-bound-v2.test.mjs",
  );
  const source = await readFile(sourcePath, "utf8");
  const firstTest = source.indexOf(
    'test("composes two exact PINNED brands and exposes frozen importer evidence"',
  );
  assert(firstTest > 0, "manifest-bound fixture helper boundary moved");
  let helper = source.slice(0, firstTest);
  helper = helper.replace(
    "const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));",
    `const SCRIPT_DIRECTORY = ${JSON.stringify(SCRIPT_DIRECTORY)};`,
  );
  helper = helper.replace(
    '    "identity-mail-tenant-enrollment-manifest-bound-v2.mjs",\n    "staff-task-integrity-canonical-json.mjs",',
    '    "identity-mail-tenant-enrollment-manifest-bound-v2.mjs",\n    "identity-mail-tenant-enrollment-evidence-importer-v2.mjs",\n    "staff-task-integrity-canonical-json.mjs",',
  );
  helper = helper.replace(
    "  return {\n    authority: await import(pathToFileURL(join(directory, files[0])).href),\n    manifest: await import(pathToFileURL(join(directory, files[1])).href),\n    composition: await import(pathToFileURL(join(directory, files[3])).href),\n  };",
    "  return {\n    directory,\n    authority: await import(pathToFileURL(join(directory, files[0])).href),\n    manifest: await import(pathToFileURL(join(directory, files[1])).href),\n    composition: await import(pathToFileURL(join(directory, files[3])).href),\n    importer: await import(pathToFileURL(join(directory, files[4])).href),\n  };",
  );
  assert.match(
    helper,
    /identity-mail-tenant-enrollment-evidence-importer-v2\.mjs/u,
  );
  assert.match(helper, /\n    importer: await import/u);
  helper += "\nexport { pinnedScenario };\n";

  const directory = await mkdtemp(
    join(tmpdir(), "leetplus-evidence-importer-v2-helper-"),
  );
  TEMP_DIRECTORIES.push(directory);
  for (const dependency of [
    "identity-mail-tenant-enrollment-authority-v2.mjs",
    "identity-mail-duty-role-manifest-v2.mjs",
    "identity-mail-duty-role-grants-current185.mjs",
    "identity-mail-tenant-enrollment-manifest-bound-v2.mjs",
    "staff-task-integrity-canonical-json.mjs",
  ]) {
    await writeFile(
      join(directory, dependency),
      await readFile(join(SCRIPT_DIRECTORY, dependency), "utf8"),
      { encoding: "utf8", flag: "wx" },
    );
  }
  const helperPath = join(directory, "pinned-scenario-helper.mjs");
  await writeFile(helperPath, helper, { encoding: "utf8", flag: "wx" });
  return import(pathToFileURL(helperPath).href);
}

const { pinnedScenario } = await loadPinnedScenarioFactory();

async function composedScenario() {
  const scenario = await pinnedScenario();
  const { authority, composition, manifest } = scenario.modules;
  const command =
    authority.verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(
      scenario.command,
    );
  const dutyManifest =
    manifest.verifyPinnedIdentityMailDutyRoleManifestV2Envelope(
      scenario.manifest,
    );
  const composed =
    composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
      command,
      dutyManifest,
      scenario.grants,
    );
  return { ...scenario, composed, dutyManifest, verifiedCommand: command };
}

function expectCode(error, code) {
  return (
    error?.code === code &&
    error?.reasonCode === code &&
    error?.safeContractError === true
  );
}

function gatewayReceipt(request, decision = "IMPORTED", overrides = {}) {
  return {
    authorization: false,
    authorizationEnvelopeDigest: request.authorizationEnvelopeDigest,
    bindingDigest: request.bindingDigest,
    bundleDigest: request.bundleDigest,
    canMutate: false,
    canPersistEvidence: true,
    canSend: false,
    candidateStatus: "NOT_DEPLOYABLE",
    commandId: request.commandId,
    decision,
    exactGrantsDigest: request.exactGrantsDigest,
    importReceiptDigest: "9".repeat(64),
    importedAtEpochMs: Date.UTC(2026, 0, 1),
    importedTransactionId: "424242",
    manifestId: request.manifestId,
    manifestPayloadDigest: request.manifestPayloadDigest,
    operation: request.operation,
    operationId: request.operationId,
    requestId: request.requestId,
    schemaVersion: 1,
    tenantId: request.tenantId,
    ...overrides,
  };
}

test("extracts one deterministic PII-free bundle from an exact two-signer PINNED composition", async () => {
  const scenario = await composedScenario();
  const { composition, importer } = scenario.modules;
  const first =
    importer.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
      scenario.composed,
    );
  const independentlyVerifiedCommand =
    scenario.modules.authority.verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(
      scenario.command,
    );
  const independentlyVerifiedManifest =
    scenario.modules.manifest.verifyPinnedIdentityMailDutyRoleManifestV2Envelope(
      scenario.manifest,
    );
  const independentComposition =
    scenario.modules.composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
      independentlyVerifiedCommand,
      independentlyVerifiedManifest,
      scenario.grants,
    );
  const second =
    importer.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
      independentComposition,
    );
  const firstArguments =
    importer.identityMailTenantEnrollmentEvidenceImportBundleV2DatabaseArguments(
      first,
    );
  const secondArguments =
    importer.identityMailTenantEnrollmentEvidenceImportBundleV2DatabaseArguments(
      second,
    );

  assert.equal(
    importer.isIdentityMailTenantEnrollmentEvidenceImportBundleV2(first),
    true,
  );
  assert(Object.isFrozen(first));
  assert(Object.isFrozen(firstArguments));
  assert.equal(firstArguments.length, 2);
  assert.equal(typeof firstArguments[0], "string");
  assert.equal(typeof firstArguments[1], "string");
  assert.equal(firstArguments[0], secondArguments[0]);
  assert.equal(firstArguments[1], secondArguments[1]);
  assert.equal(first.bundleDigest, second.bundleDigest);
  assert.equal(first.bundleDigest, firstArguments[1]);
  assert.equal(first.bundleBytes, Buffer.byteLength(firstArguments[0], "utf8"));
  assert(first.bundleBytes > 0);
  assert(
    first.bundleBytes <=
      importer.IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_MAX_BUNDLE_BYTES,
  );
  assert.equal(
    firstArguments[1],
    sha256(
      `${importer.IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_BUNDLE_DIGEST_DOMAIN}\n${firstArguments[0]}\n`,
    ),
  );

  const bundle = JSON.parse(firstArguments[0]);
  assert.deepEqual(Object.keys(bundle), [
    "authorization",
    "binding",
    "canMutate",
    "canSend",
    "commandDatabaseArguments",
    "commandEvidence",
    "contract",
    "exactGrantsProjection",
    "manifestEvidence",
    "profile",
    "schemaVersion",
  ]);
  const compositionEvidence =
    composition.identityMailTenantEnrollmentManifestBoundV2Evidence(
      scenario.composed,
    );
  assert.deepEqual(bundle.binding, JSON.parse(JSON.stringify(scenario.composed)));
  assert.deepEqual(
    bundle.commandDatabaseArguments,
    JSON.parse(JSON.stringify(compositionEvidence.commandDatabaseArguments)),
  );
  assert.equal(Object.keys(bundle.commandDatabaseArguments).length, 69);
  assert.deepEqual(
    bundle.commandEvidence,
    JSON.parse(JSON.stringify(compositionEvidence.command)),
  );
  assert.deepEqual(
    bundle.manifestEvidence,
    JSON.parse(JSON.stringify(compositionEvidence.dutyManifest)),
  );
  assert.deepEqual(
    bundle.exactGrantsProjection,
    JSON.parse(JSON.stringify(compositionEvidence.exactGrants.projection)),
  );
  assert.equal(
    (firstArguments[0].match(/"exactGrantsProjection":/gu) ?? []).length,
    1,
  );
  assert.equal(bundle.authorization, false);
  assert.equal(bundle.canMutate, false);
  assert.equal(bundle.canSend, false);
  assert.doesNotMatch(
    firstArguments[0],
    /"(?:email|phone|password|privateKey|secret|accessToken|refreshToken|providerMessageId)"\s*:/iu,
  );
});

test("enforces the 262144-byte ceiling before minting a bundle", async () => {
  const scenario = await composedScenario();
  const importerSource = await readFile(
    join(
      SCRIPT_DIRECTORY,
      "identity-mail-tenant-enrollment-evidence-importer-v2.mjs",
    ),
    "utf8",
  );
  assert.match(importerSource, /\n  262_144;/u);
  const tinySource = importerSource.replace("\n  262_144;", "\n  1;");
  const tinyPath = join(
    scenario.modules.directory,
    "identity-mail-tenant-enrollment-evidence-importer-v2-tiny.mjs",
  );
  await writeFile(tinyPath, tinySource, { encoding: "utf8", flag: "wx" });
  const tinyImporter = await import(pathToFileURL(tinyPath).href);
  assert.throws(
    () =>
      tinyImporter.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
        scenario.composed,
      ),
    (error) =>
      expectCode(
        error,
        "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_BUNDLE_SIZE_INVALID",
      ),
  );
});

test("exposes one factory-minted owner method and the exact frozen two-TEXT interface", async () => {
  const scenario = await composedScenario();
  const { importer } = scenario.modules;
  const bundle =
    importer.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
      scenario.composed,
    );
  const databaseArguments =
    importer.identityMailTenantEnrollmentEvidenceImportBundleV2DatabaseArguments(
      bundle,
    );
  let observedRequest;
  let gatewayReceiptValue;
  let gatewayCalls = 0;
  const ownerRpc =
    importer.createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2((request) => {
      gatewayCalls += 1;
      observedRequest = request;
      gatewayReceiptValue = Object.fromEntries(
        Object.entries(gatewayReceipt(request)).reverse(),
      );
      return gatewayReceiptValue;
    });

  assert(Object.isFrozen(ownerRpc));
  assert.deepEqual(Reflect.ownKeys(ownerRpc), [
    importer.IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_METHOD,
  ]);
  const capabilityMethod =
    ownerRpc[
      importer.IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_METHOD
    ];
  let forgedProxyObserved = false;
  const forgedRequestProxy = new Proxy(
    {},
    {
      get() {
        forgedProxyObserved = true;
        throw new Error("forged request get");
      },
      getPrototypeOf() {
        forgedProxyObserved = true;
        throw new Error("forged request prototype");
      },
      ownKeys() {
        forgedProxyObserved = true;
        throw new Error("forged request keys");
      },
    },
  );
  for (const forgedRequest of [undefined, {}, forgedRequestProxy]) {
    assert.throws(
      () => Reflect.apply(capabilityMethod, ownerRpc, [forgedRequest]),
      (error) =>
        expectCode(
          error,
          "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_REQUEST_NOT_MINTED",
        ),
    );
  }
  assert.equal(forgedProxyObserved, false);
  assert.equal(gatewayCalls, 0);
  const receipt = await importer.importIdentityMailTenantEnrollmentEvidenceV2(
    bundle,
    ownerRpc,
  );
  assert(Object.isFrozen(observedRequest));
  assert(Object.isFrozen(observedRequest.databaseArguments));
  assert.equal(observedRequest.databaseArguments, databaseArguments);
  assert.equal(observedRequest.databaseArguments.length, 2);
  assert.equal(typeof observedRequest.databaseArguments[0], "string");
  assert.equal(typeof observedRequest.databaseArguments[1], "string");
  assert.deepEqual(Object.keys(observedRequest).sort(), [
    "authorizationEnvelopeDigest",
    "bindingDigest",
    "bundleDigest",
    "commandId",
    "databaseArguments",
    "exactGrantsDigest",
    "manifestId",
    "manifestPayloadDigest",
    "operation",
    "operationId",
    "requestId",
    "tenantId",
  ]);
  assert.equal(receipt.decision, "IMPORTED");
  assert.equal(gatewayCalls, 1);
  assert.notEqual(receipt, gatewayReceiptValue);
  assert(Object.isFrozen(receipt));
  assert.equal(
    importer.isVerifiedIdentityMailTenantEnrollmentEvidenceImportReceiptV2(
      receipt,
    ),
    true,
  );
  assert.equal(
    importer.isVerifiedIdentityMailTenantEnrollmentEvidenceImportReceiptV2(
      gatewayReceiptValue,
    ),
    false,
  );

  const directReplayReceipt = Reflect.apply(capabilityMethod, ownerRpc, [
    observedRequest,
  ]);
  assert.equal(directReplayReceipt.decision, "IMPORTED");
  assert.equal(gatewayCalls, 2);
  assert.equal(
    importer.isVerifiedIdentityMailTenantEnrollmentEvidenceImportReceiptV2({
      ...receipt,
    }),
    false,
  );

  const replayRpc =
    importer.createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2((request) =>
      gatewayReceipt(request, "IMPORT_REPLAY"),
    );
  const replay = await importer.importIdentityMailTenantEnrollmentEvidenceV2(
    bundle,
    replayRpc,
  );
  assert.equal(replay.decision, "IMPORT_REPLAY");
  assert.equal(replay.importReceiptDigest, receipt.importReceiptDigest);
  assert.equal(replay.importedAtEpochMs, receipt.importedAtEpochMs);
  assert.equal(replay.importedTransactionId, receipt.importedTransactionId);
  assert.equal(replay.candidateStatus, "NOT_DEPLOYABLE");
  assert.equal(replay.canPersistEvidence, true);
  assert.equal(replay.authorization, false);
  assert.equal(replay.canMutate, false);
  assert.equal(replay.canSend, false);
});

test("rejects plain, synthetic, cloned, proxied and cross-module brands before gateway observation", async () => {
  const scenario = await composedScenario();
  const { authority, importer } = scenario.modules;
  const bundle =
    importer.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
      scenario.composed,
    );
  let gatewayCalls = 0;
  const ownerRpc =
    importer.createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2(() => {
      gatewayCalls += 1;
      throw new Error("must not be called");
    });
  const invalidValues = [{}, { ...bundle }, structuredClone(bundle)];
  for (const value of invalidValues) {
    await assert.rejects(
      importer.importIdentityMailTenantEnrollmentEvidenceV2(value, ownerRpc),
      (error) =>
        expectCode(
          error,
          "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_BUNDLE_NOT_MINTED",
        ),
    );
  }

  let proxyObserved = false;
  const hostileProxy = new Proxy(
    {},
    {
      get() {
        proxyObserved = true;
        throw new Error("hostile get");
      },
      getOwnPropertyDescriptor() {
        proxyObserved = true;
        throw new Error("hostile descriptor");
      },
      getPrototypeOf() {
        proxyObserved = true;
        throw new Error("hostile prototype");
      },
      ownKeys() {
        proxyObserved = true;
        throw new Error("hostile ownKeys");
      },
    },
  );
  await assert.rejects(
    importer.importIdentityMailTenantEnrollmentEvidenceV2(
      hostileProxy,
      ownerRpc,
    ),
    (error) =>
      expectCode(
        error,
        "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_BUNDLE_NOT_MINTED",
      ),
  );
  assert.equal(proxyObserved, false);

  const clonedCapability = { ...ownerRpc };
  let capabilityProxyObserved = false;
  const proxiedCapability = new Proxy(ownerRpc, {
    get() {
      capabilityProxyObserved = true;
      throw new Error("capability get");
    },
    getPrototypeOf() {
      capabilityProxyObserved = true;
      throw new Error("capability prototype");
    },
    ownKeys() {
      capabilityProxyObserved = true;
      throw new Error("capability ownKeys");
    },
  });
  for (const invalidCapability of [{}, clonedCapability, proxiedCapability]) {
    await assert.rejects(
      importer.importIdentityMailTenantEnrollmentEvidenceV2(
        bundle,
        invalidCapability,
      ),
      (error) =>
        expectCode(
          error,
          "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_NOT_MINTED",
        ),
    );
  }
  assert.equal(capabilityProxyObserved, false);

  let handlerProxyObserved = false;
  const proxiedHandler = new Proxy(
    () => {
      handlerProxyObserved = true;
    },
    {
      apply() {
        handlerProxyObserved = true;
      },
    },
  );
  assert.throws(
    () =>
      importer.createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2(
        proxiedHandler,
      ),
    (error) =>
      expectCode(
        error,
        "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_HANDLER_INVALID",
      ),
  );
  assert.equal(handlerProxyObserved, false);

  const synthetic =
    authority.verifySyntheticIdentityMailTenantEnrollmentCommandAuthorityV2(
      scenario.command,
      authority.PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS,
      {
        databaseName: scenario.composed.databaseName,
        environment: "ci",
        explicitConfirmation:
          authority.IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SYNTHETIC_CONFIRMATION,
        hostname: "127.0.0.1",
        nodeEnv: "test",
      },
      new Date().toISOString(),
    );
  await assert.rejects(
    importer.importIdentityMailTenantEnrollmentEvidenceV2(synthetic, ownerRpc),
    (error) =>
      expectCode(
        error,
        "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_BUNDLE_NOT_MINTED",
      ),
  );
  assert.throws(
    () =>
      importer.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
        synthetic,
      ),
    (error) =>
      expectCode(
        error,
        "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_COMPOSITION_NOT_PINNED",
      ),
  );

  let crossGatewayCalls = 0;
  const crossCapability =
    crossModuleImporter.createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2(
      () => {
        crossGatewayCalls += 1;
      },
    );
  await assert.rejects(
    importer.importIdentityMailTenantEnrollmentEvidenceV2(
      bundle,
      crossCapability,
    ),
    (error) =>
      expectCode(
        error,
        "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_OWNER_RPC_NOT_MINTED",
      ),
  );
  await assert.rejects(
    crossModuleImporter.importIdentityMailTenantEnrollmentEvidenceV2(
      bundle,
      crossCapability,
    ),
    (error) =>
      expectCode(
        error,
        "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_BUNDLE_NOT_MINTED",
      ),
  );
  assert.throws(
    () =>
      crossModuleImporter.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
        scenario.composed,
      ),
    (error) =>
      expectCode(
        error,
        "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_COMPOSITION_NOT_PINNED",
      ),
  );
  assert.equal(gatewayCalls, 0);
  assert.equal(crossGatewayCalls, 0);
});

test("rethrows an ordinary first error without retry", async () => {
  const scenario = await composedScenario();
  const { importer } = scenario.modules;
  const bundle =
    importer.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
      scenario.composed,
    );
  const sentinel = new Error("ordinary owner failure");
  let calls = 0;
  const ownerRpc =
    importer.createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2(() => {
      calls += 1;
      throw sentinel;
    });
  await assert.rejects(
    importer.importIdentityMailTenantEnrollmentEvidenceV2(bundle, ownerRpc),
    (error) => error === sentinel,
  );
  assert.equal(calls, 1);

  const crossModuleLostResponse =
    new crossModuleImporter.IdentityMailTenantEnrollmentEvidenceOwnerRpcV2LostResponseError();
  calls = 0;
  const crossLostRpc =
    importer.createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2(() => {
      calls += 1;
      throw crossModuleLostResponse;
    });
  await assert.rejects(
    importer.importIdentityMailTenantEnrollmentEvidenceV2(
      bundle,
      crossLostRpc,
    ),
    (error) => error === crossModuleLostResponse,
  );
  assert.equal(calls, 1);
});

test("retries only a module-branded lost response with the exact same request and two strings", async () => {
  const scenario = await composedScenario();
  const { importer } = scenario.modules;
  const bundle =
    importer.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
      scenario.composed,
    );
  const requests = [];
  const arrays = [];
  const strings = [];
  const ownerRpc =
    importer.createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2((request) => {
      requests.push(request);
      arrays.push(request.databaseArguments);
      strings.push(...request.databaseArguments);
      if (requests.length === 1) {
        throw new importer.IdentityMailTenantEnrollmentEvidenceOwnerRpcV2LostResponseError();
      }
      return gatewayReceipt(request, "IMPORT_REPLAY");
    });
  const receipt = await importer.importIdentityMailTenantEnrollmentEvidenceV2(
    bundle,
    ownerRpc,
  );
  assert.equal(receipt.decision, "IMPORT_REPLAY");
  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);
  assert.equal(arrays[0], arrays[1]);
  assert.equal(strings[0], strings[2]);
  assert.equal(strings[1], strings[3]);
});

test("maps lost-then-ordinary and lost-twice to typed AMBIGUOUS", async () => {
  const scenario = await composedScenario();
  const { importer } = scenario.modules;
  const bundle =
    importer.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
      scenario.composed,
    );

  for (const secondFailure of [
    new Error("ordinary after lost"),
    new importer.IdentityMailTenantEnrollmentEvidenceOwnerRpcV2LostResponseError(),
  ]) {
    let calls = 0;
    const ownerRpc =
      importer.createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2(() => {
        calls += 1;
        if (calls === 1) {
          throw new importer.IdentityMailTenantEnrollmentEvidenceOwnerRpcV2LostResponseError();
        }
        throw secondFailure;
      });
    await assert.rejects(
      importer.importIdentityMailTenantEnrollmentEvidenceV2(bundle, ownerRpc),
      (error) => {
        assert(
          error instanceof
            importer.IdentityMailTenantEnrollmentEvidenceImporterV2AmbiguousOutcomeError,
        );
        assert.equal(
          error.code,
          "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_AMBIGUOUS",
        );
        assert.equal(error.attempts, 2);
        assert.equal(error.operationIdentity.bundleDigest, bundle.bundleDigest);
        assert.equal(error.operationIdentity.commandId, bundle.commandId);
        assert(Object.isFrozen(error.operationIdentity));
        return true;
      },
    );
    assert.equal(calls, 2);
  }
});

test("rejects bad receipts exactly and treats a bad post-lost receipt as ambiguous", async () => {
  const scenario = await composedScenario();
  const { importer } = scenario.modules;
  const bundle =
    importer.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
      scenario.composed,
    );
  const invalidReceipts = [
    (request) => gatewayReceipt(request, "UNKNOWN"),
    (request) => gatewayReceipt(request, "IMPORTED", { schemaVersion: 2 }),
    (request) => gatewayReceipt(request, "IMPORTED", { operation: "OTHER" }),
    (request) => gatewayReceipt(request, "IMPORTED", { operationId: "0".repeat(64) }),
    (request) => gatewayReceipt(request, "IMPORTED", { tenantId: "00000000-0000-4000-8000-000000000000" }),
    (request) => gatewayReceipt(request, "IMPORTED", { commandId: "00000000-0000-4000-8000-000000000000" }),
    (request) => gatewayReceipt(request, "IMPORTED", { requestId: "00000000-0000-4000-8000-000000000000" }),
    (request) => gatewayReceipt(request, "IMPORTED", { authorizationEnvelopeDigest: "0".repeat(64) }),
    (request) => gatewayReceipt(request, "IMPORTED", { manifestId: "00000000-0000-4000-8000-000000000000" }),
    (request) => gatewayReceipt(request, "IMPORTED", { manifestPayloadDigest: "0".repeat(64) }),
    (request) => gatewayReceipt(request, "IMPORTED", { exactGrantsDigest: "0".repeat(64) }),
    (request) => gatewayReceipt(request, "IMPORTED", { bindingDigest: "0".repeat(64) }),
    (request) => gatewayReceipt(request, "IMPORTED", { bundleDigest: "0".repeat(64) }),
    (request) => gatewayReceipt(request, "IMPORTED", { candidateStatus: "DEPLOYABLE" }),
    (request) => gatewayReceipt(request, "IMPORTED", { canPersistEvidence: false }),
    (request) => gatewayReceipt(request, "IMPORTED", { authorization: true }),
    (request) => gatewayReceipt(request, "IMPORTED", { canMutate: true }),
    (request) => gatewayReceipt(request, "IMPORTED", { canSend: true }),
    (request) => gatewayReceipt(request, "IMPORTED", { importReceiptDigest: "A".repeat(64) }),
    (request) => gatewayReceipt(request, "IMPORTED", { importedAtEpochMs: Date.UTC(2025, 11, 31) }),
    (request) => gatewayReceipt(request, "IMPORTED", { importedTransactionId: "tx-42" }),
    (request) => ({ ...gatewayReceipt(request), unexpected: true }),
    (request) => {
      const receipt = gatewayReceipt(request);
      delete receipt.manifestPayloadDigest;
      return receipt;
    },
  ];
  for (const makeReceipt of invalidReceipts) {
    const ownerRpc =
      importer.createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2((request) =>
        makeReceipt(request),
      );
    await assert.rejects(
      importer.importIdentityMailTenantEnrollmentEvidenceV2(bundle, ownerRpc),
      (error) =>
        expectCode(
          error,
          "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_RECEIPT_INVALID",
        ),
    );
  }

  let receiptProxyObserved = false;
  const proxyRpc =
    importer.createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2(() =>
      new Proxy(
        {},
        {
          getPrototypeOf() {
            receiptProxyObserved = true;
            throw new Error("receipt prototype observed");
          },
          ownKeys() {
            receiptProxyObserved = true;
            throw new Error("receipt keys observed");
          },
        },
      ),
    );
  await assert.rejects(
    importer.importIdentityMailTenantEnrollmentEvidenceV2(bundle, proxyRpc),
    (error) =>
      expectCode(
        error,
        "IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_RECEIPT_INVALID",
      ),
  );
  assert.equal(receiptProxyObserved, false);

  let calls = 0;
  const lostThenBad =
    importer.createIdentityMailTenantEnrollmentEvidenceOwnerRpcV2((request) => {
      calls += 1;
      if (calls === 1) {
        throw new importer.IdentityMailTenantEnrollmentEvidenceOwnerRpcV2LostResponseError();
      }
      return gatewayReceipt(request, "UNKNOWN");
    });
  await assert.rejects(
    importer.importIdentityMailTenantEnrollmentEvidenceV2(bundle, lostThenBad),
    (error) =>
      error instanceof
        importer.IdentityMailTenantEnrollmentEvidenceImporterV2AmbiguousOutcomeError,
  );
  assert.equal(calls, 2);
});

test("has no SQL, credential, DI, CLI, root-key or runtime-grant surface", async () => {
  const source = await readFile(
    join(
      SCRIPT_DIRECTORY,
      "identity-mail-tenant-enrollment-evidence-importer-v2.mjs",
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /(?:DATABASE_URL|privateKey|password|credential|process\.env|process\.argv|node:child_process|node:fs|node:net|node:tls|@prisma|from\s+["']pg["'])/iu,
  );
  assert.doesNotMatch(
    source,
    /(?:\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCREATE\s+ROLE\b|\bALTER\s+ROLE\b|\bGRANT\s+)/u,
  );
  assert.deepEqual(
    [...source.matchAll(/^import[\s\S]*?from\s+"([^"]+)";/gmu)].map(
      (match) => match[1],
    ),
    [
      "node:crypto",
      "node:util",
      "./identity-mail-tenant-enrollment-manifest-bound-v2.mjs",
      "./staff-task-integrity-canonical-json.mjs",
    ],
  );
});
