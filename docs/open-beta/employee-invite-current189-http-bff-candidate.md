# CURRENT189 dormant employee-invite HTTP/BFF candidate

## Статус

`DORMANT / NONCANONICAL / NOT MODULE-WIRED / LEGACY ROUTES STILL BLOCKED`.

Этот slice связывает уже принятую CURRENT189 application policy с точным
будущим HTTP/BFF transport, но намеренно не регистрирует его в production.

## Nest API candidate

`apps/api/src/users/employee-invite-current189-candidate.controller.ts`
фиксирует ровно три команды владельца сети:

- `POST /users/invites` — issue;
- `PATCH /users/invites/:id` — immutable reissue;
- `DELETE /users/invites/:id` — terminal revoke.

Controller имеет JWT/OWNER/Roles metadata, требует exact JSON, ограничивает
команду 8 KiB, проверяет UUID route/idempotency и обязательное равенство
`Idempotency-Key == body.requestId`. Ответы private/no-store. Dispatch идёт
только в dormant `EmployeeInviteCurrent189DormantRouteApplication`, где
authoritative tenant/role/scope повторно читаются из PostgreSQL.

Controller отсутствует во всех Nest modules. Активный legacy
`UsersController` не заменён, а три строки Gate 1MT остаются `BLOCKED`.

## Web BFF candidate

`apps/web/src/lib/employee-invite-current189-bff-candidate.ts` имеет
литеральный `EMPLOYEE_INVITE_CURRENT189_BFF_CANDIDATE_ACTIVE=false` и не
импортируется активными routes.

Кандидат:

- принимает только exact same-origin browser paths/methods;
- берёт B2B bearer только из server-side HttpOnly cookie;
- не пересылает browser Cookie/Authorization headers;
- читает request/response stream с независимыми лимитами;
- отправляет canonical JSON, `credentials: omit`, `redirect: error`,
  `cache: no-store`;
- принимает только exact CURRENT189 safe receipt и проверяет immutable
  reissue/revoke binding;
- никогда не возвращает email, raw token, registration URL или ciphertext;
- классифицирует malformed browser body как `400/413`, а malformed успешный
  upstream receipt как `502`.

## Проверка

```powershell
pnpm --filter api test:ci:employee-invite-current189-http-candidate
pnpm --filter api lint:ci:employee-invite-current189-http-candidate
pnpm --filter web test:employee-invite-current189-bff-candidate
pnpm --filter api typecheck
pnpm --filter web typecheck
```

Focused evidence: Nest controller `15/15 PASS`, Web candidate `8/8 PASS`,
focused ESLint с zero warnings и оба production typecheck — `PASS`.

## Условия активации

API module registration, Next Route Handler import и UI cutover должны быть
одним reviewed release только после:

1. canonical CURRENT189 migration и разрешённого predecessor chain;
2. execute-only application/worker roles и OID/manifest attestation;
3. separately reviewed executable employee-mail runtime/startup;
4. production-like SMTP acceptance с lost-response/reconcile evidence;
5. candidate атомарно заменяет или делегирует три legacy `UsersController`
   handler; одновременная регистрация обоих controller запрещена exact
   no-duplicate AST gate;
6. production-like apply/rollback/zero-diff;
7. A/B browser/PG matrix, включая revoke/reissue, stale authority и
   cross-tenant/store deny;
8. explicit release `GO`.

До выполнения условий ручное создание пользователя или обход штатного
mailbox-bound invitation flow запрещены.
