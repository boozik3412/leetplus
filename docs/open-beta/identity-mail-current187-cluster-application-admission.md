# CURRENT187 cluster/application admission successor

| Поле              | Значение                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Рабочее имя       | `CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1`                                                                                           |
| Predecessor       | CURRENT186 runtime role boundary                                                                                                        |
| Статус            | `IN PROGRESS / DENY-ONLY / NONCANONICAL / NOT_DEPLOYABLE`                                                                               |
| Тип               | design + engineering slices A–F; production roots/runtime wiring отсутствуют                                                            |
| Production target | неизменно `CURRENT179/179`                                                                                                              |
| Внешний доступ    | `NO-GO`                                                                                                                                 |
| Scope             | cluster-wide admission, application identity admission, pre-Green root bootstrap, post-Green production root enrollment и deployment GO |
| Разрешено сейчас  | design/backlog и noncanonical local/CI candidate, fixtures и migrations только в disposable средах; production target не меняется       |
| Запрещено сейчас  | production root enrollment, canonical/production migrations, runtime wiring, SMTP activation, tenant/account/invite                     |

## Решение

CURRENT186 ограничивает owner/coordinator/worker в одной подключённой базе и
связывает их с live catalog. Этого недостаточно для production admission:
PostgreSQL-роли являются cluster-wide, приложение подключается через реальную
сеть, HBA и pooler, а лишние `CONNECT`, `TEMP`, membership, default ACL или
права во второй базе могут существовать вне снимка текущей БД.

CURRENT187 проектируется как обязательный successor gate поверх полностью
принятого CURRENT186. Он не расширяет CURRENT186 in-place и не становится
новым schema target автоматически. Его результат — только проверяемое
решение admission для exact cluster/application deployment:

```text
PRE-GREEN:  DISCOVER -> BOOTSTRAP_REHEARSED -> ENGINEERING_GREEN
POST-GREEN: PROD_ROOT_ENROLLED -> LIVE_SCANNED -> ATTESTED
             -> DEPLOYMENT_GO_CONSUMED
любое несоответствие -------------------------------> DENIED
emergency ------------------------------------------> CONTAINED
```

До реализации и зелёной приёмки всего этого документа сохраняются:

```text
authorization=false
canMutate=false
canSend=false
testAccessAuthorized=false
sharedBetaAccess=false
productionRootEnrolled=false
```

Эти шесть значений присутствуют во всех CURRENT187 receipts до успешной
post-Green enrollment ceremony, включая bootstrap, enrollment plan/deny, scan,
attestation, GO replay, rollback и emergency. После отдельной ceremony только
`productionRootEnrolled` может стать `true`; остальные пять deny-флагов остаются
`false`. CURRENT187 не может собственным receipt разрешить tester account или
invite.

## Неподвижные инварианты

1. Production trust roots остаются пустыми на всём pre-Green этапе. Caller,
   env, config file или database row общего назначения не могут добавить root
   неявно.
2. Pre-Green root bootstrap только репетирует one-time protocol с synthetic
   non-production roots. Он не является production root enrollment.
3. Production root enrollment и deployment GO — разные post-Green,
   purpose-bound, подписанные one-time операции. Подпись одного назначения не
   принимается для другого.
4. GO относится к одному exact cluster, environment, release, database
   universe и набору role name+OID. Он не переносим между кластерами или БД.
5. Проверяются все non-template databases, а не только текущая БД подключения.
6. Runtime admission проверяется настоящим сетевым LOGIN каждой service
   identity. `SET ROLE` и `SET SESSION AUTHORIZATION` не являются заменой.
7. Любая неизвестная БД, роль, membership, ACL, default ACL, HBA/pooler
   mapping, непрочитанный catalog или stale evidence даёт fail-closed deny.
8. Receipts и логи не содержат password, connection URL, token, ciphertext,
   email, provider payload или содержимое secret-manager reference.
