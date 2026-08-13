# CURRENT199 owner-only trust-registration ledger candidate

Dormant noncanonical successor. It persists an already prepared, process-branded
CURRENT199 initial registration before any enrollment effect. The candidate
enforces one generation-1 registration per database OID, exact replay after a
lost response, immutable bindings, append-only `REGISTERED/EXPIRED` events and
owner/database identity checks.

This migration intentionally has no apply, rotation or revocation function and
grants no application/runtime role. It does not verify signatures or acquire
public keys: the future adapter must accept only a genuine CURRENT199 process
brand, while protected key/TLS provenance remains bound by its digests.
