# Launch checklist: `SHARED_MULTI_TENANT_BETA_V1`

| Поле       | Значение                                                   |
| ---------- | ---------------------------------------------------------- |
| Версия     | 1.16                                                       |
| Дата       | 29.07.2026                                                 |
| Статус     | `NO-GO`; checklist не выполнен                             |
| Data plane | Shared web/API/workers/PostgreSQL/Telegram                 |
| Topology   | `Tenant A/A1..A4` + новый `Tenant B/B1`                    |
| Доступ     | Email-bound OWNER invite после Gate 1MT, Gate 2 и final GO |
| Ориентир   | `31.08–07.09.2026`, условно; failed gate сдвигает окно     |

Этот checklist исполняется вместе с
[профилем доступа](./shared-multi-tenant-beta-profile.md) и
[`OPEN_BETA_BACKLOG.md`](../../OPEN_BETA_BACKLOG.md). Identity reconciliation
ведётся по отдельному
[read-only inventory/backfill contract](./identity-legacy-backfill.md).
Галочка без ссылки на exact protected evidence не считается выполнением.

Production IDs, email, телефоны, invite URL/token, password, database URL,
API keys, encryption/signing secrets и raw business data запрещено сохранять
в git. В документах используются только aliases `Tenant A/B` и `Store A1..A4/B1`.

## Текущий engineering checkpoint: `CURRENT_169`

Рабочий кандидат сохраняет shell-only service из `CURRENT_168` и переводит
обычные application invite/accept writers на persisted provenance и sealed
identity state machine. Launch checkboxes ниже этим не закрываются:

- schema clean deploy на disposable PostgreSQL `16.13`: `169/169`;
- identity idempotency: `100` конкурентных попыток,
  `1 CREATED + 99 ALREADY_RESERVED`;
- transition replay повторно проверяет destination, explicit revoke сохраняет
  history и позволяет новую same-email reservation;
- shell PostgreSQL integration: `2/2`;
- runtime role: exact six application RPC, из них четыре
  `reserve_v2/assert_v1/transition_v2/release_v2` identity boundary, и zero
  effective `IdentityEmailClaim` table DML;
- application boundary разрешает `User` create только в `AuthService`, а
  `UserInvite` mutation — только в `AuthService`/`UsersService`; direct user
  create и user/invite email change закрыты fail-closed;
- focused application tests: `89/89`; full API:
  `99 suites / 1940 passed / 2 todo`;
- production startup-validation candidate требует отдельный
  `IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY`, запрещает reuse и принимает version
  `v1`; CI environment contract обновлён;
- shell shape:
  `PILOT/SUSPENDED/PROVISIONING`, inactive Store, six rows
  `read/write=ON + outbound=OFF`, HMAC-only identity audit, no
  `User/UserInvite/token/trial/outbox`;
- provision route возвращает
  `503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING`;
- legacy initial-owner revoke route возвращает
  `503 SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING`.

