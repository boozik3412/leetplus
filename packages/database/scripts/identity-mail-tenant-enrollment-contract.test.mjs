import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT,
  IDENTITY_MAIL_TENANT_ENROLLMENT_MAX_LIFETIME_MS,
  IdentityMailTenantEnrollmentContractError,
  parseIdentityMailTenantEnrollmentProposal,
} from "./identity-mail-tenant-enrollment-contract.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = join(
  SCRIPT_DIR,
  "identity-mail-tenant-enrollment-contract.mjs",
);
const NOW = new Date("2026-08-01T09:00:00.000Z");

function proposal(overrides = {}) {
  const base = {
    action: "ENABLE",
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT,
    deploymentMarkerDigest: "1".repeat(64),
    expectedDatabaseName: "leetplus_beta",
    expectedDatabaseOid: 16_384,
    expectedRevision: 0,
    expectedState: "ABSENT",
    expiresAt: "2026-08-01T09:10:00.000Z",
    nextRevision: 1,
    policy: {
      acknowledgeSeconds: 120,
      baseRetrySeconds: 60,
      leaseSeconds: 120,
      maxAttempts: 5,
      maxRetrySeconds: 3_600,
    },
    providerAuthorityDigest: "2".repeat(64),
    releaseSha: "3".repeat(40),
    requestId: "11111111-1111-4111-8111-111111111111",
    requestedAt: "2026-08-01T08:59:00.000Z",
    runtimeConfigDigest: "4".repeat(64),
    tenantId: "22222222-2222-4222-8222-222222222222",
    workerRoleName: "identity_mail_worker_v1",
    workerRoleOid: 16_385,
  };
  return {
    ...base,
    ...overrides,
    policy: overrides.policy ?? base.policy,
  };
}

function expectCode(action, reasonCode) {
  assert.throws(
    action,
    (error) =>
      error instanceof IdentityMailTenantEnrollmentContractError &&
      error.reasonCode === reasonCode &&
      error.code === reasonCode &&
      error.exitCode === 3,
  );
}

function parse(value) {
  return parseIdentityMailTenantEnrollmentProposal(value, { now: NOW });
}

test("parses immutable non-authorizing ENABLE, ROTATE and DISABLE proposals", () => {
  const fixtures = [
    proposal(),
    proposal({
      action: "ROTATE",
      expectedRevision: 7,
      expectedState: "ACTIVE",
      nextRevision: 8,
      requestId: "33333333-3333-4333-8333-333333333333",
    }),
    proposal({
      action: "DISABLE",
      expectedRevision: 8,
      expectedState: "ACTIVE",
      nextRevision: 9,
      requestId: "44444444-4444-4444-8444-444444444444",
    }),
  ];

  for (const fixture of fixtures) {
    const parsed = parse(fixture);
    assert.equal(parsed.action, fixture.action);
    assert.equal(parsed.expectedState, fixture.expectedState);
    assert.equal(parsed.authorization, false);
    assert.equal(parsed.canMutate, false);
    assert.match(parsed.contentDigest, /^[0-9a-f]{64}$/u);
    assert(Object.isFrozen(parsed));
    assert(Object.isFrozen(parsed.policy));
    assert.throws(() => {
      parsed.policy.maxAttempts = 20;
    }, TypeError);
  }
});

test("ENABLE accepts a disabled row and always binds expectedState in digest", () => {
  const absent = parse(proposal());
  const disabled = parse(
    proposal({
      expectedRevision: 4,
      expectedState: "DISABLED",
      nextRevision: 5,
    }),
  );
  assert.notEqual(absent.contentDigest, disabled.contentDigest);
  assert.equal(
    parse(proposal({ workerRoleName: "_identity_mail_worker_v1" }))
      .workerRoleName,
    "_identity_mail_worker_v1",
  );
});

test("normalization is detached from input and digest is key-order stable", () => {
  const input = proposal();
  const reversed = Object.fromEntries(Object.entries(input).reverse());
  reversed.policy = Object.fromEntries(Object.entries(input.policy).reverse());
  const first = parse(input);
  const repeated = parse(reversed);
  assert.deepEqual(first, repeated);
  assert.equal(first.contentDigest, repeated.contentDigest);

  input.policy.maxAttempts = 19;
  input.workerRoleName = "changed_after_parse";
  assert.equal(first.policy.maxAttempts, 5);
  assert.equal(first.workerRoleName, "identity_mail_worker_v1");
});

