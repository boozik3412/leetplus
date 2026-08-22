# CURRENT191 initial-sync approval: CI evidence

Статус: `EXACT-SHA CI ACCEPTED / DORMANT / NONCANONICAL / NO IMPORT AUTHORITY`.

## Принятый источник

- commit: `56f24216d787fbee57457f655b066d8727a8dcb5`;
- branch: `codex/open-beta-hardening`;
- GitHub Actions run: `31680337637`;
- результат: `3/3 SUCCESS`;
- Authority root trust gate: `94384118554`;
- PostgreSQL migration smoke: `94384118631`;
- Application checks: `94384118679`.

Предыдущий SHA `b557fe8e…` не принят: его первый реальный PostgreSQL запуск
выявил неверную квалификацию SQL keyword `current_user` внутри owner-only ACL
self-check. В принятом SHA используется `CURRENT_USER`, добавлена регрессионная
static-проверка, а весь disposable PostgreSQL smoke прошёл успешно.

## SHA-bound artifact

- artifact ID: `9173492687`;
- name: `leetplus-release-56f24216d787fbee57457f655b066d8727a8dcb5`;
- size: `16,307,564` bytes;
- digest: `sha256:5e8e07de557697224efa77e694814fd9466288df525749fc1fbec08f6779fa3a`;
- expiry: `2026-09-12T08:13:30Z`.

## Что доказано

- PII-free persisted preflight/approval/audit ledger;
- exact replay и changed-replay deny;
- повторная fresh-проверка tenant, GO, NETWORK actor и полного CURRENT188
  Store/source/credential/activation binding;
- cross-tenant deny, GO revocation race и credential drift deny;
- approval не переживает исходный 15-минутный provider read-set:
  `validUntil = preflight.expiresAt`;
- append-only approval/audit, immutable preflight binding и bounded expiry;
- отсутствие Product, InventorySnapshot, IntegrationSyncJob и provider effects;
- отсутствие PUBLIC/application grants;
- полный API/Web build и замороженная CURRENT180–190 цепочка не регрессировали.

## Что не разрешено

Этот SHA не является production/tester `GO`. Ledger остаётся successor-only,
не включён в Prisma migrations, DI, route, UI или scheduler. Он не создаёт
execution claim и не импортирует данные. Следующий отдельный этап — dormant
CURRENT192 claim/atomic import/complete/reconcile, затем runtime role/grants,
production-like rehearsal, canonical promotion и только потом controlled
pilot cutover.
