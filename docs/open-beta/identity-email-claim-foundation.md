# Identity email claim foundation and sealed write boundary

| Поле | Значение |
| --- | --- |
| Версия | 1.3 |
| Дата | 29.07.2026 |
| Schema target | `CURRENT_169` |
| Foundation migration | `20260729190000_identity_email_claim_foundation` |
| Write-boundary migration | `20260729210000_identity_email_claim_write_boundary` |
| Writer-boundary migration | `20260729230000_identity_invite_writer_boundary` |
| Статус | `IMPLEMENTED_CANDIDATE`; local PostgreSQL принято, exact-head CI pending, not deployed |
| Release decision | `NO-GO` для реального Tenant B, OWNER invite и production deploy |

## Назначение

`IdentityEmailClaim` — глобальная резервация канонического e-mail для
identity-workflow. Она устраняет гонку, при которой два параллельных
provisioning-запроса могли независимо проверить `User`/`UserInvite`, а затем
назначить один и тот же адрес владельцам разных сетей.

Migration 167 создала модель и единый lock namespace. Migration 168 добавила
sealed write boundary и runtime-role enrollment. Вместе они уже позволяют
shell-only provisioning атомарно зарезервировать owner identity, не создавая
login identity или invite.

Migration 169 перевела основные application writers на sealed boundary и
добавила persisted provenance/revocation. Это всё ещё не готовый onboarding:

- таблица и boundary не создают `User`, `UserInvite`, пароль, token или URL;
- trial не начинается;
- письмо не формируется и не отправляется;
- outbox, activation и verified delivery ещё не готовы;
- issue/reissue/revoke/accept работают как application candidate, но
  historical rows ещё не прошли inventory/backfill;
- оба Platform Admin route остаются fail-closed с `503`;
- production migration/deploy и реальный external tenant не выполнялись.

## Foundation contract: migration 167

### Глобальный ключ

`emailCanonical` является primary key. Pilot v1 принимает только печатный
ASCII e-mail, приводит его к lower-case после trim и проверяет регулярные
выражения под явным `COLLATE "C"`.

Один canonical e-mail может принадлежать только одному tenant. FK на Tenant
имеет `ON DELETE RESTRICT` и `ON UPDATE RESTRICT`: claim нельзя потерять при
удалении или переименовании идентификатора сети.

### Типы и revision

Поддержаны:

- `INVITE`;
- `USER`;
- `EMAIL_CHANGE`.

Новый claim обязан начинаться с revision `1`. Любое допустимое изменение
увеличивает revision ровно на единицу, не меняет canonical key, tenant и
`createdAt`, а также требует новый `subjectId`.

Разрешены только прямые переходы:

- `INVITE -> INVITE` для reissue;
- `INVITE -> USER` для принятия приглашения;
- `EMAIL_CHANGE -> EMAIL_CHANGE` для reissue смены e-mail;
- `EMAIL_CHANGE -> USER` для завершения подтверждённой смены.

Обратный `USER -> INVITE`, перенос claim в другой tenant, пропуск revision и
no-op переход запрещены trigger-границей.

### Единый lock namespace

Private `SECURITY INVOKER` helper
`identity_email_claim_lock_v1(text)`:

1. канонизирует адрес;
2. валидирует pilot ASCII contract;
3. берёт transaction advisory lock в namespace
   `identity-email:v1:<canonical-email>`;
4. возвращает точный canonical key.

Runtime role не получает `EXECUTE` на этот helper. Он используется внутри
sealed `SECURITY DEFINER` boundary migration 168.

## Sealed write boundary: migration 168

Обычный application runtime не пишет `IdentityEmailClaim` прямым ORM/SQL DML.
Ему доступны только четыре точные versioned RPC:

1. `identity_email_claim_reserve_invite_v1` — под lock проверяет legacy
   `User`/live `UserInvite` conflicts и создаёт initial `INVITE` claim;
