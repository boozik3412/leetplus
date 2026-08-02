import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const FIXTURE_SOURCE = join(
  SCRIPT_DIRECTORY,
  "identity-mail-tenant-enrollment-manifest-bound-v2.test.mjs",
);
const FIRST_TEST =
  'test("composes two exact PINNED brands and exposes frozen importer evidence"';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DATABASE_PATTERN = /^lp_imtec_[0-9a-f]{32}_ci$/u;
const ROLE_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

function fail(message) {
  throw new Error(`CURRENT185 fixture rejected: ${message}`);
}

function requireExactObject(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail("input must be one ordinary JSON object");
  }
  const expected = [
    "actualContextDigest",
    "coordinatorRoleName",
    "coordinatorRoleOid",
    "databaseIdentityDigest",
    "databaseName",
    "databaseOid",
    "deploymentMarkerDigest",
    "deploymentMarkerId",
    "manifestId",
    "requestId",
    "tenantId",
    "commandId",
    "validForMs",
    "workerRoleName",
    "workerRoleOid",
  ].sort();
  const expectedWithReuse = [
    ...expected,
    "reuseCommandId",
    "reuseRequestId",
  ].sort();
  const actual = Object.keys(value).sort();
  if (
    ![expected, expectedWithReuse].some(
      (candidate) =>
        actual.length === candidate.length &&
        actual.every((key, index) => key === candidate[index]),
    )
  ) {
    fail("input keys are not exact");
  }
  for (const key of [
    "tenantId",
    "commandId",
    "requestId",
    "deploymentMarkerId",
    "manifestId",
  ]) {
    if (typeof value[key] !== "string" || !UUID_PATTERN.test(value[key])) {
      fail(`${key} is invalid`);
    }
  }
  if (actual.length === expectedWithReuse.length) {
    for (const key of ["reuseCommandId", "reuseRequestId"]) {
      if (typeof value[key] !== "string" || !UUID_PATTERN.test(value[key])) {
        fail(`${key} is invalid`);
      }
    }
    if (
      value.reuseCommandId === value.commandId ||
      value.reuseRequestId === value.requestId
    ) {
      fail("manifest-reuse command identities must be distinct");
    }
  }
  if (
    !Number.isSafeInteger(value.validForMs) ||
    value.validForMs < 3_000 ||
    value.validForMs > 30_000
  ) {
    fail("validForMs is invalid");
  }
  if (
    typeof value.databaseName !== "string" ||
    !DATABASE_PATTERN.test(value.databaseName)
  ) {
    fail("databaseName is not an exact disposable database");
  }
  for (const key of [
    "databaseIdentityDigest",
    "deploymentMarkerDigest",
    "actualContextDigest",
  ]) {
    if (typeof value[key] !== "string" || !DIGEST_PATTERN.test(value[key])) {
      fail(`${key} is invalid`);
    }
  }
  for (const key of ["coordinatorRoleName", "workerRoleName"]) {
    if (typeof value[key] !== "string" || !ROLE_PATTERN.test(value[key])) {
      fail(`${key} is invalid`);
    }
  }
  for (const key of [
    "databaseOid",
    "coordinatorRoleOid",
    "workerRoleOid",
  ]) {
    if (
      !Number.isSafeInteger(value[key]) ||
      value[key] < 1 ||
      value[key] > 4_294_967_295
    ) {
      fail(`${key} is invalid`);
    }
  }
  if (
    value.coordinatorRoleName === value.workerRoleName ||
    value.coordinatorRoleOid === value.workerRoleOid
  ) {
    fail("duty roles must be distinct");
  }
  return value;
}

function replaceExact(source, original, replacement, label) {
  const first = source.indexOf(original);
  if (first < 0 || source.indexOf(original, first + original.length) >= 0) {
    fail(`fixture source boundary moved: ${label}`);
  }
  return source.replace(original, replacement);
}

