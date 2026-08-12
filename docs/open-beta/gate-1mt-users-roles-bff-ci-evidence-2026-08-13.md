# Gate 1MT users/roles BFF: exact-SHA CI evidence

Дата фиксации: 13.08.2026.

Статус: `ACCEPTED BOUNDARY EVIDENCE / NOT DEPLOYED / NO ACCESS GO`.

## Идентичность запуска

- repository: `boozik3412/leetplus`;
- branch: `codex/open-beta-hardening`;
- exact commit: `4b0706d62a477044e7155859b2047abd36b6953a`;
- GitHub Actions run: `31644189666`;
- workflow result: `3/3 SUCCESS`;
- authority root trust gate, application checks и PostgreSQL migration smoke —
  `SUCCESS`.

## Принятый BFF boundary

CI step `Test users and roles BFF boundary` зафиксировал семь route-файлов и
ровно девять handlers под `/api/users`:

- server-side cookie является единственным источником bearer authorization;
- client `Authorization` и tenant/store selectors в route source отсутствуют;
- все девять handlers используют общий proxy и не пересылают client query
  string upstream;
- dynamic user/invite/role identifiers проходят `encodeURIComponent`;
- каждый ответ, включая list/detail/mutation, получает точный private/no-store
  security header set;
- active BFF не импортирует dormant CURRENT189 candidate частично.

Итог: `4 tests`, `4 passed`, `0 failed`, `0 skipped`.

## SHA-bound artifact

- artifact ID: `9160316215`;
- name:
  `leetplus-release-4b0706d62a477044e7155859b2047abd36b6953a`;
- archive digest:
  `sha256:2c0d023ae0613e2deac4c3e5e6b2866109065cc22879bd2a832644d1988e387b`;
- artifact не просрочен на момент фиксации evidence.

## Граница решения

Это evidence принимает статический Web BFF boundary. Оно ещё не доказывает
production-like browser A/A1/A2↔B/B1 flow, не активирует CURRENT189, не
развёрнуто в production и не разрешает `SHARED BETA GO` или owner invite.
