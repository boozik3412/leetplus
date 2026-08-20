# Founder pilot: stop and rollback plan

Статус: `APPROVED_FOR_ONE_PILOT / NOT_EXECUTED`.

Rollback owner: `founder-primary`.

## Runtime cutover rollback before pilot effects

Первый artifact cutover больше не возвращает mutable `current` и не делает
same-port restart. Legacy API/Web либо предыдущий slot остаются hot, а nginx
active include переключается атомарно. Для rollback используется только
root-only `.intent` или accepted `.receipt`, созданный
`docs/deployment/production-artifact/blue-green-cutover.sh`:

1. проверить exact record/digests и direct liveness + boot-enabled state
   предыдущих API/Web units до изменения routing;
2. восстановить exact previous target/digest и повторно доказать, что active
   link разрешается именно в него;
3. выполнить `nginx -t` и graceful reload даже если link уже был восстановлен
   предыдущей оборванной попыткой, не останавливая процессы;
4. получить HTTP success от `https://api.leetplus.ru/health` и
   `https://leetplus.ru/`;
5. при отсутствии внешнего evidence оставить previous link/processes
   восстановленными, но не объявлять rollback принятым.

Handled exit использует тот же exact guard. `SIGKILL`/host loss оставляет
root-only intent: pre-nginx recovery восстанавливает link без рекурсивного
systemd reload, затем отдельный post-start watchdog делает reload/public smoke.
До архивации intent новый switch запрещён.

Backup restore не является обычным runtime rollback: после migration он
допустим только при write quiesce/PITR. Штатный DB incident идёт fix-forward
после заранее принятого N/N-1 old-SHA compatibility smoke.

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
