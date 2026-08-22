# CURRENT190: persisted public guest session boundary

Date: 2026-08-05
Status: `DORMANT_FOUNDATION / NONCANONICAL / NOT_DEPLOYABLE / GATE1MT NO-GO`

## Outcome

CURRENT190 closes the design gap behind public guest gamification without
opening a public route. It introduces a candidate-only persisted session
contract and a default-off application coordinator. Neither is registered in
the Nest module, present in canonical Prisma migrations/schema, granted to an
application role, or deployable to production.

The current internal network of four clubs remains unchanged. No external
tenant, owner, tester account, password, invite, Langame credential, OTP,
Telegram identity or media permission was created.

## Why the existing runtime is not sufficient

The existing guest token is signed and carries `tenantId`, `storeId`,
`profileId` and `guestId`; token verification also rechecks active tenant and
Store. This is useful, but not yet a multi-tenant public admission boundary:

- the token is stateless and has no persisted `sid/ver/jti` lifecycle;
- profile, guest and phone identity are not revalidated as one exact binding;
- GAMIFICATION entitlement, onboarding stage and trial window are not checked
  for every public session action;
- club selection issues a new token without transactionally invalidating the
  old one;
- `GET /public/guest-game/media/:id` authorizes only by opaque asset id and
  does not bind the asset tenant to a guest session;
- public-config and club directory still need a promoted safe projection;
- several session reads/writes have hidden sync, delivery, Telegram, messenger
  or Langame side effects and require route-level review before admission.

Therefore all current guest-portal and public media routes remain
`PUBLIC_GAP/BLOCKED` in Gate1MT.

## Candidate contract

The candidate SQL surface is
`GUEST_PORTAL_SESSION_CURRENT190_V1` and contains:

- `GuestPortalSessionV1`: opaque session id, monotonic token version, HMAC
  digest of `jti`, database-only phone-binding digest, session-specific
  binding digest, expiry and terminal rotation/revocation state;
- `GuestPortalSessionAuditV1`: append-only, PII-free issue/rotate/revoke
  evidence;
- `GuestPortalTenantSessionFenceV1`: one persistent `DRAINING/CLOSED` admission
  fence per tenant;
- `GuestPortalTenantSessionRevokeBatchV1`: immutable, PII-free bounded-batch
  receipts with exact replay identity and cumulative counters;
- sealed issue, assert, rotate, per-session revoke, tenant-wide revoke-all,
  public Store and media RPCs;
- immutable row/audit triggers and owner-only ACL postconditions;
- one central canonical UUID/version/64hex validator invoked by every session
  and media RPC;
- a tenant-aware audit foreign key from `(tenantId, sessionId)` to the exact
  session `(tenantId, id)`.

The browser-facing JWT and coordinator responses contain no raw phone,
`phoneHash`, email, stable phone-derived digest or outward binding digest.
Only `sid`, version, `jti` and exact tenant/Store/profile/guest identifiers are
signed. The database derives the phone-binding digest internally from the
current `GuestGameProfile.phoneHash`; it is never returned, logged or written
to audit. Independent sessions for the same profile receive distinct `sid`,
`jti` and session binding digests.

All four CURRENT190 relations have `ENABLE/FORCE ROW LEVEL SECURITY`. Sealed
RPCs set transaction-local primary/peer tenant scope, while table, column and
routine ACLs remain owner-only with zero `PUBLIC` or application grants.

Every session assertion reads fresh database state and denies unless all of
the following hold:

1. tenant is external (`PILOT/BETA/LIVE`), `ACTIVE`, and in an admitted
   onboarding stage;
2. PILOT/BETA trial contains database server time;
3. the complete six-module entitlement profile is revision-coherent;
4. GAMIFICATION `READ` or `WRITE`, as requested, is enabled and valid;
5. Store belongs to the exact tenant, is active and has gamification enabled;
6. active profile belongs to the exact tenant and matches guest and phone;
7. optional guest belongs to the exact tenant and is not disabled;
8. persisted `sid/ver/jti` and every signed-token binding digest match;
9. the session has not expired, rotated or been revoked.

All sealed session RPCs acquire locks in the same order: Tenant, persistent
fence, entitlements ordered by module/id, Store, profile, optional guest, and
then the session row. Issue/assert/rotate require the complete six-module
active admission state and absence of a tenant fence. Per-session revoke uses
the same ownership locks but intentionally remains a terminal operation when
tenant/Store/profile/guest state is suspended or disabled, including behind a
fence. Database time is refreshed after lock waits before validity, expiry or
terminal timestamps are accepted. The PostgreSQL concurrency fixture changes
tenant, entitlement, Store and guest state while authorization is blocked;
authorization resumes with `42501`, with no `40P01` deadlock.

Only `READ` and `WRITE` exist in this candidate. `OUTBOUND` is rejected.
Session lifetime is 15 minutes in the coordinator and cannot exceed 60 minutes
in SQL.

