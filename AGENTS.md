# LeetPlus repository context

`apps/api` is the Nest API; `apps/web` is the Next.js UI. Confirm this checkout's
branch, changes and applicable package/CI commands before editing. Historical
release notes do not establish current production state.

Before changing authentication, landing/redirects, access scope, the public
game, gamification administration, integrations, background jobs or deployment,
read `docs/security/runtime-security-contours.md` completely. It is the
canonical boundary contract and current-state handoff for those areas.

## Required invariants

- Treat public guest, corporate tenant and unattended worker traffic as three
  different security/execution contours. Do not solve a problem in one contour
  by applying its guards, JWT, locks, rate limits, secrets or module graph to
  another contour.
- Public guest HTTP is `/guest-portal*` and public guest media. It uses the
  guest session/profile identity and must not depend on corporate `AuthModule`,
  staff scope or corporate JWT. There is no application-wide concurrent-user
  limit for this contour.
- `/guests/gamification*` is tenant-authenticated game administration, not
  public guest HTTP. It stays in the corporate contour with capabilities and
  fresh tenant scope. Public gameplay must remain available when this B2B
  contour is saturated or denied.
- Background schedulers, delivery consumers and service-token endpoints are
  worker/control-plane responsibilities. The public guest API runtime must not
  register them.
- Scope every guest-auth reservation, advisory lock, cleanup and poll lease to
  the smallest exact identity described in the canonical contract. Never add a
  global cleanup, mutex or shared corporate throttle to fix a single challenge.
- A successful login must land a role on a supported page before that page
  fetches restricted APIs. Do not widen capabilities to make a wrong landing
  page work. Platform admin without signed tenant context belongs to
  `/administration`.
- Web may remain localhost-only, but API egress needed for Langame, SMTP, SMS
  and approved providers must be explicit. Never copy the Web network sandbox
  onto an API/worker without a dependency-by-dependency egress review.
- `main` is source, not proof of production state. Production changes require
  one exact admitted SHA, immutable handoff and a separate explicit production
  GO. The dormant split-runtime candidate must not be installed manually.
- Run independent local and CI verification gates as one bounded batch that
  preserves a separate output log and exit code for every gate, then report all
  failures from that pass together. Fail fast only at an effect boundary where
  continuing could mutate production, invalidate evidence, or make later
  results unsafe to interpret. Before retrying a failed gate, read the durable
  error log and record the changed condition; never restart an unchanged full
  batch merely to discover one failure at a time.
- Keep that append-only journal at
  `deploy-evidence/<operation>/ERROR_LOG.md`. Read its complete current content
  before every retry and every production command; a retry is permitted only
  after the observed failure, cause and changed condition are recorded.

If a change alters any route ownership, identity, secret, process, database
role, scheduler placement, provider egress or rollout state, update
`docs/security/runtime-security-contours.md` and the current open-beta status in
the same change.

## Read for the affected area

- Assortment, inventory, stock movements or reports: [assortment guide](docs/agent-context/assortment.md) and [metric contract](docs/assortment-dashboard-metric-contract.md).
- Executive dashboard, periods, revenue or priorities: [executive guide](docs/agent-context/executive-dashboard.md) and the relevant [priority contract](docs/executive-dashboard-priorities.md).
- Code changes and local QA: [commands and verification](docs/agent-context/verification.md); preserve the current required CI/admission gates.
- Deployment/release work: the complete security contract above, the relevant runbook under `docs/deployment/`, and current live receipts/status. [Historical context](docs/agent-context/history-2026-09-17.md) is only for tracing earlier decisions or checks, not automatic startup reading.

## Keep work focused

- Use one implementer for a small change; independent review follows the task's risk. Search the affected module and read relevant sections before widening scope. Do not load every linked document; the mandatory security-contract read above remains unchanged.
- Keep current rules here and module details in their guide. Store dated checkpoints and test receipts in task/deployment evidence, not as permanent startup instructions.
- Reuse passed checks only while code, dependencies, environment, fixtures, command and checked scope remain applicable. Keep full logs; report the outcome, exit code and relevant error. The required error-log and changed-condition rules above still apply.
