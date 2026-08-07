# CURRENT186 identity-mail runtime role boundary

| Поле              | Значение                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Candidate         | `20260803010000_identity_mail_duty_role_runtime_boundary_v2`                             |
| Ordinal           | `186`                                                                                    |
| Predecessor       | exact dormant CURRENT185                                                                 |
| Статус            | `IMPLEMENTED_CANDIDATE / ENGINEERING_ACCEPTED / NONCANONICAL / NOT_DEPLOYABLE`          |
| Production target | неизменно `CURRENT179/179`                                                               |
| Authority scope   | `CURRENT_DATABASE_ONLY`                                                                  |
| Test access       | `NO-GO`                                                                                  |

## Решение и граница

CURRENT186 реализован как неканонический database-local candidate поверх
exact CURRENT185. Он связывает independently signed enrollment evidence с
живым PostgreSQL catalog, вводит общий ACL epoch/lock и разделяет полномочия
трёх duty roles:

- отдельный `NOLOGIN NOINHERIT` owner владеет exact control-plane surface;
- coordinator — `LOGIN NOINHERIT`, получает только `CONNECT`, schema `USAGE`
  и `EXECUTE` four-TEXT coordinator driver;
- worker — `LOGIN NOINHERIT`, получает только `CONNECT`, schema `USAGE` и
  `EXECUTE` пяти CURRENT184 worker-v2 RPC.

У LOGIN-ролей запрещены relation/column/sequence/type DML, ownership,
membership, `SET ROLE`, `CREATE`, `TEMP`, grant option, неожиданные routine
grants и role/database settings. Candidate не создаёт cluster-wide роли,
credentials, trust roots, tenant или SMTP authority и не принимает passwords,
password hashes либо connection URLs.

Schema-owner получает отдельную минимальную worker-support поверхность:

- `35` column-level `SELECT`: `12` колонок release marker, `6` колонок
  `Tenant`, `12` колонок `UserInvite` и `5` колонок `IdentityEmailClaim`;
- `4` carrier-column `UPDATE`, необходимые для PostgreSQL row locks:
  `Tenant.id`, `UserInvite.id`, `IdentityEmailClaim.emailCanonical` и
  `IdentityMailDeliveryEvent.id`;
- ровно один `EXECUTE` на database-owner helper
  `identity_email_claim_lock_v1(text)`, без grant option.

Эти `39` column-authority rows привязаны не только к именам, но и к `36` физическим
колонкам через exact `relationOid + attnum`. Три колонки одновременно имеют
`SELECT` и carrier-`UPDATE`, поэтому число физических колонок меньше числа
authority rows. Drop/recreate, rename с подменой OID либо attnum drift
блокируют apply/rollback до DDL.

Whole-table `SELECT` запрещён для marker, `Tenant`, `UserInvite` и
`IdentityEmailClaim`; whole-table `UPDATE` запрещён для `Tenant`, `UserInvite`,
`IdentityEmailClaim` и `IdentityMailDeliveryEvent`. Существующие bounded
`INSERT/SELECT` на delivery-event сохраняются и учитываются в exact effective
profile. Пять worker routines переводятся с whole-row `%ROWTYPE`/`alias.*` на
точные проекции до смены ownership. Для `complete/provider_mark` переписываются
именно CURRENT183 bodies, а не CURRENT184 replay wrappers.

Каждый receipt фиксирует границу честно и без расширительного толкования:

```text
authorityScope = CURRENT_DATABASE_ONLY
crossDatabaseAuthorityControlled = false
futureCreatorDefaultPrivilegesControlled = false
applicationRoleAllowlistBound = false
productionApplyAuthorized = false
```

## Frozen database surface

Database candidate остаётся вне `prisma/migrations`. Его защищённая поверхность
содержит exact:

- `9` relations в definition manifest;
- `13` relations в ACL/ownership snapshot: те же `9` плюс
  `IdentityEmailClaim`, `SharedBetaRuntimeReleaseMarker`, `Tenant` и
  `UserInvite`;
- `38` ACL objects и `52` effective privileges в целевом каталоге;
- `22` owner routines;
- `23` protected routine definitions: `22` owner routines плюс остающийся у
  database owner `identity_email_claim_lock_v1(text)`;
- `21` enabled non-internal triggers;
- `110` constraints;
- `56` indexes.

В surface входят append-only `IdentityMailDutyRoleAclEpochV1`, общий ACL lock,
epoch appender, four-TEXT phaseful driver и DB-native live assertion. Правильное
имя epoch guard —
`identity_mail_duty_role_acl_epoch_immutable_guard_v1`; отдельные row/truncate,
enrollment, manifest, revocation и outbox guards входят в тот же exact
definition manifest.

