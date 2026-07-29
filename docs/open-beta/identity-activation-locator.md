# Identity activation locator

| Поле | Значение |
| --- | --- |
| Версия | 1.0 |
| Дата | 29.07.2026 |
| Backlog | `BETA-IAM-004F` |
| Schema target | `CURRENT_170` |
| Migration | `20260729233000_identity_activation_locator` |
| Статус | `IMPLEMENTED_CANDIDATE`; локальный PostgreSQL 16 подтверждён, exact-head CI/review pending |
| Release decision | `NO-GO`; production, Tenant B, OWNER invite и outbound не изменялись |

## 1. Назначение

Shell provisioning резервирует e-mail первого OWNER до создания
`UserInvite`. В `CURRENT_169` зарезервированная identity адресовалась только по
`emailCanonical`, а после перехода claim поле `subjectId` менялось. Это не
позволяло будущей activation:

- найти reservation по сохранённому UUID без raw e-mail;
- сохранить один lock order с обычными identity writers;
- безопасно повторить команду после перехода reservation → invite;
- оставить runtime без `SELECT` на `IdentityEmailClaim`.

Migration 170 добавляет неизменяемый opaque `workflowLocator`. Для initial
OWNER он равен server-generated reservation UUID и остаётся прежним при
изменении `subjectId`.

Locator является только correlation key. Он не подтверждает полномочия и не
заменяет Platform Admin authority, persisted `SHARED BETA GO`, tenant state,
request digest, claim revision или activation command receipt.

## 2. Схема и upgrade

В `IdentityEmailClaim` добавлено поле:

```text
workflowLocator TEXT NOT NULL
```

Инварианты:

- canonical lowercase UUID;
- initial value выводится из UUID `subjectId`;
- значение неизменно при любом claim transition;
- partial unique index действует для `INVITE | USER`;
- `EMAIL_CHANGE` не ломает уже разрешённую отдельную subject-модель;
- runtime не получает table или column grants.

Upgrade выполняется одной транзакцией с `lock_timeout=5s` и
`statement_timeout=120s`:

1. fail-closed preflight требует exact lowercase trimmed UUID и отклоняет
   uppercase, surrounding whitespace и любой non-UUID subject;
2. добавляется nullable column;
3. только named revision guard временно отключается на bounded backfill;
4. все существующие locator получают canonical initial subject;
5. guard включается до `NOT NULL`, CHECK и partial unique index;
6. trigger function заменяется версией с immutable locator;
7. создаётся sealed locator RPC;
8. PUBLIC privileges повторно отзываются.

Если preflight или последующий DDL не проходит, вся schema mutation
откатывается. Ручной downgrade после production deploy запрещён; исправление
выпускается только новой forward migration.

## 3. Sealed RPC

```text
identity_email_claim_assert_invite_locator_v1(
  requested_workflow_locator TEXT,
  expected_tenant_id TEXT,
  expected_subject_id TEXT,
  expected_revision INTEGER
) RETURNS JSONB
```

Функция:

- `VOLATILE`;
- `SECURITY DEFINER`;
- `SET search_path=pg_catalog`;
- без dynamic SQL;
- без DML;
- без raw e-mail, HMAC, token, URL или ciphertext в receipt.

Exact receipt:

```json
{
  "schemaVersion": 1,
  "operation": "ASSERT_INVITE_LOCATOR",
  "decision": "MATCHED",
  "claimType": "INVITE",
  "tenantId": "<uuid>",
  "subjectId": "<uuid>",
  "workflowLocator": "<uuid>",
  "revision": 1
}
```

Любое неожиданное или дополнительное поле отклоняется application boundary.
Ошибки преобразуются в уже существующие redacted identity reason codes.

## 4. Порядок блокировок

Обязательный порядок:

```text
bounded locator lookup without row lock
  → canonical e-mail advisory lock
  → exact claim SELECT ... FOR UPDATE
  → tenant/type/subject/revision recheck
```

Первый lookup уже ограничен exact tenant, `INVITE`, subject и revision. Он
нужен только для получения внутреннего canonical lock key и ничего не
возвращает caller.

Порядок `claim row lock → e-mail advisory lock` запрещён: он инвертировал бы
порядок `CURRENT_169` writers и создавал риск deadlock.

## 5. Runtime ACL

`CURRENT_170` application allowlist содержит ровно семь функций:

- две guest-game функции;
- четыре существующие identity reserve/assert/transition/release функции;
- `identity_email_claim_assert_invite_locator_v1`.

Для non-owner runtime:

- exact `EXECUTE` выдаётся без grant option;
- PUBLIC EXECUTE отсутствует;
- direct lock и legacy v1 writers недоступны;
- `IdentityEmailClaim` сохраняет zero effective
  `SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER`.

Inventory reader не получает `workflowLocator` column SELECT и не исполняет
locator RPC.

## 6. Application integration

`IdentityEmailClaimService.assertInviteLocator`:

- принимает только branded interactive transaction;
- проверяет UUID и положительную revision до SQL;
- вызывает только parameterized sealed RPC;
- принимает только exact PII-free receipt;
- использует общий fail-closed mapping SQLSTATE.

Replay `SharedTenantProvisioningService` теперь подтверждает reservation по
persisted `ownerIdentity.reservationId`, а не передаёт raw owner e-mail в
identity assert RPC. Provisioning route остаётся `503`, поэтому это не открывает
внешний tenant creation path.

## 7. Локальные доказательства кандидата

На disposable PostgreSQL `16.13` выполнено:

- populated upgrade `169 → 170`;
- exact migration state `170/170`;
- backfill `workflowLocator = initial subjectId`;
- exact PII-free locator receipt;
- PUBLIC EXECUTE `false`;
- runtime enrollment: `7` application functions, `0` sealed-table privileges;
- existing identity boundary regression, включая `100 = 1 CREATED +
  99 ALREADY_RESERVED`;
- shell PostgreSQL integration `2/2`;
- любой legacy subject не в exact lowercase trimmed UUID, включая
  uppercase/whitespace/non-UUID: migration fail-closed, locator
  column/function не остаются после полного rollback;
- clean database smoke на `CURRENT_170`.

Эти результаты являются engineering evidence, а не production admission.
Exact committed SHA, CI, independent review и новый release-bound inventory
обязательны отдельно.

## 8. Что намеренно не реализовано

Migration 170:

- не создаёт `UserInvite`;
- не создаёт token/hash;
- не создаёт `IdentityMailOutbox`;
- не запускает trial;
- не меняет tenant lifecycle;
- не отправляет SMTP;
- не включает admin route;
- не создаёт учётную запись тестера;
- не изменяет production.

Следующий sealed primitive должен выпускать initial `NETWORK OWNER` invite по
locator внутри PostgreSQL, копировать canonical e-mail непосредственно в
`UserInvite`, атомарно переводить claim и возвращать только PII-free receipt.
После него нужны encrypted leased outbox, отдельный
`IDENTITY_MAIL_ENCRYPTION_KEY`, persisted GO, activation CAS и полный
provision/activate/accept/reissue/revoke concurrency matrix.
