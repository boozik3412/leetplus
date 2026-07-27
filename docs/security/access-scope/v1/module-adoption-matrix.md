# AccessScope v1: module adoption matrix

| Поле | Значение |
|---|---|
| Статус | Active |
| Версия | 1.0.0 |
| Дата | 27.07.2026 |
| Владелец | LeetPlus engineering |

Статусы:
`INVENTORY → DESIGNED → IMPLEMENTED_CANDIDATE → SHADOW → ENFORCED → VERIFIED`,
а также `OUT_OF_SCOPE`.
`VERIFIED` требует exact tests/evidence SHA и не выставляется только по наличию
guard в controller.

Это module-level summary, а не завершённая route/action matrix. Перед
`VERIFIED` каждая строка раскладывается по точным route/service/job, роли,
capability, entitlement, PII, audit event, owner, test и release SHA.

Детальная инвентаризация строк `STAFF-01..04` и `COMMS-01..02` зафиксирована в
[плане внедрения для персонала и коммуникаций](./staff-communications-adoption-plan.md).
Документ имеет статус `INVENTORY` и сам по себе не изменяет статусы этой матрицы.

| ID | Module / surface | Operations and resource class | Scope rule | Required evidence | Status |
|---|---|---|---|---|---|
| IAM-00 | auth guard / persisted scope | every authenticated request | reload DB; reject NULL, empty STORES, contradictory/cross-tenant rows | unit + PG invariant smoke; deploy/evidence pending | IMPLEMENTED_CANDIDATE |
| IAM-01 | `/users`, accounts service | list/detail/mutation, `USER_STAFF` | target exact/subset; Platform Admin hidden; global role mutation only NETWORK; retain an active system NETWORK OWNER | unit incl. owner invariant; API IDOR + browser + audit pending | IMPLEMENTED_CANDIDATE |
| IAM-02 | invites / accept | create/update/cancel/accept, `USER_STAFF` | email-bound opaque token; rotate on update; exact scope; CAS accept/update/cancel | unit; PG accept/CAS + 100-way concurrency pending | IMPLEMENTED_CANDIDATE |
| IAM-03 | custom/system roles | list/mutation, `TENANT_GLOBAL` | read safe projection; mutation NETWORK; effective capabilities cannot exceed actor | unit; audit/browser pending | IMPLEMENTED_CANDIDATE |
| STAFF-01 | staff directory/control | list/detail/aggregate/mutation, `USER_STAFF` | employee/store subset before aggregates | unit + PG + API + browser | INVENTORY |
| STAFF-02 | tasks/shifts/checklists | list/detail/mutation/files/jobs, mixed | every linked store subset; null-store hidden from STORES | unit + PG + files/jobs | INVENTORY |
| STAFF-03 | regulations/knowledge/training | list/detail/mutation/files, mixed | tenant-global writes NETWORK; club assignments subset | unit + PG + files/browser | INVENTORY |
| STAFF-04 | discipline/motivation/payroll | list/detail/aggregate/export, `USER_STAFF` | filter rows before totals; PII/capability still required | unit + PG + export/browser | INVENTORY |
| COMMS-01 | channels/chat/mentions/read receipts | list/detail/mutation/SSE, mixed | channel stores all subset; membership does not expand | unit + API + SSE/browser | INVENTORY |
| COMMS-02 | notifications/contact tasks | list/detail/mutation/jobs, mixed | origin/target store subset; PII separately gated | unit + PG + jobs | INVENTORY |
| GAME-01 | rules/missions/Battle Pass/lootboxes | list/detail/mutation, mixed | global config NETWORK; store rollout subset | regression + PG + browser | INVENTORY |
| GAME-02 | rewards/wallet/ledger/deliveries | detail/aggregate/mutation/jobs | guest/store ownership; ledger idempotency unchanged | regression + PG + canary | INVENTORY |
| GAME-03 | B2C/Telegram | public guest flows/jobs | explicit selected club; no B2B scope bypass | guest regression + Telegram canary | INVENTORY |
| ASSORT-01 | products/categories/suppliers | list/detail/mutation, mixed | tenant catalog projection documented; store facts subset | unit + PG + browser | INVENTORY |
| ASSORT-02 | sales/stocks/OOS/reports | list/detail/aggregate/export | source rows filtered before totals/export | unit + PG + API/export | INVENTORY |
| ASSORT-03 | imports/parser/bulk operations | mutation/files/jobs | all target stores subset; server job context | unit + PG + jobs | INVENTORY |
| SUPPORT-01 | dashboard/stores | list/aggregate | only effective stores; totals reconciled | unit + PG + browser | INVENTORY |
| SUPPORT-02 | settings/sync/diagnostics | mutation/jobs, mixed | network config NETWORK; club operations subset | unit + PG + job/audit | INVENTORY |
| SUPPORT-03 | BFF/API route handlers | proxy/cache/error | must preserve 401/403/404; no client widening | BFF tests + browser | INVENTORY |
| EXPOSE-01 | marketing campaigns / mass messaging | navigation/API/jobs | hidden and denied for first cohort unless separately approved | entitlement + route/browser deny | OUT_OF_SCOPE |
| EXPOSE-02 | full guest CRM analytics | navigation/API/export | hidden and denied except CRM contact tasks in communications | entitlement + PII/export deny | OUT_OF_SCOPE |
| EXPOSE-03 | billing/subscriptions | navigation/API/webhooks | hidden and denied; no billing is required for pilot | entitlement + route deny | OUT_OF_SCOPE |
| EXPOSE-04 | public self-registration | public auth | disabled; owner/user onboarding is invite-only | API/browser negative test | OUT_OF_SCOPE |

## Обязательная область первого внешнего теста

В `VERIFIED` до первой когорты должны перейти:

- вся геймификация, включая безопасный store-level canary для live write-back;
- весь ассортимент и товары, включая imports/reports/exports;
- весь персонал: контроль, мотивация, задачи, регламенты, базы знаний,
  обучение, дисциплина и плановый расчёт зарплаты;
- in-app коммуникации;
- users и roles только в пределах своей сети или разрешённых клубов;
- supporting dashboard/stores/settings/sync, необходимые этим модулям.

Маркетинговые массовые рассылки, полный CRM analytics, billing и public
self-registration не являются обязательной областью первой когорты.

## Правило заполнения

При реализации строка дополняется точными route/service/job, capability,
PII-флагом, audit event, именами тестов, owner и release SHA. Для временного
исключения обязательны причина, compensating control и срок окончания.

`IMPLEMENTED_CANDIDATE` означает только наличие кода в неприменённом candidate:
это не deployment, не production enforcement и не разрешение внешнего доступа.

## Changelog

- `1.0.0` — создана исходная матрица первого внешнего теста.
