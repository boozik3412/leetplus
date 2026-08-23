# CURRENT180–CURRENT190 release rehearsal blocker detector

## Решение

Полный disposable release rehearsal пока механически запрещён. Скрипт
`packages/database/scripts/current180-current190-release-rehearsal-blocker.mjs`
является read-only detector, а не assembler/deployer. Он завершается отчётом
`BLOCKED` и не открывает соединение с PostgreSQL.

## Доказанные блокеры

1. Prisma lexical order для каталогов кандидатов равен
   `180..186,188,189,190,187`, а логический порядок должен быть `180..190`.
2. SQL guards CURRENT180–185 допускают только
   `lp_imtec_<32 hex>_ci`, CURRENT187 — только `lp_c187e_<12 hex>_ci`;
   единого допустимого имени БД нет.
3. У CURRENT187–190 `predecessor.resolved=false`.
4. Required contracts CURRENT187 и CURRENT188 не материализованы в
   migration-chain.
5. CURRENT187 требует явных synthetic duty-role name/OID.
6. Foundation inventory gates CURRENT180/181/183–186 отвергают новый состав
   candidate-каталогов.

Пока существует любой из этих пунктов, копирование каталогов кандидатов в
`prisma/migrations` или последовательный `prisma migrate deploy` небезопасны и
запрещены.

## Зафиксированная целостность

Detector закрепляет:

- canonical base `CURRENT179/179`, head
  `20260731120000_identity_mail_delivery_release_head`;
- полные metadata и SQL SHA всех 11 CURRENT180–190 candidates;
- SHA семи CURRENT187 authority/tooling файлов;
- SHA шести предшествующих foundation gates.

Candidate-set digest:
`1623309f985a40d933b3d52cbfd98ba3bf9438350c0f59f9a21b4c0c0524e3f4`.

Blocker-report digest:
`ddec0c400a08f04183ffc0348fd202cfa509973cd7b37973b4290eb482076916`.

Любой byte/metadata/predecessor drift переводит проверку из структурированного
`BLOCKED` в fail-closed integrity error.

## Safety boundary

Проверка допускает только `NODE_ENV=test`, loopback host и точное имя
`lp_c180190_<32 hex>_ci`. Она не содержит database/provider clients, deploy
commands или role/grant SQL и декларирует нулевые эффекты для:

- canonical migrations;
- PostgreSQL connections;
- roles/grants;
- application routes;
- external providers;
- production.

```powershell
pnpm --filter database check:current180-current190-release-rehearsal-blocker
```

Focused evidence: `13/13 PASS`. Проверка обязательна в CI и должна продолжать
падать при любом ослаблении deny-only boundary.

## Принятый следующий slice

Read-only refreeze/materialization planner теперь принят отдельно:
[current180-current190-release-materialization-plan.md](current180-current190-release-materialization-plan.md).
Он отделяет CURRENT187-E в auxiliary evidence lane, резервирует новый
CURRENT187 admission anchor и оставляет assembly/deploy deny-only.

Exact proposal-only anchor и raw-byte refreeze manifest теперь проверяются
отдельным deny-only verifier:
[current180-current190-release-refreeze-proposal.md](current180-current190-release-refreeze-proposal.md).
Они остаются вне canonical/migration-candidates и не являются materialized
release.

Нельзя исправлять проблему редактированием уже frozen candidate bytes. Теперь
после independent review proposal нужны отдельные assembler/rehearsal artifacts,
которые:

1. потребляют один монотонный timestamp/order из immutable manifest;
2. формирует единый disposable guard contract;
3. материализует predecessor contracts и пересчитывает manifest/SHA chain;
4. привязывает synthetic application/worker role names и OID;
5. повторно запускает все foundation/static/PG gates на новом release set;
6. только после независимой проверки materialized anchor и manifest позволяют
   создать disposable assembler;
7. выполняет apply/rollback/re-apply/zero-diff сначала на свежей loopback DB,
   затем на восстановленной production-like копии без внешних эффектов.

Production, четыре текущих клуба и внешний тестер остаются вне этого процесса
до последующего explicit `GO`.
