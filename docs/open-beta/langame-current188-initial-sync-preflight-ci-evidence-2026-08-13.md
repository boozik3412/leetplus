# CURRENT188 initial sync preflight: exact-SHA CI evidence

Дата фиксации: 13.08.2026.

Статус: `ACCEPTED DORMANT EVIDENCE / NOT DEPLOYED / NO ACCESS GO`.

## Идентичность запуска

- repository: `boozik3412/leetplus`;
- branch: `codex/open-beta-hardening`;
- exact commit: `6794214a8051e976bdf3050a787b86660965c364`;
- GitHub Actions run: `31675201041`;
- workflow result: `3/3 SUCCESS`;
- application checks job: `94368154146`;
- authority root trust gate job: `94368154154`;
- PostgreSQL migration smoke job: `94368154145`.

## Принятый dormant preflight boundary

`POST /integrations/langame/onboarding/initial-sync/preflight`:

- default-off и безусловно запрещён при `NODE_ENV=production`;
- требует fresh persisted `NETWORK` authority до и после provider reads;
- связывает exact activation receipt, claim, Store, IntegrationSource,
  IntegrationCredential и `ACTIVATED` audit event;
- принимает отдельный `syncRequestId`, который не может совпадать с activation
  request;
- выполняет только три выбранных bounded Langame `GET`: clubs, products и
  goods для exact external club;
- ограничивает timeout на весь fetch и чтение body, ответ — максимум 1/4 MiB;
- требует единственный active selected club, уникальные положительные provider
  IDs и inventory subset от product set;
- повторно сверяет HMAC-bound binding и credential evidence после сети;
- возвращает только counts и digests; provider payload, credential и PII не
  возвращаются и не сохраняются;
- не создаёт Product, InventorySnapshot или IntegrationSyncJob, не запускает
  legacy sync и не выполняет provider write.

HTTP policy классифицирует preflight как `OUTBOUND` одновременно для
`INTEGRATIONS` и `ASSORTMENT`. В initial beta profile outbound остаётся OFF.
Dormant same-origin cookie-only Web BFF ограничивает request/response 8 KiB и
не импортирован ни одним активным Route Handler или UI.

## Проверки exact SHA

- CURRENT188 Langame API adapter: `6 suites / 219 tests`, failures `0`;
- tenant execution: `18 suites / 989 tests`, failures `0`;
- background containment: `16 suites / 781 tests`, failures `0`;
- full API: `151 suites / 3056 passed / 2 todo`, failures `0`;
- CURRENT188 Web BFF: `19/19`, failures `0`;
- API/Web lint, typecheck и build — `SUCCESS`;
- clean PostgreSQL migration smoke и Gate 1MT assortment/team-chat/
  communications/users-roles matrices — `SUCCESS`.

Web lint сохранил существующие `30` warnings вне CURRENT188; ошибок нет.

## SHA-bound artifact

- artifact ID: `9171442562`;
- name:
  `leetplus-release-6794214a8051e976bdf3050a787b86660965c364`;
- archive digest:
  `sha256:a5ca68342cf369d3089134f335283f04f3f402f7a851f86538e90547c77f7ca3`;
- size: `16,306,283` bytes;
- expires: 12.09.2026.

## Граница решения

Evidence принимает только dormant provider-read preflight и связанный Web
transport. Оно не разрешает production flag, outbound entitlement, persisted
approval, platform import, canonical CURRENT188 promotion, execute grants,
Route/UI cutover, deploy или tester invite. Production и текущая сеть из
четырёх клубов не изменялись; `SHARED BETA GO` не выдан.
