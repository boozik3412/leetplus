# Founder pilot: stop and rollback plan

Статус: `APPROVED_FOR_ONE_PILOT / NOT_EXECUTED`.

Rollback owner: `founder-primary`.

## Stop conditions

- tenant/store scope mismatch или cross-tenant read/write;
- unexpected outbound message/call;
- owner invite, password, role или capability anomaly;
- data corruption, migration mismatch или reconciliation drift;
- compromised/lost key media or changed public fingerprint;
- readiness/health failure, unresolved security incident or nonzero residue;
- окончание 30-дневного pilot window.

## Последовательность

1. Закрыть owner activation route и новые invites.
2. Остановить outbound worker, SMTP, Telegram/Langame execution и schedulers для
   pilot tenant.
3. Перевести pilot tenant/store в suspended/inactive state без изменения
   текущей сети из четырёх клубов.
4. Revoke active invite/session/token и зафиксировать PII-free audit.
5. Выполнить runtime credential drain/revoke и CURRENT195 reconciliation.
6. При schema/config effect применить заранее проверенный rollback; не удалять
   evidence при неоднозначном DB state.
7. Проверить tenant isolation, zero inflight и отсутствие фоновых эффектов.
8. Сохранить incident/rollback receipt с release SHA, временем, причиной и
   фактическим RTO. Возобновление требует нового GO, старый GO не переигрывается.

Этот документ хешируется SHA-256 как `rollbackPlanDigest` CURRENT202.
