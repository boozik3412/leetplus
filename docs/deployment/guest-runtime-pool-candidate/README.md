# Кандидат разделённых API-контуров

Дата актуализации: 28.08.2026.

Статус: **DORMANT / NOT INSTALLED**. Эти файлы не входят в текущую
production-control install map и сами по себе ничего на сервере не меняют.

## Цель

Игровой вход должен выдерживать собственную нагрузку и отказы независимо от
корпоративной авторизации. Кандидат запускает один admitted artifact тремя
процессами на том же VDS: Web, corporate API и guest API. Дополнительный сервер
не нужен.

| Граница         | Corporate runtime                                                  | Guest runtime                                                         |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Entrypoint      | `dist/corporate-main.js`                                           | `dist/guest-main.js`                                                  |
| Runtime role    | `CORPORATE`                                                        | `GUEST`                                                               |
| HTTP            | всё B2B, без `/guest-portal*` и public guest media                 | только `/guest-portal*`, public guest media и loopback health/version |
| Controllers     | auth, stores, dashboard, staff, settings и game administration B2B | guest portal и public guest media                                     |
| JWT secrets     | corporate JWT; guest JWT запрещён                                  | guest JWT; corporate JWT запрещён                                     |
| Background jobs | B2B/game jobs только по отдельным rollout-флагам                   | не регистрируются; injected bonus signal всегда no-op                 |
| PostgreSQL      | отдельная роль и bounded pool                                      | отдельная роль и bounded pool                                         |
| systemd         | отдельный UID и slice                                              | отдельный UID и slice с большим относительным CPU/IO weight           |

`COMBINED` остаётся совместимым текущим entrypoint до отдельного production GO.
Dedicated entrypoints не могут стартовать с отсутствующей или чужой ролью.

## Маршрутизация

- `/guest-portal` и `/guest-portal/*` идут только в `leetplus_guest_api`.
- `/public/guest-game/media` и вложенные пути идут только в
  `leetplus_guest_api`.
- остальные API routes идут только в `leetplus_api` (corporate).
- `/guests/gamification*` остаётся в corporate runtime: это
  tenant-authenticated управление игрой, а не публичный вход.
- public health остаётся corporate health. Guest health проверяется напрямую
  через loopback `:4101/:4201` и имеет service identity
  `leetplus-api-guest`.
- fallback из guest upstream в corporate запрещён: он скрывал бы отказ и снова
  связывал бы два security boundary.

Если guest process падает, игровые routes получают ограниченный `502`, но
`/auth/*`, `/stores`, `/dashboard/*` продолжают обслуживаться corporate
process. Обратный отказ также локален.

## PostgreSQL budget без дополнительных затрат

Оба процесса используют тот же PostgreSQL, но не один Prisma pool. В защищённых
env нужны разные логины и разные URL:

```text
corporate: postgresql://leetplus_api_corporate:.../leetplus?schema=public&connection_limit=<approved>&pool_timeout=5&connect_timeout=5&sslmode=verify-full
guest:     postgresql://leetplus_api_guest:.../leetplus?schema=public&connection_limit=<approved>&pool_timeout=5&connect_timeout=5&sslmode=verify-full
```

Сумма лимитов API, workers, migration/admin reserve и PostgreSQL superuser
reserve должна быть меньше `max_connections`. Startup contract требует
`connection_limit=1..32`, `pool_timeout=1..30`, `connect_timeout=1..30` и
`sslmode=verify-full`; конкретные числа внутри этих границ выбираются по
production snapshot и N-1 rehearsal. Guest pool должен иметь собственный
budget, поэтому исчерпание corporate pool не отнимает уже зарезервированные
guest connections.

DB-роли получают только уже принятую application ACL. DDL, migration,
founder-activation и worker-only routines им не выдаются. Создание ролей и
паролей является отдельным production-изменением.

## Файлы кандидата

- `systemd/leetplus-api-corporate@.service` и
  `systemd/leetplus-api-guest@.service` — отдельные процессы/UID/env.
- `systemd/leetplus-corporate.slice` и `systemd/leetplus-guest.slice` —
  относительное CPU/IO распределение без покупки нового хоста. Hard memory cap
  намеренно не задан до rehearsal, чтобы ошибочный лимит не создал outage.
- `systemd/*.env.example` — только схемы защищённых env, без секретов.
- `nginx/split-api-upstreams-*.conf.example` — slot-bound upstreams.
- `nginx/split-api-server-routes.conf.example` — location boundary для server
  `api.leetplus.ru`.

## Что ещё обязательно до production cutover

1. Создать отдельные DB-роли/пароли и подтвердить exact ACL + connection budget
   на restored copy.
2. Добавить новые units, env и nginx bytes в production-control install map,
   digest attestation, preflight, watchdog, recovery receipt и атомарный rollback.
   Текущий blue/green controller аттестует только одну API unit и не может быть
   обойдён ручной установкой этих шаблонов.
3. На одном exact admitted SHA проверить оба loopback `/health/ready` и
   `/version`, отсутствие B2B routes в guest process и отсутствие guest routes
   в corporate process.
4. Выполнить параллельный canary: сотни разных guest sessions, повторный poll
   одного challenge, provider timeout, одновременный `/auth/me` и критические
   B2B reads. Контроль: нет общего guest mutex, pool exhaustion не пересекается,
   provider reservation остаётся идемпотентной.
5. Проверить два отказа по отдельности и полный atomic rollback на текущий
   `COMBINED` N-1.
6. Получить явное production GO. До него units не устанавливать, nginx не
   перезагружать и DB ACL не менять.
