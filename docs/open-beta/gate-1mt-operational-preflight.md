# Gate 1MT operational preflight

Статус: реализован как read-only fail-closed admission. Сам preflight ничего не
деплоит, не меняет production, не открывает браузер и не отправляет SMTP,
Telegram или Langame traffic.

## Что закрывает gate

`packages/database/scripts/gate-1mt-operational-preflight.cli.mjs` принимает
только immutable JSON evidence с заранее зафиксированным SHA-256 и связывает в
одном receipt:

- exact 40-hex release SHA и два независимых успешных CI run;
- read-only production attachment inventory из одной `REPEATABLE READ`
  snapshot;
- credential-free fingerprint целевой БД;
- browser flow ровно для выбранных tenant/store fingerprints;
- archive, delete, orphan и cross-tenant `404` checks;
- свежую observability window и заранее заданные thresholds;
- проверенный backup, scheduler-free N-1 и bounded rollback RTO;
- для production GO review — ровно одну явно одобренную успешную canary
  delivery на каждого требуемого provider без duplicate delivery.

Receipt содержит только SHA, digests, decision и stable reason code. Raw tenant,
Store, recipient, URL, credential и browser data в него не попадают.

## Два режима

`CONTROLLED_CANARY` возвращает `READY_FOR_CONTROLLED_CANARY`. В этом режиме
`requiredProviders` обязан быть пустым, а provider evidence запрещён: outbound
kill switches остаются выключенными.

`PRODUCTION_GO_REVIEW` возвращает `READY_FOR_PRODUCTION_GO_REVIEW` только после
явно одобренных provider canary. Это решение означает готовность к ручному GO
review, а не автоматический deploy или автоматическое включение provider.

Любое несовпадение, неизвестное поле, stale evidence, torn/symlink evidence
file, digest drift или непредвиденная ошибка возвращает `BLOCKED_MANUAL` и
ненулевой exit code.

## Привязанный production inventory

Scanner сначала должен вычислить credential-free fingerprint уже независимо
проверенного `DATABASE_URL`:

```bash
umask 077
pnpm --filter database db:inventory:attachment-acl -- \
  --print-database-fingerprint
```

Команда не подключается к БД и выводит только fingerprint. Его следует сверить
с production configuration authority и передать в scan отдельным expected
значением. Для production обязательны все четыре переменные:

```bash
export STAFF_ATTACHMENT_BACKFILL_TARGET=production
export STAFF_ATTACHMENT_BACKFILL_PRODUCTION_ATTESTATION=I_ATTEST_THIS_IS_A_READ_ONLY_PRODUCTION_ATTACHMENT_INVENTORY
export STAFF_ATTACHMENT_BACKFILL_RELEASE_SHA=<exact-40-hex-release-sha>
export STAFF_ATTACHMENT_BACKFILL_EXPECTED_DATABASE_FINGERPRINT=<reviewed-sha256>

pnpm --filter database db:inventory:attachment-acl -- --pretty
```

Scanner до первого DB query блокирует неверный SHA или несовпадающий target
fingerprint. В report он добавляет `safety.releaseSha` и
`safety.databaseTargetFingerprint`; credential и исходный URL не выводятся.

## Manifest contract

Manifest — bounded, regular, non-symlink JSON file с абсолютными evidence paths.
Все evidence references имеют точную форму `{ "path", "sha256" }`.

