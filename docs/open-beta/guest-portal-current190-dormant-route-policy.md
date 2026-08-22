# CURRENT190 dormant application route policy

Date: 2026-08-05
Status: `IMPLEMENTED DORMANT / NONCANONICAL / NOT REGISTERED / PUBLIC CLOSED`

## Outcome

The existing `GuestPortalController` surface now has a separate, exact,
data-first application inventory for the CURRENT190 candidate. The inventory
does not modify or activate the production controller. The companion admission
adapter remains undecorated. A separate candidate Nest controller makes the
persisted logout and tenant-bound media HTTP contracts testable, but an AST
gate proves that it is absent from every Nest module and therefore from the
runtime route surface. Neither candidate is referenced by a production or BFF
route.

This slice did not change:

- `guest-portal.controller.ts` or `guest-portal.module.ts`;
- any web/BFF route;
- the frozen CURRENT190 SQL, session coordinator or repository;
- the legacy public media controller;
- a canonical migration, runtime role, grant, tenant, Store or user.

Production, the current four-club tenant and the prospective external tenant
remain unchanged.

## Classification rules

The four classes are mutually exclusive. Classification is based on the most
dangerous behavior reachable through the handler, not only its HTTP verb.

| Class              | Meaning                                                                 | Candidate adapter decision                                      |
| ------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `READ`             | Guest-bearer route whose reachable operation is session-scoped reading | Calls the persisted authorization port with exact `READ`        |
| `WRITE`            | Guest-bearer route with local state mutation                            | Calls exact `WRITE`, except club rotation remains blocked       |
| `OUTBOUND`         | A path can contact or activate SMS/call/Telegram/Langame communications | Always denied before the authorization port                     |
| `PUBLIC_BOOTSTRAP` | No guest bearer: public projection, auth bootstrap, edge or callback    | Denied until a separately reviewed bootstrap adapter is promoted |

`OUTBOUND` takes precedence even when a handler also reads, writes or can issue
a session. This is why call-status polling and Langame detail lookup are
`OUTBOUND`. Unknown handler, method or canonical path tuples are denied.

## Exact controller inventory

| Handler                               | Method | Canonical path                                                                    | Class              | Required binding       |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------- | ------------------ | ---------------------- |
| `getGamificationClubDirectory`        | GET    | `/guest-portal/gamification/clubs`                                                | PUBLIC_BOOTSTRAP   | PUBLIC_PROJECTION      |
| `getPublicConfig`                     | GET    | `/guest-portal/:tenantSlug/:storeId/public-config`                                | PUBLIC_BOOTSTRAP   | PUBLIC_STORE_ASSERT    |
| `startOtp`                            | POST   | `/guest-portal/:tenantSlug/:storeId/otp/start`                                    | OUTBOUND           | OUTBOUND_ADMISSION     |
| `verifyOtp`                           | POST   | `/guest-portal/:tenantSlug/:storeId/otp/verify`                                   | PUBLIC_BOOTSTRAP   | PERSISTED_ISSUE        |
| `startUserCallAuth`                   | POST   | `/guest-portal/:tenantSlug/:storeId/user-call-auth/start`                         | OUTBOUND           | OUTBOUND_ADMISSION     |
| `getUserCallAuthStatus`               | POST   | `/guest-portal/:tenantSlug/:storeId/user-call-auth/status`                        | OUTBOUND           | OUTBOUND_ADMISSION     |
| `startIncomingCallLast4Auth`          | POST   | `/guest-portal/:tenantSlug/:storeId/incoming-call-last4/start`                    | OUTBOUND           | OUTBOUND_ADMISSION     |
| `verifyIncomingCallLast4Auth`         | POST   | `/guest-portal/:tenantSlug/:storeId/incoming-call-last4/verify`                   | PUBLIC_BOOTSTRAP   | PERSISTED_ISSUE        |
| `startTelegramAuth`                   | POST   | `/guest-portal/:tenantSlug/:storeId/telegram-auth/start`                          | PUBLIC_BOOTSTRAP   | PUBLIC_STORE_ASSERT    |
| `getTelegramAuthStatus`               | POST   | `/guest-portal/:tenantSlug/:storeId/telegram-auth/status`                         | PUBLIC_BOOTSTRAP   | PERSISTED_ISSUE        |
| `getSession`                          | GET    | `/guest-portal/session`                                                           | READ               | PERSISTED_READ         |
| `getGameSummary`                      | GET    | `/guest-portal/session/game-summary`                                              | READ               | PERSISTED_READ         |
| `recordAppOpen`                       | POST   | `/guest-portal/session/app-open`                                                  | WRITE              | PERSISTED_WRITE        |
| `acknowledgeCompletionNotification`   | POST   | `/guest-portal/session/completion-notifications/:notificationId/acknowledge`      | WRITE              | PERSISTED_WRITE        |
| `claimAllRewardWalletItems`           | POST   | `/guest-portal/session/reward-wallet/claim-all`                                   | WRITE              | PERSISTED_WRITE        |
| `claimRewardWalletItem`               | POST   | `/guest-portal/session/reward-wallet/items/:walletItemId/claim`                   | WRITE              | PERSISTED_WRITE        |
| `openRewardWalletLootBoxItem`         | POST   | `/guest-portal/session/reward-wallet/items/:walletItemId/open`                    | WRITE              | PERSISTED_WRITE        |
| `updateProfile`                       | POST   | `/guest-portal/session/profile`                                                   | WRITE              | PERSISTED_WRITE        |
| `openLootBox`                         | POST   | `/guest-portal/session/loot-boxes/:lootBoxId/open`                                | WRITE              | PERSISTED_WRITE        |
| `selectGameClub`                      | POST   | `/guest-portal/session/select-club`                                               | WRITE              | PERSISTED_ROTATE       |
| `exchangeTelegramMiniAppSession`      | POST   | `/guest-portal/telegram-mini-app/session`                                         | PUBLIC_BOOTSTRAP   | PERSISTED_ISSUE        |
| `checkIn`                             | POST   | `/guest-portal/session/check-in`                                                  | WRITE              | PERSISTED_WRITE        |
| `matchLangameGuest`                   | POST   | `/guest-portal/session/langame-match`                                             | OUTBOUND           | OUTBOUND_ADMISSION     |
| `getLangameGuestDetails`              | POST   | `/guest-portal/session/langame-details`                                           | OUTBOUND           | OUTBOUND_ADMISSION     |
| `updateCommunicationPreferences`      | POST   | `/guest-portal/session/communications/preferences`                                | WRITE              | PERSISTED_WRITE        |
| `updateMessengerChannel`              | POST   | `/guest-portal/session/communications/messenger`                                  | OUTBOUND           | OUTBOUND_ADMISSION     |
| `startTelegramLink`                   | POST   | `/guest-portal/session/communications/telegram-link/start`                        | OUTBOUND           | OUTBOUND_ADMISSION     |
| `confirmTelegramLink`                 | POST   | `/guest-portal/telegram/link/confirm`                                             | PUBLIC_BOOTSTRAP   | SERVICE_SECRET         |
| `confirmUserCallAuth`                 | POST   | `/guest-portal/user-call/confirm`                                                 | PUBLIC_BOOTSTRAP   | SERVICE_SECRET         |
| `handleTelegramWebhook`               | POST   | `/guest-portal/telegram/webhook`                                                  | OUTBOUND           | OUTBOUND_ADMISSION     |

