import assert from "node:assert/strict";
import test from "node:test";

import {
  IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CANDIDATE,
  IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_FINDINGS as F,
  IdentityMailTenantLockDrainCurrent181FoundationError,
  assertIdentityMailTenantLockDrainCurrent181Foundation,
  evaluateIdentityMailTenantLockDrainCurrent181Foundation,
  loadIdentityMailTenantLockDrainCurrent181Artifact,
  runIdentityMailTenantLockDrainCurrent181SelfTest,
} from "./identity-mail-tenant-lock-drain-current181-foundation.mjs";

const artifact = await loadIdentityMailTenantLockDrainCurrent181Artifact();

const v1WorkerProsrcPins = [
  [
    'public."identity_mail_delivery_worker_assert_v1"(text)',
    "a8912b95b9dbd7197acd97981b88bae680bf80d3f820a13c569110c1efa49f37",
  ],
  [
    'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)',
    "f2d56144cba4cbc3ee4626f09e1b5c106347822e500c7cd2310f52553b40b57b",
  ],
  [
    'public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)',
    "a4bf0b2da481d9b1aa463261f5d90314729bedd06c6764337e64f59cfde59742",
  ],
  [
    'public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)',
    "650839a7f45bd35a703a2e5e3ee479ef1ddee59f7d36b258836b5671d6f144dc",
  ],
  [
    'public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)',
    "a0f72c433ca283d179e75cb0443acdaedf5d405b05c4e8ad3b0a998034bf89e2",
  ],
  [
    'public."identity_initial_owner_mail_reconcile_v1"(text,bigint,text,text,text)',
    "6ebfbc2d6dd435fe7b4abc474ebc8e43b7178de8bd9723e3eb420f4079ed7d8e",
  ],
];

function withCandidateSql() {
  return structuredClone(artifact);
}

function replaceCandidateFragment(value, before, after) {
  assert.ok(value.candidate.sql.includes(before), `missing fixture: ${before}`);
  value.candidate.sql = value.candidate.sql.replace(before, after);
}

function mutateFunctionBlock(value, name, mutate) {
  const escapedName = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(
    `\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\."${escapedName}"\\s*\\(`,
    "iu",
  ).exec(value.candidate.sql);
  assert.ok(match && typeof match.index === "number", `missing function: ${name}`);
  const next = /\n(?:CREATE|ALTER|DROP|COMMENT|REVOKE)\s/giu;
  next.lastIndex = match.index + 1;
  const end = next.exec(value.candidate.sql)?.index ?? value.candidate.sql.length;
  const block = value.candidate.sql.slice(match.index, end);
  const mutated = mutate(block);
  assert.notEqual(mutated, block, `function mutation was inert: ${name}`);
  value.candidate.sql =
    value.candidate.sql.slice(0, match.index) +
    mutated +
    value.candidate.sql.slice(end);
}

function removePublicRevoke(value, name) {
  const marker = `ON FUNCTION public."${name}"`;
  const markerIndex = value.candidate.sql.indexOf(marker);
  assert.ok(markerIndex >= 0, `missing revoke marker: ${name}`);
  const start = value.candidate.sql.lastIndexOf(
    "REVOKE ALL PRIVILEGES",
    markerIndex,
  );
  const terminator = "FROM PUBLIC;";
  const end = value.candidate.sql.indexOf(terminator, markerIndex);
  assert.ok(start >= 0 && end >= markerIndex, `missing revoke: ${name}`);
  value.candidate.sql =
    value.candidate.sql.slice(0, start) +
    value.candidate.sql.slice(end + terminator.length);
}

function removeLastOccurrence(value, fragment) {
  const index = value.candidate.sql.lastIndexOf(fragment);
  assert.ok(index >= 0, `missing final fixture: ${fragment}`);
  value.candidate.sql =
    value.candidate.sql.slice(0, index) +
    value.candidate.sql.slice(index + fragment.length);
}

