# Gate 1MT users/roles BFF: exact-SHA CI evidence

Дата фиксации: 13.08.2026.

Статус: `ACCEPTED BOUNDARY EVIDENCE / NOT DEPLOYED / NO ACCESS GO`.

## Идентичность запуска

- repository: `boozik3412/leetplus`;
- branch: `codex/open-beta-hardening`;
- exact commit: `b0239b4d498e4dba2b7975e3f6200dc4bfd20b62`;
- GitHub Actions run: `31642875953`;
- workflow result: `3/3 SUCCESS`;
- authority root trust gate, application checks и PostgreSQL migration smoke —
  `SUCCESS`.

## Принятый BFF boundary

CI step `Test users and roles BFF boundary` зафиксировал семь route-файлов и
ровно девять handlers под `/api/users`:

- server-side cookie является единственным источником bearer authorization;
- client `Authorization` и tenant/store selectors в route source отсутствуют;
- dynamic user/invite/role identifiers проходят `encodeURIComponent`;
- invite responses используют `private, no-store`;
- active BFF не импортирует dormant CURRENT189 candidate частично.

Итог: `4 tests`, `4 passed`, `0 failed`, `0 skipped`.

## SHA-bound artifact

- artifact ID: `9159829834`;
- name:
  `leetplus-release-b0239b4d498e4dba2b7975e3f6200dc4bfd20b62`;
- archive digest:
  `sha256:845c784d9554f3226696f268b12595c0423f3c385b6b4cdb2262e7b9a2eb2304`;
- artifact не просрочен на момент фиксации evidence.

## Граница решения

Это evidence принимает статический Web BFF boundary. Оно ещё не доказывает
production-like browser A/A1/A2↔B/B1 flow, не активирует CURRENT189, не
развёрнуто в production и не разрешает `SHARED BETA GO` или owner invite.