test("strictly rejects extra, missing, inherited and accessor-backed fields", () => {
  expectCode(
    () => parse({ ...proposal(), unexpected: true }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_PROPOSAL_SHAPE_INVALID",
  );
  const { releaseSha: _releaseSha, ...missing } = proposal();
  expectCode(
    () => parse(missing),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_PROPOSAL_SHAPE_INVALID",
  );
  const inherited = Object.create(proposal());
  expectCode(
    () => parse(inherited),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_PROPOSAL_SHAPE_INVALID",
  );
  const accessor = proposal();
  Object.defineProperty(accessor, "tenantId", {
    enumerable: true,
    get: () => "22222222-2222-4222-8222-222222222222",
  });
  expectCode(
    () => parse(accessor),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_PROPOSAL_SHAPE_INVALID",
  );
  expectCode(
    () => parse(proposal({ policy: { ...proposal().policy, extra: 1 } })),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_INVALID",
  );
  const symbolExtra = proposal();
  symbolExtra[Symbol("extra")] = true;
  expectCode(
    () => parse(symbolExtra),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_PROPOSAL_SHAPE_INVALID",
  );
  const policySymbolExtra = proposal();
  policySymbolExtra.policy[Symbol("extra")] = true;
  expectCode(
    () => parse(policySymbolExtra),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_INVALID",
  );
});

test("rejects malformed discriminators, identifiers and database/role bindings", () => {
  const matrix = [
    [
      { contract: "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V2" },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT_INVALID",
    ],
    [{ action: "APPLY" }, "IDENTITY_MAIL_TENANT_ENROLLMENT_ACTION_INVALID"],
    [
      { requestId: "11111111-1111-4111-7111-111111111111" },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_IDENTIFIER_INVALID",
    ],
    [
      { tenantId: "22222222-2222-4222-8222-22222222222A" },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_IDENTIFIER_INVALID",
    ],
    [
      { expectedDatabaseName: "postgres" },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_DATABASE_BINDING_INVALID",
    ],
    [
      { expectedDatabaseName: "LeetPlus" },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_DATABASE_BINDING_INVALID",
    ],
    [
      { expectedDatabaseOid: 0 },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_DATABASE_BINDING_INVALID",
    ],
    [
      { expectedDatabaseOid: 4_294_967_296 },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_DATABASE_BINDING_INVALID",
    ],
    [
      { workerRoleName: "pg_read_all_data" },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_ROLE_BINDING_INVALID",
    ],
    [
      { workerRoleName: "public" },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_ROLE_BINDING_INVALID",
    ],
    [
      { workerRoleName: "a" },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_ROLE_BINDING_INVALID",
    ],
    [
      { workerRoleName: "ab" },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_ROLE_BINDING_INVALID",
    ],
    [
      { workerRoleOid: 1.5 },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_ROLE_BINDING_INVALID",
    ],
    [
      {
        tenantId: Object("22222222-2222-4222-8222-222222222222"),
      },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_IDENTIFIER_INVALID",
    ],
    [
      { workerRoleName: Object("identity_mail_worker_v1") },
      "IDENTITY_MAIL_TENANT_ENROLLMENT_ROLE_BINDING_INVALID",
    ],
  ];
  for (const [overrides, reasonCode] of matrix) {
    expectCode(() => parse(proposal(overrides)), reasonCode);
  }
});

test("rejects malformed release, deployment and config bindings", () => {
  const matrix = [
    { releaseSha: "A".repeat(40) },
    { releaseSha: "a".repeat(39) },
    { deploymentMarkerDigest: "1".repeat(63) },
    { providerAuthorityDigest: "G".repeat(64) },
    { runtimeConfigDigest: "4".repeat(65) },
    { providerAuthorityDigest: Object("2".repeat(64)) },
  ];
  for (const overrides of matrix) {
    expectCode(
      () => parse(proposal(overrides)),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_RELEASE_BINDING_INVALID",
    );
  }
});

test("rejects unsafe transitions and malformed optimistic revisions", () => {
  const actions = ["ENABLE", "ROTATE", "DISABLE"];
  const states = ["ABSENT", "ACTIVE", "DRAINING", "DISABLED"];
  const validTransitions = new Set([
    "ENABLE:ABSENT",
    "ENABLE:DISABLED",
    "ROTATE:ACTIVE",
    "DISABLE:ACTIVE",
  ]);
  for (const action of actions) {
    for (const expectedState of states) {
      if (validTransitions.has(`${action}:${expectedState}`)) {
        continue;
      }
      const expectedRevision = expectedState === "ABSENT" ? 0 : 1;
      expectCode(
        () =>
          parse(
            proposal({
              action,
              expectedRevision,
              expectedState,
              nextRevision: expectedRevision + 1,
            }),
          ),
        "IDENTITY_MAIL_TENANT_ENROLLMENT_TRANSITION_INVALID",
      );
    }
  }

  const revisions = [
    { expectedRevision: -1, nextRevision: 0 },
    { expectedRevision: 0.5, nextRevision: 1.5 },
    { expectedRevision: 0, nextRevision: 2 },
    { expectedRevision: 1, expectedState: "ABSENT", nextRevision: 2 },
    {
      action: "ROTATE",
      expectedRevision: 0,
      expectedState: "ACTIVE",
      nextRevision: 1,
    },
  ];
  for (const overrides of revisions) {
    expectCode(
      () => parse(proposal(overrides)),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_REVISION_INVALID",
    );
  }
});

test("a fresh proposal cannot bypass DRAINING recovery ownership", () => {
  for (const action of ["ENABLE", "ROTATE", "DISABLE"]) {
    expectCode(
      () =>
        parse(
          proposal({
            action,
            expectedRevision: 9,
            expectedState: "DRAINING",
            nextRevision: 10,
          }),
        ),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_TRANSITION_INVALID",
    );
  }

  const acceptedInput = proposal({
    action: "ROTATE",
    expectedRevision: 8,
    expectedState: "ACTIVE",
    nextRevision: 9,
  });
  const accepted = parse(acceptedInput);
  const exactReplay = parse(structuredClone(acceptedInput));
  const differentRequest = parse(
    proposal({
      ...acceptedInput,
      requestId: "55555555-5555-4555-8555-555555555555",
    }),
  );
  const commandIdentity = (value) => ({
    action: value.action,
    contentDigest: value.contentDigest,
    requestId: value.requestId,
    tenantId: value.tenantId,
  });

  assert.deepEqual(commandIdentity(exactReplay), commandIdentity(accepted));
  assert.notDeepEqual(
    commandIdentity(differentRequest),
    commandIdentity(accepted),
  );
  assert.match(accepted.requestId, /^[0-9a-f-]{36}$/u);
  assert.match(accepted.contentDigest, /^[0-9a-f]{64}$/u);
  assert.equal(accepted.authorization, false);
  assert.equal(accepted.canMutate, false);
});

test("enforces all bounded policy fields and base/max retry ordering", () => {
  const base = proposal().policy;
  const invalidPolicies = [
    { ...base, maxAttempts: 0 },
    { ...base, maxAttempts: 21 },
    { ...base, leaseSeconds: 29 },
    { ...base, leaseSeconds: 901 },
    { ...base, acknowledgeSeconds: 9 },
    { ...base, acknowledgeSeconds: 901 },
    { ...base, baseRetrySeconds: 0 },
    { ...base, baseRetrySeconds: 3_601 },
    { ...base, maxRetrySeconds: 86_401 },
    { ...base, baseRetrySeconds: 61, maxRetrySeconds: 60 },
    { ...base, maxAttempts: 1.5 },
  ];
  for (const policy of invalidPolicies) {
    expectCode(
      () => parse(proposal({ policy })),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_INVALID",
    );
  }

  assert.deepEqual(
    parse(
      proposal({
        policy: {
          acknowledgeSeconds: 10,
          baseRetrySeconds: 1,
          leaseSeconds: 30,
          maxAttempts: 1,
          maxRetrySeconds: 1,
        },
      }),
    ).policy,
    {
      acknowledgeSeconds: 10,
      baseRetrySeconds: 1,
      leaseSeconds: 30,
      maxAttempts: 1,
      maxRetrySeconds: 1,
    },
  );
  assert.deepEqual(
    parse(
      proposal({
        policy: {
          acknowledgeSeconds: 900,
          baseRetrySeconds: 3_600,
          leaseSeconds: 900,
          maxAttempts: 20,
          maxRetrySeconds: 86_400,
        },
      }),
    ).policy,
    {
      acknowledgeSeconds: 900,
      baseRetrySeconds: 3_600,
      leaseSeconds: 900,
      maxAttempts: 20,
      maxRetrySeconds: 86_400,
    },
  );
});

test("requires one canonical, live, bounded ISO proposal window", () => {
  const timelineFailures = [
    { requestedAt: "2026-08-01T08:59:00Z" },
    { requestedAt: "not-a-date" },
    { requestedAt: Date.parse("2026-08-01T08:59:00.000Z") },
    { expiresAt: "2026-08-01T08:59:00.000Z" },
    {
      expiresAt: new Date(
        Date.parse("2026-08-01T08:59:00.000Z") +
          IDENTITY_MAIL_TENANT_ENROLLMENT_MAX_LIFETIME_MS +
          1,
      ).toISOString(),
    },
    { requestedAt: "2026-08-01T09:05:00.001Z" },
  ];
  for (const overrides of timelineFailures) {
    expectCode(
      () => parse(proposal(overrides)),
      "IDENTITY_MAIL_TENANT_ENROLLMENT_TIMELINE_INVALID",
    );
  }

  expectCode(
    () =>
      parseIdentityMailTenantEnrollmentProposal(proposal(), {
        now: "2026-08-01T09:10:00.000Z",
      }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_PROPOSAL_STALE",
  );

  assert.equal(
    parse(
      proposal({
        expiresAt: "2026-08-01T09:14:00.000Z",
        requestedAt: "2026-08-01T08:59:00.000Z",
      }),
    ).expiresAt,
    "2026-08-01T09:14:00.000Z",
  );
  assert.equal(
    parse(
      proposal({
        expiresAt: "2026-08-01T09:10:00.000Z",
        requestedAt: "2026-08-01T09:05:00.000Z",
      }),
    ).requestedAt,
    "2026-08-01T09:05:00.000Z",
  );
});

test("now is the only parser option and cannot supply mutable state", () => {
  expectCode(
    () =>
      parseIdentityMailTenantEnrollmentProposal(proposal(), {
        currentState: "ABSENT",
        now: NOW,
      }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_OPTIONS_INVALID",
  );
  expectCode(
    () =>
      parseIdentityMailTenantEnrollmentProposal(proposal(), {
        now: new Date("invalid"),
      }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_CURRENT_TIME_INVALID",
  );
  expectCode(
    () =>
      parseIdentityMailTenantEnrollmentProposal(proposal(), {
        now: NOW,
        [Symbol("extra")]: true,
      }),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_OPTIONS_INVALID",
  );
});

function propertyKeys(value) {
  if (!value || typeof value !== "object") {
    return [];
  }
  return [
    ...Object.keys(value),
    ...Object.values(value).flatMap((item) => propertyKeys(item)),
  ];
}

test("contract has no database client, mutation path or PII/secret field", async () => {
  const source = await readFile(CONTRACT_PATH, "utf8");
  const importSpecifiers = [
    ...source.matchAll(/from\s+["']([^"']+)["']/gu),
  ].map((match) => match[1]);
  assert.deepEqual(importSpecifiers, ["node:crypto"]);
  assert.doesNotMatch(
    source,
    /(?:from\s+["'](?:@prisma\/client|pg|postgres(?:ql)?)["']|PrismaClient|\$executeRaw|\$queryRaw)/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE)\b/u,
  );

  const parsed = parse(proposal());
  assert.deepEqual(Object.keys(parsed).sort(), [
    "action",
    "authorization",
    "canMutate",
    "contentDigest",
    "contract",
    "deploymentMarkerDigest",
    "expectedDatabaseName",
    "expectedDatabaseOid",
    "expectedRevision",
    "expectedState",
    "expiresAt",
    "nextRevision",
    "policy",
    "providerAuthorityDigest",
    "releaseSha",
    "requestId",
    "requestedAt",
    "runtimeConfigDigest",
    "tenantId",
    "workerRoleName",
    "workerRoleOid",
  ]);
  const { contentDigest, ...digestPayload } = parsed;
  assert.equal(
    contentDigest,
    createHash("sha256")
      .update(JSON.stringify(digestPayload), "utf8")
      .digest("hex"),
  );
  const forbiddenField = /(?:email|token|password|secret|ciphertext)/iu;
  assert.equal(
    propertyKeys(parsed).some((key) => forbiddenField.test(key)),
    false,
  );
  assert.equal(parsed.authorization, false);
  assert.equal(parsed.canMutate, false);
});