function noOpFunctionBody(block) {
  const mutated = block.replace(
    /(\bAS\s+\$\$\s*)[\s\S]*?(\s*\$\$;)/iu,
    "$1BEGIN\n  RETURN pg_catalog.jsonb_build_object('decision', 'NOOP');\nEND;\n$2",
  );
  assert.notEqual(mutated, block, "missing function body fixture");
  return mutated;
}

function expectFinding(value, finding) {
  const report = evaluateIdentityMailTenantLockDrainCurrent181Foundation(value);
  assert.equal(report.decision, "BLOCKED");
  assert.ok(report.findings.includes(finding), JSON.stringify(report.findings));
  assert.deepEqual(report.findings, [...report.findings].sort());
  assert.equal(report.authorization, false);
  assert.equal(report.canMutate, false);
  return report;
}

test("pins CURRENT181 with the exact ordered CURRENT180..CURRENT183 inventory", () => {
  const report = evaluateIdentityMailTenantLockDrainCurrent181Foundation(
    artifact,
  );
  assert.equal(report.decision, "COMPLIANT");
  assert.deepEqual(report.findings, []);
  assert.equal(report.base.count, 179);
  assert.equal(
    report.base.head,
    "20260731120000_identity_mail_delivery_release_head",
  );
  assert.equal(report.predecessor.count, 180);
  assert.equal(
    report.predecessor.head,
    "20260801010000_identity_mail_tenant_enrollment_control_plane",
  );
  assert.equal(
    report.predecessor.manifestDigest,
    "c41f3854bff364deb4f169f56f31bb5bd7e46249a677c66bc879cb967b6fae58",
  );
  assert.equal(report.candidate.ordinal, 181);
  assert.equal(
    report.candidate.name,
    IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CANDIDATE,
  );
  assert.deepEqual(artifact.candidates.directoryNames, [
    "20260801010000_identity_mail_tenant_enrollment_control_plane",
    "20260801020000_identity_mail_tenant_lock_drain_worker_v2",
    "20260801030000_identity_mail_tenant_first_claim_protocol",
    "20260802010000_identity_mail_worker_v2_freshness_protocol",
  ]);
});

test("accepts the exact frozen candidate surface and pinned SQL SHA", () => {
  const report = evaluateIdentityMailTenantLockDrainCurrent181Foundation(
    withCandidateSql(),
  );
  assert.equal(report.decision, "COMPLIANT");
  assert.deepEqual(report.findings, []);
});

