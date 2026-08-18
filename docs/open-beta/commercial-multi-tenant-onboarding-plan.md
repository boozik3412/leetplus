# Commercial multi-tenant onboarding plan

| Поле                               | Значение                                       |
| ---------------------------------- | ---------------------------------------------- |
| Целевая модель                     | multi-tenant SaaS                              |
| Клиентские криптографические ключи | не требуются                                   |
| Platform trust                     | один глобальный внутренний контур LeetPlus     |
| Подключение владельца              | email invite → собственный пароль              |
| Подключение сети                   | отдельный `Tenant`, один или несколько `Store` |
| Текущий внешний доступ             | `NO-GO / NOT DEPLOYED`                         |

## 1. Продуктовое решение

Владелец клуба не участвует в key ceremony. Флешка, bootstrap root и подписи —
внутренняя эксплуатационная граница LeetPlus, невидимая клиенту. Один
платформенный trust anchor применяется ко всему LeetPlus и не соответствует
одному клубу, Store, Tenant или тарифу.

Каждая внешняя сеть получает отдельный `Tenant`. Владелец получает обычную
mailbox-bound ссылку, задаёт пароль и затем внутри своего tenant:

- создаёт и настраивает клубы;
- подключает Langame API credential;
- приглашает сотрудников;
- назначает роли и доступ к Store только в своей сети;
- использует разрешённые модули: геймификация, ассортимент, сотрудники,
  коммуникации, пользователи и роли.

Tenant isolation обеспечивают `tenantId`, Store scope, RBAC/capabilities,
tenant-aware foreign keys, database guards, audit и execution entitlements.
Клиентские ключи для этого не используются.

## 2. Что означает первый пилот

Ограничение «сначала один внешний tenant/store» — операционная canary-политика,
а не техническое свойство ключа. Оно нужно, чтобы проверить onboarding,
изоляцию, импорт, поддержку и rollback на малом blast radius.

После D1/D7-review и отсутствия stop condition следующий tenant подключается
тем же штатным workflow. Новая флешка, platform root или key ceremony не нужны.
CURRENT201 требуется только для внутренней ротации/revoke/recovery глобального
platform trust, а не при добавлении клиентов.

## 3. Целевая последовательность разработки

### Этап A. Упростить platform bootstrap

Статус: `EXACT-SHA CI ACCEPTED / DENY-ONLY / NOT ENROLLED`.

1. CURRENT202 V2 зафиксирован как внутренний bootstrap глобального trust
   anchor.
2. Tenant/store/trial-поля удалены из подписанного payload и receipt.
3. V2 явно закрепляет `platformScope=GLOBAL`,
   `customerKeyCeremonyRequired=false` и
   `additionalTenantKeyCeremonyRequired=false`.
4. `routineTenantOnboardingRequiresRootAccess=false`, поэтому флешка нужна
   только для bootstrap/recovery и не участвует в повседневном onboarding.

### Этап B. Принять production platform boundary

1. Создать глобальный public root и founder approval evidence.
2. Принять reviewed CURRENT198 transition.
3. Выполнить production-origin CURRENT196–199 registration.
4. На изолированной restored copy проверить runtime roles/grants,
   apply/repeat/rollback/zero-diff и отсутствие residue.

### Этап C. Довести tenant factory и owner onboarding

1. Platform operator создаёт suspended tenant shell и начальный Store.
2. Protected workflow выпускает единственный `OWNER + NETWORK` email invite.
3. Получатель сам задаёт пароль; временный общий пароль не используется.
4. После accept владелец может создавать пользователей и назначать только
   разрешённые роли/Store внутри своей сети.
5. Последнего владельца нельзя удалить; owner transfer — отдельный workflow.

### Этап D. Self-service подключение клуба

