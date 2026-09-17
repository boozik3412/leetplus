# API 6 GiB resource profile

Update 17 September, 11:02 UTC: approved applicationed4 is accepted as active
BLUE3c3/generation9. Both BLUE3c3 and retained GREEN7ead APIs use 6 GiB RAM,
8 GiB total RAM+swap and 2 CPU. GREEN/data process identities are unchanged.
Exact-candidate resource/cooldown and actual public UI/worker checks passed.
[Current production evidence](dashboard-periods-production-2026-09-17.md).

Historical update 17 September, 06:40 UTC: approved application762a was accepted as active
GREEN7ead/generation8, API 6 GiB RAM and 8 GiB total RAM+swap. Healthy BLUEb5/API4
is retained. Serving controller02/data399 did not change. Actual restored-copy
UI/resource/cooldown and public UI/worker acceptance passed.
[Production evidence](executive-production-2026-09-17.md).
The preparation notes below describe the earlier state before these operations.

Status 16 September 2026: source preparation includes the profile, narrowly
signed renderer transition, production budget gate and monitored rehearsal.
Production remains on its accepted 4 GiB API configuration. No resource update,
controller bootstrap or application cutover has been performed for this change.
Source/unit verification is not exact-main admission or Linux runtime acceptance.

## Implemented source contract

- New sealed outer `release.json` declares `apiResourceProfile: "API_6G_V1"`.
- Missing property means legacy 4 GiB and preserves historical Compose bytes;
  unknown, null and explicitly undefined profiles are rejected. Inherited
  properties cannot silently select a new resource policy.
- Each slot takes its profile from its own admitted release: legacy/6 GiB mixed
  rollout is supported; both newly profiled slots render 6 GiB each.
- The new profile explicitly keeps total RAM+swap at 8 GiB; this does not raise
  swap allowance to Docker's otherwise implicit doubled total. CPU remains 2,
  and Node heap flags, other service limits, environment, entrypoints and security
  boundaries are unchanged.
- Container verification checks exact positive memory/CPU limits and exact total
  RAM+swap when explicitly bound. Admission independently re-renders the rehearsal
  Compose document rather than trusting only its producer-supplied checksum.

## Required work before deployment

The existing `CONTROL_HANDOFF` byte-pins `contract.mjs`, and existing application
plans bind Compose digests. A direct constant replacement, manual `docker update`,
or generic relaxation of compatibility is not a supported transition.

A narrowly signed `RESOURCE_PROFILE_BOOTSTRAP` is implemented in source:
exact predecessor controller892b, exact legacy contract hash,
all other compatible files unchanged, all historical/current missing-profile
releases rendering byte-identically at 4 GiB, and no live memory/process mutation.
It must not reuse the prior accepted controller operation or rewrite old plans.
The explicit `control-handoff.sh plan --resource-profile-bootstrap` option binds
the transition; the signer and all authority/recovery validators enforce its
fixed scope. The target executor revalidates all terminal application histories,
not merely a boolean in the plan. Ordinary handoff remains byte-strict.
After that independently admitted transition, normal five-phase inactive-slot
rollouts can adopt 6 GiB and eventually establish both slots at 6 GiB.

The source production budget gate re-collects host/container observations before
prepare, BIND and SMOKE. It requires the planned limits plus finite other limits,
observed unlimited peers and at least 8 GiB OS/growth reserve to fit RAM, as well
as enough current available memory for the additional planned allocation. Its
`OBSERVED_ENVELOPE_PASS` is explicitly not a guaranteed future ceiling for
unlimited peers. Recovery of an already accepted runtime is not blocked by this
new-expansion gate. BIND receipt-loss reconciliation checks its stopped postimage
and preserves the original timestamped evidence without replaying stop/recreate.

Actual 6 GiB heavy-request/peak/cooldown acceptance remains pending. Neither
local source tests nor the previously restored 4 GiB clone proves it passed.

## Shared-host capacity finding