9. Emergency containment всегда может только сузить полномочия и outbound
   effects; он не зависит от действующего deployment GO.
10. Каждый CURRENT187 receipt сохраняет `testAccessAuthorized=false` и
    `sharedBetaAccess=false`. `SHARED BETA GO` находится вне CURRENT187.

## Три разделённых этапа authority

### 1. Pre-Green root bootstrap rehearsal

Bootstrap доказывает exact shape, purpose separation, проектируемые one-time
consumption/replay rejection/rotation/revocation semantics и PII/secret-free receipts. Он
использует только synthetic roots в disposable CI либо изолированном staging
profile и не изменяет production registry, production cluster или secret
manager. Bootstrap receipt всегда содержит:

```text
authorization=false
canMutate=false
canSend=false
testAccessAuthorized=false
sharedBetaAccess=false
productionRootEnrolled=false
```

Реализованные pre-Green slices включают purpose-bound authority, pure
multi-database planner, read-only 24-surface acquisition, independent signed
DDL-fence attestation, persisted synthetic consumption/revocation ledger и
[stable signed policy binding](./identity-mail-current187-signed-policy-binding.md).
Последний связывает exact role/current-ACL/default-ACL/catalog fingerprints с
deployment envelope, но намеренно не выдаёт semantic approval или production
authority.

Pure verifier не заявляет persisted one-time consumption: до отдельного
append-only ledger slice он только проверяет подписанный envelope и возвращает
branded immutable deny-receipt. Replay/consume становится security claim лишь
после PostgreSQL acceptance уникальности nonce/envelope/operation и lost-response
exact replay.

Успешный bootstrap является одним из evidence для Engineering Green, но не
разрешением выполнить production ceremony.

### 2. Post-Green production root enrollment

Production root enrollment допускается только после Engineering Green и
отдельного подписанного `PRODUCTION ROOT ENROLLMENT GO`. Offline/operations
ceremony связывает:

- contract purpose и version;
- production environment и cluster identity;
- доверенные key identifiers и signature policy;
- одноразовый challenge/nonce и короткое окно действия;
- operator approval evidence и ceremony transcript digest;
- начальный пустой либо заранее утверждённый revocation state;
- digest exact verifier artifact, executable и runtime configuration.

Enrollment потребляется один раз и записывается в append-only production
authority ledger. Повтор того же nonce, envelope или root set отклоняется.
Rotation, revocation и emergency retirement являются отдельными purpose-bound
операциями; «повторная инициализация» поверх уже enrolled cluster запрещена.
Production enrollment receipt по-прежнему имеет
`testAccessAuthorized=false/sharedBetaAccess=false`: наличие root не разрешает
deployment, SMTP, tenant provisioning или invite.

Первоначальный `PRODUCTION ROOT ENROLLMENT GO` не подписывается enroll-имыми
ключами. Его проверяет отдельный offline bootstrap authority, pinned только в
immutable release artifact после Engineering Green и независимого review.
Этот bootstrap registry не читается из caller/env/config/обычной database row,
не используется для deployment GO и не может быть изменён runtime-процессом.
В noncanonical/pre-Green коде registry намеренно frozen-empty; его первое
production наполнение является отдельным reviewed release change и
двухконтрольной operations ceremony, а не API-вызовом.

CURRENT187 различает как минимум четыре непересекающихся registry/domain:

- synthetic pre-Green rehearsal roots;
- offline production-root-bootstrap authority;
- enrolled production admission/deployment roots;
- revocation/retirement state для уже enrolled roots.

Ключ, envelope или подпись из одного domain не принимаются в другом.

### 3. Post-enrollment one-time deployment GO

Deployment GO возможен только после production root enrollment, нового live
cluster scan и отдельного `PRODUCTION DEPLOY GO`. Он подписывается независимо
от enrollment и обязательно содержит digest enrollment receipt. Payload
связывает как минимум:

