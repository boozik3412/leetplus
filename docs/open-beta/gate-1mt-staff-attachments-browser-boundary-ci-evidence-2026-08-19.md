# Gate 1MT staff attachments browser-boundary CI evidence — 19.08.2026

Статус: `EXACT-SHA CI ACCEPTED / PRODUCTION NO-GO`.

## Цель

Закрепить в CI минимальный admission guard для оставшегося Gate 1MT
staff-attachment browser слоя, пока полноценный production-build
archive/delete/orphan journey остаётся отдельным manual/restored-copy evidence.

Этот guard не является production deployment и не выдаёт внешний доступ. Он
не меняет production, текущий Tenant A/A1–A4, Telegram, SMTP или внешнего
tester.

## Что проверяет guard

Новый Web test
`apps/web/src/lib/gate-1mt-staff-attachments-browser-boundary.test.mts`
фиксирует четыре инварианта:

1. GitHub Actions содержит единый Gate 1MT путь: Web BFF boundary,
   новый staff attachment browser-boundary guard, Web production build и
   PostgreSQL integration `pilot-staff-attachments-scope`.
2. Staff attachment upload/download BFF остаётся selector-free:
   upload возвращает canonical same-origin
   `/api/staff/attachments/<id>`, download использует `forwardQuery: false`,
   dynamic id кодируется через `encodeURIComponent`, а `request.url` не
   участвует в download path.
3. PostgreSQL matrix продолжает покрывать все семь staff attachment parent
   kinds:
   `CHAT_MESSAGE`, `STAFF_TASK`, `CHECKLIST_RUN`, `KNOWLEDGE_ARTICLE`,
   `SHIFT_REGULATION`, `TRAINING_COURSE`, `ONBOARDING_PLAN`.
4. Принятые STORES production-build evidence-файлы остаются связаны из
   README и содержат B1/B2/STORES/404/NO-GO границу до добавления полного
   live archive/orphan matrix.

## Локальная проверка

```text
node --experimental-strip-types --check apps/web/src/lib/gate-1mt-staff-attachments-browser-boundary.test.mts
pnpm --filter web test:gate-1mt-staff-attachments-browser-boundary  # 4/4 PASS
pnpm --filter web test:pilot-bff-boundary                           # 21/21 PASS
git diff --check                                                    # PASS
```

`prettier` в текущем локальном workspace недоступен через `pnpm exec` /
`pnpm --filter web exec`, поэтому форматирование подтверждено
`git diff --check` и существующим style-compatible layout. GitHub Actions
выполнит тот же новый test перед `web build`.

## GitHub Actions acceptance

Exact SHA `3542b197066065f2d7185fe4e9cdd688672fd089` принят GitHub Actions
run
[`32263277942`](https://github.com/boozik3412/leetplus/actions/runs/32263277942)
как `4/4 SUCCESS`:

- `Application checks` — success, включая новый
  `Test Gate 1MT staff attachment browser boundary`, `web lint`,
  `web typecheck`, `web build` и deterministic release artifact;
- `PostgreSQL migration smoke` — success, включая Gate 1MT staff attachment
  PostgreSQL matrix;
- `Authority root trust gate` — success;
- `Release artifact API child process` — success.

## Что это закрывает

Закрыт CI admission blocker вокруг связи:

```text
staff attachment browser/BFF boundary
→ web production build
→ PostgreSQL lifecycle/parent-delete/race matrix
```

То есть регрессия, которая вернёт client-controlled attachment selectors,
выпадение PostgreSQL staff attachment matrix из CI или потерю linked STORES
browser evidence, теперь должна падать до release artifact.

## Что остаётся

Полный production-build browser journey
`archive/delete/orphan-retention` для staff attachments остаётся открытым до
отдельного restored-copy/headed-browser evidence. Локальная машина на момент
этого guard не имела доступного PostgreSQL runtime (`psql`, Docker/service и
listening loopback database отсутствовали), поэтому этот файл не утверждает,
что live browser matrix выполнена.

До внешнего beta доступа также остаются tenant-aware jobs,
Telegram/public guest binding, controlled outbound, Gate 2 текущей сети и
отдельный protected `SHARED BETA GO`.
