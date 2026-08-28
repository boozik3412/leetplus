# LeetPlus repository context

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

If a change alters any route ownership, identity, secret, process, database
role, scheduler placement, provider egress or rollout state, update
`docs/security/runtime-security-contours.md` and the current open-beta status in
the same change.