- environment, cluster identity и PostgreSQL major version;
- release SHA, immutable artifact, executable и config digests;
- exact predecessor/candidate chain и normalized SQL/manifest digests;
- полный allowlist non-template database `name + OID + owner name + owner OID`;
- digest каждого per-database catalog scan и общий cluster digest;
- application, migration, creator, owner, coordinator и worker role
  `name + OID + attributes + membership-closure`;
- current and default ACL policy digests;
- network endpoint, TLS, HBA, pooler и service-account mapping digests;
- provider mark/complete recovery и outbound kill-switch evidence digests;
- before-image, rollback plan, emergency plan и zero-diff proof digests;
- operation id, one-time nonce, issued/valid-until и expected prior epoch.

GO ledger использует uniqueness по operation/nonce/envelope digest и
append-only epoch. Lost response допускает только exact replay исходного
receipt; новый payload под прежним operation id запрещён. Истёкший, отозванный
или уже потреблённый GO не открывает новый runtime и не возобновляет outbound.
Даже consumed deployment GO возвращает `testAccessAuthorized=false` и не
заменяет launch gates.

## Полный inventory non-template databases

Admission coordinator сначала pin-ит `clusterIdentity`: PostgreSQL
`system_identifier` из privileged control-plane probe, полный
`server_version_num`, catalog/control version, topology/deployment identity и
digest ожидаемого endpoint. Затем он получает cluster-level snapshot из
`pg_database` и формирует отсортированный список всех записей с
`datistemplate = false`. `postgres` и любая служебная non-template БД входят в
этот список; имя не является основанием для пропуска.

Для каждой записи pin-ятся:

- database name, OID, owner name/OID, `datallowconn`, connection limit;
- locale/provider/encoding и другие identity-relevant attributes;
- direct и effective `CONNECT`/`TEMP` для `PUBLIC` и всех allowlisted roles;
- неожиданные database ACL grantees и grant options;
- normalized per-database catalog digest.

Каждая connectable БД сканируется отдельным реальным соединением. Если БД
non-connectable, этот статус должен быть явно разрешён allowlist и доказан
cluster scan; её нельзя молча пропустить. Ошибка соединения, timeout или
недоступный catalog означает `DENIED`, а не partial success.

От первого cluster snapshot до финального scan и consume действует доказанный
DDL fence: maintenance mode, блокировка migration/creator principals и
операционный запрет cluster/database DDL с отдельным fence epoch. Простая
договорённость о maintenance window без технического fence evidence не
принимается. После всех per-DB scans coordinator повторно читает `pg_database`. Создание,
удаление, rename, owner/OID change или изменение `datallowconn` между двумя
снимками аннулирует весь результат. Поскольку PostgreSQL не предоставляет одну
transaction snapshot для нескольких БД, production ceremony обязана применять
операционный DDL fence/maintenance window, bounded timeouts и финальный
повторный scan. Без доказанного fence GO не потребляется.

Templates не входят в application scan, но их точный exclusion и отсутствие
неожиданной возможности подключения фиксируются cluster evidence. Ни одна
пользовательская БД не может быть скрыта именем, prefix или owner-фильтром.

## Per-database scan

В каждой разрешённой БД снимается deterministic normalized projection:

- schemas, owners, ACL и default ACL;
- relations, columns, sequences, types/domains и ownership;
- routines с identity arguments, language, owner, ACL, `proconfig`,
  volatility/parallel/security flags и hash live definition;
- triggers и constraints с hash live definition;
- extensions и extension-owned application-relevant objects;
- direct ACL для всех grantees, включая `PUBLIC`, а не только целевые роли;
- effective privileges через `PUBLIC`, membership closure и ownership;
- role/database settings, search path и session-affecting configuration.

Сканер не исключает `pg_catalog`, `information_schema` или system authorities
целиком. Для системных объектов задаётся отдельная exact baseline: какие
schema/type/routine privileges доступны каждой runtime identity по умолчанию и
какие из них допустимы приложению. Неожиданное system privilege расширение,
grant option или ownership отклоняет admission.

