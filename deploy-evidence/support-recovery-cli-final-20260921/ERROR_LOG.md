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
