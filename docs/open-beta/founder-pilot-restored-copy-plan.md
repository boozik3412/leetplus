# Founder pilot: isolated restored-copy plan

Статус:
`PRODUCTION BACKUP RESTORED / CLEAN APPLY+REPEAT+TLS ROLE ROLLBACK PASS`.

Read-only входной gate реализован как
`packages/database/scripts/founder-pilot-restored-copy-preflight.cli.mjs` и
описан в
[restored-copy preflight](./founder-pilot-restored-copy-preflight.md). Локальная
adversarial-матрица принята. На 18.08.2026 production backup получен read-only,
восстановлен в отдельный loopback PostgreSQL и принят clean rehearsal. Полный
PII-free отчёт:
[production restored-copy rehearsal](./founder-production-restored-copy-rehearsal-2026-08-18.md).

Exact activation-role `plan/apply/check/rollback` controller также реализован:
[restored-copy activation role deployment](./founder-pilot-activation-role-deployment.md).
Unit `6/6`; synthetic PostgreSQL full lifecycle и zero-residue приняты. Реальный
HBA/TLS/SCRAM direct handshake также принят на отдельном synthetic cluster:
[network acceptance](./founder-pilot-activation-role-network-acceptance.md).
Production-history migration lane и direct TLS role lifecycle на настоящем
backup приняты. Новый exact-SHA artifact и restored-copy trusted TLS SMTP +
protected enrollment/SENT/accept/disable также приняты. Gate 1MT/2,
production roles/secrets, controlled SMTP canary и production cutover ещё
обязательны.

## Входные условия

- immutable production backup и отдельно полученный checksum;
- изолированный PostgreSQL target без маршрута к production;
- одноразовые restore/owner credentials, переданные вне Git и задач;
- отключённые SMTP, Telegram, Langame, schedulers и outbound workers;
- зафиксированные release SHA, artifact digest, schema/migration manifest;
- согласованные RPO/RTO и срок удаления restored copy.

## Исполнение

1. `DONE`: проверить checksum backup до restore.
2. `DONE`: проверить сетевую изоляцию target и отсутствие production service tokens.
3. `DONE`: восстановить backup без изменения source production.
4. `DONE`: выполнить исполнимый read-only preflight: actual artifact/backup bytes,
   loopback target identity, source migration state и outbound-off policy.
5. `DONE`: выполнить read-only inventory и readiness.
6. `DONE`: materialize exact production-history lane и применить migration.
7. `DONE`: выполнить exact repeat и data zero-diff.
8. `DONE`: применить, attested-проверить и rollback runtime role.
9. `DONE`: принять direct TLS 1.3/HBA/SCRAM matrix.
10. `DONE`: сохранить PII-free отчёт с SHA/artifact, backup checksum, target identity,
    timestamps, RPO/RTO и результатами всех gates.
11. `DONE`: собрать новый exact-SHA artifact и повторить artifact-bound gate.
12. `DONE`: на disposable clones выполнить trusted TLS SMTP worker и полный
    protected enrollment/SENT/accept/disable workflow.
13. После следующих Gate 1MT/2 удалить одноразовые credentials/copy и зафиксировать
    cleanup evidence.

Любая неоднозначность, outbound effect, mismatch или ненулевой residue даёт
`BLOCKED_MANUAL`; owner route и mail outbox остаются закрытыми.

Этот документ хешируется SHA-256 как `restoredCopyPlanDigest`. Он и успешный
unit gate не являются доказательством фактического restore: для этого нужен
live `READY` receipt, затем отдельный принятый apply/rollback/cleanup отчёт.
