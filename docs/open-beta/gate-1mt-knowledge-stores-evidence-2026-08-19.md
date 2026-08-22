# Gate 1MT: knowledge-base STORES adoption — 19.08.2026

Статус: `ENGINEERING PASS / NOT DEPLOYED / PRODUCTION NO-GO`.

## Решение

База знаний больше не является обязательным `NETWORK`-only workspace. Exact
implementation commit `085f8bbdd3115b3ec7a4438e7614c815004dd844`
реализует server-authoritative `NETWORK | STORES` policy для статей,
аудиторских данных и вложений. Пользователь с `STORES(B1)` управляет только
статьями B1, читает совместимые опубликованные сетевые статьи и не видит B2.

Это локальная/restored-copy приёмка, а не production deployment. Текущий
Tenant A/A1–A4, production, реальный SMTP/Telegram и внешний tester не
изменялись.

## Принятая policy

### NETWORK

- сохраняет tenant-wide управление статьями и настройками SLA;
- видит все статьи tenant по существующим capability и role-scope правилам;
- сохраняет полный tenant-wide аудит прочтения и настроек.

### STORES

- каждое обращение начинает с fresh persisted store scope;
- управляет только статьями с непустым `storeId` из `allowedStoreIds`;
- создаёт статью только с явным разрешённым Store;
- не может создать или перенести статью в `Вся сеть` либо чужой Store;
- видит сетевую статью только в состоянии `PUBLISHED` и при совместимом
  `roleScope`, без возможности редактирования;
- не видит draft/archive чужого Store и получает hidden `404` на прямой доступ;
- получает только разрешённый список Store и подходящих audience users;
- не получает cross-store read receipts;
- видит tenant-wide SLA policy только как redacted/read-only projection и не
  может её изменять;
- не получает tenant-wide article suggestions, пока они не получат отдельную
  store-aware policy.

Knowledge attachment reader использует ту же policy, что и parent article.
Поэтому attachment нельзя скачать через отдельный URL, если сама статья
скрыта. Остальные attachment parent kinds не были расширены этим срезом.

## Автоматическая приёмка

```text
API policy/attachment unit:       2 suites, 32/32 PASS
Web cookie/BFF boundary:          12/12 PASS
API typecheck:                    PASS
Web typecheck:                    PASS
targeted API ESLint:              PASS
targeted Web ESLint:              0 errors, 1 pre-existing no-img warning
API production build:             PASS
Web production build:             205/205 pages PASS
restored-copy PostgreSQL matrix:  9/9 PASS
git diff --check:                 PASS
```

PostgreSQL fixture выполнялась в disposable PostgreSQL 16 на клоне clean
CURRENT188 restored-copy template. Для этой реализации schema migration не
требовалась. Матрица включила `NETWORK`, `STORES(B1)`, `STORES(B2)`,
published network article, own/foreign drafts, create/update/filter/settings,
attachment и adversarial cross-store read-receipt сценарии.

## Production-build browser A/B

Изолированный production-build контур использовал отдельный synthetic
`Tenant B`, Store B1/B2, `OWNER/NETWORK` и два `CLUB_MANAGER/STORES`.
Outbound, schedulers, monitoring и founder activation были выключены.

| Проверка                                                                      | Результат |
| ----------------------------------------------------------------------------- | --------- |
| B1 manager увидел только draft B1 и опубликованный network article            | `PASS`    |
| Draft B2 отсутствовал в B1 catalog                                            | `PASS`    |
| Network article открылся read-only без editor                                 | `PASS`    |
| Store selector B1 не содержал `Вся сеть` или B2                               | `PASS`    |
| Tenant-wide SLA editor для STORES отсутствовал                                | `PASS`    |
| B1 manager изменил title собственного draft                                   | `PASS`    |
| PostgreSQL сохранил прежний exact B1 `storeId`                                | `PASS`    |
| Draft B2 и network article остались неизменными                               | `PASS`    |
| B1 загрузил `package.json`, сохранил native binding и скачал 1650 bytes       | `PASS`    |
| Binding: `KNOWLEDGE_ARTICLE`, exact parent и exact B1 Store, state `BOUND`    | `PASS`    |
| B2 manager увидел только draft B2 и опубликованный network article            | `PASS`    |
| Authenticated B2 GET к B1 attachment вернул hidden `404 Attachment not found` | `PASS`    |
| Положительные B1/B2 journeys: console errors/warnings                         | `0/0`     |

Ожидаемый adversarial `404` создал одну штатную browser console запись; она не
является ошибкой положительного journey.

После проверки Chromium, Next, Nest и disposable PostgreSQL были остановлены.
Exact database directory и Playwright artifacts удалены; production и
репозиторная `.tmp` не изменялись.

## Что закрыто и что осталось

Закрыт один из пяти ранее network-only staff parents: `knowledge`. До shared
external beta остаются store-aware policies для четырёх parent families:

1. shift regulations;
2. training;
3. onboarding;
4. checklists/checklist templates.

Successors 19.08.2026: shift regulations и training приняты отдельными
матрицами; актуальный остаток — onboarding и checklists/templates. См.
[shift evidence](./gate-1mt-shift-regulations-stores-evidence-2026-08-19.md) и
[training evidence](./gate-1mt-training-stores-evidence-2026-08-19.md).

Также остаются archive/delete/orphan browser matrix остальных attachment
parents, tenant-aware jobs, Telegram/public guest, controlled outbound,
Gate 2 текущей сети и production `PREPARE/GO`. Поэтому этот `PASS` не меняет
общий `NO-GO`.
