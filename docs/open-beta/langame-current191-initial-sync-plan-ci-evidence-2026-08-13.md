# CURRENT191 deterministic initial-sync plan: CI evidence

Статус: `EXACT-SHA CI ACCEPTED / PURE / DORMANT / NO IMPORT AUTHORITY`.

## Принятый источник

- commit: `d433cd6755507be526f86f4397f1bcf691ab5b25`;
- branch: `codex/open-beta-hardening`;
- GitHub Actions run: `31677119183`;
- результат: `3/3 SUCCESS`;
- Application checks job: `94374015581`;
- PostgreSQL migration smoke job: `94374015606`;
- Authority root trust gate job: `94374015717`.

Application checks выполнили focused Langame gate с exact planner source:
`7/7 suites`, `235/235 tests`. Полные API lint/typecheck/build, Web
lint/typecheck/build и clean PostgreSQL migration smoke также завершились
успешно.

## SHA-bound artifact

- artifact ID: `9172212769`;
- name: `leetplus-release-d433cd6755507be526f86f4397f1bcf691ab5b25`;
- size: `16,308,459` bytes;
- digest: `sha256:010b2f9fa9c9fb3678b60cd6583b2a75c12298a428c3fc315afdaa851dee88fa`;
- expiry: `2026-09-12T07:27:02Z`.

## Что доказано

Pure CURRENT191 planner детерминированно связывает exact CURRENT188 preflight,
tenant/Store/source/domain/club, approval/read-set digests и bounded product/
inventory rows. Он отклоняет count drift, duplicate/invalid IDs, inventory вне
product set, accessors/symbols/лишние поля и всегда возвращает:

- `providerWritesStarted=false`;
- `platformWritesStarted=false`;
- `productionImportAllowed=false`.

## Что не разрешено

Этот CI run и artifact не являются production или tester `GO`. Они не
создают persisted approval, не выполняют import, не выдают runtime grants, не
включают route/UI и не меняют текущий tenant из четырёх клубов.
