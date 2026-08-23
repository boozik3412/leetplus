# Gate 1MT: training STORES adoption — 19.08.2026

Статус: `ENGINEERING PASS / NOT DEPLOYED / PRODUCTION NO-GO`.

## Решение

Курсы и профили обучения переведены с обязательного `NETWORK`-доступа на
server-authoritative `NETWORK | STORES` policy. Exact implementation commit
`40a8e82886e8c98c4fc72b67ff6ef809f22e511c` связывает list, detail,
create/update, профиль сотрудника, прогресс, export, справочники и вложения со
fresh persisted store scope.

Пользователь `STORES(B1)` управляет только курсами B1, видит опубликованный
сетевой курс read-only, работает только с сотрудниками B1 и не видит B2.
Пользователь `STORES(B2)` получает симметричный контур. Это приёмка на
disposable restored-copy, а не production deployment. Tenant A/A1–A4,
production, SMTP, Telegram и внешний tester не изменялись.

## Принятая policy

### NETWORK

- сохраняет tenant-wide каталог курсов, профилей, progress и export;
- может создавать сетевые и store-specific курсы;
- управляет tenant-wide users, stores, assessments и knowledge choices;
- attachment reader следует authority родительского курса.

### STORES

- каждое обращение начинает с fresh persisted store scope;
- управляет только курсом с непустым `storeId` из `allowedStoreIds`;
- создаёт курс только для явно разрешённого Store;
- не может создать или изменить сетевой/чужой курс;
- видит опубликованный совместимый сетевой курс read-only;
- получает только разрешённые stores/users/profiles/assessments и knowledge
  choices;
- не может запросить чужой Store, сотрудника или курс через UUID/query filter;
- attachment download разрешается только через ту же parent policy.

## Автоматическая приёмка

```text
API policy/service/manifest unit:    4 suites, 54/54 PASS
Web cookie/BFF boundary:             14/14 PASS
Gate 1MT HTTP/guard inventory:       15 suites, 160/160 PASS
API typecheck:                       PASS
Web typecheck:                       PASS
targeted API ESLint:                 PASS
targeted Web ESLint:                 PASS
API production build:                PASS
Web production build:                205/205 pages PASS
restored-copy PostgreSQL matrix:     11/11 PASS
git diff --check:                    PASS
```

PostgreSQL fixture выполнялась в disposable PostgreSQL 16.14 на клоне clean
CURRENT188 restored-copy template. Матрица включила `NETWORK`, `STORES(B1)`,
`STORES(B2)`, собственный и чужой draft, published network course,
create/update/filter/profile/progress, attachment и adversarial cross-store
user/course access. Для реализации schema migration не потребовалась.

## Production-build browser A/B

Изолированный production-build контур использовал synthetic Tenant B, Store
B1/B2 и двух `CLUB_MANAGER/STORES`. Outbound и schedulers были отключены.

| Проверка                                                | Результат |
| ------------------------------------------------------- | --------- |
| B1 увидел свой draft и опубликованный network course    | `PASS`    |
| Course B2 отсутствовал в B1 catalog                     | `PASS`    |
| B1 selectors содержали только B1                        | `PASS`    |
| Network course открылся read-only                       | `PASS`    |
| Новый курс B1 не предлагал `Вся сеть` или B2            | `PASS`    |
| Собственный draft B1 открылся в editor                  | `PASS`    |
| Profiles B1 содержали только сотрудника B1              | `PASS`    |
| Assessment link для STORES отсутствовал                 | `PASS`    |
| B2 увидел свой draft/profile и network course, но не B1 | `PASS`    |
| B2 PATCH к B1 course вернул hidden `404`                | `PASS`    |
| B2 filter по B1 Store был отклонён `403`                | `PASS`    |
| SQL postcheck сохранил exact title и B1 `storeId`       | `PASS`    |

После проверки browser, Next, Nest и disposable PostgreSQL были остановлены.
Синтетическая test database удалена, ports освобождены. Внешняя временная
directory остановленного disposable PostgreSQL оставлена для отдельной
ручной очистки, потому что среда запретила recursive delete; она не входит в
репозиторий и не содержит production database. Репозиторная `.tmp` не
изменялась.

## Что закрыто и что осталось

Training закрывает третий из пяти ранее network-only staff parents. До shared
external beta остаются две store-aware parent families:

1. onboarding;
2. checklists/checklist templates.

Также остаются archive/delete/orphan browser matrix остальных attachment
parents, tenant-aware jobs, Telegram/public guest, controlled outbound,
Gate 2 текущей сети и production `PREPARE/GO`. Поэтому этот `PASS` не меняет
общий `NO-GO`.
