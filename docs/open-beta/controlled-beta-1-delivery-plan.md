# Controlled Beta-1: короткий путь к первому внешнему клубу

| Поле              | Значение                                       |
| ----------------- | ---------------------------------------------- |
| Версия            | 1.1                                            |
| Дата              | 20.08.2026                                     |
| Статус            | `NO-GO`, delivery plan active                  |
| Цель              | Один приглашённый владелец `Tenant B/Store B1` |
| Не является целью | Публичная регистрация или массовый запуск      |

## Принятая CI evidence

Workflow split реализован на SHA `965612c5…` и принят GitHub Actions
[`32370680622`](https://github.com/boozik3412/leetplus/actions/runs/32370680622)
как `2/2 SUCCESS`: `Fast authority root trust` и `Fast application checks`.
Непосредственно перед split предыдущий full baseline SHA `1b279c19…` прошёл
GitHub Actions `32369155466` как `4/4 SUCCESS`, включая PostgreSQL migration
smoke и downloaded SHA-bound artifact. Это не делает `965612c5…` production
candidate: перед deploy нового SHA оператор вручную запускает Full Release
Admission и использует artifact только этого же SHA.

## Граница первого запуска

Первый внешний тестер получает email-bound `OWNER/NETWORK` invite для своего
отдельного tenant. После установки собственного пароля он создаёт пользователей,
роли, клубы и Langame configuration только внутри своей сети. Доступны
gamification, assortment, staff, communications, users/roles и integrations.
`Tenant A/A1..A4` не изменяется и не попадает в его scope.

Для первого B2B login запрещены публичная регистрация, второй внешний tenant,
платёжный контур и автоматический Telegram/MAX outbound. Gamification можно
настраивать и проверять в tenant B; Telegram guest ingress/outbound включается
только отдельным canary после проверки stale `PROCESSING`, cross-worker restart
и tenant-aware routing.

## Ускоренный CI без ослабления release gate

| Контур                    | Когда запускается                                        | Что проверяет                                                                                                                     | Что не разрешает                                         |
| ------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Fast CI                   | Каждый push/PR                                           | Authority roots, Prisma schema/client, focused API acceptance, API/Web typecheck и production builds, ключевые Web BFF boundaries | Deploy, artifact, миграции production, tenant activation |
| Full Release Admission    | Ручной `workflow_dispatch` для exact SHA и push в `main` | Полный API suite, exhaustive PostgreSQL migration/rehearsal, SHA-bound artifact, downloaded-artifact child process                | Production GO сам по себе                                |
| Nightly Release Admission | Ежедневно на `main`                                      | Регрессии historical security/migration evidence                                                                                  | Замена admission конкретного release SHA                 |

Каждый production deploy обязан ссылаться на exact SHA с зелёным Fast CI и
отдельно запущенным зелёным Full Release Admission. Если их SHA не совпадает,
деплой запрещён.

Последующая документационная фиксация `299c5a8b…` принята Fast CI
[`32371094962`](https://github.com/boozik3412/leetplus/actions/runs/32371094962)
как `2/2 SUCCESS`. Для этого exact SHA Full Release Admission
[`32371530743`](https://github.com/boozik3412/leetplus/actions/runs/32371530743)
принят как `4/4 SUCCESS`: authority roots, application checks, PostgreSQL
migration smoke и downloaded-artifact API child process. Создан
`leetplus-release-299c5a8b…` artifact `9407707351`, размер `28 563 832` bytes,
GitHub digest
`sha256:f91b0ef6130fdf8148af97efa406a93fb6ce5194b9a10a169543137fde28c774`.
Это допустимый artifact candidate, но не production GO: backup/rehearsal,
runtime enrollment и canary всё ещё обязательны.

## Critical path до первого invite

1. Получить exact candidate SHA с зелёным Fast CI.
2. Запустить Full Release Admission для этого SHA и получить SHA-bound artifact.
3. Выполнить backup verification, rollback drill и production canary на этом
   artifact по [SHA-bound production canary plan](./controlled-beta-1-production-canary-plan.md).
4. Enroll production runtime roles, SMTP worker configuration и health/alert
   checks ровно по reviewed operational runbook.
5. Создать `Tenant B/Store B1` через protected shell/GO/activation workflow и
   отправить OWNER invite.
6. Пройти day-0: owner login, tenant/store scope, один restricted user,
   assortment, staff, communications, users/roles, integration preview и
   kill-switch/suspend smoke.

После шага 6 разрешён только один внешний beta owner. При incident или
нарушении scope tenant переводится в suspended, integrations/outbound
отключаются, invite/session отзываются, после чего выполняется rollback или
fix-forward по runbook.

## Явно отложено

- публичная регистрация и onboarding без оператора;
- второй внешний tenant до D1/D7 review первого;
- Telegram public ingress/outbound до отдельного production canary;
- USB/KMS/HSM ceremony и CURRENT198–202 activation;
- billing, subscriptions и масштабирование cohort;
- запуск полного historical admission на каждом малом изменении.

## Критерий перехода к следующему шагу

`Fast CI` и `Full Release Admission` должны быть зелёными для одного SHA;
production не должен иметь незавершённых миграций, degraded readiness или
непроверенного backup/rollback. Только после этого можно выполнить canary и
protected `FOUNDER_OPERATOR_BETA_GO`.
