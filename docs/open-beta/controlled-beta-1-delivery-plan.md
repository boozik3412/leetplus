# Controlled Beta-1: короткий путь к первому внешнему клубу

| Поле              | Значение                                       |
| ----------------- | ---------------------------------------------- |
| Версия            | 1.0                                            |
| Дата              | 20.08.2026                                     |
| Статус            | `NO-GO`, delivery plan active                  |
| Цель              | Один приглашённый владелец `Tenant B/Store B1` |
| Не является целью | Публичная регистрация или массовый запуск      |

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

## Critical path до первого invite

1. Получить exact candidate SHA с зелёным Fast CI.
2. Запустить Full Release Admission для этого SHA и получить SHA-bound artifact.
3. Выполнить backup verification, rollback drill и production canary на этом
   artifact.
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
