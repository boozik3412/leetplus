# CURRENT188 staged status: exact-SHA CI evidence

Дата фиксации: 13.08.2026.

Статус: `ACCEPTED DORMANT EVIDENCE / NOT DEPLOYED / NO ACCESS GO`.

## Идентичность запуска

- repository: `boozik3412/leetplus`;
- branch: `codex/open-beta-hardening`;
- exact commit: `f5b94c2e3d46b17e44a92c00f4fd941ed7192768`;
- GitHub Actions run: `31668745439`;
- workflow result: `3/3 SUCCESS`;
- authority root trust gate, application checks и PostgreSQL migration smoke —
  `SUCCESS`.

## Принятый dormant status boundary

Новый `POST /integrations/langame/onboarding/status`:

- повторно получает persisted role/capability/`NETWORK` authority через
  `FreshStoreScopeService`;
- принимает только exact `storeId` и требует active Store того же tenant;
- связывает SQL-проекцию одновременно с `tenantId` и `storeId`;
- читает один allowlisted receipt/claim без API key, ciphertext, credential или
  provider call;
- возвращает только `NOT_CONFIGURED`, `PENDING`, `EXPIRED` или согласованный
  `ACTIVATED`;
- локально переводит stale `PENDING` в `EXPIRED`, даже если expirer ещё не
  обработал строку;
- отдельно default-off и безусловно запрещён при `NODE_ENV=production`.

Dormant Web BFF принимает same-origin cookie-only status `POST`, ограничивает
request/response 8 KiB, проверяет exact Nest `201 application/json`, Store
binding и allowlisted private/no-store projection. Кандидат остаётся
неимпортированным всеми активными Route Handler и UI.

## Проверки exact SHA

- CURRENT188 Langame API adapter: `5 suites / 191 tests`, failures `0`;
- tenant execution: `18 suites / 984 tests`, failures `0`;
- background containment: `16 suites / 781 tests`, failures `0`;
- full API: `150 suites / 3028 passed / 2 todo`, failures `0`;
- CURRENT188 Web BFF: `15/15`, failures `0`;
- API/Web lint, typecheck и build — `SUCCESS`;
- PostgreSQL migration smoke, включая Gate 1MT assortment, team-chat,
  communications и users/roles isolation — `SUCCESS`.

## SHA-bound artifact

- artifact ID: `9169072248`;
- name:
  `leetplus-release-f5b94c2e3d46b17e44a92c00f4fd941ed7192768`;
- archive digest:
  `sha256:a42d200b06f1a13627002711e14f0fa7e0c86fc56e578cb2fbf50237cf71a5c2`;
- size: `16,292,823` bytes;
- artifact не просрочен на момент фиксации evidence.

## Граница решения

Evidence принимает только dormant status и связанный Web transport. Оно не
делает CURRENT188 canonical, не выдаёт runtime relation/execute grants, не
разрешает production status, reconcile, initial read-only sync или UI cutover.
Production, текущая сеть из четырёх клубов, внешний tester account и owner
invite не изменялись; `SHARED BETA GO` не выдан.