1. Владелец сохраняет зашифрованный Langame API credential.
2. Диагностика выполняет bounded timeout/retry, SSRF/DNS/IP/TLS проверки.
3. Read-only preview показывает доступные клубы.
4. Владелец явно выбирает Store; другие клубы не импортируются автоматически.
5. Initial sync запускается отдельно и идемпотентно; outbound writes остаются
   выключенными до явного включения.

### Этап E. Модульный beta-профиль

Для первого cohort включаются:

- `GAMIFICATION`;
- `ASSORTMENT` целиком;
- `STAFF` целиком: контроль, мотивация, задачи, регламенты, обучение,
  аттестации и база знаний;
- `COMMUNICATIONS`;
- `USERS_ROLES` в пределах tenant/Store scope;
- `INTEGRATIONS` для self-service подключения.

Entitlements и execution revisions управляют включением модулей, но не создают
отдельные криптографические ключи.

### Этап F. Controlled beta и масштабирование

1. Подключить первый внешний tenant как canary.
2. Провести day-0, D1 и D7 review, проверить support/rollback/kill switches.
3. При отсутствии stop condition подключать friendly cohort по одному tenant
   каждые 3–4 дня тем же owner-invite workflow.
4. После подтверждения capacity автоматизировать tenant factory и перейти к
   invite-only open beta.

## 4. Текущий статус

| Контур                                       | Статус                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-tenant data model, roles, capabilities | реализован; production gates ещё не полностью закрыты                                                                                              |
| CURRENT198–202 trust foundation              | V2 global successor exact-SHA CI accepted, deny-only; production root не enrolled                                                                  |
| Owner invite/activation database boundary    | engineering accepted; route закрыт `503`, не deployed                                                                                              |
| SMTP/mail worker foundation                  | engineering accepted; production enrollment/config отсутствуют                                                                                     |
| Langame runtime/import foundation            | глубокая deny-only/runtime foundation готова; self-service production flow не включён                                                              |
| Gate 1MT tenant/store isolation              | PostgreSQL A/B `35/35 PASS`; report/SSE/OWNER attachment, knowledge и shift STORES browser приняты; три staff parents и background остаток открыты |
| Restored-copy rehearsal                      | production backup migration/repeat/data-zero-diff/TLS-role, downloaded artifact и mail/SENT/accept `PASS`                                          |
| Первый внешний tester                        | учётная запись и Tenant B не создавались                                                                                                           |
| Текущая сеть из четырёх клубов               | без изменений, один существующий tenant                                                                                                            |
| Release decision                             | `NO-GO` до production roles/SMTP canary, Gate 1MT, Gate 2 и отдельного persisted GO                                                                |

## 5. Критический путь до тестового доступа

1. `DONE`: CURRENT202 V2 global bootstrap принят exact-SHA CI.
2. `DEFERRED`: USB/bootstrap root вынесен в post-beta hardening.
3. `DONE`: production-backup restored-copy migration/repeat/zero-diff rehearsal.
4. `DONE ON RESTORED COPY`: activation role/grants/readiness и TLS/HBA/SCRAM rollback.
5. `DONE`: exact-SHA artifact, artifact-bound admission и restored-copy trusted
   TLS SMTP + enrollment/SENT/accept.
6. Закрыть STORES adoption трёх оставшихся network-only staff parent
   families (training, onboarding, checklists/templates),
   remaining attachment archive/orphan matrix, jobs/Telegram/public
   guest/outbound и Gate 2; PostgreSQL A/B `35/35`, reports/SSE, OWNER
   attachment lifecycle, knowledge и shift-regulations STORES adoption уже
   приняты.
7. В `PREPARE` создать production roles/secrets, принять controlled SMTP
   canary, затем включить protected tenant factory, owner route и mail worker.
8. Выпустить отдельный `SHARED BETA GO`, создать Tenant B/Store B1 и отправить
   владельцу обычный email invite.

После первого принятого review повторяются только пункты 6–8. Bootstrap keys и
флешка при подключении каждого следующего клиента не используются.
