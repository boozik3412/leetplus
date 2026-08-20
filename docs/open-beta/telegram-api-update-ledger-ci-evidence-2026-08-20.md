# Telegram API update ledger CI evidence — 2026-08-20

## Accepted slice

- Commit: `80e56b45ba411137f854d2614a8c994243abd7c0`
- Branch: `codex/open-beta-hardening`
- GitHub Actions CI: `32364681000` — `4/4 SUCCESS`
- Founder pilot mail enrollment PostgreSQL gate: `32364681122` — `SUCCESS`

## What was accepted

- Prisma model and migration for `GuestPortalTelegramUpdateLedger`.
- API Telegram webhook durable claim by `(provider, updateId)` before
  auth/contact/callback/check-in side effects.
- Duplicate update handling returns `IGNORED/DUPLICATE_UPDATE` and skips reply
  dispatch.
- Migration head advanced to
  `20260820010000_guest_portal_telegram_update_ledger` with `187` migrations.
- Release artifact, Application checks, Authority root trust gate and
  PostgreSQL migration smoke all passed on the accepted SHA.

## Still open

- Stale `PROCESSING` reconciliation and operator alerts.
- Cross-worker/restart reconciliation proof.
- Production canary.
- Full tenant-aware public guest/Telegram/outbound matrix.
