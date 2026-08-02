# Manifest-bound enrollment V2: two-signer composition

| Поле | Значение |
| --- | --- |
| Статус | `DORMANT_PURE_COMPOSITION / NOT_DEPLOYABLE` |
| Contract | `IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2` |
| Profile | `IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_PROFILE_V1` |
| Command input | только exact-module `PINNED` authority V2 brand |
| Manifest input | только exact-module `PINNED` Manifest V2 brand |
| Grants input | один hostile-safe normalized CURRENT185 snapshot |
| Production roots | обе независимые registry frozen-empty |
| SQL / DB / DI / CLI / runtime wiring | отсутствуют |

## Зачем нужна отдельная композиция

Command authority V2 доказывает подпись команды, но enrollment signer сам по
себе может заявить произвольные manifest/grants scalars. Manifest V2 независимо
доказывает подпись duty-role binding, но сам по себе не выбирает конкретную
tenant-команду. Полномочие на будущий импорт возникает только после exact
композиции двух результатов, полученных от разных verifier modules и разных
root histories.

Одинакового значения `publicKeyFingerprint` недостаточно для доказательства
независимости и оно считается ошибкой конфигурации. Оба результата обязаны
иметь разные fingerprints, разные process-local brands и пройти свои
независимые `PINNED` root registries. `SYNTHETIC`, plain object, clone,
cross-module result и Proxy не допускаются.

## Exact binding matrix

Композиция fail-closed сравнивает:

| Область | Обязательное равенство |
| --- | --- |
| Database | name, OID и database identity digest команды, manifest и grants snapshot |
| Deployment | marker id, marker digest и actual context digest команды и manifest |
| Manifest identity | contract, profile, id, revision, payload digest, signing key id и fingerprint |
| Coordinator | role name и OID команды, manifest и grants snapshot |
| Worker | role name и OID команды, manifest и grants snapshot |
| Grants | exact profile и domain-separated digest полного normalized projection |
| Migration chain | exact CURRENT184 predecessor manifest digest |
| Application | manifest-bound contract, release SHA и artifact SHA-256 |

Все 17 полей `dutyRoleBinding` команды входят в эту сверку. Command release
дополнительно обязан совпасть с application release manifest. Grants digest
покрывает не только две runtime-роли, но и database/schema owner identity,
schema, все routine OID, exact ACL/grantor/effective privileges, membership,
role/database settings, default ACL и unexpected ownership surfaces.

## One-read grants rule

Caller-controlled grants snapshot нормализуется ровно один раз. Digest
вычисляется из уже frozen projection с тем же domain, который определён exact
CURRENT185 grants catalog. Raw input повторно не читается. Brand checks команды
и manifest выполняются раньше нормализации, поэтому неподписанный или synthetic
input не может сделать наблюдаемыми getter/Proxy side effects grants snapshot.

## Результат и persistable evidence

Успешная композиция возвращает отдельный process-local brand и immutable
binding projection с собственным domain-separated `bindingDigest`. Результат
сознательно содержит:

```text
authorization=false
canMutate=false
canSend=false
```

Только exact composed brand раскрывает будущему owner-only importer:

- exact frozen 69-field command database arguments;
- canonical command proposal/envelope и command signature evidence;
- canonical Manifest V2 payload и manifest signature evidence;
- normalized grants projection, profile, digest и digest domain;
- общий binding digest и все tenant/database/role/release identities.

Это всё ещё не runtime credential и не разрешение передать произвольный JSON в
PostgreSQL.

## Принятый следующий DB split

Следующий слой обязан сохранить разделение трёх полномочий:

1. pure composition создаёт PII-free canonical import bundle и его digest;
2. отдельный owner-only
   `identity_mail_tenant_enrollment_import_evidence_v2(TEXT, TEXT)` атомарно
   сохраняет exact bundle и возвращает replay-safe receipt; coordinator,
   worker, application runtime и `PUBLIC` не имеют на него `EXECUTE`;
3. enrollment coordinator получает только
   `identity_mail_tenant_enrollment_drive_command_v2(TEXT, TEXT, TEXT, TEXT)` —
   tenant id, command id, authorization-envelope digest и manifest digest.

Driver не принимает JSON. После tenant lock он повторно проверяет immutable
command/manifest FK, database/deployment/context identity, `SESSION_USER`
name/OID, non-revoked manifest и свежий grants digest под общей ACL-attestation
координацией.

## Lifecycle и expiry/revocation policy

`ENABLE` завершается одной мутацией. Первый `ROTATE/DISABLE` создаёт
`BEGIN_DRAIN`, запрещает новые claims, отменяет/стирает секреты у допустимых
непровайдерных состояний и возвращает `PENDING_ZERO_INFLIGHT`. Последующий exact
вызов возвращает `WAIT_ZERO_INFLIGHT`, пока остаётся provider-marked inflight,
либо выполняет `FINALIZE`. Завершённая команда возвращает сохранённый
`TERMINAL_REPLAY`; одного boolean `replayed` недостаточно.

Manifest обязан быть действующим и non-revoked при импорте и перед первой
мутацией. Expiry/revocation блокирует новые команды. Уже начатая и persisted
`DRAINING` команда получает только settlement/resume/finalize право, чтобы
истечение 15-минутного окна или отзыв manifest не оставили tenant навечно в
промежуточном состоянии. Rollback остаётся отдельной подписанной terminal
command с FK и rollback-once, а не runtime flag.

## Evidence

- Manifest V2: `13/13 PASS`;
- pure composition: `6/6 PASS`;
- grants + Manifest V2 + authority V2 + composition: `45/45 PASS`;
- Manifest V2 module SHA-256:
  `fbe61dfea464eac9e7a0fd24a7f8d570484e5240d3adb31080f154f3d9f0bce5`;
- composition module SHA-256:
  `4668c22c17ee573f41d98aeb16130547b7d3422e005a8e0787730006ef5d2ab6`;
- exact implementation commit
  `96c1d93fb2347a2b799997d7fac2c8df895d8f73` принят GitHub Actions
  [`30753175709`](https://github.com/boozik3412/leetplus/actions/runs/30753175709)
  (`run #89`): оба новых gate и все три CI jobs — green.

## Что этот slice не разрешает

Production остаётся `CURRENT179/179`. Этот boundary не создаёт root, SQL
candidate, evidence table, роль, grant, tenant, account, invite, SMTP delivery
или runtime wiring. Текущие четыре клуба остаются одной сетью
`Tenant A/Store A1..A4`; внешний тестер не создаётся.