test("fails closed on fence, helper, columns and rollback uniqueness drift", async (t) => {
  const cases = [
    [
      "execution fence",
      F.EXECUTION_FENCE_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "completed_migration_count IS DISTINCT FROM 180",
          "completed_migration_count IS DISTINCT FROM 179",
        );
      },
    ],
    [
      "tenant lock domain",
      F.HELPER_CONTRACT_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "leetplus:identity-mail-tenant:v1:",
          "leetplus:identity-mail-request:v1:",
        );
      },
    ],
    [
      "caller transaction isolation",
      F.HELPER_CONTRACT_DRIFT,
      (value) => {
        mutateFunctionBlock(
          value,
          "identity_mail_tenant_lock_v1",
          (block) => block.replace("'serializable'", "'read committed'"),
        );
      },
    ],
    [
      "caller read-write guard",
      F.HELPER_CONTRACT_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "current_setting('transaction_read_only') <> 'off'",
          "current_setting('transaction_read_only') <> 'on'",
        );
      },
    ],
    [
      "caller statement timeout permits zero",
      F.HELPER_CONTRACT_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "statement_timeout_interval <= INTERVAL '0 milliseconds'",
          "statement_timeout_interval < INTERVAL '0 milliseconds'",
        );
      },
    ],
    [
      "caller statement timeout permits above 30 seconds",
      F.HELPER_CONTRACT_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "statement_timeout_interval > INTERVAL '30 seconds'",
          "statement_timeout_interval > INTERVAL '31 seconds'",
        );
      },
    ],
    [
      "session-scoped helper lock timeout",
      F.HELPER_CONTRACT_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "set_config('lock_timeout', '5s', true)",
          "set_config('lock_timeout', '5s', false)",
        );
      },
    ],
    [
      "wrong transaction-local helper lock timeout",
      F.HELPER_CONTRACT_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "set_config('lock_timeout', '5s', true)",
          "set_config('lock_timeout', '4s', true)",
        );
      },
    ],
    [
      "helper arms lock timeout after advisory lock",
      F.HELPER_CONTRACT_DRIFT,
      (value) => {
        const lockConfig =
          "  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);\n\n";
        value.candidate.sql = value.candidate.sql
          .replace(lockConfig, "")
          .replace(
            "  RETURN canonical_tenant_id;",
            `${lockConfig}  RETURN canonical_tenant_id;`,
          );
      },
    ],
    [
      "caller statement timeout is not inspected",
      F.HELPER_CONTRACT_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "pg_catalog.current_setting('statement_timeout')::INTERVAL",
          "INTERVAL '30 seconds'",
        );
      },
    ],
    [
      "outbox claim binding column",
      F.COLUMN_SURFACE_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          '  ADD COLUMN "claimPolicyRevision" INTEGER,\n',
          "",
        );
      },
    ],
    [
      "delivery event claim binding column",
      F.COLUMN_SURFACE_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          'ALTER TABLE public."IdentityMailDeliveryEvent"\n  ADD COLUMN "claimEnrollmentStateRevision" BIGINT,\n  ADD COLUMN "claimPolicyRevision" INTEGER,',
          'ALTER TABLE public."IdentityMailDeliveryEvent"\n  ADD COLUMN "claimEnrollmentStateRevision" BIGINT,',
        );
      },
    ],
    [
      "one rollback per forward command",
      F.CONSTRAINT_SURFACE_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "CREATE UNIQUE INDEX",
          "CREATE INDEX",
        );
      },
    ],
  ];
  for (const [name, finding, mutate] of cases) {
    await t.test(name, () => {
      const value = withCandidateSql();
      mutate(value);
      expectFinding(value, finding);
    });
  }
});

test("pins the exact bounded worker-v2 entrypoints and security modes", async (t) => {
  await t.test("missing worker routine", () => {
    const value = withCandidateSql();
    mutateFunctionBlock(
      value,
      "identity_initial_owner_mail_reap_v2",
      (block) =>
        block.replace(
          'public."identity_initial_owner_mail_reap_v2"',
          'public."identity_initial_owner_mail_reap_v2_missing"',
        ),
    );
    expectFinding(value, F.ROUTINE_SURFACE_DRIFT);
  });
  await t.test("definer helper", () => {
    const value = withCandidateSql();
    mutateFunctionBlock(
      value,
      "identity_mail_tenant_lock_v1",
      (block) => block.replace("SECURITY INVOKER", "SECURITY DEFINER"),
    );
    expectFinding(value, F.HELPER_CONTRACT_DRIFT);
    expectFinding(value, F.ROUTINE_SURFACE_DRIFT);
  });
  await t.test("missing PUBLIC revoke", () => {
    const value = withCandidateSql();
    removePublicRevoke(value, "identity_initial_owner_mail_complete_v2");
    expectFinding(value, F.ACL_SURFACE_DRIFT);
  });
  await t.test("wrong argument signature", () => {
    const value = withCandidateSql();
    mutateFunctionBlock(
      value,
      "identity_mail_delivery_worker_assert_v2",
      (block) =>
        block.replace(
          "p_provider_authority_digest TEXT",
          "p_provider_authority_digest BIGINT",
        ),
    );
    expectFinding(value, F.ROUTINE_SURFACE_DRIFT);
  });
});

