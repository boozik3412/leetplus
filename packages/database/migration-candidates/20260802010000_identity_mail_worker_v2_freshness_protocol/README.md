# CURRENT183 worker-v2 freshness protocol candidate

Status: `IMPLEMENTED_CANDIDATE_NOT_CANONICAL / NOT_DEPLOYABLE /
NO_APPLY_AUTHORIZATION`.

This candidate is a disposable-rehearsal artifact above the exact frozen
CURRENT182 stack. It is intentionally outside `prisma/migrations` and does not
change the canonical CURRENT179 production schema.

It makes two narrowly scoped changes:

- the shared tenant advisory lock now requires a read-write `READ COMMITTED`
  transaction so a separately completed lock statement is followed by a fresh
  snapshot on the data-reading RPC statement;
- `identity_mail_delivery_worker_assert_v2` requires and reports exact
  CURRENT183 migration head/count/checksum evidence.

The existing five worker-v2 signatures and receipts remain unchanged. The
candidate creates no worker or coordinator role, grants no non-owner EXECUTE,
creates no tenant enrollment and sends no email. Runtime must execute the lock
as a complete statement before the next RPC statement; calling an RPC without
that outer sequence is not accepted as freshness evidence.

The SQL SHA-256 is:

```text
a3b92838cac386480384abb770aa06a9f2cb27b4326d5c6f9344f9019b26f2f0
```

ACTIVE/DRAINING setup is deliberately not fabricated here. Existing
CURRENT180 command/event/enrollment guards remain intact. A later signed
coordinator candidate must be the only path used to create those rows before
non-empty PostgreSQL fixtures can claim authority-preserving coverage.
