# Launch checklist: `SHARED_MULTI_TENANT_BETA_V1`

| Поле        | Значение                                                     |
| ----------- | ------------------------------------------------------------ |
| Версия      | 1.2                                                          |
| Дата        | 28.07.2026                                                   |
| Статус      | `NO-GO`; checklist не выполнен                               |
| Data plane  | Shared web/API/workers/PostgreSQL/Telegram                   |
| Topology    | `Tenant A/A1..A4` + новый `Tenant B/B1`                      |
| Доступ      | Email-bound OWNER invite после Gate 1MT, Gate 2 и final GO   |
| Ориентир    | `31.08–07.09.2026`, условно; failed gate сдвигает окно       |

Этот checklist исполняется вместе с
[профилем доступа](./shared-multi-tenant-beta-profile.md) и
[`OPEN_BETA_BACKLOG.md`](../../OPEN_BETA_BACKLOG.md). Галочка без ссылки на
exact protected evidence не считается выполнением.

Production IDs, email, телефоны, invite URL/token, password, database URL,
API keys, encryption/signing secrets и raw business data запрещено сохранять
в git. В документах используются только aliases `Tenant A/B` и `Store A1..A4/B1`.

## A. Gate 0: source и release

- [ ] Есть один canonical clean candidate SHA.
- [ ] Mandatory CI, typecheck, tests, schema validation и artifact build
      зелёные для exact SHA.
- [ ] API, web, workers и Telegram edge показывают тот же SHA через version
      evidence.
- [ ] Deployment выполняется immutable artifact, а не mutable checkout.
- [ ] Release owner, reviewer и rollback owner назначены.
- [ ] Open P0/P1 launch blockers отсутствуют.

## B. Shared topology и control plane

- [ ] Manifest подтверждает один существующий `Tenant A` и четыре
      `Store A1..A4`.
- [ ] Новый внешний клуб создаётся как отдельный `Tenant B/Store B1`, а не
      добавляется в A.
- [ ] Web, API, workers, PostgreSQL и Telegram действительно shared.
- [ ] Public demo не использует operational/PII/integration data A или B.
- [ ] `Tenant B` создаётся только idempotent Platform Admin workflow, без
      manual SQL.
- [ ] Persisted lifecycle, customer stage, onboarding, trial dates, cohort и
      support owner созданы.
- [ ] Persisted profile содержит ровно шесть current-revision rows: пять
      product modules и supporting `INTEGRATIONS`; у всех initial
      `read/write=ON`, `outbound=OFF`, reason, validity и audit.
- [ ] Generic profile mutation отклоняет любое `outbound=ON`; dedicated
      outbound workflow ещё не является выполненным условием initial access.
- [ ] Generic onboarding mutation допускает только same-state update; все
      cross-state transitions принадлежат dedicated workflows, а provisioning
      создаёт tenant сразу в `OWNER_INVITED`.
- [ ] Generic lifecycle mutation отклоняет любой non-`INTERNAL` tenant;
      dedicated external activation/suspend/offboarding приняты отдельно.
- [ ] Unknown/missing/expired state прекращает действие fail-closed.
- [ ] Tenant suspend действует на login/invite/API/BFF/files/jobs/sync/
      rewards/Telegram без restart.

Evidence:

- [ ] topology manifest;
- [ ] real PostgreSQL provisioning/replay/revoke concurrency report;
- [ ] entitlement/lifecycle contract tests;
- [ ] dedicated activation/suspend и expiry propagation smoke.

## C. OWNER invite и delegation

- [ ] Одна serializable provisioning-транзакция создаёт
      `PILOT/SUSPENDED/OWNER_INVITED/revision 1` tenant, неактивный Store,
      OWNER override, exact six-row профиль, audit/request digest и один
      email-bound opaque `NETWORK OWNER` invite.
- [ ] БД хранит token hash; raw token не попадает в logs/evidence.
- [ ] Первый ответ возвращает one-time URL, а идентичный replay не создаёт
      дублей и не раскрывает URL повторно.
- [ ] Platform Admin revoke разрешён только pristine pre-owner tenant и
      атомарно возвращает его в `SUSPENDED/PROVISIONING`.
- [ ] Защищённые email delivery, resend/reissue/rotation и recovery
      one-time URL проверены до передачи invite владельцу.
- [ ] Dedicated external activation переводит tenant в допустимый active state;
      generic lifecycle endpoint не используется.
- [ ] Accept атомарен; concurrent accept создаёт ровно одного owner.
- [ ] OWNER получает `NETWORK` только внутри `Tenant B`.
- [ ] Platform Admin не является tenant role и не назначается через tenant API.
- [ ] `User.role` не имеет database default; каждый create/invite/transfer
      path назначает роль явно.
- [ ] Generic direct user creation, invite issue/rotation и email change для
      external tenant отклоняются до появления verified email delivery/change
      workflows; raw invite secret не возвращается tenant actor.
