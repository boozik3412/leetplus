# Production incident: Langame egress and domain routing recovery

Date: 27–28.08.2026

Status: resolved; production is healthy on the reviewed blue release
Scope: public Guest Game Hub, Langame-backed check-in/session facts and missed
gamification qualification

## Summary

The blue/green API unit inherited a localhost-only network profile that is valid
for Web, but incompatible with the current API architecture. Langame and other
reviewed provider integrations are called directly by the API process, so the
profile blocked live session lookup. A second defect affected normalized facts
where Langame supplied `externalDomain` but no `club_id`: the primary evaluator
could not safely associate those facts with rules selected by store.

The public route stayed on the previous scheduler-free release until all
cutover checks passed. Production was then switched to release
`04f967f3f32c4ccb612f0458823de65f62ad59ff`; the previous release
`39e11b61fc41c638ab399a448803f15dc89f5408` remains the accepted N−1 rollback
target. Schema state is `187/187`, with head migration
`20260820010000_guest_portal_telegram_update_ledger`.

## User-visible symptoms

- a guest with a real active Langame session could receive “active session not
  found” during check-in;
- session-start and play-time facts from the affected interval could remain
  unqualified;
- a rule spanning a whole Langame domain could miss a fact that had a domain but
  no exact store identifier;
- the failure was not caused by the game UI or by requiring an in-game session
  for unrelated facts such as a balance top-up.

## Root causes and fixes

### API provider egress

Web remains restricted to localhost. The API still listens only on
`127.0.0.1`, but its reviewed systemd profile permits outbound TCP/DNS required
by Langame, SMTP, SMS and other configured providers. Network capability does
not enable a provider or a background processor by itself: runtime flags and the
final `canary-safe.env` overlay remain authoritative.

Applying Web's `RestrictNetworkInterfaces=lo` plus `IPAddressDeny=any` profile
to API is a release-blocking regression because it disables live provider reads.

### Domain-scoped facts without `club_id`

Primary routing now uses `buildUnambiguousPrimaryDomainRouting`:

- an explicit `storeId` remains authoritative;
- a fact with only `externalDomain` may be evaluated for a rule only when that
  rule selects every active store behind the domain;
- a partially selected shared domain is never widened implicitly;
- a stricter routing map supplied by supplemental callers remains authoritative;
- mission, loot-box and season evaluation receives the correct per-domain club
  timezone.

This rule prevents both false negatives for whole-domain rules and cross-club
qualification for partially selected shared domains.

### Cutover attestation on systemd 255

For an unrestricted `RestrictNetworkInterfaces=` property, systemd 255 may
serialize the effective value as the exact marker `~`. The cutover verifier now
accepts only an exact empty value or exact `~` for this API profile and still
rejects named interfaces such as `eth0`. CI covers both the accepted and rejected
fixtures.

### Isolated USER_CALL services

The release-pinned USER_CALL sidecars must not reuse the blue/green API or Web
UIDs. Production uses dedicated nologin/no-home identities
`leetplus-api-user-call` and `leetplus-web-user-call`, each with a separate
primary group and `Group=leetplus-runtime` for read-only artifact access. This
avoids foreign same-UID and reverse primary-GID failures during cutover. The
sidecars remain isolated from the main blue/green feature flags and expose only
their reviewed public authentication surface.

## Recovery and back-credit

Before recovery, a verified database backup was created:

- path: `/srv/leetplus/recovery-backups/leetplus-before-langame-recovery-20260827T1600Z.dump`;
- SHA-256: `89c6cf19609472bcc5fc4def6f06e0a412e78ce1f06b777c5401bb915b3d419a`.

Missed results were reconstructed from exact provider facts and processed
through canonical or compensation events plus the normal reward materializer.
Reward tables were not edited directly, and no pending case was forcibly opened
or claimed.

| Guest | Verified fact | Result |
| --- | --- | --- |
| `***4516` | exact session start at the selected club | one `КЕЙС «БУДНИ»` entitlement; replay returned the same event and one entitlement |
| `***6330` | completed 226-minute session | one mission result for `МЕНЯЕМ МИНУТЫ НА КЕЙС`; `КЕЙС «КАМБЭК»` remained available for manual open, XP remained a separate wallet item |
| `***0086` | completed 235-minute session | mission and Battle Pass rules matched, but both rewards were automatically canceled by `LANGAME_STAFF_PHONE_MATCH`; no reward or XP was issued |

The staff-test result is intentional. Recovery must preserve the same audience,
staff, repeat-cycle, reconciliation and claim guards as normal processing.

## Accepted production evidence

- accepted cutover receipt:
  `/var/lib/leetplus/deploy-receipts/20260827T194420821302103Z-g3-04f967f3f32c4ccb612f0458823de65f62ad59ff-blue.receipt`;
- receipt SHA-256:
  `efd7048881eb548f9fd0960bad54edcdc7d1f71b0778cfb122f6ca17b6fc176c`;
- public `/health`: `ok=true`, exact new release SHA;
- `/`, `/game`, `/game/rewards`, `/login` and `/game/auth`: HTTP 200;
- `/gamification`: unauthenticated HTTP 307 to login, as expected;
- blue, green, isolated USER_CALL and scheduler-free N−1 units: active;
- outstanding cutover intent: none;
- reward intent/effect queues after the second materializer pass: zero active,
  retryable or dead-letter rows.

## Current runtime boundary

The active blue unit still loads the final `canary-safe.env` overlay. Autonomous
activity-ledger, primary gamification, supplemental, reward-materializer,
bonus-ledger and other background schedulers remain disabled. This was also the
effective state of the previous green release. Live check-in is a direct request
and does not require those schedulers. Recovery used bounded, operator-initiated
processing with a clean second pass.

Provider egress being technically available must never be documented or treated
as proof that provider writes or background processors are enabled.

## Required recovery procedure

1. Record the exact outage window, affected tenant/store/domain and current
   runtime flags.
2. Create and verify a database backup before any data effect.
3. Audit exact normalized facts, rule decisions and existing event/reward/wallet
   state; exclude unrelated or already-consumed facts.
4. Use a canonical event when its identity is correct. If it is attached to an
   incorrect duplicate profile, create an auditable compensation event instead
   of rewriting reward tables.
5. Run the ordinary bounded materializer and preserve staff-test, claim,
   reconciliation, audience, period and `maxPendingRewards` guards.
6. Replay the same input and prove stable event identity and a single
   entitlement/reward.
7. Verify reward, entitlement, wallet and XP separately. Do not force claim or
   open a loot box for the guest.
8. Run a second bounded pass and require zero new effects plus empty active/dead
   queues before closing the incident.

## Permanent release gates

- A release must test real provider reachability from the API identity without
  granting Web external egress.
- Domain-only facts require the all-active-stores rule described above.
- Cutover must fail before nginx mutation on identity, effective-property or
  USER_CALL ownership conflicts; the old public slot remains serving.
- Any future activation of autonomous schedulers or provider writes is a
  separate reviewed rollout with tenant scope, queue baseline, canary and
  rollback evidence.
- Documentation, logs and incident artifacts must not contain raw phone numbers,
  provider secrets, Langame credentials or raw provider payloads.
