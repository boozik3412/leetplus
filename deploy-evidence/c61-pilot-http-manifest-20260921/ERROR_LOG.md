# C61 pilot HTTP manifest — local validation journal

## V01 — generated Prisma client missing

- The isolated worktree initially had no package executable links. An offline frozen install restored dependencies, but the generated Prisma client remained absent (`.prisma/client/default`), causing the Gate 1MT Jest suite and API typecheck to fail before exercising the manifest change.
- No production, network, database, reward, or source-data effect occurred. Changed condition: run the repository-owned `pnpm --filter database db:generate` command, then repeat only the scoped manifest/route gates and inspect all resulting failures together.
