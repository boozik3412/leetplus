# CURRENT190 dormant Web BFF cutover candidate

Date: 2026-08-05
Status: `IMPLEMENTED DORMANT / NOT IMPORTED / NOT DEPLOYABLE / PUBLIC CLOSED`

## Outcome

The Web application now has a pure, testable candidate for the two transport
changes that must be switched atomically with the CURRENT190 API/runtime
promotion:

- `POST /guest-portal/session/logout` forwards the HttpOnly-cookie token as a
  bearer, requires the caller's exact 16-128 character idempotency key, and
  permits cookie deletion only after an exact persisted `REVOKED` receipt;
- `GET /guest-portal/session/media/:id` forwards the bearer only to the
  tenant-bound CURRENT190 API route and returns at most 2 MiB of JPEG, PNG or
  WebP bytes after content-length and file-signature validation.

The candidate accepts no other path or method. Both upstream requests use
`cache: no-store`, `credentials: omit` and `redirect: error`. Browser
responses are `private, no-store`, `nosniff` and same-origin. Upstream error
bodies are consumed with a fixed bound and are never reflected to the browser.
Tokens, tenant identifiers, session identifiers and upstream diagnostics are
not returned by the adapter.

## Dormancy proof

The implementation lives in
`apps/web/src/lib/guest-session-current190-bff-candidate.ts`. It exports the
literal `GUEST_SESSION_CURRENT190_BFF_CANDIDATE_ACTIVE = false` and is not
imported by any active Route Handler. The existing catch-all BFF therefore
still performs cookie-only logout, while the legacy public media BFF remains
unchanged. The test deliberately asserts this gap so that candidate
implementation cannot be confused with runtime activation.

No production route, tenant, Store, account, invite, cookie, provider or
current four-club network was changed.

## Verification

```powershell
pnpm --filter web test:guest-session-current190-bff-candidate
pnpm --filter web test:pilot-bff-boundary
pnpm --filter web test:guest-session-transport
pnpm --filter web typecheck
```

Accepted local evidence: `6/6` candidate tests, `4/4` BFF inventory tests,
`2/2` guest-cookie transport tests, focused ESLint and Web typecheck.

## Promotion blockers

This file must not be imported by a Route Handler until all of the following
are accepted together:

1. CURRENT180-190 form one reviewed canonical release;
2. CURRENT190 execute-only database grants and runtime OID attestation pass;
3. the API candidate controller is registered with persisted issue/assert/
   rotation/revoke authority;
4. the legacy public ID-only API and `force-cache` BFF media paths are removed
   or made unreachable in the same release;
5. logout success/replay, media isolation, suspension and kill-switch browser
   journeys pass for Tenant A and Tenant B;
6. production-like apply, rollback and zero-diff rehearsals pass, followed by
   explicit production and shared-beta GO decisions.

Until then this is engineering evidence only, not external-test readiness.
