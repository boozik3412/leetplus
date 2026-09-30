# LeetPlus repository context

`apps/api` is the Nest API; `apps/web` is the Next.js UI. Confirm this checkout's
branch, changes and applicable package/CI commands before editing. Historical
release notes do not establish current production state.

Before changing authentication, landing/redirects, access scope, the public
game, gamification administration, integrations or background jobs, read
`docs/security/runtime-security-contours.md` completely. It is the canonical
boundary contract for those areas.

## Production releases

Production is updated with `lp` on the host, as described in
[deploy/simple/README.md](deploy/simple/README.md): merge to `main`, wait for
the five required checks, then `lp deploy <sha>` (blue/green, automatic
public check, `lp rollback` in seconds). Run production commands only when the
user asks for the release in the conversation, and report the `lp` output.
`lp status` on the host is the source of truth for what is serving.

The legacy release machinery (`deploy/leetplus-compose` native plans, signed
approvals/GO packets, controller handoffs A/bridge/B, `deploy/transition-bootstrap`,
standalone intro/transport, and the runbooks under `docs/deployment/`) is
frozen history. Do not extend it, do not reintroduce per-release restored-copy
rehearsals, offline signatures or evidence journals, and do not add new
deployment gates without the user's explicit request.

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
- `main` is source, not proof of production state; `lp status` is. The dormant
  split-runtime candidate must not be installed.
- Database migrations must be backward compatible with the release that is
  still serving (expand → deploy → contract), so `lp rollback` stays safe.
  `lp` applies each migration in one transaction: grant every new table to
  `leetplus_runtime` explicitly (or mark it `-- lp:no-runtime-access "Table"`),
  and do not use `CONCURRENTLY` or your own `BEGIN`/`COMMIT`.
- Run independent local verification gates together and report all failures
  from that pass at once, rather than stopping at the first one.

If a change alters any route ownership, identity, secret, process, database
role, scheduler placement or provider egress, update
`docs/security/runtime-security-contours.md` in the same change. Deploying a
release does not require a documentation change.

## Read for the affected area

- Assortment, inventory, stock movements or reports: [assortment guide](docs/agent-context/assortment.md) and [metric contract](docs/assortment-dashboard-metric-contract.md).
- Executive dashboard, periods, revenue or priorities: [executive guide](docs/agent-context/executive-dashboard.md) and the relevant [priority contract](docs/executive-dashboard-priorities.md).
- Guest dashboard, guest card, CRM signals or the guest ↔ game projection: [guests CRM guide](docs/agent-context/guests-crm-gamification.md).
- Loading states, skeletons, the route progress bar or a new heavy screen: [loading UI guide](docs/agent-context/loading-ui.md).
- Code changes and local QA: [commands and verification](docs/agent-context/verification.md); preserve the current required CI/admission gates.
- Deployment/release work: [deploy/simple/README.md](deploy/simple/README.md). [Historical context](docs/agent-context/history-2026-09-17.md) and `docs/deployment/` are only for tracing earlier decisions, not startup reading.

## Keep work focused

- Use one implementer for a small change; independent review follows the task's risk. Search the affected module and read relevant sections before widening scope. Do not load every linked document; the mandatory security-contract read above remains unchanged.
- Keep current rules here and module details in their guide. Store dated checkpoints and test receipts in task/deployment evidence, not as permanent startup instructions.
- Reuse passed checks only while code, dependencies, environment, fixtures, command and checked scope remain applicable. Report the outcome, exit code and relevant error.
