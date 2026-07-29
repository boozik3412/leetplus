# Legacy identity inventory and future backfill contract

| Поле | Значение |
| --- | --- |
| Версия | 1.4 |
| Дата | 29.07.2026 |
| Backlog | `BETA-IAM-004B` |
| Contract | `IDENTITY_LEGACY_RECONCILIATION_V1` |
| Schema target | exact `CURRENT_169` |
| Текущий статус | `IMPLEMENTED_CANDIDATE`: local, exact-head CI и финальный independent security review приняты; production-like inventory pending |
| Release decision | `NO-GO`; production inventory не выполнялся, proposal/apply/rollback отсутствуют |
| Deployment | `NOT DEPLOYED`; аккаунты, invites, tokens и outbound effects не создаются |

## 1. Назначение и граница среза

Migration 169 намеренно оставила историческим `User` и `UserInvite`
`identityClaimRevision=NULL`. Обычные issue/reissue/revoke/accept writers
трактуют такую строку fail-closed и не присваивают ей provenance
автоматически.

Текущий bounded slice выполняет только privacy-safe inventory:

- читает глобальный identity namespace на exact `CURRENT_169`;
- классифицирует текущих owner-кандидатов, terminal history, collision,
  mismatch и review-only строки;
- выдаёт только aggregate/HMAC-bound evidence;
- на disposable PostgreSQL clone допускает synthetic fixtures для проверки
  классификации;
- не изменяет `User`, `UserInvite`, `IdentityEmailClaim` или audit rows.

Guarded read-only production inventory технически имеет отдельный
fail-closed attestation path, но в рамках текущего решения не запускался и не
разрешён к запуску. Signed proposal, production dry-run, apply, rollback и
zero-diff являются будущими отдельными решениями. Наличие decision
`READY_FOR_PROPOSAL` не является таким разрешением.

Обе Platform Admin route сохраняют `503`, application runtime сохраняет exact
six-RPC allowlist и zero effective `IdentityEmailClaim` table DML.

## 2. Модель ownership

Inventory использует ту же canonicalization, что migrations 167..169:

```text
lower(btrim(email) COLLATE "C")
```

Текущим owner-кандидатом считается:

1. каждый `User`, включая `isActive=false`: inactive User продолжает владеть
   своим email;
2. только live `UserInvite`: email задан, `acceptedAt=NULL`,
   `revokedAt=NULL`, а `expiresAt` находится после зафиксированной границы
   inventory.

Accepted, explicitly revoked и naturally expired invites являются terminal
history. Inventory учитывает их, но не присваивает им synthetic revision.

Строка с существующим bound claim и `identityClaimRevision=NULL` не считается
готовой к автоматическому repair: это ambiguous partial state и blocking
finding. Точно так же существующий claim нельзя молча переназначить другому
tenant, subject или claim type.

## 3. Runtime contract и environment

Точный CLI contract также публикуется через `--help`. Environment inputs:

| Переменная | Назначение |
| --- | --- |
| `DATABASE_URL` | Явно выбранная PostgreSQL database; значение не выводится |
| `NODE_ENV` | Runtime environment; production включает дополнительные fail-closed проверки |
| `RELEASE_SHA` | Exact lowercase 40-hex source SHA, связывающий evidence с candidate |
| `IDENTITY_LEGACY_INVENTORY_TARGET` | Только `development`, `staging` или `production`; должен согласовываться с runtime |
| `IDENTITY_LEGACY_INVENTORY_CONFIRM` | Должна равняться `run-identity-legacy-inventory` |
| `IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE` | Exact database binding; значение не попадает в report |
| `IDENTITY_LEGACY_INVENTORY_HMAC_KEY` | Отдельный reconciliation HMAC key длиной `32..4096` bytes |
| `IDENTITY_LEGACY_INVENTORY_HMAC_KEY_VERSION` | В текущем contract только `v1` |
| `IDENTITY_LEGACY_INVENTORY_PRODUCTION_ATTESTATION` | Только для production; exact value `I_ATTEST_THIS_IS_A_READ_ONLY_PRODUCTION_IDENTITY_LEGACY_INVENTORY` |
| `IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE_IDENTITY_DIGEST` | Только для production; exact 64-hex HMAC digest из отдельно approved custody |

Optional bounded settings:

| Переменная | Диапазон | Default |
| --- | ---: | ---: |
| `IDENTITY_LEGACY_INVENTORY_CONNECT_TIMEOUT_SECONDS` | `1..30` seconds | `10` |
| `IDENTITY_LEGACY_INVENTORY_LOCK_TIMEOUT_MS` | `100..5000` ms | `500` |
| `IDENTITY_LEGACY_INVENTORY_STATEMENT_TIMEOUT_MS` | `1000..120000` ms | `30000` |
| `IDENTITY_LEGACY_INVENTORY_TRANSACTION_TIMEOUT_MS` | `5000..600000` ms | `120000` |

Невалидное timeout-значение отклоняется до inventory. Актуальный help и
локальные non-production проверки запускаются командами:

```text
pnpm --filter database db:inventory:identity-legacy-backfill -- --help
pnpm --filter database check:identity-legacy-backfill-inventory
pnpm --filter database check:identity-legacy-backfill-release-artifact
pnpm --filter database db:smoke:identity-legacy-backfill-inventory
```

CLI option `--verify-release-artifact` без подключения к БД проверяет, что
runtime source, migration manifest, `packages/database/package.json` и
`pnpm-lock.yaml` являются exact blobs указанного `RELEASE_SHA`. Runtime
дополнительно требует exact Prisma Client `6.19.3`. Package-команда
`check:identity-legacy-backfill-release-artifact` использует именно этот mode.
Release binding сравнивает canonical realpath: на Linux path case должен
совпасть точно, case-insensitive сравнение разрешено только на Windows.
Frozen-lock CI/install и exact release-artifact verification являются
обязательным dependency-trust prerequisite.

Последняя команда является destructive fixture harness только для
подтверждённой loopback `*_ci` PostgreSQL source database; она запрещает
`NODE_ENV=production` и remote target. Для неё требуется отдельное
`IDENTITY_LEGACY_INVENTORY_SMOKE_CONFIRM=run-identity-legacy-inventory-smoke`.

### 3.1. Transport и production binding

Любой non-loopback PostgreSQL target обязан использовать Prisma 6 exact URL
contract: ровно один `sslmode=require` и ровно один `sslaccept=strict`.
Duplicate query parameters, URL host override и любой другой remote TLS mode
отклоняются. Plaintext допустим только для loopback fixture.

Production дополнительно допускается к чтению identity rows только когда:

- `pg_stat_ssl.ssl=true` для текущего backend connection;
- вычисленный `databaseIdentityDigest` совпадает с отдельно утверждённым
  `IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE_IDENTITY_DIGEST`;
- exact production attestation, target/runtime и database name согласованы.

Несовпадение любого production binding завершает запуск fail-closed и не
является разрешением ослабить transport либо повторить запуск с другим target.
В smoke harness injected migration artifact всегда маркируется
`evidenceScope=SYNTHETIC_FIXTURE` и `releaseArtifactBound=false`; production
injection отклоняется. Обычный CLI сам загружает exact Git artifact и только
его report может иметь `evidenceScope=RELEASE_BOUND`.

Secrets, production attestation, database name/URL и raw target identifiers
не передаются через commit, issue, CI artifact или launch-документ.

## 4. Exit codes

| Code | Решение | Значение |
| --- | --- | --- |
| `0` | `PASS / READY_FOR_PROPOSAL` | Read-only inventory завершён без blocking/review findings; это не authorization на proposal или apply |
| `1` | `CONTRACT / RELEASE / DATABASE / REPORT ERROR` | CLI/input, release SHA/artifact, target, attestation, TLS/URL, connect/query/timeout или report contract не прошёл |
| `2` | `BLOCKED / REVIEW` | Найдена collision, ambiguity либо строка, требующая явного решения |
| `3` | `SCHEMA_MISMATCH / ADMISSION_MISMATCH` | Только HMAC-signed rejection report: schema/catalog, runtime database identity либо least-privilege admission не совпали, `inventoryExecuted=false` |

Любой ненулевой exit сохраняет zero DML. Unknown reason category или
несходящиеся aggregate totals также являются contract error, а не
`READY_FOR_PROPOSAL`. Невалидные release SHA, target, confirmation,
production attestation либо missing/malformed expected database identity
digest относятся к exit `1`. Если valid approved expected digest не совпал с
runtime `databaseIdentityDigest`, signed report возвращает
`SCHEMA_MISMATCH`/exit `3`.

## 5. Permissions

Inventory выполняется отдельной least-privilege ролью:

- `LOGIN NOINHERIT`, без superuser/create role/create DB/bypass RLS;
- только `CONNECT`, public schema `USAGE` и exact `SELECT` на `22` columns:
  `3` migration + `6` User + `8` UserInvite + `5` IdentityEmailClaim;
