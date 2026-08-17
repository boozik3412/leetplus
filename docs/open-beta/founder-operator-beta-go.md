# FOUNDER_OPERATOR_BETA_GO_V1

| Поле | Значение |
| --- | --- |
| Дата решения | 17.08.2026 |
| Статус | `V2 + RUNTIME BOUNDARY IMPLEMENTED / PRODUCTION NO-GO` |
| Цель | первый invite-only внешний `Tenant B/Store B1` |
| Offline/USB key | не требуется; CURRENT198–202 отложен |
| Клиентский ключ | не существует и не требуется |
| Текущий production | не изменён |

## Решение

Первый дружественный beta tenant подключается как обычный tenant
мультипользовательской SaaS-платформы. Его безопасность обеспечивают tenant и
store isolation, scoped roles, mailbox-bound invites, серверные secrets,
audit, CI и эксплуатационный rollback. Offline key ceremony не является
механизмом multi-tenancy и исключена из launch critical path.

CURRENT198–202 не удаляется и не обходится поддельными evidence. Контур остаётся
deny-only и может вернуться после D7/D30 beta review как отдельное усиление
узких privileged platform/Langame operations с KMS/HSM или малой USB.

## Реализованная prepare- и activation-граница

Добавлены:

- Prisma model и migration `20260817010000_founder_operator_beta_go`;
- immutable `FOUNDER_OPERATOR_BETA_GO_V1` authority; текущий foundation guard
  разрешает только revoke, а consume DB-denied до v2 atomic activation;
- partial unique fence: не более одного активного GO на tenant;
- `FOUNDER_OPERATOR_BETA_MODE=DISABLED|PREPARE|ACTIVE`, default `DISABLED`;
- Platform Admin route для suspended tenant shell;
- Platform Admin issue/revoke routes для beta GO;
- exact binding к `RELEASE_SHA`, environment, tenant shell, owner reservation,
  entitlement/execution revisions и 30-day trial;
- один и тот же authenticated founder как approval и rollback owner;
- explicit risk acceptance;
- PII-free request/payload/stop-condition digests и audit events;
- фиксированные stop conditions:
  `CROSS_TENANT_ACCESS`, `OWNER_INVITE_DELIVERY_FAILURE`,
  `LANGAME_CREDENTIAL_SCOPE_VIOLATION`, `UNBOUNDED_BACKGROUND_EFFECT`,
  `ROLLBACK_UNAVAILABLE`.
- Prisma model и migration
  `20260817020000_founder_operator_beta_activation_v2`;
- immutable `FounderOperatorBetaActivationCommand` с tenant/GO/issue/invite/
  outbox provenance;
- `SECURITY DEFINER` RPC `founder_operator_beta_tenant_activate_v2` с
  `SERIALIZABLE` transaction, tenant lock, повторной проверкой shell/GO,
  30-day trial, GO consume и единственным связанным `HOLD→PENDING`;
- ACTIVE-only application coordinator с mailbox-bound encrypted token,
  bounded lost-response replay и secret-free response;
- DB guards, запрещающие отдельные activation, GO consume и outbox release
  вне одной activation transaction.
- migration `20260817030000_founder_operator_beta_activation_runtime_v1`,
  отдельный activation Prisma pool и live least-privilege role attestation;
- exact runtime role имеет только один direct/effective security-definer
  entrypoint; `INHERIT`, `PUBLIC EXECUTE`, memberships/settings/ownership,
  table/sequence или create/temp drift блокируют wrapper до эффекта.

Режим `PREPARE` может создать только:

1. `PILOT/SUSPENDED/PROVISIONING` tenant shell;
2. один inactive Store;
3. dormant owner email reservation;
4. полный read/write profile с outbound `OFF`;
5. short-lived persisted GO или его revoke.

Он не активирует tenant, не запускает trial, не создаёт invite/outbox, не
отправляет email, не подключает Langame и не изменяет текущие четыре клуба.

## HTTP boundary

