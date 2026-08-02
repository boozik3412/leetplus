# Design-partner identity writer isolation

| Поле | Значение |
| --- | --- |
| Contract | `DESIGN_PARTNER_IDENTITY_WRITER_ISOLATION_V1` |
| Версия | 1.0 |
| Дата | 29.07.2026 |
| Статус | `ACCEPTED_ENGINEERING_CHECKPOINT`; exact-head CI/PostgreSQL/review приняты |
| Schema target | `CURRENT_169`; migrations не изменены |
| Release decision | `NO-GO`; production, account и invites не изменялись |

## Назначение

Optional `SINGLE_DESIGN_PARTNER_V1` исторически имел отдельные operator-only
writers для создания isolated tenant и ротации OWNER invite. После введения
общей sealed identity state machine этот параллельный путь нельзя оставлять
способом записи `UserInvite`: он мог бы создавать identity вне будущего
activation locator, persisted GO, encrypted outbox и единого
reserve/assert/transition/release workflow.

Этот checkpoint изолирует legacy writers. Он не переносит их поведение в новый
контур и не создаёт временный обход для тестового доступа.

## Fail-closed контракт

Два legacy действия отключены:

```text
provision
rotate-invite
```

Для каждого действия executable CLI и exported writer entrypoint завершаются
ошибкой:

```text
DESIGN_PARTNER_IDENTITY_WRITER_DISABLED
```

Отказ происходит до:

1. чтения или валидации manifest;
2. создания Prisma client или открытия подключения;
3. любого SQL/transaction/table write;
4. генерации invite token;
5. вычисления нового invite receipt;
6. формирования или вывода registration URL.

Из production module удалены legacy write bodies, token generation dependency
и invite URL builder. Поддерживаемая package-level operator surface замкнута:
единственный script namespace `design-partner:*` указывает на guarded CLI, а
сам CLI не импортирует и не вызывает отключённые writers. Exported functions
оставлены только как fail-closed compatibility stubs.

Это граница поддерживаемого operator path текущего candidate. Она не является
утверждением, что произвольный новый repository code или процесс с DB-owner
credentials технически не может записать таблицу. Такие полномочия находятся
вне threat model этого checkpoint и должны отдельно ограничиваться runtime DB
role/credentials, CI review и будущим shared sealed activation writer. Наличие
старой команды в CLI help означает только явный документированный отказ, а не
скрытый feature flag.
Оператор не должен пытаться запустить `provision` или `rotate-invite`: эти
команды не являются runbook-действиями и не могут использоваться для создания
Tenant D, Store D1 или OWNER invitation.

## Разрешённые legacy операции

| Операция | Режим | Допустимое назначение |
| --- | --- | --- |
| `status` | Read-only | Проверить уже существующий isolated fixture и его исторические receipts |
| `suspend` | Narrowing-only write | Аварийно выключить уже существующий isolated fixture |
| `provision` | Disabled | Всегда fail-closed до manifest/Prisma/БД/token |
| `rotate-invite` | Disabled | Всегда fail-closed до manifest/Prisma/БД/token |

### Read-only `status`

`status` не создаёт и не изменяет Tenant, Store, User, UserInvite, role,
integration или audit event. На пустой БД он возвращает decision
`DESIGN_PARTNER_IDENTITY_WRITER_DISABLED`,
`emptyTenantDatabase=true` и `sharedSealedIdentityActivationRequired=true`;
это явный запрет legacy provisioning, а не readiness к нему.

Для уже существующих isolated fixtures `status` сохраняет прежнюю строгую
проверку:

- один exact `SUSPENDED` Tenant и один inactive Store;
- provisioning marker и canonical manifest digest;
- HMAC-bound initial receipt;
- HMAC-bound rotation receipts с operation ID;
- invite ID, token hash и signed upper expiry;
- запрет лишних IAM/integration rows;
- rejection при receipt tamper, token-hash drift или продлении TTL.

Эта проверка сохраняет возможность диагностировать ранее созданный fixture,
но не доказывает право создать новый и не является `DESIGN_PARTNER GO`.

### Emergency `suspend`

`suspend` остаётся только как средство уменьшения blast radius. После
проверки exact existing provisioning marker оно может:

- перевести существующий `ACTIVE` Tenant в `SUSPENDED` либо оставить уже
  `SUSPENDED` Tenant в том же состоянии;
- выключить существующие Store;
- выключить active integration sources и credentials;
- отозвать pending invites с сокращением доступного срока.