Security mode закрепляется для каждой routine отдельно. Driver использует
`SECURITY DEFINER` для owner-only перехода. Epoch appender намеренно работает
как `SECURITY INVOKER`: APPLY/ROTATE вызывает его после transaction-local
`SET ROLE` в точного `NOLOGIN` schema owner, а ROLLBACK и
EMERGENCY_CONTAINMENT — от точного deployment/database owner. Поэтому полное
emergency containment может удалить все прямые support grants schema owner,
не сохраняя скрытую привилегию и не выдавая appender EXECUTE LOGIN-ролям.
`identity_mail_duty_role_live_assert_v1` и immutable guards также работают как
`SECURITY INVOKER`. Утверждение «все 22 routines являются SECURITY DEFINER»
неверно. Для каждой routine pin-ятся owner, signature,
proconfig/search path, volatility, parallel mode, defaults/variadic/overload
surface, ACL и definition bytes; `PUBLIC` не получает runtime authority.

## ACL epoch и phaseful enrollment

ACL epoch — append-only возрастающий ledger. `APPLY`, `ROTATE`, `ROLLBACK` и
`EMERGENCY_CONTAINMENT` добавляют только новый epoch `N+1`; история не
перематывается и не удаляется, поэтому изменение с последующим возвратом ACL
не позволяет повторно использовать старую attestation (ABA).

Four-TEXT driver принимает только references/digests уже импортированного
CURRENT185 bundle, повторно проверяет database/deployment/context,
`SESSION_USER` name/OID, non-revoked manifest, текущий ACL epoch и live catalog
digest и использует порядок lock `tenant -> ACL -> command/manifest`:

```text
BEGIN_DRAIN -> WAIT_ZERO_INFLIGHT -> FINALIZE
             \-> TERMINAL_REPLAY
```

После принятого `BEGIN_DRAIN` settlement может завершиться только после fresh
state под обоими locks и zero secret-bearing, HOLD/PENDING/RETRY и CLAIMED
outbox rows. Rollback является отдельной signed command с exact forward
reference и before-image; runtime-параметры не могут подменить её intent.

## Privileged controller: шесть режимов

Роли, ownership и grants применяет отдельный privileged controller с заранее
созданными role name+OID. Он имеет ровно шесть режимов:

1. `check` — read-only live-catalog inspection;
2. `plan` — PII-free canonical before/after plan;
3. `apply` — короткая transaction под общим ACL advisory lock;
4. `rollback` — exact restoration и compensating epoch `N+1`;
5. `attest` — fresh live-catalog read после commit;
6. `emergency` — необратимое автоматикой containment без возврата LOGIN.

Controller запускается только прямой PostgreSQL session владельца текущей БД:
`SESSION_USER = CURRENT_USER = database owner`, все три значения связаны с
одним pinned OID, а роль владельца обязана иметь `rolsuper = true`. `SET ROLE`,
membership или совпадение одного имени не считаются заменой этому инварианту.
Runtime duty roles при этом остаются `NOSUPERUSER`.

Controller pin-ит exact role name+OID, attributes, membership closure,
database/schema/routine ACL, effective privileges, default ACL, settings,
ownership и все объекты, которыми может владеть duty-role principal. Полный
ownership inventory включает:

```text
DATABASE
SCHEMA
CLASS/RELATION
ROUTINE
TYPE
LANGUAGE
FOREIGN_DATA_WRAPPER
FOREIGN_SERVER
TABLESPACE
LARGE_OBJECT
EXTENSION
COLLATION
CONVERSION
OPERATOR
OPERATOR_CLASS
OPERATOR_FAMILY
TEXT_SEARCH_CONFIGURATION
TEXT_SEARCH_DICTIONARY
STATISTICS
EVENT_TRIGGER
PUBLICATION
SUBSCRIPTION
USER_MAPPING
PREPARED_TRANSACTION
```

Apply выполняет повторную проверку после ожидания lock, exact DDL/grants,
нормализованный live postcondition, epoch append и commit в одной bounded
transaction. Внутри неё запрещены HTTP, HSM и secret-manager calls.

## Durable 39-key before-image и lost-response recovery

Активный epoch содержит exact `39`-key canonical payload. Для `APPLY`/`ROTATE`
в нём обязательно сохраняется durable canonical UTF-8 before-catalog image с
`20` top-level keys вместе с его schema/profile, `PUBLIC` baseline, `36`
physical column bindings и catalog digest. Sidecar хранится с `EXTENDED`
storage и fail-closed ограничен `4 MiB`; проверка размера выполняется до DDL.
Неактивный epoch обязан иметь null before-image.

Если controller теряет ответ на `APPLY`, повтор с тем же operation id сначала
читает persisted epoch, декодирует exact before-image, заново вычисляет plan,
target catalog, apply receipt и весь 39-key epoch payload и принимает replay
только при byte-for-byte равенстве. Это не «успех по наличию строки»: любое
расхождение или неполное evidence завершается fail-closed.

