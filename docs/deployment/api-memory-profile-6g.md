# API 6 GiB resource profile — source preparation, not deployed

Status 16 September 2026: the profile/render/build/admission source change is
implemented and locally tested. Production remains on its accepted 4 GiB API
configuration. No resource update, controller bootstrap or application cutover
has been performed for this change.

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

A narrowly signed renderer bootstrap is planned but **not implemented in this
source preparation**: exact predecessor controller892b, exact legacy contract hash,
all other compatible files unchanged, all historical/current missing-profile
releases rendering byte-identically at 4 GiB, and no live memory/process mutation.
It must not reuse the prior accepted controller operation or rewrite old plans.
After that independently admitted transition, normal five-phase inactive-slot
rollouts can adopt 6 GiB and eventually establish both slots at 6 GiB.

The native host-budget admission gate and measured 6 GiB heavy-request/peak/cooldown
acceptance are also pending. Neither local source tests nor the previously restored
4 GiB clone is evidence that these production gates passed.

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

Before effects, the user must choose an authorized resource window or another
appropriate isolated test environment. Do not stop unrelated projects, lower their
limits, transfer production data to a new destination, or waive acceptance based
only on MemAvailable. Actual OOM-triggering request remains unproven; use a fixed,
bounded, representative read-only corpus in an isolated restored copy and report
memory.current/peak/events and PID continuity, including cooldown behavior.

Operational plan and complete error journal:
`deploy-evidence/api-memory-6g-20260916/PLAN.md` and `ERROR_LOG.md` in the parent
workspace. Current app/server effect ownership remains with the coordinated
application rollout task; source work here does not authorize a second writer.
