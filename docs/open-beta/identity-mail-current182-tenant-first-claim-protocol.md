# Identity-mail tenant-first claim protocol и CURRENT182 candidate

| Поле | Значение |
| --- | --- |
| Контракт | `IDENTITY_MAIL_TENANT_FIRST_CLAIM_PROTOCOL_CANDIDATE_V1` |
| Статус реализации | `IMPLEMENTED_IN_BRANCH / CURRENT179_RUNTIME_COMPATIBLE` |
| Статус SQL candidate | `SHA_PINNED / NOT_CANONICAL / NOT_DEPLOYABLE` |
| Каноническая production-схема | `CURRENT_179 / 20260731120000_identity_mail_delivery_release_head` |
| Stacked prerequisites | dormant `CURRENT180`, dormant `CURRENT181` |
| CURRENT182 candidate | `20260801030000_identity_mail_tenant_first_claim_protocol` |
| SQL SHA-256 | `4367c2c50b036ae21c22b88dc0980895c9010abb018c3f7a04d58ed0f00efa22` |
| Дата | 01.08.2026 |

## 1. Решение

Все поддерживаемые операции, которые одновременно затрагивают tenant,
`UserInvite`, `IdentityEmailClaim` или identity-mail outbox, обязаны входить в
один порядок блокировок:

```text
bounded SERIALIZABLE transaction
  -> transaction-local statement_timeout=25s, lock_timeout=5s
  -> tenant advisory xact lock
  -> canonical identity-email advisory lock
  -> UserInvite / IdentityEmailClaim / User / outbox relation locks and DML
  -> commit or complete rollback
```

Tenant lock вычисляется только одним способом:

```text
pg_advisory_xact_lock(
  hashtextextended(
    'leetplus:identity-mail-tenant:v1:' || tenantId,
    180
  )
)
```

Разные tenant используют разные advisory keys и продолжают работу независимо.
Повторный захват того же transaction-scoped lock внутри одного backend
допустим, поэтому внешний API/worker wrapper совместим и с текущими RPC
`CURRENT179`, и с будущими tenant-first RPC из candidate stack.

## 2. Прикладные пути

| Путь | Tenant-first boundary | Relation/claim mutation |
| --- | --- | --- |
| Создание приглашения | `IdentityEmailClaimService.runTenantTransaction` | reserve -> create `UserInvite` -> transition |
| Reissue и revoke старого invite | тот же runner | assert -> create new -> revoke old -> transition |
| Cancel | тот же runner | assert -> revoke -> release claim |
| Accept | тот же runner | assert -> Tenant/User/UserInvite writes -> transition to USER |
| Shared tenant provision/replay | slug lock -> tenant locator/new UUID -> tenant lock -> fresh platform-authority lock | shell, entitlements, reservation и replay assertion |
| Emergency suspend | bounded transaction -> tenant locator -> tenant lock -> authoritative re-read | suspend tenant, stores, integrations и pending invites |

Claim API больше не принимает произвольный Prisma transaction client. Он
принимает только runtime-branded wrapper, созданный после проверки
`SERIALIZABLE`, read-write режима, локальных timeout и успешного tenant lock.
Wrapper привязан к одному tenant; попытка использовать его для другого tenant
отклоняется до RPC.

Whole-transaction retry ограничен одним повтором. `40001`, `40P01`, `55P03`,
`57014` и Prisma `P2034` переводятся в типизированный
`IDENTITY_CLAIM_RETRY_REQUIRED`; бизнес-ошибки и неидемпотентные внешние эффекты
не повторяются. В текущих callback находятся только транзакционные DB-операции.

## 3. Текущий CURRENT179 worker

`PrismaIdentityMailWorkerRepository` сохраняет канонические CURRENT179
signatures и receipts, но каждый tenant-scoped RPC теперь выполняет через тот
же bounded tenant-first transaction:

- per-tenant readiness assert;
- `claimOne`;
- `reapExpired`;
- provider-attempt marker;
- все completion outcomes.

CURRENT179 marker/completion RPC адресуются только по `outboxId` и сами не
принимают tenant. Поэтому repository не доверяет `input.tenantId`: успешный
`CLAIMED` receipt создаёт private process-local binding
`outbox -> tenant/invite/lease/digests/revision`. Marker/completion допускаются
только при exact совпадении этого DB-derived binding, а tenant lock берётся по
его tenantId. Unbound, cross-tenant, stale lease или revision mismatch
отклоняются до открытия транзакции. После marker binding продвигается по
receipt revision, после terminal/retry/cancel — удаляется.