Проверка только `aclitem` целевой роли недостаточна. Projection раскрывает все
grantees через catalog ACL expansion, отдельно учитывает implicit `PUBLIC`,
membership и owner/superuser bypass, затем подтверждает effective результат
через соответствующие `has_*_privilege` checks. `NULL` ACL не трактуется как
«прав нет»: применяются PostgreSQL default privileges и exact baseline.

## Application, migration и creator identities

Allowlist обязан различать назначение ролей:

| Назначение                | Требование admission                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application runtime       | exact LOGIN name/OID; без superuser, bypass RLS, create role/database, replication, ownership и неожиданных memberships                                               |
| Migration executor        | отдельный exact LOGIN name/OID; authority только внутри time-boxed migration ceremony и обязательный revoke после неё                                                 |
| Object creator            | exact name/OID; обычно `NOLOGIN`; именно с ним связаны ownership и default ACL будущих объектов                                                                       |
| Database/deployment owner | exact privileged LOGIN name/OID для bounded ceremony; прямой session owner без `SET ROLE` substitute; после ceremony login/authority отзываются по подписанному плану |
| Admission scanner         | отдельный exact LOGIN name/OID с только read-only cluster/catalog probe surface; не совпадает с application, migration, creator или duty roles                        |
| Identity-mail owner       | exact `NOLOGIN NOINHERIT`; только allowlisted control-plane ownership                                                                                                 |
| Coordinator               | exact LOGIN identity и только CURRENT186 driver surface                                                                                                               |
| Worker                    | exact LOGIN identity и только CURRENT184/186 worker surface                                                                                                           |

Для каждой роли pin-ятся все `pg_roles` attributes, OID, membership graph с
admin/inherit/set options, owned objects, grants, per-role/per-database
settings и effective privileges. Роль с правильным именем и новым OID, либо
правильным OID при несовпавшем allowlist, отклоняется. Неожиданная cluster-wide
роль, способная наследовать или `SET ROLE` в allowlisted authority, также
отклоняет GO.

## Exact default ACL policy

Проверяются не только ACL существующих объектов, но и политика будущих
объектов. PostgreSQL по умолчанию предоставляет `PUBLIC EXECUTE` новым
functions/procedures, поэтому для каждого реального creator/migration role и
каждой целевой schema должен существовать exact default-ACL policy, включая
явный revoke будущего `PUBLIC EXECUTE`.

Admission pin-ит normalized `pg_default_acl` по grantor role, namespace,
object type, grantee, privilege и grant option. Обязательны:

- отсутствие будущего `PUBLIC EXECUTE` для routines;
- отсутствие неожиданных default grants для tables, sequences, types и
  schemas;
- отсутствие policy от неизвестного creator/grantor;
- соответствие роли, которая действительно создаёт объекты во время migration;
- explicit `REVOKE ALL ... FROM PUBLIC` для существующих privileged routines.

Disposable acceptance после установки policy создаёт routine от имени каждого
creator, подтверждает deny для `PUBLIC`/bystander/runtime roles и затем
удаляет fixture. Такая проверка не заменяется анализом SQL-текста: default ACL
зависит от identity создателя.

Pre-Green definition coverage также включает full `pg_attribute` metadata,
column defaults/generated/identity expressions, row-security flags и exact RLS
policy definitions. Эти поверхности нельзя переносить в post-Green follow-up:
непрочитанная либо неподписанная часть catalog делает scan `DENIED`.

## Реальный network LOGIN, HBA и pooler

CURRENT187 использует actual network path каждого production service account.
Для application, migration, coordinator и worker создаётся отдельное TCP/TLS
соединение тем же endpoint и тем же pooler route, которые использует release.
Проверка фиксирует без раскрытия секрета:

