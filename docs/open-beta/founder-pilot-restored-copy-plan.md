# Founder pilot: isolated restored-copy plan

Статус: `PLAN_READY / TARGET_AND_BACKUP_REQUIRED / NOT_EXECUTED`.

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
4. Выполнить read-only inventory и readiness.
5. Применить runtime roles/grants на restored copy.
6. Выполнить CURRENT193/194/196–199 production-like admission и регистрацию.
7. Выполнить apply, exact repeat, emergency revoke/rollback и zero-diff.
8. Доказать отсутствие rehearsal database/role/filesystem residue.
9. Удалить одноразовые credentials и зафиксировать cleanup evidence.
10. Сохранить PII-free отчёт с SHA/artifact, backup checksum, target identity,
    timestamps, RPO/RTO и результатами всех gates.

Любая неоднозначность, outbound effect, mismatch или ненулевой residue даёт
`BLOCKED_MANUAL`; owner route и mail outbox остаются закрытыми.

Этот документ хешируется SHA-256 как `restoredCopyPlanDigest`. Он не является
доказательством фактического restore: для этого нужен отдельный принятый отчёт.