Worker runtime не получает relation/column privileges: wrapper и claim binding используют
только PostgreSQL built-ins и пять ранее разрешённых `SECURITY DEFINER` RPC.
Это закрывает coexistence gap до любого продвижения dormant CURRENT181/182 и
не меняет migration head/count, worker allowlist или release contract.
Process-local binding не заменяет tenant-aware v2 RPC для crash/lost-response
resume; этот P2 остаётся fail-closed через reaper/reconcile gate.

## 4. CURRENT182 database boundary

Candidate находится только в
`packages/database/migration-candidates/20260801030000_identity_mail_tenant_first_claim_protocol`.
Он atomically заменяет bodies пяти канонических claim entrypoints:

- `identity_email_claim_reserve_invite_v2`;
- `identity_email_claim_assert_invite_v1`;
- `identity_email_claim_assert_invite_locator_v1`;
- `identity_email_claim_transition_v2`;
- `identity_email_claim_release_v2`.

После чистой scalar validation каждый body берёт общий tenant lock до
email-lock, relation read, row lock или DML. Три устаревших v1 writer entrypoint
заменяются немедленными `55000 / LEGACY_IDENTITY_CLAIM_WRITER_RETIRED` stubs.
PUBLIC execute отозван, новые grants/roles/enrollment не создаются. Candidate
имеет `authorization=false`, `canMutate=false`, `status=NOT_DEPLOYABLE`.

Frozen CURRENT181 prerequisite не изменён; его SQL SHA-256 остаётся
`b78b40ce37f48419c8d9e4f6ad8a90ddb9a242128a33d7dbfa76d8439ba0f455`.

## 5. Acceptance evidence

Локально обязательны:

- API focused и full regression;
- API typecheck и целевые ESLint gates;
- exact unit/static checks порядка settings -> tenant lock -> RPC;
- CURRENT182 foundation validator, negative mutation probes и checksum pin;
- derived exact digest всего ordered CURRENT181 predecessor stack; согласованный
  ошибочный pin в SQL/metadata/static validator обязан падать offline;
- successor-aware CURRENT180/CURRENT181 validators с exact ordered
  `[CURRENT180, CURRENT181, CURRENT182]` и fail-closed unknown/reorder cases;
- CURRENT182 disposable apply/catalog/ACL/rollback/source-zero-diff smoke;
- PostgreSQL cross-path fixture на отдельной canonical CURRENT179 clone.

Текущий локальный результат: application tenant/claim paths `5/5` suites,
`138/138`; current worker repository `1/1`, `55/55`; identity-mail worker
package `8/8`, `243/243`; full API `116/116`, `2510 PASS / 2 todo`. API
production typecheck, targeted ESLint и build — `PASS`. CURRENT182 foundation
— `15/15`, smoke self-test — `6/6`; successor-aware CURRENT180/CURRENT181
foundation — `84/84` и `85/85`.
Восемь PostgreSQL cross-path tests компилируются и обнаруживаются, но до
удалённого CI остаются gated, потому что локальный PostgreSQL не используется.

PostgreSQL fixture включает:

- create winner/loser;
- cancel, reissue/revoke и accept против worker lock order;
- фактический `PrismaIdentityMailWorkerRepository.claimOne()` на CURRENT179;
- наблюдаемый advisory wait по отдельным backend PID;
- независимый прогресс Tenant B;
- application rollback без partial state;
- реальный recovery после `55P03` и `57014`;
- неизменный `pg_stat_database.deadlocks`, явный запрет `40P01`;
- force-drop disposable databases/roles и zero residue.

Actual worker fixture использует безопасный `EMPTY` claim. Synthetic relation
fixture отдельно воспроизводит полный worker order через `UserInvite`, email
lock и `IdentityEmailClaim`. Эти два доказательства нельзя выдавать за полный
ACTIVE/DRAINING/coordinator/outbox runtime matrix.

## 6. Что остаётся release blocker

Этот slice закрывает реализацию общего lock protocol, но сам по себе не даёт
`SHARED BETA GO` и не разрешает production deploy. До promotion остаются:

1. actual non-empty HOLD/PENDING outbox и ACTIVE/DRAINING worker/coordinator
   matrix на production-like PostgreSQL;
2. P2 provider-mark/complete lost-response replay либо typed reconcile handoff;
3. signed runtime attestation, exact role OID/grants и enrollment evidence;
4. backfill, signed apply/rollback/zero-diff, backup/restore и canary;
5. отдельное решение `PRODUCTION DEPLOY GO`, затем отдельное
   `SHARED BETA GO`.

До этих решений production остаётся на `CURRENT179/179`; Tenant B, owner
account, invite, SMTP и внешний тестовый доступ не создаются.
