# CURRENT187-G: secret-free semantic risk facts

## Статус

`ENGINEERING ACCEPTED / DENY-ONLY / NOT AN ALLOWLIST / NONCANONICAL / NOT DEPLOYABLE`.

Exact implementation `3804792e673583e40231257ec6d027549db86468` принят GitHub
Actions run `31397844858`: `3/3 SUCCESS`. SHA-bound artifact digest —
`sha256:83c1b1628ab5fbc9e8e7f8b4e511ff0caeb2b574c993234363b0e5d85fb01846`.
Подробное evidence:
[CURRENT187-G CI](./identity-mail-current187-g-ci-evidence-2026-08-10.md).

Этот slice превращает canonical catalog rows CURRENT187-C в детерминированные
семантические факты о ролях и правах. Он не решает, допустимы ли найденные
факты, не выдаёт production authority и не меняет production, tenant, club,
user, password, invite или provider state.

## Зачем нужен отдельный слой

CURRENT187-F доказал exact equality стабильных catalog fingerprints и signed
deployment envelope. Одного равенства недостаточно: одинаковый digest может
стабильно описывать как безопасную конфигурацию, так и `SUPERUSER`, опасное
membership, `PUBLIC` grant или неожиданный ownership.

CURRENT187-G закрывает первую половину semantic boundary:

1. принимает только exact canonical rows двенадцати catalog surfaces;
2. валидирует точные PostgreSQL JSON shapes и variant discriminators;
3. считает risk facts;
4. возвращает только counts и category digests без имён, OID и object identity;
5. оставляет `policyAllowlistEvaluated=false` и все launch/effect flags false.

Отдельный следующий slice должен сравнить этот receipt с независимо
утверждённым signed allowlist. Сам CURRENT187-G никогда не принимает решение
`SAFE` или `GO`.

## Покрытые catalog surfaces

- `roles`;
- `memberships`;
- `roleDatabaseSettings`;
- `ownedObjects`;
- `databaseSecurity`;
- schema/relation/column/type/routine all-grantee ACL;
- `defaultAclAllGrantees`;
- `effectiveObjectPrivileges`.

Из них формируются категории:

- privileged role attributes: `SUPERUSER`, `CREATEROLE`, `CREATEDB`,
  `REPLICATION`, `BYPASSRLS`;
- LOGIN roles;
- direct и elevated (`ADMIN`/`SET`) memberships;
- role/database settings;
- owned objects;
- current и default ACL grants;
- `PUBLIC` grants;
- grantable grants;
- фактически доступные effective privileges.

## Fail-closed invariants

- отсутствующая или лишняя surface отклоняется;
- неcanonical, несортированная, malformed или oversized row отклоняется;
- Proxy/accessor input не исполняется и отклоняется;
- exact row shape определяется surface и, где требуется, `kind`;
- `PUBLIC` обязан одновременно иметь `granteeOid="0"` и
  `granteeName="PUBLIC"`; противоречие отклоняется;
- receipt не содержит raw role/database/schema/object/grantee names, OID,
  settings или identities;
- receipt process-branded, deeply frozen и не имеет filesystem/database/network
  I/O;
- `authorization`, `canMutate`, `canSend`, `testAccessAuthorized` и
  `sharedBetaAccess` всегда `false`.

## Связь с signed policy

Для каждой connectable non-template database acquisition сохраняет только
`semanticRiskFactsDigest` и статус `FACTS_EXTRACTED_DENY_ONLY`; raw rows после
извлечения не попадают в receipt. Planner строит отсортированный cluster-wide
`semanticRiskFactsDigest` и включает его в `clusterCatalogDigest`.

Следовательно, существующий exact `clusterCatalogDigest` в purpose-bound
deployment envelope косвенно, но криптографически связывает и semantic facts,
не меняя CURRENT187 authority contract. Policy evaluator дополнительно требует
наличие branded semantic digest и публикует только его как
`sourceSemanticRiskFactsDigest`.

## Локальная проверка

```powershell
pnpm --filter database check:identity-mail-cluster-inventory-current187-planner
pnpm --filter database check:identity-mail-cluster-acquisition-current187
```

Focused локальный checkpoint: semantic facts `7/7`, planner
`16/16`, acquisition/policy `15/15`. Exact SHA/CI evidence фиксируется только
после полного refreeze CURRENT180–190 и зелёного GitHub CI.

## Что остаётся

1. Независимо утверждённый signed semantic allowlist с exact role name/OID,
   memberships, ownership, settings, current/default ACL и system baseline.
2. Отдельный fail-closed evaluator `facts + allowlist`, persisted consumption,
   revoke/expiry/replay и production root enrollment.
3. Host-side DDL fence executor, HBA/TLS/pooler/service-account probes и
   hostile concurrent multi-database matrix.
4. Production-like restore/apply/repeat/rollback/emergency/zero-diff rehearsal,
   Gate 1MT, cutover Tenant A/A1..A4, internal alpha и `SHARED BETA GO`.

До выполнения полного пути внешний OWNER invite остаётся `NO-GO`.