Rotation locks both tenant keys in deterministic order, creates the next
session/version and marks the previous session `ROTATED` in the same database
transaction. Normal reuse of the old token is denied. Only the exact same
opaque rotation request may be replayed to recover the already-created next
token; any changed replay is denied. Revocation follows the same exact replay
rule. Initial rotation and replay also require the live source and target
profiles to have the same database-only phone-binding digest. A session for
`phone1` therefore cannot be rotated into a `phone2` identity, even when both
tenant scopes are otherwise fully admitted.

Per-session revocation validates the exact persisted `sid/ver/jti/binding`,
then records a terminal state even during suspension, inactive Store/profile,
disabled Guest or changed live phone binding. Replaying the same revoke is
idempotent; after reactivation the revoked session remains denied.

Tenant-wide administrative revoke-all now exists as a separate sealed,
owner-only SQL RPC. It takes `Tenant FOR UPDATE`, establishes a persistent
fence, revokes at most `1..500` active sessions per call in stable id order,
refreshes terminal database time after all waits, and writes one PII-free
`REVOKED` audit event per changed session plus one immutable batch receipt.
The receipt guard proves batch sequence, cumulative count, current active
count and exact session/audit completeness against the locked fence. The same
tenant/fence/batch request replays byte-equivalent persisted facts; changed
replay, a second fence request and any new batch after `CLOSED` are rejected.
There is deliberately no fence-release RPC in this candidate: offboarding is
terminal until a separately designed recovery policy exists.

If issue or rotation already holds the Tenant share lock, revoke-all waits,
then revokes the newly committed active session. If revoke-all holds the
Tenant update lock first, waiting issue/rotation resume only after the fence is
visible and fail with `42501`. In all accepted races the committed fence has
zero active sessions and PostgreSQL records neither `40P01` nor an increased
deadlock counter.

Public media authorization first asserts the persisted guest session and then
admits only an asset whose `tenantId` equals the session tenant. The existing
ID-only controller is intentionally not wired to it.

## Current public route decision

| Surface                                               | Current decision | Required before opening                                                    |
| ----------------------------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| club directory                                        | blocked          | bounded public projection, entitlement/lifecycle filtering, privacy review |
| public config                                         | blocked          | promote CURRENT190 public Store RPC and safe response allowlist            |
| OTP, incoming/user call                               | blocked/outbound | provider lost-response, abuse/rate limits, candidate promotion             |
| Telegram auth/Mini App/webhook/link                   | blocked/outbound | shared bot tenant binding, webhook replay defense, kill switch             |
| session/game summary                                  | blocked          | remove or gate hidden activity/Langame scheduling; READ permit             |
| profile, rewards, lootboxes, check-in, club selection | blocked          | method-level WRITE permit plus ledger/wallet regression                    |
| communication preferences                             | blocked          | exact module/action classification and consent audit                       |
| messenger/Langame details and match                   | blocked/outbound | explicit outbound admission and circuit breaker                            |
| legacy public media by id                             | blocked          | atomically replace with the dormant bearer-bound route                     |
| candidate session media                               | blocked/dormant  | canonical/runtime admission, module wiring and cutover rehearsal           |

The exact 30-handler split and the candidate-only fail-closed adapter are
documented in
[CURRENT190 dormant application route policy](./guest-portal-current190-dormant-route-policy.md).
The route-policy adapter remains absent from the production controller and
module. It admits only an exact persisted `READ` or local `WRITE` tuple in
isolation tests; unknown, `OUTBOUND`, public bootstrap and club rotation paths
are denied. A separate candidate Nest controller now defines persisted
`POST /guest-portal/session/logout` and bearer-bound
`GET /guest-portal/session/media/:id`, with exact idempotency and private
no-store transport contracts. AST/DI gates prove that this controller is absent
from every Nest module, so neither route is active. The legacy ID-only public
media route remains unchanged and explicitly blocked until atomic cutover.

A dormant Platform Admin revoke-all coordinator now re-attests fresh authority,
drives deterministic bounded batches, validates exact cumulative receipts and
contains a single ambiguous lost-response retry. It has no decorator,
controller, CLI or module registration. Canonical migration, execute-only
runtime grants/attestation and production-like apply/rollback remain mandatory
before either application adapter can be promoted.

The Web side now also has a dormant, unimported cutover candidate. It forwards
only exact persisted logout/media requests, clears the HttpOnly cookie only
after an exact `REVOKED` receipt, bounds upstream bodies and validates private
media bytes. Its active flag is a literal `false`, and the current Route
Handler remains unchanged. See
[CURRENT190 dormant Web BFF candidate](./guest-portal-current190-bff-candidate.md).

## Verification evidence

Completed locally in two independent clean PostgreSQL 16 databases restored
from the CURRENT188 template:

- candidate migration applied successfully;
- A/A1 and B/B1 smoke passed and rolled back with zero
  session/audit/fence/batch residue;
