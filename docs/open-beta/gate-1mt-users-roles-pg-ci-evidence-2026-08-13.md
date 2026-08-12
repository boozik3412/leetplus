# Gate 1MT users/roles: exact-SHA PostgreSQL CI evidence

Дата фиксации: 13.08.2026.

Статус: `ACCEPTED ENGINEERING EVIDENCE / NOT DEPLOYED / NO ACCESS GO`.

## Идентичность запуска

- repository: `boozik3412/leetplus`;
- branch: `codex/open-beta-hardening`;
- exact commit: `f26dbb1612e4e86a1d6ee7254b5d4812bdae31a7`;
- GitHub Actions run: `31641457556`;
- workflow result: `3/3 SUCCESS`;
- authority root trust gate, application checks и PostgreSQL migration smoke —
  `SUCCESS`.

## Целевое PostgreSQL доказательство

Шаг `Verify Gate 1MT users and roles tenant isolation with PostgreSQL` запустил
реальный PostgreSQL fixture на exact canonical `CURRENT179` и завершился без
skip:

1. exact migration baseline принят;
2. `NETWORK` и `STORES` inventories разделены для `Tenant A/A1/A2` и
   `Tenant B/B1`;
3. user, custom-role и system-role mutations не пересекают tenant boundary;
4. stale role и effective-capability authority отклоняются до users/roles
   query или mutation.

Итог: `1 suite / 4 tests`, `4 passed`, `0 failed`, `0 skipped`. Fixture
teardown завершился успешно; production database и текущая сеть не
использовались.

## SHA-bound artifact

- artifact ID: `9159307294`;
- name:
  `leetplus-release-f26dbb1612e4e86a1d6ee7254b5d4812bdae31a7`;
- archive digest:
  `sha256:1c79f2a3a805600a4dbcf61e5b09b94cde97c0c8f7c7c5766c6bc5f53cef5408`;
- artifact не просрочен на момент фиксации evidence.

## Граница решения

Evidence принимает fresh users/roles authority и A/A1/A2↔B/B1 PostgreSQL
isolation slice. Оно не включает browser acceptance, CURRENT189 employee
invite cutover, production deployment, `Gate 2`, создание `Tenant B/Store B1`
или отправку owner invite внешнему тестеру.
