# Gate 1MT attachment parent-delete guard evidence

| Field               | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| Status              | `ENGINEERING PASS / PRODUCTION NO-GO`                 |
| Date                | 19.08.2026                                            |
| Scope               | Staff attachment parent-delete DB invariant           |
| Canonical migration | `20260819010000_staff_attachment_parent_delete_guard` |
| Canonical head      | `CURRENT_186`, count `186`                            |

## Decision

The staff attachment binding model stays polymorphic. A regular PostgreSQL
foreign key cannot represent all parent tables, so the beta hardening path adds
deferred constraint triggers instead.

The DB now rejects deletion of any parent row while a `BOUND`
`StaffAttachmentBinding` still points to it. Legitimate service flows remain
valid: they must remove the binding, quarantine the last blob when needed, and
only then delete the parent in the same transaction.

Covered parent kinds:

- `CHAT_MESSAGE`
- `STAFF_TASK`
- `CHECKLIST_RUN`
- `KNOWLEDGE_ARTICLE`
- `SHIFT_REGULATION`
- `TRAINING_COURSE`
- `ONBOARDING_PLAN`

## Evidence

- API lint for `test/pilot-staff-attachments-scope.pg.integration-spec.ts`:
  `PASS`.
- API typecheck: `PASS`.
- Prettier check for the focused PG test: `PASS`.
- Focused local PostgreSQL matrix:
  `test/pilot-staff-attachments-scope.pg.integration-spec.ts` `14/14 PASS`.
- Current-head/readiness bump: `pnpm --filter database
check:identity-mail-delivery-current-head` `3/3 PASS`.
- Identity-mail worker repository unit:
  `src/identity-mail-worker/identity-mail-worker.repository.spec.ts`
  `67/67 PASS`.
- Production-history materialized lane updated to `186` migrations:
  `founder-pilot-production-history-rehearsal.test.mjs` `7/7 PASS`.
- Focused database evidence pack after bump:
  `identity-mail-worker-enrollment`, `runtime-function-enrollment`,
  `staff-task-integrity`, `identity-legacy-backfill-inventory` tests
  `110/110 PASS`.
- API typecheck, Prisma schema validate and focused ESLint: `PASS`.

The PostgreSQL matrix used an isolated local PostgreSQL 16 database. Local
`prisma migrate deploy` stopped at the pre-existing
`20260731120000_identity_mail_delivery_release_head` manifest guard before this
new migration; the run confirmed that exact known blocker, then applied only the
new guard migration to the disposable DB and executed the focused attachment
matrix.

After the current-head bump, a separate disposable PostgreSQL 16 clean deploy
again stopped at the same pre-existing
`20260731120000_identity_mail_delivery_release_head` historical guard, before
`CURRENT_186` was reached. The failure does not prove a `CURRENT_186` SQL error;
it keeps full production deploy rehearsal as a remaining launch gate.

## Production Boundary

This is not a production deployment approval.

The migration is now the canonical `CURRENT_186` release head for local
application/readiness evidence. Production still requires a clean CI artifact,
reviewed deploy path and production-like restored-copy rehearsal that reaches
and executes `CURRENT_186`.

Production, the current four-club tenant, external testers and SMTP/worker roles
were not changed.
