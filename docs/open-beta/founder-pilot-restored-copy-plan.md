# Founder pilot: isolated restored-copy plan

Статус:
`EXECUTABLE_PREFLIGHT_IMPLEMENTED / TARGET_AND_BACKUP_REQUIRED / NOT_EXECUTED`.

Read-only входной gate реализован как
`packages/database/scripts/founder-pilot-restored-copy-preflight.cli.mjs` и
описан в
[restored-copy preflight](./founder-pilot-restored-copy-preflight.md). Локальная
adversarial-матрица `6/6 PASS`, synthetic PostgreSQL 16.14 collector вернул
`READY`; synthetic residue удалён. Production backup/isolated restored target
ещё не предоставлены, поэтому это engineering evidence, а не утверждение о
выполненном rehearsal.

Exact activation-role `plan/apply/check/rollback` controller также реализован:
[restored-copy activation role deployment](./founder-pilot-activation-role-deployment.md).
Unit `6/6`; synthetic PostgreSQL full lifecycle и zero-residue приняты. Реальный
HBA/TLS/SCRAM direct handshake также принят на отдельном synthetic cluster:
[network acceptance](./founder-pilot-activation-role-network-acceptance.md).
Production-backup restored copy, dedicated pool и live API process ещё обязательны.

## Входные условия

- immutable production backup и отдельно полученный checksum;
- изолированный PostgreSQL target без маршрута к production;
- одноразовые restore/owner credentials, переданные вне Git и задач;
- отключённые SMTP, Telegram, Langame, schedulers и outbound workers;
- зафиксированные release SHA, artifact digest, schema/migration manifest;
- согласованные RPO/RTO и срок удаления restored copy.

## Исполнение

1. Проверить checksum backup до restore.
2. Проверить сетевую изоляцию target и отсутствие production service tokens.
3. Восстановить backup без изменения source production.
4. Выполнить исполнимый read-only preflight: actual artifact/backup bytes,
   loopback target identity, source migration state и outbound-off policy.
5. Выполнить read-only inventory и readiness.
6. Применить runtime roles/grants на restored copy.
7. Выполнить CURRENT193/194/196–199 production-like admission и регистрацию.
8. Выполнить apply, exact repeat, emergency revoke/rollback и zero-diff.
9. Доказать отсутствие rehearsal database/role/filesystem residue.
10. Удалить одноразовые credentials и зафиксировать cleanup evidence.
11. Сохранить PII-free отчёт с SHA/artifact, backup checksum, target identity,
    timestamps, RPO/RTO и результатами всех gates.

Любая неоднозначность, outbound effect, mismatch или ненулевой residue даёт
`BLOCKED_MANUAL`; owner route и mail outbox остаются закрытыми.

Этот документ хешируется SHA-256 как `restoredCopyPlanDigest`. Он и успешный
unit gate не являются доказательством фактического restore: для этого нужен
live `READY` receipt, затем отдельный принятый apply/rollback/cleanup отчёт.
