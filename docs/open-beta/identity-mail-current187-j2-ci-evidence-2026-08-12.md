# CURRENT187-J2 exact-SHA CI evidence — 12.08.2026

Статус: `ACCEPTED / EXACT-SHA / 3 OF 3 JOBS SUCCESS / DENY-ONLY`.

- Commit: `d386dfa2534a546245169dc30e68b36bc195daa1`.
- Branch: `codex/open-beta-hardening`.
- GitHub Actions run: `31584476362` (`run #123`).
- Workflow conclusion: `success`.
- Jobs: `Application checks`, `Authority root trust gate`,
  `PostgreSQL migration smoke` — `3/3 SUCCESS`.
- J2 protocol step:
  `Verify CURRENT187 PostgreSQL SSLRequest endpoint and TLS peer identity` —
  `SUCCESS`.
- Artifact ID: `9136731759`.
- Artifact name:
  `leetplus-release-d386dfa2534a546245169dc30e68b36bc195daa1`.
- Artifact digest:
  `sha256:722f77c2e974db9f203fb34d01fc3029a5afc7a7a26bb497ba74ac9fbe9bf495`.

J2 acceptance подтверждает воспроизводимость кода и protocol-accurate
SSLRequest/TLS integration на exact commit. Она не является production endpoint
attestation, не добавляет production signer/root, не доказывает effective HBA
или PgBouncer pool mode и не разрешает создание tenant/user/invite.

Production, `Tenant A/A1..A4`, внешний tenant, tester account и providers не
изменялись. Внешний тестовый доступ остаётся `NO-GO`.