2. `identity_email_claim_assert_invite_v1` — под lock подтверждает exact
   tenant/subject/revision перед созданием связанного identity object;
3. `identity_email_claim_transition_v1` — выполняет exact CAS transition и
   проверяет существование destination `UserInvite`/`User` того же tenant;
4. `identity_email_claim_release_v1` — освобождает только допустимый
   незавязанный `INVITE`; повтор отсутствующего release fail-closed.

`assert` нужен для безопасного будущего порядка acceptance/reissue:

```text
assert INVITE (lock остаётся до конца транзакции)
→ создать или проверить destination UserInvite/User
→ transition с тем же transaction lock
→ commit
```

Boundary:

- использует параметризованные вызовы и строгие SQLSTATE;
- возвращает versioned JSONB receipt без canonical email;
- не логирует raw email;
- имеет combined partial unique invariant на `(tenantId, subjectId)` для
  `INVITE | USER`, поэтому один subject не может одновременно быть invite и
  user; отдельный partial unique invariant сохраняется для `EMAIL_CHANGE`;
- в `reserve_invite_v1` повторно проверяет legacy `User` и live
  `UserInvite` **до** выдачи replay receipt, поэтому появившийся legacy writer
  не превращает старую reservation в ложный success;
- все четыре `SECURITY DEFINER` RPC имеют exact
  `SET search_path = pg_catalog`; PostgreSQL smoke проверяет `proconfig`, а не
  только текст migration;
- не выдаёт runtime role прямой `EXECUTE` на lock helper;
- не выдаёт runtime role worker-only delivery event function.

## Runtime writer adoption: migration 169

Migration 169 добавляет persisted `identityClaimRevision` в `User` и
`UserInvite`, explicit `revokedAt/revokedByUserId`, canonical lookup indexes и
три исправленные boundary:

- `reserve_invite_v2` исключает explicitly revoked invite history;
- `transition_v2` валидирует destination до replay и не освобождает email
  inactive user;
- `release_v2` сохраняет revoked invite history и требует exact persisted
  provenance.

Основные runtime-пути теперь используют:

```text
issue: reserve → assert → create invite → transition → persist revision
reissue: assert old → create new → revoke old → transition → persist revision
revoke: assert → explicit CAS revoke → release
accept: assert → create User → CAS accept → transition → persist revision
```

Direct user creation и реальная смена email остаются fail-closed. Legacy
строка с `NULL identityClaimRevision` также fail-closed до отдельного
admitted backfill. Полный контракт описан в
[identity invite writer boundary](./identity-invite-writer-boundary.md).

### Runtime-role contract

Enrollment на `CURRENT_169` выдаёт ровно шесть application RPC:

- `guest_game_delivery_transition_key_v1`;
- `guest_game_reward_delivery_lock_v1`;
- `identity_email_claim_reserve_invite_v2`;
- `identity_email_claim_assert_invite_v1`;
- `identity_email_claim_transition_v2`;
- `identity_email_claim_release_v2`.

Одновременно runtime role имеет нулевые эффективные table privileges на
`IdentityEmailClaim`: нет `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`,
`REFERENCES` и `TRIGGER`. `PUBLIC` privileges также отозваны. Direct table DML
и direct `identity_email_claim_lock_v1` остаются fail-closed.

Это enrollment contract для отдельной non-owner runtime role. Он не разрешает
использовать migration owner/superuser как application identity.

## Shell-only consumer

Shared tenant shell candidate одной serializable-транзакцией:

1. создаёт `PILOT/SUSPENDED/PROVISIONING` tenant;
2. оставляет trial dates пустыми;
3. создаёт один inactive Store с gamification/background execution `OFF`;
4. создаёт OWNER capability override;
5. сохраняет ровно шесть entitlement rows revision 1:
   `read/write=ON`, `outbound=OFF`, без validity window;
6. резервирует owner email через `reserve_invite_v2`, используя заранее
   созданный UUID reservation subject;
7. сохраняет только domain-separated HMAC fingerprint и его key version в
   audit;
