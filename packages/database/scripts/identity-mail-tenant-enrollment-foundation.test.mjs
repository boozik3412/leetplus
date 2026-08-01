import assert from "node:assert/strict";
import test from "node:test";

import {
  IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_FINDINGS as F,
  IdentityMailTenantEnrollmentFoundationError,
  assertIdentityMailTenantEnrollmentFoundation,
  evaluateIdentityMailTenantEnrollmentFoundation,
  loadIdentityMailTenantEnrollmentFoundationArtifact,
  runIdentityMailTenantEnrollmentFoundationSelfTest,
} from "./identity-mail-tenant-enrollment-foundation.mjs";

const artifact = await loadIdentityMailTenantEnrollmentFoundationArtifact();

function clone() {
  return structuredClone(artifact);
}

function beforeCommit(value, statement) {
  value.candidate.sql = value.candidate.sql.replace(
    "COMMIT;",
    `${statement}\nCOMMIT;`,
  );
}

function replaceInSection(value, startMarker, endMarker, from, to) {
  const start = value.candidate.sql.indexOf(startMarker);
  const end = value.candidate.sql.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing section start: ${startMarker}`);
  assert.ok(end > start, `Missing section end: ${endMarker}`);
  const prefix = value.candidate.sql.slice(0, start);
  const section = value.candidate.sql.slice(start, end);
  const suffix = value.candidate.sql.slice(end);
  assert.ok(section.includes(from), `Missing mutation target: ${from}`);
  value.candidate.sql = prefix + section.replace(from, to) + suffix;
}

function expectFinding(value, finding) {
  const report = evaluateIdentityMailTenantEnrollmentFoundation(value);
  assert.equal(report.decision, "BLOCKED");
  assert.equal(report.authorization, false);
  assert.equal(report.canMutate, false);
  assert.ok(report.findings.includes(finding), JSON.stringify(report.findings));
  assert.deepEqual(report.findings, [...report.findings].sort());
  return report;
}

test("accepts CURRENT180 only with the exact ordered CURRENT180..CURRENT183 inventory", () => {
  const report = assertIdentityMailTenantEnrollmentFoundation(artifact);
  assert.equal(report.decision, "COMPLIANT");
  assert.equal(report.base.count, 179);
  assert.equal(
    report.base.head,
    "20260731120000_identity_mail_delivery_release_head",
  );
  assert.equal(report.candidate.ordinal, 180);
  assert.equal(
    report.candidate.name,
    "20260801010000_identity_mail_tenant_enrollment_control_plane",
  );
  assert.equal(
    report.candidate.sha256,
    "e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683",
  );
  assert.deepEqual(artifact.candidates.directoryNames, [
    "20260801010000_identity_mail_tenant_enrollment_control_plane",
    "20260801020000_identity_mail_tenant_lock_drain_worker_v2",
    "20260801030000_identity_mail_tenant_first_claim_protocol",
    "20260802010000_identity_mail_worker_v2_freshness_protocol",
  ]);
  assert.deepEqual(report.findings, []);
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.findings));
});

test("fails closed on canonical position, manifest, candidate head and metadata drift", async (t) => {
  const cases = [
    [
      "canonical count and head",
      F.CANONICAL_COUNT_MISMATCH,
      (value) => {
        value.canonical.directoryNames.pop();
        value.canonical.entries.pop();
      },
    ],
    [
      "canonical manifest",
      F.CANONICAL_MANIFEST_MISMATCH,
      (value) => {
        value.canonical.entries[0].sha256 = "0".repeat(64);
      },
    ],
    [
      "unexpected canonical directory",
      F.CANONICAL_DIRECTORY_DRIFT,
      (value) => {
        value.canonical.directoryNames.push("scratch");
      },
    ],
    [
      "missing stacked CURRENT183 successor",
      F.CANDIDATE_HEAD_MISMATCH,
      (value) => {
        value.candidates.directoryNames.pop();
      },
    ],
    [
      "missing stacked CURRENT181 successor",
      F.CANDIDATE_HEAD_MISMATCH,
      (value) => {
        value.candidates.directoryNames.splice(1, 1);
      },
    ],
    [
      "reordered exact successors",
      F.CANDIDATE_HEAD_MISMATCH,
      (value) => {
        [
          value.candidates.directoryNames[2],
          value.candidates.directoryNames[3],
        ] = [
          value.candidates.directoryNames[3],
          value.candidates.directoryNames[2],
        ];
      },
    ],
    [
      "unknown fifth candidate",
      F.CANDIDATE_HEAD_MISMATCH,
      (value) => {
        value.candidates.directoryNames.push(
          "20260802020000_unexpected_candidate",
        );
      },
    ],
    [
      "candidate metadata exact key set",
      F.CANDIDATE_METADATA_MISMATCH,
      (value) => {
        const metadata = JSON.parse(value.candidate.metadataText);
        metadata.extra = true;
        value.candidate.metadataText = JSON.stringify(metadata);
      },
    ],
    [
      "candidate metadata digest",
      F.CANDIDATE_DIGEST_MISMATCH,
      (value) => {
        const metadata = JSON.parse(value.candidate.metadataText);
        metadata.migrationSqlSha256 = "0".repeat(64);
        value.candidate.metadataText = JSON.stringify(metadata);
      },
    ],
    [
      "candidate SQL bytes",
      F.CANDIDATE_DIGEST_MISMATCH,
      (value) => {
        value.candidate.sql += "\n";
      },
    ],
  ];
  for (const [name, finding, mutate] of cases) {
    await t.test(name, () => {
      const value = clone();
      mutate(value);
      expectFinding(value, finding);
    });
  }
});

test("requires the CURRENT179 prerequisite before DDL and an empty registry", async (t) => {
  await t.test("precondition order", () => {
    const value = clone();
    value.candidate.sql = value.candidate.sql.replace(
      "DO $prerequisite$",
      'CREATE TABLE public."EarlyDdl" ("id" TEXT);\nDO $prerequisite$',
    );
    expectFinding(value, F.PRECONDITION_ORDER_INVALID);
  });
  await t.test("empty registry", () => {
    const value = clone();
    value.candidate.sql = value.candidate.sql.replace(
      "enrollment_count <> 0 OR claimed_outbox_count <> 0",
      "enrollment_count = -1 OR claimed_outbox_count <> 0",
    );
    expectFinding(value, F.EMPTY_REGISTRY_PRECONDITION_MISSING);
  });
  await t.test("candidate-only rehearsal execution fence", () => {
    const value = clone();
    value.candidate.sql = value.candidate.sql.replace(
      "rehearse-dormant-identity-mail-tenant-enrollment-current180",
      "rehearse-untrusted-current180",
    );
    expectFinding(value, F.REHEARSAL_EXECUTION_FENCE_MISSING);
  });
  await t.test("transaction wrapper", () => {
    const value = clone();
    value.candidate.sql = value.candidate.sql.replace(/COMMIT;\s*$/u, "");
    expectFinding(value, F.TRANSACTION_ENVELOPE_INVALID);
  });
});

test("pins the exact disposable clone GUC and unfinished receipt execution fence", async (t) => {
  const executionCases = [
    [
      "clone database regex",
      "^lp_imtec_[0-9a-f]{32}_ci$",
      "^lp_imtec_[0-9a-f]{31}_ci$",
    ],
    [
      "confirmation GUC",
      "leetplus.identity_mail_tenant_enrollment_current180_confirmation",
      "leetplus.identity_mail_tenant_enrollment_current180_confirmation_removed",
    ],
    [
      "candidate SHA GUC",
      "leetplus.identity_mail_tenant_enrollment_current180_sha256",
      "leetplus.identity_mail_tenant_enrollment_current180_sha256_removed",
    ],
    [
      "confirmation value",
      "rehearse-dormant-identity-mail-tenant-enrollment-current180",
      "rehearse-untrusted-current180",
    ],
  ];
  for (const [name, from, to] of executionCases) {
    await t.test(name, () => {
      const value = clone();
      value.candidate.sql = value.candidate.sql.replace(from, to);
      expectFinding(value, F.CANDIDATE_EXECUTION_FENCE_MISSING);
    });
  }

  const receiptCases = [
    [
      "exactly one receipt",
      "candidate_receipt_count IS DISTINCT FROM 1",
      "candidate_receipt_count IS DISTINCT FROM 2",
    ],
    [
      "receipt checksum binds GUC",
      "candidate_receipt_checksum IS DISTINCT FROM\n       rehearsal_candidate_sha256",
      "candidate_receipt_checksum IS NOT DISTINCT FROM\n       rehearsal_candidate_sha256",
    ],
    [
      "zero applied steps",
      "candidate_receipt_applied_steps IS DISTINCT FROM 0",
      "candidate_receipt_applied_steps IS DISTINCT FROM 1",
    ],
  ];
  for (const [name, from, to] of receiptCases) {
    await t.test(name, () => {
      const value = clone();
      value.candidate.sql = value.candidate.sql.replace(from, to);
      expectFinding(value, F.CANDIDATE_RECEIPT_FENCE_MISSING);
    });
  }
  await t.test("receipt remains unfinished", () => {
    const value = clone();
    replaceInSection(
      value,
      "SELECT\n    pg_catalog.count(*)::INTEGER,\n    pg_catalog.min(migration.\"checksum\")",
      "IF candidate_receipt_count IS DISTINCT FROM 1",
      'migration."finished_at" IS NULL',
      'migration."finished_at" IS NOT NULL',
    );
    expectFinding(value, F.CANDIDATE_RECEIPT_FENCE_MISSING);
  });
  await t.test("receipt is not rolled back", () => {
    const value = clone();
    replaceInSection(
      value,
      "SELECT\n    pg_catalog.count(*)::INTEGER,\n    pg_catalog.min(migration.\"checksum\")",
      "IF candidate_receipt_count IS DISTINCT FROM 1",
      'migration."rolled_back_at" IS NULL',
      'migration."rolled_back_at" IS NOT NULL',
    );
    expectFinding(value, F.CANDIDATE_RECEIPT_FENCE_MISSING);
  });
  await t.test("no second unfinished receipt", () => {
    const value = clone();
    value.candidate.sql = value.candidate.sql.replace(
      'migration."migration_name" <>\n           \'20260801010000_identity_mail_tenant_enrollment_control_plane\'',
      'migration."migration_name" =\n           \'20260801010000_identity_mail_tenant_enrollment_control_plane\'',
    );
    expectFinding(value, F.CANDIDATE_RECEIPT_FENCE_MISSING);
  });
});

test("pins the complete table, column, constraint, index, guard, ACL and comment surfaces", async (t) => {
  const cases = [
    [
      "created table",
      F.CREATED_TABLE_SURFACE_DRIFT,
      (value) => beforeCommit(value, 'CREATE TABLE public."Extra" ("id" TEXT);'),
    ],
    [
      "created column",
      F.CREATED_COLUMN_SURFACE_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          '  "expectedState" VARCHAR(16) NOT NULL,',
          '  "unexpectedColumn" TEXT NOT NULL,\n  "expectedState" VARCHAR(16) NOT NULL,',
        );
      },
    ],
    [
      "added column",
      F.ADDED_COLUMN_SURFACE_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          '  ADD COLUMN "state" VARCHAR(16) NOT NULL,',
          '  ADD COLUMN "unexpectedColumn" TEXT,\n  ADD COLUMN "state" VARCHAR(16) NOT NULL,',
        );
      },
    ],
    [
      "altered table",
      F.ALTERED_TABLE_SURFACE_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          'ALTER TABLE public."SharedBetaRuntimeReleaseMarker"',
          'ALTER TABLE public."UnexpectedMarker"',
        );
      },
    ],
    [
      "constraint",
      F.CONSTRAINT_SURFACE_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          'CONSTRAINT "shared_beta_runtime_marker_enrollment_binding_key"',
          'CONSTRAINT "unexpected_constraint"',
        );
      },
    ],
    [
      "index",
      F.INDEX_SURFACE_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          'CREATE INDEX "identity_mail_tenant_enrollment_command_marker_idx"',
          'CREATE INDEX "unexpected_index"',
        );
      },
    ],
    [
      "guard function",
      F.GUARD_FUNCTION_SURFACE_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          'CREATE FUNCTION\n  public."identity_mail_tenant_enrollment_command_guard_v1"()',
          'CREATE FUNCTION\n  public."identity_mail_tenant_enrollment_unexpected_guard_v1"()',
        );
      },
    ],
    [
      "trigger",
      F.TRIGGER_SURFACE_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          'CREATE TRIGGER "IdentityMailEnrollmentCommand_dml_guard_trigger"',
          'CREATE TRIGGER "UnexpectedTrigger"',
        );
      },
    ],
    [
      "ACL",
      F.ACL_SURFACE_DRIFT,
      (value) =>
        beforeCommit(
          value,
          'REVOKE ALL PRIVILEGES ON TABLE public."IdentityMailDeliveryTenantEnrollment" FROM PUBLIC;',
        ),
    ],
    [
      "comment",
      F.COMMENT_SURFACE_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          'COMMENT ON TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"',
          'COMMENT ON TABLE public."IdentityMailDeliveryTenantEnrollment"',
        );
      },
    ],
  ];
  for (const [name, finding, mutate] of cases) {
    await t.test(name, () => {
      const value = clone();
      mutate(value);
      expectFinding(value, finding);
    });
  }
});

test("rejects grants, unrelated DDL, coordinator routines and sensitive DML", async (t) => {
  await t.test("GRANT", () => {
    const value = clone();
    beforeCommit(
      value,
      'GRANT SELECT ON TABLE public."IdentityMailDeliveryTenantEnrollmentCommand" TO PUBLIC;',
    );
    expectFinding(value, F.GRANT_PRESENT);
  });
  await t.test("unrelated DDL", () => {
    const value = clone();
    beforeCommit(value, 'CREATE ROLE "unexpected_role";');
    expectFinding(value, F.FORBIDDEN_DDL);
  });
  for (const operation of ["apply", "resume", "finalize", "rollback"]) {
    await t.test(`${operation} coordinator`, () => {
      const value = clone();
      beforeCommit(
        value,
        `CREATE FUNCTION public."identity_mail_tenant_enrollment_${operation}_v1"() RETURNS void LANGUAGE sql AS 'SELECT';`,
      );
      expectFinding(value, F.FORBIDDEN_COORDINATOR_ROUTINE);
    });
  }
  for (const relation of [
    "Tenant",
    "User",
    "UserInvite",
    "IdentityMailOutbox",
    "SmtpCredential",
  ]) {
    await t.test(`${relation} DML`, () => {
      const value = clone();
      beforeCommit(
        value,
        `UPDATE public."${relation}" SET "id" = "id";`,
      );
      expectFinding(value, F.FORBIDDEN_SENSITIVE_DML);
    });
  }
});

test("requires statement-level dormant guards and the single-root event chain", async (t) => {
  await t.test("row-level DML guard", () => {
    const value = clone();
    value.candidate.sql = value.candidate.sql.replace(
      "FOR EACH STATEMENT",
      "FOR EACH ROW",
    );
    expectFinding(value, F.DORMANT_GUARD_NOT_STATEMENT_LEVEL);
  });
  await t.test("nullable chain uniqueness", () => {
    const value = clone();
    value.candidate.sql = value.candidate.sql.replace(
      "UNIQUE NULLS NOT DISTINCT",
      "UNIQUE",
    );
    expectFinding(value, F.EVENT_CHAIN_GUARD_MISSING);
  });
});

test("pins command, event and enrollment state projections independently of the SQL digest", async (t) => {
  await t.test("command drain projection", () => {
    const value = clone();
    replaceInSection(
      value,
      'CONSTRAINT "identity_mail_tenant_enrollment_command_drain_projection_key"',
      'CONSTRAINT "identity_mail_tenant_enrollment_command_identifier_check"',
      '"drainStateRevision"',
      '"finalStateRevision"',
    );
    expectFinding(value, F.COMMAND_DRAIN_PROJECTION_MISSING);
  });
  await t.test("event terminal projection exact columns", () => {
    const value = clone();
    replaceInSection(
      value,
      'CONSTRAINT "identity_mail_tenant_enrollment_event_terminal_projection_key"',
      'CONSTRAINT "identity_mail_tenant_enrollment_event_command_sequence_uidx"',
      '"toConfigurationDigest"',
      '"commandContentDigest"',
    );
    expectFinding(value, F.EVENT_TERMINAL_PROJECTION_MISSING);
  });
  await t.test("event composite continuity FK", () => {
    const value = clone();
    replaceInSection(
      value,
      '"IdentityMailDeliveryTenantEnrollmentEvent_continuity_fkey"',
      'ALTER TABLE public."IdentityMailDeliveryTenantEnrollment"\n  ADD COLUMN',
      '"fromConfigurationDigest"',
      '"toConfigurationDigest"',
    );
    expectFinding(value, F.EVENT_CONTINUITY_FK_MISSING);
  });
  await t.test("enrollment active command drain projection FK", () => {
    const value = clone();
    replaceInSection(
      value,
      'CONSTRAINT "IdentityMailDeliveryTenantEnrollment_activeCommand_fkey"',
      'CONSTRAINT "IdentityMailDeliveryTenantEnrollment_lastEvent_fkey"',
      '"stateRevision"',
      '"policyRevision"',
    );
    expectFinding(value, F.ENROLLMENT_ACTIVE_COMMAND_DRAIN_FK_MISSING);
  });
  await t.test("enrollment terminal event projection FK", () => {
    const value = clone();
    replaceInSection(
      value,
      'CONSTRAINT "IdentityMailDeliveryTenantEnrollment_lastEvent_fkey"',
      'CREATE INDEX "identity_mail_tenant_enrollment_worker_state_idx"',
      '"currentConfigurationDigest"',
      '"lastEventDigest"',
    );
    expectFinding(value, F.ENROLLMENT_LAST_EVENT_PROJECTION_FK_MISSING);
  });
  await t.test("current configuration digest column", () => {
    const value = clone();
    replaceInSection(
      value,
      'ALTER TABLE public."IdentityMailDeliveryTenantEnrollment"\n  ADD COLUMN',
      'ALTER TABLE public."IdentityMailDeliveryTenantEnrollment"\n  DROP CONSTRAINT',
      'ADD COLUMN "currentConfigurationDigest" CHAR(64) NOT NULL',
      'ADD COLUMN "currentConfigurationDigest" TEXT NOT NULL',
    );
    expectFinding(value, F.CURRENT_CONFIGURATION_DIGEST_MISSING);
  });
});

test("pins every required authorization envelope binding", async (t) => {
  for (const key of [
    "intent",
    "rollbackOfCommandId",
    "stateRevisionBefore",
    "drainStateRevision",
    "finalStateRevision",
    "previousConfiguration",
    "targetConfiguration",
    "databaseIdentityDigest",
    "deploymentMarkerId",
    "deploymentMarkerDigest",
    "actualContextDigest",
    "releaseSha",
    "actorDigest",
    "proposalContentDigest",
  ]) {
    await t.test(key, () => {
      const value = clone();
      const envelopeStart = value.candidate.sql.indexOf(
        'AND "authorizationEnvelopeCanonicalJson"::JSONB',
      );
      assert.ok(envelopeStart > 0);
      const prefix = value.candidate.sql.slice(0, envelopeStart);
      const envelopeAndTail = value.candidate.sql.slice(envelopeStart).replace(
        `'${key}',`,
        `'${key}Removed',`,
      );
      value.candidate.sql = prefix + envelopeAndTail;
      expectFinding(value, F.AUTHORIZATION_ENVELOPE_BINDING_MISSING);
    });
  }
  await t.test("event FK uses authorization digest", () => {
    const value = clone();
    value.candidate.sql = value.candidate.sql.replace(
      '    "authorizationEnvelopeDigest"\n  )\n  ON DELETE RESTRICT',
      '    "proposalContentDigest"\n  )\n  ON DELETE RESTRICT',
    );
    expectFinding(value, F.EVENT_AUTHORITY_BINDING_MISSING);
  });
});

test("keeps the living proposal and preflight non-authorizing and byte-pinned", async (t) => {
  await t.test("contract bytes", () => {
    const value = clone();
    value.livingSources.contract += "\n";
    expectFinding(value, F.LIVING_CONTRACT_DRIFT);
  });
  await t.test("contract authorization", () => {
    const value = clone();
    value.livingSources.contract = value.livingSources.contract.replace(
      "authorization: false",
      "authorization: true",
    );
    expectFinding(value, F.LIVING_CONTRACT_AUTHORIZES);
  });
  await t.test("preflight bytes", () => {
    const value = clone();
    value.livingSources.preflight += "\n";
    expectFinding(value, F.LIVING_PREFLIGHT_DRIFT);
  });
  await t.test("preflight authorization", () => {
    const value = clone();
    value.livingSources.preflight = value.livingSources.preflight.replace(
      "canMutate: false",
      "canMutate: true",
    );
    expectFinding(value, F.LIVING_PREFLIGHT_AUTHORIZES);
  });
});

test("assertion exposes only a safe deterministic blocked report", () => {
  const value = clone();
  value.candidate.sql += "\n";
  assert.throws(
    () => assertIdentityMailTenantEnrollmentFoundation(value),
    (error) =>
      error instanceof IdentityMailTenantEnrollmentFoundationError &&
      error.code ===
        "IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_BLOCKED" &&
      error.exitCode === 3 &&
      error.report.authorization === false &&
      error.report.canMutate === false &&
      error.report.findings.includes(F.CANDIDATE_DIGEST_MISMATCH),
  );
});

test("offline self-test exercises the fail-closed probes", () => {
  const result = runIdentityMailTenantEnrollmentFoundationSelfTest(artifact);
  assert.equal(result.decision, "SELF_TEST_PASSED");
  assert.equal(result.authorization, false);
  assert.equal(result.canMutate, false);
  assert.equal(result.probesPassed, 21);
  assert.ok(Object.isFrozen(result));
});
