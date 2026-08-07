# CURRENT180–CURRENT190 release materialization plan

## Решение

Статус: `PLAN_COMPLETE_REFREEZE_REQUIRED / ASSEMBLY DENIED / NO DEPLOY`.

Read-only planner
`packages/database/scripts/current180-current190-release-materialization-planner.mjs`
устраняет неоднозначность lineage, но намеренно не создаёт migration, роли,
grants, базу или release artifact. Все authorization/effect flags остаются
`false`; production и текущие клубы не читаются и не изменяются.

## Два независимых контура

Schema lane имеет ровно один монотонный порядок:

`CURRENT180 → 181 → 182 → 183 → 184 → 185 → 186 → NEW 187 → 188 → 189 → 190`.

Для NEW CURRENT187 зарезервирован каталог
`20260805010000_identity_mail_cluster_application_admission_current187` и
контракт `IDENTITY_MAIL_CLUSTER_APPLICATION_ADMISSION_CURRENT187_V1`. Его exact
predecessor — CURRENT186 (`count=186`, SQL SHA `83c5df30…`, manifest
`cf354d5b…`). Proposal-only SQL anchor уже создан вне canonical Prisma chain,
но durable materialized anchor и release artifact ещё не создавались.

CURRENT187-E
`20260805050000_identity_mail_ddl_fence_ledger_current187` не является Prisma
migration. Это отдельный auxiliary synthetic evidence lane, допустимый только в
loopback CI database `lp_c187e_*`. Его запрещено копировать, переименовывать или
отмечать resolved внутри schema lane.

## Anchor admission

Planner принимает только data-only proposal с exact
directory/ordinal/predecessor и SHA-256 нормализованного в LF SQL. `valid=true`
возможен только для reviewed content с закреплённым normalized SHA
`dee4995df…`; любое содержательное изменение после newline-нормализации
отклоняется как `ANCHOR_SQL_NOT_REVIEWED` и получает другой plan digest. Exact
raw bytes и обязательный LF отдельно закреплены immutable manifest и
`.gitattributes`. Сам SQL обязан явно содержать оба exact контракта:

- новый materialized contract
  `IDENTITY_MAIL_CLUSTER_APPLICATION_ADMISSION_CURRENT187_V1`;
- существующий verifier contract
  `CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1`.

Метаданных proposal недостаточно. Также запрещены reuse CURRENT187-E, synthetic
DB/confirmation, `CREATE ROLE`, grant to `PUBLIC`, provider/network literals,
dynamic SQL, запись в `_prisma_migrations` и spoof через
`prisma migrate resolve`.

Нормализованный SQL SHA и byte length входят в `anchor.assessment`, поэтому
подмена proposal меняет `materializationPlanDigest`. Публичный inspector не
принимает произвольные `readText/repositoryRoot`; dependency injection вынесен
в явно test-only entrypoint с `externalEffectsUnverified=true`.

Даже корректный proposal не разрешает assembly: его должен потребить отдельный
reviewed assembler после role/OID и predecessor evidence.

## Незакрытые обязательства

До assembly отсутствуют:

1. materialized и независимо проверенный CURRENT187 anchor;
2. external predecessor evidence для CURRENT187–190;
3. live name/OID attestations для application, worker/coordinator, migration,
   DDL-fence и database-owner ролей;
4. reviewed refreeze manifest для десяти schema migrations;
5. disposable apply/rollback/re-apply/zero-diff assembler и PostgreSQL evidence.

Поэтому `productionApplyAuthorized=false`, route activation, provider calls,
role provisioning и tester access остаются запрещены.

## Проверка

```powershell
pnpm --filter database check:current180-current190-release-rehearsal-blocker
pnpm --filter database check:current180-current190-release-materialization-planner
```

Focused planner evidence: `18/18 PASS`; default no-proposal plan digest
`d0ebbcbc660a7817747d86ccc062deba3f6c85f51d9409e682f9f3ebab7a3c15`;
reviewed-proposal plan digest
`fb2582650a839a8fbe637fadfc671a680e0d944d6c96b9d9831c0c985cec721d`.
Planner SHA-256:
`b5dc5a6f42a5eca3708bc6bb9a8a5e5f2f2e2d8b829da1affa5fbe9c8ced8bd6`.

CI запускает blocker detector и planner подряд. Оба шага не подключаются к БД
и не выполняют filesystem writes или внешние вызовы.

## Следующий разрешённый slice

Proposal-only NEW CURRENT187 anchor и immutable manifest теперь зафиксированы в
[current180-current190-release-refreeze-proposal.md](current180-current190-release-refreeze-proposal.md).
После их независимой проверки можно создавать только disposable loopback
assembler. Canonical migrations, production apply, Tenant A/A1..A4 и Tenant
B/B1 остаются вне этого slice.