- `updatedAt` не входит в reader grants;
- zero `CONNECT WITH GRANT OPTION`, `USAGE WITH GRANT OPTION`, database/public
  schema `CREATE`, а также non-public schema `USAGE/CREATE`;
- zero `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER`;
- zero sequence privileges;
- zero effective `USAGE` на foreign data wrappers, включая inherited/PUBLIC
  authority;
- zero effective `SET`/`ALTER SYSTEM` из `pg_parameter_acl`;
- zero ownership user-defined types;
- `ownershipDependencyCount=0` для database/schema/relation/function/type
  ownership dependencies;
- `systemSchemaCreateCount=0`;
- `systemSchemaPrivilegeCount=0` для запрещённой role/PUBLIC authority в
  system namespaces;
- `systemObjectPrivilegeCount=0`: нет direct role ACL на system objects и
  опасного PUBLIC ACL delta для relation/column/function;
- `systemSecurityDefinerFunctionCount=0`: в system namespaces нет executable
  `SECURITY DEFINER` function;
- `systemHighOidExecutableFunctionCount=0`: custom/high-OID system function
  не может быть executable независимо от `SECURITY DEFINER/INVOKER`;
- zero `EXECUTE` на reserve/assert/transition/release и raw lock helpers;
- transaction принудительно read-only и использует один consistent snapshot.

PUBLIC baseline сравнивается fail-closed:

- в `pg_catalog` допускается только exact initial ACL из `pg_init_privs`;
- built-in `information_schema` objects с OID `<16384` допускают только
  штатные `SELECT/USAGE` без grant option;
- custom/high-OID object либо иной ACL в `information_schema` отклоняется;
- прочие system namespaces не допускают PUBLIC ACL.

Target/TLS, exact identity catalog и полный least-privilege ACL admission
выполняются до чтения `_prisma_migrations`. Если pre-gate не пройден,
`migrationState.checked=false`: migration table и identity rows не читаются,
искусственный `MIGRATION_STATE_MISMATCH` не добавляется. Privilege-only failure
даёт чистый signed `ADMISSION_MISMATCH`, а catalog/schema drift сохраняет
исходный signed `SCHEMA_MISMATCH`.

Exact catalog admission проверяет:

```text
relations                 = 5
catalog columns           = 29 IAM columns
constraints               = 10
indexes                   = 8
functions                 = 9
IdentityEmailClaimType    = INVITE, USER, EMAIL_CHANGE / exact order
IdentityEmailClaim trigger = 1
enabled PG16 internal RI FK triggers = 8
```

Проверяются не только количества: обязательные identity relation/column
definitions, constraint/index/function/trigger manifests и function/trigger
body digests должны совпасть; owner `IdentityEmailClaimType` обязан совпадать
с owner текущей database. Signed `SCHEMA_MISMATCH` дают missing/altered
manifest identity object, overload/conflicting same-name object, enum-owner
drift, disabled/missing exact PG16 internal RI FK trigger либо extra
noninternal trigger на `IdentityEmailClaim`. Произвольные дополнительные
relations, columns, constraints и indexes вне manifest намеренно допускаются.

Application/runtime роль не используется как inventory authority. Временные
grants и роль должны быть отозваны после disposable-clone rehearsal либо
отдельно утверждённого production read-only inventory.

## 6. Reason categories

### Proposal

Inventory имеет только два create-only proposal-кода:

- `USER_CLAIM_CREATE_CANDIDATE` — единственный global canonical User, включая
  inactive, без conflicting claim;
- `LIVE_INVITE_CLAIM_CREATE_CANDIDATE` — единственный live invite без
  User/live-invite collision.

Это aggregate proposal findings, а не row proposal и не authorization на
backfill. Точно связанная строка не создаёт finding. Terminal history не
получает synthetic proposal.

### Review required

- `USER_SENSITIVE_IDENTITY_REVIEW` — Platform Admin либо unverified User
  требует отдельного решения;
- `LIVE_INVITE_LEGACY_TOKEN_REVIEW` — legacy live token требует отдельного
  решения о revoke/reissue либо доказанной custody;
- `ACCEPTED_INVITE_NULL_PROVENANCE_HISTORY`,
  `REVOKED_INVITE_NULL_PROVENANCE_HISTORY` и
  `EXPIRED_INVITE_NULL_PROVENANCE_HISTORY` — terminal history учитывается,
  но не получает synthetic revision;
