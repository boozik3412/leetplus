# CURRENT199: owner-only registration ledger candidate

| Поле                           | Значение                               |
| ------------------------------ | -------------------------------------- |
| Статус                         | `LOCAL NONCANONICAL CANDIDATE / NO-GO` |
| Дата                           | 14.08.2026                             |
| Canonical migration            | отсутствует                            |
| Production / Tenant A / tester | не изменялись                          |

Этот срез добавляет noncanonical PostgreSQL successor candidate для durable
CURRENT199 initial registration. Он не входит в `prisma/migrations` и не
применяется к production.

## Реализовано

- owner-only `LangameRuntimeTrustRegistrationV1` с immutable exact provenance;
- unique registration, enrollment-payload и protected-acquisition digests;
- не более одной generation-1 registration на database OID;
- append-only `REGISTERED/EXPIRED` event table;
- `SECURITY DEFINER` register с fixed `search_path`, live database/owner
  name/OID check, advisory transaction lock и exact replay;
- registration принимает только `synthetic_only=false`, fresh timeline и
  полный CURRENT198/199 contract binding;
- expiry возможен только после `validUntil`, exact replay поддержан;
- update/delete guards и `REVOKE ALL ... FROM PUBLIC`; новых grants нет;
- apply, activation, rotation, revocation, role/DB DDL и business-table access
  отсутствуют.

## Evidence

Static checksum/ACL/effect gate — `3/3`; database typecheck и diff check
зелёные. Migration полностью применена к отдельному локальному PostgreSQL
16.13: созданы ровно две relations и четыре CURRENT199 functions, все DDL/ACL
statements завершились успешно; disposable server остановлен после проверки.

## Остаток

Candidate ещё не имеет Prisma/owner adapter и actual register/replay/expiry
transaction fixture в CI. До canonical promotion нужны branded CURRENT199-only
adapter, bounded lost-response reconciliation, hostile replay/ACL/concurrency
PostgreSQL matrix, zero-residue rehearsal и independent review. Даже после
этого отдельные apply/rotation/revocation contracts и production root ceremony
останутся обязательными.
