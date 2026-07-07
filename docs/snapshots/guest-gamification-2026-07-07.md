# Guest Gamification Snapshot - 2026-07-07

Контрольная точка после стабилизации открытия почасовых и пакетных лутбоксов.

## Code State

- Production commit: `424a4fa2efa3b22e4d082058b143e90551eb3448`
- Branch: `main`
- Production API: `leetplus-api.service`, restarted after deploy on `2026-07-07 15:49:42 MSK`
- Snapshot created on VDS at: `2026-07-07 15:55 MSK`

## Config Snapshot

- VDS path: `/home/admin/leetplus/.codex-backups/gamification-config-20260707-1555-msk.json`
- SHA-256: `c5f4ef798fb4f0e3620b557bbea93ee6af11f10bc07c21efaf20f59465337427`
- Size: `5,475,716 bytes`
- Snapshot kind: `guest-gamification-config`

The JSON snapshot contains configuration data only:

- `Tenant`
- `Store`
- `GuestAudience`
- `GuestGameLootBox`
- `GuestGameMission`
- `GuestGameSeason`
- `GuestGamePromoCard`
- `GuestGameVisualDraft`
- `GuestGameLogTypeMapping`

The snapshot intentionally does not include guest profiles, phone numbers, rewards, game events, deliveries, OTP challenges, or Telegram link challenges.

## Table Counts

| Table | Rows |
| --- | ---: |
| `Tenant` | 3 |
| `Store` | 4 |
| `GuestAudience` | 1 |
| `GuestGameLootBox` | 4 |
| `GuestGameMission` | 1 |
| `GuestGameSeason` | 0 |
| `GuestGamePromoCard` | 5 |
| `GuestGameVisualDraft` | 70 |
| `GuestGameLogTypeMapping` | 0 |

## Loot Boxes

### `CASE-CA369B59` - `КЕЙС «БУДНИ»`

- DB id: `ca369b59-4969-4d7e-9cbb-e563a480fd92`
- Status: `ACTIVE`
- Trigger: `SESSION_START`
- Session type: `packet_hours`
- Stores: all 4 clubs
- Days: weekdays, Monday through Friday
- Time window: any time
- Limits: total daily limit `30`
- Budget: `10000`
- Manual approval: `false`
- Prizes:
  - `100 бонусов` - `60%`
  - `200 бонусов` - `23%`
  - `300 бонусов` - `15%`
  - `500 бонусов` - `2%`

### `CASE-7E8F5373` - `КЕЙС «УТРО»`

- DB id: `7e8f5373-4051-46b0-819d-27ffe7319831`
- Status: `ACTIVE`
- Trigger: `SESSION_START`
- Session type: any
- Stores: all 4 clubs
- Days: any day
- Time window: `08:00-14:00`, club-local time
- Limits: per guest `1` per week
- Budget: `5000`
- Manual approval: `false`
- Prizes:
  - `50 бонусов` - `85%`
  - `100 бонусов` - `10%`
  - `200 бонусов` - `5%`

### `CASE-0CE6F7E3` - `КЕЙС «WEEKEND»`

- DB id: `0ce6f7e3-99ea-4aa2-b6e2-68e8dbd1bb12`
- Status: `PAUSED`
- Trigger: `SESSION_START`
- Session type: `packet_hours`
- Stores: all 4 clubs
- Days: weekends, Saturday and Sunday
- Time window: any time
- Limits: per guest `1` per week; restarted at `2026-07-07T13:13:42.304Z`
- Budget: `5000`
- Manual approval: `false`
- Prizes:
  - `100 бонусов` - `50%`
  - `200 бонусов` - `25%`
  - `300 бонусов` - `15%`
  - `500 бонусов` - `10%`

### `CASE-44D7FD5B` - `Кейс "БЕЗЛИМИТ"`

- DB id: `44d7fd5b-4bbc-4edb-9c04-f81d86c1fa2e`
- Status: `ACTIVE`
- Trigger: `SESSION_START`
- Session type: `regular_session`
- Stores: all 4 clubs
- Days: any day
- Time window: any time
- Limits: total daily limit `30`, per guest `2` per week, activated at `2026-07-07T13:05:08.340Z`
- Budget: `5000`
- Manual approval: `false`
- Prizes:
  - `50 бонусов` - `91.4%`
  - `100 бонусов` - `5.38%`
  - `200 бонусов` - `2.15%`
  - `Промокод на 1000 рублей` - `1.07%`

## Recovery Notes

Use the VDS JSON snapshot as the source of truth for this restore point. Before restoring any production data, create a fresh full database dump and compare the target rows by table and `id`.

Recommended recovery flow:

1. Copy `/home/admin/leetplus/.codex-backups/gamification-config-20260707-1555-msk.json` from the VDS.
2. Verify the file hash equals `c5f4ef798fb4f0e3620b557bbea93ee6af11f10bc07c21efaf20f59465337427`.
3. Restore or compare only configuration tables listed above.
4. Do not overwrite guest rewards/events/profiles from this snapshot; they are intentionally excluded.
5. Restart `leetplus-api.service` only after verifying the restored configuration.