Totals: `READ=2`, `WRITE=10`, `OUTBOUND=9`, `PUBLIC_BOOTSTRAP=9`, total `30`.

The TypeScript AST test extracts controller decorators and method names from
the production source. Adding, removing or changing a handler without updating
this manifest fails CI.

## Mandatory promotion blockers

Three application seams are represented explicitly as `BLOCKED`:

1. Candidate `POST /guest-portal/session/logout` exists only in
   `guest-portal-current190-candidate.controller.ts`. It requires an exact
   16–128 character `Idempotency-Key`, forwards it unchanged into persisted
   CURRENT190 revoke and returns no session id or token. The controller is not
   registered, so the route is not active. Browser logout must clear its
   HttpOnly cookie only after this persisted revoke succeeds or exact replay is
   recovered.
2. Candidate `GET /guest-portal/session/media/:id` exists in the same dormant
   controller. It authorizes the bearer against persisted tenant/media facts,
   reads only the exact tenant/id row, bounds bytes to 2 MiB, verifies the
   stored byte count and image signature, and emits a `StreamableFile` with
   `private, no-store`, `nosniff` and same-origin resource policy. It is not
   registered and therefore is not a runtime route.
3. Legacy `GET /public/guest-game/media/:id` remains an ID-only public route
   with immutable public caching. It stays explicitly `BLOCKED` until the
   protected candidate is promoted atomically and the legacy route is removed
   or made unreachable.

The dormant Platform Admin tenant revoke-all coordinator is also implemented
without a decorator, controller, CLI or module registration. It re-attests
fresh platform authority, derives deterministic HMAC-bound batches, validates
every persisted receipt and permits at most one lost-response replay. Its
runtime role and route remain promotion blockers.

Club selection is also denied by the adapter until it uses persisted atomic
rotation. Public bootstrap/session issuance is denied until public Store
projection, abuse controls, edge/callback replay defense and the exact
CURRENT190 issue adapter are reviewed. All `OUTBOUND` routes stay OFF.

## Verification

```powershell
pnpm --filter api test:ci:guest-portal-current190-route-policy
pnpm --filter api lint:ci:guest-portal-current190-route-policy
pnpm --filter api test:ci:guest-portal-current190-application
pnpm --filter api lint:ci:guest-portal-current190-application
pnpm --filter api test:ci:guest-portal-current190
pnpm --filter api lint:ci:guest-portal-current190
pnpm --filter api typecheck
```

Accepted local evidence for this dormant slice:

- unit and AST manifest tests: `2 suites / 41 tests`;
- dormant application/controller/media tests: `3 suites / 32 tests`;
- persisted session plus Platform Admin revoke orchestration:
  `3 suites / 36 tests`;
- focused ESLint: zero warnings/errors;
- API production typecheck: pass;
- exact controller inventory: `30/30`;
- production module registrations of the candidate controller: zero;
- production controller/module imports of the candidate policy: zero;
- legacy public media route remains present and explicitly blocked.

This is engineering evidence for a closed route policy, not route promotion,
deployment approval or external-test readiness.

The companion Web transport candidate is documented in
[CURRENT190 dormant Web BFF candidate](./guest-portal-current190-bff-candidate.md).
It is deliberately absent from the active catch-all Route Handler; therefore
the existing cookie-only logout and legacy public media BFF remain promotion
blockers rather than silently activated behavior.