async function loadScenarioFactory(input) {
  const fixtureSource = await readFile(FIXTURE_SOURCE, "utf8");
  const firstTest = fixtureSource.indexOf(FIRST_TEST);
  if (firstTest < 1) fail("manifest-bound fixture helper boundary moved");
  let helper = fixtureSource.slice(0, firstTest);
  helper = replaceExact(
    helper,
    'import test, { after } from "node:test";\n',
    "",
    "node:test import",
  );
  const lifecycleStart = helper.indexOf("const ORIGINAL_NODE_ENV");
  const lifecycleEnd = helper.indexOf("const TENANT_ID");
  if (lifecycleStart < 0 || lifecycleEnd <= lifecycleStart) {
    fail("test lifecycle boundary moved");
  }
  helper = `${helper.slice(0, lifecycleStart)}const FIXTURE_DIRECTORIES = [];\n${helper.slice(lifecycleEnd)}`;
  helper = replaceExact(
    helper,
    "const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));",
    `const SCRIPT_DIRECTORY = ${JSON.stringify(SCRIPT_DIRECTORY)};`,
    "script directory",
  );
  for (const dependency of [
    "identity-mail-tenant-enrollment-authority-v2.mjs",
    "identity-mail-duty-role-manifest-v2.mjs",
    "identity-mail-duty-role-grants-current185.mjs",
    "identity-mail-tenant-enrollment-manifest-bound-v2.mjs",
    "staff-task-integrity-canonical-json.mjs",
  ]) {
    helper = helper.replaceAll(
      `from "./${dependency}"`,
      `from ${JSON.stringify(pathToFileURL(join(SCRIPT_DIRECTORY, dependency)).href)}`,
    );
  }
  const replacements = [
    ["TENANT_ID", "11111111-1111-4111-8111-111111111111", input.tenantId],
    ["COMMAND_ID", "22222222-2222-4222-8222-222222222222", input.commandId],
    ["REQUEST_ID", "33333333-3333-4333-8333-333333333333", input.requestId],
    ["MARKER_ID", "44444444-4444-4444-8444-444444444444", input.deploymentMarkerId],
    ["MANIFEST_ID", "55555555-5555-4555-8555-555555555555", input.manifestId],
    ["DATABASE_NAME", "leetplus_manifest_bound_ci", input.databaseName],
  ];
  for (const [name, before, after] of replacements) {
    helper = replaceExact(
      helper,
      `const ${name} = ${JSON.stringify(before)};`,
      `const ${name} = ${JSON.stringify(after)};`,
      name,
    );
  }
  helper = replaceExact(
    helper,
    "const DATABASE_OID = 16_384;",
    `const DATABASE_OID = ${input.databaseOid};`,
    "database oid",
  );
  helper = replaceExact(
    helper,
    "validUntil: new Date(now + 8 * 60_000).toISOString(),",
    `validUntil: new Date(now + ${input.validForMs}).toISOString(),`,
    "fixture validity",
  );
  helper = replaceExact(
    helper,
    "  dutyOverrides = {},\n  envelopeOverrides = {},\n) {",
    "  dutyOverrides = {},\n  envelopeOverrides = {},\n  proposalOverrides = {},\n) {",
    "command document parameters",
  );
  helper = replaceExact(
    helper,
    "    workerRoleName: duty.workerRoleName,\n    workerRoleOid: duty.workerRoleOid,\n  };\n  const proposalCanonicalJson",
    "    workerRoleName: duty.workerRoleName,\n    workerRoleOid: duty.workerRoleOid,\n    ...proposalOverrides,\n  };\n  const proposalCanonicalJson",
    "command proposal overrides",
  );
  for (const [name, digit, value] of [
    ["DATABASE_IDENTITY_DIGEST", "1", input.databaseIdentityDigest],
    ["DEPLOYMENT_MARKER_DIGEST", "2", input.deploymentMarkerDigest],
    ["ACTUAL_CONTEXT_DIGEST", "3", input.actualContextDigest],
  ]) {
    helper = replaceExact(
      helper,
      `const ${name} = ${JSON.stringify(digit)}.repeat(64);`,
      `const ${name} = ${JSON.stringify(value)};`,
      name,
    );
  }
  helper = replaceExact(
    helper,
    '  name: "identity_mail_enrollment_coordinator",\n  oid: 16_387,',
    `  name: ${JSON.stringify(input.coordinatorRoleName)},\n  oid: ${input.coordinatorRoleOid},`,
    "coordinator role",
  );
  helper = replaceExact(
    helper,
    'const WORKER = Object.freeze({ name: "identity_mail_worker_v2", oid: 16_388 });',
    `const WORKER = Object.freeze({ name: ${JSON.stringify(input.workerRoleName)}, oid: ${input.workerRoleOid} });`,
    "worker role",
  );
  helper = replaceExact(
    helper,
    '    "identity-mail-tenant-enrollment-manifest-bound-v2.mjs",\n    "staff-task-integrity-canonical-json.mjs",',
    '    "identity-mail-tenant-enrollment-manifest-bound-v2.mjs",\n    "identity-mail-tenant-enrollment-evidence-importer-v2.mjs",\n    "staff-task-integrity-canonical-json.mjs",',
    "importer dependency",
  );
  helper = replaceExact(
    helper,
    "    composition: await import(pathToFileURL(join(directory, files[3])).href),\n  };",
    "    composition: await import(pathToFileURL(join(directory, files[3])).href),\n    importer: await import(pathToFileURL(join(directory, files[4])).href),\n  };",
    "importer module",
  );
  helper +=
    "\nexport { FIXTURE_DIRECTORIES, commandDocument, pinnedScenario };\n";

  const helperPath = join(
    tmpdir(),
    `leetplus-current185-evidence-fixture-${process.pid}-${Date.now()}.mjs`,
  );
  await writeFile(helperPath, helper, { encoding: "utf8", flag: "wx" });
  return { helperPath, module: await import(pathToFileURL(helperPath).href) };
}

