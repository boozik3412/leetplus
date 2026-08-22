# CURRENT189: dormant route policy приглашений сотрудников

Статус: `ENGINEERING ONLY / NONCANONICAL / PRODUCTION ROUTES BLOCKED`.

Дата фиксации: 05.08.2026.

## Назначение

Этот срез определяет будущую application-границу между тремя HTTP routes
`UsersController` и `EmployeeInviteDeliveryCoordinator`. Он не включает routes
в production, не регистрирует новый provider в `UsersModule` и не меняет
текущие данные, аккаунты или доставку почты.

Зафиксированы ровно три операции:

| HTTP route                  | Handler        | CURRENT189 binding  |
| --------------------------- | -------------- | ------------------- |
| `POST /users/invites`       | `createInvite` | `issue`             |
| `PATCH /users/invites/:id`  | `updateInvite` | immutable `reissue` |
| `DELETE /users/invites/:id` | `cancelInvite` | `revoke`            |

`POST /users` и любые неизвестные handler/method/path не входят в manifest и
всегда отклоняются. PATCH не изменяет прежнее приглашение на месте: route id
обязательно передаётся coordinator как `previousInviteId`. DELETE передаёт тот
же route id только в `revoke`.

## Authority boundary

До coordinator dispatch dormant application policy проверяет:

- literal tenant `OWNER`;
- effective capability `manage_users`;
- JWT scope `NETWORK` без store ids;
- active non-platform subject и корректные tenant/user ids.

После этого сам `EmployeeInviteDeliveryCoordinator` обязательно перечитывает
authority через `FreshStoreScopeService.assertNetwork`. Он сравнивает user,
tenant, slug, scope и пустой список store ids с persisted PostgreSQL state.
Таким образом, stale JWT после revoke/downgrade не доходит до encryption или
CURRENT189 RPC. Route policy не подменяет и не кэширует эту проверку.

## Безопасный ответ

Application layer строит новую whitelist-проекцию и никогда не возвращает
coordinator result целиком. Разрешены только:

- route contract, operation, decision и replay flag;
- invite id, `PENDING | CANCELED` и expiry;
- id заменённого invite только для reissue.

Email, имя, пароль, raw token, token hash, ciphertext, registration URL и
произвольные дополнительные поля не сериализуются. Operation, tenant,
invite/replaced id, status, expiry и replay semantics повторно сверяются с
точной route binding; несогласованный receipt завершается безопасным `503`.

## Почему routes пока закрыты

`EmployeeInviteCurrent189DormantRouteApplication` не имеет Nest decorators,
отсутствует в `UsersModule` и по умолчанию disabled. Даже test-policy нельзя
включить при `NODE_ENV=production`.

AST gate отдельно подтверждает, что production `UsersController` всё ещё
вызывает legacy методы `UsersService.createInvite/updateInvite/cancelInvite`,
не импортирует CURRENT189 application/coordinator и что все три строки остаются
`BLOCKED` в Gate 1MT manifest. Legacy response способен содержать PII и
`registrationUrl`, поэтому частичное переключение запрещено.

Выключенный Nest/Web transport-кандидат и его evidence зафиксированы отдельно в
[employee-invite-current189-http-bff-candidate.md](employee-invite-current189-http-bff-candidate.md).
Пока три candidate route-декоратора пересекаются с legacy controller, API AST
gate требует отсутствия candidate controller во всех Nest modules. Web gate
рекурсивно проверяет все активные `apps/web/src/app/**/route.ts`, а не только
ожидаемые файлы приглашений.

До runtime promotion обязательны:

1. canonical promotion CURRENT189 migrations и checksum freeze;
2. отдельная application role/OID с exact grants и runtime attestation;
3. атомарная замена либо делегирование всех трёх legacy handlers на coordinator
   и exact no-duplicate method/path AST gate;
4. production SMTP worker acceptance, revoke/reissue reconciliation и A/B
   HTTP/BFF/browser rehearsal;
5. отдельный release decision; dormant policy сама по себе не является GO.

## Проверка

```powershell
pnpm --filter api lint:ci:employee-invite-current189-route-policy
pnpm --filter api test:ci:employee-invite-current189-route-policy
pnpm --filter api test:ci:employee-invite-current189-http-candidate
pnpm --filter api lint:ci:employee-invite-current189-http-candidate
pnpm --filter web test:employee-invite-current189-bff-candidate
pnpm --filter api typecheck
pnpm --filter web typecheck
```

Тесты используют только синтетические UUID и `.invalid` identity. Реальные
email, пароли, production endpoints и production database не используются.