Rollback использует именно эту persisted before-image, восстанавливает
нормализованную семантику non-owner ACL и добавляет новый compensating epoch;
pre-existing roles не удаляются. Перед transaction и повторно после ожидания
lock разрешён ремонт только non-grantable ACL, выданного владельцем объекта
точному pinned OID одной из duty roles либо `PUBLIC`. Чужой principal,
same-name/new-OID, grant option или не-владелец-грантор блокируют rollback до
DDL.

Термин `zero-diff` здесь не означает byte equality внутренних `relacl/proacl`
массивов. PostgreSQL даёт владельцу неявные полномочия и не позволяет надёжно
восстановить различие между `NULL/default ACL` и эквивалентным explicit owner
ACL. Доказуемая граница — canonical exploded non-owner authority semantics,
owners/OIDs, effective privileges, PUBLIC baseline и physical column bindings.
Именно по этой нормализованной границе строятся before-image и rollback
postcondition; физическое byte-zero-diff `relacl/proacl` не заявляется.

До любого rollback DDL и повторно после ожидания общего lock контроллер также
сверяет persisted global inventory всех non-system routines. Digest включает
полный `pg_proc` без ACL, `pg_aggregate` и owner binding всех routines вне
защищённого owner-transfer списка; владельцы защищённых routines проверяются
их отдельными object/OID bindings. Поэтому новая, удалённая, переопределённая
или переоформленная на другого владельца routine блокирует rollback, а
плановый `ALTER OWNER` CURRENT186 не создаёт ложный drift.

## Emergency containment

Emergency phase 1 в каждой попытке сначала берёт тот же общий ACL lock, затем
атомарно применяет containment: `NOLOGIN`, `RESET ALL` и per-database
`RESET ALL`, direct `CONNECT` revoke и двусторонний membership revoke для
owner/coordinator/worker. Lost или неоднозначный ответ повторяется не более
трёх раз. Если commit нельзя подтвердить после третьей попытки, controller
возвращает terminal
`CURRENT186_DUTY_ROLE_EMERGENCY_PHASE1_UNCONFIRMED`, не создаёт ложный epoch и
не продолжает обычный apply/attest path.

После подтверждённой phase 1 controller завершает и опрашивает живые sessions.
Перед emergency epoch обязательны fresh DB postcondition и финальная
zero-session recheck. Любая незавершённая session или ложный termination result
оставляет систему contained, но unattested. Все три duty roles остаются
terminal `NOLOGIN`; автоматического восстановления LOGIN нет — оно требует
отдельной явно авторизованной ceremony.

## Engineering acceptance и остаточные блокеры

Engineering acceptance и refreeze завершены 05.08.2026. Финальные bytes прошли
predecessor gates CURRENT180..CURRENT185, CURRENT186 foundation `15/15`, catalog
`24/24`, deployment `48/48`, runtime attestation `16/16` и focused ESLint. Два
независимых PostgreSQL 16 прогона полной матрицы завершились `28/28 PASS` за
`325.812 s` и `320.49 s`; до и после каждого прогона residue равен
`0 databases / 0 roles / 0 sessions`. Regression CURRENT185 теперь доказывает
точное row-level происхождение всех `16` command rows и `14` unique manifest
rows, а не только их aggregate counts.

Финальные pins: definition manifest
`46fcb3cd89f8b8dbb7d064e242de3df417a641e7bc3f1823781f5e914aced8be`,
normalized migration SHA
`83c5df307d60548ffe3b009ec35b2faba5a37b1618d8dd88a1c571ce697d48b4`,
completed 186-row manifest
`cf354d5bb94069978b4b63b35e2fec1464822c682513b5c3c982f63fc472dc8e`.

Текущий definition manifest pin-ит routines, triggers, constraints и indexes,
но исчерпывающее покрытие `pg_attribute`, column defaults и RLS policy
definitions остаётся отдельным acceptance/follow-up требованием. За пределами
`CURRENT_DATABASE_ONLY` остаются:

- provider `mark/complete` exact replay после lost response;
- cluster-wide database/role/default-ACL admission;
- реальный application/HBA/pooler identity path и application-role allowlist;
- production-like apply/rollback/emergency/zero-diff rehearsal.

Cluster/application admission относится к
[CURRENT187](./identity-mail-current187-cluster-application-admission.md), а не
скрыто расширяет CURRENT186.

## Запрет promotion и тестового доступа

CURRENT186 остаётся `NONCANONICAL / NOT_DEPLOYABLE`. Принятые final pins сами
по себе не являются deployment authorization. Candidate не даёт
`PRODUCTION DEPLOY GO`, `SHARED BETA GO` или право создать tester account /
owner invite.

Production остаётся на `CURRENT179/179`. Четыре текущих клуба, составляющие
одну существующую сеть, не изменялись; внешний тестер также не затронут.
Тестовый доступ — `NO-GO` до закрытия CURRENT187 и остальных launch gates.
