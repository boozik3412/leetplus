# CURRENT187-J5-R6 exact-SHA CI evidence

Дата фиксации: 12.08.2026.

## Принятый release

- branch: `codex/open-beta-hardening`;
- exact SHA: `24b2f7ea6b77931b24ebc251e6d261cf5d207945`;
- GitHub Actions run: `31614205518`;
- conclusion: `SUCCESS`;
- jobs: `Application checks`, `PostgreSQL migration smoke`,
  `Authority root trust gate` — `3/3 SUCCESS`.

## Release artifact

- artifact ID: `9148849155`;
- name:
  `leetplus-release-24b2f7ea6b77931b24ebc251e6d261cf5d207945`;
- digest:
  `sha256:766d11733a9a797286c1a2df9ddf87c8536f594b394407cb943b532106e39449`;
- expires: `2026-09-11T15:57:28Z`;
- size: `16274602` bytes.

## Принятые проверки

- CURRENT187 aggregate: `124/124 PASS`;
- J5 unit/contract contour: `42/42 PASS`;
- production-origin protocol integration: `2/2 PASS`;
- focused collector/runner unit contour: `47/47 PASS`;
- immutable refreeze: `17/17 PASS`;
- frozen assembler: `21/21 PASS`;
- typecheck, application build, full migration smoke и authority root gate:
  `PASS`.

## Release decision

Принят provenance fence, а не production topology. Dependency-backed receipts
не могут перейти в production runner, но positive strict-brand topology ещё не
выполнена. J4 дополнительно требует mTLS client credential при
`client_tls_sslmode=verify-full`; этот secret-bearing input contract должен быть
реализован и принят отдельно. Внешний доступ остаётся `NO-GO`.