- `TERMINAL_INVITE_EMAIL_UNSUPPORTED` — terminal history с unsupported email
  остаётся ручным review.

### Blocking

Стабильный blocking manifest:

- invalid identity input: `USER_EMAIL_UNSUPPORTED`,
  `USER_SUBJECT_ID_INVALID`, `LIVE_INVITE_EMAIL_MISSING_OR_UNSUPPORTED`,
  `LIVE_INVITE_SUBJECT_ID_INVALID`, `CLAIM_CANONICAL_UNSUPPORTED` и
  `CLAIM_SUBJECT_ID_INVALID`;
- collision/state: `ACTIVE_IDENTITY_CANONICAL_COLLISION` и
  `INVITE_STATE_MISMATCH`;
- accepted binding: `ACCEPTED_INVITE_BINDING_MISMATCH` и
  `ACCEPTED_INVITE_CLAIM_LINEAGE_MISMATCH`;
- provenance/owner/revision mismatch: `BOUND_CLAIM_NULL_PROVENANCE`,
  `USER_CLAIM_OWNER_MISMATCH`, `LIVE_INVITE_CLAIM_OWNER_MISMATCH`,
  `USER_CLAIM_REVISION_MISMATCH`, `LIVE_INVITE_CLAIM_REVISION_MISMATCH`,
  `USER_REVISION_WITHOUT_EXACT_CLAIM` и
  `LIVE_INVITE_REVISION_WITHOUT_EXACT_CLAIM`;
- orphan/unsupported claim topology: `ORPHAN_USER_CLAIM`,
  `ORPHAN_INVITE_CLAIM`, `EMAIL_CHANGE_CLAIM_PRESENT` и
  `SUBJECT_MULTIPLE_IDENTITY_CLAIMS`.

Collision, mismatch, invalid и review-only строки не переводятся в candidate
автоматически. Inventory ничего не удаляет, не нормализует persisted email и
не отзывает legacy token. Unknown, duplicate или incomplete manifest row
является contract error.

## 7. Privacy-safe evidence

Reader-facing report допускает только:

- schema/contract version и exact non-secret release SHA;
- live transaction snapshot timestamp;
- target/database/role HMAC digests;
- HMAC key version;
- aggregate counts по стабильным reason categories;
- `blockingTotal`, `proposalTotal`, `reviewTotal` и соответствующие code lists;
- deterministic content/execution digests и итоговое decision.
- явные `evidenceScope` и `releaseArtifactBound`, входящие в HMAC-bound
  content; synthetic fixture нельзя представить как release-bound evidence.

Запрещены raw email, User/UserInvite/claim IDs, names, tenant/store slug,
password/token/hash, invite URL, database URL/name, ciphertext и secrets.
Обычный SHA email/ID не является достаточной псевдонимизацией; используется
только domain-separated HMAC.

## 8. Stop conditions

Inventory немедленно прекращается с zero DML, если:

1. schema не exact `CURRENT_169`, migrations unfinished либо latest migration
   отличается от `20260729230000_identity_invite_writer_boundary`;
2. release SHA/artifact, target, expected database, production attestation
   либо approved database identity digest не совпадают;
3. remote transport не использует exact strict TLS либо production backend
   не подтверждён `pg_stat_ssl.ssl=true`;
4. exact catalog или least-privilege/read-only contract не подтверждён;
5. snapshot incomplete, превысил bounded timeout или aggregate totals
   не сходятся;
6. обнаружена неизвестная reason category;
7. есть canonical collision, invalid email, claim/provenance mismatch или
   accepted-binding anomaly;
8. есть Platform Admin, unverified User или legacy live token без отдельного
   review decision;
9. PII/secret появился в stdout, stderr, report либо error detail;
10. код пытается создать/изменить User, UserInvite, claim, token, trial, outbox,
   audit или tenant/store state;
11. изменились application runtime grants либо одна из закрытых admin routes;
12. guarded production inventory не имеет отдельного change approval;
13. запрошен proposal/apply/rollback mode, которого в текущем candidate нет.

## 9. Future signed reconciliation

Следующие этапы не входят в `IMPLEMENTED_CANDIDATE` и не наследуют
authorization из read-only report:

1. используя принятые local/exact-head CI/review prerequisites, отдельно
   выполнить approved production-like read-only inventory;
