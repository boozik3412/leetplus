# CURRENT187-H — exact-SHA CI evidence

## Решение

`ENGINEERING ACCEPTED / DENY-ONLY / NONCANONICAL / NOT DEPLOYABLE`.

CURRENT187-H принят как independently signed semantic-allowlist foundation.
Это evidence подтверждает точное сравнение CURRENT187-G facts с отдельно
подписанным allowlist и обязательную связь результата с CURRENT187-F. Оно не
разрешает production deployment, создание tenant/user, отправку invite или
внешний тестовый доступ.

## Зафиксированный источник

- Branch: `codex/open-beta-hardening`.
- Commit: `e91b641fe305e4fc9cc8224c22d561874df96827`.
- Commit message: `feat: require current187 signed semantic allowlist`.
- Pull request: `#1`, draft, `codex/open-beta-hardening → main`.
- GitHub Actions run: `31403020215`.
- Run URL: <https://github.com/boozik3412/leetplus/actions/runs/31403020215>.
- Итог: `3/3 SUCCESS`.

## Принятые jobs

| Job                        | Результат | Существенное evidence                                                                                         |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| Authority root trust gate  | `SUCCESS` | exact checkout и pinned authority-root transition                                                             |
| Application checks         | `SUCCESS` | CURRENT187 A–H, CURRENT180–190 refreeze/rehearsal, full API tests, API/web lint, typecheck, builds и artifact |
| PostgreSQL migration smoke | `SUCCESS` | clean migration deploy, CURRENT187 acquisition/ledger, staff и tenant/store isolation PostgreSQL matrices     |

Application job загрузил artifact:

- name: `leetplus-release-e91b641fe305e4fc9cc8224c22d561874df96827`;
- artifact id: `9068802677`;
- digest:
  `sha256:94eb8908abaa68075c19ebce90f4b4bb0eac79d1bd026577a4b33f4da14c61b7`;
- size: `16 274 784` bytes;
- expiry: `09.09.2026`.

## Локальное evidence перед push

- CURRENT187 application-admission authority: `13/13`;
- CURRENT187 acquisition/risk-facts/allowlist/policy: `24/24`;
- independent DDL-fence authority: `11/11`;
- release blocker: `13/13`;
- materialization planner: `18/18`;
- refreeze manifest: `17/17`;
- disposable assembler: `21/21`;
- full disposable rehearsal: `163/163`;
- API и Web typecheck: `PASS`;
- Prisma schema validation: `PASS`;
- Prettier и `git diff --check`: `PASS`.

## Сохраняющиеся блокеры

- persisted one-time semantic-approval consumption/revocation/expiry/replay;
- independent latest-byte security review без P0/P1;
- production root enrollment и отдельный deploy GO;
- host-side DDL fence, TLS/HBA/pooler/service-account/runtime attestation;
- infrastructure/provider recovery closure;
- canonical promotion и restored-copy apply/repeat/rollback/zero-diff;
- Gate 1MT, Gate 2 и отдельный `SHARED BETA GO`.

Production, `Tenant A/Store A1..A4`, внешний tester, account, password и invite
не изменялись.
