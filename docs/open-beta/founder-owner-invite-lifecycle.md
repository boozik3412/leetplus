# Founder pilot: initial owner invite lifecycle

Статус:
`STATUS + REVOKE EXACT-SHA ACCEPTED / REISSUE ENGINEERING IMPLEMENTED / REISSUE CI PENDING / PRODUCTION NO-GO`.

## Назначение

После атомарной активации новый tenant находится в
`ACTIVE/OWNER_INVITED`, но владелец ещё не является `User`. До принятия письма
Platform Admin должен иметь безопасный способ увидеть состояние initial OWNER
invite и отозвать ошибочный или скомпрометированный токен без ручной правки БД.

Доступны два route под существующими `JwtAuthGuard + PlatformAdminGuard`:

- `GET /admin/tenants/:tenantId/initial-owner-invite` — PII-free status;
- `POST /admin/tenants/:tenantId/initial-owner-invite/revoke` — атомарный revoke;
- `POST /admin/tenants/:tenantId/initial-owner-invite/reissue` — новый
  predecessor-bound invite/outbox/token без resend старого секрета.

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

## Reissue command

Reissue разрешён только для текущего `REVOKED` или естественно `EXPIRED`
initial OWNER invite в tenant `ACTIVE/PILOT/OWNER_INVITED`. Body принимает только:

- `confirmation` = `REISSUE OWNER INVITE <tenantId>`;
- канонический UUID `requestId`;
- `expectedInviteId` как CAS на текущую вершину цепочки;
- `expiresAt` от 15 минут до 30 дней;
- `reason` и необязательный `supportTicket` без owner email.

Migration `20260818010000_founder_owner_invite_reissue_v1` добавляет immutable
`FounderOwnerInviteReissueCommand`. В одной tenant-locked транзакции boundary:

1. повторно проверяет активного Platform Admin и tenant stage;
2. находит текущую вершину `original activation → reissue sequence`;
3. отклоняет accepted/active/drifted predecessor;
4. отменяет только pre-provider delivery либо сохраняет provider/terminal evidence;
5. освобождает старый claim, резервирует новый opaque workflow locator;
6. создаёт новый `UserInvite`, `IdentityOwnerInviteIssueCommand`, encrypted
   `IdentityMailOutbox` и новый token hash;
7. допускает `HOLD → PENDING` только при exact reissue authority той же
   транзакции;
8. сохраняет PII-free predecessor→successor receipt и audit.

Старый ciphertext не читается и не возвращается. Поля для blind resend не
принимаются. Replay возвращает тот же persisted successor с `REPLAYED` и не
создаёт второй token.

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

Status/revoke принят на exact SHA
`0bc178bca9b1d0bfa8e0cdd5388d994e2d75ae4b`: PR CI
`32084166159` — `4/4 SUCCESS`, включая PostgreSQL fixture; artifact
`9306361304`, `28 430 261` bytes,
`sha256:391b1b8d5df78165df33aa96b19ab8ba1ce03d69fed690aefd8bf15b900faaaf`.
Дублирующий push run был отменён конкурирующим workflow и не является
отрицательным acceptance.

Для reissue локально приняты API typecheck, scoped lint, controller/service/
identity-boundary `3 suites / 20 tests`, envelope producer boundary `1/50`,
static migration `4/4` и полный API regression `157 suites / 3142 tests`.
Новый реальный PostgreSQL сценарий `REVOKED → REISSUED → REPLAYED`, exact
counts и current status добавлен в тот же fixture; exact-SHA CI ещё обязателен.

## Что ещё не реализовано

- exact-SHA PostgreSQL acceptance нового reissue boundary;
- resend уже созданного токена запрещён: используется только reissue;
- production SMTP canary и подтверждённый `SENT`;
- production-like accept нового reissued invite;
- restored-copy rehearsal, Gate 1MT/2 и production activation.

Production, текущая сеть из четырёх клубов и внешний tester этим этапом не
изменяются.
