# Gate 1MT: shift-regulations STORES adoption — 19.08.2026

Статус: `ENGINEERING PASS / NOT DEPLOYED / PRODUCTION NO-GO`.

## Решение

Регламенты смены переведены с обязательного `NETWORK`-доступа на
server-authoritative `NETWORK | STORES` policy. Exact implementation commit
`6ce36a41494e488076c60ac1776b765e24731d5e` ограничивает чтение, создание,
редактирование, подтверждения, оценки и вложения свежим persisted store scope.

Пользователь `STORES(B1)` управляет только регламентами B1, может читать и
подтверждать совместимый опубликованный сетевой регламент, не видит B2 и не
может связать регламент B1 с оценкой B2. Это локальная/restored-copy приёмка,
а не production deployment. Текущий Tenant A/A1–A4, production, SMTP,
Telegram и внешний tester не изменялись.

## Принятая policy

### NETWORK

- сохраняет tenant-wide list/detail/create/update и управление версиями;
- может создавать сетевые и store-specific регламенты;
- видит tenant-wide users, stores, assessments и acknowledgements;
- attachment reader следует authority родительского регламента.

### STORES

- каждое обращение начинает с fresh persisted store scope;
- управляет только регламентом с непустым `storeId` из `allowedStoreIds`;
- создаёт регламент только для явно разрешённого Store;
- не может создать сетевой регламент или выбрать чужой Store;
- видит совместимый опубликованный сетевой регламент read-only;
- не видит чужой store parent и получает hidden `404` при прямом доступе;
- получает только разрешённые stores/users/assessments и scoped
  acknowledgement projection;
- не может подменить `assessmentId` ссылкой на оценку другого Store;
- attachment download разрешается только через ту же parent policy.

## Автоматическая приёмка

```text
API policy/service/attachment unit:  4 suites, 53/53 PASS
Web cookie/BFF boundary:             13/13 PASS
Gate 1MT HTTP/guard inventory:       15 suites, 160/160 PASS
API typecheck:                       PASS
Web typecheck:                       PASS
targeted API ESLint:                 PASS
targeted Web ESLint:                 PASS
API production build:                PASS
Web production build:                205/205 pages PASS
restored-copy PostgreSQL matrix:     10/10 PASS
git diff --check:                    PASS
```

PostgreSQL fixture выполнялась в disposable PostgreSQL 16.14 на клоне clean
CURRENT188 restored-copy template. Матрица включила `NETWORK`, `STORES(B1)`,
`STORES(B2)`, собственный и чужой draft, published network regulation,
create/update/filter/acknowledge, attachment и adversarial cross-store
assessment assignment. Для реализации schema migration не потребовалась.

## Production-build browser A/B

Изолированный production-build контур использовал synthetic `Tenant B`, Store
B1/B2 и двух `CLUB_MANAGER/STORES`. Outbound, schedulers, monitoring и founder
activation были отключены.

| Проверка                                                 | Результат |
| -------------------------------------------------------- | --------- |
| B1 увидел свой draft и опубликованный network regulation | `PASS`    |
| Регламент B2 отсутствовал в B1 catalog                   | `PASS`    |
| B1 selector содержал только `Все доступные` и B1         | `PASS`    |
| Selector не содержал B2 или `Вся сеть`                   | `PASS`    |
| Network regulation открылся read-only                    | `PASS`    |
| Network-only checklist links для STORES отсутствовали    | `PASS`    |
| B1 подтвердил опубликованный network regulation          | `PASS`    |
| B1 изменил собственный draft через UI                    | `PASS`    |
| PostgreSQL сохранил exact B1 `storeId`                   | `PASS`    |
| B2 увидел свой draft и network regulation, но не B1      | `PASS`    |
| B2 PATCH к B1 regulation вернул hidden `404`             | `PASS`    |
| B2 filter по B1 Store был отклонён `403`                 | `PASS`    |
| Положительные B1/B2 journeys: console errors/warnings    | `0/0`     |

Ожидаемые adversarial `403/404` дали только штатные console-сообщения после
завершения положительных journeys. Database postcheck подтвердил: B1 изменён
ровно в своём Store, B2 и network regulation неизменны, создано одно ожидаемое
acknowledgement.

После проверки Chromium, Next, Nest и disposable PostgreSQL были остановлены.
Ports `3108/4108/55444` освобождены, disposable database directory удалена,
нового runtime residue нет. Production и репозиторная `.tmp` не изменялись.

## Что закрыто и что осталось

После knowledge закрыт второй из пяти ранее network-only staff parents:
`shift regulations`. До shared external beta остаются store-aware policies
для трёх parent families:

1. training;
2. onboarding;
3. checklists/checklist templates.

Также остаются archive/delete/orphan browser matrix остальных attachment
parents, tenant-aware jobs, Telegram/public guest, controlled outbound,
Gate 2 текущей сети и production `PREPARE/GO`. Поэтому этот `PASS` не меняет
общий `NO-GO`.