- [ ] После включения verified email workflow OWNER может приглашать users,
      создавать custom roles и назначать только B/B1.
- [ ] `STORES` требует persisted непустой allowed set.
- [ ] Actor не выдаёт role/capability/scope выше собственной authority.
- [ ] Обычный ADMIN не назначает OWNER; owner transfer и last-owner protection
      проверены отдельно.
- [ ] Resend/revoke/accept/block/session revoke имеют audit и действуют сразу.
- [ ] Public self-registration остаётся выключенной.

Evidence:

- [ ] real PostgreSQL concurrent provision/replay/revoke/accept matrix;
- [ ] email delivery/reissue/rotation drill без утечки raw token;
- [ ] delegation/escalation negative matrix;
- [ ] stale-token и immediate-revoke tests;
- [ ] owner/network/store browser journeys.

## D. Two-tenant shared-data-plane isolation

Реальная PostgreSQL fixture содержит:

```text
Tenant A: Store A1, Store A2
Tenant B: Store B1
actors: A-network, A-store1, A-store2, B-owner, B-store1
```

Для каждого обязательного модуля проверены:

- [ ] list;
- [ ] detail по UUID;
- [ ] aggregate/dashboard;
- [ ] create/update/delete;
- [ ] filter/query params;
- [ ] export;
- [ ] attachment/file;
- [ ] BFF;
- [ ] browser navigation/direct URL;
- [ ] background job;
- [ ] SSE/notification, если применимо.

Обязательные negative cases:

- [ ] A не читает и не изменяет B;
- [ ] B не читает и не изменяет A;
- [ ] A1 actor не получает A2 resource;
- [ ] B1 actor не повышается до NETWORK;
- [ ] hidden UUID и forbidden `tenantId/storeId/storeIds` fail-closed;
- [ ] stale JWT после scope/capability/lifecycle change fail-closed;
- [ ] empty/unknown scope не повышает доступ;
- [ ] test-only bypass/fixture policy в production path отсутствует.

## E. Module gates

### E1. `GAMIFICATION`

- [ ] Rules, missions/chains, Battle Pass, lootboxes, promo cards, wallet,
      rewards, entitlements, ledger, deliveries и reconciliation защищены
      tenant/store policy.
- [ ] Guest registration/profile/XP и club selection не позволяют выбрать
      ресурс другого tenant.
- [ ] Shared Telegram identity корректно маршрутизируется в B/B1.
- [ ] Telegram update ID дедуплицируется durable.
- [ ] Reward posting идемпотентен; loss/duplicate reconciliation зелёный.
- [ ] External reward write-back остаётся `OFF`.
- [ ] Store-level `SHADOW → CANARY → LIVE` и kill switch проверены отдельно.

### E2. `ASSORTMENT`

- [ ] Products/categories/suppliers/inventory/sales/movements/OOS/matrix/
      recommendations имеют tenant/store scope.
- [ ] Reports/exports/imports/parser/bulk operations не обходят scope.
- [ ] Initial source freshness и data-quality diagnostics видны владельцу.
- [ ] Foreign club/source rows не импортируются в B.
- [ ] Periodic sync и external writes остаются отдельно gated.

### E3. `STAFF`

- [ ] Directory, tasks/templates/recurring и shift workspace защищены.
- [ ] Regulations/checklists/knowledge/training/onboarding/tests/assessment
      защищены для list/detail/files/background.
- [ ] Control/ratings/motivation/discipline защищены и аудируются.
- [ ] Salary работает только как planning; payout отсутствует.
- [ ] Attachments имеют live parent ACL, revoke и tenant/store negative tests.
- [ ] OWNER/network manager/club manager/senior/trainee journeys зелёные.

### E4. `COMMUNICATIONS`

- [ ] Network/store channel membership ограничивает history и posting.
- [ ] Messages/mentions/read receipts/channel events/task-from-chat защищены.
- [ ] SSE reconnect не отдаёт события чужого tenant/store.
- [ ] Notifications и CRM contact tasks соблюдают scope.
- [ ] PII masked by default; reveal/export требуют capabilities и audit.
- [ ] Mass Telegram/MAX/SMS остаются `OFF`.

### E5. `USERS_ROLES`

- [ ] Users/invites/roles/capabilities/scope/audit проходят C/D.
- [ ] Block/revoke/session revoke действуют немедленно.
- [ ] Last-owner и owner-transfer invariants зелёные.

## F. `INTEGRATIONS` supporting control-plane

- [ ] Credentials принадлежат Tenant B и зашифрованы.
- [ ] Secrets не возвращаются API и не попадают в logs/evidence.
- [ ] URL policy проверяет scheme/host/port, DNS/IP и rebinding.
- [ ] Loopback, link-local, metadata и запрещённые private targets отклоняются.
- [ ] Общий timeout, bounded retry, circuit breaker и rate limit включены.
- [ ] Preview перечисляет видимые source clubs без создания Store.
- [ ] OWNER явно выбирает свой source club и связывает только `Store B1`.
- [ ] Domain/API key не импортирует автоматически остальные видимые клубы.
- [ ] Read-only connection diagnostic успешен.
- [ ] Initial sync отдельно одобрен и сверён.
- [ ] Unattended sync, write-back и mass messaging остаются `OFF` до своих GO.

