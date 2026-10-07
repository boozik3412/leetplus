# Guest leaderboard («Рейтинг»)

Guests see their place in their club and in the network. Owner decisions (07.10.2026):

- the period is the calendar month; the board resets on the 1st;
- two main boards, «Общий зачёт» (points) and «Часы», plus «Сессии», «Задания» and «Кейсы»;
- a guest without a nickname is shown as «Игрок ••1234» (last four phone digits);
- play before game activation does not count;
- prizes for places 1–3 are set per board and per club or network in «Геймификация → Рейтинг»; when no prize is set, the guest sees no prize block.

The screen follows variant 1 «Арена» of the design canvas: a podium, a table with daily movement, and the guest's own place docked at the bottom.

## Code

| Part | Where |
|---|---|
| Pure rules: config validation, month windows, points, ranking, names, prizes | `apps/api/src/guest-leaderboard/guest-leaderboard-core.ts` |
| Read side (Prisma only; used by the guest portal and the admin) | `guest-leaderboard-read.service.ts` |
| Admin settings, standings, moderation | `guest-leaderboard-admin.service.ts`, `guest-leaderboard-admin.controller.ts` |
| Guest route | `GET /guest-portal/session/leaderboard?scope=club\|network&board=points\|hours\|sessions\|quests\|cases` |
| Admin routes | `GET/PATCH /guests/gamification/leaderboard/settings`, `GET …/standings?scope=network\|<storeId>&board=`, `POST …/profiles/:id/exclusion` `{excluded}`, `POST …/profiles/:id/reset-nickname` |
| Guest UI | `apps/web/src/app/play/game/game-rating-client.tsx` (`/game/rating`, `/play/game/rating`, home card «Ваше место», menu item) |
| Admin UI | `apps/web/src/components/guest-gamification-leaderboard-tab.tsx` (tab «Рейтинг») |
| Wording | `apps/web/src/lib/guest-leaderboard.ts` |

## Data sources

All sources count only after `GuestGameProfile.gameActivatedAt`. They take `status = ACTIVE` profiles only and skip `isStaffTest` profiles.

- **Hours and sessions** come from canonical `GuestActivityFact` play-time facts: `HOURLY_`, `PACKAGE_OR_SUBSCRIPTION_` and `SESSION_PLAY_TIME_ACCUMULATED`.
  - There is one fact per Langame session. Duplicates are collapsed by domain and session.
  - A session is capped at 24 h.
  - A session counts for «Сессии» from 30 minutes.
  - Do not use `GuestSession.storeId`: it is NULL for clubs sharing a Langame domain (44 % of sessions in 30 days on 07.10). Facts carry the club.
- **Check-ins** come from `CHECK_IN_PERFORMED` facts and count for points only.
- **Missions** come from reward-wallet items with `sourceKind` `MISSION` or `BATTLE_PASS`, any status except cancelled, dated by `createdAt`.
- **Opened cases** are wallet items of kind `LOOT_BOX_ENTITLEMENT` with status `CLAIMED`, dated by `claimedAt`.
- **Club board**: rows of that store.
- **Network board**: all rows, including club-less wallet items.

Points use the owner's formula, default 1 h = 10, mission = 30, case = 5, check-in = 5:
`round(minutes × hourPoints / 60) + quests × questPoints + cases × casePoints + checkIns × checkInPoints`.

## Periods and ranking

- **Month boundaries.** The club board uses the club's time zone (`Store.timeZone`). The network board uses the most common zone of the active clubs.
- **Ranking.** Competition ranking: equal values share a place. Zero values are not ranked. Excluded profiles are not ranked.
- **Visible rows.** The guest sees the top 10; when the guest is lower, also the guest with one neighbour on each side.
- **Movement.** «за сутки» compares with the same month cut 24 h ago, quantized to 10 min. On day 1 there is no comparison.
- **Crown.** The crown marks last month's #1 of the same board and scope.
- **Caching.** Activity is cached per tenant and window, 5 min for the open month and 1 h for closed windows. Settings are cached for 60 s; the cache is dropped when an administrator saves.

## Settings

`GuestLeaderboardSettings` holds one row per tenant: `enabled`, `revision` and `config` JSON. The JSON is validated by `normalizeLeaderboardConfig`:

- `networkEnabled`;
- `disabledStoreIds`;
- `boards`;
- `formula`;
- `prizes[network|storeId][board] = [prize|null × 3]`, where a prize is `BONUS{amount}`, `LOOT_BOX{lootBoxId}` or `CUSTOM{label}`;
- `excludedProfileIds`.

Saves are optimistic: `revision` must match. Exclusions change only through the moderation action, and a settings save keeps the stored list. Without a row the leaderboard is off.

## Not built yet

- **Month results and prizes.** On the 1st a worker must freeze the standings into `GuestLeaderboardPeriodResult` and issue the configured prizes through the reward pipeline. The table exists but nothing writes it yet.
- **Notifications.** Telegram «тебя обогнали».
- **«Битва клубов».**

## Local QA without a database

Run the real read/admin services against an in-memory fake Prisma.

1. Write a small Node HTTP mock under the session scratchpad. Start it with `ts-node/register`, with `cwd` = `apps/api`, `NODE_PATH` = `apps/api/node_modules` and `TS_NODE_TRANSPILE_ONLY=1`.
2. Point `next dev` at the mock with `NEXT_PUBLIC_API_URL`.
3. Set the cookies `leetplus_guest_token` and `leetplus_access_token` to any value.
4. For the admin tab, render it on a temporary route under `app/play/` and delete that route afterwards.
