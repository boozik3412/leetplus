СДЕЛАНО: additive GET /dashboard/executive-product-revenue, generic API/Web executive contracts, actual dashboard card and manifest registration; legacy summary unchanged.
СДЕЛАНО: targeted DashboardService 25/25, manifest 13/13, API/Web typecheck and scoped lint passed; prior Web build PASS is in task01-web-build-final.log.
ФАЙЛЫ: apps/api/src/common/executive-contract.ts; apps/api/src/dashboard/dashboard.service.ts; dashboard.controller.ts; dashboard.service.spec.ts.
ФАЙЛЫ: apps/api/src/tenancy/pilot-http-surface-manifest.ts and .spec.ts; apps/web/src/lib/dashboard-executive.ts; dashboard-summary.ts; metric-presentation.ts.
ФАЙЛЫ: apps/web/src/components/metric-product-revenue-card.tsx; dashboard-filters.tsx; apps/web/src/app/(app)/dashboard/page.tsx.
ФАЙЛЫ: evidence C:/Users/ALIENWARE/Documents/New project/deploy-evidence/executive-dashboard-20260915/task01-*.log and gates/20260915T065252677Z-pilot-api-full.*.
РЕШЕНИЯ: product route remains a narrow corporate/FreshStoreScope saved-data seam; /dashboard/summary is not reshaped.
РЕШЕНИЯ: metric uses store-day coverage, not integration-domain presence; MISSING/FAILED value is null and AVAILABLE zero requires proof.
РЕШЕНИЯ: generic ExecutiveMetric/AppliedScope/Coverage is in the approved common paths; full KPI formulas remain 02/03.
ТУПИКИ: first filter prop-sync effect violated react-hooks/set-state-in-effect; keyed remount replaces it.
ТУПИКИ: no deterministic local fixture was found for authenticated actual-app render; browser QA is NOT_RUN, and green static gates do not prove UI or repair scope.
ДАЛЬШЕ: repair PARTIAL so total and rows include only confirmed store-days; rows without proof need nullable metric/state/reason/coverage, never false zero.
ДАЛЬШЕ: use one resolved active-store universe for facts, rows and scope; effectiveStoreIds=null must return concrete accepted IDs, excluding inactive stores.
ДАЛЬШЕ: make scope asOf/query timezone truthful to the accepted business scope, not UTC/end-of-period assumptions; preserve explicit cutoff semantics.
ДАЛЬШЕ: add public-boundary cases for cancelled facts, confirmed zero, MISSING, PARTIAL, FAILED, false-zero prevention and inactive-store consistency; then rerun targeted tests/typechecks/lint/build and browser fixture QA.
