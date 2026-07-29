# Identity email claim foundation and sealed write boundary

| Поле | Значение |
| --- | --- |
| Версия | 1.2 |
| Дата | 29.07.2026 |
| Schema target | `CURRENT_168` |
| Foundation migration | `20260729190000_identity_email_claim_foundation` |
| Write-boundary migration | `20260729210000_identity_email_claim_write_boundary` |
| Статус | `IMPLEMENTED_CANDIDATE`; exact-head CI/review приняты, not deployed |
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

Это всё ещё не готовый onboarding:

- таблица и boundary не создают `User`, `UserInvite`, пароль, token или URL;
- trial не начинается;
- письмо не формируется и не отправляется;
- outbox, activation, acceptance, reissue и revoke workflow ещё не готовы;
- legacy `User`/`UserInvite` writers ещё не переведены на общий claim
  invariant;
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

### Runtime-role contract

Enrollment на `CURRENT_168` выдаёт ровно шесть application RPC:

- `guest_game_delivery_transition_key_v1`;
- `guest_game_reward_delivery_lock_v1`;
- четыре identity RPC, перечисленные выше.

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
6. резервирует owner email через `reserve_invite_v1`, используя заранее
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

На disposable PostgreSQL `16.14`, без production data и без production
deployment, получены:

- clean deploy `168/168`;
- identity boundary idempotency: `100` конкурентных попыток,
  `1 CREATED + 99 ALREADY_RESERVED`;
- combined `INVITE | USER` same-subject collision отклонён;
- shell provisioning PostgreSQL integration: `2/2`;
- 100-way cross-slug shell race:
  `50 winner responses + 50 IDENTITY_EMAIL_UNAVAILABLE`;
- runtime enrollment подтвердил exact six-RPC allowlist и zero
  `IdentityEmailClaim` table DML.

Remote exact-head implementation
`3b8228dd278fae062c753bf4301e0339ba93738b` принят GitHub CI
[`30460154200`](https://github.com/boozik3412/leetplus/actions/runs/30460154200),
`3/3 PASS`, и независимым review без новых P0. Local и remote engineering
evidence не являются production-like admission, persisted GO, production
deploy или разрешением на выдачу доступа.

Startup validation candidate уже требует отдельный
`IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY`, запрещает reuse с другими production
secrets и требует version `v1`; CI environment contract обновлён. Это не
незакрытый code blocker. До production deploy необходимо фактически создать,
защищённо передать и аттестовать отдельное production-значение.

## NO-GO blockers

До реального OWNER invite обязательны:

1. Перевести все legacy `User` и `UserInvite` writers на sealed claim
   invariant; обход таблицы или lock-before-read запрещён.
2. Реализовать безопасный activation locator: shell хранит claim UUID и HMAC,
   но не raw email; activation должна найти нужную identity без PII lookup
   leak и перепроверить её под lock.
3. Реализовать persisted `SHARED BETA GO`, activation, trial start,
   `UserInvite`, encrypted leased outbox и verified delivery.
4. Реализовать fragment + POST-body invite transport, acceptance,
   reissue/revoke/resend и session revoke поверх `assert → write → transition`.
5. Выполнить полный 100-way accept/accept, accept/revoke и accept/reissue
   PostgreSQL matrix.
6. Пройти production-like upgrade/rollback/zero-diff и полноценную
   two-tenant rehearsal.

Remote exact-head CI и независимый review текущего кандидата закрыты:
`3b8228dd278fae062c753bf4301e0339ba93738b` / CI `30460154200`,
`3/3 PASS`, review PASS без новых P0.

До внешней активации также закрываются P1 hardening items:

- body digest и ожидаемый definer-owner четырёх `SECURITY DEFINER` RPC должны
  входить в runtime admission; definer получает только least-privilege доступ;
- shell replay перечитывает фактические Tenant/Store, OWNER override и six-row
  entitlement state, не доверяя одному audit receipt.

До закрытия этих пунктов migration 168 нельзя считать разрешением на
production deploy, создание учётной записи или отправку приглашения внешнему
тестеру.
