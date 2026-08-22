# CURRENT187-J3/J4 exact-SHA CI evidence — 12.08.2026

- Candidate commit: `ceed72398959a2ae22b0266557143e5e63c1817a`
- Branch: `codex/open-beta-hardening`
- GitHub Actions run: `31586755130` (`#124`)
- Run URL: <https://github.com/boozik3412/leetplus/actions/runs/31586755130>
- Result: `3/3 SUCCESS`
- Application checks: `SUCCESS`
- Authority root trust gate: `SUCCESS`
- PostgreSQL migration smoke: `SUCCESS`
- Actual PostgreSQL session step: `SUCCESS`
- Actual endpoint/TLS peer step: `SUCCESS`
- Actual HBA file catalog/reload-clock step: `SUCCESS`
- Release artifact ID: `9137626567`
- Release artifact name:
  `leetplus-release-ceed72398959a2ae22b0266557143e5e63c1817a`
- Artifact digest:
  `sha256:faf8c3e279c1388c38672a9fbdfd557771aa441d5a3c5d25e4440db48abaa283`

Этот run принимает J3/J4 collector candidate и фактический J3 PostgreSQL
catalog path. Последующий actual PgBouncer candidate принят exact SHA
`b9296430ffb5876e3db79c37215de414dbf05799`, CI `31591848857` —
`3/3 SUCCESS`; см.
[отдельное J4 evidence](./identity-mail-current187-j4-pgbouncer-ci-evidence-2026-08-12.md).

Evidence остаётся deny-only. Оно не содержит production signer/root, effective
matched-HBA proof, connection negative-probe matrix, persisted one-time
consumption/revocation или deployment/test-access authority. Production,
`Tenant A/A1..A4`, внешний tenant/tester, invites и providers не изменялись.