Операция не создаёт Tenant, Store, User, invite, token, URL или новую login
identity, не активирует surface и не расширяет capability. Она не заменяет
полную stop sequence: processes/jobs и sessions останавливаются отдельными
контролируемыми действиями. Terminal/unknown lifecycle, включая `ARCHIVED`,
отклоняется до любого write и не может быть возвращён в `SUSPENDED`.

## Что намеренно не менялось

Checkpoint не содержит migration и не меняет:

- Prisma schema и target `CURRENT_169`;
- таблицы, constraints, indexes, functions или triggers;
- exact six-RPC runtime allowlist:
  две guest-game RPC и
  `identity_email_claim_reserve_invite_v2`,
  `identity_email_claim_assert_invite_v1`,
  `identity_email_claim_transition_v2`,
  `identity_email_claim_release_v2`;
- zero effective runtime table DML на `IdentityEmailClaim`;
- shared shell-only service candidate;
- Platform Admin HTTP surface.

Обе shared admin route остаются закрыты:

```text
POST /admin/shared-beta/tenants/provision
  → 503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING

POST /admin/tenants/:tenantId/initial-owner-invite/revoke
  → 503 SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING
```

Production deployment, migration apply, Tenant B/D, Store B1/D1, аккаунт
тестера, пароль и invitation не создавались.

## Проверки текущего candidate

Локально принято:

```text
design-partner provisioning unit + executable boundary: 23/23 PASS
```

Проверки доказывают:

- CLI reject предшествует manifest read и database client;
- error output не содержит manifest path, URL, token, password или email;
- executable CLI не импортирует и не вызывает legacy writers;
- exact package operator namespace содержит только guarded CLI;
- exported writers семантически отклоняют вызов, не читая переданные
  client/token factory;
- в `design-partner-provisioning.mjs` единственный наблюдаемый `UserInvite`
  mutation path — narrowing-only `updateMany` emergency suspend;
- emergency suspend отклоняет terminal `ARCHIVED` Tenant и не может оживить
  его как `SUSPENDED`;
- PostgreSQL smoke до подключения требует exact disposable database name
  `leetplus_ci`;
- invite URL builder и token generator отсутствуют.

Проверки намеренно не выдают literal repository scan за AST- или DB-level
изоляцию. Они не покрывают произвольное исполнение нового repository code,
переименованную или новую package command вне текущего `design-partner:*`,
новую migration/SQL либо процесс с DB-owner credentials. Эти действия не
разрешены контрактом: их предотвращение и admission относятся к отдельным
credential/DB-role gates и обязательному review.

Exact-head evidence:

```text
local PostgreSQL writer-isolation smoke: NOT RUN
reason: DATABASE_URL/Postgres отсутствует в локальном окружении
implementation exact-head: f4224072f60507bd97f8e49440e3bda89ffe2aaa
GitHub CI: 30483184102 / run #41 / 3 of 3 PASS
Application job: 90682228273 / PASS
PostgreSQL 16 job: 90682228302 / writer-isolation lifecycle PASS
Authority root job: 90682228357 / PASS
independent review: PASS / no actionable P0/P1/P2 in stated scope
production-like evidence: NOT EXECUTED
```

Remote PostgreSQL smoke подтвердил на exact implementation SHA: обе
расширяющие операции отказывают до DB/token access, historical status остаётся
read-only, emergency suspend только сужает эффекты, а fixture cleanup оставляет
zero residue. Engineering checkbox `BETA-IAM-004D` закрыт. Это не повышает
общий release decision: production-like admission, deployment и внешний доступ
остаются `NO-GO`.

## Что разблокирует дальнейшую работу

`BETA-DP-005` может вернуться из `Заблокировано` только после отдельного
reviewed решения, которое использует общую sealed identity activation:

1. privacy-safe activation locator по reservation UUID/HMAC;
2. persisted `SHARED BETA GO`/соответствующий isolated GO, привязанный к exact
   release, environment, schema и entitlement revision;
3. атомарный trial start + OWNER invite + encrypted leased outbox;
4. verified delivery, reissue/revoke/accept и session revoke;
5. полный PostgreSQL concurrency/rollback/zero-diff evidence;
6. tenant/store isolation и product-surface gates.

До этого действует операционный запрет: legacy provision/rotate нельзя
включать обратно configuration flag, ручным SQL или прямым импортом exported
function. Это release policy, а не заявление о технической невозможности
записи для DB owner.