test("rejects semantically inert or authority-weakened worker-v2 bodies", async (t) => {
  const operationalNames = [
    "identity_mail_delivery_worker_assert_v2",
    "identity_initial_owner_mail_claim_v2",
    "identity_initial_owner_mail_provider_mark_v2",
    "identity_initial_owner_mail_complete_v2",
    "identity_initial_owner_mail_reap_v2",
    "identity_initial_owner_mail_reconcile_v2",
  ];
  for (const name of operationalNames) {
    await t.test(`no-op ${name}`, () => {
      const value = withCandidateSql();
      mutateFunctionBlock(value, name, noOpFunctionBody);
      expectFinding(value, F.WORKER_TENANT_LOCK_ORDER_DRIFT);
    });
    await t.test(`relation read precedes tenant lock in ${name}`, () => {
      const value = withCandidateSql();
      mutateFunctionBlock(value, name, (block) =>
        block.replace(
          "BEGIN\n",
          'BEGIN\n  PERFORM 1 FROM public."IdentityMailOutbox";\n',
        ),
      );
      expectFinding(value, F.WORKER_TENANT_LOCK_ORDER_DRIFT);
    });
  }

  await t.test("claim omits SKIP LOCKED", () => {
    const value = withCandidateSql();
    mutateFunctionBlock(
      value,
      "identity_initial_owner_mail_claim_v2",
      (block) => block.replace(" SKIP LOCKED", ""),
    );
    expectFinding(value, F.CLAIM_CONTRACT_DRIFT);
  });

  await t.test("claim permits a missing secret", () => {
    const value = withCandidateSql();
    mutateFunctionBlock(
      value,
      "identity_initial_owner_mail_claim_v2",
      (block) =>
        block.replace(
          'outbox_record."secretCiphertext" IS NULL',
          'outbox_record."secretCiphertext" IS NOT NULL',
        ),
    );
    expectFinding(value, F.CLAIM_CONTRACT_DRIFT);
  });

  for (const relation of ["UserInvite", "IdentityEmailClaim", "Tenant"]) {
    await t.test(`claim omits ${relation} deliverability`, () => {
      const value = withCandidateSql();
      mutateFunctionBlock(
        value,
        "identity_initial_owner_mail_claim_v2",
        (block) =>
          block.replace(
            `FROM public."${relation}"`,
            `FROM public."${relation}Missing"`,
          ),
      );
      expectFinding(value, F.CLAIM_CONTRACT_DRIFT);
    });
  }

  for (const name of [
    "identity_initial_owner_mail_provider_mark_v2",
    "identity_initial_owner_mail_complete_v2",
    "identity_initial_owner_mail_reap_v2",
  ]) {
    await t.test(`claim authority removed from ${name}`, () => {
      const value = withCandidateSql();
      mutateFunctionBlock(value, name, (block) =>
        block.replace(
          'outbox_record."claimProviderAuthorityDigest" IS DISTINCT FROM',
          'outbox_record."providerAuthorityDigest" IS DISTINCT FROM',
        ),
      );
      expectFinding(value, F.SETTLEMENT_AUTHORITY_DRIFT);
    });
  }

  await t.test("completion retries while draining", () => {
    const value = withCandidateSql();
    mutateFunctionBlock(
      value,
      "identity_initial_owner_mail_complete_v2",
      (block) =>
        block.replace(
          "ELSIF draining AND p_outcome_code IN (",
          "ELSIF NOT draining AND p_outcome_code IN (",
        ),
    );
    expectFinding(value, F.DRAIN_RETRY_DRIFT);
  });

  await t.test("reaper retry branch is reachable while draining", () => {
    const value = withCandidateSql();
    mutateFunctionBlock(
      value,
      "identity_initial_owner_mail_reap_v2",
      (block) =>
        block.replace(
          "IF draining THEN\n        next_status :=",
          "IF NOT draining THEN\n        next_status :=",
        ),
    );
    expectFinding(value, F.DRAIN_RETRY_DRIFT);
  });
});

