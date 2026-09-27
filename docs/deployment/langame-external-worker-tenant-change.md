# EZ GAME LIVE and data outbound: source-only tenant operation

**State:** source candidate, no production mutation. The owner chose `LIVE` for
the second network. The read-only 27.09 checkpoint still shows `PILOT`, trial
ended 26.09, profile revision 1, execution revision 2, six outbound flags off,
one active `1171.langame.ru` source/club 1 Store, and an inactive unbound
second Store. The exact Store `backgroundExecutionEnabled` remains false.

## Dedicated workflow

The corporate platform-admin controller adds two guarded routes:

- `POST /admin/tenants/:tenantId/external-langame-worker/prepare` with
  `{ "action": "ACTIVATE_LIVE" | "REVOKE_OUTBOUND" }`. It reads current
  tenant/source/Store/profile rows and returns `{plan,planSha256}`. No write.
- `POST /admin/tenants/:tenantId/external-langame-worker/apply` with exact
  `action`, `confirmation: "set-1"`, `planSha256`, UUID `requestId`, specific
  `reason`, and detached `approval`. The service accepts only the pinned
  set-1 tenant/source/Store; no tenant creation or generic external enablement.

Activation requires the single confirmed active source and bound Store, an
`ACTIVE/PILOT` tenant with finite trial, a complete six-module profile and
the exact preimage digest. It moves to `LIVE`, clears the expired trial fields,
increments profile revision 1→2 and execution revision 2→3 through the
database-owned trigger, and enables outbound **only** for `INTEGRATIONS`,
`ASSORTMENT`, and `STAFF`. `GAMIFICATION` remains write-enabled but
outbound-disabled; `COMMUNICATIONS` and `USERS_ROLES` remain outbound-disabled.
Store game background execution is not enabled. Thus the bonus-ledger's
GAMIFICATION+INTEGRATIONS outbound requirement remains denied. Every delta
must be recomputed from fresh rows; the revision numbers above are current
read-only observations, not reusable apply constants.

The apply is one serializable transaction: re-read the same preimage, verify
active platform admin, CAS tenant `updatedAt`/profile/execution/stage,
replace all six module rows, check exactly one trigger revision advance and
write a before/after audit event with request, plan, approval and public-key
digests. Exact request replay returns the saved result without a second
mutation; changed payload under the same request ID conflicts. A stale
plan/source/Store/revision fails before mutation. `REVOKE_OUTBOUND` is a
separate signed action that turns off the same three flags and advances the
execution fence; it does not require the source/Store to remain active.

## Detached approval and production authority

The API accepts no private signing key. Apply fails closed if
`LANGAME_EXTERNAL_TENANT_APPROVAL_PUBLIC_KEY_SPKI_B64` is absent. This API
secret is one line of base64 DER SPKI (not multiline PEM). A separately owned
offline Ed25519 signer must produce this exact statement, serialized as
UTF-8 JSON with two-space indentation and one trailing LF:

```json
{
  "contract": "LEETPLUS_EXTERNAL_LANGAME_TENANT_APPROVAL_V1",
  "tenantId": "8cc79086-ed43-44fa-83d3-20207ec48758",
  "action": "ACTIVATE_LIVE",
  "planSha256": "<fresh prepared lowercase SHA-256>",
  "requestId": "<one UUID>",
  "reasonSha256": "<SHA-256 of two-space JSON string reason plus LF>",
  "issuedAt": "<UTC ISO timestamp>",
  "expiresAt": "<UTC ISO timestamp within 30 minutes>"
}
```

The API payload adds `signature` as base64 Ed25519 over exactly those bytes.
It rejects unknown fields, identity/digest drift, invalid signature and an
expired, future or overlong window. The audit records only the approval digest
and public-key digest, not private material. Existing platform admins cannot
enroll a signing key or self-sign through these routes. The signer and public
key provenance are owned by the controller successor and need independent
review. A signed envelope alone is **not production GO**: the dispatcher
requires the user's fresh direct GO on its exact reviewed operation before
the signer may be used and before apply may run.

## Required release and acceptance sequence

1. Complete PR #246 permission-continuation dependency and this source
   candidate's API/worker CI, independent security review, and immutable app
   artifact. The serving application currently remains f97/gen10.
2. Complete the controller successor with distinct worker service, signed
   grant, exact secret/egress, three-worker continuation, dormant timer and
   accepted app capability marker; preserve the two current INTERNAL workers.
   The predecessor bridge authority gap must be resolved independently.
3. Under the dispatcher, use a fresh exact baseline, backup/restored-copy
   proof, native plan and direct GO to install app/controller capability and
   public-only approval root. Do not infer installation from merge or CI.
4. Prepare a fresh tenant plan, obtain the direct exact tenant GO, sign the
   statement offline and apply the dedicated route once. Verify LIVE,
   profile/execution revisions, only three outbound flags, unchanged Store
   background flag and audit. Revoke with a separately approved signed plan
   if postcheck fails.
5. Separately authorize one bounded set-1 provider canary and the timer
   enrollment. Verify source/Store/day once-only intent/result, allowed
   business and guest reads, permission-only PARTIAL coverage, denied section
   freshness, no provider reward action or cross-tenant writes. A later
   natural timer tick completes runtime acceptance.

Dispatcher queue: `INTAKE-LANGAME-EXTERNAL-WORKER-SET1-20260927`,
`TENANT-LANGAME-SET1-LIVE-OUTBOUND-20260927`,
`CONTROL-LANGAME-EXTERNAL-WORKER-SUCCESSOR-20260927`. The dispatcher task is
`01a0d256-4519-7911-8ac4-b5c5f020d5ff`; this document is not authority
to run any phase.
