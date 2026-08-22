# CURRENT187-I — CI evidence

Статус: `CANDIDATE EXACT SHA CI ACCEPTED / NONCANONICAL / NO-GO`.

## Принятый foundation checkpoint

- Commit: `340e6f05d3ae0051eff9e64581968759248163d5`.
- GitHub Actions run: `31411596083`.
- Результат: `3/3 SUCCESS`.
- Release artifact:
  `leetplus-release-340e6f05d3ae0051eff9e64581968759248163d5`.
- Artifact digest:
  `sha256:95afdce0d00a1cda1a482af082df0fd0478935714fa6efdf48b82270fd931ee3`.

## Принятый candidate checkpoint

- Commit: `8e2a25ecbb62124f4c7469da968acbbe863b3592`.
- GitHub Actions run: `31416609580`.
- Результат: `3/3 SUCCESS`.
- Release artifact:
  `leetplus-release-8e2a25ecbb62124f4c7469da968acbbe863b3592`.
- Artifact digest:
  `sha256:9c46d1d66f0c70468e300f163f890874f0dce3e0d9bf1373251fd94311a2fe0f`.
- Новый PostgreSQL step выполнил candidate SQL SHA
  `daf5a98f1b166002ad73c3fa20319977dbaedb8b3da4ef39460834676e182840`
  после полной canonical migration history и прошёл `success`.

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
Candidate имеет два независимых локальных PostgreSQL 16.13 прогона и принятый
exact-head CI, но остаётся `NONCANONICAL / NOT DEPLOYABLE` до независимой
latest-byte проверки, production runtime attestation и canonical promotion.

Локально проверенный candidate SQL имеет SHA-256
`daf5a98f1b166002ad73c3fa20319977dbaedb8b3da4ef39460834676e182840`.
Оба hostile run дополнительно отвергли reordered JSON и duplicate-key
substitution с пересчитанным digest; postflight после каждого run — `0/0/0`.

## Отклонённый candidate checkpoint

- Commit `bab57035b8aee61b34fe9603932cc2ad209d1883`, CI run `31415009389`:
  application и authority-root jobs прошли, PostgreSQL job отклонён новым
  CURRENT187-I step.
- Причина: server-side `inet_server_addr()` видел адрес service-container bridge,
  хотя acceptance URL был exact `127.0.0.1`. Это некорректный способ доказать
  client-side loopback при NAT.
- Исправление сохраняет fail-closed allowlist `127.0.0.1/localhost/::1` в
  acceptance-driver до I/O и exact disposable DB/confirmation fence в SQL, но
  не выводит происхождение клиента из server-side NAT address.
- Отклонённый run не является evidence приёмки candidate; successor exact-head
  CI `31416609580` выше принят только после полного `3/3 SUCCESS`.

Production, четыре текущих клуба, tester account, invite delivery и external
providers не изменялись. Внешний доступ остаётся `NO-GO`.