Все routes требуют `JwtAuthGuard + PlatformAdminGuard`.

```text
POST /admin/shared-beta/tenants/provision
POST /admin/shared-beta/tenants/:tenantId/founder-operator-go
POST /admin/shared-beta/tenants/:tenantId/founder-operator-go/revoke
POST /admin/shared-beta/tenants/:tenantId/activate
```

Issue требует точные подтверждения:

```text
AUTHORIZE BETA <tenant-slug>
I ACCEPT SINGLE-FOUNDER BETA OPERATIONAL RISK
```

GO действителен от 15 минут до 24 часов, а trial policy после будущего consume
равна 30 дням. API не возвращает owner email, token, registration URL,
ciphertext или SMTP material.

Активационный route подключён к v2 coordinator, но по умолчанию fail-closed:

```text
503 FOUNDER_OPERATOR_BETA_ACTIVATION_DISABLED
```

Для выполнения нужны одновременно `FOUNDER_OPERATOR_BETA_MODE=ACTIVE` и
отдельно принятый execute-only runtime grant. В текущей migration `PUBLIC` и
обычные application roles не имеют `EXECUTE`, поэтому наличие HTTP route не
является production-доступом.

## Следующий обязательный срез

V2 atomic activation реализован. До внешнего invite остаются:

1. принять exact clean SHA и воспроизводимый CI artifact;
2. создать dedicated role secret и применить exact runtime grant/attestation
   на restored-copy, затем отдельно на production;
3. выполнить restored-copy production-like migration/apply/replay/rollback и
   backup/restore rehearsal;
4. принять реальный SMTP canary и `SENT` barrier, затем
   reissue/revoke/suspend/accept matrix;
5. закрыть Gate 1MT browser/store-scope для согласованных модулей и Gate 2
   текущей сети;
6. выполнить отдельный production deploy decision, сначала `PREPARE`, затем
   one-tenant `ACTIVE` canary.

## Локальное evidence 17.08.2026

- Prisma schema validate и client generation — `PASS`;
- API production typecheck — `PASS`;
- focused config/admin/GO/activation gate — `4 suites / 65 tests PASS`;
- полный identity-mail/onboarding gate с GO/v2/runtime —
  `18 suites / 477 tests PASS`;
- identity-mail/onboarding focused ESLint — `PASS`;
- clean PostgreSQL 16 deploy всех `183` current migrations — `PASS`;
- opt-in real PostgreSQL v2 integration — `1 suite / 1 test PASS`;
- первая activation — `ACTIVATED`, exact replay — `REPLAYED`;
- tenant — `ACTIVE/OWNER_INVITED`, trial — `30 days`, GO revision — `2`;
- invite — `OWNER/NETWORK`, outbox — `PENDING` revision `1`, release event —
  ровно `1`, `User` до accept — `0`;
- response не содержит owner email, token, registration URL или ciphertext;
- activation command update запрещён DB-trigger;
- owner/superuser, `INHERIT` drift и случайный `PUBLIC EXECUTE` не проходят
  runtime wrapper; после exact ACL restore replay снова проходит;
- valid GO + one-way revoke — `stateRevision=3 / revoked=true /
  consumed=false`;
- adversarial active→consumed до v2, immutable-field rewrite и
  revoked→consumed transition — denied;
- partial unique active-tenant fence — присутствует.

Это локальное engineering evidence, а не accepted release artifact. Exact SHA
ещё не зафиксирован CI, production runtime role/secret/grant не созданы,
production-like restored-copy rehearsal и SMTP acceptance не выполнены.
Поэтому статус внешнего доступа остаётся `NO-GO`.

## Что по-прежнему запрещено

- ручное создание tester account;
- общий или временный пароль `123456`;
- добавление внешнего владельца в `Tenant A/A1..A4`;
- public signup;
- raw token/URL/ciphertext в response, logs или audit;
- initial unattended/outbound effects;
- production migration/deploy только на основании этого документа или GO;
- считать `PREPARE` разрешением внешнего доступа.