- secret reference identifier/digest и ожидаемое service-account назначение;
- endpoint identity, TLS mode/peer evidence и server address/port;
- matched HBA policy evidence и normalized `pg_hba_file_rules` digest;
- pooler identity, auth mode, database/user mapping и pooling mode;
- backend `SESSION_USER`, `CURRENT_USER`, database name/OID и role OID;
- `application_name`, backend PID и доступность только ожидаемых operations.

Статический HBA parse не доказывает, какое правило реально обслужило соединение.
Поэтому необходим внешний attestation adapter: immutable digest фактической
HBA/pooler конфигурации и reload epoch из управляемого host/control-plane плюс
коррелированный server log/audit evidence конкретного probe. Одних
`pg_hba_file_rules` и успешного LOGIN недостаточно. Дополнительно обязательны
позитивные и негативные network probes. `trust`, общий wildcard mapping,
неожиданный auth fallback, pooler user collapsing или подключение всех сервисов
одной database identity дают `DENIED`. Если transaction pooling не сохраняет
требуемую identity/transaction semantics, этот route не допускается.

`SET ROLE`/`SET SESSION AUTHORIZATION` остаются полезными только для
disposable ACL tests. Они не являются evidence password authentication, HBA,
TLS, pooler mapping или production `SESSION_USER`.

## Cross-database и hostile second-DB acceptance

Обязательный disposable PostgreSQL cluster suite создаёт минимум две
non-template БД и последовательно доказывает:

1. exact allowlisted current + second database проходят полный scan;
2. неизвестная третья non-template БД блокирует admission;
3. `PUBLIC CONNECT` или `PUBLIC TEMP` во второй БД блокирует admission;
4. direct/effective privilege runtime роли только во второй БД обнаруживается;
5. hostile schema/routine с ожидаемым именем, но иным owner/definition,
   обнаруживается;
6. default ACL drift неизвестного creator во второй БД обнаруживается;
7. database drop/recreate с тем же именем обнаруживается по OID;
8. непрочитанная либо внезапно non-connectable БД не считается зелёной;
9. deny не меняет source cluster, а cleanup оставляет zero disposable residue.

Отдельная current-DB matrix проверяет system/direct/effective baseline,
all-grantee ACL projection, routine/trigger/constraint definition hashes и
отсутствие неучтённой authority через `PUBLIC`, ownership или membership.

## Rollback, emergency и zero-diff evidence

CURRENT187 не маскирует multi-database работу под одну transaction. Plan,
apply/consume, rollback/revoke и emergency имеют отдельные signed purposes и
append-only receipts.

- `plan` строго read-only и возвращает canonical, PII/secret-free before/after;
- GO consumption возможно только после повторного live scan и expected epoch;
- обычный rollback использует exact persisted before-image, отзывает GO и
  вызывает уже доказанный CURRENT186 compensating `N+1`, где это применимо;
- emergency немедленно включает outbound kill-switch, переводит runtime роли
  в containment profile/`NOLOGIN` и отзывает grants без удаления pre-existing
  roles и без восстановления неизвестных password hashes;
- fault injection после каждого шага доказывает либо complete commit, либо
  обнаруживаемое contained partial state; silent partial success запрещён;
- повторный `plan` после apply и после rollback обязан дать соответственно
  exact expected state и zero diff;
- каждый receipt связывает cluster/per-DB digests, server time, transaction ids,
  operation/epoch и signer evidence.

Root enrollment не «откатывается» повторной инициализацией. Ошибочный или
скомпрометированный root set только отзывается отдельной signed ceremony, после
чего требуется новый явно спроектированный enrollment epoch.

## Provider lost-response и outbound dependencies

Cluster admission не решает двусмысленность внешней отправки. До зелёного
CURRENT187 обязательны отдельные принятые dependencies:

- idempotent provider `mark` и `complete` с immutable request digest и
  persisted original receipt;
- exact replay после lost response без второго provider send;
- crash/fault matrix до handoff, после provider acceptance, после mark и после
  complete;