- bidirectional tenant, Store, profile, guest and media substitution was
  denied;
- changed live profile phone binding was denied by assert, rotation/replay and
  media authorization; exact terminal revoke remained available;
- cross-tenant `phone1 -> phone2` rotation was denied, while a cross-tenant
  rotation between two profiles with the same live phone binding passed;
- decoded JWTs, coordinator responses and audit rows contained no phone,
  `phoneHash`, email or stable phone-derived correlator; two independent
  sessions for one profile had distinct outward session identifiers;
- owner-only table/column/routine ACLs and `FORCE RLS` policies were attested;
- ambiguous `(tenantSlug, store locator)` resolution was denied;
- suspended tenant, expired trial, inactive Store/profile and disabled
  GAMIFICATION WRITE were denied from fresh state;
- concurrent suspension, GAMIFICATION WRITE disable, Store deactivation and
  guest disable were observed after lock wait and denied with `42501`; the
  database deadlock counter did not increase and no path returned `40P01`;
- terminal revoke and exact replay succeeded while tenant, entitlement, Store,
  profile, Guest and phone state were disabled/changed; reactivation did not
  revive the revoked session;
- hostile direct SQL calls with `NULL`/malformed session UUID, token version,
  `jti` or binding digest were rejected before admission;
- the catalog and a hostile insert proved that audit tenant/session ownership
  is enforced by a composite foreign key;
- issue replay, cross-tenant exact rotation, changed replay denial, old-token
  denial and revoke replay passed;
- tenant-wide revoke-all drained three active sessions through three
  one-session batches; exact replay, changed replay, changed fence and a new
  batch after `CLOSED` were exercised;
- a cross-tenant batch-id collision rolled back the fence, session changes and
  audit atomically; hostile direct fence/batch writes were denied;
- batch receipts, per-session terminal rows and append-only audit counts were
  proven complete and PII-free;
- concurrent admitted issue/rotation versus revoke-all and fence-first issue
  plus rotation were all exercised; every closed fence had zero active
  sessions, no path returned `40P01`, and the deadlock counter stayed zero;
- direct table/audit/fence/batch mutation was denied;
- focused application tests: 2 suites / 17 tests passed;
- independent-client PostgreSQL lock/fence acceptance: 1 suite / 7 tests
  passed in each clean rehearsal;
- static candidate contract: 11 tests passed;
- API production typecheck and focused ESLint passed.

Frozen candidate SQL SHA-256:
`d23c0e8fbdfddd0eb9ec7a73d877e7bbcde8c170683247a66f43530cca3867d5`.

The concurrency acceptance is implemented in
`apps/api/test/guest-portal-session-current190.pg.integration-spec.ts`. It is
opt-in and rejects production or any database name outside
`^lp_guest190_[0-9a-f]{32}_ci$`.

```powershell
node --check packages/database/scripts/guest-portal-session-current190-foundation.test.mjs
node --test packages/database/scripts/guest-portal-session-current190-foundation.test.mjs
pnpm --filter ./apps/api exec jest --ci --runInBand --runTestsByPath src/guest-portal/guest-portal-session-current190.repository.spec.ts src/guest-portal/guest-portal-session-current190.coordinator.spec.ts
pnpm --filter ./apps/api typecheck

$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55432/lp_guest190_<32hex>_ci?schema=public'
$env:GUEST_PORTAL_CURRENT190_PG_CONFIRM='run-guest-portal-current190-postgres-lock-freshness'
pnpm --filter ./apps/api exec jest --config ./test/jest-pg-integration.json --ci --runInBand --runTestsByPath test/guest-portal-session-current190.pg.integration-spec.ts
```

This evidence is candidate acceptance only. It is not a production or public
route GO.

## Promotion sequence

1. Resolve and freeze CURRENT189, then rebase/refreeze CURRENT190 checksum.
2. Independently review the permanent-fence and audit-completeness contract,
   then bind revoke-all to an explicit administrative capability.
3. Promote the SQL into one reviewed canonical migration with rollback and
   zero-diff rehearsal.
4. Create and attest an execute-only runtime database role/OID; keep tables
   unreadable and RPCs uncallable by `PUBLIC`.
5. Register the coordinator behind a separate production-ready feature gate
   with strong independent JWT/HMAC secrets, issuer and audience attestation.
6. Review and promote the dormant exact `READ`/`WRITE`/`OUTBOUND`/
   `PUBLIC_BOOTSTRAP` manifest; keep outbound and unknown classes off.
7. Wire session-bearing non-outbound routes one at a time and run ledger,
   wallet, lootbox, Battle Pass and media isolation regression.
8. Complete production-like apply/rollback, Gate1MT, Gate2 and explicit
   `SHARED BETA GO` before creating or sending the external owner invite.
9. Expose the tenant-wide revoke-all RPC only through the reviewed admin
   adapter; keep the guest-token revoke RPC unavailable as a bulk control and
   keep fence release absent until separately approved.
