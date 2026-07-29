# Identity email claim foundation

| Поле | Значение |
| --- | --- |
| Версия | 1.0 |
| Дата | 29.07.2026 |
| Schema target | `CURRENT_167` |
| Migration | `20260729190000_identity_email_claim_foundation` |
| Статус | `IMPLEMENTED_CANDIDATE`; exact-head CI для migration 167 ещё не принят |
| Release decision | `NO-GO` для реального Tenant B, OWNER invite и production deploy |

## Назначение

`IdentityEmailClaim` — глобальная резервация канонического e-mail для
identity-workflow. Она устраняет гонку, при которой два параллельных
provisioning-запроса могли независимо проверить `User`/`UserInvite`, а затем
назначить один и тот же адрес владельцам разных сетей.

Это фундамент, а не готовый onboarding:

- таблица не создаёт `User`, `UserInvite`, пароль, token или URL;
- trial не начинается;
- письмо не формируется и не отправляется;
- Tenant B и Store B1 не создаются;
- существующие `User` и `UserInvite` не backfill-ятся автоматически;
- публичный shared-beta provisioning endpoint остаётся fail-closed.

## Реализованный контракт

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

Private `SECURITY INVOKER` функция
`identity_email_claim_lock_v1(text)`:

1. канонизирует адрес;
2. валидирует pilot ASCII contract;
3. берёт transaction advisory lock в namespace
   `identity-email:v1:<canonical-email>`;
4. возвращает точный canonical key.

`PUBLIC EXECUTE` и `PUBLIC` table privileges отозваны. Runtime-доступ к
функции или DML этой таблицы не выдаётся migration-скриптом.

Все будущие provision/issue/accept/reissue/revoke/email-change команды обязаны
брать этот lock **до первого чтения** identity state. PK сериализует
конкурентные INSERT, но сам по себе не заменяет lock-before-read и CAS для
accept/revoke/reissue.

## Проверки кандидата

Static contract проверяет:

- транзакционность и bounded timeout;
- отсутствие legacy backfill;
- global primary key, C-collation checks и RESTRICT FK;
- private `SECURITY INVOKER` lock helper без `PUBLIC EXECUTE`;
- initial revision `1`, монотонность и разрешённую transition matrix.

PostgreSQL 16 smoke после clean deploy проверяет:

- canonicalization и отказ для неподдерживаемого адреса;
- отказ non-canonical INSERT и initial revision не `1`;
- две параллельные сессии и ожидание второго tenant на одном advisory lock;
- единственный победивший global claim и SQLSTATE `23505` для конкурента;
- атомарный `INVITE -> USER` под lock;
- SQLSTATE `23514` для skip revision, cross-tenant и backward transition;
- SQLSTATE `23503` для удаления Tenant с активным claim;
- отсутствие `PUBLIC EXECUTE`, `SECURITY DEFINER` и утечек секрета.

## Что остаётся P1 до OWNER invite

1. Реализовать единственный sealed application boundary для reserve,
   transition и release. Он должен брать lock до чтения и использовать CAS.
2. Переписать legacy shared provisioning в shell-only flow:
   `PILOT/SUSPENDED/PROVISIONING`, inactive Store, six-row profile,
   reservation без token/invite/trial.
3. Добавить 100-way PostgreSQL fixtures:
   provision/provision, accept/accept, accept/revoke и accept/reissue.
4. Реализовать encrypted `IdentityMailOutbox` и mail lease worker.
5. Добавить persisted release attestations и `TenantAdmissionDecision`.
6. Только activation создаёт invite hash/outbox и начинает trial.
7. Перевести frontend на fragment intake + POST-body acceptance.
8. Выполнить отдельные production-like upgrade/rollback и two-tenant
   admission rehearsals.

До закрытия этих пунктов migration 167 нельзя считать разрешением на
production deploy или создание учётной записи внешнего тестера.
