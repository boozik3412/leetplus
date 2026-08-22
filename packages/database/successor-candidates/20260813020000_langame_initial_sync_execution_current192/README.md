# CURRENT192 Langame initial-sync execution candidate

Status: `DORMANT / NONCANONICAL / NOT_DEPLOYABLE / NO RUNTIME GRANTS`.

This successor consumes one unexpired CURRENT191 approval. It introduces a
single-generation execution claim and an atomic selected-Store import:

```text
CONFIRMED approval -> CLAIMED -> COMPLETED
                              \-> EXPIRED
```

The execution RPC accepts only the exact canonical CURRENT191 plan bytes. It
recomputes their SHA-256, validates the complete target, authorization,
products and inventory envelope, re-locks tenant/GO/actor/Store/source/
credential authority, then writes products and one UTC inventory snapshot in
the same database transaction that records `COMPLETED`.

Existing product article, prices, category, supplier, assortment role,
mandatory flag and canonical grouping are preserved. Missing domain products
are not deactivated. Existing inventory rows with a foreign provider binding
are rejected instead of overwritten. Article collisions fail atomically.

An exact retry returns the persisted terminal receipt. A read/reconcile RPC can
prove `CLAIMED`, `COMPLETED` or expire an unexecuted stale claim. Because the
business writes and terminal transition share one transaction, there is no
state in which committed product/inventory effects exist without a committed
completion receipt.

The candidate grants nothing to PUBLIC or application roles, has no route,
scheduler or provider call, and is outside canonical Prisma migrations. It
cannot run in production until a separate role/grant/attestation slice,
production-like rehearsal and explicit cutover authority are accepted.
