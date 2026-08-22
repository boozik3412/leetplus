# CURRENT188 Langame staged onboarding receipt candidate

Status: `DORMANT_FOUNDATION / NONCANONICAL / NOT_DEPLOYABLE / EXTERNAL_PILOT_NO-GO`.

This candidate is intentionally outside `prisma/migrations` and has no
application or `PUBLIC` grants. It does not authorize a production apply,
tenant mutation, tester account, invitation, activation, sync, or outbound
Langame write.

## Contract

The candidate stores an expiring 15-minute staged receipt after the
application has completed one bounded `/clubs/list` diagnostic. The receipt
is bound to the exact tenant, NETWORK actor, request, local Store, Langame
domain, external club, credential digest and configuration digest. Only an
encrypted staged key is stored; provider payload, club name/address, raw key,
email and other PII are absent from receipt and audit rows.

The dormant activation RPC rechecks the consumed SHARED BETA GO decision,
tenant lifecycle, NETWORK actor, local Store and every receipt binding under a
short database transaction. It atomically:

1. claims exactly one global `(LANGAME, domain, externalClubId)` identity;
2. persists the encrypted tenant credential and one integration source;
3. maps only the selected Store;
4. clears staged ciphertext;
5. consumes the receipt and appends a PII-free audit event.

It performs no HTTP request and starts no sync. Exact same activation replay
is read-only and returns `REPLAYED`; changed request/config/tenant/actor/store/
domain/club replay, expired receipts and already claimed clubs fail closed.

An owner-only bounded expiry RPC selects stale `PENDING` receipts with
`FOR UPDATE SKIP LOCKED`, marks them `EXPIRED`, irreversibly clears staged
ciphertext and appends a PII-free audit event. It is not wired to an
application route or scheduler in this dormant candidate.

## Dormant boundary

The application activation route remains unconditional `503`. The staged
preview foundation is also default-off and requires both
`LANGAME_STAGED_ONBOARDING_FOUNDATION_ENABLED=true` and a non-production HMAC
secret of at least 32 characters. Even then, this candidate deliberately
grants no application EXECUTE authority; a later canonical promotion must
bind an exact runtime role/OID and admission policy before enabling it.

The legacy `PUT /integrations/langame/settings` remains available for the
existing internal tenant but is denied for `PILOT/BETA/LIVE` tenants.
