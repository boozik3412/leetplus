# CURRENT190 persisted guest portal session boundary

Status: `DORMANT_FOUNDATION / NONCANONICAL / NOT_DEPLOYABLE / PUBLIC_GAME_NO-GO`.

Frozen SQL SHA-256:
`d23c0e8fbdfddd0eb9ec7a73d877e7bbcde8c170683247a66f43530cca3867d5`.

This candidate is intentionally outside `prisma/migrations`. It changes no
canonical Prisma model, grants no authority to `PUBLIC` or an application
role, enables no controller, and authorizes no production apply. The current
four-club internal network, the external tester, Telegram, OTP/SMS, messenger,
Langame calls and schedulers are untouched.

## Sealed contract

`GuestPortalSessionV1` persists an opaque session id, monotonic token version,
HMAC digest of `jti`, a database-only digest of the already-pseudonymous
profile phone hash, and a session-specific binding digest. The signed JWT and
all coordinator responses contain no raw phone, `phoneHash`, email,
phone-derived digest, or outward stable contact correlator. The database
recomputes the live phone binding internally from `GuestGameProfile.phoneHash`
on assert, rotation/replay and media authorization. It binds one signed guest
token to exactly one active external tenant, active gamification-enabled
Store, active `GuestGameProfile`, and its exact optional `Guest`.

Every issue/assert/rotate call re-evaluates the database state rather than
trusting a URL slug or stale token:

- tenant lifecycle is `ACTIVE`, onboarding is `ONBOARDING`, `READY` or
  `ACTIVE`, and stage is `PILOT`, `BETA` or `LIVE`;
- PILOT/BETA trial dates exist and contain database server time;
- the complete six-module profile and its revisions are coherent;
- GAMIFICATION `READ`/`WRITE` is enabled and in its validity window;
- Store belongs to the tenant, is active and has gamification enabled;
- profile, optional guest and phone binding match exactly inside that tenant.

Admission takes row locks in one order: Tenant, persistent tenant fence, all
six entitlements in stable module/id order, Store, profile, optional guest,
and only then the session.
Time windows and session expiry are evaluated from database time after the
relevant lock wait. A concurrent suspension, entitlement disable, Store
deactivation or guest disable therefore becomes a denial, never a stale
permit.

Per-session revoke is deliberately terminal rather than active-state admitted.
It takes the same Tenant -> fence -> ordered entitlements -> Store -> profile
-> optional Guest -> session lock order and proves exact row ownership plus persisted
`sid/ver/jti/binding`, but it remains available while those rows are
suspended, inactive or disabled. Thus a logout can be persisted during an
incident and the revoked session does not revive after reactivation.

The separate owner-only administrative revoke-all RPC takes Tenant
`FOR UPDATE`, installs a persistent `DRAINING/CLOSED` fence, and revokes at
most `1..500` active sessions per deterministic batch. Every changed session
gets a PII-free terminal audit event and every batch gets an immutable receipt
whose sequence, cumulative totals, active count and exact session/audit
completeness are enforced by a guard trigger. Exact batch replay returns the
persisted receipt; changed replay, a changed fence request and a new batch
after `CLOSED` fail closed. The candidate deliberately has no fence-release
RPC.

`OUTBOUND` is not an accepted action. Session expiry is at most 60 minutes.
Rotation creates the next persisted `sid/ver/jti` and marks the old session
`ROTATED` in one transaction. Reusing the old token fails. Exact rotation and
revocation requests are replay-safe; changed replays fail closed. Audit rows
are append-only and contain no raw phone, `phoneHash`, email, JWT, `jti`, or
phone-derived digest. Their binding digest is session-specific; two
independent sessions for one profile do not share an outward binding
identifier.

All persisted binding inputs pass one fail-closed validator before admission:
canonical lowercase UUID, non-null positive token version, and two non-null
64-character lowercase hexadecimal digests. This removes SQL three-valued
logic as a possible `NULL` bypass. Audit evidence has a composite
`(tenantId, sessionId)` foreign key to the session's `(tenantId, id)`, so an
audit event cannot reference another tenant's session.

Cross-tenant rotation is allowed only when the source session's persisted
phone binding still matches its live source profile and the live source and
target profiles resolve to the same database-only phone-binding digest. This
continuity check runs before both the first rotation and exact replay, so a
token for one person cannot be moved to another person's profile.

All four candidate relations have `ENABLE/FORCE ROW LEVEL SECURITY` tenant
policies. Sealed RPCs set transaction-local primary/peer tenant scope (the
peer is used only by atomic cross-tenant rotation). Table, column and routine
ACLs are owner-only; there are no application or `PUBLIC` grants.

The media RPC first asserts the persisted session and then admits only a
`GuestGameMediaAsset` owned by the same tenant. The legacy public ID-only media
route remains blocked and is not wired to this candidate.

## Promotion prerequisites

Canonical promotion requires, at minimum:

1. CURRENT189 predecessor resolution and a reviewed canonical migration;
2. independent review of the permanent-fence, bounded-batch and audit
   completeness contract;
3. a separately attested runtime database role/OID with execute-only grants;
4. production secret and issuer/audience validation;
5. route-by-route Gate1MT classification and a fail-closed controller guard;
6. explicit confirmation that OTP/SMS, Telegram, messenger, Langame and
   scheduled/outbound routes remain disabled;
7. apply/rollback/zero-diff rehearsal before any production admission.
8. an admin-authorized application adapter for the sealed revoke-all RPC;
   direct guest-token access and fence release remain forbidden.
