# Controlled Beta-1: runtime-role lifecycle rehearsal

Статус: `ISOLATED LIFECYCLE ACCEPTED / PRODUCTION NO-GO`.

Этот PII-free record фиксирует отдельную от production репетицию runtime-роли
для Controlled Beta-1. Он не является разрешением на production deployment,
создание tenant, отправку OWNER invite или включение outbound.

## Принятые inputs

| Evidence | Значение |
| --- | --- |
| Exact release SHA | `d157764254507ead76231a913c1ffa3b5f445ef5` |
| Fast CI | [32383168039](https://github.com/boozik3412/leetplus/actions/runs/32383168039), `2/2 SUCCESS` |
| Full Release Admission | [32383465076](https://github.com/boozik3412/leetplus/actions/runs/32383465076), `4/4 SUCCESS` |
| Downloaded artifact SHA-256 | `0c8d7202e6afd5b58556b4a74b45842ef7e98fff34358cb00132d1665bafabb9` |
| Fresh protected backup SHA-256 | `1f762e22465ea52a654fcd95459f5d37cb4881dd75b198548704f3f0ac31863e` |
| Fresh source history | `153 applied / 4 rolled back / 0 unfinished` |

Backup был снят read-only, прошёл `pg_restore --list`, а затем восстановлен
только в отдельный loopback PostgreSQL instance. API, workers, SMTP, Telegram,
Langame и production service tokens не запускались.

## Зафиксированный порядок

Первый read-only runtime-role `plan` на исходных 153 migrations корректно
вернул `FOUNDER_PILOT_ACTIVATION_ROLE_FUNCTION_BOUNDARY_INVALID`: требуемая
security-definer wrapper boundary появляется только в более поздней canonical
migration. Это fail-closed результат, а не повод ослабить controller.

Поэтому на той же fresh copy был выполнен и принят строгий порядок:

1. preflight `READY_FOR_RESTORED_COPY_DATABASE_REHEARSAL`, evidence digest
   `230480c54a0e6c8a1da2d0d19d310796c959796bd3ba381b6a339a0df800a8899`;
2. production-history plan для exact четырёх разрешённых stale rows,
   digest `6e258858818dcd6a0120d3c4299b262b9d4939f721a601ea4d98007b9256fdee`;
3. reconcile ровно четырёх rows только на isolated copy;
4. materialized Prisma lane и deploy 34 canonical migrations;
5. повторный deploy `No pending migrations to apply` и history check
   `PRODUCTION_HISTORY_REHEARSAL_VERIFIED` — `187 applied / 4 rolled back / 0
   unfinished`;
6. отдельный post-migration manifest, связанный с тем же release/artifact/
   backup и final migration digest
   `5b990dcebb53f35c22faa2dcec77fbdda57a438909717047f2c5bb248368d8fe`;
7. activation-role `plan → apply → check → rollback → rollback-reconcile`.

`apply` создал ровно одну temporary least-privilege role с SCRAM verifier,
одним `CONNECT`, одним `USAGE` и одним wrapper `EXECUTE`; raw secret был
сгенерирован внутри disposable session, не выводился и уничтожен сразу после
apply. Secret-free apply receipt имеет digest
`cfff2cb1de83436502ec0aa902ca6b81289a34623e3a398ccf8aadb1acb113be4`;
independent attestation вернула тот же catalog digest
`1edf553ca988c2993111cbc82eb58c9932c923a20302f26a6ccd0f77c43ca0b4`.

После receipt-bound rollback повторный rollback вернул
`ACTIVATION_ROLE_ROLLBACK_RECONCILED`; read-only inventory подтвердил:

- runtime role count `0`;
- исходный `PUBLIC TEMPORARY=true` восстановлен;
- исходный `public CREATE=false` сохранён;
- production data, service units, tenant A и внешний tester не изменялись.

## Что это доказывает и чего не доказывает

Репетиция доказала actual production-history migration path и exact
least-privilege role lifecycle на свежем backup. Она не доказывает production
HBA/TLS/SCRAM route, dedicated pool/PgBouncer behaviour, live API session,
production canary или owner workflow. Эти действия остаются следующими
обязательными gates; до них решение `NO-GO` сохраняется.
