# Identity invite writer boundary

| Поле | Значение |
| --- | --- |
| Версия | 1.2 |
| Дата | 29.07.2026 |
| Schema target | `CURRENT_169` |
| Migration | `20260729230000_identity_invite_writer_boundary` |
| Статус | `IMPLEMENTED_CANDIDATE`; local PostgreSQL и exact-head engineering CI/review приняты |
| Release decision | `NO-GO`; production и внешний доступ не изменялись |

## Зачем нужен этот срез

Один владелец внешнего клуба должен получить email-bound приглашение, а затем
сам создавать пользователей только внутри своего `Tenant` и разрешённых
`Store`. До `CURRENT_169` canonical email claim уже существовал, но обычные
`User`/`UserInvite` writers ещё могли обходить его.

`CURRENT_169` переводит основные runtime-пути приглашений и принятия
приглашения на одну sealed state machine. Срез не включает создание внешнего
tenant, отправку письма или production activation и поэтому сам по себе не
разрешает выдать тестовый доступ.

## Persisted provenance

Migration 169 добавляет:

- `User.identityClaimRevision`;
- `UserInvite.identityClaimRevision`;
- `UserInvite.revokedAt`;
- `UserInvite.revokedByUserId`;
- положительные revision checks;
- запрет одновременно accepted и revoked invite;
- запрет `revokedByUserId` без `revokedAt`;
- canonical lookup indexes для `User` и live non-revoked `UserInvite`.

Поля revision nullable только для совместимости с историческими строками.
Любой migrated runtime writer трактует `NULL` как
`IDENTITY_INVITE_PROVENANCE_REQUIRED` и ничего не изменяет. Legacy rows не
считаются автоматически принятыми и требуют отдельного inventory/backfill.

## Sealed RPC

Runtime application role получает `EXECUTE` ровно на четыре identity
boundary:

1. `identity_email_claim_reserve_invite_v2`;
2. `identity_email_claim_assert_invite_v1`;
3. `identity_email_claim_transition_v2`;
4. `identity_email_claim_release_v2`.

Вместе с двумя guest-game helpers это остаётся exact six-RPC allowlist.
`reserve_v1`, `transition_v1`, `release_v1`, raw lock helper и worker-only
event writer явно исключены. Прямые table privileges на
`IdentityEmailClaim` равны нулю.

`reserve_v2` не считает явно revoked history активным приглашением.
`transition_v2` повторно проверяет destination даже при replay и сохраняет
владение email за inactive `User`. `release_v2` освобождает только точный
unbound shell subject либо явно revoked, не принятый `UserInvite` с совпавшей
persisted revision; history приглашения не удаляется.

## Application workflows

### Создание приглашения

```text
reserve temporary INVITE subject
→ assert exact revision under the same transaction lock
→ create UserInvite with explicit UUID and NULL provisional revision
→ transition INVITE → INVITE
→ persist returned revision
→ commit
```

Token создаётся до транзакции, но наружу возвращается только после успешного
commit. При любой ошибке invite, claim и provenance откатываются вместе.

### Переиздание

Canonical email менять нельзя. Same-email reissue:

```text
assert old invite
→ create a new immutable UserInvite
→ CAS-revoke the old invite
→ transition old INVITE → new INVITE
→ persist new revision
→ commit
```

Старый token становится недействительным, а revoked history сохраняется.
Смена адреса требует будущего отдельного verified email-change workflow и
сейчас отвечает `INVITE_EMAIL_CHANGE_WORKFLOW_REQUIRED`.

### Отзыв

Явный cancel проверяет exact claim, CAS-помечает invite как revoked и затем
вызывает `release_v2` в той же транзакции. Это работает и для уже естественно
истёкшего приглашения: исходный `expiresAt` сохраняется, но explicit revoke
освобождает claim. Одна только естественная expiry claim не освобождает.

### Принятие

```text
assert invite claim — первая lock-sensitive операция
→ lock Tenant и повторно проверить admission/profile
→ create User с заранее созданным UUID
→ CAS-accept только acceptedAt=NULL + revokedAt=NULL
→ transition INVITE → USER
→ persist User.identityClaimRevision
→ commit
```

Concurrent revoke/reissue/accept сериализуются по canonical email lock.
Receipt, audit и ошибки не содержат raw token или email.

### Fail-closed пути

- direct `User` creation: `DIRECT_USER_CREATION_REQUIRES_INVITE`;
- реальная смена `User.email`: `USER_EMAIL_CHANGE_WORKFLOW_REQUIRED`;
- смена email существующего invite:
  `INVITE_EMAIL_CHANGE_WORKFLOW_REQUIRED`;