The authorized operator's read-only snapshot at 09:13:18 UTC recorded:

| Item | GiB |
| --- | ---: |
| Host RAM | 60.511 |
| MemAvailable at that instant | 43.844 |
| Planned production, two 6 GiB APIs and both workers reserved | 24.25 |
| Other running containers' finite limits | 23.375 |
| Observed memory of 17 other unlimited containers | 1.375 |
| Proposed OS/growth reserve | 8 |

That planning envelope is about 57 GiB without a rehearsal. A one-slot rehearsal
adds 15.25 GiB; a two-slot rehearsal adds 22.25 GiB. Both exceed host capacity in
this envelope. Stopped historical clones are not counted as concurrent workloads.
Observed usage of unlimited workloads is not a guaranteed future ceiling, and
current free RAM is not proof that all allowed peaks fit.

Further read-only checks found no finite ancestor cap for all 17 unlimited peers.
The local Windows host has 31.52 GiB RAM / 16.01 GiB free and no installed
Docker/WSL, so it is not an established alternative rehearsal environment.

The user delegated the resource-window choice. The selected alternative is an
**explicitly bounded monitored rehearsal** on the existing private server. This
does not convert the above worst-case deficit into a hard-cap guarantee. No
unrelated workload is stopped/resized, no paid server is acquired, and production
data is not copied to a new destination.

## Bounded monitored rehearsal

Use the admitted staged controller's `run-resource-rehearsal.py`. It validates
the exact release/profile, isolated preparation/restore and canonical Compose
bytes before starting the fixed `leetplus-rehearsal-resource-acceptance` systemd
service. A 15-minute independent wall timeout and fixed ExecStopPost cleanup
remain in force if the calling terminal or acceptance process exits unexpectedly.
Direct 6 GiB acceptance outside that service cgroup is denied.

- Start only with all four clone API/Web containers stopped, exact IDs/images/
  resources attested, and current MemAvailable covering remaining clone caps
  plus 16 GiB. Clone PG/Redis are already restored and running.
- Observe host available memory and clone cgroup memory/current/peak/events/swap
  plus process identity throughout warm-up, native login/boundary acceptance,
  executive functional checks, fixed heavy reads and cooldown. Probe failures,
  OOM/restarts, identity drift, less than 12 GiB available or timeout fail the run.
- Cleanup may stop only the four pre-pinned, re-attested clone API/Web IDs.
  Replacement IDs, production, other projects and clone PG/Redis are excluded.
  A private immutable active-pins receipt is published before warm-up; do not
  delete it or rerun a completed/failed window without inspecting its journal
  and reconciling the exact prior state.
- The fixed corpus uses proven seven/30-day data windows, three serial passes
  per slot and at most two concurrent read requests in total. Genuine clone
  login and Web/tenant-denial checks remain in the same guarded window. Only
  the clone actor password/login fixture changes; business counts must match.
- Observe at least 60 seconds of cooldown, then repeat readiness/reads. Report
  retained memory and trajectory, not an invented requirement that Node return
  to its cold baseline. This bounded corpus neither establishes a throughput
  SLA nor proves the root cause of the earlier production OOM.
- Publish combined native/resource PASS only after successful cleanup. Before
  production budget admission, the effect owner separately stops the successful
  clone's PG/Redis too, retaining all data and evidence. Failure cleanup leaves
  them intact for investigation.

Order: exact-main CI/admission → stage-only controller → isolated exact-release
restore and monitored acceptance → fresh backup/bindings and separately approved
signed renderer bootstrap → normal inactive-slot app rollout → verified cutover
→ subsequent reverse-slot rollout. Existing 892b/4 GiB receipts are never
relabelled as this release's restore or resource proof.

Operational plan and complete error journal:
`deploy-evidence/api-memory-6g-20260916/PLAN.md` and `ERROR_LOG.md` in the parent
workspace. Current app/server effect ownership remains with the coordinated
application rollout task; source work here does not authorize a second writer.
