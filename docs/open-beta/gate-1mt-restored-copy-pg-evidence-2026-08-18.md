# Gate 1MT: restored-copy PostgreSQL evidence — 18.08.2026

## Решение

PostgreSQL-срез Gate 1MT для согласованного beta scope принят на одноразовом
клоне чистой restored copy production backup. Это закрывает database/service
A/B matrix для ассортимента, командного чата, CRM-коммуникаций и
пользователей/ролей, но само по себе не разрешает production deployment или
выдачу внешнего OWNER invite.

Production, исходная restored copy и текущий tenant из четырёх клубов не
изменялись.

## Provenance

- исполнявшийся commit:
  `8881d3a8d74088196747250f66772dcc5abc9d00`;
- release candidate, к которому привязана restored copy:
  `3f325acc2428b1e3c3797075b218efeb454fae91`;
- CI artifact: `9321380247`;
- artifact archive SHA-256:
  `adb75120f35ca54bbd80924f467c78296d425f3c94de86f437998b9046b5b7f4`;
- source template: `leetplus_restored_founder_clean_a1`;
- одноразовый клон: `leetplus_gate1mt_test_8881d3a8`;
- PostgreSQL: isolated loopback `127.0.0.1:55439`, не production port;
- migration state источника: CURRENT185, `185 applied / 4 rolled back /
0 unfinished`.

## Выполненная матрица

| Контур                      | Набор                                                  |      Результат |
| --------------------------- | ------------------------------------------------------ | -------------: |
| Ассортимент и Store scope   | `pilot-assortment-store-scope.pg.integration-spec.ts`  |     `3/3 PASS` |
| Командный чат и fresh scope | `pilot-team-chat-fresh-scope.pg.integration-spec.ts`   |     `3/3 PASS` |
| CRM-коммуникации            | `pilot-crm-communications.pg.integration-spec.ts`      |     `4/4 PASS` |
| Пользователи и роли         | `pilot-users-roles-fresh-scope.pg.integration-spec.ts` |     `4/4 PASS` |
| **Итого**                   | **4 PostgreSQL suites**                                | **14/14 PASS** |

Матрица включает Tenant A/Tenant B, network scope, Store A1/A2 и Store B1,
cross-tenant deny, cross-store deny, stale authority и допустимые операции
внутри собственной сети/клуба.

## Postflight и cleanup

После тестов:

```text
fixture tenants = 0
fixture users = 0
target core rows = 3 tenants / 4 stores / 30 users / 1483 products / 51257 guests
source core rows = 3 tenants / 4 stores / 30 users / 1483 products / 51257 guests
disposable database residue = 0
```

Пароль PostgreSQL не выводился и не сохранялся в Git. Одноразовая БД была
удалена только после проверки отсутствия fixture-данных и совпадения ключевых
контрольных агрегатов с источником.

## Что этот gate не закрывает

До первого внешнего клуба остаются:

1. полный HTTP/BFF/browser A/B срез согласованного beta profile;
2. background jobs, Telegram, files/attachments, SSE и outbound fail-closed
   matrix;
3. Gate 2 текущей сети A1–A4 и стабильное internal-alpha окно;
4. production `PREPARE`: roles, secrets, monitoring, rollback и controlled SMTP
   canary;
5. отдельный persisted GO, создание Tenant B/Store B1 и mailbox-bound OWNER
   invite.