test("rejects non-monotonic transition time and session-formatted event evidence", async (t) => {
  for (const [name, marker] of [
    ["identity_initial_owner_mail_claim_v2", "now_at := GREATEST("],
    [
      "identity_initial_owner_mail_provider_mark_v2",
      "now_at := GREATEST(",
    ],
    ["identity_initial_owner_mail_complete_v2", "now_at := GREATEST("],
    ["identity_initial_owner_mail_reap_v2", "transition_at := GREATEST("],
  ]) {
    await t.test(`non-monotonic ${name}`, () => {
      const value = withCandidateSql();
      mutateFunctionBlock(value, name, (block) =>
        block.replace(marker, marker.replace("GREATEST", "LEAST")),
      );
      expectFinding(value, F.TRANSITION_TIMESTAMP_DRIFT);
    });
  }

  for (const [name, marker, qualified] of [
    ["GREATEST", "now_at := GREATEST(", "now_at := pg_catalog.greatest("],
    [
      "LEAST",
      "deliverable_until := LEAST(",
      "deliverable_until := pg_catalog.least(",
    ],
  ]) {
    await t.test(`schema-qualified ${name} special form`, () => {
      const value = withCandidateSql();
      replaceCandidateFragment(value, marker, qualified);
      expectFinding(value, F.TRANSITION_TIMESTAMP_DRIFT);
    });
  }

  await t.test("event digest uses timestamptz text rendering", () => {
    const value = withCandidateSql();
    mutateFunctionBlock(
      value,
      "identity_mail_delivery_event_append_v2",
      (block) =>
        block.replace(
          /pg_catalog\.floor\(\s*pg_catalog\.date_part\('epoch', NEW\."updatedAt"\) \* 1000\s*\)::BIGINT::TEXT/u,
          'NEW."updatedAt"::TEXT',
        ),
    );
    expectFinding(value, F.EVENT_DIGEST_DRIFT);
  });
});

test("rejects weakened catalog postconditions and ready-index order", async (t) => {
  const catalogCases = [
    [
      "argument defaults",
      "routine.pronargdefaults IS DISTINCT FROM 0",
      "routine.pronargdefaults IS DISTINCT FROM 1",
    ],
    [
      "argument default expression",
      "routine.proargdefaults IS NOT NULL",
      "routine.proargdefaults IS NULL",
    ],
    [
      "variadic routine",
      "routine.provariadic IS DISTINCT FROM 0::OID",
      "routine.provariadic IS NULL",
    ],
    [
      "strict routine",
      "routine.proisstrict IS DISTINCT FROM false",
      "routine.proisstrict IS DISTINCT FROM true",
    ],
    [
      "leakproof routine",
      "routine.proleakproof IS DISTINCT FROM false",
      "routine.proleakproof IS DISTINCT FROM true",
    ],
    [
      "set-returning routine",
      "routine.proretset IS DISTINCT FROM false",
      "routine.proretset IS DISTINCT FROM true",
    ],
    [
      "all-argument type surface",
      "routine.proallargtypes IS NOT NULL",
      "routine.proallargtypes IS NULL",
    ],
    [
      "argument mode surface",
      "routine.proargmodes IS NOT NULL",
      "routine.proargmodes IS NULL",
    ],
    [
      "unexpected overload exclusion",
      "expected_routine.oid <> candidate.oid",
      "expected_routine.oid = candidate.oid",
    ],
    [
      "roles reaching migration owner",
      "WHERE membership.roleid = migration_owner_oid",
      "WHERE membership.roleid <> migration_owner_oid",
    ],
    [
      "roles reached by migration owner",
      "WHERE membership.member = migration_owner_oid",
      "WHERE membership.member <> migration_owner_oid",
    ],
  ];
  for (const [name, before, after] of catalogCases) {
    await t.test(name, () => {
      const value = withCandidateSql();
      replaceCandidateFragment(value, before, after);
      expectFinding(value, F.CATALOG_POSTCONDITION_DRIFT);
    });
  }

  await t.test("ready index is not queue-time ordered", () => {
    const value = withCandidateSql();
    replaceCandidateFragment(
      value,
      '    "tenantId",\n    "availableAt",\n    "createdAt",\n    "id"',
      '    "tenantId",\n    "createdAt",\n    "availableAt",\n    "id"',
    );
    expectFinding(value, F.READY_INDEX_DRIFT);
  });

  await t.test("ready index postcondition checks only the first key", () => {
    const value = withCandidateSql();
    replaceCandidateFragment(
      value,
      "pg_catalog.pg_get_indexdef(target_index.indexrelid)\n       IS DISTINCT FROM expected.\"index_definition\"",
      "pg_catalog.pg_get_indexdef(target_index.indexrelid, 1, true)\n       IS DISTINCT FROM '\"tenantId\"'",
    );
    expectFinding(value, F.READY_INDEX_DRIFT);
  });
});

