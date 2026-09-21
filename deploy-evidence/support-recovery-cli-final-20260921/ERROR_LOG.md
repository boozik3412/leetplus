# Support recovery CLI integration — local gate journal

## E01 — clean integration worktree has no linked dependencies

- Prettier, repository-owned Prisma generation and API typecheck stopped before
  source loading because this isolated worktree has no `node_modules` links.
- No source runtime, database, provider, clone, or production state changed.
  Changed condition: run `pnpm install --offline --frozen-lockfile` once using
  the repository's existing store, then rerun the declared Prisma/typecheck
  gates.

## E02 — adapter cherry-picks retain formatting drift

- Targeted Prettier check reports formatting drift in seven adapter/runtime
  files after the exact cherry-picks. No source behavior, database, provider,
  clone, or production state changed.
- Changed condition: run repository-owned Prettier write only on the listed
  support-recovery files, then rerun format, lint and whitespace gates.

## E03 — profile test replaced the full Node fs module

- The new runtime-profile test mocked `node:fs` without Prisma's required
  methods, so Prisma client initialization stopped at `fs.existsSync` before
  the suite executed.
- No database or runtime effect occurred. Changed condition: spy only on
  `readFileSync` and `statSync` from the real module, preserving the remaining
  Node fs API for Prisma initialization.

## E04 — committed marker used a truncated ticket number

- Independent review of commit `284caf30` found that the exact UUID for
  `LP-BUG-CB2114CE` was paired with the truncated string `LP-BUG-CB` in both
  source and fixture. The production query would therefore return the row by
  UUID, then reject the mismatched ticket number before any recovery effect.
- No database, ticket, reward, provider, clone, worker, or production effect
  occurred. Changed condition: bind the UUID to the full canonical ticket
  number and add assertions for exact CLOSED-ticket query shape, exact
  COMMENT_ADDED audit query shape, and ticket-number mismatch rejection before
  rerunning the local gates.

## E05 — new query-shape fixture was not formatted

- Targeted ESLint reached the two changed TypeScript files and reported ten
  Prettier-only errors in the newly expanded `guestSupportTicket.findMany`
  fixture. It reported no semantic lint error.
- No runtime or external effect occurred. Changed condition: run the pinned
  repository Prettier writer on only the two changed TypeScript files, then
  rerun targeted ESLint, Prettier check, and whitespace verification.