- ambiguous provider outcome переводится в reconciliation/HOLD, а не blind
  retry;
- persisted global и per-tenant outbound kill-switch проверяется fresh перед
  claim, непосредственно перед network handoff и перед новым follow-up effect;
- suspend/containment fencing запрещает новые effects после commit;
- reconciliation, metrics, alert и operator runbook не требуют раскрытия PII
  или provider payload.

Deployment GO связывает digests этих evidence. Пока provider mark/complete
lost-response recovery или kill-switch не приняты exact release evidence,
`canSend=false`, даже если весь PostgreSQL catalog совпадает.

## Engineering Definition of Green

CURRENT187 достигает только engineering Green после одновременного выполнения:

1. CURRENT186 принят/refrozen на неизменных bytes, а его exact evidence является
   входным predecessor gate CURRENT187, не post-Green задачей.
2. Контракт и threat model независимо reviewed и frozen.
3. Pure verifier, pre-Green bootstrap rehearsal и application admission
   fail-closed; production roots не caller-injectable и остаются empty.
4. Реализован exact noncanonical candidate/artifact с pinned SHA и immutable
   local/CI evidence.
5. Fresh PostgreSQL cluster suite проходит все current/second-DB, HBA, pooler,
   LOGIN, default ACL, full column/default/RLS definition и
   system/direct/effective privilege cases.
6. Provider mark/complete lost-response и outbound kill-switch dependencies
   имеют отдельное зелёное evidence.
7. Production-like bootstrap/dry-run, simulated GO consume, rollback,
   emergency и повторный zero-diff выполнены на staging clone с actual topology,
   synthetic non-production roots и без внешней отправки.
8. Backup/restore, observability, audit, alerting и runbooks проверены.

До выполнения всех восьми пунктов запрещены production root enrollment,
production deployment GO, canonical/production migrations, SMTP/outbound
activation, создание `Tenant B/Store B1`, tester account, owner invite и любой
внешний тестовый доступ. При этом разработка и проверка noncanonical candidate,
fixtures и local/CI migrations разрешены в изолированных disposable средах и
не меняют production target.

## Post-Green gates и оставшиеся блокеры тестового доступа

Engineering Green CURRENT187 необходим, но недостаточен. После него в
раздельном порядке остаются обязательными:

1. Canonical promotion уже принятого/refrozen CURRENT186 вместе с exact
   production predecessor/rollback plan; engineering acceptance CURRENT186 не
   переносится сюда.
2. Provider `mark/complete` lost-response recovery, producer/activation v2,
   zero-secret/zero-inflight barrier, reconciliation и backfill.
3. Отдельный `PRODUCTION ROOT ENROLLMENT GO`, production enrollment ceremony и
   его independent attestation.
4. Повторный live cluster/application scan непосредственно перед отдельным
   `PRODUCTION DEPLOY GO`.
5. Immutable release artifact, CI gates, backup/restore, rollback/emergency,
   readiness, monitoring, alerts и production canary.
6. Protected initial OWNER workflow `BETA-IAM-004L`: tenant/store provisioning,
   mailbox-bound delivery, reissue/revoke/suspend и отсутствие raw token/URL.
7. Полный tenant/store/capability `AccessScope`, entitlement и обязательный
   module scope для геймификации, ассортимента, сотрудников, коммуникаций,
   users/roles и integrations.
8. Все задачи и evidence `Gate 1MT`, затем `Gate 2`/internal alpha и связанные
   stop conditions launch backlog.
9. Отдельное product/operations решение `SHARED BETA GO` после canary; только
   оно может разрешить создание tester account/owner invite штатным workflow.

### Обязательные launch dependencies после CURRENT187

Следующая последовательность уточняет пункты выше и является внешним по
отношению к CURRENT187 P0 critical path. Ни один шаг не меняет Definition of
Green CURRENT187 и ни один CURRENT187 receipt не может подтвердить его
завершение вместо соответствующего launch gate:

