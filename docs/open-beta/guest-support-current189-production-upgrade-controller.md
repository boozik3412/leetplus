# Guest-support CURRENT_188 → CURRENT_189 production controller

Updated: 01.09.2026.

This runbook is the only admitted database path for the concise bug-report and
multipart-envelope repair. It changes one check constraint, replaces one
readiness function body/comment and writes one exact Prisma migration receipt.
It does not modify guest tickets, role memberships, object owners or ACLs.

## Preconditions

- one exact merge SHA has green Fast CI and Full Release Admission;
- the immutable artifact is hydrated and sealed at
  `/srv/leetplus/releases/<sha>`;
- restored-copy runtime acceptance for that exact artifact is `PASS`;
- both blue/green slots run that same SHA in `COMBINED` mode with bug reporting
  `OFF` and `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_188`;
- both slots attest source `188` and target `189`; the old release is not a
  rollback authority;
- a fresh production backup and an isolated CURRENT_188 rehearsal exist;
- the approval public key digest is independently pinned and its private key is
  kept off the production host.

The controller rejects a TCP URL and database password. It uses only the local
PostgreSQL Unix socket as OS user `postgres`, from a root-owned transient
systemd service with no capabilities and `AF_UNIX` only.

## Manifest

The root-owned mode `0600` JSON has this exact shape:

```json
{
  "approval": {
    "keyId": "current189-production-approval",
    "maxPlanAgeSeconds": 300,
    "publicKeyPem": "<Ed25519 SPKI PEM>",
    "publicKeySpkiSha256": "<sha256>"
  },
  "contractVersion": "GUEST_SUPPORT_PRODUCTION_188_TO_189_V1",
  "operation": { "timeoutSeconds": 180 },
  "release": {
    "artifactRoot": "/srv/leetplus/releases/<sha>",
    "releaseSha": "<sha>"
  },
  "target": {
    "databaseName": "leetplus",
    "port": 5432,
    "socketDirectory": "/var/run/postgresql",
    "systemIdentifier": "<exact pg_control_system identifier>"
  }
}
```

## Controlled sequence

All commands use the controller shipped inside the exact artifact. Never copy a
new script into a sealed release.

1. Run `--mode inventory`. It is read-only and must report exactly source
   `188/20260828190000_guest_support_bug_reports`.
2. Run `--mode plan` while both slots and production-control are stable. The
   plan is exclusive-created, signed by the exact bridge/runtime/database
   evidence and expires in five minutes.
3. Copy the plan to the offline approval host, run `--mode approve`, then copy
   only the signed approval back.
4. Run `--mode apply` with the exact plan digest and a new receipt path. The
   controller holds production-control and cutover locks, stops the autonomous
   bonus-ledger timer/service, rechecks all evidence, writes a durable intent,
   applies only migration SHA-256
   `5ef51551b6f2415584dd11202d88cb2d4102f622ca5d248b9393fcf372f8ec82`
   in one transaction, verifies `189`, both runtime slots and unchanged
   OID/owner/ACL/membership digests, and restores the worker state.
5. Run `--mode check --plan <same-plan>` after a lost terminal/SSH response.
   It is read-only and does not repeat DDL.
6. Restart both slots with bridge `OFF` and bug reporting `LIVE`, verify exact
   CURRENT_189 readiness, submit one 20-character report with one valid image,
   verify tenant/platform visibility, then run the bounded public/authenticated
   soak.

The CLI emits only bounded reason codes and aggregate digests. It never prints
database contents, credentials, HTTP bodies or attachment bytes.

## Fail-closed and recovery rules

- Unknown, partial or already-different migration state blocks before DDL.
- Any drift in artifact, plan, active/rollback slot, cutover receipt,
  production-control generation, database system identifier, object authority
  or worker state blocks.
- Once exact CURRENT_189 is observed, do not attempt a schema rollback. Both
  runtime slots already contain the target code; disable bug reporting if an
  application-level kill switch is needed.
- If worker restoration fails, the command fails even after a successful DDL;
  inspect the durable receipt and restore the exact prior timer state before
  declaring success.
- Old CURRENT_188 application artifacts are not valid rollback targets after
  the migration because their exact-head readiness must fail.
