# Development and verification

Read this guide for code changes. Select checks from the affected package and current CI; historical receipts are not current acceptance.

The repository pins pnpm in `package.json` (currently `10.33.2`). Commands below run from the repository root; on Windows use `pnpm.cmd` where required by the shell.

| Purpose | Command |
|---|---|
| API development | `pnpm --filter api start:dev` |
| Web development | `pnpm --filter web dev` |
| API typecheck | `pnpm --filter api exec tsc --noEmit -p tsconfig.build.json` |
| Focused API test example | `pnpm --filter api exec jest --runInBand --runTestsByPath src/common/assortment-health.spec.ts` |
| API suite when required | `pnpm --filter api exec jest --runInBand` |
| Web types/build | `pnpm --filter web typecheck` / `pnpm --filter web build` |
| Executive Web contracts | `pnpm --filter web test:executive-dashboard` |

- Filtered commands change the package working directory: test paths above are relative to `apps/api`. Quote literal App Router paths containing parentheses. Run the relevant current lint/CI scripts; a changed-file lint pass is not a full-project lint claim.
- Use existing dependencies unless they are missing or the lockfile/dependencies changed. Start local services only when needed; choose available ports and isolated test data. A Git worktree does not isolate ports, databases or running services.
- Run independent checks as the bounded batch required by root AGENTS.md; keep separate full logs and exit codes. Expand tests according to affected contracts and preserve all required admission gates.
- Reuse receipts only when their code, dependencies, environment, fixtures, command and checked scope still apply. After failure, read the operation error log and record the cause and changed condition before retrying.
- For UI changes verify real interactions and relevant error/loading states, keyboard and viewport behavior. Check current browser availability; an old browser-auth failure does not establish current tool state. Synthetic QA is not proof of natural production login or provider delivery.
- Documentation-only changes need link/command checks and `git diff --check`; they do not require rebuilding unchanged application code. Never claim tests, CI, runtime or production acceptance that was not performed.
