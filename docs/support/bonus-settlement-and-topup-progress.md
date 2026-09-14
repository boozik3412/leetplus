# Bonus settlement and cumulative-card progress

Source repair prepared 14.09.2026 for LP-BUG-3B291153, LP-BUG-E84BBCA0 and the
Holmogorova guest report about an800 RUB top-up. This document describes the
new source contract; the serving release remains the separately recorded
production baseline until admitted rollout and postcheck.

## Domain facts and payment routing

Langame balance top-ups are domain-scoped facts. Their source event and
`GuestGameReward.storeId` may remain NULL. They must not acquire an invented
physical origin club merely to satisfy the background worker.

On a fresh authenticated guest reward claim, the same SERIALIZABLE transaction
that accepts the claim resolves a payment club and persists it on
`GuestGameRewardWalletItem.storeId`. It uses the verified guest-session club,
re-read under the reward's tenant and Langame domain. An existing binding wins
on retry; it is never silently moved. If the session club cannot be used, only
one active matching-domain Store is an admissible fallback. Multiple candidates
return a readable error before claim acceptance. New-play feature flags do not
cancel already-earned rewards; existing tenant/outbound/worker gates remain intact.

The transaction writes `BONUS_SETTLEMENT_BOUND` without phone, token or provider
secret. The source reward/event remains unchanged. A previously accepted claim
without a binding is not silently repaired during retry: its amount and
historical eligibility first require the incident reconciliation below.

`queueApprovedRewards` uses the exact PROCESSING wallet belonging to the same
tenant, reward and profile, and revalidates its active Store/domain. The ledger
keeps the existing `guest-game-reward:<rewardId>:bonus:v1` idempotency key and
stores `settlementBinding=GUEST_WALLET_CLAIM_V1`, wallet ID and payment Store ID.
Store-scoped queues match either the source Store or this exact wallet Store.

Before external delivery, marked entries revalidate the Store/domain and exact
wallet/profile/Store tuple. A mismatch stops before Langame. `TENANT_STORE_SYSTEM`
still requires a concrete ledger Store; the repair does not weaken this guard,
create a new scheduler or share corporate authority with public guest HTTP.

## Progress shown to a guest

Top-up and product-purchase missions may include activity after activation of
the rule without requiring an earlier game open. Their displayed progress uses
the same boundary. Other gameplay missions remain bounded by the profile's
game activation. Shared queries stay tenant/identity-scoped and bounded; each
mission additionally filters its own events and completion rewards by its own
history start, store, domain and period.

For the reported guest, five qualifying top-ups must show5/10. The old display
excluded three800 RUB top-ups before first game open and showed2/10. This repair
does not itself qualify or pay the card: ten distinct operations of at least500
are still required; a single5000 operation counts once.

## Historical payment recovery

The initial incident inventory found14 claimed, unattempted, storeless ledger
entries for9 profiles. Its nominal4200 is not automatically the amount due.
An independent cycle audit established nine unambiguous entries totalling1700
(eight Battle Pass150 and one valid ten-top-up card500). Five restored card
entries for Novikov total2500 and overlap historical canceled reward cycles.
They require the owner's explicit decision on the previously agreed one-time
compensation, rather than automatic payout or cancellation as ordinary cards.

Recovery must have a fresh exact inventory, backup/off-host/restored-copy proof
and an audited plan. For each accepted item verify tenant/profile/source domain,
rule evidence and amount, prior accepted claim, reward APPROVED, wallet PROCESSING,
ledger PENDING with zero provider attempts and no confirmed/ambiguous response,
one ledger per reward and a trusted claim-club audit (or unambiguous domain Store).

Bind only the existing wallet and ledger, retaining all reward, event, effect,
idempotency and provider-target identities. Do not replay the top-up or create
a second reward. The first bounded delivery is checked to CONFIRMED, PAID and
CLAIMED before the remainder. Replays of the repair require its own completed
audit and produce zero new bindings/payments. Never reset uncertain provider
dispatch to PENDING.

Already waiting-but-unclaimed rewards use the repaired normal claim path;
support must not pretend that the guest pressed «Забрать». Old pre-activation
canceled rows excluded from earlier compensation are not automatically revived.

Auth-call timeouts in the same report remain a separate diagnosis: unconfirmed
provider calls do not prove a post-verification login defect and are not fixed
by changing wallet, profile or JWT security policy.