## G. Shared workers и Telegram

- [ ] Каждый job получает explicit tenant/store system identity.
- [ ] All-tenant iteration не использует общий user/service token.
- [ ] Durable lease/fencing не допускает двойного scheduler ownership.
- [ ] Retry/idempotency предотвращают duplicate effects.
- [ ] Hardcoded tenant/store IDs отсутствуют.
- [ ] Tenant suspend прекращает новые jobs и messages.
- [ ] Per-tenant/per-store kill switches проверены.
- [ ] Shared Telegram routing и multi-profile identity имеют A/B negative tests.
- [ ] Queue backlog, retry, dead-letter/reconciliation и alert видны operator.

## H. Operations, support и rollback

- [ ] Readiness проверяет DB, migrations, secrets, dependencies и execution
      policy, а liveness остаётся безопасной.
- [ ] External probes и critical alerts доставлены primary/backup owner.
- [ ] Fresh backup успешно восстановлен в disposable environment.
- [ ] N-1 либо reviewed fix-forward drill выполнен.
- [ ] Tenant suspend, outbound OFF, module writes OFF и jobs stop проверены.
- [ ] Invite/session revoke и integration disable проверены.
- [ ] Feedback содержит tenant/user/role/route/SHA/request ID без auto-PII.
- [ ] Trial expiry, offboarding, export/retention/delete procedure назначены.
- [ ] Day-0 и D1/D7 support windows согласованы.

## I. Gate 1MT и Gate 2

- [ ] Все `BETA-MT-001..009` приняты — Gate 1MT закрыт.
- [ ] Gate 2A закрыт, текущий `Tenant A/A1..A4` прошёл cutover.
- [ ] Текущая сеть прошла семь стабильных дней internal alpha.
- [ ] Все обязательные module gates имеют `VERIFIED + ENFORCED`.
- [ ] Нет open launch-blocking P0/P1.
- [ ] Gate 2 закрыт отдельным approval.

Ни Gate 1MT, ни Gate 2 по отдельности не разрешают invite. Требуется финальный
protected record ниже.

## J. `SHARED BETA GO`

Protected record содержит:

```text
decision: GO | NO-GO
release SHA:
artifact/version evidence:
environment:
topology aliases: Tenant A/A1..A4; Tenant B/B1
profile key/revision:
trial start/end:
enabled read/write entitlements:
enabled outbound entitlements:
integration state:
open accepted risks:
support primary/backup:
incident owner:
rollback owner:
approver:
approved at:
stop conditions:
evidence index:
```

- [ ] Решение — `GO`.
- [ ] Invite создан только после timestamp решения.
- [ ] Raw invite URL/token передан защищённым каналом, не через git.
- [ ] В evidence нет email, пароля, токена, secrets и raw business data.

## K. Day-0

- [ ] OWNER принял invite и установил собственный пароль.
- [ ] Login/logout/session revoke работают.
- [ ] OWNER видит только `Tenant B/Store B1`.
- [ ] OWNER создал одного ограниченного тестового пользователя.
- [ ] Role/scope change применился без новой сессии либо активная сессия
      безопасно отозвана согласно contract.
- [ ] Integration preview показал ожидаемый source club.
- [ ] Initial mapping создал/связал только B1.
- [ ] Выполнено одно безопасное in-app действие в каждом из пяти product
      modules и один approved control-plane action в `INTEGRATIONS`.
- [ ] Outbound/jobs остаются в approved state.
- [ ] Feedback принят и привязан к exact SHA.
- [ ] Kill switch и support channel подтверждены.

## L. First-club cycle

- [ ] D1 review: access, data, sync, incidents и feedback.
- [ ] D7 review: повторяемость workflow, freshness, support load и capacity.
- [ ] Нет cross-tenant/store/PII, reward-integrity или routing incident.
- [ ] Все findings имеют severity, owner и decision.
- [ ] Перед вторым внешним tenant принято отдельное capacity/incident решение.

## M. Stop/offboarding

При stop condition:

1. outbound `OFF`;
2. module writes `OFF`;
3. jobs stop;
4. sessions/invites revoke;
5. integration credentials disabled/rotated;
6. `Tenant B SUSPENDED`;
7. evidence preserved, incident opened;
8. destructive rollback запрещён без отдельного data decision.

- [ ] Emergency path rehearsed.
- [ ] Partner communication owner назначен.
- [ ] Export/retention/delete decision сохранён.
- [ ] Возврат возможен только с новым entitlement revision и новым GO.
