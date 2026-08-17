# Founder pilot: initial owner invite lifecycle

Статус:
`STATUS + REVOKE ENGINEERING IMPLEMENTED / EXACT-SHA CI PENDING / PRODUCTION NO-GO`.

## Назначение

После атомарной активации новый tenant находится в
`ACTIVE/OWNER_INVITED`, но владелец ещё не является `User`. До принятия письма
Platform Admin должен иметь безопасный способ увидеть состояние initial OWNER
invite и отозвать ошибочный или скомпрометированный токен без ручной правки БД.

Доступны два route под существующими `JwtAuthGuard + PlatformAdminGuard`:

- `GET /admin/tenants/:tenantId/initial-owner-invite` — PII-free status;
- `POST /admin/tenants/:tenantId/initial-owner-invite/revoke` — атомарный revoke.

Оба route повторно проверяют активный `isPlatformAdmin` в БД после общего
tenant advisory lock. Значение из JWT само по себе не является достаточной
authority.

## Revoke command

Body допускает только:

- `confirmation` = `REVOKE OWNER INVITE <tenantId>`;
- уникальный `requestId`;
- операционные `reason` и необязательный `supportTicket`;
- `expectedInviteId` для compare-and-swap защиты.

Email владельца не принимается route и не возвращается в receipt. Если mailbox
скопирован в `requestId`, `reason` или `supportTicket`, команда отклоняется до
первой мутации.

В одной транзакции выполняются:

1. tenant lock и свежая проверка Platform Admin;
2. exact replay lookup по `tenant/action/requestId`;
3. проверка `ACTIVE/PILOT/OWNER_INVITED` и неизменившегося OWNER/NETWORK invite;
4. CAS revoke invite;
5. для `PENDING/RETRY/CLAIMED` без provider attempt — переход outbox в
   `CANCELED`, очистка ciphertext и append delivery event;
6. после provider attempt или для `SENT/DEAD` — сохранение delivery evidence
   без blind resend;
7. освобождение `IdentityEmailClaim`;
8. PII-free immutable audit receipt.

Повтор exact-команды возвращает `REPLAYED` и не повторяет мутации. Изменённый
payload с тем же `requestId` отклоняется.

## Acceptance

Локально приняты:

- API typecheck;
- scoped lint без warnings;
- controller/service unit: `2 suites / 14 tests PASS`;
- fail-closed cases: stale Platform Admin, tenant/invite drift, unsafe delivery
  state, payload smuggling и PII в audit metadata.

PostgreSQL acceptance встроен в существующий founder activation fixture. После
`ACTIVATED→REPLAYED` он обязан доказать `PENDING→CANCELED`, revoked invite,
нулевой email claim, по одному `CANCELED` event и audit, secret-free response и
идемпотентный replay.

## Что ещё не реализовано

- `reissue` как новый immutable invite/outbox с новым токеном;
- resend уже созданного токена запрещён: используется только reissue;
- production SMTP canary и подтверждённый `SENT`;
- production-like accept нового reissued invite;
- restored-copy rehearsal, Gate 1MT/2 и production activation.

Production, текущая сеть из четырёх клубов и внешний tester этим этапом не
изменяются.
