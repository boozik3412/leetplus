# CURRENT187-I foundation — CI evidence

Статус: `FOUNDATION EXACT SHA ACCEPTED / CANDIDATE LOCAL PG ONLY / NO-GO`.

## Принятый checkpoint

- Commit: `340e6f05d3ae0051eff9e64581968759248163d5`.
- GitHub Actions run: `31411596083`.
- Результат: `3/3 SUCCESS`.
- Release artifact:
  `leetplus-release-340e6f05d3ae0051eff9e64581968759248163d5`.
- Artifact digest:
  `sha256:95afdce0d00a1cda1a482af082df0fd0478935714fa6efdf48b82270fd931ee3`.

## Что подтверждено

- application checks приняли verification provenance, persisted semantic
  approval contract и обязательный policy F brand;
- PostgreSQL migration smoke сохранил canonical production schema без
  CURRENT187-I candidate apply;
- authority root trust gate остался frozen-empty;
- release/refreeze/assembly/rehearsal digest chain воспроизводим на exact SHA.

## Что этот run не разрешает

Run был выполнен до появления noncanonical PostgreSQL candidate
`20260810190000_identity_mail_semantic_approval_ledger_current187`. Поэтому он
не является CI evidence для candidate SQL или hostile PostgreSQL fixture.
Candidate имеет только локальные два независимых PostgreSQL 16.13 прогона и
остаётся `NONCANONICAL / NOT DEPLOYABLE` до нового exact-head CI и независимой
latest-byte проверки.

Локально проверенный candidate SQL имеет SHA-256
`53ebadcdaf1b26751fd2fde836343791c31121161bf776b7991ee94b4e847ec1`.
Оба hostile run дополнительно отвергли reordered JSON и duplicate-key
substitution с пересчитанным digest; postflight после каждого run — `0/0/0`.

Production, четыре текущих клуба, tester account, invite delivery и external
providers не изменялись. Внешний доступ остаётся `NO-GO`.
