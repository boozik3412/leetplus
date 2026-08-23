# Gate 1MT: staff onboarding STORES adoption — 19.08.2026

Статус: `ENGINEERING PASS / NOT DEPLOYED / PRODUCTION NO-GO`.

## Решение

Планы адаптации сотрудников переведены с обязательного `NETWORK`-доступа на
server-authoritative `NETWORK | STORES` policy. Exact implementation commit
`26b9f4425e4fc416fb1e741949be2a30a53576d7` связывает list, detail,
create/update, reference catalogs, Store selectors и attachment download со
fresh persisted store scope.

Пользователь `STORES(B1)` управляет только планами B1, видит активный сетевой
план read-only и получает только совместимые B1/network references.
Пользователь `STORES(B2)` получает симметричный контур. Чужой Store filter
отклоняется `403`, а mutation чужого или сетевого плана скрывается `404`.
Это приёмка на disposable локальном PostgreSQL, а не production deployment.
Tenant A/A1–A4, production, SMTP, Telegram и внешний tester не изменялись.

## Принятая policy

### NETWORK

- сохраняет tenant-wide каталог планов и reference catalogs;
- может создавать сетевые и store-specific планы;
- управляет любым same-tenant планом;
- attachment reader следует authority родительского плана.

### STORES

- каждое обращение начинает с fresh persisted store scope;
- управляет только планом с непустым `storeId` из `allowedStoreIds`;
- создаёт план только для явно разрешённого Store;
- не может создать или изменить сетевой/чужой план;
- видит совместимый активный сетевой план read-only;
- получает только разрешённые stores, активные задачи и checklist templates,
  опубликованные регламенты и активные курсы;
- не может расширить выбор через чужой Store, UUID или reference ID;
- attachment download разрешается только через ту же parent policy.

## Автоматическая приёмка

```text
API policy/service/manifest unit:    4 suites, 55/55 PASS
Web cookie/BFF boundary:             15/15 PASS
Gate 1MT HTTP/guard inventory:       15 suites, 160/160 PASS
API typecheck:                       PASS
Web typecheck:                       PASS
targeted API ESLint:                 PASS
Web ESLint:                          PASS (0 errors; 30 existing warnings)
API production build:               PASS
Web production build:               205/205 pages PASS
local PostgreSQL 16.14 matrix:       12/12 PASS
git diff --check:                    PASS
```

PostgreSQL fixture выполнялась в отдельной test database локального
disposable PostgreSQL 16.14. Матрица включила `NETWORK`, `STORES(B1)`,
`STORES(B2)`, собственный и чужой draft, активный network plan,
create/update/filter/references, attachment и adversarial cross-store access.
Для реализации schema migration не потребовалась.

Exact implementation SHA принят push GitHub Actions run
[`32220369599`](https://github.com/boozik3412/leetplus/actions/runs/32220369599):
`Application checks`, `PostgreSQL migration smoke`, `Authority root trust gate`
и `Release artifact API child process` завершились `4/4 SUCCESS`.

## Production-build browser A/B

Изолированный production-build контур использовал synthetic Tenant B, Store
B1/B2 и двух `CLUB_MANAGER/STORES`. Outbound был отключён.

| Проверка                                                        | Результат |
| --------------------------------------------------------------- | --------- |
| B1 увидел свой draft и активный network plan                    | `PASS`    |
| План B2 отсутствовал в B1 catalog                               | `PASS`    |
| Network plan открылся read-only                                 | `PASS`    |
| Собственный B1 plan открылся в editor                           | `PASS`    |
| Новый план по умолчанию получил B1                              | `PASS`    |
| STORES editor не предложил `Вся сеть` или B2                    | `PASS`    |
| Task/checklist/regulation/course selectors не содержали B2      | `PASS`    |
| B2 увидел свой план и network plan, но не B1                    | `PASS`    |
| B2 PATCH к B1 plan вернул hidden `404`                          | `PASS`    |
| B2 filter по B1 Store был отклонён `403`                        | `PASS`    |
| SQL postcheck сохранил exact B1/B2/network rows и Store binding | `PASS`    |

После проверки browser, Next и Nest были остановлены. Exact test database
удалена, ports освобождены. Внешняя disposable PostgreSQL directory остановлена
и сохранена для отдельной безопасной ручной очистки; она не входит в
репозиторий, а оставшийся локальный baseline до удаления считается защищённым
restored-copy материалом. Соединение с production PostgreSQL не использовалось.
Репозиторная `.tmp` не изменялась.

## Что закрыто и что осталось

Onboarding закрывает четвёртый из пяти ранее network-only staff parents. В
этой bounded parent/file последовательности осталась одна family:

1. checklists/checklist templates.

Также остаются archive/delete/orphan browser matrix остальных attachment
parents, полный tests/assessments/readiness slice, tenant-aware jobs,
Telegram/public guest, controlled outbound, Gate 2 текущей сети и production
`PREPARE/GO`. Поэтому этот `PASS` не меняет общий `NO-GO`.