Engineering exact-head
`f5d39fd89145c995c51e7005698327f5581a5cd8` принят GitHub CI
[`30467882578`](https://github.com/boozik3412/leetplus/actions/runs/30467882578)
(`run #37`), `3/3 PASS`, и independent review без новых P0/P1. Предыдущий
`CURRENT_168` exact-head
`3b8228dd278fae062c753bf4301e0339ba93738b` принят GitHub CI
[`30460154200`](https://github.com/boozik3412/leetplus/actions/runs/30460154200),
`3/3 PASS`, и независимым review без новых P0 только как historical
prerequisite. Local engineering evidence не является production-like
admission: persisted GO, production deploy и доступ тестеру ещё не приняты.

## A. Gate 0: source и release

- [ ] Есть один canonical clean candidate SHA.
- [ ] Mandatory CI, typecheck, tests, schema validation и artifact build
      зелёные для exact SHA.
- [ ] API, web, workers и Telegram edge показывают тот же SHA через version
      evidence.
- [ ] Deployment выполняется immutable artifact, а не mutable checkout.
- [ ] Release owner, reviewer и rollback owner назначены.
- [ ] Open P0/P1 launch blockers отсутствуют.

## B. Shared topology и control plane

- [ ] Manifest подтверждает один существующий `Tenant A` и четыре
      `Store A1..A4`.
- [ ] Новый внешний клуб создаётся как отдельный `Tenant B/Store B1`, а не
      добавляется в A.
- [ ] Web, API, workers, PostgreSQL и Telegram действительно shared.
- [ ] Public demo не использует operational/PII/integration data A или B.
- [ ] `Tenant B` создаётся только idempotent Platform Admin workflow, без
      manual SQL.
- [ ] Persisted lifecycle, customer stage, onboarding, nullable trial dates,
      cohort и support owner созданы; shell оставляет trial dates пустыми до
      protected activation.
- [ ] Persisted profile содержит ровно шесть current-revision rows: пять
      product modules и supporting `INTEGRATIONS`; у всех initial
      `read/write=ON`, `outbound=OFF`, reason, validity и audit.
- [ ] Generic profile mutation отклоняет любое `outbound=ON`; dedicated
      outbound workflow ещё не является выполненным условием initial access.
- [ ] Generic onboarding mutation допускает только same-state update; все
      cross-state transitions принадлежат dedicated workflows, а shell
      provisioning оставляет tenant в `PROVISIONING` без invite/token/trial.
- [ ] Generic lifecycle mutation отклоняет любой non-`INTERNAL` tenant;
      dedicated external activation/suspend/offboarding приняты отдельно.
- [x] Trigger-owned `executionRevision` увеличивается при
      lifecycle/onboarding/trial/profile mutation; прямой revision write
      запрещён, shared API mutation paths используют CAS.
- [x] Report SMTP и bonus-ledger Langame write сохраняют captured revision и
      повторно проверяют permit перед effect; SMTP authority и ledger claim
      ownership перечитываются у effect boundary, stale transition fenced.
- [ ] Runtime DB role либо DB invariant запрещает прямое изменение
      `TenantModuleEntitlement` в обход profile-revision workflow.
- [ ] Runtime DB role enrolled как отдельная non-owner identity: имеет exact
      six-RPC allowlist и zero effective `IdentityEmailClaim` table DML;
      migration owner/superuser не используется приложением.
- [ ] Delivery, общий Langame sync и остальные jobs имеют durable
      claim/lease; старый permit не может commit/ack/send после suspend, а
      начатый provider request проходит documented drain/reconciliation.
- [ ] Persisted `SHARED BETA GO` привязан к exact release SHA, environment,
      schema head, policy manifest, profile digest и execution revision.
- [ ] Unknown/missing/expired state прекращает действие fail-closed.
- [ ] Tenant suspend действует на login/invite/API/BFF/files/jobs/sync/
      rewards/Telegram без restart.

Evidence:

- [ ] topology manifest;
- [ ] remote PostgreSQL 16 populated `163 → 164` rehearsal exact candidate:
      preserved fixtures, три SQLSTATE `55000`, lock-timeout, late-DDL
      rollback, idempotent deploy; CI wiring/self-test без remote PASS не
      закрывают этот checkbox;
- [ ] real PostgreSQL shell-provision/activation/suspend concurrency report;
- [ ] entitlement/lifecycle contract tests;
- [ ] dedicated activation/suspend и expiry propagation smoke.

## C. OWNER invite и delegation

- [ ] Shell provisioning одной serializable-транзакцией создаёт
      `PILOT/SUSPENDED/PROVISIONING/revision 1` tenant, inactive Store, OWNER
      override, exact six-row профиль, canonical owner-email claim и
      audit/request digest; `UserInvite`, token, outbox и trial ещё отсутствуют.
- [ ] Provision и legacy initial-owner revoke routes остаются `503` до
      завершения activation/issue/reissue/revoke/accept workflow; нет
      временного manual SQL или direct service bypass.
- [ ] Case-insensitive email claim уникален между User/live invite/pending
      email change и защищён единым advisory-lock namespace.
- [ ] Все legacy `User`/`UserInvite` writers используют sealed
      `assert → write → transition`/reserve/release invariant и не обходят его
      прямым table DML.
      Обычные `UsersService`/`AuthService` paths переведены в `CURRENT_169`,
      но checkbox остаётся открытым до inventory/backfill строк без provenance,
      изоляции design-partner CLI и реализации activation/outbox writers.
- [ ] `BETA-IAM-004B` read-only inventory на exact `CURRENT_169` принят по
      exact-head tests/CI/review: все User, включая inactive, считаются
      owner-кандидатами; invite — только live candidate; collision/mismatch/
      invalid и bound claim + `NULL` provenance блокируют, terminal history не
      получает synthetic revision, Platform Admin/unverified User и legacy
      live token требуют review. Exact catalog/22-column ACL, strict remote TLS,
      approved production database digest и release-artifact binding должны
      пройти fail-closed; ownership dependencies, system-schema/object,
      FDW/parameter/type authority равны zero, `pg_catalog` PUBLIC ACL не
      расширен относительно `pg_init_privs`, built-in `information_schema`
      сохраняет только штатный `SELECT/USAGE` без grant option, executable
      high-OID system function и system `SECURITY DEFINER` отсутствуют, exact
      восемь internal RI FK triggers enabled, frozen lock/package manifest и
      Prisma `6.19.3` совпадают с artifact. Production inventory не
      выполнялся, а signed proposal/apply/rollback остаются отдельными
      будущими решениями.
- [ ] До production deploy создано, защищённо установлено и аттестовано
      отдельное fingerprint HMAC secret value version `v1`; оно не
      переиспользует другой production secret.
- [ ] Activation имеет privacy-safe locator для зарезервированной identity и
      повторно проверяет exact claim под lock без raw email в audit/response.
- [ ] Dedicated activation принимает persisted GO, запускает trial и атомарно
      создаёт email-bound `NETWORK OWNER` invite hash + encrypted mail outbox,
      переводя tenant в `ACTIVE/OWNER_INVITED`.
- [ ] Activation response/replay не содержит email, token, registration URL
      или ciphertext.
- [ ] Identity mail worker использует lease/CAS/retry, stable Message-ID,
      отдельный versioned encryption key и очищает ciphertext после terminal
      state.
- [ ] Invite transport использует browser fragment + немедленную очистку URL,
      а API принимает token только в POST body; query/path transport удалён.
- [ ] Reissue/revoke отменяет старый invite/outbox, ротирует token и делает
      старый secret недействительным без его возврата actor.
- [ ] Mail/HTTPS/TLS/key configuration валидируется fail-closed; production
      не использует `localhost:1025` или placeholder sender.
- [ ] Generic lifecycle endpoint для activation не используется.
- [ ] Accept атомарен; concurrent accept создаёт ровно одного owner.
- [ ] OWNER получает `NETWORK` только внутри `Tenant B`.
- [ ] Platform Admin не является tenant role и не назначается через tenant API.
- [ ] `User.role` не имеет database default; каждый create/invite/transfer
      path назначает роль явно.
- [ ] Generic direct user creation, invite issue/rotation и email change для
      external tenant отклоняются до появления verified email delivery/change
      workflows; raw invite secret не возвращается tenant actor.
- [ ] После включения verified email workflow OWNER может приглашать users,
      создавать custom roles и назначать только B/B1.
- [ ] `STORES` требует persisted непустой allowed set.
- [ ] Actor не выдаёт role/capability/scope выше собственной authority.
- [ ] Обычный ADMIN не назначает OWNER; owner transfer и last-owner protection
      проверены отдельно.
- [ ] Resend/revoke/accept/block/session revoke имеют audit и действуют сразу.
- [ ] Public self-registration остаётся выключенной.

Evidence:

- [ ] real PostgreSQL concurrent shell provision/activate/reissue/revoke/accept
      matrix, включая case-variant email collision;
- [x] remote exact-head CI и independent review для `CURRENT_169`:
      `f5d39fd89145c995c51e7005698327f5581a5cd8` / CI `30467882578`
      (`run #37`), `3/3 PASS`, review PASS без новых P0/P1; это только
      engineering prerequisite, не production-like admission;
- [x] local engineering evidence нового `BETA-IAM-004B` inventory candidate:
      core self-test `18`, smoke self-test `18`, Node unit `17/17`,
      PostgreSQL 16 smoke на трёх disposable clones — `PASS`; healthy
      topology=`zero findings`, два proposal + `REVIEW`,
      adversarial=`BLOCKED / reachable codes`, catalog/authority
      drift=`REJECTED`, privacy=`PASS`,
      cleanup=`guaranteed LIFO / 0 DB / 0 roles / 0 parameter ACL`,
      `clusterAclRestored=true`;
- [x] финальный independent security review нового `BETA-IAM-004B` inventory
      candidate — `PASS` без оставшихся actionable P0/P1/P2;
- [ ] exact-head GitHub CI нового `BETA-IAM-004B` inventory candidate; до его
      сохранения evidence остаётся `PENDING`, production inventory не запускался и
      `gr1mmphone1@gmail.com` не создан;
- [x] remote exact-head CI и independent review для `CURRENT_168`:
      `3b8228dd278fae062c753bf4301e0339ba93738b` / CI `30460154200`,
      `3/3 PASS`, review PASS без новых P0; local `168/168`, identity `1/99`
      и shell `2/2` приняты как engineering prerequisites;
- [ ] email outbox lease/crash/retry drill без утечки raw token;
- [ ] delegation/escalation negative matrix;
- [ ] stale-token и immediate-revoke tests;
- [ ] owner/network/store browser journeys.

## D. Two-tenant shared-data-plane isolation

Реальная PostgreSQL fixture содержит:

```text
Tenant A: Store A1, Store A2
Tenant B: Store B1
actors: A-network, A-store1, A-store2, B-owner, B-store1
```

Для каждого обязательного модуля проверены:

- [ ] list;
- [ ] detail по UUID;
- [ ] aggregate/dashboard;
- [ ] create/update/delete;
- [ ] filter/query params;
- [ ] export;
- [ ] attachment/file;
- [ ] BFF;
- [ ] browser navigation/direct URL;
- [ ] background job;
- [ ] SSE/notification, если применимо.

Обязательные negative cases:

- [ ] A не читает и не изменяет B;
- [ ] B не читает и не изменяет A;
- [ ] A1 actor не получает A2 resource;
- [ ] B1 actor не повышается до NETWORK;
- [ ] hidden UUID и forbidden `tenantId/storeId/storeIds` fail-closed;
- [ ] stale JWT после scope/capability/lifecycle change fail-closed;
- [ ] empty/unknown scope не повышает доступ;
- [ ] test-only bypass/fixture policy в production path отсутствует.

## E. Module gates

### E1. `GAMIFICATION`

- [ ] Rules, missions/chains, Battle Pass, lootboxes, promo cards, wallet,
      rewards, entitlements, ledger, deliveries и reconciliation защищены
      tenant/store policy.
- [ ] Guest registration/profile/XP и club selection не позволяют выбрать
      ресурс другого tenant.
- [ ] Shared Telegram identity корректно маршрутизируется в B/B1.
- [ ] Telegram update ID дедуплицируется durable.
- [ ] Reward posting идемпотентен; loss/duplicate reconciliation зелёный.
- [ ] External reward write-back остаётся `OFF`.
- [ ] Store-level `SHADOW → CANARY → LIVE` и kill switch проверены отдельно.

### E2. `ASSORTMENT`

- [ ] Products/categories/suppliers/inventory/sales/movements/OOS/matrix/
      recommendations имеют tenant/store scope.
- [ ] Reports/exports/imports/parser/bulk operations не обходят scope.
- [ ] Initial source freshness и data-quality diagnostics видны владельцу.
- [ ] Foreign club/source rows не импортируются в B.
- [ ] Periodic sync и external writes остаются отдельно gated.

### E3. `STAFF`

- [ ] Directory, tasks/templates/recurring и shift workspace защищены.
- [ ] Regulations/checklists/knowledge/training/onboarding/tests/assessment
      защищены для list/detail/files/background.
- [ ] Control/ratings/motivation/discipline защищены и аудируются.
- [ ] Salary работает только как planning; payout отсутствует.
- [ ] Attachments имеют live parent ACL, revoke и tenant/store negative tests.
- [ ] OWNER/network manager/club manager/senior/trainee journeys зелёные.

### E4. `COMMUNICATIONS`

- [ ] Network/store channel membership ограничивает history и posting.
- [ ] Messages/mentions/read receipts/channel events/task-from-chat защищены.
- [ ] SSE reconnect не отдаёт события чужого tenant/store.
- [ ] Notifications и CRM contact tasks соблюдают scope.
- [ ] PII masked by default; reveal/export требуют capabilities и audit.
- [ ] Mass Telegram/MAX/SMS остаются `OFF`.

### E5. `USERS_ROLES`

- [ ] Users/invites/roles/capabilities/scope/audit проходят C/D.
- [ ] Block/revoke/session revoke действуют немедленно.
- [ ] Last-owner и owner-transfer invariants зелёные.

## F. `INTEGRATIONS` supporting control-plane

- [ ] Credentials принадлежат Tenant B и зашифрованы.
- [ ] Secrets не возвращаются API и не попадают в logs/evidence.
- [ ] URL policy проверяет scheme/host/port, DNS/IP и rebinding.
- [ ] Loopback, link-local, metadata и запрещённые private targets отклоняются.
- [ ] Общий timeout, bounded retry, circuit breaker и rate limit включены.
- [x] Bonus-ledger balance write имеет обязательный timeout до 30 секунд,
      неоднозначный результат уходит в reconciliation без write retry и
      защищён quarantine перед `NOT_APPLIED`.
- [ ] Preview перечисляет видимые source clubs без создания Store.
- [ ] OWNER явно выбирает свой source club и связывает только `Store B1`.
- [ ] Domain/API key не импортирует автоматически остальные видимые клубы.
- [ ] Read-only connection diagnostic успешен.
- [ ] Initial sync отдельно одобрен и сверён.
- [ ] Unattended sync, write-back и mass messaging остаются `OFF` до своих GO.

## G. Shared workers и Telegram

- [x] Временный authoritative registry перечисляет все 17 проверенных job
      kinds: для external stage разрешены только два revision-fenced effect
      path, остальные 15 fail-closed запрещены. Это containment evidence, а не
      закрытие durable worker/suspend пунктов ниже:
      [checkpoint](./background-execution-containment.md).
- [ ] Каждый job получает explicit tenant/store system identity.
- [ ] All-tenant iteration не использует общий user/service token.
- [ ] Durable lease/fencing не допускает двойного scheduler ownership.
- [ ] Retry/idempotency предотвращают duplicate effects.
- [ ] Hardcoded tenant/store IDs отсутствуют.
- [ ] Tenant suspend прекращает новые jobs и messages.
- [ ] Per-tenant/per-store kill switches проверены.
- [ ] Shared Telegram routing и multi-profile identity имеют A/B negative tests.
- [ ] Queue backlog, retry, dead-letter/reconciliation и alert видны operator.

## H. Operations, support и rollback

- [ ] Readiness проверяет DB, migrations, secrets, dependencies и execution
      policy, а liveness остаётся безопасной.
- [ ] External probes и critical alerts доставлены primary/backup owner.
- [ ] Fresh backup успешно восстановлен в disposable environment.
- [ ] N-1 либо reviewed fix-forward drill выполнен.
- [ ] Tenant suspend, outbound OFF, module writes OFF и jobs stop проверены.
- [ ] Invite/session revoke и integration disable проверены.
- [ ] Feedback содержит tenant/user/role/route/SHA/request ID без auto-PII.
- [ ] Trial expiry, offboarding, export/retention/delete procedure назначены.
- [ ] Day-0 и D1/D7 support windows согласованы.

## I. Gate 1MT и Gate 2

- [ ] Все `BETA-MT-001..009` приняты — Gate 1MT закрыт.
- [ ] Gate 2A закрыт, текущий `Tenant A/A1..A4` прошёл cutover.
- [ ] Текущая сеть прошла семь стабильных дней internal alpha.
- [ ] Все обязательные module gates имеют `VERIFIED + ENFORCED`.
- [ ] Нет open launch-blocking P0/P1.
- [ ] Production-like upgrade/rollback/zero-diff и полная two-tenant
      rehearsal приняты как protected evidence.
- [ ] Gate 2 закрыт отдельным approval.

Ни Gate 1MT, ни Gate 2 по отдельности не разрешают invite. Требуется финальный
protected record ниже.

## J. `SHARED BETA GO`

Protected record содержит:

```text
decision: GO | NO-GO
release SHA:
artifact/version evidence:
environment:
topology aliases: Tenant A/A1..A4; Tenant B/B1
profile key/revision:
trial start/end:
enabled read/write entitlements:
enabled outbound entitlements:
integration state:
open accepted risks:
support primary/backup:
incident owner:
rollback owner:
approver:
approved at:
stop conditions:
evidence index:
```

- [ ] Решение — `GO`.
- [ ] Activation использовала этот exact persisted GO; invite/outbox созданы
      только после timestamp решения.
- [ ] Raw invite token доставлен только verified mail worker, не раскрыт
      оператору/actor и не прошёл через path/query.
- [ ] В evidence нет email, пароля, токена, secrets и raw business data.

## K. Day-0

- [ ] OWNER принял invite и установил собственный пароль.
- [ ] Login/logout/session revoke работают.
- [ ] OWNER видит только `Tenant B/Store B1`.
- [ ] OWNER создал одного ограниченного тестового пользователя.
- [ ] Role/scope change применился без новой сессии либо активная сессия
      безопасно отозвана согласно contract.
- [ ] Integration preview показал ожидаемый source club.
- [ ] Initial mapping создал/связал только B1.
- [ ] Выполнено одно безопасное in-app действие в каждом из пяти product
      modules и один approved control-plane action в `INTEGRATIONS`.
- [ ] Outbound/jobs остаются в approved state.
- [ ] Feedback принят и привязан к exact SHA.
- [ ] Kill switch и support channel подтверждены.

## L. First-club cycle

- [ ] D1 review: access, data, sync, incidents и feedback.
- [ ] D7 review: повторяемость workflow, freshness, support load и capacity.
- [ ] Нет cross-tenant/store/PII, reward-integrity или routing incident.
- [ ] Все findings имеют severity, owner и decision.
- [ ] Перед вторым внешним tenant принято отдельное capacity/incident решение.

## M. Stop/offboarding

При stop condition:

1. outbound `OFF`;
2. module writes `OFF`;
3. jobs stop;
4. sessions/invites revoke;
5. integration credentials disabled/rotated;
6. `Tenant B SUSPENDED`;
7. evidence preserved, incident opened;
8. destructive rollback запрещён без отдельного data decision.

- [ ] Emergency path rehearsed.
- [ ] Partner communication owner назначен.
- [ ] Export/retention/delete decision сохранён.
- [ ] Возврат возможен только с новым entitlement revision и новым GO.
