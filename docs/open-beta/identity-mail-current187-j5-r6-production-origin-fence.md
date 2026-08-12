# CURRENT187-J5-R6: production-origin receipt fence

Дата фиксации: 12.08.2026.

Статус: `ENGINEERING ACCEPTED LOCALLY / NO PRODUCTION EFFECT / NOT DEPLOYABLE`.

## Закрытый риск

J1, J2, J3 и J4 предоставляют test-only dependency entry для проверки
production-mode нормализаторов без реального подключения. Ранее receipts из
этого пути попадали в тот же process-local WeakSet, что и receipts публичного
actual collector. Поэтому production runner мог отличить plain clone, но не мог
доказать, что brand появился именно после встроенного actual I/O path.

R6 разделяет provenance:

- общий verifier продолжает распознавать receipt для unit/adversarial tests;
- отдельный strict production-origin verifier принимает только receipt,
  созданный публичным actual collector;
- `WithDependenciesForTestOnly` никогда не добавляет receipt в strict set,
  даже при `environment=production` и `syntheticOnly=false`;
- production runner J1/J2/J3/J4 chain использует только strict verifiers.

## Инварианты

Strict brand выдаётся только следующими entry points с закреплёнными runtime
dependencies:

- `collectCurrent187PostgresSessionEvidence()`;
- `collectCurrent187EndpointTlsPeerEvidence()`;
- `collectCurrent187HbaReloadEvidence()`;
- `collectCurrent187PgBouncerControlPlaneEvidence()`.

Dependency-backed, synthetic и cloned receipts strict brand не получают.
Production runner проверяет J3/J4 до service loop, затем strict J1/J2 каждого из
четырёх purpose; любой отказ происходит до отрицательных network probes.

## Локальная приёмка

- J5 unit/contract contour: `42/42 PASS`;
- disposable protocol integration: `2/2 PASS`;
- integration строит production-mode dependency receipts для четырёх J1,
  четырёх J2, одного J3 и одного J4;
- все десять receipts имеют generic test brand и не имеют strict
  production-origin brand;
- production runner возвращает fail-closed до network I/O;
- harness counters: `plaintext=0`, `sslRequests=0`, `tlsStartups=0`;
- syntax, typecheck, scoped Prettier и `git diff --check`: `PASS`.

## Что остаётся

R6 не является positive production-like topology rehearsal. Следующий этап
должен вызвать четыре public actual J1/J2 collectors и actual J3/J4 collectors
в одном disposable/restored topology run, после чего production runner сможет
потребить их strict brands и выполнить negative matrix.

Далее отдельно обязательны external key ceremony, OS ACL/HSM/KMS, reviewed
production root, canonical ledger/runtime roles и restored-copy
apply/rollback/zero-diff.

Production, текущая сеть из четырёх клубов, внешний tenant/tester, invites и
providers не изменялись. Внешний доступ остаётся `NO-GO`.