2. назначить owner каждому non-zero finding и подписать bounded proposal;
3. выполнить disposable-clone row dry-run с lock/recheck/CAS;
4. отдельно принять production apply authority, backup и rollback;
5. выполнить apply, rollback rehearsal и повторный zero-diff inventory;
6. только после zero blocking перейти к activation locator, encrypted outbox,
   persisted GO и initial OWNER invite.

Production proposal/apply нельзя добавлять как скрытый flag текущего script.
Это должен быть отдельный reviewed contract с явной authority,
idempotency, audit и rollback evidence.

## 10. Acceptance evidence

На момент версии `1.3` принято local engineering evidence текущего worktree:

```text
core --self-test                         = PASS / 18 checks
smoke harness --self-test                = PASS / 18 checks
Node contract unit suite                 = PASS / 17 of 17
PostgreSQL 16 disposable-clone smoke     = PASS / 3 clones
healthy topology                         = PASS / zero findings
proposal/review topology                 = 2 proposals + REVIEW
adversarial topology                     = BLOCKED / reachable codes
catalogDriftRejected                     = true
authorityDriftRejected                   = true
clusterAclRestored                       = true
aggregate/HMAC privacy inspection        = PASS
source database writes                   = 0
cleanup                                  = guaranteed LIFO
cleanup residue                          = 0 databases / 0 roles / 0 parameter ACL
```

Smoke использовал три отдельные exact-column least-privilege reader role.
Все его reports явно имели `SYNTHETIC_FIXTURE /
releaseArtifactBound=false`. Local harness не является production-like
inventory и не использует production data. Local evidence также подтвердило
exact catalog `5 relations / 29 IAM columns / 10 constraints / 8 indexes /
9 functions / 3 ordered enum labels / 1 identity trigger / 8 enabled PG16
internal RI FK triggers`, reader allowlist `22 columns` без `updatedAt`,
полный pre-gate до migration read и fail-closed TLS/catalog negatives.
Authority drift smoke отдельно отклонил effective `postgres_fdw USAGE`,
`work_mem SET` через `pg_parameter_acl`, `pg_catalog CREATE`,
`pg_toast USAGE`, `pg_authid SELECT`, direct и PUBLIC
`pg_read_file EXECUTE`, enum-owner drift, а также отдельно созданные
executable high-OID `SECURITY DEFINER` и `SECURITY INVOKER` functions в
`pg_catalog`. PUBLIC ACL проверялся относительно штатного PG16
`pg_init_privs`/built-in `information_schema` baseline, а не как запрет
initial ACL. Catalog drift отклонил disabled RI trigger. Оба function
negative и все authority grants гарантированно очищаются LIFO; финальный
cleanup подтвердил `clusterAclRestored=true` и zero DB/role/parameter-ACL
residue в source cluster.

В CI добавлены отдельные gates:

- `Validate legacy identity read-only inventory` запускает
  `pnpm --filter database check:identity-legacy-backfill-inventory`;
- `Verify legacy identity exact-head release artifact` запускает
  `pnpm --filter database check:identity-legacy-backfill-release-artifact`;
- `Rehearse legacy identity inventory on disposable clones` запускает
  `pnpm --filter database db:smoke:identity-legacy-backfill-inventory`.

Exact-head implementation
`d1162eed042893ec3b27ed823bdaddfa64c7e90f` принят GitHub Actions
[`30479020686`](https://github.com/boozik3412/leetplus/actions/runs/30479020686)
(`run #39`), все три job — `PASS`. Финальный independent security review
завершён с `PASS` без оставшихся actionable P0/P1/P2.

Это не закрывает `BETA-IAM-004B`: production-like inventory должен быть
принят отдельно. Production inventory не запускался, proposal/apply/rollback
и deploy остаются `NOT RUN / NO-GO`.
Реальная учётная запись тестера не создана.

Принятый `CURRENT_169` writer-boundary checkpoint
`f5d39fd89145c995c51e7005698327f5581a5cd8` / GitHub CI
[`30467882578`](https://github.com/boozik3412/leetplus/actions/runs/30467882578)
(`run #37`), `3/3 PASS`, является prerequisite, но не evidence нового
inventory slice и не production-like admission.

Связанные документы:

- [identity invite writer boundary](./identity-invite-writer-boundary.md);
- [identity email claim foundation](./identity-email-claim-foundation.md);
- [initial OWNER identity and activation](./initial-owner-identity-and-activation.md);
- [shared multi-tenant launch checklist](./shared-multi-tenant-launch-checklist.md).
