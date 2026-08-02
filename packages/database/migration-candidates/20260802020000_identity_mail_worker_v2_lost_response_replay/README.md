# CURRENT184 worker-v2 lost-response replay candidate

Status: `IMPLEMENTED_CANDIDATE_NOT_CANONICAL / NOT_DEPLOYABLE /
NO_APPLY_AUTHORIZATION`.

This candidate is a disposable-rehearsal artifact above the exact frozen
CURRENT183 stack. It remains outside `prisma/migrations` and does not change
the canonical CURRENT179 production schema.

It closes the database lost-response ambiguity for the two provider
settlement calls without retrying SMTP:

- `IdentityMailDeliveryEvent` gains nullable `transitionRequestDigest` and
  `settlementState` evidence with a paired format/event-type check;
- a tenant-scoped partial unique index admits one event for an exact settlement
  request digest;
- the existing provider-mark and completion signatures replay immutable event
  evidence after an unknown database outcome;
- a provider marker that is no longer reusable returns an explicit `HANDOFF`
  receipt rather than attempting another provider call;
- worker readiness is pinned to the exact CURRENT184 migration receipt while
  `authorization=false` and `canSend=false` remain fail closed.

The prior provider-mark and completion bodies are preserved as the exact
owner-only `*_current183` implementation helpers. The same-signature v2
wrappers are the only public worker surface; the helpers have no non-owner
grant and are forbidden from API runtime source. The five worker RPCs and the
reconcile RPC otherwise retain their signatures.

The candidate creates no role, grants no authority, enrolls no tenant, wires
no runtime worker, sends no email, and contains no production trust root.

The SQL SHA-256 is:

```text
d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424
```
