# Parallel backup/restored-copy evidence

Статус: **source/CI contract; сам по себе не меняет production и не разрешает
effect**.

Контракт `LEETPLUS_PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_V1` позволяет начать
fresh backup, его off-host copy и disposable restore одновременно с exact-SHA
Full Release Admission. После завершения admission короткий pre-effect bind
повторно связывает те же bytes с live database/topology evidence и установленной
production-control generation. Так backup/rehearsal больше не обязаны начинаться
после всех CI jobs, но ни один прежний результат не может быть молча использован
для другого release или изменившегося production состояния.

Реализация входит в immutable runtime artifact:

- `packages/database/scripts/parallel-backup-restored-copy-evidence.mjs`;
- `packages/database/scripts/parallel-backup-restored-copy-evidence.cli.mjs`;
- negative matrix
  `packages/database/scripts/parallel-backup-restored-copy-evidence.test.mjs`.

## Последовательность

```text
exact L2 main candidate receipt
       |--------------------------------------|
       | Full Release Admission               | fresh backup + off-host copy
       | runtime candidate bytes              | disposable restore/rehearsal
       |--------------------------------------|
                         |
                         v
             PREPARED_NOT_EFFECT_AUTHORIZATION
                         |
                  final admission PASS
                         |
          fresh live DB/topology/control evidence
                         |
                         v
       PRE_EFFECT_EVIDENCE_BOUND_NOT_AUTHORIZATION
                         |
        effectBindingDigest inside separately signed plan
                         |
                 controller recheck under locks
```

Preparation допускается только для deployable `L2_SCHEMA_SECURITY` receipt от
exact `push` в `refs/heads/main`. `L0`, `L1`, manual/schedule/feature runs и
nondeployable candidates отклоняются. Runtime candidate digest должен совпасть
одновременно с restored-copy runtime acceptance и поздним final admission
receipt. Preparation schema `2` дополнительно сохраняет exact
`effectiveLane=L2_SCHEMA_SECURITY` и `impactReceiptSha256` из уже проверенного
candidate receipt; свободная метка оператора не принимается.

## Что связывает preparation receipt

- operation UUID, release commit/tree и SHA-256 candidate receipt;
- runtime candidate archive SHA-256;
- время, SHA-256 и размер database dump и globals, а также backup receipt;
- равные SHA-256 защищённых off-host копий dump/globals и copy receipt;
- source database schema/catalog evidence digest;
- migration rehearsal и current-release runtime acceptance receipt SHA-256;
- production topology contract/evidence receipt SHA-256;
- отдельные пределы возраста backup, preparation/live evidence и TTL binding.

Временной порядок строгий: `capturedAt <= completedAt <= preparedAt`. Receipt
истекает по более ранней границе backup RPO или preparation TTL. Он содержит
решение `PREPARED_NOT_EFFECT_AUTHORIZATION`; наличие этого файла не даёт права
на DDL, cutover либо иной production effect.

## Pre-effect rebind

После появления final admission receipt режим `bind` требует свежий
`LEETPLUS_PARALLEL_BACKUP_RESTORED_COPY_LIVE_EVIDENCE_V1` и повторно проверяет:

- final admission schema `2`/`PASS` выпущен exact main workflow для того же SHA,
  runtime archive bytes, `effectiveLane=L2_SCHEMA_SECURITY` и exact impact
  receipt SHA-256;
- installed production-control generation относится к тому же release и exact
  admission receipt digest;
- live release tree/runtime, source DB evidence, backup/off-host bytes,
  restored-copy receipts и topology receipts не изменились;
- controller, cutover и database-effect pending intent counts равны нулю;
- backup, preparation и live evidence ещё находятся в разрешённом окне.

Результат живёт не более 10 минут (обычно 5) и имеет решение
`PRE_EFFECT_EVIDENCE_BOUND_NOT_AUTHORIZATION`. Любой schema/security controller,
созданный после этого контракта, обязан включить `effectBindingDigest` в свой
offline-signed plan и вызвать
`verifyParallelBackupRestoredCopyEffectBinding` под теми же production-control,
cutover и DB locks непосредственно перед первым effect. Изменение любого input
или истечение TTL требует нового live evidence/bind, но не нового restore, пока
preparation receipt и backup остаются свежими.

## CLI

Все input JSON должны быть canonical two-space JSON с одним LF, regular
single-link files в защищённом operator каталоге. Digests backup, off-host copy,
restored-copy и topology должны поступать только из соответствующих
root-authoritative collectors/receipts; ручной JSON не является evidence.

```bash
node packages/database/scripts/parallel-backup-restored-copy-evidence.cli.mjs \
  --mode prepare \
  --manifest /var/lib/leetplus/release-preparation/<operation>/manifest.json \
  --candidate-receipt /var/lib/leetplus/release-preparation/<operation>/candidate.json \
  --output /var/lib/leetplus/release-preparation/<operation>/prepared.json

node packages/database/scripts/parallel-backup-restored-copy-evidence.cli.mjs \
  --mode bind \
  --preparation /var/lib/leetplus/release-preparation/<operation>/prepared.json \
  --admission-receipt /var/lib/leetplus/release-preparation/<operation>/admission.json \
  --live-evidence /var/lib/leetplus/release-preparation/<operation>/live.json \
  --output /var/lib/leetplus/release-preparation/<operation>/bound.json

node packages/database/scripts/parallel-backup-restored-copy-evidence.cli.mjs \
  --mode verify \
  --preparation /var/lib/leetplus/release-preparation/<operation>/prepared.json \
  --admission-receipt /var/lib/leetplus/release-preparation/<operation>/admission.json \
  --live-evidence /var/lib/leetplus/release-preparation/<operation>/live.json \
  --binding /var/lib/leetplus/release-preparation/<operation>/bound.json
```

Команды не создают backup, не восстанавливают DB, не читают credentials, не
подключаются к production и не выполняют effect. Они только связывают уже
полученные authoritative digests. Production запуск требует отдельного GO.

## Fail-closed matrix

Fast CI и Full Release Admission проверяют positive path и отказы для:

- L1/nondeployable или подменённого candidate receipt;
- отсутствующего, L1 либо изменившегося impact receipt в candidate/final
  admission;
- несовпавших dump/off-host/restored runtime digests;
- просроченного backup/preparation/live evidence;
- другого final runtime archive или admission receipt digest;
- drift source DB, backup sizes, restored-copy либо topology receipt;
- любого pending controller/cutover/database-effect intent;
- изменённого preparation/binding digest и expired effect binding.

Production baseline этим изменением не меняется.
