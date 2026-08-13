# CURRENT199: owner-only registration ledger candidate

| Поле                           | Значение                                 |
| ------------------------------ | ---------------------------------------- |
| Статус                         | `CI SHA ACCEPTED / NONCANONICAL / NO-GO` |
| Дата                           | 14.08.2026                               |
| Canonical migration            | отсутствует                              |
| Production / Tenant A / tester | не изменялись                            |

Этот срез добавляет noncanonical PostgreSQL successor candidate для durable
CURRENT199 initial registration. Он не входит в `prisma/migrations` и не
применяется к production.

## Реализовано

- owner-only `LangameRuntimeTrustRegistrationV1` с immutable exact provenance;
- unique registration, enrollment-payload и protected-acquisition digests;
- не более одной generation-1 registration на database OID;
- append-only `REGISTERED/EXPIRED` event table;
- `SECURITY DEFINER` register с fixed `search_path`, live database/owner
  name/OID и runtime-role name/OID/attributes check, advisory transaction lock
  и exact replay;
- registration принимает только `synthetic_only=false`, fresh timeline и
  полный CURRENT198/199 contract binding;
- expiry возможен только после `validUntil`, exact replay поддержан;
- update/delete guards и `REVOKE ALL ... FROM PUBLIC`; новых grants нет;
- apply, activation, rotation, revocation, role/DB DDL и business-table access
  отсутствуют.

## Evidence

Foundation SHA `7915912c8f1eb6180929e3d6886b5a33d4a6a29d` принят GitHub
Actions run `31741381875` как `3/3 SUCCESS`; artifact `9197547597`, digest
`sha256:5708eac673b36ed2d6bf9954bb32c5b718a670da57ac7d67c424285fee4a4f31`.

Следующий срез добавил test-only branded owner/Prisma adapter с
production entry fail-closed, exact session/database/owner/runtime-role
re-attestation и не более чем двумя попытками register/expiry после lost
response, а concurrent effect/close на одном driver отклоняются. Unit matrix —
`9/9`. Обновлённая migration с fingerprint
`8c55f0ebdc9da2e881b4b1a66e4cdea59a2a1f4576c107cfe24d633e3facc2fe`
применена к отдельному PostgreSQL 16.13; actual matrix `1/1` приняла concurrent
register/replay, hostile database-owner/OID/role-attribute/membership drift,
ACL, early-expiry denial,
concurrent expiry/replay и immutable guards. Тестовая БД и роль удалены, сервер
остановлен.

Финальный exact SHA `d3e6d8ea9e787d615b94080070724fafdb027b16` принят
GitHub Actions run `31744420994` как `3/3 SUCCESS`; artifact `9198621644`,
digest
`sha256:e46d9a70099af4857a66ed5430bf3def2735302d57d64c268d8b4cc368acbb87`.
Внутренний adversarial pass нашёл и до acceptance исправил concurrent-driver
state race; повторный pass не нашёл новых P0/P1.

## Остаток

Independent adversarial review отдельным проверяющим ещё обязателен. Production
factory намеренно отклоняет все вызовы; migration остаётся noncanonical. До
production-origin registration нужны отдельные apply/rotation/revocation
contracts и offline production-root ceremony; после них обязательны
production-like registration и zero-residue release rehearsals.