8. возвращает несекретный shell snapshot.

Не создаются `User`, `UserInvite`, token, registration URL, trial, outbox или
email message. Replay привязан к HMAC request digest и не создаёт дублей.
После fail-closed recovery весь serializable shell повторяется не более одного
раза и только для `P2034`, PostgreSQL `40001/40P01` или
`IDENTITY_CLAIM_RETRY_REQUIRED`.

Пока activation-контракт не завершён, оба route намеренно недоступны:

```text
POST /admin/shared-beta/tenants/provision
  → 503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING

POST /admin/tenants/:tenantId/initial-owner-invite/revoke
  → 503 SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING
```

## Локальное PostgreSQL evidence кандидата

На disposable PostgreSQL `16.13`, без production data и без production
deployment, получены:

- clean deploy `169/169`;
- identity boundary idempotency: `100` конкурентных попыток,
  `1 CREATED + 99 ALREADY_RESERVED`;
- combined `INVITE | USER` same-subject collision отклонён;
- retained revoked invite history освобождает claim без удаления invite;
- `reserve_v2` допускает same-email reservation после explicit revoke;
- shell provisioning PostgreSQL integration: `2/2`;
- 100-way cross-slug shell race:
  `50 winner responses + 50 IDENTITY_EMAIL_UNAVAILABLE`;
- runtime enrollment подтвердил exact six-RPC allowlist и zero
  `IdentityEmailClaim` table DML.

Предыдущий `CURRENT_168` exact-head
`3b8228dd278fae062c753bf4301e0339ba93738b` принят GitHub CI
[`30460154200`](https://github.com/boozik3412/leetplus/actions/runs/30460154200),
`3/3 PASS`, и независимым review без новых P0. Exact-head CI/review для
`CURRENT_169` ещё pending. Local и remote engineering
evidence не являются production-like admission, persisted GO, production
deploy или разрешением на выдачу доступа.

Startup validation candidate уже требует отдельный
`IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY`, запрещает reuse с другими production
secrets и требует version `v1`; CI environment contract обновлён. Это не
незакрытый code blocker. До production deploy необходимо фактически создать,
защищённо передать и аттестовать отдельное production-значение.

## NO-GO blockers

До реального OWNER invite обязательны:

1. Выполнить inventory/backfill исторических `User` и `UserInvite`;
   ambiguous/collision rows должны остаться fail-closed. Основные runtime
   writers уже переведены, isolated design-partner CLI требует отдельного
   решения.
2. Реализовать безопасный activation locator: shell хранит claim UUID и HMAC,
   но не raw email; activation должна найти нужную identity без PII lookup
   leak и перепроверить её под lock.
3. Реализовать persisted `SHARED BETA GO`, activation, trial start,
   `UserInvite`, encrypted leased outbox и verified delivery.
4. Реализовать fragment + POST-body invite transport, resend/session revoke и
   bounded expiry sweeper; application acceptance/reissue/revoke candidate уже
   использует `assert → write → transition`.
5. Выполнить полный 100-way accept/accept, accept/revoke и accept/reissue
   PostgreSQL matrix.
6. Пройти production-like upgrade/rollback/zero-diff и полноценную
   two-tenant rehearsal.

Remote exact-head CI и независимый review текущего `CURRENT_169` кандидата
ещё не закрыты. `3b8228dd...` / CI `30460154200` относится к предыдущему
`CURRENT_168` prerequisite.

До внешней активации также закрываются P1 hardening items:

- body digest и ожидаемый definer-owner четырёх `SECURITY DEFINER` RPC должны
  входить в runtime admission; definer получает только least-privilege доступ;
- shell replay перечитывает фактические Tenant/Store, OWNER override и six-row
  entitlement state, не доверяя одному audit receipt.

До закрытия этих пунктов migrations 168/169 нельзя считать разрешением на
production deploy, создание учётной записи или отправку приглашения внешнему
тестеру.