1. **Canonical production admission.** Отдельно принять/refreeze CURRENT186,
   закрыть provider replay, producer/activation v2,
   zero-secret/zero-inflight, reconciliation/backfill и провести production
   root enrollment/deployment GO с fresh cluster scan, immutable artifact,
   backup/restore, apply/rollback/emergency/zero-diff и canary.
2. **Owner и staff identity workflow.** Protected provisioning создаёт только
   shell tenant/store и mailbox-bound initial `OWNER + NETWORK` invite без raw
   secret. После активации владелец должен иметь verified email
   invite/resend/revoke/accept workflow для сотрудников своего tenant с
   ограничением ролей и `NETWORK/STORES` scope, session revocation,
   запретом generic OWNER escalation и защитой последнего владельца.
3. **Safe Langame onboarding.** Tenant-wide credential управляется только из
   `NETWORK` scope; encryption, tenant-aware database constraints/external-club
   claim, SSRF/DNS/rebinding policy, mandatory timeout/retry/circuit breaker
   обязательны. Flow фиксирован как diagnostic → read-only preview → явный
   выбор клуба → атомарный map только выбранного `B1` → reconcile → отдельно
   подтверждённый read-only initial sync. Автоматический import всех видимых
   clubs и unattended/outbound writes запрещены.
4. **Gate 1MT.** Все обязательные модули первого теста получают полный
   `ENFORCED + VERIFIED` tenant/store/capability coverage и A/B evidence для
   API/BFF/export/file/job/SSE/browser. Tenant-aware schedulers/workers имеют
   leases/fencing и fresh admission checks; общий Telegram-контур имеет durable
   `update_id` dedupe, tenant/store routing и cross-tenant negative tests.
5. **Gate 2.** Четыре текущих клуба переводятся in-place как одна сеть
   `Tenant A/Store A1..A4`, без split или duplicate import. Backup/restore,
   rollback, alerts, stop conditions, reconciliation и не менее семи суток
   стабильного internal alpha обязательны.
6. **Отдельный `SHARED BETA GO`.** Только после Gate 1MT и Gate 2 внешний
   product/operations workflow может разрешить штатное создание отдельного
   логического `Tenant B/Store B1` в общем data plane и initial owner email
   invite. Владелец сам задаёт пароль; его нельзя добавить в `Tenant A` или
   создать вручную с общим временным паролем.

Физически отдельная database/runtime lane не является prerequisite первого
тестера и не может обходить этот shared multi-tenant critical path. Полный
операционный список и Definition of Done зафиксированы в
`BETA-LAUNCH-CP-001..007` файла `OPEN_BETA_BACKLOG.md`.

`SHARED BETA GO` не является шагом Definition of Green CURRENT187 и не может
быть записан CURRENT187 verifier/controller. До закрытия всех девяти внешних
блокеров каждый CURRENT187 receipt остаётся
`testAccessAuthorized=false/sharedBetaAccess=false`. Четыре текущих клуба
остаются в неизменённом production-контуре `CURRENT179/179`.

## План будущей реализации

Документ не разрешает начинать с production ceremony. Разрешённый порядок
дальнейшей разработки:

1. frozen threat model и exact canonical projections;
2. pure bootstrap/enrollment/deployment-GO contracts и негативные tests;
3. read-only cluster/per-DB scanner и all-grantee baseline;
4. actual network/HBA/pooler/service mapping attestor;
5. append-only consumption/revocation state и emergency containment;
6. disposable hostile multi-DB PostgreSQL suite;
7. provider/killswitch dependency integration;
8. production-like pre-Green rehearsal;
9. только после Engineering Green — отдельные production enrollment/deploy GO,
   canary, Gate 1MT/Gate 2 и `SHARED BETA GO`.

На текущем этапе это исключительно backlog/design. Candidate name, SQL,
migration ordinal, signing roots, production role names, credentials и сроки
не назначены.