- legacy invite без revision:
  `IDENTITY_INVITE_PROVENANCE_REQUIRED`.

Application boundary test разрешает создание `User` только в
`AuthService`, а mutation `UserInvite` — только в `AuthService` и
`UsersService`. Прямой claim ORM/SQL access вне sealed service запрещён.

## Принятое local evidence

Все проверки выполнялись без production data на disposable loopback
PostgreSQL `16.13`:

```text
clean migration deploy: 169/169
database connectivity/current-head smoke: PASS
identity writer static contract: 14/14
runtime enrollment static contract: 13/13
focused auth/users/provisioning tests: 89/89
full API suite: 99 suites, 1940 passed, 2 todo
API typecheck/lint boundary/build: PASS
shared tenant shell PostgreSQL integration: 2/2
runtime role: 6 application grants, 0 sealed-table privileges
identity concurrency: 100 = 1 CREATED + 99 ALREADY_RESERVED
transition replay destination check: PASS
retained revoked invite release: PASS
revoked invite → same-email reserve_v2: PASS
```

Первый exact-head `f9db264...` / CI
[`30467211571`](https://github.com/boozik3412/leetplus/actions/runs/30467211571)
сохранён как `REJECTED`, `2/3 PASS`: historical StaffTask `EXPAND_162`
rehearsal обнаружил post-baseline `User.identityClaimRevision` в
неограниченном Prisma `RETURNING`. Compatibility fix заморозил historical
User create/update/delete projection до `id/tenantId`.

Engineering exact-head
`f5d39fd89145c995c51e7005698327f5581a5cd8` принят GitHub CI
[`30467882578`](https://github.com/boozik3412/leetplus/actions/runs/30467882578)
(`run #37`), `3/3 PASS`: Application `90630292527`, authority-root
`90630292169`, PostgreSQL 16 `90630292257`. Independent reviews не нашли
новых P0/P1; review compatibility fix также не нашёл P2.

Local и remote engineering evidence не являются production-like admission,
persisted GO, production deployment или разрешением на создание аккаунта
тестера.

## Оставшиеся launch blockers

1. Выполнить privacy-safe inventory и admitted backfill исторических
   `User`/`UserInvite` в текущей сети; collision и ambiguous rows должны
   остаться fail-closed.
2. Реализовать activation locator по reservation UUID/HMAC, persisted
   `SHARED BETA GO`, trial start, initial OWNER invite и encrypted leased mail
   outbox.
3. Реализовать verified delivery, resend/revoke transport и browser
   fragment + POST-body token flow без утечки URL/token.
4. Реализовать first-class verified `EMAIL_CHANGE`; до этого user/invite
   email mutation остаётся закрытой.
5. Принять оставшееся evidence для уже реализованной
   [`DESIGN_PARTNER_IDENTITY_WRITER_ISOLATION_V1`](./design-partner-identity-writer-isolation.md):
   legacy CLI/exported `provision` и `rotate-invite` fail-closed до
   manifest/Prisma/БД/token, local unit/boundary `23/23 PASS`; independent
   review принят без actionable P0/P1/P2 в заявленном scope. Local PostgreSQL
   smoke не запускался без `DATABASE_URL`/Postgres, remote exact-head CI pending.
6. Добавить bounded natural-expiry sweeper с audit/reconciliation. До этого
   expired invite освобождается только явным cancel.
7. Пройти production-like upgrade, rollback, zero-diff, full
   accept/revoke/reissue race и two-tenant application/browser matrix.
8. Аттестовать function body digest/owner, production fingerprint HMAC key,
   backup/restore, monitoring и exact release artifact.
9. Только после Gate 1MT, Gate 2 и отдельного protected `SHARED BETA GO`
   открыть admin activation route и отправить первое приглашение.

Исторический independent review широкого `CURRENT_169` application
writer-boundary diff не обнаружил P0/P1, но сохранил два engineering P2:
его static writer test основан на буквальных Prisma-patterns и должен быть
усилен AST/DB-level guardrail против raw SQL, aliases и nested writes; unit
transaction mocks не доказывают реальный rollback, поэтому пункт 7 требует
настоящего PostgreSQL race/recovery evidence. Это не verdict для отдельного
`BETA-IAM-004D`, чей exact-head review учитывается отдельно.

До закрытия этих пунктов `gr1mmphone1@gmail.com` не создаётся, пароль
`123456` не устанавливается, а production остаётся без изменений.