test("retires both legacy producers before they can read or mutate", async (t) => {
  await t.test("legacy producer performs work before rejection", () => {
    const value = withCandidateSql();
    mutateFunctionBlock(
      value,
      "identity_owner_invite_issue_hold_v1",
      (block) => block.replace("BEGIN\n  RAISE EXCEPTION", "BEGIN\n  PERFORM 1;\n  RAISE EXCEPTION"),
    );
    expectFinding(value, F.LEGACY_PRODUCER_STUB_DRIFT);
  });
  await t.test("legacy producer is not CREATE OR REPLACE", () => {
    const value = withCandidateSql();
    value.candidate.sql = value.candidate.sql.replace(
      'CREATE OR REPLACE FUNCTION public."shared_beta_tenant_activate_v1"',
      'CREATE FUNCTION public."shared_beta_tenant_activate_v1"',
    );
    expectFinding(value, F.LEGACY_PRODUCER_STUB_DRIFT);
  });
  await t.test("legacy producer PUBLIC revoke is missing", () => {
    const value = withCandidateSql();
    removePublicRevoke(value, "identity_owner_invite_issue_hold_v1");
    expectFinding(value, F.ACL_SURFACE_DRIFT);
  });
});

test("pins all six worker-v1 bodies before and after the candidate", async (t) => {
  await t.test("missing postcondition checksum pin", () => {
    const value = withCandidateSql();
    const [, checksum] = v1WorkerProsrcPins[0];
    removeLastOccurrence(value, `'${checksum}'`);
    expectFinding(value, F.V1_WORKER_PROSRC_PIN_MISSING);
  });
  await t.test("v1 worker replacement is forbidden", () => {
    const value = withCandidateSql();
    value.candidate.sql = value.candidate.sql.replace(
      /COMMIT;\s*$/u,
      'CREATE OR REPLACE FUNCTION public."identity_mail_delivery_worker_assert_v1"(p_1 TEXT) RETURNS JSONB LANGUAGE plpgsql AS $body$ BEGIN RETURN NULL; END; $body$;\nCOMMIT;',
    );
    expectFinding(value, F.V1_WORKER_PROSRC_PIN_MISSING);
  });
});

test("rejects all grants and role DDL", async (t) => {
  await t.test("GRANT in comments and error strings is inert", () => {
    const value = withCandidateSql();
    const report = evaluateIdentityMailTenantLockDrainCurrent181Foundation(
      value,
    );
    assert.equal(report.findings.includes(F.FORBIDDEN_GRANT), false);
  });
  await t.test("GRANT", () => {
    const value = withCandidateSql();
    value.candidate.sql = value.candidate.sql.replace(
      /COMMIT;\s*$/u,
      'GRANT EXECUTE ON FUNCTION public."identity_mail_delivery_worker_assert_v2"() TO PUBLIC;\nCOMMIT;',
    );
    expectFinding(value, F.FORBIDDEN_GRANT);
  });
  await t.test("CREATE ROLE", () => {
    const value = withCandidateSql();
    value.candidate.sql = value.candidate.sql.replace(
      /COMMIT;\s*$/u,
      'CREATE ROLE "unexpected_worker";\nCOMMIT;',
    );
    expectFinding(value, F.FORBIDDEN_ROLE_DDL);
  });
});

