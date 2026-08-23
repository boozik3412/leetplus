# CURRENT187-J5-R5 exact-SHA CI evidence

Дата фиксации: 12.08.2026.

## Принятый release

- branch: `codex/open-beta-hardening`;
- exact SHA: `603e09bf4598fe895053d3b05416f921eb75ddc3`;
- GitHub Actions run: `31612439527`;
- conclusion: `SUCCESS`;
- jobs: `Application checks`, `PostgreSQL migration smoke`,
  `Authority root trust gate` — `3/3 SUCCESS`.

## Release artifact

- artifact ID: `9148162637`;
- name:
  `leetplus-release-603e09bf4598fe895053d3b05416f921eb75ddc3`;
- digest:
  `sha256:d1fe9df4ff02d6ecc900eb6c68b920aaa93b931cf1f8bf21646262c5c4f68a11`;
- expires: `2026-09-11T15:38:39Z`;
- size: `16275584` bytes.

## Принятые проверки

- CURRENT187 aggregate: `124/124 PASS`;
- acquisition/successor: `21/21 PASS`;
- immutable refreeze: `17/17 PASS`;
- frozen assembler: `21/21 PASS`;
- database typecheck, application build, full migration smoke и authority root
  gate: `PASS`.

## Release decision

CI принимает exact successor composition F + R4 и воспроизводимый artifact, но
не меняет deny-only свойства. Production root/runtime, actual four-service
topology, canonical ledger и restored-copy rehearsal не выполнены. Production,
текущая сеть из четырёх клубов и внешний tester не изменялись; внешний доступ
остаётся `NO-GO`.
