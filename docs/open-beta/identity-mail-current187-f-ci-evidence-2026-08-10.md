# CURRENT187-F — exact-SHA CI evidence

## Решение

`ENGINEERING ACCEPTED / DENY-ONLY / PRE-GREEN / NOT DEPLOYABLE`.

CURRENT187-F принят как стабильная signed policy binding foundation. Это
evidence не разрешает production deployment, создание tenant/user, отправку
invite или внешний тестовый доступ. Semantic allowlist, production root/GO и
runtime network/host attestation остаются обязательными блокерами.

## Зафиксированный источник

- Branch: `codex/open-beta-hardening`.
- Commit: `b64abfe5c5d86a00ed657a96790a4395a11db21d`.
- Commit message: `feat: bind current187 signed cluster policy`.
- Pull request: `#1`, draft, `codex/open-beta-hardening → main`.
- GitHub Actions run: `31391874407`.
- Run URL: <https://github.com/boozik3412/leetplus/actions/runs/31391874407>.
- Итог: `3/3 SUCCESS`.

## Принятые jobs

| Job                        | Результат | Существенное evidence                                                                   |
| -------------------------- | --------- | --------------------------------------------------------------------------------------- |
| Authority root trust gate  | `SUCCESS` | exact checkout и pinned authority-root transition                                       |
| Application checks         | `SUCCESS` | CURRENT187 A–F, CURRENT180–190 refreeze/rehearsal, API/web tests, lint, typecheck/build |
| PostgreSQL migration smoke | `SUCCESS` | clean migration deploy, CURRENT187 acquisition/ledger, tenant/store isolation matrices  |

Application job загрузил artifact:

- name: `leetplus-release-b64abfe5c5d86a00ed657a96790a4395a11db21d`;
- artifact id: `9064296500`;
- digest:
  `sha256:e623fd73130d8a3fc52e3d350b9ff2f50dd87a2e65321465a21369e2a974d51d`;
- size: `16 274 816` bytes;
- expiry: `09.09.2026`.

## Локальное evidence перед push

- CURRENT187 planner: `16/16`;
- CURRENT187 acquisition/policy binding: `15/15`;
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