test("rejects metadata and candidate-chain drift independently", async (t) => {
  await t.test("metadata SQL SHA", () => {
    const value = structuredClone(artifact);
    const metadata = JSON.parse(value.candidate.metadataText);
    metadata.migrationSqlSha256 = "1".repeat(64);
    value.candidate.metadataText = JSON.stringify(metadata);
    expectFinding(value, F.METADATA_DRIFT);
  });
  await t.test("metadata status", () => {
    const value = structuredClone(artifact);
    const metadata = JSON.parse(value.candidate.metadataText);
    metadata.status = "DEPLOYABLE";
    value.candidate.metadataText = JSON.stringify(metadata);
    expectFinding(value, F.METADATA_DRIFT);
  });
  await t.test("predecessor bytes", () => {
    const value = structuredClone(artifact);
    value.predecessor.sql += "\n";
    expectFinding(value, F.CANDIDATE_CHAIN_DRIFT);
  });
  await t.test("missing CURRENT183 successor", () => {
    const value = structuredClone(artifact);
    value.candidates.directoryNames.pop();
    expectFinding(value, F.CANDIDATE_CHAIN_DRIFT);
  });
  await t.test("missing CURRENT181 candidate", () => {
    const value = structuredClone(artifact);
    value.candidates.directoryNames.splice(1, 1);
    expectFinding(value, F.CANDIDATE_CHAIN_DRIFT);
  });
  await t.test("reordered exact successors", () => {
    const value = structuredClone(artifact);
    [
      value.candidates.directoryNames[2],
      value.candidates.directoryNames[3],
    ] = [
      value.candidates.directoryNames[3],
      value.candidates.directoryNames[2],
    ];
    expectFinding(value, F.CANDIDATE_CHAIN_DRIFT);
  });
  await t.test("unknown fifth candidate", () => {
    const value = structuredClone(artifact);
    value.candidates.directoryNames.push(
      "20260802020000_unexpected_candidate",
    );
    expectFinding(value, F.CANDIDATE_CHAIN_DRIFT);
  });
});

test("assertion accepts the frozen candidate and blocks semantic drift", () => {
  const report = assertIdentityMailTenantLockDrainCurrent181Foundation(artifact);
  assert.equal(report.decision, "COMPLIANT");
  assert.equal(report.authorization, false);
  assert.equal(report.canMutate, false);

  const value = withCandidateSql();
  replaceCandidateFragment(value, " SKIP LOCKED", "");
  assert.throws(
    () => assertIdentityMailTenantLockDrainCurrent181Foundation(value),
    (error) => {
      assert.ok(
        error instanceof
          IdentityMailTenantLockDrainCurrent181FoundationError,
      );
      assert.equal(error.exitCode, 3);
      assert.equal(error.report.authorization, false);
      assert.equal(error.report.canMutate, false);
      assert.ok(error.report.findings.includes(F.CLAIM_CONTRACT_DRIFT));
      assert.match(error.report.candidate.sha256, /^[0-9a-f]{64}$/u);
      return true;
    },
  );
});

test("offline self-test requires a compliant baseline and passes fail-closed probes", () => {
  const report = runIdentityMailTenantLockDrainCurrent181SelfTest(artifact);
  assert.equal(report.status, "SELF_TEST_PASSED");
  assert.equal(report.authorization, false);
  assert.equal(report.canMutate, false);
  assert.equal(report.baselineDecision, "COMPLIANT");
  assert.equal(report.probesPassed, 7);
});
