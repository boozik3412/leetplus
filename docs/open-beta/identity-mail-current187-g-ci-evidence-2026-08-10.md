# CURRENT187-G — exact-SHA CI evidence

## Решение

`ENGINEERING ACCEPTED / DENY-ONLY / NOT AN ALLOWLIST / NOT DEPLOYABLE`.

CURRENT187-G принят как стабильный secret-free semantic risk-facts foundation.
Это evidence не разрешает production deployment, создание tenant/user, отправку
invite или внешний тестовый доступ. Independently approved signed semantic
allowlist, fail-closed facts+allowlist evaluator, production roots/GO и actual
host/network/runtime attestation остаются обязательными блокерами.

## Зафиксированный источник

- Branch: `codex/open-beta-hardening`.
- Commit: `3804792e673583e40231257ec6d027549db86468`.
- Commit message: `feat: derive current187 semantic risk facts`.
- Pull request: `#1`, draft, `codex/open-beta-hardening → main`.
- GitHub Actions run: `31397844858`.
- Run URL: <https://github.com/boozik3412/leetplus/actions/runs/31397844858>.
- Итог: `3/3 SUCCESS`.

## Принятые jobs

| Job                        | Результат | Существенное evidence                                                                                     |
| -------------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| Authority root trust gate  | `SUCCESS` | exact checkout и pinned authority-root transition                                                         |
| Application checks         | `SUCCESS` | CURRENT187 A–G, CURRENT180–190 refreeze/rehearsal, full API tests, API/web lint, typecheck и builds       |
| PostgreSQL migration smoke | `SUCCESS` | clean migration deploy, CURRENT187 acquisition/ledger, staff и tenant/store isolation PostgreSQL matrices |

Application job загрузил artifact:

- name: `leetplus-release-3804792e673583e40231257ec6d027549db86468`;
- artifact id: `9066644300`;
- digest:
  `sha256:83c1b1628ab5fbc9e8e7f8b4e511ff0caeb2b574c993234363b0e5d85fb01846`;
- size: `16 274 263` bytes;
- expiry: `09.09.2026`.

## Локальное evidence перед push

- CURRENT187 application-admission authority: `13/13`;
- CURRENT187 planner: `16/16`;
- CURRENT187 acquisition/policy + semantic facts: `22/22`, из них semantic
  extractor `7/7`;
- independent DDL-fence authority: `11/11`;
- release blocker: `13/13`;
- materialization planner: `18/18`;
- refreeze manifest: `17/17`;
- disposable assembler: `21/21`;
- full disposable rehearsal: `163/163`;
- Prisma schema validation: `PASS`;
- database TypeScript check: `PASS`;
- Prettier и `git diff --check`: `PASS`.

Production, `Tenant A/Store A1..A4`, внешний tester, account, password и invite
не изменялись.
