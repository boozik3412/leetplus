СДЕЛАНО: PG executive HTTP proof 16/16 PASS; source-only docs written; Q02/03/04/06/09/10/11/12/15/18 and child-stale PASS on final 05 build; Q08 real copy failure reported to root.
ФАЙЛЫ: apps/api/test/pilot-assortment-store-scope.pg.integration-spec.ts and three canonical docs are ready; browser evidence is under deploy-evidence/executive-dashboard-20260915/full-ui-qa/acceptance-runs.
РЕШЕНИЯ: PG fixture is only 127.0.0.1:55495/leetplus_ci; GuestSession cleanup was added after exact synthetic FK failure and direct Jest with --testTimeout=30000 passed.
РЕШЕНИЯ: Full helper reload now waits domcontentloaded plus visible heading/KPI, because networkidle timed out after exact preserved navigation.
РЕШЕНИЯ: Q08 is an app-copy defect, not an evidence selector issue; root owns its source fix.
ТУПИКИ: Immediate secondary-failure relaunch raced an orphaned 4321 listener after runtime state removal; ERROR_LOG has cause and requires a clean port/PID observation before retry.
ТУПИКИ: Contrast probe did not produce a reliable receipt before controlled stop; Q16 remains explicitly unaccepted.
ДАЛЬШЕ: Q13/Q14 are already covered by the PG HTTP proof (foreign/store-only scope and load MISSING/null); add an explicit browser Q17 long-name/large-number run. Rerun Q08 only after root copy freeze; Q16 belongs to the separate 4345/4346 probe.