async function buildFixture(inputValue) {
  const input = requireExactObject(inputValue);
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  let loaded;
  try {
    loaded = await loadScenarioFactory(input);
    const scenario = await loaded.module.pinnedScenario();
    const { authority, composition, importer, manifest } = scenario.modules;
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
    const bundle =
      importer.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
        composed,
      );
    const databaseArguments =
      importer.identityMailTenantEnrollmentEvidenceImportBundleV2DatabaseArguments(
        bundle,
      );
    assert.equal(databaseArguments.length, 2);
    assert.equal(typeof databaseArguments[0], "string");
    assert.equal(databaseArguments[1], bundle.bundleDigest);
    assert.doesNotMatch(
      databaseArguments[0],
      /(?:@|email|phone|password|privateKey|secret|accessToken|refreshToken|providerMessageId)/iu,
    );
    const result = {
      bundle: { ...bundle },
      bundleCanonicalJson: databaseArguments[0],
      bundleDigest: databaseArguments[1],
      expiresAt: scenario.command.authorizationEnvelope.expiresAt,
    };
    if (input.reuseCommandId === undefined) return result;

    const reuseDocument = loaded.module.commandDocument(
      scenario.commandMaterial,
      scenario.times,
      scenario.manifest,
      scenario.grantsDigest,
      {},
      {
        commandId: input.reuseCommandId,
        requestId: input.reuseRequestId,
      },
      { requestId: input.reuseRequestId },
    );
    const reuseCommand =
      authority.verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(
        reuseDocument,
      );
    const reuseComposed =
      composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
        reuseCommand,
        dutyManifest,
        scenario.grants,
      );
    const reuseBundle =
      importer.createIdentityMailTenantEnrollmentEvidenceImportBundleV2(
        reuseComposed,
      );
    const reuseDatabaseArguments =
      importer.identityMailTenantEnrollmentEvidenceImportBundleV2DatabaseArguments(
        reuseBundle,
      );
    assert.equal(reuseDatabaseArguments.length, 2);
    assert.equal(reuseDatabaseArguments[1], reuseBundle.bundleDigest);
    assert.doesNotMatch(
      reuseDatabaseArguments[0],
      /(?:@|email|phone|password|privateKey|secret|accessToken|refreshToken|providerMessageId)/iu,
    );
    return {
      ...result,
      reuse: {
        bundle: { ...reuseBundle },
        bundleCanonicalJson: reuseDatabaseArguments[0],
        bundleDigest: reuseDatabaseArguments[1],
        expiresAt: reuseDocument.authorizationEnvelope.expiresAt,
      },
    };
  } finally {
    if (loaded?.module?.FIXTURE_DIRECTORIES) {
      await Promise.all(
        loaded.module.FIXTURE_DIRECTORIES.map((directory) =>
          rm(directory, { force: true, recursive: true }),
        ),
      );
    }
    if (loaded?.helperPath) {
      await rm(loaded.helperPath, { force: true });
    }
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const source = Buffer.concat(chunks).toString("utf8");
  if (Buffer.byteLength(source, "utf8") > 16_384) {
    fail("input is too large");
  }
  return JSON.parse(source);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await buildFixture(await readStandardInput());
  process.stdout.write(`${JSON.stringify(fixture)}\n`);
}

export { buildFixture as buildIdentityMailEnrollmentEvidenceCurrent185Fixture };
