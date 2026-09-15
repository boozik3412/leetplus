СДЕЛАНО: Browser fixture protocol/auth/server smoke PASS; actual Next Q01 confirmed-zero/missing, Q02–Q05, Q07 secondary isolation, Q10–Q12, Q15–Q17 PASS.
СДЕЛАНО: Q06 FAIL доказан: `STALE` operations с health data не показывает state/reason и всё ещё создаёт priority; Web ticket05 теперь единственный владелец исправления.
ФАЙЛЫ: External helper/results/screens: `deploy-evidence/executive-dashboard-20260915/full-ui-qa/full-browser-acceptance.mjs` и `acceptance-runs/{full,confirmed-zero,missing,partial,secondary-failure,stale}/`.
ФАЙЛЫ: Consolidated partial matrix `deploy-evidence/executive-dashboard-20260915/full-acceptance/README.md`; full retry journal `deploy-evidence/executive-dashboard-20260915/full-acceptance/ERROR_LOG.md`.
РЕШЕНИЯ: 40000/14000/320, 125/35/20.8 и synthetic service/capacity доказывают presentation fixture only; API02 source limits remain PARTIAL/MISSING and are never production facts.
РЕШЕНИЯ: Browser used existing actual Next build on 127.0.0.1:4322 plus only loopback synthetic fixture 127.0.0.1:4321; ephemeral fixture OWNER login is not a production auth canary.
РЕШЕНИЯ: No Web/API source was changed; Q06/policy issue is passed to root and ticket05, while this task leaves `.autopilot/state/ACCEPTANCE` to root.
ТУПИКИ: First full harness had too-narrow literal/ARIA selectors for Q03/Q04/Q10; after documented evidence-only selector correction they PASS, no product source issue.
ТУПИКИ: Foreground fixture launch can outlive shell collection; hidden launcher wrapper is valid only after its own `runtime-pids.json` and both recorded loopback listeners are observed.
ТУПИКИ: After a checked stop, zero-base case was invoked before that readiness receipt and got `ECONNREFUSED` 127.0.0.1:4321; journal requires recorded PID file plus 4321/4322 listeners before retry.
ДАЛЬШЕ: Ticket05 owner fixes visible stale reason/state and stale priority/action treatment, builds once, then successor rereads `full-acceptance/ERROR_LOG.md` and reruns stale plus unaffected full matrix on freeze05.
ДАЛЬШЕ: Complete Q08 zero-base, Q09 delayed A→A+B, Q13 tampered role/scope and Q14 unavailable capacity against accepted fixture/source limits; mark unsupported scenarios honestly.
ДАЛЬШЕ: PG/docs successor first verifies 127.0.0.1:55495 identity and uses process-local `DATABASE_URL` plus `PILOT_ASSORTMENT_SCOPE_PG_CONFIRM`; add public executive GET/service-boundary assertions only, then source-only docs.
ДАЛЬШЕ: No live fixture is left: no `runtime-pids.json` and no listeners on 127.0.0.1:4321/4322 at handoff; do not stop any PID absent a matching recorded state.
