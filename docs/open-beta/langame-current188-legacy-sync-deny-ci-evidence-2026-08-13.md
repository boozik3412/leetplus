# CURRENT188 legacy external sync deny: exact-SHA CI evidence

Дата фиксации: 13.08.2026.

Статус: `ACCEPTED FAIL-CLOSED EVIDENCE / NOT DEPLOYED / NO ACCESS GO`.

## Идентичность запуска

- repository: `boozik3412/leetplus`;
- branch: `codex/open-beta-hardening`;
- exact commit: `9d66276a42756c886495bba543f15bdf24541c88`;
- GitHub Actions run: `31645464017`;
- workflow result: `3/3 SUCCESS`;
- authority root trust gate, application checks и PostgreSQL migration smoke —
  `SUCCESS`.

## Принятый fail-closed boundary

Для любого fresh external `PILOT/BETA/LIVE` tenant legacy
`LangameSyncService` возвращает
`EXTERNAL_LEGACY_LANGAME_SYNC_REQUIRES_CURRENT188` до:

- чтения или разрешения Langame credential;
- provider API call;
- создания sync job;
- `Store.upsert`, product/inventory/sales или иной business mutation.

Это закрывает обход staged onboarding, при котором legacy sync мог создать все
provider clubs либо placeholder Store вместо одного явно выбранного и
tenant-bound клуба. `INTERNAL` tenant текущей сети сохраняет прежнее поведение;
AUTO/background external path по-прежнему сначала подчиняется отдельному
background fence.

CI выполнил `langame-sync.service.spec.ts` в трёх независимых наборах:

- tenant execution: `18 suites / 982 tests`, все пройдены;
- background containment: `16 suites / 781 tests`, все пройдены;
- full API: `150 suites / 3017 passed`, `2 todo`, failures `0`.

Focused service contract содержит `12/12` тестов и отдельно проверяет отсутствие
credential/provider/job/Store effects на обоих external manual entry points.

## SHA-bound artifact

- artifact ID: `9160763597`;
- name:
  `leetplus-release-9d66276a42756c886495bba543f15bdf24541c88`;
- archive digest:
  `sha256:c57f1fb3e58d65c6333b58bc14ed1dc02d7680632e5782463a02cff75fcad358`;
- artifact не просрочен на момент фиксации evidence.

## Граница решения

Evidence принимает только блокировку legacy external sync. Оно не делает
CURRENT188 canonical, не выдаёт runtime grants, не реализует reconcile или
initial read-only sync, не развёрнуто в production и не разрешает
`SHARED BETA GO`, создание tester account или owner invite.