```json
{
  "contractVersion": "GATE_1MT_OPERATIONAL_PREFLIGHT_V1",
  "evidence": {
    "attachmentInventory": {
      "path": "/absolute/evidence/attachment-inventory.json",
      "sha256": "<64-lowercase-hex>"
    },
    "browser": {
      "path": "/absolute/evidence/browser.json",
      "sha256": "<64-lowercase-hex>"
    },
    "ciAdmission": {
      "path": "/absolute/evidence/ci-admission.json",
      "sha256": "<64-lowercase-hex>"
    },
    "observability": {
      "path": "/absolute/evidence/observability.json",
      "sha256": "<64-lowercase-hex>"
    },
    "providerCanary": null,
    "rollback": {
      "path": "/absolute/evidence/rollback.json",
      "sha256": "<64-lowercase-hex>"
    }
  },
  "evidenceMaxAgeSeconds": 3600,
  "phase": "CONTROLLED_CANARY",
  "release": {
    "releaseSha": "<40-lowercase-hex>",
    "repository": "boozik3412/leetplus"
  },
  "requiredProviders": [],
  "target": {
    "databaseFingerprint": "<64-lowercase-hex>",
    "storeFingerprint": "<64-lowercase-hex>",
    "tenantFingerprint": "<64-lowercase-hex>"
  },
  "thresholds": {
    "apiErrorRatePermilleMax": 5,
    "apiP95MsMax": 1500,
    "attachmentServerErrorCountMax": 0,
    "queueLagSecondsMax": 30,
    "rollbackRtoSecondsMax": 300
  }
}
```

В contract V1 эти thresholds фиксированы кодом ровно значениями из примера, а
`evidenceMaxAgeSeconds` ограничен диапазоном `300..3600`. Их нельзя повысить
manifest-ом после наблюдения; изменение policy требует нового reviewed code
release и нового evidence.

## Evidence contracts

Browser evidence:

```json
{
  "capturedAt": "2026-08-23T09:55:00.000Z",
  "consoleErrorCount": 0,
  "contractVersion": "GATE_1MT_BROWSER_EVIDENCE_V1",
  "flows": {
    "archivedParentReturns404": "PASS",
    "crossTenantReturns404": "PASS",
    "deletedParentReturns404": "PASS",
    "orphanedAttachmentReturns404": "PASS",
    "uploadBindDownloadRemove": "PASS"
  },
  "releaseSha": "<40-lowercase-hex>",
  "target": {
    "storeFingerprint": "<64-lowercase-hex>",
    "tenantFingerprint": "<64-lowercase-hex>"
  },
  "unexpectedNetworkFailureCount": 0
}
```

CI admission evidence требует разные `fastRun.runId` и `releaseRun.runId`; у
обоих `conclusion` должен быть `SUCCESS`, а `releaseSha` — exact manifest SHA.

Observability evidence использует поля `windowSeconds`,
`apiErrorRatePermille`, `apiP95Ms`, `attachmentServerErrorCount`,
`queueLagSeconds`, `alertsConfigured=true` и
`rollbackAlertRouteTested=true`. Все observed values сравниваются с manifest
thresholds.

Rollback evidence требует:

- distinct `previousReleaseSha`;
- `backupVerified=true`;
- `nMinusOneReady=true`;
- `schedulerFree=true`;
- `rollbackCommandDryRunPassed=true`;
- `observedRtoSeconds <= rollbackRtoSecondsMax`.

Для `PRODUCTION_GO_REVIEW` `providerCanary` перестаёт быть `null`.
Provider evidence содержит только SHA-256 fingerprints approval/recipient и
канонически отсортированный массив требуемых providers. Для каждого provider
допустимо только `attempted=1`, `succeeded=1`, `failed=0`,
`duplicateDeliveries=0`.

## Запуск admission

```bash
pnpm --filter database gate-1mt:operational-preflight -- \
  --manifest /absolute/evidence/gate-1mt-manifest.json \
  --expected-manifest-sha256 <independently-reviewed-64-hex> \
  --expected-release-sha <exact-40-hex-release-sha>
```

`--expected-manifest-sha256` берётся из отдельного review шага. Поэтому после
review нельзя незаметно заменить target, evidence path/digest, phase или
policy: CLI проверяет raw manifest bytes до admission.

До controlled canary допустим только decision
`READY_FOR_CONTROLLED_CANARY`. После отдельно разрешённых provider sends
создаётся новый `PRODUCTION_GO_REVIEW` manifest; старый canary receipt не
превращается в GO автоматически.

## Что остаётся внешним действием

Код не может сам выбрать production tenant, Store или тестового получателя.
Перед реальным browser canary и provider sends оператор обязан отдельно
зафиксировать exact target fingerprints, approval и test recipient. Без этих
входных данных ожидаемое состояние — `BLOCKED_MANUAL`, а не попытка угадать
scope.
